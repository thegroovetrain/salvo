---
title: 'Story 10.9: The Flash Shell and the Four Buoys'
type: 'feature'
created: '2026-10-28'
status: 'review'
baseline_revision: '366f100c'
final_revision: 'see the PR head (code + record on worktree-story-10-9-flash-shell-four-buoys; PR to development, 2026-10-29)'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/10-9-the-flash-shell-and-the-four-buoys.md'
---

## Intent

**Problem:** with four chosen slots (10.1) the catalog offered six consumable lines, a thin pick. Eric's brief (2026-10-27): *"Lets add back in the Flash Shell. Lets also split the Buoy into Four varieties... Radar, Healing, Shield, and Speed."* The FLASH SHELLS of Story 8.17 had been replaced outright by the FOULING SHELL (9.4); the DECOY BUOY was a stationary 50 hp torpedo sponge with no tick, no lifetime and no effect, and homing fish had no preference for it.

**Approach (Eric's rulings, 2026-10-28, epic-10 amendment 4):** FLASH SHELLS returns on the fouling shell's click path (id `dazzleShells`, 1000 u reach, r150 u burst, 10 s, 1/4 of SIGHT through the one shared `effectiveSight`); the decoy's body becomes four timed buoys (50 hp, 750 u, 30 s, any bearing at the mine's placement range) whose owner-only effects are a second radar sweep, an uninterruptible 2 %-of-missing heal, a 1 %-of-max shield pool with a 15 + 15 s tail eaten before the SHIELD BLOCK, and a +25 % speed term that adds on the base with the Shift; a kind counts once; homing fish lock the nearest enemy buoy before any hull. Built by `/orchestrate` (shared on Fable; server and client on Opus; gate on Fable ×2 + Codex).

## What changed

### shared (`shared/src`) — the lines and the laws (wave 1, Fable)

- `sim/catalog.ts`: `decoyBuoy` deleted; `dazzleShells`, `radarBuoy`, `healingBuoy`, `shieldBuoy`, `speedBuoy` APPENDED (26 → 30 lines; `CONSUMABLE_IDS` 11; `CONSUMABLE_IS_WEAPON` all five true). `sim/arcs.ts`: the flash `'full'`; every buoy `'full'` (ruling i); mines keep `mineSector()`.
- `constants.ts`: `CONFIG.buoy` { hp 50, sizeU 12, lifetimeMs 30 000, radiusU 750, tailHoldMs 15 000, tailRampMs 15 000, heal.missingPctPerS 0.02, shield.maxHpPctPerS 0.01, speed.factor 0.25 } replaces `CONFIG.decoyBuoy`; `CONFIG.flashShells` { arc, hits, shellSpeed 500, shellRadius 2, radius 150, durationMs 10 000, sightFraction 0.25 } (no `rangeU`: the reach is `foulingShell.rangeU`).
- `sim/buoy.ts` (new): `BuoyKind`, `BUOY_LINE_IDS`, `isBuoyLine`, `buoyKindOf`, `buoyTail(now, insideAt, hold, ramp)`, `insideBuoy`, `combinedBoostFactor(shiftActive, tail, shiftFactor, buoyFactor)`.
- `sim/sight.ts`: `effectiveSight(stats, dazzled = false)` → `sightRange × sightFraction` when dazzled. `sim/shell.ts`: the server-internal `flash` tag beside `foul`; `acquireNearest` is two passes (nearest ENEMY decoy within acquire range, else the shipped nearest-hull law).
- `types.ts`: `DecoyView.kind` (every observer) + own-only `sweep?`/`until?`; `OwnShip.dazzledUntil?` / `buoyShield?: {hp}` / `speedBuoyAt?` (self-private, omitted when inactive); `BlipEvent.src?` (the owner's own radar-buoy id on buoy-origin paints — gate fix 2). `index.ts`: PV 92 → 93.

### server (`server/src`) — the flash, the body, the four effects, the second sweep, the bots (wave 2a, Opus)

- `equipment/consumables/dazzleShells.ts` (the 8.17 row restored, reach `foulingShell.rangeU`, `flash` tag); `equipment/consumables/buoys.ts` (`dropBuoy(kind)` ×4: range clamp `'out-of-arc'`, `blockedWater` `'blocked'`, no sector); `decoyBuoy.ts` deleted. `decoys.ts`: `kind`, `expiresAt`, `sweep` (radar kind: angle/prev/rev/period); the `decoy` machinery name kept for the body (header comment).
- `game/world.ts`: `ShipRecord.dazzledUntil` / `buoyShield` / `speedBuoyAt` / `buoyHealTick` (reset beside `fouledUntil` / `shield` / `boostUntil`); `applyFlash` at burst and interception (owner skipped, centre test, `damageEnabled`); `STEP_ORDER` + `expireBuoys` (the retired `tickBuoys` seat) and `applyBuoyEffects` before `tickRepairs` (ONE scan per ship → `inside: Set<BuoyKind>`; heal flag, `speedBuoyAt = now`, `stepBuoyShield` with the shared tail and `rampFrom`); `healPctPerS` = regen (if due) + buoy (if flagged); `applyDamage` armor → `absorbBuoyShield` → `absorbShield` → hull; `tickKinematics` first stage = one `boostedKinematics(rated, combinedBoostFactor(…))`; `advanceBuoySweeps` at the owner's period (last period kept when the owner is gone).
- `game/signals.ts` / `perception.ts`: `sightOf(me, now)` dazzles every sight-tier gate (radar rungs untouched); `radarOriginPaints(ctx, origin, p, key)` shared by `blipGate` (hull origin) and `buoyRadarBlips` (buoy origin: 750 u, the buoy's window, `visibilityTo` from the buoy, dropout keyed on the buoy; hulls and non-own buoys, not wakes; owner only, fogged mode; `src` on each paint); merged beside `decoyRadarBlips`; registry 26 keys; the SIX exceptions six. `frames.ts`: the three own fields; own buoy views `sweep`/`until`.
- `game/drones.ts`: `avoidHulls` scope = the one-arg undazzled `effectiveSight` (gate fix 1). `game/ai/`: `dazzleShellsTactic` (engaged → `nearestLiveInSight`), one full-circle `ringPlacement` with per-kind wants and `ownBuoyLive(kind)`, profiles swap the decoy for healing/radar, appetite neutral; `plot.ts` reads `CONFIG.buoy.sizeU`.

### client (`client/src`) — the dazzle chain, the marks, the second beam, the tells (wave 2b, Opus)

- `main.ts` `updateDazzle` → `fog.setDazzled` / `radar.setDazzled` / `projectiles.setDazzled`, all through `effectiveSight`; `hud.ts` `DAZZLED Ns`; `roomBindings.ts` rising-edge `dazzled` tone (`tones.ts`, `twinMap.ts`).
- `render/decoys.ts`: per-kind mark (`render/buoyMarks.ts`, one vocabulary: radar fan · plus · heater · double chevron) for own and sighted buoys, the owner's life arc from `until`; `render/buoySweep.ts`: a second beam per own radar buoy (same rotation law, 750 u); `radar.ts`: a `src` paint is marched from the buoy's position with the buoy's range, an unknown `src` is dropped (gate fix 2).
- `render/hpGlobe.ts` `shieldPoolHp` = shield + buoy shield; `sim/prediction.ts` first stage = the server's `combinedBoostFactor` on the rated kinematics (`speedBuoyAt` adopted every frame, reset by `forceSnap`); `main.ts` `activeWindows` shows a buoy slot's life; `ui/boonCopy.ts` five names + CONFIG-derived rows; `render/equipmentIcons.ts` five glyphs; `aimPreview.ts` / `firing.ts` / `weaponArc.ts`: the flash on the fouling reach, a buoy's placement DISC over the full circle; `state.ts` optional `decoys`/`decoysAt`.

## Review Triage Log

### 2026-10-28/29 — Gate (Fable Blind Hunter + Fable Edge Case Hunter + Codex `gpt-5.6-sol`, per `git diff 366f100c..4d611b76`)

Verdicts: Codex FIX-FIRST (one item), Blind Hunter FIX-FIRST (one item), Edge Case Hunter FIX-FIRST (one line). Agreement picture and the orchestrator's triage:

- **All three (CONFIRMED):** `drones.avoidHulls` read `sightOf(ship, 0)` as "undazzled", but `0 < dazzledUntil` holds for any once-flashed drone, so its avoidance scope stayed at quarter-sight (125 u, inside the 150 u kernel reach) for the rest of the match. → **Fix 1**: the one-arg `effectiveSight(ship.stats)`; two red-first regressions in `droneSightScope.test.ts` (once-flashed and actively dazzled drones still evaluate a hull between quarter-sight and the kernel reach).
- **Blind Hunter #2 (PLAUSIBLE, oracle):** the buoy-sweep invariant oracle accepted only afloat hulls while the gate also paints sinking ones (a future false red). → aligned in the same commit.
- **Edge Case Hunter #2 (ruling gap):** a buoy from a previous life serving a respawned owner. → Eric: *"There are NO RESPAWNS for players … No need for any special player consideration whatsoever."* (amendment 4j). No code.
- **Orchestrator (CONFIRMED, from the Edge Case Hunter's duplicate-paint note):** every wire paint was marched from the OWN pose on the client (`radar.ts` `marchEcho`: range falloff and terrain shadow from the own hull), so a buoy paint of a hull behind an island from the owner read as a faint floor speck and a hull near the buoy but far from the owner read faint — the radar buoy's reason to exist, defeated on the client. → **Fix 2**: a self-private `BlipEvent.src` (the owner's own radar-buoy id) on buoy-origin paints; the client marches a `src` paint from that buoy with the buoy's range and drops an unknown `src` (never falls back to the own pose); `src` never appears on an own-sweep paint or reaches a non-owner (invariant tests extended; the SIX stay six). Red-first: three server tests (`radarBuoy.test.ts`), six client tests (`radarEcho.test.ts`: the shadowed-from-owner-clear-from-buoy stamp reads at full strength while the untagged one sits at the floor; priced at the buoy's range — proven to bite by swapping the range; unknown / vanished / malformed `src` dropped; the aground rule), one `roomBindings` test (the frame hands the radar its own radar buoys before its blips); the perception invariant verifies every `src` names a live own radar buoy and byte-matches its expected paint. Fix commit b100a33d.
- **Edge Case Hunter #3/#4 (hygiene):** two legitimate antennas may paint one hull twice in a tick (each now carries its own origin and intensity — left as is); `now = 0` is the "never" sentinel for the two stamps (unreachable in a room; test worlds start past 0).
- **Traced clean by all three:** the trust boundary (`sweep`/`until`/`hp` own-only; buoy paints owner-only, fogged mode, anonymous shape; every sight-tier gate passes `now`; radar rungs undazzled; spectators get no paints); the prediction fold (same factor, same clock basis, `speedBuoyAt` omitted → stamp reset, same order with the slows and draft, the wake ring at +50 %); the tail math at every breakpoint and re-entry mid-ramp; the step order (a buoy soaks its last tick's ordnance, grants nothing after expiry); the homing two-pass law vs the captive mine's locked fish and own buoys; the catalog append order, PV 93, `sanitizeKit` on a `decoyBuoy` kit, `rollKit` over ten.

## Verification

| Check | Result |
|---|---|
| `npm run check` (lint + tsc ×3 + all suites + hook test) | GREEN 2026-10-29 (exit 0; 0 lint errors, 2 pre-existing max-lines warnings; 12 hook tests) |
| shared | 1191 → 1216 (50 files) tests |
| server | 2802 → 2840 (106 files; +38 incl. the gate regressions) tests |
| client | 4075 → 4141 (137 files) tests |
| `matchSmoke` / `weaponsSmoke` first-try | both OK first-try 2026-10-29 after the gate, one at a time on a quiet box (matchSmoke self-booted on 2599: B sunk by A on 4 fish of 112, sinking window held, results dense; weaponsSmoke against a scratch server on 2699: WEAPONS SMOKE OK; both servers killed, both ports free after) |
| goldenFrames | passed unchanged through every wave (the recorded scenario carries no buoy and no flash) |
| Candidate page | approved by Eric 2026-10-28 as rendered (amendment 4k) |

## Residual risks

- At default zoom the chart's kind marks are ~7 px and the owner's two masthead arcs nearly merge (Eric: leave it; judged on staging).
- The ten-line picker ends ~24 px above the 768 fold at 1366×768 (the amendment-3 fold ruling stands).
- A buoy paint that arrives after its buoy left the client's view (expired or sunk between frames) is dropped rather than drawn; a one-frame miss at most.
- `drones.avoidHulls` and `how-to-play/copy.ts` were the only two places that still read the retired decoy/flash the old way; How-to-Play is 10.8's.

## Owed to Story 10.8 (not written here — no in-game copy unasked)

- How-to-Play: entries for FLASH SHELLS, RADAR / HEALING / SHIELD / SPEED BUOY; the DECOY BUOY retirement (`copy.ts` :153-160 still lists `smokeScreen`, `chaff`, `dazzleShells` and `decoyBuoy` — a stale table since 9.3/9.4).
- GDD Consumables v3: the DECOY BUOY bullet and the "Radar Buoy — DELETED (R1)" bullet get dated stamps; catalog-v3 R36 / R1; DESIGN.md `consumable-strip` and `loadout-row` rows (ten lines, the marks).
