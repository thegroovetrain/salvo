---
title: 'The deck stops hoarding: lazy front-offer draw'
type: 'bugfix'
created: '2026-08-14'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Cards leave the deck at DRAW time (level-up) but only return at SPEND time, so every banked unspent level holds 4 cards hostage. At `levelMs: 60000` levels arrive whether or not the player presses TAB, so a Torpedo Boat's 59-card deck empties by ~L15 when banked: offers go SHORT (3 cards, then 1, then zero-card levels that bank nothing), and a card the player passed on is physically trapped inside its banked offer until that exact level is spent. Eric reproduced both symptoms in playtest; a replay against the shipped engine confirms both.

**Approach:** Eric's ruling — *"do not generate the level's choices until its time to choose it."* Only the FRONT offer (the one the player is about to pick from) is ever materialized; levels behind it are a bare count. A level's cards therefore leave the deck at most one offer at a time, and only the CHOSEN card is consumed. No line can ever sit in two offers, so the `copies` cap stays exact with no scrub and no reroll.

## Boundaries & Constraints

**Always:** `copies` stays the exact stack cap (`boons.ts:22`) — exactly one card leaves the deck per fitted upgrade, never more. FR19 holds: once the front offer is materialized it is stored server-side and FROZEN until spent, so closing/reopening the refit band can never reroll it. `pts` stays the single source of truth for banked levels and stays self-private (`you` only). Deck state stays SERVER-PRIVATE. `world.ts`/`match.ts` keep zero Colyseus imports; `shared/` stays pure. Drones keep `EMPTY_DECK` and never draw. Complexity ≤ 10.

**Block If:** the fix cannot preserve the exact `copies` cap; or the wire shape of `OwnShip.pts`/`OwnShip.offer` would have to change (that is a PROTOCOL_VERSION break and needs Eric).

**Never:** do not change card content, weights, `CONFIG.deck` pity escalation, `CONFIG.offer.size`, rarity, or any balance tunable. Do not touch the DAMAGE CONTROL rail's own rules (`CONFIG.damageControl`). Do not add a client→server "refit window opened" message — front-only materialization is deliberately chosen so no wire change is needed. Do not pick up the other items in HULLCRACKER_NOTES.md (R-slot → radar slot, generic speed boost, buoy rework) — separate work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bank without spending | 15 levels earned, TAB never pressed | `pts` 15; deck loses NOTHING; front offer is 4 cards | No error expected |
| Passed-on card returns | Offer holds `shipCooldown`, player picks another card | `shipCooldown` still at full copies in the deck and drawable by the very next level | No error expected |
| Spend consumes exactly one | 4-card offer, player picks slot 2 | Deck loses 1 card (the pick); other 3 were never removed | No error expected |
| Next offer materializes | Player spends with `pts` 3 | `pts` → 2 and a fresh 4-card front offer in the same frame, drawn from the deck INCLUDING the 3 just passed on | No error expected |
| DAMAGE CONTROL heal | `pts` 1, hp below max, heal chosen | One level consumed, front offer discarded, deck completely untouched | Dead/full-hp hull: reject, queue + pool untouched |
| Acquisition pick | Player fits an acquisition card | Subdeck joins pool, remaining acquisition cards purge, next offer drawn from the CLEANED deck | No stale acquisition can survive: no other offer exists to scrub |
| Match boundary | `redeployShip` | Banked count zeroed, materialized offer dropped, deck rebuilt fresh | No error expected |
| Degenerate empty draw | Deck somehow yields zero drawable lines | No offer materialized, no `pt` emitted, band stays shut, card picks refused | Never throws; queue stays spendable |

</intent-contract>

## Code Map

- `server/src/game/world.ts` -- `ShipRecord.offers` (:371-379), `grantPoint` (:1428), `spendPoint` (:1590), `spendHeal` (:1630), `settleSpend` (:1647), `consumeAcquisitionPick` (:1684), `redeployShip` (:1160). The whole change lives here.
- `server/src/game/frames.ts` -- `:64-65` `pts`/`offer` projection; must read the new fields, wire shape unchanged.
- `shared/src/sim/deck.ts` -- `drawOffer` becomes NON-CONSUMING (picks ids, leaves the cards in the pool, still advances `levelsSinceRare`); a new `consumeCard(deck, id)` removes the single fitted copy; `returnCards` survives for the doctrine swap-out ONLY; `scrubAcquisitions` becomes structurally unreachable (no second offer can exist to scrub).
- `shared/src/index.ts` -- barrel: export `consumeCard`, retire `scrubAcquisitions`.
- `server/src/__tests__/upgrades.test.ts`, `boons.test.ts`, `xp.test.ts`, `frames.test.ts`, `goldenFrames.test.ts` -- pin `pts === offers.length` and earn-time draw; must move to the new model.
- `client/src/ui/upgradeMenu.ts` -- READ ONLY. `offerView` already handles this correctly; no client change expected.

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/game/world.ts` -- replace `offers: BoonOffer[]` with `bankedLevels: number` + `offer: BoonOffer | null`; type change forces every call site to be revisited -- the FIFO of pre-drawn offers is exactly the hoarding bug.
- [ ] `server/src/game/world.ts` -- add a private `materializeOffer(ship)`: draw only when `bankedLevels > 0 && offer === null`; an empty draw leaves `offer` null and emits no `pt` -- preserves the ratified offer-less-level rule without deadlocking the queue.
- [ ] `server/src/game/world.ts` -- `grantPoint`: increment `bankedLevels`, then materialize; `spendPoint`/`settleSpend`: consume ONLY the chosen card, decrement, then materialize the next; `spendHeal`: consume a level and drop the offer, returning nothing (nothing ever left the deck); `redeployShip`: zero both fields.
- [ ] `server/src/game/world.ts` -- `consumeAcquisitionPick`: drop the `scrubAcquisitions` call; purge then materialize from the cleaned deck -- no other offer can hold a stale acquisition card.
- [ ] `shared/src/sim/deck.ts` -- make `drawOffer` NON-CONSUMING (same picks, same `levelsSinceRare` advance, cards stay in the pool) and add `consumeCard(deck, id)` removing exactly one copy -- the draw must stop being the thing that takes cards out; fitting must be.
- [ ] `shared/src/sim/deck.ts` + `shared/src/index.ts` -- retire `scrubAcquisitions` and its barrel export (cycle 69/72 house style: remove end to end so no dead knob survives). Retire its tests rather than adapting them.
- [ ] `server/src/game/frames.ts` -- project `pts` from `bankedLevels` and `offer` from the materialized offer; wire shape byte-identical.
- [ ] `server/src/__tests__/upgrades.test.ts` -- rewrite the earn-time-draw pins to the lazy model and ADD the anti-regression pin: bank 20 levels without spending, assert every offer is full-size and the deck never shrinks.
- [ ] `server/src/__tests__/` (boons/xp/frames/goldenFrames) -- update the `pts === offers.length` pins and any snapshot touched by the field rename.
- [ ] `VERSION` + `package.json` -- 0.17.79 → 0.17.80.
- [ ] `_bmad-output/implementation-artifacts/epic-2-context-amendments.md` -- amendments 69+ recording the ruling, the reproduction, and that amendment 67's "deck-run-dry is near-hypothetical" is now falsified.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` + `_bmad-output/gds-workflow-status.yaml` -- one-line status stamps each (both files, same PR).

**Acceptance Criteria:**
- Given a fresh Torpedo Boat deck, when 20 levels are banked without a single spend, then every materialized offer carries `CONFIG.offer.size` cards and the deck's card count is unchanged from its build size.
- Given an offer containing a line the player does not pick, when the next level's offer is drawn, then that line is still at full copies in the deck and eligible for the draw.
- Given a player fits N upgrades over a match, when the deck is measured, then it has lost exactly N cards.
- Given a materialized front offer, when the refit band is closed and reopened, then the offer ids are identical (no reroll).
- Given a single-copy line is fitted, when any subsequent offer is drawn, then that line never appears again (cap exact, no over-fit reachable).
- Given `npm run check`, when it runs, then lint, type-check, and all three suites pass.

## Spec Change Log

## Review Triage Log

## Design Notes

The bug is a reservation leak, not a return bug: `returnCards` always worked, but it can only fire on a spend, and levels are earned on a wall clock the player does not control. Measured on the shipped engine (TB, 59 cards): spend-immediately never goes short; spend-every-3rd empties the deck by L19; never-spend empties it by L15 and then banks nothing at all for the rest of the match.

Front-only materialization was chosen over a window-open trigger because it needs no new client→server message and therefore no `PROTOCOL_VERSION` bump, while being indistinguishable to the player — the client already renders the next offer in place on a spend. It also gets the never-reroll guarantee for free: the offer is drawn once, stored, and frozen until spent.

`scrubAcquisitions` exists solely to clean stale acquisition cards out of OTHER banked offers. Under this model there are no other banked offers, so it is unreachable by construction rather than merely unused.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), type-check clean across shared/server/client, all suites green.
- `npm test -w server` -- expected: the new bank-20-levels anti-regression pin passes and no offer is short.

**Manual checks:**
- Play a match, bank 10+ levels without pressing TAB, then open the refit band: every offer is 4 cards plus the DAMAGE CONTROL rail, all the way down the queue.
