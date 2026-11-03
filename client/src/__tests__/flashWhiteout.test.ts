// THE FLASH SHELLS WHITEOUT (ui/flashWhiteout.ts — Eric 2026-10-29, epic-10
// amendment 5(c)/(e)): the pure frame model (alpha + clear-circle radius) and
// the thin DOM sink (one element, top of the DOM z-scale, click-through).
// No CONFIG number, hex or px is pinned: every expectation is derived from
// CONFIG.flashShells / the shared sight law.

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, FLASH_WINDOW_MS, effectiveSight } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  FlashWhiteout,
  whiteoutAlpha,
  whiteoutFeatherPx,
  whiteoutMask,
  whiteoutModel,
  type WhiteoutScreen,
} from '../ui/flashWhiteout.js';

const { rampMs, holdMs, clearMs } = CONFIG.flashShells;
const STATS = { sightRange: CONFIG.vision.sight };
const SCREEN: WhiteoutScreen = { x: 640, y: 360, pxPerU: 0.8 };
/** The frame `e` ms into a whiteout that hit at t = 0. */
const frameAt = (e: number, screen: WhiteoutScreen | null = SCREEN) => whiteoutModel(FLASH_WINDOW_MS, e, STATS, screen);

describe('whiteoutAlpha — ramp, hold, then the shared clear curve', () => {
  it('is 0 at the hit and 1 at the end of the ramp', () => {
    expect(whiteoutAlpha(0)).toBe(0);
    expect(whiteoutAlpha(rampMs / 2)).toBeCloseTo(0.5, 9);
    expect(whiteoutAlpha(rampMs)).toBe(1);
  });

  it('holds at 1 through the hold', () => {
    for (const e of [rampMs, rampMs + holdMs / 2, rampMs + holdMs]) expect(whiteoutAlpha(e)).toBe(1);
  });

  it('falls linearly to 0 at the window end', () => {
    expect(whiteoutAlpha(rampMs + holdMs + clearMs / 2)).toBeCloseTo(0.5, 9);
    expect(whiteoutAlpha(FLASH_WINDOW_MS)).toBe(0);
    expect(whiteoutAlpha(FLASH_WINDOW_MS + 1000)).toBe(0);
  });

  it('fails to 0 on a garbage clock', () => {
    expect(whiteoutAlpha(Number.NaN)).toBe(0);
    expect(whiteoutAlpha(-50)).toBe(0);
  });
});

describe('whiteoutModel — the frame the overlay draws', () => {
  it('the clear circle is effectiveSight × pxPerU: 0 through the hold, full sight at the end', () => {
    expect(frameAt(0).holeR).toBe(0);
    expect(frameAt(rampMs + holdMs).holeR).toBe(0);
    const mid = rampMs + holdMs + clearMs / 2;
    expect(frameAt(mid).holeR).toBeCloseTo(effectiveSight(STATS, FLASH_WINDOW_MS, mid) * SCREEN.pxPerU, 9);
    expect(frameAt(mid).holeR).toBeCloseTo((STATS.sightRange / 2) * SCREEN.pxPerU, 6);
    expect(frameAt(FLASH_WINDOW_MS - 1).holeR).toBeCloseTo(STATS.sightRange * SCREEN.pxPerU, 0);
  });

  it('the alpha is whiteoutAlpha of the elapsed time off the mark', () => {
    expect(frameAt(0).alpha).toBe(0);
    expect(frameAt(rampMs).alpha).toBe(1);
    expect(frameAt(rampMs + holdMs + clearMs / 2).alpha).toBeCloseTo(0.5, 9);
  });

  it('is hidden when lapsed, absent or with no own ship on screen (spectating)', () => {
    expect(frameAt(FLASH_WINDOW_MS).hidden).toBe(true);
    expect(whiteoutModel(undefined, 1000, STATS, SCREEN).hidden).toBe(true);
    expect(whiteoutModel(0, 1000, STATS, SCREEN).hidden).toBe(true);
    expect(frameAt(rampMs, null).hidden).toBe(true);
    expect(frameAt(rampMs).hidden).toBe(false);
  });

  it('a re-flash (a later until) raises the alpha again — the timeline restarts', () => {
    const late = rampMs + holdMs + clearMs * 0.8;
    const before = whiteoutModel(FLASH_WINDOW_MS, late, STATS, SCREEN);
    const reflash = whiteoutModel(late + FLASH_WINDOW_MS, late + rampMs, STATS, SCREEN);
    expect(reflash.alpha).toBeGreaterThan(before.alpha);
    expect(reflash.alpha).toBe(1);
    expect(reflash.holeR).toBe(0);
  });
});

describe('the mask and its feather', () => {
  it('no hole → no mask (white everywhere); a hole → a radial mask at the ship', () => {
    expect(whiteoutMask(10, 20, 0, 0)).toBe('none');
    const m = whiteoutMask(SCREEN.x, SCREEN.y, 100, 10);
    expect(m).toContain('radial-gradient');
    expect(m).toContain(`${SCREEN.x.toFixed(1)}px ${SCREEN.y.toFixed(1)}px`);
  });

  it('the feather is a fraction of the radius, floored, and off with no hole or feathering off', () => {
    const { featherFrac, featherMinPx } = CLIENT_CONFIG.flashWhiteout;
    expect(whiteoutFeatherPx(0, true)).toBe(0);
    expect(whiteoutFeatherPx(500, false)).toBe(0);
    expect(whiteoutFeatherPx(1000, true)).toBeCloseTo(Math.max(featherMinPx, 1000 * featherFrac), 9);
    expect(whiteoutFeatherPx(1, true)).toBe(featherMinPx);
  });
});

describe('FlashWhiteout — one click-through element at the top DOM rung', () => {
  let w: FlashWhiteout | null = null;
  afterEach(() => {
    w?.destroy();
    w = null;
  });

  /** Every OTHER z rung the client source declares (literal `z-index:N` in a
   *  style string, or a `zIndex: N` config value) — the whiteout must top them
   *  all to cover the DOM chrome (ruling c). */
  function otherRungs(): number[] {
    const root = join(process.cwd(), 'src');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && !f.endsWith('flashWhiteout.ts'));
    const rungs: number[] = [];
    for (const f of files) {
      let src = readFileSync(join(root, f), 'utf8');
      if (f === 'config.ts') src = src.replace(/flashWhiteout: \{[\s\S]*?\n {2}\},/, '');
      for (const m of src.matchAll(/z-?index\s*:\s*'?(\d+)/gi)) rungs.push(Number(m[1]));
    }
    return rungs;
  }

  it('is appended once, hidden, fixed over the viewport, pointer-events none, above every chrome rung', () => {
    w = new FlashWhiteout(document.body);
    const els = document.querySelectorAll('[data-flash-whiteout]');
    expect(els.length).toBe(1);
    const el = els[0] as HTMLElement;
    expect(el.hidden).toBe(true);
    expect(el.style.position).toBe('fixed');
    expect(el.style.pointerEvents).toBe('none');
    const rungs = otherRungs();
    expect(rungs.length).toBeGreaterThan(0);
    expect(Number(el.style.zIndex)).toBeGreaterThan(Math.max(...rungs));
  });

  it('renders a live frame (shown, opacity + mask) and hides a hidden one', () => {
    w = new FlashWhiteout(document.body);
    const mid = rampMs + holdMs + clearMs / 2;
    w.render(frameAt(mid), SCREEN, true);
    expect(w.el.hidden).toBe(false);
    expect(Number(w.el.style.opacity)).toBeCloseTo(0.5, 6);
    w.render(frameAt(FLASH_WINDOW_MS), SCREEN, true);
    expect(w.el.hidden).toBe(true);
    w.render(frameAt(rampMs), SCREEN, true);
    expect(w.el.hidden).toBe(false);
    w.hide();
    expect(w.el.hidden).toBe(true);
  });

  it('destroy removes the element', () => {
    w = new FlashWhiteout(document.body);
    w.destroy();
    expect(document.querySelectorAll('[data-flash-whiteout]').length).toBe(0);
    w = null;
  });
});
