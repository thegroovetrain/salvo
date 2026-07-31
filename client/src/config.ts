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
  // Colorblind-assist families (Story 2.3, amendment 18 — IMPLEMENTER DRAFT,
  // canon later). Eight OUTLINE hues that the 20-hue Regatta wheel collapses onto
  // when the accessibility toggle is on (render/ships.ts is the single remap
  // chokepoint, so nameplates / wake / kill feed follow for free).
  //
  // Selection rule (reproducible, and re-checked by cvd.test.ts):
  //   • every hue avoids the RESERVED bands — denied red (0°), amber (43°),
  //     phosphor (152°) and storm violet (272°), each ±20° — so the assist
  //     palette can never impersonate a functional color;
  //   • every hue clears 4.5:1 against the void, so a hull outline stays legible;
  //   • under a simulated deuteranopia (LMS projection, util/cvd.ts) every PAIR
  //     is separated by CIE-Lab ΔE ≥ 30 — the automated acceptance criterion.
  // Key order IS the family order (family f = wheel index % 8).
  cvd: {
    teal: 0x3f838c,
    citron: 0xe1ff00,
    cobalt: 0x266fff,
    forest: 0x008c05,
    azure: 0x00bbff,
    mint: 0x8cff73,
    ice: 0x73ffff,
    rose: 0xff4d8e,
  },
  // Interior FILLS for the assist families — the SAME HSV value ×0.45 rule the
  // eight rule-derived playerFills use (Math.round(channel × 0.45) per sRGB byte).
  // Same key order as `cvd`; recomputed from that rule by cvd.test.ts.
  cvdFills: {
    teal: 0x1c3b3f,
    citron: 0x657300,
    cobalt: 0x113273,
    forest: 0x003f02,
    azure: 0x005473,
    mint: 0x3f7334,
    ice: 0x347373,
    rose: 0x732340,
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
    // Story 2.3 (amendment 15): the micro registers carry the ratified ~1.6×
    // legibility lift — label 11 → 17, hudMicro 9 → 14. DESIGN.md's 9px
    // `hud-micro` pin is superseded by the amendment (doc-sync is separate).
    label: { family: 'mono', size: 17, weight: 500, tracking: '0.1em', upper: true },
    hudReadout: { family: 'mono', size: 22 },
    hudMicro: { family: 'mono', size: 14, tracking: '0.18em', upper: true },
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
    /** Slot square (px) — {components.hotbar-slot}.size. Grown 54 → 62 by the
     *  Story 2.3 legibility lift so the 20px name + 16px quick-info stack fits
     *  the row without clipping. */
    slot: 62,
    /** Vertical gap between slot rows (mock `.hb-stack` gap). */
    gap: 14,
    /** Name / quick-info baselines, as px below the row's top edge (Story 2.3:
     *  they moved with the lifted type so the two lines never collide). */
    nameTop: 8,
    infoTop: 36,
    /** Zone anchor: px from the viewport's left edge to the KEY CHIP column. */
    left: 44,
    /** Zone anchor: px from the viewport's bottom edge to the stack's foot. */
    bottom: 26,
    /** Dead space reserved to the LEFT of the stack for Story 2.6's XP rail /
     *  banked-level chip (mock `.xp-rail { left: -16px }`). Nothing is drawn in
     *  it this story — it only keeps the zone anchor honest. */
    gutter: 16,
    /** Mono key-chip square (px) — one family with the refit digits / helm keys.
     *  Grown 16 → 22 so the lifted 14px chip glyph fits. */
    keyChip: 22,
    /** Gap between key chip and slot, and between slot and the label column. */
    keyGap: 12,
    labelGap: 12,
    /** Label column width (px) — the name / quick-info block. It is part of the
     *  ROW's clickable footprint (amendment 11: the whole row is the control),
     *  so this is a hit-region knob, not just a text budget. Grown 168 → 268 by
     *  the Story 2.3 legibility lift (20px names / 16px quick-info). */
    labelWidth: 268,
    /** Top-right chamfer cut (px) — the ABILITY shape mark (weapons never cut). */
    chamfer: 9,
    /** Conic cooldown perimeter track width (px). */
    trackWidth: 2,
    /** Icon linework box (px), centered in the slot. */
    icon: 28,
    /** Ammo badge square (px) + its top-right overhang (px on both axes).
     *  Grown 16 → 22 for the lifted 16px badge digit. */
    badge: 22,
    badgeOverhang: 7,
    /** Alpha the whole hotbar (tooltip included) dims to while the refit modal
     *  is open — slot keys AND slot clicks are suspended in that window. */
    dimAlpha: 0.38,
    /** Slot tooltip (DESIGN.md Components · Slot Tooltip). */
    tooltip: {
      /** Hover dwell (ms) before the panel appears. */
      delayMs: 250,
      /** Panel width (px) — {components.slot-tooltip}.width. Grown 236 → 320 for
       *  the Story 2.3 lift (18px description copy). */
      width: 320,
      /** Inner padding (px) and gap between the panel and the hovered slot. */
      pad: 12,
      gap: 14,
      /** Pointer-notch half-height (px). */
      notch: 7,
      /** Minimum px between the panel and any viewport edge. */
      margin: 8,
    },
  },

  /**
   * THE REFIT BAND (Story 2.7) — the four-card offer row (UX-DR14 geometry,
   * TAB semantics per amendment 1). Pure chrome/feel knobs: the gameplay-
   * authoritative card COUNT lives in shared `CONFIG.offer.size` (it bounds the
   * server's accepted choice), and everything here only decides how those cards
   * are drawn. The layout itself is the pure `refitBandLayout()` in
   * ui/upgradeMenu.ts — DOM positions derive from it, and the layout tests
   * measure it (never CSS).
   */
  refit: {
    /** Card width (px) — the ratified 216 (UX-DR14). */
    card: 216,
    /**
     * Card height (px). GROWN 156 → 236 in Story 2.8, knowingly: the card face
     * gained the rarity tag, the lineage handrail, the doctrine-swap line and a
     * rules-text contract that prints live current→next values, and amendment
     * 40 RATIFIES the resulting floor-viewport overlap outright ("cards render
     * above the dimmed chrome and may grow modestly taller. No band lift, no
     * card shrink"). Holds the top-down anatomy: key chip / category + rarity
     * row (14px) / ladder name (20px, up to two lines) / lineage (12px) /
     * replaces (12px) / rules text (17px, up to five lines). The ceiling is the
     * 1280×614 logical floor: bandTopFrac 0.58 leaves 258px before the viewport
     * edge, and the geometry suite pins it.
     */
    cardHeight: 236,
    /** Gap (px) between cards. Four 216s + three 20s = a 924px row that never
     *  wraps at the 1366×768 floor or the 1280×614 logical floor (125% tier). */
    gap: 20,
    /** Card inner padding (px). */
    pad: 14,
    /**
     * Band anchor: the row's TOP edge as a fraction of viewport height. ~58% is
     * the BELOW-CENTER keep-out proxy — the listening ring (UX-DR18) does not
     * exist yet (Epic 4/6), so the honest constraint today is "own hull at
     * screen center stays clear". When the ring ships, this fraction becomes
     * the ring's outer-radius contract and moves with it.
     */
    bandTopFrac: 0.58,
    /** Queue pips: 8px squares, gap, and the pip row's baseline above the cards. */
    pip: 8,
    pipGap: 6,
    pipsAbove: 18,
    /** Key-chip square (px) — ONE family with the hotbar/helm chips (22). It
     *  OVERHANGS the card's top-left corner by half its size. */
    keyChip: 22,
    /** Type sizes (px) — the amendment-15 lift applied to the card anatomy
     *  (the stale 9px category / 11.5px description registers are superseded).
     *  Story 2.8 adds the rarity tag and the lineage handrail: both are
     *  SUBORDINATE marks (they annotate the name, they are not the name), so
     *  they sit a step below the category tag while staying clear of the 9px
     *  mono accessibility floor at every UI-scale tier. */
    categorySize: 14,
    nameSize: 20,
    descSize: 17,
    raritySize: 12,
    lineageSize: 12,
    /** Gap (px) between the category tag and the rarity tag on the meta row. */
    metaGap: 8,
    /** Dashed ghost edge behind the row when more offers are queued (px). */
    ghostOffset: 6,
    /** Alpha the cards dim to while a spend is in flight (locked). */
    lockedAlpha: 0.38,
    /** Denied edge pulse on the PICKED card: the ratified 80ms one-shot with a
     *  300ms same-source floor (the deniedFire grammar, reused verbatim). */
    deniedPulseMs: 80,
    deniedFloorMs: 300,
  },

  /**
   * Settings & accessibility (Story 2.3). Everything here is a CLIENT-ONLY feel
   * / chrome knob: no setting ever travels on the wire, and none of these values
   * is gameplay-authoritative. The persisted VALUES live in localStorage
   * (settings/store.ts); this group holds the option sets, gates and geometry.
   */
  settings: {
    /** localStorage key holding the whole settings object (JSON). */
    storeKey: 'hullcracker.settings',
    /** The pre-2.3 standalone mute key — read ONCE as a fallback, then the new
     *  store key is authoritative (it is never written again). */
    legacyMuteKey: 'hullcracker-muted',
    /** The three committed UI-scale tiers (%). No 150% tier — foreclosed. */
    scaleTiers: [90, 100, 125] as const,
    /** Viewport width (px) below which the 125% tier is shown-but-DISABLED. */
    scaleGateWidthPx: 1600,
    /** Hard floor (px) for rendered MONO type after the UI scale is applied. */
    monoFloorPx: 9,
    /** Motion intensity multiplier per level — `reduced` halves every flash /
     *  pulse amplitude, `off` removes motion entirely (information stays). */
    motionIntensity: { full: 1, reduced: 0.5, off: 0 },
    /** THE photosensitivity ceiling (Hz) for every breathing pulse on screen —
     *  the epic's non-negotiable accessibility floor ("HP/economy pulses capped
     *  at 1.1 Hz"). Promoted to config by Story 2.4 so ONE number governs both
     *  consumers: the HP rail's accelerating ramp (render/hud.ts hullPulseHz)
     *  and the out-of-zone storm vignette (render/zone.ts). Nothing may pulse
     *  faster; a new pulsing surface reads this, never its own literal. */
    pulseCapHz: 1.1,
    /** Overlay chrome: z between the refit modal (1000) and the home (1100). */
    zIndex: 1050,
    /** Panel geometry (px) — the DOM port-chrome register (panel bed, 1px
     *  hairline border, 12px radius, no fullscreen backdrop dim). */
    panelWidth: 720,
    panelRadius: 12,
    panelPad: 28,
    /** Volume slider range (both master and effects are 0..100 integers). */
    volumeMax: 100,
  },

  /**
   * The bottom-right OWN-VITALS cluster (Story 2.4) — the restyled v2-composite
   * anatomy: a `HULL n/n` header over a body of (HDG/KTS readouts + rudder
   * gauge | telegraph ladder) with the vertical HP rail climbing the body's
   * right edge. Source: DESIGN.md Components · HP Rail / Telegraph Cluster and
   * the Eric-confirmed `mockups/hud-composite-2.html` anatomy, as amended
   * (24 phosphor readouts / 25 dim-phosphor micro labels / 26 glyph fade /
   * 27 6px rail). Colors are NOT here — every stroke reads a `colors` token.
   */
  vitals: {
    /** Cluster frame (px). `width` is the BODY column block (header, readouts,
     *  telegraph); the HP rail adds `railWidth` on its right edge, so the whole
     *  stack is `width + railWidth` wide. */
    width: 296,
    /** Body height (px). It must CONTAIN every mark the cluster paints — the
     *  lowest of which is the ASTERN caption's line box under the ladder
     *  (hud.ts CLUSTER_CONTENT_BOTTOM, pinned by hud.test.ts): the declared box
     *  is what the layout tests measure, so an under-measured height would let
     *  the caption hang outside a "no-overlap" proof. */
    height: 254,
    /** Header band height (px) — the `HULL n/n` line above the body. */
    headerH: 24,
    /** Gap (px) from the viewport's right / bottom edges. */
    margin: 24,
    /** IN STORM baseline, px above the cluster's top edge. Story 2.6 deleted the
     *  amber "PTS ×N — TAB" prompt that used to sit between them (amendment 33 —
     *  the economy moved to the bottom-LEFT satellites), so the warning reflows
     *  down into the freed slot: one satellite line, one offset. */
    stormAbove: 24,
    /** HP RAIL — the first vertical rail in the HUD. Story 2.6's XP rail
     *  INHERITS this idiom (dim phosphor track, bottom-up fill, soft glow) at
     *  3px (UX-DR12); only the HP rail widens to 6px (amendment 27). */
    railWidth: 6,
    /** Dim phosphor track the fill climbs (the empty part of the rail). */
    railTrackAlpha: 0.12,
    /** BASE fill alpha. This is INFORMATION, not motion: it is exactly what the
     *  rail holds at motion=off, and the pulse only breathes around it. */
    railFillAlpha: 0.85,
    /** Soft bloom around the fill (same breathing alpha as the fill). */
    railGlowAlpha: 0.35,
    railGlowPx: 3,
    /** Threshold bands as a fraction of maxHp — EXCLUSIVE lower bounds for the
     *  better color: frac ≥ 0.5 phosphor, ≥ 0.25 amber, below that damageMarker. */
    amberBelow: 0.5,
    criticalBelow: 0.25,
    /** Pulse envelope: the fill breathes only below `amberBelow`, its rate
     *  ramping linearly from `pulseMinHz` at that fraction to the shared
     *  photosensitivity ceiling (settings.pulseCapHz) at `pulseFloorFrac` and
     *  below — accelerating alarm, hard-capped, never a strobe. */
    pulseMinHz: 0.5,
    pulseFloorFrac: 0.1,
    /** Opacity-breathing amplitude (motion-scaled at the callsite). */
    pulseAmp: 0.15,
    /** Rudder gauge: 110px track + the amber position tick (px). */
    rudderTrack: 110,
    rudderTickW: 2,
    rudderTickH: 8,
    /** Halo bleed (px) around the tick on every side. The tick CENTER is clamped
     *  by half the tick plus this, so the glow never overhangs the track ends at
     *  full deflection (hud.ts rudderTickCenter). */
    rudderTickHaloPx: 1,
    /** Telegraph ordered-order marker: the HOLLOW phosphor rung outline (px) —
     *  the SHAPE channel against the solid amber actual-speed needle. */
    orderedW: 26,
    orderedH: 7,
    /** Micro-label alpha — dim PHOSPHOR, never grey (amendment 25). Applies to
     *  the HULL caption, the HDG/KTS unit labels, RUDDER, and AHEAD/ASTERN. */
    labelAlpha: 0.7,
    /** HELM KEY GLYPHS (amendment 26): the W/S and A/D chips at the gauge
     *  extremes fade PERMANENTLY, per pair, after this many successful inputs.
     *  Progress lives under its own standalone localStorage key — deliberately
     *  NOT in the settings store, so RESET SETTINGS cannot resurrect learned
     *  anatomy. `fadeSec` is the fade-out itself (instant at motion=off). */
    glyphFadeCount: 3,
    glyphFadeSec: 0.6,
    glyphKey: 'hullcracker.helm',
  },

  /**
   * The bottom-left ECONOMY SATELLITES (Story 2.6, amendment 33): a vertical XP
   * rail in the hotbar's reserved gutter with an LV tag, a banked-level chip,
   * and the "LEVEL UP — TAB TO REFIT" cue line. They replace the deleted
   * bottom-right amber PTS readout. Geometry + timing only — every stroke reads
   * a `colors` token, and the rail idiom itself (dim phosphor track, bottom-up
   * fill, soft glow) is INHERITED from `vitals` (railTrackAlpha / railFillAlpha
   * / railGlowAlpha / railGlowPx), which is what "mirrors the HP rail" means.
   */
  xpRail: {
    /** Rail width (px) — 3px per UX-DR12; only the HP rail widened to 6
     *  (amendment 27), so the two rails share the idiom, not the width. */
    railWidth: 3,
    /** Gap (px) between the rail's head and the LV tag's center. */
    tagGap: 14,
    /** Gap (px) between the LV tag's center and the level chip's center. */
    chipGap: 26,
    /** Level chip square (px) — the one mono chip family's footprint. */
    chip: 22,
    /** Gap (px) between the chip and the cue line. */
    cueGap: 10,
    /** Breathing cycle (s) of an UNSPENT level chip — 2.4s (≥ the ratified 2s
     *  floor), i.e. ~0.42 Hz, well under `settings.pulseCapHz`. */
    breathSec: 2.4,
    /** How long (s) the chip breathes before decaying to a STATIC chip. The
     *  information (chip + count + cue line) never decays — only the motion. */
    unspentSec: 10,
    /** BASE alpha of the chip's linework/label — what it holds when static and
     *  at motion=off (information, not motion). */
    chipAlpha: 0.85,
    /** Opacity-breathing amplitude (motion-scaled at the callsite). */
    pulseAmp: 0.15,
  },

  /** Radar blip render knobs (Story 2.3 adds the colorblind-assist channel). */
  blip: {
    /** Stroke width (px, in the baked 64px blip texture) of the assist OUTLINE
     *  ring — absent (0) unless colorblind assist is on. */
    outlineWidthPx: 4,
    /** Minimum alpha a decayed blip may reach while it is still alive. 0 is the
     *  base behavior (linear fade to nothing over one sweep); the assist raises
     *  the floor so a cooling blip never fades to near-invisible. */
    minAlpha: 0,
    /** The assist's raised minimum decayed-blip alpha. */
    assistMinAlpha: 0.35,
  },

  /** Netcode render delays (ms behind estimated server time). */
  net: {
    /** Remote contacts interpolate this far behind serverNow(). */
    interpDelayMs: CONFIG.tick.interpDelayMs,
    /** Own ship in the interp-checkpoint mode renders at -50ms per the plan. */
    ownDelayMs: 50,
  },
} as const;
