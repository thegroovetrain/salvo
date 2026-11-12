// A TRAINED MOUNT — the aiming machinery the main battery's turrets
// (sim/turrets.ts, Story 10.4) and the torpedo launchers (sim/launchers.ts,
// Story 10.6, Eric 2026-11-05, R6: "they work the same way in terms of aiming
// and such") share, lifted out of turrets.ts so neither forks it.
//
// A mount is three numbers in the hull's LOCAL frame (origin at the ship
// position, bow along +x):
//
//     x      u   — its station on the centerline (+x toward the bow)
//     rest   rad — its REST bearing (0 = the bow, π = the stern)
//     train  rad — how far it trains either side of rest (the hard stop)
//
// THE ANGLE CONVENTION is turrets.ts's: a mount angle `a` is hull-relative,
// counter-clockwise positive, UNWRAPPED, and lives in the one continuous
// interval `[rest − train, rest + train]`; the WORLD bearing is
// `pose.heading + a`. Everything below is that file's law, parameterized:
//
//   - a mount BEARS on an aim point when the point lies inside rest ± train
//     measured FROM THE MOUNT'S OWN STATION, and is not on the station itself;
//   - NO TRAVERSE (Eric 2026-11-12, Story 11.1, R11 / R16 — point and shoot):
//     a mount's angle is not simulated state that slews. Its DISPLAYED angle
//     is derived (`mountAngle`): at the aim point while the aim is inside its
//     arc, at rest otherwise. A mount that bears fires at the aim point
//     exactly; the caller picks among the ready ones. (The traverse stepper,
//     the on-target tolerance and the fire-early rank — `traverseMount`,
//     `traverseStepRad`, `readMount`, `rankMounts`, `mountWantFrom` — retired
//     2026-11-12 with it.)
//
// Pure, zero I/O, no CONFIG read.

import { wrapAngle } from '../math/angle.js';
import type { Vec2 } from '../math/vec.js';
import type { AimPose } from './aim.js';

const RAD_PER_DEG = Math.PI / 180;

/**
 * Float slack on an arc-edge comparison (rad, ~6e-8°): a bearing that is
 * mathematically ON a train limit must read as bearing whatever the last ulp
 * of an atan2 / wrap says.
 */
export const ARC_EPS = 1e-9;

/**
 * u — an aim point nearer than this to a mount's own station has NO BEARING
 * from that mount (the bearing would be `atan2(0, 0)`, or float noise). A
 * documented module constant, not a gameplay dial: a millionth of a unit is
 * "the same point", far below any real aim.
 */
export const AIM_STATION_EPS_U = 1e-6;

/** One trained mount in the hull's local frame (see the header). */
export interface TrainedMount {
  /** u — station on the centerline, +x toward the bow. */
  readonly x: number;
  /** rad — rest bearing in the hull frame (0 = bow, π = stern). */
  readonly rest: number;
  /** rad — train limit either side of rest. */
  readonly train: number;
}

/** A mount's station in WORLD space for a ship pose. */
export function mountStationWorld(x: number, pose: AimPose): Vec2 {
  return { x: pose.x + Math.cos(pose.heading) * x, y: pose.y + Math.sin(pose.heading) * x };
}

/**
 * rad in [−π, π) — where the aim point lies relative to the mount's REST
 * bearing, measured from its own station; NOT clamped. An aim point exactly on
 * the station reads `atan2(0, 0) = 0` — deterministic; the stepper and the
 * pick use `mountBearingOffset`, which refuses that case.
 */
export function mountAimOffset(m: TrainedMount, station: Vec2, pose: AimPose, aim: Vec2): number {
  const brg = Math.atan2(aim.y - station.y, aim.x - station.x);
  return wrapAngle(brg - pose.heading - m.rest);
}

/** Clamp an offset-from-rest to the train limits (an offset in the blind sector lands on the NEARER stop). */
export function clampOffset(offset: number, train: number): number {
  return Math.max(-train, Math.min(train, offset));
}

/**
 * The offset-from-rest the mount goes to for this aim, or `null` when it does
 * NOT BEAR and so holds: the aim point has no bearing from its station (nearer
 * than `AIM_STATION_EPS_U`, or not a finite point), or lies in its blind
 * sector. Inside the arc it is the aim offset itself, UNCLAMPED (a bearing on
 * a train limit may sit up to `ARC_EPS` outside it — clamp before moving).
 */
export function mountBearingOffset(m: TrainedMount, station: Vec2, pose: AimPose, aim: Vec2): number | null {
  if (!(Math.hypot(aim.x - station.x, aim.y - station.y) > AIM_STATION_EPS_U)) return null;
  const off = mountAimOffset(m, station, pose, aim);
  if (Math.abs(off) > m.train + ARC_EPS) return null;
  return off;
}

/** True iff the aim point is inside the mount's arc (rest ± train, from its own station). */
export function mountArcHolds(m: TrainedMount, pose: AimPose, aim: Vec2): boolean {
  const off = mountAimOffset(m, mountStationWorld(m.x, pose), pose, aim);
  return Math.abs(off) <= m.train + ARC_EPS;
}

/** The CLAMPED WANT: the bearing from the station to the aim point, hull-relative, clamped to the train limits. */
export function mountWant(m: TrainedMount, pose: AimPose, aim: Vec2): number {
  const off = mountAimOffset(m, mountStationWorld(m.x, pose), pose, aim);
  return m.rest + clampOffset(off, m.train);
}

/**
 * THE DERIVED ANGLE (Story 11.1, R16): the mount's hull-relative angle for
 * this aim — the bearing to the aim point while it lies inside the mount's
 * arc (clamped to the train limits against float dust), its REST bearing
 * otherwise (blind sector, on its own station, or `null` = no aim).
 */
export function mountAngle(m: TrainedMount, pose: AimPose, aim: Vec2 | null): number {
  if (aim === null) return m.rest;
  const off = mountBearingOffset(m, mountStationWorld(m.x, pose), pose, aim);
  return off === null ? m.rest : m.rest + clampOffset(off, m.train);
}

// --- Contact wire codec ------------------------------------------------------

/** A mount angle as its offset from REST in WHOLE DEGREES (counter-clockwise positive) — a 1–3 byte msgpack int. */
export function encodeMountAngle(a: number, rest: number): number {
  return Math.round((a - rest) / RAD_PER_DEG);
}

/**
 * One whole-degree wire entry back to a hull-relative angle. Fail-safe: a
 * non-finite entry reads rest, an out-of-range one is clamped into the train
 * interval, so a malformed frame can never draw a mount through its blind
 * sector.
 */
export function decodeMountAngle(q: number, rest: number, train: number): number {
  const off = Number.isFinite(q) ? q * RAD_PER_DEG : 0;
  return rest + clampOffset(off, train);
}
