// Paletas clássicas e avançadas de Pixel Art (hex -> [r, g, b])
function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

const PALETTES = {
  none: {
    name: 'Cores Originais (Texturas Fiéis)',
    colors: []
  },
  adaptive: {
    name: 'Adaptativa do Modelo (32 Cores Mais Ricas)',
    colors: [],
    isAdaptive: true
  },
  adaptive64: {
    name: 'Adaptativa Ultra-Detalhada (64 Cores)',
    colors: [],
    isAdaptive: true
  },
  resurrect64: {
    name: 'Resurrect 64 (Paleta Mestre de Pixel Art)',
    colors: [
      '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#c8b9a6',
      '#2d1b00', '#612706', '#84421b', '#ba611a', '#e58024', '#f0a843',
      '#fbd275', '#fbf4c4', '#1b2632', '#005784', '#31a2f2', '#8fe2ff',
      '#0e423d', '#146f4c', '#2c9f45', '#7fd449', '#e0f86d', '#1b1b22',
      '#3f3847', '#6c5c71', '#a8849b', '#dfa9b9', '#fbe0e0', '#3b1443',
      '#741764', '#b8275c', '#ea4f36', '#fa8150', '#fcaf76', '#fce1a9',
      '#101e29', '#193f49', '#246b69', '#3b9c7b', '#73d489', '#bdff9e',
      '#231627', '#421d37', '#7b254c', '#bf3855', '#eb6e67', '#f4a387',
      '#fcd3b4', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a',
      '#e8b796', '#c28569', '#323c39', '#5fcde4'
    ].map(hexToRgb)
  },
  endesga32: {
    name: 'Endesga 32 (EDG32)',
    colors: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672',
      '#b86f50', '#733e39', '#3e2731', '#a22633',
      '#e43b44', '#f77622', '#feae34', '#fee761',
      '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff',
      '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c',
      '#b55088', '#f6757a', '#e8b796', '#c28569'
    ].map(hexToRgb)
  },
  db32: {
    name: 'Dawnbringer 32 (DB32)',
    colors: [
      '#000000', '#222034', '#45283c', '#663931',
      '#8f563b', '#df7126', '#d9a066', '#eec39a',
      '#fbf236', '#99e550', '#6abe30', '#37946e',
      '#4b692f', '#524b24', '#323c39', '#3f3f74',
      '#306082', '#5b6ee1', '#639bff', '#5fcde4',
      '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
      '#696a6a', '#595652', '#76428a', '#ac3232',
      '#d95763', '#d77643', '#8f974a', '#8a6f30'
    ].map(hexToRgb)
  },
  pico8: {
    name: 'PICO-8 (16 Cores)',
    colors: [
      '#000000', '#1D2B53', '#7E2553', '#008751',
      '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
      '#FF004D', '#FFA300', '#FFEC27', '#00E436',
      '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
    ].map(hexToRgb)
  },
  db16: {
    name: 'Dawnbringer 16 (DB16)',
    colors: [
      '#140c1c', '#442434', '#30346d', '#4e4a4e',
      '#854c30', '#346524', '#d04648', '#757161',
      '#597dce', '#d27d2c', '#8595a1', '#6daa2c',
      '#d2a479', '#4992db', '#dad45e', '#deeed6'
    ].map(hexToRgb)
  },
  gameboy_dmg: {
    name: 'Game Boy DMG Original (4 Tons Verde)',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map(hexToRgb)
  },
  cyberpunk: {
    name: 'Cyberpunk Neon (16 Cores)',
    colors: [
      '#08020f', '#1b0933', '#391263', '#711c91',
      '#133e7c', '#091833', '#0abdc6', '#71f79f',
      '#ea00d9', '#ff2a6d', '#05d9e8', '#fcee0a',
      '#01012b', '#ffffff', '#6b705c', '#ffeaa7'
    ].map(hexToRgb)
  },
  monochrome: {
    name: '1-Bit Monocromático (P&B)',
    colors: ['#000000', '#ffffff'].map(hexToRgb)
  }
};
