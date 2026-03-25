// ============================================================
// SALVO — Hex Coordinate System
// Axial coordinates (q, r) with pointy-top orientation.
// Reference: https://www.redblobgames.com/grids/hexagons/
// ============================================================

// --- Types ---

export interface Hex {
  q: number;
  r: number;
}

// --- Constants ---

/**
 * 6 axial direction vectors for pointy-top hex grid.
 * Order: E, NE, NW, W, SW, SE (clockwise from east)
 */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },   // E   (0°)
  { q: 1, r: -1 },  // NE  (60°)
  { q: 0, r: -1 },  // NW  (120°)
  { q: -1, r: 0 },  // W   (180°)
  { q: -1, r: 1 },  // SW  (240°)
  { q: 0, r: 1 },   // SE  (300°)
] as const;

// --- Coordinate Conversion ---

/** Convert axial (q, r) to wire format string "q,r" */
export function hexToString(q: number, r: number): string {
  return `${q},${r}`;
}

/** Parse wire format "q,r" to Hex. Returns null if invalid. */
export function parseHex(s: string): Hex | null {
  const parts = s.split(',');
  if (parts.length !== 2) return null;
  const q = parseInt(parts[0], 10);
  const r = parseInt(parts[1], 10);
  if (isNaN(q) || isNaN(r)) return null;
  // Reject non-integer strings like "1.5,2"
  if (parts[0].trim() !== String(q) || parts[1].trim() !== String(r)) return null;
  return { q, r };
}

// --- Hex Math ---

/** Axial distance between two hexes (= number of steps) */
export function hexDistance(a: Hex, b: Hex): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs((a.q + a.r) - (b.q + b.r))
  );
}

/** Check if hex (q, r) is within a grid of the given ring count */
export function isValidHex(q: number, r: number, rings: number): boolean {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= rings;
}

/** Get the 6 neighbors of a hex. Does NOT filter by bounds. */
export function hexNeighbors(q: number, r: number): Hex[] {
  return HEX_DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

/** Get valid neighbors within the given ring count */
export function hexNeighborsInBounds(q: number, r: number, rings: number): Hex[] {
  return hexNeighbors(q, r).filter(h => isValidHex(h.q, h.r, rings));
}

/** Generate all valid hex coordinates for a grid with N rings around center */
export function allHexes(rings: number): string[] {
  const coords: string[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      if (isValidHex(q, r, rings)) {
        coords.push(hexToString(q, r));
      }
    }
  }
  return coords;
}

/** Total number of hexes in a grid with N rings: 3n² + 3n + 1 */
export function hexCount(rings: number): number {
  return 3 * rings * rings + 3 * rings + 1;
}

/** Get all hexes at exactly distance N from center (0,0) */
export function hexRing(radius: number): Hex[] {
  if (radius === 0) return [{ q: 0, r: 0 }];

  const results: Hex[] = [];
  // Start at the "top-right" of the ring and walk around
  let h: Hex = { q: radius, r: 0 };

  // Walk along each of the 6 edges of the ring
  for (let side = 0; side < 6; side++) {
    const dir = HEX_DIRECTIONS[(side + 2) % 6]; // offset by 2 to walk CCW from start
    for (let step = 0; step < radius; step++) {
      results.push({ ...h });
      h = { q: h.q + dir.q, r: h.r + dir.r };
    }
  }

  return results;
}

/**
 * Get cells along a hex line starting at (q, r) in the given direction for `length` cells.
 * Returns null if any cell would be out of bounds.
 */
export function hexLinear(
  q: number, r: number,
  dirIndex: number,
  length: number,
  rings: number
): string[] | null {
  const dir = HEX_DIRECTIONS[((dirIndex % 6) + 6) % 6];
  const cells: string[] = [];

  for (let i = 0; i < length; i++) {
    const cq = q + dir.q * i;
    const cr = r + dir.r * i;
    if (!isValidHex(cq, cr, rings)) return null;
    cells.push(hexToString(cq, cr));
  }

  return cells;
}

// --- Pixel Conversion (pointy-top orientation) ---

/** Convert axial hex to pixel center (pointy-top) */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
  const y = size * (3 / 2 * r);
  return { x, y };
}

/** Convert pixel to fractional axial hex (pointy-top), then round to nearest hex */
export function pixelToHex(x: number, y: number, size: number): Hex {
  // Pixel to fractional axial
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;

  // Round using cube coordinate rounding (Red Blob Games algorithm)
  return cubeRound(q, r);
}

/**
 * Round fractional axial coordinates to the nearest hex.
 * Converts to cube, rounds each component, then adjusts the component
 * with the largest rounding error to maintain the cube constraint q+r+s=0.
 */
function cubeRound(fq: number, fr: number): Hex {
  const fs = -fq - fr;

  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);

  const qDiff = Math.abs(q - fq);
  const rDiff = Math.abs(r - fr);
  const sDiff = Math.abs(s - fs);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }
  // else: s = -q - r (implicit, we don't use s)

  // Avoid -0
  return { q: q || 0, r: r || 0 };
}

/**
 * Get the 6 corner vertices of a hex at (q, r) with the given size (pointy-top).
 * Returns points suitable for SVG polygon.
 */
export function hexCorners(q: number, r: number, size: number): { x: number; y: number }[] {
  const center = hexToPixel(q, r, size);
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30; // pointy-top: first corner at -30°
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad),
    });
  }
  return corners;
}
