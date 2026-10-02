// THE CHAFF OWNER'S GHOSTS (render/chaffGhosts.ts, cycle 162, Eric 2026-10-01:
// the owner sees their own fake returns "at 50 % of their normal alpha in
// greyscale"). The ghosts run the scope's own pure march/heatmap functions
// into a SEPARATE grid, quantized to three grey tokens at the scope's
// thresholds and `bandAlpha × 0.5`, with the scope's age decay.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, paintCoverage, type GhostPaint } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ChaffGhosts, GHOST_BAND_ALPHA, validGhost } from '../render/chaffGhosts.js';
import { blipLifeMs } from '../render/phosphor.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);
const OWN = { x: 0, y: 0 };
const GREYS = new Set<number>([
  CLIENT_CONFIG.colors.ghostFaint,
  CLIENT_CONFIG.colors.ghostFuzzy,
  CLIENT_CONFIG.colors.ghostSolid,
]);

/** A fake's coverage rect — built by the same shared paint pipeline the
 *  server runs for every blip (and therefore for every chaff fake). */
function ghostAt(x: number, y: number, t = 1000): GhostPaint {
  const c = paintCoverage('battleship', x, y, 0.4, CELL, t);
  return { gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
}

function litPixels(cg: ChaffGhosts): { rgb: number; a: number }[] {
  const out: { rgb: number; a: number }[] = [];
  const b = cg.rgba;
  if (b === null) return out;
  for (let i = 0; i < b.length; i += 4) {
    if (b[i + 3] > 0) out.push({ rgb: (b[i] << 16) | (b[i + 1] << 8) | b[i + 2], a: b[i + 3] });
  }
  return out;
}

describe('the ghost palette derives from the scope', () => {
  it('three grey bands at the scope\'s OWN thresholds, at half the scope\'s alpha', () => {
    const scope = CLIENT_CONFIG.blip.heatmap;
    const ghost = CLIENT_CONFIG.chaffGhost;
    expect(ghost.bands.map((b) => b.at)).toEqual(scope.bands.map((b) => b.at));
    expect(new Set(ghost.bands.map((b) => b.color))).toEqual(GREYS);
    expect(ghost.alphaScale).toBe(0.5);
    expect(GHOST_BAND_ALPHA).toBeCloseTo(scope.bandAlpha * 0.5, 12);
    // ...and the scope's own three registers are untouched: none of them grey.
    for (const b of scope.bands) expect(GREYS.has(b.color)).toBe(false);
  });
});

describe('ChaffGhosts — accumulate, quantize, age out', () => {
  it('rects accumulate across frames and age out on the scope\'s phosphor life', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([ghostAt(0, 200)], 1000);
    cg.render(OWN, 1000);
    cg.onGhosts([ghostAt(150, -100)], 1050);
    cg.render(OWN, 1050);
    expect(cg.livePaints).toBe(2);
    expect(cg.visible).toBe(true);
    cg.render(OWN, 1000 + LIFE);
    expect(cg.livePaints).toBe(1); // the first aged out, the second is 50 ms younger
    cg.render(OWN, 1050 + LIFE);
    expect(cg.livePaints).toBe(0);
    expect(cg.visible).toBe(false);
  });

  it('every opaque byte is one of the three grey tokens, and the peak alpha is round(255 × bandAlpha × 0.5)', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([ghostAt(0, 200), ghostAt(-120, 60)], 1000);
    cg.render(OWN, 1000);
    const lit = litPixels(cg);
    expect(lit.length).toBeGreaterThan(0);
    for (const p of lit) expect(GREYS.has(p.rgb), p.rgb.toString(16)).toBe(true);
    const peak = Math.max(...lit.map((p) => p.a));
    expect(peak).toBe(Math.round(255 * CLIENT_CONFIG.blip.heatmap.bandAlpha * 0.5));
  });

  it('decays with age exactly as the scope does (half-life → about half the peak alpha)', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([ghostAt(0, 200)], 1000);
    cg.render(OWN, 1000 + LIFE / 2);
    const peak = Math.max(...litPixels(cg).map((p) => p.a));
    expect(peak).toBe(Math.round(255 * GHOST_BAND_ALPHA * 0.5));
  });

  it('the ghost sits on the water where the fake is (world-anchored, any camera)', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([ghostAt(0, 200)], 1000);
    cg.render(OWN, 1000, { x: 37, y: -11, halfW: 400, halfH: 300 });
    expect(cg.bandAt(0, 200)).toBeGreaterThanOrEqual(0);
    expect(cg.pixelAt(0, 200)?.a ?? 0).toBeGreaterThan(0);
    const pos = cg.spritePosition;
    expect(pos).not.toBeNull();
    // Snapped to a whole world cell — the amendment-98 placement rule.
    expect(Math.abs((pos!.x / CELL) - Math.round(pos!.x / CELL))).toBeLessThan(1e-9);
    expect(Math.abs((pos!.y / CELL) - Math.round(pos!.y / CELL))).toBeLessThan(1e-9);
  });
});

describe('the gate — malformed rects are dropped whole', () => {
  const good = ghostAt(0, 200);

  it('accepts a real fake rect', () => {
    expect(validGhost(good)).toBe(true);
  });

  it('drops a wrong-sized bits array, a non-integer index, an absurd span, a far cell and a non-object', () => {
    expect(validGhost({ ...good, bits: good.bits.slice(1) })).toBe(false);
    expect(validGhost({ ...good, gx: good.gx + 0.5 })).toBe(false);
    expect(validGhost({ ...good, w: 100_000 })).toBe(false);
    expect(validGhost({ ...good, gy: 1e9 })).toBe(false);
    expect(validGhost({ ...good, h: 0 })).toBe(false);
    expect(validGhost(null as unknown as GhostPaint)).toBe(false);
  });

  it('a malformed rect beside a good one: only the good one paints', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([{ ...good, bits: [] }, good], 1000);
    cg.render(OWN, 1000);
    expect(cg.livePaints).toBe(1);
  });

  it('a non-finite frame time drops the whole list', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([good], Number.NaN);
    cg.render(OWN, 1000);
    expect(cg.livePaints).toBe(0);
  });
});

describe('nothing renders without ghosts or without an own pose', () => {
  it('an absent list (the wire omits it) renders nothing', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts(undefined, 1000);
    cg.render(OWN, 1000);
    expect(cg.livePaints).toBe(0);
    expect(cg.visible).toBe(false);
  });

  it('no own pose (start line / spectator): hidden, and nothing is marched', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([ghostAt(0, 200)], 1000);
    cg.render(null, 1000);
    expect(cg.visible).toBe(false);
    expect(cg.livePaints).toBe(0);
  });

  it('clear() drops every ghost and hides the surface', () => {
    const cg = new ChaffGhosts(new Container());
    cg.onGhosts([ghostAt(0, 200)], 1000);
    cg.render(OWN, 1000);
    cg.clear();
    expect(cg.livePaints).toBe(0);
    expect(cg.visible).toBe(false);
  });
});

describe('the chaff layer seat — radar returns are never below the smoke screen (Eric 2026-10-01)', () => {
  const at = (name: string): number => CHART_LAYER_ORDER.indexOf(name as never);

  it('seats `chaff` ABOVE `smoke` and BELOW `blip`', () => {
    expect(at('chaff'), 'chaff is a chart layer').toBeGreaterThanOrEqual(0);
    expect(at('chaff'), 'radar returns are never below the smoke screen').toBeGreaterThan(at('smoke'));
    expect(at('chaff'), 'and stay off the blip layer\'s near-range dim mask').toBeLessThan(at('blip'));
  });

  it('leaves the neighbors as they were: smoke over litZone, blip over smoke, ship over blip', () => {
    expect(at('smoke')).toBeGreaterThan(at('litZone'));
    expect(at('blip')).toBeGreaterThan(at('smoke'));
    expect(at('ship')).toBe(at('blip') + 1);
  });
});
