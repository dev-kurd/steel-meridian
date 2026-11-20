# Tanks — 3D Model in Blender (status 2026-11-20: mockup round 1 APPROVED; the three Panzer models are BUILT; the Panzer BAKE is ready to run on the PC (`bake_panzer.bat`, section 18); the work continues in a Claude Code session on the PC from the repo, `docs/tanks/` (section 19); after the bake: pack, check, then mockup round 2 for the other four weapons)

Model files: `C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks` on the user's PC (see section 17).

Mockup canvas, round 1 (three chassis + Panzer turret): https://claude.ai/artifact/GpQbtjn6pd3wkKC951E7Xg
(8 boards: family, in-game size next to a Walker + track loop, vector vs 3D, directions + turret aim, layers, damage states, team colours,
changes after the notes.)

Related: `walkers-3d-model.md` (the pipeline this reuses), `tank-units-vector-model.md` (the approved designs), `tank-types.md`,
`art-style-guide.md`, `rendering-design-note.md`. Vector tanks viewer (design reference): https://claude.ai/artifact/12ezQYv9on3bk22XzjVgAc

## 1. Goal
- Rebuild all 15 tanks (5 weapon types × Light / Medium / Heavy) as 3D models in Blender and render them to sprites, the same way as the Walkers.
- One approach for every unit in the game: 3D model → Cycles render → sprite sheets + team mask.
- Better quality: rounded armour edges, real shadows and contact shading, one wear and damage shader, the same light and outline as the Walkers.
- Fewer errors: the vector engine's painter sort goes away, and with it the "parts must touch, never overlap" rule, the sort cycles and the
  parts that vanished at some angles. A renderer with a depth buffer cannot make those mistakes.
- The user also wants the tanks **improved, with more detail** than the vector models. Claude proposes on the mockup canvas; the user gives notes.

## 2. What stays the same
- **The designs, as the starting point.** The approved vector tanks are the reference for shapes, sizes, proportions and parts: three
  chassis (Heavy with the armoured deck block, power-cell pods, turbines and star), and the Panzer, Artillery, Anti-Air, Flamer and
  Special modules. Changes and added detail go through the mockup canvas.
- **The modelling rules** from the style guide: less detail on the Light, chunky weapons that read at game size, weapons that read as their
  role, each size reads differently, no hazard stripes, no thin add-ons.
- **Paint and glows:** muted `unitPaint`, team lights = mix(unitPaint, white, 0.5), the Heavy's star in a light tint, fixed fire glows
  (Flamer) and energy cyan (Special) the same for every team, all glows off on a wreck.
- **Game contract:** separate hull and turret layers, 32 directions each, turret aims on its own, one hull per size shared by every weapon,
  damage states at ≤60 / ≤30 / 0, WebP lossless sheets at @1x / @2x / @4x with the team mask in the bottom half (R = paint, G = lights).
- **Projection:** the game's 2:1 dimetric view, light from L = (0.35, 0.6, 1).

## 3. What changes
| | Vector tanks (today) | 3D tanks (this plan) |
|---|---|---|
| Source | SVG parts in `VectorUnit` (JavaScript, inside the viewer page) | Python script + `.blend` scenes in Blender |
| Shapes | Flat prisms and cylinders, one shade per face | Bevelled, rounded meshes with smooth shading |
| Draw order | Separating-plane sort, checked with `tools/check.cjs` | Depth buffer in the renderer; only the hull / turret split needs a rule |
| Details | Decals drawn on faces (bolts, seams, strips, grilles, star) | Small real geometry, plus the procedural wear shader |
| Shadows | A blurred ellipse under the turret, a blurred polygon on the ground | Rendered shadows and contact shading |
| Damage | Marks drawn per face | The Walkers' shader (`DMG` 0–3), lost parts hidden, wreck pose |
| Team mask | Three renders, added on sRGB values | Two renders, added **in linear light** (as for the Walkers) |

The game's `TeamSprite` shader needs the linear-light version for the Walkers anyway. After this change one shader serves every unit.

## 4. Scale and size
Same scale as the Walkers: `M2U = 28` model units per metre, so tanks and Walkers keep their true relative size.

| Size | Hull in model units (L × W × H) | In Blender (metres) | Turret pivot height (units) |
|---|---|---|---|
| Light | 64 × 44.8 × 22.4 | 2.29 × 1.60 × 0.80 | 24.0 |
| Medium | 83.2 × 57.6 × 28.8 | 2.97 × 2.06 × 1.03 | 30.49 |
| Heavy | 102.4 × 73.6 × 35.2 | 3.66 × 2.63 × 1.26 | 38.01 |

Axes as in `walker_lib.py`: +X forward, Z up, game y = −Blender y. Directions 0..31, 0 = +x (screen lower-right).
Sprite scale: one model unit is about 0.35 px at @1x and 1.4 px at @4x, so a detail needs to be about 2–3 units across to show in the game.

## 5. Layers and sprites
- **Hull** (one per size): running gear, lower and upper hull, fenders, pods, engine deck, turret seat. Baked for 32 directions × track
  frames × 3 states (intact, damaged, burning), with the team mask.
- **Turret** (one per size and weapon): baked for 32 directions × 3 states, with the team mask. Barrel elevation is fixed per weapon, as today.
- **Split rule:** a flat plane at the turret pivot height of each size. All hull geometry is below it, all turret geometry above it, so
  turret-over-hull is always the right draw order. Checked by script (`split_check`). The deck is only 1.6 units below the plane on the
  Light (1.7 Medium, 2.8 Heavy), so thick pipes on the deck are half sunk into it.
- **Turret shadow on the hull:** the turret can face any of 32 directions on a hull facing any of 32, so the true shadow cannot be baked
  (1,024 combinations). **Changed 2026-11-20 (section 18):** the hull is rendered with a plain round drum standing where the turret is, so
  the deck carries the turret's shade the same for every turret direction; the turret sprite has no shadow in it. (First plan, dropped
  after the test bake: a shadow-catching disc under the turret, its soft shadow part of the turret sprite.)
- **Ground shadows:** one for the hull and one for the turret (long barrels reach past the hull), per direction. The game blends a unit's
  shadows with "max" so they do not darken twice (same rule as the Walkers).
- **Wreck:** one merged sprite per model (hull, turret knocked askew, its shadow), charred, no team colour, 16 directions.
- **Tracks:** real geometry (link plates round the loop, toothed sprocket, idler, road wheels). The animation moves the links by one link
  pitch over 4 frames and turns the wheels to match (today: 3 frames). The game still picks the frame from the distance driven; the frame
  count and the distance per frame come from the data file. The whole hull is rendered once per track frame.
  - Considered, not chosen: tracks as their own sprite layer (fewer renders, but two sprites that meet edge to edge can show a seam).

Rough count: hulls 2,304 renders, turrets 2,880, shadows 576, wrecks 240, about 6,000 in total. At the Walkers' measured 2.2–2.5 s per
render that is about 4 hours on the RTX 3060. The bake skips finished files, so it can be stopped and resumed.

## 6. How the models are built
- **Cleaner than the Walkers**, with a later real 3D game in mind: one closed mesh per rigid part, sensible quad topology, few parts pushed
  through each other, bevels on real edges.
- **Structure:** one collection per layer (`<name>_hull`, `<name>_turret`); pivots as empties (root, hull direction, turret direction,
  turret, one per wheel); each track is one mesh rebuilt per animation frame.
- **Shared parts:** one chassis builder that takes the size and one weapon function per type that takes the size, like the vector code.
- **Details:** bolts, panel seams, vents, light strips, grilles, hatches, pipes, head and tail lights and the Heavy's star are shallow real
  geometry. Wear, grime, chips and damage come from the shared shader, in object space, so marks never flicker between directions.
- **Not done now** (needed only for a real 3D game): UV maps, baked textures, merged low-poly meshes, a skeleton.

## 7. Rendering (reused from the Walkers without change)
Camera and projection, sun + rim + fill lights, gradient world, Freestyle outline, Cycles with denoise, transparent film,
shadow-catcher ground, the two-render team mask and the bake loop pattern (mask mode outermost for speed).
The frame size is chosen per size and weapon so the longest barrel fits; sprites are trimmed when packed.

## 8. Output for the game
- Sheets split by unit type so they can load separately: `tank-hull`, `tank-hull-dmg`, `tank-<type>`, `tank-<type>-dmg`, `tank-common`
  (shadows and wrecks, no mask). WebP lossless, pages ≤ 4096 × 2048 per half, three resolutions, downsampled in linear light.
- `tanks.json`, shaped like `walkers.json`:
  - frames: `hull/{size}/s{state}/d{dd}/f{frame}`, `turret/{size}/{type}/s{state}/d{dd}`, `shadow/hull/{size}/d{dd}`,
    `shadow/turret/{size}/{type}/d{dd}`, `wreck/{size}/{type}/d{dd}`;
  - tables: turret pivot on screen per size and hull direction; muzzle points per model and turret direction; barrel elevation;
    fire and smoke points on the hull; track frame count and distance per frame.
- Draw order for one tank: shadows → hull → turret (at the pivot offset, plus the recoil kick).
- Effects stay in the `fx` sheet: muzzle flash, smoke, flames, explosion. A flame jet for the Flamer and a beam for the Special are still open.

## 9. Files and tools
- **The Walkers folder is not touched while its bake runs.** At 12:07 on 2026-11-19 the bake was still running there, owned by another
  chat. This work only took a read-only copy of `walker_lib.py` (md5 `2f2f0ee42681f45e7d33b6bb65db62be`); it wrote nothing there and queued no jobs.
- New folder beside it: `C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks`, **created 2026-11-19** (contents in section 17; `bake/`
  and `sheets/` come with the bake). **Since 2026-11-20 the same files are in the repo under `docs/tanks/source/`, which is the source of
  truth** (section 19). The round 1 chat was given the parent folder `Game Dev` and wrote only inside `StateOfWar-Tanks`.
- **Where the code is:** `tank_lib.py` (the model: chassis, Panzer turret, layers, damage, split check, track frames, save functions),
  `sow_common.py` and `build_tanks.py` are in that folder. `mock.py` (the mockup renders), `compose.py` and `prep2.py` (image preparation)
  are in `mockup/` (saved on 2026-11-20; until then they were only in the round 1 chat's cloud workspace). `tank_lib.py` imports `sow_common.py` for colours, materials, mesh helpers,
  world, camera and render setup, and adds its own materials (`paintp` thin painted plates, `rubber`, `track`, `olive`, `canvas`, `glass`,
  `lamp`, `tail`), its own damage shader (`make_metal_t`, `tank_materials`; see 16) and helpers (`B`, `BC`, `P`, `C`, `m_loft`, `studs`,
  `Slope`, `strip`, `grille`, `m_pipe`, `pipe`, `clamps`).
- **Shared module (done for the tanks):** `sow_common.py` holds the functions both unit types share, cut out of `walker_lib.py` by name
  without changing them (one exception: `reset_scene` makes only the `env` collection). A render through it matches the earlier render
  (mean difference 0.003 / 255). `walker_lib.py` itself is untouched and does not use it yet; moving the Walkers onto it is a later step
  for the Walkers' chat. `tank_lib.use_backend(walker_lib)` lets tanks be built into a Walker scene for comparison renders.
- Cloud workspace: `pip install bpy==5.3.0` (Python 3.13), 2 CPU cores, no GPU. Measured: about 15–30 s for a 520 × 400 render at 24 samples,
  about 2.5 minutes for 1840 × 700 at 32 samples; a full set of mockup renders (about 37) takes about 18 minutes. Too slow for the bake.
- Vector reference renders for comparison: the viewer's script blocks run in Node (`VectorUnit.sprite` + `pivotScreen`), turned into PNG with
  `rsvg-convert`. Scale match: `S = a / (28 × 0.866)` where `a` is the 3D camera's px per metre. Overlaid, vector and 3D line up.
- Canvas upkeep: a changed image is a new upload, so the boards are re-pointed to the new image addresses after each pass.

## 10. Steps (each gate needs approval)
1. **Design note approved** (done, 2026-11-19).
2. **Mockup round 1**: the three chassis with the Panzer turret (**approved 2026-11-19** after three passes of notes).
   **Model built** the same day for these three tanks (section 17).
3. **Mockup round 2:** Artillery, Anti-Air, Flamer and Special on all three sizes (not started, waits for the user's go-ahead).
   **2026-11-20: the user asked to bake the Panzer first** (section 18), so the Panzer bake and pack come before round 2.
4. **Checks:** split-plane check, all 32 directions, track loop, wreck, team mask accuracy against real renders in all six team colours.
5. **Bake** on the PC, pack, rebuild units from the sheets and compare with the renders.
6. **Demo and docs:** sprite viewer / PixiJS demo with tanks and Walkers together; update `art-style-guide.md`,
   `rendering-design-note.md` and `tank-units-vector-model.md` (kept as the design reference, marked replaced as the source).

## 11. Known limits and risks
- The 3D tanks will not match the vector tanks pixel for pixel. Shapes and proportions follow them; the surface look follows the Walkers.
- The turret's shadow on the hull is an approximation (section 5).
- The Light is small on screen; fine 3D detail can turn into noise there. Judged at game size on the canvas, not zoomed in.
- Sheet size is unknown until a test bake (the Walkers came to about 16 MB for 21 sheets without damage states). The user wants a balance
  of quality and file size with the web version in mind; the track-frame count and the separate-track-layer option are the main levers.
- The vector viewer stays as it is, as the frozen design reference. `tools/check.cjs` and the sort rules are no longer needed for tanks.

## 12. User decisions (2026-11-19)
1. **Plan approved.**
2. **Round 1 scope:** the three chassis with the Panzer turret.
3. **Folder:** the new `StateOfWar-Tanks` folder beside the Walkers folder.
4. **Design:** improve the tanks and add more detail. Claude makes the mockup, the user gives notes.
5. **First notes on round 1** (the user marked the barrels and muzzle brakes on the family board; they call the muzzle brake "the nozzle"):
   make the barrel simpler; make the nozzle smaller; add more detail to the nozzle; add more detail to the tank (pipes, for example). Done, see 14.
6. **Second note:** make the pipes' radius larger so they can be seen in an RTS game. Done, see 15.
   General rule taken from it: **added detail must be big enough to read at game size**, not only in close-ups.
7. **Third notes:** on the Light, remove the pipe on top of the body (the deck-edge conduits; the side pipes stay). The user does not
   like the burning style: fewer orange spots, more black and smoky tinted areas, and cracked plates instead. Done, see 16.

8. **Mockup approved; "build the model".** Done, see 17.

## 13. Mockup round 1, first pass: what was built (2026-11-19)
- **Follows the vector model:** every dimension comes from the same formulas (`DIMS`, track layout, pods, turret plan, mantlet, barrel
  layout), so the hull and turret overlay the vector renders.
- **Added or made real in 3D:**
  - Running gear: separate track links with grousers and guide horns (pitch 2.5 units), toothed sprocket, idler with lightening holes,
    road wheels with rubber tyres, painted rims, hubs and bolts, return rollers.
  - Hull: bevelled armour, real bolt rows and panel seams, glacis vents with slats, team light bars, tow hooks and shackles, driver's hatch
    with lid, handle, hinge and two periscopes, engine grille with slats and fuel caps, exhausts with shrouds, tail lights, rear access
    panel and hitch, mud flaps.
  - Light: headlights on the glacis corners, side skirts with seams, light strip, grab rails, two jerry cans.
  - Medium: fender stowage boxes with lids and latches, headlight clusters, pods on saddles with straps, end caps and a glowing core.
  - Heavy: power-cell pods (five cooling fins, two glowing seams, armoured nose), turbines with nine blades and a glowing hub, octagonal
    deck block with light strips and vents, applique glacis plates, sensor lenses, star on its plate.
  - Panzer turret: commander's cupola with lid, handle, hinge and vision slits; roof machine gun; three vision blocks; sensor box with a
    glowing lens (Medium, Heavy); smoke launchers; cheek armour (Medium, Heavy); rear basket with rails, ammo boxes and a tarp roll (Medium,
    Heavy); antenna; bolted mantlet; coaxial gun.
- **Changed from the vector model (Claude's choice, open to notes):** barrels 18% thicker so they read at game size; the roof machine gun
  sits on the roof in front of the cupola; the antenna moved onto the roof (it was past the roof edge).
- **Lost at "burning":** one jerry can (Light), one headlight (with its cable), one smoke launcher, the tarp, the antenna's upper part.

## 14. Second pass: after the first notes (2026-11-19)
- **Barrel (simpler):** one collar at the mantlet (radius 1.45 br, 7% of the length) and a plain tube that tapers slightly (1.05 br → 0.95 br).
  Removed: the collar ring, the two sleeve bands, the fume extractor and its end rings.
- **Muzzle brake ("nozzle"; smaller, more detail):** half-width 1.5 br → 1.24 br, length 13% → 10.5% of the barrel. Parts: a neck ring, a
  rounded body, two ports on each side with a steel lip between them, two top vents, a face ring with four bolts, a recessed bore.
- **Pipes and other added detail:**
  - Every size: an exhaust pipe on each side from the engine deck over the rear chamfer down to the exhaust; hydraulic lines from the
    mantlet up to the roof (two, or one in the middle on the Medium's twin guns).
  - Light: a clamped pipe along each side skirt, a conduit with clamps along each deck edge.
  - Medium and Heavy: two feed pipes from each pod into the hull, headlight cables, a cable from the sensor box to the cupola, three
    bolted armour tiles on each upper turret side.
  - Medium: three spare track links with a retaining bar on each side of the glacis.
  - Heavy: two coolant lines from each turbine to the deck block.

## 15. Third pass: thicker pipes (2026-11-19)
Pipe radii in model units, before → after (about twice as thick; diameter now 1.4–2.6 units, about 2–3.6 px at @4x):

| Pipe | Before | After | Note |
|---|---|---|---|
| Exhaust pipes (all sizes) | 0.6 | 1.2 | Half sunk into the deck and the rear chamfer |
| Light side-skirt pipes | 0.55 | 1.3 | Stand out from the hull side; three clamps |
| Light deck-edge conduits | 0.5 | 1.1 | **Removed in the fourth pass** at the user's request |
| Pod feed pipes (Medium, Heavy) | 0.5 | 1.1 | Run height capped under the turret plane; one clamp each |
| Heavy coolant lines | 0.55 | 1.1 | |
| Hydraulic lines on the turret | 0.4 | 0.9 | |
| Sensor cable | 0.4 | 0.8 | |
| Headlight cables | 0.35 | 0.7 | |

- Couplings are a little slimmer relative to the pipe (1.3 × radius); clamps are bands 0.7 units wide.
- **Checks after the change:** split plane still exact (0.0 mm) for all three sizes; team mask recolour mean 2.6 / 255, 99% within 34 / 255
  (32 samples, CPU). Objects per tank: 503 / 626 / 744.
- At @1x the pipes are about one pixel wide: they show as lines, not as round pipes. They read well at @2x and @4x.

## 16. Fourth pass: Light top pipes removed, new damage look (2026-11-19)
- **Light:** the two conduits along the deck edges are removed. The Light keeps its side-skirt pipes, exhaust pipes and turret lines.
  Objects per tank now 495 / 626 / 744.
- **Damage look: the tanks now have their own shader.** `make_metal_t` in `tank_lib.py` is a copy of the Walkers' `make_metal` with a
  different damage part; `tank_materials(team)` builds the tank material set with it (same names, colours and roles, so `set_damage`,
  `set_mask_mode` and the lost-parts logic work unchanged). At `DMG = 0` it is identical to the Walkers' shader. `walker_lib.py` is not changed.
  - **Soot:** black cores from a noise field (scale 2.6); the threshold drops with damage (0.69 − 0.055·D − 0.02·D²), so burning is much
    sootier than damaged. A wide soft halo round each core gives the smoky tint (dark brown-grey, 66%).
  - **Cracked plates:** Voronoi cell borders (scale 3.4, cells about 0.3 m, slightly wobbled), crack width about 0.05 m so they show at
    game size, with a bump so they read as grooves and a thin worn lip beside each crack on clean paint. They appear in and around the
    smoky areas from "damaged" and cover the wreck. Strength per material: paint 1.0, steel and dark 0.3, tracks, rubber and small black parts 0.
  - **Embers:** only on the rim of a few soot patches while burning; strength 3 (was 5), rarer, and 0.2× on steel so barrels hardly glow.
    Off on a wreck.
- **States now:** damaged = smoke stains and first cracks; burning = large black soot areas, cracked plates, a few embers, parts lost;
  wreck = charred and cracked, turret askew, all lights off.
- **Open:** the Walkers still use the old glowing-burn look. The same damage part could be moved into their shader so both unit types
  match; that changes an approved Walker look and their bake, so it needs the user's decision.
- **Rough spots Claude still sees:**
  1. The Heavy's star sits in the barrels' shadow when the turret faces forward, so it reads dark.
  2. The turret-only layer's soft deck shadow is faint.
  3. Renders are CPU previews at low samples; the PC bake will be cleaner.
  4. No UV maps yet, and small parts still sit on or slightly in larger ones.

## 17. The built model (2026-11-19)
Folder `C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks` (3.9 MB):

| File | What it is |
|---|---|
| `tank_lib.py` | The model, source of truth (md5 `c3492d39e606e5f877605e4cdbd2ce3e` since the bake changes of 2026-11-20, section 18) |
| `sow_common.py` | Shared colours, materials, mesh helpers, lights, camera, render setup |
| `build_tanks.py` | `build_all(sizes=None, weapon='panzer', team='#33d17a')` builds and saves every tank |
| `blend/tank_light_panzer.blend`, `tank_medium_panzer.blend`, `tank_heavy_panzer.blend` | One saved scene per tank (0.6–0.74 MB, compressed, no outside links) |
| `tank_data.json` | Per tank, in metres: hull size, turret pivot, turret radius, muzzle points (turret-local), track pitch and frames |
| `checks/` | `directions_32_<size>.jpg`, `damage_states.jpg`, `family.jpg` |
| `README.md` | What is in the folder and how to rebuild |

- **Inside each .blend:** collections `<size>_hull`, `<size>_panzer_turret`, `env` (three suns, shadow-catcher ground, camera), `no_outline`
  (two hidden stand-ins used only by the bake: `deck_proxy` and `turret_proxy`, section 18). Empties: `<size>_root` → `hull_dir` and `turret_dir` → `turret`, plus one per wheel. Camera = the game's
  view at 960 × 720; Cycles, transparent film, Freestyle outline; device set to GPU. Scene property `sow_tank` = that tank's `tank_data.json` entry.
- **Size of the models:** Light 475 mesh objects / 30,798 faces / 15 materials; Medium 604 / 40,336 / 16; Heavy 720 / 48,328 / 17.
- **How they were built and checked:** with Blender's Python module 5.3.0 in the cloud. Each file was reopened in a fresh process and
  rendered from the file alone. **Not yet opened in the Blender on the PC.**
- **Checks:**
  - Split plane: hull top and turret bottom exactly on the plane (0.0 mm) for all three.
  - All 32 directions rendered for each size (96 renders, board 9 on the canvas and `checks/`): nothing missing or wrongly ordered.
  - Team mask against real renders (Medium, 32 samples, CPU): green mean 2.56, blue 2.98, red 2.89 out of 255; 99% of pixels within
    34–38 (includes render noise). Same range as the Walkers.
  - Track loop, damage states and wreck: boards 2 and 6.
- **Not part of this build:** the other four weapon types, the packed sheets, UV maps. (The bake scripts and the per-direction data
  tables for the game, turret pivot and muzzle points on screen, were added on 2026-11-20: section 18.)
- **Next steps:** this plan (round 2 before any bake, through the Blender listener) was **replaced on 2026-11-20**. The Panzer set is
  baked first, with `bake_panzer.bat`, which starts Blender itself (no listener). Current steps: section 19.

## 18. The Panzer bake (2026-11-20; ready, not yet run on the PC)
The user asked to bake the Panzer set (Light, Medium, Heavy hull + Panzer turret) before mockup round 2.

- **How to run:** double-click `bake_panzer.bat` in `StateOfWar-Tanks`. It finds Blender 5.x, runs it without a window
  (`blender -b --python bake_tanks.py`) and writes into `bake/`. It can be closed and started again (finished files are skipped);
  `bake/progress.txt` shows progress, `bake/BAKE_DONE` appears at the end. Blender has to run on the PC; Claude cannot start it from the cloud.
- **Renders:** 3,120 in total. Per size: hull 32 directions × 4 track frames × 3 states × 2 (A and B) = 768; turret 32 × 3 × 2 = 192;
  ground shadows 64; wreck 16. Expected about 2 hours on the RTX 3060 at the Walkers' 2.2–2.5 s per render (cloud CPU test: 9–13 s each).
- **Output:** `bake/hull/<size>/s<state>/d<dd>_f<frame>_<A|B>.png`, `bake/turret/<size>/panzer/s<state>/d<dd>_<A|B>.png`,
  `bake/shadow/hull/...`, `bake/shadow/turret/...`, `bake/wreck/<size>/panzer/d<dd>.png` (16 directions), `bake/tables.json`
  (frame sizes, anchors, and per direction: turret pivot, turret shadow point, muzzle points, fire points, in @1x px).
- **Files added:** `bake_panzer.bat`, `bake_tanks.py`, `tools/pack_tanks.py`, `tools/compose_tanks.py`, `checks/bake_test_heavy.jpg`.

### What the test bake found and what was changed
A test bake (Heavy, 2 directions) was packed and the tank rebuilt from the sheets, then compared with the same tank rendered whole.
The first result was paler and flatter than the whole render. Four causes, all fixed:
1. **Turret moved down for its render.** The paint's dust depends on real height, so a turret lowered to the ground came out dusty.
   Now the camera moves and the tank stays in place.
2. **Bright disc under the turret.** The shadow-catching disc had no material (light grey) and lit the turret from below. It is now a
   dark disc the camera does not see (`deck_proxy`): it only stands in for the hull deck's light.
3. **Turret shade on the hull.** With the turret hidden the deck was fully lit and its catcher shadow was too weak or too dark.
   Now the hull is rendered with a round drum where the turret stands (`turret_proxy`, radius = turret half-length, floating 0.1 m),
   seen by light but not by the camera. Checked with the turret at two directions: hull pixels differ from the whole render by 5.8–5.9 of 255
   on average. Not baked: the barrels' shadow on the hull (it depends on the turret direction).
4. **Team mask highlights cut off.** With pure red paint (brightness 1.0) the B render was cut off at 1.0 on 10–27% of the tank's pixels, and light
   bouncing between painted parts counted about five times too strong (red at 1.0 against a real paint near 0.2). B is now rendered at 20% brightness (`MASK_GAIN = 0.2`), the packer
   divides by it, and the part of the mask above 1.0 (paint highlights) is added to the base sprite as plain white light.
   Measured on the Heavy against real renders in four team colours: mean error 2.3–2.8 of 255 (was 3.4–4.5), 99% of pixels within 16–20 (was 36–43).
   **The game's colour formula does not change.** The Walkers' sheets still use the old way (brightness 1.0).
Also: the dark ground stays in every render (the camera does not see it in the hull and turret layers) so each layer gets the same light
from below; sprite anchors now land on whole pixels.

**Result of the final test** (Heavy, hull direction 5, turret direction 0, track frame 2; `checks/bake_test_heavy.jpg`): average colour of
seven sample areas (front plate, lower plate, turret top and side, pod, barrels, tracks) is within 4 of 255 of the whole render in green,
blue and burning red, except two areas on the blue tank (turret side 5, turret top 9). Per-pixel mean difference on the tank 6–9 of 255,
mostly sub-pixel edges and the missing barrel shadow on the hull.

### Packing (after the bake)
`python tools/pack_tanks.py bake sheets [--tracks overlay|full]` → `sheets/tanks.json` + `tank-*.webp` for @4x, @2x, @1x, same sheet format
as the Walkers (base on top, team mask below, `maskOffsetY`).
- **Track frames:** the bake renders the whole hull for all 4 track frames (as approved). At pack time there are two ways to store them:
  - `overlay` (default): frame 0 whole, frames 1–3 only the pixels that change (tracks and wheels: 13–22% of the hull in the tests). The game draws
    the hull, then the small overlay on top. Same picture as `full` (mean difference 0.01–0.02 of 255).
  - `full`: every track frame is a whole hull.
  - Size estimate for the Panzer set, from the test packs: about 44 MB (overlay) against 74 MB (full) for all three resolutions;
    @2x alone about 9.5 MB against 17 MB. Switching needs no new bake.
- Keys in `tanks.json`: `hull/<size>/s<s>/d<dd>/f<f>`, `turret/<size>/<weapon>/s<s>/d<dd>`, `shadow/hull/<size>/d<dd>`,
  `shadow/turret/<size>/<weapon>/d<dd>`, `wreck/<size>/<weapon>/d<dd>`; `models[<size>_<weapon>]` holds the per-direction tables;
  the `note` field describes the draw order.

### Open
- Run the bake on the PC, then pack, rebuild all 32 directions from the sheets and compare.
- Apply the new mask brightness and the new burning style to the Walkers too? (Needs a new Walkers bake; not decided.)

## 19. Decisions and handover (2026-11-20)
**Owner's decisions**
- The three changes from the approved plan in section 18 are accepted: no shadow in the turret sprite (the shade is in the hull
  sprite), the barrels' shadow on the hull is not baked, and the darker team-mask render (`MASK_GAIN = 0.2`).
- **Walkers:** re-bake them with the new mask method too. The owner does not like the Walkers' damaged look: make it like the tanks
  (smoky tint, less orange / fire colour). The owner also wants other improvements inside the Walker models (not listed yet: ask).
- **Order:** finish the Panzer tanks first.
- **The work moves to a Claude Code session on the owner's PC**, which can start Blender itself.

**Where everything is now**
- Repo `dev-kurd/steel-meridian`, folder `docs/tanks/`: `README.md` (status, how to bake / pack / check, next steps), this note,
  `images/`, and `source/` (model, bake, pack and check tools, `.blend` files, `mockup/` with the round 1 mockup tools). The repo copy
  is the source of truth from now on. `CLAUDE.md` in the repo carries the approved rules.
- PC folder `StateOfWar-Tanks`: the same files (work copy), plus `mockup/` and the two check tools added today.
- New tools: `tools/check_refs.py` (renders whole tanks in Blender) and `tools/check_pack.py` (rebuilds the same tanks from the sheets
  and compares). Tested on the Heavy test pack: mean 8.9 of 255 on the tank's pixels, as in section 18.
- Mockup tools (`mockup/mock.py`, `compose.py`, `prep2.py`, `vector-ref/`): the scripts behind the round 1 boards, for round 2.
  They were only in the round 1 chat's cloud workspace before.

**Next steps, in order**
1. On the PC: a short test bake (one size, one direction) to confirm Blender is found, the GPU is used and the time per render.
2. The full Panzer bake (3,120 renders), then pack (`pack_tanks.py`), then the check (`check_refs.py` + `check_pack.py`, and a contact
   sheet of all 32 directions with `compose_tanks.py`). Show the owner.
3. Decide where the packed sheets live (not in the repo yet, like the Walkers' sheets).
4. Mockup round 2 (Artillery, Anti-Air, Flamer, Special), and the Walker changes above. Ask the owner which comes first. Each starts
   with a design note or mockup, as always.

