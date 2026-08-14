---
title: 'Sudden Death — the final collapse'
type: 'feature'
created: '2026-08-14'
status: 'in-review'
baseline_revision: '3ff8004f47e14e7fa1556989907f6652c67c2faf'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** At 12:00 the ring reaches its terminal 660u radius and holds there forever (epic-3 amendment 24: the no-stalemate bar is GEOMETRIC — no post-closure shrink, no forcing mechanic). Nothing structurally ends the match; the batch-sim pacifist control's `unresolved` tick-cap outcome is documented as a *structural* result, and the endgame p50 already runs to 15:26. Eric has now issued the ruling that authorizes the long-parked SUDDEN DEATH contingency (`deferred-work.md:362`, his own words on 2026-08-04: *"sudden death at 15 minutes that fully closes the ring in until it is all storm at 16 minutes… but not today!"*) — today is that day, plus a new clause: the collapse point is MARKED at 14:00.

**Approach:** Append a FOURTH ring group to the existing four-beat timeline. Its beats land exactly on Eric's clock: 12:00–13:00 clear, 13:00–14:00 supply, **14:00 reveal — the collapse point is marked with an X**, **15:00–16:00 closing — the terminal ring shrinks CONCENTRICALLY to radius 0**. At 16:00 the map is 100% storm and every hull afloat takes `stormDps` until one is left. The collapse ring is **concentric with the terminal ring** (Eric: *"find the center of the final ring… close in on itself"*), so it carries NO new information: both sides synthesize it from the ring the client already holds, and nothing new travels on the wire.

## Boundaries & Constraints

**Always:**
- The collapse ring is **concentric** with the terminal ring and its radius is **exactly 0**. It is never rolled on the server-private ring stream and consumes no seed — its center IS the terminal ring's center.
- ONE derivation, both sides: `zoneLiveState()` in `shared/src/sim/zone.ts` synthesizes the collapse ring; the server's `zoneStateAt()` path must produce byte-identical geometry. No forked interpolation.
- `zoneTerminalRadius()` keeps meaning the **660u endgame ring** (`terminalSightFactor × CONFIG.vision.sight`). Story 3.4's constraint pins (radar = 2×sight, radar ≥ terminal radius, sight < terminal radius) must survive UNCHANGED.
- The `zoneNextR === 0` unrevealed sentinel on the wire is UNCHANGED. The collapse ring is transmitted as the sentinel and re-synthesized client-side — a legal radius-0 ring must never depend on the wire to be distinguished from "unrevealed".
- `CONFIG.zone.stormDps` is untouched (4 hp/s, every phase, `applyStorm` reads CONFIG directly).
- The whole feature is gated by one CONFIG flag; with it off, every existing behavior (3 groups, 12:00 closure) is byte-identical.

**Block If:**
- Making the collapse ring's center an independently rolled offset point rather than the terminal ring's own center would change the ruling's meaning — do not.
- Any change to `stormDps`, a post-closure damage ramp, or new player-facing copy (e.g. a "SUDDEN DEATH" register) — Eric ruled the geometry, not the damage curve or the copy. HALT rather than invent either.

**Never:**
- Never bypass `zoneRingRadii`'s 1u floor for the *geometric* terminal — that floor protects the sentinel and stays exactly as it is; the collapse ring is appended AFTER the clamp chain, not produced by it.
- Never change the chrome-bar ring-readout grammar (`RING CLOSES IN` / `RING CLOSING` / `RING CLOSED`). It is generic over group count and already reads correctly.
- No offset roll, no new schema field, no new perception exception. This is geometry, not disclosure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Collapse reveal | `suddenDeath: true`, t = 14:00 exactly | `phase: 'reveal'`, `groupIndex: 3`, `next = {cx, cy, r: 0}` concentric with `current`; client draws the X mark with one motion-gated reveal flash | No error expected |
| Mid-collapse | t = 15:30 | live ring `r ≈ 330` at the SAME center (no center drift); `closesInMs ≈ 30_000`; readout `RING CLOSING 0:30` | No error expected |
| Full collapse | t ≥ 16:00 | `phase: 'closed'`, live ring `r === 0`; `isOutside()` true for EVERY hull; storm plane fills the whole map; X mark persists; readout `RING CLOSED` | No error expected |
| Wire sentinel | client schema `zoneNextR === 0` during final group | client synthesizes the concentric collapse ring — identical to the server's | Falls back to holding ring g only if the group is NOT the final group |
| Closed-state schema | `zoneState: 'closed'`, `zoneCurR: 0` | client renders a fully-stormed map | Must NOT fall back to `mapRadius` (the current `||` fallback would invert the display) |
| Feature off | `suddenDeath: false` / absent (every existing `zoneOverride` + smoke literal) | 3 groups, 12:00 closure, terminal 660u held forever — byte-identical to today | No error expected |
| Degenerate | `beatMs` 0/NaN with `suddenDeath: true` | closed immediately on a radius-0 ring (fail-closed, never open forever) | Existing fail-closed paths |

</intent-contract>

## Code Map

- `shared/src/sim/zone.ts` -- THE timeline. `zoneGroups`, `zoneRingRadii`, `rollZoneRings`, `zoneLiveState`/`zoneStateAt`, `closedState`, `isOutside`.
- `shared/src/constants.ts:913-921` -- `CONFIG.zone`; gains the flag.
- `shared/src/index.ts:318` -- `PROTOCOL_VERSION` (34) + its ledger comments.
- `server/src/game/world.ts:901-969` -- `startZone` (rolls rings, seed count = `zoneGroups`), `zoneTimelineState`, `zonePhase`/`zoneLiveRing`/`zoneCurrentRing`/`zoneRevealedNextRing` getters; `applyStorm` at :2101.
- `server/src/rooms/ArenaRoom.ts:837-857` -- `syncZone`/`syncZoneGeometry`; `ZERO_RING` sentinel at :64.
- `client/src/sim/zoneView.ts:35-61` -- schema decode (`cur.r = s.zoneCurR || mapRadius` at :36 is a defect at r=0) + the client `zoneLiveState` call.
- `client/src/render/zone.ts` -- `planeVisibility` (:358-365), `drawStorm` (:450), `dashedCircle` (:368), `updateTarget` (:487), `update` (:518-531), `RevealOneShot` (:206).
- `client/src/config.ts:1050-1210` -- `CLIENT_CONFIG.zone`.
- `server/scripts/batchsim/pilots.ts:547` -- endgame pilot gate `zonePhase === 'closed'` (would slide to 16:00 and destroy the instrument).
- Test pins: `shared/src/__tests__/zone.test.ts` (:40-58 group/closure/radii, :234-248 closing rate, :259 last ring, :459-470 the anti-sentinel floor), `client/src/__tests__/zone.test.ts` (:242-273 plane matrix, :623 3-group fixture), `server/src/__tests__/zone.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/zone.ts` -- add `suddenDeath?: boolean` to `ZoneTimeline`; `zoneGroups()` returns `ringSteps.length + 1 + (suddenDeath ? 1 : 0)`; `zoneRingRadii()` appends an exact `0` AFTER the existing clamp chain when enabled (the 1u geometric-terminal floor is untouched); `rollZoneRings()` appends the last ring CONCENTRIC with the previous one (no angle/distance draw, consumes no seed) when enabled -- the timeline gains its collapse group.
- [x] `shared/src/sim/zone.ts` -- add a private `collapseRingOf(ring)` helper; in `zoneLiveState()` treat `next` as `next ?? collapseRingOf(current)` when `suddenDeath` and the active group is the LAST group, and make `closedState()` collapse its terminal ring to radius 0 under the same flag -- so a schema-fed client (which reads r=0 as "unrevealed") derives geometry identical to the server's, with no wire change.
- [x] `shared/src/sim/zone.ts` -- `isOutside()` returns `true` for every point when `!(r > 0)` -- a ring with no radius contains nothing; also makes NaN fail-closed. Update the doc comment (the boundary-inclusive rule is otherwise unchanged).
- [x] `shared/src/constants.ts` -- add `suddenDeath: true` to `CONFIG.zone` with the derivation comment (the four beats map to Eric's 12/14/15/16 clock; the collapse is concentric and carries no roll).
- [x] `shared/src/index.ts` -- `PROTOCOL_VERSION` 34 -> 35 with a ledger entry: `CONFIG.zone` gains a field and ships in `WelcomeMsg.config`, and the timeline's group count/length changes, so a stale client would derive the wrong rhythm.
- [x] `client/src/sim/zoneView.ts` -- replace `s.zoneCurR || mapRadius` with an idle-gated fallback (use `mapRadius` only when the zone is `idle`/unanchored; otherwise take `zoneCurR` verbatim) -- a genuinely collapsed ring must not render as the full map.
- [x] `client/src/render/zone.ts` -- `planeVisibility()` keeps the storm plane visible once anchored regardless of `cur.r` (drop the `cur.r > 0` requirement) and returns a new `mark` flag for a ring at radius ~0; guard `drawStorm()` so a radius-0 ring skips the `cut()`/`stroke()` and fills the whole plane.
- [x] `client/src/render/zone.ts` -- add a `mark: Graphics` beside `target`, a `drawPointMark()` sibling of `dashedCircle()` (an X of two screen-locked diagonal arms in `stormReadout`, alpha `telegraphAlpha`), an `updateMark()` sibling of `updateTarget()`, and route `f.next` (or `f.cur` once closed) to it from `update()`; the mark must claim the SAME `RevealOneShot` flash as a dashed telegraph does.
- [x] `client/src/config.ts` -- add `markPx` (arm stroke width) and `markArmPx` (arm half-length) to `CLIENT_CONFIG.zone`, both screen-locked through `strokeWorldWidth`-style zoom compensation.
- [x] `server/src/game/world.ts` -- expose the endgame-ring-reached fact (a `zoneEndgameReached` getter over `zoneTimelineState()`, true from `phase === 'closed'` OR the final collapse group being live) -- the harness needs it and it must not be re-derived ad hoc.
- [x] `server/scripts/batchsim/pilots.ts` -- re-gate the endgame pilot's hunt switch from `w.zonePhase === 'closed'` to the new endgame-reached fact -- otherwise the instrument stays pacifist until 16:00 and stops measuring the endgame it was built for (epic-3 amendment 23).
- [x] `shared/src/__tests__/zone.test.ts` -- update the group/closure pins (4 groups, `zoneClosedAtMs === 960_000`), the radii-length/equal-ratio chain (the ratio pin now covers the GEOMETRIC prefix only), the last-ring assertion (the endgame 660u ring is now second-to-last), and RE-DERIVE the anti-sentinel test as "the geometric terminal is still floored at 1u; the appended collapse ring is the one legal radius-0 ring and never travels as a revealed ring".
- [x] `shared/src/__tests__/zone.test.ts` -- add collapse coverage: beat-exact phases at 12:00/13:00/14:00/15:00/16:00; concentric center (zero drift across the close); radius interpolation 660 -> 0; `isOutside` true everywhere at closure; the wire-parity property (`zoneLiveState` with `next = null` in the final group === `zoneStateAt` with the full ring set, at every quarter-beat); containment; the collapse step's worst-case escape (660u, concentric) against the battleship-minute; and `suddenDeath: false` reproducing today's timeline exactly.
- [x] `client/src/__tests__/zone.test.ts` + `client/src/__tests__/zoneView.test.ts` (wherever the guard suite lives) -- retire the "degenerate r=0 sentinel draws nothing" case in favour of "a collapsed ring draws a full-map storm plane plus the X mark", and add the closed-state decode (`zoneCurR: 0` must not fall back to `mapRadius`).
- [x] `server/src/__tests__/zone.test.ts` -- add a compressed-timeline case that runs the final group end to end and asserts storm damage bites EVERY afloat hull after full collapse.
- [x] `server/scripts/zoneSmoke.mjs` -- exercise the collapse group over a real socket on a compressed override (reveal gating, concentric center, r=0 at closure).
- [x] Docs + trackers -- `CLAUDE.md` (phased-storm and Endgame Guarantee bullets), `epic-3-context-amendments.md` (the new dated Eric ruling superseding amendment 24), `deferred-work.md` (mark the SUDDEN DEATH entry RESOLVED and open a ledger row for the ~15:00 covenant now being provably ~17:00 worst case, routed to the 7-5 doc batch), `sprint-status.yaml` AND `gds-workflow-status.yaml` (both, same PR), `VERSION` -> 0.17.81.

**Acceptance Criteria:**
- Given the shipped CONFIG, when the match clock reaches 14:00, then the collapse point is marked on the water at the terminal ring's exact center with a one-shot reveal flash, and the mark persists through closure.
- Given the match clock is between 15:00 and 16:00, when the ring closes, then its radius interpolates linearly 660u -> 0 with its center held FIXED (concentric collapse, no drift), and the chrome bar reads `RING CLOSING m:ss`.
- Given the match clock reaches 16:00, when any hull is afloat anywhere on the map, then it is outside the ring and takes `stormDps`, the storm fill covers the entire map, and the chrome bar reads `RING CLOSED`.
- Given a full-HP battleship (175 hp, the game's maximum) alone in a fully collapsed storm, when no heal is banked, then it sinks within 45s of 16:00 — the match cannot outlive ~17:00 even in the worst case, because the passive XP tick funds at most ~0.83 hp/s of heal against 4 hp/s of storm.
- Given a client fed only by the room schema (`zoneNextR === 0` during the final group), when it derives the live ring, then its geometry equals the server's authoritative ring at every tick — no desync, and `PROTOCOL_VERSION` is the only wire-facing change.
- Given `suddenDeath` is disabled (every existing `zoneOverride` and smoke literal), when the timeline runs, then it is byte-identical to today: 3 groups, closure at 12:00, terminal ring held.
- Given the batch-sim endgame campaign is rerun, when the pacifist control reaches the collapse, then matches that previously ended `unresolved` at the tick cap now RESOLVE — the structural non-conclusion documented under amendment 24 is eliminated.

## Design Notes

**Why a fourth group and not a bespoke phase.** Eric's clock (mark 14:00, close 15:00, all-storm 16:00) lands exactly on the existing four-beat rhythm offset by 12:00: clear / supply / **reveal = the mark** / **closing = the collapse**. Reusing the rhythm means `closesInMs`, the chrome-bar readout, the reveal one-shot, phase naming, seed derivation, the harness tick cap and `pastClosureRate` all come out right with no special-casing.

**Why concentric.** *"Find the center of the final ring… close in on itself entirely."* The collapse target is the terminal ring's own center, so the mark is pure legibility rather than new information — which is why this ships with **no new schema field**: the client already holds that center. Worst-case escape is 660u (rim to center) ≈ 31% of a battleship-minute, against the ratified ~80% closing-rate criterion, and the mark gives a full minute of warning before the close even starts.

**The sentinel, precisely.** `zoneNextR === 0` means "unrevealed" on the wire and that does not change. The server mirrors the collapse ring as the zero sentinel; the client re-synthesizes it because in the FINAL group there is only one thing `next` can be. Server and client therefore compute identical geometry from different inputs — the `effectiveStats()` firewall pattern applied to the zone.

```ts
const collapseRingOf = (ring: ZoneRing): ZoneRing => ({ cx: ring.cx, cy: ring.cy, r: 0 });
// in zoneLiveState, before the `next === null` fail-closed branch:
const finalGroup = collapses(cfg) && group === groups - 1;
const eff = next ?? (finalGroup ? collapseRingOf(current) : null);
```

**Two traps that silently break this.** (1) `client/src/render/zone.ts:363` currently requires `cur.r > 0` for the storm plane to exist at all — at r=0 the entire storm would vanish from screen at the exact moment the whole map became storm, the worst possible inversion. (2) `client/src/sim/zoneView.ts:36` uses `|| mapRadius`, so a genuine r=0 decodes as a FULL-MAP safe ring. Both are pre-existing guards written when radius 0 could only mean "no data"; both must be re-derived, not deleted blindly.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), type-check clean across shared/server/client, all tests green (4309 baseline + the new zone cases).
- `npm test -w shared -- zone` -- expected: the rewritten group/closure/radii pins and the new collapse suite pass; the Story 3.4 constraint block passes UNCHANGED.
- `node server/scripts/zoneSmoke.mjs` (with `HC_DEV_OPTIONS=1`) -- expected: the four-beat order runs for every group including the collapse group, and the final ring reads r=0 over a real socket.
- `node server/scripts/batchsim/run.mjs` endgame leg -- expected: matches resolve past the collapse; report `unresolved` count drops to 0. Record the numbers in a dated `batch-sim-evidence-2026-08-14.md`.

**Manual checks (if no CLI):**
- On the built client with a compressed `zoneOverride`: the X appears at the reveal beat, the ring shrinks onto it without center drift, and at closure the whole map is stormed with the mark still visible and the vignette lit.
</content>
