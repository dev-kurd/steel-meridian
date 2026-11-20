# Sprite pipeline: vector models → sprite sheets → PixiJS

> **Status (2026-11-20): reference prototype, copied from the "State of War Game" project.** It proves the approved
> rendering plan (baked WebP sheets, @1x/@2x/@4x, PixiJS, the batched team-colour shader, flipbook fx, encrypted desktop
> packs, the Tauri app). Live demo: https://claude.ai/artifact/TriW94QXYaamgihcBZM7v9
>
> - **Old projection:** its models (`src/vector-mini.js`, `src/vector-unit/`) still use true isometric. The game uses the 2:1 view
>   (see `CLAUDE.md`); bake game assets with that projection. The current tank designs are in `docs/tanks/vector-viewer/`.
> - **Pack key:** `pak/secret.txt` is not in the repo. Copy `pak/secret.example.txt` to `pak/secret.txt` and change it before
>   packing or building the desktop app (both read it). Never commit it.
> - Not included: `node_modules/`, `dist/` (built sheets, site and packs), Tauri build output. Run `npm install`, then the commands below.


```
npm install            # @resvg/resvg-js (SVG → PNG), pixi.js (game renderer)
node bake.cjs          # → dist/atlas/<group>@1x|2x|4x.webp (lossless) + .json + manifest.json
VERIFY=1 node bake.cjs # same, and checks every WebP is pixel-identical to the PNG render
node fx.cjs            # → dist/atlas/fx@1x|2x|4x.webp: procedural flames, explosions, muzzle flash (run after bake)
node build-page.cjs    # → dist/site/index.html + dist/site/atlas/*  (test map)
```

## Sprite sheet groups (one file per group per resolution)
| group          | contents                                            |
|----------------|-----------------------------------------------------|
| buildings      | factories, one set for all teams (picture + team mask) |
| tank           | Light Panzer: hull (32 dirs × 3 track frames) + turret (32 dirs), one set for all teams (picture + team mask) |
| tank-dmg       | the same, damaged and burning (damage baked into the paint), team mask |
| tank-common    | charred wreck hull + turret, no team colour |
| fx             | 3 flame loops × 16, big explosion × 24, small × 12, muzzle flash × 6 (additive) |

`manifest.json` lists every file with frames, size and KB. The game loads only the groups a map needs
(buildings + tank + tank-common + fx) and only the resolution the zoom needs.
Edit `GROUPS` in `bake.cjs` to split further (e.g. by unit type: tank-heavy).

## Light Panzer (VectorUnit model)
`src/vector-unit/` holds the panzer model unchanged (`vector-unit.js`, `chassis.js`, `panzer.js`, copied from the Tanks
artifact) plus `unit-models.js`, the bridge to this pipeline: scale 21/64 (same footprint as before, collision radius 11),
outline 0.32, turret anchored below its pivot (`META.pivot`, `pivotOffset(heading)`), muzzle and burn points in `META`
(also written to `manifest.json` under `units.tank`). That engine takes real colours, so `bake.cjs` draws each team-masked
frame three times (grey paint + white lights, no paint + white lights, no paint + no lights) and works out the mask by
subtraction ("derive" groups). Checked: shader result vs a direct render in the same colour differs by < 1/255 on average.

## Team colours (shader + mask)
Groups marked `teamMask: true` in `bake.cjs` are baked once with neutral grey team paint. The image is twice as tall:
the top half is the picture, the bottom half is the mask (red = team paint, green = team lights).
`src/team-batch.js` adds a PixiJS batcher whose shader multiplies the picture by the team colours where the mask says,
and `TeamSprite` carries each sprite's colours in its vertex data, so all teams draw in the same batch:

```js
const s = new TeamColor.TeamSprite(sheet.textures['tankHull_any_f0_t0']);
const c = TeamColor.teamColours('#e08a1e');   // any colour, adjusted by the style-guide rules
s.setTeam(c.paint, c.light);                  // s.setTeam(null) = no team colour (wrecks)
```
Register it before `app.init({ preference: 'webgl', ... })` (the module does this when loaded).
The test map shows the draw calls per frame (4–5 for the whole map) and has colour pickers.

## Files
- `src/vector-mini.js`: stand-in vector engine + models (tank hull/turret, damage, wreck, light factory).
- `bake.cjs`: renders every model × team × facing × frame, packs each group, rasterises with resvg.
- `src/team-batch.js`: team-colour shader, batcher, `TeamSprite`, `teamColours()`.
- `src/page.html`: the PixiJS test map (template): loading, steering, collisions, damage, effects.

## Plugging in your real VectorEngine assets
Replace `VM.view(model, team, facing, frame)` in `bake.cjs` with your asset's `toSVGString()` and add
models/groups for your states (health, captured, upgrade level, animation frames).

## Frame names
`<model>_<team>_f<facing>_t<frame>`, e.g. `tankHull_blue_f3_t1`, `tankHullDmg_any_f12_t0`.

## Layered buildings (demo)
```
node bake-layers.cjs         # light factory as layers: body, team mask, lights, damage 1/2, star, foreground (4 facings) + flat fan/radar parts
node build-building-demo.cjs # → dist/building-demo/index.html (any team colour, captured, health, upgrades, exploded view)
```

## Desktop build (Tauri + encrypted packs)

The desktop app uses Tauri: a small Rust program that shows the game in the system's own web engine
(WebView2 on Windows) and reads the sprite sheets from the encrypted `.pak` files. Installer ≈ 8 MB.

### One-time setup on Windows
1. Install **Node.js** (LTS).
2. Install **Rust** from https://rustup.rs (`rustup-init.exe`, default options). When it asks, let it install the
   **Microsoft C++ Build Tools** ("Desktop development with C++").
3. WebView2 is already part of Windows 10 (updated) and 11.

### Commands (run from this main folder)
```
npm install                 # once: tools for baking
npm run desktop:install     # once: Tauri command-line tool (in desktop/)

npm run build               # optional: re-bake sheets, fx, game page and .pak files (dist/pak is already included)
npm run test:pak            # every packed file byte-identical? wrong key + tampering refused?
npm run test:desktop        # the same checks for the Rust pack reader
npm run desktop:start       # run the game from the packs (first run compiles for a few minutes)
npm run desktop:dist        # build the installers
```

Installers appear in `desktop/src-tauri/target/release/bundle/`:
Windows → `nsis/State of War_0.1.0_x64-setup.exe` and `msi/…msi`; macOS → `dmg/`; Linux → `deb/` and `rpm/`.
Build each on its own system (or with a cloud build service). Unsigned Windows installers show a SmartScreen
warning ("More info" → "Run anyway") until you sign them.

Where the app finds its packs (release builds): the installer's `data` folder, or a `data` folder next to the
program. Without packs the game shows "Game data (.pak files) not found". Running `target/release/state-of-war.exe`
from the build folder works because the build copies the packs to `target/release/data/`.

Other: `node pack.cjs --patch 1 tank@2x.webp` → `dist/pak/patch_001.pak` (add `--from <folder>`).
Format: `pak/pak-format.md`. The key secret is `pak/secret.txt` (packer and app both read it; not in the repo: copy `pak/secret.example.txt` and change it).
App icon: replace `desktop/icon-source.png` (1024×1024) and run `npm run icons --prefix desktop`.
