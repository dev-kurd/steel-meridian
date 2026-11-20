'use strict';
/* Tank demo: visual effects (mockup, see ../tank-fx-design.md).
 * - Flipbooks (flames, explosions, muzzle flash) use the same noise formulas as tools/sprite-pipeline/fx.cjs. Here they are
 *   made in the browser when the page loads; the game will read them from a baked `fx` sheet instead.
 * - Everything else is particles drawn with a few soft shapes from the same picture (smoke puff, glow, spark, ring, beam...).
 * - Three layers: decals (on the ground, under the shadows), smoke (normal blend, above the tanks), add (additive, on top).
 * - Positions are in metres (x, y on the ground, z up); cfg.proj(x, y, z) gives the screen position. */
window.createFx = function (PIXI, cfg) {
  const { proj, ppm, layers } = cfg, MAX = cfg.maxParticles || 3500, MAX_DECALS = 160;
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = (l) => l[(Math.random() * l.length) | 0];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ---- noise (as in fx.cjs)
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
  const gen = (name, W, H, fn) => {
    const px = new Uint8ClampedArray(W * H * 4); let i = 0;
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
  gen('beam', 8, 32, (u, v) => white(Math.exp(-Math.pow((v * 2 - 1) / 0.42, 2))));
  gen('dot', 16, 16, (u, v) => white(1 - smooth(0.5, 0.95, rad(u, v))));

  const AW = 2048, PAD = 2; let px = PAD, py = PAD, rowH = 0;
  items.sort((a, b) => b.H - a.H);
  for (const it of items) { if (px + it.W + PAD > AW) { px = PAD; py += rowH + PAD; rowH = 0; } it.x = px; it.y = py; px += it.W + PAD; rowH = Math.max(rowH, it.H); }
  const canvas = document.createElement('canvas'); canvas.width = AW; canvas.height = py + rowH + PAD;
  const c2 = canvas.getContext('2d');
  for (const it of items) c2.putImageData(new ImageData(it.px, it.W, it.H), it.x, it.y);
  const source = PIXI.Texture.from(canvas).source; source.scaleMode = 'linear';
  const tex = {};
  for (const it of items) tex[it.name] = new PIXI.Texture({ source, frame: new PIXI.Rectangle(it.x, it.y, it.W, it.H) });
  const seq = (name, n) => Array.from({ length: n }, (_, i) => tex[name + i]);
  const T = { flame: [0, 1, 2].map((v) => seq(`flame${v}_`, 16)), boom: seq('boom', 24), pop: seq('pop', 12), cpop: seq('cpop', 12), muz: seq('muz', 6), cmuz: seq('cmuz', 6),
    smoke: seq('smoke', 4), scorch: seq('scorch', 2), debris: seq('debris', 3), glow: tex.glow, ring: tex.ring, spark: tex.spark, beam: tex.beam, dot: tex.dot };

  // ---- particles
  const parts = [], beams = [], pools = { decal: [], smoke: [], add: [] }; let decals = 0;
  function sprite(layer) {
    let s = pools[layer].pop();
    if (!s) { s = new PIXI.Sprite(); if (layer === 'add') s.blendMode = 'add'; layers[layer].addChild(s); }
    s.visible = true; return s;
  }
  const mixC = (a, b, t) => (Math.round((a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * t) << 16) | (Math.round((a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * t) << 8) | Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
  function place(p) {
    const life = p.life === Infinity ? 0 : p.age / p.life, t = clamp01(life), e = 1 - (1 - t) * (1 - t), s = p.s;
    const tx = p.frames ? (p.fps ? p.frames[Math.floor(p.age * p.fps) % p.frames.length] : p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))]) : p.tex;
    if (s.texture !== tx) s.texture = tx;
    const size = p.s0 + (p.s1 - p.s0) * e, k = size * ppm / tx.frame.width, [sx, sy] = proj(p.x, p.y, p.z);
    s.position.set(sx, sy); s.scale.set(k * p.sx, p.flat ? k * 0.5 : k);
    s.alpha = p.a0 * (p.tin ? Math.min(1, t / p.tin) : 1) * (1 - smooth(p.tout, 1, t));
    s.tint = p.c1 == null ? p.c0 : mixC(p.c0, p.c1, t);
    if (p.streak) { const [vx, vy] = proj(p.vx, p.vy, p.vz); s.rotation = Math.atan2(vy, vx); } else s.rotation = p.rot;
  }
  // one particle. `must` ignores the particle limit (shells, explosions); `held` particles are moved by the caller.
  function spawn(layer, o) {
    if (parts.length >= MAX && !o.must) return null;
    if (layer === 'decal') { if (decals >= MAX_DECALS && !o.must) return null; decals++; }
    const p = Object.assign({ layer, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, life: 1, age: 0, s0: 1, s1: null, a0: 1, tin: 0, tout: 0.5, rot: 0, vr: 0,
      c0: 0xffffff, c1: null, flat: false, streak: false, bounce: false, ax: 0.5, ay: 0.5, sx: 1, frames: null, fps: 0, tex: null, held: false }, o);
    if (p.s1 == null) p.s1 = p.s0;
    p.s = sprite(layer); p.s.anchor.set(p.ax, p.ay); parts.push(p); place(p); return p;
  }
  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt;
      if (p.age >= p.life) { p.s.visible = false; pools[p.layer].push(p.s); if (p.layer === 'decal') decals--; parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      if (!p.held) {
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
        p.vz -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
        if (p.z < 0 && p.grav > 0) { p.z = 0; if (p.bounce) { p.vz = -p.vz * 0.35; p.vx *= 0.55; p.vy *= 0.55; p.vr *= 0.5; } else p.vx = p.vy = p.vz = 0; }
      }
      place(p);
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i]; b.age += dt;
      if (b.age >= b.life) { for (const s of [b.s1, b.s2]) { s.visible = false; pools.add.push(s); } beams.splice(i, 1); continue; }
      const t = b.age / b.life, [x0, y0] = proj(...b.p0), [x1, y1] = proj(...b.p1), len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
      const w = b.w * ppm * (b.hold ? 0.85 + 0.15 * Math.sin(b.age * 90) : 1 - t * 0.7), al = b.hold ? 1 - smooth(0.75, 1, t) : 1 - t * t;
      b.s1.position.set(x0, y0); b.s1.rotation = a; b.s1.scale.set(len / 8, w / 32); b.s1.alpha = al * 0.85; b.s1.tint = b.col;
      b.s2.position.set(x0, y0); b.s2.rotation = a; b.s2.scale.set(len / 8, w * 0.38 / 32); b.s2.alpha = al; b.s2.tint = 0xffffff;
    }
  }
  // a beam between two points: coloured outside, white core. o: w (metres), col, life, hold (steady, then a quick fade)
  function beam(p0, p1, o) {
    const b = { p0, p1, w: o.w, col: o.col, life: o.life, hold: !!o.hold, age: 0, s1: sprite('add'), s2: sprite('add') };
    for (const s of [b.s1, b.s2]) { s.texture = T.beam; s.anchor.set(0, 0.5); }
    beams.push(b); return b;
  }
  const sdir = (dx, dy, dz) => { const [x, y] = proj(dx, dy, dz); return [Math.atan2(y, x), Math.hypot(x, y) / ppm]; };
  const dir3 = (ang, elev) => [Math.cos(ang) * Math.cos(elev), Math.sin(ang) * Math.cos(elev), Math.sin(elev)];

  // ---- the effects
  function smoke(p, k, col, alpha, o) {
    return spawn('smoke', Object.assign({ tex: pick(T.smoke), x: p[0] + rnd(-0.1, 0.1), y: p[1] + rnd(-0.1, 0.1), z: p[2], vx: rnd(-0.25, 0.35), vy: rnd(-0.35, 0.25), vz: rnd(0.9, 1.7),
      drag: 0.35, life: rnd(1.3, 2.3), s0: 0.45 * k, s1: 2.1 * k, a0: alpha, tin: 0.12, tout: 0.35, c0: col, rot: rnd(0, TAU), vr: rnd(-0.6, 0.6) }, o));
  }
  function sparks(p, n, speed, col = 0xffd9a0) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), up = rnd(0.15, 1), h = Math.sqrt(1 - up * up) * speed * rnd(0.4, 1);
      spawn('add', { tex: T.spark, streak: true, x: p[0], y: p[1], z: p[2] + 0.05, vx: Math.cos(a) * h, vy: Math.sin(a) * h, vz: up * speed * rnd(0.5, 1), grav: 15, drag: 1.1, bounce: true,
        life: rnd(0.3, 0.75), s0: rnd(0.35, 0.75), s1: 0.2, c0: col, tout: 0.6 });
    }
  }
  function ember(p) {
    spawn('add', { tex: T.dot, x: p[0], y: p[1], z: p[2] + 0.3, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: rnd(1.2, 2.6), drag: 0.6, life: rnd(0.8, 1.6), s0: 0.12, s1: 0.05, c0: 0xffa040, tout: 0.5 });
  }
  function debris(p, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), h = speed * rnd(0.3, 1);
      spawn('smoke', { tex: pick(T.debris), x: p[0], y: p[1], z: p[2] + 0.2, vx: Math.cos(a) * h, vy: Math.sin(a) * h, vz: speed * rnd(0.7, 1.5), grav: 17, bounce: true, life: rnd(1, 1.9),
        s0: rnd(0.16, 0.38), c0: 0x26221f, tout: 0.8, rot: rnd(0, TAU), vr: rnd(-12, 12), must: true });
    }
  }
  function ring(p, size, col = 0xffe2b0, life = 0.45, from = 0.5) {
    spawn('add', { tex: T.ring, flat: true, x: p[0], y: p[1], z: p[2] || 0, s0: from, s1: size * 2, a0: 0.7, life, tout: 0.15, c0: col, must: true });
  }
  function scorch(p, size) { spawn('decal', { tex: pick(T.scorch), flat: true, x: p[0], y: p[1], z: 0, s0: size, a0: 0.42, c0: 0x1c1814, life: 26, tin: 0.004, tout: 0.6 }); }
  function dust(p, k) { smoke(p, k, 0x9c8e74, 0.2, { vz: rnd(0.3, 0.7), life: rnd(0.6, 1.1), s0: 0.4 * k, s1: 1.5 * k }); }
  function trail(p, k, col = 0xdcd8d0) { smoke(p, k, col, 0.5, { vz: rnd(-0.1, 0.3), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), life: rnd(0.6, 1.05), s0: 0.22 * k, s1: 0.95 * k, tin: 0.05 }); }

  // muzzle flash. kind: 'fire' (guns), 'rocket' (launch: flash and backblast smoke), 'cyan' (energy weapons)
  function muzzleFlash(p, ang, elev, k, kind = 'fire') {
    const d = dir3(ang, elev), [sa, sl] = sdir(...d), en = kind === 'cyan';
    spawn('add', { frames: en ? T.cmuz : T.muz, x: p[0], y: p[1], z: p[2], life: 0.13, s0: 2.7 * k, rot: sa, ax: 0.06, ay: 0.5, sx: Math.max(0.6, Math.min(1.25, sl / 1.1)), tout: 0.8, must: true });
    spawn('add', { tex: T.glow, x: p[0] + d[0] * 0.3 * k, y: p[1] + d[1] * 0.3 * k, z: p[2] + d[2] * 0.3 * k, life: 0.11, s0: 2.6 * k, s1: 3.4 * k, a0: 0.9, tout: 0.2, c0: en ? 0x9fe8ff : 0xffc878, must: true });
    if (en) return sparks(p, 3, 4, 0x9fe8ff);
    const back = kind === 'rocket' ? -1 : 1, n = Math.round(3 + 3 * k);
    for (let i = 0; i < n; i++) {
      const v = rnd(2, 7.5) * k * back;
      smoke(p, k, 0xc2bbae, 0.42, { vx: d[0] * v + rnd(-0.6, 0.6), vy: d[1] * v + rnd(-0.6, 0.6), vz: d[2] * v + rnd(0.1, 0.7), drag: 3.6, life: rnd(0.7, 1.4), s0: 0.32 * k, s1: 1.35 * k, tin: 0.04 });
    }
  }
  function impact(p, k) {                                   // a shell hits
    spawn('add', { frames: T.pop, x: p[0], y: p[1], z: p[2], life: 0.38, s0: 2.6 * k, s1: 3.1 * k, ay: 0.62, tout: 0.85, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2] + 0.2, life: 0.1, s0: 3.2 * k, c0: 0xffd090, a0: 0.8, tout: 0.2 });
    sparks(p, 7, 9); for (let i = 0; i < 2; i++) smoke(p, k * 0.8, 0x4a4540, 0.45); scorch(p, 1.5 * k);
  }
  function explosion(p, k) {                                // big fireball: a destroyed tank or an artillery shell
    spawn('add', { frames: T.boom, x: p[0], y: p[1], z: p[2], life: 0.85, s0: 6.2 * k, s1: 7.4 * k, ay: 0.62, tout: 0.9, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2] + 0.5, life: 0.22, s0: 4.5 * k, s1: 7 * k, c0: 0xffc880, a0: 0.55, tout: 0.1, must: true });
    ring([p[0], p[1], 0], 4.6 * k); sparks(p, 16, 13); debris(p, Math.round(5 + 4 * k), 6.5);
    for (let i = 0; i < 9; i++) smoke([p[0] + rnd(-0.7, 0.7) * k, p[1] + rnd(-0.7, 0.7) * k, p[2] + rnd(0, 0.8)], k * 1.25, 0x38332d, 0.45, { vz: rnd(1.4, 3.6), life: rnd(1.6, 3), tin: 0.2, must: true });
    scorch(p, 3.6 * k);
  }
  function airburst(p, k) {                                 // a rocket bursts in the air
    spawn('add', { frames: T.pop, x: p[0], y: p[1], z: p[2], life: 0.34, s0: 3 * k, ay: 0.5, tout: 0.85, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.1, s0: 4 * k, c0: 0xffe0b0, tout: 0.2 });
    for (let i = 0; i < 6; i++) { const a = rnd(0, TAU), v = rnd(0.8, 3); smoke(p, k, 0x5e5a54, 0.55, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(-1, 1.6), drag: 3.5, life: rnd(1.2, 2.1), s0: 0.5 * k, s1: 1.9 * k, tin: 0.05 }); }
    sparks(p, 6, 8);
  }
  // one moment of a flamer's jet (call every frame while it fires). The stream is soft puffs that grow and cool from
  // yellow to dark red, with black smoke at the far end.
  function flameJet(p, ang, range, dt, k) {
    const n = Math.floor(75 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = ang + rnd(-0.085, 0.085), v = range / 0.344 * rnd(0.85, 1.1), life = rnd(0.42, 0.58);
      spawn('add', { tex: pick(T.smoke), x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: -p[2] / 0.4 + rnd(0.2, 1.6), drag: 1.6, life, s0: 0.28 * k, s1: 2 * k,
        a0: 0.5, c0: 0xfff2b8, c1: 0xb82406, tin: 0.04, tout: 0.45, rot: rnd(0, TAU), vr: rnd(-3, 3) });
      if (Math.random() < 0.14) spawn('smoke', { tex: pick(T.smoke), x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * v * 0.85, vy: Math.sin(a) * v * 0.85, vz: rnd(0.8, 2.4), drag: 1.5, life: rnd(1, 1.6),
        s0: 0.3 * k, s1: 2.6 * k, a0: 0.34, c0: 0x1a1816, tin: 0.45, tout: 0.6, rot: rnd(0, TAU), vr: rnd(-1, 1) });
    }
    spawn('add', { tex: T.glow, x: p[0] + Math.cos(ang) * 0.2, y: p[1] + Math.sin(ang) * 0.2, z: p[2], life: 0.07, s0: 1.1 * k, c0: 0xffe6a0, a0: 0.8, tout: 0.3 });
  }
  function groundFire(p, life, k) {                         // a patch of ground left burning
    spawn('add', { frames: pick(T.flame), fps: 18, x: p[0], y: p[1], z: 0, life, s0: 1.15 * k, s1: 0.8 * k, ay: 0.94, tin: 0.12, tout: 0.6, a0: 0.9 });
    scorch(p, 1.6 * k);
  }
  const fireOn = (k) => spawn('add', { frames: pick(T.flame), fps: 16, life: Infinity, held: true, s0: 0.95 * k, ay: 0.94, a0: 0.85, must: true });   // flame carried by a burning tank
  function chargeIn(p, k) {                                 // energy gathering at a muzzle (call every frame while charging)
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, TAU), b = rnd(-0.6, 0.9), r = rnd(0.7, 1.3) * k, q = [Math.cos(a) * Math.cos(b) * r, Math.sin(a) * Math.cos(b) * r, Math.sin(b) * r];
      spawn('add', { tex: T.spark, streak: true, x: p[0] + q[0], y: p[1] + q[1], z: p[2] + q[2], vx: -q[0] / 0.22, vy: -q[1] / 0.22, vz: -q[2] / 0.22, life: 0.22, s0: 0.5, s1: 0.2, c0: 0x8fe9ff, tin: 0.3, tout: 0.9 });
    }
  }
  function energyHit(p, k) {
    spawn('add', { frames: T.cpop, x: p[0], y: p[1], z: p[2], life: 0.32, s0: 2.2 * k, s1: 2.8 * k, ay: 0.55, tout: 0.85, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.14, s0: 2.6 * k, c0: 0x9fe8ff, tout: 0.2 });
    sparks(p, Math.round(4 * k), 7, 0x9fe8ff); scorch(p, 1.1 * k);
  }
  function implosion(p, R) {                                // Graviton, first half: everything is pulled to one point
    for (let i = 0; i < 30; i++) {
      const a = rnd(0, TAU), b = rnd(-0.2, 1.2), r = R * rnd(0.7, 1.1), q = [Math.cos(a) * Math.cos(b) * r, Math.sin(a) * Math.cos(b) * r, Math.sin(b) * r * 0.7];
      spawn('add', { tex: T.spark, streak: true, x: p[0] + q[0], y: p[1] + q[1], z: p[2] + q[2], vx: -q[0] / 0.42, vy: -q[1] / 0.42, vz: -q[2] / 0.42, life: 0.42, s0: 0.9, s1: 0.25, c0: 0x7fe6ff, tin: 0.25, tout: 0.92, must: true });
    }
    spawn('smoke', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.47, s0: 0.6, s1: R * 1.5, c0: 0x000000, a0: 0.9, tout: 0.9, must: true });
    spawn('add', { tex: T.ring, flat: true, x: p[0], y: p[1], z: 0, life: 0.42, s0: R * 2.4, s1: 0.5, c0: 0x66dcff, a0: 0.6, tin: 0.35, tout: 0.9, must: true });
  }
  function gravBlast(p, R) {                                // Graviton, second half: the blast
    spawn('add', { frames: T.cpop, x: p[0], y: p[1], z: p[2], life: 0.6, s0: R * 2.2, s1: R * 2.9, ay: 0.55, tout: 0.85, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2] + 0.5, life: 0.28, s0: R * 4, s1: R * 5, c0: 0xbff4ff, tout: 0.15, must: true });
    ring(p, R * 1.25, 0x8fe9ff, 0.5); ring(p, R * 1.9, 0x4ccfff, 0.8, 1);
    sparks(p, 22, 14, 0x9fe8ff); debris(p, 9, 7);
    for (let i = 0; i < 7; i++) smoke([p[0] + rnd(-1, 1), p[1] + rnd(-1, 1), 0.2], 1.6, 0x23262b, 0.5, { vz: rnd(1, 2.6), life: rnd(1.4, 2.6), tin: 0.25, must: true });
    scorch(p, R * 1.5);
  }
  function clear() { for (const p of parts) p.life = 0; for (const b of beams) b.life = 0; update(0); }

  return { T, spawn, update, beam, clear, count: () => parts.length + beams.length, smoke, sparks, ember, debris, ring, scorch, dust, trail, muzzleFlash, impact, explosion, airburst,
    flameJet, groundFire, fireOn, chargeIn, energyHit, implosion, gravBlast };
};
