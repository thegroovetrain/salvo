// Radar rendering: the rotating sweep wedge on the own ship, the phosphor marks
// it paints, and the own-ship range rings. All of it lives in chartRoot
// (fog-immune, camera-transformed), so the scope stays readable over the fogged
// ocean while remaining in world coordinates.
//
// TWO RADAR GRAMMARS LIVE HERE (cycle 51, amendments 62-70 + 63), selected by the
// SERVER and announced once in the welcome handshake. The room picks one for the
// whole match, so `BlipEvent` is a TAGLESS union and this file narrows on the
// announced mode — never by probing which fields an event carries.
//
// `silhouette` — THE SHIPPED STORY 4.2 GRAMMAR (FR14, amendments 7-13), the
// default, the fail-safe, and byte-identical to the pre-cycle build. A paint is
// not an anonymous dot: each blip draws the contact's TRUE-SCALE hull silhouette
// at its true position and heading, using the SHARED `hullSilhouette()` polygon
// verbatim (the same one the hull renderer draws and the server hit-tests:
// UX-DR9, the silhouette IS the hitbox). No blip-specific geometry exists — no
// per-class pixel table, no floor-clamp, no exaggerated notch; at true scale a
// 124u battleship and a 100u torpedo boat are unmistakable without them. Three
// grammars ride on that outline:
//   • a NON-SCALING 1px hairline (`pixelLine`), so the outline reads the same
//     at every camera zoom while the FOOTPRINT scales like the real hull;
//   • the owner's LUMINANCE-FLOORED personal hue (drone grey for the roster
//     sentinel, amber on a roster miss — the FALLBACK_STYLE grammar);
//   • an ARPA speed vector (render/blipMarks.ts), astern for a reversing hull.
// Cycle 52 does not touch one line of it.
//
// `return` — THE REALISM GRAMMAR, a QUANTIZED INTENSITY BITMAP PAINTED BY A BEAM
// MARCH (cycle 62, amendments 138-144, superseding the per-object bakes of cycles
// 52-61). There are no per-paint Graphics in this mode at all, and as of this
// cycle there are no per-object paints either: every frame the sweep advances,
// this adapter marches rays from own hull to the radar terminus across the arc
// the beam just crossed, and the SLICES those rays produce are the paint list.
//
// ERIC, ON THE SHIPPED 4.10 BUILD, and this file's structure is that sentence:
// *"as the sweep line sweeps, you're supposed to be radar painting that entire
// line from the ship to the terminus according to how its supposed to show up on
// radar."* The retired primitive asked each OBJECT what it looked like; the march
// asks each BEARING what is out there. render/radarField.ts is the one place that
// answers, render/radarMarch.ts walks the rays, render/radarHeatmap.ts owns the
// buffer, and this file owns lifetime, sweep bookkeeping and texture upload.
//
// WHY THE BAKES DIED (amendment 139, and it was not a bug when it was written):
// the retired near-face criterion was the right rule FOR A DISC, so on an
// elongated fractal island a point at a LATERAL tip scored below the terminator
// ramp and clamped to zero — every long tail and side extremity was suppressed
// regardless of facing, which is the diagonal cut Eric saw across his coastline.
//
// TERRAIN CASTS A HEIGHT-DERIVED SHADOW (Story 4.11, amendments 176-181) — the
// promise cycle 62 made when amendment 140 removed the binary occlusion tests,
// now kept. There is still no near-face terminator, no cross-island segment test
// on a paint path, no clutter occluder mask and no ship shadowing (ships never
// shadow ships, amendment 107/141). What there is instead is ONE running scalar
// per ray, folded by the SHARED model the server's own `blipGate` calls
// (shared/sim/radarShadow.ts): it masks each sample against the grazing ray, so
// a shadowed hull fades through the weakest band rather than cutting at a line
// and a shadowed stretch of water simply goes unpainted (cycle 69 deleted the
// grey NO-DATA cells that used to fill it, and gave TERRAIN its own instance of
// the rule so a mountainside paints to its peak). Only `blipGate` adopts it;
// `pointSighted`, `pointDetected`, the muzzle and smoke halos and the foghorn
// muffle all keep binary island LOS (amendment 179).
//
// AND THE SCOPE IS QUIETED INSIDE TRUESIGHT BY A LIVE DISPLAY MASK (amendment
// 181). Eric: *"I want everything painted at max intensity (0.8 alpha) at all
// times. I want it DISPLAYED muted based on how close to the ship it is."* A
// baked radial-gradient sprite masks `blipLayer` — 20% of the painted opacity
// across the WHOLE SIGHT BUBBLE, ramping to 100% at the 5/8 rung — anchored on
// own hull in WORLD space and updated every frame. It is a presentation
// transform over the composited layer: no paint record is read back, recomputed
// or mutated, which is the distinction amendment 83 actually draws. It masks
// everything the radar DRAWS — the heat buffer and the `silhouette` grammar's
// Graphics alike — and deliberately not the sweep wedge or the range rings,
// which live in `sweepLayer` and are chrome rather than returns.
//
// THE RAMP IS ANCHORED TO TRUESIGHT AND OBSERVER-SCALED (this cycle, correcting
// the shipped 1/8 → 5/8 anchoring). Amendment 181's stated reason is a statement
// about the BUBBLE — *"less prominent in the near sight range where i am going to
// aim based on LOS rather than radar ghosts"* — but the ramp was hung on intel
// range instead, standing at 80% opacity at the very EDGE of the bubble (40%
// halfway out) — exactly the water where hull silhouettes and radar paint
// fought. The floor now holds out to `sightHoleU` and full strength begins at the
// first rung outside it, so the scope is quiet everywhere the eye is the primary
// sensor and at full strength everywhere radar is the only one. Because
// `sightHoleU` is the dazzle-scaled, boon-widened bubble rather than a constant,
// the mask is RE-BAKED whenever that radius moves (`syncDimMask`) — the fog
// hole's own cadence, at most twice per dazzle event plus stat changes.
// render/radarDim.ts owns the curve; render/textures.ts draws it.
//
// TWO SOURCES OF HULL RETURNS, COMPLEMENTARY BY RANGE (amendment 89, unchanged;
// amendment 141 for how they paint). The server has never sent a blip for a
// sighted hull — `blipGate` excludes `dist <= sightRange`, because such a hull is
// delivered as a full `Contact` instead — and that rule is a perception-invariant
// surface this cycle does not touch. So INSIDE truesight the client stamps the
// hull into the field from the `Contact` it already holds and the beam paints it
// on the crossing, exactly like terrain; BEYOND truesight the echo arrives on the
// wire, and `resolvePending` marches THAT hull's own bearing window immediately,
// through the same field seam and the same intensity model, because the SERVER's
// beam has already gated it and waiting for the local beam to come round would
// paint the hull a whole revolution stale. One list, one model, two arrival
// paths; and no hull can be in both, because the two ranges are exact complements
// about one dazzle-scaled radius.
//
// WHICH IS WHY `sightHoleU` AND `setDazzled` SURVIVE, WITH THE JOB THEY HAVE HELD
// SINCE CYCLE 56. The radius is not a suppression boundary; it is the SOURCE
// SELECTOR that keeps the two from overlapping. It stays `fogHoleRadiusU()` — the
// very function that bakes the visible fog hole, and by construction the same
// dazzle-scaled number the server's own `sightOf` uses — because if the client's
// idea of truesight ever drifted from the server's, a hull at the seam would be
// painted twice or not at all.
//
// TERRAIN COMES FROM THE HEIGHT RASTER, NOT FROM THE ISLAND POLYGONS. The
// cycle-59 raster is the ratified elevation authority and its land/water truth is
// the shipped coastline's own mask (`height > 0 ⟺ LAND`), so it answers both
// "is this land" and "how tall" in one O(1) read — which is why this file no
// longer holds an island field at all. Height is read CONTINUOUSLY, never
// terraced to the contour bands, and no contour polygon is ever read (amendment
// 142).
//
// THE BUFFER FOLLOWS THE VIEWPORT, NOT THE RADAR RING (cycle 58, amendments
// 95-99). History lives in the SLICE LIST, which is re-rasterized in full every
// frame, so the buffer only has to cover WHAT IS ON SCREEN: `render` takes the
// camera's world rect, `fitHeat` sizes the surface to it (quantized, so a wheel
// zoom does not churn textures), and `anchorGrid` centres it there — snapped to a
// whole world cell, which is what keeps a paint's cells still while the camera
// slides over them.
//
// NOTHING VIEWPORT-DERIVED TOUCHES PAINT CREATION OR RETIREMENT (amendment 97).
// `view` is read in `paintHeat` and nowhere else: `marchBeam`, `resolvePending`,
// `enrollSlice` and `pruneSlices` cannot see it. That is what makes Eric's
// requirement hold for free — *"if I am zoomed in when it paints and then I zoom
// out, it still shows me everything that would have been there"* — and it is the
// line to hold if this file ever grows a culling optimization. CYCLE 57
// (REVERTED, PR 108) IS THE CAUTIONARY TALE: it confined work to a paint-driven
// sub-rect re-centred every frame and placed the sprite at that MOVING origin, so
// islands drifted with the boat. Its pure-rasterizer tests all passed, because the
// break was in this adapter's PLACEMENT. Hence amendment 98: placement is pinned
// here, at both zoom extremes and with the camera moving.
//
// Persistence is unchanged in both grammars: alpha is a pure function of
// serverNow − paint time (phosphor.ts), three sweeps deep (amendment 9). In
// `return` mode that now means the last three revolutions of SLICES, so the scope
// carries a fading trail behind the beam rather than a fixed number of marks per
// track.
//
// Range rings (documented choice): the plan calls for CIC-style range rings;
// own-ship-centered beats map-centered for readability, so ONE ring at
// exactly sightRange and ONE at exactly radarRange follow the own ship here
// (kept subtle). The faint map-centered rings in map.ts remain as the chart
// grid. Thin Pixi adapter; the math lives in phosphor.ts, blipMarks.ts and
// radarHeatmap.ts.

import { BufferImageSource, Graphics, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import {
  CONFIG,
  HULL_IDS,
  hullEnvelope,
  hullSilhouette,
  mapRadius,
  polygonMaxRadius,
  sampleHeight,
  transformPolygon,
  wrapPositive,
  type BlipEvent,
  type HeightRaster,
  type HullCoverage,
  type HullId,
  type Island,
  type RadarGrammar,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
  type Vec2,
  type WakeBlipEvent,
  WAKE_AGE_BUCKETS,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { ContactStore } from '../net/snapshots.js';
import { settings } from '../settings/store.js';
import { Pool, capOldest, capOldestByKey } from '../util/pool.js';
import { extentAlong, luminanceFloor, speedVector, type SpeedVector } from './blipMarks.js';
import { fogHoleRadiusU } from './fog.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';
import { blipAlpha, blipCool, blipLifeMs, sweepRotation } from './phosphor.js';
import {
  FULL_TURN,
  anchorGrid,
  bandIndex,
  clearGrid,
  gridSpan,
  makeGrid,
  quantizeInto,
  rasterize,
  sampleGrid,
  type HeatGrid,
  type RasterCtx,
} from './radarHeatmap.js';
import {
  buildField,
  buildShipStamp,
  buildWakeStamp,
  chopHaloCells,
  coverageCentre,
  hullSample,
  shipOnlyField,
  stampCoverage,
  wakeOnlyField,
  type CellStamp,
  type EchoHull,
  type ShipStamp,
  type WakeSegmentCover,
} from './radarField.js';
import { echoArc, marchSlice, mergeSlices, planMarch, type MarchSlice } from './radarMarch.js';
import { wakeLitFloor } from './radarSources.js';
import { WakeStampCache, type WakeSources } from './wake.js';
import { DIM_MASK_TEXTURE_SIZE, SWEEP_TEXTURE_RADIUS, bakeDimMaskTexture, bakeSweepTexture } from './textures.js';

export type { HueFor };

/**
 * Hard cap on live (decaying) blips. Radar paints arrive from network
 * messages regardless of render-loop cadence — a backgrounded tab (rAF
 * throttled/paused) can otherwise accumulate blips faster than they age out,
 * growing the pool unbounded. Oldest-inserted is evicted first.
 *
 * Sized for the worst legitimate case under 3-sweep persistence. Note the
 * per-contact cap keys on blip `id`, and a decoy buoy paints under its OWNER's
 * ship id (amendment 11) — so a hull and its own buoy SHARE one 3-paint budget
 * rather than holding two. The true ceiling is therefore 19 distinct ids × 3 =
 * 57, not the 114 a per-source reading would suggest. 128 keeps the backstop
 * comfortably above that: it stays a backstop, never the thing that trims a
 * legitimate scope (the per-contact cap does that).
 */
const MAX_LIVE_BLIPS = 128;

/**
 * Hard cap on live MARCH SLICES — a runaway backstop, and nothing else.
 *
 * The real bound is arithmetic: the beam emits one slice per `march.sliceRad` of
 * arc, so a revolution is `2π / sliceRad` slices and the phosphor holds
 * `persistSweeps` of them. Deriving the cap from those two numbers is what stops
 * it silently becoming a TRIM the moment either is retuned — the exact coupling
 * amendment's-worth of trouble the storm bake's fixed 8,000-cell cap caused in
 * cycle 61, one level up. The doubling is slack for the wire-echo slices, which
 * are emitted on network cadence rather than on the quantum.
 */
function maxSlices(): number {
  const { sliceRad } = CLIENT_CONFIG.blip.heatmap.march;
  const perRev = sliceRad > 0 ? Math.ceil(FULL_TURN / sliceRad) : 1;
  return perRev * CLIENT_CONFIG.blip.persistSweeps * 2;
}
/** Scene-graph label of the near-range dim mask (Story 4.11). Exported because
 *  the mask is a Sprite living in the same layer as the heat sprite, and a test
 *  (or a future consumer) walking that layer's children must be able to tell the
 *  two apart by something better than list order. */
export const DIM_MASK_LABEL = 'radarDimMask';

const RING_SIGHT_COLOR = CLIENT_CONFIG.colors.phosphor; // sight ring — HUD chart chrome
const RING_RADAR_COLOR = CLIENT_CONFIG.colors.silver; // radar ring — neutral linework

/** The `silhouette`-grammar payload of a paint: everything the 4.2 outline
 *  needs. Absent (null) on a `return`-grammar echo, whose whole point is that
 *  none of it reaches the client. */
interface BlipPose {
  cls: HullId; // hull id at paint time (drones carry a drone hull id)
  heading: number; // rad — at paint time
  speed: number; // u/s, signed — at paint time
  /** Firer-hue latch (render/hueLatch.ts): a paint whose owner is not on the
   *  roster yet boots amber and repaints once the hue resolves — and repaints
   *  again on a colorblind-assist table swap. */
  hue: HueState;
}

interface LiveBlip {
  gfx: Graphics;
  /** Contact id — the TRACK key (3 paints per id) and the hue lookup key. */
  id: string;
  t: number; // ms — server paint time (drives decay)
  /** `silhouette` pose + hue latch. Never null: `return`-grammar paints do not
   *  live in this list at all any more — they are bitmap cells, not Graphics. */
  pose: BlipPose;
}

/** A `return` echo whose OBSERVER-RELATIVE geometry (the range its intensity
 *  attenuates over) is not resolved yet: the wire coverage footprint alone,
 *  held until a frame with a real own pose can march it. A paint arrives on
 *  network cadence, so it can land before the first render (join) or in any
 *  later gap where the own pose is unknown — and intensity is frozen at
 *  resolve, so a guessed observer would be wrong for the paint's whole ~12s
 *  life, not for a frame. (The FOOTPRINT itself is world-anchored on the wire
 *  since cycle 63 — only the intensity model needs an observer.) */
interface PendingEcho {
  cov: HullCoverage;
  t: number;
}

/** A `wk` wake segment waiting on an own pose, exactly as `PendingEcho` is —
 *  same park, same reason (intensity is frozen at resolve, so a guessed
 *  observer would be wrong for the paint's whole life). It carries the mask,
 *  the water-age bucket and the paint time, which is the whole wire row. */
interface PendingWake {
  cov: HullCoverage;
  /** Quantized water-age bucket (`WakeBlipEvent.a`). */
  a: number;
  t: number;
}

interface OwnPoint {
  x: number;
  y: number;
}

/**
 * THE WORLD RECTANGLE THE CAMERA IS SHOWING (cycle 58, amendments 95-99) — the
 * heatmap buffer's extent, and the ONLY thing in this file the camera touches.
 *
 * Centre is the camera centre (NOT the ship: at speed the follow-lead puts the
 * hull well off centre, and it is the SCREEN that has to be covered); the half-
 * extents are half the viewport in world units, i.e. screen pixels ÷ zoom.
 *
 * IT REACHES `paintHeat` AND NOTHING ELSE. Paint creation is gated only by the
 * sweep, radar range and LOS; retirement only by time; the paint list is never
 * culled by visibility. So a paint recorded off-screen while zoomed in is fully
 * recorded, and zooming out simply draws a rectangle that now contains it —
 * amendment 97, which is Eric's stated requirement.
 */
export interface ViewRect {
  /** Camera centre (world u). */
  x: number;
  y: number;
  /** Half the visible width/height (world u) = screen px ÷ 2 ÷ zoom. */
  halfW: number;
  halfH: number;
}

// THE ZONE NO LONGER REACHES THIS MODULE AT ALL (cycle 72). `ZoneLike` existed
// solely to hand the storm wall its live ring, and Eric removed that return —
// *"I don't want the storm ring highlighted by radar anymore. I don't like it."*
// The whole `zone` parameter went with it rather than being left plumbed to a
// material that no longer exists. The storm's on-water rendering (render/zone.ts)
// is untouched and is where the ring is legible.

/** The decay inputs shared by every live mark for one frame. */
interface DecayFrame {
  life: number;
  floor: number;
  cool: number;
}

export class Radar {
  private readonly sweep: Sprite;
  private readonly rings: Graphics;
  private readonly pool: Pool<Graphics>;
  private readonly blips: LiveBlip[] = [];
  /** Resolve a contact id → its paint color, or null on a roster miss (amber).
   *  Unused in `return` mode: an echo carries no identity to color. */
  private readonly hueFor: HueFor;
  /** The room's radar grammar, from the welcome handshake. Constant for the
   *  match — the server picks it, the client never infers it. */
  private readonly grammar: RadarGrammar;
  /** THE ELEVATION AUTHORITY (cycle 59 ruling; amendment 129) — and, since cycle
   *  62, the whole of the client's terrain knowledge on this path: its land/water
   *  truth is the shipped coastline's own mask (`height > 0 ⟺ LAND`), so the
   *  march needs no island polygons at all. Rebuilt locally from `welcome.mapSeed`
   *  and never on the wire, so it carries ZERO disclosure. Null until
   *  `setHeightRaster` runs, in which case the field simply carries no terrain. */
  private heightRaster: HeightRaster | null = null;
  /** THE `return` PAINT LIST (ruling R1) — marched slices, re-rasterized in full
   *  every frame. Empty in `silhouette` mode. */
  private readonly paints: MarchSlice[] = [];
  /** Echoes waiting for a real own pose before their geometry can be resolved. */
  private readonly pending: PendingEcho[] = [];
  /** Wake segments waiting on the same thing (Story 4.12). A SEPARATE park
   *  rather than a tagged union in `pending`: the two resolve differently (one
   *  slice per hull echo, one MERGED slice per server tick of wake) and a
   *  flood of one must not evict the other's history. */
  private readonly pendingWake: PendingWake[] = [];
  /** Where the NEXT slice's arc begins — the bearing the beam has been marched up
   *  to. Slices are emitted per fixed angular quantum, so this lags the live beam
   *  by up to one quantum and never by a frame's worth of anything: the list is a
   *  function of the sweep rate, not of the frame rate. Null whenever the sweep is
   *  hidden, so resuming cannot replay a revolution of arc into one frame. */
  private sliceFrom: number | null = null;
  /** The heatmap surface — created ONLY in `return` mode, so `silhouette` mode
   *  allocates no buffer, uploads no texture and adds no child. */
  private heat: { grid: HeatGrid; rgba: Uint8Array; source: BufferImageSource; sprite: Sprite } | null =
    null;
  private readonly blipLayer: Container;
  /**
   * THE NEAR-RANGE DIM MASK (Story 4.11, amendment 181) — a baked radial ramp,
   * anchored on own hull in WORLD units, masking everything `blipLayer` draws.
   * Its two radii ride the observer's EFFECTIVE truesight (`sightHoleU`), so it
   * is re-baked when that number moves; see `syncDimMask`.
   *
   * IT HANGS ON `blipLayer`, NEVER ON `heat.sprite`, and that is not a
   * preference: `fitHeat` DESTROYS the heat sprite and adds a new one whenever
   * the buffer resizes, so a mask assigned there would silently disappear on the
   * next zoom change. `blipLayer` also covers the `silhouette` grammar's
   * Graphics pool, which is correct — the rule is a property of the display, so
   * it applies to everything the radar draws — while the sweep wedge and the
   * range rings sit in `sweepLayer` and stay unmasked as chrome.
   *
   * IT IS A CHILD OF THE LAYER IT MASKS, which is what keeps its world transform
   * updated (Pixi's `AlphaMask` sets `renderable = false` on a sprite mask, so it
   * is in the scene graph without ever being drawn).
   */
  private readonly dim: Sprite;
  /** The effective truesight radius (u) the current `dim` texture was baked at.
   *  `syncDimMask` compares against `sightHoleU` and re-bakes on a real change —
   *  never per frame (a 1024² canvas draw), and never missed either, because the
   *  compare sits on the per-frame placement path rather than on the stat and
   *  dazzle setters, which are two ways in for one number. */
  private dimBakedAtU: number;
  /** Scratch for the pose transform — consumed synchronously by the trace, so
   *  one array serves every blip (the 20Hz loop stays allocation-light). */
  private readonly scratch: Vec2[] = [];
  /** Latest authoritative sweep sample (angle at server time t). */
  private lastSweep: { angle: number; t: number } | null = null;
  /** Beam angle at the PREVIOUS frame — the arc the march walks is measured
   *  against it. Null whenever the sweep is hidden. */
  private lastRotation: number | null = null;
  /** Last rendered own position — the observer an echo's bearing and range are
   *  measured from. Null before the first render (and in any later gap where the
   *  own pose is unknown), in which case an echo's geometry is DEFERRED rather
   *  than guessed. */
  private own: OwnPoint | null = null;
  /** The world rect the camera is showing this frame (amendment 96), or null
   *  when the caller has no camera. READ IN EXACTLY ONE PLACE — `paintHeat` —
   *  and never by anything that creates or retires a paint (amendment 97). */
  private view: ViewRect | null = null;
  // Effective vision numbers (Stage D upgrades), swapped via setRanges();
  // bases = CONFIG.vision. sweepPeriodMs drives both the wedge rotation rate
  // and the blip phosphor decay, so upgraded paints fade on the upgraded beat.
  private sightRange: number = CONFIG.vision.sight;
  private radarRange: number = CONFIG.vision.radar;
  private sweepPeriodMs: number = 60000 / CONFIG.vision.sweepRpm;
  /** Is the own ship inside an enemy DAZZLE BURST right now (Story 2.8)? The
   *  SAME flag `Fog` carries, plumbed from the same place in main.ts — the
   *  source seam and the drawn fog hole are one number (amendment 89), so they
   *  cannot be allowed to disagree about dazzle. It is read at paint creation
   *  only, so a dazzle changes which source paints the NEXT sweep and never
   *  retroactively edits a paint already on the scope (amendment 83). */
  private dazzled = false;
  /**
   * THE IN-BOUND WAKE SOURCE (Story 4.12) — the client's own ribbons, for the
   * half of the scope's wake the server deliberately does not disclose.
   *
   * THE `wk` ROW'S INNER BOUND IS PER SOURCE (corrected at the cycle-69 review
   * gate, P2 — this comment previously said the row simply inherited
   * `blipGate`'s annulus, which is no longer true for the fish). A SHIP's water
   * is withheld inside the sight bubble; a TORPEDO's is withheld only inside the
   * 3/8 DETECT rung, so torpedo segments in the (detect, sight] band DO come off
   * the wire and paint here through the ordinary adapter — `validWake` has no
   * position gate, so nothing had to change to let them through.
   *
   * Either way the reason for the withheld half is the same: running water
   * inside those radii through the height-aware disclosure march would leak a
   * source that BINARY island LOS is hiding. The client synthesizes that half
   * from pose it already holds — exactly what it already does for a sighted
   * HULL's echo (amendments 88 + 154, two sources, one appearance) — and
   * `buildTruesightWakeStamp` carries the server's reason with it: binary LOS
   * per segment (hence `islands`) and only for a source being observed RIGHT
   * NOW (cycle-69 review gate, P5).
   *
   * Null until main.ts wires the emitter, and null for any caller that has no
   * wake at all: `FieldSpec.wake` is optional and the field answers as it did
   * before 4.12 without it.
   */
  private wakeSources: WakeSources | null = null;
  /** The deterministic island set (rebuilt from the map seed), for the wake
   *  stamp's binary-LOS clause. Empty for a caller that has none — in which
   *  case nothing blocks, which is the pre-P5 behaviour. */
  private wakeIslands: readonly Island[] = [];
  private readonly wakeCache = new WakeStampCache();

  constructor(
    blipLayer: Container,
    sweepLayer: Container,
    hueFor: HueFor,
    grammar: RadarGrammar = 'silhouette',
  ) {
    this.hueFor = hueFor;
    this.grammar = grammar;
    this.blipLayer = blipLayer;
    // BEFORE the Graphics pool and before any heat sprite, so the mask is the
    // layer's first child and nothing depends on where it lands in the list.
    this.dimBakedAtU = this.sightHoleU;
    this.dim = new Sprite(bakeDimMaskTexture(this.dimBakedAtU));
    this.dim.label = DIM_MASK_LABEL;
    this.dim.anchor.set(0.5);
    // One texel is `2 × spanU / size` world units, so the ramp's two radii sit
    // exactly where CONFIG's eighths ladder puts them whatever the bake size is.
    this.dim.scale.set((2 * CLIENT_CONFIG.blip.heatmap.dim.spanU) / DIM_MASK_TEXTURE_SIZE);
    // NEVER DRAWN, ALWAYS TRANSFORMED. `renderable = false` is exactly what
    // Pixi's own `AlphaMask.init` sets on a sprite mask (alongside
    // `includeInBuild = true`), so the sprite stays in the scene graph — and
    // therefore keeps a live world transform — without ever painting a grey
    // square over the ocean in the frames before the mask is attached. `visible`
    // is deliberately NOT used: it drops the node out of the build entirely.
    this.dim.renderable = false;
    blipLayer.addChild(this.dim);
    this.pool = new Pool<Graphics>(() => this.makeBlipGraphics(blipLayer));

    this.rings = new Graphics();
    this.rings.visible = false;

    this.sweep = new Sprite(bakeSweepTexture());
    this.sweep.anchor.set(0.5);
    this.sweep.blendMode = 'add';
    this.sweep.visible = false;

    sweepLayer.addChild(this.rings, this.sweep);
    this.applyRanges();
  }

  /**
   * Adopt the observer's effective vision stats (sight/radar range + sweep
   * period): redraws the range rings and rescales the baked sweep wedge to the
   * new radar radius. Called only when the own stats change.
   *
   * IT NO LONGER SIZES THE HEATMAP (amendment 96). The buffer follows the
   * VIEWPORT now, so a radarRange upgrade reaches it only through the camera —
   * `Camera.setRadarRange` zooms out, the view rect grows, and `fitHeat` adopts
   * it on the next frame.
   */
  setRanges(sightRange: number, radarRange: number, sweepPeriodMs: number): void {
    this.sightRange = sightRange;
    this.radarRange = radarRange;
    this.sweepPeriodMs = sweepPeriodMs;
    this.applyRanges();
  }

  /**
   * Adopt the DAZZLE state (Story 2.8) — the radar half of the plumbing `Fog`
   * has always had. Returns TRUE when the state actually flipped, mirroring
   * `Fog.setDazzled`'s changed-flag contract so one call site can drive both;
   * unlike the fog there is nothing to rebake, so this radar's caller is free to
   * ignore the result.
   *
   * A DAZZLE MOVES THE SOURCE SEAM, NOT THE SCOPE (amendments 88-89). While it
   * holds, the SERVER's truesight shrinks and it starts sending wire blips for
   * the annulus the eye just lost; this flag is what makes the client stop
   * synthesizing contact echoes there on the same beat. Nothing is suppressed
   * either way — a hull in that annulus paints throughout; only which source
   * paints it changes. Paints already on the scope are never re-judged.
   */
  setDazzled(dazzled: boolean): boolean {
    if (dazzled === this.dazzled) return false;
    this.dazzled = dazzled;
    return true;
  }

  /** Is the dazzle currently held? Test/observation seam (mirrors `Fog`). */
  get isDazzled(): boolean {
    return this.dazzled;
  }

  /**
   * THE SOURCE SEAM (u): the effective truesight radius, inside which a ship
   * echo is SYNTHESIZED from its `Contact` and outside which it arrives as a
   * wire blip (amendment 89). Nothing is suppressed on either side of it — the
   * scope paints everything in radar range (amendment 88).
   *
   * It is `fogHoleRadiusU` — the very function that bakes the visible fog hole,
   * called rather than re-derived — because that is also, by construction, the
   * dazzle-scaled number the server's own `sightOf` uses to decide the same
   * question from the other side. If the two ever disagreed, a hull at the seam
   * would be painted twice or dropped entirely. Exposed for tests and for
   * exactly that equality assertion.
   */
  get sightHoleU(): number {
    return fogHoleRadiusU(this.sightRange, this.dazzled);
  }

  private applyRanges(): void {
    this.rings.clear();
    this.rings.circle(0, 0, this.sightRange).stroke({ width: 2, color: RING_SIGHT_COLOR, alpha: 0.12 });
    this.rings.circle(0, 0, this.radarRange).stroke({ width: 2, color: RING_RADAR_COLOR, alpha: 0.07 });
    this.sweep.scale.set(this.radarRange / SWEEP_TEXTURE_RADIUS);
  }

  /**
   * (Re)allocate the heatmap surface to cover a view rect (amendment 96).
   *
   * IDEMPOTENT ON THE CELL SPAN, which is what makes this safe to call every
   * frame: `gridSpan` rounds up to `GRID_QUANTUM`, so a wheel zoom or a window
   * drag walks through many world extents and only a few actual allocations,
   * and a steady camera never churns a texture at all. Reallocating is the ONLY
   * way the buffer changes size — nothing ever resizes a view over a live
   * typed array (cycle 57's `subarray` smeared rows doing exactly that).
   */
  private fitHeat(halfWU: number, halfHU: number): void {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    // Span first, allocation second: this runs every frame, and building a grid
    // just to compare its dimensions would throw two typed arrays away 60 times
    // a second.
    const cols = gridSpan(halfWU, cfg.cellU);
    const rows = gridSpan(halfHU, cfg.cellU);
    if (this.heat !== null && this.heat.grid.cols === cols && this.heat.grid.rows === rows) return;
    const grid = makeGrid(halfWU, halfHU, cfg.cellU);
    this.heat?.sprite.destroy();
    this.heat?.source.destroy();
    const rgba = new Uint8Array(grid.cols * grid.rows * 4);
    // NEAREST scaling and nothing else: the whole ruling is that there is no
    // interpolation between the three bands, and a linear filter would invent
    // exactly the blends amendment 77 forbids.
    const source = new BufferImageSource({
      resource: rgba,
      width: grid.cols,
      height: grid.rows,
      scaleMode: 'nearest',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    const sprite = new Sprite(new Texture({ source }));
    sprite.blendMode = 'add';
    sprite.scale.set(grid.cellU); // one texel = one world cell
    sprite.visible = false;
    this.blipLayer.addChild(sprite);
    this.heat = { grid, rgba, source, sprite };
  }

  /**
   * Adopt the client-known HEIGHT RASTER — the elevation authority (cycle 59
   * ruling, amendment 129) and, since cycle 62, the ONLY terrain input the
   * `return` grammar has. The retired `setIslands` went with the per-object
   * bakes: the raster answers both "is this land" (`height > 0 ⟺ the shipped
   * coastline's own mask says LAND`) and "how tall" in one O(1) read, so a second
   * polygon field would be a second source of truth for the first question.
   *
   * Zero disclosure: both sides rebuild it from `welcome.mapSeed` and it never
   * travels on the wire. It is read only when a slice is MARCHED (i.e. at paint
   * creation), so a raster arriving late can change what the NEXT sweep records
   * and can never edit a slice already on the scope (amendment 83).
   */
  setHeightRaster(raster: HeightRaster | null): void {
    this.heightRaster = raster;
  }

  /** How many blips are currently decaying (debug/tests). `silhouette` only. */
  get liveBlips(): number {
    return this.blips.length;
  }

  /** How many `return` slices are live in the list (debug/tests). */
  get livePaints(): number {
    return this.paints.length;
  }

  /** How many CELLS the live slices carry between them (debug/tests) — the
   *  count that actually says whether the scope is painting, now that a slice is
   *  a wedge of the world rather than one object. */
  get livePaintCells(): number {
    let n = 0;
    for (const s of this.paints) n += s.n;
    return n;
  }

  /**
   * THE PAINT LIST ITSELF — the assertion surface for amendment 97.
   *
   * Nothing viewport-derived may ever reach paint creation or retirement, and
   * the way that is PROVEN rather than asserted is by driving two radars with
   * identical world state through different cameras and comparing this list
   * byte for byte. Read-only: the list is the history, and only the sweep and
   * the clock may write it.
   */
  get paintList(): readonly MarchSlice[] {
    return this.paints;
  }

  /**
   * Which quantized band the heatmap is painting at a world point, or -1 for
   * fully transparent. THE observation seam for the bitmap: the buffer is a pure
   * function of the paint list, so a test can assert the exact three-color
   * contract without a GPU.
   */
  bandAt(x: number, y: number): number {
    if (this.heat === null) return -1;
    return bandIndex(sampleGrid(this.heat.grid, x, y).w, CLIENT_CONFIG.blip.heatmap.bands);
  }

  /** The raw (unquantized) intensity at a world point (debug/tests). */
  intensityAt(x: number, y: number): number {
    return this.heat === null ? 0 : sampleGrid(this.heat.grid, x, y).w;
  }

  /** Current buffer dimensions in cells, or null before the first `return`
   *  frame. The perf seam: cost per frame scales with cols × rows, which is why
   *  amendment 99 requires it measured at both zoom extremes. */
  get heatDims(): { cols: number; rows: number } | null {
    return this.heat === null ? null : { cols: this.heat.grid.cols, rows: this.heat.grid.rows };
  }

  private makeBlipGraphics(layer: Container): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';
    g.visible = false;
    layer.addChild(g);
    return g;
  }

  /** The live colorblind-assist state, read STRAIGHT from the store rather than
   *  cached per frame: a paint can arrive between frames (network cadence is
   *  not render cadence), and a cached flag would draw it at the wrong floor and
   *  then latch there. The assist no longer swaps a blip TEXTURE (the soft dot
   *  it existed for is gone): it raises the decayed alpha floor and the hue
   *  luminance floor — the only two channels a 1px `pixelLine` hairline has,
   *  since `pixelLine` IGNORES stroke width. A hue-table swap bumps
   *  `hueRevision()`, which is what repaints the already-live blips at the new
   *  floor (via `retryHue` in updateBlips). */
  private get assist(): boolean {
    return settings.current.colorblind;
  }

  /** Ingest the authoritative sweep angle from a frame (server time `t`). */
  onSweepSample(angle: number, t: number): void {
    this.lastSweep = { angle, t };
  }

  /**
   * A radar paint arrived.
   *
   * `BlipEvent` is a TAGLESS union — the server picks one grammar for the whole
   * room and announces it in the welcome, so a per-event discriminator would be
   * dead weight on a 20Hz channel. The cast below is therefore keyed on the
   * ANNOUNCED mode and never on which fields happen to be present: field-probing
   * would be a second source of truth for the same question.
   */
  onBlip(e: BlipEvent): void {
    if (this.grammar === 'return') this.addReturnPaint(e as ReturnBlipEvent);
    else this.addSilhouetteBlip(e as SilhouetteBlipEvent);
  }

  /** The latest authoritative server time this radar can judge a paint's `t`
   *  against, plus slack — Infinity before the first sweep sample, when there
   *  is no clock reference at all. Both grammar validators use it: a
   *  far-future `t` makes `blipAlpha`'s age negative, a full-brightness paint
   *  that never decays or prunes (cycle-63 review gate). */
  private get maxPaintT(): number {
    return this.lastSweep === null ? Infinity : this.lastSweep.t + MAX_FUTURE_T_MS;
  }

  /** The `silhouette` (Story 4.2) acquire path — outline + hue + ARPA vector.
   *  Structurally validated FIRST, exactly like the `return` branch (cycle-63
   *  review gate): a malformed payload is dropped whole, never fed into
   *  `acquireBlip`/`resolveHue` as NaN/undefined. */
  private addSilhouetteBlip(e: SilhouetteBlipEvent): void {
    if (!validSilhouette(e, this.maxPaintT)) return;
    const { color, colored, rev } = resolveHue(e.id, this.hueFor);
    const pose: BlipPose = {
      cls: e.cls,
      heading: e.heading,
      speed: e.speed,
      hue: { by: e.id, colored, rev },
    };
    const b = this.acquireBlip(e.x, e.y, e.id, e.t, pose);
    this.drawBlip(b, pose, color);
    // Per-track cap first (this id's 4th paint releases its oldest), then the
    // global backstop — so a flood on one contact can never evict another's.
    this.blips.push(b);
    this.retire(capOldestByKey(this.blips, keyOf, b.id, CLIENT_CONFIG.blip.paintsPerContact));
    this.retire(capOldest(this.blips, MAX_LIVE_BLIPS));
  }

  /** The `return` acquire path: park the wire coverage footprint until a real
   *  own pose can price its cells, then march it. The wire fields are
   *  structurally validated FIRST — `w`/`h` bound two loops and `bits` sizes
   *  an array, and while a conforming server can only send real hull masks
   *  (≤ ~22 cells a side), a scalar off the network that bounds a loop is
   *  finiteness-checked on this path like everywhere else (the cycle-62
   *  `radarRange = Infinity` lesson). A malformed footprint is dropped whole. */
  private addReturnPaint(e: ReturnBlipEvent): void {
    if (!validCoverage(e, this.maxPaintT)) return;
    this.pending.push({ cov: { gx: e.gx, gy: e.gy, w: e.w, h: e.h, bits: e.bits }, t: e.t });
    // CAP THE PARK (cycle-63 review gate): paints arrive on network cadence
    // while own pose can stay null indefinitely (the join gap, or a server
    // withholding own frames), and each parked entry holds a whole mask — so
    // without a cap the array grows unboundedly. Oldest-parked is dropped
    // first: by the time a pose finally exists, the oldest echoes are the
    // stalest history anyway. Same ceiling as the live-blip backstop.
    if (this.pending.length > MAX_LIVE_BLIPS) this.pending.shift();
    this.resolvePending();
  }

  /**
   * Turn every parked echo into a slice, ONCE an own pose exists.
   *
   * THIS IS THE BEYOND-TRUESIGHT SOURCE. Everything arriving here came through
   * the server's `blipGate`, which excludes `dist <= sightRange` — so it is
   * ALREADY SWEEP-GATED, by the server's own beam on the tick it crossed the
   * hull. Waiting for the local beam to reach that bearing would paint the hull
   * on the NEXT revolution instead, i.e. up to a full sweep period stale, which
   * on a 45 u/s torpedo boat is most of a map away. The inside-truesight half of
   * the scope has no such problem and is painted by the local beam through the
   * field (`marchBeam`), exactly like terrain.
   *
   * IT IS STILL THE SAME MARCH. The hull is stamped into a one-hull field and
   * that field is marched across the bearing window it subtends, so its cells,
   * its intensity, its grain and its slice record all come from the same code as
   * every other return. Geometry is frozen at that moment — a paint is a
   * historical snapshot, so it must not re-pose as the observer moves, and the
   * deferral exists only to stop a slice being born against a guessed observer.
   */
  private resolvePending(): void {
    const own = this.own;
    if (own === null || this.pending.length === 0) return;
    if (this.aground(own)) {
      this.pending.length = 0; // an aground set makes no paints, from any source
      return;
    }
    for (const e of this.pending) {
      const slice = this.marchEcho(own, e);
      if (slice !== null) this.enrollSlice(slice);
    }
    this.pending.length = 0;
  }

  /**
   * March ONE resolved wire footprint through the one-hull field.
   *
   * THE FOOTPRINT IS THE WIRE'S, VERBATIM (cycle 63): the server rasterized
   * the true hull polygon onto the shared radar grid and the mask's cells are
   * absolute world cells, so `stampCoverage` lays them down exactly where the
   * wire put them — the client adds only the intensity model (the material
   * coefficient, range falloff per cell, the SNR grain), through the same
   * stamp the sighted-contact source uses (amendment 154: two sources, one
   * appearance).
   *
   * THE MARCH BOUND COVERS THE ECHO'S OWN RANGE, NOT MERELY THE LIVE SCOPE, and
   * that is amendment 127 holding at the rim. `marchSlice` clips every ray to the
   * range it is handed; the server blipped this hull against ITS radar range and
   * ITS pose, so under prediction divergence or a lag spike the client's own
   * `radarRange` can sit a cell or two short of a rim echo's computed distance —
   * at which point every ray stopped BEFORE the stamped footprint and the slice
   * came back null. The retired per-object path painted a resolved echo
   * unconditionally, and nothing was ever ruled to narrow that: anything the
   * server blips paints at least a speck. Widening the bound cannot paint
   * anything else, because the field contains this hull and nothing else.
   *
   * AND IT IS SHADOWED — ATTENUATED, NEVER SUPPRESSED (review gate). The
   * one-hull field carries the SAME height raster the beam march reads, so the
   * echo's cells are scaled by the ray's illuminated fraction at their own range
   * and then floored at `minPeak` (`shade`, radarMarch.ts). Beyond truesight the
   * wire is the ONLY way a hull reaches the scope, so without this a hull sliding
   * into cover painted at full strength until the server's gate flipped and then
   * cut out — the very line Story 4.11 exists to soften. The floor is what keeps
   * amendment 127 intact through the change: a disclosed echo can be dimmed to
   * its speck and no further, ever.
   */
  private marchEcho(own: OwnPoint, e: PendingEcho): MarchSlice | null {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const stamp: ShipStamp = new Map();
    stampCoverage(stamp, e.cov, hullSample(cfg.model));
    const c = coverageCentre(e.cov, cfg.cellU);
    // The footprint's own reach: half its rect diagonal covers every covered
    // cell at any orientation — echoArc turns it into the bearing window and
    // the radial slab the march has to walk.
    const arc = echoArc(own, c.x, c.y, Math.hypot(e.cov.w, e.cov.h) * cfg.cellU);
    const pad = arc.reach + 2 * cfg.cellU;
    const reach = Math.max(this.radarRange, arc.dist + pad);
    return marchSlice(
      own,
      arc.centre - arc.half,
      arc.centre + arc.half,
      shipOnlyField(stamp, cfg.cellU, this.heightRaster),
      reach,
      e.t,
      cfg,
      // The radial slab the footprint lives in — a compute bound, so the ray
      // does not walk the whole scope to find one hull.
      { fromU: arc.dist - pad, toU: arc.dist + pad },
    );
  }

  /**
   * A WAKE SEGMENT ARRIVED (Story 4.12, amendments 194-206) — one stretch of
   * disturbed water the observer's own sweep crossed this tick.
   *
   * IT MIRRORS `addReturnPaint` DELIBERATELY, down to the validator and the
   * capped park, because it is the same kind of thing: a world-anchored coverage
   * mask on the shared lattice, already sweep-gated by the SERVER's beam (the
   * same three clauses `blipGate` enforces — annulus, swept-this-tick, and
   * amendment 179's shadow accumulator, applied PER SEGMENT), which the client
   * prices through its own intensity model. It is NOT a declared exception to
   * the master perception invariant; what is new is only that the subject is
   * water rather than a ship.
   *
   * IT DOES NOT RESOLVE ON ARRIVAL, and that is the ONE place it deliberately
   * differs from `addReturnPaint`. A ribbon discloses PER SEGMENT, so a tick
   * delivers a batch of rows in one message; resolving each on arrival would
   * enroll a slice apiece (see `resolvePendingWake` for why that breaks the slice
   * cap). The park is drained on the next frame instead — at most ~16ms later,
   * against a ~12s phosphor life — and the row is still never held for the LOCAL
   * beam, which is the property that actually matters.
   *
   * THE PAYLOAD IS VALIDATED BEFORE ANYTHING TOUCHES IT, exactly as the cycle-63
   * gate hardened the echo path: `w`/`h` bound two loops, `bits` sizes an array,
   * `a` indexes an intensity ladder, and an unbounded future `t` is a
   * full-brightness paint that never decays or prunes. A malformed row is
   * dropped WHOLE — never clamped into something half-drawable.
   */
  onWakeBlip(e: WakeBlipEvent): void {
    if (!validWake(e, this.maxPaintT)) return;
    this.pendingWake.push({ cov: { gx: e.gx, gy: e.gy, w: e.w, h: e.h, bits: e.bits }, a: e.a, t: e.t });
    // Same ceiling and the same eviction order as the echo park, for the same
    // reason: paints arrive on network cadence while own pose can stay null
    // indefinitely, and the oldest parked segment is the stalest water anyway.
    if (this.pendingWake.length > MAX_LIVE_BLIPS) this.pendingWake.shift();
  }

  /**
   * Turn every parked wake segment into paint, ONCE an own pose exists.
   *
   * SEGMENTS FROM ONE SERVER TICK BECOME ONE SLICE, and that is a real
   * requirement rather than an optimization. A ribbon discloses per SEGMENT (a
   * 540u track spans far too many bearings for one centre predicate), so a busy
   * room produces roughly an order of magnitude more wake rows than hull echoes;
   * one slice apiece would push the live list past `maxSlices()` and turn a
   * RUNAWAY BACKSTOP into a trim that silently eats legitimate history — the
   * exact coupling the cap's own comment warns about. Merging by paint time is
   * lossless: every segment in a tick shares one `t`, so one record carries them
   * at one age with no arbitration changed.
   *
   * Each segment still marches its OWN narrow bearing window (the union of a
   * roomful of tracks would be most of the circle), so nothing about what a cell
   * reads depends on the batching.
   */
  private resolvePendingWake(): void {
    const own = this.own;
    if (own === null || this.pendingWake.length === 0) return;
    if (this.aground(own)) {
      this.pendingWake.length = 0; // an aground set makes no paints, from any source
      return;
    }
    const byTick = new Map<number, MarchSlice[]>();
    for (const e of this.pendingWake) {
      const slice = this.marchWake(own, e);
      if (slice === null) continue;
      const at = byTick.get(e.t);
      if (at === undefined) byTick.set(e.t, [slice]);
      else at.push(slice);
    }
    this.pendingWake.length = 0;
    for (const group of byTick.values()) {
      const merged = mergeSlices(group);
      if (merged !== null) this.enrollSlice(merged);
    }
  }

  /**
   * March ONE disclosed wake segment through the wake-only field.
   *
   * IT IS `marchEcho`'s SIBLING AND SHARES ITS RULES: the mask is the wire's
   * verbatim (the server rasterized it onto the same lattice with the same
   * `rasterizeSegmentCoverage`, so its cells are absolute world cells), the
   * client adds only the intensity model, the bound covers the segment's own
   * range rather than merely the live scope, and the ray's illuminated fraction
   * ATTENUATES what it finds without ever suppressing it (`disclosed: true`,
   * amendment 190).
   *
   * THE CHOP HALO IS SYNTHESIZED HERE, at paint creation, and frozen with the
   * paint (amendments 83 + 202). It carries no information — it is the wake's own
   * lateral spread at the Kelvin envelope, drawn in sea clutter's coefficient —
   * so it must not cost wire and must not create a disclosure surface. The march
   * window is widened by the halo so the outer speckle is actually walked.
   */
  private marchWake(own: OwnPoint, e: PendingWake): MarchSlice | null {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const segs: WakeSegmentCover[] = [{ cov: e.cov, a: e.a }];
    const stamp: CellStamp = buildWakeStamp(segs, cfg.model, wakeLitFloor(cfg.model));
    const c = coverageCentre(e.cov, cfg.cellU);
    const halo = chopHaloCells(e.cov, e.a) * cfg.cellU;
    const arc = echoArc(own, c.x, c.y, Math.hypot(e.cov.w, e.cov.h) * cfg.cellU + 2 * halo);
    const pad = arc.reach + 2 * cfg.cellU;
    const reach = Math.max(this.radarRange, arc.dist + pad);
    return marchSlice(
      own,
      arc.centre - arc.half,
      arc.centre + arc.half,
      wakeOnlyField(stamp, cfg.cellU, this.heightRaster),
      reach,
      e.t,
      cfg,
      { fromU: arc.dist - pad, toU: arc.dist + pad },
    );
  }

  /**
   * Add a slice to the list and apply the runaway backstop.
   *
   * THERE IS NO PER-TRACK CAP ANY MORE, and its absence is the point: a slice is
   * a wedge of the WORLD, not a mark on one object, so "three paints per track"
   * has nothing left to key on. Depth is now carried by time alone — the phosphor
   * life is `persistSweeps` sweep periods, so the scope holds exactly the last
   * three revolutions of arc and a contact still leaves a plottable train of
   * ghosts whose SPACING encodes its speed (amendment 9's actual requirement).
   * Retirement is gated by TIME and by nothing else (amendment 97).
   */
  private enrollSlice(s: MarchSlice): void {
    this.paints.push(s);
    const cap = maxSlices();
    while (this.paints.length > cap) this.paints.shift();
  }

  /** Hide + pool a batch of retired blips. */
  private retire(gone: readonly LiveBlip[]): void {
    for (const b of gone) {
      b.gfx.visible = false;
      this.pool.release(b.gfx);
    }
  }

  /** Pool a Graphics for a fresh paint and reset the state a previous life left
   *  on it. `updateBlips` overwrites alpha/tint before the stage draws (our
   *  render callback runs at ticker priority NORMAL, Pixi's own render at LOW),
   *  so this is not reachable today — but resetting here makes "a fresh paint is
   *  fresh" a local invariant of acquire instead of a silent dependency on that
   *  ordering, which nothing else in this file would notice breaking. */
  private acquireBlip(x: number, y: number, id: string, t: number, pose: BlipPose): LiveBlip {
    const gfx = this.pool.acquire();
    gfx.position.set(x, y);
    gfx.visible = true;
    gfx.alpha = 1;
    gfx.tint = CLIENT_CONFIG.colors.white; // the un-cooled multiplier
    return { gfx, id, t, pose };
  }

  /** Draw one paint: the true-scale silhouette rotated to its heading, plus the
   *  ARPA speed vector, as ONE path stroked in a single non-scaling hairline.
   *  The Graphics carries no rotation of its own — the polygon is pre-rotated
   *  through the shared `transformPolygon`, which keeps the silhouette and the
   *  vector in one frame of reference and the stroke free of any node
   *  transform. Called once at acquire (and again only if the hue resolves or
   *  the hue table swaps), never per frame. */
  private drawBlip(b: LiveBlip, pose: BlipPose, color: number): void {
    const g = b.gfx;
    g.clear();
    // `hullSilhouette` is a plain record lookup and returns undefined for an
    // id outside the registry, which would throw one frame later inside a
    // Colyseus message handler and take blip ingest down for the session. A
    // conforming server can't send one (the PV-20 gate gives both sides the
    // same HullId union), so this is purely a fail-soft on the ingest path:
    // draw SOMETHING readable rather than lose the scope.
    const local = hullSilhouette(pose.cls) ?? hullSilhouette('torpedoBoat');
    tracePolygon(g, transformPolygon(local, 0, 0, pose.heading, this.scratch));
    const mark = this.speedMark(local, pose.heading, pose.speed);
    if (mark !== null) traceVector(g, mark);
    const floor = this.assist ? CLIENT_CONFIG.blip.assistLumaFloor : CLIENT_CONFIG.blip.lumaFloor;
    g.stroke({ width: 1, pixelLine: true, color: luminanceFloor(color, floor), alpha: 1 });
  }

  /** The speed vector for a paint, rooted on the hull outline in the direction
   *  of travel (astern for a reversing hull), or null when it is stopped. */
  private speedMark(local: readonly Vec2[], heading: number, speed: number): SpeedVector | null {
    const root = extentAlong(local, speed < 0 ? Math.PI : 0);
    return speedVector(heading, speed, root, CLIENT_CONFIG.blip.vector);
  }

  /** Drop every live mark at once (entering spectate: contacts go live/unfogged). */
  clearBlips(): void {
    this.retire(this.blips);
    this.blips.length = 0;
    this.paints.length = 0;
    this.pending.length = 0;
    this.pendingWake.length = 0;
    this.sliceFrom = null;
    this.hideHeat();
  }

  /** Per-frame: rotate/position the sweep + rings, march the arc the beam just
   *  swept, then decay every live mark and re-rasterize the heatmap.
   *
   *  `contacts` is the truesight contact store (net/snapshots.ts) — the
   *  inside-truesight source of hull returns (amendment 89). Optional and unread
   *  in `silhouette` mode, where a sighted hull has never painted and does not
   *  start now.
   *
   *  `view` is the world rectangle the camera is showing (amendment 96) — the
   *  heatmap buffer's extent, used by `paintHeat` and by NOTHING else on this
   *  path. Omitting it falls back to a radar-ring-sized window on the own ship,
   *  which is the pre-cycle-58 behaviour and covers any caller that has no
   *  camera (tests, and the `silhouette` grammar, which has no buffer at all).
   */
  render(
    own: OwnPoint | null,
    serverNow: number,
    contacts: ContactStore | null = null,
    view: ViewRect | null = null,
  ): void {
    this.own = own;
    this.view = view;
    // EVERY FRAME, INCLUDING THE ONES THAT PAINT NOTHING. `paintHeat` returns
    // early when there are no paints (and before that when there is no window at
    // all), so hanging the mask's placement off that path would leave it parked
    // at the previous hull position for as long as the scope stayed empty — and
    // then the next paint would appear through a stale ramp.
    this.updateDimMask(own);
    const rot = this.updateSweep(own, serverNow);
    if (this.grammar === 'return') this.renderReturn(own, rot, serverNow, contacts);
    this.lastRotation = rot;
    this.updateBlips(serverNow);
  }

  /** The whole `return` frame: resolve parked echoes, march the swept arc, drop
   *  dead slices, re-rasterize the buffer from the survivors, upload. */
  private renderReturn(
    own: OwnPoint | null,
    rot: number | null,
    serverNow: number,
    contacts: ContactStore | null,
  ): void {
    this.resolvePending();
    this.resolvePendingWake();
    if (own !== null && rot !== null) this.marchBeam(own, rot, serverNow, contacts);
    this.pruneSlices(serverNow);
    this.paintHeat(own, serverNow);
  }

  /**
   * ADVANCE THE BEAM AND MARCH WHAT IT CROSSED — the whole of the `return`
   * grammar's paint creation, in one place.
   *
   * THE FIELD IS BUILT ONCE PER FRAME AND FROZEN (amendment 83). The observer
   * and every hull's footprint are captured here; each slice then
   * freezes its own samples out of that field, so nothing a slice contains can
   * ever be re-evaluated against live state.
   *
   * SLICES COME OUT ON A FIXED ANGULAR QUANTUM, NOT PER FRAME. `sliceFrom` is the
   * bearing the march has reached, and it advances one `sliceRad` at a time until
   * it catches the live beam — so a 144Hz client and a 30Hz client emit the same
   * slices at the same bearings, and the list depth is a function of the sweep
   * rate and the phosphor life alone. A frame that advances less than one quantum
   * emits nothing and loses nothing; the remainder is simply still owed.
   */
  private marchBeam(
    own: OwnPoint,
    rot: number,
    serverNow: number,
    contacts: ContactStore | null,
  ): void {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    // AN AGROUND OBSERVER CREATES NO PAINTS. A ray starts at d = 0, so a set
    // standing ON a landmass would paint that landmass at zero range — i.e. at
    // full reflectivity, red, out to its whole coastline — every revolution.
    if (this.aground(own)) {
      this.sliceFrom = rot;
      return;
    }
    // CATCH UP FIRST, THEN MARCH — one pure function owns both halves of that
    // rule (`planMarch`), because splitting the cursor reset from the emission
    // cap across two modules is exactly how the cycle-62 gate's blank-scope
    // defect got in.
    const plan = planMarch(this.sliceFrom ?? rot, rot, cfg.march);
    this.sliceFrom = plan.from;
    if (plan.owed <= 0) return;
    const field = buildField({
      obs: own,
      raster: this.heightRaster,
      ships: this.shipStamp(own, serverNow, contacts),
      wake: this.wakeStamp(own, serverNow),
      cellU: cfg.cellU,
      model: cfg.model,
    });
    for (let k = 0; k < plan.owed; k++) {
      const from = this.sliceFrom ?? rot;
      const to = from + cfg.march.sliceRad;
      const slice = marchSlice(own, from, to, field, this.radarRange, serverNow, cfg);
      if (slice !== null) this.enrollSlice(slice);
      this.sliceFrom = wrapPositive(to);
    }
  }

  /**
   * Place the near-range dim mask on own hull, or take it off entirely.
   *
   * DISPLAY-TIME ONLY (amendment 181). It reads the live own pose and writes a
   * sprite position — it never touches `paints`, the grid, or one byte of a
   * frozen record, which is the line amendment 83 actually draws. A paint's
   * displayed opacity therefore RISES as own ship pulls away from it while its
   * stored intensity and paint time stay byte-identical.
   *
   * WITH NO OWN POSE THE MASK COMES OFF, rather than being left centred on the
   * origin: a sprite mask CLIPS to its own frame, so a stale mask would hide
   * every spectate-mode contact outside a square around (0, 0).
   *
   * A NON-FINITE POSE IS THE SAME CASE, AND IT HAS TO BE HANDLED HERE (review
   * gate). This is a mask, so it does not DEGRADE under a NaN: a sprite whose
   * position is NaN has no frame, and Pixi clips the whole layer away — the heat
   * buffer and the `silhouette` grammar's Graphics alike. So one non-finite own
   * coordinate would blank the entire radar layer rather than mis-dim it. The
   * rest of this file already treats a non-finite observer as reachable rather
   * than impossible (`marchSlice`'s `marchable` guard checks `obs.x + obs.y` for
   * exactly this reason), and the degradation is chosen deliberately: an UNDIMMED
   * scope is strictly better than a HIDDEN one, since the dim is a legibility
   * ruling (amendment 181) while the returns are the instrument.
   */
  private updateDimMask(own: OwnPoint | null): void {
    this.syncDimMask();
    if (own === null || !Number.isFinite(own.x + own.y)) {
      this.blipLayer.mask = null;
      return;
    }
    this.dim.position.set(own.x, own.y);
    if (this.blipLayer.mask !== this.dim) this.blipLayer.mask = this.dim;
  }

  /**
   * Re-bake the ramp if the observer's bubble has moved (this cycle).
   *
   * THE RAMP IS ANCHORED TO TRUESIGHT, AND TRUESIGHT IS NOT A CONSTANT: a dazzle
   * burst cuts it by the ratified factor and an `intelRange` boon widens it,
   * so a mask baked once at the base radius would quiet the wrong water for the
   * rest of the match. It reads `sightHoleU` — `fogHoleRadiusU`, i.e. the exact
   * number the fog hole is baked at and the server's `sightOf` gates contacts
   * with — so the quiet region, the visible bubble and the server's idea of
   * truesight are one radius by construction.
   *
   * THE COMPARE LIVES ON THE PER-FRAME PATH, NOT ON THE SETTERS, deliberately.
   * Two independent inputs move this number (`setRanges` for a boon, `setDazzled`
   * for a flare) and a third could be added; hanging the rebake off the value
   * itself means no caller can forget. A no-change frame costs one float compare,
   * and a real change costs the same 1024² canvas draw the fog already pays on
   * exactly the same events.
   *
   * THE OLD TEXTURE IS NEVER DESTROYED, AND THAT IS LOAD-BEARING — it is the whole
   * of the frozen-client bug this cycle fixes. `this.dim` is a SPRITE and it is
   * `blipLayer`'s mask, so Pixi binds its `TextureSource` straight into the
   * `MaskFilter` of the `AlphaMaskEffect` it holds in `BigPool`; destroying a bound
   * source makes that filter's `BindGroup` destroy itself and null its resources
   * permanently, and the next alpha-mask push ANYWHERE in the app throws inside
   * `renderer.render()` and kills the ticker. THE RULE IS ABOUT THE TEXTURE'S JOB,
   * NOT THE LAYER'S: never destroy a `TextureSource` hanging on a Sprite that is
   * currently serving as someone's mask. (`Fog.rebake` keeps its destroy for that
   * reason and not the one it is easy to assume — the texture it destroys is the
   * fog overlay's own CONTENT, on the sprite being masked, so it would never be
   * bound as `uMaskTexture` even if its mask were a Sprite rather than a Graphics.)
   *
   * Handing the live texture back to the bake redraws that one canvas in place and
   * re-uploads it, so the binding is never invalidated. Steady-state memory is
   * UNCHANGED — the old code destroyed as it minted, so it also held one surface at
   * a time; what goes away is the per-dazzle allocation churn. The old
   * `Texture.EMPTY` guard went with the destroy: a headless caller holding EMPTY
   * simply gets a fresh mint from the bake.
   */
  private syncDimMask(): void {
    const want = this.sightHoleU;
    // NON-FINITE IS A LATCH FAILURE, NOT A DRAW FAILURE, and it only became one when
    // the destroy left: `NaN === this.dimBakedAtU` is false forever, so a NaN bubble
    // would redraw and re-upload the whole 1024² surface EVERY FRAME, silently and
    // for the rest of the match. (The old code crashed on the first such frame
    // instead.) `radarDim` already treats a non-finite bubble as reachable — both
    // `dimRadii` and `dimScaleAt` guard it — and holding the last good radius is
    // that module's own "fails toward a fully visible scope" rule.
    if (!Number.isFinite(want) || want === this.dimBakedAtU) return;
    // COMMIT THE RADIUS BEFORE THE BAKE, DELIBERATELY — the review gate tried the
    // other order and it was wrong. The bake can throw (the mint fallback needs a 2d
    // context), and app/loop.ts's contract is that a frame-path throw costs ONE
    // FRAME. Committing first spends exactly that one frame and then early-returns
    // forever after, leaving a stale-but-drawn ramp; committing afterwards would
    // retry every frame, abort `render` every frame, and freeze the picture — the
    // very failure class this cycle exists to remove. A stale radius is the same
    // graceful degradation `radarDim` already chooses ("fails toward a fully
    // visible scope").
    this.dimBakedAtU = want;
    this.dim.texture = bakeDimMaskTexture(want, this.dim.texture);
  }

  /** The dim mask sprite — the observation seam for amendment 181's placement,
   *  which is invisible to every grid-level assertion (`bandAt`, `intensityAt`)
   *  because it is a DISPLAY transform and touches no cell. */
  get dimMask(): Sprite {
    return this.dim;
  }

  /** Is the observer standing on land? Read from the SAME height raster the
   *  march itself reads (`height > 0 ⟺ LAND`), so there is no second answer to
   *  the question. With no raster the client knows of no land, and nothing is
   *  aground. */
  private aground(own: OwnPoint): boolean {
    const r = this.heightRaster;
    return r !== null && sampleHeight(r, own.x, own.y) > 0;
  }

  /**
   * THE PER-FRAME SHIP LAYER — the inside-truesight hulls, stamped into the field
   * so the beam paints them exactly as it paints terrain (amendment 141).
   *
   * The range term is the EXACT COMPLEMENT of the server's: `dist <= sightU` here,
   * `dist > sightU` in `blipGate`, off one dazzle-scaled radius both sides already
   * agree on (`fogHoleRadiusU` ≡ the server's `sightOf`). That one line is what
   * keeps the two sources from double-stamping a hull or dropping one between
   * them; nothing here SUPPRESSES anything, since the scope paints everything in
   * radar range (amendment 88).
   *
   * Poses are sampled at the SAME interp-delayed time the hull renderer draws
   * them, so an echo lands on the hull the player can see rather than ~100ms ahead
   * of it. (The observer is the live predicted own pose — the identical pairing
   * every other world-space overlay already draws with.)
   *
   * NO LOS TEST LIVES HERE, AND THAT IS STILL TRUE UNDER STORY 4.11. A hull is
   * stamped into the field wherever it is; whether the BEAM reaches it is the
   * ray's business, decided by the shadow accumulator in `marchRay` against the
   * same raster. Putting a second, per-hull occlusion test here would be the
   * per-object occluder shortlist amendment 140 deleted, arriving again.
   */
  /**
   * Hand the scope the client's wake ribbons (main.ts owns the emitter, which
   * owns them — one tracker, two renderings). Null takes the layer off.
   *
   * `islands` is the binary-LOS geometry the synthesis owes (P5); omitted, the
   * stamp blocks on nothing, which is the correct degradation for a caller that
   * genuinely has no map (headless tests) and never a silent loosening in play,
   * because main.ts always passes the set.
   */
  setWakeSources(sources: WakeSources | null, islands: readonly Island[] = []): void {
    this.wakeSources = sources;
    this.wakeIslands = islands;
  }

  /**
   * THE PER-FRAME IN-TRUESIGHT WAKE LAYER — `shipStamp`'s sibling, and it takes
   * that function's whole argument.
   *
   * The range term is the EXACT COMPLEMENT of the server's, per SEGMENT and PER
   * SOURCE: a segment whose midpoint is at or inside its source's inner bound
   * (`sightHoleU` for a hull, the 3/8 detect rung of it for a fish) is stamped
   * here, one beyond it is the wire's (`wakeInnerBound`), off radii both sides
   * already agree on. A 540u track therefore hands its near end to this stamp
   * and its far end to `marchWake`, with no cell claimed twice and none dropped
   * between them.
   *
   * A BINARY LOS TEST *DOES* LIVE HERE, unlike `shipStamp`, and the asymmetry is
   * the point (cycle-69 review gate, P5). A hull inside truesight is a `Contact`
   * the server already decided you may see, so its echo owes only the ray's
   * shadow accumulator. A wake segment was decided by NOBODY — this stamp stands
   * in for a disclosure the server withheld precisely because the height-aware
   * march must never reveal water that binary LOS hides — so the synthesis owes
   * the binary test itself, alongside the requirement that its source be
   * observed right now. The accumulator still runs on top, in `marchRay`.
   *
   * The stamp is CACHED (`WakeStampCache`) on the segment set, the observer's
   * position, the sight radius, the glint seed and the age-bucket clock, because
   * rebuilding a roomful of ribbons on all sixty frames of a second would spend
   * the radar layer's whole remaining headroom on an answer that changes a few
   * times a second.
   *
   * THE GLINT SEED IS THE SWEEP REVOLUTION INDEX — `shipStamp`'s idiom exactly,
   * and for its reason: a stationary source keeps one mask for the whole beam
   * crossing and re-glints on the next revolution, matching the wire source's
   * one-paint-per-revolution scintillation instead of tearing per frame.
   */
  private wakeStamp(own: OwnPoint, serverNow: number): CellStamp | undefined {
    const sources = this.wakeSources;
    if (sources === null || sources.size === 0) return undefined;
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const at = serverNow - CLIENT_CONFIG.net.interpDelayMs;
    return this.wakeCache.stampFor(
      sources,
      own,
      this.sightHoleU,
      serverNow,
      cfg.cellU,
      cfg.model,
      this.wakeIslands,
      Math.floor(at / this.sweepPeriodMs),
    );
  }

  private shipStamp(own: OwnPoint, serverNow: number, contacts: ContactStore | null): ShipStamp {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    if (contacts === null) return new Map();
    const sight = this.sightHoleU;
    const at = serverNow - CLIENT_CONFIG.net.interpDelayMs;
    const hulls: EchoHull[] = [];
    for (const id of contacts.ids()) {
      const s = contacts.get(id)?.sampleAt(at);
      const cls = contacts.classOf(id);
      if (s === null || s === undefined || cls === undefined) continue;
      if (Math.hypot(s.x - own.x, s.y - own.y) > sight) continue;
      hulls.push({ id, x: s.x, y: s.y, heading: s.heading, cls });
    }
    // The glint seed's time term is the REVOLUTION INDEX, not the frame time:
    // a stationary sighted hull keeps one mask for the whole beam crossing and
    // re-glints on the next revolution — sweep-to-sweep scintillation, the
    // same cadence the wire source gets from its per-tick paint (amendment
    // 157; a per-frame seed would tear the footprint mid-crossing).
    return buildShipStamp(hulls, cfg.model, cfg.cellU, Math.floor(at / this.sweepPeriodMs));
  }

  /** Position/rotate the sweep + rings; returns the beam angle this frame, or
   *  null when the sweep is hidden (which also breaks the march's arc, so
   *  resuming can never replay a whole revolution of crossings at once). */
  private updateSweep(own: OwnPoint | null, serverNow: number): number | null {
    const visible = own !== null && this.lastSweep !== null;
    this.sweep.visible = visible;
    this.rings.visible = visible;
    if (!visible || own === null || this.lastSweep === null) {
      this.sliceFrom = null;
      return null;
    }
    this.sweep.position.set(own.x, own.y);
    this.rings.position.set(own.x, own.y);
    const rot = sweepRotation(
      this.lastSweep.angle,
      this.lastSweep.t,
      serverNow,
      this.sweepPeriodMs,
    );
    this.sweep.rotation = rot;
    return rot;
  }

  /** Drop slices that have aged out of the phosphor window. TIME IS THE ONLY
   *  THING THAT RETIRES A PAINT (amendment 97) — never visibility, never range,
   *  never how many of them there are on one bearing. */
  private pruneSlices(serverNow: number): void {
    const life = blipLifeMs(this.sweepPeriodMs);
    for (let i = this.paints.length - 1; i >= 0; i--) {
      if (blipAlpha(serverNow - this.paints[i].t, life) > 0) continue;
      this.paints.splice(i, 1);
    }
  }

  /**
   * THE WINDOW ONTO THE WORLD, this frame (amendment 96): the camera's rect when
   * the caller supplied one, else a radar-ring-sized square on the own ship (the
   * pre-cycle-58 fallback, for callers with no camera). Null when there is no own
   * pose at all, which is the one case where nothing is drawn.
   *
   * THIS IS THE ONLY PLACE THE VIEWPORT ENTERS THE GRAMMAR. It decides which
   * rectangle of world is drawn — never which paints exist, never how long they
   * live, never what they look like.
   */
  /** No own pose: hide the surface and blank it, so a stale cell can neither
   *  answer `bandAt` nor flash back when the sprite is shown again. */
  private hideHeat(): void {
    // The mask comes off with the surface: there is no own hull to anchor it to
    // on the frames this runs (amendment 181's teardown half).
    this.blipLayer.mask = null;
    if (this.heat === null) return;
    this.heat.sprite.visible = false;
    clearGrid(this.heat.grid);
  }

  private windowFor(own: OwnPoint | null): ViewRect | null {
    if (own === null) return null;
    if (this.view !== null) return this.view;
    return { x: own.x, y: own.y, halfW: this.radarRange, halfH: this.radarRange };
  }

  /**
   * Re-rasterize the heatmap from the paint list and upload it (ruling R1).
   *
   * Size to the window → anchor (which clears) → stamp every live paint →
   * quantize → upload. Nothing decays in place: the buffer is a pure function of
   * (paint list, window, serverNow), which is what stops old paints smearing or
   * dragging along with the camera as the observer moves.
   *
   * PLACEMENT, IN FULL, BECAUSE THIS IS THE SEAM CYCLE 57 BROKE. `anchorGrid`
   * floors the window's top-left corner to a whole world cell and reports it as
   * `originX`/`originY`; the sprite is positioned at exactly that world point and
   * scaled so one texel is one world cell. Cell (gx, gy) therefore covers world
   * square [gx·cellU, (gx+1)·cellU) forever, whatever the camera is doing —
   * which is the whole reason the snap exists and the property to assert at the
   * ADAPTER, not in the rasterizer (amendment 98).
   */
  private paintHeat(own: OwnPoint | null, serverNow: number): void {
    const win = this.windowFor(own);
    if (win === null) return this.hideHeat();
    this.fitHeat(win.halfW, win.halfH);
    const heat = this.heat;
    if (heat === null) return;
    // Anchor (which CLEARS) before the visibility early-out: hiding the sprite
    // must not leave the last frame's cells in the buffer, or a paint that aged
    // out would still answer `bandAt` — and would flash back the instant the
    // next paint made the sprite visible again.
    // Anchoring decides ONLY which cells are in bounds this frame. It arms
    // nothing and judges nothing: every judgement about a paint was made at its
    // own creation (amendment 83), so this call is handed no observer state and
    // the rasterizer has none to consult.
    anchorGrid(heat.grid, win.x, win.y);
    heat.sprite.visible = this.paints.length > 0;
    if (!heat.sprite.visible) return;
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const ctx: RasterCtx = {
      now: serverNow,
      lifeMs: blipLifeMs(this.sweepPeriodMs),
      alphaFloor: this.assist ? CLIENT_CONFIG.blip.assistMinAlpha : CLIENT_CONFIG.blip.minAlpha,
    };
    // ONE pass over ONE list. The paint KINDS the retired grammar carried
    // (ship, island, surf, clutter — and the storm wall, deleted by cycle 72)
    // are MATERIALS in the field now, so there is one record type left and one
    // stamp for it.
    rasterize(heat.grid, this.paints, ctx);
    quantizeInto(heat.grid, cfg.bands, cfg.bandAlpha, heat.rgba);
    heat.sprite.position.set(heat.grid.originX, heat.grid.originY);
    heat.source.update();
  }

  private updateBlips(serverNow: number): void {
    // A paint lives persistSweeps periods now, not one (amendment 9).
    const life = blipLifeMs(this.sweepPeriodMs);
    // Colorblind assist raises the minimum decayed-blip opacity (amendment 18):
    // a cooling contact stays readable instead of dimming into the fog. This
    // half of the assist survives into `return` mode (it feeds the heatmap's
    // alpha floor); the outline-boost half is inert there (amendment 71 — a
    // quantized bitmap has no outline).
    const assist = this.assist;
    this.decay(this.blips, serverNow, {
      life,
      floor: assist ? CLIENT_CONFIG.blip.assistMinAlpha : CLIENT_CONFIG.blip.minAlpha,
      // The assist cools on a shallower ramp so the luminance floor baked into
      // the stroke color survives the paint's whole life (see config comment).
      cool: assist ? CLIENT_CONFIG.blip.assistCoolFloor : CLIENT_CONFIG.blip.coolFloor,
    });
  }

  /** Age one list of live marks: alpha, tint, and release at end of life.
   *
   *  COOLING RUNS THROUGH THE HUE-PRESERVING GREY MULTIPLIER. A blip's color is
   *  an information channel (the owner's personal hue), so its cooling has to
   *  preserve hue: greyscale multiplies every channel equally and leaves the hue
   *  exact. The color-SETTING `blipTint` would overwrite it with phosphor green
   *  inside the first ~30% of every paint — the Story 4.2 trap. */
  private decay(list: LiveBlip[], serverNow: number, d: DecayFrame): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      const age = serverNow - b.t;
      const alpha = blipAlpha(age, d.life, d.floor);
      if (alpha <= 0) {
        this.retire([b]);
        list.splice(i, 1);
        continue;
      }
      b.gfx.alpha = alpha;
      b.gfx.tint = blipCool(age, d.life, d.cool);
      retryHue(b.pose.hue, this.hueFor, (color) => this.drawBlip(b, b.pose, color));
    }
  }
}

/** Track key for the per-track caps (contact id). */
function keyOf(b: LiveBlip): string {
  return b.id;
}

/**
 * The widest coverage rect a legitimate footprint can need, in cells — DERIVED
 * from the longest hull and the shared lattice, never a literal (cycle-63
 * review gate: the old literal 64 silently broke the moment `radarCellU` was
 * retuned small — the validator would have dropped every long-hull mask and
 * hulls would simply have vanished beyond truesight). The derivation: the
 * worst-heading span of the biggest silhouette (its bounding-circle diameter),
 * in cells, plus one cell of lattice phase, plus two cells per side of fuzz
 * growth (one of dilation + one of stretch, `fuzzCoverage`), doubled as
 * structural slack. NOT a tuning knob — a bound on wire input that sizes an
 * array and bounds two loops.
 */
const MAX_COVERAGE_SPAN = ((): number => {
  let diameter = 0;
  for (const id of HULL_IDS) diameter = Math.max(diameter, 2 * polygonMaxRadius(hullSilhouette(id)));
  return 2 * (Math.ceil(diameter / CONFIG.vision.radarCellU) + 1 + 4);
})();

/**
 * The largest absolute cell index a legitimate footprint can carry — DERIVED
 * from the biggest map the game can build (the roster-scaled radius at the
 * player cap) and the shared lattice, doubled as slack. Huge indices would
 * break `cellKey`'s `KEY_ROW = 1e6` injectivity premise (radarField.ts) and
 * the heatmap's integer cell math, producing phantom on-scope paints — so the
 * validator makes them unrepresentable rather than trusting every consumer to
 * re-check (cycle-63 review gate).
 */
const MAX_CELL_INDEX = Math.ceil((2 * mapRadius(CONFIG.map.playerCap)) / CONFIG.vision.radarCellU);

/** How far in the future (ms) a paint's `t` may sit past the latest
 *  authoritative sweep sample before it is dropped as malformed. A conforming
 *  server stamps `t = now`, so anything past clock-estimate jitter is garbage
 *  — and an unbounded future `t` makes `blipAlpha`'s age negative, a
 *  full-brightness paint that never decays or prunes (cycle-63 review gate). */
const MAX_FUTURE_T_MS = 10_000;

/** Structural gate on a wire coverage footprint (cycle 63): a finite,
 *  non-far-future paint time, integer cell indices INSIDE the map's possible
 *  lattice, a sane rect, and a bits array sized exactly to it. Anything else
 *  is dropped whole — never clamped into something half-drawable. `tMax` is
 *  the caller's latest authoritative server-time reference (Infinity before
 *  the first sweep sample, when the client has no clock to judge by). */
function validCoverage(e: ReturnBlipEvent, tMax: number): boolean {
  if (!Number.isFinite(e.t) || e.t > tMax) return false;
  if (![e.gx, e.gy, e.w, e.h].every(Number.isInteger)) return false;
  if (Math.abs(e.gx) > MAX_CELL_INDEX || Math.abs(e.gy) > MAX_CELL_INDEX) return false;
  return validRect(e);
}

/** The rect half of `validCoverage`: sane spans, bits sized exactly to them. */
function validRect(e: ReturnBlipEvent): boolean {
  if (e.w < 1 || e.h < 1 || e.w > MAX_COVERAGE_SPAN || e.h > MAX_COVERAGE_SPAN) return false;
  return Array.isArray(e.bits) && e.bits.length === Math.ceil((e.w * e.h) / 32);
}

/**
 * Structural gate on a `wk` WAKE SEGMENT (Story 4.12) — the same posture as
 * `validCoverage`, which is the point: a wake row is the same world-anchored
 * cell-rect + packed-mask shape, arriving through the same door, and a scalar
 * off the network that bounds a loop is finiteness-checked here exactly as it is
 * there (the cycle-62 `radarRange = Infinity` lesson, and the cycle-63 gate's
 * hardening of the echo path).
 *
 * TWO THINGS DIFFER FROM A HULL MASK, both because a ribbon is not a hull:
 *
 *   • THE SPAN BOUND IS DERIVED FROM THE RIBBON, NOT FROM THE LONGEST HULL. A
 *     segment is one sample cadence long and at most a hull's beam wide, plus
 *     the chop halo the client itself will lay around it — so the bound is
 *     computed from `CONFIG.vision.wakeSampleU` and the widest beam in the
 *     registry rather than reusing `MAX_COVERAGE_SPAN` (which is sized for a
 *     124u hull plus fuzz and would wave through a mask an order of magnitude
 *     too big). Never a literal: retune the cadence or the lattice and it moves.
 *   • THE AGE BUCKET IS AN INDEX AND IS BOUNDED AS ONE. `a` selects an intensity
 *     scale; out of range it would either read past the ladder or, non-finite,
 *     put a NaN into `writeCell` — which under max-wins compares false against
 *     every later paint and silently wins nothing.
 */
function validWake(e: WakeBlipEvent, tMax: number): boolean {
  if (!Number.isFinite(e.t) || e.t > tMax) return false;
  if (![e.gx, e.gy, e.w, e.h, e.a].every(Number.isInteger)) return false;
  if (e.a < 0 || e.a >= WAKE_AGE_BUCKETS) return false;
  if (Math.abs(e.gx) > MAX_CELL_INDEX || Math.abs(e.gy) > MAX_CELL_INDEX) return false;
  return validWakeRect(e);
}

/** The rect half of `validWake`: a ribbon-sized span, bits sized exactly to it. */
function validWakeRect(e: WakeBlipEvent): boolean {
  if (e.w < 1 || e.h < 1 || e.w > MAX_WAKE_SPAN || e.h > MAX_WAKE_SPAN) return false;
  return Array.isArray(e.bits) && e.bits.length === Math.ceil((e.w * e.h) / 32);
}

/**
 * The widest coverage rect a legitimate WAKE SEGMENT can need, in cells —
 * DERIVED, for the same reason `MAX_COVERAGE_SPAN` is (a literal silently breaks
 * the moment the lattice or the cadence is retuned, and the validator would then
 * drop every real ribbon and wakes would simply vanish). The derivation: one
 * sample cadence of track, plus the widest turbulent core in the registry (a
 * hull's beam), plus a cell of lattice phase, doubled as structural slack.
 */
const MAX_WAKE_SPAN = ((): number => {
  let beam: number = CONFIG.vision.radarCellU; // a torpedo's core is exactly one cell
  for (const id of HULL_IDS) beam = Math.max(beam, hullEnvelope(id).hull.beam);
  return 2 * (Math.ceil((CONFIG.vision.wakeSampleU + beam) / CONFIG.vision.radarCellU) + 1);
})();

/** Structural gate on a `silhouette` wire blip (cycle-63 review gate: the
 *  return branch was hardened and this one was left raw, so a malformed
 *  payload put `undefined`/NaN into `acquireBlip`/`resolveHue`). Same
 *  posture: every numeric field finite, the paint time not far-future, the id
 *  a string, the class one the silhouette registry can actually draw. */
function validSilhouette(e: SilhouetteBlipEvent, tMax: number): boolean {
  if (typeof e.id !== 'string') return false;
  if (![e.x, e.y, e.t, e.heading, e.speed].every(Number.isFinite)) return false;
  if (e.t > tMax) return false;
  return hullSilhouette(e.cls) !== undefined;
}

/** Trace a closed world-frame polygon (offsets from the blip position). */
function tracePolygon(g: Graphics, poly: readonly Vec2[]): void {
  g.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
  g.closePath();
}

/** Trace the speed vector as two open subpaths: the shaft, then the arrowhead
 *  (barb → tip → barb). Open subpaths and a closed hull outline are different
 *  line grammars, which is what stops the vector reading as another hull edge. */
function traceVector(g: Graphics, v: SpeedVector): void {
  g.moveTo(v.from.x, v.from.y).lineTo(v.to.x, v.to.y);
  g.moveTo(v.barbs[0].x, v.barbs[0].y).lineTo(v.to.x, v.to.y).lineTo(v.barbs[1].x, v.barbs[1].y);
}
