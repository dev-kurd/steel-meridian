/*!
 * UnitModels — bridge between the VectorUnit tank models (vector-unit.js + chassis.js + panzer.js, unchanged)
 * and the State of War sprite pipeline (bake.cjs, the test map's Live SVG mode).
 *
 *  - Scale: the Light Panzer (64 model units long) is drawn at K = 21/64, so it has the same footprint as the
 *    game tank it replaces (hull ≈ 21 × 15 × 7.4 world units) and collisions/steering stay as they are.
 *  - Layers: hull (+ ground shadow), anchored at the tank centre on the ground; turret (+ contact shadow),
 *    anchored on the ground right below its pivot. The game moves the turret by pivotOffset(heading).
 *  - Team colour: view(..., colours) draws real colours (Live SVG); bakeViews() returns the three passes the
 *    bake needs to work out the team mask by subtraction (see bake.cjs, "derive" groups).
 */
(function (root) {
  'use strict';
  const VU = root.VectorUnit;
  if (!VU || !VU.weapons.panzer) throw new Error('UnitModels: load vector-unit.js, chassis.js and panzer.js first');
  const SIZE = 'light', TYPE = 'panzer';
  const K = 21 / 64;                 // model units → world units
  const SW = 0.32;                   // outline width in world units (same as the other game models)
  const PAINT_REF = '#a0a0a0', REF = 160 / 255;   // grey used for the "paint" bake pass (low enough never to clip)
  const WRECK_PAINT = '#6b6f66';     // wrecks are 84% charred; this is the little paint that shows through
  const DIRS = VU.DIRS, dims = VU.chassis[SIZE].dims;

  const P = (p) => { const q = VU.proj(p); return [q[0] * K, q[1] * K]; };
  const filters = (pre) => `<filter id="${pre}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(4 / 3 * K).toFixed(3)}"/></filter>` +
    `<filter id="${pre}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(2.2 / 3 * K).toFixed(3)}"/></filter>`;
  let seq = 0;
  const ctxOf = (o) => ({ S: K, sw: SW, paint: o.paint, glow: o.glow, dmg: o.dmg || 0, wreck: o.dmg === 3, frame: o.frame || 0, prefix: `u${++seq}-`, ox: 0, oy: 0 });
  function bboxOf(parts, extra) {
    let b = [1e9, 1e9, -1e9, -1e9];
    for (const p of parts) for (const f of p.faces) for (const q of f.pts) { const s = P(q); b = [Math.min(b[0], s[0]), Math.min(b[1], s[1]), Math.max(b[2], s[0]), Math.max(b[3], s[1])]; }
    for (const s of extra || []) b = [Math.min(b[0], s[0]), Math.min(b[1], s[1]), Math.max(b[2], s[0]), Math.max(b[3], s[1])];
    return b;
  }
  const build = () => VU.chassis[SIZE].build(ctxOf({ paint: PAINT_REF, glow: '#fff' }));
  const PIVOT = build().pivot;                                   // model units, hull-local [x, 0, z]
  const pivotZ = PIVOT[2];

  // hull: tracks, hull, ground shadow. dmg 0 intact · 1 damaged · 2 burning · 3 wreck
  function hull(dir, frame, dmg, paint, glow) {
    const ctx = ctxOf({ paint, glow, dmg, frame }), a = VU.dirAngle(dir);
    const c = VU.chassis[SIZE].build(ctx), parts = c.parts.map((p) => VU.place(p, (q) => VU.rotZ(q, a)));
    const shadow = VU.groundShadow({ size: SIZE, dir, S: K, prefix: ctx.prefix, dmg });
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => VU.rotZ([x * dims.L * 0.53, y * dims.W * 0.53, 0], a));
    const ext = corners.concat(corners.map((p) => [p[0] - 0.35 * dims.H * 0.7, p[1] - 0.6 * dims.H * 0.7, 0])).map(P);
    const pad = 3 * (4 / 3 * K);
    let bb = bboxOf(parts, ext); bb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    const body = VU.renderPartsRaw(VU.depthSort(parts), ctx).map((r) => r.svg).join('');
    return { svg: `<defs>${filters(ctx.prefix)}</defs>${shadow}${body}`, bbox: bb };
  }
  // turret: drawn at its real height, origin = ground point right below the pivot
  function turret(dir, dmg, paint, glow) {
    const ctx = ctxOf({ paint, glow, dmg }), extra = dmg === 3 ? 0.42 : 0, a = VU.dirAngle(dir) + extra;
    const w = VU.weapons[TYPE].build(SIZE, ctx);
    const parts = w.parts.map((p) => VU.place(p, (q) => { const r = VU.rotZ(q, a); return [r[0], r[1], r[2] + pivotZ]; }));
    const c = P([-0.35 * w.tH * 0.6, -0.6 * w.tH * 0.6, pivotZ]), rx = w.R * 1.2 * K, ry = w.R * 0.68 * K;
    const sh = `<ellipse cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="#000" opacity="0.32" filter="url(#${ctx.prefix}soft)"/>`;
    const body = VU.renderPartsRaw(VU.depthSort(parts), ctx).map((r) => r.svg).join('');
    const pad = 3 * (2.2 / 3 * K);
    let bb = bboxOf(parts, [[c[0] - rx - pad, c[1] - ry - pad], [c[0] + rx + pad, c[1] + ry + pad]]);
    bb = [bb[0] - 0.4, bb[1] - 0.4, bb[2] + 0.4, bb[3] + 0.4];
    // a wreck's turret is knocked askew and off its ring
    const shift = dmg === 3 ? [-1 * K, (2 / 3) * K] : null;
    const svg = `<defs>${filters(ctx.prefix)}</defs>` + (shift ? `<g transform="translate(${shift[0].toFixed(3)} ${shift[1].toFixed(3)})">${sh}${body}</g>` : sh + body);
    if (shift) bb = [bb[0] + shift[0], bb[1] + shift[1], bb[2] + shift[0], bb[3] + shift[1]];
    return { svg, bbox: bb };
  }

  // models the game uses. Damage is baked into full frames (the paint itself gets scorched), not overlays.
  const MODELS = {
    tankHull:      { layer: 'hull',   dmg: 0, frames: 3 },
    tankHullD1:    { layer: 'hull',   dmg: 1, frames: 3 },
    tankHullD2:    { layer: 'hull',   dmg: 2, frames: 3 },
    tankHullWreck: { layer: 'hull',   dmg: 3, frames: 1, teamless: true },
    tankTurret:    { layer: 'turret', dmg: 0, frames: 1 },
    tankTurretD1:  { layer: 'turret', dmg: 1, frames: 1 },
    tankTurretD2:  { layer: 'turret', dmg: 2, frames: 1 },
    tankTurretWreck: { layer: 'turret', dmg: 3, frames: 1, teamless: true },
  };
  // one view in real colours (Live SVG, previews). colours: { paint, glow } hex
  function view(model, facing, frame, colours) {
    const M = MODELS[model], c = M.teamless ? { paint: WRECK_PAINT, glow: '#2a2522' } : colours;
    return M.layer === 'hull' ? hull(facing, frame, M.dmg, c.paint, c.glow) : turret(facing, M.dmg, c.paint, c.glow);
  }
  // the three bake passes for one view: A = grey paint + white lights, B = no paint + white lights, C = no paint + no lights
  function bakeViews(model, facing, frame) {
    const one = (paint, glow) => view(model, facing, frame, { paint, glow });
    const A = one(PAINT_REF, '#ffffff');
    return { svgA: A.svg, svgB: one('#000000', '#ffffff').svg, svgC: one('#000000', '#000000').svg, bbox: A.bbox };
  }
  // team colours the panzer engine itself uses: muted unit paint, lights = paint mixed 50% with white
  const colours = (hex) => { const paint = VU.unitPaint(hex); return { paint, glow: VU.mix(paint, '#ffffff', 0.5) }; };

  // positions the game needs (world units). Turret-relative values are before the turret's rotation.
  const w0 = VU.weapons[TYPE].build(SIZE, ctxOf({ paint: PAINT_REF, glow: '#fff' })), mz = w0.muzzles[0];
  const META = {
    name: 'Light Panzer', scale: K, facings: DIRS, step: 360 / DIRS,
    pivot: [PIVOT[0] * K, PIVOT[1] * K, 0],                            // hull-local, on the ground
    muzzle: [mz[0] * K, mz[1] * K, (mz[2] + pivotZ) * K],             // from the pivot, along the turret
    burnPts: build().firePts.map((p) => [p[0] * K, p[1] * K, p[2] * K]), // hull-local flame / smoke points
    length: dims.L * K, width: dims.W * K, height: dims.H * K,
  };
  // where the turret sprite goes for a hull heading (radians), as a world offset from the tank centre
  const pivotOffset = (heading) => [Math.cos(heading) * META.pivot[0] - Math.sin(heading) * META.pivot[1], Math.sin(heading) * META.pivot[0] + Math.cos(heading) * META.pivot[1]];

  const api = { MODELS, META, view, bakeViews, colours, pivotOffset, PAINT_REF: REF, K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UnitModels = api;
})(typeof window !== 'undefined' ? window : globalThis);
