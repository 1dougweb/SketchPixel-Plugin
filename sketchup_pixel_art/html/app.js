// =============================================================================
// SketchPixel 2.5D - Engine de Renderização Direta & Normal Map
// =============================================================================

let sourceImage = null;
let geomNormalImage = null;
let albedoPassImage = null;
let shadingPassImage = null;
let eastPassImage = null;
let westPassImage = null;
let topPassImage = null;
let sourceAspect = 16 / 9;
let processedImageData = null;
let normalImageData = null;
let currentOutlineMap = null;

let capturedFrames = [];
let currentFrameIndex = 0;
let turntableTimer = null;

let currentZoom = 3;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let currentViewMode = 'diffuse'; // 'diffuse' | 'normal' | 'light'
let lightPos = { x: 120, y: 67, z: 35 };
let cachedSourceBBox = null;

// Elementos do DOM
const canvas = document.getElementById('pixelCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const container = document.getElementById('canvasContainer');
const viewport = document.getElementById('viewportContent');
const statusText = document.getElementById('statusText');
const statsRes = document.getElementById('statsRes');
const statsColors = document.getElementById('statsColors');
const statsMode = document.getElementById('statsMode');

// Inicialização: Aguarda o Chromium injetar o objeto window.sketchup
window.addEventListener('DOMContentLoaded', () => {
  setupUI();
  setupZoomAndPan();
  setupLightTester();

  waitForSketchUp(0);
});

function waitForSketchUp(attempts) {
  if (window.sketchup && (window.sketchup.captureCurrentViewport || window.sketchup.captureViewport)) {
    callSketchUp('getCameraAngles', '');
    requestViewportCapture();
  } else if (attempts < 40) {
    setTimeout(() => waitForSketchUp(attempts + 1), 60);
  } else {
    callSketchUp('getCameraAngles', '');
    requestViewportCapture();
  }
}

// Setup de Controles
function setupUI() {
  const inputs = [
    'aspectMode', 'directionCount', 'pixelScale', 'fitMode', 'fitPadding', 'fitAnchor', 'samplingMethod', 'shadingModel',
    'paletteSelect', 'orphanClean', 'maxColors',
    'celSteps', 'ditherType', 'ditherAmount', 'hueShift',
    'hdrEnabled', 'hdrToneMap', 'hdrExposure', 'hdrShadowRecovery', 'hdrBloom', 'brickBoost', 'saturation',
    'outlineMode', 'outlineColor', 'cleanPixelPerfect', 'innerEdges',
    'normalSourceMode', 'normalStrength', 'normalLevel', 'normalFilterType',
    'surfaceSmoothing', 'invertR', 'invertG', 'invertH', 'normalBgMode', 'normalExcludeOutline', 'transparentBg',
    'lightModeType', 'lightZ', 'lightIntensity', 'lightAmbient', 'lightSpecular', 'lightColor'
  ];

  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      updateSliderLabels();
      if (currentViewMode === 'light') {
        renderDynamicLighting();
      } else {
        applyProcessing();
      }
    });
    el.addEventListener('change', () => {
      updateSliderLabels();
      if (currentViewMode === 'light') {
        renderDynamicLighting();
      } else {
        applyProcessing();
      }
    });
  });

  const aspectModeEl = document.getElementById('aspectMode');
  if (aspectModeEl) {
    aspectModeEl.addEventListener('change', () => {
      updatePixelScaleOptions();
      applyProcessing();
    });
  }

  // Abas de Modo (Header)
  const tabDiffuse = document.getElementById('tabModeDiffuse');
  const tabNormal = document.getElementById('tabModeNormal');
  const tabLight = document.getElementById('tabModeLight');

  const setMode = (mode) => {
    currentViewMode = mode;
    [tabDiffuse, tabNormal, tabLight].forEach(b => b.classList.remove('active'));
    if (mode === 'diffuse') {
      tabDiffuse.classList.add('active');
      statsMode.textContent = 'Pixel Art (HDR)';
      statsMode.style.color = '#818cf8';
    } else if (mode === 'normal') {
      tabNormal.classList.add('active');
      statsMode.textContent = 'Normal Map Real';
      statsMode.style.color = '#38bdf8';
    } else if (mode === 'light') {
      tabLight.classList.add('active');
      statsMode.textContent = 'Luz Interativa 3D';
      statsMode.style.color = '#facc15';
      if ((lightPos.x === 0 && lightPos.y === 0) || (lightPos.x === 120 && lightPos.y === 67)) {
        lightPos.x = Math.round(canvas.width * 0.7);
        lightPos.y = Math.round(canvas.height * 0.3);
      }
    }
    renderActiveMode();
  };

  tabDiffuse.addEventListener('click', () => setMode('diffuse'));
  tabNormal.addEventListener('click', () => setMode('normal'));
  tabLight.addEventListener('click', () => setMode('light'));

  // Controles de Câmera (Presets rápidos e Toolbar)
  document.querySelectorAll('[data-cam]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-cam');
      applyCameraPreset(preset);
    });
  });

  const quickCam = document.getElementById('quickCamSelect');
  if (quickCam) {
    quickCam.addEventListener('change', () => {
      const preset = quickCam.value;
      if (!preset) return;
      applyCameraPreset(preset);
      quickCam.value = '';
    });
  }

  // Sliders manuais de Câmera Livre (Pitch e Yaw)
  const camPitchEl = document.getElementById('camPitch');
  const camYawEl = document.getElementById('camYaw');
  if (camPitchEl) camPitchEl.addEventListener('input', updateCamSliderLabels);
  if (camYawEl) camYawEl.addEventListener('input', updateCamSliderLabels);

  const btnApplyCustomCam = document.getElementById('btnApplyCustomCam');
  if (btnApplyCustomCam) {
    btnApplyCustomCam.addEventListener('click', () => {
      const pitch = parseFloat(camPitchEl?.value || 45);
      const yaw = parseFloat(camYawEl?.value || 270);
      const fit = document.getElementById('camFitCheck')?.checked || false;
      callSketchUp('setCustomCamera', JSON.stringify({ yaw, pitch, fit }));
      setTimeout(requestViewportCapture, 350);
    });
  }

  const btnSyncCurrentCam = document.getElementById('btnSyncCurrentCam');
  if (btnSyncCurrentCam) {
    btnSyncCurrentCam.addEventListener('click', () => {
      callSketchUp('getCameraAngles', '');
    });
  }

  // Ações
  document.getElementById('btnCapture').addEventListener('click', requestViewportCapture);
  document.getElementById('btnSaveImage').addEventListener('click', () => exportImage('diffuse'));
  document.getElementById('btnSaveNormal').addEventListener('click', () => exportImage('normal'));
  document.getElementById('btnSavePackage').addEventListener('click', exportPackage);
  document.getElementById('btnResetZoom').addEventListener('click', resetView);
  document.getElementById('btnToggleGrid').addEventListener('click', toggleGrid);

  // Botões de Frame / Turntable MMORPG
  const btnPrev = document.getElementById('btnPrevFrame');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (!capturedFrames || capturedFrames.length <= 1) return;
      const prevIdx = (currentFrameIndex - 1 + capturedFrames.length) % capturedFrames.length;
      loadFrame(prevIdx);
    });
  }

  const btnNext = document.getElementById('btnNextFrame');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (!capturedFrames || capturedFrames.length <= 1) return;
      const nextIdx = (currentFrameIndex + 1) % capturedFrames.length;
      loadFrame(nextIdx);
    });
  }

  const btnPlay = document.getElementById('btnPlayTurntable');
  if (btnPlay) {
    btnPlay.addEventListener('click', toggleTurntablePlay);
  }

  const btnSheet = document.getElementById('btnSaveSheet');
  if (btnSheet) {
    btnSheet.addEventListener('click', () => exportSpritesheet(currentViewMode === 'normal' ? 'normal' : 'diffuse'));
  }

  // Botão Comparar
  const btnCompare = document.getElementById('btnCompare');
  btnCompare.addEventListener('mousedown', () => showOriginal(true));
  btnCompare.addEventListener('mouseup', () => showOriginal(false));
  btnCompare.addEventListener('mouseleave', () => showOriginal(false));

  updateSliderLabels();
}

function updateSliderLabels() {
  const map = {
    'fitPadding': 'fitPaddingVal',
    'orphanClean': 'orphanCleanVal',
    'maxColors': 'maxColorsVal',
    'celSteps': 'celStepsVal',
    'ditherAmount': 'ditherAmountVal',
    'hdrExposure': 'hdrExposureVal',
    'hdrShadowRecovery': 'hdrShadowRecoveryVal',
    'hdrBloom': 'hdrBloomVal',
    'brickBoost': 'brickBoostVal',
    'saturation': 'saturationVal',
    'innerEdges': 'innerEdgesVal',
    'normalStrength': 'normalStrengthVal',
    'normalLevel': 'normalLevelVal',
    'surfaceSmoothing': 'surfaceSmoothingVal',
    'lightZ': 'lightZVal',
    'lightIntensity': 'lightIntensityVal',
    'lightAmbient': 'lightAmbientVal',
    'lightSpecular': 'lightSpecularVal'
  };

  for (const [input, label] of Object.entries(map)) {
    const el = document.getElementById(input);
    const lbl = document.getElementById(label);
    if (!el || !lbl) continue;

    if (el.id === 'fitPadding') {
      lbl.textContent = `${el.value} px`;
    } else if (el.id === 'orphanClean') {
      const v = parseInt(el.value);
      const labels = ['Desativado', '1× (Leve)', '2× (Médio)', '3× (Forte)', '4× (Máximo)'];
      lbl.textContent = labels[v] || `${v}×`;
    } else if (el.id === 'maxColors') {
      lbl.textContent = `${el.value} cores`;
    } else if (el.id === 'celSteps') {
      const v = parseInt(el.value);
      lbl.textContent = v === 0 ? 'Desativado' : `${v} faixas`;
    } else if (el.id === 'lightIntensity') {
      const v = (parseFloat(el.value) / 10.0).toFixed(1);
      lbl.textContent = `${v}×`;
    } else if (el.id === 'ditherAmount') {
      lbl.textContent = `${el.value}%`;
    } else if (el.id === 'normalStrength') {
      lbl.textContent = `${parseFloat(el.value).toFixed(1)}×`;
    } else if (el.id === 'normalLevel') {
      lbl.textContent = `${el.value}`;
    } else if (el.id === 'hdrExposure') {
      const v = parseFloat(el.value) / 10.0;
      lbl.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)} EV`;
    } else if (el.id === 'saturation') {
      lbl.textContent = el.value > 0 ? `+${el.value}` : el.value;
    } else {
      lbl.textContent = `${el.value}%`;
    }
  }
}

function updatePixelScaleOptions() {
  const isSquare = (document.getElementById('aspectMode')?.value ?? 'square') === 'square';
  const sel = document.getElementById('pixelScale');
  if (!sel) return;

  Array.from(sel.options).forEach(opt => {
    const val = opt.value;
    if (isSquare) {
      opt.textContent = `${val} × ${val}`;
    } else {
      const calcW = Math.max(16, Math.round(parseInt(val) * sourceAspect));
      opt.textContent = `${calcW} × ${val}`;
    }
  });
}

function callSketchUp(action, payload) {
  if (window.sketchup && window.sketchup[action]) {
    window.sketchup[action](payload);
  } else {
    console.log(`[SketchUp]: ${action}`, payload);
  }
}

function requestViewportCapture() {
  const directions = parseInt(document.getElementById('directionCount')?.value || 1);
  statusText.textContent = directions > 1 
    ? `Renderizando ${directions} direções 3D em 360° do SketchUp...`
    : 'Renderizando geometria física e sombras do SketchUp...';

  const params = JSON.stringify({
    transparent: true,
    hideEdges: true,
    directions: directions
  });

  if (window.sketchup) {
    if (window.sketchup.captureCurrentViewport) {
      window.sketchup.captureCurrentViewport(params);
    } else if (window.sketchup.captureViewport) {
      window.sketchup.captureViewport(params);
    }
  }
}

function updateTurntableUI() {
  const controls = document.getElementById('turntableControls');
  const btnSheet = document.getElementById('btnSaveSheet');
  const label = document.getElementById('turntableLabel');
  if (!controls) return;

  if (capturedFrames && capturedFrames.length > 1) {
    controls.style.display = 'flex';
    if (btnSheet) btnSheet.style.display = 'inline-block';
    const angle = capturedFrames[currentFrameIndex]?.angle ?? (currentFrameIndex * (360 / capturedFrames.length));
    if (label) label.textContent = `${currentFrameIndex + 1}/${capturedFrames.length} (${Math.round(angle)}°)`;
  } else {
    controls.style.display = 'none';
    if (btnSheet) btnSheet.style.display = 'none';
  }
}

function toggleTurntablePlay() {
  const btn = document.getElementById('btnPlayTurntable');
  if (turntableTimer) {
    clearInterval(turntableTimer);
    turntableTimer = null;
    if (btn) btn.textContent = '🔄 Girar';
  } else {
    if (!capturedFrames || capturedFrames.length <= 1) return;
    if (btn) btn.textContent = '⏸️ Pausar';
    turntableTimer = setInterval(() => {
      const nextIdx = (currentFrameIndex + 1) % capturedFrames.length;
      loadFrame(nextIdx);
    }, 280);
  }
}

function loadFrame(index, callback) {
  if (!capturedFrames || capturedFrames.length === 0) {
    if (callback) callback();
    return;
  }
  currentFrameIndex = clamp(index, 0, capturedFrames.length - 1);
  const frame = capturedFrames[currentFrameIndex];
  updateTurntableUI();

  const promises = [];
  const loadImg = (url, cb) => {
    if (url && url.length > 3) {
      promises.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => { cb(img); resolve(); };
        img.onerror = () => { cb(null); resolve(); };
        img.src = url;
      }));
    } else {
      cb(null);
    }
  };

  loadImg(frame.diffuseUrl, img => { sourceImage = img; });
  loadImg(frame.albedoUrl,  img => { albedoPassImage = img; });
  loadImg(frame.normalUrl,  img => { geomNormalImage = img; });

  Promise.all(promises).then(() => {
    cachedSourceBBox = null;
    applyProcessing();
    if (callback) callback();
  });
}

function applyCameraPreset(preset) {
  const fit = document.getElementById('camFitCheck')?.checked || false;
  callSketchUp('setCameraPreset', JSON.stringify({ preset, fit }));

  const presetAngles = {
    'top_med':  { pitch: 45, yaw: 270 },
    'top_high': { pitch: 60, yaw: 270 },
    'top_low':  { pitch: 30, yaw: 270 },
    'dim_sw':   { pitch: 30, yaw: 225 },
    'dim_se':   { pitch: 30, yaw: 315 },
    'iso_sw':   { pitch: 35.3, yaw: 225 },
    'front':    { pitch: 0,  yaw: 270 },
    'top':      { pitch: 89.9, yaw: 270 }
  };
  if (presetAngles[preset]) {
    setCameraSliderValues(presetAngles[preset].yaw, presetAngles[preset].pitch);
  }
  setTimeout(requestViewportCapture, 350);
}

function updateCamSliderLabels() {
  const camPitchEl = document.getElementById('camPitch');
  const camYawEl = document.getElementById('camYaw');
  const camPitchVal = document.getElementById('camPitchVal');
  const camYawVal = document.getElementById('camYawVal');

  if (camPitchEl && camPitchVal) {
    camPitchVal.textContent = `${parseFloat(camPitchEl.value).toFixed(1)}°`;
  }
  if (camYawEl && camYawVal) {
    const y = parseFloat(camYawEl.value);
    let dir = '';
    if (y >= 225 && y <= 315) dir = ' (Sul / Frente)';
    else if (y >= 45 && y <= 135) dir = ' (Norte / Trás)';
    else if (y > 135 && y < 225) dir = ' (Oeste / Esq)';
    else dir = ' (Leste / Dir)';
    camYawVal.textContent = `${y.toFixed(1)}°${dir}`;
  }
}

function setCameraSliderValues(yaw, pitch) {
  const pEl = document.getElementById('camPitch');
  const yEl = document.getElementById('camYaw');
  if (pEl) pEl.value = Math.round(pitch);
  if (yEl) yEl.value = Math.round(yaw);
  updateCamSliderLabels();
}

window.onCameraAnglesReceived = function(data) {
  if (!data) return;
  setCameraSliderValues(data.yaw, data.pitch);
};

window.onCameraPresetApplied = function(preset) {
  applyCameraPreset(preset);
};

// Callback invocado pelo Ruby com todos os passes físicos do SketchUp
window.onPhysicalPassesLoaded = function(payload) {
  statusText.textContent = 'Decodificando passes físicos 3D...';

  if (payload.frames && Array.isArray(payload.frames) && payload.frames.length > 0) {
    capturedFrames = payload.frames;
  } else {
    capturedFrames = [{
      diffuseUrl: payload.diffuseUrl,
      albedoUrl: payload.albedoUrl,
      normalUrl: payload.normalUrl,
      angle: 0
    }];
  }

  sourceAspect = (typeof payload === 'object' && payload.aspectRatio) 
    ? payload.aspectRatio 
    : (payload.vpWidth && payload.vpHeight ? payload.vpWidth / payload.vpHeight : 16 / 9);

  currentFrameIndex = 0;
  loadFrame(0, () => {
    statusText.textContent = `Pronto (${capturedFrames.length} direções 3D carregadas)`;
  });
};

window.onDualPassesLoaded = function(payload) {
  window.onPhysicalPassesLoaded(payload);
};

window.onImageCaptured = function(payload) {
  cachedSourceBBox = null;
  if (typeof payload === 'object' && payload.diffuseUrl) {
    window.onPhysicalPassesLoaded(payload);
  } else {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      sourceAspect = (typeof payload === 'object' && payload.aspectRatio) 
        ? payload.aspectRatio 
        : (img.width / img.height);
      statusText.textContent = 'Pronto';
      geomNormalImage = null;
      applyProcessing();
    };
    img.onerror = () => {
      statusText.textContent = 'Erro ao decodificar imagem';
    };
    if (typeof payload === 'string') {
      img.src = payload;
    } else if (payload && payload.dataUrl) {
      img.src = payload.dataUrl;
    }
  }
};

window.onImageFileReady = function(aspect, vpW, vpH) {
  cachedSourceBBox = null;
  sourceAspect = aspect || (vpW / vpH);
  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    statusText.textContent = 'Pronto';
    applyProcessing();
  };
  img.onerror = () => {
    statusText.textContent = 'Erro ao ler arquivo';
  };
  img.src = 'viewport_diffuse.png?t=' + Date.now();
};

window.onCaptureError = function(msg) {
  statusText.textContent = 'Erro na captura';
  alert('Erro ao capturar viewport do SketchUp: ' + msg);
};

function getCalculatedResolution() {
  const size = parseInt(document.getElementById('pixelScale')?.value || 240);
  const isSquare = (document.getElementById('aspectMode')?.value ?? 'square') === 'square';

  if (isSquare) {
    return { width: size, height: size };
  } else {
    const targetW = Math.max(16, Math.round(size * sourceAspect));
    return { width: targetW, height: size };
  }
}

// =============================================================================
// SISTEMA DE SHADING & DITHERING PIXEL ART (ESTILO BLENDER EEVEE)
// =============================================================================

// Matriz Bayer 2x2 exata do PixelArtAddon do Blender:
// BAYER_VALUES = (0.75294, 0.25098, 0.0, 0.50196)
const BAYER_2X2 = [
  [0.75294, 0.25098],
  [0.0,     0.50196]
];

// Matriz Bayer 4x4 clássica normalizada 0..1
const BAYER_4X4 = [
  [ 0/16,  8/16,  2/16, 10/16],
  [12/16,  4/16, 14/16,  6/16],
  [ 3/16, 11/16,  1/16,  9/16],
  [15/16,  7/16, 13/16,  5/16]
];

// Função de mistura Soft Light (idêntica ao ShaderNodeMix 'SOFT_LIGHT' do Blender)
function softLightChannel(a, b) {
  if (b < 0.5) {
    return 2.0 * a * b + a * a * (1.0 - 2.0 * b);
  } else {
    return 2.0 * a * (1.0 - b) + Math.sqrt(Math.max(0.0, a)) * (2.0 * b - 1.0);
  }
}

function applyBayerDither(data, width, height, ditherType, amount) {
  if (ditherType === 'none' || amount <= 0) return;
  const factor = amount / 100.0;
  const is2x2 = ditherType === 'bayer2';
  const matrix = is2x2 ? BAYER_2X2 : BAYER_4X4;
  const mSize = is2x2 ? 2 : 4;

  for (let y = 0; y < height; y++) {
    const row = matrix[y % mSize];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) continue;

      const b = row[x % mSize];

      const r = data[idx] / 255.0;
      const g = data[idx + 1] / 255.0;
      const bl = data[idx + 2] / 255.0;

      const dr = softLightChannel(r, b);
      const dg = softLightChannel(g, b);
      const db = softLightChannel(bl, b);

      data[idx]     = clamp(Math.round((r * (1.0 - factor) + dr * factor) * 255.0), 0, 255);
      data[idx + 1] = clamp(Math.round((g * (1.0 - factor) + dg * factor) * 255.0), 0, 255);
      data[idx + 2] = clamp(Math.round((bl * (1.0 - factor) + db * factor) * 255.0), 0, 255);
    }
  }
}

// Cel-Shading: quantização de tons em faixas discretas (ColorRamp Constant do Blender)
function applyCelShading(data, width, height, steps) {
  if (steps <= 0 || steps >= 16) return;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0;
    const steppedLum = Math.round(lum * (steps - 1)) / (steps - 1);
    const ratio = (lum > 0.001) ? (steppedLum / lum) : 0;

    data[i]     = clamp(Math.round(r * ratio), 0, 255);
    data[i + 1] = clamp(Math.round(g * ratio), 0, 255);
    data[i + 2] = clamp(Math.round(b * ratio), 0, 255);
  }
}

// Quantização por Paleta de Cores (Paletas clássicas ou Adaptativa do modelo)
function applyPaletteQuantization(data, paletteKey) {
  if (!paletteKey || paletteKey === 'none') return;

  let colors = null;
  if (paletteKey === 'adaptive16') {
    colors = generateAdaptivePalette(data, 16);
  } else if (paletteKey === 'adaptive32') {
    colors = generateAdaptivePalette(data, 32);
  } else if (typeof PALETTES !== 'undefined' && PALETTES[paletteKey]) {
    colors = PALETTES[paletteKey].colors;
  }

  if (!colors || colors.length === 0) return;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let bestColor = colors[0];
    let bestDist = Infinity;

    for (let c = 0; c < colors.length; c++) {
      const col = colors[c];
      const dr = r - col[0];
      const dg = g - col[1];
      const db = b - col[2];
      const dist = dr * dr * 2.0 + dg * dg * 4.0 + db * db * 3.0;
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = col;
      }
    }

    data[i]     = bestColor[0];
    data[i + 1] = bestColor[1];
    data[i + 2] = bestColor[2];
  }
}

function generateAdaptivePalette(data, maxColors) {
  const colorMap = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const qr = (data[i] >> 3) << 3;
    const qg = (data[i + 1] >> 3) << 3;
    const qb = (data[i + 2] >> 3) << 3;
    const key = (qr << 16) | (qg << 8) | qb;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  const sorted = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([key]) => [
      (key >> 16) & 255,
      (key >> 8) & 255,
      key & 255
    ]);

  return sorted.length > 0 ? sorted : [[255, 255, 255], [0, 0, 0]];
}

// Limite máximo de cores e indexação sólida retro
function applyMaxColorsLimit(data, maxColors) {
  if (!maxColors || maxColors >= 64) return;

  const colors = generateAdaptivePalette(data, maxColors);
  if (!colors || colors.length === 0) return;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let bestColor = colors[0];
    let bestDist = Infinity;

    for (let c = 0; c < colors.length; c++) {
      const col = colors[c];
      const dr = r - col[0];
      const dg = g - col[1];
      const db = b - col[2];
      const dist = dr * dr * 2.0 + dg * dg * 4.0 + db * db * 3.0;
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = col;
      }
    }

    data[i]     = bestColor[0];
    data[i + 1] = bestColor[1];
    data[i + 2] = bestColor[2];
  }
}

// Limpeza de Órfãos e Agrupamento em Clusters Sólidos (Texel Studio & PixelLab)
function cleanOrphanPixels(data, width, height, passes) {
  if (passes <= 0) return;

  for (let p = 0; p < passes; p++) {
    const copy = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (copy[idx + 3] === 0) continue;

        const r = copy[idx];
        const g = copy[idx + 1];
        const b = copy[idx + 2];

        let sameCount = 0;
        let totalOpaque = 0;
        const neighborColors = [];

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;

            const nIdx = (ny * width + nx) * 4;
            if (copy[nIdx + 3] === 0) continue;

            totalOpaque++;
            const nr = copy[nIdx];
            const ng = copy[nIdx + 1];
            const nb = copy[nIdx + 2];

            const dr = r - nr;
            const dg = g - ng;
            const db = b - nb;
            const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;

            if (dist < 400) {
              sameCount++;
            }
            neighborColors.push([nr, ng, nb, (nr << 16) | (ng << 8) | nb]);
          }
        }

        // 1. Remove ruído flutuante isolado no ar
        if (totalOpaque <= 1) {
          data[idx + 3] = 0;
          continue;
        }

        // 2. Pixel órfão: menos de 2 vizinhos com cor parecida -> absorvido pelo cluster dominante
        if (sameCount < 2 && neighborColors.length > 0) {
          const freqMap = new Map();
          for (const c of neighborColors) {
            freqMap.set(c[3], (freqMap.get(c[3]) || 0) + 1);
          }

          let bestKey = neighborColors[0][3];
          let maxF = 0;
          for (const [k, f] of freqMap.entries()) {
            if (f > maxF) {
              maxF = f;
              bestKey = k;
            }
          }

          data[idx]     = (bestKey >> 16) & 255;
          data[idx + 1] = (bestKey >> 8) & 255;
          data[idx + 2] = bestKey & 255;
        }
      }
    }
  }
}

// Hue-Shifting (Regra clássica de pixel art: realces quentes/dourados e sombras frias/arroxeadas)
function applyHueShift(data, width, height) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;

    if (lum > 0.6) {
      const shift = (lum - 0.6) * 22.0;
      data[i]     = clamp(Math.round(r + shift * 0.8), 0, 255);
      data[i + 1] = clamp(Math.round(g + shift * 0.7), 0, 255);
      data[i + 2] = clamp(Math.round(b - shift * 0.5), 0, 255);
    } else if (lum < 0.4) {
      const shift = (0.4 - lum) * 26.0;
      data[i]     = clamp(Math.round(r - shift * 0.3), 0, 255);
      data[i + 1] = clamp(Math.round(g - shift * 0.4), 0, 255);
      data[i + 2] = clamp(Math.round(b + shift * 0.9), 0, 255);
    }
  }
}

// Remoção de fundo por Flood-Fill a partir do perímetro (sem furar sombras internas ou ranhuras)
function cleanPerimeterBackground(data, width, height, tolerance = 16) {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);

  const corners = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height - 1) * width + (width - 1)) * 4
  ];
  const cornerSamples = corners.map(idx => [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);

  const isBgMatch = (idx) => {
    const a = data[idx + 3];
    if (a < 32) return true;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    if (r <= 8 && g <= 8 && b <= 8) return true;
    for (const c of cornerSamples) {
      if (c[3] >= 32) {
        if (Math.abs(r - c[0]) <= tolerance && Math.abs(g - c[1]) <= tolerance && Math.abs(b - c[2]) <= tolerance) {
          return true;
        }
      }
    }
    return false;
  };

  const queue = [];
  const pushEdge = (x, y) => {
    const pIdx = y * width + x;
    if (visited[pIdx]) return;
    const idx = pIdx * 4;
    if (isBgMatch(idx)) {
      visited[pIdx] = 1;
      queue.push(x, y);
    }
  };

  for (let x = 0; x < width; x++) {
    pushEdge(x, 0);
    pushEdge(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushEdge(0, y);
    pushEdge(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    const cIdx = (cy * width + cx) * 4;
    data[cIdx + 3] = 0;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const npIdx = ny * width + nx;
      if (visited[npIdx]) continue;

      if (isBgMatch(npIdx * 4)) {
        visited[npIdx] = 1;
        queue.push(nx, ny);
      }
    }
  }

  for (let pIdx = 0; pIdx < totalPixels; pIdx++) {
    if (!visited[pIdx]) {
      const idx = pIdx * 4;
      if (data[idx + 3] >= 32) {
        data[idx + 3] = 255;
      }
    }
  }
}

// Cel / Toon Shading 3D limpo a partir de normais reais e albedo (RPG Estilo Octopath / Dead Cells)
function applyGeometricCelShading(data, normalData, width, height) {
  if (!normalData) return;
  const lx = -0.45;
  const ly = 0.65;
  const lz = 0.61;
  const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const nLx = lx / lLen;
  const nLy = ly / lLen;
  const nLz = lz / lLen;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let nx = (normalData[i] / 255.0) * 2.0 - 1.0;
    let ny = (normalData[i + 1] / 255.0) * 2.0 - 1.0;
    let nz = (normalData[i + 2] / 255.0) * 2.0 - 1.0;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
    nx /= len;
    ny /= len;
    nz /= len;

    const dot = nx * nLx + ny * nLy + nz * nLz;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (dot > 0.40) {
      data[i]     = clamp(Math.round(r * 1.15 + 10), 0, 255);
      data[i + 1] = clamp(Math.round(g * 1.15 + 6), 0, 255);
      data[i + 2] = clamp(Math.round(b * 1.05 - 4), 0, 255);
    } else if (dot > -0.05) {
      data[i]     = r;
      data[i + 1] = g;
      data[i + 2] = b;
    } else if (dot > -0.45) {
      data[i]     = clamp(Math.round(r * 0.72 - 6), 0, 255);
      data[i + 1] = clamp(Math.round(g * 0.72 - 4), 0, 255);
      data[i + 2] = clamp(Math.round(b * 0.80 + 12), 0, 255);
    } else {
      data[i]     = clamp(Math.round(r * 0.48 - 10), 0, 255);
      data[i + 1] = clamp(Math.round(g * 0.48 - 8), 0, 255);
      data[i + 2] = clamp(Math.round(b * 0.58 + 18), 0, 255);
    }
  }
}

// =============================================================================
// PIPELINE DE PROCESSAMENTO PIXEL ART
// =============================================================================
function applyProcessing() {
  if (!sourceImage) return;

  // Garante o cálculo do Bounding Box 3D para encaixe otimizado (Auto-Crop)
  if (!cachedSourceBBox) {
    cachedSourceBBox = calculateSourceBoundingBox(sourceImage, geomNormalImage);
  }

  const { width: targetW, height: targetH } = getCalculatedResolution();
  canvas.width = targetW;
  canvas.height = targetH;

  // Downscale de todos os passes físicos do SketchUp com o mesmo encaixe e padding
  const getDownscaledBuffer = (img) => {
    if (!img) return null;
    const nCanvas = document.createElement('canvas');
    nCanvas.width = targetW;
    nCanvas.height = targetH;
    const nCtx = nCanvas.getContext('2d');
    nCtx.imageSmoothingEnabled = false;

    const fitMode = document.getElementById('fitMode')?.value || 'autocrop';
    const fitPadding = parseInt(document.getElementById('fitPadding')?.value ?? 1);
    const fitAnchor = document.getElementById('fitAnchor')?.value || 'center';

    const dest = getDrawDestination(targetW, targetH, img.width, img.height, cachedSourceBBox, fitMode, fitPadding, fitAnchor);

    nCtx.drawImage(img, dest.sx, dest.sy, dest.sw, dest.sh, dest.dx, dest.dy, dest.dw, dest.dh);
    return nCtx.getImageData(0, 0, targetW, targetH).data;
  };

  const shadingData    = getDownscaledBuffer(shadingPassImage);
  const eastData       = getDownscaledBuffer(eastPassImage);
  const westData       = getDownscaledBuffer(westPassImage);
  const topData        = getDownscaledBuffer(topPassImage);
  const geomNormalData = getDownscaledBuffer(geomNormalImage);

  // 1. Amostragem com Texel Dominante (Modal), Ponto mais Próximo (Point) ou Mip-Stepping
  const brickBoost = parseInt(document.getElementById('brickBoost')?.value) || 0;
  const samplingMethod = document.getElementById('samplingMethod')?.value || 'modal';
  const shadingModel = document.getElementById('shadingModel')?.value || 'sketchup';

  // Escolha da imagem fonte para cor base: se 'cel_toon' ou 'flat_albedo' e temos albedo puro, usa albedo!
  let colorSource = (shadingModel !== 'sketchup' && albedoPassImage) ? albedoPassImage : sourceImage;

  let imgData = sampleViewportCrisply(colorSource, targetW, targetH, brickBoost, samplingMethod);
  let data = imgData.data;

  // 2. Remoção inteligente de fundo por Flood-Fill Perimetral (sem furar cavidades escuras internas)
  const transparentBg = document.getElementById('transparentBg')?.checked ?? true;
  if (transparentBg) {
    cleanPerimeterBackground(data, targetW, targetH, 16);
  } else {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) data[i + 3] = 0;
      else data[i + 3] = 255;
    }
  }

  // 3. Sistema de Tratamento HDR em Espaço Linear (ACES Filmic Tone Mapping, Shadow Recovery & Bloom)
  const hdrEnabled = document.getElementById('hdrEnabled')?.checked ?? true;
  if (hdrEnabled && shadingModel === 'sketchup') {
    const exposureEV = (parseInt(document.getElementById('hdrExposure')?.value || 1)) / 10.0;
    const toneMapType = document.getElementById('hdrToneMap')?.value || 'aces';
    const shadowRec = (parseInt(document.getElementById('hdrShadowRecovery')?.value || 40)) / 100.0;
    const bloomAmount = (parseInt(document.getElementById('hdrBloom')?.value || 25)) / 100.0;

    applyHDRProcessing(data, targetW, targetH, exposureEV, toneMapType, shadowRec, bloomAmount);
  }

  // 4. Se o modo Cel/Toon Shading 3D estiver ativo, gera o sombreamento nítido usando o mapa de normais
  if (shadingModel === 'cel_toon' && geomNormalData) {
    applyGeometricCelShading(data, geomNormalData, targetW, targetH);
  }

  // 5. Ajustes de Saturação Adicional
  const sat = parseInt(document.getElementById('saturation')?.value) || 0;
  if (sat !== 0) {
    const factor = (sat + 100) / 100.0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
      data[i] = clamp(gray + (data[i] - gray) * factor, 0, 255);
      data[i + 1] = clamp(gray + (data[i + 1] - gray) * factor, 0, 255);
      data[i + 2] = clamp(gray + (data[i + 2] - gray) * factor, 0, 255);
    }
  }

  // 6. Bayer Dithering (Matriz 2x2 / 4x4 com Soft Light idêntico ao Addon Blender)
  const ditherType = document.getElementById('ditherType')?.value || 'none';
  const ditherAmount = parseInt(document.getElementById('ditherAmount')?.value || 20);
  if (ditherType !== 'none' && ditherAmount > 0) {
    applyBayerDither(data, targetW, targetH, ditherType, ditherAmount);
  }

  // 7. Cel-Shading (Quantização de iluminação em faixas discretas)
  const celSteps = parseInt(document.getElementById('celSteps')?.value || 0);
  if (celSteps > 0 && celSteps < 16) {
    applyCelShading(data, targetW, targetH, celSteps);
  }

  // 8. Hue-Shifting (Regra clássica de pixel art: realces quentes/dourados e sombras frias/arroxeadas)
  const hueShift = document.getElementById('hueShift')?.checked ?? true;
  if (hueShift) {
    applyHueShift(data, targetW, targetH);
  }

  // 9. Quantização por Paleta Retro / Adaptativa ou Limite Máximo de Cores
  const paletteKey = document.getElementById('paletteSelect')?.value || 'none';
  if (paletteKey !== 'none') {
    applyPaletteQuantization(data, paletteKey);
  } else {
    const maxColors = parseInt(document.getElementById('maxColors')?.value || 24);
    if (maxColors < 64) {
      applyMaxColorsLimit(data, maxColors);
    }
  }

  // 10. Limpeza de Órfãos e Agrupamento em Clusters Sólidos (Texel Studio & PixelLab)
  const orphanClean = parseInt(document.getElementById('orphanClean')?.value ?? 2);
  if (orphanClean > 0) {
    cleanOrphanPixels(data, targetW, targetH, orphanClean);
  }

  // Salva cópia pura da geometria antes dos contornos serem desenhados (para cálculo de relevo sem artefatos)
  const preOutlineData = new Uint8ClampedArray(data);

  // 11. Bordas e Silhueta Pixel-Perfect de Alta Definição
  let strokeMap = null;
  const outlineMode = document.getElementById('outlineMode')?.value || 'outer';
  if (outlineMode !== 'none') {
    const outlineColor = document.getElementById('outlineColor')?.value || 'selout';
    const cleanPP = document.getElementById('cleanPixelPerfect')?.checked ?? true;
    const innerSens = parseInt(document.getElementById('innerEdges')?.value) || 0;
    strokeMap = applyMasterPixelArtOutlines(data, targetW, targetH, outlineMode, outlineColor, cleanPP, innerSens);
  }

  currentOutlineMap = strokeMap;
  processedImageData = imgData;

  // 12. Calcular Normal Map baseado 100% na geometria, luz e sombra reais do SketchUp
  generatePhysicalNormalMap(preOutlineData, shadingData, eastData, westData, topData, geomNormalData, targetW, targetH, currentOutlineMap);

  // 13. Exibir
  renderActiveMode();

  statsRes.textContent = `${targetW} × ${targetH} px`;
  statsColors.textContent = `${countUniqueColors(data)} cores`;
}

function renderActiveMode() {
  if (!processedImageData || !normalImageData) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (currentViewMode === 'diffuse') {
    ctx.putImageData(processedImageData, 0, 0);
  } else if (currentViewMode === 'normal') {
    ctx.putImageData(normalImageData, 0, 0);
  } else if (currentViewMode === 'light') {
    renderDynamicLighting();
  }
}

// =============================================================================
// SISTEMA DE ENCAIXE INTELIGENTE (AUTO-CROP 3D & PADDING CONFIGURÁVEL)
// =============================================================================
function calculateSourceBoundingBox(diffuseImg, normalImg) {
  const img = diffuseImg || normalImg;
  if (!img) return null;

  const w = img.width;
  const h = img.height;
  if (w <= 0 || h <= 0) return null;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tCtx = c.getContext('2d', { willReadFrequently: true });
  tCtx.drawImage(img, 0, 0);

  const data = tCtx.getImageData(0, 0, w, h).data;

  // Amostra os cantos da imagem para identificar o fundo do SketchUp com precisão
  const cornerCoords = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)]
  ];

  const bgSamples = cornerCoords.map(([cx, cy]) => {
    const i = (cy * w + cx) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  });

  const isBackgroundPixel = (r, g, b, a) => {
    // 1. Alpha transparente
    if (a < 48) return true;
    // 2. Preto padrão de fundo da viewport
    if (r <= 12 && g <= 12 && b <= 12) return true;

    // 3. Compara com as amostras dos cantos (caso o fundo seja branco/cinza do estilo)
    for (let s = 0; s < bgSamples.length; s++) {
      const sample = bgSamples[s];
      if (sample[3] < 48) continue;
      const dr = Math.abs(r - sample[0]);
      const dg = Math.abs(g - sample[1]);
      const db = Math.abs(b - sample[2]);
      if (dr <= 12 && dg <= 12 && db <= 12) return true;
    }

    return false;
  };

  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (!isBackgroundPixel(r, g, b, a)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Se nenhum pixel do modelo for detectado, retorna tamanho total da viewport
  if (maxX < minX || maxY < minY) {
    console.log('[SketchPixel]: BBox não encontrou objeto isolado, usando viewport total.');
    return { x: 0, y: 0, width: w, height: h };
  }

  // Margem de segurança mínima de 1px na imagem fonte
  const pad = 1;
  const fx = Math.max(0, minX - pad);
  const fy = Math.max(0, minY - pad);
  const fw = Math.min(w - fx, (maxX - minX + 1) + pad * 2);
  const fh = Math.min(h - fy, (maxY - minY + 1) + pad * 2);

  const bbox = { x: fx, y: fy, width: fw, height: fh };
  console.log('[SketchPixel]: BBox 3D detectado com sucesso:', bbox, `(Viewport: ${w}x${h})`);
  return bbox;
}

function getDrawDestination(targetW, targetH, imgW, imgH, box, fitMode, pad, fitAnchor) {
  let sx = 0, sy = 0, sw = imgW, sh = imgH;

  if (fitMode === 'autocrop' && box && box.width > 2 && box.height > 2) {
    sx = box.x;
    sy = box.y;
    sw = box.width;
    sh = box.height;
  }

  const effectivePad = Math.max(0, Math.min(pad, Math.floor(Math.min(targetW, targetH) / 3)));
  const availW = Math.max(1, targetW - 2 * effectivePad);
  const availH = Math.max(1, targetH - 2 * effectivePad);

  const contentAspect = sw / sh;
  const availAspect = availW / availH;

  let dw = availW;
  let dh = availH;
  let dx = effectivePad;
  let dy = effectivePad;

  if (contentAspect > availAspect) {
    dw = availW;
    dh = Math.max(1, Math.round(availW / contentAspect));
    dx = effectivePad;
    if (fitAnchor === 'bottom') {
      dy = targetH - effectivePad - dh;
    } else if (fitAnchor === 'top') {
      dy = effectivePad;
    } else {
      dy = effectivePad + Math.floor((availH - dh) / 2);
    }
  } else {
    dh = availH;
    dw = Math.max(1, Math.round(availH * contentAspect));
    if (fitAnchor === 'bottom') {
      dy = targetH - effectivePad - dh;
    } else if (fitAnchor === 'top') {
      dy = effectivePad;
    } else {
      dy = effectivePad + Math.floor((availH - dh) / 2);
    }
    dx = effectivePad + Math.floor((availW - dw) / 2);
  }

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

// =============================================================================
// AMOSTRAGEM DE TIJOLOS E TEXTURAS
// =============================================================================
function sampleViewportCrisply(source, targetW, targetH, brickBoost, samplingMethod = 'point') {
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const fCtx = finalCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = false;

  const fitMode = document.getElementById('fitMode')?.value || 'autocrop';
  const fitPadding = parseInt(document.getElementById('fitPadding')?.value ?? 1);
  const fitAnchor = document.getElementById('fitAnchor')?.value || 'center';

  const dest = getDrawDestination(targetW, targetH, source.width, source.height, cachedSourceBBox, fitMode, fitPadding, fitAnchor);

  if (samplingMethod === 'modal') {
    // Amostragem Texel Dominante (Cluster / Moda):
    // Elimina ruídos pontilhados e descontinuidades em linhas finas (parafusos, roscas, engrenagens, armaduras)
    const sCanvas = document.createElement('canvas');
    sCanvas.width = dest.sw;
    sCanvas.height = dest.sh;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = false;
    sCtx.drawImage(source, dest.sx, dest.sy, dest.sw, dest.sh, 0, 0, dest.sw, dest.sh);
    const sData = sCtx.getImageData(0, 0, dest.sw, dest.sh).data;

    const outImgData = fCtx.createImageData(targetW, targetH);
    const outData = outImgData.data;

    const sw = dest.sw;
    const sh = dest.sh;
    const dw = dest.dw;
    const dh = dest.dh;
    const dx = dest.dx;
    const dy = dest.dy;

    for (let py = 0; py < dh; py++) {
      const sy0 = Math.floor(py * sh / dh);
      const sy1 = Math.min(sh, Math.ceil((py + 1) * sh / dh));

      for (let px = 0; px < dw; px++) {
        const sx0 = Math.floor(px * sw / dw);
        const sx1 = Math.min(sw, Math.ceil((px + 1) * sw / dw));

        const targetIdx = ((dy + py) * targetW + (dx + px)) * 4;

        let opaqueCount = 0;
        let totalCount = 0;
        const bucketCounts = new Map();
        const bucketColors = new Map();

        const stepX = Math.max(1, Math.floor((sx1 - sx0) / 4));
        const stepY = Math.max(1, Math.floor((sy1 - sy0) / 4));

        for (let sy = sy0; sy < sy1; sy += stepY) {
          const row = sy * sw * 4;
          for (let sx = sx0; sx < sx1; sx += stepX) {
            totalCount++;
            const sIdx = row + sx * 4;
            const sa = sData[sIdx + 3];
            const sr = sData[sIdx];
            const sg = sData[sIdx + 1];
            const sb = sData[sIdx + 2];

            if (sa < 48 || (sr <= 8 && sg <= 8 && sb <= 8)) {
              continue;
            }

            opaqueCount++;
            // Quantização de 5-bits por canal para votação de clusters sólidos
            const bucketKey = ((sr >> 3) << 10) | ((sg >> 3) << 5) | (sb >> 3);
            bucketCounts.set(bucketKey, (bucketCounts.get(bucketKey) || 0) + 1);

            if (!bucketColors.has(bucketKey)) {
              bucketColors.set(bucketKey, [sr, sg, sb, 1]);
            } else {
              const c = bucketColors.get(bucketKey);
              c[0] += sr; c[1] += sg; c[2] += sb; c[3]++;
            }
          }
        }

        if (opaqueCount === 0 || (opaqueCount / Math.max(1, totalCount)) < 0.38) {
          outData[targetIdx + 3] = 0;
          continue;
        }

        let maxCount = -1;
        let dominantKey = -1;
        for (const [key, count] of bucketCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            dominantKey = key;
          }
        }

        if (dominantKey !== -1) {
          const c = bucketColors.get(dominantKey);
          outData[targetIdx]     = Math.round(c[0] / c[3]);
          outData[targetIdx + 1] = Math.round(c[1] / c[3]);
          outData[targetIdx + 2] = Math.round(c[2] / c[3]);
          outData[targetIdx + 3] = 255;
        } else {
          outData[targetIdx + 3] = 0;
        }
      }
    }

    fCtx.putImageData(outImgData, 0, 0);
  } else if (samplingMethod === 'point') {
    // Amostragem direta por ponto mais próximo (Texel Studio & PixelLab)
    // Preserva arestas e quinas de 1px sem borrar gradientes nas transições
    fCtx.imageSmoothingEnabled = false;
    fCtx.drawImage(source, dest.sx, dest.sy, dest.sw, dest.sh, dest.dx, dest.dy, dest.dw, dest.dh);
  } else {
    // Redução em cascata Mip-Scale para reter linhas finas de textura dentro da área recortada
    let curCanvas = document.createElement('canvas');
    curCanvas.width = dest.sw;
    curCanvas.height = dest.sh;
    let curCtx = curCanvas.getContext('2d');
    curCtx.drawImage(source, dest.sx, dest.sy, dest.sw, dest.sh, 0, 0, dest.sw, dest.sh);

    while (curCanvas.width >= dest.dw * 2 && curCanvas.height >= dest.dh * 2) {
      const nextW = Math.max(dest.dw, Math.floor(curCanvas.width / 2));
      const nextH = Math.max(dest.dh, Math.floor(curCanvas.height / 2));
      const nextCanvas = document.createElement('canvas');
      nextCanvas.width = nextW;
      nextCanvas.height = nextH;
      const nextCtx = nextCanvas.getContext('2d');
      nextCtx.imageSmoothingEnabled = true;
      nextCtx.imageSmoothingQuality = 'high';
      nextCtx.drawImage(curCanvas, 0, 0, nextW, nextH);
      curCanvas = nextCanvas;
    }

    fCtx.imageSmoothingEnabled = false;
    fCtx.drawImage(curCanvas, dest.dx, dest.dy, dest.dw, dest.dh);
  }

  const imgData = fCtx.getImageData(0, 0, targetW, targetH);
  if (brickBoost > 0) {
    boostBrickMortarLines(imgData.data, targetW, targetH, brickBoost / 100.0);
  }
  return imgData;
}

function boostBrickMortarLines(data, width, height, amount) {
  const copy = new Uint8ClampedArray(data);
  const getLum = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 128;
    const idx = (y * width + x) * 4;
    if (copy[idx + 3] === 0) return 0;
    return copy[idx] * 0.299 + copy[idx + 1] * 0.587 + copy[idx + 2] * 0.114;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (copy[idx + 3] === 0) continue;

      const c = getLum(x, y);
      const l = getLum(x - 1, y);
      const r = getLum(x + 1, y);
      const t = getLum(x, y - 1);
      const b = getLum(x, y + 1);

      const isMortar = (t > c + 10 && b > c + 10) || (l > c + 10 && r > c + 10);

      if (isMortar) {
        const factor = Math.max(0.18, 1.0 - (amount * 0.72));
        data[idx] = Math.floor(data[idx] * factor);
        data[idx + 1] = Math.floor(data[idx + 1] * factor);
        data[idx + 2] = Math.floor(data[idx + 2] * factor);
      } else {
        const boost = amount * 0.12;
        data[idx] = clamp(data[idx] * (1.0 + boost), 0, 255);
        data[idx + 1] = clamp(data[idx + 1] * (1.0 + boost), 0, 255);
        data[idx + 2] = clamp(data[idx + 2] * (1.0 + boost * 0.5), 0, 255);
      }
    }
  }
}

// =============================================================================
// SISTEMA DE PROCESSAMENTO DE IMAGEM HDR (ACES FILMIC / REINHARD / SHADOW RECOVERY)
// =============================================================================
function applyHDRProcessing(data, width, height, exposureEV, toneMapType, shadowRecovery, bloomAmount) {
  const numPixels = width * height;
  const linR = new Float32Array(numPixels);
  const linG = new Float32Array(numPixels);
  const linB = new Float32Array(numPixels);
  const exposureMult = Math.pow(2.0, exposureEV);

  // 1. Conversão sRGB -> Linear e Aplicação de Exposição HDR
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    if (data[idx + 3] === 0) continue;

    let r = Math.pow(data[idx] / 255.0, 2.2) * exposureMult;
    let g = Math.pow(data[idx + 1] / 255.0, 2.2) * exposureMult;
    let b = Math.pow(data[idx + 2] / 255.0, 2.2) * exposureMult;

    // Recuperação de Sombras: ilumina áreas escuras sem estourar as altas luzes
    if (shadowRecovery > 0) {
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (lum < 0.35) {
        const shadowBoost = (1.0 - (lum / 0.35)) * shadowRecovery * 0.75;
        r += r * shadowBoost;
        g += g * shadowBoost;
        b += b * shadowBoost;
      }
    }

    linR[i] = r;
    linG[i] = g;
    linB[i] = b;
  }

  // 2. Bloom HDR para reflexos solares e pontos de alta intensidade
  if (bloomAmount > 0) {
    const bloomBufferR = new Float32Array(numPixels);
    const bloomBufferG = new Float32Array(numPixels);
    const bloomBufferB = new Float32Array(numPixels);

    for (let i = 0; i < numPixels; i++) {
      const lum = linR[i] * 0.2126 + linG[i] * 0.7152 + linB[i] * 0.0722;
      if (lum > 0.65) {
        const excess = (lum - 0.65) * bloomAmount * 0.45;
        bloomBufferR[i] = linR[i] * excess;
        bloomBufferG[i] = linG[i] * excess;
        bloomBufferB[i] = linB[i] * excess;
      }
    }

    // Difusão sutil para pixel art (1px raio)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (data[idx * 4 + 3] === 0) continue;

        let bR = 0, bG = 0, bB = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            bR += bloomBufferR[nIdx];
            bG += bloomBufferG[nIdx];
            bB += bloomBufferB[nIdx];
            count++;
          }
        }
        if (count > 0) {
          linR[idx] += bR / count;
          linG[idx] += bG / count;
          linB[idx] += bB / count;
        }
      }
    }
  }

  // 3. Funções de Tone Mapping
  const acesToneMap = (x) => {
    const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  };

  const reinhardToneMap = (x) => {
    return x / (1.0 + x);
  };

  // 4. Tone Mapping e Conversão Linear -> sRGB
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    if (data[idx + 3] === 0) continue;

    let r = linR[i];
    let g = linG[i];
    let b = linB[i];

    if (toneMapType === 'aces') {
      r = acesToneMap(r);
      g = acesToneMap(g);
      b = acesToneMap(b);
    } else if (toneMapType === 'reinhard') {
      r = reinhardToneMap(r);
      g = reinhardToneMap(g);
      b = reinhardToneMap(b);
    } else {
      // Neutral Filmic
      r = clamp(r / (1.0 + r * 0.55), 0.0, 1.0);
      g = clamp(g / (1.0 + g * 0.55), 0.0, 1.0);
      b = clamp(b / (1.0 + b * 0.55), 0.0, 1.0);
    }

    data[idx]     = clamp(Math.round(Math.pow(r, 1.0 / 2.2) * 255), 0, 255);
    data[idx + 1] = clamp(Math.round(Math.pow(g, 1.0 / 2.2) * 255), 0, 255);
    data[idx + 2] = clamp(Math.round(Math.pow(b, 1.0 / 2.2) * 255), 0, 255);
  }
}

// =============================================================================
// ALGORITMO DE BORDAS PIXEL-PERFECT (OUTER STROKE / SEL-OUT)
// =============================================================================
function applyMasterPixelArtOutlines(data, width, height, mode, colorMode, cleanPP, innerSens) {
  const copy = new Uint8ClampedArray(data);
  const strokeMap = new Uint8Array(width * height);
  const strokeColorR = new Uint8Array(width * height);
  const strokeColorG = new Uint8Array(width * height);
  const strokeColorB = new Uint8Array(width * height);

  const getAlpha = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return copy[(y * width + x) * 4 + 3];
  };

  const getPixelRGB = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0];
    const idx = (y * width + x) * 4;
    return [copy[idx], copy[idx + 1], copy[idx + 2]];
  };

  // 1. Mapear Contorno Externo (Outer Stroke - Mantém 100% das texturas intactas!)
  if (mode === 'outer') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pIdx = y * width + x;
        if (copy[pIdx * 4 + 3] !== 0) continue; // Pula os pixels sólidos da malha

        const aL = getAlpha(x - 1, y);
        const aR = getAlpha(x + 1, y);
        const aT = getAlpha(x, y - 1);
        const aB = getAlpha(x, y + 1);

        if (aL > 0 || aR > 0 || aT > 0 || aB > 0) {
          strokeMap[pIdx] = 1;

          // Seleciona cor do vizinho sólido mais próximo para Sel-Out (Sombreado Natural)
          let nr = 18, ng = 18, nb = 22;
          if (colorMode === 'selout') {
            const solidNeighbor = aL > 0 ? getPixelRGB(x - 1, y) :
                                  aR > 0 ? getPixelRGB(x + 1, y) :
                                  aT > 0 ? getPixelRGB(x, y - 1) : getPixelRGB(x, y + 1);
            nr = Math.floor(solidNeighbor[0] * 0.38);
            ng = Math.floor(solidNeighbor[1] * 0.38);
            nb = Math.floor(solidNeighbor[2] * 0.38);
          }
          strokeColorR[pIdx] = nr;
          strokeColorG[pIdx] = ng;
          strokeColorB[pIdx] = nb;
        }
      }
    }
  } else if (mode === 'inner') {
    // Contorno Interno
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pIdx = y * width + x;
        if (copy[pIdx * 4 + 3] === 0) continue;

        if (getAlpha(x - 1, y) === 0 || getAlpha(x + 1, y) === 0 ||
            getAlpha(x, y - 1) === 0 || getAlpha(x, y + 1) === 0) {
          strokeMap[pIdx] = 1;
          const idx = pIdx * 4;
          let nr = 18, ng = 18, nb = 22;
          if (colorMode === 'selout') {
            nr = Math.floor(copy[idx] * 0.4);
            ng = Math.floor(copy[idx + 1] * 0.4);
            nb = Math.floor(copy[idx + 2] * 0.4);
          }
          strokeColorR[pIdx] = nr;
          strokeColorG[pIdx] = ng;
          strokeColorB[pIdx] = nb;
        }
      }
    }
  }

  // 2. Linhas internas 3D (Opcional, com threshold seguro)
  if (innerSens > 0) {
    const threshold = 120 - (innerSens * 0.6);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pIdx = y * width + x;
        if (copy[pIdx * 4 + 3] === 0 || strokeMap[pIdx] === 1) continue;

        const getLum = (px, py) => {
          const i = (py * width + px) * 4;
          return copy[i] * 0.299 + copy[i + 1] * 0.587 + copy[i + 2] * 0.114;
        };

        const diffX = Math.abs(getLum(x + 1, y) - getLum(x - 1, y));
        const diffY = Math.abs(getLum(x, y + 1) - getLum(x, y - 1));

        if (diffX + diffY > threshold) {
          strokeMap[pIdx] = 1;
          const idx = pIdx * 4;
          strokeColorR[pIdx] = Math.floor(copy[idx] * 0.4);
          strokeColorG[pIdx] = Math.floor(copy[idx + 1] * 0.4);
          strokeColorB[pIdx] = Math.floor(copy[idx + 2] * 0.4);
        }
      }
    }
  }

  // 3. Limpeza Pixel-Perfect: Remove cantos em 2x2 para manter escadinhas 1px estritas
  if (cleanPP) {
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const idx = y * width + x;
        if (strokeMap[idx] === 0) continue;

        const right = strokeMap[idx + 1];
        const down  = strokeMap[idx + width];
        const diag  = strokeMap[idx + width + 1];

        if (right && down && diag) {
          strokeMap[idx + width + 1] = 0;
        }
      }
    }
  }

  // 4. Grava no buffer de imagem
  for (let i = 0; i < width * height; i++) {
    if (strokeMap[i] === 1) {
      const idx = i * 4;
      data[idx]     = strokeColorR[i];
      data[idx + 1] = strokeColorG[i];
      data[idx + 2] = strokeColorB[i];
      data[idx + 3] = 255;
    }
  }

  return strokeMap;
}

// Callback quando os 3 passos solares do SketchUp estão prontos
let solarPassData = null;
window.onSolarPassesReady = function() {
  const { width: targetW, height: targetH } = getCalculatedResolution();
  const passes = ['solar_east.png', 'solar_west.png', 'solar_noon.png'];
  const loadedImgs = {};
  let loadedCount = 0;

  passes.forEach(name => {
    const img = new Image();
    img.onload = () => {
      // Extrair luminância downscaled na mesma resolução do pixel art
      const oc = document.createElement('canvas');
      oc.width = targetW;
      oc.height = targetH;
      const oCtx = oc.getContext('2d');
      oCtx.drawImage(img, 0, 0, targetW, targetH);
      const imgData = oCtx.getImageData(0, 0, targetW, targetH).data;

      const lumMap = new Float32Array(targetW * targetH);
      for (let i = 0; i < targetW * targetH; i++) {
        lumMap[i] = (imgData[i * 4] * 0.299 + imgData[i * 4 + 1] * 0.587 + imgData[i * 4 + 2] * 0.114) / 255.0;
      }
      loadedImgs[name] = lumMap;
      loadedCount++;

      if (loadedCount === 3) {
        solarPassData = {
          east: loadedImgs['solar_east.png'],
          west: loadedImgs['solar_west.png'],
          noon: loadedImgs['solar_noon.png']
        };
        statusText.textContent = 'Relevo solar integrado!';
        applyProcessing();
      }
    };
    img.onerror = () => {
      statusText.textContent = 'Aviso: Sol parcial';
    };
    img.src = `${name}?t=${Date.now()}`;
  });
};

// =============================================================================
// MOTOR DE NORMAL MAP INSPIRADO NO NormalMap-Online (cpetry/NormalMap-Online)
// Suporta: Geometria 3D Real, 4-Way Solar Photos, Heightmap Sobel/Scharr & Híbrido
// Padrão OpenGL / Unity (Y+): R = (Nx*0.5+0.5)*255, G = (Ny*0.5+0.5)*255, B = (Nz*0.5+0.5)*255
// =============================================================================
function generatePhysicalNormalMap(diffuseData, shadingData, eastData, westData, topData, geomNormalData, width, height, strokeMap = null) {
  normalImageData = ctx.createImageData(width, height);
  const nData = normalImageData.data;

  const mode = document.getElementById('normalSourceMode')?.value || 'geom';
  const strength = parseFloat(document.getElementById('normalStrength')?.value ?? 3.0);
  const level = parseInt(document.getElementById('normalLevel')?.value ?? 5);
  const filterType = document.getElementById('normalFilterType')?.value || 'scharr';
  const smoothingInf = (parseInt(document.getElementById('surfaceSmoothing')?.value ?? 0)) / 100.0;
  const invR = document.getElementById('invertR')?.checked || false;
  const invG = document.getElementById('invertG')?.checked || false;
  const invH = document.getElementById('invertH')?.checked || false;
  const normalBgMode = document.getElementById('normalBgMode')?.value || 'purple';
  const excludeOutline = document.getElementById('normalExcludeOutline')?.checked ?? true;

  const rawNx = new Float32Array(width * height);
  const rawNy = new Float32Array(width * height);
  const rawNz = new Float32Array(width * height);
  const validMask = new Uint8Array(width * height); // 0 = Fundo, 1 = Geometria/Objeto, 2 = Outline de Pixel Art

  const hasGeomNormals = !!(geomNormalData && geomNormalData.length >= width * height * 4);

  const getLum = (buf, x, y) => {
    if (!buf) return 0;
    x = clamp(x, 0, width - 1);
    y = clamp(y, 0, height - 1);
    const i = (y * width + x) * 4;
    return (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114) / 255.0;
  };

  const heightSource = shadingData || diffuseData;

  // Fórmula exata de dz do NormalMap-Online:
  // dz = (1.0 / strength) * (1.0 + pow(2.0, level))
  const dz = (1.0 / Math.max(0.01, strength)) * (1.0 + Math.pow(2.0, level));

  // Step espacial proporcional ao level para cobrir a inclinação de faces volumétricas
  const stepX = Math.max(1, Math.round(level * 0.4));
  const stepY = Math.max(1, Math.round(level * 0.4));

  // 1. Extração dos vetores primários conforme o modo selecionado
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const idx = pIdx * 4;
      const alpha = diffuseData[idx + 3];

      // Outline de pixel art: manter normal plana neutra #7F7FFF sem deformação
      if (excludeOutline && strokeMap && strokeMap[pIdx] === 1) {
        validMask[pIdx] = 2; // Outline de Pixel Art
        rawNx[pIdx] = 0;
        rawNy[pIdx] = 0;
        rawNz[pIdx] = 1;
        continue;
      }

      // Máscara precisa de objeto vs fundo transparente
      const isObject = (alpha >= 32) || (hasGeomNormals && geomNormalData[idx + 3] > 32);

      if (!isObject) {
        validMask[pIdx] = 0;
        rawNx[pIdx] = 0;
        rawNy[pIdx] = 0;
        rawNz[pIdx] = 1;
        continue;
      }

      validMask[pIdx] = 1;

      let nx = 0.0;
      let ny = 0.0;
      let nz = 1.0;

      if (mode === 'geom') {
        if (hasGeomNormals && geomNormalData[idx + 3] > 16) {
          // MODO GEOMETRIA PURA: Vetores tridimensionais exatos das faces do SketchUp (Imagem 1)
          nx = (geomNormalData[idx] / 255.0) * 2.0 - 1.0;
          ny = (geomNormalData[idx + 1] / 255.0) * 2.0 - 1.0;
          nz = (geomNormalData[idx + 2] / 255.0) * 2.0 - 1.0;
        } else {
          // Fallback caso o passe de normais ainda esteja carregando
          nx = 0.0;
          ny = 0.0;
          nz = 1.0;
        }
      } else if (mode === 'photometric' && eastData && westData) {
        // MODO 4-WAY PHOTOS (NormalMapFromPicturesShader do NormalMap-Online):
        const lEast  = getLum(eastData, x, y);
        const lWest  = getLum(westData, x, y);
        const lTop   = getLum(topData, x, y);
        const lBelow = shadingData ? getLum(shadingData, x, y) : (lEast + lWest) * 0.5;

        const dx = (lEast - lWest) * 255.0;
        const dy = (lTop - lBelow) * 255.0;

        nx = dx;
        ny = dy;
        nz = dz;
      } else if (mode === 'combined' && hasGeomNormals && geomNormalData[idx + 3] > 16) {
        // MODO HÍBRIDO: Faces 3D da geometria como base principal + micro-relevo
        const gNx = (geomNormalData[idx] / 255.0) * 2.0 - 1.0;
        const gNy = (geomNormalData[idx + 1] / 255.0) * 2.0 - 1.0;
        const gNz = (geomNormalData[idx + 2] / 255.0) * 2.0 - 1.0;

        const tl = getLum(heightSource, x - stepX, y - stepY);
        const t  = getLum(heightSource, x,         y - stepY);
        const tr = getLum(heightSource, x + stepX, y - stepY);
        const l  = getLum(heightSource, x - stepX, y);
        const r  = getLum(heightSource, x + stepX, y);
        const bl = getLum(heightSource, x - stepX, y + stepY);
        const b  = getLum(heightSource, x,         y + stepY);
        const br = getLum(heightSource, x + stepX, y + stepY);

        let dx = (filterType === 'sobel')
          ? (tl + 2.0 * l + bl) - (tr + 2.0 * r + br)
          : (tl * 3.0 + l * 10.0 + bl * 3.0) - (tr * 3.0 + r * 10.0 + br * 3.0);
        let dy = (filterType === 'sobel')
          ? (tl + 2.0 * t + tr) - (bl + 2.0 * b + br)
          : (tl * 3.0 + t * 10.0 + tr * 3.0) - (bl * 3.0 + b * 10.0 + br * 3.0);

        nx = gNx + (dx * 255.0 / dz) * 0.25;
        ny = gNy + (dy * 255.0 / dz) * 0.25;
        nz = Math.max(0.05, gNz);
      } else {
        // MODO HEIGHTMAP CONVOLUÇÃO (NormalMapShader.js do NormalMap-Online para relevos):
        const tl = getLum(heightSource, x - stepX, y - stepY);
        const t  = getLum(heightSource, x,         y - stepY);
        const tr = getLum(heightSource, x + stepX, y - stepY);
        const l  = getLum(heightSource, x - stepX, y);
        const r  = getLum(heightSource, x + stepX, y);
        const bl = getLum(heightSource, x - stepX, y + stepY);
        const b  = getLum(heightSource, x,         y + stepY);
        const br = getLum(heightSource, x + stepX, y + stepY);

        let dx = 0.0;
        let dy = 0.0;

        if (filterType === 'sobel') {
          dx = (tl + 2.0 * l + bl) - (tr + 2.0 * r + br);
          dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
        } else {
          // Scharr
          dx = (tl * 3.0 + l * 10.0 + bl * 3.0) - (tr * 3.0 + r * 10.0 + br * 3.0);
          dy = (tl * 3.0 + t * 10.0 + tr * 3.0) - (bl * 3.0 + b * 10.0 + br * 3.0);
        }

        nx = dx * 255.0;
        ny = dy * 255.0;
        nz = dz;
      }

      // Normaliza o vetor 3D resultante
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      rawNx[pIdx] = nx / len;
      rawNy[pIdx] = ny / len;
      rawNz[pIdx] = nz / len;
    }
  }

  // 2. SUAVIZAÇÃO BILATERAL DE CURVATURA (Opcional - para esferas e cilindros)
  const smoothNx = new Float32Array(width * height);
  const smoothNy = new Float32Array(width * height);
  const smoothNz = new Float32Array(width * height);

  if (smoothingInf > 0) {
    const radius = Math.min(3, Math.max(1, Math.round(smoothingInf * 2.5)));
    const twoSigmaSpaceSq = 2.0 * (radius * 0.8) * (radius * 0.8);
    const dotThreshold = 0.65;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pIdx = y * width + x;
        if (validMask[pIdx] !== 1) {
          smoothNx[pIdx] = 0; smoothNy[pIdx] = 0; smoothNz[pIdx] = 1;
          continue;
        }

        const cNx = rawNx[pIdx];
        const cNy = rawNy[pIdx];
        const cNz = rawNz[pIdx];

        let accNx = 0.0, accNy = 0.0, accNz = 0.0, totalWeight = 0.0;

        for (let dy = -radius; dy <= radius; dy++) {
          const nyPos = y + dy;
          if (nyPos < 0 || nyPos >= height) continue;

          for (let dx = -radius; dx <= radius; dx++) {
            const nxPos = x + dx;
            if (nxPos < 0 || nxPos >= width) continue;

            const nIdx = nyPos * width + nxPos;
            if (validMask[nIdx] !== 1) continue;

            const nNx = rawNx[nIdx];
            const nNy = rawNy[nIdx];
            const nNz = rawNz[nIdx];

            const dot = cNx * nNx + cNy * nNy + cNz * nNz;
            if (dot < dotThreshold) continue;

            const distSq = dx * dx + dy * dy;
            const w = Math.exp(-distSq / twoSigmaSpaceSq) * Math.pow(dot, 3);

            accNx += nNx * w;
            accNy += nNy * w;
            accNz += nNz * w;
            totalWeight += w;
          }
        }

        if (totalWeight > 0.0001) {
          const len = Math.sqrt(accNx * accNx + accNy * accNy + accNz * accNz) || 1.0;
          const aNx = accNx / len;
          const aNy = accNy / len;
          const aNz = accNz / len;

          const blendedX = cNx * (1.0 - smoothingInf) + aNx * smoothingInf;
          const blendedY = cNy * (1.0 - smoothingInf) + aNy * smoothingInf;
          const blendedZ = cNz * (1.0 - smoothingInf) + aNz * smoothingInf;
          const bLen = Math.sqrt(blendedX * blendedX + blendedY * blendedY + blendedZ * blendedZ) || 1.0;

          smoothNx[pIdx] = blendedX / bLen;
          smoothNy[pIdx] = blendedY / bLen;
          smoothNz[pIdx] = blendedZ / bLen;
        } else {
          smoothNx[pIdx] = cNx;
          smoothNy[pIdx] = cNy;
          smoothNz[pIdx] = cNz;
        }
      }
    }
  } else {
    smoothNx.set(rawNx);
    smoothNy.set(rawNy);
    smoothNz.set(rawNz);
  }

  // 3. GRAVAÇÃO FINAL NO BUFFER COM FUNDO ROXO PADRÃO #7F7FFF E OUTLINE PROTEGIDO
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const idx = pIdx * 4;

      // Fundo sem objeto:
      if (validMask[pIdx] === 0) {
        if (normalBgMode === 'transparent') {
          nData[idx]     = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 255;
          nData[idx + 3] = 0; // Transparência total se explicitamente escolhido
        } else {
          // Fundo roxo neutro padrão #7F7FFF da indústria de jogos 2.5D (RGB: 127, 127, 255, Alpha: 255)
          nData[idx]     = 127;
          nData[idx + 1] = 127;
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
        continue;
      }

      // Outline de pixel art: NÃO aplicar normal map (mantém normal flat neutra #7F7FFF)
      if (validMask[pIdx] === 2 || (excludeOutline && strokeMap && strokeMap[pIdx] === 1)) {
        nData[idx]     = 127;
        nData[idx + 1] = 127;
        nData[idx + 2] = 255;
        nData[idx + 3] = 255;
        continue;
      }

      let nx = smoothNx[pIdx] * (invR ? -1.0 : 1.0);
      let ny = smoothNy[pIdx] * (invG ? -1.0 : 1.0);
      let nz = smoothNz[pIdx] * (invH ? -1.0 : 1.0);

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      // Padrão OpenGL / Unity (Y+):
      // -X (Esquerda) = Azul | +X (Direita) = Magenta
      // +Y (Topo) = Verde    | -Y (Baixo) = Roxo | +Z (Frente) = Lavanda
      nData[idx]     = clamp(Math.floor((nx * 0.5 + 0.5) * 255), 0, 255);
      nData[idx + 1] = clamp(Math.floor((ny * 0.5 + 0.5) * 255), 0, 255);
      nData[idx + 2] = clamp(Math.floor((nz * 0.5 + 0.5) * 255), 0, 255);
      nData[idx + 3] = 255; // Sólido estritamente sobre a geometria do objeto
    }
  }
}

// =============================================================================
// TESTE DE LUZ DINÂMICA 3D (BLINN-PHONG COM CONTATO E ESFERICIDADE)
// =============================================================================
function setupLightTester() {
  viewport.addEventListener('mousemove', (e) => {
    if (currentViewMode !== 'light' || !processedImageData) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));

    lightPos.x = x;
    lightPos.y = y;

    renderDynamicLighting();
  });
}

function renderDynamicLighting() {
  if (!processedImageData || !normalImageData) return;

  const w = canvas.width;
  const h = canvas.height;
  const refSize = Math.max(w, h);
  const outImg = ctx.createImageData(w, h);
  const out = outImg.data;
  const diff = processedImageData.data;
  const norm = normalImageData.data;

  const modeType = document.getElementById('lightModeType')?.value || 'sprite';
  const intensity = (parseFloat(document.getElementById('lightIntensity')?.value || 15)) / 10.0;
  const ambientVal = (parseFloat(document.getElementById('lightAmbient')?.value || 25)) / 100.0;
  const specVal = (parseFloat(document.getElementById('lightSpecular')?.value || 40)) / 100.0;
  const zPercent = (parseFloat(document.getElementById('lightZ')?.value || 45)) / 100.0;

  // Altura da luz proporcional à escala do objeto/canvas
  const lz = Math.max(2.0, zPercent * refSize);
  const lx = lightPos.x;
  const ly = lightPos.y;

  // Cor da luz
  let lR = 255, lG = 255, lB = 255;
  const colHex = document.getElementById('lightColor')?.value;
  if (colHex && colHex.startsWith('#') && colHex.length === 7) {
    lR = parseInt(colHex.substring(1, 3), 16) || 255;
    lG = parseInt(colHex.substring(3, 5), 16) || 255;
    lB = parseInt(colHex.substring(5, 7), 16) || 255;
  }

  const isClay = (modeType === 'clay');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = diff[idx + 3];
      if (a === 0) {
        out[idx + 3] = 0;
        continue;
      }

      // Se for pixel do outline de pixel art, NÃO aplicar normal map nem luz dinâmica!
      // Preserva a cor original e nitidez do traço de pixel art (sem reflexos ou deformações)
      const pIdx = y * w + x;
      if (currentOutlineMap && currentOutlineMap[pIdx] === 1) {
        out[idx]     = diff[idx];
        out[idx + 1] = diff[idx + 1];
        out[idx + 2] = diff[idx + 2];
        out[idx + 3] = a;
        continue;
      }

      // Converte cor RGB do Normal Map para vetor unitário (-1.0 a +1.0)
      const nx = (norm[idx] / 255.0) * 2.0 - 1.0;
      const ny = (norm[idx + 1] / 255.0) * 2.0 - 1.0;
      const nz = (norm[idx + 2] / 255.0) * 2.0 - 1.0;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      const normX = nx / nLen;
      const normY = ny / nLen;
      const normZ = nz / nLen;

      // Vetor da luz do pixel em direção à fonte:
      // +X: Direita
      // +Y: Cima (no canvas, o topo tem Y menor, portanto y - ly é a direção para Cima)
      // +Z: Em direção à câmera / fora da tela
      const vx = lx - x;
      const vy = y - ly;
      const vz = lz;
      const dist = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1.0;
      const lDirX = vx / dist;
      const lDirY = vy / dist;
      const lDirZ = vz / dist;

      // Iluminação Difusa Lambertiana (N . L)
      const nDotL = Math.max(0.0, normX * lDirX + normY * lDirY + normZ * lDirZ);

      // Atenuação suave proporcional ao tamanho da imagem
      const normDist = dist / refSize;
      const atten = 1.0 / (1.0 + normDist * 1.0 + normDist * normDist * 0.5);

      // Specular Highlight Blinn-Phong (Reflexo de brilho sobre a curvatura da geometria)
      // View direction V = (0, 0, 1)
      const hx = lDirX;
      const hy = lDirY;
      const hz = lDirZ + 1.0;
      const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1.0;
      const nDotH = Math.max(0.0, (normX * hx + normY * hy + normZ * hz) / hLen);
      const specular = Math.pow(nDotH, 22.0) * specVal * atten;

      // Cor base (Clay neutro para inspecionar geometria pura, ou sprite colorido)
      const baseR = isClay ? 215 : diff[idx];
      const baseG = isClay ? 220 : diff[idx + 1];
      const baseB = isClay ? 230 : diff[idx + 2];

      const lightMult = ambientVal + nDotL * intensity * atten;

      out[idx]     = clamp(Math.round(baseR * lightMult * (lR / 255.0) + specular * lR), 0, 255);
      out[idx + 1] = clamp(Math.round(baseG * lightMult * (lG / 255.0) + specular * lG), 0, 255);
      out[idx + 2] = clamp(Math.round(baseB * lightMult * (lB / 255.0) + specular * lB), 0, 255);
      out[idx + 3] = a;
    }
  }

  ctx.putImageData(outImg, 0, 0);

  // Ponto indicador da posição da luz 3D
  const r = Math.max(2, Math.round(w * 0.025));
  ctx.save();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = Math.max(1, Math.round(w * 0.01));
  ctx.beginPath();
  ctx.arc(lightPos.x, lightPos.y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(lightPos.x, lightPos.y, Math.max(1, r * 0.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// =============================================================================
// ZOOM E PAN
// =============================================================================
function setupZoomAndPan() {
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(currentZoom + (e.deltaY < 0 ? 1 : -1));
  });

  viewport.addEventListener('mousedown', (e) => {
    if (e.button === 0 && currentViewMode === 'light') return;
    if (e.button === 0 || e.button === 1) {
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => { isPanning = false; });

  document.querySelectorAll('[data-zoom]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-zoom]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setZoom(parseInt(btn.getAttribute('data-zoom')));
    });
  });
}

function setZoom(z) {
  currentZoom = clamp(z, 1, 16);
  document.getElementById('zoomDisplay').textContent = `${currentZoom * 100}%`;
  updateTransform();
}

function resetView() {
  currentZoom = 3; panX = 0; panY = 0;
  setZoom(3);
}

function updateTransform() {
  container.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function toggleGrid() {
  const grid = document.getElementById('pixelGrid');
  grid.style.display = grid.style.display === 'block' ? 'none' : 'block';
}

function showOriginal(show) {
  if (!sourceImage) return;
  if (show) {
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  } else {
    renderActiveMode();
  }
}

// =============================================================================
// EXPORTAÇÃO
// =============================================================================
function createUpscaledDataUrl(imgData, scale) {
  const outW = imgData.width * scale;
  const outH = imgData.height * scale;
  const tempCan = document.createElement('canvas');
  tempCan.width = imgData.width;
  tempCan.height = imgData.height;
  tempCan.getContext('2d').putImageData(imgData, 0, 0);

  const expCanvas = document.createElement('canvas');
  expCanvas.width = outW;
  expCanvas.height = outH;
  const expCtx = expCanvas.getContext('2d');
  expCtx.imageSmoothingEnabled = false;
  expCtx.drawImage(tempCan, 0, 0, outW, outH);

  return expCanvas.toDataURL('image/png');
}

function exportImage(type) {
  const targetData = type === 'normal' ? normalImageData : processedImageData;
  if (!targetData) {
    alert('Nenhuma imagem disponível para salvar.');
    return;
  }

  const scale = parseInt(document.getElementById('upscaleSelect').value) || 1;
  const dataUrl = createUpscaledDataUrl(targetData, scale);
  const suffix = type === 'normal' ? 'normal' : 'diffuse';
  const filename = `pixel_${suffix}_${targetData.width}x${targetData.height}_${scale}x.png`;

  callSketchUp('saveImage', JSON.stringify({ dataUrl, filename }));
}

async function exportSpritesheet(type) {
  if (!capturedFrames || capturedFrames.length <= 1) {
    exportImage(type);
    return;
  }

  const numFrames = capturedFrames.length;
  const { width: targetW, height: targetH } = getCalculatedResolution();
  const scale = parseInt(document.getElementById('upscaleSelect').value) || 1;

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = targetW * numFrames * scale;
  sheetCanvas.height = targetH * scale;
  const sCtx = sheetCanvas.getContext('2d');
  sCtx.imageSmoothingEnabled = false;

  statusText.textContent = `Gerando spritesheet MMORPG (${numFrames} direções)...`;

  const savedIndex = currentFrameIndex;

  for (let i = 0; i < numFrames; i++) {
    await new Promise(resolve => loadFrame(i, resolve));
    const targetData = (type === 'normal') ? normalImageData : processedImageData;
    if (targetData) {
      const frameCan = document.createElement('canvas');
      frameCan.width = targetW;
      frameCan.height = targetH;
      frameCan.getContext('2d').putImageData(targetData, 0, 0);

      sCtx.drawImage(frameCan, 0, 0, targetW, targetH, i * targetW * scale, 0, targetW * scale, targetH * scale);
    }
  }

  loadFrame(savedIndex);

  const dataUrl = sheetCanvas.toDataURL('image/png');
  const suffix = (type === 'normal') ? 'normal' : 'diffuse';
  const filename = `spritesheet_${suffix}_${numFrames}dirs_${targetW * scale}x${targetH * scale}.png`;

  callSketchUp('saveImage', JSON.stringify({ dataUrl, filename }));
}

async function exportPackage() {
  if (!processedImageData || !normalImageData) {
    alert('Capture e processe o modelo antes de exportar o pacote 2.5D.');
    return;
  }

  const scale = parseInt(document.getElementById('upscaleSelect').value) || 1;
  const numFrames = capturedFrames ? capturedFrames.length : 1;

  if (numFrames > 1) {
    statusText.textContent = `Exportando pacote MMORPG (${numFrames} direções)...`;
    const { width: targetW, height: targetH } = getCalculatedResolution();

    const diffSheet = document.createElement('canvas');
    diffSheet.width = targetW * numFrames * scale;
    diffSheet.height = targetH * scale;
    const dCtx = diffSheet.getContext('2d');
    dCtx.imageSmoothingEnabled = false;

    const normSheet = document.createElement('canvas');
    normSheet.width = targetW * numFrames * scale;
    normSheet.height = targetH * scale;
    const nCtx = normSheet.getContext('2d');
    nCtx.imageSmoothingEnabled = false;

    const savedIndex = currentFrameIndex;

    for (let i = 0; i < numFrames; i++) {
      await new Promise(resolve => loadFrame(i, resolve));
      if (processedImageData) {
        const c = document.createElement('canvas');
        c.width = targetW; c.height = targetH;
        c.getContext('2d').putImageData(processedImageData, 0, 0);
        dCtx.drawImage(c, 0, 0, targetW, targetH, i * targetW * scale, 0, targetW * scale, targetH * scale);
      }
      if (normalImageData) {
        const c = document.createElement('canvas');
        c.width = targetW; c.height = targetH;
        c.getContext('2d').putImageData(normalImageData, 0, 0);
        nCtx.drawImage(c, 0, 0, targetW, targetH, i * targetW * scale, 0, targetW * scale, targetH * scale);
      }
    }

    loadFrame(savedIndex);

    callSketchUp('saveSpritePackage', JSON.stringify({
      baseName: `spritesheet_${numFrames}dirs_${targetW * scale}x${targetH * scale}`,
      diffuseUrl: diffSheet.toDataURL('image/png'),
      normalUrl: normSheet.toDataURL('image/png')
    }));
  } else {
    const diffuseUrl = createUpscaledDataUrl(processedImageData, scale);
    const normalUrl = createUpscaledDataUrl(normalImageData, scale);

    callSketchUp('saveSpritePackage', JSON.stringify({
      baseName: `sprite_${processedImageData.width}x${processedImageData.height}`,
      diffuseUrl: diffuseUrl,
      normalUrl: normalUrl
    }));
  }
}

function countUniqueColors(data) {
  const set = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return set.size;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
