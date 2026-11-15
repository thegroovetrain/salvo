---
title: 'Story 11.7 Beacon Placement — random open water, 7 / 5 / 3'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_revision: 'dfbf254bbcca56f9ca9896c6e30e5ce1576e86a4'
final_revision: 'f8a0f95160ca52e402537220f7720c0926724995'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Radio beacons are placed by the fleet-anchor max-min rule (`spawn.ts` `pickFleetAnchor`): as far as possible from every hull and from each other. Every match they fall into the same regular "weird square" pattern, pushed away from players. Story 11.7 as written (forge lock 6) proposed neighbor-pair midpoints plus a 30 s inward nudge. Eric, 2026-11-15, before the spec step: *"we are overthinking this … I just don't want them all clustered in basically a weird square like they are now. Its a game where randomness is part of things. I don't mind if there's one or two in the middle."*

**Approach (Eric's rulings, 2026-11-15, chat):** At each ring cycle's 0:00, every beacon goes on a **uniformly random** open-water point inside the live ring, `edgeMarginU` (500 u) in from the edge and clear of land as today. It stays outside every afloat captain's `keepOutU` disc (1000 u at the spec step; **500 u from the review gate — Eric 2026-11-15: "Solve the problem. If its wrong we can change it."**, amendment 15(d)). It is **at least 1000 u from every beacon already placed this cycle** (new `CONFIG.beacons.minSpacingU`). **Counts become `[7, 5, 3]`** (*"Just to keep it odd lol"*). The midpoint, pairing, nudge and fleet-anchor rule are all RETIRED.

## Boundaries & Constraints

**Always:**
- Eric's numbers: `counts: [7, 5, 3]`, ~~`minSpacingU: 1000`~~ `minSpacingFrac: 0.5` × placement radius (Eric's playtest, see Spec Change Log); `edgeMarginU` 500 unchanged; `keepOutU` 1000 → 500 (review gate, Eric 2026-11-15). Sudden death still gets none.
- One draw per attempt is uniform over the disc of radius `ring.r − edgeMarginU` about the LIVE ring centre (sqrt radius), on the cycle's existing server-private stream (`BeaconField` seed, `mulberry32(seed ^ imul(cycle+1, …))`). It must never come from the public map seed.
- Hard constraints (never broken): inside that disc; `islandClearance > SPAWN_ISLAND_CLEARANCE`; distance ≥ `minSpacingU` from every beacon already taken this cycle (float32 positions, as `taken` holds them).
- Soft constraint: outside every captain disc (`captainDiscs()`, participants afloat, r = `keepOutU`).
- Attempt budget is `CONFIG.beacons.placeAttempts: 256` (the old `FLEET_ANCHOR_SAMPLES`; an implementation knob, mirroring `CONFIG.drops.placeAttempts`).
- **Reading (for Eric's veto) — degradation order, "the placement always happens, degrades visibly" (as today):** (1) return the first draw meeting hard + soft; (2) else the first draw that met the hard constraints, LOGGED `beacon.keepOutRelaxed`; (3) else no beacon for that slot, LOGGED `beacon.placeSkipped`. The cycle simply has fewer beacons, the same spirit as "the count falls when the ring is too small".
- Slot ids stay dense: a skipped slot does not leave a hole (`bcn-${cycle}-${n}` numbered by placed beacons).
- `PROTOCOL_VERSION` stays 108 (review gate: no wire shape change and the client reads none of the changed fields; the story text said unchanged). Counts stay ≤ `BEACON_WIRE_SLOTS` 8.
- Server-only behavior. The schema shape is unchanged; bots farm as today (count- and placement-agnostic).

**Block If:**
- Any perception / invariant test can only pass by widening an exception.

**Never:**
- The midpoint / pairing / nudge mechanism; any max-min scoring against hulls; a new harness metric or a batch-sim run (none asked for); How-to-Play / in-game copy (11.11 owns copy).
- Keep the fleet-anchor code alive: `pickFleetAnchor`, `FleetAnchor`, `IntelDisc`, `insideIntelDisc` and `FLEET_ANCHOR_SAMPLES` have no other consumer and are deleted, not left as dead code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cycle 0, 16 hulls on spawn ring | ring r 5000, counts[0] 7 | 7 beacons, each ≤ 4500 from centre, off land, > 1000 from every captain, pairwise ≥ 1000 | none |
| Captains crowd the ring | every hard-valid draw is inside some captain disc | beacon placed at first hard-valid draw | `logWarn('beacon.keepOutRelaxed', {tick, cycle, slot})` |
| Ring too small for spacing | no draw in 256 meets the hard constraints | slot skipped, fewer beacons, ids dense | `logWarn('beacon.placeSkipped', {tick, cycle, slot, attempts})` |
| Domain radius ≤ 0 | `ring.r ≤ edgeMarginU` | no beacon for the slot | logged skip, never throws |
| Sudden-death cycle | cycle ≥ counts.length | set cleared, none placed | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts` ~2975–3019 -- `CONFIG.beacons`: counts, new `minSpacingU` / `placeAttempts`, COUNTS / PLACEMENT doc comment.
- `shared/src/index.ts:1113` -- `PROTOCOL_VERSION`.
- `server/src/game/spawn.ts:223–306` -- ANCHORS section (`pickFleetAnchor` and friends): replace with the pure `pickBeaconSpot`.
- `server/src/game/beacons.ts:44,117,176` -- `BeaconPick` type (imports `FleetAnchor`), `replace` loop (no null path today).
- `server/src/game/world.ts:205,5716,8002–8036` -- import, `captainDiscs()`, `placeBeacons`.
- `world.ts:8086` `pickDropSpot` -- the scatter precedent (uniform disc, island clearance, attempts, null on failure).
- Tests: `server/src/__tests__/beacons.test.ts` (header + real-map loop :45–66 + `pickFrom` fakes :112–170), `beaconFixture.ts:83` (`seatBeacons`), `beaconRoom.test.ts`, `beaconPerception.test.ts:161–170` (natural placement, needs ≥ 2 beacons).

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- `counts: [7, 5, 3]`, add `minSpacingU: 1000` and `placeAttempts: 256` with ruling comments; rewrite the COUNTS / PLACEMENT comment (random rule, Eric 2026-11-15, Story 11.7); `keepOutU` comment drops "fleet-anchor" -- the single source of truth.
- [x] `shared/src/index.ts` -- ~~`PROTOCOL_VERSION` 109~~ reverted at the review gate: stays 108 (see Spec Change Log).
- [x] `server/src/game/spawn.ts` -- delete the ANCHORS section; add an exported pure `pickBeaconSpot(center, radius, islands, taken, captains, cfg, rng)` returning `{x, y, keepOutRelaxed: boolean} | null` per the degradation order. Captains are `readonly Vec2[]` with radius `cfg.keepOutU`; spacing is `cfg.minSpacingU`; attempts `cfg.placeAttempts`. -- one pure, testable rule.
- [x] `server/src/game/beacons.ts` -- `BeaconPick` returns `Vec2 | null`; `replace` skips a null (calls an optional `onSkip`, or leaves logging to the caller — the implementer's choice, documented) and numbers ids by placed count; update the constructor comment ("max-min placement" → random placement; the seed stays private because the keep-out disc still reads captain positions).
- [x] `server/src/game/world.ts` -- `placeBeacons` uses `pickBeaconSpot` and logs `beacon.keepOutRelaxed` / `beacon.placeSkipped`; `captainDiscs` becomes captain positions (or is inlined); docblock rewritten; drop the `pickFleetAnchor` / `IntelDisc` import.
- [x] `server/src/__tests__/` -- unit-test `pickBeaconSpot` for every matrix row (fake rng / tiny islands): happy, relaxed, skipped, radius ≤ 0, spacing respected. Real-map loop asserts pairwise ≥ `minSpacingU` and keeps the existing checks; `pickFrom` fakes and `beaconFixture.seatBeacons` adopt the `Vec2 | null` contract; one test for a null pick giving dense ids and a shorter set. Fix any count- or position-sensitive test. Tests read CONFIG — never pin 7/5/3 or 1000.
- [x] `server/scripts/rl/worker.ts:53` -- comment names the new log keys.

**Acceptance Criteria:**
- Given a real map and a full lobby at cycle 0, when `placeBeacons` runs, then `beaconCountFor(0)` beacons are charted at points satisfying every hard and soft constraint, and two different private seeds give different sets.
- Given the change, when `npm run check` runs, then lint (complexity ≤ 10), types, all tests and the hook test pass.
- Given the diff, when grepped, then `pickFleetAnchor`, `IntelDisc`, `insideIntelDisc`, `FleetAnchor` and `FLEET_ANCHOR_SAMPLES` appear nowhere in `shared/`, `server/` or `client/` source.

## Spec Change Log

### 2026-11-15 — review gate (Eric-ruled, not a re-derivation)
- **Trigger:** Blind Hunter measured that at `keepOutU` 1000 the 16 spawn discs wall off radius ~3,300–4,500 u at 0:00 (beacons never in the outer band), and that relaxed placement hits 12–29 % of beacons at the 8:00 cycle with 6–8 survivors. Eric: *"I don't care. Solve the problem. If its wrong we can change it."*
- **Amended:** `keepOutU` 1000 → 500 (= `rangeU`); `PROTOCOL_VERSION` bump reverted (the client reads no changed field). The code was patched in place; no loopback was needed.
- **Avoids:** beacons always inside the captain ring at match start; beacons charted with a hull already in the paying circle late game.
- **KEEP:** `pickBeaconSpot`'s degradation order, dense slot ids, private per-cycle stream, the deleted fleet-anchor code.

### 2026-11-15 — Eric's playtest on the local dev server
- **Trigger:** *"They need to be spread out from each other a bit more. THey were all clumped together for the first ring."*
- **Amended:** `minSpacingU` 1000 → `minSpacingFrac` 0.5 × the placement radius (2,250 / 1,500 / 750 u); `World.placeBeacons` hands the picker the scaled distance. The value was the widest fraction with 0 skips in 400 simulated cycles per ring (amendment 15(e)). This supersedes the intent contract's "1000 u" spacing.
- **KEEP:** everything above; `pickBeaconSpot` still takes an absolute `minSpacingU`.

## Review Triage Log

### 2026-11-15 — Review pass (Blind Hunter + Edge Case Hunter on Fable; Codex gpt-5.6-sol)
- intent_gap: 1 (high 1): the keep-out geometry, resolved by Eric in chat (above)
- bad_spec: 0
- patch: 4 (medium 1, low 3)
- defer: 0
- reject: 5 (low 5): relaxed draw ignores captain distance (rare at 500 u; spec order kept); NaN / 0 `placeAttempts` via `--tune` (`beacons.*` is not tunable); `beaconPerception` seed fragility (passes; positions read from the chart); oracle-comment wording; the keep-out "leak" (pre-existing, unchanged)
- addressed_findings:
  - `[medium]` `[patch]` full-lobby AC untested → new real-map test with 16 captains on three seeds (`beacons.test.ts`)
  - `[low]` `[patch]` float32 rounding could put a rim draw outside the disc (Codex + Edge Case Hunter) → rounded point re-checked (`spawn.ts`)
  - `[low]` `[patch]` consecutive skips logged the same slot → `request` counter on both log lines (`world.ts`)
  - `[low]` `[patch]` tautological assertion in `beaconRoom.test.ts` removed; PV note was wrong → bump reverted

## Design Notes

The degradation order is deliberately the same posture as today's ratified fallback (`pickFleetAnchor` returned its max-min point with `fallback: true` rather than placing nothing). Only the hard constraints that make a beacon *wrong* (in the storm margin, on land, overlapping another's paying circle) can drop it. The keep-out disc is a fairness nicety, so it bends first.

## Verification

**Commands:**
- `npm test -w shared` and `npm test -w server` -- all green.
- `npm run check` -- exits 0.
- `HC_DEV_OPTIONS=1` `server/scripts/soloSmoke.mjs` against a self-booted server on a scratch port -- beacon assertions pass; kill the PID AND its tsx child.

## Auto Run Result

**Status: done** (2026-11-15, cycle 236, 0.19.30, PV 108 unchanged, epic-11 amendment 15).

- **Change:** radio beacons are placed at random on open water inside the live ring (500 u edge margin, off land), at least half the placement radius apart (2,250 / 1,500 / 750 u; was 1,000 u until Eric's playtest), outside every captain's 500 u keep-out (soft: relaxed + logged when impossible; a slot that fails the hard rules is skipped + logged, ids dense). Counts 7 / 5 / 3. The fleet-anchor max-min code is deleted.
- **Files:** `shared/src/constants.ts` (counts, `minSpacingU`, `placeAttempts`, `keepOutU` 500, comments); `server/src/game/spawn.ts` (`pickBeaconSpot` replaces the ANCHORS section); `server/src/game/beacons.ts` (`BeaconPick` → `Vec2 | null`, dense ids); `server/src/game/world.ts` (`placeBeacons`, `captainPositions`, logs); `server/scripts/rl/worker.ts` (log key comment); tests `beacons.test.ts` (+ `pickBeaconSpot` unit cases, spacing, full lobby), `beaconFixture.ts`, `beaconRoom.test.ts`; records: epic-11 amendment 15, epics.md / GDD stamps, both trackers, VERSION + package.json.
- **Review:** 4 patches, 0 deferred, 5 rejected, 1 intent gap resolved by Eric in chat (keep-out 500).
- **Verification:** lint 0 errors; tsc shared / server / client clean; tests shared 1465, server 2988, client 4505; hook test 266/0; `soloSmoke.mjs` green at the implementation wave (up to 7 beacons charted, no skip / relaxed lines). The single `npm run check` invocation timed out at 40 min on a machine at load ~280 (other sessions), so its stages were re-run individually, all exit 0.
- **Residual risk:** the 500 u keep-out and 1,000 u spacing are untested in play; a relaxed late-game beacon can still chart near a hull (first hard-valid draw, now rare).
