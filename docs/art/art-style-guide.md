# State of War Game — 2.5D Vector Art Style Guide

Approved reference asset: **Heavy Tank Factory v2** (`assets/buildings/heavy-factory.js`).
Every new unit and building must follow this style and reuse the same engine helpers.

## Projection
- 2:1 isometric, orthographic (matches the game map: tile edges at ~26.57°).
- screen = ((x − y) · 0.866, (x + y) · 0.5 − z). x/y = ground, z = up. 1 world unit ≈ 1 svg unit.
- Default in-game scale ≈ 0.2 (whole platform fits the building tile footprint).

## How models are built
- 3D primitives only: convex prisms/boxes (`box`, `prism`, `extrudeX`) and vertical cylinders (`cyl`).
- Flat details are face **decals** (local coords: u → right, v → down, origin at the face's top-left).
- **4 fixed facings** (0/90/180/270°): rotate around the platform centre, then depth-sort parts by AABB
  (`depthSort`; no edge when separating axes disagree).
- World-space lighting from top-left: colour = base × (0.55 + 0.55 · max(0, n·L)), L = norm(0.35, 0.6, 1).
- Thin dark outline on every face: `#0b0e13`, width ≈ 0.8.

## Palette
- Body gunmetal `#5a6573`, plates `#6b7785`, trim `#808c9a`, dark `#38404a`, interior `#161a20`.
- Platform top `#3a414a`, sides `#272c33`, panel grid `#2c3239`.
- Hazard `#f2c230` / `#16181b` (45° stripes). Warm interior glow `#ffd27a → #ff8a1a`.
- **Team colour** drives ALL emissive detail (light strips, lanes, fan rings, windows, emblem, unit stripes).
  Changing team colour must visibly change the model. Light variant = mix(team, white, 0.5).

## Building conventions
- Beveled octagonal platform with a glowing team-colour edge line.
- Production buildings: 1–3 lines set by the map; unused lines are sealed
  (red door, hazard band, chains, padlock, red lamps, red X on the ground).
- Production cycle: lamps blink amber → doors slide open → unit drives out of the dark bay → doors close → lamps green.
- Ambient motion: fans spin (faster while producing), radar rotates, beacon blinks, smoke from stacks.

## Standard API for every asset
create(el, { lines, facing, team, scale, onTankOut }) →
produce(line) · setLines(n) · setFacing(k) · rotate(±1) · setTeam(c) · setScale(k) ·
anchor() · gateExit(line) · isBusy(line) · isLocked(line) · toSVGString() · destroy()
