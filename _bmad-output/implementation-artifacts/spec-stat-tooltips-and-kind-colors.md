---
title: 'Stat tooltips (one number per line), color-coded refit cards, machine-gun retune'
type: 'feature'
created: '2026-09-30'
status: 'in-progress'
baseline_revision: '1252080'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** Eric (2026-09-30): the in-game weapon descriptions *"suck"* (he hates torpedoes being called "fish"); a hover should show a weapon's **actual stats, one number per line**, not prose. Weapon descriptions will live in How-to-Play (Story 8-22 — NOT this cycle). The refit window's cards need **color coding** so a player sees at a glance whether a card is a weapon, a weapon upgrade, a ship upgrade or a consumable. And, same cycle: the **machine gun** fires too slowly and its reload belt is wrong.

**Approach:** (1) The HUD bar's slot tooltip drops its prose paragraph and its `BOONS ACCRUED` build list and prints the hovered slot's live stat table, one `LABEL value` per line, reusing the refit card's row vocabulary and formatters. (2) Hovering the HP globe opens a `SHIP` tooltip with the five ship stats (Eric's pick: the globe is the hull). (3) The refit card's hover panel prints the same stat list for the thing the card touches instead of the prose explanation. (4) Every prose description string (`EQUIPMENT_DESCRIPTION`, `BOON_EXPLAIN`) is deleted — no "fish" survives on any in-game surface. (5) The refit card's KIND word and resting border are colored by kind: WEAPON phosphor · WEAPON UPGRADE info · SHIP UPGRADE storm-readout · CONSUMABLE silver (Eric's picks; supersedes epic-8 amendment 8's neutral kind word). (6) MACHINE GUN (Eric, verbatim rulings 2026-09-30): shot delay **0.35 / 0.31 / 0.27 / 0.23 / 0.20 s** at tiers I–V (authored per-tier `rateMs` steps −40/−40/−40/−30 ms, the `tieredWeaponSteps` shape on a ladder); reload **base 10 s** with the existing −5 %/tier convention (10 → 9.5 → 9 → 8.5 → 8 s before `cooldownScale`); the **5 s idle delay is deleted** — the swap starts the moment the stream stops with shells left (or the magazine empties); **firing during a partial-magazine swap cancels it** and it restarts from the full time when the stream stops again; an **empty magazine cannot interrupt** its swap. `PROTOCOL_VERSION` 63 → 64 (catalog content + a stats-row field removed). Version 0.18.22, cycle 157.

## Boundaries & Constraints

**Always:** every number the tooltips print comes off `effectiveStats()` (live `stats` for a slot; the preview `after` fold for a card) or `CONFIG` for consumables — never a literal; labels reuse `FIELD_WORDS` / `PATH_WORDS` / `STAT_LINES` words or the existing humanizer (no new vocabulary invented); colors are ratified tokens only (`var(--hc-*)` / `cssRgba(CLIENT_CONFIG.colors.*)` — the token guard scan stays green); the KIND WORD is the non-color channel (dual-coded); the hover panels stay HOVER-ONLY (R2.17 pin); the slot tooltip keeps its 320 px width, type register, notch and above-the-square placement (amendment 42) and the refit hover keeps amendments 37/52 placement; both container-fit pins keep walking the whole catalog; the machine gun's numbers stay harness dials and go through the one `effectiveStats` fold (server reads `stats.equipment.machineGun.*`); amendment 98 (INSTANT RELOAD finishes a running swap) and 111 (stream only while the gun is the selected slot) stand; damage stays whole; American spelling; How-to-Play is NOT touched.

**Block If:** a stat the player needs has no honest reader (a derived number with no path on the stats row and no CONFIG source) — surface it, do not invent; any wire shape beyond the PV literal would change; the stream/swap state machine cannot express Eric's four rules without a new wire field.

**Never:** edit `client/src/how-to-play/copy.ts`; touch `boonEffectLine` / the results LOADOUT block / `boonKindLabel` as results uses it; change any gameplay number other than the machine gun's; re-derive a stat outside `effectiveStats`; edit `CLAUDE.md`; rewrite earlier amendments (append); edit GDD/epics/EXPERIENCE beyond dated stamps (DESIGN.md gets dated inline stamps on the two component rows; catalog-v3 R20/R21 and the GDD machine-gun row get dated supersession stamps only); launch a batch sim.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Weapon slot hover | Q holds `heavyTorpedo`, 2 copies, torpedo boat | `HEAVY TORPEDO` / `WEAPON · Q · SWITCH-TO · TIER II` / lines `RELOAD 28.5 s`, `ROUNDS 1`, `SPEED 65`, `DAMAGE 50`, `HOMING 0.125 rad/s` (the `EQUIPMENT_STAT_FIELDS` order, live values) | No error expected |
| Mine slot hover | R holds `navalMines` | rows in table order with the derived `TRIGGER RADIUS` right after `BLAST RADIUS` (the card's `triggerFollows` rule) | No error expected |
| Gun square hover | cannon, 1 DECK GUN card | `CANNON` / `WEAPON · ALWAYS SELECTED · TIER II` / `RELOAD`, `ROUNDS`, `DAMAGE`, `CONTACT DMG`, `BURST RADIUS`, `SHELLS PER SHOT`, then `RANGE 660 u` last | No error expected |
| Machine gun hover | machineGun mounted, tier I | `RELOAD 10.0 s`, `SHELLS 16`, `DAMAGE 4`, `RATE 0.35 s`, `RANGE 660 u` — no idle line | No error expected |
| Shift square hover | boost / instantReload / damageCut | boost: `BOOST +25%`, `DURATION 10.0 s`, `RELOAD 25.0 s`; instantReload: `RELOAD 45.0 s`; damageCut: `CUT 50%`, `DURATION 8.0 s`, `RELOAD 30.0 s` — no `ROUNDS 1` line on a single-charge Shift | No error expected |
| Belt slot hover | slot 5 holds `hullRepair` ×2 | `HULL REPAIR` / `CONSUMABLE · 1 · KEY FIRES · ×2` / the existing `CONSUMABLE_ROWS` (`INSTANT +50 HP`, `OVER TIME +50 HP / 5 S`) | No error expected |
| HP globe hover | pointer inside the HP globe circle, dwell elapsed, not `dim` | `TORPEDO BOAT` / `SHIP` (amber) / `MAX HULL 250`, `TOP SPEED 45`, `TURNING …`, `RADAR SWEEP 15 RPM`, `ALL COOLDOWNS 100%`; panel centered above the globe's bounding square | No error expected |
| Helm globe / water / empty slot hover | pointer on the helm globe, between squares, or on an unfitted slot | no tooltip (unchanged) | No error expected |
| Refit card hover — weapon copy 1 | `lightTorpedo` offered, none held | panel: `LIGHT TORPEDO` over the light torpedo's full table valued AFTER the card (the face's tense) | No error expected |
| Refit card hover — ship ladder / gun ladder | `armor` / `deckGunBarrel` offered | five ship stats after the card / the mounted gun's full table after the card | No error expected |
| Refit card hover — consumable | `smokeScreen` offered | name, the shape line `CONSUMABLE · 1 · KEY FIRES · ×n` (as today), then `CONSUMABLE_ROWS` | No error expected |
| Refit card hover — no rows | a stub (never dealt) | no panel (fail-open as today) | No error expected |
| Card kind | weapon copy 1 / weapon tier 2+ or any gun ladder (`deckGun`, `deckGunTurret`, `deckGunBarrel`, `machineGun`, `flak`) / `armor`,`speed`,`turning`,`radarSweep`,`reload` / consumable | `WEAPON` phosphor / `WEAPON UPGRADE` info / `SHIP UPGRADE` storm-readout / `CONSUMABLE` silver, on the word and the resting border | No error expected |
| Armed / greyed card | hover or `SLOTS FULL` | armed: edge + glow amber as today (kind word keeps its color); greyed: face at `.55` as today | No error expected |
| "fish" | any in-game string | none (grep of player-facing strings is empty) | No error expected |
| MG cadence by tier | tiers I–V | `rateMs` 350 / 310 / 270 / 230 / 200; `reloadMs` 10000 / 9500 / 9000 / 8500 / 8000 (× `cooldownScale`); magazine 16→24, damage 4→8 unchanged | No error expected |
| MG stream stops with shells left | held released (or gun deselected) at `n = 9` | the swap starts THAT tick (`reloadMsLeft = reloadMs`), no idle wait | No error expected |
| MG fires during a partial swap | `n = 9`, swap running, held again on the gun slot | swap cancelled (`reloadMsLeft = 0`), shells fire; when the stream stops the swap restarts from the FULL time | No error expected |
| MG empties | `n → 0` | the swap starts at once; a hold during it fires nothing and does not reset the timer; the magazine fills at the end | No error expected |
| MG swap completes | timer hits 0 | `n = maxAmmo`; a hold fires immediately | No error expected |
| INSTANT RELOAD during an MG swap | Mine Layer Shift pressed | the swap completes at once (amendment 98) — unchanged | No error expected |
| MG tier card | tier II offered | face rows `RELOAD 10.0 s → 9.5 s`, `SHELLS 16 → 18`, `DAMAGE 4 → 5`, `RATE 0.35 s → 0.31 s` (every authored step; `rateMs` joins `EQUIPMENT_STAT_FIELDS.machineGun`) | No error expected |

</intent-contract>

## Code Map

- `client/src/render/slotTooltip.ts` -- the slot tooltip's pure core: `TooltipModel` (drop `description`/`boons`, add `stats: readonly CardStatRow[]`), `tooltipModel` (+ the `'ship'` target), the fit model (`tooltipMetrics`: heading + n stat lines at `boonLineHeight`; delete `fitBoonRows`/`trimmedBoonRows`/`moreBoonsRow`/`boonRows`/`slotBoonIds`/`boonBlockText`/`SHIP_DIVIDER_ROW`/`TooltipBoonRow`), `tooltipRenderGeom` (no measured-desc reconciliation — mono lines, model = render), `tooltipFrame`, `HoverState.target: number | 'ship' | null`
- `client/src/render/hotbar.ts:806` `slotAtPoint` (unchanged) + new `hoverTargetAt(p, layout)` (`'ship'` when inside `layout.hpGlobe`); `:987-1010` tip Text objects (`tipDesc`/`tipBoons` → two mono columns `tipLabels` / `tipValues`); `:1296-1345` `updateTooltip` / `cachedModel` (key on the target); `:1369-1385` `drawTooltip` (anchor rect = square, or the globe's bounding square); `:848-890` styles
- `client/src/render/equipmentInfo.ts` -- delete `EQUIPMENT_DESCRIPTION`, `equipmentDescription`, `EquipmentInfo.description`; keep names, `interactionLine`, tiers
- `client/src/ui/boonCopy.ts` -- delete `BOON_EXPLAIN`, `boonTooltipText`, `DOCTRINE_HOLDING` (and its read in `boonEffectLine`); ADD the shared builders: `equipmentStatRows(target, stats)` (absolute rows in `EQUIPMENT_STAT_FIELDS` order + derived `TRIGGER RADIUS` via `triggerFollows` + `RANGE` from `rangeU` last; Shifts: `BOOST +25%` / `CUT 50%` from CONFIG factors, no `maxAmmo` line), `consumableStatRows(id)` (= `CONSUMABLE_ROWS`), `shipStatRows(stats)` (the five `STAT_LINES` ladders, labels uppercased, live values), `cardHoverRows(line, copiesHeld, you)` (the AFTER-fold table for the card's target); `cardKind(line, copiesHeld)` + `cardKindLabel` (`WEAPON` / `WEAPON UPGRADE` / `SHIP UPGRADE` / `CONSUMABLE` / `ADD-ON`) + `KIND_WORDS` re-derived; `FIELD_WORDS.rateMs: 'RATE'`
- `client/src/ui/classSelect.ts:52-54` -- export the class display-name table for the SHIP tooltip's heading
- `client/src/ui/refitTooltip.ts` -- `RefitTooltipModel { name; interaction?; stats }` (drop `body`); metrics: rows at `nameSize` mono, `lineBox` each, one `rowGap` before the block; `refitTooltipModel(line, name, stats, copiesHeld)`; widest-token over labels + values
- `client/src/ui/upgradeMenu.ts:113-119` META ruling comment; `:370-410` `OfferCard.tooltip: string` → `hover: readonly CardStatRow[]` + `kindColor`; `:550` `toCard`; `:1089-1097` `KIND_CSS`; `:1219-1233` `paintCard` (kind word color + resting border `cssRgba(token, .55)`, armed amber unchanged); `:1392-1420` `RefitTipEls`/`tipModelFor`/`fillTip` (rows as DOM lines: label text-secondary, value phosphor, mono 14px); `:1581-1635` `makeTip`/`showTip` (empty rows → hidden); `:1377` card signature
- `shared/src/constants.ts` `CONFIG.machineGun` -- `rateMs` 500 → 350, `reloadMs` 15000 → 10000, DELETE `idleReloadMs`; doc block re-cut (amendment numbers)
- `shared/src/sim/catalog.ts:444-449` -- `machineGun` becomes a ladder with FOUR explicit tier lists (a `ladderSteps` twin of `tieredWeaponSteps`, or `ladder` with per-tier arrays): each `maxAmmo +2`, `damage +1`, plus `rateMs` −40 / −40 / −40 / −30; `appliesTo` unchanged
- `shared/src/sim/effects.ts:130` -- `EQUIPMENT_STAT_FIELDS.machineGun` gains `rateMs`; `shared/src/sim/stats.ts:165-175,446-447` -- drop `idleReloadMs` from `EffectiveMachineGun` and the row build; `shared/src/index.ts:754` -- PV 63 → 64 + history line
- `server/src/game/equipment/machineGun.ts:85-115` -- the swap rule: not streaming ∧ `n < maxAmmo` ∧ `reloadMsLeft === 0` → `reloadMsLeft = reloadMs`; a shot with `n > 0` → `reloadMsLeft = 0`; `n === 0` → the swap runs untouched; `streamLastShotAt` idle read deleted (keep the field only if something else reads it); `server/scripts/batchsim/*` harness `--tune machineGun.*` dial list (drop idle)
- `server/src/__tests__/machineGunStream.test.ts` (:7,:125,:221,:237 cadence/reload pins → 350 ms / 10 s; new cases: immediate swap on release, cancel-and-restart, empty magazine uninterruptible), `machineGunFlashCost.test.ts:18-20` (comment + the 20-bot `mz` measurement note re-read at 350 ms), `shift.test.ts` (amendment 98 case on the new numbers), `botTactics.test.ts` / `botPolicy.test.ts` if they pin cadence; `shared/src/__tests__/stats.test.ts:165-169,:414` (row shape without idle; rate ladder per tier), `catalog.test.ts` (machineGun tier shape); `client/src/__tests__/cardStatRows.test.ts:144,:293-337,:620-625` (MG rows: `RELOAD 10.0 s>9.5 s`, `RATE 0.35 s>0.31 s` …), `refitCardFit.test.ts` (MG tier card now 4 rows — still ≤ 5)
- `client/src/__tests__/slotTooltip.test.ts`, `tooltipFit.test.ts`, `hotbar.test.ts`, `boonCopy.test.ts` (:251 hover-explanation suite → stat rows; :38 kind words), `refitTooltipFit.test.ts` (:438 "KIND is a word only" → word AND color; fit walk over `cardHoverRows` for every line × class × 0..cap), `refitCardFit.test.ts` (longest kind word `WEAPON UPGRADE`), `upgradeMenu.test.ts` (`tooltip` → `hover`, DOM rows, border color), `gunPickHud.test.ts:98` (Shift descriptions → Shift stat lines off CONFIG), `ordnanceMasksAreServerOnly.test.ts` PV pin -- re-pins
- Docs wave: `VERSION`, `package.json`, `package-lock.json` (0.18.22), `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml, epic-8-context.md (item 8 + Ratified section), epic-8-context-amendments.md (append 178+), deferred-work.md (hover-description DRAFT entries: resolved by deletion)}`, `DESIGN.md` `components.refit-card` (`kind`: color-coded, v4.2 stamp) and `components.slot-tooltip` (stats one per line; no BOONS ACCRUED; HP globe SHIP tooltip), `catalog-v3.md` R20/R21 + GDD machine-gun row dated stamps

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts`, `shared/src/sim/catalog.ts`, `shared/src/sim/effects.ts`, `shared/src/sim/stats.ts`, `shared/src/index.ts` -- the machine-gun numbers, the `rateMs` ladder, drop `idleReloadMs`, PV 64 -- Eric's retune, one fold
- [ ] `server/src/game/equipment/machineGun.ts` + its tests -- the four swap rules -- immediate start, cancel-and-restart, empty uninterruptible, complete → full
- [ ] `client/src/ui/boonCopy.ts` -- delete the prose tables; add `equipmentStatRows` / `consumableStatRows` / `shipStatRows` / `cardHoverRows` / `cardKind` / `cardKindLabel` -- one builder feeds both tooltips and the card face
- [ ] `client/src/render/equipmentInfo.ts` -- delete descriptions -- no prose, no "fish"
- [ ] `client/src/render/slotTooltip.ts` + `client/src/render/hotbar.ts` + `client/src/ui/classSelect.ts` -- stat-line model, `'ship'` target on the HP globe, two-column mono render -- the slot and SHIP tooltips
- [ ] `client/src/ui/refitTooltip.ts` + `client/src/ui/upgradeMenu.ts` -- stat-row hover model/render; kind colors on word + resting border -- Eric's rulings
- [ ] tests listed in the Code Map -- re-pin; add: stat-line content per equipment, ship target hit-test + placement, refit hover rows per kind, kind word/color per kind, both fit walks, no player-facing "fish", MG cadence per tier and the swap state machine
- [ ] docs wave -- version, changelog, both trackers, amendments, epic-8-context, deferred-work, DESIGN.md / catalog-v3 / GDD stamps

**Acceptance Criteria:**
- Given any fitted slot, when hovered past the dwell, then the panel shows name, the interaction line and one `LABEL value` per stat with values equal to `effectiveStats()` for that hull's cards, and no prose.
- Given the HP globe, when hovered past the dwell (bar visible, refit closed), then a `SHIP` panel lists MAX HULL, TOP SPEED, TURNING, RADAR SWEEP, ALL COOLDOWNS at live values, placed above the globe and never off-screen.
- Given any offered card, when hovered, then the panel lists the stat table of what the card touches at the after-card values (consumables: shape line + rows); a card with no rows shows no panel; keyboard never opens it.
- Given the four card kinds, when rendered, then the KIND word reads WEAPON / WEAPON UPGRADE / SHIP UPGRADE / CONSUMABLE and the word and resting border carry phosphor / info / storm-readout / silver; armed and greyed states are otherwise unchanged.
- Given a machine gun at tier n, when the stream runs, then one shell every 350/310/270/230/200 ms; when the stream stops with shells left the swap starts that tick and a new hold cancels it; an empty magazine swaps for `reloadMs × cooldownScale` uninterrupted and fills at the end.
- Given the whole catalog on every class, when both fit pins walk it, then every panel fits its container at the 1280×614 floor.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, all tests and the hook test pass; the token guard finds no literal.

## Spec Change Log

## Review Triage Log

## Design Notes

Orchestrator readings (Eric may veto any): (a) the tooltip lines reuse the card rows' strings byte-for-byte (`DAMAGE 50`, `RELOAD 30.0 s`, `RADIUS 150 U`) so the face, the slot hover and the card hover never disagree; (b) `RANGE` is appended last for rows carrying `rangeU` (a derived number the face never printed); (c) a Shift prints no `ROUNDS 1` and gets its factor line off `CONFIG` (`BOOST +25%`, `CUT 50%`); (d) the card hover is valued AFTER the card, the face's tense; (e) resting border = kind token at .55 alpha via `cssRgba`, armed stays amber; (f) gun ladders are WEAPON UPGRADE (they upgrade the mounted gun); (g) the SHIP tooltip anchors on the globe's bounding square; the helm globe stays silent; (h) MG `RATE` prints in seconds like every `*Ms` field (`0.35 s`), the humanizer's word; (i) the MG reload ladder is the DERIVED convention on a 10 s base (Eric: *"applying whatever convention from there"*), so 10 / 9.5 / 9 / 8.5 / 8 s — his earlier "10/9/8/7/6" is superseded by that sentence; (j) "stream stops" = no shell fired this tick because `held` is false or the gun is not the selected slot (amendment 111), so the swap starts on the first non-firing tick — no grace.

## Verification

**Commands:**
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: green, counts recorded
- `npm run check` -- expected: lint 0 errors, tsc ×3, all tests + hook test green
- `grep -rn -i "fish" client/src --include='*.ts' | grep -v __tests__ | grep -E "'[^']*fish|\"[^\"]*fish"` -- expected: no player-facing string

**Manual checks (if no CLI):**
- Eric's eye on staging: the three panels, the four card colors, the machine gun's feel.
