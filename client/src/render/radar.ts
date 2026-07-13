// Radar rendering: the rotating sweep wedge on the own ship, the pooled
// phosphor blips it paints, and the own-ship range rings. All of it lives in
// chartRoot (fog-immune, camera-transformed), so blips/sweep stay readable
// over the fogged ocean while remaining in world coordinates.
//
// Blips persist independent of the beam graphic: each `blip` event acquires
// its own sprite whose alpha/tint are pure functions of serverNow − blip.t
// (phosphor.ts) — a repaint spawns a NEW blip while the old one keeps
// decaying, exactly the phosphor-tube look the plan asks for.
//
// Range rings (documented choice): the plan calls for CIC-style range rings;
// own-ship-centered beats map-centered for readability, so ONE ring at
// exactly sightRange and ONE at exactly radarRange follow the own ship here
// (kept subtle). The faint map-centered rings in map.ts remain as the chart
// grid. Thin Pixi adapter (not unit tested; the math lives in phosphor.ts).

import { Graphics, Sprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, type BlipEvent } from '@salvo/shared';
import { Pool, capOldest } from '../util/pool.js';
import { blipAlpha, blipTint, sweepRotation } from './phosphor.js';
import {
  BLIP_TEXTURE_SIZE,
  SWEEP_TEXTURE_RADIUS,
  bakeBlipTexture,
  bakeSweepTexture,
} from './textures.js';

/** Rendered blip diameter (world units). */
const BLIP_DIAMETER_U = 16;
/**
 * Hard cap on live (decaying) blips. Radar paints arrive from network
 * messages regardless of render-loop cadence — a backgrounded tab (rAF
 * throttled/paused) can otherwise accumulate blips faster than they age out,
 * growing the pool unbounded. Oldest-inserted is evicted first.
 */
const MAX_LIVE_BLIPS = 64;
const RING_SIGHT_COLOR = 0x00ff88;
const RING_RADAR_COLOR = 0xc0c0c0;

interface LiveBlip {
  sprite: Sprite;
  t: number; // ms — server paint time (drives decay)
}

interface OwnPoint {
  x: number;
  y: number;
}

export class Radar {
  private readonly sweep: Sprite;
  private readonly rings: Graphics;
  private readonly pool: Pool<Sprite>;
  private readonly blips: LiveBlip[] = [];
  private readonly blipTexture = bakeBlipTexture();
  /** Latest authoritative sweep sample (angle at server time t). */
  private lastSweep: { angle: number; t: number } | null = null;
  // Effective vision numbers (Stage D upgrades), swapped via setRanges();
  // bases = CONFIG.vision. sweepPeriodMs drives both the wedge rotation rate
  // and the blip phosphor decay, so upgraded paints fade on the upgraded beat.
  private sightRange: number = CONFIG.vision.sight;
  private radarRange: number = CONFIG.vision.radar;
  private sweepPeriodMs: number = CONFIG.vision.sweepPeriod;

  constructor(blipLayer: Container, sweepLayer: Container) {
    this.pool = new Pool<Sprite>(() => this.makeBlipSprite(blipLayer));

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

  private makeBlipSprite(layer: Container): Sprite {
    const s = new Sprite(this.blipTexture);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.scale.set(BLIP_DIAMETER_U / BLIP_TEXTURE_SIZE);
    s.visible = false;
    layer.addChild(s);
    return s;
  }

  /** Ingest the authoritative sweep angle from a frame (server time `t`). */
  onSweepSample(angle: number, t: number): void {
    this.lastSweep = { angle, t };
  }

  /** A radar paint arrived: spawn an independent decaying blip at its position. */
  onBlip(e: BlipEvent): void {
    const sprite = this.pool.acquire();
    sprite.position.set(e.x, e.y);
    sprite.visible = true;
    this.blips.push({ sprite, t: e.t });
    for (const evicted of capOldest(this.blips, MAX_LIVE_BLIPS)) {
      evicted.sprite.visible = false;
      this.pool.release(evicted.sprite);
    }
  }

  /** Drop every live blip at once (entering spectate: contacts go live/unfogged). */
  clearBlips(): void {
    for (const b of this.blips) {
      b.sprite.visible = false;
      this.pool.release(b.sprite);
    }
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
    const period = this.sweepPeriodMs;
    for (let i = this.blips.length - 1; i >= 0; i--) {
      const b = this.blips[i];
      const age = serverNow - b.t;
      const alpha = blipAlpha(age, period);
      if (alpha <= 0) {
        b.sprite.visible = false;
        this.pool.release(b.sprite);
        this.blips.splice(i, 1);
        continue;
      }
      b.sprite.alpha = alpha;
      b.sprite.tint = blipTint(age, period);
    }
  }
}
