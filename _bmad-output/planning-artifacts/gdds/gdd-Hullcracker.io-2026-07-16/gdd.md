---
title: Hullcracker.io - Game Design Document
game_type: shooter
platforms: [desktop-browser]
created: 2026-07-16
updated: 2026-07-16
---

# Hullcracker.io - Game Design Document

**Author:** Eric
**Game Type:** Shooter (top-down naval battle royale)
**Target Platform(s):** Desktop browser (keyboard + mouse)

---

## Executive Summary

### Core Concept

You are a lone captain hunting — and being hunted — with imperfect senses, on an ocean that keeps getting smaller.

A real-time naval battle royale in the browser — Battleship's hidden-information DNA with World of Warships' feel and none of its weight. One short match, start to finish inside fifteen minutes — no install, no account, no grind. Emotional contract: **Frantic to Play, Light to Hold**. North star: midway between Battleship and World of Warships.

### Target Audience

- **Primary:** browser multiplayer players (the agar.io / openfront.io demographic), 5–15 minute sessions, allergic to installs, accounts, and grind. Design compass is 16–35; the ads-first model means the proven portal audience (10–15, school Chromebooks) is welcome, and low-end hardware performance is a distribution feature.
- **Secondary:** World of Warships refugees — players who love the gunnery feel but resent the grind, carriers, submarines, and spotting controversies.

### Unique Selling Points (USPs)

1. The only naval battle royale in the browser.
2. The only browser game whose core loop is sensor deduction — two-tier fog of war (truesight + rotating radar sweep) makes information the primary resource.
3. **Paint, Not Power** — a structural, not policy, no-pay-to-win guarantee: detection is math, so cosmetics are structurally incapable of being pay-to-win.
4. A match-identity system (**promise + growth**) no .io competitor attempts: your lobby pick is a genuinely different loadout at 0:00, and your build grows from kill-banked upgrade points during the match.

---

## Goals and Context

### Project Goals

- Ship a public beta on ads-first browser portals (Poki / CrazyGames) with near-zero budget.
- Solo developer (30-year engineer) plus AI agents; scope discipline is the survival constraint — "Sensors First, Fork Later."
- Passion-project pace; LAUNCH_PLAN.md is the delivery source of truth.

### Background and Rationale

A running prototype exists at v0.16.0 (TypeScript monorepo: authoritative 20Hz server, client prediction, two-tier fog of war, three ship classes, guns/torpedoes/mines with real firing arcs, storm circle, 649 tests). This GDD consolidates the game brief (2026-07-15), the identity-fork forge resolution, and the brainstorming session into the canonical design document for the beta.

Comparables: Mk48.io (closest, maintenance mode), Maelstrom (validated the fantasy, died anyway), Drednot.io, Ships 3D. Reference DNA: Battleship (hidden info), World of Warships (class fantasy, gunnery feel), Hades (promise/RNG contract), Risk of Rain (stackable upgrades, named thresholds), Apex Legends (kits as verb focus, not exclusivity), surviv.io/ZombsRoyale/OpenFront.io (top-down BR structure).

---

## Core Gameplay

### Game Pillars

Every design argument in this document — and downstream in architecture, epics, and balance — gets settled against these four pillars.

**1. Hunting with Imperfect Senses**
Information is the primary resource. Every contact is a deduction from partial sensor data — the truesight bubble, the rotating radar sweep, decaying phosphor blips. The player is never fully informed, and neither is the enemy.
*Steers:* sensor and weapon design (everything either feeds or reads the information game), HUD/UI, the server-side perception boundary, counter-intel features ("lies must live on the server"). A feature that neither produces nor consumes imperfect information must justify itself.

**2. Frantic to Play, Light to Hold**
Real-time gunnery with genuine feel — the World of Warships DNA — inside a package with zero meta-weight: no install, no account, no grind, one complete match inside fifteen minutes.
*Steers:* scope discipline, onboarding (playable within seconds of page load), low-end hardware performance as a distribution feature, and the Paint-Not-Power monetization guarantee.

**3. Promise + Growth**
The lobby pick is a genuine promise: a different loadout at 0:00, not a skin over sameness. Kill-banked upgrade points grow that promise into a build that is *yours* by the endgame. RNG only governs what was never promised (the Hades contract).
*Steers:* class design (class = envelope, build = point inside it; focus, not exclusivity), the pre-rolled offer system, upgrade stacking and named thresholds, anti-snowball tuning.

**4. The Ocean Keeps Getting Smaller**
The storm closes in legible phases, forcing every hunt to a conclusion. The Endgame Guarantee — a final ring two truesight diameters across — forces combat while keeping the sensor game alive to the last shot. No match ends in mutual avoidance.
*Steers:* zone timeline and pacing, map scaling from roster size, endgame tuning, the Rat Covenant (hiding is legal but priced).

### Core Gameplay Loop

One cycle, run continuously from spawn to sinking:

1. **Sail / sense** — work throttle and helm while the truesight bubble and radar sweep feed fragments of the ocean. *(Pillars 1, 4 — the storm dictates where sailing is viable)*
2. **Deduce / position** — turn blips, flashes, and silence into a mental picture; maneuver for the engagement you want. *(Pillar 1)*
3. **Strike** — commit the weapons your loadout promises, within their real firing arcs. The slot grammar is universal; the contents are not — you strike with what you picked and what you've grown. *(Pillars 2, 3)*
4. **Survive the reply** — striking reveals you; helm through the answer. *(Pillars 1, 2)*
5. **Grow** — kills bank upgrade points; spend them to deepen your promise. *(Pillar 3)*

…while **the storm closes in legible phases**, shrinking the water the whole loop happens on — the loop's clock. *(Pillar 4)*

**Why it replays:** it is fun — a quick-to-play battle royale with a decent amount of depth. Matches are short enough to instantly re-queue and deep enough — sensor deduction, promise + growth builds, class matchups — that no two runs play the same. Moments like threading a torpedo through terrain or helming the one survivable path out of a converging spread are emergent highs the systems make possible, not scripted content.

As in any battle royale, matches naturally converge from a long hunt to a forced final showdown; the Endgame Guarantee (Pillar 4) embraces that convergence rather than fighting it.

### Win/Loss Conditions

- **Win:** last **match participant** afloat. The win check counts participants only, in every mode — PvE ships are never participants, can never win, and never need to be destroyed to claim the win.
- **Loss:** your hull reaches zero. Damage sources: enemy weapons and the storm.
- **Sinking — go down shooting.** Reaching zero HP doesn't remove you immediately: you get a short sinking window (~5 s, tunable) in which the hull gradually slows to a stop — a ritardando, not a cut — and your guns stay live. Maybe you take your attacker with you.
- **After the water closes:** the omniscient reveal — dying means finally seeing everything — then spectate or instant re-queue. Death is cheap by design (Pillar 2): the next match is seconds away.

---

## Game Mechanics

### Primary Mechanics

> Numbers in this document are **design targets or current-prototype reference values, explicitly tunable** — the prototype's CONFIG values were playtest handwaves and carry no authority. Where a value is settled design intent, it is stated as such.

**Ship classes — the promise (Pillar 3).** The lobby pick is your class, and the class is the Hades weapon pick: a complete playstyle and power fantasy, not a hull-size variant. Five classes at beta:

| Class | Power fantasy |
|---|---|
| **Torpedo Boat** | Fast, fragile, the needle-threader: torpedo skill-shots through terrain, orbiting bigger ships, winning on audacity. |
| **Battleship** | Massive, heavily armored, long-range artillery: dominates the open ocean from beyond the reply. |
| **Mine Layer** | The trapper: area denial, reading where prey will flee and having already been there. |
| **Gunboat** | Small, fast, lightly armored — speedy boy with some guns. The sustained-damage pick. |

Backburnered (post-beta): a fifth, sensor-forward **Hunter** class (working name TBD) — finds everyone first, sees what others can't.

Each class is a **hull envelope** (size, speed, toughness, turning) carrying a **fitted loadout**. Hull envelopes differentiate feel; loadouts differentiate playstyle.

**Slot grammar (universal; contents per class).** Every ship fits:

1. **The gun** — universal: every class carries the **same standard gun**, working the same way. Short cooldown, basic damage, available to use most of the time.
2. **Two special abilities** — what makes the class unique; **at least one of the two is a weapon**. (In the beta roster the pair is one signature weapon plus one fantasy-complementing ability.)
3. **One extra slot, filled mid-match through the upgrade economy** — every class-specific ability in the game can show up in boon offers, so anyone can acquire torpedoes, mines, a smoke screen: the offers decide.

Class differentiation lives in the two specials and the hull envelope stats — never in the gun.

Backburnered (designed-for but not in beta): **~4 consumable slots**.

**Movement — telegraph and helm.** Set-and-forget engine orders (9-detent telegraph) plus rudder; ships have separate acceleration and braking rates, and rudder authority reduces below steerage speed. Kinematics are per-class envelope values (current prototype reference: max speeds 30–46 u/s, turn rates 0.6–0.9 rad/s across hulls — all tunable per the five-class redesign).

**Universal sensor suite (Pillar 1).** Three senses on every hull: a **truesight bubble** (live, LOS-clear contacts; reference 220 u), a **rotating radar sweep** (reference 650 u, 4 s revolution) that paints decaying phosphor blips when the beam crosses a LOS-clear ship, and **hull microphones** — a passive listening ring that gives bearing-grade audio detection of nearby noise (engines, torpedoes in the water). One LOS rule everywhere: the observer→point segment must clear all island circles. Only ships paint on radar; projectiles materialize at the sight boundary with no range-derivable fields. Counter-intel law: **lies must live on the server** — deceptions must be indistinguishable on the wire.

**Upgrade economy (Pillar 3).** XP-based leveling: a slow passive XP tick (design target ~1 level per minute) **plus** kill bonuses. Each level banks an upgrade point carrying a **pre-rolled offer** of 3 upgrades from 3 distinct categories (rolled at earn-time, never rerolls). The passive tick is the anti-snowball floor — everyone grows; kills grow you faster. Kill-bonus sizing is an open balance item (see Progression and Balance).

Upgrade *content* is Hades-style: qualitative, build-defining boons that change how your loadout behaves — not stat multipliers. The prototype's 14 stat-stack upgrades are dead and will be replaced wholesale (new catalog is dedicated design work; this GDD specifies the model). **Offers can include any class-specific ability in the game** — this is how the extra slot fills, and how a Battleship might grow torpedoes or a Mine Layer a smoke screen. Offer weighting for off-class abilities is open tuning. There is **no heal option in the economy** — a design law: self-heal is never a ship feature; healing, if it exists at all, arrives later via consumables.

**The storm (Pillar 4).** A damage-only zone shrinks the ocean in **legible phases** — design target: phased ring closure totaling ~12:00 (phase split open: 3×4 min vs 4×3 min), replacing the prototype's single 45 s grace + 3-min continuous shrink. Storm never blinds sensors; it only damages (reference 4 hp/s). The **Endgame Guarantee**: the final ring has a diameter of **2 standard truesight diameters** — close enough to force combat, far enough that radar is still needed and close-range hulls hold no clear advantage over long-range ones.

### Controls and Input

Desktop keyboard + mouse. Design intent: **hands describe the fantasy** — left hand helms the ship, right hand fights it.

- **Keyboard:** telegraph detents (set-and-forget engine orders) + rudder; weapon-slot selection (basic / special / other); an in-match spend window for upgrade offers and heal. Specific key bindings are provisional — current bindings (e.g. CTRL-chord spend window) are reference only and planned to change.
- **Mouse:** aim within the selected weapon's real firing arc; click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback rather than silence.
- Match completes with keyboard + mouse only. Touch/mobile input is out of scope for beta.

---

## Shooter Specific Design

### Weapon Systems

**Fitted loadouts (the promise at 0:00).** The **gun is universal** — every class carries the same standard gun, working the same way (short cooldown, basic damage, available most of the time). Class identity comes from the **two special abilities** — at least one of them a weapon — and the hull envelope stats. Per the forge lock, contents are **focus, not exclusivity**, and the mechanism is the economy: **every class-specific ability can appear in boon offers**, filling the extra slot — anyone might grow into torpedoes, mines, or a smoke screen mid-match.

| Class | Gun | Special ability 1 (weapon) | Special ability 2 |
|---|---|---|---|
| **Torpedo Boat** | Standard gun | Torpedo tubes | Smoke screen (#26) |
| **Battleship** | Standard gun | Long-range cannon (artillery) | Star shells (#12) |
| **Mine Layer** | Standard gun | Proximity-fused mines (#81) | Decoy buoy (#69) |
| **Gunboat** | Standard gun | Armor-piercing gun — form open: separate higher-cooldown gun, OR an activatable that boosts damage/rate-of-fire for a few seconds | Speed boost — several seconds of raised speed |

[NOTE FOR DESIGNER: Gunboat AP-gun form (separate gun vs. activatable buff) is an open choice; speed boost is Eric's tentative pick.]

**Weapon behavior laws (settled):**

- All weapons fire within **real firing arcs**; aim is mouse-constrained to the selected weapon's arc.
- Every fitted system has its **own ammo pool and reload timer, and every reload ticks every tick** regardless of which weapon is selected — switching weapons is tempo, not penalty.
- **Torpedoes outrun every hull** at base speed and spawn with real bow clearance plus a brief owner-only grace — they can never self-hit at base speed. Torpedoes are never painted by radar; hydrophones (the listening ring) are the torpedo warning.
- **Mines** arm after a delay, trigger by proximity, and are capped per-player (live-mine cap; oldest evicted) and globally.
- Numbers (damage, reloads, ranges, speeds) are design-target work for the new armory; current prototype values (gun 25 hp/3 s reload, torpedo 55 hp/12 s, mine 45 hp/8 s) are reference only.

**Weapon feel.** The gunnery-feel package from the brainstorm's information-texture bundle (#90) is design intent: **fall-of-shot spotting** (#21 — your splashes are visible in fog, so misses become information and you can bracket-and-walk fire), **the Hit Call** (#19 — a muffled boom and orange bloom confirm you connected without revealing how badly), and **muzzle flash carries** (#34 — firing lights the fog beyond truesight; shooting is being seen). Together: every trigger pull produces information for someone (Pillar 1).

### Aiming and Combat Mechanics

- **Top-down mouse aim.** Aim is constrained to the selected weapon's firing arc; click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback, never silence.
- **Arcs are being rethought for the class era.** Under universal weapons, arcs functioned as positional aiming; with per-class weapons, arcs should let each class use its weapons in more situations while still rewarding skilled play. Exact arc geometry per weapon is open design work. [NOTE FOR DESIGNER: per-weapon arc geometry TBD alongside the new armory's numbers.]
- **No dispersion.** Shots go exactly where they are aimed; travel time is the skill counterweight. Projectiles, never hitscan — leading the target is the game.
- **Flight rules:** torpedoes run until they hit something; gun shells fly to the clicked point or the first thing they hit on the way, whichever comes first.
- **No damage falloff.** Distance never reduces damage.
- **Precision bonus (guns only — status open).** A shell from the standard gun that strikes the target *at the clicked spot* deals bonus damage; a shell that collides with something en route, or catches an enemy who dodged the click point, deals its base damage. Torpedoes never qualify (they have no range maximum). [NOTE FOR DESIGNER: open idea — adopt or drop when tuning the standard gun; whether gun-type specials (long-range cannon, AP gun) also qualify is undecided.]
- **Flat damage model.** No sectional damage, no critical hits, no weak points (compass-vetoed as WoWS-creep) — each weapon deals its damage to a single hull pool, modified only by the precision bonus and upgrades.
- **Combat is sensing (Pillar 1).** Firing produces muzzle flash beyond truesight, splashes visible in fog, and hit calls — every trigger pull is also information, for you and about you.

### Enemy Design and AI

**No bot-fill in standard lobbies.** A standard BR match is humans only: minimum 2 human captains, fill-or-timer, and the map scales from the actual roster at countdown. Bots never masquerade as players.

**Solo vs Bots mode.** A dedicated mode that fills the lobby with actual AI combatant bots — real opponents playing the battle royale, not target practice. AI sophistication is its own design/implementation effort. [ASSUMPTION: bots are driven through the same input pipeline as every ship, per the established architecture principle.]

**Roving PvE drone fleets — in all BR modes.** Every match (standard and Solo vs Bots) contains a few roving PvE drone fleets that can be hunted and killed for XP:

- Ships carrying a basic gun on a longer cooldown, used **only to defend themselves** — they never hunt players.
- Three tiers: **common** small ships (1/4 level per kill), **uncommon** medium ships with more HP (1/3 level), **rare** large ships with even more HP (1/2 level).
- They rove; finding them is part of the sensor game.
- They are an XP source feeding the upgrade economy, not world density — the forge's rejection of "PvE fleets as mandatory world density" stands; these are bounded, huntable pockets.

**Rules that hold for every non-human ship:** driven through the same input pipeline as human ships (no special code paths) and subject to the same perception rules.

**Win check counts match participants only — in every mode.** Roving PvE fleets are not participants: they never need to be destroyed to claim the win, and they can never win. In a standard match the participants are the human captains; in Solo vs Bots, the human and the AI combatant bots.

### Arena and Level Design

**The ocean.** One large circular map per match. Islands are procedurally generated from a seed; both sides rebuild the map deterministically from that seed (the map never travels on the wire). Map size scales from the **actual roster at countdown** — no ghost oceans sized for players who never came.

**Islands** are the terrain system: they block line of sight (the LOS rule for every sensor tier), block shells and torpedoes, and impose collision. They are what makes needle-threading a skill shot, radar shadows a hiding place, and positioning a deduction input.

**Spawning.** Participants spawn on an outer ring, placed for maximum mutual distance and island clearance.

**World features (beta):**

- **Fog banks** (#43-r) — the Trade: inside a fog bank your truesight shrinks, but you vanish from others' truesight (radar may still paint you). Blindness bought with blindness.
- **Rare whirlpools** — rare enough to be an event, not a hazard-course. Each ocean is randomly in the northern or southern hemisphere (never revealed to players); whirlpools spin counterclockwise in the north, clockwise in the south. A whirlpool's job is to spin: a ship passing over one is carried along its circular current — sailing with the current speeds you up, against it slows you down — and the spin rotates your heading (rudder with the current and you keep your facing relative to the whirlpool). No suction, no trap: you can exit from any side. It just makes captaining more interesting.

Backburnered: supply drops (#23). 

**The storm** (Pillar 4) is the arena's clock: phased closure (~12:00 design target) shrinking to the Endgame Guarantee ring — two truesight diameters across, forcing the final fight without retiring the sensors.

### Multiplayer Considerations

- **Modes at beta:** **Solo** (standard BR — humans only, no bot-fill) and **Solo vs Bots** (lobby filled with AI combatants). Both contain roving PvE drone fleets.
- **Lobby:** match starts at **2 human captains** (fill-or-timer), capped at **20** for now.
- **Matchmaking: pure quick play.** Join whatever lobby is filling — no skill matching, no parties, no ranked at beta.
- **Balance frame:** class counterplay flows from focus-not-exclusivity (every class carries the same standard gun; specials define the matchup); the passive XP tick is the anti-snowball floor; Paint-Not-Power keeps every purchasable structurally non-competitive.
- **Post-beta (explicitly out of beta scope):** duos/trios with a ping system, ranked, accounts.

### Multiplayer Considerations

_TBD — facilitation in progress._

---

## Progression and Balance

### Player Progression

**XP and levels.** Passive XP tick of **~1 level per minute** — over a full 12:00 match, ~12 passive levels. This is deliberate generosity: upgrades are fun; players should have them. The tick is also the anti-snowball floor: everyone grows, always.

**Kill bonuses — kill-only, no damage XP:**

| Kill | XP value |
|---|---|
| Opponent (match participant) | 1 full level |
| Common PvE fleet ship (small) | 1/4 level |
| Uncommon PvE fleet ship (medium, more HP) | 1/3 level |
| Rare PvE fleet ship (large, even more HP) | 1/2 level |

These values are declared handwaves — the shape (kills accelerate, participation never zeroes out) is the commitment; exact fractions are tunable.

**Spending.** Each level banks a point; each point carries a pre-rolled offer of 3 Hades-style boons from 3 distinct categories (rolled at earn-time, never rerolled). No heal option. The new boon catalog is dedicated design work; its standing requirement is **the build must be felt** — audio, hull visuals, on-water behavior — or promise + growth is a spreadsheet.

**Balance laws:** the Rat Covenant — hiding is legal but priced (a hiding player ticks but never accelerates; the kill-only bonus is exactly the price). The Conservation Law ("every power gain emits a signal") is a *tendency*, not a law — anti-snowball outranks it.

### Difficulty Curve

The match's tension curve is structural — the ring rhythm *is* the pacing. Three ring groups of ~4 minutes, each with an internal minute rhythm:

- **Minute 1 — clear seas.** Hunt, position, gather.
- **Minute 2 — supply drops spawn.** *(Backburnered feature; this is its reserved slot in the rhythm.)*
- **Minute 3 — next ring revealed.** Planning pressure: where you must be is now known.
- **Minute 4 — the ring closes** down to the next circle.

Three escalating cycles of that rhythm, then the endgame: the final ring is **two standard truesight diameters across** (the Endgame Guarantee) — combat is forced, but radar still earns its keep and no range class gets a free win. Total closure ~12:00; match start-to-results inside ~15:00 (Pillar 2).

### Economy and Resources

- **XP is the only progression currency.** No loot-scavenging spine (explicitly rejected); nothing on the water outranks playing well.
- **Ammo is per-weapon and reload-limited**, not scavenged: each fitted system owns its ammo pool and reload timer, always ticking.
- **The extra slot fills through offers** — off-class abilities appearing in the boon pool are the "pickup" mechanism; nothing is scavenged off the water. Consumable slots are backburnered.

---

## Level Design Framework

### Level Types

One arena type: the circular island ocean, procedurally generated per match from a seed (deterministic on both sides; the map never travels on the wire). Variety comes from generation, not authored maps:

- **Islands** — count, size, and placement vary by seed; they are LOS blockers, cover, collision, and the terrain that makes torpedo skill-shots and radar shadows possible.
- **Fog banks** — truesight-for-truesight trade zones.
- **Rare whirlpools** — spinning currents that carry and rotate hulls that cross them (see Arena and Level Design).
- **Map size scales from the actual roster at countdown** — a 4-captain match and a 20-captain match get honestly-sized oceans.

Generation parameters (island density, size distribution, fog-bank frequency, whirlpool rarity) are tuning work, with one fairness rule: spawn placement is maximum-mutual-distance and island-clear.

### Level Progression

There is no authored level progression — the storm is the level progression. Each match's arena shrinks through three 4-minute ring groups (see Difficulty Curve) down to the Endgame Guarantee ring, so "level design" over time is the same water becoming scarcer, more contested, and finally too small to hide in.

---

## Art and Audio Direction

### Art Style

**DESIGN.md is the design source of truth**; this section summarizes design *intent* — specific colors, type, and spacing live there.

- **Aesthetic: "CIC Tactical Display, Evolved"** — black void ocean, silver-white radar-display linework, phosphor blips, a rotating sweep. The screen reads as a combat information center that happens to be the game itself.
- **Restrained functional color** — each color has exactly one job (tactical green = yours, amber = action, dimensional purple = storm). Dark is the identity, not a theme option.
- **Readability is tactical** — everything on the water is information (Pillar 1), so render clarity is a gameplay feature: blip decay, wounded smoke, muzzle flashes must be readable at a glance on low-end displays.
- [NOTE FOR DESIGNER: DESIGN.md still documents the hex-grid "2.0" era in places (cell states, planning/resolution choreography); it needs an update pass for the real-time game. The aesthetic direction carries forward unchanged.]

### Audio and Music

- **WebAudio tones only, no sound files** — CIC-authentic synthesized tones (pings, warbles, rumbles), growing toward *mood, not orchestration*. All audio respects the mute toggle.
- **Audio is a sensor (Pillar 1):** the listening ring is an audio-first mechanic — engine noise, torpedoes in the water, foghorns, and active pings are heard with bearing. Sound design and game design are the same discipline here.
- **Tone: naval tension with a playful wrapper** — the "Silly Is Sanctioned" contract: foghorn emotes, named vessels turning the kill feed into naval theater, medals. The tension is real; the wrapper never is.

---

## Technical Specifications

### Performance Requirements

- **60 FPS sustained on a low-end school Chromebook** in a full 20-ship match with fog, radar sweep, and effects active. Low-end performance is a distribution feature, not an optimization afterthought (Pillar 2).
- **Playable from portal click in under ~10 seconds** on that same hardware — no install, no account.
- **Authoritative 20 Hz server simulation with client prediction**; playable feel at typical residential latencies (up to ~150 ms without degradation).
- **Structural anti-cheat:** nothing outside a client's sight ∪ radar sweep ever reaches that client; counter-intel lies live on the server and are indistinguishable on the wire.

### Platform-Specific Details

- Desktop browser: current Chrome, Edge, Firefox, Safari. Keyboard + mouse.
- Meets Poki / CrazyGames portal technical requirements (bundle size, SDK integration) — the specifics are launch work; compliance is a hard constraint.
- Mobile/touch: out of scope for beta.

### Asset Requirements

- Rendering is procedural/vector-discipline (Pixi-drawn hulls, linework, effects) — no heavy texture or model pipeline.
- Audio is synthesized WebAudio tones — zero sound-file assets.
- Fonts and any static assets stay within portal bundle-size limits.

---

## Development Epics

### Epic Structure

Detailed breakdown with stories, scope boundaries, and dependencies: `epics.md`.

| # | Epic | Delivers | Playable outcome |
|---|---|---|---|
| E1 | **The Armory** | Slot grammar, universal standard gun, four class loadouts, rethought firing arcs | Pick any of 4 classes; the game feels different at 0:00 |
| E2 | **The New Economy** | XP tick + kill-only bonuses, pre-rolled boon offers, Hades-style boon catalog v1, felt-build presentation, old upgrades stripped, **new keyboard controls** | Level up mid-match; picks visibly change your ship; controls fit the new game |
| E3 | **The Ring** | 3×4 phased storm with minute rhythm, Endgame Guarantee ring (2 truesight diameters) | A full match has its designed pacing arc |
| E4 | **The Living Ocean** | Fog banks, hemisphered whirlpools, roving PvE fleets (3 tiers), sinking window | The water itself creates stories |
| E5 | **Honest Lobbies & Modes** | No bot-fill, min-2 fill-or-timer, cap 20, roster-scaled maps, Solo vs Bots combat AI | Two real modes with honest matches |
| E6 | **Information Texture** | Listening ring + torpedo pips, hit call, fall-of-shot, muzzle flash carries, wounded smoke, foghorn | Every fight is legible through the fog |
| E7 | **Portal Launch Readiness** | Chromebook 60 FPS, <10 s load, portal SDK compliance, how-to-play page | Shippable to Poki/CrazyGames |

**Sequence: E1 → E2 → E3 → E6 → E4 → E5 → E7.** Identity and economy first (the spine everything touches), match shape third, then texture, world, modes, launch.

---

## Success Metrics

### Technical Metrics

The Technical Specifications targets, treated as pass/fail: 60 FPS sustained on a low-end Chromebook in a full 20-ship match; portal click to playable in under ~10 s; feel intact at ~150 ms latency; matches complete without crashes or desyncs.

### Gameplay Metrics

- Matches complete inside 15:00 (Pillar 2's promise, measured).
- Players re-queue immediately after death — the fun proxy; if dying doesn't lead to "again," Pillar 2 is failing.
- All four classes see real pick rates — no class is a dead button (Pillar 3's promise has to be worth promising).
- One playtest-answerable question per pillar — e.g., for Pillar 1: do players describe finding someone as a *deduction*?

---

## Out of Scope

**Backburnered — designed-for, not built in beta:**

- Hunter class (the sensor-forward fifth class; working name TBD)
- ~4 consumable slots per ship
- Supply drops (the ring rhythm reserves their minute-2 slot)
- Sonar as a distinct sensor tier; active ping (Hunter material)

**Post-beta:**

- Teams (duos/trios + ping system)
- Ranked, accounts, cosmetics shop, unlockable classes

**Not planned without design-first work:**

- Carrier class (counterplay must be designed before it enters — the historical stress case)
- Playable submarines
- Mobile/touch support

---

## Assumptions and Dependencies

_TBD — assumption index will be compiled at Finalize._
