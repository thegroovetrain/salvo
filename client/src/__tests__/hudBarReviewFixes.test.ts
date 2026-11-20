// STORY 12.3 PART B — THE REVIEW FIX PASS (Eric 2026-11-19: "Changing the size
// of shit like that reads as negligence."). One regression per finding, each
// against the generating function or the real composition: nothing on the bar
// or the offer group moves or resizes with state; hover dies with the pointer
// off the canvas; the flyout dies with the session; the spawn never slides;
// the zoom fits the open water; a short or narrow viewport SCALES the bar and
// the offer group uniformly (Eric 2026-11-19: "On short screens just scale it
// accordingly ... Its fine if the text gets small. Scale.").

import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { DEFAULT_CLASS_ID, DEFAULT_SHIFT, CONFIG, effectiveStats, initialTurrets, type OwnShip } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  barHoverAt,
  barLayout,
  barScreenRect,
  consoleLayout,
  offerLayout,
  openWater,
  openWaterOffset,
  type BarLayout,
  type Rect,
} from '../render/console/layout.js';
import { HudBar, type HudBarView } from '../render/console/hudBar.js';
import { shipReadouts, type ReadoutShip } from '../render/console/readouts.js';
import { HudFlyout } from '../ui/hudFlyout.js';
import { OfferGroup, type OfferGroupHooks } from '../ui/offerGroup.js';
import { offerView } from '../ui/offerCore.js';
import { Camera, intelFitSpanU, ringFitSpanU, type CameraOptions } from '../render/camera.js';
import { HUD_SIDES, hudScale, settings } from '../settings/store.js';

const K = CLIENT_CONFIG.console;
const B = K.bar;
const Z = CLIENT_CONFIG.zoom;
const M = CLIENT_CONFIG.reveal.mapFitMargin;

const inside = (a: Rect, b: Rect): boolean => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const overlapX = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9;
const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

const YOU: ReadoutShip = { cls: DEFAULT_CLASS_ID, cards: [], ib: {}, shift: DEFAULT_SHIFT };
const MAX_HP = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]).maxHp;

/** A bar frame at level `lvl` with `pts` banked. */
function fix1View(lvl = 1, pts = 0): HudBarView {
  return {
    hp: MAX_HP, maxHp: MAX_HP, repairHp: 0, hullHold: false, speed: 0, orderedDetent: 4, kin: { maxSpeed: 10, reverseSpeed: 4 },
    lvl, xp: 0.5, pts, freeze: false, nowSec: 10, nowMs: 10_000, uiScale: 1, rows: [], abilities: [],
    readouts: shipReadouts(YOU)!, preview: null, previewTarget: null, hover: null, turrets: 4,
    denied: { rows: [], abilities: [] }, motion: 'full', dim: false,
  };
}

function ownShip(): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: DEFAULT_CLASS_ID, shift: DEFAULT_SHIFT, turrets: initialTurrets(DEFAULT_CLASS_ID),
    sec: { heat: 0 }, pts: 1, offer: ['intel', 'armor', 'deckGun', 'navalMines'],
    boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0, rd: false, ib: {},
  };
}

// --- fix 1: LEVEL gauge -----------------------------------------------------------

describe('fix 1 — the LEVEL gauge`s `LV n` and bank chip never move', () => {
  const LAYOUT = barLayout(1920, 1080);
  const view = fix1View;

  it('places `LV n` and the chip identically at (LV 9, 0), (LV 9, 1), (LV 10, 1) and (LV 99, 3)', () => {
    const bar = new HudBar(new Container());
    const states: [number, number][] = [[9, 0], [9, 1], [10, 1], [99, 3]];
    const marks = states.map(([lvl, pts]) => {
      bar.update(view(lvl, pts), LAYOUT);
      return { ...bar.levelMarks, shown: bar.chipVisible };
    });
    for (const m of marks) {
      expect({ x: m.lvX, y: m.lvY, a: m.lvAnchorX }).toEqual({ x: marks[0].lvX, y: marks[0].lvY, a: marks[0].lvAnchorX });
    }
    const shown = marks.filter((m) => m.shown);
    expect(shown).toHaveLength(3);
    for (const m of shown) expect({ x: m.chipX, y: m.chipY }).toEqual({ x: shown[0].chipX, y: shown[0].chipY });
  });

  it('the layout reserves the chip slot and the `LV n` slot in the level column, side by side, inside the value line', () => {
    for (const side of HUD_SIDES) {
      const lv = barLayout(1920, 1080, side).footer.level;
      expect(inside(lv.lv, lv.value)).toBe(true);
      expect(inside(lv.bankChip, lv.value)).toBe(true);
      expect(lv.lv.x + lv.lv.w).toBeLessThanOrEqual(lv.bankChip.x);
    }
  });
});

// --- fix 3: the flyout dies with the session -----------------------------------------

describe('fix 3 — the flyout has a destroy()', () => {
  beforeEach(() => document.body.replaceChildren());

  it('destroy removes its node; a second flyout after it never duplicates #hud-flyout', () => {
    const f = new HudFlyout();
    f.show({ title: 'T', lines: [] }, { x: 318, y: 200, side: 'left' }, 1, 1080);
    expect(document.querySelectorAll('#hud-flyout')).toHaveLength(1);
    f.destroy();
    expect(document.querySelectorAll('#hud-flyout')).toHaveLength(0);
    expect(f.visible).toBe(false);
    const g = new HudFlyout();
    g.show({ title: 'U', lines: [] }, { x: 318, y: 200, side: 'left' }, 1, 1080);
    expect(document.querySelectorAll('#hud-flyout')).toHaveLength(1);
  });
});

// --- fix 4: hover gated on the pointer ---------------------------------------------

describe('fix 4 — the bar`s hover needs the pointer inside the window and over the canvas', () => {
  const l = barLayout(1920, 1080);
  const p = barScreenRect(l, l.weapons.tiles[0]);
  const at = centre(p);

  it('opens over a tile with the pointer on the canvas', () => {
    expect(barHoverAt(l, at, { shown: true, inside: true, onCanvas: true })).toEqual({ kind: 'weapon', row: 'mainBattery' });
  });

  it('opens nothing once the pointer leaves the window, over a DOM overlay above the bar, or with the bar hidden', () => {
    expect(barHoverAt(l, at, { shown: true, inside: false, onCanvas: true })).toBeNull();
    expect(barHoverAt(l, at, { shown: true, inside: true, onCanvas: false })).toBeNull();
    expect(barHoverAt(l, at, { shown: false, inside: true, onCanvas: true })).toBeNull();
  });
});

// --- fix 6: the spawn never slides ----------------------------------------------------

describe('fix 6 — the focus offset lands instantly from a hidden bar', () => {
  const EASED: CameraOptions = { defaultSpanU: Z.defaultSpanU, closeSpanU: Z.closeSpanU, ringFitMargin: M, slideEaseRate: CLIENT_CONFIG.camera.slideEaseRate };
  const hull = { x: 300, y: -40 };
  function cam(): Camera {
    const c = new Camera({ ...EASED });
    c.setViewport(1920, 1080);
    c.update(0.05, hull);
    return c;
  }

  it('a spawn, then the bar appearing: the hull is at the open-water centre THIS frame — no sideways slide', () => {
    const c = cam();
    c.respawnAt(hull);
    const off = openWaterOffset('left');
    c.setFocusOffset(off);
    expect(c.worldToScreen(hull).x).toBeCloseTo(960 + off, 6);
    c.update(0.05, hull);
    expect(c.worldToScreen(hull).x).toBeCloseTo(960 + off, 6);
  });

  it('the bar leaving (offset back to 0) is instant too', () => {
    const c = cam();
    c.setFocusOffset(openWaterOffset('left'));
    c.setFocusOffset(0);
    expect(c.worldToScreen(hull).x).toBeCloseTo(960, 6);
  });

  it('a side change while playing glides (the only eased case)', () => {
    const c = cam();
    c.setFocusOffset(openWaterOffset('left'));
    c.update(0.05, hull);
    c.setFocusOffset(openWaterOffset('right'));
    // this instant the hull has not jumped across
    expect(c.worldToScreen(hull).x).toBeCloseTo(960 + openWaterOffset('left'), 6);
    for (let i = 0; i < 200; i++) c.update(0.05, hull);
    expect(c.worldToScreen(hull).x).toBeCloseTo(960 + openWaterOffset('right'), 3);
  });
});

// --- fix 7: the cards never move between the countdown and the match ---------------------

describe('fix 7 — the four cards hold their place; REDRAW hangs off the end', () => {
  it('cards identical with and without REDRAW, centred on their own width, for every width and side', () => {
    for (const side of HUD_SIDES) {
      for (const w of [1024, 1365, 1600, 1920, 2560, 3840]) {
        const live = offerLayout(w, 1080, side, false);
        const cd = offerLayout(w, 1080, side, true);
        expect(cd.cards).toEqual(live.cards);
        expect(cd.header).toEqual(live.header);
        const water = openWater(w, 1080, side);
        const l = live.cards[0].x;
        const r = live.cards[3].x + live.cards[3].w;
        expect((l + r) / 2).toBeCloseTo(water.x + water.w / 2, 9);
        expect(cd.redraw!.x).toBeGreaterThan(r);
      }
    }
  });
});

// --- fix 8: the card hover lifts an inner face, never the hit box -----------------------

describe('fix 8 — a hovered card lifts its face, not its button', () => {
  beforeEach(() => document.body.replaceChildren());

  const hooks: OfferGroupHooks = { onPick: () => {}, onHover: () => {}, onRedraw: () => {} };

  it('the button (the hit box) never transforms; its face carries the lift', () => {
    const g = new OfferGroup(hooks);
    g.update(offerView(ownShip(), false, false, false), consoleLayout(1920, 1080).offer, 1);
    const btn = document.querySelector('#offer-group button') as HTMLButtonElement;
    const face = btn.querySelector('[data-part="face"]') as HTMLElement;
    expect(face).not.toBeNull();
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(face.style.transform).toContain('translateY');
    expect(btn.style.transform === '' || btn.style.transform === 'none').toBe(true);
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    expect(face.style.transform).toBe('none');
  });
});

// --- fix 9: the intel fit counts the focus offset --------------------------------------

describe('fix 9 — the zoom-out fits the open water beside the bar', () => {
  it('intelFitSpanU: an offset focus has less room toward the far edge, so the fit widens', () => {
    const W = 1200;
    const H = 1080;
    const R = 900;
    const none = intelFitSpanU(W, H, 0, R, M, 0);
    const off = intelFitSpanU(W, H, 0, R, M, 159);
    expect(off).toBeGreaterThan(none);
    // the disc fits horizontally around the offset focus, on both sides
    const z = Math.min(W, H) / off;
    expect(W / 2 + 159 + R * M * z).toBeLessThanOrEqual(W + 1e-6);
    expect(W / 2 + 159 - R * M * z).toBeGreaterThanOrEqual(318 - 1e-6);
  });

  it('the camera`s full-map fit is never clipped on the far side of the open water', () => {
    const MAP_R = 6000;
    for (const [w, h, side] of [[1200, 1080, 'left'], [1200, 1080, 'right'], [1024, 900, 'left']] as const) {
      const c = new Camera({ defaultSpanU: Z.defaultSpanU, closeSpanU: Z.closeSpanU, ringFitMargin: M });
      c.setViewport(w, h);
      c.setMapRadius(MAP_R);
      const off = openWaterOffset(side);
      c.setFocusOffset(off);
      c.setUserZoom(c.userZoomLimits.min);
      const half = (ringFitSpanU(MAP_R, M) / 2) * c.zoom;
      expect(Math.abs(off) + half, `${w}x${h} ${side}`).toBeLessThanOrEqual(w / 2 + 1e-6);
      expect(half).toBeLessThanOrEqual(h / 2 + 1e-6);
    }
  });
});

// --- fix 10: the uniform scale on short / narrow viewports ------------------------------

describe('fix 10 — a short viewport SCALES the bar; a narrow one scales the offer group', () => {
  const W = 1920;

  it('the bar fits between its top and bottom insets for every physical height 600–1440, both sides', () => {
    for (let ph = 600; ph <= 1440; ph += 20) {
      const f = hudScale(settings.current, W, ph);
      const lw = W / f;
      const lh = ph / f;
      for (const side of HUD_SIDES) {
        const l = barLayout(lw, lh, side);
        const frame = barScreenRect(l, l.frame);
        expect(frame.y, `${ph} ${side}`).toBeCloseTo(B.top, 6);
        expect(frame.y + frame.h, `${ph} ${side}`).toBeCloseTo(lh - B.bottom, 6);
        expect(l.scale).toBeLessThanOrEqual(1);
        for (const bed of [l.weapons.bed, l.abilities.bed, l.ship.bed, l.footer.bed]) expect(inside(barScreenRect(l, bed), frame)).toBe(true);
        // uniform: the bar's own geometry never reflows — the section gap and the gauges are the ruled sizes
        expect(l.abilities.bed.y - (l.weapons.bed.y + l.weapons.bed.h)).toBeCloseTo(B.sectionGap, 9);
        expect(l.footer.hull.gauge.h).toBe(K.gauges.h);
      }
    }
  });

  it('the offer group never intersects the bar for widths 800–3840, both sides, live and countdown', () => {
    for (let pw = 800; pw <= 3840; pw += 32) {
      for (const ph of [600, 768, 1080]) {
        const f = hudScale(settings.current, pw, ph);
        for (const side of HUD_SIDES) {
          for (const countdown of [false, true]) {
            const l = consoleLayout(pw / f, ph / f, { side, countdown });
            const bar = barScreenRect(l.bar, l.bar.frame);
            const items = [...l.offer.cards, ...(l.offer.redraw === null ? [] : [l.offer.redraw])];
            for (const r of items) {
              expect(overlapX(r, bar), `${pw}x${ph} ${side} ${countdown}`).toBe(false);
              expect(r.x).toBeGreaterThanOrEqual(-1e-9);
              expect(r.x + r.w).toBeLessThanOrEqual(pw / f + 1e-9);
            }
          }
        }
      }
    }
  });

  it('Space-home uses the SCALED bar width: the focus is the centre of the open water', () => {
    const lw = 1920 / 0.75;
    const lh = 600 / 0.75;
    for (const side of HUD_SIDES) {
      const l = consoleLayout(lw, lh, { side });
      expect(l.bar.scale).toBeLessThan(1);
      const water = openWater(lw, lh, side, l.bar.scale);
      expect(lw / 2 + openWaterOffset(side, l.bar.scale)).toBeCloseTo(water.x + water.w / 2, 9);
      const bar = barScreenRect(l.bar, l.bar.frame);
      expect(side === 'left' ? water.x : water.x + water.w).toBeCloseTo(side === 'left' ? bar.x + bar.w : bar.x, 9);
    }
  });

  it('at 1920 × 1080 nothing changes: factor 1 for the bar and the offer group', () => {
    for (const side of HUD_SIDES) {
      for (const countdown of [false, true]) {
        const l = consoleLayout(1920, 1080, { side, countdown });
        expect(l.bar.scale).toBe(1);
        expect(l.offer.scale).toBe(1);
        expect(l.bar.frame).toEqual({ x: side === 'left' ? B.edge : 1920 - B.edge - B.w, y: B.top, w: B.w, h: 1080 - B.top - B.bottom });
        expect(l.offer.cards[0].w).toBe(K.offer.cardW);
      }
    }
  });

  it('the Pixi bar draws under its fit factor; the DOM offer group under its own', () => {
    const l = consoleLayout(1200, 700, { side: 'left', countdown: true });
    expect(l.bar.scale).toBeLessThan(1);
    expect(l.offer.scale).toBeLessThan(1);
    const bar = new HudBar(new Container());
    bar.update(fix1View(), l.bar);
    expect(bar.drawScale).toBe(l.bar.scale);
    document.body.replaceChildren();
    const g = new OfferGroup({ onPick: () => {}, onHover: () => {}, onRedraw: () => {} });
    g.update(offerView(ownShip(), false, false, false), l.offer, 1);
    const root = document.getElementById('offer-group')!;
    expect(root.style.transform).toContain(String(l.offer.scale));
    const btn = root.querySelector('button') as HTMLButtonElement;
    // natural px inside the scaled root: the card keeps its ruled size
    expect(Number.parseFloat(btn.style.width)).toBeCloseTo(K.offer.cardW, 6);
  });

  it('hit tests read LOGICAL points on a scaled bar', () => {
    const l: BarLayout = barLayout(2560, 800, 'right');
    expect(l.scale).toBeLessThan(1);
    for (const t of l.weapons.tiles) expect(barHoverAt(l, centre(barScreenRect(l, t)), { shown: true, inside: true, onCanvas: true })).toEqual({ kind: 'weapon', row: t.kind });
  });
});
