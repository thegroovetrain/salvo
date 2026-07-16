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
The storm closes in legible phases, forcing every hunt to a conclusion. The Endgame Guarantee — a final circle smaller than truesight — converts the deduction game into a gunnery duel at the death. Deduction game first, gunnery duel last; no match ends in mutual avoidance.
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

- **Win:** last human-crewed hull afloat. The win check is human-gated — drones fill empty slots but can never win a match.
- **Loss:** your hull reaches zero. Damage sources: enemy weapons and the storm.
- **On death:** the omniscient reveal — dying means finally seeing everything — then spectate or instant re-queue. Death is cheap by design (Pillar 2): the next match is seconds away.

---

## Game Mechanics

### Primary Mechanics

> Numbers in this document are **design targets or current-prototype reference values, explicitly tunable** — the prototype's CONFIG values were playtest handwaves and carry no authority. Where a value is settled design intent, it is stated as such.

**Ship classes — the promise (Pillar 3).** The lobby pick is your class, and the class is the Hades weapon pick: a complete playstyle and power fantasy, not a hull-size variant. Five classes at beta:

| Class | Power fantasy |
|---|---|
| **Torpedo Boat** | Fast, fragile, the needle-threader: torpedo skill-shots through terrain, orbiting bigger ships, winning on audacity. |
| **Battleship** | Slow, unkillable-feeling, haymaker guns: you don't dodge the argument, you *are* the argument. |
| **Mine Layer** | The trapper: area denial, reading where prey will flee and having already been there. |
| **Gunship** | The gun duelist: the flexible gunfighter who wins the fair fight — or picks the wounded one. |
| **Hunter** *(working name — TBD)* | Sensor-forward: finds everyone first, sees what others can't. Headlines Pillar 1. |

[NOTE FOR DESIGNER: fifth class needs its real name.]

Each class is a **hull envelope** (size, speed, toughness, turning) carrying a **fitted loadout**. Hull envelopes differentiate feel; loadouts differentiate playstyle.

**Slot grammar (universal; contents per class).** Every ship fits:

1. **Basic weapon** — the bread-and-butter strike.
2. **Special weapon** — the fantasy-defining strike.
3. **"Other" ability** — intel-gathering, an additional weapon, or something else entirely, depending on the class fantasy.

Backburnered (designed-for but not in beta): one **pickup weapon slot** (a weapon acquired in-game) and **~4 consumable slots**. The grammar reserves them; the beta does not implement them.

**Movement — telegraph and helm.** Set-and-forget engine orders (9-detent telegraph) plus rudder; ships have separate acceleration and braking rates, and rudder authority reduces below steerage speed. Kinematics are per-class envelope values (current prototype reference: max speeds 30–46 u/s, turn rates 0.6–0.9 rad/s across hulls — all tunable per the five-class redesign).

**Universal sensor suite (Pillar 1).** Three senses on every hull: a **truesight bubble** (live, LOS-clear contacts; reference 220 u), a **rotating radar sweep** (reference 650 u, 4 s revolution) that paints decaying phosphor blips when the beam crosses a LOS-clear ship, and **hull microphones** — a passive listening ring that gives bearing-grade audio detection of nearby noise (engines, torpedoes in the water). One LOS rule everywhere: the observer→point segment must clear all island circles. Only ships paint on radar; projectiles materialize at the sight boundary with no range-derivable fields. Counter-intel law: **lies must live on the server** — deceptions must be indistinguishable on the wire.

**Upgrade economy (Pillar 3).** XP-based leveling: a slow passive XP tick (design target ~1 level per minute) **plus** kill bonuses. Each level banks an upgrade point carrying a **pre-rolled offer** of 3 upgrades from 3 distinct categories (rolled at earn-time, never rerolls); spending picks one, or heals instead (reference: 25 hp/point). Upgrades stack (multiplicative or additive per stat). The passive tick is the anti-snowball floor — everyone grows; kills grow you faster. Kill-bonus sizing is an open balance item (see Progression and Balance).

**The storm (Pillar 4).** A damage-only zone shrinks the ocean in **legible phases** — design target: phased ring closure totaling ~12:00 (phase split open: 3×4 min vs 4×3 min), replacing the prototype's single 45 s grace + 3-min continuous shrink. Storm never blinds sensors; it only damages (reference 4 hp/s). The **Endgame Guarantee**: the final circle is smaller than truesight — deduction game first, gunnery duel last.

### Controls and Input

Desktop keyboard + mouse. Design intent: **hands describe the fantasy** — left hand helms the ship, right hand fights it.

- **Keyboard:** telegraph detents (set-and-forget engine orders) + rudder; weapon-slot selection (basic / special / other); an in-match spend window for upgrade offers and heal. Specific key bindings are provisional — current bindings (e.g. CTRL-chord spend window) are reference only and planned to change.
- **Mouse:** aim within the selected weapon's real firing arc; click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback rather than silence.
- Match completes with keyboard + mouse only. Touch/mobile input is out of scope for beta.

---

## Shooter Specific Design

### Weapon Systems

_TBD — facilitation in progress._

### Aiming and Combat Mechanics

_TBD — facilitation in progress._

### Enemy Design and AI

_TBD — facilitation in progress._

### Arena and Level Design

_TBD — facilitation in progress._

### Multiplayer Considerations

_TBD — facilitation in progress._

---

## Progression and Balance

### Player Progression

_TBD — facilitation in progress._

### Difficulty Curve

_TBD — facilitation in progress._

### Economy and Resources

_TBD — facilitation in progress._

---

## Level Design Framework

### Level Types

_TBD — facilitation in progress._

### Level Progression

_TBD — facilitation in progress._

---

## Art and Audio Direction

### Art Style

_TBD — "CIC Tactical Display, Evolved" per DESIGN.md; to be consolidated during facilitation._

### Audio and Music

_TBD — WebAudio tones growing toward mood, not orchestration; to be consolidated during facilitation._

---

## Technical Specifications

### Performance Requirements

_TBD — facilitation in progress._

### Platform-Specific Details

_TBD — facilitation in progress._

### Asset Requirements

_TBD — facilitation in progress._

---

## Development Epics

### Epic Structure

_TBD — summary table will live here; detailed breakdown in `epics.md`._

---

## Success Metrics

### Technical Metrics

_TBD — facilitation in progress._

### Gameplay Metrics

_TBD — facilitation in progress._

---

## Out of Scope

Explicitly not in the beta (from the game brief; to be confirmed during facilitation):

- Teams (duos/trios + ping system)
- Carrier class; playable submarines
- Accounts, cosmetics shop, ranked
- Mobile/touch support

---

## Assumptions and Dependencies

_TBD — assumption index will be compiled at Finalize._
