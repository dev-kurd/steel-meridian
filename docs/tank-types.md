# Tank Types — State of War: Warmonger reference

Source: *State of War: Warmonger* Windows manual (Cypron Studios), "Description of Units → Ground Units", plus the unit icons in that manual.

The manual sorts ground units into 5 main types: Light, Medium, Heavy, Walkers and Rogon Bomb. Light, Medium and Heavy are each divided into 5 units with their own weapons: **Anti-Air, Artillery, Panzer, Flamer and Special**. That makes **15 tank models** (5 types × 3 sizes). Walkers (Kodiak, Cougar, Gatling, A.A. Avenger, Achilles) are legged robots, not tanks (see `walker-types.md`). The Rogon Bomb is a remote-controlled "mobile nuke" vehicle.

## Sizes (one per factory)

| Size | Factory | Manual says | What the icons show |
|---|---|---|---|
| **Light** | Light Factory (speed boosted by Wind Traps) | Very fast, lightly armoured, built quickly | Short, narrow hull on one pair of tracks; small weapon |
| **Medium** | Medium Factory (needs Research Points) | More firepower, thicker armour | Longer hull with round cylinder pods along the sides; bigger weapon |
| **Heavy** | Heavy Factory (needs Research Points) | Very slow, very strong guns, made for attacking buildings | Widest, tallest hull with double-stacked side pods; weapon has multiple barrels or tubes |

Manual rule: bigger means slower but much more firepower. The silhouette gets bigger at each step, and the weapon grows more than the hull.

## The 5 types

### 1. Anti-Air
Protects buildings from the enemy's Advancer and air forces. Lighter units should be used in groups because their armour is weak.
Look: a ribbed rocket-launcher block tilted up toward the sky.
- Light: small pod, about 3 tubes
- Medium: bigger block, about 4 tubes
- Heavy: large block, 5–6 tubes

### 2. Artillery
Best against targets at long range. Very effective against static targets such as turrets, but a poor choice against fast units because of its slow rate of fire.
Look: one long barrel raised at a steep angle.
- Light: thin barrel
- Medium: thicker barrel on a ribbed mount
- Heavy: twin heavy barrels on a big cradle

### 3. Panzer
The main battle tank. Bigger sizes are slower, but firepower increases a lot.
Look: a turret with barrels pointing forward.
- Light: one short barrel
- Medium: two barrels side by side
- Heavy: three long barrels

### 4. Flamer
Short range, so it must get close to its target. Its constant flame does heavy damage to units and buildings.
Look: a short, thick nozzle plus fuel tanks.
As built in 3D (owner, 2026-11-20): a long plain barrel; only the nozzle is a hollow sleeve with round holes cut through it; gas
bottles on the back of the turret; no pipes over the roof or on the barrel.
- Light: small nozzle
- Medium: nozzle with round fuel tanks
- Heavy: big nozzle with a coiled or ribbed fuel drum

### 5. Special
- Light: a laser cannon, shown as a finned, ribbed emitter block
- Medium: more robust armour and a Fusion-Lambda particle cannon that fires through any obstacle, shown as a long ribbed barrel with radiator fins
- Heavy: a Graviton particle launcher, one of the most powerful known weapons, shown as a big ribbed tube on a heavy mount

## Suggested scale (proposal, not from the manual)

The manual gives no dimensions. Proposed relative sizes, keeping one tank well inside one factory gate:

| Size | Length × Width × Hull height (relative) | Speed (relative) |
|---|---|---|
| Light | 1.0 × 0.7 × 0.35 | 1.0 |
| Medium | 1.3 × 0.9 × 0.45 | 0.75 |
| Heavy | 1.6 × 1.15 × 0.55 | 0.5 |

## Modelling notes

- **Chassis:** build 3 shared chassis (Light, Medium, Heavy) and fit 5 weapon modules on each. The original game seems to work this way.
- **Style:** follow the art style guide (see `CLAUDE.md`). Body armour gets the team-colour paint, metal parts are gunmetal, there are no hazard stripes on tanks.
- **Turret and weapon:** model these as a separate part from the hull so the turret can rotate on its own (32 directions, see `CLAUDE.md`).
- **Starting point:** the Light Panzer is the suggested first model for setting up the chassis system.
