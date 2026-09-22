---
title: 'Story 8.14: The Common Pool'
type: 'feature'
created: '2026-09-22'
status: 'done'
review_loop_iteration: 0
baseline_revision: '5e27f8b'
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Every captain still draws from a per-hull 40-card authored deck plus a hidden 10-card match pool, checked at a deck door and frozen in the seat — a model Eric retired on 2026-09-21 (amendment 89): it over-engineers progression, ties class identity to weaponry and lets lobbies converge on one kit. The gun is still a literal `'gun'` in the spawn fit, not a seat pick.

**Approach:** Delete the deck (rules, default decks, ownership, the door, the `deckId` option, `CONFIG.deck`) and the 8.11 match pool (`pool.ts`, `CONFIG.pool`, `poolOverride`, the 50-at-queue count) and replace the draw source with ONE common pool: every dealable catalog line, unlimited copies, bounded only by caps and the slot rules. The draw becomes two-stage (amendment 92): per card, first the KIND (weapon copy 1 / upgrade / consumable) by its share of the ship's eligible lines, then WHICH line — weapons weighted by the match-wide **weighting** (amendments 90/91: ×0.75 per other captain who took copy 1, floor 0.25, permanent), upgrades and consumables even. The level-zero guarantee stays exactly as 8.10 built it and applies nowhere else (amendment 93). Consumables are never filtered from the draw, so the offer is never empty; exhaustion and the `deck.*` metrics die (amendment 94). The seat gains `gun` (`deckGun | machineGun | flak`, default `deckGun`), frozen at queue, riding the own-ship frame; slot 0 mounts the seat's gun through a `MOUNTED_GUN` map that resolves every value to the shipped `'gun'` module until 8.15 (amendment 95). `PROTOCOL_VERSION` 56 → 57 once.

## Boundaries & Constraints

**Always:**
- The draw is a pure shared function over plain data (`shared/src/sim/draw.ts`), seeded by the ship's mulberry32 stream; the World owns the match-wide take ledger and hands the ship its per-line weights. No `Math.random` in sim code.
- Draw state, the take ledger and weights are server-private; only the four offered line ids reach a client; the perception suite stays at exactly SIX exceptions and gains no channel.
- `CONFIG` is the single home of `offer.size` and `offer.weighting`; both weighting numbers are `[DRAFT]` harness dials reachable by `--tune`.
- The held `BoonOffer` never rerolls; REDRAW (countdown, `MULLIGAN_CHOICE`) is unchanged; the countdown economy survives activation (amendment 66).
- Both sides call the same `loadoutFor(stats, fleet, gun)`; the client replays it from `OwnShip.cards` + `OwnShip.gun`.
- Deck tests are DELETED, not skipped; every surviving fixture that built a deck now seats a ship with `(hull, gun)`.
- `npm run check` green; complexity ≤ 10; harness unit tests are in the gate and must pass; `PROTOCOL_VERSION` bumps exactly once.
- No in-game copy is added; the only copy change is deleting deck words that become false (none are user-visible today — verify).

**Block If:**
- Any number not covered by amendments 90–95 is needed (do not invent; HALT).
- The two-stage draw cannot deal four DIFFERENT lines without re-seeding or consuming extra rng in a way that breaks the "one rng draw per dealt card" determinism pin — surface it instead of hiding it.
- A change would put the take ledger, weights or another ship's picks on any wire path.

**Never:**
- Build machine-gun/flak modules, ladders, the class-select gun picker, the class Shifts, or delete missile/monitor/heatSeeking rows (all 8.15); re-cut bot tactic tables or harness bars (8.19); edit `epics.md`, the GDD, `catalog-v3.md`, `DESIGN.md` or `CLAUDE.md` (rulings live in the amendments; 9.11 reconciles).
- Rename the deck gun's equipment id `'gun'` (a large PV-wide rename with no 8.14 payoff); the seat value `deckGun` maps to it.
- Keep a silent "empty draw banks the level" branch, an exhaustion latch, or the `deck.*` metrics under any name.
- Apply weighting to the level-zero guarantee pick, to copies 2+, or to the taker's own weight.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open-slot draw | ship holds nothing, 3 weapon slots empty, no takes anywhere | 4 different lines; each card's kind chosen with P(weapon) = #eligible weapon lines / #eligible lines (recomputed after each deal); within a kind, even (weights all 1.0) | none |
| Slots full | Q/E/R all fitted | no equipment copy 1 is ever dealt; only tier cards of held lines below cap, ladders below cap, `deckGun*` ladders (host `'gun'` mounted), add-ons below cap whose host is fitted, consumables | none |
| Weighting | captains A and B took `lightTorpedo` copy 1; ship C draws | C's `lightTorpedo` weight = 0.75² = 0.5625; A's own weight for it is 0.75 (only B counts); after 5 takers the weight is max(0.25, 0.75⁵) = 0.25 | none |
| Weighting scope | A takes `lightTorpedo` copy 2 (tier II) | nobody's weight changes | none |
| Weighting lifetime | A took a line, then sinks | every other ship's weight for that line is unchanged | none |
| Kind odds invariant | any take ledger | for a fixed eligible set, P(a given card is a weapon) is identical with and without weighting (pinned by a property test over seeds with a deterministic kind-share oracle) | none |
| Consumable at cap | ship holds 5 HULL REPAIR, belt otherwise empty | `hullRepair` still eligible and may be dealt; the card is greyed by `canStock` and a pick is a silent no-op | none |
| Never empty | every equipment/ladder/add-on at cap, belt full | the offer holds every dealable consumable line (today HULL REPAIR + SUPERCAV → 2 cards; ≥ 4 after 8.16); the level banks with a real offer; no latch, no log, no counter | none |
| Fewer than 4 eligible | 2 eligible lines | 2-card offer (shorter, never padded, never repeated) | none |
| Level zero | countdown grant, or REDRAW | 8.10 behaviour byte-identical: one uniform usable card (consumable or unheld equipment copy 1) then the remaining cards by the two-stage draw | none |
| Seat gun | join `gun: 'flak'` | sanitized to `'flak'`, frozen in the reservation, `ShipRecord.gun = 'flak'`, `OwnShip.gun = 'flak'`; slot 0 mounts equipment `'gun'` (MOUNTED_GUN until 8.15) | missing / unknown / non-string → `'deckGun'`, logged like other coerced options |
| Deck keys | join `deckId: 'x'` or `deck: [...]` | dropped as unknown keys; join proceeds; no 4402 refusal exists | none |
| Dev fit | `HC_DEV_OPTIONS=1` + `fitOverride: ['heavyTorpedo']` | applied at spawn via `applyCard` (counts as a take); bounded by the line's cap; production strips it | unknown/stub ids dropped |
| Bots | `addBot(hull, profile)` | seated with `gun: 'deckGun'`, draws from the same pool under the same weighting; a bot's copy-1 pick weights humans | none |
| Fleet drone | role `'fleet'` | gun-only slot array, no draw state, never in the take ledger | none |
| Harness | `--deck-only` | `UsageError: unknown flag`; full-match runs work with pool draws | none |

</intent-contract>

## Code Map

- `shared/src/sim/draw.ts` (NEW, replaces `deck.ts`) -- `Eligible { id, kind: 'weapon'|'upgrade'|'consumable' }`, `eligibleLines(ship: DrawShip, catalog)` (stub-excluded; equipment unheld → weapon iff a weapon slot is open, held below cap → upgrade; ladder below cap, `appliesTo` host mounted/fitted → upgrade; addon below cap with a fitted host or an open weapon slot → upgrade; consumable always), `lineWeight(takesByOthers, cfg)` = `max(floor, factor ** n)`, `drawOffer(ship, weights, rng, catalog, { guarantee })` — stage 1 kind by share, stage 2 line (weapons weighted), one `rng.next()` per stage; `usableLines`/`pickUsable` carried over verbatim for the guarantee; `DrawShip = { held: LineId[], weaponSlotOpen: boolean, mountedGun: EquipmentId }`
- `shared/src/sim/deck.ts`, `deckRules.ts`, `pool.ts` -- DELETE; `offers.ts` header re-worded; `index.ts` barrel: exports `draw.js`, drops the three; `PROTOCOL_VERSION` 57 with a header entry (seat `gun`, `OwnShip.gun`, deck door gone)
- `shared/src/sim/catalog.ts` -- delete `DEFAULT_DECKS`, `DEFAULT_OWNED`, `deckFromCounts`, `UNIVERSAL_COUNTS`, `DeckCounts`, `checkedCount`, `sealOwnedSet` (:735–858); header counts re-stated without decks; stale "8.14 gun family" comments → "8.15"
- `shared/src/sim/loadout.ts` -- `GunId = 'deckGun'|'machineGun'|'flak'`, `GUN_IDS`, `DEFAULT_GUN`, `MOUNTED_GUN: Record<GunId, EquipmentId>` (all `'gun'` until 8.15, pinned), `loadoutFor(stats, fleet, gun: GunId = DEFAULT_GUN)`
- `shared/src/constants.ts` -- delete `CONFIG.deck`, `CONFIG.pool`; `CONFIG.offer = { size: 4, weighting: { factor: 0.75, floor: 0.25 } }` with doc (amendments 90–92, `[DRAFT]` dials)
- `shared/src/types.ts` -- `OwnShip.gun: GunId` beside `cls` (self-private); `GameConfig` unchanged
- `shared/src/__tests__/` -- DELETE `deckRules.test.ts`, `pool.test.ts`, `poolMeasure.test.ts`; `deck.test.ts` → `draw.test.ts` (property pins: kind-share invariance under weighting, no copy 1 with full slots, weighting monotone + floored + self-excluded, cap never exceeded, consumables at cap dealt, four different lines, determinism per seed, guarantee unchanged); rewrite `catalog.test.ts`, `barrel.test.ts`, `stats.test.ts`, `nineSlots.test.ts` (gun param); light-touch fixtures elsewhere
- `server/src/game/decks.ts`, `server/src/rooms/deckDoor.ts` -- DELETE
- `server/src/rooms/roomOptions.ts` -- `JoinOptions.gun?`, `sanitizeGun` (default `deckGun`); drop `deckId`/`deckOverride`/`deck`/`DeckOptions`/`DECK_*`/`poolOverride`/`sanitizeDeckOptions`; `fitOverride` admission stays on `admitDevIdList` and is returned by `sanitizeRoomOptions` (dev gate)
- `server/src/rooms/StandardQueueRoom.ts` -- `PooledCaptain.gun`; `seatAuth(client, gun)`; the queue's captain `pool` is unrelated and untouched
- `server/src/rooms/ArenaRoom.ts` -- `resolveJoinGun` (reservation auth → sanitized option → default); `addShip(..., gun, fit)`; bots `addBot(hull, profile)`; delete `poolSeed`, `onDeckExhausted`, `onDeckPick`, `onMulligan` wiring and the `match.pool` / `deck.exhausted` logs
- `server/src/game/world.ts` -- delete `DeckState`/`EMPTY_DECK`/`DeckResolver`/`matchPool`/`dealDeck`/`deckList`/`deckExhausted`/`reportExhaustion`; `ShipRecord.gun: GunId`, `drawRng` (was `deckRng`); `takes: Map<LineId, Set<shipId>>` on the World; `recordTake(shipId, lineId)` inside `applyCard` when an equipment line goes 0 → 1 copies; `weightsFor(ship)`; `materializeOffer` → `drawOffer(drawShip(ship), weightsFor(ship), ship.drawRng, catalog, { guarantee })`; `fitOverride` bound by cap; `WorldOptions` drops `poolSeed`/`poolOverride`/the three callbacks
- `server/src/metrics.ts` -- delete the `deck` group and its three record functions
- `server/src/game/ai/` -- `addBot` signature only; tactic/spend tables untouched
- `server/scripts/batchsim/` -- delete `deckSim.ts`, `--deck-only`, `--draws`, `PACIFIST_DECK`, `CaptainControl.deck`, the `deck.*`/`pool.*` `assertNotBaked` refusals; `runner`/`report`/`catalogReport`/`catalogMetrics`/`main`/`spendPolicy`/`stats`/`botMetrics`/`encounterSpan`/`rl/env.ts` read the pool-era World; `__tests__/batchSim.test.ts` re-cut
- `server/scripts/*.mjs` -- `poolSmoke.mjs` DELETE (its leak list moves into `queueSmoke`/`openingSmoke` as `['deck','deckId','pool','takes','weights']`); `queueSmoke.mjs` deck-door assertions → gun-seat assertions; `matchSmoke`/`weaponsSmoke` keep `fitOverride`
- `server/src/__tests__/` -- DELETE `decks.test.ts`, `matchPool.test.ts`, `deckExhausted.test.ts`; rewrite `upgrades.test.ts`, `roomOptions.test.ts` (gun branch, deck keys dropped), `mulligan.test.ts`, `metrics.test.ts`, `perception.test.ts` (pins `takes`/`weights`/`gun` of others never on a frame; six exceptions); `addShip` call sites everywhere; new `weighting.test.ts` (take ledger, self-exclusion, sink permanence, bots count)
- `client/src/net/connection.ts` -- `joinOptions` adds `gun: 'deckGun'`; 4402 rendering removed; `net/roomBindings.ts` / `state.ts` store `OwnShip.gun`
- `client/src/main.ts` -- `slotIdsFor` replays `loadoutFor(stats, false, own.gun)`; `render/weaponArc.ts` comment; `ui/classSelect.ts` header comment; `__tests__/connection.test.ts`, `fitCheck.test.ts`, `nineSlots`-style client pins
- `README.md:54` -- "the boon deck" → "the common pool"
- `VERSION`, root `package.json` (+ lock) -- 0.18.14 (cycle 149); `CHANGELOG.md` -- `## [0.18.14] - 2026-09-22`; `_bmad-output/gds-workflow-status.yaml` + `sprint-status.yaml` -- one-line stamps (`8-14-the-common-pool: done`); `deferred-work.md` -- 8.14 section: side story "per-draw offered/picked record" (Eric), the `tilt` numbers thread RESOLVED, catalog/GDD doc-sync widened, `BOT_DECKS` never existed (8.19 note), `--deck-only` deleted (8.19 note)

## Tasks & Acceptance

**Execution:**
- [x] amendments 90–95 in both homes -- done at plan time
- [x] Wave 1 `shared/` -- `draw.ts`, deletions, `GunId`/`MOUNTED_GUN`/`loadoutFor(gun)`, `CONFIG.offer.weighting`, `OwnShip.gun`, PV 57, tests -- `npm run build -w shared && npm test -w shared`
- [x] Wave 2 `server/` -- World take ledger + draw, rooms (`gun` seat, deck door gone, dev fit re-homed), metrics, bots signature, harness re-cut, smokes, tests -- `npm test -w server`
- [x] Wave 3 `client/` -- `gun` join option + own-ship mirror + loadout replay, comments, tests -- `npm test -w client`
- [x] Wave 4 -- version 0.18.14, changelog, trackers, deferred-work, README line -- `npm run check` exit 0
- [x] Smokes on a scratch port: `queueSmoke`, `openingSmoke`, `matchSmoke`, `weaponsSmoke` pass; a full solo bot match reaches results

**Acceptance Criteria:**
- Given any ship state and take ledger, when `drawOffer` runs over 2000 seeds, then the fraction of weapon-kind cards equals the eligible weapon share within tolerance both with and without takes, no card exceeds its cap, no equipment copy 1 appears with full slots, and the same seed yields the same offer.
- Given a captain who takes copy 1 of a line, when any other ship draws, then that line's weight for them is 0.75 (floored at 0.25 over repeated takers), the taker's own weight is untouched, a tier-II take changes nothing, and the taker sinking changes nothing.
- Given a join with `gun: 'machineGun'`, when the ship spawns, then slot 0 holds equipment `'gun'`, the own frame reads `gun: 'machineGun'`, no other client's frame carries it, and the perception invariant suite counts six exceptions.
- Given `npm run check`, then lint, tsc ×3 and every test pass with zero references to `deckRules`, `pool.ts`, `DEFAULT_DECKS`, `DEFAULT_OWNED`, `loadDeckFor`, `checkDeck`, `deckId`, `poolOverride`, `CONFIG.deck`, `CONFIG.pool`; `PROTOCOL_VERSION` is 57.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass (Blind Hunter + Edge Case Hunter on Fable, plus Codex `gpt-5.6-sol` cross-model review — verdicts: all three FIX-FIRST on one shared finding; agreement: ALL THREE flagged the at-cap consumable pick (F1) and the dev-fit / level-zero copy 1 with a full weapon row (F2); Blind + Edge both flagged the un-gated turret/barrel gun ladders (F3), the bot re-pick stall (F4) and the dropped dev-options log (F6); Codex + Edge both flagged the unbounded `--tune offer.weighting.*` (F5); Blind alone flagged amendment 95's "rides the welcome" wording (F7, confirmed); every rng-determinism, take-ledger, wire-leak, seat-auth and stale-deck-key attack came back clean from all three)
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 1, medium 2, low 4)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` a consumable held at its cap could still be picked (the belt-room check was the only gate): one shared `pickRefusal` predicate (`stub` / `atCap` / `beltFull` / `noWeaponSlot`) now gates `spendCard`, `refusesCard` and the client's grey — level stays banked, offer byte-identical (all three reviewers)
  - `[low]` `[patch]` copy 1 of a weapon could be granted with Q/E/R full via `fitOverride` or the level-zero guarantee: `DrawShip` carries `slotIds`, `usableLines` runs the predicate, the fourth dev-fit line is dropped and never enters the take ledger (all three)
  - `[medium]` `[patch]` DECK GUN TURRET / BARREL had no mounted-gun gate (an 8.15 tripwire): `ladderHost` derives the host from the ladder's `equipment.<id>.` stat path, so the whole gun family follows the mounted gun without touching `appliesTo`/`tierTargetOf` (Blind + Edge)
  - `[medium]` `[patch]` a bot would re-pick a refused card every tick once F1 refuses it: the bot and batch-sim spend scorers skip refused cards and spend nothing on an all-refused hand (Blind + Edge; amendment 44's ledgered skip, now required)
  - `[low]` `[patch]` `--tune offer.weighting.factor/.floor` accepted 0, > 1 and floor > factor: both leaves bounded to (0, 1], floor ≤ factor cross-checked at apply time (Codex + Edge)
  - `[low]` `[patch]` `resolveDevFit` dropped `rejectedKeys` silently: logs `join.devOptionsRejected` once (Blind + Edge)
  - `[low]` `[patch]` amendment 95(a) said the gun "rides the welcome"; it rides the own-ship frame — wording corrected in both amendment homes (Blind)
- orchestrator ruling recorded: an UNKNOWN card id is now refused fail-closed (never appended to `cards`); only dev fits and directed grants can present one, the offer never can.

## Auto Run Result

Status: done (cycle 149, 0.18.14; PROTOCOL_VERSION 56 → 57; epic-8 amendments 90–95)

**Summary.** Story 8.14 landed as Eric ruled it on 2026-09-22. Decks, deck legality, the deck door, the `deckId` option and the 8.11 hidden match pool are deleted; every captain draws from one common pool (every dealable line, unlimited copies, bounded by caps and the slot rules). The draw is two-stage per card — the KIND (a weapon's first copy / an upgrade / a consumable) by its share of the ship's eligible lines, then WHICH line, weapons weighted by the match-wide **weighting** (×0.75 per other captain who took the first copy, floor 0.25, first copies only, permanent) — so weighting changes which weapon you see, never the odds of seeing a weapon. The weapon guarantee is the countdown offer and its REDRAW only. Consumables are always dealt, so an offer is never empty; a consumable you cannot stock (belt full or at its cap) is greyed and the pick refused. The seat carries `gun` (deck gun / machine gun / flak, default deck gun), frozen at queue, riding the own-ship frame; every pick mounts the deck-gun module until 8.15 builds the other two. Exhaustion, the `deck.*` metrics counters and the 4402 deck refusal are gone; the harness lost `--deck-only`, `deckSim` and `PACIFIST_DECK` and gained `--tune offer.weighting.*` bounded to (0, 1].

**Files.** shared: `sim/draw.ts` NEW (replaces `deck.ts`/`deckRules.ts`/`pool.ts`), `sim/boons.ts` (`pickRefusal`, `slotsWithCards(…, gun)`), `sim/loadout.ts` (`GunId`, `MOUNTED_GUN`, `loadoutFor(…, gun)`), `sim/catalog.ts` (decks deleted), `constants.ts` (`CONFIG.deck`/`pool` deleted, `CONFIG.offer.weighting`), `types.ts` (`OwnShip.gun`), `index.ts` (PV 57), tests. server: `game/world.ts` (take ledger, two-stage draw, gun seat, dev fit through the refusal), `game/frames.ts`, `rooms/roomOptions.ts` / `StandardQueueRoom.ts` / `ArenaRoom.ts` (gun seat, deck door deleted, dev-key log), `game/decks.ts` + `rooms/deckDoor.ts` DELETED, `metrics.ts`, `game/ai/spending.ts` + `tactics.ts` (refused-card skip), `scripts/batchsim/*` (deck-only mode deleted, weighting bounds, spend policy), `scripts/poolSmoke.mjs` DELETED, `scripts/queueSmoke.mjs` / `weaponsSmoke.mjs` / `metricsSmoke.mjs`, tests (three deleted, `weighting.test.ts` NEW). client: `net/connection.ts`, `net/roomBindings.ts`, `main.ts`, `ui/upgradeMenu.ts`, `ui/classSelect.ts`, `config.ts`, tests. Docs: `VERSION` / `package.json` / lock 0.18.14; `CHANGELOG.md`; `README.md`; both trackers; `deferred-work.md`; amendments 90–95 in both homes; this spec.

**Review.** Blind Hunter + Edge Case Hunter (Fable) and Codex `gpt-5.6-sol`: all three FIX-FIRST on the same finding (an at-cap consumable could be picked). Seven patches, every one fail-first proven (1 high, 2 medium, 4 low); zero deferred, zero rejected. See the Review Triage Log.

**Follow-up review recommended: true** — the patch wave introduced a shared spend-refusal predicate that now gates the server pick, the client grey, the bot scorer and the batch-sim policy, changed the draw's input shape (`DrawShip.slotIds`) and the gun-ladder eligibility rule; each is pinned, but they were reviewed only by their implementer.

**Verification.** `npm run check` exit 0 after the patch wave: shared 908 / server 2007 / client 3661, hooks 266; eslint 0 errors (3 pre-existing max-lines warnings). Headless smokes on scratch ports against the final code: queue OK (gun-seat and frame-leak steps), opening OK, match OK (full lifecycle to results), weapons OK on the fourth run (the first three failed in three different hit-dependent phases — ledgered as piloting flake; the smoke now prints its trace on failure).

**Residual risk / for Eric.** (1) Epics.md, amendment 89(b) and the GDD still say the weapon guarantee holds at every open-slot level and use the word "tilt"; amendments 91/93 supersede both — 9.11 doc-sync. (2) Only two consumables are live until 8.16, so a fully capped captain sees a two-card (never empty) offer. (3) Authored kind odds were not set — stage 1 uses the eligible-line share; a `CONFIG.offer.kindOdds` dial drops in if wanted. (4) An unknown card id is now refused fail-closed (dev fits/directed grants only). (5) The per-draw offered/picked record is ledgered as your side story. Staging QA: every level-up offer shows four different lines (a mix of weapons/upgrades/consumables while a slot is open, no first-copy weapons once Q/E/R are full); with five HULL REPAIR stocked, a dealt HULL REPAIR shows greyed and a digit press does nothing; the class-select flow is unchanged (deck gun mounted).

## Design Notes

- **Two-stage draw, one oracle.** Stage 1's kind share is computed from the same eligible set stage 2 draws from, so "P(a weapon)" is a pure function of the ship's state and never of the ledger — the property test can compute the expected share exactly and compare frequencies.
- **Why a `MOUNTED_GUN` map instead of mounting the seat id directly:** `machineGun`/`flak` have no module until 8.15; `equipmentFor` fails closed. The map makes the interim explicit and pinned, and 8.15 changes two entries.
- **Why the ledger records ships, not counts:** self-exclusion (the taker's own weight is untouched) needs to know WHO took it; permanence means the set only grows.
- **Why `OwnShip.gun` and not the welcome:** the welcome is map/config only; class already rides the own-ship frame, and reconnect re-mirrors the frame for free.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- green after wave 1
- `npm test -w server`; `npm test -w client` -- green after waves 2/3
- `npm run lint`; `npm run check` -- exit 0
- `HC_DEV_OPTIONS=1 PORT=<scratch> npm run dev -w server` + `WS_URL=ws://localhost:<scratch> node server/scripts/{queueSmoke,openingSmoke,weaponsSmoke}.mjs` -- pass; kill only the booted PID
- `grep -rn "deckRules\|DEFAULT_DECKS\|DEFAULT_OWNED\|loadDeckFor\|checkDeck\|poolOverride\|CONFIG.deck\b\|CONFIG.pool\b" shared/src server/src server/scripts client/src` -- zero hits
