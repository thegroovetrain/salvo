---
title: 'Story 8.3: The Draw'
type: 'feature'
created: '2026-09-15'
status: 'in-progress'
baseline_revision: 'b18fba6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-legal-decks-default-decks-and-the-door.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The v3 draw engine landed piecemeal in 8.1/8.2 (`drawOffer` already draws four DIFFERENT lines weighted by copies remaining, non-consuming; `consumeCard` is the one outflow), but the story's guarantees are not all built or pinned: nothing guards a line already at its cap on the SHIP, deck exhaustion is silent to ops (no log, no `/metrics` counter), the cycle-80 exhaustion margin (`deferred-work.md` `:982`) is stale against a 23-drawable-card deck, and pity-era ledger threads (`:302`, `:459`) are still open.

**Approach:** Keep the engine (Eric 2026-09-15: the read-only draw + fit-removes-one model IS "reshuffle after every draw" — unchosen cards return at full weight next level, no exhaustion needed). Add the at-cap guard as `drawOffer(deck, rng, catalog, opts?)` with `opts.held` (the ship's fitted card ids), the once-per-ship `deck.exhausted` log via a World callback the arena adapts into its logger and a new process-wide metrics counter, pin "no `pt` on an empty draw / no draw-pile counter / no `deckLeft` on the wire", re-derive the exhaustion margin, retire the pity-era tests and stamp the three ledger threads closed. Record the three new Eric rulings as epic-8 amendments 13–15.

## Boundaries & Constraints

**Always:**

- **Eric rulings 2026-09-15 (record as epic-8 amendments 13–15 in the same PR, re-applied to `epic-8-context.md`, under "Story 8.3"):**
  - **(13) THE DRAW MODEL IS CONFIRMED.** "Fairly from what is left in the deck" = the deck reshuffles after every draw; it does NOT need to exhaust before unchosen cards re-enter. The shipped model already does this: a draw READS the pool, only a FIT removes one card. 8.3 pins it and adds the missing pieces; no new engine.
  - **(14) AN EXHAUSTED DECK PRESENTS NO OPTIONS, BUT THE LEVEL STILL BANKS.** An empty draw banks the level (chip counts it), materializes no offer, queues no `pt`, shows no TAB cue. It stays spendable only on the menu heal (client-unreachable today, `:982`) until 8.8 makes heal a card. Rejected: "does not bank", "open the band with heal only".
  - **(15) CORRECTION OF RECORD, DEFERRED TO 8.8.** Eric expected the free per-level heal to have been replaced by 1 % of missing hp per second after 30 s without taking damage; `development` still carries the 10 %-of-missing-hp-over-5 s per-level heal (`CONFIG.damageControl.levelMissingPct 0.1 / levelRegenMs 5000`) and no out-of-combat regen exists in code or docs. 8.3 does NOT touch it; Story 8.8's "check which version is live" clause resolves it with Eric. Ledger one entry.
- `drawOffer(deck, rng, catalog = CATALOG, opts: { held?: readonly LineId[] } = {})` keeps its non-consuming pair shape and its rng consumption (exactly one `rng.next()` per offered line — the upgrades test counts the stream). `held` counts copies per line; a line with `held copies ≥ line.cap` is excluded from the candidate set BEFORE weighting (never offered, never consumes an rng value). Weight = copies remaining in the pool, nothing else. Default `held = []` keeps every existing call byte-identical. `materializeOffer` passes `{ held: ship.cards }`. Pin: a deck holding a copy of a line the ship already has at cap never offers it; a legal default deck + spawn seed can never hit the guard (structural pin over all three hulls: pool copies + held copies ≤ cap for every line at spawn).
- Exhaustion: `materializeOffer` on an EMPTY draw with a non-empty bank sets `ship.deckExhausted = true` ONCE per `ShipRecord` and calls `WorldOptions.onDeckExhausted?.(ship.id)` exactly once (never again for that record, even across further levels or a redeploy of the same record). World stays free of Colyseus imports and logging: the callback is the adapter seam (same pattern as `zoneSeeds`: the caller supplies it). `ArenaRoom` supplies `(shipId) => { this.log.info('deck.exhausted', { shipId }); recordDeckExhausted(); }` (the bound logger already carries `roomId`/`matchId`, so the AC's `{ matchId, shipId }` fields ride). Bots and captains alike. A thin-but-non-empty draw (1–3 cards) is NOT exhaustion.
- `/metrics`: `server/src/metrics.ts` gains a process-wide counter `recordDeckExhausted()` and `MetricsPayload.deck: { exhausted: number }` (since process start; survives room dispose; reset by `resetMetrics()`). Count only — nothing about the pool's composition.
- Empty-draw level semantics pinned end to end (amendment 14): `bankedLevels` increments, `offer` stays `null`, NO `pt` event, `grantLevelHeal` unchanged, `spendPoint` card pick refused, `spendHeal` still accepted; the next level retries the draw (still empty → still no `pt`, no second callback). The upgrades "empty deck" block is retitled from "pinned unreachable in production" to the re-derived truth and extended with the once-only callback pin.
- Wire pins: no `deckLeft` key on `OwnShip` (`shared/src/types.ts`) — assert by a structural test over the own frame that no key named `deckLeft`, `deckSize`, `pool` or `remaining` exists; the client has NO draw-pile counter (grep pin in a client test: no `deckLeft` symbol anywhere in `client/src`). The `Tab` offer's shape is byte-identical: `you.offer` is 0–4 line ids, spend by `1`–`4`, `HEAL_CHOICE` untouched. Golden frames unchanged.
- No `PROTOCOL_VERSION` bump (pin `PROTOCOL_VERSION === 51`): no frame, schema, welcome or catalog-line change. If the implementer finds a genuine wire change, HALT and report.
- Re-derivation (`:982` / `:1995`): the terminal offer-less level now needs exactly `drawable` fits (23 today per hull; rising toward 39 as stubs flip), banking costs nothing, so it is reachable in one long match but unlikely; behaviour is amendment 14. Record it in the ledger as the resolution of `:1995` and a status stamp on `:982`; the Design Notes carry the arithmetic.
- Retired dials stamped CLOSED BY DELETION in `deferred-work.md`: `:302` (doctrine-rival ping-pong — mechanism deleted in 7-5/8.1; the harness definition "empty-or-terminal-rivals-only" collapses to "empty" — update the `deckSim.ts` / `controls.ts` header sentences that still say otherwise), `:459` (rare draw-rate drift — rarity deleted in 8.1), `:1459` (already RESOLVED by 8.1 — add the 8.3 closure line only). Tests: any test whose subject is a deleted dial is RETIRED (deleted with a one-line retirement comment), never re-pointed. Audit the four pity mentions (`shared deck.test.ts:165`, `server upgrades.test.ts:541`, `batchSim.test.ts:1299`, `botPolicy.test.ts:16`): keep the tests whose subject is a LIVE rule (the rng-count witness, the `offer.size` dial, the "nothing pity-shaped in CONFIG.deck" pin), strip stale comment prose that narrates the deleted dial as if it were the subject.
- Harness: `deckSim.ts` `deckExhaustedRate` keeps its meaning (pool empty); no rival floor. `batchSim` pins updated knowingly only if the guard changes a number (it should not — defaults never trip it; assert the ledger is byte-identical for seed 7 before/after as a self-check, then delete that scratch check).
- Version 0.18.2 → **0.18.3** (cycle 138: `VERSION` + root `package.json` + lock), one-line stamps in BOTH trackers (`_bmad-output/gds-workflow-status.yaml` `next_expected` + `# last_updated`, `_bmad-output/implementation-artifacts/sprint-status.yaml` cycle line + `8-3-the-draw: done`), `CHANGELOG.md` entry (plain words, Eric-readable), `deferred-work.md` entries as above. `npm run check` green.
- Process: worktree only; no dev server in Eric's checkout; kill what you boot; halt on any error; tests are UPDATED or RETIRED, never silently deleted; no in-game copy.

**Block If:**

- The at-cap guard changes any default-deck offer sequence (golden frames or the batch-sim seed-7 ledger move) — that means the guard is biting on a legal deck, which is a catalog/seed bug to report, not to paper over.
- A genuine wire change is needed anywhere.
- The `pt` suppression on an empty draw requires a client change (it must not: the client already reads `you.offer.length`).

**Never:**

- Touch the level heal (amendment 15), `spendHeal`/`HEAL_CHOICE` (8.8), the countdown redraw (8.10), slots (8.5), consumable stock (8.7), bots' spend policy (8.18), or `CLAUDE.md`.
- Add a draw-pile counter, a `deckLeft` field, any HUD readout, or any in-game text.
- Add rarity, class weights, pity, or any weight other than copies remaining; make the draw consume cards; reroll on refit reopen.
- Put deck contents, counts or the pool's composition on the wire, in `/metrics` beyond a count, or in a log line.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Healthy draw | 23-card pool, `held` = spawn seed | 4 DIFFERENT line ids, weight = copies; pool unchanged (same reference) | n/a |
| At cap on ship | pool holds `armor ×1`, `held` has `armor ×3` (cap 3) | `armor` never offered; other lines fill the hand; no rng value spent on it | n/a (fail-closed) |
| Default decks | each hull's default pool + its carried seed | guard never trips: pool + held ≤ cap per line (structural pin) | n/a |
| Passed-on card | level 1 offers `speed`, captain fits `armor` | level 2 draw has `speed` at full copies again | n/a |
| Thin draw | pool with 2 distinct lines | 2-card offer, `pt` queued, no exhaustion callback | n/a |
| Empty draw (first) | pool `[]`, level lands | bank +1, `offer` null, NO `pt`, `deckExhausted = true`, callback ONCE, level heal fires | n/a |
| Empty draw (again) | same ship, next level | bank +1, no `pt`, NO second callback | n/a |
| Redeploy after exhaustion | sandbox `redeployShip` of that record | pool rebuilt from `deckList`; `deckExhausted` stays true — no second log | n/a |
| Heal on exhausted level | `spendPoint(HEAL_CHOICE)` with bank > 0, offer null | accepted (unchanged); card choice `0–3` refused | n/a |
| Arena adapter | World callback fires in a room | `deck.exhausted { shipId }` logged through the bound room logger (roomId/matchId present); `/metrics` `deck.exhausted` +1 | n/a |
| Metrics reset | `resetMetrics()` | `deck.exhausted` back to 0 | n/a |
| Wire | own frame / contact / welcome | no `deckLeft`/`deckSize`/`pool`/`remaining` key; `offer` 0–4 ids | Pin |
| Determinism | same seed, same held, same pool | identical offer; `held` order irrelevant | Pin |

</intent-contract>

## Code Map

- `shared/src/sim/deck.ts:170-195` -- `drawOffer` gains `opts.held`; `pickLine` gets an `atCap` exclusion computed once per draw (line copies held ≥ `catalog[id].cap`)
- `shared/src/sim/offers.ts` -- header comment only (the at-cap rule)
- `shared/src/index.ts` -- no export change (types ride through `deck.js`); PV 51 untouched
- `server/src/game/world.ts:229` (`WorldOptions.onDeckExhausted?`), `:384-450` (`ShipRecord.deckExhausted`), `:2058-2064` (`grantPoint` comment), `:2126-2134` (`materializeOffer`: pass `{ held: ship.cards }`, once-only callback)
- `server/src/rooms/ArenaRoom.ts:454` -- `new World(..., { onDeckExhausted })` → `this.log.info('deck.exhausted', { shipId })` + `recordDeckExhausted()`
- `server/src/metrics.ts:60-70,183-200,247-260` -- `deck.exhausted` counter, payload field, reset
- `server/scripts/batchsim/deckSim.ts:1-45,203`, `controls.ts` header -- exhaustion definition sentences ("empty", no rival floor)
- Tests: `shared/src/__tests__/deck.test.ts` (at-cap guard, structural default-deck pin, rng-consumption pin); `server/src/__tests__/upgrades.test.ts:1052-1170` (empty-deck block retitled + callback once + no `pt` + redeploy); `server/src/__tests__/metrics.test.ts` (counter + reset + payload shape); `server/src/__tests__/perception.test.ts` or `frames.test.ts` (no `deckLeft`-family key); `client/src/__tests__/` (no draw-pile counter symbol); arena adapter test via the `new ArenaRoom()` idiom in `server/src/__tests__/` (callback → log + metric)
- `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,deferred-work.md,epic-8-context.md,epic-8-context-amendments.md}`

## Tasks & Acceptance

**Execution:**
- [ ] `epic-8-context-amendments.md` + `epic-8-context.md` -- record rulings 13–15 -- durable home first
- [ ] `shared/src/sim/deck.ts` + `offers.ts` + `deck.test.ts` -- `opts.held` at-cap guard, pins (guard, structural default-deck pin, rng consumption, determinism) -- `npm test -w shared` green
- [ ] `server/src/game/world.ts` + `upgrades.test.ts` -- `deckExhausted` flag, `onDeckExhausted` once, `held` passed, empty-draw block retitled and extended, redeploy pin -- `npm test -w server` green
- [ ] `server/src/metrics.ts` + `metrics.test.ts` -- `recordDeckExhausted`, payload `deck.exhausted`, reset -- counter proven
- [ ] `server/src/rooms/ArenaRoom.ts` + an arena test -- adapter: log line + metric bump -- proves the seam end to end
- [ ] `server/src/__tests__/{perception,frames}.test.ts` + a client test -- wire pin (no `deckLeft` family) + no draw-pile counter symbol -- AC 4
- [ ] retired-dial audit (`deck.test.ts:165`, `upgrades.test.ts:541`, `batchSim.test.ts:1299`, `botPolicy.test.ts:16`, `deckSim.ts`/`controls.ts` headers) -- retire or strip per the Always rule -- AC 5
- [ ] `VERSION`/`package.json`/lock/`CHANGELOG.md`/both trackers/`deferred-work.md` -- cycle 138, 0.18.3, PV 51 unchanged, amendments 13–15, `:302`/`:459`/`:1459` closure stamps, `:982` re-derivation stamp, `:1995` resolved, one 8.8 heal-record entry -- tracker discipline
- [ ] `npm run check` green; headless `soloSmoke` + `matchSmoke` over real sockets on a scratch port -- the gate

**Acceptance Criteria:**
- Given a pool and a ship holding a line at its cap, when the offer is drawn, then that line is never offered, the other lines are weighted by copies remaining only, and the pool is unchanged.
- Given every default deck and its spawn seed, when checked line by line, then pool copies + held copies ≤ cap, so the guard can never bite on a legal deck; golden frames and the batch-sim seed-7 ledger are byte-identical.
- Given an empty pool, when a level lands (and again on the next), then the bank grows, no offer and no `pt` exist, the exhaustion callback fires exactly once per ship record, the arena logs `deck.exhausted` once and `/metrics` `deck.exhausted` counts it.
- Given any frame or welcome, when serialized, then no `deckLeft`-family key exists, `you.offer` is 0–4 ids, `PROTOCOL_VERSION` stays 51, and no client symbol names a draw-pile counter.
- Given the ledger, when read, then `:302`, `:459`, `:1459` carry closure stamps, `:982` carries the 40-card re-derivation, `:1995` is resolved, and one new entry hands the level-heal correction to 8.8.
- Given `npm run check`, then lint, tsc ×3 and every test pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the guard is structurally idle today:** a legal deck holds ≤ cap copies of a line; `buildDeckState` removes one copy per carried id; so pool + held ≤ cap at spawn and every fit moves one copy from pool to held. The guard exists for the AC's letter and for future paths (dev overrides, Epic 9 decks with a carried line absent from the list — the Battleship's `broadside` today: held 1, pool 0, still ≤ cap).
- **Why a callback, not a pending event:** `pending` events are wire-bound (six declared exceptions, frames.ts); exhaustion is ops-private. A `WorldOptions` callback keeps `world.ts` Colyseus-free and lets the harness ignore it.
- **Exhaustion arithmetic (pin as a table):** drawable per hull today 23 (40 − 16 stub − 1 carried); terminal state after exactly 23 FITS (heals and passes cost no cards); a full match yields roughly 25 levels at most, so it is reachable only by a captain who fits every level and never heals. Rising toward 39 when 8.7–8.15 flip stubs.
- `held` example: `drawOffer(deck, rng, CATALOG, { held: ['armor','armor','armor','armor'] })` with `armor` cap 4 (the real catalog cap; the matrix row's "cap 3" is illustrative) → `armor` excluded even if the pool still lists it.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green; new at-cap and structural pins
- `npm test -w server && npm test -w client` -- expected: green; exhaustion once, metrics counter, wire pin
- `npm run check` -- expected: exit 0
- `grep -rn "deckLeft" shared/src server/src client/src` -- expected: only the negative pins
- `HC_DEV_OPTIONS=1 PORT=<free> node server/scripts/soloSmoke.mjs` (+ `matchSmoke.mjs`) -- expected: pass over real sockets
