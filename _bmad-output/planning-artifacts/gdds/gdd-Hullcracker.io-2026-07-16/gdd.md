---
title: Hullcracker.io - Game Design Document
game_type: shooter
platforms: [desktop-browser]
created: 2026-07-16
updated: 2026-09-03
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

A running build exists — v0.17.132 as of 2026-08-28 (TypeScript monorepo: authoritative 20Hz server, client prediction, two-tier fog of war, three ship classes, real firing arcs, phased storm, 5,000+ automated tests). *(It was v0.16.0 with 649 tests when this GDD was first written.)* This GDD consolidates the game brief (2026-07-15), the identity-fork forge resolution, and the brainstorming sessions (2026-07-15; supplemental classes/weapons/upgrades session 2026-07-19, including its same-day party-mode review rulings) into the canonical design document for the beta. **The 2026-09-03 update folds in THE DECK MODEL v3** — the metagame brainstorm of 2026-09-01 (82 ideas, diffed against the 2026-08-27 equipment-rework session) hardened by the `deck-model-v3` forge (`_bmad-output/forge/deck-model-v3/forged-idea.md`), which Eric ruled ships as **one unit**: accounts, authored per-hull decks, consumable slots, heal-as-card, and gun-only spawns.

Comparables: Mk48.io (closest, maintenance mode), Maelstrom (validated the fantasy, died anyway), Drednot.io, Ships 3D. Reference DNA: Battleship (hidden info), World of Warships (class fantasy, gunnery feel), Hades (promise/RNG contract), Risk of Rain (stackable upgrades, named thresholds), Apex Legends (kits as verb focus, not exclusivity), surviv.io/ZombsRoyale/OpenFront.io (top-down BR structure).

References of the form **#NN** throughout this document cite idea numbers in the brainstorming session (`_bmad-output/brainstorming-session-2026-07-15.md`). Decisions marked **2026-07-19** come from the supplemental session and its party-mode addendum (`_bmad-output/brainstorming-session-2026-07-19.md`). Passages marked **v3** carry the deck model v3 rulings (the 2026-09-01 metagame session and its forge of 2026-09-02); a **#NN** reference inside a v3 passage cites the 2026-09-01 session's numbering.

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
The lobby pick is a genuine promise: a hull, and a deck you built — and **something to DO at 0:00**, not a skin over sameness. XP levels — a passive tick everyone earns, accelerated by kills — draw from that deck and grow the promise into a build that is *yours* by the endgame. RNG only governs what was never promised (the Hades contract): the deck's composition is promised, the order it arrives in is not. *(v3 re-anchored the promise. It used to be "you hold your class weapon at 0:00"; every hull now spawns with the deck gun only, and the promise is the deck itself — Eric: "If I put some weird off-meta shit together and it worked, I bet that feels fucking great.")*
*Steers:* class design (class = hull envelope + starter-deck tilt; the catalog is hull-agnostic and nothing is class-locked), the deck and its draw rule, upgrade stacking as copy counts, anti-snowball tuning.

**4. The Ocean Keeps Getting Smaller**
The storm closes in legible phases, forcing every hunt to a conclusion. The Endgame Guarantee — a final ring two truesight diameters across — forces combat while keeping the sensor game alive to the last shot. No match ends in mutual avoidance.
*Steers:* zone timeline and pacing, endgame tuning, the Rat Covenant (hiding is legal but priced). *(Roster-scaled map sizing was proposed and **cancelled** — epic-6 amendment 11: the ocean is one fixed radius for every roster.)*

**Pillar guardrails** (carried from the brief):

1. **Information noise must never bury the hunt** — sensor features may not drown the chase-and-shoot game in indicators.
2. **When deduction stops paying, fix it on the sensing side** — never with stat band-aids.
3. **Arcade feel is the prime directive** (2026-07-19 session law) — the complexity budget is precious; no ambient-simulation mechanics (funnel smoke, oil slicks, fire damage states, wreck salvage stay rejected as simulation creep).

### Core Gameplay Loop

One cycle, run continuously from spawn to sinking:

1. **Sail / sense** — work throttle and helm while the truesight bubble and radar sweep feed fragments of the ocean. *(Pillars 1, 4 — the storm dictates where sailing is viable)*
2. **Deduce / position** — turn blips, flashes, and silence into a mental picture; maneuver for the engagement you want. *(Pillar 1)*
3. **Strike** — commit the weapons your deck has dealt you, within their real firing arcs, and spend the consumables you stocked. The slot grammar is universal; the contents are not — you strike with what you built and what you've drawn. *(Pillars 2, 3)*
4. **Survive the reply** — striking reveals you; helm through the answer. *(Pillars 1, 2)*
5. **Grow** — XP levels (passive tick plus kill bonuses) each draw four cards from your deck; take one to deepen your promise. *(Pillar 3)*

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
| **Battleship** | Massive, heavily armored, main-battery gunnery: dominates the open ocean by weight of shot. *(The 2026-08-19 broadside rework moved the fantasy off "outranges everyone" — its battery is the only weapon in the game that does not reach the full radar horizon — and onto "turn your beam to it and it deletes you.")* |
| **Mine Layer** | The trapper: area denial, reading where prey will flee and having already been there — "you died to a decision I made ninety seconds ago." |

**The roster formula (ratified 2026-07-19, re-cut by v3):** every class = a **hull envelope** (size, speed, toughness, turning) + **a deck**, on top of the shared deck gun. The 2026-07-19 form — envelope + one signature ability on cooldown + (sometimes) one signature weapon — survives as the SHAPE of each hull's starter deck, not as a fixed fit: the signature pieces are the lines the starter is built around, and a deck belongs to a hull as a **label**, never as a lock. Nobody counters a class; everybody plays around what a deck can deal. Quality bar: **six great classes beat eight half-assed ones** — the beta ships three great ones. Hull envelopes differentiate feel; decks differentiate playstyle.

**First-run class select (ruled 2026-07-19):** three cards, forced meaningful choice, **no pushed default**; the Torpedo Boat sits pre-focused for keyboard flow.

**Deferred classes:** the six-class expansion blueprint (Submarine first, then Carrier; Decoy Ship banked) lives in Out of Scope — deferred, not designed-in.

**Slot grammar (universal; contents from the deck) — v3.** Every ship fits:

1. **The deck gun** — universal and slotless: every hull carries the **same standard gun** (the "standard gun" / "universal gun" of every earlier passage), working the same way, from 0:00. Short cooldown, basic damage, available to use most of the time. It is the only thing anyone holds at spawn.
2. **Three generic weapon slots** (`Q` / `E` / `R`) — **empty at 0:00** and filled by the deck: taking the first copy of a weapon's line fits that weapon into an open weapon slot. Slots are generic — there are no positional mounts and no per-slot arcs (parked; Eric: *"I don't think we'll need the mechanic"*) — and each weapon carries **one fixed firing arc** of its own. Drawing a fourth weapon with all three slots full means **replace which** — there is no hand, no swap-out, no sell-back. Two laws carried from the equipment forge: **swap cheese is a NEVER** — fitting or replacing a weapon may never yield more shots than leaving it alone — and **the slot keeps its clock across replacement**, so a fresh weapon never skips the reload of the one it replaced (the 2026-08-27 session's ~5 s ready floor is the carried draft figure, not a ruling).
3. **Four consumable slots** (`1`–`4` with the refit window closed; `Z`–`V` is the tested alternative) — stocked from the deck, spent by key. See Consumables below.

Class differentiation lives in the hull envelope and the deck's composition — never in the gun.

*(Superseded by v3: the 2026-07-16 grammar of "two special abilities fitted at 0:00 + one extra slot filled by an acquisition card". Weapons are now deck lines like everything else, and the acquisition card is gone — copy 1 of a weapon's ladder IS the weapon.)*

**Movement — telegraph and helm.** Set-and-forget engine orders (9-detent telegraph) plus rudder; ships have separate acceleration and braking rates, and rudder authority reduces below steerage speed. Kinematics are per-class envelope values (current reference across the three hulls: max speeds 35–45 u/s, turn rates 0.4–0.8 rad/s — all tunable).

**Universal sensor suite (Pillar 1).** Two senses ship on every hull: a **truesight bubble** (live, LOS-clear contacts; reference 330 u) and a **rotating radar sweep** (reference 660 u, one revolution every 4 s) that paints decaying phosphor returns when the beam crosses a ship it can reach. Islands block both — truesight as a hard silhouette, radar through the height-aware shadow model below (Eric's realism ruling of 2026-08-02: islands block *every* sensor, at every range).

**Hydrophones — DEFERRED.** The passive listening ring (bearing-grade audio detection of engines and torpedoes in the water) is **not built**, and the 2026-07-19 "core kit on every hull, never equipment" framing no longer stands as a design law — Eric, 2026-08-21: *"very deferred. sonar might come back in the future, but radar is plenty deep enough."* The shipped bearing surface is the **foghorn chevron**: a sounded horn reaches listeners across the map, and the hearer's HUD draws a chevron on its bearing with a coarse distance band. There is no listening ring and no passive engine-noise sensor.

**Radar returns carry no identity — this supersedes the 2026-07-16 "class-legible blips" ruling.** The pose-on-the-wire *silhouette* grammar was built, tried and **retired**. A return is a coverage footprint painted onto a world-anchored radar lattice: no class, no speed, no heading, no ship id. What it does encode is physics — return strength against range (a near contact reads hot, a far one cold) and the shape the beam actually saw. Reading a contact's course is the player's job: you infer it from successive paints and from its **wake**, never from a label. Projectiles materialize at the sight boundary with no range-derivable fields. Counter-intel law: **lies must live on the server** — deceptions must be indistinguishable on the wire. The live case is the jamming buoy, whose false returns are generated server-side and are wire-identical to real ones.

**The eighths ladder — one ruler for every sensor boundary.** Intel range is a single number, and each boundary is a named eighth of it: **3/8 detect** (where mines and torpedoes become visible), **4/8 truesight**, **5/8 muzzle-flash and wounded-smoke carry**, **7/8 far radar** (where a return reads cold rather than hot), **8/8 radar**. The ladder is **frozen at base for every captain in every match** — no card widens it (the range-upgrade line was deleted, 2026-08-20) — so all five rungs are the same numbers for everyone, all match.

**Islands cast real radar shadows.** Terrain is a height field, not a flat silhouette, and occlusion is height-aware. A low island no longer hides a distant ship outright; a real island reliably breaks a lock; and the scope paints a mountainside *up to its peak* on the side facing you, precisely because you look up at it. Once a bearing is blocked it stays blocked out to the rim — a shadow is a residual reach, never a dark band with clear water behind it.

**Ships leave wakes on the scope.** Disturbed water is world state and paints as a fading ribbon behind every moving hull — including torpedoes, whose fish itself is still never painted. A wake outlives its ship, so a sunk hull leaves a track pointing back the way it came. The fastest hull's full-ahead track is exactly the 3/8 detect rung: your wake reaches as far behind you as detect reaches around you.

**Upgrade economy (Pillar 3).** XP-based leveling: a slow passive XP tick (design target ~1 level per minute) **plus** kill bonuses. Each level opens the refit window (`Tab`) on a **pre-drawn offer of 4 different card lines from your own deck** (drawn at earn-time; reopening the window never rerolls — ratified at 4 choices during the UX phase, 2026-07-16). One level buys any one card. The passive tick is the anti-snowball floor — everyone grows; kills grow you faster. Kill-bonus sizing is an open balance item (see Progression and Balance). **The Tab offer is untouched by v3** (Eric's first lock): no hand, no second clock, no storefront — merge, lock, sell and refresh are all dead.

**THE DECK MODEL v3 — supersedes the 2026-07-30 personal-deck model.** A captain brings a **deck of exactly 40 cards, authored for one hull**, and every level draws from it. *(The deck-size floor and ceiling are dials; a 25–40 band MUST be tested before 40 is final — Eric: "in my mind right now the total deck size all-included is 40 cards.")* What replaced what:

- **The catalog is hull-agnostic and nothing is class-locked** (Eric: *"NO"*). A deck belongs to one hull as a **label** only. Class tilt lives in **starter-deck composition** and in an author's copy counts — never in the draw.
- **Card model (A).** A weapon is **one ladder line**: copy 1 *is* the weapon at base (it fills a weapon slot), copies 2–5 are **authored tier bundles** for that weapon. Separate **one-copy add-ons** (an extra tube, a doctrine verb such as ACOUSTIC HOMING or CAPTIVE MINES) are drawable at any time and can be **held ahead of the weapon** they modify (Eric: *"it's a choice"*). Universal lines (HULL, SPEED, COOLDOWN, SWEEP, the gun's BARREL/TURRET) are ladders on the same rule. **Copies = tier ceiling**: how many copies you put in the deck is the highest tier you can reach — a deliberately capped line is a build decision, not a shortfall. Direction of travel: add-ons target a weapon **family** (ACOUSTIC HOMING on light *and* heavy torpedoes); multi-copy add-ons are possible later. *(The catalog's contents — which lines exist, what each tier bundle does — are an Eric-authored document in the `7-5-decks.md` tradition and are out of this GDD's scope; the shipped 28-line catalog already carries the ladder + one-copy add-on shape.)*
- **Draw rule: equal weight per card.** No rarity weighting, no class weighting, **no pity** — the 2026-07-30 soft pity is retired. *Deck size is the pity, composition is the tilt* — measured by the forge against a 14-line, 40-card deck: a one-copy line is offered at least once in 66% of 8-pick matches, 82% at 12, 90% at 15 and 97% at 20 (against 55–60% in the 60-card decks that bought the 2026-07-30 pity). The harness pins the live one-copy appearance rate. The only smoothing anywhere in the game is the level-zero opening draw (see The opening, under Player Progression).
- **A card leaves the deck when it is taken** — a consumable on pick, a ladder copy when fitted — so a build's ceiling is something a player can count. **Exhaustion is legal but should be rare** and means you are at maximum power (Eric: *"ideally if you are gaining a level you've always got choices"*). The HUD carries a **draw-pile counter** (`23 LEFT`) — Eric: *"Yes."* Deck state is server-private; only the four drawn ids ride the wire.
- **Legal deck** — checked by the server once, when you queue, and **frozen at queue** (later edits apply to the next match): exactly the configured size; per-line copies ≤ the line's maximum (5 for a ladder, 1 for an add-on; **a consumable line's maximum is unruled** — the starter's 4–5 heals imply at least that many, see open note 18); every card unlocked on the account; **no composition requirements** — a gunboat deck (nothing but gun ladders) and a zero-heal deck are both legal by design (Eric: *"I'm frankly not even sure I want the default set to be required"*). **Starter decks are ordinary decks** that pass the same rules against a fresh account's unlocks.

Upgrade *content* follows the **Hades-hammer model** (Eric's model, captured 2026-07-19): most cards raise stats, but some **fundamentally change how a piece of equipment behaves** — same slot, different verb. Under v3 the split reads: **a ladder carries the weapon and its authored tier bundles; add-ons are the nature-changers.** Rarity is no longer a draw weight of any kind — the old "commons / rares" reading is retired with it. Add-ons (doctrines) are independent added verbs and stack — a star-shell build can run PHOSPHOR *and* DAZZLE, a mine build CAPTIVE *and* PROP-FOULING; exclusivity is gone from the game entirely. **Variant behaviors are expressly upgrades — no one starts with one; class identity never depends on them** (design law, 2026-07-19, unchanged).

**Consumables — v3.** Four consumable slots on every hull, keyed `1`–`4` with the refit window closed. A consumable is a deck card: taking it from an offer stocks it in a slot, and **it leaves the deck on pick, not on use**. **Full slots grey the consumable in the offer and the server refuses the pick** — there is no instant-use-on-pick; the never-rerolling offer is itself the mechanism (Eric: *"use one and then pick it if it's what you really want"* — spend a slot, reopen `Tab`, the card is still there). Slot contents are server-owned ship state, so a refresh or reconnect keeps them for free. Two activation shapes are an engine requirement, not a content taxonomy: **key fires** (instant, like the speed boost) and **key primes, click fires** (aimed, like `Q`/`E`/`R`, as a one-round pool on the same equipment interface), and the card face says which. **Content is open** (Eric: *"consumables should be able to do pretty much anything; it depends on what ideas I have"*); the categories he named in the 2026-09-01 session are **Denial, Intel, Ordnance**, with Terrain to keep in mind. No consumable ships without a bot use rule (see Enemy Design and AI).

**Healing IS a card now — v3.** The `5` key and the permanent DAMAGE CONTROL rail are **retired**. DAMAGE CONTROL becomes a **stockable consumable**: the shipped effect is unchanged (100 hp — 50 instant plus 50 pooled at 5 hp/s), and the starter decks carry **4–5 copies each [DRAFT]** (derived from Eric's 2026-08-27 sketch of one or two heals per eight levels; harness-tuned per hull). Heals must be **scarcer than today, and never renewable** (#6 recycling rejected). The 2026-07-16 law — self-heal is never a ship feature — still holds: healing remains an economy choice, drawn from the deck and paid for with a level. **"Can heals be spent during the sudden-death collapse?" closes by construction** (forge lock 7): the bound is finite — at most four heals stocked at any moment, and never more than the deck carries. A passive per-level heal as a v3 mechanism is **parked**. [NOTE FOR DESIGNER: the FREE per-level auto-heal that shipped 2026-08-23 — a fraction of missing hull restored every time a level is earned, layered under the paid heal because heals were eating ~59% of level spend — is not mentioned by the forge. Whether it survives alongside the heal card, or is the thing "parked" retires, is an Eric call.]

**The storm (Pillar 4).** A damage-only zone shrinks the ocean in **legible phases** — **four ring groups** of ~4 minutes each, on an internal minute rhythm (see Difficulty Curve). Groups 1–3 bring the ocean down to the Endgame Guarantee ring by **12:00**; group 4 is **sudden death**, collapsing that final ring onto its own centre between **15:00 and 16:00**, at which point the whole map is storm. Storm never blinds sensors; it only damages (reference 4 hp/s, with **no damage ramp** — the collapse is geometry, not escalation). The **Endgame Guarantee**: the endgame ring's diameter is **2 standard truesight diameters** — close enough to force combat, far enough that radar is still needed and close-range hulls hold no clear advantage over long-range ones.

### Controls and Input

Desktop keyboard + mouse. Design intent: **hands describe the fantasy** — left hand helms the ship, right hand fights it.

- **Keyboard:** telegraph detents (set-and-forget engine orders) + rudder; weapon-slot priming (`Q` / `E` / `R` — the gun is always selected and needs no key); **consumable slots `1`–`4` with the refit window closed** (v3; `Z`–`V` is the tested alternative — Eric: *"1-4 make sense, so do ZXCV… I'm open minded"*); the foghorn; and the **refit window** — `Tab` opens it, `1`–`4` take a card. **The `5` key is gone** with the DAMAGE CONTROL rail (v3: the heal is a card). There is no chord binding of any kind.
- **Mouse:** aim freely — weapons fire only within their real firing arc; click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback rather than silence.
- Match completes with keyboard + mouse only. Touch/mobile input is out of scope for beta.

---

## Shooter Specific Design

### Weapon Systems

**Fitted loadouts — the promise at 0:00 is the DECK (v3).** The **deck gun is universal** — every hull carries the same standard gun, working the same way (short cooldown, basic damage, available most of the time), and **at 0:00 it is all anyone holds**: the three weapon slots and four consumable slots are empty until the deck fills them. Class identity comes from the **hull envelope** and the **starter deck's composition** — the table below names the signature pieces each starter is authored around. Contents are **focus, not exclusivity**, and the mechanism is the deck: **any weapon or ability in the catalog is a line any hull may run** once unlocked — a Battleship deck can carry torpedoes, a Mine Layer deck a speed boost — and no card is class-locked.

| Class | Gun (slotless, from 0:00) | Starter deck's signature weapon | Starter deck's signature ability |
|---|---|---|---|
| **Torpedo Boat** | Standard gun | Torpedo tubes | Speed boost — several seconds of raised speed (inherited from the cut gunboat, ruled 2026-07-19; fits the "zip around firing torps" fantasy) |
| **Battleship** | Standard gun | **Broadside barrage** — replaced the long-range cannon outright (2026-08-19) | Star shells (#12) — illuminate a region of radar-space to truesight, then hit from distance |
| **Mine Layer** | Standard gun | Proximity-fused mines (#81) | **Radar buoy** — a stationary, destructible sensor that relays its own returns to you; replaced the decoy buoy outright (2026-08-19) |

**The smoke screen (#26) is DEFERRED.** It was orphaned out of the class kits on 2026-07-19 and earmarked as equipment/boon-pool content, but no smoke screen was ever built and it is not in the shipped catalog. Eric, 2026-08-21: *"Deferred, I think it will probably come back at some point."* Deferred, not cut.

**Mine Layer kit — CURRENT.** The signature weapon is the **Naval Mine**; the second special is the **Radar Buoy**, which replaced the Decoy Buoy outright on 2026-08-19. **The decoy role is gone from the game — nothing fakes a ship contact any more.** (This supersedes the buoy half of the 2026-07-22 ruling, and the "drop dead astern" half of its mine mechanics.)

- **Naval Mines:** **click-aimed into a rear sector** — astern ±60°, out to a fixed leash (reference 150 u) — and armed after a delay. An enemy pass-over trips a **blast** damaging every non-owner hull within the blast radius (blast radius > trigger radius); the owner's own gunfire **shoots armed mines to detonate them early**; **live cap 5**, oldest silently evicted; **no expiry** (they persist until detonated). Two mine doctrines exist as cards and **stack with each other**: **PROP-FOULING** (blast victims are slowed for a few seconds) and **CAPTIVE MINES** (the mine stops detonating on contact and instead holds one torpedo, launched with lead at the first hostile to enter a much larger trigger ring — a moored torpedo mine, expended on fire, which cannot be command-detonated).
- **Radar Buoy:** a stationary, destructible buoy placed in the same rear sector, carrying **its own radar set and its own sweep**, and relaying **radar returns only — never vision** — to the captain who placed it, marched from the buoy with its own island LOS and terrain shadowing. If the buoy cannot see it, the buoy cannot report it. At base its life is shorter than its cooldown, so one buoy at a time with a real dead gap between them: a buoy is a commitment, not permanent cover. Two doctrines: **GUN BUOY** (it defends itself autonomously, shooting anything its *own* radar sees) and **JAMMING BUOY** (it seeds server-generated false returns inside its circle, wire-indistinguishable from real ones — the counter-intel law's live case).

**Broadside barrage (Battleship).** A click to either beam fires that whole side's battery in one barrage. Each turret is a real mount with its own firing arc: every turret that can bear fires exactly at the clicked point, and every turret that cannot fires at its own arc limit, at the click's *range*. Nobody designs a spread — it **emerges** from guns that cannot all bear on one point, so full convergence is something you earn by aiming near maximum range abeam, or by buying traverse. Each shell is a real gun-pattern shell that bursts at its own point and emits its own signals; there is no salvo aggregation. **It is the first weapon in the game that does not reach the full radar horizon** — its range is the 5/8 rung of the eighths ladder.

**Weapon behavior laws (settled):**

- All weapons fire within **real firing arcs**; aim is never clamped — the arc gates firing, and out-of-arc clicks are denied with explicit feedback (deny-gate, Eric ruling 2026-07-23, Story 1.10).
- Every fitted system has its **own ammo pool and reload timer, and every reload ticks every tick** regardless of which weapon is selected — switching weapons is tempo, not penalty.
- **Torpedoes outrun every hull** at base speed and spawn with real bow clearance plus a brief owner-only grace — they can never self-hit at base speed. The fish itself is never painted by radar — it is spotted inside the **3/8 detect rung** — but its **wake** paints on the scope even where the torpedo does not. *(Hydrophones were the planned torpedo warning; they are deferred — see Universal sensor suite.)*
- **Mines** are **click-aimed into a rear sector** rather than dropped dead astern (superseding the 2026-07-22 stern rack), arm after a delay, trigger by proximity, and are capped per-player (live-mine cap; oldest evicted) and globally. On trigger they **blast** — every non-owner hull within the blast radius (larger than the trigger radius) takes full damage; the owner's own gunfire **detonates its own armed mines early**; mines **persist until detonated (no expiry)** (Eric ruling 2026-07-22; aimed placement added later). A **captive** mine is the exception to the blast rule — it launches a torpedo instead.
- Numbers (damage, reloads, ranges, speeds) are design targets and move with every balance pass; current reference values are gun 15 hp burst / 5 s, torpedo 50 hp / 30 s, mine 55 hp / 15 s, broadside 15 hp per shell × 4 shells / 18 s, star shells 20 s. Hull HP is Torpedo Boat 250 / Mine Layer 300 / Battleship 350.
- **Compass vetoes stand for the new armory:** no torpedo variety (one torpedo design per fit — a doctrine card changes how that one torpedo behaves rather than adding a second design to choose between, so the veto holds; ruled compatible 2026-07-19) [NOTE FOR DESIGNER: v3's family-targeting example — ACOUSTIC HOMING on light *and* heavy torpedoes, carried from the 2026-08-27 session — presupposes two torpedo designs in the catalog. Either the veto narrows (one torpedo design per *slot*, several in the catalog) or the example is illustrative only. Eric ruling needed; see open note 17.], no damage-control parties, no sectional damage — WoWS-creep stays out. *(The DAMAGE CONTROL heal is a deck card spent from a consumable slot, not a WoWS-style repair party: no crew, no timer to manage, and never renewable.)*

**Weapon feel.** The gunnery-feel package from the brainstorm's information-texture bundle (#90) is design intent: **fall-of-shot spotting** (#21 — your splashes are visible in fog, so misses become information and you can bracket-and-walk fire), **the Hit Call** (#19 — a muffled boom and orange bloom confirm you connected without revealing how badly), and **muzzle flash carries** (#34 — firing lights the fog beyond truesight; shooting is being seen). Together: every trigger pull produces information for someone (Pillar 1).

### Aiming and Combat Mechanics

- **Top-down mouse aim.** Aim is free; the arc gates firing, not the cursor — click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback, never silence.
- **Arcs — ratified 2026-07-23 (Story 1.10), extended since.** The **gun and star shells** fire **360°** — no mounts, no arc. **Torpedoes** launch in a **bow sector of heading ±30°**. The **broadside barrage** fires in a **twin sector**: two mirrored beam sectors centred at heading ±90°, each 60° to a side, leaving 60°-wide dead zones dead ahead and dead astern — the side containing the click is the side that fires, and a click in neither is denied. The Mine Layer's **rear sector** (mines + radar buoy) is **click-aimed** astern ±60° out to a fixed leash, superseding the original dead-astern rack. The speed boost aims nothing. Denied fire is authoritative as well as predicted: the server sends a self-private denial signal (out-of-arc / no-ammo / cooling / blocked placement) so denial feedback is never silent — including island- or boundary-blocked placements, which are refused without spending the charge.
- **No dispersion.** Shots go exactly where they are aimed; travel time is the skill counterweight. Projectiles, never hitscan — leading the target is the game.
- **Flight rules:** torpedoes run until they hit something; gun shells fly to the clicked point or the first thing they hit on the way, whichever comes first.
- **No damage falloff.** Distance never reduces damage.
- **Flat damage model.** No sectional damage, no critical hits, no weak points (compass-vetoed as WoWS-creep) — each weapon deals its damage to a single hull pool, modified only by upgrades.
- **Combat is sensing (Pillar 1).** Firing produces muzzle flash beyond truesight, splashes visible in fog, and hit calls — every trigger pull is also information, for you and about you.

### Enemy Design and AI

**No bot-fill in standard lobbies.** A standard BR match is humans only: minimum 2 human captains, pooled in a queue that forms the match on a fill-or-timer. Bots never masquerade as players. *(Roster-scaled map sizing was cancelled — every match gets the same fixed-radius ocean.)*

**Solo vs AI mode.** A dedicated mode reached straight from the home screen — with no queue at all, because a lobby of one has nothing to pool. It mints a private match of **one human captain plus 19 AI captains**: real opponents playing the battle royale, not target practice. An AI captain is a full participant — roster row, personal hue, ship class, XP, deck, kill-feed line, eligible for the KILL LEADER throne — and **it can win the match**. Its only knowledge of the world is what the perception boundary hands it: bots fight in the same fog humans do, and they are driven through the same input pipeline as every ship. AI captains come in per-class **priority profiles** (two per hull) rather than a difficulty ladder. **v3:** each profile carries an **authored 40-card deck in the player deck format**, legality-checked when the room is built — the bot is the first customer of the deck rules. Every consumable card ships with a bot use rule (a **total** consumable-tactic table: instant cards keyed off profile state such as the heal threshold, aimed cards through the weapon solve), so no card can enter the catalog without a bot that knows how to spend it. The batch-sim harness runs two deck arms from day one — **authored** decks and **random-legal** decks — and pins these bars: the starter-vs-veteran win band, the two golden decks (a torpedo-less Torpedo Boat, a pure gunboat), heal-take rate, levels wasted, and the one-copy appearance rate.

**Roving PvE drone fleets — in all BR modes.** Every match (standard and Solo vs AI) contains a few roving PvE drone fleets that can be hunted and killed for XP:

- Ships carrying a basic gun on a longer cooldown, used **only to defend themselves** — they never hunt players.
- Three tiers: **common** small ships (1/4 level per kill), **uncommon** medium ships with more HP (1/2 level), **rare** large ships with even more HP (3/4 level). *(Raised from ¼/⅓/½ on 2026-08-16.)*
- They rove; finding them is part of the sensor game.
- They are an XP source feeding the upgrade economy, not world density — the forge's rejection of "PvE fleets as mandatory world density" stands; these are bounded, huntable pockets.

**Rules that hold for every non-human ship:** driven through the same input pipeline as human ships (no special code paths) and subject to the same perception rules.

**Win check counts match participants only — in every mode.** Roving PvE fleets are not participants: they never need to be destroyed to claim the win, and they can never win. In a standard match the participants are the human captains; in Solo vs AI, the human and the AI captains. Structurally, a participant is any hull whose role is not *fleet* — which is precisely why an AI captain contests, and can win, a match.

### Arena and Level Design

**The ocean.** One large circular map per match. Islands are procedurally generated from a seed; both sides rebuild the map deterministically from that seed (the map never travels on the wire). **Map size is fixed** — one radius for every roster. Roster-scaled oceans were designed and then **cancelled** (epic-6 amendment 11): at a two-captain size the fixed endgame ring would already be over half the water.

**Islands** are the terrain system: they block line of sight (the LOS rule for every sensor tier), block shells and torpedoes, and impose collision. They are what makes needle-threading a skill shot, radar shadows a hiding place, and positioning a deduction input.

**Spawning.** Participants spawn on an outer ring, placed for maximum mutual distance and island clearance.

**World features — DEFERRED, not cut.** Neither of the two below is built. Both were ruled out of the beta by Eric (epic-5 amendment 47, *"I have enough systems"*), a ruling that also declared the systems layer complete; their designs and reserved numbers stand for whenever they return.

- **Fog banks** (#43-r) — the Trade: inside a fog bank your truesight shrinks, but you vanish from others' truesight (radar may still paint you). Blindness bought with blindness.
- **Rare whirlpools** — rare enough to be an event, not a hazard-course. Each ocean is randomly in the northern or southern hemisphere (never revealed to players); whirlpools spin counterclockwise in the north, clockwise in the south. A whirlpool's job is to spin: a ship passing over one is carried along its circular current — sailing with the current speeds you up, against it slows you down — and the spin rotates your heading (rudder with the current and you keep your facing relative to the whirlpool). No suction, no trap: you can exit from any side. It just makes captaining more interesting.

Backburnered: supply drops (#23) — the ring rhythm still reserves their minute-2 beat, which runs today as a real structural no-op.

**The storm** (Pillar 4) is the arena's clock: phased closure down to the Endgame Guarantee ring — two truesight diameters across — by 12:00, then the sudden-death collapse of that ring to nothing between 15:00 and 16:00. It forces the final fight without ever retiring the sensors.

### Multiplayer Considerations

- **Modes at beta:** **Solo** (standard BR — humans only, no bot-fill) and **Solo vs AI** (lobby filled with AI combatants). Both contain roving PvE drone fleets.
- **Lobby:** match starts at **2 human captains** (fill-or-timer), capped at **20** for now.
- **Matchmaking: one standard queue.** Captains pool in a queue that arms a single hard deadline at the second captain and then hands the arena a fully-formed roster; hitting the 20-captain cap forms the match immediately. There is no half-filled lobby to drop into, no skill matching, no parties and no ranked at beta. **Solo vs AI does not queue at all** — it mints its own private match on the spot. **v3: the deck is frozen at queue** — the client selects a deck at join (#60), the server loads it from the account (or the hull's starter deck for an anonymous captain), checks legality once, and snapshots it; edits made after queuing apply to the next match.
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

**Spending.** Each level opens a pre-drawn offer of **4 different card lines from the deck you brought** (drawn at earn-time, never rerolled — see The Deck Model v3); one level buys any one card, and a heal is a card like any other. The catalog shipped, was rewritten wholesale by Eric (2026-08-19), and is due a v3 re-cut for ladders, tier bundles and consumables (Eric-authored, not yet written); its standing requirement is **the build must be felt** — audio, hull visuals, on-water behavior — or promise + growth is a spreadsheet.

**The opening — v3.** Every hull spawns with the deck gun only. **Level zero is granted at countdown start**, so the first offer opens during the 10 s countdown and can be taken before the water goes live, or held. **Mulligan:** one free redraw of the level-zero offer, only during the countdown — the single declared exception to "reopening never rerolls", at a moment nobody is on the water. The redraw is still the level-zero offer, so it carries the same usable-card guarantee. **Weighted first draw** is the default and is built first: the level-zero offer is guaranteed to contain at least one **actively usable** card (a consumable, or the Tier I of any equipment) — Eric: *"my brain leans more towards weighted first pick."* A **pinned card** (one deck card marked start-fitted, #21) is a later, CONFIG-gated experiment to test against it. The promise this buys is *"you have something to DO at 0:00"* — not *"you hold your class weapon at 0:00."*

**Account progression — v3 (the only meta layer).** An **account level** bar fills with XP earned per match — **placement-scaled**, and **discounted in Solo vs AI** (Eric: *"probably, just not as much"*) — and every account level grants **one unlock token**. A token unlocks **a whole line** (all five tiers of a ladder, or the one copy of an add-on) at a **flat price [DRAFT — Eric: "flat probably, idk"]**, in any order: unlocks are **variety, never power**. All three hulls and their starter decks are unlocked from day one; the starter decks' cards are the initial unlock list, and a starter is authored to be viable at the top of the ladder — Eric: *"good enough… just not the most optimized deck for how I play, or the current meta."* Both XP dials derive from one intent number — **matches to unlock the launch catalog** — which is OPEN (Eric: *"fuck if I know"*): a CONFIG dial with a **[DRAFT] 40–60 match** placeholder, tuned from live match history. Catalog breadth target: a hull builds from **at least ~100 cards' worth of unlockables (~25–30 lines) [DRAFT]** — Eric: *"100ish is a solid target."* A signed-in captain may keep **several decks per hull** (Eric: *"fine. Data is cheap"*); Eric has noted that deck *slots* could be rewarded or monetized (#80) — a slot is not power, so Paint-Not-Power holds. **Match history** records **every deck in every match server-side** for Eric's own metrics (*"the only way to see how things are performing in live play"*); a player sees their **own** deck — brought, drawn, taken — in results and history, and **enemy decks are shown to no player**. Meta convergence is accepted (Eric: *"There's no avoiding it"*).

**Balance laws:** **Universal counterplay only (2026-07-19)** — tools must counterplay everything, never specific ships or weapons except incidentally; no counter-classes, ever. **No death pings or free information (2026-07-19)** — scouting is the skill; nothing announces a kill or a position for free. The Rat Covenant — hiding is legal but priced (a hiding player ticks but never accelerates; the kill-only bonus is exactly the price). The Conservation Law ("every power gain emits a signal") is a *tendency*, not a law — anti-snowball outranks it. **The KILL LEADER (#47, formerly "the Bounty"):** the captain with the most captain kills holds a public throne — **identity only**. Their name is published to every client and marked with a skull wherever it appears, and sinking them pays a bonus level. **The Bounty Bloom is deleted end to end**: there is no radar paint, bloom, ring, bearing, range or area disclosure of the holder, ever. Identity was already free — every client can already count kills — so publishing the name only reconciles the server's answer with what a client could derive anyway; *position* was the sole genuinely new disclosure, and it is exactly what the ruling removed. The anti-snowball teeth are the bonus and the target painted on the **name**, not on the water.

### Difficulty Curve

The match's tension curve is structural — the ring rhythm *is* the pacing. **Four ring groups** of ~4 minutes, each on the same internal minute rhythm:

- **Minute 1 — clear seas.** Hunt, position, gather.
- **Minute 2 — supply drops spawn.** *(Backburnered feature; this is its reserved slot in the rhythm.)*
- **Minute 3 — next ring revealed.** Planning pressure: where you must be is now known.
- **Minute 4 — the ring closes** down to the next circle.

Three escalating cycles of that rhythm bring the ocean down to the endgame ring — **two standard truesight diameters across** (the Endgame Guarantee), reached at **12:00**. Combat is forced there, but radar still earns its keep and no range class gets a free win.

**Then group 4: sudden death.** The endgame ring holds through 12:00–15:00 on the same rhythm (clear seas · the reserved supply beat · the collapse point marked at 14:00), and from **15:00 to 16:00 it collapses concentrically onto its own centre**. At 16:00 the map is 100% storm and every hull still afloat is taking damage. This is a shrink, not an escalation: storm damage never ramps, and the endgame ring itself is untouched.

**Match length.** **~15:00 is the estimate and the design contract** (Pillar 2). The **structural ceiling is ~17:30**: the ring is fully closed at 16:00, and the game's toughest hull needs roughly another 87 s to sink at storm damage from full health. Even that is soft at the very top, because stocked heals are spendable while alive and each one buys back time — but under v3 a captain holds at most four at a time and never more than the deck carries, so the ceiling is bounded by construction, and the match always terminates, which is the whole point of the collapse. *(The brainstorm's 10-Minute Covenant is formally retired in favor of this contract.)*

### Economy and Resources

- **XP is the only in-match currency; unlock tokens are the only account currency** (v3). No loot-scavenging spine (explicitly rejected); nothing on the water outranks playing well, and nothing an account holds outranks a starter deck.
- **Ammo is per-weapon and reload-limited**, not scavenged: each fitted system owns its ammo pool and reload timer, always ticking.
- **Weapon slots and consumable slots fill from the deck** — copy 1 of a weapon's ladder fits the weapon, a consumable card stocks a slot; nothing is scavenged off the water. *(v3 retires the acquisition card and its "taking one burns the rest" rule.)*

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
- **Structural anti-cheat:** nothing outside a client's sight ∪ radar sweep ever reaches that client. The rule is enforced at a single chokepoint with property-style invariant tests behind it, and every relaxation of it is a **named, individually-argued exception** rather than a soft edge — today there are exactly six (your own fall-of-shot, your own hit call, the anonymous muzzle flash, the public sinking register, wounded smoke, and the foghorn). Counter-intel lies live on the server and are indistinguishable on the wire. **v3:** deck state is server-private (only the four drawn ids ride the wire), deck legality is checked by the server once at queue, and consumable slot contents are server-owned ship state.

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
| E8 | **The Deck** (v3) | Card model (A) + hull-agnostic catalog hooks, legal 40-card decks + starter decks frozen at queue, equal-weight draw, deck gun + three generic weapon slots (replace-which, slot keeps its clock), four consumable slots, heal as a card (`5` retired), gun-only spawn + level zero + mulligan + weighted first draw, draw-pile counter, bot decks + consumable tactics + harness arms and bars, own deck in results | Every match — anonymous or signed in — is played on a deck, under the same rules for everyone |
| E9 | **The Account** (v3) | OAuth sign-in (no guest tier), the first persistent store, deck editor (several decks per hull), account level → unlock tokens → whole-line unlocks, placement-scaled XP, match history (own deck to the player, every deck to Eric's metrics), privacy-policy delta | Sign in and keep your decks, unlocks and history — nothing changes inside a match |

**Sequence: E1 → E2 → E3 → E6 → E4 → E5 → E7 → E8 → E9.** Identity and economy first (the spine everything touches), match shape third, then texture, world, modes, launch — E1–E7 have shipped. **E8 and E9 ship together as one unit before the traffic push** (Eric declined releasing the match-side rework without accounts — *"go big or go home"*); the split is a build seam, not a release seam. [NOTE FOR DESIGNER: the E8/E9 seam is the facilitator's — E8 is everything that changes on the water and plays anonymously on starter decks; E9 is everything an account keeps. Collapse to one epic if preferred.]

---

## Success Metrics

### Technical Metrics

The Technical Specifications targets, treated as pass/fail: 60 FPS sustained on the ratified reference device in a full 20-ship match at the 1366×768 viewport floor; first click to playable in under ~10 s; feel intact at ~150 ms latency; matches complete without crashes or desyncs.

### Gameplay Metrics

- Matches complete inside ~15:00 (Pillar 2's promise, measured), against a ~17:30 structural ceiling.
- Players choose to sail again quickly after death — the fun proxy, measured as the share of deaths that lead to another match. The route is deliberately through the home screen (there is no instant re-queue); if dying doesn't lead to "again," Pillar 2 is failing.
- All three classes see real pick rates — no class is a dead button (Pillar 3's promise has to be worth promising).
- One playtest-answerable question per pillar — e.g., for Pillar 1: do players describe finding someone as a *deduction*?
- **v3 harness bars, pinned before human playtests:** the starter-vs-veteran win band (unlocks are variety, never power — measured, not asserted); the two golden decks (a torpedo-less Torpedo Boat and a pure gunboat both play); heal-take rate; levels wasted (offers with nothing worth taking); the one-copy appearance rate.

---

## Out of Scope

**Deferred classes — the expansion blueprint (2026-07-19).** The supplemental brainstorm produced a six-class roster and the ability formula as the post-playtest expansion blueprint (`_bmad-output/brainstorming-session-2026-07-19.md`). Party-mode ruling: these are **deferred, not designed-in** — prove the three-class beta in front of players first; each lands later as registry rows, not rewrites. Bench order:

1. **Submarine** (most developed): timed submerge on cooldown — not a persistent state; guns dead underwater, torpedoes live, forced resurface. Radar-dark while under, but the periscope is visible in true sight at roughly torpedo-spotting distance; still trips mines and stays vulnerable to torpedoes; found by hydrophones and active-sonar equipment — counterplay is built into the class itself. Same torpedo as the TB, opposite verb: stalk vs. dash. Open: duration/cooldown numbers, periscope visibility tuning — **and its counterplay premise now depends on a deferred sensor**, so hydrophones/sonar have to come back before, or with, the submarine.
2. **Carrier**: bombers as secondary weapon, recon plane as ability; the captain still drives and fights his own ship — explicitly not an RTS-inside-the-shooter. Aircraft mechanics entirely TBD (counterplay must be designed before it enters); existing drone infrastructure is a plausible base.
3. **Decoy Ship** (banked, no commitment): cooldown blip burst (~5 radar blips instead of 1) or radar-dark, built on the phosphor system with zero new physics. Flavor, hull identity, and weapon fit undecided — the thinnest slot. **Note:** the decoy *buoy* was deleted in 2026-08-19 and nothing in the game fakes a ship contact any more, so this class would be reintroducing that role from scratch rather than extending a shipped one.

**Banked content (2026-07-19 session — ideas with no commitment):** weapon-variant mutations (quick-firing battery, heavy rifle, shotgun gun; torpedo fan spread, Long Lance, pattern-runner), the equipment-pool draft (searchlight, active sonar, smoke generator, spar torpedo/ram kit, sonobuoy), ramming as a mechanic, the monitor / juggernaut-battleship repositioning, and captor and influence mines. What triggers reconsidering any parked concept is itself an open question — only the Radar Picket carries a stated return condition (a weapon identity).

**Backburnered — designed-for, not built in beta:**

- Sensor-forward class (formerly "Hunter," working name TBD; the 2026-07-19 session tabled the closely related Radar Picket for lacking a weapon identity — parked until it has one)
- ~~~4 consumable slots per ship~~ — **built into the design by v3** (four slots, keys `1`–`4`; see Consumables)
- Supply drops (the ring rhythm reserves their minute-2 beat, which runs today as a real structural no-op)
- **Hydrophones / the passive listening ring**, sonar as a distinct sensor tier, and active ping — deferred 2026-08-21 (Eric: *"very deferred. sonar might come back in the future, but radar is plenty deep enough"*). The foghorn chevron is the shipped bearing surface.
- **The smoke screen (#26)** — deferred 2026-08-21 (Eric: *"Deferred, I think it will probably come back at some point"*).
- **Fog banks and rare whirlpools** — designed in full (see Arena and Level Design) and deferred by ruling (epic-5 amendment 47, *"I have enough systems"*), which also declared the systems layer complete.

**Post-beta:**

- Teams (duos/trios + ping system)
- Custom/private lobbies
- Ranked, cosmetics shop, unlockable classes (unlocks are **never power** — the Paint-Not-Power guarantee extends to class unlocks), Service Record, Pennants. *(Accounts left this list on 2026-09-03 — they ship with the deck model before the traffic push; see Multiplayer Considerations.)*
- Rare Pull exotic offers (#84) — boon catalog v1 is basics-first; anything springing from it comes later

**Rejected — do not re-propose without a ruling.** By the deck model v3 forge (2026-09-02): a hand with a per-minute drip; card merging; storefront verbs (lock / sell / refresh); rarity weighting and soft pity in the draw; instant-use-on-pick; guest accounts; storing emails or passwords; deck names (in the feed or anywhere); class-locked cards; deck-manipulation cards; hull-mod cards; salvage cards. By Eric in the 2026-09-01 session: discard/reshuffle (#8 — exhaustion is meant to be rare, not cycled); the deck picking the hull (#71).

**Parked (open, not dead).** By the forge: positional slots and per-slot arcs (the arc model — direction from the slot, traverse from the item — stays on file); the pinned-card spawn (a CONFIG-gated experiment against the weighted first draw); a passive per-level heal; draft mode (#73); revealing enemy decks to players (Eric: *"if it's in results I should see it in history. Or maybe not"*). Left open by the 2026-09-01 session: ghost decks (#63 — bots sailing anonymized player decks; the forge notes it as a later change of source, not mechanism); card kinds Eric left live but unruled — timed buffs (*"maybe"*), drawback cards (*"maybe"*), signal cards (*"unknown"*). **Unruled proposal, no Eric position on record:** deck codes (#64).

**Not planned without design-first work:**

- Mobile/touch support

*(The Carrier and playable submarines moved from this tier into the sequenced Deferred classes bench above — their design-first requirements stand.)*

---

## Assumptions and Dependencies

**Assumption index** (inline `[ASSUMPTION]` tags):

1. **CONFIRMED (built).** AI combatant bots (Solo vs AI) are driven through the same input pipeline as every ship, and see the world only through the same perception boundary every human does. *(Enemy Design and AI)*

**Open design notes** (inline `[NOTE FOR DESIGNER]` tags and indexed open items):

1. **RESOLVED, then superseded.** The 2026-07-22 ruling gave the Mine Layer the **Decoy Buoy** and an activateable mine; both halves have since moved — the buoy became the **Radar Buoy**, and the mine became a click-aimed rear-sector weapon (2026-08-19). See Weapon Systems. *(Weapon Systems)*
2. **RESOLVED (the deck model), re-read by v3:** "boons, not stat multipliers" (2026-07-16) vs. "most upgrades are stat increases" (2026-07-19) — resolved as "commons are the stat ladders, rares are the nature-changers", which v3 restates without rarity: a ladder carries the weapon and its authored tier bundles, add-ons are the nature-changers. *(Upgrade economy)*
3. **RESOLVED (2026-07-23, Eric), extended since:** per-weapon firing-arc geometry — gun and star shells 360°, torpedo bow ±30°, broadside twin sector at ±90°, mine and radar buoy click-aimed in the rear sector. *(Aiming and Combat)*
4. **RESOLVED (2026-08-21, Eric): the precision bonus is DROPPED.** Never built, never ruled in; removed from the design. The 2026-07-16 decision-log entry stands as history. *(Aiming and Combat)*
5. **RESOLVED (Story 7-6, 2026-08-21):** DESIGN.md's real-time-era reconciliation pass is done. *(Art Style; E7)*
6. Sensor-forward class real name — tracked in Out of Scope; needed only when it comes off the backburner.
7. Minutes-1–3 pacing ("Quiet Dread" — protect or fix) is a playtest call; the ring rhythm's minute-1 "clear seas" is the current answer.
8. **v3 — deck size.** 40 is the working number; a 25–40 floor/ceiling band MUST be tested before it is final. *(The Deck Model v3)*
9. **v3 — consumable keys.** `1`–`4` vs `Z`–`V`: Eric is open-minded; test both. *(Controls and Input)*
10. **v3 — heal copies per starter deck.** 4 vs 5 [DRAFT]; harness-tuned per hull. *(Healing)*
11. **v3 — the unlock economy's drafts.** The matches-to-full-catalog number is OPEN and ships as a CONFIG dial in a [DRAFT] 40–60 band, tuned from live match history; the flat unlock price is [DRAFT]; the ~100-cards / ~25–30-lines breadth target is [DRAFT]. *(Account progression)*
12. **v3 — consumable content and tier-bundle contents.** Both are the catalog rework — an Eric-authored document, out of GDD scope. *(Consumables; The Deck Model v3)*
13. **v3 — the "replace which?" flow.** Drawing a fourth weapon into three full slots means replacing one; the forge carries the rule, but neither session specified the player-facing flow (where the choice is made, what the offer shows). *(Slot grammar)*
14. **v3 — the shipped per-level auto-heal.** Its fate under the heal card is unruled — see the NOTE in Healing. *(Healing)*
15. **v3 — the E8/E9 seam.** The facilitator's split; Eric may collapse it. *(Development Epics)*
16. **v3 — the account store's architecture.** First persistent store + first non-ops HTTP API — `gds-game-architecture`'s call, and it must not pre-empt the deferred Story 7-7 split. *(Technical Specifications)*
17. **v3 — "light and heavy torpedoes" vs the no-torpedo-variety veto.** The family-targeting example presupposes two torpedo designs; the veto says one per fit. Eric ruling needed before the catalog re-cut. *(Weapon Systems)*
18. **v3 — the consumable copy cap.** The legal-deck rule caps a ladder at 5 and an add-on at 1; a consumable line's maximum is unruled (the starter's 4–5 heals imply ≥ 5; nothing says a 40-heal deck is illegal). *(The Deck Model v3)*

*(The gunboat AP-gun form note was deleted with the class, 2026-07-19.)*

**Dependencies:**

- **Boon catalog — DELIVERED** (E2, then rewritten wholesale by Eric on 2026-08-19), **and due a v3 re-cut that is NOT yet written.** This GDD specifies the model — the 40-card authored deck, ladders-as-tiers / add-ons-as-nature-changers, copies = tier ceiling, consumables — and the contents (which lines, what each tier bundle does, the consumable set) are Eric's next authored document. E8 builds the model against it.
- **The account store (v3)** — the first persistent store and non-ops HTTP API; `gds-game-architecture` owns the design. E9 depends on it; the privacy policy gains one paragraph on signed-in accounts.
- **Combat-bot AI — DELIVERED** (E5), distinct from PvE defensive AI; priority profiles, not a difficulty ladder.
- **Self-publishing** replaces the portal dependency: the launch gate is the operator's own — hosting, ad + consent handling, and the privacy policy (E7). There is no third-party portal compliance dependency.
- **Aim reconciliation under latency** (lag compensation vs shoot-at-server-state) is a feel-defining, expertise-heavy call — explicitly delegated to the architecture phase (`gds-game-architecture`); the design requirement is only "feel intact at ~150 ms."
- **Population cold start** needs a real launch-day answer before public beta — launch planning (LAUNCH_PLAN.md), not GDD scope.
- Exact positioning slogan remains open — marketing, non-blocking.
