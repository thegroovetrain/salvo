// Owner weapon immunity (Eric ruling 2026-07-19): own weapons NEVER damage the
// owner — gun shells, torpedoes, AND mines. This retires the old timed self-hit
// grace entirely in favor of permanent owner exclusion in the hit-test path.
// The original HULLCRACKER_NOTES bug (a full-speed torpedo boat re-catching its
// own fish, torpedoBoat maxSpeed 50 now stackable past torpedo speed 70 via
// maxSpeed upgrades) is now impossible BY LAW rather than by margin+grace
// tuning. spawnClearance and bow/stern-clear spawn offsets are KEPT for clean
// spawn geometry (they still prevent degenerate spawn overlap with OTHER
// ships). This file pins the spawn geometry directly and the permanent
// immunity law end to end across all three weapons via the real World.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  type DamageEvent,
  type GameEvent,
  type ShellState,
  type ShipClassId,
  type UpgradeId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

/** Torpedo slot index under the universal fit (loadout slot 1). */
const SLOT_TORPEDO = 1;
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
  classId: ShipClassId = 'torpedoBoat',
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
  it('a fresh torpedo spawns outside the firer silhouette + hitRadius by at least spawnClearance', () => {
    const w = bareWorld();
    const ship = place(w, 'a', 0, 0, 0);
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO };
    const torp = fireTorpedo(ship, 0, () => 't1');
    expect(torp).not.toBeNull();
    const poly = transformPolygon(hullSilhouette(ship.hullId), ship.state.x, ship.state.y, ship.state.heading);
    const dist = pointPolygonDistance({ x: torp!.x, y: torp!.y }, poly);
    const margin = dist - torp!.hitRadius;
    // The old spawn point had margin === 0 exactly; the fix guarantees
    // margin >= spawnClearance, with a tiny epsilon for float rounding. In the
    // silhouette geometry the bow tip sits EXACTLY at +length/2, so a bow shot
    // pins the offset math with no capsule slack.
    expect(margin).toBeGreaterThanOrEqual(CONFIG.torpedo.spawnClearance - 1e-9);
  });
});

// ---------- integration: the owner's exact full-throttle bug -----------------

describe('torpedo self-hit — full-throttle torpedo boat end to end', () => {
  /** Throttle a torpedo boat (fastest hull: maxSpeed 50 vs torpedo speed 70)
   *  to max speed, fire a bow torpedo at `aim`, then run 5 more seconds and
   *  return every dmg event observed. */
  function runFullThrottleShot(aim: number, maxSpeedStacks = 0): { dmgs: DamageEvent[]; ship: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // torpedoBoat, bow points +x (heading 0)
    if (maxSpeedStacks > 0) stack(w, a, 'maxSpeed', maxSpeedStacks);

    const dmgs: DamageEvent[] = [];

    // Full ahead, aimed at the bow, weapon selected but not fired yet.
    w.submitInput('a', { seq: 1, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_TORPEDO });
    const accelTicks = Math.ceil(a.stats.kinematics.maxSpeed / a.stats.kinematics.accel / (CONFIG.tick.simDtMs / 1000)) + 20;
    for (let i = 0; i < accelTicks; i++) {
      w.step();
      dmgs.push(...dmgOf(w.tickEvents));
    }
    expect(a.state.speed).toBeCloseTo(a.stats.kinematics.maxSpeed, 1); // confirmed at full speed

    // Fire the bow torpedo (one click: fireSeq bumps).
    w.submitInput('a', { seq: 2, throttle: 1, rudder: 0, aim, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO });
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

  it('straight ahead with 5 maxSpeed stacks (hull OUTRUNS the fish) — firer STILL takes no damage', () => {
    // 50 · 1.08^5 ≈ 73.5 u/s > torpedo speed 70: the boat now overtakes its own
    // fish, the exact geometry the old margin+grace fix depended on. Permanent
    // owner immunity makes a self-hit impossible regardless.
    expect(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed * 1.08 ** 5).toBeGreaterThan(
      CONFIG.torpedo.speed,
    );
    const { dmgs, ship } = runFullThrottleShot(0, 5);
    expect(ship.stats.kinematics.maxSpeed).toBeGreaterThan(CONFIG.torpedo.speed);
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(dmgs.some((e) => e.id === 'a')).toBe(false);
  });
});

// ---------- permanent owner immunity across all three weapons ----------------

describe('own weapons never damage the owner (gun / torpedo / mine)', () => {
  /** Inject a live shell owned by `owner` sitting on top of `target`. */
  function injectShell(w: World, target: ShipRecord, ownerId: string, kind: 'shell' | 'torp'): void {
    const s: ShellState = {
      id: `x-${ownerId}-${target.id}`,
      ownerId,
      x: target.state.x,
      y: target.state.y,
      vx: CONFIG.gun.shellSpeed,
      vy: 0,
      distLeft: CONFIG.vision.radar,
      bornAt: 0,
      kind,
      damage: kind === 'torp' ? CONFIG.torpedo.damage : CONFIG.gun.damage,
      hitRadius: kind === 'torp' ? CONFIG.torpedo.hitRadius : CONFIG.gun.shellRadius,
      // Contact-only hit rule: immunity must hold on the plain interception
      // path (the burst path's owner immunity is pinned in combat.test.ts).
      targetX: null,
      targetY: null,
      burstRadius: 0,
      contactDamage: kind === 'torp' ? CONFIG.torpedo.damage : CONFIG.gun.contactDamage,
    };
    w.shells.set(s.id, s);
  }

  it('a gun shell sitting on its OWN firer deals no damage, but hits an enemy', () => {
    const w = bareWorld();
    const owner = place(w, 'a', 0, 0, 0);
    const enemy = place(w, 'b', 400, 0, 0);
    injectShell(w, owner, 'a', 'shell'); // owner's shell on the owner
    injectShell(w, enemy, 'a', 'shell'); // owner's shell on the enemy
    w.step();
    expect(owner.hp).toBe(owner.stats.maxHp); // permanent owner immunity
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp); // enemies still take gun hits
  });

  it('a torpedo sitting on its OWN firer deals no damage, but hits an enemy', () => {
    const w = bareWorld();
    const owner = place(w, 'a', 0, 0, 0);
    const enemy = place(w, 'b', 400, 0, 0);
    injectShell(w, owner, 'a', 'torp');
    injectShell(w, enemy, 'a', 'torp');
    w.step();
    expect(owner.hp).toBe(owner.stats.maxHp);
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp); // enemies still take torpedo hits
  });

  it('an armed mine under its OWN owner never triggers, but triggers under an enemy', () => {
    const w = bareWorld();
    const owner = place(w, 'a', 0, 0, 0);
    w.mines.set('m-own', { id: 'm-own', ownerId: 'a', x: owner.state.x, y: owner.state.y, armedAt: 0 });
    w.step();
    expect(owner.hp).toBe(owner.stats.maxHp); // owner never trips its own mine
    expect(w.mines.has('m-own')).toBe(true); // still live (never triggered)

    const enemy = place(w, 'b', 400, 0, 0);
    w.mines.set('m-enemy', { id: 'm-enemy', ownerId: 'a', x: enemy.state.x, y: enemy.state.y, armedAt: 0 });
    w.step();
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp); // enemies still trip owner's mine
    expect(w.mines.has('m-enemy')).toBe(false); // consumed on trigger
  });
});
