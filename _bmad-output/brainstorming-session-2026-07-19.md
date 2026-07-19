---
title: 'Game Brainstorming Session'
date: '2026-07-19'
author: 'Eric'
version: '1.0'
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
status: 'in-progress'
---

# Game Brainstorming Session

## Session Info

- **Date:** 2026-07-19
- **Facilitator:** Game Designer Agent
- **Participant:** Eric
- **Scope:** Focused session — weapons, upgrades, and ship classes for Hullcracker. Gunboat replacement + possible new classes. Locked roster: torpedo boat, mine layer, battleship. Constraint fence: "realistic basis, arcade play" — real historical naval roles, arcade balance, no supernatural/sci-fi.

---

## Brainstorming Approach

**Selected Mode:** Guided — facilitator-led technique sequence

**Techniques Available (planned sequence):**

1. **Player Fantasy Mining** — audition real historical naval roles as class fantasies:
   what power does the player wield, what identity do they assume?
2. **Verbs Before Nouns** — each class needs a verb no other class owns
   (ambush / deny / dominate / ???); classes without a unique verb don't ship
3. **Failure State Design** — work backwards from interesting deaths and
   counterplay stories; a class is only as fun as dying to it
4. **Emergence Engineering** — collide candidate classes with existing systems
   (two-tier fog, radar sweep, phosphor blips, storm circle, kill-banked upgrades)
5. **SCAMPER** — applied to weapons and upgrades: substitute, combine, adapt,
   modify, put-to-other-use, eliminate, reverse on the gun/torpedo/mine kit
6. **Remix an Existing Game** (reserve) — steal class archetypes from other
   games and re-skin them into authentic naval roles

**Focus Areas:**

- Replacement for the gunboat class (role-first: ASW escort, radar picket,
  submarine, minesweeper, commerce raider, seaplane tender/scout, monitor,
  Q-ship/decoy, and whatever else history offers)
- Additional fun ship classes if they emerge
- Fun weapons and upgrades (new systems + twists on gun/torpedo/mine)
- Constraint fence: "realistic basis, arcade play" — real roles/silhouettes,
  arcade balance, no supernatural/sci-fi elements
- Locked: torpedo boat, mine layer, battleship stay in the roster

---

## Ideas Generated

### Ship Classes — the emerging six-class roster

**[Class #1]**: Torpedo Boat (locked, revised)
_Core Loop_: Dash in fast, strike with torpedoes, leave fast. Signature ability changes from smoke screen to the **speed boost** originally planned for the cut gunboat.
_Novelty_: The knife-fighter fantasy; smoke screen is orphaned and moves to the equipment pool.

**[Class #2]**: Mine Layer (locked)
_Core Loop_: Own territory retroactively — "you died to a decision I made ninety seconds ago."
_Novelty_: Was slated to get a **decoy buoy** ability; needs a rethink now that a dedicated decoy ship is on the roster. How mines fundamentally work is itself still unsettled (upstream design work flagged).

**[Class #3]**: Battleship (locked)
_Core Loop_: Artillery fantasy — fire **star shells** to illuminate a region of radar-space to truesight, then hit from distance with the big gun. Sustained dominance.
_Novelty_: Star shells are its signature ability, confirming the roster-wide ability formula. Possible future rework: see Parked #31.

**[Class #4]**: Submarine (new — developed)
_Core Loop_: Stalk unseen. **Timed submerge ability** (not a persistent state): short duration, guns inoperable underwater, torpedoes live — use it to escape or to hunt — then forced resurface and cooldown.
_Novelty_: Counterplay is built into the class itself (works even in solo games). Same torpedo as the TB, opposite verb: stalk vs. dash. While submerged: dark on radar; **periscope visible in true sight at roughly torpedo/mine-spotting distance**; still trips mines; vulnerable to torpedoes; hydrophones (core layer, all ships) and active sonar equipment can find it.

**[Class #5]**: Carrier (new — developed)
_Core Loop_: Reach beyond every horizon. **Bomber planes as its secondary weapon**, **recon plane as its ability** — but the captain still floats, fights, and handles himself at close range with the shared kit.
_Novelty_: Explicitly NOT an RTS-inside-the-shooter. Aircraft mechanics entirely TBD. Existing drone infrastructure could plausibly power aircraft.

**[Class #6]**: Decoy Ship (new — flavor TBD)
_Core Loop_: Deceive — be five ships, or none. Cooldown ability: go radar-dark or **bloom into ~5 blips instead of 1** on enemy radar.
_Novelty_: Weaponizes the phosphor/blip system with zero new physics. Historical grounding: WW2 diversion vessels, dummy battleships, Special Service Vessels. Exact flavor (jammer vs. false-flag vs. Q-ship merge), hull identity, and weapon fit still undecided — the thinnest slot in the roster.

### The Roster Formula (discovered mid-session)

Every class = **hull + one signature ability (on cooldown) + (sometimes) one signature weapon**, on top of the shared weapon kit. Nobody counters a class; everybody plays around abilities on cooldown. Arcade-royale DNA in a historical uniform.

Ability map: TB = speed boost · Battleship = star shells · Submarine = submerge · Carrier = recon plane · Decoy = blip burst/radar-dark · Mine layer = OPEN (decoy buoy needs rethink).

### Upgrade & Equipment Architecture (Eric's model, captured)

**The Hades-hammer model**: most upgrades are stat increases (the existing 14), but some **fundamentally mutate a weapon** into one of 2–3 variants — same slot, different behavior. On level-up the player sees **4 choices, roughly one per slot**; **slot 4 is equipment** — if empty, offers new equipment from the pool (excluding owned); if filled, offers an upgrade to that equipment. **Variant weapons are expressly upgrades — no one starts with one**; class identity never depends on them.

### Weapon Variant Ideas (Hades-hammer mutations)

**[Gun #55]**: Quick-Firing Battery — smaller shells, faster cycle; DPS through volume. The brawler mutation.
**[Gun #56]**: Heavy Rifle — one big slow shell, longer range, real punch. The duelist mutation (echo of the tabled monitor as a gun choice).
**[Gun #63]**: Shotgun Gun — short-range spread mutation. Kept purely because it's fun.
**[Torpedo #58]**: Fan Spread — 3 weak fish in a cone; close-range shotgun logic.
**[Torpedo #59]**: Long Lance — extra range and speed, straight runner. The patience mutation.
**[Torpedo #60]**: Pattern-Runner — runs straight then weaves/loops through an area (real German FAT/LUT tech); the fish that comes back around.
**[Mine #32]**: Shell selector concept (AP/HE variants) — raised, undeveloped.

### Equipment Pool (slot 4 — draft)

- **[#52] Searchlight** — cone grants truesight where pointed AND paints a line straight back to you; the knife that cuts both ways. Upgrade track sketch: wider cone → longer throw → shutter blink.
- **Active sonar** (Eric) — can detect submerged submarines.
- **Smoke generator** — orphaned from the TB; smoke as pickup/equipment rather than class ability.
- **Spar torpedo / ram kit** (Eric) — great as a weapon, especially if ramming becomes a mechanic.
- **[#42] Sonobuoy** — reversed mine that reveals instead of kills; possible new home for the mine layer's buoy concept. Undeveloped.

### Mechanics Raised

- **Ramming** as a mechanic (Eric) — pairs with spar torpedo; also feeds the possible juggernaut-battleship rework.
- **[#35] Boost-lays-smoke-trail** combo — raised, undeveloped.
- **[#34] Mine + decoy buoy shared radar signature** — every blip near a mine layer becomes a bluff-or-death read; possible resolution of the buoy/decoy-ship collision. Undeveloped.

---

## Design Laws Established (session rulings)

1. **Arcade feel is the prime directive** — complexity budget is precious; no ambient-simulation mechanics.
2. **Universal counterplay only** — things must counterplay everything, never specific ships/weapons except incidentally. No counter-classes (sub-hunter, minesweeper rejected).
3. **No death pings / free information** — scouting is the skill.
4. **Variant weapons are upgrades, never starting kit.**
5. **6 great classes beat 8 half-assed ones.**
6. **Hydrophones are core** — all ships have them; part of the base information layer, not equipment.
7. **Map/world features are out of scope** for this session (squalls, tides, currents, lighthouses, wrecks — a different conversation).

## Parked Lot (tabled, keep warm)

- **[#9/#25] Monitor** — verb collision with battleship unresolved. Mortar/indirect-fire concept (shells arc over islands — "I was hiding behind an island; I died anyway") was the strongest variant. Tabled.
- **[#31] Battleship repositioning** — monitor takes the star-shell/artillery identity; battleship reworks into a pure juggernaut (armor, presence, ramming synergy). Tabled with the monitor.
- **[#3/#28] Radar Picket** — "overall better detection" is appealing but it lacks a weapon identity; fire-control radar (radar-locked accuracy) parked with it. Tabled until a better idea arrives.
- **[#61] Captor mine** — mine launches a torpedo when tripped; smells overpowered. Parked.
- **[#62] Influence mine** — bigger trigger radius, paints a faint blip when armed. Parked pending the mine-mechanics rethink.

## Rejected (with reasons — the fence's shape)

- Counter-classes (ASW escort, minesweeper) — BR classes must be generalists with a flavor.
- Depth charges as equipment — submarine-specific counterplay; violates universal-counterplay law. (Mines can conceptually double as depth charges if ever needed.)
- Flak/AA gun variant — anti-aircraft-specific; also aircraft mechanics don't exist yet.
- Funnel smoke, oil slicks, wrecks/salvage, fire damage states — simulation creep; arcade feel.
- False distress signal — depends on a "ship dying" ping that doesn't and won't exist.
- Squalls, tides, currents, lighthouses — map features, out of session scope.
- Full-scale RTS carrier — the captain must still drive and fight his own ship.

## Themes and Patterns

- The locked trio's fantasies are all firepower/area control; the new three (sub, carrier, decoy) all trade in **information** — hiding from it, projecting it, corrupting it. The roster now covers both halves.
- The fog-of-war/radar system is the game's most distinctive tech, and the strongest new ideas all write onto it (submerge, blip burst, recon plane, searchlight, star shells).
- Classes create questions that equipment answers (sub → active sonar), keeping counterplay universal instead of class-shaped.

## Promising Combinations

- Ramming mechanic + spar torpedo equipment + juggernaut-battleship rework (#31) — a coherent melee-flavored package if the monitor repositioning ever lands.
- Mine layer's buoy + decoy-blip ambiguity (#34) — deception woven into area denial.
- Speed boost + smoke trail (#35) — if the TB ever wants its smoke heritage back as an upgrade.

## Open Questions (flagged for GDD work)

1. Decoy ship: exact flavor (jammer / false-flag / Q-ship merge), hull identity, weapon fit.
2. Mine layer: signature ability after the buoy rethink; how mines fundamentally work.
3. Carrier: how bombers and the recon plane actually function (launch, control, lifetime, counterplay).
4. Submerge: exact duration/cooldown numbers; periscope visibility tuning.
5. Which parked concepts (monitor repositioning, picket) ever return, and what triggers reconsidering them.

---

## Session Summary

### Most Promising Concepts

**Top Pick: The six-class roster + the ability formula**
TB (speed boost) / mine layer (TBD) / battleship (star shells) / submarine (timed submerge) / carrier (bombers + recon) / decoy ship (blip burst). "Class = hull + signature ability + occasional signature weapon, on shared kit" answers *what is a class in Hullcracker* in one sentence, dissolves the counter-class problem, and hits the 6-great-classes quality bar exactly. The submarine is the most developed new class — its timed submerge carries its own counterplay, satisfying the solo-game constraint.

**Runner-up: The Hades-hammer upgrade & equipment architecture**
Stats mostly rise; some upgrades mutate weapons into variants (never starting kit); level-up shows 4 choices ~one per slot; slot 4 is equipment (new pick when empty, equipment upgrade when filled). One coherent progression model that absorbs nearly every weapon/equipment idea this session produced.

**Honorable Mention: The decoy ship's blip burst**
Bloom into ~5 radar blips (or go radar-dark) on cooldown — maximum new fantasy per unit of new engineering, built entirely on the game's most distinctive system (phosphor radar). Thinnest slot, highest leverage.

### Key Insights

- The locked trio all trade in firepower/area control; every strong new class trades in **information**. The roster's missing half was the fog itself.
- Counterplay belongs to **abilities-on-cooldown and universal tools**, never to classes.
- Aircraft, mine mechanics, and the decoy ship's flavor are the three load-bearing unknowns the GDD must resolve before these classes can be specced.

### Recommended Next Steps

1. Fold session outcomes into the GDD (`gds-gdd` update mode) — roster, ability formula, upgrade architecture, design laws.
2. Run `gds-correct-course` — epics/stories and the readiness report were validated against the old roster; propagate before resuming the story cycle at 1-1.
3. Resolve the three unknowns (aircraft mechanics, mine mechanics, decoy flavor) as targeted design sessions or party-mode stress tests.

---

## Session Complete

**Date:** 2026-07-19
**Duration:** Brainstorming session
**Participant:** Eric

### Output

This brainstorming session generated:

- ~60 raw ideas
- 6 developed class concepts + 1 progression architecture
- 7 design laws, 5 parked concepts, 7 reasoned rejections

### Document Status

Status: Complete
Steps Completed: [1, 2, 3, 4]
