---
title: 'Story 0.4: Portal Adapter Seam (Null Implementation)'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_revision: '5b78542fec34edd0aedb69d7826fc0429597a6b2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-0-context.md',
  ]
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Epic 7 will integrate web-game portal SDKs (Poki/CrazyGames), which demand hooks at loading and match lifecycle moments. Today no seam exists — retrofitting one later means re-plumbing `main.ts` under deadline pressure instead of slotting an adapter into a waiting interface.

**Approach:** Install a `PortalAdapter` interface (`init`, `loadingProgress`, `matchStart`, `matchEnd`, `requestAdBreak`) in a new `client/src/portal/` home, backed by `nullAdapter.ts` (all no-ops), and route the client's existing lifecycle choke points through it. The death→requeue flow awaits `requestAdBreak()` (resolves immediately today). Client-only; zero server or wire changes.

## Boundaries & Constraints

**Always:**

- The seam is the rule: no game code may ever import a portal SDK directly; only modules under `client/src/portal/` may (none do today). The rest of the client depends solely on the `PortalAdapter` interface.
- Interface contract, documented on the interface: implementations must never throw and returned promises must always settle; the game must remain fully playable if a portal call misbehaves. Callers of `requestAdBreak()` proceed on rejection as if it resolved (never strand the player on an ad).
- Signatures [autonomous rulings, mirroring Poki/CrazyGames shapes]: `init(): Promise<void>`, `loadingProgress(fraction: number): void` (0..1), `matchStart(): void`, `matchEnd(): void`, `requestAdBreak(): Promise<void>`.
- Wire through existing choke points only: `init` + `loadingProgress(0)`/`loadingProgress(1)` bracket the stage load in `main()`; `matchStart()` fires on the existing edge-detected match-live moment (beside the `matchStart` audio cue); `matchEnd()` fires when the results broadcast arrives (the `onResults` wiring); `requestAdBreak()` is awaited in `returnToPort()` before `room.leave()`/reload.
- One-way data flow holds: the adapter is an outbound fire-and-forget sink. No portal calls from pure leaf modules (`state.ts`, `ui/phase.ts`), from `roomBindings.ts` state mutation, or inside per-frame render paths (lifecycle edges only).
- The `Game` object carries `portal: PortalAdapter`; `main()` constructs the null adapter and threads it. Preserve the existing `g.returning` re-entry guard in `returnToPort()`.
- Each `matchStart`/`matchEnd` fires at most once per match on a client (edge/latch, not per-frame).

**Block If:**

- Wiring the seam provably requires a wire-contract change, a server change, or breaking the client's one-way data flow.

**Never:**

- No real SDK integration, no ad logic, no network calls, no script tags — Epic 7's job. No new npm dependencies.
- No event bus / pub-sub; direct interface calls at choke points only.
- No `PROTOCOL_VERSION` bump, no schema/CONFIG changes (a portal knob earns a config home only when a real adapter exists).
- No behavior change observable to the player: identical flow, timing, and UI with the null adapter installed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Boot | Page load | `init()` awaited, `loadingProgress(0)` → stage load → `loadingProgress(1)`, then menu shows; null impl adds no delay | No error |
| Match goes live | Phase edge waiting/countdown → active | `matchStart()` exactly once, alongside the existing audio cue; never again on later frames of the same match | No error |
| Results arrive | `MSG.results` broadcast | `matchEnd()` exactly once, results screen unchanged | No error |
| Death→requeue | RETURN TO PORT click | `requestAdBreak()` awaited → `room.leave()` → reload; double-click still ignored via `g.returning` | Rejection → proceed to leave/reload anyway |
| Adapter misbehaves | Any portal method throws/rejects | Game flow proceeds exactly as with the null adapter | Caught/ignored at call sites per contract |
| Disconnect mid-match | Server drops room (`handleRoomLeave`) | No `matchEnd`, no ad break — existing banner→reload path untouched | No error |

</intent-contract>

## Code Map

- `client/src/portal/portalAdapter.ts` -- NEW: `PortalAdapter` interface + contract docs (no-throw, always-settle)
- `client/src/portal/nullAdapter.ts` -- NEW: `createNullAdapter(): PortalAdapter`, every method a no-op / resolved promise
- `client/src/portal/safeAdapter.ts` -- NEW (review-driven): `safeAdapter(inner)` wrapper making any adapter no-throw/always-settle with a timeout-capped `requestAdBreak` — the game-side safety guarantee of the seam
- `client/src/main.ts:926-940` -- `main()`: construct null adapter, `init` + `loadingProgress` bracketing `createStage()` (:927)
- `client/src/main.ts:67-140` -- `Game` interface gains `portal: PortalAdapter`; threaded via `buildGame` (:914)
- `client/src/main.ts:330-338` -- `matchStart()` beside the `result.matchStart` audio cue (:337) — the existing pure edge detector (`audioCues`)
- `client/src/main.ts:605` -- `onResults` wiring: `matchEnd()` before `showResults`
- `client/src/main.ts:368-375` -- `returnToPort()`: await `requestAdBreak()` (rejection-tolerant) before `room.leave()`/reload
- `client/src/__tests__/portal.test.ts` -- NEW: null-adapter contract tests (pure-logic convention, flat `__tests__/` dir)
- `client/src/audio/tones.ts` -- read-only reference: `audioCues()` edge pattern; no changes

## Tasks & Acceptance

**Execution:**

- [x] `client/src/portal/portalAdapter.ts` -- define `PortalAdapter` + contract docs -- the seam every later SDK slots into
- [x] `client/src/portal/nullAdapter.ts` -- null implementation -- keeps the game portal-free today
- [x] `client/src/main.ts` -- wire all five calls at the choke points above; add `portal` to `Game` -- the actual seam installation
- [x] `client/src/__tests__/portal.test.ts` -- null-adapter contract: every method callable, promises settle, `loadingProgress` accepts 0/1; unit-test the I/O matrix rows that are pure (adapter behavior), leaving DOM-bound wiring to typecheck + smoke -- proof the contract holds

**Acceptance Criteria:**

- Given `npm run check`, when run, then lint + tsc + all tests pass across all three workspaces with no server-side diff (`git diff --stat` shows only `client/src` + spec artifacts).
- Given the built client with the null adapter, when a full local match is played (menu → play → live → death → results → return to port), then behavior is player-identical to before the change.
- Given `grep -rni "poki\|crazygames" client/src server/src shared/src`, when run, then no matches (comments in `portal/` excepted).
- Given the `PortalAdapter` interface, when Epic 7 later implements a real adapter, then no file outside `client/src/portal/` and the `main.ts` construction site needs to change (the interface is the only dependency surface).

## Spec Change Log

## Review Triage Log

### 2026-07-18 — Review pass (Blind Hunter + Edge Case Hunter)

- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 2, low 2)
- defer: 1: (high 0, medium 1, low 0)
- reject: 4
- addressed_findings:
  - `[medium]` `[patch]` Call-site tolerance for misbehaving adapters existed only at `requestAdBreak` — the spec's I/O matrix requires "game proceeds as with the null adapter" for ANY portal method (a rejecting `init()` would brick boot; a throwing `matchEnd()` would suppress the results screen; a throwing `matchStart()` would escape into the frame loop) (both hunters) → NEW `portal/safeAdapter.ts`: `safeAdapter(inner)` wraps every adapter once at construction (swallows sync throws, resolves rejections), making all call sites legitimately fire-and-forget; hostile-adapter regression tests
  - `[medium]` `[patch]` `matchEnd()` had no once-per-match latch and the double-fire is reachable today — a story-0.2 resume re-delivers the cached results broadcast, re-firing `onResults` (both hunters; Edge Case Hunter confirmed against server source ArenaRoom.ts:412) → `Game.matchEnded` latch guards the portal call (results re-display itself is pre-existing behavior, unchanged)
  - `[low]` `[patch]` A hanging `requestAdBreak()` would strand the player permanently (`g.returning` already true also mutes `handleRoomLeave`'s reload) → `safeAdapter` caps it with `Promise.race` at 35s (> any standard interstitial; autonomous ruling), tested with an injected 10ms timeout
  - `[low]` `[patch]` Interface docs said "fire-and-forget" for two awaited flow-controlling methods, muddled caller vs implementation obligations, and left `loadingProgress` input tolerance unassigned → contract rewritten as implementation-side vs game-side sections referencing the safeAdapter guarantee; `returnToPort` chain simplified (wrapper guarantees settle) with a catch that also covers a sync-throwing `room.leave()`
- Deferred: the five-method seam omits hooks real portals demand — no pause/resume around ad breaks (mute audio / suspend input), no `matchStart`/`matchEnd` pairing on mid-match disconnect, spectate-phase gameplay semantics, and a loading bracket that covers only the stage load (not post-PLAY connect) — interface shape is the epic's approved scope; extending it is a design decision for Epic 7 → deferred-work.md.
- Rejected: portal `matchStart()` placement inside `updateMatchAudioCues()` (spec explicitly sanctioned riding that exact edge; the edge result is only consumable there); spurious-`matchStart`-on-future-mid-match-join coupling (speculative feature; the audio cue has the identical property today); "tautological tests" (the spec scoped tests to adapter behavior, DOM wiring to typecheck/smoke — and the safeAdapter tests add the real coverage); cosmetics (`audio, portal` shared line is a deliberate max-lines workaround with in-file precedent; `buildGame` parameter-count style opinion).

## Design Notes

- **Why await `init()` before loading:** real portal SDKs require init before loading/gameplay events; encoding the ordering now (init → loadingProgress → menu) means Epic 7 changes one constructor call, not the boot sequence. Null impl resolves immediately, so boot timing is unchanged.
- **Why `requestAdBreak()` in `returnToPort()` only:** the epic scopes the ad-break moment to death→requeue. `handleRoomLeave` (disconnect) is not a requeue decision and stays untouched.
- **`matchStart` edge reuse:** `audioCues()` already computes the once-per-match live edge; the portal call rides the same consumed result (`result.matchStart`) rather than a new detector — no new plumbing, identical semantics to the audio cue.
- **Interface file naming:** `portalAdapter.ts` per lowerCamelCase convention; epic names only `nullAdapter.ts`, which is kept verbatim.

## Verification

**Commands:**

- `npm run check` -- expected: lint + tsc + all tests green, all three workspaces
- `npm test -w client` -- expected: new portal tests green alongside existing 281+
- `grep -rni "poki\|crazygames" client/src server/src shared/src` -- expected: no matches
- `git diff --stat main` -- expected: only client/src files + implementation artifacts

**Manual checks (if no CLI):**

- If the dev server is already running (curl-check `:5173` first; never start it), play one match through death → results → RETURN TO PORT and confirm identical UX. If not running, rely on `npm run check` + the wiring being one line per choke point.

## Auto Run Result

**Status:** done (2026-07-18)

**Summary:** The portal seam is installed. A `PortalAdapter` interface (`init`, `loadingProgress`, `matchStart`, `matchEnd`, `requestAdBreak`) now lives in `client/src/portal/`, backed by `createNullAdapter()` (all no-ops) and — review-driven — `safeAdapter()`, a wrapper applied once at construction that makes ANY adapter safe for the game: synchronous throws swallowed, rejections resolved, and `requestAdBreak()` capped at 35s so even a hanging future SDK can never strand a player. The five lifecycle calls ride existing choke points in `main.ts`: `init()` + a `loadingProgress(0→1)` bracket around the stage load at boot, `matchStart()` on the existing once-per-match `audioCues()` live edge, `matchEnd()` latched in the `onResults` wiring (immune to the story-0.2 resume re-delivering cached results), and `requestAdBreak()` awaited in `returnToPort()` before leave/reload. No game code imports a portal SDK; Epic 7 swaps one constructor argument. Client-only — zero server/shared/wire changes, no new dependencies, player-identical behavior with the null adapter.

**Files changed:** NEW `client/src/portal/portalAdapter.ts` (interface + two-sided contract docs), `client/src/portal/nullAdapter.ts` (no-op impl), `client/src/portal/safeAdapter.ts` (game-side safety wrapper, review-driven), `client/src/__tests__/portal.test.ts` (11 tests: null-adapter contract + hostile/hanging-adapter safeAdapter proofs); MODIFIED `client/src/main.ts` (Game gains `portal` + `matchEnded` latch; five wire points; `returnToPort` ad-break sequencing).

**Review findings breakdown:** two parallel reviewers (Blind Hunter, Edge Case Hunter). 4 patches applied (2 medium: call-site tolerance for misbehaving adapters existed only at one of five sites → solved structurally with safeAdapter; matchEnd double-fire reachable today via reconnect results re-delivery → latched; 2 low: hanging-ad-break timeout backstop; contract-doc rewrite + unhandled-rejection nit), 1 deferred (seam-shape debt for Epic 7: pause/resume hooks, gameplayStart/Stop pairing on disconnect, spectate semantics, loading-bracket fidelity — interface extensions are a design decision for Eric), 4 rejected with recorded reasoning. No intent gaps, no bad_spec loopbacks.

**Verification performed:** `npm run check` exit 0 — 770 tests green (129 shared + 349 server + 292 client; +11 over baseline), lint + tsc clean across all three workspaces, twice (post-implementation and post-patches). `grep -rni "poki|crazygames"` matches only the excepted `portal/portalAdapter.ts` header comment. `git status` confirms only `client/src` + implementation artifacts changed — no server/shared source. The dev server on :5173 serves Eric's main checkout (not this worktree), so the manual playthrough check couldn't exercise this change; per the spec's fallback, the player-identical AC rests on construction (all no-ops / immediately-resolved promises) + the green full suite.

**Residual risks:** (1) the seam's five-method shape will likely need extension at Epic 7 (deferred entry records the specific extension points); (2) `matchStart` fires wherever the audio cue's live edge fires — a future mid-match-join/spectator feature would need its own gating (same property as the audio cue today); (3) the 35s ad-break cap is an autonomous ruling — tune when a real adapter lands.

**Autonomous rulings for Eric's review:** method signatures (`init`/`requestAdBreak` async, others void, `loadingProgress(fraction 0..1)`) mirroring Poki/CrazyGames shapes; interface file named `portalAdapter.ts` (epic named only `nullAdapter.ts`); safeAdapter wrapper as the structural home of the spec's "adapter misbehaves → game proceeds" row; 35s `requestAdBreak` timeout; `requestAdBreak` scoped to RETURN TO PORT only (disconnect path untouched); sprint-status story 0-4 marked done (epic-0 itself left `in-progress` — flipping it is the human call, retrospective optional).
