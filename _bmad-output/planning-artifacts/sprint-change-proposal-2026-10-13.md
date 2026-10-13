# Sprint Change Proposal — 2026-10-13: Story 9.7 becomes ARMOR — a passive damage-reduction ladder; the Depth Charge story is cancelled

**Workflow:** `gds-correct-course` · **Mode:** Batch · **Author:** Claude (Developer) · **Decider:** Eric
**Trigger (Eric, 2026-10-13, verbatim):** *"we are going to drop the depth charge sprint (9-7) and replace it with a new passive Armor tiered upgrade that is distinct from Hull Points (will need to rename this from Armor). Armor will start at 0 at Tier 0/- and build up to 5 at Tier V. We will use the 'industry standard' damage reduction/multiplier formula ... Setting K to 5, this means every 5 armor provides 100% more effective HP. The Dreadnought 'Damage Cut' will change to providing 5 temporary armor upon activation thus, it stacks)."* Corrected in the same session: *"that formula is for Damage Reduction. The Damage Multiplier formula is K / (K + Armor). So all damage gets multiplied by that damage multiplier."*

**Rulings taken in this session (AskUserQuestion, 2026-10-13):**
1. Armor multiplies **every damage source but the storm** — weapons, burns, and ram/grind contact damage. Storm bites land in full, as the DAMAGE CUT already does (epic-8 amendment 101). The ~17:30 match ceiling is untouched.
2. **Rounding follows the cut's rule** (epic-8 amendment 102): a whole-hp blow is floored after the multiply; a burn or grind tick stays an exact fraction through its pool.
3. **DAMAGE CUT = +5 Armor for 10 s on a 30 s cooldown** (window was 8 s; cooldown unchanged and still scaled by RELOAD). The flat ×0.5 is gone.
4. **The `depthCharge` stub consumable line stays** as amendment 83 left it (never dealt, no glyph, no key). Eric: *"I may bring back the idea of more items later, so we can keep the stub. But i'll approach it at that point when I decide to."* The story is cancelled; nothing else about the stub moves.

---

## 1. Issue Summary

Story 9.7 was the optional Depth Charge (Eric 2026-10-06: *"Maybe we can add the Depth Charge, idk."*), carried as a stub consumable since epic-8 amendment 83 and parked behind a design sitting. Eric has now cut it and put a new passive ship upgrade in its slot: **ARMOR**, a five-tier ladder that reduces incoming damage by the standard diminishing formula.

The existing ladder *called* ARMOR today (`CATALOG.armor`, +25 max hp × 4) is not that thing — it is extra hull, and Story 9.6 already renames it HULL POINTS at +50 × 5 (epic-9 amendment 28). So the name ARMOR is free for the new stat once 9.6 lands, and the two lines are distinct: HULL POINTS makes the pool bigger; ARMOR makes every hit smaller.

The formula, with `K = 5`:

- **damage multiplier** = `K / (K + Armor)` — every non-storm blow is multiplied by it, then the shield absorbs what is left (same order as the cut today, amendment 100).
- **effective hull** = `maxHp × (K + Armor) / K` — each point of Armor is +20 % effective hull; five points double it.

| Armor | Multiplier | Effective hull | 15 hp cannon shell lands as | 50 hp heavy torpedo lands as |
|---|---|---|---|---|
| 0 (Tier 0 / –) | 1.000 | ×1.0 | 15 | 50 |
| 1 (Tier I) | 0.833 | ×1.2 | 12 | 41 |
| 2 (Tier II) | 0.714 | ×1.4 | 10 | 35 |
| 3 (Tier III) | 0.625 | ×1.6 | 9 | 31 |
| 4 (Tier IV) | 0.556 | ×1.8 | 8 | 27 |
| 5 (Tier V) | 0.500 | ×2.0 | 7 | 25 |
| 10 (Tier V + DAMAGE CUT) | 0.333 | ×3.0 | 5 | 16 |

(Shell values floored per ruling 2.) The DAMAGE CUT at Armor 0 is exactly today's ×0.5; at higher tiers it stacks additively on the Armor value, never as a second multiply: a Tier II Dreadnought under its cut sits at Armor 7 → ×0.417.

This supersedes one standing GDD ruling: *"No endure axis (Eric, 2026-09-04): 'Armor IS HP and HP is already upgradeable'"* (gdd.md, Flat damage model). Armor is now a second endure axis, but still a single flat multiplier on one hull pool — no sectional damage, no directional armor, no crit zones. The flat damage model stands.

## 2. Impact Analysis

### Epic impact

Epic 9 keeps eleven stories; 9.7 changes content, not number. Depth Charge moves from `backlog (optional)` to `cancelled`. Nothing in 9.8–9.11 renumbers. The Account (Epic 10) is untouched.

### Story impact

- **9.7 Depth Charge → CANCELLED.** The stub line, its ledger entries (2026-09-25 "last two stubs", 2026-10-11 "un-stubbed consumable with no key") and the GDD's post-launch candidate list all stay as they are; the ledger entries are not stamped MOOT, because the stub survives.
- **9.7 Armor (new).** Builds the ladder, the fold, the gate, the Cut change, a glyph, copy and tests. Full text in §4.1.
- **9.6 Five Tiers and Passive Healing.** Unchanged in scope, but it is now the rename's owner in fact as well as name: when it renames `armor` → `hullPoints`, 9.7 needs the `armor` id back. Sequence stays 9.6 then 9.7 (Eric's order, amendment 30). One note added to 9.6: the catalog id `armor` is reserved for 9.7, so 9.6 must actually rename the id, not only the label.
- **9.2 Every Consumable Has a Key.** The "key 7 only if 9.7 builds it" clause is dead; no key 7 is reserved. Nothing to build.
- **9.5 Ramming and Contact Damage (landed, PR #274).** Contact damage goes through the one gate, so Armor reduces it automatically (ruling 1). Mass is still effective max hull (amendment 73); Armor never adds mass.
- **9.11 How-to-Play and Record.** Gains an ARMOR entry and loses the depth-charge possibility; the GDD mechanics stamp for the superseded "Armor IS HP" sentence is 9.11's, per amendment 30.
- **Bots.** `damageCutCues` and `DAMAGE_CUT_TORPEDO_U` (fire the cut when a torpedo is inside 150 u) still make sense; the cut is a bigger deal at high Armor, not a different one. Bot appetite for the `armor` ladder: the 8-20 rule already weights ship-stat ladders; 9.7 confirms the draw table covers the new line.

### Artifact conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `planning-artifacts/epics.md` Story 9.7 | Depth Charge text | Cancelled stamp; new 9.7 Armor story inserted (§4.1) |
| `implementation-artifacts/epic-9-context.md` | Story list, Tiers paragraph, 9.7 notes, key-7 clause | Regenerable file; edited in place to match (§4.2) |
| `implementation-artifacts/epic-9-context-amendments.md` | None yet | Amendments 85–89 appended (§4.3) |
| `implementation-artifacts/sprint-status.yaml` | `9-7-depth-charge: backlog` | Row becomes `9-7-depth-charge: cancelled` + `9-7-armor: backlog` (§4.4) |
| `gds-workflow-status.yaml` | correct-course row | One-line stamp (§4.4) |
| GDD `gdd.md` — E9 row, "Flat damage model", Dreadnought class row | "Armor IS HP"; DAMAGE CUT ×0.5 `[DRAFT]` s | E9 row stamped now; mechanics sentences stamped at 9.11 (amendment 30) — the E9 row stamp names them |
| `catalog-v3.md` R8 ARMOR row | Already superseded by amendment 28 (HULL POINTS) | Addendum is 9.10/9.11's per amendment 30; this proposal adds the ARMOR line to that debt |
| `deferred-work.md` depth-charge entries | Assume the story may build | Left standing; the stub survives, the entries still describe it truthfully. 9.10's triage may annotate |

### Technical impact

- **`shared/src/sim/catalog.ts`:** a new universal ladder `armor` (cap 5, `statEffect('armor', { add: 1 })`), landing after 9.6 has renamed the current `armor` line to `hullPoints`. Catalog and offer invariants cover it like every ladder.
- **`shared/src/sim/stats.ts` (`effectiveStats`):** new derived field `armor` (0–5 from the ladder) and `damageMultiplier = CONFIG.armor.k / (CONFIG.armor.k + armor)`; the DAMAGE CUT row loses `factor` and gains `armorBonus: 5`. The multiplier under the cut is derived at the gate from `armor + armorBonus`, never pre-baked, so one formula lives in one place (a pure helper `damageMultiplierFor(armor)` beside `effectiveStats`).
- **`shared/src/constants.ts`:** `CONFIG.armor = { k: 5, perTier: 1 }`; `CONFIG.damageCut = { armorBonus: 5, durationMs: 10000, maxAmmo: 1, reloadMs: 30000 }`.
- **`server/src/game/world.ts` `applyDamage`:** the one gate multiplies every non-storm `amount` by the victim's current multiplier (ladder Armor, plus the cut's bonus while `now < damageCutUntil`), floors whole-hp blows, keeps DoT fractions, then the shield absorbs — exactly the cut's existing branch, generalised. Storm bites bypass as today.
- **Client:** the predictor does not apply damage (hp is authoritative), so no prediction change. Refit card copy (`boonCopy.ts`), the How-to-Play table (`copy.ts`, derived from the sim), an ARMOR glyph (`equipmentIcons.ts`, shown to Eric first), and the DAMAGE CUT info text. No HUD readout: the player can read their tier on the refit card.
- **Wire:** nothing new rides the wire; `OwnShip.damageCutUntil` stays. `PROTOCOL_VERSION` bumps (catalog content and the client reads the new CONFIG block).
- **Tests:** the cut's gate tests re-base from "×0.5" to "Armor 5 → ×0.5"; ladder tests assert the contract (multiplier at each tier, floor on blows, fraction on ticks, storm exempt, shield after). No vocabulary pins.
- **Perception:** no new event; the six exceptions untouched.

## 3. Recommended Approach

**Direct adjustment.** One story's content is swapped inside the existing Epic 9 order; no rollback, no MVP change. Effort is one build cycle after 9.6 (the ladder, the fold, one gate branch generalised, a glyph, copy, tests). Risk is low: the gate already has the cut's multiply-then-floor path, and the formula is a pure function both sides can read. The one sequencing hazard is the `armor` catalog id, which 9.6 must vacate before 9.7 claims it.

## 4. Detailed Change Proposals

### 4.1 Story 9.7 — Armor *(replaces Depth Charge)*

```
Story: 9.7 Depth Charge
Section: whole story

OLD:
### Story 9.7: Depth Charge (OPTIONAL — "Maybe we can add the Depth Charge, idk.")
As a captain, I want the DEPTH CHARGE to do something, so that the stub line
from amendment 83 becomes a card or is cut on purpose. [ACs: design sitting
first; if built, key 7, glyph, bots, drops, PV bump]

NEW:
### Story 9.7: Depth Charge — CANCELLED 2026-10-13 (sprint-change-proposal-2026-10-13.md).
The stub consumable line stays (Eric: "I may bring back the idea of more items
later, so we can keep the stub"). No key 7 is reserved.

### Story 9.7: Armor (inserted 2026-10-13 — sprint-change-proposal-2026-10-13.md §4.1)

As a captain building a hull,
I want a passive ARMOR ladder that shrinks every hit I take,
So that a tanky build is a real choice beside more hull, and the Dreadnought's
Shift stacks on top of it.

Eric (2026-10-13): "a new passive Armor tiered upgrade that is distinct from
Hull Points ... Armor will start at 0 at Tier 0/- and build up to 5 at Tier V
... The Damage Multiplier formula is K / (K + Armor). So all damage gets
multiplied by that damage multiplier. ... Setting K to 5, this means every 5
armor provides 100% more effective HP. The Dreadnought 'Damage Cut' will change
to providing 5 temporary armor upon activation thus, it stacks."

Acceptance Criteria:

Given 9.6 has landed (HULL POINTS owns the old `armor` id's +hp effect under a
  new id) and the DAMAGE CUT is a flat ×0.5 for 8 s
When the story lands
Then ARMOR is a universal ship-upgrade ladder, cap 5, +1 Armor per rung
  (Tier 0 = 0 … Tier V = 5), in the common pool like SPEED and TURNING
And `effectiveStats()` derives `armor` and `damageMultiplier = K / (K + armor)`
  with `K = CONFIG.armor.k = 5`; nothing outside it re-derives the multiplier
And the one damage gate multiplies EVERY damage source but the storm — weapon
  blows, burn ticks, grind and contact — by the victim's multiplier before the
  shield absorbs; a whole-hp blow is floored after the multiply, a burn or
  grind tick keeps its exact fraction; a storm bite lands in full
And DAMAGE CUT grants +5 Armor for 10 s on a 30 s cooldown (RELOAD-scaled):
  the gate reads `armor + 5` while the window is open, so Tier V under the cut
  is Armor 10 = ×1/3; the flat factor is deleted, not kept beside it
And mass for ramming is still effective max hull; ARMOR adds no mass
And the catalog and offer invariants cover the line; bots draw it by the 8-20
  rule; its glyph is shown to Eric before commit; refit copy and the
  How-to-Play table derive from the sim; no HUD readout is added
And the cut's gate tests re-base to "Armor 5 → ×0.5" with the ruling cited;
  `PROTOCOL_VERSION` bumps (catalog content); both trackers stamped
And the no-friendly-fire rule is unaffected (Armor only ever reduces damage to
  the hull that holds it)

Rationale: Eric's 2026-10-13 ruling. The depth charge was never designed; the
tank axis Eric wants exists today only as more hull.
```

### 4.2 `epic-9-context.md` (regenerable; edited to match)

- Story list: `Story 9.7: Depth Charge (OPTIONAL)` → `Story 9.7: Armor` with a cancelled line for the depth charge beside the 9.2/9.3 cancellations.
- Loadout (9.2) paragraph: drop `and 7 DEPTH CHARGE only if 9.7 builds it`.
- Tiers (9.6) paragraph: add that 9.6 must rename the catalog *id* `armor` → `hullPoints`, because 9.7 claims `armor`.
- New **Armor (9.7)** paragraph: the formula, K = 5, every source but the storm, floor on blows, DAMAGE CUT = +5 Armor for 10 s / 30 s.
- Dependencies: `9.7 takes 7 only if built` → gone; `9.7 opens with a design session…` → `9.7 lands after 9.6 and reuses the vacated armor id`.

### 4.3 `epic-9-context-amendments.md` — new section, amendments 85–89

85. STORY 9.7 IS ARMOR; DEPTH CHARGE IS CANCELLED, ITS STUB STAYS.
86. ARMOR IS A FIVE-TIER LADDER, +1 PER RUNG, MULTIPLIER K / (K + ARMOR) WITH K = 5 (supersedes "Armor IS HP", GDD 2026-09-04; the flat damage model stands).
87. ARMOR MULTIPLIES EVERY SOURCE BUT THE STORM; BLOWS FLOOR, TICKS STAY EXACT (extends amendments 100–102 from the cut to the ladder; 75 carries contact damage in).
88. DAMAGE CUT IS +5 TEMPORARY ARMOR FOR 10 s ON A 30 s COOLDOWN (supersedes epic-8 amendment 99's 8 s and amendment 89(c)'s ×0.5; stacks additively on the ladder).
89. THE CATALOG ID `armor` IS 9.7'S; 9.6 RENAMES THE OLD LINE'S ID TO `hullPoints` (sequencing note; also closes the "key 7 if built" clause of amendment 32-era 9.2 text).

### 4.4 Trackers

- `sprint-status.yaml`: `9-7-depth-charge: cancelled  # 2026-10-13 Eric: replaced by ARMOR (sprint-change-proposal-2026-10-13.md); stub line kept` and a new `9-7-armor: backlog  # ARMOR ladder cap 5, K=5 multiplier, all but storm, DAMAGE CUT = +5 Armor / 10 s (amendments 85-89); after 9-6`.
- `gds-workflow-status.yaml`: one-line stamp on the `correct-course` row; `last_updated` 2026-10-13.
- GDD E9 row: a dated "superseded in part 2026-10-13" clause naming this file and amendments 85–89; mechanics sentences at 9.11.

## 5. Implementation Handoff

**Scope: Minor–Moderate** — one story swapped inside a settled order. Routed to `gds-create-story` for 9.6 next (unchanged), then 9.7 Armor; every number above is Eric's and is offered back for a final nod at 9.7's spec step, never changed silently. Dev-story only when Eric says. Success: 9.7 lands after 9.6 with `npm run check` green, the storm exempt, the shield still absorbing after the multiply, a Tier V Dreadnought under its cut taking one third, the perception exception count still SIX, both trackers stamped, and Eric's staging play confirming the feel.

**Memory of the session (for the next agent):** HULL POINTS is the old +hp line under a new id; ARMOR is the new multiplier; K = 5 and the formula is Eric's, never re-tune it by sim; the storm is the one exemption; the depth charge stub stays and is not re-proposed; no HUD armor readout.
