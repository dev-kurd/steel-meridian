# Steel Meridian: notes for Claude

An RTS in the style of *State of War: Warmonger*. This file lists what the owner has **approved** for the game's art and
technology. Follow it; anything not listed here is not decided yet, so ask. The full notes live in the claude.ai project
"State of War Game" (design note, art style guide, tank and walker docs); links are at the end.

## Working rules
- **Confirm before acting.** When the owner asks a question, answer it. Start work, tool use or anything that needs permission
  only after they confirm.
- **Asset workflow:** mockup first (nothing is built before it) → model after the mockup is approved → bake to sprites after
  the model is approved → docs. Mockups are shown on a design canvas: family, directions, damage states, team colours.
- **Don't build the desktop exe for every change.** Update the web demo and the asset packs; build installers only when asked.
- Git: work on a branch and open a pull request (see `README.md`). Keep `main` playable.
- Assets must be original or properly licensed.

## Where the game is going (approved rendering plan)
The current code draws every unit and building live each frame in Canvas 2D from plan-view SVG models (`assets/**/model.svg`).
That is too slow. The game is moving to this plan:
- **Models are the source, baked to sprite sheets**, drawn with **PixiJS (WebGL)**. Units are 3D models in Blender rendered to
  sprites (walkers done; tanks: the Panzer set is modelled, baked and packed; the other four weapon types are modelled after mockup round 2, baked, packed and checked too, see `docs/tanks/`); buildings are 2.5D vector models (VectorEngine) baked the same way.
- **Resolutions @1x / @2x / @4x**, switched automatically by zoom × screen density. Zoom is limited (about 0.5×–2×). The game
  starts at a larger zoom and does not zoom out as far as today.
- **WebP lossless only** (one file type, no PNG copies). Sheets at most 4096 px; sprites trimmed.
- **Separate sheets per group** so they load on demand (buildings, each unit type, its damaged states, shadows/wrecks, fx), listed
  in a JSON manifest with frame rectangles and anchors.
- **Team colour by shader, not per-colour sheets:** one sprite + a team mask in the bottom half of the same image
  (R = paint, G = team lights), coloured by a batched PixiJS sprite shader (`TeamSprite`; team colours in the vertex data, so all
  teams draw in a few batches). For the 3D-rendered units the colour is added **in linear light**:
  `out = toSRGB(toLinear(base) + toLinear(mask.r)·toLinear(paint) + toLinear(mask.g)·toLinear(light))`.
- **How the mask is baked (approved 2026-11-20):** two renders per frame, A (paint black, team lights off) and B (paint red, lights
  green, at 20% brightness). Mask = (B − A) / 0.2 in linear light; the part above 1.0 (paint highlights) goes into the base sprite.
  The tanks are baked this way. The walker sheets were baked the old way (B at full brightness, highlights cut off) and **will be
  re-baked the new way**. The shader formula above is the same for both.
- **Tank effects and sounds (approved 2026-11-21):** how each of the 15 tanks shoots, what its shot, hit, damage and destruction
  look and sound like: `docs/tanks/tank-fx-design.md`, shown working in the tank demo (`docs/tanks/demo/`).
- **Effects** come from an `fx` sheet: flipbook flames, explosions and muzzle flash (additive), plus particle smoke and embers,
  muzzle smoke and a small recoil kick when a tank fires.

## Projection
- The game's **2:1 dimetric** view (`game.js`: `ix = (x − y) · 0.75`, `iy = (x + y) · 0.375 − z`). Every asset uses it.
  Camera direction for culling/sorting: norm(1, 1, 0.75). Light from L = norm(0.35, 0.6, 1).
- **Do not use true isometric** ((x + y) · 0.5 − z).
- `assets/buildings/heavy-factory/heavy-factory.js` is still the old isometric version and `game.js` stretches it (height × 0.75).
  It is switched off (`HF_USE = false`). When a 2:1 factory replaces it, remove that stretch or it is squashed twice.

## Units
Unit roster, weapons, ranges and roles: **`docs/tank-types.md`** (15 tanks) and **`docs/walker-types.md`** (5 walkers). Walker models, renders, bake and sheet format: **`docs/walkers/`**. Tank models, bake, pack tools and next steps: **`docs/tanks/`**.
- **Tanks:** 15 models, 5 weapon types (Panzer, Artillery, Anti-Air, Flamer, Special) × Light / Medium / Heavy. One shared chassis per
  size, one weapon module per type on the same turret pivot.
- **Hull and turret are separate sprites**, 32 directions each; the turret aims on its own and always draws above the hull
  (split by a flat plane at the turret pivot height). Tracks animate with frames chosen by distance driven (4 frames per link).
- **Track frames are stored as overlays (approved 2026-11-20):** the sheet holds the whole hull once (frame 0) and, for frames 1–3,
  only the pixels that change. The game draws hull frame 0, then the overlay on top.
- **Tank bake rules (approved 2026-11-20):** the turret sprite carries no shadow; the hull sprite carries the turret's shade, rendered
  with a plain round stand-in for the turret so it is right for every turret direction; the barrels' shadow on the hull is not baked.
  Ground shadows are separate sprites (hull and turret). Details: `docs/tanks/README.md`.
- **Walkers** (Kodiak, Cougar, Gatling, A.A. Avenger, Achilles): legs + upper body as separate sprites, split at the waist; 32
  directions; 8-frame walk tied to distance travelled, feet planted. They must appear at their true design scale and walk smoothly.
  Draw order: shadows → legs → upper body (+ per-frame offset from `walkers.json`). Blend a unit's shadows with "max".
- **Scale:** tanks and walkers share one scale (28 model units per metre) so their sizes stay true to each other.
- **Damage states:** intact; damaged (≤ 60% HP: soot, dings, cracks, grey smoke); burning (≤ 30%: large black soot areas, cracked
  plates, a few embers, some parts lost, flames, black smoke, speed × 0.65); destroyed → explosion → charred wreck with every glow off
  and no team colour. Burning style: **few orange spots, more black and smoky areas, cracked plates.**
  **This style applies to the walkers too (owner, 2026-11-20):** their current damaged look is not liked; change it to the tank style
  (smoky tint, less orange / fire colour) when they are re-baked.
- **Detail must read at game size:** added detail (pipes and similar) must be big enough to see in an RTS; simple barrels with a
  smaller but more detailed muzzle brake; less detail on Light units.
- Movement: a local path planner (picks a side and holds its lane instead of sliding or zigzagging) plus circle collisions.

## Art style
- **Team colour paints the armour:** clean, saturated paint, every team equally bright (purple softer and lighter, red softer and
  deeper). Units use a muted version (`unitPaint` = saturation × 0.5, lightness × 0.9); team lights = mix(paint, white, 0.5).
  Changing the team colour must visibly change the model.
- Gunmetal for metal parts, a thin dark outline (`#0b0e13`), subtle seeded weathering, sloped armour, glowing team-colour light
  strips and emblems. Fixed (non-team) glows only where they show what a weapon is (Flamer fire, Special energy cyan, walker plasma
  and magma); they go dark on a wreck.
- **No hazard stripes on units.** On buildings only a thin band on blast doors.
- **Buildings:** 4 fixed facings; beveled platform with a plain steel edge; health states intact / ≤ 50% / < 20%; uncaptured =
  neutral grey, lights off, fans stopped; upgrade levels 1–3 add parts with a short effect.
- **Tank factories:** Light (1 line), Medium (up to 2), Heavy (up to 3); the number of active lines is set by the map. Unused gates
  look locked and powered off (padlock, no lights, fan above stopped). Heavy with 1 line uses the centre gate.

## Platforms and packaging
- **Web:** free demo, loose files, no protection.
- **Desktop: Tauri** (not Electron, which was ~250 MB). Builds on Windows.
- **Mobile:** Capacitor (Android, iOS).
- **Desktop asset protection:** assets in a few encrypted packs by content type (units, buildings, fx, core; later patch packs that
  override older ones), all resolutions of a group plus their JSON in the same pack. The app reads files straight from the packs in
  memory; nothing is extracted to disk. Release builds never fall back to loose project files and show an error if the packs are
  missing. Pack extension (`.pak` or `.cab`) is **not decided yet**.

## Not decided yet (ask first)
Pack extension · whether Walkers need Research Points and their speeds · the Walker Factory building · Gatling spin, Achilles strike, spinning radar · for the tank effects (approved, see `docs/tanks/tank-fx-design.md`): whether Anti-Air may hit ground targets, synthesised sounds or WAV files, whether effects are sorted with the tanks, and the real ranges, reload times and damage · the other improvements the owner wants inside the walker models (not listed yet) · how mockups
are shown when a session cannot publish to a design canvas (pictures or a page in the session, or do the mockup in claude.ai).

## Current order of work (owner, 2026-11-20)
1. **Finish the Panzer tanks first:** baked, packed and checked on the PC on 2026-11-20 (`docs/tanks/README.md`). The packed
   sheets live in the repo (owner, 2026-11-21): `docs/tanks/source/sheets/`.
2. **Tank round 2 (Artillery, Anti-Air, Flamer, Special), chosen by the owner:** mockup approved and the 12 models built on
   2026-11-20, models approved by the owner the same day (`docs/tanks/README.md`, "Round 2"). The full bake of the new turrets, turret shadows
   and wrecks ran on 2026-11-20 (2,880 renders), then the pack (all 15 tanks, 46 sheets, 97 MB) and the pack check passed.
   The Flamer and Special firing effects are part of step 3.
3. **Tank effects and sounds before the walkers (owner, 2026-11-21):** design note `docs/tanks/tank-fx-design.md` and a working
   mockup in the tank demo page (firing, hits, damage smoke and flames, explosions, sounds). **Approved by the owner on
   2026-11-21** after several review rounds. Next (only when the owner says so): bake the real `fx` sheet and move the effects and
   sounds into the game.
4. Then the walker changes (re-bake with the new mask method, new damaged look, other improvements).

## References
In this repo:
- `docs/tank-types.md`: the 15 tanks (sizes, the 5 weapon types, what each looks like).
- `docs/walker-types.md`: the 5 walkers (weapons, ranges, roles, modules as built).
- `docs/walkers/`: the walker 3D models (`source/walker_lib.py`, `.blend` scenes, pack tools), renders, and how they are baked
  into sheets and described in `walkers.json`. The sheets themselves are not in the repo yet.
- `docs/tanks/`: the 3D tanks (`README.md` with status and next steps, the design note `tanks-3d-model.md`, `source/` with the
  model, bake, pack, check and mockup tools, `.blend` scenes), the packed sheets (`source/sheets/`), the demo page (`demo/`) and
  the approved effects and sounds design (`tank-fx-design.md`). The bake frames are not in the repo.
- `docs/tanks/vector-viewer/`: the tanks viewer page (all 15 approved vector tanks, 2:1 view): the design reference for the 3D tanks.
- `tools/sprite-pipeline/`: the sprite pipeline prototype (bake, team-colour shader, fx, PixiJS test map, encrypted packs,
  Tauri app). Its models still use the old isometric view; the pack key `pak/secret.txt` is not in the repo.
- `assets/README.md`: the current asset and config format.

In the claude.ai project "State of War Game":
- Design note (rendering, packs, platforms): https://claude.ai/artifact/PC64rsjtPsKykA5zFVADvH
- Sprite pipeline demo (live version of `tools/sprite-pipeline/`): https://claude.ai/artifact/TriW94QXYaamgihcBZM7v9
- Tanks viewer (live version of `docs/tanks/vector-viewer/`): https://claude.ai/artifact/12ezQYv9on3bk22XzjVgAc
- Factories viewer (2:1 view): https://claude.ai/artifact/J5TJ35L7R6Y3gGvo1JQqKE
- Project docs: `art-style-guide.md`, `rendering-design-note.md`, `tanks-3d-model.md`, `walkers-3d-model.md`, `tank-types.md`,
  `robot-types.md`, `tank-units-vector-model.md`
- Work folders on the owner's PC: `StateOfWar-Walkers` (walker model, bake, sheets) and `StateOfWar-Tanks` (work copy of `docs/tanks/source/`, bake output), under
  `C:\Users\khala\Desktop\temp\Game Dev\`.
