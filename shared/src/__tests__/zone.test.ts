import { describe, it, expect } from 'vitest';
import { CONFIG, zoneRadiusAt, zonePhaseAt, isOutside, type ZoneTimeline } from '../index.js';

const MAP_R = 900;
const { grace, shrinkDuration, endRadiusFraction } = CONFIG.zone;
const END_R = MAP_R * endRadiusFraction;
const START = 10_000; // arbitrary non-zero anchor to prove startT is honored

describe('zoneRadiusAt — timeline boundaries', () => {
  it('holds full radius through the entire grace window (inclusive)', () => {
    expect(zoneRadiusAt(START, START, MAP_R)).toBe(MAP_R);
    expect(zoneRadiusAt(START + grace - 1, START, MAP_R)).toBe(MAP_R);
    expect(zoneRadiusAt(START + grace, START, MAP_R)).toBe(MAP_R); // grace boundary inclusive
  });

  it('shrinks LINEARLY from full to end over shrinkDuration', () => {
    const quarter = START + grace + shrinkDuration * 0.25;
    const half = START + grace + shrinkDuration * 0.5;
    const threeQ = START + grace + shrinkDuration * 0.75;
    expect(zoneRadiusAt(quarter, START, MAP_R)).toBeCloseTo(MAP_R + (END_R - MAP_R) * 0.25, 9);
    expect(zoneRadiusAt(half, START, MAP_R)).toBeCloseTo(MAP_R + (END_R - MAP_R) * 0.5, 9);
    expect(zoneRadiusAt(threeQ, START, MAP_R)).toBeCloseTo(MAP_R + (END_R - MAP_R) * 0.75, 9);
  });

  it('reaches the end radius exactly at grace+shrinkDuration and holds after', () => {
    const end = START + grace + shrinkDuration;
    expect(zoneRadiusAt(end, START, MAP_R)).toBeCloseTo(END_R, 9);
    expect(zoneRadiusAt(end + 1_000_000, START, MAP_R)).toBeCloseTo(END_R, 9);
  });

  it('honors a custom (dev-override) timeline', () => {
    const cfg: ZoneTimeline = { grace: 1000, shrinkDuration: 2000, endRadiusFraction: 0.5 };
    expect(zoneRadiusAt(START + 500, START, MAP_R, cfg)).toBe(MAP_R); // in grace
    expect(zoneRadiusAt(START + 2000, START, MAP_R, cfg)).toBeCloseTo(MAP_R + (MAP_R * 0.5 - MAP_R) * 0.5, 9);
    expect(zoneRadiusAt(START + 3000, START, MAP_R, cfg)).toBeCloseTo(MAP_R * 0.5, 9); // closed
  });
});

describe('zonePhaseAt', () => {
  it('reports grace -> shrinking -> closed across the timeline', () => {
    expect(zonePhaseAt(START + grace - 1, START)).toBe('grace');
    expect(zonePhaseAt(START + grace, START)).toBe('shrinking'); // radius still full, phase moves
    expect(zonePhaseAt(START + grace + shrinkDuration - 1, START)).toBe('shrinking');
    expect(zonePhaseAt(START + grace + shrinkDuration, START)).toBe('closed');
  });
});

describe('isOutside — boundary INCLUSIVE-SAFE', () => {
  it('treats a point exactly on the ring as inside (safe)', () => {
    expect(isOutside({ x: MAP_R, y: 0 }, MAP_R)).toBe(false);
    expect(isOutside({ x: 0, y: MAP_R }, MAP_R)).toBe(false);
  });

  it('is outside strictly beyond the radius, inside strictly within', () => {
    expect(isOutside({ x: MAP_R + 0.001, y: 0 }, MAP_R)).toBe(true);
    expect(isOutside({ x: MAP_R - 0.001, y: 0 }, MAP_R)).toBe(false);
    expect(isOutside({ x: 0, y: 0 }, MAP_R)).toBe(false);
  });
});
