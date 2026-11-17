// THE MAIN BATTERY'S TURRETS — per-turret reload, the arc-only pick and the
// salvo's fire solution (Story 10.4, Eric 2026-11-04, epic-10 amendments
// 7(c)–(e), 7(j) and 9; arc-only fire, Eric 2026-11-05, epic-10 amendment 10;
// NO TRAVERSE and CONVERGE, Eric 2026-11-12, Story 11.1, R11 / R13 / R16).
//
// One sim, both sides: the server steps every captain's turrets each 50 ms
// tick and the client steps its OWN turrets with the same calls (corrected
// from `OwnShip.turrets`), so a turret's reload and angle are never forked
// per side.
//
// THE ANGLE CONVENTION. A turret angle `a` is in RADIANS, RELATIVE TO THE
// HULL, in the same rotational sense as `heading` (atan2 — counter-clockwise
// positive in world axes): `a = 0` points at the bow, and the turret's WORLD
// bearing is `pose.heading + a`. It is UNWRAPPED and lives in one continuous
// interval around the turret's REST bearing:
//
//     fwd turret:  rest 0,   a ∈ [−train, +train]
//     aft turret:  rest π,   a ∈ [π − train, π + train]
//
// NO TRAVERSE (Eric 2026-11-12, Story 11.1, R11 / R16 — "back to point and
// shoot"; supersedes epic-10 amendment 7's load-bearing traverse and the
// hold-outside-the-arc half of amendment 10). A turret's angle is NOT
// simulated state that slews: it is DERIVED (`turretAngle`) — pointing at the
// aim point while the aim lies inside that turret's arc (rest ± train, from
// its own station), at rest otherwise. `stepTurrets` writes that derived
// angle onto `TurretState.a` each tick (the wire shape `OwnShip.turrets` /
// `Contact.tu` is unchanged), and counts the reloads down. A click fires the
// LOWEST INDEX (bow first) READY turret whose arc holds the aim point, at the
// aim point exactly (`pickTurret`); none → nothing fires.
//
// AN AIM POINT WITH NO BEARING (review-gate patch P4). A zero aim distance —
// an idle bot, the neutral input before a player's first real one — is NO AIM:
// `batteryAimPoint` returns `null` for it and both sides pass that to
// `stepTurrets`, which then leaves every angle where it is (a sinking hull's
// turrets freeze where they were). An aim point sitting on a turret's own
// station (closer than `AIM_STATION_EPS_U`) has no bearing from that turret:
// it does not bear, so it rests and the pick never picks it.
//
// CONVERGE (R13: "a real turret's barrels would all be aimed to train on the
// same target point, though they wouldn't all land on it"). Every barrel of
// the fired turret aims at the ONE salvo center; where each shell actually
// lands is the server's dispersion roll (sim/dispersion.ts) around that
// center — never here, and never on the client. The barrels' own lateral
// offsets no longer place shells (Story 11.1 review fix — no converging
// tracks on the wire): the server flies every shell of a salvo PARALLEL to
// the salvo bearing, abreast off the muzzle line, each to its own landing
// (server equipment/ballistics.ts `salvoShellFlight`).
//
// STATE IS MUTATED IN PLACE (`stepTurrets`, `fireTurret`, `reloadAllTurrets`
// return nothing new): the arrays live on the ship record / the client's own
// predicted state and are stepped 20 times a second — no allocation. The
// client's correction is a plain overwrite of its array from the wire
// (`copyTurrets`). Everything else here is a pure read.
//
// Pure, zero I/O, no randomness. Hull geometry comes from
// `CONFIG.shipClasses.<id>.battery` by hull id; a hull with no battery
// has ZERO turrets and every function degrades to the empty answer.

import { CONFIG, hullEnvelope, type HullId, type TurretMount } from '../constants.js';
import { wrapAngle } from '../math/angle.js';
import type { Vec2 } from '../math/vec.js';
import { burstPointAlong, muzzleSpawnFrom, type AimPose } from './aim.js';
import {
  ARC_EPS,
  decodeMountAngle,
  encodeMountAngle,
  mountAngle,
  mountArcHolds,
  mountBearingOffset,
  mountStationWorld,
  mountWant,
  type TrainedMount,
} from './mountAim.js';

// The aiming machinery itself lives in sim/mountAim.ts since Story 10.6 (the
// torpedo launchers share it); this file is the battery's hull-keyed face of
// it.
export { AIM_STATION_EPS_U } from './mountAim.js';

const RAD_PER_DEG = Math.PI / 180;

/** One turret's runtime state. */
export interface TurretState {
  /** rad — hull-relative, unwrapped, inside the turret's train interval: the DERIVED angle (`turretAngle`) as of the last step with an aim (see the header). */
  a: number;
  /** ms until this turret may fire again (0 = ready). */
  reloadMsLeft: number;
}

/** A hull's turrets as authored, bow to stern (`[]` for a hull with no battery). */
export function turretMounts(hullId: HullId): readonly TurretMount[] {
  return hullEnvelope(hullId).battery?.turrets ?? [];
}

/** rad — the hull's train limit either side of each turret's rest bearing (0 with no battery). */
export function turretTrainRad(hullId: HullId): number {
  return (hullEnvelope(hullId).battery?.trainDeg ?? 0) * RAD_PER_DEG;
}

/** rad — a mount's REST bearing in the hull frame: 0 (the bow) for `fwd`, π (the stern) for `aft`. */
export function turretRest(mount: TurretMount): number {
  return mount.facing === 'fwd' ? 0 : Math.PI;
}

/**
 * Turret `i`'s station (gunhouse centre) in the hull's LOCAL frame — the
 * silhouette's frame: origin at the ship position, bow along +x. On the
 * centreline; `frac` is measured from the bow.
 */
export function turretStation(hullId: HullId, i: number): Vec2 {
  const mount = turretMounts(hullId)[i];
  const length = hullEnvelope(hullId).hull.length;
  return { x: mount === undefined ? 0 : (0.5 - mount.frac) * length, y: 0 };
}

/** Turret `i`'s station in WORLD space for a ship pose. */
export function turretStationWorld(hullId: HullId, i: number, pose: AimPose): Vec2 {
  const sx = turretStation(hullId, i).x;
  return { x: pose.x + Math.cos(pose.heading) * sx, y: pose.y + Math.sin(pose.heading) * sx };
}

/** Every turret of a hull at rest and loaded — the spawn state. */
export function initialTurrets(hullId: HullId): TurretState[] {
  return turretMounts(hullId).map((m) => ({ a: turretRest(m), reloadMsLeft: 0 }));
}

/** Overwrite `into` with `from` (resizing it) — the client's correction from the wire. */
export function copyTurrets(into: TurretState[], from: readonly TurretState[]): TurretState[] {
  into.length = from.length;
  for (let i = 0; i < from.length; i += 1) {
    const src = from[i];
    const dst = into[i] ?? (into[i] = { a: 0, reloadMsLeft: 0 });
    dst.a = src.a;
    dst.reloadMsLeft = src.reloadMsLeft;
  }
  return into;
}

/**
 * The world aim point of an input: `aimDist` along the world bearing `aim`
 * from the ship CENTRE (the same point the cursor sits on — `InputMsg.aim` /
 * `aimDist` are measured from the centre). Every turret then reads this one
 * point from its own station.
 */
export function aimPointOf(pose: AimPose, aim: number, aimDist: number): Vec2 {
  return { x: pose.x + Math.cos(aim) * aimDist, y: pose.y + Math.sin(aim) * aimDist };
}

/**
 * THE BATTERY'S AIM POINT for an input, or `null` for NO AIM (review-gate
 * patch P4) — the ONE call both sides make to turn `InputMsg.aim` / `aimDist`
 * into what `stepTurrets` and `pickTurret` take, so server and client cannot
 * disagree about when there is no aim.
 *
 * `null` (no aim: angles left as they are, nothing fires) when `aimDist` is
 * not a finite number greater than zero, or `aim` is not finite: a zero
 * distance is the ship's own centre. ANY positive distance is a legitimate
 * aim, however close in. Otherwise `aimPointOf`.
 */
export function batteryAimPoint(pose: AimPose, aim: number, aimDist: number): Vec2 | null {
  if (!Number.isFinite(aimDist) || aimDist <= 0 || !Number.isFinite(aim)) return null;
  return aimPointOf(pose, aim, aimDist);
}

/**
 * Turret `i` as a TRAINED MOUNT (sim/mountAim.ts): its station, rest bearing
 * and the hull's train limit — or `undefined` for an index the hull does not
 * mount.
 */
function trained(hullId: HullId, i: number): TrainedMount | undefined {
  const mount = turretMounts(hullId)[i];
  if (mount === undefined) return undefined;
  return { x: turretStation(hullId, i).x, rest: turretRest(mount), train: turretTrainRad(hullId) };
}

/** True iff the aim point is inside turret `i`'s arc (rest ± train, from its own station). */
export function turretBears(hullId: HullId, i: number, pose: AimPose, aim: Vec2): boolean {
  const m = trained(hullId, i);
  return m !== undefined && mountArcHolds(m, pose, aim);
}

/**
 * The CLAMPED WANT of turret `i` (hull-relative, unwrapped — the header's
 * convention): the bearing from its own world station to the world aim point,
 * minus heading, clamped to the train limits. Stateless; for an aim inside
 * the arc it equals `turretAngle`, for an aim in the blind sector it is the
 * nearer stop (where `turretAngle` answers rest instead).
 */
export function desiredTurretAngle(hullId: HullId, i: number, pose: AimPose, aim: Vec2): number {
  const m = trained(hullId, i);
  return m === undefined ? 0 : mountWant(m, pose, aim);
}

/**
 * THE DERIVED TURRET ANGLE (Story 11.1, R16) — what turret `i` is drawn at
 * and what `TurretState.a` / `Contact.tu` carry: the bearing from its own
 * station to the aim point (hull-relative, the header's convention) while the
 * aim lies inside its arc; its REST bearing otherwise (blind sector, on its
 * own station, or `aim === null`). 0 for an index the hull does not mount.
 * Pure; no traverse, no history.
 */
export function turretAngle(hullId: HullId, i: number, pose: AimPose, aim: Vec2 | null): number {
  const m = trained(hullId, i);
  return m === undefined ? 0 : mountAngle(m, pose, aim);
}

/**
 * ONE 50 ms STEP of a hull's turrets, IN PLACE: every turret's reload counts
 * down toward 0, and every turret's angle is SET to its derived
 * `turretAngle` for this aim (no traverse — R16). `aim === null` (no aim this
 * tick — a neutral input, or a sinking hull; see `batteryAimPoint`) leaves
 * every angle where it is and still runs the reloads.
 *
 * Reloads count DOWN, so the folded reload time is not needed here; it enters
 * at `fireTurret`.
 */
export function stepTurrets(
  states: TurretState[],
  hullId: HullId,
  pose: AimPose,
  aim: Vec2 | null,
  dtMs: number,
): void {
  const n = Math.min(states.length, turretMounts(hullId).length);
  for (let i = 0; i < n; i += 1) {
    const st = states[i];
    st.reloadMsLeft = Math.max(0, st.reloadMsLeft - dtMs);
    if (aim !== null) st.a = turretAngle(hullId, i, pose, aim);
  }
}

/** Start turret `i`'s reload — call once when it fires. `reloadMs` is the FOLDED `stats.equipment.mainBattery.reloadMs`. */
export function fireTurret(states: TurretState[], i: number, reloadMs: number): void {
  const st = states[i];
  if (st !== undefined) st.reloadMsLeft = reloadMs;
}

/** INSTANT RELOAD: every turret is ready now. Angles are untouched. */
export function reloadAllTurrets(states: TurretState[]): void {
  for (const st of states) st.reloadMsLeft = 0;
}

/**
 * THE HOTBAR SUMMARY of a battery — the `{ n, reloadMsLeft }` pair slot 0's
 * `EquipmentState` / `OwnShip.ammo[0]` carries: `n` = turrets READY,
 * `reloadMsLeft` = the SOONEST remaining reload among the turrets still
 * reloading (0 when every turret is ready).
 */
export function batterySummary(states: readonly TurretState[]): { n: number; reloadMsLeft: number } {
  let n = 0;
  let soonest = Infinity;
  for (const st of states) {
    if (st.reloadMsLeft <= 0) n += 1;
    else if (st.reloadMsLeft < soonest) soonest = st.reloadMsLeft;
  }
  return { n, reloadMsLeft: Number.isFinite(soonest) ? soonest : 0 };
}

/** The turret a click fires, and the line it fires on. */
export interface TurretPick {
  /** Which turret (index into the hull's bow-to-stern mounts and the state array). */
  index: number;
  /** The turret's world station — where its reach is measured from. */
  station: Vec2;
  /** rad — the WORLD bearing station → aim point (the turret's line of fire). */
  bearing: number;
  /** u — distance from the station to the aim point, UNCLAMPED (clamp it with the reach in `turretSalvo`). */
  aimDistU: number;
  /** Shells in the salvo (the turret's gun count). */
  guns: number;
}

/**
 * THE PICK — ARC-ONLY, BOW FIRST, NO TRAVERSE (Eric 2026-11-05, epic-10
 * amendment 10: "If my cursor is not within the arc of one of my turrets, it
 * should *not* fire when clicked."; Eric 2026-11-12, Story 11.1, R16: among
 * READY turrets whose arc holds the aim point the bow-most fires, at the aim
 * point). Pure — it changes nothing; the caller fires the pick with
 * `fireTurret`. Among the READY turrets (reloadMsLeft ≤ 0) that BEAR — the
 * aim point inside their arc (rest ± train, from their own station) and not
 * on their own station — the LOWEST INDEX fires, at the aim point exactly.
 * No candidate → `null`: nothing fires and no reload starts (the caller's
 * `cooling` denial). A ready turret whose blind sector holds the aim point is
 * NEVER picked. A turret's current angle plays no part.
 *
 * Step the turrets for the tick BEFORE picking, so a turret that finishes its
 * reload this tick counts this tick.
 */
export function pickTurret(
  states: readonly TurretState[],
  hullId: HullId,
  pose: AimPose,
  aim: Vec2,
): TurretPick | null {
  const mounts = turretMounts(hullId);
  const n = Math.min(states.length, mounts.length);
  for (let i = 0; i < n; i += 1) {
    const m = states[i].reloadMsLeft > 0 ? undefined : trained(hullId, i);
    if (m === undefined) continue;
    const station = mountStationWorld(m.x, pose);
    const off = mountBearingOffset(m, station, pose, aim);
    if (off === null) continue;
    const aimDistU = Math.hypot(aim.x - station.x, aim.y - station.y);
    return { index: i, station, bearing: pose.heading + m.rest + off, aimDistU, guns: mounts[i].guns };
  }
  return null;
}

/** One shell of a salvo: its un-dispersed launch point and the point it is AIMED at (the salvo center). */
export interface SalvoShell {
  origin: Vec2;
  target: Vec2;
}

/** A turret's whole salvo — the UN-DISPERSED geometry (the preview's, and the server's base). */
export interface TurretSalvo {
  /** The salvo's ONE aim point — the pick's aim point, reach- and map-clamped. Every shell's `target`. */
  center: Vec2;
  /** rad — the turret's line of fire (station → center): the dispersion ellipse's long axis AND every shell's flight bearing. */
  bearing: number;
  /** One entry per gun: `origin` = the muzzle on the salvo axis (the SAME point for every gun), `target` = `center`. */
  shells: SalvoShell[];
}

/**
 * THE FIRE SOLUTION of a pick: the salvo center and the turret's muzzle on
 * the line of fire, every gun aimed at the ONE center (CONVERGE, Eric
 * 2026-11-12, Story 11.1, R13). Un-dispersed: the server rolls each shell's
 * landing around the center inside the ellipse for the STATION → CENTER range
 * (the very range the client's preview oval is sized from) and flies it
 * PARALLEL to `bearing`, abreast off the MUZZLE LINE (the line through
 * `shells[k].origin` perpendicular to `bearing`) — server
 * equipment/ballistics.ts `salvoShellFlight`. Parallel tracks never
 * intersect, so two visible shells give an observer no aim point and no range.
 *
 *   - CENTER: `min(pick.aimDistU, reachU)` along `pick.bearing` FROM THE
 *     STATION, pulled back inside the water disk (`burstPointAlong`) — the aim
 *     point itself when it is in reach.
 *   - `reachU` arrives from the caller: the folded
 *     `stats.equipment.mainBattery.rangeU`, or that lifted by the firer's own
 *     lit zone — `gunReachU(pick.station, pick.bearing, pick.aimDistU, rangeU,
 *     mapRadius, ownLitZones)` — which is why the pick and the solution are
 *     two calls.
 *   - ORIGIN (every gun the same): the station pushed out along the bearing
 *     to just clear the own silhouette (`muzzleSpawnFrom`) — the muzzle
 *     line's point on the salvo axis. Unless the center is nearer than the
 *     muzzle (POINT BLANK), in which case every origin is the center (no
 *     inner dead ring — the cannon's `muzzleOrTarget` rule) and the server
 *     spawns each shell on its own landing.
 *   - TARGETS: every shell's `target` is the center.
 */
export function turretSalvo(
  pick: TurretPick,
  hullId: HullId,
  pose: AimPose,
  reachU: number,
  mapRadius: number,
): TurretSalvo {
  const cfg = CONFIG.mainBattery;
  const center = burstPointAlong(pick.station, pick.aimDistU, mapRadius, reachU, pick.bearing);
  const muzzle = muzzleSpawnFrom(pick.station, pose, hullId, pick.bearing, cfg.shellRadius);
  const centerDist = Math.hypot(center.x - pick.station.x, center.y - pick.station.y);
  const muzzleDist = Math.hypot(muzzle.x - pick.station.x, muzzle.y - pick.station.y);
  const from = centerDist <= muzzleDist + cfg.shellRadius ? center : muzzle; // point blank → the center
  const shells = Array.from({ length: pick.guns }, () => ({
    origin: { x: from.x, y: from.y },
    target: { x: center.x, y: center.y },
  }));
  return { center, bearing: pick.bearing, shells };
}

/**
 * HOW MANY GUNS BEAR on a hull-relative bearing at long range (parallax
 * ignored — every station read as the ship centre): the sum of the guns of
 * every turret whose arc (rest ± train) contains the bearing. Bearing 0 = the
 * bow, ±π/2 = a broadside, π = the stern. The acceptance criterion's function:
 * bow / broadside / stern read 6 / 9 / 3 on the 3×3 hulls and 4 / 8 / 4 on the
 * 4×2 hulls.
 */
export function gunsBearing(hullId: HullId, bearingRad: number): number {
  const train = turretTrainRad(hullId);
  let guns = 0;
  for (const m of turretMounts(hullId)) {
    if (Math.abs(wrapAngle(bearingRad - turretRest(m))) <= train + ARC_EPS) guns += m.guns;
  }
  return guns;
}

// --- Contact wire codec ------------------------------------------------------

/**
 * A sighted hull's turret angles for `Contact.tu`: ONE WHOLE NUMBER per
 * turret — the turret's offset from its REST bearing in whole degrees
 * (counter-clockwise positive, so |q| ≤ trainDeg). Whole degrees keep each
 * entry a 1–3 byte msgpack int instead of a 9-byte float; a contact's turrets
 * are drawn, never fired, so a degree is plenty. ANGLES ONLY — a contact row
 * never carries reload state.
 */
export function encodeTurretAngles(states: readonly TurretState[], hullId: HullId): number[] {
  const mounts = turretMounts(hullId);
  const out: number[] = [];
  const n = Math.min(states.length, mounts.length);
  for (let i = 0; i < n; i += 1) out.push(encodeMountAngle(states[i].a, turretRest(mounts[i])));
  return out;
}

/**
 * One `Contact.tu` entry back to a hull-relative angle (the header's
 * convention). Fail-safe on anything off-contract: a missing mount reads 0, a
 * non-finite or out-of-range entry is clamped into the train interval, so a
 * malformed frame can never draw a turret through its blind sector.
 */
export function decodeTurretAngle(hullId: HullId, i: number, q: number): number {
  const mount = turretMounts(hullId)[i];
  if (mount === undefined) return 0;
  return decodeMountAngle(q, turretRest(mount), turretTrainRad(hullId));
}
