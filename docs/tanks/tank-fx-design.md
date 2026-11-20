# Tank effects and sounds: design note

**Status: approved by the owner on 2026-11-21** (the effects and the sounds, as shown in the tank demo). Still open: the points in
section 4. History: first review by the owner on 2026-11-21:
three changes asked for and made (Anti-Air rockets, Artillery shell, Graviton beam), marked "owner" below.
Second review the same day: a new Panzer gun sound (three versions to compare in the demo), a smaller and faster artillery shell
with motion blur, a heavier red Graviton beam with the ball kept cyan, and a reworked ground fire for the Flamer. The mockup is the tank demo page
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
| **Artillery** | Long range, slow fire, best against things that stand still | A shell on a high arc. It **leaves along the barrel** (the barrel's own angle and direction) and bends down to the target; a visible shell that flies nose first, **bigger on a bigger tank**, with a thin smoke trail and a motion-blur streak behind it (owner; the shell was first too large and too slow, then too small, then larger with less blur, then a little smaller again; now a pointed **bullet** 1.1 / 1.3 / 1.55 m long (decided 2026-11-21: bullet; the round sphere that was shown for comparison is removed); the blur streak is short and faint). Its shadow runs on the ground, it whistles down. **Cannot attack at close range** (owner): inside its minimum range, a little under half of its full range, it does not fire and in a battle it ignores the target | small shell, small blast | bigger shell and blast | two barrels, two of the biggest shells a moment apart |
| **Anti-Air** | Protects against aircraft | **Real rockets** (owner): each one is a small rocket body with a red nose that comes out of its own tube along the tube's angle, with a flame behind it; no gun flash. It speeds up, turns towards the target and bursts in the air. White smoke trails. Fires at air targets only | 3 rockets | 4 rockets | 6 rockets |
| **Flamer** | Short range, constant flame, heavy damage | A constant jet of fire while the target is in range; the ground at the end keeps burning for a moment | small jet | longer jet | two nozzles, widest and longest jet |
| **Special** | Energy weapons (fixed cyan glow) | Three different weapons, see below | **Laser** | **Fusion-Lambda** | **Graviton** |

The three Special weapons:
- **Light, laser cannon:** a thin cyan beam with a white core for a fifth of a second. It hits at once. Small cyan burst where it lands.
- **Medium, Fusion-Lambda particle cannon** ("fires through any obstacle"): half a second of charging (cyan sparks pulled into
  the muzzle, a rising whine), then a thick lance that **ends on the target** (owner: it used to run on to the end of its reach and looked like a miss) and goes **through everything on its line** on the way there. Rings
  run along the beam, every tank on the line is hit, strong recoil.
- **All three stand still while they fire** (owner): the Light for the moment its beam is out, the Medium from the start of the
  charge until the lance has faded, the Heavy until its ball has exploded. Hull and turret do not turn, so a beam never
  leaves the barrel at an angle.
- **Heavy, Graviton particle launcher** ("one of the most powerful known weapons"): **a beam and a ball** (owner): a heavy **red** beam
  (a wide soft red glow, a bright red beam and a pale core, with red rings running along it and red sparks jumping off) joins the
  muzzle to the target, and a slow **cyan** ball with a black core rides along it. **The tank stands still and keeps its turret on the target until the ball has exploded** (owner), so the beam never swings away from the barrel. Every beam narrows and fades at both ends and closes in a round glow, so it never stops in a flat cut (owner); where the Graviton beam lands there are sparks and a red glow on the ground. Red is a second fixed weapon colour, used only
  here, so the Graviton cannot be mistaken for the Light's laser. Where the ball
  lands, everything is pulled to one point for half a second (sparks fly inwards, a black sphere grows, the sound is sucked in),
  then the blast: a big cyan burst, two shock rings, debris, a wide scorch mark, the strongest screen shake in the game.

### Demo values (not game balance)

| | Range (m) L / M / H | Reload (s) L / M / H | Shots per trigger | Notes |
|---|---|---|---|---|
| Panzer | 15 / 17 / 19 | 1.3 / 0.8 / 2.8 | 1 / 1 / 3 | shell speed 75 m/s |
| Artillery | 30 / 34 / 38, minimum 13 / 15 / 17 | 3.6 / 4.6 / 5.6 | 1 / 1 / 2 | flight 1.5 to 2.7 s, blast radius 2.2 / 2.8 / 3.2 m |
| Anti-Air | 26 / 28 / 30, minimum 4 | 3 / 3.4 / 4 | 3 / 4 / 6 | rockets 12 to 38 m/s, air targets only |
| Flamer | 7 / 8.5 / 10 | constant | - | damage per second |
| Special | 16 / 21 / 22 (Heavy: minimum 5) | 1.1 / 3.6 / 6.5 | 1 |  Graviton orb 11 m/s, blast radius 4.5 m |

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
- Flame: burning ground (owner: reworked). Each patch is a scorch mark with an orange glow lying on it, a bed of soft
  fire-coloured puffs, two or three wide tongues of flame (the looping flipbook) that die one by one, embers and dark smoke.
- Energy: a cyan burst and cyan sparks.

**Damage states (the approved style: few orange spots, more black and smoky):**
- Damaged: thin grey smoke from one point.
- Burning: two small flames on the hull, thick black smoke from three points, a few embers, a quiet crackle.
- Destroyed: the big fireball, a second smaller blast a moment later, debris, shake, falling-metal sounds; then the wreck with a
  thin thread of dark smoke.

**While driving:** faint dust behind the tracks, engine sound.

**Scorch marks** stay on the ground for about 25 seconds and fade.

### What comes from where

| Part | Where it comes from |
|---|---|
| Flames (3 looks x 16 frames, looping), big explosion (24 frames), small explosion (12), energy burst (12, cyan), muzzle flash (6, fire and cyan) | **The baked `fx` sheet** (since 2026-11-21): `source/sheets/fx@1x`, `@2x`, `@4x.webp` (WebP lossless) + `fx.json`, made by `source/tools/bake_fx.cjs` from noise formulas (the same as `tools/sprite-pipeline/fx.cjs`). Frames are trimmed; 124 frames, 1.9 MB for the three sizes |
| Soft shapes: smoke puff (4), scorch (2), debris (3), glow, ring, spark, beam, dot, rocket, shell | The same `fx` sheet |
| Smoke, sparks, embers, debris, dust, trails, the flame jet, beams, rings | Particles drawn with those pictures (up to 3,500 at once; low-priority ones are skipped first) |

The flame jet is made of soft puffs that grow and cool from yellow to dark red, not of the flame flipbook: a jet has to bend
with the turret and reach a changing distance, which a fixed picture cannot do.

**Draw order:** ground, scorch marks, shadows, tanks, smoke (normal blend), everything that glows (additive). All effects use one
picture, so each of the three layers is one or two draw calls.

**Known limits of the mockup:** effects are always drawn above all tanks (a flame on a tank behind another tank shows through);
the barrels of Artillery and Anti-Air are baked at one angle (30 / 33 / 36 and 38 / 40 / 42 degrees), so shells and rockets start at that angle whatever the range; the
target drones in the battle are plain grey placeholders, not an asset.

## 3. The sounds

The game already has recordings in `sounds/` (all CC0, see `sounds/README.txt`). The mockup uses them where one fits and
synthesises the rest in the browser. The only sound file it adds is the rocket launch recording `sounds/rocket_1.wav` (see the Rocket launch row). Size changes the pitch: Light higher, Heavy lower.

| Sound | Source |
|---|---|
| Panzer gun | **Decided (owner, 2026-11-21): the "recorded mix"**: the game's artillery and explosion recordings (`arty`, `boom`), played faster and cut short, with a sharp crack on top. The first version (`shell_1..3.wav` with a thump) and four synthesised tries were turned down |
| Artillery gun | `arty_1..2.wav` + a deeper thump and a rumbling tail |
| Artillery shell coming down | synthesised falling whistle |
| Artillery shell lands | `boom_1..3.wav` + low thump |
| Rocket launch | **Decided (owner, 2026-11-21): the "Missile"**: a CC0 missile launch recording from OpenGameArt, in the game's sound folder as `sounds/rocket_1.wav` (author and page in `sounds/README.txt`; not named `missile_1.wav`, which the current game would start playing for its missile turret), played a little faster and louder but kept under the burst explosion (owner: the whoosh was hiding the explosion), with a small synthesised pop as the rocket leaves the tube. **Every rocket has its own launch sound**, so a volley of 3, 4 or 6 is heard as a quick row. Turned down: the first synthesised version, a set built from shot and whoosh recordings, the other real rocket and thruster recordings, and a set shaped after the original game's weapon sounds; their files were removed |
| Rocket bursts in the air | **An explosion for every rocket** (owner, 2026-11-21): the game's `boom_1..3.wav` played almost twice as fast and cut short, with a sharp crack and a thump, louder than the launch. When many rockets burst at the same moment, the sound limit below drops the extra ones so it does not turn into noise |
| Shell hits | synthesised clang and thud |
| Flame jet | synthesised roar that runs while any flamer fires (one shared sound, louder with more flamers) |
| Laser | `laser_1.wav` (cut short) + a synthesised zap |
| Fusion-Lambda | synthesised: rising whine while it charges, then a crack with a falling tone and a deep thud |
| Graviton | **Decided (owner, 2026-11-21): the "recorded mix"**, built from the game's recordings like the Panzer gun: `laser_1.wav` at half speed for a heavy beam while the ball flies, a slowed `arty` shot as the kick; on landing a short rising rush, then `bigboom` and `boom` played slow with a deep thump. Turned down: the first, fully synthesised version, and five versions built from 13 more recordings of the same CC0 pack (beam and gravity bomb, zap launcher, heavy zap, charge and EMP, laser rifle); those recordings were removed from the repo again |
| Tank destroyed | `boom` (Heavy: `bigboom`) + low thump + falling-metal clanks |
| Burning tank | synthesised fire crackle |
| Engines | synthesised low rumble (one shared sound, louder with more tanks moving on screen) |

Every sound is placed left or right by where it happens on the screen, and is quieter off screen and when zoomed out. At most
about 28 sounds play at once, and the same sound is not started twice within 35 ms, so 300 tanks do not turn into noise.

## 4. Still open after the approval

The effects and sounds are approved as they are in the demo. These points were not answered and stay open (question 1 is
answered by the approval; the Panzer, Graviton and rocket sounds are decided, see section 3):

1. **The five shot types** (section 1): is each one right, above all the three Special weapons?
2. **Anti-Air against ground targets:** in the mockup it fires at air targets only (the manual says it protects against
   aircraft). Should it also be able to hit tanks or buildings, weakly?
3. ~~Synthesised sounds~~: decided 2026-11-21, **keep them in code for now**: the sounds are mixed from the recordings in
   `sounds/` and synthesised when they play; there is no WAV file per tank sound. This can change later.
4. ~~Artillery shell shape~~: decided 2026-11-21, the **Bullet**.
5. **Screen shake:** keep it (it can be switched off in the demo), and how strong?
6. **Drawing effects in front of and behind tanks:** worth sorting flames and smoke with the tanks in the game, or is "above
   everything" good enough?
7. Which effects need a second look: too big, too small, too bright, too long?

## 5. Next steps (approved, not started)

1. ~~Bake the flipbooks and soft shapes into the real `fx` sheet (three resolutions)~~: done 2026-11-21 (`source/tools/bake_fx.cjs`, `source/sheets/fx.json`); the demo draws from it and switches resolution with the tanks. Not done: the encrypted desktop packs, which do not exist for the tank sheets either yet.
2. Move the effect and sound code from the demo into the game, with the weapon rules from section 1.
3. Set the real ranges, reload times and damage (game balance), which this note does not decide.
