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
  type HullId,
  type Island,
  type RadarGrammar,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { Pool, capOldest, capOldestByKey } from '../util/pool.js';
import { extentAlong, luminanceFloor, speedVector, type SpeedVector } from './blipMarks.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';
import { blipAlpha, blipCool, blipLifeMs, sweepRotation } from './phosphor.js';
import {
  anchorGrid,
  arcOverlaps,
  bandIndex,
  buildIslandCoverage,
  islandBearingSpan,
  makeGrid,
  paintSeed,
  quantizeInto,
  rasterize,
  sampleGrid,
  type HeatGrid,
  type IslandPaint,
  type RadarPaint,
} from './radarHeatmap.js';
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
  // Effective vision numbers (Stage D upgrades), swapped via setRanges();
  // bases = CONFIG.vision. sweepPeriodMs drives both the wedge rotation rate
  // and the blip phosphor decay, so upgraded paints fade on the upgraded beat.
  private sightRange: number = CONFIG.vision.sight;
  private radarRange: number = CONFIG.vision.radar;
  private sweepPeriodMs: number = 60000 / CONFIG.vision.sweepRpm;

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
   * period): redraws the range rings, rescales the baked sweep wedge to the new
   * radar radius, and (in `return` mode) re-sizes the heatmap buffer, which is
   * defined as covering 2 × radar range. Called only when the own stats change.
   */
  setRanges(sightRange: number, radarRange: number, sweepPeriodMs: number): void {
    this.sightRange = sightRange;
    this.radarRange = radarRange;
    this.sweepPeriodMs = sweepPeriodMs;
    this.applyRanges();
  }

  private applyRanges(): void {
    this.rings.clear();
    this.rings.circle(0, 0, this.sightRange).stroke({ width: 2, color: RING_SIGHT_COLOR, alpha: 0.12 });
    this.rings.circle(0, 0, this.radarRange).stroke({ width: 2, color: RING_RADAR_COLOR, alpha: 0.07 });
    this.sweep.scale.set(this.radarRange / SWEEP_TEXTURE_RADIUS);
    if (this.grammar === 'return') this.buildHeat();
  }

  /** (Re)allocate the world-anchored heatmap surface for the current radar
   *  range. Idempotent: an unchanged span keeps the existing buffer, so a
   *  no-op `setRanges` never churns a texture. */
  private buildHeat(): void {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const grid = makeGrid(this.radarRange, cfg.cellU);
    if (this.heat !== null && this.heat.grid.cols === grid.cols) return;
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
   *  being born wrong. */
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

  /** Add a paint and apply the per-track then global caps. */
  private enrollPaint(p: RadarPaint): void {
    this.paints.push(p);
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
    if (this.heat !== null) this.heat.sprite.visible = false;
  }

  /** Per-frame: rotate/position the sweep + rings, advance the beam across the
   *  island field, then decay every live mark and re-rasterize the heatmap. */
  render(own: OwnPoint | null, serverNow: number): void {
    this.own = own;
    const rot = this.updateSweep(own, serverNow);
    if (this.grammar === 'return') this.renderReturn(own, rot, serverNow);
    this.lastRotation = rot;
    this.updateBlips(serverNow);
  }

  /** The whole `return` frame: resolve parked echoes, advance island arcs, drop
   *  dead paints, re-rasterize the buffer from the survivors, upload. */
  private renderReturn(own: OwnPoint | null, rot: number | null, serverNow: number): void {
    this.resolvePending();
    const from = this.lastRotation;
    if (own !== null && rot !== null && from !== null) this.sweepIslands(own, from, rot, serverNow);
    this.prunePaints(serverNow);
    this.paintHeat(own, serverNow);
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
   *  frozen against the observer position at paint time. */
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
      cover: buildIslandCoverage(isle, this.islands, own, this.radarRange, seed, cfg),
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
   * Re-rasterize the heatmap from the paint list and upload it (ruling R1).
   *
   * Clear → stamp every live paint → quantize → upload. Nothing decays in place:
   * the buffer is a pure function of (paint list, serverNow), which is what stops
   * old paints smearing or dragging along with the camera as the observer moves.
   */
  private paintHeat(own: OwnPoint | null, serverNow: number): void {
    const heat = this.heat;
    if (heat === null) return;
    // Anchor (which CLEARS) before the visibility early-out: hiding the sprite
    // must not leave the last frame's cells in the buffer, or a paint that aged
    // out would still answer `bandAt` — and would flash back the instant the
    // next paint made the sprite visible again.
    if (own !== null) anchorGrid(heat.grid, own.x, own.y);
    heat.sprite.visible = own !== null && this.paints.length > 0;
    if (!heat.sprite.visible || own === null) return;
    const cfg = CLIENT_CONFIG.blip.heatmap;
    rasterize(heat.grid, this.paints, {
      now: serverNow,
      lifeMs: blipLifeMs(this.sweepPeriodMs),
      alphaFloor: this.assist ? CLIENT_CONFIG.blip.assistMinAlpha : CLIENT_CONFIG.blip.minAlpha,
      radarRange: this.radarRange,
      opts: cfg,
    });
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

/** Do two paints belong to the same track (same contact, or same landmass)? */
function sameTrack(a: RadarPaint, b: RadarPaint): boolean {
  if (a.kind === 'ship') return b.kind === 'ship' && a.id === b.id;
  return b.kind === 'island' && a.isle === b.isle;
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
