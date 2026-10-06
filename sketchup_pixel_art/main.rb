# frozen_string_literal: true

require 'base64'
require 'json'
require_relative 'camera_helper'

module SketchPixel
  def self.safe_set(opts, key, value)
    return if opts.nil?
    opts[key] = value
  rescue StandardError
    nil
  end

  def self.log(msg)
    puts "[SketchPixel] #{msg}"
    File.open(File.join(Dir.tmpdir, 'sketchpixel.log'), 'a') do |f|
      f.puts "[#{Time.now.strftime('%H:%M:%S.%L')}] #{msg}"
    end
  rescue StandardError => e
    puts "[SketchPixel Log Error] #{e.message}"
  end

  class << self
    attr_accessor :dialog

    def open_dialog(force = false)
      if @dialog && @dialog.visible?
        if force
          @dialog.close rescue nil
          @dialog = nil
        else
          @dialog.bring_to_front
          return
        end
      end

      html_path = File.join(__dir__, 'html', 'index.html')
      
      @dialog = UI::HtmlDialog.new(
        dialog_title: 'SketchPixel 2.5D - Pixel Art & Normal Map',
        preferences_key: 'SketchPixel_Window_v2',
        scrollable: false,
        resizable: true,
        width: 1080,
        height: 780,
        min_width: 860,
        min_height: 600,
        style: UI::HtmlDialog::STYLE_DIALOG
      )

      register_callbacks(@dialog)
      @dialog.set_file(html_path)
      @dialog.show
    end

    def do_capture(dlg, params_json = '{}')
      SketchPixel.log("--- do_capture INICIADO ---")
      model = Sketchup.active_model
      unless model
        dlg.execute_script("window.onCaptureError('Nenhum modelo aberto no SketchUp.');")
        return
      end

      params = begin
        JSON.parse(params_json.to_s)
      rescue StandardError
        {}
      end
      directions = params['directions'].to_i
      directions = 1 unless [1, 4, 8].include?(directions)

      view = model.active_view
      vp_w = view.vpwidth
      vp_h = view.vpheight
      aspect = vp_w.to_f / [vp_h, 1].max.to_f

      w = 512
      h = (w.to_f / aspect).round.to_i

      cam = view.camera
      orig_eye    = cam.eye.clone
      orig_target = cam.target.clone
      orig_up     = cam.up.clone
      center      = model.bounds.center

      frames = []
      begin
        directions.times do |i|
          angle = (360.0 / directions) * i
          if i > 0
            # Orbita a câmera ao redor do eixo Z do centro do modelo (mesma altura e projeção)
            tr = Geom::Transformation.rotation(center, Z_AXIS, angle.degrees)
            view.camera.set(orig_eye.transform(tr), orig_target.transform(tr), orig_up.transform(tr))
          end
          SketchPixel.log("Capturando direção #{i + 1}/#{directions} (#{angle.round}°)")
          frames << capture_pass_set(model, view, w, h).merge(angle: angle)
        end
      ensure
        view.camera.set(orig_eye, orig_target, orig_up)
        view.invalidate
      end

      first = frames.first || {}
      payload = {
        frames: frames,
        diffuseUrl: first[:diffuseUrl].to_s,
        albedoUrl:  first[:albedoUrl].to_s,
        normalUrl:  first[:normalUrl].to_s,
        aspectRatio: aspect,
        vpWidth: vp_w,
        vpHeight: vp_h
      }

      SketchPixel.log("Enviando payload (#{frames.length} direções) para o WebDialog...")
      dlg.execute_script("window.onPhysicalPassesLoaded(#{payload.to_json});")
      SketchPixel.log("Payload enviado com sucesso!")
    rescue StandardError => e
      SketchPixel.log("ERRO FATAL em do_capture: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      dlg.execute_script("window.onCaptureError(#{e.message.to_json});")
    end

    # Lê um PNG gravado pelo SketchUp aguardando liberação do arquivo e retorna Data URL
    def read_png_data_url(path)
      50.times do
        if File.exist?(path) && File.size(path) > 100
          begin
            b64 = Base64.strict_encode64(File.binread(path))
            File.delete(path) rescue nil
            return "data:image/png;base64,#{b64}"
          rescue StandardError
            # Arquivo ainda bloqueado pelo processo de escrita
          end
        end
        sleep(0.02)
      end
      ''
    end

    # Captura os 3 passes de uma direção:
    #  - diffuse: render normal do SketchUp (luz e texturas)
    #  - albedo:  cor do material sem luz direcional (base para o toon shading em JS)
    #  - normal:  normais reais das faces em espaço de câmera
    def capture_pass_set(model, view, w, h)
      stamp = "#{Time.now.to_i}_#{rand(100_000)}"
      tmp_dir = Dir.tmpdir
      diffuse_path = File.join(tmp_dir, "sp_diff_#{stamp}.png")
      albedo_path  = File.join(tmp_dir, "sp_alb_#{stamp}.png")
      normal_path  = File.join(tmp_dir, "sp_norm_#{stamp}.png")

      r_opts = model.rendering_options
      s_info = model.shadow_info
      orig = {
        render_mode: (r_opts['RenderMode'] rescue nil),
        edges:       (r_opts['EdgeDisplayMode'] rescue nil),
        profiles:    (r_opts['DrawProfiles'] rescue nil),
        sky:         (r_opts['DisplaySky'] rescue nil),
        ground:      (r_opts['DisplayGround'] rescue nil),
        axes:        (r_opts['ShowAxes'] rescue nil),
        shadows:     (s_info['DisplayShadows'] rescue nil),
        light:       (s_info['Light'] rescue nil),
        dark:        (s_info['Dark'] rescue nil),
        use_sun:     (s_info['UseSunForAllShading'] rescue nil)
      }

      diffuse_url = ''
      albedo_url = ''
      begin
        SketchPixel.safe_set(r_opts, 'DisplaySky', false)
        SketchPixel.safe_set(r_opts, 'DisplayGround', false)
        SketchPixel.safe_set(r_opts, 'DrawHorizon', false)
        SketchPixel.safe_set(r_opts, 'ShowAxes', false)
        SketchPixel.safe_set(r_opts, 'EdgeDisplayMode', 0)
        SketchPixel.safe_set(r_opts, 'DrawProfiles', false)
        SketchPixel.safe_set(r_opts, 'RenderMode', 3) # Shaded with textures

        # 1. PASSE DIFUSO (iluminação do SketchUp)
        File.delete(diffuse_path) rescue nil
        view.invalidate
        view.refresh
        view.write_image({ filename: diffuse_path, width: w, height: h, antialias: false, transparent: true })
        diffuse_url = read_png_data_url(diffuse_path)

        # 2. PASSE ALBEDO (sem luz direcional: só ambiente -> cor pura do material)
        SketchPixel.safe_set(s_info, 'DisplayShadows', false)
        SketchPixel.safe_set(s_info, 'UseSunForAllShading', true)
        SketchPixel.safe_set(s_info, 'Light', 0)
        SketchPixel.safe_set(s_info, 'Dark', 100)
        File.delete(albedo_path) rescue nil
        view.invalidate
        view.refresh
        view.write_image({ filename: albedo_path, width: w, height: h, antialias: false, transparent: true })
        albedo_url = read_png_data_url(albedo_path)
      ensure
        SketchPixel.safe_set(r_opts, 'DisplaySky', orig[:sky])
        SketchPixel.safe_set(r_opts, 'DisplayGround', orig[:ground])
        SketchPixel.safe_set(r_opts, 'ShowAxes', orig[:axes])
        SketchPixel.safe_set(r_opts, 'EdgeDisplayMode', orig[:edges])
        SketchPixel.safe_set(r_opts, 'DrawProfiles', orig[:profiles])
        SketchPixel.safe_set(r_opts, 'RenderMode', orig[:render_mode])
        unless orig[:shadows].nil?
          SketchPixel.safe_set(s_info, 'DisplayShadows', orig[:shadows])
          SketchPixel.safe_set(s_info, 'Light', orig[:light])
          SketchPixel.safe_set(s_info, 'Dark', orig[:dark])
          SketchPixel.safe_set(s_info, 'UseSunForAllShading', orig[:use_sun])
        end
      end

      # 3. PASSE DE NORMAIS FÍSICAS REAIS DAS FACES 3D
      render_3d_geometry_normals(model, view, normal_path, w, h)
      normal_url = read_png_data_url(normal_path)

      SketchPixel.log("Passes: diffuse=#{diffuse_url.length} albedo=#{albedo_url.length} normal=#{normal_url.length}")
      { diffuseUrl: diffuse_url, albedoUrl: albedo_url, normalUrl: normal_url }
    end

    # Renderiza as normais reais das faces do objeto 3D
    def render_3d_geometry_normals(model, view, out_path, width, height)
      cam = view.camera
      dir = cam.direction.normalize
      up  = cam.up.normalize

      # Vetores ortonormais da câmera no espaço de tela:
      # x_cam: aponta para a DIREITA da tela (+X) -> Vermelho
      # y_cam: aponta para CIMA da tela (+Y) -> Verde
      # z_out: aponta para FORA da tela em direção ao observador (+Z) -> Azul
      z_out = dir.reverse.normalize
      x_cam = dir.cross(up)
      x_cam = (x_cam.length > 0.0001) ? x_cam.normalize : Geom::Vector3d.new(1, 0, 0)
      y_cam = x_cam.cross(dir).normalize

      r_opts = model.rendering_options
      orig_render_mode = r_opts['RenderMode'] rescue nil
      orig_edges       = r_opts['EdgeDisplayMode'] rescue nil
      orig_profiles    = r_opts['DrawProfiles'] rescue nil
      orig_sky         = r_opts['DisplaySky'] rescue nil
      orig_ground      = r_opts['DisplayGround'] rescue nil
      orig_axes        = r_opts['ShowAxes'] rescue nil

      s_info = model.shadow_info
      orig_shadows = s_info['DisplayShadows'] rescue nil
      orig_light   = s_info['Light'] rescue nil
      orig_dark    = s_info['Dark'] rescue nil
      orig_use_sun = s_info['UseSunForAllShading'] rescue nil

      orig_materials = {}
      material_cache = {}

      begin
        SketchPixel.safe_set(r_opts, 'DisplaySky', false)
        SketchPixel.safe_set(r_opts, 'DisplayGround', false)
        SketchPixel.safe_set(r_opts, 'DrawHorizon', false)
        SketchPixel.safe_set(r_opts, 'ShowAxes', false)
        SketchPixel.safe_set(r_opts, 'EdgeDisplayMode', 0)
        SketchPixel.safe_set(r_opts, 'DrawProfiles', false)
        SketchPixel.safe_set(r_opts, 'RenderMode', 2) # Shaded (sem texturas)

        # Iluminação ambiente 100% plana para que a cor da normal em cada face seja capturada pura
        SketchPixel.safe_set(s_info, 'DisplayShadows', false)
        SketchPixel.safe_set(s_info, 'UseSunForAllShading', true)
        SketchPixel.safe_set(s_info, 'Light', 100)
        SketchPixel.safe_set(s_info, 'Dark', 100)

        paint_faces = lambda do |entities, tr|
          entities.each do |entity|
            next if entity.respond_to?(:hidden?) && entity.hidden?
            next if entity.respond_to?(:visible?) && !entity.visible?

            if entity.is_a?(Sketchup::Face)
              orig_materials[entity] = [entity.material, entity.back_material]

              n = entity.normal.transform(tr).normalize
              # Inverte se a face estiver com o verso voltado para a câmera (ex: interior de vaso)
              n = n.reverse if n.dot(z_out) < 0.0

              nx = n.dot(x_cam)
              ny = n.dot(y_cam)
              nz = [n.dot(z_out), 0.0].max

              len = Math.sqrt(nx * nx + ny * ny + nz * nz)
              len = 1.0 if len == 0.0
              nx /= len
              ny /= len
              nz /= len

              # Padrão OpenGL / Unity Normal Map (Y+):
              # -X = Azul escuro, +X = Magenta/Rosa, +Y = Verde/Ciano, -Y = Roxo escuro, +Z = Lavanda
              r = [[((nx * 0.5 + 0.5) * 255.0).round, 0].max, 255].min
              g = [[((ny * 0.5 + 0.5) * 255.0).round, 0].max, 255].min
              b = [[((nz * 0.5 + 0.5) * 255.0).round, 0].max, 255].min

              key = "sp_norm_#{r}_#{g}_#{b}"
              mat = material_cache[key] ||= begin
                m = model.materials[key] || model.materials.add(key)
                m.color = Sketchup::Color.new(r, g, b)
                m
              end

              entity.material = mat
              entity.back_material = mat
            elsif entity.is_a?(Sketchup::Group)
              orig_materials[entity] = [entity.material, nil]
              entity.material = nil rescue nil
              paint_faces.call(entity.entities, tr * entity.transformation)
            elsif entity.is_a?(Sketchup::ComponentInstance)
              orig_materials[entity] = [entity.material, nil]
              entity.material = nil rescue nil
              paint_faces.call(entity.definition.entities, tr * entity.transformation)
            end
          end
        end

        paint_faces.call(model.entities, Geom::Transformation.new)

        view.invalidate
        view.refresh

        File.delete(out_path) rescue nil
        view.write_image({
          filename: out_path,
          width: width,
          height: height,
          antialias: false,
          transparent: true
        })

        40.times do
          break if File.exist?(out_path) && File.size(out_path) > 100
          sleep(0.02)
        end
      ensure
        # Restaura os materiais originais do usuário
        orig_materials.each do |ent, mats|
          next unless ent.valid?
          ent.material = mats[0]
          ent.back_material = mats[1] if ent.is_a?(Sketchup::Face)
        end

        # Remove materiais temporários de normal
        material_cache.each_value do |m|
          model.materials.remove(m) rescue nil
        end

        # Restaura estilo do SketchUp
        SketchPixel.safe_set(r_opts, 'DisplaySky', orig_sky)
        SketchPixel.safe_set(r_opts, 'DisplayGround', orig_ground)
        SketchPixel.safe_set(r_opts, 'ShowAxes', orig_axes)
        SketchPixel.safe_set(r_opts, 'RenderMode', orig_render_mode)
        SketchPixel.safe_set(r_opts, 'EdgeDisplayMode', orig_edges)
        SketchPixel.safe_set(r_opts, 'DrawProfiles', orig_profiles)
        if orig_shadows != nil
          SketchPixel.safe_set(s_info, 'DisplayShadows', orig_shadows)
          SketchPixel.safe_set(s_info, 'Light', orig_light)
          SketchPixel.safe_set(s_info, 'Dark', orig_dark)
          SketchPixel.safe_set(s_info, 'UseSunForAllShading', orig_use_sun)
        end
        view.invalidate
        view.refresh
      end
    end

    private

    def register_callbacks(dlg)
      dlg.add_action_callback('captureCurrentViewport') do |_context, params_json|
        begin
          do_capture(dlg, params_json)
        rescue StandardError => e
          SketchPixel.log("Callback captureCurrentViewport Error: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
          dlg.execute_script("window.onCaptureError(#{e.message.to_json});") rescue nil
        end
      end

      dlg.add_action_callback('captureViewport') do |_context, params_json|
        begin
          do_capture(dlg, params_json)
        rescue StandardError => e
          SketchPixel.log("Callback captureViewport Error: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
          dlg.execute_script("window.onCaptureError(#{e.message.to_json});") rescue nil
        end
      end

      dlg.add_action_callback('setCameraPreset') do |_context, param|
        if param.to_s.start_with?('{')
          data = begin JSON.parse(param.to_s) rescue {} end
          CameraHelper.set_preset(data['preset'].to_s, fit: (data['fit'] == true))
        else
          CameraHelper.set_preset(param.to_s, fit: false)
        end
      end

      dlg.add_action_callback('setCustomCamera') do |_context, payload_json|
        data = begin JSON.parse(payload_json.to_s) rescue {} end
        yaw = data['yaw'].to_f
        pitch = data['pitch'].to_f
        fit = (data['fit'] == true)
        CameraHelper.set_camera_angles(yaw, pitch, fit: fit)
      end

      dlg.add_action_callback('getCameraAngles') do |_context|
        angles = CameraHelper.get_current_camera_angles
        dlg.execute_script("if (window.onCameraAnglesReceived) window.onCameraAnglesReceived(#{angles.to_json});") rescue nil
      end

      dlg.add_action_callback('saveImage') do |_context, payload_json|
        begin
          payload = JSON.parse(payload_json)
          data_url = payload['dataUrl']
          default_name = payload['filename'] || 'pixel_sprite.png'

          file_path = UI.savepanel('Salvar Imagem', '', default_name)
          if file_path
            file_path += '.png' unless file_path.downcase.end_with?('.png')
            if data_url =~ /^data:image\/png;base64,(.+)$/
              raw_data = Base64.decode64(Regexp.last_match(1))
              File.binwrite(file_path, raw_data)
              UI.messagebox("Arquivo salvo com sucesso!\n#{file_path}")
            end
          end
        rescue StandardError => e
          UI.messagebox("Erro ao salvar arquivo: #{e.message}")
        end
      end

      dlg.add_action_callback('saveSpritePackage') do |_context, payload_json|
        begin
          payload = JSON.parse(payload_json)
          base_name = payload['baseName'] || 'sprite_25d'
          diffuse_url = payload['diffuseUrl']
          normal_url = payload['normalUrl']

          file_path = UI.savepanel('Salvar Pacote 2.5D', '', "#{base_name}_diffuse.png")
          if file_path
            dir = File.dirname(file_path)
            clean_base = File.basename(file_path, '.*').sub(/_diffuse$/i, '').sub(/_normal$/i, '')

            diffuse_path = File.join(dir, "#{clean_base}_diffuse.png")
            normal_path = File.join(dir, "#{clean_base}_normal.png")

            if diffuse_url =~ /^data:image\/png;base64,(.+)$/
              File.binwrite(diffuse_path, Base64.decode64(Regexp.last_match(1)))
            end

            if normal_url =~ /^data:image\/png;base64,(.+)$/
              File.binwrite(normal_path, Base64.decode64(Regexp.last_match(1)))
            end

            UI.messagebox("Pacote 2.5D exportado com sucesso!\n\n1. #{File.basename(diffuse_path)}\n2. #{File.basename(normal_path)}")
          end
        rescue StandardError => e
          UI.messagebox("Erro ao exportar pacote: #{e.message}")
        end
      end
    end
  end

  # Garante que menu e barra de ferramentas sejam criados estritamente UMA ÚNICA VEZ
  unless @ui_created
    @ui_created = true

    # Menu de Extensões com submenu completo
    menu = UI.menu('Extensions')
    sub = menu.add_submenu('SketchPixel 2.5D')
    sub.add_item('Abrir Painel Pixel Art') { SketchPixel.open_dialog }
    sub.add_separator
    sub.add_item('Câmera: Top-Down Médio (45° MMORPG)') { CameraHelper.set_preset('top_med', fit: false) }
    sub.add_item('Câmera: Top-Down Alto (60° RPG)')     { CameraHelper.set_preset('top_high', fit: false) }
    sub.add_item('Câmera: Dimétrica 2:1 (Isométrica)')   { CameraHelper.set_preset('dim_sw', fit: false) }
    sub.add_item('Câmera: Topo Puro (90° Planta)')      { CameraHelper.set_preset('top', fit: false) }
    sub.add_item('Câmera: Frontal (0°)')                { CameraHelper.set_preset('front', fit: false) }

    # Barra de Ferramentas do SketchUp com atalhos de câmera
    @toolbar = UI::Toolbar.new('SketchPixel 2.5D')

    # Helper para associar ícones pequeno e grande
    assign_icons = lambda do |command, base_name|
      small = File.join(__dir__, 'icons', "#{base_name}.png")
      large = File.join(__dir__, 'icons', "#{base_name}_32.png")
      command.small_icon = File.exist?(small) ? small : icon_path
      command.large_icon = File.exist?(large) ? large : command.small_icon
    end

    # 1. Botão Principal: Abrir Painel
    cmd_open = UI::Command.new('SketchPixel') { SketchPixel.open_dialog }
    cmd_open.tooltip = 'Abrir Painel Pixel Art & Normal Map'
    cmd_open.status_bar_text = 'Abre o renderizador SketchPixel 2.5D.'
    assign_icons.call(cmd_open, 'pixel_icon')
    @toolbar.add_item(cmd_open)

    # 2. Câmera Top-Down Médio 45°
    cmd_topmed = UI::Command.new('Top-Down Médio') {
      CameraHelper.set_preset('top_med', fit: false)
      SketchPixel.dialog&.execute_script("if(window.onCameraPresetApplied) window.onCameraPresetApplied('top_med');") rescue nil
    }
    cmd_topmed.tooltip = 'Alinhar Câmera: Top-Down Médio (45° MMORPG)'
    cmd_topmed.status_bar_text = 'Define a câmera para o ângulo médio de 45° clássico de MMORPGs.'
    assign_icons.call(cmd_topmed, 'cam_topmed')
    @toolbar.add_item(cmd_topmed)

    # 3. Câmera Dimétrica 2:1 (Isométrica 2.5D)
    cmd_iso = UI::Command.new('Dimétrica 2:1') {
      CameraHelper.set_preset('dim_sw', fit: false)
      SketchPixel.dialog&.execute_script("if(window.onCameraPresetApplied) window.onCameraPresetApplied('dim_sw');") rescue nil
    }
    cmd_iso.tooltip = 'Alinhar Câmera: Dimétrica 2:1 (Isométrica)'
    cmd_iso.status_bar_text = 'Define a câmera para projeção dimétrica isométrica 2:1.'
    assign_icons.call(cmd_iso, 'cam_iso')
    @toolbar.add_item(cmd_iso)

    # 4. Câmera Topo Puro 90°
    cmd_top = UI::Command.new('Topo 90°') {
      CameraHelper.set_preset('top', fit: false)
      SketchPixel.dialog&.execute_script("if(window.onCameraPresetApplied) window.onCameraPresetApplied('top');") rescue nil
    }
    cmd_top.tooltip = 'Alinhar Câmera: Topo Puro (90° Planta)'
    cmd_top.status_bar_text = 'Define a câmera diretamente olhando de cima (planta/top-down puro).'
    assign_icons.call(cmd_top, 'cam_top')
    @toolbar.add_item(cmd_top)

    # 5. Câmera Frontal 0°
    cmd_front = UI::Command.new('Frontal') {
      CameraHelper.set_preset('front', fit: false)
      SketchPixel.dialog&.execute_script("if(window.onCameraPresetApplied) window.onCameraPresetApplied('front');") rescue nil
    }
    cmd_front.tooltip = 'Alinhar Câmera: Frontal (0°)'
    cmd_front.status_bar_text = 'Define a câmera para visão frontal plana ortográfica.'
    assign_icons.call(cmd_front, 'cam_front')
    @toolbar.add_item(cmd_front)

    @toolbar.restore if @toolbar.get_last_state == TB_VISIBLE

    file_loaded?(__FILE__)
  end
end
