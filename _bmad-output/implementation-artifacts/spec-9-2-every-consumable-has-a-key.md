---
title: 'Story 9.2: Every Consumable Has a Key'
type: 'feature'
created: '2026-10-11'
status: 'in-progress'
baseline_revision: 'e56ca391'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/mockups/hud-consumables-1.html'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** A captain holds consumables in four packed belt slots on keys `1`–`4`; a fifth kind is refused (`beltFull`, the greyed `SLOTS FULL` card), slots shift left when a stack empties, so "key N" changes meaning mid-match and a pick can be lost to a full belt. Eric (2026-10-11): *"Consumable belt is being phased out. All captains can carry all consumables. Each is tied to a specific number key by default … still limited by the max carry count."*

**Approach:** Retire the belt. Every consumable kind owns one FIXED slot and one fixed key; stock is the per-kind count already in `cards`, cap 5 (`atCap`) the only consumable refusal. Re-lay the HUD bar to mock option D′ (globes 124, weapon squares 46, an unframed six-square strip above them, a new ZERO-STOCK state). Retire CHAFF now (Eric, amendment 31) so the row is six keys: `1` HULL REPAIR · `2` SHIELD BLOCK · `3` SMOKE SCREEN · `4` FLASH SHELLS · `5` DECOY BUOY · `6` SUPERCAVITATING TORPEDO. Cycle 172, `0.18.37`, `PROTOCOL_VERSION` 74 → 75.

## Boundaries & Constraints

**Always:**
- Rulings of record: epic-9 amendments 21, 22, 31–37 (this spec step) and epic-8 amendments 43 (9 px floor), 94 (capped consumables are still dealt, greyed, never rerolled), 226 (drops). Every number below is from those or the mock read literally.
- `shared/src/sim/` stays pure and is the ONE home of the key order and the kind → slot map; both sides replay `cards` through `slotsWithCards` and get identical slots. Never fork per side.
- Slot indices stay the wire currency (`InputMsg.slot` / `actSlot`, `OwnShip.ammo`, denials): `SLOT_COUNT` grows 9 → 11, `CONSUMABLE_SLOTS` = `[5..10]` in key order, each slot permanently bound to its kind. A kind at zero copies reads `equipmentId: null` in its own slot (the clear-at-zero rule stands); nothing ever re-packs.
- The perception chokepoint keeps exactly SIX exceptions. Retiring chaff DELETES the fakes carve-out (oracle, non-vacuity counters, `FakeSource`) — the invariant gets stricter, never wider. `frames.ts` contacts still come only from `perception.observe()`.
- `PROTOCOL_VERSION` 75 (loadout shape, `chaffGhosts` field gone, catalog content). `VERSION` / root `package.json` / lockfile `0.18.37`. `CHANGELOG.md` entry. Both trackers stamped one line each. `DESIGN.md` `hud-bar` / `belt-slot` / `loadout-block` rows re-cut with dated stamps only (amendment 22: the spine is re-cut at this spec step) — no rewording beyond what the rulings cover.
- Complexity ≤ 10 everywhere; American spelling; no `Math.random` in sim; `applyDamage` untouched.
- Tests assert contracts: no literal pixel pins beyond `hudBarLayout` against the mock (the AC asks for that one), no ring/geometry/copy pins, no vocabulary pins.

**Block If:**
- Any seventh perception exception seems needed, or the invariant suite cannot be kept green without widening it.
- A design gap not covered by amendments 21–37 (e.g. a new in-game string, a new sound) — HALT and ask Eric; never invent.
- Retiring chaff forces a change to SMOKE SCREEN's or any other line's behavior beyond deleting shared helpers.

**Never:**
- Re-propose belt slots, a Speed Boost, a Healing Buoy, or key rebinding (10.9).
- Edit How-to-Play or Settings copy (amendment 36), `CLAUDE.md`, or the mock.
- Add cap copy to a greyed consumable card (amendment 32) or a HUD readout the player can infer.
- Touch gun numbers, mine numbers, SMOKE SCREEN / FLASH SHELLS behavior, or bot personalities beyond removing the chaff tactic and re-expressing belt reads.
- Pre-commit render of the bar (amendment 37): the bar is judged on staging.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Stock a kind | `cards` gains a `shieldBlock` copy, none held | Slot 6 opens `{n:1}`; slots 5,7–10 unchanged; client replay identical | — |
| Stock a 2nd kind | holds repair ×1, picks decoy | Decoy lands in slot 9, repair stays in 5 (no packing) | — |
| Pick at cap | `hullRepair` ×5 held, card offered | Card dealt, greyed (no foot text), server `pickRefusal` = `'atCap'`, silent no-op | never rerolls |
| Pick with 6 kinds held | one of each ≤ cap, 7th kind offered | Impossible: six kinds exist; a 6th kind stocks normally — no `beltFull` path exists | — |
| Use last copy | `smokeScreen` ×1, key `3` | Server `spendStock` removes copy; slot 7 → `null`; client shows ZERO-STOCK square, key `3` still owned by SMOKE SCREEN | — |
| Key at zero stock | slot `null`, press `4` | Client: red denied flash on square 8 (`pressRefused` empty-slot grammar), nothing sent | — |
| Key `5`/`6` while refit window open | window open, 4 cards | Digits `1`–`4` pick cards; `5`/`6` inert while open; after close, grace covers every digit for 400 ms | — |
| Numpad | `Numpad1`–`Numpad6` | Same as `Digit1`–`Digit6` | — |
| Drone drop | killer holds repair ×5, shield ×2, nothing else | Eligible = every non-stub kind under cap (shield, smoke, flash, decoy, supercav); `dp` only if count rose | — |
| Depth charge | `depthCharge` stub | No slot, no key, no square; `pickRefusal` `'stub'`; never dealt | — |
| Chaff in a legacy `cards` list / fit override | id `'chaff'` arrives | Not a catalog line: fit override / card replay rejects it like any unknown id (existing guard) | silent drop |
| Malformed slot | `slot: 10.5`, `actSlot: 11` | `isSlotIndex` rejects (0..10 ints) | silently dropped |
| 90 % UI scale | strip chips / badges 9 px | Render ≥ 9 px via `microScale`; squares 30.6 px | — |

</intent-contract>

## Code Map

- `shared/src/sim/loadout.ts` -- `CONSUMABLE_KEY_ORDER` (NEW: `['hullRepair','shieldBlock','smokeScreen','dazzleShells','decoyBuoy','supercavTorpedo']`), `consumableSlotFor(id)` / `consumableKindAt(slot)` (NEW), `SLOT_COUNT` 11, `CONSUMABLE_SLOTS` `[5..10]`, `SLOT_ROLES`; `CONSUMABLE_IS_WEAPON` loses `chaff`.
- `shared/src/sim/effects.ts:56` -- `CONSUMABLE_IDS` drops `chaff` (7 ids; `depthCharge` stub stays).
- `shared/src/sim/boons.ts:257-470` -- `stockSlotFor` → the fixed slot; `applyStock` opens/increments at it; `canStock` / `beltRefusal` / `'beltFull'` DELETED (`PickRefusal` = `'stub' | 'atCap' | 'noWeaponSlot'`); `slotsWithCards` places stacks at fixed slots.
- `shared/src/sim/catalog.ts:382` region -- the CHAFF line removed; `shared/src/constants.ts:1816-1850` -- `CONFIG.chaff` removed (doc blocks that cite it updated); `droneDrops` comment (`:2075`).
- `shared/src/types.ts:426,484,615-640` -- `OwnShip.chaffGhosts` + `GhostPaint` chaff usage removed; comments on `ammo` length and `cards` replay; `shared/src/index.ts:812` -- PV 75 + barrel exports (new helpers; chaff symbols gone).
- `server/src/game/equipment/consumables/chaff.ts` -- DELETE; `equipment/consumables.ts`, `equipment/index.ts` -- registry rows; `server/src/game/fakes.ts` -- DELETE; `signals.ts`, `perception.ts`, `frames.ts` -- every fake-source / chaff path removed; `world.ts` -- chaff state, `rebuildBelt` (:5780) keeps replay semantics (no packing), `pickDrop` (:2509) eligibility comment, `spendCard` `SLOTS FULL` comment (:3217).
- `server/src/game/inputs.ts:65-115` -- `isSlotIndex` follows `SLOT_COUNT` (verify, no literal 9).
- `server/src/game/ai/consumables.ts:199-218`, `types.ts`, `profiles.ts`, `plot.ts`, `utility.ts`, `botDriver.ts`, `equipment.ts` -- chaff tactic/plot/profile rows removed; `spending.ts:211` `carries` re-expressed on the fixed slot; the free-belt-slot factor of `consumableScore` becomes constant (belt never scarce) — every other term untouched.
- `server/scripts/batchsim/spendPolicy.ts:42` -- `EMPTY_SLOTS` follows `SLOT_COUNT`.
- `client/src/input/keyboard.ts:163-196,810-830` -- `BELT_KEY_CODES` Digit/Numpad 1–6 → slots 5–10; `REFIT_DIGIT_CODES` unchanged (4 cards); `DENIABLE_SLOTS` covers the six; FIFO cap follows `SLOT_COUNT`.
- `client/src/render/equipmentInfo.ts:54` -- `SLOT_KEY_GLYPHS` `['', 'Shift','Q','E','R','1','2','3','4','5','6']`.
- `client/src/config.ts:1776-1850` -- `hudBar` re-cut: globe 124, globeGap 14, slot 46, icon 24, slotGap 8, strip square 34, stripIcon 16, stripGap 4, stripChipGap 3, stackGap 4, chip 16/9 px, strip badge 14 box / 9 px / overhang 6; belt frame keys (`beltSlot`, `beltGap`, `beltPad`, `beltIcon`, `beltBadgeOverhang`) DELETED; chaff client config removed.
- `client/src/render/hudBar.ts:111-320` -- `hudBarLayout` lays the stack (strip row + chips, 4 px gap, weapon row + chips) centered between the globes, stack height 124 = globe diameter, no panel; two dim groups (strip, weapon row); XP strip beneath at full bar width.
- `client/src/render/hotbar.ts:108-1300` -- `isBeltSlot` → `isConsumableSlot`; NEW `SlotState` `'zeroStock'` (dashed silver .45 edge, glyph of `consumableKindAt(slot)` at alpha .45, no badge, deniable); `beltAwareId` reads the fixed kind for glyph purposes; icon size per row; tooltip for a zero-stock square = the stocked square's content with stock 0 (no new strings — orchestrator reading, veto item).
- `client/src/render/chaffGhosts.ts`, `chaffRing.ts` -- DELETE; `stage.ts`, `main.ts`, `net/roomBindings.ts`, `render/equipmentIcons.ts`, `ui/boonCopy.ts` -- chaff branches removed.
- `client/src/ui/upgradeMenu.ts:443-587,1401` -- `footEl` prints `SLOTS_FULL` only when `pickRefusal` is `'noWeaponSlot'`; a capped consumable is greyed with an empty foot; `refitCardFit.ts:268,394` keep the foot box height so the face does not jump.
- `client/src/ui/loadoutBlock.ts:151-315` -- six fixed squares at .72 incl. zero-stock, chips `1`–`6`, 9 px floor.
- Tests: `shared/src/__tests__/{loadout,barrel,boons,nineSlots,draw,catalog,stats,hullRepair,arcs}.test.ts`; `server/src/__tests__/{upgrades,droneDrops,equipment,botPolicy,botTactics,perception,frames,signals,goldenFrames,denials,smokeScreen,colyseus018,foghorn,botPlot}.test.ts` (+ DELETE `chaff.test.ts`); `server/scripts/batchsim/__tests__/gunFirstSpend.test.ts`; `client/src/__tests__/{keyboard,hudBar,hotbar,hud,slotTooltip,tooltipFit,refitTooltipFit,results,upgradeMenu,refitCardFit,refitFailOpen,cardStatRows,boonCopy,roomBindings,ordnanceMasksAreServerOnly,weaponArc}.test.ts` (+ DELETE `chaffGhosts.test.ts`, `chaffRing.test.ts`).
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md,deferred-work.md}`, `DESIGN.md` (three rows, dated), `epics.md` 9.2 stamp.

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent):**
- [x] `shared/src/sim/loadout.ts`, `effects.ts`, `boons.ts`, `catalog.ts`, `constants.ts`, `types.ts`, `index.ts` -- fixed kind → slot model, chaff removed from the model, PV 75 -- the one source both sides replay
- [x] `shared/src/__tests__/*` -- re-base: `CONSUMABLE_SLOTS` is one slot per keyed kind in `CONSUMABLE_KEY_ORDER`; property: for any legal `cards`, every stack sits at `consumableSlotFor(kind)` and no slot holds a different kind; `'beltFull'` gone; chaff gone; `npm test -w shared` green; `npm run build -w shared`

**Execution (wave 2 — server and client in parallel, shared frozen):**
- [ ] `server/src/game/{world,signals,perception,frames}.ts`, `equipment/*`, `fakes.ts` (delete), `ai/*`, `inputs.ts`, `scripts/batchsim/spendPolicy.ts` -- chaff and fakes retired, drops eligibility per amendment 226 without the belt branch, bots on fixed slots -- the six exceptions untouched
- [ ] `server/src/__tests__/*` -- chaff suite deleted, carve-out oracle deleted (invariant stricter), fixed-slot pins, goldenFrames re-recorded ONLY if the diff is the retired field (note the diff in this spec); `npm test -w server` green
- [ ] `client/src/input/keyboard.ts`, `render/{equipmentInfo,hudBar,hotbar,equipmentIcons,stage}.ts`, `config.ts`, `main.ts`, `net/roomBindings.ts`, `ui/{upgradeMenu,refitCardFit,loadoutBlock,boonCopy}.ts`, chaff renderers deleted -- D′ bar, ZERO-STOCK, six keys, no cap copy, LOADOUT twin
- [ ] `client/src/__tests__/*` -- `hudBarLayout` pinned against the mock's D′ numbers (124 / 46 / 34 / 4 / stack = globe / two dim groups / no panel), `'zeroStock'` state, key map 1–6 both rows, grace unchanged, greyed consumable foot empty, LOADOUT six squares; `npm test -w client` green

**Execution (wave 3 — record):**
- [ ] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `DESIGN.md`, `epics.md`, both trackers, `deferred-work.md` (review defers only) -- 0.18.37 / cycle 172 / PV 75 / amendments 31–37 (+ any implementer readings appended as 38+)
- [ ] `npm run check` green; results recorded under Verification

**Acceptance Criteria:**
- Given a captain with no consumables, when they stock any of the six kinds, then it appears in that kind's own square with its fixed key, and stocking a second kind never moves the first.
- Given the refit window open, when digits `1`–`4` are pressed they pick cards, `5`/`6` do nothing, and for 400 ms after close every digit is inert.
- Given a kind at zero stock, when its key is pressed, then its square flashes red and no input leaves the client.
- Given a consumable held at five copies, when it is dealt, then the card is greyed with no foot text and the server refuses the pick silently; the offer never rerolls.
- Given the HUD at 100 %, then globes are 124 px, weapon squares 46 px with 24 px icons, the strip six 34 px squares with 16 px icons at a 4 px gap, chips under every square, the stack exactly 124 px tall, no drawn panel; at 90 % no text renders under 9 px.
- Given any match frame, when the perception invariant suite runs, then the SIX exceptions are the only exceptions and no fakes path exists.
- Given a PvE drone kill, when the drop rolls, then the eligible set is every non-stub kind under cap 5.
- Given `npm run check`, then lint (complexity ≤ 10), type-check for all three workspaces, all tests and the hook test pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why fixed slots and not a per-kind count on the wire:** slot indices are the currency of `InputMsg`, `OwnShip.ammo`, denials, the keyboard FIFO and every per-slot client array; binding each kind to one slot keeps all of that and deletes the packing rule (`rebuildBelt` no longer shifts anything). `cards` stays the single truth.
- **Why `null` means zero stock:** the clear-at-zero rule already empties the slot; the client knows the kind from the slot index (`consumableKindAt`), so the ZERO-STOCK square needs no new wire field.
- **Why chaff goes now:** Eric's ruling (amendment 31) — six keys, one kind retired; CHAFF was the pick. Its deletion removes the only carve-out beside the six exceptions, so the invariant suite simplifies rather than widens.
- **Stack arithmetic (amendment 33):** strip 34 + 3 + 16 = 53; gap 4; weapons 46 + 5 + 16 = 67; total 124 = globe. Bar width 124·2 + 14·2 + max(6·34 + 5·4 = 224, 5·46 + 4·8 = 262) = 538.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean (run before server/client tests)
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green, no skipped chaff suites left behind
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green; counts recorded in CHANGELOG
- `grep -rn "chaff\|beltFull\|fakes\." shared/src server/src client/src --include=*.ts | grep -v __tests__` -- expected: no hits outside the How-to-Play copy Eric froze (amendment 36) and dated doc comments

**Manual checks:**
- Eric judges the live bar on the development deploy after the PR (amendment 37).
