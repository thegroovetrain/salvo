import { describe, it, expect } from 'vitest';
import { CONFIG, fogFrameAt, makeFogField } from '@salvo/shared';
import {
  RAIN_CLUTTER_DEFAULTS,
  clutterAmountAt,
  rainClutter,
  type RainClutterInput,
  type RainClutterOpts,
} from '../render/rainClutter.js';

const OCEAN_R = 5000;
const OPTS: RainClutterOpts = { ...RAIN_CLUTTER_DEFAULTS, cellU: CONFIG.vision.radarCellU };
const field = makeFogField(20261114, CONFIG.fog, OCEAN_R);
// a minute into the zone, eye centered on the origin
const frame = fogFrameAt(field, 60_000, 0, 0, 0, CONFIG.zone);

/** A full-turn step seen from (ox, oy). */
const turn = (ox: number, oy: number, rangeU: number, sweepIndex = 0): RainClutterInput => ({
  frame, ox, oy, rangeU, sweepIndex, from: 0, to: Math.PI * 2, t: 0,
});

const cellsOf = (s: { cells: Int32Array; n: number }): string[] => {
  const out: string[] = [];
  for (let k = 0; k < s.n; k++) out.push(`${s.cells[2 * k]},${s.cells[2 * k + 1]}`);
  return out;
};

describe('rainClutter', () => {
  it('paints nothing in the clear eye', () => {
    const eyeR = frame.eyeFrac * frame.R;
    expect(eyeR).toBeGreaterThan(200);
    const s = rainClutter(turn(0, 0, eyeR * 0.9), OPTS);
    expect(s.n).toBe(0);
  });

  it('orders the tier amounts weak < medium < heavy (by rain density and ring)', () => {
    const edge = clutterAmountAt(0.2, 0.8, RAIN_CLUTTER_DEFAULTS);
    const middle = clutterAmountAt(0.9, 0.8, RAIN_CLUTTER_DEFAULTS);
    const outside = clutterAmountAt(0.9, 1.3, RAIN_CLUTTER_DEFAULTS);
    expect(clutterAmountAt(0, 0.8, RAIN_CLUTTER_DEFAULTS)).toBe(0);
    expect(edge).toBeGreaterThan(0);
    expect(middle).toBeGreaterThan(edge);
    expect(outside).toBeGreaterThan(middle);
  });

  it('is deterministic for one sweep index and re-rolls on the next', () => {
    const at = turn(frame.R * 0.8, 0, 1500, 7);
    const a = cellsOf(rainClutter(at, OPTS));
    const b = cellsOf(rainClutter(at, OPTS));
    const c = cellsOf(rainClutter({ ...at, sweepIndex: 8 }, OPTS));
    expect(a.length).toBeGreaterThan(50);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('paints nothing beyond radar range', () => {
    const range = 1200;
    const ox = frame.R * 0.9;
    const s = rainClutter(turn(ox, 0, range, 3), OPTS);
    expect(s.n).toBeGreaterThan(0);
    const c = OPTS.cellU;
    for (let k = 0; k < s.n; k++) {
      const dx = (s.cells[2 * k] + 0.5) * c - ox;
      const dy = (s.cells[2 * k + 1] + 0.5) * c;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(range);
    }
  });
});
