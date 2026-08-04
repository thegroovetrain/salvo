// Radar rendering: the rotating sweep wedge on the own ship, the pooled
// phosphor blips it paints, and the own-ship range rings. All of it lives in
// chartRoot (fog-immune, camera-transformed), so blips/sweep stay readable
// over the fogged ocean while remaining in world coordinates.
//
// STORY 4.2 (FR14, amendments 7-13) — a paint is no longer an anonymous dot.
// Each blip draws the contact's TRUE-SCALE hull silhouette at its true position
// and heading, using the SHARED `hullSilhouette()` polygon verbatim (the same
// one the hull renderer draws and the server hit-tests: UX-DR9, the silhouette
// IS the hitbox). No blip-specific geometry exists here — no per-class pixel
// table, no floor-clamp, no exaggerated notch; at true scale a 124u battleship
// and a 100u torpedo boat are unmistakable without them.
//
// Three grammars ride on that outline:
//   • a NON-SCALING 1px hairline (`pixelLine`), so the outline reads the same
//     at every camera zoom while the FOOTPRINT scales like the real hull;
//   • the owner's LUMINANCE-FLOORED personal hue (drone grey for the roster
//     sentinel, amber on a roster miss — the FALLBACK_STYLE grammar), or a flat
//     phosphor green under Variant P;
//   • an ARPA speed vector (render/blipMarks.ts), astern for a reversing hull.
//
// Blips persist independent of the beam graphic: each `blip` event acquires its
// own Graphics whose alpha/tint are pure functions of serverNow − blip.t
// (phosphor.ts). A repaint spawns a NEW blip while the old ones keep decaying —
// three sweeps of them now (amendment 9), so a contact leaves a plottable track
// whose ghost SPACING encodes its speed. Geometry is built once at acquire; the
// per-frame work is one alpha + one tint per live blip.
//
// Range rings (documented choice): the plan calls for CIC-style range rings;
// own-ship-centered beats map-centered for readability, so ONE ring at
// exactly sightRange and ONE at exactly radarRange follow the own ship here
// (kept subtle). The faint map-centered rings in map.ts remain as the chart
// grid. Thin Pixi adapter (not unit tested; the math lives in phosphor.ts and
// blipMarks.ts).

import { Graphics, Sprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import {
  CONFIG,
  hullSilhouette,
  transformPolygon,
  type BlipEvent,
  type HullId,
  type Vec2,
} from '@salvo/shared';
import { BLIP_VARIANT_P, CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { Pool, capOldest, capOldestByKey } from '../util/pool.js';
import { extentAlong, luminanceFloor, speedVector, type SpeedVector } from './blipMarks.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';
import { blipAlpha, blipCool, blipLifeMs, sweepRotation } from './phosphor.js';
import { SWEEP_TEXTURE_RADIUS, bakeSweepTexture } from './textures.js';

export type { HueFor };

/**
 * Hard cap on live (decaying) blips. Radar paints arrive from network
 * messages regardless of render-loop cadence — a backgrounded tab (rAF
 * throttled/paused) can otherwise accumulate blips faster than they age out,
 * growing the pool unbounded. Oldest-inserted is evicted first.
 *
 * Sized for the worst legitimate case under 3-sweep persistence: 19 other ships
 * plus 19 decoy buoys, each holding a full 3-paint track ≈ 114. Rounded up to
 * 128 so the backstop stays what it is — a backstop, never the thing that trims
 * a legitimate scope (the per-contact cap does that).
 */
const MAX_LIVE_BLIPS = 128;
const RING_SIGHT_COLOR = CLIENT_CONFIG.colors.phosphor; // sight ring — HUD chart chrome
const RING_RADAR_COLOR = CLIENT_CONFIG.colors.silver; // radar ring — neutral linework

interface LiveBlip {
  gfx: Graphics;
  /** Contact id — the TRACK key (3 paints per id) and the hue lookup key. */
  id: string;
  t: number; // ms — server paint time (drives decay)
  cls: HullId; // hull id at paint time (drones carry a drone hull id)
  heading: number; // rad — at paint time
  speed: number; // u/s, signed — at paint time
  /** Firer-hue latch (render/hueLatch.ts): a paint whose owner is not on the
   *  roster yet boots amber and repaints once the hue resolves — and repaints
   *  again on a colorblind-assist table swap. */
  hue: HueState;
}

interface OwnPoint {
  x: number;
  y: number;
}

export class Radar {
  private readonly sweep: Sprite;
  private readonly rings: Graphics;
  private readonly pool: Pool<Graphics>;
  private readonly blips: LiveBlip[] = [];
  /** Resolve a contact id → its paint color, or null on a roster miss (amber).
   *  Variant P swaps this for a constant at construction, which is the ENTIRE
   *  variant switch — every path downstream is variant-agnostic. */
  private readonly hueFor: HueFor;
  /** Scratch for the pose transform — consumed synchronously by the trace, so
   *  one array serves every blip (the 20Hz loop stays allocation-light). */
  private readonly scratch: Vec2[] = [];
  /** Latest authoritative sweep sample (angle at server time t). */
  private lastSweep: { angle: number; t: number } | null = null;
  // Effective vision numbers (Stage D upgrades), swapped via setRanges();
  // bases = CONFIG.vision. sweepPeriodMs drives both the wedge rotation rate
  // and the blip phosphor decay, so upgraded paints fade on the upgraded beat.
  private sightRange: number = CONFIG.vision.sight;
  private radarRange: number = CONFIG.vision.radar;
  private sweepPeriodMs: number = 60000 / CONFIG.vision.sweepRpm;

  constructor(blipLayer: Container, sweepLayer: Container, hueFor: HueFor) {
    this.hueFor = BLIP_VARIANT_P ? () => CLIENT_CONFIG.colors.phosphor : hueFor;
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
   * new radar radius. Cheap (one small Graphics redraw), called only when the
   * own stats actually change.
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
  }

  /** How many blips are currently decaying (debug/tests). */
  get liveBlips(): number {
    return this.blips.length;
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

  /** A radar paint arrived: spawn an independent decaying blip at its position. */
  onBlip(e: BlipEvent): void {
    const gfx = this.pool.acquire();
    gfx.position.set(e.x, e.y);
    gfx.visible = true;
    const { color, colored, rev } = resolveHue(e.id, this.hueFor);
    const b: LiveBlip = {
      gfx,
      id: e.id,
      t: e.t,
      cls: e.cls,
      heading: e.heading,
      speed: e.speed,
      hue: { by: e.id, colored, rev },
    };
    this.drawBlip(b, color);
    this.blips.push(b);
    // Per-track cap first (this id's 4th paint releases its oldest), then the
    // global backstop — so a flood on one contact can never evict another's.
    const key = (x: LiveBlip): string => x.id;
    this.retire(capOldestByKey(this.blips, key, e.id, CLIENT_CONFIG.blip.paintsPerContact));
    this.retire(capOldest(this.blips, MAX_LIVE_BLIPS));
  }

  /** Hide + pool a batch of retired blips. */
  private retire(gone: readonly LiveBlip[]): void {
    for (const b of gone) {
      b.gfx.visible = false;
      this.pool.release(b.gfx);
    }
  }

  /** Draw one paint: the true-scale silhouette rotated to its heading, plus the
   *  ARPA speed vector, as ONE path stroked in a single non-scaling hairline.
   *  The Graphics carries no rotation of its own — the polygon is pre-rotated
   *  through the shared `transformPolygon`, which keeps the silhouette and the
   *  vector in one frame of reference and the stroke free of any node
   *  transform. Called once at acquire (and again only if the hue resolves or
   *  the hue table swaps), never per frame. */
  private drawBlip(b: LiveBlip, color: number): void {
    const g = b.gfx;
    g.clear();
    const local = hullSilhouette(b.cls);
    tracePolygon(g, transformPolygon(local, 0, 0, b.heading, this.scratch));
    const mark = this.speedMark(local, b.heading, b.speed);
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

  /** Drop every live blip at once (entering spectate: contacts go live/unfogged). */
  clearBlips(): void {
    this.retire(this.blips);
    this.blips.length = 0;
  }

  /** Per-frame: rotate/position the sweep + rings, decay/release blips. */
  render(own: OwnPoint | null, serverNow: number): void {
    this.updateSweep(own, serverNow);
    this.updateBlips(serverNow);
  }

  private updateSweep(own: OwnPoint | null, serverNow: number): void {
    const visible = own !== null && this.lastSweep !== null;
    this.sweep.visible = visible;
    this.rings.visible = visible;
    if (!visible || own === null || this.lastSweep === null) return;
    this.sweep.position.set(own.x, own.y);
    this.rings.position.set(own.x, own.y);
    this.sweep.rotation = sweepRotation(
      this.lastSweep.angle,
      this.lastSweep.t,
      serverNow,
      this.sweepPeriodMs,
    );
  }

  private updateBlips(serverNow: number): void {
    // A paint lives persistSweeps periods now, not one (amendment 9).
    const life = blipLifeMs(this.sweepPeriodMs);
    // Colorblind assist raises the minimum decayed-blip opacity (amendment 18):
    // a cooling contact stays readable instead of dimming into the fog.
    const floor = this.assist ? CLIENT_CONFIG.blip.assistMinAlpha : CLIENT_CONFIG.blip.minAlpha;
    for (let i = this.blips.length - 1; i >= 0; i--) {
      const b = this.blips[i];
      const age = serverNow - b.t;
      const alpha = blipAlpha(age, life, floor);
      if (alpha <= 0) {
        this.retire([b]);
        this.blips.splice(i, 1);
        continue;
      }
      b.gfx.alpha = alpha;
      // Greyscale multiplier — hue-preserving, so the owner's color survives.
      b.gfx.tint = blipCool(age, life);
      retryHue(b.hue, this.hueFor, (color) => this.drawBlip(b, color));
    }
  }
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
