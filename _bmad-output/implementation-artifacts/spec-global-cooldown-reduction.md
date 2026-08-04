---
title: 'Global Cooldown Reduction — gun/cannon reload rebalance + the shipCooldown card line'
type: 'feature'
created: '2026-08-04'
status: 'in-progress'
baseline_revision: '1514b6e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The deck gun (3s) and the Battleship cannon (15s) fire far too often for their payloads — the cannon in particular is the strongest weapon in the game because a 500 u/s shell at 15s cadence gives no reaction window — and the seven per-equipment `*Reload` card lines make cooldown a shallow, siloed axis that rewards single-weapon tunnel builds instead of a whole-ship engineering choice.

**Approach:** Raise `CONFIG.gun.reloadMs` 3000 → 5000 and `CONFIG.cannon.reloadMs` 15000 → 50000; delete all seven per-equipment reload boon lines; introduce ONE global `cooldownScale` stat on `EffectiveStats` (base 1.0) that multiplies EVERY equipment's `reloadMs` post-fold, driven by a single universal card line `shipCooldown` (category `ship`, common, 4 copies, −0.10 additive per card → 0.6 at 4 stacks). Eric rulings 2026-08-04.

## Boundaries & Constraints

**Always:**
- `cooldownScale` stacks **ADDITIVE-LINEAR** (`add: -0.1` per card), never multiplicative. 4 stacks MUST yield exactly 0.6 → gun 5000 → 3000 ms, cannon 50000 → 30000 ms.
- The scale applies to **all 7 equipment cooldowns**: gun, cannon, torpedo, mine, starShells, speedBoost (`boost.reloadMs`), decoyBuoy — the two non-weapon abilities included.
- The multiply happens in ONE place, `clampStats()` in `shared/src/sim/stats.ts`, the post-fold home beside the existing `gun.rangeU = radarRange` re-derivation — so `effectiveStats()` stays the sole desync firewall and every consumer (`equipmentReloadMs`, server ammo ticks, client hotbar/HUD) picks it up with zero extra wiring.
- Zero boons MUST be byte-identical to base CONFIG: `cooldownScale` base is exactly `1.0` and `x * 1.0 === x`.
- `shipCooldown` lives in the **universal** `ship` category (always in every deck regardless of loadout) — a global stat must be globally drawable.
- Catalog content is wire contract: bump `PROTOCOL_VERSION` 19 → 20 in `shared/src/index.ts`.
- Bump `VERSION` 0.17.40 → 0.17.41 (cycle 41) and advance `_bmad-output/gds-workflow-status.yaml` (`next_expected` + `last_updated`) in this same change.

**Block If:**
- Any test demands a *game-design* answer not covered above (e.g. a replacement card line for a thinned subdeck, or a different stacking curve) — HALT rather than invent a mechanic.

**Never:**
- Never keep any of `gunReload`, `cannonReload`, `torpedoReload`, `mineReload`, `boostReload`, `starReload`, `decoyReload` — all seven lines die.
- Never remove the seven `<equipment>.reloadMs` entries from `BOON_STAT_PATHS`; they stay whitelisted (nothing writes them today, and a future per-weapon card must still compose *before* the global scale).
- Never change any other CONFIG tunable (torpedo/mine/starShells/boost/decoy base reloads, damage, speeds, ranges all stay put). Torpedo speed 60 u/s is a fixed lever.
- Never add replacement card lines to the thinned `speedBoost` / `decoyBuoy` subdecks — that is deferred work, not this cycle.
- Never edit `DESIGN.md` / `EXPERIENCE.md` / the GDD (minimal-design-doc-edits house rule); doc drift goes to the deferred ledger.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Zero boons | `effectiveStats('battleship', [])` | Every `<eq>.reloadMs` === `CONFIG.<eq>.reloadMs` exactly (gun 5000, cannon 50000) | No error expected |
| One shipCooldown | 1 stack | `cooldownScale` 0.9; gun 4500, cannon 45000, torpedo 10800, mine 7200, boost 16200, star 18000, decoy 18000 | No error expected |
| Full stack | 4 stacks (the copy cap) | `cooldownScale` 0.6; gun 3000, cannon 30000; all 7 scaled by 0.6 | No error expected |
| Over-stack (defensive) | ≥10 stacks forced via a hand-built boon list | `cooldownScale` floored at 0.1, never ≤ 0; reloads stay finite and positive | Floor clamp in `clampStats`, no throw |
| Junk/absent id on the wire | client resolves an offer containing a deleted id e.g. `gunReload` | Silently dropped by `resolveBoons` fail-closed; no crash, no stat movement | Existing fail-closed path |
| Deck draw | any hull's deck built by `buildDeck` | `ship` category contributes 14 cards (5+5+4); catalog totals 36 lines | No error expected |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.gun.reloadMs` (3000→5000) and `CONFIG.cannon.reloadMs` (15000→50000), plus their doc comments.
- `shared/src/index.ts:126` -- `PROTOCOL_VERSION` 19 → 20 (catalog content changed = wire break).
- `shared/src/sim/stats.ts` -- `EffectiveStats` gains `cooldownScale`; `baseStats()` seeds it 1.0; `clampStats()` floors it and multiplies all 7 `reloadMs`.
- `shared/src/sim/boons.ts` -- delete 7 reload lines; add `shipCooldown`; add `'cooldownScale'` to `BOON_STAT_PATHS`. (Header comment says "42 card lines" → 36.)
- `shared/src/__tests__/boons.test.ts` -- `SCARCITY` table rows, `toHaveLength(42)`→36, header comment.
- `shared/src/__tests__/deck.test.ts` -- per-category + per-hull deck-size matrix (see Design Notes); `torpedoReload` placeholder at ~:282.
- `shared/src/__tests__/stats.test.ts` -- zero-boons identity literal needs `cooldownScale: 1`; the `mineReload` fold assertion (~:294-305) is rewritten against `shipCooldown`.
- `client/src/ui/boonCopy.ts` -- delete 7 `BOON_LADDERS` + 7 `STAT_LINES` rows; add `shipCooldown` ladder (4 rungs) + stat line.
- `client/src/__tests__/boonCopy.test.ts` -- id-specific pins at ~:53-54, :148, :220.
- `client/src/__tests__/boonStats.test.ts` -- `gunReload` fold assertion (~:132-134) rewritten.
- `client/src/__tests__/{fitCheck,tones,refitCardFit}.test.ts` -- `>= 42` catalog-size guards → `>= 36`.
- `client/src/__tests__/{hotbar,upgradeMenu}.test.ts` -- doomed ids used as placeholders; swap for surviving ids.
- `server/src/__tests__/upgrades.test.ts` -- `gunReload` placeholders (~:381,389,436) + the whole `'gunReload: a consumed round starts the EFFECTIVE (shorter) reload'` test (~:730-738).
- `server/src/__tests__/goldenFrames.test.ts` + `__snapshots__/goldenFrames.test.ts.snap` -- explicit `gunReload` at ~:224 AND RNG-derived offers in the snapshot: regenerate the snapshot and audit the diff.
- `VERSION`, `CLAUDE.md` -- version bump; CLAUDE.md's "3s reload" gun line and `PROTOCOL_VERSION` note.
- `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/deferred-work.md` -- status advance + thinned-subdeck ledger entry.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/stats.ts` -- add `cooldownScale: number` to `EffectiveStats`, seed `1` in `baseStats()`, and in `clampStats()` floor it (`Math.max(0.1, …)`) then multiply `gun/cannon/torpedo/mine/starShells/boost/decoyBuoy .reloadMs` by it -- one post-fold home keeps the firewall intact and needs no consumer changes.
- [ ] `shared/src/sim/boons.ts` -- add `'cooldownScale'` to `BOON_STAT_PATHS`; delete the 7 reload lines; add `shipCooldown: { category: 'ship', rarity: 'common', copies: 4, effects: [stat('cooldownScale', { add: -0.1 })] }`; update the "42 card lines" header comment to 36 -- the additive `add` is what produces exactly 0.6 at 4 stacks.
- [ ] `shared/src/constants.ts` -- gun `reloadMs` 3000→5000, cannon `reloadMs` 15000→50000, with comments recording the Eric ruling 2026-08-04 and the max-CDR landing points (3.0s / 30s) -- CONFIG is the single source of truth.
- [ ] `shared/src/index.ts` -- `PROTOCOL_VERSION` 19 → 20 -- catalog content is wire contract.
- [ ] `client/src/ui/boonCopy.ts` -- drop the 7 ladders + 7 stat lines; add a 4-rung `shipCooldown` ladder and a `STAT_LINES` row reading `s.cooldownScale` rendered as a percentage of base cooldown -- `boonDescription` must stay TOTAL over `BOON_CATALOG`.
- [ ] `shared/src/__tests__/{boons,deck,stats}.test.ts` -- update SCARCITY rows, catalog length 42→36, the full deck-size matrix, the zero-boons identity literal, and rewrite the reload-fold assertions against `shipCooldown` -- these are the pins that encode the catalog's shape.
- [ ] `client/src/__tests__/*` + `server/src/__tests__/upgrades.test.ts` -- swap doomed placeholder ids, drop `>= 42` to `>= 36`, rewrite the per-weapon reload-fold tests as global-scale tests -- coverage must prove ONE card moves ALL seven cooldowns.
- [ ] `server/src/__tests__/goldenFrames.test.ts` (+ snapshot) -- swap the explicit `gunReload`, regenerate the snapshot, and eyeball the diff for anything beyond offer-id/reload drift -- RNG-derived offers shift whenever catalog contents change.
- [ ] Add tests covering the I/O matrix rows (zero-boons identity, 1 stack, 4 stacks across all 7 equipment, over-stack floor, fail-closed unknown id) -- the matrix is the contract.
- [ ] `VERSION` 0.17.41, `CLAUDE.md` gun-reload + PROTOCOL_VERSION lines, `_bmad-output/gds-workflow-status.yaml` (`last_updated` + `next_expected`), and a `deferred-work.md` entry for the thinned `speedBoost`/`decoyBuoy` subdecks -- every landed cycle advances these.

**Acceptance Criteria:**
- Given a Battleship with 4 `shipCooldown` stacks, when `effectiveStats` resolves, then `cannon.reloadMs === 30000` and `gun.reloadMs === 3000` exactly (not 32805/3280 — proving additive, not multiplicative, stacking).
- Given any hull with zero boons, when `effectiveStats` resolves, then every `<eq>.reloadMs` is reference-exact to its `CONFIG` base — the scale is a true no-op at 1.0.
- Given a deck built for any of the three hulls, when `buildDeck` runs, then no deleted reload id appears anywhere in it and the `ship` category contributes 14 cards.
- Given a client that receives an offer or ship-boon list containing a deleted id, when it resolves, then the id is silently dropped and no stat moves and nothing throws.
- Given the full suite, when `npm run check` runs, then lint (complexity ≤ 10), all three type-checks, and every test pass with the catalog at 36 lines.

## Design Notes

**Why a scale stat rather than 7 mult effects:** one card writing 7 stat paths would stack multiplicatively (0.9⁴ = 0.6561 → 3.28s), missing Eric's 3.0s target. A single `cooldownScale` scalar taking `add: -0.1` accumulates linearly inside the existing fold with no new effect kind, then applies once post-fold.

```ts
// shared/src/sim/stats.ts — clampStats(), beside the rangeU re-derivations
const cd = Math.max(0.1, stats.cooldownScale); // floor: never ≤ 0 (applyStatEffect's own gate is per-effect)
stats.cooldownScale = cd;
stats.gun.reloadMs *= cd;        stats.cannon.reloadMs *= cd;
stats.torpedo.reloadMs *= cd;    stats.mine.reloadMs *= cd;
stats.starShells.reloadMs *= cd; stats.boost.reloadMs *= cd;
stats.decoyBuoy.reloadMs *= cd;
```

**Deck-size matrix after the change** (`deck.test.ts`): guns 13→8, cannon 17→12, torpedoes 17→12, mines 27→22, speedBoost 10→5, starShells 17→12, decoyBuoy 10→5, ship 10→14, intel 15 unchanged. Catalog 42→36 lines.

**Ladder naming** must follow `boonCopy.ts`'s style law (ALL-CAPS, no comparatives, naval flavour, `copies` distinct rungs). A crew-proficiency ladder fits the `ship` category beside HULL SCRAPING / REINFORCED HULL, e.g. `DRILL SCHEDULE → PRACTICED CREWS → VETERAN RATINGS → BATTLE STATIONS`.

**Balance consequence to record, not to fix:** every non-gun/cannon weapon loses its dedicated ×0.9⁵ (0.59) reload path and can now only reach 0.6 via the shared line — so max-build torpedo/mine/star/boost/decoy cadence is essentially unchanged while the *opportunity cost* moves to the universal deck. That is the intended effect of the change.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity ≥ 10 errors.
- `npm test -w shared` -- expected: all pass, including the new additive-stacking and zero-boons-identity pins.
- `npm test -w server` -- expected: all pass with a regenerated goldenFrames snapshot.
- `npm test -w client` -- expected: all pass, catalog-size guards at 36.
- `npm run check` -- expected: lint + all three type-checks + full suite green.
- `npm run build` -- expected: shared → client → server all build.
