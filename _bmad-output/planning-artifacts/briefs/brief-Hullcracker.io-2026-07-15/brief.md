---
title: 'Hullcracker.io — Game Brief'
status: final
created: '2026-07-15'
updated: '2026-07-15'
---

# Game Brief: Hullcracker.io

## Executive Summary

Hullcracker.io is a real-time naval battle royale in the browser: one warship per captain, a fog-covered ocean of islands, a shrinking storm circle, and information as the scarcest ammunition. It sits deliberately midway between Battleship and World of Warships — the board game's hidden-information soul (calling shots into the dark, reading a radar sweep) fused with the feel of arcade naval gunnery, with none of WoWS's grind or systems bloat. Last hull floating wins.

A playable prototype (v0.16.0) already proves the water: an authoritative 20Hz server simulation with client prediction, two-tier fog of war, three ship classes, guns/torpedoes/mines with real firing arcs, and the storm circle. Three playtests found where the joy lives — it is *kinetic* (threading a torpedo through an island gap, helming through a converging spread) — and that deduction, currently underpaying, is the seasoning that makes those moments feel earned. This brief locks the vision for the road to public beta: deepen the senses so the hunt pays, and grow player identity from "three hulls" into a promise-plus-growth system where your lobby pick is a genuinely different loadout and your match build grows under a hard anti-snowball floor.

Why now: no browser game combines battle-royale structure with fog/radar/counter-intel hunting — the nearest neighbor (Mk48.io) is an endless arena in maintenance mode. World of Warships players articulate, loudly and consistently, exactly the pains this design refuses to inherit. And browser distribution has never been bigger (Poki alone: ~1 billion plays/month).

## Vision

**Core fantasy:** *You are a lone captain hunting — and being hunted — with imperfect senses, on an ocean that keeps getting smaller.*

**Elevator pitch:** A real-time naval battle royale in the browser — Battleship's hidden-information DNA with World of Warships' feel and none of its weight. One short match, start to finish inside fifteen minutes — no install, no account, no grind.

**Emotional contract:** *Frantic to Play, Light to Hold* — high tension inside the match, low stress around it. Players walk away having lived one of three mined fantasies: the **Needle-Threader** (a skill-shot torpedo through terrain finds an unaware target), the **Narrow Escape** (reading converging torpedoes and helming the one survivable path — the moment that dominated every playtest), and **The Dance** (destroyer orbits and jabs; battleship tracks and swings haymakers).

## Target Players & Market

**Primary:** browser multiplayer players, the agar.io / openfront.io demographic — a mix of casual and competitive, playing 5-15 minute sessions, allergic to installs, accounts, and grind. The design compass is the 16-35 player, but the ads-first model means revenue doesn't depend on who actually shows up: the proven portal audience skews 10-15 and plays on desktop browsers (39% of Shell Shockers' traffic is school Chromebooks), and they're welcome — which makes low-end hardware performance a distribution feature.

**Secondary:** World of Warships refugees — players who love naval gunnery feel but publicly resent the multi-month grind, carrier/submarine controversies, and class-invalidating spotting mechanics.

**Market:** the niche is genuinely open — no browser naval battle royale exists as of July 2026, and "hunting with imperfect senses" as a core loop is unoccupied in the browser space (full research digest in the addendum). Distribution channels (Poki, CrazyGames) are at historic scale and actively courting developers. The honest caveats live in Risks.

## Core Fundamentals

**Genre:** top-down real-time naval battle royale, browser-native (.io).

**Core loop (moment to moment):** sail and sense (watch the sweep, read blips, listen) → deduce and position (islands as cover and firing lanes) → strike (arc gunnery, torpedo skill-shots, mines) → survive the reply (helm through the answer) → grow (XP tick and kill bonuses fund upgrade picks) — while the storm closes the ocean in legible phases (a beat of *clear → next ring revealed → ring closes*, fully closed at 12:00) toward a final circle smaller than truesight: *deduction game first, gunnery duel last.*

**Pillars:**

1. **Hunting with Imperfect Senses.** Fog, rotating radar sweep, sonar, and counter-intel are the game. Every power-gaining action leaks an observable signal (wakes, muzzle flash, fall-of-shot); info noise must never obscure the PvP hunt; and all deception is server-authoritative — *lies must live on the server* (the anti-cheat law).
2. **Kinetics as Hero, Deduction as Seasoning.** The helm is the star — playtests proved it. Sensor depth exists to make kinetic moments feel earned, not to turn the game into homework. When deduction stops paying (blind-fire lands nothing today), it gets fixed on the sensing side, not by adding stats.
3. **Promise + Growth Identity.** Your lobby pick is a real promise — a genuinely different loadout at 0:00, every time (the Hades contract: RNG only governs what was never promised). Your match build is a point inside the class envelope. Anti-snowball outranks everything: a passive XP tick (~1 upgrade/minute) is the floor, kill bonuses stay modest, and hiding is legal but priced.
4. **Frantic to Play, Light to Hold.** The Match-Time Covenant — a match never costs more than ~15 minutes (guaranteed endgame at 12:00), and dying never costs more than a click to requeue — plus instant queue, no account required, and *Paint, Not Power*: detection is math, so cosmetics are structurally incapable of being pay-to-win.

## References & Differentiation

- **Battleship (board game)** — taking: hidden information, calling shots into the dark, the thrill of the confirmed hit. Leaving: turns, grids, static targets.
- **World of Warships** — taking: class fantasy, gunnery feel, naval tension. Leaving: the grind, sectional damage and damage-control minutiae, carrier/submarine design mistakes, spotting mechanics that invalidate whole classes.
- **Hades** — taking: the promise/RNG contract for build identity (the boon you picked never lies to you). Leaving: everything else — it's a roguelite, not a BR.
- **Risk of Rain** — taking: stacking upgrades that produce named, felt thresholds. Leaving: PvE scaling madness.
- **Apex Legends** — taking: kits as verb *focus*, not exclusivity (a Torpedo Boat is torp-focused, not torp-only). Leaving: hero locks and ability-driven combat.
- **surviv.io / ZombsRoyale / OpenFront.io** — taking: top-down BR structure, browser-native distribution, clip-able reveal moments, spectator thinking. Leaving: loot-scavenging as the progression spine.

**Differentiators (genuine and specific):** the only naval battle royale in the browser; the only browser game whose core loop is sensor deduction; a structural — not policy — no-pay-to-win guarantee; and a match-identity system (promise + growth) no .io competitor attempts. The edge on "WoWS feel without the weight" is execution and feel, and this brief says so plainly rather than claiming a technical moat.

## Scope & MVP

**Platform:** web browser, desktop keyboard+mouse first; mobile/touch is out of scope for the beta.

**Team & stack:** solo developer (30-year engineer) building with AI agents; a live TypeScript monorepo (Colyseus server, PixiJS client, shared deterministic sim) with 649 passing tests. Scope discipline is the survival constraint, and the roadmap already reflects it ("Sensors First, Fork Later").

**What the prototype has already validated:** the kinetic core — driving, dodging, arc gunnery, torpedo drama — is fun with three classes and identical weapons.

**Public-beta MVP — the hypothesis still to validate:** *does deepening imperfect senses make the hunt itself the retained pleasure?* The minimal package:

1. **The 0.17 Information-Texture Package** — eight cheap, fork-agnostic sensor/feel features (including the gunnery-feel trio: fall-of-shot spotting, hit calls, muzzle-flash carries) attacking the playtest finding that fights collapse to truesight range.
2. **The earn-model switch** — passive XP tick as anti-snowball floor with modest kill bonuses (exact ratio is a named open question; batch-simulate with drone lobbies before human playtests).
3. **The cheapest class experiment** — one hand-built Cruiser loadout variant plus weighted upgrade offers, validating promise + growth before any slot taxonomy is built.
4. **Lobby honesty fixes** — map scales from the actual roster at countdown, larger human-count targets (20-30), fill-or-timer with a two-team minimum, no bot-fill in standard lobbies.

**Explicitly not in the beta MVP:** teams (duos/trios and the ping system they imply), Carrier class, playable submarines, accounts, cosmetics shop, ranked.

**Monetization & distribution:** ads-first, distribution-first — get the game in front of people via the portals (Poki, CrazyGames) and monetize with ads, the proven .io model. Cosmetics, if they ever come, are a later optional add-on under the Paint-Not-Power guarantee. The model is held loosely; if it needs to change, it changes.

**Timeline & budget:** passion-project pace, sequenced in sprints (LAUNCH_PLAN.md is the source of truth); no calendar commitment, near-zero cash budget beyond hosting.

## Content & Direction

**World & tone:** a procedurally seeded island ocean under a shrinking storm; no narrative. The wrapper is playful naval — *Silly Is Sanctioned*: foghorns, named vessels, medals named after the fantasies, an omniscient death reveal that turns losing into learning.

**Content order of magnitude:** one map generator (infinite seeded oceans), three classes at launch growing toward a jobs-not-hulls roster (Mine Layer is the strongest candidate; Carrier only enters if its counterplay is designed first), ~13-15 minute matches (ring fully closed at 12:00), replayability carried by build variety and opponent behavior rather than content volume.

**Art & audio:** "CIC Tactical Display, Evolved" (per DESIGN.md) — phosphor blips, radar sweep, dark-water tactical readability; WebAudio tone system growing toward mood, not orchestration.

## Risks & Open Questions

**Risks:**

- **Audience/performance fit.** With ads-first monetization, the old demographic-mismatch risk largely dissolves — ads monetize whoever shows up. The residual risk is technical and tonal: the portal audience plays on weak hardware (school Chromebooks), so the client must stay light, and a game tuned for 16-35 tension must still read instantly to a 13-year-old between classes.
- **Naval BR pacing.** Maelstrom (Steam, 2018) validated the fantasy and died anyway; slow oceans kill retention. The phased ring (clear → reveal → close), the Match-Time Covenant, and the endgame guarantee are the structural answer; the leading candidate fix for the "quiet dread" of minutes 1-3 is the phased ring, validated (or not) in playtest. Note the honest edge: ~13-15 minute matches sit at the top of the audience's session band — the covenant exists so this stretch is as far as it ever goes.
- **Population cold start.** 20-30-human lobbies need players an indie .io doesn't have on day one. Fill-or-timer and two-team minimums soften it; this needs a real launch-day answer before public beta.
- **The Unwitnessed Build.** The forge's biggest accepted weak point: ten upgrade picks must become *felt* — audio, visuals, on-water behavior — or promise + growth is a spreadsheet.

**Open questions the GDD must resolve:**

- Slot taxonomy and the launch class list
- The kill-bonus ratio ("the one number that prices the rat")
- The ring-phase split (4 groups of 3 minutes vs 3 of 4) and the XP-tick retune the 12:00 closure implies (~12 passive upgrades at 1/min vs the forge's ~10)
- The Eclipse dial and deck-merge mechanism
- The exact positioning slogan ("hunting with imperfect senses" is the claim, not yet the words)
- Stat simplification (#87)
- The minutes-1-3 pacing call
