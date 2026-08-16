---
title: 'PvE Fleet Rebalance — softer hulls, richer payout, more groups, wider spread'
type: 'feature'
created: '2026-08-16'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 5.6's fleets are hard to FIND on the 2800u ocean (only 4 groups in wave one, even at Eric's max observed 7-player lobby), and their hull envelope is mistuned — TTK and payout do not line up with the attrition role amendment 45 gave them. Eric ruled a wholesale retune 2026-08-16.

**Approach:** Pure CONFIG retune plus one correctness fix. Halve the spawn unit (9 hulls → 6), double the wave counts (4/2/1 → 8/4/2) so there are twice as many groups to stumble into, soften hulls (45/60/75 hp, flat 1 damage), raise the payout tiers (¼/½/¾), and widen the per-group footprint (spreadU 400 → 500). No wire-shape change, no new mechanic.

## Boundaries & Constraints

**Always:**
- `CONFIG` is the single source of truth; every number below is a CONFIG edit, never an ad-hoc derivation. `effectiveStats()` stays the only path from envelope → derived stat.
- XP is DERIVED from `CONFIG.fleet.composition` × `CONFIG.xp.droneTierLevels` via `fleetLevels()`. **No level total may be hardcoded into CONFIG, types, or any test assertion** (Eric ruling 2026-08-16). The old `expect(fleetLevels()).toBe(3)` pin is replaced by a pin on the *tiers being exact binary fractions*, which is the invariant that actually still bites.
- `fleet` in code means the **6-hull spawn unit** (Eric ruling). Eric's conversational "12-hull fleet worth 5 XP" is a derivation path, not a code concept — it must not appear as a constant.
- Drone `kinematics`, `hull` dims, `aimScatterU`, `memoryMs`, `spawnRetryTicks` are UNCHANGED. Speeds were ruled in amendment 34 and are not reopened.
- A fleet hull may never be placed outside the live storm ring.

**Block If:**
- `npm run check` cannot be made green without changing behavior beyond this spec.
- Any change here would require a `PROTOCOL_VERSION` bump (see Design Notes — the expectation is NO bump; if the audit contradicts that, HALT and surface it rather than bumping silently).
- The per-tick server cost measurement lands materially above the ~3.3ms/tick projection against the 50ms budget.

**Never:**
- Do NOT model a 12-hull "fleet" as two paired half-groups. Eric ruled 8 fully independent anchors; `pickFleetAnchor`'s existing max-min score already spreads them.
- Do NOT touch the witness rule (`propagateWitnesses` stays a GLOBAL LOS sweep — epic-5 amendment 35 explicitly warns reviewers off "fixing" it to be per-fleet).
- Do NOT reintroduce per-size drone gun damage. It is flat 1 across all three sizes.
- Do NOT change captain-facing combat values (`CONFIG.gun`, ship classes, boons, zone).
- Do NOT rename `fleet` → `squadron` (offered and declined).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Solo clear, small hull | Captain, base gun (15 dmg / 5000ms), one small hull (45hp) | 3 shots, 15s; hull answers 3× for 3 damage total; ¼ level paid | n/a |
| Solo clear, medium hull | as above vs 60hp | 4 shots, 20s; 4 damage taken; ½ level paid | n/a |
| Solo clear, large hull | as above vs 75hp | 5 shots, 25s; 5 damage taken; ¾ level paid | n/a |
| Exchange rate holds | any size | repair cost (damage/50 levels) < levels earned, every size | guardrail test fails build |
| Full-group aggro | all 6 hulls of one group firing | 6 damage/volley, 1.2 dps; lightest hull (125hp TB) survives ~104s | n/a |
| Wave schedule | zone clock 1:00 / 5:00 / 9:00 | 8 / 4 / 2 groups enqueued; 48 / 24 / 12 hulls | slow tick must not skip a beat (existing `while`) |
| Late-wave placement | live ring small enough that `ring.r - spreadU` < `0.35 × ring.r` | every hull still lands INSIDE the live ring | offset rejected and re-rolled; falls back to the anchor (ring-clear by construction) |
| Degraded anchor | every candidate inside a captain's intel disc, retries exhausted | max-min fallback anchor + `logWarn('fleet.spawnFallback')`, wave still arrives | logged, never silent |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.drones` (hp, gun.damage), `CONFIG.xp.droneTierLevels`, `CONFIG.fleet` (composition, waves, spreadU); `fleetLevels()` / `fleetHullIds()` derivations. THE change surface.
- `server/src/game/world.ts` -- `spawnFleetWaves` / `enqueueDueWaves` / `placePendingFleets` / `fleetAnchor` / `spawnFleet` / `fleetOffset` (~:2496-2650); `FLEET_ANCHOR_MIN_FRACTION` (:150). Ring-containment fix lands in `fleetOffset`.
- `server/src/game/drones.ts` -- `FleetController`; no hull-count logic, comments only ("the nine travel together").
- `shared/src/__tests__/barrel.test.ts` -- `CONFIG.fleet` block pin + the exact-XP identity (:408-433). Largest test edit.
- `shared/src/__tests__/shipClasses.test.ts` -- drone identity table (hp/gun) + the full-volley attrition pin (:180-198).
- `shared/src/__tests__/damageGuardrail.test.ts` -- the exchange-rate guardrail (:259-295). Should PASS unchanged; comments need the new arithmetic.
- `server/src/__tests__/drones.test.ts` -- wave counts and per-fleet hull counts.
- `_bmad-output/implementation-artifacts/epic-6-context-amendments.md` -- Amendment 24 (durable ruling record).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` + `_bmad-output/gds-workflow-status.yaml` -- both trackers, same PR.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- set drone hp 60/75/90 → **45/60/75** and gun damage 1/2/3 → **1/1/1** -- Eric's TTK ruling; flat damage makes 3/4/5 return damage fall out of TTK rather than needing its own table.
- [ ] `shared/src/constants.ts` -- set `xp.droneTierLevels` to `{droneSmall: 0.25, droneMedium: 0.5, droneLarge: 0.75}` -- raises the payout; also makes all three tiers exact binary fractions, retiring the ⅓ float-dust hazard amendment 33 guarded against.
- [ ] `shared/src/constants.ts` -- set `fleet.composition` to `{large: 1, medium: 2, small: 3}` and `fleet.waves` fleets to **8 / 4 / 2** -- the 6-hull spawn unit and doubled group counts.
- [ ] `shared/src/constants.ts` -- set `fleet.spreadU` **400 → 500** -- Eric's footprint ruling.
- [ ] `shared/src/constants.ts` -- rewrite the `CONFIG.drones` and `CONFIG.fleet` docblocks -- they currently assert the OLD arithmetic ("2 large + 3 medium + 4 small = exactly 3.000 levels", "4 captain gun hits", "the spread is 400u") in prose. Stale rationale is worse than none. State XP as DERIVED, never as a literal.
- [ ] `server/src/game/world.ts` -- add a live-ring containment test to `fleetOffset`'s reject loop, beside the existing island and intel-disc tests -- at spreadU 500 the `FLEET_ANCHOR_MIN_FRACTION` floor no longer keeps scatter inside the ring by arithmetic (231 + 500 = 731 > 660 at the terminal ring). Makes the "never spawn in the storm" guarantee explicit rather than a coincidence of two constants.
- [ ] `server/src/game/world.ts` -- update `spawnFleet` / `fleetAnchor` / `FLEET_ANCHOR_MIN_FRACTION` comments for the 6-hull unit and the new containment rule.
- [ ] `server/src/game/drones.ts` -- comment-only: "all nine hulls" → the 6-hull group.
- [ ] `shared/src/__tests__/barrel.test.ts` -- replace the `fleetLevels() === 3` literal pin with (a) composition/waves/tier value pins and (b) an EXACTNESS pin asserting `fleetLevels()` carries no float dust -- honors "no hardcoded XP in the contract" while keeping a guardrail that can still fail.
- [ ] `shared/src/__tests__/shipClasses.test.ts` -- update the drone identity table to the new hp/gun values; restate the full-volley pin as the attrition PROPERTY (lightest hull survives well past a minute) rather than the magic literals 16/39.
- [ ] `shared/src/__tests__/damageGuardrail.test.ts` -- verify it passes unchanged; update the derivation comment to the new numbers and confirm the "old 6/8/10 still fails" counter-pin is still non-vacuous at the new hp.
- [ ] `server/src/__tests__/drones.test.ts` -- update wave-count and hulls-per-fleet expectations.
- [ ] `server/src/__tests__/` -- add a regression test that no fleet hull is ever placed outside the live ring, driven at a ring radius small enough to exercise the `FLEET_ANCHOR_MIN_FRACTION` floor.
- [ ] `VERSION` + `package.json` -- 0.17.93 → **0.17.94**.
- [ ] `_bmad-output/implementation-artifacts/epic-6-context-amendments.md` -- append Amendment 24 recording all four Eric rulings, the derivations, the named consequences, and the ring-containment correction.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` + `_bmad-output/gds-workflow-status.yaml` -- one-line cycle stamp each. Both files, this PR, no narrative.

**Acceptance Criteria:**
- Given the base gun (15 dmg, 5000ms) and a small/medium/large fleet hull, when a captain duels it solo, then it sinks in exactly 3/4/5 shots (15/20/25s) and deals exactly 3/4/5 damage back.
- Given any fleet size, when the exchange rate is computed, then levels-to-repair (damage ÷ 50) is strictly less than levels earned.
- Given `CONFIG.fleet.composition` and `CONFIG.xp.droneTierLevels`, when `fleetLevels()` is evaluated, then the result is exact (no IEEE754 dust) and NO test asserts a hardcoded level total.
- Given the zone clock reaching 1:00 / 5:00 / 9:00, when waves fire, then 8 / 4 / 2 groups of 6 hulls each are enqueued (84 hulls, 35 levels across the match).
- Given a live ring small enough that `ring.r − spreadU < 0.35 × ring.r`, when a fleet is placed, then every hull's final position is inside the live ring.
- Given a stale client bundle, when it joins, then nothing it renders or computes depends on any changed value — `PROTOCOL_VERSION` stays 39.
- Given `npm run check`, when run, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why flat 1 damage.** Eric specified "3/4/5 damage to the attacker" over the TTK window. Because the drone reload (5000ms) equals the captain gun reload, volleys-back == shots-to-kill == 3/4/5 for the three sizes. So the return-damage spec is satisfied by damage 1 on every size — a per-size table would double-count the size scaling that HP already provides.

**The exactness pin is what survives, not the total.** Amendment 33 pinned `fleetLevels() === 3` because ⅓ was in the tier table and a composition edit could start paying float dust. With tiers at ¼/½/¾ every tier is a dyadic rational, so *any* integer composition is exact — the old pin becomes vacuous. The invariant moves up a level: assert the TIERS are exact, and that `fleetLevels()` carries no dust. This is also exactly what Eric asked for ("no need to hardcode any amount of XP into the contract").

**Named consequences, ledgered rather than mitigated:**
1. *The faucet grows 21 → 35 levels* (confirmed by Eric). That is ~1.8× the 19 levels of captain kills a full 20-player lobby offers. It is contested and costs ~1.8 min/group to collect; `pveKillsByClass` telemetry (amendment 44) is the evidence that will show what is actually realized.
2. *Per-group threat drops further.* A 6-hull group volleys 6 damage (1.2 dps) vs today's 9-hull 16 damage (3.2 dps) — a TB survives ~104s under full group aggro, up from 39s. Amendment 45 already answered the "reads as no threat" objection structurally ("the fleets stick together... the players fighting over them amplify that"), but that argument was made about a 9-hull group.
3. *Groups sit CLOSER together on average.* `pickFleetAnchor` maximizes distance from everything afloat, so 8 anchors on the same ocean are necessarily nearer each other than 4 were. Two groups drifting into mutual LOS produces one larger fight — amendment 35 explicitly rules that is the witness rule working, not failing.
4. *Server cost.* Hulls afloat 63 → 84 (+33%); pro-rating amendment 33's figures gives ≈3.3ms/tick against a 50ms budget. Client radar load per group DROPS (6 hulls in range, not 9), so the client is strictly safer than the shipped measurement.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), all three workspaces type-check, full suite green.
- `npm test -w shared` -- expected: barrel / shipClasses / damageGuardrail pins green against the new values.
- `npm test -w server` -- expected: drones + world suites green, including the new ring-containment regression.

**Manual checks:**
- Confirm no changed value is read anywhere in `client/src` (audit gate for holding `PROTOCOL_VERSION` at 39).
- Confirm `grep -rn "2 large\|3.000 levels\|nine hulls\|four captain gun hits"` over `shared/` and `server/` returns nothing stale.

## Auto Run Result

Status: done — landed as interstitial cycle 94 (0.17.94), epic-6 amendment 24.

**Rulings taken mid-run** (the invocation changed after the question gate; all four answered by Eric):
1. Spawn unit halves to 6 hulls (1L/2M/3S), waves double to 8/4/2 groups.
2. `spreadU` 400 -> 500.
3. Halves are FULLY INDEPENDENT anchors — no pairing; `pickFleetAnchor` already spreads them.
4. 35-level faucet confirmed as specified.
5. `fleet` stays the 6-hull unit; NO hardcoded XP total in the contract.
6. (Follow-up) The base mine one-shotting a 45hp small drone is a RATIFIED FEATURE, not an accepted
   cost — the Mine Layer fleet-farm. Amendment 36 clause 3 (mines do not aggro) untouched.

**Orchestrator correction, Eric has veto:** ring containment was an arithmetic coincidence between
`spreadU` and `FLEET_ANCHOR_MIN_FRACTION`; raising spreadU to 500 would have allowed a hull 731u from
centre against a 660u terminal ring. `fleetOffset` now tests live-ring containment per hull, with a
regression test that drives the smallest ring the timeline ever has.

**Verification:** `npm run check` green — 4,645 tests (745 shared / 1,236 server / 2,664 client),
lint 0 errors (2 pre-existing `max-lines-per-function` warnings in untouched client files).
`PROTOCOL_VERSION` held at 39, confirmed by a client-consumption audit.

**Not done / surfaced instead of actioned:** `WelcomeMsg.config` ships the whole of `CONFIG` on every
handshake and the client never reads it — dead wire weight. Out of scope for a balance cycle; raised
for Eric rather than filed or fixed.
