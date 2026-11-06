// Owner weapon immunity (Eric ruling 2026-07-19): own weapons NEVER damage the
// owner — gun shells, torpedoes, AND mines. This retires the old timed self-hit
// grace entirely in favor of permanent owner exclusion in the hit-test path.
// The original HULLCRACKER_NOTES bug (a full-speed torpedo boat re-catching its
// own fish, torpedoBoat maxSpeed 45 now stackable past torpedo speed (65, catalog-v3 R17) via
// maxSpeed upgrades) is now impossible BY LAW rather than by margin+grace
// tuning. spawnClearance and bow/stern-clear spawn offsets are KEPT for clean
// spawn geometry (they still prevent degenerate spawn overlap with OTHER
// ships). This file pins the spawn geometry directly and the permanent
// immunity law end to end across all three weapons via the real World.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  launcherDeadRad,
  launcherTrainRad,
  effectiveStats,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  type DamageEvent,
  type GameEvent,
  type ShellState,
  type CatalogLine,
  type Catalog,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';

/** Torpedo slot index: the FIRST weapon slot (Q), where the Torpedo Boat's
 *  spawn seed lands `heavyTorpedo` since Story 8.5's nine-slot loadout. */
const SLOT_TORPEDO = 2;
/** u — a torpedo click's aim distance (Story 10.6: any positive distance
 *  names the bearing; none names no area and is refused). */
const TORP_DIST = 600;
/** u — a click so far out that the bearing from the fore launcher's station
 *  IS the click's bearing from the hull centre (the band-edge cases below
 *  must not be pushed out of the band by station parallax). */
const FAR_DIST = 1e7;
import { fireTorpedo } from '../game/equipment/torpedoes.js';

function bareWorld(seed = 11, opts?: WorldOptions): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

/** An INJECTED overdrive catalog: the production SPEED ladder caps at 4 copies
 *  (45 + 4x2.5 = 55 < the 65 u/s fish, catalog-v3 R17 — a max-stacked hull
 *  cannot outrun its own torpedo, by guardrail design). The outrun geometry
 *  the margin+grace fix depended on therefore needs a line production does
 *  not have, so the test injects a 9-rung SPEED ladder rather than
 *  overdriving past a real cap. */
const OVERDRIVE: Catalog = {
  // The TB's CLASS WEAPON line, carried in from production: the fixture below
  // fits it as a CARD (Story 8.10 deleted the interim spawn seed, so a hull
  // comes up with an empty weapon row), and applyCard resolves ids against
  // THIS World's catalog — an injected catalog without the line would leave
  // the torpedo boat with no torpedo. Tier I is the bare weapon, so carrying
  // it moves no number here.
  heavyTorpedo: CATALOG.heavyTorpedo,
  engines: {
    id: 'engines',
    kind: 'ladder',
    cap: 9,
    // Story 10.3: speed is DERIVED from the ENGINES index (maxSpeed is no
    // longer stat-addressable), so the injected rung steps ENGINES.
    tiers: new Array(9).fill([{ kind: 'stat', path: 'engines', add: 20 }]),
  } as unknown as CatalogLine,
};

/** Place a ship at an exact pose, bypassing spawn-ring placement. */
function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading: number,
  classId: ShipClassId = 'bismarck',
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', classId, undefined, undefined);
  // THE CLASS WEAPON IS A CARD NOW (Story 8.10, amendment 62): the interim
  // spawn seed is deleted and a hull comes up with gun + Shift and an EMPTY
  // weapon row, so this fixture fits it explicitly through the same applyCard
  // path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Stack `count` copies of one catalog line through the real grant seam
 *  (World.applyCard — mirrors upgrades.test.ts). */
function stack(w: World, ship: ShipRecord, lineId: string, count: number): void {
  for (let i = 0; i < count; i++) w.applyCard(ship, lineId);
}

const dmgOf = (events: readonly GameEvent[]): DamageEvent[] =>
  events.filter((e): e is DamageEvent => e.k === 'dmg');

// ---------- spawn geometry ---------------------------------------------------

describe('torpedo spawn clearance (root-cause fix)', () => {
  // R28 (Eric 2026-11-06) made the dead-ahead BOW shot illegal; it was the
  // only bearing on which the launch point cleared the silhouette by the full
  // hitRadius + spawnClearance measured PERPENDICULARLY (the bow tip sits on
  // the ray). On a side bearing the shared `torpedoLaunchPoint` /
  // `muzzleSpawnFrom` construction measures its clearance ALONG the ray, and
  // the slanted hull side leaves a perpendicular margin a few units short of
  // spawnClearance — a pre-existing property of the shared construction (the
  // ±140° arc allowed these shots too), reported, not re-derived here. What
  // every legal shot does guarantee is the shared law: the spawn is outside
  // the silhouette by at least the torpedo's hitRadius, so it can never
  // overlap its own hull.
  it('a fresh torpedo spawns outside the firer silhouette by at least its hitRadius', () => {
    const w = bareWorld();
    const ship = place(w, 'a', 0, 0, 0);
    for (const l of ship.launchers) l.a = Math.PI / 2; // trained on the beam (R28: never dead ahead)
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: Math.PI / 2, fireSeq: 1, aimDist: TORP_DIST, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
    const torp = fireTorpedo(ship, 0, () => 't1');
    expect(torp).not.toBeNull();
    const poly = transformPolygon(hullSilhouette(ship.hullId), ship.state.x, ship.state.y, ship.state.heading);
    const dist = pointPolygonDistance({ x: torp!.x, y: torp!.y }, poly);
    const margin = dist - torp!.hitRadius;
    // The old spawn point had margin === 0 exactly (inside the hit radius).
    expect(margin).toBeGreaterThan(0);
  });
});

// ---------- integration: the owner's exact full-throttle bug -----------------

describe('torpedo self-hit — full-throttle torpedo boat end to end', () => {
  /** Throttle a torpedo boat (fastest class: maxSpeed 45 vs torpedo speed 65, catalog-v3 R17)
   *  to max speed, fire a bow torpedo at `aim`, then run 5 more seconds and
   *  return every dmg event observed. */
  function runFullThrottleShot(aim: number, maxSpeedStacks = 0): { dmgs: DamageEvent[]; ship: ShipRecord; launched: number } {
    const w = bareWorld(11, maxSpeedStacks > 0 ? { catalog: OVERDRIVE } : undefined);
    const a = place(w, 'a', 0, 0, 0); // torpedoBoat, bow points +x (heading 0)
    if (maxSpeedStacks > 0) stack(w, a, 'engines', maxSpeedStacks);

    const dmgs: DamageEvent[] = [];

    // Full ahead, aimed where the shot will go (the launchers train on it
    // while the hull accelerates — Story 10.6, R13), weapon selected but not
    // fired yet.
    w.submitInput('a', { seq: 1, throttle: 1, rudder: 0, aim, fireSeq: 0, aimDist: FAR_DIST, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    const accelTicks = Math.ceil(a.stats.kinematics.maxSpeed / a.stats.kinematics.accel / (CONFIG.tick.simDtMs / 1000)) + 20;
    for (let i = 0; i < accelTicks; i++) {
      w.step();
      dmgs.push(...dmgOf(w.tickEvents));
    }
    expect(a.state.speed).toBeCloseTo(a.stats.kinematics.maxSpeed, 1); // confirmed at full speed

    // Fire the bow torpedo (one click: fireSeq bumps).
    w.submitInput('a', { seq: 2, throttle: 1, rudder: 0, aim, fireSeq: 1, aimDist: FAR_DIST, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    const fireTicks = 5000 / CONFIG.tick.simDtMs;
    let launched = 0;
    for (let i = 0; i < fireTicks; i++) {
      w.step();
      launched += w.tickEvents.filter((e) => e.k === 'torp').length;
      dmgs.push(...dmgOf(w.tickEvents));
    }
    return { dmgs, ship: a, launched };
  }

  /** rad — just inside the FORWARD edge of the fore launcher's firing band
   *  (R28): the most nearly ahead a torpedo can leave, the self-overtake case. */
  const FORWARD_EDGE = launcherDeadRad('bismarck', 0) + 0.01; // the fixture's hull, its FORE launcher (R30)

  it('at the forward edge of the band: firer takes no damage, no dmg event names it as victim', () => {
    const { dmgs, ship, launched } = runFullThrottleShot(FORWARD_EDGE);
    expect(launched).toBe(1); // the shot really left
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(dmgs.some((e) => e.id === 'a')).toBe(false);
  });

  it('aimed near the fore launcher\'s arc edge: firer takes no damage, no dmg event names it as victim', () => {
    const { dmgs, ship, launched } = runFullThrottleShot(launcherTrainRad('bismarck', 0) - 0.01);
    expect(launched).toBe(1);
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(dmgs.some((e) => e.id === 'a')).toBe(false);
  });

  it('at the forward edge with the hull OVERDRIVEN past the fish — firer STILL takes no damage', () => {
    // FR7'S OUTRUN LAW IS RETIRED (Eric 2026-09-11, AR49; Story 8.9,
    // amendment 55). "A torpedo outruns every hull" is no longer a requirement
    // the catalog has to satisfy: a SPEED-capped Torpedo Boat with the boost
    // open now makes 68.75 u/s (55 + 25 %) against the 65 u/s fish and OUTRUNS
    // it — and that is ALLOWED, because the safety property is no longer a
    // speed inequality but PERMANENT OWNER IMMUNITY (Story 8.4: own ordnance
    // can never damage its owner's hull, under any geometry).
    //
    // The numbers below are FACTS, not law, and 8.13 may move them: catalog v3
    // caps SPEED at 4 copies (45 + 4x2.5 = 55 u/s un-boosted), so the INJECTED
    // 9-rung ladder above (45 + 9x2.5 = 67.5 > 65) is no longer NEEDED to reach
    // the outrun geometry — the boost gets there on the shipped ladder. It
    // stays as a STRESS PIN: the most extreme overtake the harness can build,
    // held against the immunity rule rather than against a speed budget.
    expect(
      effectiveStats(CONFIG.shipClasses.bismarck, new Array<string>(9).fill('engines'), OVERDRIVE).kinematics.maxSpeed,
    ).toBeGreaterThan(CONFIG.torpedo.speed);
    const { dmgs, ship, launched } = runFullThrottleShot(FORWARD_EDGE, 9);
    expect(launched).toBe(1);
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
      family: kind === 'torp' ? null : 'cannon',
      damage: kind === 'torp' ? CONFIG.torpedo.damage : CONFIG.gun.damage,
      hitRadius: kind === 'torp' ? CONFIG.torpedo.hitRadius : CONFIG.gun.shellRadius,
      // Contact-only hit rule: immunity must hold on the plain interception
      // path (the burst path's owner immunity is pinned in combat.test.ts).
      targetX: null,
      targetY: null,
      burstRadius: 0,
      contactDamage: kind === 'torp' ? CONFIG.torpedo.damage : CONFIG.gun.contactDamage,
      hits: kind === 'torp' ? CONFIG.torpedo.hits : CONFIG.gun.hits,
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
    w.mines.set('m-own', { id: 'm-own', ownerId: 'a', x: owner.state.x, y: owner.state.y, armedAt: 0, kind: 'naval', hp: 10 });
    w.step();
    expect(owner.hp).toBe(owner.stats.maxHp); // owner never trips its own mine
    expect(w.mines.has('m-own')).toBe(true); // still live (never triggered)

    const enemy = place(w, 'b', 400, 0, 0);
    w.mines.set('m-enemy', { id: 'm-enemy', ownerId: 'a', x: enemy.state.x, y: enemy.state.y, armedAt: 0, kind: 'naval', hp: 10 });
    w.step();
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp); // enemies still trip owner's mine
    expect(w.mines.has('m-enemy')).toBe(false); // consumed on trigger
  });
});
