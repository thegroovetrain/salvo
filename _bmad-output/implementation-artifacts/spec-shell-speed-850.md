---
title: 'Gun-family shell speed 500 → 850 u/s'
type: 'chore'
created: '2026-11-22'
status: 'in-progress'
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
- [ ] `shared/src/constants.ts` -- set every gun-family `shellSpeed` to 850; update each trailing comment to cite Eric 2026-11-22 (500 → 850) -- the ruling.
- [ ] `server/src/game/lead.ts`, `server/src/game/equipment/phosphorShells.ts`, `server/src/__tests__/combat.test.ts`, `server/src/__tests__/intentQueue.test.ts` -- refresh comments that quote 500 u/s / 25 u per tick so they are not stale (wording only, or CONFIG-relative) -- no stale numbers.
- [ ] `_bmad-output/implementation-artifacts/epic-12-context-amendments.md` -- append amendment (number taken at PR time) recording the ruling verbatim, the flight-time table, and "what will bite": shellSpeed is one family speed, never pinned in a test -- durable home.
- [ ] `VERSION`, root `package.json`, `package-lock.json` root entries -- next 0.20.X (taken at PR time after fetch) -- versioning rule.
- [ ] both trackers -- one-line stamp each -- tracker rule.

**Acceptance Criteria:**
- Given the built shared package, when any gun-family block's `shellSpeed` is read, then it is 850 and all 10 are equal.
- Given a fired main-battery salvo at full 380 hm reach, when it flies, then it lands in ~10.2 s (reach / 850), with hits still resolved by the swept segment test.
- Given `npm run check`, when run once at the end, then lint, types, all tests and the hook test pass with no test asserting a literal 850.
- Given `node server/scripts/tickCost.mjs` on old and new, when compared, then the new mean/p99 is not worse (fewer shells aloft) — numbers recorded in the spec.
- Given `weaponsSmoke.mjs` and `matchSmoke.mjs` with `HC_DEV_OPTIONS=1`, when run, then both pass first try.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `grep -n "shellSpeed" shared/src/constants.ts` -- expected: 10 lines, all 850.
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: green.
- `npm run check` -- expected: green (once, at the end).
- `node server/scripts/tickCost.mjs` (old worktree vs new) -- expected: no regression.
- `HC_DEV_OPTIONS=1 node server/scripts/weaponsSmoke.mjs` / `matchSmoke.mjs` against a booted worktree server -- expected: pass.
