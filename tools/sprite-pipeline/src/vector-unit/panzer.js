/*!
 * Panzer weapon module (main battle tank) for VectorUnit.
 * Light: 1 short barrel · Medium: 2 barrels side by side · Heavy: 3 long barrels.
 * Turret-local axes, pivot at the origin (z = 0 is the hull deck).
 */
(function (VU) {
  'use strict';
  const { PAL, part, tubeX, box, prismZ, extrudeY, cylZ, cylY, decals: D } = VU;
  const CFG = {
    light:  { barrels: 1, barrelLen: 0.52, barrelR: 0.028, turretR: 0.24 },
    medium: { barrels: 2, barrelLen: 0.54, barrelR: 0.029, turretR: 0.25 },
    heavy:  { barrels: 3, barrelLen: 0.62, barrelR: 0.031, turretR: 0.26 },
  };
  const CANVAS = '#7d7458', GLASS = '#1d3a44';

  function build(size, ctx) {
    const c = CFG[size], dims = VU.chassis[size].dims, L = dims.L, H = dims.H, T = ctx.paint;
    const R = L * c.turretR, tH = H * (size === 'heavy' ? 0.5 : 0.55);
    const parts = [], muzzles = [];
    const mW = R * (0.36 + 0.16 * (c.barrels - 1)), mz0 = tH * 0.15, mz1 = tH * 0.88;
    const fw = Math.max(0.34, mW / R + 0.06);   // turret front is wide enough to carry the gun mantlet (no overhang)
    const plan = [[1.0 * R, fw * R], [0.42 * R, 0.78 * R], [-0.72 * R, 0.78 * R], [-1.0 * R, 0.42 * R], [-1.0 * R, -0.42 * R], [-0.72 * R, -0.78 * R], [0.42 * R, -0.78 * R], [1.0 * R, -fw * R]];
    parts.push(part('ring', cylZ(0, 0, R * 0.74, -1.5, 0, 28), { color: PAL.dark, smooth: true }));
    parts.push(part('turret', prismZ(plan, 0, tH, 0.8, [-R * 0.06, 0]), {
      color: T, paint: true, weather: 0.85,
      decals: [
        D.strip(n => Math.abs(n[1]) > 0.6 && Math.abs(n[2]) < 0.8, 0.44, 0.58, 0.1, 0.9),
        D.boltRow(n => Math.abs(n[2]) < 0.8, 0.9, 8, 0.06, 0.94, 0.018),
        { match: n => n[2] > 0.97, draw(api) { api.line(0.12, 0.62, 0.88, 0.62, '#0b0e13', 0.4 * api.S, 'opacity="0.55"'); api.line(0.12, 0.635, 0.88, 0.635, '#fff', 0.25 * api.S, 'opacity="0.2"'); } },
      ],
    }));
    parts.push(part('hatch', cylZ(-R * 0.35, R * 0.28, R * 0.25, tH, tH + 1.6, 24), { color: T, paint: true, smooth: true, noDamage: true, decals: [{ match: n => n[2] > 0.9, draw(api) { api.ellipse(0.5, 0.5, 0.42, 0.42, '#000', 'opacity="0.15"'); api.line(0.25, 0.5, 0.75, 0.5, api.light('#8a96a3', 'metal'), 0.6 * api.S); api.bolt(0.5, 0.12, 0.05); } }] }));
    parts.push(part('mgMount', box(-R * 0.18, -R * 0.02, R * 0.38, R * 0.5, tH + 1.6, tH + 3.4), { color: PAL.dark, thin: true }));
    parts.push(tubeX('mgBarrel', R * 0.44, tH + 2.8, 0.45, -R * 0.02, R * 0.45, { color: '#2c3239' }));
    for (const y of [-0.3, 0, 0.3]) parts.push(part(`vision${y}`, box(R * 0.42, R * 0.56, y * R - 1.6, y * R + 1.6, tH, tH + 1.2), { color: PAL.dark, thin: true, decals: [{ match: n => n[0] > 0.9, draw(api) { api.poly([[0.1, 0.2], [0.9, 0.2], [0.9, 0.85], [0.1, 0.85]], api.wreck ? '#141210' : GLASS); if (!api.wreck) api.poly([[0.15, 0.25], [0.5, 0.25], [0.3, 0.8], [0.15, 0.8]], '#9fd9e6', 'opacity="0.5"'); } }] }));
    parts.push(part('sensor', box(-R * 0.62, -R * 0.24, -R * 0.58, -R * 0.26, tH, tH + 3.2), { color: PAL.plate, weather: 0.5, decals: [{ match: n => n[0] > 0.9, draw(api) { api.poly([[0.12, 0.18], [0.88, 0.18], [0.88, 0.7], [0.12, 0.7]], '#12161b'); api.poly([[0.18, 0.25], [0.82, 0.25], [0.82, 0.62], [0.18, 0.62]], api.glow()); } }] }));
    for (const s of [-1, 1]) {
      const y0 = s > 0 ? R * 0.8 : -R * 0.8 - 3.4, y1 = y0 + 3.4;
      parts.push(part(`smokeBlock${s}`, box(R * 0.1, R * 0.36, y0, y1, tH * 0.42, tH * 0.8), { color: PAL.plate, weather: 0.5, thin: true }));
      for (let k = 0; k < 3; k++) parts.push(tubeX(`smoke${s}${k}`, y0 + 0.6 + k * 1.1, tH * 0.68, 0.55, R * 0.36, R * 0.5, { color: '#4b5560', decals: [D.bore(n => n[0] > 0.9, 0.35)] }));
    }
    parts.push(part('bustle', box(-R * 1.32, -R * 1.0, -R * 0.6, R * 0.6, tH * 0.15, tH * 0.7), { color: PAL.dark, weather: 0.5, thin: true, decals: [{ match: () => true, draw(api) { for (let i = 1; i < 8; i++) api.line(i / 8, 0.05, i / 8, 0.95, '#7d8996', 0.3 * api.S, 'opacity="0.7"'); for (let i = 1; i < 4; i++) api.line(0.03, i / 4, 0.97, i / 4, '#7d8996', 0.3 * api.S, 'opacity="0.7"'); } }] }));
    if (!(ctx.dmg >= 2)) parts.push(part('tarp', cylY(-R * 1.16, tH * 0.7 + 1.85, 1.8, -R * 0.55, R * 0.55), { color: CANVAS, paint: true, noDamage: true, smooth: true }));
    const frontX = z => R - 0.275 * R * (z / tH) + 0.02;
    parts.push(part('mantlet', extrudeY([[frontX(mz0), mz0], [R * 1.13, mz0 + 1.5], [R * 1.13, mz1 - 1.5], [frontX(mz1), mz1]], -mW, mW), { color: PAL.plate, weather: 0.6, decals: [D.boltRow(n => n[0] > 0.5, 0.12, 6, 0.08, 0.92, 0.03), D.boltRow(n => n[0] > 0.5, 0.88, 6, 0.08, 0.92, 0.03)] }));
    const bl = L * c.barrelLen, br = L * c.barrelR, bz = tH * 0.52;
    const spacing = c.barrels === 1 ? 0 : (2 * mW * 0.72) / (c.barrels - 1);
    for (let i = 0; i < c.barrels; i++) {
      const by = c.barrels === 1 ? 0 : -mW * 0.72 + i * spacing;
      const x0 = R * 1.13, x1 = x0 + bl, xe0 = x0 + bl * 0.4, xe1 = x0 + bl * 0.56, xm = x1 - bl * 0.13, mr = br * 1.5;
      parts.push(tubeX(`collar${i}`, by, bz, br * 1.55, x0, x0 + bl * 0.09, { color: PAL.plate }));
      parts.push(tubeX(`tube${i}`, by, bz, br, x0 + bl * 0.09, xm, { color: PAL.trim }));
      parts.push(part(`brake${i}`, box(xm, x1, by - mr, by + mr, bz - mr * 0.8, bz + mr * 0.8), {
        color: '#3e464f', weather: 0.4, thin: true,
        decals: [
          { match: n => n[0] > 0.9, draw(api) { api.ellipse(0.5, 0.5, 0.3, 0.38, '#050608'); } },
          { match: n => Math.abs(n[1]) > 0.9, draw(api) { for (const s of [0.22, 0.62]) api.poly([[s, 0.25], [s + 0.2, 0.25], [s + 0.2, 0.75], [s, 0.75]], '#07090c'); api.poly([[0.8, 0], [1, 0], [1, 1], [0.8, 1]], '#000', 'opacity="0.35"'); } },
          { match: n => n[2] > 0.9, draw(api) { api.poly([[0.75, 0], [1, 0], [1, 1], [0.75, 1]], '#000', 'opacity="0.3"'); } },
        ],
      }));
      muzzles.push([x1 + 0.5, by, bz]);
    }
    parts.push(part('antenna', box(-R * 0.92, -R * 0.89, R * 0.52, R * 0.55, tH + 1.4, tH + 1.4 + H * (ctx.dmg >= 2 ? 0.25 : 0.8)), { color: '#22272e', thin: true }));
    parts.push(part('antennaBase', cylZ(-R * 0.905, R * 0.535, 1.2, tH, tH + 1.4, 12), { color: PAL.dark, smooth: true }));
    return { parts, muzzles, tH, R };
  }

  VU.weapons.panzer = { name: 'Panzer', role: 'Main battle tank', build };
})(typeof window !== 'undefined' ? window.VectorUnit : globalThis.VectorUnit);
