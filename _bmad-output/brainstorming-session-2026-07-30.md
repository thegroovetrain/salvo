---
title: 'Game Brainstorming Session'
date: '2026-07-30'
author: 'Eric'
version: '1.0'
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
---

# Game Brainstorming Session

## Session Info

- **Date:** 2026-07-30
- **Facilitator:** Game Designer Agent
- **Participant:** Eric
- **Focus:** Boon Catalog v1 — initial batch of upgrade cards for story 2-8 (design gate). Seeded from the UPGRADES section of HULLCRACKER_NOTES.md, including the EXCLUSIVE mechanic (both exclusives for a weapon appear together in an offer; picking one locks the other).

---

_Ideas will be captured as we progress through the session._

## Brainstorming Approach

**Selected Mode:** Guided — facilitator walks through techniques one by one

**Technique Sequence:**

1. **SCAMPER the Gaps** — systematically mutate each weapon's parameters (Substitute / Combine / Adapt / Modify / Put to other use / Eliminate / Reverse) to fill the explicit ???? slots: Mines' second exclusive and Cannon's two exclusives.
2. **Player Fantasy Mining on Exclusives** — each exclusive pair should be a fork between two distinct captain identities; test every pair (existing and new) for fantasy contrast, and explore whether other weapons deserve exclusive pairs too.
3. **Morphological Sweep** — grid of [category] × [effect axis] (damage, rate, capacity, range/reach, projectile behavior, utility) to surface every unfilled cell across Guns, Torpedoes, Mines, Speed Boost, Cannon, Star Shells, Decoy Buoy, Intel, Ship.
4. **Emergence & Failure Check** — cross-category interactions (which boons combo, which stack into degenerate builds), plus engine/fog-of-war feasibility flags (perception invariants, four effect kinds: stat / slotFill / slotReplace / behavior).

**Techniques on standby:** Emotion Mapping (what a pick should feel like), Moment Design (boons that create stories), What If Scenarios (radical exclusives), Reference Blending (Hades / roguelite boon shapes).

**Focus Areas:**

- Fill the ???? gaps in HULLCRACKER_NOTES.md UPGRADES (Mines exclusive #2, Cannon exclusives #1 and #2)
- Ratify/pressure-test the EXCLUSIVE mechanic: picking one locks the other; when an exclusive is offered, BOTH exclusives for that weapon appear in the same offer (interaction with the 4-boons-from-4-distinct-categories offer shape needs design attention)
- Round out thin categories (Star Shells, Decoy Buoy, Speed Boost, Ship)
- Feed directly into the story 2-8 design gate: categories, names, effects, off-class weighting, Hades-hammer slot model

---

## Working Notes (live capture during ideation)

### Laws & Structure
- **The Exclusive Law:** exclusives change a weapon's *nature*; stackables change its *numbers*.
- **Rarity tier:** stat boons are common; nature-changers and multipliers (Barrel/Turret/Tube) are rare.
- **THE DECK MODEL (major structural pivot, supersedes weighted rolls):** every player has a personal deck = universal set (Intel + Ship + Gun) + one subdeck per carried equipment + equipment-acquisition cards (grant new equipment into the R slot; maps to engine `slotFill`). Each level draws 4 cards; unchosen shuffle back; **chosen cards leave the deck**; choosing an equipment card shuffles its subdeck in. Caps ARE copy-counts: 5 copies per common stackable (baseline: Sweep +3 RPM ×5 = 15→30), 1 copy per rare (turret line: 2 — pending Barrel/Turret clarification).
- **Exclusives reborn under the deck:** no both-shown rule, no lockout. Exclusives are 1-copy rare cards; drawing the rival later offers a doctrine REPLACE (tentative). Emergent: chosen cards leave the deck → doctrine swaps are one-way, max one swap.

### Settled Catalog Content
- **Guns:** Damage, Reload, Barrel (rare, capped 3 barrels), Turret (rare) — all stackable; NO exclusives (deliberate — the honest weapon).
- **Cannon:** Damage, Blast Radius, Reload. Exclusives: **Arcing Shells** (lob over islands AND ships, always detonate at click, un-interceptable) vs **AP Shells** (no blast; full-range direction shot; pierces up to 3 ships 100%/50%/25%; stopped by islands). Feel note: cannon projectile must READ heavier than the gun (tester feedback: currently identical).
- **Torpedoes:** Damage, Speed (60→80 kn, +5/card), Reload, Tube (rare). Exclusives: **Tracking** (slow-turn homing within short range) vs **Blast** (FPS remote-det fantasy: point-detonation at click, range capped by RADAR range, large blast).
- **Mines:** Damage, Blast Radius, **Trigger Radius (new — magnetic influence; never exceeds blast radius)**, Max Mines, Reload. Exclusives: **Tracking** (creep toward nearby enemies) vs **Slowing** (less damage, ~50% slow — "the mine delivers you to me"; storm-circle synergy).
- **Mine baseline (not boons):** chain reactions; aimed short-arc placement behind ship; arming delay (no instant-drop kills).
- **Speed Boost:** Max Speed Boost, Reload. No exclusives.
- **Star Shells:** base form LOSES its damage (pure illumination). Duration, Effect Radius, Reload. Exclusives: **Burning Star** (slightly smaller radius, DoT inside) vs **Blinding Star** (still illuminates; enemies inside get reduced truesight).
- **Decoy Buoy:** Duration, Reload. ON NOTICE — testers call minelayer weakest loadout; smokescreen/fog-maker floated as replacement. Replacement explicitly OUT of this brainstorm's scope.
- **Intel:** Truesight, Radar Range, Sweep RPM (+3 to 30 cap). Emergence flag: Radar Range quietly buffs gun range, cannon range, AND blast-torp reach — Intel is a stealth offense category.
- **Ship:** Max Speed, Max Hull only. **Hull grants also HEAL the amount granted.** TTK/regen/turn-rate explicitly deferred.
- **Heal spend option:** DIES in v1 (TTK/healing gets its own future pass).
- **Hydrophones:** future epic, fenced off from upgrades.

### Card Copy & Naming (ratified laws + DRAFT ladders)

**Laws (Eric-ratified):**
- Register: **Dry Technical** (real naval hardware/vocabulary). Positive adjectives, never comparatives (HEAVY WARHEAD, not HEAVIER).
- **Name is flavor; rules text is the contract** — every card prints exactly what it does with live values ("Radar Sweep: 15 RPM → 18 RPM."). Exclusives spell out the full behavior change. Name up top, contract below.
- **Name-by-stack-position:** multi-copy lines present as the NEXT name in their ladder (stack count + 1), not per card instance. The duplicate-auto-redraw rule guarantees no two copies of a line in one offer, so the next name is always unambiguous.
- **Mixed ladder styles:** bespoke ladders where the vocabulary is rich, "Mk I–V" numbering where it isn't (ammo/machinery marks are period-authentic).
- Presentation: cards spread in front of you, name + text printed; tiers plain / RARE / EXCLUSIVE (exclusive shows a doctrine-swap line when you hold the rival).

**DRAFT ladders (for individual ratification at the 2-8 gate):**

- **GUNS** — Damage: HEAVY SHELLS Mk I–V · Reload (bespoke): LOADING DRILLS → IMPROVED LOADER → POWER RAMMER → AUTOLOADER → READY MAGAZINE · Barrel (rare, bespoke): TWIN MOUNT → TRIPLE MOUNT · Turret (rare): AFT TURRET
- **CANNON** — Damage: HEAVY CHARGE Mk I–V · Blast: FRAGMENTATION CASING Mk I–V · Reload: HYDRAULIC RAMMER Mk I–V · Exclusives: PLUNGING FIRE / ARMOR-PIERCING SHELLS
- **TORPEDOES** — Damage: HEAVY WARHEAD Mk I–V · Speed ×4 (bespoke, real propulsion history ending at Long Lance): HIGH-SPEED SETTING → WET-HEATER ENGINE → ENRICHED OXIDIZER → PURE OXYGEN DRIVE · Reload: QUICK-LOADING GEAR Mk I–V · Tube (rare): SECOND TUBE · Exclusives: ACOUSTIC HOMING / COMMAND DETONATION
- **MINES** — Damage (bespoke, real explosive-filler progression): TNT FILLER → AMATOL FILLER → TORPEX FILLER → MINOL FILLER → RDX FILLER · Blast: BLAST CASING Mk I–V · Trigger (bespoke, real fuze types): MAGNETIC FUZE → ACOUSTIC FUZE → PRESSURE FUZE → ANTENNA FUZE → COMBINATION FUZE · Max Mines (bespoke): DECK RACKS → EXTENDED RACKS → MINE RAILS → SPONSON STOWAGE → CONVERTED HOLD · Reload: QUICK-RELEASE RAILS Mk I–V · Exclusives: SELF-PROPELLED MINES / PROP-FOULING MINES
- **STAR SHELLS** — Duration: SLOW-BURN COMPOUND Mk I–V · Radius: WIDE BURST Mk I–V · Reload: RAPID HANDLING Mk I–V · Exclusives: INCENDIARY COMPOUND / DAZZLE BURST
- **SPEED BOOST** — Max (bespoke, real steam-plant progression): CLEAN BOILERS → UPRATED BOILERS → SUPERHEATERS → FORCED DRAUGHT → EMERGENCY POWER · Reload: STEAM RESERVE Mk I–V
- **DECOY BUOY** — Duration: EXTENDED BATTERY Mk I–V · Reload: SPARE BUOYS Mk I–V
- **INTEL** — Truesight (bespoke): IMPROVED OPTICS → SPOTTING SCOPES → RANGEFINDER ARRAY → DIRECTOR TOWER → MASTHEAD POST · Radar Range (bespoke, real radar history): IMPROVED RECEIVER → HIGH-GAIN ANTENNA → EXTENDED MAST → CENTIMETRIC SET → CAVITY MAGNETRON · Sweep: UPRATED SWEEP MOTOR Mk I–V
- **SHIP** — Speed (bespoke, escalating yard-work): HULL SCRAPING → NEW SCREWS → ENGINE REFIT → GEARED TURBINES → FLANK SPEED TRIALS · Hull (bespoke, real armoring concepts): REINFORCED HULL → ARMOR BELT → TORPEDO BULGE → WATERTIGHT COMPARTMENTS → ARMORED CITADEL
- **EQUIPMENT-ACQUISITION CARDS** (fill R slot, shuffle their subdeck in): TORPEDO TUBES · MINE RACKS · STAR SHELL MORTAR · CANNON · DECOY BUOY · (Speed Boost's card name OPEN — "EMERGENCY THROTTLE"?)

### Rejected / Parked
- Rejected: Concussion/push shells (feels wrong); both-exclusives-shown offer rule (superseded by deck); heal-as-card.
- Parked: Salvo rhythm exclusive, Incendiary shells, Mimic/Jammer buoy forks, Afterburner/Overdrive boost forks, Fire-Control Radar.

### Emergence-Check Rulings (all five closed)
1. **4-distinct-categories rule DIES.** Soft rule instead: duplicates auto-redraw — every draw shows 4 *different* cards.
2. **Barrel ×2 copies, Turret ×1 copy.** Guns start 1 turret × 1 barrel; Barrel cards add a barrel to EVERY turret (max 3); Turret adds a second turret (max 2). Full stack = 2×3 = 6× throughput, priced at 3 rare draws.
3. **Copy counts tuned per stat** (5 is the default baseline; torp speed needs exactly 4).
4. **R-slot equipment pool is UNIVERSAL in v1** — every class's deck seeds the whole equipment pool (TB can take Mines, ML can take Star Shells). Gets all systems playable; iterate from live data.
5. **Option A ratified: R slot is PERMANENT in v1.** When R fills, remaining equipment cards purge from the deck. **Exclusive swaps stay free forever** (no stranded-upgrade problem — stat stacks apply under either doctrine; the unequipped rival is the only pair-card in the deck, so doctrine can ping-pong). **Option D ledgered for later:** swap-and-refund-as-refit-points — best-feeling swap design, but it's a deck-thinning laundering exploit, erases R-commitment drama, and carries refund edge cases; revisit only if live play resents permanence. Option B (swap with memory) superseded by D. Option C (swap and forfeit) rejected.

---

## Party Mode Review (roundtable, post-ideation)

The full bench reviewed the catalog + deck model. Findings and Eric's rulings:

1. **Draw math (Murat):** with a ~60-65 card deck and 12-20 picks per planned match, a given 1-copy exclusive appears in only ~55-60% of matches, and copy-count caps are rarely reachable. **RULING: escalating rare weight** — every level without a rare drawn increases rare weight in the shuffle (invisible soft pity, never a hard timer). CONFIG-tunable; the dial is set with **2-10 batch-sim evidence** (time-to-first-exclusive distributions).
2. **Scope (John/Indie/Link):** R-slot equipment logic was ALWAYS in 2.8's AC (FR21 — pool fills/replaces the extra slot). **RULING: 2-8 stays ONE story** — deck engine + catalog + minimal card UI. 2-9 ("The Build Must Be Felt") owns per-boon presentation/juice; 2-10 ("Economy Batch-Sim Harness") owns tuning evidence.
3. **AC amendment required (John):** 2.8's AC says boons are "Hades-style qualitative changes (not stat multipliers)" — the AC itself defers the GDD stat-vs-qualitative tension to this story, and this session **settles it the other way: commons are stat cards; rares/exclusives are qualitative**. The design gate must record this amendment before create-story runs.
4. **Smoke screen (John):** standing 2026-07-19 AC ruling puts the orphaned smoke screen in the equipment pool; tonight's equipment card list omitted it. **RULING: intent AFFIRMED, ships DEFERRED past v1** ("push established systems") — carried in the same AC amendment so the epics doc and brainstorm stop contradicting each other.
5. **Card lineage handrail (Sally): RATIFIED** — sequential ladder names need a lineage marker on the card face (e.g., "HULL · II/V" pip row) so a player under combat-lockout pressure can see ARMOR BELT continues REINFORCED HULL.
6. **Empty-deck edge (Boundary/Link):** the deck mathematically cannot empty inside planned match parameters (12-20 picks vs 60+ cards). **RULING: no fallback content** — empty deck → level still increments, no offer banks; behavior defined and pinned by test as unreachable. EMERGENCY REPAIRS fallback card REJECTED (a heal through the side door + content for a state that can't occur).
7. **Universal level-heal (Eric's 10%-over-5s idea): FILED TO THE FUTURE TTK PASS** as a first-class candidate alongside the regen/shield/consumable notes — it is a TTK decision (≈10% hull/min passive regen), not an empty-deck patch, and does not belong to 2-8.

---

## Session Summary

### Most Promising Concepts

**Top Pick: The Deck Model**
Per-player card deck (universal set + equipment subdecks + equipment-acquisition cards), 4 different cards per draw, chosen cards leave the deck, caps as copy-counts, rarity as physical scarcity. One player-legible metaphor replaced an entire weighted-roll design, and its emergent rules (one-way doctrine swaps, self-enforcing caps, no-duplicate offers) came free. It maps directly onto the live 2.5 engine (`slotFill`/`slotReplace`) and the 2.7 offer flow.

**Runner-up: The Exclusive Law + four doctrine forks**
"Exclusives change a weapon's nature; stackables change its numbers." Produced four ratified forks: Cannon PLUNGING FIRE vs ARMOR-PIERCING SHELLS, Torpedo ACOUSTIC HOMING vs COMMAND DETONATION, Mine SELF-PROPELLED vs PROP-FOULING, Star Shell INCENDIARY COMPOUND vs DAZZLE BURST.

**Honorable Mention: Name-by-stack-position ladders**
Card names attach to your stack count, not card instances — the duplicate-redraw rule guarantees the fiction can never break. ~60 dry-technical draft names authored, mixing bespoke real-naval ladders with Mk I–V lines.

### Key Insights

- The offer machinery (2.7) already supports everything the deck needs: variable-length offers, empty-offer null path, FIFO queue, digit picks 1-4.
- Intel is a stealth offense category (radar range keys gun range, cannon range, AND blast-torp reach).
- The minelayer power problem and Decoy Buoy rework are real but explicitly fenced OUT of 2-8.
- Catalog content IS wire contract — one planned PV bump when the dummy catalog dies.

### Recommended Next Steps

1. **2-8 design gate ratification + create-story:** this document is the primary design input; the gate records the AC amendment (qualitative settlement + smoke deferral) before create-story 2-8 runs.
2. **2-8 implementation** consumes: deck model rules, settled catalog content, draft card ladders (ratify names individually), lineage-pip card UI, escalating rare weight (CONFIG-tunable).
3. **2-10 harness** validates the economy dials: time-to-first-exclusive, cap-reach rates, deck depletion curves.

---

## Session Complete

**Date:** 2026-07-30
**Participant:** Eric
**Facilitator:** Game Designer Agent (guided mode: SCAMPER → Player Fantasy Mining → Morphological Sweep → Emergence & Failure Check → naming lap → Party Mode review)

### Output

- ~45 rulings/ideas + ~60 draft card names (100+ total captured ideas)
- 9 categories fully specified; 4 exclusive pairs; 6 structural laws; 7 party-review rulings
- 3 fenced scopes (Buoy rework, TTK/healing, Hydrophones) + 6 parked ideas

### Document Status

Status: Complete
Steps Completed: [1, 2, 3, 4]
