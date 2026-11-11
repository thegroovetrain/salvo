// THE SOUND PASS'S EDGE DETECTORS (Story 10.13, wave B) — the pure decisions
// behind the four cues the game had no event for: a smoke cloud deployed, a
// beacon set surfacing, the own boost kicking in, a torpedo coming close. Each
// reads only state the client already holds and already DRAWS (the held cloud
// set, the beacon views, the own boost window, the projectiles it renders), so
// no cue tells the player anything the frame did not already show.
//
// THE RECONNECT RULE every detector shares: the FIRST observation after a
// (re)bind or a resume only SEEDS the memory. A cloud, beacon set or boost
// that already existed when we started watching is not an event we witnessed,
// so it makes no sound.
//
// Plus the own-hit level map (`ownHitGain`). No AudioContext here.

/** The smoke detector's memory: ids already heard, or null before the first frame. */
export interface CloudCueState {
  seen: Set<string> | null;
}

export const freshCloudCueState = (): CloudCueState => ({ seen: null });

/** A held cloud's identity, birth and position (`HeldCloud` is wider). */
export interface CloudLike {
  id: string;
  x: number;
  y: number;
  t0: number;
}

/**
 * Pure-ish (mutates `state`): the clouds that just DEPLOYED — ids entering the
 * held set this frame whose birth `t0` is within `freshMs` of the frame time.
 * Fires once per id; the first observation only seeds (the reconnect rule);
 * a cloud first painted long after it was laid is old news, not a deploy.
 * Ids that left the held set are forgotten (they cannot come back: a dead
 * cloud stays dead).
 */
export function newClouds<C extends CloudLike>(state: CloudCueState, clouds: readonly C[], t: number, freshMs: number): C[] {
  const prev = state.seen;
  const now = new Set(clouds.map((c) => c.id));
  state.seen = now;
  if (prev === null) return [];
  return clouds.filter((c) => !prev.has(c.id) && Number.isFinite(c.t0) && t - c.t0 <= freshMs);
}

/** The beacon detector's memory: the set (cycle) last seen not yet afloat,
 *  and the last set already heard surfacing. */
export interface BeaconCueState {
  /** Cycle we have seen in a pre-afloat phase (charted), else null. */
  armed: number | null;
  /** Cycle whose surfacing already sounded (or was first seen afloat). */
  heard: number | null;
}

export const freshBeaconCueState = (): BeaconCueState => ({ armed: null, heard: null });

/**
 * Pure-ish (mutates `state`): did a NEW set of beacons just surface? `cycle` is
 * the set's identity (`beaconCycle`, -1 / non-finite = no set); `afloat` says
 * whether any beacon of it is afloat this frame. Fires ONCE per set, and only
 * for a set we watched before it surfaced: a set first seen already afloat
 * (joining or resuming mid-set) is marked heard without a sound.
 */
export function beaconSurfaced(state: BeaconCueState, cycle: number | undefined, afloat: boolean): boolean {
  if (cycle === undefined || !Number.isFinite(cycle) || cycle < 0) return false;
  if (state.heard === cycle) return false;
  if (!afloat) {
    state.armed = cycle;
    return false;
  }
  const fire = state.armed === cycle;
  state.heard = cycle;
  state.armed = null;
  return fire;
}

/**
 * Pure: the own boost's rising edge. `prev` null = not watching (no live hull,
 * or the first frame) — that frame only seeds, so a boost already running when
 * we start watching makes no surge.
 */
export function boostRose(prev: boolean | null, now: boolean): boolean {
  return prev === false && now;
}

/** The torpedo-hum memory: ids already heard (never re-armed). */
export interface TorpedoHumState {
  heard: Set<string>;
}

export const freshTorpedoHumState = (): TorpedoHumState => ({ heard: new Set() });

/** A drawn ballistic: its id, wire kind and current position. */
export interface DrawnBallistic {
  id: string;
  kind: string;
  x: number;
  y: number;
}

/**
 * Pure-ish (mutates `state`): the drawn torpedoes that came within `radiusU`
 * of the listener for the FIRST time this frame. Once per id, never re-armed;
 * anything that is not a torpedo, and any junk position, is ignored. A heard
 * id is remembered for the life of the state (a torpedo that leaves the drawn
 * set and is re-revealed does not hum again); the owner starts a fresh state
 * per game, and a match holds at most a few hundred torpedo ids.
 */
export function torpedoesClose(
  state: TorpedoHumState,
  drawn: readonly DrawnBallistic[],
  listener: { x: number; y: number },
  radiusU: number,
): DrawnBallistic[] {
  const out: DrawnBallistic[] = [];
  if (!Number.isFinite(listener.x) || !Number.isFinite(listener.y) || !(radiusU > 0)) return out;
  const r2 = radiusU * radiusU;
  for (const b of drawn) {
    if (b.kind !== 'torp' || state.heard.has(b.id)) continue;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const dx = b.x - listener.x;
    const dy = b.y - listener.y;
    if (dx * dx + dy * dy > r2) continue;
    state.heard.add(b.id);
    out.push(b);
  }
  return out;
}

/**
 * Pure: the own-hit cue's level for a frame's summed own damage. Linear from
 * `minGain` (any hit at all) to 1 at `fullHp`, clamped; monotone in `hp`.
 * Junk or non-positive damage plays at `minGain` (a hit happened — the cue is
 * gated on the event, never on the amount).
 */
export function ownHitGain(hp: number, fullHp: number, minGain: number): number {
  const floor = Number.isFinite(minGain) ? Math.max(0, Math.min(1, minGain)) : 1;
  if (!Number.isFinite(hp) || hp <= 0 || !(fullHp > 0)) return floor;
  return floor + (1 - floor) * Math.min(1, hp / fullHp);
}
