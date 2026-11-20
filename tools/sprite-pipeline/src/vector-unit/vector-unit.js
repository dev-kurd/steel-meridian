/*!
 * VectorUnit — 2.5D isometric vector (SVG) renderer for State of War Game units (tanks).
 * Same projection, lighting, outline, palette and team-paint rules as VectorEngine (buildings),
 * extended for units: 32 directions, separate hull / turret layers, smooth metal tubes,
 * metallic sheen, heavier weathering, damage states, wreck, animated tracks and effects.
 * Specs (chassis + weapon modules) register themselves on VectorUnit.chassis / VectorUnit.weapons.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- math
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  const C = 0.8660254;
  const proj = p => [(p[0] - p[1]) * C, (p[0] + p[1]) * 0.5 - p[2]];
  const LIGHT = V.norm([0.35, 0.6, 1]);
  const VIEW = V.norm([1, 1, 1]);
  const HALF = V.norm(V.add(LIGHT, VIEW));
  const OUT = '#0b0e13';
  const DIRS = 32;
  const dirAngle = d => (((d % DIRS) + DIRS) % DIRS) * (Math.PI * 2 / DIRS);
  const fmt = n => Math.round(n * 100) / 100;

  // --------------------------------------------------------------- colour
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = r => '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => rgb2hex(hex2rgb(h).map(v => v * k));
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
  function toHsl(hex) { const [r, g, b] = hex2rgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l]; }
  function fromHsl(h, s, l) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const c = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return rgb2hex([c(h + 1 / 3), c(h), c(h - 1 / 3)].map(v => v * 255)); }
  const lum = hex => { const c = hex2rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  // identical to VectorEngine.paintOf: clean saturated paint, every hue as bright as the green
  function paintOf(T) {
    const [h, s0] = toHsl(T), hd = h * 360;
    const purple = hd >= 255 && hd <= 320, red = hd >= 335 || hd <= 15;
    const s = purple ? Math.max(0.42, Math.min(0.5, s0)) : red ? Math.max(0.46, Math.min(0.52, s0)) : Math.max(0.6, Math.min(0.82, s0));
    const target = lum(fromHsl(146 / 360, 0.65, 0.4)) * (purple ? 1.25 : red ? 0.9 : 1);
    let lo = 0.3, hi = purple ? 0.64 : red ? 0.5 : 0.56;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (lum(fromHsl(h, s, m)) < target) lo = m; else hi = m; }
    return fromHsl(h, s, (lo + hi) / 2);
  }
  // units use a muted (tinted) version of the team paint: lower saturation, slightly darker
  function unitPaint(T) { const [h, s, l] = toHsl(paintOf(T)); return fromHsl(h, s * 0.5, l * 0.9); }
  const PAL = { plate: '#6b7785', trim: '#808c9a', dark: '#38404a', interior: '#161a20', chip: '#aab2ba', rust: '#7b4a2c', char: '#1e1a17' };
  const MAT = { paint: { st: 0.16, sh: 14 }, metal: { st: 0.55, sh: 28 }, rubber: { st: 0.05, sh: 8 } };
  function lit(color, n, mat, ctx) {
    if (ctx && ctx.wreck) color = mix(color, PAL.char, 0.84);
    const k = 0.55 + 0.55 * Math.max(0, V.dot(n, LIGHT));
    const m = MAT[mat] || MAT.paint;
    const sp = Math.pow(Math.max(0, V.dot(n, HALF)), m.sh) * m.st * (ctx && ctx.wreck ? 0.25 : 1);
    return mix(shade(color, Math.min(1.25, k)), '#ffffff', Math.min(0.85, sp));
  }

  // ---------------------------------------------------------------- rng
  function rng(seed) { let s = 0; for (const ch of String(seed)) s = (Math.imul(s, 31) + ch.charCodeAt(0)) >>> 0; s = s || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // ---------------------------------------------------------- primitives
  function ccw2(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a > 0 ? poly : poly.slice().reverse(); }
  function capsToFaces(bottom, top) {
    const faces = [{ pts: bottom.slice().reverse(), kind: 'cap' }, { pts: top.slice(), kind: 'cap' }];
    for (let i = 0; i < bottom.length; i++) { const j = (i + 1) % bottom.length; faces.push({ pts: [bottom[i], bottom[j], top[j], top[i]], kind: 'side' }); }
    return faces;
  }
  function prismZ(plan, z0, z1, topScale = 1, topOff = [0, 0]) {
    plan = ccw2(plan);
    const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cy = plan.reduce((s, p) => s + p[1], 0) / plan.length;
    return capsToFaces(plan.map(p => [p[0], p[1], z0]), plan.map(p => [cx + (p[0] - cx) * topScale + topOff[0], cy + (p[1] - cy) * topScale + topOff[1], z1]));
  }
  const box = (x0, x1, y0, y1, z0, z1) => prismZ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1);
  // loft: bottom plan at z0 to top plan at z1 (same vertex count, matching edges parallel so side quads stay planar)
  function loft(bot, z0, top, z1) { const ccw = ccw2(bot) === bot; const B = ccw ? bot : bot.slice().reverse(), T = ccw ? top : top.slice().reverse(); return capsToFaces(B.map(p => [p[0], p[1], z0]), T.map(p => [p[0], p[1], z1])); }
  function extrudeY(profXZ, y0, y1) { const p = ccw2(profXZ); return capsToFaces(p.map(q => [q[0], y0, q[1]]), p.map(q => [q[0], y1, q[1]])); }
  function extrudeX(profYZ, x0, x1) { const p = ccw2(profYZ); return capsToFaces(p.map(q => [x0, q[0], q[1]]), p.map(q => [x1, q[0], q[1]])); }
  function ngon(n, r, cx = 0, cy = 0, rot = Math.PI / n) { const o = []; for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
  const cylZ = (cx, cy, r, z0, z1, n = 20, topScale = 1) => prismZ(ngon(n, r, cx, cy), z0, z1, topScale);
  const cylY = (cx, cz, r, y0, y1, n = 20) => extrudeY(ngon(n, r, cx, cz), y0, y1);

  function finalize(faces) {
    const all = faces.flatMap(f => f.pts);
    const c = V.mul(all.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / all.length);
    for (const f of faces) {
      let n = V.norm(V.cross(V.sub(f.pts[1], f.pts[0]), V.sub(f.pts[2], f.pts[0])));
      const fc = V.mul(f.pts.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / f.pts.length);
      if (V.dot(n, V.sub(fc, c)) < 0) { n = V.mul(n, -1); f.pts = f.pts.slice().reverse(); }
      f.n = n; f.ln = n; f.lpts = f.pts;
    }
    return faces;
  }
  // part options: color, paint (team armour), mat, weather 0..1, decals [{match(n,f), draw(api)}], smooth, thin, animated
  function part(id, faces, opt = {}) { return Object.assign({ id, faces: finalize(faces), color: PAL.plate, paint: false, weather: 0, decals: [] }, opt); }
  // smooth tube along local X (barrels, pods, exhausts): no facet lines, specular streak
  function tubeX(id, cy, cz, r, x0, x1, opt = {}) {
    const pt = part(id, extrudeX(ngon(24, r, cy, cz), x0, x1), Object.assign({ color: PAL.trim, smooth: true }, opt));
    pt.sheen = function (P, ctx) {
      const xf = this.xf, o = xf([0, 0, 0]);
      let best = -1, ba = 0;
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * Math.PI * 2, n = V.sub(xf([0, Math.cos(a), Math.sin(a)]), o);
        if (V.dot(n, VIEW) <= 0.05) continue;
        const d = V.dot(V.norm(n), HALF); if (d > best) { best = d; ba = a; }
      }
      const k = (x1 - x0) * 0.04, y = cy + Math.cos(ba) * r * 0.9, z = cz + Math.sin(ba) * r * 0.9;
      const a = P(xf([x0 + k, y, z])), b = P(xf([x1 - k, y, z]));
      const w = Math.max(0.7, r * 0.5 * ctx.S), op = ctx.wreck ? 0.25 : 1;
      const d = `M${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}`;
      let out = `<path d="${d}" stroke="#fff" stroke-width="${fmt(w * 1.8)}" stroke-linecap="round" opacity="${fmt((opt.paint ? 0.12 : 0.18) * op)}"/><path d="${d}" stroke="#fff" stroke-width="${fmt(w * 0.55)}" stroke-linecap="round" opacity="${fmt((opt.paint ? 0.35 : 0.6) * op)}"/>`;
      // metal bands (straps) drawn on the tube itself, so they can never sort behind it
      for (const bd of opt.bands || []) {
        const rr = r * 1.07, N = 40, vis = [];
        for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, n = V.sub(xf([0, Math.cos(a), Math.sin(a)]), o); vis.push(V.dot(n, VIEW) > 0); }
        let st = vis.findIndex((v, i) => v && !vis[(i - 1 + N) % N]); if (st < 0) st = 0;
        const angs = []; for (let k = 0; k <= N; k++) { const i = (st + k) % N; if (!vis[i]) break; angs.push(i / N * Math.PI * 2); }
        if (angs.length < 2) continue;
        const ring = x => angs.map(a => P(xf([x, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr])));
        const A = ring(bd.x), B = ring(bd.x + bd.w).reverse();
        const nrm = V.norm(V.sub(xf([0, Math.cos(ba), Math.sin(ba)]), o));
        out += `<path d="${pathOf(A.concat(B))}" fill="${lit(bd.color || PAL.trim, nrm, 'metal', ctx)}" stroke="${OUT}" stroke-width="${fmt(0.6 * (ctx.sw || 0.9))}" stroke-linejoin="round"/>`;
        const mid = ring(bd.x + bd.w / 2), j = Math.floor(mid.length * 0.25);
        if (mid[j]) out += `<circle cx="${fmt(mid[j][0])}" cy="${fmt(mid[j][1])}" r="${fmt(0.45 * ctx.S)}" fill="#c9d0d7" stroke="${OUT}" stroke-width="0.4"/>`;
      }
      return out;
    };
    return pt;
  }
  function place(pt, fn) {
    const np = Object.assign({}, pt);
    const prev = pt.xf || (p => p);
    np.xf = p => fn(prev(p));
    const o = fn([0, 0, 0]);
    np.faces = pt.faces.map(f => Object.assign({}, f, { pts: f.pts.map(fn), n: V.norm(V.sub(fn(f.n), o)) }));
    return np;
  }
  const rotZ = (p, a, c = [0, 0]) => { const s = Math.sin(a), k = Math.cos(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * k - y * s, c[1] + x * s + y * k, p[2]]; };

  // ------------------------------------------------------------ sorting
  function aabb(pt) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const f of pt.faces) for (const p of f.pts) for (let i = 0; i < 3; i++) { if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i]; } return { mn, mx }; }
  // Painter's order for convex parts. For each pair whose screen footprints overlap, look for a face plane of
  // one part that has the whole other part on its outer side: that plane decides which is nearer the camera
  // (exact for convex solids, works at every angle). Pairs with no such plane fall back to the AABB rule;
  // the remaining ties go nearest-last by centroid depth.
  // 2D separating-axis test for two convex polygons (screen silhouettes); a small margin counts as apart
  function hullsOverlap(A, B) {
    for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], nx = q[1] - p[1], ny = p[0] - q[0], l = Math.hypot(nx, ny) || 1;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (const v of A) { const d = (v[0] * nx + v[1] * ny) / l; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = (v[0] * nx + v[1] * ny) / l; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      if (a1 <= b0 + 0.01 || b1 <= a0 + 0.01) return false;
    }
    return true;
  }
  function depthSort(parts) {
    const n = parts.length, eps = 0.02;
    const info = parts.map(p => {
      const verts = [], seen = new Set();
      for (const f of p.faces) for (const q of f.pts) { const k = q.map(v => v.toFixed(3)).join(','); if (!seen.has(k)) { seen.add(k); verts.push(q); } }
      const planes = p.faces.map(f => ({ n: f.n, d: V.dot(f.n, f.pts[0]) }));
      const b = aabb(p);
      let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
      for (const q of verts) { const s2 = proj(q); if (s2[0] < sx0) sx0 = s2[0]; if (s2[0] > sx1) sx1 = s2[0]; if (s2[1] < sy0) sy0 = s2[1]; if (s2[1] > sy1) sy1 = s2[1]; }
      return { p, verts, planes, b, sb: [sx0, sy0, sx1, sy1], sh: hull2(verts.map(proj)), d: (b.mn[0] + b.mx[0] + b.mn[1] + b.mx[1] + b.mn[2] + b.mx[2]) / 2 };
    });
    const outside = (pl, verts) => { for (const v of verts) if (V.dot(pl.n, v) < pl.d - eps) return false; return true; };
    // -1: a drawn before b, 1: b before a, 0: unknown
    function order(a, b) {
      for (const pl of a.planes) if (outside(pl, b.verts)) { const c = V.dot(pl.n, VIEW); if (Math.abs(c) > 1e-6) return c > 0 ? -1 : 1; }
      for (const pl of b.planes) if (outside(pl, a.verts)) { const c = V.dot(pl.n, VIEW); if (Math.abs(c) > 1e-6) return c > 0 ? 1 : -1; }
      let ab = false, ba = false;
      for (let k = 0; k < 3; k++) { if (a.b.mx[k] <= b.b.mn[k] + 0.01) ab = true; if (b.b.mx[k] <= a.b.mn[k] + 0.01) ba = true; }
      if (ab && !ba) return -1; if (ba && !ab) return 1;
      return 0;
    }
    const before = info.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = info[i], B = info[j];
      if (A.sb[2] < B.sb[0] || B.sb[2] < A.sb[0] || A.sb[3] < B.sb[1] || B.sb[3] < A.sb[1]) continue;   // no screen overlap
      if (!hullsOverlap(A.sh, B.sh)) continue;   // silhouettes do not overlap: any order is fine, add no constraint
      const o = order(A, B);
      if (o < 0) before[j].push(i); else if (o > 0) before[i].push(j);
    }
    const done = new Uint8Array(n), out = [];
    while (out.length < n) {
      let pick = -1;
      for (let i = 0; i < n; i++) { if (done[i]) continue; let ok = true; for (const b of before[i]) if (!done[b]) { ok = false; break; } if (ok && (pick < 0 || info[i].d < info[pick].d)) pick = i; }
      if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || info[i].d < info[pick].d)) pick = i;
      done[pick] = 1; out.push(info[pick].p);
    }
    return out;
  }
  function hull2(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const pathOf = pts => 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z';

  // ------------------------------------------------------------ face frame
  function faceFrame(f) {
    const n = f.ln, pts = f.lpts;
    let u = Math.abs(n[2]) < 0.97 ? V.norm(V.cross([0, 0, 1], n)) : [0, -1, 0];
    const v = V.norm(V.cross(u, n));
    const us = pts.map(p => V.dot(p, u)), vs = pts.map(p => V.dot(p, v));
    return { u, v, n, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), d: V.dot(pts[0], n) };
  }

  // ------------------------------------------------------------ weathering + damage
  function weather(api, seed, w, fr, mat) {
    const r = rng(seed), vertical = Math.abs(fr.n[2]) < 0.5, metal = mat === 'metal', lw = k => k * api.S * 0.5;
    if (vertical) {
      api.poly([[0, 0.45], [1, 0.45], [1, 1], [0, 1]], '#000', `opacity="${fmt(0.12 * w)}"`);
      api.poly([[0, 0.72], [1, 0.72], [1, 1], [0, 1]], '#4a3a26', `opacity="${fmt(0.22 * w)}"`);
      api.poly([[0, 0.9], [1, 0.9], [1, 1], [0, 1]], '#8a7656', `opacity="${fmt(0.25 * w)}"`);
      const ns = 3 + Math.floor(r() * 4);
      for (let i = 0; i < ns; i++) { const s0 = 0.05 + r() * 0.9, t0 = r() * 0.35; api.line(s0, t0, s0 + (r() - 0.5) * 0.02, t0 + 0.25 + r() * 0.5, '#15181c', lw(0.6 + r() * 0.8), `opacity="${fmt(0.28 * w)}"`); }
      const nr = 1 + Math.floor(r() * 3);
      for (let i = 0; i < nr; i++) { const s0 = 0.08 + r() * 0.84, t0 = 0.12 + r() * 0.55; api.ellipse(s0, t0, 0.018 + r() * 0.025, 0.04 + r() * 0.04, PAL.rust, `opacity="${fmt(0.7 * w)}"`); api.ellipse(s0, t0, 0.008, 0.018, '#3d2414', `opacity="${fmt(0.8 * w)}"`); api.line(s0, t0, s0 + (r() - 0.5) * 0.01, t0 + 0.15 + r() * 0.35, '#8a5330', lw(0.9), `opacity="${fmt(0.5 * w)}"`); }
      for (let i = 0; i < 3; i++) { const s0 = r(), t0 = r() * 0.8; api.line(s0, t0, s0 + 0.06 + r() * 0.1, t0 + (r() - 0.5) * 0.1, metal ? '#e8edf2' : PAL.chip, lw(0.35), `opacity="${fmt(0.55 * w)}"`); }
    } else {
      for (let i = 0; i < 3; i++) api.ellipse(r(), r(), 0.1 + r() * 0.18, 0.08 + r() * 0.14, '#a8987a', `opacity="${fmt(0.16 * w)}"`);
      for (let i = 0; i < 2; i++) if (r() < 0.7) { const s0 = 0.1 + r() * 0.8, t0 = 0.1 + r() * 0.8; api.ellipse(s0, t0, 0.025 + r() * 0.02, 0.025 + r() * 0.02, PAL.rust, `opacity="${fmt(0.6 * w)}"`); api.ellipse(s0, t0, 0.01, 0.01, '#3d2414', `opacity="${fmt(0.7 * w)}"`); }
      const nsc = 3 + Math.floor(r() * 3);
      for (let i = 0; i < nsc; i++) { const s0 = r(), t0 = r(); api.line(s0, t0, s0 + 0.08 + r() * 0.12, t0 + (r() - 0.5) * 0.1, '#eef1f4', lw(0.35), `opacity="${fmt(0.55 * w)}"`); }
    }
    const nc = 5 + Math.floor(r() * 6);
    for (let i = 0; i < nc; i++) {
      const edge = Math.floor(r() * 4), p = 0.04 + r() * 0.92, sz = 0.015 + r() * 0.035;
      let s0, t0; if (edge === 0) { s0 = p; t0 = sz * 0.5; } else if (edge === 1) { s0 = 1 - sz * 0.5; t0 = p; } else if (edge === 2) { s0 = p; t0 = 1 - sz * 0.5; } else { s0 = sz * 0.5; t0 = p; }
      api.poly([[s0 - sz, t0 - sz * 0.6], [s0 + sz * 0.7, t0 - sz * 0.9], [s0 + sz, t0 + sz * 0.5], [s0 - sz * 0.4, t0 + sz]], metal ? '#c9d0d7' : PAL.chip, `opacity="${fmt(0.85 * w)}"`);
    }
    if (vertical) api.line(0.01, 0.01, 0.99, 0.01, '#fff', lw(1.1), `opacity="${fmt(0.28 * w)}"`);
  }
  // Damage on painted armour. dmg: 1 damaged (≤60), 2 burning (≤30), 3 wreck.
  // Sizes are in world units (converted per face), counts scale with face area, seeded per face.
  function damage(api, seed, dmg) {
    const r = rng('dmg' + seed), lw = k => k * api.S * 0.5;
    const area = api.wU * api.wV, vertical = Math.abs(api.n[2]) < 0.5;
    const su = w => w / api.wU, tv = w => w / api.wV;               // world units -> normalized
    const count = (k, cap) => { const x = k * area / 520; let n = Math.floor(x); if (r() < x - n) n++; return Math.min(cap, n); };
    const blob = (s0, t0, rad, jit = 0.35, n = 14, rot = 0) => { const pts = []; for (let i = 0; i < n; i++) { const a = rot + i / n * 6.283, k = 1 - jit / 2 + r() * jit; pts.push([s0 + Math.cos(a) * su(rad * k), t0 + Math.sin(a) * tv(rad * k)]); } return pts; };
    const spot = () => [0.12 + r() * 0.76, 0.12 + r() * 0.76];

    // 1) burn / soot marks: heat-tinted rim, soot body, dark core, soot plume rising on walls
    const nScorch = count(dmg === 1 ? 0.75 : dmg === 2 ? 1.2 : 2.2, dmg === 3 ? 5 : 3);
    for (let i = 0; i < nScorch; i++) {
      const [s0, t0] = spot(), R = (dmg === 1 ? 3.2 : dmg === 2 ? 4.2 : 5.2) * (0.75 + r() * 0.5);
      if (vertical) for (const [k, o] of [[1, 0.14], [0.7, 0.18]]) api.poly([[s0 - su(R * 0.9 * k), t0], [s0 + su(R * 0.9 * k), t0], [s0 + su(R * 0.4 * k), t0 - tv(R * 3)], [s0 - su(R * 0.35 * k), t0 - tv(R * 2.7)]], '#14100d', `opacity="${o}"`);
      api.poly(blob(s0, t0, R * 1.45, 0.4), '#6a3f1f', 'opacity="0.2"');                 // heat-tinted paint
      for (const [k, o] of [[1.3, 0.1], [1.1, 0.14], [0.9, 0.2], [0.7, 0.26], [0.5, 0.34], [0.3, 0.45]]) api.poly(blob(s0, t0, R * k, 0.45), '#120d0a', `opacity="${o}"`);   // soft soot
      if (dmg >= 2) for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = R * (1.1 + r() * 0.4); api.ellipse(s0 + Math.cos(a) * su(d), t0 + Math.sin(a) * tv(d), su(0.35), tv(0.35), '#9a7a52', 'opacity="0.7"', 8); }   // blistered paint
    }
    // 2) shell impacts: bright scraped crater, dark pit, radial cracks, flecks
    const nHit = count(dmg === 1 ? 0.45 : 0.8, 3);
    for (let i = 0; i < nHit; i++) {
      const [s0, t0] = spot(), R = 1.4 + r() * 1.2, rot = r() * 6.28;
      const star = []; for (let k = 0; k < 10; k++) { const a = rot + k / 10 * 6.283, d = R * (k % 2 ? 0.7 + r() * 0.2 : 1.1 + r() * 0.5); star.push([s0 + Math.cos(a) * su(d), t0 + Math.sin(a) * tv(d)]); }
      api.poly(star, '#c4cbd2', `opacity="0.9" stroke="#0b0e13" stroke-width="${fmt(lw(0.35))}"`);
      api.poly(blob(s0, t0, R * 0.62, 0.3, 10), '#4b535c');
      api.poly(blob(s0 + su(R * 0.08), t0 + tv(R * 0.08), R * 0.36, 0.3, 9), '#0b0d10');
      for (let k = 0; k < 4; k++) { const a = r() * 6.28, d0 = R * 1.1, d1 = R * (1.8 + r() * 0.9); api.line(s0 + Math.cos(a) * su(d0), t0 + Math.sin(a) * tv(d0), s0 + Math.cos(a) * su(d1), t0 + Math.sin(a) * tv(d1), '#0b0e13', lw(0.4), 'opacity="0.8"'); }
    }
    // 3) bullet strikes: small clusters of bright dings with dark centres
    const nCl = count(dmg === 1 ? 0.8 : 1.2, 3);
    for (let i = 0; i < nCl; i++) {
      const [s0, t0] = spot(), n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) { const a = r() * 6.28, d = r() * 3; const x = s0 + Math.cos(a) * su(d), y = t0 + Math.sin(a) * tv(d), q = 0.35 + r() * 0.25;
        api.poly(blob(x, y, q * 1.6, 0.6, 6, r() * 6), '#d3d9de', 'opacity="0.85"'); api.ellipse(x, y, su(q * 0.6), tv(q * 0.6), '#121417', '', 6); }
    }
    // 4) gouges: long scrapes down to bare metal
    const nG = count(dmg === 1 ? 0.35 : 0.6, 2);
    for (let i = 0; i < nG; i++) {
      const [s0, t0] = spot(), a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI), len = 5 + r() * 7, s1 = s0 + Math.cos(a) * su(len), t1 = t0 + Math.sin(a) * tv(len);
      api.line(s0, t0 + tv(0.25), s1, t1 + tv(0.25), '#0b0e13', lw(0.9), 'opacity="0.55"');
      api.line(s0, t0, s1, t1, '#c9d0d7', lw(0.7), 'opacity="0.9"');
    }
    // 5) burning / wreck: torn holes with bent metal petals; glowing edges while burning
    if (dmg >= 2 && area > 220 && r() < (dmg === 3 ? 0.85 : 0.65)) {
      const [s0, t0] = [0.25 + r() * 0.5, 0.25 + r() * 0.5], R = 2.2 + r() * 1.8, n = 11;
      const hole = blob(s0, t0, R, 0.7, n);
      for (const [k, o] of [[2.4, 0.12], [1.9, 0.2], [1.5, 0.3]]) api.poly(blob(s0, t0, R * k, 0.4), '#0d0a08', `opacity="${o}"`);
      if (dmg === 2) for (const [k, o] of [[1.7, 0.18], [1.35, 0.25]]) api.poly(blob(s0, t0, R * k, 0.35), '#ff7a1a', `opacity="${o}"`);
      for (let k = 0; k < n; k += 2) { const p = hole[k], q = hole[(k + 1) % n], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], o = [s0 + (m[0] - s0) * 1.55, t0 + (m[1] - t0) * 1.55]; api.poly([p, o, q], dmg === 3 ? '#3a332e' : '#8f979f', `stroke="#0b0e13" stroke-width="${fmt(lw(0.3))}"`); }
      if (dmg === 2) api.poly(hole, 'none', `stroke="#ff7a1a" stroke-width="${fmt(lw(1.6))}" opacity="0.9"`);
      api.poly(hole, '#050505', dmg === 2 ? `stroke="#ffd27a" stroke-width="${fmt(lw(0.5))}"` : '');
      if (dmg === 2) api.poly(blob(s0, t0 + tv(R * 0.2), R * 0.45, 0.5, 8), '#ff6a14', 'opacity="0.55"');
    }
    // 6) wreck: whole-face heat discolouration
    if (dmg === 3) api.poly([[0, 0], [1, 0], [1, 1], [0, 1]], '#4a2c1a', 'opacity="0.25"');
  }

  // ------------------------------------------------------------ rendering
  let SEQ = 0;
  // returns [{ id, svg, animated }] in draw order. ctx: { S, ox, oy, sw, prefix, dmg, wreck, frame, team, glow }
  function renderParts(parts, ctx) {
    const S = ctx.S, sw = ctx.sw || 0.9, pre = ctx.prefix || 'vu';
    const P = p => { const q = proj(p); return [q[0] * S + (ctx.ox || 0), q[1] * S + (ctx.oy || 0)]; };
    const out = [];
    for (const pt of parts) {
      if (pt.custom) { out.push({ id: pt.id, animated: !!pt.animated, svg: pt.custom(ctx) }); continue; }
      const mat = pt.mat || (pt.paint ? 'paint' : 'metal');
      const xf = pt.xf || (p => p);
      let defs = '', body = '';
      const sil = [];
      for (let fi = 0; fi < pt.faces.length; fi++) {
        const f = pt.faces[fi];
        const p2 = f.pts.map(P);
        if (pt.smooth) sil.push(...p2);
        if (V.dot(f.n, VIEW) <= 1e-4) continue;
        const fill = lit(f.color || pt.color, f.n, mat, ctx);
        const d = pathOf(p2);
        if (pt.smooth && f.kind === 'side') { body += `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="0.6" stroke-linejoin="round"/>`; continue; }
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of p2) { if (q[0] < x0) x0 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[0] > x1) x1 = q[0]; if (q[1] > y1) y1 = q[1]; }
        const gid = `${pre}g${++SEQ}`;
        const stops = ctx.wreck ? [[0, 1.05], [1, 0.85]] : mat === 'metal' ? [[0, 1.02], [0.32, 1.2], [0.5, 1.0], [0.78, 0.9], [1, 0.82]] : mat === 'paint' ? [[0, 1.1], [0.4, 1.03], [1, 0.86]] : [[0, 1.04], [1, 0.9]];
        defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${fmt(x0)}" y1="${fmt(y0)}" x2="${fmt(x1)}" y2="${fmt(y1)}">` + stops.map(s => `<stop offset="${s[0]}" stop-color="${shade(fill, s[1])}"/>`).join('') + '</linearGradient>';
        const stroke = `stroke="${OUT}" stroke-width="${fmt(pt.thin ? sw * 0.6 : sw)}" stroke-linejoin="round"`;
        const fr = faceFrame(f);
        const toScreen = (s, t) => P(xf(V.add(V.add(V.mul(fr.u, fr.u0 + s * (fr.u1 - fr.u0)), V.mul(fr.v, fr.v0 + t * (fr.v1 - fr.v0))), V.mul(fr.n, fr.d + 0.02))));
        // optional see-through opening in a face (track loop): drawn with an even-odd hole so parts behind show through
        let holed = false;
        if (pt.hole && pt.hole.match(fr.n)) {
          const nf = f.lpts.map(q => [(V.dot(q, fr.u) - fr.u0) / Math.max(1e-6, fr.u1 - fr.u0), (V.dot(q, fr.v) - fr.v0) / Math.max(1e-6, fr.v1 - fr.v0)]);
          const hp = pt.hole.pts(nf, fr.u1 - fr.u0, fr.v1 - fr.v0);
          body += `<path d="${d}${pathOf(hp.map(q => toScreen(q[0], q[1])).reverse())}" fill="url(#${gid})" fill-rule="evenodd" ${stroke}/>`;
          holed = true;
        } else body += `<path d="${d}" fill="url(#${gid})" ${stroke}/>`;
        let inner = '';
        const api = {
          S, frame: ctx.frame || 0, dmg: ctx.dmg || 0, wreck: !!ctx.wreck,
          aspect: (fr.u1 - fr.u0) / Math.max(1e-6, fr.v1 - fr.v0), wU: fr.u1 - fr.u0, wV: fr.v1 - fr.v0, n: fr.n,
          facePts: f.lpts.map(q => [(V.dot(q, fr.u) - fr.u0) / Math.max(1e-6, fr.u1 - fr.u0), (V.dot(q, fr.v) - fr.v0) / Math.max(1e-6, fr.v1 - fr.v0)]),
          poly(st, c, extra = '') { inner += `<path d="${pathOf(st.map(q => toScreen(q[0], q[1])))}" fill="${c}" ${extra}/>`; },
          ellipse(cs, ct, rs, rt, c, extra = '', seg = 20) { const pts = []; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pts.push([cs + Math.cos(a) * rs, ct + Math.sin(a) * rt]); } this.poly(pts, c, extra); },
          line(s0, t0, s1, t1, c, w, extra = '') { const a = toScreen(s0, t0), b = toScreen(s1, t1); inner += `<path d="M${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}" stroke="${c}" stroke-width="${fmt(w)}" stroke-linecap="round" fill="none" ${extra}/>`; },
          bolt(s, t, rr) { this.ellipse(s, t + rr * 0.25, rr, rr * this.aspect, '#000', 'opacity="0.35"', 10); this.ellipse(s, t, rr, rr * this.aspect, lit(PAL.trim, f.n, 'metal', ctx), `stroke="${OUT}" stroke-width="${fmt(0.25 * S)}"`, 10); if (!ctx.wreck) this.ellipse(s - rr * 0.3, t - rr * 0.3 * this.aspect, rr * 0.35, rr * 0.35 * this.aspect, '#fff', 'opacity="0.55"', 8); },
          light: (c, m = mat) => lit(c, f.n, m, ctx),
          glow: () => (ctx.wreck ? '#2a2522' : ctx.glow),
        };
        for (const dc of pt.decals) if (dc.match(fr.n, f, fi)) dc.draw(api, f, fi);
        const big = (fr.u1 - fr.u0) > 1.5 && (fr.v1 - fr.v0) > 1.5;
        if (pt.weather > 0 && big && !holed) weather(api, pt.id + ':' + fi, pt.weather, fr, mat);
        if (pt.paint && ctx.dmg && big && !pt.noDamage) damage(api, pt.id + ':' + fi, ctx.dmg);
        if (inner) {
          const cid = `${pre}c${++SEQ}`;
          defs += `<clipPath id="${cid}"><path d="${d}"/></clipPath>`;
          body += `<g clip-path="url(#${cid})">${inner}</g>` + (holed ? '' : `<path d="${d}" fill="none" ${stroke}/>`);
        }
      }
      // horizontal rib rings on vertical round parts (collars, drums): only the half facing the viewer
      if (pt.rings && pt.ring) {
        const [rcx, rcy, rr] = pt.ring, o0 = xf([0, 0, 0]);
        for (const rg of pt.rings) {
          const N = 48, vis = [], pts = [];
          for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; const nn = V.sub(xf([Math.cos(a), Math.sin(a), 0]), o0); let inArc = true; if (rg.a0 !== undefined) { const d = ((a - rg.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); inArc = d <= ((rg.a1 - rg.a0) + Math.PI * 2) % (Math.PI * 2); } vis.push(V.dot(nn, VIEW) > 0.02 && inArc); pts.push(P(xf([rcx + Math.cos(a) * rr * (rg.k || 1), rcy + Math.sin(a) * rr * (rg.k || 1), rg.z]))); }
          let st = vis.findIndex((v, i) => v && !vis[(i - 1 + N) % N]); if (st < 0) continue;
          const arc = []; for (let k = 0; k < N; k++) { const i = (st + k) % N; if (!vis[i]) break; arc.push(pts[i]); }
          const d = 'M' + arc.map(q => fmt(q[0]) + ' ' + fmt(q[1])).join('L');
          const col = rg.glow ? (ctx.wreck ? '#2a2522' : ctx.glow) : (rg.color || '#0b0e13');
          body += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${fmt((rg.w || 0.5) * S)}" stroke-linecap="round" ${rg.glow ? '' : 'opacity="0.7"'}/>`;
          if (!rg.glow && !rg.flat) body += `<path d="${d}" fill="none" stroke="#fff" stroke-width="${fmt(0.22 * S)}" opacity="0.25" transform="translate(0 ${fmt(0.45 * S)})"/>`;
        }
      }
      if (pt.post) body += pt.post(P, ctx);
      if (pt.smooth && sil.length) {
        if (pt.sheen) body += pt.sheen(P, ctx);
        body += `<path d="${pathOf(hull2(sil))}" fill="none" stroke="${OUT}" stroke-width="${fmt(sw)}" stroke-linejoin="round"/>`;
      }
      out.push({ id: pt.id, animated: !!pt.animated, svg: (defs ? `<defs>${defs}</defs>` : '') + body });
    }
    return out;
  }

  // ------------------------------------------------------------ registry + layer builders
  const chassis = {};   // size -> { dims, build(ctx) -> { parts, pivot:[x,y,z], firePts, speed } }
  const weapons = {};   // type -> { name, build(size, ctx) -> { parts, muzzles:[[x,y,z]], tH, R } }
  const SH = [-0.35 / 1, -0.6 / 1];   // ground offset per unit height for shadows (away from the light)

  function ctxFor(o) {
    return { S: o.S || 3, sw: o.sw || 0.9, team: o.team, paint: unitPaint(o.team), glow: mix(unitPaint(o.team), '#ffffff', 0.5),
      dmg: o.dmg || 0, wreck: o.dmg === 3, frame: o.frame || 0, prefix: o.prefix || 'vu', ox: o.ox || 0, oy: o.oy || 0 };
  }
  // world-placed hull parts for a direction
  function hullParts(o) {
    const ctx = ctxFor(o), c = chassis[o.size].build(ctx), a = dirAngle(o.dir || 0);
    return { ctx, parts: c.parts.map(p => place(p, q => rotZ(q, a))), pivot: rotZ(c.pivot, a), firePts: c.firePts.map(p => rotZ(p, a)), info: c };
  }
  function turretParts(o) {
    const ctx = ctxFor(o), w = weapons[o.type].build(o.size, ctx), a = dirAngle(o.dir || 0) + (o.extraAngle || 0);
    const fn = q => rotZ(q, a);
    return { ctx, parts: w.parts.map(p => place(p, fn)), muzzles: w.muzzles.map(fn), tH: w.tH, R: w.R };
  }
  function renderHull(o) { const h = hullParts(o); return renderParts(depthSort(h.parts), h.ctx); }
  function renderTurret(o) {
    const t = turretParts(o);
    // soft contact shadow of the turret on the deck (part of the turret layer, so it bakes with it)
    const S = t.ctx.S, R = t.R, sx = SH[0] * t.tH * 0.6, sy = SH[1] * t.tH * 0.6;
    const c = proj([sx, sy, 0]);
    const sh = `<ellipse cx="${fmt(c[0] * S + t.ctx.ox)}" cy="${fmt(c[1] * S + t.ctx.oy)}" rx="${fmt(R * 1.2 * S)}" ry="${fmt(R * 0.68 * S)}" fill="#000" opacity="0.32" filter="url(#${t.ctx.prefix}soft)"/>`;
    return [{ id: 'turretShadow', svg: sh }].concat(renderParts(depthSort(t.parts), t.ctx));
  }
  function groundShadow(o) {
    const d = chassis[o.size].dims, S = o.S || 3, a = dirAngle(o.dir || 0), h = d.H * 0.7;
    const pts = [[-d.L * 0.53, -d.W * 0.53], [d.L * 0.53, -d.W * 0.53], [d.L * 0.53, d.W * 0.53], [-d.L * 0.53, d.W * 0.53]].map(p => rotZ([p[0], p[1], 0], a));
    const all = pts.concat(pts.map(p => [p[0] + SH[0] * h, p[1] + SH[1] * h, 0])).map(p => { const q = proj(p); return [q[0] * S + (o.ox || 0), q[1] * S + (o.oy || 0)]; });
    return `<path d="${pathOf(hull2(all))}" fill="#000" opacity="${o.dmg === 3 ? 0.42 : 0.32}" filter="url(#${o.prefix || 'vu'}blur)"/>`;
  }
  const filterDefs = pre => `<filter id="${pre}blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter><filter id="${pre}soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter>`;

  // standalone sprite SVG for baking: layer 'hull' | 'turret' | 'shadow'; origin = tank centre (hull/shadow) or turret pivot (turret)
  function sprite(o) {
    const S = o.S || 3, pre = (o.prefix || 'sp') + (++SEQ) + '-';
    const base = Object.assign({}, o, { S, prefix: pre, ox: 0, oy: 0 });
    let body = '';
    if (o.layer === 'shadow') body = groundShadow(base);
    else if (o.layer === 'turret') body = renderTurret(base).map(p => p.svg).join('');
    else body = renderHull(base).map(p => p.svg).join('');
    const m = /(-?\d+(?:\.\d+)?)/g; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    // bounds from geometry
    const parts = o.layer === 'turret' ? turretParts(base).parts : hullParts(base).parts;
    for (const p of parts) for (const f of p.faces) for (const q of f.pts) { const s = proj(q); x0 = Math.min(x0, s[0] * S); x1 = Math.max(x1, s[0] * S); y0 = Math.min(y0, s[1] * S); y1 = Math.max(y1, s[1] * S); }
    const pad = o.layer === 'shadow' ? 30 : 6; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(x1 - x0)} ${fmt(y1 - y0)}" width="${Math.ceil(x1 - x0)}" height="${Math.ceil(y1 - y0)}"><defs>${filterDefs(pre)}</defs>${body}</svg>`, anchor: [-x0, -y0] };
  }
  function pivotScreen(size, dir, S = 3) { const c = chassis[size].build(ctxFor({ team: '#33d17a' })); const p = proj(rotZ(c.pivot, dirAngle(dir))); return [p[0] * S, p[1] * S]; }

  // ------------------------------------------------------------ live instance (viewer / game preview)
  let counter = 0;
  function create(el, opts = {}) {
    const o = Object.assign({ size: 'light', type: 'panzer', team: '#33d17a', hp: 100, hull: 4, turret: 4, S: 3, grid: true, onEvent: null }, opts);
    const pre = 'vu' + (++counter) + '-';
    const ns = 'http://www.w3.org/2000/svg';
    const st = { frame: 0, dist: 0, driving: false, recoil: 0, lift: 0, liftT: 0, aimT: o.turret, turnAcc: 0, autoTurn: false, wreckT: 0, exploding: 0, flashes: [], parts: [], embers: [], alive: true };
    const emit = (e, d) => o.onEvent && o.onEvent(e, d);
    const dmgOf = hp => (hp <= 0 ? 3 : hp <= 30 ? 2 : hp <= 60 ? 1 : 0);
    // fixed viewBox sized for the heavy chassis so sizes keep their true relative scale
    const vb = (() => {   // fits the heavy chassis + longest turret in every direction, so sizes keep their true relative scale
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const big = Object.keys(weapons).reduce((m, t) => m || t, null);
      for (let d = 0; d < DIRS; d += 2) {
        const pv = pivotScreen('heavy', d, o.S);
        const hp = hullParts({ size: 'heavy', team: o.team, dir: d }).parts, tp = turretParts({ size: 'heavy', type: big, team: o.team, dir: d }).parts;
        for (const [ps, off] of [[hp, [0, 0]], [tp, pv]]) for (const p of ps) for (const f of p.faces) for (const q of f.pts) { const r = proj(q); const x = r[0] * o.S + off[0], y = r[1] * o.S + off[1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      const w = x1 - x0, h = y1 - y0;
      return [x0 - w * 0.06, y0 - h * 0.22, w * 1.12, h * 1.3];
    })();
    el.innerHTML = `<svg xmlns="${ns}" viewBox="${vb.map(fmt).join(' ')}" class="vu-svg">
      <defs>${filterDefs(pre)}
        <radialGradient id="${pre}smoke"><stop offset="0" stop-color="#9aa2aa" stop-opacity=".75"/><stop offset=".6" stop-color="#7d858d" stop-opacity=".35"/><stop offset="1" stop-color="#6b7179" stop-opacity="0"/></radialGradient>
        <radialGradient id="${pre}bsmoke"><stop offset="0" stop-color="#3a3532" stop-opacity=".95"/><stop offset=".55" stop-color="#2e2a27" stop-opacity=".6"/><stop offset="1" stop-color="#2a2623" stop-opacity="0"/></radialGradient>
        <radialGradient id="${pre}fire"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#ffcc4d"/><stop offset=".7" stop-color="#ff7a1a" stop-opacity=".85"/><stop offset="1" stop-color="#d23a0a" stop-opacity="0"/></radialGradient>
        <radialGradient id="${pre}flash"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff1a8"/><stop offset=".7" stop-color="#ffb02e" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="vu-grid"></g><g class="vu-shadow"></g><g class="vu-body"><g class="vu-hull"></g><g class="vu-turret"><g class="vu-tin"></g></g></g><g class="vu-fx" style="mix-blend-mode:normal"></g><g class="vu-fx2" style="mix-blend-mode:screen"></g>
    </svg>`;
    const svg = el.querySelector('svg'), gGrid = svg.querySelector('.vu-grid'), gShadow = svg.querySelector('.vu-shadow'), gBody = svg.querySelector('.vu-body'),
      gHull = svg.querySelector('.vu-hull'), gTur = svg.querySelector('.vu-turret'), gTin = svg.querySelector('.vu-tin'), gFx = svg.querySelector('.vu-fx'), gFx2 = svg.querySelector('.vu-fx2');
    const cache = new Map();
    const key = (...a) => a.join('|');
    let trackEls = [];
    function drawGrid() {
      if (!o.grid) { gGrid.innerHTML = ''; return; }
      const T = 24 * o.S, N = 12; let s = '';
      for (let i = -N; i <= N; i++) { const a = proj([i * T / o.S, -N * T / o.S, 0]), b = proj([i * T / o.S, N * T / o.S, 0]), c = proj([-N * T / o.S, i * T / o.S, 0]), d = proj([N * T / o.S, i * T / o.S, 0]);
        s += `<path d="M${fmt(a[0] * o.S)} ${fmt(a[1] * o.S)}L${fmt(b[0] * o.S)} ${fmt(b[1] * o.S)}M${fmt(c[0] * o.S)} ${fmt(c[1] * o.S)}L${fmt(d[0] * o.S)} ${fmt(d[1] * o.S)}"/>`; }
      gGrid.innerHTML = `<g class="vu-gridin" stroke="#3a4558" stroke-width="1" opacity=".55">${s}</g>`;
    }
    function hullKey(frame) { return key('h', o.size, o.team, dmgOf(o.hp), o.hull, frame); }
    function drawHull() {
      const dmg = dmgOf(o.hp);
      const k = hullKey(st.frame);
      let list = cache.get(k);
      if (!list) { list = renderHull({ size: o.size, team: o.team, dir: o.hull, dmg, frame: st.frame, S: o.S, prefix: pre + 'h' }); cache.set(k, list); }
      gHull.innerHTML = list.map(p => `<g data-p="${p.id}">${p.svg}</g>`).join('');
      trackEls = list.map((p, i) => (p.animated ? [i, p.id] : null)).filter(Boolean).map(([i, id]) => gHull.children[i]);
      gShadow.innerHTML = groundShadow({ size: o.size, dir: o.hull, S: o.S, prefix: pre, dmg });
      placeTurret();
    }
    function updateTracks() {
      const dmg = dmgOf(o.hp), k = hullKey(st.frame);
      let list = cache.get(k);
      if (!list) { list = renderHull({ size: o.size, team: o.team, dir: o.hull, dmg, frame: st.frame, S: o.S, prefix: pre + 'h' }); cache.set(k, list); }
      const anim = list.filter(p => p.animated);
      trackEls.forEach((g, i) => { if (anim[i]) g.innerHTML = anim[i].svg; });
    }
    let pivot = [0, 0];
    function wreckExtra() { return dmgOf(o.hp) === 3 ? 0.42 : 0; }
    function drawTurret() {
      const dmg = dmgOf(o.hp), k = key('t', o.size, o.type, o.team, dmg, o.turret);
      let list = cache.get(k);
      if (!list) { list = renderTurret({ size: o.size, type: o.type, team: o.team, dir: o.turret, dmg, S: o.S, prefix: pre + 't', extraAngle: wreckExtra() }); cache.set(k, list); }
      gTin.innerHTML = list.map(p => p.svg).join('');
    }
    function placeTurret() { pivot = pivotScreen(o.size, o.hull, o.S); if (dmgOf(o.hp) === 3) { pivot = [pivot[0] - 3, pivot[1] + 2]; } applyTransforms(); }
    function applyTransforms() {
      const a = dirAngle(o.turret), back = proj([-Math.cos(a), -Math.sin(a), 0]);
      const rk = st.recoil;   // 0..1 envelope
      const tr = [back[0] * 1.5 * o.S * rk, back[1] * 1.5 * o.S * rk], hr = [back[0] * 0.55 * o.S * rk, back[1] * 0.55 * o.S * rk];
      gBody.setAttribute('transform', `translate(${fmt(hr[0])} ${fmt(hr[1])})`);
      gTur.setAttribute('transform', `translate(${fmt(pivot[0] + tr[0] - hr[0])} ${fmt(pivot[1] + tr[1] - hr[1] - st.lift * o.S)})`);
    }
    function redraw() { drawHull(); drawTurret(); }

    // ---- effects
    const rnd = Math.random;
    function worldToScreen(p) { const q = proj(p); return [q[0] * o.S, q[1] * o.S]; }
    function spawn(kind, x, y, extra = {}) { st.parts.push(Object.assign({ kind, x, y, vx: 0, vy: 0, t: 0, life: 1, r: 4, r1: 12 }, extra)); }
    const fpCache = new Map();
    function firePoints() { const k = o.size + '|' + o.hull; if (!fpCache.has(k)) { const h = hullParts({ size: o.size, team: o.team, dir: o.hull }); fpCache.set(k, h.firePts.map(worldToScreen)); } return fpCache.get(k); }
    function muzzlePoints() {
      const t = turretParts({ size: o.size, type: o.type, team: o.team, dir: o.turret, extraAngle: wreckExtra() });
      return t.muzzles.map(m => { const s = worldToScreen(m); return [s[0] + pivot[0], s[1] + pivot[1]]; });
    }
    function fire() {
      if (dmgOf(o.hp) === 3 || st.exploding) return false;
      const ms = muzzlePoints(), a = dirAngle(o.turret), fwd = proj([Math.cos(a), Math.sin(a), 0]);
      ms.forEach((m, i) => setTimeout(() => {
        st.flashes.push({ x: m[0], y: m[1], t: 0, fwd });
        for (let k = 0; k < 4; k++) spawn('msmoke', m[0], m[1], { vx: fwd[0] * (20 + rnd() * 25) + (rnd() - 0.5) * 10, vy: fwd[1] * (20 + rnd() * 25) - 8 - rnd() * 8, life: 0.9 + rnd() * 0.6, r: 3, r1: 12 + rnd() * 6 });
        if (i === 0) st.recoilT = 0;
      }, i * 70));
      emit('fire', { barrels: ms.length });
      return true;
    }
    function explode() {
      const c = worldToScreen([0, 0, chassis[o.size].dims.H * 0.6]);
      st.exploding = 1.2;
      const K = chassis[o.size].dims.L / 64;
      for (let i = 0; i < 11; i++) spawn('ball', c[0] + (rnd() - 0.5) * 70 * K, c[1] + (rnd() - 0.5) * 45 * K, { life: 0.55 + rnd() * 0.55, r: 10, r1: (55 + rnd() * 55) * K, delay: i * 0.045 });
      for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, v = 120 + rnd() * 220; spawn('debris', c[0], c[1], { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 120, life: 0.6 + rnd() * 0.7, r: 1.4 + rnd() * 1.6 }); }
      for (let i = 0; i < 14; i++) spawn('bsmoke', c[0] + (rnd() - 0.5) * 60 * K, c[1] - 10, { vy: -35 - rnd() * 35, vx: (rnd() - 0.5) * 25, life: 2.2 + rnd() * 1.8, r: 14, r1: (60 + rnd() * 40) * K, delay: 0.15 + rnd() * 0.3 });
      emit('destroyed');
    }

    // ---- loop
    let last = 0, raf = 0, emitAcc = 0, flameT = 0;
    function loop(ts) {
      if (!st.alive) return;
      const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
      const dmg = dmgOf(o.hp);
      // driving: distance-driven 3-frame tracks + scrolling ground
      if (st.driving && dmg < 3) {
        const sp = (chassis[o.size].speed || 1) * (dmg === 2 ? 0.65 : 1) * 46;   // world units / s
        st.dist += sp * dt;
        const fr = Math.floor(st.dist / 2.2) % 3;
        if (fr !== st.frame) { st.frame = fr; updateTracks(); }
        const a = dirAngle(o.hull), T = 24, gx = ((-Math.cos(a) * st.dist) % T + T) % T, gy = ((-Math.sin(a) * st.dist) % T + T) % T, g = proj([gx, gy, 0]);
        const gi = gGrid.firstChild; if (gi) gi.setAttribute('transform', `translate(${fmt(g[0] * o.S)} ${fmt(g[1] * o.S)})`);
        if (dmg < 3 && rnd() < dt * 6) { const b = worldToScreen(rotZ([-chassis[o.size].dims.L * 0.5, 0, 1], dirAngle(o.hull))); spawn('dust', b[0] + (rnd() - 0.5) * 20, b[1], { vx: (rnd() - 0.5) * 10, vy: -6, life: 1.2, r: 4, r1: 16 }); }
      }
      // auto hull turn
      if (st.autoTurn && dmg < 3) { st.turnAcc += dt; if (st.turnAcc > 0.12) { st.turnAcc = 0; o.hull = (o.hull + 1) % DIRS; if (st.follow) o.turret = o.hull, st.aimT = o.hull; drawHull(); if (st.follow) drawTurret(); } }
      // turret slews toward its aim target (one direction step at a time)
      if (o.turret !== st.aimT && dmg < 3) {
        st.slew = (st.slew || 0) + dt;
        if (st.slew > 0.035) { st.slew = 0; const d = ((st.aimT - o.turret + DIRS * 1.5) % DIRS) - DIRS / 2; o.turret = (o.turret + Math.sign(d) + DIRS) % DIRS; drawTurret(); applyTransforms(); }
      }
      // recoil envelope (~0.45 s)
      if (st.recoilT !== undefined) { st.recoilT += dt; const t = st.recoilT; st.recoil = t < 0.06 ? t / 0.06 : Math.max(0, 1 - (t - 0.06) / 0.39); if (t > 0.45) { st.recoil = 0; st.recoilT = undefined; } applyTransforms(); }
      // exploded view lift
      const lt = st.liftT; if (Math.abs(st.lift - lt) > 0.05) { st.lift += (lt - st.lift) * Math.min(1, dt * 8); applyTransforms(); }
      // damage emitters
      emitAcc += dt;
      const fps = firePoints();
      if (dmg >= 1 && emitAcc > (dmg === 1 ? 0.22 : dmg === 2 ? 0.07 : 0.12)) {
        emitAcc = 0;
        const p = fps[Math.floor(rnd() * (dmg === 1 ? 1 : fps.length))];
        spawn(dmg === 1 ? 'smoke' : 'bsmoke', p[0] + (rnd() - 0.5) * 6, p[1] - 4, { vx: 6 + (rnd() - 0.5) * 8, vy: -28 - rnd() * 18, life: dmg === 3 ? 2.6 : 2 + rnd(), r: 5, r1: dmg === 1 ? 22 : 32 + rnd() * 14 });
        if (dmg >= 2 && rnd() < 0.7) spawn('ember', p[0] + (rnd() - 0.5) * 8, p[1] - 6, { vx: (rnd() - 0.5) * 30, vy: -40 - rnd() * 50, life: 0.6 + rnd() * 0.6, r: 0.9 + rnd() * 0.8 });
      }
      if (st.exploding) st.exploding = Math.max(0, st.exploding - dt);
      // wreck timer -> respawn
      if (dmg === 3 && st.wreckT > 0) { st.wreckT -= dt; if (st.wreckT <= 0) { emit('respawn'); setHp(100); } }
      // draw fx
      let s = '', s2 = '';
      st.parts = st.parts.filter(p => { if (p.delay > 0) { p.delay -= dt; return true; } p.t += dt; return p.t < p.life; });
      for (const p of st.parts) {
        if (p.delay > 0) continue;
        const k = p.t / p.life; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'debris') { p.vy += 380 * dt; s2 += `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(p.r)}" fill="#ffb347" opacity="${fmt(1 - k)}"/>`; continue; }
        if (p.kind === 'ember') { p.vx *= 0.98; s2 += `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(p.r)}" fill="#ffb347" opacity="${fmt(1 - k)}"/>`; continue; }
        const r = p.r + (p.r1 - p.r) * Math.sqrt(k);
        if (p.kind === 'ball') { s2 += `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}" fill="url(#${pre}fire)" opacity="${fmt(1 - k * k)}"/>`; continue; }
        const g = p.kind === 'bsmoke' ? 'bsmoke' : 'smoke';
        const op = p.kind === 'dust' ? 0.35 * (1 - k) : p.kind === 'msmoke' ? 0.7 * (1 - k) : (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.9;
        s += `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}" fill="url(#${pre}${g})" opacity="${fmt(op)}"/>`;
      }
      // flames on burning hull
      flameT += dt;
      if (dmg === 2 || (dmg === 3 && st.exploding > 0)) {
        fps.forEach((p, i) => {
          const fl = 0.75 + 0.25 * Math.sin(flameT * 17 + i * 2.1) + 0.12 * Math.sin(flameT * 31 + i), h = (dmg === 2 ? 30 : 44) * fl, w = 10 + 2.5 * Math.sin(flameT * 23 + i);
          s2 += `<path d="M${fmt(p[0] - w)} ${fmt(p[1])}C${fmt(p[0] - w)} ${fmt(p[1] - h * 0.5)} ${fmt(p[0] - 1)} ${fmt(p[1] - h * 0.7)} ${fmt(p[0] + Math.sin(flameT * 9 + i) * 2)} ${fmt(p[1] - h)}C${fmt(p[0] + 2)} ${fmt(p[1] - h * 0.6)} ${fmt(p[0] + w)} ${fmt(p[1] - h * 0.45)} ${fmt(p[0] + w)} ${fmt(p[1])}Z" fill="url(#${pre}fire)" opacity=".95"/>`;
          s2 += `<ellipse cx="${fmt(p[0])}" cy="${fmt(p[1] - 2)}" rx="${fmt(w * 1.8)}" ry="${fmt(w)}" fill="#ff8a1a" opacity="${fmt(0.18 + 0.08 * fl)}"/>`;
        });
      }
      // muzzle flashes
      st.flashes = st.flashes.filter(f => (f.t += dt) < 0.12);
      for (const f of st.flashes) {
        const k = 1 - f.t / 0.12, L = 16 * k + 6, cx = f.x + f.fwd[0] * L * 0.6, cy = f.y + f.fwd[1] * L * 0.6;
        s2 += `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(L)}" ry="${fmt(L * 0.55)}" transform="rotate(${fmt(Math.atan2(f.fwd[1], f.fwd[0]) * 180 / Math.PI)} ${fmt(cx)} ${fmt(cy)})" fill="url(#${pre}flash)"/>`;
        s2 += `<circle cx="${fmt(f.x)}" cy="${fmt(f.y)}" r="${fmt(7 * k + 3)}" fill="#fff8d0" opacity="${fmt(k)}"/>`;
      }
      if (st.exploding > 0.9) s2 += `<circle cx="0" cy="${fmt(-chassis[o.size].dims.H * o.S * 0.6)}" r="${fmt(260 * (1.2 - st.exploding))}" fill="url(#${pre}flash)" opacity="${fmt((st.exploding - 0.9) * 3)}"/>`;
      gFx.innerHTML = s; gFx2.innerHTML = s2;
      raf = requestAnimationFrame(loop);
    }

    function setHp(v) {
      const before = dmgOf(o.hp); o.hp = Math.max(0, Math.min(100, v)); const now = dmgOf(o.hp);
      if (now !== before) {
        if (now === 3) { explode(); st.wreckT = 12; setTimeout(() => { if (dmgOf(o.hp) === 3) redraw(); }, 160); }
        else { st.wreckT = 0; redraw(); }
        emit('state', ['intact', 'damaged', 'burning', 'destroyed'][now]);
      }
    }

    drawGrid(); redraw(); raf = requestAnimationFrame(loop);
    const api = {
      get size() { return o.size; }, get type() { return o.type; }, get team() { return o.team; }, get hp() { return o.hp; },
      get hull() { return o.hull; }, get turret() { return o.turret; }, get damageLevel() { return dmgOf(o.hp); }, get wreckTime() { return st.wreckT; },
      setSize(s) { o.size = s; cache.clear(); redraw(); }, setType(t) { o.type = t; drawTurret(); },
      setTeam(c) { o.team = c; cache.clear(); redraw(); }, setHealth: setHp,
      setHull(d) { o.hull = ((d % DIRS) + DIRS) % DIRS; drawHull(); }, rotate(k) { api.setHull(o.hull + k); },
      setTurret(d) { o.turret = st.aimT = ((d % DIRS) + DIRS) % DIRS; drawTurret(); applyTransforms(); },
      aimAt(d) { st.aimT = ((d % DIRS) + DIRS) % DIRS; },
      // aim at a point in svg user space (e.g. pointer) -> nearest of 32 directions
      aimAtPoint(x, y) { const u = x / o.S / C, v = 2 * y / o.S, wx = (u + v) / 2, wy = (v - u) / 2; api.aimAt(Math.round(Math.atan2(wy, wx) / (Math.PI * 2 / DIRS))); },
      clientToSvg(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const m = svg.getScreenCTM(); if (!m) return [0, 0]; const q = p.matrixTransform(m.inverse()); return [q.x, q.y]; },
      setDriving(b) { st.driving = !!b; }, setAutoTurn(b, follow) { st.autoTurn = !!b; st.follow = !!follow; },
      setExploded(b) { st.liftT = b ? chassis[o.size].dims.H * 1.2 : 0; },
      setGrid(b) { o.grid = !!b; drawGrid(); },
      fire, respawn() { setHp(100); },
      toSVGString() { const c = svg.cloneNode(true); c.querySelector('.vu-fx').innerHTML = ''; c.querySelector('.vu-fx2').innerHTML = ''; return new XMLSerializer().serializeToString(c); },
      destroy() { st.alive = false; cancelAnimationFrame(raf); el.innerHTML = ''; },
    };
    return api;
  }

  global.VectorUnit = {
    V, proj, rotZ, mix, shade, paintOf, unitPaint, lit, VIEW, OUT, fmt, PAL, DIRS, dirAngle,
    part, tubeX, box, loft, prismZ, extrudeX, extrudeY, cylZ, cylY, ngon, place, depthSort, renderParts,
    chassis, weapons, renderHull, renderPartsRaw: (p, c) => renderParts(p, c), renderTurret, groundShadow, sprite, pivotScreen, create,
  };
})(typeof window !== 'undefined' ? window : globalThis);
