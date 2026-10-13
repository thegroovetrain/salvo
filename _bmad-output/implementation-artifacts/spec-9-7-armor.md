---
title: 'Story 9.7: Armor'
type: 'feature'
created: '2026-10-13'
status: 'in-review'
baseline_revision: 'ff3ca858'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-6-five-tiers-and-passive-healing.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The only way to be tough is more hull. Eric wants a second toughness axis that is distinct from HULL POINTS: a passive ARMOR ladder that shrinks every hit, with the Dreadnought's DAMAGE CUT stacking on top of it as temporary Armor instead of a flat halving.

**Approach:** A universal `armor` ladder (cap 5, +1 per card) folds through `effectiveStats()` into `armor` and `damageMultiplier = K / (K + armor)`, `K = CONFIG.armor.k = 5`. The one damage gate multiplies every non-storm blow by the victim's multiplier (the cut's window adds `CONFIG.damageCut.armorBonus = 5` to the armor inside the formula) BEFORE the shield absorbs; blows floor, burn and grind ticks keep their fraction. The flat `damageCut.factor` is deleted. Eric's rulings (2026-10-13, this spec step): numbers as accepted; ARMOR sits right after HULL in the ladder order; the card prints `ARMOR 0 → 1`; the tally reads what landed; the SHIP hover panel and How-to-Play ship table gain a seventh row; LOADOUT splits 4 + 3; the DAMAGE CUT head row prints `ARMOR +5`; the defensive bot profile favors it.

## Boundaries & Constraints

**Always:**
- `effectiveStats()` is the ONLY derivation of `armor` and `damageMultiplier`; the gate reads a pure shared helper `damageMultiplierFor(armor)` for the cut's `armor + armorBonus` case so one formula lives in one place (`shared/src/sim/stats.ts`).
- The gate order is unchanged: (a) no friendly fire → (b) phase/sinking → (b′) armor multiply (every source but `'storm'`) → (c) shield → (d) one hp write. A whole-hp blow (`shell`, `burst`, `torpedo`, `mine`, `contact`) is `Math.floor`ed after the multiply; `'burn'` and `'grind'` keep their fraction. Storm bites land in full.
- `creditDamage` and the `dmg` event keep reading the POST-multiply, post-shield figure (Eric: "what landed").
- Mass for ramming stays `effectiveStats().maxHp`; ARMOR adds no mass.
- `CONFIG.armor = { k: 5, perTier: 1 }`; `CONFIG.damageCut = { armorBonus: 5, durationMs: 10000, maxAmmo: 1, reloadMs: 30000 }`; `factor` is DELETED everywhere (CONFIG, `EffectiveDamageCut`, whitelist comments, tests). `armorBonus` is a CONFIG pass-through on the stats row like `factor` was: not card-addressable, reachable by `--tune damageCut.*`.
- The catalog ladder is `armor: ladder('armor', 5, [statEffect('armor', { add: CONFIG.armor.perTier })])`, seated in `LINE_IDS` immediately after `hullPoints`. 25 lines / 122 cards; universal ladders 7 (35 cards). The fold's positive-result guard is fine for base 0 + 1.
- Client surfaces derive from the sim: `LINE_NAMES.armor = 'ARMOR'`; `STAT_LINES.armor = { label: 'Armor', path: 'armor' }` (integer print); `SHIP_STAT_LINES` and `LADDER_LINES` = `hullPoints, armor, speed, turning, radarSweep, reload, passiveHealing`; `DASH_AT_ZERO` includes `armor`; LOADOUT `LADDERS_PER_ROW` 3 → 4 (7 → 4 + 3), fit-checked against the 530 px column; `SHIFT_HEADS.damageCut` prints `ARMOR +5` from `stats.equipment.damageCut.armorBonus`.
- The ARMOR glyph is rendered as candidates (real glyph primitives, beside HULL / SPEED / PASSIVE HEALING at card and LOADOUT size) to an artifact and Eric picks BEFORE the client commit (amendment-98 gate). How-to-Play stays frozen (amendment 96): `armor` joins `AWAITING_COPY`; the ship-upgrade TABLE derives and gains the row.
- Bots: `UpgradeFavorite` gains `'armor'`; the defensive profile's `favoriteUpgrades` = `['hullPoints', 'passiveHealing', 'armor']`; harness `balanceProbe` universal list gains `armor`; `--tune` families gain `armor.`; `damageCutCues` unchanged.
- `PROTOCOL_VERSION` 80 → 81 (catalog content; the client reads `CONFIG.armor` through the fold). Nothing new rides the wire; the six perception exceptions untouched.
- Tests assert contracts, never vocabulary or ruled literals as coincidences (amendment 243 of epic 8, epic-9 amendment 8). Count pins (24/117 → 25/122) re-base citing amendments 110–117. The cut's gate tests re-base from "×0.5" to "Armor 5 → ×0.5" with the ruling cited.
- Version 0.18.49, cycle 184; amendments 110–117 appended to BOTH `epic-9-context-amendments.md` and the `## Ratified Amendments` section of `epic-9-context.md`; both trackers stamped ONE line each; `epics.md` 9.7 stamped; CHANGELOG.
- One PR to `development` at the end, never merged.

**Block If:** any further design gap (a number, copy, a visual) that these rulings and amendments 85–89 do not cover → AskUserQuestion before the PR, never a ledger entry.

**Never:** a HUD readout for Armor (hover panels only); a second multiplier site; a per-class armor; a depth charge; editing How-to-Play prose; How-to-Play ARMOR entry text (9.12's); GDD / catalog-v3 mechanics stamps (9.12's); merging the PR; CLAUDE.md edits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ladder fold | n `armor` cards (0..5) | `stats.armor = n`; `damageMultiplier = round3(5 / (5 + n))` → 1 / 0.833 / 0.714 / 0.625 / 0.556 / 0.5 | unknown id fails closed |
| Blow at Tier V | 15 hp shell, armor 5, no cut | 7 hp dealt (floor 7.5); `dmg.amount` 7; tally +7 | — |
| Blow under cut, Tier 0 | 15 hp shell, armor 0, `now < damageCutUntil` | 7 (×0.5, today's number) | — |
| Blow under cut, Tier V | 50 hp torpedo, armor 5 + 5 | 16 (×1/3, floor 16.67) | — |
| Burn tick | 0.5 hp burn, armor 5 | 0.25 exactly, banks into the DoT window | never floored to 0 |
| Grind tick | 0.2 hp grind, armor 2 | 0.1428… exactly | — |
| Storm | 3 hp bite, armor 5, cut open | 3 hp (exempt) | — |
| Shield order | 20-hp shield, 30 hp shell, armor 5 | multiply → 15, shield eats 15, hp untouched, `dealt` 0, regen clock untouched | — |
| Overkill | 1 hp left, 50 hp blow, armor 5 | dealt 1, tally +1 (post-multiply 25 then clamp) | — |
| Cut window | activation at `now` | `damageCutUntil = now + 10000`; reload 30000 × cooldownScale | — |
| Self-hit | own shell on own hull | refused before the multiply (friendly fire floor) | — |
| LOADOUT | 7 ladders | row 1 HULL ARMOR SPEED TURNING; row 2 RADAR SWEEP RELOAD PASSIVE HEALING; dash at zero | — |
| Card face | `armor` at 2 copies | tier `II → III`, one row `ARMOR 2 → 3` | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.armor { k 5, perTier 1 }` (new, doc cites amendments 86–88); `CONFIG.damageCut` loses `factor`, gains `armorBonus 5`, `durationMs` 8000 → 10000
- `shared/src/sim/catalog.ts` -- `armor` ladder after `hullPoints`; `LINE_IDS` seat 1; header counts 25 / 122, universal 7 (35)
- `shared/src/sim/effects.ts` -- `TOP_LEVEL_STAT_PATHS` + `'armor'`; `damageCut` row comment (`armorBonus` pass-through replaces the `factor` bullet)
- `shared/src/sim/stats.ts` -- `EffectiveStats.armor`, `.damageMultiplier`; `EffectiveDamageCut.armorBonus` (factor deleted); `baseStats` seeds `armor: 0`, `damageMultiplier: 1`; `clampStats` floors/clamps `armor ≥ 0` and derives `damageMultiplier = damageMultiplierFor(armor)` (round3); exported pure `damageMultiplierFor(armor)`
- `shared/src/sim/boons.ts` -- `rePinDerived` twin re-pins `damageMultiplier` if that home re-pins top-level derived values (check; follow the `sightRange` precedent)
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 81 + history line; export `damageMultiplierFor`
- `shared/src/__tests__/{catalog,barrel,stats,shipClasses,draw,loadout}.test.ts` -- counts, order, absent-path list (`damageCut.factor` → `damageCut.armorBonus`), CONFIG shape pins, multiplier table
- `server/src/game/world.ts` -- `cutDamage` → `armorDamage(victim, amount, src)`: storm passthrough; `armor = victim.stats.armor + (now < damageCutUntil ? victim.stats.equipment.damageCut.armorBonus : 0)`; `× damageMultiplierFor(armor)`; floor unless burn/grind; doc block (b′) rewritten
- `server/src/game/equipment/damageCut.ts` -- header comment only (no factor)
- `server/src/game/ai/profiles.ts` -- `UpgradeFavorite` + `'armor'`; defensive favorites
- `server/scripts/batchsim/balanceProbe.ts`, `overrides.ts` -- universal list + `armor.` tune family
- `server/src/__tests__/{damageGate,shift,contactDamage,upgrades,goldenFrames,...}.test.ts` -- gate contract rows (matrix), cut re-base, golden re-record (offer ids / draw shift only)
- `client/src/ui/boonCopy.ts` -- `LINE_NAMES.armor`, `STAT_LINES.armor`, `SHIP_STAT_LINES`, `SHIFT_HEADS.damageCut` → `ARMOR +5`
- `client/src/ui/loadoutBlock.ts` -- `LADDER_LINES`, `DASH_AT_ZERO`, `LADDERS_PER_ROW` 4
- `client/src/render/equipmentIcons.ts` -- `LINE_GLYPHS.armor` (Eric's pick)
- `client/src/how-to-play/copy.ts` untouched; `client/src/__tests__/howToPlay.test.ts` `AWAITING_COPY` + `'armor'`
- `client/src/__tests__/{boonCopy,gunPickHud,slotTooltip,tooltipFit,results,loadout*,lineGlyphs,weaponTables,fitCheck,refitCardFit}.test.ts` -- re-bases; hover panel / tooltip fit at 1280×614 with seven rows; LOADOUT 4 + 3 width check
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md}`, `_bmad-output/planning-artifacts/epics.md` (9.7 stamp)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [ ] `shared/src/constants.ts`, `sim/{catalog,effects,stats,boons}.ts`, `index.ts` -- the ladder, the fold, the helper, the cut row, PV 81 -- the one source both sides run
- [ ] `shared/src/__tests__/*` -- matrix rows for the fold and helper, counts/order/absent-path re-bases with amendments cited; `npm test -w shared`, `npm run build -w shared`

**Execution (wave 2 — server Opus and client Opus in parallel, shared frozen):**
- [ ] `server/src/game/world.ts`, `ai/profiles.ts`, `scripts/batchsim/*` -- the generalized gate, favorites, harness; NEW tests per the matrix (tier table on live blows, cut stacking at Tier 0 and V, burn/grind fractions, storm exempt, shield after, tally post-multiply); golden re-record; `npm test -w server`
- [ ] Glyph gate (orchestrator): render `armor` candidates to an artifact, Eric picks, then the client agent gets the pick
- [ ] `client/src/ui/{boonCopy,loadoutBlock}.ts`, `render/equipmentIcons.ts`, tests -- names, rows, order, 4 + 3, `ARMOR +5`, glyph, `AWAITING_COPY`; `npm test -w client`

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; triage per the orchestrate skill.

**Execution (wave 3 — record, Sonnet):**
- [ ] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md` stamp, both trackers, amendments 110–117 in BOTH homes -- 0.18.49 / cycle 184 / PV 81
- [ ] `npm run check` green; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given a hull with n `armor` cards, when `effectiveStats` runs, then `armor` is n and `damageMultiplier` is `round3(5/(5+n))`; `damageMultiplierFor(10)` is `round3(1/3)`.
- Given a seeded world and a victim at Tier V, when a 15 hp shell lands, then hp drops 7, the `dmg` amount is 7 and the attacker's tally gains 7; under an open cut at Tier V a 50 hp torpedo drops hp 16.
- Given a victim at Tier 0 under an open cut, when a 15 hp shell lands, then 7 is dealt (today's ×0.5 preserved).
- Given a burn or grind tick at any armor, then the applied amount is the exact product (never floored).
- Given a storm bite at any armor with the cut open, then it lands in full.
- Given a shielded victim, when a blow lands, then the shield absorbs the POST-multiply amount and a fully absorbed blow leaves `lastDamagedAt` unchanged.
- Given the DAMAGE CUT activates, then `damageCutUntil = now + 10000` and the reload is 30000 × `cooldownScale`.
- Given `validateCatalog`, then 25 lines / 122 cards, `armor` directly after `hullPoints` in `LINE_IDS`; the draw covers it; no string `damageCut.factor` remains anywhere (one-time grep, not a test).
- Given the results LOADOUT with seven ladders, then row 1 has four entries and row 2 three, no separator across the break, within the 530 px column.
- Given the DAMAGE CUT tooltip, then its head row reads `ARMOR +5`; the ARMOR card face reads `ARMOR 0 → 1` at zero copies.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 81.

## Spec Change Log

### 2026-10-13 — two orchestrator corrections surfaced by the build waves (not Eric's; the intent contract is read-only)
- The matrix row "Overkill … dealt 1, tally +1" mis-stated the standing rule. `creditDamage` adds the post-multiply, post-shield `net` (BEFORE the overkill clamp) to the attacker's results tally — "OVERKILL NEVER PAYS" is about the XP share, which reads the clamped `dealt` (Eric 2026-08-22). Built and pinned as the standing rule: hp lost 1, assist ledger 1, `damageDealt` the full post-armor blow (25 on a 50 hp blow at Tier V). Eric's "what landed" ruling (amendment 113) is about the armor multiply, not the clamp.
- `CONFIG.armor` is `{ k: 5 }`, not `{ k: 5, perTier: 1 }`: no catalog step reads CONFIG and the catalog is frozen at load, so a `perTier` tune key would be accepted and do nothing (the wave-1 agent's finding, confirmed). The +1 step is authored literally beside the ladder like every other ladder. Recorded in amendment 110.
- KEEP: the gate body as built (`armorDamage`), the Eric-picked glyph table with r 0.14 rivets, the 4 + 3 LOADOUT split, `ARMOR +5` read off `armorBonus`.

## Review Triage Log

### 2026-10-13 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol on the same diff ff3ca858..559cf346; all three FIX-FIRST)
- intent_gap: 0 (the one ruling gap — what a blow that floors to 0 does — was put to Eric live and ruled, amendment 119; the intent contract stands)
- bad_spec: 0 (the spec's `round3` clause was the orchestrator's own transcription error, corrected as a patch and logged in the Spec Change Log, not re-derived)
- patch: 4: (high 2, low 2)
- defer: 0
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` ALL THREE, CONFIRMED (two against the built dist): `damageMultiplierFor` rounded the ratio to three decimals, and every rounded value sits under the true ratio, so a whole blow whose exact product is whole floored one point low (MG 6 at Armor 1 → 4 not 5; flak 12 → 9 not 10; broadside 15 at Armor 10 → 4 not 5; 33 shipped pairs). Fixed: the exact `K / (K + armor)` in the fold and the gate; pins compare to `5 / (5 + n)`; seven boundary rows in damageGate.test fail without the fix (proved red-then-green). Reading 120(a).
  - `[high]` `[patch]` ALL THREE, CONFIRMED by trace: a 1 hp blow (the three PvE drone classes' shells, a slow ram bump) floored to 0 at any Armor and still emitted `dmg 0`, played the hit cue and aggroed drones. Eric ruled live: minimum 1 hp on a whole blow (amendment 119). Fixed in `floorBlow`; burn/grind ticks untouched.
  - `[low]` `[patch]` Codex + Blind Hunter: stale "halved / halving window" wording in `shared/src/types.ts` (`damageCutUntil`), the `setDamageCut` capability docs. Reworded to the +5 Armor rule.
  - `[low]` `[patch]` Edge Case Hunter: the harness max-stack envelope stacked ARMOR but printed no evidence. `balanceProbe` gains armor and multiplier columns.
  - Rejected: Blind Hunter's "`damageMultiplier` is a dead field" — it is the firewall's published number (a future hover row reads it) and the gate recomputes only because the cut's bonus changes the input; kept, recorded in 120(e).
  - Cross-model picture: all three flagged the rounding and the floor-to-zero independently — CONFIRMED-tier, fixed without debate. Codex alone raised the stale doc wording (confirmed by grep, patched). The Edge Case Hunter alone raised the harness column (confirmed, patched). The Blind Hunter alone questioned the dead field (rejected with reasons).

## Design Notes

- **Why `armor` is a top-level stat and the multiplier a clamp-time derivation:** the ladder authors `add: 1` beside its id like every other ladder; the formula is derived once in the firewall so the SHIP panel, the card hover and the gate all read one number. `damageMultiplier` is NOT on `TOP_LEVEL_STAT_PATHS` (derived, pinned absent like `sightRange`).
- **Why the gate adds the cut's bonus to the armor rather than multiplying twice:** Eric's "it stacks" is additive on the Armor value (amendment 88); a Tier II Dreadnought under its cut is Armor 7 → ×0.417, never ×0.714 × 0.5.
- **Recorded, not ruled:** a `--tune armor.perTier=0` cannot fold (positive-result guard; harness-only, the regen precedent); an armored victim deflates every attacker's tally (Eric: what landed).

## Verification

**Commands:**
- `npm test -w shared` -- expected: green, catalog 25/122, multiplier table
- `npm test -w server` -- expected: green, gate matrix rows, golden re-recorded on offer rows only
- `npm test -w client` -- expected: green, fit tests at 1280×614, LOADOUT 4 + 3
- `npm run check` -- expected: lint 0 errors, tsc ×3, all tests, hook test

**Manual checks:**
- Eric picks the ARMOR glyph on the rendered artifact before the client commit; Eric judges the card, the hover panel and the LOADOUT on staging after the PR.
