# Steel Meridian assets

All of the game's drawings are here as SVG files, one folder per asset. `game.js` contains no art: it loads these files at
start-up (the list is in `manifest.json`) and draws them. Edit a file and reload the game to see the change. To add an
asset, create its folder and add its name to `manifest.json`.

| Folder | File | What it is |
| --- | --- | --- |
| `buildings/<kind>/` | `model.svg` | 2.5D model of a structure |
| `turrets/<kind>/` | `model.svg` | 2.5D model of a turret, drawn on top of `buildings/pad` |
| `units/<kind>/` | `model.svg` | 2.5D model of a unit (`bt0`…`en2` are the tanks: role + weight class) |
| `units/<kind>/` | `config.json` | the unit's name, description and every stat (see "Unit config" below) |
| `props/<name>/` | `sprite.svg` | rocks and trees; `data-ax`/`data-ay` on `<svg>` is the point that stands on the ground |
| `fx/<name>/` | `sprite.svg` | glows, smoke, dust, mist puffs |
| `flags/<name>/` | `flag.svg` | 72×48 flags; in `team` and `crimson` the classes `tc`, `td`, `tl` take the team's colours |
| `ui/icons/<name>/` | `icon.svg` | button icons |
| `ui/cursors/<name>/` | `cursor.svg` | mouse cursors; `data-hot` is the hot spot |

`buildings/heavy-factory/heavy-factory.js` is different: it is a self-animating SVG model (global `HeavyFactory`, loaded by a
script tag in `index.html`) made for Heavy tank factories. **It is switched off at present** (`HF_USE = false` in `game.js`):
all three factory types use `buildings/factory/model.svg`. When switched on, the game runs it off-screen and copies pictures of it into the map
(ground plate, structure, door leaves). The doors and the tanks are moved by the game itself: the model's own placeholder
tank is not used; the real unit starts inside its bay and drives out through the gate. Light and Medium factories still use `buildings/factory/model.svg`. Its style guide and demo are in `docs/art/`.

Terrain, water and the large clouds are not here: they are textures generated from noise for each map.

## The 2.5D model format

A model is an ordinary SVG drawn **from straight above** (plan view), 1 unit = 1 world pixel, origin at the centre of the
asset, +x pointing the way a unit faces. The game turns it into the 2.5D view by lifting each shape to its height.
Shapes are drawn in file order. Supported elements: `rect` (with `rx`), `circle`, `ellipse`, `polygon`, `polyline`,
`line`, `path`, and `g` with `transform="translate() rotate() scale()"`. Colours and stroke settings must be written on
the shape itself.

Height:

- `data-z="12"`: a flat shape at height 12 (fill and/or stroke).
- `data-z="0;12"`: a solid, extruded from height 0 to 12 (fill only). The lower part is shaded automatically.
- `<g class="solid">`: several shapes treated as one.
- `class="taper"` (rect or circle) with `data-z="6;10"`: a solid that narrows as it rises. `data-taper` gives the top
  outline (`x y width height rx`, or the radius for a circle), `data-top-fill` the colour of the top face.

Special shapes, chosen with `class`:

- `glow`: a circle drawn as a light. `data-glow` is `W` (warm), `R` (red), `O` (fire) or `T` (team: red for enemies).
- `strut`: a `line` from (`x1`,`y1`) at the first height to (`x2`,`y2`) at the second: masts, cables.
- `tube`: the same with a dark outline, and a highlight if `data-lite` is set: gun barrels.
- `disc`: a circle standing upright (road wheels). `billboard`: a polygon standing upright at `data-at="x;y"`.
- `shadow`: drawn in the shadow pass only. `data-shadow="cast"` is smeared by its height `data-z`; `data-shadow="flat"`
  is a plain patch moved by `data-off="dx;dy"` (and by its height, for aircraft).
- `anchor` (with an `id`): not drawn; marks where the game starts an effect (smoke, sparks, the flag).

Animation and state — any of these may hold a small expression instead of a number:

| Attribute | Effect |
| --- | --- |
| `data-if` | draw only when true |
| `data-fill`, `data-stroke` | colour (the plain `fill`/`stroke` is then only the preview shown in an editor) |
| `data-alpha` | opacity |
| `data-rot` | rotation in radians, about the shape's or group's origin |
| `data-move="x;y"`, `data-scale`, `data-lift` | shift, scale, raise a shape or group |
| `data-z`, `data-r` (glow), `data-lw`, `data-dash="a;b"`, `data-dashoffset` | height, radius, line width, dashes |

Expressions may use the functions of `Math` (`sin`, `cos`, `floor`, `PI` …), `t` (time in seconds), `rnd()` and:

- everywhere: `tc.c`, `tc.d`, `tc.l` (team colour: main, dark, light), `team`, `ta` (turret angle)
- structures and turrets: `L` (level), `live`, `wreck`, `alive`, `fort`, `paid` (building something), `turret`,
  `fresh` (reloaded), `ready` (power charged), `firing`, `adv` (Vanguard rebuild progress 0–1, or -1)
- units: `a` (heading), `id`, `odo` (distance travelled), `flash` (>0 while firing), `fs`, `tc.m`, `alt`, `A`, `moving`,
  `busy`, `cap`, `site`, `docked`, `arm`

Structures do not turn, so their shapes need no rotation; a unit's hull goes in `<g data-rot="a">` and its turret in
`<g data-rot="ta">`.

## Unit config

Each unit folder has a `config.json` beside its model. The game has no unit stats of its own: it reads these files at
start-up, so changing a number here and reloading changes the unit. If a file is missing, is not valid JSON or lacks a
required number, the game stops on the loading screen and names the file.

| Field | Meaning |
| --- | --- |
| `name`, `desc` | shown in the game; the English text is also the key for the translations in `lang.js` |
| `hp` | hit points |
| `spd` | speed, world pixels per second |
| `range`, `sight` | weapon range in world pixels; sight in tiles |
| `dmg`, `rof` | damage per shot; seconds between shots |
| `kind` | weapon: `bullet`, `shell`, `missile`, `flak`, `arty`, `laser`, `flame` or `none` |
| `time`, `cost` | seconds to build; price in credits (0 = free) |
| `r` | body radius in world pixels (collision and selection) |
| `tier` | level the building must have to make it (0 if absent) |
| `splash` | blast radius; `bmul`, `airMul`: damage multiplier against structures, against aircraft |
| `noAir`, `airOnly` | cannot hit aircraft; hits aircraft only |
| `air`, `jetp`, `wheeled`, `bot`, `unarmed`, `temp`, `convoy`, `hero`, `demo` | what kind of unit it is, each `true` when it applies |
| `tank`, `role`, `roleName`, `cls` | tanks only: role (`bt`, `ar`, `ad`, `fl`, `en`), the role's name, and class 0 Light, 1 Medium, 2 Heavy |

The first nine rows down to `r` are required. A name or description that is changed here needs the same change to its
key in `lang.js`, or the Kurdish and Arabic text falls back to English.

## Structure and turret config

Structures (`buildings/<kind>/config.json`) and turrets (`turrets/<kind>/config.json`) work the same way as units.

| Structure field | Meaning |
| --- | --- |
| `name` | shown in the game; also the key for its translation in `lang.js` |
| `hp` | hit points at level 1 (each upgrade level adds 25%) |
| `r`, `sight` | footprint radius in world pixels; sight in tiles |
| `def` | Defense points: each takes 1% off incoming damage |
| `height` | roof height in pixels, used to place bars, badges and the Vanguard above it |
| `income` | credits per second it earns |
| `makes` | the units it can build, by folder name (a tank factory's list is set by its production lines) |
| `buildCost`, `needCore` | present if the player can build it: price, and the Command Core level it needs (0 = from the start) |
| `weapon` | the Command Core's own gun: `range`, `dmg`, `rof`, `kind` |

`name`, `hp`, `r`, `sight`, `def` and `height` are required.

| Turret field | Meaning |
| --- | --- |
| `name`, `desc` | shown in the game |
| `hp` | hit points at level 1 (each upgrade level adds 30%) |
| `range`, `minRange` | reach in world pixels, and the dead zone close in |
| `dmg`, `rof`, `kind` | damage per shot, seconds between shots, weapon type (as for units) |
| `cost` | price of the weapon; built on open ground it costs 50 more for the foundation |
| `splash`, `salvo`, `airMul`, `noAir`, `airOnly` | blast radius, shots per salvo, multiplier against aircraft, target limits |
| `def` | Defense points |

`name`, `hp`, `range`, `dmg`, `rof`, `cost`, `kind` and `def` are required. The turret buttons appear in the order the
turrets are listed in `manifest.json`.

Still in `game.js`: upgrade costs and times, the level bonuses and power costs.

## Animation settings and effects

A config may hold an `anim` block of named numbers. The asset's model reads them as `cfg.<name>` in its expressions, so
the speed of a moving part is set in the config and not in the drawing:

```
config.json:   "anim": { "rotorSpeed": 34, "bobSpeed": 3, "bob": 1.5 }
model.svg:     <g data-rot="t*cfg.rotorSpeed">        data-lift="46+sin(t*cfg.bobSpeed+id)*cfg.bob"
```

Speeds are in radians per second for turning parts and cycles of `sin` for swinging, blinking and bobbing ones. To make
another number adjustable, give it a name under `anim` and write `cfg.<name>` in the model where the number was. Every
name a model uses must exist in its config as a number; if one is missing the loading screen stops and names it.

A few settings are read by the game as well as, or instead of, the model:

| Asset | Setting | Used for |
| --- | --- | --- |
| `units/jet`, `units/bomber` | `orbitSpeed`, `orbitRadius` | the circle an idle plane flies |
| `units/adv` | `swaySpeed`, `sway` | how the Vanguard turns from side to side while it hovers |
| `buildings/hq` | `levelHeight` | how much taller the Core counts for each level (bars, the docked Vanguard) |
| `buildings/robot` | `armSpeed`, `armSwing`, `armReach`, `sparkChance` | the arm swing (shared with the model) and the sparks at the arm tips |

A structure's config may also list `effects`. The one type so far is smoke:

```
"effects": [ { "type": "smoke", "at": ["smoke1", "smoke2"], "when": "live",
               "chance": 0.06, "drift": 6, "life": 1.6, "size": 5, "rise": 26, "z": 48 } ]
```

`at` names anchors in the model, `when` is a model state (`live`, `paid` …), `chance` is the chance per frame for each
anchor, `drift` the sideways speed, `life` seconds, `size` pixels, `rise` the upward speed and `z` the starting height.

Not every number in the models has been named: lights that blink at a fixed rate, glow sizes and colours are still
written in the model files.

## Running from disk

A page opened from disk may only read other files when the browser is started with `--allow-file-access-from-files`.
`Play Steel Meridian.bat` and the exe do this. Served over http (a web host, or `npx http-server`) nothing special is needed.
