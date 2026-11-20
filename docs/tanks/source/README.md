# StateOfWar-Tanks — 3D tank models (Blender 5.3)

Model of the three Panzer tanks (Light, Medium, Heavy) for the State of War Game, approved as mockup round 1 on 2026-11-19.
Design note: `claude/tanks-3d-model.md` in the State of War Game project. Mockup canvas: https://claude.ai/artifact/GpQbtjn6pd3wkKC951E7Xg

## Files
| File | What it is |
|---|---|
| `tank_lib.py` | The model: three chassis, the five turrets (`WEAPONS`: panzer, artillery, antiair, flamer, special), layers, damage states, track frames, checks. Source of truth. |
| `sow_common.py` | Code shared by every 3D unit: colours, materials, mesh helpers, lights, the game's camera, render setup. Taken from `walker_lib.py`; one addition: the team-mask render can be made darker (`set_mask_mode(mode, gain)`). |
| `build_tanks.py` | Builds every tank and saves the `.blend` files and `tank_data.json`. |
| `blend/tank_<size>_<weapon>.blend` | One saved scene per tank, ready to open and render (F12): 3 Panzer and the 12 round 2 tanks. |
| `tank_data.json` | Sizes, turret pivot, muzzle points and track numbers per tank, in metres. |
| `checks/` | Check images: all 32 directions per size, damage states. |
| `bake_panzer.bat` | Double-click to bake the Panzer sprites with Blender (no window). Can be stopped and started again. |
| `bake_tanks.py` | The bake: renders every sprite frame into `bake/`. |
| `tools/pack_tanks.py` | Packs `bake/` into the WebP sheets and `tanks.json` for @4x, @2x and @1x. |
| `tools/compose_tanks.py` | Rebuilds tanks from the packed sheets the way the game will (used to check a pack). |
| `tools/check_refs.py`, `tools/check_pack.py` | The pack check: render whole tanks in Blender, rebuild the same tanks from the sheets, compare. |
| `mockup/` | The scripts behind the mockup boards (`mock.py` renders, `prep2.py` and `compose.py` image preparation, `vector-ref/` renders the old vector tank at the same scale). For mockup round 2. |

## Inside each .blend
- Collections: `<size>_hull`, `<size>_panzer_turret`, `env` (three suns, ground shadow catcher, camera), `no_outline` (two stand-ins used only by the bake, hidden: `deck_proxy` and `turret_proxy`).
- Pivots are empties: `<size>_root` → `hull_dir` (turn the hull) and `turret_dir` → `turret` (turn the turret on its own); one empty per wheel.
- Scale: 1 Blender unit = 1 metre = 28 model units. +X is forward, Z is up.
- The camera is the game's 2:1 view. Film is transparent; the ground only catches the shadow.
- Materials are procedural (no image files), so the files have no outside links.
- The scene's custom property `sow_tank` holds the same numbers as `tank_data.json`.

## Rebuild
In Blender 5.3, Scripting tab, Python console:

    exec(open(r"C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks\build_tanks.py").read())
    build_all()

`build_all(['heavy'])` rebuilds one size (Panzer). Weapons are the second argument: `build_all(None, ['flamer'])`. A team colour
can be passed: `build_all(team='#3b82f6')`. From a terminal:

    blender -b --python build_tanks.py -- artillery antiair flamer special      (the 12 round 2 scenes)
    blender -b --python build_tanks.py -- heavy flamer                           (one tank)

`tank_data.json` keeps the tanks that are not rebuilt.

## Useful calls (after `import tank_lib as TL`)
- `T = TL.build_model('heavy')` — a fresh scene with one tank.
- `T.set_dirs(hull, turret)` — directions 0..31 (0 = +x = screen lower-right).
- `TL.apply_damage(0..3)` — intact, damaged, burning, wreck.
- `TL.set_track_frame(T, 0..3)` — the track animation frame.
- `TL.set_layer('all+shadow' | 'hull' | 'turret' | 'shadow')` — what the next render shows.
- `TL.split_check(T)` — hull top and turret bottom against the split plane, in mm (both must be ≤ 0 and ≥ 0).

## Bake the sprites
Double-click `bake_panzer.bat`. It finds Blender 5.x, runs it without a window and writes the frames into `bake/`.
- About 3,120 renders for the three Panzer tanks. `bake/progress.txt` shows how far it is and the time left.
- It can be closed at any time. Start it again and it continues: finished files are skipped.
- `bake/BAKE_DONE` appears when everything is there.
- One size only: `bake_panzer.bat --sizes heavy`. Other options are listed at the top of `bake_tanks.py`.
- If Blender is not found, open the `.bat` in Notepad and put the path of `blender.exe` in the `set "BL=..."` line.

Inside Blender instead (the window is busy until it ends):

    exec(open(r"C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks\bake_tanks.py").read()); bake_all()

What is baked, per size: the hull in 32 directions x 4 track frames x 3 damage states, the turret in 32 directions x 3 states,
the ground shadows of hull and turret, and the wreck in 16 directions. Each hull and turret frame is rendered twice (A and B) for the team colour mask.

How the two layers stay true to the whole tank:
- The hull is rendered with a plain round drum standing in for the turret, so the deck is shaded the same for every turret direction.
- The turret is rendered at its real height with a dark disc standing in for the deck under it.
- The mask render (B) uses a dark red (20% brightness), so paint highlights are not cut off; the packer scales the mask back.

## Pack the sheets
    python tools/pack_tanks.py bake sheets                  (track frames 1-3 stored as small overlays: smallest files)
    python tools/pack_tanks.py bake sheets --tracks full    (every track frame stored as a whole hull)
Needs Python with numpy and Pillow. Output: `sheets/tanks.json` and `sheets/tank-*.webp`. The draw order is described in the `note` field of `tanks.json`.

## Check a pack
    blender -b --python tools/check_refs.py -- --out check_refs          (renders three whole tanks per size)
    blender -b --python tools/check_refs.py -- --weapon flamer --out check_refs_flamer      (another weapon; one folder per weapon)
    python tools/check_pack.py sheets check_refs check_pack.jpg          (compares them with tanks built from the sheets)
    python tools/compose_tanks.py sheets contact.jpg                     (contact sheet built from the sheets)
Expected on the tank's pixels: mean difference 6-9 of 255 (sub-pixel edges and the barrels' shadow on the hull, which is not baked).

## Not here yet
- The bake frames and the packed sheets are on the PC only (ignored by git). The four round 2 weapons were baked with
  `bake_round2.bat` (turrets, turret shadows and wrecks; the hulls come from the Panzer bake), packed and checked on 2026-11-20.
- The `.blend` files were built with Blender's Python module (version 5.3.0) in the cloud and reopened there; they have not been opened in the Blender on this PC yet.
