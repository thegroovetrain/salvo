---
name: Hullcracker.io
description: CIC Tactical Display, Evolved — dark-only phosphor tactical identity for a real-time browser naval battle royale
status: final
project: Hullcracker.io
created: 2026-07-16
updated: 2026-07-16
sources:
  - _bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/ (GDD + epics)
  - _bmad-output/planning-artifacts/briefs/brief-Hullcracker.io-2026-07-15/ (brief + addendum)
  - _bmad-output/brainstorming-session-2026-07-15.md
  - imports/DESIGN-v0.16-root.md (v0.16 root DESIGN.md, imported as foundation)
  - .decision-log.md (canonical decisions, this run)
  - validation-report.md (reviewer gate, applied 2026-07-16)
colors:
  # surfaces (locked mocks; supersede v0.16's #111111/#232937 family)
  void: '#050807'
  fog-base: '#020604'
  panel: '#0A0F0D'
  panel-deep: '#070B0A'
  card-scrim: '#030605'      # rendered as rgba(3,6,5,.9) dark glass (comment typo fixed per Eric ruling 2026-07-24; hex authoritative)
  hairline: '#1B2621'
  # linework & text
  silver: '#C0C0C0'
  text-primary: '#E2E8F0'
  text-secondary: '#8B95A5'
  text-muted: '#7A8496'      # lightened from #5A6478 per validation (was 3.38:1; now ≈4.5:1 on void)
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
  # islands — THE FOUR-BAND HYPSOMETRIC TERRAIN RAMP. The grammar was ratified
  # by Eric 2026-08-06 (cycle 59); the twelve hexes, chosen by the implementer
  # from rendered comparison on real generator output, were ratified 2026-08-21
  # (question gate C1). INDEX IS THE BAND LEVEL: 0 shore (the coastline polygon
  # the sim actually collides against) through 3 summit (the innermost
  # isoline). Each band is OUTLINED in its solid scale colour and FILLED with a
  # darker, less intense version of that SAME colour, so a stroke/fill pair is
  # authored together per level and never recombined across rows. Four is the
  # ceiling, not a default — a fifth band needs a ruling, not a fifth literal.
  # The provisional `island-fill`/`island-stroke` yellow that stood here is
  # RETIRED (deleted end to end in code at cycle 82; client/src/config.ts:55-62).
  terrain-0-shore-stroke: '#4A6B33'
  terrain-0-shore-fill: '#242F22'
  terrain-1-slope-stroke: '#7B8A3E'
  terrain-1-slope-fill: '#363C29'
  terrain-2-upland-stroke: '#AE9C58'
  terrain-2-upland-fill: '#484534'
  terrain-3-summit-stroke: '#DCD2AC'
  terrain-3-summit-fill: '#5B5A52'
  # combat effects (minted per validation; hue picks [PROPOSAL], all off the combatant wheel)
  splash: '#B8CCC6'          # miss splash — replaces retired #66FFAA double-duty
  muzzle: '#E8F2EC'
  torpedo: '#CFE8DD'         # promoted from the composite mock
  hit-bloom: '#FF9D3D'
  wounded-smoke: '#7A7168'   # warmed/darkened off drone grey per validation
  # drones (PvE — always greyscale)
  drone-outline: '#9AA3B2'
  drone-fill: '#454950'
  # Regatta Hoist personal colors (20 combatant hues; outline values)
  # REGENERATED 2026-08-21 (Eric ruling, cycle 125): one constant perceptual
  # lightness (OKLCH L 0.60-0.68) instead of the old 33%-79% zigzag, hues placed
  # by search inside the SAME reserved-band-safe arc, chroma at the sRGB gamut
  # edge. The names are lookup keys and are NOT rendered anywhere, so they are
  # kept for wire-order stability rather than as colour descriptions - several
  # no longer describe their value. Generated, not hand-picked; see epic-7
  # amendment 37 for the method and the acceptance numbers.
  player-lemon: '#A1960D'
  player-chartreuse: '#778B0A'
  player-olive: '#5DA20D'
  player-lime: '#11B519'
  player-green: '#12B563'
  player-spring: '#10A981'
  player-jade: '#0D9582'
  player-aqua: '#12ADB3'
  player-cyan: '#0E97AB'
  player-lagoon: '#11A5D7'
  player-sky: '#0C8AC4'
  player-azure: '#0C86EA'
  player-cobalt: '#5C8EFD'
  player-periwinkle: '#6C6FFD'
  player-iris: '#977AFD'
  player-orchid: '#AD58FD'
  player-fuchsia: '#D022FD'
  player-magenta: '#E312D9'
  player-mulberry: '#EF11B2'
  player-rose: '#F8118D'
typography:
  display: { fontFamily: 'Geist', fontWeight: 700 }
  body: { fontFamily: 'Geist', fontSize: '16px', fontWeight: 400 }
  label: { fontFamily: 'Geist Mono', fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em' }
  data: { fontFamily: 'Geist Mono', note: 'tabular-nums for every stat/readout' }
  hud-micro: { fontFamily: 'Geist Mono', fontSize: '9px', letterSpacing: '0.18em' }  # 9px is the floor of the 9–10px micro range (body table)
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
  bank-chip: { size: '30px', border: '1px solid rgba(0,255,136,.65)', animation: 'breathe 2.4s, decays to static glow after ~10s unspent' }
  xp-rail: { width: '3px', track: 'rgba(0,255,136,.12)', fill: '{colors.phosphor}' }
  refit-card: { width: '216px', border: '1px solid rgba(192,192,192,.28)', background: '{colors.panel}', rounded: '{rounded.none}' }  # shipped paints the panel bed, not the card-scrim dark glass
  slot-tooltip: { width: '236px', background: 'rgba(10,15,12,.97)', border: '1px solid rgba(192,192,192,.4)' }
  hp-rail: { note: 'vertical phosphor rail, right edge of own-vitals cluster — confirmed 2026-07-16, see Components' }
  nameplate: { font: '{typography.hud-micro}', color: 'personal text-safe variant', visibility: 'truesight + omniscient reveal' }
  telegraph-cluster: { ordered: '{colors.phosphor}', actual: '{colors.amber}', rungs: 9 }
  br-chrome: { position: 'top-center', font: '{typography.data}', color: '{colors.text-muted}' }
  kill-feed: { position: 'top-right', fontSize: '14px', color: '{colors.text-secondary}', names: 'personal colors (text-safe variants)' }
  foghorn-chevron: { insetPx: 54, ttl: '1200ms', maxMarks: 8, color: '{colors.phosphor}' }
  damage-control-rail: { height: '40px', keyChip: '22px', fontSize: '16px', seamAboveIt: '6px', rounded: '{rounded.none}' }
  aggro-bracket: { sizeFactor: '1.55× the hull bounding radius', padU: 4, armFrac: 0.42, widthU: 1.5, holdAlpha: 0.85, color: '{colors.amber}' }
  results-ad: { slotWidth: '300px', pad: '12px', gap: '24px from the results panel', zIndex: 1010, background: '{colors.panel}', border: '1px solid {colors.hairline}' }
  class-card: { width: '356px', background: '{colors.panel-deep}', rounded: '10px' }
  class-chip: { background: '{colors.panel-deep}', border: '1px solid <personal color>', rounded: '{rounded.md}' }
  color-hoist: { swatch: '20px round', selected: 'personal-color ring' }
  button-primary: { color: '{colors.amber}', style: 'outline + glow, never filled slab' }
  modal: { background: '{colors.panel}', border: '1px solid {colors.hairline}', rounded: '{rounded.lg}' }
  toast: { color: '{colors.phosphor}', fontSize: '16px', ttl: '3s' }
---

# DESIGN.md — Hullcracker.io

Visual identity spine. Peer contract: [EXPERIENCE.md](./EXPERIENCE.md) (how it works). Distilled from `.decision-log.md` (2026-07-16); **spines win on conflict with any mock, wireframe, or import.** Foundation import: [imports/DESIGN-v0.16-root.md](./imports/DESIGN-v0.16-root.md) — kept-what-works per the reconciliation ledger ([reconcile-design-v016.md](./reconcile-design-v016.md)); everything hex-grid-era is dead. Reviewer-gate findings ([validation-report.md](./validation-report.md)) applied 2026-07-16.

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
| Blip fresh/faded | `blip-fresh` / `blip-faded` | `#66FFAA` / `#0A3D20` | The bright→dark phosphor decay ramp for a blip that SETS its own color. **Currently unconsumed:** the Variant-P swap this served was deleted at cycle 51, and the in-game scope's age rides alpha while its strength rides the three band colors, so nothing is left for a color ramp to set (`client/src/render/phosphor.ts:19-25`) | Anything else — splash rings use `{colors.splash}`, ending the `#66FFAA` double-duty; never a strength or identity channel |
| Amber | `amber` | `#FFB800` | Selected / armed / action / warning: selected slot, SET SAIL, final-10s ring pulse, <50% HP | Hull colors; decoration |
| Storm | `storm` | `#7B2FBE` | The storm zone fill/vignette, exclusively (+ `storm-readout` `#B06EE8` for text **and the on-water edge stroke** — the `#7B2FBE` fill is 2.87:1, below the 3:1 graphics threshold, so the edge must read at readout brightness) | Anything that isn't the storm |
| Info | `info` | `#38BDF8` | Informational/waiting states (kept semantic) | — |
| Danger | `danger` | `#8B2020` | Destructive actions (abandoning a LIVE match from settings, resets). Post-death RETURN TO PORT is NOT destructive — it is the amber Primary Button (resolved 2026-07-16) | — |
| Denied | `denied` | `#FF3B3B` | Denied-input pulse, the single denied red (consolidates DOM `#FF3B30`) | Persistent chrome |
| Damage | `damage` / `damage-marker` | `#8B0000` / `#FF6666` | Damage feedback family — deliberately desaturated crimson "to avoid visual vibration on black"; the sink ring uses `damage-marker` | Saturated pure red |
| Combat effects | `splash`/`muzzle`/`torpedo`/`hit-bloom`/`wounded-smoke` | see frontmatter | Miss splash, muzzle flash, torpedo on-water render, Hit Call bloom, wounded smoke — see Components · Combat Effects. Hue picks [PROPOSAL] | Combatant hues; phosphor-adjacent greens (a phosphor-ish splash is a fake blip) |
| Silver | `silver` | `#C0C0C0` | Chart rings, idle outlines, neutral linework (low opacity) | — |
| Surfaces | `void`/`fog-base`/`panel`/`panel-deep`/`card-scrim`/`hairline` | see frontmatter | Page/canvas base, fog composite, port panels, dark-glass text beds | — |
| Text | `text-primary`/`-secondary`/`-muted` | `#E2E8F0`/`#8B95A5`/`#7A8496` | Copy hierarchy | Muted below 11px for load-bearing info |
| Islands | `terrain-N-…-stroke`/`terrain-N-…-fill` (N = 0–3) | see frontmatter | The four-band hypsometric ramp on height-field island **polygons** (cycle 59) — band 0 shore is the coastline the sim collides against; bands 1–3 are render-only isolines of the same field. Grammar ratified 2026-08-06, hexes ratified 2026-08-21 (gate C1); paints via `CLIENT_CONFIG.colors.terrain` | A fifth band (four is the ceiling — needs a ruling); recombining one band's stroke with another band's fill; the retired provisional yellow |

The locked 2026-07-16 mocks render on the `void`/`panel` surface family; where the v0.16 import's `#111111`/`#232937` surfaces conflict, the locked mocks win — treat the import surfaces as deprecated.

**Contrast:** `text-primary` on `void` ≈ 15:1; `phosphor` and `amber` on `void` both > 9:1. `text-muted` on `void` ≈ 4.5:1 (lightened per validation) — labels/captions only, uppercase mono ≥ 9px, never body copy or load-bearing numbers. Every Regatta hue must hold ≥ 3:1 against `void` as a **graphic** (blips, hulls); wherever a personal color renders as **text** (kill feed, results, nameplates), it renders as a **lightened text-safe variant meeting ≥ 4.5:1** — the `storm`→`storm-readout` pattern applied per hue. (Since the cycle-125 regeneration every hue already clears 4.5:1 unaided — min 5.10 — so `textSafe` is currently a no-op for all twenty; the mechanism is kept because it is what guarantees the bar, not because any hue needs it today. The pre-125 wheel had four that did: Mulberry, Azure, Orchid, Lagoon.) **There is no per-hue variant table and there will not be one — decided, not open.** `textSafe(rgb, bg)` (`client/src/util/color.ts:93`) derives the lift ALGORITHMICALLY: it returns the hue unchanged when the hue already clears 4.5:1 against `void`, else lightens it toward white in small uniform steps until it does. A table would be twenty hand-maintained values that the function computes for free and that could drift from the palette; the function cannot. (Contract: lightening only raises contrast against a DARK background — this is the void family's fixer, not a general one.)

### Regatta Hoist — personal combatant colors

Every human combatant gets a unique personal color, assigned match-consistently by the server first-come-first-served at join (color index rides the roster; every screen agrees). Player picks a *preference* in the **class bay's footer** — the duplicate home-page picker is retired, and the bay footer is the Color Hoist's only home (`client/src/ui/classSelect.ts:8`, `client/src/ui/home.ts:996`) — granted if free; if taken, nearest free hue clockwise (ties: seeded random among free hues); colors never change mid-match (Eric ruling 2026-07-23, Story 1.12). **Drones are always greyscale** (`drone-outline`/`drone-fill`).

- **Hull treatment:** bright personal color on the hull **outline**; interior fill the **same hue at HSV value ×0.45** ("slightly darker shade"). **All twenty fills are RULE-DERIVED, and the rule is the whole specification:** `Math.round(channel × 0.45)` applied per channel to the stored sRGB bytes of the outline — which is exactly an HSV V-scale, since V is the max channel and scaling every channel by k scales V by k while leaving H and S untouched (note: on the gamma-encoded bytes, **not** on linear-light values). The cycle-125 regeneration (epic-7 amendment 37) dissolved the old split of twelve hand-authored board pairs plus eight computed ones — no hand-authored pair survives, so there is nothing left to list and nothing left to assume. The resulting values are in the frontmatter (`player-*` outlines) and in `client/src/config.ts` (`players` / `playerFills`); `client/src/__tests__/tokens.test.ts` recomputes every one of the twenty from the rule, so a stray literal fails in CI.
- **Propagation:** own hull, nameplate, small ownership accents (own blip ring), kill-feed names — **all of them in-sight surfaces. Radar returns carry no personal hue** (see *Two sensor tiers* below); ordnance truth-markers (mines, lit zones, **radar buoys**) render in the firer's hue for all observers — a deliberate intel grant, wire carries firer attribution (Eric ruling 2026-07-23, Story 1.12). **The decoy buoy and the whole decoy role are DELETED** (Story 7-5 wave 2, epic-7 amendment 23; `client/src/render/buoys.ts:4-9`): the RADAR BUOY replaced it, **nothing fakes a ship contact any more**, and the old "the decoy's radar blip stays counter-intel-indistinguishable" carve-out therefore has nothing left to describe. **All HUD chrome stays phosphor-functional.** The **Variant C / Variant P** fork is closed and both labels are retired: the phosphor-anonymous **Variant P** build flag was deleted at cycle 51 (amendment 63) and the personal-hue **Variant C** scope at cycle 105, which removed the render modes themselves.
- **Reserved, never a combatant hue: amber (~25–52°) and the red family (~345–25°). That is the whole reserve.** The **storm-violet (~266–286°) and phosphor-green (~±20° around `#00FF88`, ≈132–172°) reservations were RETIRED by Eric ruling 2026-08-21** (question gate B1: *"ima be real, i see myself probably expanding the colors and some other shit in the future. Lets maybe just get rid of the 'law' here."*). The cycle-125 wheel ships exactly as generated — **no hue moved** — so `player-green` (149.8°), `player-spring` (164.3°) and `player-jade` (171.6°) now sit inside the old phosphor band and `player-orchid` (270.9°) inside the old storm-violet band. Recorded honestly: the phosphor reservation existed so a captain's hull could never be mistaken for a radar return, and it is retired **by preference, to keep the palette expandable — not because the concern was found to be wrong**. The surviving amber/red reserve is now pinned against the live wheel by `client/src/__tests__/tokens.test.ts` (the absence of that pin is why the band drift shipped unnoticed). The wheel is spaced by hue at **one constant perceptual lightness** since the cycle-125 regeneration (OKLCH L 0.60–0.68 — see the frontmatter note; the old 33–79% lightness zigzag is gone); the shape channel (class silhouettes) carries class at the extremes.
- **Identity is color-first, on the surfaces that carry identity — informed waiver:** individual combatant identity ("which of 20 players") rides on **hue** wherever the game shows you a hull it has actually resolved — own hull, nameplate, kill-feed name, own-blip ring. Eric accepts that trade against the dual-coding floor (triage 2026-07-16); the floor still holds for class, threat, state, and drone-vs-combatant meaning.
- **Two sensor tiers, two information contents (Eric ruling 2026-08-21):** *"the radar is now a simulated real radar, so its all just radar blips based on realistic return strength."* **Truesight resolves a ship; radar resolves an echo** — so hue lives on the first tier and cannot exist on the second. A return is the hull's coverage footprint rasterized onto the radar lattice, smeared by the beam and quantized into three strength bands: it is a measurement of how much metal reflected, and the sensor has no channel in which to know whose metal it was. **This is the physical model, not a UI compromise** — cycle 105's removal of personal-coloured blips is what the model implies, not a concession made against it. The practical grammar: at radar range you read *something is there, roughly this big, this strongly* and infer class with skill; cross into truesight and the hull resolves, takes its captain's colour, and takes a name.
- **Colorblind assist mode** (committed v1 option): a **family-distinct palette adjustment** — the 20 hues regroup into ~8 clearly separated color families so "boat A vs boat B" stays distinguishable; identity degrades to color-family. **Not Variant P** (rejected in triage — anonymizing everything to green doesn't help red-green CVD). Assist also raises the **minimum decayed-blip alpha** (`blip.assistMinAlpha` 0.35 against a base floor of 0) so a cooling return never sinks to near-invisible; it does not touch blip *outlines*, there being none on the quantized scope. Acceptance: family pairs distinguishable under simulated deuteranopia at blip scale.

Palette explorations (Scope Jewels, Signal Pennants — not chosen): [ship-color-system-1.html](./mockups/ship-color-system-1.html).

### Ship-class silhouette language

Three launch classes (`shared/src/constants.ts` `SHIP_CLASS_IDS`), genuinely distinct top-down silhouettes in the shared linework language — ratified board: [class-silhouettes-1.html](./mockups/class-silhouettes-1.html). Silhouettes are **gameplay-load-bearing** twice over. **The silhouette IS the hitbox** (shared `sim/silhouette.ts` — hull length and beam below are the polygon's own bow-to-stern and max beam), **and it is what the radar measures**: a return is that polygon rasterized onto the radar lattice, so hull shape decides how much of a return a class makes and from which aspect, even though the scope never draws the outline (see *Blip rule* below). Accepted knowingly (accepted knowingly; watch Torpedo Boat balance — decoupling is the named fallback).

| Class | Geometry | Rationale | Hull length | Beam |
|---|---|---|---|---|
| Torpedo Boat | Knife blade, extreme length-to-beam (~9:1) | "The needle" — long, skinny, hard to hit; balance worry logged | 100 u | 9 u |
| Battleship | Broadest, stepped outline, armor blisters + turret masses | "The fortress" — paints bigger by rule; largest on the board | 124 u | 32 u |
| Mine Layer | Hull widens aft, square rail notch in transom | "The stern is the weapon" — business end faces backward | 88 u | 20 u |
| **Drone (PvE)** | **Legacy chevron — the pre-classes hull model, reused verbatim with its existing sizes** | A fourth silhouette no player class wears: drone-vs-combatant reads by shape alone, colorlessly (triage 2026-07-16) | legacy | legacy |

**Blip rule — the SCOPE IS A MEASUREMENT, NOT A DRAWING.** The hex-era rule stated here (a 1px non-scaling hull outline, floored at 11 px, with the Mine Layer notch cut ~3× deep and an arrowhead heading vector) described a render path that **no longer exists**: cycle 105 deleted the `silhouette` grammar outright, and with it every knob only that path read. What ships is a quantized intensity bitmap. A hull's silhouette polygon is rasterized onto the radar lattice at a 9u cell pitch, **dilated by one cell** (structural — a return is the target convolved with the beam) and its fringe **jittered per paint** on a seed of (tick, exact pose) that carries no ship identity, then painted in one of **three strength bands** — a cell is one of the three or it is fully transparent; there is no blend, no gradient and no fourth state. So **aspect ratio and size still do the discriminating work**, but as coverage rather than as line: class is *inferable with skill, never readable*, and heading reads off the footprint's own elongation rather than off a vector glyph. **Persistence:** a paint lives 3 sweep periods — the live return plus **≤2 decaying ghosts**, ~12s of track at 15rpm — and **ghost spacing encodes speed for free** (a fast hull's ghosts sit nose-to-tail, a loitering hull's overlap into a blob). The ≤3 cap is a legibility rule; the retired Chromebook perf justification behind it was dropped by Eric ruling 2026-08-21 (gate C3). **Opacity carries two things at once and nothing else:** age (a paint fades across its life) and viewing distance (returns display at 20% inside ⅛ of intel range, ramping to full at ⅝ — *"my radar results [should] be visible but less prominent in the near sight range where i am going to aim based on LOS rather than radar ghosts"*). There is **no per-hue luminance floor on the scope** any more — the retired one existed because blips wore personal colours; the surviving floor is a flat **decayed-alpha minimum raised by the colourblind assist**, which is a legibility guarantee rather than a fairness one, since no captain's return differs from another's.

## Typography

Geist for display/body; **Geist Mono for every label, readout, and stat** — uppercase, letter-spaced, `tabular-nums` so digits never jitter. Loaded from Google Fonts (`Geist 400/500/600/700 · Geist Mono 400/500/600`).

| Role | Face | Size / weight | Notes |
|---|---|---|---|
| Hero / wordmark | Geist | 56/700 (port); ~104/700 at 1080p home wordmark | `.io` suffix in {colors.phosphor-bright} |
| H1 | Geist | 36/700 | |
| H2 | Geist | 20/600 | |
| Body | Geist | 16/400 | |
| Small / caption | Geist | 14/400 · 12/400 | |
| Label | Geist Mono | 11/500, 0.1em tracking, uppercase | {typography.label} |
| HUD readout | Geist Mono | 22px (HDG/KTS), tabular | |
| HUD name line | Geist / 600 | 12–13px | slot item names |
| HUD micro | Geist Mono | 9–10px, 0.1–0.22em tracking, uppercase | slot info, keys, captions — 1080p reference values; frontmatter 9px is this range's floor |

HUD is authored at 1080p reference with the post-playtest ~1.6× register; the UI-scale setting (90/100; 125% on viewports ≥1600 px wide) multiplies the whole HUD ramp — **but no mono type renders below 9px post-scale** (the 90% setting scales geometry and exempts the micro type tier).

## Layout & Spacing

4px base unit, scale {spacing.2xs}–{spacing.3xl}, density "comfortable" — panels stay tight to maximize water. HUD anatomy is corner-anchored (full map in EXPERIENCE.md · HUD & Diegetic UI): hotbar + XP rail bottom-left, own-vitals bottom-right, BR chrome top-center, kill feed top-right. DOM port chrome (home, results, settings, How-to-Play) centers at {spacing.chrome-max-width} max. Canvas is Pixi; DOM only for chrome.

## Elevation & Depth

No drop-shadow language. Depth is expressed two ways:

1. **Glow** — phosphor/amber box-shadow bloom on active elements (e.g. selected slot `0 0 16px rgba(255,184,0,.4)` + inset wash). Glow strength encodes state, never decoration.
2. **Dark glass** — where text must be glanceable over the battle, a near-opaque scrim ({colors.card-scrim} at .9) is permitted as the one departure from water-shows-through; gaps between floating elements keep the battle visible. Full-screen takeovers are reserved for the results/menu layer.

Z-order: world → fog composite → chart layer (fog-immune: sweep, blips, arcs) → Pixi HUD → DOM chrome. (The **listening ring + pips** used to sit in that list and to be the reason the chart layer outranked the refit card layer; the ring was DEFERRED and never built — `client/src/render/foghorn.ts:1-3` — so the clause goes with it. The refit band's own placement rule is now stated on the Refit Card row below.) **Hulls are the one exception (Eric ruling 2026-08-13): the ship layer sits in the chart layer directly above blips and below the aim reticle, so a hull you can actually see always reads above the radar paint. It carries the fog's own feather curve as a hull alpha so the sight boundary still softens; nameplates FOLLOWED it on 2026-08-21 (Eric ruling: *"names need to appear above all players and in front of islands, not behind. they should never be obscured by terrain"*, with *"i think i should be able to see aiming reticles over it. Just not terrain."*) — the plate layer sits in the chart layer directly above the ship layer and below the aim reticle, so a name reads over terrain and over every hull while the reticle, burst rings and sweep read over the name; it carries the same fog feather as a plate alpha.** DOM z-scale: feed/toasts 900 · modals/banner 1000 · menu 1100 (formalized from today's informal values).

## Shapes

- **Tactical = sharp.** Every HUD rectangle (slots, cards, bars, badges) is {rounded.none}. Squareness is part of the CIC register.
- **Activated-ability mark:** chamfered top-right corner (9px cut on 54px slots, proportional below) distinguishes press-to-trigger abilities from switch-to weapons — a shape signal, not a color signal.
- **Silhouettes:** the ship-class silhouette language (hulls, blips, drone chevron) lives under Colors › Ship-class silhouette language — shape/identity content, pointered here for consumers scanning Shapes.
- **Port chrome = soft.** Home/results/settings DOM: {rounded.md} buttons/inputs/chips, {rounded.lg} (10–12px) cards/panels/modals. {rounded.sm} for micro-elements. {rounded.full} for pills/swatches.

## Components

Visual specs; behavior lives in EXPERIENCE.md · Component Patterns. Mocks: [hotbar-blend-DB-1.html](./.working/hotbar-blend-DB-1.html) (slots, tooltip; direction exploration in [hotbar-directions-1.html](./.working/hotbar-directions-1.html), superseded), [spend-window-2.html](./mockups/spend-window-2.html) (refit cards, bank chip, spend-failure; v1 retained as audit trail), [hud-composite-2.html](./mockups/hud-composite-2.html) (full HUD; v1 superseded), [home-class-picker-1.html](./mockups/home-class-picker-1.html) (port chrome), [death-reveal-results-1.html](./mockups/death-reveal-results-1.html) (sinking / reveal / results). All key glyphs share one mono key-chip family so "keys look like this" reads as one system: **beside the hotbar slots, the gun is KEYLESS** (it is the permanently-selected default weapon, so its chip renders as a ghost that keeps the row's alignment) with **Q** and **E** on the two class specials and **R** on the pickup/extra slot, top-to-bottom Gun–Q–E–R (`client/src/render/equipmentInfo.ts:28`); **F** is the foghorn and is not a slot at all; on refit cards the chips are **1–4**, with **5** on the DAMAGE CONTROL rail below the row and **Tab** opening the window (Eric ruling 2026-08-21, gate D1); and W/S/A/D sit at the helm gauges.

| Component | Visual spec |
|---|---|
| **Hotbar Slot** | {components.hotbar-slot}: 54×54, 1px outline, transparent fill, icon in `currentColor` inline vector, mono key glyph left of square, label column right (name 12–13px/600 + quick-info mono 9–10px). Idle: silver `.28`. Ready weapon: phosphor `.4` outline + 10px glow. Ready ability: phosphor `.65` outline + 14px glow + chamfer. Selected: {colors.amber} outline, `0 0 16px` glow + inset wash, key + name flip amber — **the inset wash + filled key chip are the selected-state channel; hue is secondary** (dual-coding). Cooling: icon dims, interior {colors.card-scrim}, 2px conic perimeter track ({colors.phosphor} elapsed / `.14` remaining), mono seconds readout in quick-info. Activated flash: one phosphor pop (`.2` wash, full outline, 22px bloom) decaying over ≤80ms (specced in ms, not frames). Empty (offer): 1px **dashed** slate `.45`, `+` glyph, "— awaiting refit —". Denied: 1px→2px {colors.denied} edge pulse + red icon flash. |
| **Ammo Badge** | {components.ammo-badge}: mono count pinned top-right (−7px overhang) of slots storing >1; phosphor digit on scrim, 1px phosphor `.5` border. |
| **Banked-Level Chip** | {components.bank-chip}: 30×30 at the head of the hotbar stack, phosphor `.65` outline, mono count inside, 2.4s ease-in-out breathing glow — never a flash. Breathing decays to a **static glow after ~10s unspent** (a static chip still reads "banked"); re-arms on a new bank or on **Tab** opening the refit window (`client/src/render/xpRail.ts:178-186`). Cue line beside: **`LEVEL UP — TAB TO REFIT`** (`client/src/render/xpRail.ts:149`; its toast twin is `▲ LEVEL UP — TAB TO REFIT`, `client/src/ui/upgradeToast.ts:22`), and it is suppressed whenever the bank cannot actually be acted on. **Tab (open) · 1–4 (pick) · 5 (DAMAGE CONTROL) is the ratified refit binding** — Eric ruling 2026-08-21, question gate D1 — superseding the hex-era `1 LEVEL BANKED / HOLD SPACE TO REFIT` copy and the HOLD-SPACE grammar behind it. |
| **XP Rail** | {components.xp-rail}: 3px vertical phosphor rail on the hotbar stack's left edge, fills upward toward next level, `LV n` mono tag at foot. |
| **Refit Card** | {components.refit-card}: 216px wide, 1px outline, {colors.panel} bed (the shipped card paints the panel surface, not the card-scrim dark glass), floating with 20px gaps (no shared panel, no backdrop dim). **THE FACE IS MINIMAL** (Story 7-5 R2.17, Eric ruling 2026-08-19 — epic-7 amendment 26). Anatomy top-down: key chip (22×22 outlined square, overhanging top-left); a meta row of category tag (mono 14px {colors.text-secondary} — it drives the 1–4 pick) + rarity tag (11px, absent on a plain common — the absence IS the tier); ladder name (20px); lineage handrail for a multi-copy line (`II/V`, 12px); and **one** text row — a stat card's live `current → next` sentence (15px), empty for a verb or acquisition card, whose face is the ladder name and the tags alone. **The explanation is HOVER-ONLY**, in the band's own tooltip panel — the Tab/1–4/5 shortcut exists to *skip* the reading, so the explanation must not be put in front of a player who did not ask for it. The lineage numeral rides the **loot-tier colour ramp** — I {colors.phosphor} · II {colors.info} · III {colors.storm-readout} · IV {colors.denied} · V {colors.amber} (green → blue → purple → red → gold, Eric's ruling; the five rungs ARE the ratified palette, nothing new was minted) — **absolute, not normalised**, so rung II is blue on a 2-copy line and on a 5-copy one, and a short ladder simply never reaches gold. Armed (hover/pending): amber outline + glow, key/category/name flip amber, arm-hint line appears. Queue pips in the header (8px squares: filled = on-screen offer, hollow = queued) + dashed ghost edge behind the row = next offer queued. **Placement:** the 4-card row anchors in the **below-center band** at `bandTopFrac` 0.534 of viewport height. Its rationale is no longer the listening ring's lower extent (that component was deferred and never built) but two arithmetic constraints that box the band on both sides at the 1280×614 logical floor: the **below-center keep-out** (own hull at screen centre stays clear — `row.y − pipsAbove > H/2`) and the **container-fit law** (`row.y + cardHeight + stripGap + stripHeight ≤ H`), which between them leave seven pixels of slack. Cards never wrap to a grid — the 1–4 keys map spatially. The **DAMAGE CONTROL rail** hangs one 6px seam below the row (its own row below). |
| **DAMAGE CONTROL Rail** | {components.damage-control-rail}: the always-present heal spend, a **sibling of the refit card row rather than a member of it** — never drawn, never exhausted, never in an offer, addressed by its own reserved sentinel (`HEAL_CHOICE`) and keyed **5**. One full-width rail hanging a 6px seam under the row, in the card's own grammar: square corners, 1px hairline edge, {colors.panel} bed, amber-on-armed, the same 80ms denied edge pulse. Columns left→right: 22px key chip (the ONE mono key-chip family, at family size — the "proportional below" carve-out is retired, a 40px rail has the room a 16px one did not), label `DAMAGE CONTROL`, the amounts readout in {colors.phosphor}, and the reason word hard right. **The amounts are composed from CONFIG, never hardcoded**, so a balance retune moves the rail's own copy with it. **Two states, dual-coded so nothing rides on hue:** *armed* — a damaged living hull: live edge, hoverable/focusable, no status word; *inert* — the server would refuse the pick (`AT FULL HP`, `SUNK`) or a spend is already in flight: the rail dims to the locked alpha, goes genuinely `disabled` (keyboard and AT see it, not just the eye), and for the two REFUSAL cases prints the reason as a **word** — the word is the non-colour channel, since the dim alone would be lightness only. A rail the player can press is a rail the server will honor. |
| **Slot Tooltip** | {components.slot-tooltip}: 236px, `rgba(10,15,12,.97)` panel, 1px silver `.4` border, pointer notch. Anatomy: name (mono 11px caps), interaction class (mono 9px amber caps), description, "BOONS ACCRUED" divider, boon list (`◆ Name` phosphor + effect line, qualitative Hades-style). |
| **HP Rail** | Own HP as a **vertical rail climbing the right side of the own-vitals cluster**, mirroring the XP rail — CONFIRMED by Eric on the v2 composite (2026-07-16; [hud-composite-2.html](./mockups/hud-composite-2.html)). Fill {colors.phosphor} ≥50% → {colors.amber} <50% → {colors.damage-marker} <25%. Pulse rate accelerates as HP drops **from ~0.5 Hz below 50% to a hard cap of 1.1 Hz at ≤10%** — the same ratified exception ceiling as the storm vignette; opacity-breathing, never on/off strobing. (The cap resolves the acceleration-vs-photosensitivity contradiction: acceleration encodes urgency, the ceiling holds.) `HULL 72/100` mono header. |
| **Nameplate** | {components.nameplate}: callsign in {typography.hud-micro} register, uppercase, floated above the hull; personal color as its **lightened text-safe variant** (≥4.5:1 via the algorithmic `textSafe()` — no variant table exists or is wanted, see Contrast above); drones tag "DRONE" in {colors.drone-outline}. **Scope: ALL hulls** (resolved 2026-07-16) — every truesight combatant hull in play, and every revealed ship during the omniscient reveal. Nameplates never appear on blips or radar paints; they fade in/out with truesight resolution (or the reveal). Callsign cap (14 chars, entry-enforced — ratified 2026-07-23, Story 1.13) keeps plates tight. |
| **Aggro Bracket** | {components.aggro-bracket}: angular bracket (four L-shaped corner ticks) framing a PvE fleet chevron that has acquired **you** — self-private, fleet hulls only (Story 5.6, Eric ruling 2026-08-14, amendment 39: *"very visually obvious it has aggro'd you... and very visually obvious if it de-aggro's you"*). Dual-coded by **shape alone** (bracket present/absent) — `DESIGN.md:162` puts threat/state on the dual-coding floor and drones are locked greyscale, so color can't carry this; rendered in {colors.amber} (the existing armed/warning register — no new color token invented). **On acquire:** snaps on + one amber flash (`.2` wash, full outline, bloom, **300ms** — deliberately NOT the Hotbar Slot's ≤80ms Activated-flash grammar: that's grammar for a UI element you're already looking at, while this marks a world-space hull that can be anywhere in the sight bubble, including its edge, and must survive peripheral vision) + an audio sting. **While held:** static outline — deliberately not animated (a pulse would need Story 4.8 attention-tier arbitration and spend photosensitivity budget, the same argument that keeps the kill-leader glow static). **On release (3s LOS-loss memory expires):** the bracket visibly breaks at its four corners and fades over ~400ms + a distinct, softer descending cue. At `motionIntensity: off`, the flash and fade are skipped — snap on / snap off, no information lost. |
| **Telegraph Cluster** | Bottom-right group: HDG/KTS readouts (mono 22px, unit suffixes muted), rudder track (110px, silver hairline, amber position tick), 9-detent telegraph ladder (FULL…STOP…FULL rungs, phosphor ordered-rung marker, amber actual-speed needle, AHEAD/ASTERN captions mono 9px). Ordered vs actual is shape-coded: **marker = hollow rung outline, needle = solid pointer** — never color alone. W/S key glyphs sit at the ladder ends and A/D at the rudder track extremes, visible in the weapons-safe room and fading permanently after the first few successful inputs (component anatomy, not a coach mark). Restyled to Afterimage linework — no panel. |
| **BR Chrome Bar** | One restrained mono row, top-center: `12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES 0:47 · ☠︎ NAME`. Numbers phosphor, labels muted. Ring readout pulses {colors.amber} at **1 Hz** in the final 10s. The kill-leader segment (Story 4.6, Eric ruling 2026-08-10, reworded same-day) is OPTIONAL — omitted whole, separator included, while the throne is vacant — and is the first segment to carry a PER-PLAYER HUE rather than phosphor/muted/amber; the skull mark (`☠︎`, U+2620+U+FE0E) rides the name segment itself rather than a separate label (the originally-shipped `BOUNTY: ` label is retired). |
| **Kill Feed** | Top-right, right-aligned, mono 14px uppercase, **max 6 lines / 8s TTL** (`client/src/ui/killFeed.ts:23-24` — widened from 5/6s when the feed became GLOBAL at PV 23: every captain's sinking reaches every client, and more traffic needs the headroom). Vessel names 600-weight in their personal colors' **lightened text-safe variants** (no raw hue fails 4.5:1 since the cycle-125 regeneration, so the lift is currently inert for all twenty — but the algorithmic `textSafe()` is kept as the guarantee; there is no variant table, see Contrast above); connective text ("SUNK BY") {colors.text-secondary}; drone names {colors.drone-outline}. Callsigns cap at 14 chars at entry (ratified 2026-07-23, Story 1.13); longer legacy names mid-ellipsize in the feed. If playtests confirm feed-vs-blip confusion in the NE quadrant, the per-line dark-glass scrim ({colors.card-scrim}) is the sanctioned fallback. **Kill leader mark** (Story 4.6, Eric ruling 2026-08-10): a skull (`☠︎`, U+2620+U+FE0E) rides the kill leader's name segment wherever it appears — as killer or victim — inheriting that segment's text-safe hue and 600 weight; the leader's name additionally carries a STATIC (never breathing/pulsing) `text-shadow` at 10px/.4 alpha in its own hue, per Eric's "highlight the kill leader's name somehow, like it glows faintly" — radius and alpha sourced from the Hotbar Slot's Ready-Weapon glow row above (phosphor `.4` outline + 10px glow), not invented fresh. A drone name never carries the mark or the glow. |
| **Foghorn Chevron** | {components.foghorn-chevron}: the shipped bearing surface (Story 4.5), and the replacement the Listening Ring's deferral obliged this system to grow. A `>` chevron pinned 54px in from the viewport edge and rotated to point down the bearing of a honk, stroked in {colors.phosphor} — a honk is a chart-register fact, so the mark carries **no identity of any kind**: no position, no id, no hue, no correlation handle. **Weight encodes VOLUME BAND** — which eighth of the *listener's own* intel range the honker sits in (1 innermost … 8 the radar rim), resolved server-side and never re-derived here. Size, stroke and alpha move **together** so the band survives a colorblind read: bands 1–4 all carry 22px / 3px / .95 (flat through truesight, exactly as the audio gain is), stepping linearly to 13px / 1.8px / .5 at band 8. Fades over ~1.2s against **server** time (never accumulated dt — a backgrounded tab keeps receiving honks while the render loop is throttled); at most 8 live marks, oldest dropped — per-source capping is impossible by construction, the wire carrying no handle to group by. The honker's own honk gets an own-hull bloom instead: a bearing to yourself is meaningless. **Motion-blind by rule (UX-DR36):** presence, direction and band weight all survive `motionIntensity: off` — the 140ms pop-in scale is the only motion-scaled knob, and the TTL fade is not "motion" but how long the fact stays true. |
| ~~**Listening Ring**~~ | **DEFERRED, never built** — recorded here because three parts of this document were written against it (a frontmatter token, the Elevation & Depth z-order clause, and the Refit Card's placement rationale) and all three have been re-grounded on shipped surfaces. `client/src/render/foghorn.ts:1-3` states the deferral; the Foghorn Chevron above is what shipped in its place. ~~Dashed compass rose around own ship (~half truesight radius visually): 48 dash-pips + cardinal ticks, phosphor. Segments light toward noise, brightness ∝ loudness/closeness — pure intensity grammar: more/closer = brighter. Deliberately source-ambiguous (triage 2026-07-16) — it never encodes what a noise is, only where and how loud. Bright pip surges are a Tier 1 threat channel.~~ |
| ~~**Bounty Bloom**~~ | **RETIRED 2026-08-10 (Story 4.6, Eric ruling)** — no radar paint, bloom, ring, bearing, range, or area disclosure of the kill leader ships, ever; the kill leader is presented only via the BR Chrome Bar's kill-leader segment above (the `BOUNTY: ` label itself is retired — the register reads `☠︎ <NAME>`), the kill feed's skull mark, and a self-only `YOU ARE THE KILL LEADER` toast/tone. ~~Radar-layer event (GDD E6 #47): the kill leader periodically blooms on every player's radar — an expanding ring in the leader's personal color (1px→3px, ~2s decay [PROPOSAL]) around their class blip at true position. The only radar paint not born of your own sweep — a sanctioned fog exception, visually distinct from sweep paints by the expanding-ring treatment.~~ |
| **Torpedo (on-water)** | Promoted from the composite mock per validation: {colors.torpedo} hull dash + wake astern; **materialization** = pale boundary rings at the sighting point as the torpedo enters visible range — the treatment that makes pips→sight read as one continuous event. Mines render in the owner's personal hue at truesight (Regatta propagation — Eric ruling 2026-07-23, Story 1.12). |
| **Combat Effects** | Miss splash: {colors.splash} expanding ring (the retired `#66FFAA` double-duty is documented in Colors). Muzzle flash: {colors.muzzle}. Hit Call bloom: {colors.hit-bloom} (amber-band feedback — the band reservation binds combatant hues, not HUD feedback). Sink ring: {colors.damage-marker} expanding crimson. Wounded smoke: {colors.wounded-smoke} — warmed/darkened a step off drone grey per validation so smoke never reads as a drone cluster. All hue picks [PROPOSAL]. |
| **Class Card** | {components.class-card}: 356px, `panel-deep`, 10px radius, hairline border. Anatomy: class name (21px/700) + key, silhouette box (158px, hull at identity-board geometry), 3 pip scales (SPEED/ARMOR/TURNING — real values on absolute anchors, Eric ruling 2026-07-24; the middle row was TOUGHNESS until Eric ruled it ARMOR on 2026-08-21 because the longer word overflowed the fixed 88px label column — a copy change only, the hp anchor ladder is untouched), two special-slot rows keyed Q/E, pick button. No fantasy line, no GUN row (Eric ruling 2026-07-24, post-1.14 — do not resurrect from the mock). Selected: personal-color border + glow, name/pips tinted. Unselected silhouettes stay {colors.silver} linework. Ghost card (dashed, "MORE CLASSES IN DEVELOPMENT") clipped at rail edge = scale-past-4 promise. |
| **Class Chip** | Home-at-rest compact chip: silhouette at 44px + role tag (mono 10px muted) + class name (21px/700 in personal color) + sub-line + "CHANGE" affordance; personal-color border + soft glow. Opens the class layer. |
| **Color Hoist** | Row of 20px round swatches (the 20 Regatta hues), displayed in ascending HUE ANGLE so the row reads as a wheel (Eric ruling 2026-08-21; a presentation order derived from the hex values at render time — the wheel INDEX is identity and its array order is unchanged); selected swatch ringed. **It lives in the class-bay footer only** — the duplicate home picker is retired — beside a `COLOR PREFERENCE:` register label to its left. The caption `PREFERENCE PICK — YOU GET IT UNLESS CLAIMED, THEN NEAREST FREE HUE.` is **retired** (its absence is pinned in `client/src/__tests__/classSelect.test.ts:353-354` and `home.test.ts:485`); the label carries the meaning instead. Must not imply claiming/locking. |
| **Primary Button** | Amber outline + glow register ("SET SAIL", post-death "RETURN TO PORT"): never a filled slab; mono uppercase letter-spaced label, sub-line for context ("DEPLOY AS TORPEDO BOAT · SOLO"). |
| **Phase / Status Text** | Countdown ("MATCH STARTING" + big center count) and phase tags ("WEAPONS SAFE", "AWAITING CAPTAINS n/2"): {typography.data} uppercase, {colors.phosphor}, center count at display scale. Home status line + callsign field: as rendered in [home-class-picker-1.html](./mockups/home-class-picker-1.html) — {typography.label} register; status reports {colors.info} while waiting/connecting, {colors.denied} on failure. |
| **Modal** | Port-chrome surface: {colors.panel} bed, hairline border, {rounded.lg}. Results modal banner colors: **three** outcomes, not two — victory {colors.phosphor} · defeat {colors.amber} · **draw {colors.info}** (Story 6.3, epic-6 amendment 14: a two-way split cannot render three outcomes, so the hue comes from `BANNER_HUES` keyed by `bannerOutcome()`; victory and defeat are byte-identical to Story 5.3). Fullscreen dim behind results — and it is `rgba(2,6,4,.62)`, not an opaque curtain, because the omniscient reveal is the **backdrop** the modal opens over (Story 5.3). |
| **Toast** | Top-center transient, phosphor mono 16px, 3s TTL, max 3 stacked; CSS fade. Glyph prefix (▲/⬆). |
| **Results Ad Unit** | {components.results-ad}: the one display advertising surface in the game (Story 7-4, epic-7 amendment 18 — Eric: *"I would like some normal display ad space on the results screen… I don't want it in the results modal. but off to the side"*). A 300px responsive AdSense slot in a {colors.panel} bed with a 1px {colors.hairline} border and 12px padding, sitting **beside** the results modal on the RIGHT at a 24px gap, z 1010 — above the results overlay's 1000, below settings 1050 and the pre-join home 1100, so it reads over the modal's dim and never over a surface that has taken the screen. It exists **only while the score screen is up**: it goes away on SPECTATE and comes back on ESC. **Nothing is drawn until Google reports the slot filled** — no empty box, no bed, no reserved hole — so a blocked or unfilled client sees literally nothing, which is what keeps "the game is fully playable with ads blocked" visually as well as functionally true. **The panel and the unit centre AS ONE GROUP** (panel + 24px gap + column, ≥1002px viewport), and the panel's −175px shift happens **only when the ad has actually filled**: an off-centre score screen beside empty space is worse than either. Below the breakpoint, or with the build-time slot id absent, the unit does not exist and the panel is dead centre as it has always been. |
| **Privacy & Consent** | Three surfaces, and the consent DIALOG is not one of ours: since Story 7.4 **Google's own certified CMP owns the EEA/UK/CH consent dialog** (covering ads and analytics together), the self-built consent card is deleted and its whole geometry block went with it — the z-1250 rung is retired from the ladder and nothing may claim it without a fresh cut of the register. What this design system owns is (1) the port's **PRIVACY link** in the home underplay block, a real crawlable `<a>` to `/privacy` (it must be an anchor, not a click handler — AdSense site review crawls it) rendered in the {typography.label} register; (2) the `/privacy` **policy page** itself, on the standard DOM port-chrome surface; and (3) a **PRIVACY › ANALYTICS toggle row** in the settings overlay, in the overlay's ordinary section/toggle grammar — the local analytics override, which has no authority over the three ad signals. That row reads **ON for a player who has never answered**, which is the literal truth of the shipped ADVANCED-mode default and would be a lie if it read OFF. |

## Do's and Don'ts

- **Do** judge every HUD addition against the guardrail: *information noise must never bury the hunt.* When deduction stops paying, fix it on the sensing side.
- **Do** keep all HUD chrome phosphor-functional; personal color rides only hulls, nameplates, ownership accents, and kill-feed names — **never a radar return**, which is a strength measurement and carries no identity (Eric ruling 2026-08-21; see Regatta Hoist › *Two sensor tiers*).
- **Don't** let anything read cheap: no filled panels behind tactical elements, no default-looking buttons. Floating 1px outlines; the water shows through.
- **Don't** use color alone to carry **class, threat, or state** meaning — dual-code (shape/position/text/audio). The ability chamfer, class silhouettes, drone chevron, and pip geometry exist for this. One informed waiver (triage 2026-07-16): individual combatant *identity* is color-first by accepted trade.
- **Don't** use purple **on the water** for anything but the storm — the binding requirement is ring-edge legibility (epic-3 amendment 1: *"purple exclusivity is dead; what matters is that players can easily see the edge of the ring against everything else on the water"*, superseding Story 3.2's "purple appears nowhere else in the game" clause). **Two ratified carve-outs, both in port/modal chrome rather than on the ocean:** the refit card's `storm-readout` rung III of the loot-tier lineage ramp, and — before Story 7-5 made the tier extinct — the EXCLUSIVE rarity register that first opened the exception (epic-2 amendment 49, Eric choosing it over the recommended white-hot register with the violation squarely presented). Anything new that wants purple needs the same explicit call.
- **Don't** assign amber or the red family as combatant hues; don't render drones in color. (**Storm violet and the phosphor green band are no longer reserved** — retired by Eric ruling 2026-08-21, gate B1; see Regatta Hoist above for what that costs and why it was taken. `client/src/__tests__/tokens.test.ts` pins the surviving amber/red reserve against the live wheel.)
- **Do** respect photosensitivity restraint: glows breathe (≥2s cycles), they never strobe; denied pulses are 80ms one-shots, rate-limited; no full-screen flashes; the HP pulse caps at 1.1 Hz; no element or screen region flashes >3×/s in aggregate (EXPERIENCE · Accessibility Floor).
- **Do** honor the attention-priority tiers (EXPERIENCE · State Patterns): while a threat channel is active, economy animations freeze at their dim keyframe; only the highest-tier active amber channel pulses — the rest hold steady.
- **Do** use desaturated crimson for damage; never saturated red vibrating on black.
- **Don't** ship two reds: `#FF3B30` (DOM) consolidates into {colors.denied}.
- **Do** render every key glyph (slots, cards, helm gauges) in the same mono key-chip family.
- **Don't** re-derive stats or restate tokens ad hoc — mono `tabular-nums` for every number; sizes from the ramp; spacing from the scale.
- **Do** keep silhouette geometry consistent everywhere a hull appears (water, blip, class card, results) — it's the identity system *and* the hitbox.
