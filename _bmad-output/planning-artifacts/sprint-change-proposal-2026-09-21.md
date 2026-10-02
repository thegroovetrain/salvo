---
title: 'Sprint Change Proposal — The Pool (decks retired, class Shifts, the gun pick)'
date: '2026-09-21'
author: 'Eric (rulings) / facilitator (transcription)'
trigger: 'Story 8.14 Catalog v3 — The Gun Family and the Missile, about to be drafted'
status: 'APPROVED by Eric 2026-09-21 — applied to epics.md, gdd.md, catalog-v3.md, ledgers and trackers in the same PR'
scope: 'Major — Epic 8 re-cut from 8.14 on (two replacement stories, six renumbered), Epic 9 re-cut (9.5 deleted, 9.4 / 9.6 / 9.7 / 9.11 re-scoped)'
mode: 'Incremental (each proposal approved individually)'
---

# Sprint Change Proposal — The Pool

Every ruling in this document is Eric's, made interactively on 2026-09-21. Where he has not
given a number it is `[DRAFT]` and stays his. Nothing here invents a mechanic.

## Section 1 — Issue Summary

### Problem statement

The card-deck model (Epic 8, deck-model-v3 forge, catalog v3) was built to do two jobs at once:
progression (a metagame of unlocks and deck-building) and class identity (each hull's default
deck was authored to a fantasy). On the eve of Story 8.14 Eric found the second job failing:

- **The verb list is thin.** Naval combat offers roughly six distinct ways to hurt a ship. The
  catalog asks them to fill 29 lines, so MACHINE GUN and FLAK GUN read as deck-gun variants and
  HORIZONTAL MISSILE reads as "a better torpedo" — which, historically, it is. A missile at
  250 u/s and 660 u will overshadow a 55 u/s torpedo in nearly every engagement.
- **The catalog is hull-agnostic by design** (forge: class-locked cards REJECTED), so the
  Torpedo Boat and the Mine Layer are not guaranteed to be what their names say. There are not
  enough cards to justify splitting pools, and 8.13 already collapsed two of them (SUPERCAV to a
  consumable, ACOUSTIC HOMING to a tier stat), which drained deck variety further.
- **Identity was tied to weaponry.** The hull envelope was the only non-weapon differentiator.
  Class identity needs to be visible the moment a hull is picked, before anything is drawn.

Eric's conclusion: "The decks now seem overengineered, and I am missing an excellent
opportunity to make the ship classes more unique without the uniqueness being tied to
weaponry."

### Issue category

Strategic pivot (design), discovered during sprint execution, before Story 8.14 was drafted.

### Evidence

- `shared/src/sim/catalog.ts` L1-10: 29 lines / 122 cards; four equipment lines (`missile`,
  `machineGun`, `flak`, `monitor`) are still `STUB_ROWS` (`stats.ts` L275-289) awaiting 8.14.
- `DEFAULT_DECKS` (`catalog.ts` L821-825): each hull's three "flavour" lines are exactly the
  lines under doubt (TB: light/heavy torpedo + MACHINE GUN; ML: naval/captive mines + FLAK; BS:
  MISSILE + MONITOR + STAR SHELLS).
- `deck-model-v3/forged-idea.md`: "class-locked cards" in the rejected list — the sameness Eric
  observed is a designed outcome, not drift.
- 8.13 (amendments 74, 80): SUPERCAV became a consumable, ACOUSTIC HOMING was deleted, and
  `deferred-work.md` L2330 parked HEAT SEEKING for 8.14 with Eric's "I will revisit this when we
  get back to missiles."
- Eric's playtest-group note (2026-09-21, quoted in the run): fixed Shift ability per hull, a
  class gun, "offer all weapons, upgrades, and consumables to all players when they level up",
  and the observation that Submarines and Carriers become possible as Shift abilities without
  submerging or planes appearing on other ships.

## Section 2 — Impact Analysis

### 2.1 Epic impact

**Epic 8 (renamed "The Pool").** Landed stories 8.0–8.13 stand as machinery. Four landed
stories are partly undone by two new stories:

| Landed story | What changes |
|---|---|
| 8.2 Legal decks, default decks, the door | `checkDeck`, `DEFAULT_DECKS`, `DEFAULT_OWNED`, `loadDeckFor`, the `deckId` room option — deleted. A seat is a hull and a gun. |
| 8.3 The Draw | Source becomes the common pool: every line, unlimited copies; weapon guaranteed while a slot is open; match-wide tilt `[DRAFT]`. |
| 8.9 Shift boost universal | Becomes one fixed ability PER HULL (boost / instant reload / damage cut). |
| 8.11 Match consumable pool | RETIRED (consumables are pool lines like everything else). |
| 8.12 Deck-gun ladder | Becomes the deck gun's ladder; MACHINE GUN and FLAK GUN get their own. |

Story 8.14 as written (gun family + missile) is dead. It is replaced by **8.14 The Common
Pool** and **8.15 The Gun Pick and the Class Shifts**; old 8.15–8.20 become 8.16–8.21 with
light edits. Net: 22 stories (was 21).

**Epic 9 (The Account).** 9.4 loses its deck column and gains the class Shift line and the gun
picker; **9.5 is DELETED**; 9.6 becomes line + gun + hull unlocks with everything unlocked on
day one; 9.7 and 9.11 get small edits. Net: 10 stories (was 11).

### 2.2 Story impact

Detailed in Section 4. Summary of the standing rules that change:

- Decks do not exist. No card is class-locked, no card is brought.
- Hull identity = envelope + fixed class `Shift`. The gun is the captain's pick.
- The draw: anything while any of `Q`/`E`/`R` is empty (with at least one weapon in the
  offer); upgrades and consumables only once all three are full; unlimited copies bounded by
  caps; a match-wide tilt makes a line another captain just took slightly less likely for
  everyone else (never impossible).
- HORIZONTAL MISSILE, MONITOR GUN and HEAT SEEKING are cut. BROADSIDE, DEPTH CHARGE (stub) and
  SUPERCAV (consumable) stay.
- The three hulls become named ship classes with real designations; all three names are
  `[NAME PENDING — Eric]`.
- Everything is unlocked for everyone until accounts, progression and playtest data exist; the
  pared "Default Set" is a later CONFIG edit.

### 2.3 Artifact conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `epics.md` Epic 8 header, 8.14–8.20, Epic 9 header, 9.4–9.7, 9.11 | Deck language throughout | Edited in this PR (Section 4.1–4.2) |
| `gdd.md` classes, roster formula, slot grammar, ladders, Shift, deck model v3, consumables, match pool, weapons table, equipment table, add-ons, arcs | Deck model and starter decks are the spine of §Primary Mechanics | Minimal dated supersessions (Section 4.3) |
| `catalog-v3.md` | Starter-deck columns, MISSILE/MONITOR rows, hidden pool | One status line prepended; per-line numbers stand where not voided |
| `game-architecture.md` (deck door, `checkDeck`, decks table) | Already ledgered as unresolved (`deferred-work.md` L1843) | Added to 9.11's list |
| `DESIGN.md` UX-DR50, 60–66, 71, 75, 77 | Ship & Deck screen, copies rail, pre-queue gate, DEFAULT word | Flagged only (Section 4.5); a `gds-ux` pass before 9.4 |
| `deferred-work.md` L2330 (HEAT SEEKING → 8.14) | Void | Closed by the missile cut |

### 2.4 Technical impact (for the story drafts, not this PR)

- `shared/src/sim/deckRules.ts` deleted; `deck.ts` re-cut from a per-player `DeckState` to a
  pool draw with per-line weights and the tilt; `pool.ts` deleted; `catalog.ts` loses
  `DEFAULT_DECKS` / `DEFAULT_OWNED` and the missile/monitor/heatSeeking rows; `loadout.ts`
  narrows `EquipmentId` and the gun slot becomes hull-agnostic over three gun ids;
  `stats.ts` `STUB_ROWS` drain to zero.
- `CONFIG.deck` and `CONFIG.pool` deleted; `CONFIG.offer.tilt` added `[DRAFT]`;
  `CONFIG.guns.{deckGun, machineGun, flak}`; `CONFIG.shipClasses.<id>.shift` (three shapes).
- Server: room options `deckId` gone, `gun` added (sanitized, default deck gun); `addShip(hull,
  gun)`; the damage-cut Shift lives inside the one `applyDamage` gate; instant reload resets
  equipment clocks through the registry.
- Client: class-select regains per-hull content (Shift line, gun picker); `boonCopy` names;
  icons; the HUD Shift square reads the hull ability glyph.
- Wire: `InputMsg.held`, the `gun` seat field, the reveal's `w` family field —
  `PROTOCOL_VERSION` bumps once per wire-changing story (8.14 and 8.15 each).
- Tests: deck tests deleted, not skipped; a pool-draw property test; the identity test for
  ship classes untouched until names are settled; the perception suite iterates the gun rows
  and still counts exactly SIX exceptions.
- Bots: `BOT_DECKS` deleted; `BOT_GUNS` and `SHIFT_TACTICS` tables `[DRAFT]`; harness `--gun`
  arm replaces `--deck`.

## Section 3 — Recommended Approach

**Path: Direct Adjustment with a partial rollback of 8.2.** Redefine Epic 8 from 8.14 on and
Epic 9 in place; delete the deck-legality and deck-door code rather than carry it dead.

Rationale: the draw, slots, HUD, consumables, heal card, opening/REDRAW, ladders, torpedoes and
mines are all reusable as-is. Only the deck as a *source* and the class identity model change.
Retiring decks removes a whole Epic 9 story (9.5) and the deck column of 9.4, which more than
pays for the two new Epic 8 stories.

- **Effort:** High (two new stories, a code rollback of 8.2's deck path, GDD re-cut).
- **Risk:** Medium — the draw property tests and the perception suite bound the sim risk; the
  main risk is `[DRAFT]` numbers landing untuned, which the harness (8.19) exists to catch.
- **Timeline:** net +1 story in Epic 8, −1 in Epic 9.

## Section 4 — Detailed Change Proposals (all APPROVED 2026-09-21)

### 4.1 `epics.md` — Epic 8

**Header.** Title becomes `## Epic 8: The Pool *(GDD E8 — upgrades v3 + catalog v4)*`. The
intro reads: "Pick a hull and sail its gun and its `Shift`: spawn with the mounted gun and the
class ability, redraw the opening offer during the countdown, draw from the one pool every
captain shares into `Q`/`E`/`R`, stock and fire consumables on `1`–`4`, heal from a card, read
your final loadout in results — identical rules for humans and bots, and every code path runs
with no account module at all. Twenty-two stories in build order (Eric-approved 2026-09-11;
re-cut from 8.14 on by the 2026-09-21 Sprint Change Proposal)." New standing constraint:
**decks do not exist** — no card is class-locked and no card is brought; hull identity is the
envelope and the class `Shift`; the gun is the captain's pick; never the draw.

**Story 8.14: The Common Pool** (replaces "Catalog v3 — The Gun Family and the Missile").

> As a captain, I want every level-up to draw from the one pool every captain shares —
> anything while I still have an empty weapon slot, upgrades and consumables once all three are
> full — So that what I sail is what I drew, not what I brought, and no lobby converges on one
> kit.
>
> **Given** the draw (8.3), the opening (8.10), the match pool (8.11) and the deck door (8.2)
> **When** the pool replaces the deck
> **Then** decks are GONE: `checkDeck`, `DEFAULT_DECKS`, `DEFAULT_OWNED`, deck ownership,
> `loadDeckFor` and the `deckId` room option are deleted (the sanitizer treats `deck`/`deckId`
> as any unknown key); a seat is a hull and a gun and nothing else; `CONFIG.deck` and
> `CONFIG.pool` are deleted and 8.11's hidden-pool machinery (`rollMatchPool`, `sanitizePool`,
> the 50-at-queue count) is retired with them; the catalog remains the single hull-agnostic
> list of lines (Eric: nothing class-locked), minus the lines 8.15 removes
> **And** `drawOffer` deals `CONFIG.offer.size` (4, shipped) DIFFERENT lines from the common
> pool with UNLIMITED copies — a line's only stop is its cap (tier cap, consumable cap 5,
> add-on cap 1) and the slot rules (`canStock`, a filled weapon slot); **while any of
> `Q`/`E`/`R` is empty every kind is eligible and at least one card in the offer is an
> equipment copy 1** (the 8.10 level-zero guarantee now holds at every level with an open
> slot); **once all three are filled, equipment copy-1 cards are never offered** — only tier
> cards for held lines, ladders, the mounted gun's ladder, add-ons whose host is held, and
> consumables; REDRAW at level zero is unchanged
> **And** **the match-wide tilt (Eric 2026-09-21):** `CONFIG.offer.tilt` — each time any
> participant takes copy 1 of a tiered equipment line, that line's draw weight for every OTHER
> participant is multiplied by `tilt.factor [DRAFT]` down to `tilt.floor [DRAFT]` (never zero:
> still possible, less likely); whether copies 2+ also tilt is `[DRAFT]`; humans and bots
> alike; server-private; the held `BoonOffer` never rerolls
> **And** **the gun is a PICK, not a hull fact (Eric 2026-09-21):** the seat carries `hull`
> and `gun` (`deckGun | machineGun | flak`), chosen at class select and frozen at queue like
> the hull; a missing or unknown `gun` resolves to the deck gun; slot 0 mounts the chosen gun
> from 0:00; the pool's gun ladder is the ladder OF THE MOUNTED GUN (deck gun keeps DECK GUN /
> TURRET / BARREL; MACHINE GUN and FLAK GUN get their own authored ladders in 8.15); the stat
> package and the class `Shift` stay FIXED per hull; **everything is unlocked for everyone**
> until progression exists (Eric 2026-09-21)
> **And** the three hulls become NAMED SHIP CLASSES with real designations (Eric 2026-09-21,
> shape: `IBK-01 KABUKI CLASS`): all three names are **[NAME PENDING — Eric]**; internal ids
> `torpedoBoat` / `mineLayer` / `battleship` and the identity test are untouched until the
> names are settled; no `deck`/`DEFAULT` string survives in client copy
> **And** deck tests are deleted, not skipped; a property test pins the open-slot guarantee,
> the full-slot exclusion, that the tilt is monotone and floored, and that unlimited copies
> never exceed a cap; the perception suite is unchanged (the draw is self-private);
> `PROTOCOL_VERSION` bumps once (the seat and the door change).

**Story 8.15: The Gun Pick and the Class Shifts** (new).

> As a captain, I want to choose which gun my ship mounts before I sail, and I want my hull's
> `Shift` to be its own ability, So that what a hull IS is visible the moment it is picked, and
> the weapon lines no longer have to carry class identity.
>
> **Given** 8.14 (the seat carries `gun`), the universal boost (8.9), the held-fire input
> contract (D26), the shipped deck gun and the `STUB_ROWS` **When** the gun family and the
> Shifts land
> **Then** THREE mountable guns, universal and slotless in slot 0, each a full `Equipment`
> module under `CONFIG.guns`: the **DECK GUN** as shipped (360°, 500 u/s, one round, 5 s, its
> ladder unchanged); the **MACHINE GUN**, a held-fire STREAM — `InputMsg.held: boolean`
> (REQUIRED; a non-boolean drops the whole message; a LEVEL on `InputStore.latest`),
> `fireControl` fires one shell per `rateMs` at `now` with no `fireT` and no D1 back-date while
> `held ∧ inArc ∧ n > 0`; release, arc exit (ONE denial then silence), an empty pool, Tab
> opening or window blur stop it; bow ±90° (ruled); 4 dmg / 0.25 s / 250 u / 6 s per pool /
> 15 s `[DRAFT — carried from catalog v3; Eric re-tunes it as a mountable gun]`; the Story 2.1
> click-coalescing clause (`deferred-work.md:198`) is discharged here; the **FLAK GUN** — 360°,
> one shell air-bursting at the click in a wide weak blast that hits hulls AND enemy ordnance
> (own ordnance immune, Eric 2026-09-11; mask `hull | mine | decoy | ordnance`), 10 dmg r40 u,
> 8 s `[DRAFT]`
> **And** each gun has its own ladder: DECK GUN / TURRET / BARREL stay the deck gun's (8.12,
> not re-authored); MACHINE GUN and FLAK GUN each get an authored ladder — steps
> `[DRAFT — Eric]` — offered only while that gun is mounted; the RELOAD ladder touches all
> three
> **And** HORIZONTAL MISSILE, MONITOR GUN and HEAT SEEKING are DELETED end to end (ids,
> `STUB_ROWS`, catalog rows, `boonCopy` names, icons, the `arcing` flag idea); no `missile`
> wire kind is ever added; the catalog header re-states its line and card counts
> **And** the class Shifts (`CONFIG.shipClasses.<id>.shift`), one per hull, FIXED (Eric
> 2026-09-21): **SPEED BOOST** on the `torpedoBoat` hull — the shipped numbers (+25% max speed,
> 10 s, 25 s cooldown; the GDD's "20 s" is corrected to the shipped value unless Eric
> re-rules); **INSTANT RELOAD** on the `mineLayer` hull — resets the reload clock of the
> mounted gun and every fitted `Q`/`E`/`R` weapon to ready, consumables untouched, cooldown
> `[DRAFT]`; **DAMAGE CUT** on the `battleship` hull — incoming hull damage ×0.5 for `[DRAFT]` s
> on a `[DRAFT]` cooldown, applied inside the one `applyDamage` gate (8.4), victim-private; the
> RELOAD ladder's −5%/tier on the Shift cooldown holds for all three; slot 1 stays the Shift
> slot and its HUD square reads the hull's ability glyph; bots use each through the same input
> pipeline (tactics in 8.19)
> **And** gun-shell signal rules hold for every gun: `sp` for all three; `hc` exactly one per
> shell resolution; `mz` PER SHELL including the stream (the deck gun's multi-barrel salvo
> still collapses to one flash), the stream's `mz` cost MEASURED at 20 streaming bots before
> the 0.25 s cadence is trusted; the reveal gains ONE field `w` (weapon FAMILY, no
> range-derivable value) — a DECLARED disclosure widening, ledgered; the flak burst is a burst
> like any other; the perception suite iterates the gun rows and still counts exactly SIX
> exceptions
> **And** arcs and aim points land in `arcs.ts` / `aim.ts` (machine-gun bow sector and range
> clamp; flak burst point); the slot's held-fire drain renders per UX-DR52; the class-select
> layer shows, per hull, the gun picker (three chips, deck gun preselected) and the Shift
> ability line — layout per the DESIGN.md flags in §4.5; `PROTOCOL_VERSION` bumps once
> (`held`, the `gun` seat field, `w`).

**Stories 8.16–8.21** (old 8.15–8.20, each +1):

- **8.16 Catalog v3 — Shield, Chaff, Decoy** (was 8.15): "from catalog v3 §4" → "as ruled";
  consumables are lines in the common pool. Radar buoy deletion stands.
- **8.17 Smoke Screen as a Sight Occluder** (was 8.16) and **8.18 Wake Drafting** (was 8.17):
  number only.
- **8.19 Bots Draw from the Pool** (was 8.18 "Bots Sail Decks"): `BOT_DECKS` and the boot-time
  `checkDeck` test are DELETED; a bot is seated through the same `addShip(hull, gun)` path as a
  human, its gun from an authored `BOT_GUNS` table `[DRAFT]`; `CONSUMABLE_TACTICS` and
  `EQUIPMENT_TACTICS` stay TOTAL over the narrowed ids; a `SHIFT_TACTICS` table, one rule per
  hull ability, bodies `[DRAFT]`; `spending.ts` weights lines, never mulligans by default, and
  provably buys equipment (the Story 7-5 bar stands); the harness drops the `--deck` arms and
  gains `--gun authored | random`, reports the gun mix, and re-cuts the bars: gun-mix win band
  replaces starter-vs-veteran, pure gunboat, heal-take rate, levels wasted; balance cycle 1's
  class numbers stay VOID; `ai/` still never imports `world.js`; no PV change.
- **8.20 Results LOADOUT and the Match Record** (was 8.19): the LOADOUT block leads with the
  mounted gun; `MatchRecord` is per participant hull, gun, cards drawn and taken with `T+`
  stamps, placement, kills — no "deck brought", no `pool`; "enemy decks shown to nobody" →
  "enemy draws shown to nobody".
- **8.21 How-to-Play and Copy Re-cut** (was 8.20): sections describe the pool draw (anything
  while a weapon slot is open, upgrades and consumables after), the gun pick, the three class
  Shifts and the class names; the UX-DR77 `DEFAULT` clause is deleted; still no glossary.

### 4.2 `epics.md` — Epic 9

- **Header:** eleven stories → ten; "named deck" language goes.
- **9.4 The Ship Screen** (was The Ship & Deck Screen): one DOM layer still replaces
  class-select; panes are class tiles and the collection grid; **the DECK COLUMN IS DELETED**;
  the Class Tile regains a **Shift ability line** and a **gun picker** (three chips, deck gun
  preselected) beneath the pips, and shows the class designation once named; the collection
  grid lists every line, every gun and every hull, lit when unlocked — all lit until the
  Default Set exists; the anonymous frame is the same layout with everything lit; CONFIRM
  SELECTION returns home with the chip reading class · gun. UX-DR61–66 need the designer's
  re-cut (§4.5).
- **9.5 Named Decks and the Pre-Queue Gate: DELETED.** The only pre-queue check left is "hull
  and gun unlocked", done at the door.
- **9.6 Tokens, XP and Unlocks** (was Per-Copy Unlocks): unlock surfaces are **lines** (a line
  into your pool, whole, not per copy), **guns** and **hulls**; one currency; prices
  `[DRAFT]`; the door checks hull and gun, the draw filters each participant's pool by their
  unlocks; **on day one everything is unlocked for everyone** (Eric 2026-09-21) — the story
  ships the machinery with every unlock granted, and the pared "Default Set" is a later CONFIG
  edit after playtest data; `matchesToCatalog` stays his open dial; the copies-rail
  PRESS-THEN-CONFIRM gesture stays for whatever is locked.
- **9.7 Match History:** "deck brought" → hull, gun, cards taken.
- **9.11 Design and Doc Reconciliation:** adds this proposal's GDD, catalog-v3,
  game-architecture and DESIGN.md corrections to its list.

### 4.3 `gdd.md` — minimal dated supersessions

- **Class table:** names → `[NAME PENDING — Eric 2026-09-21]`; the fantasy column re-cut to
  envelope + Shift; the L120 open note 22 closed as void.
- **Roster formula:** every class = hull envelope + fixed class `Shift` + the captain's gun
  pick; there is no deck.
- **Slot grammar:** item 1 = the mounted gun, picked pre-queue, universal to every hull; item
  3 stocks from the common pool; "never in the gun" → "the gun is the captain's pick; the draw
  is common to all".
- **Ladders:** each mountable gun has its own ladder, offered only while mounted.
- **Shift:** "The class Shift (Eric 2026-09-21)" — three abilities; boost at the shipped 25 s;
  the other two `[DRAFT]`.
- **Deck model v3 → THE COMMON POOL (2026-09-21):** no decks, no legality rules, no match pool;
  the open-slot rule with the guaranteed weapon; the full-slot rule; the tilt `[DRAFT]`;
  unlimited copies bounded by caps.
- **Consumables / match pool:** "a deck card" → "a pool card"; leaves-on-pick struck; the
  match-pool section marked retired.
- **Weapons:** starter table → Class | Shift | Gun pick; unhomed list struck; MISSILE and
  MONITOR rows deleted; MACHINE GUN and FLAK GUN move to a "Mountable guns" table beside the
  deck gun; HEAT SEEKING deleted; the "signals unruled" note closed by 8.15; MONITOR ±10 and
  MISSILE ±50 arcs struck.
- **New note:** future hulls (Submarine, Carrier) are envelope + Shift too, so submerging or
  launching planes never touches other ships (Eric 2026-09-21).

### 4.4 Ledgers and trackers

- `catalog-v3.md`: one status line prepended (superseded in part 2026-09-21).
- `epic-8-context-amendments.md`: **amendment 89** — every ruling from this run.
- `deferred-work.md`: a "2026-09-21 course correction" section listing the open threads.
- `sprint-status.yaml`: keys renamed; one-line stamp. `gds-workflow-status.yaml`: one-line
  stamp.

### 4.5 `DESIGN.md` — flags only (the design source is Eric's; no edits in this PR)

- UX-DR60–66: the Ship & Deck screen, deck card tile, copies rail and deck column need a re-cut
  for the Ship Screen (class tile gains a Shift line and a gun picker).
- UX-DR71 (pre-queue gate) and UX-DR75 (Journey C deck beats): void.
- UX-DR77 (the word DEFAULT): void.
- UX-DR50 icons: missile and monitor no longer owed; machine gun and flak gun glyphs are.
- UX-DR52 held-fire drain: stands.
- Recommendation: a `gds-ux` pass on these before 9.4 is drafted.

## Section 5 — Implementation Handoff

**Scope: Major.** Fundamental replan of the tail of Epic 8 and a third of Epic 9.

| Recipient | Responsibility |
|---|---|
| Eric (PM / designer) | The `[DRAFT]` and `[NAME PENDING]` cells: three class designations, `tilt.factor` / `tilt.floor` / copies-2+ rule, INSTANT RELOAD and DAMAGE CUT numbers, MACHINE GUN and FLAK GUN ladders, `BOT_GUNS`, the boost 20 s vs 25 s correction, the later Default Set. |
| Designer (`gds-ux`) | Re-cut UX-DR60–66, 71, 75, 77, 50 for the Ship Screen before 9.4 is drafted. |
| Architect (`gds-game-architecture`) | Ledger the deck-door removal and the `gun` seat field with the existing E8 deck amendment (`deferred-work.md` L1843) for 9.11. |
| Developer (`gds-create-story` → `gds-dev-story`) | Next story is **8.14 The Common Pool**, then **8.15**. Numbers land only after Eric fills the `[DRAFT]` cells a story needs. |

**Success criteria.** 8.14 lands with no deck code left and the four draw properties pinned;
8.15 lands with three mountable guns, three fixed Shifts, zero `STUB_ROWS`, six perception
exceptions and a measured stream `mz` cost; the GDD, catalog-v3 and epics agree with each other
on the day 9.11 runs.

## Open threads carried to `deferred-work.md`

1. Three class designations `[NAME PENDING]`.
2. `CONFIG.offer.tilt.factor` / `.floor`; whether copies 2+ tilt.
3. INSTANT RELOAD cooldown; DAMAGE CUT duration and cooldown.
4. MACHINE GUN and FLAK GUN ladders (steps and caps).
5. `BOT_GUNS` and `SHIFT_TACTICS` bodies.
6. Boost cooldown: GDD 20 s vs shipped 25 s — Eric confirms or re-rules in 8.15.
7. The Default Set (which lines / guns / hulls a new account starts with) — after playtest data.
8. DESIGN.md re-cut (§4.5).
9. `game-architecture.md` deck amendment (already ledgered) now also covers the `gun` seat.
