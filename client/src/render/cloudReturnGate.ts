// THE CLOUD'S RADAR RETURN ROLLS PER REVOLUTION (Story 9.8 review gate, F1;
// Eric's ruling 123: "everything radar delivers rolls"). The server rolls a
// countermeasure cloud's RADAR delivery once per revolution of the observer's
// sweep (server/src/game/signals.ts `discRadarDetected`), but the client HOLDS
// every cloud it has been sent until the cloud dies (epic-9 amendments 51/52 —
// the grey haze and the wake mirror read that held set, and nothing here
// changes them). Painting the held copy into the radar heat grid on every
// later sweep would mean only a cloud's FIRST disclosure ever flickered.
//
// So the RADAR RETURN SOURCE alone is gated: a held cloud returns on the scope
// only while its delivery is fresh — delivered within the last revolution,
// plus a grace (`CLIENT_CONFIG.countermeasure.returnHoldRevs`, in revolutions).
// The row for this revolution's crossing arrives a beat AFTER the client's own
// beam has crossed the cloud (the frame trails the tick), so it is the
// PREVIOUS revolution's delivery that admits this pass; a server MISS shows
// exactly one revolution late, and the cloud then stays dark on the scope
// until a row arrives again. A newly held cloud was delivered this instant, so
// it paints at once.
//
// SIGHT DELIVERS WITHOUT A ROLL: a cloud whose nearest rim is within the own
// sight range (the eye's reach — the server's `discSighted` clause) returns
// every pass, as before.

import { cloudOutlineRadius } from '@salvo/shared';

/** What the gate reads off one held cloud. `deliveredAt` = server time (ms) of
 *  the frame that last carried its row; absent = never gated (always fresh). */
export interface CloudReturnInfo {
  x: number;
  y: number;
  t0: number;
  deliveredAt?: number;
}

/** The observer side of the gate, fixed for one frame's march. */
export interface CloudReturnGate {
  own: { x: number; y: number };
  serverNow: number;
  /** The own effective sight range (u) — the radar's `sightHoleU`. */
  sightU: number;
  /** One sweep revolution (ms). */
  sweepPeriodMs: number;
  /** How many revolutions a radar delivery stays fresh (> 1, < 2). */
  holdRevs: number;
}

/** Pure: is the cloud's nearest rim within the own sight range right now? */
export function cloudSighted(c: CloudReturnInfo, g: CloudReturnGate): boolean {
  const d = Math.hypot(c.x - g.own.x, c.y - g.own.y);
  return d - cloudOutlineRadius(g.serverNow - c.t0) <= g.sightU;
}

/** Pure: does this held cloud return on the scope this frame? */
export function cloudReturns(c: CloudReturnInfo, g: CloudReturnGate): boolean {
  if (c.deliveredAt === undefined) return true;
  if (cloudSighted(c, g)) return true;
  return g.serverNow - c.deliveredAt < g.sweepPeriodMs * g.holdRevs;
}
