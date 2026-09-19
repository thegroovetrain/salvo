---
title: 'Story 8.12: Catalog v3 — Ladders and the Deck Gun'
type: 'feature'
created: '2026-09-18'
status: 'in-review'
review_loop_iteration: 0
baseline_revision: 'c78b0b5'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Story 8.1 already authored the five universal ladders (ARMOR, SPEED, TURNING, RADAR SWEEP, RELOAD) and the deck-gun family (DECK GUN, TURRET, BARREL) at catalog-v3's numbers, with the reload composition, heal-on-grant, in-flight rescale and catalog-driven card rows all live and test-pinned (amendment 5; `spec-8-1:33`). Verified against the code 2026-09-18: every numeric AC clause of 8.12 is satisfied. What is NOT satisfied: (a) the client tier-step helper has no cap clamp, so an at-cap base-tier line would print `V → VI` (unreachable in play, untested) against the AC's "no ladder reaches VI"; (b) the HUD bar's gun square and slot tooltip print NO tier for the deck gun while the refit card says it starts at Tier I (`I → II`) — the two surfaces disagree; (c) two ledger threads (`Turning`/`Gun damage` labels, the cooldown-scale floor literal) needed Eric's word.

**Approach:** A verify-and-pin cycle. Fix (a) with a clamp and pins at cap; fix (b) by reading the deck gun's tier from the SAME number the server folds (`stats.equipment.gun.tier` = 1 + DECK GUN copies) on the square and in the tooltip; record Eric's three rulings plus the correction of record (amendments 70–73) and the reading of every AC clause against its existing pin; NO catalog number, stub flag or wire shape moves, so `PROTOCOL_VERSION` stays 55 with a recorded NO-BUMP entry (the 8.11 precedent).

## Boundaries & Constraints

**Always:**
- `CONFIG` and `CATALOG` are the single sources; the deck gun's HUD tier comes from `effectiveStats` (`equipment.gun.tier`), never a second copy of the "1 + copies" rule.
- The five-rung ramp is absolute: the gun square's numeral clamps to V; nothing ever renders a sixth rung (UX-DR51).
- Eric's rulings this cycle: (70) the gun square and its tooltip SHOW the deck gun's tier; (71) `Turning` and `Gun damage` are ratified row labels; (72) the `cooldownScale` floor literal STAYS 0.1 as a malformed-data guard — 0.75 is the reachable floor by construction; no code moves.
- `npm run check` green; complexity ≤ 10; no in-game copy beyond what ruling 71 ratifies.

**Block If:**
- Any AC clause turns out NOT to be satisfied by existing code beyond (a) and (b) above — HALT and surface it rather than re-author a line.
- Making the gun tier visible would require a new wire field (it must not: `cards` already rides and the client folds).

**Never:**
- Re-author any of the eight lines, change a number, flip a stub flag, touch the barrel spacing (AC: "kept as shipped, Eric 2026-09-11" — this closes ledger `:1455` as ruled), touch the results screen (8.19) or How-to-Play (8.20), or add a glyph for ladders (icon pass UX-DR50, ledger `:2176` stays open).
- Bump `PROTOCOL_VERSION` (no wire or catalog-content change).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gun square at spawn | `cards = []` | gun slot `tier` = 1, numeral `I` in tier-I colour | none |
| Gun square at cap | four `deckGun` copies | `tier` = 5, numeral `V` (amber) | none |
| Gun square over-stack | nine `deckGun` copies (rogue) | `tier` clamps to 5 | fail-closed clamp |
| Gun tooltip | any `deckGun` count n | header carries ` · TIER <roman(n+1)>` | none |
| Weapon slot tooltip/square | `heavyTorpedo` ×2 | unchanged: tier 2 (line-keyed) | none |
| Card step at cap, base-tier line | `cardTierSteps(CATALOG.armor, 4)` | `{cur: 5, next: null}` → label `V` | clamp, never VI |
| Card step at cap, other ladder | `cardTierSteps(CATALOG.radarSweep, 5)` | `{cur: 5, next: null}` → `V` | clamp |
| Card step below cap | `cardTierSteps(CATALOG.armor, 2)` | `{cur: 3, next: 4}` (byte-identical to today) | none |

</intent-contract>

## Code Map

- `client/src/ui/boonCopy.ts:471-493` -- `BASE_TIER_LINES`, `cardTierSteps`: add the ceiling clamp (ceiling = `line.cap` + 1 for a base-tier line, `line.cap` otherwise; `next` null when `cur` reaches it)
- `client/src/__tests__/boonCopy.test.ts:290-330` -- add at-cap pins for the four base-tier lines and one non-base ladder; assert no label ever contains `VI`
- `client/src/render/equipmentInfo.ts:153-161, 252-269` -- `tierSuffix` and a new `slotTier(stats, cards, id)`: the gun reads `stats.equipment.gun.tier` clamped to `TIER_WORDS.length`; every other id keeps `lineTier(cards, lineForEquipment(id))`; rewrite the "honest rather than a fabricated tier I" comments (the base-tier ruling makes tier I the truth)
- `client/src/render/hotbar.ts:374` -- `tier: belt ? 0 : slotTier(view.stats, view.cards ?? [], id)`
- `client/src/__tests__/hotbar.test.ts:950-966` -- gun-square pins (spawn I, cap V, rogue clamp); tooltip header pin for the gun (` · TIER I` at spawn, ` · TIER III` at two copies) in whichever test covers `tierSuffix`
- `shared/src/index.ts:5-20` -- prepend a `55 — UNCHANGED by Story 8.12` header entry in the 8.11 style (why: no number, stub, shape or event changed)
- `shared/src/__tests__/stats.test.ts` (read-only) -- the AC pins already live here: RELOAD table `:245-255`, floor guard `:282-287`, DECK GUN `[15,16,17,18,20]` `:294-300`, composition 60 % `:325-360`; `server/src/__tests__/upgrades.test.ts:1594` (tier grant rescales the in-flight timer), `:1033-1061` (ARMOR heals the delta); `client/src/__tests__/cardStatRows.test.ts:48-57` (rows from the catalog). Cite in the spec's Verification; do not duplicate
- `_bmad-output/implementation-artifacts/epic-8-context-amendments.md` + `epic-8-context.md` (Ratified Amendments) -- amendments 70–73 (done at plan time) + any measured correction at the gate
- `_bmad-output/implementation-artifacts/deferred-work.md` -- `:1992` labels → RESOLVED (amendment 71); `:1455` barrel spacing → RESOLVED-AS-RULED (AC's "kept as shipped, Eric 2026-09-11"); new 8.12 section: AC cites `:463` but the rescale entry sits at `:471`; the 8.12 AC was pre-satisfied by 8.1 (so 8.13–8.16 readers know the ladders need no re-authoring); the gun tier is folded, not wired
- `VERSION`, root `package.json` (+ lock) -- 0.18.12 (cycle 147); `CHANGELOG.md` -- `## [0.18.12] - 2026-09-18`; `_bmad-output/gds-workflow-status.yaml` + `_bmad-output/implementation-artifacts/sprint-status.yaml` -- one-line stamps, `8-12-…: done`

## Tasks & Acceptance

**Execution:**
- [x] amendments 70–73 → both homes -- plan time
- [x] `client/` (boonCopy clamp + pins, slotTier + hotbar + pins) -- `npm test -w client`; `npx tsc -p client --noEmit`
- [x] `shared/src/index.ts` NO-BUMP header entry -- `npm run build -w shared`
- [x] docs + version + changelog + trackers + ledger
- [x] `npm run check` green

**Acceptance Criteria:**
- Given a fresh hull, when the HUD bar renders, then the gun square shows `I` and its tooltip header carries ` · TIER I`; after k DECK GUN cards both read tier k+1, clamped to V.
- Given any ladder at its cap, when a card label is computed, then it never contains `VI`, and every below-cap label is byte-identical to before this story.
- Given the eight lines, when the pins named in the Code Map run, then every numeric AC clause (caps, steps, floor by construction, composition 60 %, heal on grant, tier-grant rescale, catalog-driven rows) passes unchanged.
- Given `npm run check`, then lint, tsc ×3 and every test pass; `PROTOCOL_VERSION` is 55 with the NO-BUMP entry recorded.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why 8.12 is small:** 8.1 authored these lines for real because they REPLACE shipped v2 lines (amendment 5); the epic's content stories 8.13–8.16 fill equipment tiers II–V, which 8.1 stubbed. Re-authoring here would be churn against pinned numbers.
- **Why the gun tier reads the fold:** `boons.ts:124` sets `equipment[target].tier = 1 + copies` for a ladder — the server's own truth for the reload step. Reading it on the client keeps one rule; a `deckGun`-keyed `lineTier` lookup would be a second copy of the base-tier idea.
- **Why the floor stays 0.1 (amendment 72):** the guard protects plumbing, not balance; raising it to 0.75 would make a safety stop double as a design ceiling that silently clamps any future ladder change.

## Verification

**Commands:**
- `npm test -w client` -- green; new boonCopy at-cap pins, hotbar gun-tier pins
- `npm run build -w shared && npm test -w shared && npm test -w server` -- green, byte-identical counts + 0 (no shared/server code change)
- `npm run lint`; `npm run check` -- exit 0

**Manual checks (if no CLI):**
- Eric on staging: the gun square shows `I` at spawn and climbs with DECK GUN cards; a DECK GUN card reads `I → II`.
