// A hovered WEAPON card's box (render/console/flyout.ts `rowCardFlyout` over
// readouts.ts `rowTableReadouts`): a real fold diff of the row's whole stat
// table, so DAMAGE — which climbs by tier POWER and no card face authors —
// prints whenever it moves. Contracts only: every expectation is read off
// the same folds, never a label string or a number.

import { describe, it, expect } from 'vitest';
import { CATALOG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, boonStackCount, type LineId } from '@salvo/shared';
import { cardFlyout, previewTarget, rowCardFlyout, type FlyoutModel } from '../render/console/flyout.js';
import {
  READOUT_KEY,
  hoverPreview,
  rowTableReadouts,
  shipFold,
  shownWeaponDamage,
  type ReadoutShip,
  type RowTable,
} from '../render/console/readouts.js';
import type { WeaponRowKind } from '../render/console/layout.js';
import { boonName, cardStatRows, type CardStatRow } from '../ui/boonCopy.js';
import { PREVIEW_ARROW } from '../render/console/skins.js';

const ship = (cards: readonly string[]): ReadoutShip => ({ cls: DEFAULT_CLASS_ID, cards, ib: {}, shift: DEFAULT_SHIFT });

/** The row a hovered card points at, off its real marks. */
function rowOf(you: ReadoutShip, line: string): WeaponRowKind {
  const t = previewTarget(hoverPreview(you, line));
  if (t?.kind !== 'row') throw new Error(`${line} targets no weapon row`);
  return t.row;
}

/** Everything one hover reads: the two tables, the face rows and the box. */
function hover(cards: readonly string[], line: LineId): { kind: WeaponRowKind; before: RowTable; after: RowTable; face: readonly CardStatRow[]; box: FlyoutModel | null } {
  const you = ship(cards);
  const kind = rowOf(you, line);
  const before = rowTableReadouts(you, kind)!;
  const after = rowTableReadouts(you, kind, line)!;
  const face = cardStatRows(CATALOG[line], boonStackCount(cards, line), you);
  return { kind, before, after, face, box: rowCardFlyout(boonName(line), before, after, face) };
}

const labels = (m: FlyoutModel): string[] => m.lines.map((l) => l.label);

/** Contract: no label prints twice, and every TABLE line printed moved. */
function expectOnlyMovedLines(h: ReturnType<typeof hover>): void {
  const all = labels(h.box!);
  expect(new Set(all).size).toBe(all.length);
  const was = new Map(h.before.readouts.map((r) => [r.key, r.value]));
  for (const r of h.after.readouts) {
    const printed = h.box!.lines.find((l) => l.label === r.label);
    if (was.get(r.key) === r.value) expect(printed).toBeUndefined();
    else expect(printed?.value).toContain(r.value);
  }
}

/** Every equipment line with a tier above I whose card points at a weapon
 *  row (the weapon tier cards; a Shift's points at its ability tile). */
const TIER_LINES = (Object.keys(CATALOG) as LineId[]).filter(
  (id) => CATALOG[id].kind === 'equipment' && CATALOG[id].cap > 1 && previewTarget(hoverPreview(ship([id]), id))?.kind === 'row',
);

describe('a weapon TIER card`s box — the fold diff of its row`s table', () => {
  it('supercav I → II prints the damage the picked fold shows (the face never authors it)', () => {
    const h = hover(['supercavTorpedo'], 'supercavTorpedo');
    const dmg = h.after.readouts.find((r) => r.key === READOUT_KEY.stat(h.kind, 'damage'))!;
    const was = h.before.readouts.find((r) => r.key === dmg.key)!;
    expect(dmg.raw).toBe(shownWeaponDamage(shipFold(ship(['supercavTorpedo']), 'supercavTorpedo')!, 'supercavTorpedo'));
    expect(dmg.raw).toBeGreaterThan(was.raw);
    const line = h.box!.lines.find((l) => l.label === dmg.label);
    expect(line?.value).toContain(dmg.value);
    expect(line?.value).toContain(was.value);
    expect(line?.amber).toBe(true);
    expectOnlyMovedLines(h);
  });

  it('the OLD box (the face rows alone) missed that damage line — the bug', () => {
    const h = hover(['supercavTorpedo'], 'supercavTorpedo');
    const dmg = h.after.readouts.find((r) => r.key === READOUT_KEY.stat(h.kind, 'damage'))!;
    expect(labels(cardFlyout(boonName('supercavTorpedo'), h.face)!)).not.toContain(dmg.label);
  });

  it('every tier card, at every tier it climbs: its damage line whenever damage moves, only moved lines, no label twice', () => {
    expect(TIER_LINES).toContain('supercavTorpedo');
    for (const line of TIER_LINES) {
      for (let held = 1; held < CATALOG[line].cap; held++) {
        const h = hover(Array.from({ length: held }, () => line), line);
        const key = READOUT_KEY.stat(h.kind, 'damage');
        const dmg = h.after.readouts.find((r) => r.key === key);
        const was = h.before.readouts.find((r) => r.key === key);
        if (dmg !== undefined && dmg.value !== was?.value) {
          expect(h.box!.lines.find((l) => l.label === dmg.label)?.value, `${line} ×${held}`).toContain(dmg.value);
        }
        if (h.box !== null) expectOnlyMovedLines(h);
      }
    }
  });
});

describe('fit, swap, add-on, nothing moves', () => {
  it('a FIT card prints the new weapon`s whole table, each `new ▲` (no old)', () => {
    const h = hover([], 'heavyTorpedo');
    expect(h.before.id).toBeNull();
    expect(h.box!.lines.map((l) => l.label).slice(0, h.after.readouts.length)).toEqual(h.after.readouts.map((r) => r.label));
    h.after.readouts.forEach((r, i) => expect(h.box!.lines[i].value).toBe(`${r.value} ${PREVIEW_ARROW.up}`));
    expect(new Set(labels(h.box!)).size).toBe(h.box!.lines.length);
  });

  it('a SWAP (the row`s equipment changes) prints the whole new table, `old → new` where the old table had the field', () => {
    const before = rowTableReadouts(ship(['heavyTorpedo']), 'torpedo')!;
    const after = rowTableReadouts(ship([]), 'torpedo', 'supercavTorpedo')!;
    expect(before.id).not.toBe(after.id);
    const box = rowCardFlyout('X', before, after, [])!;
    expect(labels(box)).toEqual(after.readouts.map((r) => r.label));
    after.readouts.forEach((r, i) => {
      const old = before.readouts.find((b) => b.key === r.key);
      expect(box.lines[i].value.startsWith(old === undefined ? r.value : `${old.value} `)).toBe(true);
    });
  });

  it('an ADD-ON keeps its face`s mount row beside whatever table lines it moves', () => {
    for (const line of ['secondLauncherTube', 'aftTorpedoLauncher'] as const) {
      const h = hover(['heavyTorpedo'], line);
      expect(h.face.length).toBeGreaterThan(0);
      for (const r of h.face) expect(labels(h.box!)).toContain(r.label);
      expectOnlyMovedLines(h);
    }
  });

  it('nothing moves and no face rows → no box', () => {
    const t = rowTableReadouts(ship(['heavyTorpedo']), 'torpedo')!;
    expect(rowCardFlyout('X', t, t, [])).toBeNull();
    const empty = rowTableReadouts(ship([]), 'torpedo')!;
    expect(empty).toEqual({ id: null, readouts: [] });
    expect(rowCardFlyout('X', empty, empty, [])).toBeNull();
  });

  it('an unknown class reads no table (fail-open, never throws)', () => {
    expect(rowTableReadouts({ ...ship([]), cls: 'nope' as ReadoutShip['cls'] }, 'torpedo')).toBeNull();
  });

  it('the secondaries read their own two readouts; the main battery its table', () => {
    expect(rowTableReadouts(ship([]), 'secondaries')!.readouts.length).toBeGreaterThan(0);
    expect(rowTableReadouts(ship([]), 'mainBattery')!.id).not.toBeNull();
  });
});
