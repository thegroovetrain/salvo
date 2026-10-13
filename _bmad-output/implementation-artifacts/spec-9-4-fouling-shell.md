---
title: 'Story 9.4: Fouling Shell'
type: 'feature'
created: '2026-10-12'
status: 'done'
final_revision: 'PR #272 open (2026-10-12); code head 5d07e0b8'
baseline_revision: 'c09acdc5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-3-multi-spectral-countermeasure.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** FLASH SHELLS (internal id `dazzleShells`, key `4`) blinds every enemy hull in a one-time 150 u burst for 10 s. Eric (2026-10-11): *"a consumable that can be used to create a region that slows movement, as though anyone in it was hit by a fouling mine … lets call it a replacement as they serve the same purpose... engage/disengage. Yes it does slow you. instead of 'strongest slow wins,' lets stack these as they are different sources."* Escape is too hard because there are too few escape tools (amendment 1(d)); the flash is the engage/disengage seat.

**Approach:** Replace FLASH SHELLS with the FOULING SHELL (id `foulingShell`, key `4`, cap 5). It fires exactly as the flash did (one click-aimed 360° gun-pattern shell to radar range, zero damage, bursts once, hits nothing) and its burst leaves a stationary FOUL ZONE — a 150 u circle that lasts 15 s. Every afloat hull whose OUTLINE touches the circle (the owner, enemies, PvE drones alike) is stamped `fouledUntil = now + 5 s` every tick it is inside, and runs at ×0.75 of both speed caps while the stamp is in the future (so the slow lingers 5 s after leaving). The zone is its own server store and frame channel (`foulZones`, the burn zone's shape and gate), observed like a burn zone. The mine's slow and the shell's slow are two folds of the one shared `slowedKinematics` on both sides, so they multiply; two shell zones never stack. The whole dazzle machinery (`CONFIG.flashShells`, `applyFlash`, `dazzledUntil`, the DAZZLED tell, the `setDazzled` client chain) is deleted. Cycle 180, `0.18.45`, `PROTOCOL_VERSION` 77 → 78.

## Boundaries & Constraints

**Always:**
- **Rulings of record — Eric 2026-10-12 at this spec step (AskUserQuestion; recorded as epic-9 amendments 61–66):** (61) **Numbers as accepted:** `r 150 u`, life `15 s`, factor `0.75` on both caps, linger `5 s` — all four are harness dials. (62) **OUTLINE inside test** (NOT the flash's centre rule): a hull is inside while any part of its outline polygon touches the circle — the gun burst / mine blast rule (`polyInBlast`), so a long hull is caught a half-length earlier and held a half-length longer. (63) **Visible like a BURN ZONE:** owner always, spectator always, any other observer iff the zone's CENTRE is within their radar range (`zoneCircleVisible`, byte-for-byte: no island LOS, no sweep gate); drawn as a circle, never a radar return. Rejected: the mine gate (sight + LOS, never on radar); sighted AND radar-painted. (64) **Same source never stacks:** two overlapping shell zones hold a hull at 0.75, not 0.5625; a later shell or a second zone only extends the clock. Only DIFFERENT sources multiply (shell × mine). Rejected: patches stacking. (65) **Bot rule, both postures:** engaging → fires at the nearest live contact in sight (the flash's rule, "stall the target"); disengaging → fires at the nearest live contact in sight that lies ASTERN of the bot (behind the beam, "pin the chaser"); one row, two cues, no own-zone bookkeeping. (66) **Card copy:** name `FOULING SHELL`; rows `RADIUS 150 U` / `LASTS 15 S` / `SPEED ×0.75` (read from CONFIG; `SPEED ×` not the mine card's ambiguous `SLOW 75%`); hover *"Click to fire. Where it bursts, the water fouls every prop that runs through it, yours included, for 15 s."* — the hover has no home until 9.11 (amendment 36/49) and seeds that entry. (67) **Eric's correction of record:** asked whether the zone slows in "the weapons-safe ready room", Eric: *"There is no ready room, that was deprecated, you are hallucinating."* The code's `damageEnabled` is false in the pre-start phases (`waiting` / `gathering` / `countdown`, the practice water) and in dev sandbox rooms; "ready room" is stale comment vocabulary. Implementer READING, not a ruling (Eric may veto on staging): the zone's slow is gated on `damageEnabled` exactly like the fouling MINE's slow and the flash were — the shell flies and the circle draws, nobody is slowed while damage is off. Any new comment uses "pre-start phases", never "ready room". (68) **THE ZONE READS AS ITS OWN KIND AT A GLANCE.** Eric 2026-10-12, mid-spec, verbatim: *"I should be able to visually tell what kind of zone it is. The same way the phosphor zone glows a bit and has a big red dot."* The foul zone keeps the zone family's firer-hue glow ring (whose it is) and carries a DISTINCT inside treatment of its own that no other zone uses (the burn zone's breathing red ember is the model, not the look); the visual-gate candidates are judged on that distinctness beside a lit zone and a burn zone, and the pick is recorded as the glyph/zone ruling.
- **CONFIG** (`shared/src/constants.ts`): NEW `CONFIG.foulingShell = { arc: 'full', hits: HITS_HULL_DECOY, shellSpeed: 500, shellRadius: 2, radius: 150, durationMs: 15000, slowFactor: 0.75, lingerMs: 5000 }` replaces `CONFIG.flashShells` (deleted whole). `CONFIG.foulingMines` untouched. Harness `--set` / `--tune` family `foulingShell.` in, nothing out (there was no `flashShells.` family). Doc block cites amendments 61–68.
- **Ids:** `foulingShell` replaces `dazzleShells` everywhere — `CONSUMABLE_IDS` (`sim/effects.ts`), the catalog slot (`sim/catalog.ts`: `consumable('foulingShell')`, the locked-string comment re-cut — the 9.3 `countermeasure` precedent for a renamed id), `CONSUMABLE_IS_WEAPON.foulingShell = true`, `CONSUMABLE_KEY_ORDER[3] = 'foulingShell'`, `consumableArc` (`sim/arcs.ts`), bot favorites (`ai/profiles.ts` duelist + siege), the tactic registry, `boonCopy` names/rows, `equipmentIcons`, `aimPreview`, `weaponArc` reach (radar range), `roomBindings` fire ids, `audio/tones.ts` fire map. A grep for `dazzleShells|flashShells|dazzl` outside `how-to-play/copy.ts` (frozen until 9.11, amendment 36), test fixtures and dated doc comments returns nothing.
- **Shell & zone (server):** `ballistics.ts` tag `foul?: { radius, durationMs }` replaces `flash?`; `consumables/foulingShell.ts` (rename of `dazzleShells.ts`) builds the shell exactly as the flash did with `CONFIG.foulingShell` and the `foul` tag; `applyStopTags`: `if (shell.foul) this.spawnFoulZone(shell, at)` — the burst point OR the interception stop point (a hull or decoy stopping it en route spawns the zone there, no damage, `hc` by the standing ordnance rule — amendment 137's flash reading carried over; a burst that resolves nobody still emits `sp`). `World.foulZones: Map<string, FoulZone>` (`{ id, ownerId, x, y, r, until }`, ids `fz${n}`, its own seq), `resetForMatchStart` clears it (the burn-zone precedent), `/metrics` gains nothing. NEW STEP_ORDER row `applyFoulZones` seated immediately AFTER `applyZoneEffects` (post-move outlines, before the readers next tick) and `expireFoulZones` immediately AFTER `expireBurnZones`; the `stepOrder` identity test re-pins knowingly. `applyFoulZones`: `if (!damageEnabled) return;` then for every AFLOAT ship and every live zone, `polyInBlast(zone, zone.r, hullPoly)` (export `polyInBlast` from `shared/src/sim/shell.ts`; the hull polygon from the same source `hitTargets(['hull'])` uses) → `ship.fouledUntil = now + CONFIG.foulingShell.lingerMs`. NO owner exclusion, drones included, sinking hulls excluded. `ShipRecord.fouledUntil` (0 at every life boundary where `slowedUntil` resets: addShip / sink / founder / respawn / redeploy / match start); `dazzledUntil` DELETED with `applyFlash`.
- **The fold (both sides, byte-identical):** `tickKinematics` = `boostedKinematics → slowedKinematics(mine: ship.slowFactor, now < slowedUntil) → slowedKinematics(shell: CONFIG.foulingShell.slowFactor, now < fouledUntil) → draftedKinematics → hookKinematics`; `sim/slow.ts` header re-cut to the five-stage order. Two calls of the ONE shared function, never a new fold; the shell's factor is the CONFIG constant (a consumable has no tiers), the mine's rides the wire as today.
- **Wire (PV 78):** `OwnShip.fouledUntil?: number` (victim-private, omitted when not in the future — the `slowedUntil` conditional-spread idiom in `frames.toOwnShip`) replaces `OwnShip.dazzledUntil?`; `FrameMsg.foulZones?: FoulZoneView[]` (`{ id, x, y, r, until, by }`, KEY ORDER load-bearing, the burn zone's shape — `r` rides so the client stays dumb; omitted when empty via `optionalChannels`). Registry pseudo-row `foulzone` (`SignalSpec<FoulZone, FoulZoneView>`, `visible: zoneCircleVisible`, materialize the six keys) beside `burnzone`; `SignalContextBase.foulZones`, `PerceptionView.foulZones`, perception scan. The SIX exceptions untouched. `sightOf(me)` loses its dazzle; `effectiveSight(stats)` STAYS as the one derivation hub (returns `stats.sightRange`; the `dazzled` parameter and the flash branch deleted) so the fog hole, radar dim, projectile cull and prediction keep one entry point.
- **Client:** `render/foulZones.ts` on the `burnZones.ts` pattern (`reconcileLitZones`, `litZoneFade`, `drawZoneGlow` in the firer's hue) in the same fog-immune chart layer, with its OWN inside treatment (candidates rendered to an artifact and picked by Eric BEFORE the client wave commits — the show-visual-proposals rule; label only the chart surface); `state.net.foulZones`, `roomBindings` channel + fire-id rename, `main.ts` construct/render; `victimWindows`: `slowedMsLeft = windowLeft(max(slowedUntil, fouledUntil))` (the SLOWED tell now covers both — no new copy), `dazzledMsLeft`, the DAZZLED tell row, `updateDazzle`, `dazzleActive`, `Fog/Radar/Projectiles.setDazzled` + `isDazzled` + the `dazzled` flags, `roomBindings.dazzled` + the `dazzled` cue, `tones.ts` `dazzled` spec, `twinMap.ts` `dazzled` row all DELETED; `fogHoleRadiusU(ranges)` one-arg; `CLIENT_CONFIG` dazzle glare knobs deleted if any survive (`config.ts:2332` note). `sim/prediction.ts`: `authFouledUntil` adopted from `you.fouledUntil` beside `authSlowedUntil` (authoritative-only, same gate shape `t < fouledUntil`), second fold in `tickKin`, cleared on hard re-init. Card glyph in `equipmentIcons.ts` (Eric's pick from candidates; the struck-through eye deleted), `boonCopy.ts` per (66), `aimPreview.ts` `foulingShellPreview` (the flash's parallelVolley in the EFFECT register). How-to-Play copy and Settings UNTOUCHED (amendment 36).
- **Bots:** `foulingShellTactic` (`ai/consumables.ts`): kind `shot`, reach `stats.radarRange`, `want` = afloat ∧ ((posture `engage` ∧ nearestLiveInSight ≠ null) ∨ (posture `disengage` ∧ nearest live contact in sight ASTERN ≠ null)), `solve` = `burstOnLiveContact` on that target; `CONSUMABLE_TACTICS` / `CONSUMABLE_APPETITE` keys renamed (total record — the compiler enforces it).
- **Tests assert contracts, never pins of vocabulary, ring sizes or copy strings:** shared — the two-fold composition (mine × shell multiply; shell alone 0.75; two shells 0.75), `polyInBlast` export, catalog/effects/loadout ids; server — `foulingShell.test.ts` (zone spawns at the burst point and at an interception stop point; owner, enemy and drone outlines inside are stamped; an outline touching the rim counts while the centre is outside; the stamp refreshes every tick inside and lapses `lingerMs` after leaving; a second zone or shell extends but never deepens; shell × mine multiply through `tickKinematics`; `damageEnabled` false → no stamp; expiry; match-start reset; every life-boundary reset), the `foulZones` channel suite as the `burnZones` suite's twin (gate pins at radar range ± ε, spectator, owner, key order), the perception fuzz oracle arm for the `foulzone` row (gate re-derived independently) with a non-vacuity ledger, `stepOrder` re-pin, goldenFrames: the `dazzled-victim-private` scenario deleted and the snapshot re-recorded ONLY if the diff is the retired field / scenario (note the diff in this spec); client — `foulZones` renderer reconcile + fade contract, prediction two-fold (a frame with `fouledUntil` slows at 0.75; with both windows multiplies; omitted = not fouled; hard re-init drops it), `boonCopy` rows read CONFIG, bindings channel, the SLOWED tell reads the later of the two windows, every dazzle test deleted.
- `VERSION` / root `package.json` / lockfile `0.18.45`; `CHANGELOG.md` entry (the 0.18.39 shape); both trackers one line each; `epics.md` 9.4 dated stamp; `DESIGN.md` consumable-strip row only if a line becomes false; amendments 61–68 (+ implementer readings) in BOTH homes (`epic-9-context-amendments.md` and the `## Ratified Amendments` tail of `epic-9-context.md`); `deferred-work.md` gets review defers only. Complexity ≤ 10; American spelling; no `Math.random` in sim; `applyDamage` untouched; no friendly-fire exception (a slow is not damage — Eric).

**Block If:**
- A seventh perception exception seems needed, or the invariant suite cannot stay green without widening it.
- Eric's glyph / on-water pick is pending and the client wave would have to commit without it.
- Any gap in the rulings above surfaces at review — it is an AskUserQuestion before the PR, never a ledger entry.

**Never:**
- No tiers, no reload, no damage, no reveal, no radar return for the zone (ruling 63), no centre test (ruling 62), no "strongest slow wins" between sources, no multiplying of same-source zones (ruling 64).
- Never fork the fold per side; never re-derive the shell's factor from anything but `CONFIG.foulingShell.slowFactor`; never add per-ship spatial fields to the schema; never send `ownerId`-derived build data on a zone row beyond `by`.
- No in-game explanatory copy, no How-to-Play / Settings edits (9.11), no ring-size or copy pins, no word-police tests, no batch sims.
- Do not merge the PR (the run ends at the open PR).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Burst | shell with `foul` tag reaches its click | `foulZones` gains `{fz1, owner, x, y, r 150, until now+15000}`; burst emits `sp` to the firer, no `dmg`, no `hc` (no victim) | — |
| Interception | enemy hull or decoy stops the shell en route | zone spawns at the stop point; 0 damage; `hc` emitted by the standing ordnance rule | — |
| Outline in | enemy hull centre 160 u from centre, bow 10 u inside the rim | stamped `fouledUntil = now + 5000` this tick; caps ×0.75 next `stepShips` | — |
| Owner in | firer sails into its own zone | stamped exactly like an enemy (Eric: it slows you) | — |
| Drone in | PvE fleet hull inside | stamped (a drone is a ship) | — |
| Sinking in | hull `sinking` inside | not stamped (afloat only) | — |
| Leave | hull leaves at t0 | `fouledUntil` stays t0 + 5000; slow ends then | — |
| Zone expires with hull inside | `until` passes at t1 | last stamp at t1 − dt; slow ends ≈ t1 + 5000 | — |
| Two zones / second shell | hull inside two overlapping zones | factor 0.75 once; stamp = now + 5000 (never deeper, never longer than one linger) | — |
| Shell × mine | hull fouled by a tier-V mine (0.55) inside a zone | caps × 0.55 × 0.75 = 0.4125; when the mine window lapses, 0.75 remains | — |
| Damage off | pre-start phase, `damageEnabled` false | zone spawns, draws, stamps nobody | — |
| Visibility | observer 659 u / 661 u from centre, not owner | row delivered / not delivered; owner and spectator always | — |
| Match start | zones left from the practice water | cleared in `resetForMatchStart`; every `fouledUntil` reset to 0 | — |
| Wire | `fouledUntil` in the past / not set | key OMITTED on `you` (never 0, never undefined) | — |
| Bot engage | posture `engage`, live contact in sight | fires one copy at it (burstOnLiveContact, radar reach) | — |
| Bot disengage | posture `disengage`, nearest live contact in sight astern | fires at that contact; none astern → no press | — |
| Harness | `--tune foulingShell.radius=0` | accepted (a zone of radius 0 touches nothing) — not a floor leaf | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1770-1797` -- `CONFIG.flashShells` + doc → `CONFIG.foulingShell` (amendments 61–67); `HITS_HULL_DECOY` reused
- `shared/src/sim/slow.ts` -- header: five-stage pinned order; function unchanged (called twice)
- `shared/src/sim/sight.ts` -- `effectiveSight(stats)` one-arg hub; flash doc deleted
- `shared/src/sim/shell.ts:356` -- export `polyInBlast`; `sim/catalog.ts:165-169,594-598`, `sim/effects.ts:53-70`, `sim/loadout.ts:177-181,293-299`, `sim/arcs.ts:85-91` -- id rename, key slot 4
- `shared/src/types.ts:523-546,1345,1375-1390,1509-1516` -- `OwnShip.fouledUntil?` replaces `dazzledUntil?`; `FoulZoneView` beside `BurnZoneView`; `FrameMsg.foulZones?`; `shared/src/index.ts:826` PV 78 + history line + barrel exports
- `server/src/game/equipment/ballistics.ts:85-93` -- `foul?` tag replaces `flash?`; `equipment/consumables/dazzleShells.ts` → `foulingShell.ts`; `equipment/consumables.ts`, `equipment/index.ts` registry rows
- `server/src/game/world.ts:201,296,324-335,769-827,1175-1177,1264,1361,1819,2027-2048,2148-2150,2293,2357-2359,3215-3330,3676-3700,5178-5250,5350-5356,6035-6037,6226-6228` -- `FoulZone`, store, seq, record field, resets, STEP_ORDER rows, the two-fold `tickKinematics`, `spawnFoulZone` / `applyFoulZones` / `expireFoulZones`, `applyFlash` deleted
- `server/src/game/signals.ts:130-133,252-267,644-734,2062-2090` -- `SignalContextBase.foulZones`, `sightOf(me)`, `foulZoneSignal` on `zoneCircleVisible`, registry key `foulzone`; `perception.ts` (burnZones twin lines), `frames.ts:110-146,228-276` -- `fouledUntil` spread, `foulZones` optional channel
- `server/src/game/ai/consumables.ts:160-215`, `ai/profiles.ts:201,245`, `ai/tacticKit.ts` (an astern-filtered nearest helper if none exists) -- the tactic + favorites
- `server/scripts/batchsim/overrides.ts:81-84` -- family `foulingShell.`
- `client/src/render/burnZones.ts` (pattern) → NEW `render/foulZones.ts`; `client/src/state.ts`, `net/roomBindings.ts:370-371,580,837-862,1524-1556`, `main.ts:788-839,3112,4016-4063,4316-4322` -- channel, tell, dazzle chain deleted
- `client/src/render/{fog,radar,projectiles,textures,radarDim,wake}.ts` -- `setDazzled`/`isDazzled`/`dazzled` deleted; `fogHoleRadiusU(ranges)`; `render/aimPreview.ts:466-480,612,640`, `render/weaponArc.ts:127,196`, `render/equipmentIcons.ts:49,350-370,418`, `ui/boonCopy.ts:148-150,963-1000`, `audio/tones.ts:38,162-166,391-433`, `audio/twinMap.ts:52`, `config.ts:2288,2332` -- renames, glyph, copy, cues
- `client/src/sim/prediction.ts:20-34,128-140,202-227,392-395,457-465,544-620` -- `authFouledUntil`, second fold
- Tests: shared `__tests__/{slow,sight,shell,arcs,boons,barrel,draw,loadout,catalog,stats,hullRepair,radarRaster,damageGuardrail}.test.ts`; server `__tests__/{weapons→foulingShell(new),perception,signals,frames,goldenFrames,stepOrder,doctrines,equipment,botTactics,botPolicy,hitTargets,draft,sinkingWindow,foghorn,spectator}.test.ts`, `scripts/batchsim/__tests__/batchSim.test.ts`; client `__tests__/{burnZones→foulZones(new),prediction,fog,radarEcho,projectiles,roomBindings,hud,hotbar,aimPreview,weaponArc,boonCopy,cardStatRows,slotTooltip,refitTooltipFit,refitCardFit,tones,wake,dimMaskLifetime,hullOverRadar,nameplatesAboveTerrain,fitCheck,upgradeMenu,weaponTables,ownFire,mines,litZones}.test.ts`
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md,deferred-work.md}`, `_bmad-output/planning-artifacts/epics.md` (9.4 stamp), `DESIGN.md` (only if false)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [x] `shared/src/constants.ts`, `sim/{slow,sight,shell,catalog,effects,loadout,arcs}.ts`, `types.ts`, `index.ts` -- CONFIG block, id rename, `polyInBlast` export, one-arg `effectiveSight`, wire shapes, PV 78 -- the one source both sides run
- [x] `shared/src/__tests__/*` -- two-fold composition contract, id/key re-bases, dazzle tests deleted; `npm test -w shared`, `npm run build -w shared`

**Visual gate (orchestrator, after wave 1, before the client wave commits):**
- [x] Artifact: three card-glyph candidates + three on-water zone treatments (firer-hue ring, each with a distinct inside look) rendered from the real icon/zone code BESIDE a lit zone and a burn zone so distinctness is judged (ruling 68); Eric's pick via AskUserQuestion (recorded as the glyph/zone ruling)

**Execution (wave 2 — server Fable and client Opus in parallel, shared frozen):**
- [x] `server/src/game/{world,signals,perception,frames}.ts`, `equipment/*`, `ai/*`, batchsim family -- zone store + STEP_ORDER rows, outline stamp, two-fold kinematics, `foulzone` row, `fouledUntil` on `you`, flash machinery deleted, bot row -- six exceptions untouched
- [x] `server/src/__tests__/*` -- `foulingShell.test.ts` (every matrix row), channel twin suite, oracle arm + ledger, stepOrder re-pin, goldenFrames (re-record ONLY for the retired scenario/field; note the diff here); `npm test -w server`
- [x] `client/src/render/foulZones.ts`, `sim/prediction.ts`, `state.ts`, `net/roomBindings.ts`, `main.ts`, `render/{fog,radar,projectiles,textures,radarDim,wake,aimPreview,weaponArc,equipmentIcons}.ts`, `ui/boonCopy.ts`, `audio/{tones,twinMap}.ts`, `config.ts` -- renderer, second fold, tell, dazzle chain deleted, glyph, copy
- [x] `client/src/__tests__/*` -- renderer contract, prediction two-fold, tell, bindings, copy rows from CONFIG, dazzle tests deleted; `npm test -w client`

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; triage per the orchestrate skill; regression tests that fail without each patch.

**Execution (wave 3 — record, Sonnet):**
- [x] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md`, both trackers, amendments 61–68 (+ readings) in BOTH homes, `deferred-work.md` (review defers only), `DESIGN.md` if false -- 0.18.45 / cycle 180 / PV 78
- [x] `npm run check` green; results recorded under Verification; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given any seeded world in the perception fuzz, when `observe()` runs for every observer, then every delivered `foulZones` row passes the independent zone-gate oracle, the ledger is positive, no observer beyond radar range of a centre receives it, and the exception count is six.
- Given a fouling shell bursting between an enemy hull whose bow touches the rim and the firer standing inside, when the next tick steps, then both hulls' caps read ×0.75 of their boosted caps, a second shell on the same spot changes neither factor, and the stamp of each lapses 5 s after its outline leaves.
- Given a hull fouled by a tier-V mine standing in a zone, then its caps read ×(0.55 × 0.75) on the server and in a client replay fed the same `you` fields, and ×0.75 once the mine window lapses.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 78; `CONSUMABLE_IDS` has `foulingShell` and no `dazzleShells`; `grep -rn "dazzl\|flashShells\|applyFlash" shared/src server/src client/src --include=*.ts | grep -v __tests__ | grep -v how-to-play/copy.ts` returns only dated doc comments.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol cross-check on the same diff c09acdc5..387f2bf9)
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 0, low 1)
- defer: 1: (high 0, medium 0, low 1)
- reject: 10: (high 0, medium 0, low 10)
- addressed_findings:
  - `[low]` `[patch]` Edge Case Hunter (CONFIRMED): the harness family comment and this spec's matrix row claimed a `--tune foulingShell.radius=0` zone "touches nothing"; `polyInBlast` is a distance test that returns 0 when the centre lies INSIDE the hull polygon, so an r-0 zone still stamps a hull whose outline covers the burst point → the `overrides.ts` comment re-cut to say so, plus the sub-tick linger and the >1 factor readings. The matrix row inside the intent contract is read-only and stays as written; THIS entry is the correction of record: "a radius-0 zone stamps only a hull covering the centre point".
- deferred (ledger): the `--tune foulingShell.*` surface accepts `lingerMs` ≤ the 50 ms tick (an arm that slows nobody while reading normal — the stamp is read next tick) and `slowFactor` > 1 (a speed-up zone) or 0 (a stop zone); `foulingMines.slowFactor` has the identical gap today (Edge Case Hunter CONFIRMED / PLAUSIBLE; pre-existing shape of the floor set).
- rejected: the root version still reads 0.18.44 and no CHANGELOG / tracker / amendment edits are in the diff (Codex CONFIRMED low; Blind Hunter P4 — the record wave runs after the gate, and amendments 61–69 were already committed in acf003c9); `state.net.foulZones` is written every frame and read by nothing (Blind Hunter P1 — the channel family's mirror shape, left with its "hazard only" comment); the matrix row "zone expires with hull inside → last stamp at t1 − dt" reads loosely — `applyFoulZones` precedes `expireFoulZones`, so the last stamp lands AT the expiry tick, the burn zone's "through its final tick" precedent (Blind Hunter P2 — recorded here, contract unchanged); the uncommitted in-review status line (P3 — committed with this entry); `tickKinematics` reads `CONFIG.foulingShell.slowFactor` directly rather than through `effectiveStats()` (P5 — the consumable law: a consumable has no stats row, the client reads the same constant, PV 78 gates release builds); `want` and `solve` both call `foulingShellTarget` (P6 — deterministic, cost only); a chaser exactly abeam is not astern (P7 — the strict reading of amendment 65's "behind the beam", recorded as reading 70(c)); the zone draws on the fog-immune layer like a burn zone (P8 — ruling 63); `--tune foulingShell.durationMs=0` spawns, stamps and expires in one tick, one linger from a zone no client draws (Edge Case Hunter PLAUSIBLE, harness-only); bot postures other than engage/disengage never fire it (Edge Case Hunter — ruling 65 names exactly two).
- agreement picture: all three reviewers independently returned BUILD-ON-IT with no production-path defect; the Edge Case Hunter alone found the r-0 claim (confirmed by the orchestrator against `pointPolygonDistance`, fixed as a comment); Codex alone raised the version stamp (the record wave's); the Blind Hunter traced all six seeded suspicions clean (prediction parity, post-move memo, sunk-this-tick invalidation via `targetsGen`, no leak of `fouledUntil` outside `you`, no surviving string-keyed dazzle plumbing, the golden re-record moving exactly the retired field, the id rename and the debuff scenario's un-collapsed sight).

## Design Notes

- **Why two calls of one fold, not a list:** `slowedKinematics` is the shared fold both sides already pin; calling it once per source keeps the composition order explicit (boost → mine → shell → draft → hooks) and makes "different sources multiply, same source never" true by construction — the shell has exactly one stamp per hull, so two zones cannot multiply.
- **Why the shell's slow is authoritative-only on the client** (the mine's contract, not a geometric mirror of the zone): the server stamps `fouledUntil` the tick an outline is inside and the client adopts it from `you` with the usual one-frame reconcile, exactly as the mine slow has always worked; predicting the slow from the zone circle would need the client to run the outline test on a predicted pose against a channel that is gated by radar range, and the two could disagree at the rim. The epic AC's "the predictor mirrors the region" is read as "the predictor mirrors the region's slow".
- **Why `r` rides the wire although it is a constant:** the burn zone's shape byte-for-byte lets the client reuse the zone renderer and keeps a future tiered variant from being a wire change.
- **Why the SLOWED tell reads the later of two windows:** no new copy (the no-unasked-copy rule); a captain who is slowed is told so, whatever the source.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean (before server/client tests)
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green; counts recorded in CHANGELOG -- RESULT 2026-10-12: green — shared 41 files / 1033 tests, server 89 / 2482, client 127 / 3955, lint 0 errors (2 pre-existing max-lines warnings), hook test 266 passed
- `grep -rn "dazzl\|flashShells\|applyFlash\|dazzleShells" shared/src server/src client/src --include=*.ts | grep -v __tests__` -- expected: no hits outside `how-to-play/copy.ts` and dated doc comments

**Manual checks:**
- Eric picks the card glyph and the on-water treatment on the artifact before the client wave commits; the live zone is judged on staging after the PR.

## Auto Run Result

Status: done — PR #272 open to `development` (never merged by the agent; Eric judges the zone on staging).

**Implemented:** FLASH SHELLS replaced by the FOULING SHELL on key `4` (cap 5): the same click-aimed, zero-damage, burst-once shell, whose burst leaves a stationary FOUL ZONE (`CONFIG.foulingShell`: r 150 u, 15 s, ×0.75 both caps, 5 s linger — Eric's numbers as accepted, amendment 61). `World.foulZones` + STEP_ORDER rows `applyFoulZones` (after `applyZoneEffects`: every afloat hull whose OUTLINE touches a zone — `polyInBlast` over the post-move `hitTargets(['hull'])` memo, owner and drones included, gated on `damageEnabled` — is stamped `fouledUntil = now + lingerMs`; amendment 62) and `expireFoulZones`; `tickKinematics` folds the slow as the SECOND call of the one shared `slowedKinematics` (boost → mine slow → shell slow → draft → hooks), so shell × mine multiply and two zones never stack (amendment 64); the `foulzone` signal row delivers `{id,x,y,r,until,by}` on the burn zone's gate (owner always, spectator always, otherwise centre within radar range — amendment 63); `OwnShip.fouledUntil` (victim-private) replaces `dazzledUntil`; the client predictor adopts it and folds the identical second slow; the client draws the zone as "murk and net" in the firer's hue inside the family ring (Eric's pick, amendment 69) with the fouled-prop card glyph (candidate A), card FOULING SHELL with rows from CONFIG (amendment 66); bots fire while engaging at the nearest live contact in sight and while disengaging at the nearest astern (amendment 65); the whole dazzle machinery (`CONFIG.flashShells`, `applyFlash`, `dazzledUntil`, the DAZZLED tell and sting, the `setDazzled` chain, `effectiveSight`'s second argument) is deleted; the SLOWED tell covers both slows. `PROTOCOL_VERSION` 78; version 0.18.45 (cycle 180); epic-9 amendments 61–70.

**Files:** shared `constants.ts`, `sim/{slow,sight,shell,catalog,effects,loadout,arcs,boost,draft,hooks}.ts`, `types.ts`, `index.ts`; server `game/{world,signals,perception,frames,drones}.ts`, `equipment/{ballistics,consumables,index,starShells}.ts` + `consumables/foulingShell.ts` (dazzleShells.ts deleted), `ai/{consumables,tacticKit,profiles,equipment}.ts`, `scripts/batchsim/overrides.ts`; client `render/foulZones.ts` (new), `render/{fog,radar,projectiles,textures,radarDim,radarField,radarHeatmap,wake,litZones,hud,aimPreview,weaponArc,equipmentIcons}.ts`, `sim/{prediction,ownFire}.ts`, `net/roomBindings.ts`, `state.ts`, `main.ts`, `config.ts`, `ui/boonCopy.ts`, `audio/{tones,twinMap}.ts`; tests re-based in all three workspaces with new `foulingShell.test.ts` (server, 18 cases) and `foulZones.test.ts` (client); records (`VERSION`, `package.json` + lock, `CHANGELOG.md`, both trackers, `epics.md`, `DESIGN.md`, amendments 61–70 in both homes, `deferred-work.md`).

**Review:** Blind Hunter (Fable) BUILD-ON-IT, no confirmed defect, six seeded suspicions traced clean; Edge Case Hunter (Fable) BUILD-ON-IT, two harness-surface items; Codex gpt-5.6-sol BUILD-ON-IT, one record-wave item. Patch 1 (the harness family comment's false "radius 0 touches nothing"), deferred 1 (harness tune floors for sub-tick linger / inverted factor, pre-existing shape), rejected 10 (rulings, record-wave work, cost-only notes — all listed in the triage log).

**Follow-up review recommended:** false — the only review-driven change is a comment.

**Verification:** `npm run check` green (shared 1033, server 2482, client 3955 / 127 files, lint 0 errors with 2 pre-existing max-lines warnings, hook test 266); goldenFrames re-recorded for exactly the retired field, the id rename and the debuff scenario's un-collapsed sight (reading 70(k)). No dev server booted; no smokes run (none in scope).

**Residual risks / for Eric on staging:** (1) the murk-and-net look and its knobs (`CLIENT_CONFIG.foulZone`, `colors.foulMurk`); (2) the slow is off in the pre-start phases where damage is off (reading 67 — his veto); (3) a chaser exactly abeam is not "astern" for the bot rule (reading 70(c)); (4) the zone row is delivered through islands at radar range like a burn zone (ruling 63 by construction); (5) How-to-Play still describes FLASH SHELLS until 9.11.

## Session 2 — weed and net (2026-10-12; cycle 181, 0.18.46, PV 78 unchanged; epic-9 amendments 71–72; PR open to `development`, never merged by the agent)

**Trigger:** Eric on 0.18.45 on staging: *"The net is visible but the murk is not. I wanted them combined."* → *"Go back to the previous one. There was one instance with little squiggle lines. I liked that, and wanted that combined with the net. Also, the net itself (and those squiggles) need to be more visible."* Cause: the ocean is the void color (near black); a dark disc cannot darken it. Round 3 (weed + net on the real ocean color, two strengths): Eric picked **bold**, then changed his mind mid-build to **readable** (strength 1).

**Built (client only):** `render/foulZones.ts` — layers slick (faint lighter body, `colors.foulSlick`) → glow → net (bolder) → weed (eight seeded squiggles in `colors.foulWeed`, swaying on a motion-gated integrated phase); `CLIENT_CONFIG.foulZone` knobs renamed/extended (amendment 72); `weedStrokes(id, r)` pure and tested. Also recorded: amendment 71 (the pre-start phases do not matter — reading 67 closed as a question).
