---
title: 'Sudden Death — the final collapse'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_revision: '799b14f'  # rebased onto cycle 80 mid-run; original baseline was 3ff8004
review_loop_iteration: 0
final_revision: '8d23897'
followup_review_recommended: true
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
- [x] Docs + trackers -- `CLAUDE.md` (phased-storm and Endgame Guarantee bullets), `epic-3-context-amendments.md` (the new dated Eric ruling superseding amendment 24), `deferred-work.md` (mark the SUDDEN DEATH entry RESOLVED and open a ledger row for the ~15:00 covenant now being provably ~17:00 worst case, routed to the 7-5 doc batch), `sprint-status.yaml` AND `gds-workflow-status.yaml` (both, same PR), `VERSION` -> 0.17.82.

**Acceptance Criteria:**
- Given the shipped CONFIG, when the match clock reaches 14:00, then the collapse point is marked on the water at the terminal ring's exact center with a one-shot reveal flash, and the mark persists through closure.
- Given the match clock is between 15:00 and 16:00, when the ring closes, then its radius interpolates linearly 660u -> 0 with its center held FIXED (concentric collapse, no drift), and the chrome bar reads `RING CLOSING m:ss`.
- Given the match clock reaches 16:00, when any hull is afloat anywhere on the map, then it is outside the ring and takes `stormDps`, the storm fill covers the entire map, and the chrome bar reads `RING CLOSED`.
- Given a full-HP battleship (175 hp, the game's maximum — maxHp does not scale with boons) alone in a fully collapsed storm with NOTHING banked, when 16:00 passes, then it sinks within ~45s. The collapse always terminates because the passive XP tick funds only ~0.83 hp/s of heal against 4 hp/s of storm; it is NOT bounded at ~17:00, because `bankedLevels` is uncapped and each level spent on heal is worth ~50 hp (~12.5s), so a hoarding captain extends the outer edge past 19:00.
- Given a client fed only by the room schema (`zoneNextR === 0` during the final group), when it derives the live ring, then its geometry equals the server's authoritative ring at every tick — no desync, and `PROTOCOL_VERSION` is the only wire-facing change.
- Given `suddenDeath` is disabled (every existing `zoneOverride` and smoke literal), when the timeline runs, then it is byte-identical to today: 3 groups, closure at 12:00, terminal ring held.
- Given the batch-sim endgame campaign is rerun, when the pacifist control reaches the collapse, then matches that previously ended `unresolved` at the tick cap now RESOLVE — the structural non-conclusion documented under amendment 24 is eliminated.

## Spec Change Log

No `bad_spec` loopback occurred. The spec's boundaries held through implementation and review: no code was re-derived, and nothing inside `<intent-contract>` was touched.

## Review Triage Log

### 2026-08-14 — Review pass (Blind Hunter + Edge Case Hunter, parallel, no shared context)

- intent_gap: 0
- bad_spec: 0
- patch: 15: (high 1, medium 4, low 10)
- defer: 4: (high 0, medium 2, low 2)
- reject: 4: (high 0, medium 1, low 3)
- addressed_findings:
  - `[high]` `[patch]` The survival ceiling asserted in four places (amendment 30, CLAUDE.md, the spec AC, the evidence doc) was WRONG. It reasoned only from hull HP and the passive tick, but `ShipRecord.bankedLevels` is uncapped and a heal is spendable at any moment while alive, worth ~50 hp each — so a hoarding captain buys ~12.5s per banked level and pushes the outer edge past 19:00, not "under ~17:30". Corrected everywhere, together with the reason the measured 16:43 does not represent that case (these pilots spend as they earn). The mechanic still always terminates; only the bound was wrong.
  - `[medium]` `[patch]` `drawStorm`'s radius-0 branch was UNREACHABLE in the normal flow: `needsRedraw`'s sub-unit `redrawEpsU` swallowed the final step to exactly 0, so the fully collapsed plane kept a sub-unit hole with a ring edge stroked around the collapse point — a visible dot where the AC says solid storm. `needsRedraw` now always redraws when the radius crosses the degenerate boundary in either direction; pinned by test.
  - `[medium]` `[patch]` `closedState` collapsed the ring on the DEGENERATE-timeline path too, inverting this file's fail-closed contract: a mistyped dev `zoneOverride` (beatMs 0/NaN) would storm the whole map from zone start and bleed out every hull at once. Fail-closed here has always meant "park on the terminal ring", never "kill everyone". Now gated on the timeline having actually run; the existing test that pinned the old behavior was re-derived rather than deleted.
  - `[medium]` `[patch]` The PV 35 ledger (index.ts, barrel.test.ts, denials.test.ts) justified the bump partly as "CONFIG.zone gains a field and ships in the welcome snapshot". No client code reads `welcome.config` — it is dead payload carrying the static constant rather than the room's effective zoneCfg — so that rationale taught a false rule for future bumps. Rewritten to the true reason (the group count and total length move, and the client derives the rhythm from its own bundled CONFIG), with the dead-payload fact recorded explicitly.
  - `[medium]` `[patch]` `zoneSmoke`'s "the collapse ring is never transmitted" assertion tested its own decoder rather than the wire: `nextRing()` maps any r<=0 to null, so asserting null was vacuous for a ring whose radius is 0 by construction. Re-derived to read the raw schema field — and the first form of that fix FAILED against a real boundary race (sampling by client-derived group can catch a frame where the server is still in the previous group's closing beat, legitimately advertising 660u), so it was re-derived again to key on the server's own mirrored phase: a reveal beat carrying a zeroed next is impossible for any non-collapse group.
  - `[low]` `[patch]` `planeVisibility` dropped `cur.r > 0`, which had also been the only guard against a non-finite ring CENTRE reaching a Pixi transform (`updateStorm` writes `cur.cx/cy` every plane frame). Restored as an explicit finite-centre check, with the two degenerate cases documented as failing in deliberately opposite directions (a broken radius paints storm everywhere, matching `isOutside`; a broken centre has nowhere to paint).
  - `[low]` `[patch]` `telegraph` and `mark` were not actually mutually exclusive, contradicting the comment that justifies their sharing one `RevealOneShot`. Now enforced rather than assumed (the telegraph wins).
  - `[low]` `[patch]` `zoneLiveState` derived a close FROM an already-collapsed ring when the schema patched to closed ahead of the client's clock estimate — the mirror of the staleness direction `zoneViewFrom` already guards. Now reads closed; pinned by test.
  - `[low]` `[patch]` The above pushed `zoneLiveState` to cyclomatic complexity 11 against the enforced limit of 10; the closing-beat branch was extracted to `closingState` with no behavior change.
  - `[low]` `[patch]` `BatchAggregate.pastClosureRate` kept its name while its meaning moved to the endgame ring; renamed `pastEndgameRate` so the field says what it measures.
  - `[low]` `[patch]` Both wire-parity oracles carried a dead disjunct (`|| full.phase === 'closing'`) that is also not how `syncZoneGeometry` behaves; removed so the oracle mirrors the real rule.
  - `[low]` `[patch]` `pilots.ts`'s `hunt` JSDoc still documented the retired `zonePhase === 'closed'` gate — the one doc a reader lands on when hovering the parameter this cycle changed.
  - `[low]` `[patch]` `roomOptions.ts` documented the override shape without `suddenDeath`, and its desync note predated a field that forks the GROUP COUNT rather than only magnitudes; both updated.
  - `[low]` `[patch]` The `deferred-work.md` SUDDEN DEATH entry said RESOLVED in its summary while its untouched `evidence:` line still said amendment 24 "remains the law of record until an explicit supersession" — a sweep reading the evidence field would have re-opened a closed entry.
  - `[low]` `[patch]` The new CLAUDE.md bullet was still headed "cycle 80" after the rebase renumbering.

Rejected, with reasons: (1) "`closedState`'s `next ?? current` can take a stale non-terminal centre" — the staleness model is backwards; `next` is always the most recently revealed geometry, so preferring it is correct and `current` is the staler value. (2) "the evidence file named in Verification does not exist" — it was written after the review diff was cut. (3) "the client is not flag-aware, so a `zoneOverride` omitting `suddenDeath` desyncs it" — real, but pre-existing and already documented: ANY override field desyncs a client that derives from `CONFIG.zone`, which is why overrides are `HC_DEV_OPTIONS`-gated and never reach a production client; the doc half was patched. (4) "the wire-parity test re-implements the mirror instead of driving it" — `shared` cannot import `server`; the real mirror is covered by the server suite's getter-agreement tests.

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

## Auto Run Result

Status: **done** — landed as cycle 82 (0.17.82), `PROTOCOL_VERSION` 34 → 35.

**What shipped.** The long-parked SUDDEN DEATH contingency, under Eric's authorizing ruling of 2026-08-14. A fourth ring group runs the existing four-beat rhythm from 12:00 — clear, supply, the collapse point MARKED with an X at 14:00, then the terminal 660u ring closing CONCENTRICALLY onto its own centre between 15:00 and 16:00. From 16:00 the map is 100% storm. Epic-3 amendment 24 is superseded on its post-closure-shrink clause alone: `stormDps` is untouched at 4 hp/s and no damage ramp was built.

**Files changed (code).** `shared/src/sim/zone.ts` (the timeline: the `suddenDeath` flag, the appended collapse group, concentric roll, client-side synthesis via `effectiveNext`, `isOutside` fail-closed on a radius-less ring, `zoneEndgameAtMs`, `closingState` extraction) · `shared/src/constants.ts` (`CONFIG.zone.suddenDeath`) · `shared/src/index.ts` (PV 35 + ledger) · `client/src/sim/zoneView.ts` (absence-gated radius decode — the full-map-fallback trap) · `client/src/render/zone.ts` (the X mark, the storm plane surviving r=0, the degenerate-boundary redraw, finite-centre guard) · `client/src/config.ts` (`markPx`/`markArmPx`) · `server/src/game/world.ts` (`zoneEndgameReached`) · `server/scripts/batchsim/pilots.ts` + `report.ts` (endgame gate re-pointed; `pastEndgameRate`) · `server/scripts/zoneSmoke.mjs` (collapse leg) · `server/src/rooms/roomOptions.ts` (override doc).

**Review.** Two adversarial passes in parallel with no shared context. 0 intent gaps, 0 bad-spec loopbacks, 15 patches applied (1 high, 4 medium, 10 low), 4 deferred, 4 rejected — see the Review Triage Log. The high-severity finding was mine: a survival-ceiling claim asserted in four places, including a durable ruling record, that ignored uncapped banked heals.

**Verification.** `npm run check` green — shared 736, server 1106, client 2500 = **4342 tests** (baseline 4309), lint 0 errors (2 pre-existing warnings). `zoneSmoke.mjs` passes over a real socket with the strengthened assertion. Batch-sim evidence in `batch-sim-evidence-2026-08-14.md`: the pacifist control, previously `unresolved` by structure, now resolves **12/12** at p50 16:27 / max 16:43; the endgame instrument still concludes at p50 12:46, proving the pilot re-gate preserved Story 3.4's measurement window.

**Residual risks.** (1) The true worst case is set by HOARDED HEALS, not hull HP — a captain banking levels can push past 19:00; the mechanic still always terminates. (2) Sudden death guarantees a death but not a WINNER: uniform damage makes a same-tick DRAW structurally likely between equal-HP hulls, and no tiebreak was invented. (3) The collapse resolves by HP rather than by play, which is inherent to "geometry, not the damage curve". (4) NFR6's "~15:00" doc text is now wrong in the worst case, routed to the 7-5 batch. (5) UNVERIFIED BY HUMAN EYES — the X mark, its layer position and the collapse's feel have never been seen on the water. All five are ledgered in `deferred-work.md`.
