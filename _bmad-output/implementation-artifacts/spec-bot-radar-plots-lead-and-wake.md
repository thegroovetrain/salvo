---
title: 'Bots lead radar plots: course from wake and paint-to-paint, dead-reckoned aim, sweep-miss drop, MG magazine discipline'
type: 'bugfix'
created: '2026-10-02'
status: 'in-progress'
baseline_revision: '433fd485'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Bots are terrible with the machine gun (and every lead solve) against anything they only have on radar. Measured (cycle-165 probe, one pinned MG bot vs a torpedo boat at 45 u/s, 60 s): 100 % hits when the target is in the sight bubble, **0 %** when it is radar-only at 500 u (moving), 66 % radar-only parked. Causes, all confirmed in code: (1) a radar paint carries no course or speed, so `leadPoint` aims at the raw paint, which is up to one sweep (~4 s) old; the aim is recomputed every tick but from a frozen plot. (2) Successive paints of a moving hull land ~190 u apart, far past `ANON_ASSOC_U` (54 u), so every paint opens a NEW anonymous track and the old ghost lingers 8 s; bots fired at the older ghost for 86–137 ticks per run ("firing at nothing"). (3) `foldEvent` drops every `wk` wake event (218–245 per run) — the course information Eric expects bots to read. (4) A direct MG shell expires at its aim point; scatter puts that point short of the hull often enough to cost 34 % of shells at 500 u on a parked target.

**Approach:** Give each radar plot an estimated velocity from what the bot is already sent — the wake's age gradient on first paint, paint-to-paint displacement after that — and aim every lead solve at the plot's dead-reckoned position. Associate new paints to the plot's predicted position so one hull stays one plot. Drop a plot when the bot's own beam sweeps its predicted spot and nothing paints. The MG holds its magazine on a course-less plot older than one sweep, and aims its stream one hull length past the target. Eric rulings 2026-10-02 (AskUserQuestion, this cycle): hold the MG only; drop on a clean sweep miss; course feeds every weapon; aim past the target.

## Boundaries & Constraints

**Always:**
- Everything comes from the bot's own fogged view plus self-reads a human client is also sent: `wk`/`blip`/`hc`/`sunk` events, live `Contact`s, and the hull's own `sweepAngle`/`prevSweepAngle` (a human gets `OwnShip.sweep` every frame). No port widening, no new perception, no wire change, PROTOCOL_VERSION stays 69.
- `ai/` imports nothing from `world.js` / `game/equipment/**`; `perception.js` type-only. Deterministic: no rng outside aim scatter, no clock reads (`now` is passed in).
- The gun keeps NO staleness rule (epic-6 amd 32c) — only the machine gun gains the hold rule, and only for a plot with no course AND a last paint older than one base sweep revolution (`TRACK_PERSIST_MS`, 4000 ms).
- Lead solves for torpedoes/broadside keep their persistence gates (`hasPersistence`) unchanged; they simply lead a dead-reckoned plot now.
- Complexity ≤ 10 per function; new logic lives in a new `ai/plot.ts` (utility.ts is already 652 LOC).
- Versioning: cycle 165 / 0.18.30 (PR #251 holds 164 / 0.18.29 and amendment 228); epic-8 amendments from 229; both trackers stamped one line each.

**Block If:**
- A velocity estimate would need anything not in the view (e.g. the wake's owner, a blip id) — HALT, do not widen.
- The sweep-miss drop would need the height-aware radar shadow — use island LOS (`lineBlocked`) as the conservative gate (LOS-clear ⇒ not radar-shadowed); if that proves false in testing, HALT.
- Any gun number, scatter, `reactionMs` or `decisionCadenceMs` would have to move to make the fix work — HALT (bot competence knobs are Eric's).

**Never:**
- Read `sp` splashes (deferred bracket-and-walk stays deferred). Touch the weapon rows, `machineGun.ts`, `perception.ts`, `frames.ts`, `signals.ts`. Add a seventh perception exception. Add in-game copy. Launch a batch sim (the probe-style test pin is the evidence).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Live sighting | track `live`, heading/speed disclosed | velocity = disclosed pose; lead as today | — |
| First paint + wake | anonymous paint this sweep; ≥ 3 `wk` cells within wake reach of it in the last sweep period, spanning ≥ 2 age buckets or ≥ 2 cells of extent | velocity: direction from oldest-bucket centroid toward the paint, speed = that distance ÷ that bucket's mean age; `vSrc: 'wake'` | speed above the plausible cap (1.5 × fastest hull max) → no estimate |
| Second paint | paint lands within `ANON_ASSOC_U` of a track's predicted position, ≥ 1000 ms after its last paint | associate; velocity = displacement ÷ Δt, `vSrc: 'paint'` (overrides wake) | — |
| Second paint, no velocity yet | exactly ONE course-less anonymous track within (fastest hull max × Δt + `ANON_ASSOC_U`) | associate to it and derive paint-to-paint velocity | ≥ 2 candidates → new track (ambiguous) |
| Sweep miss | non-live track not refreshed this tick; predicted position inside radar range, island LOS clear, bearing inside this tick's `[prevSweepAngle, sweepAngle)` window | track dropped | out of range / LOS blocked / not swept / refreshed this tick → kept |
| MG hold | target track has no velocity, not live, `now − seenAt > TRACK_PERSIST_MS` | `streamSolve` returns null (level released) | fresher paint or any velocity → stream as today |
| MG aim past | shot solves | `aimDist = min(dist(lead point) + hull length (target cls, else longest participant hull), rangeU)` | — |
| Hit Call on a moving plot | `hc` lands near a track with velocity | refreshes hits/seenAt as today; must NOT overwrite the paint baseline used for paint-to-paint velocity | — |
| Sunk / prune | as today | dropped; wake-cell buffer pruned past one sweep period | — |

</intent-contract>

## Code Map

- `server/src/game/ai/plot.ts` -- NEW: track kinematics — wake-cell buffer + fit, paint-to-paint velocity, predicted position, sweep-miss predicate.
- `server/src/game/ai/types.ts` -- `RememberedContact` gains `vx/vy` (nullable), `vAt`, `vSrc`, `paintX/paintY/paintAt`; `BotMind` gains `wakeCells`; `BotSelf` gains `sweepAngle`/`prevSweepAngle` self-reads.
- `server/src/game/ai/utility.ts` -- `foldView` routes `wk` to the wake buffer, `foldBlip` associates to predicted positions, sweep-miss pass after the fold; `freshness()` unchanged.
- `server/src/game/ai/tacticKit.ts` -- `leadPoint` leads the dead-reckoned plot using `trackVelocity`; `aimPoint` unchanged API.
- `server/src/game/ai/equipment.ts` -- `streamSolve`: hold rule + aim-past overshoot.
- `server/src/game/world.ts` -- nothing (BotTickEntry.self is the ShipRecord, which already carries both sweep angles).
- `server/src/__tests__/botPlot.test.ts` -- NEW: unit pins for the matrix above.
- `server/src/__tests__/botTactics.test.ts` -- fixture `track()` helper updated; "a return-grammar plot cannot be led" pin re-cut (it CAN be led once it has a course).
- `server/src/__tests__/botGunnery.test.ts` -- NEW: the probe scenarios as regression pins (radar-only orbit/straight at 500 u: MG hit rate ≥ 40 %; parked ≥ 90 %; sight 100 %; ghost ticks near zero).
- `_bmad-output/implementation-artifacts/epic-8-context-amendments.md`, `CHANGELOG.md`, `VERSION`, `package.json`, both trackers -- cycle record.

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/game/ai/types.ts` -- add the track velocity fields, paint baseline, wake buffer, sweep self-reads -- the one track shape.
- [ ] `server/src/game/ai/plot.ts` -- `foldWakeCells`, `fitWakeVelocity`, `paintVelocity`, `predictedPos`, `trackVelocity`, `sweptAndMissed` -- pure, exported, unit-tested.
- [ ] `server/src/game/ai/utility.ts` -- wire the fold (events → wake buffer → paints with predicted association → contacts → sweep-miss → prune) -- order is load-bearing.
- [ ] `server/src/game/ai/tacticKit.ts` -- `leadPoint` on `predictedPos` + `trackVelocity`.
- [ ] `server/src/game/ai/equipment.ts` -- MG hold + overshoot.
- [ ] tests (three files above); `npm run check` green; lint 0 errors.
- [ ] docs: amendments 229+, CHANGELOG 0.18.30, VERSION/package.json, trackers, this spec's result.

**Acceptance Criteria:**
- Given a pinned MG bot and a torpedo boat sailing at 45 u/s at 500 u radar-only, when 60 s run, then MG hit rate ≥ 40 % (was 0 %) and ticks aimed at a plot > 60 u from truth < 25 % (was 80–90 %).
- Given a parked target at 500 u radar-only, when 60 s run, then hit rate ≥ 90 % (was 66 %).
- Given a target in sight, hit rate stays 100 %.
- Given a plot whose predicted spot is swept clean (in range, LOS clear), when the tick folds, then the plot is gone; given the spot is behind an island or out of radar range, it stays.
- Given a course-less plot last painted > 4000 ms ago, when the MG tactic solves, then no stream; the cannon/flak still fire.
- Given the full gate, `npm run check` passes; PROTOCOL_VERSION unchanged (69).

## Spec Change Log

## Review Triage Log

## Design Notes

- Wake geometry: a hull's ribbon trails ~`speed × wakeLifeMs` (≈ 250 u at 45 u/s) behind it; age bucket `a` (0 young … 3 old, `WAKE_AGE_BUCKETS` = 4) is on the wire. Bucket mean age = `(a + 0.5) / 4 × wakeLifeMs`. Course = from old cells toward the hull; speed = baseline ÷ mean age. Wake reach for association = fastest hull max speed × wakeLifeMs / 1000 + slack.
- The beam paints the ribbon across several consecutive ticks (ribbon subtends ~30° at 500 u, beam moves 4.5°/tick), before or after the hull paint depending on sweep direction, so the fit re-runs each tick for tracks whose `vSrc !== 'sight'` while wake cells younger than one sweep period exist near them; cheap (≤ a few dozen cells per bot).
- Human parity for the sweep-miss: the human watches the sweep line pass and the blip not reappear. Radar-shadowed ⊂ island-LOS-blocked (shadow needs land on the ray; mast height only REDUCES what land blocks), so LOS-clear is a safe "it would have painted" test.
- Hit Calls keep refreshing `seenAt`/position as today but never touch `paintX/paintY/paintAt`, so paint-to-paint velocity stays a radar measurement.

## Verification

**Commands:**
- `npm test -w server` -- expected: all green incl. the three bot test files.
- `npm run lint` -- expected: 0 errors (complexity ≤ 10).
- `npm run check` -- expected: green; test counts recorded in the CHANGELOG.
