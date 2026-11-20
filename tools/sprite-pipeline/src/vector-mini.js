/* VectorMini — a small stand-in for the game's VectorEngine, following the
 * art style guide: 2:1 iso projection, convex prisms, world-space lighting,
 * dark outlines, team paint, seeded weathering, decals on faces.
 * Works in the browser (window.VectorMini) and in Node (require()).
 *
 * In the real project, replace the models below with your own specs and call
 * their toSVGString() from the bake script instead.
 */
(function (root) {
  'use strict';

  // ---------- math ----------
  const proj = (p) => [(p[0] - p[1]) * 0.866, (p[0] + p[1]) * 0.5 - p[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const centroid = (pts) => mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  const LIGHT = norm([0.35, 0.6, 1]);
  const VIEW = [1, 1, 1]; // faces with n·VIEW > 0 face the camera

  function rotZ(p, ang, cx = 0, cy = 0) {
    const c = Math.cos(ang), s = Math.sin(ang), x = p[0] - cx, y = p[1] - cy;
    return [cx + x * c - y * s, cy + x * s + y * c, p[2]];
  }
  const rotN = (n, ang) => rotZ(n, ang);

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- colour ----------
  const hex2rgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
  const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => rgb2hex(hex2rgb(h).map((v) => v * k));
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
  function hsl(h, s, l) {
    const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return rgb2hex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  // Team paint per the style guide (clean, saturated, equally bright; red/purple softened)
  const TEAMS = {
    green:  { paint: hsl(128, 0.62, 0.40) },
    blue:   { paint: hsl(212, 0.72, 0.47) },
    red:    { paint: hsl(358, 0.50, 0.44) },
    purple: { paint: hsl(282, 0.46, 0.56) },
  };
  for (const k in TEAMS) TEAMS[k].light = mix(TEAMS[k].paint, '#ffffff', 0.5);
  const CHARRED = { paint: '#4a423b', light: '#2e2925' }; // burned-out wreck: paint gone, lights dead
  // layered buildings are baked with marker colours; the passes below split them into separate layers
  const LAYER = { paint: '#7f7f81', light: '#fe01fe' };

  const C = {
    outline: '#0b0e13', plate: '#6b7785', trim: '#808c9a', dark: '#38404a', interior: '#161a20',
    padTop: '#3a414a', padSide: '#272c33', padGrid: '#2c3239', padEdge: '#5a636d',
    hazard: '#f2c230', hazardDark: '#16181b', seal: '#3a4148', sealHi: '#59616a', bare: '#aab2ba', chevron: '#c3c9cf',
  };

  // ---------- builders ----------
  let partSeq = 0;
  function makePart(faces, opts) {
    const all = faces.flat();
    const c = centroid(all);
    const out = { id: ++partSeq, faces: [], decals: [], layer: opts.layer || 0, center: c, painted: !!opts.painted, moving: !!opts.moving, fanHousing: !!opts.fanHousing };
    faces.forEach((pts, i) => {
      let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      if (dot(n, sub(centroid(pts), c)) < 0) { n = mul(n, -1); pts = pts.slice().reverse(); }
      if (opts.noTop && n[2] > 0.95) return;
      if (opts.noBottom !== false && n[2] < -0.95) return; // bottoms are never visible
      const color = n[2] > 0.95 ? (opts.colorTop || opts.color) : (opts.colorSide || opts.color);
      const face = { pts, n, color, emissive: !!opts.emissive };
      out.faces.push(face);
      if (opts.weather) weatherFace(out, face, opts.weather, (opts.seed || 1) * 131 + i * 17);
      if (opts.dmg) damageFace(out, face, opts.dmg, (opts.seed || 1) * 977 + i * 31);
    });
    return out;
  }
  function box(x0, x1, y0, y1, z0, z1, opts = {}) {
    const v = (x, y, z) => [x, y, z];
    return makePart([
      [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)],
      [v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0)],
      [v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)],
      [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)],
      [v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0)],
      [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)],
    ], opts);
  }
  // Extrude a convex 2D profile along an axis. axis 'x': profile=(y,z); 'y': (x,z); 'z': (x,y)
  function prism(profile, axis, a0, a1, opts = {}) {
    const P = (q, a) => axis === 'x' ? [a, q[0], q[1]] : axis === 'y' ? [q[0], a, q[1]] : [q[0], q[1], a];
    const faces = [profile.map((q) => P(q, a0)), profile.map((q) => P(q, a1))];
    for (let i = 0; i < profile.length; i++) {
      const q0 = profile[i], q1 = profile[(i + 1) % profile.length];
      faces.push([P(q0, a0), P(q1, a0), P(q1, a1), P(q0, a1)]);
    }
    return makePart(faces, opts);
  }
  const ngon = (cx, cy, r, n, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  function rotatePart(part, ang, cx, cy) {
    part.faces.forEach((f) => { f.pts = f.pts.map((p) => rotZ(p, ang, cx, cy)); f.n = rotN(f.n, ang); });
    part.decals.forEach((d) => { if (d.pts) d.pts = d.pts.map((p) => rotZ(p, ang, cx, cy)); if (d.c) d.c = rotZ(d.c, ang, cx, cy); if (d.n) d.n = rotN(d.n, ang); });
    part.center = rotZ(part.center, ang, cx, cy);
    return part;
  }
  // decal helpers (n = face normal, used for culling)
  const D = {
    poly: (pts, fill, n, op = 1, extra = {}) => ({ t: 'poly', pts, fill, n, op, ...extra }),
    line: (pts, stroke, sw, n, op = 1) => ({ t: 'line', pts, stroke, sw, n, op }),
    glow: (pts, stroke, sw, n) => ({ t: 'glow', pts, stroke, sw, n }),
    dot: (c, r, fill, n, op = 1) => ({ t: 'dot', c, r, fill, n, op }),
  };
  // circle in a world plane (centre c, axes u, v)
  const circle3 = (c, u, v, r, n = 16, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return add(c, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))); });

  // ---------- weathering (procedural, seeded per face) ----------
  function pip(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function clipBelow(poly, t) { // keep v <= t
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ai = a[1] <= t, bi = b[1] <= t;
      if (ai) out.push(a);
      if (ai !== bi) { const k = (t - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * k, t]); }
    }
    return out;
  }
  function weatherFace(part, face, strength, seed) {
    const n = face.n, R = rng(seed);
    const isTop = n[2] > 0.95;
    const h = isTop ? [1, 0, 0] : norm(cross([0, 0, 1], n));
    const w = isTop ? [0, 1, 0] : cross(n, h); // w points "up" the face
    const d = dot(face.pts[0], n) + 0.02;
    const to3 = (u, v) => add(add(mul(h, u), mul(w, v)), mul(n, d));
    const poly = face.pts.map((p) => [dot(p, h), dot(p, w)]);
    const us = poly.map((q) => q[0]), vs = poly.map((q) => q[1]);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    const W = u1 - u0, H = v1 - v0, area = W * H;
    if (area < 4) return;
    const count = (k) => Math.max(1, Math.round(Math.min(10, (area / 35) * k * strength)));
    const rp = (umar = 0.08, vlo = 0, vhi = 1) => [u0 + W * (umar + R() * (1 - 2 * umar)), v0 + H * (vlo + R() * (vhi - vlo))];
    const inside = (q) => pip(q, poly);
    const push = (dcl) => part.decals.push(Object.assign(dcl, { weather: true }));

    if (!isTop) {
      const g = clipBelow(poly, v0 + H * 0.42);
      if (g.length > 2) push(D.poly(g.map((q) => to3(q[0], q[1])), '#000000', n, 0.13 * strength));
      for (let i = 0; i < count(1.2); i++) { // dark streaks running down
        const u = u0 + W * (0.06 + R() * 0.88), vs0 = v1 - H * (0.04 + R() * 0.25), len = H * (0.18 + R() * 0.35);
        const a = [u, vs0], b = [u + (R() - 0.5) * 0.3, vs0 - len];
        if (inside(a) && inside(b)) push(D.line([to3(...a), to3(...b)], '#1a1410', 0.22 + R() * 0.2, n, 0.25 * strength));
      }
      for (let i = 0; i < count(0.5); i++) { // rust spots with drips
        const q = rp(0.1, 0.25, 0.9); if (!inside(q)) continue;
        const r = 0.25 + R() * 0.35;
        push(D.dot(to3(...q), r, '#8a4b25', n, 0.55 * strength));
        const b = [q[0], q[1] - H * (0.08 + R() * 0.15)];
        if (inside(b)) push(D.line([to3(...q), to3(...b)], '#7a4022', 0.18, n, 0.4 * strength));
      }
      for (let i = 0; i < count(1.4); i++) { // chipped paint along the top edge
        const u = u0 + W * R(), v = v1 - R() * H * 0.08, s = 0.25 + R() * 0.45;
        const q = [[u, v], [u + s, v - s * 0.3], [u + s * 0.6, v - s * 0.8], [u - s * 0.3, v - s * 0.5]];
        if (q.every(inside)) push(D.poly(q.map((p) => to3(...p)), C.bare, n, 0.7 * strength));
      }
    } else {
      for (let i = 0; i < count(0.35); i++) { const q = rp(0.15, 0.15, 0.85); if (inside(q)) push(D.dot(to3(...q), 1 + R() * 2, '#9a8f7a', n, 0.12 * strength)); }
      for (let i = 0; i < count(0.3); i++) { const q = rp(0.1, 0.1, 0.9); if (inside(q)) push(D.dot(to3(...q), 0.25 + R() * 0.3, '#8a4b25', n, 0.5 * strength)); }
    }
    for (let i = 0; i < count(0.6); i++) { // light scratches
      const a = rp(0.1, 0.1, 0.9), ang = R() * Math.PI, l = 0.6 + R() * 1.4;
      const b = [a[0] + Math.cos(ang) * l, a[1] + Math.sin(ang) * l];
      if (inside(a) && inside(b)) push(D.line([to3(...a), to3(...b)], '#d0d6dc', 0.12, n, 0.35 * strength));
    }
  }

  // ---------- battle damage (seeded per face; level 2 keeps every level-1 mark and adds more) ----------
  function clipConvex(subject, clip) { // Sutherland–Hodgman against a convex polygon (2D)
    let out = subject;
    const area = clip.reduce((s, p, i) => { const q = clip[(i + 1) % clip.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const sgn = area >= 0 ? 1 : -1;
    for (let i = 0; i < clip.length && out.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length], inp = out; out = [];
      const side = (p) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
      for (let j = 0; j < inp.length; j++) {
        const p = inp[j], q = inp[(j + 1) % inp.length], pi = side(p), qi = side(q);
        if (pi) out.push(p);
        if (pi !== qi) {
          const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
          const t = d1 / (d1 - d2); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
    }
    return out;
  }
  function damageFace(part, face, level, seed) {
    const n = face.n, isTop = n[2] > 0.95;
    const h = isTop ? [1, 0, 0] : norm(cross([0, 0, 1], n)), w = isTop ? [0, 1, 0] : cross(n, h);
    const d = dot(face.pts[0], n) + 0.03;
    const to3 = (u, v) => add(add(mul(h, u), mul(w, v)), mul(n, d));
    const poly = face.pts.map((p) => [dot(p, h), dot(p, w)]);
    const us = poly.map((q) => q[0]), vs = poly.map((q) => q[1]);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), W = u1 - u0, H = v1 - v0;
    if (W * H < 5) return;
    const inside = (q) => pip(q, poly);
    const count = (k) => Math.min(6 * level, Math.max(1, Math.round((W * H) / 40 * k * level)));
    const rp = (R) => [u0 + W * (0.1 + R() * 0.8), v0 + H * (0.1 + R() * 0.8)];
    const push = (x) => part.decals.push(Object.assign(x, { dmg: true }));
    if (level === 2) push(D.poly(face.pts.map((p) => add(p, mul(n, 0.02))), '#0c0a08', n, 0.22)); // soot over the whole face
    let R = rng(seed + 1); // scorch marks
    for (let i = 0, c = count(0.9); i < c; i++) {
      const ctr = rp(R), r = (1.6 + R() * 2.4) * (level === 2 ? 1.25 : 1), rot = R() * 6;
      const blob = Array.from({ length: 11 }, (_, k) => { const a = rot + (k / 11) * Math.PI * 2, rr = r * (0.65 + R() * 0.5); return [ctr[0] + Math.cos(a) * rr, ctr[1] + Math.sin(a) * rr * 0.8]; });
      const cl = clipConvex(blob, poly);
      if (cl.length > 2) push(D.poly(cl.map((q) => to3(...q)), '#120e0a', n, 0.5));
      const core = clipConvex(blob.map((q) => [ctr[0] + (q[0] - ctr[0]) * 0.5, ctr[1] + (q[1] - ctr[1]) * 0.5]), poly);
      if (core.length > 2) push(D.poly(core.map((q) => to3(...q)), '#0a0806', n, 0.5));
    }
    R = rng(seed + 2); // shell holes (level 2: some still glowing)
    for (let i = 0, c = count(0.8); i < c; i++) {
      const q = rp(R), r = 0.45 + R() * 0.4, ember = R() < 0.55;
      if (!inside(q)) continue;
      push(D.dot(to3(...q), r * 1.7, '#7a6e64', n, 0.85));
      push(D.dot(to3(...q), r, '#070707', n));
      if (level === 2 && ember) { push(D.dot(to3(...q), r * 2.4, '#ffb347', n, 0.3)); push(D.dot(to3(...q), r * 0.6, '#ff7a1a', n)); }
    }
    R = rng(seed + 3); // cracks
    for (let i = 0, c = count(0.35); i < c; i++) {
      let p = rp(R); const pts = [p]; let a = R() * 6;
      for (let k = 0; k < 3; k++) { a += (R() - 0.5) * 1.4; const l = 0.6 + R() * 1.0; p = [p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l]; pts.push(p); }
      if (pts.every(inside)) push(D.line(pts.map((q) => to3(...q)), '#0d0c0b', 0.16, n, 0.9));
    }
    R = rng(seed + 4); // gouges to bare metal
    for (let i = 0, c = count(0.35); i < c; i++) {
      const a = rp(R), ang = R() * Math.PI, l = 0.8 + R() * 1.4, b = [a[0] + Math.cos(ang) * l, a[1] + Math.sin(ang) * l];
      if (inside(a) && inside(b)) push(D.line([to3(...a), to3(...b)], '#b9c0c6', 0.22, n, 0.6));
    }
  }

  // ---------- render ----------
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  const ptsStr = (pts) => pts.map((p) => { const s = proj(p); return f2(s[0]) + ',' + f2(s[1]); }).join(' ');
  function render(parts, angleDeg, overlay = false) {
    const ang = (angleDeg * Math.PI) / 180;
    parts.forEach((p) => rotatePart(p, ang, 0, 0));
    parts.sort((a, b) => a.layer - b.layer || (a.center[0] + a.center[1] + a.center[2] * 0.01) - (b.center[0] + b.center[1] + b.center[2] * 0.01));
    let svg = '';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (pts) => pts.forEach((p) => { const s = proj(p); if (s[0] < minX) minX = s[0]; if (s[0] > maxX) maxX = s[0]; if (s[1] < minY) minY = s[1]; if (s[1] > maxY) maxY = s[1]; });
    const visible = (n) => !n || dot(n, VIEW) > 0.01;
    for (const part of parts) {
      for (const f of part.faces) {
        if (!visible(f.n)) continue;
        if (overlay) continue;
        const col = f.emissive ? f.color : shade(f.color, 0.55 + 0.55 * Math.max(0, dot(f.n, LIGHT)));
        svg += `<polygon points="${ptsStr(f.pts)}" fill="${col}" stroke="${C.outline}" stroke-width="0.32" stroke-linejoin="round"/>`;
        grow(f.pts);
      }
      for (const d of part.decals) {
        if (!visible(d.n)) continue;
        if (overlay) { if (!d.dmg) continue; grow(d.pts || [d.c]); }
        const op = d.op != null && d.op < 1 ? ` opacity="${f2(d.op)}"` : '';
        if (d.t === 'poly') svg += `<polygon points="${ptsStr(d.pts)}" fill="${d.fill}"${d.stroke ? ` stroke="${d.stroke}" stroke-width="${d.sw || 0.15}"` : ''}${op}/>`;
        else if (d.t === 'line') svg += `<polyline points="${ptsStr(d.pts)}" fill="none" stroke="${d.stroke}" stroke-width="${d.sw}" stroke-linecap="round"${op}/>`;
        else if (d.t === 'glow') svg += `<polyline points="${ptsStr(d.pts)}" fill="none" stroke="${d.stroke}" stroke-width="${f2(d.sw * 3)}" stroke-linecap="round" opacity="0.28"/><polyline points="${ptsStr(d.pts)}" fill="none" stroke="${d.stroke}" stroke-width="${d.sw}" stroke-linecap="round"/>`;
        else if (d.t === 'dot') { const s = proj(d.c); svg += `<ellipse cx="${f2(s[0])}" cy="${f2(s[1])}" rx="${f2(d.r)}" ry="${f2(d.r * 0.75)}" fill="${d.fill}"${op}/>`; }
      }
    }
    return { svg, bbox: [minX, minY, maxX, maxY] };
  }

  // ---------- layered render passes ----------
  // One model, several transparent layers that stack back into the full picture:
  //   body   — everything except the parts below; painted armour in neutral grey
  //   mask   — painted armour only, in white with its shading + weathering (the game tints it: team colour)
  //   lights — team lights only, in white (the game tints it: team light colour; off = dark grey)
  //   dmg    — damage marks only (level 1 or 2, chosen by the build)
  //   star   — the upgrade star only
  //   fore   — parts nearer than the fans (stack, mast…), drawn again ON TOP of the rotating fan sprites
  // A layer's content is hidden wherever a nearer part covers it (SVG mask), so layers stay correct in depth.
  // Moving parts (fan blades, radar) are not in any layer: the game draws them as separate rotating sprites.
  const isLight = (d) => d.fill === LAYER.light || d.stroke === LAYER.light;
  function renderPass(parts, angleDeg, pass) {
    const ang = (angleDeg * Math.PI) / 180;
    parts.forEach((p) => rotatePart(p, ang, 0, 0));
    parts.sort((a, b) => a.layer - b.layer || (a.center[0] + a.center[1] + a.center[2] * 0.01) - (b.center[0] + b.center[1] + b.center[2] * 0.01));
    const visible = (n) => !n || dot(n, VIEW) > 0.01;
    const shadeOf = (f, base) => (f.emissive ? base : shade(base, 0.55 + 0.55 * Math.max(0, dot(f.n, LIGHT))));
    let svg = '', defs = '';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (pts) => pts.forEach((p) => { const s = proj(p); if (s[0] < minX) minX = s[0]; if (s[0] > maxX) maxX = s[0]; if (s[1] < minY) minY = s[1]; if (s[1] > maxY) maxY = s[1]; });
    const decalSvg = (d, recolor) => {
      const fill = recolor && d.fill && d.fill !== 'none' ? recolor : d.fill, stroke = recolor && d.stroke ? recolor : d.stroke;
      const op = d.op != null && d.op < 1 ? ` opacity="${f2(d.op)}"` : '';
      if (d.t === 'poly') return `<polygon points="${ptsStr(d.pts)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${d.sw || 0.15}"` : ''}${op}/>`;
      if (d.t === 'line') return `<polyline points="${ptsStr(d.pts)}" fill="none" stroke="${stroke}" stroke-width="${d.sw}" stroke-linecap="round"${op}/>`;
      if (d.t === 'glow') return `<polyline points="${ptsStr(d.pts)}" fill="none" stroke="${stroke}" stroke-width="${f2(d.sw * 3)}" stroke-linecap="round" opacity="0.28"/><polyline points="${ptsStr(d.pts)}" fill="none" stroke="${stroke}" stroke-width="${d.sw}" stroke-linecap="round"/>`;
      const s2 = proj(d.c); return `<ellipse cx="${f2(s2[0])}" cy="${f2(s2[1])}" rx="${f2(d.r)}" ry="${f2(d.r * 0.75)}" fill="${fill}"${op}/>`;
    };
    const lastFan = parts.reduce((m, p, i) => (p.fanHousing ? i : m), -1);
    parts.forEach((part, i) => {
      const faces = part.faces.filter((f) => visible(f.n));
      faces.forEach((f) => grow(f.pts)); // every pass shares the full model's frame
      if (part.moving) return;
      let content = '';
      if (pass === 'body') {
        for (const f of faces) content += `<polygon points="${ptsStr(f.pts)}" fill="${shadeOf(f, part.painted ? '#8a9096' : f.color)}" stroke="${C.outline}" stroke-width="0.32" stroke-linejoin="round"/>`;
        for (const d of part.decals) if (visible(d.n) && !d.dmg && !d.star && !d.moving && !isLight(d) && !(part.painted && d.weather)) content += decalSvg(d);
        svg += content; return; // body is plain painter's order: no masks needed
      }
      if (pass === 'fore') { // nearer than the last fan housing: redraw whole, so it covers the fan blades
        if (i <= lastFan || part.painted) return;
        for (const f of faces) svg += `<polygon points="${ptsStr(f.pts)}" fill="${shadeOf(f, f.color)}" stroke="${C.outline}" stroke-width="0.32" stroke-linejoin="round"/>`;
        for (const d of part.decals) if (visible(d.n) && !d.dmg && !d.star && !d.moving && !isLight(d)) svg += decalSvg(d);
        return;
      }
      if (pass === 'mask' && part.painted) {
        for (const f of faces) content += `<polygon points="${ptsStr(f.pts)}" fill="${shadeOf(f, '#ffffff')}" stroke="${C.outline}" stroke-width="0.32" stroke-linejoin="round"/>`;
        for (const d of part.decals) if (visible(d.n) && d.weather) content += decalSvg(d);
      }
      if (pass === 'lights') for (const d of part.decals) if (visible(d.n) && isLight(d)) content += decalSvg(d, '#ffffff');
      if (pass === 'dmg') for (const d of part.decals) if (visible(d.n) && d.dmg) content += decalSvg(d);
      if (pass === 'star') for (const d of part.decals) if (visible(d.n) && d.star) content += decalSvg(d);
      if (!content) return;
      // hide this content wherever a part drawn later (nearer) covers it
      let cover = parts.slice(i + 1).filter((q) => !q.moving).flatMap((q) => q.faces.filter((f) => visible(f.n)).map((f) => `<polygon points="${ptsStr(f.pts)}" fill="#000"/>`)).join('');
      // the paint layer also leaves holes for details fixed on the painted walls (gate, doors, trims), which stay in the body layer
      if (pass === 'mask') cover += part.decals.filter((d) => visible(d.n) && d.t === 'poly' && d.fill !== 'none' && (d.op == null || d.op >= 1) && !d.weather && !d.dmg && !d.star && !d.moving && !isLight(d)).map((d) => `<polygon points="${ptsStr(d.pts)}" fill="#000"/>`).join('');
      if (cover) { const id = `m${part.id}_${pass}`; defs += `<mask id="${id}" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800"><rect x="-400" y="-400" width="800" height="800" fill="#fff"/>${cover}</mask>`; svg += `<g mask="url(#${id})">${content}</g>`; }
      else svg += content;
    });
    return { svg: (defs ? `<defs>${defs}</defs>` : '') + svg, bbox: [minX, minY, maxX, maxY] };
  }
  // ---------- team-mask passes (one sprite per unit, coloured by a shader) ----------
  //   base — the full picture; team paint baked in light grey (#e6e6e6 + shading), team lights in white
  //   R    — mask of the team paint (white = tint with the team colour)
  //   G    — mask of the team lights (white = tint with the light colour)
  // Every pass draws the whole scene in painter's order, so nearer parts cover the masks correctly.
  function renderTeam(parts, angleDeg, pass) {
    const ang = (angleDeg * Math.PI) / 180;
    parts.forEach((p) => rotatePart(p, ang, 0, 0));
    parts.sort((a, b) => a.layer - b.layer || (a.center[0] + a.center[1] + a.center[2] * 0.01) - (b.center[0] + b.center[1] + b.center[2] * 0.01));
    const visible = (n) => !n || dot(n, VIEW) > 0.01;
    const shadeOf = (f, base) => (f.emissive ? base : shade(base, 0.55 + 0.55 * Math.max(0, dot(f.n, LIGHT))));
    let svg = '', minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (pts) => pts.forEach((p) => { const s = proj(p); if (s[0] < minX) minX = s[0]; if (s[0] > maxX) maxX = s[0]; if (s[1] < minY) minY = s[1]; if (s[1] > maxY) maxY = s[1]; });
    const dsvg = (d, fill, stroke) => {
      const op = d.op != null && d.op < 1 ? ` opacity="${f2(d.op)}"` : '';
      const F = fill ?? d.fill, S = stroke ?? d.stroke;
      if (d.t === 'poly') return `<polygon points="${ptsStr(d.pts)}" fill="${F}"${S ? ` stroke="${S}" stroke-width="${d.sw || 0.15}"` : ''}${op}/>`;
      if (d.t === 'line') return `<polyline points="${ptsStr(d.pts)}" fill="none" stroke="${S}" stroke-width="${d.sw}" stroke-linecap="round"${op}/>`;
      if (d.t === 'glow') return `<polyline points="${ptsStr(d.pts)}" fill="none" stroke="${S}" stroke-width="${f2(d.sw * 3)}" stroke-linecap="round" opacity="0.28"/><polyline points="${ptsStr(d.pts)}" fill="none" stroke="${S}" stroke-width="${d.sw}" stroke-linecap="round"/>`;
      const c = proj(d.c); return `<ellipse cx="${f2(c[0])}" cy="${f2(c[1])}" rx="${f2(d.r)}" ry="${f2(d.r * 0.75)}" fill="${F}"${op}/>`;
    };
    for (const part of parts) {
      for (const f of part.faces) {
        if (!visible(f.n)) continue;
        grow(f.pts);
        let col;
        if (pass === 'base') col = shadeOf(f, part.painted ? '#e6e6e6' : f.color);
        else col = pass === 'R' && part.painted ? '#ffffff' : '#000000';
        const stroke = pass === 'base' ? C.outline : col;
        svg += `<polygon points="${ptsStr(f.pts)}" fill="${col}" stroke="${stroke}" stroke-width="0.32" stroke-linejoin="round"/>`;
      }
      for (const d of part.decals) {
        if (!visible(d.n) || d.dmg || d.star) continue;
        const light = isLight(d);
        if (pass === 'base') svg += light ? dsvg(d, d.fill && d.fill !== 'none' ? '#ffffff' : d.fill, d.stroke ? '#ffffff' : d.stroke) : dsvg(d);
        else if (pass === 'R') { // lights and opaque details on the paint are NOT team paint
          if (light) svg += dsvg(d, d.fill && d.fill !== 'none' ? '#000000' : d.fill, d.stroke ? '#000000' : d.stroke);
          else if (part.painted && d.t === 'poly' && !d.weather && d.fill !== 'none' && (d.op == null || d.op >= 1)) svg += dsvg(d, '#000000', d.stroke ? '#000000' : null);
          else if (!part.painted && d.t === 'poly' && d.fill !== 'none' && (d.op == null || d.op >= 1)) svg += dsvg(d, '#000000', d.stroke ? '#000000' : null);
        } else if (pass === 'G') {
          if (light) svg += dsvg(d, d.fill && d.fill !== 'none' ? '#ffffff' : d.fill, d.stroke ? '#ffffff' : d.stroke);
          else if (d.t === 'poly' && d.fill !== 'none' && (d.op == null || d.op >= 1)) svg += dsvg(d, '#000000', d.stroke ? '#000000' : null);
        }
      }
    }
    return { svg, bbox: [minX, minY, maxX, maxY] };
  }

  // top-down parts that the game rotates itself (drawn flat, in world units; the game applies the iso projection)
  function flatPart(kind) {
    const blade = (a, r) => { const dir = [Math.cos(a), Math.sin(a)], side = [-Math.sin(a), Math.cos(a)]; const P2 = (u, v) => `${f2(dir[0] * u + side[0] * v)},${f2(dir[1] * u + side[1] * v)}`; return `<polygon points="${P2(0, 0.35 * r / 2.4)} ${P2(r, 0.9 * r / 2.4)} ${P2(r * 1.04, -0.2 * r / 2.4)} ${P2(0, -0.35 * r / 2.4)}" fill="${C.trim}" stroke="${C.outline}" stroke-width="0.12"/>`; };
    if (kind === 'fanBlades') return { svg: [0, 1, 2].map((b) => blade((b * Math.PI * 2) / 3, 2.45)).join('') + `<circle r="0.6" fill="${C.plate}" stroke="${C.outline}" stroke-width="0.12"/>`, box: [-2.7, -2.7, 5.4, 5.4] };
    if (kind === 'fanDisc') return { svg: `<circle r="2.75" fill="${C.interior}" stroke="${C.plate}" stroke-width="0.5"/>`, box: [-3.1, -3.1, 6.2, 6.2] };
    if (kind === 'fanRing') return { svg: `<circle r="2.95" fill="none" stroke="#fff" stroke-width="0.75" opacity="0.28"/><circle r="2.95" fill="none" stroke="#fff" stroke-width="0.25"/>`, box: [-3.5, -3.5, 7, 7] };
    if (kind === 'radar') return { svg: `<rect x="-2.8" y="-0.5" width="5.6" height="1" rx="0.2" fill="${C.plate}" stroke="${C.outline}" stroke-width="0.15"/><circle r="0.45" fill="${C.trim}"/>`, box: [-3, -0.7, 6, 1.4] };
  }

  // ---------- models ----------
  // Medium battle tank, split into two models that share one pivot (the hull centre, ground level):
  //   tankHull   — tracks + hull, 32 facings × 2 tread frames
  //   tankTurret — turret + barrel, 32 facings, rotates independently and is drawn on top of the hull
  function tankHull(teamName, frame = 0, dmg = 0) {
    const T = typeof teamName === 'object' ? teamName : TEAMS[teamName], parts = [];
    for (const s of [-1, 1]) {
      const yIn = s * 3.2, yOut = s * 7;
      const tr = box(-9.6, 9.6, Math.min(yIn, yOut), Math.max(yIn, yOut), 0, 4.5, { color: C.dark, noTop: true, layer: 0, weather: 0.3, seed: 3 + s });
      const n = [0, s, 0], y = yOut + s * 0.02;
      const LINK = 1.6, FR = 3; // 3 animation frames: links move 1/3 of a link per frame
      for (let k = 0; k < 12; k++) { // tread links (move with frame)
        const x = -9.2 + ((k * LINK + (frame * LINK) / FR) % 18.4);
        tr.decals.push(D.line([[x, y, 0.4], [x, y, 4.1]], '#1d2228', 0.32, n));
      }
      // drive sprocket + road wheels with 3 spokes; 120° symmetry → 40° per frame loops seamlessly
      const spin = -(frame / FR) * ((Math.PI * 2) / 3);
      for (const [wx, r] of [[-8.3, 1.25], [-4.4, 1.65], [0, 1.65], [4.4, 1.65], [8.3, 1.25]]) {
        const c = [wx, y, 2.1];
        tr.decals.push(D.poly(circle3(c, [1, 0, 0], [0, 0, 1], r, 16), '#4d5661', n, 1, { stroke: C.outline, sw: 0.2 }));
        tr.decals.push(D.poly(circle3(c, [1, 0, 0], [0, 0, 1], r * 0.62, 12), '#3c444e', n));
        for (let k = 0; k < 3; k++) {
          const a = spin + (k * Math.PI * 2) / 3;
          tr.decals.push(D.line([c, add(c, [Math.cos(a) * r * 0.85, 0, Math.sin(a) * r * 0.85])], '#9aa4b0', 0.28, n));
        }
        tr.decals.push(D.dot([wx, y + s * 0.01, 2.1], 0.4, '#808c9a', n));
      }
      parts.push(tr);
    }
    const hull = prism([[-9.6, 4.4], [9, 4.4], [11, 5.8], [8.4, 7.4], [-8.8, 7.4], [-10, 5.8]], 'y', -7.6, 7.6, { color: T.paint, layer: 1, weather: dmg ? 0 : 0.6, dmg, seed: 11, painted: true });
    const up = [0, 0, 1];
    for (const s of [-1, 1]) hull.decals.push(D.glow([[-7.6, s * 6.7, 7.42], [7.2, s * 6.7, 7.42]], T.light, 0.35, up));
    hull.decals.push(D.poly([[-8.2, -3, 7.42], [-5.6, -3, 7.42], [-5.6, 3, 7.42], [-8.2, 3, 7.42]], C.dark, up));
    for (let k = 0; k < 3; k++) hull.decals.push(D.line([[-7.8 + k * 0.8, -2.6, 7.43], [-7.8 + k * 0.8, 2.6, 7.43]], '#22272e', 0.22, up));
    hull.decals.push(D.poly(circle3([0, 0, 7.42], [1, 0, 0], [0, 1, 0], 4.2, 20), '#2c333b', up)); // turret ring
    for (const s of [-1, 1]) hull.decals.push(D.dot([9.6, s * 5.2, 6.5], 0.5, T.light, norm([1.4, 0, 1.6]))); // headlights
    parts.push(hull);
    return parts;
  }
  function tankTurret(teamName, frame = 0, dmg = 0) {
    const T = typeof teamName === 'object' ? teamName : TEAMS[teamName], parts = [], up = [0, 0, 1];
    const tur = prism([[-4.6, -4.3], [2, -4.9], [5.3, -2.3], [5.3, 2.3], [2, 4.9], [-4.6, 4.3]], 'z', 7.4, 10.6, { color: T.paint, layer: 2, weather: dmg ? 0 : 0.6, dmg, seed: 21, painted: true });
    tur.decals.push(D.glow([[2, -4.5, 10.62], [4.9, -2.1, 10.62], [4.9, 2.1, 10.62], [2, 4.5, 10.62]], T.light, 0.32, up));
    tur.decals.push(D.poly(circle3([-1.4, 1.6, 10.62], [1, 0, 0], [0, 1, 0], 1.3, 14), C.plate, up, 1, { stroke: C.outline, sw: 0.18 }));
    tur.decals.push(D.poly([[-3.6, -2.4, 10.62], [-1.2, -2.4, 10.62], [-1.2, -1.2, 10.62], [-3.6, -1.2, 10.62]], C.dark, up));
    parts.push(tur);
    parts.push(box(5.2, 14.6, -0.7, 0.7, 8.3, 9.5, { color: C.plate, layer: 2, weather: 0.3, seed: 31 }));
    parts.push(box(14.6, 16.4, -1.05, 1.05, 8.0, 9.8, { color: C.dark, layer: 2 }));
    return parts;
  }

  // Light tank factory (1 line). facing: 0..3 (90° steps, gate toward +x), frame: 0..3 (fans, radar)
  // Light tank factory (1 line). facing 0..3 (gate toward +x). frame: fans/radar (whole-picture bake only).
  // layered = true: baked as separate layers (see renderPass) — fans, radar and the upgrade star become their own parts
  function lightFactory(teamName, frame = 0, dmg = 0, layered = false) {
    const T = layered ? LAYER : typeof teamName === 'object' ? teamName : TEAMS[teamName], parts = [], up = [0, 0, 1];
    const pad = prism(ngon(0, 0, 23, 8, Math.PI / 8), 'z', 0, 2, { colorTop: C.padTop, colorSide: C.padSide, layer: 0, weather: 0.4, seed: 41 });
    pad.decals.push(D.poly(ngon(0, 0, 21.8, 8, Math.PI / 8).map((q) => [q[0], q[1], 2.01]), 'none', up, 1, { stroke: C.padEdge, sw: 0.35 }));
    for (let g = -16; g <= 16; g += 8) { pad.decals.push(D.line([[g, -19, 2.01], [g, 19, 2.01]], C.padGrid, 0.3, up)); pad.decals.push(D.line([[-19, g, 2.01], [19, g, 2.01]], C.padGrid, 0.3, up)); }
    // exit lane: team edge lines + one light-grey chevron
    for (const s of [-1, 1]) pad.decals.push(D.glow([[11.5, s * 5.2, 2.02], [21, s * 5.2, 2.02]], T.light, 0.3, up));
    pad.decals.push(D.poly([[14.5, -3.2, 2.02], [17, 0, 2.02], [14.5, 3.2, 2.02], [16, 3.2, 2.02], [18.5, 0, 2.02], [16, -3.2, 2.02]], C.chevron, up));
    parts.push(pad);

    // hangar: gable profile in (y,z) extruded along x; front gable at +x
    const hang = prism([[-12, 2], [12, 2], [12, 13], [0, 19], [-12, 13]], 'x', -11, 11, { color: T.paint, layer: 1, weather: 1, seed: 51, painted: true, dmg });
    const fx = 11.02, nf = [1, 0, 0];
    hang.decals.push(D.poly([[fx, -6.2, 2], [fx, 6.2, 2], [fx, 6.2, 12.2], [fx, -6.2, 12.2]], C.trim, nf, 1, { stroke: C.outline, sw: 0.2 }));
    hang.decals.push(D.poly([[fx, -5.2, 2], [fx, -0.18, 2], [fx, -0.18, 11.2], [fx, -5.2, 11.2]], C.plate, nf));
    hang.decals.push(D.poly([[fx, 0.18, 2], [fx, 5.2, 2], [fx, 5.2, 11.2], [fx, 0.18, 11.2]], C.plate, nf));
    hang.decals.push(D.poly([[fx, -0.18, 2], [fx, 0.18, 2], [fx, 0.18, 11.2], [fx, -0.18, 11.2]], C.seal, nf));
    for (let k = 0; k < 10; k++) { // thin hazard band on the blast doors
      const y = -5.2 + k * 1.04;
      hang.decals.push(D.poly([[fx, y, 2], [fx, y + 0.52, 2], [fx, y + 1.04, 2.9], [fx, y + 0.52, 2.9]], k % 2 ? C.hazardDark : C.hazard, nf));
    }
    for (const s of [-1, 1]) hang.decals.push(D.glow([[fx, s * 5.75, 2.2], [fx, s * 5.75, 11.8]], T.light, 0.3, nf));
    hang.decals.push(D.poly([[fx, -1.6, 14.4], [fx, 0, 15.6], [fx, 1.6, 14.4], [fx, 1.6, 13.4], [fx, 0, 14.6], [fx, -1.6, 13.4]], T.light, nf)); // emblem
    for (const s of [-1, 1]) { // glowing skylight strips on both roof slopes
      const n = norm([0, s, 2]);
      hang.decals.push(D.glow([[-9, s * 6, 16.02], [9, s * 6, 16.02]].map((p) => add(p, mul(n, 0.05))), T.light, 0.55, n));
    }
    if (layered) { // upgrade L1: one white star on the front gable above the gate (shown/hidden by the game)
      const star = Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.5 : 1.25; return [fx + 0.01, Math.cos(a) * r, 17.1 - Math.sin(a) * r]; });
      hang.decals.push(Object.assign(D.poly(star, '#e9eef3', nf, 1, { stroke: C.outline, sw: 0.15 }), { star: true }));
    }
    parts.push(hang);

    // side control booth with windows, radar and antennas
    const booth = box(-7, 2, 12, 16.5, 2, 8.5, { color: T.paint, layer: 1, weather: 1, seed: 61, painted: true, dmg });
    for (let k = 0; k < 3; k++) booth.decals.push(D.poly([[-6 + k * 2.8, 16.52, 5.2], [-4.2 + k * 2.8, 16.52, 5.2], [-4.2 + k * 2.8, 16.52, 7.2], [-6 + k * 2.8, 16.52, 7.2]], T.light, [0, 1, 0], 0.95));
    booth.decals.push(D.poly([[2.02, 13, 4], [2.02, 15.5, 4], [2.02, 15.5, 7], [2.02, 13, 7]], T.light, [1, 0, 0], 0.9));
    parts.push(booth);
    parts.push(box(-2.6, -1.4, 13.6, 14.8, 8.5, 10, { color: C.trim, layer: 2 }));
    parts.push(rotatePart(box(-2.5, -1.5, 11.4, 17, 10, 10.9, { color: C.plate, layer: 2, moving: true }), (frame * Math.PI) / 4, -2, 14.2));
    for (const ax of [-6, 0.8]) parts.push(box(ax - 0.2, ax + 0.2, 15.6, 16, 8.5, 13.5, { color: C.dark, layer: 2 }));

    // exhaust stack
    parts.push(prism(ngon(-8, -9, 1.5, 8), 'z', 12, 23, { color: C.dark, layer: 2, weather: 0.5, seed: 71 }));
    parts.push(prism(ngon(-8, -9, 1.9, 8), 'z', 22, 23.2, { color: C.trim, layer: 2 }));

    // two fans on the ridge
    for (const cx of [-5.5, 4.5]) {
      const hs = box(cx - 3.2, cx + 3.2, -3.2, 3.2, 16.5, 20.2, { color: C.plate, layer: 2, weather: 0.5, seed: 81 + cx, fanHousing: true });
      const c = [cx, 0, 20.22];
      hs.decals.push(D.poly(circle3(c, [1, 0, 0], [0, 1, 0], 2.7, 20), C.interior, up));
      const rot = (frame / 4) * ((Math.PI * 2) / 3) + (cx > 0 ? 0.5 : 0);
      for (let b = 0; b < 3; b++) {
        const a = rot + (b * Math.PI * 2) / 3;
        const dir = [Math.cos(a), Math.sin(a), 0], side = [-Math.sin(a), Math.cos(a), 0];
        hs.decals.push(Object.assign(D.poly([add(c, mul(side, 0.35)), add(add(c, mul(dir, 2.4)), mul(side, 0.9)), add(add(c, mul(dir, 2.5)), mul(side, -0.2)), add(c, mul(side, -0.35))], C.trim, up), { moving: true }));
      }
      hs.decals.push(D.dot(c, 0.6, C.plate, up));
      hs.decals.push(D.glow(circle3(c, [1, 0, 0], [0, 1, 0], 2.85, 24).concat([add(c, [2.85, 0, 0])]), T.light, 0.25, up));
      parts.push(hs);
    }
    return parts;
  }

  const MODELS = {
    tankHull: { build: tankHull, facings: 32, step: 11.25, frames: 3 },
    tankTurret: { build: tankTurret, facings: 32, step: 11.25, frames: 1 },
    // damage overlays: marks only (transparent elsewhere), shared by all teams. frame 0 = damaged, 1 = critical
    tankHullDmg: { build: (t, f) => tankHull('green', 0, f + 1), facings: 32, step: 11.25, frames: 2, teamless: true, overlay: true },
    tankTurretDmg: { build: (t, f) => tankTurret('green', 0, f + 1), facings: 32, step: 11.25, frames: 2, teamless: true, overlay: true },
    // destroyed: charred hull + turret with heavy damage, shared by all teams
    tankHullWreck: { build: () => tankHull(CHARRED, 0, 2), facings: 32, step: 11.25, frames: 1, teamless: true },
    tankTurretWreck: { build: () => tankTurret(CHARRED, 0, 2), facings: 32, step: 11.25, frames: 1, teamless: true },
    lightFactory: { build: lightFactory, facings: 4, step: 90, frames: 4 },
  };

  // Render one view: returns SVG inner markup + bbox in model units (origin = ground anchor)
  function view(model, team, facing, frame) {
    const M = MODELS[model];
    return render(M.build(team, frame), facing * M.step, !!M.overlay);
  }

  // one layer of the layered light factory: pass = body | mask | lights | dmg1 | dmg2 | star
  function layerView(facing, pass) {
    const dmg = pass === 'dmg1' ? 1 : pass === 'dmg2' ? 2 : 0;
    return renderPass(lightFactory(null, 0, dmg, true), facing * 90, pass.startsWith('dmg') ? 'dmg' : pass);
  }
  // world positions the game needs to place the moving parts (before facing rotation)
  const FACTORY_PARTS = { fans: [[-5.5, 0, 20.22], [4.5, 0, 20.22]], bigFan: [-0.5, 0, 20.3], radar: [-2, 14.2, 10.45], flames: [[-6, -5, 15.6], [5, 5, 15.6], [-8, -9, 23.2]] };

  // one team-mask view: pass = base | R | G (models built with the marker colours, coloured later by the shader)
  const TEAM_MODELS = {
    tankHull: { build: (f) => tankHull(LAYER, f), facings: 32, step: 11.25, frames: 3 },
    tankTurret: { build: () => tankTurret(LAYER), facings: 32, step: 11.25, frames: 1 },
    lightFactory: { build: (f) => lightFactory(LAYER, f), facings: 4, step: 90, frames: 4 },
  };
  function teamView(model, facing, frame, pass) {
    const M = TEAM_MODELS[model];
    return renderTeam(M.build(frame), facing * M.step, pass);
  }

  const api = { TEAMS, MODELS, TEAM_MODELS, view, teamView, proj, layerView, flatPart, FACTORY_PARTS, BARREL_TIP: [16.4, 0, 8.9], version: '0.3' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VectorMini = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
