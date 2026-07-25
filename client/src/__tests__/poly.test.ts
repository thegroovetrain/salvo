// util/poly.ts — the closed-polygon perimeter helpers the hotbar's "conic"
// cooldown track and dashed empty slot are drawn with (extracted from
// render/hotbar.ts). The Graphics is stubbed to a path recorder: these are pure
// geometry walks, no Pixi involved.

import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import { polyLengths, polyPointAt, tracePerimeter, traceDashed, type PolyPoint } from '../util/poly.js';

/** A 40×40 square, clockwise from its top-left (perimeter 160). */
const SQUARE: PolyPoint[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

interface Cmd {
  op: 'move' | 'line';
  x: number;
  y: number;
}

/** Minimal Graphics stub recording the emitted path. */
function recorder(): { cmds: Cmd[]; g: Graphics } {
  const cmds: Cmd[] = [];
  const g = {
    moveTo(x: number, y: number) {
      cmds.push({ op: 'move', x, y });
      return this;
    },
    lineTo(x: number, y: number) {
      cmds.push({ op: 'line', x, y });
      return this;
    },
  };
  return { cmds, g: g as unknown as Graphics };
}

describe('polyLengths / polyPointAt', () => {
  it('accumulates every edge, closing the ring', () => {
    expect(polyLengths(SQUARE)).toEqual([40, 80, 120, 160]);
  });

  it('walks the ring by arc length, clamping past the end', () => {
    const acc = polyLengths(SQUARE);
    expect(polyPointAt(SQUARE, acc, 0)).toEqual({ x: 0, y: 0 });
    expect(polyPointAt(SQUARE, acc, 20)).toEqual({ x: 20, y: 0 });
    expect(polyPointAt(SQUARE, acc, 60)).toEqual({ x: 40, y: 20 });
    expect(polyPointAt(SQUARE, acc, 160)).toEqual({ x: 0, y: 0 }); // full lap
    expect(polyPointAt(SQUARE, acc, 999)).toEqual({ x: 0, y: 0 }); // clamped
  });
});

describe('tracePerimeter — the cooldown track', () => {
  it('emits corners EXACTLY, so a chamfered silhouette survives the arc', () => {
    const { cmds, g } = recorder();
    tracePerimeter(g, SQUARE, 0, 0.625); // 100 of 160px: past two corners, mid-edge
    expect(cmds[0]).toEqual({ op: 'move', x: 0, y: 0 });
    expect(cmds).toContainEqual({ op: 'line', x: 40, y: 0 }); // corner 1, not a sampled chord
    expect(cmds).toContainEqual({ op: 'line', x: 40, y: 40 }); // corner 2
    expect(cmds[cmds.length - 1]).toEqual({ op: 'line', x: 20, y: 40 }); // the 62.5% point
    expect(cmds).toHaveLength(4); // move + 2 corners + the end point — nothing sampled
  });

  it('draws nothing for an empty or inverted span (frac 0 elapsed arc)', () => {
    const { cmds, g } = recorder();
    tracePerimeter(g, SQUARE, 0, 0);
    tracePerimeter(g, SQUARE, 0.8, 0.2);
    expect(cmds).toEqual([]);
  });

  it('traces the REMAINING span from an arbitrary start', () => {
    const { cmds, g } = recorder();
    tracePerimeter(g, SQUARE, 0.75, 1);
    expect(cmds[0]).toEqual({ op: 'move', x: 0, y: 40 });
    expect(cmds[cmds.length - 1]).toEqual({ op: 'line', x: 0, y: 0 });
  });
});

describe('traceDashed — the empty slot outline', () => {
  it('dashes PER EDGE so corners stay crisp (every dash starts on its own edge)', () => {
    const { cmds, g } = recorder();
    traceDashed(g, SQUARE, 8); // 5 dashes per 40px edge, 4 edges
    const moves = cmds.filter((c) => c.op === 'move');
    expect(moves).toHaveLength(20);
    expect(cmds).toHaveLength(40); // one move + one line per dash
    expect(moves[0]).toEqual({ op: 'move', x: 0, y: 0 });
    expect(moves[5]).toEqual({ op: 'move', x: 40, y: 0 }); // the second edge starts at the corner
  });
});
