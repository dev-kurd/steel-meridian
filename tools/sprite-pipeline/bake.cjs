#!/usr/bin/env node
/* Bake vector models into PixiJS sprite sheets (WebP lossless + JSON), one per group and scale.
 *
 *   node bake.cjs [--scales 1,2,4] [--out dist]
 *
 * One atlas per scale (pixels per world unit): atlas@1x, atlas@2x, atlas@4x.
 * The game loads the set that matches zoom × screen density, so it stays sharp
 * when zoomed in and light on memory when zoomed out.
 *
 * For every model × team × facing × frame it renders the SVG, packs all frames
 * into ONE big SVG (nested <svg> per frame) and rasterises it once with resvg.
 * Frame names: <model>_<team>_f<facing>_t<frame>, e.g. tank_blue_f3_t1.
 * Each frame stores an anchor = the model's ground origin, so sprites line up
 * exactly with the map tile they stand on.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp'); // PNG → WebP lossless (pixel-identical, ~28% smaller)
const VM = require('./src/vector-mini.js');
for (const f of ['vector-unit', 'chassis', 'panzer']) require(`./src/vector-unit/${f}.js`); // VectorUnit tank models (unchanged)
const UM = require('./src/vector-unit/unit-models.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SCALES = arg('scales', '1,2,4').split(',').map(Number);
const OUT = arg('out', 'dist/atlas');
const PAD = 2;
const TEAMS = Object.keys(VM.TEAMS);

const t0 = Date.now();

// ---- groups: one sprite sheet (per scale) for each group ----
// teamMask groups: ONE set of frames for every team. The image holds the picture (team paint in light grey,
// team lights in white) in its top half and a mask in its bottom half (R = team paint, G = team lights);
// the game's team-colour shader tints each unit while drawing. Damage overlays + wrecks have no team colour.
const GROUPS = [
  { name: 'buildings', models: ['lightFactory'], teamMask: true },
  // Light Panzer (VectorUnit): team mask worked out from three colour passes ("derive")
  { name: 'tank', unit: true, derive: true, teamMask: true, models: ['tankHull', 'tankTurret'] },
  { name: 'tank-dmg', unit: true, derive: true, teamMask: true, models: ['tankHullD1', 'tankHullD2', 'tankTurretD1', 'tankTurretD2'] },
  { name: 'tank-common', unit: true, models: ['tankHullWreck', 'tankTurretWreck'] },
];

// pass 1: render every view once; one bbox per model so all its frames share size + anchor (no jitter)
const byModel = {};
for (const [model, M] of Object.entries(VM.MODELS)) {
  const views = [];
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const team of (M.teamless ? ['any'] : TEAMS)) for (let f = 0; f < M.facings; f++) for (let t = 0; t < M.frames; t++) {
    const v = VM.view(model, team, f, t);
    views.push({ name: `${model}_${team}_f${f}_t${t}`, team, svg: v.svg });
    bb = [Math.min(bb[0], v.bbox[0]), Math.min(bb[1], v.bbox[1]), Math.max(bb[2], v.bbox[2]), Math.max(bb[3], v.bbox[3])];
  }
  const m = 1; // margin for outlines
  const vb = [bb[0] - m, bb[1] - m, bb[2] - bb[0] + 2 * m, bb[3] - bb[1] + 2 * m];
  const anchor = { x: -vb[0] / vb[2], y: -vb[1] / vb[3] };
  byModel[model] = views.map((v) => ({ ...v, vb, anchor }));
}

// team-mask models: three passes per view (picture, paint mask, light mask), sharing one frame box per model
const byTeamModel = {};
for (const [model, M] of Object.entries(VM.TEAM_MODELS)) {
  const views = [];
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (let f = 0; f < M.facings; f++) for (let t = 0; t < M.frames; t++) {
    const b = VM.teamView(model, f, t, 'base');
    views.push({ name: `${model}_any_f${f}_t${t}`, svg: b.svg, svgR: VM.teamView(model, f, t, 'R').svg, svgG: VM.teamView(model, f, t, 'G').svg });
    bb = [Math.min(bb[0], b.bbox[0]), Math.min(bb[1], b.bbox[1]), Math.max(bb[2], b.bbox[2]), Math.max(bb[3], b.bbox[3])];
  }
  const vb = [bb[0] - 1, bb[1] - 1, bb[2] - bb[0] + 2, bb[3] - bb[1] + 2];
  byTeamModel[model] = views.map((v) => ({ ...v, vb, anchor: { x: -vb[0] / vb[2], y: -vb[1] / vb[3] } }));
}

// VectorUnit models: real colours can't be swapped for marker colours inside that engine, so each view is drawn
// three times (A grey paint + white lights, B no paint + white lights, C no paint + no lights). Paint and lights
// change every pixel linearly, so the mask is exact:  paint part a = (A − B) / grey,  light part c = B − C.
const byUnitModel = {};
for (const [model, M] of Object.entries(UM.MODELS)) {
  const views = [];
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (let f = 0; f < UM.META.facings; f++) for (let t = 0; t < M.frames; t++) {
    const v = M.teamless ? UM.view(model, f, t) : UM.bakeViews(model, f, t);
    views.push({ name: `${model}_any_f${f}_t${t}`, svg: v.svg || v.svgA, svgA: v.svgA, svgB: v.svgB, svgC: v.svgC });
    bb = [Math.min(bb[0], v.bbox[0]), Math.min(bb[1], v.bbox[1]), Math.max(bb[2], v.bbox[2]), Math.max(bb[3], v.bbox[3])];
  }
  const vb = [bb[0] - 0.5, bb[1] - 0.5, bb[2] - bb[0] + 1, bb[3] - bb[1] + 1];
  byUnitModel[model] = views.map((v) => ({ ...v, vb, anchor: { x: -vb[0] / vb[2], y: -vb[1] / vb[3] } }));
}
console.log(`unit views ready in ${Date.now() - t0} ms`);

const renderRaw = async (svgBody, W, H) => {
  const png = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svgBody}</svg>`, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render().asPng();
  return { png, raw: await sharp(png).ensureAlpha().raw().toBuffer() };
};

async function bakeGroup(group, SCALE) {
  const base = group.models.flatMap((m) => (group.unit ? byUnitModel[m] : group.teamMask ? byTeamModel[m] : byModel[m].filter((v) => !group.teams || group.teams.includes(v.team))));
  const frames = base.map((f) => ({ ...f, w: Math.ceil(f.vb[2] * SCALE), h: Math.ceil(f.vb[3] * SCALE) }));
  // atlas width: smallest power of two that keeps the sheet roughly square (max 4096)
  const area = frames.reduce((a, f) => a + (f.w + PAD) * (f.h + PAD), 0);
  let ATLAS_W = 256; while (ATLAS_W < 4096 && ATLAS_W * ATLAS_W < area * 1.15) ATLAS_W *= 2;
  ATLAS_W = Math.max(ATLAS_W, Math.max(...frames.map((f) => f.w)) + 2 * PAD);
  // shelf packing
  let x = PAD, y = PAD, rowH = 0;
  frames.sort((a, b) => b.h - a.h);
  for (const f of frames) {
    if (x + f.w + PAD > ATLAS_W) { x = PAD; y += rowH + PAD; rowH = 0; }
    f.x = x; f.y = y; x += f.w + PAD; rowH = Math.max(rowH, f.h);
  }
  const ATLAS_H = y + rowH + PAD;
  if (ATLAS_H > 4096) console.warn(`  ! ${group.name}@${SCALE}x is ${ATLAS_H}px tall (> 4096): split this group further`);
  // one SVG containing every frame, rasterised in one pass
  const atlasBody = (key) => frames.map((f) => `<svg x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" viewBox="${f.vb.join(' ')}">${f[key]}</svg>`).join('');
  let png, img;
  if (!group.teamMask) {
    png = (await renderRaw(atlasBody('svg'), ATLAS_W, ATLAS_H)).png;
    img = await sharp(png).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
  } else if (group.derive) {
        const rA = await renderRaw(atlasBody('svgA'), ATLAS_W, ATLAS_H), rB = await renderRaw(atlasBody('svgB'), ATLAS_W, ATLAS_H), rC = await renderRaw(atlasBody('svgC'), ATLAS_W, ATLAS_H);
    const N = ATLAS_W * ATLAS_H * 4, out = Buffer.alloc(N * 2), G = 1.1087, REF = UM.PAINT_REF; // G = the shader's paint gain
    for (let i = 0; i < N; i += 4) {
      const al = rA.raw[i + 3];
      out[i + 3] = al; out[N + i + 3] = 255;
      if (!al) continue;
      let rs = 0, gs = 0, n = 0;
      for (let k = 0; k < 3; k++) {
        const a = (rA.raw[i + k] - rB.raw[i + k]) / REF, b = rB.raw[i + k], c = rB.raw[i + k] - rC.raw[i + k];
        const base = Math.min(255, Math.max(0, a / G + b));             // picture with the paint at the shader's grey (1 / G)
        out[i + k] = Math.round(base);
        if (base > 3) { rs += a / G / base; gs += c / base; n++; }
      }
      out[N + i] = n ? Math.round(255 * Math.min(1, Math.max(0, rs / n))) : 0;
      out[N + i + 1] = n ? Math.round(255 * Math.min(1, Math.max(0, gs / n))) : 0;
    }
    png = await sharp(out, { raw: { width: ATLAS_W, height: ATLAS_H * 2, channels: 4 } }).png().toBuffer();
    img = await sharp(out, { raw: { width: ATLAS_W, height: ATLAS_H * 2, channels: 4 } }).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
  } else {
    // picture on top, mask below (same layout, so the mask of any pixel is exactly half the texture lower)
    const [b, r, g] = await Promise.all([renderRaw(atlasBody('svg'), ATLAS_W, ATLAS_H), renderRaw(atlasBody('svgR'), ATLAS_W, ATLAS_H), renderRaw(atlasBody('svgG'), ATLAS_W, ATLAS_H)]);
    const out = Buffer.alloc(ATLAS_W * ATLAS_H * 2 * 4);
    b.raw.copy(out, 0);
    for (let i = 0, o = ATLAS_W * ATLAS_H * 4; i < ATLAS_W * ATLAS_H * 4; i += 4, o += 4) {
      const a = b.raw[i + 3];                          // mask only where the picture has pixels
      out[o] = a ? r.raw[i] : 0; out[o + 1] = a ? g.raw[i] : 0; out[o + 2] = 0; out[o + 3] = 255;
    }
    png = await sharp(out, { raw: { width: ATLAS_W, height: ATLAS_H * 2, channels: 4 } }).png().toBuffer();
    img = await sharp(out, { raw: { width: ATLAS_W, height: ATLAS_H * 2, channels: 4 } }).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
  }
  if (process.env.VERIFY) { // decode both and compare every pixel
    const [A, B] = await Promise.all([sharp(png).ensureAlpha().raw().toBuffer(), sharp(img).ensureAlpha().raw().toBuffer()]);
    let diff = 0; for (let i = 0; i < A.length; i += 4) if (A[i + 3] !== B[i + 3] || (A[i + 3] && (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]))) diff++;
    console.log(`    verify ${group.name}@${SCALE}x: ${diff} different pixels of ${A.length / 4} · PNG ${Math.round(png.length / 1024)} KB → WebP ${Math.round(img.length / 1024)} KB`);
  }
  const file = `${group.name}@${SCALE}x`;
  const json = {
    frames: Object.fromEntries(frames.map((f) => [f.name, {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h },
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, anchor: f.anchor,
    }])),
    meta: { app: 'state-of-war bake.cjs', image: `${file}.webp`, format: 'RGBA8888', size: { w: ATLAS_W, h: group.teamMask ? ATLAS_H * 2 : ATLAS_H }, scale: String(SCALE), teamMask: !!group.teamMask },
  };
  fs.writeFileSync(path.join(OUT, `${file}.webp`), img);
  fs.writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(json));
  console.log(`  ${file.padEnd(22)} ${String(frames.length).padStart(4)} frames  ${ATLAS_W}×${ATLAS_H}  ${(img.length / 1024).toFixed(0).padStart(5)} KB`);
  return { file, frames: frames.length, w: ATLAS_W, h: group.teamMask ? ATLAS_H * 2 : ATLAS_H, kb: Math.round(img.length / 1024) };
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^(atlas|buildings|tank).*\.(png|webp|json)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
(async () => {
const manifest = { scales: SCALES, format: 'webp', groups: {}, units: { tank: UM.META } };
for (const g of GROUPS) {
  manifest.groups[g.name] = { models: g.models, teams: g.teams || null, teamMask: !!g.teamMask, files: {} };
  for (const s of SCALES) manifest.groups[g.name].files[s] = await bakeGroup(g, s);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const total = Object.values(manifest.groups).reduce((a, g) => a + Object.values(g.files).reduce((b, f) => b + f.kb, 0), 0);
console.log(`done in ${Date.now() - t0} ms → ${OUT}/manifest.json · all sheets ${total} KB (WebP lossless)`);
})();
