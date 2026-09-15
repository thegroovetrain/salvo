---
title: 'Story 8.1: The Card Model and Catalog Engine'
type: 'feature'
created: '2026-09-15'
status: 'in-progress'
baseline_revision: 'effb4474a3f4741af0e8995b58bce51bc9ba8bb9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/catalog-v3.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The shipped boon engine (`shared/src/sim/boons.ts`, `stats.ts`, `deck.ts`) models 28 v2 lines with rarity, categories, acquisition cards and a subdeck walk, folds effects in pick order (two real order-dependence bugs on record), and has no per-equipment tier concept. Catalog v3 (Eric's authored sheet, `catalog-v3.md`) needs ladder lines with tiers, add-ons that target an equipment list, consumables that stock, and a fold that is byte-identical for any legal pick order.

**Approach:** Introduce `shared/src/sim/catalog.ts` as THE catalog (29 `LINE_IDS`, `{ id, kind, cap, tiers[] }`, authored through `weapon()` / `ladder()` / `addon()` / `consumable()` helpers, frozen and pinned), re-shape `EffectiveStats.equipment` into a TOTAL record keyed by the widened `EquipmentId` carrying `tier`, generate `BOON_STAT_PATHS` from it, move the equipment reload step and the fractional-step floor into `clampStats`, make `effectiveStats(cls, cards: LineId[])` the firewall, delete rarity/acquisition/category/`slotReplace`, rename `OwnShip.boons` → `cards`, bump `PROTOCOL_VERSION` 50 → 51, and keep the game PLAYABLE on staging via an interim all-buildable-lines deck (Eric ruling 2026-09-15).

## Boundaries & Constraints

**Always:**

- **Eric rulings 2026-09-15 (record as epic-8 amendments 5–8 in the same PR, re-apply to `epic-8-context.md`):** (5) INTERIM STATE = stay playable: an interim deck of every line whose mechanism exists today; lines for unbuilt weapons/consumables are authored as stubs, flagged `stub: true`, and EXCLUDED from draws until their story lands. (6) legacy `torpedo` → `heavyTorpedo`, `mine` → `navalMines`; 8.13 adds the light/supercav torpedoes and captive mines as new modules. (7) the 29 `LINE_IDS` are exactly: `armor, speed, turning, radarSweep, reload, deckGun, deckGunTurret, deckGunBarrel, lightTorpedo, heavyTorpedo, supercavTorpedo, navalMines, captiveMines, missile, machineGun, flak, monitor, broadside, starShells, hullRepair, shieldBlock, smokeScreen, chaff, decoyBuoy, acousticHoming, foulingMines, heatSeeking, dazzleShells, phosphorShells`. (8) the interim refit card meta row shows the v3 kind word (`WEAPON · UPGRADE · ADD-ON · CONSUMABLE`) + copy count in neutral colour; no tier-ramp colour, no per-slot `◆n` category count (8.6/8.7 own the real faces).
- Catalog content: numbers come ONLY from `catalog-v3.md` §4 (the `[DRAFT]`-tagged ones, e.g. TURNING +0.05 rad/s, are used verbatim and carry a `// [DRAFT]` comment). 8.1 authors real tiers for the five ladders and the deck-gun family (ARMOR +25 maxHp/tier heal-on-grant, SPEED +2.5 u/s, TURNING +0.05 rad/s, RADAR SWEEP +3 rpm cap 30, RELOAD −0.05 cooldownScale/tier to 0.75, DECK GUN +1.25 dmg & −5 % reload/tier with a real tier I step, TURRET pool 1→2, BARREL +1/copy) because those replace shipped v2 lines; every equipment line is copy 1 `[{ kind: 'slotFill', equipmentId }]` + tiers II–V EMPTY (`[]`, Stories 8.12–8.16 fill them); consumables are `[{ kind: 'stock', equipmentId }]` per copy (the fold ignores `stock`; 8.7 wires it); add-ons generate one `doctrine` per `appliesTo` entry (`acousticHoming` → `lightTorpedo`+`heavyTorpedo` homing; `foulingMines` → `navalMines` propFouling; `dazzleShells`/`phosphorShells` → `starShells`; `heatSeeking` → `missile`).
- Interim deck (until 8.2): `buildDeck()` = every NON-stub line at its cap, identical for every hull. Stub set today: `lightTorpedo, supercavTorpedo, captiveMines, missile, machineGun, flak, monitor, hullRepair, shieldBlock, smokeScreen, chaff, decoyBuoy, heatSeeking` (13 ids; `broadside` and `starShells` exist today and are playable).
- Ladder base tiers: ARMOR/SPEED/TURNING/DECK GUN begin Tier I EQUIPPED (copy 1 reads I → II; cap 4 / 4 / 4 / 4 copies = tiers II–V); RADAR SWEEP and RELOAD have no base tier (copy 1 reads I; cap 5). Nothing reaches VI (pin).
- `EquipmentId` (widened) = the 13 v3 equipment ids (`gun, boost, lightTorpedo, heavyTorpedo, supercavTorpedo, navalMines, captiveMines, missile, machineGun, flak, monitor, broadside, starShells`) ∪ legacy `speedBoost`, `radarBuoy` (deleted by 8.9 / 8.15, unaddressable by any v3 card). `EffectiveStats.equipment` is TOTAL over it; unbuilt ids get a base-number row from `catalog-v3.md` (or zeros where the sheet is `[DRAFT]`-blank) and NO server module — the server equipment registry stays total over the ids that have modules, with a pin that every non-stub `slotFill` target has a registry entry.
- `clampStats` derivations, never card-writable: `equipment[id].reloadMs = base × round3(1 − 0.05 × (tier − 1)) × cooldownScale` (deck gun: `× round3(1 − 0.05 × tier)`); integer stats (`tubes`, `turrets`, `barrels`, `flares`, `pool`s) accumulate as floats and floor ONCE at the end; `sightRange = radarRange/2`, `gun/starShells/broadside.rangeU`, `mine.triggerRadius` (+ the run-once captive blast swap) stay derived and OFF the generated whitelist; re-pin sites remain exactly two (fold + clamp).
- Order-independence: `validateCatalog` refuses any stat path that receives `add` from one line and `mult` from another; a permutation property test (≥200 shuffles over random legal picks, every class) asserts byte-identical `effectiveStats`.
- `HOOK_REGISTRY` stays EMPTY with an explicit pin; `BoonEffect` = `stat | slotFill | doctrine | behavior | stock`.
- Wire: `OwnShip.cards: string[]` replaces `boons`; `PROTOCOL_VERSION` 50 → 51 with a dated log line (catalog v3 + `cards`); `CONFIG.deck` becomes `{ size: 40, maxEquipmentLines: 3 }` (AR52) — unused until 8.2, documented; `CONFIG.offer.size` 4 untouched; `CONFIG.catalog.reloadStepPerTier: 0.05`.
- Bots: `ai/spending.ts` weights LINE ids by kind (ladder/equipment/addon/consumable) with per-profile per-line overrides re-keyed from the old category tables; no rarity rank; HEAL_CHOICE untouched (8.8). `ai/` never imports `world.js`.
- Tests are UPDATED, never deleted: boons/deck/stats/barrel identity pins re-pinned to v3 (29 lines, 114 cards, per-line caps), the interim deck size, the two-homes parity, the "every non-stub line folds (no dead cards)" pin, client copy/menu/fit tests re-keyed.
- Version 0.17.134 → 0.17.135, one-line stamps in BOTH trackers, `deferred-work.md` closes the three entries made moot (bots never fit acquisition `~:1414`; `rareWeightPerDryLevel` dial `~:1461`; "at most 1 of 6 acquisition cards"), `CHANGELOG.md` entry, `npm run check` green.
- Process: no dev server in Eric's checkout; kill what you boot; halt on any error.

**Block If:**

- A catalog-v3 number is needed that the sheet does not state at all (not even `[DRAFT]`) for a NON-stub line.
- Keeping the game playable would require inventing a mechanic (e.g. a new doctrine verb) rather than mapping onto an existing one.
- Complexity or file-size limits cannot be met without touching perception/frames beyond the `boons` → `cards` rename.

**Never:**

- Build slots, consumable activation, the draw redesign, default decks/legality, the damage gate, the collector, Shift boost, HUD re-cut, or any 8.2+ mechanism.
- Touch the `Tab` offer shape (four ids, `1`–`4`), the passive XP tick, the heal strip, the six perception exceptions, or `CLAUDE.md`.
- Invent a card, number or consumable; author tiers II–V for equipment lines; delete `speedBoost`/`radarBuoy` modules (8.9/8.15).
- Add a per-ship spatial field to the Colyseus schema.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Permutation fold | Any legal multiset of non-stub line ids, two orders | `effectiveStats` byte-identical (deep-equal) | Test failure |
| Ladder tier I equipped | `cards = ['armor']` on any class | `maxHp` = base + 25 (copy 1 is the I → II step); `equipment.gun.tier` = 1 with zero cards | n/a |
| No-base ladder | `cards = ['reload']` | `cooldownScale` 0.95; five copies → 0.75 exactly (round3) | 6th copy refused by cap (never in a deck) |
| Deck gun reload | `deckGun` ×0 / ×1 / ×4 | gun `reloadMs` = base × 1 / 0.95 / 0.80, then × cooldownScale | n/a |
| Fractional floor | Barrel +0.5-style fractional tiers (test-only line) | Accumulate 0.5+0.5 → +1 barrel; 0.5 alone → +0 | n/a |
| Add + mult collision | Test catalog with line A `add` and line B `mult` on one path | `validateCatalog` throws naming the path | Throw |
| Stub line drawn | Interim deck built | Stub ids never appear in `buildDeck()` output or any offer | Pin |
| Stub slotFill | `cards = ['machineGun']` forced via test | `applySlotEffect` no-op (no registry module), stats row present at base numbers | Silent no-op + pin |
| Wire rename | Frame for own ship | `OwnShip.cards` present, `boons` absent; PV 51 refuses PV 50 | Join gate |
| Legacy equipment | Ship carrying torpedo/mine | `equipment.heavyTorpedo` / `equipment.navalMines` rows drive them; ids `torpedo`/`mine` gone everywhere | tsc |

</intent-contract>

## Code Map

- `shared/src/sim/catalog.ts` -- NEW: `LINE_IDS`, `LineId`, `CatalogLine`, kinds, helpers, `CATALOG`, `validateCatalog`, `isStubLine`
- `shared/src/sim/boons.ts:41-813` -- shrink: keep `BoonEffect` union (+`stock`, −`slotReplace`), `DOCTRINE_MODES`, `resolveCards`, `boonBehaviors`, `applySlotEffect`, `slotsWithBoons`, `applyBoonStats`, validators; delete rarity/category/acquisition/`BOON_CATALOG`/`BOON_STAT_PATHS` literal
- `shared/src/sim/stats.ts:180,382,469` -- `EffectiveStats.equipment` total record with `tier`; `clampStats` reload step + floor; `effectiveStats(cls, cards)`
- `shared/src/sim/loadout.ts:15,94,107` -- widened `EquipmentId`; `equipmentMaxAmmo`/`equipmentReloadMs` become record lookups
- `shared/src/sim/deck.ts:54-247` -- `DeckState` without `levelsSinceRare`; `buildDeck()` interim; `drawOffer` weight = copies remaining; delete `consumeAcquisition`
- `shared/src/sim/hooks.ts:81` -- empty-registry pin
- `shared/src/types.ts:415` -- `OwnShip.cards`
- `shared/src/constants.ts:1572-1600` -- `CONFIG.deck` → `{ size, maxEquipmentLines }`; new `CONFIG.catalog.reloadStepPerTier`; per-equipment base rows for unbuilt ids
- `shared/src/index.ts:563` -- PV 51 + log line; barrel export of `catalog.js`
- `server/src/game/world.ts:177,457,2083-2303` -- `EMPTY_DECK`, `ShipRecord.cards`, `applyCard`, `settleSpend` without the acquisition branch; `rescaleReloadTimers` with tier step
- `server/src/game/frames.ts:88` -- `cards: [...ship.cards]`
- `server/src/game/equipment/index.ts` -- registry keyed by new ids (`heavyTorpedo`, `navalMines`); pin: every non-stub `slotFill` target exists
- `server/src/game/ai/spending.ts`, `profiles.ts`, `tactics.ts`, `types.ts` -- kind-weighted line picks, no rarity
- `server/scripts/batchsim/{deckSim,runner,spendPolicy,catalogReport,balanceProbe,report,overrides,catalogMetrics}.ts`, `server/scripts/rl/features.ts` -- re-key to v3 ids, drop pity/rarity
- `client/src/net/roomBindings.ts:192,708,820,1331,1342` -- `cards`, `fitTone()` without rarity
- `client/src/render/hotbar.ts:238-299,725-994` -- drop category `◆n`; tooltip rows from kind/tier
- `client/src/ui/upgradeMenu.ts:263,334,438,855-916`, `ui/refitCardFit.ts`, `ui/boonCopy.ts`, `ui/refitTooltip.ts`, `ui/results.ts:651-698`, `audio/tones.ts:398`, `sim/prediction.ts:202`, `config.ts:1731-1807` -- kind word meta row, v3 names/ladders/explain copy, `cards`
- Tests: `shared/src/__tests__/{boons,deck,stats,barrel,hooks,damageGuardrail}.test.ts`, `server/src/__tests__/{upgrades,boons,botPolicy,bots,doctrines,perception}.test.ts`, `server/scripts/batchsim/__tests__/batchSim.test.ts`, `client/src/__tests__/{boonCopy,upgradeMenu,refitCardFit,refitTooltipFit,fitCheck,tones,hotbar,boonStats,tooltipFit,refitFailOpen,prediction,howToPlay}.test.ts`
- `VERSION`, `package.json`, `CHANGELOG.md`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,deferred-work.md,epic-8-context.md,epic-8-context-amendments.md}`, `_bmad-output/gds-workflow-status.yaml`

## Tasks & Acceptance

**Execution:**
- [ ] `epic-8-context-amendments.md` + `epic-8-context.md` -- record rulings 5–8 (interim state, legacy ids, LINE_IDS, interim refit UI) -- durable home first
- [ ] `shared/src/sim/catalog.ts` + `constants.ts` + `loadout.ts` -- the catalog module, widened `EquipmentId`, `CONFIG.catalog`/`CONFIG.deck` -- foundation
- [ ] `shared/src/sim/stats.ts` + `boons.ts` + `hooks.ts` -- total `equipment` record with `tier`, generated whitelist, reload step + floor in the clamp, `effectiveStats(cls, cards)`, deletions, validator add+mult rule -- the firewall
- [ ] `shared/src/sim/deck.ts` + `types.ts` + `index.ts` -- interim `buildDeck`, weight-by-copies draw, `OwnShip.cards`, PV 51, barrel -- wire contract
- [ ] `shared/src/__tests__/*` -- re-pin identities (29/114/caps/stub set), permutation property, reload step, floor, validator, empty registry, two-homes parity -- `npm test -w shared` green
- [ ] `server/src/game/{world,frames,equipment/index}.ts` + `ai/*` + `scripts/batchsim/*` + `scripts/rl/features.ts` + server tests -- consume the new model; registry ids; bots weight by kind -- `npm test -w server` green
- [ ] `client/src/**` + client tests -- `cards`, kind-word meta row, v3 copy, no rarity/category -- `npm test -w client` green
- [ ] `VERSION`/`package.json`/`CHANGELOG.md`/both trackers/`deferred-work.md` -- cycle 135, 0.17.135, PV 51, amendments 5–8; close the three moot ledger entries -- tracker discipline
- [ ] `npm run check` green; headless `matchSmoke`/`combatSmoke`/`weaponsSmoke` over real sockets -- the gate

**Acceptance Criteria:**
- Given the catalog module, when `validateCatalog(CATALOG)` runs, then it passes, `LINE_IDS.length === 29`, every line has `tiers.length === cap`, total cards = 114, and a test catalog with add+mult on one path is refused.
- Given any legal pick multiset in two orders, when folded, then `effectiveStats` is deep-equal (property test, every class).
- Given zero cards, when `effectiveStats` runs, then every class's stats are byte-identical to today's zero-boon identity (except the renamed equipment keys) and `equipment.gun.tier === 1`.
- Given the interim deck, when built for any hull, then it contains every non-stub line at cap and no stub id; `drawOffer` never offers a stub.
- Given a joined client, when a frame arrives, then `you.cards` exists and `you.boons` does not; PV 50 clients are refused.
- Given `npm run check`, then lint, tsc ×3 and every test pass, and `HOOK_REGISTRY` has zero entries.

## Spec Change Log

## Review Triage Log

## Design Notes

- `catalog.ts` sits BELOW `stats.ts`/`boons.ts` (imports only types + `CONFIG`); the fold resolves ids through it, killing the injectable-catalog parameter thread (`World.boonCatalog`, `catalog = BOON_CATALOG` defaults). Tests inject alternative catalogs through a `resolveCards(ids, catalog)` seam kept exported for that purpose.
- Stub flag lives on the line (`stub: true`) and is a build-time fact, not wire; `buildDeck` and the "no dead cards" pin both read `isStubLine`. When 8.12–8.16 fill a line they flip the flag and the pins tighten automatically.
- Deck gun tier arithmetic: weapons use `(tier − 1)`, the deck gun uses `tier` — pin both in one table test to kill the off-by-one.
- Fractional floor: fold accumulates into a float shadow record; `clampStats` floors integer fields once. Pin with a test-only line adding 0.5 barrels.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green; boons/deck/stats/barrel pins reflect v3
- `npm test -w server && npm test -w client` -- expected: green
- `npm run check` -- expected: exit 0
- `grep -rn "levelsSinceRare\|slotReplace\|BoonRarity\|BOON_CATALOG\|isAcquisitionDef\|consumeAcquisition\|EQUIPMENT_CATEGORY\|UNIVERSAL_CATEGORIES\|\.boons\b" shared/src server/src client/src` -- expected: no matches
- `HC_DEV_OPTIONS=1 PORT=<free> node server/scripts/matchSmoke.mjs` (+ `combatSmoke`, `weaponsSmoke`) -- expected: pass over real sockets
