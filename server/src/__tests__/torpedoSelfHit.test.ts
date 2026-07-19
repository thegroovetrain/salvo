// Torpedo self-hit fix (HULLCRACKER_NOTES "PROBLEMS SO FAR"): a full-speed
// firer must never re-catch its own fish. Root cause (traced, owner-confirmed):
// the old spawn point landed EXACTLY on the firer's own collision boundary
// (hull capsule reach + torpedo hitRadius, zero margin), guarded only by a
// 100ms/2-tick self-hit grace — and World.step moves ships BEFORE shells are
// tested, so at full speed the firer closed that margin faster than the
// fish's edge rebuilt it, deterministically re-contacting it the tick grace
// expired. The fix is three levers together: CONFIG.torpedo.spawnClearance
// (real spawn margin baked into makeBallistic's offset), selfHitGrace bumped
// 100ms -> 500ms (owner-only backstop, never touches hitting enemies), and
// speed 55 -> 70 (torps now outrun every ship class, pinned separately by
// damageGuardrail.test). This file pins the spawn geometry directly and
// reproduces the owner's exact full-throttle bug end to end via the real World.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  WEAPON,
  hullEndpoints,
  pointSegmentDistance,
  type DamageEvent,
  type GameEvent,
  type ShipClassId,
  type UpgradeId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fireTorpedo } from '../game/equipment/torpedoes.js';

function bareWorld(seed = 11): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Place a ship at an exact pose, bypassing spawn-ring placement. */
function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading: number,
  classId: ShipClassId = 'destroyer',
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, classId);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Stack `count` upgrades of one type through the real grant seam (mirrors upgrades.test.ts). */
function stack(w: World, ship: ShipRecord, type: UpgradeId, count: number): void {
  for (let i = 0; i < count; i++) w.applyUpgrade(ship, type);
}

const dmgOf = (events: readonly GameEvent[]): DamageEvent[] =>
  events.filter((e): e is DamageEvent => e.k === 'dmg');

// ---------- spawn geometry ---------------------------------------------------

describe('torpedo spawn clearance (root-cause fix)', () => {
  it('a fresh torpedo spawns outside the firer capsule + hitRadius by at least spawnClearance', () => {
    const w = bareWorld();
    const ship = place(w, 'a', 0, 0, 0);
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, weapon: WEAPON.torpedo };
    const torp = fireTorpedo(ship, 0, () => 't1');
    expect(torp).not.toBeNull();
    const hull = hullEndpoints(ship.state.x, ship.state.y, ship.state.heading, ship.cls.hull);
    const dist = pointSegmentDistance({ x: torp!.x, y: torp!.y }, hull.stern, hull.bow);
    const margin = dist - hull.radius - torp!.hitRadius;
    // The old spawn point had margin === 0 exactly; the fix guarantees
    // margin >= spawnClearance, with a tiny epsilon for float rounding.
    expect(margin).toBeGreaterThanOrEqual(CONFIG.torpedo.spawnClearance - 1e-9);
  });
});

// ---------- integration: the owner's exact full-throttle bug -----------------

describe('torpedo self-hit — full-throttle destroyer end to end', () => {
  /** Throttle a destroyer to max speed, fire a bow torpedo at `aim`, then run
   *  5 more seconds and return every dmg event observed. */
  function runFullThrottleShot(aim: number, maxSpeedStacks = 0): { dmgs: DamageEvent[]; ship: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // destroyer, bow points +x (heading 0)
    if (maxSpeedStacks > 0) stack(w, a, 'maxSpeed', maxSpeedStacks);

    const dmgs: DamageEvent[] = [];

    // Full ahead, aimed at the bow, weapon selected but not fired yet.
    w.submitInput('a', { seq: 1, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, weapon: WEAPON.torpedo });
    const accelTicks = Math.ceil(a.stats.kinematics.maxSpeed / a.stats.kinematics.accel / (CONFIG.tick.simDtMs / 1000)) + 20;
    for (let i = 0; i < accelTicks; i++) {
      w.step();
      dmgs.push(...dmgOf(w.tickEvents));
    }
    expect(a.state.speed).toBeCloseTo(a.stats.kinematics.maxSpeed, 1); // confirmed at full speed

    // Fire the bow torpedo (one click: fireSeq bumps).
    w.submitInput('a', { seq: 2, throttle: 1, rudder: 0, aim, fireSeq: 1, aimDist: 0, weapon: WEAPON.torpedo });
    const fireTicks = 5000 / CONFIG.tick.simDtMs;
    for (let i = 0; i < fireTicks; i++) {
      w.step();
      dmgs.push(...dmgOf(w.tickEvents));
    }
    return { dmgs, ship: a };
  }

  it('straight ahead: firer takes no damage, no dmg event names it as victim', () => {
    const { dmgs, ship } = runFullThrottleShot(0);
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(dmgs.some((e) => e.id === 'a')).toBe(false);
  });

  it('aimed at the +30° arc edge: firer takes no damage, no dmg event names it as victim', () => {
    const { dmgs, ship } = runFullThrottleShot(CONFIG.torpedo.halfArc);
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(dmgs.some((e) => e.id === 'a')).toBe(false);
  });

  it('straight ahead with 3 maxSpeed upgrade stacks: firer takes no damage', () => {
    const { dmgs, ship } = runFullThrottleShot(0, 3);
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(dmgs.some((e) => e.id === 'a')).toBe(false);
  });
});
