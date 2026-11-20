# Tanks viewer — approved vector designs (reference)

`index.html` is the tanks viewer from the "State of War Game" project (artifact version `1795028841-3fb0`, approved
2026-11-18): all **15 tanks** (Panzer, Artillery, Anti-Air, Flamer, Special × Light / Medium / Heavy) drawn live by the
VectorUnit engine in the game's **2:1 view**. Open it in a browser; it needs no build and no network.

It shows each tank in 32 directions with separate hull and turret, the turret aiming at the pointer, firing (flash, smoke,
recoil), driving (3-frame tracks), damaged / burning / destroyed states, the wreck and six team colours.

**What it is for:** the design reference for the tanks. The game will not draw these vector models live (too slow); the tanks
are being rebuilt as 3D models in Blender and baked to sprites like the walkers (`docs/walkers/`). Shapes, sizes and parts
follow this viewer.

**The code inside the page:**
- `VectorUnit`: projection, lighting, weathering, damage marks, painter's sort, rendering, the live viewer instance.
- Shared chassis (Light / Medium / Heavy) and one weapon module per type, each registering on `VectorUnit.chassis` /
  `VectorUnit.weapons`.
- The viewer UI.

Rules the models follow: `CLAUDE.md` and `docs/tank-types.md`. Live version: https://claude.ai/artifact/12ezQYv9on3bk22XzjVgAc
(newer than this copy if it was changed after 2026-11-20).
