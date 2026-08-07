// Client-only tunables. These are render/feel constants that never travel on
// the wire and are not part of the shared simulation CONFIG (that stays the
// single source of truth for anything gameplay-authoritative). If a value here
// starts to feel gameplay-load-bearing, promote it to shared CONFIG instead.

import { CONFIG } from '@salvo/shared';
import { fitPointRef } from './render/radarFalloff.js';

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
  // Pre-join AMBIENT terrain only (render/ambient.ts's CIC scene). DESIGN.md:41
  // marks these a "provisional carry-over — Open Question"; the in-match chart
  // no longer reads them (see `terrain` below, cycle 59).
  islandFill: 0x2a2410,
  islandStroke: 0x8b7520,
  /**
   * THE HYPSOMETRIC TERRAIN RAMP (cycle 59, Eric ruling 2026-08-06) — the four
   * elevation bands of a height-field island, chosen from rendered comparison
   * on real generator output and superseding the provisional `islandStroke`
   * yellow for in-match terrain.
   *
   * INDEX IS THE BAND LEVEL: 0 shore (the coastline polygon the sim actually
   * collides against) through 3 summit (the innermost isoline). The ratified
   * grammar is one sentence — each band is OUTLINED in its solid scale colour
   * and FILLED with a darker, less intense version of that same colour — so the
   * pair is authored together per level and never recombined across rows.
   *
   * Four is the ceiling, not a default: "I don't want too many different
   * heights". A fifth band would need a ruling, not a fifth literal.
   */
  terrain: [
    { stroke: 0x4a6b33, fill: 0x242f22 }, // 0 — shore
    { stroke: 0x7b8a3e, fill: 0x363c29 }, // 1 — low slope
    { stroke: 0xae9c58, fill: 0x484534 }, // 2 — upland
    { stroke: 0xdcd2ac, fill: 0x5b5a52 }, // 3 — summit
  ],
  // RADAR HEATMAP BANDS (cycle 52, amendment 77 — Eric's three-color ruling,
  // superseding cycle 51's continuous blue→green→yellow→red Garmin ramp). These
  // are the ONLY three colors the `return` layer can ever paint, and a pixel is
  // one of them or it is fully transparent: there is no blend, no gradient and
  // no fourth state anywhere between here and the screen. They are CERTAINTY
  // labels in Eric's own words, not object labels and not identity — `return`
  // mode carries no personal hue at all (amendment 62), so nothing here competes
  // with the Regatta wheel. Thresholds and ORDER live in `blip.heatmap.bands`;
  // Eric hedged the ordering himself ("or whatever the ACTUAL RADAR would look
  // like"), so reordering is a one-line edit there, deliberately.
  echoFaint: 0x1ee06e, // "honestly not sure, could be something tiny" — green (~145°)
  echoFuzzy: 0x1e5cff, // "probably a thing, but fuzzy" — deep radar blue (~223°)
  echoSolid: 0xff2a00, // "this is definitely a thing" — red (~10°)
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

// --- the `return` heatmap's CALIBRATION (Story 4.10, amendments 118 + 127-132) --
//
// These four live OUTSIDE the object literal for one reason: `pointRef` is
// SOLVED from three of them, and a self-reference inside an object literal is
// not expressible. They are the single source for the values below — nothing
// re-states them.

/** Attenuated ACROSS extent (u) whose kernel peaks at full intensity — the
 *  normalizer in `shipPeak`, and one of the fit's three inputs. */
const HEAT_STRONG_EXTENT = 60;

/** The RED->BLUE boundary: `bands[2].at`, the intensity the calibration hull
 *  must land on exactly at 7/8 intel range. Stated once, used twice. */
const HEAT_RED_AT = 0.7;

/**
 * Asymptotic floor of the POINT (1/d^4) curve — LOWERED 0.45 -> 0.02 by this
 * story, and the reason is arithmetic, not taste.
 *
 * The fit solves `A = bands[2].at * strongExtent / ext` for the attenuation
 * required at the crossover — for the Mine Layer broadside that is 0.477 — and
 * then inverts the curve for the reference range. The inversion divides by
 * `(A - floor)`. At the shipped 0.45 asymptote that denominator is 0.027: a
 * hundredth of a point of movement in ANY of `bands[2].at`, `strongExtent` or
 * the calibration hull's `ext` would swing the fitted reference by hundreds of
 * units, and a floor above 0.477 would make the crossover unreachable at ANY
 * range. Under `n = 1` the old floor was harmless because the curve did its
 * work slowly; under `n = 4` it sits on top of the answer.
 *
 * THE FLOOR IS NOT DROPPED, ONLY LOWERED (amendment 127 — "signature becomes
 * stealth" is a RULED-OUT design, not a missing feature). It remains a true
 * asymptote rather than a clamp, so two different ranges still never attenuate
 * identically (amendment 64's one-quantity-per-channel rule). What actually
 * discharges "nothing inside radar range ever paints nothing" is `minPeak`,
 * which is UNCHANGED at 0.2 and is asserted directly by the suite rather than
 * trusted to fall out of the curve.
 */
const HEAT_SHIP_ATTEN_FLOOR = 0.02;

/**
 * THE FITTED POINT REFERENCE (u) — amendment 118's calibration, SOLVED, not
 * typed in. ~558u at the shipped ladder.
 *
 * `CONFIG.vision.farRadar` (7/8 intel range = 577.5u) is read HERE AND NOWHERE
 * ELSE IN THE CLIENT. Story 4.9 shipped that rung deliberately unconsumed and
 * named this line as its only legitimate consumer: it is an input to FITTING a
 * coefficient, evaluated once at module load, so the red->blue crossover EMERGES
 * from the 1/d^4 curve and moves automatically if `SIGHT` is ever retuned.
 * Writing `if (d > farRadar)` — or any other comparison against that constant —
 * anywhere on a paint path violates amendment 105 (colour is intensity, never
 * category) and is the wrong implementation of amendment 118. Fit the curve; do
 * not branch. `grep -rn farRadar client/src/render/` must stay empty.
 *
 * THE CALIBRATION HULL IS THE MINE LAYER AT BROADSIDE (amendment 131): 88u x
 * 20u, so `ext` = the hull length at full beam-on aspect. Broadside is the hull
 * as PRESENTED AT ITS STRONGEST, which makes the 7/8 crossover the TYPICAL case
 * rather than the best one; calibrating bow-on instead would leave a broadside
 * mid hull red past the rim. The four readings this fit is judged on (pinned in
 * __tests__/radarFalloff.test.ts, not re-derived here): a mid hull saturates red
 * by ~465u, still reads blue at the 660u rim, a `minExtent` needle at the rim
 * falls to `minPeak` and still paints green, and a battleship broadside still
 * reads red at the rim.
 */
const HEAT_POINT_REF = fitPointRef({
  crossover: CONFIG.vision.farRadar,
  ext: CONFIG.shipClasses.mineLayer.hull.length,
  strongExtent: HEAT_STRONG_EXTENT,
  band: HEAT_RED_AT,
  coef: 1, // steel broadside is the coefficient table's 1.0 anchor
  floor: HEAT_SHIP_ATTEN_FLOOR,
});

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

  /**
   * ON-WATER ORDNANCE IDENTITY (Story 2.9) — render-only feel knobs for what a
   * doctrine LOOKS like in flight / on the chart. Nothing here is gameplay
   * authoritative: the sim numbers (speeds, radii, damage) all live in shared
   * CONFIG, and the wire stays mode-blind for ballistics. The OWN-side cannon
   * weights (`cannon*`) are the ratified "the cannon must read heavier than the
   * gun" tester fix — own-side only, because the constant-free ballistic wire
   * shape cannot (and must not) say "cannon" to an onlooker.
   */
  ordnance: {
    /** Own CANNON shell: a visibly bigger, heavier dot than the gun's (2.2/6). */
    cannonCoreR: 3.4, // u
    cannonGlowR: 9, // u
    cannonGlowAlpha: 0.3,
    /** ARMOR-PIERCING: the core is stretched into a dart along its bearing. */
    apStretch: 2.6,
    /** PLUNGING FIRE: peak extra scale at the top of the arc, and the time the
     *  swell takes to rise and fall back (ms). Motion-scaled at the callsite —
     *  the shell's POSITION (the information) never moves with it. */
    arcSwell: 0.45,
    arcSwellMs: 900,
    /** ACOUSTIC HOMING: a steering fish reads brighter-headed with a tighter
     *  wake than a straight-runner (spacing in u; the base is 16u). */
    homingCoreR: 4.2, // u
    homingTrailSpacing: 10, // u
    /** SELF-PROPELLED mines: drop a faint wake dot every this many units of
     *  creep, and draw the heading tick this long (u) — the tick is the STATIC
     *  half of the creep tell, so the doctrine reads at motion=off too. */
    creepWakeSpacing: 14, // u
    creepTickLen: 9, // u
    /** Movement (u) below which a re-synced mine counts as STATIONARY — frame
     *  positions are exact server values, so this only guards float noise. */
    creepEpsilon: 0.05, // u
  },

  /**
   * THE GUNNERY CONVERSATION (Story 4.3) — the client-side feel knobs for the
   * three new gunnery signals (`mz` muzzle flash / `sp` fall of shot / `hc` Hit
   * Call). Nothing here is gameplay-authoritative: WHO is told and HOW FAR a
   * flash carries are server rules living in shared CONFIG (`vision.muzzleFlash`
   * is derived there), and the three marks reuse the shipped `muzzle` / `splash`
   * / `hitBloom` tokens and their shipped geometry — no new color, no retune.
   * What is left for the client to decide is how often the Hit Call is allowed
   * to make a NOISE, which is a comfort question, not a rules question.
   */
  gunnery: {
    /**
     * Minimum gap (ms) between HIT CALL tones — the ratified 300ms same-source
     * floor (the deniedFire pulse's own register, reused verbatim), applied in
     * render/gunneryFeed.ts because nothing in the audio layer rate-limits.
     * A 3-shell salvo connecting inside 200ms draws three blooms and plays ONE
     * cue: the blooms are three facts about three points, the cue is one fact
     * about the salvo, and three overlapping muffled booms are just a smear.
     */
    hitCallToneFloorMs: 300,
  },

  /**
   * ORDNANCE AIM PREVIEW (the aim-time answer to "where does this actually go
   * and what does it actually cover") — render/aimPreview.ts + the own-mine
   * rings in render/mines.ts. Geometry is NOT here: every point and radius is
   * computed from the shared aim helpers + own effectiveStats(), so these are
   * purely how loud the drawing is.
   *
   * The whole block is deliberately QUIET (implementer-drafted, Eric's
   * guardrail: "information noise must never bury the hunt"). A preview is a
   * hairline the eye can find when it looks for it and ignore when it does not
   * — never a second HUD painted over the water. Every value is STATIC: the
   * preview never pulses, so it reads identically at motion=off (DESIGN.md
   * dual-coding + motion law). Radii are distinguished by LINE STYLE (solid /
   * dashed / dotted), never by color alone.
   */
  aimPreview: {
    lineWidth: 1, // px-ish (world units at zoom 1) — travel-line stroke
    lineAlpha: 0.26, // the travel line: present, never competing with the reticle
    /** The blast circle at the true burst point: a hairline ring + a whisper of
     *  fill so the covered water reads as an area, not just an outline. */
    burstWidth: 1.2,
    burstAlpha: 0.4,
    burstFillAlpha: 0.05,
    /**
     * The EFFECT register (star-shell lit radius): the same circle, quieter.
     * An effect radius is not a threat — and the flare's is ~7× a gun blast, so
     * at damage weight one aim would wash the chart. Implementer-drafted (Eric
     * ruling R7 asked for the radius, not for a loudness): roughly half the
     * damage register's ink.
     */
    effectAlpha: 0.22,
    effectFillAlpha: 0.03,
    /** A path an island blocks short of the burst point: the line clips at the
     *  rock and the circle drops to this alpha — the "this shot does not get
     *  there" tell (never a new color; the red register is denial only). */
    blockedAlpha: 0.14,
    /** ACOUSTIC HOMING's acquisition band along the initial track (the straight
     *  line is only where the fish STARTS — the band is the honesty device). */
    bandAlpha: 0.07, // interior wash
    bandEdgeAlpha: 0.13, // the two rails
    /** Dashed/dotted rings: how many segments the full circle is cut into, and
     *  what fraction of each segment is ink. Dotted is sparser AND thinner-duty
     *  than dashed, so the three own-mine rings separate at a glance. */
    dashSegments: 28,
    dashDuty: 0.55,
    dotSegments: 40,
    dotDuty: 0.22,
    /**
     * The MINE PLACEMENT wedge's stroked boundary (render/firing.ts
     * sectorEdge): the two side rays + the closing range arc, over the existing
     * fill. The mine is the only sector whose radius is REAL reach rather than
     * an indicator, so its edge is information and deserves a hard line instead
     * of a wash that fades out. Static (no pulse). `dimAlpha` keeps the
     * not-ready / out-of-arc wedge as quiet as it is today — the boundary is
     * legible there, never loud.
     */
    placementEdge: {
      width: 1.2,
      alpha: 0.55,
      dimAlpha: 0.18,
    },
  },

  /**
   * OWN-MINE RINGS (render/mines.ts) — always-on, owner-private radii drawn in
   * the dropper's personal hue on the fog-immune chart layer: solid blast,
   * dashed trigger, sparse-dotted acquisition (SELF-PROPELLED only). Enemies
   * see exactly today's marker and nothing else.
   */
  mineRings: {
    width: 1, // ring stroke width
    blastAlpha: 0.3,
    triggerAlpha: 0.34,
    acquireAlpha: 0.16,
    /** Multiplier applied to every ring alpha while the mine is still ARMING
     *  (client-inferred: first-seen + CONFIG.mine.armDelay). Dim = "not live
     *  yet"; it snaps to full the moment it arms. */
    armingScale: 0.4,
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
    /** Pip scale anchors (objective rework Eric ruling 2026-08-03, superseding
     *  the 2026-07-24 relative-maxima scheme) — ABSOLUTE OBJECTIVE LADDERS: 1
     *  pip = `base`, each additional pip = `+step`, via util/pips.ts's pipFill:
     *  clamp(1 + round((value - base) / step), 1, 5). Fixed per-stat ladders
     *  (not per-batch relative) so a hull's pips never shift when the class
     *  roster changes AND the pip count means the same real-world value
     *  everywhere it's shown. */
    pip: {
      speed: { base: 30, step: 5 }, // knots (numerically = u/s per the 2026-07-21 knot-realistic rescale) — 1 pip = 30kn, +5kn/pip
      toughness: { base: 100, step: 25 }, // hull hp — 1 pip = 100hp, +25hp/pip
      turning: { base: 0.2, step: 0.2 }, // rad/s — 1 pip = 0.2 rad/s, +0.2/pip
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
      /** Painted blip diameter (px) — the soft dot (bakeBlipTexture) at roughly
       *  the on-screen size the in-game blip used to have. The menu scope keeps
       *  the dot deliberately: its drifting contacts have no owner and no class,
       *  so the Story 4.2 silhouette grammar has nothing to say about them. */
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

  /**
   * CHARTED TERRAIN (cycle 59) — how the static island layer draws the height
   * field's elevation bands. Colours are NOT here: render/map.ts reads the
   * `colors.terrain` ramp. Nothing in this group is gameplay authoritative —
   * contours are RENDER-ONLY isolines, never collided and never LOS-tested, and
   * the level-0 outline is the sim's own `isle.poly`, vertex for vertex.
   */
  terrain: {
    /**
     * SCREEN-LOCKED stroke widths (px), divided by the camera zoom at draw time
     * exactly like the storm plane's edges (the same `strokeWorldWidth`). A
     * fixed world width would thin the coastline to 0.7px at the 0.5× end of
     * the shipped user-zoom range — a hairline at precisely the moment the
     * player has asked to see more terrain at once.
     *
     * The contour line is SUBORDINATE to the coastline: the coast is the one
     * mark that is also sim truth (it is what you run aground on), the isolines
     * above it are elevation reading.
     */
    coastPx: 2,
    contourPx: 1.5,
    /**
     * Redraw throttle for the static island layer — the same discipline the
     * storm plane runs, minus the radius clause (terrain geometry never moves,
     * so CAMERA ZOOM is the only thing that can invalidate the drawn stroke).
     * A 2% zoom change is a sub-pixel width error at 2px, so anything under it
     * is not worth re-tessellating ~1,100 vertices for.
     */
    redrawZoomFrac: 0.02,
  },

  /**
   * THE STORM PLANE (Story 3.2, amendments 14/15/17) — every render tunable the
   * zone renderer owns, promoted out of render/zone.ts's bare consts so the
   * tests read config instead of mirroring literals. Nothing here is gameplay
   * authoritative: the timeline, the radii and the damage all live in shared
   * `CONFIG.zone` (the sim's single source of truth); this group only decides
   * how that geometry LOOKS. Colors are NOT here either — the renderer reads the
   * `colors.storm` / `colors.stormReadout` tokens.
   *
   * The grammar itself (amendment 14): SOLID current edge vs DASHED next-ring
   * telegraph, both at storm-readout violet — solid-vs-dashed is the non-color
   * channel, so the two edges never depend on hue to be told apart. The 3.1
   * interim phosphor-green "safe ring" is retired.
   */
  zone: {
    /**
     * Alpha of the FULL-AREA storm fill (amendment 15: the whole region outside
     * the live ring, not the 3.1 70u annulus). Deliberately low: the fill is
     * ambience, the EDGE carries the 3:1 legibility (DESIGN.md's storm color
     * note — `storm` at 2.87:1 is below the graphics threshold). 0.12 keeps
     * roughly the interim band's density (0.11) while blips, contacts and the
     * sweep — all of which draw ABOVE `layers.zone` in chartRoot — stay legible
     * over it.
     */
    fillAlpha: 0.12,
    /**
     * FLOOR for the fill disc's outer radius, as a multiple of the map radius.
     * The disc is centered on the LIVE RING, so "past the map edge" is not
     * enough — it must clear the farthest visible screen corner, or the fill's
     * own edge shows up as an arc of un-tinted void:
     *
     *   needed = dist(camera center → ring center) + half the visible diagonal
     *
     * No CONSTANT factor can bound that: the camera fits 2 × radar range on the
     * SHORT axis, so a short-wide viewport at the widest user zoom with a maxed
     * radar stack (intelRadar ×5 = 1.15⁵) already needs ~17.8k u on a 3440×720
     * screen (this factor gives 16.8k), and spectate free-pan is UNCLAMPED — the
     * camera can travel arbitrarily far from any ring. So the renderer computes
     * `needed` per frame and draws max(this floor, needed), bucketed up by
     * `fillBucketU`. The floor still earns its keep: it is what ordinary play
     * sits at, so the bucket never moves and the shape is never re-tessellated.
     */
    fillOuterFactor: 7,
    /**
     * Quantum (world units) the dynamic fill radius is rounded UP to, and the
     * screen-space slack added before rounding. Bucketing is what keeps the
     * dynamic bound cheap: the drawn radius only changes when the requirement
     * crosses a 2000u step (and it is grow-only per Zone), so ordinary play
     * never re-tessellates the disc and even a fast-panning spectator redraws
     * it every few seconds at most. The margin is expressed in SCREEN px and
     * divided by the zoom like the strokes are, because what it covers is
     * screen-space: the camera SHAKE offset (≤56px, render/shake.ts) plus
     * stroke overhang and rounding slack.
     */
    fillBucketU: 2000,
    fillMarginPx: 96,
    /**
     * SCREEN-LOCKED stroke widths (px, amendment 14 + the zoom-invariance
     * clause). The renderer divides these by the camera zoom at draw time, so
     * the on-screen width is constant across the shipped 0.5×–1.5× user-zoom
     * range instead of thinning to a hairline when you zoom out.
     */
    edgePx: 2,
    telegraphPx: 2,
    /** Solid live-edge alpha — the brightest mark the zone plane paints. */
    edgeAlpha: 0.9,
    /** Dashed telegraph alpha (~50%): present and readable, subordinate to the
     *  live boundary. This is the SETTLED alpha the reveal one-shot decays to. */
    telegraphAlpha: 0.5,
    /** Dash count around the telegraph circle and the lit fraction of each
     *  segment (0.5 = a 50% duty dash-gap pattern). */
    telegraphDashes: 48,
    telegraphDuty: 0.5,
    /** Redraw throttle: the rings are re-stroked only when the radius moves more
     *  than this many world units, or the camera zoom moves by more than this
     *  FRACTION of itself (a 2% zoom change is a sub-pixel stroke-width error at
     *  2px). Everything between redraws is a position-only update. */
    redrawEpsU: 1,
    redrawZoomFrac: 0.02,
    /** Out-of-zone vignette: mean alpha and pulse amplitude while outside. Purple
     *  reads calmer than the old red, so the alarm leans on brightness, not
     *  saturation (DESIGN.md). The BASE is information — it is exactly what the
     *  vignette holds at motion=off; only the breathing is motion. The pulse RATE
     *  is never a local number: it is `settings.pulseCapHz`, the one shared
     *  photosensitivity ceiling. */
    vignetteBase: 0.27,
    vignetteAmp: 0.17,
    /**
     * Time constant (ms) of the Tier-1 HOLD easing — how fast the vignette
     * moves between its breathing value and its lit keyframe (amendment 16).
     *
     * WHY IT IS NOT A SNAP: every accepted denied-fire click owns Tier 1 for
     * exactly 80ms, and the click-spam register is one accepted denial every
     * 300ms — a snapping hold would square-wave the FULL-SCREEN vignette up to
     * 3.3 times a second, past the ≤1.1Hz pulse / ≤3-flashes-per-region
     * accessibility floor this very story pins. The floor is the superior law,
     * so the hold EASES: an 80ms blip becomes a barely-perceptible swell (~28%
     * of the way to lit at this constant), while a sustained hold — the case
     * amendment 16 was actually written for, a hull under 50% — still arrives
     * at the lit keyframe within ~1s and stays there. Semantics preserved,
     * strobe removed.
     *
     * 240ms sits in the ratified 150–250ms band: fast enough that the hold
     * still reads as a response to the threat, slow enough that the blip case
     * lands well under the perceptual flash threshold.
     */
    holdEaseMs: 240,
    /** THE REVEAL ONE-SHOT (amendment 17): when a next ring first becomes public
     *  the dashed telegraph lands with a brief flash-then-settle — `revealMs` of
     *  linear decay from (telegraphAlpha + revealAmp) back to telegraphAlpha.
     *  The 80ms/≥300ms register is the ratified one-shot grammar (the deniedFire
     *  pulse's numbers, reused verbatim); the floor is structural insurance —
     *  reveals are a ring group apart. Motion-scaled at the callsite: `off`
     *  makes the telegraph simply appear, with no flourish and nothing lost. */
    revealMs: 80,
    revealFloorMs: 300,
    revealAmp: 0.4,
  },

  /**
   * THE BR CHROME BAR (Story 3.3, amendments 19–21) — the one restrained mono
   * row top-center: `n AFLOAT · n KILLS · T+mm:ss · <ring readout>`. Everything
   * it shows is data the client already holds (roster alive/kills, zoneStartT,
   * the derived ZoneView); nothing here is gameplay-authoritative and nothing
   * travels on the wire. Colors are NOT here — the bar reads the `colors`
   * tokens directly (numbers + labels `phosphor`, the ring segment
   * `stormReadout`, amber only in the urgency window — amendments 17/21).
   *
   * The composition lives in ui/chromeBar.ts (pure, zero Pixi); render/hud.ts
   * only lays the composed segments out and drives the pulse.
   */
  chromeBar: {
    /** Baseline (px from the top of the logical viewport) of the bar row — the
     *  slot the retired 3.1 `zoneLine` register held. Deliberately the SAME 24
     *  as `vitals.margin`: the HUD's one edge margin, so the top-center row and
     *  the bottom-right cluster sit the same distance off their edges. (Pinned
     *  by chromeBar.test.ts; config object literals cannot reference their own
     *  siblings, which is why the number is restated rather than read.) */
    y: 24,
    /** Row type: mono (CLIENT_CONFIG.type.mono), 18px — a touch under the 20px
     *  the interim storm line used, because the bar carries four segments where
     *  that carried one, and comfortably over the 14px micro floor. */
    fontSize: 18,
    /** Letter-spacing (px). The bar is a READOUT, not prose — the tracking is
     *  what makes a dense one-line register scan as separate facts. */
    letterSpacing: 2,
    /** Alpha of the bar's LABELS (`AFLOAT` / `KILLS` / the `T+` prefix). The
     *  labels are dim PHOSPHOR, never grey: amendment 17 retired `textMuted`
     *  for load-bearing HUD text, and 0.55 is the vitals cluster's own
     *  dim-phosphor text alpha (hud.ts `TEXT_DIM_ALPHA`, which dims an
     *  un-selected telegraph rung) — one dim-TEXT register across the HUD. */
    labelAlpha: 0.55,
    /** Alpha of the ` · ` separators. Dimmer than the labels: they are
     *  punctuation, and nothing about them is information. */
    sepAlpha: 0.35,
    /** FLOOR alpha of the ring segment's amber breath — the trough of the
     *  opacity pulse, whose crest is the LIT keyframe (alpha 1, ui/chromeBar.ts
     *  RING_LIT_ALPHA). Opacity-only breathing: the text, the countdown and the
     *  amber color are all fully present at the trough, so the urgency cue can
     *  never take the information with it (and at motion=off the amplitude is
     *  zero and the segment simply holds lit). */
    pulseFloorAlpha: 0.45,
    /** Time constant (ms) of the Tier-2 HOLD easing — how fast the amber
     *  segment moves between its breathing value and the lit keyframe it holds
     *  at while a Tier-1 threat channel owns the eye (attention.ts). The 3.2
     *  vignette-hold precedent, verbatim (`zone.holdEaseMs`): a snapping hold
     *  would let denied-click spam square-wave the segment at up to 3.3 Hz,
     *  past the ≤1.1 Hz / ≤3-flashes-per-region accessibility floor. */
    holdEaseMs: 240,
    /** THE URGENCY WINDOW (ms before a ring's close STARTS) — amendment 20's
     *  override: inside it the segment turns amber and breathes while the
     *  continuous `RING CLOSES IN m:ss` countdown runs on (amendment 26). 10s is
     *  the get-moving moment; the shrink itself (`closing`) is never amber. */
    urgentMs: 10_000,
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
     * Band anchor: the row's TOP edge as a fraction of viewport height. The
     * BELOW-CENTER keep-out proxy — the listening ring (UX-DR18) does not exist
     * yet (Epic 4/6, and 4.1 is deferred), so the honest constraint today is
     * "own hull at screen center stays clear". When the ring ships, this
     * fraction becomes the ring's outer-radius contract and moves with it.
     *
     * LIFTED 0.58 → 0.534 in cycle 47 by Eric ruling (amendment 67), which
     * REOPENED amendment 40's "no band lift" specifically to buy the DAMAGE
     * CONTROL rail the room to be legible. The value is not a taste call — it is
     * the only band the hard constraints leave at the 1280×614 logical floor,
     * where the band is boxed on BOTH sides:
     *
     *   below-center keep-out   row.y - pipsAbove > 614/2   →  row.y > 325
     *   container-fit law       row.y + cardHeight + stripGap + stripHeight
     *                                                ≤ 614  →  row.y ≤ 332
     *
     * Seven pixels of total slack. 0.534 lands row.y at 328 (round(614×0.534)),
     * leaving 3px clear of the keep-out and 4px clear of the screen edge. A
     * 236px card row plus a genuinely legible rail simply near-fills a 614px
     * viewport — which is exactly why cycle 46 squeezed the rail instead, that
     * option having been closed to it.
     *
     * A THIRD constraint binds from outside this arithmetic: the band is
     * anchored in PHYSICAL px while its contents are CSS-scaled, so the 125%
     * tier at a 1600×768 viewport is tighter than the logical-floor math
     * suggests. That constraint is what set `stripGap` to 6 rather than 8 —
     * see that knob. All three margins are pinned by the geometry suite, so a
     * future drift fails loudly rather than clipping on someone's laptop.
     */
    bandTopFrac: 0.534,
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
     *  mono accessibility floor at every UI-scale tier.
     *
     *  AMENDMENT 47 (the container-fit law) trimmed two of these. The rules
     *  text went 17 → 15: at 17px a 186px inner box holds only 18 mono
     *  characters per line, which put every doctrine card 50–97px PAST the card
     *  bottom on the live site. 15px is a deliberate step ABOVE amendment 15's
     *  14px legibility floor, not a crash back to micro-type — the copy was cut
     *  first (boonCopy.ts) and the size second, in that ratified order. The
     *  rarity tag went 12 → 11 so the widest meta row (STAR SHELLS + EXCLUSIVE)
     *  fits ONE line inside 186px; 11px still clears the 9px mono floor at the
     *  90% tier (9.9px). Both are pinned by __tests__/refitCardFit.test.ts. */
    categorySize: 14,
    nameSize: 20,
    descSize: 15,
    raritySize: 11,
    lineageSize: 12,
    /** Gap (px) between the category tag and the rarity tag on the meta row.
     *  8 → 6 with the amendment-47 meta-row fit (see raritySize above). */
    metaGap: 6,
    /** Dashed ghost edge behind the row when more offers are queued (px). */
    ghostOffset: 6,
    /** Alpha the cards dim to while a spend is in flight (locked). */
    lockedAlpha: 0.38,
    /** Denied edge pulse on the PICKED card: the ratified 80ms one-shot with a
     *  300ms same-source floor (the deniedFire grammar, reused verbatim). */
    deniedPulseMs: 80,
    deniedFloorMs: 300,

    /**
     * THE DAMAGE CONTROL STRIP (cycle 46) — the always-present heal spend, a
     * SIBLING of the card row rather than a member of it: never drawn, never
     * exhausted, never in `OwnShip.offer`, and addressed by the reserved
     * negative wire sentinel (`HEAL_CHOICE`), never by an offer index.
     *
     * A RAIL, AND NOW AN ACTUALLY CHOOSABLE ONE. Cycle 46 derived this geometry
     * from the 22px the card row left under itself at the 1280×614 logical
     * floor, and the result was a 16px seam at the 10px HUD-micro tier with a
     * shrunken 14px chip and ZERO vertical padding. It shipped flagged as
     * unratified draft, and Eric ruled on sight (amendment 68): *"its just plain
     * fucking tiny and hard to read/see. It doesn't even have any padding!"*,
     * with the binding requirement that the rail be *"big enough to actually
     * register as 'this is something I can choose' on all viewports."*
     *
     * The room came from lifting the band (see `bandTopFrac`) — Eric's own pick,
     * and the ONLY lever available, since the row is untouchable (four 216px
     * cards / 20px gaps / 924px / `CONFIG.offer.size` 4) and shrinking a card or
     * spending a card slot on heal were both declined. With 48px under the row
     * instead of 22px, every cycle-46 compromise is retired:
     *
     *   • the key chip returns to the ONE 22px family (hotbar / helm / card
     *     digits) — "a 22px chip cannot fit a 16px rail" was true of a 16px rail
     *     and is moot at 40px, so the DESIGN.md "proportional below" carve-out
     *     the ledger flagged dies with this cycle;
     *   • type clears amendment 15's 14px legibility floor with a step to spare
     *     (16px — the rail is a peer of the whole ROW, not of a card's category
     *     tag, and the fit model says the widest copy spends only ~705 of 894
     *     available px, so the larger register costs nothing on either axis);
     *   • the rail gets real vertical padding, which is what makes it read as a
     *     pressable thing rather than a seam.
     *
     * The container-fit law (amendment 47) still governs both axes and is still
     * proven by arithmetic in ui/refitCardFit.ts, not by hope.
     */
    /** Rail height (px) — the strip's whole box, borders included. 22px chip +
     *  2×`stripPadY` + 2×1px border = 40, so the chip sets the height. */
    stripHeight: 40,
    /**
     * Seam (px) between the card row's bottom edge and the rail's top edge.
     * 2 → 6: at 2px the rail read as part of the row's own border rather than
     * as a separate, pressable sibling.
     *
     * WHY 6 AND NOT THE `spacing.sm` 8 IT WANTS TO BE. The band is positioned
     * in PHYSICAL px (`place()` reads `window.innerHeight`) but its contents
     * are CSS-scaled by `--hc-ui-scale`, so at the 125% tier the band's real
     * footprint is 1.25 × its laid-out height while its anchor is not scaled.
     * At a 1600×768 viewport — the 125% tier's own gate is width-only, so that
     * viewport can select it — an 8px seam puts the rail's bottom edge 1.5px
     * past the screen, an amendment-47 violation. 6px lands it at 767 of 768.
     * The two px come out of the seam rather than the rail because the rail's
     * height, chip, type and padding are the whole point of the retune. The
     * anchor↔scale mismatch itself is a PRE-EXISTING defect, ledgered — this
     * value keeps the shipped geometry legal in the meantime, and the scaled
     * case is now pinned so it can never silently regress again.
     */
    stripGap: 6,
    /** The rail's key chip (px) — the ONE key-chip family, at family size. */
    stripKeyChip: 22,
    /** Type size (px) for every mark on the rail. Above amendment 15's 14px
     *  floor, and 16×0.9 = 14.4 clears the 9px mono floor at the 90% tier. */
    stripFontSize: 16,
    /** Inner padding (px) at the rail's left/right ends. */
    stripPad: 14,
    /** Inner padding (px) at the rail's top/bottom — the knob cycle 46 did not
     *  have room to have at all (`padding: 0 8px`). */
    stripPadY: 8,
    /** Gap (px) between the rail's columns (chip · label · readout · status). */
    stripColGap: 14,
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
    /** DAMAGE CONTROL's incoming-HP band (cycle 46): the still-draining regen
     *  pool (`OwnShip.repairHp`) painted as a dimmed segment sitting directly
     *  ON TOP of the live fill, in the fill's own color. Dual-coded by
     *  POSITION + geometry (a distinct band above the fill line), never by hue
     *  alone, and deliberately STATIC — it adds no new pulse to a rail whose
     *  breathing is already the accessibility-capped alarm channel. */
    railPendingAlpha: 0.32,
    /** BASE fill alpha. This is INFORMATION, not motion: it is exactly what the
     *  rail holds at motion=off, and the pulse only breathes around it. */
    railFillAlpha: 0.85,
    /** Soft bloom around the fill (same breathing alpha as the fill). */
    railGlowAlpha: 0.35,
    railGlowPx: 3,
    /** Threshold bands as a fraction of maxHp — EXCLUSIVE lower bounds for the
     *  better color: frac ≥ amberBelow phosphor, ≥ criticalBelow amber, below
     *  that damageMarker.
     *
     *  STORY 4.4 (amendment 41) — THESE ARE NO LONGER LOCAL NUMBERS. The rail's
     *  own shipped 0.5 / 0.25 were PROMOTED VERBATIM to shared
     *  `CONFIG.damageBands` the moment the server started deciding wounded smoke
     *  from them, and this block now REFERENCES that promotion rather than
     *  restating it. Binding: exactly ONE set of band numbers may exist in the
     *  codebase, so a future retune of the rail moves the smoke tiers with it and
     *  the two can never silently fork. Light plume ⇔ this rail has gone amber;
     *  heavy plume ⇔ it has gone crimson. Do not re-inline the literals. */
    amberBelow: CONFIG.damageBands.amberBelow,
    criticalBelow: CONFIG.damageBands.criticalBelow,
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
    /** VICTIM TELLS (Story 2.9): the SLOWED / DAZZLED status lines stacked above
     *  the cluster, sharing the IN STORM satellite column. `tellAbove` is the
     *  FIRST tell's baseline in px above the cluster's top edge — one satellite
     *  slot above IN STORM (stormAbove) — and `tellGap` stacks any second line
     *  above the first. `tellSize` is the mono size the fit pin measures. */
    tellAbove: 48,
    tellGap: 22,
    tellSize: 16,
    tellSpacing: 1.5,
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

  /**
   * STAR-SHELL ZONE IDENTITY (Story 2.9, amendment 50): a lit zone reads as its
   * DOCTRINE for every observer — the one thing on the wire that says what a
   * build is doing, because the zone IS observable behavior (Eric's counterplay-
   * over-concealment ruling). The firer's personal hue always owns the RING (a
   * zone still says WHOSE it is); the doctrine layers INSIDE it.
   */
  litZone: {
    /** INCENDIARY: an ember disc inside the ring, at this fraction of the zone
     *  radius, breathing between (base ∓ amp) alpha at `emberHz` — well under
     *  `settings.pulseCapHz` and nowhere near the ≤3 flashes/s ceiling. The
     *  disc itself (position + extent) is the information and holds at
     *  motion=off; only the breath is motion. */
    emberFrac: 0.72,
    emberAlpha: 0.16,
    emberAmp: 0.07,
    emberHz: 0.5,
    /** DAZZLE: a brighter core disc + a softer outer halo — STATIC (the doctrine
     *  is a flash-blind, and a flickering one would be the exact hazard the
     *  flash budget exists to prevent).
     *
     *  BOTH FRACTIONS ARE <= 1: the glare lives INSIDE the zone's true circle.
     *  The wire radius `r` is the hazard's real extent and the firer-hue ring at
     *  `r` is its boundary; a halo painted past that (the 1.28 draft) advertised
     *  a flash-blind over water that is not dazzling — the same class of lie as
     *  a marker drawn bigger than the thing it marks (amendment 47). The halo
     *  now stops just short of the ring so the boundary stays the ring's. */
    glareFrac: 0.5,
    glareAlpha: 0.2,
    haloFrac: 0.95,
    haloAlpha: 0.09,
    /** A burn tick is a DoT, not a slam: the victim's shake is scaled to this
     *  fraction of an ordinary hit's so standing in fire nudges instead of
     *  hammering (the tone + the zone under the hull carry the information). */
    burnShakeScale: 0.35,
  },

  /**
   * Radar blip render knobs. Story 2.3 added the colorblind-assist channel;
   * Story 4.2 (FR14, amendments 7-13) replaced the soft dot with the ship's
   * TRUE-SCALE hull silhouette — so every size knob here is gone: the blip's
   * footprint IS the hull footprint, straight off the shared
   * `hullSilhouette()` polygon, and no blip-specific geometry exists anywhere.
   * What remains is persistence, the speed vector, and legibility.
   */
  blip: {
    /** How many SWEEP PERIODS a paint lives (amendment 9): the live paint plus
     *  `persistSweeps − 1` decaying ghosts. Long-persistence phosphor is how
     *  course and speed are actually plotted off a scope — and ghost SPACING
     *  encodes speed for free (a fast hull's ghosts sit nose-to-tail, a
     *  loitering hull's overlap into a blob). ~12s of track at 15rpm. */
    persistSweeps: 3,
    /** Live paints retained per CONTACT id. The 4th paint of an id releases
     *  that id's oldest, so a busy contact can never crowd the scope: the cap
     *  is per-track, not just the global backstop. Matches persistSweeps —
     *  one sweep, one paint — but is a separate knob because the two answer
     *  different questions (how long a track lives vs how long it is). */
    paintsPerContact: 3,
    /** Minimum alpha a decayed blip may reach while it is still alive. 0 is the
     *  base behavior (linear fade to nothing over the full life); the assist
     *  raises the floor so a cooling blip never fades to near-invisible. */
    minAlpha: 0,
    /** The assist's raised minimum decayed-blip alpha. */
    assistMinAlpha: 0.35,
    /** Neutral-grey multiplier a paint COOLS to (1 = fresh/white). The tint is
     *  greyscale on purpose: the blip's COLOR is now an information channel
     *  (owner hue / drone grey), so the shipped bright→dark phosphor ramp had
     *  to become a hue-PRESERVING dim or it would have erased the very hue
     *  Story 4.2 adds. A fresh paint still pops hotter than a 1s-old one,
     *  which a 12s linear alpha ramp alone could never deliver.
     *
     *  BOTH GRAMMARS COOL THROUGH THIS RAMP AS OF AMENDMENT 74. The `return`
     *  echo was monochrome when it shipped, so it decayed on the color-SETTING
     *  `blipTint`; now that hue carries return strength (`returns.ramp` below)
     *  that wiring would erase the scale exactly as it would have erased the
     *  personal hue here. Same trap, second grammar, same answer. */
    coolFloor: 0.55,
    /** WCAG relative-luminance floor a blip's hue is lifted to (amendment 13,
     *  render/blipMarks.luminanceFloor — ALGORITHMIC, no per-hue table). A 1px
     *  hairline carries far less light than the hull view's 1.5px stroke over a
     *  solid fill, so the dark end of the wheel (cobalt ~0.19 at full value,
     *  azure, mulberry, lagoon) would sink into the fogged ocean unlifted. The
     *  bright half of the wheel is already above this and returns untouched. */
    lumaFloor: 0.3,
    /** The colorblind assist's raised luminance floor. `pixelLine` strokes are
     *  exactly 1 screen px by construction and IGNORE width, so the assist
     *  cannot thicken an outline — it boosts it in the only two channels a
     *  hairline has: this floor and `assistMinAlpha` (amendment 18's intent,
     *  carried onto the outline grammar). The old hard OUTLINE RING is retired
     *  with the soft dot that needed it: every blip is now a hard outline. */
    assistLumaFloor: 0.45,
    /** The assist's raised COOLING floor. Review catch: the luminance floor is
     *  baked into the stroke color ONCE at draw, but `blipCool` then multiplies
     *  every channel down to `coolFloor` — which drags a lifted cobalt/azure
     *  ghost back to roughly a quarter of its floor in linear light, BELOW even
     *  the base floor, for the last ~70% of its 12s life. That silently undid
     *  the assist for exactly the hues it exists to rescue. Cooling still runs
     *  for the assist (the fresh-vs-ghost read matters just as much there), but
     *  on a much shallower ramp so the floor survives the whole paint. */
    assistCoolFloor: 0.85,
    /** ARPA speed-vector geometry (amendment 10), world units — see
     *  render/blipMarks.speedVector. */
    vector: {
      /** Seconds of travel the shaft represents: the tip IS where the contact
       *  will be in this long, which is the ARPA convention and makes the mark
       *  a deduction input rather than decoration. A 35 u/s battleship gets
       *  ~52.5u — a bit under half a hull length.
       *
       *  RETUNED 3 → 1.5 (Eric ruling 2026-08-04, the weapon balance pass): the
       *  Story 4.2 vector drew long enough to overwhelm the silhouette it
       *  annotates. All THREE knobs halve together — halving `seconds` alone
       *  would leave the 24u floor dominating everything under 16 u/s and
       *  strand `maxLength` beyond any hull's reach. */
      seconds: 1.5,
      /** Shortest drawable shaft — a crawling contact still shows a course.
       *  Halved 24 → 12 with `seconds` (Eric ruling 2026-08-04). */
      minLength: 12,
      /** Longest drawable shaft. Above the fastest hull's 1.5s of travel (45
       *  u/s → 67.5u) plus upgrade headroom, so the clamp bites only on absurd
       *  speeds and never lets linework overwhelm the silhouette. Halved
       *  150 → 75 with `seconds` (Eric ruling 2026-08-04). */
      maxLength: 75,
      /** At or below this speed (u/s) NO vector is drawn — a stationary return
       *  has no course, and drawing the min-length stub for a decoy buoy
       *  (`speed` exactly 0) would have the RENDER invent the lie the wire
       *  deliberately refused to tell (amendment 11). */
      deadSpeed: 0.5,
      /** Arrowhead barb length. The terminal is what keeps the vector from
       *  sharing line grammar with a rotated hull outline (DESIGN.md). */
      barbLength: 9,
      /** Arrowhead half-angle (rad) between a barb and the shaft (~26°). */
      barbAngle: 0.45,
    },
    /**
     * `return`-GRAMMAR HEATMAP KNOBS (cycle 52, amendments 76-79 — superseding
     * cycle 51's polygon-blob knobs entirely). Inert unless the SERVER announces
     * `radarGrammar: 'return'` in the welcome — the grammar is a server flag
     * (amendment 63), never a client choice, because a client-side switch would
     * force the wire to carry the identity superset in both modes and reduce the
     * whole anti-cheat argument to cosmetics.
     *
     * Every value here is PRESENTATION. No wire field, no server work, no
     * perception-invariant surface: the server sends pure aspect geometry
     * (`ext`, world units, no range term) and the islands are already
     * client-known from the map seed, so everything below is computed on this
     * side of the wire. `PROTOCOL_VERSION` is untouched by this whole block.
     *
     * THE BASELINE IS EXPLICITLY TWEAKABLE and `bands` is the first thing Eric
     * will retune — he hedged the color ORDER himself ("Or whatever the ACTUAL
     * RADAR would look like"), so the array is ordered, self-describing, and a
     * reorder is one line. `persistSweeps`/`paintsPerContact` above are NOT in
     * that set — in `return` mode they are the entire course-and-speed channel
     * (amendment 67 kills the ARPA vector), so retuning them is a deliberate
     * post-playtest job.
     */
    heatmap: {
      /**
       * World units per bitmap cell — the buffer's resolution, and the ONE knob
       * that trades look against cost. At the base camera framing one cell is
       * ~5 screen px, which is deliberately chunky: a quantized bitmap should
       * read as a bitmap, not as a smooth glow.
       *
       * A REFERENCE SINCE CYCLE 63, NOT A LITERAL. The radar grid resolution is
       * gameplay-authoritative now — the server rasterizes a fogged hull's true
       * silhouette onto THIS lattice and sends coverage cells
       * (`ReturnBlipEvent`), so the cell size decides what the wire says. It
       * therefore lives in shared `CONFIG.vision.radarCellU` and is referenced
       * here; forking a second constant would let the client's buffer lattice
       * drift off the wire's cell indices and every footprint would land
       * misaligned.
       *
       * COST SCALES WITH VISIBLE AREA (cycle 58, amendment 99): the buffer
       * covers the VIEWPORT, not the radar ring, so zooming out costs more. The
       * cell counts below are exact for a 16:9 screen at 6u/cell — the world
       * extent depends only on aspect ratio and zoom, not on pixel resolution,
       * because the base zoom fits 2 × radar range to the short axis:
       *   1.5× (zoomed in)  272 × 160 = 44k cells, 170KB
       *   1.0× (base)       400 × 224 = 90k cells, 350KB
       *   0.5× (zoomed out) 800 × 448 = 358k cells, 1.4MB
       * Halving this knob QUADRUPLES every one of those numbers, so it is not a
       * free knob — and it is the lever to reach for if the zoomed-out case ever
       * needs to get cheaper.
       *
       * CYCLE 62 RE-MEASURED FROM SCRATCH, because the primitive changed and the
       * old table is void (amendments 99 + 144). A full `Radar.render` — a
       * generated 19-island map with its real height raster, six ship echoes, the
       * sea-clutter haze and a live storm wall, at the shipped 3-deep
       * persistence, warmed through three whole revolutions and then averaged
       * over 240 frames, in the headless test environment on one machine:
       *              cycle 61 (bakes)   cycle 62 (march)   + review gate
       *   1.5×          0.90 ms             0.55 ms           0.62 ms
       *   1.0×          1.10 ms             0.64 ms           0.70 ms
       *   0.5×          1.70 ms             1.28 ms           1.46 ms
       * (The middle column is the pre-gate build re-run on the SAME machine and
       * the same fixture as the third, so the last two are directly comparable;
       * the cycle-61 column is the figure of record from that cycle.)
       *
       * The march is CHEAPER than the primitive it replaces despite painting far
       * more of the world: per frame it walks only the arc the beam actually swept
       * (~3 rays at 60fps), and a slice stores only cells that can light a pixel,
       * where the retired bakes rescanned an island's whole bounding box on every
       * revolution and re-stamped a procedural clutter disc every frame for every
       * live haze. The steady state here is 374 live slices carrying ~17,200 cells
       * between them — about three revolutions' worth, exactly as `sliceRad` and
       * `persistSweeps` predict, and INDEPENDENT of frame rate.
       *
       * THE REVIEW GATE COST ~0.1 ms AT MIN ZOOM, and it is worth knowing where:
       * the ray step is now clamped to half a cell (3u rather than 4u at the
       * shipped `cellU`), which is 33% more samples per ray, and a land sample now
       * also probes the ship stamp so a hull against a coastline is not
       * suppressed. Both are per-SAMPLE costs, so they scale with the marched arc
       * and not with the buffer. What is left at min zoom is still dominated by
       * the buffer itself — `fill` plus quantize over 358k cells — which `cellU`
       * is the only lever on, and the whole frame stays well inside the 2.5 ms
       * min-zoom bar.
       */
      cellU: CONFIG.vision.radarCellU,
      /**
       * THE THREE COLORS AND THEIR THRESHOLDS (amendment 77) — ordered ASCENDING
       * by intensity, and the whole of the color contract. Below `bands[0].at` a
       * pixel is fully transparent; at or above a band's `at` it takes that
       * band's color VERBATIM. Nothing between here and the screen interpolates,
       * so a single object shows all three at once — a strong core reading red,
       * a fuzzier surround reading blue, an uncertain fringe reading green —
       * which is the entire point of the correction. Eric's mapping, verbatim in
       * his terms: red = "this is definitely a thing", blue = "probably a thing,
       * but fuzzy", green = "honestly not sure, could be something tiny".
       *
       * `alpha` is each band's PEAK opacity for a fresh pixel; the phosphor age
       * ramp scales it down from there. Age therefore rides opacity and NEVER
       * intensity — an age term in intensity would make one object drift red →
       * blue → green as it decayed, which is amendment 76's complaint re-created
       * on the time axis (see the `HeatGrid` comment in render/radarHeatmap.ts).
       *
       * ALL THREE DROPPED ~20% IN CYCLE 62 (0.5/0.7/0.9 → 0.4/0.56/0.72), Eric on
       * the 4.10 build: *"I definitely agree with the translucency, might make it
       * a tad more translucent"* (amendment 144). The RATIOS are untouched, so the
       * three registers still separate by opacity exactly as before; the whole
       * scale simply sits further off the water. It matters more now than it did
       * under the bakes, because the march paints the FULL extent of everything it
       * crosses rather than a near face — there is more ink on the chart, so each
       * mark can afford to be lighter.
       */
      bands: [
        { at: 0.12, color: COLORS.echoFaint, alpha: 0.4 },
        { at: 0.36, color: COLORS.echoFuzzy, alpha: 0.56 },
        { at: HEAT_RED_AT, color: COLORS.echoSolid, alpha: 0.72 },
      ],
      /**
       * THE SNR GRAIN (cycle 62, amendment 143) — per-cell intensity jitter whose
       * AMPLITUDE is a function of the intensity itself. This REPLACES the flat
       * `noise: 0.3` multiplier, and it is a correction rather than a retune:
       * Eric, on the speckle, *"I want whatever is realistic. Does the garmin
       * radar display, with its 3 colors, do this at all? Do that."* On a real set
       * a solid landmass returns a stable block of the strongest colour with a
       * graded fringe, and the grain lives in LOW SIGNAL-TO-NOISE returns — sea
       * clutter, rain, distant small targets, the partially-illuminated edges of
       * anything. The flat jitter had it backwards: it put static in the interior
       * of an island, the one place a scope is rock-steady, and it was also what
       * smeared intensity OFF the iso-height lines the colour bands are meant to
       * land on (amendment 142's diagnosis of why cycle 61's regions dithered
       * instead of following the contours).
       *
       * EVERY COEFFICIENT BOUND BELOW IS PROVED AGAINST THIS ENVELOPE, NOT THE OLD
       * ONE (amendment 135: a bound proved at nominal is not proved — and a bound
       * proved against a retired envelope is not proved either). The worst draw
       * for a material whose pre-grain intensity is `p` is
       * `p × (1 + amount × (1 − p/solidAt))`, and that is the expression every
       * bound below states.
       *
       * THE GRAIN IS A STABLE STENCIL, NOT SCINTILLATION. The march seeds it on
       * the ABSOLUTE world cell with ONE seed for the whole match
       * (`MARCH_SEED`, render/radarMarch.ts), so a given cell draws the same
       * multiplier on every revolution and a speckled fringe HOLDS STILL between
       * paints. That is required rather than incidental — independent per-paint
       * seeds re-create amendment 136's solid-disc bug under max-wins stacking —
       * and it is why nothing here describes the fringe as crawling.
       */
      noise: {
        /** Peak ± jitter at the detection floor. Higher than the retired flat 0.3
         *  on purpose: the grain now has to do all of its work at the weak end,
         *  where it is the only thing distinguishing "sea state" from "something
         *  tiny", and it costs nothing at the strong end because it is zero there.
         *  Raising it past ~0.5 starts to push the faintest legitimate echo
         *  (`model.minPeak` 0.2, worst draw 0.2 × (1 − 0.5 × 0.714) = 0.129) under
         *  `bands[0].at`, at which point a share of every weak contact's cells go
         *  permanently dark — not flickering, since the stencil is stable, but
         *  eaten, which is the same trap the retired knob carried. */
        amount: 0.45,
        /** Intensity at which the grain reaches exactly zero. Pinned to the RED
         *  threshold, so the rule reads as a sentence: anything strong enough to
         *  be called "definitely a thing" is drawn rock steady, and everything
         *  below it is graded by how marginal it is. */
        solidAt: HEAT_RED_AT,
      },
      /**
       * THE BEAM MARCH (cycle 62, amendments 138-140) — how the rays are spaced
       * and how far apart the samples on one ray are. These are RESOLUTION knobs
       * only: nothing here can change what a return READS, only whether the beam
       * finds it.
       */
      march: {
        /** Arc length (u) between adjacent rays AT THE TERMINUS. One cell, so the
         *  fan can never open a gap at the rim, which is the coarsest place on
         *  every ray and therefore the only place a gap can appear. The ANGLE is
         *  derived from this and the observer's radar range (render/radarMarch.ts
         *  `rayStep`), so a boon-scaled scope reaching ~2.01× base range simply
         *  fires more rays rather than painting stripes at its rim — a fixed angle
         *  would have to be tuned for the widest scope and then waste rays on
         *  every other one. At base range (660u) this works out at ~0.52°. */
        raySpacingU: 6,
        /** Bounds on that derived angle (rad). The floor (~0.17°) caps the ray
         *  count on an absurdly long scope; the ceiling (~1.15°) stops a
         *  degenerate near-zero range from fanning a revolution into a handful of
         *  spokes. Neither is reached at any shipped stat. */
        minRayRad: 0.003,
        maxRayRad: 0.02,
        /** How far a ray advances between samples (u) — two thirds of a cell, so
         *  consecutive samples land in the same cell or the next one and a ray
         *  cannot step over a cell it passes through. Samples that repeat a cell
         *  are priced once (the march dedups against the previous key), so the
         *  oversampling costs an integer compare rather than a field query. */
        stepU: 4,
        /**
         * The angular quantum ONE SLICE covers (rad, ~2.9°).
         *
         * SLICES ARE EMITTED PER QUANTUM, NOT PER FRAME, and that is the whole
         * reason this number exists: how many records are live at a given moment
         * then depends on the SWEEP RATE and the persistence depth and not at all
         * on the frame rate, so a 144Hz machine and a 30Hz machine hold the same
         * list and pay the same rasterization cost. At 15rpm this is ~124 slices
         * per revolution and ~373 live at the shipped 3-sweep persistence. Halving
         * it doubles both and lengthens the list without painting one extra cell;
         * the visible effect of raising it is that the leading edge of the paint
         * lags the drawn wedge by up to one quantum.
         */
        sliceRad: 0.0505,
        /**
         * The most beam (rad, ~23°) one frame may catch up on — about 250ms of
         * sweep at 15rpm, or 125ms at the boon-scaled `sweepRpmMax` of 30. Past
         * it the arc is SKIPPED: a backgrounded tab that resumes after a minute
         * must not stamp fifteen revolutions of slices into one frame, and every
         * paint it would have made is older than the phosphor life anyway.
         *
         * THE SCOPE STILL PAINTS AT EVERY FRAME RATE, and that is a property of
         * how the bound is applied rather than of this number. A late frame
         * resumes at `rot − catchUpArc`, NOT at the live beam, so the trailing
         * wedge is always marched; only the arc beyond the bound is dropped. The
         * shipped adapter resumed at the live beam, which meant a frame past the
         * bound emitted NOTHING — and a client sustained under ~3.9fps (~7.9fps
         * at 30rpm) then never emitted another slice at all and watched the scope
         * decay to bare water in ~12s. An earlier version of this comment claimed
         * "even a 4fps frame paints continuously"; that was true only of the
         * momentary case and false of the sustained one, and false at boon rpm
         * either way. See `planMarch` (render/radarMarch.ts) for the three
         * regimes.
         */
        catchUpRad: 0.4,
      },
      /**
       * THE PHYSICAL RETURN MODEL (Story 4.10, amendments 105-106, 118, 127-136;
       * re-tuned by cycle 62) — every coefficient and reference range the ONE
       * model needs. The math itself is render/radarFalloff.ts; this block is only
       * its tuning.
       *
       * ONE MODEL, THREE EXPONENTS. Intensity is always
       * `material coefficient × falloff(geometry) × grain`, and the exponent is
       * chosen by the TARGET'S GEOMETRY, never by its name: point/ship 1/d⁴,
       * surface/coast + clutter 1/d³, volume/storm 1/d². That is what makes the
       * taxonomy EMERGENT rather than a lookup — a warship blazes close and fades
       * far, a squall stays legible across the map, sea clutter hugs the ship
       * because its COEFFICIENT is tiny even though it falls off slowly
       * (amendment 105: colour is intensity, NEVER category).
       *
       * THE COEFFICIENTS ARE TUNED, NOT COPIED. Amendment 106 supplies a table
       * (steel 1.0, rock 0.5, mudflat 0.15, clutter 0.02) and says in as many
       * words that it is an assistant handwave and the first thing to tune. What
       * survived from it is the ORDERING and the rough RATIOS; the absolute values
       * below are fitted against the shipped band thresholds.
       */
      model: {
        /** Steel broadside — the table's 1.0 anchor, and the coefficient the
         *  crossover fit is solved against. Moving it re-fits `pointRef`. */
        ship: 1,
        /** Terrain at or above `refHeight`: a rock headland. Kept at 1 so genuine
         *  highland saturates RED — amendment 78's "big red mass", which the march
         *  now delivers across an island's whole extent rather than its near face. */
        landSteep: 1,
        /**
         * Terrain at sea level: a mudflat / low sandy island. THE WHOLE POINT of
         * amendment 129 is the gap between this and `landSteep` — two islands of
         * equal size, one high and one low, must NOT paint identically.
         *
         * LOWERED 0.35 → 0.3 by cycle 62, because this number now does the retired
         * `island.minLand`'s job as well as its own AND has to leave room for
         * amendment 77's headline requirement. Under the bakes a coast cell's
         * strength was `depth-solidity × height`, with `minLand` guaranteeing the
         * waterline still returned SOMETHING; the depth term is gone (amendment
         * 142 names it as what smeared intensity off the iso-height lines) and the
         * height field supplies the same grading for free, because the field IS at
         * sea level on the coast and climbs inland. So this coefficient is now the
         * whole of what a WATERLINE returns, and it is placed just under
         * `bands[1].at` on purpose: a real island then spans all three registers at
         * once — GREEN at the waterline, BLUE across its slopes, RED on genuine
         * highland — with every boundary landing on an iso-height line, which is
         * the "colour regions follow the contours" picture amendment 142 promises
         * comes free on a continuous field. At 0.45 a low coast would have opened
         * in blue and the green register would have belonged to sea clutter alone.
         *
         * LOWERED AGAIN, 0.3 → 0.27, BY THE CYCLE-62 REVIEW GATE, and the reason
         * is amendment 135 for the third time: 0.3 was proved against the band
         * threshold at NOMINAL and shipped over it. Both bounds are stated here
         * with the envelope factor explicit, as the standing rule requires — a
         * material of pre-grain intensity `p` draws worst at
         * `p × (1 + 0.45 × (1 − p/0.7))` and best at `p × (1 − 0.45 × (1 − p/0.7))`.
         *
         * BOTH ARE STATED AT `heightReflectivity(1)`, NOT AT THIS COEFFICIENT.
         * `landFlat` is the value at height ZERO, and there is no land at height
         * zero: the generator quantizes sea to 0 and seals the lowest LAND at 1,
         * so the faintest cell any island can produce is
         * `landFlat + (landSteep − landFlat)/refHeight` = 0.27 + 0.73/90 = 0.2781.
         * Bounding the coefficient instead of the material understates the worst
         * draw by a whole band's margin, which is how 0.28 passed a first pass of
         * this same fix and still painted blue.
         *
         * 1. THE WATERLINE IS NEVER BLUE — `refl(1) × (1 + a) < bands[1].at` →
         *    0.2781 × 1.2712 = 0.3535 < 0.36. At the shipped 0.3 this read 0.385:
         *    a sandbar could draw BLUE, contradicting the sentence above it and
         *    putting "probably a thing" on a mudflat. Attenuation is ≤ 1
         *    everywhere (it peaks at exactly 1 at zero range), so the bare
         *    coefficient IS the worst-case pre-grain intensity at every range.
         * 2. IT STILL OUTRANKS SEA STATE EVERYWHERE — the weakest land cell in the
         *    game (the waterline, at the 660u rim) is 0.2781 × 0.7315 = 0.2034
         *    pre-grain and draws worst at 0.2034 × 0.6808 = 0.1385, above the
         *    luckiest clutter cell's 0.1319. Land is never mistakable for water.
         *    This is the bound that stops the coefficient going lower; between
         *    the two, only about 0.265-0.275 is open.
         */
        landFlat: 0.27,
        /**
         * Breaking surf (SURFACE) — a weak seaward fringe on water within
         * `surfBandU` of land (`render/radarField.ts` `surfSample`). RESTORED
         * by the cycle-62 review gate: it shipped at cycle 60-61 riding the
         * per-object island bake, fell out unintentionally when that bake was
         * retired for the beam march, and Story 4.10 amendment 131 already
         * ratified its shape — Eric: *"I'd love to see some kind of waves up
         * against coastlines that would get painted green."*
         *
         * BOUNDED THE SAME WAY ITS SIBLINGS ARE, against cycle 62's SNR
         * envelope (amendment 135: a bound proved at nominal is not proved),
         * which hands a material of pre-grain intensity `p` a worst draw of
         * `p × (1 + 0.45 × (1 − p/0.7))` — see the `clutter` comment below for
         * the general form.
         *
         * 1. NEVER BLUE, AT ANY RANGE — `surf × (1 + a) < bands[1].at` →
         *    0.26 × 1.283 = 0.334 < 0.36. Attenuation is <= 1 everywhere (it
         *    peaks at exactly 1 at zero range), so the bare coefficient IS the
         *    worst-case pre-grain intensity — nothing closer to the observer
         *    can push it higher, at any range. A surf line that read blue
         *    would put "probably a thing" on open water, the same failure
         *    amendment 135 caught here at cycle 61's flat-noise bound.
         * 2. NEVER QUIETER THAN SEA CLUTTER — surf's UNLUCKIEST draw must
         *    still clear clutter's LUCKIEST one, so a coastline fringe can
         *    never read weaker than open-water haze even at the two
         *    materials' most adversarial draws: `surf × (1 − a) >
         *    clutter × (1 + a')` → 0.26 × 0.717 = 0.186 > 0.095 × 1.389 =
         *    0.132. A breaking coastline is physically a stronger scatterer
         *    than open sea state, and this is what makes that hold as a
         *    guarantee rather than as a coincidence of the nominal values.
         *
         * THE STRENGTH IS FLAT ACROSS THE BAND, WHICH IS A KNOWN GAP AGAINST
         * AMENDMENT 131's ruled *weak seaward fringe* — stated here rather than
         * left silent (the cycle-62 review gate caught it missing). The retired
         * per-object bake faded the band seaward; the pyramid read that replaced
         * it cannot, because the band is exactly ONE TILE (level 1, 28u) against
         * a 14u raster spacing, so every surf sample is within one raster sample
         * of land and there is no finer read to grade it with. Closing it needs
         * either a per-sample distance transform or a wider `surfBandU`, and
         * both are rulings rather than review-gate calls. `surfSample`
         * (render/radarField.ts) carries the full argument.
         *
         * Both bounds are asserted at the worst-case draw AND through a
         * rasterized band histogram at the shipped envelope in
         * __tests__/radarHeatmap.test.ts.
         */
        surf: 0.26,
        /**
         * Sea clutter. **DESIGN-LOAD-BEARING — NOT A FREE KNOB (amendments 130 +
         * 133 + 136).** This is the ONE coefficient here deliberately tuned to sit
         * ON a threshold rather than clear of one, and it satisfies THREE bounds
         * at once. All three are re-derived against cycle 62's SNR envelope, which
         * hands a material of pre-grain intensity `p` a worst draw of
         * `p × (1 + 0.45 × (1 − p/0.7))`; the flat ±30% every previous statement
         * of these bounds was proved against no longer exists (amendment 135).
         *
         * 1. STRADDLE — `peak × (1 − a) < bands[0].at < peak × (1 + a)` →
         *    0.095 × 0.611 = 0.058 < 0.12 < 0.095 × 1.389 = 0.132. That speckle IS
         *    the haze: roughly a sixth of the cells at the hull light and the rest
         *    stay dark. A coefficient safely ABOVE the threshold paints a solid
         *    uniform green disc around own hull (band colour is verbatim and alpha
         *    carries age, not intensity — every lit clutter cell is the same
         *    pixel), which reads as a drawn circle rather than as sea. A
         *    coefficient safely BELOW paints nothing at all, which is the defect
         *    amendment 133 exists to correct.
         * 2. NEVER BLUE — `peak × (1 + a) < bands[1].at` → 0.132 < 0.36. This is
         *    what discharges Eric's ruling that clutter is texture and may never
         *    hide a return. Green is "honestly not sure, could be something tiny",
         *    the correct register for sea state; blue would put "probably a thing"
         *    on empty water. Note `surf` above is bounded by exactly this rule,
         *    plus a second one keeping it from ever reading weaker than clutter.
         * 3. NEVER OUTRANKS THE FAINTEST LEGITIMATE ECHO — `peak × (1 + a) <
         *    minPeak × (1 − a')` → 0.132 < 0.2 × 0.679 = 0.136. `writeCell` is
         *    max-wins and hands the WINNER both the intensity AND the alpha, so a
         *    clutter cell that beat a decaying echo's core would also re-age it —
         *    a ghost would stop reading as a ghost. The envelope makes this bound
         *    TIGHTER than the flat jitter did, from both sides at once (the weak
         *    clutter cell earns MORE amplitude, the stronger echo less), which is
         *    exactly why the coefficient had to come down from 0.105.
         *
         * Raising this past the blue threshold is a DESIGN change requiring a
         * fresh ruling: Eric was shown "clutter strong enough to swallow weak
         * returns close in" as a real mechanic and DECLINED it. ALL THREE bounds
         * are asserted in __tests__/radarHeatmap.test.ts, at the worst-case draw
         * AND through a rasterized band histogram at the shipped envelope.
         */
        clutter: 0.095,
        /**
         * The storm wall. Bounded the same way its siblings are, against the same
         * envelope: `storm × (1 + a) < bands[2].at` → 0.5 × 1.129 = 0.564 < 0.7,
         * so the wall is a solid BLUE band with a green shoulder at every range
         * inside the scope and can never reach red at any draw. A hull is the only
         * thing on this scope allowed to be red.
         */
        storm: 0.5,
        /**
         * Reference range (u) of the POINT curve — SOLVED, never typed in. See
         * the HEAT_POINT_REF comment above the object: this is the only place in
         * the client that reads `CONFIG.vision.farRadar`, and it reads it to FIT
         * a curve rather than to compare against it.
         */
        pointRef: HEAT_POINT_REF,
        /**
         * Reference range (u) of the SURFACE curve (coastline).
         *
         * Deliberately LONGER than the point reference and on a shallower
         * exponent, which is the physics doing the work: an extended target's
         * illuminated area grows with range, so coastline holds its strength far
         * better than a hull does.
         *
         * RAISED 700 → 900 by cycle 62, and it is the same tuning target as
         * before rather than a new one: the retired island `gain` (1.4×) was what
         * kept a solid interior RED out to the 660u rim, and the gain went with
         * the bake that applied it. Putting the reference where the curve ALONE
         * clears `bands[2].at` at the rim (0.05 + 0.95/(1 + (660/900)³) = 0.73)
         * restores amendment 78's regression pin — a big tall island is a big red
         * mass, not one that is only red when you are on top of it — without a
         * second multiplier nobody could reason about. A FLAT island at the same
         * range lands at 0.45 × 0.73 = 0.33, i.e. green: the height channel is
         * still the thing that separates them.
         */
        surfaceRef: 900,
        /**
         * Reference range (u) of the SURFACE curve FOR SEA CLUTTER ONLY — and it
         * exists because amendment 130 requires the haze's concentration to fall
         * out of the 1/d³ curve rather than out of a hand-placed radius.
         *
         * On the shared `surfaceRef` the clutter return would still be at ~99% of
         * its peak at the compute bound, so the speckle density would hold flat
         * across the whole disc and then STOP at a hard circle — the drawn edge
         * the amendment forbids, dressed up as a falloff. At 150 the curve does
         * the work: 0.095 at the ship, and under the envelope the last cell able
         * to reach `bands[0].at` on its luckiest draw sits at ~72u. The haze ends
         * where the physics ends.
         */
        clutterRef: 150,
        /** Reference range (u) of the VOLUME curve (the storm wall). Longest of
         *  the three on the shallowest exponent: a squall genuinely does stay
         *  legible clear across the map, which is precisely why amendment 128
         *  paints the WALL and not the AREA — an area return under this curve
         *  would own half the scope late-match and bury every contact in it. */
        volumeRef: 900,
        /** Asymptotic floor shared by the SURFACE and VOLUME curves. Small for
         *  conditioning, and still an asymptote rather than a clamp, so two
         *  different ranges never attenuate identically (amendment 64's
         *  one-quantity-per-channel rule). */
        floor: 0.05,
        /** Asymptotic floor of the POINT curve — see HEAT_SHIP_ATTEN_FLOOR above
         *  for why the 1/d⁴ fit requires it to be this small, and why the floor
         *  SURVIVES the physics (amendment 127). */
        pointFloor: HEAT_SHIP_ATTEN_FLOOR,
        /** Attenuated ACROSS extent (u) whose return reads at full intensity —
         *  i.e. earns a red core. 60u is deliberately well under a broadside
         *  battleship (124u) and well over a bow-on needle: the scale has to
         *  SATURATE on genuinely big echoes rather than reserve its top end for a
         *  hull nobody ever presents. It is also the fit's normalizer (see
         *  HEAT_STRONG_EXTENT): moving it moves the red→blue crossover, which is
         *  why there is exactly one of it. It SURVIVES the kernel's deletion
         *  because it is what keeps ASPECT a strength channel and not merely a
         *  size one — amendment 127 is explicit that a bow-on hull must paint a
         *  weaker return, not just a smaller one. */
        strongExtent: HEAT_STRONG_EXTENT,
        /** Floor on a hull's intensity. Above `bands[0].at` with enough headroom
         *  that the grain cannot push the weakest legitimate return under the
         *  transparent threshold: 0.2 × (1 − 0.45 × (1 − 0.2/0.7)) = 0.136 > 0.12.
         *
         *  THIS IS THE REAL GUARANTEE, not the asymptote (amendment 127): radar
         *  range means ONE number for every hull, so anything the server blips —
         *  or any sighted hull the client synthesizes — still paints at least a
         *  green speck anywhere inside the scope, at any aspect, at any size.
         *  Dropping it so signature becomes stealth is a RULED-OUT design, not a
         *  realism correction; do not re-propose it. */
        minPeak: 0.2,
        /**
         * Quantized `HeightRaster` height (0-255) at which terrain reaches
         * `landSteep`. Measured against the shipped generator rather than
         * guessed: sampled interiors run min 0 / median ~26-45 / p90 ~97-143 /
         * max 255 across seeds, with per-island peaks from 7 (a sandbar) to 255
         * (a big ridge). 90 therefore puts genuine highland at full reflectivity
         * while leaving the low islands the whole gradient below it.
         *
         * THE GRADIENT IS CONTINUOUS AND MUST STAY SO (amendment 142). The raster
         * already carries 256 levels; clamping them to the four contour terraces
         * would cost an extra comparison chain to DISCARD 98% of the data, would
         * step Story 4.11's shadow lengths into four kinds of obstacle, and buys
         * nothing — on a continuous field a colour-band boundary IS an iso-height
         * line, so the regions land on the contours by construction.
         */
        refHeight: 90,
        /**
         * How far seaward of a coastline surf paints (u) — a THIN fringe, ~5
         * cells at the shipped `cellU`. Consumed by
         * `render/radarField.ts`'s `surfPyramidLevel` as a TILE SIZE target,
         * not a radius: the O(1) proximity test picks the max-height pyramid
         * level whose tile size is closest to this number — level 1 (28u,
         * `TERRAIN_PARAMS.cell` 14 doubled once) against this 30u target,
         * beating level 0 (14u, |14-30|=16) and level 2 (56u, |56-30|=26) —
         * and reads exactly one `tileCeilingAt` per water sample: never a
         * neighbourhood scan, never a polygon test.
         *
         * THE RESULTING BAND IS TILE-ALIGNED, NOT A TRUE RADIAL DISTANCE, and
         * that is an intentional trade, not a defect to "fix" into a
         * per-sample distance transform: a water sample near a tile corner
         * can be lit by land the read never sees (it belongs to a
         * neighbouring tile), so the fringe's width varies a little around
         * the coast as the tile grid falls where it falls. Surf is a
         * decorative fringe, not a ranging instrument, and the pyramid's own
         * grain hides the tiling.
         */
        surfBandU: 30,
        /**
         * PURE COMPUTE bound (u) on the clutter disc — and with `clutterRef` in
         * place, NOTHING IS VISIBLE AT IT. The haze's own curve takes even the
         * luckiest draw below `bands[0].at` at ~72u, so the fade is decided by the
         * falloff exactly as amendment 130 requires and this number only decides
         * where the march stops asking the field about cells that cannot light.
         * 100u leaves ~28u of slack past the last lit cell, so a retune of
         * `clutter`, the grain or `bands[0].at` has room to move before the disc
         * edge could become visible.
         */
        clutterRangeU: 100,
        /** Full thickness (u) of the storm wall band, centred on the live ring
         *  radius. A fixed thickness is the whole of amendment 128: the wall is a
         *  physical object of its own size, not a region whose extent grows as
         *  the ring closes. */
        stormBandU: 60,
      },
    },
  },

  /**
   * WOUNDED SMOKE presentation (Story 4.4, amendments 41-47). Every knob here is
   * CLIENT-ONLY: the server emits anonymous `{k,x,y,tier}` pulses on the shared
   * `CONFIG.smoke.puffIntervalMs` cadence and keeps NO plume history at all, so
   * the persistence is entirely synthesized here — the phosphor blip's shipped
   * arrangement (`blip` above), applied to a second anonymous pulse.
   *
   * There is no reach knob and no band knob on purpose: reach is
   * `CONFIG.vision.muzzleFlash` (amendment 42) and the tiers are
   * `CONFIG.damageBands` (amendment 41), both server-side. Nothing in this block
   * may become gameplay-authoritative — it decides how the plume LOOKS, never
   * who sees it or when.
   */
  smoke: {
    /**
     * How long one puff lives, ms. **DESIGN-LOAD-BEARING — NOT A FREE KNOB.**
     * Puffs are emitted at the hull's position, so a moving ship necessarily
     * leaves them behind, and this number is the ONLY thing separating amendment
     * 43's attached plume from the decaying TRACK that ruling explicitly
     * rejected (a track would encode course, speed and origin — a strictly
     * larger disclosure than "a hull is hurt, right there").
     *
     * The arithmetic: the fastest hull is the Torpedo Boat at 45 u/s (55
     * boosted) and is ~100u long, so 1400ms leaves a ~63u tail (77u boosted) —
     * comfortably inside ONE hull length, which reads as smoke blowing off the
     * stern rather than a line to follow. At the 250ms server cadence that is
     * ~6 live puffs forming the column. RAISING THIS IS A DESIGN CHANGE
     * REQUIRING A RULING, not a tuning call.
     */
    puffLifeMs: 1400,
    /** Fraction of a puff's life over which it blooms in to full opacity; it
     *  fades linearly to nothing across the whole life from there. A puff that
     *  appeared at full strength would pop, and the newest puff is the one
     *  sitting on the hull. */
    riseFraction: 0.15,
    /**
     * Global backstop on live puffs — the ONLY cap that exists. Per-source
     * capping is impossible BY CONSTRUCTION: amendment 45 forbids any
     * correlation handle on the wire (no id, no alias, no stable anonymous
     * key), so puffs cannot be grouped by the hull that made them and no key
     * may be invented to do it. Oldest-inserted is evicted first (`capOldest`).
     *
     * Sized for the worst legitimate case: 20 hulls all smoking at once × ~6
     * live puffs each = 120, doubled for the heavy tier's second puff = 240,
     * so 256 keeps this a genuine backstop rather than the thing that trims a
     * legitimate screen. Its real job is the backgrounded tab, where network
     * pulses keep arriving while the render loop that ages them is throttled —
     * `document.hidden` at the spawn site is the companion measure.
     */
    maxPuffs: 256,
    /**
     * The wind, u/s. A single FIXED drift vector, deliberately not derived from
     * `welcome.mapSeed`: it is pure decoration, never gameplay-authoritative,
     * and a per-map wind would buy a wire dependency for zero gameplay gain.
     * Scaled by the motion setting at the callsite, so `off` stills the drift —
     * which removes MOTION only: presence, extent and tier are untouched.
     */
    wind: { x: 11, y: -6 },
    /** BILLOW: a slow radius wobble so a column looks alive rather than
     *  stamped. Amplitude is a fraction of the puff's radius and is
     *  motion-scaled, so `off` leaves the puff at exactly its base extent. */
    billowHz: 0.45,
    billowAmp: 0.12,
    /**
     * PER-TIER VISUALS. The two tiers must be unmistakable at a glance, so they
     * differ in all three available channels at once — puff COUNT, radius RAMP,
     * and peak ALPHA. A heavy plume is roughly twice as wide, twice as dense
     * and twice as opaque as a light one; nothing about severity rides on hue
     * (both draw in `colors.woundedSmoke`), because the tier must survive a
     * colorblind read exactly as the HP rail's dual-coded bands do.
     */
    light: {
      /** Puffs spawned per `sm` pulse. */
      puffs: 1,
      /** Radius at birth → radius at death, u (smoke expands as it disperses). */
      r0: 5,
      r1: 17,
      /** Peak opacity (at the top of the bloom-in ramp). */
      peakAlpha: 0.3,
      /** Age head-start, ms, applied to the Nth extra puff of one pulse so a
       *  multi-puff tier reads as depth rather than one hard-edged stamp. */
      stagger: 0,
    },
    heavy: {
      puffs: 2,
      r0: 8,
      r1: 34,
      peakAlpha: 0.58,
      stagger: 300,
    },
  },

  /**
   * THE FOGHORN's presentation (Story 4.5, amendments 51-58; rebased onto the
   * EIGHTHS LADDER by Story 4.9, amendment 122). Every knob here is
   * CLIENT-ONLY. The one gameplay-authoritative foghorn number —
   * `CONFIG.foghorn.cooldownMs` — is DELIBERATELY ABSENT: the press gate in
   * main.ts reads it straight off shared CONFIG, because a second copy of a
   * gameplay number is exactly what amendment 41 (the `damageBands` precedent)
   * forbids. Reach is absent for the same reason — the volume BANDS are
   * resolved SERVER-side from the listener's own intel range (amendment 122)
   * and arrive pre-decided as `v`; nothing here may decide who hears what.
   */
  foghorn: {
    /**
     * WIRE BAND → AUDIO GAIN. Which eighth of the LISTENER's own intel range
     * the honker sits in (1 = innermost, 8 = the radar edge), resolved by the
     * server; this table only says how loud each band plays.
     *
     * THE CURVE IS FLAT AT FULL VOLUME THROUGH TRUESIGHT (band 4 = 330u at
     * base stats) and then steps down 12.5 percentage points per band — one
     * eighth of FULL SCALE, i.e. one quarter of the 100→50% span, in four steps
     * — to the radar edge (band 8 = 660u at base). BOTH ANCHORS ARE ERIC'S
     * ORIGINAL FOGHORN RULING — *"within truesight range at full volume"* and
     * 50% at the radar edge — and must survive any retune of the middle.
     *
     * An unknown/absent band is the caller's problem (roomBindings falls back
     * to full gain for the self and spectator shapes, which carry no band).
     */
    bandGain: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 0.875, 6: 0.75, 7: 0.625, 8: 0.5 },
    /**
     * THE SCREEN-EDGE CHEVRON (amendment 55) — the honk's visual twin and the
     * bearing surface amendment 4 said this story had to grow. Rejected
     * alternatives (an arc tick on the truesight ring; reviving the 48-pip
     * compass rose) are recorded in the amendment; this surface is deliberately
     * foghorn-shaped, not sensor-shaped.
     *
     * UX-DR36 BINDING, and it is why `popMs`/`popScale` are the ONLY
     * motion-scaled knobs in this block: the chevron's PRESENCE, DIRECTION and
     * BAND WEIGHT are INFORMATION and survive `motion: 'off'` intact. The TTL
     * fade is not "motion" either — it is how long the fact stays true.
     */
    chevron: {
      /** How far in from the viewport edge the mark is pinned, px. Big enough
       *  that the whole glyph clears the edge at every band size below. */
      insetPx: 54,
      /** How long one chevron lives, ms — the ~1.2s amendment 55 named. Aged
       *  against SERVER time (the smoke.ts precedent), never accumulated dt. */
      ttlMs: 1200,
      /**
       * Global backstop on live chevrons. Per-source capping is impossible by
       * construction — the wire carries NO correlation handle (amendment 51
       * applies amendment 45's rule verbatim), so marks cannot be grouped by
       * the hull that made them. Sized past the worst legitimate case: 20 hulls
       * × a 1.5s cooldown against a 1.2s TTL means at most ~16 can overlap, and
       * a screen with 16 live bearings is already noise — 8 keeps the newest
       * facts and drops the stale ones (`capOldest`).
       */
      maxMarks: 8,
      /** POP-IN: the one animated flourish, and the only motion-scaled knob
       *  here. At `motion: 'off'` the chevron simply appears at true size —
       *  same place, same weight, same fade. */
      popMs: 140,
      popScale: 1.4,
      /**
       * PER-BAND WEIGHT — the foghorn's VISUAL TWIN, derived from the SAME
       * curve as `bandGain` above (Story 4.9). The bands must be separable at
       * a glance without hue (the wounded-smoke rule: severity survives a
       * colorblind read), so they differ in SIZE, STROKE and ALPHA at once.
       * Size is the half-width of the chevron's arms in px.
       *
       * THE TWO ANCHORS ARE TODAY'S SHIPPED LOOK, UNCHANGED. Bands 1-4 carry
       * the old tier-1 weight EXACTLY (22 / 3 / 0.95) — flat through truesight,
       * exactly as the gain is — and band 8 carries the old tier-3 weight
       * EXACTLY (13 / 1.8 / 0.5) at the radar edge. Bands 5-7 are the linear
       * interpolation between them at the gain curve's own fractions
       * (k = (band - 4) / 4), so the mark's weight and the honk's loudness
       * step together. Only the MIDDLE gained resolution; nothing about the
       * shipped grammar moved. `__tests__/foghorn.test.ts` pins both anchors
       * and the interpolation, so a retune cannot drift one without the other.
       */
      bands: {
        1: { size: 22, thickness: 3, alpha: 0.95 },
        2: { size: 22, thickness: 3, alpha: 0.95 },
        3: { size: 22, thickness: 3, alpha: 0.95 },
        4: { size: 22, thickness: 3, alpha: 0.95 },
        5: { size: 19.75, thickness: 2.7, alpha: 0.8375 },
        6: { size: 17.5, thickness: 2.4, alpha: 0.725 },
        7: { size: 15.25, thickness: 2.1, alpha: 0.6125 },
        8: { size: 13, thickness: 1.8, alpha: 0.5 },
      },
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

// VARIANT P IS RETIRED (cycle 51, amendment 63). The build-time
// `__BLIP_VARIANT_P__` define and its `BLIP_VARIANT_P` export lived here to A/B
// a phosphor-anonymous scope against the personal-hue one. Both are superseded
// by the SERVER-side flag pair `HC_RADAR_GRAMMAR` / `HC_RADAR_IDENTITY`, which
// answers the same question properly: a client-side variant could only ever
// repaint a wire that still carried class, heading, speed and roster identity,
// so it was cosmetics — the server flags actually delete those fields.
