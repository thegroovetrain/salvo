// THE RADIO BEACONS, CLIENT SIDE (Story 10.8, Eric rulings R1–R13, epic-10
// amendment 14) — the pure derivation of this frame's beacon set from the
// polled room schema, and the immovable contact bodies the predictor pushes the
// own hull against.
//
// THE WIRE CARRIES ONLY PUBLIC FACTS (R9): the set's ring cycle
// (`beaconCycle`, -1 = none), how many slots are live (`beaconCount`), each
// slot's position (`bcnNX` / `bcnNY`) and its EARLY sink stamp (`bcnNSinkT`,
// 0 = the natural schedule). Everything else — phase, rate, sink progress,
// solidity, the body polygon — is DERIVED here from the SHARED pure module
// (`shared/src/sim/beacons.ts`) against the zone clock (`zoneStartT`), the same
// functions the server's payout, damage gate and contact pass read. Nothing is
// re-derived ad hoc, so the chart, the water and the hull pass cannot disagree
// with the server about when a beacon is in the water.
//
// STALE-BOUNDARY CARE (the `zoneViewFrom` discipline): a slot at or past
// `beaconCount` is stale and never read; a missing field (an older server, a
// not-yet-synced state) yields an EMPTY list, never a NaN sprite; a
// non-finite coordinate drops that slot; and a set whose cycle the zone clock
// has already left is dropped whole — the explicit cycle exists so a client
// can never pair an old cycle's positions with a new cycle's clock. A beacon
// whose derived phase is `gone` is not returned (gone = removed).
//
// HP is NOT on the wire and never will be (R11): damage shows only through the
// anonymous smoke/fire rows render/smoke.ts and render/fire.ts already draw.

import {
  CONFIG,
  beaconCycleAt,
  beaconCycleStartMs,
  beaconPolygon,
  beaconSolid,
  beaconStateAt,
  type BeaconPhase,
  type ContactBody,
} from '@salvo/shared';

/** The wire's slot count: the largest per-cycle beacon count (the schema
 *  carries one flat field triple per slot). */
export const BEACON_SLOTS = Math.max(0, ...CONFIG.beacons.counts);

/** A per-slot schema field name (`bcn0X` … `bcn7SinkT`). */
type SlotField = `bcn${number}${'X' | 'Y' | 'SinkT'}`;

/** The beacon fields of the public room schema this derivation consumes. */
export interface BeaconPlane {
  zoneStartT?: number;
  beaconCycle?: number;
  beaconCount?: number;
  readonly [field: SlotField]: number | undefined;
}

/** One live beacon this frame — public facts plus the shared lifecycle. */
export interface BeaconView {
  /** The wire slot (0-based) — the stable sprite / body key for the cycle. */
  slot: number;
  x: number;
  y: number;
  phase: BeaconPhase;
  /** 0..1 — payout rate's fraction of full (shared `beaconStateAt`). */
  rate01: number;
  /** 0..1 — progress through the sink (shared `beaconStateAt`). */
  sink01: number;
  /** The server's early sink stamp (0 = the natural schedule). */
  sinkT: number;
}

/** The field names per slot, built once — no per-frame string building. */
const KEYS: readonly { x: SlotField; y: SlotField; sinkT: SlotField }[] = Array.from(
  { length: BEACON_SLOTS },
  (_, i) => ({ x: `bcn${i}X`, y: `bcn${i}Y`, sinkT: `bcn${i}SinkT` }),
);

/** Pure: the live slot count — 0 for a missing, negative or non-integer
 *  count; clamped to the wire's slot count. */
function liveCount(s: BeaconPlane): number {
  const n = s.beaconCount;
  if (n === undefined || !Number.isInteger(n) || n <= 0) return 0;
  return Math.min(n, BEACON_SLOTS);
}

/**
 * Pure: the ms the set's cycle began, or null when the set must not render —
 * no set (cycle -1 / missing / malformed), no zone clock, or a set the zone
 * clock has already left (the stale boundary: the server's patch clearing or
 * replacing it has not landed yet).
 */
function setStartMs(s: BeaconPlane, now: number): number | null {
  const cycle = s.beaconCycle;
  const zoneStartT = s.zoneStartT;
  if (cycle === undefined || !Number.isInteger(cycle) || cycle < 0) return null;
  if (zoneStartT === undefined || !Number.isFinite(zoneStartT) || zoneStartT <= 0) return null;
  if (beaconCycleAt(now, zoneStartT) > cycle) return null;
  const start = beaconCycleStartMs(zoneStartT, cycle);
  return Number.isFinite(start) ? start : null;
}

/** Pure: a wire sink stamp as a number the shared lifecycle can take (an
 *  absent or non-finite stamp reads as the natural schedule, 0). */
function sinkStamp(v: number | undefined): number {
  return v !== undefined && Number.isFinite(v) ? v : 0;
}

/** Fill `out[k]` (reused in place) from slot `slot`; false when the slot's
 *  coordinates are unusable or the beacon is gone. */
function readSlot(s: BeaconPlane, slot: number, start: number, now: number, out: BeaconView): boolean {
  const k = KEYS[slot];
  const x = s[k.x];
  const y = s[k.y];
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const sinkT = sinkStamp(s[k.sinkT]);
  const st = beaconStateAt(now, start, sinkT);
  if (st.phase === 'gone') return false;
  out.slot = slot;
  out.x = x;
  out.y = y;
  out.phase = st.phase;
  out.rate01 = st.rate01;
  out.sink01 = st.sink01;
  out.sinkT = sinkT;
  return true;
}

/**
 * This frame's live beacons at `now` (the server-clock estimate). `out` is
 * caller-owned scratch: the array and its view objects are reused, so a
 * per-frame call allocates nothing after the first.
 */
export function beaconViewsFrom(s: BeaconPlane, now: number, out: BeaconView[] = []): BeaconView[] {
  const start = setStartMs(s, now);
  const count = start === null ? 0 : liveCount(s);
  let n = 0;
  for (let slot = 0; slot < count; slot++) {
    const v = out[n] ?? (out[n] = { slot: 0, x: 0, y: 0, phase: 'charted', rate01: 0, sink01: 0, sinkT: 0 });
    if (readSlot(s, slot, start as number, now, v)) n++;
  }
  out.length = n;
  return out;
}

/** The contact-body id prefix of a beacon (client-local: the rows never leave
 *  the predictor; no session id can start with it). */
const BODY_ID_PREFIX = 'beacon:';

/** True iff a hull-pass row id names a beacon body (not a contact hull). */
export function isBeaconBodyId(id: string): boolean {
  return id.startsWith(BODY_ID_PREFIX);
}

/**
 * THE BEACONS IN THE PREDICTOR'S HULL PASS — one IMMOVABLE body per SOLID
 * beacon (afloat or sinking, R12's wreck law), shaped by the shared
 * `beaconPolygon`, mass = the beacon's ARMOR (R7: mass = ARMOR) — the same body
 * the server's hull row adds (shared sim/contact.ts: an immovable body takes
 * no share of the separation; the hull takes it all). One body per slot,
 * reused frame to frame; the returned list is reused too.
 */
export class BeaconBodies {
  private readonly bySlot: ContactBody[] = [];
  private readonly list: ContactBody[] = [];

  /** This frame's solid beacon bodies (posed at their fixed centres). */
  build(views: readonly BeaconView[]): readonly ContactBody[] {
    this.list.length = 0;
    for (const v of views) {
      if (!beaconSolid(v.phase)) continue;
      const body = this.bodyFor(v.slot);
      body.state.x = v.x;
      body.state.y = v.y;
      beaconPolygon(v.x, v.y, CONFIG.beacons, body.poly);
      this.list.push(body);
    }
    return this.list;
  }

  private bodyFor(slot: number): ContactBody {
    let body = this.bySlot[slot];
    if (body === undefined) {
      body = {
        id: `${BODY_ID_PREFIX}${slot}`,
        state: { x: 0, y: 0, heading: 0, speed: 0 },
        poly: [],
        mass: CONFIG.beacons.armor,
        movable: false,
      };
      this.bySlot[slot] = body;
    }
    return body;
  }
}
