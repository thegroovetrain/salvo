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

/** Forget the seed: the next frame only seeds (a reconnect, review P5). */
export function unseedClouds(state: CloudCueState): void {
  state.seen = null;
}

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
 * whether any beacon of it is afloat this frame, or NULL when there is no
 * beacon data at all this frame (an unsynced schema — review P14: no data must
 * never arm a set). Fires ONCE per set, and only for a set we watched before
 * it surfaced: a set first seen already afloat (joining or resuming mid-set)
 * is marked heard without a sound.
 */
export function beaconSurfaced(state: BeaconCueState, cycle: number | undefined, afloat: boolean | null): boolean {
  if (afloat === null || cycle === undefined || !Number.isFinite(cycle) || cycle < 0) return false;
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

/** Where the player listens from — the hum re-seeds when this changes. */
export type ListenerKind = 'own' | 'camera';

/** The torpedo-hum memory: ids already heard (never re-armed), and the
 *  listener the memory was seeded for (null = not seeded yet). */
export interface TorpedoHumState {
  heard: Set<string>;
  seededFor: ListenerKind | null;
}

export const freshTorpedoHumState = (): TorpedoHumState => ({ heard: new Set(), seededFor: null });

/** Forget the seed: the next frame only seeds (a resume, a reconnect). */
export function unseedTorpedoHum(state: TorpedoHumState): void {
  state.seededFor = null;
}

/** A drawn ballistic: its id, wire kind, current position, and whether it is
 *  the player's own (the hum's family, review P3c). */
export interface DrawnBallistic {
  id: string;
  kind: string;
  x: number;
  y: number;
  own?: boolean;
}

/** The drawn torpedoes inside `radiusU` of the listener (junk ignored). */
function torpedoesInside(drawn: readonly DrawnBallistic[], listener: { x: number; y: number }, radiusU: number): DrawnBallistic[] {
  if (!Number.isFinite(listener.x) || !Number.isFinite(listener.y) || !(radiusU > 0)) return [];
  const r2 = radiusU * radiusU;
  return drawn.filter((b) => {
    if (b.kind !== 'torp' || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
    const dx = b.x - listener.x;
    const dy = b.y - listener.y;
    return dx * dx + dy * dy <= r2;
  });
}

/**
 * Pure-ish (mutates `state`): the drawn torpedoes inside `radiusU` of the
 * listener that have not hummed yet — CANDIDATES only: the caller marks an id
 * heard (`markHumHeard`) only once its hum actually played, so a hum a cap
 * dropped is retried while the torpedo is still inside (review P3b).
 *
 * THE SEED (review P3a): the first frame — and the first frame after the
 * LISTENER changes kind (own hull ↔ camera: a death, a spectate jump) — only
 * marks every torpedo already inside as heard and returns nothing, so a join,
 * a refresh-resume or a camera jump never hums at torpedoes it did not watch
 * come close. Anything that is not a torpedo, and any junk position, is ignored.
 */
export function torpedoHumCandidates(
  state: TorpedoHumState,
  drawn: readonly DrawnBallistic[],
  listener: { x: number; y: number },
  radiusU: number,
  kind: ListenerKind,
): DrawnBallistic[] {
  const inside = torpedoesInside(drawn, listener, radiusU);
  if (state.seededFor !== kind) {
    state.seededFor = kind;
    for (const b of inside) state.heard.add(b.id);
    return [];
  }
  return inside.filter((b) => !state.heard.has(b.id));
}

/** Mark a torpedo's hum as heard (it played) — never again for this id. */
export function markHumHeard(state: TorpedoHumState, id: string): void {
  state.heard.add(id);
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
