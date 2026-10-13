---
title: 'Story 9.6: Five Tiers and Passive Healing'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_revision: '02a4aa1b'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'PR open to development (2026-10-13); code head HEAD-AT-RECORD'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-5-ramming-and-contact-damage.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The three ship ladders ARMOR / SPEED / TURNING stop at four cards while every other ladder runs five, the +hp ladder is still called ARMOR although Story 9.7 needs that id for a damage-reduction ladder, and passive healing is one flat rule with nothing to buy. Epic-9 amendments 27–29 and 89 rule the shape; Eric ruled the numbers and the surface questions at this spec step (2026-10-13, AskUserQuestion ×8, recorded as amendments 90–97).

**Approach:** Re-cut the catalog: `armor` → `hullPoints` (id and label; the card prints `HULL`), +50 max hp per card, cap 5, heal-on-grant kept; SPEED and TURNING cap 5 at today's step; a new universal ladder `passiveHealing` (cap 5) whose two effects fold through `effectiveStats()` into `stats.regen = { missingPctPerS, outOfCombatMs }`, with the base moved to 2 %/s after 15 s; the server's `tickRepairs` reads each hull's own stats; tier numerals on the three old ship ladders flip to 0 → V; the shield-leaves-the-clock-alone behavior is pinned, not changed.

## Boundaries & Constraints

**Always:**
- Eric's numbers, literal (amendments 90–91): HULL +50 ×5 (500 / 550 / 600 at V); SPEED +2.5 ×5; TURNING +0.05 ×5; PASSIVE HEALING base `CONFIG.regen.missingPctPerS` 0.01 → **0.02**, +0.006 per card (0.026 / 0.032 / 0.038 / 0.044 / **0.05** at V); wait base 15000 ms, −1000 per card (**10 s at V**). Guns, RADAR SWEEP, RELOAD, HULL REPAIR untouched.
- `effectiveStats()` is the only place regen stats are derived: `baseStats` seeds `regen` from `CONFIG.regen`; the catalog authors the per-card adds as `statEffect('regen.missingPctPerS', { add: 0.006 })` and `statEffect('regen.outOfCombatMs', { add: -1000 })` (both paths join `TOP_LEVEL_STAT_PATHS`); `clampStats` rounds `missingPctPerS` with `round3` (the `cooldownScale` dust rule) and floors `outOfCombatMs` at 0. Server and client both read `stats.regen`; nothing reads `CONFIG.regen` at tick time.
- The regen clock (amendment 47) is unchanged: only a blow that removes hull hp (`dealt > 0`) resets `lastDamagedAt`; a blow the SHIELD BLOCK eats whole does not (Eric 2026-10-13 restated this as the rule — amendment 92). Pin it with a server test that fails if the gate ever resets on an absorbed blow. Drones never regen (`roleIsFleetHull` gate stays).
- Rename `armor` → `hullPoints` EVERYWHERE the id appears (catalog, `LINE_IDS`, bot `UpgradeFavorite` + profile favorites, client tables and sets, every test, golden snapshot); printed name `HULL` (`LINE_NAMES`, the How-to-Play entry's `name` and `lineId`, the class-select hp pip label `ARMOR` → `HULL`, loadout line). Amendment 93.
- Tier numerals: `hullPoints`, `speed`, `turning` LEAVE `BASE_TIER_LINES` and JOIN `DASH_AT_ZERO` (with `passiveHealing`): first card prints `I`, fifth prints `V`, LOADOUT dashes at zero copies; the three guns keep sailing at Tier I. Amendment 94.
- Stat row: ONE row for PASSIVE HEALING — `STAT_LINES.passiveHealing = { label: 'Heal', path: 'regen.missingPctPerS', fmt: → "2 %/S" style (one decimal when needed: 2.6 %/S) }`; `SHIP_STAT_LINES` gains it (six rows: refit grid `R.rowCount` 5 → 6 and the fit tests re-based). The wait is not a row. Amendment 95.
- How-to-Play copy stays FROZEN until 9.11 (amendment 36; Eric 2026-10-13 "Freeze everything"): the regen sentence keeps saying "15 seconds"; the ARMOR entry becomes `{ name: 'HULL', lineId: 'hullPoints', … }` with its description text untouched; `passiveHealing` joins the test's `AWAITING_COPY` tolerance (no entry). Derived tables (ship-upgrade table) keep deriving. Amendment 96.
- Bots: the defensive profile's `favoriteUpgrades` becomes `['hullPoints', 'passiveHealing']`; `UpgradeFavorite` gains `'passiveHealing'`; everything else picks the new ladder up from the catalog automatically. Amendment 97.
- Glyph: `LINE_GLYPHS.passiveHealing` candidates are rendered to an artifact page and Eric picks BEFORE the client commit; `hullPoints` keeps the old armor glyph. (Memory rule; epic AC.)
- `LINE_IDS` order: `hullPoints` keeps armor's seat; `passiveHealing` goes LAST among the universal ladders (after `reload`). Golden snapshots re-record once; note the diff in this spec.
- `PROTOCOL_VERSION` 79 → 80 (catalog content + `CONFIG.regen` read by the client through stats). Cycle 183, `0.18.48`. Amendments 90–99 (90–97 Eric's spec-step rulings, 98 the glyph pick, 99 implementer readings) in BOTH homes (`epic-9-context-amendments.md` and the `## Ratified Amendments` section of `epic-9-context.md`).
- Tests assert contracts (project-context Testing Rules): re-base the max-hp pins (`stats.test`, `hullRepair.test` NFR6 ceiling 450 → 600 with amendment 28 cited), the catalog counts (24 lines / 117 cards), `CONFIG.regen` value pins, the tier-label tests; never pin vocabulary.

**Block If:**
- A reviewer finds the regen fold cannot be expressed as `add` effects without a new effect kind — HALT, ask Eric.
- Eric rejects every glyph candidate — HALT at the gate, do not commit the client wave with a placeholder.

**Never:**
- Change HULL REPAIR, the storm, the guns, RADAR SWEEP or RELOAD; add a regen HUD readout or countdown (no `lastDamagedAt` on the wire); add a seventh perception exception; write new How-to-Play prose; touch `CLAUDE.md`; merge the PR.
- Re-derive regen from `CONFIG.regen` outside `effectiveStats()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hull at V | dreadnought + 5 × hullPoints | `maxHp` 600; each grant healed +50 current (clamped to max) | — |
| Heal ladder | any class + n × passiveHealing, n = 0..5 | `regen.missingPctPerS` = 0.02 + 0.006n exactly (round3); `regen.outOfCombatMs` = 15000 − 1000n | n > 5 unreachable (cap); clamp floors ms at 0 |
| Regen tick | hull at 300/600, 5 × passiveHealing, idle 10.05 s | hp rises by 300 × 0.05 × dt/1000 per tick; snaps to full under 1 hp missing | — |
| Wait per hull | hull A (0 cards) idle 12 s, hull B (5 cards) idle 12 s | A does not regen yet, B does | — |
| Shield eats a blow | shield 50 up, 30-dmg hit, idle 16 s | `lastDamagedAt` unchanged; regen continues the same tick | — |
| Shield breaks | shield 10 up, 30-dmg hit | 20 lands, `lastDamagedAt` = now, regen stops | — |
| Drone | fleet drone, damaged, idle 60 s | never regens | — |
| Tier label | hullPoints card at 0 copies / at 4 copies | `I` / `V` (bare numeral at the ceiling) | — |
| LOADOUT | 0 × speed, 3 × passiveHealing | SPEED row dashes; PASSIVE HEALING prints III | — |
| Catalog | `validateCatalog()` | 24 lines, 117 cards; `healOnGrant` lines = `['hullPoints']` | throws on any shape error |
| Stale id | offer / record containing `'armor'` | fails closed (unknown id ignored), as any unknown id | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.regen.missingPctPerS` 0.01 → 0.02 (doc cites amendment 90); comment notes the ladder adds live in the catalog
- `shared/src/sim/catalog.ts` -- `armor` → `hullPoints` (`ladder('hullPoints', 5, [statEffect('maxHp', { add: 50 })], { healOnGrant: true })`), `speed` / `turning` cap 5, NEW `passiveHealing` ladder after `reload`; `LINE_IDS`, `LineId`; header counts 24 / 117, universal ladders 30; `catalogCardCount` doc
- `shared/src/sim/effects.ts` -- `TOP_LEVEL_STAT_PATHS` + `'regen.missingPctPerS'`, `'regen.outOfCombatMs'`
- `shared/src/sim/stats.ts` -- `EffectiveStats.regen`, `baseStats` seeds from `CONFIG.regen`, `clampStats` round3 + floor
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 80 + history line
- `shared/src/__tests__/{catalog,barrel,stats,hullRepair,draw,shipClasses}.test.ts` -- re-bases per the matrix
- `server/src/game/world.ts` -- `tickRepairs` per-ship wait from `ship.stats.regen.outOfCombatMs`; `tickRegen` reads `ship.stats.regen.missingPctPerS`; comments "15 s" → derived wording
- `server/src/game/ai/profiles.ts` -- `UpgradeFavorite`, defensive profile favorites
- `server/src/__tests__/*` -- `boost.test` speed stack from `cap`, `upgrades.test` healOnGrant +50, regen/shield clock pin (NEW cases), golden snapshot re-record (offer ids), any `'armor'` literal
- `client/src/ui/boonCopy.ts` -- `LINE_NAMES` (`hullPoints: 'HULL'`, `passiveHealing: 'PASSIVE HEALING'`), `STAT_LINES`, `SHIP_STAT_LINES`, `BASE_TIER_LINES`
- `client/src/ui/loadoutBlock.ts` -- `LADDER_LINES`, `DASH_AT_ZERO`
- `client/src/ui/classSelect.ts` -- pip label `ARMOR` → `HULL`
- `client/src/how-to-play/copy.ts` -- entry `{ name: 'HULL', lineId: 'hullPoints' }` text frozen; `client/src/__tests__/howToPlay.test.ts` `AWAITING_COPY` + `'passiveHealing'`
- `client/src/render/equipmentIcons.ts` -- `LINE_GLYPHS.hullPoints` (old armor glyph), `LINE_GLYPHS.passiveHealing` (Eric's pick)
- `client/src/config.ts` `R.rowCount` 5 → 6; `client/src/ui/{upgradeMenu,refitCardFit}.ts` + fit tests
- `client/src/__tests__/*` -- tier-label, results, weaponTables (ARMOR 450 → HULL 600), fitCheck 23 → 24, lineGlyphs, boonCopy
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md}`, `_bmad-output/planning-artifacts/epics.md` (9.6 stamp)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [x] `shared/src/constants.ts`, `sim/{catalog,effects,stats}.ts`, `index.ts` -- the re-cut catalog, the regen stat fold, PV 80 -- the one source both sides run
- [x] `shared/src/__tests__/*` -- matrix rows for the fold, counts, pins re-based with amendments cited; `npm test -w shared`, `npm run build -w shared`

**Execution (wave 2 — server Opus and client Opus in parallel, shared frozen):**
- [x] `server/src/game/world.ts`, `ai/profiles.ts` -- per-hull regen wait/rate, favorites; NEW tests: per-hull wait, ladder rate, shield-absorbed blow leaves the clock, drone never regens; golden re-record; `npm test -w server`
- [x] Glyph gate (orchestrator): render `passiveHealing` candidates to an artifact, Eric picks, then the client agent gets the pick
- [x] `client/src/ui/{boonCopy,loadoutBlock,classSelect}.ts`, `how-to-play/copy.ts`, `render/equipmentIcons.ts`, `config.ts`, fit model -- rename, tier flip, HEAL row, six-row grid, glyph; `npm test -w client`

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; triage per the orchestrate skill.

**Execution (wave 3 — record, Sonnet):**
- [x] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md` stamp, both trackers, amendments 90–99 in BOTH homes -- 0.18.48 / cycle 183 / PV 80
- [x] `npm run check` green; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given a dreadnought with five `hullPoints` cards, when `effectiveStats` runs, then `maxHp` is 600; given a speedboat with five `speed` cards, then `kinematics.maxSpeed` is base + 12.5; five `turning` cards give base + 0.25.
- Given n `passiveHealing` cards (0..5), when `effectiveStats` runs, then `regen.missingPctPerS` is exactly `round3(0.02 + 0.006n)` and `regen.outOfCombatMs` is `15000 − 1000n`.
- Given a seeded server world with two damaged hulls idle 12 s, one holding five `passiveHealing` cards and one none, when a tick runs, then only the laddered hull gains hp, at `missing × 0.05 × dt/1000`.
- Given a hull with a shield up, when a blow is fully absorbed, then `lastDamagedAt` is unchanged and regen continues; when a blow breaks through, then the clock resets.
- Given `validateCatalog`, then 24 lines and 117 cards, `healOnGrant` on exactly `hullPoints`; no string `'armor'` remains in `shared/`, `server/src`, `client/src` (one-time grep, not a test).
- Given a `hullPoints` card at 0 copies, then its tier label is `I`; at 4 copies, `V`; the LOADOUT prints a dash for SPEED at zero copies.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 80.

## Spec Change Log

### 2026-10-13 — two spec corrections surfaced by the client wave (orchestrator rulings, not Eric's; the intent contract is read-only)
- The matrix row "hullPoints card at 4 copies prints `V`" was wrong: with the ship ladders out of `BASE_TIER_LINES` they read exactly like RADAR SWEEP and RELOAD — 0 copies `I`, 1 copy `I → II`, 4 copies (the fifth card) `IV → V`, bare `V` only at the cap of 5. That IS Eric's "0 → V" flip (amendment 94); the tests pin it.
- "the refit grid `R.rowCount` 5 → 6" was wrong: the card FACE prints one row per authored effect (never more than five); `SHIP_STAT_LINES` feeds the hover panel, the SHIP tooltip and the How-to-Play table, which grew to six rows and pass their fit tests at the 1280×614 floor. The face is DESIGN.md's ratified five-row 216×226 card and is untouched. To honor "rate row only" the wait effect is on an `UNPRINTED_PATHS` skip list in `ladderRows` (the face would otherwise have printed an `OUT OF COMBAT 15 → 14 s` row).
- KEEP: the pulse glyph, `LINE_NAMES.hullPoints = 'HULL'`, the frozen How-to-Play text.

## Review Triage Log

### 2026-10-13 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol on the same diff 02a4aa1b..162e3fd3; Codex and the Edge Case Hunter BUILD-ON-IT, the Blind Hunter FIX-FIRST on one finding)
- intent_gap: 0 (the one ruling gap — a grant mid-idle — was put to Eric live and ruled, amendment 100; the intent contract stands)
- bad_spec: 0
- patch: 3: (high 1, low 2)
- defer: 2: (low 2)
- reject: 2
- addressed_findings:
  - `[high]` `[patch]` Blind Hunter alone, CONFIRMED by the fit model: the results LOADOUT ladder line with six ladders ran past the panel's 530 px content column (five fit by ~5 px). Rendered as built plus three fits for Eric; he chose TWO ROWS OF THREE (amendment 99). `makeLadderLine` is a column of two `makeLadderRow`s; `results.test` pins the row split and no separator across the break.
  - `[low]` `[patch]` Edge Case Hunter CONFIRMED by probe, Blind Hunter PLAUSIBLE: `--tune regen.missingPctPerS=0` is "off" only for an un-carded hull (the fold keeps positive results, so a carded bot regens at 0.006 × copies) and a wait tuned under 1000 × copies saturates. The `regen.` family comment in `overrides.ts` now says so; the surface itself is deferred (below).
  - `[low]` `[patch]` Edge Case Hunter side note: two `shared/src/types.ts` comments still said the regen reads `CONFIG.regen`; reworded to `stats.regen`. The four stale SPEED-cap narrative comments the Blind Hunter listed (client `config.ts`, `render/wake.ts`, shared `sim/boost.ts`, server `ai/tactics.ts`) are patched in the record wave.
  - Ruled live, not a finding against the diff: Edge Case Hunter CONFIRMED by trace — the wait is read off the hull's current fold, so a hull idle past its NEW shorter wait heals the tick after the grant. Eric: live wait, no fresh clock (amendment 100). Kept as built; the per-hull-wait test already covers it.
  - Deferred (harness-only, `deferred-work.md` 2026-10-13): the `--tune regen.*` floor interplay above.
  - Rejected: a ladder rung whose every effect is on `UNPRINTED_PATHS` would print a blank face (unreachable with today's catalog; `movedRowIndex` is unaffected); `cardStatRows` at ≥ cap prints `before == after` (unreachable: `pickRefusal` returns `atCap`).
  - Cross-model picture: Codex found nothing; the LOADOUT overflow was the Blind Hunter's alone (confirmed by me on the project's own width model and rendered); the tune floor was the Edge Case Hunter's probe with the Blind Hunter agreeing; the mid-idle grant was the Edge Case Hunter's alone and became Eric's ruling.

## Design Notes

- **Why the ladder adds live in the catalog, not `CONFIG.regen`:** every other ladder authors its per-card number beside its id (SPEED +2.5, RELOAD −0.05); the base belongs to CONFIG and the step to the card. `barrel.test` pins `CONFIG.regen`'s key set as exactly two keys — that pin stays true.
- **Why one HEAL row:** Eric's pick (2026-10-13). The wait rung is real on the server but not printed; How-to-Play says "15 seconds" until 9.11 by his freeze.
- **Recorded consequences, not ruled:** mass = effective max hull (amendment 73), so a tier-V HULL speedboat (500) out-masses a bare dreadnought (350) in a ram; HULL REPAIR stays flat 50 + 50 per copy and is worth a smaller share of a 600-hp hull; the `rounded` bot profiles chase their lowest-count line, so a new zero-copy ladder pulls their spending (harness readouts will show it).
- **Shield and the clock:** today's gate already resets only on `dealt > 0`; Eric's "only damage against your actual HP resets the timer" is the existing rule and is pinned here, not re-implemented.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green
- `npm run lint` -- expected: zero errors
- `npm run check` -- expected: green; counts recorded in CHANGELOG. RESULT 2026-10-13: green — lint 0 errors (2 pre-existing max-lines warnings), tsc x3 clean, shared 42 files / 1058 tests, server 90 / 2525, client 129 / 3991, hook test 266 passed
- `grep -rn "'armor'" shared/src server/src client/src` -- expected: no hits

**Manual checks:**
- Eric picks the PASSIVE HEALING glyph on the artifact before the client commit; he judges the HULL card, the six-row card and the LOADOUT on staging after the PR.

## Auto Run Result

**Status:** done — PR open to `development` (2026-10-13), never merged by the agent; Eric judges on staging.

**Summary:** The ARMOR card is now HULL (id `hullPoints`): +50 max hull per card, five cards, the gained 50 healed on grant. SPEED and TURNING gain a fifth card. A new universal PASSIVE HEALING ladder folds through `effectiveStats().regen` (2 %/s base, +0.6 %/s per card to 5 %; wait 15 s, -1 s per card to 10 s); the server reads each hull's own wait and rate, drones never regen, and only damage that removes hull hp resets the clock. Ship ladders read Tier 0 to V on the card, the results LOADOUT shows six ladders as two rows of three, the PASSIVE HEALING card shows one HEAL row with a pulse-trace glyph, and How-to-Play stays frozen until 9.11. Eric ruled eight questions at the spec step (amendments 90-98) and two at the review gate (99, 100); 101 records the implementer readings.

**Files changed:** see the Code Map (shared `constants.ts`, `sim/{catalog,effects,stats}.ts`, `index.ts`; server `world.ts`, `ai/profiles.ts`, harness probe list; client `ui/{boonCopy,loadoutBlock,classSelect}.ts`, `how-to-play/copy.ts`, `render/equipmentIcons.ts`, `config.ts`; tests in all three workspaces; records).

**Review findings:** 1 live Eric ruling (amendment 100), 3 patches applied (LOADOUT two rows of three; harness regen-off floor comment; stale comments), 2 deferred to `deferred-work.md` 2026-10-13, 2 rejected. Cross-model picture: Codex found nothing; the LOADOUT overflow was the Blind Hunter's alone; the tune floor was the Edge Case Hunter's probe; the mid-idle grant was the Edge Case Hunter's alone and became amendment 100.

**Follow-up review recommended:** false — three small, localized patches.

**Verification:** `npm run check` green 2026-10-13 — lint 0 errors (2 pre-existing max-lines warnings), tsc x3 clean, shared 42 files / 1058 tests, server 90 / 2525, client 129 / 3991, hook test 266 passed. Manual: Eric on staging (HULL card, six-row card, LOADOUT).

**Residual risks:** the How-to-Play regen sentence understates until 9.11; the harness regen-off floor; HULL REPAIR stays a flat 50 on a 600 hull; mass = max hull means HULL cards add ram mass; the `rounded` bots chasing the new ladder — all recorded in amendment 101(h).
