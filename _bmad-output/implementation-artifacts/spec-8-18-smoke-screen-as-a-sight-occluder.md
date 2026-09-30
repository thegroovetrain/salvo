---
title: 'Story 8.18: Smoke Screen as a Sight Occluder'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
baseline_revision: '7bb6425'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** SMOKE SCREEN is the last live-content stub in the catalog (`smokeScreen: consumable('smokeScreen', true)`); no ship can lay smoke, and nothing in the sim occludes sight except islands. The game needs one occlusion rule that makes smoke "an island for every sensor but radar" without a second predicate per sensor.

**Approach:** Flip the stub into a key-fired belt consumable that lays a 5 s trail of expanding puffs astern; store puffs in a new world store, step them in a new `STEP_ORDER` row, put ONE `sightClear` predicate (island LOS ∧ no puff crossed) at every sight-tier call site — including the two the epic text missed (the contact row's inline check and the in-bubble torpedo-water clause) — give the star-shell reveal a smoke-only term (Eric), ship puffs to clients on a new `FrameMsg.smoke` channel behind a `smoke` registry pseudo-row, render them as discrete grey discs, add the perf pin and `/metrics` peak, and — Eric's rider — make a HULL REPAIR re-press REPLACE its heal pool. `PROTOCOL_VERSION` 60 → 61, one bump.

## Boundaries & Constraints

**Always:**
- **Eric's rulings of 2026-09-29 (this run, AskUserQuestion; to be recorded as epic-8 amendments 138–145 in the docs wave):** (138) `puffIntervalMs = 500` — 10 puffs per lay. (139) `expandMs = 30000` — a puff grows r40 → r60 over its whole 30 s life. (140) a re-press while laying RESTARTS the 5 s clock (`smokeUntil = now + layMs`; the copy is spent; the shield/chaff "replaces" posture). (141) **HULL REPAIR re-press REPLACES the pool: `repairHp = regenHp`, never `+=`** — whatever was still owed is discarded, a fresh 50 hp pays over a fresh 5 s at the unchanged 0.01 hp/ms; the instant 50 lands as before. Supersedes the "pools ADD, the rate never changes" stacking law (amendment 51's parenthetical, `CONFIG.hullRepair` comment, `hullRepair.test.ts` pin, `World.applyRepair` doc block). (142) **Smoke hides hulls even under a flare**: `ownZoneCovers` gains a SMOKE term — the observer→point segment must cross no live puff — and still NO island term (an island never blocks the flare). Supersedes D24 / AR43 / the Story 8.18 AC's "a lit zone sees into smoke as it sees past islands — pinned, ledgered" and RESOLVES the `deferred-work.md` entry at `:1886`. (143) **Torpedo water inside the sight bubble is hidden by smoke**: `wakeGate`'s in-bubble clause (`d2 <= sight²`) uses `sightClear`, not `losClear`; beyond sight the height march is untouched. (144) **Laying stops at sink entry**: a hull that founders lays no further puff (`smokeUntil` reset where `shield = null` / `dazzledUntil = 0` are reset at sink), so `stepSmoke` sits AFTER `founderSinking` and BEFORE `applyStorm`; a NEW press while sinking is refused `blocked` like every consumable (afloat-only row guard); puffs already laid live out their 30 s (amendment 127 posture — everything on the water outlives its owner). (145) **Interim bot row**: a bot in its `disengage` posture presses SMOKE SCREEN once when not already laying (the chaff cue); Story 8.20 owns the real table.
- **Numbers (epic AC + rulings):** `CONFIG.smokeScreen = { r0: 40, r1: 60, lifeMs: 30000, layMs: 5000, puffIntervalMs: 500, expandMs: 30000 }` — a NEW block; `CONFIG.smoke` (wounded smoke, `puffIntervalMs: 250`) and `CLIENT_CONFIG.smoke` are untouched and never conflated. Cap 5, no reload, no tiers, key-fired (`CONSUMABLE_IS_WEAPON.smokeScreen` stays `false`).
- **Shared math:** `shared/src/sim/smoke.ts` exports `puffRadius(bornAt, now)` = `r0 + (r1 − r0) × min(1, max(0, now − bornAt) / expandMs)` (clamped both ends) and the `SmokePuff` / `SmokeView` shapes; server and client both call it; no per-side re-derivation.
- **THE predicate (server/src/game/signals.ts):** `sightClear(a, b, islands, puffs, now)` = `losClear(a, b, islands) && !puffs.some(p => segCircleHit(a, b, p, puffRadius(p.bornAt, now)) !== null)` using the shared `segCircleHit` (`shared/src/math/geom.ts`, returns 0 when `a` starts inside — so an observer inside a puff is blind and a target inside a puff is hidden, by construction). `SignalContextBase` gains `smoke: readonly SmokePuff[]` (set in `foggedContext` / `spectatorContext`). It replaces `losClear` at EIGHT sites: `shipSees` (:253), `pointSighted` (:264), `pointDetected` (:287), the contact row's inline check (:500), `wakeGate`'s in-bubble clause (:1072), the `mz` halo (:1770), the `sm` halo (:1807), `hornBandFor` (:1902). `shipSees` / `pointSighted` / `pointDetected` / `hornBandFor` take the puffs as a parameter beside `islands`; the four PvE-fleet callers in `server/src/game/drones.ts` (:267, :268, :313, :486) pass `world` puffs (drones are blinded by smoke like everyone — one rule, no carve-out). `ownZoneCovers` adds `&& !puffCrossed(me.state, p, ctx.smoke, ctx.now)` (smoke only). `blipGate`, the radar half of `wakeGate`, `visibilityTo`, the bots' `lineBlocked` (line of FIRE, `ai/utility.ts:129`) and the flare-reach rule (`gunReachU` / `pointInLitZone`) are UNTOUCHED.
- **The smoke channel is a contact-like pseudo-row with its own oracle, NOT a seventh exception** (the litzone / burnzone / decoy precedent): `smokeSignal` in the registry (excluded from `signalFor` like the other pseudo-rows), visible iff `ctx.mode === 'spectator'`, or `p.ownerId === me.id`, or (centre within `sightOf(me, now) + puffRadius` AND island-only `losClear(me, centre)`). `PerceptionView.smoke: SmokeView[]`, `observe()`'s empty literal gains `smoke: []`, `frames.ts` `optionalChannels` adds `smoke` (omitted when empty). Wire `SmokeView { id, x, y, t0 }` — NO radius, no owner, no `until`. Exception count stays SIX.
- **World:** `world.smoke: Map<string, SmokePuff>` (`SmokePuff { id, ownerId, x, y, bornAt, until }`, ids `sk${n}`); `ShipRecord.smokeUntil` (lay window end, 0 = idle) and `nextPuffAt`; `ActivationContext.setSmokeScreen()` stamps `smokeUntil = now + layMs`, `nextPuffAt = now` (the first puff drops on the NEXT tick's `stepSmoke`, ≤ 50 ms later — activationControl runs after it); `stepSmoke` row: for every AFLOAT ship with `smokeUntil > now`, while `now >= nextPuffAt` drop a puff at the STERN (`pos − (hull.length / 2) × (cos h, sin h)`) with `bornAt = now`, `until = now + lifeMs`, `nextPuffAt += puffIntervalMs`; then delete every puff with `now >= until`. Reset `smokeUntil = 0` at addShip / redeployShip / respawn / sink-entry; `resetForMatchStart` clears the store. `smokeCount` getter → `recordSmokeLive` in `ArenaRoom` beside `recordMinesLive`; `/metrics` `world.smokeLivePeak`.
- **Consumable row:** `server/src/game/equipment/consumables/smokeScreen.ts` via `consumableRow('smokeScreen', effect)`: `if (!isAfloat) return blocked`; `ctx.setSmokeScreen(); return ok`. `CONSUMABLES` = 7 rows; catalog stubs = 1 (`depthCharge`); `LINE_IDS` stays 26.
- **Client:** NEW `client/src/render/smokeScreen.ts` (class `SmokeScreen`, on the existing `smoke` chart layer, id-keyed Map reconcile like `burnZones.ts`): one disc per puff at `puffRadius(t0, serverNow)`, `CLIENT_CONFIG.colors.woundedSmoke` fill at low alpha with a 1 px slightly lighter rim, presence and extent MOTION-BLIND (the wounded-smoke rule), alpha easing out over the last 5 s of life (client-only feel knob in `CLIENT_CONFIG.smokeScreen`); DIFFERS FROM WOUNDED SMOKE BY SHAPE (large stationary discs vs small trailing blobs), never by colour. `state.net.smoke`, `roomBindings` sync, `main.ts` alive + spectate render. `client/src/render/wake.ts` `segmentRevealable` mirrors the smoke term with `state.net.smoke` (parity with ruling 143). Belt glyph in `CONSUMABLE_GLYPHS` (draft), `boonCopy` description + card rows `TRAIL 5 s` / `PUFF 30 s` / `RADIUS 40 → 60 u` (drafts for Eric's eye). No new client pre-denial (chaff/shield parity: the server answers `blocked`).
- **Bots:** `CONSUMABLE_TACTICS.smokeScreen` = `{ kind: 'ability', reachU: () => 0, want: afloat && posture === 'disengage' && !laying }` with `smokeUntil` exposed on `BotTickEntry` like `chaffUntil`. Bots never import `world.js`.
- **Tests:** perception oracle gains an INDEPENDENT segment–circle smoke term in `clearLos`/`sighted`/`detected`/`zoneCovers`/`mz`/`sm`/`fh`/wake mirrors + `verifySmoke` for the channel; the fuzz seeds live puffs (including puffs straddling observer→target lines and observers standing inside puffs); registry completeness → 24 keys; perf pin test (20 observers × 200 live puffs, `observe` for all 20 under 50 ms, best of 5, the `hitTargets.test.ts` pattern); `stepOrder.test.ts` row list; `metrics.test.ts` payload; `barrel.test.ts` PV 61 + `radarRaster.test.ts` name clause `60 → 61` + `denials.test.ts` join gate; `hullRepair.test.ts` re-pinned to REPLACE; catalog/equipment/botPolicy stub counts; client `hotbar`/`boonCopy`/`cardStatRows`/`keyboard`/`roomBindings`/new `smokeScreen.test.ts`; golden frames re-recorded only if a battery frame changes.
- **Docs wave:** `VERSION` + root `package.json` + lock → `0.18.18` (cycle 153); `CHANGELOG.md`; ONE-LINE stamps in both trackers; amendments 138–145 appended to `epic-8-context-amendments.md` AND condensed under `## Ratified Amendments` in `epic-8-context.md`; `deferred-work.md` 8.18 section (drafts for Eric; resolve `:1886`; the 9.11 reconciliation list gains D24/AR43's lit-zone pin and amendment 51's stacking law); `catalog-v3.md` dated stamp on R38 (numbers filled, self-hiding confirmed by construction) and R13 (pool replaces); EXPERIENCE/DESIGN only if a line becomes false; How-to-Play untouched (8.22).

**Block If:** any need for a number not listed above; any reading in which a puff, a smoked contact or torpedo water reaches an observer outside the declared gates; a seventh perception exception; a per-side fork of `puffRadius`; a radar-side smoke term.

**Never:** DEPTH CHARGE; puffs on radar; puffs that drift or move; a smoke term on the flare-reach (`gunReachU`) rule or the bots' line-of-fire check; touching `CONFIG.smoke` / `render/smoke.ts` (wounded smoke); How-to-Play copy; editing `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lay | key-fire with 1 copy, afloat, heading 0 at (0,0), TB hull | copy spent, `smokeUntil = now+5000`; next tick a puff at (−len/2, 0); 10 puffs over 5 s at 500 ms; 11th never | none |
| Puff growth | puff born at t0 | radius 40 at t0, 50 at t0+15 s, 60 at t0+30 s (then deleted) | none |
| Re-press | pressed again at +3 s | second copy spent; `smokeUntil = now+5000`; puffs continue to +8 s (16 total) | none |
| Sinking press | hull sinking, 1 copy | `blocked` denial, copy kept | denial event |
| Founders mid-lay | sinking begins at +2 s of a lay | no puff after the founder tick; the 4 laid puffs live to their `until` | none |
| Occlusion | enemy at 200 u, puff r40 centred on the segment | enemy NOT in observer's frame; radar blip (if swept) unaffected | none |
| Inside a puff | observer standing in a puff, enemy 100 u away in the clear | enemy NOT in the observer's frame (the segment starts inside the puff); the observer NOT in the enemy's frame either (the segment ends inside it) — symmetric | none |
| Flare + smoke | observer's live lit zone covers enemy; a puff lies between them | enemy NOT revealed (ruling 142); same enemy with the puff BEHIND them (not on the segment) IS revealed; an island between them never blocks | none |
| Torpedo water | fish's water segment at 250 u inside the bubble, puff on the segment | `wk` not emitted; same segment at 500 u (radar half) governed by the height march only | none |
| Detect rung | mine at 200 u behind a puff | mine not sent; decoy behind a puff not sent | none |
| Halos + horn | enemy fires / smokes / honks at 400 u behind a puff | no `mz`, no `sm`; `fh` takes the one-step muffle demotion | none |
| Puff visibility | puff centre at `sight + 20` u, r40, island-clear | in the observer's `smoke` channel; at `sight + 70` u not; behind an island not; the owner's own puffs always; a spectator always | none |
| Inside-puff visibility | observer inside puff A, puff B 100 u away | B still in the channel (island-only gate) | none |
| Wire shape | any puff sent | `{id, x, y, t0}` only; no `r`, no owner, no `until` | none |
| Heal replace | HULL REPAIR at 2 s into a pool with 30 owed | `repairHp` = 50 (not 80); hp +50 instant; pays out over 5 s | none |
| Bot interim | bot with a SMOKE stack enters `disengage` | presses once; not again while `smokeUntil > now` | none |
| Perf | 20 observers × 200 live puffs, 20 hulls | `observe()` for all 20 under 50 ms (best of 5) | none |
| Reset | practice → match boundary | `world.smoke` empty, every `smokeUntil` 0 | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- NEW `CONFIG.smokeScreen` beside `shieldBlock`/`chaff`/`decoyBuoy`; `CONFIG.hullRepair` comment (pool REPLACES)
- `shared/src/sim/smoke.ts` -- NEW `puffRadius`, `SmokePuff`, `SmokeView` types; `shared/src/index.ts` -- exports + `PROTOCOL_VERSION` 61 + header entry
- `shared/src/types.ts` -- `FrameMsg.smoke?: SmokeView[]` (beside `decoys?`/`burnZones?`); NOT `SmokeEvent` (that is the wounded `sm` event)
- `shared/src/sim/catalog.ts` -- drop the stub flag on `smokeScreen`; header counts
- `shared/src/__tests__/{catalog,barrel,radarRaster,hullRepair}.test.ts` -- stub list, PV, name clause, NFR6 note
- `server/src/game/signals.ts` -- `sightClear`, `puffCrossed`, `SignalContextBase.smoke`, the eight call sites, `ownZoneCovers` smoke term, `smokeSignal` pseudo-row, registry + `signalFor` exclusion, header count
- `server/src/game/perception.ts` -- `PerceptionView.smoke`, `smokeScan`, contexts carry `smoke`, `observe()` literal; `server/src/game/frames.ts` -- `optionalChannels` + wire-order comment
- `server/src/game/world.ts` -- store, `smokeUntil`/`nextPuffAt`, `setSmokeScreen`, `stepSmoke` row (after `founderSinking`, before `applyStorm`), resets, `smokeCount`, `applyRepair` REPLACE; `server/src/game/drones.ts` -- `shipSees` callers pass puffs
- `server/src/game/equipment/consumables/smokeScreen.ts` -- NEW row; `consumables.ts` registry; `equipment/index.ts` `ActivationContext.setSmokeScreen`
- `server/src/metrics.ts`, `server/src/rooms/ArenaRoom.ts` -- `smokeLivePeak`
- `server/src/game/ai/equipment.ts`, `ai/types.ts` -- interim row, `smokeUntil` on the entry
- `server/src/__tests__/{perception,signals,stepOrder,metrics,denials,equipment,hullRepair,upgrades,botPolicy,goldenFrames}.test.ts` + NEW `smokeScreen.test.ts`, `smokePerf.test.ts`
- `client/src/render/smokeScreen.ts` -- NEW; `client/src/state.ts`, `net/roomBindings.ts`, `main.ts`, `render/wake.ts` (mirror), `render/equipmentIcons.ts` (glyph), `ui/boonCopy.ts` (copy + rows), `config.ts` (`CLIENT_CONFIG.smokeScreen` fade knob); tests
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-8-context.md,epic-8-context-amendments.md,deferred-work.md}`, `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/catalog-v3.md`

## Tasks & Acceptance

**Execution:**
- [ ] Wave 1 `shared/` (Opus) -- CONFIG block, `sim/smoke.ts`, `FrameMsg.smoke`, stub flip, PV 61 + header, exports, tests -- `npm run build -w shared && npm test -w shared`
- [ ] Wave 2 `server/` (Fable — perception chokepoint) -- predicate + eight sites + zone term, store/step/activation/resets, row + registry, metrics, hull-repair replace, drones callers, bots interim, perception channel + oracle + fuzz + perf pin, all server tests -- `npm test -w server`; `tsc` on `server/scripts/{batchsim,rl}`
- [ ] Wave 3 `client/` (Opus, parallel with 2, shared frozen) -- renderer, state/bindings/main, wake mirror, glyph, copy, tests -- `npm test -w client`
- [ ] Wave 4 docs (Sonnet) -- version 0.18.18, changelog, both trackers, amendments 138–145 in both homes, deferred-work, catalog-v3 stamps -- `npm run check` exit 0
- [ ] Unit-test every row of the I/O matrix

**Acceptance Criteria:**
- Given the perception fuzz (seeded worlds with random live puffs, lit zones, burn zones, chaff, decoys), then no contact, mine, decoy, ballistic, `mz`/`sm`/`wk` mark or foghorn band reaches an observer that an independent island∧smoke segment test hides; every puff received passes its own gate; the exception count is six; the registry has 24 keys.
- Given two hulls 200 u apart with one puff on the segment and a radar sweep crossing the target, then the target appears as a blip and never as a contact; removing the puff makes it a contact.
- Given `npm run check`, then lint, tsc ×3 and every test pass; `PROTOCOL_VERSION` is 61; `CONSUMABLES` has 7 rows; the catalog has 1 stub; `CONFIG.smoke.puffIntervalMs` is still 250.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why eight sites, not the epic's six:** the contact row (`signals.ts:500`) inlines its own distance∧LOS test and never calls `shipSees`; the in-bubble torpedo-water clause stands in for the detect rung. Both would leak a smoked hull if left on `losClear`. The oracle's `sighted()` check on contacts would have caught the first; Eric ruled the second.
- **Why the smoke term on the flare is smoke-only:** Eric's ruling makes smoke stronger than an island for the flare, deliberately; the flare still hangs over islands.
- **Why the smoke row is a channel, not an exception:** its gate (`sight + r`, island LOS, owner-always) is a per-row oracle exactly like litzone/burnzone/decoy; the six exceptions are events that reach beyond every gate.
- **Why `stepSmoke` runs after `founderSinking`:** ruling 144 — the founder tick is the last tick a hull can lay nothing; placing the row after the edge makes "stops at sink entry" true without a second liveness read.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- green after wave 1
- `npm test -w server`; `npm test -w client` -- green after waves 2–3
- `npm run check` -- exit 0 after wave 4
- `npx tsc -p server/scripts/rl --noEmit` + the batchsim tsconfig -- clean
