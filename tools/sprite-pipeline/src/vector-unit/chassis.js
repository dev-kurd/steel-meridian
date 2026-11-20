/*!
 * Shared tank chassis (Light / Medium / Heavy) for VectorUnit.
 * Every weapon module (Panzer, Anti-Air, Artillery, Flamer, Special) sits on the same turret pivot.
 * Local axes: x forward, y to the right side, z up. Relative sizes from tank-types.md (1.0 = 64 units).
 */
(function (VU) {
  'use strict';
  const { V, PAL, mix, part, tubeX, box, extrudeY, cylZ, cylY, lit, VIEW, OUT, fmt } = VU;
  const U = 64;
  const DIMS = {
    light:  { L: 1.0 * U, W: 0.7 * U,  H: 0.35 * U, wheels: 4, pods: 0, speed: 1.0 },
    medium: { L: 1.3 * U, W: 0.9 * U,  H: 0.45 * U, wheels: 5, pods: 1, speed: 0.75 },
    heavy:  { L: 1.6 * U, W: 1.15 * U, H: 0.55 * U, wheels: 6, pods: 2, speed: 0.5 },
  };
  const OLIVE = '#596142';

  // ---------- shared decals (also used by weapon modules) ----------
  const D = VU.decals = {};
  D.boltRow = (match, t, n, s0 = 0.06, s1 = 0.94, r = 0.012) => ({ match, draw(api) { for (let i = 0; i < n; i++) api.bolt(s0 + (s1 - s0) * i / (n - 1), t, r); } });
  D.seams = (match, cuts, dir = 's') => ({ match, draw(api) { for (const c of cuts) { if (dir === 's') { api.line(c, 0.04, c, 0.96, '#0b0e13', 0.4 * api.S, 'opacity="0.6"'); api.line(c + 0.006, 0.04, c + 0.006, 0.96, '#fff', 0.25 * api.S, 'opacity="0.2"'); } else { api.line(0.03, c, 0.97, c, '#0b0e13', 0.4 * api.S, 'opacity="0.6"'); api.line(0.03, c + 0.01, 0.97, c + 0.01, '#fff', 0.25 * api.S, 'opacity="0.2"'); } } } });
  D.strip = (match, t0 = 0.42, t1 = 0.52, s0 = 0.12, s1 = 0.88) => ({
    match, draw(api) {
      api.poly([[s0, t0 - 0.07], [s1, t0 - 0.07], [s1, t1 + 0.07], [s0, t1 + 0.07]], '#161b21');
      api.poly([[s0 + 0.008, t0 - 0.05], [s1 - 0.008, t0 - 0.05], [s1 - 0.008, t0 - 0.035], [s0 + 0.008, t0 - 0.035]], '#fff', 'opacity="0.18"');
      api.poly([[s0 + 0.012, t0], [s1 - 0.012, t0], [s1 - 0.012, t1], [s0 + 0.012, t1]], api.glow());
      if (!api.wreck) api.poly([[s0 + 0.03, t0 + (t1 - t0) * 0.3], [s1 - 0.03, t0 + (t1 - t0) * 0.3], [s1 - 0.03, t0 + (t1 - t0) * 0.55], [s0 + 0.03, t0 + (t1 - t0) * 0.55]], '#fff', 'opacity="0.75"');
    },
  });
  D.grille = (match, n = 7) => ({
    match, draw(api) {
      api.poly([[0.07, 0.08], [0.93, 0.08], [0.93, 0.92], [0.07, 0.92]], '#12161b');
      for (let i = 0; i < n; i++) { const s = 0.12 + i * (0.76 / (n - 1)); api.poly([[s - 0.025, 0.13], [s + 0.025, 0.13], [s + 0.025, 0.87], [s - 0.025, 0.87]], api.light('#5f6a76', 'metal')); api.line(s - 0.02, 0.15, s - 0.02, 0.85, '#fff', 0.25 * api.S, 'opacity="0.35"'); }
      for (const [s, t] of [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]]) api.bolt(s, t, 0.018);
    },
  });
  D.latch = match => ({ match, draw(api) { api.poly([[0.42, 0.25], [0.58, 0.25], [0.58, 0.5], [0.42, 0.5]], api.light('#8a96a3', 'metal'), `stroke="#0b0e13" stroke-width="${0.25 * api.S}"`); api.bolt(0.15, 0.2, 0.03); api.bolt(0.85, 0.2, 0.03); } });
  D.bore = (match, r = 0.36) => ({ match, draw(api) { api.ellipse(0.5, 0.5, r, r, '#07080a'); } });

  // Track side: a belt loop running round the face outline, the dark void inside it, and the running gear
  // (toothed sprocket at the front, idler at the rear, road wheels on the lower belt, return rollers under the top belt).
  // Animated by api.frame (0..2): links run round the loop and the wheels turn.
  // inner edge of the track belt loop (normalized face coords), belt thickness bw world units
  function trackInset(F, wU, wV, bw = 1.9) {
    const n = F.length, cs = F.reduce((a, p) => a + p[0], 0) / n, ct = F.reduce((a, p) => a + p[1], 0) / n;
    const W = F.map(p => [p[0] * wU, p[1] * wV]);
    return W.map((p, k) => {
      const a = W[(k - 1 + n) % n], b = W[(k + 1) % n];
      const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
      let n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
      const toC = [cs * wU - p[0], ct * wV - p[1]];
      if (n1[0] * toC[0] + n1[1] * toC[1] < 0) n1 = [-n1[0], -n1[1]];
      if (n2[0] * toC[0] + n2[1] * toC[1] < 0) n2 = [-n2[0], -n2[1]];
      const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(m[0], m[1]) || 1, cosh = (m[0] * n1[0] + m[1] * n1[1]) / ml;
      const d = bw / Math.max(0.35, cosh);
      return [(p[0] + m[0] / ml * d) / wU, (p[1] + m[1] / ml * d) / wV];
    });
  }
  const TRACK_HOLE = { match: n => Math.abs(n[1]) > 0.9, pts: (F, wU, wV) => trackInset(F, wU, wV) };

  function trackSide(nW) {
    return {
      match: n => Math.abs(n[1]) > 0.9,
      draw(api) {
        const F = api.facePts, n = F.length;
        const inset = trackInset(F, api.wU, api.wV);
        const top = Math.min(...inset.map(p => p[1])), bot = Math.max(...inset.map(p => p[1]));
        const su = w => w / api.wU, tv = w => w / api.wV;
        // the loop itself is an opening (see-through); only a soft shadow under the top run
        api.poly(inset.map(p => [p[0], Math.min(p[1], top + (bot - top) * 0.22)]), '#000', 'opacity="0.35"');
        // links: cross bars between the outer and inner loop, moving with the frame
        const ph = api.frame / 3;
        for (let k = 0; k < n; k++) {
          const a = F[k], b = F[(k + 1) % n], c = inset[k], d = inset[(k + 1) % n];
          const len = Math.hypot((b[0] - a[0]) * api.wU, (b[1] - a[1]) * api.wV), cnt = Math.max(1, Math.round(len / 1.5));
          for (let j = 0; j < cnt; j++) {
            const t = (j + ph) / cnt; if (t > 1) continue;
            const o = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], q = [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t];
            api.line(o[0], o[1], q[0], q[1], '#5a646f', 0.42 * api.S, 'opacity="0.85"');
          }
        }
        api.poly(F, 'none', `stroke="#0b0e13" stroke-width="${0.3 * api.S}"`);
        api.poly(inset, 'none', `stroke="#0b0e13" stroke-width="${0.3 * api.S}"`);
        // running gear
        const sgn = api.n[1] > 0 ? 1 : -1, spin = api.frame * (Math.PI * 2 / 6 / 3) * sgn;
        const s0 = Math.min(...inset.map(p => p[0])), s1 = Math.max(...inset.map(p => p[0]));
        const ih = (bot - top) * api.wV;                              // inner height (world)
        const wheel = (s, t, R, teeth) => {
          const rs = su(R), rt = tv(R);
          api.ellipse(s + rs * 0.06, t + rt * 0.1, rs * 1.02, rt * 1.02, '#000', 'opacity="0.45"');
          api.ellipse(s, t, rs, rt, '#22272d', `stroke="#0b0e13" stroke-width="${0.35 * api.S}"`);                 // rubber tyre
          if (teeth) for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2 + spin, c = Math.cos(a), dd = Math.sin(a); api.poly([[s + c * rs * 0.92 - dd * rs * 0.12, t + dd * rt * 0.92 + c * rt * 0.12], [s + c * rs * 1.16, t + dd * rt * 1.16], [s + c * rs * 0.92 + dd * rs * 0.12, t + dd * rt * 0.92 - c * rt * 0.12]], '#3a424c', `stroke="#0b0e13" stroke-width="${0.15 * api.S}"`); }
          api.ellipse(s, t, rs * 0.8, rt * 0.8, api.light('#5d6874', 'metal'));                                 // steel disc
          api.ellipse(s, t, rs * 0.8, rt * 0.8, 'none', `stroke="#0b0e13" stroke-width="${0.2 * api.S}" opacity="0.7"`);
          if (!api.wreck) api.ellipse(s - rs * 0.15, t - rt * 0.15, rs * 0.45, rt * 0.45, '#fff', 'opacity="0.13"');
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + spin; api.ellipse(s + Math.cos(a) * rs * 0.5, t + Math.sin(a) * rt * 0.5, rs * 0.08, rt * 0.08, '#20252b'); }
          api.ellipse(s, t, rs * 0.26, rt * 0.26, api.light('#8a96a3', 'metal'), `stroke="#0b0e13" stroke-width="${0.25 * api.S}"`);
        };
        const front = sgn > 0 ? 0 : 1;                                // face u runs opposite on the two sides
        const Re = ih * 0.42, endS = su(Re + 0.6);
        const sF = front ? s1 - endS : s0 + endS, sR = front ? s0 + endS : s1 - endS, tm = (top + bot) / 2;
        wheel(sF, tm, Re, 12); wheel(sR, tm, Re * 0.92, 0);
        // road wheels sit on the lower belt with void above and between them
        const span0 = Math.min(sF, sR) + su(Re * 1.15), span1 = Math.max(sF, sR) - su(Re * 1.15);
        const Rw = Math.min(ih * 0.36, (span1 - span0) * api.wU / nW / 2 * 0.9);
        for (let i = 0; i < nW; i++) wheel(span0 + (span1 - span0) * (i + 0.5) / nW, bot - tv(Rw), Rw, 0);
        // return rollers hang under the top run
        const Rr = Math.min(1.1, ih * 0.12);
        for (let i = 0; i < 3; i++) { const sx = span0 + (span1 - span0) * (0.2 + i * 0.3); api.ellipse(sx, top + tv(Rr), su(Rr), tv(Rr), api.light('#6f7b88', 'metal'), `stroke="#0b0e13" stroke-width="${0.2 * api.S}"`); }
      },
    };
  }

  // ---------- 3D running gear ----------
  // Belt = plates following a loop (in motion order: top run rear→front, down the front, bottom run front→rear, up the rear),
  // so links drawn at (k + frame/3) · pitch along the loop move the right way. Wheels turn the matching way
  // (top of every wheel moves forward when driving forward). Everything is real geometry, so the loop is open.
  const PITCH = 2.0;
  function inset2(P, d) {   // inward offset of a closed convex 2D polygon (x, z), any winding
    const n = P.length; let area = 0;
    for (let k = 0; k < n; k++) { const a = P[k], b = P[(k + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area < 0 ? 1 : -1;            // clockwise → interior on the right of travel
    const nrm = (a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1; return [sgn * ez / l, -sgn * ex / l]; };
    return P.map((p, k) => {
      const a = P[(k - 1 + n) % n], b = P[(k + 1) % n], n1 = nrm(a, p), n2 = nrm(p, b);
      const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1, cosh = (m[0] * n1[0] + m[1] * n1[1]) / ml;
      const dd = d / Math.max(0.35, cosh);
      return [p[0] + m[0] / ml * dd, p[1] + m[1] / ml * dd];
    });
  }
  const seg = (P, d) => 'M' + P.map(q => fmt(q[0]) + ' ' + fmt(q[1])).join('L') + (d ? 'Z' : '');
  // convex hull (x, z), returned clockwise in (x, z) = top run goes rear → front (+x), i.e. motion order
  function hullXZ(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop(); up.push(q); }
    const ccw = lo.slice(0, -1).concat(up.slice(0, -1));   // counter-clockwise: bottom run first, left → right
    return ccw.reverse();                                    // clockwise: top run left (rear) → right (front)
  }
  const circ = (cx, cz, r, n, a0 = 0) => { const o = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };

  // Running gear: the belt wraps the drive sprocket (front), the idler (rear) and the road wheels.
  // Layout is derived from the track height so wheels always fill the loop. Every piece is a convex solid
  // that only touches its neighbours, so the separating-plane sort is exact at every angle.
  function runningGear(side, c, L, W, th, tw, paintC) {
    const parts = [], y0 = side < 0 ? -W / 2 : W / 2 - tw, y1 = y0 + tw, yc = (y0 + y1) / 2;
    const bt = Math.max(1.1, th * 0.11);                     // belt thickness
    const ih = th - 2 * bt;                                  // inner height of the loop
    const Rs = ih * 0.44, Ri = ih * 0.4;                     // sprocket / idler radius
    const xs = L / 2 - bt - Rs, zs = th - bt - Rs;           // sprocket centre (front, top of it sets the top run)
    const xi = -L / 2 + bt + Ri, zi = th - bt - Ri;          // idler centre (rear)
    const nW = c.wheels, gap = 0.5;
    const xa = xi + Ri * 0.55, xb = xs - Rs * 0.55;          // road wheels tuck under the sprocket / idler a little
    const Rw = Math.min(ih * 0.43, (xb - xa) / nW / 2 - gap / 2);
    const wheels = [];
    for (let i = 0; i < nW; i++) wheels.push([xa + Rw + (xb - xa - 2 * Rw) * (nW === 1 ? 0.5 : i / (nW - 1)), bt + Rw]);
    // belt loop = convex hull of all wheel circles grown by the belt thickness
    const N = 20, pts = [...circ(xs, zs, Rs + bt, N), ...circ(xi, zi, Ri + bt, N)];
    for (const [x, z] of wheels) pts.push(...circ(x, z, Rw + bt, N));
    const loop = hullXZ(pts), inner = inset2(loop, bt);
    const lens = loop.map((p, i) => { const q = loop[(i + 1) % loop.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
    let off = 0;
    loop.forEach((A, i) => {
      const k = (i + 1) % loop.length, B = loop[k], A2 = inner[i], B2 = inner[k], len = lens[i], start = off;
      off += len;
      if (len < 0.05) return;
      const pt = part(`belt${side}_${i}`, extrudeY([A, B, B2, A2], y0, y1), { color: '#2b3037', thin: true, mat: 'metal' });
      pt.out2 = [-(B[1] - A[1]) / len, (B[0] - A[0]) / len];
      pt.post = function (P, ctx) {
        const xf = this.xf, o = xf([0, 0, 0]), vis = nn => V.dot(V.sub(xf(nn), o), VIEW) > 0.02;
        const out2 = [-(B[1] - A[1]) / len, (B[0] - A[0]) / len];   // outward normal for a clockwise loop
        const ph = (ctx.frame || 0) / 3; let sOut = '', sSide = '';
        const outVis = vis([out2[0], 0, out2[1]]), sides = [vis([0, -1, 0]) ? y0 - 0.02 : null, vis([0, 1, 0]) ? y1 + 0.02 : null].filter(v => v !== null);
        for (let m = Math.floor(start / PITCH) - 1; m * PITCH < start + len + PITCH; m++) {
          const u = (m + ph) * PITCH - start; if (u < 0 || u > len) continue;
          const t = u / len, O = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], I = [A2[0] + (B2[0] - A2[0]) * t, A2[1] + (B2[1] - A2[1]) * t];
          if (outVis) { const a = P(xf([O[0] + out2[0] * 0.04, y0 + 0.3, O[1] + out2[1] * 0.04])), b = P(xf([O[0] + out2[0] * 0.04, y1 - 0.3, O[1] + out2[1] * 0.04])); sOut += `M${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}`; }
          for (const yy of sides) { const a = P(xf([O[0], yy, O[1]])), b = P(xf([I[0], yy, I[1]])); sSide += `M${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}`; }
        }
        const S = ctx.S; let r = '';
        if (sOut) r += `<path d="${sOut}" stroke="#0b0e13" stroke-width="${fmt(0.5 * S)}" opacity="0.85"/>`;
        if (sSide) r += `<path d="${sSide}" stroke="#596470" stroke-width="${fmt(0.3 * S)}" opacity="0.9"/>`;
        return r;
      };
      parts.push(pt);
    });
    // wheels: real cylinders, slightly smaller than their slot so they never touch the belt plates
    const ww = tw * 0.7;
    const wheel = (id, cx, cz, R, kind) => {
      const pt = part(id, cylY(cx, cz, R, yc - ww / 2, yc + ww / 2, 24), { color: kind === 'road' ? '#22262b' : '#4d5762', smooth: true, mat: kind === 'road' ? 'rubber' : 'metal', animated: true });
      const nb = kind === 'sprocket' ? 10 : 6;
      pt.post = function (P, ctx) {
        const xf = this.xf, o = xf([0, 0, 0]); let r = '';
        const th0 = (ctx.frame || 0) * (Math.PI * 2 / nb) / 3;     // top moves forward (+x) when driving
        for (const sg of [-1, 1]) {
          const nW2 = V.norm(V.sub(xf([0, sg, 0]), o)); if (V.dot(nW2, VIEW) <= 0.02) continue;
          const yy = yc + sg * (ww / 2 + 0.03);
          const ring = (rho, n = 24) => { const q = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; q.push(P(xf([cx + Math.cos(a) * rho, yy, cz + Math.sin(a) * rho]))); } return q; };
          const at = (rho, a) => P(xf([cx + Math.cos(a) * rho, yy, cz + Math.sin(a) * rho]));
          const nL = V.norm([nW2[0], nW2[1], nW2[2] + 0.9]);
          const M = c2 => lit(c2, nL, 'metal', ctx);
          if (kind === 'sprocket') {
            const tp = []; for (let i = 0; i < nb; i++) { const a = i / nb * Math.PI * 2 - th0; for (const [k, da] of [[0.82, -0.16], [1.0, -0.08], [1.0, 0.08], [0.82, 0.16]]) tp.push(at(R * k, a + da)); }
            r += `<path d="${seg(tp, 1)}" fill="${M('#3d464f')}" stroke="${OUT}" stroke-width="${fmt(0.25 * ctx.S)}" stroke-linejoin="round"/>`;
          }
          const hubR = kind === 'road' ? 0.72 : 0.7;
          r += `<path d="${seg(ring(R * hubR), 1)}" fill="${kind === 'road' ? lit(paintC, nL, 'paint', ctx) : M('#6f7b88')}" stroke="${OUT}" stroke-width="${fmt(0.22 * ctx.S)}"/>`;
          r += `<path d="${seg(ring(R * hubR * 0.7), 1)}" fill="none" stroke="#0b0e13" stroke-width="${fmt(0.14 * ctx.S)}" opacity="0.4"/>`;
          for (let i = 0; i < 6; i++) { const b0 = at(R * hubR * 0.62, i / 6 * Math.PI * 2 - th0 * nb / 6); r += `<circle cx="${fmt(b0[0])}" cy="${fmt(b0[1])}" r="${fmt(Math.max(0.5, R * 0.07) * ctx.S)}" fill="#1c2026"/>`; }
          r += `<path d="${seg(ring(R * 0.22, 14), 1)}" fill="${M('#8a96a3')}" stroke="${OUT}" stroke-width="${fmt(0.18 * ctx.S)}"/>`;
          if (!ctx.wreck) { const h = at(R * 0.45, 2.3); r += `<circle cx="${fmt(h[0])}" cy="${fmt(h[1])}" r="${fmt(R * 0.16 * ctx.S)}" fill="#fff" opacity="0.1"/>`; }
        }
        return r;
      };
      return pt;
    };
    const k = 0.96, wl = [];
    wl.push(wheel(`sprocket${side}`, xs, zs, Rs * k, 'sprocket'));
    wl.push(wheel(`idler${side}`, xi, zi, Ri * k, 'idler'));
    wheels.forEach(([x, z], i) => wl.push(wheel(`road${side}_${i}`, x, z, Rw * k, 'road')));
    // One compound part per track. A closed belt around wheels cannot be painter-sorted piece by piece
    // (top run is in front of the wheels, bottom run behind), so it is drawn in a fixed order:
    // inner belt surfaces → wheels (sorted) → outer belt surfaces and the visible belt side.
    // For the global sort it is the track's bounding box, which touches the hull only along planes.
    const xmin = Math.min(...loop.map(q => q[0])), xmax = Math.max(...loop.map(q => q[0]));
    const proxy = part(`track${side}`, box(xmin, xmax, y0, y1, 0, th), { animated: true });
    const belts = parts.splice(0);
    const faceSel = (bp, want) => Object.assign({}, bp, { faces: bp.faces.filter(f => {
      const ln = f.ln; if (Math.abs(ln[1]) > 0.9) return want === 'outer';
      const d = ln[0] * bp.out2[0] + ln[2] * bp.out2[1];
      return want === 'outer' ? d > 0.7 : d < -0.7;
    }), post: want === 'outer' ? bp.post : null, weather: want === 'outer' ? bp.weather : 0 });
    proxy.custom = function (ctx) {
      const xf = this.xf || (q => q);
      const pl = q => VU.place(q, xf);
      const inner = belts.map(b => faceSel(pl(b), 'inner'));
      const outer = belts.map(b => faceSel(pl(b), 'outer'));
      const wh = VU.depthSort(wl.map(pl));
      return [inner, wh, outer].map(g => VU.renderPartsRaw(g, ctx).map(r => r.svg).join('')).join('');
    };
    return [proxy];
  }

  function build(size, ctx) {
    const c = DIMS[size], { L, W, H } = c, T = ctx.paint, parts = [];
    const tw = W * (size === 'heavy' ? 0.2 : 0.22), th = H * 0.6, hw = W / 2 - tw;
    const podR0 = H * (size === 'heavy' ? 0.14 : 0.15);
    const uw = size === 'light' ? W / 2 - 0.5 : W / 2 - 2 * podR0 - 1.0;   // upper hull stays clear of the pods
    const trackProfile = [[-L / 2, th * 0.4], [-L / 2 + L * 0.09, 0], [L / 2 - L * 0.09, 0], [L / 2, th * 0.42], [L / 2 - L * 0.025, th], [-L / 2 + L * 0.025, th]];
    for (const side of [-1, 1]) {
      const y0 = side < 0 ? -W / 2 : W / 2 - tw, y1 = y0 + tw;
      parts.push(...runningGear(side, c, L, W, th, tw, T));
      // fender runs from the hull side (|y| = uw) to just past the track, so it never overlaps the upper hull
      const fy0 = side < 0 ? y0 - 0.6 : uw, fy1 = side > 0 ? y1 + 0.6 : -uw;
      if (size !== 'light') parts.push(part(`fender${side}`, extrudeY([[-L * 0.48, th], [L * 0.47, th], [L * 0.47, th + H * 0.04], [L * 0.42, th + H * 0.09], [-L * 0.48, th + H * 0.09]], fy0, fy1), {
        color: T, paint: true, weather: 0.85,
        decals: [{ match: n => n[0] > 0.3 && n[2] > 0.3, draw(api) { api.poly([[0.32, 0.15], [0.68, 0.15], [0.68, 0.85], [0.32, 0.85]], '#161b21'); api.ellipse(0.5, 0.5, 0.13, 0.3, api.wreck ? '#3a3632' : '#f6f0d6'); } }, D.strip(n => Math.abs(n[1]) > 0.9, 0.32, 0.6, 0.22, 0.66), D.boltRow(n => Math.abs(n[1]) > 0.9, 0.16, 12, 0.04, 0.96, 0.008), D.seams(n => n[2] > 0.9, [0.33, 0.66])],
      }));
      const bx0 = size === 'light' ? -L * 0.42 : L * 0.25, bx1 = size === 'light' ? -L * 0.2 : L * 0.42;
      let by0 = side < 0 ? fy0 + 0.8 : Math.max(fy1 - (fy1 - fy0) * 0.85, uw + 0.3), by1 = side < 0 ? Math.min(fy0 + (fy1 - fy0) * 0.85, -uw - 0.3) : fy1 - 0.8;
    }
    parts.push(part('lowerHull', extrudeY([[-L * 0.47, th * 0.3], [L * 0.36, th * 0.3], [L * 0.47, th * 0.72], [L * 0.47, th], [-L * 0.5, th], [-L * 0.5, th * 0.6]], -hw, hw), {
      color: T, paint: true, weather: 0.7,
      decals: [{ match: n => n[0] > 0.3 && n[2] > 0.2, draw(api) { for (let j = 0; j < 7; j++) api.bolt(0.08 + j * 0.14, 0.15, 0.012); } }],
    }));
    const up = [[-L * 0.5, th], [L * 0.47, th], [L * 0.47, th + H * 0.07], [L * 0.24, H], [-L * 0.42, H], [-L * 0.5, H * 0.86]];   // nose flush with fenders and lower hull
    parts.push(part('upperHull', extrudeY(up, -uw, uw), {
      color: T, paint: true, weather: 0.85,
      decals: [
        D.seams(n => n[2] > 0.97, [0.3, 0.7], 's'),
        ...(size === 'light' ? [D.strip(n => Math.abs(n[1]) > 0.9, 0.42, 0.56, 0.12, 0.7)] : []),
        D.boltRow(n => n[2] > 0.97, 0.04, 14, 0.04, 0.96, 0.007), D.boltRow(n => n[2] > 0.97, 0.96, 14, 0.04, 0.96, 0.007),
        { match: n => n[0] > 0.3 && n[2] > 0.2 && n[2] < 0.97, draw(api) { // glacis
          for (let k = 0; k < (api.dmg >= 2 ? 1 : 3); k++) { const s0 = 0.33 + k * 0.12; api.poly([[s0, 0.12], [s0 + 0.1, 0.12], [s0 + 0.1, 0.55], [s0, 0.55]], '#22272e', `stroke="#0b0e13" stroke-width="${0.25 * api.S}"`); for (let j = 0; j < 4; j++) api.line(s0 + 0.01, 0.17 + j * 0.1, s0 + 0.09, 0.17 + j * 0.1, '#6d7884', 0.4 * api.S); }
          api.poly([[0.3, 0.8], [0.7, 0.8], [0.7, 0.87], [0.3, 0.87]], '#161b21'); api.poly([[0.31, 0.815], [0.69, 0.815], [0.69, 0.855], [0.31, 0.855]], api.glow());
          for (let j = 0; j < 9; j++) api.bolt(0.06 + j * 0.11, 0.95, 0.008);
        } },
        { match: n => n[0] < -0.9 && Math.abs(n[2]) < 0.3, draw(api) { // rear plate only: tail lights + exhaust soot
          for (const s of [0.035, 0.905]) { api.poly([[s, 0.3], [s + 0.06, 0.3], [s + 0.06, 0.7], [s, 0.7]], '#161b21'); api.poly([[s + 0.01, 0.35], [s + 0.05, 0.35], [s + 0.05, 0.65], [s + 0.01, 0.65]], api.wreck ? '#2a1612' : '#ff4a3a'); }
          const rs = H * 0.065 / api.wU, rt = H * 0.065 / api.wV;   // soot around each exhaust (pipes at y = ±0.55 uw, z = 0.73 H)
          for (const s of [0.225, 0.775]) { api.ellipse(s, 0.32, rs * 2.2, rt * 2.6, '#0a0b0d', 'opacity="0.3"'); api.ellipse(s, 0.5, rs * 1.6, rt * 1.6, '#0a0b0d', 'opacity="0.45"'); }
        } },
      ],
    }));
    parts.push(part('grille', box(-L * 0.42, -L * 0.27, -uw * 0.55, uw * 0.55, H, H + 1.3), { color: PAL.dark, weather: 0.5, decals: [D.grille(n => n[2] > 0.9, size === 'light' ? 7 : 9)] }));
    parts.push(part('hatchDeck', box(L * 0.145, L * 0.225, -uw * 0.5, -uw * 0.12, H, H + 0.8), { color: T, paint: true, weather: 0.85, thin: true, noDamage: true, decals: [{ match: n => n[2] > 0.9, draw(api) { api.line(0.25, 0.5, 0.75, 0.5, api.light('#8a96a3', 'metal'), 0.6 * api.S); for (const s of [0.08, 0.92]) for (const t of [0.12, 0.88]) api.bolt(s, t, 0.035); } }] }));
    for (const s of [-1, 1]) {
      const y = s * uw * 0.78;
      const ly = s * (W / 2 - tw / 2);
      parts.push(part(`hook${s}`, box(L * 0.47, L * 0.5, s * hw * 0.6 - 1.2, s * hw * 0.6 + 1.2, th * 0.76, th * 0.94), { color: PAL.dark, thin: true }));
      parts.push(tubeX(`exhaust${s}`, s * uw * 0.55, H * 0.73, H * 0.065, -L * 0.55, -L * 0.5, { color: '#3a3f45', decals: [D.bore(n => n[0] < -0.9)] }));
    }
    if (size === 'light') for (const s of [-1, 1]) if (!(ctx.dmg >= 2 && s > 0)) parts.push(part(`can${s}`, box(-L * 0.55, -L * 0.5, s * uw * 0.24 - 2.6, s * uw * 0.24 + 2.6, th + H * 0.02, th + H * 0.3), { color: OLIVE, paint: true, noDamage: true, weather: 0.7, thin: true, decals: [{ match: n => n[0] < -0.9, draw(api) { api.line(0.15, 0.3, 0.85, 0.7, '#2b2f22', 0.4 * api.S); api.line(0.15, 0.7, 0.85, 0.3, '#2b2f22', 0.4 * api.S); } }] }));
    const dmg = ctx.dmg || 0;
    let podTop = 0;
    for (let row = 0; row < c.pods; row++) {
      const r = H * (size === 'heavy' ? 0.14 : 0.15);
      for (const s of [-1, 1]) {
        const cy = s * (W / 2 - r - 0.5), cz = th + H * 0.11 + r + row * r * 2.05;
        podTop = Math.max(podTop, cz + r);
        parts.push(tubeX(`pod${row}${s}`, cy, cz, r, -L * 0.36, L * 0.2, {
          color: T, paint: true, mat: 'paint', bands: [{ x: -L * 0.25, w: 2.4 }, { x: L * 0.06, w: 2.4 }],
          decals: [{ match: n => n[0] > 0.9, draw(api) { api.ellipse(0.5, 0.5, 0.36, 0.36, api.light('#5f6a76', 'metal'), `stroke="#0b0e13" stroke-width="${0.3 * api.S}"`); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; api.bolt(0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42, 0.03); } api.ellipse(0.5, 0.5, 0.15, 0.15, api.glow()); } }],
        }));
      }
    }
    // turret ring collar: the turret sits above every hull part it can sweep over, so it can turn freely
    const pivotZ = Math.max(H + 1.6, podTop + 1.4), pvx = -L * 0.06, Rc = Math.min(L * 0.19, uw - 0.3);
    parts.push(part('turretCollar', cylZ(pvx, 0, Rc, H, pivotZ, 32), { color: PAL.plate, smooth: true, weather: 0, decals: [{ match: n => n[2] > 0.9, draw(api) { for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; api.bolt(0.5 + Math.cos(a) * 0.46, 0.5 + Math.sin(a) * 0.46, 0.012); } } }] }));
    return {
      parts,
      pivot: [pvx, 0, pivotZ],
      firePts: [[-L * 0.345, 0, H + 1.3], [L * 0.12, -uw * 0.3, H], [-L * 0.38, uw * 0.55, H]],
    };
  }

  for (const size of Object.keys(DIMS)) VU.chassis[size] = { dims: DIMS[size], speed: DIMS[size].speed, build: ctx => build(size, ctx) };
})(typeof window !== 'undefined' ? window.VectorUnit : globalThis.VectorUnit);
