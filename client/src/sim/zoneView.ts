// Pure derivation of the client's live zone view from the polled room schema
// (Story 3.1 interim adaptation). Phase and the LIVE ring derive locally from
// the schema's revealed rings + zoneStartT + CONFIG via the SHARED
// zoneLiveState (see ArenaState's JSDoc) so the ring is smooth at 60fps — the
// same math the server runs, no fork. Real clients never see a zoneOverride,
// so CONFIG matches the server. Extracted from main.ts so the stale-boundary
// guard below is unit-testable without Pixi.

import { CONFIG, zoneLiveState, type ZonePhase, type ZoneRing } from '@salvo/shared';

/** The zone fields of the public room schema this derivation consumes. */
export interface ZonePlane {
  zoneState?: string;
  zoneStartT?: number;
  zoneCurCx?: number;
  zoneCurCy?: number;
  zoneCurR?: number;
  zoneNextCx?: number;
  zoneNextCy?: number;
  zoneNextR?: number;
}

/** Live ring + phase, derived locally from the schema's revealed zone plane. */
export interface ZoneView {
  state: ZonePhase;
  cur: ZoneRing; // the LIVE ring (offset center; interpolated while closing)
  next: ZoneRing | null; // the revealed next ring (reveal beat onward)
  startT: number; // server ms the timeline was anchored at
  closesInMs: number; // to the next close start (pre-close) / close end (closing)
}

/** The schema's revealed ring prefix: ring g as of the last boundary (always),
 *  and the revealed next ring — r === 0 means "unrevealed" (a real ring's
 *  radius is structurally >= 1u), matching the server's zeroed mirror. */
function schemaRings(s: ZonePlane, mapRadius: number): { cur: ZoneRing; next: ZoneRing | null } {
  const cur: ZoneRing = { cx: s.zoneCurCx ?? 0, cy: s.zoneCurCy ?? 0, r: s.zoneCurR || mapRadius };
  const nextR = s.zoneNextR ?? 0;
  const next: ZoneRing | null = nextR > 0 ? { cx: s.zoneNextCx ?? 0, cy: s.zoneNextCy ?? 0, r: nextR } : null;
  return { cur, next };
}

/** Derive the live zone view for `now` (the server-clock estimate). */
export function zoneViewFrom(s: ZonePlane, mapRadius: number, now: number): ZoneView {
  const startT = s.zoneStartT ?? 0;
  if ((s.zoneState ?? 'idle') === 'idle') {
    return { state: 'idle', cur: { cx: 0, cy: 0, r: mapRadius }, next: null, startT, closesInMs: 0 };
  }
  const { cur, next } = schemaRings(s, mapRadius);
  let live = zoneLiveState(now, startT, cur, next, CONFIG.zone);
  // STALE-BOUNDARY GUARD (review FIX 1): when the local clock crosses a close
  // completion BEFORE the schema patch promoting ring g+1 lands, the derived
  // phase reads 'clear' (new group) while the schema still carries the OLD
  // pair — cur = ring g, next = the ring that just became current. Feeding
  // that stale cur to zoneLiveState pops the ring back OUT for a latency
  // window (inStorm falsely clears, the storm audio edge re-fires on the
  // snap-in). During a REAL clear beat the schema's next is zeroed, so a
  // non-null next here is definitionally the stale window: the revealed next
  // IS ring g+1 — treat it as current. (Final closure needs no guard:
  // zoneLiveState's closed branch already prefers `next ?? current`.)
  if (live.phase === 'clear' && next !== null) {
    live = zoneLiveState(now, startT, next, null, CONFIG.zone);
  }
  return { state: live.phase, cur: live.current, next: live.next, startT, closesInMs: live.closesInMs };
}
