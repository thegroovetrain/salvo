---
title: 'Story 7-5: Upgrade Cards v2'
type: 'feature'
created: '2026-08-19'
status: 'done'
baseline_revision: '60db0b2'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/7-5-decks.md'
warnings: ['oversized', 'multiple-goals']
---

<intent-contract>

## Intent

**Problem:** The shipped catalog has dead cards, four mutually-exclusive doctrine pairs that
force either/or choices Eric no longer wants, and a cannon he has ruled out of the game. Beta
must launch on a catalog where every card adds something and no card is dead.

**Approach:** Replace the catalog wholesale with Eric's stated design (`7-5-decks.md`, authored
2026-08-19, clarified through eight answered questions the same day). 33 card lines become 23 +
6 acquisitions. Exclusivity is deleted everywhere. Three equipment systems are replaced or
reworked: the cannon becomes the BROADSIDE BARRAGE, the decoy buoy becomes the RADAR BUOY, and
mines gain CAPTIVE MINES as a fundamental re-arm. One new cross-system mechanic: your own star
shell's lit region extends your GUN's reach.

**THE PLAN IS ERIC'S AND IS STATED IN FULL.** `7-5-decks.md` is the source of truth for content;
this spec is the engineering projection of it. Where this spec names a number Eric did not state,
it is marked **[DRAFT]** and is an implementer handwave inside his ratified shape, to be tuned.
An implementer may not invent mechanics — only fill drafted scalars.

## Boundaries & Constraints

**Always:** Every stat change flows through `effectiveStats()` and `BOON_STAT_PATHS` — no ad-hoc
derivation anywhere. `PROTOCOL_VERSION` bumps (catalog content IS wire contract). Deck/offer
tests are updated, not deleted. Complexity ≤ 10. One PR. Both tracker files advance in it.

**Block If:** any task requires inventing a mechanic Eric has not stated; the radar buoy's relay
cannot be built without leaking non-observed information through `frames.ts`; the damage
guardrail (no single hit kills the 80hp floor hull) would break.

## Ratified content (Eric, 2026-08-19)

23 card lines + 6 acquisitions. Every equipment subdeck is exactly 6 cards; every hull's deck is
41 (25 universal + 6 + 6 + 4 acquisitions), down from 53/55/58.

### Universal — SHIP/INTEL (5) + GUNS (2) = 25 cards
| Line | Copies | Effect | Base → max |
|---|---|---|---|
| HULL I–IV | 4 | `maxHp` +25, heals delta on grant | TB 125→225, ML 150→250, BS 175→275 |
| SPEED I–IV | 4 | `kinematics.maxSpeed` **+2.5 additive** (and `reverseSpeed`) | TB 45→55, ML 40→50, BS 35→45 |
| INTEL I–V | 5 | `sweepRpm` +3 | 15→30 |
| RANGE I–IV | 4 | `radarRange` **+50 additive** | 660→860 |
| RELOAD I–V | 5 | `cooldownScale` −0.1 | 100%→50% |
| BARREL I–II | 2 | `gun.barrels` +1, **parallel not spread**, straddling | 1→3 |
| EXTRA TURRET | 1 | `gun.maxAmmo` +1 | 1→2 |

SPEED and RANGE change SHAPE (multiplicative → additive). No gun damage card exists — deleted.

### Torpedoes (6) · Boost (6) · Star shells (6) · Mines (6) · Buoy (6) · Broadside (6)
| Line | Copies | Effect |
|---|---|---|
| TORPEDO I–IV | 4 | `torpedo.speed` +5 (60→80) |
| EXTRA TUBE | 1 | `torpedo.maxAmmo` +1 |
| ACOUSTIC HOMING | 1 | homing behaviour, **no longer exclusive** |
| BOOST DURATION I–IV | 4 | `boost.durationMs` +1000 (6s→10s) |
| BOOST SPEED I–II | 2 | `boost.speedBonus` +5 (10→20) |
| STAR SHELLS I–IV | 4 | `starShells.litDurationMs` +1250 (10s→15s) |
| PHOSPHOR SHELLS | 1 | burn, **added verb, stacks with DAZZLE** |
| DAZZLE SHELLS | 1 | dazzle, **added verb, stacks with PHOSPHOR** |
| MINES I–IV | 4 | `mine.blastRadius` ×1.1 (trigger rides it) |
| PROP FOULING | 1 | no damage penalty; **25% slow / 5s**; added verb |
| CAPTIVE MINES | 1 | re-arm (below); added verb |
| BUOY I–IV | 4 | buoy `sweepRpm` +1.25 (15→20) |
| GUN BUOY | 1 | buoy gun: 5 dmg / 5s cooldown, auto-fire |
| JAMMING BUOY | 1 | false returns over the buoy's area |
| BROADSIDE SPREAD I–IV | 4 | narrows the fan **[DRAFT values]** |
| BROADSIDE TURRETS I–II | 2 | 3 → 4 → 5 turrets |

### The three system changes

**BROADSIDE BARRAGE** (replaces cannon; Battleship slot 1). Port/starboard sectors taken
VERBATIM from commit `26318d5`: `port offset +90° halfArc 60°`, `starboard offset −90° halfArc
60°` — 60°-wide dead zones fore and aft. Click a point to one side; every turret on that side
fires one shell. All shells end their run at the CLICK'S RANGE, fanning ANGULARLY about it, so
the pattern is an arc at constant radius. With an odd turret count the middle shell lands exactly
on the point; with 4 the two centre shells straddle it. 20 dmg/shell, bursts like the gun, 30s
cooldown, 3 turrets base. **Range is the 5/8 rung** — `radarRange × CONFIG.vision.muzzleFlashFactor`
= 412.5u base, 537.5u at max RANGE. First weapon in the game not at full radar reach.

**RADAR BUOY** (replaces decoy buoy; Mine Layer slot 2). Own radar: 330u range, own sweep from
15 RPM, **relayed to its owner as radar returns only — no vision**. 30s life, 50 HP, destructible
by anything that damages a ship, paying no XP and printing no kill-feed line. Click-placed like a
mine. Pool 1 / 20s reload against a 30s life, so two may be live. Paints on radar with its OWN
profile, not a ship's. **The decoy role is deleted** — nothing fakes a ship contact any more.

**CAPTIVE MINES** (replaces self-propelled). Trigger and blast SWAP (32↔48), then trigger ×3 →
**trigger 144u, blast 32u** (210.8u / 46.9u at max MINES — the swap-and-triple is linear, so card
order cannot matter). Holds one un-upgraded torpedo dealing MINE damage at MINE blast radius,
fired at the first hostile in range with intelligent lead; dodgeable; mine expended on fire.
**It does not detonate normally at all.** "Hostile" = an enemy captain/bot, or a fleet drone whose
CURRENT acquired target is the mine's owner (read live off the existing `FleetController` target
state — a drone that breaks off becomes safe again). Neutral drones are ignored. **This gate is
CAPTIVE-ONLY**: ordinary and prop-fouling mines still trigger on any drone, and a mine hit still
does not aggro a drone (unchanged).

**STAR SHELL GUN REACH.** A gun click inside YOUR OWN live star-shell lit region is legal even
beyond `gun.rangeU`. Gun only — not broadside, not torpedo. Your own flares only, never an
enemy's.

### Rarity and presentation
Rarity KEEPS driving draw weight and the soft-pity escalation (Eric: *"whatever makes the best
gameplay"* — kept because the one-off verb cards are the build-defining finds). Card colour gains
a real job: ladder position on multi-copy lines, a distinct colour for the rare tier. Colours come
from DESIGN.md's ratified palette — none invented.

</intent-contract>

## Deletions (each removes its only consumer — verify no orphans)
`gunDamage`, `cannonDamage`, `cannonArcing`, `cannonAp`, `acquireCannon`, `torpedoDamage`,
`torpedoCommand`, `mineDamage`, `mineTrigger`(already gone), `mineMax`, `mineSelfPropelled`,
`starRadius`, `decoyDuration`, `boostMax`(→ split), and the whole `exclusiveWith` mechanism
(`validateBoonDef`/`validateCatalog` symmetry checks, `boonReplacesLine`, the doctrine swap-out
and `returnCards`).

Orphaned by the cannon delete: `CannonMode` (stats.ts), `shell.ts:412` plunging-fire branch, the
AP pierce path, `loadout.ts:124`, the `bulwark`/`siege` bot profiles. Epic-4 amendment 17's
"exactly one `hc` per shell resolution" clause loses the AP case it was written for.

## Open [DRAFT] scalars for Eric to tune on the water
- BROADSIDE SPREAD's four steps and the base fan half-angle.
- The broadside shell's burst radius (proposed: the gun's 15u).
- JAMMING BUOY's false-return density.
- CAPTIVE MINES' torpedo lead quality / turn authority.

## Verification
`npm run check` green. Damage guardrail re-pinned (max boosted TB = 75 kn < max torpedo 80).
Sensor-ladder ordering re-pinned under ADDITIVE RANGE. A batch-sim evidence pass on the new
economy (cycle-39/2.10 mould) — the last catalog change shipped unmeasured and that debt is
still ledgered.

---

# WAVE 2 RULINGS (Eric, 2026-08-19 — answers to the four gating questions)

**A1 — Mine verbs STACK, and the captive torpedo carries the slow.** CAPTIVE MINES and PROP
FOULING may both be held. A captive mine's torpedo hit applies the 25%/5s foul. This is why the
verb-flag model (wave 1, R2) is load-bearing rather than cosmetic: `mine.propFouling` and
`mine.captive` are independent booleans and the torpedo reads BOTH. Star shells stack likewise
(PHOSPHOR + DAZZLE), already built in wave 1.

**A2 — Broadside signals are PER SHELL.** Each shell in a salvo emits its own `mz` muzzle flash,
its own `sp` splash and its own `hc` hit call, exactly as an ordinary gun shell does. No salvo
aggregation. Consequence to carry: a 5-turret barrage multiplies the signal surface ×5 against
epic-4 amendment 17's "exactly one `hc` per shell resolution" (which is satisfied — one per
SHELL, not one per salvo). The same ruling governs BARREL's parallel shots.

**A3 — JAMMING BUOY denies RADAR ONLY; truesight and LOS are untouched.** It ADDS false returns
rather than deleting real ones: the real hull still paints, but it is indistinguishable from the
fakes around it. **The false returns MUST be server-generated and wire-indistinguishable from
real blips** — this INVERTS the wake-chop precedent (chop is client-side because it carries no
information; jamming's whole purpose is denying information, so a modified client dropping the
fakes would gain a decisive advantage). The buoy's owner is exempt and sees the truth. The buoy
is concealed among its own fakes. **[DRAFT]** ~10 false returns live in the 330u circle,
re-scattered each sweep.
*Implementation note:* this is the first deliberate emission of a FALSE signal through
`perception.observe()`. It does not breach the master invariant in the leak direction (a fake
discloses nothing real), but the invariant's tests assert every blip traces to an actual ship and
need an EXPLICIT carve-out, not a quiet edit.

**A4 — The buoy paints on radar with its own profile and NO owner identity** — visible to enemies
at radar range like anything else, carrying no clue whose it is. Consistent with every other row.

**A5 (orchestrator, flagged to Eric) — the broadside REPLACES the cannon outright.** The cannon
equipment id is deleted, not kept alongside; broadside takes Battleship slot 1 (Q) with star
shells unchanged on slot 2 (E). `acquireCannon` becomes an acquire-broadside card for the other
two hulls.
