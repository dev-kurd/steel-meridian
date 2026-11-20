#!/usr/bin/env node
/* Bake the LAYERED light factory: 4 facings × 6 layers (body, mask, lights, dmg1, dmg2, star)
 * + 4 flat parts the game rotates itself (fanBlades, fanDisc, fanRing, radar).
 *   node bake-layers.cjs [--scale 4]   → dist/layers/factory-layers@4x.webp + .json
 * Frame names: lf_<layer>_f<facing>, flat_<part>. All facings share one frame size + anchor (no jitter).
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');
const VM = require('./src/vector-mini.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SCALE = Number(arg('scale', '4')), OUT = 'dist/layers', PAD = 4;
const LAYERS = ['body', 'mask', 'lights', 'dmg1', 'dmg2', 'star', 'fore'];
const FLAT = ['fanBlades', 'fanDisc', 'fanRing', 'radar'];

const t0 = Date.now(), frames = [];
// one frame box for every facing and layer, so they stack exactly
const views = [];
let bb = [Infinity, Infinity, -Infinity, -Infinity];
for (let f = 0; f < 4; f++) for (const L of LAYERS) {
  const v = VM.layerView(f, L);
  views.push({ name: `lf_${L}_f${f}`, svg: v.svg });
  bb = [Math.min(bb[0], v.bbox[0]), Math.min(bb[1], v.bbox[1]), Math.max(bb[2], v.bbox[2]), Math.max(bb[3], v.bbox[3])];
}
const vb = [bb[0] - 1, bb[1] - 1, bb[2] - bb[0] + 2, bb[3] - bb[1] + 2];
for (const v of views) frames.push({ ...v, vb, anchor: { x: -vb[0] / vb[2], y: -vb[1] / vb[3] } });
for (const k of FLAT) { const p = VM.flatPart(k); frames.push({ name: `flat_${k}`, svg: p.svg, vb: p.box, anchor: { x: 0.5, y: 0.5 } }); }

for (const f of frames) { f.w = Math.ceil(f.vb[2] * SCALE); f.h = Math.ceil(f.vb[3] * SCALE); }
const area = frames.reduce((a, f) => a + (f.w + PAD) * (f.h + PAD), 0);
let AW = 256; while (AW < 4096 && AW * AW < area * 1.15) AW *= 2;
let x = PAD, y = PAD, rowH = 0;
for (const f of [...frames].sort((a, b) => b.h - a.h)) { if (x + f.w + PAD > AW) { x = PAD; y += rowH + PAD; rowH = 0; } f.x = x; f.y = y; x += f.w + PAD; rowH = Math.max(rowH, f.h); }
const AH = y + rowH + PAD;

(async () => {
  const body = frames.map((f) => `<svg x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" viewBox="${f.vb.join(' ')}">${f.svg}</svg>`).join('');
  const png = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${AW}" height="${AH}">${body}</svg>`, { fitTo: { mode: 'original' } }).render().asPng();
  const img = await sharp(png).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
  const file = `factory-layers@${SCALE}x`;
  const json = {
    frames: Object.fromEntries(frames.map((f) => [f.name, { frame: { x: f.x, y: f.y, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h }, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, anchor: f.anchor }])),
    meta: { app: 'state-of-war bake-layers.cjs', image: `${file}.webp`, format: 'RGBA8888', size: { w: AW, h: AH }, scale: String(SCALE) },
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${file}.webp`), img);
  fs.writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(json));
  fs.writeFileSync(path.join(OUT, 'factory-parts.json'), JSON.stringify(VM.FACTORY_PARTS));
  console.log(`${file}: ${frames.length} frames, ${AW}×${AH}, ${Math.round(img.length / 1024)} KB in ${Date.now() - t0} ms`);
})();
