# Tanks — 3D models rendered to sprites

**Status (2026-11-20): the three Panzer tanks (Light, Medium, Heavy hull + Panzer turret) are modelled and approved. Their sprite
bake is ready but has not been run on the PC yet.** The other four weapon types are not modelled yet.
Roster, weapons and roles: [`../tank-types.md`](../tank-types.md). Rules for every asset: [`../../CLAUDE.md`](../../CLAUDE.md).
Full design note with every decision and measurement: [`tanks-3d-model.md`](tanks-3d-model.md).

![The three Panzer tanks](images/family.jpg)

Damage states (intact, damaged, burning, wreck):

![Damage states](images/damage_states.jpg)

All 32 directions (Heavy; Light and Medium are in `images/`):

![Directions](images/directions_32_heavy.jpg)

Test bake check, 2026-11-20: the whole tank rendered in one piece (left) against the tank rebuilt from the baked sprites (right):

![Bake test](images/bake_test_heavy.jpg)

## What is in this folder

| Path | What it is |
|---|---|
| `tanks-3d-model.md` | The design note: plan, the owner's decisions, the four mockup passes, the built model, the bake (section 18), handover (section 19) |
| `images/` | Renders and checks shown above |
| `source/tank_lib.py` | The model: chassis, Panzer turret, layers, damage, track frames. **Source of truth.** |
| `source/sow_common.py` | Code shared with the walkers (colours, materials, lights, the game's camera, render setup), cut from `walker_lib.py` |
| `source/bake_tanks.py`, `source/bake_panzer.bat` | The bake: renders every sprite frame into `bake/` |
| `source/tools/pack_tanks.py` | Packs `bake/` into WebP sheets + `tanks.json` (@4x, @2x, @1x) |
| `source/tools/compose_tanks.py` | Rebuilds tanks from the sheets the way the game will |
| `source/tools/check_refs.py`, `check_pack.py` | The pack check: whole renders against tanks built from the sheets |
| `source/build_tanks.py`, `source/blend/`, `source/tank_data.json` | Builds and saves the three `.blend` scenes (Blender 5.3); model data in metres |
| `source/mockup/` | The scripts behind the mockup boards, for round 2 |
| `source/README.md` | How to use the files above, command by command |
| `vector-viewer/` | The approved vector tanks (the design reference the 3D models follow) |

**Not in the repo:** the bake frames (`bake/`, 3,120 PNG, ignored by git) and the packed sheets. Where the sheets live is not decided
(the walker sheets are not in the repo either). Work copy of `source/` on the owner's PC:
`C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks` (identical on 2026-11-20).

## How the tanks are made
- Each tank is built by Python in Blender from the same formulas as the vector model, then rendered with Cycles in the game's 2:1 view.
- **Hull and turret are separate sprites**, split by a flat plane at the turret pivot height, 32 directions each.
- **Hull:** 32 directions × 4 track frames × 3 states (intact, damaged, burning). **Turret:** 32 directions × 3 states.
  **Ground shadows:** one for the hull and one for the turret per direction (blend with "max"). **Wreck:** one merged sprite, 16 directions.
- **Team mask:** each hull and turret frame is rendered twice. A = paint black, team lights off. B = paint red, lights green, at 20%
  brightness (`MASK_GAIN = 0.2`). The packer computes the mask as (B − A) / 0.2 and moves the part above 1.0 (paint highlights) into
  the base sprite. The game's colour formula is unchanged (see `CLAUDE.md`).
- **Each layer is rendered with a stand-in for the other** (`tank_lib.turret_proxies`): the hull with a plain round drum where the turret
  stands, so the deck is shaded the same for every turret direction; the turret over a dark disc at deck height. The camera sees
  neither. The tank is never moved for a render (the paint's dust depends on real height); the camera moves instead.
- **Not baked:** the barrels' shadow on the hull (it depends on the turret direction).
- **Track frames at pack time:** `--tracks overlay` (default) stores frame 0 as a whole hull and frames 1–3 as small overlays with only
  the pixels that change; `--tracks full` stores four whole hulls. Estimate for the Panzer set: about 44 MB against 74 MB for all three
  resolutions; @2x alone about 9.5 MB against 17 MB. The game draws hull frame 0, then the overlay.

## Next steps (in this order)
1. **Short test bake on the PC**, to confirm Blender is found, the GPU is used and the time per render. From `source/`:
   `bake_panzer.bat --sizes light --dirs 0 --states 0 --frames 0 --out bake_smoke` (7 renders). Each progress line ends with `[GPU]` or
   `[CPU]`. Neither `bake_panzer.bat` nor the `.blend` files have been run on the PC yet; the scripts were tested with Blender's
   Python module 5.3.0 on a cloud CPU only.
2. **Full Panzer bake:** `bake_panzer.bat` (3,120 renders; about 2 hours if it matches the walkers' 2.2–2.5 s per render on the
   RTX 3060). It can be stopped and started again; `bake/progress.txt` shows progress, `bake/BAKE_DONE` appears at the end.
3. **Pack:** `python tools/pack_tanks.py bake sheets` (Python with numpy and Pillow).
4. **Check:** `check_refs.py` then `check_pack.py` (expected mean difference on the tank 6–9 of 255), and a contact sheet of all 32
   directions with `compose_tanks.py`. Show the owner the result.
5. **Decide with the owner** where the sheets live and which track storage to use (overlay or full).
6. After the Panzer set, ask the owner which comes first:
   - **Mockup round 2:** Artillery, Anti-Air, Flamer and Special on all three sizes (mockup first, then model, then bake).
   - **Walkers:** re-bake with the new mask method, change their damaged look to the tank style (smoky tint, less orange / fire
     colour), plus other improvements the owner wants inside the walker models (not listed yet: ask). See `../walkers/README.md`.

## The owner's notes so far (keep to them)
- Added detail must be big enough to read at game size (thick pipes, for example). Less detail on the Light.
- Simple barrels; a smaller but more detailed muzzle brake (the owner calls it "the nozzle").
- No pipe on top of the Light's body.
- Burning: few orange spots, more black and smoky tinted areas, cracked plates.
- Sprite files must balance quality and size, with the web version in mind.
