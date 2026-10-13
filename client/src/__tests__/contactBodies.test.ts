// The predictor's contact bodies (sim/contactBodies.ts, Story 9.5 — epic-9
// amendment 74): built from the SAME sampled poses the contact renderer draws,
// for SIGHTED contacts only — never the own hull, never a ghost the buffer has
// frozen past its dead-reckoning limit — with the class (or drone envelope)
// base hp as mass, and reused across frames.

import { describe, expect, it } from 'vitest';
import { hullEnvelope, hullSilhouette, transformPolygon, type Contact, type HullId } from '@salvo/shared';
import { ContactStore, MAX_EXTRAPOLATION_MS } from '../net/snapshots.js';
import { ContactBodies } from '../sim/contactBodies.js';

function contact(id: string, cls: HullId, x: number, y: number, heading = 0): Contact {
  return { id, x, y, heading, speed: 0, cls };
}

describe('ContactBodies.build', () => {
  it('poses each sighted contact at the sample time, with its envelope hp as mass', () => {
    const store = new ContactStore();
    store.pushFrame(1000, [contact('a', 'battleship', 10, 20, 0.5), contact('d', 'droneSmall', -40, 0)]);
    const bodies = new ContactBodies().build(store, 1000, 'me');
    expect(bodies.map((b) => b.id).sort()).toEqual(['a', 'd']);
    const a = bodies.find((b) => b.id === 'a')!;
    expect(a.state).toMatchObject({ x: 10, y: 20, heading: 0.5 });
    expect(a.poly).toEqual(transformPolygon(hullSilhouette('battleship'), 10, 20, 0.5));
    expect(a.mass).toBe(hullEnvelope('battleship').hp);
    expect(a.movable).toBe(true);
    expect(bodies.find((b) => b.id === 'd')!.mass).toBe(hullEnvelope('droneSmall').hp);
  });

  it('never includes the own hull', () => {
    const store = new ContactStore();
    store.pushFrame(1000, [contact('me', 'torpedoBoat', 0, 0), contact('a', 'mineLayer', 50, 0)]);
    expect(new ContactBodies().build(store, 1000, 'me').map((b) => b.id)).toEqual(['a']);
  });

  it('drops a contact once the sample time runs past its live dead-reckoning', () => {
    const store = new ContactStore();
    store.pushFrame(1000, [contact('a', 'battleship', 0, 0)]);
    const cb = new ContactBodies();
    expect(cb.build(store, 1000 + MAX_EXTRAPOLATION_MS, 'me')).toHaveLength(1);
    expect(cb.build(store, 1000 + MAX_EXTRAPOLATION_MS + 1, 'me')).toHaveLength(0);
  });

  it('reuses one body per id across frames', () => {
    const store = new ContactStore();
    store.pushFrame(1000, [contact('a', 'battleship', 0, 0)]);
    const cb = new ContactBodies();
    const first = cb.build(store, 1000, 'me')[0];
    store.pushFrame(1050, [contact('a', 'battleship', 5, 0)]);
    const second = cb.build(store, 1050, 'me')[0];
    expect(second).toBe(first);
    expect(second.state.x).toBe(5);
  });
});
