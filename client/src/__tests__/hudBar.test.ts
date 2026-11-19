// THE HUD BAR (render/console/hudBar.ts + its painters, Story 12.3 Part B,
// AC 27–36 / 40). The pure looks (the tier mark, the skins) are unit-tested;
// the Pixi composition is built for real under jsdom with no renderer, as the
// consoles' suites were: it shows, reads the hull, the throttle and the ship
// rows off the view, marks a hovered ship card in place (value + numeral +
// dot) and nothing else, dims only the controls at the start line, keeps every
// refill bar's rect fixed across every state, and drops its breath on a real
// hide only.

import { describe, it, expect } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { DEFAULT_CLASS_ID, DEFAULT_SHIFT, INDEX_IDS, CONFIG, effectiveStats } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { barLayout, refillRect } from '../render/console/layout.js';
import { HudBar, type HudBarView } from '../render/console/hudBar.js';
import { drawRefill } from '../render/console/barDraw.js';
import { abilityStateText } from '../render/console/barShip.js';
import { iconProgress, lockedLook, specialState } from '../render/console/barWeapons.js';
import { hullSegmentRects } from '../render/console/barGauges.js';
import { PREVIEW_ARROW, abilitySkin, indexValueText, rowSkin, tierMarkModel } from '../render/console/skins.js';
import {
  ABILITY_READY_WORD,
  clockNumeral,
  hoverPreview,
  mountClock,
  shipReadouts,
  type AbilityModel,
  type PreviewMark,
  type ReadoutShip,
  type WeaponRowModel,
} from '../render/console/readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const YOU: ReadoutShip = { cls: DEFAULT_CLASS_ID, cards: [], ib: {}, shift: DEFAULT_SHIFT };
const LAYOUT = barLayout(1920, 1080);
const MAX_HP = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]).maxHp;

function view(over: Partial<HudBarView> = {}): HudBarView {
  return {
    hp: MAX_HP,
    maxHp: MAX_HP,
    repairHp: 0,
    hullHold: false,
    speed: 0,
    orderedDetent: 4,
    kin: { maxSpeed: 10, reverseSpeed: 4 },
    lvl: 1,
    xp: 0.5,
    pts: 0,
    freeze: false,
    nowSec: 10,
    nowMs: 10_000,
    uiScale: 1,
    rows: [],
    abilities: [],
    readouts: shipReadouts(YOU)!,
    preview: null,
    previewTarget: null,
    hover: null,
    turrets: 4,
    denied: { rows: [], abilities: [] },
    motion: 'full',
    dim: false,
    ...over,
  };
}

const mark = (key: string, raw: number, from: number | null, value = String(raw)): PreviewMark => ({ key, value, raw, from, direction: 'up' });

describe('THE TIER MARK model (AC 40)', () => {
  it('prints the numeral in the tier ramp colour and fills the dots to the tier', () => {
    const m = tierMarkModel(3, undefined)!;
    expect(m.numeral).toBe('III');
    expect(m.dots).toHaveLength(K.bar.tierMark.dots);
    expect(m.dots.filter((d) => d === 'on')).toHaveLength(3);
    expect(m.dots.slice(3).every((d) => d === 'off')).toBe(true);
  });

  it('a hovered card turns the numeral amber `next▲` and outlines the dots it would fill — no other dot changes', () => {
    const m = tierMarkModel(3, mark('index.armor.held', 4, 3))!;
    expect(m.numeral).toBe(`IV${PREVIEW_ARROW.up}`);
    expect(m.color).toBe(C.amber);
    expect(m.dots).toEqual(['on', 'on', 'on', 'next', 'off']);
  });

  it('an untiered line leaves the slot empty; a tiered line at tier 0 shows its dots and no numeral', () => {
    expect(tierMarkModel(0, undefined, false)).toBeNull();
    const zero = tierMarkModel(0, undefined)!;
    expect(zero.numeral).toBe('');
    expect(zero.dots.every((d) => d === 'off')).toBe(true);
  });
});

describe('the skins — today`s outlines, the preview amber, denied wins', () => {
  it('a hovered card`s tile wears the amber preview outline; denied still wins over it', () => {
    expect(rowSkin('cooling', false, 'full', true).border).toBe(C.amber);
    expect(rowSkin('cooling', true, 'full', true).border).toBe(C.denied);
    expect(abilitySkin('ready', false, 'full', 1, true).border).toBe(C.amber);
    expect(rowSkin('ready', false, 'full').border).toBe(C.phosphor);
    expect(rowSkin('cooling', false, 'full').border).toBe(C.silver);
  });

  it('indexValueText prints the plain value, or the incoming one with its arrow', () => {
    expect(indexValueText(100, undefined)).toBe('100');
    expect(indexValueText(100, mark('index.armor', 120, 100))).toBe(`120${PREVIEW_ARROW.up}`);
  });
});

describe('the painters` pure parts', () => {
  const special = (c: ReturnType<typeof mountClock> | undefined): WeaponRowModel => ({
    kind: 'special', slot: 4, id: 'starShells', name: 'STAR SHELLS', emptyGlyph: null, state: 'cooling', readied: false,
    tier: 1, tierNumeral: 'I', keyGlyph: 'R', clocks: c === undefined ? [] : [c], racks: [], heat: null, stats: [],
  });

  it('the special prints READY when loaded, the seconds while it reloads, nothing on an empty slot', () => {
    expect(specialState(special(mountClock(0, 30_000)))).toEqual({ text: ABILITY_READY_WORD, ready: true });
    expect(specialState(special(mountClock(12_000, 30_000))).text).toBe(clockNumeral(12_000));
    expect(specialState(special(undefined)).text).toBe('');
  });

  it('an ability prints READY or its seconds — never a wider form', () => {
    const ab = (state: AbilityModel['state'], ms: number): AbilityModel => ({
      kind: 'repair', keyGlyph: 'C', name: 'HULL REPAIR', state, stateWord: state === 'ready' ? ABILITY_READY_WORD : '', msLeft: ms, numeral: clockNumeral(ms), progress: 0.5, tier: 1,
    });
    expect(abilityStateText(ab('ready', 0))).toBe(ABILITY_READY_WORD);
    expect(abilityStateText(ab('cooling', 1500))).toBe(clockNumeral(1500));
  });

  it('an icon fills by its clock: empty with none, full when ready, the elapsed fraction otherwise', () => {
    expect(iconProgress(null)).toBe(0);
    expect(iconProgress(mountClock(0, 10_000))).toBe(1);
    expect(iconProgress(mountClock(2500, 10_000))).toBeCloseTo(0.75, 9);
    expect(lockedLook(true).color).toBe(C.amber);
    expect(lockedLook(false).color).toBe(C.textMuted);
  });

  it('the hull gauge`s segments stack bottom to top inside the gauge', () => {
    const g = LAYOUT.footer.hull.gauge;
    const segs = hullSegmentRects(g);
    expect(segs).toHaveLength(K.gauges.hull.segments);
    expect(segs[0].y + segs[0].h).toBeCloseTo(g.y + g.h, 9);
    expect(segs.at(-1)!.y).toBeCloseTo(g.y, 9);
    for (let i = 1; i < segs.length; i++) expect(segs[i].y).toBeLessThan(segs[i - 1].y);
  });
});

describe('THE REFILL BAR never changes size (Eric 2026-11-19) — the drawn box', () => {
  /** The drawn bar's bounds: its outline rect (the fill only ever sits inside it). */
  function drawnBounds(frac: number, ready: boolean, text: string): { x: number; y: number; w: number; h: number; textX: number } {
    const g = new Graphics();
    const t = new Text({ text: '' });
    t.anchor.set(1, 0.5);
    const r = refillRect(LAYOUT.abilities.tiles[0].body);
    drawRefill(g, t, r, frac, ready, text, 1);
    const b = g.getLocalBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height, textX: t.x };
  }

  it('is the same box READY, at a tenths countdown, a 1-digit, a 3-digit, empty and full', () => {
    const states: [number, boolean, string][] = [
      [1, true, ABILITY_READY_WORD],
      [0.9, false, clockNumeral(1500)],
      [0.4, false, clockNumeral(7000)],
      [0.01, false, clockNumeral(999_000)],
      [0, false, ''],
    ];
    const boxes = states.map(([f, ready, text]) => drawnBounds(f, ready, text));
    for (const b of boxes) expect(b).toEqual(boxes[0]);
  });

  it('every ability tile and the special keep their bar rect through armed, denied, preview and Shift-window states', () => {
    // the bar rect is the layout's — no state reaches it (the painters take it as given)
    const bars = [LAYOUT.weapons.tiles.find((t) => t.kind === 'special')!, ...LAYOUT.abilities.tiles].map((t) => t.refill.track);
    for (const side of ['left', 'right'] as const) {
      const again = barLayout(1920, 1080, side);
      const bars2 = [again.weapons.tiles.find((t) => t.kind === 'special')!, ...again.abilities.tiles].map((t) => t.refill.track);
      bars2.forEach((b, i) => {
        expect(b.w).toBe(bars[i].w);
        expect(b.h).toBe(bars[i].h);
      });
    }
  });
});

describe('the Pixi bar', () => {
  function build(): { bar: HudBar; parent: Container } {
    const parent = new Container();
    return { bar: new HudBar(parent), parent };
  }

  it('starts hidden and shows on its first frame, the hull percent and the throttle word off the view', () => {
    const { bar } = build();
    expect(bar.visible).toBe(false);
    bar.update(view({ hp: MAX_HP / 2, orderedDetent: 8 }), LAYOUT);
    expect(bar.visible).toBe(true);
    expect(bar.hullText).toBe('50%');
    expect(bar.throttleWord.endsWith('AHEAD')).toBe(true);
  });

  it('prints every index from the readouts in phosphor; a hovered ship card turns EXACTLY that row amber', () => {
    const { bar } = build();
    bar.update(view(), LAYOUT);
    for (let i = 0; i < INDEX_IDS.length; i++) expect(bar.indexValueColor(i)).toBe(C.phosphor);
    const preview = hoverPreview(YOU, 'armor');
    expect(preview).not.toBeNull();
    bar.update(view({ preview, previewTarget: { kind: 'ship' } }), LAYOUT);
    const armor = INDEX_IDS.indexOf('armor');
    expect(bar.indexValueColor(armor)).toBe(C.amber);
    expect(bar.indexValueText(armor).endsWith(PREVIEW_ARROW.up)).toBe(true);
    INDEX_IDS.forEach((id, i) => {
      if (id !== 'armor' && preview!.get(`index.${id}`) === undefined) expect(bar.indexValueColor(i)).toBe(C.phosphor);
    });
  });

  it('dims ONLY the controls at the start line, and back', () => {
    const { bar } = build();
    bar.update(view({ dim: true }), LAYOUT);
    expect(bar.controlsAlpha).toBe(K.dimAlpha);
    bar.update(view({ dim: false }), LAYOUT);
    expect(bar.controlsAlpha).toBe(1);
  });

  it('shows the bank chip only while a level is banked', () => {
    const { bar } = build();
    bar.update(view({ pts: 0 }), LAYOUT);
    expect(bar.chipVisible).toBe(false);
    bar.update(view({ pts: 2 }), LAYOUT);
    expect(bar.chipVisible).toBe(true);
  });

  it('breathes the hull fill below the amber line, holds it steady above; a real hide drops the breath', () => {
    const { bar } = build();
    bar.update(view({ hp: MAX_HP, nowSec: 1 }), LAYOUT);
    expect(bar.hullFillAlpha).toBe(K.hull.fillAlpha);
    bar.update(view({ hp: MAX_HP * 0.3, nowSec: 1 }), LAYOUT);
    bar.update(view({ hp: MAX_HP * 0.3, nowSec: 1.3 }), LAYOUT);
    expect(bar.hullFillAlpha).not.toBe(K.hull.fillAlpha);
    bar.hide();
    expect(bar.visible).toBe(false);
  });
});
