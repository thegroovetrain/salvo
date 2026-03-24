# Design System — Hullcracker.io

## Product Context
- **What this is:** A browser-based multiplayer naval combat game with a shared-ocean mechanic — all players' ships occupy the same grid, and every shot affects everyone
- **Who it's for:** Friends who want a quick strategic game in the browser (2-6 players, private lobbies + Quick Play)
- **Space/industry:** Casual multiplayer browser games, naval/strategy
- **Project type:** Real-time multiplayer web app (Vite + TypeScript + socket.io)

## Aesthetic Direction
- **Direction:** Retro-Futuristic / Tactical Display
- **Decoration level:** Intentional — subtle scan-line texture on dark backgrounds, faint grid lines evoking radar displays
- **Mood:** Tense, atmospheric, deliberate. Like a submarine's sonar screen — every blip matters. Not playful, not grim — *focused*.
- **Reference sites:** buddyboardgames.com (dark theme approach), papergames.io (clean lobby UX)

## Typography
- **Display/Hero:** Geist Bold — geometric, precise, technical. Evokes tactical interfaces without being cold.
- **Body:** Geist Regular/Medium — excellent readability at small sizes, built-in tabular-nums for stats
- **UI/Labels:** Geist Mono — uppercase, letter-spaced, for section headers and labels
- **Data/Tables:** Geist (tabular-nums) — numeric alignment in stat displays and player lists
- **Code/Grid:** Geist Mono — monospace for the A1-J10 coordinate system. Grid labels MUST be monospace.
- **Loading:** Google Fonts CDN — `https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600`
- **Scale:**
  - Hero: 56px / 700 (game title only)
  - H1: 36px / 700 (turn indicator, game-over headline)
  - H2: 20px / 600 (section headers)
  - Body: 16px / 400 (descriptions, chat messages)
  - Small: 14px / 400 (player list, shot log entries)
  - Caption: 12px / 400 (timestamps, helper text)
  - Label: 11px / 500 mono, uppercase, 0.1em letter-spacing (panel headers, state labels)
  - Grid: 10-11px / 400 mono (coordinate labels)

## Color
- **Approach:** Restrained — each color has exactly one functional role
- **Primary (Tactical Green):** `#00FF88` — your ships, valid placements, UI accents, success states
- **Secondary (Amber Alert):** `#FFB800` — selections, salvo targets, turn indicators, action buttons
- **Neutrals:**
  - Deepest: `#0A0E14` (page background, input backgrounds)
  - Surface: `#1A1F2B` (cards, panels)
  - Elevated: `#232937` (empty grid cells, hover backgrounds)
  - Hover: `#2A3040` (miss cells, dividers)
  - Muted text: `#5A6478`
  - Secondary text: `#8B95A5`
  - Primary text: `#E2E8F0`
- **Semantic:**
  - Hit (Impact Red): `#FF3B3B` — enemy ship hits
  - Friendly Fire (Warning Orange): `#FF8C42` — hits on YOUR ships. Distinct from enemy hits. This color IS the game mechanic.
  - Sunk: `#7F1D1D` — deep dead red, finality
  - Info: `#38BDF8` — waiting states, informational messages
  - Miss: `#2A3040` — barely visible against dark background. Absence, not presence.
- **Dark mode:** Default. This IS the dark theme.
- **Light mode:** Available via toggle. Adjusted palette:
  - Primary green: `#059669`, Amber: `#D97706`, Red: `#DC2626`, Orange: `#EA580C`
  - Backgrounds: `#F8FAFC` / `#FFFFFF` / `#F1F5F9` / `#E2E8F0`
  - Text: `#0F172A` / `#475569` / `#94A3B8`

### Grid Cell States (unified grid — one interactive ocean)
| State | Color | Symbol | Usage |
|-------|-------|--------|-------|
| Empty | `#232937` (elevated) | `·` | Unshot cell, no ship |
| Your Ship | `#00FF88` (green) | `■` | Your ship position (untouched) |
| Selected | `#FFB800` (amber) | `◎` | Target selection |
| Miss | `#2A3040` (hover) | `•` | Shot landed, no ship here |
| Hit (enemy) | `#FF3B3B` (red) | `×` | Hit on another player's ship |
| Friendly Fire | `#FF8C42` (orange) | `⚠` | You hit YOUR OWN ship |
| Your Ship Hit | `#7F1D1D` (sunk) | `×` | Enemy hit YOUR ship |
| Ghost | `rgba(0,255,136,0.2)` + dashed border | `■` | Ship placement preview |
| Valid Placement | `rgba(0,255,136,0.2)` green tint | — | Can place ship here |
| Invalid Placement | `rgba(255,59,59,0.2)` red tint | — | Cannot place here (overlap/OOB) |
| Teammate Ship | `rgba(0,255,136,0.5)` + dashed border | `■` (dashed) | Teammate's ship position (2v2 only) |
| Teammate Ghost | `rgba(0,255,136,0.15)` + dashed border | `■` (faint) | Teammate's in-progress placement preview |
| Multi-Hit | `#FF3B3B` + badge | `×N` | Hit on N overlapping ships (badge in top-right) |

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — grids get generous cell padding, UI panels are tighter to maximize grid real estate
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined — the game IS a grid, every screen honors grid alignment
- **Grid:** Battle screen: 2-column (unified ocean grid | side panel) on desktop. Single column stacked on mobile.
- **Max content width:** 1100px
- **Border radius:** sm: 2px (grid cells), md: 8px (buttons, inputs, alerts), lg: 12px (cards, panels)
- **Responsive breakpoints:**
  - Desktop (>768px): Ocean grid + sidebar
  - Mobile (≤768px): Ocean grid stacked above sidebar
  - Grid cells scale to viewport width, pinch-to-zoom supported

## Motion
- **Approach:** Minimal-functional — no entrance animations. State transitions only.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms)
- **Specific transitions:**
  - Cell state change (hit/miss/sunk): 150ms ease-out background-color
  - Shot log entry: 200ms slide-in from top
  - Turn indicator pulse: 2s infinite subtle opacity pulse
  - Timer warning (≤10s): color transition to red

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Initial design system created | Tactical display aesthetic chosen to amplify shared-ocean tension. Green/amber/red/orange palette maps 1:1 to game mechanics. Geist family for technical precision. |
| 2026-03-21 | Dedicated friendly fire color (#FF8C42 orange) | Core game mechanic deserves its own visual identity — distinct from enemy hits (red). No other Battleship game has this. |
| 2026-03-21 | Geist Mono for grid labels | Coordinate system (A1-J10) requires monospace alignment. Geist Mono matches the tactical display aesthetic. |
| 2026-03-21 | Dark theme as default | Naval/tactical games demand dark backgrounds. Reduces eye strain for extended play. Light mode available as toggle. |
| 2026-03-23 | Quick Play as hero action | 1v1/FFA buttons in amber (action color) above secondary Create/Join. Queue wait screen uses animated green dots with 2s pulse. Match-found sonar ping via Web Audio API with mute toggle. |
| 2026-03-23 | Muted red for destructive actions (`btn-danger`) | `#8B2020` — dim, desaturated red distinct from bright `#FF3B3B` (Impact Red = enemy hits). Reads as caution/destructive without competing with hit cell color. Used for Surrender button and rejoin "Leave Game" button. |
