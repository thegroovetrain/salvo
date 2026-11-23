---
title: 'Mines roll off the stern; weapon select setting PRIME | TOGGLE'
type: 'feature'
created: '2026-11-23'
status: 'in-progress'
baseline_revision: '10b8bc88e7848871812bb16b4895f1cc77d7fd3f'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** Eric 2026-11-23 (`/bmad-dev-auto`, verbatim): *"For mines, realistically speaking, you wouldn't have a targeting area to aim them in, they'd just roll off the rack into the water. … Press E to prime, clicking will drop a mine behind you."* And: *"Lets add an option in settings so that weapons are set to either Toggle or Prime. Prime is the current setting, you press the weapon button and then click to fire, it immediately resets to your main gun. Toggle basically toggles the weapon on, and it doesn't go back to the main gun until the weapon is either out of ammo or the player presses that weapon's button again. Pressing a different weapon switches to that weapon."* Follow-up (AskUserQuestion, same day): a toggled weapon returns to the gun **"When stock hits 0"** — the moment the shot just fired empties its loaded stock (single-round weapons therefore behave like PRIME; only multi-round pools stay toggled).

**Approach:** (1) Mines: the server ignores the click's aim for every mine line and drops the mine at ONE shared pure drop point astern of the hull; the rear wedge, the 150 u leash and their CONFIG keys are deleted; the client draws no wedge/leash for mines, only the existing blast/trigger preview rings at the drop point. (2) A client-only `weaponSelect: 'PRIME' | 'TOGGLE'` setting (default PRIME) gating the existing revert-on-release latch.

## Boundaries & Constraints

**Always:**
- Drop point = ship center − heading-unit × `hullClearOffset(cls.hull.length, CONFIG.mine.hitRadiusU)`, ONE pure function in `shared/src/sim/` (exported via the barrel) used by the server mine row, the client preview, the bots and the smoke. `[reading of record: "roll off the rack" = dead astern, marker just clear of the transom; both racks drop at the same point — racks still alternate as before]`.
- A mine click anywhere on the canvas (any bearing, any distance) drops a mine when one is held and the drop point is open water; `blockedWater` at the drop point still denies `'blocked'`; empty racks still deny `'no-ammo'`. Mines no longer deny `'out-of-arc'`.
- Delete `CONFIG.mine.offset`, `placeHalfArcDeg`, `placeRange` and the mine rear sector (`mineSector` in `shared/src/sim/arcs.ts` and every caller) — no dead config. Bump `PROTOCOL_VERSION` +1 (CONFIG snapshot shape changes; the number is taken at PR time after `git fetch`).
- Bots keep their mine TACTICS unchanged: any distance that was derived from `placeRange` (e.g. `placeRange * MINE_NEAR_MULT` want-ranges, `reachU`) is replaced by a `CONFIG.bots` key holding the same numeric value; a bot's blocked check reads the shared drop point.
- Toggle mode is CLIENT-ONLY: no wire, server or bot change. In TOGGLE, a fireable click reverts to the gun (via the existing release latch, never on press) iff the slot's predicted loaded stock before the shot is ≤ 1 (torpedo: tubes loaded summed over launchers; mines: held over racks; specials: pool). The same key reverts to the gun; a different key switches (both already true). Death, empty-under-stats and every other forced revert stay in both modes. A denied click keeps the selection in both modes.
- PRIME behaves exactly as today. The setting persists in the existing `hullcracker.settings` blob through `sanitizeSettings`/`sameSettings`.
- Complexity ≤ 10; tests assert contracts, never copy strings or bare CONFIG literals.

**Block If:** a change would need a new wire field, server-side selection state, or a new visible HUD element beyond the one settings row.

**Never:** a thrown/flying mine, a placement clamp, per-rack lateral offsets, a mine aim reticle or wedge, a new keybind, a change to the main battery / secondaries / torpedo arcs, changing what Shift/C/V do, a seventh perception exception.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Mine bow click | E primed, click 400 u off the bow | mine at the stern drop point | none |
| Mine stern on rock | drop point on land | `'blocked'` denial, mine kept | denial tone |
| Racks empty | E primed, 0 held | `'no-ammo'` | denial tone |
| TOGGLE 3 naval | 3 held, click ×3 | stays E after 1st and 2nd; reverts to gun on release of 3rd | none |
| TOGGLE 1-round special | R toggled, 1 loaded | reverts on release (same as PRIME) | none |
| TOGGLE reloading | Q toggled, 0 loaded, click | denied, stays Q | denial tone |
| TOGGLE same key / other key | Q toggled, press Q / press E | gun / E | none |
| PRIME | any weapon fireable click | reverts on release (unchanged) | none |

</intent-contract>

## Code Map

- `shared/src/sim/aim.ts` -- `hullClearOffset`; home for `mineDropPoint` (or a new `sim/mineDrop.ts`); export via `shared/src/index.ts`
- `shared/src/constants.ts:1776-1808` -- `CONFIG.mine` placement keys to delete; `CONFIG.bots` gets the moved distance(s)
- `shared/src/sim/arcs.ts:93-120` -- `mineSector`, `arcFor`/`sectorArcFor` mine branch
- `server/src/game/equipment/mines.ts:215-226,447-474` -- `REAR_SECTOR`, `minePlacePoint`, `activate`
- `server/src/game/ai/equipment.ts:105-115,449,525-558`, `ai/tacticKit.ts:300-309` -- bot mine placement/ranges
- `server/scripts/weaponsSmoke.mjs:583-670` -- `astern()`, `DROP_U`, `dropPoint`, `layOne`; phases 2/3/5 need distinct mine positions (sail between drops)
- `client/src/render/weaponArc.ts:90,187,225,395-439`, `render/firing.ts:433-467,690-711`, `render/aimPreview.ts:658-693,940-953`, `client/src/main.ts:3953-3958,4030,4089-4162` -- mine wedge/leash/preview/click gates
- `client/src/main.ts:4276-4344`, `client/src/sim/inputSampler.ts:41-65`, `client/src/input/keyboard.ts` -- prime revert latch
- `client/src/settings/store.ts`, `client/src/ui/settings.ts` -- new setting + choice row (pattern: HUD SIDE)
- `client/src/how-to-play/copy.ts:142` -- NAVAL MINES copy

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/*`, `shared/src/constants.ts`, `shared/src/index.ts` -- add `mineDropPoint`, delete the three keys + mine sector, add `CONFIG.bots` replacement key(s), bump PV; update shared tests (`arcs`, `barrel`) -- one source for the drop
- [ ] `server/src/game/equipment/mines.ts` + server tests (`equipment`, `denials`, `weapons`, `botTactics`, `launchersRacks`, `match`, `botSweep`) -- drop at `mineDropPoint`, no arc/range gate; tests assert "lands at the drop point whatever the aim"
- [ ] `server/src/game/ai/*` -- bots fire the mine slot without a placement aim; ranges from the new bots key
- [ ] `server/scripts/weaponsSmoke.mjs` -- lay at the stern drop point, sailing between drops so mines stay distinct; must pass
- [ ] `client/src/render/{weaponArc,firing,aimPreview}.ts`, `client/src/main.ts` + client tests -- mines: no wedge, no leash, click always "in arc", preview rings at the drop point with the blocked tell
- [ ] `client/src/settings/store.ts`, `client/src/ui/settings.ts`, `client/src/main.ts`/`inputSampler.ts` + tests -- `weaponSelect` setting (label `WEAPON SELECT`, options `PRIME` / `TOGGLE`, a `WEAPONS` section holding only this row, placed immediately before `CONTROLS — REFERENCE ONLY`), TOGGLE revert rule
- [ ] `client/src/how-to-play/copy.ts:142` -- minimal edit: "Click to drop a mine off your stern." replaces "Click behind your ship to drop a mine."
- [ ] `EXPERIENCE.md` Interaction Primitives Q/E/R row -- one appended sentence for the TOGGLE option; mine aim language if present

**Acceptance Criteria:**
- Given any ship class and heading, when a mine click is consumed, then the mine's position equals `mineDropPoint(ship)` regardless of `aim`/`aimDist`.
- Given TOGGLE and a pool of N>1, when the player fires N times, then selection stays on the slot after shots 1..N-1 and returns to the gun on release of shot N.
- Given PRIME, then every existing prime-release test passes unchanged.
- Given a reload of the page, then the chosen weapon select mode persists.

## Spec Change Log

## Review Triage Log

## Design Notes

TOGGLE rule as code shape (in `consumePrimeOnFire`): `if (shouldConsumePrime(...) && (mode === 'PRIME' || loadedBefore <= 1)) armPrimeRevert(g, clickSeq)`. `loadedBefore` comes from the same predicted ammo the click prediction already reads.

## Verification

**Commands:**
- `npm test -w shared && npm test -w server && npm test -w client` -- green
- `npm run lint` -- no errors
- `HC_DEV_OPTIONS=1` weaponsSmoke (see `server/scripts/weaponsSmoke.mjs` header) -- passes first try
- `npm run check` -- green once at the end
