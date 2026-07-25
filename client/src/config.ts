// Client-only tunables. These are render/feel constants that never travel on
// the wire and are not part of the shared simulation CONFIG (that stays the
// single source of truth for anything gameplay-authoritative). If a value here
// starts to feel gameplay-load-bearing, promote it to shared CONFIG instead.

import { CONFIG } from '@salvo/shared';

/**
 * Design tokens (Story 1.11) — the single styling source. Colors are authored as
 * numeric `0xRRGGBB` (the Pixi-native form; alpha variants compose via
 * util/color.ts's cssRgba, never a raw literal). Names + values are copied
 * VERBATIM from DESIGN.md frontmatter (ux-Hullcracker.io-2026-07-16/DESIGN.md);
 * kebab-case there → camelCase here. ui/theme.ts projects these into `--hc-*` CSS
 * custom properties for DOM chrome; Pixi render modules read them directly.
 *
 * The `legacy` subgroup holds byte-identical carry-overs for renders a later
 * story owns (own/enemy hulls → 1.12 Regatta; projectile secondary tones): they
 * are NOT ratified roles, kept only so no color literal escapes the token source.
 */
const COLORS = {
  // surfaces (locked mocks; supersede the deprecated v0.16 surface family)
  void: 0x050807,
  fogBase: 0x020604,
  panel: 0x0a0f0d,
  panelDeep: 0x070b0a,
  cardScrim: 0x030605, // rendered as rgba(3,6,5,.9) dark glass
  hairline: 0x1b2621,
  // linework & text
  silver: 0xc0c0c0,
  textPrimary: 0xe2e8f0,
  textSecondary: 0x8b95a5,
  textMuted: 0x7a8496, // lightened from the v0.16 slate per validation (≈4.5:1 on void)
  // functional (HUD chrome)
  phosphor: 0x00ff88,
  phosphorBright: 0x7fffc4,
  blipFresh: 0x66ffaa,
  blipFaded: 0x0a3d20,
  amber: 0xffb800,
  storm: 0x7b2fbe,
  stormReadout: 0xb06ee8,
  info: 0x38bdf8,
  danger: 0x8b2020,
  denied: 0xff3b3b, // the single denied red (consolidates the legacy DOM red)
  damage: 0x8b0000,
  damageMarker: 0xff6666,
  islandFill: 0x2a2410,
  islandStroke: 0x8b7520,
  // combat effects
  splash: 0xb8ccc6, // miss splash — replaces retired #66FFAA double-duty
  muzzle: 0xe8f2ec,
  torpedo: 0xcfe8dd, // torpedo on-water render
  hitBloom: 0xff9d3d,
  woundedSmoke: 0x7a7168,
  // drones (PvE — always greyscale)
  droneOutline: 0x9aa3b2,
  droneFill: 0x454950,
  // utility — technical, non-role uses only (stage clear color, Pixi tint reset,
  // fog inverse mask). Never a design surface/text color.
  black: 0x000000,
  white: 0xffffff,
  // Regatta Hoist personal combatant colors (20 hues; bright OUTLINE values —
  // the hull stroke, wake, ordnance-marker tint, and kill-feed name source).
  // Key order = the ratified wheel order (shared REGATTA_HUES): index i → this
  // table's i-th entry. VERBATIM from DESIGN.md frontmatter.
  players: {
    lemon: 0xfff04d,
    chartreuse: 0xc8e619,
    olive: 0x7a9b0f,
    lime: 0x7fe03a,
    green: 0x23b123,
    spring: 0x37f2d8,
    jade: 0x0b9e8f,
    aqua: 0x40e4ee,
    cyan: 0x00d0ff,
    lagoon: 0x0e7fa0,
    sky: 0x6fc7ff,
    azure: 0x0f6fd6,
    cobalt: 0x5468ff,
    periwinkle: 0x96a6ff,
    iris: 0xa66bff,
    orchid: 0xc026d3,
    fuchsia: 0xe14dff,
    magenta: 0xff4fd8,
    mulberry: 0xb01772,
    rose: 0xff85b3,
  },
  // Regatta Hoist interior FILL values (20 hues; ~45%-value darker shade of the
  // outline — the SOLID hull interior). SAME key order as `players`. Two origins:
  //   • 12 DESIGN.md-documented pairs — used VERBATIM, never recomputed (they sit
  //     at ~0.451 value, not a naive 0.45, so recomputing would drift):
  //     lemon/lime/spring/aqua/cyan/azure/cobalt/iris/orchid/fuchsia/magenta/rose.
  //   • 8 RULE-DERIVED literals (chartreuse/olive/green/jade/lagoon/sky/
  //     periwinkle/mulberry) — no documented hex exists, so each is the outline at
  //     HSV value ×0.45 (hue/saturation preserved). Scaling the gamma-encoded sRGB
  //     channels uniformly IS exactly an HSV V-scale (V = max channel; scaling all
  //     channels by k scales V by k and leaves H/S untouched) — Math.round(channel
  //     × 0.45) per channel. NOTE: this operates on the stored sRGB bytes, NOT
  //     linear-light values. Authored as literals here; tokens.test.ts recomputes
  //     them from that rule to catch a typo.
  playerFills: {
    lemon: 0x736c23, // DESIGN
    chartreuse: 0x5a680b, // rule-derived (0xc8e619 ×0.45)
    olive: 0x374607, // rule-derived (0x7a9b0f ×0.45)
    lime: 0x39651a, // DESIGN
    green: 0x105010, // rule-derived (0x23b123 ×0.45)
    spring: 0x196d61, // DESIGN
    jade: 0x054740, // rule-derived (0x0b9e8f ×0.45)
    aqua: 0x1d676b, // DESIGN
    cyan: 0x005e73, // DESIGN
    lagoon: 0x063948, // rule-derived (0x0e7fa0 ×0.45)
    sky: 0x325a73, // rule-derived (0x6fc7ff ×0.45)
    azure: 0x073261, // DESIGN
    cobalt: 0x262f73, // DESIGN
    periwinkle: 0x444b73, // rule-derived (0x96a6ff ×0.45)
    iris: 0x4b3073, // DESIGN
    orchid: 0x56115f, // DESIGN
    fuchsia: 0x652373, // DESIGN
    magenta: 0x732461, // DESIGN
    mulberry: 0x4f0a33, // rule-derived (0xb01772 ×0.45)
    rose: 0x733c51, // DESIGN
  },
  // legacy carry-overs — byte-identical to pre-1.11 literals, owned by a later
  // story (deleted when that story lands its real color). NOT ratified roles.
  // (ownHull/enemyHull/ownAssetGreen retired by Story 1.12 — hulls, wake, and
  // ordnance markers now read personal hues / fallbacks, not these.)
  legacy: {
    shellCore: 0xffe08a, // gun-shell dead-reckon core (projectile secondary tone)
    torpGlow: 0x3fbf8f, // torpedo glow + bow-arc tint (projectile secondary tone)
    torpWake: 0x9fd8c4, // torpedo wake bubble (projectile secondary tone)
  },
} as const;

/**
 * Typography tokens (DESIGN.md · Typography). The fallback stacks are the single
 * source both Pixi TextStyles and DOM chrome consume: display/body → Geist,
 * mono → Geist Mono. Google Fonts loads the ratified weights (index.html); the
 * stacks graceful-degrade to system faces if the CDN is unreachable.
 *
 * `displayFamily`/`monoFamily` are the concrete primary faces (no fallback
 * stack) — the head of each stack above AND what `FontFaceSet.load` needs in
 * render/stage.ts (it wants a single family, not a comma stack).
 *
 * `registers` is the DESIGN.md type ramp AS DATA (the documented Role → Face /
 * Size / Weight / tracking table). ui/theme.ts's `registerCss(name)` projects a
 * register into a cssText `font:` fragment so DOM chrome consumes the ramp
 * instead of hand-writing the same numbers. `family` names the stack token
 * ('display' | 'mono'); size/weight are px/CSS numeric; `tracking` is em
 * letter-spacing; `upper` maps to text-transform:uppercase; `tabular` flags the
 * `data` readout register (tabular-nums, size varies by context).
 */
const TYPE = {
  display: 'Geist, system-ui, sans-serif',
  mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  displayFamily: 'Geist',
  monoFamily: 'Geist Mono',
  registers: {
    hero: { family: 'display', size: 56, weight: 700 },
    h1: { family: 'display', size: 36, weight: 700 },
    h2: { family: 'display', size: 20, weight: 600 },
    body: { family: 'display', size: 16, weight: 400 },
    small: { family: 'display', size: 14, weight: 400 },
    caption: { family: 'display', size: 12, weight: 400 },
    label: { family: 'mono', size: 11, weight: 500, tracking: '0.1em', upper: true },
    hudReadout: { family: 'mono', size: 22 },
    hudMicro: { family: 'mono', size: 9, tracking: '0.18em', upper: true },
    data: { family: 'mono', tabular: true },
  },
} as const;

export const CLIENT_CONFIG = {
  /** Design tokens (Story 1.11) — the single styling source (see above). */
  colors: COLORS,
  type: TYPE,

  /** Camera follow + look-ahead lead (the "does it feel like a ship" knobs). */
  camera: {
    /** Exponential follow rate (1/s). Larger = camera catches the ship faster. */
    followRate: 5,
    /**
     * Look-ahead time (s). Lead distance = |speed| * leadSeconds, capped at
     * leadMax. At maxSpeed 25 u/s this reaches ~112.5u, past the leadMax cap
     * (110u @ sight 220) — the cap engages near top speed (step 11 feel-pass
     * tuning, up from 4s; flagged for playtest).
     */
    leadSeconds: 4.5,
    /** Lead distance cap (u) = 0.5 * sight range, per the plan. */
    leadMax: CONFIG.vision.sight * 0.5,
  },

  /** Wake trail — continuous speed feedback behind the hull. */
  wake: {
    /** Don't spawn wake below this speed magnitude (u/s). */
    minSpeed: 1.5,
    /** Spawn one dot per this many world-units travelled (spatial density).
     *  Step 11 feel-pass tuning: 6 -> 4 for a richer trail; flagged for playtest. */
    spacing: 4,
    /** Particle lifetime (s). */
    life: 1.1,
    /** Base radius of a wake dot (u). */
    radius: 2.6,
    /** Peak alpha at spawn (scaled by speed fraction). */
    alpha: 0.28,
    // Wake color is DYNAMIC as of Story 1.12 — it trails the own hull, so it
    // carries the OWN personal hue (Effects.setWakeColor, driven by the own roster
    // color); no static token here. Amber is the pre-roster fallback (in effects.ts).
  },

  /** Own/contact ship view feel constants. */
  ship: {
    flashMs: 130, // ms — hit-flash duration
    sunkTint: COLORS.damage, // DESIGN.md dark crimson tint for a sunk hull
  },

  /** Truesight nameplates (Story 1.13) — screen-space callsign labels floated
   *  above each hull (render/nameplates.ts). The text renders at a constant
   *  screen size (hud-micro 9px) at any zoom; only this gap scales with zoom. */
  nameplate: {
    /** Gap (screen px) between the hull's projected bounding circle and the
     *  plate's bottom edge. ~mid of the 6–10px range floated the plate clear of
     *  the largest hull's bow arc without drifting off it at spectate zoom. */
    padPx: 8,
  },

  /** Pre-join home chrome + class-select (Story 1.14). Two groups: absolute pip
   *  scale anchors (gameplay-adjacent DISPLAY knobs — they map a raw stat to a
   *  1..5 filled-pip count, they do NOT change the sim) and the ambient CIC scene
   *  feel knobs (render/ambient.ts). Colors are NOT here — the scene reads
   *  CLIENT_CONFIG.colors tokens (void/phosphorBright/silver/island*). */
  home: {
    /** Pip scale anchors (Eric ruling 2026-07-24) — ABSOLUTE maxima against which
     *  a class stat resolves to a filled-pip count via util/pips.ts's pipFill:
     *  round(value / anchorMax * 5), clamped 1..5. Fixed anchors (not per-batch
     *  relative) so a hull's pips never shift when the class roster changes. */
    pip: {
      speedMax: 60, // u/s — top of the speed pip scale
      hpMax: 200, // hull hp — top of the toughness pip scale
      turnMax: 1.0, // rad/s — top of the turning pip scale
    },

    /** Ambient pre-join CIC scene (render/ambient.ts) — the game "breathing"
     *  behind the DOM menu (UX-DR25). Ring/island/scrim geometry is lifted from
     *  the ratified mock's `.cic` CSS (home-class-picker-1.html); the RADAR
     *  behavior is the game's own (Eric ruling 2026-07-24): the in-game sweep
     *  texture rotating at the base CONFIG.vision.sweepRpm, and blips that light only
     *  when the beam crosses them, then decay via render/phosphor's blipAlpha/
     *  blipTint — no independent timers. Client render MAY place contacts/
     *  islands with Math.random — the seeded-RNG law binds sim code only.
     *  Photosensitivity: everything here is slow/continuous. */
    ambient: {
      /** Master scene dimmer — root-container alpha over the whole picture
       *  (Eric 2026-07-24: the idle radar reads at half strength on the menu). */
      sceneAlpha: 0.5,
      /** Scene center as a fraction of viewport height (mock: `top:54%`). */
      centerYFrac: 0.54,
      /** Reference viewport height the ring radii were authored against (mock
       *  frame is 1080 tall); the scene scales by screenH/this so it fills any
       *  viewport (see render/ambient.ts `ambientScale`). */
      refHeight: 1080,
      /** Range-ring radii (px @ the reference height). Innermost is the phosphor
       *  hairline, the rest silver — mock radial-gradient stops 130/290/460/640/
       *  830 on the 850px-radius (1700px) ring disc. */
      ringRadii: [130, 290, 460, 640, 830],
      /** Per-ring stroke alpha (mock: .10 phosphor inner, then .07/.06/.05/.045
       *  silver outers). Same length/order as ringRadii. */
      ringAlphas: [0.5, 0.32, 0.26, 0.22, 0.18],
      /** Ring hairline stroke width (px). */
      ringWidth: 1.5,
      /** Sweep sprite alpha — the wedge is the in-game baked texture
       *  (render/textures.bakeSweepTexture) rotating at the game's real
       *  base rate (CONFIG.vision.sweepRpm); this only blends it against the scrim. */
      sweepAlpha: 0.9,
      /** Fake drifting contacts the idle radar paints (blips light ONLY on a
       *  beam crossing, then phosphor-decay over exactly one sweep period). */
      contactCount: 5,
      /** Contact drift speed, in fractions of min(viewport) per second. */
      contactDriftFrac: 0.012,
      /** Painted blip diameter (px) — the in-game blip sprite (bakeBlipTexture)
       *  scaled to roughly its in-game on-screen size (BLIP_DIAMETER_U at ~1×). */
      blipDiameterPx: 16,
      /** Faint island masses scattered in the picture (count + fill/stroke alpha,
       *  mock: fill .5, stroke .34). Radii range in px @ reference height. */
      islandCount: 3,
      islandFillAlpha: 0.7,
      islandStrokeAlpha: 0.55,
      islandMinR: 40,
      islandMaxR: 95,
      /** Radial legibility scrim over the scene (mock `.scrim`: void at .42 in the
       *  center → .78 mid → .94 at the edge, so DOM text stays readable). */
      /** Scrim gradient center as a fraction of viewport height. Genuinely
       *  distinct from the ring center (centerYFrac 0.54): the mock's `.scrim` is
       *  a radial-gradient authored `at 50% 46%`, higher than the ring stack. */
      scrimCenterYFrac: 0.46,
      scrimInnerAlpha: 0.18,
      scrimMidAlpha: 0.38,
      scrimOuterAlpha: 0.6,
    },
  },

  /** Alive camera user-zoom (Story 2.1, Eric ruling 2026-07-24): a render-only
   *  multiplier over the base radar-fit framing — X steps in, Z steps out, the
   *  wheel zooms smoothly. Client-only by design: fog stays server-
   *  authoritative, so zoom is never an information exploit. The spectate zoom
   *  path (render/spectate.ts, 0.5–1.0 wheel-only) is separate and unchanged. */
  zoom: {
    /** Minimum user factor (zoomed fully OUT — 0.5× the base framing). */
    min: 0.5,
    /** Maximum user factor (zoomed fully IN — 1.5× the base framing). */
    max: 1.5,
    /** Factor step per X/Z keydown (auto-repeat allowed — hold to zoom). */
    keyStep: 0.1,
    /** Factor per wheel deltaY unit (matches spectate's 0.0008 feel). */
    wheelRate: 0.0008,
  },

  /** End-of-match results overlay feel. */
  results: {
    /**
     * ms — arming grace before results-phase ESC/Enter drive RETURN TO PORT.
     * The refit modal can be open the instant results land; an ESC/Enter the
     * player aimed at THAT modal would otherwise land on the freshly-shown
     * results screen and instantly tear the match down before they read it.
     * The button click path has no grace (a click can't be aimed at a modal
     * that is already gone).
     */
    keyGraceMs: 400,
  },

  /**
   * The bottom-left hotbar (Story 2.2) — geometry + behavior knobs for the four
   * slot rows (Gun / Q / E / R, top-to-bottom). Values come from the ratified
   * register: DESIGN.md Components · Hotbar Slot / Ammo Badge / Slot Tooltip and
   * the hud-composite-2 mock's `.hb-*` rules (54px slot, 16px key chip, 12px
   * gaps, 14px stack gap, zone at left 44 / bottom 26). Colors are NOT here —
   * every stroke/fill reads a CLIENT_CONFIG.colors token.
   */
  hotbar: {
    /** Slot square (px) — {components.hotbar-slot}.size. */
    slot: 54,
    /** Vertical gap between slot rows (mock `.hb-stack` gap). */
    gap: 14,
    /** Zone anchor: px from the viewport's left edge to the KEY CHIP column. */
    left: 44,
    /** Zone anchor: px from the viewport's bottom edge to the stack's foot. */
    bottom: 26,
    /** Dead space reserved to the LEFT of the stack for Story 2.6's XP rail /
     *  banked-level chip (mock `.xp-rail { left: -16px }`). Nothing is drawn in
     *  it this story — it only keeps the zone anchor honest. */
    gutter: 16,
    /** Mono key-chip square (px) — one family with the refit digits / helm keys. */
    keyChip: 16,
    /** Gap between key chip and slot, and between slot and the label column. */
    keyGap: 12,
    labelGap: 12,
    /** Label column width (px) — the name / quick-info block. It is part of the
     *  ROW's clickable footprint (amendment 11: the whole row is the control),
     *  so this is a hit-region knob, not just a text budget. */
    labelWidth: 168,
    /** Top-right chamfer cut (px) — the ABILITY shape mark (weapons never cut). */
    chamfer: 9,
    /** Conic cooldown perimeter track width (px). */
    trackWidth: 2,
    /** Icon linework box (px), centered in the slot. */
    icon: 28,
    /** Ammo badge square (px) + its top-right overhang (px on both axes). */
    badge: 16,
    badgeOverhang: 7,
    /** Alpha the whole hotbar (tooltip included) dims to while the refit modal
     *  is open — slot keys AND slot clicks are suspended in that window. */
    dimAlpha: 0.38,
    /** Slot tooltip (DESIGN.md Components · Slot Tooltip). */
    tooltip: {
      /** Hover dwell (ms) before the panel appears. */
      delayMs: 250,
      /** Panel width (px) — {components.slot-tooltip}.width. */
      width: 236,
      /** Inner padding (px) and gap between the panel and the hovered slot. */
      pad: 12,
      gap: 14,
      /** Pointer-notch half-height (px). */
      notch: 7,
      /** Minimum px between the panel and any viewport edge. */
      margin: 8,
    },
  },

  /** Netcode render delays (ms behind estimated server time). */
  net: {
    /** Remote contacts interpolate this far behind serverNow(). */
    interpDelayMs: CONFIG.tick.interpDelayMs,
    /** Own ship in the interp-checkpoint mode renders at -50ms per the plan. */
    ownDelayMs: 50,
  },
} as const;
