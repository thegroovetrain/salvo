---
title: 'Story 11.1: Real Dispersion'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_revision: 'f2f70febd58d9155fbd94e84383c12fae89e0613'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A gun shell stops exactly on the clicked point, and a long shot is punished by weaker damage (`CONFIG.gunAttenuation`). Epic 11 needs the opposite: a long shot is a gamble on where it lands, never a weaker hit.

**Approach:** One pure shared function turns (muzzle, aim point, seed) into a landing point inside an ellipse that grows linearly with range; the main battery and the secondaries land every shell through it, seeded from a room-private match stream. Distance decay is removed everywhere. The aim preview draws the ellipse. A dispersion bench page built from the real function goes to Eric BEFORE any game wiring is committed.

## Boundaries & Constraints

**Always (Eric's rulings, AskUserQuestion 2026-11-12, R1–R8):**
- R1 Bench page first: the dispersion part only, from the real shared function, published privately; Eric's yes on its numbers and on the preview look gates Phase B.
- R2 Ellipse full length along the shot = 1 % of range; full width across = one third of that. Both `CONFIG.dispersion` dials.
- R3 Bell-shaped spread, most shells near the middle; the ellipse is a hard edge, nothing lands outside it.
- R4 Point-blank floor 2 u.
- R5 Every shell rolls its own landing point.
- R6 Only the main battery and the secondaries scatter. Star, phosphor, dazzle and fouling shells land exactly on the click.
- R7 The aim preview draws the ellipse outline at the aim point; rendered for Eric's yes before commit.
- R8 Bots keep `aimScatterU` untouched (Story 11.9 owns it). A dispersed shell may land past max reach, never outside the map disk.
- Damage is flat anywhere in the pattern. Server authoritative; the client never samples a landing point and the wire gains no field.
- A dispersed shell flies STRAIGHT from its muzzle to its landing point (bearing and travel distance recomputed per shell) — never a sideways snap on arrival.
- Numbers (amendment, cycle, version) are taken at PR time after `git fetch`; placeholders until then.

**Block If:** Eric changes a number or the spread on the bench page in a way these rulings do not cover; a perception invariant would need a seventh exception; the gate fails for a reason outside this story.

**Never:** an AIM row or any index stat for accuracy; touching reach, radar, map gen or `aimScatterU`; client-side landing prediction; in-game copy; a batch sim; editing `CLAUDE.md`; merging.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Long shot | range 1000 u, default dials | landing inside an ellipse 10 u long (along the shot) × 3.33 u wide, centered on the aim point | none |
| Point blank | range ≈ 0 | each axis floored at `floorU` (2 u full length); landing never outside it | none |
| Same seed | identical inputs + seed | identical landing point | none |
| Zero-length shot | muzzle == aim | along axis falls back to a fixed bearing; result finite | no NaN |
| Map edge | dispersed point outside the map disk | clamped inside the map | none |
| Max reach | aim clamped to reach | landing may exceed reach by at most half the along axis | none |
| Utility shell | star / phosphor / dazzle / fouling | lands exactly on the clamped click, as today | none |

</intent-contract>

## Code Map

- `shared/src/sim/dispersion.ts` -- NEW: `dispersionAxes(rangeU, cfg)` (semi-axes, used by the preview) and `dispersedPoint(origin, aim, seed, cfg)`
- `shared/src/constants.ts:1440-1487` -- `CONFIG.gunAttenuation` + doc block: REMOVE with a dated note; add `CONFIG.dispersion { alongFrac, acrossFrac, floorU, sigmas }`
- `shared/src/sim/attenuation.ts` -- remove `GunAttenuationCfg` / `rangeAttenuation`; KEEP `flakRimFactor`, `settleBlow`
- `shared/src/sim/shell.ts:128-137` -- remove `originX / originY / attenRangeU`
- `shared/src/sim/turrets.ts:382-400` `turretSalvo` -- stays the un-dispersed geometry (preview + server base)
- `shared/src/index.ts:1046,1096` -- barrel; `PROTOCOL_VERSION` 102 → 103 (the client reads `CONFIG.dispersion`)
- `shared/src/types.ts:1010-1054` -- `BurstEvent` doc: the burst center is the landing point, no longer the click
- `server/src/game/world.ts` -- `:1395-1422` `shellAttenuation` / `burstHitAmount` / `interceptionAmount`, `:6349` `landOnMines`; stream roster `:2030-2140`; `ActivationContext` built `:7069`; `nextBallisticId` `:7348`
- `server/src/game/equipment/` -- `mainBattery.ts:61-98`, `secondaries.ts:27-52` (disperse); `guns.ts:143-145,217`, `flak.ts`, `machineGun.ts`, `ballistics.ts:80-124,160` (attenuation plumbing out); `index.ts:50-95` `ActivationContext`
- `server/src/game/ai/doctrine.ts:100-125` -- `EffectiveReach.fullU` (reads `gunAttenuation`)
- `server/scripts/batchsim/` -- `botReadouts.ts:97-102,229-239,575-583`, `botReadoutReport.ts`, `overrides.ts:681-700,856-866`, `args.ts:120`, `balanceProbe.ts:160`, `catalogMetrics.ts`; `server/scripts/weaponsSmoke.mjs:132,823-1044`
- `client/src/render/aimPreview.ts:350-372` + `client/src/__tests__/aimPreview.test.ts` -- main-battery burst preview
- `client/scripts/soundAudition.mjs` -- the esbuild single-file page recipe to copy
- Tests naming attenuation: `shared` `attenuation.test.ts`, `barrel.test.ts:104`; `server` `rangeAttenuation.test.ts`, `flak.test.ts`, `mineHp.test.ts`, `mineBlastLanding.test.ts`, `mainBattery.test.ts:339`, `botDoctrine.test.ts:184`, `perception.test.ts:2666`; batchsim `tuneFloor.test.ts:162-206`, `botHarness.test.ts:682`

## Tasks & Acceptance

**Execution — Phase A (then STOP for Eric's yes):**
- [ ] `shared/src/constants.ts` -- add `CONFIG.dispersion { alongFrac: 0.01, acrossFrac: 1/3, floorU: 2, sigmas: 2 }` with doc -- the dials
- [ ] `shared/src/sim/dispersion.ts` + `shared/src/index.ts` -- the two pure functions (see Design Notes), exported -- the one shared function
- [ ] `shared/src/__tests__/dispersion.test.ts` -- the matrix rows as contracts (inside the ellipse for many seeds, linear growth, floor, long axis along the shot, same seed same point, finite at zero length) -- no pinned sample values
- [ ] `client/scripts/dispersionBench.mjs` + `client/scripts/dispersionBench/` -- single-file page from the real function: sliders for the four dials and range, sample salvos drawn to scale against a hull and the 15 u blast at today's 1000 u and at 8,700 u, hit-share readout, and the R7 preview-oval candidate in the game's reticle look -- R1
- [ ] Publish the page as a private artifact; record Eric's numbers; HALT for his yes

**Execution — Phase B (after the yes):**
- [ ] `server/src/game/world.ts`, `equipment/index.ts` -- a room-private dispersion stream (new constant in the roster) keyed per shell id; exposed on `ActivationContext` -- seeded, replayable, unknown to clients
- [ ] `server/src/game/equipment/mainBattery.ts`, `secondaries.ts` -- each shell's target = `dispersedPoint(muzzle, baseTarget, seed)` clamped inside the map; bearing and range recomputed per shell -- R5, straight flight
- [ ] `shared` + `server` attenuation removal across the Code Map files, dated notes, tests deleted or re-cut to flat damage -- distance decay retired (supersedes epic-9 amendment 187)
- [ ] `server/scripts/batchsim/*`, `weaponsSmoke.mjs` -- drop `gunAttenuation` tune keys and `shotsBeyondRange`; add main-battery hit share by range band -- the harness readout
- [ ] `client/src/render/aimPreview.ts` + test -- draw the ellipse from `dispersionAxes` in the look Eric approved -- R7
- [ ] `shared/src/index.ts`, `VERSION`, `package.json`, both trackers, `epic-11-context-amendments.md`, `docs/codebase-map.md` -- PV 103, cycle records, the rulings R1–R8 as one amendment

**Acceptance Criteria:**
- Given a main-battery salvo, when it fires, then each shell has its own landing point inside the ellipse for its range and its velocity points from its muzzle at that point.
- Given two hits by the same shell type at short and at long range, when damage settles, then the amounts are equal.
- Given a match replayed with the same seeds and inputs, when shells fire, then they land on the same points.
- Given any client frame, when a shell is revealed, then it carries no landing point, origin or seed (the perception invariants stay green, six exceptions).
- Given a bot match, when it runs, then bots still fire and hit (`aimScatterU` unchanged).
- Given `grep -r "gunAttenuation\|rangeAttenuation\|attenRangeU"` over `shared server client`, then only dated retirement notes match.

## Spec Change Log

- **2026-11-12 — Eric on the bench page (chat), rulings R9–R12; they override the intent contract where they differ.**
  - R9 The four dials stand: `alongFrac 0.01`, `acrossFrac 1/3`, `floorU 2` (per axis — "that scale is too small to matter"), `sigmas 2`.
  - R10 The aim preview is re-cut (supersedes R7's single outlined oval): NO travel lines, NO blast circles; one FILLED oval per shell of the next turret to fire, overlapping, no outline needed, in a color bright enough to be seen on the ocean ("dull amber isn't cutting it"). Candidates are rendered on the bench page; his pick gates the commit.
  - R11 Turret and launcher TRAVERSE TIME IS REMOVED — back to point and shoot; each turret or launcher fires only if the target point is within its arc. Supersedes epic-10 amendment 7's load-bearing traverse and the hold-outside-the-arc half of amendment 10 as far as traverse goes; the exact reading (which turret is "next", what the bots' `readyOnTarget` becomes, what the client's turret-angle prediction becomes) is settled with Eric before Phase B.
  - R12 Phase B is not started until R10's look is picked.
  - KEEP: `dispersion.ts`, its tests and the bench page's first two cards as built.
- **2026-11-12 later — Eric (chat + AskUserQuestion), rulings R13–R17; Phase B is unblocked.**
  - R13 CONVERGE: every barrel of a turret aims at the ONE target point ("a real turret's barrels would all be aimed to train on the same target point, though they wouldn't all land on it"); each shell still rolls its own landing (R5) around that point. The parallel landing tracks are gone; barrels keep their own muzzles.
  - R14 The oval is ONE oval at the center of the targeting cursor at its TRUE size (never a minimum screen size), fill = bench idea E "bright middle" (brightest at the center, fading to the edge, following `sigmas`), no outline, no lines, no blast circles; tinted by the aim color setting.
  - R15 The reticle is brighter and bigger by default: bright amber, 2× today's size. Two player settings: aim color (a full color picker; tints reticle AND oval) and aim size 1×–5× (default 2×).
  - R16 No traverse: among READY turrets whose arc holds the aim point the bow-most fires, at the aim point; a turret or launcher never fires outside its arc; drawn turrets and launchers snap to the aim while it is in their arc and rest otherwise. `CONFIG.mainBattery.traverseDegPerS` / `onTargetDeg` and the launcher equivalents retire.
  - R17 (author's readings, for veto): the settings labels are the minimal `AIM COLOR` / `AIM SIZE`; bots keep `aimScatterU` and their fire discipline with "on target" re-read as "a ready turret bears"; How-to-Play text about turret traverse is stamped stale for 11.11, not rewritten here.
  - Phase B tasks as amended: Wave 1 `shared` + `server` (dispersion wiring with R13, attenuation removal, traverse removal, bots, harness, smokes, tests); Wave 2 `client` (snap rendering, prediction cleanup, the R14 oval, the R15 reticle + settings); then records.

## Review Triage Log

## Design Notes

- Bell with a hard edge, no rejection loop: two uniforms `u, v` from `mulberry32(seed)`; `r = sqrt(-2·ln(1 − u·(1 − e^(−k²/2)))) / k` with `k = sigmas` gives a truncated-Rayleigh radius in `[0, 1]`; `θ = 2πv`; landing = aim + `a·r·cosθ` along the shot + `b·r·sinθ` across, where `a = max(alongFrac·range, floorU)/2`, `b = max(alongFrac·acrossFrac·range, floorU)/2`.
- `sigmas` (how tightly shells bunch toward the middle) and "the floor applies to each axis" are the spec author's readings, both shown as sliders/visible on the bench page for Eric's veto.
- The legacy unmounted weapons (`gun`, `machineGun`, `flak`, `broadside`) lose attenuation and are NOT dispersed (R6; no hull mounts them).
- Per-shell seed: `(streamSeed ^ imul(shellId, 0x9e3779b9)) >>> 0` — order-independent, so a replay matches.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green, dispersion contracts included
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green (Phase B gate)
- `HC_DEV_OPTIONS=1` matchSmoke + weaponsSmoke against a self-booted server -- expected: pass first try (Phase B)
- `node client/scripts/dispersionBench.mjs` -- expected: writes one self-contained HTML file

**Manual checks:**
- Eric's yes on the bench page numbers and the preview oval before Phase B is committed.
