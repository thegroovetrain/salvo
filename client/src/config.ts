// Client-only tunables. These are render/feel constants that never travel on
// the wire and are not part of the shared simulation CONFIG (that stays the
// single source of truth for anything gameplay-authoritative). If a value here
// starts to feel gameplay-load-bearing, promote it to shared CONFIG instead.

import { CONFIG, HULL_IDS, SHIP_CLASS_IDS, type DropKind, type FoghornEvent } from '@salvo/shared';
import { hullTopSpeed } from './sim/hullKinematics.js';
import {
  SURFACE,
  fitGrainScale,
  fitMaterialRef,
  fitPointRef,
  noiseAmplitude,
  worstDrawIntensity,
  type NoiseEnvelope,
} from './render/radarFalloff.js';

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
  /** The ARMOR airdrop crate's pink (Eric 2026-11-09, "make Armor pink").
   *  Minted for the crate: no pink token existed (the Pride skin is unbuilt)
   *  and the Regatta's `player-rose` #F8118D is a COMBATANT hue, so reusing it
   *  would let a crate read as a captain's hull. 6.61:1 on `void` (≥ 3:1
   *  graphic bar, and ≥ 4.5:1 text-safe). */
  pink: 0xff4fa3,
  info: 0x38bdf8,
  danger: 0x8b2020,
  denied: 0xff3b3b, // the single denied red (consolidates the legacy DOM red)
  damage: 0x8b0000,
  damageMarker: 0xff6666,
  /** FOULING SHELL foul-zone SLICK (Story 9.4, Eric's "weed and net", round-3
   *  pick "bold", 2026-10-12): the wounded-smoke brown, LIGHTER than the sea.
   *  The ocean is drawn near-black, so a darkening murk was invisible; the
   *  slick is a faint lighter body under the net and the weed. Feel token;
   *  Eric may re-tune on staging. */
  foulSlick: 0x7a7168,
  /** FOULING SHELL foul-zone WEED squiggles (Story 9.4, "weed and net"): a
   *  light warm grey from the countermeasure-smoke family, drawn normal-blend
   *  over the net. Feel token; Eric may re-tune on staging. */
  foulWeed: 0xc4c0b8,
  // `islandFill` / `islandStroke` (the provisional yellow) are GONE as of cycle
  // 82. DESIGN.md:41 marked them a "provisional carry-over — Open Question";
  // cycle 59 took the in-match chart off them, and the home scene — their last
  // consumer — now renders its terrain through the same hypsometric `terrain`
  // ramp below. Removed end to end in the cycle-69 style so no dead token
  // survives; the DESIGN.md Open Question is resolved BY DELETION and the
  // doc-sync is ledgered in deferred-work.md (design docs are not edited
  // in-story).
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
  // THE THREE RADAR REGISTERS ARE PURE PRIMARIES, BY RULING (cycle 65). Eric:
  // *"Red is #FF0000, green is #00FF00, blue is #0000FF, each of them
  // CONSISTENTLY at 0.8 alpha."* Not tinted, not hue-shifted toward the phosphor
  // palette, not softened — the scope is an instrument readout, and these three
  // are the readout. Drawn at `blip.heatmap.bandAlpha` (0.8) regardless of which
  // register a pixel lands in; the ONLY thing that moves their opacity is age.
  echoFaint: 0x00ff00, // "honestly not sure, could be something tiny" — green
  echoFuzzy: 0x0000ff, // "probably a thing, but fuzzy" — blue
  echoSolid: 0xff0000, // "this is definitely a thing" — red
  // THERE IS NO FOURTH APPEARANCE ON THE SCOPE (cycle 69). Story 4.11 added an
  // `echoNoData` grey here — a fourth token drawn wherever terrain had shadowed
  // the beam. Eric, on the shipped 0.17.68 build: *"i don't like the grey showing
  // radar shadow, i think its better to just leave it uncolored and infer there's
  // a shadow there because you can't see behind it and half the island is cut
  // off."* That REVERSES amendment 180, which was his own earlier call taken
  // before he had seen it on the water. The token is deleted rather than unused:
  // a shadow is unpainted scope, and the three registers above are the whole
  // grammar again.
  // combat effects
  splash: 0xb8ccc6, // miss splash — replaces retired #66FFAA double-duty
  muzzle: 0xe8f2ec,
  torpedo: 0xcfe8dd, // torpedo on-water render
  hitBloom: 0xff9d3d,
  woundedSmoke: 0x7a7168,
  // The MULTI-SPECTRAL COUNTERMEASURE haze (Story 9.3 session 3, Eric 2026-10-12 reference: light grey smoke with real contrast on the dark water) — NOT the wounded plume grey.
  countermeasureSmoke: 0xc4c0b8,
  // FOG BANKS (Story 9.10, Eric's pick B "Wisps", 2026-10-15): a pale warm grey, LIGHTER than the countermeasure haze so weather never reads as a deployed smoke screen; the wisps' per-puff shades multiply it (CLIENT_CONFIG.fogField shadeMin/shadeMax).
  fogBank: 0xdcdad4,
  // utility — technical, non-role uses only (stage clear color, Pixi tint reset,
  // fog inverse mask). Never a design surface/text color.
  black: 0x000000,
  white: 0xffffff,
  // ALERTS ON THE WATER (Story 9.11, epic-9 amendments 152–153): an enemy
  // mine and another captain's zone ring breathe between these two on one
  // shared 1 Hz phase (render/alertBlend.ts); own = `white`; motion off holds
  // at `alertOrange`. Eric picked pair B of three on the rendered page (2026-10-16,
  // epic-9 amendment 181): hot yellow / deep orange.
  alertYellow: 0xfff04d,
  alertOrange: 0xff5a00,
  // RELATION COLORS (Story 10.4, Eric's ruling R6 — the 20-hue wheel, its
  // fills and the colorblind-assist families are gone everywhere). Every
  // ship's linework reads ONE relation: own = cyan, enemy = red (the 10.4
  // design-sitting page's candidates). render/relationColor.ts is the single
  // rule; the dark interior fill is derived there (`CLIENT_CONFIG.ship.relationFillValue`).
  relationOwn: 0x00e8ff,
  relationEnemy: 0xff2a2a,
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
// These three live OUTSIDE the object literal for one reason: `pointRef` is
// SOLVED from two of them, and a self-reference inside an object literal is not
// expressible. They are the single source for the values below — nothing
// re-states them.
//
// THERE USED TO BE A FOURTH, `HEAT_STRONG_EXTENT` (60u). It normalized an
// aspect-projected extent term inside a hull's reflectivity, and cycle 67
// deleted both (amendments 171-175): the coverage mask already carries aspect,
// so scaling colour by extent as well was the same physics counted twice.

/** The RED->BLUE boundary: `bands[2].at`, the intensity a hull must land on
 *  exactly at the far-radar anchor (`CONFIG.vision.farRadar`, 8/12 of intel
 *  range since Story 9.8). Stated once, used twice. */
const HEAT_RED_AT = 0.7;

/** The GREEN->BLUE boundary: `bands[1].at`. */
const HEAT_BLUE_AT = 0.36;

/** The TRANSPARENCY threshold: `bands[0].at`. Below it a cell draws nothing at
 *  all, which makes it the rail every weak material is calibrated against —
 *  hoisted out of the band table by Story 4.12 so the wake corridor can be
 *  DERIVED from it rather than restating it. */
const HEAT_GREEN_AT = 0.12;

/** The floor on a hull's intensity (`model.minPeak`, amendment 127) — hoisted
 *  for the same reason: the wake's ceiling is this material's WORST DRAW, and
 *  the two must move together. */
const HEAT_MIN_PEAK = 0.2;

/** Asymptotic floor shared by the SURFACE and VOLUME curves — hoisted so the
 *  wake's reach fit and `model.floor` cannot state it twice and drift. */
const HEAT_SURFACE_FLOOR = 0.05;

/** The SNR envelope (amendment 143), stated once. `model` reads it to derive
 *  the wake corridor, `noise` publishes it, and every bound test proves against
 *  a re-implementation of it rather than against this object. */
const HEAT_NOISE: NoiseEnvelope = { amount: 0.45, solidAt: HEAT_RED_AT };

/**
 * Asymptotic floor of the POINT (1/d^4) curve — LOWERED 0.45 -> 0.02 by this
 * story, and the reason is arithmetic, not taste.
 *
 * The fit solves `A = bands[2].at / ship` for the attenuation required at the
 * crossover — at the shipped steel coefficient that is 0.7 — and then inverts
 * the curve for the reference range. The inversion divides by `(A - floor)`. At
 * the shipped 0.45 asymptote that denominator is 0.25, and it was 0.027 under
 * the retired extent-scaled fit (whose `A` was 0.477): a hundredth of a point of
 * movement in `bands[2].at` would have swung the fitted reference by hundreds of
 * units, and a floor above 0.477 would have made the crossover unreachable at
 * ANY range. Under `n = 1` the old floor was harmless because the curve did its
 * work slowly; under `n = 4` it sat on top of the answer.
 *
 * CYCLE 67's SIMPLER FIT CONDITIONS BETTER, and the floor stays low anyway. With
 * the extent term gone `A` is a full 0.68 clear of the floor rather than 0.027,
 * so the solve is no longer delicate — but nothing is gained by raising the
 * asymptote back, and raising it would flatten the far half of the curve where
 * the blue register now does all of its work.
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
 * typed in (it scales linearly with the anchor: ~709 u when the anchor sat at
 * 577.5 u on the eighths ladder; ~1,228 u at the twelfths anchor [retired 2026-11-12, Story 11.2]).
 *
 * `CONFIG.vision.farRadar` (8/12 of intel range since Story 9.8 — epic-9
 * amendment 103, the anchor confirmed by ruling 121) is read HERE AND NOWHERE
 * ELSE IN THE CLIENT. Story 4.9 shipped that rung deliberately unconsumed and
 * named this line as its only legitimate consumer: it is an input to FITTING a
 * coefficient, evaluated once at module load, so the red->blue crossover EMERGES
 * from the 1/d^4 curve and moves automatically if `SIGHT` is ever retuned.
 * Writing `if (d > farRadar)` — or any other comparison against that constant —
 * anywhere on a paint path violates amendment 105 (colour is intensity, never
 * category) and is the wrong implementation of amendment 118. Fit the curve; do
 * not branch. `grep -rn farRadar client/src/render/` must stay empty.
 *
 * THERE IS NO CALIBRATION HULL ANY MORE, AND THAT IS AMENDMENT 118 GETTING
 * CLEANER (cycle 67, amendments 171-175). The fit used to nominate the Mine
 * Layer at broadside and solve `A = bands[2].at * strongExtent / ext`, so the
 * ratified "a mid-size hull crosses red->blue at the rung" was a statement about ONE
 * hull at ONE aspect and every other hull crossed somewhere else — a battleship
 * broadside never crossed at all, staying red past the rim. Now a hull's
 * reflectivity is its MATERIAL and nothing else, so the solve is just
 * `ship * atten(farRadar) = bands[2].at` and the crossover is a PURE STATEMENT
 * ABOUT RANGE: every hull, every class, every aspect, crosses red->blue at the
 * anchor. Class and aspect still read — off the SIZE of the mark, which is
 * what the coverage mask has carried since cycle 63.
 *
 * IT ALSO RETIRES THE CYCLE-63 CROSSOVER BAND (amendment 158). When the fit's
 * `ext` was reconstructed from the fuzzed mask, lattice phase and per-paint
 * glint scintillated the crossover across ~[rung - 60u, rung + 35u]; no
 * mask-derived quantity feeds intensity now, so the range is exact. It is exact
 * under the grain as well, because `noise.solidAt` is pinned to this same
 * `HEAT_RED_AT` and the SNR envelope's amplitude is zero there.
 *
 * The readings this fit is judged on (pinned in __tests__/radarFalloff.test.ts,
 * not re-derived here): red from the hull out to the anchor (8/12), blue from
 * there through the dropout knee (10/12), identical for all three classes at
 * both aspects, and `minPeak` still floors the return out to the rim. THE
 * TWELFTHS LADDER MOVED ONE READING (Story 9.8, measured): with the anchor a
 * third of the span from the rim, the 1/d⁴ curve no longer holds blue to the
 * rim — the unluckiest draw dips into green from ~1,327 u and every draw from
 * ~1,437.5 u, inside the dropout cliff where p(paint) runs 0.9 → 0.1.
 */
const HEAT_POINT_REF = fitPointRef({
  crossover: CONFIG.vision.farRadar,
  band: HEAT_RED_AT,
  coef: 1, // steel is the coefficient table's 1.0 anchor
  floor: HEAT_SHIP_ATTEN_FLOOR,
});

// --- THE WAKE CORRIDOR (Story 4.12, amendments 198 + 203) -----------------------
//
// A WAKE IS A NEW MATERIAL, NEVER A NEW CATEGORY AND NEVER A NEW COLOUR. It is
// green, at the same `bandAlpha` every other register draws at; `HeatBand` still
// has no alpha member and `quantizeInto` still takes one scalar. What separates a
// track from the speckle around it is CONTINUITY, not strength (amendment 198,
// Eric's ruling against a bound he has now declined twice): chop lights a
// scattered MINORITY of its cells while a wake lights essentially ALL of its own,
// so the player picks a coherent LINE out of random dots.
//
// THAT IS AN ARITHMETIC REQUIREMENT AND IT DOES NOT HOLD AT AMBIENT GRAIN. It
// squeezes the material between two rails that are only 13% apart:
//
//   • the LOWER rail — every draw must clear `bands[0].at`, or the line breaks up
//     into dots and stops being a line at all;
//   • the UPPER rail — no draw may outrank the FAINTEST LEGITIMATE ECHO's own
//     worst draw (`minPeak × (1 − a)`), which is clutter's ratified third bound
//     applied to the material that shares a sweep with a hull's own weakest cell.
//
// Under the shipped envelope those two need an amplitude below ~6.1%, and the
// ambient amplitude down here is ~33%. So THE WAKE CARRIES REDUCED GRAIN — and
// the justification is physical rather than a fudge: grain models the
// scintillation of INCOHERENT SCATTER, and a ship's track is an organized,
// persistent surface feature with a definite boundary, not random capillary
// roughness. See `noiseAmplitude`'s own comment.
//
// EVERY NUMBER BELOW IS SOLVED FROM THE SHIPPED CONSTANTS, NOT TYPED IN
// (amendment 172: a provisional figure acquires authority by being cited, so the
// indicative ones in amendment 203 are deliberately not written down anywhere).
// Retune `bands[0].at`, `minPeak` or the envelope and the whole corridor —
// coefficient, grain and reach — moves with them.

/** Upper rail: the unluckiest draw of the faintest legitimate echo. */
const HEAT_WAKE_HI = HEAT_MIN_PEAK * (1 - noiseAmplitude(HEAT_MIN_PEAK, HEAT_NOISE));

/**
 * THE WAKE COEFFICIENT — the MIDPOINT of the corridor, which is not a taste
 * choice: at the midpoint the two rails are equidistant in RELATIVE terms
 * ((hi − c)/c = (c − lo)/c), so one grain scale buys the same margin against
 * both and neither rail is quietly favoured. Any other placement spends the
 * corridor on one side.
 */
const HEAT_WAKE_COEF = (HEAT_GREEN_AT + HEAT_WAKE_HI) / 2;

/**
 * THE WAKE'S GRAIN SCALE — solved as half the feasibility ceiling
 * (`fitGrainScale`), i.e. a 2× safety factor on both rails at once. The SAFETY
 * FACTOR is the one free choice in this whole calibration, and it is a margin on
 * an arithmetic bound rather than a look knob: spending the full ceiling would
 * put both rails exactly on the worst draw, where one decimal of movement
 * anywhere in the envelope breaks amendment 198.
 */
const HEAT_WAKE_GRAIN = fitGrainScale({
  coef: HEAT_WAKE_COEF,
  lo: HEAT_GREEN_AT,
  hi: HEAT_WAKE_HI,
  env: HEAT_NOISE,
  safety: 0.5,
});

/**
 * THE OLDEST WATER'S INTENSITY SCALE — the ratio that makes RECENCY STRUCTURAL.
 *
 * Amendment 203: length is the recency channel and there is no brightness ramp
 * anywhere, so a segment's own water age scales its INTENSITY and the tail
 * simply drops under `bands[0].at` first — the visible track SHORTENS as it ages
 * instead of dimming. (Two clocks, and they must not be confused: amendment 161
 * is untouched, phosphor alpha still carries PAINT age and only paint age, while
 * the WATER's age moves intensity. A paint of old water is drawn at full opacity
 * and simply covers fewer cells.)
 *
 * The end of the ladder is DERIVED, not chosen: water at the end of its life
 * reads exactly as fresh water does at the material's own reach, so age and
 * range spend the SAME coin and the visible reach walks from the 6/12 rung down
 * to nothing across `WAKE_AGE_BUCKETS`. `worstDrawIntensity` is the intensity
 * whose unluckiest draw lands on the threshold — the same quantity the reach fit
 * inverts — so the two derivations cannot drift.
 */
const HEAT_WAKE_AGE_FLOOR =
  worstDrawIntensity(HEAT_GREEN_AT, HEAT_NOISE, HEAT_WAKE_GRAIN) / HEAT_WAKE_COEF;

/**
 * THE WAKE'S REFERENCE RANGE (u) — SOLVED so its worst draw crosses
 * `bands[0].at` EXACTLY at `CONFIG.vision.muzzleFlash`, the twelfths ladder [retired 2026-11-12, Story 11.2]'s
 * 6/12 rung (Story 9.8, epic-9 amendment 103; the eighths ladder's 5/8 before).
 * A wake READS inside that and FRAYS OUT beyond it, which is both a
 * weak-surface-return result and a "get close to read tracks" dynamic, and it
 * lands on the ladder rather than on a new literal.
 *
 * This is the SECOND (and last) place in the client that reads that rung to
 * shape INTENSITY, and it reads it for the same reason `HEAT_POINT_REF` reads
 * `farRadar`: to FIT a curve, once, at module load. No radar PAINT path may
 * compare against the rung — that violates amendment 105 exactly as it would
 * for the crossover. (render/hazeHalo.ts legitimately reads
 * `CONFIG.vision.muzzleFlash` — `muzzleFlashFactor` until it retired
 * 2026-11-12, Story 11.2: it sizes the countermeasure's eye-visibility halo to
 * the server's own `sm` gate, a geometry the server decides, not an intensity.)
 *
 * WATER IS A SURFACE (amendment 106's table): 1/d³, the same geometry as
 * coastline, surf and sea clutter. The reference comes out LONGER than the
 * coastline's, and that is the corridor talking rather than a mistake — the
 * whole material lives in a 13%-wide band, and the draw window already spends
 * half of it, so the RANGE term has only ~3% of intensity left to spend between
 * the antenna and the rung. A flat curve is the only curve that fits, and the
 * fade past the rung is then carried by the draw window sliding under the
 * threshold rather than by the curve collapsing.
 */
const HEAT_WAKE_REF = fitMaterialRef({
  reach: CONFIG.vision.muzzleFlash,
  band: HEAT_GREEN_AT,
  coef: HEAT_WAKE_COEF,
  floor: HEAT_SURFACE_FLOOR,
  geom: SURFACE,
  env: HEAT_NOISE,
  grainScale: HEAT_WAKE_GRAIN,
});

/**
 * The fastest hull in the game (u/s), over EVERY hull id, because amendment
 * 199 puts a wake behind every visible hull. Read off
 * the zero-card fold (`hullTopSpeed` — since Story 10.3 a top speed is DERIVED
 * from the ENGINES index, never authored on the envelope) rather than written
 * down, so an index retune or a fourth class moves the wake pool's ceiling.
 */
export const FASTEST_HULL_SPEED = HULL_IDS.reduce((top, id) => Math.max(top, hullTopSpeed(id)), 0);

/**
 * Nominal travel time (ms) of the reveal zoom — the pull-back to the whole
 * ocean at your own founder (Story 5.3). Authored as a DURATION because that is
 * the shape of the thing Eric ruled on (amendment 26 scales it by the motion
 * setting), and converted to the exponential rate the camera actually eases at
 * just below.
 */
const REVEAL_ZOOM_MS = 1600;

/**
 * How many time constants of the exponential approach count as "arrived", used
 * only to turn the authored duration into a rate. exp(-3) ≈ 5% of the travel
 * left, which the camera's settle epsilon then closes. An exponential never
 * literally lands, so a duration knob needs exactly this one convention.
 */
const REVEAL_ZOOM_TAUS = 3;

/** The foghorn's wire band, 1..12 (FoghornEvent.v — Story 9.8, ruling 129). */
type HornWireBand = NonNullable<FoghornEvent['v']>;

/** Twelve bands on the wire (twelfths of the listener's intel range); band 4 is
 *  truesight, band 12 the radar edge (epic-9 amendment 103 / ruling 129). */
const HORN_BANDS = 12;
const HORN_SIGHT_BAND = 4;

/**
 * THE FOGHORN CURVE's position for a band (ruling 129, "proportional
 * re-read"): 0 at and inside truesight (band 4), 1 at the radar edge (band
 * 12), even steps between — k = (band − 4) / 8. Both the audio gain and the
 * chevron weight are this one curve, so the honk's loudness and its mark step
 * together.
 */
function hornCurveK(band: number): number {
  return Math.max(0, (band - HORN_SIGHT_BAND) / (HORN_BANDS - HORN_SIGHT_BAND));
}

/** A complete band → value table over 1..12, generated from the curve. */
function hornTable<T>(at: (k: number) => T): Readonly<Record<HornWireBand, T>> {
  const out: Partial<Record<HornWireBand, T>> = {};
  for (let b = 1; b <= HORN_BANDS; b++) out[b as HornWireBand] = at(hornCurveK(b));
  return out as Readonly<Record<HornWireBand, T>>;
}

/** The chevron's two shipped anchors (Story 4.9): full weight through
 *  truesight, the old tier-3 weight at the radar edge. */
const CHEVRON_NEAR = { size: 22, thickness: 3, alpha: 0.95 } as const;
const CHEVRON_EDGE = { size: 13, thickness: 1.8, alpha: 0.5 } as const;

/**
 * u — THE RETIRED BASE SIGHT: 500 u, the twelfths ladder's 4/12 rung (Story
 * 9.8). Story 11.2 (Eric 2026-11-12, R18) moved class-and-name sight to 200 hm
 * (≈ 4,545 u) and the plain-hull sight to 350 hm; the client FEEL knobs that
 * were written as multiples of sight — the camera lead cap, the lobby / ambient
 * scene's spans and rival bands, the torpedo hum radius, the radar proximity
 * dim ramp — keep TODAY'S ABSOLUTE SIZES by reading this literal (R20 reading,
 * dated 2026-11-12). Never a gameplay reach; nothing on the wire reads it.
 */
const FEEL_SIGHT_U = 500;

export const CLIENT_CONFIG = {
  /** Design tokens (Story 1.11) — the single styling source (see above). */
  colors: COLORS,
  type: TYPE,

  /** BOOT (Story 7.1) — what the client is allowed to wait for before it puts
   *  anything on screen. */
  boot: {
    /**
     * Ceiling on the webfont wait before `app.init()` runs anyway (ms).
     *
     * render/stage.ts preloads the ratified faces and then awaits
     * `document.fonts.ready` so the first Pixi `Text` rasterizes in Geist Mono
     * rather than in a system face it would have to re-lay out. That is worth a
     * short wait and NOT worth an unbounded one: `document.fonts.ready` settles
     * only when every pending font has resolved, so a Google Fonts CDN that is
     * slow, throttled or blocked used to hold the whole boot — no canvas, no
     * menu, nothing — for as long as the network took to give up. NFR2's budget
     * is cold-load → interactive home, and a third-party host must never be
     * able to spend it.
     *
     * 1500 ms is generous against a warm CDN (the sheet is preconnected and
     * fetched non-blocking from index.html, so on any working connection the
     * faces land far inside it) and short enough that a blocked CDN costs a
     * pause rather than a dead page. On timeout boot simply proceeds: Pixi falls
     * back to a system mono face, exactly as it already does when the preload
     * throws, and the real faces swap in whenever they arrive.
     */
    fontWaitMs: 1500,
  },

  /** Camera follow + look-ahead lead (the "does it feel like a ship" knobs). */
  camera: {
    /** Exponential follow rate (1/s). Larger = camera catches the ship faster. */
    followRate: 5,
    /**
     * Look-ahead time (s). Lead distance = |speed| * leadSeconds, capped at
     * leadMax. At maxSpeed 25 u/s this reaches ~112.5u (step 11 feel-pass
     * tuning, up from 4s; flagged for playtest). The cap was set when sight
     * was 220 u and engaged near top speed; at the twelfths ladder [retired 2026-11-12, Story 11.2]'s 500 u
     * sight (Story 9.8) it sits at 250 u, so only a boosted/drafted hull ever
     * reaches it.
     */
    leadSeconds: 4.5,
    /** Lead distance cap (u) = 0.5 × the retired 500 u sight (250 u) — today's
     *  absolute size kept as a literal (Story 11.2, 2026-11-12: `FEEL_SIGHT_U`). */
    leadMax: FEEL_SIGHT_U * 0.5,
    /**
     * KEEP THE OWN HULL ON SCREEN past the default framing (Story 9.8 review
     * gate, F2): the centre slide (ruling 128) aims at the ring centre, so a
     * captain out in the storm beyond the fitted ring would otherwise slide off
     * the view at the zoom-out limit. The centre is clamped so the hull point
     * stays at least this far (u) inside every view edge: the LONGEST hull's
     * half-length plus a small margin (20 u), so the whole silhouette shows.
     */
    keepInViewPadU: Math.max(...SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].hull.length)) / 2 + 20,
    /**
     * EASED CENTER JUMPS (Eric 2026-10-19, epic-9 amendment 208 ruling 10:
     * "about half a second"): when the ring feed, a window resize or a
     * UI-scale change moves the camera's slide target, the center glides to
     * the new spot at this exponential rate (1/s) instead of popping. 6 /s is
     * three time constants (~95 % of the way) in half a second. The player's
     * own zoom stays direct (ruling 128).
     */
    slideEaseRate: 6,
  },

  /**
   * WAKE — the ON-WATER rendering of the one wake (Story 4.12, amendment 204).
   *
   * WHAT LEFT THIS BLOCK, AND WHY IT CANNOT COME BACK. `life` (1.1s) and
   * `spacing` (4u) were client-only feel knobs while the wake was a UI element
   * trailing the camera. They are GAMEPLAY-LOAD-BEARING now — the server
   * rasterizes the same ribbon onto the radar lattice — so they live in shared
   * `CONFIG.vision` as `wakeLifeMs` (12000) and `wakeSampleU` (12), and BOTH
   * renderings read them from there. Eric, correcting a draft that invented a
   * length asymmetry: *"I didn't tell you that the on-water render and the radar
   * wake are deliberately different lengths... I didn't say shit about the
   * lengths being different here."* A knob here would be exactly that fork.
   *
   * `minSpeed` left with them. It was a spawn gate against a crawling hull
   * dribbling dots; the shared model needs none, because a hull too slow to
   * cover one `wakeSampleU` inside `wakeLifeMs` (under 1 u/s) lays water that
   * has expired before the next sample exists. A client-only floor on top of
   * that would put foam on the water at speeds the scope shows nothing at.
   *
   * WHAT IS LEFT IS PURE PRESENTATION: how big a foam dot is, how dark it
   * starts, how much displaced water a hull pushes aside, and the pool cap.
   */
  wake: {
    /**
     * Base radius of a foam dot (u) — HALF THE SAMPLE CADENCE, so consecutive
     * dots exactly touch and the trail reads as a continuous band rather than
     * as beads. Derived rather than picked: the cadence rose from the retired
     * client-only `spacing: 4` to shared `wakeSampleU: 12` (one dot per lattice
     * cell plus margin, which is what keeps the particle count sane across
     * every visible hull), and a dot sized against the old cadence would have
     * left a dotted line.
     */
    radius: CONFIG.vision.wakeSampleU / 2,
    /** Peak alpha at spawn (scaled by speed fraction). Lower than the shipped
     *  0.28 because the dots are now ~2.3× wider and overlap by construction —
     *  same ink on the water, spread over a band instead of a bead chain. */
    alpha: 0.2,
    /**
     * HULL-SIDE DISPLACED WATER (amendments 197/199/206) — the alpha of the
     * Kelvin envelope drawn under the foam. Eric: *"ships displace the water as
     * they move, so there is choppy water around it on all sides."*
     *
     * WELL UNDER the foam's own alpha on purpose: the envelope is a WIDE area
     * (three beams across at the hull) and it must read as disturbance around
     * the track rather than as a second, fatter wake. Same relationship the
     * scope has — chop lights a scattered minority of its cells while the wake
     * lights all of its own (amendment 198) — expressed in the medium the water
     * actually has.
     */
    chopAlpha: 0.07,
    /**
     * The pool ceiling for live foam dots, ACROSS EVERY HULL.
     *
     * DERIVED, not picked. One source at top speed holds `wakeLifeMs ×
     * maxSpeed ÷ wakeSampleU` dots — the same quantity `wakeCapacity` derives
     * the shared ring buffer from — and `CONFIG.map.playerCap` bounds how many
     * hulls can be on the water at once (the comment used to cite
     * `CONFIG.match.maxPlayers`, which is not what the code below reads —
     * corrected at the cycle-69 review gate, P8). So this is the honest worst
     * case rather than a guess, and it moves when the clock, the cadence, the
     * hull speeds or the room size move.
     *
     * It is a RUNAWAY BACKSTOP, not a budget: at the shipped numbers no
     * legitimate frame reaches it, because a client only lays wake for hulls it
     * can SEE and cannot see the whole room at once. `capOldest` evicts the
     * OLDEST dots first if it ever binds — the faintest water, already nearly
     * expired.
     */
    maxDots:
      Math.ceil(
        ((CONFIG.vision.wakeLifeMs / 1000) * FASTEST_HULL_SPEED) / CONFIG.vision.wakeSampleU,
      ) * CONFIG.map.playerCap,
    // Wake color is DYNAMIC as of Story 1.12 — it trails a hull, so it carries
    // that hull's personal hue; no static token here. Amendment 199 made that
    // per-source rather than own-only: main.ts resolves each visible hull's hue
    // off the same roster the hull's own silhouette reads.
  },

  /**
   * ON-WATER ORDNANCE IDENTITY (Story 2.9) — render-only feel knobs for what a
   * doctrine LOOKS like in flight / on the chart. Nothing here is gameplay
   * authoritative: the sim numbers (speeds, radii, damage) all live in shared
   * CONFIG, and the wire stays mode-blind for ballistics. The OWN-side
   * BROADSIDE weights (`broadside*`) are the ratified "a main-battery shell
   * must read heavier than the gun" tester fix, inherited BYTE-FOR-BYTE from
   * the cannon look the broadside replaced (Story 7-5 wave 2) — own-side only,
   * because the constant-free ballistic wire shape cannot (and must not) say
   * which weapon fired to an onlooker.
   *
   * `apStretch` / `arcSwell` / `arcSwellMs` are DELETED with ARMOR-PIERCING and
   * PLUNGING FIRE (R2.6): the BROADSIDE BARRAGE has no doctrine cards at all, so
   * the dart and height-as-size channels had no user left. Nothing may re-add a
   * knob here without a look that consumes it.
   */
  ordnance: {
    /** Own BROADSIDE shell: a visibly bigger, heavier dot than the gun's (2.2/6). */
    broadsideCoreR: 3.4, // u
    broadsideGlowR: 9, // u
    broadsideGlowAlpha: 0.3,
    /** ACOUSTIC HOMING: a steering fish reads BRIGHTER-HEADED than a
     *  straight-runner. It no longer reads as a tighter WAKE — the paired
     *  `homingTrailSpacing` was deleted at the cycle-69 review gate (P10) when
     *  the fish's trail became the ONE shared wake ribbon at the ONE shared
     *  sample cadence; a per-look spacing override would be exactly the second
     *  wake model amendment 204 forbids. */
    homingCoreR: 4.2, // u
    /** THE MACHINE GUN'S TRACER (Story 8.15): a stream shell (`w: 'mg'` on the
     *  reveal) draws as a SHORT STREAK trailing its velocity instead of the
     *  cannon's dot — a lighter, faster read for a gun that fires every 0.5 s.
     *  Client-only feel (the look is the one thing `w` exists to buy). */
    tracerLenU: 8, // u — streak length behind the head
    tracerWidthU: 1.4, // u — streak stroke width
    tracerCoreR: 1.3, // u — the bright head
    tracerGlowAlpha: 0.35,
    // THE CREEP KNOBS ARE DELETED (Story 7-5 wave 2): creepWakeSpacing,
    // creepTickLen and creepEpsilon drove the SELF-PROPELLED mine's tell — a
    // heading tick plus a wake dot laid along its crawl. That doctrine left the
    // game with its card, and CAPTIVE MINES (which replaced it) are MOORED, so
    // no mine can move and render/mines.ts has no move path left to configure.
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
   * THE SOUND MAP (Story 4.7, Eric ruling 2026-08-10) — how a cue that happened
   * OUT IN THE WORLD is placed in the mix. Two knobs, and deliberately nothing
   * else; the three things a reader will come looking for are all absent on
   * purpose:
   *
   *   • THE REACH is not here. Every world cue is attenuated over the SAME
   *     distance — `CONFIG.vision.radar`, the twelfths ladder [retired 2026-11-12, Story 11.2]'s 12/12 rung
   *     (full intel range, epic-9 amendment 103) — read straight from shared CONFIG at the call site, never
   *     mirrored or re-typed into this block. It is a FALLOFF SCALE, not a gate:
   *     the server has already decided which events reach this client, and a
   *     per-cue reach here (muzzleFlash for `mz`, sight for `boom`) would be a
   *     second client-side implementation of a perception rule — the exact
   *     desync/leak class `effectiveStats()` exists to prevent. That option was
   *     considered and REJECTED; do not add it back as a "tunable".
   *   • A RATE LIMIT is not here. One already exists: `gunnery.hitCallToneFloorMs`
   *     immediately above is the ratified 300ms same-source floor, and the world
   *     cues reuse it verbatim through render/gunneryFeed.ts's `ToneFloor`.
   *     Inventing a second floor constant is precisely what amendment 37 forbids.
   *   • NO TIMBRE is here. Frequencies, envelopes and levels live in
   *     audio/tones.ts beside the specs they belong to; this block only answers
   *     WHERE a cue sits and HOW LOUD it is at the distance it happened.
   */
  audio: {
    /**
     * Gain multiplier at the far edge of the reach — the quietest a world cue is
     * ever played (multiplied into the spec's own volume). The curve is LINEAR
     * from 1.0 at the listener down to this at `CONFIG.vision.radar`
     * (audio/tones.ts `worldCue`), not inverse-square: legibility over physical
     * honesty, which amendment 115 permits outright. The floor is the
     * load-bearing half — a cue points your ear at a mark already drawn on your
     * screen, so the far edge must be QUIET but never inaudible, or the cue
     * stops existing exactly where it is most useful.
     */
    worldFloorGain: 0.25,
    /**
     * Hard cap on |pan| (StereoPannerNode units, where 1 is fully one ear).
     * Never 1: a hard-panned cue vanishes for anyone on a single channel or
     * sitting off-axis, and the pan is a HINT toward a visible mark rather than
     * the mark itself. 0.7 is wide enough to read as "that side" instantly and
     * narrow enough that both ears always hear the cue. Under `monoAudio` it
     * folds to centre — which is what finally makes that accessibility toggle
     * audible rather than vacuous (audio/context.ts's mono bus was plumbed for
     * exactly this in Story 2.3 and has been an audible no-op ever since).
     */
    panMax: 0.7,
    // --- THE SOUND PASS (Story 10.13, wave B). Every value below is an
    // IMPLEMENTER'S DRAFT, Eric's to judge by ear — none of them is a ruling.
    /**
     * Voice budget for the layered cues (audio/cues.ts `cueAdmitted`). The
     * synth refuses any cue past `cueVoiceCap`; a WORLD cue (something out on
     * the water) is refused once `worldCueVoiceCap` voices are live, and a FAR
     * world cue (distance01 above `farWorldFrom`) already at
     * `farWorldCueVoiceCap`. Distant world cues drop first, then near ones, and
     * the player's own cues never: `cueVoiceCap − worldCueVoiceCap` is at
     * least the sum of every own family's cap (pinned by a test).
     */
    cueVoiceCap: 77,
    worldCueVoiceCap: 16,
    farWorldCueVoiceCap: 8,
    farWorldFrom: 0.5,
    /** Own hull hit (`ownHit`): a frame's summed own damage at or above
     *  `ownHitFullHp` plays at full level; smaller blows scale down linearly
     *  to `ownHitMinGain` (a 3 hp secondary round is quiet, a main-battery
     *  salvo is full). */
    ownHitFullHp: 60,
    ownHitMinGain: 0.35,
    /** ms — own gun shells revealed within this of each other are ONE report
     *  (a turret's salvo leaves together; per-shell reports would stack). */
    ownGunFloorMs: 100,
    /** Engine-telegraph click: the one recipe, transposed up for ringing
     *  ahead and down for astern. */
    telegraphAheadPitch: 1.06,
    telegraphAsternPitch: 0.94,
    /** ms — the hull-contact scrape (`ramGrind`, ~1.5 s per shot) is started
     *  again this often while the scrape lasts, so consecutive shots overlap
     *  into one continuous grind. */
    grindCuePeriodMs: 1000,
    /** Other ships' engines heard at once (the nearest audible hulls). */
    remoteEngineVoices: 3,
    /** ms — a smoke cloud sounds its deploy hiss only when first seen within
     *  this long of its birth (a cloud first painted later is old news). */
    smokeCueFreshMs: 1000,
    /** u — a torpedo the client draws hums (`torpedoRun`) the first time it
     *  comes this close to the listener: half the true-sight radius. */
    torpedoHumRadiusU: FEEL_SIGHT_U / 2, // 250 u — today's size kept (Story 11.2, `FEEL_SIGHT_U`)
    /** Your OWN torpedo's hum plays at this share of the enemy hum's level, so
     *  it never buries the launch cue it follows (review P3c). */
    ownTorpedoHumGain: 0.5,
    /** Your credited kill (`killSound`) when the wreck cannot be placed (a
     *  kill you did not see go down): heard unplaced, at this distance01 — a
     *  distant kill. A witnessed kill is placed by its real distance. */
    killUnplacedDistance01: 0.75,
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
    /**
     * THE CLAMPED-SHELL SCALE (Eric ruling 2026-08-27, ruling 4): a broadside
     * shell whose turret could NOT bear on the click still bursts somewhere
     * real, so its line and circle are drawn in full — at this fraction of the
     * normal alpha, so the shells actually going where the player pointed read
     * as the bright ones. Under the zero-overlap ladder most of a low-rung
     * barrage is clamped, which is exactly the thing the preview now has to
     * say. Multiplies whatever alpha the shell would otherwise take (including
     * `blockedAlpha`), so the two tells compose rather than fight. Nothing but
     * the broadside sets the flag. Implementer-drafted.
     */
    clampedAlphaScale: 0.45,
    /**
     * THE MAIN-BATTERY DISPERSION OVAL (Story 11.1, R10 / R14): one filled
     * oval at the salvo center, at its TRUE size, brightest in the middle and
     * fading toward the edge on the bell of `CONFIG.dispersion.sigmas` (bench
     * idea E "Bright middle"). `ovalPeakAlpha` is the bench's peak, copied
     * from client/scripts/dispersionBench/markers.ts `fillBell`:
     * `0.95 * Math.exp(-((r * sigmas) ** 2) / 2)`. `ovalTexPx` is the side of
     * the baked radial alpha texture the sprite stretches onto the ellipse.
     */
    ovalPeakAlpha: 0.95,
    ovalTexPx: 128,
  },

  /**
   * THE TARGETING RETICLE (render/firing.ts drawReticle): a ring + a cross at
   * the cursor. The BASE values are the pre-Story-11.1 reticle exactly (radius
   * 7 u, cross reaching 3 u past the ring, 1.5 / 1 strokes); the player's AIM
   * SIZE setting multiplies all four (Story 11.1 R15 / R18). Ring and cross
   * are drawn at full strength (R15 "bright"). The two player defaults: AIM
   * SIZE 2× and AIM COLOR the palette amber (settings/store.ts).
   */
  reticle: {
    radiusU: 7,
    crossOverU: 3,
    ringWidth: 1.5,
    crossWidth: 1,
    ringAlpha: 1,
    crossAlpha: 1,
    /** AIM SIZE: the slider's range and step, and its default (×). */
    sizeMin: 1,
    sizeMax: 5,
    sizeStep: 0.5,
    defaultSize: 2,
    /** AIM COLOR's default: the palette amber, as the color picker's hex. */
    defaultColor: `#${COLORS.amber.toString(16).padStart(6, '0')}`,
  },

  /**
   * THE ONE FILL WEIGHT an aim-gated arc is drawn at (render/firing.ts): `lit`
   * for the side/sector that would fire (or a denied press), `dim` for an idle
   * one. The torpedo's and mine's `sector()` fill and the broadside's per-turret
   * wedges are the SAME grammar and must read at the same weight, so they read
   * the same pair — the wedges were introduced with a private copy of these two
   * numbers beside the hard-coded literals `sector()` still carried, which is
   * two sources for one decision.
   */
  arcFill: {
    litAlpha: 0.5,
    dimAlpha: 0.14,
  },

  /**
   * THE TORPEDO FIRING WEDGE (Story 10.6, R28 — Eric 2026-11-06: "Each
   * launcher's arc should be centered on the launcher itself, not the center
   * of the ship. That includes the wedge. I also would like the wedge to
   * extend a lot further and have the alpha gradually fade out to the end of
   * it"). Each firing band is its own wedge from its launcher's station, drawn
   * at the `arcFill` peak alpha and the torpedo tint, fading to nothing at its
   * outer end; where the fore and aft wedges cross they stack into a brighter
   * patch (Eric: "they should overlap as a brighter patch"). There is no
   * torpedo run figure to size it by (Eric), so its length is a multiple of
   * the indicative wedge radius (render/firing.ts ARC_R) — an orchestrator
   * reading Eric judges on the page.
   */
  launcherWedge: {
    lengthMult: 3, // × the indicative wedge radius
    fadeStartFrac: 0.15, // full strength out to this fraction of the length, then a smooth fade to zero at the end
    texPx: 256, // px along the radius of the baked fade texture (built once, shared by every wedge)
  },

  /**
   * THE BROADSIDE'S PER-TURRET ARC DISPLAY (render/firing.ts — Eric ruling
   * 2026-08-27, ruling 4: *"bright per-turret wedges drawn from each gun's real
   * muzzle position + the ±60° legal sector reduced to a THIN OUTLINE"*).
   *
   * The zero-overlap ladder made the old pair of big ±60° filled wedges a LIE:
   * they said "you can hit anywhere in here" while the guns cover only a few
   * narrow slivers of it. So the sector keeps its job — it is the DENY boundary,
   * and nothing else — and drops to a hairline; the information moved into one
   * small wedge per gun, drawn from that gun's own muzzle at its own mount
   * bearing ± its own traverse. The gaps between them are the design.
   *
   * All geometry comes from the shared helpers (sim/aim.ts `turretMuzzles` /
   * `turretMountBearings`) at an IDENTITY pose, because the `arcs` Graphics is
   * already hull-local (position = pose, rotation = heading). Nothing here
   * re-derives spacing.
   *
   * Every value is implementer-drafted feel; the grammar (lit side bright, off
   * side dim, denial reddens both) is the shipped one, unchanged.
   */
  broadsideArcs: {
    /** u — the per-turret wedge's radius. INDICATIVE, like the torpedo's ARC_R:
     *  the real reach is the broadside's own tiered dial (625–750 u, Story 9.8
     *  ruling 125) and a filled wedge that long would bury the
     *  chart. Short of the 72u sector radius so the wedges read as a battery
     *  INSIDE the legal sector, and comfortably shorter than the 124u
     *  battleship hull they sprout from. */
    wedgeRadius: 50,
    /** The ±60° legal sector, now a stroked boundary rather than a fill. */
    legalEdge: {
      width: 1,
      alpha: 0.25,
      dimAlpha: 0.12,
    },
    /** The reload sweep-back, rehomed onto the legal sector (it used to ride the
     *  big fill this block deleted): a half-radius wedge whose alpha climbs as
     *  the barrage comes back. Same two numbers the shipped `sector()` used. */
    reloadRadiusFactor: 0.5,
    reloadAlphaBase: 0.1,
    reloadAlphaSpan: 0.2,
  },

  /**
   * OWN-MINE RINGS (render/mines.ts) — always-on, owner-private radii drawn in
   * WHITE (Story 9.11, amendment 152 — the dropper's hue is retired) on the fog-immune chart layer: solid blast +
   * dashed trigger for an ordinary mine, and for a CAPTIVE one (Story 7-5 wave
   * 2, R2.12) a single sparse-DOTTED trip ring — it never detonates on contact,
   * so it draws no blast circle about itself. Enemies see exactly today's
   * marker and nothing else.
   *
   * `acquireAlpha` is DELETED with the SELF-PROPELLED acquisition ring (R2.6):
   * the captive trip ring inherits that ring's dotted STYLE but is the primary
   * (and only) ring on the mine, so it takes `triggerAlpha`, the weight the
   * trip radius has always had.
   *
   * LOUDER SINCE CYCLE 162 (Eric 2026-10-01: blast and trigger rings on all
   * mines "a lot more visible"): width 1 → 2, blastAlpha 0.3 → 0.6,
   * triggerAlpha 0.34 → 0.65 — IMPLEMENTER DRAFTS for his eye on staging.
   * `armingScale` is unchanged, so an arming mine still reads quieter.
   */
  mineRings: {
    width: 2, // ring stroke width (cycle 162 draft; was 1)
    blastAlpha: 0.6, // cycle 162 draft; was 0.3
    triggerAlpha: 0.65, // cycle 162 draft; was 0.34
    /** Multiplier applied to every ring alpha while the mine is still ARMING
     *  (client-inferred: first-seen + CONFIG.mine.armDelay). Dim = "not live
     *  yet"; it snaps to full the moment it arms. */
    armingScale: 0.4,
  },

  /**
   * THE RADIO BEACONS (Story 10.8, render/beacons.ts) — how a beacon LOOKS.
   * Nothing here is gameplay: the lifecycle, the 500 u range and the body size
   * are shared `CONFIG.beacons`. IMPLEMENTER DRAFTS pending Eric's yes on the
   * rendered candidate (the spec's Block-If).
   *
   * THE LOOK (Eric 2026-11-07: "What does this radio beacon look like? Make
   * that."): a LARGE NAVIGATION BUOY seen from directly above, at true size,
   * drawn like the battleship hulls — skin fills under linework. The hull is
   * the shared `beaconPolygon` octagon itself, so the drawn edge IS the hit
   * edge. Linework is `silver` (DESIGN.md: neutral linework — a beacon is no
   * one's, so never a relation color, never phosphor, amber or purple).
   *
   * Phase is coded by STYLE, not hue: the chart icon is a DASHED outline with
   * no fills while only charted (the storm plane's dashed-future grammar),
   * the solid painted buoy once it is in the water; the sink is the hull's
   * settle (ship `hullLook`) plus a fade. Chart widths are SCREEN px divided
   * by the camera zoom (`strokeWorldWidth`); the water body's are world units
   * (fractions of the body radius), like the hull art.
   */
  beacons: {
    /** THE CHART ICON's side (screen px): the same buoy from above at a
     *  constant size, so it reads at every zoom out to the whole-ring view.
     *  HANDOVER: once the real buoy would draw larger than this, the icon
     *  hides and the true-size buoy on the water is what you see. */
    iconPx: 16,
    /** Chart icon linework (screen px): the hull rim and the inner lines. */
    iconRimPx: 1.25,
    iconInnerPx: 0.75,
    /** The icon's light never shrinks under this radius (screen px). */
    iconLampMinPx: 1.5,
    /** Dash / gap (screen px) of the icon's rim while only charted. */
    iconDashPx: 3,
    iconGapPx: 2,
    ringStrokePx: 1.5,
    /** Icon linework alpha while only charted (nothing in the water) / live. */
    markerChartedAlpha: 0.6,
    markerLiveAlpha: 0.95,
    /** Range-ring alpha while only charted / live — subordinate to the icon
     *  and to the storm edge. */
    ringChartedAlpha: 0.3,
    ringLiveAlpha: 0.5,
    /** Dash count and lit fraction of the charted range ring. */
    ringDashes: 72,
    dashDuty: 0.5,
    /** The water body's linework as fractions of the body radius: the hull
     *  rim (bold, like a hull outline) and every inner line. */
    rimLineFrac: 0.1,
    innerLineFrac: 0.035,
    /** The deck rail's alpha (a hairline, quieter than the rim). */
    railAlpha: 0.6,
    /** THE SKIN — the battleship greys (`skins`): a dark fender/hull side, a
     *  steel-grey deck, near-black-navy solar panels, a dark lattice tower and
     *  the white light at the masthead. */
    skin: { fender: 0x2f3539, deck: 0x6f787e, panel: 0x1f2f42, tower: 0x3f474c, lamp: 0xe2e8f0 },
    /** DECORATION ONLY (scaled by the motion setting, gone at `off`): a
     *  broadcast ring growing `pulseGrowPx` out from the buoy's edge every
     *  `pulsePeriodMs` while it is in the water. */
    pulsePeriodMs: 2400,
    pulseGrowPx: 16,
    pulseAlpha: 0.45,
    pulseStrokePx: 1.25,
    /** Re-stroke throttle: a zoom change under this fraction keeps the drawn
     *  linework (the zone/terrain discipline). */
    redrawZoomFrac: 0.02,
  },

  /**
   * THE RADAR DISPLAY (Story 11.2, Eric 2026-11-12, rulings R16 / R19 — FIXED,
   * no settings): own-ship range rings in "style A" (thin crisp white, a number
   * on every ring at N / S / E / W), the radar-reach ring drawn distinct, the
   * compass (bearing) scale and the heading line ALWAYS ON, and the sweep in
   * "style 3" (a thin crisp line with a short afterglow). Every value is the
   * APPROVED reach bench's (client/scripts/reachBench/scope.ts), in screen px
   * at every zoom — EXCEPT the compass numerals: the bench drew them at 10 px,
   * and only the ring numerals were accepted small ("a little tiny"), so they
   * take the 13 px floor. [reading: Story 11.2 — compass numerals at 13 px]
   */
  radarDisplay: {
    /** Range rings: white at 0.7, 1 px. */
    ringColor: COLORS.white,
    ringAlpha: 0.7,
    ringWidthPx: 1,
    /** The radar-reach ring: phosphor at 0.8, 2 px; its numerals phosphor at 1. */
    reachColor: COLORS.phosphor,
    reachAlpha: 0.8,
    reachWidthPx: 2,
    reachLabelAlpha: 1,
    /** Ring numerals: 10 px mono 600, white at 0.9, on a void box at 0.85
     *  (text width + 4 px by 12 px) so the numeral reads over its line. */
    labelFontPx: 10,
    labelAlpha: 0.9,
    labelBoxColor: COLORS.void,
    labelBoxAlpha: 0.85,
    labelBoxPadPx: 4,
    labelBoxHeightPx: 12,
    /** The heading line: white at 0.75, 1 px, from the hull along its bow. */
    headingAlpha: 0.75,
    headingWidthPx: 1,
    /** The compass scale: ticks white at 0.8, 1 px — 9 px every 10 deg, 5 px
     *  every 5 deg — numerals white at 0.9, `compassLabelInsetPx` inside. */
    compassAlpha: 0.8,
    compassWidthPx: 1,
    tickLongPx: 9,
    tickShortPx: 5,
    compassFontPx: 13,
    compassLabelAlpha: 0.9,
    compassLabelInsetPx: 20,
    /** Sweep "style 3": a 1.5 px phosphor line at 0.95, additive, with a 5 deg
     *  afterglow fading up to it at 0.45 (render/textures.ts `bakeSweepTexture`). */
    beamWidthPx: 1.5,
    beamAlpha: 0.95,
    afterglowDeg: 5,
    afterglowPeak: 0.45,
  },

  /**
   * THE AIRDROPS ON THE WATER (Story 10.9, epic-10 amendment 18, R3/R4; Eric's
   * rulings of 2026-11-08 on the rendered page) — render/drops.ts. A crate is
   * drawn at SIGHT only (fogged world layer `dropWorld`); on radar it is a
   * plain anonymous blip, no client art. ONE body (the 15 u disc's inscribed
   * square) with its KIND's glyph inside, outline and glyph both in the kind's
   * color at `glyphAlpha` (the mine marker's 0.9). NO numerals: the bonus is
   * rolled AT PICKUP, so a crate shows only WHAT it is (icon + color) and the
   * amount arrives on the pickup toast. The wreck pickup is ONE crate in its
   * own color with its own glyph (it is not limited to one stat).
   *
   * `kindColors` are ERIC'S (2026-11-09, on the v2 page): armor `pink`,
   * power `alertOrange`, reload `amber`, engines `info`, intel `phosphor`,
   * range `stormReadout` (the rung ramp's tier-III purple), wreck `white` —
   * the FIRST time a stat has a color anywhere in the game. The wreck crate
   * wears the 'salvage' glyph (a crate under a star; Eric's pick).
   *
   * `glow` — Eric 2026-11-09: "give all of them a small glow effect in their
   * color". A soft underlay under the body square in the kind's color, the
   * projectile tracer's technique (render/projectiles.ts: a wider, low-alpha
   * stroke under the hot line — no filter). Drawing only: the pickup disc and
   * the glyph are untouched.
   */
  drops: {
    /** Body + glyph linework alpha (the mine marker's). */
    glyphAlpha: 0.9,
    kindColors: {
      armor: COLORS.pink,
      power: COLORS.alertOrange,
      reload: COLORS.amber,
      engines: COLORS.info,
      intel: COLORS.phosphor,
      // `range` (stormReadout) left with the RANGE crate kind (Story 11.2, R9).
      wreck: COLORS.white,
    } satisfies Record<DropKind, number>,
    glow: {
      /** u — how far the glow reaches OUTSIDE the square's line on each side
       *  (about one line width). Drawn as two passes: the full reach at half
       *  `alpha`, then half the reach at full `alpha`, so it fades outward. */
      widthU: 1.5,
      /** Peak alpha of the glow (its inner pass). */
      alpha: 0.35,
    },
  },

  /** Own/contact ship view feel constants. */
  ship: {
    flashMs: 130, // ms — hit-flash duration
    /**
     * THE KILL FLASH (Story 5.2 fix) — the confirmation beat on the hull at
     * SINK-ENTRY, so a killer sees they scored on the tick they scored.
     *
     * It is the SHIPPED hit-flash channel with a longer hold, deliberately, and
     * not a second grammar: same white bloom (EXPERIENCE.md · Game Feel &
     * Juice, "130 ms white hull flash on struck contacts"), same motion gate,
     * same aggregate budget claim, same degrade-the-amplitude-never-the-
     * duration rule. What separates it from a hit is DURATION plus what follows
     * it — the hull immediately begins to settle, which a hit never does.
     *
     * 300ms is the ratified same-source flash floor (EXPERIENCE.md ·
     * Accessibility Floor: "repeated same-source flashes share the 300 ms
     * floor"; CLIENT_CONFIG.gunnery.hitCallToneFloorMs is the same number for
     * the same reason), so ONE kill flash occupies exactly one floor slot and
     * can never overlap the hit flash that preceded it into a stutter.
     */
    sinkFlashMs: 300,
    sunkTint: COLORS.damage, // DESIGN.md dark crimson tint for a sunk hull
    /** Alpha of a fully-foundered hull — extracted from the `hullLook` literal
     *  it used to be, because the SETTLE now interpolates toward it (Story 5.2
     *  fix) and an end-state the ramp aims at cannot be a magic number. */
    sunkAlpha: 0.4,
    /**
     * Hull scale of a fully-foundered hull — "settling lower in the water" in
     * the only channel a top-down chart has. Safe to shrink: a sinking hull is
     * already untouchable (amendment 12 makes damage on it a total no-op), so
     * the silhouette-IS-the-hitbox rule (DESIGN.md · Do's and Don'ts) is not
     * being contradicted — nothing can hit it to notice.
     */
    sunkScale: 0.85,
    /** The relation hull's dark interior: the stroke at HSV value ×0.45, per
     *  sRGB channel — the rule the retired wheel's fills used (render/relationColor.ts). */
    relationFillValue: 0.45,
    /**
     * THE BATTLESHIP ART (Story 10.4 wave 2c — render/hullArt/*, the sitting
     * page's `drawHull` + `drawFeatures` ported). Epic-10 amendment 7(m)/(o):
     * EVERY line is the relation color; the HULL OUTLINE is the one bold line;
     * every inner line (barbettes, gunhouse edges, tiers, tower rings, funnel
     * rims, secondaries, casemates, deck lines) is the same color at about a
     * third of its weight; rails and cranes 1.5× the inner weight. Fills are
     * the skin (`CLIENT_CONFIG.skins`). Candidate values for Eric's look on the
     * rendered page — none is ruled.
     *
     * IN-GAME WEIGHTS ARE WORLD UNITS (the hull layer is camera-scaled and the
     * art is built once, never per frame or per zoom). The default framing is
     * `zoom.defaultSpanU` 1320 u across the short axis — 0.58 logical px per u
     * at 768 px tall — and the close limit 880 u (0.87 px/u). The hulls are
     * 14.5–17.8 u in the beam (8–10 px at the default framing), so 1.5 u (the
     * pre-10.4 hull stroke) reads as a ~0.9 px hull line at the default framing
     * (~1.3 px close) without eating the deck; 2.4 u was tried on the rendered
     * page and swallowed a fifth of the beam. The inner lines (0.5 u) are
     * sub-pixel at the default framing — the deck detail reads as its fills
     * there and as linework close in. The page's 2.5–4 px / 0.8–1.2 px were for
     * a page drawn at several px per u.
     */
    art: {
      /** The hull outline (u). */
      hullLineU: 1.5,
      /** Inner line weight as a fraction of the hull line (7(o): "about a third"). */
      innerLineFrac: 1 / 3,
      /** Rails and cranes, × the inner weight (7(o)). */
      heavyLineMult: 1.5,
      /** The page's deck `line` feature is drawn at this alpha. */
      deckLineAlpha: 0.6,
      /** A funnel's dark mouth, as a fraction of the funnel ellipse (the page
       *  insets it by a fixed 2.5 px at its own scale — a scale-free reading). */
      funnelMouthFrac: 0.7,
      /** Barrel thickness (m) — main guns and secondaries (the page's widths). */
      mainBarrelM: 1.1,
      secBarrelM: 0.5,
      /** Main barrels start this far (m) behind the gunhouse face. */
      mainBarrelBackM: 2,
      /** A crane's post disc radius (m). */
      craneHubM: 1.6,
      /**
       * THE DECK TORPEDO LAUNCHER (Story 10.6, I2 — a CANDIDATE for Eric's
       * yes): a pivot disc (`round` skin) under 1–2 long outlined tubes
       * (`barrel` skin) along the launcher's bearing — rods, not a gunhouse,
       * so it never reads as a turret. A SIGHTED ENEMY's launcher draws one
       * generic housing instead (`sec` skin, no tube detail): observers know
       * its angle, never its tube count (I7). Metres.
       */
      launcher: { pivotM: 2.4, tubeLenM: 11, tubeBackM: 4.5, tubeWidthM: 1.3, tubeGapM: 1.7, housingWidthM: 3.2 },
      /**
       * DOM (SVG) art weights in SCREEN px (`vector-effect: non-scaling-stroke`,
       * so the weight holds whatever size the art is fitted to): the page's
       * floor values — hull 2.5 px, inner a third of it.
       */
      svgHullPx: 2.5,
    },
    /**
     * How far along the settle the OWN hull is ever allowed to travel.
     *
     * The enemy hull runs the ramp to 1.0; ours stops at a fraction of it,
     * because it is the hull the player is still fighting from for five more
     * seconds and it must stay legible and aimable the whole way. This is
     * already a DEPARTURE toward the enemy grammar rather than away from it:
     * DESIGN.md's ratified sinking mock (mockups/death-reveal-results-1.html,
     * frame F1 "SINKING WINDOW — ~5 s RITARDANDO, GUNS LIVE") draws the own
     * hull at FULL personal hue with a full-strength glow, carrying the death
     * on the HP rail, the banner, the sink rings and the smoke instead. So this
     * number may shrink, never grow.
     *
     * The ceiling also has a hard floor under it: `sunkTint` (#8B0000) has ZERO
     * green and blue, and a Pixi tint MULTIPLIES — so a fully-settled cyan,
     * lime or spring hull renders literally black. At 0.3 a cyan hull keeps
     * ~70% of its green and blue and reads as itself, dimmed.
     */
    ownSettleMax: 0.3,
  },

  /**
   * THE SKINS (Story 10.4, epic-10 amendments 7(k)–(n)): a skin is the hull's
   * INTERIOR — every fill — never its linework, which is always the relation
   * color (render/relationColor.ts). Only the DEFAULT skin ships in 10.4 (R6:
   * the picker and Gold / Pride / Funny are a later story). Values are the
   * sitting page's `SKINS.default` (+ its shared `GREY` works) verbatim:
   * Yamato linoleum-tan deck / grey works, Bismarck wood deck / grey,
   * Warspite steel-grey deck / RN grey, Iowa Measure-22 deck blue / navy.
   * `tier` is levels 1..3; `round` the tower rings and tubs; `sec` the
   * secondary houses and casemates; `turret` the main gunhouses; `barrel`
   * every barrel (barrels are fills — 7(m)). `funnelMouth` is the page's one
   * skin-independent fill: the dark inside of every funnel.
   */
  skins: {
    funnelMouth: 0x0b0f13,
    default: {
      yamato: { deck: 0xb8a874, tier: [0x8d969c, 0x7d868c, 0x6f787e], round: 0x9aa3a8, funnel: 0x2f3539, sec: 0x8a9399, turret: 0x7a838a, barrel: 0x3f474c },
      bismarck: { deck: 0xc4a86f, tier: [0x8d969c, 0x7d868c, 0x6f787e], round: 0x9aa3a8, funnel: 0x2f3539, sec: 0x8a9399, turret: 0x7a838a, barrel: 0x3f474c },
      warspite: { deck: 0x6b7176, tier: [0x9aa5ab, 0x8c979d, 0x7e898f], round: 0xa8b2b8, funnel: 0x2f3539, sec: 0x95a0a6, turret: 0x8b969c, barrel: 0x3b4246 },
      iowa: { deck: 0x2f4a6b, tier: [0x3f5f80, 0x365373, 0x2e4866], round: 0x4d6d8e, funnel: 0x1b2838, sec: 0x3b5878, turret: 0x3b5878, barrel: 0x1f2f42 },
    },
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
    // STORY 10.3 (Eric 2026-11-04, epic-10 amendment 8): the three rows are
    // INDICES now — ENGINES / ARMOR / RUDDER, read off the hull envelope's
    // `index` — on index anchors: 1 pip = the average ship (`CONFIG.index.base`,
    // 100), +1 pip per +20 (one ship-ladder card's step). [Story 10.3 reading]
    // Under the scaffold every hull reads the same ARMOR — the truth of it.
    // (Until 10.3: SPEED 30 kn +5, HULL 200 hp +50, TURNING 0.2 rad/s +0.2.)
    // STORY 10.4 wave 2c: ARMOR / POWER / ENGINES (RUDDER is 100 on all four
    // hulls; seven rows measured too tall for the card at 1366×768 — see
    // ui/classSelect.ts PIP_ROWS). [Story 10.4 reading]
    pip: {
      armor: { base: 100, step: 20 },
      power: { base: 100, step: 20 },
      engines: { base: 100, step: 20 },
    },
    /** Ship-card art (Story 10.4 wave 2c): the inset (px) between the 158 px
     *  silhouette box and the art, and the art's opacity on an UNSELECTED card
     *  (the retired silver outline's job: the picked card's ship reads first). */
    cardArtPadPx: 16,
    cardArtOffAlpha: 0.55,
    /** The home class chip's art box (px) — bow right, fitted to the width. */
    chipArtW: 88,
    chipArtH: 40,
    chipArtHullPx: 1.5,

    /**
     * THE HOME SCENE (render/ambientScene.ts + render/ambient.ts) — the game
     * "breathing" behind the DOM menu (UX-DR25), rebuilt in cycle 82 as a real,
     * seeded, WORLD-UNIT slice of the ocean driven by the SHIPPED renderers.
     *
     * The Story 1.14 block this replaces is gone entirely, and so are the things
     * it described: reference-height ring radii, viewport-FRACTION contact
     * drift, ellipse island stand-ins and their `islandFill`/`islandStroke`
     * yellow (both tokens retired with their last consumer). Everything the
     * menu draws is now the game's own — `generateMap` terrain in the
     * hypsometric ramp, the real `Radar` in `return` grammar with the height
     * raster and wake sources wired, `ShipView` hulls on `stepShip` kinematics,
     * the real `Fog` and `Camera` — because the standing Eric ruling of
     * 2026-07-24 is that the ambient must not be "its own thing with its own
     * rules". Nothing here may re-derive a sensor range or a sweep rate: those
     * come from `effectiveStats` at runtime.
     *
     * Photosensitivity: nothing in the scene flashes, and no combat renders on
     * the menu at all.
     */
    ambient: {
      /** The ocean's map seed. Written in DECIMAL — the token guard scan
       *  (tokens.test.ts) rejects a `0x` literal outside the colour source, and
       *  a seed is not worth an exemption (worstCaseScene.ts's precedent). */
      mapSeed: 20260814,
      /** The SCENE seed: anchor, hull placement, circulation senses. */
      seed: 82142026,
      /** The hull the camera follows and the scope belongs to. A battleship:
       *  slow and steady is the right helm for a backdrop. */
      observerClass: 'bismarck',
      /** Rival hull classes, cycled over `rivalBands`. */
      rivalClasses: ['iowa', 'warspite', 'yamato'],
      /**
       * Each rival's roaming ANNULUS about the scene anchor (u), as multiples
       * of base truesight. Band 0 sits inside the bubble (a live silhouette
       * with an on-water wake); bands 1-2 sit out in the radar annulus (pure
       * returns). The outermost radius plus `observerRoamU` stays under base
       * radar range, so a far rival never quietly falls off the scope.
       */
      rivalBands: [
        // Multiples of the RETIRED 500 u sight — today's absolute sizes kept
        // (Story 11.2, 2026-11-12: `FEEL_SIGHT_U`).
        { minU: FEEL_SIGHT_U * 0.2, maxU: FEEL_SIGHT_U * 0.55 },
        { minU: FEEL_SIGHT_U * 1.0, maxU: FEEL_SIGHT_U * 1.2 },
        { minU: FEEL_SIGHT_U * 1.15, maxU: FEEL_SIGHT_U * 1.35 },
      ],
      /** The observer's own roaming disc about the anchor (u). */
      observerRoamU: FEEL_SIGHT_U * 0.33,
      /** How far off the map centre the anchor may be picked (fraction of map
       *  radius) — well inside the boundary, so no hull ever presses the rim. */
      anchorSpreadFrac: 0.5,
      /**
       * SEA ROOM FOR THE WHOLE FORMATION, not for a point.
       *
       * This was 180u — less than a THIRD of the radius the formation actually
       * occupies — so the anchor could legally sit a couple of hull-lengths off a
       * coast while its rivals orbited out to 1.6x truesight straight through the
       * island. The hulls never grounded (the helm is sound) but they spent the
       * whole scene in the coast-escape clause, which walks a hull ALONG a shore
       * and outward: measured across 40 random oceans, every seed that pushed a
       * rival off the scope had anchor room under 300u, and every seed with 315u
       * or more was clean.
       *
       * So the requirement is now DERIVED from what the formation needs — the
       * outermost orbit plus a hull length of slack — instead of being a number
       * that predated the bands it has to contain. On a 2-3% land ocean such
       * water is common (the same 40-seed sweep found rooms up to 910u); when it
       * genuinely is not, `pickWater` still falls back to the roomiest candidate
       * it saw, which is exactly the right failure.
       */
      anchorClearU: FEEL_SIGHT_U * 1.35 + 130,
      spawnClearU: 110,
      /** Seeded rejection-sampling attempts before taking the roomiest miss.
       *  Raised with `anchorClearU`: a stricter predicate needs more looks, and
       *  each look is one `islandDistance` per island against a broadphase. */
      placementTries: 160,
      /** Fixed throttle for every hull — a calm sea, and a tighter turn radius
       *  than full ahead, which is what keeps coast avoidance comfortable. */
      throttle: 0.55,
      /** Coast standoff (u) the helm starts easing away at, and the weight of
       *  that push relative to the circulation term. */
      avoidU: 160,
      avoidGain: 3.2,
      /** The HARD standoff (u): inside this the escape direction is the only
       *  term in the helm. Sized past the worst hull's turning circle at this
       *  throttle (a battleship needs ~48u to swing 90°) — see `desiredHeading`
       *  for the grounding a summed-field-only router actually produced. */
      avoidHardU: 90,
      /** Weight of the spring that holds a hull inside its own annulus. */
      bandGain: 1.6,
      /**
       * THE LEASH, and it is the one term allowed to argue with the coast.
       *
       * Everything else in the helm loses to the hard coast clause by design —
       * that clause returns the escape heading OUTRIGHT, which is what keeps
       * hulls off the rocks and must stay true. But it is also blind to where
       * home is, so a hull hugging a long shore gets walked outward indefinitely,
       * and past base radar range it stops painting and is simply missing from
       * the picture with no cue that anything is wrong.
       *
       * The resolution is to bias WITHIN the escape cone rather than against it:
       * once a hull is past `leashStartFrac` of radar range the escape heading is
       * rotated toward home by at most `leashMaxRad`, scaled by how far past it
       * has drifted. At the cap the hull still holds a majority of its escape
       * component (cos 55 deg ~ 0.57), so the safety property survives — verified
       * by the seed sweep, which asserts zero grounding across every ocean it
       * tries, not just the shipped one.
       *
       * Deliberately NOT an unclamped inward spring in the soft field: that was
       * measured and made things WORSE (6 bad seeds of 40 against 5), because a
       * hull yanked inward drives into the coast it was clearing and re-enters
       * the hard clause more often, which is the mechanism doing the walking.
       */
      leashStartFrac: 0.72,
      leashMaxRad: (55 * Math.PI) / 180,
      /** Heading error (rad) at which the rudder is hard over. */
      rudderBandRad: 0.5,
      /** Camera follow rate (1/s) — slower than the in-match camera: a backdrop
       *  should drift, not track. */
      followRate: 1.2,
      /**
       * The scene's framing: world units across the viewport's SHORT axis.
       * Every placement in this block is a multiple of base truesight, and the
       * picture was composed at a 1,320 u span over a 330 u bubble — four
       * truesights across. Story 9.8 retired the camera's radar-diameter fit
       * (ruling 127) and grew truesight to 500 u, so the span is written in the
       * same unit as the rest of the composition (4 × sight) and the picture —
       * hull out on the right flank, bubble and rivals clear of the home column
       * — holds exactly as composed rather than shrinking behind the DOM.
       */
      spanU: FEEL_SIGHT_U * 4,
      /**
       * Camera-centre offset from the observer (u), in multiples of base
       * truesight. NEGATIVE x pushes the camera left of the hull, which seats
       * the hull — and the one genuinely BRIGHT region of the picture, its
       * truesight bubble — out on the right flank instead of behind the ~480px
       * centred home column. DOM legibility is a gate, not a nicety.
       */
      observerOffset: { x: FEEL_SIGHT_U * -1.45, y: FEEL_SIGHT_U * 0.08 },
      /**
       * Master scene dimmer — alpha over worldRoot + chartRoot (Eric
       * 2026-07-24: the idle radar reads at half strength on the menu).
       *
       * TUNED BY EYE (the Design Note's instruction), and the first pass was
       * far too dark: at 0.55 under the fog AND the scrim, the terrain read as
       * near-black outlines and the ocean as nothing at all. Three darkening
       * layers multiply, so each one has to be gentler than it would be alone.
       * The ruling this honours is comparative — the menu scope reads DIMMER
       * than the in-match one — not a specific number.
       */
      sceneAlpha: 0.82,
      /** The game's OWN fog composite, held back. It is a third darkening layer
       *  over a page that must stay legible, and at full strength it would take
       *  the terrain outside the bubble with it. */
      fogAlpha: 0.38,
      /** Radial legibility scrim (void) over the whole scene, so DOM text stays
       *  readable: centre → mid → edge. Centre is a fraction of viewport height
       *  (the ratified mock's `.scrim` is authored `at 50% 46%`).
       *
       *  PROVENANCE OF THESE NUMBERS, stated exactly: they were tuned BY EYE
       *  against screenshots captured at 1366x768 and 1920x1080, together with
       *  `sceneAlpha` 0.82 and `fogAlpha` 0.38 — three darkening layers that
       *  multiply, so none of them can be judged alone. No contrast ratio was
       *  measured and there is no computed margin over a legibility floor; an
       *  earlier version of this comment claimed one, and nothing in the cycle
       *  supported it. Re-tune the same way (capture, look), or measure — but
       *  do not cite a measurement that was never taken. */
      scrimCenterYFrac: 0.46,
      scrimInnerAlpha: 0.1,
      scrimMidAlpha: 0.26,
      scrimOuterAlpha: 0.44,
    },
  },

  /** Alive camera framing (Story 2.1, Eric ruling 2026-07-24; ABSOLUTE since
   *  Story 9.8, epic-9 ruling 127). Every framing is a world SPAN across the
   *  viewport's SHORT axis — never a factor over radar: today's framings
   *  written as absolute spans. X steps in, Z steps out, the wheel zooms
   *  smoothly. The zoom-IN limit is `closeSpanU`; the zoom-OUT limit is the
   *  WHOLE MAP fitted to the short axis with `reveal.mapFitMargin` (Eric
   *  2026-10-14, amendment 142), and the LIVE storm ring fitted the same way is
   *  a WAYPOINT on the way: a step that would cross it lands on it
   *  (render/camera.ts stepZoom). Past the default framing the centre slides
   *  from own ship to the ring centre at the waypoint (ruling 128), then on to
   *  the map centre at the out limit.
   *  Client-only by design: fog stays server-authoritative, so zoom is never an
   *  information exploit. The spectate zoom (render/spectate.ts) shares this
   *  range and these steps since Eric's 2026-10-14 ruling, anchored at the
   *  cursor instead of the own ship (Camera.zoomAbout). */
  zoom: {
    /** Zoom-IN limit (u across the short axis): ruling 127, today's 1.5× close
     *  view written as an absolute span (1,320 / 1.5) — never a factor over
     *  radar. */
    closeSpanU: 880,
    /** DEFAULT framing (u across the short axis): ruling 127, today's 1.0×
     *  scale (the old 2 × 660 u radar fit) written as an absolute span — never
     *  a factor over radar. `baseZoom` = shortAxis / this. */
    defaultSpanU: 1320,
    /** LOG step per X/Z keydown (auto-repeat allowed — hold to zoom): next =
     *  factor × e^±keyStep (render/camera.ts stepZoom) — ×1.105 / ×0.905 per
     *  press, today's ±0.1 feel at the default framing, the same perceived step
     *  out at the ring fit. */
    keyStep: 0.1,
    /** LOG step per wheel deltaY unit (next = factor × e^(−deltaY × this)):
     *  one 100-unit notch is ×0.923, today's −0.08 at the default framing. */
    wheelRate: 0.0008,
  },

  /**
   * THE OMNISCIENT REVEAL (Story 5.3, epic-5 amendments 24-26) — the camera
   * pull-back to the whole ocean when your own hull founders. Client-only feel:
   * the reveal discloses nothing new (a spectator's frames already carry every
   * afloat-or-sinking hull unfogged), it only decides how much of that water is
   * on screen and how long the camera takes to get there. Nothing here is
   * gameplay-authoritative, which is why it lives in this file rather than in
   * shared CONFIG.
   *
   * There is no `zoomFactor` knob: the framing is DERIVED at kickoff by
   * render/camera.ts's `revealZoomFactor()` as an ABSOLUTE span — the Game's
   * live mapRadius × 2 × `mapFitMargin` across the short axis (amendment 25;
   * Story 9.8 ruling 127 retired the radar term; Story 6.2 makes map sizing
   * roster-dynamic). The same margin fits the alive zoom-out limit to the live
   * ring (`zoom` above).
   */
  reveal: {
    /** Nominal travel time (ms) of the pull-back, before the motion setting
     *  scales it (amendment 26: `full` ×1, `reduced` ×0.5, `off` snaps). */
    zoomMs: REVEAL_ZOOM_MS,
    /**
     * Exponential approach rate (1/s) handed to Camera.beginReveal(), derived
     * from the authored duration above so there is ONE number to tune. Same
     * easing vocabulary — and the same units — as `camera.followRate`, which is
     * how the camera's centre has always been smoothed.
     */
    zoomRate: REVEAL_ZOOM_TAUS / (REVEAL_ZOOM_MS / 1000),
    /**
     * Fit margin (> 1): the reveal frames a disc this much larger than the map,
     * so the ocean's edge sits just inside the screen's short axis instead of
     * flush against it. 1.05 = a 5% border — enough to read the boundary as a
     * boundary, not enough to waste the frame the whole feature is about.
     */
    mapFitMargin: 1.05,
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
     * fixed world width would thin the coastline to a hairline at the wide end
     * of the user-zoom range (the live ring fit since Story 9.8) — a hairline at precisely the moment the
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
     * No CONSTANT factor can bound that: the camera frames an absolute span on
     * the SHORT axis (out to the live ring fit, Story 9.8), so a short-wide
     * viewport at the widest user zoom already sees
     * a very wide slice of ocean on a 3440×720 screen, and spectate free-pan is
     * UNCLAMPED — the camera can travel arbitrarily far from any ring, so no
     * fixed multiple of the map radius is provably enough. So the renderer computes
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
     * the on-screen width is constant across the whole user-zoom range (close
     * framing to ring fit) instead of thinning to a hairline when you zoom out.
     */
    edgePx: 2,
    telegraphPx: 2,
    /**
     * THE COLLAPSE MARK (sudden death, Eric ruling 2026-08-14) — the X drawn at
     * the point the final ring closes onto: `markPx` is the arm stroke width,
     * `markArmPx` the half-length of each diagonal arm (so the X spans
     * 2 × markArmPx on the diagonal). BOTH are screen px divided by the camera
     * zoom at draw time, exactly like the edges above — a world-space arm length
     * would swell into a giant cross at min zoom and vanish at max.
     *
     * The stroke matches `telegraphPx` because the mark IS the telegraph for a
     * ring with no radius; the arm is sized to read as a deliberate mark at a
     * glance without competing with a contact marker (the fog hole is a
     * truesight radius — hundreds of px at the default framing — so a 24px X
     * is a small, unmistakable cross on the water).
     */
    markPx: 2,
    markArmPx: 12,
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
   * THE HUD BED (epic-10 amendment 18 R24, Eric 2026-11-10: "all these areas
   * at least need some translucent backgrounds so I can read them over the
   * radar returns"): the dark-glass bed under the DOM and Pixi HUD surfaces
   * outside the consoles — the `cardScrim` token at `alpha`, a `edgeW` px
   * `hairline` edge, square corners (render/hudBed.ts). `chromePad` is the
   * chrome bar bed's reach past its text row; `feedPadX`/`feedPadY` the
   * kill feed's per-line bed padding and `feedGap` the water between two
   * lines' beds — sized so six bedded lines still fit the feed's clearance
   * above the offer group (`console.killFeed.clearance`). `alpha` is 0.7
   * (Eric 2026-11-10: the beds at 70 %; round 3 had set 0.5 — the map reads
   * through, the text stays legible), down from the first build's .78.
   */
  hudBed: { alpha: 0.7, edgeW: 1, chromePad: 8, feedPadX: 8, feedPadY: 1, feedGap: 3 },

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
     *  slot the retired 3.1 `zoneLine` register held: the HUD's one edge
     *  margin (`margin` below). */
    y: 24,
    /** The HUD's top edge margin (px) the match line / match tag hang off
     *  (render/hud.ts). Carried over from the retired `vitals` block
     *  (Story 10.10), unchanged. */
    margin: 24,
    /** THE SATELLITE COLUMN under the chrome bar (render/hud.ts
     *  `stormWarnAnchor` / `tellAnchor`) — carried over from the retired
     *  `vitals` block (Story 10.10), unchanged; epic-8 amendment 38 had already
     *  hung it off this bar. `stormAbove`: IN STORM's top edge, px BELOW the
     *  chrome bar's bottom edge — 8 px gap + the DOM banner's ~38 px box
     *  ("GOING DOWN WITH THE SHIP!", RECONNECTING…) + 8 px, so a sinking
     *  captain inside the storm reads both lines, stacked. `tellGap`: the
     *  storm-line-to-first-tell gap and the gap between stacked VICTIM TELLS
     *  (SLOWED); `tellSize` / `tellSpacing`: the tells' mono size and
     *  tracking. */
    stormAbove: 54,
    tellGap: 22,
    tellSize: 16,
    tellSpacing: 1.5,
    /** Row type: mono (CLIENT_CONFIG.type.mono). STORY 10.10 (R13, the
     *  orchestrator plan's O12 — same content, same place, the battle
     *  consoles' register): 18 → 14 px at weight 600, the consoles' value
     *  register; Geist Mono is monospaced, so the figures stay tabular. */
    fontSize: 14,
    fontWeight: '600',
    /** Letter-spacing (px). The bar is a READOUT, not prose — the tracking is
     *  what makes a dense one-line register scan as separate facts. Story
     *  10.10 scaled it with the type (2 px at 18 → 1.5 px at 14, the same
     *  ≈ .11 em). */
    letterSpacing: 1.5,
    /** Alpha of the ` · ` separators — punctuation, the dimmest mark in the
     *  row, and nothing about them is information. (Story 10.10 retired the
     *  dim-phosphor `labelAlpha`: the words are text-primary now, as on the
     *  consoles.) */
    sepAlpha: 0.35,
    /** THE HAIRLINE under the row (Story 10.10, O12): a 1 px phosphor rule at
     *  .25, `gap` px under the type, spanning exactly the row's text — a
     *  floating mark, no bed (DESIGN.md's Afterimage rule). */
    hairline: { w: 1, alpha: 0.25, gap: 4 },
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

  /** End-of-match results overlay feel + the mockup-F3 panel geometry. */
  results: {
    /**
     * THE FULLSCREEN DIM behind the modal (over `colors.fogBase`) — mockup F3's
     * `rgba(2,6,4,.62)`.
     *
     * THIS NUMBER IS THE FEATURE, not a styling detail (Story 5.3, amendment
     * 24): the omniscient reveal is the BACKDROP the modal sits on rather than
     * a beat of its own, so the dim has to be thin enough to read the whole
     * ocean through. The shipped 0.88 near-opaque black would have hidden the
     * entire pull-back. Do not "tidy" it back up.
     */
    dimAlpha: 0.62,
    /** Panel column (px) — mockup F3 `.results` width. */
    panelWidth: 620,
    /** Panel padding, verbatim from mockup F3 (heavier at the head than the foot
     *  so the banner has air above it). */
    panelPad: '40px 44px 36px',
    /** {rounded.lg} — port chrome goes soft; the tactical register's hard corners
     *  stay on the water (DESIGN.md:217). */
    panelRadius: 12,
    /** {rounded.md} — buttons and the dashed last-offer cards. */
    controlRadius: 8,
    /**
     * ms — arming grace before results-phase ESC/Enter drive RETURN TO PORT.
     * The refit modal can be open the instant results land; an ESC/Enter the
     * player aimed at THAT modal would otherwise land on the freshly-shown
     * results screen and instantly tear the match down before they read it.
     * The button click path has no grace (a click can't be aimed at a modal
     * that is already gone).
     */
    keyGraceMs: 400,
    /** THE LOADOUT BLOCK's row (ui/loadoutBlock.ts) — the retired HUD bar's
     *  square geometry (mock `hud-composite-3.html`), carried over from the
     *  deleted `hudBar` block (Story 10.10) unchanged so the results screen's
     *  LOADOUT twin keeps its look; the block scales these by its own
     *  LOADOUT_SCALE. Square, icon box and gap; key chip height / min width /
     *  glyph padding / seam under the square; the tier numeral's corner inset;
     *  the chip and tier type (px). */
    loadout: {
      slot: 54,
      icon: 28,
      slotGap: 8,
      chipH: 16,
      chipMinW: 16,
      chipPadX: 3,
      chipGap: 5,
      tierInset: { right: 4, bottom: 2 },
      type: { chip: 9, tier: 9 },
    },
  },

  /**
   * THE STANDARD PAGE CHROME (Story 7.2, Eric ruling R12) — the port's
   * FULL-PAGE register, as opposed to the modal register above.
   *
   * IT HAD NEVER BEEN BUILT. The pattern existed as two sentences and no
   * component: DESIGN.md:94/:201 ("DOM port chrome … centers at
   * {spacing.chrome-max-width} max", UX-DR39) and EXPERIENCE.md:37 ("standard
   * page chrome; ESC/back returns home"). `1100` appears nowhere else in the
   * client AS A WIDTH — every other occurrence of that number is a z-index rung
   * — so this is the token's first and only home, and `ui/page.ts` is its only
   * reader. Nothing may restate it.
   *
   * The bed geometry is deliberately the SETTINGS overlay's rather than a new
   * one: {colors.panel} bed, 1px hairline, {rounded.lg}, `box-sizing:border-box`
   * beside its own `overflow-y:auto` (amendment 47, the container-fit law).
   * Story 7.3's How-to-Play page inherits all of it.
   */
  page: {
    /** {spacing.chrome-max-width} — the ratified port-chrome column cap (px). */
    maxWidthPx: 1100,
    /** Panel padding (px) — the settings bed's own `panelPad`, restated here
     *  rather than read across so a page can be re-proportioned without moving
     *  the settings overlay with it. */
    pad: 28,
    /** {rounded.lg} — port chrome goes soft; hard corners stay on the water. */
    radius: 12,
    /** Gutter (px) between the panel and the viewport edge. */
    gutter: 24,
    /** Vertical rhythm (px) between the page's stacked blocks — {spacing.lg}. */
    gap: 24,
    /** The How-to-Play entry glyph box (px) — the retired HUD bar's icon size
     *  (`hudBar.icon`, deleted in Story 10.10), unchanged. */
    glyph: 28,
  },

  /**
   * THE PRIVACY POLICY'S ADDRESS — and, since Story 7.4, nothing else.
   *
   * Story 7.2 shipped a whole consent-card geometry block here (a z-1250 rung,
   * a fade, padding, gap, inset, width cap and two radii). Eric deleted the card
   * itself on 2026-08-19 — Google's own certified CMP is the single consent
   * dialog now, covering ads and analytics together — so the geometry went with
   * it in the cycle-69 grey-NO-DATA style: no dead knob survives a deleted
   * surface. The z-1250 rung is retired from the ladder; the ladder's own note
   * lives on `settings.zIndex`.
   *
   * `policyHref` SURVIVES BECAUSE IT IS LOAD-BEARING, and by more than one
   * reader. `ui/home.ts` builds the port's PRIVACY link from it and the
   * How-to-Play page footers to it, and that anchor has to be a real, crawlable
   * URL for AdSense's site review — which is exactly why Story 7.2 built it as
   * an `<a>` rather than a click handler.
   */
  consent: {
    /** Where the policy link points. Eric ruling R8: the policy lives at
     *  `/privacy`, and `client/privacy/index.html` is the Rollup entry that puts
     *  it there. */
    policyHref: '/privacy',
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
    /**
     * Overlay chrome: z between the refit modal (1000) and the home (1100).
     *
     * THE FULL RATIFIED LADDER, stated once here: toast stacks 900 < refit modal
     * 1000 < settings 1050 < home 1100 < queue modal 1150 (ui/queueModal.ts,
     * Eric 2026-08-18) < class bay 1200. The queue modal takes the rung ABOVE
     * the home because it covers the port while a join is in flight; the class
     * bay is above it in turn but unreachable then (`openLayer` refuses while
     * busy). The class bay is the top of the ladder.
     *
     * STORY 7.2's CONSENT BAR HELD A 1250 RUNG ABOVE ALL OF THEM, AND IT IS
     * RETIRED (Story 7.4): Eric deleted the self-built consent card in favour of
     * Google's own CMP, which manages its own stacking. No client rung replaces
     * it, and nothing may claim 1250 without a fresh cut of this register.
     *
     * This is now the ONLY rung that is a config value. The rest are literals at
     * their call sites, each carrying a pointer back here.
     */
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
   * THE ATTENTION SEAM (Story 3.2 / amendment 16, generalized by Story 4.8) —
   * the tunable half of EXPERIENCE.md's attention-priority table. The tiers
   * themselves are RULES, not knobs, and live in render/attention.ts; the one
   * thing here is the ranking the amber corollary needs.
   */
  attention: {
    /**
     * THE AMBER RANK — which amber channel pulses when both are live, highest
     * priority first. Two amber channels can be simultaneously active: the
     * chrome bar's final-10s ring pulse (Tier 2) and the HULL GAUGE's amber band
     * (25-50%, untiered by amendment 239). The corollary says only the
     * highest-tier active amber pulses, so `ring` outranks `hullGauge`: at 40%
     * hull with the storm closing in 8 seconds, the storm is what kills you.
     * Below 25% the gauge turns crimson, leaves the amber set entirely and
     * becomes Tier 1 — under which BOTH ambers hold lit, which is how amber
     * keeps meaning "look here" at the climax.
     *
     * Story 8.6 renamed the HP channel `hpRail` -> `hpGlobe` with the surface it
     * names (the 6 px vertical rail became a bowl of water at the HUD bar's left
     * end). Story 10.10 renamed it `hpGlobe` -> `hullGauge`: the globe retired
     * into the ship console's segmented hull bar (render/console/hull.ts).
     * ONE spelling, here and in render/attention.ts.
     */
    amberRank: ['ring', 'hullGauge'] as const,
  },

  /**
   * THE AGGREGATE FLASH BUDGET (Story 4.8, amendment 240) — the mechanism behind
   * the ratified photosensitivity floor *"no element or screen region flashes
   * more than 3x/s regardless of how many compliant events stack"* (NFR13 /
   * EXPERIENCE.md:138 / DESIGN.md:256), which had never existed in code.
   *
   * It governs ONE-SHOT flashes only. Every BREATHING channel is exempt BY
   * CONSTRUCTION: each is capped at `settings.pulseCapHz` (1.1 Hz) or below,
   * well under 3 flashes/s, so counting them would be counting something that
   * cannot bind.
   *
   * Two stages, neither of which invents a principle: COALESCE co-located
   * same-kind flashes within one frame (amendment 37's one-frame-one-cue grammar
   * extended from audio to visuals), then DEGRADE anything still over budget to
   * its already-ratified `motion: 'off'` keyframe. It never DELETES: its biggest
   * stackers (muzzle, spark, splash, hull hit) are declared information, and the
   * motion setting removes MOTION, never INFORMATION.
   */
  flashBudget: {
    /** The screen is divided into this grid for region-scoped claims, so a
     *  region is a stable ~1/12 of the viewport at any resolution rather than a
     *  pixel box that means something different on every monitor. */
    regionCols: 4,
    regionRows: 3,
    /** THE RATIFIED AGGREGATE FLOOR: at most this many flash ONSETS per key per
     *  window. Straight from NFR13 / EXPERIENCE.md:138 — not a feel number. */
    maxPerSecond: 3,
    /** The sliding window (ms) the onsets are counted over. Pruned BY TIMESTAMP,
     *  never by count, so a backgrounded tab cannot burst-degrade on restore. */
    windowMs: 1000,
    /** Flat alpha a DEGRADED one-shot holds for its full life, as a fraction of
     *  the peak it would have ramped from. The mark keeps its presence, position
     *  and weight; only the luminance RAMP is spent.
     *
     *  IMPLEMENTER DRAFT AWAITING ERIC'S EYE (the Story 4.7 stamping convention,
     *  amendment 238): the MECHANISM is ratified (amendment 240), this
     *  particular number is not. */
    degradeAlphaFactor: 0.35,
    /** Position quantum (world units) for the per-frame coalescer's key — the
     *  gunneryFeed `IMPACT_KEY_U` convention, reused rather than forked. Two
     *  genuinely distinct flashes 0.1u apart are a ten-thousandth of a hull
     *  length apart and could not be told apart on screen anyway. */
    coalesceQuantumU: 0.1,
  },

  /**
   * THE BATTLE CONSOLES (Story 10.10, Eric 2026-11-09, epic-10 amendments 16 /
   * 17; the orchestrator plan's O2–O6) — the SHIP console on the left edge,
   * the WEAPONS console on the right edge and the OFFER GROUP between the kill
   * feed and the weapons console. They replace the bottom-centre HUD bar, the
   * Tab refit band and the level-up toast.
   *
   * Every size is LOGICAL px (pre-UI-scale, authored at 1080p, fixed — the
   * bar's rule). The pure spine `render/console/layout.ts` turns these into
   * rects; nothing else in the game reads a console number from anywhere but
   * here. The `hull` / `chip` / `tick` / `helmGlyphs` sub-blocks carry the
   * ratified timing and gates the retired `vitals` / `xpRail` / `hudBar`
   * blocks held (deleted in Story 10.10's W3), by REFERENCE where the old
   * block referenced a shared number.
   */
  console: {
    /** The ship console's and the offer group's content width. */
    width: 280,
    /** Gap from the viewport's left / right edges to a console's BED edge. */
    sideInset: 18,
    /** Gap from the viewport's bottom edge to a console's BED edge — both
     *  consoles are bottom-anchored. */
    bottomInset: 18,
    /** THE BED (epic-10 amendment 18 R24, Eric 2026-11-10: "all these areas
     *  at least need some translucent backgrounds so I can read them over the
     *  radar returns"): every console sits on the dark-glass bed of
     *  `CLIENT_CONFIG.hudBed`, reaching this far past its content on every
     *  side (render/console/layout.ts `bedOf`). */
    bedPad: 10,
    /** The least clear water between the two consoles' beds (O14), held at
     *  the three reference screens at the 100 % tier. */
    centerClearMin: 700,
    /** The kill feed's clearance above the offer group: its `top:16px`, up to
     *  six lines (~150 px), then a 12 px gap — the offer's BED top edge is
     *  16 + 150 + 12 = 178. */
    killFeed: { top: 16, clearance: 150, gap: 12 },
    /** THE OFFER GROUP (R22; R26, Eric's pick 2026-11-10: the merged card
     *  face at the "original narrow width", and "a toggle in settings so the
     *  player can choose if they want the offer to appear on the right, left,
     *  or bottom"). The face: `cardW` x `cardH` cards — a `glyphBox` px glyph
     *  box at (`pad`, `pad`), the NAME beside it (two lines allowed), the tier
     *  numeral bottom-left and the `TAB` `n` chip bottom-right on a `footH`
     *  line `pad` above the bottom edge.
     *
     *  RIGHT / LEFT — the STACK: a `header` px header line (`n LEVELS`), at
     *  the countdown REDRAW (`redrawW` x `redrawH`) on its own full-width line
     *  under it (`headerGap` apart), then the four cards stacked `gap` apart.
     *  RIGHT sits under the kill feed's clearance; LEFT at `ship.topClearance`
     *  (the chrome bar's). BOTTOM — the ROW: the four cards in one row `gap`
     *  apart, centred on the screen, bed `bottomInset` off the bottom edge;
     *  the header in a `bar.headW` slot at its left and REDRAW at its right,
     *  `bar.gapIn` apart. `clearGap` is the least water kept between the
     *  offer's bed and a console's. Where a chosen stack cannot keep it (a
     *  short logical viewport) the group FALLS BACK TO THE BOTTOM ROW (Eric
     *  2026-11-10, round 3 — the O15 top-left dock is gone). */
    offer: {
      header: 22,
      headerGap: 6,
      cardW: 136,
      cardH: 64,
      gap: 6,
      redrawH: 30,
      redrawW: 112,
      clearGap: 12,
      bar: { headW: 100, gapIn: 12 },
      /** The card face (ui/offerGroup.ts) — the merged face. */
      glyphBox: 28,
      glyph: 20,
      pad: 6,
      footH: 16,
      /** Carried over from the retired band's `refit` block, unchanged: a
       *  refused card's face alpha, the whole group's alpha while a pick is in
       *  flight, and the denied pulse's life and same-source floor. */
      greyedAlpha: 0.55,
      lockedAlpha: 0.38,
      deniedPulseMs: 80,
      deniedFloorMs: 300,
    },
    /** ONE WEAPON CELL-BUTTON — W2, Eric's pick (R26) with the never-wrap
     *  clocks (R27, Eric 2026-11-10: "If they are all on cooldown, they get
     *  pushed to new lines. That doesn't work."). Every cell is `w` wide; the
     *  box is 2 x `w` + `colGap`. Top to bottom inside a cell, FIXED heights:
     *  `padY`; line 1 (`headerH`) NAME · tier numeral · key chip; the MOUNT
     *  line (`mountH`) — `clock` px rings with the seconds numeral INSIDE
     *  (`clockTracking` px on a three-character numeral), `clockGap` apart,
     *  four to the line and nothing else on it; the mines' racks one ring
     *  each with that rack's `rackPip`s in a short column `rackGap` right of
     *  it; the secondaries' `heatH` bar instead; then `statLines` stat lines
     *  of `statLineH` (the left cells print `leftStatLines`), ONE STAT PER
     *  LINE; `padY`. The cell height H is DERIVED from these (layout.ts
     *  `CELL_H`) — never grown at runtime. No state word: ready = the solid
     *  rings, armed = the amber outline + wash + filled chip, locked = the
     *  denied hatched heat bar + red outline (Eric 2026-11-10, round 3).
     *  `tierGap` is the seam either side of line 1's tier numeral. */
    cell: {
      w: 200,
      colGap: 8,
      rowGap: 8,
      padX: 8,
      padY: 6,
      headerH: 20,
      mountH: 44,
      statLineH: 20,
      statLines: 4,
      leftStatLines: 3,
      clock: 40,
      clockGap: 6,
      clockTracking: -0.6,
      tierGap: 4,
      keyChip: 18,
      rackPip: { w: 10, h: 10, gap: 1 },
      rackGap: 4,
      heatH: 12,
    },
    /** THE THREE ABILITY BUTTONS (O5, R23) spanning the weapons box's full
     *  width beneath both columns, equal widths, `gap` apart; `topGap` is the
     *  seam between the columns and the buttons. */
    abilities: { h: 56, gap: 8, topGap: 8, progressH: 2 },
    /** THE SHIP CONSOLE (O6; R21, Eric 2026-11-10: "You put WAY too much
     *  margin between the elements … Takes up *way* too much real estate"):
     *  COMPACT — fixed spacing, its height the sum of these parts,
     *  bottom-anchored with the water above. Top to bottom: the hull numeral
     *  line over the 10-segment bar; six index rows each with a five-bar TIER
     *  LADDER (R20, right-aligned); the helm block; the level block — the
     *  sections `sectionGap` apart. `topClearance` is the top-centre chrome
     *  bar's row plus a gap: nothing of the consoles reaches above it. */
    ship: {
      topClearance: 60,
      sectionGap: 14,
      hullLine: 44,
      hullBarGap: 6,
      hullBarH: 14,
      segments: 10,
      segmentGap: 2,
      indexRowH: 30,
      indexRowGap: 4,
      indexLabelW: 88,
      tierBars: 5,
      tierBar: { w: 20, h: 10, gap: 4 },
      helmReadoutH: 24,
      helmGap: 6,
      ladderW: 200,
      ladderH: 16,
      rudderRowH: 12,
      rudderTrack: 48,
      levelRowH: 28,
      trackGap: 4,
      trackH: 8,
      bankChip: 28,
    },
    /** The helm ladder's marks (O6 (3)): plain / STOP tick lengths, the hollow
     *  ordered rung, the solid actual needle and the rudder's position tick. */
    tick: { len: 6, stopLen: 10, rungW: 7, rungH: 10, needleW: 2, rudderW: 2, rudderH: 8 },
    /** Type sizes (px) per console register — THE TEXT RULE (epic-10
     *  amendment 18 R23, Eric 2026-11-10: "How many times do I need to call
     *  you out for the tiny text? Every time? Stop it!"), authored at the
     *  1920×1080 reference before the viewport factor: every readable VALUE
     *  ≥ 17 px / 600 (the hull numeral bigger), every LABEL ≥ 14 px, key chips
     *  and tier numerals ≥ 12 px. Never shrunk to fit — the box grows. */
    type: {
      // values
      statValue: 17,
      clock: 17,
      abilityState: 17,
      abilityNumeral: 17,
      hull: 40,
      hullUnit: 17,
      indexValue: 20,
      hdg: 20,
      kts: 17,
      lv: 22,
      bankCount: 17,
      // labels
      name: 14,
      statLabel: 14,
      abilityName: 14,
      label: 14,
      indexLabel: 14,
      offerHeader: 14,
      offerName: 14,
      offerTier: 14,
      redraw: 14,
      // chips and tier numerals
      tier: 12,
      keyChip: 12,
      offerChip: 12,
    },
    /** THE HULL GAUGE's bands and breath — the HP globe's, carried over. The
     *  bands REFERENCE shared `CONFIG.damageBands` (exactly one set of band
     *  numbers may exist — Story 4.4, amendment 41); the breath ramps from
     *  `pulseMinHz` at the amber line to the shared `settings.pulseCapHz` at
     *  `pulseFloorFrac`. `pendingAlpha` is the lighter pooled-repair segment. */
    hull: {
      amberBelow: CONFIG.damageBands.amberBelow,
      criticalBelow: CONFIG.damageBands.criticalBelow,
      pulseMinHz: 0.5,
      pulseFloorFrac: 0.1,
      pulseAmp: 0.15,
      fillAlpha: 0.85,
      pendingAlpha: 0.35,
    },
    /** THE BANK CHIP's breath — the XP strip's, carried over unchanged: a 2.4 s
     *  cycle that decays to a static chip after 10 s unspent. */
    chip: { breathSec: 2.4, unspentSec: 10, chipAlpha: 0.85, pulseAmp: 0.15 },
    /** Below this many ms a reload clock's numeral prints tenths (`1.2`);
     *  above it whole seconds rounded UP (the cooldown wipe's grammar). */
    tenthsBelowMs: 2000,
    /** Carried over from the retired `hudBar` block, unchanged: the alpha the
     *  weapons console drops to while the start line is held, the Gaussian
     *  blur reach (px) of the one glow filter under the row-buttons (epic-9
     *  amendment 39: no emulated shadow glow), a key chip's horizontal glyph
     *  padding, and the hairline width of every 1 px rule. */
    dimAlpha: 0.38,
    glowBlurPx: 8,
    chipPadX: 3,
    lineW: 1,
    /** HELM KEY GLYPHS (amendment 26 — carried over from the retired `vitals`
     *  block, unchanged): the W/S and A/D chips at the helm's ends fade
     *  PERMANENTLY, per pair, after `fadeCount` successful inputs, over
     *  `fadeSec` (instant at motion=off). Progress lives under its own
     *  standalone localStorage `key` — deliberately NOT in the settings store,
     *  so RESET SETTINGS cannot resurrect learned anatomy. */
    helmGlyphs: { fadeCount: 3, fadeSec: 0.6, key: 'hullcracker.helm' },
    /** THE VIEWPORT FACTOR (epic-10 amendment 18 R25, Eric 2026-11-10: "on my
     *  13" macbook pro, all of the UI elements are far too big"): the whole HUD
     *  is authored at the `refW` × `refH` reference and scales by
     *  clamp(min(w ÷ refW, h ÷ refH), min, max), times the settings tier
     *  (settings/store.ts `viewportScale` / `hudScale`). */
    viewport: { refW: 1920, refH: 1080, min: 0.75, max: 1.0 },
  },

  /**
   * PHOSPHOR SHELLS BURNING ZONE (Story 8.17, epic-8 amendment 131; body
   * re-made by Story 9.11, epic-9 amendment 154) — render/burnZones.ts. The
   * zone is WHITE FIRE ON THE WATER: a field of `render/fire.ts` flame tongues
   * scattered over the whole disc, denser toward the middle, seeded from the
   * zone id so every observer sees the same fire. The zone keeps the family glow
   * (soft fill + ring, Eric on the rendered page 2026-10-16, amendment 181:
   * "I want the inside of the zone to be colored, too, not just the ring") —
   * own white, another's the alert blend (amendment 153). The crimson
   * ember disc of epic-8 amendment 135(i) and its knobs are DELETED.
   */
  burnZone: {
    /** Tongues per 1000 u² of zone area: N = clamp(round(density · π r² /
     *  1000), flameMin, flameMax). Extent is information — never motion-gated.
     *  4.0 is Eric's pick on the rendered page (2026-10-16, amendment 181):
     *  126 tongues on a tier-I 100 u zone. */
    flameDensityPer1000U2: 4.0,
    flameMin: 6,
    /** The hard cap on one zone's tongues (a huge zone stays affordable):
     *  a tier-V zone (100 × 1.1⁴ ≈ 146 u) at 4.0 wants 268. */
    flameMax: 300,
    /** u — the radius a tongue's teardrop is DRAWN at (`flameTongue(flameR)`). */
    flameR: 14,
    /** The tongue's white halo and its hotter white core (additive). */
    flameHaloAlpha: 0.35,
    flameCoreAlpha: 0.9,
    /** How far ANOTHER captain's flames lean from white toward the alert blend
     *  (0 = pure white, 1 = the ring's color). Eric 2026-10-16 (epic-9
     *  amendment 183): "I want the white flames themselves … tinted by the
     *  flash, too, so it ABSOLUTELY reads as hostile. Ever so slightly." Own
     *  fire stays white. A feel knob. */
    flameAlertMix: 0.3,
    /** The flicker: a fast sin wobble on each tongue's alpha and width,
     *  amplitude scaled by motion intensity (exactly still at `off`) — the
     *  render/fire.ts rule: it is a wobble, never an on/off. */
    flickerHz: 6,
    flickerAmp: 0.25,
    /** Each tongue's seeded size, a uniform draw in [min, max] × `flameR`. */
    flameScaleMin: 0.7,
    flameScaleMax: 1.3,
    /** The exponent on the radial draw: a tongue sits at distance
     *  `r · √(u)` with `u = rng^bias` (the weedStrokes √u scatter on a biased
     *  draw). bias 1 = uniform over the area; 2 = `r · rng`, an area density
     *  ∝ 1/ρ — visibly thicker toward the middle, still reaching the ring.
     *  See burnFlames(). */
    flameCenterBias: 2,
    /** A burn tick is a DoT, not a slam: the victim's shake is scaled to this
     *  fraction of an ordinary hit's so standing in fire nudges instead of
     *  hammering (the tone + the zone under the hull carry the information). */
    burnShakeScale: 0.35,
  },

  /**
   * FOULING SHELL FOUL ZONE (Story 9.4, epic-9 amendments 61–69) —
   * render/foulZones.ts. FEEL ONLY: client knobs Eric may re-tune on staging;
   * the server reads none of them (the zone's radius rides the wire as `r`).
   * Ruling 68: the zone reads as its own kind at a glance. It wears the zone
   * family's firer-hue glow ring (whose it is) and, inside it, Eric's "weed
   * and net" (round-3 pick "bold", 2026-10-12): a faint LIGHTER slick disc in
   * `colors.foulSlick` (the sea is near-black — it cannot be darkened), a
   * diagonal mesh of straight lines in the firer's hue clipped to the slick,
   * and short seeded squiggles in `colors.foulWeed` on top. The weed layer
   * sways gently (motion-gated); the strokes themselves never change.
   */
  foulZone: {
    /** The slick disc's radius as a fraction of the zone radius (the net and
     *  the weed live inside it). Feel knob; Eric may re-tune on staging. */
    slickFrac: 0.8,
    /** The slick disc's alpha (normal blend, lighter than the sea). A soft rim
     *  at the full zone radius is drawn at half this alpha. Feel knob. */
    slickAlpha: 0.3,
    /** u — spacing between the parallel net lines (both diagonals). Feel knob. */
    netSpacingU: 14,
    /** px-ish stroke width of a net line. Feel knob. */
    netWidth: 1.3,
    /** Alpha of the net lines (firer's hue, over the slick). Feel knob. */
    netAlpha: 0.55,
    /** How many weed squiggles per zone (seeded from the zone id, so every
     *  observer sees the same ones). Feel knob. */
    weedCount: 8,
    /** px-ish stroke width of a weed squiggle. Feel knob. */
    weedWidth: 1.8,
    /** Alpha of the weed squiggles (`colors.foulWeed`). Feel knob. */
    weedAlpha: 0.75,
    /** u — length of one squiggle along its heading. Feel knob. */
    weedLenU: 40,
    /** u — sideways amplitude of a squiggle's two humps. Feel knob. */
    weedAmpU: 6,
    /** u — how far the whole weed layer sways (motion-scaled; 0 at motion
     *  off). Feel knob. */
    weedDriftU: 4,
    /** Hz — the weed sway's rate (integrated phase, well under the
     *  photosensitivity ceiling). Feel knob. */
    weedHz: 0.25,
  },

  /**
   * HULL CONTACT legibility (render/contactFx.ts + the `grind` tone, Story 9.5,
   * epic-9 amendment 79) — FEEL ONLY: client knobs judged on staging; Eric may
   * re-tune them. The server reads none of them and the damage never depends
   * on them (it rides the server's `dmg`, with the existing shake and `damage`
   * thud). A STRIKE (closing speed over `CONFIG.ram.allowanceU`, on the edge a
   * pair first touches — or the own hull first touches land) throws a brief
   * spark burst at the contact point in both hulls' colors (land: own color +
   * the shore stroke); a BLEEDING contact (a hull scrape or sustained press —
   * `vt + vn`, amendment 83 — or a coast slide; sim/contactBleed.ts) plays a
   * short retriggered `grind` scrape, and while it bleeds the small windowed
   * contact `dmg` plays no thud and no shake (the grind is the cue). Sparks are motion (none at motion off); the sound is not.
   */
  contactFx: {
    /** Particles per strike burst (alternating the two colors). */
    sparkCount: 10,
    /** ms — one spark's life (alpha fades linearly to 0). */
    sparkLifeMs: 450,
    /** u/s — a spark's mean outward speed. */
    sparkSpeedU: 60,
    /** ± fraction of `sparkSpeedU` a spark's speed spreads by. */
    sparkSpeedSpread: 0.5,
    /** px-ish — one spark's radius. */
    sparkSizePx: 2,
    /** u/s — bleed speed (hull row `vt + vn`, coast slide) above which a
     *  contact grinds and counts as bleeding. */
    grindMinVt: 8,
    /** Peak gain of the grind scrape (the tone's spec volume). */
    grindGainMax: 0.35,
    /** u/s — bleed speed at which the grind reaches `grindGainMax` (the
     *  calibration scrape, a speedboat sliding past at 45). */
    grindFullVt: 45,
    /** ms — the scrape is retriggered this often while grinding (the tone
     *  table has no loops; one scrape spans about one retrigger). */
    grindRetriggerMs: 120,
    /** ms — grinding stops this long after the last frame that bled. */
    grindReleaseMs: 150,
    /** hp — while the own hull bleeds, an own `dmg` event UNDER this plays no
     *  thud and no shake: the server's 500 ms windowed contact bleed never
     *  exceeds ~15 hp, a ram hit is many tens. A big `dmg` during a scrape (a
     *  ram hit, a shell) still thuds and shakes. ×3 with the hull in Story 10.3
     *  (was 8 at 300–350 hp hulls; every hull is 1000 now). */
    bleedThudMaxHp: 24,
    /** ms — the own hull still counts as bleeding this long after the last
     *  bleeding frame: the server's window flush for a scrape we just left
     *  lands up to one 500 ms window (plus latency) later and must not thud.
     *  Tracks the server's window as net/roomBindings.ts BURN_GRACE_MS does. */
    bleedGraceMs: 600,
  },

  /**
   * MULTI-SPECTRAL COUNTERMEASURE clouds (render/countermeasure.ts +
   * render/cloudPaint.ts, Story 9.3) — FEEL ONLY: knobs Eric may re-tune on
   * staging; the server reads none of them. Since 2026-10-12 ("smoke is
   * paint") a cloud hides nothing on the server — it is purely a visual
   * overlay the client paints from the wire's {id,x,y,t0}. Eric: "imagine if
   * someone was using the spraypaint tool on a bitmap … the radius of that
   * tool gets slightly bigger over time … each 'paint' itself fades to 0
   * alpha (similarly to the phosphor decay). It's smoke." The spray runs the
   * cloud's whole stamped life, inside the shared
   * `cloudOutlineRadius(age, size)` disc (r0 → r1) — both the cloud's own,
   * off the wire (Story 10.6, I6); everything below is look.
   * NOT `smoke` below (WOUNDED smoke): the two share `colors.woundedSmoke`.
   */
  countermeasure: {
    /** u — one bitmap cell, the radar raster's 9 u cell (Eric 2026-10-12). */
    cellU: 9,
    /** ms — a cell painted to `maxAlpha` fades LINEARLY to 0 over this long
     *  (the phosphor shape; Eric: each paint fades over about 6–10 s). */
    fadeMs: 8000,
    /** THE SMOKE BRUSH (Eric 2026-10-12: "a smoke brush, soft overlapping
     *  puffs of many sizes and greys, not dots" — "I said PIXELS, not blobs").
     *  Puffs stamped per second of cloud life (the fractional remainder
     *  carries, so a low frame rate stamps the same amount). 400 → 500 on
     *  Eric's "while visually great, it's not thick enough. I can still kinda
     *  see ships under it a lot of the time" (2026-10-12). */
    puffsPerSec: 800,
    /** u — one puff's radius is drawn uniformly from [puffMinU, puffMaxU];
     *  its falloff is the smooth bell (1 − (d/R)²)², never a hard edge. */
    puffMinU: 25,
    puffMaxU: 70,
    /** One puff's centre strength is drawn uniformly from this range; it
     *  composites "over" the cell (a ← a + s·(1 − a)), saturating softly.
     *  0.04–0.12 → 0.06–0.2 on Eric's "it's not thick enough. I can still
     *  kinda see ships under it a lot of the time" (2026-10-12): the middle
     *  saturates sooner, while the rim stays wispy (landing is centre-biased). */
    puffMinAlpha: 0.1,
    puffMaxAlpha: 0.3,
    /** A cell's alpha never exceeds this. 0.92 → 1.0 on the same ruling ("I
     *  can still kinda see ships under it"): the dense body goes fully opaque,
     *  so nothing shows through the core. */
    maxAlpha: 1.0,
    /** One puff's grey, as a multiplier of `colors.woundedSmoke`, drawn
     *  uniformly from [shadeMin, shadeMax] and blended into the cell with the
     *  puff's own over-weight — the tone the reference smoke has. */
    shadeMin: 0.55,
    shadeMax: 1.0,
    /** THE CLOUD IS A RADAR RETURN SOURCE (Eric 2026-10-12: "Don't forget to
     *  composite it onto the radar layer so it can be painted. It should give
     *  returns in strength based on how thick the smoke is."). The beam march
     *  samples the cloud haze as one more field material (render/radarSources.ts
     *  `cloudSample`): its return coefficient is radarGain × the haze under the
     *  sample (0..maxAlpha), lit by the same mast instance of the shadow rule a
     *  hull gets, then grained, frozen into the slice, banded, phosphor-decayed
     *  and in-bubble dimmed by the heat grid exactly as every other return —
     *  no cloud-specific drawing. Thicker smoke → stronger band. */
    radarGain: 1.0,
    /** A cell whose haze alpha is under this returns nothing on radar (thin
     *  wisps return nothing). */
    radarPaintMin: 0.05,
    /** THE RADAR RETURN'S FRESHNESS WINDOW, in sweep revolutions (Story 9.8
     *  review gate, F1 — render/cloudReturnGate.ts). A held cloud beyond sight
     *  returns on the scope only while its last radar delivery is younger than
     *  this many revolutions: over 1, so the previous revolution's row (which
     *  lands a beat after the client's own beam crosses) admits this pass;
     *  under 2, so a server MISS darkens the cloud exactly one revolution late.
     *  The half revolution of slack absorbs frame latency and clock jitter. */
    returnHoldRevs: 1.5,
    /** A contact's NAMEPLATE is hidden outright when the cloud paint under its
     *  hull is at least this thick (Eric 2026-10-12: "I don't want someone's
     *  nameplate sticking out from behind the smoke"). Plates only — a hull is
     *  never hidden by cover (partials show through the overlay). */
    plateHideAlpha: 0.35,
    /** u — THE HAZE HALO'S SOFT EDGE (Story 9.3 session 5, Eric 2026-10-12:
     *  "The smoke is visible outside of 5/8 intel range. Why? … I cannot see
     *  the smoke outside of that range, I can only infer it from radar
     *  returns." — the 5/8 rung then; 6/12 on the twelfths ladder [retired 2026-11-12, Story 11.2], Story 9.8).
     *  The grey haze is drawn by eye only within the viewer's flash rung
     *  (`CONFIG.vision.muzzleFlash` — `radarRange × muzzleFlashFactor` until
     *  2026-11-12, Story 11.2 — the wounded-smoke reach, NOT a knob,
     *  render/hazeHalo.ts); it fades linearly to nothing
     *  over this many units past that rung. Feel only. */
    haloFeatherU: 40,
    /** THE HALO'S ISLAND LINE OF SIGHT (Story 9.3 session 6, Eric 2026-10-12:
     *  "if I can't see it because of an island or any other sight block, don't
     *  render it"). Bearings cast from the own hull to cut island shadows into
     *  the halo mask (render/hazeLos.ts) — 360 = one per degree, ~7 u between
     *  rays at the 6/12 rung (750 u × 2π / 360 ≈ 13 u at base). */
    losRays: 360,
    /** u — the shadows are re-cast only when the own hull has moved at least
     *  this far since the last cast (or the halo / island set changed): a cast
     *  measured ~1.2 ms median, ~6 ms worst among islands (node, 2026-10-12),
     *  too dear for every frame; clouds are stationary and a shadow edge is
     *  off by at most this much. */
    losRecastMoveU: 2,
  },

  /**
   * THE FOG FIELD (render/fogField.ts, Story 9.10 re-plan "THE FIELD", Eric
   * 2026-10-15: "no discs — realistic rolling fog", "make it performant").
   * Eric's pick B "Wisps" applied to the shared density field: a world-anchored
   * density raster (sim/fog.ts `fogDensityAt`, refreshed on a cadence) masks a
   * pre-baked tiling texture of soft overlapping pale-grey puffs that rolls
   * with the field's wind. Every value here is a FEEL knob — Eric may re-tune
   * on staging; the field itself (where fog is) comes from `CONFIG.fog`, the
   * welcome's `fogSeed` and the schema's `fogCut`, never from here.
   * The halo + island line-of-sight mask deliberately reads
   * `countermeasure.{haloFeatherU, losRays, losRecastMoveU}` (not a copy) so
   * the fog and the countermeasure haze end at the same edge.
   */
  fogField: {
    /** u — one density-raster cell (≈ 100² cells over the 750 u halo square). */
    cellU: 18,
    /** ms — the density raster is re-evaluated this often (frame time), never per frame. */
    refreshMs: 250,
    /** u — the raster re-centres on the own hull (and refreshes at once) when
     *  the hull is this far from the raster's centre; also the margin the
     *  raster carries past the halo so it never runs out between re-centres. */
    recenterU: 100,
    /** Alpha at full density over a fully opaque puff texel: final alpha =
     *  density × puff × maxAlpha. */
    maxAlpha: 0.6,
    /** Noise units per second the drawn cut eases toward the schema's
     *  `fogCut` (faster than the server's own `cutRatePerS`, so it follows). */
    cutEasePerS: 0.05,
    /** px — the square puff tile's side (it tiles seamlessly). */
    puffTilePx: 512,
    /** px per u — the tile's scale on the water (0.5 → 2 u per texel; a 512 px tile spans 1,024 u). */
    puffPxPerU: 0.5,
    /** Puffs stamped into one tile (uniform landing, wrapping at the edges). */
    puffsPerTile: 400,
    /** u — one puff's radius, drawn uniformly from [puffMinU, puffMaxU]. */
    puffMinU: 25,
    puffMaxU: 70,
    /** One puff's centre opacity, drawn uniformly from this range (soft falloff to 0 at its rim). */
    puffMinAlpha: 0.25,
    puffMaxAlpha: 0.6,
    /** One puff's grey, a multiplier of `colors.fogBank`, drawn uniformly
     *  from [shadeMin, shadeMax] (channels clamp at 255). */
    shadeMin: 0.95,
    shadeMax: 1.06,
  },

  /**
   * Radar blip render knobs — persistence and legibility for the quantized
   * intensity bitmap (the one radar grammar; cycle 105 deleted the retired
   * `silhouette` outline path and every knob that only it read).
   */
  blip: {
    /** How many SWEEP PERIODS a paint lives (amendment 9): the live paint plus
     *  `persistSweeps − 1` decaying ghosts. Long-persistence phosphor is how
     *  course and speed are actually plotted off a scope — and ghost SPACING
     *  encodes speed for free (a fast hull's ghosts sit nose-to-tail, a
     *  loitering hull's overlap into a blob). ~12s of track at 15rpm. */
    persistSweeps: 3,
    /** Minimum alpha a decayed blip may reach while it is still alive. 0 is the
     *  base behavior (linear fade to nothing over the full life); the assist
     *  raises the floor so a cooling blip never fades to near-invisible. */
    minAlpha: 0,
    /** The assist's raised minimum decayed-blip alpha. */
    assistMinAlpha: 0.35,
    /**
     * HEATMAP KNOBS (cycle 52, amendments 76-79 — superseding cycle 51's
     * polygon-blob knobs entirely).
     *
     * Every value here is PRESENTATION. No wire field, no server work, no
     * perception-invariant surface: the server sends coverage footprints and
     * the islands are already client-known from the map seed, so everything
     * below is computed on this side of the wire. `PROTOCOL_VERSION` is
     * untouched by this whole block.
     *
     * THE BASELINE IS EXPLICITLY TWEAKABLE and `bands` is the first thing Eric
     * will retune — he hedged the color ORDER himself ("Or whatever the ACTUAL
     * RADAR would look like"), so the array is ordered, self-describing, and a
     * reorder is one line. `persistSweeps` above is NOT in that set — it is
     * the entire course-and-speed channel (amendment 67 kills the ARPA
     * vector), so retuning it is a deliberate post-playtest job.
     */
    heatmap: {
      /**
       * World units per bitmap cell — a REFERENCE since cycle 63, NOT a knob,
       * and NOT tunable from this file. The radar grid resolution is
       * gameplay-authoritative: the server rasterizes a fogged hull's true
       * silhouette onto THIS lattice and sends coverage cells
       * (`ReturnBlipEvent`), so the cell size decides what the wire says —
       * retuning it changes what every `gx`/`gy`/`bits` on the wire means,
       * which is why it lives in shared `CONFIG.vision.radarCellU`, is pinned
       * beside `PROTOCOL_VERSION` in radarRaster.test.ts, and is referenced
       * here; forking a second constant would let the client's buffer lattice
       * drift off the wire's cell indices and every footprint would land
       * misaligned. (An earlier version of this comment opened by calling it
       * "the ONE knob that trades look against cost" — a loaded gun the
       * cycle-63 review gate removed: it invited a silent wire break with no
       * PV bump.) At the default camera framing one cell is ~7.5 screen px
       * (1080 px over 1,320 u),
       * deliberately chunky: a quantized bitmap should read as a bitmap, and
       * since the cycle-63 gate the chunk IS the sensor's resolution loss
       * (amendments 156-157).
       *
       * COST SCALES WITH VISIBLE AREA (cycle 58, amendment 99): the buffer
       * covers the VIEWPORT, not the radar ring, so zooming out costs more.
       * THE TABLES BELOW WERE MEASURED AT RADAR 660 u, 9 u CELLS, with the
       * camera's base zoom fitting 2 × radar range to the short axis — the
       * 1.0× row is today's 1,320 u default framing, the 1.5× row today's
       * 880 u close limit. Story 9.8 replaced the 0.5× floor with the live
       * ring fit (ruling 127), a much wider view; the 9.8 measurement at the
       * close / default / ring-fit framings is recorded in the spec, not here.
       * The cell counts are for a 16:9 screen — the world extent depends only
       * on aspect ratio and zoom, not on pixel resolution:
       *   1.5× (zoomed in)  176 × 112 = 20k cells,  77KB
       *   1.0× (base)       272 × 160 = 44k cells, 170KB
       *   0.5× (zoomed out) 528 × 304 = 160k cells, 630KB
       * A 6u lattice held 2.25× as many; the cycle-63 gate's coarsening bought
       * back that factor everywhere the buffer is the cost.
       *
       * CYCLE-63 GATE RE-MEASURED at the 9u lattice + per-paint fuzz. A full
       * `Radar.render` — a generated 12-island map with its real height
       * raster, six sighted battleship contacts (stamped and fuzzed every
       * frame), the sea-clutter haze and a live storm wall, at the shipped
       * 3-deep persistence, warmed through three whole revolutions and then
       * averaged over 240 frames, in the headless test environment:
       *              cycle 62 gate (6u)   cycle 63 gate (9u + fuzz)
       *   1.5×          0.62 ms                0.77 ms
       *   1.0×          0.70 ms                0.90 ms
       *   0.5×          1.46 ms                1.20 ms
       * The budgeted case (min zoom, the 2.5 ms Block-If bar) got CHEAPER —
       * the buffer fill+quantize shrank 2.25× — while the zoomed-in cases pay
       * a new flat ~0.15 ms: the per-frame contact stamp now runs the full
       * fuzz pipeline (~15-25 µs per sighted hull, six hulls in this
       * fixture), a per-CONTACT cost that does not scale with the buffer.
       * (Fixture differs from cycle 62's — different generated map — so the
       * columns are indicative, not a same-fixture A/B.)
       *
       * The steady state is 373 live slices carrying ~16,900 cells — about
       * three revolutions' worth, exactly as `sliceRad` and `persistSweeps`
       * predict, and INDEPENDENT of frame rate.
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
       * A BAND CARRIES NO OPACITY OF ITS OWN — see `bandAlpha` below. Cycle 63
       * shipped a per-band ramp (0.4/0.56/0.72) and Eric struck it out (cycle 64,
       * amendment 160): *"I told you pretty clearly not to vary the intensity per
       * color band. At all... There's no darker blue because its 'less intense in
       * the moderate band.' That's not what the colors are for."* Hue IS the
       * strength readout; a brightness ramp made it a second, redundant one.
       */
      bands: [
        { at: HEAT_GREEN_AT, color: COLORS.echoFaint },
        { at: HEAT_BLUE_AT, color: COLORS.echoFuzzy },
        { at: HEAT_RED_AT, color: COLORS.echoSolid },
      ],
      /**
       * THE ONE OPACITY EVERY BAND IS DRAWN AT (cycle 64, amendment 160).
       *
       * A pixel is red, blue, green, or nothing — and whichever it is, it is
       * drawn at THIS opacity. Two cells of the same age in different bands are
       * equally opaque no matter how strong either return is. It is a scalar
       * rather than a per-band field on purpose: an equal-valued field is a knob
       * someone re-tunes back into a ramp, and `HeatBand` has no `alpha` member
       * at all so the ramp is unrepresentable rather than merely absent.
       *
       * WHAT OPACITY STILL CARRIES IS AGE, AND ONLY AGE — the phosphor decay
       * (`blipAlpha`) scales this down as a paint ages, which is amendment 64's
       * third channel and the translucency Eric ratified in amendment 144. An old
       * paint fades; a weak one does not.
       *
       * 0.55 sits between the retired ramp's green (0.4) and red (0.72), so the
       * scale as a whole holds roughly the weight it had. **If the scope now reads
       * BUSY, the lever is the amount of green, not its brightness** — green is by
       * far the most numerous register (fringes, clutter, weak returns) and it was
       * previously hidden by being drawn faintest. Reach for the clutter and land
       * coefficients, or `bands[0].at`, before reaching back for a ramp.
       */
      bandAlpha: 0.8,
      /**
       * ONE BEAM CROSSING, FOR THE WRITE RULE (amendment 210 follow-up, cycle
       * 203). Paints born within this many ms of each other are ONE paint to
       * `writeCell`: the STRONGER return owns a shared cell, not the newer one.
       * Since the server sends the entire sweep, a hull and the water under it
       * arrive as separate slices a tick or two apart (the beam crosses both on
       * the same bearing); under the strict same-age tie the wake row stamped
       * a tick after the hull's blip overwrote its red cells with green water.
       * Three ticks: the crossing of one bearing, never a whole revolution —
       * a later crossing still repaints as before. Converted to an alpha
       * tolerance (`sameCrossingMs / blipLifeMs`) in render/radar.ts.
       */
      sameCrossingMs: 150,
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
        amount: HEAT_NOISE.amount,
        /** Intensity at which the grain reaches exactly zero. Pinned to the RED
         *  threshold, so the rule reads as a sentence: anything strong enough to
         *  be called "definitely a thing" is drawn rock steady, and everything
         *  below it is graded by how marginal it is. */
        solidAt: HEAT_NOISE.solidAt,
      },
      /**
       * THE BEAM MARCH (cycle 62, amendments 138-140) — how the rays are spaced
       * and how far apart the samples on one ray are. These are RESOLUTION knobs
       * only: nothing here can change what a return READS, only whether the beam
       * finds it.
       */
      march: {
        /** Arc length (u) between adjacent rays AT THE TERMINUS. At most one
         *  cell (finer since the cycle-63 gate coarsened the lattice to 9u —
         *  a smaller-than-cell spacing is strictly safe), so the fan can
         *  never open a gap at the rim, which is the coarsest place on
         *  every ray and therefore the only place a gap can appear. The ANGLE is
         *  derived from this and the observer's radar range (render/radarMarch.ts
         *  `rayStep`), so a boon-scaled scope reaching ~2.01× base range simply
         *  fires more rays rather than painting stripes at its rim — a fixed angle
         *  would have to be tuned for the widest scope and then waste rays on
         *  every other one. At base range (1,500 u since Story 9.8) this works
         *  out at ~0.23° (it was ~0.52° at 660 u — 2.27× the rays per sweep). */
        raySpacingU: 6,
        /** Bounds on that derived angle (rad). The floor (~0.17°) caps the ray
         *  count on an absurdly long scope; the ceiling (~1.15°) stops a
         *  degenerate near-zero range from fanning a revolution into a handful of
         *  spokes. Neither is reached at any shipped stat. */
        minRayRad: 0.003,
        maxRayRad: 0.02,
        /** How far a ray advances between samples (u) — under half a cell at
         *  the 9u lattice (was two thirds at 6u; the cycle-63 gate coarsened
         *  the cell, not this step), so consecutive samples land in the same
         *  cell or the next one and a ray cannot step over a cell it passes
         *  through. Samples that repeat a cell are priced once (the march
         *  dedups against the previous key), so the oversampling costs an
         *  integer compare rather than a field query. */
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
         * sweep at 15rpm, or 125ms at a 30rpm INTEL build (uncapped since Story
         * 10.7, R6 — a faster sweep only shortens that span). Past
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
        /**
         * STEEL — the table's 1.0 anchor, the coefficient the crossover fit is
         * solved against, and since cycle 67 the WHOLE of a hull's pre-range
         * reflectivity. Moving it re-fits `pointRef`.
         *
         * IT IS NOT "STEEL BROADSIDE" ANY MORE (amendments 171-175). There is no
         * bow-on variant, because a warship's RCS is dominated by CORNER
         * REFLECTORS — the hull-sea dihedral and the right angles all over the
         * superstructure — which retroreflect across a wide span of incident
         * angles. Broadside is a peak; bow-on is typically only ~10 dB down and
         * still an enormous absolute RCS, and on a gain-controlled marine set a
         * ship reads as a solid bright target from any aspect. Amendment 106's
         * "steel bow-on ~0.25" was an assistant handwave that the amendment
         * itself labels as one; it should never have been treated as authority.
         * Aspect is carried by the SIZE of the coverage mask, where it belongs.
         */
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
         *    game (the waterline, at the radar rim — `surfaceRef` is re-fitted to
         *    the rim, so the rim attenuation holds) is 0.2781 × 0.7315 = 0.2034
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
         *    minPeak × (1 − a')` → 0.132 < 0.2 × 0.679 = 0.136. The envelope
         *    makes this bound TIGHTER than the flat jitter did, from both sides
         *    at once (the weak clutter cell earns MORE amplitude, the stronger
         *    echo less), which is exactly why the coefficient had to come down
         *    from 0.105.
         *
         *    ITS REACH WAS OVERSTATED AND IS CORRECTED HERE (Story 4.12,
         *    amendment 204). This bound was written against CYCLE 62's `writeCell`
         *    — *"max-wins, and hands the WINNER both the intensity AND the
         *    alpha"* — but amendment 164 replaced that rule with FRESHEST-WINS in
         *    cycle 65. Under the shipped rule a fresher weak cell already beats an
         *    older strong one REGARDLESS of intensity, so the "a clutter cell
         *    re-ages a decaying echo" scenario is not what this defends: a clutter
         *    cell painted this sweep legitimately supersedes last sweep's echo
         *    whatever its coefficient. THE BOUND STILL BINDS, on SAME-AGE
         *    collisions — the beam crosses a hull and the sea state around it in
         *    ONE pass, and there max-wins is still the tiebreak, so a lucky
         *    clutter cell could take a cell of the hull's own faintest edge. That
         *    is the collision it exists for, and Story 4.12 adds a second instance
         *    of exactly the same shape: a hull and its OWN WAKE are painted in the
         *    same sweep, which is why the wake material is bounded by this same
         *    ceiling (see `wake` below).
         *
         * Raising this past the blue threshold is a DESIGN change requiring a
         * fresh ruling: Eric was shown "clutter strong enough to swallow weak
         * returns close in" as a real mechanic and DECLINED it. ALL THREE bounds
         * are asserted in __tests__/radarHeatmap.test.ts, at the worst-case draw
         * AND through a rasterized band histogram at the shipped envelope.
         *
         * SHIP-DISPLACEMENT CHOP REUSES THIS COEFFICIENT VERBATIM (Story 4.12,
         * amendments 197 + 202 + 206) rather than minting a fourth weak-water
         * number: all three bounds above then transfer with no new calibration to
         * defend, and the "a hull under way pushes water too weak to light a
         * single cell when it is barely making way" behaviour comes free from the
         * straddle. What differs is only WHERE it is drawn (the wake's lateral
         * spread, `chopSample` in render/radarSources.ts) and which reference
         * range it fades on (`wakeRef` — the haze's own `clutterRef` would put
         * every chop cell under the threshold past ~72u from the OBSERVER, which
         * is the one place chop is not needed).
         */
        clutter: 0.095,
        /**
         * DISTURBED WATER — a ship's or a torpedo's track (Story 4.12,
         * amendments 194-206). SOLVED, never typed in: see the WAKE CORRIDOR
         * block above the object for the whole derivation and the physics.
         *
         * The two bounds, both asserted at the draw in
         * __tests__/radarHeatmap.test.ts and both re-derived here from the
         * shipped constants rather than restated:
         *   1. EVERY DRAW LIGHTS, out to the reach — this is amendment 198's
         *      CONTINUITY, the thing that makes a track read as a LINE against
         *      chop's scattered dots of the identical colour and opacity.
         *   2. NO DRAW OUTRANKS `minPeak`'s WORST DRAW — clutter's third bound,
         *      applied to the material that shares a sweep with a hull's own
         *      faintest cell. (And never blue, a mile clear, by the same token.)
         */
        wake: HEAT_WAKE_COEF,
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
         * kept a solid interior RED out to the radar rim, and the gain went with
         * the bake that applied it. Putting the reference where the curve ALONE
         * clears `bands[2].at` at the rim (0.05 + 0.95/(1 + (rim/surfaceRef)³)
         * = 0.73, solved at the then-rim of 660 u as 900) restores amendment
         * 78's regression pin — a big tall island is a big red mass, not one
         * that is only red when you are on top of it — without a second
         * multiplier nobody could reason about. A FLAT island at the same range
         * lands at 0.45 × 0.73 = 0.33, i.e. green: the height channel is still
         * the thing that separates them.
         *
         * RE-FITTED TO THE TWELFTHS RIM BY STORY 9.8 (epic-9 amendment 103): the
         * 0.73 target is a statement about the RIM, and the attenuation is a
         * function of rim/surfaceRef alone, so holding that ratio holds today's
         * red share at the new rim exactly. Written as a derivation from the
         * radar rung — 900 scaled by the rim's growth from 660 u — never as the
         * literal it evaluates to.
         */
        surfaceRef: 900 * (CONFIG.vision.radar / 660),
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
        /**
         * Reference range (u) of the SURFACE curve FOR DISTURBED WATER — wake
         * and the chop that hangs off it. SOLVED so the wake's unluckiest draw
         * crosses `bands[0].at` exactly at the twelfths ladder [retired 2026-11-12, Story 11.2]'s 6/12 rung
         * (`CONFIG.vision.muzzleFlash`, epic-9 amendment 103); see
         * `HEAT_WAKE_REF` above the object for why it comes out longer than the
         * coastline's, and for the discipline that keeps the rung out of every
         * paint path.
         */
        wakeRef: HEAT_WAKE_REF,
        /**
         * The wake's own GRAIN SCALE — a multiplier on the ambient SNR envelope
         * (amendment 203), solved as half the feasibility ceiling. A material
         * property, not a legibility knob: an organized surface feature does not
         * scintillate like incoherent scatter. Chop does NOT take it — chop IS
         * sea state and carries the ambient grain, which is exactly what makes it
         * speckle where the wake is continuous.
         */
        wakeGrain: HEAT_WAKE_GRAIN,
        /**
         * Intensity scale of the OLDEST water bucket (the freshest is 1). The
         * recency channel, and it is STRUCTURAL rather than a brightness ramp:
         * older water reads weaker, so its cells fall under the threshold first
         * and the visible track SHORTENS. Derived — see `HEAT_WAKE_AGE_FLOOR`.
         */
        wakeAgeFloor: HEAT_WAKE_AGE_FLOOR,
        /**
         * THE TAIL FRAY (cycle 71, Eric ruling 2026-08-09, amendment 214) — the
         * fraction of its own core cells the OLDEST water bucket lays, the
         * freshest laying all of them.
         *
         * IT EXISTS BECAUSE THE INTENSITY RECENCY CHANNEL MEASURED ~3% AND THAT
         * IS NOT A CHANNEL. `wakeAgeFloor` is DERIVED from the 13%-wide wake
         * corridor, and the corridor left age almost nothing to spend: it solves
         * to ~0.968, so the oldest water is 96.8% as bright as the freshest.
         * Cycle 70 shipped that knowingly and ledgered the consequence as "recency
         * reads as the tail's lit fraction falling"; it does, but only out near
         * the material's reach, where the draw window is already straddling the
         * threshold. Close in, every draw clears by a mile and the track is a
         * uniform bar that ends square. Eric, on the water: *"it wont even start
         * fading at the tail for a few cycles because it keeps being repainted as
         * fresh wake."*
         *
         * SO THE FADE IS STRUCTURAL AND NOT PHOTOMETRIC — older water paints
         * FEWER CELLS, at unchanged intensity. That is the only lever the
         * corridor leaves open, and it is open by construction rather than by
         * luck: all three of clutter's bounds are statements about what ONE cell's
         * draw may do, so dropping cells cannot touch any of them. It is also the
         * honest physics — a dissipating wake breaks into patches, it does not
         * dim uniformly — and it composes with the reach fade rather than
         * fighting it, because both channels spend the same coin.
         *
         * THE FLOOR IS BOUNDED BELOW BY CHOP, and that bound is what fixes the
         * value rather than taste. Amendment 198's whole reading is that a wake is
         * a LINE and chop is SCATTERED DOTS of the identical colour at the
         * identical opacity — fray the tail into chop's own measured lit fraction
         * (0.11-0.16) and the tail stops being a wake at all, which would trade
         * one legibility bug for a worse one. 0.35 is ~2.2x chop's worst case, so
         * the oldest water still reads as a sparse LINE. Asserted against a
         * rasterized chop histogram in __tests__/radarHeatmap.test.ts rather than
         * against this comment.
         *
         * Buckets land at 1.00 / 0.78 / 0.57 / 0.35 — at the shipped 5.5s clock
         * each bucket is 1.375s, so a torpedo boat at full ahead dissolves over
         * the last ~124u of a ~248u track (and a ~248u track is short of the
         * 750u reach rung, so at range it is the AGE, not the range, that
         * shortens it).
         */
        wakeTailKeep: 0.35,
        /** Asymptotic floor shared by the SURFACE and VOLUME curves. Small for
         *  conditioning, and still an asymptote rather than a clamp, so two
         *  different ranges never attenuate identically (amendment 64's
         *  one-quantity-per-channel rule). */
        floor: HEAT_SURFACE_FLOOR,
        /** Asymptotic floor of the POINT curve — see HEAT_SHIP_ATTEN_FLOOR above
         *  for why the 1/d⁴ fit requires it to be this small, and why the floor
         *  SURVIVES the physics (amendment 127). */
        pointFloor: HEAT_SHIP_ATTEN_FLOOR,
        /** Floor on a hull's intensity. Above `bands[0].at` with enough headroom
         *  that the grain cannot push the weakest legitimate return under the
         *  transparent threshold: 0.2 × (1 − 0.45 × (1 − 0.2/0.7)) = 0.136 > 0.12.
         *
         *  THIS IS THE REAL GUARANTEE, not the asymptote (amendment 127): radar
          *  range means ONE number for every hull, so anything the server blips
         *  still paints at least a green speck anywhere inside the scope, at any
         *  aspect, at any size.
         *  Dropping it so signature becomes stealth is a RULED-OUT design, not a
         *  realism correction; do not re-propose it. */
        minPeak: HEAT_MIN_PEAK,
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
         * How far seaward of a coastline surf paints (u) — a THIN fringe, ~3
         * cells at the shared 9u lattice. Consumed by
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
      },
      /**
       * THE TERRAIN SHADOW'S SOFT EDGE (cycle 69), in the height raster's own
       * QUANTIZED units — the same 0-255 scale `CONFIG.vision.radarMastQ` (64)
       * lives on, NOT world units and not a fraction.
       *
       * A terrain sample is a POINT ON A SURFACE: it stands over the grazing ray
       * or under it, so its illumination is a STEP, not the mast-height fraction
       * a ship gets (render/radarMarch.ts's `terrainIllumination` carries the
       * argument in full). This is the width of the ramp across that step — a
       * sample clearing the ray by this much is fully lit, one exactly on it is
       * dark, and the crossing fades between.
       *
       * WHY 4, AND IT IS MEASURED RATHER THAN CHOSEN. The number that bounds
       * this is not the height scale, it is HOW MUCH CLEARANCE A CONTINUOUSLY
       * VISIBLE SLOPE ACTUALLY HAS. A sample is measured against the ray grazing
       * the last raster cell that folded, so on a smooth slope the clearance
       * only ever accumulates across ONE 14u cell: about (cell/d)·(slope·base +
       * H) — ~11 quantized units at 400u on the smoothest thing the generator
       * can build (a 200u-wide, 255-high cone). A band anywhere near that dims
       * ground that is not in shadow at all. Measured on that cone, sampling the
       * near slope row by row: at 16 the slope mottles (0.21 / 0.33 / 0.38 rows
       * between 0.95s) and at 8 it still dips to 0.42, while at 4 it is flat
       * within the grain. On the real seed-3 generator the same sweep moves the
       * 25th-percentile land intensity from 0.63 (at 4) to 0.44 (at 16).
       *
       * SO THE RAMP IS DELIBERATELY NARROW. On a steep coast the clearance
       * gradient is a few units per world unit, so 4 spreads the boundary over
       * roughly a world unit — sub-cell, i.e. the edge is as hard as the 9u
       * lattice can draw anyway. Where it BUYS something is shallow ground,
       * which is exactly where a long shadow edge would otherwise read as a
       * ruled line across the water.
       *
       * IT IS A FEEL KNOB, NOT A COMBAT ONE. Nothing on the wire and no server
       * gate reads it; it moves how a coastline's shadow boundary LOOKS and
       * nothing else. Raising it past a sample's own height is harmless by
       * construction (the ramp is clamped to that height, so clear ground still
       * paints at full strength); 0 is the documented HARD STEP.
       */
      terrainSoftQ: 4,
      /**
       * NEAR-RANGE DIMMING (Story 4.11, amendment 181) — Eric: *"radar is most
       * effective outside of truesight range... I want everything painted at max
       * intensity (0.8 alpha) at all times. I want it DISPLAYED muted based on
       * how close to the ship it is."*
       *
       * A LIVE DISPLAY MASK, NOT A PAINT PROPERTY. This is the ONE place in the
       * whole grammar where something viewport-and-observer-derived touches what
       * is drawn, and it is safe for exactly one reason: it is a transparency
       * mask over the composited layer, so no paint record is read back,
       * recomputed or mutated (amendment 83 forbids re-EVALUATING a frozen paint,
       * which is what cycles 54/55/57 each shipped a bug on — it does not forbid
       * a presentation transform). Implemented as a baked radial-gradient mask
       * sprite on `blipLayer`, never as a per-cell recompute inside
       * `quantizeInto`.
       *
       * BOTH RADII LAND ON THE LADDER (amendment 113; twelfths since Story 9.8 [retired 2026-11-12, Story 11.2],
       * epic-9 amendment 103), never on literals
       * — and since this cycle they are ANCHORED TO TRUESIGHT AND OBSERVER-
       * SCALED, so what lives here is the RATIO to the observer's effective sight
       * rather than a fixed radius. The floor holds across the whole sight bubble
       * (4/12) and reaches full at the flash rung (6/12 — the 5/8 rung on the
       * eighths ladder, the first rung outside the bubble then), where radar
       * and the flash are the only sensors; render/radarDim.ts carries
       * the derivation and the reasoning, and is the one place the curve exists.
       * Eric's own statement of the rule is a statement about the BUBBLE (*"less
       * prominent in the near sight range where i am going to aim based on LOS
       * rather than radar ghosts"*), and the shipped 1/8 → 5/8 ramp did not
       * follow it: it stood at 80% opacity at the EDGE of the bubble (40%
       * halfway out), over exactly the water the player aims at by eye.
       *
       * ON A FOGGED BEARING THE RAMP SLIDES INWARD (amendment 210, Eric
       * 2026-10-21): the look above stays, but each bearing's ramp starts where
       * the observer's fog-tolled EYE actually ends on it, by `fogLift` — so a
       * return the fog hid from the eye is not muted as though it were in plain
       * sight. Baked as a fan of `reachRays` wedges on the fog refresh cadence
       * (or a move past `reachRecastMoveU`), never per frame.
       */
      dim: {
        /** Flat `minScale` at and inside this multiple of the observer's
         *  EFFECTIVE truesight — 1.0, i.e. the whole sight bubble (the ladder's
         *  4/12 rung). A MULTIPLE and not a radius, because the bubble is a
         *  boon-widened constant per build (no boon widens radar range any more),
         *  so the ramp stays observer-resolved. */
        // STORY 11.2 (2026-11-12, R20 reading): the ramp keeps TODAY'S ABSOLUTE
        // radii — flat to 500 u, full at 750 u — against the observer's
        // effective class-and-name sight (now 200 hm), so both factors are
        // today's radii over the new base sight; the whiteout still scales them.
        innerFactor: FEEL_SIGHT_U / CONFIG.vision.sight,
        /** Full painted opacity from this multiple of effective truesight out:
         *  the flash rung expressed against the sight rung (6/12 over 4/12 =
         *  1.5 on the twelfths ladder [retired 2026-11-12, Story 11.2]; 5/8 over 4/8 = 1.25 before Story 9.8),
         *  so it stays a LADDER derivation and never a literal. */
        outerFactor: (FEEL_SIGHT_U * 1.5) / CONFIG.vision.sight,
        /** Displayed fraction of the painted opacity inside the bubble. Eric's
         *  ratified number (*"painted at 20% its usual opacity"*), UNCHANGED by
         *  the re-anchoring above — moving it would be a second knob nobody asked
         *  for. It is a DISPLAY scale on top of age, so the two compose
         *  multiplicatively and the stored record is byte-identical throughout. */
        minScale: 0.2,
        /**
         * Half-extent (u) of the baked mask sprite in world units.
         *
         * IT IS A COVERAGE BOUND, NOT A LOOK KNOB. The mask is flat at full
         * opacity everywhere past `outerU`, but a Pixi sprite mask CLIPS to its
         * own frame — anything outside it is hidden outright — so the sprite has
         * to reach past the furthest cell the radar layer can draw. That bound is
         * the scope (base radar range — the ladder is frozen at base, no card
         * widens it) plus the distance own hull can travel during a paint's
         * ~12s phosphor life (a boon-scaled hull at ~60 u/s ≈ 720u): ~1.5×
         * base radar, comfortably inside 4× base radar. The
         * span is deliberately NOT observer-scaled with the two factors above:
         * the sprite's world extent is what CLIPS the layer, so scaling it with a
         * smaller bubble would hide the far scope outright. Only the
         * baked RAMP tracks the observer; the frame stays this fixed reach. It
         * is deliberately NOT sized to the viewport — the camera can show water
         * no paint has ever reached, and hiding a mask-less region that holds
         * nothing costs nothing.
         */
        // STORY 11.2 (2026-11-12): 1.25 × radar, was 4 × — the bound above is
        // radar + ~720 u of travel, and at the 400 hm radar 4 × spread the
        // 1,024² mask to 71 u a texel (the 250 u ramp in 3.5 texels); 1.25 ×
        // still covers the bound and keeps the ramp at ~11 texels.
        spanU: CONFIG.vision.radar * 1.25,
        /**
         * THE FOG SLIDE (epic-9 amendment 210, Eric 2026-10-21) — ERIC'S STAGING
         * DIAL, 0..1. On a bearing where the observer's fog-tolled eye ends at
         * `reach` < sight (shared sim/fog.ts `fogEyeReach`), the whole ramp slides
         * inward by `(sight − reach) × fogLift`: 1 = the floor ends exactly where
         * the fogged eye ends (with the shipped innerFactor 1; in general the floor
         * ends at innerU − (sight − reach)) and full strength begins one ramp-width later, so a
         * return the eye cannot see is NOT muted; 0 = today's radial mask, fog or
         * no fog. Covers both of Eric's cases with one rule — the observer inside
         * a bank, and a clear observer looking into one. Shipped at 1; Eric tunes
         * it on staging. render/radarDim.ts `dimSlideU` is the one place it is read.
         */
        fogLift: 1,
        /** Bearings in the eye-reach fan the mask is baked from (one wedge each,
         *  ray k at k·2π/N in world axes — the haze halo's `losRays` convention).
         *  120 = 3° wedges: a bank's edge lands within ~26 u at the 500 u bubble,
         *  under the ramp's own width, and a cast is 120 shared marches. */
        reachRays: 120,
        /** u — between fog-refresh ticks (`fogField.refreshMs`) the fan is
         *  re-cast early only when own hull has moved at least this far since the
         *  last cast: the wisps' `countermeasure.losRecastMoveU` precedent (a cast
         *  is too dear for every frame, and a fog edge drawn this stale is off by
         *  at most this much — well inside the ramp's width). */
        reachRecastMoveU: 20,
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
   * ON FIRE (cycle 162, Eric 2026-10-01: "some kind of 'on fire' effect for a
   * ship under 25%") — render/fire.ts. Flame tongues ride the SAME anonymous
   * `sm` pulse wounded smoke rides, and only its heavy tier (`tier === 2`,
   * hull below `CONFIG.damageBands.criticalBelow`): no wire change, no
   * correlation handle, the plume's own disclosure and nothing more. EVERY
   * number here is an IMPLEMENTER DRAFT for Eric's eye on staging.
   *
   * INFORMATION, NOT JUICE (the epic-4 amendment-49 house rule smoke.ts states): presence,
   * size and tier are never motion-gated. Only the flicker and the rise scale
   * with the motion setting; at `motion: 'off'` the flames are still, present
   * and full-sized.
   */
  fire: {
    /** Flame tongues spawned per tier-2 `sm` pulse. */
    flames: 2,
    /** How long one tongue lives, ms. Well under smoke's `puffLifeMs`, so the
     *  flames sit ON the hull rather than trailing behind it (the same
     *  not-a-track arithmetic smoke's life is bound by). */
    lifeMs: 600,
    /** Fraction of the life over which a tongue blooms in; it fades linearly
     *  to nothing across the whole life from there (smoke's curve). */
    riseFraction: 0.15,
    /** Radius at birth → radius at death, u. */
    r0: 6,
    r1: 14,
    /** Peak opacity (top of the bloom-in ramp). Never motion-scaled. */
    peakAlpha: 0.9,
    /** Age head-start (ms) for the Nth extra tongue of one pulse — depth, not
     *  one hard stamp (smoke's `stagger`). */
    stagger: 150,
    /** Rise, u/s, OPPOSITE the smoke wind's y (upward on screen); scaled by
     *  motion intensity, so `off` pins a tongue at the pulse point. */
    riseSpeed: 14,
    /** Flicker: a fast sin wobble on alpha and width, amplitude scaled by
     *  motion intensity (exactly 1 at intensity 0). `flickerHz` is well under
     *  the ≤3 flashes/s ceiling's spirit — it is a wobble, never an on/off. */
    flickerHz: 6,
    flickerAmp: 0.25,
    /** Global backstop on live tongues (`capOldest`) — sized like smoke's:
     *  20 hulls critical at once × ~3 live pulses × 2 tongues = 120, doubled. */
    maxFlames: 256,
  },

  /**
   * THE FOGHORN's presentation (Story 4.5, amendments 51-58; rebased onto the
   * EIGHTHS LADDER by Story 4.9, amendment 122; onto TWELVE bands by Story 9.8,
   * epic-9 ruling 129). Every knob here is
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
     * WIRE BAND → AUDIO GAIN. Which TWELFTH of the LISTENER's own intel range
     * the honker sits in (1 = innermost, 12 = the radar edge), resolved by the
     * server; this table only says how loud each band plays.
     *
     * GENERATED FROM RULING 129 (Story 9.8, "proportional re-read"): FLAT AT
     * FULL VOLUME THROUGH TRUESIGHT (bands 1–4; band 4 = sight = radar/3 at
     * base stats), then gain = 1 − 0.5 × (b − 4) / 8 — even steps of 6.25
     * points — to 50 % at the radar edge (band 12): 0.9375 / 0.875 / … / 0.5.
     * BOTH ANCHORS ARE ERIC'S ORIGINAL FOGHORN RULING — *"within truesight
     * range at full volume"* and 50% at the radar edge — and must survive any
     * retune of the middle.
     *
     * An unknown/absent band is the caller's problem (roomBindings falls back
     * to full gain for the self and spectator shapes, which carry no band).
     */
    bandGain: hornTable((k) => 1 - 0.5 * k),
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
       * exactly as the gain is — and band 12 (the radar edge, ruling 129)
       * carries the old tier-3 weight EXACTLY (13 / 1.8 / 0.5). Bands 5-11 are
       * the linear interpolation between them at the gain curve's own
       * fractions (k = (band − 4) / 8), so the mark's weight and the honk's
       * loudness step together. Only the MIDDLE gained resolution; nothing
       * about the shipped grammar moved. `__tests__/foghorn.test.ts` pins both
       * anchors and the interpolation, so a retune cannot drift one without
       * the other.
       */
      bands: hornTable((k) => ({
        size: CHEVRON_NEAR.size + (CHEVRON_EDGE.size - CHEVRON_NEAR.size) * k,
        thickness: CHEVRON_NEAR.thickness + (CHEVRON_EDGE.thickness - CHEVRON_NEAR.thickness) * k,
        alpha: CHEVRON_NEAR.alpha + (CHEVRON_EDGE.alpha - CHEVRON_NEAR.alpha) * k,
      })),
    },
  },

  /** Netcode render delays (ms behind estimated server time). */
  /**
   * THE FLASH SHELLS WHITEOUT (Eric 2026-10-29, epic-10 amendment 5(c)): a hit
   * hull's whole screen — HUD and DOM chrome included — goes white, then a
   * clear circle grows from the own ship at the shared sight law's radius
   * (`effectiveSight`) while the white outside it fades. The timeline itself is
   * `CONFIG.flashShells` (rampMs / holdMs / clearMs); nothing here restates it.
   */
  flashWhiteout: {
    /** The TOP of the DOM z-scale: above feed/toasts 900, modals/banner 1000,
     *  settings 1050, menu 1100, queue 1150 and the class bay 1200 — the only
     *  way one element covers every piece of DOM chrome (ruling c). A screen
     *  effect, not chrome: nothing else may claim this rung. */
    zIndex: 1300,
    /** The clear circle's soft edge, as a fraction of its radius (px)... */
    featherFrac: 0.1,
    /** ...and never thinner than this (px). Dropped at motion `off`. */
    featherMinPx: 4,
    /** The fog hole and the radar dim mask re-bake on a CHANGE of their sight
     *  radius, so while the circle grows they follow it in this many equal
     *  steps of the sight range (floored — never wider than the server's
     *  sight): ~3.5 re-bakes a second across the 8.5 s clear, not 60 — 30
     *  steps ≈ 17 u at base sight, inside the clear circle's feather (gate
     *  fix F9, rebake cost). Staging judges whether the steps read. */
    sightSteps: 30,
  },
  /**
   * THE FLASH SHELLS BURST (Eric 2026-10-29, epic-10 amendment 5(d)): a disc of
   * the burst radius at the burst point, BLACK for `blackMs`, wiping black →
   * white over `wipeMs`, then fading out over `fadeMs` (~0.6 s). Rejected:
   * 0.1/0.15/0.1 and 0.25/0.5/0.5.
   */
  flashBurst: {
    blackMs: 150,
    wipeMs: 250,
    fadeMs: 200,
  },
  net: {
    /** Remote contacts interpolate this far behind serverNow(). */
    interpDelayMs: CONFIG.tick.interpDelayMs,
    /** Own ship in the interp-checkpoint mode renders at -50ms per the plan. */
    ownDelayMs: 50,
  },
} as const;

// VARIANT P IS RETIRED (cycle 51, amendment 63). The build-time
// `__BLIP_VARIANT_P__` define and its `BLIP_VARIANT_P` export lived here to A/B
// a phosphor-anonymous scope against the personal-hue one. Both were superseded
// by the radar realism cycle's server-side mode flags — and cycle 105 then
// deleted the modes themselves: the identity-free coverage footprint is the one
// wire shape, so the question the variant asked no longer exists.

/**
 * ms — the lobby host's seed field sends what is typed after this long without
 * a keystroke (cycle 167 review), on top of Enter and blur, so text typed during
 * a countdown still reaches the lobby before it forms. The server stores the
 * text on receipt (no map probe), so a send per pause is cheap.
 */
export const LOBBY_SEED_DEBOUNCE_MS = 400;
