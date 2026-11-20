#!/usr/bin/env node
/* Bake the effects sheet (the "fx" group): flipbook flames, explosions and muzzle flashes, plus the soft shapes the particles
 * use (smoke puff, scorch, debris, glow, ring, spark, beam, dot, rocket, shell). Approved design: ../../tank-fx-design.md.
 *
 *   node tools/bake_fx.cjs [out dir]          (default: ../sheets, next to tanks.json)
 *
 * Writes fx@4x.webp, fx@2x.webp, fx@1x.webp (WebP lossless) and fx.json. Everything is computed from noise formulas, no
 * image files go in. Each frame is rendered at @4x, trimmed to its visible pixels (on a 4 px grid, so the smaller sheets
 * line up exactly) and reduced to @2x and @1x by averaging blocks of pixels (the colour weighted by its alpha).
 *
 * Needs the "sharp" package to write WebP: run "npm install" once in tools/sprite-pipeline at the repo root.
 *
 * fx.json: frames[res][name] = [sheet index, x, y, w, h, anchorX, anchorY, fullW, fullH].
 *   x, y, w, h: the trimmed picture in the sheet. fullW, fullH: the size of the untrimmed frame; an effect of size S on screen
 *   is drawn so that fullW covers S. anchorX, anchorY: where the middle of the untrimmed frame lies, measured from the top
 *   left of the trimmed picture (so every frame of one flipbook stays in place). anims: the flipbooks (frame names in order,
 *   whether they loop, and how they are blended).
 */
const fs = require('fs'), path = require('path');
const { createRequire } = require('module');
let sharp;
try { sharp = createRequire(path.resolve(__dirname, '../../../../tools/sprite-pipeline') + path.sep)('sharp'); }
catch (e) { console.error('The sharp package is missing. Run "npm install" in tools/sprite-pipeline, then run this again.'); process.exit(1); }
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'sheets'));
const K = 2;                                              // frame sizes below are the @2x sizes; they are rendered at @4x
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

(async () => {
  // ---- noise (the same formulas as tools/sprite-pipeline/fx.cjs)
  function makeNoise(seed) {
    const p = new Uint8Array(512); let s = seed >>> 0;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = (t) => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
    const h = (x, y, z) => p[(p[(p[x & 255] + y) & 255] + z) & 255] / 255;
    const v3 = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
      const c = (dx, dy, dz) => h(xi + dx, yi + dy, zi + dz);
      return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
        lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
    };
    return (x, y, z = 0, oct = 4) => { let a = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { a += amp * v3(x * f, y * f, z * f + o * 17.3); n += amp; amp *= 0.5; f *= 2; } return a / n; };
  }
  function loopNoise(fbm, x, y, phase, speed) {           // a noise field that scrolls and repeats without a jump
    const a = fbm(x, y + phase * speed), b = fbm(x, y + (phase - 1) * speed), w = phase;
    const m = (1 - w) * a + w * b, k = Math.sqrt((1 - w) * (1 - w) + w * w);
    return 0.5 + (m - 0.5) / k;
  }
  // heat (0..1) -> colour. Fire: dark red edge, orange body, yellow-white core. Energy: the Special weapons' cyan.
  const FIRE = [[0, [90, 12, 2, 0]], [0.12, [170, 35, 6, 120]], [0.32, [235, 100, 18, 215]], [0.55, [255, 170, 45, 250]], [0.8, [255, 228, 140, 255]], [1, [255, 252, 225, 255]]];
  const CYAN = [[0, [0, 30, 70, 0]], [0.12, [0, 70, 140, 120]], [0.32, [20, 150, 220, 215]], [0.55, [70, 212, 255, 250]], [0.8, [180, 240, 255, 255]], [1, [236, 252, 255, 255]]];
  const ZERO = [0, 0, 0, 0];
  const ramp = (stops) => (h) => {
    if (h <= 0) return ZERO;
    if (h >= 1) return stops[stops.length - 1][1];
    for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) {
      const [h0, c0] = stops[i - 1], [h1, c1] = stops[i], t = (h - h0) / (h1 - h0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, c0[3] + (c1[3] - c0[3]) * t];
    }
    return ZERO;
  };
  const fire = ramp(FIRE), cyan = ramp(CYAN);

  // ---- the picture: every frame is computed pixel by pixel, then packed into one canvas
  const items = [];
  const gen = (name, W0, H0, fn) => {                     // W0 x H0 is the @2x size; the frame is rendered at @4x
    const W = W0 * K, H = H0 * K, px = new Uint8ClampedArray(W * H * 4); let i = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = fn((x + 0.5) / W, (y + 0.5) / H); px[i++] = c[0]; px[i++] = c[1]; px[i++] = c[2]; px[i++] = c[3]; }
    items.push({ name, W, H, px });
  };
  const white = (a, g = 255) => [g, g, g, clamp01(a) * 255];
  for (let v = 0; v < 3; v++) {                            // flames: 3 looks x 16 frames, looping
    const fbm = makeNoise(101 + v * 31), fbm2 = makeNoise(707 + v * 13), width = [0.78, 0.66, 0.9][v];
    for (let f = 0; f < 16; f++) {
      const p = f / 16;
      gen(`flame${v}_${f}`, 48, 80, (fx, fy) => {
        const u = fx * 2 - 1, vv0 = 1 - fy / 0.94;
        if (vv0 < -0.04) return ZERO;
        const n1 = loopNoise(fbm, u * 2.2, vv0 * 2.6, p, 2.4), n2 = loopNoise(fbm2, u * 4.6 + 9, vv0 * 5.2, p, 4.2), vv = Math.max(0, vv0);
        const uu = u + (n1 - 0.5) * 0.95 * vv, w = width * Math.pow(1 - Math.min(vv, 0.999), 0.55) + 0.03, d = Math.abs(uu) / w;
        return fire(((1 - d * d) * (1 - Math.pow(vv, 1.3)) * 1.3 + (n2 - 0.5) * 1.25 * (0.2 + vv) - 0.14) * smooth(-0.04, 0.06, vv0));
      });
    }
  }
  const genExplosion = (name, S, F, big, seed, col) => {
    const fbm = makeNoise(seed);
    for (let f = 0; f < F; f++) {
      const t = f / (F - 1);
      gen(name + f, S, S, (fx, fy) => {
        const x = fx * 2 - 1, y = fy * 2 - 1 + 0.24 * t;
        const r = 0.16 + 0.74 * (1 - Math.pow(1 - t, 2.4)), dist = Math.hypot(x, y * 1.08);
        const n = fbm(x * 3.2 + 3, y * 3.2 - t * 2.2, t * 1.5);
        let heat = (1 - dist / r + (n - 0.5) * 0.75) * 1.5 * (1.18 - t);
        heat += (big ? 0.35 : 0.2) * Math.max(0, 0.3 - t) / 0.3 * (1 - dist / r);
        return col(heat * (1 - smooth(0.72, 1, t)));
      });
    }
  };
  genExplosion('boom', 160, 24, true, 4242, fire);          // big fireball (tank destroyed, artillery)
  genExplosion('pop', 72, 12, false, 9191, fire);           // small hit
  genExplosion('cpop', 72, 12, false, 5151, cyan);          // energy hit
  const genMuzzle = (name, col) => {
    for (let f = 0; f < 6; f++) {
      const fbm = makeNoise(3131 + f * 7), t = f / 5;
      gen(name + f, 56, 32, (fx, fy) => {
        const x = fx, y = fy * 2 - 1, len = 0.95 - t * 0.45, w = Math.pow(Math.max(0, 1 - x / len), 0.8) * (0.8 - t * 0.35) + 0.02;
        let heat = x < len ? (1 - Math.abs(y) / w) * (1.35 - t * 0.9) + (fbm(x * 7, y * 3.5, f) - 0.5) * 0.7 : 0;
        heat = Math.max(heat, Math.exp(-Math.pow((x - 0.14) / 0.14, 2)) * Math.exp(-Math.pow(y / 0.55, 2)) * (1.1 - t) * 0.9);
        return col(heat * (1 - smooth(0.7, 1, t)));
      });
    }
  };
  genMuzzle('muz', fire); genMuzzle('cmuz', cyan);
  const nz = makeNoise(77), nz2 = makeNoise(913);
  const rad = (u, v) => Math.hypot(u * 2 - 1, v * 2 - 1);
  for (let i = 0; i < 4; i++) gen('smoke' + i, 96, 96, (u, v) => {     // smoke puffs: white, coloured when drawn
    const n = nz(u * 3.2 + i * 7.3, v * 3.2, i * 3.1), n2 = nz2(u * 6 + i, v * 6, i);
    return white(smooth(0, 0.55, 1 - rad(u, v) * 1.08 + (n - 0.5) * 0.9) * (0.5 + 0.5 * n2), 205 + 50 * n);
  });
  for (let i = 0; i < 2; i++) gen('scorch' + i, 128, 128, (u, v) => {
    const n = nz(u * 4 + i * 11, v * 4, 5 + i), n2 = nz2(u * 9, v * 9, i);
    return white(smooth(0, 0.6, 1 - rad(u, v) * 1.05 + (n - 0.5) * 0.8) * (0.55 + 0.45 * n2));
  });
  for (let i = 0; i < 3; i++) gen('debris' + i, 16, 16, (u, v) => {
    const n = nz(u * 3 + i * 5, v * 3, 9 + i);
    return rad(u, v) + (n - 0.5) * 0.9 < 0.6 ? white(1, 150 + 105 * n) : ZERO;
  });
  gen('glow', 64, 64, (u, v) => white(Math.pow(Math.max(0, 1 - rad(u, v)), 2)));
  gen('ring', 128, 128, (u, v) => white(Math.exp(-Math.pow((rad(u, v) - 0.82) / 0.07, 2))));
  gen('spark', 32, 8, (u, v) => white(Math.exp(-Math.pow((v * 2 - 1) / 0.45, 2)) * smooth(0, 0.75, u) * (1 - smooth(0.8, 1, u))));
  // a beam, stretched between its two ends: soft across, and it narrows and fades over the last part of each end so it never stops in a flat cut
  gen('beam', 64, 32, (u, v) => { const e = smooth(0, 0.07, Math.min(u, 1 - u)); return white(Math.exp(-Math.pow((v * 2 - 1) / (0.42 * (0.35 + 0.65 * e)), 2)) * e); });
  // a rocket and an artillery shell, seen from the side, nose to the right (drawn in their own colours, turned along their flight)
  const body = (W, H, half, colour) => (u, v) => { const y = v * 2 - 1, w = half(u), a = clamp01((w - Math.abs(y)) * H * K * 0.5); if (a <= 0) return ZERO; const c = colour(u, y); return [c[0], c[1], c[2], a * 255]; };
  gen('rocket', 40, 10, body(40, 10, (u) => (u < 0.16 ? 1 : u > 0.76 ? 0.08 + 0.5 * (1 - u) / 0.24 : 0.58),
    (u, y) => { const l = 1 - y * 0.25; return u < 0.16 ? [70 * l, 74 * l, 80 * l] : u > 0.76 ? [176 * l, 60 * l, 48 * l] : u > 0.44 && u < 0.5 ? [60, 64, 70] : [214 * l, 216 * l, 220 * l]; }));
  gen('shell', 32, 12, body(32, 12, (u) => (u < 0.07 ? 0.62 : u > 0.5 ? 0.82 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) / 0.5, 2))) : 0.82),
    (u, y) => { const l = 1 - y * 0.35; return u > 0.1 && u < 0.2 ? [176 * l, 112 * l, 58 * l] : [86 * l, 90 * l, 98 * l]; }));
  gen('dot', 16, 16, (u, v) => white(1 - smooth(0.5, 0.95, rad(u, v))));


  // ---- trim every frame to its visible pixels, on a 4 px grid
  for (const it of items) {
    let x0 = it.W, y0 = it.H, x1 = -1, y1 = -1;
    for (let y = 0; y < it.H; y++) for (let x = 0; x < it.W; x++) if (it.px[(y * it.W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 3; }                // an empty frame (the end of a fade) keeps a blank 4 x 4
    x0 = Math.floor(x0 / 4) * 4; y0 = Math.floor(y0 / 4) * 4; x1 = Math.ceil((x1 + 1) / 4) * 4; y1 = Math.ceil((y1 + 1) / 4) * 4;
    it.tx = x0; it.ty = y0; it.tw = x1 - x0; it.th = y1 - y0;
  }
  // ---- place them in rows, tallest first (positions at @4x, all multiples of 4)
  const PAD = 8, area = items.reduce((a, it) => a + (it.tw + PAD) * (it.th + PAD), 0);
  let AW = 512; while (AW < 4096 && AW * AW < area * 1.2) AW *= 2;
  const order = items.slice().sort((a, b) => b.th - a.th); let px = PAD, py = PAD, rowH = 0;
  for (const it of order) { if (px + it.tw + PAD > AW) { px = PAD; py += rowH + PAD; rowH = 0; } it.x = px; it.y = py; px += it.tw + PAD; rowH = Math.max(rowH, it.th); }
  const AH = Math.ceil((py + rowH + PAD) / 4) * 4;
  if (AH > 4096) throw new Error('the fx sheet is taller than 4096 px at @4x: split it');
  const big = new Uint8ClampedArray(AW * AH * 4);
  for (const it of items) for (let r = 0; r < it.th; r++) { const s = ((it.ty + r) * it.W + it.tx) * 4; big.set(it.px.subarray(s, s + it.tw * 4), ((it.y + r) * AW + it.x) * 4); }
  // ---- smaller sheets: average n x n blocks, the colour weighted by its alpha
  function reduce(src, w, h, n) {
    const W = w / n, H = h / n, out = new Uint8ClampedArray(W * H * 4), m = n * n;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const o = ((y * n + j) * w + x * n + i) * 4, al = src[o + 3]; r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al; r0 += src[o]; g0 += src[o + 1]; b0 += src[o + 2]; }
      const o = (y * W + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; } else { out[o] = r0 / m; out[o + 1] = g0 / m; out[o + 2] = b0 / m; }
      out[o + 3] = a / m;
    }
    return out;
  }
  const names = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + i);
  const anims = {
    flame0: { frames: names('flame0_', 16), loop: true, blend: 'add' }, flame1: { frames: names('flame1_', 16), loop: true, blend: 'add' }, flame2: { frames: names('flame2_', 16), loop: true, blend: 'add' },
    boom: { frames: names('boom', 24), loop: false, blend: 'add' }, pop: { frames: names('pop', 12), loop: false, blend: 'add' }, cpop: { frames: names('cpop', 12), loop: false, blend: 'add' },
    muz: { frames: names('muz', 6), loop: false, blend: 'add' }, cmuz: { frames: names('cmuz', 6), loop: false, blend: 'add' },
    smoke: { frames: names('smoke', 4), variants: true, blend: 'normal', tint: true }, scorch: { frames: names('scorch', 2), variants: true, blend: 'normal', tint: true },
    debris: { frames: names('debris', 3), variants: true, blend: 'normal', tint: true },
  };
  const json = { version: 1, group: 'fx', resolutions: { '4x': { scale: 4 }, '2x': { scale: 2 }, '1x': { scale: 1 } }, sheets: {}, frames: {}, anims,
    shapes: { glow: { tint: true }, ring: { tint: true }, spark: { tint: true }, beam: { tint: true }, dot: { tint: true }, rocket: {}, shell: {} },
    note: 'frames[res][name] = [sheet index, x, y, w, h, anchorX, anchorY, fullW, fullH]. x, y, w, h: the trimmed picture in the sheet. fullW, fullH: the untrimmed frame; an effect of size S is drawn so that fullW covers S. anchorX, anchorY: the middle of the untrimmed frame, from the top left of the trimmed picture. anims: flipbooks (loop: play round and round; variants: pick one). blend add = additive (it glows), normal = smoke and marks. tint: the picture is white and is coloured when drawn. A flame stands on its base, which is at 94% of fullH. Muzzle flashes point to the right from the left edge.' };
  fs.mkdirSync(OUT, { recursive: true });
  for (const [res, n] of [['4x', 1], ['2x', 2], ['1x', 4]]) {
    const w = AW / n, h = AH / n, data = n === 1 ? big : reduce(big, AW, AH, n), file = 'fx@' + res + '.webp';
    const buf = await sharp(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width: w, height: h, channels: 4 } }).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
    fs.writeFileSync(path.join(OUT, file), buf);
    json.sheets[res] = [{ file, group: 'fx', w, h }];
    json.frames[res] = Object.fromEntries(items.map((it) => [it.name, [0, it.x / n, it.y / n, it.tw / n, it.th / n, (it.W / 2 - it.tx) / n, (it.H / 2 - it.ty) / n, it.W / n, it.H / n]]));
    console.log(file.padEnd(14), String(items.length).padStart(4), 'frames', (w + ' x ' + h).padStart(12), String(Math.round(buf.length / 1024)).padStart(6), 'KB');
  }
  fs.writeFileSync(path.join(OUT, 'fx.json'), JSON.stringify(json));
  console.log('wrote', path.join(OUT, 'fx.json'));
})().catch((e) => { console.error(e); process.exit(1); });
