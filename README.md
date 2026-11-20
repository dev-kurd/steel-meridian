# Steel Meridian

A real-time strategy game for the browser and Windows, with 2.5D vector art, a campaign and skirmish battles.

This repository is private. Do not share its contents outside the team.

## Run the game

**On Windows, from the folder:** double-click `Play Steel Meridian.bat`. It opens the game in its own Microsoft Edge window.

**For development (any browser):** serve the folder over http and open it. With Node.js installed:

```
npx http-server . -p 8377
```

Then open http://localhost:8377. Reload the page to see a change.

Opening `index.html` directly by double-click does not work: a page opened from disk is not allowed to read the `assets` folder.

## What is where

| Path | What it is |
| --- | --- |
| `index.html` | The page: layout and styles |
| `game.js` | All game logic and drawing code |
| `lang.js` | On-screen text in English, Arabic and Kurdish (Sorani) |
| `assets/` | All art, one folder per asset. Start with `assets/README.md` |
| `sounds/` | Sound effects and announcer voice. See `sounds/README.txt` for sources and licences |
| `music/` | Put `theme.mp3` here to replace the built-in score |
| `CLAUDE.md` | The approved art and technology decisions and the working rules. Read it first when working with Claude |
| `docs/art/` | Art style guide and the Heavy Factory demo |
| `docs/tank-types.md`, `docs/walker-types.md` | The unit roster: 15 tanks and 5 walkers, weapons, ranges and roles |
| `docs/tanks/` | The 3D tank models: status and next steps, design note, Blender source, bake and pack tools |
| `docs/walkers/` | The 3D walker models: renders, Blender source, bake and pack tools, sheet format |
| `docs/report/` | Asset inventory report (PDF) and the page it is printed from |
| `tools/` | Build scripts: the Windows exe, the PDF report, the announcer voice |
| `tools/sprite-pipeline/` | The sprite pipeline prototype: bake, team-colour shader, PixiJS test map, encrypted packs, Tauri app |

## For artists

All art is loaded from `assets/` when the game starts; none is in the code. To change an asset, replace its file and reload
the game. To add one, create its folder and add its name to `assets/manifest.json`. The model format is described in
`assets/README.md`, and the list of everything the game needs is in `docs/report/Steel-Meridian-Asset-Report.pdf`.

All art and audio must be original to the team or properly licensed.

## Build the Windows exe

```
powershell -ExecutionPolicy Bypass -File tools/build-exe.ps1
```

The result is `dist/Steel Meridian.exe`. The `dist` folder is not kept in the repository.

## Working together

1. Get the latest version before you start: `git pull`.
2. Work on a branch: `git checkout -b my-change`.
3. Commit, push the branch, and open a pull request on GitHub for someone to review.

Keep `main` playable: run the game and check your change before you push.
