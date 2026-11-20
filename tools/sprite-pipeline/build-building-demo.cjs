#!/usr/bin/env node
// Inline PixiJS, the layered factory sheet and the fx sheet into one page: dist/building-demo/index.html
const fs = require('fs');
const b64 = (f) => 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
const html = fs.readFileSync('src/building-demo.html', 'utf8')
  .replace('__PIXI__', () => fs.readFileSync('node_modules/pixi.js/dist/pixi.min.js', 'utf8'))
  .replace('__PIXI_UNSAFE_EVAL__', () => fs.readFileSync('node_modules/pixi.js/dist/packages/unsafe-eval.min.js', 'utf8'))
  .replace('__LAYERS_PNG__', () => b64('dist/layers/factory-layers@4x.webp'))
  .replace('__LAYERS_JSON__', () => fs.readFileSync('dist/layers/factory-layers@4x.json', 'utf8'))
  .replace('__FX_PNG__', () => b64('dist/atlas/fx@2x.webp'))
  .replace('__FX_JSON__', () => fs.readFileSync('dist/atlas/fx@2x.json', 'utf8'))
  .replace('__PARTS__', () => fs.readFileSync('dist/layers/factory-parts.json', 'utf8'));
fs.mkdirSync('dist/building-demo', { recursive: true });
fs.writeFileSync('dist/building-demo/index.html', html);
console.log('wrote dist/building-demo/index.html', Math.round(html.length / 1024), 'KB');
