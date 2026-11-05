// THE MAIN BATTERY'S TURRETS — per-turret traverse, reload and the R4 pick
// (Story 10.4, Eric 2026-11-04, epic-10 amendments 7(c)–(e), 7(j) and 9).
//
// One sim, both sides: the server steps every captain's turrets each 50 ms
// tick and the client steps its OWN turrets with the same calls (corrected
// from `OwnShip.turrets`), so a turret's angle is never forked per side.
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
// so an aft turret trained 30° to one side of dead astern reads π ± 0.5236,
// never a wrapped negative. Because both the current and the wanted angle
// always lie in that one interval and the turret moves LINEARLY between them,
// it can never rotate through its blind sector: a target across the blind
// sector is reached the long way round by construction, and a target INSIDE
// the blind sector parks the turret at a stop (amendment 7(e)).
//
// WHICH STOP (review-gate patch P3): the stop on the side the turret ALREADY
// is — the sign of its current offset from rest. Only a turret sitting exactly
// at rest falls back to the nearer stop (the sign of the wanted offset, the
// negative stop on an exact tie). Without that hysteresis an aim on the
// centreline (dead astern of a forward turret, dead ahead of an aft one) sits
// exactly between the two stops, the "nearer" one flips with float noise, and
// the turret reverses every tick and reaches neither. The stateless
// `desiredTurretAngle` (no turret state to read) keeps the plain nearer-stop
// rule; the stepper and the pick use the state-aware `desiredTurretAngleFrom`.
//
// AN AIM POINT WITH NO BEARING (review-gate patch P4). A zero aim distance —
// an idle bot, the neutral input before a player's first real one — is NO AIM:
// `batteryAimPoint` returns `null` for it and both sides pass that to
// `stepTurrets`, which holds every angle. And an aim point sitting on a
// turret's own station (closer than `AIM_STATION_EPS_U`) has no bearing from
// that turret: the stepper holds THAT turret for the step, and the pick ranks
// it last and never on target.
//
// Worked example — Bismarck (train 145°), turret 2 (the first aft turret, rest
// π), ship heading 0 (bow along +x), aim point dead ahead far away: the
// bearing off rest is ±180°, outside ±145°, so the turret wants a stop; it
// parks at π − 2.5307 or π + 2.5307 (35° off the bow on one side) and STAYS
// on that stop while the aim wanders inside the blind sector. Bring the aim
// back inside its arc on the other side and the turret travels back through
// astern — never the 70° across the bow.
//
// EVERY TURRET CHASES THE ONE AIM POINT, each measured from ITS OWN gunhouse
// (the station, on the centreline), so close in the turrets converge.
//
// STATE IS MUTATED IN PLACE (`stepTurrets`, `fireTurret`, `reloadAllTurrets`
// return nothing new): the arrays live on the ship record / the client's own
// predicted state and are stepped 20 times a second — no allocation. The
// client's correction is a plain overwrite of its array from the wire
// (`copyTurrets`). Everything else here is a pure read.
//
// Pure, zero I/O, no randomness. Hull geometry comes from
// `CONFIG.shipClasses.<id>.battery` by hull id; a hull with no battery (a PvE
// drone) has ZERO turrets and every function degrades to the empty answer.

import { CONFIG, hullEnvelope, type HullId, type TurretMount } from '../constants.js';
import { wrapAngle } from '../math/angle.js';
import type { Vec2 } from '../math/vec.js';
import { burstPointAlong, muzzleSpawnFrom, type AimPose } from './aim.js';
import { parallelOffsets } from './spread.js';

const RAD_PER_DEG = Math.PI / 180;

/**
 * Float slack on an arc-edge comparison (rad, ~6e-8°): a bearing that is
 * mathematically ON a train limit must read as bearing whatever the last ulp
 * of an atan2 / wrap says.
 */
const ARC_EPS = 1e-9;

/**
 * u — an aim point nearer than this to a turret's own station has NO BEARING
 * from that turret (the bearing would be `atan2(0, 0)`, or float noise). A
 * documented module constant, not a gameplay dial: a millionth of a unit is
 * "the same point", far below any real aim (the gunhouse itself is units
 * across).
 */
export const AIM_STATION_EPS_U = 1e-6;

/** One turret's runtime state. */
export interface TurretState {
  /** rad — hull-relative, unwrapped, inside the turret's train interval (see the header). */
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
 * `aimDist` are measured from the centre). Every turret then chases this one
 * point from its own station.
 */
export function aimPointOf(pose: AimPose, aim: number, aimDist: number): Vec2 {
  return { x: pose.x + Math.cos(aim) * aimDist, y: pose.y + Math.sin(aim) * aimDist };
}

/**
 * THE BATTERY'S AIM POINT for an input, or `null` for NO AIM (review-gate
 * patch P4) — the ONE call both sides make to turn `InputMsg.aim` / `aimDist`
 * into what `stepTurrets` and `pickTurret` take, so server and client cannot
 * disagree about when the turrets hold.
 *
 * `null` (hold every angle) when `aimDist` is not a finite number greater
 * than zero, or `aim` is not finite: a zero distance is the ship's own centre,
 * which every turret would otherwise chase to a hard stop. ANY positive
 * distance is a legitimate aim, however close in. Otherwise `aimPointOf`.
 */
export function batteryAimPoint(pose: AimPose, aim: number, aimDist: number): Vec2 | null {
  if (!Number.isFinite(aimDist) || aimDist <= 0 || !Number.isFinite(aim)) return null;
  return aimPointOf(pose, aim, aimDist);
}

/**
 * rad in [−π, π) — where the aim point lies relative to turret `i`'s REST
 * bearing, measured from the turret's own station; NOT clamped. `|offset| ≤
 * train` is "the aim point is inside this turret's arc".
 *
 * An aim point exactly on the station has no bearing; atan2(0, 0) = 0 makes
 * that read as "due +x in world axes", deterministic on both sides. The
 * stepper and the pick never get that far — they use `aimOffsetOrNull`.
 */
function aimOffset(mount: TurretMount, station: Vec2, pose: AimPose, aim: Vec2): number {
  const brg = Math.atan2(aim.y - station.y, aim.x - station.x);
  return wrapAngle(brg - pose.heading - turretRest(mount));
}

/**
 * `aimOffset`, or `null` when the aim point has NO BEARING from this station:
 * nearer than `AIM_STATION_EPS_U`, or not a finite point at all.
 */
function aimOffsetOrNull(mount: TurretMount, station: Vec2, pose: AimPose, aim: Vec2): number | null {
  if (!(Math.hypot(aim.x - station.x, aim.y - station.y) > AIM_STATION_EPS_U)) return null;
  return aimOffset(mount, station, pose, aim);
}

/** Clamp an offset-from-rest to the train limits (an offset in the blind sector lands on the NEARER stop). */
function clampOffset(offset: number, train: number): number {
  return Math.max(-train, Math.min(train, offset));
}

/**
 * The offset-from-rest a turret WANTS for an unclamped aim offset, knowing
 * where the turret already is (`curOffset`, its own offset from rest). Inside
 * the arc: the aim offset itself. Inside the blind sector: the stop on the
 * side the turret ALREADY is; a turret exactly at rest takes the nearer stop
 * (the sign of the aim offset — the negative stop on the exact ±π tie).
 */
function wantOffset(offset: number, train: number, curOffset: number): number {
  if (Math.abs(offset) <= train + ARC_EPS) return clampOffset(offset, train);
  if (curOffset !== 0) return curOffset > 0 ? train : -train;
  return offset > 0 ? train : -train;
}

/** True iff the aim point is inside turret `i`'s arc (rest ± train, from its own station). */
export function turretBears(hullId: HullId, i: number, pose: AimPose, aim: Vec2): boolean {
  const mount = turretMounts(hullId)[i];
  if (mount === undefined) return false;
  const off = aimOffset(mount, turretStationWorld(hullId, i, pose), pose, aim);
  return Math.abs(off) <= turretTrainRad(hullId) + ARC_EPS;
}

/**
 * The angle turret `i` WANTS (hull-relative, unwrapped — the header's
 * convention): the bearing from its own world station to the world aim point,
 * minus heading, clamped to the train limits. An aim point inside the blind
 * sector parks it at the NEARER stop.
 */
export function desiredTurretAngle(hullId: HullId, i: number, pose: AimPose, aim: Vec2): number {
  const mount = turretMounts(hullId)[i];
  if (mount === undefined) return 0;
  const off = aimOffset(mount, turretStationWorld(hullId, i, pose), pose, aim);
  return turretRest(mount) + clampOffset(off, turretTrainRad(hullId));
}

/**
 * The angle turret `i` WANTS given where it ALREADY points (`currentA`, the
 * turret's own `TurretState.a`) — what the stepper and the pick use. Same as
 * `desiredTurretAngle` for an aim point inside the arc; an aim point inside
 * the blind sector parks it at the stop on the side it already is (only a
 * turret exactly at rest takes the nearer stop), so an aim on the centreline
 * can never make it flip between stops. An aim point on the turret's own
 * station has no bearing: the turret wants to stay where it is.
 */
export function desiredTurretAngleFrom(
  hullId: HullId,
  i: number,
  pose: AimPose,
  aim: Vec2,
  currentA: number,
): number {
  const mount = turretMounts(hullId)[i];
  if (mount === undefined) return 0;
  const rest = turretRest(mount);
  const train = turretTrainRad(hullId);
  const cur = clampOffset(currentA - rest, train);
  const off = aimOffsetOrNull(mount, turretStationWorld(hullId, i, pose), pose, aim);
  return rest + (off === null ? cur : wantOffset(off, train, cur));
}

/** One turret's traverse for a step toward the aim point (`maxStep` rad); an aim with no bearing from it holds it. */
function traverseTurret(st: TurretState, hullId: HullId, i: number, pose: AimPose, aim: Vec2, maxStep: number): void {
  const mount = turretMounts(hullId)[i];
  const train = turretTrainRad(hullId);
  const off = aimOffsetOrNull(mount, turretStationWorld(hullId, i, pose), pose, aim);
  if (off === null) return;
  const rest = turretRest(mount);
  // A state outside its interval (never produced here; a corrupt write) is
  // pulled back to the nearer stop before it moves.
  const cur = clampOffset(st.a - rest, train);
  const from = rest + cur;
  const want = rest + wantOffset(off, train, cur);
  const d = want - from;
  st.a = Math.abs(d) <= maxStep ? want : from + Math.sign(d) * maxStep;
}

/**
 * ONE 50 ms STEP of a hull's turrets, IN PLACE: every turret traverses toward
 * the angle it wants at `CONFIG.mainBattery.traverseDegPerS` (arriving
 * exactly, never overshooting, never leaving its train interval) and every
 * turret's reload counts down toward 0.
 *
 * `aim === null` (no aim this tick — a neutral input; see `batteryAimPoint`)
 * holds every angle and still runs the reloads. An aim point on a turret's
 * own station (no bearing from it) holds THAT turret for the step.
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
  const maxStep = (CONFIG.mainBattery.traverseDegPerS * RAD_PER_DEG * dtMs) / 1000;
  const n = Math.min(states.length, turretMounts(hullId).length);
  for (let i = 0; i < n; i += 1) {
    const st = states[i];
    st.reloadMsLeft = Math.max(0, st.reloadMsLeft - dtMs);
    if (aim !== null) traverseTurret(st, hullId, i, pose, aim, maxStep);
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

/** The turret a click fires, and where it is pointing. */
export interface TurretPick {
  /** Which turret (index into the hull's bow-to-stern mounts and the state array). */
  index: number;
  /** True iff this turret was ON the aim point (R4 priority 1); false = it fires along its current bearing. */
  onTarget: boolean;
  /** The turret's world station — where its reach is measured from. */
  station: Vec2;
  /** rad — the WORLD bearing the salvo flies on. */
  bearing: number;
  /** u — distance from the station to the aim point, UNCLAMPED (clamp it with the reach in `turretSalvo`). */
  aimDistU: number;
  /** Shells in the salvo (the turret's gun count). */
  guns: number;
}

/** One ready turret's read against the aim point. */
interface TurretRead {
  on: boolean;
  /** rad — the FALLBACK rank: how far this turret is from the bearing to the aim point (∞ = no bearing). */
  err: number;
  station: Vec2;
  exactBearing: number;
  /** u — station → aim point (0 when the aim point has no bearing from this station). */
  aimDistU: number;
}

/**
 * One ready turret against the aim point.
 *
 *   - AIM INSIDE THE ARC: the error is the turret's travel to the aim bearing
 *     (unwrapped — it can only get there inside its interval), and it is ON
 *     TARGET within `onTargetDeg` of it.
 *   - AIM INSIDE THE BLIND SECTOR (review-gate patch P2): never on target, and
 *     the error is the TRUE angular distance between where the turret points
 *     and the bearing to the aim point — NOT the distance to the stop it is
 *     parked on (which reads zero for a turret pointing tens of degrees wide).
 *     The wrapped distance, because the turret cannot travel there anyway and
 *     the unwrapped one would jump by a full turn with the sign of an aim on
 *     the centreline.
 *   - NO BEARING (the aim point on this turret's own station, P4): never on
 *     target, ranked LAST (error ∞), aim distance 0 — a pick of it fires along
 *     its current bearing, so no NaN can leave here.
 */
function readTurret(st: TurretState, mount: TurretMount, hullId: HullId, i: number, pose: AimPose, aim: Vec2): TurretRead {
  const train = turretTrainRad(hullId);
  const station = turretStationWorld(hullId, i, pose);
  const rest = turretRest(mount);
  const off = aimOffsetOrNull(mount, station, pose, aim);
  if (off === null) return { on: false, err: Infinity, station, exactBearing: pose.heading + st.a, aimDistU: 0 };
  const aimDistU = Math.hypot(aim.x - station.x, aim.y - station.y);
  const exactBearing = pose.heading + rest + off;
  if (Math.abs(off) > train + ARC_EPS) {
    return { on: false, err: Math.abs(wrapAngle(off - (st.a - rest))), station, exactBearing, aimDistU };
  }
  const err = Math.abs(rest + clampOffset(off, train) - st.a);
  const on = err <= CONFIG.mainBattery.onTargetDeg * RAD_PER_DEG + ARC_EPS;
  return { on, err, station, exactBearing, aimDistU };
}

/**
 * THE R4 PICK (Eric 2026-11-04: "The turret fires wherever it is currently
 * pointing, even if it is the wrong direction. However if *any* turret is
 * ready and pointed that way, it should fire instead."). Pure — it changes
 * nothing; the caller fires the pick with `fireTurret`.
 *
 *   1. Among READY turrets (reloadMsLeft ≤ 0), one that is ON TARGET — the aim
 *      point is inside its arc AND its angle is within
 *      `CONFIG.mainBattery.onTargetDeg` of the angle it wants — wins; the
 *      LOWEST INDEX (bow first) if several are. It fires at the aim point
 *      exactly (`bearing` = station → aim point).
 *   2. Otherwise the ready turret with the SMALLEST angular error (lowest
 *      index on a tie) fires along its CURRENT bearing (`heading + a`). The
 *      error is measured to the TRUE bearing of the aim point, so a turret
 *      parked on a stop because the aim is in its blind sector ranks by how
 *      wide it really points, never as zero.
 *   3. No turret ready → `null` (the caller's `cooling` denial).
 *
 * Step the turrets for the tick BEFORE picking, so a turret that arrives on
 * the aim point (or finishes reloading) this tick counts this tick.
 */
export function pickTurret(
  states: readonly TurretState[],
  hullId: HullId,
  pose: AimPose,
  aim: Vec2,
): TurretPick | null {
  const mounts = turretMounts(hullId);
  let best = -1;
  let bestRead: TurretRead | null = null;
  const n = Math.min(states.length, mounts.length);
  for (let i = 0; i < n; i += 1) {
    if (states[i].reloadMsLeft > 0) continue;
    const read = readTurret(states[i], mounts[i], hullId, i, pose, aim);
    if (read.on) {
      best = i;
      bestRead = read;
      break;
    }
    if (bestRead === null || read.err < bestRead.err) {
      best = i;
      bestRead = read;
    }
  }
  if (bestRead === null) return null;
  return {
    index: best,
    onTarget: bestRead.on,
    station: bestRead.station,
    bearing: bestRead.on ? bestRead.exactBearing : pose.heading + states[best].a,
    aimDistU: bestRead.aimDistU,
    guns: mounts[best].guns,
  };
}

/** One shell of a salvo: where it spawns and where it bursts. */
export interface SalvoShell {
  origin: Vec2;
  target: Vec2;
}

/** A turret's whole salvo. */
export interface TurretSalvo {
  /** The salvo's centre landing point (the aim point, or the point along the turret's bearing — reach- and map-clamped). */
  center: Vec2;
  /** rad — the world bearing every shell flies on (parallel tracks). */
  bearing: number;
  /** One entry per gun. */
  shells: SalvoShell[];
}

/**
 * THE FIRE SOLUTION of a pick: the landing point and every shell's own
 * origin/target.
 *
 *   - CENTRE: `min(pick.aimDistU, reachU)` along `pick.bearing` FROM THE
 *     STATION, pulled back inside the water disk (`burstPointAlong`). On
 *     target that is the aim point itself (clamped to reach); off target it is
 *     the point along the turret's current bearing at the aim's distance.
 *   - `reachU` arrives from the caller: the folded
 *     `stats.equipment.mainBattery.rangeU`, or that lifted by the firer's own
 *     lit zone — `gunReachU(pick.station, pick.bearing, pick.aimDistU, rangeU,
 *     mapRadius, ownLitZones)` — which is why the pick and the solution are
 *     two calls.
 *   - MUZZLE: the station pushed out along the bearing to just clear the own
 *     silhouette (`muzzleSpawnFrom`), unless the centre is nearer than that, in
 *     which case the shells spawn AT their targets (no inner dead ring — the
 *     cannon's `muzzleOrTarget` rule).
 *   - BARRELS: the turret's guns fly PARALLEL tracks `barrelSpacingU` apart by
 *     the shared straddle law (three guns: one on the centre; two: straddling
 *     it) — the lateral offset is added to BOTH origin and target.
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
  const from = centerDist <= muzzleDist + cfg.shellRadius ? center : muzzle;
  const shells = parallelOffsets(pick.bearing, pick.guns, cfg.barrelSpacingU).map((o) => ({
    origin: { x: from.x + o.x, y: from.y + o.y },
    target: { x: center.x + o.x, y: center.y + o.y },
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
  for (let i = 0; i < n; i += 1) out.push(Math.round((states[i].a - turretRest(mounts[i])) / RAD_PER_DEG));
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
  const off = Number.isFinite(q) ? q * RAD_PER_DEG : 0;
  return turretRest(mount) + clampOffset(off, turretTrainRad(hullId));
}
