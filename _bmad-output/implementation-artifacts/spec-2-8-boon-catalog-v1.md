---
title: 'Story 2.8: Boon Catalog v1 — THE DECK MODEL'
type: 'feature'
created: '2026-07-30'
status: 'ready-for-dev'
baseline_revision: '48d953f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
  - '{project-root}/_bmad-output/brainstorming-session-2026-07-30.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The offer flow runs on an interim dummy catalog (5×2 stat-only boons, uniform category rolls) while the ratified design — THE DECK MODEL with the full 9-category Boon Catalog v1 (brainstorm 2026-07-30, amendments 38–46) — exists only on paper, and the 14 legacy stat upgrades still haunt the wire (`OwnShip.upg`, `applyUpgrade`, `CONFIG.upgrades`, the `upg` event).

**Approach:** Land the deck engine (per-player card deck, 4-different-line draws, chosen-cards-leave, copy-counts-as-caps, escalating rare weight, R-slot acquisition with purge + banked-offer scrub, free doctrine swaps), the full catalog as data + the behaviors it requires (damage/blast/trigger promoted onto `EffectiveStats`, barrels/turret/tube capacity, 4 exclusive doctrine pairs, hull heal-on-grant), the ratified baseline kit changes (damageless star shells, aimed mine placement, same-owner mine chains), the wholesale legacy strip (PV 15→16), and the minimal card UI (rarity tiers, lineage pips, ladder names, doctrine-swap line). 2.9 owns per-boon juice; 2.10 owns tuning evidence.

## Boundaries & Constraints

**Always:**

- **THE DECK MODEL (amendment 38) is the offer engine.** Per-player deck = universal lines (Intel + Ship + Gun) + one subdeck per carried equipment + one acquisition card per NOT-carried equipment. Each level draws `CONFIG.offer.size` (4) **different card lines** (duplicate auto-redraw; categories may repeat); drawn cards leave the deck into the banked offer; on spend the chosen card is consumed and the 3 unchosen return to the deck; banked offers never reroll/expire (FR19 intact); `pts === offers.length` invariant intact. Empty deck → level increments, **no offer banks** (pinned by test as unreachable within match parameters). Deck state is server-private (never on the wire), lives on `ShipRecord`, wiped by `redeployShip` (rebuilt from the fresh loadout), preserved by `respawn`, never exists for drones. Per-player deterministic deck stream: `mulberry32` decorrelated by a new golden constant XOR a stable per-ship join ordinal (existing stream idiom; spawn/drone/offer streams unaffected). The old category-first `rollBoonOffer` and its insertion-order dependency die.
- **Escalating rare weight (amendment 38):** rare/exclusive cards carry draw weight `base × (1 + levelsSinceRareSeen × dial)` under a new `CONFIG.deck` block (implementer-drafted handwave values; 2-10 tunes); the counter resets when any rare/exclusive line lands in a draw. Invisible — no UI.
- **R slot permanent; universal pool (amendment 38):** acquisition cards (`slotFill` effects) exist for every equipment the hull does NOT carry: TORPEDO TUBES · MINE RACKS · STAR SHELL MORTAR · CANNON · DECOY BUOY · EMERGENCY THROTTLE (speedBoost, amendment 42). Rarity `rare`, 1 copy each (this + rare weight IS FR21's off-class CONFIG tunable). On R fill: purge all remaining acquisition cards from the deck AND scrub them out of banked offers, refilling each scrubbed offer back to size from the deck in offer order (amendment 43 — deterministic, own-pick-triggered, not a reroll). The acquired equipment's subdeck shuffles into the deck. Acquisitions install a full pool (amendment 41).
- **Exclusives (amendments 38/44):** 1 copy per doctrine card. While holding a doctrine, its rival draws normally and presents as a REPLACE (doctrine-swap line on the card face); picking it swaps for free — the swapped-out doctrine's id leaves `boons`, its card returns to the deck (ping-pong legal); stat stacks apply under either doctrine. A doctrine you hold cannot be re-drawn (its only copy is consumed).
- **Catalog data model:** one `BoonDef` per card LINE; `BoonDef` gains `rarity: 'common'|'rare'|'exclusive'`, `copies: number`, and where needed `exclusiveWith: BoonId` and `healOnGrant: true`. Stack count = occurrences of the id in `ship.boons`/`you.boons` (repeats are legal and stack). Doctrine cards use a new declarative effect kind `{kind:'doctrine', weapon: EquipmentId, mode: string}` folded by `effectiveStats` into new per-weapon `mode` fields (e.g. `cannon.mode: 'standard'|'arcing'|'ap'`); `HOOK_REGISTRY` stays EMPTY (doctrines are data + bespoke shared modifiers, the boost precedent — amendment 30 satisfied without new hook plumbing). Catalog content is wire contract: **PV 15→16**, one bump for everything in this story. New shared authoring-time `validateBoonDef`/catalog validation (closes the 2.5 ledger entry): whitelisted stat paths, positive finite values, rarity/copies sane, exclusiveWith symmetric + same weapon, doctrine modes known, non-empty effects.
- **Catalog content (amendment 42 — ladders ratified verbatim; steps are implementer-drafted handwaves respecting `damageGuardrail`):**
  - GUNS (universal): gunDamage ×5 HEAVY SHELLS Mk I–V · gunReload ×5 (LOADING DRILLS→READY MAGAZINE) · gunBarrel ×2 rare (TWIN MOUNT→TRIPLE MOUNT; `gun.barrels` 1→2→3, each click fires `barrels` shells in a small implementer-drafted spread, each a real shell bursting at its own point) · gunTurret ×1 rare (AFT TURRET; `gun.maxAmmo` 1→2 — the single-shot pin is deliberately retired, whitelist + stats unpin).
  - CANNON: cannonDamage ×5 HEAVY CHARGE · cannonBlast ×5 FRAGMENTATION CASING (`cannon.burstRadius`) · cannonReload ×5 HYDRAULIC RAMMER · PLUNGING FIRE ⚔ ARMOR-PIERCING SHELLS (exclusive pair): arcing = ignores islands AND hull interception, always bursts at the click point; AP = no burst, full-range direction shot, pierces up to 3 hulls at 100/50/25% damage, stopped by islands.
  - TORPEDOES: torpedoDamage ×5 HEAVY WARHEAD · torpedoSpeed ×4 (HIGH-SPEED SETTING→PURE OXYGEN DRIVE; +5 kn/card, 60→80) · torpedoReload ×5 QUICK-LOADING GEAR · torpedoTube ×1 rare SECOND TUBE (`torpedo.maxAmmo` 1→2) · ACOUSTIC HOMING ⚔ COMMAND DETONATION: homing = slow-turn steering toward the nearest enemy hull within a short acquire range (owner excluded, hulls only — decoys don't attract it); command = point-detonation at the click (range capped by radar range) with a large blast; contact hits stay ordinary torpedo hits.
  - MINES: mineDamage ×5 (TNT→RDX FILLER) · mineBlast ×5 BLAST CASING (`mine.blastRadius`) · mineTrigger ×5 (MAGNETIC→COMBINATION FUZE; `mine.triggerRadius`, clamped ≤ blastRadius in `effectiveStats`) · mineMax ×5 (DECK RACKS→CONVERTED HOLD; `maxLive` +1) · mineReload ×5 QUICK-RELEASE RAILS · SELF-PROPELLED MINES ⚔ PROP-FOULING MINES: self-propelled = armed mines creep at a slow speed toward the nearest enemy hull within an acquire range; prop-fouling = reduced mine damage + victims slowed ~50% for a duration (self-private `you.slowedUntil`, bespoke `slowedKinematics` mirroring the boost precedent, composition order boost→slow→hooks pinned server AND predictor).
  - SPEED BOOST: boostMax ×5 (CLEAN BOILERS→EMERGENCY POWER; `boost.speedBonus`) · boostReload ×5 STEAM RESERVE. Boost stays bespoke.
  - STAR SHELLS: starDuration ×5 SLOW-BURN COMPOUND (`litDurationMs`) · starRadius ×5 WIDE BURST (`litRadius` — promoted to EffectiveStats; base stays the ratified SIGHT/2 derivation) · starReload ×5 RAPID HANDLING · INCENDIARY COMPOUND ⚔ DAZZLE BURST: incendiary = slightly smaller zone radius + DoT to non-owner hulls inside while lit; dazzle = still illuminates, non-owner ships whose center is inside get reduced truesight (perception-side factor) + self-private `you.dazzledUntil` so the victim's own fog hole shrinks honestly.
  - DECOY BUOY: decoyDuration ×5 EXTENDED BATTERY · decoyReload ×5 SPARE BUOYS.
  - INTEL (universal): intelTruesight ×5 (IMPROVED OPTICS→MASTHEAD POST; `sightRange`) · intelRadar ×5 (IMPROVED RECEIVER→CAVITY MAGNETRON; `radarRange` — knowingly also grows gun/cannon range and command-det reach) · intelSweep ×5 UPRATED SWEEP MOTOR (+3 RPM/card; the 30-RPM ceiling survives the strip by moving to a non-`CONFIG.upgrades` home).
  - SHIP (universal): shipSpeed ×5 (HULL SCRAPING→FLANK SPEED TRIALS; `kinematics.maxSpeed`, reverse scales with it as today) · shipHull ×5 (REINFORCED HULL→ARMORED CITADEL; `maxHp` + heal the granted delta on fit, via `healOnGrant` — the ONLY heal path, sanctioned by amendment 38's brainstorm content).
- **Baseline kit changes (amendments 39/45/46):** star shells lose ALL damage (interception does 0 and still spawns the lit zone at the stop point); the mine becomes a click-aimed WEAPON (`EQUIPMENT_IS_WEAPON.mine = true`): prime via slot key/click, aim within a rear arc (implementer-drafted half-arc about the stern bearing + short max place range in CONFIG), click places the mine at the clicked point, out-of-arc/range → existing denial register, 3s arm delay unchanged, auto-revert to gun after placing (amendment 5); mine chains are same-owner only — a detonation detonates the owner's other ARMED mines whose centers lie within its blast radius, cascading same-tick with a visited set, per-blast owner damage-immunity unchanged.
- **Ammo on fit (amendment 41):** capacity raises top the pool up to the new cap immediately (supersedes the 2.5 clamp-down-only parking); acquisitions install full pools (existing `freshSlotState`). Duplicate-equipment fits stay forbidden (id-addressed slots stand; acquisition cards for carried equipment never enter the deck, so the no-op path is unreachable — pin it).
- **Legacy strip (FR20):** `UPGRADE_IDS`/`UPGRADE_CATEGORY_IDS`/`UPGRADE_CATEGORIES`/`CONFIG.upgrades`/`applyUpgrade`/`applyGrantEffects`/`AMMO_UPGRADE_EQUIPMENT`/`ShipRecord.upgrades`/`OwnShip.upg`/`UpgradeEvent('upg')`/`zeroUpgrades` all die; `effectiveStats(cls, boons)` loses the counts param (every call site both sides); the results-modal "upgrades taken" becomes boons fitted (`you.boons.length`); `upgradeToast` legacy LABELS die; signal registry row count drops with `upg`.
- **Homing on the wire:** the enemy client dead-reckons ballistics from launch/reveal velocity; a steering torpedo therefore re-emits a ballistic update (same constant-free shape: current pos + velocity only, no range-derivable fields) to observers who can currently see it, whenever its velocity direction has changed beyond a small threshold since last emit; `seenBallistics` exactly-once relaxes to allow updates keyed by the same id; client updates the live track in place. Perception/goldenFrames invariants extend to the update event; everything else about per-event visibility rules is untouched.
- **Card UI (minimal — 2.9 owns juice):** rarity tag line (plain/RARE/EXCLUSIVE; implementer-drafted colors respecting the pinned CVD hue bands and never colliding with the denied border channel), lineage pips `NAME · II/V` for multi-copy lines (position = held occurrences + 1, total = copies), name-by-stack-position from client-side ladder arrays in `boonCopy.ts` (all ladders verbatim from the brainstorm doc, amendment 42), rules-text contract with live values (current → next for the card's headline stat, computed via an `effectiveStats` preview diff), doctrine-swap line when the rival is held ("REPLACES: <rival name>"). Band geometry: overlap ratified (amendment 40) — cards may grow modestly taller, `bandTopFrac`/width untouched, the deliberate floor-viewport overlap pin updates knowingly. Keep the digit chip the FIRST span in the card (pinned DOM order).
- Cross-cutting: complexity ≤ 10; shared pure/side-free; World/Match zero Colyseus imports; seeded RNG only; boon/offer/xp state self-private on `you`; every reworked pin flipped deliberately (none deleted silently); `npm run check` green; no VERSION bump; `damageGuardrail` extended to pin max-stacked damage below one-shot on the lightest base hull.

**Block If:**
- Any mechanic needs boon/deck/doctrine state on contacts, blips, spectator, results, or roster frames — information discipline breach needs Eric.
- The dazzle truesight reduction cannot be expressed without weakening a perception invariant for NON-dazzled observers.
- Catalog steps cannot satisfy both the ratified ladders and the damage guardrail by value choice alone.
- Any NEW game-design decision beyond amendments 38–46 surfaces (e.g. new exclusive pairs, heal cards, deck-visible UI) — design questions for Eric.

**Never:**
- No smoke screen (deferred past v1, amendment 38). No Decoy Buoy replacement (fenced). No TTK/regen work beyond shipHull heal-on-grant (filed to the TTK pass). No per-boon audio/visual identity pass, hull silhouette changes, or trigger-ring rendering (2.9). No batch-sim harness (2.10). No Option D swap-refund (ledgered). No design-doc edits (doc-sync gated separately). No spectate spend surface. No client prediction of projectiles.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deck seed (TB) | fresh active spawn | universal (gun 13, intel 15, ship 10) + torpedo 17 + boost 10 subdecks + 4 acquisitions (mine/cannon/star/decoy) | — |
| Draw | level banks, deck ≥ 4 lines | 4 DIFFERENT lines, weighted, removed from deck, offer banked | — |
| Draw, thin deck | deck has < 4 distinct lines | offer of exactly the distinct lines available | Never throws |
| Empty deck | deck empty at bank | `lvl` increments, NO offer banks, pts unchanged | Pinned unreachable |
| Spend | pick 1 of 4 | chosen consumed (stacks), 3 unchosen return to deck, next queued offer unchanged | — |
| Acquisition pick | R empty, pick MINE RACKS | mine fills R loaded, mine subdeck shuffles in, all acquisition cards purge from deck AND banked offers (scrub + deterministic refill to size) | — |
| Doctrine swap | hold ACOUSTIC HOMING, pick COMMAND DETONATION | homing id removed from boons, command added, homing card returns to deck, stats/loadout recompute | — |
| Capacity raise | AFT TURRET fit, pool 1/1 | `gun.maxAmmo` 2, pool tops to 2/2 immediately | — |
| shipHull fit | hp 100/200, card grants +20 | maxHp 220, hp 120 (heal = granted delta) | Never exceeds maxHp |
| Barrel click | `gun.barrels` 3, valid click | 3 shells spawn (spread), one ammo consumed, each bursts at its own point | — |
| AP shot | AP doctrine, 3 hulls in line | 100/50/25% damage in hit order, no burst, island stops it | Max 3 hulls |
| Arcing shot | PLUNGING FIRE, island + hull between | no collision en route, bursts exactly at click | — |
| Homing steer | enemy hull within acquire range | torpedo turns at slow rate toward it; observers get update events on direction change; own torp never homes on owner/decoys | — |
| Mine place | mine primed, click in rear arc ≤ range | mine at click point, 3s arm | out-of-arc/range → denial register |
| Mine chain | own mine detonates, own armed mine in blast | cascades same tick (visited set); enemy mines unaffected | Bounded by maxLive |
| Prop-fouled victim | slowing mine hits enemy | reduced damage + `you.slowedUntil` (victim-private), victim predicts slow identically | Refresh, don't stack |
| Dazzled victim | enemy center inside dazzle zone | reduced truesight in perception; victim's `you.dazzledUntil` shrinks own fog hole | Non-owner only |
| Star shell intercepted | shell hits hull en route | 0 damage, lit zone spawns at stop point | — |
| Trigger > blast | mineTrigger stacked past blast | `triggerRadius` clamped to `blastRadius` in effectiveStats | — |
| Owner-vacated mine | owner left, mine triggers | detonates with CONFIG base values (fallback) | — |
| Wire privacy | any enemy/spectator frame | deck/offer/boons/slowedUntil/dazzledUntil never leave `you`; homing updates only to observers who see the torp | Invariant suites at PV 16 |
| Legacy strip | any code path | no `upg` event, no `OwnShip.upg`, no `CONFIG.upgrades`; results modal counts boons | Compile-time |

</intent-contract>

## Code Map

- `shared/src/sim/boons.ts` -- BoonDef extensions (rarity/copies/exclusiveWith/healOnGrant/doctrine kind), full BOON_CATALOG (~40 lines + 6 acquisitions), validateBoonDef + catalog validation, whitelist growth
- `shared/src/sim/deck.ts` -- NEW: pure deck ops (buildDeck/draw/returnCards/purgeAcquisitions/subdeck shuffle-in; weighted no-dup draw; rare-weight escalation)
- `shared/src/sim/offers.ts` -- rollBoonOffer dies or becomes a thin deck-draw wrapper; category-order dependency dies
- `shared/src/sim/stats.ts` -- effectiveStats(cls, boons): counts param strip; new fields (damage/contactDamage/burstRadius/barrels per gun-family, torpedo.damage, mine.{damage,blastRadius,triggerRadius}, starShells.{litRadius,litDurationMs}, per-weapon mode flags); trigger≤blast clamp; sweep cap re-home
- `shared/src/sim/shell.ts` -- ShellState doctrine fields (pierce, ignoreIslands+alwaysBurst, homing steer w/ per-tick heading update, command target); multi-hit stepping
- `shared/src/sim/boost.ts` or new `slow.ts` -- bespoke slowedKinematics (boost precedent); composition order pinned
- `shared/src/sim/loadout.ts` -- EQUIPMENT_IS_WEAPON.mine flip; maxAmmo lookups follow new stats
- `shared/src/constants.ts` -- CONFIG.deck (rare weight dial), CONFIG.mine.{placeRange,placeHalfArc,chain?}, starShells damage 0, catalog step handwaves, CONFIG.upgrades DELETED, caps re-home
- `shared/src/types.ts` + `index.ts` -- OwnShip.upg/upg event strip; you.slowedUntil/dazzledUntil; ballistic update event; PV 16 + changelog
- `server/src/game/world.ts` -- ShipRecord deck state + stream; grantPoint→deck draw; spendPoint return/swap/purge/scrub; applyBoon top-up/heal/swap; strip; mine chains + self-propelled step; DoT/dazzle zone effects; homing update emission
- `server/src/game/equipment/{guns,cannon,torpedoes,mines,starShells}.ts` -- stats-driven damage/radii; barrels multi-spawn; doctrine-moded fire paths; aimed mine placement + rear-arc validation
- `server/src/game/{perception,signals,frames}.ts` -- upg row strip; ballistic update signal; dazzle sight reduction; new self-private fields
- `client/src/main.ts`, `net/roomBindings.ts`, `sim/prediction.ts` -- effectiveStats signature, slow fold in predictor, strip, homing track updates
- `client/src/ui/{upgradeMenu,boonCopy,upgradeToast}.ts` -- rarity/pips/ladders/doctrine-swap/live-value contract text; full copy rewrite; legacy label strip
- `client/src/render/{hotbar,equipmentInfo,weaponArc,fog,projectiles}.ts` + `input/mouse.ts` -- mine-as-weapon (rear arc render + aim), damage from stats, ammo badge (auto), dazzle fog shrink, homing track update
- `client/src/score.ts` -- upgrades-taken → boons count
- Tests: shared deck/boons/offers/stats/shell/barrel/loadout/damageGuardrail; server upgrades(rework)/boons/xp/mines/cannon/torpedo/starShells/perception/signals/spectator/frames/goldenFrames(regen audited)/denials(PV16)/equipment/ammo; client upgradeMenu/boonCopy coverage/hotbar/prediction/roomBindings/upgrades/weaponArc/score
- Bookkeeping: sprint-status (2-8 done), gds-workflow-status (next_expected → 2-9), deferred-work (close band-overlap + 2.5 validateBoonDef/top-up/duplicate entries; add smoke-deferral + Option D + 2.9 seams), amendments 38–46 (recorded)

## Tasks & Acceptance

**Execution (dependency order):**
- [ ] `shared` foundations -- stats/whitelist/CONFIG/wire strip + extensions, PV 16 -- everything downstream reads these
- [ ] `shared` catalog + deck + shell/slow behaviors + validation + tests -- the story's heart
- [ ] `server` world/equipment/perception integration + tests incl. goldenFrames regen -- authoritative behaviors
- [ ] `client` strip + prediction slow + card UI + copy + mine-as-weapon + tests -- the felt surface (minimal)
- [ ] Full I/O matrix covered by unit tests; damageGuardrail extended -- pins flipped deliberately
- [ ] Bookkeeping files -- per-PR protocol
- [ ] `npm run check` -- gate green (baseline 1950, target higher)

**Acceptance Criteria:**
- Given a fresh active TB/BS/ML, when levels bank, then every offer is 4 different lines drawn from that hull's deck (universal + carried subdecks + absent-equipment acquisitions), weighted by rarity with escalating rare weight, never rerolling, never expiring; picks stack by occurrence; unchosen cards return; the deck visibly thins over a match (chosen cards gone).
- Given an acquisition pick, when R fills, then the equipment arrives loaded, its subdeck joins the deck, every other acquisition card vanishes from deck AND banked offers (scrubbed offers refill deterministically), and R can never fill again.
- Given a held doctrine and its rival drawn, then the rival card face carries the swap line, picking it swaps for free, and doctrine can ping-pong across a match.
- Given the four exclusive pairs, then each doctrine's on-water behavior matches the ratified contract (arcing/AP/homing/command/self-propelled/prop-fouling/incendiary/dazzle) under the perception rules, with homing torpedoes rendering as steering tracks to observers who legitimately see them.
- Given the baseline changes, then star shells deal zero damage everywhere, mines place at a clicked rear-arc point with the denial register on bad aims, and same-owner chains cascade while enemy mines never sympathetically detonate.
- Given any frame at PV 16, then no legacy upgrade field/event exists on the wire, and deck/offer/boons/slow/dazzle state rides `you` exclusively (perception + spectator + goldenFrames suites green).
- Given the refit window, then cards show rarity, lineage pips, ladder names by stack position, and live current→next values; the ratified floor-viewport overlap stands.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why no hooks:** every doctrine is either projectile-side (server-authoritative, client renders from events — no parity need) or a timed kinematics modifier with a self-private wire field (the boost/slow bespoke precedent, folded identically by the predictor). `HOOK_REGISTRY` stays empty; the parity suite stays armed; amendment 30's "attachment points arrive when a real boon needs them" is satisfied by none being needed.
- **Deck determinism:** all deck ops are pure functions over (state, rng); the per-ship stream makes every draw/scrub/refill reproducible from (mapSeed, join ordinal, spend sequence). Tests replay full economies against injected catalogs.
- **Values are handwaves** (steps, spreads, acquire ranges, slow factor, DoT dps, dazzle factor, rare-weight dial) — implementer-drafted inside ratified pins (guardrail, torpedo-outruns-hulls, sweep 30 cap, trigger≤blast); 2-10 produces the evidence pass. Names/copy are ratified canon (amendment 42).
- **Score continuity:** "upgrades you got" (amendment 23's results modal) becomes boons fitted — same number the player experienced as picks.

## Verification

**Commands:**
- `npm run check` -- expected: lint + 3× type-check + all workspace tests green
- `npm test -w shared` -- expected: deck engine + catalog validation + doctrine shell stepping + stats suites pass
- `npm test -w server` -- expected: economy rework + doctrine behaviors + perception/goldenFrames at PV 16 pass
- `npm test -w client` -- expected: card UI rarity/pips/ladders + mine-as-weapon + slow prediction parity pass
