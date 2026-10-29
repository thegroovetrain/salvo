// THE RADAR BUOY'S SECOND SWEEP (Story 10.9, epic-10 amendment 4, AC 5) — a
// plain beam wedge turning on every OWN radar buoy, drawn beside the own
// sweep on the chart.
//
// WHAT IT IS: the radar's own baked sweep texture (render/textures.ts
// `bakeSweepTexture`, handed in by the Radar so there is one bake), centred on
// the buoy, scaled to `CONFIG.buoy.radiusU` (the buoy's 750 u reach — the
// texture is baked at `SWEEP_TEXTURE_RADIUS` px), and rotated by the SAME law
// as the own beam: `sweepRotation(sweep, sampleT, serverNow, sweepPeriodMs)`
// (render/phosphor.ts) — the wire `sweep` is the buoy's authoritative angle at
// the frame's server time, extrapolated at 2π per the OWNER's sweep period
// (the buoy turns at the owner's RPM, AC 5).
//
// WHAT IT IS NOT: a sensor. The paints the buoy's sweep earns arrive on the
// wire as ordinary blips (server perception — DESIGN.md § Two sensor tiers:
// radar returns carry no personal hue), so this module draws NO returns and
// runs NO terrain march. It is the beam made visible, nothing more.
//
// WHOSE: only the owner's. An enemy buoy's view carries no `sweep` (self-
// private, like `OwnShip.sweep`), and a non-radar buoy has none — both draw
// nothing. A buoy leaving the list (sunk, expired, out of view) loses its
// wedge on the same frame.
//
// The pure view-model (`buoySweepModels`) is split from the Pixi glue
// (`BuoySweep`) so the geometry and the rotation law are unit-tested without
// a renderer.

import { Sprite, type Container, type Texture } from 'pixi.js';
import { CONFIG, type DecoyView } from '@salvo/shared';
import { sweepRotation } from './phosphor.js';
import { SWEEP_TEXTURE_RADIUS } from './textures.js';

/** One radar buoy's wedge, this frame. */
export interface BuoySweepModel {
  /** The buoy's id — the sprite key. */
  id: string;
  /** u — the wedge's centre: the buoy. */
  x: number;
  y: number;
  /** Sprite scale: the buoy's reach over the baked texture radius. */
  scale: number;
  /** rad — the beam's leading edge at `serverNow` (the own beam's law). */
  rotation: number;
}

/** Pure: does this view carry a wedge — an OWN RADAR buoy with a wire sweep? */
export function hasBuoySweep(d: DecoyView): d is DecoyView & { sweep: number } {
  return d.own && d.kind === 'radar' && d.sweep !== undefined && Number.isFinite(d.sweep);
}

/**
 * Pure: the wedges to draw this frame — one per own radar buoy in `decoys`,
 * centred on the buoy, scaled `CONFIG.buoy.radiusU / SWEEP_TEXTURE_RADIUS`,
 * rotated by `sweepRotation(d.sweep, sampleT, serverNow, sweepPeriodMs)`.
 * `sampleT` is the server time of the frame the list came from (the instant
 * every `sweep` in it was sampled).
 */
export function buoySweepModels(
  decoys: readonly DecoyView[],
  sampleT: number,
  serverNow: number,
  sweepPeriodMs: number,
): BuoySweepModel[] {
  const scale = CONFIG.buoy.radiusU / SWEEP_TEXTURE_RADIUS;
  const out: BuoySweepModel[] = [];
  for (const d of decoys) {
    if (!hasBuoySweep(d)) continue;
    out.push({ id: d.id, x: d.x, y: d.y, scale, rotation: sweepRotation(d.sweep, sampleT, serverNow, sweepPeriodMs) });
  }
  return out;
}

/** Thin Pixi adapter: one additive sprite per live model, reconciled by id
 *  every render frame. Holds no state the models do not carry. */
export class BuoySweep {
  private readonly sprites = new Map<string, Sprite>();

  /** `layer` = the chart's sweep layer (the own beam's); `texture` = the
   *  radar's baked sweep wedge (shared, never destroyed here). */
  constructor(
    private readonly layer: Container,
    private readonly texture: Texture,
  ) {}

  /** Place this frame's wedges; drop any whose buoy left the list. */
  render(models: readonly BuoySweepModel[]): void {
    const live = new Set<string>();
    for (const m of models) {
      live.add(m.id);
      const s = this.sprites.get(m.id) ?? this.spawn(m.id);
      s.position.set(m.x, m.y);
      s.scale.set(m.scale);
      s.rotation = m.rotation;
    }
    for (const [id, s] of this.sprites) {
      if (live.has(id)) continue;
      s.destroy();
      this.sprites.delete(id);
    }
  }

  /** Remove every wedge (death / spectate / return to port). */
  clear(): void {
    this.render([]);
  }

  /** How many wedges are drawn (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private spawn(id: string): Sprite {
    const s = new Sprite(this.texture);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    this.layer.addChild(s);
    this.sprites.set(id, s);
    return s;
  }
}
