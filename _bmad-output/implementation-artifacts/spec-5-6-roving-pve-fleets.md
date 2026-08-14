---
title: 'Story 5.6: Roving PvE Fleets + the bigger ocean'
status: 'ready-for-dev'
story: 5-6
epic: 5
warnings: [multiple-goals]
---

# Story 5.6 — Roving PvE Fleets, and the ocean grows

**Authority:** every design decision here is ratified in
`_bmad-output/implementation-artifacts/epic-5-context-amendments.md`, **amendments 33-44**
(Eric rulings 2026-08-14). On any conflict, the amendments win and this file is wrong.
Read amendments 33-44 before writing code. Do not re-open a ruling; if one is genuinely
ambiguous mid-flight, report it to the orchestrator rather than deciding it.

## Intent contract

<intent-contract>
Retool drones into armed PvE fleets that rove the ocean in three sizes, defend themselves
when attacked, and pay XP by size — and delete the match-start drone fill entirely. Fleets
spawn in timed waves out of every captain's intel range. Separately, grow the map so each
storm stage forces more movement.
</intent-contract>

## The numbers (all ratified — do not tune)

| | small | medium | large |
|---|---|---|---|
| hp | 60 | 75 | 90 |
| gun damage | 6 | 8 | 10 (flat 5 s cooldown) |
| kill value | ¼ | ⅓ | ½ level |
| maxSpeed | 40 | 35 | 30 |
| aim scatter | 25 u | 15 u | 8 u |

- **One fleet = 2 large + 3 medium + 4 small = exactly 3.000 levels in 9 hulls.**
- **Waves from zone start:** 1:00 → 3 fleets, 5:00 → 2 fleets, 9:00 → 1 fleet. 54 hulls, 18 levels.
- Fleet sight 330 u (`CONFIG.vision.sight`), spread 400 u, memory 3000 ms.
- `CONFIG.map.baseRadius` 2400 → 2800; `zone.beatMs` and `zone.offsetCap` **do not move**.

## Already landed (DONE — do not redo, do not modify)

1. `shared/src/constants.ts` — `map.baseRadius` 2800; `drones.*` retuned (hp, speed, scaled
   accel/decel/reverse, per-hull `gun` override); new `CONFIG.fleet` block; `droneSizeOf`,
   `droneHullOf`, `fleetHullIds`, `fleetLevels` helpers; `HullEnvelope.gun?`.
2. `shared/src/sim/stats.ts` — `baseStats` reads `cls.gun?.damage/reloadMs`, so
   `effectiveStats()` stays the sole derivation path (no hull id param, no post-hoc mutation).
3. `shared/src/sim/loadout.ts` — fleet hulls fit `[gun, empty, empty, empty]`.
4. `shared/src/sim/heightField.ts` — `regionWavelength` tracks `CONFIG.map.baseRadius`.
5. `shared/src/index.ts` — `PROTOCOL_VERSION` 34 → 36 + changelog entry.
6. `shared/src/types.ts` — `Contact.aggro?: true`, optional and trailing.
7. `server/src/game/signals.ts` — `sightOf` exported; new exported `shipSees(me, other, islands, now)`.
8. `server/src/game/drones.ts` — **fully rewritten** as `FleetController`. Read it first.

> **The tree does not compile as handed over.** `world.ts` still imports and calls the old
> `DroneController` API. Re-wiring it is Task A's first job, not a bug to report.

## Ownership seams (parallel agents — do not cross)

| Task | Owns | Must not touch |
|---|---|---|
| **A** | `server/**` (incl. server tests + `server/scripts/**`) | `shared/**`, `client/**` |
| **B** | `client/**` (incl. client tests) | `shared/**`, `server/**` |
| **C** | `shared/src/__tests__/**`, `_bmad-output/**`, `VERSION`, root docs | all source outside shared tests |

If a task needs a `shared/` source change, **report it — do not make it.**

---

## Task A — server (Opus)

### A1. Wire `FleetController`
`world.ts` imports `DroneController`; it is now `FleetController` and `add()` takes
`(id, size, fleetId, offset)`. Keep the `dronesTick` STEP_ORDER row **name and position
unchanged** (row 0, immediately before `applyInputs`) — `stepOrder.test.ts` pins it and the
ordering rationale (fleet inputs must be picked up the same tick) still holds.

### A2. Wave spawning (amendments 33/37)
- New STEP_ORDER row for the wave scheduler. Waves fire on `CONFIG.fleet.waves` measured
  from **zone start**, only while the match is active.
- Placement: pick a fleet **anchor** inside the live ring and **outside every captain's
  `stats.radarRange` disc**; if none, retry next tick up to `CONFIG.fleet.spawnRetryTicks`,
  then fall back to the farthest-from-anyone (max-min) point **and log it**. The wave always
  arrives.
- The 9 hulls (`fleetHullIds()`, largest first) spawn at `anchor + offset`, offsets scattered
  in a disc of `CONFIG.fleet.spreadU`; the SAME offset is passed to `FleetController.add` as
  the hull's formation station.
- **Mandatory:** each spawned hull must `detachWake` semantics respected (a teleport that
  keeps its ribbon draws a bogus cross-map segment) and push its `spawn` event. Confirm the
  `spawn` row's `pointSighted` gate rather than assuming it.
- `spawn.ts` helpers you need (`bestOnCircle`, `islandClearance`) are module-private — export
  them or add a sibling; do not duplicate the island-clearance math.

### A3. Aggro wiring (amendments 35/36)
- `hitShip` calls `FleetController.onDamaged(victimId, byId, fromMine)` when the victim is a
  fleet hull. **A mine hit passes `fromMine: true` and causes no aggro.** You must be able to
  tell mine damage from shell/torpedo damage at that call site — thread it explicitly rather
  than inferring.
- `burstVictims` must exclude fleet hulls when the **shooter is a fleet hull** (fleet ships
  never damage each other). Captain shells still damage fleet hulls normally.

### A4. Kill accounting (amendment 38)
- `creditKill`: a **drone victim no longer increments `killer.kills`**. XP still grants
  (`killXpLevels`), the `sunk` event still fires, the kill flash/settle still happen.
- `kills` and `captainKills` are now identical by construction. **Retire `captainKills`** in
  favour of `kills`, updating `bounty.ts` and its tests — this is a deliberate, reviewed
  simplification, so say so in your report. If retiring it turns out to change bounty
  behaviour in any way, STOP and report instead.
- Telemetry (`rosterSize`/`rosterByClass`/`killsByClass`) **does not move**.

### A5. The self-private `Contact.aggro` (amendment 40)
- In the contact row, set `aggro: true` **only** when the contact is a fleet hull that has
  acquired **the observer receiving this frame** (`FleetController.isTargeting`). Omit the key
  entirely otherwise — including for spectators.
- This needs **no seventh perception exception**; it is an attribute on an already-visible
  contact (the `sinkingUntil` shape). Update `spectator.test.ts`'s exact Contact key-set
  assertion deliberately, and add an oracle test proving a third-party observer never sees it.

### A6. Delete the fill (amendment 41)
- Remove `ArenaRoom.fillToCapacity` + the `match.ts` hook, and **drone `PlayerMeta` roster
  rows** (fleet hulls are not roster members).
- Delete `server/scripts/dronesSmoke.mjs` and the batch-sim `--drones` flag + harness fill.
- `new World(seed, CONFIG.match.fillTo, ...)` → `CONFIG.map.playerCap` (map sizing must stop
  riding the fill constant). Both are 20, so nothing observable moves.
- `CONFIG.match.fillTo` itself is shared — if it becomes unused, **report it, do not delete it.**

### A7. Server tests
Update every suite the above breaks (`drones.test.ts` — rewrite for the new controller,
`match.test.ts`, `regatta.test.ts`, `equipment.test.ts` — its fixture is `droneMedium` and
must move to a real ship class, `bounty.test.ts`, `xp.test.ts`, `spectator.test.ts`,
`perception.test.ts`, `matchTelemetry.test.ts`, `operability.test.ts`, `stepOrder.test.ts`,
`sinkingWindow.test.ts`). **Add new coverage** for: wave timing and exact composition, the
anchor-outside-intel rule and its fallback, one-shot witness propagation (including a hull
that gains LOS later and must NOT join), mine-no-aggro, memory expiry, fleet-on-fleet
no-damage, and the self-private aggro mark.

**Verify:** `npm run lint -w server && npx tsc -p server/tsconfig.json --noEmit && npm test -w server`

---

## Task B — client (Opus)

### B1. Drone detection moves to `Contact.cls` (amendment 39)
Fleet hulls no longer hold roster rows, so the `REGATTA_NO_HUE` (255) sentinel channel is
gone. Re-point onto `Contact.cls` via the existing `isDroneHull()`: `feedColor`,
`rosterColor`, `isDroneId` (`main.ts:1139`), `isLiveRival`/`afloatCount` (`score.ts`), and the
radar `hueFor` adapter (`main.ts:1941`). Nameplates already resolve `DRONE` off the hull and
need no change. A fleet kill-feed line reads **`DRONE`**, never `DRONE-07`.

### B2. PvE kills leave the records, keep the feedback (amendment 38)
Keep: kill flash, progressive settle, kill-feed line, XP. Remove PvE kills from: the KILLS
tally, the **MATCH LOG** (amendment 28), and **SHIPS YOU SANK**.

### B3. The aggro bracket (amendment 40)
- An angular **bracket** around the chevron, driven by `Contact.aggro`.
- **On acquire:** bracket snaps on + one flash + an audio sting.
- **While held:** static. **Not animated** — a pulse would claim photosensitivity budget and
  need Story 4.8 attention-tier arbitration (the argument that kept the kill-leader glow static).
- **On release:** the bracket visibly breaks at the corners and fades (~400 ms) + a distinct,
  softer descending cue.
- Dual-coded by SHAPE (present/absent) because `DESIGN.md:162` puts threat/state on the
  dual-coding floor and drones are locked greyscale — colour alone is not available.
- Respect `motionIntensity()`: at `off`, no flash and no fade animation — snap on, snap off.
  `off` removes motion, never information.
- Read `DESIGN.md` before choosing tokens. Use existing combat-effect/attention grammar; do
  not invent a new colour token.

### B4. Client tests
Update `ships.test.ts`, `nameplates.test.ts`, `killFeed.test.ts`, `score.test.ts`,
`cvd.test.ts`, `worstCaseScene.test.ts`. Add coverage for the bracket's three states and for
motion-off behaviour.

**Verify:** `npm run lint -w client && npx tsc -p client/tsconfig.json --noEmit && npm test -w client`

---

## Task C — shared tests + docs (Sonnet)

### C1. Re-ratify the closing-rate band
`shared/src/__tests__/zone.test.ts:235-247` asserts `0.75 < fraction < 0.85`. At the new
radius the fraction is **≈1.019**. Update the band to bracket ~1.0 and **replace the comment
with amendment 42's reasoning** (a battleship at the worst position runs the whole close beat
at flank speed and just misses safety; it takes a bite of storm rather than dying). Also drop
the now-false `worstEscape <= battleshipMinute` assertion — amendment 42 supersedes it.

### C2. Other shared tests
- `shipClasses.test.ts` — the drone identity table (hp 60/75/90, maxSpeed 40/35/30, scaled
  accel/decel/reverse, unchanged turnRate/steerage).
- `loadout.test.ts:112` — drones now fit `[gun, empty, empty, empty]`.
- `barrel.test.ts` — `CONFIG.xp` key set, `CONFIG.drones.medium.hp` (now 75), new `CONFIG.fleet`.
- **Add** a test asserting `fleetLevels() === 3` exactly (it is exact in IEEE754 — verified)
  and that the composition totals 9 hulls, so a composition edit that breaks the exact-XP
  identity fails the build.
- Any map-radius-dependent shared test.

### C3. Docs and trackers (all in `_bmad-output/` + root)
- **BOTH** `sprint-status.yaml` **and** `gds-workflow-status.yaml` — one line each, status +
  stamp only, never narrative. This is mandatory and has been missed before.
- `deferred-work.md`: a new entry for **AR18's committed batch-sim tuning method losing its
  implementation** when the drone fill was deleted (amendment 41), homed at Epic 6 combat bots.
- `VERSION` + `package.json` — bump the patch (0.17.X, X = landed cycle).
- `DESIGN.md` — add the aggro bracket to the components table; it is a real new component.

**Verify:** `npm test -w shared && npx tsc -p shared/tsconfig.json --noEmit`

---

## Acceptance criteria

**Given** a live match **When** the clock reaches 1:00 / 5:00 / 9:00 **Then** 3 / 2 / 1 fleets
spawn, each exactly 2 large + 3 medium + 4 small, each worth exactly 3 levels, anchored
outside every captain's intel range (or at the max-min fallback, logged).

**Given** a captain shells a fleet ship **When** the hit lands **Then** that ship acquires the
captain, and — evaluated once, at that instant — every other fleet ship with LOS to both and
no target of its own also acquires them; a ship that gains LOS later does not join.

**Given** a fleet ship has acquired me **When** I look at it **Then** its chevron wears the
bracket; **When** it loses me for 3 s **Then** the bracket breaks and fades.

**Given** I sink a fleet ship **Then** I get the flash, the settle, the feed line and the XP,
and it appears in **no** KILLS tally, match log, or SHIPS YOU SANK row.

**Given** the match starts **Then** no drones are present and no drone holds a roster row.

**Given** the storm closes **Then** the worst-case escape is ≈1.019 battleship-minutes and the
match still closes at 12:00.

**Non-functional:** `npm run check` green; complexity ≤ 10; perception invariants hold; the
master invariant still has exactly SIX declared exceptions.
