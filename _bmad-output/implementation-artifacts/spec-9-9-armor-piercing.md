---
title: 'Story 9.9: Armor Piercing'
type: 'feature'
created: '2026-10-15'
status: 'in-progress'
baseline_revision: '8abf59ee'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-7-armor.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Armor has no answer. Every captain who buys guns meets the same `K / (K + Armor)` wall, and with K = 5 there is no room to tune. Eric wants the scale widened (K 100, +20 per card, the Dreadnought's DAMAGE CUT renamed HUNKER at +100) and a second ladder, ARMOR PIERCING, that subtracts from the victim's Armor on one curve a player can reason about — including below zero.

**Approach:** Rescale 9.7 exactly (every multiplier a hull sees today reproduced), rename the Shift id `damageCut` → `hunker` everywhere, add the universal ladder `armorPiercing` (cap 5, +20, seat right after `armor`), and generalize the one formula in `sim/stats.ts` to effective armor `E = victim Armor (+ Hunker while open) − attacker Piercing`: `E ≥ 0 → K / (K + E)`, `E < 0 → 2 − K / (K − E)`. The server gate reads the attacker's piercing LIVE at impact from their current stats for every source but the storm. Eric's rulings at this spec step (2026-10-15, AskUserQuestion, recommended options; amendments 156–159): live read at impact; raider + duelist favor the ladder; HUNKER is a name swap only; ARMOR PIERCING's surfaces mirror ARMOR's exactly.

## Boundaries & Constraints

**Always:**
- `effectiveStats()` is the ONLY derivation of `armor`, `armorPiercing` and `damageMultiplier`; `damageMultiplierFor(effectiveArmor)` in `shared/src/sim/stats.ts` is the ONE curve (two branches, exact fractions, never rounded, finite for every finite input; non-finite → ×1), called by `clampStats` (with `E = armor`, the published victim-only number) and by the server gate (with the full E). No second multiplier site.
- `CONFIG.armor = { k: 100 }` (`--tune armor.k`, floor 1). The ladder steps are authored literally in the catalog (`statEffect('armor', { add: 20 })`, `statEffect('armorPiercing', { add: 20 })`), never a CONFIG `perTier` (amendment 110's reason stands). `armorPiercing` joins `TOP_LEVEL_STAT_PATHS`, is floored to a whole number ≥ 0 in `clampStats`, seeded 0 in `baseStats`.
- Catalog: `armorPiercing: ladder('armorPiercing', 5, [...])` seated in `LINE_IDS` directly after `armor`; 26 lines / 127 cards; universal ladders 8 (40 cards). Seat order everywhere it is listed: HULL · ARMOR · ARMOR PIERCING · SPEED · TURNING · RADAR SWEEP · RELOAD · PASSIVE HEALING.
- HUNKER: `CONFIG.hunker = { armorBonus: 100, durationMs: 10000, maxAmmo: 1, reloadMs: 30000 }`; the Shift id, `ShiftId`/`EquipmentId`, `SHIFT_IDS`, the equipment file (`hunker.ts`) and registry key, `ShipRecord.hunkerUntil`, the wire field `OwnShip.hunkerUntil`, `CONFIG.shipClasses.battleship.shift`, the bot cue/appetite keys, the `--tune hunker.*` family and the tests all rename; the old string `damageCut` survives only in history prose ("HUNKER, was DAMAGE CUT"). Player-visible strings: chip `HUNKER`, tooltip name `Hunker`, head row `ARMOR +100` read from `stats.equipment.hunker.armorBonus`, then `LASTS 10 S` / `COOLDOWN 30 S` as today (amendment 158). Window, cooldown, cues and the proactive bot rule unchanged.
- Gate: `applyDamage` order unchanged — (a) friendly fire → (b) phase/sinking → (b′) `armorDamage(victim, amount, src, byId)` → (c) shield → (d) one hp write. (b′): storm returns `amount`; `bonus = now < victim.hunkerUntil ? armorBonus : 0`; `piercing = byId === undefined ? 0 : (this.ships.get(byId)?.stats.armorPiercing ?? 0)` — LIVE at impact (amendment 156): a card bought while a torpedo swims counts, a sunk owner's record persists so their mine still pierces, an owner who left the room reads 0, the coast and a wreck read 0; `× damageMultiplierFor(armor + bonus − piercing)`; `'burn'`/`'grind'` exact, else `floorBlow` (floor, minimum 1 — amendment 119 unchanged). PvE drones hold no cards (AP 0 as attackers; Armor 0 as victims, so a pierced drone takes up to ×1.5 — Eric's "apply it to all damage", amendment 147).
- `creditDamage` and `dmg` keep reading the post-multiply, post-shield `net` (amendment 113); mass for ramming stays `maxHp`.
- Bots: `UpgradeFavorite` gains `'armorPiercing'`; `raider` and `duelist` favorites gain it (amendment 157); every other profile by the 8-20 rule. Harness: `balanceProbe` universal list + an `armorPiercing` column; `--tune` families gain nothing new (`armor.`, `hunker.`).
- Client (amendment 159 — mirror ARMOR): `LINE_NAMES.armorPiercing = 'ARMOR PIERCING'`; `STAT_LINES.armorPiercing = { label: 'Armor Piercing', path: 'armorPiercing' }` (integer print; the card reads `ARMOR PIERCING 0 → 20`, ARMOR's `ARMOR 0 → 20`); `SHIP_STAT_LINES`, `LADDER_LINES`, `DASH_AT_ZERO` gain it in seat 2; the SHIP hover panel and the derived How-to-Play ship table gain an eighth row; `AWAITING_COPY` gains `'armorPiercing'`; no live HUD readout; `armorPiercing` out of `BASE_TIER_LINES`. `LINE_GLYPHS.armorPiercing` = Eric's pick; `LADDERS_PER_ROW` = Eric's pick (4 + 4 or 5 + 3), fit-checked against the 530 px column.
- Rendered-page gate BEFORE the client commit: three ARMOR PIERCING glyph candidates in the real glyph primitives at 24 / 16 / 64 px beside HULL, ARMOR, HUNKER; the LOADOUT ladder line at 4 + 4 and 5 + 3 in the real CSS inside a 530 px column. Eric picks both; recorded as amendment 160.
- `PROTOCOL_VERSION` 83 → 84 + history line (catalog content, `CONFIG.armor`/`hunker` read by the client, the wire field rename). Nothing new leaves the server; the six perception exceptions untouched.
- Tests assert contracts: the K-5 ratio pins re-base to `100 / (100 + n)` BY DERIVATION from `CONFIG.armor.k`; a curve test on synthetic (armor, piercing) pairs incl. E = −K, E = 0 from both sides, continuity at 0, bound < 2; count pins 25/122 → 26/127 citing amendments 144–145; no vocabulary pins.
- Version 0.18.55, cycle 190; amendments 156–161 appended to BOTH `epic-9-context-amendments.md` and the `## Ratified Amendments` section of `epic-9-context.md`; both trackers ONE line each; `epics.md` 9.9 stamped; CHANGELOG. One PR to `development`, never merged.

**Block If:** any gap these rulings and amendments 143–147 do not cover (a number, copy, a visual) → AskUserQuestion before the PR, never a ledger entry; the glyph / row-split pick missing when the client wave needs it.

**Never:** a HUD readout for Armor or Piercing; a second multiplier site; a floor at E = 0 or raw `K / (K + E)` below zero (rejected, amendment 146); piercing stamped on ordnance at launch (rejected, amendment 156); a per-class or per-weapon piercing; a HIGH EXPLOSIVE ladder (rejected, 147); How-to-Play prose (9.17's, Eric's copy); GDD / catalog-v3 stamps (9.17's); merging the PR; CLAUDE.md edits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fold | n `armor`, m `armorPiercing` cards | `armor = 20n`, `armorPiercing = 20m`, `damageMultiplier = 100/(100+20n)` exactly | unknown id fails closed |
| Curve E ≥ 0 | E = 0 / 20 / 100 / 200 | ×1 / ×5⁄6 / ×0.5 / ×1⁄3 | — |
| Curve E < 0 | E = −20 / −100 / −1000 | ×7⁄6 / ×1.5 / ×1.818… (< 2 always) | non-finite E → ×1 |
| Blow at Tier V, AP 0 | 15 hp shell, armor 100 | 7 (floor 7.5) — 9.7's number reproduced | — |
| Tier 0 under HUNKER | 15 hp shell, bonus 100 | 7 (×0.5) | — |
| Tier V under HUNKER | 50 hp torpedo, E 200 | 16 (×1⁄3) | — |
| Pierced bare hull | 12 hp cannon, armor 0, AP 100 | 18 (×1.5) | — |
| Pierced one card | 12 hp cannon, armor 0, AP 20 | 14 (×7⁄6 = 14) | — |
| Cancelled out | 12 hp, armor 60, AP 60 | 12 (E 0) | — |
| Pierced HUNKER | 12 hp, armor 100 + 100, AP 100 | 6 (E 100) | — |
| Burn tick | 0.5 hp, E −100 | 0.75 exactly, banks into the DoT window | never floored |
| Grind tick | 0.2 hp, E −20 | 0.2333… exactly | — |
| Storm | 3 hp bite, any E | 3 (exempt) | — |
| Drone shell | 1 hp, armor 100 | 1 (floor of one) | — |
| Owner left | mine of a departed captain, AP was 100 | AP 0 — `ships.get` miss | no throw |
| Owner sunk | torpedo of a sunk captain, AP 100 | AP 100 — record persists | — |
| Coast / wreck | 'contact' with byId undefined | AP 0 | — |
| Ram | hull A (AP 40) vs hull B (AP 0, armor 20) | A's blow on B at E −20; B's blow on A at E 20 | — |
| Shield order | 20-hp shield, 12 hp cannon at E −100 | multiply → 18, shield eats 18, hp untouched, `dealt` 0 | — |
| Self-hit | own ordnance | refused at (a), before the multiply | — |
| LOADOUT | 8 ladders | Eric's split; dash at zero on ARMOR and ARMOR PIERCING | — |
| Card faces | `armor` 0, `armorPiercing` 2 copies | `ARMOR 0 → 20`; `II → III`, `ARMOR PIERCING 40 → 60` | — |
| HUNKER tooltip | Dreadnought Shift | head `ARMOR +100`, `LASTS 10 S`, `COOLDOWN 30 S`; chip `HUNKER` | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.armor.k` 5 → 100 (doc cites 144); `CONFIG.damageCut` → `CONFIG.hunker` with `armorBonus` 100; `shipClasses.battleship.shift: 'hunker'`
- `shared/src/sim/loadout.ts` -- `EquipmentId`/`ShiftId`/`SHIFT_IDS` `damageCut` → `hunker`; `shared/src/sim/arcs.ts` `unbuiltArc` id
- `shared/src/sim/catalog.ts` -- `armor` step +1 → +20; new `armorPiercing` ladder after `armor`; `LINE_IDS` seat 2; header counts 26 / 127, universal 8 (40)
- `shared/src/sim/effects.ts` -- `TOP_LEVEL_STAT_PATHS` + `'armorPiercing'`; `hunker` row comment
- `shared/src/sim/stats.ts` -- `EffectiveStats.armorPiercing`; `EffectiveHunker` (was `EffectiveDamageCut`), `equipment.hunker`; `baseStats` seeds 0; `clampStats` floors `armorPiercing`, derives `damageMultiplier = damageMultiplierFor(armor)`; `damageMultiplierFor(effectiveArmor)` two-branch, exact; `rePinDerived` twin in `boons.ts`
- `shared/src/types.ts` -- `OwnShip.hunkerUntil` (was `damageCutUntil`), doc reworded
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 84 + history line; exports follow the renames
- `shared/src/__tests__/{catalog,barrel,stats,shipClasses,draw,loadout,...}.test.ts` -- counts 26/127, order, `hunker` paths, K-derived ratio pins, curve table incl. E = −K and continuity
- `server/src/game/world.ts` -- `armorDamage(victim, amount, src, byId)` reads the attacker's `armorPiercing` live; `hunkerUntil`; doc block (b′) rewritten (amendments 144–147, 156)
- `server/src/game/equipment/hunker.ts` (git mv from `damageCut.ts`), `equipment/index.ts` registry key; `consumables/shieldBlock.ts` comment
- `server/src/game/frames.ts` -- `hunkerUntil` self-private spread
- `server/src/game/ai/{profiles,shift,tactics,tacticKit,torpedoThreat,consumables,types}.ts` -- `UpgradeFavorite` + `'armorPiercing'`; raider + duelist favorites; `hunker` cue/appetite keys
- `server/scripts/batchsim/{args,overrides,balanceProbe}.ts` -- `hunker.` family, `armor.k` floor-1 note, probe column
- `server/src/__tests__/{damageGate,shift,contactDamage,shieldBlock,upgrades,goldenFrames,...}.test.ts` -- matrix rows (pierced blows, E < 0 burn/grind, departed/sunk owner, ram both ways, drone floor), renames, golden re-record if offer rows shift
- `client/src/ui/boonCopy.ts` -- `LINE_NAMES`, `STAT_LINES`, `SHIP_STAT_LINES` (8), `SHIFT_HEADS.hunker` → `ARMOR +100`, `hunker` field list
- `client/src/ui/loadoutBlock.ts` -- `LADDER_LINES`, `DASH_AT_ZERO`, `LADDERS_PER_ROW` (Eric's pick)
- `client/src/ui/classSelect.ts` -- chip `HUNKER`; `client/src/render/equipmentInfo.ts` -- name `Hunker`, table key
- `client/src/render/equipmentIcons.ts` -- `hunker` glyph key (hexagon kept), `LINE_GLYPHS.armorPiercing` (Eric's pick)
- `client/src/render/{hotbar,slotTooltip}.ts`, `client/src/main.ts` -- `hunkerUntil` / `hunker` keys
- `client/src/__tests__/{howToPlay (AWAITING_COPY), boonCopy, slotTooltip, tooltipFit, results, lineGlyphs, fitCheck, refitCardFit, ordnanceMasksAreServerOnly, ...}.test.ts` -- re-bases; SHIP panel eight rows at 1280×614; LOADOUT split within 530 px
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md}`, `_bmad-output/planning-artifacts/epics.md` (9.9 stamp)

## Tasks & Acceptance

**Execution (wave 0 — the rename, one agent, Sonnet; commit alone):**
- [ ] every workspace -- `damageCut` → `hunker` (ids, types, file, wire field, CONFIG block, labels `HUNKER` / `Hunker`, tune family, tests; history prose keeps "was DAMAGE CUT") -- a pure mechanical commit the reviewers can diff apart from the feature; `npm run check` green with NO behavior change (PV untouched in this wave)

**Execution (wave 1 — shared, one agent, Opus):**
- [ ] `shared/src/constants.ts`, `sim/{catalog,effects,stats,boons}.ts`, `index.ts` -- K 100, +20 steps, `armorBonus` 100, the `armorPiercing` ladder and stat, the two-branch curve, PV 84 -- the one source both sides run
- [ ] `shared/src/__tests__/*` -- matrix rows for the fold and the curve, count/order/path re-bases citing 144–146; `npm test -w shared`, `npm run build -w shared`

**Rendered-page gate (orchestrator, in parallel with waves 0–1):**
- [ ] glyph candidates + LOADOUT 4 + 4 vs 5 + 3 on one artifact; Eric picks (AskUserQuestion) → amendment 160

**Execution (wave 2 — server Opus and client Opus in parallel, shared frozen):**
- [ ] `server/src/game/world.ts`, `ai/profiles.ts`, `scripts/batchsim/*` -- the gate reads the attacker live, favorites, probe column; NEW tests per the matrix; golden re-record only if offer rows shift; `npm test -w server`
- [ ] `client/src/ui/{boonCopy,loadoutBlock}.ts`, `render/equipmentIcons.ts`, tests -- names, rows, order, split, glyph, `ARMOR +100`, `AWAITING_COPY`, eight-row fit; `npm test -w client`

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; seed: the live attacker read when `byId` names a departed or sunk ship, the E < 0 branch under `floorBlow` and the shield, the rename's reach onto the wire and the smokes.

**Execution (wave 3 — record, Sonnet):**
- [ ] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md` stamp, both trackers, amendments 156–161 in BOTH homes -- 0.18.55 / cycle 190 / PV 84
- [ ] `npm run check` green; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given n ARMOR and m ARMOR PIERCING cards, when `effectiveStats` runs, then `armor = 20n`, `armorPiercing = 20m`, `damageMultiplier = K/(K+20n)` exactly with K read from `CONFIG.armor.k`.
- Given `damageMultiplierFor(E)` over synthetic E, then it equals `K/(K+E)` for E ≥ 0 and `2 − K/(K−E)` for E < 0, is 1 at 0 from both sides, is strictly below 2 for every finite E, and returns 1 for a non-finite E.
- Given a seeded world, a Tier V victim and an attacker with no piercing, when a 15 hp shell lands, then hp drops 7 — the 9.7 number; under HUNKER at Tier 0 the same shell deals 7; at Tier V under HUNKER a 50 hp torpedo deals 16.
- Given an attacker at AP 100 and a bare victim, when a 12 hp cannon shell lands, then 18 is dealt, the `dmg` amount is 18 and the attacker's tally gains 18; a burn tick of 0.5 lands 0.75 exactly.
- Given a mine whose owner left the room, when it detonates, then the gate reads piercing 0 and does not throw; a sunk owner's torpedo still carries their piercing.
- Given a storm bite at any armor and piercing, then it lands in full; a 1 hp drone shell on Armor 100 lands 1.
- Given `validateCatalog`, then 26 lines / 127 cards with `armorPiercing` directly after `armor` in `LINE_IDS`; the draw covers it; no string `damageCut` remains outside history prose (one-time grep, not a test).
- Given the raider and duelist tastes, then `armorPiercing` is a favorite; bulwark's favorites are unchanged.
- Given the results LOADOUT with eight ladders, then the rows split as Eric picked within the 530 px column; the SHIP hover panel shows eight rows and fits at 1280×614.
- Given the HUNKER tooltip, then its head row reads `ARMOR +100`; the class-select chip reads `HUNKER`; the ARMOR PIERCING card face reads `ARMOR PIERCING 0 → 20` at zero copies.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 84; the perception master invariant still lists exactly SIX exceptions.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the attacker is read live, not stamped:** one rule for every source (Eric, amendment 156); the gate already receives `byId` for every non-storm source and `this.ships` keeps a sunk hull's record until the client leaves, so no ordnance record changes shape and nothing new rides the wire. A departed attacker reads 0 by the same lookup `creditDamage` already tolerates.
- **Why the rename is its own wave:** 266 occurrences across 28 test files; a separate behavior-free commit lets the reviewers and Codex diff the feature alone.
- **Why `stats.damageMultiplier` stays victim-only:** it is the firewall's published number (amendment 120(e)); the pair-dependent E exists only at the gate.
- **Curve sanity:** `2 − K/(K−E)` at E = −20 is 7⁄6 (a 12 hp cannon lands 14 whole), at −100 is 1.5; the two branches share value 1 and slope −1/K at 0.

## Verification

**Commands:**
- `npm test -w shared` -- green; catalog 26/127; curve table; K-derived pins
- `npm test -w server` -- green; gate matrix rows; golden unchanged or re-recorded once with the reason
- `npm test -w client` -- green; eight-row fit; LOADOUT split within 530 px
- `npm run check` -- lint 0 errors, tsc ×3, all tests, hook test

**Manual checks:**
- Eric picks the ARMOR PIERCING glyph and the LOADOUT split on the rendered artifact before the client commit; Eric judges the cards, the HUNKER chip and tooltip, the SHIP panel and the LOADOUT on staging after the PR.
