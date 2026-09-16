---
title: 'Story 8.5: Nine Slots'
type: 'feature'
created: '2026-09-16'
status: 'done'
baseline_revision: '7d1dd5b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/implementation-artifacts/spec-8-4-the-damage-gate-and-the-ordnance-collector.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The loadout is four slots with a PER-HULL fit (`specialsFor`: Torpedo Boat `[gun, heavyTorpedo, speedBoost, —]`, Battleship `[gun, broadside, starShells, —]`, Mine Layer `[gun, navalMines, radarBuoy, —]`) and exactly one card-fillable slot (`SLOT_EXTRA`), so every equipment card after the first is a no-op (`deferred-work.md:1988`), the boost is a class privilege, and there is no belt for Story 8.7's consumables to land in.

**Approach:** ONE flat nine-slot array with fixed roles — `['gun','boost','weapon','weapon','weapon','consumable','consumable','consumable','consumable']` — identical for every captain hull at 0:00 (gun + boost fitted, seven empty), with `slotFill` taking the FIRST EMPTY weapon slot; `Shift` becomes slot 1's ability key on the existing boost module; the `ammo` wire array widens to 9 (PV 51 → 52); the hotbar shows nine rows in today's bottom-left column as an interim. Eight Eric rulings (epic-8 amendments 21–28) decide the interim: today's card-backed class weapons are still seeded at spawn AS CARDS until 8.10; the radar buoy goes dark; every hull gets the boost now; drones stay gun-only by the least-work path; the hotbar may clip; empty-slot denial is client-only; digits stay refit-only; How-to-Play is untouched.

## Boundaries & Constraints

**Always:**

- **Eric rulings 2026-09-16 — epic-8 amendments 21–29 (written; re-applied to `epic-8-context.md`).** (21) spawn seed = today's card-backed weapons applied as cards: TB `heavyTorpedo`; BS `broadside`, `starShells`; ML `navalMines`; the deck loses those copies as today. (22) `radarBuoy` unreachable in play; module/config/tests stay. (23) slot 1 = the existing `speedBoost` module on every captain hull at the shipped numbers. (24) fleet drones: gun in slot 0, eight empties, via the spawn's existing fleet branch; no new drone tests/pins. (25) hotbar keeps the 62/14 pitch; clipping on small viewports is accepted. (26) empty-slot key → client denied pulse + tone, nothing sent; start-line lock wins silently. (27) digits `1`–`4` stay refit-only. (28) `client/src/how-to-play/copy.ts` untouched.
- **Orchestrator rulings (Eric's veto list; record them in the Auto Run Result):**
  1. **Shared spine (`shared/src/sim/loadout.ts`):** `SLOT_COUNT = 9`, `SLOT_GUN = 0`, `SLOT_BOOST = 1`, `WEAPON_SLOTS = [2,3,4] as const`, `CONSUMABLE_SLOTS = [5,6,7,8] as const`, `SlotRole = 'gun'|'boost'|'weapon'|'consumable'`, `SLOT_ROLES` the nine-tuple; `SLOT_EXTRA` and `specialsFor` DELETED; `LoadoutSlot`/`EquipmentState` shapes unchanged. `loadoutFor(stats: EffectiveStats, fleet = false): LoadoutSlot[]` — no hull parameter; captains get `gun` + `speedBoost` fitted (full pool, idle timer), seven `{ equipmentId: null, state: null }`; `fleet === true` gives the gun and eight empties. The file header's stale per-hull commentary is rewritten.
  2. **Fill rule (`shared/src/sim/boons.ts` `applySlotEffect`):** a `slotFill` takes the first slot in `WEAPON_SLOTS` whose `equipmentId === null`; no-op (loadout untouched, reference-equal) when the id is already fitted anywhere, when the line is a stub, or when all three weapon slots are full. Only the target slot is written — every other slot's `state` object is the same reference before and after (that IS "fitting a weapon never touches another slot's timer"; pin it by identity). `slotsWithCards(stats, cards, catalog, fleet = false)` replays in fit order over `loadoutFor(stats, fleet)`; server (`respawn`, spawn) and client (`slotIdsFor`) both call it. `stock` stays a no-op (8.7).
  3. **Legal-deck property:** `shared/src/__tests__/loadout.test.ts` (or `boons.test.ts`) generates ≥ 200 random decks that pass `checkDeck` (size 40, ≤ 3 equipment lines, ≤ cap, owned = all lines; stubs INCLUDED as owned lines) and, for each, fits every equipment copy in a random order through `applySlotEffect`: the full-row refusal is never reached and the fitted set equals the deck's non-stub equipment lines. A second pin, `SPAWN_SEED` × `DEFAULT_DECKS`: for each hull, `|seed ∪ drawable (non-stub) equipment lines of its deck| ≤ 3` — a deliberate tripwire that fires when 8.14 un-stubs `missile`/`monitor` on the Battleship unless 8.10 has removed the seed first (ledger it).
  4. **Spawn seed home and mechanism:** `SPAWN_SEED: Readonly<Record<HullId, readonly LineId[]>>` in `shared/src/sim/catalog.ts` beside `DEFAULT_DECKS` (`torpedoBoat: ['heavyTorpedo']`, `battleship: ['broadside','starShells']`, `mineLayer: ['navalMines']`), exported through the barrel, with a comment that 8.10 deletes it. `World.addShip` builds `loadout = slotsWithCards(stats, seed, catalog, fleet)` with `seed = fleet ? [] : SPAWN_SEED[hullId]` and sets `cards = [...seed]`; `spawnDeck`/`carriedLines` take the seed list instead of reading the fitted loadout (`carriedLines(loadout)` is deleted or reduced to the seed passthrough). `redeployShip` rebuilds from the same seed; `respawn` keeps `slotsWithCards(stats, ship.cards, …)`. No `applyCard` call, no event, no toast — the seed is stat-neutral (tier I is the bare weapon) exactly as today's carried seed, and the spawn tests keep pinning that. Deck sizes stay TB 23 / ML 23 / BS 23 drawable (broadside is not in the BS deck, so its seed removes nothing — as today).
  5. **Wire:** `OwnShip.ammo` keeps its NAME (the AC's "slotAmmo" is the server helper `slotAmmo(ship)` in `equipment/index.ts`, which already maps over `ship.loadout` and so becomes length 9 with no edit); its doc comment says length `SLOT_COUNT` (9), slot-aligned, `null` for empties. NO new wire field — the client rebuilds `equipmentId` per slot by replaying `you.cards`. `PROTOCOL_VERSION` 51 → **52** (`shared/src/index.ts`, the changelog comment there, and every test that pins 51). `inputs.ts` widens for free through `SLOT_COUNT` (`isSlotIndex` 0..8); `inputs.test.ts`'s boundary literals move to 9 / 8.
  6. **Server dispatch unchanged:** `consumeClick` / `consumePress` / `sinkingActivationGate` / `queueDenial` / `wireDenialReason` are byte-identical; `'empty-slot'` stays server-internal (amendment 26). Slot 1 on a captain is `speedBoost` (`isWeapon: false`), so `actSlot: 1` reaches `boostEquipment.activate` through the existing ability channel; `boostUntil` keeps its one writer. `fireControl`'s per-slot tick loop is unchanged (empties are skipped; the belt is empty all story). `ShipRecord.loadout`'s doc comment is rewritten for nine slots.
  7. **Bots:** no policy change — `rankedSlots`/`readyShotReaches`/`chooseAct` scan by `equipmentId` (verified). `ai/spending.ts` gets no slot-free check (8.18). Test fixtures that name slots resolve them with the existing `slotOf(ship, id)` helpers or the new constants. `scripts/batchsim/controls.ts` `actSlot: 0` literals → `SLOT_GUN` (semantics unchanged: slot 0 is the gun, inert on the ability channel); `scripts/rl/env.ts` already scans.
  8. **Client keys (`client/src/input/keyboard.ts`):** `SLOT_KEY_CODES` `KeyQ → 2, KeyE → 3, KeyR → 4`; `ShiftLeft`/`ShiftRight` keydown → `activateAbility(SLOT_BOOST)` as a TAP (keydown edge only, `event.repeat` dropped, a held Shift is one press; `Shift+Tab` still reaches Tab — the existing special case stays first). Shift is suspended by the combat lock and the open refit window exactly like Q/E/R (UX-DR42: "Q/E/R/`Shift` are suspended while the refit window is open"). A weapon key on an EMPTY weapon slot (the `isSlotFitted` hook false) calls a NEW `onEmptySlotDenied(slot)` hook → main.ts flashes that slot's denied state + plays the `denied` tone through the existing budgeted path, sends nothing; under `isCombatLocked` the key stays fully silent (lock checked first, as today). Digits: `REFIT_DIGIT_CODES` and `handleDigitKey` untouched (amendment 27; `Digit5 → HEAL_CHOICE` stays until 8.8). The ability FIFO cap stays `SLOT_COUNT` (now 9); ledger `:116`/`:119` are stamped with the re-derivation (nine presses per 50 ms sample; the silent drop at cap remains, still only reachable by mashing).
  9. **Auto-revert on RELEASE:** today `revertToGun()` runs at pointerdown (`main.ts:3437`, `shouldConsumePrime`). The predicate still decides at pointerdown (the fire input is built there, D1 fire-time stamp unchanged) but the revert itself is deferred to the matching pointerup: main.ts latches `primeConsumedOnRelease = true` and `input/mouse.ts` exposes a release edge (or main.ts listens for `pointerup` on the same target) that performs the revert. A denied click still keeps the prime; a key press between down and up wins (the latch is cleared by any prime change). Pinned by a client test: prime → pointerdown → still primed; pointerup → gun.
  10. **Hotbar (`client/src/render/hotbar.ts`, `render/equipmentInfo.ts`):** nine rows in the existing column, order Gun · Shift · Q · E · R · 1 · 2 · 3 · 4 top-to-bottom, geometry untouched (amendment 25 — `hotbarLayout(screenH)` keeps 62/14 and may return a negative `stackTop`; the layout test's "stack foot at `screenH - H.bottom`" pin stays true). `SLOT_KEY_GLYPHS = ['', '⇧', 'Q', 'E', 'R', '1', '2', '3', '4']` — the Shift chip is the 22 px mono chip with the U+21E7 up-arrow glyph (Eric ruling 2026-09-16, amendment 29). Empty state per UX-DR41: 1 px dashed slate `.45` outline + a centred `—` glyph and NO words — `EMPTY_SLOT_LABEL = '— awaiting refit —'` is deleted and `emptySlotModel` yields an empty name/info; belt rows 5–8 render as the same dashed-empty state (no frame yet — 8.6). The gun row stays keyless with its ghost chip; the boost row shows the boost icon (`equipmentIcons.ts` already has `speedBoost` art) with the Shift chip, wearing `readyAbility`/`cooling`/`active` as today's ability grammar does. `interactionLine` reads glyphs by slot; `slotForCard`/`cardEquipmentIds` unchanged. `SlotState`/`slotState()` precedence unchanged. The label-fit test and the `supercavTorpedo` exemption stand.
  11. **Boarding lock:** unchanged — `combatLocked()` dims the whole hotbar to 38 % and swallows every slot key/click (already covers gun, Shift and seven empties); the reveal survivor set is untouched (8.6).
  12. **Golden frames:** `goldenFrames.test.ts.snap` is re-recorded ONCE; every moved line must be one of: `you.ammo` length 4 → 9, the seed-fitted slots moving from index 1/2 to 2/3, `you.cards` now listing the seed lines in `SPAWN_SEED` order where today's carried seed listed them in loadout order (BS: `broadside, starShells` — same order), or the boost pool appearing at index 1 on every hull. Any other moved line HALTS.
  13. **Smokes:** `matchSmoke.mjs` `slot: 1` → `2` (the Torpedo Boat's heavy torpedo is now in Q); `weaponsSmoke.mjs` re-pointed the same way if it fires a class weapon by index; every `slot: 0 / actSlot: 0` literal stays. Run `soloSmoke`, `matchSmoke` (≥ 300 s wall-clock budget, up to 3 attempts — the ledgered pre-existing flake), `weaponsSmoke` on a scratch port.
  14. **Tests to move (never silently deleted):** shared `loadout.test.ts` (rewritten for nine roles, `loadoutFor(stats)` identical across every pickable hull, `fleet` branch, null-iff invariant over nine), `boons.test.ts` (first-empty-weapon fill, full-row no-op, identity of untouched slots, property test), `barrel.test.ts`, `catalog.test.ts` (`SPAWN_SEED` shape), `stats.test.ts`; server `equipment.test.ts` (length 9, empty-slot safety over slots 5–8 and 9 out of range, "empties never ticked" over eight, init parity), `boost.test.ts` (`SLOT_BOOST` imported = 1; a Battleship and a Mine Layer can boost — new cases), `inputs.test.ts`, `frames.test.ts`, `upgrades.test.ts:1722`, every per-file `SLOT_STAR/SLOT_BROADSIDE/SLOT_BUOY/SLOT_MINE_ML/SLOT_TORPEDO` constant (→ the weapon slot the seed lands in, or a `slotOf` lookup; `SLOT_BUOY` tests fit the buoy directly into a weapon slot via the test helper since no card or seed does — amendment 22), `drones.test.ts` (loadout = gun + eight empties), `spawn`/deck tests (seed sizes 23/23/23, the BS broadside removes nothing); client `keyboard.test.ts` (new bindings, Shift tap, empty denial hook, lock precedence), `hotbar.test.ts` (nine rows, glyphs, dashed-empty, no words), `inputSampler.test.ts`, a new release-revert test.
  15. **Version 0.18.4 → 0.18.5** (cycle 140: `VERSION`, root `package.json`, lock), one-line stamps in BOTH trackers, `CHANGELOG.md` in plain words, `deferred-work.md` stamps on `:116`, `:119`, `:1988` (RESOLVED for the slot half) plus one new Story 8.5 section (the 8.14 tripwire, the clipping hotbar, the dark buoy, the Shift glyph).
- Parity: every damage number, reload number and the boost's numbers are byte-identical; the only gameplay changes are the rulings (boost on every hull, the buoy dark, the class weapons in Q/E instead of slots 1/2).
- Shared/server/client split: slot constants, the fill rule, the seed table and the property test live in `shared/`; the server never re-derives the fill; the client never reads `equipmentId` off the wire.
- Process: this worktree only; no dev server in Eric's checkout; kill what you boot; halt on any error; no in-game copy; never touch `CLAUDE.md`; commit and push continuously, ONE PR at the end.

**Block If:**

- A second wire field for slot contents turns out to be needed (the replay cannot rebuild a slot).
- The golden snapshot moves on a line ruling 12 does not explain.
- The legal-deck property fails for any deck that passes `checkDeck` (the fill rule or the deck rule is wrong — Eric decides which).
- Any bot behaviour beyond fixture indices would have to change.
- The release-deferred revert needs a change to the fire-time stamp or the prediction path.

**Never:**

- Build the belt (`stock`, `canStock`, digit firing, the grace), the heal card, the HUD bar geometry, the universal `boost` id / `CONFIG.boost`, delete `speedBoost` or the radar buoy, touch How-to-Play (28), add a wire denial reason (26), add drone tests or drone pins (24).
- Reintroduce a per-hull loadout, `specialsFor`, `SLOT_EXTRA`, or `slotReplace`.
- Let a `slotFill` overwrite a fitted weapon slot, or touch any slot other than its target.
- Apply the spawn seed through `applyCard` (it must not emit events or toasts).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Captain spawn, any hull | `addShip(role 'captain', hullId)` | `loadout[0]` gun full pool, `[1]` `speedBoost` n 1, seed weapons in `[2]`(,`[3]`), rest `null/null`; `cards` = seed; `ammo` length 9 | none |
| Fleet spawn | `addShip(role 'fleet')` | gun in `[0]`, eight empties, `cards []`, `EMPTY_DECK_LIST` | none |
| Third distinct equipment card fitted | TB with heavyTorpedo in Q, lightTorpedo in E, machineGun (stub today: no-op) | fills R when un-stubbed; property test covers the non-stub case | none |
| Duplicate equipment copy | `heavyTorpedo` copy 2 on a hull already holding it | loadout reference-equal (no-op); the ladder tier applies in the stat home | none |
| Shift on a captain, ready | `actSlot 1`, `actSeq n` | `boostUntil = now + 6000`, pool 0, reload 18 s; Battleship and Mine Layer included | none |
| Shift held for 2 s | keydown + OS repeats | ONE press queued | none |
| Q with weapon slot 2 empty (live) | no card fitted in Q | client denied pulse on row 2 + denied tone; no input change; nothing sent | none |
| Q with slot 2 empty at the start line | `combatLocked` | silent (lock wins) | none |
| Prime torpedo, click (fireable), hold | pointerdown | shot fires with the primed slot; prime still shows | none |
| … then release | pointerup | prime reverts to gun | none |
| `1` with the refit window closed | belt empty | nothing (amendment 27) | none |
| `InputMsg.slot = 8` / `= 9` | validation | 8 accepted, 9 drops the message | none |
| Refit offer replay | `you.cards` `[heavyTorpedo, lightTorpedo]` | client rebuilds Q = heavy, E = light, reads `n` from `ammo[2]`, `ammo[3]` | none |

</intent-contract>

## Code Map

- `shared/src/sim/loadout.ts` (175 LOC) -- constants, roles, `loadoutFor(stats, fleet)`; delete `specialsFor`/`SLOT_EXTRA`; header rewrite
- `shared/src/sim/boons.ts:220-273` -- `applySlotEffect` first-empty-weapon fill; `slotsWithCards(stats, cards, catalog, fleet)`
- `shared/src/sim/catalog.ts:700-715` -- `SPAWN_SEED` beside `DEFAULT_DECKS`; `shared/src/index.ts:578` -- PV 52 + barrel export
- `shared/src/types.ts:357-372` -- `OwnShip.ammo` doc (length 9); `:247,274` input-range docs
- `server/src/game/world.ts` -- `addShip :1442-1524`, `spawnDeck :1645`, `carriedLines :1663` (seed-driven), `redeployShip :1751-1841`, `respawn :~5169`, `ShipRecord.loadout` doc `:769`; dispatch `:4418-4622` untouched
- `server/src/game/equipment/index.ts:187` -- `slotAmmo` (no edit; doc); `boost.ts` untouched; `drones.ts:17,337,479` -- comments/`SLOT_GUN`
- `server/src/game/inputs.ts:62` -- no edit (reads `SLOT_COUNT`)
- `server/scripts/matchSmoke.mjs:234-360`, `weaponsSmoke.mjs`, `scripts/batchsim/controls.ts:414,432`
- `client/src/input/keyboard.ts:80-103,163,239,336-403,491-556` -- bindings, Shift tap, empty-denial hook, FIFO cap; `client/src/main.ts:634-641 (slotIdsFor), 1617, 2192-2249, 3106, 3437` -- replay signature, lock, denial wiring, release revert; `client/src/input/mouse.ts` -- release edge
- `client/src/render/hotbar.ts:44,73,116-131,328-333,620-644,1310-1353` -- nine rows, empty state, glyphs; `client/src/render/equipmentInfo.ts:31,101-107`; `client/src/render/hud.ts`, `weaponArc.ts` -- `loadoutFor` call sites
- Tests: see ruling 14; snapshot `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap`
- Docs: `VERSION`, `package.json`, lock, `CHANGELOG.md`, both trackers, `deferred-work.md`, `epic-8-context.md` + amendments (21–28 written), this spec

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/loadout.ts` + `boons.ts` + `catalog.ts` + `index.ts` + `types.ts` -- nine-slot spine, first-empty fill, `SPAWN_SEED`, PV 52 -- `npm run build -w shared`
- [x] `shared/src/__tests__/{loadout,boons,catalog,barrel,stats}.test.ts` -- rewrites + the legal-deck property + the seed tripwire -- `npm test -w shared`
- [x] `server/src/game/world.ts` + `drones.ts` + `equipment/index.ts` docs -- seed-driven spawn/redeploy, fleet branch, doc rewrites -- server build
- [x] `server/src/__tests__/*` (ruling 14) + golden snapshot re-record -- every moved line explained -- `npm test -w server`
- [x] `server/scripts/{matchSmoke,weaponsSmoke}.mjs` + `scripts/batchsim/controls.ts` -- slot literals -- smokes pass
- [x] `client/src/input/keyboard.ts` + `main.ts` + `input/mouse.ts` -- Q/E/R → 2/3/4, Shift tap, empty denial, release revert -- `keyboard.test.ts` + new revert test
- [x] `client/src/render/{hotbar,equipmentInfo,hud,weaponArc}.ts` -- nine rows, `⇧` chip, dashed-empty no words, replay signature -- `hotbar.test.ts`
- [x] `client/src/__tests__/*` -- bindings, hotbar, PV pins -- `npm test -w client`
- [x] `VERSION`/`package.json`/lock/`CHANGELOG.md`/both trackers/`deferred-work.md` -- cycle 140, 0.18.5, PV 52, amendments 21–28, stamps `:116 :119 :1988` + new section -- tracker discipline
- [x] `npm run check` green; `soloSmoke`, `matchSmoke`, `weaponsSmoke` on a scratch port -- the gate

**Acceptance Criteria:**
- Given any captain hull, when spawned, then its loadout is gun · speedBoost · seed weapon(s) · empties to nine, identical in shape across hulls, and `ammo` is length 9.
- Given a fleet hull, when spawned, then only slot 0 is fitted.
- Given a legal deck (random, ≥ 200 samples), when every equipment copy is fitted in any order, then no fill is refused and no non-target slot's state object changes identity.
- Given a Battleship or Mine Layer, when `actSlot 1` is pressed, then it boosts with the Torpedo Boat's numbers.
- Given an empty weapon slot, when its key is pressed live, then the client shows the denied pulse and tone and sends nothing; at the start line it is silent.
- Given a primed weapon and a fireable click, then the prime survives pointerdown and reverts on pointerup.
- Given the hotbar, then nine rows render Gun · ⇧ · Q · E · R · 1–4 with dashed `—` empties and no "awaiting refit" text.
- Given `npm run check`, then lint, tsc ×3 and every test pass; PV is 52; golden frames moved only on explained lines.

## Spec Change Log

## Auto Run Result

**Status:** done (2026-09-16, build cycle **140**, version **0.18.5**, PV 51 → **52**).

**Summary:** The loadout is ONE flat nine-slot array with fixed roles — gun · Shift boost · Q/E/R weapon slots · 1–4 belt — identical for every captain hull at 0:00 (`loadoutFor(stats, fleet)`; `specialsFor`/`SLOT_EXTRA` deleted); a `slotFill` takes the FIRST EMPTY weapon slot and touches no other slot's state object (pinned by identity); a legal deck can never overflow the row (250 random legal decks, property-tested). Until Story 8.10's countdown offer, a hull spawns with today's card-backed class weapons replayed AS CARDS from `SPAWN_SEED` (TB heavy torpedo in Q; BS broadside in Q, star shells in E; ML naval mines in Q) through the same `slotsWithCards` the client replays, so the deck loses those copies exactly as before (23/23/23 drawable) and no event or toast fires. Every captain hull now carries the boost in slot 1 at the shipped `speedBoost` numbers; fleet drones hold the gun and eight empties through the spawn's existing fleet branch. The wire `ammo` array is nine long (PV 52); no new wire field, no new denial reason, no seventh anti-cheat exception. Client: Q/E/R → slots 2/3/4, Shift (either code) is a tap on slot 1 through the existing ability FIFO, a weapon key or click on an EMPTY weapon slot flashes the client denial and sends nothing (belt rows silent, amendment 30), the prime reverts to the gun on pointerUP paired to its own click, and the hotbar shows nine rows in the old bottom-left column (may clip on short viewports — Eric: the next story fixes the HUD). The radar buoy is unreachable in play until 8.15 deletes it.

**Eric rulings taken in-session (epic-8 amendments 21–30):** 21 spawn seed of today's card-backed weapons; 22 radar buoy dark until 8.15; 23 boost on every hull now at today's numbers; 24 drones are environment — gun only by the least-work path (Eric, verbatim in the amendments file); 25 the interim hotbar keeps its pitch and may clip (*"Ignore it entirely. The next story fixes the HUD."*); 26 empty-slot denial is client-only; 27 digits stay refit-only; 28 How-to-Play untouched; 29 the `⇧` Shift chip; 30 a click on an empty belt row is silent. Plus two review-time rulings: keep Shift on keydown as specified (the chord finding rejected), and ledger the seed-plus-legal-deck overflow with no code.

**Orchestrator rulings, as implemented (Eric's veto list):** all fifteen spec rulings taken as written, with four recorded readings. (1) The spawn seed is filtered through the World's own catalog (`seedFor`: catalog-carried, non-stub) so `cards` and the loadout can never disagree in a test World with an injected catalog — identity in production. (2) Three golden-snapshot lines outside ruling 12's four buckets moved: `denied[].slot` echoes of the scenario's own re-pointed input literals (1 → 2 for out-of-arc/blocked, 2 → 1 for no-ammo) — explained, accepted. (3) `scripts/rl/env.ts` (the research harness) still binds only slots 0–3, so its agent cannot reach R and its slot-1 bin is inert on the fire channel — left untouched because widening the action space invalidates saved policies; not gameplay. (4) `SPAWN_SEED` is `Readonly<Partial<Record<HullId, …>>>` because `HullId` includes the drone hulls; the three-key totality is pinned by test instead of the compiler.

**Files changed (70, +3343/−1017):** shared — `sim/loadout.ts`, `sim/boons.ts`, `sim/catalog.ts` (`SPAWN_SEED`), `index.ts` (PV 52), `types.ts`, `constants.ts` (comment), tests (`loadout`, `boons`, `catalog`, `barrel`, `deck`, `radarRaster`, NEW `nineSlots`). Server — `game/world.ts` (seed-driven `addShip`/`redeployShip`/`respawn`, `seedFor`, `carriedLines` deleted), `game/drones.ts`, `game/equipment/index.ts`, `game/ai/tactics.ts` (comment), `scripts/{matchSmoke,weaponsSmoke}.mjs`, `scripts/batchsim/{deckSim,controls}.ts`, 26 test files + the golden snapshot (119 lines: ammo width, pool order, the Battleship's new boost pool, the three echo lines). Client — `input/{keyboard,mouse}.ts`, `main.ts`, `render/{hotbar,equipmentInfo,equipmentIcons,hud,weaponArc}.ts`, `sim/inputSampler.ts` (doc), tests (`keyboard`, `hotbar`, `weaponArc`, `inputSampler`, `ordnanceMasksAreServerOnly`, NEW `primeRelease`). Root — `VERSION`/`package.json`/lock (0.18.5), `CHANGELOG.md`, both trackers, `deferred-work.md` (stamps `:116 :119 :1988`, one new section, two review-time entries), `epic-8-context.md` + amendments 21–30, this spec.

**Verification performed:** `npm run check` exit 0 after wave 2 — lint 0 errors (3 pre-existing `max-lines-per-function` warnings), tsc clean ×3, **862 / 1892 / 3302** tests, `check:hooks` green; after the review patch the client re-verified at **3315** (tsc clean, lint 0 errors) and a final full gate is recorded below. Fail-first: shared 3 mutations (identity pin, spill-into-belt, wrong target slot → 1 / 1 / 9 failures); server (fleet flag dropped → the drone pin fails; boost removed → 13 boost tests fail); client (revert moved back to pointerdown → 1; arm reverting immediately → 2; empty hook removed → 3); review patch 10 of 11 new tests fail-first. Golden frames: re-recorded once, 119 of 123 lines moved, every one classified (ammo 4 → 9; pools re-indexed; the Battleship's added boost pool; the three `denied[].slot` echoes). Headless probe (deleted): a real World after spawn AND the match-start redeploy holds gun · speedBoost · heavyTorpedo in Q, and a click on slot 2 launches a fish that hits for `CONFIG.torpedo.damage`. Smokes on scratch ports (2567/5173 never touched): `soloSmoke` PASSED (PV gate reads "server expects v52"); `weaponsSmoke` PASSED on a quiet machine — *torpedo: B sank; hits=7*, *A held 6 own mines live at once (7 laid)*, ambush boom — after two failed attempts that were the orchestrator's own doing (one aimed at the default port with no server, one against a stale server under full CPU load from the reviewers); `matchSmoke` PASSED on the fifth attempt (*weapons safe: 1 boom on B, zero hp lost*; *B sunk by A*; *winner=ALPHA, 1 kill, 300dmg*; both clients disconnected cleanly) after one attempt killed by the orchestrator's own cleanup, one timeout under full CPU load, and two quiet-machine failures at two DIFFERENT ledgered flake points (the step-4 storm race and the step-2 ready-room miss — both pre-existing since the 0.16 baseline and catalog v3's 50-damage fish; ledgered again this cycle with the arithmetic). Final gate after the review patch: `npm run check` exit 0 — **862 / 1892 / 3315**, lint 0 errors, `check:hooks` green.

**Process notes (for the next agent):** the worktree guard refuses any shell line that names a git write target or a computed path — use the Edit tool for spec edits and plain heredoc appends. A cleanup step of mine pattern-killed server processes too broadly and took down my own gate run and match smoke (exit 144); nothing of Eric's was listening. The `gds-workflow-status.yaml` `next_expected` value carries a leaked `'\''` shell-escape from cycles 129/131 that makes the file invalid YAML — pre-existing, not edited.

**Follow-up review recommended: true** — the release-revert latch was restructured around event ordering at the review gate (three fixes across `mouse.ts`/`keyboard.ts`/`main.ts`), and the fire input is now built after the release edge; a second pair of eyes on that ordering before Story 8.14's held stream builds on it is worth the cost.

**Residual risks / Eric's veto list:** (1) the four orchestrator readings above; (2) Battleship and Mine Layer bots now boost on disengage (ledgered) — a balance-harness question; (3) the `⇧` glyph renders through per-glyph font fallback and was not eyeballed — one look on staging; (4) the interim hotbar clips at the 614 px floor viewport and reaches the top at 768 px (ruled); (5) the seed tripwire fires the day 8.14 un-stubs `missile`/`monitor` unless 8.10 has removed the seed (ledgered); (6) the seed-plus-custom-deck overflow is dev-only today (ledgered); (7) the RL harness's action bins are under-wide (recorded, untouched).

## Review Triage Log

### 2026-09-16 — Review pass (Blind Hunter + Edge Case Hunter at session model, plus Codex `gpt-5.6-sol` cross-model review — verdicts: Blind Hunter fix-first (narrow), Edge Case Hunter build-on-it, Codex fix-first; findings applied in this pass)
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 1, low 2)
- defer: 2: (high 0, medium 1, low 1)
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[medium]` `[patch]` the release-deferred prime revert lost within-tick ORDER: a pointerup of click A and the pointerdown of click B inside one 50 ms tick built B's fire input with the weapon still primed and paid A's release afterwards, so an ordinary fast double-click after a torpedo shot fired (or was denied as) the torpedo again (Blind Hunter F1 CONFIRMED, Edge Case Hunter 1 CONFIRMED) — the release edge now runs BEFORE the fire input reads `primedSlot`, and an arm whose click the mouse already reports released is paid at once; fail-first 4 + 1
  - `[low]` `[patch]` a lost pointerup (window blur mid-hold, touch/pen `pointercancel`) left the latch armed to be paid by the NEXT unrelated release (Blind Hunter P1, Edge Case Hunter 2, Codex 2) — blur and `pointercancel` end the active hold; fail-first 4
  - `[low]` `[patch]` a second pointer's release paid the first pointer's latch (Codex 2 PLAUSIBLE) — `MouseInput` records the active hold's `pointerId` and click seq, `armReleaseRevert(clickSeq)` / `consumeReleaseRevert(releasedClickSeq)` pay only on an exact match; fail-first 3
  - deferred (ledger): a door-legal deck plus the interim spawn seed can hold four weapon lines (all three reviewers; dev-only `deckOverride` today; Eric 2026-09-16: "ledger it, no code"); Battleship and Mine Layer BOTS now boost on disengage as a consequence of amendment 23 (Blind Hunter P2, Edge Case Hunter note) — on Eric's veto list
  - rejected: the Shift keydown of a Shift+Tab chord also boosts (Blind Hunter F2, Edge Case Hunter 6) — Eric 2026-09-16: *"WTF is this Shift+Tab bs dude? That's not a thing in this game. Keep the spec"*; a one-frame pre-first-frame empty denial at boot (Blind Hunter P4, cosmetic); `seedFor` filtering the catalog but not the server module registry (Edge Case Hunter 4, identity in production); malformed/short loadouts treated as occupied (Edge Case Hunter 5, no production writer); the ability FIFO cap at 9 (Edge Case Hunter, already ledgered at `:119`)

## Design Notes

- **Why the seed is a table, not the loadout:** today's spawn reads the deck seed off the fitted loadout; with an identical loadout that channel is empty, so the seed must be authored. A table in the catalog module keeps "every catalog fact lives in the catalog module" true and gives 8.10 one line to delete.
- **Why `⇧`:** a 22 px mono chip holds one glyph; U+21E7 is the platform-conventional Shift mark. Eric may veto for a wider word chip.
- **Why release, not press:** UX-DR42 — a held stream (8.14's machine gun) must keep its prime for the whole hold; the revert is the release edge.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green, property test present
- `npm test -w server` -- expected: green; snapshot diff limited to ruling 12's lines
- `npm test -w client` -- expected: green; PV 52 pins
- `npm run lint` -- expected: 0 errors
- `npm run check` -- expected: exit 0
- `HC_DEV_OPTIONS=1 PORT=<free> node server/scripts/{soloSmoke,matchSmoke,weaponsSmoke}.mjs` -- expected: pass (matchSmoke ≥ 300 s budget, ≤ 3 attempts)
