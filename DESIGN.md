# Design System — Hullcracker.io

## Product Context
- **What this is:** A browser-based simultaneous-turn naval tactics royale with a shared-ocean mechanic. All players' ships occupy the same hex grid across dimensions, every shot crosses dimensional barriers.
- **Who it's for:** Anyone who'd play a browser game with friends or strangers for 5-15 minutes. The agar.io / openfront.io demographic. Ages 16-35, mix of casual and competitive.
- **Space/industry:** .io games, browser-based multiplayer tactics
- **Project type:** Real-time multiplayer web app (Vite + TypeScript + Colyseus)

## Aesthetic Direction
- **Direction:** CIC Tactical Display, Evolved — submarine war room meets interdimensional warfare command center
- **Decoration level:** Intentional — black void ocean, crisp silver-white grid lines evoking a CIC (Combat Information Center) radar display. 95% of the time it's calm, focused, disciplined. During resolution reveals, the dimensions crack open.
- **Mood:** Tense, atmospheric, deliberate. The planning phase is a quiet war room. The resolution phase is controlled spectacle. Not playful, not grim — *focused*, with moments of awe.
- **Reference sites:** buddyboardgames.com (dark theme approach), papergames.io (clean lobby UX), openfront.io (minimalist .io strategy)

## Typography
- **Display/Hero:** Geist Bold — geometric, precise, technical. Evokes tactical interfaces without being cold.
- **Body:** Geist Regular/Medium — excellent readability at small sizes, built-in tabular-nums for stats
- **UI/Labels:** Geist Mono — uppercase, letter-spaced, for section headers and labels
- **Data/Tables:** Geist (tabular-nums) — numeric alignment in stat displays and player lists
- **Code/Grid:** Geist Mono — monospace for hex coordinate system. Grid labels MUST be monospace.
- **Loading:** Google Fonts CDN — `https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600`
- **Scale:**
  - Hero: 56px / 700 (game title only)
  - H1: 36px / 700 (turn indicator, game-over headline)
  - H2: 20px / 600 (section headers)
  - Body: 16px / 400 (descriptions, chat messages)
  - Small: 14px / 400 (player list, kill feed entries)
  - Caption: 12px / 400 (timestamps, helper text)
  - Label: 11px / 500 mono, uppercase, 0.1em letter-spacing (panel headers, state labels)
  - Grid: 10-11px / 400 mono (coordinate labels)

## Color
- **Approach:** Restrained — each color has exactly one functional role
- **Primary (Tactical Green):** `#00FF88` — your ships, valid placements, UI accents, success states
- **Secondary (Amber Alert):** `#FFB800` — fire targets, action buttons, lock-in, turn indicators
- **Storm (Dimensional Purple):** `#7B2FBE` — shrinking ocean storm zone, dimensional rift effects during resolution
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
  - Hit (Dark Crimson): `#8B0000` — cell fill for all hits. Desaturated to avoid visual vibration on black.
  - Sunk: `#4A0000` — deeper crimson for sunk hull capsules and revealed wreckage
  - Info: `#38BDF8` — waiting states, informational messages
  - Miss: `#333333` — visible gray fill, "searched sector." Reads as scanned area on the CIC display.
  - Hit markers: `#FF6666` (bright red at 0.5 opacity) — subtle x on crimson fills as secondary info layer
  - Danger: `#8B2020` — dim desaturated red for destructive actions (Surrender)
- **Dark mode:** Default. This IS the dark theme.
- **Light mode:** Available via toggle. Adjusted palette:
  - Primary green: `#059669`, Amber: `#D97706`, Storm: `#7C3AED`, Red: `#DC2626`
  - Backgrounds: `#F8FAFC` / `#FFFFFF` / `#F1F5F9` / `#E2E8F0`
  - Text: `#0F172A` / `#475569` / `#94A3B8`

### Grid Cell States (CIC tactical display — filled hexes + subtle markers)
| State | Fill | Marker | Usage |
|-------|------|--------|-------|
| Empty | `#000000` (black void) | — | Unsearched ocean |
| Your Ship | `#000000` + player-color capsule | — | Your ship (capsule IS the visual) |
| Fire Target | `#665200` (dark amber) | `◎` (#FFB800/0.7) | Where your shot will land (planning phase) |
| Move Target | `rgba(0,255,136,0.15)` + dashed green | — | Where your ship will move (planning phase) |
| Miss | `#333333` (dark gray) | `•` (#888/0.5) | Searched sector, no contact |
| Fading Miss | `#222222` dimming | `•` (#666/0.3) | Miss from 2-3 turns ago, fading (Phase 3) |
| Hit | `#8B0000` (dark crimson) | `×` (#FF6666/0.5) | Confirmed contact hit |
| Your Ship Hit | `#8B0000` + player-color capsule | `×` (#FF6666/0.5) | Enemy hit YOUR ship |
| Sunk (revealed) | `#4A0000` + `#4A0000` capsule | `×` (#CC4444/0.4) | Destroyed contact wreckage |
| Ghost (valid) | `rgba(0,255,136,0.25)` + dashed `#00FF88` | — | Valid placement preview |
| Ghost (invalid) | `rgba(255,59,59,0.25)` + dashed `#FF3B3B` | — | Invalid placement (overlap/OOB) |
| Island | `#2A2410` (dark yellowish) | — | Terrain / blocked hex, stroke `#8B7520` |
| Storm Zone | `rgba(123,47,190,0.15)` | — | Outer ring danger zone, pulsing purple stroke `rgba(123,47,190,0.4)` |
| Wake Trail | `rgba(0,255,136,0.08)` + faint green | — | Ship moved through here last turn (Phase 3) |

## Player Colors
- **System:** Player-chosen from a curated palette
- **Default palette (~12 colors):** Players select their preferred color. Colors create persistent player identity across games.
- **Conflict resolution:** If two players in the same match choose the same color, the second player gets a slight hue shift to distinguish them.
- **Cosmetic unlock potential:** Premium colors (metallic, gradient, animated) available as cosmetic purchases. All default colors are free.
- **Technical:** Player color is stored on the guest session and applied at runtime. CSS variables are dynamic (`--player-color: <chosen hex>`), not fixed slot variables.
- **Color intensity hierarchy:**
  - Tier 1 (Primary): Hull capsules — fill at 30% opacity, stroke at 100%.
  - Tier 2 (Secondary): Player name text, card borders, chat names, turn indicator — 100% color.
  - Tier 3 (Ambient): Own card background tint, winner row highlight — 10% opacity.
- **Contrast fix:** All hull capsules get a 0.75px `#C0C0C0` inner stroke for contrast against crimson hit cells.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — grids get generous cell padding, UI panels are tighter to maximize grid real estate
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined — the game IS a grid, every screen honors grid alignment
- **Desktop (>768px):**
  - Planning phase: hex grid (left/center) + action sidebar (right, 240px)
  - Resolution phase: full-screen grid, no panels
  - Stats/game-over: centered content, max-width 800px
- **Mobile (<=768px):**
  - Planning phase: full-screen grid + compact bottom drawer (ship tabs, action toggles, lock-in)
  - One ship at a time: tap between ship tabs to assign actions sequentially
  - Pinch-to-zoom mandatory on hex grid. Auto-zoom to fleet area when planning starts.
  - Resolution phase: full-screen grid
- **Max content width:** 1100px
- **Border radius:** sm: 2px (grid cells), md: 8px (buttons, inputs, alerts), lg: 12px (cards, panels)

## Motion
- **Approach:** Intentional — two modes in one game
- **Planning phase:** Calm, minimal. State transitions only. Same as current CIC aesthetic.
- **Resolution phase:** Dramatic choreography. The signature moment.
  - Resolution sequence (2-3 seconds total):
    1. Abilities flash (sonar pings, smoke deploys) — 400ms
    2. Ships slide to new positions — 500ms ease-in-out
    3. Shot streaks travel to targets — 300ms
    4. Hit/miss explosions bloom — 200ms
    5. Damage assessed, ships sink — 400ms
    6. Storm damage applied — 200ms
  - Kill streak text: impact animation with slight screen shake, 600ms
  - Game-over ship reveal: 100ms stagger per ship, sequential
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms) long(400-700ms, resolution only)

## Sound Design
- **Approach:** CIC-authentic AudioContext tones — minimal, functional, no sound files
- **Generic function:** `playTone(freqStart, freqMid, freqEnd, duration, volume, type)` — all tones use this
- **Events (carried from current game):**
  - Match found: 600→1200→800 Hz, 0.5s
  - Planning phase start: 400→800→600 Hz, 0.4s
  - Placement confirm: 300→350→250 Hz, 0.15s
- **New events (2.0):**
  - Lock-in confirm: subtle click tone
  - Resolution start: low rumble building (dimensional rift opening)
  - Shot impact (hit): sharp impact tone
  - Shot impact (miss): sonar ping
  - Ship sunk: alarm warble + low boom
  - Kill streak: ascending triumphant tone
  - Storm closing: distant thunder rumble
  - Game-over: debrief tone
- **Muting:** All tones respect mute toggle (localStorage `hullcracker-muted`)
- **Error handling:** try/catch around AudioContext — silent fail on unsupported browsers

## UI Screens (2.0)

### Home / Queue
- Play button (amber, prominent)
- Mode selector (Battle Royale FFA, Skirmish, Custom Match)
- Player name + chosen color indicator
- Online count

### Fleet Select (Phase 2+)
- Ship type cards with stats and ability descriptions
- Select 3 ships, duplicates allowed
- Fleet preview showing selected composition
- Confirm button

### Placement (~30 seconds)
- Full hex grid, place ships
- Ship palette (bottom drawer on mobile)
- Pinch-to-zoom, auto-zoom to placement area
- Timer prominent

### Planning Phase (10-15 seconds)
- Desktop: hex grid + action sidebar (240px right panel)
- Mobile: hex grid + bottom drawer with ship tabs
- Per-ship action toggles: Fire / Move (Phase 1), Fire / Move / Ability (Phase 2+)
- Tap hex to set fire target or move destination
- Timer at top, lock-in button prominent
- Kill feed at bottom (scrolling event log)
- "X/8 Locked In" indicator (psychological pressure, no action details revealed)

### Resolution (~2-3 seconds)
- Full-screen grid, no panels
- Dramatic choreography plays out in sequence
- Kill streak announcements overlay center screen
- After resolution: brief pause, then planning phase restarts

### Game Over / Stats
- Victory/defeat headline
- Stats grid: shots fired, accuracy, ships sunk, damage dealt/taken, turns survived
- Play Again button (instant requeue)
- Return to Home button

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Initial design system created | Tactical display aesthetic chosen to amplify shared-ocean tension. Green/amber/red palette maps 1:1 to game mechanics. Geist family for technical precision. |
| 2026-03-21 | Dark theme as default | Naval/tactical games demand dark backgrounds. Light mode available as toggle. |
| 2026-03-24 | v0.12.0 CIC grid overhaul | Black void ocean, silver-white grid lines, filled hexes. Desaturated crimson for hits. |
| 2026-04-07 | Hullcracker 2.0 design system update | Evolved CIC for simultaneous-turn tactics royale. Added Storm Purple (#7B2FBE) for shrinking ocean. Motion upgraded from minimal-functional to intentional (calm planning, dramatic resolution). New grid states: storm zone, move target, fire target, fading miss, wake trail. Player colors changed from 6 fixed slots to player-chosen from curated palette with cosmetic unlock potential. 8-player support. New UI screens: fleet select, action panel, resolution choreography, post-match stats. Mobile layout: bottom drawer with ship tabs for one-at-a-time action assignment. |
