---
title: 'Story 8.11: The Match Consumable Pool'
type: 'feature'
created: '2026-09-18'
status: 'done'
review_loop_iteration: 0
baseline_revision: 'c115efc'
final_revision: 'a63c509'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Every captain and bot sails only its authored 40 cards; nothing in a match is dealt by the match itself, so a captain can never assume "there might be more heals and shields out there" (catalog-v3 R4/R44, FR43). The harness measures an economy that will not exist once the pool does.

**Approach:** A pure `rollMatchPool` in `shared/src/sim/pool.ts` draws `CONFIG.pool.size` (10) consumable cards uniformly from the five consumable lines, each line ≤ its catalog cap WITHIN THE POOL. `World` rolls it ONCE from a room-private seed the adapter supplies (the zoneSeeds posture) and appends it to every captain's and bot's deck at the one `buildDeckState` site, AFTER the door's `checkDeck` (authored 40 → +10 → 50 at the seat). The pool's composition never leaves the server; the room logs `match.pool { count }` once. Dev `poolOverride` beside `deckOverride`; the harness, the RL env and the pure deck economy roll a pool per match. Eric ruling: epic-8 amendment 67 (roll all five lines; stub copies undealt until their stories). No wire change: `PROTOCOL_VERSION` stays 55. Version 0.18.11, cycle 146.

## Boundaries & Constraints

**Always:**
- `rollMatchPool(rng, catalog, cfg)` — candidates are the catalog lines with `kind === 'consumable'` in `LINE_IDS` order (stubs INCLUDED, amendment 67); each of `cfg.size` draws is uniform over the candidates still under their own `cap` within the pool, costing exactly one `rng.next()` (the `pickUsable` clamp idiom); it returns a frozen `readonly LineId[]` in draw order and stops early only if no candidate remains under cap (unreachable at 5 lines × cap 5 ≥ 10, pinned). Never an equipment, ladder or addon line, whatever the catalog says.
- `CONFIG.pool = { size: 10 }` is a new section; `CONFIG.deck` is byte-identical (`{ size: 40, maxEquipmentLines: 3 }` — the AUTHORED size; `checkDeck` never sees the pool).
- `World` gets `WorldOptions.poolSeed?: number` (adapter entropy, like `pseudonymSeed`; omitted ⇒ a TEST-ONLY map-seed derivation with its own unused decorrelation constant) and `WorldOptions.pool?: readonly LineId[]` (an explicit list: dev override or a test fixture — passed through `sanitizePool(list, catalog)`, which keeps only known consumable-kind ids in the given order, no size clamp). `world.pool` is a public frozen readonly list, rolled in the constructor before any ship can be added.
- The ONE `buildDeckState` call site becomes one private helper used by every deck-build edge (spawn and any rebuild): fleet hulls → `EMPTY_DECK` (no pool — amendments 12/24); captains and bots → `buildDeckState([...deckList, ...this.pool], [], catalog)`. `ShipRecord.deckList` stays the authored list (length `CONFIG.deck.size`); the pool lives on `World`, once, identical for every participant. Stub pool copies are excluded by `buildDeckState`'s existing `isDealable` — no new code path.
- `ArenaRoom.buildWorld` passes `poolSeed: (Math.random() * 0xffffffff) >>> 0` and `pool: sanitized.poolOverride`; after `initOperability` binds the logger, the room logs `match.pool` ONCE with exactly `{ count }` (matchId rides the bound logger) — never ids, never the list. Solo rooms and queue-formed rooms take the same path (the queue passes no pool option; the arena it creates rolls its own).
- `poolOverride?: readonly string[]` is a ROOM option (`RoomOptions`), sanitized by `admitDevIdList` under the dev gate exactly like `deckOverride` (absent ⇒ silent; gate closed or malformed ⇒ dropped and reported in `rejectedKeys` → `room.devOptionsRejected`); production never honours it.
- Anti-cheat: nothing new on the wire. `WelcomeMsg.config` carries `CONFIG.pool` (the SIZE is public knowledge, the composition is not); frames never read `ship.deck`; the perception "forbidden keys" pin and the welcome pin are extended to say so. The client reads no new CONFIG field, so `PROTOCOL_VERSION` stays 55 (pinned in `barrel.test.ts`).
- The at-cap guard is LIVE from now on: a deck may hold authored + pool copies of one line beyond its cap (e.g. HULL REPAIR 3 + 5 = 8 > cap 5); the copies beyond the cap are dead by design (R44) — a ship holding `cap` copies is never offered the line, pinned by a test. The old "pool + held ≤ cap for every line" pin is rewritten: true for the AUTHORED deck alone, deliberately false with the pool.
- Harness parity: `runner.ts` and `rl/env.ts` pass `poolSeed: mixSeed(matchSeed, POOL_SEED_ORDINAL)` (a new ordinal outside the zone band); `deckSim.ts` rolls one pool per economy from the economy's rng, builds the deck from `DEFAULT_DECKS[cls] + pool`, and passes `{ held: st.fitted }` and the catalog to `drawOffer` (closing `deferred-work.md:2034` — mandatory now that the guard bites). `--set`/`--tune pool.size` is refused like `deck.*` (Eric's number, not a dial), pinned.
- Measurement (FR59's bar is SET here, measured by 8.18): a deterministic shared test drives seeded 50-card economies on a copy of the catalog with every stub cleared (so 40 authored + 10 pool are all dealable), taking a uniformly random offered card per level, and reports (a) the one-copy appearance rate — the share of economies in which a given 1-copy line (`deckGunTurret`, universal) has appeared in at least one offer by pick 8 / 12 / 15 / 20 — and (b) the offer-size math — the mean level at which an offer first holds fewer than `CONFIG.offer.size` lines. The test asserts monotonic + loose bounds only; the measured table is recorded in this spec's run result and in the ledger, not pinned tightly.
- Tests that pin specific offers, frames or deck depths inject `pool: []` (or a fixed pool) through `WorldOptions` unless they test the pool; nothing in production may pass `pool`.
- `npm run check` green; complexity ≤ 10; no `Math.random`/`Date.now` in `shared/` or `game/`.

**Block If:**
- Appending the pool needs a second `buildDeckState` site or a per-ship pool copy — halt and report.
- Any new event kind, wire field or perception exception looks necessary — halt.
- A golden-frame fixture cannot be held stable by injecting `pool: []` — halt rather than regenerate silently.

**Never:**
- Put the pool, its count or its depth on any frame, the welcome, the schema, `/metrics` or results; log ids.
- Roll the pool per ship, per door or per seat; reroll on reconnect; derive the seed from `mapSeed` in a production room.
- Build `MatchRecord` (8.19), the results reveal (GDD note 20a), a draw-pile counter, bot tactics (8.18), or flip any stub flag.
- Run batch sims; change `CONFIG.deck`, `checkDeck`, the default decks, the draw semantics or `PROTOCOL_VERSION`; edit `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Roll | `rollMatchPool(mulberry32(s), CATALOG, {size:10})` | 10 ids, all five consumable lines only, no line > 5, deterministic per seed, 10 `rng.next()` calls | No error expected |
| Cap within pool | test catalog with one consumable of cap 3 | 3 copies then early stop (length 3); with two lines cap 3 each and size 10 → 6 | No error expected |
| Override sanitize | `sanitizePool(['hullRepair','deckGun','nope','chaff'], CATALOG)` | `['hullRepair','chaff']` (order kept, equipment + unknown dropped) | Silent drop |
| Door, captain | arena `onJoin`, default TB deck, world pool with k `hullRepair` | `deckList` 40; `deck.cards` = 27 + k; stub pool copies absent | No error expected |
| Bot, solo | `buildBotFleet` | every bot's `deck.cards` = 27 + k with the SAME pool | No error expected |
| Fleet hull | drone spawn | `EMPTY_DECK`, no pool | No error expected |
| Same pool everywhere | two captains + bots in one World | identical multiset appended to each | No error expected |
| Two rooms | two Worlds, different `poolSeed` | different pools (pinned over seeds); same seed ⇒ same pool | No error expected |
| Guard live | ship holding 5 `hullRepair`, deck still has copies | `drawOffer` never offers `hullRepair`; other lines drawn | No error expected |
| Log | room created | one `match.pool` line, fields exactly `{count}` | No error expected |
| Welcome | join | `config.pool` = `{size:10}`; no other pool key anywhere in welcome/frames | No error expected |
| poolOverride, gate on | `HC_DEV_OPTIONS=1`, `poolOverride:['chaff','chaff','hullRepair']` | `world.pool` = that list; captains' decks +1 dealable `hullRepair` (chaff stub) | No error expected |
| poolOverride, gate off | same option, no env | dropped; `rejectedKeys` has `poolOverride`; production roll used | Logged once |
| Redeploy / activation | countdown pick then `activate()` | deck preserved as 8.10 built it; the pool is not re-appended | No error expected |
| Harness | `runMatch`, `env.reset`, `playEconomy` | each rolls one pool per match from its seed; `drawOffer` guarded with `held` | No error expected |
| `--set pool.size=3` | batchsim CLI | refused like `deck.size` | Exit with the existing refusal |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1672-1680` -- ADD `pool: { size: 10 }` beside `deck` (doc: Eric's number, R4; the deck comment already points here)
- `shared/src/sim/pool.ts` -- NEW: `rollMatchPool(rng, catalog, cfg: { size })`, `sanitizePool(ids, catalog)`, `consumableLines(catalog)`; import `Rng` from `../math/rng.js`, `Catalog`/`LineId`/`LINE_IDS` from `./catalog.js`
- `shared/src/index.ts:5, 641-668` -- changelog entry (no PV change) + `export * from './sim/pool.js'`
- `shared/src/__tests__/pool.test.ts` -- NEW: matrix rows Roll / Cap within pool / Override sanitize, rng cost, determinism, never non-consumable, LINE_IDS order of candidates
- `shared/src/__tests__/poolMeasure.test.ts` -- NEW: the 50-card measurement (unstubbed catalog copy, seeded economies, loose bounds; prints the table once)
- `shared/src/__tests__/deck.test.ts:465-497` -- rewrite the "pool + held ≤ cap" pin (authored-only) + new "guard is live with the pool" pin; `:177-184` untouched (`CONFIG.deck` exact); `barrel.test.ts:286, 702-729` -- PV 55 stays, `rollMatchPool`/`sanitizePool` exported, `CONFIG.pool` equals `{size:10}`
- `server/src/game/world.ts:255-285, 1325-1355, 1569-1611, 1770-1780` -- `WorldOptions.poolSeed`/`pool`; `readonly pool`; ctor roll (test-only fallback constant, grep-unique); `dealDeck(role, deckList)` helper replacing the inline `buildDeckState`; any other `buildDeckState`/deck-rebuild site routed through it
- `server/src/rooms/roomOptions.ts:262-360` -- `RoomOptions.poolOverride`, `SanitizedRoomOptions.poolOverride?: readonly string[]` via `admitDevIdList`; rejected-key reporting
- `server/src/rooms/ArenaRoom.ts:467-490, 696-705` -- `poolSeed` + `pool` into `World`; `match.pool { count }` after the logger binds
- `server/src/__tests__/decks.test.ts:210, 344`, `upgrades.test.ts:165-216`, `deckExhausted.test.ts`, `mulligan.test.ts`, `goldenFrames.test.ts:194`, `frames.test.ts`, `perception.test.ts:1809-1820`, `roomOptions.test.ts:243-356` -- inject `pool: []` where depth/offers are pinned; new pins: door +k, bots same pool, fleet none, two-room difference, guard live, log fields, welcome `config.pool`, `poolOverride` gated
- `server/src/__tests__/arenaRoom*.test.ts` (whichever pins `buildWorld` seeds) -- pin `poolSeed` supplied and `pool` = sanitized override
- `server/scripts/batchsim/runner.ts:54-57, 402-466`, `server/scripts/rl/env.ts:42, 106-130` -- `POOL_SEED_ORDINAL` + `poolSeed`
- `server/scripts/batchsim/deckSim.ts:60-80, 175-205` -- `defaultPoolFor(cls, pool)`, per-economy `rollMatchPool`, `drawOffer(st.deck, rng, CATALOG, { held: st.fitted })`; `overrides.ts` + `__tests__/batchSim.test.ts:417-430` -- refuse `pool.size`
- `server/scripts/openingSmoke.mjs` (or a new `poolSmoke.mjs` modelled on it, own port, `HC_DEV_OPTIONS=1`) -- creates a dev room with `poolOverride: ['hullRepair','hullRepair','hullRepair']` and asserts: the room boots with the option (no refusal), the welcome carries `config.pool.size === 10` and no other pool-shaped key, and no frame over the countdown carries any key named `pool`/`deckLeft`/`deckSize`/`remaining`; composition assertions stay in unit tests (a live offer is probabilistic)
- Docs: `VERSION` / root `package.json` + lock 0.18.11, `CHANGELOG.md`, both trackers (one-line stamps), `deferred-work.md` (resolve `:2034`; add: dead copies beyond cap, the measured table as 8.18's bar, note 20a untouched), amendment 67 (+ any measured correction) in both homes

## Tasks & Acceptance

**Execution:**
- [x] amendment 67 → both homes -- done at plan time
- [x] `shared/` (constants, pool.ts, barrel, tests incl. the measurement) -- `npm test -w shared && npm run build -w shared`
- [x] `server/` (world, roomOptions, ArenaRoom, harness/RL/deckSim, tests, smoke) -- `npm test -w server`; smoke on a scratch port, own PID killed
- [x] docs + version + trackers + ledger -- one-line tracker stamps; measured table recorded
- [ ] `npm run check` green

**Acceptance Criteria:**
- Given any arena room (direct, solo or queue-formed), when it is created, then `world.pool` holds 10 consumable ids rolled from adapter entropy, and every captain and bot seated afterwards deals the authored deck plus that same pool, fleet hulls nothing.
- Given the pool, then `checkDeck` still runs on the authored 40 alone and no pool can make a deck legal or illegal or add an equipment line (structural: `sanitizePool` + consumable-only candidates).
- Given a client, then no frame, welcome field (beyond `config.pool.size`) or log line ever carries the pool's ids; the room logs `match.pool { count }` once.
- Given `HC_DEV_OPTIONS=1` and `poolOverride`, then the world's pool is the sanitized list; without the gate it is dropped and reported.
- Given the batch-sim harness, the RL env and the deck economy sim, then each rolls a pool per match and draws with `held`, and `pool.size` is refused on the CLI.
- Given the measurement test, then the one-copy appearance rates at 8/12/15/20 picks and the first-short-offer level are recorded for the 50-card deck.
- Given `npm run check`, then lint, tsc ×3 and every test pass; `PROTOCOL_VERSION` is 55.

## Spec Change Log

## Review Triage Log

### 2026-09-18 — Review pass (Blind Hunter + Edge Case Hunter on Fable, plus Codex `gpt-5.6-sol` cross-model review — verdicts: Blind fix-first on the record / build-on-it on the code, Edge build-on-it, Codex build-on-it; agreement: Codex and both hunters independently flagged the deck-only economy's stopping-rule wording; Blind alone found the "dead by design" contradiction with `spendStock`, confirmed by the orchestrator; Edge alone found the dev-fit cap hole and the two stub-state harness pins, both confirmed)
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 1, medium 1, low 7)
- defer: 2: (high 0, medium 0, low 2)
- reject: 8: (low 8)
- addressed_findings:
  - `[high]` `[patch]` The cycle's record (amendment 68(b), CHANGELOG, `CONFIG.pool` / `pool.ts` / `world.ts` docs, the ledger entry) said pool copies past a cap are "dead by design", but `World.spendStock` removes a used consumable from `cards` so the at-cap guard reopens the line after a use (Blind C1) — corrected everywhere; amendment 69 records the supersession; no code change.
  - `[medium]` `[patch]` The batch-sim deck economy and the measurement test never fire a consumable, so a line fitted to cap stays closed for the whole economy while production reopens it (Blind C2) — the never-use model is now stated in `deckSim.ts`, `report.ts`, `poolMeasure.test.ts`, amendment 69 and the ledger; 68(a)'s numbers are labelled a floor for consumables and 8.18's bar is routed to the full harness.
  - `[low]` `[patch]` The deck-only report still said an economy ends only on an empty deck (Codex #1, Blind C2, Edge #2) — reworded to the empty-draw rule with the cap-held case named.
  - `[low]` `[patch]` `applyDevFit` filtered only on "the deck has a copy", so a dev `fitOverride` could stack HULL REPAIR to 8 against cap 5 once the pool was in the deck (Edge #1) — cap guard added, fail-first test proven.
  - `[low]` `[patch]` `reportExhaustion` and `buildWorld` docs said an empty draw "coincides with an empty pool" (Edge #2) — rewritten to the empty-deck-or-only-cap-held reading.
  - `[low]` `[patch]` `match.pool` was logged before `finishCreate` could throw, leaving a line for a room that never existed (Edge #3) — logged after a successful create.
  - `[low]` `[patch]` Two harness pins encoded today's stub state (`27` with two chaff; `deckExhaustedRate > 0.5`) and would fail when 8.15 un-stubs chaff (Edge #4) — expectation computed from `isStubLine`; the rate pin relaxed to `> 0` with the `< 1` discriminator kept.
  - `[low]` `[patch]` The measurement's exhaustion bound was `≤ 50` against a loop that legitimately records 51, passing only because enough economies stop early (Edge #5) — bound is `dealable + 1`; the "1st-short" caption now names both causes (Blind P1).
  - `[low]` `[patch]` The reopen-after-use behaviour that amendment 69 rests on was asserted by no test (patch agent's recommendation, accepted) — a World-level pin now stacks HULL REPAIR to cap from an over-cap deck, proves the line is closed, fires one through the real belt channel, and proves the line is offered again while copies remain (fails when nothing fires); `metrics.ts`'s `deckExhaustedTotal` doc and the shared deck test's wording carried the same stale sentence and were re-cut.
- deferred (ledgered): server room tests without `poolOverride` now sail a random pool — a latent `Math.random` dependency for any future offer/depth pin (Blind P3); `poolMeasure.test.ts` costs ≈2.3 s and prints a table on every shared test run (Blind P8).
- rejected: `Math.random` as the seed source is the accepted zoneSeeds/pseudonym posture (Blind P2); clean traces of the welcome/frames/metrics/results, the single deal site and the sanitizer branches (Blind P4–P6); the two-rooms-differ pin being probabilistic at a collision rate that is astronomically small (Blind P7); `poolSeed: NaN`, a fractional `cfg.size` and a 256-copy dev override are unreachable or dev-only and documented (Edge #6–#8).

## Auto Run Result

**Status:** done — branch `worktree-dev-auto-8-11-the-match-consumable-pool`, cycle 146, version 0.18.11, PROTOCOL_VERSION unchanged at 55, epic-8 amendments 67–69.

**Summary.** Every arena room rolls ten hidden consumable cards once, at creation, from room-private adapter entropy (`rollMatchPool` in `shared/src/sim/pool.ts`: uniform per card over the five consumable lines, each ≤ its cap within the pool, stubs included per amendment 67), and `World.dealDeck` appends the identical set to every captain's and bot's deck at the one deck-build edge after the door's `checkDeck` (40 authored + 10 = 50; stub copies undealt; fleet hulls none). The composition never reaches the wire (welcome carries only `config.pool.size`; frames untouched); the room logs `match.pool { count }` once after a successful create. `CONFIG.pool = { size: 10 }` is Eric's number and the batch-sim CLI refuses it. A dev-only `poolOverride` room option (consumable-only by `sanitizePool`) and `poolSmoke.mjs` exist; the harness, the RL env and the pure deck economy roll a pool per match, and the economy draws with `held` (ledger `:2034` closed). The at-cap guard is live for the first time: a line held at cap is never offered until a fired copy leaves `cards` and reopens it (amendment 69 — pool copies past a cap are gated behind use, not dead). The 50-card economy was measured under a stated never-use model (amendment 68a).

**Files changed** (see the Code Map): shared — `constants.ts` (`CONFIG.pool`), `sim/pool.ts` (new), `index.ts` (export + changelog), tests (`pool.test.ts`, `poolMeasure.test.ts` new; `deck.test.ts`, `barrel.test.ts`). server — `game/world.ts` (`poolSeed`/`pool` options, `matchPool`, `dealDeck`, `applyDevFit` cap guard, docs), `rooms/roomOptions.ts` (`poolOverride`), `rooms/ArenaRoom.ts` (seed + log), `metrics.ts` (doc), `scripts/batchsim/{runner,deckSim,overrides,report}.ts`, `scripts/rl/env.ts`, `scripts/poolSmoke.mjs` (new), tests (`matchPool.test.ts` new; `decks`, `upgrades`, `mulligan`, `deckExhausted`, `roomOptions`, `perception`, `batchSim`). Docs — `VERSION`, `package.json`+lock, `CHANGELOG.md`, both trackers, `deferred-work.md`, amendments 67–69 in both homes.

**Review findings.** Patches applied: 10 (1 high — the "dead by design" record corrected to gated-behind-use, amendment 69; 1 medium — the never-use model stated for the harness and the measurement; 8 low — report wording, dev-fit cap guard with fail-first proof, exhaustion docs, log placement, two stub-state harness pins, measurement bound and caption, the reopen pin). Deferred: 2 (latent random pool in un-pinned room tests; measurement cost on every shared run). Rejected: 8. Agreement: Codex and both hunters flagged the stopping-rule wording; the record contradiction was Blind-only and orchestrator-confirmed against `spendStock`; the dev-fit hole and the stub-state pins were Edge-only and confirmed.

**Verification.** `npm run check` exit 0 after the patches: shared 936, server 2027, client 3583, hooks 266; ESLint 0 errors (3 pre-existing client `max-lines-per-function` warnings); tsc clean ×3. Smokes on scratch ports, own PIDs killed: `poolSmoke.mjs` PASS (port 2613), `openingSmoke.mjs` PASS (2611). Measurement table (never-use model, unstubbed catalog, 2000 economies per hull): one-copy line seen by pick 8/12/15/20 — TB 56.1/73.4/81.0/90.5 %, BS 53.6/71.0/79.3/89.6 %, ML 52.3/69.5/80.3/90.0 %; first short offer ≈ level 46.0; empty draw ≈ level 49.7.

**Residual risks / notes for Eric.** (1) On staging the pool is four-fifths inert until 8.15/8.16 flip the consumable stubs: expect 0–5 extra HULL REPAIR per hull (≈ 2), nothing else visible. (2) `deck.exhausted` (log + `/metrics`) now also counts a deck whose only remaining copies are of a line held at cap — a use reopens it, but the once-per-ship latch has already fired. (3) The harness's deck-only numbers are a floor for consumables (it never fires one); 8.18 sets the real bar from the full harness. (4) GDD open note 20 (results reveal; unlocked-vs-dealt) is untouched. (5) Manual QA on staging is the gate: Solo vs AI, take HULL REPAIR to five, fire one, see it offered again later.

## Design Notes

- **Why the pool lives on `World` and not on the record:** one roll, one list, identical for everyone (FR43) — a per-ship copy is a second source of truth and a second thing to hide. The seat only ever concatenates.
- **Why the seed is adapter entropy:** `mapSeed` rides the welcome, so a pool derived from it would be brute-forceable; `zoneSeeds`/`pseudonymSeed` already set the pattern (entropy in `ArenaRoom`, never in `game/`; the harness derives from the match seed server-side).
- **Why `poolOverride` is a room option, not a join option:** the pool belongs to the room, not the seat; `deckOverride` is per seat. Same gate, same reporting.
- **Why the guard-live pin matters:** until now the at-cap guard was provably idle on every door-admitted deck; the pool is the first thing that can push a line's copies past its cap, so the harness must draw exactly as `World` does.

## Verification

**Commands:**
- `npm test -w shared` then `npm run build -w shared` -- green; pool pins, guard-live pin, PV 55, measurement table printed
- `npm test -w server` -- green; door/bot/fleet/two-room/log/welcome/override pins; harness + RL + deckSim pins
- `HC_DEV_OPTIONS=1 PORT=<free> npm run dev -w server` + `WS_URL=ws://localhost:<free> node server/scripts/<smoke>.mjs` -- passes; kill own PID
- `npm run lint`; `npm run check` -- exit 0

**Manual checks (if no CLI):**
- Eric on staging: Solo vs AI → the countdown offer and later offers can show HULL REPAIR more often than three copies would allow; nothing else visible changes.
