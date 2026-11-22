# Walker effects and sounds: design note

**Status: approved by the owner on 2026-11-22**, as shown in the demo ("approved as it is"). The mockup is the demo
(`../demo/`, start it with `../demo/run_demo.bat`): every effect and sound below can be seen and heard there. The numbers
(ranges, reload times, damage, health, speeds) are **demo values chosen to show the effects, not game balance**.

**Second round: approved by the owner on 2026-11-22** (Kodiak first, then the Cougar and the Achilles together), after several
passes in the demo. The Kodiak fires both arms at once with a long thick bolt; the Cougar fires a dense stream of red laser
balls over the longest range and has more health (it was too much like the Gatling); the Achilles has to come close, hits
harder than any other walker and throws a large red laser ball with each blow. The rows marked "round 2" below describe it.
The Cougar's shot sound and the Achilles' ball sound were chosen by the owner by ear from examples built on the game's
recordings.

**Known mismatch:** the Cougar's muzzles on the model glow orange (magma), while its laser balls are now red. Changing the
model's glow needs a re-bake; it was not asked for.

Based on: `../walker-types.md` (what each walker is and how it shoots), `../tanks/tank-fx-design.md` (the approved tank effects,
whose particles, pictures and sound rules are reused), `../../CLAUDE.md` (fixed glows for walker plasma and magma).

**No new renders were made.** The walker sheets are unchanged. So the Gatling's barrels do not turn, the
Achilles' arms do not swing and the Avenger's radar does not spin; the effects stand in for them (section 4).

## 1. How each walker shoots

One idea per walker, so a player can tell the five apart by the shot alone.

| Walker | The shot | Where it lands |
|---|---|---|
| **Kodiak** (two plasma cannons, long range), round 2 | A short blue glow builds at both muzzles (a quarter of a second), then **both arms fire at the same moment: a double bolt**, each a thick blue bolt with a white core. A blue flash at each muzzle and a recoil of the upper body | Two blue bursts, rings on the ground, blue sparks, dark smoke, scorch marks, a light screen shake |
| **Cougar** (four barrels, the longest range), round 2 | **Dense fire of red laser balls from all four barrels.** Each barrel fires again after 0.1 to 0.15 s, picked anew each time, so the four are out of step with a small gap between them (about 30 balls a second together). Each ball is 0.8 m across with a pale heart and a glow that throbs; no trail (the fire is dense enough to read as a stream). A flash and a red glow at the muzzle | The ball bursts in a small red flash with sparks; some also leave a ring of light and a splash of glowing drops that cool to black |
| **Gatling** (two rotary guns, long range) | The guns spin up for about half a second (a rising whirr), then two streams of thin yellow tracers (about 22 rounds a second), flickering muzzle flashes, empty cases thrown to the side. The guns run down after the last round | Small sparks and dust puffs, spread a little around the target |
| **A.A. Avenger** (four rockets) | The tank Anti-Air rocket, bigger: four rockets leave the shoulder racks one after another along the racks' angle (34 degrees), with a flame and white smoke trails, then turn to the target. **Air targets only** | A burst in the air, as for the tanks |
| **Achilles** (melee), round 2 | It walks up until it **stands against its target** and strikes only then (also in "At the mouse": only when the pointer is right in front of it). It lunges (the upper body jumps forward and slides back) and strikes, the two arms in turn. A bright arc shows where the blade passes. A red glow gathers at the striking fist and **a large red laser ball** (about 1 m) leaves it with the blow. **The hardest hit of all walkers** | Sparks, a flash, flying metal bits, a small screen shake; the ball bursts in a red flash with a ring of light |

All five fire while they walk; the upper body aims on its own. Only the Achilles has to reach its target.

### Demo values (not game balance)

| | Range (m) | Reload (s) | Damage per hit | Notes |
|---|---|---|---|---|
| Kodiak | 24 | 0.3 per double bolt | 38 per bolt (76 for the pair) | bolts 46 m/s, glow before the shot 0.24 s |
| Cougar | 34 | each barrel 0.1 to 0.15 (picked anew after every shot) | 2 per ball | ball 40 m/s; health 420 |
| Gatling | 24 | 0.045 per round | 2.2 | tracer 150 m/s, spin-up 0.45 s, spread 0.7 m |
| A.A. Avenger | 30, minimum 4 | 4 | 16 | 4 rockets, 0.18 s apart, air targets only |
| Achilles | 1.5 beyond the two units' own bodies (× the walker size) | 0.6 per blow | 110 for the blade + 70 for the ball | in a battle it looks for a target up to 45 m away and walks to it |

Walker health in the demo's battle: 260 (Cougar: 420). Walking speed 2 m/s. Both are demo values; the walkers' real speeds are not decided.

## 2. The effects

Everything is drawn with the pictures of the existing `fx` sheet (`../tanks/source/sheets/fx*`), tinted; no new pictures.

- **Plasma (Kodiak):** fixed blue, the same for every team. Bolt = a blue streak with a white core and a glow, drawn 8 m long (the first round: 2.8 m) and about 3.2 times wider than in the first round. Burst = the energy
  burst flipbook tinted blue.
- **Laser balls (Cougar):** fixed red (owner, 2026-11-22; they were orange). Ball = a red glow 0.8 m across with a pale heart, a wider soft glow that throbs, and no trail. Drops = small dots that fall with gravity and cool
  from yellow to dark red.
- **Bullets (Gatling):** pale yellow tracers. Cases = small brass dots that bounce once.
- **Rockets (Avenger):** the tank rocket picture, flame and smoke trail, 1.25 m long.
- **Blade (Achilles):** nine bright streaks along an arc in front of the walker, lit one after another in 0.07 s, so the arc
  sweeps from the striking arm's side across the front. The laser ball is fixed red (0.95 m, its glow throbs), the same for every team.
- **Recoil and lunge:** the upper-body sprite (and its shadow) shifts along the way it faces: back a little for a gun, 0.4 m
  forward for the Achilles' blow.
- **Footsteps:** when a foot lands (walk frames 0 and 6) there are two small dust puffs at that foot.
- **Destroyed:** a bigger explosion than a Heavy tank's, then the wreck (as before).
- **Damage states:** unchanged (smoke, flames, embers at the roof and shoulders).

**Where the shots start:** the muzzle points come from the walker model (`source/walker_lib.py`). They are in `walkers.json` as
`shotPoints` (metres in the upper body's own frame: x forward, y to the side, z up), written by `source/tools/pack.py`.

## 3. The sounds

Mixed in code like the tank sounds (recordings from `sounds/` plus synthesised layers; no new sound files). Approved as they play in the demo.

| Sound | Source |
|---|---|
| Kodiak charge | synthesised: a short rising tone, quiet (round 2) |
| Kodiak shot | round 2, made short for the fast double bolt: `laser_1.wav` played twice a hair apart (one per arm), a falling whine, a short deep punch, a crack and a little fizz |
| Plasma lands | `boom_1..3.wav` played faster and cut short, with a falling tone and a low thump |
| Cougar shot | round 2, **chosen by the owner by ear (2026-11-22, "heavy cannon")**: `shell_*.wav` played faster and cut after 0.12 s, with the `flak_*.wav` crack on top, through a soft overdrive; very short, each of the four barrels at its own pitch. Synthesised attempts were turned down (they sounded like soap bubbles) |
| Magma lands | synthesised: a short hiss and a small thud |
| Gatling rounds | `bullet_1..3.wav` played faster and cut short, with a click |
| Gatling motor | synthesised whirr that runs while any Gatling on screen spins; its pitch rises and falls with the spin |
| Bullet hits | now and then a small ricochet (synthesised) |
| Avenger rockets | the tank rocket launch (`rocket_1.wav`), pitched lower; the air burst as for the tanks |
| Achilles blow | synthesised: a whoosh, then metal on metal and a heavy thud |
| Achilles laser ball | round 2, **chosen by the owner by ear (2026-11-22, "laser hum")**: `laser_1.wav` as it is, half a second from its start, over a short thump from `shell_*.wav` |
| Footstep | synthesised: a low thud |
| Walker destroyed | the Heavy tank's destruction sound |

The limits of the tank sounds apply: at most about 28 sounds at once, and the same sound not twice within 35 ms.

## 4. What the approval covers

The owner approved the mockup as it is (2026-11-22), without changes. That covers the five shots, the sounds and the
stand-ins:

1. **Gatling spin:** the flashes and the whirr stand in for it. No barrel frames were asked for.
2. **Achilles strike:** the lunge and the arc stand in for it. No arm swing animation was asked for.
3. **Spinning radar** on the Avenger: it stays still. No frames were asked for.
4. A walker has no motor hum while it walks, only footsteps.

Real frames for 1 to 3 can still be asked for later; they would need new renders.

Still open, as for the tanks: the real ranges, reload times and damage, and which effects need a second look. They are
decided inside the game.

## 5. Known limits of the demo

- Effects are drawn above all units, as for the tanks (the approved sorting comes when the effects move into the game).
- The shot points ignore the small bob and sway of the upper body while walking (a few centimetres).
- "At the mouse": the Achilles strikes wherever the mouse is, to show the blow; sparks appear only when the mouse is within its
  reach. In a battle it strikes only what it has reached.
- The Avenger's racks are baked at one angle, so the rockets always start at 34 degrees.
