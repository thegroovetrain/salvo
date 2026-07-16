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

_TBD — facilitation in progress._

### Core Gameplay Loop

_TBD — facilitation in progress._

### Win/Loss Conditions

_TBD — facilitation in progress._

---

## Game Mechanics

### Primary Mechanics

_TBD — facilitation in progress._

### Controls and Input

_TBD — facilitation in progress._

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
