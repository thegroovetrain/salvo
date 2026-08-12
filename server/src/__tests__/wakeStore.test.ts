// THE SERVER WAKE STORE (Story 4.12, amendments 194-196/200/205) — lifecycle
// tests for the ribbon store that OUTLIVES its sources: a ShipRecord's active
// ribbon, the torpWakes parallel store, and the orphan store that carries
// detached water until it ages out. The per-observer DISCLOSURE of this state
// is oracle-covered in perception.test.ts; this file pins the store's shape —
// sampling cadence hangs off the resolved pose, life boundaries detach at
// exactly the teleports, provisioning derives from the true attainable top
// speed, and nothing survives the practice-field wipe.

import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, createShipWake, createTorpWake, wakeCapacity } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;

/** World with no islands and a flat raster (geometry stays out of the way). */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Drive `id` full ahead for `ticks` ticks. */
function drive(w: World, id: string, ticks: number): void {
  for (let t = 1; t <= ticks; t++) {
    w.submitInput(id, { seq: t, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
  }
}

describe('world — wake ribbon store (Story 4.12)', () => {
  it('ribbon constants derive from the source: 5.5s hull water at the hull beam, 2.75s torpedo water one cell wide (LITERAL pins)', () => {
    // The one place these production derivations are pinned against literals
    // (the perception oracle reads them as state — see its header).
    expect(createShipWake('torpedoBoat', 55).lifeMs).toBe(5_500);
    expect(createShipWake('torpedoBoat', 55).widthU).toBe(9);
    expect(createShipWake('battleship', 45).widthU).toBe(32);
    expect(createShipWake('mineLayer', 50).widthU).toBe(20);
    const torp = createTorpWake();
    expect(torp.lifeMs).toBe(2_750); // 5.5s × the 0.5 torp life factor (amendment 213)
    expect(torp.widthU).toBe(9); // exactly one radar cell
  });

  it('provisions the ring from the TRUE attainable top speed — class max PLUS the boost bonus (never base kinematics alone)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // torpedoBoat 45 u/s + speedBoost 10 u/s = 55: capacity must cover the
    // boosted hull, or a boost run would silently drop the oldest tail.
    expect(a.wake.cap).toBe(wakeCapacity(55, 5_500));
    expect(a.wake.cap).toBeGreaterThan(wakeCapacity(45, 5_500));
  });

  it('samples the RESOLVED pose on the distance cadence in step(); a stopped hull lays no SEGMENT', () => {
    const w = bareWorld();
    const a = place(w, 'a', -500, 0);
    for (let i = 0; i < 10; i++) w.step();
    // A stopped hull anchors at most its ONE current-position sample (the
    // first append has no cadence predecessor) — a single sample bounds no
    // segment, so nothing exists to disclose or render.
    expect(a.wake.count).toBeLessThanOrEqual(1);
    drive(w, 'a', 100); // full ahead for 5s
    expect(a.wake.count).toBeGreaterThan(2);
    // Every stored pair of consecutive samples is at least the cadence apart.
    for (let n = 1; n < a.wake.count; n++) {
      const i = (a.wake.head + n) % a.wake.cap;
      const p = (a.wake.head + n - 1) % a.wake.cap;
      const dx = a.wake.xs[i] - a.wake.xs[p];
      const dy = a.wake.ys[i] - a.wake.ys[p];
      expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(CONFIG.vision.wakeSampleU);
    }
  });

  it('a torpedo lays a ribbon in torpWakes while it runs, and its water moves to the orphan store when it is spent', () => {
    const w = bareWorld();
    place(w, 'a', -800, 0);
    // A live fish running +x at the fixed torpedo speed, 90u of range left.
    w.shells.set('fish', {
      id: 'fish', ownerId: 'a', x: 300, y: 0,
      vx: CONFIG.torpedo.speed, vy: 0, distLeft: 90, bornAt: w.now, kind: 'torp',
      damage: CONFIG.torpedo.damage, hitRadius: CONFIG.torpedo.hitRadius,
      targetX: null, targetY: null, burstRadius: 0, contactDamage: CONFIG.torpedo.damage,
    });
    // 90u at 60 u/s = 30 ticks; run half of it and the ribbon exists.
    for (let i = 0; i < 15; i++) w.step();
    const ribbon = w.torpWakes.get('fish');
    expect(ribbon).toBeDefined();
    expect(ribbon!.count).toBeGreaterThan(1);
    // Run it to exhaustion: the shell despawns, the WATER persists (200).
    for (let i = 0; i < 20; i++) w.step();
    expect(w.shells.has('fish')).toBe(false);
    expect(w.torpWakes.has('fish')).toBe(false);
    expect(w.wakeRibbons).toContain(ribbon); // orphaned, still ageing out
    // ...and the orphan is reaped once its 6s water is gone.
    for (let i = 0; i < Math.ceil(6_000 / DT) + 2; i++) w.step();
    expect(w.wakeRibbons).not.toContain(ribbon);
  });

  it('sinking does NOT detach (a wreck stops moving; its water ages in place) — the respawn teleport DOES', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0);
    drive(w, 'b', 60);
    const laid = b.wake;
    expect(laid.count).toBeGreaterThan(0);
    w.sinkShip('b');
    expect(b.wake).toBe(laid); // still attached: the record carries it through the death gap
    // Waiting-phase respawn: the hull TELEPORTS, so the old water detaches
    // into the orphan store (a kept ribbon would chain a bogus wreck→spawn
    // segment across the map) and the new life starts clean.
    for (let i = 0; i < Math.ceil(CONFIG.ship.respawnDelay / DT) + 2; i++) w.step();
    expect(isAfloat(b.lifecycle)).toBe(true);
    expect(b.wake).not.toBe(laid);
    // The fresh ribbon holds at most the spawn-position anchor sample — no
    // segment can bridge the death gap.
    expect(b.wake.count).toBeLessThanOrEqual(1);
    expect(w.wakeRibbons).toContain(laid); // the old track still discloses until spent
  });

  it('resetForMatchStart wipes ALL practice water — active ribbons, torpedo ribbons, and orphans', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0);
    drive(w, 'a', 40);
    drive(w, 'b', 40);
    w.torpWakes.set('tw', createTorpWake());
    w.removeShip('b'); // orphan b's practice track
    expect(w.wakeRibbons.some((r) => r.count > 0)).toBe(true);
    w.resetForMatchStart();
    // A fresh match starts on clean water: every surviving ribbon is empty
    // and the parallel/orphan stores are gone (the mines/zones/buoys rule).
    expect(w.torpWakes.size).toBe(0);
    expect(w.wakeRibbons).toHaveLength(1); // a's fresh active ribbon only
    expect(w.wakeRibbons[0].count).toBe(0);
  });

  it('a speed boon re-provisions the ring in place, preserving the laid samples (the shipSpeed card)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    drive(w, 'a', 60);
    const before = a.wake;
    const laid = before.count;
    expect(laid).toBeGreaterThan(0);
    const capBefore = before.cap;
    for (let i = 0; i < 5; i++) w.applyBoon(a, 'shipSpeed'); // ×1.05⁵ maxSpeed
    expect(a.wake.cap).toBeGreaterThan(capBefore); // upsized for the faster hull
    expect(a.wake.count).toBe(laid); // every live sample replayed, none dropped
    expect(a.wake.xs[0]).toBe(before.xs[(before.head + 0) % before.cap]);
  });
});
