---
title: 'Story 8.10: The Opening'
type: 'feature'
created: '2026-09-18'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Every hull still spawns with the interim `SPAWN_SEED` class weapons (amendment 21), the first card offer only arrives at the first level, and a first offer can hold nothing playable — the opening "lies". FR48 wants gun-and-Shift spawns, a level-zero offer at countdown start with a usable-card guarantee, and one free countdown redraw.

**Approach:** Delete the seed; `Match.startCountdown()` grants one banked level to every participant (captain + bot, never fleet) through a new public World entry BEFORE the countdown runs; `drawOffer` gains `opts.guarantee` (level zero only); `SpendMsg.choice === MULLIGAN_CHOICE (-2)` redraws once during the countdown; the activation redeploy preserves the countdown economy; the client auto-opens the refit window once on the level-zero offer, lifts the band 44 px to seat one `REDRAW` button (countdown only), suppresses the level-up toast/tone at the start line, and the class-select cards drop their weapon rows. Eric rulings: epic-8 amendments 59–63. `PROTOCOL_VERSION` 54→55. Version 0.18.10, cycle 145.

## Boundaries & Constraints

**Always:**
- `drawOffer` keeps its non-consuming shape and its one-`rng.next()`-per-offered-line cost for the plain draw; the guarantee path draws the FIRST card uniformly among USABLE lines (a `consumable` line, or an `equipment` line the ship holds 0 copies of — `boonStackCount(held, id) === 0`), then the remaining `CONFIG.offer.size − 1` from everything else by the existing copies-weight with the first line excluded. No usable line ⇒ the draw is plain (vacuous guarantee), pinned by a test so nobody turns it into a reroll.
- The level-zero grant: `bankedLevels += 1`, `level` stays 0, `xpMs` 0, the offer materialized with the guarantee, `pt` queued. Wire reads `lvl 0 / pts 1 / xp 0 / offer[4]` — the bar already renders `LV 0`, chip `1`, empty strip; no bar change.
- The mulligan is honoured iff `phase === 'countdown' ∧ ship.role === 'captain' ∧ !ship.mulliganed ∧ ship.offer !== null`; it sets `mulliganed = true`, redraws with the guarantee from the SAME deck state (the previous offer was never consumed) and queues `pt`. Any other sentinel arrival returns `false` before any mutation: the next frame's offer is the same array, byte for byte (the 8.7 refusal pattern). Bots never send it (the spend policy never returns a negative — pinned).
- `Match.activate()` → `resetForMatchStart` → `redeployShip` PRESERVES `bankedLevels`, `offer`, `cards`, `loadout`, `deck`, `deckRng`, `mulliganed` for every ship; it still resets hp/position/lifecycle as today. `mulliganed` is reset at `addShip` and by the sandbox respawn path only (never by activation).
- Everything spatial still leaves through `frames.ts`; `pt` stays self-private; the perception exception count stays SIX; nothing new on the wire but the sentinel value.
- Client: one auto-open per match epoch, latched on `g.scorePhase`-style epoch state, fired from `syncRefitBand` on the first frame where `heldAtStartLine(phase) && phase === 'countdown'` and `currentOfferView(g) !== null` and the window is closed and not yet auto-opened this match; it goes through `handleRefitToggle`'s guards (surface stacking, `rearmBank`). Reconnect mid-countdown opens too (the latch is "not yet this match", not a numeric rise).
- The band's 44 px footer (14 px gap + 30 px button) exists only while `phase === 'countdown'`; `refitBandLayout` takes it as an input so the band bottom stays `bar.y − barGap` and the row top goes 380 → 336 at 1366×768. The `REDRAW` DOM block is appended AFTER the row (the tests' `nth-child(2)` card selector must keep counting four buttons), `pointer-events:auto`, Primary Button register: transparent bed, 1 px amber border, radius 8, `font:600 12px var(--hc-font-mono)`, `letter-spacing:.18em`, uppercase, `0 18px` padding, 30 px tall, glow `0 0 18px rgba(255,184,0,.28)`; one 8 px amber circle pip beside the word, hollow (transparent) until the mulligan is acked, then filled. 12 px is above the 9 px floor: it rides the geometry, no `--hc-micro`.
- The `REDRAW` click sends `{ choice: MULLIGAN_CHOICE }` through the spend latch (a mulligan is acked by the offer signature changing — `spendOutcome` must treat a `pt` with a changed front offer at unchanged `pts` as an ack, not a timeout). The pip fills on ack; a timeout releases the latch with the denied pulse on the button.
- `handlePoint` (client) skips the toast and the `point` tone while `heldAtStartLine(phase)`; the strip cue is untouched.
- Class-select: the `LOADOUT` table is `[]` for all three hulls; the rows block renders nothing; the pips stand.
- `matchOverride.mulligan?: boolean` (dev-gated, AR55's beat): when true, `Match` performs the mulligan for every captain on the first `update()` tick after `startCountdown()` (same `world.mulligan(ship)` path the wire uses), so a headless smoke sees offer A on its first countdown frame and offer B on the next, then sends the sentinel itself and asserts a byte-identical no-op (the one redraw is spent). The honoured wire path is covered by a server unit test. Off in production by the existing `HC_DEV_OPTIONS` gate.
- `/metrics`: `deck.picks` (+1 per successful `spendCard`) and `deck.mulligans` (+1 per honoured mulligan), counts only, module-level like `deckExhausted`.
- `npm run check` green; complexity ≤ 10; no `Math.random`/`Date.now` in sim.

**Block If:**
- The guarantee needs a second RNG stream or changes the plain draw's rng cost — halt and report.
- Preserving the economy through `resetForMatchStart` breaks a sandbox/dev-room respawn path that cannot be scoped to `!holdStartLine` — halt.
- Any new event kind or a seventh perception exception looks necessary — halt.

**Never:**
- Build the pinned-card spawn, a bot mulligan, a REDRAW key binding, a draw-pile counter, in-game copy beyond the ratified `REDRAW`, or How-to-Play changes (8.20).
- Reroll on window reopen; touch the plain (non-zero-level) draw's semantics; fold the guarantee into `materializeOffer` for later levels.
- Edit `CLAUDE.md`; touch the Colyseus schema; add per-ship spatial fields.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Countdown entry | `startCountdown()` with 2 captains + 1 bot + 2 fleet hulls | captains and bot: `bankedLevels 1, level 0, offer[4]` with ≥1 usable card, `pt` in the next frame; fleet hulls untouched (`bankedLevels 0`, no `deckExhausted`) | No error expected |
| Guarantee, TB default deck | deck has `hullRepair ×3` + 3 equipment lines ×3, no cards held | `offer[0]` ∈ usable set (consumable or unfitted equipment line); `offer` has 4 distinct lines | No error expected |
| Vacuous guarantee | injected deck of ladders only | plain draw, identical to `drawOffer` without opts for the same rng state | No error expected |
| Mulligan happy path | countdown, captain, `mulliganed=false`, offer A | returns true; offer B drawn with guarantee; `mulliganed=true`; `pt` queued; deck unchanged; `bankedLevels` still 1; `deck.mulligans` +1 | No error expected |
| Second mulligan | same ship, `mulliganed=true` | returns false; offer byte-identical; no `pt` | Silent no-op |
| Live-phase mulligan | `phase==='active'`, `mulliganed=false` | returns false; offer byte-identical | Silent no-op |
| Bot / fleet sentinel | bot ship or fleet hull sends -2 (test only) | returns false; nothing mutates | Silent no-op |
| Other negatives | `choice -1`, `-3`, `NaN`, `1.5` | returns false as today | Silent drop |
| Pick during countdown | captain picks a weapon at countdown | fitted into slot 2; `bankedLevels 0`; after `activate()` the card, loadout, `deck` and `mulliganed` survive; hp/position reset as today | No error expected |
| Held offer through activation | no pick, no mulligan | after `activate()`: `bankedLevels 1`, same offer array; mulligan now refused (live) | No error expected |
| Client auto-open | first countdown frame with `pts 1, offer[4]`, window closed | window opens once; second frame does not re-open; Tab closes; Tab reopens with REDRAW; row top 336 | No error expected |
| Water goes live | phase edge countdown→active with window open | REDRAW block removed, band back to 244 px (row top 380), window stays open | No error expected |
| Reconnect mid-countdown | first frame after rejoin already `pts 1` | window auto-opens once | No error expected |
| REDRAW click | pip hollow, latch free | sends `{choice:-2}`; on `pt` + changed offer: cards re-render, pip filled; button stays (inert) | Timeout ⇒ denied pulse on the button, pip stays hollow |
| Silent grant | `pt` arrives while `heldAtStartLine` | no toast, no tone; live `pt` unchanged | No error expected |

</intent-contract>

## Code Map

- `shared/src/sim/offers.ts` -- ADD `export const MULLIGAN_CHOICE = -2` + doc (the one asserted never-reroll exception; `-1` retired at PV 53); `shared/src/types.ts:315-329` `SpendMsg` comment: `MULLIGAN_CHOICE` is the only legal negative
- `shared/src/sim/deck.ts:172-226` -- `DrawOpts.guarantee?: boolean`; `usableLines(counts, held, catalog)`; guarantee path in `drawOffer` (first pick uniform over usable via one `rng.next()`, remainder via `pickLine` with `taken` seeded); doc: level zero only
- `shared/src/sim/catalog.ts:739` -- DELETE `SPAWN_SEED`; `shared/src/sim/loadout.ts:11` comment; `shared/src/index.ts:5` changelog entry + `PROTOCOL_VERSION = 55` (`:618`)
- `shared/src/__tests__/` -- `deck.test.ts` (guarantee pins: first card usable, vacuous = plain, rng cost, determinism, pool 26→27), `catalog.test.ts:404-435` delete the seed block, `barrel.test.ts:426-428` seed pins → `MULLIGAN_CHOICE` pin, `nineSlots.test.ts:152-166` delete the tripwire (its comment names 8.10 as the fix), `deckRules.test.ts` if it references the seed
- `server/src/game/world.ts` -- `ShipRecord.mulliganed` beside `deckExhausted` (:352ff, init at `:~1516`); DELETE `seedFor` + the `SPAWN_SEED` import (:49, :1705), `carried = []` in `spawnDeck`/`redeployShip`; `materializeOffer(ship, guarantee)` passes `{ held, guarantee }`; `grantPoint` gains a `guarantee` arg; NEW `public grantOpening(): void` (participants only: `role !== 'fleet'`, guarantee true) ; `spendPoint(:2562)` intercepts `MULLIGAN_CHOICE` → `mulligan(ship)` (phase read via a `World`-held `matchPhase` getter or an injected predicate — keep `match.ts` Colyseus-free and `world.ts` match-free: `Match` sets `world.countdownOpen = true/false` at `startCountdown`/`activate`); `resetForMatchStart`/`redeployShip` (:~1755) keep the economy; `onDeckPick`/`onMulligan` callbacks in `WorldOptions` for metrics
- `server/src/game/match.ts:616-630` -- `startCountdown()` calls `this.world.grantOpening()` then the existing body; `activate()` unchanged except it relies on the preserved economy
- `server/src/rooms/ArenaRoom.ts:469-470, 716-718` -- wire `onDeckPick`/`onMulligan` → `recordDeckPick`/`recordDeckMulligan`; `server/src/rooms/roomOptions.ts:208` `MatchOverride.mulligan?: boolean` (doc: smoke arm)
- `server/src/metrics.ts:60-75, 135, 216, 231-236, 307` -- `deck.picks`, `deck.mulligans` counters + reset + payload; `server/src/__tests__/metrics.test.ts`
- `server/src/game/ai/spending.ts:9-10` -- pin (test) that `chooseSpend` never returns a negative; no behaviour change
- `server/scripts/batchsim/deckSim.ts:54-70` -- seed helper returns `[]`; batchsim countdown/opening: the harness's match driver must call `grantOpening()` where it enters countdown (check `batchsim/*.ts` for a `Match` or a direct-world path; if direct, grant before its first live tick)
- `server/src/__tests__/` -- `upgrades.test.ts:392-461` (never-reroll pin gains the one exception; `TB_SEED` assertions → gun+Shift only), `match.test.ts:201-271` (countdown grants; activation preserves), NEW `mulligan.test.ts` (matrix rows), `deckExhausted.test.ts`, `boons/broadside/torpedoSelfHit` comments
- `server/scripts/matchSmoke.mjs` (or NEW `openingSmoke.mjs` modelled on it, self-booting on a scratch port with `HC_DEV_OPTIONS=1`, `matchOverride { countdownMs: 4000, mulligan: true }`) -- asserts `you.pts === 1 && you.lvl === 0` in countdown, sends `{choice:-2}`, sees the offer change + `pt`, sends again and sees no change, then live
- `client/src/ui/upgradeMenu.ts:246-267, 1285-1312, 1478-1489, 1538-1561` -- `refitBandLayout(w, h, cards, footerPx)`; footer DOM block (button + pip) appended after the row; `render(view)` signature includes `countdown`/`mulliganed` so the footer diffs; `OfferView` gains `redraw: 'hidden' | 'unspent' | 'spent'`
- `client/src/main.ts:638-641, 794-802, 865-895, 946-986, 1155-1164, 2714, 2744` -- auto-open latch + epoch reset; `tryMulligan(g)`; `spendOutcome` ack rule for a mulligan; `offerView` input for the redraw state (from `g.mulliganed` set on ack)
- `client/src/net/roomBindings.ts:1298-1303` -- `handlePoint` silent while `heldAtStartLine`
- `client/src/ui/classSelect.ts:60-67` -- `LOADOUT` → `[]` ×3, comment; `__tests__/classSelect.test.ts`
- `client/src/__tests__/` -- `upgradeMenu.test.ts` (footer geometry 336/380, four buttons still, REDRAW only in countdown, pip hollow→filled), `keyboard.test.ts` (Tab takes REDRAW with it), `roomBindings.test.ts:1166-1301` (silent `pt`), `hotbar.test.ts:162`, `weaponArc.test.ts:61`, `hudBar.test.ts:359` (seed → `[]`)
- Docs: `VERSION` / root `package.json` + lock 0.18.10, `CHANGELOG.md`, both trackers (one-line stamps), `deferred-work.md` (resolve `:2087`, `:2100`, `:2204`), `EXPERIENCE.md` (countdown row: built; 380→336 correction), `DESIGN.md` Layout line (388/344 → 380/336, amendment 63a), `epic-8-context.md` Ratified 59–63 (done)

## Tasks & Acceptance

**Execution:**
- [ ] amendments 59–63 → both homes -- done at plan time
- [ ] `shared/` (offers, deck guarantee, catalog seed deletion, index PV 55, tests) -- `npm test -w shared && npm run build -w shared`
- [ ] `server/` (world grant/mulligan/preserve, match hook, roomOptions, metrics, ArenaRoom wiring, batchsim seed, tests, opening smoke) -- `npm test -w server`; run the smoke against an own server on a scratch port, kill own PID
- [ ] `client/` (auto-open, footer + REDRAW, silent pt, class cards, tests) -- `npm test -w client`; `grep -rn SPAWN_SEED shared/src server/src client/src server/scripts` returns nothing
- [ ] docs + version + trackers + ledger -- one-line tracker stamps
- [ ] `npm run check` green; own server + client boot on scratch ports; PIDs killed

**Acceptance Criteria:**
- Given a queue-formed room entering countdown, when the first countdown frame arrives, then every captain reads `LV 0`, bank chip 1, an empty strip, Gun · Shift · seven dashed squares, and the refit window is open with four cards and one hollow-pip `REDRAW` under a row whose top is 336 px at 1366×768; the tag reads `ALL STATIONS LOCKED`; no toast, no tone.
- Given the level-zero offer, then at least one card is a consumable or the tier I of an unfitted equipment line (default decks); given a ladders-only test deck, then the draw equals the plain draw.
- Given REDRAW pressed once, then the four cards change, the pip fills, the deck is unchanged, the bank still reads 1; pressed again or after 0:00, then nothing changes.
- Given a card taken during the countdown, when the water goes live, then it is fitted (Q lit) and hp/position are reset as before; given no pick, then the offer is still held at 0:00 and REDRAW is gone; the band drops back to 380.
- Given a client on PV 54, when it joins, then the gate refuses it.
- Given `/metrics`, then `deck.picks` and `deck.mulligans` count the session's picks and honoured mulligans.
- Given the class-select screen, then no card shows a weapon row.
- Given `npm run check`, then lint, tsc ×3 and every test pass; given the opening smoke, then it passes on a scratch port.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the phase reaches `World` as a flag, not a `Match` import:** `world.ts` and `match.ts` are both Colyseus-free but `world` must not depend on `match` (the sim is unit-tested bare). `Match` already owns the transitions; setting `world.countdownOpen` at `startCountdown()`/`activate()` keeps the mulligan guard testable without a `Match`.
- **Why the guarantee lives in `drawOffer`, not `materializeOffer`:** the redraw and the grant must produce the same distribution from the same function; `drawOffer` is the one shared draw and stays testable with an injected catalog. Sketch: `usable = counts.filter(c => line.kind==='consumable' || (line.kind==='equipment' && held has 0))`; `first = usable[floor(rng.next()*usable.length)]`; then `taken = atCap ∪ {first}` and the existing loop for `size − 1`.
- **Why the economy survives activation instead of granting after it:** FR48's promise is "something to DO at 0:00" — a pick during the countdown must already be aboard when the water goes live, so the redeploy keeps cards/loadout/deck; granting after `activate()` would put the offer on live water.
- **Why the client acks a mulligan on the offer signature:** the server queues `pt`, not `bn`, and `pts` does not move; the existing latch's "front offer changed" reading is exactly the mulligan's visible effect.

## Verification

**Commands:**
- `npm test -w shared` then `npm run build -w shared` -- green; guarantee pins, `MULLIGAN_CHOICE` barrel pin, pool 27, no seed
- `npm test -w server` -- green; countdown grant, preserve-through-activate, mulligan matrix, metrics
- `npm test -w client` -- green; footer geometry, auto-open edge, silent pt, class cards
- `HC_DEV_OPTIONS=1 PORT=<free> npm run dev -w server` + `WS_URL=ws://localhost:<free> node server/scripts/openingSmoke.mjs` (or the extended matchSmoke) -- passes; kill own PID
- `npm run lint`; `npm run check` -- exit 0

**Manual checks (if no CLI):**
- Eric on staging: Solo vs AI → at MATCH STARTING the window is open with REDRAW; press it once (cards change, pip fills), press again (nothing); take a weapon; at 0:00 the weapon is on Q and REDRAW is gone; Tab closes/reopens; class-select cards show pips only.
