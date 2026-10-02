// PHOSPHOR SHELLS burning-zone rendering from FrameMsg.burnZones (Story 8.17,
// Eric ruling 2026-09-29, epic-8 amendments 131 and 135(f)/(i)). Contact-like
// per-observer state, not events — recomputed per frame exactly like the lit
// zones (render/litZones.ts), and drawn in the same fog-immune chartRoot layer.
//
// A HAZARD ONLY. A burning zone reveals nothing, extends no gun's reach and is
// not a lit zone, so nothing here feeds the fog holes, the projectile
// cull-keep or the flare reach (those read `litZones` alone). The circle is
// drawn for every observer who can see it so they can steer clear — the
// counterplay-over-concealment ruling (amendment 50) the old star-shell `phos`
// verb was drawn under.
//
// THE TREATMENT MOVED, IT WAS NOT REINVENTED (amendment 135(i)): the firer-hue
// identity glow (litZones' `drawZoneGlow` — a zone always says whose it is) with
// a BREATHING EMBER disc inside it in the damage-marker crimson — exactly what
// render/litZones.ts painted for a `phos` zone until 8.17 deleted the verb. The
// expiry fade is the lit zone's (`litZoneFade`, timestamp math off
// `until − serverNow`; the client keeps no timers).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { BurnZoneView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';
import { drawZoneGlow, litZoneFade, reconcileLitZones } from './litZones.js';

const Z = CLIENT_CONFIG.burnZone;
/** The ember: the existing damage-marker crimson — burn feedback stays in the
 *  damage register (no new reds), and this is literally water on fire. */
const EMBER_COLOR = CLIENT_CONFIG.colors.damageMarker;

/** Ember-breath rate (Hz) — well under the shared photosensitivity ceiling,
 *  and nowhere near the ≤3 flashes/s regional cap. */
export const EMBER_HZ = Z.emberHz;

/** Largest frame gap (s) the ember phase integrator advances across (the hud.ts
 *  pulse precedent: a backgrounded tab must not jump the wave). */
const MAX_EMBER_DT = 0.5;

/**
 * Pure: advance the ember breath's PHASE (radians) by one frame. INTEGRATED,
 * never derived from absolute time — the hud.ts advancePulsePhase reasoning
 * verbatim: an integrated phase is continuous through any rate change, so the
 * cap on the rate is also a cap on how fast the alpha can move.
 */
export function advanceEmberPhase(phase: number, dtSec: number): number {
  const step = Math.min(MAX_EMBER_DT, Math.max(0, dtSec));
  return (phase + EMBER_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Pure: the ember layer's alpha at a phase. `amp` is motion-scaled by the caller
 * (halved at `reduced`, 0 at `off`), and the BASE alpha is information: the
 * burning disc — where the fire is and how big it is — renders identically at
 * every motion level, and only the breath stops.
 */
export function emberAlpha(phase: number, amp: number): number {
  return Z.emberAlpha + amp * Math.sin(phase);
}

interface BurnSprite extends HueState {
  g: Graphics;
  until: number; // server-clock expiry — drives the render() fade
  r: number; // zone radius (u) — needed to redraw on a firer-hue recolor
  /** The breathing ember disc, a CHILD of `g` so its own alpha can pulse
   *  without disturbing the expiry fade (which rides `g.alpha`). */
  ember: Graphics;
}

export class BurnZones {
  private readonly sprites = new Map<string, BurnSprite>();
  /** INTEGRATED ember-breath phase + the clock it last advanced at (hud.ts's
   *  pulse precedent — accumulated per frame, never derived from absolute time). */
  private emberPhase = 0;
  private lastEmberSec: number | null = null;

  /** `layer` = chartRoot's litZone layer (fog-immune, above the base map) —
   *  the same layer the lit zones draw in. */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile sprites against this observer's burning-zone list for the tick.
   * `hueFor` resolves each zone's firer id (`by`) to its personal hue — the
   * litZones precedent. The caller passes `f.burnZones ?? []` (frames omit the
   * key when the observer sees none).
   */
  sync(zones: readonly BurnZoneView[], hueFor: HueFor): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), zones);
    for (const id of remove) this.despawn(id);
    for (const z of add) this.spawn(z, hueFor);
    for (const s of this.sprites.values()) retryHue(s, hueFor, (color) => drawZoneGlow(s.g, s.r, color));
  }

  /**
   * Per render frame: fade each zone by its timestamp (until − serverNow) and
   * breathe the embers on the shared integrated phase. `nowSec` is the
   * server-clock estimate in SECONDS; omitting it holds the ember at its base
   * alpha, which is exactly what motion=off does.
   */
  render(serverNow: number, nowSec?: number): void {
    const alpha = this.advanceEmber(nowSec);
    for (const { g, until, ember } of this.sprites.values()) {
      g.alpha = litZoneFade(until - serverNow);
      ember.alpha = alpha;
    }
  }

  /** Advance the shared ember phase to `nowSec` and return this frame's ember
   *  alpha (motion-gated amplitude; the base alpha is information). */
  private advanceEmber(nowSec: number | undefined): number {
    if (nowSec !== undefined) {
      const dt = this.lastEmberSec === null ? 0 : nowSec - this.lastEmberSec;
      this.lastEmberSec = nowSec;
      this.emberPhase = advanceEmberPhase(this.emberPhase, dt);
    }
    return emberAlpha(this.emberPhase, motionScaled(Z.emberAmp, settings.current.motion));
  }

  private spawn(z: BurnZoneView, hueFor: HueFor): void {
    const { color, colored, rev } = resolveHue(z.by, hueFor);
    const g = new Graphics();
    drawZoneGlow(g, z.r, color);
    g.position.set(z.x, z.y);
    const ember = new Graphics();
    ember.blendMode = 'add';
    ember.circle(0, 0, z.r * Z.emberFrac).fill({ color: EMBER_COLOR, alpha: 1 });
    ember.alpha = Z.emberAlpha;
    g.addChild(ember);
    this.layer.addChild(g);
    this.sprites.set(z.id, { g, until: z.until, r: z.r, by: z.by, colored, rev, ember });
  }

  /** The live ember alpha of a held burning zone (test seam for the breath). */
  emberAlphaOf(id: string): number | null {
    return this.sprites.get(id)?.ember.alpha ?? null;
  }

  /** How many burning zones are held (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy({ children: true }); // takes the ember child with it
    this.sprites.delete(id);
  }
}
