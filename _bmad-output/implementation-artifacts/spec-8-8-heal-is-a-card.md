---
title: 'Story 8.8: Heal Is a Card'
type: 'feature'
created: '2026-09-17'
status: 'done'
baseline_revision: 'beb9ed2'
final_revision: 'a69f830'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/implementation-artifacts/spec-8-7-consumable-slots-and-the-refit-card-v3.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Healing is still a free-standing `5` key (`HEAL_CHOICE`, the DAMAGE CONTROL rail) spendable on any banked level, so heals are neither scarce nor part of the deck; the belt built in 8.7 holds nothing because every consumable is still a stub; and the free per-level heal on `development` is not the mechanism Eric designed.

**Approach:** Make HULL REPAIR the first live consumable (row + stub flip), move the paid heal's body into its `activate`, delete the rail / `5` key / `HEAL_CHOICE` end to end (PV 52 → 53), replace the per-level auto-heal with out-of-combat regen (amendments 46–48), give bots one minimal heal press (amendment 49), and fix only the copy lines that become false (amendment 50).

## Boundaries & Constraints

**Always:**
- Epic-8 amendments 46–50 are the rulings of record (written first, durable home); every number is Eric's: HULL REPAIR = 50 instant + 50 pooled at 5 hp/s (R13), regen = 1 %/s of missing after 30 s.
- `applyDamage` stays the ONE hull-hp decrement (8.4 lint + grep pins); repairs (`payRepair`, the regen tick, the instant heal) stay the only hp-increase paths. Regen hooks the gate, never a source.
- `PROTOCOL_VERSION` 52 → 53 (SpendMsg loses `HEAL_CHOICE`; catalog content changes). Version `0.18.8`, cycle 143.
- Perception invariants untouched: `heal` stays a self-private event (no seventh exception; no new spatial data).
- `npm run check` green; complexity ≤ 10; 9 px floor on any DOM text; no in-game copy beyond amendment 50.

**Block If:** any further heal/regen number or behaviour is needed that amendments 46–50 and R13 do not state; a seventh perception exception looks necessary; the `heal` event would need an hp amount.

**Never:** re-tune any heal or regen number; keep any pool for the regen; let drones regen; touch the level-heal balance harness beyond deleting its dial; widen heal observability (`deferred-work` `:555` stays); re-cut How-to-Play beyond amendment 50; add a wire `DenialReason`; edit `CLAUDE.md`, the GDD or FR text (amendments are the durable home).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Heal stocked | HULL REPAIR card picked, belt slot free/held | stocks (8.7 fold); deck loses the copy; card face shows two stat rows `INSTANT 50` / `OVER TIME 50` | full belt → greyed SLOTS FULL (8.7) |
| Heal fired | digit / click on the stack, afloat, hp < maxHp | `hp += 50` (clamped), `repairHp += 50` (paid pool, 5 hp/s), `heal` event, n −1, copy leaves `cards`, belt rebuilt | — |
| Full hull | press at hp ≥ maxHp | `{ok:false, reason:'blocked'}` → wire `blocked` → slot denied pulse + tone; nothing spent; client also pre-denies locally without sending | — |
| Sinking | press while sinking (gate lets sinking rows through) | row refuses `'blocked'`; nothing spent; client pre-denies (it knows `sinking`) | — |
| Collapse | zone fully closed, press | heal WORKS (heals stay allowed in the collapse — FR47, Eric 2026-09-11); regen does NOT run (storm bites reset the clock) | — |
| Regen | 30 s since `lastDamagedAt`, afloat, participant, hp < maxHp | each tick `hp += (maxHp−hp)·0.01·dt/1000`; snap to maxHp when missing < 1; no event, no band | fleet hull: never |
| Clock reset | any `dealt > 0` at the gate (storm, burn, shell…) | `lastDamagedAt = now`; regen stops at once | shield-eaten hit (`dealt` 0): no reset |
| Spawn/respawn | new life | `lastDamagedAt` = that moment (30 s wait applies; hull is full anyway); `repairHp` 0 | — |
| Wire | `SpendMsg.choice` −1 | malformed → silently dropped (negative is out of the offer bound once the sentinel is gone) | — |
| Bot heal | bot with a HULL REPAIR stack, hp/maxHp < `healHpFrac` | `chooseAct` returns the belt slot via the consumable tactic row; ability channel fires it | no stack → no press; `chooseSpend` never returns −1 |
| Draw pool | default decks | `hullRepair` (3 per hull, amendment 10) is dealt: 26 drawable cards per hull (was 23) | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1804-1876` -- DELETE `damageControl`; ADD `hullRepair { instantHp 50, regenHp 50, regenMs 5000 }` and `regen { missingPctPerS 0.01, outOfCombatMs 30000 }`; `bots.healHpFrac` (`:414`) comment re-pointed to the belt press
- `shared/src/types.ts:316-336, 1104-1120` -- delete `HEAL_CHOICE`; `SpendMsg.choice` doc = offer index only; `HealEvent` doc = HULL REPAIR fired; `OwnShip.repairHp` (`:434-452`) doc = paid pool only
- `shared/src/index.ts:585` -- PV 53 + changelog comment; barrel exports
- `shared/src/sim/catalog.ts:213-219, 291` -- `consumable(id, stub?)` like `weapon()`; `hullRepair` NOT stub; comment at `:290`
- `shared/src/__tests__/damageControl.test.ts` → `hullRepair.test.ts`: CONFIG pins (5 hp/s), NFR6 arithmetic pin (cap 5, 100 hp/copy, decks carry 3, ARMOR cap 450, `zone.stormDps`), regen CONFIG pins; `deck.test.ts:117-119` and `server/src/__tests__/decks.test.ts:209-214` 23 → 26
- `server/src/game/equipment/consumables/hullRepair.ts` (NEW) -- `hullRepairRow`: afloat + hp<max guards → `ctx.applyRepair(instantHp, regenHp)`; `consumables.ts:CONSUMABLES` = `[hullRepairRow]`, header comment
- `server/src/game/equipment/index.ts:46-100` -- `ActivationContext.applyRepair(instantHp, regenHp)` (World-owned: clamp hp, pool add, `heal` event)
- `server/src/game/world.ts` -- `ShipRecord` (`:660-700`): delete `levelRepairHp`/`levelRepairRate`, add `lastDamagedAt`; delete `grantLevelHeal` (`:2296-2345`, call at `:2290`), `spendHeal` (`:2665-2700`), the `HEAL_CHOICE` branch of `spendPoint` (`:2603-2624`); `tickRepairs` (`:3333-3365`) second channel → the regen (participants only, `isAfloat`, clock, snap); `applyDamage` (`:3963`) step (d) stamps the clock; `clearRepair`/spawn (`:1544`)/respawn/redeploy sites; `frames.ts:83` repairHp = paid pool only
- `server/src/game/ai/equipment.ts:744` + `tactics.ts:227-250, 298-313` + `spending.ts:286-320` -- `CONSUMABLE_TACTICS` (hullRepair ability row, `want` = hp/maxHp < healHpFrac), `rankedSlots` admits belt slots against it, `chooseSpend` drops the heal branch; `profiles.ts:102` doc; `botPolicy.test.ts`
- `server/scripts/batchsim/overrides.ts:79` -- `'damageControl.'` → `'hullRepair.'`, `'regen.'`; `server/scripts/rl/env.ts:205-220`, `features.ts:226` -- drop `HEAL_CHOICE`
- `client/src/input/keyboard.ts:129-146` -- `REFIT_DIGIT_CODES` 1–4 only; `main.ts:14, 969-980, 2514` -- delete the rail branch; belt pre-denial for hullRepair (full hp / sinking) beside the empty-slot denial
- `client/src/ui/upgradeMenu.ts` (rail: `26-97, 220-262, 384-430, 483-540, 709, 920-1000, 1384-1530, 1612-1632, 1880-1900`) + `refitCardFit.ts:267+` + `config.ts:1907, 1997-2010` -- DELETE the DAMAGE CONTROL rail/strip end to end; band's lowest edge = card row bottom (amendment 36 seat)
- `client/src/ui/boonCopy.ts:150-434` -- `cardStatRows` for `hullRepair`: `INSTANT` / `OVER TIME` rows from `CONFIG.hullRepair`; `client/src/render/equipmentInfo.ts` -- tooltip prose for the heal
- `client/src/audio/twinMap.ts:46` -- `heal` twin text → HP globe fill + belt count decrement; `tones.ts:115` comment
- `client/src/ui/settings.ts:107` + `client/src/how-to-play/copy.ts:91-92` -- amendment 50 lines only
- `client/src/render/hpGlobe.ts`, `audio/hpSting.ts`, `render/hud.ts` -- comments only (paid pool remains)
- Docs: `DESIGN.md` (rail row: BUILT stamp), `VERSION`/`package.json`+lock 0.18.8, `CHANGELOG.md`, both trackers, `deferred-work.md` (resolve the 8.3 hand-off + the GDD-note-14 entry + the sudden-death pointer; new threads), `epic-8-context.md` Ratified 46–50 (done)

## Tasks & Acceptance

**Execution:**
- [x] amendments 46–50 → `epic-8-context-amendments.md` + `epic-8-context.md` -- durable home first
- [x] `shared/` (constants, types, index, catalog, tests) -- CONFIG split + regen block, `HEAL_CHOICE` gone, stub flip, PV 53, pins -- `npm test -w shared && npm run build -w shared`
- [x] `server/` (hullRepair row, context capability, world regen/clock/deletions, frames, ai tactic, scripts, tests) -- `npm test -w server`; regen tests: 30 s wait, 1 %/s shape, snap, storm reset, drone exclusion; heal tests: afloat-only, full-hp blocked, collapse allowed, bot press
- [x] `client/` (keyboard, main, upgradeMenu, refitCardFit, config, boonCopy, equipmentInfo, twinMap, settings, copy, tests) -- rail deleted, digit table 1–4, pre-denials, card rows -- `npm test -w client`; `tokens`/`fitCheck` green
- [x] docs + version + trackers + ledger -- tracker discipline (one-line stamps)
- [x] `npm run check` green; own server + client boot on scratch ports; PIDs killed

**Acceptance Criteria:**
- Given a default deck, when the match starts, then `hullRepair` is drawable (26 drawable cards per hull) and every other consumable is still a stub.
- Given a stocked HULL REPAIR and a damaged afloat hull, when its digit is pressed with the window closed, then hp rises by 50 at once and 50 more over 5 s through the paid pool (amendment 51), the `heal` cue fires, and one copy leaves the stack and `cards`.
- Given full hull or a sinking hull, when pressed, then nothing is spent and the slot shows the denied pulse + tone (client pre-denial; server `blocked` if reached).
- Given a hull 30 s past its last landed damage, when ticked, then hp climbs by 1 % of missing per second and no `heal` event or pending band appears; a storm bite or any landed hit stops it for 30 s; a fleet drone never regens.
- Given a bot under `healHpFrac` holding a HULL REPAIR stack, when it decides, then it presses the belt slot; `chooseSpend` never returns a negative.
- Given a client on PV 52, when it joins, then the gate refuses it; `SpendMsg.choice` −1 is dropped as malformed.
- Given the refit window, then no DAMAGE CONTROL strip exists, `5` does nothing, and the band's lowest edge (the card row) sits 8 px above the bar.
- Given `npm run check`, then lint, tsc ×3 and every test pass; the 8.4 one-decrement pins hold.

## Spec Change Log

## Review Triage Log

### 2026-09-17 — Review pass (Blind Hunter + Edge Case Hunter on Fable, plus Codex `gpt-5.6-sol` cross-model review — verdicts: Blind Hunter build-on-it, Edge Case Hunter build-on-it, Codex fix-first; all three patched in this pass)
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 1, low 2)
- defer: 4: (high 0, medium 0, low 4)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - `[medium]` `[patch]` P1 — "full hull" had two definitions (the row refused only at exactly max; the regen snapped under 1 hp missing), so a fractional storm/burn gap could cost a whole card for < 1 hp (both Fable hunters). Eric ruled (amendment 53): one shared `hullIsFull` (missing < 1) for the row, the regen snap and the client pre-denial; fail-first tests on all three sides.
  - `[low]` `[patch]` P2 — the regen credited the tick ending exactly on the 30 s mark (Codex, verified): the whole tick must lie past the wait; regen.test boundary pins flipped fail-first.
  - `[low]` `[patch]` P3 — the bot's heal trigger ignored its own draining pool and fired while sinking (Edge Case Hunter + Blind Hunter 3): `want` now reads (hp + repairHp)/maxHp and requires afloat; fail-first pins.
  - deferred (ledger): RL agents draw heals they cannot fire; How-to-Play regen sentence hardcodes the two dials; an exhausted deck's banked levels have no sink; two pre-existing script tsc errors.
  - rejected: Codex 1 (boost ranks above repair — both fire, one deliberation tick apart; no gameplay effect); Blind Hunter 2 (bot re-picks an unstockable consumable — already ledgered by 8.7, amendment 44, owner 8.18); archived docs/codebase-map still describe the 5 key (archived by rule).

## Auto Run Result

**Status: done** (cycle 143, 0.18.8, PROTOCOL_VERSION 52 → 53, epic-8 amendments 46–53).

**Implemented:** HULL REPAIR is the first live consumable (`server/src/game/equipment/consumables/hullRepair.ts` + `row.ts`), fired through the one activation gate via `ctx.applyRepair`, afloat-only, `blocked` when under 1 hp is missing (shared `hullIsFull`, amendment 53), allowed during the collapse; `HEAL_CHOICE`, `spendHeal`, `grantLevelHeal`, the `5` key and the DAMAGE CONTROL rail deleted end to end; `CONFIG.damageControl` → `CONFIG.hullRepair` + `CONFIG.regen`; out-of-combat regen (1 %/s of missing after 30 s wholly past the last landed damage, storm resets, drones excluded) in `tickRepairs`' slot; `lastDamagedAt` stamped at the damage gate; bots press a stocked HULL REPAIR via `CONSUMABLE_TACTICS` (pool-aware, afloat-only); belt pre-denial on the client; HULL REPAIR card rows; Settings/How-to-Play lines per amendment 50; refit band 46 px shorter with the tall-tooltip slide (amendment 52).

**Files:** shared (constants, types, index, catalog, deck, hull, 12 tests), server (world, frames, equipment/index, consumables + row + hullRepair, ai/equipment, tactics, spending, types, profiles, batchsim overrides, rl env/features, 16 tests incl. new regen.test.ts, levelHeal.test.ts deleted, golden snapshot regenerated for the deck-composition change), client (upgradeMenu, refitCardFit, boonCopy, settings, config, main, keyboard, how-to-play copy, twinMap, tones, hpSting, hpGlobe, roomBindings, 16 tests), docs (VERSION/package.json/lock 0.18.8, CHANGELOG, both trackers, deferred-work, DESIGN.md, epic-8 context + amendments 46–53).

**Review:** 3 patches applied (P1 full-hull predicate, P2 30 s boundary, P3 bot trigger), 4 deferred to the ledger, 3 rejected. Blind Hunter and Edge Case Hunter: build-on-it; Codex: fix-first (its boundary finding patched, its ordering finding rejected). `followup_review_recommended: false` — three localized fixes, each fail-first pinned.

**Verification:** `npm run check` exit 0 twice (before and after patches): lint 0 errors (3 pre-existing warnings), tsc ×3 clean, tests 901 shared / 1936 server / 3545 client, hooks 266; server booted on :2599 and Vite on :5299 (both 200), PIDs killed. No browser look in-cycle — Eric's staging pass is the acceptance gate for the card face, the belt press and the regen feel.

**Residual risks:** the regen's feel (1 %/s geometric) has no playtest yet; bots now fire heals one deliberation tick at a time (pool-aware); an exhausted deck's banked levels have no sink (ledgered); the How-to-Play regen sentence hardcodes the two dials (ledgered).

## Design Notes

- **Why `ctx.applyRepair` and not hp writes in the row:** repairs must stay World-owned increase paths and the `heal` event needs the pending queue; the row keeps only its two guards, so the "afloat-only" rule has one home the gate cannot bypass.
- **Why the regen is the second channel in `tickRepairs`' slot, not a new STEP_ORDER entry:** it replaces the level pool's drain at the same pinned position (after every damage source); `stepOrder.test` keeps its name list stable.
- **Why the client pre-denies:** amendment 26's precedent (empty-slot denial is client-only) and the old rail's mirrored guard — a mashed heal key at full hull must not spend a 1.5 s latch on a refusal the client already knows.
- **Why `blocked`:** the existing wire reason for "the action cannot happen here, nothing consumed" (a stern drop ashore); no new `DenialReason`.
- **Why "full" is under 1 hp missing everywhere (amendment 53):** weapon damage is whole (amendment 39) so only storm bites and burn ticks leave a fraction; the regen closes MISSING geometrically and would take minutes to reach the exact max, during which a press bought nothing. One shared predicate keeps the row, the snap and the client pre-denial in agreement.
- **Why the snap-to-full:** 1 % of missing never reaches zero on its own; without the snap HULL REPAIR's "full hull" refusal is unreachable after any regen and the globe reads 349.9 forever.

## Verification

**Commands:**
- `npm test -w shared` then `npm run build -w shared` -- green; hullRepair/regen/NFR6 pins present; deck pins at 26
- `npm test -w server` -- green; regen + heal + bot-press + PV 53 pins
- `npm test -w client` -- green; `grep -rn HEAL_CHOICE shared/src server/src client/src server/scripts` returns nothing
- `npm run lint`; `npm run check` -- exit 0
- `PORT=<free> npm run dev -w server` + client on a free port -- boots; kill own PIDs

**Manual checks (if no CLI):**
- Eric on staging: draw a HULL REPAIR, stock it, fire it damaged and at full hull; sit still 30 s after a hit and watch the globe climb; confirm `5` is dead and the strip is gone.
