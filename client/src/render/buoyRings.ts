// THE BUOY EFFECT RINGS (Story 10.9; Eric 2026-10-29 approved the ring mock
// with every outer ring DASHED) — where a buoy's effect reaches, drawn on the
// water around it at `CONFIG.buoy.radiusU`.
//
// OWN buoy: a dashed 1 px hairline in the KIND's colour (the head's colour —
// render/buoyMarks.ts: radar silver, healing phosphor, shield info blue,
// speed amber) with a light interior wash for healing / shield / speed and
// NONE for radar (its turning sweep wedge, render/buoySweep.ts, is the
// interior). Its alpha scales with the buoy's life left, so an expiring ring
// dims out with the life arc. It lives on the fog-immune chart layer with the
// own marker (the own-mine precedent, render/mines.ts).
//
// SIGHTED ENEMY buoy: the same dashed hairline in the shared enemy ALERT blend
// (render/alertBlend.ts — the one yellow↔orange phase every warning on the
// water wears; steady orange at motion off), no wash, no sweep, in the fogged
// world layer like an enemy mine. It exists only while the buoy is in the
// view: the ring leaves with the marker.
//
// The ring's colour comes from the head table, never from a hue: it is a
// sight-only truth marker. Radar paints stay hue-free (DESIGN.md § Two sensor
// tiers) — nothing here touches the scope.
//
// The pure view-model (`ringModelFor`) is split from the Pixi glue
// (`drawBuoyRing`) so the colour/alpha/layer rules are tested without a
// renderer.

import type { Graphics } from 'pixi.js';
import { CONFIG, type DecoyView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01, dashArcs } from '../util/math.js';
import { settings } from '../settings/store.js';
import { alertClock, alertTint } from './alertBlend.js';
import { BUOY_HEADS } from './buoyMarks.js';

const K = CLIENT_CONFIG.buoyRing;

/** The colour an enemy ring's geometry is DRAWN in — white, so the alert blend
 *  applied as the sprite's tint lands exactly (the mines.ts idiom). */
export const ENEMY_RING_DRAW_COLOR = CLIENT_CONFIG.colors.white;

/** One buoy's effect ring, this frame. */
export interface BuoyRingModel {
  /** u — the ring's centre: the buoy. */
  x: number;
  y: number;
  /** u — `CONFIG.buoy.radiusU`, every kind. */
  radiusU: number;
  /** 0xRRGGBB — the kind's colour (own) or the current alert colour (enemy). */
  color: number;
  /** Interior wash alpha (0 = none). */
  fillAlpha: number;
  /** Stroke alpha. */
  alpha: number;
  dashed: true;
  /** Own = the fog-immune chart layer; enemy = the fogged world layer. */
  layer: 'chart' | 'world';
}

/**
 * Pure: the fraction of its LIFE an OWN buoy has left at `serverNow` —
 * `(until − serverNow) / CONFIG.buoy.lifetimeMs`, clamped to [0, 1]. `null`
 * for someone else's buoy or a view without `until`: an enemy buoy's timer is
 * never on the wire, and never drawn. (Lives here so the ring and the marker's
 * life arc — render/decoys.ts re-exports it — read one clock.)
 */
export function buoyLifeFrac(view: Pick<DecoyView, 'own' | 'until'>, serverNow: number): number | null {
  if (!view.own || view.until === undefined) return null;
  return clamp01((view.until - serverNow) / CONFIG.buoy.lifetimeMs);
}

/** Pure: the life share an own ring is drawn at (an own view without `until`
 *  draws at full — a missing clock is not an expired buoy). */
function lifeScale(view: DecoyView, serverNow: number): number {
  return buoyLifeFrac(view, serverNow) ?? 1;
}

/**
 * Pure: the ring a buoy view draws at `serverNow`, or null when it has no
 * finite position. `alert` is the current enemy alert colour (defaults to the
 * shared clock's tint at the player's motion setting).
 */
export function ringModelFor(
  view: DecoyView,
  serverNow: number,
  alert: number = alertTint(alertClock.phase, settings.current.motion),
): BuoyRingModel | null {
  if (!Number.isFinite(view.x) || !Number.isFinite(view.y)) return null;
  const base = { x: view.x, y: view.y, radiusU: CONFIG.buoy.radiusU, dashed: true as const };
  if (!view.own) return { ...base, color: alert, fillAlpha: 0, alpha: K.enemyAlpha, layer: 'world' };
  const life = lifeScale(view, serverNow);
  const wash = view.kind === 'radar' ? 0 : K.fillAlpha;
  return { ...base, color: BUOY_HEADS[view.kind].color, fillAlpha: wash * life, alpha: K.alpha * life, layer: 'chart' };
}

/**
 * Draw a ring model onto `g` in its LOCAL frame (the caller positions `g` at
 * the buoy), clearing prior geometry. `drawColor` is what the geometry is
 * stroked in — the model's colour for an own ring; white for an enemy ring,
 * whose alert colour is applied per frame as the sprite's tint.
 */
export function drawBuoyRing(g: Graphics, m: BuoyRingModel, drawColor: number): void {
  g.clear();
  if (m.fillAlpha > 0) g.circle(0, 0, m.radiusU).fill({ color: drawColor, alpha: m.fillAlpha });
  if (m.alpha <= 0) return;
  for (const [a0, a1] of dashArcs(K.dashSegments, K.dashDuty)) {
    g.moveTo(Math.cos(a0) * m.radiusU, Math.sin(a0) * m.radiusU);
    g.arc(0, 0, m.radiusU, a0, a1);
  }
  g.stroke({ width: 1, color: drawColor, alpha: m.alpha, pixelLine: true });
}
