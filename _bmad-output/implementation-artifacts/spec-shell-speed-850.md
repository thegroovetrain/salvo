---
title: 'Gun-family shell speed 500 → 850 u/s'
type: 'chore'
created: '2026-11-22'
status: 'done'
final_revision: '39b42ed78200e300abd611e74608b789d8ed7cf0'
baseline_revision: '4039fd54ff7c7f4a02496f7f5399a78c333deba0'
review_loop_iteration: 0
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Every gun-family shell flies at 500 u/s (Eric ruling 2026-07-25, set when reaches were ~1,000 u). Since Story 11.2's hectometer reaches (380 hm = 8,636 u base main battery) a full-reach shell takes 17.3 s and a Tier V star shell ~26 s; Eric: "the bullet traverse feels a little slow. We want it faster, but not so fast that there's no counterplay."

**Approach:** Eric 2026-11-22 (chat, after the realism comparison — real-world dodge ratio ≈ 870 u/s): *"Okay, lets go with 850 and see how it feels."* Set `shellSpeed` to 850 on every gun-family block in `CONFIG`, keeping the family standardized at one speed. Full reach: 380 hm → 10.2 s; a 30 u/s hull moves ~13.5 hm in that time.

## Boundaries & Constraints

**Always:** All 10 `shellSpeed` fields in `shared/src/constants.ts` (gun, machineGun, flak, mainBattery, secondaries, broadside, starShells, phosphorShells, foulingShell, flashShells) move together to 850. Every consumer (bot lead, equipment spawns, tests, smokes) keeps reading `CONFIG.<block>.shellSpeed` — no literal 850 anywhere outside `constants.ts`.

**Block If:** a test or smoke fails in a way that reveals gameplay depends on the slower speed (e.g. a spawn-tick / minimum-range / burst-resolution behavior changes meaning) rather than a test that merely encoded 500 — that is a design question for Eric.

**Never:** change torpedo speeds, reaches, shell radius, dispersion, reloads, or any other dial; add UI or copy; bump `PROTOCOL_VERSION` (no `client/src` reader of `shellSpeed` — shells reach the client as wire `vx`/`vy`); pin 850 in a test.

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- the 10 `shellSpeed: 500` fields (lines ~1310, 1415, 1456, 1568, 1609, 2131, 2275, 2327, 2378, 2489) and their "500"/"300→500" comments.
- `shared/src/sim/shell.ts` -- swept segment collision (no tunneling at 42.5 u/tick); untouched.
- `server/src/game/lead.ts` -- comment "ordnance 60-500 u/s"; bot lead solve reads CONFIG.
- `server/src/game/equipment/phosphorShells.ts` -- header comment "500 u/s".
- `server/src/__tests__/combat.test.ts:342`, `server/src/__tests__/intentQueue.test.ts:236` -- comments quoting 500 u/s / 25 u per tick.
- `server/scripts/tickCost.mjs` -- 16-hull tick cost, old vs new.
- `_bmad-output/implementation-artifacts/epic-12-context-amendments.md` -- append the ruling.
- `VERSION`, `package.json` (+ lockfile root version) -- build cycle bump.
- `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- one-line stamps.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- set every gun-family `shellSpeed` to 850; update each trailing comment to cite Eric 2026-11-22 (500 → 850) -- the ruling.
- [x] `server/src/game/lead.ts`, `server/src/game/equipment/phosphorShells.ts`, `server/src/__tests__/combat.test.ts`, `server/src/__tests__/intentQueue.test.ts` -- refresh comments that quote 500 u/s / 25 u per tick so they are not stale (wording only, or CONFIG-relative) -- no stale numbers.
- [x] `_bmad-output/implementation-artifacts/epic-12-context-amendments.md` -- append amendment (number taken at PR time) recording the ruling verbatim, the flight-time table, and "what will bite": shellSpeed is one family speed, never pinned in a test -- durable home.
- [x] `VERSION`, root `package.json`, `package-lock.json` root entries -- next 0.20.X (taken at PR time after fetch) -- versioning rule.
- [x] both trackers -- one-line stamp each -- tracker rule.

**Acceptance Criteria:**
- Given the built shared package, when any gun-family block's `shellSpeed` is read, then it is 850 and all 10 are equal.
- Given a fired main-battery salvo at full 380 hm reach, when it flies, then it lands in ~10.2 s (reach / 850), with hits still resolved by the swept segment test.
- Given `npm run check`, when run once at the end, then lint, types, all tests and the hook test pass with no test asserting a literal 850.
- Given `node server/scripts/tickCost.mjs` on old and new, when compared, then the new mean/p99 is not worse (fewer shells aloft) — numbers recorded in the spec.
- Given `weaponsSmoke.mjs` and `matchSmoke.mjs` with `HC_DEV_OPTIONS=1`, when run, then both pass first try.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
Reviewers: Blind Hunter (Fable), Edge Case Hunter (Fable), Codex (gpt-5.6-sol) cross-check. All three: no tunneling (swept segments), no client `shellSpeed` reader, bots read CONFIG.
- intent_gap: 0
- bad_spec: 0
- patch: 3 (high 1, low 2)
- defer: 2 (low 2)
- reject: 6 (low 6) — PR-time records not yet written (done at PR), GDD catalog-v3 still says 500 (a historical catalog of superseded numbers), point-sampled reveal gate (42.5 u chord, theoretical), client overshoot / tracer strobe / bots aim better (feel consequences, surfaced to Eric, no change)
- addressed_findings:
  - `[high]` `[patch]` own-shell claim gate: a back-dated shot first reveals up to 150 ms x speed downrange (127.5 u at 850), past the one-hull-length gate in `client/src/net/roomBindings.ts`, so bow shots at ~45 ms+ ping lost the own-fire cue / own styling / own cull and the special-shell burst radius. Gate now adds the event's wire speed x `fireBackdateCeilingMs`; regression test in `client/src/__tests__/roomBindings.test.ts` proven to fail without the fix. (Edge Case Hunter, confirmed by reading.)
  - `[low]` `[patch]` `gunnery-hitcall-beyond-sight` golden proof now checks every `hc` on the tick (Codex + both Fable reviewers flagged the first-only narrowing).
  - `[low]` `[patch]` stale 25 u/tick comments in `goldenFrames.test.ts` `scnTorpReReveal` made CONFIG-relative; `combat.test.ts` ruling date fixed.

## Verification

**Commands:**
- `grep -n "shellSpeed" shared/src/constants.ts` -- expected: 10 lines, all 850.
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: green.
- `npm run check` -- expected: green (once, at the end).
- `node server/scripts/tickCost.mjs` (old worktree vs new) -- expected: no regression.
- `HC_DEV_OPTIONS=1 node server/scripts/weaponsSmoke.mjs` / `matchSmoke.mjs` against a booted worktree server -- expected: pass.

## Auto Run Result

**Summary:** every gun-family shell (10 CONFIG blocks) flies at 850 u/s instead of 500 — full 380 hm reach in 10.2 s instead of 17.3 s. Review found one real knock-on bug (own shots unclaimed at ordinary ping because of the lag-compensation pre-step) and it is fixed.

**Files:**
- `shared/src/constants.ts` — 10 x `shellSpeed: 850`, comments.
- `client/src/net/roomBindings.ts` — own-shell claim gate widened by the back-date pre-step (wire speed).
- `client/src/__tests__/roomBindings.test.ts` — positive + negative regression tests.
- `server/src/__tests__/goldenFrames.test.ts` + `.snap` — hit-call proof per shell; snapshot re-recorded for new flight timing.
- `server/src/game/lead.ts`, `server/src/game/equipment/phosphorShells.ts`, `server/src/__tests__/combat.test.ts`, `server/src/__tests__/intentQueue.test.ts` — comments.
- `VERSION`, `package.json`, `package-lock.json` — 0.20.7; both trackers stamped; epic-12 amendment 16; 2 deferred-work entries.

**Verification:**
- `npm run check` — exit 0: lint 0 errors (3 pre-existing warnings), tsc clean, shared 1459 / server 2994 / client 4475 tests, hook test 266/266.
- `tickCost.mjs --seed 7 --hulls 16 --seconds 90` — 500: mean 8.66 / p99 25.39 ms, shells aloft 55.4; 850: mean 8.16 / p99 24.30 ms, shells aloft 32.7.
- `matchSmoke.mjs` — pass first try. `weaponsSmoke.mjs` (scratch server :2621) — pass first try.

**Residual risks (for Eric's playtest):** bots hit moving targets more often at the same dials (lead uses the exact speed; hit chance has no flight-time term); machine-gun tracers may read as dashes (`tracerLenU` 8 vs ~14 u per 60 Hz frame); a shell can draw up to one tick (42.5 u) past its landing before the boom.
