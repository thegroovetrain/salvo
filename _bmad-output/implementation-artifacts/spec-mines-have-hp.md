---
title: 'Mines have hit points: only a deck gun click on the mine hurts one'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
baseline_revision: '3ef6b29a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The machine gun cannot clear mines: its hit mask omits `mine` and it has no burst, and only a burst covering a mine's centre pops one today (amendments 16/20). Eric's ruling (amendment 200): a mine has 10 hp that only a deck gun's click ON the mine can take — cannon and flak pop in one, the machine gun needs three shells at tier I — nothing else damages a mine, naval mines alone chain, arming mines pop, captive mines can be destroyed.

**Approach:** Server-only mine hp on `MineState` (`CONFIG.mine.hp = 10`); a new per-shell "landed on a mine" test at the shell's resolution point (burst point for cannon/flak, arrival point for a direct machine-gun shell) against `CONFIG.mine.hitRadiusU = 10` (the client's drawn marker ring, now single-sourced from CONFIG): a hit deals the shell's full damage to that mine, at 0 hp the mine pops (naval/fouling detonate; captive is removed with a `boom` and no fish). Burst coverage no longer detonates mines; `mine` leaves the broadside and phosphor masks and joins the machine gun's; `chainMines` is naval-only both ways; the collector's arming/captive gates go. `PROTOCOL_VERSION` 65 → 66 (client reads `hitRadiusU`). Version 0.18.25, cycle 160.

## Boundaries & Constraints

**Always:**
- Mine hp lives on the server `MineState` only — never on `MineView`, never on any wire shape, never predicted by the client (the client never predicts a pop today; keep it so).
- Amendment 20's shooter-information rule stands: a shell passing over a mine in flight is untouched (the `earliestTarget`/sweep-mask exclusion of mines stays); the ONLY mine test is at the point the shell lands. No `hc`, `sp`, boom or any mark is added for a mine the shooter did not land on.
- The landing test applies only to shells whose `hits` mask contains `mine` — exactly the three deck guns (cannon, flak, machine gun). Broadside, star shells, phosphor shells, flash shells, torpedoes never damage a mine.
- A pop by gunfire with no hull victim emits `sp` (as today); the mine's `boom` stays sight-gated through `signals.ts` as today. No new event kind, no seventh perception exception.
- Chain: `chainMines` propagates only from a naval mine and only into naval mines (armed; any owner). Fouling and captive mines neither propagate nor receive. Trip behaviour (`checkMineTriggers`) is untouched.
- Arming mines take damage and pop. Captive mines take damage; at 0 hp a captive is consumed with a `boom` (no `hit`), no blast, no fish. Own mines are hittable (standing friendly-fire exception).
- One number for "on the mine": `CONFIG.mine.hitRadiusU = 10`, read by the server test and by `client/src/render/mines.ts` in place of its `RING_R` literal.
- All numbers are Eric's: hp 10, hit radius = the drawn 10 u ring. No other mine number moves.
- ESLint complexity ≤ 10; `npm run check` green; golden snapshot regenerated knowingly if the mine-burst scenario changes (a cannon click on a mine still pops it: 15 ≥ 10 — the snapshot should NOT change; if it does, read why).

**Block If:**
- Implementing needs the client to know mine hp, or a new wire field: HALT.
- The twin-cannon straddle makes a centred click miss under the 10 u disc: HALT and report (expected: 6 u offset < 10 u, both shells land).

**Never:**
- No HUD, tooltip, How-to-Play or any copy about mine hp. No bot mine-shooting tactic. No change to mine trip rings, blast numbers, arm delay, placement.
- Do not re-tune gun damage. Do not touch `CONFIG.machineGun` numbers.
- Do not merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cannon click on a mine | armed naval mine at (300,0); click lands at (300,0); gun damage 15 | mine hp 10 → −5 → pops: `boom`, blast, naval chain; shooter gets `sp` (no hull victim) | No error expected |
| Flak click on a mine | mine at (300,0), click at (300,0), 12 dmg | pops in one | No error expected |
| Flak burst merely covering a mine | mine at (300,30), click at (300,0) (inside the 50 u blast) | mine untouched, hp 10 | No error expected |
| MG stream on a mine | held with aim point on the mine for 3 shells (4 dmg each, tier I) | hp 10 → 6 → 2 → pops on the third; first two shells: `sp`, no boom | No error expected |
| MG shell spent on a hull first | hull between muzzle and the mine | hull takes the hit, mine untouched | No error expected |
| Click past gun reach | mine at 700 u, cannon reach 660 u | shell lands at 660 u, mine untouched | No error expected |
| Broadside / phosphor burst over a mine | mask without `mine` | mine untouched | No error expected |
| Arming mine clicked | mine laid 1 s ago (arm 3 s) | takes damage; pops at 0 (detonates with blast) | No error expected |
| Captive mine clicked by cannon | captive at the click | consumed: `boom` without `hit`, no blast, no fish | No error expected |
| Chain from a naval pop | naval A pops; naval B, fouling C, captive D within A's blast | B pops (chain); C and D untouched | No error expected |
| Fouling pop near naval | fouling pops (tripped); naval within its blast | naval untouched (fouling never propagates) | No error expected |
| Own mine clicked | shooter's own naval mine | pops (friendly-fire exception) | No error expected |
| Twin-mount centred click | deckGun ×4 (barrels 2, ±6 u), click centred on the mine | both shells land within 10 u; mine takes 20 then is gone (second application on a consumed mine is a no-op) | No error expected |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.mine.hp = 10`, `CONFIG.mine.hitRadiusU = 10`; masks: `machineGun.hits` → `HITS_HULL_MINE_DECOY`, `broadside.hits`/`phosphorShells.hits` → `HITS_HULL_DECOY`; comments at :976-981, :1047, :1658-1663
- `shared/src/sim/shell.ts` -- `burstVictims` no longer returns mines (or callers skip them); comments :20-28, :190-200, :535-541
- `shared/src/index.ts` -- PV 66 + header entry
- `server/src/game/equipment/mines.ts` -- `MineState.hp`, set at `addMine` from CONFIG; `damageMine(mine, amount)` helper
- `server/src/game/world.ts` -- `collectMines` (:3518) drops the arming/captive gates or is retired for bursts; `resolveBurst` (:4960-5043) stops detonating covered mines and instead runs the landing test at the burst point; the direct-shell `expired` path (:4844) runs the same landing test for MG shells; `detonateMine`/`chainMines` (:4375-4527) naval-only chain, captive destroy path; new `mineAtPoint(x,y)` lookup
- `server/src/game/equipment/machineGun.ts` -- comment :23-27; `hits: CONFIG.machineGun.hits` now carries `mine`
- `client/src/render/mines.ts` -- `RING_R` reads `CONFIG.mine.hitRadiusU`
- Tests: `shared/src/__tests__/shell.test.ts` (:503-601, :659, :746 mask + burst pins), `server/src/__tests__/hitTargets.test.ts` (:194, :276-430), `weapons.test.ts` (:284-546), `flak.test.ts` (:76, :256-263), `doctrines.test.ts` (:644, :1048-1057), `gunnery.test.ts` (:315-325), `starShells.test.ts:80`, `goldenFrames.test.ts` (:630-646), `radarRaster`/`barrel`/`colyseus018`/`denials`/`ordnanceMasksAreServerOnly` PV pins; new `mineHp.test.ts` (server) with the I/O matrix
- Docs: epics FR57/AR44 (:152, :284, :580, :1856), GDD :226-227, catalog-v3 :228, EXPERIENCE.md :232/:283 — dated supersession notes; CHANGELOG, VERSION, package.json, both trackers, amendments 200–201 (written), epic-8-context

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts`, `shared/src/sim/shell.ts`, `shared/src/index.ts` -- numbers, masks, burst no longer yields mines, PV 66
- [ ] `server/src/game/equipment/mines.ts`, `server/src/game/world.ts`, `machineGun.ts` -- hp, landing test at both resolution paths, naval-only chain, captive destroy, comments
- [ ] `client/src/render/mines.ts` -- ring radius from CONFIG
- [ ] Tests -- rewrite the pins listed; add `mineHp.test.ts` covering every I/O row through the real fire paths (cannon volley, flak, MG stream)
- [ ] Docs wave -- 0.18.25, CHANGELOG, trackers, dated notes, epic-8-context

**Acceptance Criteria:**
- Given an armed naval mine and a cannon click landing on it, when the shell resolves, then the mine pops and chains into naval mines only.
- Given a machine-gun stream aimed at a mine, when three tier-I shells land on it, then it pops on the third and not before.
- Given a flak burst whose radius covers a mine but whose landing point is more than 10 u from its centre, when it resolves, then the mine is untouched.
- Given broadside or phosphor fire over a mine, then the mine is untouched.
- Given a captive mine clicked by a deck gun to 0 hp, then it is removed with a `boom`, no blast, no fish.
- Given `npm run check`, then everything is green and the perception invariants still hold.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test -w shared` / `-w server` / `-w client` -- green
- `npm run check` -- green
