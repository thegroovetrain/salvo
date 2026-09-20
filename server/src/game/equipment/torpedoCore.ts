// THE TORPEDO CORE (Story 8.13) — ONE launch path for EVERY fish in the game.
//
// Three lines now put a `torp` on the water and they differ ONLY in numbers
// and in the shape of the arc they are legal in:
//
//   heavyTorpedo    — equipment, bow sector (CONFIG.torpedo)
//   lightTorpedo    — equipment, TWIN beam sectors (CONFIG.lightTorpedo)
//   supercavTorpedo — a belt CONSUMABLE, bow +/-15 deg (CONFIG.supercavTorpedo,
//                     epic-8 amendment 74)
//
// Everything else about a fish is the FAMILY's (epic-8 amendment 84e —
// `CONFIG.torpedo` is the heavy's block AND the family's shared fields): the
// hit radius, the spawn clearance, the homing acquire range and the homing
// die-distance. So the per-line modules carry their own row numbers and their
// own arc id, and this module owns the one spawn.
//
// HOMING IS A TIER STAT, NOT A DOCTRINE (Eric ruling 2026-09-19, amendment
// 80): ACOUSTIC HOMING is deleted and `homingTurnRate` rides the row — 0 at
// tier I, 0.5 rad/s at tier V on both torpedo lines, 0.3 on the captive
// mine's fish (amendment 82). ZERO IS THE STRAIGHT-RUNNER, and it is a
// STRUCTURAL zero: at 0 the fish carries NO `homing` tag at all (so
// sim/shell.ts never steers it and perception never emits a `torpU` for it)
// and NO die-distance (`range` = Infinity — it runs until impact or the map
// edge, catalog-v3 section 4 / amendment 84f: no torpedo line has a max
// range). Above zero it takes the row's rate with the family's acquire range
// and the family's total-travel budget, which exists so an orbiting fish
// cannot live forever (Story 2.8 review, P8).
//
// ORDER OF CHECKS, and why it is not negotiable: ARC FIRST, and an arc miss
// spends NOTHING. That is the shipped torpedo grammar and it is also what
// keeps the SUPERCAV consumable honest — a click outside the bow sector must
// leave the copy on the belt (the ONE SPEND LAW, equipment/consumables/
// row.ts). `spend` is therefore a thunk the caller owns: the equipment lines
// hand it their slot pool's `consume`, the consumable hands it a no-op,
// because its factory takes the copy on `ok` instead.
//
// NO FRIENDLY FIRE, ALWAYS (Eric ruling 2026-07-19): owner immunity is
// permanent inside stepShell, so the spawn clearance here is about clean
// geometry and nothing else — including for the LIGHT torpedo, which at
// 45-55 u/s is slower than every hull and can genuinely be re-caught by its
// own firer (FR53, allowed).
//
// Pure adapter: no World reference, no I/O, no state.

import {
  CONFIG,
  arcFor,
  inArc,
  twinSectorSide,
  wrapAngle,
  type ShellState,
  type SlotItemId,
  type TargetKind,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial } from './index.js';
import { clampToArc } from './guns.js';
import { makeBallistic } from './ballistics.js';

/** The THREE numbers a torpedo line reads off its own effective row (or, for
 *  the consumable, straight out of its CONFIG block — a stack has no row).
 *  Everything else a fish needs is the family's. */
export interface TorpedoRow {
  speed: number; // u/s
  damage: number; // hp per contact hit
  /** rad/s — 0 = a straight-runner: no steering, no torpU, no die-distance. */
  homingTurnRate: number;
}

/** What the core needs from the activation: the VALIDATED fire time (D1 —
 *  bornAt, which the World then pre-steps) and the projectile id mint. A
 *  narrow record rather than the whole ActivationContext so the test-facing
 *  `fireTorpedo` helper can call this without building one. */
export interface TorpedoLaunchContext {
  fireT: number;
  mkId: () => string;
}

/** One line's launch parameters. `id` is what the ARC is looked up by (the
 *  shared `arcFor` is the single arc-shape source, so the enforced arc and the
 *  client's rendered arc can never diverge); `hits` is the firing row's OWN
 *  target mask (AR44 — required, never borrowed from another row). */
export interface TorpedoLaunchOptions {
  id: SlotItemId;
  row: TorpedoRow;
  hits: readonly TargetKind[];
  /** Take the round. `false` = the pool was empty ('no-ammo'). Runs ONLY
   *  after the arc check has passed, so an arc miss costs nothing. */
  spend: () => boolean;
}

/**
 * The launch BEARING for `id`'s arc given this ship's pose, or `null` when the
 * aim is out of arc. Both declared shapes are handled and nothing else is:
 *
 *   sector      — the heavy's bow cone and the supercav's +/-15 deg. In-arc
 *                 aims pass through `clampToArc` (an identity here, kept so
 *                 the shipped clamp grammar has exactly one home).
 *   twin-sector — the LIGHT torpedo's two beam tubes. `twinSectorSide` is the
 *                 BROADSIDE's rule verbatim (R2.2): the side whose sector
 *                 contains the click is the side that fires, and a click in
 *                 NEITHER — the 90 deg dead zones fore and aft — is denied.
 *
 * THE FISH HEADS TOWARD THE CLICK on every arc kind: the light torpedo is not
 * side-mounted geometry, it simply refuses the fore/aft dead zones. A `full`
 * or `none` arc on a torpedo is an authoring error, thrown at the call rather
 * than silently launching into a 360 deg free-fire.
 */
export function torpedoBearing(ship: ShipRecord, id: SlotItemId): number | null {
  const arc = arcFor(id);
  if (arc.kind === 'twin-sector') {
    const side = twinSectorSide(ship.state.heading, ship.input.aim, arc);
    if (side === null) return null; // bow/stern dead zone
    return clampToArc(ship.input.aim, wrapAngle(ship.state.heading + side * arc.offset), arc.halfArc);
  }
  if (arc.kind !== 'sector') throw new Error(`'${id}' is not a torpedo arc (equipment/torpedoCore.ts)`);
  const center = wrapAngle(ship.state.heading + arc.offset);
  if (!inArc(ship.input.aim, center, arc.halfArc)) return null;
  return clampToArc(ship.input.aim, center, arc.halfArc);
}

/**
 * LAUNCH ONE FISH. Arc first (nothing spent on a miss), then the round, then
 * the spawn. `torp` non-null means it flew; otherwise `denial` says why.
 */
export function launchTorpedo(
  ctx: TorpedoLaunchContext,
  ship: ShipRecord,
  opts: TorpedoLaunchOptions,
): { torp: ShellState | null; denial: ActivationDenial | null } {
  const dir = torpedoBearing(ship, opts.id);
  if (dir === null) return { torp: null, denial: 'out-of-arc' };
  if (!opts.spend()) return { torp: null, denial: 'no-ammo' };
  const { speed, damage, homingTurnRate } = opts.row;
  const homes = homingTurnRate > 0;
  const torp = makeBallistic(ctx.mkId(), ship, dir, ctx.fireT, {
    speed,
    // A straight-runner runs until impact or the map edge; only a STEERING
    // fish carries the family's finite travel budget (amendment 84f).
    range: homes ? CONFIG.torpedo.homingMaxRangeU : Number.POSITIVE_INFINITY,
    damage,
    hitRadius: CONFIG.torpedo.hitRadius, // the FAMILY's collision radius
    spawnClearance: CONFIG.torpedo.spawnClearance, // the FAMILY's clean-spawn margin
    kind: 'torp',
    // Contact-only, always (COMMAND DETONATION is deleted): no target point,
    // no blast, an interceptor takes the full torpedo damage.
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: damage,
    hits: opts.hits,
    ...(homes
      ? { homing: { turnRate: homingTurnRate, acquireRange: CONFIG.torpedo.homingAcquireRange } }
      : {}),
  });
  return { torp, denial: null };
}
