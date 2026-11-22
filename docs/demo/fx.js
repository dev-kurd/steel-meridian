'use strict';
/* Tank demo: visual effects (approved design: ../tank-fx-design.md).
 * - The pictures come from the baked fx sheet: ../source/sheets/fx@1x|2x|4x.webp + fx.json, made by ../source/tools/bake_fx.cjs
 *   (flipbook flames, explosions and muzzle flashes, plus the soft shapes: smoke puff, glow, spark, ring, beam...).
 * - Everything that moves is a particle drawn with one of those pictures.
 * - Three layers: decals (on the ground, under the shadows), smoke (normal blend, above the tanks), add (additive, on top).
 * - Positions are in metres (x, y on the ground, z up); cfg.proj(x, y, z) gives the screen position.
 * cfg: proj, ppm, layers, manifest (the parsed fx.json), base (the folder of the sheets). Call useRes('1x' | '2x' | '4x') and wait
 * for it before the first effect; call it again when the game changes resolution. */
window.createFx = function (PIXI, cfg) {
  const { proj, ppm, layers } = cfg, MAX = cfg.maxParticles || 3500, MAX_DECALS = 160;
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = (l) => l[(Math.random() * l.length) | 0];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ---- the pictures. A frame is trimmed in the sheet; the texture knows its full size, so sizes and anchors work on the full frame.
  const J = cfg.manifest, T = {}, sources = {}; let wanted = null;
  function build(res) {
    const tex = {}, F = J.frames[res], source = sources[res];
    for (const name in F) {
      const [, x, y, w, h, ax, ay, fw, fh] = F[name];
      tex[name] = new PIXI.Texture({ source, frame: new PIXI.Rectangle(x, y, w, h), orig: new PIXI.Rectangle(0, 0, fw, fh), trim: new PIXI.Rectangle(fw / 2 - ax, fh / 2 - ay, w, h) });
    }
    const seq = (a) => J.anims[a].frames.map((n) => tex[n]);
    Object.assign(T, { flame: [seq('flame0'), seq('flame1'), seq('flame2')], boom: seq('boom'), pop: seq('pop'), cpop: seq('cpop'), muz: seq('muz'), cmuz: seq('cmuz'),
      smoke: seq('smoke'), scorch: seq('scorch'), debris: seq('debris'), glow: tex.glow, ring: tex.ring, spark: tex.spark, beam: tex.beam, dot: tex.dot, rocket: tex.rocket, shell: tex.shell });
  }
  // load (once) and switch to the sheet of a resolution. resolution: 1 stops PixiJS reading the "@2x" in the file name as a
  // pixel density, so the frame rectangles stay in real pixels. Effects already on screen keep the pictures they started with.
  async function useRes(res) {
    wanted = res;
    if (!sources[res]) { const t = await PIXI.Assets.load({ src: cfg.base + J.sheets[res][0].file, data: { resolution: 1 } }); t.source.scaleMode = 'linear'; sources[res] = t.source; }
    if (wanted === res) build(res);
  }

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
    const size = p.s0 + (p.s1 - p.s0) * e, k = size * ppm / tx.orig.width, [sx, sy] = proj(p.x, p.y, p.z);
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
      if (b.age >= b.life) { for (const s of [b.s1, b.s2, b.e0, b.e1]) if (s) { s.visible = false; pools.add.push(s); } beams.splice(i, 1); continue; }
      const t = b.age / b.life, [x0, y0] = proj(...b.p0), [x1, y1] = proj(...b.p1), len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
      const BW = b.s1.texture.orig.width, BH = b.s1.texture.orig.height;   // the beam picture's size depends on the resolution in use
      const w = b.w * ppm * (b.hold ? 0.85 + 0.15 * Math.sin(b.age * 90) : 1 - t * 0.7), al = b.hold ? 1 - smooth(0.75, 1, t) : 1 - t * t;
      b.s1.position.set(x0, y0); b.s1.rotation = a; b.s1.scale.set(len / BW, w / BH); b.s1.alpha = al * b.alpha; b.s1.tint = b.col;
      b.s2.position.set(x0, y0); b.s2.rotation = a; b.s2.scale.set(len / BW, w * 0.38 / BH); b.s2.alpha = b.core ? al : 0; b.s2.tint = b.core || 0xffffff;
      if (b.e0) {                                           // a round glow closes each end: small at the muzzle, a bigger flickering one where the beam lands
        const f = 0.85 + 0.15 * Math.sin(b.age * 70), GW = b.e0.texture.orig.width, k0 = w * 1.9 / GW, k1 = w * 3.2 * f / GW;
        b.e0.position.set(x0, y0); b.e0.scale.set(k0); b.e0.alpha = al * 0.8; b.e0.tint = b.col;
        b.e1.position.set(x1, y1); b.e1.scale.set(k1); b.e1.alpha = al; b.e1.tint = b.col;
      }
    }
  }
  // a beam between two points: coloured outside, light core. o: w (metres), col, life, hold (steady, then a quick fade),
  // alpha (of the coloured part), core (its colour; 0 = no core)
  function beam(p0, p1, o) {
    const b = { p0, p1, w: o.w, col: o.col, life: o.life, hold: !!o.hold, alpha: o.alpha || 0.85, core: o.core === undefined ? 0xffffff : o.core, age: 0, s1: sprite('add'), s2: sprite('add') };
    for (const s of [b.s1, b.s2]) { s.texture = T.beam; s.anchor.set(0, 0.5); }
    if (b.core) { b.e0 = sprite('add'); b.e1 = sprite('add'); for (const s of [b.e0, b.e1]) { s.texture = T.glow; s.anchor.set(0.5, 0.5); s.rotation = 0; } }   // end glows (not for a halo beam)
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
    if (kind === 'rocket') {                                 // a rocket leaves its tube: a small glow at the mouth, smoke out of the back
      spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.12, s0: 1.3 * k, c0: 0xffc878, a0: 0.8, tout: 0.2, must: true });
      for (let i = 0; i < 3; i++) { const v = -rnd(2, 6); smoke(p, k, 0xc2bbae, 0.4, { vx: d[0] * v + rnd(-0.5, 0.5), vy: d[1] * v + rnd(-0.5, 0.5), vz: d[2] * v + rnd(0, 0.5), drag: 3.6, life: rnd(0.6, 1.1), s0: 0.3 * k, s1: 1.2 * k, tin: 0.04 }); }
      return;
    }
    spawn('add', { frames: en ? T.cmuz : T.muz, x: p[0], y: p[1], z: p[2], life: 0.13, s0: 2.7 * k, rot: sa, ax: 0.06, ay: 0.5, sx: Math.max(0.6, Math.min(1.25, sl / 1.1)), tout: 0.8, must: true });
    spawn('add', { tex: T.glow, x: p[0] + d[0] * 0.3 * k, y: p[1] + d[1] * 0.3 * k, z: p[2] + d[2] * 0.3 * k, life: 0.11, s0: 2.6 * k, s1: 3.4 * k, a0: 0.9, tout: 0.2, c0: en ? 0x9fe8ff : 0xffc878, must: true });
    if (en) return sparks(p, 3, 4, 0x9fe8ff);
    const back = 1, n = Math.round(3 + 3 * k);
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
    // a burnt patch with a glow lying on it, a cluster of low wide flames of different sizes that die one by one, embers and dark smoke
    scorch(p, 2.3 * k);
    spawn('add', { tex: T.glow, flat: true, x: p[0], y: p[1], z: 0, life: life * 1.1, s0: 3 * k, s1: 2 * k, c0: 0xff7a1e, a0: 0.5, tin: 0.15, tout: 0.45 });
    for (let i = 0; i < 4; i++) {                           // the burning bed: soft fire-coloured puffs low on the ground
      const a = rnd(0, TAU), r = rnd(0, 0.6) * k;
      spawn('add', { tex: pick(T.smoke), x: p[0] + Math.cos(a) * r, y: p[1] + Math.sin(a) * r, z: 0.15, vz: rnd(0.1, 0.3), life: life * rnd(0.7, 1), s0: rnd(0.9, 1.3) * k, s1: rnd(1.2, 1.6) * k,
        a0: 0.42, c0: 0xffb048, c1: 0x9a2606, tin: 0.15, tout: 0.5, rot: rnd(0, TAU), vr: rnd(-1.2, 1.2) });
    }
    const n = 2 + ((Math.random() * 2) | 0);                // a few bigger tongues of flame on top
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), r = rnd(0, 0.55) * k, s = rnd(0.6, 0.95) * k * (1 - r / k * 0.35);
      spawn('add', { frames: pick(T.flame), fps: rnd(14, 20), age: rnd(0, 0.05), x: p[0] + Math.cos(a) * r, y: p[1] + Math.sin(a) * r, z: 0, life: life * rnd(0.55, 1.1), s0: s, s1: s * 0.6, sx: rnd(1.2, 1.6),
        ay: 0.94, tin: 0.18, tout: 0.55, a0: 0.85 });
    }
    for (let i = 0; i < 2; i++) ember([p[0] + rnd(-0.5, 0.5) * k, p[1] + rnd(-0.5, 0.5) * k, 0]);
    smoke([p[0], p[1], 0.3], 0.9 * k, 0x1c1a18, 0.3, { life: life * 1.3, tin: 0.4, vz: rnd(0.7, 1.2) });
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
  // ---- walker weapons (approved 2026-11-22). Plasma blue and magma orange are the walkers' fixed weapon colours.
  function plasmaCharge(p, life, k) {                       // Kodiak: the glow that builds at the muzzle before the bolt
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life, s0: 0.3 * k, s1: 1.9 * k, c0: 0x4a8cff, a0: 0.9, tin: 0.5, tout: 0.9, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life, s0: 0.15 * k, s1: 0.8 * k, c0: 0xffffff, a0: 0.9, tin: 0.6, tout: 0.9 });
  }
  function plasmaFlash(p, ang, k) {
    const d = dir3(ang, 0), [sa, sl] = sdir(...d);
    spawn('add', { frames: T.cmuz, x: p[0], y: p[1], z: p[2], life: 0.14, s0: 2.6 * k, rot: sa, ax: 0.06, ay: 0.5, sx: Math.max(0.6, Math.min(1.25, sl / 1.1)), c0: 0x8fb0ff, tout: 0.8, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.14, s0: 3 * k, s1: 3.8 * k, c0: 0x5a8cff, a0: 0.9, tout: 0.2, must: true });
    sparks(p, 3, 4, 0x8fb4ff);
  }
  function plasmaHit(p, k) {                                // a blue burst, a ring on the ground, blue sparks, a scorch mark
    spawn('add', { frames: T.cpop, x: p[0], y: p[1], z: p[2], life: 0.4, s0: 3 * k, s1: 3.8 * k, ay: 0.55, c0: 0x9ab4ff, tout: 0.85, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2] + 0.2, life: 0.18, s0: 3.6 * k, s1: 4.6 * k, c0: 0x5a8cff, tout: 0.2, must: true });
    ring([p[0], p[1], 0], 2.4 * k, 0x7fa8ff, 0.4); sparks(p, 8, 9, 0x9fc0ff);
    smoke(p, k, 0x3a4050, 0.35); scorch(p, 1.9 * k);
  }
  function magmaFlash(p, ang, k) {                          // Cougar: a small flash and a wisp of heat smoke
    const d = dir3(ang, 0), [sa, sl] = sdir(...d);
    spawn('add', { frames: T.muz, x: p[0], y: p[1], z: p[2], life: 0.09, s0: 1.5 * k, rot: sa, ax: 0.06, ay: 0.5, sx: Math.max(0.6, Math.min(1.25, sl / 1.1)), c0: 0xffb060, tout: 0.8 });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.09, s0: 1.5 * k, c0: 0xff8a2a, a0: 0.8, tout: 0.2 });
    if (Math.random() < 0.4) smoke(p, 0.5 * k, 0x6a5a50, 0.25, { vx: d[0] * 1.5, vy: d[1] * 1.5, vz: rnd(0.6, 1.2), life: rnd(0.5, 0.9) });
  }
  function magmaHit(p, k) {                                 // a splash of glowing drops that lie on the ground and cool to black
    spawn('add', { frames: T.pop, x: p[0], y: p[1], z: p[2], life: 0.26, s0: 1.5 * k, ay: 0.6, c0: 0xffb060, tout: 0.85, must: true });
    spawn('add', { tex: T.glow, flat: true, x: p[0], y: p[1], z: 0, life: rnd(1.2, 1.9), s0: 1.5 * k, s1: 1.1 * k, c0: 0xff6a14, a0: 0.5, tin: 0.05, tout: 0.3 });
    for (let i = 0; i < 4; i++) {
      const a = rnd(0, TAU), v = rnd(1.2, 4.2);
      spawn('add', { tex: T.dot, x: p[0], y: p[1], z: p[2] + 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(2, 5.5), grav: 15, life: rnd(1.1, 2.1), s0: rnd(0.14, 0.26), s1: 0.1,
        c0: 0xffc060, c1: 0x7a1a04, tout: 0.5 });
    }
    if (Math.random() < 0.5) smoke(p, 0.6 * k, 0x2a2422, 0.35); if (Math.random() < 0.35) scorch(p, 1.1 * k);
  }
  function gunFlash(p, ang, k) {                            // Gatling: a short flickering flash, and an empty case thrown to the side
    const d = dir3(ang, 0), [sa, sl] = sdir(...d), side = Math.random() < 0.5 ? 1 : -1;
    spawn('add', { frames: T.muz, x: p[0], y: p[1], z: p[2], life: 0.05, s0: rnd(1.2, 1.9) * k, rot: sa + rnd(-0.12, 0.12), ax: 0.06, ay: 0.5, sx: Math.max(0.6, Math.min(1.25, sl / 1.1)), tout: 0.8 });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.05, s0: 1.6 * k, c0: 0xffd890, a0: 0.7, tout: 0.2 });
    spawn('smoke', { tex: T.dot, x: p[0] - d[0] * 1.2, y: p[1] - d[1] * 1.2, z: p[2], vx: -d[1] * side * rnd(1.5, 3) - d[0], vy: d[0] * side * rnd(1.5, 3) - d[1], vz: rnd(1.5, 3), grav: 16, bounce: true,
      life: rnd(0.6, 0.9), s0: 0.1, c0: 0xd2aa4a, tout: 0.8 });
    if (Math.random() < 0.12) smoke(p, 0.5 * k, 0xb8b2a6, 0.25, { vx: d[0] * 2, vy: d[1] * 2, vz: rnd(0.4, 0.9), life: rnd(0.5, 0.9) });
  }
  function bulletHit(p) {                                   // small sparks and a dust puff
    sparks(p, 2, 6, 0xffe6b0);
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.06, s0: 0.9, c0: 0xffe0a0, a0: 0.7, tout: 0.2 });
    if (Math.random() < 0.35) dust([p[0], p[1], Math.max(0, p[2] - 0.3)], 0.7);
  }
  // Achilles: a bright arc where the blade passes. c = the walker's centre, ang = where it faces, side = +1 / -1 (which arm),
  // r = reach in metres. The arc sweeps from the arm's side across the front.
  function slash(c, ang, side, r, z) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = ang + side * (1.05 - 2.0 * u), a2 = a - side * 0.12, h = z + 0.9 - 1.5 * u, rr = r * (0.82 + 0.18 * Math.sin(u * Math.PI));
      const p = spawn('add', { tex: T.spark, x: c[0] + Math.cos(a) * rr, y: c[1] + Math.sin(a) * rr, z: h, age: -u * 0.07, life: 0.2, s0: r * 0.62, s1: r * 0.5, c0: 0xeaf6ff, a0: 0.95,
        tin: 0.08, tout: 0.3, must: true });
      if (p) aim(p, Math.cos(a2) * rr - Math.cos(a) * rr, Math.sin(a2) * rr - Math.sin(a) * rr, -0.19);
    }
  }
  function bladeHit(p) {                                    // the blade lands: sparks, a flash and flying metal bits
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.1, s0: 2.6, c0: 0xfff0d0, a0: 0.9, tout: 0.2, must: true });
    sparks(p, 12, 11, 0xffe9c0); debris(p, 2, 4.5);
  }
  function ballHit(p, k, col) {                             // a small laser ball bursts: a flash with a white heart, and sparks
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.16, s0: 1.6 * k, s1: 2.6 * k, c0: col, a0: 0.9, tout: 0.3, must: true });
    spawn('add', { tex: T.glow, x: p[0], y: p[1], z: p[2], life: 0.1, s0: 0.9 * k, c0: 0xffffff, a0: 0.9, tout: 0.3 });
    sparks(p, 6, 7, col);
  }
  // turn a held sprite (rocket, shell) along a direction of flight; it gets shorter when it flies towards or away from the camera
  function aim(p, dx, dy, dz) { const n = Math.hypot(dx, dy, dz) || 1, [a, l] = sdir(dx / n, dy / n, dz / n); p.rot = a; p.sx = Math.max(0.45, Math.min(1.2, l / 1.1)); }
  function clear() { for (const p of parts) p.life = 0; for (const b of beams) b.life = 0; update(0); }

  return { T, useRes, spawn, update, beam, clear, aim, count: () => parts.length + beams.length, smoke, sparks, ember, debris, ring, scorch, dust, trail, muzzleFlash, impact, explosion, airburst,
    flameJet, groundFire, fireOn, chargeIn, energyHit, implosion, gravBlast, plasmaCharge, plasmaFlash, plasmaHit, magmaFlash, magmaHit, gunFlash, bulletHit, slash, bladeHit, ballHit };
};
