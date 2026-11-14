# State of War Game — 2.5D Vector Art Style Guide

Approved reference assets, all in one file: `assets/buildings/tank-factories/tank-factories.js` (the shared
VectorEngine plus the three models). Demo: `docs/art/factories-demo.html`.
- **Heavy Tank Factory** : 3 lines, 6 fans, control tower + radar, sloped armour.
- **Medium Tank Factory** : 2 lines, 4 fans, upright walls with radiator fins,
  raised armoured spine with sensor dome, sloped emblem buttress between the gates, per-gate hoods, fuel silos, hex platform.
- **Light Tank Factory** : 1 line, 2 fans on the ridge, faceted hangar roof with
  glowing skylight strips, side control booth with rotating radar, twin antennas, single stack, small octagon platform.
- Gate activation order per building (`ORDER` in the spec): heavy 1 line = centre gate, 2 lines = left + centre.
  Production lines are numbered left → right over the active gates; number plates show the line number.

Every new building in this style is a new model spec on VectorEngine.
Family rule: buildings in the same family share materials, lights, doors and platform language, but each tier
gets its own silhouette (roof feature, wall treatment, fan count, platform shape).

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

## Weathering (required on all bodies)
- Procedural and seeded per face (same marks on every load/facing), clipped to the face polygon.
- Keep weathering subtle so the paint colour stays strong. Side faces: light grime gradient on the lower half, dark streaks running down, rust spots with drips,
  chipped paint showing bare metal (`#aab2ba`) along the edges, worn top edge, light scratches.
- Top faces: dust patches, rust spots, edge chips, scratches.
- Strength per part via `weather: 0..1` (painted armour 1, trims/platform ≈ 0.5, units ≈ 0.6).

## Palette
- **Body armour is painted in a clean, saturated team colour** (pure green / blue, no grey tint):
  paint = HSL(team hue, saturation 0.60–0.82, lightness solved so its luminance equals the green paint,
  capped at 0.56) → every team colour is equally bright, never black-tinted. Override with `paint`.
  Exception — purple/violet (hue 255–320°): saturation 0.42–0.50, 25% brighter, lightness cap 0.64 (softer, lighter).
  Exception — red (hue 335–15°): saturation 0.46–0.52, 10% darker target, lightness cap 0.50 (softer, deeper red).
- **Not captured (powered down):** neutral light grey `#b4bac2`, all lights grey/off, fans stopped, radar still, no stack smoke, no production. On capture everything spins up.
- Metal parts stay gunmetal: plates `#6b7785`, trim `#808c9a`, dark `#38404a`, interior `#161a20`.
- Platform top `#3a414a`, sides `#272c33`, panel grid `#2c3239`, edge line `#5a636d`.
- Hazard `#f2c230` / `#16181b` (45° stripes). Warm interior glow `#ffd27a → #ff8a1a`.
- **Team colour** drives the body paint and emissive detail (light strips, lane edges, fan rings, windows, emblem, unit stripes) — not the platform edge.
  Changing team colour must visibly change the model. Light variant = mix(team, white, 0.5).

## Health states (every building)
- **> 50%** intact (weathering only).
- **≤ 50% semi-damaged:** scorch marks, cracks, bullet holes on painted armour, one smoke column, sparks.
- **< 20% critical:** heavy scorching, holes with glowing ember edges, 3 animated fires on the roof,
  thick black smoke, 2 broken stopped fans, flickering lights.
- Damage marks are seeded per face (stable across reloads/facings) and only on painted armour.

## Doors & lanes
- Blast doors: grey steel halves meeting at a **dark-grey plastic seal** (`#3a4148` with a soft `#59616a` highlight; no coloured light, never pure black).
- Exit lanes: team-colour edge lines + **one thick light-grey (`#c3c9cf`) chevron arrow** per active lane.

## Upgrade levels (cumulative; footprint, gates and anchor never change)
- **L1:** two small white stars (`#e9eef3`) on the roof between the front fans.
- **L2:** the 3 small rear fans become 1 large (9 blades) + 1 small fan.
- **L3:** the 3 small rear fans become 2 large fans.
- Large fans spin slower than small ones (×0.62); they break at critical health and stop when uncaptured, like all fans.
- Production animation speeds up ×1.1 / ×1.2 / ×1.3 (override with `speed`); stats live in game logic.
- Raising the level plays the upgrade effect: new parts drop into place with sparks and a glow pulse (~0.8 s).
- **Medium factory:** L1 one white star in the middle of the roof spine (light strip splits around it) ·
  L2 left rear fan becomes large · L3 both rear fans large. Same effect, fan speed and damage rules as the heavy.
- **Light factory:** L1 one white star on the front gable above the gate · L2 two larger ridge fans · L3 one very large fan.

## Hazard stripes — use sparingly
- Only: thin band on blast doors (active and disabled). Gate jambs are plain trim with a team light line.
- No hazard on walls, roofs, platform lanes or tanks; use dark bands / team light lines instead.

## Building conventions
- Beveled platform with a plain steel edge line (no team colour on the pad edge — team colour lives on the building).
- Production buildings: 1–3 lines set by the map; unused lines look **disabled**: same door colour and
  design as an active gate, powered off (no light seam, slightly dimmed), no icons,
  grey lamps, no ground markings, and the roof fan above that gate stopped (`data-gate` on the fan).
- Production cycle: lamps blink amber → doors slide open → unit drives out of the dark bay → doors close → lamps green.
- Ambient motion: fans spin (faster while producing), radar rotates, beacon blinks, smoke from stacks.

## Standard API for every asset
create(el, { lines, facing, team, paint, captured, health, scale, onTankOut }) →
produce(line) · setLines(n) · setFacing(k) · rotate(±1) · setTeam(c) · setPaint(c) · setCaptured(b, team?) · setHealth(0..1) · setScale(k) ·
anchor() · gateExit(line) · isBusy(line) · isLocked(line) · toSVGString() · destroy()
