# Tank effects and sounds: design note

**Status (2026-11-21): proposal with a working mockup. Nothing here is approved yet.** The mockup is the tank demo page
(`demo/`, start it with `demo/run_demo.bat`): every effect and sound below can be seen and heard there. The numbers (ranges,
reload times, damage) are **demo values chosen to show the effects, not game balance**.

Based on: `../tank-types.md` (what each tank is and how it shoots), `../../CLAUDE.md` (the approved effects plan: an `fx` sheet
with flipbook flames, explosions and muzzle flash, plus particle smoke and embers, muzzle smoke and a small recoil kick; the
damage states; fixed glows only for Flamer fire and Special cyan).

## 1. How each tank shoots

One idea per weapon type, so a player can tell the five types apart by the shot alone. Size changes how big, how loud and how
many, not what kind.

| Type | Role (from the manual) | The shot | Light | Medium | Heavy |
|---|---|---|---|---|---|
| **Panzer** | Main battle tank | A fast straight shell with a short bright streak | 1 barrel, single shots | 2 barrels, firing in turn, quick | 3 barrels, a salvo of 3 one after another, then a long reload |
| **Artillery** | Long range, slow fire, best against things that stand still | A shell on a high arc; you see it climb, its shadow runs on the ground, it whistles down. Cannot hit close targets (minimum range) | thin barrel, small blast | bigger blast | two barrels, two shells a moment apart |
| **Anti-Air** | Protects against aircraft | Rockets leave the tubes one after another, speed up, turn towards the target and burst in the air. White smoke trails. Fires at air targets only | 3 rockets | 4 rockets | 6 rockets |
| **Flamer** | Short range, constant flame, heavy damage | A constant jet of fire while the target is in range; the ground at the end keeps burning for a moment | small jet | longer jet | two nozzles, widest and longest jet |
| **Special** | Energy weapons (fixed cyan glow) | Three different weapons, see below | **Laser** | **Fusion-Lambda** | **Graviton** |

The three Special weapons:
- **Light, laser cannon:** a thin cyan beam with a white core for a fifth of a second. It hits at once. Small cyan burst where it lands.
- **Medium, Fusion-Lambda particle cannon** ("fires through any obstacle"): half a second of charging (cyan sparks pulled into
  the muzzle, a rising whine), then a thick lance that goes **through everything on its line**, to the end of its reach. Rings
  run along the beam, every tank on the line is hit, strong recoil.
- **Heavy, Graviton particle launcher** ("one of the most powerful known weapons"): a slow cyan orb with a black core. Where it
  lands, everything is pulled to one point for half a second (sparks fly inwards, a black sphere grows, the sound is sucked in),
  then the blast: a big cyan burst, two shock rings, debris, a wide scorch mark, the strongest screen shake in the game.

### Demo values (not game balance)

| | Range (m) L / M / H | Reload (s) L / M / H | Shots per trigger | Notes |
|---|---|---|---|---|
| Panzer | 15 / 17 / 19 | 1.3 / 0.8 / 2.8 | 1 / 1 / 3 | shell speed 75 m/s |
| Artillery | 30 / 34 / 38, minimum 9 | 3.6 / 4.6 / 5.6 | 1 / 1 / 2 | flight 1.5 to 2.7 s, blast radius 2.2 / 2.8 / 3.2 m |
| Anti-Air | 26 / 28 / 30, minimum 4 | 3 / 3.4 / 4 | 3 / 4 / 6 | rockets 12 to 38 m/s, air targets only |
| Flamer | 7 / 8.5 / 10 | constant | - | damage per second |
| Special | 16 / 21 / 22 (Heavy: minimum 5) | 1.1 / 3.6 / 6.5 | 1 | Fusion reach 26 m; Graviton orb 11 m/s, blast radius 4.5 m |

Tank health in the demo's battle: 100 / 180 / 300. The damage states follow the approved rule (damaged at 60% or less, burning at
30% or less, then destroyed).

## 2. The effects

**At the muzzle (every gun):** a flash (flipbook, additive, pointing along the barrel and sized by calibre), a soft glow, a few
puffs of grey muzzle smoke that shoot forward and stop, and a **recoil kick**: the turret jumps back along its barrel and
slides home, the hull follows a little. Artillery also throws a dust ring and dust puffs around the tank. Rockets give a small
flash and smoke out of the back of the launcher. Energy weapons flash cyan and throw a few cyan sparks, no smoke.

**Where a shot lands:**
- Panzer shell: a small explosion (flipbook), sparks that bounce, two smoke puffs, a small scorch mark.
- Artillery shell: the big fireball (flipbook), a flash, a shock ring on the ground, sparks, flying debris, a column of dark
  smoke, a large scorch mark, screen shake.
- Rocket: a burst in the air: small fireball, a ball of grey smoke, sparks.
- Flame: patches of ground fire (the looping flame flipbook) that burn for one to two seconds, each with a scorch mark.
- Energy: a cyan burst and cyan sparks.

**Damage states (the approved style: few orange spots, more black and smoky):**
- Damaged: thin grey smoke from one point.
- Burning: two small flames on the hull, thick black smoke from three points, a few embers, a quiet crackle.
- Destroyed: the big fireball, a second smaller blast a moment later, debris, shake, falling-metal sounds; then the wreck with a
  thin thread of dark smoke.

**While driving:** faint dust behind the tracks, engine sound.

**Scorch marks** stay on the ground for about 25 seconds and fade.

### What comes from where

| Part | In the mockup | In the game (plan) |
|---|---|---|
| Flames (3 looks x 16 frames, looping), big explosion (24 frames), small explosion (12), energy burst (12, cyan), muzzle flash (6, fire and cyan) | Made in the browser when the page opens, with the same noise formulas as `tools/sprite-pipeline/fx.cjs` | Baked once into the `fx` sheet (@1x / @2x / @4x, WebP lossless), as approved |
| Soft shapes: smoke puff (4), scorch (2), debris (3), glow, ring, spark, beam, dot | Same picture, made at page load | Same `fx` sheet |
| Smoke, sparks, embers, debris, dust, trails, the flame jet, beams, rings | Particles (up to 3,500 at once; low-priority ones are skipped first) | The same particle code |

The flame jet is made of soft puffs that grow and cool from yellow to dark red, not of the flame flipbook: a jet has to bend
with the turret and reach a changing distance, which a fixed picture cannot do.

**Draw order:** ground, scorch marks, shadows, tanks, smoke (normal blend), everything that glows (additive). All effects use one
picture, so each of the three layers is one or two draw calls.

**Known limits of the mockup:** effects are always drawn above all tanks (a flame on a tank behind another tank shows through);
the barrels of Artillery and Anti-Air are baked at one angle, so shells and rockets start at that angle whatever the range; the
target drones in the battle are plain grey placeholders, not an asset.

## 3. The sounds

The game already has recordings in `sounds/` (all CC0, see `sounds/README.txt`). The mockup uses them where one fits and
synthesises the rest in the browser, so it adds no sound files. Size changes the pitch: Light higher, Heavy lower.

| Sound | Source in the mockup |
|---|---|
| Panzer gun | `shell_1..3.wav` + a synthesised low thump |
| Artillery gun | `arty_1..2.wav` + a deeper thump and a rumbling tail |
| Artillery shell coming down | synthesised falling whistle |
| Artillery shell lands | `boom_1..3.wav` + low thump |
| Rocket launch | synthesised: a pop and a rising whoosh |
| Rocket bursts in the air | synthesised crack and thump |
| Shell hits | synthesised clang and thud |
| Flame jet | synthesised roar that runs while any flamer fires (one shared sound, louder with more flamers) |
| Laser | `laser_1.wav` (cut short) + a synthesised zap |
| Fusion-Lambda | synthesised: rising whine while it charges, then a crack with a falling tone and a deep thud |
| Graviton | synthesised: a deep swelling hum when fired; on landing a rising rush (the air being sucked in), then a very deep blast |
| Tank destroyed | `boom` (Heavy: `bigboom`) + low thump + falling-metal clanks |
| Burning tank | synthesised fire crackle |
| Engines | synthesised low rumble (one shared sound, louder with more tanks moving on screen) |

Every sound is placed left or right by where it happens on the screen, and is quieter off screen and when zoomed out. At most
about 28 sounds play at once, and the same sound is not started twice within 35 ms, so 300 tanks do not turn into noise.

## 4. Questions for the owner

1. **The five shot types** (section 1): is each one right, above all the three Special weapons?
2. **Anti-Air against ground targets:** in the mockup it fires at air targets only (the manual says it protects against
   aircraft). Should it also be able to hit tanks or buildings, weakly?
3. **Synthesised sounds:** keep them synthesised in the game (no files, easy to tune) or turn the approved ones into WAV files
   in `sounds/` like the others (anyone can then replace a file)?
4. **Screen shake:** keep it (it can be switched off in the demo), and how strong?
5. **Drawing effects in front of and behind tanks:** worth sorting flames and smoke with the tanks in the game, or is "above
   everything" good enough?
6. Which effects need a second look: too big, too small, too bright, too long?

## 5. Next steps after approval

1. Bake the flipbooks and soft shapes into the real `fx` sheet (three resolutions) and add it to the manifest and the packs.
2. Move the effect and sound code from the demo into the game, with the weapon rules from section 1.
3. Set the real ranges, reload times and damage (game balance), which this note does not decide.
