// SMOKE SCREEN puff rendering from FrameMsg.smoke (Story 8.18, catalog-v3 R38;
// Eric rulings 2026-09-29, epic-8 amendments 138–145). Contact-like
// per-observer state, not events — reconciled per frame by id exactly like the
// burning zones (render/burnZones.ts), and drawn in the fog-immune `smoke`
// chart layer beside the wounded plumes.
//
// NOT WOUNDED SMOKE (render/smoke.ts, CLIENT_CONFIG.smoke, the `sm` event).
// The two share `colors.woundedSmoke` and are told apart by SHAPE, never by
// colour: a laid puff is a LARGE STATIONARY DISC with a crisp rim; a wounded
// plume is a string of small soft blobs trailing a hull.
//
// THE RADIUS IS THE SHARED CURVE. The wire carries only the birth stamp (`t0`);
// the disc's extent is `puffRadius(t0, serverNow)` — the very function the
// server's sight predicate evaluates — so the drawn edge IS the occlusion edge.
// Never re-derive it here.
//
// MOTION-BLIND (the wounded-smoke rule): a puff's presence and extent are
// information — the motion setting never hides or shrinks one, and there is no
// animation to scale. Only the end-of-life fade (timestamp math off
// `t0 + lifeMs − serverNow`; the client keeps no timers) moves the alpha, and it
// runs at every motion level because it tracks the puff's real removal.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, puffRadius, type SmokeView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01 } from '../util/math.js';

const K = CLIENT_CONFIG.smokeScreen;
const COLOR = CLIENT_CONFIG.colors.woundedSmoke;

/** The radius each disc's geometry is drawn at ONCE (the full-grown r1); every
 *  live radius is a scale of it, so a growing puff never re-tessellates. */
export const PUFF_DRAW_RADIUS = CONFIG.smokeScreen.r1;

/**
 * Pure: the end-of-life alpha multiplier for a puff born at `t0`, at server time
 * `serverNow` — 1 until the last `fadeMs` of its life, then linear to 0 at
 * `t0 + lifeMs` (the server's removal instant).
 */
export function puffFade(t0: number, serverNow: number): number {
  const left = t0 + CONFIG.smokeScreen.lifeMs - serverNow;
  return clamp01(left / K.fadeMs);
}

interface PuffSprite {
  g: Graphics;
  t0: number; // server-clock birth stamp — drives radius and fade
}

export class SmokeScreen {
  private readonly sprites = new Map<string, PuffSprite>();

  /** `layer` = chartRoot's `smoke` layer (fog-immune, beneath the tactical
   *  marks) — the one the wounded plumes draw in. */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile discs against this observer's puff list for the tick. The caller
   * passes `f.smoke ?? []` (frames omit the key when the observer sees none).
   * Puffs never move, so a held id is left alone; a gone id is destroyed.
   */
  sync(puffs: readonly SmokeView[]): void {
    const live = new Set<string>();
    for (const p of puffs) {
      live.add(p.id);
      if (!this.sprites.has(p.id)) this.spawn(p);
    }
    for (const id of [...this.sprites.keys()]) if (!live.has(id)) this.despawn(id);
  }

  /** Per render frame: grow each disc along the shared curve and fade it over
   *  its last `fadeMs`. `serverNow` is the server-clock estimate (ms). */
  render(serverNow: number): void {
    for (const { g, t0 } of this.sprites.values()) {
      g.scale.set(puffRadius(t0, serverNow) / PUFF_DRAW_RADIUS);
      g.alpha = puffFade(t0, serverNow);
    }
  }

  /** The drawn radius (u) of a held puff (test seam). */
  radiusOf(id: string): number | null {
    const s = this.sprites.get(id);
    return s ? s.g.scale.x * PUFF_DRAW_RADIUS : null;
  }

  /** The live alpha multiplier of a held puff (test seam). */
  alphaOf(id: string): number | null {
    return this.sprites.get(id)?.g.alpha ?? null;
  }

  /** How many puffs are held (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private spawn(p: SmokeView): void {
    const g = new Graphics();
    g.circle(0, 0, PUFF_DRAW_RADIUS)
      .fill({ color: COLOR, alpha: K.fillAlpha })
      .stroke({ color: COLOR, alpha: K.rimAlpha, width: 1 });
    g.position.set(p.x, p.y);
    g.scale.set(CONFIG.smokeScreen.r0 / PUFF_DRAW_RADIUS);
    this.layer.addChild(g);
    this.sprites.set(p.id, { g, t0: p.t0 });
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }
}
