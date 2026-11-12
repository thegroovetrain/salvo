// THE TORPEDO LAUNCHERS — deck mounts that aim like turrets, each tube on its
// own reload clock (Story 10.6, Eric 2026-11-05, R6 / R13 / R14 / R16, epic-10
// amendment 12).
//
// WHAT A SHIP HOLDS. A ship holding ANY torpedo (light, heavy,
// supercavitating — one kind per slot) has `stats.torpedoLaunchers` launchers:
//
//     index 0  FORE — rests dead ahead   (rest 0)
//     index 1  AFT  — rests dead astern  (rest π; AFT TORPEDO LAUNCHER)
//
// each with `stats.tubesPerLauncher` tubes (SECOND LAUNCHER TUBE: +1 on every
// launcher held). Stations are per hull, on the centerline
// (`CONFIG.shipClasses.<id>.launchers`); a hull with none mounts
// ZERO launchers and every function degrades to the empty answer.
//
// AIMING IS THE TURRETS' (R6: "they work the same way in terms of aiming and
// such"). The machinery is sim/mountAim.ts, shared with sim/turrets.ts. NO
// TRAVERSE (Eric 2026-11-12, Story 11.1, R11 / R16 — point and shoot; the
// launchers' borrowed `CONFIG.mainBattery.traverseDegPerS` / `onTargetDeg`
// retired with the turrets'): a launcher's angle is DERIVED
// (`launcherAngle`) — at the aim point while the aim lies inside its FIRING
// BAND, at rest otherwise — and a launcher fires only inside its band, at the
// aim point exactly.
//
// SIDE-FIRING (R28, Eric 2026-11-06 — supersedes R6's "140° to either side").
// A launcher FIRES only inside its FIRING BAND: from its `deadDeg` to its
// `trainDeg` off its own end (fore from dead ahead, aft from dead astern), on
// both sides. Inside `deadDeg` of rest it never fires (and rests). THE BAND
// IS PER HULL AND PER LAUNCHER (R30, Eric 2026-11-06):
// `CONFIG.shipClasses.<id>.launchers.{fore,aft}.{deadDeg,trainDeg}` — one
// source, no global. The angle `a` follows turrets.ts's
// convention: radians, hull-relative, counter-clockwise positive, UNWRAPPED in
// `[rest − train, rest + train]`; the world bearing is `pose.heading + a`.
//
// THE STATE is `LauncherState[]` — per launcher `{ a, tubes }`, `a` = the
// derived angle as of the last step with an aim, `tubes[k]` = ms until tube
// `k` is loaded again (0 = loaded). It is the server's record,
// the client's predicted copy AND the `OwnShip.launchers` wire shape, exactly
// as `TurretState[]` is for the battery, so the client's correction is a plain
// overwrite (`copyLaunchers`). MUTATED IN PLACE on the tick path.
//
// THE AIM POINT (`launcherAimPoint`). A torpedo has no reach, so only the
// BEARING of the cursor matters — but each launcher measures that bearing from
// its OWN station, which is ill-defined for a cursor on the own deck. So the
// launchers read the cursor's point with its distance from the ship centre
// FLOORED at one hull length (every station is within half a length of the
// centre, so the floored point is outside the hull and at least half a length
// from every station): a close-in cursor keeps its bearing from the centre and
// is simply read as "that way". NO AIM (a zero / non-finite distance, the
// neutral input) is `null`, the same test as `batteryAimPoint`: the launchers
// keep their angles exactly when the turrets do, and a click with no aim is
// refused `out-of-arc` (it names no area).
//
// THE PICK (R16, verbatim: "if the tube CANNOT POSSIBLY point at the aimed
// area, it doesn't fire no matter what"; R28; no traverse since Story 11.1).
// `pickTube` is pure:
//   - no launcher's firing band holds the aim point → `out-of-arc`, nothing
//     spent;
//   - among the launchers whose band holds it AND that have a loaded tube, the
//     LOWEST INDEX (fore first) fires at the aim point exactly; its
//     lowest-index loaded tube is the one;
//   - a band holds it but every such launcher is reloading → `cooling` — the
//     turrets' "cannot fire yet" denial.
// One click, one torpedo: the caller fires the pick with `fireTube` and spawns
// at `torpedoLaunchPoint(pick.station, pose, hullId, pick.bearing)`.
//
// Pure, zero I/O, no randomness.

import { CONFIG, hullEnvelope, type HullId, type HullLauncher } from '../constants.js';
import { wrapAngle } from '../math/angle.js';
import type { Vec2 } from '../math/vec.js';
import { muzzleSpawnFrom, type AimPose } from './aim.js';
import type { ArcShape } from './arcs.js';
import {
  ARC_EPS,
  clampOffset,
  decodeMountAngle,
  encodeMountAngle,
  mountBearingOffset,
  mountStationWorld,
  type TrainedMount,
} from './mountAim.js';

const RAD_PER_DEG = Math.PI / 180;

/** The most launchers a hull can mount: the fore and the aft station. */
export const MAX_LAUNCHERS = 2;

/** The most tubes one launcher can hold (a count above it is clamped, never looped to). */
export const MAX_TUBES_PER_LAUNCHER = 2;

/** One launcher's runtime state (also the `OwnShip.launchers` wire entry). */
export interface LauncherState {
  /** rad — hull-relative, unwrapped, inside the launcher's train interval: the DERIVED angle (`launcherAngle`) as of the last step with an aim (see the header). */
  a: number;
  /** Per tube: ms until it is loaded again (0 = loaded). */
  tubes: number[];
}

/** The two folded counts the model reads — `EffectiveStats` satisfies it. */
export interface LauncherCounts {
  /** 1 (fore) | 2 (+ aft). */
  torpedoLaunchers: number;
  /** 1 | 2, on every launcher. */
  tubesPerLauncher: number;
}

/** Launcher `i`'s CONFIG row on `hullId` (0 fore, else aft), or `undefined` on a hull with no launchers. */
function launcherRow(hullId: HullId, i: number): HullLauncher | undefined {
  const l = hullEnvelope(hullId).launchers;
  if (l === undefined) return undefined;
  return i === 0 ? l.fore : l.aft;
}

/** rad — launcher `i`'s train limit either side of its rest bearing on `hullId` (R30); 0 on a hull with no launchers. */
export function launcherTrainRad(hullId: HullId, i: number): number {
  return (launcherRow(hullId, i)?.trainDeg ?? 0) * RAD_PER_DEG;
}

/** rad — launcher `i`'s dead half-wedge about its rest bearing on `hullId` (R28 / R30): it never fires inside it. */
export function launcherDeadRad(hullId: HullId, i: number): number {
  return (launcherRow(hullId, i)?.deadDeg ?? 0) * RAD_PER_DEG;
}

/** True iff an offset from launcher `i`'s REST bearing lies in its firing band on `hullId` (its `deadDeg` ≤ |offset| ≤ its `trainDeg`, R28 / R30). Never on a hull with no launchers. */
export function inFiringBand(hullId: HullId, i: number, offset: number): boolean {
  if (launcherRow(hullId, i) === undefined) return false;
  const m = Math.abs(offset);
  return m >= launcherDeadRad(hullId, i) - ARC_EPS && m <= launcherTrainRad(hullId, i) + ARC_EPS;
}

/** rad — launcher `i`'s REST bearing in the hull frame: 0 (dead ahead) for the fore launcher, π for the aft. */
export function launcherRest(i: number): number {
  return i === 0 ? 0 : Math.PI;
}

/** How many launchers a hull can mount at all: `MAX_LAUNCHERS` on a hull with stations, 0 on one without. */
function stationsOn(hullId: HullId): number {
  return hullEnvelope(hullId).launchers === undefined ? 0 : MAX_LAUNCHERS;
}

/** A whole count in [lo, hi] (non-finite → lo). */
const wholeIn = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo);

/** The launchers this hull mounts for these counts (0 on a hull with no stations). */
export function launcherCount(hullId: HullId, counts: LauncherCounts): number {
  return Math.min(stationsOn(hullId), wholeIn(counts.torpedoLaunchers, 1, MAX_LAUNCHERS));
}

/**
 * Launcher `i`'s station in the hull's LOCAL frame (origin at the ship
 * position, bow along +x), on the centerline. `{0, 0}` for a hull with no
 * launcher stations.
 */
export function launcherStation(hullId: HullId, i: number): Vec2 {
  const row = launcherRow(hullId, i);
  if (row === undefined) return { x: 0, y: 0 };
  return { x: (0.5 - row.frac) * hullEnvelope(hullId).hull.length, y: 0 };
}

/** Launcher `i`'s station in WORLD space for a ship pose. */
export function launcherStationWorld(hullId: HullId, i: number, pose: AimPose): Vec2 {
  return mountStationWorld(launcherStation(hullId, i).x, pose);
}

/** Launcher `i` as a trained mount (sim/mountAim.ts). */
function trained(hullId: HullId, i: number): TrainedMount {
  return { x: launcherStation(hullId, i).x, rest: launcherRest(i), train: launcherTrainRad(hullId, i) };
}

// --- Lifecycle ----------------------------------------------------------------

/** The launchers a ship gets when its torpedo slot fills: at rest, EVERY TUBE LOADED (I3). */
export function initialLaunchers(hullId: HullId, counts: LauncherCounts): LauncherState[] {
  return resizeLaunchers([], hullId, counts);
}

/**
 * Bring `states` to the folded counts IN PLACE — call after any card. A NEW
 * launcher arrives at rest with every tube loaded; a NEW tube arrives loaded
 * (I3); every existing angle and running clock is untouched. Counts never
 * shrink in play; a smaller count (a reset) truncates. Returns `states`.
 */
export function resizeLaunchers(states: LauncherState[], hullId: HullId, counts: LauncherCounts): LauncherState[] {
  const n = launcherCount(hullId, counts);
  const tubes = wholeIn(counts.tubesPerLauncher, 1, MAX_TUBES_PER_LAUNCHER);
  states.length = Math.min(states.length, n);
  for (let i = 0; i < n; i += 1) {
    const st = states[i] ?? (states[i] = { a: launcherRest(i), tubes: [] });
    st.tubes.length = Math.min(st.tubes.length, tubes);
    while (st.tubes.length < tubes) st.tubes.push(0);
  }
  return states;
}

/** Overwrite `into` with `from` (resizing it, sharing no array) — the client's correction from the wire. */
export function copyLaunchers(into: LauncherState[], from: readonly LauncherState[]): LauncherState[] {
  into.length = from.length;
  for (let i = 0; i < from.length; i += 1) {
    const src = from[i];
    const dst = into[i] ?? (into[i] = { a: 0, tubes: [] });
    dst.a = src.a;
    dst.tubes.length = src.tubes.length;
    for (let k = 0; k < src.tubes.length; k += 1) dst.tubes[k] = src.tubes[k];
  }
  return into;
}

/**
 * MID-RELOAD RESCALE (the 2026-08-04 progress-fraction rule): when the folded
 * torpedo `reloadMs` changes, call with `ratio = newMs / oldMs`. Every RUNNING
 * tube clock is scaled, so its progress fraction survives; a loaded tube (0)
 * has nothing in flight. A ratio that is not a positive finite number is a
 * no-op.
 */
export function rescaleTubeReloads(states: LauncherState[], ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  for (const st of states) {
    for (let k = 0; k < st.tubes.length; k += 1) {
      if (st.tubes[k] > 0) st.tubes[k] *= ratio;
    }
  }
}

/** INSTANT RELOAD (R14): every tube on every launcher is loaded now. Angles are untouched. */
export function reloadAllTubes(states: LauncherState[]): void {
  for (const st of states) st.tubes.fill(0);
}

/** Start tube `tube` of launcher `launcher` reloading — call once when it fires. `reloadMs` is the held torpedo's FOLDED reload. */
export function fireTube(states: LauncherState[], launcher: number, tube: number, reloadMs: number): void {
  const st = states[launcher];
  if (st !== undefined && tube >= 0 && tube < st.tubes.length) st.tubes[tube] = reloadMs;
}

/**
 * THE HOTBAR SUMMARY — the `{ n, reloadMsLeft }` pair the torpedo slot's
 * `EquipmentState` / `OwnShip.ammo[slot]` carries (the `batterySummary`
 * shape): `n` = tubes LOADED across every launcher, `reloadMsLeft` = the
 * SOONEST remaining reload among the tubes still reloading (0 when all are
 * loaded).
 */
export function launcherSummary(states: readonly LauncherState[]): { n: number; reloadMsLeft: number } {
  let n = 0;
  let soonest = Infinity;
  for (const st of states) {
    for (const t of st.tubes) {
      if (t <= 0) n += 1;
      else if (t < soonest) soonest = t;
    }
  }
  return { n, reloadMsLeft: Number.isFinite(soonest) ? soonest : 0 };
}

// --- Aiming -------------------------------------------------------------------

/**
 * THE LAUNCHERS' AIM POINT for an input, or `null` for NO AIM — the ONE call
 * both sides make to turn `InputMsg.aim` / `aimDist` into what `stepLaunchers`
 * and `pickTube` take (see the header). `null` on exactly `batteryAimPoint`'s
 * test; otherwise the point `max(aimDist, hull length)` along `aim` from the
 * ship centre.
 */
export function launcherAimPoint(pose: AimPose, hullId: HullId, aim: number, aimDist: number): Vec2 | null {
  if (!Number.isFinite(aimDist) || aimDist <= 0 || !Number.isFinite(aim)) return null;
  const d = Math.max(aimDist, hullEnvelope(hullId).hull.length);
  return { x: pose.x + Math.cos(aim) * d, y: pose.y + Math.sin(aim) * d };
}

/** rad — the aim point's offset from launcher `i`'s rest, from its own station, or `null` when it lies outside its train interval or on the station. */
function aimOffset(hullId: HullId, i: number, pose: AimPose, aim: Vec2): number | null {
  const m = trained(hullId, i);
  return mountBearingOffset(m, mountStationWorld(m.x, pose), pose, aim);
}

/** True iff the aim point is inside launcher `i`'s FIRING BAND (from its own station, R28). False for a launcher the hull cannot mount. */
export function launcherBears(hullId: HullId, i: number, pose: AimPose, aim: Vec2): boolean {
  if (i < 0 || i >= stationsOn(hullId)) return false;
  const off = aimOffset(hullId, i, pose, aim);
  return off !== null && inFiringBand(hullId, i, off);
}

/**
 * THE DERIVED LAUNCHER ANGLE (Story 11.1, R16) — what launcher `i` is drawn at
 * and what `LauncherState.a` / `Contact.lu` carry: the bearing from its own
 * station to the aim point (hull-relative, the header's convention) while the
 * aim lies inside its FIRING BAND; its REST bearing otherwise (its dead
 * wedge, its blind sector, on its station, or `aim === null`). Pure; no
 * traverse, no history.
 */
export function launcherAngle(hullId: HullId, i: number, pose: AimPose, aim: Vec2 | null): number {
  const rest = launcherRest(i);
  const off = aim === null || i < 0 || i >= stationsOn(hullId) ? null : aimOffset(hullId, i, pose, aim);
  if (off === null || !inFiringBand(hullId, i, off)) return rest;
  return rest + clampOffset(off, launcherTrainRad(hullId, i));
}

/**
 * ONE 50 ms STEP of a ship's launchers, IN PLACE: every tube's clock counts
 * down toward 0, and every launcher's angle is SET to its derived
 * `launcherAngle` for this aim (no traverse — R16). `aim === null` leaves
 * every angle where it is and still runs the clocks.
 */
export function stepLaunchers(
  states: LauncherState[],
  hullId: HullId,
  pose: AimPose,
  aim: Vec2 | null,
  dtMs: number,
): void {
  const n = Math.min(states.length, stationsOn(hullId));
  for (let i = 0; i < n; i += 1) {
    const st = states[i];
    for (let k = 0; k < st.tubes.length; k += 1) st.tubes[k] = Math.max(0, st.tubes[k] - dtMs);
    if (aim !== null) st.a = launcherAngle(hullId, i, pose, aim);
  }
}

// --- The pick -----------------------------------------------------------------

/** A click's verdict (see the header). `fire` names the one tube that fires and where its torpedo goes. */
export type TubePick =
  | {
      verdict: 'fire';
      /** Which launcher (0 fore, 1 aft). */
      launcher: number;
      /** Which of its tubes (the lowest-index loaded one). */
      tube: number;
      /** The launcher's world station. */
      station: Vec2;
      /** rad — the WORLD bearing the torpedo runs on: station → aim point. */
      bearing: number;
    }
  | { verdict: 'out-of-arc' }
  | { verdict: 'cooling' };

/** The lowest-index LOADED tube of a launcher, or −1. */
function loadedTube(st: LauncherState): number {
  for (let k = 0; k < st.tubes.length; k += 1) {
    if (st.tubes[k] <= 0) return k;
  }
  return -1;
}

/**
 * THE PICK (R16) — pure; see the header for the three verdicts. `aim` is
 * `launcherAimPoint(...)`; `null` (no aim) is `out-of-arc`. Step the
 * launchers for the tick BEFORE picking, so a tube that finishes reloading
 * this tick counts this tick. A launcher's current angle plays no part.
 */
export function pickTube(states: readonly LauncherState[], hullId: HullId, pose: AimPose, aim: Vec2 | null): TubePick {
  if (aim === null) return { verdict: 'out-of-arc' };
  let bears = false;
  const n = Math.min(states.length, stationsOn(hullId));
  for (let i = 0; i < n; i += 1) {
    const off = aimOffset(hullId, i, pose, aim);
    if (off === null || !inFiringBand(hullId, i, off)) continue; // its band does not hold the aim: it never fires
    bears = true;
    const tube = loadedTube(states[i]);
    if (tube < 0) continue;
    const station = launcherStationWorld(hullId, i, pose);
    return { verdict: 'fire', launcher: i, tube, station, bearing: pose.heading + launcherRest(i) + off };
  }
  return { verdict: bears ? 'cooling' : 'out-of-arc' };
}

/**
 * WHERE THE TORPEDO ENTERS THE WATER: from the launcher's `station` along
 * `bearing`, pushed out to clear the ship's own silhouette by the torpedo
 * family's `hitRadius + spawnClearance` (`muzzleSpawnFrom` — the turret
 * muzzle's construction), so it never spawns inside its own hull. It runs on
 * `bearing` from there. Replaces the retired bow-ring `torpedoSpawn`.
 */
export function torpedoLaunchPoint(station: Vec2, pose: AimPose, hullId: HullId, bearing: number): Vec2 {
  return muzzleSpawnFrom(station, pose, hullId, bearing, CONFIG.torpedo.hitRadius + CONFIG.torpedo.spawnClearance);
}

// --- The arc, for drawing and planning ---------------------------------------

/**
 * THE LAUNCHER FIRING BANDS as hull-relative sectors (`heading + offset ±
 * halfArc`): TWO per launcher held on `hullId` (counter-clockwise side first,
 * then clockwise), fore first, each running from that launcher's `deadDeg` to
 * its `trainDeg` off its end (R28 / R30) — what replaces the three retired
 * fixed torpedo sectors of sim/arcs.ts for the client's wedge and a bot's
 * planning. Pass `stats.torpedoLaunchers`. The ANGLES are each launcher's
 * own; the client draws each from its launcher's station
 * (`launcherStation`). `launcherArcHolds` reads them PARALLAX-FREE from the
 * ship centre (right at any real range); the enforced verdict is `pickTube`,
 * measured from each station. Empty on a hull with no launchers.
 */
export function launcherSectors(hullId: HullId, launchers: number): Extract<ArcShape, { kind: 'sector' }>[] {
  const out: Extract<ArcShape, { kind: 'sector' }>[] = [];
  const n = Math.min(stationsOn(hullId), wholeIn(launchers, 0, MAX_LAUNCHERS));
  for (let i = 0; i < n; i += 1) {
    const mid = (launcherTrainRad(hullId, i) + launcherDeadRad(hullId, i)) / 2;
    const halfArc = (launcherTrainRad(hullId, i) - launcherDeadRad(hullId, i)) / 2;
    for (const side of [1, -1]) out.push({ kind: 'sector', offset: wrapAngle(launcherRest(i) + side * mid), halfArc });
  }
  return out;
}

/** True iff the WORLD bearing `aim` is inside the firing band of any of `launchers` launchers on a `hullId` ship heading `heading` (parallax-free, from the ship centre — a bot's PLANNING read; the enforced verdict is `pickTube`). */
export function launcherArcHolds(hullId: HullId, launchers: number, heading: number, aim: number): boolean {
  const n = Math.min(stationsOn(hullId), wholeIn(launchers, 0, MAX_LAUNCHERS));
  for (let i = 0; i < n; i += 1) {
    if (inFiringBand(hullId, i, wrapAngle(aim - heading - launcherRest(i)))) return true;
  }
  return false;
}

// --- Contact wire codec ------------------------------------------------------

/**
 * A sighted hull's launcher angles for `Contact.lu`: ONE WHOLE NUMBER per
 * launcher, fore first — its offset from REST in whole degrees
 * (counter-clockwise positive), the `Contact.tu` codec. ANGLES ONLY: nothing
 * about tubes or reloads ever rides a contact row.
 */
export function encodeLauncherAngles(states: readonly LauncherState[]): number[] {
  const out: number[] = [];
  const n = Math.min(states.length, MAX_LAUNCHERS);
  for (let i = 0; i < n; i += 1) out.push(encodeMountAngle(states[i].a, launcherRest(i)));
  return out;
}

/** One `Contact.lu` entry back to a hull-relative angle for launcher `i` on `hullId`; a malformed entry is clamped into THAT launcher's train interval. */
export function decodeLauncherAngle(hullId: HullId, i: number, q: number): number {
  return decodeMountAngle(q, launcherRest(i), launcherTrainRad(hullId, i));
}
