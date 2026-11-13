// THE PLAIN HULL CHANNEL (Story 11.2, R3 — net/plainContacts.ts, the store's
// `plain` half, and the tier handoff in ContactStore.pushFrame) and its views
// (render/plainHullViews.ts through ContactViews). Contracts: a `pc` row makes
// a view, a missing row removes it, and a hull changing tier is never drawn
// twice — whatever the handle does.

import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, SHIP_CLASS_IDS, type Contact, type PlainContact } from '@salvo/shared';
import { ContactStore } from '../net/snapshots.js';
import { HANDOFF_WINDOW_MS, PLAIN_HULL_LENGTH_U, PlainContactStore, matchHandoff } from '../net/plainContacts.js';
import { ContactViews, type PlateFrame } from '../render/contacts.js';
import { NameplateLayer } from '../render/nameplates.js';
import { plainHullPolygon } from '../render/plainHull.js';

const row = (h: string, x: number, y = 0): PlainContact => ({ h, x, y, heading: 0, speed: 10 });
const contact = (id: string, x: number, y = 0): Contact => ({ id, cls: SHIP_CLASS_IDS[0], x, y, heading: 0, speed: 10 }) as Contact;

const TICK = CONFIG.tick.simDtMs;
const PLATES: PlateFrame = { nameOf: () => null, camera: { worldToScreen: (p) => p, zoom: 1 }, pad: 0 };

/** Push a frame and render it (dt one tick), returning [full views, plain views]. */
function step(store: ContactStore, views: ContactViews, t: number, cs: Contact[], pc: PlainContact[] | undefined): [number, number] {
  store.pushFrame(t, cs, pc);
  views.render(store, t - CONFIG.tick.interpDelayMs, t, TICK, () => 'enemy', PLATES);
  return [views.count, views.plainCount];
}

describe('PlainContactStore — frame-authoritative', () => {
  it('a row creates a handle; a row missing from the next frame removes it on that frame', () => {
    const s = new PlainContactStore();
    expect(s.pushFrame(0, [row('a', 100)]).map((p) => p.key)).toEqual(['a']);
    expect([...s.ids()]).toEqual(['a']);
    expect(s.pushFrame(TICK, [row('a', 101)])).toEqual([]); // an update, not a new handle
    s.pushFrame(2 * TICK, []);
    expect(s.size).toBe(0);
    expect(s.recentlyDeparted().map((d) => d.key)).toEqual(['a']);
  });

  it('an omitted `pc` key is "none"; a malformed row is dropped, never a throw', () => {
    const s = new PlainContactStore();
    s.pushFrame(0, [row('a', 1)]);
    s.pushFrame(TICK, undefined);
    expect(s.size).toBe(0);
    s.pushFrame(2 * TICK, [{ h: 'b', x: Number.NaN, y: 0, heading: 0, speed: 0 }, row('c', 5)]);
    expect([...s.ids()]).toEqual(['c']);
  });

  it('a departed handle stays pairable for one handoff window only', () => {
    const s = new PlainContactStore();
    s.pushFrame(0, [row('a', 1)]);
    s.pushFrame(TICK, []);
    s.pushFrame(TICK + HANDOFF_WINDOW_MS + 1, []);
    expect(s.recentlyDeparted()).toEqual([]);
  });
});

describe('matchHandoff — near, recent, one-to-one', () => {
  it('pairs within a plain-hull length and the window; never two appearing hulls to one gone', () => {
    const gone = [{ key: 'g', x: 0, y: 0, t: 0 }];
    expect(matchHandoff([{ key: 'a', x: PLAIN_HULL_LENGTH_U / 2, y: 0, t: TICK }], gone)).toEqual([['a', 'g']]);
    expect(matchHandoff([{ key: 'a', x: PLAIN_HULL_LENGTH_U * 2, y: 0, t: TICK }], gone)).toEqual([]);
    expect(matchHandoff([{ key: 'a', x: 1, y: 0, t: HANDOFF_WINDOW_MS + 1 }], gone)).toEqual([]);
    const two = matchHandoff([{ key: 'a', x: 1, y: 0, t: TICK }, { key: 'b', x: 2, y: 0, t: TICK }], gone);
    expect(two).toHaveLength(1);
  });
});

describe('ContactViews — the plain hull and the tier handoff', () => {
  const fresh = (): { store: ContactStore; views: ContactViews } => {
    const layer = new Container();
    return { store: new ContactStore(), views: new ContactViews(layer, new NameplateLayer(new Container())) };
  };

  it('a `pc` row makes a plain view and no full contact; a missing row takes it away', () => {
    const { store, views } = fresh();
    expect(step(store, views, 1000, [], [row('h1', 500)])).toEqual([0, 1]);
    expect([...store.ids()]).toEqual([]); // no roster id, so no voice / body / target
    // The row stops: the view fades out (no handoff) and is then gone.
    let t = 1000;
    for (let i = 0; i < 10; i++) step(store, views, (t += TICK), [], []);
    expect(views.plainCount).toBe(0);
  });

  it('INWARD: the plain row ends and a contact begins near it — never two hulls on any frame', () => {
    const { store, views } = fresh();
    let t = 1000;
    for (let i = 0; i < 4; i++) step(store, views, (t += TICK), [], [row('h1', 500 + i)]);
    const [full, plain] = step(store, views, (t += TICK), [contact('ship', 505)], []);
    expect(full + plain).toBe(1);
    expect(full).toBe(1);
  });

  it('INWARD across a gap frame (the contact a frame later, inside the window): still one hull after the swap', () => {
    const { store, views } = fresh();
    let t = 1000;
    for (let i = 0; i < 4; i++) step(store, views, (t += TICK), [], [row('h1', 500)]);
    step(store, views, (t += TICK), [], []); // the gap: the plain view starts fading
    const [full, plain] = step(store, views, (t += TICK), [contact('ship', 501)], []);
    expect([full, plain]).toEqual([1, 0]);
  });

  it('OUTWARD: the contact stops and a NEW handle begins near it — the contact goes at once', () => {
    const { store, views } = fresh();
    let t = 1000;
    for (let i = 0; i < 4; i++) step(store, views, (t += TICK), [contact('ship', 500 + i)], undefined);
    const [full, plain] = step(store, views, (t += TICK), [], [row('h9', 504)]);
    expect([full, plain]).toEqual([0, 1]);
    expect(store.get('ship')).toBeUndefined();
  });

  it('a handle change never leaves two views for one row (out, in, and out again under a new handle)', () => {
    const { store, views } = fresh();
    let t = 1000;
    const frames: Array<[Contact[], PlainContact[]]> = [
      [[contact('ship', 500)], []],
      [[], [row('h1', 501)]],
      [[], [row('h1', 502)]],
      [[contact('ship', 503)], []],
      [[], [row('h2', 504)]],
      [[], [row('h2', 505)]],
    ];
    for (const [cs, pc] of frames) {
      const [full, plain] = step(store, views, (t += TICK), cs, pc);
      expect(full + plain, `t=${t}`).toBe(1);
    }
  });

  it('two unrelated hulls far apart are both drawn — the handoff never merges strangers', () => {
    const { store, views } = fresh();
    expect(step(store, views, 1000, [contact('ship', 0)], [row('h1', PLAIN_HULL_LENGTH_U * 10)])).toEqual([1, 1]);
  });
});

describe('plainHullPolygon — one generic shape at the mean hull length', () => {
  it('spans exactly the plain-hull length bow to stern, and is symmetric about the keel', () => {
    const p = plainHullPolygon();
    const xs = p.map((v) => v.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(PLAIN_HULL_LENGTH_U, 9);
    for (const v of p) expect(p.some((w) => Math.abs(w.x - v.x) < 1e-9 && Math.abs(w.y + v.y) < 1e-9)).toBe(true);
  });

  it('its length is the mean of the four hulls — longer than the shortest, shorter than the longest', () => {
    const lengths = SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id].hull.length);
    expect(PLAIN_HULL_LENGTH_U).toBeCloseTo(lengths.reduce((a, b) => a + b, 0) / lengths.length, 9);
  });
});
