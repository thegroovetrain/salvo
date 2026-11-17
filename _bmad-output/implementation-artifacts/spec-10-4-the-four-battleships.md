---
title: 'Story 10.4: The Four Battleships'
type: 'feature'
created: '2026-11-04'
status: 'done'
baseline_revision: '0faac312'
final_revision: 'ed2f77a0 (code, gate patches) + the closing records commit at the PR head on worktree-story-10-4-four-battleships'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
  - '{project-root}/_bmad-output/planning-artifacts/research/battleship-sitting-2026-11-04.html'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The game still sails three placeholder classes with one 360° deck gun on one cooldown. Eric's slice needs the four historical battleships (Yamato, Bismarck, HMS Warspite, USS Iowa) whose turret layout, arcs and per-turret rhythm ARE the ship, on the 10.3 index floor.

**Approach:** Replace the three classes with four hulls built from the 10.4 design sitting (epic-10 amendment 7: traced outlines true to scale, real turret stations, train limits, 90°/s load-bearing traverse). The main battery becomes per-turret state in the SHARED sim; secondaries are a uniform heat-limited weapon on right mouse and the only thing that hurts a mine; the Shift ability becomes the seat pick in the deck gun's place; the personal hue wheel is removed for cyan (own) / red (enemy) linework with the Default skin.

## Eric's rulings for this story (2026-11-04, AskUserQuestion at the spec step — literal spec, recorded as epic-10 amendment 9)

- **R1 Hull indices ("fun" table), RUDDER 100 on all four:**

  | | yamato | bismarck | warspite | iowa |
  |---|---|---|---|---|
  | ARMOR | 130 | 120 | 100 | 85 |
  | POWER | 140 | 95 | 100 | 105 |
  | RELOAD | 70 | 105 | 100 | 95 |
  | ENGINES | 85 | 95 | 80 | 120 |
  | RUDDER | 100 | 100 | 100 | 100 |
  | INTEL | 90 | 100 | 90 | 115 |
  | RANGE | 100 | 95 | 125 | 100 |

- **R2 Main battery — "Equal broadside, 10 s":** a triple turret fires 3 shells of 24, a twin turret 2 shells of 27; a full broadside is 216 on every hull; each turret reloads in 10 000 ms (before RELOAD); reach is today's cannon reach (`RUNG × 8` = 1000 u at RANGE 100).
- **R3 Secondaries — heat, not ammo** (Eric: *"Secondary range should be half your main gun's range. I'd like to rework it entirely, so instead of running on ammo, it has an 'heat/overheat' mechanic. So it can be used reliably in bursts, and as long as it hasn't overheated it will cool down when not being fired, but sustained fire might take it out of commission until it fully cools. Damage should be pretty low, its a supplement to the main gun."* then *"5 per round, 4s to overheat, 6s to cool, lets make it fire every 0.12s (math the DPS out on that and check with me though before we make it final)"*, then on the math: **3 per round**): 3 damage per round, one round every 120 ms while right mouse is held, 4 000 ms of continuous fire reaches full heat, full heat locks the guns until heat is back to zero, full → zero takes 6 000 ms, heat drains whenever not firing. Reach = half the hull's folded main reach.
- **R4 Early click** (Eric: *"The turret fires wherever it is currently pointing, even if it is the wrong direction. However if *any* turret is ready and pointed that way, it should fire instead."*): a click always fires when any turret is ready. Priority 1: a ready turret that is on the aim point. Otherwise a ready turret fires along its CURRENT bearing.
- **R5 Scale:** as drawn — 0.4585 u/m: Iowa 124.0 × 15.1 u, Yamato 120.6 × 17.8, Bismarck 115.1 × 16.5, Warspite 90.0 × 14.5.
- **R6 Color:** the hue wheel is removed EVERYWHERE; all ship linework cyan for own, red for enemy; Default skin inside; everything the wheel colored (wakes, nameplates, kill-feed names, buoy markers) follows the same rule. Skin picker and the other three skins are a later story.
- **R7 Defaults:** Bismarck with Speed Boost (fresh browser and every sanitizer fail-open).

## Boundaries & Constraints

**Always:**
- Turret angle, turret reload and secondary heat step in `shared/src/sim` at 50 ms, called identically by server and client; no per-side fork. `CONFIG` holds every number above.
- Everything spatial leaves the server through `frames.ts` / `perception.observe()`. A sighted hull's turret angles ride its existing contact row (appended last, optional); own turret / heat state rides the own-ship block. The SIX perception exceptions stay six; invariant tests are EXTENDED for the new fields.
- New input (`sec` held) enters only through `game/inputs.ts`, validated. `PROTOCOL_VERSION` 95 → 96. No friendly fire. ESLint complexity ≤ 10. Drones keep their own hulls, envelopes and single 360° gun unchanged (10.8 retires them).
- Tests assert relations and contracts, never bare CONFIG literals, copy, ring sizes or a coincidence of ruled numbers.
- Visual candidates (ship cards, in-game hull + turrets, HUD gun / heat readout) are RENDERED from the real client modules to an artifact page for Eric before the PR is merged.

**Block If:**
- A change would need a seventh perception exception, or a turret/heat field cannot be kept self-private or sight-gated.
- A gameplay number outside R1–R7 and the implementer readings below is needed and no reading in Design Notes covers it.
- `npm run check`, `matchSmoke` or `weaponsSmoke` cannot be made green without working around an error.

**Never:**
- No turret hit zones or localized damage; no aircraft / AA; no per-hull secondaries; no volley picker.
- CANNON / MACHINE GUN / FLAK are never dealt or mounted on a captain (rows stay in CONFIG / catalog for reference and for drones).
- No skin picker, no Gold / Pride / Funny skins, no How-to-Play / GDD / catalog-v3 copy edits (10.14), no CLAUDE.md edit, no equipment-slot or consumable changes (10.5), no bot tuning beyond "functional" (10.12), no batch sims.
- No reference image enters the repo; only the traced numeric data from the sitting page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| On-target shot | click; turret A ready and traversed onto the aim point | A fires its 2/3 shells at the aim point; only A's reload starts | none |
| Two candidates | click; A ready off-target, B ready on-target | B fires (on-target wins over order) | none |
| Early click | click; one or more turrets ready, none on target | one ready turret fires along its current bearing at the aim distance (clamped to reach) | none |
| Nothing ready | click; every turret reloading | nothing fires | denial `cooling` |
| Blind sector | aim inside a turret's blind sector | turret parks at the nearer stop; never rotates through the blind sector; reaches the far side the long way | none |
| Bow-on / stern-on | aim dead ahead / dead astern | 3×3 hulls bring 6 / 3 guns, 4×2 hulls 4 / 4; broadside 9 / 8 | none |
| Secondary burst | right mouse held < 4 s then released | rounds every 120 ms; heat rises, then drains | none |
| Overheat | right mouse held 4 s | guns lock at full heat; no round until heat is zero (6 s) even if still held | none |
| Mine sweep | secondary round lands on a mine's marker | mine takes 3; a 10 hp mine pops on the 4th round | none |
| Main gun vs mine | main shell lands on a mine's marker | mine untouched | none |
| Bad seat pick | join with unknown `cls` / `shift` / legacy `gun` | seat gets `bismarck` / `boost`; legacy `gun` ignored | log `join.*Coerced`, fail open |
| Malformed `sec` | input `sec` not boolean | whole input dropped | silent drop |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.shipClasses` (3 ids, `shift` field, hull dims, index), `SHIP_CLASS_IDS`, `sanitizeClassId`, `classShift`, `CONFIG.gun` / `machineGun` / `flak`, `CONFIG.mine`, hit masks, `REGATTA_HUES`.
- `shared/src/sim/silhouette.ts` -- `BOARD_OUTLINES` per class, `normalizeBoardOutline`, hitbox + radar imprint + muzzle + wake consumers.
- `shared/src/sim/aim.ts`, `sim/arcs.ts` -- broadside per-turret prior art (`turretAimPoints`, `turretMuzzles`), `arcFor`; no traverse state exists anywhere.
- `shared/src/sim/loadout.ts`, `stats.ts`, `indexStats.ts`, `effects.ts`, `catalog.ts`, `draw.ts`, `boons.ts` -- slot 0 gun (`GunId`, `MOUNTED_GUN`), slot 1 Shift (`ShiftId`, `DEFAULT_SHIFT`), `effectiveStats` rows, RANGE scaling, deck-gun ladders and their draw gate.
- `shared/src/sim/nav.ts` -- `WIDEST_BEAM` feeds map-gen clearance (hull beams change).
- `shared/src/types.ts`, `shared/src/index.ts` -- `InputMsg`, `OwnShip` (`gun`), `Contact`, `PROTOCOL_VERSION`.
- `server/src/game/equipment/{index,guns,machineGun,broadside}.ts` -- `Equipment` registry, fire path, stream row.
- `server/src/game/world.ts` -- `addShip` / `addBot`, `shiftFor`, `fireControl` / `streamControl` in `STEP_ORDER`, `landOnMines`.
- `server/src/game/{inputs,frames,signals,perception}.ts` -- input sanitizer, own block, contact row, invariant tests (`signals.test.ts`, `perception.test.ts`, `spectator.test.ts`, goldenFrames).
- `server/src/rooms/{ArenaRoom,roomOptions,formArena,StandardQueueRoom,LobbyRoom}.ts`, `server/src/game/regatta.ts` -- seat `auth.gun`, sanitizers, hue assignment, bot fleet build.
- `server/src/game/ai/{botDriver,doctrine,equipment,tactics,shift,profiles,utility}.ts` -- class pick, gun doctrine, `SHIFT_TACTICS` keyed by class.
- `server/scripts/batchsim/*`, `server/scripts/*.mjs` -- `byGun` / `byGunTier`, `--gun`, smokes that name class and gun ids.
- `client/src/render/ships.ts`, `contacts.ts`, `wake.ts`, `nameplates.ts`, `decoys.ts`, `hotbar.ts`, `hudBar.ts`, `firing.ts` -- flat hull polygon, hue tables, gun square.
- `client/src/ui/{classSelect,home,classNames,killFeed,settings}.ts`, `client/src/net/connection.ts` -- three class cards, DECK GUN chips, `ColorHoist`, join options.
- `client/src/input/mouse.ts`, `client/src/sim/{inputSampler,prediction}.ts`, `client/src/main.ts` -- right click unused; no gun prediction today.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- replace the three classes with `yamato` / `bismarck` / `warspite` / `iowa` (R1, R5, per-hull `battery`: train limit, turret stations, guns per turret, shell damage); add `CONFIG.mainBattery` and `CONFIG.secondaries` (R2, R3); drop the class `shift` field and `classShift`; default class `bismarck`; remove `REGATTA_HUES` -- the four hulls and their numbers.
- [x] `shared/src/sim/turrets.ts` (new) + `shared/src/sim/secondaries.ts` (new) -- pure steppers: per-turret traverse (90°/s, hard stops, never through the blind sector), reload, the R4 turret pick, heat / overheat -- one sim both sides run.
- [x] `shared/src/sim/silhouette.ts` -- four traced outlines from the sitting page's `OUTLINES` (Warspite = the `warspite` trace), normalized to R5 -- hitbox, radar imprint, muzzle, wake.
- [x] `shared/src/sim/{loadout,stats,indexStats,effects,catalog,draw,boons,arcs,aim}.ts` -- slot 0 becomes the main battery; the Shift is a seat pick (`shift` replaces `gun` in `loadoutFor` / `slotsWithCards`); deck-gun ladders are never eligible for a captain; RANGE scales the main and secondary reach -- fit and stat fold.
- [x] `shared/src/types.ts`, `shared/src/index.ts` -- `InputMsg.sec`; `OwnShip` turret + heat state and `shift` (replacing `gun`); `Contact` turret angles (optional, last); PV 96 with a history note -- wire contract.
- [x] `shared/src/__tests__/*` -- unit tests for the I/O matrix rows on the pure steppers; relations for the four hulls (guns bearing bow / broadside / stern, equal broadside, Bismarck default); retire class-id and gun-pick pins -- contracts.
- [x] `server/src/game/equipment/*`, `server/src/game/world.ts` -- main-battery and secondaries equipment on the shared steppers; turret step + secondary stream get explicit `STEP_ORDER` slots; `landOnMines` honours secondaries only; instant reload finishes every turret -- authoritative fire path.
- [x] `server/src/game/{inputs,frames,signals,perception}.ts` -- validate `sec`; own block + contact row fields; extend the invariant tests and re-record goldenFrames with a dated note -- anti-cheat chokepoint.
- [x] `server/src/rooms/*`, `server/src/game/regatta.ts` -- `shift` in seat auth with `sanitizeShift` fail-open; legacy `gun` ignored; hue assignment and `PlayerMeta.color` removed -- join path.
- [x] `server/src/game/ai/*` -- bots pick among four hulls and three Shifts, aim with lead, click when a ready turret is on target, hold secondaries on a hull in reach short of overheat; Shift tactics keyed by `ShiftId` -- functional bots.
- [x] `server/scripts/batchsim/*`, `server/scripts/*.mjs` -- hull × layout × Shift readouts replace gun × tier; smokes move to the four hulls; weaponsSmoke gains main-battery, secondaries, secondaries-pop-mine and main-gun-ignores-mine phases -- harness and smokes.
- [x] `client/src/render/hullArt/*` (new), `client/src/render/ships.ts` and hue consumers -- hull art from the sitting page's `HOUSES` / `FEATURES` / Default palette; one bold relation-colored hull line, inner lines at about a third; turrets rotate individually; hue tables, colorblind remap and its setting removed -- ship rendering and R6.
- [x] `client/src/input/mouse.ts`, `client/src/sim/*`, `client/src/main.ts`, `client/src/net/*` -- right mouse held sends `sec`; own turrets and heat stepped locally with the shared steppers and corrected from the own block; contact turrets from the wire -- input and prediction.
- [x] `client/src/ui/{classSelect,home,classNames,killFeed,settings}.ts`, `client/src/render/{hotbar,hudBar}.ts` -- four ship cards, SPECIAL row as the Shift chips, hoist removed; gun square shows turret readiness, a secondaries square shows heat -- chrome and HUD.
- [x] `_bmad-output/**`, `VERSION`, `package.json` -- amendment 9 (rulings verbatim + readings), DESIGN.md dated stamps on changed rows, deferred-work, both trackers one-line, 0.19.6 -- records.

**Acceptance Criteria:**
- Given a fresh browser, when the ship-select layer opens, then it shows exactly four ship cards with a three-way Shift pick and no color hoist, Bismarck + Speed Boost preselected, and the pick survives a reload.
- Given two captains in sight, when one turns its turrets, then the other sees those turrets turn; a hull outside sight and this-tick radar leaks no turret angle (property test).
- Given any hull, when its guns bearing are counted by bearing through the shared arc function, then bow / broadside / stern give 6 / 9 / 3 on Yamato and Iowa and 4 / 8 / 4 on Bismarck and Warspite.
- Given a full match of bots, when it runs to a winner, then bots of all four hulls fire main guns and secondaries and no bot mounts a deck gun.
- Given the finished tree, when `npm run check`, `matchSmoke` and `weaponsSmoke` run, then all pass first try.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass (Fable Blind Hunter + Fable Edge Case Hunter + Codex `gpt-5.6-sol`, on `git diff 0faac312..HEAD`)

Verdicts: Blind Hunter FIX-FIRST (12 findings, three reproduced with a probe), Edge Case Hunter ten unhandled cases (one confirmed numerically), Codex FIX-FIRST (2). All three traced the perception gate for `tu`, the own-only keys, fire control, the mine masks and the join sanitizers as clean.

- intent_gap: 0
- bad_spec: 0
- patch: 15 (high 1, medium 10, low 4)
- defer: 2 (low 2)
- reject: 3
- addressed_findings:
  - `[high]` `[patch]` Blind Hunter (probe): secondaries heat was charged per held tick, so tapping fired about 2× a steady hold and never overheated → heat per ROUND, no cooling inside a round's own rate window (`shared/src/sim/secondaries.ts`); ten press patterns asserted under the duty-cycle bound.
  - `[medium]` `[patch]` Blind Hunter (probe): the R4 fallback read a blind-parked turret as zero error (an aft turret fired 35° wide) → ranked by true bearing error (`sim/turrets.ts`).
  - `[medium]` `[patch]` Blind Hunter (probe): far turrets flipped between stops on a centerline aim → stop hysteresis (`sim/turrets.ts`, `desiredTurretAngleFrom`).
  - `[medium]` `[patch]` Edge Case Hunter (numeric run): aim distance 0 slewed every turret to a hard stop → `batteryAimPoint` returns no aim; both sides hold and the click is refused.
  - `[medium]` `[patch]` Blind Hunter, flagged earlier by the server wave: a RELOAD card did not rescale running turret reloads → `rescaleReloadTimers` scales each turret (the 2026-08-04 ruling).
  - `[medium]` `[patch]` Codex + Blind Hunter + Edge Case Hunter: client heat prediction disagreed with the server while sinking and while the room is frozen → `OwnBatteryGate { afloat, weaponsLive }`.
  - `[medium]` `[patch]` Blind Hunter + Edge Case Hunter: a stale own frame un-reloaded a predicted shot → per-turret fire seq against `ackSeq`, 64-frame valve.
  - `[medium]` `[patch]` Edge Case Hunter: a right press over a hotbar slot activated the slot → side-effect-free hit test.
  - `[medium]` `[patch]` Blind Hunter + Edge Case Hunter: a left chord edge was dropped when the right press had been rejected → chord edges read `e.buttons`.
  - `[medium]` `[patch]` Codex + Edge Case Hunter: a right release the page never heard left the stream running → released on a move without the button bit and on leaving the window.
  - `[medium]` `[patch]` Edge Case Hunter: a bot spent INSTANT RELOAD after its first salvo → only when no turret is ready.
  - `[medium]` `[patch]` Edge Case Hunter: a Shift chip click also changed the selected hull → the click stops at the chip.
  - `[low]` `[patch]` Edge Case Hunter: a bot's held scatter survived a target switch → keyed to the target.
  - `[low]` `[patch]` Blind Hunter: bot heat thresholds outside CONFIG → `CONFIG.bots.secReleaseHeat` / `secRepressHeat`.
  - `[low]` `[patch]` Edge Case Hunter: the client restated units-per-meter → `U_PER_M` exported from shared.
- deferred (ledger, owned by Story 10.12): a bot's non-battery shot steals its turret aim; a bot's on-target check reads the pre-move pose.
- rejected: the `join.clsCoerced` warning on an old saved class (the client sanitizes its saved pick); "the smokes are broken at HEAD" (the smokes wave was in flight and landed as 7a623e54); "implementer numbers must go to Eric before the PR" (every reading is recorded in amendment 9 for his veto; the two bot thresholds moved to CONFIG).

## Auto Run Result

**Summary.** The three classes are replaced by Yamato, Bismarck, HMS Warspite and USS Iowa on Eric's index table, with traced true-to-scale hitboxes. The main battery is per-turret shared-sim state (90°/s traverse with hard stops, 10 s reload per turret, the early-click rule). Secondaries fire on right mouse on a heat law and are the only captain weapon that hurts a mine. The Shift is the seat pick; the hue wheel is gone for cyan / red relation linework on the Default skin. Cycle 212, 0.19.5 → 0.19.6, PROTOCOL_VERSION 95 → 96, epic-10 amendment 9.

**Files changed (by area).**
- `shared/src/constants.ts`, `sim/turrets.ts` (new), `sim/secondaries.ts` (new), `sim/hullOutlines.ts` (new), `sim/silhouette.ts`, `sim/{loadout,stats,indexStats,effects,boons,arcs,aim,draw}.ts`, `types.ts`, `index.ts` — hulls, steppers, fit, wire, PV 96.
- `server/src/game/equipment/{mainBattery,secondaries}.ts` (new), `game/{world,inputs,frames,signals,match,matchRecord,drones}.ts`, `game/ai/*` (`battery.ts` new), `rooms/*`, `game/regatta.ts` (deleted), `scripts/batchsim/*`, `scripts/*.mjs` — fire path, perception, join, bots, harness, smokes.
- `client/src/render/hullArt/*` (new), `render/{ships,relationColor,secHeat,contacts,hotbar,hudBar,aimPreview,...}.ts`, `sim/{ownBattery,ownBatteryTick}.ts` (new), `input/mouse.ts`, `ui/{classSelect,home,classNames,ownAccent}.ts`, `net/*`, `main.ts`, `config.ts`, `render/hueLatch.ts` (deleted) — art, prediction, input, chrome.
- `_bmad-output/**`, `VERSION`, `package.json` — amendment 9, DESIGN.md stamps, ledger, trackers, 0.19.6.

**Waves (per `/orchestrate`).** 1 shared — Fable (93af0c02); 2a server — Opus (0b3b558a); 2b client functional — Opus (60f00fbf); 2c client art — Opus (7385d992); 3 smokes — Opus (7a623e54); records — Sonnet (4bb13098); gate patches shared — Fable, server + client — Opus (ed2f77a0). Orchestrator rulings at the wave-1 gate: hitbox tolerance 0.3 u; steerage speed scaled per hull.

**Verification.**

| Check | Result |
|---|---|
| `npm run check` (patched tree, ed2f77a0) | EXIT 0 — shared 1340, server 2841, client 4195, hook 266; eslint 0 errors |
| Tests before → after | shared 1246 → 1340, server 2830 → 2841, client 4181 → 4195 |
| `matchSmoke` (patched tree) | PASS first try |
| `weaponsSmoke` (patched tree, scratch server) | PASS first try — main battery, secondaries heat / lock, secondaries pop a mine in 4 landings, main guns leave a mine intact |
| Other smokes (pre-patch tree) | smoke, prediction, queue, lobby, solo, metrics, reconnect, opening, liveness PASS; fog, combat, zone RED on heuristic piloting (standing ledger entry) |
| goldenFrames | re-recorded twice with dated notes (wave 2a: new own / contact fields, hulls; gate: heat values and held-at-rest turret angles); no key added beyond `shift`, `turrets`, `sec`, `tu` |
| Rendered candidate | https://claude.ai/artifact/WooR6A3DnTGGydvbURP4g6 — published, NOT yet judged by Eric |

**Residual risks.**
- The rendered candidate (ship cards, hull art at game zoom, heat square) has not been approved; the project rule is a yes before merge.
- The lockout is 6.1 s, not Eric's 6.0 s, a consequence of the per-round heat law.
- At default zoom deck detail reads as fills; at max zoom-out a hull is a 1–2 px dash told apart only by cyan / red.
- Drones outrun battleships; the light torpedo outruns every hull; battleship wakes paint thin on radar; hulls are half as wide as before (hit chances drop).
- Bots are functional, not tuned: a torpedo shot can pull their turrets off target; no mine sweeping (10.12).
- Three heuristic-pilot smokes are red; How-to-Play copy is stale until 10.14; pinned-seed bot seats shifted.

## Design Notes

Implementer readings of record (each is Eric's to veto on staging; none is a ruling):
- **Ids** `yamato`, `bismarck`, `warspite`, `iowa`; display YAMATO / BISMARCK / HMS WARSPITE / USS IOWA.
- **Kinematics** (accel, decel, reverse, steerage) are unruled per hull: all four take today's `battleship` row.
- **Stations / train:** amendment 7(c)(d)(h) — Warspite uses the corrected 0.23 / 0.31 / 0.735 / 0.815; ±150° (Bismarck ±145°) from rest 0° fwd / 180° aft; every turret chases the one aim point, measured from its own gunhouse.
- **R4 tie-break:** among ready on-target turrets the lowest index (bow first); among ready off-target turrets the smallest angular error. "On target" = within the arc and within a small `CONFIG.mainBattery` tolerance.
- **Main shell** is today's cannon shell (speed, burst radius, contact damage, attenuation, family word) with the R2 damage and a hull + decoy mask (no mine bit). **Secondary round** is today's machine-gun round with R3 damage, family `mg`, 360°.
- **Instant Reload** finishes every turret; heat is untouched. **Bots** roll hull and Shift uniformly.
- **Traced outlines** stay as traced; simplify only below hit-test tolerance; if a trace is not mirror-symmetric the symmetry test becomes a tolerance, not a reason to redraw.
- **Hue removal** includes the server's hue assignment, the roster color field and the colorblind-assist setting (it only remapped the wheel). Drones keep today's drone look. Bounty amber is untouched.
- **HUD:** nothing here is final (amendment 8(o): a full UI pass is coming); the gun square and a secondaries heat square are the minimum readable readout.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0 (lint, tsc ×3, all tests, hook test).
- `npm run lint` -- expected: 0 errors, complexity ≤ 10.
- `HC_DEV_OPTIONS=1` server from `server/` on a scratch `PORT`, then `node server/scripts/matchSmoke.mjs` and `node server/scripts/weaponsSmoke.mjs` (one at a time) -- expected: both OK first try; server PID and its tsx child killed after.

**Manual checks (if no CLI):**
- Candidate artifact pages rendered from the real client modules: ship-select layer at 1366×768; own + enemy hull with turning turrets at game zoom; HUD gun / heat squares.
