---
status: ready-for-dev
story: 5-1
epic: 5
warnings: []
---

# Spec — Story 5.1: Lifecycle State Machine & STEP_ORDER Registry

<intent-contract>
Ship life-and-death becomes an explicit state machine in `shared/`, `world.step()`'s tick order
becomes data, and the win predicate collapses to one predicate over lifecycle states — with all
existing simulation behavior preserved, save one deliberate behavior change ruled by Eric:
drones stop gating the win.
</intent-contract>

## Governing rulings

**`_bmad-output/implementation-artifacts/epic-5-context-amendments.md` (amendments 1-7) is binding.**
On any conflict between this spec and that file, the amendment wins. Summary:

1. `sinking` is DECLARED-ONLY — sim keeps `alive → sunk` instantaneous; entered only by tests.
2. `ShipRecord.alive` is REPLACED, not shadowed — no compatibility getter.
3. Transition table: `heal` (`sinking → alive`, reserved) and `redeploy` (`any → alive`) are separate
   named edges. AR9's list is incomplete; build from amendment 3.
4. Drones stop gating the win. Three dev harnesses are rewritten. Story 6-5 owes a solo-termination rule.
5. STEP_ORDER covers sim steps only — clock advance, the `aliveHulls()` snapshot and the event swap
   stay fixed prologue/epilogue.
6. An order-identity test pins the exact tick order.
7. No wire change. PROTOCOL_VERSION stays 33.

## Acceptance criteria

**Given** the current `ShipRecord.alive: boolean`
**When** `shared/src/sim/lifecycle.ts` lands
**Then** lifecycle is the discriminated union `alive | sinking(since) | sunk(at)`, every transition is
validated in exactly one place, and `sinking → alive` is a legal reserved edge covered by a transition test.

**And** `world.step()` iterates a named `STEP_ORDER` array of sim steps, pinned by an order-identity test.

**And** `Match.checkWin()` is one predicate over lifecycle states, counting captains only.

**And** `npm run check` passes (lint + type-check + all tests), with `goldenFrames.test.ts` — the
byte-identity frame snapshot across all 11 event kinds — green and unmodified.

**And** PROTOCOL_VERSION is unchanged at 33 and no wire type in `shared/src/types.ts` moves.

## Task board

| # | Task | Files owned | Model | Depends on |
|---|---|---|---|---|
| T1 | `lifecycle.ts` + transition tests | `shared/src/sim/lifecycle.ts`, `shared/src/index.ts`, new shared test | Opus | — |
| T2 | Atomic `.alive` → lifecycle migration (44 non-test sites + affected tests) | `server/src/**`, affected `__tests__` | Opus | T1 |
| T3 | STEP_ORDER extraction + order-identity test | `server/src/game/world.ts`, new test | Fable | T2 |
| T4 | Win predicate over lifecycle + drop drone gate + rewrite 3 harnesses | `server/src/game/match.ts`, `server/scripts/{dronesSmoke,metricsSmoke}.mjs`, `drones.test.ts` | Opus | T2 |
| T5 | Adversarial review gate + Codex cross-model check | — | Fable + Codex | T3, T4 |
| T6 | VERSION 0.17.76, trackers, spec status | `VERSION`, `package.json`, both tracker yamls | Sonnet | T5 |

**Why this is sequential, not fanned out:** removing `ShipRecord.alive` red-builds every consumer at
once, so there is no disjoint file-ownership seam. T2 is deliberately one large coherent agent rather
than four parallel agents that could not independently type-check.

## Preservation constraints (a violation here is a defect, not a judgment call)

- **Exactly one `sunk` event per hull per life.** `sinkShip`'s guard is the sole idempotency lock.
- **`tickRepairs` stays last among hp movers** — "damage wins the tie by construction, with no explicit
  tie-break code." Regen must never un-sink a hull at 0 hp.
- **The `aliveHulls()` snapshot stays deliberately stale**, with per-victim re-checks preserved at
  `world.ts:2148, 2274, 2318, 2357`.
- **`sampleWakes` after `resolveCollisions`**; **`processRespawns` before `tickXp`**; **`creepMines`
  before `stepMines`**.
- **`advanceSweeps` keeps NO liveness gate** — a wreck still observes.
- **`spectates()` (`frames.ts:102`) keeps its exact current meaning.**
- **The `sunk` signal row's three-clause gate and its `bty` pre-mutation read are untouched.**
- **`ShipRecord.kills` still counts drones; `captainKills` still drives the throne alone.**
