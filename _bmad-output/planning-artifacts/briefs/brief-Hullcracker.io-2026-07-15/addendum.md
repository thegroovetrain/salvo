---
title: 'Hullcracker.io — Game Brief Addendum'
status: final
created: '2026-07-15'
updated: '2026-07-15'
---

# Game Brief Addendum — Hullcracker.io

Depth that informs downstream documents (GDD, PRD, architecture) but doesn't fit the 1-2 page brief.

## Design Depth Carried Forward (for the GDD)

Pointers into the source sessions (`_bmad-output/brainstorming-session-2026-07-15.md`, `_bmad-output/forge/identity-fork/forged-idea.md`) — the GDD should read these in full; this is the index of what matters most.

- **The Conservation Law (#42) and its demotion.** The brainstorm session's thesis ("every power-gaining action emits an observable signal") was demoted by the forge from law to *tendency*: anti-snowball now outranks it. The brief cites the forge version; the GDD must not silently re-promote #42.
- **The six promising combinations** (brainstorm organization step): gunnery-feel trio (#19/#21/#34), sonar suite, counter-intel suite, roguelike identity stack, endgame drama stack, mine playstyle. The 0.17 Information-Texture Package (#90) bundles eight cheap fork-agnostic features from these.
- **The compass-veto list** (buildable middle band between Battleship and WoWS): WoWS-creep vetoes — sectional damage, damage-control parties, torpedo variety; board-game-creep vetoes — blind storm ("storm stays damage"). Rationale preserved in the brainstorm doc.
- **Roguelike identity stack options:** Weighted Deck (#83), Choice-Shaped Deck (#85), Named Thresholds (#82), Rare Pull (#84 — Eric: "the optimal form of the roguelike style"). Risk of Rain named required reading (#93). Existing pre-rolled offers likely need "steering, not replacing" (#18).
- **QA/engineering notes:** the leak-law works as a property test ("every power-gaining action emits an observable signal"); batch-simulate the XP economy with drone lobbies before human playtests; drones/telegraph/perception/offer systems keep proving to be half-built foundations (e.g., Carrier planes as air-drones).
- **Playtest findings still to land:** island-stuck bug (#64); gun-vs-torpedo damage gap made the Battleship unwinnable in both Dances (#15 — wants "answers, not bigger numbers"); mines read as bananas (#81 → proximity fuse).
- **Backburnered (accounts-dependent):** Service Record, Pennants, unlockable classes (never power, #54).

## Phased Ring Structure (for the GDD)

Eric's post-dinner idea, 2026-07-15. Total ring closure at **12:00** (currently 10:00), putting the typical match at ~13-15 minutes including finals. Twelve divides cleanly two ways:

- **3 groups × 4 minutes**, or
- **4 groups × 3 minutes** — each group beats as: minute 1 *clear*, minute 2 *next ring revealed*, minute 3 *ring closes*.

The payoff is 3-4 legible **phases** to every match — a named rhythm players can feel and plan around. Notes for the GDD:

- The clear/reveal/close beat gives the early game structure it currently lacks — directly relevant to the open "Quiet Dread minutes 1-3: protect or fix" question (#66). A revealed-but-not-closing ring is a decision generator, not just a timer.
- **Economy coupling:** the forge calibrated the anti-snowball floor as "~1 upgrade/min, zone closed at 10:00" (~10 passive upgrades). A 12:00 closure means ~12 — either retune the tick or accept the deeper builds; this interacts with the open kill-bonus-ratio number and should be batch-simulated with drone lobbies alongside it.
- **Conflict surfaced at brief time:** the 10-Minute Covenant (#55, brainstorm law) and the elevator pitch's "ten-minute matches" both predate this idea. Resolution recorded in the decision log.

## Market Research Digest (web research, July 2026)

### Genre landscape: alive and quietly growing
The browser games market is growing modestly (~$7.8B 2025 → ~$8.0B 2026, ~2.6% CAGR — [TBRC report](https://www.thebusinessresearchcompany.com/report/browser-games-global-market-report)); the interesting story is distribution scale: Poki hit **1 billion plays/month** with ~100M monthly players ([TFN](https://techfundingnews.com/browser-gaming-website-poki-won-big-at-the-dutch-game-awards-celebrating-hitting-1-billion-monthly-plays/)); CrazyGames serves 50M+ monthly players and brands itself "the home of IO games," offering +50% revenue share for 2-month launch exclusivity ([CrazyGames dev portal](https://developer.crazygames.com/), [Game Developer](https://www.gamedeveloper.com/business/the-huge-hidden-web-game-market-no-one-talks-about-and-how-to-get-in-)). GameDiscoverCo's Shell Shockers deep dive: low-seven-figures annual revenue, **80-90% ads / 10-20% cosmetics**, audience skews 10-15yo on school Chromebooks (39% Chromebook), #1 acquisition channel is word-of-mouth at school ([GameDiscoverCo](https://newsletter.gamediscover.co/p/deep-dive-shell-shockers-multi-million)). **Note: Hullcracker's 16-35 target is older than the proven .io core demographic.**

### Direct comparables: naval browser space is thin
- **Mk48.io** — closest comparable: 43 warship-inspired ships and an existing **visual/radar/sonar sensor model** with hiding submarines ([CrazyGames](https://www.crazygames.com/game/mk48-io), [GitHub](https://github.com/SoftbearStudios/mk48)). But open-endless-arena (agar-style leveling), not BR, and in maintenance mode. Population unverified, anecdotally low.
- **Drednot.io** — cooperative airship building + combat; healthy niche; complaints center on griefing / no moderation tools ([RAWG](https://rawg.io/games/drednotio)).
- **Ships 3D** — Unity WebGL crewed sailing, ~20-90 players/server; team-crew fantasy, not solo BR ([CrazyGames](https://www.crazygames.com/game/ships-3d)).
- Battleboats.io / Krew.io / Shipo.io are dated/low-effort. **No browser naval battle-royale found.** Only naval BR precedent: **Maelstrom** (Steam, 2018) — validated the fantasy, died as a downloadable mid-population game ([MMORPG.com](https://www.mmorpg.com/maelstrom/previews/battle-royale-on-the-high-seas-2000107385)). NavalClash/seadogs.io: existence unverifiable.

### Adjacent comparables
- **World of Warships** complaints are remarkably consistent: multi-month/year grind, CV rework "a disaster," submarine spotting/homing torps invalidating destroyers, toxicity ([Steam discussions](https://steamcommunity.com/app/552990/discussions/2/715609580327971963/), [Metacritic](https://www.metacritic.com/game/world-of-warships/user-reviews/)). "WoWS feel without grind/class-imbalance" is a real, articulated pain point.
- **Surviv.io** — killed by Kongregate Feb 2023 after monetization decay; community-resurrected as **survev.io** (Oct 2024), relaunched on Kongregate March 2026 ([Wikipedia](https://en.wikipedia.org/wiki/Surviv.io), [survev.io](https://survev.io/)). Top-down BR demand outlived its corporate owner.
- **ZombsRoyale** — 120M+ lifetime players sustained by constant seasonal cosmetics ([Wikipedia](https://en.wikipedia.org/wiki/ZombsRoyale.io)).
- **OpenFront.io** — the current model .io success: 1M+ MAU claimed (self-reported, unverified), Steam launch March 2026, cash tournaments, 30K+ Discord, spectator format built for streaming ([openfront.io](https://openfront.io/), [Steam](https://store.steampowered.com/app/3560670/OpenFront/)).

### Clip-ability
2025-26 pattern: streamer/YouTuber clips, recirculated through TikTok/Shorts, drive .io spikes; OpenFront leaned into betrayal/diplomacy drama and a built-for-streaming spectator mode. Shell Shockers counter-lesson: school word-of-mouth beats influencer marketing for the younger cohort. Hullcracker's clip-able primitives — radar-blip stalking, torpedo ambushes from fog, last-two-ships circle standoffs — map to the "betrayal/reveal moment" format that worked for OpenFront. (No hard data tying specific .io titles to TikTok view counts.)

### Market gap check: essentially open
"Hunting with imperfect senses" as the *core loop* is unoccupied in the browser space. Mk48.io has sensors as a stat layer in an endless arena, not a deduction game; serious sonar-deduction games (Modern Naval Warfare, Cold Waters, Captain Sonar digitals) are desktop/tabletop. No browser game combines BR structure + fog/radar/counter-intel. **The biggest risks are not competition:** (a) demographic mismatch — proven .io money is 10-15yo ad revenue, not 16-35 cosmetics; (b) Maelstrom's precedent that naval BR pacing can feel slow — the 5-15 minute session cap matters.
