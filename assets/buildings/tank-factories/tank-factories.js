/*!
 * Steel Meridian — Tank Factories (single bundle)
 * ================================================
 * 2.5D isometric vector (SVG) models of the Light, Medium and Heavy Tank Factories, with the shared
 * VectorEngine that draws and animates them. One file, no dependencies; load it with one <script> tag.
 *
 *   const f = TankFactories.create('heavy', el, { lines, facing, team, captured, health, level, scale });
 *   TankFactories.dims('medium')   → { W, D, H, GW, GH, GX, TANK_START, TANK_END, FOOT, ORDER }   (model units;
 *                                    ORDER = which gates run first as lines are added)
 *
 *   kinds: 'light' (1 gate) · 'medium' (2 gates) · 'heavy' (3 gates; 1 line = centre gate)
 *   f.setLines(n) · f.setTeam(c) · f.setCaptured(b) · f.setHealth(0..1) · f.setLevel(0..3) · f.setFacing(0..3)
 *   f.gateOfLine(i) · f.anchor() · f.gateExit(i) · f.produce(i) · f.element · f.destroy()
 *
 * Also exposes the globals VectorEngine, LightFactory, MediumFactory and HeavyFactory.
 * Style guide: docs/art/art-style-guide.md. Demo (serve the folder over http): docs/art/factories-demo.html.
 */
/*!
 * VectorEngine — shared 2.5D isometric vector (SVG) renderer for State of War Game assets
 * ---------------------------------------------------------------------------------------
 * 2:1 isometric projection, convex solids + cylinders, face decals, world lighting,
 * seeded weathering + damage, depth sorting for 4 facings, team paint, and the generic
 * production-building controller (gates, units driving out, fans, radar, smoke, fire).
 * Asset files (heavy-factory.js, medium-factory.js, …) supply a model "spec".
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- math
  const C = 0.8660254;
  const proj = p => [(p[0] - p[1]) * C, (p[0] + p[1]) * 0.5 - p[2]];
  const f = n => Math.round(n * 100) / 100;
  const f4 = n => Math.round(n * 10000) / 10000;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
  const LIGHT = norm([0.35, 0.6, 1]);
  const VIEW = [1, 1, 1];
  const OUT = '#0b0e13';

  function rot(k, x, y) { switch (k & 3) { case 0: return [x, y]; case 1: return [-y, x]; case 2: return [-x, -y]; default: return [y, -x]; } }
  function makeXf(k, cx, cy) {
    return {
      k,
      p: q => { const r = rot(k, q[0] - cx, q[1] - cy); return [r[0] + cx, r[1] + cy, q[2]]; },
      v: q => { const r = rot(k, q[0], q[1]); return [r[0], r[1], q[2]]; },
    };
  }

  // --------------------------------------------------------------- colour
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = r => '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => rgb2hex(hex2rgb(h).map(v => v * k));
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };

  // -------------------------------------------------------------- solids
  function newell(pts) {
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return norm(n);
  }
  function finalize(raw, opt) {
    const all = raw.flat();
    const cen = all.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / all.length);
    const faces = [];
    for (const pts of raw) {
      let n = newell(pts);
      const fc = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / pts.length);
      if (dot(n, sub(fc, cen)) < 0) n = n.map(v => -v);
      let key;
      if (Math.abs(n[2]) > 0.9) key = n[2] > 0 ? 'pz' : 'nz';
      else key = Math.abs(n[0]) > Math.abs(n[1]) ? (n[0] > 0 ? 'px' : 'nx') : (n[1] > 0 ? 'py' : 'ny');
      if (key === 'nz') continue;
      const spec = (opt.faces || {})[key] || {};
      const face = { pts, n, key, fill: spec.fill || opt.fill, flat: spec.flat, dec: spec.dec,
        weather: spec.weather !== undefined ? spec.weather : (spec.flat ? 0 : (opt.weather || 0)), seed: faceSeed(pts) };
      if (key === 'pz') { face.o = [0, 0, pts[0][2]]; face.u = [1, 0, 0]; face.v = [0, 1, 0];
        face.bounds = [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))]; }
      else {
        const t = norm([n[1], -n[0], 0]);
        let v = norm(cross(n, t)); if (v[2] > 0) v = v.map(x => -x);
        let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
        for (const p of pts) { const a = dot(p, t), b = dot(p, v); minA = Math.min(minA, a); maxA = Math.max(maxA, a); minB = Math.min(minB, b); maxB = Math.max(maxB, b); }
        const d = dot(pts[0], n);
        face.o = [0, 1, 2].map(i => t[i] * minA + v[i] * minB + n[i] * d);
        face.u = t; face.v = v; face.dims = { w: maxA - minA, h: maxB - minB };
      }
      faces.push(face);
    }
    return { faces, pts: all };
  }
  function prism(bot, top, z0, z1, opt) {
    const raw = [top.map(p => [p[0], p[1], z1])];
    for (let i = 0; i < bot.length; i++) {
      const j = (i + 1) % bot.length;
      raw.push([[bot[i][0], bot[i][1], z0], [bot[j][0], bot[j][1], z0], [top[j][0], top[j][1], z1], [top[i][0], top[i][1], z1]]);
    }
    return finalize(raw, opt);
  }
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const box = (x0, x1, y0, y1, z0, z1, opt) => prism(rect(x0, y0, x1, y1), rect(x0, y0, x1, y1), z0, z1, opt);
  function extrudeX(x0, x1, yz, opt) {
    const raw = [yz.map(p => [x0, p[0], p[1]]), yz.map(p => [x1, p[0], p[1]]).reverse()];
    for (let i = 0; i < yz.length; i++) { const j = (i + 1) % yz.length; raw.push([[x0, yz[i][0], yz[i][1]], [x0, yz[j][0], yz[j][1]], [x1, yz[j][0], yz[j][1]], [x1, yz[i][0], yz[i][1]]]); }
    return finalize(raw, opt);
  }
  const cyl = (cx, cy, r, z0, z1, opt) => Object.assign({ cyl: true, cx, cy, r, z0, z1 }, opt);

  // ------------------------------------------------------------ weathering
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function faceSeed(pts) { let h = 2166136261; for (const p of pts) for (const v of p) { h ^= Math.round(v * 10) & 0xffff; h = Math.imul(h, 16777619); } return h; }
  function chip(x, y, r, R) {
    const n = 5 + ((R() * 3) | 0); let d = '';
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, rr = r * (0.5 + R() * 0.7); d += `${f(x + Math.cos(a) * rr)},${f(y + Math.sin(a) * rr * 0.7)} `; }
    return `<polygon points="${d}" fill="#aab2ba" opacity="${f(0.45 + R() * 0.3)}"/>`;
  }
  function rust(x, y, r, R, drip) {
    let s = `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * (0.6 + R() * 0.4))}" fill="#7a4520" opacity="${f(0.3 + R() * 0.25)}"/>` +
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.45)}" ry="${f(r * 0.3)}" fill="#3e220e" opacity=".45"/>`;
    if (drip) s += `<rect x="${f(x - 0.5)}" y="${f(y)}" width="${f(0.8 + R())}" height="${f(4 + R() * 12)}" fill="url(#RUST)"/>`;
    return s;
  }
  function weatherSide(w, h, R, k) {
    let s = `<rect x="0" y="${f(h * 0.5)}" width="${f(w)}" height="${f(h * 0.5)}" fill="url(#GRIME)" opacity="${f(0.7 * k + 0.3)}"/>`;
    const ns = Math.max(2, Math.min(18, Math.round(w / 13 * k)));
    for (let i = 0; i < ns; i++) { const x = R() * w, y = R() < 0.6 ? 0 : R() * h * 0.35; s += `<rect x="${f(x)}" y="${f(y)}" width="${f(0.7 + R() * 2.3)}" height="${f(h * (0.2 + R() * 0.6))}" fill="url(#STREAK)" opacity="${f((0.25 + R() * 0.4) * k)}"/>`; }
    const nr = Math.min(10, Math.round(w * h / 1600 * k) + 1);
    for (let i = 0; i < nr; i++) s += rust(R() * w, R() * h * 0.85, 1.2 + R() * 3.5, R, R() < 0.6);
    const nc = Math.min(26, Math.round((w + h) / 14 * k));
    for (let i = 0; i < nc; i++) {
      const e = R(); let x, y;
      if (e < 0.45) { x = R() * w; y = R() * 4; } else if (e < 0.7) { x = R() * 4; y = R() * h; } else if (e < 0.95) { x = w - R() * 4; y = R() * h; } else { x = R() * w; y = R() * h; }
      s += chip(x, y, 0.8 + R() * 2.4, R);
    }
    s += `<line x1="0" y1=".6" x2="${f(w)}" y2=".6" stroke="#d9dfe4" stroke-width=".9" opacity=".35" stroke-dasharray="${f(3 + R() * 6)} ${f(2 + R() * 5)} ${f(1 + R() * 3)} ${f(4 + R() * 6)}"/>`;
    for (let i = 0; i < 3; i++) { const x = R() * w, y = R() * h, a = R() * 6.28, l = 3 + R() * 9; s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * l)}" y2="${f(y + Math.sin(a) * l)}" stroke="#cfd6dc" stroke-width=".45" opacity=".3"/>`; }
    return s;
  }
  function weatherTop(b, R, k) {
    const [x0, y0, x1, y1] = b, w = x1 - x0, h = y1 - y0; let s = '';
    const nd = Math.min(8, Math.round(w * h / 2500 * k) + 1);
    for (let i = 0; i < nd; i++) s += `<ellipse cx="${f(x0 + R() * w)}" cy="${f(y0 + R() * h)}" rx="${f(6 + R() * 20)}" ry="${f(4 + R() * 14)}" fill="#a39a86" opacity="${f(0.04 + R() * 0.05)}"/>`;
    const nr = Math.min(10, Math.round(w * h / 2200 * k) + 1);
    for (let i = 0; i < nr; i++) s += rust(x0 + R() * w, y0 + R() * h, 1 + R() * 3, R, false);
    const nc = Math.min(30, Math.round((w + h) / 12 * k));
    for (let i = 0; i < nc; i++) { const e = R(); const x = e < 0.5 ? x0 + R() * w : (R() < 0.5 ? x0 + R() * 3 : x1 - R() * 3), y = e < 0.5 ? (R() < 0.5 ? y0 + R() * 3 : y1 - R() * 3) : y0 + R() * h; s += chip(x, y, 0.8 + R() * 2.2, R); }
    for (let i = 0; i < 4; i++) { const x = x0 + R() * w, y = y0 + R() * h, a = R() * 6.28, l = 4 + R() * 12; s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * l)}" y2="${f(y + Math.sin(a) * l)}" stroke="#cfd6dc" stroke-width=".5" opacity=".28"/>`; }
    return s;
  }
  let clipSeq = 0;
  const RS = { dmg: 0 };   // current damage level while rendering: 0 ok, 1 = ≤50%, 2 = <20%
  function crack(x, y, R, n, len) {
    let d = `M${f(x)},${f(y)}`, a = R() * 6.28;
    for (let i = 0; i < n; i++) { a += (R() - 0.5) * 1.6; x += Math.cos(a) * len * (0.5 + R()); y += Math.sin(a) * len * (0.5 + R()); d += ` L${f(x)},${f(y)}`; }
    return `<path d="${d}" fill="none" stroke="#0a0a0a" stroke-width="${f(0.6 + R() * 0.6)}" stroke-linejoin="round" opacity=".85"/>`;
  }
  function hole(x, y, r, R) {
    const n = 9; let pts = '';
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, rr = r * (0.55 + R() * 0.6); pts += `${f(x + Math.cos(a) * rr)},${f(y + Math.sin(a) * rr * 0.8)} `; }
    let s = `<polygon points="${pts}" fill="#060606" stroke="#ff7a1a" stroke-width=".9" opacity=".95" filter="url(#GLOW)"/>`;
    for (let i = 0; i < 3; i++) { const a = R() * 6.28; s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * r * 0.9)}" y2="${f(y + Math.sin(a) * r * 0.7)}" stroke="#6b4a2a" stroke-width=".8"/>`; }
    return s;
  }
  function damageLayer(x0, y0, w, h, R, d, k) {
    let s = '';
    const area = Math.max(1, w * h / 3000);
    const ns = Math.min(8, Math.round((d === 1 ? 1.2 : 2.6) * k * area) + (d === 2 ? 1 : 0));
    for (let i = 0; i < ns; i++) s += `<ellipse cx="${f(x0 + R() * w)}" cy="${f(y0 + R() * h)}" rx="${f(5 + R() * (d === 1 ? 10 : 18))}" ry="${f(4 + R() * (d === 1 ? 8 : 14))}" fill="url(#SCORCH)" opacity="${f(0.6 + R() * 0.35)}"/>`;
    const nc = Math.min(6, Math.round((d === 1 ? 1 : 2.5) * k * area) + 1);
    for (let i = 0; i < nc; i++) s += crack(x0 + R() * w, y0 + R() * h, R, 3 + ((R() * 4) | 0), 3 + R() * 4);
    const nb = Math.min(14, Math.round((d === 1 ? 3 : 7) * k * area));
    for (let i = 0; i < nb; i++) { const x = x0 + R() * w, y = y0 + R() * h, r = 0.7 + R() * 1.1; s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 0.5)}" fill="none" stroke="#c7ced5" stroke-width=".4" opacity=".4"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#0a0a0a"/>`; }
    if (d === 2 && k >= 1 && w * h > 1100) { const nh = w * h > 6000 ? 2 : 1; for (let i = 0; i < nh; i++) s += hole(x0 + w * (0.2 + R() * 0.6), y0 + h * (0.2 + R() * 0.6), 4 + R() * 7, R); }
    return s;
  }

  // ------------------------------------------------------------ rendering
  function renderSolid(s, xf) {
    let out = '';
    for (const fc of s.faces) {
      const nw = xf.v(fc.n);
      if (dot(nw, VIEW) <= 1e-6) continue;
      const fill = fc.flat ? fc.fill : shade(fc.fill, 0.55 + 0.55 * Math.max(0, dot(nw, LIGHT)));
      const sp = fc.pts.map(p => { const q = proj(xf.p(p)); return f(q[0]) + ',' + f(q[1]); }).join(' ');
      out += `<polygon points="${sp}" fill="${fill}" stroke="${OUT}" stroke-width=".8" stroke-linejoin="round"/>`;
      const o = proj(xf.p(fc.o)), u = proj(xf.v(fc.u)), v = proj(xf.v(fc.v));
      if (fc.weather) {
        const id = 'hfw' + (++clipSeq), R = rng(fc.seed);
        let wsvg = fc.key === 'pz' ? weatherTop(fc.bounds, R, fc.weather) : weatherSide(fc.dims.w, fc.dims.h, R, fc.weather);
        if (RS.dmg && fc.weather >= 0.8) { const R2 = rng(fc.seed ^ 0x5bd1e995);
          wsvg += fc.key === 'pz' ? damageLayer(fc.bounds[0], fc.bounds[1], fc.bounds[2] - fc.bounds[0], fc.bounds[3] - fc.bounds[1], R2, RS.dmg, fc.weather) : damageLayer(0, 0, fc.dims.w, fc.dims.h, R2, RS.dmg, fc.weather); }
        out += `<clipPath id="${id}"><polygon points="${sp}"/></clipPath><g clip-path="url(#${id})"><g transform="matrix(${f4(u[0])},${f4(u[1])},${f4(v[0])},${f4(v[1])},${f(o[0])},${f(o[1])})">${wsvg}</g></g>`;
      }
      if (fc.dec) {
        out += `<g transform="matrix(${f4(u[0])},${f4(u[1])},${f4(v[0])},${f4(v[1])},${f(o[0])},${f(o[1])})">${typeof fc.dec === 'function' ? fc.dec(fc.dims || {}) : fc.dec}</g>`;
      }
    }
    return out;
  }
  function renderCyl(c, xf, G) {
    const w = xf.p([c.cx, c.cy, 0]);
    const rx = c.r * 1.2247, ry = c.r * 0.7071;
    const [bx, by] = proj([w[0], w[1], c.z0]), [tx, ty] = proj([w[0], w[1], c.z1]);
    let s = `<path d="M${f(bx - rx)},${f(by)} A${f(rx)},${f(ry)} 0 0 0 ${f(bx + rx)},${f(by)} L${f(tx + rx)},${f(ty)} A${f(rx)},${f(ry)} 0 0 1 ${f(tx - rx)},${f(ty)} Z" fill="url(#${G(c.fill)})" stroke="${OUT}" stroke-width=".8"/>`;
    for (const b of c.bands || []) {
      const [x, y] = proj([w[0], w[1], b[0]]);
      s += `<path d="M${f(x - rx)},${f(y)} A${f(rx)},${f(ry)} 0 0 0 ${f(x + rx)},${f(y)}" fill="none" stroke="${b[1]}" stroke-width="${b[2] || 1.4}" ${b[3] ? 'filter="url(#GLOW)"' : ''}/>`;
    }
    s += `<ellipse cx="${f(tx)}" cy="${f(ty)}" rx="${f(rx)}" ry="${f(ry)}" fill="${c.top || shade(c.fill, 1.15)}" stroke="${OUT}" stroke-width=".8"/>`;
    if (c.dec) {
      const u = proj(xf.v([1, 0, 0])), v = proj(xf.v([0, 1, 0]));
      s += `<g transform="matrix(${f4(u[0])},${f4(u[1])},${f4(v[0])},${f4(v[1])},${f(tx)},${f(ty)})">${c.dec}</g>`;
    }
    return s;
  }
  function primAABB(pr, xf) {
    if (pr.cyl) { const w = xf.p([pr.cx, pr.cy, 0]); return [w[0] - pr.r, w[0] + pr.r, w[1] - pr.r, w[1] + pr.r, pr.z0, pr.z1]; }
    const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const p of pr.pts) { const q = xf.p(p); b[0] = Math.min(b[0], q[0]); b[1] = Math.max(b[1], q[0]); b[2] = Math.min(b[2], q[1]); b[3] = Math.max(b[3], q[1]); b[4] = Math.min(b[4], q[2]); b[5] = Math.max(b[5], q[2]); }
    return b;
  }
  const unionBox = bs => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.min(a[4], b[4]), Math.max(a[5], b[5])]);
  function screenBox(b) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) { const q = proj([x, y, z]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    return [x0, x1, y0, y1];
  }
  // +1: a drawn before b, -1: b before a, 0: no constraint (axes disagree)
  function behind(a, b) {
    const e = 0.01; let s = 0;
    for (let k = 0; k < 6; k += 2) {
      const d = a[k + 1] <= b[k] + e ? 1 : (b[k + 1] <= a[k] + e ? -1 : 0);
      if (!d) continue;
      if (s && d !== s) return 0;
      s = d;
    }
    if (s) return s;
    return (a[0] + a[1] + a[2] + a[3] + a[4] + a[5]) < (b[0] + b[1] + b[2] + b[3] + b[4] + b[5]) ? 1 : -1;
  }
  function depthSort(items) { // items: {aabb, sb}
    const n = items.length, before = items.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = items[i].sb, B = items[j].sb;
      if (A[1] <= B[0] || B[1] <= A[0] || A[3] <= B[2] || B[3] <= A[2]) continue;
      const r = behind(items[i].aabb, items[j].aabb);
      if (r > 0) before[j].push(i); else if (r < 0) before[i].push(j);
    }
    const out = [], state = new Uint8Array(n);
    const visit = i => { if (state[i]) return; state[i] = 1; for (const k of before[i]) visit(k); out.push(items[i]); };
    for (let i = 0; i < n; i++) visit(i);
    return out;
  }

  // -------------------------------------------------------- shared helpers
  function oct(x0, y0, x1, y1, c) { return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]]; }
  const glow = 'filter="url(#GLOW)"';
  function emblem(T, TL, s = 1) {
    return `<g transform="scale(${s})"><polygon points="0,-14 12,-7 12,7 0,14 -12,7 -12,-7" fill="${shade(T, .35)}" stroke="${T}" stroke-width="1.6" ${glow}/>
      <path d="M-7,3 L0,-5 L7,3 M-7,8 L0,0 L7,8" fill="none" stroke="${TL}" stroke-width="2.2" stroke-linejoin="round"/></g>`;
  }
  const FLAME = '<path d="M0,0 C-6,-5 -4,-13 0,-22 C1,-15 6,-12 5,-6 C5,-3 3,-1 0,0Z"/>';
  // armour paint derived from team colour (military, slightly desaturated)
  function toHsl(hex) { const [r, g, b] = hex2rgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l]; }
  function fromHsl(h, s, l) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const c = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return rgb2hex([c(h + 1 / 3), c(h), c(h - 1 / 3)].map(v => v * 255)); }
  // clean, saturated armour paint in the team hue (no grey tint)
  const lum = hex => { const c = hex2rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const NEUTRAL_PAINT = '#b4bac2';
  // clean, saturated paint in the team hue; lightness solved so every hue is as bright as the green
  function paintOf(T) {
    if (T === null) return NEUTRAL_PAINT;
    const [h, s0] = toHsl(T), hd = h * 360;
    // purple/violet and red read too intense at full strength: softer saturation
    const purple = hd >= 255 && hd <= 320;
    const red = hd >= 335 || hd <= 15;
    const s = purple ? Math.max(0.42, Math.min(0.5, s0)) : red ? Math.max(0.46, Math.min(0.52, s0)) : Math.max(0.6, Math.min(0.82, s0));
    const target = lum(fromHsl(146 / 360, 0.65, 0.4)) * (purple ? 1.25 : red ? 0.9 : 1);
    let lo = 0.3, hi = purple ? 0.64 : red ? 0.5 : 0.56;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (lum(fromHsl(h, s, m)) < target) lo = m; else hi = m; }
    return fromHsl(h, s, (lo + hi) / 2);
  }
  // ---------------------------------------------------- blast-door decals
  // one continuous stripe pattern across the whole closed door, every stripe slanting the same way.
  // c = position on the closed door (0..2*gw); stripes stay attached to their half while it slides.
  function stripePos(gw) { const a = []; for (let c = 2; c + 6 <= gw * 2 - 1; c += 8) a.push(c); return a; }
  const stripe = (x, h) => `<polygon points="${f(x)},${h - 12} ${f(x + 3)},${h - 12} ${f(x + 6)},${h - 18} ${f(x + 3)},${h - 18}" fill="#f2c230" opacity=".85"/>`;
  function doorStripes(gw, c0, c1, shift, w, h) {
    let s = '';
    for (const c of stripePos(gw)) { if (c < c0 || c + 6 > c1) continue; const u = c - shift; if (u >= 0 && u + 6 <= w) s += stripe(u, h); }
    return s;
  }
  function doorBase(w, h) { return `<line x1="0" y1="10" x2="${w}" y2="10" stroke="#3c4550" stroke-width="1"/><line x1="0" y1="${h - 10}" x2="${w}" y2="${h - 10}" stroke="#3c4550" stroke-width="1"/><rect x="0" y="${h - 18}" width="${w}" height="6" fill="#22272d"/>`; }
  function doorDec(side, T, open, gw) {
    return ({ w, h }) => {
      let s = doorBase(w, h);
      s += side === 'L' ? doorStripes(gw, 0, gw, gw * open, w, h) : doorStripes(gw, gw, gw * 2, gw, w, h);
      const sx = side === 'L' ? w - 2.2 : 0;
      // dark-grey plastic seal between the door halves (soft highlight on its face)
      s += `<rect x="${f(sx)}" y="0" width="2.2" height="${h}" fill="#3a4148"/><rect x="${f(sx + 0.5)}" y="0" width="0.6" height="${h}" fill="#59616a" opacity=".8"/>`;
      const px = side === 'L' ? w - 16 : 6;
      if (w > 22) s += `<rect x="${f(px)}" y="18" width="10" height="12" rx="1.5" fill="#2a3038" stroke="#8b97a5" stroke-width=".6"/><rect x="${f(px + 2)}" y="20" width="6" height="3" fill="${T}" opacity=".8"/>`;
      return s;
    };
  }
  // disabled line: same blast door, powered off (no light seam, dimmed)
  function lockDec(gw) {
    return ({ w, h }) => {
      const half = w / 2;
      let s = doorBase(w, h) + doorStripes(gw, 0, gw, 0, w, h) + doorStripes(gw, gw, gw * 2, 0, w, h);
      s += `<rect x="${half - 0.8}" y="0" width="1.6" height="${h}" fill="#2a3038"/>`;
      [half - 16, half + 6].forEach(px => s += `<rect x="${px}" y="18" width="10" height="12" rx="1.5" fill="#2a3038" stroke="#6b7580" stroke-width=".6"/><rect x="${px + 2}" y="20" width="6" height="3" fill="#4a525b"/>`);
      s += `<rect x="0" y="0" width="${w}" height="${h}" fill="#000" opacity=".22"/>`;
      return s;
    };
  }

  // ----------------------------------------------------------- controller
  let counter = 0;
  function create(container, S, opts = {}) {
    const o = Object.assign({ lines: S.GX.length, facing: 0, team: '#33d17a', fadeOutTank: true, onTankOut: null, scale: null, paint: null, captured: true, health: 1, level: 0, speed: null }, opts);
    const spd = () => o.speed || (1 + 0.1 * o.level);   // production speed multiplier (+10% per upgrade level)
    const lightCol = () => (o.captured ? o.team : '#9aa4ae');
    const dmgLevel = () => (o.health < 0.2 ? 2 : o.health <= 0.5 ? 1 : 0);
    let vb = null;
    const p = o.idPrefix || ((S.prefix || 'vb') + (++counter));
    let svg, scene, smokeG, parts, xf, gates, lampEls, radarEl, beaconEl, fanEls, stackTops, order = [];
    let dmgSmoke = [], fires = [], sparkEl = null, act = [], upFx = null, fanAngle2 = 0;
    let raf, last, alive = true, fanAngle = 0, fanSpeed = 170, radarAngle = 0, smoke = [], spawnAcc = 0;
    const grads = new Map();
    const G = color => { if (!grads.has(color)) grads.set(color, `${p}-g${grads.size}`); return grads.get(color); };

    function viewBox() {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const x = makeXf(k, S.CX, S.CY);
        oct(S.PAD.x0, S.PAD.y0, S.PAD.x1, S.PAD.y1, 26).forEach(q => { pts.push(proj(x.p([q[0], q[1], -12]))); pts.push(proj(x.p([q[0], q[1], 0]))); });
        S.TOP_PTS.forEach(q => pts.push(proj(x.p(q))));
      }
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      const x0 = Math.min(...xs) - 10, x1 = Math.max(...xs) + 10, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 10;   // headroom for smoke
      vb = [x0, y0, x1 - x0, y1 - y0];
      return `${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}`;
    }

    const fixIds = h => h.replace(/url\(#(GLOW|HAZ|BAYGLOW|GRIME|STREAK|RUST|SCORCH|FIREGLOW|SOFT)\)/g, (m, n) => `url(#${p}-${n})`);
    function renderPart(pt) {
      if (pt.tank !== undefined) return pt.svgCache;
      return pt.prims.map(pr => pr.cyl ? renderCyl(pr, xf, G) : renderSolid(pr, xf)).join('');
    }
    function partAABB(pt) {
      if (pt.tank !== undefined) {
        const g = gates[pt.tank]; if (!g || g.phase !== 'driving' || tankHidden(g)) return null;
        const c = xf.p([S.GX[pt.tank], g.ty, 0]);
        const r = [S.TANK_BOX[0], S.TANK_BOX[1], S.TANK_BOX[2], S.TANK_BOX[3]];
        const corners = [[r[0], r[2]], [r[1], r[2]], [r[0], r[3]], [r[1], r[3]]].map(q => xf.v([q[0], q[1], 0]));
        const xs = corners.map(q => q[0] + c[0]), ys = corners.map(q => q[1] + c[1]);
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), 0, S.TANK_BOX[5]];
      }
      if (!pt.prims.length) return null;
      return unionBox(pt.prims.map(pr => primAABB(pr, xf)));
    }

    function mount() {
      o.lines = Math.max(1, Math.min(S.GX.length, o.lines | 0)); o.facing = ((o.facing | 0) % 4 + 4) % 4;
      xf = makeXf(o.facing, S.CX, S.CY);
      grads.clear();
      RS.dmg = dmgLevel();
      // which physical gates run: first n of the spec's activation order, numbered left → right
      act = (S.ORDER || S.GX.map((_, i) => i)).slice(0, o.lines).sort((a, b) => a - b);
      parts = S.buildModel(act, o.captured ? o.team : null, o.captured ? o.paint : null, { dmg: RS.dmg, level: o.level });
      gates = S.GX.map((gx, i) => ({ i, line: act.indexOf(i), locked: !act.includes(i), phase: 'idle', door: 0, t: 0, ty: S.TANK_START, queue: [], resolve: null }));
      // tank svg (rotation only, translated per frame)
      const txf = makeXf(o.facing, 0, 0);
      const tp = S.tankPrims(o.team, o.paint);
      const titems = tp.map(pr => { const b = primAABB(pr, txf); return { pr, aabb: b, sb: screenBox(b) }; });
      // soft ground shadow sized from the tank's own footprint (hull length, not the gun)
      const TB = S.TANK_BOX, sh = [[TB[0] - 1.5, TB[2] - 1.5], [TB[1] + 1.5, TB[2] - 1.5], [TB[1] + 1.5, -TB[2] + 3], [TB[0] - 1.5, -TB[2] + 3]];
      const tankSVG = `<polygon points="${sh.map(q => { const w = proj(txf.v([q[0], q[1], 0])); return f(w[0]) + ',' + f(w[1]); }).join(' ')}" fill="rgba(0,0,0,.32)" filter="url(#SOFT)"/>` +
        depthSort(titems).map(it => renderSolid(it.pr, txf)).join('');

      parts.forEach(pt => { if (pt.tank !== undefined) pt.svgCache = tankSVG; if (pt.door !== undefined) { pt.prims = S.doorPrims(pt.door, pt.side, 0, lightCol()); pt.lastOpen = 0; } });

      const T = o.team;
      let html = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox()}" ${o.scale ? `width="${f(vb[2] * o.scale)}" height="${f(vb[3] * o.scale)}"` : 'width="100%"'} style="display:block;overflow:visible"><defs>
        <filter id="${p}-GLOW" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="${p}-SOFT" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
        <pattern id="${p}-HAZ" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" fill="#16181b"/><rect width="4" height="8" fill="#f2c230"/></pattern>
        <linearGradient id="${p}-GRIME" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d10" stop-opacity="0"/><stop offset="1" stop-color="#2a1d10" stop-opacity=".38"/></linearGradient>
        <linearGradient id="${p}-STREAK" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2614" stop-opacity=".5"/><stop offset="1" stop-color="#3a2614" stop-opacity="0"/></linearGradient>
        <linearGradient id="${p}-RUST" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4c1e" stop-opacity=".75"/><stop offset="1" stop-color="#8a4c1e" stop-opacity="0"/></linearGradient>
        <radialGradient id="${p}-SCORCH"><stop offset="0" stop-color="#050302" stop-opacity=".85"/><stop offset=".55" stop-color="#1a110a" stop-opacity=".55"/><stop offset="1" stop-color="#1a110a" stop-opacity="0"/></radialGradient>
        <radialGradient id="${p}-FIREGLOW"><stop offset="0" stop-color="#ffb347" stop-opacity=".8"/><stop offset="1" stop-color="#ff4d00" stop-opacity="0"/></radialGradient>
        <radialGradient id="${p}-BAYGLOW"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset="1" stop-color="#ff8a1a" stop-opacity="0"/></radialGradient>
        __GRADS__</defs><g class="scene">`;
      let body = '';
      parts.forEach(pt => { pt.el = null; body += `<g data-part="${pt.id}">${pt.tank !== undefined ? `<g class="tk" style="display:none">${pt.svgCache}</g>` : renderPart(pt)}</g>`; });
      html += body + `</g><g class="fx"></g><g class="smoke"></g></svg>`;
      const gradDefs = [...grads].map(([c, id]) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(c, .6)}"/><stop offset=".38" stop-color="${shade(c, 1.35)}"/><stop offset=".65" stop-color="${shade(c, 1)}"/><stop offset="1" stop-color="${shade(c, .5)}"/></linearGradient>`).join('');
      html = fixIds(html.replace('__GRADS__', gradDefs));
      container.innerHTML = html;
      svg = container.querySelector('svg'); scene = svg.querySelector('.scene'); smokeG = svg.querySelector('.smoke');
      parts.forEach(pt => { pt.el = scene.querySelector(`[data-part="${pt.id}"]`); });
      fanEls = [...svg.querySelectorAll('[data-fan]')];
      radarEl = svg.querySelector('[data-radar]'); beaconEl = svg.querySelector('[data-beacon]');
      gates.forEach(g => {
        g.lamps = [...svg.querySelectorAll(`[data-lamp="${g.i}"]`)];
        g.bars = [...svg.querySelectorAll(`[data-bar="${g.i}"]`)];
        g.glowEl = svg.querySelector(`[data-glow="${g.i}"]`);
        g.stripEl = svg.querySelector(`[data-strip="${g.i}"]`);
        g.tankPart = parts.find(pt => pt.tank === g.i);
        g.doorParts = parts.filter(pt => pt.door === g.i);
      });
      stackTops = S.STACKS.map(([x, y, z]) => proj(xf.p([x, y, z])));
      // damage effects: smoke sources + fires
      const d = RS.dmg, fx = svg.querySelector('.fx');
      dmgSmoke = d === 0 ? [] : S.DAMAGE_PTS.slice(0, d === 1 ? 1 : 4).map(q => proj(xf.p(q)));
      fires = [];
      if (d === 2) S.DAMAGE_PTS.slice(0, 3).forEach((q, k) => {
        const c = proj(xf.p(q)), sc = k === 0 ? 2.1 : 1.6;
        fx.insertAdjacentHTML('beforeend', `<g transform="translate(${f(c[0])},${f(c[1])}) scale(${sc})"><ellipse rx="18" ry="10" fill="url(#${p}-FIREGLOW)"/><ellipse rx="7" ry="3.5" fill="#1a0d05" opacity=".7"/>
          <g data-fl="0" fill="#ff4d00">${FLAME}</g><g data-fl="1" fill="#ff9a1a" transform="scale(.7)">${FLAME}</g><g data-fl="2" fill="#ffe07a" transform="scale(.4)">${FLAME}</g></g>`);
        fires.push([...fx.lastElementChild.querySelectorAll('[data-fl]')]);
      });
      if (d === 1) { const c = proj(xf.p(S.DAMAGE_PTS[0])); fx.insertAdjacentHTML('beforeend', `<g transform="translate(${f(c[0])},${f(c[1])})"><ellipse rx="7" ry="4" fill="url(#${p}-FIREGLOW)" data-spark="1"/></g>`); }
      sparkEl = fx.querySelector('[data-spark]');
      smoke = []; order = [];
      if (!o.captured) fanSpeed = 0;
      resort();
    }

    function resort() {
      const items = [];
      parts.forEach(pt => { const b = partAABB(pt); pt.aabb = b; if (b) { pt.sb = screenBox(b); items.push(pt); } });
      const sorted = depthSort(items.map(pt => ({ aabb: pt.aabb, sb: pt.sb, pt }))).map(it => it.pt);
      const ids = sorted.map(pt => pt.id).join('|');
      if (ids !== order) { order = ids; sorted.forEach(pt => scene.appendChild(pt.el)); }
    }

    // gates facing away from the camera: tank is fully occluded until it leaves the bay
    const gatesAway = () => dot(xf.v([0, 1, 0]), VIEW) <= 0;
    const tankHidden = g => gatesAway() && g.ty + S.TANK_BOX[2] < S.D + 2;
    const smooth = t => t * t * (3 - 2 * t);
    const clamp = v => Math.max(0, Math.min(1, v));

    function start(g, res) { g.phase = 'opening'; g.t = 0; g.ty = S.TANK_START; g.resolve = res; }
    function stepGate(g, dt, now) {
      if (g.locked) return false;   // disabled line: lights stay off
      let moved = false;
      if (g.phase === 'opening') { g.door = Math.min(1, g.door + dt * spd() / 0.9); if (g.door >= 1) { g.phase = 'driving'; g.t = 0; g.tankPart.el.firstChild.style.display = ''; } }
      else if (g.phase === 'driving') {
        g.t = Math.min(1, g.t + dt * spd() / 3);
        g.ty = S.TANK_START + (S.TANK_END - S.TANK_START) * smooth(g.t);
        if (g.ty + S.TANK_BOX[2] > S.D + 4) g.door = Math.max(0, g.door - dt * spd() / 0.9);
        let op = clamp((g.ty - S.TANK_START) / 18);
        if (o.fadeOutTank && g.t > 0.86) op *= (1 - g.t) / 0.14;
        const br = 0.25 + 0.75 * clamp((g.ty - (S.BY + 50)) / 60);
        const c = proj(xf.p([S.GX[g.i], g.ty, 0]));
        const tk = g.tankPart.el.firstChild;
        tk.setAttribute('transform', `translate(${f(c[0])},${f(c[1])})`);
        tk.style.display = tankHidden(g) ? 'none' : '';
        tk.style.opacity = op.toFixed(3); tk.style.filter = `brightness(${br.toFixed(2)})`;
        moved = true;
        if (g.t >= 1) {
          g.phase = 'closing';
          if (o.fadeOutTank) tk.style.display = 'none';
          if (o.onTankOut) try { o.onTankOut(g.line); } catch (e) { console.error(e); }
        }
      } else if (g.phase === 'closing') {
        g.door = Math.max(0, g.door - dt * spd() / 0.9);
        if (g.door <= 0) {
          g.phase = 'idle'; if (!o.fadeOutTank) g.tankPart.el.firstChild.style.display = 'none';
          const r = g.resolve; g.resolve = null; r && r(true);
          if (g.queue.length) start(g, g.queue.shift());
        }
      }
      g.doorParts.forEach(pt => {
        if (Math.abs(pt.lastOpen - g.door) > 0.002 || (g.door === 0 && pt.lastOpen !== 0)) {
          pt.lastOpen = g.door; pt.prims = S.doorPrims(g.i, pt.side, g.door, lightCol());
          pt.el.innerHTML = fixIds(renderPart(pt));
          moved = true;
        }
      });
      const busy = g.phase !== 'idle';
      const blink = busy ? Math.sin(now * 10) > 0 : true;
      const col = busy ? (blink ? '#ffb020' : '#5a3a00') : (o.captured ? '#3dff5a' : '#59616a');
      g.lamps.forEach(l => l.setAttribute('fill', col));
      if (busy) g.lamps.forEach(l => l.setAttribute('opacity', '1'));
      if (busy || RS.dmg !== 2) g.bars.forEach(b => b.setAttribute('opacity', busy ? (blink ? '1' : '.3') : (o.captured ? '.9' : '.25')));
      if (g.glowEl) g.glowEl.setAttribute('opacity', (busy ? 0.8 + 0.15 * Math.sin(now * 6) : 0.2).toFixed(2));
      if (g.stripEl) g.stripEl.setAttribute('opacity', busy ? '1' : '.35');
      return moved;
    }

    let dmgAcc = 0;
    function stepSmoke(dt, busy) {
      if (dmgSmoke.length) {
        dmgAcc += dt * dmgSmoke.length * (RS.dmg === 2 ? 4 : 2.5);
        while (dmgAcc >= 1) {
          dmgAcc -= 1;
          const c = dmgSmoke[(Math.random() * dmgSmoke.length) | 0];
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          el.setAttribute('fill', RS.dmg === 2 ? '#141414' : '#3a3a3a'); smokeG.appendChild(el);
          smoke.push({ el, x: c[0] + (Math.random() - 0.5) * 6, y: c[1] - 4, life: 0, max: 2.6 + Math.random() * 1.4, vx: 4 + Math.random() * 6, big: RS.dmg === 2 ? 1.8 : 1.3, op: 0.7 });
        }
      }
      spawnAcc += o.captured ? dt * (busy ? 4 + busy * 3 : 1) : 0;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const c = stackTops[(Math.random() * stackTops.length) | 0];
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        el.setAttribute('fill', busy ? '#7a8088' : '#9aa0a8'); smokeG.appendChild(el);
        smoke.push({ el, x: c[0] + (Math.random() - 0.5) * 4, y: c[1] - 1, life: 0, max: 2 + Math.random(), vx: 5 + Math.random() * 6 });
      }
      smoke = smoke.filter(s => {
        s.life += dt; const k = s.life / s.max;
        if (k >= 1) { s.el.remove(); return false; }
        s.x += s.vx * dt; s.y -= (22 - 8 * k) * dt;
        s.el.setAttribute('cx', f(s.x)); s.el.setAttribute('cy', f(s.y)); s.el.setAttribute('r', f((3 + 10 * k) * (s.big || 1))); s.el.setAttribute('opacity', f((s.op || 0.5) * (1 - k)));
        return true;
      });
    }

    // upgrade effect: the new level's parts drop into place with sparks and a glow pulse
    function startUpgrade(prev) {
      const fx = svg.querySelector('.fx');
      const kits = parts.filter(pt => pt.kit && pt.kit > prev && pt.el && pt.aabb);
      const sparks = [];
      kits.forEach(pt => {
        const b = pt.aabb, c = proj([(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[5]]);
        for (let i = 0; i < 9; i++) {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          el.setAttribute('r', (1 + Math.random() * 0.8).toFixed(2)); el.setAttribute('fill', Math.random() < 0.55 ? '#ffd27a' : '#ffffff'); fx.appendChild(el);
          sparks.push({ el, x: c[0], y: c[1], vx: (Math.random() - 0.5) * 130, vy: -40 - Math.random() * 100, life: 0, max: 0.5 + Math.random() * 0.45 });
        }
      });
      const a = proj(xf.p([S.W / 2, S.D / 2, 0]));
      fx.insertAdjacentHTML('beforeend', `<ellipse cx="${f(a[0])}" cy="${f(a[1])}" rx="10" ry="6" fill="url(#${p}-FIREGLOW)" opacity=".8"/>`);
      upFx = { t: 0, kits, sparks, flash: fx.lastElementChild };
      kits.forEach(pt => { pt.el.style.opacity = '0'; });
    }
    function stepUpgrade(dt) {
      const u = upFx; u.t += dt / 0.8;
      const e = Math.min(1, u.t), k = 1 - Math.pow(1 - e, 3);
      u.kits.forEach(pt => { pt.el.setAttribute('transform', `translate(0,${f(-(1 - k) * 30)})`); pt.el.style.opacity = Math.min(1, e * 2).toFixed(2); });
      u.flash.setAttribute('rx', f(10 + 200 * e)); u.flash.setAttribute('ry', f(6 + 120 * e)); u.flash.setAttribute('opacity', f(0.7 * (1 - e)));
      u.sparks = u.sparks.filter(s => { s.life += dt; if (s.life >= s.max) { s.el.remove(); return false; }
        s.vy += 220 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.el.setAttribute('cx', f(s.x)); s.el.setAttribute('cy', f(s.y)); s.el.setAttribute('opacity', f(1 - s.life / s.max)); return true; });
      if (e >= 1 && !u.sparks.length) { u.kits.forEach(pt => { pt.el.removeAttribute('transform'); pt.el.style.opacity = ''; }); u.flash.remove(); upFx = null; }
    }

    function loop(ts) {
      if (!alive) return;
      const now = ts / 1000, dt = Math.min(0.05, last ? now - last : 0.016); last = now;
      let busy = 0, moved = false;
      gates.forEach(g => { if (stepGate(g, dt, now)) moved = true; if (!g.locked && g.phase !== 'idle') busy++; });
      if (moved) resort();
      const powered = o.captured;
      fanSpeed += ((!powered ? 0 : busy ? 820 * spd() : 160 * (1 + 0.1 * o.level)) - fanSpeed) * Math.min(1, dt * 2);
      fanAngle = (fanAngle + fanSpeed * dt) % 360;
      fanAngle2 = (fanAngle2 + fanSpeed * 0.62 * dt) % 360;   // large fans turn slower (heavier blades)
      fanEls.forEach((el, k) => {
        const gi = el.getAttribute('data-gate');
        if (el.hasAttribute('data-large')) { el.setAttribute('transform', `rotate(${f(fanAngle2 + k * 23)})`); return; }           // fan above a gate: off when that line is disabled
        if (gi !== null && gates[+gi] && gates[+gi].locked) return;
        el.setAttribute('transform', `rotate(${f(fanAngle + k * 23)})`);
      });
      if (powered) radarAngle = (radarAngle + 70 * dt) % 360; if (radarEl) radarEl.setAttribute('transform', `rotate(${f(radarAngle)})`);
      if (beaconEl) beaconEl.setAttribute('opacity', powered && (now % 1.2) < 0.25 ? '1' : '.15');
      fires.forEach((fl, k) => fl.forEach((el, j) => {
        const sx = (j === 0 ? 1 : j === 1 ? 0.7 : 0.4) * (0.85 + 0.25 * Math.sin(now * (9 + j * 3) + k * 2 + j));
        const sy = (j === 0 ? 1 : j === 1 ? 0.7 : 0.4) * (0.8 + 0.35 * Math.abs(Math.sin(now * (7 + j * 2.3) + k)));
        el.setAttribute('transform', `scale(${f4(sx)},${f4(sy)})`);
      }));
      if (sparkEl) sparkEl.setAttribute('opacity', Math.random() < 0.12 ? '1' : '0.15');
      if (RS.dmg === 2) gates.forEach(g => { if (!g.locked && g.phase === 'idle' && Math.random() < 0.08) { const v = Math.random() < 0.5 ? '.15' : '1'; g.lamps.forEach(l => l.setAttribute('opacity', v)); g.bars.forEach(b => b.setAttribute('opacity', v)); } });
      if (upFx) stepUpgrade(dt);
      stepSmoke(dt, busy);
      raf = requestAnimationFrame(loop);
    }

    mount();
    raf = requestAnimationFrame(loop);

    return {
      get lines() { return o.lines; },
      get facing() { return o.facing; },
      get element() { return svg; },
      produce(line) {
        return new Promise(res => {
          const g = gates[act[line]];
          if (!g || g.locked || !o.captured) return res(false);
          if (g.phase !== 'idle') { g.queue.push(res); return; }
          start(g, res);
        });
      },
      // line = production line 0..lines-1 (active gates counted left → right)
      isBusy: l => act[l] !== undefined && gates[act[l]].phase !== 'idle',
      isLocked: l => act[l] === undefined,
      get maxLines() { return S.GX.length; },
      gateOfLine: l => act[l],
      setLines(n) { o.lines = n; mount(); },
      setFacing(k) { o.facing = k; mount(); },
      rotate(step = 1) { o.facing = (o.facing + step + 4) % 4; mount(); },
      setTeam(c) { o.team = c; mount(); },
      setPaint(c) { o.paint = c; mount(); },
      get level() { return o.level; },
      get speed() { return spd(); },
      // upgrade level 0..3: adds the level's parts (cumulative) and speeds up production (×1.1 / ×1.2 / ×1.3);
      // raising the level plays the upgrade effect (sparks + drop-in)
      setLevel(n) { const prev = o.level; o.level = Math.max(0, Math.min(3, n | 0)); if (o.level === prev) return; upFx = null; mount(); if (o.level > prev) startUpgrade(prev); },
      // optional: override the production speed multiplier (default 1 + 0.1 × level); null = automatic
      setSpeed(m) { o.speed = m; },   // null = derive from team colour
      get captured() { return o.captured; },
      get health() { return o.health; },
      get damageLevel() { return dmgLevel(); },
      // not captured = neutral light-grey building, lights off, no production
      setCaptured(b, team) { o.captured = !!b; if (team) o.team = team; mount(); },
      // 0..1 — re-renders only when crossing the 50% / 20% thresholds
      setHealth(h) { const before = dmgLevel(); o.health = Math.max(0, Math.min(1, h)); if (dmgLevel() !== before) mount(); },
      // svg-unit point → pixel offset inside the element (needs scale option)
      toPixels(pt) { const k = o.scale || 1; return { x: (pt.x - vb[0]) * k, y: (pt.y - vb[1]) * k }; },
      // ground centre of the building (put this on your tile centre)
      anchor() { const q = proj(xf.p([S.W / 2, S.D / 2, 0])); return this.toPixels({ x: q[0], y: q[1] }); },
      // where the produced tank stops, in pixels inside the element (spawn the unit here)
      gateExit(line) { const q = proj(xf.p([S.GX[act[line]], S.TANK_END, 0])); return this.toPixels({ x: q[0], y: q[1] }); },
      setScale(k) { o.scale = k; mount(); },
      toSVGString() { const c = svg.cloneNode(true); c.querySelector('.smoke').innerHTML = ''; return '<?xml version="1.0" encoding="UTF-8"?>\n' + c.outerHTML; },
      destroy() { alive = false; cancelAnimationFrame(raf); container.innerHTML = ''; },
    };
  }

  const api = {
    create, proj, makeXf, prism, box, rect, extrudeX, cyl, finalize, renderSolid, primAABB, screenBox, depthSort,
    shade, mix, paintOf, oct, emblem, glow, doorDec, lockDec, OUT, f, f4,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VectorEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

/*!
 * HeavyFactory — 2.5D isometric vector (SVG) Heavy Tank Factory
 * -----------------------------------------------------------------
 * - High-tech look: sloped armour, control tower + radar, sliding blast
 *   doors, beveled platform with team-coloured light lines, turbine fans.
 * - 3 gates (production lines); map decides how many are active (1..3).
 *   Unused gates look disabled (same door, powered off).
 * - 6 exhaust turbine fans (spin up while producing).
 * - 4 fixed facings (0/90/180/270°) with real depth sorting, so tanks
 *   drive out correctly from any side.
 * - Team colour drives all light strips, emblems, fan rings and tanks.
 *
 * Usage:
 *   const f = HeavyFactory.create(el, {
 *     lines: 2,            // active lines from the map (1..3)
 *     facing: 0,           // 0..3 → 0°, 90°, 180°, 270°
 *     team: '#33d17a',
 *     paint: null,         // body armour colour; null = derived from team colour
 *     captured: true,      // false = neutral light-grey, no production
 *     health: 1,           // ≤0.5 semi-damaged, <0.2 heavily damaged (fire, holes)
 *     fadeOutTank: true,
 *     onTankOut: line => spawnUnit(line)
 *   });
 *   f.produce(0);  f.setLines(3);  f.setFacing(1);  f.setTeam('#e5484d');
 *   scale: 0.2            // optional: fixed pixel size (svg units × scale)
 *   f.anchor()            → {x,y} px inside the element = building ground centre
 *   f.gateExit(line)      → {x,y} px inside the element where the tank stops
 *   Placement: el.style.left = tileX - f.anchor().x; el.style.top = tileY - f.anchor().y
 * Requires vector-engine.js (global VectorEngine) to be loaded first.
 */
(function (global) {
  'use strict';
  const VE = global.VectorEngine || (typeof require !== 'undefined' ? require('./vector-engine.js') : null);
  const { proj, prism, box, rect, extrudeX, cyl, shade, mix, paintOf, oct, emblem, glow, doorDec, lockDec, OUT, f } = VE;

  // -------------------------------------------------------------- model
  const W = 300, D = 180, H = 90, BD = 92, BY = D - BD; // BY: bay back wall y
  const GW = 34, GH = 62, GX = [55, 150, 245];
  const PAD = { x0: -52, y0: -34, x1: W + 42, y1: D + 132 };
  const CX = (PAD.x0 + PAD.x1) / 2, CY = (PAD.y0 + PAD.y1) / 2;
  const TANK_START = BY + 34, TANK_END = D + 112;
  const STACKS = [[132, 26, H + 30], [132, 68, H + 30]];
  const M = { steel: '#5a6573', dark: '#38404a', plate: '#6b7785', interior: '#161a20', pad: '#3a414a', padSide: '#272c33', trim: '#808c9a', door: '#717d8b', lock: '#717d8b' };


  // decals ---------------------------------------------------------------
  function padDecal(lines, T, TL) {
    const p = PAD; let s = '';
    for (let x = p.x0 + 30; x < p.x1 - 10; x += 40) s += `<line x1="${x}" y1="${p.y0 + 8}" x2="${x}" y2="${p.y1 - 8}" stroke="#2c3239" stroke-width=".9"/>`;
    for (let y = p.y0 + 26; y < p.y1 - 10; y += 40) s += `<line x1="${p.x0 + 8}" y1="${y}" x2="${p.x1 - 8}" y2="${y}" stroke="#2c3239" stroke-width=".9"/>`;
    const e = oct(p.x0 + 13, p.y0 + 13, p.x1 - 13, p.y1 - 13, 17).map(q => q.join(',')).join(' ');
    s += `<polygon points="${e}" fill="none" stroke="#5a636d" stroke-width="1.1" opacity=".8"/>`;   // plain steel edge line (no team colour)
    s += `<polygon points="${e}" fill="none" stroke="#1f242a" stroke-width=".6" transform="translate(.6,.6)" opacity=".7"/>`;
    // bay floors + lanes
    GX.forEach((gx, i) => {
      s += `<rect x="${gx - GW}" y="${BY}" width="${GW * 2}" height="${BD}" fill="#14181d"/>`;
      if (lines.includes(i)) {
        s += `<ellipse data-glow="${i}" cx="${gx}" cy="${BY + 50}" rx="30" ry="40" fill="url(#BAYGLOW)" opacity=".2"/>`;
        [-10, 10].forEach(dx => s += `<line x1="${gx + dx}" y1="${BY + 4}" x2="${gx + dx}" y2="${D}" stroke="#3b434c" stroke-width="2"/>`);
        s += `<line x1="${gx - GW - 2}" y1="${D + 8}" x2="${gx - GW - 2}" y2="${D + 112}" stroke="${T}" stroke-width="1.8" ${glow}/>`;
        s += `<line x1="${gx + GW + 2}" y1="${D + 8}" x2="${gx + GW + 2}" y2="${D + 112}" stroke="${T}" stroke-width="1.8" ${glow}/>`;
        s += `<path d="M${gx - 20},${D + 42} L${gx},${D + 57} L${gx + 20},${D + 42}" fill="none" stroke="#c3c9cf" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`;   // single exit arrow
        s += `<rect x="${gx - GW}" y="${D}" width="${GW * 2}" height="2" fill="${T}" opacity=".7"/>`;
      } else {

      }
    });
    // left service pad (coolant)
    s += `<circle cx="-28" cy="53" r="27" fill="none" stroke="#5a6470" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    return s;
  }
  function buildModel(lines, T, PAINT, st) {   // lines = sorted list of active gate indices
    st = st || {};
    const neutral = T === null;
    if (neutral) T = '#9aa4ae';
    const TL = mix(T, '#ffffff', 0.5);
    PAINT = PAINT || paintOf(neutral ? null : T);
    const LAMP_IDLE = neutral ? '#59616a' : '#3dff5a';
    const LV = st.level || 0;
    const parts = [];
    const add = (id, prims, extra) => parts.push(Object.assign({ id, prims }, extra || {}));
    const INT = { fill: M.interior, flat: true };

    // platform
    add('pad', [prism(oct(PAD.x0, PAD.y0, PAD.x1, PAD.y1, 26), oct(PAD.x0 + 7, PAD.y0 + 7, PAD.x1 - 7, PAD.y1 - 7, 23), -12, 0,
      { fill: M.padSide, weather: 0.6, faces: { pz: { fill: M.pad, weather: 0.5, dec: padDecal(lines, T, TL) } } })]);

    // coolant tanks
    [[-28, 36], [-28, 70]].forEach(([x, y], k) => add('cool' + k, [cyl(x, y, 13, 0, 44, {
      fill: M.plate, top: '#7d8997', bands: [[10, T, 1.6, 1], [34, T, 1.6, 1], [22, '#2a3038', 1]],
      dec: `<circle r="9" fill="none" stroke="#3a424c" stroke-width="2"/><circle r="4" fill="#4b5560" stroke="${OUT}" stroke-width=".6"/>`,
    })]));

    // back block (sloped back + sides, vertical front = bay back wall)
    const sideDecBack = ({ w, h }) => `
      <rect x="6" y="8" width="${w - 12}" height="${h - 16}" fill="none" stroke="#3d4651" stroke-width="1"/>
      <g transform="translate(${w / 2},${h * 0.42})">${emblem(T, TL, 1.2)}</g>
      <text x="${w / 2}" y="${h - 14}" font-family="Impact,'Arial Black',sans-serif" font-size="11" text-anchor="middle" fill="${TL}" opacity=".85" letter-spacing="2">HF-3</text>
      <rect x="0" y="${h - 5}" width="${w}" height="5" fill="#262c33" opacity=".85"/>`;
    const backDec = ({ w, h }) => {
      let s = `<rect x="0" y="16" width="${w}" height="3" fill="${T}" ${glow}/>`;
      [40, 120, 200].forEach(x => { s += `<rect x="${x}" y="30" width="56" height="34" fill="#1d2228" stroke="#7d8997" stroke-width="1.4"/>`; for (let yy = 34; yy < 62; yy += 5) s += `<line x1="${x + 3}" y1="${yy}" x2="${x + 53}" y2="${yy + 2}" stroke="#4d5763" stroke-width="2"/>`; });
      s += `<rect x="${w - 30}" y="50" width="18" height="${h - 50}" fill="#2a3038" stroke="#8b97a5" stroke-width=".8"/>`;
      s += `<rect x="0" y="${h - 5}" width="${w}" height="5" fill="#262c33" opacity=".85"/>`;
      return s;
    };
    const bayWallDec = () => { // origin at x=0 (bounding box of trapezoid)
      let s = '';
      GX.forEach((gx, i) => {
        if (!lines.includes(i)) return;
        const u = gx - GW;
        s += `<rect x="${u + 6}" y="${H - GH + 6}" width="${GW * 2 - 12}" height="22" fill="#20262d" stroke="#3b444e" stroke-width="1"/>`;
        s += `<rect data-strip="${i}" x="${u + 4}" y="${H - GH + 34}" width="${GW * 2 - 8}" height="4" fill="#ffcf70" opacity=".35" ${glow}/>`;
        s += `<rect x="${u + 10}" y="${H - 18}" width="${GW * 2 - 20}" height="14" fill="#262c33"/>`;
      });
      return s;
    };
    add('back', [prism(rect(0, 0, W, BY), rect(10, 12, W - 10, BY), 0, H, {
      fill: PAINT, weather: 1, faces: {
        nx: { dec: sideDecBack }, px: { dec: sideDecBack }, ny: { dec: backDec },
        py: { fill: '#1b2027', flat: true, dec: bayWallDec },
        pz: { fill: PAINT, dec: () => { let s = ''; for (let x = 40; x < W - 10; x += 50) s += `<line x1="${x}" y1="14" x2="${x}" y2="${BY}" stroke="#46505c" stroke-width="1"/>`; s += `<rect x="150" y="${BY - 6}" width="136" height="3" fill="${T}" ${glow}/>`;  return s; } },
      },
    })]);

    // pillars
    const pillarFront = ({ w, h }) => `<rect x="2" y="4" width="${w - 4}" height="${h - 8}" fill="none" stroke="#3d4651" stroke-width=".8"/><rect x="${w / 2 - 1.5}" y="10" width="3" height="${h - 40}" fill="${T}" ${glow}/><circle cx="${w / 2}" cy="${h - 20}" r="2" fill="${TL}"/>`;
    const pillarSide = ({ w, h }) => {
      let s = `<rect x="8" y="10" width="${w - 16}" height="${h - 24}" fill="none" stroke="#3d4651" stroke-width="1"/>`;
      for (let y = 18; y < 52; y += 6) s += `<rect x="18" y="${y}" width="${w - 36}" height="3" fill="#252b32"/>`;
      s += `<path d="M10,${h - 30} L${w / 2},${h - 40} L${w - 10},${h - 30}" fill="none" stroke="${T}" stroke-width="2.4" ${glow}/>`;
      s += `<rect x="0" y="${h - 5}" width="${w}" height="5" fill="#262c33" opacity=".85"/>`;
      return s;
    };
    add('pilL', [prism(rect(0, BY, GX[0] - GW, D), rect(10, BY, GX[0] - GW, D), 0, H, { fill: PAINT, weather: 1, faces: { px: INT, nx: { dec: pillarSide }, py: { dec: pillarFront } } })]);
    add('pilR', [prism(rect(GX[2] + GW, BY, W, D), rect(GX[2] + GW, BY, W - 10, D), 0, H, { fill: PAINT, weather: 1, faces: { nx: INT, px: { dec: pillarSide }, py: { dec: pillarFront } } })]);
    add('pilM1', [box(GX[0] + GW, GX[1] - GW, BY, D, 0, H, { fill: PAINT, weather: 1, faces: { nx: INT, px: INT, py: { dec: pillarFront } } })]);
    add('pilM2', [box(GX[1] + GW, GX[2] - GW, BY, D, 0, H, { fill: PAINT, weather: 1, faces: { nx: INT, px: INT, py: { dec: pillarFront } } })]);

    // bay ceilings + gate frames
    GX.forEach((gx, i) => {
      const locked = !lines.includes(i), num = locked ? '' : lines.indexOf(i) + 1;
      add('lint' + i, [box(gx - GW, gx + GW, BY, D, GH, H, { fill: PAINT, weather: 1, faces: { pz: { dec: `<rect x="${gx - GW + 4}" y="${BY + 4}" width="${GW * 2 - 8}" height="${BD - 8}" fill="none" stroke="#46505c" stroke-width="1"/>` } } })]);
      const jambDec = ({ w, h }) => `<rect x="${w / 2 - .6}" y="4" width="1.2" height="${h - 8}" fill="${T}" opacity=".7"/>`;
      add('jambL' + i, [box(gx - GW - 6, gx - GW, D, D + 6, 0, GH, { fill: M.trim, weather: 0.5, faces: { py: { dec: jambDec } } })]);
      add('jambR' + i, [box(gx + GW, gx + GW + 6, D, D + 6, 0, GH, { fill: M.trim, weather: 0.5, faces: { py: { dec: jambDec } } })]);
      const trimDec = ({ w }) => `
        <rect x="${w / 2 - 6}" y="1" width="12" height="8" rx="1" fill="#0f1317" stroke="#5a6470" stroke-width=".5"/>
        <text x="${w / 2}" y="7.6" font-family="Impact,'Arial Black',sans-serif" font-size="7.5" text-anchor="middle" fill="${locked ? '#6e7883' : TL}">${num}</text>
        <rect data-bar="${i}" x="12" y="4" width="${w / 2 - 22}" height="2" fill="${locked ? '#5d656e' : T}" ${glow}/>
        <rect data-bar="${i}" x="${w / 2 + 10}" y="4" width="${w / 2 - 22}" height="2" fill="${locked ? '#5d656e' : T}" ${glow}/>
        <circle data-lamp="${i}" cx="6" cy="5" r="2.6" fill="${locked ? '#59616a' : LAMP_IDLE}" stroke="${OUT}" stroke-width=".6" ${glow}/>
        <circle data-lamp="${i}" cx="${w - 6}" cy="5" r="2.6" fill="${locked ? '#59616a' : LAMP_IDLE}" stroke="${OUT}" stroke-width=".6" ${glow}/>`;
      add('trim' + i, [box(gx - GW - 6, gx + GW + 6, D, D + 6, GH, GH + 10, { fill: M.trim, weather: 0.5, faces: { py: { dec: trimDec } } })]);
      if (locked) add('lock' + i, [box(gx - GW, gx + GW, D - 4, D - 1, 0, GH, { fill: M.lock, weather: 0.8, faces: { py: { dec: lockDec(GW) } } })]);
      else { add('doorL' + i, [], { door: i, side: 'L' }); add('doorR' + i, [], { door: i, side: 'R' }); add('tank' + i, [], { tank: i }); }
    });

    // front canopy (visor)
    add('canopy', [extrudeX(8, W - 8, [[D, H], [D + 16, H - 6], [D + 16, H - 12], [D, H - 16]], {
 fill: M.plate, weather: 0.6, faces: { py: { dec: ({ w, h }) => { let s = `<rect x="0" y="${h / 2 - 1}" width="${w}" height="2" fill="${T}" ${glow}/>`; for (let x = 10; x < w; x += 22) s += `<circle cx="${x}" cy="${h / 2}" r="1.2" fill="#fff"/>`; return s; } } },
    })]);

    // control tower
    const towerDec = ({ w, h }) => { let s = `<rect x="0" y="5" width="${w}" height="7" fill="#12161b"/>`; for (let x = 4; x < w - 6; x += 9) s += `<rect x="${x}" y="6.5" width="6" height="4" fill="${TL}" opacity=".85" ${glow}/>`; s += `<line x1="0" y1="18" x2="${w}" y2="18" stroke="#3d4651"/>`; return s; };
    add('tower', [prism(rect(24, 18, 120, 80), rect(32, 24, 112, 74), H, H + 26, {
      fill: shade(PAINT, 0.9), weather: 1, faces: { px: { dec: towerDec }, nx: { dec: towerDec }, py: { dec: towerDec }, ny: { dec: towerDec },
        pz: { dec: `<circle cx="72" cy="49" r="14" fill="none" stroke="${T}" stroke-width="1.4" ${glow}/>` } },
    })]);
    add('radar', [cyl(72, 49, 2.5, H + 26, H + 40, { fill: M.plate }), cyl(72, 49, 6, H + 40, H + 43, {
      fill: '#7d8997', top: '#8c98a6',
      dec: `<g data-radar="1"><rect x="-15" y="-2.2" width="30" height="4.4" rx="1" fill="#c9d2dc" stroke="${OUT}" stroke-width=".6"/><rect x="9" y="-3.2" width="6" height="6.4" fill="${T}"/></g><circle r="2.2" fill="${TL}"/>`,
    })]);
    add('antenna', [cyl(104, 30, 1.3, H + 26, H + 64, { fill: '#8a96a3', dec: `<circle data-beacon="1" r="2.6" fill="#ff4040" ${glow}/>` })]);

    // exhaust stacks
    STACKS.forEach(([x, y, z], k) => add('stack' + k, [cyl(x, y, 7, H, z, { fill: '#46505b', top: '#2b3138', bands: [[z - 4, T, 1.6, 1]], dec: '<circle r="5.4" fill="#0c0f12"/>' })]));

    // turbine fans: 3 over the gates + rear row (L0–1: 3 small · L2: 1 large + 1 small · L3: 2 large)
    const front = [[55, 134, 19], [150, 134, 19], [245, 134, 19]];
    const rear = LV >= 3 ? [[180, 50, 28], [250, 50, 28]] : LV >= 2 ? [[196, 50, 30], [262, 50, 15]] : [[166, 50, 19], [218, 50, 19], [270, 50, 19]];
    front.concat(rear).forEach(([x, y, R], k) => {
      const big = R > 22, n = big ? 9 : 7, sc = R / 19;
      const broken = st.dmg === 2 && (k === 1 || k === 3);
      const blades = Array.from({ length: n }, (_, j) => (broken && j % 2) ? '' : `<path transform="rotate(${j * 360 / n})" d="M2.5,-1.6 L13.5,-4.2 L14.2,1.2 L2.5,1.8 Z" fill="#c3ccd6" stroke="#59636e" stroke-width=".4"/>`).join('');
      const attrs = broken ? 'data-broken="1" transform="rotate(17)"' : `data-fan="${k}" ${big ? 'data-large="1"' : ''} ${k < 3 ? `data-gate="${k}"` : ''}`;
      add('fan' + k, [cyl(x, y, R, H, H + (big ? 9 : 7), {
        fill: '#3d4550', top: '#4a535e', bands: [[H + 3.5, '#22282f', 1]].concat(big ? [[H + 6.5, '#22282f', 1]] : []),
        dec: `<g transform="scale(${sc.toFixed(3)})"><circle r="17" fill="#0e1318" stroke="${T}" stroke-width="${big ? 1.4 : 1.8}" ${glow}/><circle r="14.4" fill="#18202a"/>
              ${big ? '<circle r="15.6" fill="none" stroke="#56616d" stroke-width=".5"/>' : ''}
              <g ${attrs}>${blades}</g>${broken ? '<path d="M-12,-6 L-3,1 L-6,9" fill="none" stroke="#0a0a0a" stroke-width="1.2"/>' : ''}
              <circle r="4.2" fill="#2b333d" stroke="${TL}" stroke-width="1"/><circle r="1.6" fill="${TL}"/>
              <path d="M-17,0 H17 M0,-17 V17" stroke="#56616d" stroke-width="${big ? .6 : .8}" opacity=".7"/></g>`,
      })], k >= 3 && LV >= 2 ? { kit: LV } : undefined);
    });

    // L1+: two small white stars on the roof between the front fans
    if (LV >= 1) [(GX[0] + GX[1]) / 2, (GX[1] + GX[2]) / 2].forEach((cx, k) => {
      const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.6 : 11; return [cx + Math.cos(a) * r, 134 + Math.sin(a) * r]; });
      add('star' + k, [prism(pts, pts, H, H + 0.6, { fill: shade(PAINT, 0.6), faces: { pz: { fill: '#e9eef3', flat: true } } })], { kit: 1 });
    });
    return parts;
  }

  function doorPrims(i, side, open, T) {
    const gx = GX[i], w = GW * (1 - open);
    if (w < 0.6) return [];
    const x0 = side === 'L' ? gx - GW : gx + GW - w, x1 = side === 'L' ? gx - GW + w : gx + GW;
    return [box(x0, x1, D - 4, D - 1, 0, GH, { fill: M.door, faces: { py: { dec: doorDec(side, T, open, GW) } } })];
  }

  function tankPrims(T, PAINT) {
    const TL = mix(T, '#ffffff', 0.45);
    PAINT = PAINT || paintOf(T);
    const wheels = ({ w }) => [7, 19, 31, 43, 55].map(u => `<circle cx="${u * w / 62}" cy="5" r="3.8" fill="#3c434b" stroke="${OUT}" stroke-width=".5"/><circle cx="${u * w / 62}" cy="5" r="1.3" fill="#8a949f"/>`).join('');
    const stripe = ({ w, h }) => `<rect x="0" y="${h * 0.42}" width="${w}" height="${h * 0.22}" fill="${T}"/>`;
    return [
      box(-20, -12, -31, 31, 0, 10, { fill: '#2b3036', faces: { px: { dec: wheels }, nx: { dec: wheels } } }),
      prism(rect(-15, -30, 15, 30), rect(-13, -28, 13, 18), 4, 16, {
        fill: PAINT, weather: 0.6, faces: {
          pz: { dec: `<rect x="-9" y="-26" width="18" height="8" fill="#353c44" stroke="${OUT}" stroke-width=".4"/><path d="M-6,-24 V-20 M-2,-24 V-20 M2,-24 V-20 M6,-24 V-20" stroke="#6b7580" stroke-width=".8"/><rect x="-13" y="10" width="26" height="2.2" fill="${T}"/>` },
          py: { dec: ({ w }) => `<circle cx="5" cy="3" r="1.6" fill="#fff6c8"/><circle cx="${w - 5}" cy="3" r="1.6" fill="#fff6c8"/>` },
        },
      }),
      box(12, 20, -31, 31, 0, 10, { fill: '#2b3036', faces: { px: { dec: wheels }, nx: { dec: wheels } } }),
      prism(rect(-11, -16, 11, 10), rect(-8, -13, 8, 4), 16, 25, {
        fill: mix(PAINT, '#ffffff', 0.08), weather: 0.6, faces: { px: { dec: stripe }, nx: { dec: stripe }, py: { dec: stripe }, ny: { dec: stripe }, pz: { dec: `<path d="M-5,-2 L0,-7 L5,-2" fill="none" stroke="${TL}" stroke-width="1.6"/><circle cx="3.5" cy="-10" r="2.4" fill="#4d5660" stroke="${OUT}" stroke-width=".4"/>` } },
      }),
      box(3, 7, -11, -6, 25, 28, { fill: '#3a4048', faces: { py: { dec: ({ w }) => `<rect x="0.5" y="1" width="${w - 1}" height="1.2" fill="${TL}"/>` } } }),
      box(-1.5, 1.5, 7, 46, 19.5, 22.5, { fill: '#4b535d' }),
      box(-2.6, 2.6, 42, 49, 18.8, 23.2, { fill: '#3e454e' }),
    ];
  }
  const TANK_BOX = [-20, 20, -31, 49, 0, 28];
  const DAMAGE_PTS = [[198, 112, H], [72, 30, H + 26], [286, 18, H], [30, 150, H]];

  const ORDER = [1, 0, 2];   // 1 line → centre gate; 2 lines → left + centre; 3 → all
  const SPEC = { prefix: 'hf', ORDER, W, D, H, BY, GX, GW, GH, PAD, CX, CY, TANK_START, TANK_END, TANK_BOX, STACKS, DAMAGE_PTS,
    TOP_PTS: [[104, 30, H + 64]], buildModel, doorPrims, tankPrims };
  const api = { create: (el, opts) => VE.create(el, SPEC, opts), spec: SPEC, project: proj, dims: { W, D, H, GW, GH, GX } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HeavyFactory = api;
})(typeof window !== 'undefined' ? window : globalThis);

/*!
 * MediumFactory — 2.5D isometric vector (SVG) Medium Tank Factory
 * ----------------------------------------------------------------
 * Same art style and API as HeavyFactory, built on the shared VectorEngine.
 * - 2 gates (production lines); the map decides 1 or 2 active. An unused gate
 *   looks disabled (same door, powered off).
 * - Look: compact, upright walls with radiator fin banks on both sides, a raised
 *   armoured central spine with a sensor dome + antenna, a sloped armour buttress
 *   between the gates carrying the team emblem, separate hoods over each gate,
 *   4 turbine fans, twin fuel silos at the back, hexagonal platform.
 * - Produces a lighter medium tank (octagonal turret, long gun).
 * - Team paint, weathering, 4 facings, not-captured (grey, powered down),
 *   damaged (≤50%) and critical (<20%) states — identical behaviour to the heavy.
 *
 * Usage (requires vector-engine.js loaded first):
 *   const f = MediumFactory.create(el, { lines: 2, facing: 0, team: '#3b82f6', scale: 0.2,
 *                                        onTankOut: line => spawnUnit(line) });
 *   f.produce(0); f.setLines(1); f.setFacing(2); f.setHealth(0.4); f.setCaptured(false);
 */
(function (global) {
  'use strict';
  const VE = global.VectorEngine || (typeof require !== 'undefined' ? require('./vector-engine.js') : null);
  const { proj, prism, box, rect, extrudeX, cyl, shade, mix, paintOf, oct, emblem, glow, doorDec, lockDec, OUT } = VE;

  // -------------------------------------------------------------- model
  const W = 220, D = 160, H = 76, BD = 82, BY = D - BD;    // BY: bay back wall y
  const GW = 30, GH = 56, GX = [52, 168];
  const SP = 12;                                           // spine height above roof
  const PAD = { x0: -40, y0: -34, x1: W + 40, y1: D + 116 };
  const CX = (PAD.x0 + PAD.x1) / 2, CY = (PAD.y0 + PAD.y1) / 2;
  const TANK_START = BY + 30, TANK_END = D + 98;
  const STACKS = [[16, 16, H + 22], [204, 16, H + 22]];
  const M = { plate: '#6b7785', interior: '#161a20', pad: '#3a414a', padSide: '#272c33', trim: '#808c9a', door: '#717d8b' };
  const ID = 'MF-2';

  function padDecal(lines, T, TL) {
    const p = PAD; let s = '';
    for (let x = p.x0 + 20; x < p.x1 - 10; x += 36) s += `<line x1="${x}" y1="${p.y0 + 8}" x2="${x}" y2="${p.y1 - 8}" stroke="#2c3239" stroke-width=".9"/>`;
    for (let y = p.y0 + 22; y < p.y1 - 10; y += 36) s += `<line x1="${p.x0 + 8}" y1="${y}" x2="${p.x1 - 8}" y2="${y}" stroke="#2c3239" stroke-width=".9"/>`;
    const e = oct(p.x0 + 12, p.y0 + 12, p.x1 - 12, p.y1 - 12, 32).map(q => q.join(',')).join(' ');
    s += `<polygon points="${e}" fill="none" stroke="#5a636d" stroke-width="1.1" opacity=".8"/>`;   // plain steel edge line (no team colour)
    s += `<polygon points="${e}" fill="none" stroke="#1f242a" stroke-width=".6" transform="translate(.6,.6)" opacity=".7"/>`;
    GX.forEach((gx, i) => {
      s += `<rect x="${gx - GW}" y="${BY}" width="${GW * 2}" height="${BD}" fill="#14181d"/>`;
      if (lines.includes(i)) {
        s += `<ellipse data-glow="${i}" cx="${gx}" cy="${BY + 44}" rx="26" ry="36" fill="url(#BAYGLOW)" opacity=".2"/>`;
        [-8, 8].forEach(dx => s += `<line x1="${gx + dx}" y1="${BY + 4}" x2="${gx + dx}" y2="${D}" stroke="#3b434c" stroke-width="2"/>`);
        s += `<line x1="${gx - GW - 2}" y1="${D + 8}" x2="${gx - GW - 2}" y2="${D + 98}" stroke="${T}" stroke-width="1.8" ${glow}/>`;
        s += `<line x1="${gx + GW + 2}" y1="${D + 8}" x2="${gx + GW + 2}" y2="${D + 98}" stroke="${T}" stroke-width="1.8" ${glow}/>`;
        s += `<path d="M${gx - 18},${D + 38} L${gx},${D + 51} L${gx + 18},${D + 38}" fill="none" stroke="#c3c9cf" stroke-width="4.3" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`;   // single exit arrow
        s += `<rect x="${gx - GW}" y="${D}" width="${GW * 2}" height="2" fill="${T}" opacity=".7"/>`;
      }
    });
    // silo pads at the back
    [[44, -16], [76, -16]].forEach(([x, y]) => s += `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#5a6470" stroke-width="1.1" stroke-dasharray="4 3"/>`);
    return s;
  }

  function buildModel(lines, T, PAINT, st) {   // lines = sorted list of active gate indices
    st = st || {};
    const neutral = T === null;
    if (neutral) T = '#9aa4ae';
    const TL = mix(T, '#ffffff', 0.5);
    PAINT = PAINT || paintOf(neutral ? null : T);
    const LAMP_IDLE = neutral ? '#59616a' : '#3dff5a';
    const LV = st.level || 0;
    const parts = [];
    const add = (id, prims, extra) => parts.push(Object.assign({ id, prims }, extra || {}));
    const INT = { fill: M.interior, flat: true };
    const DARK = '#262c33';

    // platform (hexagon-like: big chamfers)
    add('pad', [prism(oct(PAD.x0, PAD.y0, PAD.x1, PAD.y1, 44), oct(PAD.x0 + 7, PAD.y0 + 7, PAD.x1 - 7, PAD.y1 - 7, 41), -12, 0,
      { fill: M.padSide, weather: 0.6, faces: { pz: { fill: M.pad, weather: 0.5, dec: padDecal(lines, T, TL) } } })]);

    // twin fuel silos behind the building
    [[44, -16], [76, -16]].forEach(([x, y], k) => add('silo' + k, [cyl(x, y, 11, 0, 52, {
      fill: M.plate, top: '#7d8997', bands: [[12, T, 1.5, 1], [40, T, 1.5, 1], [26, '#2a3038', 1]],
      dec: `<circle r="7" fill="none" stroke="#3a424c" stroke-width="1.6"/><circle r="3" fill="#4b5560" stroke="${OUT}" stroke-width=".5"/>`,
    })]));

    // back block: upright sides, sloped back wall, vertical front = bay back wall
    const sideDec = ({ w, h }) => `
      <rect x="6" y="8" width="${w - 12}" height="${h - 16}" fill="none" stroke="#3d4651" stroke-width="1"/>
      <rect x="6" y="14" width="${w - 12}" height="2.4" fill="${T}" ${glow}/>
      <text x="${w / 2}" y="${h - 12}" font-family="Impact,'Arial Black',sans-serif" font-size="10" text-anchor="middle" fill="${TL}" opacity=".85" letter-spacing="2">${ID}</text>
      <rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`;
    const backDec = ({ w, h }) => {
      let s = `<rect x="0" y="14" width="${w}" height="3" fill="${T}" ${glow}/>`;
      [26, 128].forEach(x => { s += `<rect x="${x}" y="28" width="66" height="28" fill="#1d2228" stroke="#7d8997" stroke-width="1.3"/>`; for (let yy = 32; yy < 54; yy += 5) s += `<line x1="${x + 3}" y1="${yy}" x2="${x + 63}" y2="${yy + 2}" stroke="#4d5763" stroke-width="2"/>`; });
      s += `<g transform="translate(${w / 2},44)">${emblem(T, TL, 0.9)}</g>`;
      s += `<rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`;
      return s;
    };
    const bayWallDec = () => {
      let s = '';
      GX.forEach((gx, i) => {
        if (!lines.includes(i)) return;
        const u = gx - GW;
        s += `<rect x="${u + 6}" y="${H - GH + 6}" width="${GW * 2 - 12}" height="20" fill="#20262d" stroke="#3b444e" stroke-width="1"/>`;
        s += `<rect data-strip="${i}" x="${u + 4}" y="${H - GH + 30}" width="${GW * 2 - 8}" height="4" fill="#ffcf70" opacity=".35" ${glow}/>`;
        s += `<rect x="${u + 10}" y="${H - 16}" width="${GW * 2 - 20}" height="12" fill="#262c33"/>`;
      });
      return s;
    };
    add('back', [prism(rect(0, 0, W, BY), rect(0, 10, W, BY), 0, H, {
      fill: PAINT, weather: 1, faces: {
        nx: { dec: sideDec }, px: { dec: sideDec }, ny: { dec: backDec },
        py: { fill: '#1b2027', flat: true, dec: bayWallDec },
        pz: { dec: () => { let s = ''; for (let y = 22; y < BY; y += 22) s += `<line x1="4" y1="${y}" x2="${W - 4}" y2="${y}" stroke="#46505c" stroke-width="1"/>`; return s; } },
      },
    })]);

    // radiator fin banks on both sides (part of the new look)
    const fin = { fill: shade(PAINT, 0.8), weather: 0.6 };
    for (let k = 0; k < 6; k++) {
      const y = 12 + k * 10;
      add('finL' + k, [box(-6, 0, y, y + 3, 12, 62, fin)]);
      add('finR' + k, [box(W, W + 6, y, y + 3, 12, 62, fin)]);
    }

    // pillars (end pillars upright; centre pillar is the wide spine base)
    const pillarFront = ({ w, h }) => `<rect x="2" y="4" width="${w - 4}" height="${h - 8}" fill="none" stroke="#3d4651" stroke-width=".8"/><rect x="${w / 2 - 1.5}" y="10" width="3" height="${h - 36}" fill="${T}" ${glow}/>`;
    const pillarSide = ({ w, h }) => {
      let s = `<rect x="8" y="10" width="${w - 16}" height="${h - 22}" fill="none" stroke="#3d4651" stroke-width="1"/>`;
      for (let y = 18; y < 46; y += 6) s += `<rect x="16" y="${y}" width="${w - 32}" height="3" fill="#252b32"/>`;
      s += `<g transform="translate(${w / 2},${h - 26})">${emblem(T, TL, 0.75)}</g>`;
      s += `<rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`;
      return s;
    };
    add('pilL', [box(0, GX[0] - GW, BY, D, 0, H, { fill: PAINT, weather: 1, faces: { px: INT, nx: { dec: pillarSide }, py: { dec: pillarFront } } })]);
    add('pilR', [box(GX[1] + GW, W, BY, D, 0, H, { fill: PAINT, weather: 1, faces: { nx: INT, px: { dec: pillarSide }, py: { dec: pillarFront } } })]);
    add('pilM', [box(GX[0] + GW, GX[1] - GW, BY, D, 0, H, { fill: PAINT, weather: 1, faces: { nx: INT, px: INT } })]);

    // sloped armour buttress between the gates (team emblem)
    add('buttress', [extrudeX(GX[0] + GW + 4, GX[1] - GW - 4, [[D, 0], [D + 18, 0], [D, 60]], {
      fill: shade(PAINT, 0.95), weather: 1, faces: {
        py: { dec: ({ w, h }) => `<rect x="4" y="3" width="${w - 8}" height="2.4" fill="${T}" ${glow}/>
          <g transform="translate(${w / 2},${h * 0.42})">${emblem(T, TL, 0.95)}</g>
          <text x="${w / 2}" y="${h * 0.8}" font-family="Impact,'Arial Black',sans-serif" font-size="8" text-anchor="middle" fill="${TL}" opacity=".9" letter-spacing="1.5">${ID}</text>` },
      },
    })]);

    // bays, gate frames, hoods, doors
    GX.forEach((gx, i) => {
      const locked = !lines.includes(i), num = locked ? '' : lines.indexOf(i) + 1;
      add('lint' + i, [box(gx - GW, gx + GW, BY, D, GH, H, { fill: PAINT, weather: 1, faces: { pz: { dec: `<rect x="${gx - GW + 4}" y="${BY + 4}" width="${GW * 2 - 8}" height="${BD - 8}" fill="none" stroke="#46505c" stroke-width="1"/>` } } })]);
      const jambDec = ({ w, h }) => `<rect x="${w / 2 - .6}" y="4" width="1.2" height="${h - 8}" fill="${T}" opacity=".7"/>`;
      add('jambL' + i, [box(gx - GW - 5, gx - GW, D, D + 5, 0, GH, { fill: M.trim, weather: 0.5, faces: { py: { dec: jambDec } } })]);
      add('jambR' + i, [box(gx + GW, gx + GW + 5, D, D + 5, 0, GH, { fill: M.trim, weather: 0.5, faces: { py: { dec: jambDec } } })]);
      const trimDec = ({ w }) => `
        <rect x="${w / 2 - 6}" y=".5" width="12" height="7" rx="1" fill="#0f1317" stroke="#5a6470" stroke-width=".5"/>
        <text x="${w / 2}" y="6.6" font-family="Impact,'Arial Black',sans-serif" font-size="6.5" text-anchor="middle" fill="${locked ? '#6e7883' : TL}">${num}</text>
        <rect data-bar="${i}" x="11" y="3.2" width="${w / 2 - 20}" height="1.8" fill="${locked ? '#5d656e' : T}" ${glow}/>
        <rect data-bar="${i}" x="${w / 2 + 9}" y="3.2" width="${w / 2 - 20}" height="1.8" fill="${locked ? '#5d656e' : T}" ${glow}/>
        <circle data-lamp="${i}" cx="5" cy="4" r="2.3" fill="${locked ? '#59616a' : LAMP_IDLE}" stroke="${OUT}" stroke-width=".6" ${glow}/>
        <circle data-lamp="${i}" cx="${w - 5}" cy="4" r="2.3" fill="${locked ? '#59616a' : LAMP_IDLE}" stroke="${OUT}" stroke-width=".6" ${glow}/>`;
      add('trim' + i, [box(gx - GW - 5, gx + GW + 5, D, D + 5, GH, GH + 8, { fill: M.trim, weather: 0.5, faces: { py: { dec: trimDec } } })]);
      // separate angled hood over each gate
      add('hood' + i, [extrudeX(gx - GW - 8, gx + GW + 8, [[D, H], [D + 14, H - 4], [D + 14, H - 8], [D, H - 10]], {
        fill: M.plate, weather: 0.6, faces: { py: { dec: ({ w, h }) => { let s = `<rect x="0" y="${h / 2 - 1}" width="${w}" height="2" fill="${T}" ${glow}/>`; for (let x = 8; x < w; x += 16) s += `<circle cx="${x}" cy="${h / 2}" r="1.1" fill="#fff"/>`; return s; } } },
      })]);
      if (locked) add('lock' + i, [box(gx - GW, gx + GW, D - 4, D - 1, 0, GH, { fill: M.door, weather: 0.8, faces: { py: { dec: lockDec(GW) } } })]);
      else { add('doorL' + i, [], { door: i, side: 'L' }); add('doorR' + i, [], { door: i, side: 'R' }); add('tank' + i, [], { tank: i }); }
    });

    // raised armoured spine along the centre of the roof
    const spineSide = ({ w, h }) => { let s = ''; for (let x = 8; x < w - 8; x += 12) s += `<rect x="${x}" y="${h * 0.3}" width="7" height="${h * 0.4}" fill="#1d2228" stroke="#4d5763" stroke-width=".5"/>`; return s; };
    add('spine', [prism(rect(GX[0] + GW + 2, 6, GX[1] - GW - 2, D - 2), rect(GX[0] + GW + 10, 12, GX[1] - GW - 10, D - 8), H, H + SP, {
      fill: shade(PAINT, 0.92), weather: 1, faces: {
        px: { dec: spineSide }, nx: { dec: spineSide },
        py: { dec: ({ w, h }) => `<rect x="${w / 2 - 8}" y="${h * 0.35}" width="16" height="2.4" fill="${T}" ${glow}/>` },
        pz: { dec: LV >= 1   // light strip splits around the L1 star
          ? `<rect x="${(GX[0] + GX[1]) / 2 - 1.5}" y="60" width="3" height="28" fill="${T}" ${glow}/><rect x="${(GX[0] + GX[1]) / 2 - 1.5}" y="122" width="3" height="${D - 136}" fill="${T}" ${glow}/>`
          : `<rect x="${(GX[0] + GX[1]) / 2 - 1.5}" y="60" width="3" height="${D - 74}" fill="${T}" ${glow}/>` },
      },
    })]);
    // sensor dome + rotating head + antenna on the spine
    const sx = (GX[0] + GX[1]) / 2, sz = H + SP;
    add('dome', [cyl(sx, 34, 14, sz, sz + 6, { fill: shade(PAINT, 0.85), top: shade(PAINT, 1.05), bands: [[sz + 3, T, 1.4, 1]] }),
      cyl(sx, 34, 10, sz + 6, sz + 11, { fill: '#5b6673', top: '#6d7987' }),
      cyl(sx, 34, 6, sz + 11, sz + 14, {
        fill: '#7d8997', top: '#8c98a6',
        dec: `<g data-radar="1"><path d="M-12,-3 Q0,-7 12,-3 L12,3 Q0,-1 -12,3 Z" fill="#c9d2dc" stroke="${OUT}" stroke-width=".6"/><rect x="8" y="-2.5" width="5" height="5" fill="${T}"/></g><circle r="2" fill="${TL}"/>`,
      })]);
    add('antenna', [cyl(sx, 66, 1.2, sz, sz + 34, { fill: '#8a96a3', dec: `<circle data-beacon="1" r="2.4" fill="#ff4040" ${glow}/>` })]);

    // exhaust stacks (back corners)
    STACKS.forEach(([x, y, z], k) => add('stack' + k, [cyl(x, y, 6, H, z, { fill: '#46505b', top: '#2b3138', bands: [[z - 4, T, 1.5, 1]], dec: '<circle r="4.6" fill="#0c0f12"/>' })]));

    // 4 turbine fans: one over each bay + two rear (L2: left rear large · L3: both rear large)
    const RL = 24;
    const fans = [[GX[0], BY + 41, 17], [GX[1], BY + 41, 17], [GX[0], 40, LV >= 2 ? RL : 17], [GX[1], 40, LV >= 3 ? RL : 17]];
    fans.forEach(([x, y, R], k) => {
      const big = R > 20, n = big ? 9 : 7, sc = R / 17;
      const broken = st.dmg === 2 && (k === 1 || k === 2);
      const blades = Array.from({ length: n }, (_, j) => (broken && j % 2) ? '' : `<path transform="rotate(${j * 360 / n})" d="M2.3,-1.5 L12.2,-3.8 L12.8,1.1 L2.3,1.6 Z" fill="#c3ccd6" stroke="#59636e" stroke-width=".4"/>`).join('');
      const attrs = broken ? 'data-broken="1" transform="rotate(17)"' : `data-fan="${k}" ${big ? 'data-large="1"' : ''} ${k < 2 ? `data-gate="${k}"` : ''}`;
      add('fan' + k, [cyl(x, y, R, H, H + (big ? 8 : 6), {
        fill: '#3d4550', top: '#4a535e', bands: [[H + 3, '#22282f', 1]].concat(big ? [[H + 5.5, '#22282f', 1]] : []),
        dec: `<g transform="scale(${sc.toFixed(3)})"><circle r="15.2" fill="#0e1318" stroke="${T}" stroke-width="${big ? 1.3 : 1.7}" ${glow}/><circle r="13" fill="#18202a"/>
              ${big ? '<circle r="14.1" fill="none" stroke="#56616d" stroke-width=".5"/>' : ''}
              <g ${attrs}>${blades}</g>${broken ? '<path d="M-11,-5 L-3,1 L-5,8" fill="none" stroke="#0a0a0a" stroke-width="1.2"/>' : ''}
              <circle r="3.8" fill="#2b333d" stroke="${TL}" stroke-width="1"/><circle r="1.4" fill="${TL}"/>
              <path d="M-15,0 H15 M0,-15 V15" stroke="#56616d" stroke-width="${big ? .6 : .8}" opacity=".7"/></g>`,
      })], (k === 2 && LV >= 2) ? { kit: 2 } : (k === 3 && LV >= 3) ? { kit: 3 } : undefined);
    });

    // L1+: single white star in the middle of the roof spine
    if (LV >= 1) {
      const cx = (GX[0] + GX[1]) / 2, cy = 105;
      const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5 : 12; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
      add('star0', [prism(pts, pts, H + SP, H + SP + 0.6, { fill: shade(PAINT, 0.6), faces: { pz: { fill: '#e9eef3', flat: true } } })], { kit: 1 });
    }
    return parts;
  }

  function doorPrims(i, side, open, T) {
    const gx = GX[i], w = GW * (1 - open);
    if (w < 0.6) return [];
    const x0 = side === 'L' ? gx - GW : gx + GW - w, x1 = side === 'L' ? gx - GW + w : gx + GW;
    return [box(x0, x1, D - 4, D - 1, 0, GH, { fill: M.door, faces: { py: { dec: doorDec(side, T, open, GW) } } })];
  }

  // medium tank: lighter hull, octagonal turret, long gun
  function tankPrims(T, PAINT) {
    const TL = mix(T, '#ffffff', 0.45);
    PAINT = PAINT || paintOf(T);
    const wheels = ({ w }) => [6, 16, 26, 36, 46].map(u => `<circle cx="${u * w / 52}" cy="4.5" r="3.3" fill="#3c434b" stroke="${OUT}" stroke-width=".5"/><circle cx="${u * w / 52}" cy="4.5" r="1.1" fill="#8a949f"/>`).join('');
    const band = ({ w, h }) => `<rect x="0" y="${h * 0.4}" width="${w}" height="${h * 0.24}" fill="${T}"/>`;
    return [
      box(-16, -10, -26, 26, 0, 9, { fill: '#2b3036', faces: { px: { dec: wheels }, nx: { dec: wheels } } }),
      prism(rect(-12, -25, 12, 25), rect(-10, -23, 10, 14), 3, 13, {
        fill: PAINT, weather: 0.6, faces: {
          pz: { dec: `<rect x="-7" y="-21" width="14" height="6" fill="#353c44" stroke="${OUT}" stroke-width=".4"/><rect x="-10" y="8" width="20" height="2" fill="${T}"/>` },
          py: { dec: ({ w }) => `<circle cx="4" cy="3" r="1.4" fill="#fff6c8"/><circle cx="${w - 4}" cy="3" r="1.4" fill="#fff6c8"/>` },
        },
      }),
      box(10, 16, -26, 26, 0, 9, { fill: '#2b3036', faces: { px: { dec: wheels }, nx: { dec: wheels } } }),
      prism(oct(-9, -12, 9, 6, 4), oct(-7, -10, 7, 4, 3), 13, 21, {
        fill: mix(PAINT, '#ffffff', 0.08), weather: 0.6, faces: { px: { dec: band }, nx: { dec: band }, py: { dec: band }, ny: { dec: band }, pz: { dec: `<path d="M-4,-1 L0,-5 L4,-1" fill="none" stroke="${TL}" stroke-width="1.4"/>` } },
      }),
      box(-1.2, 1.2, 4, 44, 16, 18.4, { fill: '#4b535d' }),
      box(-2, 2, 41, 46, 15.4, 19, { fill: '#3e454e' }),
    ];
  }
  const TANK_BOX = [-16, 16, -26, 46, 0, 22];
  const DAMAGE_PTS = [[110, 118, H + SP], [196, 62, H], [26, 118, H], [110, 34, H + SP + 14]];

  const SPEC = { prefix: 'mf', W, D, H, BY, GX, GW, GH, PAD, CX, CY, TANK_START, TANK_END, TANK_BOX, STACKS, DAMAGE_PTS,
    TOP_PTS: [[110, 66, H + SP + 34]], buildModel, doorPrims, tankPrims };
  const api = { create: (el, opts) => VE.create(el, SPEC, opts), spec: SPEC, project: proj, dims: { W, D, H, GW, GH, GX } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.MediumFactory = api;
})(typeof window !== 'undefined' ? window : globalThis);

/*!
 * LightFactory — 2.5D isometric vector (SVG) Light Tank Factory
 * --------------------------------------------------------------
 * Same art style and API as Heavy/Medium, built on the shared VectorEngine.
 * - 1 gate (single production line).
 * - Look: compact garage with a faceted hangar roof (mansard/arch profile) with
 *   glowing skylight strips, 2 turbine fans on the roof ridge, a small control
 *   booth on the left side with a rotating radar, twin antenna masts, one exhaust
 *   stack, gate hood, and a light octagon platform.
 * - Produces a fast light tank (wedge turret, short gun, side missile pod).
 * - Team paint, weathering, 4 facings, not-captured (grey, powered down),
 *   damaged (≤50%) and critical (<20%) states.
 *
 * Usage (requires vector-engine.js loaded first):
 *   const f = LightFactory.create(el, { facing: 0, team: '#3b82f6', scale: 0.2, onTankOut: () => spawnUnit() });
 *   f.produce(0); f.setFacing(1); f.setHealth(0.15); f.setCaptured(false);
 */
(function (global) {
  'use strict';
  const VE = global.VectorEngine || (typeof require !== 'undefined' ? require('./vector-engine.js') : null);
  const { proj, prism, box, rect, extrudeX, cyl, finalize, shade, mix, paintOf, oct, emblem, glow, doorDec, lockDec, OUT } = VE;

  // -------------------------------------------------------------- model
  const W = 150, D = 130, H0 = 56, BD = 70, BY = D - BD;   // H0: wall height, roof sits on top
  const RH = 24, H = H0 + RH;                               // roof ridge height
  const GW = 26, GH = 46, GX = [W / 2];
  const PAD = { x0: -48, y0: -30, x1: W + 30, y1: D + 96 };
  const CX = (PAD.x0 + PAD.x1) / 2, CY = (PAD.y0 + PAD.y1) / 2;
  const TANK_START = BY + 24, TANK_END = D + 78;
  const STACKS = [[112, 116, H + 18]];
  const M = { plate: '#6b7785', interior: '#161a20', pad: '#3a414a', padSide: '#272c33', trim: '#808c9a', door: '#717d8b' };
  const ID = 'LF-1';
  const BOOTH = { x0: -28, x1: 0, y0: 66, y1: 106, z: 34 };

  // extrude a convex x–z profile along y (used for the faceted hangar roof)
  function extrudeY(y0, y1, xz, opt) {
    const raw = [xz.map(p => [p[0], y1, p[1]]), xz.map(p => [p[0], y0, p[1]]).reverse()];
    for (let i = 0; i < xz.length; i++) { const j = (i + 1) % xz.length; raw.push([[xz[i][0], y0, xz[i][1]], [xz[j][0], y0, xz[j][1]], [xz[j][0], y1, xz[j][1]], [xz[i][0], y1, xz[i][1]]]); }
    return finalize(raw, opt);
  }

  function padDecal(lines, T, TL) {
    const p = PAD; let s = '';
    for (let x = p.x0 + 18; x < p.x1 - 8; x += 32) s += `<line x1="${x}" y1="${p.y0 + 8}" x2="${x}" y2="${p.y1 - 8}" stroke="#2c3239" stroke-width=".9"/>`;
    for (let y = p.y0 + 20; y < p.y1 - 8; y += 32) s += `<line x1="${p.x0 + 8}" y1="${y}" x2="${p.x1 - 8}" y2="${y}" stroke="#2c3239" stroke-width=".9"/>`;
    const e = oct(p.x0 + 11, p.y0 + 11, p.x1 - 11, p.y1 - 11, 18).map(q => q.join(',')).join(' ');
    s += `<polygon points="${e}" fill="none" stroke="#5a636d" stroke-width="1.1" opacity=".8"/>`;   // plain steel edge line (no team colour)
    s += `<polygon points="${e}" fill="none" stroke="#1f242a" stroke-width=".6" transform="translate(.6,.6)" opacity=".7"/>`;
    GX.forEach((gx, i) => {
      s += `<rect x="${gx - GW}" y="${BY}" width="${GW * 2}" height="${BD}" fill="#14181d"/>`;
      if (lines.includes(i)) {
        s += `<ellipse data-glow="${i}" cx="${gx}" cy="${BY + 38}" rx="22" ry="30" fill="url(#BAYGLOW)" opacity=".2"/>`;
        [-7, 7].forEach(dx => s += `<line x1="${gx + dx}" y1="${BY + 4}" x2="${gx + dx}" y2="${D}" stroke="#3b434c" stroke-width="2"/>`);
        s += `<line x1="${gx - GW - 2}" y1="${D + 8}" x2="${gx - GW - 2}" y2="${D + 78}" stroke="${T}" stroke-width="1.7" ${glow}/>`;
        s += `<line x1="${gx + GW + 2}" y1="${D + 8}" x2="${gx + GW + 2}" y2="${D + 78}" stroke="${T}" stroke-width="1.7" ${glow}/>`;
        s += `<path d="M${gx - 15},${D + 30} L${gx},${D + 41} L${gx + 15},${D + 30}" fill="none" stroke="#c3c9cf" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`;   // single exit arrow
        s += `<rect x="${gx - GW}" y="${D}" width="${GW * 2}" height="2" fill="${T}" opacity=".7"/>`;
      }
    });
    // booth footing
    s += `<rect x="${BOOTH.x0 - 5}" y="${BOOTH.y0 - 5}" width="${BOOTH.x1 - BOOTH.x0 + 5}" height="${BOOTH.y1 - BOOTH.y0 + 10}" fill="none" stroke="#5a6470" stroke-width="1.1" stroke-dasharray="4 3"/>`;
    return s;
  }

  function buildModel(lines, T, PAINT, st) {   // lines = sorted list of active gate indices
    st = st || {};
    const neutral = T === null;
    if (neutral) T = '#9aa4ae';
    const TL = mix(T, '#ffffff', 0.5);
    PAINT = PAINT || paintOf(neutral ? null : T);
    const LAMP_IDLE = neutral ? '#59616a' : '#3dff5a';
    const LV = st.level || 0;
    const parts = [];
    const add = (id, prims, extra) => parts.push(Object.assign({ id, prims }, extra || {}));
    const INT = { fill: M.interior, flat: true };
    const DARK = '#262c33';

    add('pad', [prism(oct(PAD.x0, PAD.y0, PAD.x1, PAD.y1, 22), oct(PAD.x0 + 6, PAD.y0 + 6, PAD.x1 - 6, PAD.y1 - 6, 20), -10, 0,
      { fill: M.padSide, weather: 0.6, faces: { pz: { fill: M.pad, weather: 0.5, dec: padDecal(lines, T, TL) } } })]);

    // walls -------------------------------------------------------------
    const sideDec = ({ w, h }) => `
      <rect x="6" y="8" width="${w - 12}" height="${h - 16}" fill="none" stroke="#3d4651" stroke-width="1"/>
      ${[0, 1, 2].map(k => `<rect x="${12 + k * (w - 24) / 3}" y="16" width="${(w - 24) / 3 - 6}" height="10" fill="#1d2228" stroke="#4d5763" stroke-width=".6"/>`).join('')}
      <rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`;
    const backDec = ({ w, h }) => `<rect x="0" y="12" width="${w}" height="2.6" fill="${T}" ${glow}/>
      <g transform="translate(${w / 2},${h * 0.55})">${emblem(T, TL, 0.9)}</g>
      <rect x="${w - 26}" y="${h - 34}" width="14" height="29" fill="#2a3038" stroke="#8b97a5" stroke-width=".8"/>
      <rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`;
    const bayWallDec = () => {
      let s = '';
      GX.forEach((gx, i) => {
        if (!lines.includes(i)) return;
        const u = gx - GW;
        s += `<rect x="${u + 5}" y="${H0 - GH + 5}" width="${GW * 2 - 10}" height="16" fill="#20262d" stroke="#3b444e" stroke-width="1"/>`;
        s += `<rect data-strip="${i}" x="${u + 4}" y="${H0 - GH + 25}" width="${GW * 2 - 8}" height="3.5" fill="#ffcf70" opacity=".35" ${glow}/>`;
      });
      return s;
    };
    add('back', [box(0, W, 0, BY, 0, H0, { fill: PAINT, weather: 1, faces: { nx: { dec: sideDec }, px: { dec: sideDec }, ny: { dec: backDec }, py: { fill: '#1b2027', flat: true, dec: bayWallDec } } })]);
    const frontL = ({ w, h }) => `<rect x="3" y="4" width="${w - 6}" height="${h - 9}" fill="none" stroke="#3d4651" stroke-width=".8"/>
      <g transform="translate(${w / 2},${h * 0.4})">${emblem(T, TL, 0.85)}</g>
      <text x="${w / 2}" y="${h * 0.74}" font-family="Impact,'Arial Black',sans-serif" font-size="8" text-anchor="middle" fill="${TL}" opacity=".9" letter-spacing="1.5">${ID}</text>
      <rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`;
    const frontR = ({ w, h }) => { let s = `<rect x="3" y="4" width="${w - 6}" height="${h - 9}" fill="none" stroke="#3d4651" stroke-width=".8"/>`;
      for (let y = 12; y < 34; y += 5) s += `<rect x="8" y="${y}" width="${w - 16}" height="2.6" fill="#252b32"/>`;
      s += `<rect x="8" y="${h - 14}" width="${w - 16}" height="2.2" fill="${T}" ${glow}/><rect x="0" y="${h - 5}" width="${w}" height="5" fill="${DARK}" opacity=".85"/>`; return s; };
    add('pilL', [box(0, GX[0] - GW, BY, D, 0, H0, { fill: PAINT, weather: 1, faces: { px: INT, nx: { dec: sideDec }, py: { dec: frontL } } })]);
    add('pilR', [box(GX[0] + GW, W, BY, D, 0, H0, { fill: PAINT, weather: 1, faces: { nx: INT, px: { dec: sideDec }, py: { dec: frontR } } })]);

    // gate ---------------------------------------------------------------
    GX.forEach((gx, i) => {
      const locked = !lines.includes(i), num = locked ? '' : lines.indexOf(i) + 1;
      add('lint' + i, [box(gx - GW, gx + GW, BY, D, GH, H0, { fill: PAINT, weather: 1 })]);
      const jambDec = ({ w, h }) => `<rect x="${w / 2 - .6}" y="4" width="1.2" height="${h - 8}" fill="${T}" opacity=".7"/>`;
      add('jambL' + i, [box(gx - GW - 5, gx - GW, D, D + 5, 0, GH, { fill: M.trim, weather: 0.5, faces: { py: { dec: jambDec } } })]);
      add('jambR' + i, [box(gx + GW, gx + GW + 5, D, D + 5, 0, GH, { fill: M.trim, weather: 0.5, faces: { py: { dec: jambDec } } })]);
      const trimDec = ({ w }) => `
        <rect x="${w / 2 - 5}" y=".4" width="10" height="5.4" rx="1" fill="#0f1317" stroke="#5a6470" stroke-width=".5"/>
        <text x="${w / 2}" y="5" font-family="Impact,'Arial Black',sans-serif" font-size="5" text-anchor="middle" fill="${locked ? '#6e7883' : TL}">${num}</text>
        <rect data-bar="${i}" x="9" y="2.4" width="${w / 2 - 16}" height="1.5" fill="${locked ? '#5d656e' : T}" ${glow}/>
        <rect data-bar="${i}" x="${w / 2 + 7}" y="2.4" width="${w / 2 - 16}" height="1.5" fill="${locked ? '#5d656e' : T}" ${glow}/>
        <circle data-lamp="${i}" cx="4.4" cy="3.1" r="2" fill="${locked ? '#59616a' : LAMP_IDLE}" stroke="${OUT}" stroke-width=".5" ${glow}/>
        <circle data-lamp="${i}" cx="${w - 4.4}" cy="3.1" r="2" fill="${locked ? '#59616a' : LAMP_IDLE}" stroke="${OUT}" stroke-width=".5" ${glow}/>`;
      add('trim' + i, [box(gx - GW - 5, gx + GW + 5, D, D + 5, GH, GH + 6, { fill: M.trim, weather: 0.5, faces: { py: { dec: trimDec } } })]);
      add('hood' + i, [extrudeX(gx - GW - 10, gx + GW + 10, [[D, H0 + 4], [D + 13, H0], [D + 13, H0 - 1], [D, H0 - 2]], {
        fill: M.plate, weather: 0.6, faces: { py: { dec: ({ w, h }) => `<rect x="0" y="${Math.max(0, h / 2 - 0.5)}" width="${w}" height="1" fill="${T}" ${glow}/>` } },
      })]);
      if (locked) add('lock' + i, [box(gx - GW, gx + GW, D - 4, D - 1, 0, GH, { fill: M.door, weather: 0.8, faces: { py: { dec: lockDec(GW) } } })]);
      else { add('doorL' + i, [], { door: i, side: 'L' }); add('doorR' + i, [], { door: i, side: 'R' }); add('tank' + i, [], { tank: i }); }
    });

    // faceted hangar roof (new silhouette) ------------------------------------
    const skylight = ({ w, h }) => { let s = `<rect x="4" y="${h * 0.38}" width="${w - 8}" height="${h * 0.26}" fill="#12161b"/>`;
      for (let x = 7; x < w - 9; x += 10) s += `<rect x="${x}" y="${h * 0.42}" width="7" height="${h * 0.18}" fill="${TL}" opacity=".75" ${glow}/>`; return s; };
    const gable = ({ w, h }) => `<rect x="${w / 2 - 22}" y="${h * 0.45}" width="44" height="2" fill="${T}" ${glow}/>`;
    add('roof', [extrudeY(0, D, [[-3, H0], [W + 3, H0], [W - 10, H0 + 14], [W - 28, H], [28, H], [10, H0 + 14]], {
      fill: shade(PAINT, 0.95), weather: 1, faces: {
        px: { dec: skylight }, nx: { dec: skylight }, py: { dec: LV >= 1 ? '' : gable }, ny: { dec: gable },
        pz: { dec: `<rect x="28" y="4" width="${W - 56}" height="${D - 8}" fill="none" stroke="#46505c" stroke-width="1"/><rect x="${W / 2 - 1.5}" y="54" width="3" height="22" fill="${T}" ${glow}/>` },
      },
    })]);

    // side control booth with radar --------------------------------------------
    const B = BOOTH;
    const boothWin = ({ w, h }) => { let s = `<rect x="3" y="5" width="${w - 6}" height="9" fill="#12161b"/>`; for (let x = 5; x < w - 7; x += 8) s += `<rect x="${x}" y="6.5" width="5.5" height="6" fill="${TL}" opacity=".85" ${glow}/>`;
      return s + `<rect x="0" y="${h - 4}" width="${w}" height="4" fill="${DARK}" opacity=".85"/>`; };
    add('booth', [prism(rect(B.x0, B.y0, B.x1, B.y1), rect(B.x0 + 3, B.y0 + 3, B.x1, B.y1 - 3), 0, B.z, {
      fill: shade(PAINT, 0.9), weather: 1, faces: { nx: { dec: boothWin }, py: { dec: boothWin }, ny: { dec: boothWin } },
    })]);
    const rx = (B.x0 + B.x1) / 2 + 1, ry = (B.y0 + B.y1) / 2;
    add('radar', [cyl(rx, ry, 2, B.z, B.z + 9, { fill: M.plate }), cyl(rx, ry, 5, B.z + 9, B.z + 11.5, {
      fill: '#7d8997', top: '#8c98a6',
      dec: `<g data-radar="1"><rect x="-11" y="-1.8" width="22" height="3.6" rx="1" fill="#c9d2dc" stroke="${OUT}" stroke-width=".5"/><rect x="7" y="-2.6" width="4.5" height="5.2" fill="${T}"/></g><circle r="1.8" fill="${TL}"/>`,
    })]);

    // antennas, stack, fans on the ridge ----------------------------------------
    add('antenna', [cyl(40, 14, 1.1, H, H + 30, { fill: '#8a96a3', dec: `<circle data-beacon="1" r="2.2" fill="#ff4040" ${glow}/>` })]);
    add('antenna2', [cyl(110, 14, 1, H, H + 20, { fill: '#8a96a3', dec: `<circle r="1.6" fill="${TL}"/>` })]);
    STACKS.forEach(([x, y, z], k) => add('stack' + k, [cyl(x, y, 5, H, z, { fill: '#46505b', top: '#2b3138', bands: [[z - 3, T, 1.4, 1]], dec: '<circle r="3.8" fill="#0c0f12"/>' })]));
    // ridge fans: L0–1 two small · L2 two larger · L3 one very large
    const fans = LV >= 3 ? [[W / 2, 65, 30]] : LV >= 2 ? [[W / 2, 36, 20], [W / 2, 94, 20]] : [[W / 2, 40, 14.5], [W / 2, 88, 14.5]];
    fans.forEach(([x, y, R], k) => {
      const big = R > 16, n = R > 25 ? 11 : big ? 9 : 7, sc = R / 14.5;
      const broken = st.dmg === 2 && k === fans.length - 1;
      const blades = Array.from({ length: n }, (_, j) => (broken && j % 2) ? '' : `<path transform="rotate(${j * 360 / n})" d="M2,-1.3 L10.4,-3.3 L10.9,1 L2,1.4 Z" fill="#c3ccd6" stroke="#59636e" stroke-width=".35"/>`).join('');
      const attrs = broken ? 'data-broken="1" transform="rotate(17)"' : `data-fan="${k}" ${big ? 'data-large="1"' : ''}`;
      add('fan' + k, [cyl(x, y, R, H, H + (big ? 7 : 5), {
        fill: '#3d4550', top: '#4a535e', bands: [[H + 2.5, '#22282f', 1]].concat(big ? [[H + 4.8, '#22282f', 1]] : []),
        dec: `<g transform="scale(${sc.toFixed(3)})"><circle r="13" fill="#0e1318" stroke="${T}" stroke-width="${big ? 1.1 : 1.5}" ${glow}/><circle r="11.1" fill="#18202a"/>
              ${big ? '<circle r="12" fill="none" stroke="#56616d" stroke-width=".4"/>' : ''}
              <g ${attrs}>${blades}</g>${broken ? '<path d="M-9,-4 L-2,1 L-4,7" fill="none" stroke="#0a0a0a" stroke-width="1.1"/>' : ''}
              <circle r="3.2" fill="#2b333d" stroke="${TL}" stroke-width=".9"/><circle r="1.2" fill="${TL}"/>
              <path d="M-13,0 H13 M0,-13 V13" stroke="#56616d" stroke-width="${big ? .5 : .7}" opacity=".7"/></g>`,
      })], LV >= 2 ? { kit: LV } : undefined);
    });

    // L1+: one white star on the front gable, above the gate
    if (LV >= 1) {
      const cx = W / 2, cz = 69;
      const xz = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.8 : 9; return [cx + Math.cos(a) * r, cz - Math.sin(a) * r]; });
      add('star0', [extrudeY(D, D + 0.6, xz, { fill: shade(PAINT, 0.6), faces: { py: { fill: '#e9eef3', flat: true } } })], { kit: 1 });
    }
    return parts;
  }

  function doorPrims(i, side, open, T) {
    const gx = GX[i], w = GW * (1 - open);
    if (w < 0.6) return [];
    const x0 = side === 'L' ? gx - GW : gx + GW - w, x1 = side === 'L' ? gx - GW + w : gx + GW;
    return [box(x0, x1, D - 4, D - 1, 0, GH, { fill: M.door, faces: { py: { dec: doorDec(side, T, open, GW) } } })];
  }

  // light tank: small wedge turret, short gun, side missile pod
  function tankPrims(T, PAINT) {
    const TL = mix(T, '#ffffff', 0.45);
    PAINT = PAINT || paintOf(T);
    const wheels = ({ w }) => [6, 16, 26, 36].map(u => `<circle cx="${u * w / 42}" cy="3.6" r="2.8" fill="#3c434b" stroke="${OUT}" stroke-width=".45"/><circle cx="${u * w / 42}" cy="3.6" r="1" fill="#8a949f"/>`).join('');
    const band = ({ w, h }) => `<rect x="0" y="${h * 0.38}" width="${w}" height="${h * 0.26}" fill="${T}"/>`;
    return [
      box(-13, -8, -21, 21, 0, 7, { fill: '#2b3036', faces: { px: { dec: wheels }, nx: { dec: wheels } } }),
      prism(rect(-10, -20, 10, 20), rect(-8, -18, 8, 10), 2, 10, {
        fill: PAINT, weather: 0.6, faces: {
          pz: { dec: `<rect x="-6" y="-16" width="12" height="5" fill="#353c44" stroke="${OUT}" stroke-width=".4"/><rect x="-8" y="6" width="16" height="1.8" fill="${T}"/>` },
          py: { dec: ({ w }) => `<circle cx="3.5" cy="2.5" r="1.2" fill="#fff6c8"/><circle cx="${w - 3.5}" cy="2.5" r="1.2" fill="#fff6c8"/>` },
        },
      }),
      box(8, 13, -21, 21, 0, 7, { fill: '#2b3036', faces: { px: { dec: wheels }, nx: { dec: wheels } } }),
      prism(rect(-6, -9, 6, 5), rect(-4, -7, 4, 1), 10, 16, {
        fill: mix(PAINT, '#ffffff', 0.08), weather: 0.6, faces: { px: { dec: band }, nx: { dec: band }, py: { dec: band }, ny: { dec: band } },
      }),
      box(6, 9, -7, 1, 12, 15.5, { fill: '#3a4048', faces: { py: { dec: ({ w, h }) => `<circle cx="${w / 2}" cy="${h / 2}" r="1" fill="${TL}"/>` }, pz: { dec: `<rect x="6.3" y="-6.5" width="2.4" height="7" fill="${T}"/>` } } }),
      box(-1, 1, 3, 30, 12.4, 14.2, { fill: '#4b535d' }),
      box(-1.6, 1.6, 28, 32, 12, 14.6, { fill: '#3e454e' }),
    ];
  }
  const TANK_BOX = [-13, 13, -21, 32, 0, 17];
  const DAMAGE_PTS = [[W / 2, 64, H], [42, 110, H], [-14, 86, BOOTH.z], [112, 24, H]];

  const SPEC = { prefix: 'lf', W, D, H: H0, BY, GX, GW, GH, PAD, CX, CY, TANK_START, TANK_END, TANK_BOX, STACKS, DAMAGE_PTS,
    TOP_PTS: [[40, 14, H + 30]], buildModel, doorPrims, tankPrims };
  const api = { create: (el, opts) => VE.create(el, SPEC, Object.assign({}, opts, { lines: 1 })), spec: SPEC, project: proj, dims: { W, D, H, GW, GH, GX } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LightFactory = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* ------------------------------------------------------------------ TankFactories front door */
(function (global) {
  'use strict';
  // footprint of each model on the ground (model units, x0 x1 y0 y1), including side parts outside W × D
  const FOOT = { light: [-28, 150, 0, 130], medium: [-6, 226, -27, 160], heavy: [0, 300, 0, 180] };
  const K = { light: global.LightFactory, medium: global.MediumFactory, heavy: global.HeavyFactory };
  const api = {
    kinds: ['light', 'medium', 'heavy'],
    create(kind, el, opts) { const k = K[kind]; if (!k) throw new Error('TankFactories: unknown kind ' + kind); return k.create(el, opts); },
    dims(kind) { const k = K[kind], s = k.spec; return Object.assign({}, k.dims, { TANK_START: s.TANK_START, TANK_END: s.TANK_END, FOOT: FOOT[kind], ORDER: s.ORDER || k.dims.GX.map((_, i) => i) }); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TankFactories = api;
})(typeof window !== 'undefined' ? window : globalThis);
