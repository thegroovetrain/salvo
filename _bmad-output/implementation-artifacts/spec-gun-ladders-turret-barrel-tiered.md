---
title: 'Gun ladders: TURRET and BARREL fold into the CANNON and FLAK tiers'
type: 'bugfix'
created: '2026-09-30'
status: 'done'
baseline_revision: '86223419'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Eric played a match with the cannon and was offered a `DECK GUN BARREL` card. Story 8.15 should have retired every one-off gun card: amendments 89(d) and 108 recorded the opposite ("TURRET and BARREL stay") and were wrong. Eric's ruling of record, 2026-09-30: *there are NO MORE one-off upgrades; EVERY upgrade is tiered.* `deckGunTurret` and `deckGunBarrel` are deleted; their effects become rungs of the two gun ladders.

**Approach:** Catalog content change plus its fallout, no new mechanism. The CANNON ladder (`deckGun`, cap 4, base tier I) keeps +1 damage and −5 % reload at every tier and ADDS the second turret (gun pool 1 → 2, `equipment.gun.maxAmmo` +1) on the rung that reaches **tier III** (card 2, `tiers[1]`) and the second barrel per turret (`equipment.gun.barrels` +1, two parallel shells per click) on the rung that reaches **tier V** (card 4, `tiers[3]`). The FLAK ladder (`flak`, cap 4) keeps +2 damage and −5 % reload at every tier and ADDS a turret (`equipment.flak.maxAmmo` +1) on the rungs that reach **tier III** and **tier V** (pool 1 → 2 → 3). Eric's first answer put the steps at II and IV; he corrected himself to III and V in the same conversation ("OH you're right. Make the steps at Tier III and Tier V"). `LINE_IDS` goes 26 → 24, the card count 117 → 114, `PROTOCOL_VERSION` 63 → 64 (ids leave the wire's card vocabulary). The MACHINE GUN is untouched: another agent is changing it concurrently.

## Boundaries & Constraints

**Always:**
- `shared/src/sim/catalog.ts` stays the single author of the ladders; both sides fold the same catalog through `effectiveStats()`. No side re-derives pool or barrels.
- The flak pool at tiers III/V reloads through the existing `consume`/`tickReload` helpers and `reconcilePools` fills a raised cap generically; add no flak- or cannon-specific pool code.
- The stat-path whitelist is untouched: `equipment.gun.maxAmmo`, `equipment.gun.barrels` and `equipment.flak.maxAmmo` are already on it. `flak.burstRadius` and `flak.contactDamage` stay OFF it (amendment 113(d)).
- A ladder rung may now carry more than one authored effect. The tier card prints EVERY authored step of the rung it buys (amendment 85's rule), using only words the copy table already has: `ROUNDS` for a pool step, `SHELLS PER SHOT` for the barrel step. No new player-facing words. Amendment 71's "ONE row" for the deck gun face is read as "one row per authored step" now that the rung authors two; recorded in the new amendment.
- `PROTOCOL_VERSION` 63 → 64 with a header entry in `shared/src/index.ts`; `VERSION` and root `package.json` 0.18.22 → 0.18.23; `CHANGELOG.md` entry; BOTH trackers get a one-line stamp; epic-8 amendments get the ruling (number 185) and a short orchestrator record; GDD and catalog-v3 get DATED supersession notes only (minimal design-doc edits), never rewrites.
- Every test that pinned the deleted ids is rewritten to the new ladders, not deleted, unless its subject no longer exists (then say so in the report). Regression pins required: cannon pool 2 at III, barrels 2 at V, flak pool 2 at III and 3 at V, no production ladder rung is empty, no deleted id resolves.
- The gun `barrels` clamp stays `1..3` (harmless; the reachable max is now 2); fix the comments that say the BARREL card adds them.
- Golden-frame snapshot regeneration is expected (the seeded draw changes when lines leave the catalog): regenerate, diff-read the change, and say what moved.
- ESLint complexity ≤ 10; `npm run check` green before the PR.

**Block If:**
- Anything requires a NEW mechanism (a visible second gun, a new wire field, a new tooltip word): HALT and ask Eric.
- The machine gun rows must change for the build to compile (another agent owns them): HALT.

**Never:**
- Do not touch `machineGun` catalog rows, `CONFIG.machineGun`, `server/src/game/equipment/machineGun.ts`, its two test files, or the machine-gun entries in `boonCopy.ts`; edit shared test blocks that cover both guns only at the flak lines.
- Do not re-tune any number Eric did not state (damage steps, reload steps, blast radius, barrel spacing).
- Do not add a seventh frame exception, do not change the draw's weighting or guarantee, do not re-propose one-off cards.
- Do not merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cannon climbs | `deckGun` ×0..4 | tier I→V; damage 15,16,17,18,20; pool 1,1,2,2,2; barrels 1,1,1,1,2; reload ×1, .95, .90, .85, .80 | No error expected |
| Flak climbs | `flak` ×0..4, flak mounted | tier I→V; damage 12,14,16,18,20; pool 1,1,2,2,3; burst radius 50 at every tier | No error expected |
| Dead id on the wire | a card list containing `deckGunTurret` | `resolveCards` drops it (fail-closed), stats fold as if absent | silently dropped, never a throw |
| Cannon card face, rung to III | `deckGun` ×1 held, card offered | rows `GUN DAMAGE 16 → 17` and `ROUNDS 1 → 2` | No error expected |
| Cannon card face, rung to V | `deckGun` ×3 held | rows `GUN DAMAGE 18 → 20` and `SHELLS PER SHOT 1 → 2` | No error expected |
| Flak card face, rung to III | `flak` ×1 held, flak mounted | `RELOAD 5.7 → 5.4 s`, `DAMAGE 14 → 16`, `ROUNDS 1 → 2` (reload values as the fold prints them) | No error expected |
| Raised pool fills | cannon card 2 taken mid-match with pool 1/1 | pool becomes 2/2 at once (the former TURRET behavior via `reconcilePools`) | No error expected |
| Ladder host gate | flak mounted | `deckGun` never offered; `flak` offered; neither deleted id exists to offer | No error expected |

</intent-contract>

## Code Map

- `shared/src/sim/catalog.ts` -- `LINE_IDS` (drop two), `CATALOG` (`deckGun` and `flak` become per-rung ladders; delete two rows), header/citation comments (24 lines, 114 cards), new `ladderSteps` helper beside `ladder`
- `shared/src/sim/draw.ts:172-183` -- `ladderHost` doc example names TURRET/BARREL; reword
- `shared/src/sim/stats.ts:41,:506,:715` -- stale BARREL comments; clamp stays
- `shared/src/constants.ts:982-983` -- stale AFT TURRET comment
- `shared/src/index.ts:754` -- `PROTOCOL_VERSION` 64 + header entry
- `shared/src/__tests__/` -- `catalog`, `draw`, `stats`, `boons`, `barrel`, `damageGuardrail`, `radarRaster` (PV pin) per the sweep
- `server/src/game/ai/profiles.ts:78-79`, `server/src/game/equipment/guns.ts:215`, `server/src/game/world.ts:3027` -- comment-only
- `server/src/__tests__/` -- `botPolicy`, `upgrades`, `combat`, `gunnery`, `radarWire`, `broadside` (self-contained injected line may stay), `goldenFrames` + snapshot, `scripts/batchsim/__tests__/upgradeEvidence`
- `server/scripts/batchsim/balanceProbe.ts:157`, `catalogMetrics.ts:197` -- barrel loop/comment to the reachable 1..2
- `client/src/ui/boonCopy.ts` -- `LINE_NAMES`, `STAT_LINES` (drop two), `BOON_EXPLAIN` (drop two), comments at :87/:405; `ladderRows` already prints every effect
- `client/src/__tests__/` -- `boonCopy`, `cardStatRows` (the one-row pin becomes the per-step pin), `slotTooltip`, `hotbar`, `tooltipFit`, `upgradeMenu`, `refitTooltipFit`, `refitCardFit`, `fitCheck`, `aimPreview`, `boonStats`, `roomBindings`, `nameplatesAboveTerrain`, `keyboard`
- `VERSION`, `package.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `epic-8-context-amendments.md`, `epic-8-context.md`, GDD `gdd.md:142,:248`, `catalog-v3.md:36-37,:84-85,:138,:140,:214-215,:230`, `epics.md:147,:151` -- docs wave

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/catalog.ts` -- add `ladderSteps(id, steps[cap], extra)`; rewrite `deckGun` and `flak` as per-rung ladders; delete the two rows and ids; fix counts -- the single authoring point
- [ ] `shared/src/sim/{draw,stats}.ts`, `shared/src/constants.ts` -- comment fixes only
- [ ] `shared/src/index.ts` -- PV 64 + header entry
- [ ] `shared/src/__tests__/*` -- rewrite pins; add the climb tables of the I/O matrix as explicit tests in `stats.test.ts`; pin "no production rung is empty" and "`ladderSteps` gives each rung a fresh array" in `catalog.test.ts`
- [ ] `server/src/**` -- comment fixes; test fixtures move from the dead ids to `deckGun` copies (TURRET pool-fill tests → `deckGun` ×2; the "gun card whose tier does not move" test uses an injected test catalog line); regenerate the golden snapshot and read the diff
- [ ] `server/scripts/batchsim/*` -- barrel loop 1..2
- [ ] `client/src/ui/boonCopy.ts` -- drop the four entries and the comments; no new words
- [ ] `client/src/__tests__/*` -- rewrite pins; `cardStatRows` pins the two-row faces at III and V and the one-row faces at II and IV
- [ ] Docs wave -- version 0.18.23, CHANGELOG, both trackers, amendment 185 (+ orchestrator record), GDD/catalog-v3/epics dated notes, epic-8-context re-aligned

**Acceptance Criteria:**
- Given a cannon captain with two CANNON cards, when the fold runs on either side, then the gun pool is 2 and barrels are 1; with four cards barrels are 2 and the pool is 2.
- Given a flak captain with two FLAK cards, when the fold runs, then the flak pool is 2; with four, 3; the burst radius is 50 at every tier.
- Given the production catalog, when `LINE_IDS` is read, then it has 24 entries, no `deckGunTurret`, no `deckGunBarrel`, and every ladder rung of every line is non-empty.
- Given a cannon card that reaches tier III, when its face is rendered, then it prints exactly two rows: the damage step and `ROUNDS 1 → 2`; at tier II it prints one row.
- Given a flak captain whose pool was 1/1, when the second FLAK card is applied, then the pool reads 2/2 the same tick.
- Given `npm run check`, when it runs in the worktree, then lint, the three type-checks, every test suite and the hook test pass.

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol`; all three BUILD-ON-IT, no code defect; agreement: Blind + Edge both flagged the batch-sim barrel pricing; Codex alone found nothing and traced the fold, the helper, the fail-closed id drop, pool reconciliation and the bot scorer clean)
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 0, low 4)
- defer: 0
- reject: 1: (high 0, medium 0, low 1)
- addressed_findings:
  - `[low]` `[patch]` `balanceProbe.ts` priced the two-barrel row at base damage (30) though only the tier V build reaches two barrels — each row is now priced at the build that reaches it (15 / 40) (Blind + Edge)
  - `[low]` `[patch]` catalog-v3 §4 table rows for TURRET/BARREL and `deferred-work.md:1460` (the accepted 45 hp one-click) lacked the supersession stamp — stamped (Blind)
  - `[low]` `[patch]` `guns.ts` fire-control doc still said "1..3 TWIN/TRIPLE MOUNT, Story 2.8" — now the reachable 1..2 (Blind)
  - `[low]` `[patch]` the maxed cannon no longer one-clicks a 45 hp small drone (2 × 20 = 40) — put to Eric before the PR, accepted as is, recorded as amendment 187 (Blind + the shared wave)
  - rejected: the gun slot tooltip no longer names the second barrel once bought (the gun square badge and the two preview bursts show it; no in-game copy unasked) — noted for Eric in amendment 187

## Auto Run Result

**Summary:** `deckGunTurret` and `deckGunBarrel` are deleted; the CANNON ladder carries the second turret on its rung to tier III and a second barrel per turret on its rung to tier V; the FLAK ladder carries a turret on its rungs to III and V; per-tier damage/reload steps unchanged. `ladderSteps` authors per-rung ladders. 24 lines, 114 cards, PV 64, version 0.18.23. Eric's rulings: amendments 185 (the fold), 187 (the drone consequence accepted); orchestrator readings 186.

**Files changed (54 + docs):** `shared/src/sim/catalog.ts` (rows, ids, helper), `shared/src/index.ts` (PV 64), comment fixes in `draw.ts`/`stats.ts`/`constants.ts`; 7 shared test files; server comment fixes (`profiles.ts`, `guns.ts`, `world.ts`), 8 server test files + the golden snapshot (two offer hands moved), `balanceProbe.ts`/`catalogMetrics.ts`; `client/src/ui/boonCopy.ts` (four entries dropped) + 16 client test files; CHANGELOG, VERSION, package.json, both trackers, epic-8 amendments 185–187, epic-8 context, GDD/catalog-v3/epics/deferred-work dated notes.

**Review:** 4 low patches applied, 0 deferred, 1 rejected (see the triage log). Follow-up review: not recommended (comment/doc/script patches only).

**Verification:** `npm run check` green — shared 1021, server 2281, client 3760, hook suite 266; lint 0 errors (3 pre-existing `max-lines-per-function` warnings in untouched files); `tsc` clean on all three; batch-sim probe prints 15 / 40 for 1 / 2 barrels.

**Residual risks:** the parallel machine-gun change will collide on `catalog.ts`, `catalog.test.ts`, `stats.test.ts`, `cardStatRows.test.ts`, `boonCopy.ts` neighbours and on the PV pins (`index.ts`, `barrel.test.ts`, `radarRaster.test.ts`, `colyseus018.test.ts`, `denials.test.ts`, `ordnanceMasksAreServerOnly.test.ts`) if it also bumps PV — whichever lands second re-bumps. A rung that raises a pool mid-reload hands the new rounds out loaded (amendment 41 rule, as the TURRET card did).

## Design Notes

Tier numbering: base-tier ladders (`deckGun`, `flak`) read `tier = 1 + copies` (`applyLineTier`, `boons.ts:146`), so `tiers[0]` is the rung I → II and `tiers[1]` is II → III. Eric's "tier III and tier V" are therefore cards 2 and 4:

```ts
deckGun: ladderSteps('deckGun', [
  [dmg],                 // I → II
  [dmg, gunPool(+1)],    // II → III  — the second turret
  [dmg],                 // III → IV
  [dmg, gunBarrels(+1)], // IV → V   — a second barrel per turret
], { appliesTo: ['gun'] }),
flak: ladderSteps('flak', [[d2], [d2, flakPool(+1)], [d2], [d2, flakPool(+1)]], { appliesTo: ['flak'] }),
```

The −5 % reload per tier stays DERIVED from `equipment.<id>.tier` in `clampStats`, never authored. Nothing about firing changes: `guns.ts` already fires `gun.barrels` parallel shells and `flak.ts` already drains a pool of `flak.maxAmmo`.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green, with the new climb tables
- `npm test -w server` -- expected: green; golden snapshot regenerated knowingly
- `npm test -w client` -- expected: green
- `npm run lint` -- expected: clean, no complexity errors
- `npm run check` -- expected: green end to end

**Manual checks (if no CLI):**
- In a dev match with the cannon, the offer never shows DECK GUN TURRET or DECK GUN BARREL; the second CANNON card's face shows the ROUNDS row and the HUD gun square reads 2 rounds after taking it.
