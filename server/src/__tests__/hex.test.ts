import { describe, it, expect } from 'vitest';
import {
  hexToString, parseHex, hexDistance, hexNeighbors, hexNeighborsInBounds,
  allHexes, hexCount, isValidHex, hexRing, hexLinear,
  hexToPixel, pixelToHex, hexCorners, HEX_DIRECTIONS,
} from '@salvo/shared/hex';
import type { Hex } from '@salvo/shared/hex';

// ============================================================
// hexToString / parseHex
// ============================================================

describe('hexToString', () => {
  it('formats center hex', () => {
    expect(hexToString(0, 0)).toBe('0,0');
  });

  it('formats positive coordinates', () => {
    expect(hexToString(3, 2)).toBe('3,2');
  });

  it('formats negative coordinates', () => {
    expect(hexToString(-2, 4)).toBe('-2,4');
  });

  it('formats mixed signs', () => {
    expect(hexToString(5, -3)).toBe('5,-3');
  });
});

describe('parseHex', () => {
  it('parses center hex', () => {
    expect(parseHex('0,0')).toEqual({ q: 0, r: 0 });
  });

  it('parses positive coordinates', () => {
    expect(parseHex('3,2')).toEqual({ q: 3, r: 2 });
  });

  it('parses negative coordinates', () => {
    expect(parseHex('-2,4')).toEqual({ q: -2, r: 4 });
  });

  it('parses mixed signs', () => {
    expect(parseHex('5,-3')).toEqual({ q: 5, r: -3 });
  });

  it('returns null for empty string', () => {
    expect(parseHex('')).toBeNull();
  });

  it('returns null for single number', () => {
    expect(parseHex('5')).toBeNull();
  });

  it('returns null for three parts', () => {
    expect(parseHex('1,2,3')).toBeNull();
  });

  it('returns null for non-numeric', () => {
    expect(parseHex('a,b')).toBeNull();
  });

  it('returns null for float values', () => {
    expect(parseHex('1.5,2')).toBeNull();
  });

  it('round-trips with hexToString', () => {
    const cases = [[0, 0], [3, -1], [-5, 2], [1, 4], [-3, -2]];
    for (const [q, r] of cases) {
      expect(parseHex(hexToString(q, r))).toEqual({ q, r });
    }
  });
});

// ============================================================
// hexDistance
// ============================================================

describe('hexDistance', () => {
  it('distance from hex to itself is 0', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(hexDistance({ q: 3, r: -1 }, { q: 3, r: -1 })).toBe(0);
  });

  it('distance to adjacent hex is 1', () => {
    const center = { q: 0, r: 0 };
    for (const dir of HEX_DIRECTIONS) {
      expect(hexDistance(center, dir)).toBe(1);
    }
  });

  it('distance across the grid', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 5, r: 0 })).toBe(5);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: -5 })).toBe(5);
    expect(hexDistance({ q: -3, r: 2 }, { q: 3, r: -2 })).toBe(6);
  });

  it('is symmetric', () => {
    const a = { q: 2, r: -3 };
    const b = { q: -1, r: 4 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });
});

// ============================================================
// isValidHex
// ============================================================

describe('isValidHex', () => {
  it('center is always valid', () => {
    expect(isValidHex(0, 0, 0)).toBe(true);
    expect(isValidHex(0, 0, 5)).toBe(true);
  });

  it('boundary hexes are valid', () => {
    expect(isValidHex(5, 0, 5)).toBe(true);
    expect(isValidHex(0, 5, 5)).toBe(true);
    expect(isValidHex(-5, 0, 5)).toBe(true);
    expect(isValidHex(3, -3, 5)).toBe(true);  // q + r = 0
    expect(isValidHex(5, -5, 5)).toBe(true);  // corner
  });

  it('just outside boundary is invalid', () => {
    expect(isValidHex(6, 0, 5)).toBe(false);
    expect(isValidHex(0, 6, 5)).toBe(false);
    expect(isValidHex(3, 3, 5)).toBe(false);  // |q+r| = 6 > 5
  });

  it('works for different ring counts', () => {
    expect(isValidHex(4, 0, 4)).toBe(true);
    expect(isValidHex(5, 0, 4)).toBe(false);
    expect(isValidHex(6, 0, 6)).toBe(true);
    expect(isValidHex(7, 0, 6)).toBe(false);
  });
});

// ============================================================
// hexNeighbors
// ============================================================

describe('hexNeighbors', () => {
  it('center has 6 neighbors', () => {
    const n = hexNeighbors(0, 0);
    expect(n).toHaveLength(6);
  });

  it('center neighbors are the 6 directions', () => {
    const n = hexNeighbors(0, 0);
    const expected = HEX_DIRECTIONS.map(d => ({ q: d.q, r: d.r }));
    expect(n).toEqual(expected);
  });

  it('non-center hex has 6 neighbors', () => {
    const n = hexNeighbors(3, -2);
    expect(n).toHaveLength(6);
    // All should be distance 1 from (3, -2)
    for (const h of n) {
      expect(hexDistance({ q: 3, r: -2 }, h)).toBe(1);
    }
  });
});

describe('hexNeighborsInBounds', () => {
  it('center with 5 rings has 6 valid neighbors', () => {
    expect(hexNeighborsInBounds(0, 0, 5)).toHaveLength(6);
  });

  it('edge hex has fewer valid neighbors', () => {
    // Hex at (5, 0) is on the boundary of ring 5
    const n = hexNeighborsInBounds(5, 0, 5);
    // Only neighbors within bounds: (4, 0), (4, 1), (5, -1) — 3 valid
    expect(n.length).toBeLessThan(6);
    for (const h of n) {
      expect(isValidHex(h.q, h.r, 5)).toBe(true);
    }
  });

  it('corner hex has 3 valid neighbors', () => {
    // Hex at (5, -5) is a corner — only 3 neighbors are in bounds
    const n = hexNeighborsInBounds(5, -5, 5);
    expect(n).toHaveLength(3);
  });
});

// ============================================================
// allHexes / hexCount
// ============================================================

describe('allHexes', () => {
  it('0 rings = 1 hex (center)', () => {
    const hexes = allHexes(0);
    expect(hexes).toEqual(['0,0']);
  });

  it('1 ring = 7 hexes', () => {
    expect(allHexes(1)).toHaveLength(7);
    expect(allHexes(1)).toContain('0,0');
    expect(allHexes(1)).toContain('1,0');
    expect(allHexes(1)).toContain('-1,1');
  });

  it('5 rings = 91 hexes', () => {
    expect(allHexes(5)).toHaveLength(91);
  });

  it('6 rings = 127 hexes', () => {
    expect(allHexes(6)).toHaveLength(127);
  });

  it('4 rings = 61 hexes', () => {
    expect(allHexes(4)).toHaveLength(61);
  });

  it('all hexes are valid', () => {
    for (const coord of allHexes(5)) {
      const h = parseHex(coord);
      expect(h).not.toBeNull();
      expect(isValidHex(h!.q, h!.r, 5)).toBe(true);
    }
  });

  it('no duplicates', () => {
    const hexes = allHexes(5);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});

describe('hexCount', () => {
  it('matches allHexes length', () => {
    for (const rings of [0, 1, 2, 3, 4, 5, 6]) {
      expect(hexCount(rings)).toBe(allHexes(rings).length);
    }
  });

  it('formula: 3n² + 3n + 1', () => {
    expect(hexCount(0)).toBe(1);
    expect(hexCount(1)).toBe(7);
    expect(hexCount(2)).toBe(19);
    expect(hexCount(5)).toBe(91);
    expect(hexCount(6)).toBe(127);
  });
});

// ============================================================
// hexRing
// ============================================================

describe('hexRing', () => {
  it('ring 0 is just the center', () => {
    expect(hexRing(0)).toEqual([{ q: 0, r: 0 }]);
  });

  it('ring 1 has 6 hexes', () => {
    const ring = hexRing(1);
    expect(ring).toHaveLength(6);
    for (const h of ring) {
      expect(hexDistance({ q: 0, r: 0 }, h)).toBe(1);
    }
  });

  it('ring 2 has 12 hexes', () => {
    expect(hexRing(2)).toHaveLength(12);
  });

  it('ring 5 has 30 hexes', () => {
    expect(hexRing(5)).toHaveLength(30);
  });

  it('ring N has 6*N hexes (N > 0)', () => {
    for (let n = 1; n <= 6; n++) {
      expect(hexRing(n)).toHaveLength(6 * n);
    }
  });

  it('all ring hexes are at the correct distance', () => {
    const center = { q: 0, r: 0 };
    for (let radius = 1; radius <= 5; radius++) {
      for (const h of hexRing(radius)) {
        expect(hexDistance(center, h)).toBe(radius);
      }
    }
  });

  it('no duplicate hexes in a ring', () => {
    for (let radius = 1; radius <= 5; radius++) {
      const ring = hexRing(radius);
      const strings = ring.map(h => hexToString(h.q, h.r));
      expect(new Set(strings).size).toBe(strings.length);
    }
  });
});

// ============================================================
// hexLinear
// ============================================================

describe('hexLinear', () => {
  it('length 1 returns just the start hex', () => {
    const cells = hexLinear(0, 0, 0, 1, 5);
    expect(cells).toEqual(['0,0']);
  });

  it('generates cells along east direction', () => {
    const cells = hexLinear(0, 0, 0, 4, 5); // direction 0 = E (+1, 0)
    expect(cells).toEqual(['0,0', '1,0', '2,0', '3,0']);
  });

  it('generates cells along NE direction', () => {
    const cells = hexLinear(0, 0, 1, 3, 5); // direction 1 = NE (+1, -1)
    expect(cells).toEqual(['0,0', '1,-1', '2,-2']);
  });

  it('generates cells along all 6 directions from center', () => {
    for (let dir = 0; dir < 6; dir++) {
      const cells = hexLinear(0, 0, dir, 2, 5);
      expect(cells).toHaveLength(2);
      expect(cells![0]).toBe('0,0');
      // Second cell should be in the direction
      const h = parseHex(cells![1])!;
      expect(h.q).toBe(HEX_DIRECTIONS[dir].q);
      expect(h.r).toBe(HEX_DIRECTIONS[dir].r);
    }
  });

  it('returns null if ship goes off grid', () => {
    // From (4, 0) going east, length 3 on 5-ring grid: (4,0), (5,0), (6,0) — 6,0 is out
    expect(hexLinear(4, 0, 0, 3, 5)).toBeNull();
  });

  it('returns cells from non-center start', () => {
    const cells = hexLinear(2, -1, 0, 3, 5); // E from (2,-1)
    expect(cells).toEqual(['2,-1', '3,-1', '4,-1']);
  });

  it('handles negative direction indices via modulo', () => {
    // Direction -1 should wrap to direction 5 (SE)
    const cells = hexLinear(0, 0, -1, 2, 5);
    expect(cells).toEqual(['0,0', '0,1']); // SE = (0, 1)
  });

  it('boundary: full ship at edge of grid', () => {
    // From (2, 0) going east, length 4 on 5-ring: (2,0), (3,0), (4,0), (5,0) — all valid
    const cells = hexLinear(2, 0, 0, 4, 5);
    expect(cells).toEqual(['2,0', '3,0', '4,0', '5,0']);
  });

  it('just past boundary returns null', () => {
    // From (3, 0) going east, length 4: (3,0), (4,0), (5,0), (6,0) — 6,0 invalid
    expect(hexLinear(3, 0, 0, 4, 5)).toBeNull();
  });
});

// ============================================================
// hexToPixel / pixelToHex (round-trip)
// ============================================================

describe('hexToPixel', () => {
  it('center hex is at origin', () => {
    const { x, y } = hexToPixel(0, 0, 10);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  it('hex (1, 0) is to the right', () => {
    const { x, y } = hexToPixel(1, 0, 10);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeCloseTo(0);
  });

  it('hex (0, 1) is below and to the right', () => {
    const { x, y } = hexToPixel(0, 1, 10);
    expect(x).toBeGreaterThan(0); // sqrt(3)/2 * size > 0
    expect(y).toBeGreaterThan(0); // 3/2 * size > 0
  });
});

describe('pixelToHex', () => {
  it('origin maps to center hex', () => {
    const h = pixelToHex(0, 0, 10);
    expect(h).toEqual({ q: 0, r: 0 });
  });

  it('round-trips for all hexes in ring 3', () => {
    const size = 20;
    for (const coord of allHexes(3)) {
      const h = parseHex(coord)!;
      const px = hexToPixel(h.q, h.r, size);
      const result = pixelToHex(px.x, px.y, size);
      expect(result).toEqual({ q: h.q, r: h.r });
    }
  });

  it('slightly offset pixel still maps to correct hex', () => {
    const size = 20;
    const px = hexToPixel(2, -1, size);
    // Offset by a small amount (less than half hex size)
    const result = pixelToHex(px.x + 3, px.y - 2, size);
    expect(result).toEqual({ q: 2, r: -1 });
  });
});

// ============================================================
// hexCorners
// ============================================================

describe('hexCorners', () => {
  it('returns 6 corners', () => {
    expect(hexCorners(0, 0, 10)).toHaveLength(6);
  });

  it('all corners are at distance `size` from hex center', () => {
    const size = 15;
    const center = hexToPixel(2, -1, size);
    const corners = hexCorners(2, -1, size);
    for (const c of corners) {
      const dist = Math.sqrt((c.x - center.x) ** 2 + (c.y - center.y) ** 2);
      expect(dist).toBeCloseTo(size, 5);
    }
  });
});

// ============================================================
// HEX_DIRECTIONS
// ============================================================

describe('HEX_DIRECTIONS', () => {
  it('has 6 directions', () => {
    expect(HEX_DIRECTIONS).toHaveLength(6);
  });

  it('all directions are distance 1 from origin', () => {
    for (const d of HEX_DIRECTIONS) {
      expect(hexDistance({ q: 0, r: 0 }, d)).toBe(1);
    }
  });

  it('opposite directions sum to zero', () => {
    // Direction i and direction (i+3)%6 should be opposites
    for (let i = 0; i < 3; i++) {
      const a = HEX_DIRECTIONS[i];
      const b = HEX_DIRECTIONS[i + 3];
      expect(a.q + b.q).toBe(0);
      expect(a.r + b.r).toBe(0);
    }
  });
});
