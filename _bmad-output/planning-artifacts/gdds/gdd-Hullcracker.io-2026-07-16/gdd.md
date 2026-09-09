---
title: Hullcracker.io - Game Design Document
game_type: shooter
platforms: [desktop-browser]
created: 2026-07-16
updated: 2026-09-09
---

# Hullcracker.io - Game Design Document

**Author:** Eric
**Game Type:** Shooter (top-down naval battle royale)
**Target Platform(s):** Desktop browser (keyboard + mouse)

---

## Executive Summary

### Core Concept

You are a lone captain hunting — and being hunted — with imperfect senses, on an ocean that keeps getting smaller.

A real-time naval battle royale in the browser — Battleship's hidden-information DNA with World of Warships' feel and none of its weight. **Twenty captains, one ocean, last hull afloat wins.** One short match, start to finish inside about fifteen minutes — no install, no account required, nothing to grind for power. Emotional contract: **Frantic to Play, Light to Hold**. Sign in (OAuth only) and you keep things between matches — your decks, your unlocks, your match history — but signing in never changes what you can do inside a match. North star: midway between Battleship and World of Warships.

### Target Audience

- **Primary:** browser multiplayer players (the agar.io / openfront.io demographic), 5–15 minute sessions, allergic to installs, accounts, and grind. Design compass is 16–35. The game is **self-published at `https://hullcracker.io/`** and monetized with its own ad units — there is no portal audience and no portal gatekeeper (Eric ruling 2026-08-21: *"I'm controlling my game and servers. no portals. I'm serving my own ads."*). Performance is still a distribution feature: the ratified reference device is Eric's MacBook Pro 16,1 (2019) / Intel Core i7-9750H (epic-7 amendment 1), at the 1366×768 viewport floor.
- **Secondary:** World of Warships refugees — players who love the gunnery feel but resent the grind, carriers, submarines, and spotting controversies.

### Unique Selling Points (USPs)

1. The only naval battle royale in the browser.
2. The only browser game whose core loop is sensor deduction — two-tier fog of war (truesight + rotating radar sweep) makes information the primary resource.
3. **Paint, Not Power** — a structural, not policy, no-pay-to-win guarantee: detection is math, so cosmetics are structurally incapable of being pay-to-win. Account unlocks are **variety, never power** — a starter deck is authored to be viable against a veteran's, and the batch-sim harness pins that band.
4. A match-identity system (**promise + growth**) no .io competitor attempts: your lobby pick is a hull and a deck of your own, and your build grows by drawing from that deck through XP levels — a passive tick everyone earns, accelerated by kills — during the match.

---

## Goals and Context

### Project Goals

- Ship a public beta **self-published at `https://hullcracker.io/`**, ads-first on its own ad units, with near-zero budget. (Portal distribution is off the table — Eric ruling 2026-08-21.)
- Solo developer (30-year engineer) plus AI agents; scope discipline is the survival constraint.
- Passion-project pace; LAUNCH_PLAN.md is the delivery source of truth.

### Background and Rationale

A running build exists — v0.17.132 as of 2026-08-28 (TypeScript monorepo: authoritative 20Hz server, client prediction, two-tier fog of war, three ship classes, real firing arcs, phased storm, 5,000+ automated tests). *(It was v0.16.0 with 649 tests when this GDD was first written.)* This GDD consolidates the game brief (2026-07-15), the identity-fork forge resolution, and the brainstorming sessions (2026-07-15; supplemental classes/weapons/upgrades session 2026-07-19, including its same-day party-mode review rulings) into the canonical design document for the beta. **The 2026-09-03 update folds in THE DECK MODEL v3** — the metagame brainstorm of 2026-09-01 (82 ideas, diffed against the 2026-08-27 equipment-rework session) hardened by the `deck-model-v3` forge (`_bmad-output/forge/deck-model-v3/forged-idea.md`), which Eric ruled ships as **one unit**: accounts, authored per-hull decks, consumable slots, heal-as-card, and gun-only spawns (gun-and-Shift since catalog v3). **The 2026-09-09 update folds in CATALOG v3** — Eric's authored card catalog (`catalog-v3.md`, alongside this document): the 2026-09-04 brainstorm that mined the lines from real naval weapons, then his spreadsheet walked line by line on 2026-09-09 — **29 lines / 114 cards, three 40-card starter decks, and the match consumable pool**. The same update records the 2026-09-04 session's structural rulings that the catalog does not carry (the Shift boost, wake drafting, shoot-any-spotted-mine).

Comparables: Mk48.io (closest, maintenance mode), Maelstrom (validated the fantasy, died anyway), Drednot.io, Ships 3D. Reference DNA: Battleship (hidden info), World of Warships (class fantasy, gunnery feel), Hades (promise/RNG contract), Risk of Rain (stackable upgrades, named thresholds), Apex Legends (kits as verb focus, not exclusivity), surviv.io/ZombsRoyale/OpenFront.io (top-down BR structure).

References of the form **#NN** throughout this document cite idea numbers in the brainstorming session (`_bmad-output/brainstorming-session-2026-07-15.md`). Decisions marked **2026-07-19** come from the supplemental session and its party-mode addendum (`_bmad-output/brainstorming-session-2026-07-19.md`). Passages marked **v3** carry the deck model v3 rulings (the 2026-09-01 metagame session and its forge of 2026-09-02); a **#NN** reference inside a v3 passage cites the 2026-09-01 session's numbering. Passages marked **catalog v3** carry the 2026-09-09 catalog walkthrough, and **R-numbers** (`R1`…`R44`) cite its rulings log (`catalog-v3.md` §3); its per-line stat sheets (§4) are the build reference for every tier number, and this document carries what each line IS, its tier I, and its cap. Carry-over of a shipped value is never assumed for any line — Eric: *"We need to go line by line so I can share my intent."* Two arithmetic slips in the catalog's §1 are corrected here rather than repeated: its total is **114** cards (its own components, 55 + 22 + 7 + 5 + 25), not 111; and the Battleship starter carries **two** add-ons, not one.

---

## Core Gameplay

### Game Pillars

Every design argument in this document — and downstream in architecture, epics, and balance — gets settled against these four pillars.

**1. Hunting with Imperfect Senses**
Information is the primary resource. Every contact is a deduction from partial sensor data — the truesight bubble, the rotating radar sweep, decaying phosphor blips. The player is never fully informed, and neither is the enemy.
*Steers:* sensor and weapon design (everything either feeds or reads the information game), HUD/UI, the server-side perception boundary, counter-intel features ("lies must live on the server"). A feature that neither produces nor consumes imperfect information must justify itself.

**2. Frantic to Play, Light to Hold**
Real-time gunnery with genuine feel — the World of Warships DNA — inside a package with zero meta-weight: no install, no account required, nothing to grind for power, one complete match inside fifteen minutes. *(v3: an account exists only to KEEP things — decks, unlocks, history. It never changes what a captain can do inside a match, and the anonymous player sails the same starter decks under the same rules.)*
*Steers:* scope discipline, onboarding (playable within seconds of page load), low-end hardware performance as a distribution feature, the Paint-Not-Power monetization guarantee, and the account posture (two states, no guest tier, nothing stored for the anonymous player).

**3. Promise + Growth**
The lobby pick is a genuine promise: a hull, and a deck you built — and **something to DO at 0:00**, not a skin over sameness. XP levels — a passive tick everyone earns, accelerated by kills — draw from that deck and grow the promise into a build that is *yours* by the endgame. RNG only governs what was never promised (the Hades contract): the deck's composition is promised, the order it arrives in is not — and the match consumable pool (catalog v3) is a promised *quantity* of unpromised consumables, ten of them, identical for every captain on the water, so it moves nothing the promise covers. *(v3 re-anchored the promise. It used to be "you hold your class weapon at 0:00"; every hull now spawns with the deck gun and the universal Shift boost only, and the promise is the deck itself — Eric: "If I put some weird off-meta shit together and it worked, I bet that feels fucking great.")*
*Steers:* class design (class = hull envelope + starter-deck tilt; the catalog is hull-agnostic and nothing is class-locked), the deck and its draw rule, upgrade stacking as copy counts, anti-snowball tuning.

**4. The Ocean Keeps Getting Smaller**
The storm closes in legible phases, forcing every hunt to a conclusion. The Endgame Guarantee — a final ring two truesight diameters across — forces combat while keeping the sensor game alive to the last shot. No match ends in mutual avoidance.
*Steers:* zone timeline and pacing, endgame tuning, the Rat Covenant (hiding is legal but priced). *(Roster-scaled map sizing was proposed and **cancelled** — epic-6 amendment 11: the ocean is one fixed radius for every roster.)*

**Pillar guardrails** (carried from the brief):

1. **Information noise must never bury the hunt** — sensor features may not drown the chase-and-shoot game in indicators.
2. **When deduction stops paying, fix it on the sensing side** — never with stat band-aids.
3. **Arcade feel is the prime directive** (2026-07-19 session law, restated by Eric 2026-09-04: *"deliberately more arcadey than World of Warships"*) — the complexity budget is precious; no ambient-simulation mechanics (funnel smoke, oil slicks, fire damage states, wreck salvage stay rejected as simulation creep).

### Core Gameplay Loop

One cycle, run continuously from spawn to sinking:

1. **Sail / sense** — work throttle and helm while the truesight bubble and radar sweep feed fragments of the ocean. *(Pillars 1, 4 — the storm dictates where sailing is viable)*
2. **Deduce / position** — turn blips, flashes, and silence into a mental picture; maneuver for the engagement you want. *(Pillar 1)*
3. **Strike** — commit the weapons your deck has dealt you, within their real firing arcs, and spend the consumables you stocked. The slot grammar is universal; the contents are not — you strike with what you built and what you've drawn. *(Pillars 2, 3)*
4. **Survive the reply** — striking reveals you; helm through the answer. *(Pillars 1, 2)*
5. **Grow** — XP levels (passive tick plus kill bonuses) each draw four cards from your deck — the 40 you authored plus the match's 10 hidden consumables; take one to deepen your promise. *(Pillar 3)*

…while **the storm closes in legible phases**, shrinking the water the whole loop happens on — the loop's clock. *(Pillar 4)*

**Why it replays:** it is fun — a quick-to-play battle royale with a decent amount of depth. Matches are short enough that starting another is a small decision — you return to port and set sail again — and deep enough — sensor deduction, promise + growth builds, class matchups — that no two runs play the same. Moments like threading a torpedo through terrain or helming the one survivable path out of a converging spread are emergent highs the systems make possible, not scripted content.

As in any battle royale, matches naturally converge from a long hunt to a forced final showdown; the Endgame Guarantee (Pillar 4) embraces that convergence rather than fighting it.

### Win/Loss Conditions

- **Win: last match participant afloat.** That is the whole win condition, in every mode. A *participant* is any captain-role hull — a human captain, or (in Solo vs AI) an AI captain, which means **an AI captain can legitimately win a match**. Roving PvE fleet hulls are never participants: they can never win, and they never need to be destroyed to claim the win.
- **Loss:** your hull reaches zero. Damage sources: enemy weapons and the storm.
- **Sinking — go down shooting.** Reaching zero HP doesn't remove you immediately: you get a short sinking window (~5 s, tunable) in which the hull gradually slows to a stop — a ritardando, not a cut — and your guns stay live. Maybe you take your attacker with you.
- **After the water closes:** the omniscient reveal — dying means finally seeing everything — as the backdrop to the results screen, whose two actions are SPECTATE and RETURN TO PORT *(v3: results also show the deck you brought, drew and took — your own, never an enemy's)*. Death is cheap by design (Pillar 2), but **there is no instant re-queue: you always return to the home screen to start another match** (Eric ruling, epic-5 amendment 30 — *"You MUST return to the home screen to requeue. MUST."*).

---

## Game Mechanics

### Primary Mechanics

> Numbers in this document are **design targets or current-prototype reference values, explicitly tunable** — the prototype's CONFIG values were playtest handwaves and carry no authority. Where a value is settled design intent, it is stated as such.

**Ship classes — the promise (Pillar 3).** The lobby pick is your class, and the class is a hull plus a deck: a complete playstyle and power fantasy, not a hull-size variant. **Three classes at beta** (re-scoped 2026-07-19: the gunboat is cut; prove the concept in front of players first, then expand). *(v3: the fantasies below are what each hull's STARTER DECK is authored to deliver — a Torpedo Boat starter is torpedo-heavy — not a fixed fit; a signed-in captain may build any of them differently.)*

| Class | Power fantasy |
|---|---|
| **Torpedo Boat** | Fast, fragile, the needle-threader: torpedo skill-shots through terrain, orbiting bigger ships, winning on audacity. |
| **Battleship** | Massive, heavily armored, main-battery gunnery: dominates the open ocean by weight of shot. *(The 2026-08-19 broadside rework moved the fantasy off "outranges everyone" — its battery is the only weapon in the game that does not reach the full radar horizon — and onto "turn your beam to it and it deletes you.")* [NOTE FOR DESIGNER: catalog v3's Battleship starter is HORIZONTAL MISSILE · MONITOR GUN · STAR SHELLS — long-range indirect fire — and the BROADSIDE GUN is an unlock, so the beam-on fantasy this cell describes is now an unlock-tier build; whether the fantasy text moves to missiles-and-monitor or the broadside returns to the starter is Eric's — open note 22.] |
| **Mine Layer** | The trapper: area denial, reading where prey will flee and having already been there — "you died to a decision I made ninety seconds ago." |

**The roster formula (ratified 2026-07-19, re-cut by v3):** every class = a **hull envelope** (size, speed, toughness, turning) + **a deck**, on top of the shared deck gun. The 2026-07-19 form — envelope + one signature ability on cooldown + (sometimes) one signature weapon — survived as the SHAPE of each hull's starter deck through 2026-09-03; **Eric retired the term on 2026-09-04** (*"'signature abilities' are not a concept — starter decks are built to a fantasy and the player builds anything"*), and catalog v3's starters are exactly that: three equipment lines, one or two add-ons and a ladder tilt authored to the hull's fantasy. A deck belongs to a hull as a **label**, never as a lock. Nobody counters a class; everybody plays around what a deck can deal. Quality bar: **six great classes beat eight half-assed ones** — the beta ships three great ones. Hull envelopes differentiate feel; decks differentiate playstyle.

**First-run class select (ruled 2026-07-19):** three cards, forced meaningful choice, **no pushed default**; the Torpedo Boat sits pre-focused for keyboard flow.

**Deferred classes:** the six-class expansion blueprint (Submarine first, then Carrier; Decoy Ship banked) lives in Out of Scope — deferred, not designed-in.

**Slot grammar (universal; contents from the deck) — v3.** Every ship fits:

1. **The deck gun** — universal and slotless: every hull carries the **same standard gun** (the "standard gun" / "universal gun" of every earlier passage), working the same way, from 0:00. Short cooldown, basic damage, available to use most of the time. It and the **Shift boost** (a universal ability on every hull, not a card — catalog v3 R7; see Movement) are all anyone holds at spawn.
2. **Three generic weapon slots** (`Q` / `E` / `R`) — **empty at 0:00** and filled by the deck: taking the first copy of a weapon's line fits that weapon into an open weapon slot. Slots are generic — there are no positional mounts and no per-slot arcs (parked; Eric: *"I don't think we'll need the mechanic"*) — and each weapon carries **one fixed firing arc** of its own. A deck may carry **at most three lines that fit an equipment slot** (Eric ruling 2026-09-03), so three slots can never overflow and there is no "replace which" flow at all — and no hand, no swap-out, no sell-back. *(The match consumable pool adds only consumables, never equipment, so it cannot break this — R4.)* Two laws carried from the equipment forge: **swap cheese is a NEVER** — fitting or replacing a weapon may never yield more shots than leaving it alone — and **the slot keeps its clock across replacement**, so a fresh weapon never skips the reload of the one it replaced (the 2026-08-27 session's ~5 s ready floor is the carried draft figure, not a ruling).
3. **Four consumable slots** (`1`–`4` with the refit window closed) — stocked from the deck (your 40 authored cards plus the match's hidden pool of 10), spent by key. See Consumables below.

Class differentiation lives in the hull envelope and the deck's composition — never in the gun.

*(Superseded by v3: the 2026-07-16 grammar of "two special abilities fitted at 0:00 + one extra slot filled by an acquisition card". Weapons are now deck lines like everything else, and the acquisition card is gone — copy 1 of a weapon's ladder IS the weapon.)*

**Movement — telegraph and helm.** Set-and-forget engine orders (9-detent telegraph) plus rudder; ships have separate acceleration and braking rates, and rudder authority reduces below steerage speed. Kinematics are per-class envelope values (current reference across the three hulls: max speeds 35–45 u/s, turn rates 0.4–0.8 rad/s — all tunable; the ladders below raise the caps to 45–55 u/s and 0.6–1.0 rad/s).

**Universal ladders — catalog v3 (R6, R8, R10–R12).** Five ladders any deck may run, every step additive per tier: **ARMOR** (+25 max hp, heals on grant; cap 4 → TB 350 / ML 400 / BS 450), **SPEED** (+2.5 u/s forward max, reverse untouched; cap 4 → TB 55 / ML 50 / BS 45), **TURNING** (new — +0.05 rad/s **flat**, so it helps the slow hulls most; cap 4 → TB 1.0 / ML 0.8 / BS 0.6; [DRAFT] until the harness runs), **RADAR SWEEP** (+3 rpm; cap 5 → 30 rpm, the clamp stays), and **RELOAD** (−5% on every equipment reload *and* the Shift boost's cooldown; cap 5 → 75% — it was −10% per card to 50%). **The equipment reload step (Eric's standing rule):** every equipment line also steps −5% on its *own* reload per tier, composed *before* the global ladder, so a maxed weapon under a maxed RELOAD runs at 0.80 × 0.75 = **60%** of base.

**The Shift boost — a universal ability, not a card (Eric, 2026-09-04; numbers 2026-09-09, R7/R9).** Every hull has a speed boost on `Shift`: **+25% of the hull's max speed for 10 s on a 20 s cooldown** (boosted TB 56.25 / ML 50 / BS 43.75 u/s — hull-scaled, so the class ordering holds under boost; 15 s cooldown under a maxed RELOAD ladder). It was the Torpedo Boat's signature equipment (+10 u/s flat, 6 s, 18 s); it leaves the equipment list entirely and no card touches it — the 2026-09-04 session's HYDROFOIL BOOST LADDER never reached the sheet (R1). [DRAFT: the boost numbers are first-pass and harness-tuned.] A second universal ability (the anchor) is a maybe, unruled.

**Wake drafting — a base rule (Eric, 2026-09-04).** Riding inside another ship's wake gives a small speed lift — any hull's wake, magnitude *semi-realistic* [DRAFT — the facilitator's "a few percent" is a placeholder, not a number; Eric sets the lift and its radius]; it rewards the tailing torpedo boats already do. Wake trails merge but both hull echoes stay on the scope, so it is not a hide mechanic. Eric: *"Interesting! I like that, we can fuck with that a bit."* No card carries it. It is a per-tick kinematics change, so it must live in the shared simulation both sides run — architecture owns the desync risk (`gds-game-architecture`).

**Universal sensor suite (Pillar 1).** Two senses ship on every hull: a **truesight bubble** (live, LOS-clear contacts; reference 330 u) and a **rotating radar sweep** (reference 660 u, one revolution every 4 s) that paints decaying phosphor returns when the beam crosses a ship it can reach. Islands block both — truesight as a hard silhouette, radar through the height-aware shadow model below (Eric's realism ruling of 2026-08-02: islands block *every* sensor, at every range).

**Hydrophones — DEFERRED.** The passive listening ring (bearing-grade audio detection of engines and torpedoes in the water) is **not built**, and the 2026-07-19 "core kit on every hull, never equipment" framing no longer stands as a design law — Eric, 2026-08-21: *"very deferred. sonar might come back in the future, but radar is plenty deep enough."* The shipped bearing surface is the **foghorn chevron**: a sounded horn reaches listeners across the map, and the hearer's HUD draws a chevron on its bearing with a coarse distance band. There is no listening ring and no passive engine-noise sensor.

**Radar returns carry no identity — this supersedes the 2026-07-16 "class-legible blips" ruling.** The pose-on-the-wire *silhouette* grammar was built, tried and **retired**. A return is a coverage footprint painted onto a world-anchored radar lattice: no class, no speed, no heading, no ship id. What it does encode is physics — return strength against range (a near contact reads hot, a far one cold) and the shape the beam actually saw. Reading a contact's course is the player's job: you infer it from successive paints and from its **wake**, never from a label. Projectiles materialize at the sight boundary with no range-derivable fields. Counter-intel law: **lies must live on the server** — deceptions must be indistinguishable on the wire. The live case is **CHAFF** (catalog v3 R39/R41): a consumable that bursts at your own position and seeds server-generated false returns around you, wire-identical to real ones. *(It inherits the machinery of the radar buoy's JAMMING doctrine, which is deleted with the buoy — R1.)*

**The eighths ladder — one ruler for every sensor boundary.** Intel range is a single number, and each boundary is a named eighth of it: **3/8 detect** (where mines and torpedoes become visible), **4/8 truesight**, **5/8 muzzle-flash and wounded-smoke carry**, **7/8 far radar** (where a return reads cold rather than hot), **8/8 radar**. The ladder is **frozen at base for every captain in every match** — no card widens it (the range-upgrade line was deleted, 2026-08-20) — so all five rungs are the same numbers for everyone, all match. Catalog v3 keeps it frozen: RADAR SWEEP raises the beam's *rate*, never its reach; DAZZLE halves an enemy's sight inside a lit zone and SMOKE blocks sight along a segment — modifiers on what a rung sees, never on where a rung sits.

**Islands cast real radar shadows.** Terrain is a height field, not a flat silhouette, and occlusion is height-aware. A low island no longer hides a distant ship outright; a real island reliably breaks a lock; and the scope paints a mountainside *up to its peak* on the side facing you, precisely because you look up at it. Once a bearing is blocked it stays blocked out to the rim — a shadow is a residual reach, never a dark band with clear water behind it.

**Ships leave wakes on the scope.** Disturbed water is world state and paints as a fading ribbon behind every moving hull — including torpedoes, whose fish itself is still never painted. A wake outlives its ship, so a sunk hull leaves a track pointing back the way it came. The fastest hull's full-ahead track is exactly the 3/8 detect rung: your wake reaches as far behind you as detect reaches around you.

**Upgrade economy (Pillar 3).** XP-based leveling: a slow passive XP tick (design target ~1 level per minute) **plus** kill bonuses. Each level opens the refit window (`Tab`) on a **pre-drawn offer of 4 different card lines from your own deck** — your 40 authored cards plus the match's pool of 10 (drawn at earn-time; reopening the window never rerolls — ratified at 4 choices during the UX phase, 2026-07-16). One level buys any one card. The passive tick is the anti-snowball floor — everyone grows; kills grow you faster. Kill-bonus sizing is an open balance item (see Progression and Balance). **The Tab offer is untouched by v3** (Eric's first lock): no hand, no second clock, no storefront — merge, lock, sell and refresh are all dead.

**THE DECK MODEL v3 — supersedes the 2026-07-30 personal-deck model.** A captain brings a **deck of exactly 40 cards, authored for one hull**; at queue the server shuffles in **the match consumable pool** — the same 10 hidden consumables for every captain — and every level draws from the **50** that result (see The match consumable pool, below). *(40 is the AUTHORED size, final for launch — Eric, 2026-09-03; the forge's 25–40 band test is dropped. The size stays a CONFIG dial with nothing testing it now.)* What replaced what:

- **The catalog is hull-agnostic and nothing is class-locked** (Eric: *"NO"*). A deck belongs to one hull as a **label** only. Class tilt lives in **starter-deck composition** and in an author's copy counts — never in the draw.
- **Card model (A).** A weapon is **one ladder line**: copy 1 *is* the weapon at base (it fills a weapon slot — **tier I is the bare weapon**, Eric's standing rule), and the remaining copies are **authored tier bundles** for that weapon (a 5-copy equipment line has four steps, II–V). Separate **one-copy add-ons** (a doctrine verb such as ACOUSTIC HOMING or FOULING MINES) are drawable at any time and can be **held ahead of the weapon** they modify (Eric: *"it's a choice"*). Universal lines (ARMOR, SPEED, TURNING, RADAR SWEEP, RELOAD, and the deck gun's own DECK GUN / TURRET / BARREL) are ladders on the same rule, each at its own cap (4 / 4 / 4 / 5 / 5 / 4 / 1 / 2) — and because the deck gun is always fitted, the DECK GUN line's tier I is a real step, not the weapon (R14). **Copies = tier ceiling**: how many copies you put in the deck is the highest tier you can reach — a deliberately capped line is a build decision, not a shortfall. Add-ons target a weapon **family** — ACOUSTIC HOMING on Light *and* Heavy torpedoes, never the Supercavitating (R22); multi-copy add-ons are possible later. *(The catalog's contents are Eric's authored document, `catalog-v3.md` (2026-09-09): **29 lines / 114 cards** — 11 equipment lines, 5 universal ladders, 3 deck-gun lines, 5 add-ons, 5 consumables. This GDD carries what each line IS, its tier I and its cap; every intermediate tier number lives there.)*
- **Draw rule: equal weight per card.** No rarity weighting, no class weighting, **no pity** — the 2026-07-30 soft pity is retired. *Deck size is the pity, composition is the tilt* — measured by the forge against a 14-line, 40-card deck: a one-copy line is offered at least once in 66% of 8-pick matches, 82% at 12, 90% at 15 and 97% at 20 (against 55–60% in the 60-card decks that bought the 2026-07-30 pity). **Those figures are stale (R4):** they were measured at 40 cards and the deck at queue is now 50, so the harness re-measures them before they are cited again. The harness pins the live one-copy appearance rate. The only smoothing anywhere in the game is the level-zero opening draw (see The opening, under Player Progression).
- **A card leaves the deck when it is taken** — a consumable on pick, a ladder copy when fitted — so a build's ceiling is something a player can count. **Exhaustion is legal but should be rare** and means you are at maximum power (Eric: *"ideally if you are gaining a level you've always got choices"*). The HUD carries a **draw-pile counter** (`23 LEFT`, counting down from 50) — Eric: *"Yes."* Deck state is server-private — the match pool's composition is a server secret nobody sees — and only the four drawn ids ride the wire.
- **Legal deck** — checked by the server once, when you queue, and **frozen at queue** (later edits apply to the next match). **Exactly two composition rules** (Eric ruling 2026-09-03: *"the only rules we enforce on deck construction"*): **exactly 40 authored cards** (final for launch; the size stays a CONFIG dial — the match pool is added by the server *after* this check and is never the author's to build), and **no more than three lines whose copy 1 fits an equipment slot**. Nothing else is required — a gunboat deck (nothing but gun ladders) and a zero-heal deck are both legal by design (Eric: *"I'm frankly not even sure I want the default set to be required"*). Ownership bounds what can go in at all: every card must be unlocked on the account, and a line has only as many copies as exist (its catalog cap: 5 for an equipment line, 4 or 5 for a universal ladder, 1 for an add-on, 4 / 1 / 2 for the deck gun's own DECK GUN / TURRET / BARREL, and for a consumable **the copy count authored on that card in the catalog** — 5 for every launch consumable; Eric rulings 2026-09-03 and 2026-09-09; no deck-level consumable cap). **Starter decks are ordinary decks** that pass the same rules against a fresh account's unlocks — catalog v3's three starters each run exactly three equipment lines and sum to 40.

Upgrade *content* follows the **Hades-hammer model** (Eric's model, captured 2026-07-19): most cards raise stats, but some **fundamentally change how a piece of equipment behaves** — same slot, different verb. Under v3 the split reads: **a ladder carries the weapon and its authored tier bundles; add-ons are the nature-changers.** Rarity is no longer a draw weight of any kind — the old "commons / rares" reading is retired with it. Add-ons (doctrines) are independent added verbs and stack — a star-shell build can run PHOSPHOR *and* DAZZLE on one flare (R33); exclusivity is gone from the game entirely. *(Catalog v3 promotes CAPTIVE MINES from a doctrine to its own equipment line, and FOULING MINES applies to Naval Mines only — R25/R28 — so the old CAPTIVE + PROP-FOULING pairing is gone. The five launch add-ons are ACOUSTIC HOMING, FOULING MINES, HEAT SEEKING, DAZZLE SHELLS and PHOSPHOR SHELLS.)* **Variant behaviors are expressly upgrades — no one starts with one; class identity never depends on them** (design law, 2026-07-19, unchanged).

**Consumables — v3.** Four consumable slots on every hull, keyed `1`–`4` with the refit window closed (the default; user-configurable bindings are a maybe). A consumable is a deck card: taking it from an offer stocks it in a slot, and **it leaves the deck on pick, not on use**. **Full slots grey the consumable in the offer and the server refuses the pick** — there is no instant-use-on-pick; the never-rerolling offer is itself the mechanism (Eric: *"use one and then pick it if it's what you really want"* — spend a slot, reopen `Tab`, the card is still there). Slot contents are server-owned ship state, so a refresh or reconnect keeps them for free. Two activation shapes are an engine requirement, not a content taxonomy: **key fires** (instant — HULL REPAIR, SHIELD BLOCK, CHAFF, SMOKE SCREEN) and **key primes, click fires** (aimed, like `Q`/`E`/`R`, as a one-round pool on the same equipment interface — the DECOY BUOY, dropped into the mine's rear arc), and the card face says which. *(Only the decoy's delivery is ruled — R36/R43; the other four are keyed as instants by the facilitator's reading of their effects.)* **Content was open** (Eric: *"consumables should be able to do pretty much anything; it depends on what ideas I have"*; the categories he named in the 2026-09-01 session were **Denial, Intel, Ordnance**, with Terrain to keep in mind) **and is now closed for launch by catalog v3 — five consumables, cap 5 each, no reload** (R4, R13, R36–R39; the 2026-09-04 session's damage-reduction buff is out):

- **HULL REPAIR** — 100 hp (50 instant + 50 pooled at 5 hp/s), the shipped DAMAGE CONTROL effect; the only consumable any starter carries (5 / 5 / 5).
- **SHIELD BLOCK** — absorbs the next 100 hp of damage for 10 s; an unused shield expires at 10 s. [DRAFT — facilitator assumption: it stops *all* damage sources, storm and burn included; Eric did not state the scope.]
- **SMOKE SCREEN** — a trail laid astern for 5 s; each puff lives 30 s, starts at r40u and slowly expands to r60u (the rate is [DRAFT]). Blocks **sight only** — radar is unaffected; a hull inside or behind the smoke is not sighted. [DRAFT — facilitator assumption: a puff hides its own occupant as well as what lies behind it, blocking the LOS segment the way an island does for sight.] *(The smoke screen returns from its 2026-08-21 deferral here.)*
- **CHAFF** — bursts at **your own** position: 10 fake radar returns in r120u around you for 15 s, hiding your true echo among them (the brainstorm's fire-to-the-click delivery is not taken).
- **DECOY BUOY** — dropped astern within the mine's rear arc; **50 hp, lasts until destroyed** (no lifetime). Homing ordnance retargets onto it, **and it physically blocks anything** — any torpedo or missile that runs into it detonates there, homing or not. An undying buoy is a permanent hitbox, so the deck gun or a flak burst can clear it. [DRAFT — facilitator reading: the owner's ordnance is NOT exempt as ruled, so your own fish can strike your own buoy; Eric did not state an exemption.] *(Replaces the deleted Radar Buoy's slot in the game — R1 — as a consumable open to every deck.)*

No consumable ships without a bot use rule (see Enemy Design and AI).

**The match consumable pool — catalog v3 (Eric, 2026-09-09, R4/R44).** Every match rolls **10 consumable cards at random** from the five launch consumables, respecting each line's cap *within the pool alone*, and the server shuffles **the same 10 into every captain's deck at queue** — so the deck you draw from is your 40 authored cards plus 10 the match dealt: **50 at queue**. The set is **hidden** — nobody sees its composition; every captain knows only that it exists. Eric: *"So someone can assume there might be more heals and shields and shit out there."* The cap bounds the pool alone: a starter's five HULL REPAIR plus up to five more from the pool is legal, which is what keeps the set identical for everyone. It is a pre-match server insertion — not a card, not a draw weight, not a hand — so none of the forge's rejections (rarity, pity, deck manipulation) is reopened, and the legal-deck rules are untouched: the check runs on the authored 40, the pool arrives after it, and it holds only consumables, so it can never add an equipment line. Consequences: the draw-pile counter counts down from 50; the forge's one-copy appearance figures are stale until re-measured at 50; the harness rolls the pool per match. [NOTE FOR DESIGNER: whether the results screen reveals the pool after the match is unruled — the facilitator's reading is that the "brought, drawn, taken" view shows the pool cards you drew and nothing else, because the set is hidden during play. And the pool deals every captain consumables regardless of what their account has unlocked — read here as a preview, not power, since unlocks are variety-only; both readings are open note 20.]

**Healing IS a card now — v3.** The `5` key and the permanent DAMAGE CONTROL rail are **retired**. DAMAGE CONTROL becomes a **stockable consumable — HULL REPAIR in catalog v3**: the shipped effect is unchanged (100 hp — 50 instant plus 50 pooled at 5 hp/s), and each starter deck carries **5 copies to start** (Eric, 2026-09-03, reaffirmed on sheet v2 2026-09-09 — one in eight authored cards, one in ten at queue; the harness tunes it per hull; the card's catalog cap is **5** — R13). Heals must be **scarcer than today, and never renewable** (#6 recycling rejected). The 2026-07-16 law — self-heal is never a ship feature — still holds: healing remains an economy choice, drawn from the deck and paid for with a level. **"Can heals be spent during the sudden-death collapse?" closes by construction** (forge lock 7): the bound is finite — at most four heals stocked at any moment, and never more than the deck carries (at most ten under catalog v3: five authored plus at most five from the match pool). A passive per-level heal as a v3 mechanism is **parked**. [NOTE FOR DESIGNER: the FREE per-level auto-heal that shipped 2026-08-23 — a fraction of missing hull restored every time a level is earned, layered under the paid heal because heals were eating ~59% of level spend — is not mentioned by the forge. Whether it survives alongside the heal card, or is the thing "parked" retires, is an Eric call.]

**The storm (Pillar 4).** A damage-only zone shrinks the ocean in **legible phases** — **four ring groups** of ~4 minutes each, on an internal minute rhythm (see Difficulty Curve). Groups 1–3 bring the ocean down to the Endgame Guarantee ring by **12:00**; group 4 is **sudden death**, collapsing that final ring onto its own centre between **15:00 and 16:00**, at which point the whole map is storm. Storm never blinds sensors; it only damages (reference 4 hp/s, with **no damage ramp** — the collapse is geometry, not escalation). The **Endgame Guarantee**: the endgame ring's diameter is **2 standard truesight diameters** — close enough to force combat, far enough that radar is still needed and close-range hulls hold no clear advantage over long-range ones.

### Controls and Input

Desktop keyboard + mouse. Design intent: **hands describe the fantasy** — left hand helms the ship, right hand fights it.

- **Keyboard:** telegraph detents (set-and-forget engine orders) + rudder; weapon-slot priming (`Q` / `E` / `R` — the gun is always selected and needs no key); **`Shift` — the universal speed boost** (every hull, no card; catalog v3 R7/R9); **consumable slots `1`–`4` with the refit window closed** (v3 default, ruled 2026-09-03 — Eric: *"1-4 by default, but maybe we can introduce user-configurable controls"*; rebindable controls are a maybe, not scoped); the foghorn; and the **refit window** — `Tab` opens it, `1`–`4` take a card. **The `5` key is gone** with the DAMAGE CONTROL rail (v3: the heal is a card). There is no chord binding of any kind.
- **Mouse:** aim freely — weapons fire only within their real firing arc; click to fire — or, for the MACHINE GUN alone, **click and hold** to stream (catalog v3 R20; the arc still gates, so leaving it mid-stream ceases fire [DRAFT — facilitator reading]). Denied fire (out of arc, no ammo, reloading) gives explicit feedback rather than silence.
- Match completes with keyboard + mouse only. Touch/mobile input is out of scope for beta.

---

## Shooter Specific Design

### Weapon Systems

**Fitted loadouts — the promise at 0:00 is the DECK (v3).** The **deck gun is universal** — every hull carries the same standard gun, working the same way (short cooldown, basic damage, available most of the time), and **at 0:00 it and the Shift boost are all anyone holds**: the three weapon slots and four consumable slots are empty until the deck fills them. Class identity comes from the **hull envelope** and the **starter deck's composition** — the table below names the lines each starter is authored around (catalog v3, sheet v2, 2026-09-09). Contents are **focus, not exclusivity**, and the mechanism is the deck: **any weapon in the catalog is a line any hull may run** once unlocked — a Battleship deck can carry torpedoes, a Torpedo Boat deck a broadside — and no card is class-locked.

| Class | Gun (slotless, from 0:00) | Starter deck's three equipment lines (5 copies each) | Starter's add-ons | Ladder tilt — ARMOR / SPEED / TURNING |
|---|---|---|---|---|
| **Torpedo Boat** | Standard gun | **LIGHT TORPEDO** · **HEAVY TORPEDO** · **MACHINE GUN** | ACOUSTIC HOMING | 2 / 4 / 3 |
| **Battleship** | Standard gun | **HORIZONTAL MISSILE** · **MONITOR GUN** · **STAR SHELLS** (#12) | DAZZLE SHELLS · HEAT SEEKING | 4 / 2 / 2 |
| **Mine Layer** | Standard gun | **NAVAL MINES** (#81) · **CAPTIVE MINES** · **FLAK GUN** | FOULING MINES | 3 / 3 / 3 |

Every starter carries the same 15 non-equipment universal cards bar its ladder tilt: HULL REPAIR ×5, DECK GUN ×1, TURRET ×1, BARREL ×2, RADAR SWEEP ×3, RELOAD ×3 (catalog v3 §1); the three sum to 40 as TB 24 + 15 + 1, BS 23 + 15 + 2, ML 24 + 15 + 1 — the Battleship's lighter ladder tilt is what makes room for its second add-on (the sheet governs; catalog §1's prose "its 1 add-on" is short for the Battleship). **Unhomed at launch** — in no starter, reached by unlock only: SUPERCAVITATING TORPEDO, BROADSIDE GUN, PHOSPHOR SHELLS, and the SHIELD BLOCK / SMOKE SCREEN / CHAFF / DECOY BUOY consumables (which reach a starter only through the match pool). *(Superseded: the 2026-09-03 table's signature-weapon / signature-ability columns — the speed boost is a universal ability now, the radar buoy is deleted, and the Broadside barrage left the Battleship starter for missiles and the monitor gun.)*

**The smoke screen (#26) RETURNS as a launch consumable (catalog v3 R38)**, ending its 2026-08-21 deferral — Eric then: *"Deferred, I think it will probably come back at some point."* It has; see Consumables.

**Mine Layer kit — catalog v3.** The fantasy's anchor is the **Naval Mine**; the starter's other lines are **CAPTIVE MINES** (its own equipment line now) and the **FLAK GUN**, with FOULING MINES as its add-on. **The Radar Buoy is deleted entirely** — equipment, consumable, and its GUN / JAMMING doctrines (R1; the 2026-09-04 session had first made it a consumable, and the 2026-09-09 sheet removed it). The buoy role is taken by the **DECOY BUOY consumable**, open to any deck — and the 2026-08-19 claim that *"nothing fakes a ship contact any more"* is **retired**: CHAFF fakes radar returns and the decoy draws homing ordnance. (This supersedes the buoy half of the 2026-07-22 ruling and the 2026-08-19 radar-buoy ruling.)

- **Naval Mines:** **click-aimed into a rear sector** — astern ±60°, out to a fixed leash (reference 150 u) — and armed after a delay. An enemy pass-over trips a **blast** damaging every non-owner hull within the blast radius (blast radius > trigger radius, the trigger derived at 2/3 of the blast); **shooting any mine you can see detonates it** — the owner-only rule is widened to every spotted mine (Eric, 2026-09-04: *"Not a bad idea."*); **no live cap** — the per-player cap and its oldest-eviction are removed (R23): a mine exists until triggered or destroyed — and shoot-any-spotted-mine is the counterplay that keeps an uncapped field survivable (the facilitator's reading; the two were ruled five days apart and neither cites the other); **no expiry**. Its add-on is **FOULING MINES** (blast victims' both speed caps ×0.75 for 5 s, refresh not stack — Naval Mines only, R28). Tiers grow damage, blast (×1.1 compounding, trigger following) and the held count (pool 2 → 6).
- **Captive Mines — its own equipment line (R25):** the mine's chassis on a longer clock, holding one un-upgraded torpedo launched with lead at the first hostile to enter a much larger trigger ring (144u trigger / 32u blast) — a moored torpedo mine, expended on fire, which **cannot be command-detonated** (the owner's burst passes over and the mine persists) and whose fish has no max range and never fouls. Tiers grow the trigger ring, the fish's damage and the held count (pool 1 → 3).
- **Radar Buoy — DELETED (R1).** The stationary relaying sensor, its own sweep, and the GUN BUOY / JAMMING BUOY doctrines are gone. CHAFF inherits the jamming machinery (server-generated false returns, wire-indistinguishable from real ones) as a consumable; the DECOY BUOY consumable takes the physical-buoy slot (see Consumables).

**Broadside barrage (Battleship).** A click to either beam fires that whole side's battery in one barrage. Each turret is a real mount with its own firing arc: every turret that can bear fires exactly at the clicked point, and every turret that cannot fires at its own arc limit, at the click's *range*. Nobody designs a spread — it **emerges** from guns that cannot all bear on one point, so full convergence is something you earn by aiming near maximum range abeam, or by buying traverse. Each shell is a real gun-pattern shell that bursts at its own point and emits its own signals; there is no salvo aggregation. Its range is the 5/8 rung of the eighths ladder — it was the first weapon not to reach the full radar horizon, and catalog v3 puts the MACHINE GUN (250u) beside it. Under catalog v3 the BROADSIDE GUN is **in no starter deck** (unhomed; unlock only), and its tiers step reload, one spread rung and +0.5 turret — 4 guns at tier I, 6 at V (R35).

**The equipment lines — catalog v3 (R17–R35).** Eleven lines; tier I is the bare weapon, and tiers II–V each step −5% own reload plus the line's own stats. Reference numbers tier I → tier V; every per-tier sheet is `catalog-v3.md` §4. `[D]` marks facilitator-proposed or unconfirmed numbers Eric left to the harness.

| Line | Arc | Tier I (the weapon) | Tier V | Starter |
|---|---|---|---|---|
| **LIGHT TORPEDO** | twin sector, both beams ±45° about 90° | 45 u/s, 40 dmg, 1 tube, 25 s, no max range | 55 u/s, 60 dmg, 3 tubes, 20 s | TB |
| **HEAVY TORPEDO** | bow ±30° | **65 u/s** (was 60), 50 dmg, 1 tube, 30 s, no max range | 75 u/s, 70 dmg, 3 tubes, 24 s | TB |
| **SUPERCAVITATING TORPEDO** | bow ±15° | 195 u/s straight-runner that never homes; 50 dmg, 1 fish, 45 s | 70 dmg, 36 s (speed and tubes fixed) | — |
| **NAVAL MINES** | rear ±60°, leash 150u | arm 3 s; trigger 32u / blast 48u; 55 dmg; pool 2; 15 s; **no live cap** | 75 dmg; blast 70.3u / trigger 46.9u; pool 6; 12 s | ML |
| **CAPTIVE MINES** | rear ±60° (mine chassis) | trigger 144u / blast 32u; one fish at mine damage (55); pool 1, 20 s `[D]` | trigger 210.8u; 75 dmg fish; pool 3; 16 s | ML |
| **HORIZONTAL MISSILE** | bow ±50° | 250 u/s, flies **flat** to the click and bursts r20u there (an en-route hull takes a direct hit); 40 dmg; range 660u; **islands block it**; 1 missile; 30 s | 60 dmg, 3 missiles, 24 s | BS |
| **MACHINE GUN** | bow ±90° (180° forward) | **held-fire stream** of small direct-hit shells, no burst: 4 dmg every 0.25 s, 250u, 6 s of fire per pool, 15 s — all but the arc `[D]` | 8 dmg/shell, 12 s `[D]` | TB |
| **FLAK GUN** | 360° | one shell **air-bursting at the click** in a wide, weak blast that hits hulls *and* ordnance: 10 dmg in r40u, 660u, 1 shell, 8 s `[D]` — it passes the 2026-09-04 counter filter (*a card that ONLY counters one thing is a weak pick*) because it hits hulls on its own | 18 dmg, r58.6u, 6.4 s `[D]` | ML |
| **MONITOR GUN** | bow ±10° | **ARCING — fires over islands**; 500 u/s, 660u; 75 dmg, **no burst** (hits only what is under it at the click); 1 shell; 50 s | 95 dmg, 40 s | BS |
| **BROADSIDE GUN** | twin sector 90° ±60° | 4 turrets × 15 dmg r15u, 500 u/s, 412.5u, 18 s; mounts ±28° / traverse ±6° | 6 turrets, 14.4 s, mounts ±6° / traverse ±14° | — |
| **STAR SHELLS** | 360° | lit r165u for 10 s, 660u, 1 flare, 20 s | 3 flares, r241.6u lit for 20 s, 16 s | BS |

**Add-ons (one copy each):** ACOUSTIC HOMING (Light *and* Heavy torpedoes, never the Supercavitating: 0.5 rad/s steer, acquire 120u, dies at 1300u — one card homes every torpedo you carry), FOULING MINES (Naval Mines only), HEAT SEEKING (the homing numbers on Horizontal Missiles), DAZZLE SHELLS (enemies inside the lit zone: sight ×0.5) and PHOSPHOR SHELLS (5 hp/s burn on non-owner hulls inside 0.8× the lit radius) — the last two never change the lit radius and stack on one flare (R33/R34). **Missiles enter the game here** (Eric, 2026-09-04: *"I just know I want them in the game"* — two separate lines, horizontal and vertical): the HORIZONTAL line ships; VERTICAL-LAUNCH MISSILES are a post-launch candidate (R1), and the over-the-island role went to the arcing MONITOR GUN instead. **The Flak Gun is the 2026-09-04 session's SHRAPNEL GUN renamed** (R2), and it stays an air-burst rather than a canister spray: Eric first asked for the spray on seeing the numbers — *"a random spread of shrapnel shells within a spread that gradually widens as it gets further from the ship"* — and, once canister and flak were told apart, kept the air-burst (R26/R27). The canister form was considered and declined, not overlooked. **Deck gun ladders (universal, slotless):** DECK GUN ×4 (+1.25 dmg and −5% own reload per tier → 20 dmg / 4 s at cap), TURRET ×1 (pool 1 → 2), BARREL ×2 (+1 parallel barrel each, 12u apart → 3 shells at full damage). **Fractional steps accumulate and floor** (Eric's standing rule): a +0.5 tube or turret per tier shows nothing until the fraction completes a whole. **Signals for the new lines are unruled** — the broadside's per-shell muzzle flash and Hit Call are ruled (7-5), but whether a machine-gun stream flashes per shell or per burst, and whether a missile or the monitor's plunging shell splashes, flashes and calls its hit like a gun shell, is open note 21's design half.

**Weapon behavior laws (settled):**

- All weapons fire within **real firing arcs**; aim is never clamped — the arc gates firing, and out-of-arc clicks are denied with explicit feedback (deny-gate, Eric ruling 2026-07-23, Story 1.10).
- Every fitted system has its **own ammo pool and reload timer, and every reload ticks every tick** regardless of which weapon is selected — switching weapons is tempo, not penalty.
- **Torpedoes outrun every hull** at base speed and spawn with real clearance plus a brief owner-only grace — they can never self-hit at base speed. [NOTE FOR DESIGNER: catalog v3's LIGHT TORPEDO runs at 45 u/s at tier I — exactly the Torpedo Boat's base max — and even its tier V (55) only equals the SPEED-capped TB; under the Shift boost the hull runs 56.25 from base, or 68.75 if the boost scales a ladder-raised max (which reading R9 intends is itself [DRAFT]). It launches abeam, so a self-hit has different geometry from a bow fish, but the law as written no longer holds for it; R18's numbers stand and the law needs Eric's re-reading — open note 19.] The fish itself is never painted by radar — it is spotted inside the **3/8 detect rung** — but its **wake** paints on the scope even where the torpedo does not. *(Hydrophones were the planned torpedo warning; they are deferred — see Universal sensor suite.)*
- **Mines** are **click-aimed into a rear sector** rather than dropped dead astern (superseding the 2026-07-22 stern rack), arm after a delay, trigger by proximity, and are **uncapped per player** (catalog v3 R23 removed the live-mine cap and its oldest-eviction; the room-wide ceiling survives only as a server guard, its fate a build-time call). On trigger they **blast** — every non-owner hull within the blast radius (larger than the trigger radius for the naval mine; the captive inverts the two) takes full damage; **any captain's gunfire detonates any mine they can see** (widened from owner-only — Eric, 2026-09-04); mines **persist until detonated or destroyed (no expiry)** (Eric ruling 2026-07-22; aimed placement added later). A **captive** mine is the exception to the blast rule — it launches a torpedo instead, and is its own line.
- Numbers (damage, reloads, ranges, speeds) are design targets and move with every balance pass; current reference values at tier I are deck gun 15 hp burst / 5 s, heavy torpedo 50 hp / 30 s, light torpedo 40 hp / 25 s, mine 55 hp / 15 s, broadside 15 hp per shell × 4 shells / 18 s, star shells 20 s, horizontal missile 40 hp / 30 s, monitor gun 75 hp / 50 s. Hull HP is Torpedo Boat 250 / Mine Layer 300 / Battleship 350 (350 / 400 / 450 at the ARMOR cap). Every tier between is in `catalog-v3.md` §4.
- **Compass vetoes stand for the new armory:** no torpedo variety **within a weapon** (narrowed by Eric, 2026-09-03: the catalog may hold several torpedo designs as separate lines — **Light, Heavy, Supercavitating** under catalog v3 — each one fixed design per slot, each costing one of the deck's three equipment lines; a doctrine add-on changes how that one torpedo behaves; what stays banned is a WoWS-style selector inside one weapon — see open note 17), no damage-control parties, no sectional damage — WoWS-creep stays out. *(The DAMAGE CONTROL heal is a deck card spent from a consumable slot, not a WoWS-style repair party: no crew, no timer to manage, and never renewable.)*

**Weapon feel.** The gunnery-feel package from the brainstorm's information-texture bundle (#90) is design intent: **fall-of-shot spotting** (#21 — your splashes are visible in fog, so misses become information and you can bracket-and-walk fire), **the Hit Call** (#19 — a muffled boom and orange bloom confirm you connected without revealing how badly), and **muzzle flash carries** (#34 — firing lights the fog beyond truesight; shooting is being seen). Together: every trigger pull produces information for someone (Pillar 1).

### Aiming and Combat Mechanics

- **Top-down mouse aim.** Aim is free; the arc gates firing, not the cursor — click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback, never silence.
- **Arcs — ratified 2026-07-23 (Story 1.10), re-cut by catalog v3 (2026-09-09).** The **deck gun, star shells and flak gun** fire **360°** — no mounts, no arc. Bow sectors: **HEAVY TORPEDO ±30°**, **SUPERCAVITATING TORPEDO ±15°**, **MONITOR GUN ±10°**, **HORIZONTAL MISSILE ±50°**, **MACHINE GUN ±90°** (a 180° forward arc). **Twin sectors** — two mirrored beam sectors centred at heading ±90°, where the side containing the click is the side that fires and a click in neither is denied: the **broadside gun** at 60° a side (60° dead zones dead ahead and dead astern) and the **LIGHT TORPEDO** at 45° a side (90° dead zones). The **rear sector** (NAVAL MINES, CAPTIVE MINES, and the DECOY BUOY consumable) is **click-aimed** astern ±60° out to a fixed leash, superseding the original dead-astern rack. The Shift boost and the key-fired consumables aim nothing. Denied fire is authoritative as well as predicted: the server sends a self-private denial signal (out-of-arc / no-ammo / cooling / blocked placement) so denial feedback is never silent — including island- or boundary-blocked placements, which are refused without spending the charge.
- **No dispersion.** Shots go exactly where they are aimed; travel time is the skill counterweight. Projectiles, never hitscan — leading the target is the game.
- **Flight rules:** torpedoes run until they hit something; gun shells fly to the clicked point or the first thing they hit on the way, whichever comes first. Catalog v3 adds two exceptions and a stream: the **horizontal missile** flies flat to the click like a shell and islands block it (R42); the **monitor gun's** shell arcs *over* islands and hits only what is under it at the click (R30); the **machine gun** is a held stream of direct-hit shells with no burst (R20).
- **No damage falloff.** Distance never reduces damage.
- **Flat damage model.** No sectional damage, no critical hits, no weak points (compass-vetoed as WoWS-creep) — each weapon deals its damage to a single hull pool, modified only by upgrades. **No endure axis (Eric, 2026-09-04):** *"Armor IS HP and HP is already upgradeable"* — no torpedo bulge, no directional armor, no subdivision cap, no citadel or crit zones, no steering-damage immunity, and **fire does not enter the game**; with the damage-reduction buff struck from the consumables (R4) there is no damage-reduction concept anywhere — SHIELD BLOCK absorbs, it does not reduce. *"This is deliberately more arcadey than World of Warships — do not push sim-level complexity."*
- **Combat is sensing (Pillar 1).** Firing produces muzzle flash beyond truesight, splashes visible in fog, and hit calls — every trigger pull is also information, for you and about you.

### Enemy Design and AI

**No bot-fill in standard lobbies.** A standard BR match is humans only: minimum 2 human captains, pooled in a queue that forms the match on a fill-or-timer. Bots never masquerade as players. *(Roster-scaled map sizing was cancelled — every match gets the same fixed-radius ocean.)*

**Solo vs AI mode.** A dedicated mode reached straight from the home screen — with no queue at all, because a lobby of one has nothing to pool. It mints a private match of **one human captain plus 19 AI captains**: real opponents playing the battle royale, not target practice. An AI captain is a full participant — roster row, personal hue, ship class, XP, deck, kill-feed line, eligible for the KILL LEADER throne — and **it can win the match**. Its only knowledge of the world is what the perception boundary hands it: bots fight in the same fog humans do, and they are driven through the same input pipeline as every ship. AI captains come in per-class **priority profiles** (two per hull) rather than a difficulty ladder. **v3:** each profile carries an **authored 40-card deck in the player deck format** (plus the match's pool of 10, like everyone), legality-checked when the room is built — the bot is the first customer of the deck rules. Every consumable card ships with a bot use rule (a **total** consumable-tactic table: instant cards keyed off profile state such as the heal threshold, aimed cards through the weapon solve — now five rows; the mapping HULL REPAIR and SHIELD BLOCK off the heal threshold, CHAFF and SMOKE SCREEN off the disengage posture, the DECOY BUOY through the rear-arc placement solve is a facilitator proposal [DRAFT], not a ruling), so no card can enter the catalog without a bot that knows how to spend it; the same holds for every equipment line, whose tactic travels with the weapon. The batch-sim harness runs two deck arms from day one — **authored** decks and **random-legal** decks (legal against every line's catalog cap, with the match pool rolled per match) — and pins these bars: the starter-vs-veteran win band, the two golden decks (a torpedo-less Torpedo Boat, a pure gunboat), heal-take rate, levels wasted, and the one-copy appearance rate. Balance cycle 1's class numbers are void once the Shift boost lands on every hull — rerun before tuning tiers (2026-09-04).

**Roving PvE drone fleets — in all BR modes.** Every match (standard and Solo vs AI) contains a few roving PvE drone fleets that can be hunted and killed for XP:

- Ships carrying a basic gun on a longer cooldown, used **only to defend themselves** — they never hunt players.
- Three tiers: **common** small ships (1/4 level per kill), **uncommon** medium ships with more HP (1/2 level), **rare** large ships with even more HP (3/4 level). *(Raised from ¼/⅓/½ on 2026-08-16.)*
- They rove; finding them is part of the sensor game.
- They are an XP source feeding the upgrade economy, not world density — the forge's rejection of "PvE fleets as mandatory world density" stands; these are bounded, huntable pockets.

**Rules that hold for every non-human ship:** driven through the same input pipeline as human ships (no special code paths) and subject to the same perception rules.

**Win check counts match participants only — in every mode.** Roving PvE fleets are not participants: they never need to be destroyed to claim the win, and they can never win. In a standard match the participants are the human captains; in Solo vs AI, the human and the AI captains. Structurally, a participant is any hull whose role is not *fleet* — which is precisely why an AI captain contests, and can win, a match.

### Arena and Level Design

**The ocean.** One large circular map per match. Islands are procedurally generated from a seed; both sides rebuild the map deterministically from that seed (the map never travels on the wire). **Map size is fixed** — one radius for every roster. Roster-scaled oceans were designed and then **cancelled** (epic-6 amendment 11): at a two-captain size the fixed endgame ring would already be over half the water.

**Islands** are the terrain system: they block line of sight (the LOS rule for every sensor tier), block shells and torpedoes (the arcing MONITOR GUN shell is the one exception — catalog v3 R30), and impose collision. They are what makes needle-threading a skill shot, radar shadows a hiding place, and positioning a deduction input.

**Spawning.** Participants spawn on an outer ring, placed for maximum mutual distance and island clearance.

**World features — DEFERRED, not cut.** Neither of the two below is built. Both were ruled out of the beta by Eric (epic-5 amendment 47, *"I have enough systems"*), a ruling that also declared the systems layer complete; their designs and reserved numbers stand for whenever they return.

- **Fog banks** (#43-r) — the Trade: inside a fog bank your truesight shrinks, but you vanish from others' truesight (radar may still paint you). Blindness bought with blindness.
- **Rare whirlpools** — rare enough to be an event, not a hazard-course. Each ocean is randomly in the northern or southern hemisphere (never revealed to players); whirlpools spin counterclockwise in the north, clockwise in the south. A whirlpool's job is to spin: a ship passing over one is carried along its circular current — sailing with the current speeds you up, against it slows you down — and the spin rotates your heading (rudder with the current and you keep your facing relative to the whirlpool). No suction, no trap: you can exit from any side. It just makes captaining more interesting.

Backburnered: supply drops (#23) — the ring rhythm still reserves their minute-2 beat, which runs today as a real structural no-op.

**The storm** (Pillar 4) is the arena's clock: phased closure down to the Endgame Guarantee ring — two truesight diameters across — by 12:00, then the sudden-death collapse of that ring to nothing between 15:00 and 16:00. It forces the final fight without ever retiring the sensors.

### Multiplayer Considerations

- **Modes at beta:** **Solo** (standard BR — humans only, no bot-fill) and **Solo vs AI** (lobby filled with AI combatants). Both contain roving PvE drone fleets.
- **Lobby:** match starts at **2 human captains** (fill-or-timer), capped at **20** for now.
- **Matchmaking: one standard queue.** Captains pool in a queue that arms a single hard deadline at the second captain and then hands the arena a fully-formed roster; hitting the 20-captain cap forms the match immediately. There is no half-filled lobby to drop into, no skill matching, no parties and no ranked at beta. **Solo vs AI does not queue at all** — it mints its own private match on the spot. **v3: the deck is frozen at queue** — the client selects a deck at join (#60), the server loads it from the account (or the hull's starter deck for an anonymous captain), checks legality once on the authored 40, shuffles in the match's 10 hidden pool consumables, and snapshots the 50; edits made after queuing apply to the next match.
- **Balance frame:** class counterplay flows from focus-not-exclusivity (every hull carries the same deck gun; the hull envelope and what each deck can deal define the matchup — v3); the passive XP tick is the anti-snowball floor; Paint-Not-Power keeps every purchasable structurally non-competitive.
- **Accounts — v3, in scope before the traffic push.** Two states and **no guest tier**. **Anonymous** = today's game: open the URL, pick a hull, sail its starter deck; nothing is stored. **Signed in** (OAuth only — Google or Discord, minimal scopes: the account holds a provider and an opaque subject id, never an email, name or password; 13+ by the provider's terms, not verified) = your decks, unlocks, unlock tokens and match history. *Signing in changes what you keep, never what you can do in a match.* Eric declined releasing the match-side rework without accounts (*"go big or go home"*): the deck model ships as one unit.
- **Post-beta (explicitly out of beta scope):** duos/trios with a ping system, ranked.

---

## Progression and Balance

### Player Progression

**XP and levels.** Passive XP tick of **~1 level per minute** — over a ~15:00 match, ~15 passive levels. This is deliberate generosity: upgrades are fun; players should have them. The tick is also the anti-snowball floor: everyone grows, always.

**Kill bonuses — kill-only, no damage XP:**

| Kill | XP value |
|---|---|
| Opponent (match participant) | 1 full level |
| Common PvE fleet ship (small) | 1/4 level |
| Uncommon PvE fleet ship (medium, more HP) | 1/2 level |
| Rare PvE fleet ship (large, even more HP) | 3/4 level |
| KILL LEADER, on top of the opponent kill | +1 level |

These values are declared handwaves — the shape (kills accelerate, participation never zeroes out) is the commitment; exact fractions are tunable. The PvE fractions were raised from ¼/⅓/½ to ¼/½/¾ on 2026-08-16; keeping every tier a dyadic fraction is deliberate, so any fleet composition is exactly representable. **Tuning method (committed):** batch-simulate the XP tick and kill-bonus outcomes with drone lobbies before human playtests.

**Spending.** Each level opens a pre-drawn offer of **4 different card lines from the deck you brought** plus the match pool (drawn at earn-time, never rerolled — see The Deck Model v3); one level buys any one card, and a heal is a card like any other. The catalog shipped, was rewritten wholesale by Eric (2026-08-19), and **its v3 re-cut is written** — `catalog-v3.md`, 2026-09-09 (29 lines / 114 cards; its `[DRAFT]` cells await the harness); its standing requirement is **the build must be felt** — audio, hull visuals, on-water behavior — or promise + growth is a spreadsheet.

**The opening — v3.** Every hull spawns with the deck gun and the Shift boost only — nothing from the deck. **Level zero is granted at countdown start**, so the first offer opens during the 10 s countdown and can be taken before the water goes live, or held. **Mulligan:** one free redraw of the level-zero offer, only during the countdown — the single declared exception to "reopening never rerolls", at a moment nobody is on the water. The redraw is still the level-zero offer, so it carries the same usable-card guarantee. **Weighted first draw** is the default and is built first: the level-zero offer is guaranteed to contain at least one **actively usable** card (a consumable, or the Tier I of any equipment — the bare weapon, by catalog v3's standing rule) — Eric: *"my brain leans more towards weighted first pick."* A **pinned card** (one deck card marked start-fitted, #21) is a later, CONFIG-gated experiment to test against it. The promise this buys is *"you have something to DO at 0:00"* — not *"you hold your class weapon at 0:00."*

**Account progression — v3 (the only meta layer).** An **account level** bar fills with XP earned per match — **placement-scaled**, and **discounted in Solo vs AI** (Eric: *"probably, just not as much"*) — and every account level grants **one unlock token**. A token unlocks **a whole line** (every copy up to its catalog cap — 5 for an equipment line, 4 or 5 for a ladder, the one copy of an add-on) at a **flat price [DRAFT — Eric: "flat probably, idk"]**, in any order: unlocks are **variety, never power**. All three hulls and their starter decks are unlocked from day one; the starter decks' cards are the initial unlock list, and a starter is authored to be viable at the top of the ladder — Eric: *"good enough… just not the most optimized deck for how I play, or the current meta."* Both XP dials derive from one intent number — **matches to unlock the launch catalog** — which is **OPEN with no placeholder** (Eric: *"fuck if I know"*, reaffirmed 2026-09-03): it ships as a CONFIG dial — **the catalog's line count is now known, 29** (catalog v3), so the dial can be set — and is tuned from live match history. Catalog breadth target, **confirmed 2026-09-03 and MET 2026-09-09**: ~100 cards over ~25–30 lines — the launch catalog is **114 cards over 29 lines**, hull-agnostic (Eric: *"100ish is a solid target."*). The unlock surface beyond a starter is every unhomed line (SUPERCAVITATING TORPEDO, BROADSIDE GUN, PHOSPHOR SHELLS, SHIELD BLOCK, SMOKE SCREEN, CHAFF, DECOY BUOY) plus every line another hull's starter carries. A signed-in captain may keep **several decks per hull** (Eric: *"fine. Data is cheap"*); Eric has noted that deck *slots* could be rewarded or monetized (#80) — a slot is not power, so Paint-Not-Power holds. **Match history** records **every deck in every match server-side** for Eric's own metrics (*"the only way to see how things are performing in live play"*); a player sees their **own** deck — brought, drawn, taken — in results and history, and **enemy decks are shown to no player**. Meta convergence is accepted (Eric: *"There's no avoiding it"*).

**Balance laws:** **Universal counterplay only (2026-07-19)** — tools must counterplay everything, never specific ships or weapons except incidentally; no counter-classes, ever. Its deck-era corollary, **the counter filter (Eric, 2026-09-04):** *"in a BR with deckbuilding, a card that ONLY counters one thing is a weak pick — you cannot know you'll meet that thing. Every counter card must also do something on its own"* — it killed degaussing, the counter fuze, the pure anti-mine paravane, a torpedo-only boom and the fire ship, and it is why the FLAK GUN hits hulls as well as ordnance. **No death pings or free information (2026-07-19)** — scouting is the skill; nothing announces a kill or a position for free. The Rat Covenant — hiding is legal but priced (a hiding player ticks but never accelerates; the kill-only bonus is exactly the price). The Conservation Law ("every power gain emits a signal") is a *tendency*, not a law — anti-snowball outranks it. **The KILL LEADER (#47, formerly "the Bounty"):** the captain with the most captain kills holds a public throne — **identity only**. Their name is published to every client and marked with a skull wherever it appears, and sinking them pays a bonus level. **The Bounty Bloom is deleted end to end**: there is no radar paint, bloom, ring, bearing, range or area disclosure of the holder, ever. Identity was already free — every client can already count kills — so publishing the name only reconciles the server's answer with what a client could derive anyway; *position* was the sole genuinely new disclosure, and it is exactly what the ruling removed. The anti-snowball teeth are the bonus and the target painted on the **name**, not on the water.

### Difficulty Curve

The match's tension curve is structural — the ring rhythm *is* the pacing. **Four ring groups** of ~4 minutes, each on the same internal minute rhythm:

- **Minute 1 — clear seas.** Hunt, position, gather.
- **Minute 2 — supply drops spawn.** *(Backburnered feature; this is its reserved slot in the rhythm.)*
- **Minute 3 — next ring revealed.** Planning pressure: where you must be is now known.
- **Minute 4 — the ring closes** down to the next circle.

Three escalating cycles of that rhythm bring the ocean down to the endgame ring — **two standard truesight diameters across** (the Endgame Guarantee), reached at **12:00**. Combat is forced there, but radar still earns its keep and no range class gets a free win.

**Then group 4: sudden death.** The endgame ring holds through 12:00–15:00 on the same rhythm (clear seas · the reserved supply beat · the collapse point marked at 14:00), and from **15:00 to 16:00 it collapses concentrically onto its own centre**. At 16:00 the map is 100% storm and every hull still afloat is taking damage. This is a shrink, not an escalation: storm damage never ramps, and the endgame ring itself is untouched.

**Match length.** **~15:00 is the estimate and the design contract** (Pillar 2). The **structural ceiling is ~17:30**: the ring is fully closed at 16:00, and the game's toughest hull needs roughly another 87 s to sink at storm damage from full health (~112 s at the ARMOR cap's 450 hp). Even that is soft at the very top, because stocked heals are spendable while alive and each one buys back time — but under v3 a captain holds at most four at a time and never more than the deck carries (at most ten under catalog v3), so the ceiling is bounded by construction, and the match always terminates, which is the whole point of the collapse. *(The brainstorm's 10-Minute Covenant is formally retired in favor of this contract.)*

### Economy and Resources

- **XP is the only in-match currency; unlock tokens are the only account currency** (v3). No loot-scavenging spine (explicitly rejected); nothing on the water outranks playing well, and nothing an account holds outranks a starter deck.
- **Ammo is per-weapon and reload-limited**, not scavenged: each fitted system owns its ammo pool and reload timer, always ticking.
- **Weapon slots and consumable slots fill from the deck** (and, for consumables, from the match pool shuffled into it) — copy 1 of a weapon's ladder fits the weapon, a consumable card stocks a slot; nothing is scavenged off the water. *(v3 retires the acquisition card and its "taking one burns the rest" rule.)*

---

## Level Design Framework

### Level Types

One arena type: the circular island ocean, procedurally generated per match from a seed (deterministic on both sides; the map never travels on the wire). Variety comes from generation, not authored maps:

- **Islands** — count, size, and placement vary by seed; they are LOS blockers, cover, collision, and the terrain that makes torpedo skill-shots and radar shadows possible.
- **Fog banks** — truesight-for-truesight trade zones. **Deferred, not built.**
- **Rare whirlpools** — spinning currents that carry and rotate hulls that cross them (see Arena and Level Design). **Deferred, not built.**
- **Map size is fixed** — every roster gets the same ocean; roster-scaled sizing was cancelled.

Generation parameters (island density, size distribution, land coverage — plus fog-bank frequency and whirlpool rarity if those return) are tuning work, with one fairness rule: spawn placement is maximum-mutual-distance and island-clear.

### Level Progression

There is no authored level progression — the storm is the level progression. Each match's arena shrinks through four 4-minute ring groups (see Difficulty Curve) — down to the Endgame Guarantee ring, and then to nothing — so "level design" over time is the same water becoming scarcer, more contested, and finally gone.

---

## Art and Audio Direction

### Art Style

**DESIGN.md is the design source of truth**; this section summarizes design *intent* — specific colors, type, and spacing live there.

- **Aesthetic: "CIC Tactical Display, Evolved"** — black void ocean, silver-white radar-display linework, phosphor blips, a rotating sweep. The screen reads as a combat information center that happens to be the game itself.
- **Restrained functional color** — each color has exactly one job (tactical green = yours, amber = action, dimensional purple = storm). Dark is the identity, not a theme option.
- **Readability is tactical** — everything on the water is information (Pillar 1), so render clarity is a gameplay feature: blip decay, wounded smoke, muzzle flashes must be readable at a glance on low-end displays.
- *DESIGN.md documented the hex-grid "2.0" era in places (cell states, planning/resolution choreography). That reconciliation ran in Story 7-6 (2026-08-21); the aesthetic direction carried forward unchanged.*

### Audio and Music

- **WebAudio tones only, no sound files** — CIC-authentic synthesized tones (pings, warbles, rumbles), growing toward *mood, not orchestration*. All audio respects the mute toggle.
- **Audio is a sensor (Pillar 1):** the **foghorn** is the shipped audio-first mechanic — a sounded horn carries across the map, and the hearer's HUD draws a chevron on its bearing with a coarse distance band that islands muffle. *(The passive listening ring — engine noise and torpedoes heard without a sender — and active pings are deferred along with the hydrophones.)* Sound design and game design are the same discipline here.
- **Tone: naval tension with a playful wrapper** — the "Silly Is Sanctioned" contract: foghorn emotes, named vessels turning the kill feed into naval theater, medals. The tension is real; the wrapper never is.

---

## Technical Specifications

### Performance Requirements

- **60 FPS sustained on the ratified reference device** — Eric's MacBook Pro 16,1 (2019) / Intel Core i7-9750H (epic-7 amendment 1) — in a full 20-ship match with fog, radar sweep, and effects active, at the **1366×768 viewport floor** (NFR7 / UX-DR39). Performance is a distribution feature, not an optimization afterthought (Pillar 2).
- **Playable from first click in under ~10 seconds** on that same hardware — no install, no account required.
- **Authoritative 20 Hz server simulation with client prediction**; playable feel at typical residential latencies (up to ~150 ms without degradation).
- **Structural anti-cheat:** nothing outside a client's sight ∪ radar sweep ever reaches that client. The rule is enforced at a single chokepoint with property-style invariant tests behind it, and every relaxation of it is a **named, individually-argued exception** rather than a soft edge — today there are exactly six (your own fall-of-shot, your own hit call, the anonymous muzzle flash, the public sinking register, wounded smoke, and the foghorn). Counter-intel lies live on the server and are indistinguishable on the wire. **v3:** deck state is server-private (only the four drawn ids ride the wire — and the match pool's composition is a server secret no client ever sees; the draw-pile count is all it leaks), deck legality is checked by the server once at queue, and consumable slot contents are server-owned ship state. **Catalog v3** keeps the count at six: CHAFF's fake returns ride the carve-out the jamming buoy already had (a fake discloses nothing real), and smoke is an occluder, not a disclosure.

### Platform-Specific Details

- Desktop browser: current Chrome, Edge, Firefox, Safari. Keyboard + mouse.
- **Self-published at `https://hullcracker.io/`** on its own servers and monetized with its own ad units — no portal, no portal SDK, no third-party technical compliance gate (Eric ruling 2026-08-21). The launch obligations that remain are the operator's own: hosting, ad + consent handling, and the privacy policy.
- Mobile/touch: out of scope for beta.
- **Accounts (v3):** OAuth sign-in only (Google, Discord) with minimal scopes — the operator stores a provider and an opaque subject id, never an email, name or password; no guest tier; nothing stored for the anonymous player. The privacy policy grows by one paragraph on signed-in accounts. The account store is the project's first persistent store and first non-ops HTTP API (sign-in callback, deck editing, match history) — an architecture question for `gds-game-architecture`, and it must not pre-empt the deferred frontend/backend split (Story 7-7).

### Asset Requirements

- Rendering is procedural vector-style linework (hulls and effects drawn in code) — no heavy texture or model pipeline.
- Audio is synthesized WebAudio tones — zero sound-file assets.
- Fonts and any static assets stay small enough to hold the ~10 s first-load target.

---

## Development Epics

### Epic Structure

Detailed breakdown with stories, scope boundaries, and dependencies: `epics.md`.

| # | Epic | Delivers | Playable outcome |
|---|---|---|---|
| E1 | **The Armory** | Slot grammar, universal standard gun, three class loadouts, rethought firing arcs | Pick any of 3 classes; the game feels different at 0:00 *(historical — v3's E8 moves the 0:00 difference from the fitted loadout to the deck)* |
| E2 | **The New Economy (+ New Controls)** | XP tick + kill-only bonuses, pre-rolled boon offers, Hades-style boon catalog v1, felt-build presentation, old upgrades stripped, new keyboard controls | Level up mid-match; picks visibly change your ship; controls fit the new game |
| E3 | **The Ring** | 4×4 phased storm with minute rhythm, Endgame Guarantee ring (2 truesight diameters), sudden-death collapse | A full match has its designed pacing arc, and always ends |
| E4 | **The Living Ocean** | Roving PvE fleets (3 tiers), sinking window — **fog banks and whirlpools deferred** | The water itself creates stories |
| E5 | **Honest Lobbies & Modes** | No bot-fill, min-2 fill-or-timer, cap 20, ~~roster-scaled maps~~ (cancelled), Solo vs AI combat AI | Two real modes with honest matches |
| E6 | **Information Texture** | ~~Listening ring + torpedo pips~~ (deferred), hit call, fall-of-shot, muzzle flash carries, wounded smoke, foghorn, eighths ladder + radar shadows + wakes | Every fight is legible through the fog |
| E7 | **Launch Readiness** | 60 FPS on the reference device, <10 s load, ads + consent, privacy policy, how-to-play page | Shippable at `hullcracker.io` |
| E8 | **The Deck** (v3 + catalog v3) | Card model (A) + hull-agnostic catalog hooks, legal 40-card authored decks + starter decks frozen at queue, **the match consumable pool** (10 hidden, same for all, 50 at queue), equal-weight draw, deck gun + three generic weapon slots (at most three equipment lines per deck, slot keeps its clock), four consumable slots, heal as a card (`5` retired), gun-and-Shift spawn + level zero + mulligan + weighted first draw, draw-pile counter, **catalog v3's content** (11 equipment lines incl. six new weapons, TURNING, the retuned RELOAD + equipment reload step, five add-ons, five consumables; the radar buoy deleted, no live-mine cap, shoot-any-spotted-mine), **the Shift boost as a universal ability**, wake drafting, bot decks + consumable tactics + harness arms and bars, own deck in results | Every match — anonymous or signed in — is played on a deck, under the same rules for everyone |
| E9 | **The Account** (v3) | OAuth sign-in (no guest tier), the first persistent store, deck editor (several decks per hull), account level → unlock tokens → whole-line unlocks, placement-scaled XP, match history (own deck to the player, every deck to Eric's metrics), privacy-policy delta | Sign in and keep your decks, unlocks and history — nothing changes inside a match |

**Sequence: E1 → E2 → E3 → E6 → E4 → E5 → E7 → E8 → E9.** Identity and economy first (the spine everything touches), match shape third, then texture, world, modes, launch — E1–E7 have shipped. **E8 and E9 ship together as one unit before the traffic push** (Eric declined releasing the match-side rework without accounts — *"go big or go home"*); the split is a build seam, not a release seam — E8 is everything that changes on the water and plays anonymously on starter decks, E9 is everything an account keeps (seam ratified by Eric, 2026-09-03).

---

## Success Metrics

### Technical Metrics

The Technical Specifications targets, treated as pass/fail: 60 FPS sustained on the ratified reference device in a full 20-ship match at the 1366×768 viewport floor; first click to playable in under ~10 s; feel intact at ~150 ms latency; matches complete without crashes or desyncs.

### Gameplay Metrics

- Matches complete inside ~15:00 (Pillar 2's promise, measured), against a ~17:30 structural ceiling.
- Players choose to sail again quickly after death — the fun proxy, measured as the share of deaths that lead to another match. The route is deliberately through the home screen (there is no instant re-queue); if dying doesn't lead to "again," Pillar 2 is failing.
- All three classes see real pick rates — no class is a dead button (Pillar 3's promise has to be worth promising).
- One playtest-answerable question per pillar — e.g., for Pillar 1: do players describe finding someone as a *deduction*?
- **v3 harness bars, pinned before human playtests:** the starter-vs-veteran win band (unlocks are variety, never power — measured, not asserted); the two golden decks (a torpedo-less Torpedo Boat and a pure gunboat both play); heal-take rate; levels wasted (offers with nothing worth taking); the one-copy appearance rate (re-measured at 50 cards — the harness rolls the match pool per match). Balance cycle 1's class numbers are void once the Shift boost lands on every hull; rerun before authoring tier tunings (2026-09-04), and every `[D]` cell in catalog v3 is a dial that pass tunes.

---

## Out of Scope

**Deferred classes — the expansion blueprint (2026-07-19).** The supplemental brainstorm produced a six-class roster and the ability formula as the post-playtest expansion blueprint (`_bmad-output/brainstorming-session-2026-07-19.md`). Party-mode ruling: these are **deferred, not designed-in** — prove the three-class beta in front of players first; each lands later as registry rows, not rewrites. Bench order:

1. **Submarine** (most developed): timed submerge on cooldown — not a persistent state; guns dead underwater, torpedoes live, forced resurface. Radar-dark while under, but the periscope is visible in true sight at roughly torpedo-spotting distance; still trips mines and stays vulnerable to torpedoes; found by hydrophones and active-sonar equipment — counterplay is built into the class itself. Same torpedo as the TB, opposite verb: stalk vs. dash. Open: duration/cooldown numbers, periscope visibility tuning — **and its counterplay premise now depends on a deferred sensor**, so hydrophones/sonar have to come back before, or with, the submarine.
2. **Carrier**: bombers as secondary weapon, recon plane as ability; the captain still drives and fights his own ship — explicitly not an RTS-inside-the-shooter. Aircraft mechanics entirely TBD (counterplay must be designed before it enters); existing drone infrastructure is a plausible base.
3. **Decoy Ship** (banked, no commitment): cooldown blip burst (~5 radar blips instead of 1) or radar-dark, built on the phosphor system with zero new physics. Flavor, hull identity, and weapon fit undecided — the thinnest slot. **Note:** catalog v3 (2026-09-09) brings back a DECOY BUOY consumable (homing bait plus a physical block) and CHAFF (fake radar returns), so the deception role ships again in consumable form; this class would extend it rather than reintroduce it.

**Banked content (2026-07-19 session — ideas with no commitment):** weapon-variant mutations (quick-firing battery, heavy rifle, shotgun gun; torpedo fan spread, Long Lance, pattern-runner), the equipment-pool draft (~~searchlight~~ — dead, 2026-09-04; active sonar, ~~smoke generator~~, spar torpedo/ram kit, sonobuoy), ramming as a mechanic, ~~the monitor / juggernaut-battleship repositioning~~, and ~~captor~~ and influence mines. *(Three left the bank for catalog v3: the smoke generator → SMOKE SCREEN, the monitor → MONITOR GUN, captor mines → CAPTIVE MINES.)* What triggers reconsidering any parked concept is itself an open question — only the Radar Picket carries a stated return condition (a weapon identity).

**Post-launch candidates from the 2026-09-04 session, ruled off the launch sheet (Eric, catalog v3 R1 — *"the sheet IS the launch catalog"*):** FORWARD MORTAR / HEDGEHOG, DEPTH CHARGE, HARPOON, VERTICAL-LAUNCH MISSILES, the HYDROFOIL BOOST LADDER, the launcher-gated SHKVAL ROUND consumable, the ANCHOR as a second universal ability, the TORPEDO NET, and the NOISEMAKER / GUN BUOY add-ons that lost their host. Candidates, not omissions.

**Backburnered — designed-for, not built in beta:**

- Sensor-forward class (formerly "Hunter," working name TBD; the 2026-07-19 session tabled the closely related Radar Picket for lacking a weapon identity — parked until it has one)
- ~~~4 consumable slots per ship~~ — **built into the design by v3** (four slots, keys `1`–`4`; see Consumables)
- Supply drops (the ring rhythm reserves their minute-2 beat, which runs today as a real structural no-op)
- **Hydrophones / the passive listening ring**, sonar as a distinct sensor tier, and active ping — deferred 2026-08-21 (Eric: *"very deferred. sonar might come back in the future, but radar is plenty deep enough"*). The foghorn chevron is the shipped bearing surface.
- ~~**The smoke screen (#26)** — deferred 2026-08-21~~ — **returned as a launch consumable by catalog v3** (R38; see Consumables).
- **Fog banks and rare whirlpools** — designed in full (see Arena and Level Design) and deferred by ruling (epic-5 amendment 47, *"I have enough systems"*), which also declared the systems layer complete.

**Post-beta:**

- Teams (duos/trios + ping system)
- Custom/private lobbies
- Ranked, cosmetics shop, unlockable classes (unlocks are **never power** — the Paint-Not-Power guarantee extends to class unlocks), Service Record, Pennants. *(Accounts left this list on 2026-09-03 — they ship with the deck model before the traffic push; see Multiplayer Considerations.)*
- Rare Pull exotic offers (#84) — boon catalog v1 is basics-first; anything springing from it comes later

**Rejected — do not re-propose without a ruling.** By the deck model v3 forge (2026-09-02): a hand with a per-minute drip; card merging; storefront verbs (lock / sell / refresh); rarity weighting and soft pity in the draw; instant-use-on-pick; guest accounts; storing emails or passwords; deck names (in the feed or anywhere); class-locked cards; deck-manipulation cards; hull-mod cards; salvage cards. By Eric in the 2026-09-01 session: discard/reshuffle (#8 — exhaustion is meant to be rare, not cycled); the deck picking the hull (#71). By Eric in the 2026-09-04 session: an AP round and rocket-assisted shells (*"too complicated"*); a light gun / secondary battery (redundant with BARREL) and a fire-control director; a sight-only ship ladder, HF/DF bearing, IFF (*"not even parked"*), dazzle paint, EMCON, the Leigh light, crash stop; the SEARCHLIGHT (*"dead"*); all eight facilitator-proposed gun add-ons (*"extremely bad"* — add-on shape is Eric's to define); and the counter filter's kills (degaussing, counter fuze, pure anti-mine paravane, torpedo-only boom, fire ship). By Eric on 2026-09-09 (catalog v3 R4): the damage-reduction buff consumable. *(The match consumable pool is a pre-match server insertion, not a card effect and not a draw weight — it reopens none of these.)*

**Parked (open, not dead).** By the forge: positional slots and per-slot arcs (the arc model — direction from the slot, traverse from the item — stays on file); the pinned-card spawn (a CONFIG-gated experiment against the weighted first draw); a passive per-level heal; draft mode (#73); revealing enemy decks to players (Eric: *"if it's in results I should see it in history. Or maybe not"*). Left open by the 2026-09-01 session: ghost decks (#63 — bots sailing anonymized player decks; the forge notes it as a later change of source, not mechanism); card kinds Eric left live but unruled — timed buffs (*"maybe"* — now live as SHIELD BLOCK, SMOKE SCREEN and CHAFF, all timed), drawback cards (*"maybe"*), signal cards (*"unknown"*). Parked by the 2026-09-04 session: WIRE GUIDANCE and WAKE HOMING as torpedo add-ons (Eric on the second: *"How many homing cards do we need, especially when a player can stack them?"*); DRIFTING MINES (needs a currents system); MINE SWEEPING (mines are already counterable-but-hard); a RADAR-ABSORBENT HULL / detection-vs-anti-detection axis, returnable only if a radar-range card ever returns; chain-shot-style verbs as per-weapon authoring options; an AMPHIBIOUS hull with shallow draft; the Carrier's spotter plane. **Unruled proposal, no Eric position on record:** deck codes (#64).

**Not planned without design-first work:**

- Mobile/touch support

*(The Carrier and playable submarines moved from this tier into the sequenced Deferred classes bench above — their design-first requirements stand.)*

---

## Assumptions and Dependencies

**Assumption index** (inline `[ASSUMPTION]` tags):

1. **CONFIRMED (built).** AI combatant bots (Solo vs AI) are driven through the same input pipeline as every ship, and see the world only through the same perception boundary every human does. *(Enemy Design and AI)*

**Open design notes** (inline `[NOTE FOR DESIGNER]` tags and indexed open items):

1. **RESOLVED, then superseded.** The 2026-07-22 ruling gave the Mine Layer the **Decoy Buoy** and an activateable mine; both halves have since moved — the buoy became the **Radar Buoy**, and the mine became a click-aimed rear-sector weapon (2026-08-19). See Weapon Systems. **Superseded again (catalog v3, 2026-09-09):** the Radar Buoy is deleted and a DECOY BUOY *consumable* returns, open to every deck (R1/R36). *(Weapon Systems)*
2. **RESOLVED (the deck model), re-read by v3:** "boons, not stat multipliers" (2026-07-16) vs. "most upgrades are stat increases" (2026-07-19) — resolved as "commons are the stat ladders, rares are the nature-changers", which v3 restates without rarity: a ladder carries the weapon and its authored tier bundles, add-ons are the nature-changers. *(Upgrade economy)*
3. **RESOLVED (2026-07-23, Eric), extended since:** per-weapon firing-arc geometry — gun and star shells 360°, torpedo bow ±30°, broadside twin sector at ±90°, mine and radar buoy click-aimed in the rear sector. **Re-cut by catalog v3 (2026-09-09):** five bow sectors, two twin sectors, three 360° weapons, and the rear sector shared by both mine lines and the decoy buoy; the radar buoy is gone — see the arc register in Aiming and Combat. *(Aiming and Combat)*
4. **RESOLVED (2026-08-21, Eric): the precision bonus is DROPPED.** Never built, never ruled in; removed from the design. The 2026-07-16 decision-log entry stands as history. *(Aiming and Combat)*
5. **RESOLVED (Story 7-6, 2026-08-21):** DESIGN.md's real-time-era reconciliation pass is done. *(Art Style; E7)*
6. Sensor-forward class real name — tracked in Out of Scope; needed only when it comes off the backburner.
7. Minutes-1–3 pacing ("Quiet Dread" — protect or fix) is a playtest call; the ring rhythm's minute-1 "clear seas" is the current answer.
8. **RESOLVED (Eric, 2026-09-03): the deck is 40 cards, final for launch.** The forge's 25–40 band test is dropped; min/max stay CONFIG dials, untested. **40 is the AUTHORED size** — the deck at queue is 50 with the match consumable pool (catalog v3 R4, 2026-09-09). *(The Deck Model v3)*
9. **RESOLVED (Eric, 2026-09-03): `1`–`4` by default.** User-configurable controls are a *maybe* — recorded, not scoped. `Shift` joined the bindings as the universal boost (catalog v3 R7). *(Controls and Input)*
10. **RESOLVED (Eric, 2026-09-03): starter decks start at 5 heals**, harness-tuned per hull. **Stands on sheet v2 (2026-09-09)**; the card's cap is 5 (R13), and the match pool may add up to five more. *(Healing)*
11. **v3 — the unlock economy: one of three still open.** The matches-to-full-catalog number was OPEN with **no placeholder** (the 40–60 band is withdrawn) pending the catalog's line count — **the count is 29 as of 2026-09-09, so the dial can now be set**; the flat unlock price stays [DRAFT]; the ~100-cards / ~25–30-lines breadth target is **CONFIRMED and MET** (114 cards / 29 lines). *(Account progression)*
12. **v3 — consumable content and tier-bundle contents.** Both are the catalog rework — an Eric-authored document, out of GDD scope. **Next step ruled 2026-09-03: brainstorm the consumables first** (`gds-brainstorm-game`; the 2026-09-01 session's 14 facilitator-proposed cards are input, not decisions), then author catalog v3 — which now also owns each card's copy count and the heal's maximum (notes 10, 18). E8 stories wait on it. *(Consumables; The Deck Model v3)* **Brainstorm done 2026-09-04** (`_bmad-output/brainstorming-session-2026-09-04.md`: 15 equipment lines, three launch consumables settled, Shift boost universal, radar buoy → consumable); Eric authors catalog v3 next. **Catalog v3 walked and ruled 2026-09-09** (`catalog-v3.md` alongside: 29 lines / 114 cards, three 40-card starters, the match consumable pool). **CLOSED 2026-09-09: this update folds catalog v3 in.** The catalog stays Eric's document and the per-tier authority; the GDD now carries what each line is, its tier I and its cap, plus the model changes (the match consumable pool, the Shift boost, the retuned RELOAD ladder and equipment reload step, the TURNING ladder, no live-mine cap, the radar buoy's deletion) and the 2026-09-04 session's structural rulings (wake drafting, shoot-any-spotted-mine, the torpedo split, missiles). The session's "15 equipment lines / three consumables" became 11 / 5 on the sheet. What remains open is indexed at notes 19–22. *(Consumables; The Deck Model v3)*
13. **RESOLVED (Eric, 2026-09-03): there is no "replace which" flow.** A legal deck carries at most three lines that fit an equipment slot, so the three weapon slots can never overflow; the carried "fourth weapon = replace which" rule is retired. *(Slot grammar; Legal deck)*
14. **v3 — the shipped per-level auto-heal.** Its fate under the heal card is unruled — see the NOTE in Healing. **Eric, 2026-09-03: left open on purpose; decide at the balance pass once bots are on v3 decks.** That pass is unblocked as of 2026-09-09 — the catalog exists to put bots on. *(Healing)*
15. **RESOLVED (Eric, 2026-09-03): the E8/E9 seam stands** — two GDD epics, one release. *(Development Epics)*
16. **v3 — the account store's architecture.** First persistent store + first non-ops HTTP API — `gds-game-architecture`'s call, and it must not pre-empt the deferred Story 7-7 split. **Eric, 2026-09-03: delegation confirmed as written, no design-level constraint added.** *(Technical Specifications)*
17. **RESOLVED (Eric, 2026-09-03): the no-torpedo-variety veto is narrowed to within-a-weapon.** Several torpedo designs may exist as separate catalog lines (each a fixed design per slot, and each costing one of the deck's three equipment lines); a selector inside one weapon stays banned. The family-targeting example stands. **Confirmed by the sheet (2026-09-09):** three torpedo lines — Light, Heavy, Supercavitating — one design per slot; ACOUSTIC HOMING on Light and Heavy, never the Supercavitating (R22). *(Weapon Systems)*
18. **RESOLVED (Eric, 2026-09-03): a consumable line's cap is its own authored copy count**, set per card in the catalog like a ladder's 5 or an add-on's 1. No third composition rule; a heal line's count is a catalog number Eric sets. **Filled in 2026-09-09:** every launch consumable is cap 5 (R13, R36–R39); a ladder's cap is 4 or 5 rather than a flat 5. *(The Deck Model v3)*
19. **Catalog v3 — the LIGHT TORPEDO against the "torpedoes outrun every hull" law.** R18 gives it 45 u/s at tier I — the Torpedo Boat's own base max — and 55 at tier V, which only equals the SPEED-capped TB and is 13.75 u/s short of that hull boosted (68.75, if R9's "+25% of the hull's max speed" scales the ladder-raised max; 56.25 if it scales base — itself unruled) — while the law says every torpedo outruns every hull at base speed and can never self-hit. It launches abeam, not from the bow, so the self-hit geometry differs; whether the law is narrowed to bow-launched fish, the light torpedo's speed moves, or a beam-launched fish simply cannot self-hit is Eric's re-reading. Numbers stand as ruled until then. *(Weapon Systems)*
20. **Catalog v3 — the match consumable pool at its two edges.** (a) Whether the results screen reveals the pool after the match: the facilitator's reading is that "brought, drawn, taken" shows only the pool cards you drew, because the set is hidden during play. (b) The pool deals every captain consumables regardless of what their account has unlocked: read as a preview, not power, because unlocks are variety-only. Both are facilitator readings awaiting Eric. *(Consumables; Account progression)*
21. **Catalog v3 — `[DRAFT]` cells awaiting the harness once bots sail v3 decks, and two build-time calls.** Drafts: the TURNING step; the Shift boost numbers; the MACHINE GUN numbers bar its arc; the FLAK GUN base numbers; CAPTIVE MINES' pool 1 / 20 s; SHIELD BLOCK's damage-source scope; the SMOKE SCREEN's self-hiding; the wake-drafting magnitude; the flat unlock price (note 11). Also undecided as design: whether the Shift boost's +25% scales the base max or the SPEED-ladder-raised max; the owner exemption (or not) on the DECOY BUOY's physical block; the machine gun's behaviour when the cursor leaves its arc mid-stream; **and which signals each new line emits** — muzzle flash per shell or per burst for the machine gun and flak gun, and whether a missile or the monitor's plunging shell splashes, flashes and calls its hit like a gun shell (the broadside's per-shell rule is the only one on record). Build-time calls, not design questions (catalog §5): whether the room-wide mine ceiling survives as an engineering guard; whether the missile's en-route direct hit uses the burst figure or a lower contact figure. *(Movement; Weapon Systems; Consumables)*
22. **Catalog v3 — the Battleship's fantasy against its starter.** The class table still promises beam-on "weight of shot" through the broadside, and its own header says the fantasies are what each STARTER DECK delivers; catalog v3's Battleship starter is HORIZONTAL MISSILE · MONITOR GUN · STAR SHELLS with the BROADSIDE GUN an unlock. Either the fantasy text moves to missiles-and-monitor, or the broadside returns to the starter — Eric's call; see the NOTE in Ship classes. *(Ship classes; Weapon Systems)*

*(The gunboat AP-gun form note was deleted with the class, 2026-07-19.)*

**Dependencies:**

- **Boon catalog — DELIVERED, and its v3 re-cut is WRITTEN** (`catalog-v3.md`, 2026-09-09: E2's catalog, rewritten wholesale by Eric on 2026-08-19, re-cut by him again as 29 lines / 114 cards with three 40-card starters and the match consumable pool). This GDD specifies the model — the 40-card authored deck plus the pool, ladders-as-tiers / add-ons-as-nature-changers, copies = tier ceiling, consumables — and the catalog is the per-tier authority, its `[DRAFT]` cells harness-tuned once bots sail v3 decks. E8 builds against both.
- **The account store (v3)** — the first persistent store and non-ops HTTP API; `gds-game-architecture` owns the design. E9 depends on it; the privacy policy gains one paragraph on signed-in accounts.
- **Combat-bot AI — DELIVERED** (E5), distinct from PvE defensive AI; priority profiles, not a difficulty ladder.
- **Self-publishing** replaces the portal dependency: the launch gate is the operator's own — hosting, ad + consent handling, and the privacy policy (E7). There is no third-party portal compliance dependency.
- **Aim reconciliation under latency** (lag compensation vs shoot-at-server-state) is a feel-defining, expertise-heavy call — explicitly delegated to the architecture phase (`gds-game-architecture`); the design requirement is only "feel intact at ~150 ms."
- **Population cold start** needs a real launch-day answer before public beta — launch planning (LAUNCH_PLAN.md), not GDD scope.
- Exact positioning slogan remains open — marketing, non-blocking.
