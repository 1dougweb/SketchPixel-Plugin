# frozen_string_literal: true
# ==============================================================================
# SketchPixel 2.5D - Pixel Art Renderer para SketchUp
# ==============================================================================

require 'sketchup.rb'
require 'extensions.rb'

module SketchPixel
  unless file_loaded?(__FILE__)
    ext = SketchupExtension.new('SketchPixel - Pixel Art Renderer', 'sketchup_pixel_art/main')
    ext.description = 'Renderizador Pixel Art e 2.5D para SketchUp. Suporta paletas retrô, dither, contornos cel-shading, câmeras isométricas e exportação de spritesheets.'
    ext.version     = '1.0.0'
    ext.copyright   = '2026'
    ext.creator     = 'Zophya Dev / Antigravity'
    
    Sketchup.register_extension(ext, true)
    file_loaded?(__FILE__)
  end
end
