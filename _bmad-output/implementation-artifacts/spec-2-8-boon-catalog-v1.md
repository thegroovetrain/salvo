---
title: 'Story 2.8: Boon Catalog v1 — THE DECK MODEL'
type: 'feature'
created: '2026-07-30'
status: 'done'
baseline_revision: 'e639509'
final_revision: '01e3eed'
review_loop_iteration: 0
followup_review_recommended: true
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
- [x] `shared` foundations -- stats/whitelist/CONFIG/wire strip + extensions, PV 16 -- everything downstream reads these
- [x] `shared` catalog + deck + shell/slow behaviors + validation + tests -- the story's heart
- [x] `server` world/equipment/perception integration + tests incl. goldenFrames regen -- authoritative behaviors
- [x] `client` strip + prediction slow + card UI + copy + mine-as-weapon + tests -- the felt surface (minimal)
- [x] Full I/O matrix covered by unit tests; damageGuardrail extended -- pins flipped deliberately
- [x] Bookkeeping files -- per-PR protocol
- [x] `npm run check` -- gate green (baseline 1950, now 2063)

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

### 2026-07-30 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 14: (high 1, medium 7, low 6)
- defer: 1: (low 1)
- reject: 5: (low 5)
- addressed_findings:
  - `[high]` `[patch]` Triple-barrel one-click kill (Blind Hunter, CONFIRMED): three fan shells' bursts overlap one hull at practical ranges — 3×25 = 75 > the 70hp lightest base hull, defeating the ratified no-one-click-kill guardrail the moment gunBarrel is fitted. Orchestrator ruling: same-click salvo single-hit — shells of one click share a server-internal salvo tag and a victim takes at most ONE damage application per salvo (area throughput preserved; never on the wire). Guardrail extended to pin the salvo aggregate; regression proved a 70hp hull went to −25 without the fix.
  - `[medium]` `[patch]` AP shell invisible after first pierce (Blind Hunter): non-terminal pierce booms reused the live projectile id, so every client deleted the still-flying shell's track. Non-terminal pierce booms now carry derived ids (`id#pN`); terminal keeps the real id. Verified nothing else correlates boom ids.
  - `[medium]` `[patch]` torpU dropped for untracked torpedoes (Codex): a culled-then-re-sighted homing torpedo stayed invisible forever. onBallisticUpdate now creates the track (torpU is sight-gated server-side, so receipt implies legitimate visibility).
  - `[medium]` `[patch]` Incendiary DoT emitted 20 victim-private dmg events/s (Blind Hunter): hp application stays per-tick; the wire event now aggregates per (owner, victim) into 500ms windows with immediate flush on death/last-zone-out; kill-credit timing pinned unchanged.
  - `[medium]` `[patch]` Scrub-to-empty banked offer deadlocked the FIFO (Edge Case Hunter; Blind Hunter's impossibility argument refuted — a BANKED offer can be all-acquisition): an offer scrubbed to zero cards is now removed entirely (pts falls with offers.length, mirroring the ratified empty-deck level-without-offer rule).
  - `[medium]` `[patch]` Same-tick mine double detonation (Edge Case Hunter, premise confirmed): detonation now consumes the mine first (`mines.delete` re-check) so trigger loop + chain cascade can't detonate one mine twice.
  - `[medium]` `[patch]` Point-blank command detonation ran to the map edge (Edge Case Hunter): commanded burst distance now clamps to just past the bow spawn clearance.
  - `[medium]` `[patch]` Homing torpedo unbounded travel (Edge Case Hunter; "immortal orbit" overclaim corrected — ~25s/1521u worst case traced): homing launches now carry CONFIG.torpedo.homingMaxRangeU = 1300 (draft) and expire like edge-reached torpedoes.
  - `[low]` `[patch]` Dazzle marked victims in the weapons-safe ready room (Edge Case Hunter): all hostile zone effects now gate on the damage-enabled policy flag.
  - `[low]` `[patch]` Creeping-mine single-pass island push-out could rest inside a second island or past the rim (Edge Case Hunter): illegal steps are now rejected (mine holds position).
  - `[low]` `[patch]` Dead `offerStackSignature` with false doc (Blind Hunter): deleted; cardSignature commented as subsuming stack changes.
  - `[low]` `[patch]` Stale strip-era docs (Blind Hunter): spawnMine's Story-1.8 ability docstring and OwnShip.pts's deleted-`upg`/per-kill wording rewritten.
  - `[low]` `[patch]` Unfalsifiable deck exclusive-pair pin (Blind Hunter): replaced with consumption-≤-copies over full economy replays + both-rivals-appear coverage; engine/server division of labor commented.
  - `[low]` `[patch]` Abandoned test setup in the dazzle non-observer test (Blind Hunter): cleaned to one honest arrangement.
  - Deferred: per-tick `aliveHulls`/hulls snapshot staleness (Codex, CONFIRMED, pre-existing architecture): shells/mines/homing interact with same-tick corpses for one tick — predates 2.8; ledgered.
  - Rejected (5): no server-side auto-revert enforcement (Codex — the server keeping no priming state is the ratified architecture; reload caps bound any modified client); dazzle widening the victim's paintable radar annulus (follows the two-tier vision model — optics blinded, radar isn't; flagged to Eric below); corpse minefields keep creeping (consistent with mines staying lethal after owner death); star-shell island stops spawning no zone (spec-consistent — interception-only rule); spec Code Map naming mouse.ts unfulfilled (aim path proved generic; no defect).

## Design Notes

- **Why no hooks:** every doctrine is either projectile-side (server-authoritative, client renders from events — no parity need) or a timed kinematics modifier with a self-private wire field (the boost/slow bespoke precedent, folded identically by the predictor). `HOOK_REGISTRY` stays empty; the parity suite stays armed; amendment 30's "attachment points arrive when a real boon needs them" is satisfied by none being needed.
- **Deck determinism:** all deck ops are pure functions over (state, rng); the per-ship stream makes every draw/scrub/refill reproducible from (mapSeed, join ordinal, spend sequence). Tests replay full economies against injected catalogs.
- **Values are handwaves** (steps, spreads, acquire ranges, slow factor, DoT dps, dazzle factor, rare-weight dial) — implementer-drafted inside ratified pins (guardrail, torpedo-outruns-hulls, sweep 30 cap, trigger≤blast); 2-10 produces the evidence pass. Names/copy are ratified canon (amendment 42).
- **Score continuity:** "upgrades you got" (amendment 23's results modal) becomes boons fitted — same number the player experienced as picks.

## Auto Run Result

**Status:** done — planned against the 2026-07-30 brainstorm (THE DECK MODEL), Eric-ruled pre-implementation (amendments 38–46: the brainstorm/party AC amendment plus eight AskUserQuestion rulings across two rounds), implemented in three orchestrated waves (shared → server → client), adversarially reviewed (2 Fable hunters + Codex cross-model), 14 patches applied with fail-without-fix regressions, gate green.

**Summary:** The interregnum is over. Every player now has a personal card deck (universal Intel/Ship/Gun lines + one subdeck per carried equipment + acquisition cards for absent equipment); each level draws 4 different lines (weighted, escalating rare weight as invisible soft pity), chosen cards leave the deck, unchosen return, copy-counts ARE the caps. The 42-line Boon Catalog v1 ships with ratified ladder names (HEAVY SHELLS Mk I–V … ARMORED CITADEL), rarity tiers, and four exclusive doctrine pairs with real on-water behavior: PLUNGING FIRE (arcing, un-interceptable) ⚔ ARMOR-PIERCING SHELLS (3-hull pierce 100/50/25), ACOUSTIC HOMING (steering fish + torpU wire updates) ⚔ COMMAND DETONATION (point-det at click, radar-capped), SELF-PROPELLED ⚔ PROP-FOULING mines (creep / victim slow via self-private slowedUntil), INCENDIARY ⚔ DAZZLE star shells (DoT zones / truesight reduction + honest fog shrink). Doctrine swaps are free and ping-pong (rival returns to the deck). R-slot acquisitions arrive loaded, purge remaining equipment cards, and scrub banked offers deterministically. Baseline kit changes: star shells are damageless illumination, the mine is a click-aimed rear-arc weapon (placeRange 90, denial register on bad aims), mine chains cascade same-owner-only. Damage/blast/trigger/barrels/modes are promoted onto effectiveStats (rangeU now derives from folded radarRange — Intel is a stealth offense category); hull cards heal what they grant; capacity raises arrive loaded. The 14 legacy upgrades are stripped wholesale (OwnShip.upg, upg event, applyUpgrade/applyGrantEffects, UPGRADE_*/CONFIG.upgrades all gone), PV 15→16. The refit cards carry rarity tags, lineage pips (II/V), name-by-stack-position, live current→next contract text, and doctrine-swap lines; the floor-viewport band overlap is ratified per amendment 40. Tests 1950 → 2081.

**Files changed:** shared — sim/boons.ts (BoonDef rarity/copies/exclusiveWith/healOnGrant + doctrine effect kind, 42-line catalog, validateBoonDef/validateCatalog), sim/deck.ts (NEW pure deck engine), sim/offers.ts (gutted to BoonOffer), sim/stats.ts (new stat surface + derived rangeU + clamps, counts param stripped), sim/shell.ts (arcing/pierce/homing stepping + salvo tag), sim/slow.ts (NEW), sim/loadout.ts + sim/arcs.ts (mine as sector-arc weapon), constants.ts (CONFIG.deck/mine/torpedo/starShells additions, upgrades deleted), types.ts + index.ts (upg strip, slowedUntil/dazzledUntil, torpU, PV 16). server — game/world.ts (per-ship deck + deckRng, deck-driven grant/spend with return/swap/purge/scrub + empty-offer drop, applyBoon heal/top-up/swap, salvo ledger, mine chains/creep/foul, zone DoT aggregation + dazzle, torpU emission), equipment/* (stats-driven damage everywhere, barrel fan, doctrine fire paths, aimed mine placement, decoy stern-drop rehome), perception/signals/frames (torpU row, dazzle sightOf, self-private slow/dazzle, upg row gone), goldenFrames regenerated + audited. client — strip + effectiveStats signature, prediction slow-fold (boost→slow→hooks pinned), mine-as-weapon seams (sector arc at placeRange + range parity gate), torpU track create/update, dazzle fog shrink, card UI (rarity/lineage/doctrine lines, chip-first pin held), ui/boonCopy.ts full rewrite (ratified ladders + live-value contract text), score → BOONS FITTED. Bookkeeping — sprint-status 2-8 done, gds-workflow-status advanced to 2-9, deferred-work closures + new entries, amendments 38–46 recorded pre-implementation.

**Review breakdown:** 14 patches (1 high, 7 medium, 6 low), 1 deferred, 5 rejected, 0 intent gaps, 0 bad-spec loopbacks. The high (triple-barrel one-click kill breaching the ratified guardrail) was killed by the same-click salvo single-hit rule; every behavioral patch carries a regression test proven to fail without the fix. Cross-model picture: Codex confirmed the torpU-track gap the family missed; its auto-revert "exploit" was rejected against the ratified no-priming-state architecture; the hunters' scrub-deadlock disagreement was adjudicated by construction (reachable — patched).

**Verification:** `npm run check` run independently by the orchestrator after every wave AND after the patch round — lint 0 errors (2 pre-existing warnings), shared 351 / server 755 / client 975 = 2081 green. Wave diffs spot-checked hunk-by-hunk (deck draw weighting, salvo ledger, DoT buckets, scrub filter, pierce id derivation).

**Residual risks / notes for Eric:** (1) All step values, spreads, ranges, the rare-weight dial, and doctrine factors are draft handwaves inside ratified pins — 2-10's batch-sim owns the evidence pass (time-to-first-exclusive especially). (2) Dazzle blinds truesight but NOT radar, so a dazzled victim's sweep can still paint blips in the stolen band — my ruling from the two-tier vision model; say the word if DAZZLE should suppress radar too. (3) The exclusive rarity text color sits in the storm purple family (readout register) — flagged for your sign-off in 2.9's identity pass. (4) AP shells' later pierce hits and prop-fouling's victim slow have no dedicated presentation yet; card text can overflow on the longest doctrine cards; hotbar tooltip still renders boons as absence — all 2.9 territory, ledgered. (5) Codex's pre-existing find (per-tick hull snapshot lets shells/mines interact with same-tick corpses for one tick) is ledgered, not fixed here.

## Verification

**Commands:**
- `npm run check` -- expected: lint + 3× type-check + all workspace tests green
- `npm test -w shared` -- expected: deck engine + catalog validation + doctrine shell stepping + stats suites pass
- `npm test -w server` -- expected: economy rework + doctrine behaviors + perception/goldenFrames at PV 16 pass
- `npm test -w client` -- expected: card UI rarity/pips/ladders + mine-as-weapon + slow prediction parity pass
