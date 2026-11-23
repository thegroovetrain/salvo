---
title: 'Phosphor shell flame sound plays when the shell bursts'
type: 'bugfix'
created: '2026-11-22'
status: 'done'
baseline_revision: 'e8fa59905cbfbf1e4c8e4d131160bfe10fe01b4e'
final_revision: 'ba44fb76db870eba74ca603527b4f00c57f9a0b0'
review_loop_iteration: 0
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Eric (2026-11-22): the PHOSPHOR SHELLS "flame whoosh" plays shortly after firing instead of when the shell explodes at the end of its path. The shipped take (`PHOSPHOR_SHELL` B, "Whoomp of flame") bakes launch + flame into one recipe with the flame at a fixed `BURST_MS` = 800 ms, but the real flight time depends on range.

**Approach:** Split the take into two cues: `phosphorShell` (the launch bark only) still plays on the own-fire claim; a new `phosphorBurst` cue (the same two flame layers, shifted to start at 0 / +80 ms, same gain and reverb) plays when OUR phosphor shell's track ends — on its `burst` event, or on its `boom` if it was stopped mid-flight (the server lights the zone at either stop).

## Boundaries & Constraints

**Always:** the flame layers keep Eric's picked sound exactly (same noise colours, filters, envelopes, gain 0.15, reverb 0.35) — only their start offset moves. The flame is own-tier, non-spatial, on its own family so it never steals the launch's voice. Own attribution comes only from the track claim (`projectiles.ownFireOf`) read before the track is retired. Client-only: no wire, `CONFIG`, or `PROTOCOL_VERSION` change.

**Block If:** the burst/boom for an own phosphor shell is not delivered to the firer (would need a server change).

**Never:** change the star / fouling / flash shells (they share the fixed-offset pattern but Eric asked only about phosphor); play the flame for an enemy's phosphor shell; add a legacy-tone fallback for the flame (it had none before — silence is no regression); add new copy or UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own shell fired | own-claimed phosphor shell reveal | `phosphorShell` (launch only) plays | — |
| Own shell bursts | `burst` whose id the track claims as `phosphorShells` | `phosphorBurst` plays at that frame | — |
| Own shell stopped mid-flight | `boom` with the claimed shell id | `phosphorBurst` plays | — |
| Other shell bursts | burst of own star shell / gun / enemy phosphor | no `phosphorBurst` | — |

</intent-contract>

## Code Map

- `client/src/audio/synth/candidates/shells.ts` -- `PHOSPHOR_SHELL` take B (launch + flame at `BURST_MS`).
- `client/src/audio/synth/candidates/index.ts` -- `CUE_GROUPS` audition order (must hold every slot).
- `client/src/audio/synth/cues.ts` -- `CueId`, shipped `TABLE`, `LEGACY_FALLBACK`.
- `client/src/audio/twinMap.ts` -- every cue's visual twin.
- `client/src/net/roomBindings.ts` -- `ownShellCue` (launch), `handleBurst`, `handleBoom`.
- `client/src/__tests__/roomBindings.test.ts` -- own phosphor launch test (~1758).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/audio/synth/candidates/shells.ts` -- make `PHOSPHOR_SHELL` B launch-only; add slot `PHOSPHOR_BURST` (id `phosphorBurst`, take `A`) holding the two flame layers at startMs 0 and 80 -- the flame becomes its own playable sound.
- [x] `client/src/audio/synth/candidates/index.ts` -- list `PHOSPHOR_BURST` right after `PHOSPHOR_SHELL`.
- [x] `client/src/audio/synth/cues.ts` -- add `phosphorBurst` to `CueId` and `TABLE` under `own('ownShellBurst', 2)`.
- [x] `client/src/audio/twinMap.ts` -- twin for `phosphorBurst`: the burning zone appearing where the shell burst (render/burnZones).
- [x] `client/src/net/roomBindings.ts` -- before the track is retired in `handleBurst` and `handleBoom`, play `phosphorBurst` when `ownFireOf(id) === 'phosphorShells'` (one small helper, complexity ≤ 10).
- [x] `client/src/config.ts` -- `audio.cueVoiceCap` 77 → 79 so the own-cue promise (global cap ≥ world cap + every own family cap) holds with the new family.
- [x] `client/src/__tests__/roomBindings.test.ts` -- cover the matrix rows.
- [x] `VERSION`, root `package.json`, `package-lock.json` root entries -- 0.20.8 (cycle 250); both trackers one-line stamps; epic-12 amendment 17; deferred-work entry for the star/fouling/flash shells (CHANGELOG has not been kept since 0.19.20).

**Acceptance Criteria:**
- Given an own phosphor shell fired at long range, when it leaves, then only the launch bark sounds; when it bursts seconds later, then the flame whoomp sounds at that moment.
- Given `npm run check`, then it passes.

## Review Triage Log

### 2026-11-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 1, low 3)
- defer: 1: (high 0, medium 0, low 1)
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - `[medium]` `[patch]` Both reviewers: a phosphor shell has `overShips`/`overLand` (`shared/src/sim/shell.ts`), so it never stops on a hull mid-flight; a `boom` for it is an island/edge miss that lights NO zone (`world.ts` `missBoom` skips `applyStopTags`). The boom branch would play a flame over nothing. Removed it; the boom test now pins "own phosphor boom → no flame". The I/O matrix row "stopped mid-flight → flame" was built on that false premise (only one reading exists: flame = zone lit = burst), so it is superseded by this entry.
  - `[low]` `[patch]` launch take B relabelled "Launch pop" (it no longer holds the flame).
  - `[low]` `[patch]` shells.ts header comment corrected (phosphor has a second slot).
  - `[low]` `[patch]` dropped the changelog-style inline comment on `cueVoiceCap`.
  - defer: star / fouling / flash shells keep the fixed `BURST_MS` (already logged in deferred-work when the spec was written).
  - rejected: flame non-spatial (own-tier, as Eric's pick always was); claim eviction at 32 own claims (≥ 32 own shots inside one ~2 s flight is unreachable); flame after own sinking (the zone still lights on screen); family naming / cap; extra test shapes; sub-tick sync of the flame vs the zone's frame.

## Design Notes

The audition page plays slots through the real renderer, so the flame becomes its own row there ("Phosphor shell burst"); the launch row is now the bark alone. Both remain Eric's take B data.

## Verification

**Commands:**
- `npm test -w client` -- all pass
- `npm run check` -- passes

## Auto Run Result

Status: done. Cycle 250, 0.20.8, PV 113 unchanged (client-only audio), epic-12 amendment 17 (renumbered twice: PR #379 took 248 / 0.20.6 / 15, PR #381 took 249 / 0.20.7 / 16).

- **Change:** the phosphor "Whoomp of flame" take is split into `phosphorShell` (launch pop, on firing) and `phosphorBurst` (the same flame layers from t = 0, played by `handleBurst` when our phosphor shell bursts). A boom for a phosphor shell (an island/edge miss, no zone) plays no flame.
- **Files:** `client/src/audio/synth/candidates/shells.ts` (split slot), `candidates/index.ts` (audition order), `synth/cues.ts` (new cue, family `ownShellBurst`), `audio/twinMap.ts` (visual twin), `config.ts` (`cueVoiceCap` 77 → 79 for the new own family), `net/roomBindings.ts` (`ownShellBurstCue`), `__tests__/roomBindings.test.ts` (burst plays once / boom silent / star + enemy silent); VERSION + package files; both trackers; amendment 16; one deferred-work entry.
- **Review:** 4 patches (boom branch removed, label, comment, inline comment), 1 deferred (star / fouling / flash shells share the fixed-offset bug), 9 rejected.
- **Verification:** `npm run check` pieces all green — lint 0 errors, tsc shared/server/client, shared 1459, server 2994, client 4479, hooks 266.
- **Residual risk:** not heard in a browser; the flame plays on the burst frame, the burning zone draws from the same or next frame.

## Follow-up 2026-11-23 — all four special shells

Eric: *"yes, fix all the special shells."* The same split applied to STAR, FOULING and FLASH shells, and the phosphor burst cue renamed `phosphorBurst` → `phosphorShellBurst` for one naming scheme. All four bursts share own family `ownShellBurst` (cap 2, so the 77 → 79 voice cap still covers it). `roomBindings.ownShellBurstCue` maps the claim through `SPECIAL_SHELL_BURST_CUE`. Tests: each own shell's burst plays its burst cue once (claim read before retire), its boom plays none, gun and enemy bursts play none. The deferred-work entry for the three shells is removed (fixed here, never merged). Amendment 17 (renumbered from 16 after PR #381 landed) rewritten to cover all four.
