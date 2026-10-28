---
title: 'Story 10.1: Four Configurable Consumable Slots'
type: 'feature'
created: '2026-10-27'
status: 'review'
baseline_revision: 'a10e722d'
final_revision: 'see the PR head (code + record on worktree-story-10-1-four-consumable-slots; PR to development, 2026-10-28)'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/10-1-four-configurable-consumable-slots.md'
---

## Intent

**Problem:** since Story 9.2 every hull carried all six consumable kinds on six fixed keys (a global kind → slot map, `CONSUMABLE_KEY_ORDER`), so the offer dealt every kind to every captain whether they wanted it or not, and the belt was six squares wide. Eric's playtest thought (2026-10-25): *"Go back down to 4 consumable slots, make what each slot holds player-configurable so that the game only gives you those consumables."*

**Approach (Eric's ten rulings, 2026-10-27, epic-10 amendment 3):** a per-ship four-line **kit** chosen on the class-select footer (one CONSUMABLES row; press a square, pick its line; exactly four, each once; default HULL REPAIR · SHIELD BLOCK · SMOKE SCREEN · FOULING SHELL), saved in the browser, carried to the server as a join option like the gun, held on the ship record, echoed self-privately on the own-ship frame, and consulted by every slot/stock/draw helper through ONE gate (`pickRefusal`), which confines the offer draw and the drone drops to the kit. Bots roll a random four. The countermeasure line prints SMOKE SCREEN again. The row was rendered and approved by Eric before commit; the fold at 1366×768 stays.

## What changed

### shared (`shared/src`) — the kit law (wave 1, Fable)

- `sim/loadout.ts`: `KIT_SIZE` 4, `ConsumableKit`, `DEFAULT_KIT`, `consumableSlotFor(kit, id)`, `consumableKindAt(kit, slot)`, `CONSUMABLE_SLOTS` [5..8], `SLOT_COUNT` 9, `SLOT_ROLES` four consumables; `CONSUMABLE_KEY_ORDER` deleted (no alias). `loadoutFor` unchanged (the fit is kit-independent; the binding slot 5+i ⇔ kit[i] lives in the helpers and the stock path).
- `sim/boons.ts`: `dealableConsumables(catalog)`, `isConsumableKit(raw, catalog)` (array, length KIT_SIZE, distinct, every entry a non-stub consumable line; never throws), `rollKit(next, catalog)` (partial Fisher–Yates, exactly four draws, NaN/negative/≥ 1 clamped into the pool, throws `KitRollError` on a catalog with fewer than four dealable lines — never a short kit; review-gate F1); `stockSlotFor` / `pickRefusal(held, slotIds, lineId, kit)` / `applySlotEffect(…, kit, catalog)` / `slotsWithCards(stats, cards, kit, catalog, …)` take the kit — an off-kit consumable is refused as `'stub'` (a line with no slot), the one gate.
- `sim/draw.ts`: `DrawShip.kit`; `eligibleLines` and `usableLines` skip a consumable outside the kit; a carried line at cap is still dealt greyed (amendment 94).
- `types.ts`: `OwnShip.kit` beside `gun` (self-private, non-spatial); `ammo` nine long; input docs 0..8. `index.ts`: PV 91 → 92.

### server (`server/src`, `server/scripts`) — the seat and the bots (wave 2a, Opus)

- `rooms/roomOptions.ts`: `JoinOptions.kit?: unknown`; `sanitizeKit(raw, log)` fail-open to `DEFAULT_KIT` with `join.kitCoerced` (the `sanitizeGun` shape). `rooms/formArena.ts`: `seatAuth(client, gun, kit)` — the kit rides the seat's `auth` only, never `options` (exactly as the gun). `StandardQueueRoom` / `LobbyRoom` sanitize at enqueue. `ArenaRoom.resolveJoinKit` prefers `auth.kit`; `buildBotFleet` rolls each bot's kit off `mulberry32(mapSeed ^ 0x6b17)` — a stream separate from the hue stream, so a pinned seed seats the same hues and guns as before (review-gate F3).
- `game/world.ts`: `ShipRecord.kit` set once in `addShip` (throws on an invalid kit — a bug guard, review-gate F2; every production door sanitizes first), threaded through every `slotsWithCards` / `applySlotEffect` / `pickRefusal` / `drawShipOf` site; `pickDrop` is confined by `refusesCard` with no second filter; a dev `fitOverride` line refused by the kit logs `devFit.refused` (F4). `game/frames.ts`: `kit: [...ship.kit]` in the own-ship block; the six perception exceptions are untouched.
- `game/ai/`: `BotSelf.kit`, `BotSpendState.kit` (required), `carries()` and both `pickRefusal` sites read the bot's kit; the per-kind tactic table stays total. Harness (`batchsim/runner.ts`, `encounterSpan.ts`, `rl/env.ts`): bots roll off their own seeded streams; harness captains sail `DEFAULT_KIT`.

### client (`client/src`) — the HUD and the port (waves 2b + 3, Opus)

- `net/roomBindings.ts` → `main.ts`: `g.ownKit` (`DEFAULT_KIT` only between `buildGame` and the first own frame; `ownStatsChanged` compares the kit element-wise); `slotIdsFor` replays with it; `latchFitFlash` by kit; `HotbarView.kit`, `ResultsOwn.kit`, `upgradeMenu` cards grey by `pickRefusal(…, you.kit)`.
- `render/hudBar.ts` / `hotbar.ts` / `equipmentInfo.ts` / `ui/loadoutBlock.ts`: the framed belt is four wide (width derived, 868 → 768 px), `SLOT_KEY_GLYPHS` `'1'..'4'` from `KIT_SIZE`, the kind at a slot from the kit; `input/keyboard.ts`: `CONSUMABLE_KEY_CODES` 1–4 derived, Digit5/6 and Numpad5/6 unbound and native.
- `ui/boonCopy.ts`: `countermeasure: 'SMOKE SCREEN'` (the only player-facing string; the 9.3 history kept in the comment).
- `ui/kitPicker.ts` (new, 388 lines): `kitRowModel`, `pickerModel`, `pickLine` (pure) + `makeKitRow`, `openKitPicker` (DOM). `ui/classSelect.ts`: the footer carries the row above the hoist row; the kit is layer state like the gun; `onConfirm(cls, gun, kit)` guarded by `isConsumableKit`; the panel is `inert` and Tab is default-prevented while the picker is up, focus goes to the `ESC · CLOSE` chip and returns to the opening square (review-gate C1). `ui/loadoutGrammar.ts` (new leaf): the row-grammar constants, re-exported by classSelect (the import cycle removed, C2).
- `ui/home.ts`: `KIT_KEY = 'hullcracker.kit'`, `loadSavedKit` (junk / stale / short → `DEFAULT_KIT`), `saveKit` on CONFIRM; `DeployFn(name, cls, gun, kit)`; `net/connection.ts` `joinOptions(…, kit)` always sends it; `net/lobby.ts` `LobbyDeploy.kit`; `privateLobby.ts` needed no edit.

## Review Triage Log

### 2026-10-27/28 — Gate (Fable Blind Hunter + Fable Edge Case Hunter + Codex `gpt-5.6-sol`, per `git diff a10e722d..HEAD`)

Verdicts: Blind Hunter BUILD-ON-IT, Edge Case Hunter BUILD-ON-IT, Codex FIX-FIRST. Agreement picture and the orchestrator's triage:

- **Both (Codex CONFIRMED + Blind Hunter #3):** bot kit rolls consumed `hueRng`, so a pinned map seed seated different bot hues and guns than at a10e722d. → **F3 fixed**: a separate kit stream (`mapSeed ^ 0x6b17`); `solo.test.ts` replays the pre-10.1 draw order and asserts every class, gun and hue (red before the fix: "seed 7 bot-1: expected 16 to be 17").
- **Both (Codex #2/#3 + Edge Case Hunter #1):** `rollKit` returned a short kit on a thin catalog and null entries on a broken rng; `addShip` stored any kit unchecked (only harness/test callers can reach it — every production door sanitizes). → **F1 + F2 fixed**: `KitRollError` on a thin catalog, the index clamped, `addShip` throws on an invalid kit; tests red before the fix.
- **Edge Case Hunter #2 (CONFIRMED, dev-only):** a dev `fitOverride` naming an off-kit consumable was dropped silently. → **F4 fixed**: `devFit.refused` warn; test red before the fix.
- **Blind Hunter #1 (PLAUSIBLE):** no focus trap under the picker — Tab could reach the layer's buttons beneath the dim. → **C1 fixed** (`inert` + Tab prevented + focus moved/restored); two jsdom tests, red with the lines commented out.
- **Blind Hunter #2 (CONFIRMED):** present-tense "six squares / keys 1–6 / 868 px" comments in `config.ts`, `main.ts`, `hotbar.ts`. → **C3 fixed** (history kept as dated past clauses).
- **Blind Hunter #4 (INFO):** ESM import cycle classSelect ↔ kitPicker. → **C2 fixed** (`ui/loadoutGrammar.ts` leaf).
- **Traced clean by all three:** client replay vs server truth (the own-ship frame applies `kit` before `fit`/`dp` events; `Game` is rebuilt per match; respawn/redeploy keep the record's kit); the seat path (no unsanitized route to `addShip`; the kit never in `options`); no leak of another ship's kit (the `you` block is the only carrier); no residual six-slot code; localStorage junk → default; the picker never stacks and ESC closes it, not the layer.

## Verification

| Check | Result |
|---|---|
| `npm run check` (lint + tsc ×3 + all suites + hook test) | GREEN 2026-10-28 (exit 0; 0 lint errors, 2 pre-existing max-lines warnings; 12 hook tests) |
| shared | 1177 → 1191 tests (49 files) |
| server | 2798 → 2802 tests (104 files; +4 review-gate regressions) |
| client | 4053 → 4075 tests (136 files) |
| `matchSmoke` / `weaponsSmoke` first-try | both OK first-try 2026-10-28 (matchSmoke self-booted on 2599: 4 fish of 112, sinking window held, results dense; weaponsSmoke against a scratch server on 2699: WEAPONS SMOKE OK; both servers killed after) |
| goldenFrames | re-recorded once (wave 2a): every `you.ammo` 11 → 9, `you.kit` added; with both masked, no offer, contact, event, blip, mine, zone, position or hp byte moved; unchanged by the fix batch |
| Candidate page | approved by Eric 2026-10-27 as rendered (amendment 3j) |

## Residual risks

- The port layer scrolls ~120 px at 1366×768 to reach CONFIRM (Eric: leave it; judged on staging).
- A saved kit that names a line retired by a later story (10.9 retires `decoyBuoy`) is replaced by `DEFAULT_KIT` on both sides silently — by ruling 3; no copy tells the player.
- `rollKit` on the production catalog can never throw (six dealable lines); the guard exists for a future catalog edit that leaves fewer than four.

## Owed to Story 10.8 (not written here — no in-game copy unasked)

- How-to-Play: the consumables section (four chosen slots, keys 1–4, the SMOKE SCREEN name, the FOULING SHELL entry that is still missing since 9.4).
- DESIGN.md: `consumable-strip` (four squares), `loadout-block` (four), `loadout-row` (a CONSUMABLES row exists on the class-select footer ahead of the LOADOUT sheet), the Component Patterns "belt 1–6" clauses; epics.md Story 9.2 / 9.3 dated stamps (six keys superseded; the name).
- GDD: Consumables v3 "four slots" is true again (stamp the 9.2 six-key history); the countermeasure name.
