# Story 7-5 — The Upgrade Catalog, As It Ships Today

**Purpose:** this is your editing surface for Upgrade Cards v2. Every upgrade line
that exists in the game today is below, with what it does, what it costs, what it
reaches at full stack, and the exact text the player reads. Mark it up however you
like — the `EDIT:` line under each card is there for you, but scribbling anywhere
is fine. When you're done I'll turn your edits into the implementation.

**Generated:** 2026-08-19, from `shared/src/sim/boons.ts` (the catalog) and
`client/src/ui/boonCopy.ts` (the copy layer) at PV 41. Every number in the
`base → max` rows was computed by running the real `effectiveStats()` firewall,
not read off a comment — so these are the values the sim actually produces.

**Scale:** 33 card lines across 9 categories. A Torpedo Boat's deck holds 53
physical cards, a Battleship's 55, a Mine Layer's 58.

---

## How the system works (so edits land legally)

- **A card LINE has physical copies.** `copies` is the stack cap — there is no
  separate cap rule. Five copies of HEAVY SHELLS in the deck means you can hold at
  most five, and each one you fit is drawn out of your own deck permanently.
- **Your deck = universal lines + one subdeck per carried equipment + one
  acquisition card per piece of equipment you do NOT carry.** The three universal
  categories (INTEL, SHIP, GUNS) are in every deck regardless of hull.
- **A level draws 4 different lines.** You bank levels on a 60s wall clock plus 1
  per captain kill; spending picks one card (or heals).
- **Rarity is draw weight, not power.** Commons weight 1. Rares/exclusives escalate
  the longer you go without one (soft pity), resetting when one lands.
- **A card may only do five things** — that is the entire effect vocabulary:
  write a whitelisted stat path (`stat`), set a weapon's doctrine `mode`
  (`doctrine`), fill the empty slot (`slotFill`), swap one equipment for another
  (`slotReplace`), or run a registered per-tick hook (`behavior`). Anything outside
  those five is new engineering, not a catalog edit — flag it and I'll cost it.
  *(Today: 19 lines are pure `stat`, 8 are `doctrine`, 6 are `slotFill`. Nothing in
  the shipped catalog uses `slotReplace` or `behavior` at all — both are built,
  wired, and unused, so a card built on either is cheaper than it looks.)*
- **Catalog content is wire contract.** Any add, delete, or change bumps
  `PROTOCOL_VERSION`.

### The four exclusive pairs (you have ruled these are being REMOVED)

`cannonArcing ⚔ cannonAp` · `torpedoHoming ⚔ torpedoCommand` ·
`mineSelfPropelled ⚔ minePropFouling` · `starIncendiary ⚔ starDazzle`

8 cards, 4 pairs. Note for your editing: a weapon's `mode` field is **single-valued**,
so a surviving pair can't simply have its `exclusiveWith` link deleted — two doctrines
on one weapon have nowhere to both live. That is exactly why your ruling 4 says the
survivors need retooling into standalone added verbs.

### Base weapon numbers (for reference while you edit)

| Equipment | Reload | Damage | Pool | Notes |
|---|---|---|---|---|
| Gun | 5.0s | 15 (burst r15) | 1 | 360°, range = radar range (660u) |
| Cannon | 45.0s | 65 (burst r30) | 1 | 360°, range = radar range |
| Torpedo | 30.0s | 70 | 1 | 60 u/s, ±30° bow arc |
| Mine | 15.0s | 55 (blast r48) | 2 held, 5 live | trip ring 32u (= blast × 2/3) |
| Star Shells | 20.0s | — | 1 | lit r165, 10.0s burn |
| Decoy Buoy | 20.0s | — | 1 | 30.0s lifetime |
| Speed Boost | 18.0s | — | 1 | +10 u/s for 6.0s |

Sensor ladder (all fractions of radar range, which INTEL RANGE scales):
detect 247.5u · sight 330u · muzzle/smoke 412.5u · farRadar 577.5u · radar 660u.

Hulls: Torpedo Boat 125hp / 45 u/s · Mine Layer 150hp / 40 u/s · Battleship 175hp / 35 u/s.

---

# THE UNIVERSAL LINES

*In every player's deck, every hull, every match.*

## GUNS

### 1. `gunDamage` — HEAVY SHELLS Mk I → II → III → IV → V
**common · ×5** · Effect: `gun.damage` **+3** per card
**15 → 30 hp** at full stack
> Card reads: *"Gun damage: 15 → 18."*

> **EDIT:**

### 2. `gunBarrel` — TWIN MOUNT → TRIPLE MOUNT
**rare · ×2** · Effect: `gun.barrels` **+1** per card (clamped 1–3)
**1 → 3 shells per shot.** Every shell bursts at its own point.
> Card reads: *"Shells per shot: 1 → 2. Every shell bursts at its own point."*

> **EDIT:**

### 3. `gunTurret` — AFT TURRET
**rare · ×1** · Effect: `gun.maxAmmo` **+1**
**1 → 2 rounds ready.** (This is the card that retired the single-shot gun pin.)
> Card reads: *"Gun rounds ready: 1 → 2."*

> **EDIT:**

## INTEL

### 4. `intelRange` — IMPROVED OPTICS → HIGH-GAIN ANTENNA → DIRECTOR TOWER → CAVITY MAGNETRON
**common · ×4** · Effect: `radarRange` **×1.15** per card
**660 → 1154.3u radar** at full stack. The whole sensor ladder scales with it:
sight 330 → 577.2, detect 247.5 → 432.9, muzzle/smoke 412.5 → 721.5, farRadar
577.5 → 1010.1. Gun / cannon / star-shell reach and command-detonation reach all
ride radar range too.
> Card reads: *"Radar range: 660 → 759. Sight, gun, cannon and star shells reach with it."*

**Capped at 4 copies deliberately** — it's powerful, and client radar render cost is
quadratic in radar range, so the copy cap is also the frame-cost cap.

> **EDIT:**

### 5. `intelSweep` — UPRATED SWEEP MOTOR Mk I → V
**common · ×5** · Effect: `sweepRpm` **+3** per card
**15 → 30 RPM** (30 is the hard ceiling, so the 5th card lands exactly on it).
> Card reads: *"Radar sweep: 15 RPM → 18 RPM."*

> **EDIT:**

## SHIP

### 6. `shipSpeed` — HULL SCRAPING → NEW SCREWS → ENGINE REFIT → GEARED TURBINES → FLANK SPEED TRIALS
**common · ×5** · Effect: `kinematics.maxSpeed` **×1.05** AND `reverseSpeed` ×1.05 per card

| Hull | Top speed | Reverse |
|---|---|---|
| Torpedo Boat | 45 → 57.4 | 15 → 19.1 |
| Mine Layer | 40 → 51.1 | 14 → 17.9 |
| Battleship | 35 → 44.7 | 9 → 11.5 |

> Card reads: *"Top speed: 45 → 47.3."*

Guardrail: a max-stacked, max-boosted TB (~77.4 u/s) must stay under a max-stacked
torpedo (80 u/s) or torpedoes can never catch anything. Pinned by a test.

> **EDIT:**

### 7. `shipHull` — REINFORCED HULL → ARMOR BELT → TORPEDO BULGE → WATERTIGHT COMPARTMENTS → ARMORED CITADEL
**common · ×5** · Effect: `maxHp` **+20** per card · **heals the delta on grant**

| Hull | Max HP |
|---|---|
| Torpedo Boat | 125 → 225 |
| Mine Layer | 150 → 250 |
| Battleship | 175 → 275 |

> Card reads: *"Max hull: 125 → 145. Repairs the hull it adds."*

**This is the only heal path in the catalog** (separate from the CTRL+E heal choice).

> **EDIT:**

### 8. `shipCooldown` — DRILL SCHEDULE → PRACTICED CREWS → VETERAN RATINGS → BATTLE STATIONS → GUNNERY PENNANT
**common · ×5** · Effect: `cooldownScale` **−0.10** per card (additive, never 0.9^N)
**100% → 50% of base reload**, applied once post-fold to EVERY piece of equipment.
At full stack: gun 5.0s → 2.5s, cannon 45s → 22.5s, torpedo 30s → 15s, mine 15s → 7.5s.
> Card reads: *"All cooldowns: 100% → 90%. Every weapon and ability reloads faster."*

**This one line replaced all seven per-weapon reload ladders.** There is one cooldown
lever, not seven.

> **EDIT:**

---

# THE EQUIPMENT SUBDECKS

*A subdeck joins your deck only when you carry that equipment — either from your
hull's starting fit or by fitting its acquisition card.*

Starting fits: **Torpedo Boat** [gun, torpedo, speed boost, —] ·
**Battleship** [gun, cannon, star shells, —] · **Mine Layer** [gun, mine, decoy buoy, —]

## CANNON — 3 lines *(Battleship's starting fit)*

> **You have ruled the cannon is REMOVED and replaced by a BROADSIDE BARRAGE.**
> All three lines below plus `acquireCannon` go with it — that's the whole subdeck.

### 9. `cannonDamage` — HEAVY CHARGE Mk I → V
**common · ×5** · Effect: `cannon.damage` **+2** per card
**65 → 75 hp** at full stack. (Step is +2 not +3 because +3 would top out at exactly
80 and one-shot an undamaged small drone, which the one-hit-kill law forbids.)
> Card reads: *"Cannon damage: 65 → 67."*

> **EDIT:**

### 10. `cannonArcing` — PLUNGING FIRE ⚔ *(exclusive with ARMOR-PIERCING SHELLS)*
**exclusive · ×1** · Effect: `cannon.mode = 'arcing'`
> Card reads: *"Cannon shells lob over islands and hulls, cannot be intercepted, and burst on your click."*

> **EDIT:**

### 11. `cannonAp` — ARMOR-PIERCING SHELLS ⚔ *(exclusive with PLUNGING FIRE)*
**exclusive · ×1** · Effect: `cannon.mode = 'ap'`
> Card reads: *"Cannon shells stop bursting. A shot pierces up to three hulls: 100/50/25%. Islands stop it."*

Note: AP hardcodes `burstRadius: 0`, which is what killed the old FRAGMENTATION
CASING card (deleted cycle 93 — it multiplied zero by 1.1, five times, silently).

> **EDIT:**

## TORPEDOES — 5 lines *(Torpedo Boat's starting fit)*

### 12. `torpedoDamage` — HEAVY WARHEAD Mk I → V
**common · ×5** · Effect: `torpedo.damage` **+1** per card
**70 → 75 hp**. (Step is only +1 for the same one-hit-kill reason as the cannon —
the base is the ratified number, so the step gives.)
> Card reads: *"Torpedo damage: 70 → 71."*

> **EDIT:**

### 13. `torpedoSpeed` — HIGH-SPEED SETTING → WET-HEATER ENGINE → ENRICHED OXIDIZER → PURE OXYGEN DRIVE
**common · ×4** · Effect: `torpedo.speed` **+5** per card
**60 → 80 u/s.** The 80 endpoint is ratified and load-bearing: it must stay above a
max-stacked, max-boosted Torpedo Boat (~77.4) or torpedoes never catch anyone.
> Card reads: *"Torpedo speed: 60 → 65."*

> **EDIT:**

### 14. `torpedoTube` — SECOND TUBE
**rare · ×1** · Effect: `torpedo.maxAmmo` **+1** · **1 → 2 loaded**
> Card reads: *"Torpedoes loaded: 1 → 2."*

> **EDIT:**

### 15. `torpedoHoming` — ACOUSTIC HOMING ⚔ *(exclusive with COMMAND DETONATION)*
**exclusive · ×1** · Effect: `torpedo.mode = 'homing'`
> Card reads: *"Torpedoes slowly steer to the nearest enemy hull in range. Decoys are ignored."*

> **EDIT:**

### 16. `torpedoCommand` — COMMAND DETONATION ⚔ *(exclusive with ACOUSTIC HOMING)*
**exclusive · ×1** · Effect: `torpedo.mode = 'command'`
> Card reads: *"Click to detonate a torpedo, out to radar range, in a big blast. Contact still hits."*

> **EDIT:**

## MINES — 5 lines *(Mine Layer's starting fit)*

> **You have flagged mines as in scope for change.**

### 17. `mineDamage` — TNT FILLER → AMATOL → TORPEX → MINOL → RDX FILLER
**common · ×5** · Effect: `mine.damage` **+4** per card
**55 → 75 hp** at full stack.
> Card reads: *"Mine damage: 55 → 59."*

> **EDIT:**

### 18. `mineBlast` — BLAST CASING Mk I → V
**common · ×5** · Effect: `mine.blastRadius` **×1.1** per card
**48 → 77.3u blast**, and the trip ring rides it at a fixed 2/3: **32 → 51.5u**.
> Card reads: *"Mine blast radius: 48 → 52.8. The trip ring widens with it."*

This line absorbed the old MAGNETIC → COMBINATION FUZE trigger card (merged cycle 95,
because the separate trigger ladder was ~75% eaten by a clamp on its 5th copy).

> **EDIT:**

### 19. `mineMax` — DECK RACKS → EXTENDED RACKS → MINE RAILS → SPONSON STOWAGE → CONVERTED HOLD
**common · ×5** · Effect: `mine.maxLive` **+1** per card · **5 → 10 live on the board**
(You hold 2 at a time; this is how many can be in the water at once. Global cap 60.)
> Card reads: *"Mines on the board: 5 → 6."*

> **EDIT:**

### 20. `mineSelfPropelled` — SELF-PROPELLED MINES ⚔ *(exclusive with PROP-FOULING)*
**exclusive · ×1** · Effect: `mine.mode = 'selfPropelled'`
Armed mines creep at 14 u/s toward the nearest enemy hull within 150u.
> Card reads: *"Armed mines creep toward the nearest enemy hull in acquisition range."*

> **EDIT:**

### 21. `minePropFouling` — PROP-FOULING MINES ⚔ *(exclusive with SELF-PROPELLED)*
**exclusive · ×1** · Effect: `mine.mode = 'propFouling'`
Hulls in the blast are cut to half speed for 4.0s. **No damage penalty** — the old
×0.6 damage trade was deleted (cycle 95), so this is now a pure add.
> Card reads: *"Mines hit softer, but hulls in the blast are fouled to half speed briefly."*

> ⚠ **The card text is now WRONG** — it still says "hit softer" after the damage
> penalty was removed. Needs fixing regardless of what else you decide here.

> **EDIT:**

## STAR SHELLS — 4 lines *(Battleship's starting fit)*

### 22. `starDuration` — SLOW-BURN COMPOUND Mk I → V
**common · ×5** · Effect: `starShells.litDurationMs` **×1.1** per card
**10.0s → 16.1s burn.**
> Card reads: *"Flare burn time: 10s → 11s."*

> **EDIT:**

### 23. `starRadius` — WIDE BURST Mk I → V
**common · ×5** · Effect: `starShells.litRadius` **×1.1** per card
**165 → 265.7u lit zone.**
> Card reads: *"Lit zone radius: 165 → 181.5."*

> **EDIT:**

### 24. `starIncendiary` — INCENDIARY COMPOUND ⚔ *(exclusive with DAZZLE BURST)*
**exclusive · ×1** · Effect: `starShells.mode = 'incendiary'`
Inner 80% of the lit circle burns for 5 dps while lit.
> Card reads: *"The lit zone burns: a smaller circle scorches every hull but yours inside it, while lit."*

> **EDIT:**

### 25. `starDazzle` — DAZZLE BURST ⚔ *(exclusive with INCENDIARY COMPOUND)*
**exclusive · ×1** · Effect: `starShells.mode = 'dazzle'`
Every hull but yours in the lit zone has true sight cut in half.
> Card reads: *"The lit zone still lights. Every hull but yours inside it is dazzled: true sight cut."*

> **EDIT:**

## SPEED BOOST — 1 line *(Torpedo Boat's starting fit)*

### 26. `boostMax` — CLEAN BOILERS → UPRATED BOILERS → SUPERHEATERS → FORCED DRAUGHT → EMERGENCY POWER
**common · ×5** · Effect: `boost.speedBonus` **+2** per card · **+10 → +20 u/s**
> Card reads: *"Boost speed: 10 → 12."*

**The thinnest subdeck in the game at 1 card.** Base boost is +10 u/s for 6.0s on an
18.0s cooldown. Nothing scales the 6.0s window or the pool independently — only the
speed bonus has a card, and the cooldown rides the universal `shipCooldown` line.
(`boost.durationMs`, `boost.maxAmmo` and `boost.reloadMs` are all whitelisted and
card-ready, they just have no card behind them.)

> **EDIT:**

## DECOY BUOY — 1 line *(Mine Layer's starting fit)*

> **You have flagged the buoy as in scope for change.**

### 27. `decoyDuration` — EXTENDED BATTERY Mk I → V
**common · ×5** · Effect: `decoyBuoy.durationMs` **×1.1** per card
**30.0s → 48.3s lifetime.**
> Card reads: *"Buoy lifetime: 30s → 33s."*

The buoy drops a stationary radar-double. It never moves, so it lays no wake — a
tell that is known and currently unaddressed.

> **EDIT:**

---

# THE ACQUISITION CARDS — 6 lines

*Each fills your one empty 4th slot and shuffles that equipment's whole subdeck into
your deck. All are **rare · ×1**. A hull only sees acquisitions for equipment it does
NOT already carry, so each hull has **4** of these in its deck.*

| # | ID | Card name | Fits | In whose deck |
|---|---|---|---|---|
| 28 | `acquireTorpedo` | TORPEDO TUBES | torpedo | BS, ML |
| 29 | `acquireMine` | MINE RACKS | mine | TB, BS |
| 30 | `acquireStarShells` | STAR SHELL MORTAR | star shells | TB, ML |
| 31 | `acquireCannon` | CANNON | cannon | TB, ML |
| 32 | `acquireDecoy` | DECOY BUOY | decoy buoy | TB, BS |
| 33 | `acquireBoost` | EMERGENCY THROTTLE | speed boost | BS, ML |

> Card reads: *"Fits torpedo tubes to your open slot, loaded. Their upgrade cards join your deck."*

> ⚠ **There is exactly one empty slot, and picking any acquisition purges all the
> others.** So of the 4 acquisitions in your deck, **at most 1 can ever fire** — the
> other 3 are permanently dead weight in the draw pool from that moment on. This is
> a known finding awaiting your ruling.

> **EDIT:**

---

# DECK COMPOSITION

| Hull | Starting fit | Deck size | Subdecks held |
|---|---|---|---|
| Torpedo Boat | gun, torpedo, speed boost | **53 cards** | guns 8, torpedoes 12, boost 5, intel 9, ship 15, +4 acquisitions |
| Battleship | gun, cannon, star shells | **55 cards** | guns 8, cannon 7, star shells 12, intel 9, ship 15, +4 acquisitions |
| Mine Layer | gun, mine, decoy buoy | **58 cards** | guns 8, mines 17, decoy 5, intel 9, ship 15, +4 acquisitions |

Universal floor in every deck: **32 cards** (guns 8 + intel 9 + ship 15).

**Subdeck thickness matters for how fast a doctrine choice arrives.** The cannon
subdeck is the thinnest at 7, so its 2 exclusives are 2/7 of the draws — a Battleship
meets its doctrine fork much sooner than a Mine Layer does at 2/17.

---

# KNOWN DEAD / BROKEN CARDS

The story's acceptance criteria require these be swept. Two of the three original
findings have already been fixed; here is the live state.

| Finding | Status | Detail |
|---|---|---|
| `mineDamage` × `minePropFouling` pick-order dependence | ✅ **FIXED** (cycle 95) | Identical cards gave 53 or 45 hp depending on pick order. The ×0.6 multiplier was deleted. |
| `mineTrigger` 5th copy ~75% clamped away | ✅ **FIXED** (cycle 95) | Card merged into `mineBlast`; trip ring is now a fixed 2/3 of blast and can't be clamped. |
| At most 1 of 6 acquisition cards can ever fire | ❌ **OPEN** | One slot, and picking one purges the rest. 3 of your 4 sit dead in the pool. **Needs your ruling.** |
| `minePropFouling` card text says "hit softer" | ❌ **OPEN** | Copy went stale when the damage penalty was deleted. The card lies to the player today. |
| `cannon.burstRadius` whitelisted with no card | ⚪ By design | Established shape — same as `gun.burstRadius`, `gun.contactDamage`, `cannon.contactDamage`, and all seven `reloadMs` paths. Ready for a future card. |

---

# CONSTRAINTS THAT BOUND ANY EDIT

These aren't preferences — they're pinned by tests and will fail the build.

1. **No single hit may kill the lightest hull outright.** The floor is the 80hp small
   drone. This is what caps the cannon and torpedo damage ladders at 75.
2. **A max-stacked torpedo (80 u/s) must outrun a max-stacked boosted TB (~77.4 u/s).**
3. **The sensor ladder ordering** detect < sight < muzzle/smoke < farRadar < radar holds
   by arithmetic now (every rung is a fixed fraction of radar range), so `intelRange`
   can't break it at any stack level.
4. **Radar sweep hard-caps at 30 RPM.**
5. **Every stat a card touches must be on the `BOON_STAT_PATHS` whitelist** and must
   flow through `effectiveStats()`. Three paths are deliberately NOT addressable
   because they're derived: `sightRange` (= radar/2), `mine.triggerRadius`
   (= blast × 2/3), and the three `rangeU` fields (= radar range).
6. **Catalog content is wire contract** — any change bumps `PROTOCOL_VERSION`.
7. **Card copy has a container-fit budget**: ~90 characters / ~5 wrapped lines for a
   doctrine card. A pinned test fails the build if a rewrite re-inflates one.

---

# WHAT I NEED FROM YOU

Mark up the `EDIT:` lines however you like. The things I specifically can't decide
for you:

- **The BROADSIDE BARRAGE.** What it is mechanically. It'd be the first non-360°
  weapon of the class era — the arc system has no twin-sector shape today, so its
  firing geometry is a design call, not an implementer's pick. Also: does a salvo
  fire as one shot or several, and what does that do to muzzle flash / splash /
  hit-call signals (each shell currently emits its own)?
- **The four exclusive pairs.** Which of the 8 cards survive, and what each survivor
  becomes as a standalone added verb. A weapon's `mode` is single-valued, so two
  survivors on the same weapon need somewhere new to live.
- **Mines and the buoy.** You flagged both; no detail ruled yet.
- **The acquisition dead-card problem.** More slots? Acquisitions don't purge? Fewer
  acquisition lines? Or accept it?
