#!/usr/bin/env node
/* Procedural effects sheet: flame loops, explosions and a muzzle flash, generated with noise
 * (no image tools, no AI images), packed into  dist/atlas/fx@1x|2x|4x.webp + .json  and added
 * to manifest.json. Run after bake.cjs:   node bake.cjs && node fx.cjs
 *
 * Frame names:  fxFlame_v<variant>_<frame> · fxExplosionBig_<frame> · fxExplosionSmall_<frame> · fxMuzzle_<frame>
 * Effects are drawn with additive blending in the game (they glow), so dark = transparent.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = 'dist/atlas';
const BASE = 4;                 // render at @4x (pixels per world unit), then downscale for @2x and @1x
const SCALES = [1, 2, 4];
const PAD = 8;                  // padding at @4x (2 px at @1x) so downscaling never bleeds between frames

// ---------- noise ----------
function makeNoise(seed) {
  const p = new Uint8Array(512); let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => p[(p[(p[x & 255] + y) & 255] + z) & 255] / 255;
  const v3 = (x, y, z) => { // value noise 0..1
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    const c = (dx, dy, dz) => h(xi + dx, yi + dy, zi + dz);
    return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
  };
  return (x, y, z = 0, oct = 4) => { let a = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { a += amp * v3(x * f, y * f, z * f + o * 17.3); n += amp; amp *= 0.5; f *= 2; } return a / n; };
}
// seamless loop: cross-fade two scrolling noise fields (variance-corrected)
function loopNoise(fbm, x, y, phase, speed) {
  const a = fbm(x, y + phase * speed), b = fbm(x, y + (phase - 1) * speed), w = phase;
  const m = (1 - w) * a + w * b, k = Math.sqrt((1 - w) * (1 - w) + w * w);
  return 0.5 + (m - 0.5) / k;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// heat (0..1+) → RGBA. Dark red edges, orange body, yellow-white core.
const STOPS = [[0, [90, 12, 2, 0]], [0.12, [170, 35, 6, 120]], [0.32, [235, 100, 18, 215]], [0.55, [255, 170, 45, 250]], [0.8, [255, 228, 140, 255]], [1, [255, 252, 225, 255]]];
function ramp(h) {
  if (h <= 0) return [0, 0, 0, 0];
  if (h >= 1) return STOPS[STOPS.length - 1][1];
  for (let i = 1; i < STOPS.length; i++) if (h <= STOPS[i][0]) {
    const [h0, c0] = STOPS[i - 1], [h1, c1] = STOPS[i], t = (h - h0) / (h1 - h0);
    return c0.map((v, k) => v + (c1[k] - v) * t);
  }
}

// ---------- effect generators (sizes in world units; pixels = units × BASE) ----------
function frame(wu, hu, anchor, fn) {
  const W = Math.ceil((wu * BASE) / 4) * 4, H = Math.ceil((hu * BASE) / 4) * 4; // multiples of 4 → clean downscale
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b, a] = ramp(fn((x + 0.5) / W, (y + 0.5) / H));
    const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  return { W, H, px, anchor };
}

function flame(variant, f, F) {
  const fbm = makeNoise(101 + variant * 31), fbm2 = makeNoise(707 + variant * 13);
  const p = f / F, width = [0.78, 0.66, 0.9][variant];
  return frame(12, 20, { x: 0.5, y: 0.94 }, (fx, fy) => {
    const u = fx * 2 - 1, v = 1 - fy / 0.94;           // u: −1..1 across, v: 0 at the base … 1 at the tip
    if (v < -0.04) return 0;
    const n1 = loopNoise(fbm, u * 2.2, v * 2.6, p, 2.4), n2 = loopNoise(fbm2, u * 4.6 + 9, v * 5.2, p, 4.2);
    const vv = Math.max(0, v);
    const uu = u + (n1 - 0.5) * 0.95 * vv;                // flames sway more towards the tip
    const w = width * Math.pow(1 - Math.min(vv, 0.999), 0.55) + 0.03;
    const d = Math.abs(uu) / w;
    let heat = (1 - d * d) * (1 - Math.pow(vv, 1.3)) * 1.3 + (n2 - 0.5) * 1.25 * (0.2 + vv) - 0.14;
    heat *= smooth(-0.04, 0.06, v);                     // soft base
    return heat;
  });
}

function explosion(big, f, F) {
  const fbm = makeNoise(big ? 4242 : 9191), t = f / (F - 1), S = big ? 46 : 20;
  return frame(S, S, { x: 0.5, y: 0.62 }, (fx, fy) => {
    const x = fx * 2 - 1, y = fy * 2 - 1 + 0.24 * t;    // fireball rises as it grows
    const r = 0.16 + 0.74 * (1 - Math.pow(1 - t, 2.4)), dist = Math.hypot(x, y * 1.08);
    const n = fbm(x * 3.2 + 3, y * 3.2 - t * 2.2, t * 1.5);
    let heat = (1 - dist / r + (n - 0.5) * 0.75) * 1.5 * (1.18 - t * 1.0);
    heat += (big ? 0.35 : 0.2) * Math.max(0, 0.3 - t) / 0.3 * (1 - dist / r);   // white-hot first frames
    if (big && t < 0.4) {                                // shockwave ring
      const ringR = r * 1.18 + 0.05, ring = Math.exp(-Math.pow((dist - ringR) / 0.045, 2));
      heat = Math.max(heat, ring * 0.55 * (1 - t / 0.4));
    }
    return heat * (1 - smooth(0.72, 1, t));
  });
}

function muzzle(f, F) {
  const fbm = makeNoise(3131 + f * 7), t = f / (F - 1);
  return frame(14, 8, { x: 0.06, y: 0.5 }, (fx, fy) => {
    const x = fx, y = fy * 2 - 1;                        // x along the barrel (0 = muzzle), y across
    const len = 0.95 - t * 0.45, w = Math.pow(Math.max(0, 1 - x / len), 0.8) * (0.8 - t * 0.35) + 0.02;
    const n = fbm(x * 7, y * 3.5, f);
    let heat = x < len ? (1 - Math.abs(y) / w) * (1.35 - t * 0.9) + (n - 0.5) * 0.7 : 0;
    const star = Math.exp(-Math.pow((x - 0.14) / 0.14, 2)) * Math.exp(-Math.pow(y / 0.55, 2)) * (1.1 - t);  // round burst at the muzzle
    heat = Math.max(heat, star * 0.9);
    return heat * (1 - smooth(0.7, 1, t));
  });
}

// ---------- build all frames ----------
const t0 = Date.now(), frames = [];
for (let v = 0; v < 3; v++) for (let f = 0; f < 16; f++) frames.push({ name: `fxFlame_v${v}_${f}`, ...flame(v, f, 16) });
for (let f = 0; f < 24; f++) frames.push({ name: `fxExplosionBig_${f}`, ...explosion(true, f, 24) });
for (let f = 0; f < 12; f++) frames.push({ name: `fxExplosionSmall_${f}`, ...explosion(false, f, 12) });
for (let f = 0; f < 6; f++) frames.push({ name: `fxMuzzle_${f}`, ...muzzle(f, 6) });

// pack at @4x (positions on a 4-px grid so every scale lines up exactly)
const area = frames.reduce((a, f) => a + (f.W + PAD) * (f.H + PAD), 0);
let AW = 256; while (AW < 4096 && AW * AW < area * 1.15) AW *= 2;
let x = PAD, y = PAD, rowH = 0;
frames.sort((a, b) => b.H - a.H);
for (const f of frames) { if (x + f.W + PAD > AW) { x = PAD; y += rowH + PAD; rowH = 0; } f.x = x; f.y = y; x += f.W + PAD; rowH = Math.max(rowH, f.H); }
const AH = Math.ceil((y + rowH + PAD) / 4) * 4;
const atlas = Buffer.alloc(AW * AH * 4);
for (const f of frames) for (let r = 0; r < f.H; r++) f.px.copy(atlas, ((f.y + r) * AW + f.x) * 4, r * f.W * 4, (r + 1) * f.W * 4);

(async () => {
  const manifestPath = path.join(OUT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.groups.fx = { models: ['fxFlame', 'fxExplosionBig', 'fxExplosionSmall', 'fxMuzzle'], teams: null, files: {} };
  for (const S of SCALES) {
    const k = S / BASE, w = AW * k, h = AH * k;
    const img = await sharp(atlas, { raw: { width: AW, height: AH, channels: 4 } })
      .resize(w, h, { kernel: 'lanczos3' }).webp({ lossless: true, effort: 6, exact: true }).toBuffer();
    const file = `fx@${S}x`;
    const json = {
      frames: Object.fromEntries(frames.map((f) => [f.name, {
        frame: { x: f.x * k, y: f.y * k, w: f.W * k, h: f.H * k }, sourceSize: { w: f.W * k, h: f.H * k },
        spriteSourceSize: { x: 0, y: 0, w: f.W * k, h: f.H * k }, anchor: f.anchor,
      }])),
      meta: { app: 'state-of-war fx.cjs', image: `${file}.webp`, format: 'RGBA8888', size: { w, h }, scale: String(S) },
    };
    fs.writeFileSync(path.join(OUT, `${file}.webp`), img);
    fs.writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(json));
    manifest.groups.fx.files[S] = { file, frames: frames.length, w, h, kb: Math.round(img.length / 1024) };
    console.log(`  ${file.padEnd(22)} ${String(frames.length).padStart(4)} frames  ${w}×${h}  ${String(Math.round(img.length / 1024)).padStart(5)} KB`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`done in ${Date.now() - t0} ms`);
})();
