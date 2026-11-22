---
title: 'Weapon upgrade card hover box shows every stat the fold actually moves (DAMAGE included)'
type: 'bugfix'
created: '2026-11-22'
baseline_revision: 'b6508f39'
status: 'in-progress'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Hovering a weapon tier card (e.g. SUPERCAVITATING TORPEDO II → III) opens the weapon's box beside the HUD bar with RELOAD and RUN changes but no DAMAGE change, yet picking it raises the shown damage. The box prints `OfferCard.rows` (`cardStatRows`), which lists only the catalog's AUTHORED tier steps plus a reload row; since the 2026-11-15 weapon-power experiment no tier authors damage (damage climbs via `weaponPowerFor(tier)`), so it can never appear. Eric: show the stats that actually change, not a fixed list (epic-12 amendment 13(b): "derived from the stat fold, never from the card's category").

**Approach:** Build a weapon-row card's box from a real fold diff, the way ship-stat cards' boxes already are: the hovered row's whole printed stat table (console register, power-aware DAMAGE via `statReadout`) folded without and with the card, printing every line whose value changes, then any card-face row whose label the table did not print (the add-on mount counts).

## Boundaries & Constraints

**Always:** Values come from the shared `effectiveStats` fold through the existing readout printers (`statRowFields` + `statReadout`), never re-derived. Keep the existing amber `old → new ▲/▼` grammar (`changeText`). Pure functions in `render/console/` (no DOM/Pixi); `main.ts` only wires. ESLint complexity ≤ 10. Memoize per (line, fold) like `hoverMarksNow` — a held hover allocates nothing per frame.

**Block If:** None expected — the ruling exists (amendment 13). If a fix would require changing the card face, the catalog, `CONFIG`, or any shared sim/wire contract, HALT.

**Never:** No hard-coded "also show DAMAGE" list. No change to ship-stat card boxes, ability-tile card boxes, the card face, `cardStatRows`, `shared/`, or `PROTOCOL_VERSION`. No new player-facing words (labels are the stat tables' existing words). No tests pinning label strings or CONFIG numbers (project-context testing rules).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tier card | supercav fitted at I, hover supercav card | box lists DAMAGE `a → b ▲` (b = picked-fold shown damage), RELOAD, RUN; unchanged lines (SPEED) absent; exactly one RELOAD line | — |
| Fit card | torpedo row empty, hover a torpedo fit card | box lists the new weapon's whole table, each `value ▲` (no old) | — |
| Swap | row's fitted weapon id differs between folds | whole new table printed; `old → new` where the before row printed the same field, else `new ▲` | — |
| Add-on | one-off adding a tube/launcher/rack | no table line changes → the card face's mount row (`TUBES 1 → 2`) still prints | — |
| Nothing moves | fold diff empty and face rows empty | no box (null), as today | — |
| Unknown class / refused card | `shipFold` null or marks null | no box | fail-open null, never throws |

</intent-contract>

## Code Map

- `client/src/render/console/readouts.ts` -- `statRowFields`, `statReadout`, `shipFold`, `slotsWithCards` loadout, `rowEquipment`; add the pure per-row full-table reader.
- `client/src/render/console/flyout.ts` -- `cardFlyout`, `rowChangeFlyout`, `changeText`; add the pure weapon-card box builder.
- `client/src/main.ts` (~3536–3640) -- `hoverMarksNow` (memo), `flyoutNow` / `cardFlyoutAt` currently pass `card.rows` for a `row` target; wire the new builder for `row` targets only.
- `client/src/__tests__/hudFlyout.test.ts` -- existing flyout tests; extend.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/console/readouts.ts` -- export a pure `rowTableReadouts(you: ReadoutShip, kind: WeaponRowKind, extraLine?: string): { id: EquipmentId | null; readouts: Readout[] } | null` returning the row's fitted id and one `statReadout` per `statRowFields(id, stats)` field (secondaries: `secondariesReadouts`); null on unknown class -- the full printed table in the box's own register, power-aware.
- [x] `client/src/render/console/flyout.ts` -- export a pure `rowCardFlyout(name, before, after, faceRows): FlyoutModel | null`: lines = each `after` readout whose value differs from the same key in `before` (all lines when the ids differ), as `changeText({cur: before value | null, next})`; then each `faceRows` row whose label is not already a line; null when no lines -- one data-driven builder.
- [x] `client/src/main.ts` -- for a `row` preview target, build the box with `rowCardFlyout` from `rowTableReadouts` without/with `g.hoverLine` (memoized in `consoleCache` on line + fold + window), passing `card.rows` as `faceRows`; ability targets unchanged -- the fix point.
- [x] `client/src/__tests__/hudFlyout.test.ts` (or a new `client/src/__tests__/weaponCardFlyout.test.ts`) -- unit-test every I/O matrix row, using real folds (`effectiveStats` via `rowTableReadouts`) and comparing against `shownWeaponDamage` of the picked fold, never literals -- contracts, not numbers.

**Acceptance Criteria:**
- Given any equipment tier card whose pick changes the row's shown damage, when hovered, then its box contains a DAMAGE line whose new value equals the row's damage readout after picking.
- Given any hovered weapon card, when the box opens, then every line it prints moves between the two folds and no printed table line that moves is missing.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test -w client` -- expected: all pass
- `npm run lint` -- expected: no errors (complexity ≤ 10)
- `npm run check` -- expected: passes once at the end (gate)
