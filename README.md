# 👾 SketchPixel 2.5D

> Extensão avançada para **Trimble SketchUp** que converte geometria e modelos 3D em **Pixel Art autêntico para jogos 2.5D / MMORPG**, com mapas normais físicos (Normal Maps) pixel-perfect e iluminação dinâmica interativa.

---

## 🌟 Principais Recursos

- **100% Gratuito & Local:** Executado integralmente no cliente via Ruby e HTML5 Canvas/Chromium no SketchUp. Sem APIs externas, sem nuvem, sem assinaturas.
- **Suporte Multi-Direcional MMORPG (1, 4 e 8 Direções):**
  - Orbita a câmera automaticamente em 360° ao redor do centro do modelo.
  - Turntable interativo para visualização contínua de todos os ângulos.
  - Exportação direta de **Spritesheet** em tira horizontal pronta para engines de jogo (Godot, Unity, Phaser, GameMaker, RPG Maker).
- **Amostragem Texel Dominante (Cluster / Moda):**
  - Substitui o Nearest Neighbor convencional por votação de cor majoritária em bloco.
  - Garante continuidade em linhas finas (roscas de parafusos, engrenagens, fios, arestas de armaduras) sem ruído pontilhado.
- **Remoção de Fundo por Flood-Fill Perimetral:**
  - Limpa transparência exclusivamente a partir do perímetro externo da imagem.
  - Fendas, ranhuras escuras e sombras de oclusão interna permanecem 100% sólidas.
- **Cel / Toon Shading 3D (Estilo RPG Profissional):**
  - Gera sombreamento cel-shade limpo calculando $N \cdot L$ diretamente com as normais reais de câmera e o passe de albedo puro.
  - Aplica *Hue-Shifting* estilizado (realces quentes/dourados e sombras frias/arroxeadas).
- **Normal Maps Físicos de Alta Precisão:**
  - Baseado no algoritmo matemático do *NormalMap-Online*.
  - Padrão da indústria: **Unity 2D / OpenGL (Y+)**.
  - 100% compatível com sombreamento dinâmico em 2.5D.
- **Testador de Luz Dinâmica 3D Interativo:**
  - Blinn-Phong em tempo real com controle de altura da luz, intensidade, luz ambiente, brilho especular e cor.

---

## 📁 Estrutura de Arquivos

```text
SketchPixel_Plugin/
├── .gitignore
├── README.md
├── sketchup_pixel_art.rb          # Loader raiz da extensão do SketchUp
└── sketchup_pixel_art/
    ├── main.rb                    # Lógica em Ruby (capturas, câmera, normais, passes 3D)
    ├── camera_helper.rb           # Presets de câmera isométrica (2:1 dimétrica, frontal, topo)
    └── html/
        ├── index.html             # Interface gráfica do usuário (HtmlDialog)
        ├── style.css              # Estilos e design do painel
        ├── app.js                 # Pipeline de processamento, shaders em Canvas e exportação
        └── palettes.js            # Paletas retro (EDG32, DB32, DB16, Resurrect64, PICO-8, etc.)
```

---

## 🚀 Instalação e Uso

1. Copie o arquivo `sketchup_pixel_art.rb` e a pasta `sketchup_pixel_art` para o diretório de plugins do seu SketchUp:
   - **Windows:** `%APPDATA%\SketchUp\SketchUp <VERSÃO>\SketchUp\Plugins`
2. Inicie o SketchUp.
3. Acesse o menu **Extensions > SketchPixel - Pixel Art Renderer** ou clique no ícone da barra de ferramentas **SketchPixel 2.5D**.
4. Configure a resolução desejada (ex: 32x32, 64x64, 240x240) e clique em **📸 Atualizar Viewport**.
