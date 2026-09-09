---
title: 'Catalog v3 — the authored card catalog and the three starter decks'
date: '2026-09-09'
author: 'Eric'
status: 'WALKTHROUGH COMPLETE 2026-09-09 — every line ruled; [DRAFT] cells await the harness; GDD update + E8 stories next'
source: 'Eric spreadsheet, shared 2026-09-09 (screenshot); brainstorming-session-2026-09-04.md; GDD v3 (2026-09-03)'
---

# Catalog v3

Companion to `gdd.md` (GDD open note 12). This is Eric's authored document; the facilitator
transcribes, checks arithmetic, prints the shipped baseline beside each line, and records
rulings. Numbers tagged `[DRAFT]` are first-pass and get tuned by the harness once bots are on
v3 decks. Nothing here invents a mechanic — every open cell is Eric's to fill.

## 1. The sheet (v2, transcribed 2026-09-09 — supersedes the first screenshot of the same day)

Columns: catalog cap (tiers for a ladder / copies for a consumable or add-on), type,
availability (everything is Universal — the catalog is hull-agnostic), then starter copies for
TB · ML · BS.

| # | Card | Cap | Type | TB | ML | BS | Note |
|---|------|-----|------|----|----|----|------|
| 1 | Armor | 4 | Upgrade | 2 | 3 | 4 | |
| 2 | Speed | 4 | Upgrade | 4 | 3 | 2 | |
| 3 | Turning | 4 | Upgrade | 3 | 3 | 2 | |
| 4 | Radar Sweep | 5 | Upgrade | 3 | 3 | 3 | |
| 5 | Reload | 5 | Upgrade | 3 | 3 | 3 | |
| 6 | Hull Repair | 5 | Consumable | 5 | 5 | 5 | |
| 7 | Shield Block | 5 | Consumable | – | – | – | match pool only, for a starter |
| 8 | Smoke Screen | 5 | Consumable | – | – | – | match pool only, for a starter |
| 9 | Chaff | 5 | Consumable | – | – | – | match pool only, for a starter |
| 10 | Deck Gun | 4 | Upgrade | 1 | 1 | 1 | |
| 11 | Deck Gun Turret | 1 | Upgrade | 1 | 1 | 1 | |
| 12 | Deck Gun Barrel | 2 | Upgrade | 2 | 2 | 2 | |
| 13 | Light Torpedo | 5 | Equipment | 5 | – | – | |
| 14 | Heavy Torpedo | 5 | Equipment | 5 | – | – | |
| 15 | Supercavitating Torpedo | 5 | Equipment | – | – | – | |
| 16 | Naval Mines | 5 | Equipment | – | 5 | – | |
| 17 | Captive Mines | 5 | Equipment | – | 5 | – | |
| 18 | Horizontal Missile | 5 | Equipment | – | – | 5 | |
| 19 | Machine Gun | 5 | Equipment | 5 | – | – | |
| 20 | Flak Gun | 5 | Equipment | – | 5 | – | the brainstorm's SHRAPNEL GUN (R2) |
| 21 | Monitor Gun | 5 | Equipment | – | – | 5 | |
| 22 | Acoustic Homing | 1 | Upgrade (add-on) | 1 | – | – | |
| 23 | Fouling Mines | 1 | Upgrade (add-on) | – | 1 | – | |
| 24 | Broadside Gun | 5 | Equipment | – | – | – | |
| 25 | Star Shells | 5 | Equipment | – | – | 5 | |
| 26 | Decoy Buoy | 5 | Consumable | – | – | – | Intercepts missiles/torpedoes |
| 27 | Heat Seeking | 1 | Upgrade (add-on) | – | – | 1 | Missiles seek toward their target, like acoustic homing |
| 28 | Dazzle Shells | 1 | Upgrade (add-on) | – | – | 1 | |
| 29 | Phosphor Shells | 1 | Upgrade (add-on) | – | – | – | unlockable only (sheet v2; sums confirm) |

### Arithmetic (checked)

- Starter totals: TB **40**, ML **40**, BS **40** — all legal.
- Equipment lines per starter: TB 3 (Light Torpedo, Heavy Torpedo, Machine Gun) · ML 3 (Naval
  Mines, Captive Mines, Flak Gun) · BS 3 (Horizontal Missile, Monitor Gun, Star Shells) — all at the ≤ 3 cap.
- Catalog: **29 lines / 114 cards** *(correction of record, gds-gdd update 2026-09-09: the first print said 111, but the components on this very line sum to 114 — 55 + 22 + 7 + 5 + 25 — and so does §1's cap column)* — 11 equipment lines (55), 5 universal ladders (22), deck gun
  3 lines (7), 5 add-ons (5), 5 consumables (25). Breadth target (~100 cards, ~25–30 lines): met.
- Every starter carries the SAME 15 non-equipment universal cards bar the ladder mix: Hull Repair ×5, Deck Gun ×1, Turret ×1, Barrel ×2, Radar Sweep ×3, Reload ×3; the hull's tilt is Armor/Speed/Turning (TB 2/4/3 · ML 3/3/3 · BS 4/2/2) plus its 3 equipment lines and its add-on — TWO for the Battleship (Dazzle Shells + Heat Seeking; the sheet's rows 27–28), which is how BS 23 + 15 + 2 reaches 40 *(correction of record, gds-gdd update 2026-09-09: the first print said "its 1 add-on")*.
- Unhomed at launch: Supercavitating Torpedo, Broadside Gun, Decoy Buoy, Phosphor Shells, and the Shield/Smoke/Chaff consumables — unlockables (or match-pool draws) only.
- Sheet v1 → v2 diff: Hull Repair 2 → 5 on every hull (GDD note 10's ruling is back); Shield Block 2 → 0, Smoke 1 → 0, Chaff 1 → 0; Deck Gun 1 on every hull (was BS only); Dazzle Shells ×1 added to BS.

## 2. Shipped baseline (what the code does today, for editing against facts)

Hulls: TB 250 hp · 45 u/s · 0.8 rad/s turn · 100×9u. ML 300 hp · 40 u/s · 0.6 rad/s · 88×20u. BS 350 hp · 35 u/s · 0.4 rad/s · 124×32u.
Sensor ladder (frozen): detect 247.5 · sight 330 · muzzle/smoke 412.5 · radar 660. Sweep 15 rpm (cap 30).

| Sheet line | Shipped equivalent | Shipped numbers |
|---|---|---|
| Armor | `shipHull` ×4 | +25 maxHp/card (heals on grant) |
| Speed | `shipSpeed` ×4 | +2.5 u/s maxSpeed/card (forward only) |
| Turning | — (no shipped card) | turnRate TB 0.8 / ML 0.6 / BS 0.4 rad/s |
| Radar Sweep | `intelSweep` ×5 | +3 rpm/card, 15 → 30 |
| Reload | `shipCooldown` ×5 | −0.1 cooldownScale/card, 1.0 → 0.5, every reload |
| Hull Repair | DAMAGE CONTROL (`5` rail) | 50 instant + 50 pooled at 5 hp/s = 100 hp |
| Shield Block | — | new |
| Smoke Screen | — (deferred since 07-19) | new |
| Chaff | — | new (jamming buoy's fakes are the nearest shipped mechanism: 10 fakes) |
| Deck Gun | universal gun | 360°, 500 u/s, 1-round pool, 5 s reload, 15 dmg burst r15u, 6 contact, range = radar 660u; no damage/range card shipped |
| Deck Gun Turret | `gunTurret` ×1 | pool 1 → 2 |
| Deck Gun Barrel | `gunBarrel` ×2 | +1 barrel/card (1 → 3), parallel tracks 12u apart |
| Light Torpedo | — | new: side arcs, ~45 kn (brainstorm) |
| Heavy Torpedo | shipped torpedo | bow ±30°, 60 u/s, 50 dmg, 1 fish, 30 s reload; cards were speed +5 ×4, tube +1 ×1, homing |
| Supercavitating Torpedo | — | new: ~200 kn straight-runner (brainstorm) |
| Naval Mines | shipped mine | rear ±60°, place 150u, arm 3 s, trigger 32u / blast 48u, 55 dmg, pool 2, 15 s reload, 5 live; blast card ×1.1 ×4 |
| Captive Mines | shipped `mineCaptive` doctrine | trigger 144u / blast 32u, launches one torpedo at mine dmg |
| Horizontal Missile | — | new: deck canisters, fixed arc, fast, direct (brainstorm) |
| Machine Gun | — | new |
| Flak Gun | — | new |
| Monitor Gun | — | new: one huge slow arcing shell (brainstorm HEAVY GUN) |
| Acoustic Homing | `torpedoHoming` ×1 | turn 0.5 rad/s, acquire 120u, max 1300u |
| Fouling Mines | `minePropFouling` ×1 | ×0.75 both speed caps for 5 s |
| Broadside Gun | shipped broadside | twin sector 90°±60°, 4 turrets, 15 dmg, 18 s reload; spread rung ×4, turrets +1 ×2 |
| Star Shells | shipped | 360°, 20 s reload, lit r165u for 10 s; duration +1.25 s ×4, phosphor (5 dps) ×1, dazzle (×0.5 sight) ×1 |
| Decoy Buoy | — (shipped RADAR buoy is a different thing) | radar buoy: 330u own radar, 20 s life, 50 hp, 30 s reload, +gun / +jamming doctrines |
| Heat Seeking | — | new |
| Speed boost | `speedBoost` equipment → Shift universal (brainstorm) | +10 u/s for 6 s, 18 s reload; duration +1 s ×4, speed +5 ×2 |

## 3. Rulings log (this walkthrough — R-numbers are in order of ruling, not of sheet line; R5 sits last because it was re-cut on sheet v2)

**R1 (Eric, 2026-09-09) — The sheet IS the launch catalog.** Shrapnel Gun (renamed, see R2), Forward Mortar/Hedgehog, Depth Charge, Harpoon and Vertical-Launch Missiles are post-launch candidates, not omissions. The RADAR BUOY is gone entirely — equipment, consumable and its gun/jamming doctrines — replaced by the DECOY BUOY consumable.

**R2 (Eric) — FLAK GUN is the brainstorm's SHRAPNEL GUN renamed** (fragments near hulls, the broadside's family).

**R3 (Eric) — PHOSPHOR and DAZZLE return as 1-copy add-ons** on Star Shells (starter placement: see R5).

**R4 (Eric) — THE MATCH CONSUMABLE POOL (new mechanic, Eric's).** Every match generates a random set of **10 consumable cards**, and the SAME set is shuffled into every player's deck at queue. Eric: *"So someone can assume there might be more heals and shields and shit out there."*
- Deck at queue = **40 authored + 10 match = 50**. The authored deck may carry its own consumables (sheet v2: every starter carries Hull Repair ×5 and nothing else; Shield/Smoke/Chaff/Decoy reach a starter only via the pool); the match pool is EXTRA. GDD note 8's "40" is the AUTHORED size; the legal-deck rules are unchanged.
- Generation: **random, respecting each consumable line's catalog cap** (so a set can never hold more copies of a line than the catalog authors), drawn from the 5 launch consumables. **HIDDEN** — nobody sees the set's composition; players know only that it exists.
- Supersedes: the 09-04 "launch = 3" consumable count (now 5: Hull Repair, Shield Block, Smoke Screen, Chaff, Decoy Buoy; the DAMAGE-REDUCTION BUFF is out) GDD note 10's 5 starter heals STANDS (sheet v2), plus whatever the match pool adds.
- Consequence to carry to the GDD update, not re-derived here: the forge's one-copy appearance figures (66/82/90/97% at 8/12/15/20 picks) were measured against a 40-card deck and are now stale at 50; the draw-pile HUD counter counts 50; the harness must generate the pool per match.
- **R44: the cap bounds the POOL ALONE.** The 10 are drawn respecting caps among themselves; a deck may hold authored copies + pool copies of one line (a starter's 5 Hull Repair plus up to 5 more from the pool). This is what keeps the set identical for everyone.

**R6 (Eric) — TURNING: flat +0.05 rad/s per card, 4 tiers** (+0.2 at the cap: TB 0.8 → 1.0, ML 0.6 → 0.8, BS 0.4 → 0.6). Flat, not proportional — helps the slow hulls most. [DRAFT] until the harness runs.

**R7 (Eric) — SPEED BOOST is the Shift universal ability on every hull, no card; numbers RETUNED** (values: see the Shift boost block in §4).

**Method note (Eric):** *"We need to go line by line so I can share my intent."* Carry-over of shipped values is NOT assumed for any line; each line is walked individually below.

**R10 (Eric) — SPEED: +2.5 u/s per tier, as shipped, 4 tiers, forward only** (+10 at cap: TB 55 / ML 50 / BS 45; reverse untouched).

**R11 (Eric) — RADAR SWEEP: +3 rpm per tier, as shipped, 5 tiers** (15 → 30 rpm at cap; the 30 rpm clamp stays).

**R12 (Eric) — RELOAD (global): −5% per tier, 5 tiers, cap 25%** (cooldownScale 1.0 → 0.75; was −10%/card to 0.5). **Scope (R40): equipment reloads AND the Shift boost cooldown** (20 s → 15 s at cap); consumables have no reload.

**R13 (Eric) — HULL REPAIR: 100 hp as shipped** (50 instant + 50 pooled at 5 hp/s), consumable, cap 5.

**R14 (Eric) — DECK GUN ladder, 4 tiers: +1.25 damage AND −5% own reload per tier.** Damage 15 → 16.25 → 17.5 → 18.75 → 20 (Eric wrote it rounded: 15 → 16 → 17 → 18 → 20); own reload 100% → 95% → 90% → 85% → 80% (additive 5-point steps, not compounding). Since the deck gun is slotless and always fitted, its tier I is a real upgrade (unlike an equipment line, where copy 1 is the weapon itself).

**STANDING RULE (Eric, from R14) — THE EQUIPMENT RELOAD STEP:** *"5% reduced reload will be a thing on most if not all equipment tier levels. This applies BEFORE the global reload reduction."* Composition: `reload = base × (1 − 0.05 × equipmentTier) × (1 − 0.05 × globalReloadTiers)`, so a maxed deck gun under a maxed global Reload runs at 0.80 × 0.75 = **60%** of base. Any line that departs from the 5% step says so in its own block.

**R15 (Eric) — DECK GUN TURRET: pool 1 → 2, as shipped**, 1 copy.

**R16 (Eric) — DECK GUN BARREL: +1 barrel per copy, as shipped**, 2 copies (1 → 3 parallel shells, 12u spacing, full damage each).

**STANDING RULE (Eric) — TIER I IS THE BARE WEAPON.** For every 5-tier equipment line, copy 1 fits the weapon at base and tiers II–V are the four upgrade steps (so the equipment reload step reaches 80% at V, the same four-step shape as the deck gun).

**R17 (Eric) — HEAVY TORPEDO.** Tier I (the weapon): bow arc ±30°, **65 u/s** (was 60), 50 dmg, 1 tube, 30 s reload, no max range. Tiers II–V each: **−5% reload, +5 damage, +2.5 u/s, +0.5 tube** — so II 95% / 55 / 67.5 / 1 tube · III 90% / 60 / 70 / **2 tubes** · IV 85% / 65 / 72.5 / 2 · V 80% (24 s) / **70 dmg / 75 u/s / 3 tubes**.

**STANDING RULE (Eric, from R17) — FRACTIONAL STEPS ACCUMULATE AND FLOOR.** A per-tier step may be fractional on an integer stat (tubes +0.5); the stat shown is `floor(base + step × tiers)`, so nothing appears until the fraction completes a whole. (Applies to any integer stat on any line: tubes, barrels, turrets, live-mine counts.)

**R18 (Eric) — LIGHT TORPEDO.** Tier I: **twin sector, both beams, ±45° about 90°** (90° dead zones fore and aft), 45 u/s, 40 dmg, 1 tube, 25 s reload. Tiers II–V: **same shape as the heavy** (−5% reload, +5 dmg, +2.5 u/s, +0.5 tube) — V: 80% (20 s), 60 dmg, 55 u/s, 3 tubes.

**R19 (Eric) — SUPERCAVITATING TORPEDO.** Tier I: bow ±15°, **195 u/s**, 50 dmg, 1 fish, 45 s reload; a straight-runner (never homes). Tiers II–V: **−5% reload + 5 dmg** only — V: 80% (36 s), 70 dmg; speed and tubes fixed. The launcher-gated consumable version from the brainstorm is NOT on the sheet (R1: the sheet is the launch catalog).

**R20 (Eric) — MACHINE GUN: a HELD-FIRE STREAM at short range.** Click-and-hold inside its arc; a stream of small direct-hit shells (no burst). Tiers II–V: **−5% reload + 1 damage per shell**; range and rate fixed. The illustrative numbers in the option Eric picked (4 dmg every 0.25 s, 250u, 6 s of ammo, 15 s reload, bow arc) are FACILITATOR-PROPOSED [DRAFT] — confirmed or replaced at R21.

**R21 (Eric) — MACHINE GUN arc: bow ±90°, a 180° forward-facing arc.** The other numbers (4 dmg/shell every 0.25 s = 16 dps, 250u range, 6 s of fire per pool, 15 s reload) were not explicitly confirmed and stay FACILITATOR-PROPOSED [DRAFT].

**R23 (Eric) — NAVAL MINES.** Tier I: as shipped (rear ±60°, place 150u, arm 3 s, trigger 32u / blast 48u, 55 dmg, pool 2, 15 s reload) **except the per-player LIVE-MINE CAP IS REMOVED — a mine exists until triggered or destroyed.** Tiers II–V each: **−5% reload, +5 damage, +10% blast (trigger derived at 2/3), +1 mine held** — V: 80% (12 s), 75 dmg, pool 6. **R24: ×1.1 COMPOUNDING, as shipped** — blast 48 → 52.8 → 58.1 → 63.9 → 70.3u; trigger 32 → 46.9u at V. Build consequence to carry, not a design question: `CONFIG.mine.maxLive` (5) and the `addMine` oldest-eviction go; the room-wide `globalCap` (60) is a server-defense guard and needs a ruling at build time on whether it stays as a pure engineering ceiling.

**R25 (Eric) — CAPTIVE MINES tier I: the shipped captive doctrine on the mine's chassis, on a LONGER CLOCK** — trigger 144u / blast 32u, holds one un-upgraded torpedo dealing mine damage (55) at mine blast radius; cannot be self-detonated; fish has no max range; same placement/arm as the naval mine; no live cap (R23). The option's "20 s reload, 1 in the pool" was facilitator-proposed [DRAFT]. Tiers II–V each: **−5% reload, +5 fish damage, +10% trigger ring (×1.1 compounding per R24), +0.5 held** — pool 1 → 2 at III → 3 at V (which confirms the 1-in-the-pool base); V: 80%, 75 dmg fish, trigger 144 → 210.8u.

**R26 (Eric) — FLAK GUN: SUPERSEDED before it was logged.** Eric first picked "air-burst at the click" and then corrected on seeing the numbers: *"I actually think it should fire flak. Like a random spread of shrapnel shells within a spread that gradually widens as it gets further from the ship. Each bit of shrapnel would deal a small amount of damage on hit."* That is CANISTER / GRAPESHOT (a muzzle cone of many small direct-hit projectiles, widening with range), not AA flak (one shell bursting at one fuzed point). **R27 (Eric, after the canister-vs-flak explanation): KEEP THE AIR-BURST.** So the FLAK GUN is one shell to the clicked point bursting in a wide, weak blast that hits hulls AND ordnance; tiers II–V: −5% reload, +2 damage, +10% blast radius (×1.1 compounding) STAND. Base numbers (360°, 500 u/s, 10 dmg in r40u, range 660u, 1 shell, 8 s reload) remain FACILITATOR-PROPOSED [DRAFT], never explicitly confirmed.

**R30 (Eric) — MONITOR GUN.** Tier I: bow ±10°, **ARCING — fires over islands**, normal shell speed (500 u/s), range 660u, 1 shell, **75 dmg, NO burst**, 50 s reload. Tiers II–V: **−5% reload + 5 dmg** — V: 80% (40 s), 95 dmg. Build note: a no-burst plunging shell hits only what is under it at impact, so the hit test is shell-radius-vs-hull at the landing point (the click); the flight is shown as an arc but resolves at the clicked point like the deck gun, and terrain never stops it.

**R31 (Eric) — STAR SHELLS.** Tier I: as shipped (360°, 500 u/s, range 660u, lit r165u for 10 s, 1 flare, 20 s reload). Tiers II–V each: **−5% reload, +2.5 s lit, +10% lit radius (×1.1 compounding), +0.5 shells** (2 at III, 3 at V) — V: 80% (16 s), 20 s lit, r241.6u, 3 flares.

**R32 (Eric) — HEAT SEEKING: the acoustic-homing numbers** (0.5 rad/s, acquire 120u, dies at 1300u) on Horizontal Missiles.

**R33 (Eric) — DAZZLE SHELLS and PHOSPHOR SHELLS: as shipped, and they NEVER change the lit radius — they are effects ADDED to the flare** (×0.5 enemy sight inside the zone; 5 hp/s burn). Both stack on one flare if both cards are held (no exclusivity, per 7-5). **R34: phosphor KEEPS its 0.8× inner burn ring**, as shipped.

**R35 (Eric) — BROADSIDE GUN.** Tier I: as shipped (twin sector 90° ±60°, 4 turrets, 15 dmg burst r15u per shell, 500 u/s, range 412.5u = the 5/8 rung, 18 s reload, mounts ±28° / traverse ±6°, zero overlap). Tiers II–V each: **−5% reload, +1 spread rung (the shipped mount/traverse ladder), +0.5 turret** — 5 turrets at III, 6 at V; V: 80% (14.4 s), mounts ±6° / traverse ±14°, 6 guns.

**R36 (Eric) — DECOY BUOY (consumable, cap 5): homing ordnance RETARGETS onto it, AND it PHYSICALLY BLOCKS anything** — any torpedo or missile that runs into it detonates there, homing or not. **50 hp; lasts until destroyed (no lifetime).** **Drop: astern, within the mine's rear arc (R43).** Build consequence: an undying buoy is a permanent hitbox, so the shipped deck gun / flak burst can clear it and the mine's "exists until destroyed" posture (R23) applies here too.

**R37 (Eric) — SHIELD BLOCK (consumable, cap 5): absorbs the next 100 hp of damage for 10 s**; unused shield expires at 10 s. What it stops beyond weapon damage (storm, phosphor burn): not stated — assumed ALL damage sources [DRAFT, facilitator assumption].

**R38 (Eric) — SMOKE SCREEN (consumable, cap 5): a trail laid astern for 5 s; each puff lasts 30 s, starts at r40u and slowly EXPANDS to r60u.** Blocks SIGHT only (radar unaffected); a hull inside or behind the smoke is not sighted. Whether the puff hides its OWN occupant from truesight as well as what lies behind it: assumed yes (it blocks the LOS segment like an island does for sight) [DRAFT, facilitator assumption].

**R39 (Eric) — CHAFF (consumable, cap 5): bursts at YOUR OWN position** — fake radar returns around you to hide your true echo among them (the brainstorm's fire-to-the-click delivery is NOT taken). **R41: 10 fakes in r120u around you, for 15 s.**

**R28 (Eric) — FOULING MINES: NAVAL MINES ONLY, numbers as shipped** (×0.75 both speed caps for 5 s, refresh not stack); the captive's fish is a torpedo and does not foul.

**R29 (Eric) — HORIZONTAL MISSILE.** Tier I: bow ±50°, 250 u/s, **40 dmg**, flies to the CLICKED point and bursts in **r20u** there; a hull it strikes on the way takes it as a direct hit; 1 missile, 30 s reload. Tiers II–V each: **−5% reload, +5 dmg, +0.5 missile** — V: 80% (24 s), 60 dmg, 3 in the canister. **Range 660u; islands BLOCK it (R42, confirmed)** — it flies flat, unlike the arcing Monitor Gun. Whether the en-route direct hit uses the burst damage or a lower contact figure (the deck gun has a 6-dmg contact rule) is a build-time question.

**R22 (Eric) — ACOUSTIC HOMING: applies to Light AND Heavy torpedoes, numbers as shipped** (0.5 rad/s, acquire 120u, dies at 1300u); the Supercavitating torpedo never homes. One card homes every torpedo you carry.

**R5 (Eric, sheet v2) — DAZZLE SHELLS ×1 enters the Battleship starter; PHOSPHOR SHELLS is an unlockable only.** (Eric first said "both, displacing two"; the v2 sheet shows Dazzle only and sums to 40 only that way — the sheet governs. Flagged once here.)

**R8 (Eric) — ARMOR: +25 max hp per tier, as shipped, 4 tiers** (+100 at cap: TB 350 / ML 400 / BS 450); heal-on-grant stays.

**R9 (Eric) — SHIFT BOOST retune: +25% of the hull's max speed, 10 s active, 20 s reload** (was +10 u/s flat, 6 s, 18 s). Under boost: TB 56.25 · ML 50 · BS 43.75 u/s. Hull-scaled, so the class ordering holds under boost. [DRAFT]

## 4. Per-line stat sheets (consolidated from §3 — the build reference)

Conventions: **tier I of an equipment line is the bare weapon**; tiers II–V are four steps. Every equipment line steps **−5% own reload per tier** (additive 5-point steps: 100 → 95 → 90 → 85 → 80%), composed BEFORE the global Reload ladder (cap 25%), so 0.80 × 0.75 = **60%** at both caps. Fractional integer steps (+0.5 tubes) accumulate and FLOOR. "×1.1" = compounding per tier. `[D]` = [DRAFT]: facilitator-proposed or unconfirmed, harness-tuned.

### Universal ladders (5) and the Shift ability

| Line | Cap | Per tier | At cap | Starter TB/ML/BS |
|---|---|---|---|---|
| ARMOR | 4 | +25 max hp (heals on grant) | TB 350 / ML 400 / BS 450 | 2/3/4 |
| SPEED | 4 | +2.5 u/s forward max (reverse untouched) | TB 55 / ML 50 / BS 45 | 4/3/2 |
| TURNING | 4 | +0.05 rad/s flat `[D]` | TB 1.0 / ML 0.8 / BS 0.6 | 3/3/2 |
| RADAR SWEEP | 5 | +3 rpm | 30 rpm (clamp stays) | 3/3/3 |
| RELOAD | 5 | −5% every equipment reload AND the Shift boost cooldown | 75% | 3/3/3 |
| SHIFT BOOST (ability, no card) | — | +25% of hull max speed, 10 s active, 20 s reload `[D]` | boosted TB 56.25 / ML 50 / BS 43.75; 15 s reload under max Reload | every hull |

### Deck gun (slotless, always fitted)

| Line | Cap | Per tier / copy | At cap | Starter |
|---|---|---|---|---|
| DECK GUN | 4 | +1.25 dmg, −5% own reload (tier I is a real step) | 20 dmg, 80% (4 s; 3 s under max Reload) | 1/1/1 |
| DECK GUN TURRET | 1 | pool 1 → 2 | 2 rounds | 1/1/1 |
| DECK GUN BARREL | 2 | +1 barrel, parallel tracks 12u | 3 shells | 2/2/2 |

Base gun unchanged: 360°, 500 u/s, 15 dmg burst r15u, 6 contact, range 660u, 5 s.

### Equipment lines (11)

| Line | Tier I (the weapon) | Tiers II–V, each | Tier V | Starter |
|---|---|---|---|---|
| LIGHT TORPEDO | twin sector both beams ±45° about 90°, 45 u/s, 40 dmg, 1 tube, 25 s, no max range | −5% reload, +5 dmg, +2.5 u/s, +0.5 tube | 20 s, 60 dmg, 55 u/s, 3 tubes | TB 5 |
| HEAVY TORPEDO | bow ±30°, **65 u/s**, 50 dmg, 1 tube, 30 s, no max range | −5% reload, +5 dmg, +2.5 u/s, +0.5 tube | 24 s, 70 dmg, 75 u/s, 3 tubes | TB 5 |
| SUPERCAVITATING TORPEDO | bow ±15°, 195 u/s, 50 dmg, 1 fish, 45 s; straight-runner, never homes | −5% reload, +5 dmg | 36 s, 70 dmg | — |
| NAVAL MINES | rear ±60°, place 150u, arm 3 s, trigger 32u / blast 48u, 55 dmg, pool 2, 15 s; **NO live cap** — exists until triggered or destroyed | −5% reload, +5 dmg, ×1.1 blast (trigger = 2/3 blast), +1 held | 12 s, 75 dmg, blast 70.3u / trigger 46.9u, pool 6 | ML 5 |
| CAPTIVE MINES | mine chassis, trigger 144u / blast 32u, one un-upgraded fish at mine dmg (55), no self-detonate, no max range; pool 1, 20 s `[D]`; no live cap | −5% reload, +5 fish dmg, ×1.1 trigger ring, +0.5 held | 16 s, 75 dmg fish, trigger 210.8u, pool 3 | ML 5 |
| HORIZONTAL MISSILE | bow ±50°, 250 u/s, 40 dmg, bursts r20u at the click (en-route hull = direct hit), range 660u, islands block, 1 missile, 30 s | −5% reload, +5 dmg, +0.5 missile | 24 s, 60 dmg, 3 missiles | BS 5 |
| MACHINE GUN | held-fire stream, bow ±90° (180° forward); 4 dmg/shell every 0.25 s, 250u, 6 s of fire per pool, 15 s reload — all but the arc `[D]` | −5% reload, +1 dmg/shell | 12 s, 8 dmg/shell (32 dps `[D]`) | TB 5 |
| FLAK GUN | air-burst at the click, wide weak blast, hits hulls AND ordnance; 360°, 500 u/s, 10 dmg in r40u, 660u, 1 shell, 8 s — numbers `[D]` | −5% reload, +2 dmg, ×1.1 blast | 6.4 s, 18 dmg, r58.6u `[D]` | ML 5 |
| MONITOR GUN | bow ±10°, ARCING (over islands), 500 u/s, 660u, 75 dmg, NO burst (hits what is under it at the click), 1 shell, 50 s | −5% reload, +5 dmg | 40 s, 95 dmg | BS 5 |
| BROADSIDE GUN | as shipped: twin sector 90° ±60°, 4 turrets, 15 dmg r15u each, 500 u/s, 412.5u, 18 s, mounts ±28° / traverse ±6° | −5% reload, +1 spread rung, +0.5 turret | 14.4 s, mounts ±6° / traverse ±14°, 6 turrets | — |
| STAR SHELLS | as shipped: 360°, 500 u/s, 660u, lit r165u for 10 s, 1 flare, 20 s | −5% reload, +2.5 s lit, ×1.1 lit radius, +0.5 flare | 16 s, 20 s lit, r241.6u, 3 flares | BS 5 |

### Add-ons (5, one copy each)

| Add-on | Effect | Applies to | Starter |
|---|---|---|---|
| ACOUSTIC HOMING | 0.5 rad/s steer, acquire 120u, dies at 1300u (as shipped) | Light + Heavy torpedoes (never Supercavitating) | TB 1 |
| FOULING MINES | victim ×0.75 both speed caps for 5 s, refresh not stack (as shipped) | Naval Mines ONLY (not the captive's fish) | ML 1 |
| HEAT SEEKING | the acoustic-homing numbers | Horizontal Missiles | BS 1 |
| DAZZLE SHELLS | enemies inside the lit zone: sight ×0.5 (as shipped); never changes the lit radius | Star Shells | BS 1 |
| PHOSPHOR SHELLS | 5 hp/s burn on non-owner hulls inside 0.8× the lit radius (as shipped); never changes the lit radius | Star Shells | — |

Dazzle + Phosphor stack on one flare (no exclusivity).

### Consumables (5, cap 5 each; no reload; fired on `1`–`4`)

| Consumable | Effect | Starter |
|---|---|---|
| HULL REPAIR | 50 hp instant + 50 hp pooled at 5 hp/s (100 total), as shipped DAMAGE CONTROL | 5/5/5 |
| SHIELD BLOCK | absorbs the next 100 hp of damage for 10 s; unused expires. All damage sources `[D]` | — |
| SMOKE SCREEN | trail astern laid for 5 s; each puff lives 30 s, r40u expanding slowly to r60u; blocks SIGHT only, radar unaffected. Hides its occupant as well as what lies behind `[D]` | — |
| CHAFF | bursts at YOUR position: 10 fake radar returns in r120u for 15 s | — |
| DECOY BUOY | dropped astern in the mine's rear arc; 50 hp; lasts until destroyed; homing ordnance retargets onto it AND it physically blocks any torpedo/missile that runs into it | — |

**THE MATCH CONSUMABLE POOL (R4/R44):** every match rolls 10 consumables at random, respecting each line's cap within the pool alone, hidden from everyone, and shuffles the SAME 10 into every deck. Deck at queue = 40 authored + 10 = 50.

## 5. Carried forward (not decided here)

**To the GDD update (`gds-gdd`, closes open note 12):** the match consumable pool (deck at queue is 50; the forge's one-copy appearance figures are stale; the draw-pile counter counts 50); launch consumables are 5 (DR buff out); note 10's 5 starter heals stands; the 09-04 structural rulings still unrecorded (Shift boost universal at the R9 numbers, radar buoy DELETED, Light/Heavy/Supercavitating split, wake drafting, shoot-any-spotted-mine, missiles); the compass veto reading (three torpedo LINES, one design per slot — consistent with note 17); no live-mine cap; the retuned global Reload (25% cap). Open note 11's intent number can now be set: the catalog is **29 lines**.

**Build-time consequences ledgered (E8 stories, not design questions):** `CONFIG.mine.maxLive` and `addMine`'s oldest-eviction go — whether the room-wide `globalCap` (60) survives as a pure engineering ceiling needs a call; the radar buoy equipment and its gun/jamming doctrines are deleted (the jamming fake-blip machinery is REUSED by CHAFF); the Monitor Gun's no-burst plunging hit test; the missile's en-route direct-hit damage (burst figure vs a lower contact figure); `cooldownScale` floor moves from 0.1 to 0.75 by construction; every `[D]` above is a CONFIG dial the harness tunes once bots run v3 decks.

**Still [DRAFT]:** Turning step; Shift boost numbers; Machine Gun numbers bar the arc; Flak Gun base numbers; Captive Mines' pool 1 / 20 s; Shield Block's damage-source scope; Smoke's self-hiding; the unlock economy's flat price (note 11).
