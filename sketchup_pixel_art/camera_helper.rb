# frozen_string_literal: true

module SketchPixel
  module CameraHelper
    extend self

    # Ângulo Dimétrico 2:1 (2 pixels horizontal para 1 pixel vertical)
    # pitch = Math.atan(0.5) = ~26.565 graus
    # ou Isométrico clássico (pitch = 30 graus ou 35.264 graus)
    
    PRESETS = {
      'iso_sw' => { yaw: 225, pitch: 35.264, name: 'Isométrica Sul-Oeste' },
      'iso_se' => { yaw: 315, pitch: 35.264, name: 'Isométrica Sul-Leste' },
      'iso_ne' => { yaw: 45,  pitch: 35.264, name: 'Isométrica Norte-Leste' },
      'iso_nw' => { yaw: 135, pitch: 35.264, name: 'Isométrica Norte-Oeste' },

      'dim_sw' => { yaw: 225, pitch: 30.0, name: 'Dimétrica 2:1 Sul-Oeste' },
      'dim_se' => { yaw: 315, pitch: 30.0, name: 'Dimétrica 2:1 Sul-Leste' },
      'dim_ne' => { yaw: 45,  pitch: 30.0, name: 'Dimétrica 2:1 Norte-Leste' },
      'dim_nw' => { yaw: 135, pitch: 30.0, name: 'Dimétrica 2:1 Norte-Oeste' },

      'front'  => { yaw: 270, pitch: 0.0,  name: 'Frente (Sul)' },
      'back'   => { yaw: 90,  pitch: 0.0,  name: 'Traseira (Norte)' },
      'right'  => { yaw: 0,   pitch: 0.0,  name: 'Direita (Leste)' },
      'left'   => { yaw: 180, pitch: 0.0,  name: 'Esquerda (Oeste)' },
      'top'    => { yaw: 270, pitch: 89.9, name: 'Topo (Planta / Top-down)' }
    }.freeze

    def set_preset(preset_key, fit: true)
      preset = PRESETS[preset_key]
      return unless preset

      set_camera_angles(preset[:yaw], preset[:pitch], fit: fit)
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

      model.start_operation('Câmera Pixel Art', true)
      camera.set(eye, center, up)
      
      if fit
        camera.height = radius * 2.2
        view.zoom_extents if model.selection.empty?
      end
      
      model.commit_operation
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
