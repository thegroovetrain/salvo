// Ship kinematics — the momentum/steerage model shared by server sim and
// client prediction. Pure and deterministic at a fixed dt; stepShip mutates
// the ship in place (allocation-free) per the plan.

import { wrapAngle } from '../math/angle.js';

/** Mutable ship kinematic state. speed is a signed scalar along `heading`. */
export interface ShipState {
  x: number; // u
  y: number; // u
  heading: number; // rad (0 = +x, CCW)
  speed: number; // u/s (signed: negative = reverse)
}

/** Per-tick control input. Both axes are clamped to [-1, 1]. */
export interface ShipInput {
  throttle: number; // -1 (full astern) .. 1 (full ahead)
  rudder: number; // -1 (full left) .. 1 (full right)
}

/** Kinematic tunables consumed by stepShip (structural subset of CONFIG.ship). */
export interface ShipConfig {
  maxSpeed: number; // u/s
  reverseSpeed: number; // u/s (magnitude)
  accel: number; // u/s^2
  decel: number; // u/s^2
  turnRate: number; // rad/s
  steerageSpeed: number; // u/s
}

function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/**
 * Move `current` speed toward `target`, using `accel` when the ship's speed
 * magnitude is growing in its direction of travel and `decel` when it is
 * shrinking (braking, including reversing through zero). Returns the new speed.
 */
export function approach(
  current: number,
  target: number,
  accel: number,
  decel: number,
  dt: number,
): number {
  const diff = target - current;
  if (diff === 0) return target;
  const speedingUp = current === 0 || Math.sign(diff) === Math.sign(current);
  const maxDelta = (speedingUp ? accel : decel) * dt;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/**
 * Advance a ship one fixed step of `dt` seconds. Mutates and returns `s`.
 * Rudder authority scales with speed/steerageSpeed (no turn at standstill,
 * full authority above steerageSpeed, sign flips in reverse).
 */
export function stepShip(s: ShipState, inp: ShipInput, cfg: ShipConfig, dt: number): ShipState {
  const throttle = clampUnit(inp.throttle);
  const rudder = clampUnit(inp.rudder);
  const target = throttle >= 0 ? throttle * cfg.maxSpeed : throttle * cfg.reverseSpeed;

  s.speed = approach(s.speed, target, cfg.accel, cfg.decel, dt);

  const authority = clampUnit(s.speed / cfg.steerageSpeed);
  s.heading = wrapAngle(s.heading + rudder * cfg.turnRate * authority * dt);

  s.x += Math.cos(s.heading) * s.speed * dt;
  s.y += Math.sin(s.heading) * s.speed * dt;
  return s;
}
