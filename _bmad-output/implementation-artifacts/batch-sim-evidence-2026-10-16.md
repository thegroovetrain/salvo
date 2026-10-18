# Weapon balance by math — Story 9.12 paper ledger (2026-10-16)

**NO BATCH SIM WAS RUN THIS CYCLE** (Eric 2026-10-16: staging is the check; the 8-of-16-dead-per-cycle target is judged on the development deploy).

**Source.** `_bmad-output/forge/weapon-balance-math/forged-idea.md` (reasons in its `.memlog.md`), Eric 2026-10-16, built literally as epic-9 amendments 184–185. Every number below is his; nothing here is derived from a sim. Gun numbers are his math, never sim (2026-10-02).

**Macro target (Eric).** About 50 % of captains sunk per ring cycle — 8 of 16 dead in the first 4 minutes. It is the staging check, not a derivation input: contact time per cycle is the one number the math cannot give. The fight-length reasoning assumed about a 50 % fish landing rate and nearly every captain in one ~100 s fight per ring cycle (memlog).

## The x2 rule

Every weapon's own ladder reaches x2 its Tier I output at Tier V, with the derived −5 % per tier reload step counted INSIDE the x2 (Tier V DPS = 2x Tier I with the 0.80 reload factored in, so raw damage carries x1.6). Armor Piercing is a separate x1.5 against no armor on top; its curve `(K−2E)/(K−E)` is bounded under 2 (memlog: reads 1.5 at E = −100), so it is not x2.

## Deck guns (all ranges unchanged)

| Gun | Ladder I → V | Reload | Pool / barrels | DPS I → V |
|---|---|---|---|---|
| Cannon | shell 8/10/11/12/13 | 5.0 → 4.0 s (derived) | two barrels at every tier (no barrel rungs); second turret at III kept | 3.2 → 6.5 (x2.03) |
| Machine gun | magazine 12/15/18/20/23; shot delay 0.30/0.275/0.25/0.225/0.20 s; damage 5 flat | 12.5 → 10.0 s (derived) | one magazine | 3.73 → 7.88 (x2.11); burst 60 → 115 |
| Flak | centre 16/18/20/22/24; blast 50 u fixed; rim = half damage (replaces the flat −10) | 3.5 → 2.8 s (derived) | turrets capped at two (third rung cut) | 4.57 → 8.57 (x1.88) |

Before this cycle (memlog, verified in code): cannon 12/12/15/15/18, barrels 1/2/2/3/3 = 2.4 → 13.5 sustained; machine gun 3.8 → 15.8; flak 5.7 → 18.6; broadside 3.3 → 6.3 (unchanged).

**Range attenuation (new dial `CONFIG.gunAttenuation`, all three guns).** Full damage out to 50 % of the gun's effective range, linear down to 80 % at max range, identical curve on the three. Reward for moving in a bit. Cannon sink time of 250 hp alone: 75 s at I, 32 s at V.

## Pickups

| Weapon | Damage I → V | Pool |
|---|---|---|
| Light torpedo | 80 → 120 | tubes 1/1/2/2/2 |
| Heavy torpedo | 90/101/112/123/135 (light and heavy differ by speed and arc, not damage) | tubes 1/1/2/2/2 |
| Naval mine | 90/101/112/123/135 | 2 → 6 unchanged |
| Captive mine | 90/101/112/123/135 | capped at two (1/1/2/2/2) |
| Supercav (consumable) | 150 | — |
| Broadside | unchanged (3.3 → 6.3) | — |

Max torpedo salvo 240 (360 with Armor Piercing V). Naval-mine pool 6 x 135 = 810 on paper. Reload steps stay as today (derived).

## Duel and dodge-model notes (memlog, quoted)

- Duel model (same class 45 u/s, cannon holds station, perfect hits, 250 hp): closing takes 5.6–11 s and the cannon gets 24–80 free damage, then LOSES every matchup at every tier. If the cannon kites and the closer is only +12.5 u/s faster, closing takes 20–40 s and the cannon WINS at tier V. Equal class + kiting = the closer never arrives.
- Dodge-model matrix (hard-turn offset = 1/2 v w tau^2, footprint / offset hit chance): no triangle with the agreed numbers. Flak (54.5 u footprint) hits 100 % everywhere inside its range and beats both; cannon vs machine gun flips with distance (the MG wins inside ~450 u, the cannon past it); cannon hit chance 27 % at 1000 u against a jinker. Rock-paper-scissors was dropped.
- The machine gun's "medium range" is nominal: its 6.5 u footprint lands 36 % at 500 u and 14 % at 800 u against a jinking target — in practice a knife-range gun.

## Stack math (memlog)

- Weapon V + Armor Piercing V + RELOAD V against a fresh 250/0 hull: 10–15 s with any deck gun.
- Against HULL V + ARMOR V (500/100): 40–54 s for guns, 18–30 s for fish.
- A tier-I attacker against 500/100: 217–330 s (650 s under HUNKER).
- Machine gun time to kill flattens at III–V (34/32/29 s): the kill lands inside the second magazine.
- Rejected: three-tube / three-turret salvos (3 x 120 = 360, 540 with Armor Piercing, one-shots a 500 hp hull); distance-scaled cannon damage; cannon base 6 (flak was 1.9x it) and base 9 (out-DPSes the machine gun with +250 u reach).

## What to watch on staging

1. About 8 of 16 captains gone by 4:00 (the macro target; judged by Eric, not derived).
2. The machine gun as a knife-range gun in practice: does anyone pick it for range?
3. Full-stack time to kill of 10–15 s against an un-upgraded hull: is the snowball acceptable?
4. The flak tongue at the rim: half damage at the edge, plus range attenuation, against a hull skimming the blast.
5. Two cannon shells per click from Tier I and flak clearing mines (the new whole-blast rule): do mine fields still survive a fight?
