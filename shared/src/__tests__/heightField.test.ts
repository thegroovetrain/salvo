// Pins the fBm height field, the retained quantized raster, and the max-height
// pyramid (cycle 59).
//
// The pyramid has NO consumer yet — a future cycle raymarches it for radar
// shadows (Eric ruling 2026-08-06) — so these tests are the only thing standing
// between it and silent rot. They check the one property a raymarch depends on:
// a tile's stored ceiling is never below any sample beneath it, at every level.
//
// Most cases run at a small radius; the production disc (2800u — Story 5.6,
// amendment 42: 2400 → 2800) is exercised once, because a full field is
// ~164k samples and the suite pays for it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../math/rng.js';
import {
  SEA_HEIGHT,
  TERRAIN_PARAMS,
  buildField,
  buildHeightRaster,
  fieldValueOf,
  sampleHeight,
  tileCeiling,
  tileCeilingAt,
  tileIndexX,
  tileIndexY,
  tileSize,
  type HeightField,
  type HeightRaster,
} from '../sim/heightField.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/heightField.ts', import.meta.url)), 'utf8');

const R = 600; // small disc: same code path, ~90x90 grid
const RING = R * 0.8;

/** FNV-1a over the raw bytes of a typed array — the unit-test stand-in for the
 *  prototype's cross-process SHA-256 fingerprint (tmp-fbm/determinism.mjs). */
function fingerprint(a: ArrayBufferView): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function seaLevelFor(field: HeightField, cover: number): number {
  const vals = Array.from(field.v).filter((v) => v > -1).sort((a, b) => b - a);
  return vals[Math.max(0, Math.min(vals.length - 1, Math.round(cover * vals.length)))];
}

function rasterFor(seed: number, radius = R): HeightRaster {
  const field = buildField(seed, radius, radius * 0.8, TERRAIN_PARAMS);
  return buildHeightRaster(field, seaLevelFor(field, TERRAIN_PARAMS.coverTarget));
}

describe('TERRAIN_PARAMS — the single tuning panel', () => {
  it('carries the eye-approved prototype values (changing one changes the ocean)', () => {
    expect(TERRAIN_PARAMS.cell).toBe(14);
    expect(TERRAIN_PARAMS.lobePersistence).toBe(0.68); // THE shape lever
    expect(TERRAIN_PARAMS.lobeWeight).toBe(0.76);
    expect(TERRAIN_PARAMS.ridgeWeight).toBe(0.24);
    expect(TERRAIN_PARAMS.detailWeight).toBe(0.11);
    expect(TERRAIN_PARAMS.regionWeight).toBe(0.05);
    expect(TERRAIN_PARAMS.warpAmount).toBe(240);
    expect(TERRAIN_PARAMS.warp2Amount).toBe(140);
    expect(TERRAIN_PARAMS.coverTarget).toBe(0.025);
    expect(TERRAIN_PARAMS.contourLevels).toBe(3); // 4 bands, the ratified cap
  });

  it('keeps the coverage target inside the ratified [2%, 3%] band', () => {
    expect(TERRAIN_PARAMS.coverTarget).toBeGreaterThanOrEqual(TERRAIN_PARAMS.coverMin);
    expect(TERRAIN_PARAMS.coverTarget).toBeLessThanOrEqual(TERRAIN_PARAMS.coverMax);
  });
});

describe('buildField — determinism', () => {
  it('is byte-identical for the same seed, and differs across seeds', () => {
    const a = buildField(7, R, RING, TERRAIN_PARAMS);
    const b = buildField(7, R, RING, TERRAIN_PARAMS);
    const c = buildField(8, R, RING, TERRAIN_PARAMS);
    expect(a.n).toBe(b.n);
    expect(fingerprint(a.v)).toBe(fingerprint(b.v));
    expect(fingerprint(c.v)).not.toBe(fingerprint(a.v));
  });

  it('holds its fingerprint across repeated construction of the same map', () => {
    const first = fingerprint(buildField(20250806, R, RING, TERRAIN_PARAMS).v);
    for (let i = 0; i < 4; i++) {
      expect(fingerprint(buildField(20250806, R, RING, TERRAIN_PARAMS).v)).toBe(first);
    }
  });

  it('is deterministic through the raster and the whole pyramid', () => {
    const a = rasterFor(31337);
    const b = rasterFor(31337);
    expect(a.seaLevel).toBe(b.seaLevel);
    expect(a.peak).toBe(b.peak);
    expect(a.pyramid).toHaveLength(b.pyramid.length);
    for (let k = 0; k < a.pyramid.length; k++) {
      expect(fingerprint(a.pyramid[k].cells)).toBe(fingerprint(b.pyramid[k].cells));
    }
  });

  it('degenerate seed 0 builds a finite field with real relief', () => {
    const f = buildField(0, R, RING, TERRAIN_PARAMS);
    let min = Infinity;
    let max = -Infinity;
    let nonFinite = 0;
    for (const v of f.v) {
      if (!Number.isFinite(v)) nonFinite++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(nonFinite).toBe(0);
    expect(max).toBeGreaterThan(min);
  });
});

describe('buildField — grid geometry', () => {
  const f = buildField(5, R, RING, TERRAIN_PARAMS);

  it('covers the disc with an odd-sized, origin-centred grid', () => {
    expect(f.cell).toBe(TERRAIN_PARAMS.cell);
    expect(f.n % 2).toBe(1); // n-1 even: the refinement pass halves it exactly
    expect(f.x0).toBe(f.y0);
    expect(f.x0).toBeLessThanOrEqual(-R);
    expect(f.x0 + (f.n - 1) * f.cell).toBeGreaterThanOrEqual(R);
  });

  it('stamps every out-of-disc sample with the deep-negative sentinel', () => {
    let inMax = -Infinity;
    let stray = 0;
    for (let j = 0; j < f.n; j++) {
      for (let i = 0; i < f.n; i++) {
        const x = f.x0 + i * f.cell;
        const y = f.y0 + j * f.cell;
        const v = f.v[j * f.n + i];
        // The refinement band never covers out-of-disc cells, so neither the
        // morphology nor the blur can perturb the sentinel.
        if (x * x + y * y > R * R) stray += v === -1 ? 0 : 1;
        else inMax = Math.max(inMax, v);
      }
    }
    expect(stray).toBe(0);
    expect(inMax).toBeGreaterThan(-1); // land exists above the sentinel
  });
});

describe('buildHeightRaster — quantization and sampling', () => {
  const field = buildField(1234, R, RING, TERRAIN_PARAMS);
  const sea = seaLevelFor(field, TERRAIN_PARAMS.coverTarget);
  const r = buildHeightRaster(field, sea);

  it('quantizes to Uint8 with 0 at sea level and 255 at the peak', () => {
    expect(r.height).toBeInstanceOf(Uint8Array);
    expect(r.height).toHaveLength(r.n * r.n);
    expect(Math.min(...r.height)).toBe(SEA_HEIGHT);
    expect(Math.max(...r.height)).toBe(255);
    expect(r.seaLevel).toBe(sea);
  });

  it('clamps everything at or below sea level to 0 and never inverts order', () => {
    let submerged = 0;
    let inversions = 0;
    for (let k = 0; k < r.height.length; k++) {
      if (field.v[k] <= sea && r.height[k] !== SEA_HEIGHT) submerged++;
      if (k > 0 && field.v[k] > field.v[k - 1] && r.height[k] < r.height[k - 1]) inversions++;
    }
    expect(submerged).toBe(0);
    expect(inversions).toBe(0);
  });

  it('round-trips a quantized height back to a field value within one step', () => {
    const step = (r.peak - r.seaLevel) / 255;
    for (let k = 0; k < r.height.length; k += 97) {
      if (field.v[k] < sea) continue;
      expect(Math.abs(fieldValueOf(r, r.height[k]) - field.v[k])).toBeLessThanOrEqual(step);
    }
  });

  it('in-bounds sampling reads the underlying raster cell', () => {
    for (let j = 0; j < r.n; j += 7) {
      for (let i = 0; i < r.n; i += 7) {
        const x = r.x0 + i * r.cell;
        const y = r.y0 + j * r.cell;
        expect(sampleHeight(r, x, y)).toBe(r.height[j * r.n + i]);
      }
    }
  });

  it('snaps to the nearest sample inside a cell', () => {
    const x = r.x0 + 10 * r.cell;
    const y = r.y0 + 10 * r.cell;
    expect(sampleHeight(r, x + r.cell * 0.4, y - r.cell * 0.4)).toBe(r.height[10 * r.n + 10]);
  });

  it('clamps every off-raster read to sea level', () => {
    const far = r.x0 - 10 * r.cell;
    const beyond = r.x0 + (r.n + 10) * r.cell;
    expect(sampleHeight(r, far, 0)).toBe(SEA_HEIGHT);
    expect(sampleHeight(r, 0, far)).toBe(SEA_HEIGHT);
    expect(sampleHeight(r, beyond, 0)).toBe(SEA_HEIGHT);
    expect(sampleHeight(r, 0, beyond)).toBe(SEA_HEIGHT);
  });

  it('reads sea level outside the map disc but inside the grid square', () => {
    const corner = r.x0 + r.cell; // deep in the square's corner, outside the disc
    expect(sampleHeight(r, corner, corner)).toBe(SEA_HEIGHT);
  });
});

describe('buildHeightRaster — the land-mask stamp (closure-sealed lagoons)', () => {
  // A tiny synthetic field. Sea level 0.5; every sample is water except one
  // real peak. The closure pass flips a lagoon sample WATER→LAND in the MASK
  // ONLY — the field stays below sea level there — so cell 5 models exactly
  // the shipped defect: mask says land, raw quantization says sea.
  const n = 4;
  const v = new Float32Array(n * n); // all 0 — below the 0.5 sea level
  v[10] = 1.5; // one real land sample (the peak)
  const field: HeightField = { n, cell: 14, x0: 0, y0: 0, v };
  const land = new Uint8Array(n * n);
  land[10] = 1; // real land
  land[5] = 1; // closure-sealed lagoon: field below sea, mask says LAND

  it('stamps masked land that quantizes to sea level up to the minimum land height', () => {
    const r = buildHeightRaster(field, 0.5, undefined, land);
    expect(r.height[5]).toBe(1); // solid, but low — never transparent sea
    expect(r.height[10]).toBe(255); // real land untouched by the stamp
    expect(r.height[0]).toBe(SEA_HEIGHT); // unmasked water stays sea
  });

  it('without the mask the lagoon cell reads sea level (the pre-stamp defect)', () => {
    expect(buildHeightRaster(field, 0.5).height[5]).toBe(SEA_HEIGHT);
  });

  it('builds the pyramid AFTER the stamp, so tile ceilings see the sealed land', () => {
    const r = buildHeightRaster(field, 0.5, undefined, land);
    // Level-1 tile (0,0) covers cells (0..1, 0..1) — the lagoon cell 5.
    expect(tileCeiling(r, 1, 0, 0)).toBeGreaterThanOrEqual(1);
    expect(r.pyramid[r.pyramid.length - 1].cells[0]).toBe(255);
  });
});

describe('max-height pyramid — the radar-shadow substrate', () => {
  const r = rasterFor(4711);

  it('roots at level 0 = the raster itself and halves to a 1x1 summit', () => {
    expect(r.pyramid[0].cells).toBe(r.height);
    expect(r.pyramid[0].n).toBe(r.n);
    for (let k = 1; k < r.pyramid.length; k++) {
      expect(r.pyramid[k].n).toBe((r.pyramid[k - 1].n + 1) >> 1);
    }
    expect(r.pyramid[r.pyramid.length - 1].n).toBe(1);
    expect(r.pyramid[r.pyramid.length - 1].cells[0]).toBe(Math.max(...r.height));
  });

  it('stores in every cell of every level the exact max of its children', () => {
    for (let k = 1; k < r.pyramid.length; k++) {
      const lo = r.pyramid[k - 1];
      const hi = r.pyramid[k];
      for (let j = 0; j < hi.n; j++) {
        for (let i = 0; i < hi.n; i++) {
          let want = 0;
          for (let b = j * 2; b <= Math.min(j * 2 + 1, lo.n - 1); b++) {
            for (let a = i * 2; a <= Math.min(i * 2 + 1, lo.n - 1); a++) {
              want = Math.max(want, lo.cells[b * lo.n + a]);
            }
          }
          expect(hi.cells[j * hi.n + i]).toBe(want);
        }
      }
    }
  });

  // These loops count violations and assert ONCE: a per-sample `expect` here is
  // tens of thousands of matcher calls and dominates the suite's runtime.
  it('never reports a tile ceiling below a sample beneath it (randomized tiles)', () => {
    const rng = mulberry32(0xc0ffee);
    let violations = 0;
    let checked = 0;
    for (let trial = 0; trial < 400; trial++) {
      const level = 1 + rng.int(0, r.pyramid.length - 2);
      const lv = r.pyramid[level];
      const ti = rng.int(0, lv.n - 1);
      const tj = rng.int(0, lv.n - 1);
      const ceiling = tileCeiling(r, level, ti, tj);
      const span = 1 << level;
      for (let j = tj * span; j < Math.min((tj + 1) * span, r.n); j++) {
        for (let i = ti * span; i < Math.min((ti + 1) * span, r.n); i++) {
          checked++;
          if (r.height[j * r.n + i] > ceiling) violations++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(violations).toBe(0);
  });

  it('never reports a ceiling below the point sample there, at any level (randomized points)', () => {
    const rng = mulberry32(0x5eed);
    const extent = (r.n - 1) * r.cell;
    let violations = 0;
    for (let trial = 0; trial < 2000; trial++) {
      const x = r.x0 + rng.float(0, extent);
      const y = r.y0 + rng.float(0, extent);
      const h = sampleHeight(r, x, y);
      for (let level = 0; level < r.pyramid.length; level++) {
        if (tileCeilingAt(r, level, x, y) < h) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('ceilings are monotonically non-decreasing as the raymarch coarsens', () => {
    const rng = mulberry32(0xbeef);
    const extent = (r.n - 1) * r.cell;
    let violations = 0;
    for (let trial = 0; trial < 500; trial++) {
      const x = r.x0 + rng.float(0, extent);
      const y = r.y0 + rng.float(0, extent);
      for (let level = 1; level < r.pyramid.length; level++) {
        if (tileCeilingAt(r, level, x, y) < tileCeilingAt(r, level - 1, x, y)) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('exposes the index/size arithmetic a raymarch steps with', () => {
    expect(tileSize(r, 0)).toBe(r.cell);
    expect(tileSize(r, 3)).toBe(r.cell * 8);
    expect(tileIndexX(r, 0, r.x0 + 9 * r.cell)).toBe(9);
    expect(tileIndexY(r, 2, r.y0 + 9 * r.cell)).toBe(2);
    expect(tileCeilingAt(r, 2, r.x0 + 9 * r.cell, r.y0 + 9 * r.cell)).toBe(tileCeiling(r, 2, 2, 2));
  });

  it('clamps out-of-range tiles and levels to sea level', () => {
    expect(tileCeiling(r, 0, -1, 0)).toBe(SEA_HEIGHT);
    expect(tileCeiling(r, 0, 0, -1)).toBe(SEA_HEIGHT);
    expect(tileCeiling(r, 0, r.n, 0)).toBe(SEA_HEIGHT);
    expect(tileCeiling(r, -1, 0, 0)).toBe(SEA_HEIGHT);
    expect(tileCeiling(r, r.pyramid.length, 0, 0)).toBe(SEA_HEIGHT);
  });
});

describe('production map size (radius 2800 — Story 5.6, amendment 42: was 2400)', () => {
  const r = rasterFor(2026, 2800);

  it('builds the ~164KB raster the radar-shadow pass marches', () => {
    expect(r.n).toBe(405);
    expect(r.height.length).toBe(405 * 405); // 164,025 bytes at cell 14
    expect(r.pyramid).toHaveLength(10); // 405 -> 1
  });

  it('is deterministic at production size', () => {
    expect(fingerprint(r.height)).toBe(fingerprint(rasterFor(2026, 2800).height));
  });
});

describe('heightField.ts — no transcendentals on the generation path', () => {
  const FORBIDDEN_MATH = [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
    'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
    'hypot', 'cbrt', 'random',
  ];

  it('calls no transcendental Math function, no Math.random, no Date.now', () => {
    for (const fn of FORBIDDEN_MATH) {
      expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(SRC), `Math.${fn}( is forbidden`).toBe(false);
    }
    expect(/Date\.now\s*\(/.test(SRC), 'Date.now( is forbidden').toBe(false);
    expect(/\bMath\.PI\b/.test(SRC), 'Math.PI is forbidden').toBe(false);
  });

  it('imports nothing outside shared/ (sim purity)', () => {
    // Story 5.6 (amendment 42): `regionWavelength` now tracks
    // `CONFIG.map.baseRadius` (was a fixed 2400 literal) so the macro
    // land-clustering term keeps spanning the disc exactly once at the new
    // 2800u radius — a genuine new CONFIG import, still entirely within
    // shared/, so sim purity (zero I/O, no cross-workspace import) holds.
    const imports = [...SRC.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['../constants.js', './noise.js']);
  });
});
