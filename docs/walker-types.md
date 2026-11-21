# Walker Types (robots) — State of War: Warmonger reference

Status: **roster from the manual (2026-11-18); look and sprites done in 3D (approved and baked 2026-11-19).**
The built design, models and sprite format are in [`walkers/`](walkers/README.md). This file keeps the
game facts (weapons, ranges, roles) from the manual.

Source: *State of War: Warmonger* Windows manual (Cypron Studios): "Description of Units → Buildings → Walker Factory",
"Ground Units → Walkers", the "Long ranged firearms" tip, and the five Walker unit icons. Lines marked **(proposal)** are not in
the manual (the manual gives no speeds, numbers or exact sizes).

## What the manual says about Walkers as a group
- Made in their own building, the **Walker Factory**. Its icon is a flat, round, ringed pad, not a hangar like the tank factories.
- "Very strong guns and massive armour"; "very powerful against heavy units and buildings"; "high-end war-machines".
  So every Walker is stronger and tougher than a Heavy tank. They are the top tier of ground units, below only the Rogon Bomb's blast.
- There are 5 Walkers, each with its own weapon, the same pattern as the 5 tank types (see `tank-types.md`).
- The manual doesn't say whether Walkers need Research Points. (It says so only for Medium/Heavy factory units.)

## One chassis, five weapons
All five manual icons show the same robot body; only the weapon changes. So Walkers follow the same system as the tanks:
**one shared walker chassis plus one weapon module per type.**

**The look does not follow the manual icons.** The icons show a glossy egg-shaped pod on bird legs. Four vector attempts at that were
rejected, and the owner then chose a reference sheet of chunky humanoid mechs. The built chassis is: two heavy armoured legs, a waist ring,
an armoured cab with an engine pack, and big shoulder blocks that carry the weapon on each arm.

## The five Walkers

| # | Walker | Weapon (manual) | Range (manual) | Good against (manual) | Can't hit |
|---|---|---|---|---|---|
| 1 | **Kodiak** | Double plasma cannon | **Long** | Ground units, turrets, buildings | Air |
| 2 | **Cougar** | Four rapid-firing magma cannons | **Medium** | Everything on the ground. "Very powerful weapons" | Air |
| 3 | **Gatling** | Twin rotary machine guns (Teflon-jacketed high-calibre bullets) | **Long** | Turrets ("the best robot for shredding enemy turrets"), facilities, distant targets | Air |
| 4 | **A.A. Avenger** | Four ground-to-air rockets | Not stated (proposal: long) | Aircraft and Advancers ("heavy damage") | **All ground units** |
| 5 | **Achilles** | Close-combat only (weapon not named) | **Melee**: "no ranged combat capability" | Ground units: destroys any it gets close to "in a matter of moments" | Air, anything it can't reach |

### Power and range (proposal; relative, for game balance)
Range in steps: Melee 1 · Short 2 · Medium 3 · Long 4. On this scale the Panzer tanks are Medium and the Artillery tanks are Long.

| Walker | Range | Damage per second | Rate of fire | Best target | Role in a fight |
|---|---|---|---|---|---|
| Kodiak | 4 (long) | ●●●● | Slow–medium | All-round incl. buildings | Long-range line breaker |
| Cougar | 3 (medium) | ●●●●● | Fast | Units and buildings | Brawler, highest ranged damage |
| Gatling | 4 (long) | ●●●● | Very fast | Turrets, facilities | Siege vs defences |
| A.A. Avenger | 4 (long) | ●●●●● vs air · 0 vs ground | 4-rocket salvo | Aircraft, Advancer | Escort; needs ground cover |
| Achilles | 1 (melee) | ●●●●●● (highest in the game, up close) | Continuous | Ground units | Close-quarters killer |

- **Armour (proposal):** all Walkers share the chassis, so their armour is the same: "massive", above the Heavy tanks.
- **Speed (proposal):** the manual gives none. Suggest 0.7 relative to the Light tank, between Medium (0.75) and Heavy (0.5). Achilles may need
  0.8 to reach its targets. That's a balance call. The baked walk cycle moves 1.6 game units per frame without foot sliding, so the
  speed is set by how fast the frames play.

## Weapon modules as built (2026-11-19)
1. **Kodiak: two plasma cannons.** One boxy cannon on each arm, with glowing cells and a glowing muzzle (fixed blue, the same for every team).
2. **Cougar: four magma barrels.** Two long barrels on each arm, copper heat bands, glowing magma muzzles (fixed orange).
3. **Gatling: two six-barrel rotary guns.** One on each arm: motor drum, six barrels with clamp rings, ammo box. Spin frames are not made yet.
4. **A.A. Avenger: four missiles.** A twin launcher on each shoulder, raised toward the sky (white missiles with red noses), and a
   radar dish on the roof. Arm stubs carry a sensor lens.
5. **Achilles: fists and blades.** Armoured forearms with fists and a large cleaver blade along each forearm. The strike animation is not made yet.

## Style rules as built
- **Projection:** the game's 2:1 dimetric view, 32 directions.
- **Layers:** legs and upper body (cab + weapons) are separate sprites, split at the waist, plus shadows. The upper body turns on its own
  toward the target, like a turret.
- **Paint (scheme A, chosen by the owner):** armour in the muted team `unitPaint`; frame, joints and weapons in steel and dark metal.
  Team light strips = mix(unitPaint, white, 0.5). One sprite + a mask gives every team colour.
- **Walk cycle:** 12 frames (8 until 2026-11-21), feet planted with no sliding, slight bob and sway of the body.
- **Damage (tank style since the re-bake of 2026-11-22):** damaged (soot, dings, cracks), burning (large black soot areas, cracked
  plates, a few embers, some parts lost), wreck (collapsed on folded legs,
  charred, all glows off). Flames and smoke come from the game's fx.
- **No hazard stripes.**
- Walkers are rendered from 3D models in Blender, so the vector-model rules (parts touch and never overlap) do not apply to them.

## Still open
1. Walker Factory model (round ringed pad in the icon). It is a separate building task.
2. Whether Walkers need Research Points, and the speed values. These are game-balance decisions.
3. Firing effects, Gatling spin frames, the Achilles strike, a spinning radar.
