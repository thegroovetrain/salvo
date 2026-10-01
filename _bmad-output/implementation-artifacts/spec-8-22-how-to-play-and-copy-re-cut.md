---
title: 'Story 8.22: How-to-Play and Copy Re-cut (+ the three class names)'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
baseline_revision: '28770b41'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** How-to-Play still describes the pre-Pool game (two class slots, one pickup slot, a single gun, no Shift, no consumables, no REDRAW), the Settings key reference still says `Q / E: CLASS SPECIAL SLOTS` and `R: PICKUP SLOT`, and the three hulls still print their working names although Eric has now named them. The page is the ONLY place a feature may be explained (FR71, UX-DR59, UX-DR72), so it must describe the game that exists.

**Approach:** Re-cut the How-to-Play copy from facts verified in code (the pool draw, the gun pick, the class Shift, nine slots, consumable stocking and firing, the level-zero offer and REDRAW; the win condition survives), fix the Settings rows that became false, rename the three classes in the one display table, pin the section set and the no-glossary rule in tests, and record the names in the GDD / design docs with dated stamps. Client-only; no wire change; `PROTOCOL_VERSION` stays 66.

## Boundaries & Constraints

**Always:**
- Eric's rulings this run, verbatim in `epic-8-context-amendments.md` (204–206): class names **SPEEDBOAT** (`torpedoBoat`), **REPEATER** (`mineLayer`), **DREADNOUGHT** (`battleship`) (Eric 2026-10-01: *"Speedboat, Repeater, Dreadnought"*), plain uppercase, no designation prefix and no `CLASS` suffix; internal ids and the identity test UNTOUCHED; the toasts stay `◆ <LINE> FITTED` / `◆ <LINE> STOCKED` (the AC's `card fitted` / `consumable stocked` is shorthand for the 8.7 ruling 14 verb-follows-kind rule).
- Copy is DRAFT FROM VERIFIED CODE FACTS for Eric's pass, exactly as Story 7.3 did (epic-6 amendment 41: a ruling to put information somewhere is not a licence to author it; the module header says so). Every number in the prose is read from `CONFIG` at authoring time and cited in a code comment beside the sentence.
- Register: terse naval; sentences are sanctioned on this page (EXPERIENCE.md:53); headings uppercase mono. American spelling.
- Keys render as keycaps through `makeKeyTable` (the refit-card chip family) — the existing renderer, unchanged.
- **NO glossary**, no heading named GLOSSARY, and no in-game explanatory copy anywhere (Eric: *"NO FUCKING GLOSSARY"*). The banned-word pin (`glossary`, `rarity`, `exclusive`, `mk i`, `subdeck`) survives and gains `starter`, `default deck`, `your deck`.
- `▲ LEVEL UP — TAB TO REFIT` toast and the XP-strip `TAB TO REFIT` cue untouched (UX-DR45).
- The win condition sentence `Last hull floating wins.` survives (FR39, epic-5 amendment 46(c)).
- `npm run check` green; `complexity ≤ 10`; the How-to-Play entry imports no game module (no Pixi, no socket, no shared sim).

**Block If:**
- A fact the copy must state cannot be verified in code (HALT: `intent gaps`, name the fact).
- Any new in-game surface would need explanatory text to make the copy true (Eric's call).

**Never:**
- Rename `ShipClassId` values, `TEST_PROFILE_HULL` rows, `SHIP_CLASS_IDS` or any wire field; bump `PROTOCOL_VERSION`.
- Rewrite code comments that say "Torpedo Boat" / "Mine Layer" / "Battleship" — they are history, not copy.
- Edit `CLAUDE.md`, `DESIGN.md` beyond a dated stamp on the silhouette table, or the GDD beyond dated supersession notes.
- Author a glossary, a card-by-card list, or per-line weapon descriptions as a table — the page teaches the mechanisms, not the catalog.
- Touch the toast strings, `boonFitToastLine`, or `pointToastLine`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Class name prints | `CLASS_DISPLAY_NAMES[torpedoBoat]` | `SPEEDBOAT`; `mineLayer` → `REPEATER`; `battleship` → `DREADNOUGHT` | n/a |
| Every consumer follows | class-select cards, home chip, SHIP tooltip, results identity | print the new names with no other change | n/a |
| Copy section set | `HOWTO_SECTIONS` headings | exactly `THE OBJECTIVE, STEERING, SHOOTING, EQUIPMENT, UPGRADING` in that order | test fails on any add/remove |
| No glossary | `JSON.stringify(HOWTO_SECTIONS)` lowercased | contains none of the banned words; no heading contains `GLOSSARY` | test fails |
| No deck words in client copy | `copy.ts`, `settings.ts` `bindingRows`, `classSelect.ts` strings, `boonCopy.ts` names | no `deck` (except `deck gun`), `DEFAULT`, `STARTER` | test fails |
| Settings rows | `bindingRows()` | `Q / E / R` one row (weapon slots); `SHIFT` row (class SPECIAL); gun row has no word DEFAULT; `1 – 4` row unchanged | test fails |
| Keys as keycaps | mounted page | every key named in the copy appears in the page text (existing pin) | test fails |

</intent-contract>

## Code Map

- `client/src/ui/classNames.ts` -- THE display table; three values change.
- `client/src/ui/classSelect.ts` -- re-exports the table; `SPECIAL_NAMES` / `SPECIAL_KEY` are the Shift words the copy must quote; untouched.
- `client/src/how-to-play/copy.ts` -- `HOWTO_SECTIONS`; the rewrite lives here and only here. `main.ts` (renderer) untouched.
- `client/src/ui/page.ts` -- `makeKeyTable` / `makeKeycap`: the keycap chip family (22 px mono square) already in use; untouched.
- `client/src/ui/settings.ts` -- `bindingRows()` `:102–118`: Q/E and R rows false since 8.5/8.15; gun row says DEFAULT.
- `client/src/__tests__/howToPlay.test.ts` -- re-pin: section set, no glossary heading, banned words, class names, HULL REPAIR, REDRAW, Shift, gun pick, consumables; drop nothing that still holds.
- `client/src/__tests__/settings.test.ts` `:297–370` -- the bindingRows pins (`:364` expects `DEFAULT` on the gun row — change to the new wording).
- `client/src/__tests__/classSelect.test.ts` `:131–133`, `:343–345`; `slotTooltip.test.ts:230`; `home.test.ts` `:184, :225, :262, :393, :581` -- display-name asserts → new names.
- `client/src/__tests__/copyWords.test.ts` -- NEW: the client-copy pin (no `deck`/`DEFAULT`/`STARTER` in `HOWTO_SECTIONS`, `bindingRows()`, `CLASS_DISPLAY_NAMES`, `SPECIAL_NAMES`, the boonCopy line names).
- Facts the copy states (read, not edited): `shared/src/constants.ts` `CONFIG.offer.size 4`, `xp.levelMs 60000`, `boost`, `instantReload`, `damageCut`, `hullRepair`, `regen`; `shared/src/sim/draw.ts` eligibility (`:13–33`, `:154–159`, `:200–208`); `shared/src/sim/loadout.ts` slots `:281–306`, `CONSUMABLE_IS_WEAPON` `:162–181`; `client/src/input/keyboard.ts` bindings; `server/src/game/world.ts` `mulligan` `:2753–2757`.
- Docs: `VERSION`, `package.json`, `package-lock.json` (0.18.26), `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml, epic-8-context.md, epic-8-context-amendments.md (204–206), deferred-work.md}`, GDD `gdd.md` class tables `:118–122`, `:206–210`, `:126` (dated supersession: names land), `catalog-v3.md` stamp if it names a hull, `DESIGN.md:234–238` silhouette table (dated note: display names), `EXPERIENCE.md` Journey headings stamp, `epics.md` Story 8.22 (dated stamp: toasts stay as shipped; SHOOTING re-cut too).

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/ui/classNames.ts` -- `SPEEDBOAT` / `DREADNOUGHT` / `REPEATER`; header comment cites amendment 204 -- Eric's names.
- [ ] `client/src/__tests__/{classSelect,slotTooltip,home}.test.ts` -- update the name asserts -- same behaviour, new words.
- [ ] `client/src/how-to-play/copy.ts` -- ALSO (amendment 206) four sections after UPGRADING: THE GUNS (the pick + one paragraph per gun), WEAPONS (one per equipment line + the mine hit-point rule), CONSUMABLES (one per live consumable; DEPTH CHARGE stub omitted), SHIP UPGRADES (the five ladders) -- Eric 2026-10-01.
- [ ] `client/src/how-to-play/copy.ts` -- rewrite the module header (scope, draft status, the 2026-10-01 re-cut) and the sections: THE OBJECTIVE (unchanged), STEERING (unchanged), SHOOTING (the gun is your pick of three — CANNON clicks a shell to the point, MACHINE GUN holds to stream a magazine then reloads, FLAK bursts in the air; every gun fires all round; islands stop shells), EQUIPMENT (your class: SPEEDBOAT / REPEATER / DREADNOUGHT with the hull word and its SPECIAL on `Shift` — SPEED BOOST / INSTANT RELOAD / DAMAGE CUT, one line each with the CONFIG numbers; the nine squares on the bar: gun, Shift, Q/E/R weapons, 1–4 belt; select/cancel/return-to-gun; arcs drawn when a weapon has one), UPGRADING (levels per minute and per kill, the assist split kept; the refit's four cards from the ONE pool every captain shares — a weapon while a weapon square is empty, upgrades and consumables once all three are full; the countdown offer opens by itself and REDRAW once; consumables stock on the belt and some fire on the key, some prime then click; HULL REPAIR 50 at once + 50 over 5 s; regen sentence kept; cannot fire while the refit is open) -- the AC's list, from code.
- [ ] `client/src/ui/settings.ts` -- `Q / E / R` → `WEAPON SLOTS — PRESS TO SELECT, AGAIN TO CANCEL`; new `SHIFT` row `CLASS SPECIAL`; gun row `GUN — ALWAYS SELECTED; CLICK ITS HOTBAR TILE TO RESELECT`; header comment dated -- the three rows became false (amendment 50's rule).
- [ ] `client/src/__tests__/settings.test.ts` -- re-pin the three rows -- current truth.
- [ ] `client/src/__tests__/howToPlay.test.ts` -- exact section-set pin, no `GLOSSARY` heading, banned-word list extended, class-name / Shift / gun-pick / REDRAW / HULL REPAIR / consumable pins; keep the win-condition, regen, assist and no-`P`/no-`5` pins -- the AC's pins.
- [ ] `client/src/__tests__/copyWords.test.ts` -- NEW client-copy word pin -- the `deck`/`DEFAULT`/`STARTER` AC.
- [ ] GDD `gdd.md` -- dated supersession at `:116` and the two class tables: names land (SPEEDBOAT · REPEATER · DREADNOUGHT), `[NAME PENDING]` closed; `DESIGN.md` silhouette table + `EXPERIENCE.md` Journeys B/C: one dated line each -- the facts changed (Story 9.11 reconciles prose).
- [ ] `epics.md` Story 8.22 -- dated stamp: toasts stay as shipped (amendment 205); SHOOTING re-cut with the gun pick -- the AC's reading.
- [ ] `epic-8-context-amendments.md` 204–206, `epic-8-context.md` (Ratified list + "Still open" line), `deferred-work.md` (close the designation entry `:2402`, close the regen-sentence entry `:2230` as restated-with-citation, add any new threads), `CHANGELOG.md` 0.18.26, `VERSION` / `package.json` / `package-lock.json`, both trackers (one-line stamps) -- the landing rule.

**Acceptance Criteria:**
- Given the client build, when any surface prints a class name, then it reads SPEEDBOAT, REPEATER or DREADNOUGHT and nothing else changes on that surface.
- Given `/how-to-play`, when it mounts, then the five sections render in order with keycaps, every mechanism in the AC is explained from code facts, the win condition is stated, and no glossary heading exists.
- Given the client copy sources, when the word pin runs, then no `deck` (other than `deck gun`), `DEFAULT` or `STARTER` string is found.
- Given Settings, when the key reference opens, then Q/E/R are one weapon-slot row, Shift has its own row, and no row is false against `keyboard.ts`.
- Given the whole change, when `npm run check` runs, then it exits 0 and `PROTOCOL_VERSION` is still 66.

## Spec Change Log

- **2026-10-01, mid-run (Eric ruling, amendment 206) — WEAPON DESCRIPTIONS ADDED.** Eric: *"I want instructions on how to play like there are now. But I also want descriptions of every weapon. Do NOT call Torpedoes 'Fish.' Write it like a human. Like *I* wrote it."* The intent-contract's Never-clause "Author a glossary, a card-by-card list, or per-line weapon descriptions as a table" was an orchestrator over-reading of "NO glossary"; the ruling wins and the contract is left as written (read-only) with this entry as the record. Amended: four sections (THE GUNS · WEAPONS · CONSUMABLES · SHIP UPGRADES) of plain paragraphs after UPGRADING; the section-set pin grows to nine; a no-"fish" pin and an every-line-described pin are added. Known-bad state avoided: a How-to-Play that teaches the mechanisms but leaves a new player unable to tell a captive mine from a fouling mine. KEEP: still no heading named GLOSSARY, no stat tables, no in-game copy; the flak anti-ordnance side effect is NOT described (amendment 105).
- **2026-10-01, mid-run (Eric) — MODEL ROUTING.** *"use /orchestrate for model selection for subagents. Don't waste fable."* Fact-gathering and mechanical landings on Sonnet, the implementation on Opus, the review gate on Fable (amendment 207(e)).

## Review Triage Log

## Design Notes

- **Why the copy is still "draft":** Story 7.3's precedent (its header) — Eric holds the pen on this page; the implementer drafts from verified facts and Eric's pass freezes it. Nothing here waits on that pass to land; it is how the file is labelled.
- **Why SHOOTING is re-cut although the AC names only EQUIPMENT and UPGRADING:** "Click where you want the shell to land" is false for a MACHINE GUN captain; the AC's gun-pick clause has to live where shooting is taught. Recorded as an orchestrator reading (206) for Eric's veto.
- **Why no section lists the catalog:** UX-DR59 — a stat row or a glyph, never a sentence, on any in-match surface; and the page teaches HOW the pool works, not WHAT is in it. A per-line list is a glossary by another name.
- **Why the numbers are prose, not derived:** the page imports no game module by design (`main.ts` header); `CONFIG` would drag `@salvo/shared` into the manual chunk. Each sentence carries a code comment citing the `CONFIG` field so a retune finds it (closes the `:2230` ledger entry as restated-with-citation).

## Verification

**Commands:**
- `npm test -w client` -- expected: green, incl. the re-cut `howToPlay.test.ts`, `settings.test.ts` and the new `copyWords.test.ts`
- `npm test -w shared && npm test -w server` -- expected: green, untouched counts
- `npm run lint` -- expected: zero errors
- `npm run check` -- expected: exit 0
- `grep -rn "TORPEDO BOAT\|MINE LAYER\|BATTLESHIP" client/src --include='*.ts' | grep -v __tests__ | grep -v "^\S*:\s*//\|\* "` -- expected: no string literal matches
- `grep -n "PROTOCOL_VERSION = " shared/src/index.ts` -- expected: 66
