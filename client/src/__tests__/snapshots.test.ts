import { describe, it, expect } from 'vitest';
import {
  SnapshotBuffer,
  ContactStore,
  MAX_EXTRAPOLATION_MS,
  RETENTION_MS,
} from '../net/snapshots.js';
import { wrapAngle } from '@salvo/shared';

function snap(t: number, x: number, y = 0, heading = 0, speed = 0) {
  return { t, x, y, heading, speed };
}

describe('SnapshotBuffer sampling', () => {
  it('returns null when empty', () => {
    expect(new SnapshotBuffer().sampleAt(100)).toBeNull();
  });

  it('lerps position and speed inside a bracket', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(100, 0, 0, 0, 10));
    buf.push(snap(150, 10, 20, 0, 20));
    buf.push(snap(200, 40, 40, 0, 0));
    const s = buf.sampleAt(125)!;
    expect(s.x).toBeCloseTo(5, 9);
    expect(s.y).toBeCloseTo(10, 9);
    expect(s.speed).toBeCloseTo(15, 9);
    const s2 = buf.sampleAt(175)!;
    expect(s2.x).toBeCloseTo(25, 9);
  });

  it('finds the right bracket with binary search across many samples', () => {
    const buf = new SnapshotBuffer();
    for (let i = 0; i <= 10; i++) buf.push(snap(1000 + i * 50, i * 100));
    const s = buf.sampleAt(1330)!; // between i=6 (1300) and i=7 (1350)
    expect(s.x).toBeCloseTo(660, 9);
  });

  it('interpolates heading along the shortest arc across the wrap', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0, 0, 3.0));
    buf.push(snap(100, 0, 0, -3.0)); // 0.283 rad away through pi, not 6 rad back
    const s = buf.sampleAt(50)!;
    const expected = wrapAngle(3.0 + wrapAngle(-3.0 - 3.0) * 0.5);
    expect(s.heading).toBeCloseTo(expected, 9);
    expect(Math.abs(s.heading)).toBeGreaterThan(3.0); // went through pi
  });

  it('clamps to the oldest sample before the buffer starts', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(500, 42, 7));
    buf.push(snap(550, 50, 9));
    const s = buf.sampleAt(100)!;
    expect(s.x).toBe(42);
    expect(s.y).toBe(7);
  });

  it('extrapolates along heading*speed on underrun, capped at 100ms', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0));
    buf.push(snap(1000, 100, 0, 0, 20)); // heading +x at 20 u/s
    const s = buf.sampleAt(1050)!;
    expect(s.x).toBeCloseTo(100 + 20 * 0.05, 9);
    const capped = buf.sampleAt(1000 + MAX_EXTRAPOLATION_MS)!;
    const frozen = buf.sampleAt(5000)!; // way past: frozen at the cap
    expect(frozen.x).toBeCloseTo(capped.x, 9);
    expect(frozen.x).toBeCloseTo(102, 9);
  });

  it('drops non-monotonic pushes', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(100, 1));
    buf.push(snap(100, 2)); // duplicate t: dropped
    buf.push(snap(50, 3)); // older: dropped
    expect(buf.size).toBe(1);
    expect(buf.sampleAt(100)!.x).toBe(1);
  });

  it('retains only ~RETENTION_MS of history', () => {
    const buf = new SnapshotBuffer();
    for (let t = 0; t <= 3000; t += 50) buf.push(snap(t, t));
    expect(buf.newest!.t).toBe(3000);
    expect(buf.size).toBeLessThanOrEqual(RETENTION_MS / 50 + 1);
    // Oldest retained sample is no older than the retention window.
    const oldest = buf.sampleAt(-Infinity)!;
    expect(3000 - oldest.t).toBeLessThanOrEqual(RETENTION_MS);
  });

  it('clear() empties the buffer (respawn snap)', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 1));
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.sampleAt(0)).toBeNull();
  });
});

describe('ContactStore lifecycle', () => {
  const contact = (id: string, x = 0) =>
    ({ id, x, y: 0, heading: 0, speed: 0, cls: 'torpedoBoat' as const });

  it('creates a buffer on first sight and feeds it per frame', () => {
    const store = new ContactStore();
    store.pushFrame(100, [contact('a', 1)]);
    store.pushFrame(150, [contact('a', 2), contact('b', 9)]);
    expect([...store.ids()].sort()).toEqual(['a', 'b']);
    expect(store.get('a')!.sampleAt(125)!.x).toBeCloseTo(1.5, 9);
  });

  it('records each contact class as a static attribute, cleared on prune', () => {
    const store = new ContactStore();
    store.pushFrame(100, [{ id: 'a', x: 0, y: 0, heading: 0, speed: 0, cls: 'battleship' }]);
    expect(store.classOf('a')).toBe('battleship');
    store.prune(1000, 100); // a is now stale
    expect(store.classOf('a')).toBeUndefined();
  });

  it('preserves a drone hull id (HullId, not narrowed to a ship class)', () => {
    const store = new ContactStore();
    store.pushFrame(100, [{ id: 'd', x: 0, y: 0, heading: 0, speed: 0, cls: 'droneMedium' }]);
    expect(store.classOf('d')).toBe('droneMedium');
  });

  it('prunes contacts unseen past the ttl and reports removals', () => {
    const store = new ContactStore();
    store.pushFrame(100, [contact('a'), contact('b')]);
    store.pushFrame(500, [contact('a')]);
    const removed = store.prune(700, 300); // a seen 200ms ago, b 600ms ago
    expect(removed).toEqual(['b']);
    expect(store.get('b')).toBeUndefined();
    expect(store.get('a')).toBeDefined();
  });

  it('clear(id) drops history so a respawned contact snaps', () => {
    const store = new ContactStore();
    store.pushFrame(100, [contact('a', 0)]);
    store.clear('a');
    store.pushFrame(150, [contact('a', 500)]);
    expect(store.get('a')!.sampleAt(100)!.x).toBe(500); // clamps to new spawn
  });
});
