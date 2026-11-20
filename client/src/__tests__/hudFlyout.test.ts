// THE FLYOUT (render/console/flyout.ts + ui/hudFlyout.ts, Story 12.3 Part B,
// AC 34 / 36) and SPACE-HOME's camera focus (render/camera.ts, AC 28).

import { describe, it, expect, beforeEach } from 'vitest';
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, effectiveStats } from '@salvo/shared';
import {
  abilityChangeFlyout,
  abilityFlyout,
  cardFlyout,
  changeText,
  previewTarget,
  rowChangeFlyout,
  shipCardFlyouts,
  stackTops,
  weaponFlyout,
} from '../render/console/flyout.js';
import { PREVIEW_ARROW } from '../render/console/skins.js';
import {
  hoverPreview,
  rowStats,
  shipFold,
  shipReadouts,
  type AbilityModel,
  type PreviewMark,
  type ReadoutShip,
  type WeaponRowModel,
} from '../render/console/readouts.js';
import { ABILITY_KINDS, WEAPON_ROW_KINDS } from '../render/console/layout.js';
import { HudFlyout } from '../ui/hudFlyout.js';
import { Camera } from '../render/camera.js';
import { openWaterOffset } from '../render/console/layout.js';

const YOU: ReadoutShip = { cls: DEFAULT_CLASS_ID, cards: [], ib: {}, shift: DEFAULT_SHIFT };
const STATS = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], [], CATALOG);

describe('previewTarget — which tile a hovered card changes', () => {
  it('a ship-stat ladder points at the ship rows, even where it also moves weapon numbers', () => {
    expect(previewTarget(hoverPreview(YOU, 'armor'))).toEqual({ kind: 'ship' });
    expect(previewTarget(hoverPreview(YOU, 'power'))).toEqual({ kind: 'ship' });
  });

  it('a weapon card points at its weapon tile; an ability ladder at its ability tile', () => {
    expect(previewTarget(hoverPreview(YOU, 'heavyTorpedo'))).toEqual({ kind: 'row', row: 'torpedo' });
    expect(previewTarget(hoverPreview(YOU, 'hullRepair'))).toEqual({ kind: 'ability', ability: 'repair' });
  });

  it('nothing hovered (or nothing marked) points nowhere', () => {
    expect(previewTarget(null)).toBeNull();
    expect(previewTarget(new Map())).toBeNull();
  });
});

describe('the flyout`s lines', () => {
  it('a weapon tile prints its stat lines; an empty slot opens nothing', () => {
    const stats = [{ key: 'row.torpedo.damage', label: 'DAMAGE', value: '250', raw: 250, role: 'stat' as const }];
    const row = { kind: 'torpedo', name: 'HEAVY TORPEDO', stats } as unknown as WeaponRowModel;
    expect(weaponFlyout(row)).toEqual({ title: 'HEAVY TORPEDO', lines: [{ label: 'DAMAGE', value: '250', amber: false }] });
    expect(weaponFlyout({ ...row, stats: [] })).toBeNull();
  });

  it('an ability tile prints its tooltip table off the live fold', () => {
    const ab = { kind: 'repair', name: 'HULL REPAIR' } as AbilityModel;
    const m = abilityFlyout(ab, STATS, DEFAULT_SHIFT);
    expect(m.title).toBe('HULL REPAIR');
    expect(m.lines.length).toBeGreaterThan(0);
    expect(abilityFlyout({ kind: 'shift', name: 'X' } as AbilityModel, STATS, DEFAULT_SHIFT).lines.length).toBeGreaterThan(0);
  });

  it('a card`s change reads `old → new ▲`, ▼ where the number falls, `new ▲` for a new number', () => {
    expect(changeText({ label: 'DAMAGE', cur: '26', next: '28' })).toBe(`26 → 28 ${PREVIEW_ARROW.up}`);
    expect(changeText({ label: 'RELOAD', cur: '15.0S', next: '13.5S' })).toBe(`15.0S → 13.5S ${PREVIEW_ARROW.down}`);
    expect(changeText({ label: 'DAMAGE', cur: null, next: '250' })).toBe(`250 ${PREVIEW_ARROW.up}`);
    const m = cardFlyout('ARMOR', [{ label: 'ARMOR', cur: '100', next: '120' }])!;
    expect(m.lines.every((l) => l.amber)).toBe(true);
    expect(cardFlyout('AFT LAUNCHER', [])).toBeNull();
  });
});

// --- a hovered SHIP-stat card opens every box it moves (Eric 2026-11-20) -----------

/** The bar's weapon rows for a ship, off its real readouts (name = kind). */
function shipRows(you: ReadoutShip): WeaponRowModel[] {
  const readouts = shipReadouts(you)!;
  return WEAPON_ROW_KINDS.map((kind) => ({ kind, name: kind, stats: rowStats(kind, readouts) }) as unknown as WeaponRowModel);
}

const ABILITIES = ABILITY_KINDS.map((kind) => ({ kind, name: kind }) as AbilityModel);

function folds(you: ReadoutShip, line: string) {
  return { before: shipFold(you)!, after: shipFold(you, line)! };
}

describe('shipCardFlyouts — which boxes a ship-stat card opens', () => {
  const ARMED: ReadoutShip = { ...YOU, cards: ['heavyTorpedo'] };

  it('POWER opens a box on every damage-dealing row, each line a marked stat, amber `old → new`', () => {
    const marks = hoverPreview(ARMED, 'power')!;
    const rows = shipRows(ARMED);
    const boxes = shipCardFlyouts(rows, ABILITIES, marks, folds(ARMED, 'power'), DEFAULT_SHIFT);
    const opened = new Set(boxes.filter((b) => !b.ability).map((b) => rows[b.row].kind));
    for (const row of rows) {
      const dealsDamage = row.stats.some((r) => r.key === `row.${row.kind}.damage`);
      const moved = row.stats.some((r) => marks.has(r.key));
      expect(opened.has(row.kind), row.kind).toBe(moved);
      if (dealsDamage) expect(moved, row.kind).toBe(true);
    }
    expect(opened.has('mainBattery') && opened.has('torpedo')).toBe(true);
    for (const b of boxes) expect(b.model.lines.every((l) => l.amber && l.value.includes(PREVIEW_ARROW.up))).toBe(true);
  });

  it('a row the card moves nothing in stays closed; only the moved lines print', () => {
    const rows = shipRows(ARMED);
    const torp = rows[WEAPON_ROW_KINDS.indexOf('torpedo')];
    const key = torp.stats[0].key;
    const marks = new Map<string, PreviewMark>([[key, { key, value: '999', raw: 999, from: torp.stats[0].raw, direction: 'up' }]]);
    const boxes = shipCardFlyouts(rows, ABILITIES, marks, null, DEFAULT_SHIFT);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ row: WEAPON_ROW_KINDS.indexOf('torpedo'), ability: false });
    expect(boxes[0].model.lines).toHaveLength(1);
    expect(boxes[0].model.lines[0].value).toBe(changeText({ label: '', cur: torp.stats[0].value, next: '999' }));
    expect(rowChangeFlyout(rows[0], new Map())).toBeNull();
  });

  it('an ability opens only where its table`s printed values differ between the two folds', () => {
    const f = folds(YOU, 'hullRepair');
    const ab = ABILITIES[ABILITY_KINDS.indexOf('repair')];
    expect(abilityChangeFlyout(ab, f.before, f.before, DEFAULT_SHIFT)).toBeNull();
    const m = abilityChangeFlyout(ab, f.before, f.after, DEFAULT_SHIFT);
    expect(m).not.toBeNull();
    expect(m!.lines.every((l) => l.amber)).toBe(true);
    const before = abilityFlyout(ab, f.before, DEFAULT_SHIFT).lines;
    const after = abilityFlyout(ab, f.after, DEFAULT_SHIFT).lines;
    expect(m!.lines).toHaveLength(after.filter((l, i) => l.value !== before[i].value).length);
  });

  it('a card that moves no shown stat anywhere opens no box', () => {
    expect(shipCardFlyouts(shipRows(YOU), ABILITIES, new Map(), { before: STATS, after: STATS }, DEFAULT_SHIFT)).toEqual([]);
  });
});

describe('stackTops — boxes beside one bar never overlap', () => {
  it('one box sits at its row, kept on screen (today`s placement)', () => {
    expect(stackTops([200], [80], 10, 1080)).toEqual([200]);
    expect(stackTops([1050], [80], 10, 1080)).toEqual([1080 - 10 - 80]);
  });

  it('boxes taller than their rows push the next one down, with the gap', () => {
    const tops = stackTops([100, 140, 180], [80, 80, 80], 10, 1080);
    expect(tops).toEqual([100, 190, 280]);
  });

  it('a stack that would overrun the bottom is pushed up, never overlapping and never above 0', () => {
    const h = [100, 100, 100];
    const tops = stackTops([900, 950, 1000], h, 10, 1080);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1] + h[i - 1] + 10);
    expect(tops[2] + h[2]).toBeLessThanOrEqual(1080 - 10);
    expect(tops[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('the DOM flyout — display only', () => {
  it('opens one box per item, each display-only beside the bar; fewer items close the rest; hide closes all', () => {
    document.body.replaceChildren();
    const f = new HudFlyout();
    const item = (y: number) => ({ model: { title: 'T', lines: [{ label: 'A', value: '1', amber: true }] }, anchor: { x: 318, y, side: 'left' as const } });
    f.showAll([item(100), item(200), item(300)], 1, 1080);
    const boxes = [...document.querySelectorAll<HTMLElement>('[id^="hud-flyout"]')];
    expect(boxes).toHaveLength(3);
    expect(f.openCount).toBe(3);
    for (const b of boxes) {
      expect(b.style.pointerEvents).toBe('none');
      expect(b.style.display).toBe('block');
      expect(Number.parseFloat(b.style.left)).toBeGreaterThan(318);
    }
    f.show(item(100).model, item(100).anchor, 1, 1080);
    expect(f.openCount).toBe(1);
    expect(boxes.filter((b) => b.style.display === 'block')).toHaveLength(1);
    f.hide();
    expect(f.visible).toBe(false);
    expect(boxes.every((b) => b.style.display === 'none')).toBe(true);
    f.destroy();
    expect(document.querySelectorAll('[id^="hud-flyout"]')).toHaveLength(0);
  });

  beforeEach(() => document.body.replaceChildren());

  it('never catches a pointer, shows the lines, and hides', () => {
    const f = new HudFlyout();
    f.show({ title: 'T', lines: [{ label: 'A', value: '1', amber: true }] }, { x: 318, y: 200, side: 'left' }, 1, 1080);
    const box = document.getElementById('hud-flyout')!;
    expect(box.style.pointerEvents).toBe('none');
    expect(box.style.display).toBe('block');
    expect(box.textContent).toContain('A');
    expect(f.visible).toBe(true);
    f.hide();
    expect(box.style.display).toBe('none');
  });

  it('opens toward the open water: right of a left bar, left of a right bar', () => {
    const f = new HudFlyout();
    f.show({ title: 'T', lines: [] }, { x: 318, y: 200, side: 'left' }, 1, 1080);
    const box = document.getElementById('hud-flyout')!;
    expect(Number.parseFloat(box.style.left)).toBeGreaterThan(318);
    expect(box.style.right).toBe('');
    f.show({ title: 'T', lines: [] }, { x: 1602, y: 200, side: 'right' }, 1, 1080);
    expect(box.style.left).toBe('');
    expect(box.style.right).not.toBe('');
  });
});

describe('SPACE-HOME — the camera`s focus (AC 28)', () => {
  function camera(): Camera {
    const c = new Camera({ defaultSpanU: 2000, closeSpanU: 500, ringFitMargin: 1.1 });
    c.setViewport(1920, 1080);
    return c;
  }

  it('FOLLOW puts the hull at the screen centre plus the focus offset — toward the open water of either side', () => {
    for (const side of ['left', 'right'] as const) {
      const c = camera();
      const px = openWaterOffset(side) * 1.25;
      c.setFocusOffset(px);
      c.home();
      c.update(0, { x: 300, y: -40 });
      const s = c.worldToScreen({ x: 300, y: -40 });
      expect(s.x).toBeCloseTo(960 + px, 6);
      expect(s.y).toBeCloseTo(540, 6);
      expect(Math.sign(s.x - 960)).toBe(side === 'left' ? 1 : -1);
    }
  });

  it('no bar, no offset: the hull is dead centre; screen <-> world stays an exact inverse under any offset', () => {
    const c = camera();
    c.update(0, { x: 0, y: 0 });
    expect(c.worldToScreen({ x: 0, y: 0 }).x).toBeCloseTo(960, 6);
    c.setFocusOffset(159);
    const p = { x: 123, y: 456 };
    const back = c.screenToWorld(c.worldToScreen(p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
    // the world view still describes the real screen: its centre maps to the screen centre
    const v = c.worldView;
    expect(c.worldToScreen({ x: v.x, y: v.y }).x).toBeCloseTo(960, 6);
  });

  it('ignores a non-finite offset', () => {
    const c = camera();
    c.setFocusOffset(Number.NaN);
    expect(c.focusOffsetPx).toBe(0);
  });
});
