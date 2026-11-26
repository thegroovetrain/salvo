// THE BAR'S COOLDOWN ICONS (render/console/slots.ts, Story 12.3 Part B, AC 29
// / 30). "None of the cooldown icons should EVER shift in position for ANY
// reason": every slot position is a pure function of the tile's body, the
// hull's turret count and the mine KIND — identical across every unlock,
// tube, rack, capacity, reload and preview combination. Plus the per-slot
// state (locked / open / live) and the bottom-up fill clip.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_CLASS_ID,
  MINE_EQUIPMENT_IDS,
  SHIP_CLASS_IDS,
  effectiveStats,
  rackCapacity,
  rackCount,
  turretMounts,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { barLayout } from '../render/console/layout.js';
import { mountClock, type MountClock, type RackPips } from '../render/console/readouts.js';
import {
  clipBelow,
  fillLine,
  iconOutline,
  mountCounts,
  previewCounts,
  rackSlots,
  rackStates,
  shellSlots,
  shellStates,
  slotsPerRack,
  tubeSlots,
  tubeStates,
  type MountCounts,
} from '../render/console/slots.js';

const B = CLIENT_CONFIG.console.bar;
const L = barLayout(1920, 1080);
const body = (kind: string) => L.weapons.tiles.find((t) => t.kind === kind)!.body;
const counts = (launchers: number, tubesPer: number, racks: number, capacity: number): MountCounts => ({ launchers, tubes: launchers * tubesPer, racks, capacity });

/** Every reachable mount combination: launchers × tubes per launcher × racks × capacity. */
const COMBOS: MountCounts[] = [];
for (const l of [0, 1, 2]) for (const t of [1, 2]) for (const r of [0, 1, 2]) for (const c of [1, 2, 3, 4]) COMBOS.push(counts(l, t, r, c));

describe('fixed positions — NO icon ever moves (AC 30)', () => {
  it('MAIN BATTERY: one shell per turret of every hull, in the body, never overlapping', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const n = turretMounts(cls).length;
      const slots = shellSlots(body('mainBattery'), n);
      expect(slots).toHaveLength(n);
      for (let i = 1; i < n; i++) expect(slots[i].x).toBeGreaterThanOrEqual(slots[i - 1].x + slots[i - 1].w);
      for (const s of slots) expect(s.x + s.w).toBeLessThanOrEqual(body('mainBattery').x + body('mainBattery').w);
    }
  });

  it('the slot positions are identical across every unlock / reload / preview state (the state functions never move a slot)', () => {
    const tubes = tubeSlots(body('torpedo'));
    for (const id of MINE_EQUIPMENT_IDS) {
      const racks = rackSlots(body('mines'), slotsPerRack(id));
      for (const now of COMBOS) {
        for (const next of [now, COMBOS[COMBOS.length - 1]]) {
          // the geometry takes no state at all: recomputing it under any state is the same object shape and numbers
          expect(tubeSlots(body('torpedo'))).toEqual(tubes);
          expect(rackSlots(body('mines'), slotsPerRack(id))).toEqual(racks);
          expect(tubeStates([], now, next)).toHaveLength(tubes.length);
          const rs = rackStates([], [], slotsPerRack(id), now, next);
          expect(rs).toHaveLength(racks.rings.length);
          for (const r of rs) expect(r.slots).toHaveLength(slotsPerRack(id));
        }
      }
    }
  });

  it('TORPEDO: always four tubes in two pairs, the pairs apart by more than the tubes inside one', () => {
    const t = tubeSlots(body('torpedo'));
    expect(t).toHaveLength(B.tubePairs * B.tubesPerPair);
    const inPair = t[1].x - (t[0].x + t[0].w);
    const between = t[2].x - (t[1].x + t[1].w);
    expect(between).toBeGreaterThan(inPair);
    expect(t.map((s) => s.group)).toEqual([0, 0, 1, 1]);
  });

  it('MINES: always two racks, each a ring then its fixed slots, all inside the tile body', () => {
    for (const id of MINE_EQUIPMENT_IDS) {
      const per = slotsPerRack(id);
      const { rings, slots } = rackSlots(body('mines'), per);
      expect(rings).toHaveLength(B.racks);
      expect(slots).toHaveLength(B.racks * per);
      const b = body('mines');
      for (const s of [...rings, ...slots]) expect(s.x + s.w).toBeLessThanOrEqual(b.x + b.w + 1e-9);
      for (const s of slots) expect(s.x).toBeGreaterThan(rings[s.group].x);
    }
  });

  it('a rack`s fixed slots hold the most mines any reachable build can rack (EXPANDED MINE RACKS included)', () => {
    const spec = CONFIG.shipClasses[DEFAULT_CLASS_ID];
    for (const id of MINE_EQUIPMENT_IDS) {
      for (const cards of [[], ['secondMineRack'], ['expandedMineRacks'], ['secondMineRack', 'expandedMineRacks']]) {
        const stats = effectiveStats(spec, cards, CATALOG);
        expect(rackCapacity(stats, id), `${id} ${cards.join('+')}`).toBeLessThanOrEqual(slotsPerRack(id));
        expect(rackCount(stats)).toBeLessThanOrEqual(B.racks);
      }
    }
    expect(slotsPerRack(null)).toBe(slotsPerRack('navalMines')); // an empty mines tile lays out as naval
  });
});

describe('per-slot state — locked in place, open under a card, live otherwise', () => {
  const clocks: MountClock[] = [mountClock(0, 10_000, 0), mountClock(4000, 10_000, 0), mountClock(1500, 10_000, 1), mountClock(0, 10_000, 1)];

  it('MAIN BATTERY: every turret`s shell carries its own turret`s clock; none is ever locked', () => {
    const s = shellStates(clocks, 3);
    expect(s).toHaveLength(3);
    s.forEach((x, i) => {
      expect(x.locked).toBe(false);
      expect(x.clock).toBe(clocks[i]);
    });
    expect(shellStates([], 4).every((x) => x.clock === null)).toBe(true);
  });

  it('TORPEDO: tube (g, t) is mounted only under g launchers × t tubes; the rest locked, OPEN where a card mounts them', () => {
    const one = counts(1, 1, 0, 0);
    const s = tubeStates(clocks, one);
    expect(s.map((x) => x.locked)).toEqual([false, true, true, true]);
    expect(s[0].clock).toBe(clocks[0]);
    // AFT LAUNCHER: the aft pair's first tube opens
    expect(tubeStates(clocks, one, counts(2, 1, 0, 0)).map((x) => x.open)).toEqual([false, false, true, false]);
    // a second tube per launcher (the kind's count): the fore pair's second tube opens
    expect(tubeStates(clocks, one, counts(1, 2, 0, 0)).map((x) => x.open)).toEqual([false, true, false, false]);
    // no torpedo: everything locked
    expect(tubeStates([], counts(0, 1, 0, 0)).every((x) => x.locked && !x.open)).toBe(true);
  });

  it('MINES: a rack past the count is locked, a slot past the capacity locked; held mines fill from the first slot', () => {
    const racks: RackPips[] = [{ rack: 0, held: 2, capacity: 3 }];
    const s = rackStates(racks, [mountClock(3000, 15_000, 0)], 4, counts(0, 0, 1, 3));
    expect(s[0].locked).toBe(false);
    expect(s[0].slots.map((m) => [m.locked, m.held])).toEqual([[false, true], [false, true], [false, false], [true, false]]);
    expect(s[1].locked).toBe(true);
    expect(s[1].slots.every((m) => m.locked && !m.open)).toBe(true);
    // SECOND MINE RACK + EXPANDED: the whole second rack and the fourth slots open amber
    const p = rackStates(racks, [], 4, counts(0, 0, 1, 3), counts(0, 0, 2, 4));
    expect(p[1].open).toBe(true);
    expect(p[0].slots[3].open).toBe(true);
    expect(p[1].slots.every((m) => m.open)).toBe(true);
  });

  it('the counts come off the readouts and a card`s marks', () => {
    const now = mountCounts([
      { key: 'row.torpedo.launchers', label: '', value: '1', raw: 1, role: 'count' },
      { key: 'row.torpedo.tubes', label: '', value: '1', raw: 1, role: 'count' },
    ]);
    expect(now).toEqual({ launchers: 1, tubes: 1, racks: 0, capacity: 0 });
    const marks = new Map([['row.torpedo.launchers', { key: 'row.torpedo.launchers', value: '2', raw: 2, from: 1, direction: 'up' as const }]]);
    expect(previewCounts(now, marks).launchers).toBe(2);
    expect(previewCounts(now, null)).toBe(now);
  });
});

describe('the fill — from the bottom, inside the icon', () => {
  const r = { x: 10, y: 20, w: 22, h: 37 };
  const shell = iconOutline('shell', r);

  it('the fill line climbs from the bottom (empty) to the top (full), clamped', () => {
    expect(fillLine(r, 0)).toBe(r.y + r.h);
    expect(fillLine(r, 1)).toBe(r.y);
    expect(fillLine(r, 2)).toBe(r.y);
    expect(fillLine(r, Number.NaN)).toBe(r.y + r.h);
  });

  it('clips the outline to the part below the line: nothing above it, the whole shape at the top', () => {
    const half = clipBelow(shell, fillLine(r, 0.5));
    expect(half.length).toBeGreaterThanOrEqual(3);
    for (const p of half) expect(p.y).toBeGreaterThanOrEqual(fillLine(r, 0.5) - 1e-9);
    expect(clipBelow(shell, r.y - 5)).toHaveLength(shell.length);
    expect(clipBelow(shell, r.y + r.h + 5)).toHaveLength(0);
  });

  it('the outlines sit inside their slots', () => {
    for (const kind of ['shell', 'torp'] as const) {
      for (const p of iconOutline(kind, r)) {
        expect(p.x).toBeGreaterThanOrEqual(r.x);
        expect(p.x).toBeLessThanOrEqual(r.x + r.w);
        expect(p.y).toBeGreaterThanOrEqual(r.y);
        expect(p.y).toBeLessThanOrEqual(r.y + r.h);
      }
    }
  });
});
