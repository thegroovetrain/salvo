---
title: 'Client frame-loop containment'
type: 'bugfix'
created: '2026-08-16'
status: 'in-review'
baseline_commit: 'cb4bdba369eca298e99f15e369d2da52d104f227'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/investigations/boon-cards-control-loss-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Players report the game "crashing" after picking certain boons, losing the ability to control their ship. The trigger is unidentified, but the *failure mode* is confirmed and is the real defect: `client/src/app/loop.ts` runs the per-frame callbacks with no error containment, and Pixi 8's ticker clears `_requestId` before calling `update()` and only re-requests the frame after it returns — so a single throw means **no frame is ever requested again**. Input sampling stops, the server keeps sailing the hull on its last engine order, and the picture freezes. A second defect at `client/src/net/roomBindings.ts:499-500` calls `onOwnStats` *before* advancing `net.you`, so any throw there re-fires on every subsequent frame forever while skipping reconcile, contacts and events. The server has story-0.3 tick containment; the client has none.

**Approach:** Contain the loop so a frame-path exception costs one frame instead of the session, and surface it — an optional error hook lets `main.ts` attach live game context, so the next real occurrence self-reports the trigger the investigation could not isolate. Reorder the frame handler so the mirror advances before the callback. Fail-open the three ungated catalog lookups that sit on the boon-pick render path.

## Boundaries & Constraints

**Always:**
- The accumulator must still drain on a throwing tick. Decrement BEFORE calling `simTick`.
- Logging must be bounded — a per-frame throw must not produce a per-frame log line.
- A caught error must never change simulation state or swallow information silently; it is logged, not ignored.
- Fail-open means render nothing / return a neutral value, never substitute a fabricated ship class or boon.

**Ask First:**
- Any change to prediction, reconciliation, or the 50ms step contract.
- Adding a global `window.onerror` handler (a broader decision than this fix).
- Any behavioral change beyond containment — this ships no gameplay change.

**Never:**
- Do not touch the Intel Range merge or the catalog defects — both are deferred (`deferred-work.md`, 2026-08-16) and the merge is fully ruled but out of scope here.
- Do not bump `PROTOCOL_VERSION` — this is client-only with no wire change.
- Do not catch-and-continue inside the `while` loop without moving the decrement first; that converts a crash into a tab-hanging infinite loop.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Throwing sim tick | `cb.simTick` throws once | Ticker survives; next frame renders; ship still responds to input | Caught; logged once |
| Persistently throwing tick | `cb.simTick` throws every frame | Loop advances, accumulator drains, no infinite loop, log stays bounded | Decrement precedes call; log rate-limited |
| Throwing render | `cb.render` throws | Sim keeps stepping; ticker stays alive | Caught; logged once |
| Throwing `onOwnStats` | `applyOwnStats` throws on a frame | `net.you` advances; does NOT re-fire next frame; reconcile/contacts/events still run | Predicate first, mirror second, call third |
| Unknown `you.cls` | skewed or malformed wire | Card renders empty rules text; no throw | `Object.hasOwn` fail-open |
| Unknown boon id in results | id absent from catalog | Row omitted; no throw | `Object.hasOwn` fail-open |
| Normal frame | nothing throws | Byte-identical behavior to today | N/A |

</frozen-after-approval>

## Code Map

- `client/src/app/loop.ts` -- the whole driver (36 lines); the unguarded `app.ticker.add` callback is the amplifier
- `client/src/net/roomBindings.ts:499-500` -- `onOwnStats` called before `net.you = f.you`; self-latching
- `client/src/main.ts:2396` -- the `onOwnStats` binding; the natural place to supply game context to the new error hook
- `client/src/ui/boonCopy.ts:276` -- `CONFIG.shipClasses[you.cls]` ungated, runs every frame while the refit band is open
- `client/src/ui/upgradeMenu.ts:250` -- same pattern in `ownMaxHp`
- `client/src/ui/results.ts:665` -- `BOON_CATALOG[id]` ungated
- `node_modules/pixi.js/lib/ticker/Ticker.mjs:123-128` -- reference only: why a throw is permanent

## Tasks & Acceptance

**Execution:**
- [x] `client/src/app/loop.ts` -- move `accumulator -= SIM_DT` above the `cb.simTick` call, then guard both `cb.simTick` and `cb.render` so a throw is caught, reported and survived; add an optional `onError(err, phase)` to `LoopCallbacks` -- decrementing first is what prevents a throwing tick spinning forever; the hook exists so the caller can attach context the loop cannot see
- [x] `client/src/app/loop.ts` -- rate-limit the fallback report (log each distinct error once, with a hard cap on distinct entries) using the house `console.error('[loop] …', err)` form -- an unbounded per-frame log is its own outage
- [x] `client/src/main.ts` -- implement `onError` at the `startLoop` call site, logging the phase plus own hull class and fitted boon ids -- this is the diagnostic that names the still-unidentified trigger on its next occurrence
- [x] `client/src/net/roomBindings.ts` -- evaluate `ownStatsChanged(f.you, net.you)` into a local, assign `net.you = f.you`, then call `deps.onOwnStats` -- verified safe: `applyOwnStats` takes `cls`/`boons` as arguments and never reads `state.net.you`
- [x] `client/src/ui/boonCopy.ts`, `client/src/ui/upgradeMenu.ts` -- `Object.hasOwn`-gate the lookups, failing open. NOTE: `client/src/ui/results.ts` ALREADY carried its guard (`if (def === undefined) continue`); the spec's claim came from a stale read of the main checkout, so no change was needed there
- [x] `client/src/__tests__/` -- coverage added in three files: `loopContainment.test.ts` (10), `frameOrdering.test.ts` (4, fail-proven against the old ordering), `refitFailOpen.test.ts` (6)
- [x] `VERSION`, root `package.json`, `package-lock.json` -- 0.17.90. NOTE: the spec said 0.17.88 → 0.17.89, but cycle 89 was already taken by Story 6-3 on origin/main, so this cycle is 90
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `# last_updated` comment + `last_updated:` key + ONE line at the end of the INTERSTITIAL CYCLE INDEX. No `development_status` entry
- [x] `_bmad-output/gds-workflow-status.yaml` -- `last_updated` updated; `next_expected` rewritten with cycle 90 at the head and the prior entry rotated verbatim into a new `superseded_next_expected_6`
- [x] `CLAUDE.md` -- corrected the stale `PROTOCOL_VERSION` figure 33 → 37. The number only

**Acceptance Criteria:**
- Given a client whose `simTick` throws on every frame, when the game runs for several seconds, then the ticker is still alive, rendering continues, the accumulator still drains, and the number of logged errors is bounded rather than one per frame. **This AC deliberately does NOT claim input keeps flowing** — input sampling lives inside `simTick`, so a throw upstream of it still costs the helm. Containment stops the SESSION dying; it cannot restore a code path the throw pre-empts. See the Spec Change Log.
- Given a client whose `render` throws once, when the next frame arrives, then rendering resumes and no simulation state was lost.
- Given a frame in which `onOwnStats` throws, when the following frame arrives, then it does not throw again for the same cause and `predictor.onServerState` runs normally.
- Given an `OwnShip` carrying a ship class or boon id absent from the catalog, when the refit band and results modal render, then neither throws and neither invents a substitute value.
- Given no exception anywhere, when the game runs, then behavior is byte-identical to before this change.
- Given `npm run check`, when run at completion, then lint, type-check and all tests pass with no skipped suites.

## Spec Change Log

### 2026-08-16 — review gate, iteration 1 (bad_spec: AC1 over-claimed)

**Triggering finding.** Both the blind hunter and the acceptance auditor independently found that AC1's clause *"the ship still responds to input"* is false for the dominant case. Input sampling lives INSIDE `simTick`; a throw upstream of it means no `InputMsg` is sent, so the helm stays dead whether or not the loop survives. The auditor graded it UNVERIFIABLE and noted no test could honestly pin it.

**What was amended.** AC1 now claims only what containment actually delivers — live ticker, continued rendering, drained accumulator, bounded logging — and states explicitly that input flow is NOT restored when the throw pre-empts sampling.

**Known-bad state avoided.** A future reader treating AC1 as discharged would conclude the reported symptom ("players lose the ability to control their ships") is FIXED. It is not. The cycle makes the failure survivable and observable; the trigger is still unidentified. Mis-reading this AC is the single most likely way that gets forgotten.

**Deviation from the loopback procedure, stated plainly.** step-04 prescribes revert-and-re-derive for `bad_spec`. That was NOT done here, deliberately: the amendment corrects a CLAIM ABOUT the code, not a requirement, so re-deriving would reproduce byte-identical code while discarding the review-gate fixes landed alongside it. No code changed as a consequence of this amendment.

**KEEP instructions (must survive any future re-derivation).**
- The whole body of `report()` stays inside try/catch, not just the hook call — it runs inside `guard`'s catch, so anything it throws re-arms the original bug from inside the containment. `reportKey` is fallible by nature (`String(err)`, `err.message`, even `instanceof` on a hostile Proxy).
- `applyOwnStats` must return BEFORE its first mutation on an unresolvable `cls`. Assigning `g.ownClass` and then throwing poisons it for the match, and `hullEnvelope` consumers then throw every render frame.
- The decrement-before-`simTick` ordering stays, but must NOT be re-described as preventing a hang — `guard` catches, so a trailing decrement would run. That claim was wrong and was corrected at this gate.
- `ownMaxHp` returns `null`, never a number, so an unknown hull can never be reported FULL.

## Design Notes

**Why the decrement must move.** Today the loop reads:

```ts
while (accumulator >= SIM_DT) { cb.simTick(SIM_DT); accumulator -= SIM_DT; }
```

A throw currently escapes the whole loop, so the ordering is harmless. The moment `cb.simTick` is wrapped in place, a throwing tick skips its own decrement and the condition never clears — a hung tab, strictly worse than the bug being fixed. Moving the decrement above the call is pure bookkeeping and safe.

**Why an error hook rather than logging in the loop.** `loop.ts` has no access to game state by design. The single most valuable thing to capture is the fitted boon list at the moment of the throw, which only `main.ts` holds. The hook keeps the layering intact and turns the next occurrence into the evidence the investigation could not obtain — the case file's Missing Evidence table lists a browser stack trace as the highest-value gap.

**Scope note.** This is the containment half of a two-goal investigation follow-up. The Intel Range merge is fully ruled by Eric and deferred intact to `deferred-work.md` (2026-08-16); nothing here blocks it, and landing this first means the merge's own cycle inherits a loop that reports rather than freezes.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests pass, no skips
- `npm test -w client` -- expected: the new containment cases pass
- `npm run build` -- expected: clean build in shared → client → server order

**Manual checks:**
- Temporarily throw from inside `simTick`, load the client, and confirm the ship still answers the helm and the console shows a bounded error count. Revert the deliberate throw before committing.
