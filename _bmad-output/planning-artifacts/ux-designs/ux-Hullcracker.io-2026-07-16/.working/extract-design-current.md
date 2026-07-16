# Extract: Current DESIGN.md (v0.16 root snapshot)

Source: `imports/DESIGN-v0.16-root.md` (repo root DESIGN.md, written for the turn-based hex era, last logged decision 2026-04-07).

## 1. Inventory — what the file currently defines

### Aesthetic direction
- Direction: "CIC Tactical Display, Evolved" — submarine war room / command center.
- Decoration level: Intentional — black void ocean, silver-white grid lines; 95% calm/disciplined, spectacle reserved for resolution reveals.
- Mood: tense, atmospheric, deliberate; "focused, with moments of awe" — not playful, not grim.
- Reference sites: buddyboardgames.com, papergames.io, openfront.io.

### Typography (Geist family, Google Fonts CDN)
- Display/Hero: Geist Bold. Body: Geist Regular/Medium (tabular-nums for stats). UI/Labels: Geist Mono, uppercase, letter-spaced. Data/Tables: Geist tabular-nums. Code/Grid: Geist Mono (grid labels MUST be monospace).
- Font load URL: `fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600`.
- Scale: Hero 56/700 · H1 36/700 · H2 20/600 · Body 16/400 · Small 14/400 · Caption 12/400 · Label 11/500 mono uppercase 0.1em tracking · Grid 10-11/400 mono.

### Color (approach: restrained — one functional role per color)
- Primary (Tactical Green) `#00FF88` — own ships, valid placements, UI accents, success.
- Secondary (Amber Alert) `#FFB800` — fire targets, action buttons, lock-in, turn indicators.
- Storm (Dimensional Purple) `#7B2FBE` — storm zone, dimensional rift effects.
- Neutrals: Deepest `#000000` (page bg) · Surface `#111111` · Elevated `#232937` · Hover `#111111` · Grid Stroke `#C0C0C0` · Cell Fill `#000000` · Muted text `#5A6478` · Secondary text `#8B95A5` · Primary text `#E2E8F0`.
- Semantic: Hit `#8B0000` · Sunk `#4A0000` · Info `#38BDF8` · Miss `#333333` · Hit markers `#FF6666` @ 0.5 · Danger `#8B2020`.
- Dark mode is the default/identity; light mode via toggle with adjusted palette: green `#059669`, amber `#D97706`, storm `#7C3AED`, red `#DC2626`; backgrounds `#F8FAFC`/`#FFFFFF`/`#F1F5F9`/`#E2E8F0`; text `#0F172A`/`#475569`/`#94A3B8`.

### Grid cell state table (16 states, hex-grid specific)
Empty `#000000` · Your Ship (black + player-color capsule) · Fire Target `#665200` + `◎` `#FFB800`/0.7 · Move Target `rgba(0,255,136,0.15)` + dashed green · Miss `#333333` + `•` `#888`/0.5 · Fading Miss `#222222` + `•` `#666`/0.3 · Hit `#8B0000` + `×` `#FF6666`/0.5 · Your Ship Hit (crimson + capsule) · Sunk `#4A0000` + `×` `#CC4444`/0.4 · Ghost valid `rgba(0,255,136,0.25)` dashed `#00FF88` · Ghost invalid `rgba(255,59,59,0.25)` dashed `#FF3B3B` · Island `#2A2410` stroke `#8B7520` · Storm Zone `rgba(123,47,190,0.15)` pulsing stroke `rgba(123,47,190,0.4)` · Wake Trail `rgba(0,255,136,0.08)`.

### Player colors
- Player-chosen from a curated ~12-color palette; hue-shift on in-match conflicts; premium cosmetic colors envisioned (defaults free).
- Technical: dynamic CSS var `--player-color`, stored on guest session.
- Intensity hierarchy: Tier 1 hull capsules (fill 30% / stroke 100%) · Tier 2 names/borders/chat/turn indicator (100%) · Tier 3 ambient tints (10%).
- Contrast rule: hull capsules get 0.75px `#C0C0C0` inner stroke.

### Spacing & layout
- Base unit 4px; density "comfortable"; scale 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64).
- Layout: grid-disciplined. Desktop >768px: grid + 240px right action sidebar (planning), full-screen grid (resolution), 800px centered stats. Mobile ≤768px: full-screen grid + bottom drawer, ship tabs, mandatory pinch-to-zoom. Max content width 1100px.
- Border radius: sm 2px (grid cells), md 8px (buttons/inputs/alerts), lg 12px (cards/panels).

### Motion
- Two modes: calm/minimal planning; dramatic resolution choreography (abilities 400ms → ship slides 500ms ease-in-out → shot streaks 300ms → explosions 200ms → sinks 400ms → storm damage 200ms; ~2-3s total).
- Kill streak: impact animation + slight screen shake, 600ms. Game-over reveal: 100ms stagger per ship.
- Easing: enter ease-out / exit ease-in / move ease-in-out. Durations: micro 50-100ms, short 150ms, medium 250ms, long 400-700ms (resolution only).

### Sound
- AudioContext-generated tones only, no sound files; generic `playTone(freqStart, freqMid, freqEnd, duration, volume, type)`.
- Carried events: match found 600→1200→800Hz 0.5s; planning start 400→800→600Hz 0.4s; placement confirm 300→350→250Hz 0.15s.
- Planned "2.0" events: lock-in click, resolution rumble, hit impact, miss sonar ping, sunk alarm+boom, kill-streak ascending tone, storm thunder, game-over debrief.
- Mute respects localStorage key `hullcracker-muted`; try/catch silent-fail on unsupported browsers.

### UI screens specified ("2.0" set)
Home/Queue (Play button amber, mode selector, name+color, online count) · Fleet Select (3-ship cards) · Placement (~30s, timer) · Planning Phase (10-15s, action toggles, lock-in, kill feed, "X/8 Locked In") · Resolution (full-screen choreography) · Game Over/Stats (stats grid, Play Again, Return to Home).

### Do's / don'ts and tone rules (implicit — no dedicated section)
- Each color has exactly one functional role.
- Grid labels MUST be monospace.
- Dark theme IS the identity; light mode is an adjusted derivative.
- Hit crimson deliberately desaturated "to avoid visual vibration on black."
- Panels stay tight to maximize grid real estate; long animation durations reserved for resolution only.
- Decisions Log table (4 entries, 2026-03-21 → 2026-04-07) records rationale.

## 2. Format gap vs. Google Labs design.md spec

- **No YAML frontmatter at all** — the spec's machine-readable token block (colors, typography, rounded, spacing, components) is entirely absent; every token lives only in prose/tables.
- Canonical body sections vs. what exists:
  - *Brand & Style* — partially covered by "Aesthetic Direction" + "Product Context" (nonconforming names).
  - *Colors* — exists as "Color" but mixes tokens, semantics, per-cell-state values, and light-mode variants in one section.
  - *Typography* — exists; close in spirit, nonstandard heading/scale format.
  - *Layout & Spacing* — split across separate "Spacing" and "Layout" sections.
  - *Elevation & Depth* — **missing** (only an "Elevated `#232937`" neutral hints at it; no shadow/z-layer system).
  - *Shapes* — **missing** as a section (border-radius values are buried in Layout).
  - *Components* — **missing** entirely; no button/input/card/modal/toast specs (screens are described, components are not).
  - *Do's and Don'ts* — **missing** as a section; rules are scattered inline.
- Extra nonstandard sections the spec doesn't define: Grid Cell States, Player Colors, Motion, Sound Design, UI Screens, Decisions Log (content worth keeping, but not in spec shape).

## 3. Coverage gaps for the real-time game (absence only — no proposals)

The file says nothing about:
- **In-game HUD** — speed/telegraph readout, heading, HP, ammo/reload state, weapon selector (gun/torpedo/mine), upgrade-point bank indicator.
- **Radar & phosphor** — sweep wedge color/opacity, blip color, phosphor decay ramp, radar-vs-sight visual distinction.
- **Fog of war palette** — dark overlay tint/opacity, sight-hole feathering, how islands read under fog.
- **Weapon-arc rendering** — arc fill/stroke, aim cursor, denied-fire feedback.
- **Projectiles, torpedoes, mines** — shell/torp/mine visuals, trails, materialize-at-sight-boundary appearance.
- **Damage feedback** — hit flash, screen shake parameters for RT combat, own-damage vs dealt-damage cues (old "hit cell" states don't map).
- **Ship-class differentiation** — Destroyer/Cruiser/Battleship have no visual identity rules (old fleet was 3 generic ships on hexes).
- **Storm circle rendering in RT** — edge treatment, inside/outside damage cue (only a hex "Storm Zone" cell fill exists).
- **Kill feed styling** — mentioned as a screen element and a 14px size; no colors, iconography, entry lifetime.
- **Upgrade menu / upgrade toast** — CTRL spend window, offer cards, heal option: entirely absent.
- **Spectate mode** — post-death spectate UX/chrome: absent.
- **Match lifecycle chrome** — waiting room, countdown, weapons-safe ready room, results screen for RT (old Game Over screen assumes turn stats like "turns survived").
- **Menu (pre-join DOM overlay)** — current MENU/PLAY flow not covered (old Home/Queue screen differs: mode selector, fleet select).
- **Islands as circles** — only hex-tile island fill defined; gridless island rendering uncovered.
- **Wake/engine telegraph visuals, camera behavior, minimap (if any)** — absent.
- **Drones** — no visual language for target drones vs human ships.
- **Canvas-vs-DOM split** — no guidance on which tokens apply to Pixi-rendered elements vs DOM chrome.

## 4. Internal issues — stale / contradictory content

- **Product Context is wrong for the current game**: "simultaneous-turn naval tactics royale," "same hex grid across dimensions," "every shot crosses dimensional barriers" — the game is now real-time, gridless, single shared ocean; dimensions no longer exist.
- **Hex-grid dependency throughout**: Grid Cell States table (16 states), "Code/Grid: monospace for hex coordinate system," grid-stroke neutral, sm radius "grid cells," layout "the game IS a grid" — all describe a grid that no longer exists.
- **Turn-phase structure is obsolete**: Placement / Planning (10-15s) / Resolution (2-3s choreography) phases, lock-in button, "X/8 Locked In," fire/move action toggles, fading-miss and searched-sector states — the RT game has continuous play.
- **Motion section is built around resolution choreography** (ships slide, shot streaks, staged sequence) that has no RT equivalent as written.
- **Fleet Select screen contradicts current design**: "Select 3 ships, duplicates allowed" vs one ship per player with three classes.
- **Miss/Hit semantics are Battleship-era**: "searched sector, no contact," hit-cell fills, sunk wreckage cells — RT combat has no per-cell hit memory.
- **"8-player support" / "X/8"** — hardcoded count from the old mode; RT battle royale slot count differs.
- **Storm purple described as "dimensional rift effects"** — dimensions are gone; only the shrinking-zone role survives.
- **Player Colors system may be stale**: capsule-on-hex rendering rules (30% fill capsules, inner stroke vs crimson cells) assume hex capsules; guest-session color choice and premium cosmetics are aspirational, not implemented in the RT client.
- **Sound "2.0 events"** reference lock-in, resolution rumble, and turn phases that no longer exist; localStorage mute key naming (`hullcracker-muted`) predates any rebrand decision (repo is still Salvo/Hullcracker split per memory).
- **Light-mode toggle** is asserted as "available" — unclear it exists in the RT Pixi client; the file itself says "This IS the dark theme," a mild tension with maintaining a full light palette.
- **Internal contradiction**: color approach claims "each color has exactly one functional role," but Tactical Green covers own ships + valid placements + UI accents + success + move targets + wake trails; amber covers fire targets + buttons + lock-in + turn indicators.
- **Decisions Log ends 2026-04-07** — nothing records the pivot to the real-time gridless game (the largest design-relevant change in the project's history).
