# The demo: one battlefield for every finished part

**One demo for the whole project** (owner, 2026-11-22). Each part of the game is added here when it is built, so sizes, draw
order, team colours, effects and sounds can be judged together before anything moves into the game (`game.js`).
It replaces the tank demo that was in `docs/tanks/demo/`.

**Start it:** double-click `run_demo.bat` (needs Node.js). It opens http://localhost:8765/demo/ and stops an older demo server
that still holds the port. The page must be opened through this server, not as a file.

## What is in it

| Part | State | What the demo shows |
|---|---|---|
| **Tanks** | in (2026-11-20/21) | All 15 tanks from the packed sheets: driving, turrets aiming, damage states, wrecks, team colours, and the approved effects and sounds (`../tanks/tank-fx-design.md`) |
| **Walkers** | in (2026-11-22) | All 5 walkers from the re-baked sheets: 12-frame walk tied to distance walked, 32 directions, the upper body turning on its own, damage states with smoke and flames, wrecks, team colours. In a battle they can be hit and destroyed. **No weapon effects or sounds yet: that is the next step** |
| **Structures** | not built yet | The button is there and switched off |
| **The map** | not built yet | The ground is a plain grid |

The row **Demo** at the top of the settings panel chooses what is on the battlefield: **Tanks**, **Walkers**, **Structures** or
**All**. The other settings (team colour, damage state, number of units, one unit type, zoom, firing, sound, screen shake) work
on whatever is on the field.

All numbers in the demo (speeds, ranges, reload times, damage, health) are **demo values, not game balance**. The walkers'
speeds are not decided.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: PixiJS (WebGL), the team-colour shader in linear light, units, movement, firing, settings |
| `fx.js` | The effects (flipbooks and particles from the `fx` sheet in `../tanks/source/sheets/`) |
| `sfx.js` | The sounds: the game's recordings from `sounds/` plus synthesised layers |
| `serve.cjs` | The local server. It hands out only this folder, the sheet folders and the recordings |
| `run_demo.bat` | Starts the server and opens the page |

Sheets are read where they are packed: `../tanks/source/sheets/` (tanks and fx) and `../walkers/source/sheets/` (walkers).
Nothing is copied into this folder.

## How a new part is added

1. Pack its sheets in its own folder (`docs/<part>/source/sheets/` with a JSON manifest in the same format: `frames`, `sheets`,
   `resolutions`).
2. `serve.cjs`: add the sheets folder to `OPEN`.
3. `index.html`: load the manifest and add it to the shared one (the walker sheets show how: their keys get the prefix `w:`),
   add what the part draws in `parts()`, and switch its button on in the **Demo** row (`setDemo`).
4. Write the part's row in the table above.

## Good to know

- **Download managers** (Internet Download Manager and similar) take over every `.wav` request. The server therefore hands the
  recordings out as `/snd/<name>` with no `.wav` in the address. If the sounds seem "reset" to simple ones, the recordings did not
  load: start `run_demo.bat` again.
- The sounds start after the first click or key (a browser rule).
- For checks from the browser console: `demo.info()`, `demo.setDemo('walkers')`, `demo.run(120)`.
