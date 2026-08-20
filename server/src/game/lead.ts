// THE LEAD SOLVE — one intercept solver, shared by everything on the server
// that has to shoot at a moving hull.
//
// Extracted verbatim (Story 7-5 wave 2) from FleetController.aimPoint, which
// was its only implementation and is now its first caller; the CAPTIVE MINE's
// torpedo (equipment/mines.ts, R2.12 — "fired with intelligent lead") is the
// second. Two copies of an intercept solver is exactly the kind of quiet
// divergence this codebase spends its structure avoiding, and the fish needs the
// same answer the fleet gun already computes.
//
// Fixed point rather than the closed-form quadratic on purpose: three passes is
// far past convergence at these speeds (ordnance 60-500 u/s against hulls
// capped near 45 u/s), it degrades gracefully when no intercept exists rather
// than returning a negative root, and it is the behaviour already shipped and
// tuned. Pure over plain numbers — no ShipRecord, no World, no I/O — so the
// value can be tested and reused anywhere.
//
// NOT USED BY `game/ai/` (deliberately): the bot solver in ai/tactics.ts works
// on a BotTrack whose heading/speed may be UNDISCLOSED, which is a different
// question with a different degenerate case ("a plot that cannot be led at
// all"), and ai/ is import-fenced away from the rest of game/ by design.

import type { Vec2 } from '@salvo/shared';

/** Fixed-point iterations for the lead solution (converges well inside 3). */
export const LEAD_ITERATIONS = 3;

/**
 * Where to aim so ordnance travelling at `speed` u/s from `from` meets a target
 * currently at `target` moving at (`vx`, `vy`) u/s. A non-positive or
 * non-finite `speed` cannot intercept anything, so the target's CURRENT point
 * is returned — a stationary shot at a moving hull, never a NaN.
 */
export function leadIntercept(from: Vec2, target: Vec2, vx: number, vy: number, speed: number): Vec2 {
  if (!(speed > 0) || !Number.isFinite(speed)) return { x: target.x, y: target.y };
  let t = 0;
  for (let i = 0; i < LEAD_ITERATIONS; i += 1) {
    const px = target.x + vx * t;
    const py = target.y + vy * t;
    t = Math.hypot(px - from.x, py - from.y) / speed;
  }
  return { x: target.x + vx * t, y: target.y + vy * t };
}
