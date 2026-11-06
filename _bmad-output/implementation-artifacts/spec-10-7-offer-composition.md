---
title: 'Story 10.7: Offer Composition'
type: 'feature'
created: '2026-11-06'
status: 'in-progress'
baseline_revision: '75089a23'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A level-up offer is drawn by a kind-share lottery (`weapon` / `upgrade`), so an offer can be four cards of one kind while the other kind still has cards; a maxed hull keeps banking levels it can never spend; and the REDRAW pip is a client guess that reads "unused" after a reconnect.

**Approach:** `drawOffer` builds a four-slot TYPE plan `[ship, equipment, wildcard, wildcard]` and draws one eligible line per slot (Eric's law, 2026-10-25 / re-cut 2026-11-04). A hull with nothing dealable stops banking levels. The own frame carries a server-truth "redraw used" flag (PV 98 → 99).

## Boundaries & Constraints

**Always (Eric's rulings, 2026-11-06, this run — R1–R4):**
- R1 — a wildcard slot is a 50 / 50 coin flip between Ship and Equipment, then a line of that type.
- R2 — a REDRAW is the whole draw run again: Ship, Equipment, and both wildcards flip their type afresh. No remembered plan.
- R3 — a hull with nothing dealable gets NOTHING and STOPS BANKING levels (no random stats). `pts` is 0 for it; the XP strip never advertises an unspendable level.
- R4 — the REDRAW pip is fixed here: the own frame says "redraw used"; PROTOCOL_VERSION 98 → 99.
- Type mapping (catalog facts, epic-10 amendment 12 R10 / R11): **ship** = `ladder` lines; **equipment** = `equipment` lines (the bare weapon and its tier cards) and `addon` lines.
- A slot whose type has no undealt eligible line takes the other type; neither → the offer is short; nothing eligible at all → empty. Never a duplicate line, never a throw.
- The eligibility law (`eligibleLines`: stubs, one kind per family slot, caps, gun-ladder host, add-on host aboard) is UNCHANGED. WEIGHTING (epic-8 amendment 90) is unchanged in meaning: it bends only WHICH bare weapon (copy 1 of an `equipment` line); every other line weighs 1.
- The level-zero weapon guarantee (Story 8.14, amendment 93) is RETIRED with a dated note: the Equipment slot supersedes it (at level zero every eligible equipment line is a bare weapon).
- One pure shared function, deterministic over (ship, weights, rng, catalog), catalog key order; server is the only production caller. Complexity ≤ 10. Tests assert contracts only (project-context Testing Rules): no odds pinned to a seed, no copy, no ruled number as a literal.

**Block If:** the client turns out to need the slot TYPES on the wire; any change to XP, level counting, card content, weighting dials, or bot spend scoring appears necessary; a perception invariant would need a new exception.

**Never:** no slot types on the wire (`BoonOffer` stays line ids); no change to `CONFIG.offer.size` or weighting dials; no batch sims; no new in-game copy; no How-to-Play edits (10.14); `level` / `lvl` keeps counting for a maxed hull (only banking stops); do not touch CLAUDE.md.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal | both types have ≥ 2 undealt lines | card 0 a ship line, card 1 an equipment line, cards 2–3 each of the flipped type; 4 different lines | none |
| Level zero | bare hull, empty slots | card 1 is a bare weapon the hull can take | none |
| Equipment exhausted | no eligible equipment line | four ship lines (while four remain) | none |
| Ship exhausted | no eligible ladder | up to four equipment lines | none |
| Wildcard type runs dry mid-offer | flipped type has no undealt line left | slot takes the other type | none |
| Fewer than 4 eligible in total | e.g. 2 lines left | 2-card offer, both lines | none |
| Nothing eligible | maxed hull / all-stub catalog | empty offer, zero rng spent; server: no level banked, `pts` 0, no `pt` event, offer null | none |
| Maxed mid-queue | hull spends its last eligible card with levels banked behind it | remaining banked levels drop to 0 | none |
| Redraw | countdown, offer held, first press | fresh full draw; own frame flag true from then on, including after reconnect | later presses no-op as today |

</intent-contract>

## Code Map

- `shared/src/sim/draw.ts` -- the draw engine: `DrawKind`, `Eligible`, `eligibleLines` (:246), `usableLines` / `pickUsable` (:294–318, the guarantee), `pickKind` (:324), `pickLine` (:340), `drawOffer` (:375); header comments :37–66
- `shared/src/sim/offers.ts`, `shared/src/constants.ts` (:2864–2894), `shared/src/sim/boons.ts` (:246) -- comments describing the two-stage draw / empty offers
- `shared/src/types.ts` -- `OwnShip` (:449; `pts` :501 doc "a degenerate empty draw still banks")
- `shared/src/index.ts` -- barrel (:1037), `PROTOCOL_VERSION` (:996) + history comment (:6)
- `shared/src/__tests__/draw.test.ts`, `barrel.test.ts` (:75, :231, :660), `catalogUnderIndex.test.ts` (:231) -- kind-odds, 2-rng-per-card and guarantee tests to rewrite
- `server/src/game/world.ts` -- `grantPoint` (:3288), `materializeOffer` (:3399, the one `drawOffer` call :3401), `mulligan` (:3361), `spendCard` (:3773), `ShipRecord.mulliganed` (:728), `bankedLevels` (:684)
- `server/src/game/frames.ts` (:110–116) -- builds the `you` row
- `server/src/__tests__/` -- `upgrades.test.ts` (:805–845, :941, :953), `mulligan.test.ts` (:88, :130, :174), `match.test.ts` (:280–474), `botPolicy.test.ts` (:1235–1290), `frames.test.ts` (:56), `goldenFrames` snapshot, `xp.test.ts`
- `server/scripts/openingSmoke.mjs` (:151–173, :202) -- asserts `offer[0]` usable
- `client/src/main.ts` -- `g.mulliganUsed` (:712, :940, :1291, :2909), `redrawState` (:1034); `client/src/ui/upgradeMenu.ts` -- `mulliganLanded` (:749); `client/src/render/xpStrip.ts` (:119 comment)

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/draw.ts` -- replace `DrawKind` with an offer TYPE (`ship` | `equipment`) on `Eligible` plus what weighting needs to know a bare weapon; replace `pickKind` / the guarantee with the four-slot plan in `drawOffer` (see Design Notes); delete `usableLines`, `pickUsable`, the `guarantee` option; rewrite the header with a dated retirement note for amendments 92 (kind share) and 93 (guarantee) -- the composition law
- [ ] `shared/src/types.ts`, `shared/src/index.ts` -- add own-row field `rd: boolean` ("the one countdown REDRAW is used") with doc; fix the `pts` doc; barrel follows draw.ts; `PROTOCOL_VERSION = 99` + history line -- wire contract
- [ ] `shared/src/sim/offers.ts`, `shared/src/constants.ts`, `shared/src/sim/boons.ts` -- bring the stale comments in line (no value changes) -- docs match code
- [ ] `shared/src/__tests__/draw.test.ts` (+ `barrel.test.ts`, `catalogUnderIndex.test.ts`) -- property tests over many seeds and generated ship states for every matrix row: plan invariants, fallback, no duplicate, short / empty, zero rng on empty, determinism (same inputs → same offer), weighting touches only bare weapons; delete kind-odds and guarantee tests -- contract coverage
- [ ] `server/src/game/world.ts` -- drop `guarantee` plumbing; an empty draw banks nothing: after it `bankedLevels` is 0 and no `pt` is pushed (covers `grantPoint`, the next-level draw in `spendCard`, `mulligan`); comments -- R3
- [ ] `server/src/game/frames.ts` -- `rd: ship.mulliganed` on the own row only -- R4
- [ ] `server/src/__tests__/*`, golden snapshot, `server/scripts/openingSmoke.mjs` -- update to the new law: exhausted / all-stub hull banks 0; opening and redrawn offers hold a takeable bare weapon in the Equipment slot; `rd` false → true on redraw and still true in a frame built after reconnect; contacts never carry `rd`; regenerate the golden snapshot and READ the diff (only `rd` and drawn offers may move) -- server contract
- [ ] `client/src/main.ts`, `client/src/ui/upgradeMenu.ts`, `client/src/render/xpStrip.ts`, client tests -- the pip reads `you.rd`; remove `g.mulliganUsed` and whatever inference existed only to feed the pip (keep the spend-latch release behavior); stale comment; tests on the pure view -- R4 client
- [ ] records (orchestrator) -- `epic-10-context-amendments.md` amendment 13 + `epic-10-context.md`, `deferred-work.md` (close the two exhausted-hull entries and the REDRAW pip entry), both trackers, `VERSION` / `package.json` 0.19.10, `CHANGELOG.md`, dated stamp on Story 10.7 in `epics.md`

**Acceptance Criteria:**
- Given any reachable ship state, when an offer is drawn, then the plan invariants of the matrix hold and no line repeats.
- Given a captain who used the REDRAW and then reconnects during countdown, when the next own frame arrives, then the pip shows used.
- Given a maxed hull earning XP, when a level is crossed, then `lvl` rises, `pts` stays 0 and the banked-level chip stays blank.
- Given the change, when `npm run check` runs, then it exits 0; `matchSmoke`, `weaponsSmoke` and `openingSmoke` pass first try.

## Spec Change Log

## Review Triage Log

## Design Notes

Draw, per slot in order `[ship, equipment, wild, wild]`, over the eligible lines not yet dealt:
1. Wanted type: fixed for slots 0–1. For a wildcard, when BOTH types still have an undealt line, spend one `rng.next()` (`< 0.5` → ship); when only one type has lines, take it and spend NO flip.
2. If the wanted type has no undealt line, use the other; if neither, stop.
3. One `rng.next()` picks the line by a weighted walk in catalog key order: weight = `weights.get(id) ?? 1` for a bare weapon (copy 1 of an `equipment` line), 1 for everything else.

An empty eligible set spends no rng. Exhaustion is permanent (taking a card is the only thing that can make a new line eligible), which is why zeroing `bankedLevels` on an empty draw is safe.

## Verification

**Commands:**
- `npm test -w shared` / `-w server` / `-w client` -- expected: green
- `npm run lint` -- expected: 0 errors (complexity ≤ 10)
- `npm run check` -- expected: EXIT 0
- `HC_DEV_OPTIONS=1` smokes `matchSmoke`, `weaponsSmoke`, `openingSmoke` on a scratch port against a server booted from `server/` -- expected: OK first try; kill the PID and its tsx child
