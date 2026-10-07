# frozen_string_literal: true

module SketchPixel
  module CameraHelper
    extend self

    # Ângulo Dimétrico 2:1 (2 pixels horizontal para 1 pixel vertical)
    # pitch = Math.atan(0.5) = ~26.565 graus
    # ou Isométrico clássico (pitch = 30 graus ou 35.264 graus)
    
    PRESETS = {
      'top_med'  => { yaw: 270, pitch: 45.0,   name: 'Top-Down Médio (45° MMORPG)' },
      'top_high' => { yaw: 270, pitch: 60.0,   name: 'Top-Down Alto (60° RPG)' },
      'top_low'  => { yaw: 270, pitch: 30.0,   name: 'Top-Down 3/4 Suave (30°)' },

      'iso_sw'   => { yaw: 225, pitch: 35.264, name: 'Isométrica Sul-Oeste' },
      'iso_se'   => { yaw: 315, pitch: 35.264, name: 'Isométrica Sul-Leste' },
      'iso_ne'   => { yaw: 45,  pitch: 35.264, name: 'Isométrica Norte-Leste' },
      'iso_nw'   => { yaw: 135, pitch: 35.264, name: 'Isométrica Norte-Oeste' },

      'dim_sw'   => { yaw: 225, pitch: 30.0,   name: 'Dimétrica 2:1 Sul-Oeste' },
      'dim_se'   => { yaw: 315, pitch: 30.0,   name: 'Dimétrica 2:1 Sul-Leste' },
      'dim_ne'   => { yaw: 45,  pitch: 30.0,   name: 'Dimétrica 2:1 Norte-Leste' },
      'dim_nw'   => { yaw: 135, pitch: 30.0,   name: 'Dimétrica 2:1 Norte-Oeste' },

      'front'    => { yaw: 270, pitch: 0.0,    name: 'Frente (Sul)' },
      'back'     => { yaw: 90,  pitch: 0.0,    name: 'Traseira (Norte)' },
      'right'    => { yaw: 0,   pitch: 0.0,    name: 'Direita (Leste)' },
      'left'     => { yaw: 180, pitch: 0.0,    name: 'Esquerda (Oeste)' },
      'top'      => { yaw: 270, pitch: 89.9,   name: 'Topo Puro (90° Planta)' }
    }.freeze

    def set_preset(preset_key, fit: false)
      preset = PRESETS[preset_key]
      return unless preset

      set_camera_angles(preset[:yaw], preset[:pitch], fit: fit)
    end

    def get_current_camera_angles(model = nil)
      model ||= Sketchup.active_model
      return { yaw: 270.0, pitch: 45.0 } unless model

      cam = model.active_view.camera
      dir = cam.direction.normalize
      eye_vec = dir.reverse

      pitch_rad = Math.asin(eye_vec.z.clamp(-1.0, 1.0))
      pitch_deg = pitch_rad * 180.0 / Math::PI

      yaw_rad = Math.atan2(eye_vec.y, eye_vec.x)
      yaw_deg = (yaw_rad * 180.0 / Math::PI) % 360.0

      { yaw: yaw_deg.round(1), pitch: pitch_deg.round(1) }
    end

    def set_camera_angles(yaw_deg, pitch_deg, fit: true)
      model = Sketchup.active_model
      view = model.active_view
      camera = view.camera

      # Ativa Projeção Paralela (Ortográfica) para Pixel Art limpo
      camera.perspective = false

      # Bounding box alvo (seleção ou modelo todo)
      bounds = get_target_bounds(model)
      center = bounds.center
      radius = bounds.diagonal / 2.0
      radius = 100.0 if radius < 1.0

      # Converter ângulos esféricos para vetor de direção
      yaw_rad = yaw_deg * Math::PI / 180.0
      pitch_rad = pitch_deg * Math::PI / 180.0

      # Vetor direção do alvo para o olho da câmera
      cos_pitch = Math.cos(pitch_rad)
      sin_pitch = Math.sin(pitch_rad)
      cos_yaw = Math.cos(yaw_rad)
      sin_yaw = Math.sin(yaw_rad)

      dir_x = cos_pitch * cos_yaw
      dir_y = cos_pitch * sin_yaw
      dir_z = sin_pitch

      dist = radius * 3.0
      eye = Geom::Point3d.new(
        center.x + dir_x * dist,
        center.y + dir_y * dist,
        center.z + dir_z * dist
      )

      up = if pitch_deg > 89.0
             Geom::Vector3d.new(0, 1, 0)
           else
             Geom::Vector3d.new(0, 0, 1)
           end

      camera.set(eye, center, up)
      
      if fit
        camera.height = radius * 2.2
        view.zoom_extents if model.selection.empty?
      end
      
      view.invalidate
    end

    def get_target_bounds(model)
      sel = model.selection
      if sel.empty?
        model.bounds
      else
        bb = Geom::BoundingBox.new
        sel.each { |entity| bb.add(entity.bounds) }
        bb.valid? ? bb : model.bounds
      end
    end
  end
end
