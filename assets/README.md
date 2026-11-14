# Steel Meridian assets

All of the game's drawings are here as SVG files, one folder per asset. `game.js` contains no art: it loads these files at
start-up (the list is in `manifest.json`) and draws them. Edit a file and reload the game to see the change. To add an
asset, create its folder and add its name to `manifest.json`.

| Folder | File | What it is |
| --- | --- | --- |
| `buildings/<kind>/` | `model.svg` | 2.5D model of a structure |
| `turrets/<kind>/` | `model.svg` | 2.5D model of a turret, drawn on top of `buildings/pad` |
| `units/<kind>/` | `model.svg` | 2.5D model of a unit (`bt0`…`en2` are the tanks: role + weight class) |
| `props/<name>/` | `sprite.svg` | rocks and trees; `data-ax`/`data-ay` on `<svg>` is the point that stands on the ground |
| `fx/<name>/` | `sprite.svg` | glows, smoke, dust, mist puffs |
| `flags/<name>/` | `flag.svg` | 72×48 flags; in `team` and `crimson` the classes `tc`, `td`, `tl` take the team's colours |
| `ui/icons/<name>/` | `icon.svg` | button icons |
| `ui/cursors/<name>/` | `cursor.svg` | mouse cursors; `data-hot` is the hot spot |

`buildings/tank-factories/tank-factories.js` is different: it holds the Light, Medium and Heavy Tank Factories as
self-animating SVG models (global `TankFactories`, loaded by a script tag in `index.html`). The game runs one copy per factory
off-screen and copies pictures of it into the map (ground plate, structure, door leaves). The doors and the tanks are moved by
the game itself: a finished tank is a real unit that starts inside its bay and drives out through its gate. The model draws team
colour, the grey of an uncaptured factory, damage (50% and 20% health) and the upgrade level (stars and bigger fans) by itself.
`buildings/factory/model.svg` is only used if that file fails to load. Style guide and demo: `docs/art/`.

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

## Running from disk

A page opened from disk may only read other files when the browser is started with `--allow-file-access-from-files`.
`Play Steel Meridian.bat` and the exe do this. Served over http (a web host, or `npx http-server`) nothing special is needed.
