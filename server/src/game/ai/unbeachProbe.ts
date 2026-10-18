// THE UN-BEACH PROBE (Story 9.13 fix wave P19 — the grounding investigation:
// MOONRAKER wedged 390 s in a concave notch, DOLDRUM and CROWSNEST pinned
// across a 64 u strait, all battleships, because the un-beach machine only
// ever ordered ASTERN, which is dead there. Orchestrator reading under epic-9
// amendment 192, with the 2026-10-17 rulings on the score and the probe span).
//
// Before a burst, each candidate order is ROLLED FORWARD on a copy of the
// hull's pose through the very functions the server and the client predictor
// step a hull with — shared stepShip, resolveShipPose and applyGroundingDamp —
// over the PUBLIC map's islands (pruned to the ones the hull can reach). The
// order that DISPLACES the hull furthest over the probe window wins (MOONRAKER:
// the freeing order moves 1.56 u in 40 ticks, every other ≤ 0.01 u — a
// heading-change term only rewarded wiggling against the rock, so there is
// none); ties break on the clearance the hull's vertices end with, then on the
// fixed order below. The first attempt rolls CONFIG.bots.unbeachProbeTicks (a
// slow 7 u / 61-tick exit must register), a retry
// CONFIG.bots.unbeachProbeRetryTicks. No world import, no rng, no clock: pure
// over the self-read and the map. Cost ≤ 5 × 60 resolves per burst start, and
// a burst starts at most once per CONFIG.bots.stuckMs.

import {
  CONFIG,
  applyGroundingDamp,
  hullSilhouette,
  nearestCoastPoint,
  polygonMaxRadius,
  resolveShipPose,
  stepShip,
  transformPolygon,
  type Island,
  type ShipInput,
  type ShipState,
  type Vec2,
} from '@salvo/shared';
import type { BotSelf, BotWorldPort } from './types.js';

/** u — islands whose bounding circle lies within the hull radius plus this of
 *  the hull are rolled against; a 3 s probe covers well under it. */
const PROBE_REACH_U = 200;

/** The candidate orders, in their fixed tie-break order. */
const ORDERS: readonly ShipInput[] = [
  { throttle: 1, rudder: -1 },
  { throttle: 1, rudder: 1 },
  { throttle: -1, rudder: -1 },
  { throttle: -1, rudder: 1 },
  { throttle: -1, rudder: 0 },
];

/** The probe's answer: the order to hold through the burst, the heading that
 *  order ends on (an ahead exit's hold line) and the displacement it was
 *  predicted to make. */
export interface ProbedExit {
  throttle: number;
  rudder: number;
  exitHeading: number;
  predictedU: number;
  /** True when every order had failed and the skip set started over. */
  reset: boolean;
}

interface Rolled {
  order: ShipInput;
  moved: number;
  end: ShipState;
}

/**
 * THE PROBED EXIT for a hull touching land: every candidate order rolled
 * forward `ticks` ticks, the furthest-displacing taken (the best of a bad set
 * when none clears — the burst is still attempted and judged afterwards).
 * `avoid` (the orders that already FAILED on this grounding) are skipped, so
 * a retry probes the rest instead of repeating a failure; when every order
 * has failed the set starts over (`reset`).
 */
export function probeExit(self: BotSelf, port: Pick<BotWorldPort, 'map'>, avoid: readonly ShipInput[], ticks: number, retry = false): ProbedExit {
  const skip = ORDERS.every((o) => isIn(o, avoid)) ? [] : avoid;
  return { ...bestOrder(self, port, skip, ticks, retry), reset: skip.length === 0 };
}

function isIn(o: ShipInput, set: readonly ShipInput[]): boolean {
  return set.some((a) => a.throttle === o.throttle && a.rudder === o.rudder);
}

function bestOrder(self: BotSelf, port: Pick<BotWorldPort, 'map'>, avoid: readonly ShipInput[], ticks: number, retry: boolean): Omit<ProbedExit, 'reset'> {
  const poly = hullSilhouette(self.hullId);
  const islands = nearbyIslands(self.state, port.map.islands, polygonMaxRadius(poly) + PROBE_REACH_U);
  let best: Rolled | null = null;
  for (const order of ORDERS) {
    if (isIn(order, avoid)) continue;
    const end = roll(self, order, islands, port.map.radius, poly, ticks);
    const cand = { order, moved: Math.hypot(end.x - self.state.x, end.y - self.state.y), end };
    if (best === null || (retry ? beatsOnClearance(cand, best, islands, poly) : beats(cand, best, islands, poly))) best = cand;
  }
  if (best === null) return { throttle: -1, rudder: 0, exitHeading: self.state.heading, predictedU: 0 };
  return { throttle: best.order.throttle, rudder: best.order.rudder, exitHeading: best.end.heading, predictedU: best.moved };
}

/** Does `a` beat the incumbent `b` (further displaced; on an exact tie, more
 *  end clearance; else the incumbent, which came first in ORDERS)? */
function beats(a: Rolled, b: Rolled, islands: readonly Island[], poly: readonly Vec2[]): boolean {
  if (a.moved !== b.moved) return a.moved > b.moved;
  return clearance(a.end, islands, poly) > clearance(b.end, islands, poly);
}

/** A RETRY's order of merit (orchestrator reading under amendment 192,
 *  2026-10-17): END CLEARANCE first — the order whose end pose is off the
 *  rock wins — then displacement, then the fixed order. */
function beatsOnClearance(a: Rolled, b: Rolled, islands: readonly Island[], poly: readonly Vec2[]): boolean {
  const ca = clearance(a.end, islands, poly);
  const cb = clearance(b.end, islands, poly);
  if (ca !== cb) return ca > cb;
  return a.moved > b.moved;
}

/** Roll one order forward on a copy of the pose — the server's per-tick
 *  motion: stepShip, then the land resolver, then the grounding damp. */
function roll(self: BotSelf, order: ShipInput, islands: readonly Island[], mapRadius: number, poly: readonly Vec2[], ticks: number): ShipState {
  const kin = self.stats.kinematics;
  const dt = CONFIG.tick.simDtMs / 1000;
  const s: ShipState = { x: self.state.x, y: self.state.y, heading: self.state.heading, speed: self.state.speed };
  const prev = { x: s.x, y: s.y, heading: s.heading };
  const scratch: Vec2[] = [];
  for (let k = 0; k < ticks; k += 1) {
    prev.x = s.x;
    prev.y = s.y;
    prev.heading = s.heading;
    stepShip(s, order, kin, dt);
    applyGroundingDamp(s, resolveShipPose(prev, s, islands, mapRadius, poly, scratch), kin.maxSpeed);
  }
  return s;
}

/** The islands whose bounding circle comes within `reach` of the hull. */
function nearbyIslands(p: Vec2, islands: readonly Island[], reach: number): Island[] {
  return islands.filter((isle) => Math.hypot(isle.x - p.x, isle.y - p.y) <= isle.r + reach);
}

/** u — the hull's closest vertex to any coast at a pose (Infinity with no
 *  island near). */
function clearance(s: ShipState, islands: readonly Island[], poly: readonly Vec2[]): number {
  let min = Infinity;
  for (const v of transformPolygon(poly, s.x, s.y, s.heading, [])) {
    for (const isle of islands) min = Math.min(min, nearestCoastPoint(v, isle).dist);
  }
  return min;
}
