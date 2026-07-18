---
title: 'Story 1.1: Signal Registry Foundation'
type: 'refactor'
created: '2026-07-18'
status: 'done'
baseline_revision: '780567eeac82bd125a32e4f96812ace9dc5314f8'
final_revision: '3dc0ebc80917d64e6db8ec1a6bbc527e84dc195a'
review_loop_iteration: 0
followup_review_recommended: true
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
- [x] `server/src/__tests__/goldenFrames.test.ts` -- NEW, written FIRST against the current code: deterministic seeded world (fixed seed, scripted inputs, several ships/shells/mines/sinkings, ≥1 spectator frame, enough ticks to cover every event kind), `JSON.stringify` each built frame and snapshot to a committed fixture -- byte-identity gate for the whole refactor (JSON key order ⇒ msgpack key order).
- [x] `server/src/game/signals.ts` -- NEW: `SignalSpec` interface (`eventType`, `visible(ctx)`, `materialize(ctx)`, optional `counterIntel`) + `SIGNAL_REGISTRY` covering all 12 channels; spectator-path variance handled inside rows or via an observer-mode flag in the narrow context -- one declarative home per signal.
- [x] `server/src/game/perception.ts` -- refactor `observe()`/`observeSpectator()` to iterate `SIGNAL_REGISTRY`; no other module may call row functions; preserve all ordering/field-order rules from Always -- the AC's "only caller" clause.
- [x] `server/src/__tests__/perception.test.ts` -- replace the hardcoded `verifyEvent` switch enumeration with registry-driven iteration: completeness check (every kind ↔ row) + assert every row has a registered invariant case (fail CI if a row lacks one); keep independent oracle predicates -- the AC's "fails CI by construction".
- [x] `server/src/__tests__/signals.test.ts` -- NEW: registry unit tests -- row shape, key-ORDER guards per materialized kind (Object.keys order, not sorted), stripped-boom has no `hit` key, shell/torp reveal stamps `world.now`.

**Acceptance Criteria:**
- Given the refactored server, when the golden-frames fixture (recorded pre-refactor) is replayed, then every frame's serialized bytes are identical.
- Given the invariant suite, when a hypothetical registry row exists without a matching invariant test case, then the suite fails (demonstrated by the completeness assertions).
- Given a developer adding a future signal, when they add exactly one registry row plus its test case, then no `perception.ts` dispatcher edit is required (verify: `observe()` contains no per-kind branching outside registry iteration).
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

### 2026-07-18 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 4, low 4)
- defer: 0
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - `[medium]` `[patch]` Pseudo-rows (`contact`/`mine`) were reachable from world-event dispatch (mine row's spectator branch unconditionally true) — `signalFor` now resolves only the 10 GameEvent kinds, restoring the old `default: return null` structural guarantee.
  - `[medium]` `[patch]` Ballistic `materialize()` mutated `seenBallistics` on a publicly importable registry (Blind + Codex agreed) — mutation moved to `perception.ballisticScan`; rows are now pure wire-shapers with identical timing (golden fixture unchanged).
  - `[medium]` `[patch]` Golden fixture blind spots (no island-LOS, no non-owner ballistic reveal, no spectator reveal/dmg/boom variants) — three scenarios appended with 11 self-validating sub-case assertions; existing snapshot entries byte-unchanged.
  - `[medium]` `[patch]` No CI pressure for a future 11th GameEvent kind — compile-time exhaustiveness type assertion in signals.ts (`tsc` fails if the shared union outgrows the registry; proven by intentional failure).
  - `[low]` `[patch]` Prototype-chain lookup holes (`'constructor'`/`'toString'`) in `signalFor` and the test verifier map — `Object.hasOwn` guards both.
  - `[low]` `[patch]` `Object.freeze` was shallow — every row now individually frozen and asserted frozen.
  - `[low]` `[patch]` JSON-stringify proxy limits (undefined-valued keys, -0) undocumented — fidelity-limits note added to the golden test header (key-presence bugs covered by signals.test key-order guards).
  - `[low]` `[patch]` Dead `losClear` re-export removed from perception.ts (no consumers; tests deliberately reimplement it).

Rejected as noise (adjudicated by orchestrator against pre-refactor code): "unknown kinds should throw" (pre-refactor behavior was an identical silent fail-closed drop; the test-side hard failure exists); spectator unknown-kind strictness (vacuous — no such kinds exist, direction is safer); AC-wording concerns; test-scaffolding duplication (deliberate suite convention); `ballisticScan` missing-row guard (compile-time enforced); shipScan perf/comment drift; `emitWorldEvent` private-field coupling (test pragmatics); type-erased dispatch cast (localized, shape-guarded by tests); speculative counterIntel API churn.

## Design Notes

- The registry is string-keyed by `eventType` (a `Map`/record), unlike the index-keyed `WEAPON_SYSTEMS` array. `contact` and `mine` are not `GameEvent`s — give them registry rows with their own pseudo event types so the invariant suite iterates them, but their emission stays in the contacts/mines frame channels.
- The current single pass interleaves contact detection and blip generation (`pairScan`). Rows declare the rules; `observe()` may keep an efficient pass structure as long as rows are the only source of visibility/materialization logic and ordering is preserved.
- `verifyEvent`'s `default: throw 'unexpected event kind leaked'` must survive in equivalent form: an event kind with no registry row must still be a hard failure.

## Verification

**Commands:**
- `npm test -w server` -- expected: all server tests green, including new goldenFrames + signals suites.
- `npm run check` -- expected: lint (complexity ≤ 10), tsc for all workspaces, all tests green.

## Auto Run Result

Status: done

**Summary:** Story 1.1 Signal Registry Foundation delivered as a pure refactor with byte-identical wire output. Every spatial signal (10 GameEvent kinds + contact/mine channels) is now one declarative `SignalSpec` row in `server/src/game/signals.ts`; `observe()`/`observeSpectator()` collapse into one registry-driven `view()` with no per-kind branching outside registry dispatch; the invariant suite iterates the registry so a row without a test case fails CI by construction (compile-time exhaustiveness also ties the registry to the shared `GameEvent` union). Implementation was orchestrated per /orchestrate model routing: Opus (golden fixture, invariant suite, patch rounds), Fable (registry + perception refactor — the anti-cheat chokepoint), Sonnet (registry unit tests), with a Fable×2 + Codex cross-model review gate.

**Files changed:**
- `server/src/game/signals.ts` -- NEW: SignalSpec + deep-frozen 12-row SIGNAL_REGISTRY; `signalFor` (event kinds only, prototype-safe); compile-time exhaustiveness assertion.
- `server/src/game/perception.ts` -- 347→~150 LOC; registry-driven `view()`; exactly-once ballistic mark owned by `ballisticScan`.
- `server/src/__tests__/goldenFrames.test.ts` + snapshot -- NEW byte-identity gate: 9 seeded scenarios, 16 frames, 13-channel + 11-sub-case self-validating coverage (island LOS, non-owner/spectator reveals included).
- `server/src/__tests__/perception.test.ts` -- verifier-map enumeration pinned to registry keys (row without verifier fails CI); registry completeness block; fail-closed shape-guard tests; independent oracle preserved.
- `server/src/__tests__/signals.test.ts` -- NEW: 20 structural tests (wire key-ORDER guards, pure materialize, exactly-once, fail-closed lookups, deep-freeze).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- story 1-1 marked done.
- `_bmad-output/implementation-artifacts/epic-1-context.md` -- NEW: compiled Epic 1 planning context.

**Review findings breakdown:** 8 patches applied (4 medium, 4 low — all hardening; zero behavior/leak defects found in the refactor itself), 0 deferred, 9 rejected as noise (each adjudicated against pre-refactor code). Both in-family reviewers and Codex independently confirmed the refactor is semantically faithful; Codex's fix-first verdict rested on the mutating-materialize and silent-drop findings — the first was fixed, the second adjudicated as pre-existing intended behavior (fail-closed drop, unchanged from the old `default: return null`).

**Verification:** `npm run check` green end-to-end after every wave and after the patch round — 796 tests (shared 129, server 375, client 292), 0 lint errors, tsc clean in all three workspaces. Golden fixture recorded pre-refactor (commit 6829733), byte-identical through the refactor and all patches; determinism proven by double runs; the CI-by-construction mechanism proven by intentional mutations (deleted verifier → suite fails; fake GameEvent kind → tsc fails).

**Residual risks:** the golden gate is a JSON proxy for msgpack (documented limits: undefined-valued keys, -0); `counterIntel` is a declared-but-unconsumed API slot whose final signature may still churn when Story 1.8's decoy lands; scan-driven future signals (smoke 1.6, star shells 1.7) will legitimately touch perception.ts scan loops — the "one row + one test" AC holds for event-kind signals.
