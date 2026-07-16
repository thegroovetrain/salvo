---
name: Hullcracker.io
description: CIC Tactical Display, Evolved — dark-only phosphor tactical identity for a real-time browser naval battle royale
status: draft
project: Hullcracker.io
created: 2026-07-16
updated: 2026-07-16
sources:
  - _bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/ (GDD + epics)
  - briefs/brief-Hullcracker.io-2026-07-15/ (brief + addendum)
  - _bmad-output/brainstorming-session-2026-07-15.md
  - imports/DESIGN-v0.16-root.md (v0.16 root DESIGN.md, imported as foundation)
  - .decision-log.md (canonical decisions, this run)
colors:
  # surfaces (locked mocks; supersede v0.16's #111111/#232937 family)
  void: '#050807'
  fog-base: '#020604'
  panel: '#0A0F0D'
  panel-deep: '#070B0A'
  card-scrim: '#030605'      # rendered as rgba(3,7,5,.9) dark glass
  hairline: '#1B2621'
  # linework & text
  silver: '#C0C0C0'
  text-primary: '#E2E8F0'
  text-secondary: '#8B95A5'
  text-muted: '#5A6478'
  # functional (HUD chrome)
  phosphor: '#00FF88'
  phosphor-bright: '#7FFFC4' # menu/wordmark glow tint (locked home mock)
  blip-fresh: '#66FFAA'
  blip-faded: '#0A3D20'
  amber: '#FFB800'
  storm: '#7B2FBE'
  storm-readout: '#B06EE8'
  info: '#38BDF8'
  danger: '#8B2020'
  denied: '#FF3B3B'
  damage: '#8B0000'
  damage-marker: '#FF6666'
  island-fill: '#2A2410'     # provisional carry-over — Open Question (see EXPERIENCE.md)
  island-stroke: '#8B7520'   # provisional carry-over — Open Question
  # drones (PvE — always greyscale)
  drone-outline: '#9AA3B2'
  drone-fill: '#454950'
  # Regatta Hoist personal colors (20 combatant hues; outline values)
  player-lemon: '#FFF04D'
  player-chartreuse: '#C8E619'
  player-olive: '#7A9B0F'
  player-lime: '#7FE03A'
  player-green: '#23B123'
  player-spring: '#37F2A0'
  player-jade: '#0B9E72'
  player-aqua: '#40EEE0'
  player-cyan: '#00D0FF'
  player-lagoon: '#0E7FA0'
  player-sky: '#6FC7FF'
  player-azure: '#0F6FD6'
  player-cobalt: '#5468FF'
  player-periwinkle: '#96A6FF'
  player-iris: '#A66BFF'
  player-orchid: '#C026D3'
  player-fuchsia: '#E14DFF'
  player-magenta: '#FF4FD8'
  player-mulberry: '#B01772'
  player-rose: '#FF85B3'
typography:
  display: { fontFamily: 'Geist', fontWeight: 700 }
  body: { fontFamily: 'Geist', fontSize: '16px', fontWeight: 400 }
  label: { fontFamily: 'Geist Mono', fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em' }
  data: { fontFamily: 'Geist Mono', note: 'tabular-nums for every stat/readout' }
  hud-micro: { fontFamily: 'Geist Mono', fontSize: '9px', letterSpacing: '0.18em' }
rounded:
  none: '0px'      # all tactical/HUD rectangles (Afterimage register)
  sm: '2px'
  md: '8px'        # buttons, inputs, chips (port chrome only)
  lg: '12px'       # cards, panels (port chrome only)
  full: '9999px'
spacing:
  2xs: '2px'
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
  2xl: '48px'
  3xl: '64px'
  chrome-max-width: '1100px'
components:
  hotbar-slot: { size: '54px', border: '1px solid rgba(192,192,192,.28)', background: 'transparent', rounded: '{rounded.none}' }
  ammo-badge: { size: '16px', color: '{colors.phosphor}', background: '{colors.card-scrim}', border: '1px solid rgba(0,255,136,.5)' }
  bank-chip: { size: '30px', border: '1px solid rgba(0,255,136,.65)', animation: 'breathe 2.4s' }
  xp-rail: { width: '3px', track: 'rgba(0,255,136,.12)', fill: '{colors.phosphor}' }
  refit-card: { width: '216px', border: '1px solid rgba(192,192,192,.28)', background: 'rgba(3,7,5,.9)', rounded: '{rounded.none}' }
  slot-tooltip: { width: '236px', background: 'rgba(10,15,12,.97)', border: '1px solid rgba(192,192,192,.4)' }
  hp-rail: { note: 'vertical phosphor rail, right edge of own-vitals cluster — placement [ASSUMPTION], see Components' }
  telegraph-cluster: { ordered: '{colors.phosphor}', actual: '{colors.amber}', rungs: 9 }
  br-chrome: { position: 'top-center', font: '{typography.data}', color: '{colors.text-muted}' }
  kill-feed: { position: 'top-right', fontSize: '14px', color: '{colors.text-muted}', names: 'personal colors' }
  listening-ring: { radius: '~0.5× truesight (visual)', pips: 48, color: '{colors.phosphor}' }
  class-card: { width: '356px', background: '{colors.panel-deep}', rounded: '10px' }
  class-chip: { background: '{colors.panel-deep}', border: '1px solid <personal color>', rounded: '{rounded.md}' }
  color-hoist: { swatch: '20px round', selected: 'personal-color ring' }
  button-primary: { color: '{colors.amber}', style: 'outline + glow, never filled slab' }
  modal: { background: '{colors.panel}', border: '1px solid {colors.hairline}', rounded: '{rounded.lg}' }
  toast: { color: '{colors.phosphor}', fontSize: '16px', ttl: '3s' }
---

# DESIGN.md — Hullcracker.io

Visual identity spine. Peer contract: [EXPERIENCE.md](./EXPERIENCE.md) (how it works). Distilled from `.decision-log.md` (2026-07-16); **spines win on conflict with any mock, wireframe, or import.** Foundation import: [imports/DESIGN-v0.16-root.md](./imports/DESIGN-v0.16-root.md) — kept-what-works per the reconciliation ledger ([reconcile-design-v016.md](./reconcile-design-v016.md)); everything hex-grid-era is dead.

## Brand & Style

**"CIC Tactical Display, Evolved."** The screen reads as a combat information center that happens to be the game itself: black void ocean, silver-white radar linework, phosphor blips, a rotating sweep. Everything on the water is information — render clarity is a gameplay feature, judged against the guardrail *"information noise must never bury the hunt."*

Tone: **naval tension with a playful wrapper — "Silly Is Sanctioned."** The tension is real; the wrapper never is. (Supersedes the hex-era "not playful — focused.")

**Dark-only.** Dark is the identity, not a theme. Light mode is dropped (ledger triage, 2026-07-16).

The tactical register is **"Afterimage"**: floating 1px-outline rectangles with no shared panel — the water shows through every idle element. The root cause of the rejected old weapon UI was *"looks cheap"*; nothing in this system may read as a cheap filled panel. Rendering is procedural vector linework drawn in code — no texture or model pipeline.

## Colors

Functional color is restrained for **HUD chrome only** — the hex-era locked palette rule ("green = yours") is retired: combatant identity now lives in the Regatta Hoist personal-color system below.

| Role | Token | Hex | Use | Never |
|---|---|---|---|---|
| Phosphor | `phosphor` | `#00FF88` | HUD chrome accent: ready states, XP rail, banked chip, toasts, sweep | Player identity (retired role) |
| Phosphor bright | `phosphor-bright` | `#7FFFC4` | Menu/wordmark glow tint, port-chrome phosphor (locked home mock) | Tactical HUD states |
| Blip fresh/faded | `blip-fresh` / `blip-faded` | `#66FFAA` / `#0A3D20` | Phosphor blip decay ramp (Variant P swap only) | Anything else (`#66FFAA` double-duty on splash rings must end) |
| Amber | `amber` | `#FFB800` | Selected / armed / action / warning: selected slot, PLAY, final-10s ring pulse, <50% HP | Hull colors; decoration |
| Storm | `storm` | `#7B2FBE` | The storm zone, exclusively (+ `storm-readout` `#B06EE8` for text) | Anything that isn't the storm |
| Info | `info` | `#38BDF8` | Informational/waiting states (kept semantic) | — |
| Danger | `danger` | `#8B2020` | Destructive actions (leave match, resets) | — |
| Denied | `denied` | `#FF3B3B` | Denied-input pulse, the single denied red (consolidates DOM `#FF3B30`) | Persistent chrome |
| Damage | `damage` / `damage-marker` | `#8B0000` / `#FF6666` | Damage feedback family — deliberately desaturated crimson "to avoid visual vibration on black" | Saturated pure red |
| Silver | `silver` | `#C0C0C0` | Chart rings, idle outlines, neutral linework (low opacity) | — |
| Surfaces | `void`/`fog-base`/`panel`/`panel-deep`/`card-scrim`/`hairline` | see frontmatter | Page/canvas base, fog composite, port panels, dark-glass text beds | — |
| Text | `text-primary`/`-secondary`/`-muted` | `#E2E8F0`/`#8B95A5`/`#5A6478` | Copy hierarchy | Muted below 11px for load-bearing info |
| Islands | `island-fill`/`island-stroke` | `#2A2410`/`#8B7520` | Island circles — provisional carry-over, never re-ratified (Open Question) | — |

The locked 2026-07-16 mocks render on the `void`/`panel` surface family; where the v0.16 import's `#111111`/`#232937` surfaces conflict, the locked mocks win — treat those as deprecated.

**Contrast:** `text-primary` on `void` ≈ 15:1; `phosphor` and `amber` on `void` both > 9:1. `text-muted` on `void` ≈ 3.6:1 — labels/captions only, uppercase mono ≥ 9px, never body copy or load-bearing numbers. Every Regatta hue must hold ≥ 3:1 against `void` (the 20 picks were luminance-spaced for this; verify at implementation).

### Regatta Hoist — personal combatant colors

Every human combatant gets a unique personal color, assigned match-consistently by the server at match start (color index rides the roster; every screen agrees). Player picks a *preference* on the home page — granted unless contended; contention resolves by fair random draw, losers fall to nearest free hue. **Drones are always greyscale** (`drone-outline`/`drone-fill`).

- **Hull treatment:** bright personal color on the hull **outline**; interior fill the **same hue at ~45% value** ("slightly darker shade"). Documented pairs from the ratified boards ([class-silhouettes-1.html](./.working/class-silhouettes-1.html), [home-class-picker-1.html](./.working/home-class-picker-1.html)): Cyan `#00D0FF→#005E73` · Lemon `#FFF04D→#736C23` · Magenta `#FF4FD8→#732461` · Azure `#0F6FD6→#073261` · Fuchsia `#E14DFF→#652373` · Spring `#37F2A0→#196D48` · Iris `#A66BFF→#4B3073` · Aqua `#40EEE0→#1D6B65` · Rose `#FF85B3→#733C51` · Lime `#7FE03A→#39651A` · Cobalt `#5468FF→#262F73` · Orchid `#C026D3→#56115F`. [ASSUMPTION] The remaining 8 fills are computed by the same ~45%-value rule; no documented hexes exist yet.
- **Propagation:** own hull, nameplate, small ownership accents (own blip ring), radar blips + kill-feed names (Variant C, the preferred default). **All HUD chrome stays phosphor-functional.** A Variant P (phosphor-anonymous blips) build flag is kept for playtest swap.
- **Reserved, never a combatant hue:** amber (~25–52°), the red family (~345–25°), storm violet (~266–286°). The remaining ≈250° of wheel is spaced by hue *and* lightness for 20 ships; the shape channel (class silhouettes) carries identity at the extremes.
- **Colorblind assist mode** (committed v1 option): CVD-optimized palette swap and/or boosted blip outlines — exact swap palette is design work to come.

Palette explorations (Scope Jewels, Signal Pennants — not chosen): [ship-color-system-1.html](./.working/ship-color-system-1.html).

### Ship-class silhouette language

Four launch classes, genuinely distinct top-down silhouettes in the shared linework language — ratified board: [class-silhouettes-1.html](./.working/class-silhouettes-1.html). Silhouettes are **gameplay-load-bearing**: radar blips carry the hull outline, so class must read at blip scale. **The silhouette IS the hitbox** for now (accepted knowingly; watch Torpedo Boat balance — decoupling is the named fallback).

| Class | Geometry | Rationale | Hull length | Blip size |
|---|---|---|---|---|
| Torpedo Boat | Knife blade, extreme length-to-beam (~9:1) | "The needle" — long, skinny, hard to hit; balance worry logged | 100 u | 11 px |
| Battleship | Broadest, stepped outline, armor blisters + turret masses | "The fortress" — paints bigger by rule; largest on the board | 124 u | 14 px |
| Mine Layer | Hull widens aft, square rail notch in transom | "The stern is the weapon" — business end faces backward | 88 u | 12 px |
| Gunboat | Compact flared wedge (~2.3:1), flat transom, forward gun mount | "Speedy boy with some guns" — smallest hull | 60 u | 9 px |

Blip rule: outline only, 9–14 px, non-scaling 1px stroke, drawn at every heading — **aspect ratio and size do the discriminating work** at blip scale. Blips also carry heading vector + decaying paint ghosts (per-hue under Variant C).

## Typography

Geist for display/body; **Geist Mono for every label, readout, and stat** — uppercase, letter-spaced, `tabular-nums` so digits never jitter. Loaded from Google Fonts (`Geist 400/500/600/700 · Geist Mono 400/500/600`).

| Role | Face | Size / weight | Notes |
|---|---|---|---|
| Hero / wordmark | Geist | 56/700 (port); ~104/800 at 1080p home wordmark | `.io` suffix in {colors.phosphor-bright} |
| H1 | Geist | 36/700 | |
| H2 | Geist | 20/600 | |
| Body | Geist | 16/400 | |
| Small / caption | Geist | 14/400 · 12/400 | |
| Label | Geist Mono | 11/500, 0.1em tracking, uppercase | {typography.label} |
| HUD readout | Geist Mono | 22px (HDG/KTS), tabular | |
| HUD name line | Geist / 600 | 12–13px | slot item names |
| HUD micro | Geist Mono | 9–10px, 0.1–0.22em tracking, uppercase | slot info, keys, captions — 1080p reference values |

HUD is authored at 1080p reference with the post-playtest ~1.6× register; the UI-scale setting (90/100/125%) multiplies the whole HUD ramp.

## Layout & Spacing

4px base unit, scale {spacing.2xs}–{spacing.3xl}, density "comfortable" — panels stay tight to maximize water. HUD anatomy is corner-anchored (full map in EXPERIENCE.md · HUD & Diegetic UI): hotbar + XP rail bottom-left, own-vitals bottom-right, BR chrome top-center, kill feed top-right. DOM port chrome (home, results, settings, How-to-Play) centers at {spacing.chrome-max-width} max. Canvas is Pixi; DOM only for chrome.

## Elevation & Depth

No drop-shadow language. Depth is expressed two ways:

1. **Glow** — phosphor/amber box-shadow bloom on active elements (e.g. selected slot `0 0 16px rgba(255,184,0,.4)` + inset wash). Glow strength encodes state, never decoration.
2. **Dark glass** — where text must be glanceable over the battle, a near-opaque scrim ({colors.card-scrim} at .9) is permitted as the one departure from water-shows-through; gaps between floating elements keep the battle visible. Full-screen takeovers are reserved for the results/menu layer.

Z-order: world → fog composite → chart layer (fog-immune: sweep, blips, arcs) → Pixi HUD → DOM chrome. DOM z-scale: feed/toasts 900 · modals/banner 1000 · menu 1100 (formalized from today's informal values).

## Shapes

- **Tactical = sharp.** Every HUD rectangle (slots, cards, bars, badges) is {rounded.none}. Squareness is part of the CIC register.
- **Activated-ability mark:** chamfered top-right corner (9px cut on 54px slots, proportional below) distinguishes press-to-trigger abilities from switch-to weapons — a shape signal, not a color signal.
- **Port chrome = soft.** Home/results/settings DOM: {rounded.md} buttons/inputs/chips, {rounded.lg} (10–12px) cards/panels/modals. {rounded.sm} for micro-elements. {rounded.full} for pills/swatches.

## Components

Visual specs; behavior lives in EXPERIENCE.md · Component Patterns. Mocks: [hotbar-blend-DB-1.html](./.working/hotbar-blend-DB-1.html) (slots, tooltip; direction exploration in [hotbar-directions-1.html](./.working/hotbar-directions-1.html), superseded), [spend-window-1.html](./.working/spend-window-1.html) (refit cards, bank chip), [hud-composite-1.html](./.working/hud-composite-1.html) (full HUD), [home-class-picker-1.html](./.working/home-class-picker-1.html) (port chrome).

| Component | Visual spec |
|---|---|
| **Hotbar Slot** | {components.hotbar-slot}: 54×54, 1px outline, transparent fill, icon in `currentColor` inline vector, mono key glyph left of square, label column right (name 12–13px/600 + quick-info mono 9–10px). Idle: silver `.28`. Ready weapon: phosphor `.4` outline + 10px glow. Ready ability: phosphor `.65` outline + 14px glow + chamfer. Selected: {colors.amber} outline, `0 0 16px` glow + inset wash, key + name flip amber. Cooling: icon dims, interior `#030605`, 2px conic perimeter track ({colors.phosphor} elapsed / `.14` remaining), mono seconds readout in quick-info. Activated flash: one-frame phosphor pop (`.2` wash, full outline, 22px bloom) decaying to idle. Empty (offer): 1px **dashed** slate `.45`, `+` glyph, "— awaiting refit —". Denied: 1px→2px {colors.denied} edge pulse + red icon flash. |
| **Ammo Badge** | {components.ammo-badge}: mono count pinned top-right (−7px overhang) of slots storing >1; phosphor digit on scrim, 1px phosphor `.5` border. |
| **Banked-Level Chip** | {components.bank-chip}: 30×30 at the head of the hotbar stack, phosphor `.65` outline, mono count inside, 2.4s ease-in-out breathing glow — never a flash. Cue line beside: "1 LEVEL BANKED / HOLD CTRL TO REFIT" (mono 9px). |
| **XP Rail** | {components.xp-rail}: 3px vertical phosphor rail on the hotbar stack's left edge, fills upward toward next level, `LV n` mono tag at foot. |
| **Refit Card** | {components.refit-card}: 216px wide, 1px outline, dark-glass scrim bed, floating with 20px gaps (no shared panel, no backdrop dim). Anatomy top-down: key chip (22×22 outlined square, overhanging top-left), category tag (mono 9px muted), boon name (15px/600), description (11.5px secondary). Armed (hover/pending): amber outline + glow, key/category/name flip amber, arm-hint line appears. Queue pips in the header (8px squares: filled = on-screen offer, hollow = queued) + dashed ghost edge behind the row = next offer queued. |
| **Slot Tooltip** | {components.slot-tooltip}: 236px, `rgba(10,15,12,.97)` panel, 1px silver `.4` border, pointer notch. Anatomy: name (mono 11px caps), interaction class (mono 9px amber caps), description, "BOONS ACCRUED" divider, boon list (`◆ Name` phosphor + effect line, qualitative Hades-style). |
| **HP Rail** | Own HP as a **vertical rail climbing the right side of the own-vitals cluster**, mirroring the XP rail. [ASSUMPTION] "Right side of the cluster" is the facilitator interpretation of Eric's redline, pending key-screen re-render confirm; the composite mock still shows the horizontal 260×10 bar it replaced. Fill {colors.phosphor} ≥50% → {colors.amber} <50% → {colors.damage-marker} <25%, with pulse rate accelerating as HP drops. `HULL 72/100` mono header. |
| **Telegraph Cluster** | Bottom-right group: HDG/KTS readouts (mono 22px, unit suffixes muted), rudder track (110px, silver hairline, amber position tick), 9-detent telegraph ladder (FULL…STOP…FULL rungs, phosphor ordered-rung marker, amber actual-speed needle, AHEAD/ASTERN captions mono 9px). Restyled to Afterimage linework — no panel. |
| **BR Chrome Bar** | One restrained mono row, top-center: `12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES 0:47`. Numbers phosphor, labels muted. Ring readout pulses {colors.amber} in the final 10s. |
| **Kill Feed** | Top-right, right-aligned, mono 14px uppercase, max 5 lines / 6s TTL. Vessel names 600-weight in their personal colors; connective text ("SUNK BY") {colors.text-muted}; drone names {colors.drone-outline}. |
| **Listening Ring** | Dashed compass rose around own ship (~half truesight radius visually): 48 dash-pips + cardinal ticks, phosphor. Segments light toward noise, brightness ∝ loudness/closeness — near-white phosphor for a close torpedo, faint for distant engines. |
| **Class Card** | {components.class-card}: 356px, `panel-deep`, 10px radius, hairline border. Anatomy: class name (21px/700) + key, fantasy line (italic 12.5px), silhouette box (158px, hull at identity-board geometry), 3 pip scales (SPEED/TOUGHNESS/TURNING — placeholder values), loadout slots, pick button. Selected: personal-color border + glow, name/pips tinted. Unselected silhouettes stay {colors.silver} linework. Ghost card (dashed, "MORE CLASSES IN DEVELOPMENT") clipped at rail edge = scale-past-4 promise. |
| **Class Chip** | Home-at-rest compact chip: silhouette at 44px + role tag (mono 10px muted) + class name (21px/700 in personal color) + sub-line + "CHANGE" affordance; personal-color border + soft glow. Opens the class layer. |
| **Color Hoist** | Row of 20px round swatches (the 20 Regatta hues); selected swatch ringed. Caption: "PREFERENCE PICK — YOU GET IT UNLESS CLAIMED, THEN NEAREST FREE HUE." Must not imply claiming/locking. |
| **Primary Button** | Amber outline + glow register (PLAY/"SET SAIL", RETURN TO PORT): never a filled slab; mono uppercase letter-spaced label, sub-line for context ("DEPLOY AS GUNBOAT · SOLO"). |
| **Modal** | Port-chrome surface: {colors.panel} bed, hairline border, {rounded.lg}. Results modal banner colors: victory phosphor / defeat amber. Fullscreen dim behind results only. |
| **Toast** | Top-center transient, phosphor mono 16px, 3s TTL, max 3 stacked; CSS fade. Glyph prefix (▲/⬆). |

## Do's and Don'ts

- **Do** judge every HUD addition against the guardrail: *information noise must never bury the hunt.* When deduction stops paying, fix it on the sensing side.
- **Do** keep all HUD chrome phosphor-functional; personal color rides only hulls, nameplates, ownership accents, blips, and kill-feed names.
- **Don't** let anything read cheap: no filled panels behind tactical elements, no default-looking buttons. Floating 1px outlines; the water shows through.
- **Don't** use color alone to carry meaning — dual-code every signal (shape/position/text/audio). The ability chamfer, blip outlines, and pip geometry exist for this.
- **Don't** use purple for anything but the storm. Ever.
- **Don't** assign amber, the red family, or storm violet as combatant hues; don't render drones in color.
- **Do** respect photosensitivity restraint: glows breathe (≥2s cycles), they never strobe; denied pulses are 80ms one-shots, rate-limited; no full-screen flashes.
- **Do** use desaturated crimson for damage; never saturated red vibrating on black.
- **Don't** ship two reds: `#FF3B30` (DOM) consolidates into {colors.denied}.
- **Don't** re-derive stats or restate tokens ad hoc — mono `tabular-nums` for every number; sizes from the ramp; spacing from the scale.
- **Do** keep silhouette geometry consistent everywhere a hull appears (water, blip, class card, results) — it's the identity system *and* the hitbox.
