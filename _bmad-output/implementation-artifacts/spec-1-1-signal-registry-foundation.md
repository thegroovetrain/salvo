---
title: 'Story 1.1: Signal Registry Foundation'
type: 'refactor'
created: '2026-07-18'
status: 'in-progress'
baseline_revision: '780567eeac82bd125a32e4f96812ace9dc5314f8'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Per-signal fog-of-war rules are hand-woven through `perception.ts` (`observe()` + `observeSpectator()` with a hardcoded per-kind dispatcher), so every future signal (smoke, star shells, the 1.8 decoy's counter-intel lies) risks a silent leak path and ad-hoc test coverage.

**Approach:** Extract every existing spatial signal into a declarative `SIGNAL_REGISTRY` in new `server/src/game/signals.ts` — rows of `SignalSpec { eventType, visible(), materialize(), counterIntel? }` — with `observe()`/`observeSpectator()` iterating the registry as the only callers, and the invariant suite iterating the registry so a row without a passing invariant case fails CI by construction. Pure refactor: byte-identical wire output.

## Boundaries & Constraints

**Always:**
- Byte-identical wire output. Frames go out via Colyseus `client.send` (msgpack; key insertion order is load-bearing). Preserve exactly: field order of every materialized object (`Contact`: id,x,y,heading,speed,cls; `BallisticEvent`: k,id,x,y,vx,vy,t; stripped boom: k,id,x,y with NO `hit` key; `MineView`: id,x,y,own; `FrameMsg`: t,tick,ackSeq,you?,contacts,events,mines,spec?); event ordering within a frame (filtered tickEvents in world-emission order → ballistic reveals → blips; spectator: tickEvents minus shell/torp → spectator ballistics, no blips); contact/mine ordering (Map insertion order — never re-sort or bucket by type); shell/torp reveals stamp `t: world.now` (not the queued event's `bornAt`); `me.seenBallistics` exactly-once mutation retained with identical timing.
- Registry rows cover every existing signal channel: the 10 `GameEvent` kinds (`blip`, `shell`, `torp`, `boom`, `dmg`, `sunk`, `spawn`, `upg`, `pt`, `heal`) plus the `contact` and `mine` channels, so nothing spatial leaves the server outside a row.
- `observe()`/`observeSpectator()` are the ONLY callers of `visible`/`materialize`; `frames.ts` remains the sole spatial exit; rows receive a narrow context (imitate `FireContext` in `weapons/index.ts`), not raw Colyseus types.
- `perception.test.ts` keeps its test-local reimplemented predicates as the independent oracle (never use a row's own `visible()` to validate itself). Registry iteration is ADDITIVE: a completeness check (every emittable kind has a row; unknown kind still throws) and a per-row required invariant case.
- `game/` keeps zero Colyseus imports; complexity ≤ 10; `PROTOCOL_VERSION` unchanged; no changes to `shared/src/types.ts`.
- All existing tests stay green unmodified in meaning (mechanical updates to imports/structure allowed; assertions must not weaken).

**Block If:**
- Byte-identical output cannot be preserved for some signal without changing observable behavior (golden-frame test fails irreconcilably).
- Porting a signal to a row forces a wire-contract or shared-types change.

**Never:**
- No new signals, no `counterIntel` implementations (the optional field exists; first row arrives in Story 1.8), no smoke/star-shell/decoy logic.
- No client changes, no schema (`ArenaState`) changes, no changes to event generation in `world.ts`/weapons.
- No behavior or balance change of any kind; no test deletion or weakening.

</intent-contract>

## Code Map

- `server/src/game/perception.ts` (347 LOC) -- `observe()` L269-281, `observeSpectator()` L297-316, per-kind dispatcher `worldEventForObserver` L248-262, helpers `losClear`/`pointSighted`/`sweptThisTick`; the refactor target.
- `server/src/game/signals.ts` -- NEW: `SignalSpec` + `SIGNAL_REGISTRY`.
- `server/src/game/frames.ts` (81 LOC) -- sole caller of observe/observeSpectator; sole spatial exit; should not change materially.
- `server/src/game/weapons/index.ts` L30-43 -- the `WeaponSystem` registry pattern to imitate (interface + frozen collection + narrow context).
- `shared/src/types.ts` L146-295 -- wire contract (read-only reference for field order).
- `server/src/__tests__/perception.test.ts` (585 LOC) -- invariant suite; `verifyEvent` hardcoded switch L466-524 is the enumeration to make registry-driven; keep independent oracle predicates L37-62.
- `server/src/__tests__/frames.test.ts`, `spectator.test.ts` -- must stay green.
- `server/src/game/world.ts` -- event generation + `tickEvents` getter (read-only; do not touch).

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/__tests__/goldenFrames.test.ts` -- NEW, written FIRST against the current code: deterministic seeded world (fixed seed, scripted inputs, several ships/shells/mines/sinkings, ≥1 spectator frame, enough ticks to cover every event kind), `JSON.stringify` each built frame and snapshot to a committed fixture -- byte-identity gate for the whole refactor (JSON key order ⇒ msgpack key order).
- [ ] `server/src/game/signals.ts` -- NEW: `SignalSpec` interface (`eventType`, `visible(ctx)`, `materialize(ctx)`, optional `counterIntel`) + `SIGNAL_REGISTRY` covering all 12 channels; spectator-path variance handled inside rows or via an observer-mode flag in the narrow context -- one declarative home per signal.
- [ ] `server/src/game/perception.ts` -- refactor `observe()`/`observeSpectator()` to iterate `SIGNAL_REGISTRY`; no other module may call row functions; preserve all ordering/field-order rules from Always -- the AC's "only caller" clause.
- [ ] `server/src/__tests__/perception.test.ts` -- replace the hardcoded `verifyEvent` switch enumeration with registry-driven iteration: completeness check (every kind ↔ row) + assert every row has a registered invariant case (fail CI if a row lacks one); keep independent oracle predicates -- the AC's "fails CI by construction".
- [ ] `server/src/__tests__/signals.test.ts` -- NEW: registry unit tests -- row shape, key-ORDER guards per materialized kind (Object.keys order, not sorted), stripped-boom has no `hit` key, shell/torp reveal stamps `world.now`.

**Acceptance Criteria:**
- Given the refactored server, when the golden-frames fixture (recorded pre-refactor) is replayed, then every frame's serialized bytes are identical.
- Given the invariant suite, when a hypothetical registry row exists without a matching invariant test case, then the suite fails (demonstrated by the completeness assertions).
- Given a developer adding a future signal, when they add exactly one registry row plus its test case, then no `perception.ts` dispatcher edit is required (verify: `observe()` contains no per-kind branching outside registry iteration).
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- The registry is string-keyed by `eventType` (a `Map`/record), unlike the index-keyed `WEAPON_SYSTEMS` array. `contact` and `mine` are not `GameEvent`s — give them registry rows with their own pseudo event types so the invariant suite iterates them, but their emission stays in the contacts/mines frame channels.
- The current single pass interleaves contact detection and blip generation (`pairScan`). Rows declare the rules; `observe()` may keep an efficient pass structure as long as rows are the only source of visibility/materialization logic and ordering is preserved.
- `verifyEvent`'s `default: throw 'unexpected event kind leaked'` must survive in equivalent form: an event kind with no registry row must still be a hard failure.

## Verification

**Commands:**
- `npm test -w server` -- expected: all server tests green, including new goldenFrames + signals suites.
- `npm run check` -- expected: lint (complexity ≤ 10), tsc for all workspaces, all tests green.
