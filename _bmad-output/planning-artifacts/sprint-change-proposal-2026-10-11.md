# Sprint Change Proposal — 2026-10-11: Epic 9 re-cut — keys not belts, one countermeasure, the fouling shell, ramming, five tiers

**Status:** APPROVED by Eric 2026-10-11 (gds-correct-course, incremental mode; every design clause below was ruled in chat this session)
**Trigger:** Eric's seven goals for the cycle, stated 2026-10-11 at the top of this run, after Story 9.1 closed (cycle 171, 0.18.36, PV 74)
**Author:** Developer agent with Eric (nothing here is invented; where a number is the agent's proposal Eric accepted, it is marked PROPOSED-ACCEPTED and lives in CONFIG as a dial)
**Predecessors:** `sprint-change-proposal-2026-07-19.md`, `-2026-08-18.md`, `-2026-09-21.md`, `-2026-10-06.md`

---

## 1. Issue Summary

**Problem statement.** With Story 9.1 closed, Eric set the goals for the rest of Epic 9 (verbatim, 2026-10-11):

1. *"Consumable belt is being phased out. All captains can carry all consumables. Each is tied to a specific number key by default, changeable once keyboard controls are changeable, (for example, HULL REPAIR could be on 1, SHIELD on 2, etc.). This is still limited by the max carry count."*
2. *"Smoke and Chaff is being merged into one consumable: A Multi-Spectral Countermeasure. Instead of leaving a smoke trail, it should puff out in a wide region at first and grow. Rather than being a translucent circle, i want the smoke effect to be done with pixels. Rather than doing the random ship-like returns, those pixels will actually directly interfere with both vision and radar, until they fully dissipate."*
3. *"I'd like to add a consumable that can be used to create a region that slows movement, as though anyone in it was hit by a fouling mine. This is either a separate item, or a strict replacement for the Flash/Dazzle Shell."*
4. *"I would like to add RAMMING and contact hull damage into the game, creating an incentive to stay away from other ships and avoid running aground. Obviously, *all* bot/drone profiles will need to account for this."*
5. *"ALL Tiered upgrades will have 5 upgrade tiers in the pool. This means that all of the 'ship upgrades' are considered to start on Tier 0 and go up to Tier V. This might mean rescaling."*
6. *"Specific rescaling is that the extra Hull Points upgrade needs to provide +50 current and max hp."*
7. *"Passive Healing gets a Tiered upgrade. Each tier gives it +0.2% missing health restoration (maxing out at 2% for Tier V)"*

And, ruled in the session: **Speed Boost (9.2) and Healing Buoy (9.3) are NOT being added after all.**

**Issue type.** New requirements from the stakeholder; a scope change to Epic 9's middle stories (9.2–9.4) with no change to the test-and-hygiene tail (9.5–9.8).

**Evidence.** Current state read from code 2026-10-11: four belt slots on Digit1–4 (`shared/src/sim/loadout.ts` `CONSUMABLE_SLOTS`, `client/src/input/keyboard.ts` `BELT_KEY_CODES`), a full belt refusing a fifth kind (`beltFull`, `boons.ts`); SMOKE SCREEN = ten stationary discs over 5 s, r 123.75 → 247.5 u over 30 s, sight only (`CONFIG.smokeScreen`); CHAFF = ten fake radar echoes in r 180 u for 15 s (`CONFIG.chaff`, `server/src/game/fakes.ts`); FLASH SHELLS = click-aimed zero-damage shell, r 150 u, 10 s one-eighth sight (`CONFIG.flashShells`); fouling slow 0.75 for 5 s (`CONFIG.foulingMines`); **no hull-to-hull collision anywhere**, grounding = speed cap at 25 % with zero damage (`sim/collision.ts`); ARMOR +25 hp × 4 rungs, SPEED +2.5 × 4, TURNING +0.05 × 4 (`sim/catalog.ts`); regen 1 % of missing hp per second after 15 s out of combat, no upgrade (`CONFIG.regen`).

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| Epic 9 Tune and Clean | Stories 9.2 and 9.3 **CANCELLED** (Speed Boost, Healing Buoy — Eric 2026-10-11). Five new stories inserted as 9.2–9.6 in Eric's numbered order. 9.4 Depth Charge → 9.7 (unchanged, still optional). 9.5–9.8 → 9.8–9.11, text unchanged except How-to-Play's item list. Epic grows 8 → 11 stories (10 live + 1 optional). |
| Epic 10 The Account | Untouched. Its unlock surfaces list catalog lines; the retired lines (smoke, chaff, flash) and the new ones (countermeasure, fouling shell, passive healing) flow through with no story edit. |

### Story impact — the new middle of Epic 9 (Eric-ruled 2026-10-11)

| # | Story | Eric's ruling of record |
|---|---|---|
| 9.2 | **Every Consumable Has a Key** | Belt retired; every captain holds every kind; fixed default keys; cap 5 per kind is the only limit; rebinding waits for configurable controls. HUD direction: **option D′** of `mockups/hud-consumables-1.html` — compact 34 px strip above the weapons, globes 124 px, weapon squares 46 px, edges implied by the globes, no drawn panel (*"D is the 'correct' approach imo … scale up the HP/speed circles a little bit, and scale down the icons … Without the 'hairline panel' outline is perfect."*). |
| 9.3 | **Multi-Spectral Countermeasure** | SMOKE SCREEN + CHAFF → one line. Pixels are the obstruction for sight and radar; no fake echoes; owner's sight blocked, owner's radar not; radar blocking fades as pixels die. Timing from chaff; *"a little bigger initially and a lot bigger as it dissipates."* |
| 9.4 | **Fouling Shell** | Strict replacement for FLASH SHELLS (*"lets call it a replacement as they serve the same purpose... engage/disengage"*). Slows the owner too. Slows **stack** with the fouling mine (*"instead of 'strongest slow wins,' lets stack these as they are different sources"*). Name FOULING SHELL accepted. |
| 9.5 | **Ramming and Contact Damage** | *"fairly realistically, in that flat out ramming an enemy ship at full speed is a last ditch effort to sink it, while grinding up against another ship could deal lesser damage over the duration of contact."* Energy law (speed squared), mass = effective max hull (*"Abstracting around only Max Hull would work better"*), lighter hull absorbs more (mass split). Bots: avoidance for all, plus a **ram disposition** available to bots with its trigger left to playtesting. |
| 9.6 | **Five Tiers and Passive Healing** | Ship upgrades run Tier 0 → V (five cards): HULL POINTS +50 current and max per tier; SPEED and TURNING gain a fifth rung at today's step; new PASSIVE HEALING ladder +0.2 %/s per tier **and** −1 s out-of-combat wait per tier (15 → 10 s at V). Guns untouched: *"The three deck guns are weapons and by the same logic as all other weapons you start with them at Tier I."* |

### Artifact conflicts

| Artifact | Conflict | Change |
|---|---|---|
| `epics.md` §Epic 9 | 9.2 Speed Boost, 9.3 Healing Buoy, 9.4 Depth Charge, 9.5–9.8 | 9.2/9.3 struck CANCELLED; new 9.2–9.6 written; 9.4 → 9.7; 9.5–9.8 → 9.8–9.11; 9.11's item list re-cut |
| `gdd.md` Development Epics E9 row | Names SPEED BOOST and HEALING BUOY | Dated supersession stamp appended (never a rewrite; amendment-89(k) pattern) — mechanics sections follow at 9.11 |
| `DESIGN.md` / `EXPERIENCE.md` | Bar = 104 px globes, 54 px weapon squares, framed 44 px belt of four on `1`–`4` | Mock promoted (`mockups/hud-consumables-1.html`, option D′); decision-log entry; the spine's component table re-cut at Story 9.2's spec step with Eric's numbers, not here |
| `catalog-v3.md` | R38 SMOKE SCREEN, R39/R41 CHAFF, FLASH (R33/R34 supersession), armor 4 tiers, consumables "fired on `1`–`4`" | Dated addendum at Story 9.11 (How-to-Play and Record), per that story's AC |
| `game-architecture.md` | Smoke as sight occluder (D24 / Novel Pattern 12), chaff fakes | Dated notice at 9.11; the perception chokepoint and the SIX exceptions are unchanged by any story here (the countermeasure's pixels derive from a wire-visible `{id,x,y,t0}` exactly as puffs do today) |
| `sprint-status.yaml` | epic-9 block lists 9-2..9-8 | 9-2/9-3 cancelled, new keys 9-2..9-6, renumbered 9-7..9-11; one-line stamp |
| `gds-workflow-status.yaml` | `correct-course`, `next_expected` | One-line stamps |
| `epic-9-context-amendments.md` | — | Amendments 21–30 (this session's rulings) |
| `deferred-work.md` | 9.2/9.3 forward pointers (healing buoy, speed boost) | Ledger entries moot; stamped at 9.10 Hygiene (append-only) |

### Technical impact

- **Shared sim:** belt slots leave `LoadoutSlot`; stock becomes a per-kind count (`ship.cards` already is). Countermeasure particles are a pure seeded function of `(cloudId, t − t0)` in `shared/src/sim/` so both sides derive identical pixels from the existing `{id,x,y,t0}` wire shape; LOS tests against living pixels replace `puffCrossed`. Slow becomes a multi-source fold (`slowedKinematics` takes a product of active sources). Hull-to-hull contact is a new pure resolver beside `resolveShipPose`, in the client predictor too. `effectiveStats()` gains the passive-healing rate and wait; mass for ramming is `effectiveStats().maxHp`.
- **Server:** `STEP_ORDER` gains contact resolution and contact damage (through `applyDamage`, the one hp write); `fakes.ts` retired; `CONFIG.chaff`, `smokeScreen`, `flashShells` retired for `countermeasure`, `foulingShell`, `ram`, `passiveHealing`; the perception invariant tests extend to the countermeasure's row; the exception count stays SIX.
- **Client:** HUD bar geometry re-laid to D′ (`hudBarLayout`), six fixed squares with the new ZERO-STOCK state; keyboard Digit1–6 / Numpad1–6; pixel cloud renderer replaces the disc renderer; a contact flash/sound is implementer craft to show Eric.
- **Bots/drones:** hull-avoidance term beside island avoidance; a `ram` tactic row; drones learn contact hurts. The 7.3 % grounding rate (amendment 14) now costs hp, which makes the deferred bot-navigation fix more urgent — flagged, not re-scoped here.
- **Wire:** `PROTOCOL_VERSION` bumps in every story that touches catalog content or CONFIG the client reads (all five).

## 3. Recommended Approach

**Direct adjustment** of Epic 9's story list — cancel two, insert five, renumber the tail. No rollback (9.1's board stands by amendment 14); no MVP review (The Account is untouched). Effort: five feature stories, the largest being ramming (sim + predictor + bots) and the countermeasure (perception + render). Risk: moderate — three stories touch perception or the predictor, which is where desyncs and anti-cheat leaks live; each lands behind the existing property invariants. Timeline: the tail (audit, flakes, hygiene, How-to-Play) moves after five more build stories.

## 4. Detailed Change Proposals

### 4.1 Story 9.2 — Every Consumable Has a Key

**Rulings (Eric 2026-10-11).** Belt gone; all kinds carried; cap 5 per kind (*"yes the cap is 5 per kind"*); fixed default keys, rebinding later; HUD = option D′ with implied edges.

**Default keys (PROPOSED-ACCEPTED):** `1` HULL REPAIR · `2` SHIELD BLOCK · `3` MULTI-SPECTRAL COUNTERMEASURE · `4` FOULING SHELL · `5` DECOY BUOY · `6` SUPERCAVITATING TORPEDO. DEPTH CHARGE has no key while it is a stub. The refit window's digit pick and its close grace stand (DESIGN decision 2026-09-11); the grace now covers `1`–`6`.

**HUD (option D′, `mockups/hud-consumables-1.html`):** globes 104 → 124 px; weapon squares 54 → 46 px with 24 px icons; consumable strip of six 34 px squares at a 4 px gap with 16 px icons, unframed, stacked above the weapon row, centered; chips under every square; stack height = globe diameter (124 px) so the globes' tangents are the panel's edges; **no drawn panel**. New slot state **ZERO STOCK**: a fixed kind at 0 copies keeps its square and key, dashed edge, icon at .45, no badge. Every other slot state, the refit dim, the XP strip and the 90 % UI scale are untouched. Exact pixel values are the mock read literally (the amendment-31 rule) unless Eric nudges them at the spec step.

**Consequences:** `beltFull` refusal and "SLOTS FULL" treatment retired — `atCap` is the only consumable refusal; drone drops stock any legal kind (the "full belt → held lines only" branch of amendment 226 is moot); bots' belt reads become per-kind counts.

### 4.2 Story 9.3 — Multi-Spectral Countermeasure

**Rulings (Eric).** One line replaces SMOKE SCREEN and CHAFF. *"puff out in a wide region at first and grow"*; drawn as pixels; the pixels *"directly interfere with both vision and radar, until they fully dissipate"*; no fake ship returns. *"It blocks the owner's sight, but not radar. Blocking should fade with pixels wrt radar."* Timing: *"the current timing for chaff is a good starting point … a little bigger initially and a lot bigger as it dissipates."*

**Numbers (PROPOSED-ACCEPTED, CONFIG dials):** one press = one cloud centered on the hull, no trail, no lay window; lifetime 15 s (chaff's); a few hundred pixels seeded from the cloud id; each born inside r 200 u (chaff was 180) and drifting outward so the cloud's radius reaches 500 u at end of life; each pixel's own death time spread over about 6–15 s so the count decays; a pixel's blocking footprint about 6 u; a sight line or radar ray is blocked if it crosses any living pixel. Owner's radar skips the pixel test. The old in-smoke one-eighth sight rule is retired — the pixels do that job.

**Architecture note:** pixels are a pure function of `(id, now − t0)` in shared; the wire carries `{id,x,y,t0}` as puffs do today; nothing new leaves the server; the chokepoint and the SIX exceptions are unchanged. LOS cost: a bounding-circle pre-test before the per-pixel segment test.

### 4.3 Story 9.4 — Fouling Shell

**Rulings (Eric).** Strict replacement for FLASH SHELLS; slows the owner too; stacks with the fouling mine's slow; name accepted.

**Numbers (PROPOSED-ACCEPTED):** fired exactly as FLASH is (one click-aimed shell to radar range, zero damage, bursts once); the burst leaves a region r 150 u (FLASH's radius) for 15 s; every hull inside, owner included, runs at 0.75 (a Tier I fouling mine) and the slow lingers 5 s after leaving (the mine's duration). Stacking: slow factors from different sources multiply (0.75 × 0.75 = 0.5625 for shell + Tier I mine). `CONFIG.flashShells` and `dazzledUntil` retire with it.

### 4.4 Story 9.5 — Ramming and Contact Damage

**Rulings (Eric).** Realistic feel: full-speed ram is a last-ditch sink attempt, grinding is lesser damage over contact time. **Energy law. Mass split. Mass = effective max hull** (length × beam rejected: *"it should have nothing to do with the visual shape of the ship"*). Bots: avoidance plus a ram disposition, trigger by playtest.

**The model (derivation in the session, recorded here):**
- Relative velocity at contact splits into the normal part `v_n` (the hit) and the tangential part `v_t` (the grind).
- **Hit** (once per contact, when `v_n` exceeds the allowance): `E = ½ · μ · v_n²`, `μ = mA·mB / (mA+mB)`; hull A absorbs `E · mB/(mA+mB) / K`, hull B the rest. Masses are `effectiveStats().maxHp`, so HULL POINTS tiers make a hull heavier.
- **Grind** (per second while pressed together, same split): `dps_A = g · v_t · mB/(mA+mB)`. A new hit registers only after the pair separates.
- **Land** has infinite mass: the hull absorbs all of `½ · m · v_n²`, times a softness factor; the existing quarter-speed cap while pushing on land stays.
- Hulls become solid: overlap pushes apart as the coast pushes a hull today; the client predictor runs the same resolver.

**Dials (PROPOSED-ACCEPTED, all in `CONFIG.ram`):** anchor "speedboat head-on speedboat at 90 u/s closing costs each 200" → `K ≈ 1,266` energy units per hp; grind anchor "speedboat scraping a stopped speedboat at 45 u/s costs each 5 hp/s" → `g ≈ 0.222`; allowance 5 u/s (a nudge is free); land softness 0.25; damage floored to integers (the integer-damage rule). Rams hit PvE drones; a ram that sinks credits the rammer; buoys and mines are not rammable.

**Reference table at base hulls (250 / 300 / 350), energy law, mass split:** speedboat into stopped speedboat at 45: 50 / 50; speedboat into stopped dreadnought at 45: 68 to self, 49 to target; boosted speedboat (69 u/s) into stopped dreadnought: 159 / 113; dreadnought into stopped speedboat at 35: 29 / 41; dreadnought head-on dreadnought at 70: 169 each. Grounding head-on at full speed: speedboat 50, repeater 47, dreadnought 42.

### 4.5 Story 9.6 — Five Tiers and Passive Healing

**Rulings (Eric).** Ship upgrades are Tier 0 → V, five cards each. HULL POINTS **+50 current and max per tier** (heal on grant as today) → +250 at V (500 / 550 / 600). SPEED and TURNING keep today's step and gain a fifth rung (+2.5 → +12.5 u/s; +0.05 → +0.25 rad/s) — PROPOSED-ACCEPTED. PASSIVE HEALING new ladder, cap 5: each tier +0.2 % of missing hp per second (1 % → 2 % at V) **and** −1 s out-of-combat wait (15 → 10 s at V). Guns stay as they are (Tier I mounted, four cards to V). RADAR SWEEP and RELOAD already have five.

**Consequences:** `shipClasses.test` max-hp pins and the NFR6 ceiling test re-base knowingly; `copy.ts` hard-coded "15 seconds" becomes derived; How-to-Play tables derive from `effectiveStats()`.

### 4.6 Renumbered tail

9.4 Depth Charge → **9.7** (optional, text unchanged). 9.5 → **9.8** Test Audit, 9.6 → **9.9** Smoke Flakes, 9.7 → **9.10** Hygiene, 9.8 → **9.11** How-to-Play and Record — text unchanged except 9.11's item list: entries for MULTI-SPECTRAL COUNTERMEASURE, FOULING SHELL, ramming/grounding, PASSIVE HEALING and the key row; the SMOKE SCREEN, CHAFF and FLASH SHELLS entries retired; the catalog-v3 and architecture addenda named in §2.

## 5. Implementation Handoff

**Scope: Moderate** — backlog reorganization of one epic plus five new feature stories. Routed to `gds-create-story` for 9.2 next, each story's numbers confirmed with Eric at its spec step (the PROPOSED-ACCEPTED values are the defaults he already accepted, offered back for a final nod, never silently changed). Dev-story only when Eric says. Success: five stories landed in order with `npm run check` green, the perception exception count still SIX, prediction parity on contact and slow, both trackers stamped per PR, and Eric's staging play confirming the feel of the ram and the countermeasure.

**Memory of the session (for the next agent):** the belt is gone, do not propose slots; Speed Boost and Healing Buoy are cancelled, do not re-propose; slows stack; mass is max hull, never geometry; guns do not get a fifth card.
