// THE FLYOUT (render/console/flyout.ts + ui/hudFlyout.ts, Story 12.3 Part B,
// AC 34 / 36) and SPACE-HOME's camera focus (render/camera.ts, AC 28).

import { describe, it, expect, beforeEach } from 'vitest';
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, effectiveStats } from '@salvo/shared';
import { abilityFlyout, cardFlyout, changeText, previewTarget, weaponFlyout } from '../render/console/flyout.js';
import { PREVIEW_ARROW } from '../render/console/skins.js';
import { hoverPreview, type AbilityModel, type ReadoutShip, type WeaponRowModel } from '../render/console/readouts.js';
import { HudFlyout } from '../ui/hudFlyout.js';
import { Camera } from '../render/camera.js';
import { openWaterOffset } from '../render/console/layout.js';

const YOU: ReadoutShip = { cls: DEFAULT_CLASS_ID, cards: [], ib: {}, shift: DEFAULT_SHIFT };
const STATS = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], [], CATALOG);

describe('previewTarget — which tile a hovered card changes', () => {
  it('a ship-stat ladder points at the ship rows (no box), even where it also moves weapon numbers', () => {
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

describe('the DOM flyout — display only', () => {
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
