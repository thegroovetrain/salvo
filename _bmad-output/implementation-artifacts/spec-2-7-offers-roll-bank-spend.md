---
title: 'Story 2.7: Offers — Roll, Bank, Spend'
type: 'feature'
created: '2026-07-30'
status: 'in-progress'
baseline_revision: '6b2822c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The economy earns in the new shape (2.6: levels bank through `grantPoint`) but offers are still the legacy interregnum: 3 upgrade-ids per offer (`rollOffer`, offers.ts:49), spend routes through `applyUpgrade` with a hardcoded `choice > 2` bound (world.ts:807), the wire carries upgrade indices (`OwnShip.offer: number[]`), and the refit window is a 420px top-center text column — while the 2.5 boon engine (`World.applyBoon`, `you.boons`, `slotsWithBoons`) sits dormant with an empty catalog.

**Approach:** Re-shape the OFFER side onto the boon economy inside the unchanged `grantPoint` seam (amendment 35): a dummy production `BOON_CATALOG` (implementer-drafted, stat-only, draft-copy; dies in 2.8), a catalog-parameterized `rollBoonOffer` producing 4 boon ids from 4 distinct categories on the same decorrelated `upgradeRng`, spend flowing through `applyBoon` + a new self-private `bn` event, `offer` re-typed to boon-id strings (PV 14→15), and the refit window rebuilt as the ratified four-216px-card below-center band with queue pips, ghost edge, stay-open-through-queue (amendment 36), and the in-flight latch/denied-pulse register. Dead captains stop receiving the level-up toast (amendment 37, closes the routed deferred entry).

## Boundaries & Constraints

**Always:**

- **TAB toggle, never SPACE (Eric, this invocation + amendment 1).** Every stale SPACE-hold clause in epics.md 2.7 AC / FR23 / UX-DR14 / EXPERIENCE.md is superseded: TAB opens/closes, ESC closes topmost (amendment 23), picks are digits 1–4 or card clicks (amendment 2's non-superseded clauses: click-picks never fire the gun), full combat lockout while open with live helm (amendment 6).
- **Dummy catalog (amendment 35):** `BOON_CATALOG` gains ≥8 implementer-drafted entries across ≥5 distinct categories (≥2 per category so distinct-category picks vary), **stat effects only** on whitelisted `BOON_STAT_PATHS` (`HOOK_REGISTRY` stays empty — amendments 29/30 intact; no slotFill/slotReplace/behavior in the dummy set), camelCase ids, deep-frozen. Names/descriptions/values are draft placeholder copy (amendment 13 rule) living **client-side** (label/description maps mirroring `upgradeLabel` — `BoonDef` stays pure sim, no presentation fields).
- **Roll (FR19):** `rollBoonOffer(rng, catalog)` in offers.ts — 4 ids from 4 distinct categories via the existing partial-Fisher-Yates-prefix pattern; category order derived deterministically from catalog iteration; offer size = new `CONFIG.offer.size` (4); rolls `min(size, categoryCount)` (fail-safe, never throws in sim); still consumed at earn-time on `upgradeRng` inside unchanged `grantPoint` — reopening never rerolls, banked offers never expire, `pts === offers.length` invariant intact.
- **Spend (FR23):** `spendPoint` validates `choice` as an integer in `[0, front.length)` (fail-closed on non-number/non-integer/out-of-range as today), shifts the FRONT offer, calls `applyBoon(ship, front[choice])`, and queues a new self-private `{k:'bn', id, boon}` event **from spendPoint** (the `applyBoon`-queues-no-event pin stands). Spend-while-dead stays legal (ratified 2.6). `applyUpgrade`/`applyGrantEffects`/`upg` event remain in code, production-unreachable, with a dies-in-2.8 comment.
- **Wire (PV 14→15, index.ts changelog):** `OwnShip.offer: string[]` (front offer boon ids, `[]` at pts 0, defensive copy in frames.ts); `bn` added to the event union + perception self-private kinds (like `upg`/`pt`) with invariant suites extended; catalog content documented as wire contract. Everything stays self-private on `you` — nothing new on contacts/blips/spectator/results/roster.
- **Refit band (UX-DR14 geometry, TAB semantics):** DOM rework of `ui/upgradeMenu.ts` in place — four 216px cards, 20px gaps (924px row), horizontally centered, top edge at a below-center band (~58% viewport height keep-out proxy for the future listening ring; own hull at center stays clear), never wraps, no shared panel/backdrop dim, square corners, z 1000, `--hc-ui-scale` preserved, preventDefault-mousedown + blur-on-click convention preserved. Card anatomy top-down: 22×22 outlined key chip overhanging top-left, category tag (mono 14px — amendment 15 lift of the stale 9px), boon name (20px/600 white), description (mono 17px — lift of 11.5px), phosphor-not-grey (amendment 16). Armed (hover): amber outline/glow + amber chip/category/name. Geometry/type/pulse tokens in a new `CLIENT_CONFIG.refit` block.
- **Queue chrome:** header pips (8px squares — filled = on-screen offer, hollow = each queued) + dashed ghost edge behind the row when `pts > 1`.
- **Stay-open state machine (amendment 36):** pick → latch (`trySpend` unchanged single entry), cards dim, no hide-on-pick; latch release classified by a new pure helper (e.g. `spendOutcome(latch, you, nowMs)`) — success (pts dropped / front changed): next queued offer renders in place, window stays open, pts→0 auto-closes (the existing `update(null)` force-hide path); failure (timeout, nothing moved): 80ms denied edge pulse on the picked card (denied register, motion-scaled, 300ms same-source floor), unlock, stay open. `spendLatchReleased` semantics extend, never regress (hold-through-passive-bank etc. stay pinned).
- **Toast (amendment 37):** the `pt` level-up toast is fully suppressed while the local captain is dead/spectating; `bn` drives the fitted toast (existing upgrade-toast surface, boon label, self-events-only per UX-DR23) + existing tone; xpRail re-arm on TAB open, hotbar 38% dim, digit-4 keyboard plumbing all stay as already wired.
- Cross-cutting: complexity ≤ 10; shared pure; World/Match zero Colyseus imports; seeded RNG only; every reworked test pin changed deliberately (none deleted silently); `npm run check` green; no VERSION bump.

**Block If:**
- The dummy catalog would need non-stat effects (slot/behavior) or a hook registration to satisfy any AC — that contradicts amendments 29/30/35 and needs Eric.
- Offer/boon state would need to leave `you` (contacts, blips, spectator, results, roster) — information discipline.
- Any new mechanic beyond the recorded rulings surfaces (offer expiry, reroll, bank caps, spectate spend surface) — design questions for Eric.

**Never:**
- No real catalog content, no legacy-upgrade strip, no off-class weighting, no boon audio/visual identity pass (2.8/2.9 own those). No `results`-modal offer review (UX-DR27 later). No hotbar tooltip accrued-boon list (2.9). No listening-ring render. No design-doc edits (doc-sync is gated separately). No prediction of spend on the client (server-authoritative; client renders `you` verbatim).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bank rolls 4 | level banks | offer = 4 boon ids, 4 distinct categories, from `upgradeRng` | — |
| Reopen | TAB close + reopen across frames | identical front offer (never rerolls) | — |
| Valid spend | choice 0..3, pts ≥ 1 | front shifted, `applyBoon` applied, stats recomputed, `bn` self-private, `pts`/`offer` advance | — |
| Invalid spend | choice 4 / -1 / 2.5 / NaN / '2' / pts 0 | no state change | Silent reject (fail-closed) |
| Queue advance | pts 3, successful spend | window stays open, next offer renders, pips 3→2 | — |
| Last spend | pts 1, successful spend | window closes (offerView null path) | — |
| Reject/timeout | spend in flight, 1.5s no ack | denied pulse on picked card, level stays banked, window open, cards re-enabled | — |
| Passive bank mid-flight | bank lands while latch held | latch HOLDS (2.6 pin), pips grow | — |
| Dead captain banks | posthumous kill credit | level banks server-side; NO toast; no refit surface while spectating | — |
| Small catalog (tests) | injected catalog, 2 categories | offer of 2 (min(size, cats)), distinct categories | Fail-safe |
| Unknown offer id (client) | `you.offer` id not in catalog | whole view drops (fail-closed, row k == server slot k) | — |
| Privacy | enemy/spectator frames | `offer`/`bn` never leave `you`; invariant suites green at PV 15 | — |

</intent-contract>

## Code Map

- `shared/src/sim/boons.ts` -- dummy BOON_CATALOG entries (stat-only, ≥5 categories); wire-contract comment stands
- `shared/src/sim/offers.ts` -- REWORK: `rollBoonOffer(rng, catalog)` + `BoonOffer`; legacy `rollOffer`/`UpgradeOffer`/`OFFERABLE`/`OFFER_EXCLUDED_IDS`/`offerableIds`/`categoryOf` deleted (verify no survivors need them; UPGRADE_IDS/UPGRADE_CATEGORIES stay for wire/effectiveStats)
- `shared/src/constants.ts` -- new `CONFIG.offer` block (`size: 4`)
- `shared/src/types.ts` -- `OwnShip.offer: string[]`; `BoonFitEvent {k:'bn'; id; boon}` in the union; SpendMsg comment 0..3
- `shared/src/index.ts` -- PV 14→15 + changelog line; barrel export updates
- `server/src/game/world.ts` -- `ShipRecord.offers: BoonOffer[]`; grantPoint → rollBoonOffer(upgradeRng, boonCatalog); spendPoint dynamic bound + applyBoon + `bn` event; applyUpgrade marked production-unreachable (dies 2.8)
- `server/src/game/frames.ts` -- `offer` as string-id copy
- `server/src/game/perception.ts` -- `bn` in self-private event kinds
- `client/src/ui/upgradeMenu.ts` -- REWORK: band layout (`refitBandLayout` pure fn), 4-card DOM, pips/ghost edge, armed/locked/denied states, `offerView` resolving string ids against BOON_CATALOG, `spendLatchReleased` extended + `spendOutcome` pure helper, boon label/description draft-copy maps
- `client/src/main.ts` -- no hide-on-pick (handleRefitPick :475-481, onSpendClick :1124-1132); outcome-driven denied pulse feed; stale digit-4 comment (:472) fixed
- `client/src/config.ts` -- new `CLIENT_CONFIG.refit` block (card 216, gap 20, bandTopFrac, pip 8, type sizes, dim/denied tokens)
- `client/src/net/roomBindings.ts` + `client/src/ui/upgradeToast.ts` -- `pt` toast dead-gated (amendment 37); `bn` → fitted toast with boon label
- Tests: shared `offers.test.ts` rewrite (4/distinct/determinism/coverage/min-size), `boons.test.ts` catalog pins flip (empty → dummy-shape: categories ≥5, stat-only, whitelisted paths, frozen, resolvable), `hooks.test.ts` UNCHANGED (registry stays empty), `barrel.test.ts`/`constants.test.ts` (exports, CONFIG.offer, PV 15); server `upgrades.test.ts` rework (FIFO/reroll-proof/determinism on boon offers; validation table incl. choice-4-now-valid flip; bn emission; dead-spend; lifecycle), `boons.test.ts` applyBoon pins stand, `xp.test.ts` offer expectations, `frames.test.ts` + `goldenFrames.test.ts` (offer shape + bn row, regen audited), `perception.test.ts`/`spectator.test.ts` (bn self-private); client `upgradeMenu.test.ts` rewrite (band layout guards vs `vitalsLayout`/hotbar at 1366×768 + 1280×614, 4 cards, chips 1–4, stay-open machine, outcome classification, latch pins extended), `upgrades.test.ts` fixtures to string ids, toast dead-gate test, `keyboard/hotbar/xpRail` pins stay green
- Bookkeeping: `sprint-status.yaml` (2-7 → done at end), `gds-workflow-status.yaml` (next_expected → 2-8 design gate + last_updated), `deferred-work.md` (close the dead-killer entry via amendment 37), amendments 35–37 (already recorded)

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/boons.ts` + `offers.ts` + `constants.ts` + `types.ts` + `index.ts` -- dummy catalog, rollBoonOffer, CONFIG.offer, wire re-type, bn event, PV 15 -- amendment 35 + FR19
- [x] `server/src/game/world.ts` + `frames.ts` + `perception.ts` -- boon offers through grantPoint, spendPoint → applyBoon + bn, string-id frames, self-private bn -- FR23 + information discipline
- [x] `client/src/ui/upgradeMenu.ts` + `config.ts` + `main.ts` -- band rework, pips/ghost, stay-open machine + outcome helper, no hide-on-pick -- UX-DR14 geometry + amendments 36/1/6
- [x] `client/src/net/roomBindings.ts` + `ui/upgradeToast.ts` -- pt toast dead-gate, bn fitted toast -- amendment 37 + UX-DR23
- [x] All test suites per Code Map incl. full I/O matrix -- pins reworked deliberately, none deleted silently
- [ ] Bookkeeping files -- per-PR protocol
- [x] `npm run check` -- full gate green (baseline 1894, target higher)

**Acceptance Criteria:**
- Given a level banking, when the offer is rolled, then it carries 4 boons from 4 distinct dummy-catalog categories on the decorrelated stream; reopening never rerolls; banked offers never expire.
- Given the refit window open with pts ≥ 2, when a pick succeeds, then the next queued offer renders in the open window with pips decremented; when the LAST level is spent, the window closes; when a spend times out, the picked card fires the denied pulse and the level stays banked.
- Given TAB/digit/click interaction, then TAB toggles, ESC closes topmost, digits 1–4 pick (digit 4 live), card clicks pick without firing the gun, hotbar dims 38%, helm stays live — no SPACE binding anywhere.
- Given a dead/spectating captain whose posthumous kill banks a level, then no level-up toast fires and no refit surface opens; the level still banks server-side.
- Given any frame to any observer, then `offer`/`bn` ride `you` exclusively (perception + spectator + goldenFrames green at PV 15).
- Given `npm run check`, then lint, type-checks, and all workspace tests pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- `grantPoint` stays the one bank primitive — 2.7 swaps only what `rollOffer` returns and what spend applies (the seam 2.6 deliberately preserved). `upgradeRng` keeps its name/stream (it is the offer stream; draws-per-offer changes, so seeded-offer test expectations move — spawn/drone streams unaffected by decorrelation).
- Boon presentation lives client-side (label/desc maps, draft copy) because `BoonDef` is pure sim and catalog content is wire contract — adding display fields would couple copy edits to PV bumps.
- Stay-open emerges cheaply: `update(view)` already force-hides on null (pts 0) and never opens a closed window; removing hide-on-pick plus outcome classification is the whole delta. The latch's hold-through-passive-bank (2.6's medium patch) is load-bearing — extend `spendLatchReleased`, never regress it.
- The 924px row fits every ratified viewport: 1366×768 at 100% and the 1280×614 logical floor at the (≥1600px-gated) 125% tier — pin it with `refitBandLayout` tests against `vitalsLayout`/hotbar boxes instead of trusting CSS.
- The band's ~58% top is a keep-out proxy: the listening ring doesn't exist yet (Epic 4/6); the honest constraint today is "own hull at screen center stays clear" — comment it as the ring's future contract.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all workspace tests green (baseline 1894, target higher with reworked suites)
- `npm test -w shared` -- expected: rollBoonOffer suite + dummy-catalog pins + PV 15 pass
- `npm test -w server` -- expected: boon-offer earn/spend rework + bn privacy + regenerated goldenFrames pass
- `npm test -w client` -- expected: band layout guards + stay-open machine + toast dead-gate pass
