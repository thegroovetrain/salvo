// THE TORPEDO CORE (Story 8.13; re-cut for the LAUNCHERS in Story 10.6, Eric
// 2026-11-05, R6 / R16, epic-10 amendment 12) — ONE launch path for every
// torpedo in the game.
//
// Three lines put a `torp` on the water — heavyTorpedo, lightTorpedo,
// supercavTorpedo — and since Story 10.6 they differ ONLY in numbers. The
// fixed per-line launch sectors (the light's beams, the heavy's 60° bow cone,
// the supercav's 30°) are GONE: every torpedo leaves from a deck LAUNCHER
// that aims like a turret (shared sim/launchers.ts), and the launcher state
// lives on the ship record (`ship.launchers`, equipment/mounts.ts). No
// traverse since Story 11.1 (R16): a launcher fires only inside its band, at
// the aim point.
//
// THE PICK IS THE SHARED `pickTube` (R16, verbatim: "if the tube CANNOT
// POSSIBLY point at the aimed area, it doesn't fire no matter what"):
//   - no launcher's arc holds the aim point (or the click names no aim) →
//     'out-of-arc', NOTHING SPENT;
//   - an arc holds it but no such launcher has a loaded tube → 'no-ammo'
//     (the wire's `cooling`);
//   - otherwise ONE tube fires (one click, one torpedo) — the fore-most
//     loaded launcher whose band holds the aim: from its station on the deck
//     (`torpedoLaunchPoint`, clear of the own hull), along the bearing to the
//     aim point, and that tube starts its reload at the held torpedo's FOLDED
//     `reloadMs`. A torpedo is never dispersed (Story 11.1, R6).
//
// Everything else about a torpedo is the FAMILY's (epic-8 amendment 84e —
// `CONFIG.torpedo` is the heavy's block AND the family's shared fields): the
// hit radius, the spawn clearance, the homing acquire range and the homing
// die-distance. HOMING IS A TIER STAT (amendment 80): 0 is the straight-runner
// — no `homing` tag and no die-distance (`range` = Infinity).
//
// NO FRIENDLY FIRE, ALWAYS (Eric ruling 2026-07-19): owner immunity is
// permanent inside stepShell, so the launch clearance is about clean geometry.
//
// Pure adapter: no World reference, no I/O.

import {
  CONFIG,
  fireTube,
  launcherAimPoint,
  pickTube,
  torpedoLaunchPoint,
  type ShellState,
  type TargetKind,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial } from './index.js';
import { makeBallistic } from './ballistics.js';

/** The numbers a torpedo line reads off its own effective row. */
export interface TorpedoRow {
  speed: number; // u/s
  damage: number; // hp per contact hit
  /** rad/s — 0 = a straight-runner: no steering, no torpU, no die-distance. */
  homingTurnRate: number;
  /** ms — the FOLDED reload a fired tube starts. */
  reloadMs: number;
}

/** What the core needs from the activation: the VALIDATED fire time (D1 —
 *  bornAt, which the World then pre-steps) and the projectile id mint. */
export interface TorpedoLaunchContext {
  fireT: number;
  mkId: () => string;
}

/** One line's launch parameters: its row and its OWN target mask (AR44). */
export interface TorpedoLaunchOptions {
  row: TorpedoRow;
  hits: readonly TargetKind[];
}

/**
 * LAUNCH ONE TORPEDO from the ship's launchers for the click under
 * `ship.input` (the World installs the click's own input). `torp` non-null
 * means it flew and one tube is now reloading; otherwise `denial` says why and
 * nothing changed.
 */
export function launchTorpedo(
  ctx: TorpedoLaunchContext,
  ship: ShipRecord,
  opts: TorpedoLaunchOptions,
): { torp: ShellState | null; denial: ActivationDenial | null } {
  const pose = ship.state;
  const aim = launcherAimPoint(pose, ship.hullId, ship.input.aim, ship.input.aimDist);
  const pick = pickTube(ship.launchers, ship.hullId, pose, aim);
  if (pick.verdict === 'out-of-arc') return { torp: null, denial: 'out-of-arc' };
  if (pick.verdict === 'cooling') return { torp: null, denial: 'no-ammo' };
  const { speed, damage, homingTurnRate, reloadMs } = opts.row;
  const homes = homingTurnRate > 0;
  const torp = makeBallistic(ctx.mkId(), ship, pick.bearing, ctx.fireT, {
    speed,
    // A straight-runner runs until impact or the map edge; only a STEERING
    // torpedo carries the family's finite travel budget (amendment 84f).
    range: homes ? CONFIG.torpedo.homingMaxRangeU : Number.POSITIVE_INFINITY,
    damage,
    hitRadius: CONFIG.torpedo.hitRadius, // the FAMILY's collision radius
    kind: 'torp',
    // From the launcher's station on the deck, pushed clear of the own hull.
    origin: torpedoLaunchPoint(pick.station, pose, ship.hullId, pick.bearing),
    // Contact-only, always: no target point, no blast.
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: damage,
    hits: opts.hits,
    family: null, // a torpedo has no gun family and its reveal never carries `w`
    ...(homes
      ? { homing: { turnRate: homingTurnRate, acquireRange: CONFIG.torpedo.homingAcquireRange } }
      : {}),
  });
  fireTube(ship.launchers, pick.launcher, pick.tube, reloadMs);
  return { torp, denial: null };
}
