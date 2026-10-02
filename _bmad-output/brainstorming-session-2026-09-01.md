---
title: 'Game Brainstorming Session'
date: '2026-09-01'
author: 'Eric'
version: '1.0'
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
---

# Game Brainstorming Session

## Session Info

- **Date:** 2026-09-01
- **Facilitator:** Game Designer Agent
- **Participant:** Eric

---

## Brainstorming Approach

**Selected Mode:** Guided — facilitator walks through techniques one by one (party-mode revised)

**Opening question (John):** what does a HAND do that Tab doesn't?

**Technique Sequence:**

0. **Diff against 08-27** — the equipment-rework session (`brainstorming-session-2026-08-27.md`, on `development`) built tiered draws, merge, lock/sell/refresh, positional slots, tags, and the account metagame. State what this pitch KEEPS (tiered costs, tier-on-redraw, pool-as-filter, unlocks-gate-variety-never-power, accounts-before-the-traffic-push), what it SUPERSEDES (the merge mechanic #45, "hand size: prototype both" #9, the lock/sell/refresh storefront trio), and what it leaves UNTOUCHED (positional slots, tags, the unified combat clock).
1. **Player Fantasy Mining** — the rivalry fantasy: MY torpedo boat deck versus YOURS. Author, gambler, rival, collector?
2. **Moment Design** — the three plays a hand makes possible that a menu never could. This is THE UNWITNESSED BUILD's answer, or it is noise.
3. **Core Loop Design (two loops)** — in-match (draw → hold → play/spend → fight) and between-match (earn → unlock → build → bring), and every place they touch.
4. **Constraint Box + Flow Analysis** — Eric's four constraints verbatim (deck cap, hand cap, one draw per minute, tier-on-redraw), pushed hard; plus hand management under fire on number keys next to the helm and three weapon slots.
5. **Morphological Sweep (card taxonomy)** — tiered permanents × consumables × acquisitions × timed effects × reactions; who pays, when playable, what leaves the deck.
6. **Meta-Game Layer + Economy Thought Experiments** — meta currency, unlock pacing, default decks, the exploit hunt. Name the gate metrics early: cards-rotted-in-hand alongside levels-wasted-per-match. Indie's trenchcoat cut: which of login / persistence / unlocks / currency / deck editor does the MATCH need on day one?
7. **Emergence & Failure Check** — bad decks, dead hands, snowball, Intel-as-stealth-offense at deck-author scale.
8. **What If Scenarios** — stealable cards, spectator-visible hands, map-seeded cards, rival-authored draws.

**Techniques on standby:** Reference Blending (Clash Royale hand cycling, Hades boon contract, Battlegrounds economy, Vampire Survivors tiering), Social Dynamics Mapping, Reward Schedule Architecture.

**Focus Areas:**

- Accounts and persistence: what an account must hold for a per-ship deck to exist
- Deck construction: cap, default decks per hull, unlock/swap between matches
- The hand: 4–5 slots, one draw per minute on its own clock, number keys / click to play
- Card taxonomy: tiered permanent upgrades (tier-on-redraw retained), consumables, acquisitions
- Point cost: subsequent tiers / stronger cards cost more, and how that meets a hand
- Meta currency: earned automatically for playing, spent on unlocks
- Anti-snowball and fairness: the passive tick as floor; MY deck vs YOUR deck stays a contest of authorship, not grind
- What this replaces or keeps from the shipped 2.8 deck model AND the unlanded 08-27 rework

---

## Ideas Generated

Eighty ideas, grouped by system. Numbering is the order they arose in session. Eric's
rulings are marked **[ERIC]**; everything else is a proposal on the table.

### Structure — what the match keeps and what it gains

**[Structure #1]**: The Hand Is the Shop
_Core Loop_: A card lands in a hand every minute; levels are money; you buy cards out of the hand.
_Novelty_: The 08-27 storefront with the shelf on the HUD. **[ERIC] Rejected** in favour of #3.

**[Structure #2]**: Level-Up Offers From Your Own Deck
_Core Loop_: The shipped 2.8 flow unchanged; the four cards come from the deck the account authored for that hull.
_Novelty_: The whole feature lives between matches. **[ERIC] Adopted** as the base.

**[Structure #3]**: Four Consumable Slots, No Hand
_Core Loop_: Tab offer as shipped. A picked permanent fits; a picked consumable fills the next empty of four slots and waits on a key. Full slots grey consumables in the offer: use one or pick something else.
_Novelty_: One faucet, one clock. The 08-27 two-faucet problem dies here. **[ERIC] Adopted.**

**[Economy #4]**: One Level Buys Any Card
_Core Loop_: Every card costs one level, tiers included; the shipped XP curve and passive tick are untouched.
_Novelty_: Cost differentiation moves out of price and into scarcity. **[ERIC] Adopted.**

**[Controls #14]**: Slot Keys, Two Candidates
_Core Loop_: `1`–`4` with Tab closed (no collision; refit picks only while open) or `Z`–`V` with zoom rehomed.
_Novelty_: **[ERIC] Open** — "1-4 make sense, so do ZXCV… I'm open minded."

**[WhatIf #74]**: The Draw Pile Counter
_Core Loop_: A `23 LEFT` register on the HUD.
_Novelty_: The deck becomes a felt object mid-match. **[ERIC] Yes.**

### The Deck — composition, cap, exhaustion

**[Deck #5]**: Default Set Plus Custom Choices
_Core Loop_: A hull's deck is a fixed default set plus the player's fills.
_Novelty_: Superseded by #49 — the "default set" became the editable starter deck.

**[Deck #6]**: Consumables Recycle, Permanents Leave
_Core Loop_: Using a consumable returns it to the pool; permanents leave forever.
_Novelty_: Late offers become consumables by construction. **[ERIC] Not taken** — heals must be scarcer, not renewable.

**[Deck #7]**: Everything Leaves, Exhaustion Is Real
_Core Loop_: Consumables leave when picked, like permanents.
_Novelty_: A hard per-match heal cap falls out of copy count. **[ERIC] Effectively adopted** via #9/#13 (heal is a consumable that leaves on pick).

**[Deck #8]**: Discard Pile, Reshuffle On Empty
_Core Loop_: Used consumables go to a discard pile that reshuffles when the draw pile empties.
_Novelty_: Classic deckbuilder rhythm. **Not taken** — exhaustion is meant to be rare, not cycled.

**[Deck #11]**: Exhaustion Means Max Power
_Core Loop_: Cap the deck above a match's expected picks (~12–20) so a normal game never runs dry. An empty deck stays the pinned no-offer state.
_Novelty_: **[ERIC]** "achievable but rare, and it basically means you're at max power… ideally if you are gaining a level you've always got choices."

**[Deck #12]**: The Deck Is Yours to Count
_Core Loop_: A small authored deck means the player knows what's left; late offers are predictable to whoever built it.
_Novelty_: Deck-counting is a skill that only exists because the deck is small and personal.

**[Deck #24]**: Passing Is Saving
_Core Loop_: Unchosen cards shuffle back (shipped rule). In a small deck a pass is "I'll see you again."
_Novelty_: #12 makes the pass an informed one.

**[Deck #40]**: Copies ARE the Tier Ceiling
_Core Loop_: Under tier-on-redraw the number of copies of a line in the deck is the highest tier reachable. Three LIGHT TORPEDO cards = Tier III ceiling.
_Novelty_: The deck editor has exactly one verb: how many of this line. Depth vs width is the whole build decision. **[ERIC]** "only taking up to Tier III… might be a planned strategic choice."

**[Constraint #42]**: The Cap Is a Budget
_Core Loop_: With a 40 cap, five torpedo cards for Tier V or two each of six lines.
_Novelty_: Deep and wide are mutually exclusive without a rule.

**[Constraint #43]**: Does the Default Set Count Against the Cap?
_Core Loop_: Inside vs outside.
_Novelty_: **[ERIC] Moot** — "the max deck size is the max deck size" and nothing is required (#49).

**[Constraint #45]**: Rarity Weighting Dies
_Core Loop_: `drawOffer`'s rarity weighting is replaced by copy count: every card draws at equal weight.
_Novelty_: The deck is honest — what you put in is what you see. A rare is rare because you can own one.

**[Constraint #46]**: A Minimum Deck Size
_Core Loop_: MtG-style floor so a tiny deck can't be deterministic.
_Novelty_: **[ERIC]** "worth testing… in my mind right now the total deck size all-included is 40 cards."

**[Constraint #47]**: Four Slots Bound the Consumable Half
_Core Loop_: A consumable-heavy deck greys its own offers; slot pressure is the only consumable tax.
_Novelty_: Consumable builds are tempo builds.

**[Deck #48]**: Forty, All In
_Core Loop_: The deck is 40 cards total; every heal, tier and consumable is one of the forty.
_Novelty_: One number to explain and tune. **[ERIC] Working number.**

**[Deck #49]**: Nothing Is Required
_Core Loop_: The "default deck" is the starter deck handed for a hull, every card swappable. Zero heals is legal.
_Novelty_: No floor under a build; balance comes from catalog + cap. **[ERIC]** "I'm frankly not even sure I want the default set to be required."

**[Content #50]**: Choosing Has to Be a Real Choice
_Core Loop_: A 40-card deck must leave plenty on the table; the shipped 28 lines imply a pool of ~80–120.
_Novelty_: The content mandate hiding in the pitch. **[ERIC]** "there need to be enough cards to choose from that choosing is a real… choice."

### Healing

**[Healing #9]**: Heal Is a Card in the Default Set
_Core Loop_: The always-available `5` key goes away; DAMAGE CONTROL becomes N copies drawn like anything else.
_Novelty_: Scarcity by copy count, not price or timer. **[ERIC]** heal must be "more scarce than it is now."

**[Healing #10]**: Copies Are the Heal Dial
_Core Loop_: Heal copies per starter deck is the one balance knob; per hull.
_Novelty_: Reads straight off the harness's heal-take rate.

**[Healing #13]**: Stocked Heals
_Core Loop_: A heal card fills a consumable slot on pick and heals on use. Stock four if you like.
_Novelty_: The hoard is priced by opportunity cost (four levels, four copies), not by rule. **[ERIC] Adopted.** Passive per-level heal: **parked**, Eric has ideas, not this session.

### Spawn and the opening

**[Spawn #19]**: You Spawn With the Deck Gun and Nothing Else
_Core Loop_: Every hull leaves the ring holding the universal gun; Q/E/R empty.
_Novelty_: Class identity at 0:00 = hull + kinematics + silhouette (08-27 #29). The first minute is gun-only for everyone. **[ERIC] Adopted.**

**[Spawn #20]**: Level Zero
_Core Loop_: One level granted at match start; the first offer opens at 0:00.
_Novelty_: The deck's first statement. **[ERIC]** "something to try."

**[Spawn #21]**: One Card Pre-Equipped
_Core Loop_: Between matches, mark one deck card as fitted at spawn.
_Novelty_: The identity fork's "promise never misses" made deterministic. **[ERIC]** "something to try"; composes with #20.

**[WhatIf #77]**: The Opening Hand
_Core Loop_: Level zero, but the first offer is visible before the countdown ends and can be mulliganed once.
_Novelty_: A one-time luck smoother at the moment that matters most. **[ERIC] Liked.**

### Tiers and dead cards

**[Tiers #22]**: Tier I Is the Unlock
_Core Loop_: A weapon's Tier I card is the weapon at base stats; redraw the line for Tier II; Tier II cannot appear before Tier I.
_Novelty_: Acquisition and upgrade collapse into one line (08-27 #17), dead-upgrade case unconstructible. **[ERIC] Adopted.**

**[Tiers #23]**: Doctrine Ahead of Its Weapon
_Core Loop_: Draw PROP-FOULING with no mines; take it now and it waits, or pass.
_Novelty_: The only dead card left is a deliberate bet. **[ERIC]** "it's a choice."

### Fantasy and golden tests

**[Fantasy #15]**: Off-Meta and It Worked
_Core Loop_: Build what the hull wasn't "meant" for, win with it.
_Novelty_: **[ERIC]** "If I put some weird off-meta shit together and it worked, I bet that feels fucking great." The author who was right.

**[Deck #16]**: The Torpedo-less Torpedo Boat
_Core Loop_: Golden test one: a TB deck with no torpedo cards must be legal, buildable, viable.

**[Deck #17]**: Does the Deck Reach Back to the Spawn?
_Core Loop_: Resolved by #19: yes, the spawn is gun-only, so the deck owns everything after.

**[Deck #18]**: Subdecks Authored vs Following the Weapon
_Core Loop_: Resolved by #22: upgrades can't precede their Tier I, so there's nothing to guard.

**[Emergence #67]**: The Gunboat Deck
_Core Loop_: Golden test two: 40 cards, zero weapons — barrels, turret, cooldown, hull, speed, sweep, heals, consumables.
_Novelty_: The retired gunboat class returns as a deck. **[ERIC]** "This sounds funny and I like funny… upgrading the base gun is VERY powerful."

### Consumables — a parked pool, to be sorted later

**[ERIC]** categories wanted: Denial, Intel, Ordnance; Terrain "interesting, keep in mind." Sorting deferred.

- **[#25] SMOKE SCREEN** — the deferred equipment returns as a one-shot card.
- **[#26] JAMMER PULSE** — 10s of jamming-buoy fakes around your own return.
- **[#27] FOUL SHOT** — a no-damage round that kills boost and caps speed 8s.
- **[#28] BLACKOUT** — a sighted target's sweep paints nothing for 6s.
- **[#29] PING** — one instant full-circle paint at radar range.
- **[#30] FLARE** — a star shell without the launcher.
- **[#31] WAKE READER** — every wake in radar range paints at once.
- **[#32] BEARING** — a 3s chevron to the nearest enemy hull, no range.
- **[#33] ONE FISH** — a single torpedo from a hull with no tubes.
- **[#34] RAPID FIRE** — next three gun rounds ignore reload.
- **[#35] SCUTTLE MINE** — one mine, no rack.
- **[#36] BROADSIDE ORDER** — a single barrage from a hull without the broadside.
- **[#37] SQUALL** (terrain) — a 30s personal storm cell at the click.
- **[#38] SHOAL** (terrain) — a 20s sandbar that blocks shells and LOS; the wild card.

### Card kinds — rulings only

**[ERIC]**: Triggers (#51) probably not · Timed buffs (#52) maybe · Deck cards (#53) most likely no · Hull mods (#54) superfluous · Class-locked (#55) **NO** · Drawbacks (#56) maybe · Salvage (#57) no · Signals (#58) unknown. "Minutiae isn't relevant right now."

### Accounts and the metagame

**[Meta #39]**: Earn Is Account XP or Post-Match Currency, Scaled by Placement
_Core Loop_: Play, get paid; place better, get paid more. **[ERIC].**

**[Meta #41]**: It's a Deckbuilder
_Core Loop_: Hearthstone/Arena shape: collection left, deck right, count at the bottom. **[ERIC]** "It's probably a deckbuilder."

**[Meta #59]**: Accounts, the Argument
_Core Loop_: Unlocks in a browser cache aren't unlocks; an account makes the deck durable, and a durable deck is the retention hook.
_Novelty_: Retires 08-27 #47 (localStorage precursor) by ruling. **[ERIC].**

**[Meta #60]**: The Deck Never Travels Up the Wire
_Core Loop_: Client sends a deck id at join; the server loads the 40 from the account and validates against unlocks + catalog.
_Novelty_: The deck stops being untrusted input entirely. **[ERIC]** "Go big or go home."

**[Economy #61]**: The Fresh Account Must Be Able to Win
_Core Loop_: A harness bar: starter deck vs curated veteran deck, win rate within band.
_Novelty_: **[ERIC]** the starter is Legend-viable — "good enough… just not the most optimized deck for how I play, or the current meta."

**[Economy #62]**: Solo vs AI Pays, or It Farms
_Core Loop_: Pay solo at a reduced rate. **[ERIC]** "Probably, just not as much."

**[Meta #63]**: Bot Decks Are Ghost Decks
_Core Loop_: Bots sail anonymized real player decks. A living meta without a population.

**[Social #64]**: Deck Codes
_Core Loop_: Export/import strings. "Try MY deck." Also the fastest route to convergence.

**[Meta #79]**: Match History Is the Live Harness
_Core Loop_: The account keeps every match: deck brought, drawn, taken, placement, who sank you.
_Novelty_: **[ERIC]** "the only way to see how things are performing in live play." Aggregated, it's the meta dashboard.

**[Monetization #80]**: Deck Slots as the First Paid or Rewarded Thing
_Core Loop_: Slots cost nothing to grant, carry no power. **[ERIC]** "deck slots can be monetized/rewarded."

**[WhatIf #75]**: Multiple Decks Per Hull — **[ERIC]** "fine. Data is cheap."
**[WhatIf #76]**: Results Show the Deck You Died With — **[ERIC]** yes, and it must be in match history.
**[WhatIf #78]**: Enemy Deck Reveal on Death — **[ERIC]** open ("if it's in results I should see it in history. Or maybe not.").
**[WhatIf #73]**: Draft Mode — a random 40 from the whole catalog, no collection needed. **[ERIC]** "back pocket."
**[WhatIf #71]** The Deck Picks the Hull — **[ERIC] no.** **[WhatIf #72]** Deck names in the kill feed — **[ERIC] no.**

### Emergence and failure

**[Emergence #65]**: Distinct Lines Drive Variety, Copies Drive Depth
_Core Loop_: Four different lines per offer; a deep deck repeats its offers, a wide one barely does.
_Novelty_: A second meaning of deep vs wide: consistency vs surprise, by arithmetic.

**[Emergence #66]**: The Cap Is Not the Anti-Snowball
_Core Loop_: At 40 cards and 12–20 picks nobody reaches the ceiling; the passive tick stays the anti-snowball floor (identity fork). Corrects #44.

**[Constraint #44]**: Cap × One Level Is Max Power — true but loose; see #66.

**[Emergence #68]**: The Jammed Deck
_Core Loop_: Forty consumables, four slots — self-punishing, no rule needed.

**[Emergence #69]**: Meta Convergence
_Core Loop_: Counters are catalog breadth, the beatable meta deck, rotation/balance passes; measured as archetype win rates. **[ERIC]** "There's no avoiding it."

**[Emergence #70]**: Enemy Builds Stay Private, and the Wire Barely Moves
_Core Loop_: New wire is a deck id at join and consumable slot state on `OwnShip`; the account API is a separate surface.

---

## Themes and Patterns

1. **Collapse, again.** No hand, no second clock, no default set, no rarity weighting, one price, Tier I = the unlock. Every collapse removed a rule, and the 08-27 session's "unification instinct" theme holds a fourth time.
2. **Scarcity replaces pricing.** Heals, rares, tier ceilings are all bounded by *how many are in the deck*, never by cost. The deck is the whole economy.
3. **The content mandate is the real cost.** 40-card choice needs a pool three to four times the shipped catalog. Consumables are the cheapest breadth; the card-kind rulings narrow where else it can come from.
4. **Fairness rests where the identity fork put it.** The passive tick, a Legend-viable starter deck, and a harness bar that collection buys no wins.
5. **Off-meta is the fantasy.** Gun-only spawns, nothing required, copies-as-ceiling and two golden tests all serve one sentence: "weird shit that worked."
6. **The account exists for the deck.** Persistence and retention, server-held, never on the wire; match history is the harness for live play.

## Promising Combinations

- **#19 + #20/#21 + #77** — gun-only spawn, level zero, an optional pinned card, a mulligan-able opening hand: one opening beat that replaces the hull's fixed fit with the deck's first statement.
- **#9 + #13 + #40 + #48** — heal as a stockable consumable in a 40-card deck where copies are the ceiling: the heal economy, the tier economy and the deck cap are one mechanism.
- **#60 + #79 + #61** — server-held decks, match history, and the starter-vs-veteran harness bar: the account layer doubles as the balance instrument.
- **#3 + #22 + #23** — consumable slots, Tier I as the unlock, doctrine-ahead-of-weapon: the offer stays four cards and nothing in it is ever a trap.
- **#63 + #73** — ghost decks in Solo vs AI and a draft queue: two ways to play the community's decks without a population.

## Open Questions (for the forge / design gate)

- Slot keys: `1`–`4` vs `Z`–`V` (#14).
- Deck floor (#46), and whether 40 is right (#48) — Eric: "worth testing."
- Level zero vs pinned card vs both (#20/#21), and the mulligan's exact shape (#77).
- Heal copies per starter deck (#10); does the per-level passive heal survive (parked, Eric has ideas).
- Consumable pool sorting (#25–38) and which card kinds beyond the four (#51–58).
- Earn rate, placement curve, solo discount (#39/#62); what an unlock costs.
- Enemy deck reveal (#78).
- Bot decks: authored per profile, or ghost decks (#63)? Bot policy for consumables is a new verb with no owner (cf. 08-27 #50).
- Catalog breadth target (#50) — the content plan this implies.
- What the 08-27 rework's positional slots and tags do under this model (untouched, still open).

## Territory Deliberately Not Explored

Reference Blending, Social Dynamics Mapping, Reward Schedule Architecture (unlock pacing) were on standby and not used. The deck editor UX, card-face design for consumables, and bot consumable tactics are forge territory.

---

## Party Mode Review (roundtable, post-organization)

The game-dev bench reviewed the organized set. Findings and Eric's rulings:

1. **The soft pity died silently (Murat, #45):** equal per-card weight retires the 07-30 escalating-rare-weight ruling; one-copy doctrines become the rarest thing in the deck by construction. **[ERIC] Open, "can be played with."** Precedent he named: MTG Arena's opening-draw algorithm — a draw-smoothing rule with no physical analogue is acceptable here.
2. **Pinned class weapon by default (Samus, #21):** starter decks ship with the class weapon pinned so gun-only spawns keep the identity fork's promise. **[ERIC] "Something to play with"** — alongside a second candidate he raised: **[Spawn #81] Weighted Opening Draw** — weight level zero's draw so the first offer is guaranteed to contain equipment and consumables, rather than pinning a card.
3. **Release one is match-side, no accounts (Indie/John):** test the fun on the shipped 37-card hull decks before any store exists. **[ERIC] Declined — "go big or go home."** The account layer ships with the deck.
4. **Persist nothing until accounts exist (John):** the room believed the "accounts before the traffic push" deadline (08-27 #46) had passed at the 08-27 beta launch. **[ERIC] Corrected the room:** *"The traffic push deadline hasn't passed. I have still only soft-released it… I still can't put ads on it, and I need to plan for the long term."* The 08-27 event-deadline STANDS and is still ahead: accounts are on the critical path before the push.
5. **Bots need 40-card decks and a consumable policy** before the harness can measure anything (Link; Murat's homeless find #6). **[ERIC] Accepted, obvious.**
6. **Greyed consumables must not be inert (Sally):** **[ERIC]** candidate ruling — **[Consumables #82] No Slot, Instant Use**: a consumable picked with all four slots full is used immediately on selection instead of being greyed. "Idk" — to be played with, not ruled.
7. **Full slots are a server refusal, and slot state survives reconnect (Boundary):** **[ERIC] Not now** — implementation-level, belongs to the spec.
8. **Firing consumables ride the `Equipment` interface with one-shot pools; slots are `OwnShip` state like ammo (Cloud):** **[ERIC] "Sure?"** — accepted as the default seam, unopposed.
9. **Accounts rewrite the privacy policy** (John; Story 7-2's matrix says no accounts, email becomes held personal data): **[ERIC] Accepted, obvious.**
10. **The account store is a third deploy surface — the project's first database, auth and non-ops HTTP API** (Cloud): **[ERIC] Accepted, obvious** ("the database you mean").

Grumbal's line of record: *"The one thing that survives every session is Tab. That's your design. Tab."*

---

## Session Summary

### Most Promising Concepts

**Top Pick: The authored 40-card deck, where the deck IS the economy (#3, #4, #9, #13, #22, #40, #48, #49)**
One per hull, 40 cards all-in, nothing required, one level per card, copies are the tier
ceiling, Tier I is the unlock, heal is a scarce stockable consumable, and four consumable
slots replace the hand Eric walked in with. Every price, cap, pity and floor the 08-27
storefront needed is answered by *how many of a thing you put in the deck*. The shipped
Tab offer is untouched — "the one thing that survives every session is Tab."

**Runner-up: Gun-only spawn and the opening hand (#19, #20, #21, #77, #81)**
Every hull leaves the ring holding the deck gun; the deck's first statement is a
level-zero offer, mulligan-able once, with either a pinned class weapon or a weighted
first draw keeping the identity fork's promise. This is what makes the torpedo-less
Torpedo Boat (#16) and the gunboat deck (#67) buildable at all — the two golden tests.

**Honorable Mention: Accounts because the deck is the reason (#59, #60, #61, #79)**
The deck lives server-side and never rides up the wire; a Legend-viable starter deck is a
pinned harness bar; match history is the live-play harness. "Go big or go home" — the
account ships with the deck, and the 08-27 "accounts before the traffic push" deadline
still stands because the push has not happened.

### Key Insights

- Eric collapsed mechanisms all session (no hand, no second clock, no default set, no
  rarity weighting, one price); every collapse deleted a rule, and one deletion (#45)
  silently retired the 07-30 soft-pity ruling — now open.
- Scarcity replaces pricing everywhere. The deck cap is NOT the anti-snowball (#66); the
  passive tick still is.
- The content mandate is the real cost: a 40-card choice needs a pool three to four
  times the shipped 28 lines, and Eric's card-kind rulings narrow where breadth can come
  from — consumables are the cheapest.
- "Off-meta and it worked" is the fantasy; gun-only spawns, nothing required and
  copies-as-ceiling all serve that one sentence.
- Bots need 40-card decks and a consumable policy before the harness can measure any of
  this (homeless find #6); accounts rewrite the privacy policy and add the project's first
  database — all "no shit," all on the path.

### Recommended Next Steps

1. **Forge / spec the deck model v3 as ONE unit** (Eric: "go big or go home"): accounts +
   server-held decks + deck editor + gun-only spawn + opening hand + consumable slots +
   heal-as-card + Tier-I-as-unlock, with the open-questions list above as its agenda.
   This is the "new epic set" the epic-7 retro named as the next phase — route through
   `gds-gdd` (update) and `gds-create-epics-and-stories`.
2. **Sort the content**: the parked consumable pool (#25–38), the card-kind maybes
   (timed buffs, drawbacks), and a catalog-breadth target (#50) — an Eric-authored
   document like `7-5-decks.md`, since a card catalog is his to write.
3. **Instrument before costing**: bot decks + consumable policy, then harness bars for
   starter-vs-veteran (#61), pity/one-copy appearance rate (#45), heal-take rate (#10),
   and the two golden tests (#16, #67).
4. **Housekeeping**: the 08-27 equipment-rework session is on `development` (commit
   `dcbd151`) but not yet on `main`; it reaches production with the next
   `development` → `main` merge. Nothing to do beyond not branching from `main`.

---

## Session Complete

**Date:** 2026-09-01 (closed 2026-09-02)
**Duration:** Brainstorming session
**Participant:** Eric
**Facilitator:** Game Designer Agent (guided, party-revised: diff against 08-27 → Fantasy Mining → Moment Design → Core Loops → Constraint Box → card taxonomy → Meta/Economy → Emergence & Failure → What If → Party Mode review)

### Output

This brainstorming session generated:

- 82 raw ideas
- 5 developed concept clusters
- 6 emerging themes
- 10 bench findings with Eric rulings

### Document Status

Status: Complete
Steps Completed: [1, 2, 3, 4]
