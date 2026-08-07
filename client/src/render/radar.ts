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
// `return` — THE REALISM GRAMMAR, now a QUANTIZED INTENSITY BITMAP (cycle 52,
// amendments 76-79, superseding cycle 51's per-blip polygon blobs). There are no
// per-paint Graphics in this mode at all: contacts and islands go into a PAINT
// LIST of world geometry + server timestamps, and every frame the whole list is
// re-rasterized into one world-anchored buffer (render/radarHeatmap.ts),
// quantized to EXACTLY THREE colors with no blend anywhere, and uploaded as a
// single texture.
//
// WHY THE POLYGONS DIED, in one line each (both are amendment 76's diagnosis,
// and neither was a bug): a polygon carries ONE fill, so color could only be a
// per-OBJECT label — and `ext` legitimately swings with aspect, so the same hull
// really did change color as it turned. And an island could only ever be
// approximated by scattering small polygons along its arc, which is exactly the
// "little circles around the edge of the island" Eric saw instead of the massive
// object he asked for.
//
// COLOR IS NOW INTERNAL TEXTURE (amendment 77). Intensity is per-PIXEL, so one
// object shows all three bands at once: a red core, a blue surround, a green
// fringe. Strength still reads — a big broadside contact earns a real red core,
// a distant needle never leaves green — it just reads as texture rather than as
// a label. The three colors and their thresholds are an ordered CLIENT_CONFIG
// array (`blip.heatmap.bands`) because Eric hedged the ordering himself and will
// retune it first.
//
// ISLANDS FILL, FROM THE REAL POLYGON (amendment 78 + the fractal-island
// landing). The observer-facing landmass rasterizes SOLID via the shared
// `pointInIsland` / `islandBlocksSegment` primitives. The near-face-only physics
// and the cross-island occlusion from cycle 51's review gate are unchanged; what
// changed is that the near face is FILLED rather than sampled, and that the
// geometry is exact instead of a bounding circle that can sit hundreds of units
// offshore.
//
// THE SCOPE PAINTS EVERYTHING IN RADAR RANGE (cycle 56, amendments 88-90,
// superseding cycle 54's sight-bubble gate). Eric: *"maybe we should paint
// everything in radar range, even if its in LOS. Just that if its in LOS
// (truesight) range, then you also see the actual ship in realtime."* Inside
// truesight you now get both channels at once — the live hull AND its echo — so
// the sight verdict is gone from the paint model entirely. What is NOT gone is
// the freezing discipline it briefly rode on: amendment 83 still governs, a
// paint's geometry is still decided once at creation, and the accepted
// consequence that a ghost may decay inside the bubble (amendment 86) is now
// simply the ordinary case.
//
// TWO SOURCES OF SHIP PAINTS, COMPLEMENTARY BY RANGE (amendment 89). The server
// has never sent a blip for a sighted hull — `blipGate` excludes
// `dist <= sightRange`, because such a hull is delivered as a full `Contact`
// instead — and that rule is a perception-invariant surface this cycle does not
// touch. So beyond truesight an echo comes off the WIRE (`resolvePending`), and
// inside it the client SYNTHESIZES one from the `Contact` it already holds
// (`sweepContacts` → `contactEcho`), gated by the same beam crossing, carrying
// the same contact id, and feeding the same paint list under the same per-track
// cap. Nothing new is disclosed: a sighted hull is already fully visible.
//
// WHICH IS WHY `sightHoleU` AND `setDazzled` SURVIVE, WITH A NEW JOB. The radius
// is no longer a suppression boundary; it is the SOURCE SELECTOR that keeps the
// two sources from overlapping. It stays `fogHoleRadiusU()` — the very function
// that bakes the visible fog hole, and by construction the same dazzle-scaled
// number the server's own `sightOf` uses — because if the client's idea of
// truesight ever drifted from the server's, a hull at the seam would be painted
// twice or not at all. A dazzle shrinks BOTH sides together: the server starts
// blipping the annulus it just opened, and the client stops synthesizing there.
// `silhouette` mode has no buffer and no synthesis, so none of this reaches it.
//
// THE BUFFER FOLLOWS THE VIEWPORT, NOT THE RADAR RING (cycle 58, amendments
// 95-99). It used to be a square of half-extent exactly `radarRange`, re-centred
// on the observer every frame — which CLIPPED any paint the ship had sailed away
// from, so a mark near the rim vanished and came back as you manoeuvred and the
// scope wore a visible "box" when zoomed out. Amendment 83 forbids that outright:
// if it gets painted it stays painted until it decays.
//
// The fix is to stop treating the buffer as storage. History lives in the PAINT
// LIST, which is re-rasterized in full every frame, so the buffer only has to
// cover WHAT IS ON SCREEN: `render` takes the camera's world rect, `fitHeat`
// sizes the surface to it (quantized, so a wheel zoom does not churn textures),
// and `anchorGrid` centres it there — snapped to a whole world cell, which is
// what keeps a paint's cells still while the camera slides over them.
//
// NOTHING VIEWPORT-DERIVED TOUCHES PAINT CREATION OR RETIREMENT (amendment 97).
// `view` is read in `paintHeat` and nowhere else: `sweepIslands`, `sweepContacts`,
// `resolvePending`, `enrollPaint` and `prunePaints` cannot see it. That is what
// makes Eric's requirement hold for free — *"if I am zoomed in when it paints and
// then I zoom out, it still shows me everything that would have been there"* —
// and it is the line to hold if this file ever grows a culling optimization.
//
// CYCLE 57 (REVERTED, PR 108) IS THE CAUTIONARY TALE. It sized the buffer for a
// worst-case ship-speed excursion and confined work to a paint-driven sub-rect
// that was re-centred every frame, placing the sprite at that MOVING origin —
// so the cell↔world mapping stopped being world-locked, islands drifted with the
// boat and a resized `subarray` smeared rows. Its pure-rasterizer tests all
// passed, because the break was in this adapter's PLACEMENT. Hence amendment 98:
// placement is pinned here, at both zoom extremes and with the camera moving.
//
// Persistence is unchanged in both grammars: alpha/tint are pure functions of
// serverNow − paint time (phosphor.ts), three sweeps of paints per track
// (amendment 9), so a contact leaves a plottable track whose ghost SPACING
// encodes its speed.
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
  hullSilhouette,
  transformPolygon,
  type BlipEvent,
  type HeightRaster,
  type HullId,
  type Island,
  type RadarGrammar,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
  type Vec2,
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
  anchorGrid,
  arcOverlaps,
  bandIndex,
  buildIslandCoverage,
  clearGrid,
  contactEcho,
  gridSpan,
  islandBearingSpan,
  makeGrid,
  paintSeed,
  quantizeInto,
  rasterize,
  sampleGrid,
  type HeatGrid,
  type IslandPaint,
  type RadarPaint,
  type RasterCtx,
} from './radarHeatmap.js';
import {
  openClutter,
  openStorm,
  rasterizeWeather,
  weatherCycled,
  type ClutterPaint,
  type StormPaint,
  type StormRing,
} from './radarSources.js';
import { SWEEP_TEXTURE_RADIUS, bakeSweepTexture } from './textures.js';

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
 *
 * The `return` paint list runs the same backstop for the same reason.
 */
const MAX_LIVE_BLIPS = 128;
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

/** A `return` echo whose OBSERVER-RELATIVE geometry (bearing, range) is not
 *  resolved yet: the wire payload alone, held until a frame with a real own
 *  pose can turn it into a `ShipPaint`. A paint arrives on network cadence, so
 *  it can land before the first render (join) or in any later gap where the own
 *  pose is unknown — and geometry is frozen at resolve, so a guessed observer
 *  would be wrong for the paint's whole ~12s life, not for a frame. */
interface PendingEcho {
  id: string;
  x: number;
  y: number;
  ext: number;
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

/**
 * THE ZONE FIELDS THE STORM WALL READS (Story 4.10, amendment 128) — a
 * structural subset of `ZoneView` (client/src/sim/zoneView.ts), so this module
 * never imports the zone layer and main.ts can hand it the already-computed view
 * verbatim.
 *
 * NOTE WHAT IS ABSENT: `next`. Only the LIVE ring is a physical object with
 * water and wind in it; the dashed next-ring telegraph is a chart annotation and
 * must never return an echo. Leaving the field off the type is the cheapest
 * possible enforcement of that.
 */
export interface ZoneLike {
  /** `'idle'` means the timeline is not anchored yet — nothing paints. */
  state: string;
  /** The LIVE ring (offset centre, interpolated while closing). */
  cur: StormRing;
}

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
  /** Client-known island field (map seed), for landmass returns. `setIslands`
   *  supplies it; it is never on the wire and no server ever sees it. */
  private islands: readonly Island[] = [];
  /** The cycle-59 height raster (Story 4.10, amendment 129) — the ratified
   *  elevation authority behind coast reflectivity, so a steep headland reads
   *  red where a low sandy island of the same size reads blue. Rebuilt locally
   *  from the map seed exactly as the island field is, so it carries the same
   *  ZERO disclosure. Null until `setHeightRaster` runs, in which case land
   *  reflectivity falls back to `landSteep` — the pre-4.10 fill. */
  private heightRaster: HeightRaster | null = null;
  /** THE `return` PAINT LIST (ruling R1) — world geometry + server timestamps,
   *  re-rasterized in full every frame. Empty in `silhouette` mode. */
  private readonly paints: RadarPaint[] = [];
  /** Echoes waiting for a real own pose before their geometry can be resolved. */
  private readonly pending: PendingEcho[] = [];
  /** The island paint the beam is CURRENTLY sweeping across, per island. Its
   *  arc grows each frame until the beam leaves the island's bearing span,
   *  which is what makes a coastline fill in behind the beam instead of
   *  appearing whole the instant the beam clips its edge. */
  private readonly opening = new Map<Island, IslandPaint>();
  /** The weather paints the beam is CURRENTLY sweeping across (Story 4.10). One
   *  of each per revolution, opened when the beam crosses the weather anchor
   *  bearing; their arcs grow behind the beam exactly as an island's does, and
   *  the previous revolution's paint decays underneath. */
  private openClutterPaint: ClutterPaint | null = null;
  private openStormPaint: StormPaint | null = null;
  /** Rotating start index for the island sweep, so the one-bake-per-frame cap
   *  cannot starve an island that sits behind a big one in the array. */
  private bakeCursor = 0;
  /** The heatmap surface — created ONLY in `return` mode, so `silhouette` mode
   *  allocates no buffer, uploads no texture and adds no child. */
  private heat: { grid: HeatGrid; rgba: Uint8Array; source: BufferImageSource; sprite: Sprite } | null =
    null;
  private readonly blipLayer: Container;
  /** Scratch for the pose transform — consumed synchronously by the trace, so
   *  one array serves every blip (the 20Hz loop stays allocation-light). */
  private readonly scratch: Vec2[] = [];
  /** Latest authoritative sweep sample (angle at server time t). */
  private lastSweep: { angle: number; t: number } | null = null;
  /** Beam angle at the PREVIOUS frame — island paints are born on the arc the
   *  beam swept between frames. Null whenever the sweep is hidden, so resuming
   *  never replays a whole revolution's worth of crossings at once. */
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

  constructor(
    blipLayer: Container,
    sweepLayer: Container,
    hueFor: HueFor,
    grammar: RadarGrammar = 'silhouette',
  ) {
    this.hueFor = hueFor;
    this.grammar = grammar;
    this.blipLayer = blipLayer;
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
   * Adopt the client-known island field for landmass returns (amendment 69).
   * Islands are rebuilt locally from `welcome.mapSeed`, so this carries ZERO
   * disclosure: no wire field, no server work, no perception-invariant surface.
   * A no-op in `silhouette` mode, where nothing reads it.
   */
  setIslands(islands: readonly Island[]): void {
    this.islands = islands;
    this.opening.clear();
  }

  /**
   * Adopt the client-known HEIGHT RASTER (amendment 129) — the elevation
   * authority behind coast reflectivity, plumbed from the same place and at the
   * same moment as the island field it belongs to.
   *
   * Zero disclosure for the same reason: both sides rebuild it from
   * `welcome.mapSeed` and it never travels on the wire. It is read ONLY inside
   * a coverage bake (i.e. at paint creation), never per frame — so a raster
   * arriving late can change what the NEXT sweep records and can never edit a
   * paint already on the scope (amendment 83).
   */
  setHeightRaster(raster: HeightRaster | null): void {
    this.heightRaster = raster;
  }

  /** How many blips are currently decaying (debug/tests). `silhouette` only. */
  get liveBlips(): number {
    return this.blips.length;
  }

  /** How many `return` paints are live in the list (debug/tests). */
  get livePaints(): number {
    return this.paints.length;
  }

  /** How many of those are island landmasses (debug/tests). */
  get liveIslandPaints(): number {
    return this.paints.filter((p) => p.kind === 'island').length;
  }

  /** How many of those are SHIP echoes (debug/tests) — the count most assertions
   *  about the two contact sources actually mean, now that the list also carries
   *  landmasses and the two weather sources. */
  get liveShipPaints(): number {
    return this.paints.filter((p) => p.kind === 'ship').length;
  }

  /** How many of those are weather (sea clutter + the storm wall) — debug/tests. */
  get liveWeatherPaints(): number {
    return this.paints.filter((p) => p.kind === 'clutter' || p.kind === 'storm').length;
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
  get paintList(): readonly RadarPaint[] {
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
   * would be a second source of truth for the same question, and it would
   * mis-read a legitimate `ext: 0` echo.
   */
  onBlip(e: BlipEvent): void {
    if (this.grammar === 'return') this.addReturnPaint(e as ReturnBlipEvent);
    else this.addSilhouetteBlip(e as SilhouetteBlipEvent);
  }

  /** The `silhouette` (Story 4.2) acquire path — outline + hue + ARPA vector. */
  private addSilhouetteBlip(e: SilhouetteBlipEvent): void {
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

  /** The `return` acquire path: park the wire payload until a real own pose can
   *  resolve its bearing and range, then it becomes a `ShipPaint`. */
  private addReturnPaint(e: ReturnBlipEvent): void {
    this.pending.push({ id: e.id, x: e.x, y: e.y, ext: e.ext, t: e.t });
    this.resolvePending();
  }

  /** Turn every parked echo into a paint, ONCE an own pose exists. Geometry is
   *  frozen from then on — a phosphor paint is a historical snapshot, so it must
   *  not re-pose as the observer moves; the deferral exists only to stop a paint
   *  being born wrong.
   *
   *  THIS IS THE BEYOND-TRUESIGHT SOURCE. Everything arriving here came through
   *  the server's `blipGate`, which excludes `dist <= sightRange`; the inside-
   *  truesight half of the scope is synthesized in `sweepContacts` instead
   *  (amendment 89). */
  private resolvePending(): void {
    const own = this.own;
    if (own === null || this.pending.length === 0) return;
    for (const e of this.pending) {
      const dx = e.x - own.x;
      const dy = e.y - own.y;
      this.enrollPaint({
        kind: 'ship',
        id: e.id,
        x: e.x,
        y: e.y,
        ext: e.ext,
        bearing: Math.atan2(dy, dx),
        dist: Math.hypot(dx, dy),
        t: e.t,
        seed: paintSeed(e.id, e.t),
      });
    }
    this.pending.length = 0;
  }

  /** Add a paint and apply the per-track then global caps.
   *
   *  ONE CAP KEY PER TRACK, ACROSS BOTH SHIP SOURCES (amendment 89). A ship
   *  paint keys on the contact id whether it came off the wire or out of
   *  `contactEcho`, so a hull crossing the truesight seam keeps ONE ghost train
   *  of `paintsPerContact` marks rather than starting a second one. */
  private enrollPaint(p: RadarPaint): void {
    this.paints.push(p);
    // Ships key on their contact id; every other source is a SINGLETON TRACK
    // (one landmass, one haze, one wall), so they all answer to the same
    // per-track depth — the coastline, the sea state and the storm hold their
    // ghosts for exactly as long as a contact does.
    const per =
      p.kind === 'ship'
        ? CLIENT_CONFIG.blip.paintsPerContact
        : CLIENT_CONFIG.blip.heatmap.island.paintsPerIsland;
    this.trim(p, per);
    while (this.paints.length > MAX_LIVE_BLIPS) this.dropPaint(this.paints[0]);
  }

  /** Keep at most `per` live paints of this track (oldest-first eviction). */
  private trim(p: RadarPaint, per: number): void {
    let seen = 0;
    for (let i = this.paints.length - 1; i >= 0; i--) {
      const q = this.paints[i];
      if (!sameTrack(p, q)) continue;
      seen++;
      if (seen > per) this.paints.splice(i, 1);
    }
  }

  /** Remove one paint from the list, releasing any open-arc bookkeeping. */
  private dropPaint(p: RadarPaint): void {
    const i = this.paints.indexOf(p);
    if (i >= 0) this.paints.splice(i, 1);
    if (p.kind === 'island' && this.opening.get(p.isle) === p) this.opening.delete(p.isle);
    if (this.openClutterPaint === p) this.openClutterPaint = null;
    if (this.openStormPaint === p) this.openStormPaint = null;
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
    this.opening.clear();
    this.openClutterPaint = null;
    this.openStormPaint = null;
    this.hideHeat();
  }

  /** Per-frame: rotate/position the sweep + rings, advance the beam across the
   *  island field AND the sighted contacts, then decay every live mark and
   *  re-rasterize the heatmap.
   *
   *  `contacts` is the truesight contact store (net/snapshots.ts) — the second
   *  source of ship paints (amendment 89). Optional and unread in `silhouette`
   *  mode, where a sighted hull has never painted and does not start now.
   *
   *  `view` is the world rectangle the camera is showing (amendment 96) — the
   *  heatmap buffer's extent, used by `paintHeat` and by NOTHING else on this
   *  path. Omitting it falls back to a radar-ring-sized window on the own ship,
   *  which is the pre-cycle-58 behaviour and covers any caller that has no
   *  camera (tests, and the `silhouette` grammar, which has no buffer at all).
   *
   *  `zone` is the client's live zone view (Story 4.10, amendment 128) — the
   *  fifth and last source of paints. ONLY `zone.cur` is ever read: the live
   *  ring is a physical object and returns an echo, while the dashed next-ring
   *  telegraph is a chart annotation and must not. It discloses nothing — ring
   *  geometry has been on the wire since its reveal beat (Story 3.1). */
  render(
    own: OwnPoint | null,
    serverNow: number,
    contacts: ContactStore | null = null,
    view: ViewRect | null = null,
    zone: ZoneLike | null = null,
  ): void {
    this.own = own;
    this.view = view;
    const rot = this.updateSweep(own, serverNow);
    if (this.grammar === 'return') this.renderReturn(own, rot, serverNow, contacts, zone);
    this.lastRotation = rot;
    this.updateBlips(serverNow);
  }

  /** The whole `return` frame: resolve parked echoes, advance the beam across
   *  the islands, the sighted contacts and the weather, drop dead paints,
   *  re-rasterize the buffer from the survivors, upload. */
  private renderReturn(
    own: OwnPoint | null,
    rot: number | null,
    serverNow: number,
    contacts: ContactStore | null,
    zone: ZoneLike | null,
  ): void {
    this.resolvePending();
    const from = this.lastRotation;
    if (own !== null && rot !== null && from !== null) {
      this.sweepIslands(own, from, rot, serverNow);
      this.sweepContacts(own, from, rot, serverNow, contacts);
      this.sweepWeather(own, from, rot, serverNow, zone);
    }
    this.prunePaints(serverNow);
    this.paintHeat(own, serverNow);
  }

  /**
   * Advance the beam across the two WEATHER sources (Story 4.10, amendments
   * 128 + 130): the near-field sea-clutter haze and the storm wall.
   *
   * Both surround the observer, so unlike an island there is no bearing span to
   * test — the cycle is anchored on a fixed bearing instead: one paint of each
   * per beam revolution, its arc growing behind the beam, the previous
   * revolution's decaying underneath. Everything either paint will ever read is
   * frozen at this instant (the observer and the island shortlist for the haze,
   * the ring's centre and radius for the wall), so a closing ring never
   * retroactively moves a wall already on the scope (amendment 83).
   *
   * THE FRAME'S `from` IS DELIBERATELY NOT PASSED ON. Both paints start their
   * arc at the weather ANCHOR bearing (render/radarSources.ts): the frame's
   * `from` sits a hair SHORT of it, and `stampCover`'s `wrapPositive(to − from)`
   * then wrapped a nearly-full arc down to a sliver on the last frame of most
   * revolutions, collapsing the haze and the wall for one frame. `from` still
   * decides WHEN to open (`weatherCycled`); it no longer decides where the arc
   * begins.
   */
  private sweepWeather(
    own: OwnPoint,
    from: number,
    to: number,
    serverNow: number,
    zone: ZoneLike | null,
  ): void {
    if (this.openClutterPaint !== null) this.openClutterPaint.to = to;
    if (this.openStormPaint !== null) this.openStormPaint.to = to;
    if (!weatherCycled(from, to)) return;
    this.closeWeather();
    this.openClutterPaint = openClutter(
      own,
      to,
      serverNow,
      this.islands,
      CLIENT_CONFIG.blip.heatmap.model.clutterRangeU,
    );
    this.enrollPaint(this.openClutterPaint);
    this.openStormWall(own, to, serverNow, zone);
  }

  /** Bake the wall for the LIVE ring, if there is one and any of it is in radar
   *  range. `state === 'idle'` (no timeline yet) paints nothing at all. */
  private openStormWall(
    own: OwnPoint,
    to: number,
    serverNow: number,
    zone: ZoneLike | null,
  ): void {
    if (zone === null || zone.state === 'idle') return;
    const paint = openStorm(
      zone.cur,
      own,
      this.radarRange,
      to,
      serverNow,
      paintSeed('storm', serverNow),
      CLIENT_CONFIG.blip.heatmap,
    );
    if (paint === null) return;
    this.openStormPaint = paint;
    this.enrollPaint(paint);
  }

  /** Retire the open-arc bookkeeping for both weather sources: the paints stay
   *  in the list and keep decaying, they simply stop growing. */
  private closeWeather(): void {
    if (this.openClutterPaint !== null) this.openClutterPaint.full = true;
    if (this.openStormPaint !== null) this.openStormPaint.full = true;
    this.openClutterPaint = null;
    this.openStormPaint = null;
  }

  /**
   * Advance the beam across the SIGHTED CONTACTS (amendment 89) — the inside-
   * truesight half of the scope, synthesized client-side because the server
   * deliberately sends no blip for a hull it is already sending as a `Contact`.
   *
   * Every gate lives in the pure `contactEcho` (radarHeatmap.ts ruling R7),
   * including the range term that makes this source the EXACT complement of the
   * wire's; this method only supplies the frame's beam arc and the contact poses
   * to test it against. Cost is one buffer sample plus a distance and an angle
   * compare per contact per frame; the LOS test and the extent computation are
   * paid only on the frame the beam actually crosses a contact, i.e. once per
   * contact per revolution.
   *
   * Poses are sampled at the SAME interp-delayed time the hull renderer draws
   * them, so an echo lands on the hull the player can see rather than ~100ms
   * ahead of it. (The observer is the live predicted own pose — the identical
   * pairing every other world-space overlay already draws with.)
   */
  private sweepContacts(
    own: OwnPoint,
    from: number,
    to: number,
    serverNow: number,
    contacts: ContactStore | null,
  ): void {
    if (contacts === null) return;
    const sight = this.sightHoleU;
    const at = serverNow - CLIENT_CONFIG.net.interpDelayMs;
    for (const id of contacts.ids()) {
      const s = contacts.get(id)?.sampleAt(at);
      const cls = contacts.classOf(id);
      if (s === null || s === undefined || cls === undefined) continue;
      const c = { id, x: s.x, y: s.y, heading: s.heading, cls };
      const paint = contactEcho(c, own, sight, from, to, this.islands, serverNow);
      if (paint !== null) this.enrollPaint(paint);
    }
  }

  /** Position/rotate the sweep + rings; returns the beam angle this frame, or
   *  null when the sweep is hidden (which also breaks the island arc, so
   *  resuming can never replay a whole revolution of crossings at once). */
  private updateSweep(own: OwnPoint | null, serverNow: number): number | null {
    const visible = own !== null && this.lastSweep !== null;
    this.sweep.visible = visible;
    this.rings.visible = visible;
    if (!visible || own === null || this.lastSweep === null) return null;
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

  /**
   * Advance the beam across the island field (amendments 69 + 78).
   *
   * PURE PRESENTATION — the island field is rebuilt locally from the map seed,
   * so nothing here touches the wire or the perception invariant. One paint is
   * opened per island per REVOLUTION, when the beam first reaches its bearing
   * span, and its arc then grows until the beam leaves — so the landmass fills
   * in behind the beam rather than appearing whole the instant the beam clips
   * its edge.
   *
   * Cost per frame is one hypot plus a handful of angle compares PER ISLAND: a
   * 60fps frame advances the beam ~1.5° at 15rpm, so the expensive part — the
   * coverage bake — runs at most once per island per 4s revolution, and only for
   * islands actually in radar range.
   */
  private sweepIslands(own: OwnPoint, from: number, to: number, serverNow: number): void {
    const n = this.islands.length;
    let baked = 0;
    this.bakeCursor = n > 0 ? (this.bakeCursor + 1) % n : 0;
    for (let k = 0; k < n; k++) {
      const isle = this.islands[(this.bakeCursor + k) % n];
      const span = islandBearingSpan(isle, own, this.radarRange);
      const open = this.opening.get(isle);
      if (span === null || !arcOverlaps(from, to, span.centre, span.half)) {
        if (open !== undefined) {
          open.full = true;
          this.opening.delete(isle);
        }
        continue;
      }
      if (open !== undefined) open.to = to;
      // AT MOST ONE COVERAGE BAKE PER FRAME. The bake is the only expensive
      // thing in the whole grammar (a big landmass costs a couple of ms), and
      // two islands entering the beam on the same frame is rare but real — so
      // the second waits a frame, at a cost of ~1.5° of arc nobody can see. The
      // ROTATING START is what stops a big island at a low index starving a
      // small one that would otherwise cross the beam entirely inside one frame.
      else if (baked === 0) {
        this.openIslandPaint(isle, own, from, to, serverNow);
        baked++;
      }
    }
  }

  /** Bake one island paint: its observer-facing landmass, from the REAL polygon,
   *  frozen against the observer position at paint time. There is no sight term
   *  in the bake any more (amendment 88) — a coastline inside the bubble paints
   *  like any other, so the whole near face enters `cover`. */
  private openIslandPaint(
    isle: Island,
    own: OwnPoint,
    from: number,
    to: number,
    serverNow: number,
  ): void {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const seed = paintSeed(`i${isle.x.toFixed(0)},${isle.y.toFixed(0)}`, serverNow);
    const paint: IslandPaint = {
      kind: 'island',
      isle,
      from,
      to,
      full: false,
      t: serverNow,
      cover: buildIslandCoverage(
        isle,
        this.islands,
        own,
        this.radarRange,
        seed,
        cfg,
        this.heightRaster,
      ),
    };
    this.opening.set(isle, paint);
    this.enrollPaint(paint);
  }

  /** Drop paints that have aged out of the phosphor window. */
  private prunePaints(serverNow: number): void {
    const life = blipLifeMs(this.sweepPeriodMs);
    for (let i = this.paints.length - 1; i >= 0; i--) {
      if (blipAlpha(serverNow - this.paints[i].t, life) > 0) continue;
      this.dropPaint(this.paints[i]);
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
      opts: cfg,
    };
    // Two passes over ONE list: ships + islands here, the weather sources in
    // their own module (render/radarSources.ts). Each module stamps the kinds it
    // declares, which is what keeps that dependency one-way — see the type-only
    // import at the top of radarHeatmap.ts.
    rasterize(heat.grid, this.paints, ctx);
    rasterizeWeather(heat.grid, this.paints, ctx);
    quantizeInto(heat.grid, cfg.bands, heat.rgba);
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

/** Do two paints belong to the same track (same contact, same landmass, or the
 *  one haze / the one wall)? */
function sameTrack(a: RadarPaint, b: RadarPaint): boolean {
  if (a.kind === 'ship') return b.kind === 'ship' && a.id === b.id;
  if (a.kind === 'island') return b.kind === 'island' && a.isle === b.isle;
  return a.kind === b.kind;
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
