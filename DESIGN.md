# Design System — Hullcracker.io

## Product Context
- **What this is:** A browser-based multiplayer naval combat game with a shared-ocean mechanic — all players' ships occupy the same grid, and every shot affects everyone
- **Who it's for:** Friends who want a quick strategic game in the browser (2-6 players, private lobbies + Quick Play)
- **Space/industry:** Casual multiplayer browser games, naval/strategy
- **Project type:** Real-time multiplayer web app (Vite + TypeScript + socket.io)

## Aesthetic Direction
- **Direction:** Retro-Futuristic / Tactical Display
- **Decoration level:** Intentional — black void ocean, crisp silver-white grid lines evoking a CIC (Combat Information Center) radar display
- **Mood:** Tense, atmospheric, deliberate. Like a submarine war room's tactical display — every contact matters. Not playful, not grim — *focused*.
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
  - Deepest: `#000000` (page background — pure black void)
  - Surface: `#111111` (cards, panels)
  - Elevated: `#232937` (non-grid UI backgrounds — modals, dropdowns)
  - Hover: `#111111` (hover backgrounds)
  - Grid Stroke: `#C0C0C0` (silver-white hex grid outlines — CIC radar overlay)
  - Cell Fill: `#000000` (hex cell background — unsearched ocean)
  - Muted text: `#5A6478`
  - Secondary text: `#8B95A5`
  - Primary text: `#E2E8F0`
- **Semantic:**
  - Hit (Dark Crimson): `#8B0000` — cell fill for all hits (enemy, friendly, your ship). Desaturated to avoid visual vibration on black.
  - Friendly Fire (Warning Orange): `#FF8C42` — marker color only (⚠ symbol). Cell fill is unified crimson. Shape distinguishes from × for colorblind safety.
  - Sunk: `#4A0000` — deeper crimson for sunk hull capsules and revealed wreckage
  - Info: `#38BDF8` — waiting states, informational messages
  - Miss: `#333333` — visible gray fill, "searched sector." Reads as scanned area on the CIC display.
  - Hit markers: `#FF6666` (bright red at 0.5 opacity) — subtle × on crimson fills as secondary info layer
- **Dark mode:** Default. This IS the dark theme.
- **Light mode:** Available via toggle. Adjusted palette:
  - Primary green: `#059669`, Amber: `#D97706`, Red: `#DC2626`, Orange: `#EA580C`
  - Backgrounds: `#F8FAFC` / `#FFFFFF` / `#F1F5F9` / `#E2E8F0`
  - Text: `#0F172A` / `#475569` / `#94A3B8`

### Grid Cell States (CIC tactical display — filled hexes + subtle markers)
| State | Fill | Marker | Usage |
|-------|------|--------|-------|
| Empty | `#000000` (black void) | — | Unsearched ocean |
| Your Ship | `#000000` + green capsule | — | Your ship (capsule IS the visual) |
| Selected | `#665200` (dark amber) | `◎` (#FFB800/0.7) | Salvo target selection |
| Miss | `#333333` (dark gray) | `•` (#888/0.5) | Searched sector, no contact |
| Hit (enemy) | `#8B0000` (dark crimson) | `×` (#FF6666/0.5) | Confirmed hostile contact |
| Friendly Fire | `#8B0000` (dark crimson) | `⚠` (#FF8C42/0.6) | Hit on friendly — orange ⚠ for colorblind safety |
| Your Ship Hit | `#8B0000` (dark crimson) + green capsule | `×` (#FF6666/0.5) | Enemy hit YOUR ship (capsule shows it's yours) |
| Teammate Ship Hit | `#8B0000` + dim green capsule | `×` (#CC4444/0.4) | Teammate ship damaged |
| Sunk (revealed) | `#4A0000` + `#4A0000` capsule | `×` (#CC4444/0.4) | Destroyed contact wreckage |
| Ghost (valid) | `rgba(0,255,136,0.25)` + dashed `#00FF88` | — | Valid placement preview |
| Ghost (invalid) | `rgba(255,59,59,0.25)` + dashed `#FF3B3B` | — | Invalid placement (overlap/OOB) |
| Teammate Ship | `#000000` + dim green capsule (0.15/0.60) | — | Teammate's ship (team games) |
| Teammate Ghost | `rgba(0,255,136,0.15)` + dashed border | — | Teammate's placement preview |
| Island | `#2A2A1A` (dark olive) | — | Terrain / blocked hex |
| Multi-Hit | `#8B0000` + badge | `×N` | Hit on N overlapping ships |

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
  - Placement confirmation: 200ms flash from 80% to 20% green hull fill (JS-driven, inline SVG)
  - Game-over reveal: 100ms stagger per ship, sequential hull appearance

## Sound Design
- **Approach:** CIC-authentic AudioContext tones — minimal, functional, no sound files
- **Generic function:** `playTone(freqStart, freqMid, freqEnd, duration, volume, type)` — all tones use this
- **Events:**
  - Match found: 600→1200→800 Hz, 0.5s (existing)
  - Your turn: 400→800→600 Hz, 0.4s (existing)
  - Salvo — all miss: 200→300→150 Hz, 0.3s (sonar ping)
  - Salvo — hit: 400→600→300 Hz, 0.35s (impact)
  - Salvo — sunk: 600→900→500 Hz, 0.6s (alarm warble)
  - Placement confirm: 300→350→250 Hz, 0.15s (subtle lock-in)
  - Game-over summary: 250→400→200 Hz, 0.5s (debrief)
- **Muting:** All tones respect `state.matchSoundMuted` (localStorage `hullcracker-muted`)
- **Error handling:** try/catch around AudioContext — silent fail on unsupported browsers

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Initial design system created | Tactical display aesthetic chosen to amplify shared-ocean tension. Green/amber/red/orange palette maps 1:1 to game mechanics. Geist family for technical precision. |
| 2026-03-21 | Dedicated friendly fire color (#FF8C42 orange) | Core game mechanic deserves its own visual identity — distinct from enemy hits (red). No other Battleship game has this. |
| 2026-03-21 | Geist Mono for grid labels | Coordinate system (A1-J10) requires monospace alignment. Geist Mono matches the tactical display aesthetic. |
| 2026-03-21 | Dark theme as default | Naval/tactical games demand dark backgrounds. Reduces eye strain for extended play. Light mode available as toggle. |
| 2026-03-23 | Quick Play as hero action | 1v1/FFA buttons in amber (action color) above secondary Create/Join. Queue wait screen uses animated green dots with 2s pulse. Match-found sonar ping via Web Audio API with mute toggle. |
| 2026-03-23 | Muted red for destructive actions (`btn-danger`) | `#8B2020` — dim, desaturated red distinct from bright `#FF3B3B` (Impact Red = enemy hits). Reads as caution/destructive without competing with hit cell color. Used for Surrender button and rejoin "Leave Game" button. |
| 2026-03-24 | Team colors: Alpha=green, Bravo=red, Charlie=blue | Classic RGΒ trio — maximally distinct, intuitive. Charlie uses `#38BDF8` (Info Blue / `var(--info)`), replacing amber which conflicted with selection/action color. |
| 2026-03-24 | v0.12.0 CIC grid overhaul | Black void ocean, silver-white grid lines, filled hexes for all states. Desaturated crimson (#8B0000) for hits (Material Design dark mode guidance). Unified hit fill — capsule presence distinguishes friendly damage. Miss = gray filled sector. Sound design: single composite tone per salvo. Sequential game-over ship reveal. |
