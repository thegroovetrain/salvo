// Story 12.4 — the level-up stat flash (render/console/statFlash.ts) and its
// seat on the HUD bar's ship rows (barShip.ts `ShipRows`): the smooth blend
// amber → normal (held, then a smoothstep fade) and the rise detector (seed on
// the first read, only risen stats, a reset on redeploy). Numbers come from
// CLIENT_CONFIG, never pinned.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CLASS_ID, DEFAULT_SHIFT, INDEX_IDS, type IndexBonus } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { StatRises, flashAmount, flashColor, mixColor, smoothstep01 } from '../render/console/statFlash.js';
import { ShipRows } from '../render/console/barShip.js';
import { barLayout } from '../render/console/layout.js';
import { READOUT_KEY, shipReadouts, type PreviewMarks } from '../render/console/readouts.js';

const C = CLIENT_CONFIG.colors;
const F = CLIENT_CONFIG.statFlash;
const NORMAL = C.phosphor;

describe('the blend', () => {
  it('is amber at the rise and through the hold', () => {
    expect(flashColor(0, NORMAL)).toBe(C.amber);
    expect(flashColor(F.holdMs / 2, NORMAL)).toBe(C.amber);
    expect(flashColor(F.holdMs, NORMAL)).toBe(C.amber);
  });

  it('is a smoothstep mix mid-fade — strictly between the two colors, not a step', () => {
    const mid = F.holdMs + F.fadeMs / 2;
    expect(flashAmount(mid)).toBeCloseTo(1 - smoothstep01(0.5), 12);
    expect(flashColor(mid, NORMAL)).toBe(mixColor(NORMAL, C.amber, 0.5));
    const quarter = flashAmount(F.holdMs + F.fadeMs / 4);
    expect(quarter).toBeGreaterThan(0.75); // smoothstep: slow out of the hold
    expect(quarter).toBeLessThan(1);
    const c = flashColor(mid, NORMAL);
    expect(c).not.toBe(NORMAL);
    expect(c).not.toBe(C.amber);
  });

  it('falls monotonically and is exactly the normal color once the fade is over', () => {
    let prev = 1;
    for (let t = F.holdMs; t <= F.holdMs + F.fadeMs; t += F.fadeMs / 20) {
      const k = flashAmount(t);
      expect(k).toBeLessThanOrEqual(prev);
      prev = k;
    }
    expect(flashColor(F.holdMs + F.fadeMs, NORMAL)).toBe(NORMAL);
    expect(flashColor(F.holdMs + F.fadeMs * 10, NORMAL)).toBe(NORMAL);
  });

  it('no rise yet (negative / -Infinity / NaN elapsed) is the normal color; the dials are followed', () => {
    expect(flashColor(Number.NEGATIVE_INFINITY, NORMAL)).toBe(NORMAL);
    expect(flashColor(Number.POSITIVE_INFINITY, NORMAL)).toBe(NORMAL);
    expect(flashColor(Number.NaN, NORMAL)).toBe(NORMAL);
    expect(flashColor(-1, NORMAL)).toBe(NORMAL);
    const t = { holdMs: 100, fadeMs: 200 };
    expect(flashAmount(100, t)).toBe(1);
    expect(flashAmount(200, t)).toBeCloseTo(0.5, 12);
    expect(flashAmount(300, t)).toBe(0);
    expect(flashAmount(101, { holdMs: 100, fadeMs: 0 })).toBe(0);
  });

  it('mixColor mixes per channel and clamps k', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0x102030, 0xffffff, -1)).toBe(0x102030);
    expect(mixColor(0x102030, 0xffffff, 2)).toBe(0xffffff);
  });
});

describe('the rise detector', () => {
  const ARMOR = INDEX_IDS.indexOf('armor');
  const INTEL = INDEX_IDS.indexOf('intel');

  it('the first observation only seeds — a bonus already there never flashes', () => {
    const r = new StatRises();
    r.observe({ armor: 3, intel: 1 }, 1000);
    for (let i = 0; i < INDEX_IDS.length; i++) expect(r.roseAt(i)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('stamps only the stats that rose; an unchanged (a 0 face) or fallen stat stamps nothing', () => {
    const r = new StatRises();
    r.observe({ armor: 1, intel: 2 }, 1000);
    r.observe({ armor: 3, intel: 2 }, 2000);
    expect(r.roseAt(ARMOR)).toBe(2000);
    for (let i = 0; i < INDEX_IDS.length; i++) if (i !== ARMOR) expect(r.roseAt(i)).toBe(Number.NEGATIVE_INFINITY);
    r.observe({ armor: 3, intel: 1 }, 3000);
    expect(r.roseAt(ARMOR)).toBe(2000);
    expect(r.roseAt(INTEL)).toBe(Number.NEGATIVE_INFINITY);
    r.observe({ armor: 3, intel: 2 }, 4000); // back up from the fall: a rise
    expect(r.roseAt(INTEL)).toBe(4000);
  });

  it('a stat appearing from nothing is a rise; junk counts read as 0 (the shared acceptance rule)', () => {
    const r = new StatRises();
    r.observe({}, 0);
    r.observe({ engines: 1, power: Number.NaN } as IndexBonus, 10);
    expect(r.roseAt(INDEX_IDS.indexOf('engines'))).toBe(10);
    expect(r.roseAt(INDEX_IDS.indexOf('power'))).toBe(Number.NEGATIVE_INFINITY);
  });

  it('reset (join / redeploy) forgets the stamps and makes the next observation a seed', () => {
    const r = new StatRises();
    r.observe({}, 0);
    r.observe({ armor: 2 }, 10);
    r.reset();
    expect(r.roseAt(ARMOR)).toBe(Number.NEGATIVE_INFINITY);
    r.observe({ armor: 5 }, 20);
    expect(r.roseAt(ARMOR)).toBe(Number.NEGATIVE_INFINITY);
    r.observe({ armor: 6 }, 30);
    expect(r.roseAt(ARMOR)).toBe(30);
  });
});

describe('the flash on the HUD bar`s ship rows', () => {
  const ROWS = barLayout(1920, 1080).ship.rows;
  const READOUTS = shipReadouts({ cls: DEFAULT_CLASS_ID, cards: [], ib: {}, shift: DEFAULT_SHIFT })!;
  const ARMOR = INDEX_IDS.indexOf('armor');
  const POWER = INDEX_IDS.indexOf('power');

  it('only the risen stat turns amber, then fades back to phosphor; the first read never flashes', () => {
    const rows = new ShipRows();
    rows.update(READOUTS, null, ROWS, 1, { armor: 2 }, 1000);
    expect(rows.valueColor(ARMOR)).toBe(NORMAL);
    rows.update(READOUTS, null, ROWS, 1, { armor: 3 }, 2000);
    expect(rows.valueColor(ARMOR)).toBe(C.amber);
    expect(rows.valueColor(POWER)).toBe(NORMAL);
    rows.update(READOUTS, null, ROWS, 1, { armor: 3 }, 2000 + F.holdMs + F.fadeMs / 2);
    expect(rows.valueColor(ARMOR)).toBe(flashColor(F.holdMs + F.fadeMs / 2, NORMAL));
    rows.update(READOUTS, null, ROWS, 1, { armor: 3 }, 2000 + F.holdMs + F.fadeMs);
    expect(rows.valueColor(ARMOR)).toBe(NORMAL);
  });

  it('a hover preview`s amber mark wins while it shows; a reset re-seeds', () => {
    const rows = new ShipRows();
    rows.update(READOUTS, null, ROWS, 1, {}, 0);
    const armorKey = READOUT_KEY.index('armor');
    const preview: PreviewMarks = new Map([[armorKey, { key: armorKey, value: '120', raw: 120, from: 100, direction: 'up' as const }]]);
    rows.update(READOUTS, null, ROWS, 1, { armor: 1 }, 100); // armor rises: flashing
    const late = 100 + F.holdMs + F.fadeMs * 2; // its flash is long over...
    rows.update(READOUTS, preview, ROWS, 1, { armor: 1 }, late);
    expect(rows.valueColor(ARMOR)).toBe(C.amber); // ...but the hover mark holds it amber
    rows.update(READOUTS, null, ROWS, 1, { armor: 2 }, late + 1); // a rise under no hover
    rows.update(READOUTS, preview, ROWS, 1, { armor: 2 }, late + F.holdMs + F.fadeMs / 2);
    expect(rows.valueColor(ARMOR)).toBe(C.amber); // the mark wins over a mid-fade blend
    expect(rows.valueColor(POWER)).toBe(NORMAL);
    rows.reset();
    rows.update(READOUTS, null, ROWS, 1, { armor: 4 }, 5000);
    expect(rows.valueColor(ARMOR)).toBe(NORMAL);
  });
});
