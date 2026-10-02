---
title: 'Drone kills drop consumables: 50 % rolls by drone size, into the belt, with the STOCKED toast'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: '9693e574'
final_revision: '46c86f8b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Sinking a PvE drone pays only XP. Eric (2026-10-01): the captain who gets the last hit on a drone should also roll for consumables — one 50 % roll for a small drone, two for a medium, three for a large (0–1 / 0–2 / 0–3 items) — each a random consumable into the belt; with a full belt the pick is limited to the lines already held; and the player sees a quick notification that they gained an item.

**Approach:** Server-only roll at the one place a drone kill is credited (`World.creditKill`, the fleet-hull branch), for an AFLOAT PARTICIPANT killer (human or bot — Eric: same rule for every participant). Per roll: a seeded coin (`CONFIG.droneDrops.chance = 0.5`) off a NEW dedicated World rng stream; on success, a uniform pick over the live consumable lines the ship could legally take RIGHT NOW by the refit card's own predicate (`pickRefusal === null`: not a stub, under its cap of 5, and if the belt is full only a line already held — Eric's rule, with the cap exclusion as the orchestrator's reading he approved); an empty eligible set wastes the roll. The copy lands through `applyCard` (so `cards` and the belt fold stay the single truth and the client's belt rebuilds from `OwnShip.cards` as today). A new self-private event `{k:'dp', id, boon}` rides to the killer only; the client shows the existing `◆ <LINE> STOCKED` toast (Eric: reuse it) plus the belt fit flash and the stock tone, WITHOUT the spend ack. `PROTOCOL_VERSION` 67 → 68 (new event kind). Version 0.18.27, cycle 162.

## Boundaries & Constraints

**Always:**
- Numbers are Eric's and live in `CONFIG.droneDrops` (`shared/src/constants.ts`): `chance: 0.5`, `rolls: { droneSmall: 1, droneMedium: 2, droneLarge: 3 }`. Nothing else is tuned.
- The roll happens exactly where drone-kill XP is credited, with the SAME killer (`by` on the damage that sank it — mine, torpedo, shell, burst or burn owner alike; storm/self/unattributed → nobody). Only an afloat participant (`isParticipant(killer) && isAfloat(killer.lifecycle)`) rolls; a fleet hull never does; a sinking killer gets XP as today but no drop.
- Randomness: a NEW World stream `dropRng = mulberry32((seed ^ 0x27d4eb2f ... pick an unused constant) >>> 0)` — never the spawn stream, never a ship's `drawRng` (offers must not shift), never `Math.random`. Draw the coin float for every roll; draw the pick only when the coin passes and the eligible set is non-empty. Eligibility is recomputed per roll (a first drop can fill the fourth belt slot and narrow the second).
- Eligible set = catalog lines of `kind === 'consumable'` with `pickRefusal(ship.cards, slotIds, line) === null` (DEPTH CHARGE is a stub and never drops). One predicate — the refit card's — never a second legality rule.
- The copy enters via `World.applyCard` (it re-checks refusal, pushes to `cards`, refolds, stocks the belt). The event is queued only when the stock actually landed (compare `boonStackCount` before/after or trust `applyCard`'s result).
- Wire: `DropEvent { k: 'dp'; id: PlayerId; boon: string }` added to `GameEvent` in `shared/src/types.ts`; `signals.ts` row via `selfPrivateSignal('dp', false)` (widen its generic); it is SELF-PRIVATE (`e.id === observerId`), NOT a seventh fog exception — the SIX stay. `perception.test.ts`: add the `dp` verifier, EVENT_KINDS 18 → 19, registry row count 24 → 25; `signals.test.ts` row-shape pins extended. No forbidden key names (`deck`, `pool`, `taken`, `hands`, `record`, …). Bump `PROTOCOL_VERSION` 67 → 68 with a changelog entry in `shared/src/index.ts`.
- Client (`client/src/net/roomBindings.ts` `handleRewardEvent`): `dp` → toast `boonFitToastLine(e.boon, boonStackCount(you.cards, e.boon), 'consumable')`, the consumable fit tone, `onBoonFitted` (belt flash) — and NOT `onSpendAck` (no spend happened). Gate dead/spectating like `handlePoint`. One toast line per item; the stack's cap of 3 lines stands.
- Bots: same server rule; no bot-only code. Their existing tactics fire the stocked line.
- Tests pin facts and behaviour only (no vocabulary tests, amendment 211). ESLint complexity ≤ 10 — the roll is its own small helper(s), not inlined into `creditKill`.
- Docs: epic-8 amendments 213+ (Eric's rulings verbatim + orchestrator readings), one GDD bullet under the roving PvE drone fleets section (dated), CHANGELOG `[0.18.27]`, `VERSION` + root `package.json` 0.18.27, BOTH trackers one-line stamps, this spec. How-to-Play is Eric's text (amendment 212): NOT edited; reported to him.

**Block If:**
- The eligible-set rule needs a tie-break Eric did not give (it does not: uniform over the eligible list in catalog order via `rng.int`).
- A drop would have to ride any frame field other than a self-private event: HALT.
- `applyCard` refuses a line the eligibility filter accepted (the two predicates disagree): HALT and report.

**Never:**
- No drop for a captain kill, for a storm/self/unattributed drone sink, or for a sinking/sunk killer. No XP change. No `kills` tally change.
- No new in-game copy (the toast line is the existing STOCKED builder). No How-to-Play edit. No HUD counter.
- No new STEP_ORDER row. No change to the drone fleets, waves or envelopes. No match-record `hands` entry (a drop is not a hand). Do not merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Small drone, coin passes | human sinks `droneSmall`; empty belt; rng forced < 0.5 | one live consumable stocked (`cards` +1, belt slot 5 holds it), one `dp` event to the killer only | No error expected |
| Small drone, coin fails | rng forced ≥ 0.5 | nothing stocked, no event; XP paid as today | No error expected |
| Large drone, all pass | `droneLarge`, three coins pass | up to 3 copies (may repeat a line); 3 `dp` events; toast shows 3 lines | No error expected |
| Belt full | four other lines held (e.g. HULL REPAIR ×1, SHIELD BLOCK, CHAFF, DECOY BUOY), coin passes | pick is one of the four held lines only; never a fifth line | No error expected |
| Belt full, held lines at cap | four lines each at 5 copies | eligible set empty → roll wasted, no event, no throw | No error expected |
| Line at cap, belt open | HULL REPAIR ×5 in slot 5, slots 6–8 empty | HULL REPAIR excluded; pick among the other six live lines | No error expected |
| Stub line | DEPTH CHARGE | never eligible | No error expected |
| Bot killer | bot sinks a drone | same roll; copy in the bot's belt; no client involved | No error expected |
| Sinking killer | mutual destruction: killer `sinking` when credited | XP as today; NO roll | No error expected |
| Fleet-on-fleet / storm sink | `by` undefined or a fleet hull | no roll | No error expected |
| Captain victim | human sinks a human | no roll (kill XP only) | No error expected |
| Determinism | same seed, same inputs, two worlds | identical drops; spawn positions and the first refit offer are byte-identical to a world built from HEAD (streams untouched) | No error expected |
| Perception | random seeded worlds | a `dp` event appears only in its `id`'s frame; forbidden-key scans stay clean; SIX exceptions | No error expected |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- add `CONFIG.droneDrops` (`chance`, `rolls` keyed by `DroneHullId`), next to `CONFIG.xp.droneTierLevels` (~1991).
- `shared/src/types.ts` -- `DropEvent` + `GameEvent` union (~1437); doc "self-private, UX only" like `BoonFitEvent` (~1218).
- `shared/src/index.ts` -- export the type; `PROTOCOL_VERSION` 67 → 68 with a changelog line (~700–771).
- `shared/src/sim/boons.ts` -- `pickRefusal` (~340) is the eligibility predicate; `boonStackCount`.
- `shared/src/sim/catalog.ts` -- `CATALOG`, `kind === 'consumable'`, `stub`; `CONSUMABLE_IDS` in `sim/effects.ts:56`.
- `server/src/game/world.ts` -- `creditKill` (~2460) fleet-hull branch = the hook; `applyCard` (~2938); `rng` streams in the constructor (~1554–1567, pick an unused constant and document it there); `pending.push` event queue.
- `server/src/game/participants.ts` -- `isParticipant`, `isFleetHull`; `shared` `isAfloat`.
- `server/src/game/signals.ts` -- `selfPrivateSignal` (~1917), `SIGNAL_REGISTRY` rows `pt`/`bn`/`heal` (~2239–2246); header count comments.
- `server/src/__tests__/perception.test.ts` -- `EVENT_VERIFIERS` (~3670), `EVENT_KINDS` (~4391), registry length (~4395).
- `server/src/__tests__/signals.test.ts` -- row-shape / key-order pins.
- `server/src/__tests__/drones.test.ts` (~774) and `xp.test.ts` (~141) -- the drone-kill credit pins; new `droneDrops.test.ts` beside them.
- `client/src/net/roomBindings.ts` -- `handleRewardEvent` (~1297), `handleBoonFit` (~1376) as the model; `handlePoint`'s dead/spectating gate (~1331).
- `client/src/ui/boonCopy.ts` -- `boonFitToastLine` (520) — reused unchanged.
- `client/src/ui/upgradeToast.ts` -- `pushUpgradeToast`.
- Docs: `_bmad-output/implementation-artifacts/epic-8-context-amendments.md` (append 213+), `.../gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` (~281 drone section), `CHANGELOG.md`, `VERSION`, `package.json`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- add `CONFIG.droneDrops` -- Eric's numbers, single source of truth.
- [ ] `shared/src/types.ts` + `shared/src/index.ts` -- `DropEvent`, union member, export, PV 68 + changelog line -- wire contract.
- [ ] `server/src/game/world.ts` -- `dropRng` stream; `rollDroneDrops(killer, victim)` helper called from `creditKill`'s fleet branch for an afloat participant; eligibility via `pickRefusal` over live consumable catalog lines; `applyCard` + `pending.push({k:'dp', id, boon})` per landed copy -- the mechanism.
- [ ] `server/src/game/signals.ts` -- `dp` row via `selfPrivateSignal`; refresh the kind-count comments -- delivery, self-private.
- [ ] `server/src/__tests__/perception.test.ts`, `signals.test.ts` -- `dp` verifier, counts, row shape -- invariants extended for the new event.
- [ ] `server/src/__tests__/droneDrops.test.ts` -- every matrix row through real `sinkShip` credit (force the stream by seeding/monkey-patching `dropRng` on the world instance, or expose a test seam) incl. the determinism row and the "spawn/offer streams untouched" row -- behaviour pins.
- [ ] `client/src/net/roomBindings.ts` -- `dp` handler: toast + tone + `onBoonFitted`, no `onSpendAck`, dead/spectating gate; `client/src/__tests__/roomBindings*.test.ts` pin it -- the notification.
- [ ] Docs + version: amendments 213+, GDD bullet, CHANGELOG, VERSION/package.json 0.18.27, both trackers.

**Acceptance Criteria:**
- Given a human afloat sinks a large drone with the coin stream forced to pass three times and an empty belt, when the tick resolves, then three consumable copies are in `cards`, the belt holds them (stacked if the same line), and the killer's next frame carries three `dp` events and no other client's frame carries any.
- Given a belt holding four lines, when a drop passes, then the stocked line is one of those four and the belt never holds a fifth line.
- Given the four held lines are all at cap 5, when a drop passes, then nothing changes and nothing throws.
- Given a bot sinks a drone, when the coin passes, then the bot's `cards` grows by one live consumable.
- Given a world built from a fixed seed, when compared with HEAD's spawn positions and first offers, then they are identical (the new stream shares no state).
- Given `npm run check`, then lint 0 errors, tsc clean, all workspaces green, hooks green; golden frames unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol)
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 0
- reject: 9
- addressed_findings:
  - `[medium]` `[patch]` Codex CONFIRMED / Blind Hunter PLAUSIBLE: the client dead-gate swallowed a legitimate `dp` when the killer sank later in the same tick — `handleDrop` now skips only a spectating frame; pinned both ways (amendment 215c).
  - `[medium]` `[patch]` Blind Hunter CONFIRMED: a drop can make an open hand's card unpickable and the hand never rerolls — Eric: accept as designed (amendment 44's rule); two server pins added (amendment 215a).
  - `[low]` `[patch]` Edge Case Hunter: three STOCKED + one LEVEL UP in one frame overflowed the 3-line toast stack — Eric: cap raised to 4; DESIGN.md stamped (amendment 215b).
  - Rejected (amendment 215d/e): score inflation (no boon count renders since 8.21), match-record `cards` carrying drops (by design), empty-belt-key same-tick fire (feel), non-integer CONFIG rolls, consumable kind without stock effect, per-copy toast ordinal, verifier catalog source, catalog key order (pinned already), spend-latch "superseded" ack.

## Design Notes

Eric's rulings of record (2026-10-01, AskUserQuestion, all the recommended options): (1) the pick is uniform over every live consumable the ship could legally take by the refit card's predicate — a line at 5 copies is skipped, a full belt limits the pick to held lines, an empty set wastes the roll; (2) bots get drops by the same rule; (3) the notification is the existing `◆ <LINE> STOCKED` toast, one line per item. Orchestrator readings (Eric may veto): the roll follows the XP credit's killer (amendment epic-5 43: credited killer by any ordnance, mines included); only an afloat killer rolls; eligibility is re-evaluated per roll; the new event is `dp` rather than reusing `bn` because `bn` acks the client's spend latch.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean.
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: green; server gains the drop pins; client gains the handler pin.
- `npm run lint` -- expected: 0 errors (complexity ≤ 10).
- `npm run check` -- expected: the full gate green, including `check:hooks`.
