// THE BEAM MARCH (cycle 62, amendments 138-143) — the pure half: rays, samples,
// slices. render/radar.ts's placement of them is pinned separately, at the
// adapter, in radarViewport.test.ts (amendment 98).
//
// WHAT IS CONTRACT HERE, not coverage:
//
//   • THE REPORTED DEFECT, AS A TEST. Eric's screenshot showed large stretches of
//     coastline unpainted, cut off along an arbitrary diagonal. The cause was
//     `faceShadow`, the near-face criterion FOR A DISC: on an elongated polygon a
//     point at a LATERAL tip has zero projection toward the observer, so it scored
//     `m = -rho^2/(d*r)` against a 0.3 ramp and clamped to ZERO regardless of
//     facing (amendment 139). The first block below re-implements that retired
//     criterion INDEPENDENTLY, proves it really would suppress most of a stretched
//     ridge from this observer, and then proves the march paints the whole thing.
//     Without the A/B the regression test would merely assert that something
//     paints, which was never the complaint.
//
//   • TERRAIN CASTS A HEIGHT-DERIVED SHADOW (Story 4.11, amendments 176-180),
//     and SHIPS STILL NEVER SHADOW SHIPS (amendment 107/141). A ray folds every
//     land raster cell it crosses into the SHARED accumulator the server's blip
//     gate calls, so an obstacle's near face paints at full strength, what is
//     behind it fades through the weakest band, and past the reach the ray emits
//     grey NO-DATA to the rim. The amendment-140 block this replaces asserted
//     that NOTHING occluded anything — it is RETIRED, not adapted, because it
//     pinned exactly the behaviour cycle 62 promised 4.11 would remove.
//
//   • WHICH MEANS A FIXTURE'S PYRAMID IS NOW LOAD-BEARING. `rasterFrom` ships an
//     EMPTY pyramid on purpose (it makes `tileCeilingAt` answer sea level, so
//     surf never fires and cannot muddy an unrelated fixture) and the shadow walk
//     fails OPEN on a raster with no pyramid — so every suite below that is not
//     about occlusion keeps its old, unshadowed answers unchanged. The shadow
//     suite builds `rasterWithPyramid` fixtures instead, which is the production
//     shape.
//
//   • CONTINUOUS HEIGHT, NEVER TERRACED (amendment 142). Intensity is a strictly
//     monotone function of the raster height, sampled at 256 levels — so a steep
//     headland reads red where a low flat island of the same size reads blue or
//     green, and a colour-band boundary is an ISO-HEIGHT LINE by construction.
//
//   • THE GRAIN REPORTS MARGINALITY (amendment 143). Amplitude is largest at the
//     detection floor and reaches zero at saturation: a landmass interior is
//     rock steady and its fringe crawls, which is the opposite of the flat +/-30%
//     that shipped.
//
//   • A SLICE IS A HISTORICAL RECORD (amendment 83) and slice CADENCE IS ANGULAR,
//     not per-frame: the same swept arc yields the same slices whatever the frame
//     rate, and a marched slice is a frozen array with nothing left in it to
//     re-evaluate.
//
//   • NO NaN EVER REACHES A CELL. `writeCell` is max-wins, so one NaN would
//     compare false against every later paint while one Infinity would win
//     everything it touched. Every degenerate input answers null instead.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  buildHeightRaster,
  hullSilhouette,
  rasterizeHullCoverage,
  sampleHeight,
  transformPolygon,
  wrapPositive,
  type HeightField,
  type HeightRaster,
  type HullCoverage,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { SURFACE, attenuation, heightReflectivity, noiseAmplitude } from '../render/radarFalloff.js';
import {
  bandIndex,
  cellCentre,
  cellOf,
  type HeatmapOpts,
} from '../render/radarHeatmap.js';
import {
  buildField,
  buildShipStamp,
  cellKey,
  coverageCentre,
  shipOnlyField,
  stampCoverage,
  type EchoHull,
  type RadarField,
  type ShipStamp,
} from '../render/radarField.js';
import {
  MAX_SLICES_PER_FRAME,
  catchUpArc,
  echoArc,
  marchSlice,
  planMarch,
  rayStep,
  sliceCount,
  type MarchSlice,
} from '../render/radarMarch.js';

const CFG: HeatmapOpts = CLIENT_CONFIG.blip.heatmap;
/** The shipped knobs with the grain switched off — geometry tests need a
 *  deterministic answer, and a zero envelope is a documented value of the knob. */
const CLEAN: HeatmapOpts = { ...CFG, noise: { amount: 0, solidAt: CFG.noise.solidAt } };
const BANDS = CFG.bands;
const RADAR = 660; // CONFIG.vision.radar at base stats
const TAU = Math.PI * 2;

// --- fixtures -------------------------------------------------------------------

/** The shipped generator's height-field sample spacing (shared/sim/heightField
 *  `P.cell`). Fixtures use the real number so cell-vs-raster resolution effects
 *  are the ones the game actually has. */
const RCELL = 14;

/**
 * A HeightRaster over a square about the origin, filled from a height function.
 *
 * `sampleHeight` reads `n`, `cell`, `x0`, `y0` and `height` and nothing else, and
 * the generator's own contract is `height > 0 ⟺ the mask says LAND` — so a
 * fixture only has to honour that to be a faithful stand-in for a real map.
 */
function rasterFrom(reachU: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reachU / RCELL);
  const n = 2 * k + 1;
  const x0 = -k * RCELL;
  const height = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) height[j * n + i] = h(x0 + i * RCELL, x0 + j * RCELL);
  }
  return { n, cell: RCELL, x0, y0: x0, seaLevel: 0, peak: 255, height, pyramid: [] };
}

/** A box of terrain at a uniform height. */
function box(cx: number, cy: number, hw: number, hh: number, h: number) {
  return (x: number, y: number): number =>
    Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh ? h : 0;
}

/** Combine height functions, tallest wins (two islands on one raster). */
function both(...fns: ((x: number, y: number) => number)[]) {
  return (x: number, y: number): number => Math.max(...fns.map((f) => f(x, y)));
}

/**
 * Like `rasterFrom`, but with a REAL max-height pyramid over it — the production
 * shape, and the only one the Story 4.11 shadow walk will march (it fails OPEN
 * on a raster with no pyramid, which is exactly what keeps every OTHER fixture
 * in this file unshadowed). `h` is passed straight through as the quantized
 * height, so `buildHeightRaster`'s `seaLevel: 0, peak: 255` is the identity.
 */
function rasterWithPyramid(reachU: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reachU / RCELL);
  const n = 2 * k + 1;
  const x0 = -k * RCELL;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) v[j * n + i] = h(x0 + i * RCELL, x0 + j * RCELL);
  }
  const field: HeightField = { n, cell: RCELL, x0, y0: x0, v };
  return buildHeightRaster(field, 0, 255);
}

/** A terrain-only field about an observer. */
function terrainField(raster: HeightRaster | null, obs: Vec2, o = CLEAN): RadarField {
  return buildField({
    obs,
    raster,
    ships: new Map(),
    ring: null,
    cellU: o.cellU,
    model: o.model,
  });
}

/** March a WHOLE revolution as one slice — the "what does the scope hold after a
 *  full turn" seam the geometry blocks assert against. */
function marchAll(obs: Vec2, field: RadarField, o = CLEAN, range = RADAR): MarchSlice {
  const s = marchSlice(obs, 0, TAU - 1e-6, field, range, 0, o);
  if (s === null) throw new Error('the march painted nothing');
  return s;
}

/** Every painted cell of a slice, as its world centre plus its band. */
function cellsOf(s: MarchSlice, o = CLEAN): { x: number; y: number; w: number; b: number }[] {
  const out: { x: number; y: number; w: number; b: number }[] = [];
  for (let k = 0; k < s.n; k++) {
    out.push({
      x: cellCentre(s.cells[k * 2], o.cellU),
      y: cellCentre(s.cells[k * 2 + 1], o.cellU),
      w: s.w[k],
      b: bandIndex(s.w[k], BANDS),
    });
  }
  return out;
}

/** The intensity a slice painted at a world point, or 0. */
function at(s: MarchSlice, x: number, y: number, o = CLEAN): number {
  const gx = cellOf(x, o.cellU);
  const gy = cellOf(y, o.cellU);
  for (let k = 0; k < s.n; k++) {
    if (s.cells[k * 2] === gx && s.cells[k * 2 + 1] === gy) return s.w[k];
  }
  return 0;
}

/** Is anything painted within `slack` of a world point? A ray fan is not a
 *  raster scan — at the rim adjacent rays are about a cell apart, so coverage is
 *  asserted over a neighbourhood rather than cell-for-cell. */
function near(s: MarchSlice, x: number, y: number, slack: number, o = CLEAN): boolean {
  for (let k = 0; k < s.n; k++) {
    const cx = cellCentre(s.cells[k * 2], o.cellU);
    const cy = cellCentre(s.cells[k * 2 + 1], o.cellU);
    if (Math.abs(cx - x) <= slack && Math.abs(cy - y) <= slack) return true;
  }
  return false;
}

// --- 1. THE REPORTED DEFECT ------------------------------------------------------

/** A long thin ridge: 520u × 30u, lying east-west about the origin — the shape a
 *  cycle-59 fractal island's arms and tails actually take, and the shape the
 *  retired near-face criterion was never written for. */
const RIDGE = { hw: 260, hh: 15, h: 255 };
const RIDGE_RASTER = rasterFrom(700, box(0, 0, RIDGE.hw, RIDGE.hh, RIDGE.h));
/** The observer OFF ITS FLANK — due south, so the ridge is presented side-on and
 *  its tips are lateral extremities rather than far-side points. The range is
 *  chosen to reproduce amendment 139's arithmetic exactly: at d = 420 and
 *  r ≈ 260 the tip scores m ≈ −0.62 against a 0.3 ramp. */
const FLANK: Vec2 = { x: 0, y: -420 };

/**
 * CYCLE 61's NEAR-FACE TERMINATOR, RE-IMPLEMENTED HERE AND ONLY HERE.
 *
 * The retired production filter (`faceShadow`, deleted with the bakes): for a
 * point P at radius rho from the island's BOUNDING-CIRCLE centre C, seen from
 * distance d, the terminator factor was `clamp01(1 + m/term)` with
 * `m = ((P−C)·û − |P−C|²/d) / r`. It is the exact near-face criterion for a DISC,
 * which is why it broke on a polygon that is not one. Rebuilding it here is what
 * makes the block below a REVERSAL guard rather than an assertion that happens to
 * pass.
 */
function retiredFaceShadow(p: Vec2, obs: Vec2, r: number, term = 0.3): number {
  const d = Math.hypot(obs.x, obs.y);
  const rho2 = p.x * p.x + p.y * p.y;
  const m = ((p.x * (obs.x / d) + p.y * (obs.y / d)) - rho2 / d) / Math.max(1, r);
  return Math.max(0, Math.min(1, 1 + m / term));
}

describe('THE REPORTED DEFECT: an elongated island paints end to end', () => {
  /** The ridge's bounding-circle radius — what the retired criterion divided by. */
  const R = Math.hypot(RIDGE.hw, RIDGE.hh);

  it('THE PREMISE: the retired near-face criterion really did suppress this '
    + 'ridge\'s tails, from this observer, regardless of facing', () => {
    // Dead ahead of the observer the criterion is happy...
    expect(retiredFaceShadow({ x: 0, y: -RIDGE.hh }, FLANK, R)).toBeGreaterThan(0.9);
    // ...but both lateral tips — side-on, NOT on the far side at all — score
    // amendment 139's ≈ −0.6 against the 0.3 ramp and clamp to ZERO.
    expect(retiredFaceShadow({ x: RIDGE.hw, y: 0 }, FLANK, R)).toBe(0);
    expect(retiredFaceShadow({ x: -RIDGE.hw, y: 0 }, FLANK, R)).toBe(0);
    // And the suppression is a straight-line CUT, not a fringe: it takes both
    // ends of the ridge whole, across its full width, near face included.
    let dead = 0;
    let total = 0;
    for (let x = -RIDGE.hw; x <= RIDGE.hw; x += 10) {
      for (let y = -RIDGE.hh; y <= RIDGE.hh; y += 5) {
        total++;
        if (retiredFaceShadow({ x, y }, FLANK, R) <= 0) dead++;
      }
    }
    expect(dead / total, 'a large fraction of the landmass, gone').toBeGreaterThan(0.25);
    // Contiguous end-caps, which is what reads as a diagonal cut on the water.
    const edge = Math.min(
      ...[-1, 1].map((s) => {
        let x = s * RIDGE.hw;
        while (retiredFaceShadow({ x, y: 0 }, FLANK, R) <= 0) x -= s * 5;
        return Math.abs(x);
      }),
    );
    expect(edge, 'everything past ~180u from the centre is cut').toBeLessThan(200);
  });

  it('THE FIX: the march paints its FULL extent — tails and lateral tips '
    + 'included, with no straight-line cut anywhere', () => {
    const s = marchAll(FLANK, terrainField(RIDGE_RASTER, FLANK));
    // Every 10u along the ridge, something is painted on it. A diagonal cut of
    // any kind fails this outright.
    for (let x = -RIDGE.hw + 8; x <= RIDGE.hw - 8; x += 10) {
      expect(near(s, x, 0, 8), `painted at x=${x}`).toBe(true);
    }
    // Including the two tips the retired criterion zeroed.
    expect(near(s, RIDGE.hw - 8, 0, 10), 'east tip').toBe(true);
    expect(near(s, -(RIDGE.hw - 8), 0, 10), 'west tip').toBe(true);
  });

  it('and the paint really spans the whole landmass, not a wedge of it', () => {
    const s = marchAll(FLANK, terrainField(RIDGE_RASTER, FLANK));
    const xs = cellsOf(s).map((c) => c.x);
    expect(Math.min(...xs)).toBeLessThan(-RIDGE.hw + RCELL);
    expect(Math.max(...xs)).toBeGreaterThan(RIDGE.hw - RCELL);
  });
});

// --- 2. SHIPS NEVER SHADOW SHIPS (amendment 107/141) ------------------------------
//
// RETIRED WITH STORY 4.11: the two TERRAIN cases that used to live here — "the
// FAR side of a landmass paints" and "an island BEHIND an island paints too" —
// asserted amendment 140's temporary no-occlusion regression by name. They are
// struck out rather than adapted, because an adapted version would go on pinning
// the shape of a rule that no longer exists. Their replacements are in section
// 2b, and they assert the opposite. The HULL case below is NOT struck out: only
// terrain ever occludes, at any range or aspect, and that is deliberate.

describe('ships never shadow ships', () => {
  it('a hull behind a hull paints (amendment 141)', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const hulls: EchoHull[] = [
      { id: 'near', x: 0, y: 150, heading: 0, cls: 'battleship' },
      { id: 'far', x: 0, y: 300, heading: 0, cls: 'battleship' },
    ];
    const stamp = buildShipStamp(hulls, CLEAN.model, CLEAN.cellU);
    const s = marchAll(obs, shipOnlyField(stamp, CLEAN.cellU));
    expect(near(s, 0, 150, 12), 'the near hull').toBe(true);
    expect(near(s, 0, 300, 12), 'the one directly behind it').toBe(true);
  });

  it('...and it stays true on a raster that DOES shadow terrain: two hulls in '
    + 'line over open water, with a real pyramid under them', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const sea = rasterWithPyramid(700, () => 0); // all water, real pyramid
    const hulls: EchoHull[] = [
      { id: 'near', x: 0, y: 150, heading: 0, cls: 'battleship' },
      { id: 'far', x: 0, y: 300, heading: 0, cls: 'battleship' },
    ];
    const field = buildField({
      obs,
      raster: sea,
      ships: buildShipStamp(hulls, CLEAN.model, CLEAN.cellU),
      ring: null,
      cellU: CLEAN.cellU,
      model: CLEAN.model,
    });
    const s = marchAll(obs, field);
    expect(near(s, 0, 150, 12), 'the near hull').toBe(true);
    expect(near(s, 0, 300, 12), 'the one directly behind it').toBe(true);
    expect([...s.nd].some((v) => v === 1), 'and nothing was marked no-data').toBe(false);
  });
});

// --- 2b. TERRAIN CASTS A SHADOW (Story 4.11, amendments 176-180) -----------------
//
// The block above is what this replaces, and the two are exact opposites — which
// is the point. Everything here runs against a raster with a REAL PYRAMID,
// because that is what the shared walk requires and what production always has.
//
// EVERY BOUND IS STATED AT THE SHIPPED GRAIN (amendment 135). A shadowed return
// of pre-grain intensity `p` draws worst at `p × (1 + 0.45 × (1 − p/0.7))` and
// best at `p × (1 − 0.45 × (1 − p/0.7))`, and the band claims below are the ones
// that survive BOTH — a band proved at nominal is not proved.

describe('terrain casts a height-derived shadow', () => {
  const MAST = CONFIG.vision.radarMastQ;

  /** Every cell of a slice that carries a NO-DATA mark, as world centres. */
  function noDataCells(s: MarchSlice, o = CLEAN): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < s.n; k++) {
      if (s.nd[k] === 0) continue;
      out.push({ x: cellCentre(s.cells[k * 2], o.cellU), y: cellCentre(s.cells[k * 2 + 1], o.cellU) });
    }
    return out;
  }

  /** Is the cell containing a world point marked NO-DATA by this slice? */
  function noDataAt(s: MarchSlice, x: number, y: number, o = CLEAN): boolean {
    const gx = cellOf(x, o.cellU);
    const gy = cellOf(y, o.cellU);
    for (let k = 0; k < s.n; k++) {
      if (s.cells[k * 2] === gx && s.cells[k * 2 + 1] === gy) return s.nd[k] === 1;
    }
    return false;
  }

  /** A field carrying one hull over a chosen raster. */
  function hullOver(obs: Vec2, raster: HeightRaster, y: number): RadarField {
    return buildField({
      obs,
      raster,
      ships: buildShipStamp(
        [{ id: 'a', x: 0, y, heading: 0, cls: 'battleship' }],
        CFG.model,
        CFG.cellU,
      ),
      ring: null,
      cellU: CFG.cellU,
      model: CFG.model,
    });
  }

  it('OPEN WATER IS UNTOUCHED: a bearing with no land on it paints exactly what '
    + 'it painted before there was a shadow model at all', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const sea = rasterWithPyramid(700, () => 0);
    const shadowed = marchAll(obs, terrainField(sea, obs, CFG), CFG);
    // The same all-water world through a raster the walk refuses to march (no
    // pyramid ⇒ fail open), i.e. the pre-4.11 answer.
    const openWalk = marchAll(obs, terrainField(rasterFrom(700, () => 0), obs, CFG), CFG);
    expect(shadowed.n).toBe(openWalk.n);
    expect([...shadowed.w]).toEqual([...openWalk.w]);
    expect([...shadowed.nd].some((v) => v === 1), 'and nothing is no-data').toBe(false);
  });

  it('A BEACH COSTS ALMOST NOTHING (amendment 176): the worst reach terrain of '
    + 'height `h` can leave is `radarRange × √(1 − h/H)`, so the lowest land the '
    + 'generator can build blacks out only the last few units of the scope', () => {
    // `h = 1` is the floor the closure pass stamps, so this is the faintest land
    // that exists — 654.7u of a 660u scope survives it. That closed form is
    // amendment 114's pin doing its job (only ELEVATION buys cover), and it is
    // re-derived here from literals rather than read out of production: if a
    // mudflat ever starts eating real scope, the pin has been broken.
    const obs: Vec2 = { x: 0, y: 0 };
    const floorReach = RADAR * Math.sqrt(1 - 1 / MAST);
    expect(floorReach, 'a beach keeps essentially the whole scope').toBeGreaterThan(RADAR - 8);
    const raster = rasterWithPyramid(760, box(0, 200, 400, 7, 1));
    const s = marchAll(obs, terrainField(raster, obs, CFG), CFG);
    for (const c of noDataCells(s, CFG)) {
      expect(Math.hypot(c.x, c.y), 'nothing inside the worst-case reach goes dark')
        .toBeGreaterThan(floorReach - CFG.cellU);
    }
  });

  it('HARD COVER: terrain at or above the mast height goes dark IMMEDIATELY '
    + 'past its own near face, and stays dark to the rim', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const raster = rasterWithPyramid(760, box(0, 270, 60, 30, 255));
    expect(255, 'the fixture really is hard cover').toBeGreaterThanOrEqual(MAST);
    const s = marchAll(obs, terrainField(raster, obs, CFG), CFG);
    expect(near(s, 0, 256, 6, CFG), 'the near face still paints').toBe(true);
    // Everything on that bearing behind it: the island's own far half, and open
    // water past it all the way out to the terminus.
    for (const y of [300, 340, 420, 500, 600, 650]) {
      expect(noDataAt(s, 0, y, CFG), `no-data at y=${y}`).toBe(true);
      expect(at(s, 0, y, CFG), `and no return at y=${y}`).toBe(0);
    }
  });

  it('...and the NEAR FACE is at FULL strength — the accumulator is read BEFORE '
    + "the sample's own cell is folded, so an obstacle never shadows itself", () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const h = box(0, 270, 60, 30, 255);
    const lit = marchAll(obs, terrainField(rasterWithPyramid(760, h), obs, CFG), CFG);
    // The SAME heights with the walk failing open (no pyramid) — i.e. what the
    // near face reads with no shadow model at all. Reversing the query/fold pair
    // in `marchRay` makes this read 0 and the island vanish outright.
    const open = marchAll(obs, terrainField(rasterFrom(760, h), obs, CFG), CFG);
    const w = at(lit, 0, 256, CFG);
    expect(w, 'the near face paints').toBeGreaterThan(BANDS[2].at);
    expect(w, 'at exactly its unshadowed strength').toBeCloseTo(at(open, 0, 256, CFG), 12);
  });

  it('SOFT COVER: a half-mast obstacle FADES what is behind it through the '
    + 'bands — red → blue → green → gone — instead of cutting at a line', () => {
    // One raster row of half-mast terrain at ~200u, and a battleship broadside
    // at three ranges behind it. A HULL is the target rather than more terrain
    // because only LAND folds into the accumulator, so the mark cannot shadow
    // its own far cells and every cell of it reads one shadow depth.
    const obs: Vec2 = { x: 0, y: 0 };
    const cover = box(0, 200, 400, 7, MAST / 2);
    const sea = rasterWithPyramid(760, () => 0);
    const covered = rasterWithPyramid(760, cover);
    const read = (y: number, raster: HeightRaster): number[] => {
      const s = marchAll(obs, hullOver(obs, raster, y), CFG);
      // The hull's own cells and nothing else — a radial window would sweep in
      // the obstacle strip itself, which is terrain and reads its own band.
      return cellsOf(s, CFG)
        .filter((c) => Math.abs(c.x) < 70 && Math.abs(c.y - y) < 30)
        .map((c) => c.w);
    };

    const bandsOf = (ws: number[]): Set<number> => new Set(ws.map((w) => bandIndex(w, BANDS)));
    expect(bandsOf(read(250, sea)), 'unshadowed at 250u: RED').toEqual(new Set([2]));
    expect(bandsOf(read(400, sea)), 'unshadowed at 400u: RED').toEqual(new Set([2]));

    // ...and behind the obstacle the SAME hull walks down the scale. Both claims
    // hold at the worst AND the best draw of the shipped envelope, so these are
    // statements about every cell of the mark rather than about a lucky one.
    const dim250 = read(250, covered);
    const dim400 = read(400, covered);
    expect(dim250.length, 'the shadowed hull still paints at 250u').toBeGreaterThan(10);
    expect(bandsOf(dim250), 'every cell BLUE — never red, never green').toEqual(new Set([1]));
    expect(dim400.length, 'and it still paints at 400u').toBeGreaterThan(10);
    expect(bandsOf(dim400), 'every cell GREEN').toEqual(new Set([0]));

    // Past the reach there is no return at all — and the cells are NO-DATA,
    // which is a different statement from "open water" and has to be.
    const s = marchAll(obs, hullOver(obs, covered, 520), CFG);
    expect(at(s, 0, 520, CFG), 'gone').toBe(0);
    expect(noDataAt(s, 0, 520, CFG), 'and reported as no-data, not as empty sea').toBe(true);
  });

  it('A FULLY SHADOWED SLICE IS STILL A SLICE: `freeze` must not answer null for '
    + 'one that holds only no-data cells, or the shadow silently vanishes', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    // A wall of hard cover starting almost on top of the observer, so the wedge
    // under test contains no return of any kind past its first cell.
    const raster = rasterWithPyramid(760, box(0, 400, 400, 280, 255));
    const field = buildField({
      obs,
      raster,
      ships: new Map(),
      ring: null,
      cellU: CFG.cellU,
      // Clutter and surf zeroed, so the near field cannot smuggle a return in.
      model: { ...CFG.model, clutter: 0, surf: 0 },
    });
    const s = marchSlice(obs, Math.PI / 2 - 0.02, Math.PI / 2 + 0.02, field, RADAR, 0, CFG);
    expect(s, 'the slice is enrolled').not.toBeNull();
    const nd = noDataCells(s!, CFG);
    expect(nd.length, 'and it is nearly all no-data').toBeGreaterThan(30);
    expect(Math.max(...nd.map((c) => c.y)), 'marked out to the terminus').toBeGreaterThan(600);
  });

  it('THE WIRE-ECHO PATH IS NEVER SHADOWED (amendment 127): a one-hull field '
    + 'carries no raster, so a resolved blip always paints', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const stamp = buildShipStamp(
      [{ id: 'a', x: 0, y: 600, heading: 0, cls: 'battleship' }],
      CFG.model,
      CFG.cellU,
    );
    const field = shipOnlyField(stamp, CFG.cellU);
    expect(field.raster, 'no terrain reaches this path').toBeNull();
    const s = marchAll(obs, field, CFG);
    expect(s.n, 'the echo painted').toBeGreaterThan(0);
    expect([...s.nd].some((v) => v === 1), 'and nothing was blacked out').toBe(false);
  });
});

// --- 3. CONTINUOUS HEIGHT (amendments 129 + 142) ----------------------------------

describe('terrain reflectivity is CONTINUOUS in height, never terraced', () => {
  const OBS: Vec2 = { x: 0, y: -300 };

  function readingAt(h: number): number {
    const raster = rasterFrom(400, box(0, 0, 60, 60, h));
    const s = marchAll(OBS, terrainField(raster, OBS));
    return at(s, 3, 3);
  }

  it('a STEEP headland reads red where a flat island of the SAME SIZE reads '
    + 'blue or green', () => {
    const steep = readingAt(255);
    const flat = readingAt(1);
    expect(bandIndex(steep, BANDS), 'steep is red').toBe(2);
    expect(bandIndex(flat, BANDS), 'flat is not').toBeLessThan(2);
    expect(flat, 'and it still paints — land is land').toBeGreaterThan(BANDS[0].at);
  });

  it('and every level between them is distinct — 256 readings, not 4', () => {
    const seen = new Set<number>();
    for (const h of [1, 12, 25, 38, 51, 64, 77, 89]) seen.add(Math.round(readingAt(h) * 1e6));
    expect(seen.size, 'each height gives its own intensity').toBe(8);
  });

  it('intensity is STRICTLY MONOTONE in height up to `refHeight`, and saturates '
    + 'above it', () => {
    let prev = -1;
    for (const h of [1, 20, 45, 70, CFG.model.refHeight]) {
      const w = readingAt(h);
      expect(w, `height ${h} is stronger than the level below it`).toBeGreaterThan(prev);
      prev = w;
    }
    // Past `refHeight` terrain is already at `landSteep`, by design: the
    // coefficient is a lerp CLAMPED at both ends, so a 200m ridge and a 900m one
    // are the same material — the gradient lives below the reference, where the
    // generator actually puts most of its land.
    expect(readingAt(140)).toBeCloseTo(prev, 10);
    expect(readingAt(255)).toBeCloseTo(prev, 10);
  });

  it('a graded island paints its band boundaries ALONG the height contours: at '
    + 'one range, a taller cell is never in a weaker band', () => {
    // A dome — height falls with distance from the island's own centre, so an
    // iso-height line is a circle about it — read through a THIN RANGE ANNULUS,
    // which is what isolates the height channel from the range one.
    const raster = rasterFrom(700, (x, y) => {
      const d = Math.hypot(x, y);
      return d > 140 ? 0 : Math.round(CFG.model.refHeight * (1 - d / 140));
    });
    const obs: Vec2 = { x: 0, y: -500 };
    const s = marchAll(obs, terrainField(raster, obs));
    const lit = cellsOf(s)
      .map((c) => ({ ...c, d: Math.hypot(c.x - obs.x, c.y - obs.y), h: sampleHeight(raster, c.x, c.y) }))
      .filter((c) => c.h > 0 && Math.abs(c.d - 500) <= 6);
    expect(lit.length, 'the annulus crosses a real slab of the island').toBeGreaterThan(20);
    for (const a of lit) {
      for (const b of lit) {
        if (a.h <= b.h) continue;
        expect(a.b, `h=${a.h} must not read weaker than h=${b.h}`).toBeGreaterThanOrEqual(b.b);
      }
    }
  });

  it('and NOTHING but height and range decides a terrain cell — the intensity is '
    + 'exactly the model, with no fourth term', () => {
    // A UNIFORM slab, so the height channel is a constant and any discrepancy is
    // the range term or an extra factor that should not exist. (A graded island
    // cannot pin this cell-for-cell: heat cells are 6u and raster samples 14u, so
    // a cell's centre and the sample that priced it can legitimately read
    // different heights — which is the previous test's business, not this one's.)
    const raster = rasterFrom(600, box(0, 0, 80, 80, 60));
    const obs: Vec2 = { x: 0, y: -400 };
    const s = marchAll(obs, terrainField(raster, obs));
    const m = CLEAN.model;
    let checked = 0;
    for (const c of cellsOf(s)) {
      if (sampleHeight(raster, c.x, c.y) <= 0) continue;
      const d = Math.hypot(c.x - obs.x, c.y - obs.y);
      const want = heightReflectivity(60, m) * attenuation(d, m.surfaceRef, SURFACE, m.floor);
      // The march prices a cell at the SAMPLE's distance, not at its centre's, so
      // the range term is good to a step and no better.
      expect(c.w).toBeCloseTo(want, 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

// --- 4. THE SNR GRAIN (amendment 143) ---------------------------------------------

describe('the grain reports MARGINALITY: solid cores, crawling fringes', () => {
  it('amplitude is largest at the detection floor and zero at saturation', () => {
    const env = CFG.noise;
    expect(noiseAmplitude(0, env)).toBeCloseTo(env.amount, 10);
    expect(noiseAmplitude(BANDS[0].at, env)).toBeGreaterThan(0.3);
    expect(noiseAmplitude(env.solidAt, env)).toBe(0);
    expect(noiseAmplitude(1, env), 'past saturation stays solid').toBe(0);
    // ...and it is monotone decreasing in between, so "grainier" always means
    // "weaker" and never the other way round.
    let prev = Infinity;
    for (let i = 0; i <= env.solidAt; i += 0.05) {
      const a = noiseAmplitude(i, env);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('a SATURATED island interior is byte-identical with the grain on and off — '
    + 'the one place a real scope is rock steady', () => {
    const raster = rasterFrom(400, box(0, 0, 80, 80, 255));
    const obs: Vec2 = { x: 0, y: -260 };
    const solid = marchAll(obs, terrainField(raster, obs), CFG);
    const clean = marchAll(obs, terrainField(raster, obs), CLEAN);
    for (const p of [{ x: 3, y: 3 }, { x: -33, y: 15 }, { x: 27, y: -45 }]) {
      const w = at(solid, p.x, p.y, CFG);
      expect(w, `interior at ${p.x},${p.y} paints`).toBeGreaterThan(0);
      expect(w, 'and the grain moved it not at all').toBeCloseTo(at(clean, p.x, p.y, CLEAN), 10);
    }
  });

  it('a WEAK return is genuinely speckled — the same field paints a different '
    + 'set of cells with the grain on', () => {
    // Sea clutter, which is tuned to straddle the transparency threshold.
    const obs: Vec2 = { x: 0, y: 0 };
    const field = (o: HeatmapOpts): RadarField =>
      buildField({ obs, raster: null, ships: new Map(), ring: null, cellU: o.cellU, model: o.model });
    const grainy = marchAll(obs, field(CFG), CFG);
    const flat = marchSlice(obs, 0, TAU - 1e-6, field(CLEAN), RADAR, 0, CLEAN);
    expect(flat, 'with no grain the haze sits UNDER the threshold and paints nothing')
      .toBeNull();
    const litG = cellsOf(grainy, CFG).filter((c) => c.b >= 0).length;
    // Re-derived at the cycle-63 9u lattice: the haze disc holds ~2.25× fewer
    // cells than at 6u, so the absolute speckle count drops with it (measured
    // 14 at the shipped straddle; the lit FRACTION is unchanged).
    expect(litG, 'with the shipped grain a fraction of the cells light')
      .toBeGreaterThan(8);
  });
});

// --- 5. HULLS (amendment 141) ------------------------------------------------------

describe('a hull falls out of its own footprint, under POINT falloff', () => {
  const OBS: Vec2 = { x: 0, y: 0 };

  /** Extent of the painted region across the observer's bearing, for one hull. */
  function beamWidth(heading: number): number {
    const hull: EchoHull = { id: 'a', x: 0, y: 300, heading, cls: 'battleship' };
    const stamp = buildShipStamp([hull], CLEAN.model, CLEAN.cellU);
    const s = marchAll(OBS, shipOnlyField(stamp, CLEAN.cellU));
    const xs = cellsOf(s).map((c) => c.x);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('a BROADSIDE hull paints broader than a bow-on one', () => {
    const broadside = beamWidth(0); // heading +x, observer looking +y
    const bowOn = beamWidth(Math.PI / 2); // heading +y, pointing at the observer
    expect(broadside, 'broadside spans most of the hull length').toBeGreaterThan(90);
    // Bow-on shows the 32u beam plus the fuzz smear (dilation + a stretch
    // draw, up to 2 cells per side — amendments 156-157): blunter than the
    // pre-fuzz needle, still under 32 + 4×9 = 68u.
    expect(bowOn, 'bow-on is a smeared needle').toBeLessThan(70);
    expect(broadside, 'aspect still reads through the fuzz').toBeGreaterThan(bowOn * 1.8);
  });

  it('and it is the SHARED silhouette that decides the footprint, not a kernel', () => {
    const hull: EchoHull = { id: 'a', x: 0, y: 300, heading: 0, cls: 'battleship' };
    const stamp = buildShipStamp([hull], CLEAN.model, CLEAN.cellU);
    const poly = transformPolygon(hullSilhouette('battleship'), hull.x, hull.y, 0, []);
    const maxX = Math.max(...poly.map((p) => p.x));
    const s = marchAll(OBS, shipOnlyField(stamp, CLEAN.cellU));
    const xs = cellsOf(s).map((c) => c.x);
    // The fuzz halo may extend up to 2 cells beyond the hull edge (plus the
    // half-cell centre offset) — never further: the mask stays the hull's,
    // smeared, not a kernel's.
    expect(Math.max(...xs), 'nothing painted past the fuzz halo').toBeLessThanOrEqual(maxX + 3 * CLEAN.cellU);
  });

  it('the same hull reads STRONGER close than far — the point curve still '
    + 'carries strength', () => {
    const read = (dist: number): number => {
      const hull: EchoHull = { id: 'a', x: 0, y: dist, heading: 0, cls: 'battleship' };
      const stamp = buildShipStamp([hull], CLEAN.model, CLEAN.cellU);
      const s = marchAll(OBS, shipOnlyField(stamp, CLEAN.cellU));
      return Math.max(...cellsOf(s).map((c) => c.w));
    };
    expect(read(120)).toBeGreaterThan(read(600));
  });

  it('NOTHING INSIDE RADAR RANGE PAINTS NOTHING (amendment 127): a needle at the '
    + 'rim still lights a cell', () => {
    const stamp: ShipStamp = new Map();
    // The smallest wire footprint the server can send: one covered cell (the
    // centre-cell fail-safe) — a sub-cell bow-on needle at the rim.
    const needle: HullCoverage = {
      gx: Math.floor(0 / CFG.cellU), gy: Math.floor((RADAR - 20) / CFG.cellU), w: 1, h: 1, bits: [1],
    };
    stampCoverage(stamp, needle, CFG.model);
    const s = marchSlice(
      { x: 0, y: 0 }, -0.2, 0.2 + Math.PI, shipOnlyField(stamp, CFG.cellU), RADAR, 0, CFG,
    );
    expect(s, 'the rim echo painted').not.toBeNull();
    const peak = Math.max(...cellsOf(s!, CFG).map((c) => c.w));
    expect(peak, 'at least the minPeak floor, grain and all').toBeGreaterThan(BANDS[0].at);
  });

  it('an UNKNOWN hull id degrades to its centre cell and never throws', () => {
    // The shared rasterizer's fail-soft: no silhouette to project means the
    // 1-cell fail-safe footprint (a return always lights the cell it is in),
    // never an exception on the ingest path. The fuzz then smears even that
    // speck (a real return is always beam-convolved), so the stamp holds the
    // centre cell plus at most its fuzz halo — bounded by the 5×5 the
    // dilation + stretch growth can reach, never a hull-sized ghost.
    const bad = [{ id: 'x', x: 0, y: 200, heading: 0, cls: 'notAHull' as never }];
    const stamp = buildShipStamp(bad, CLEAN.model, CLEAN.cellU);
    expect(stamp.size).toBeGreaterThanOrEqual(1);
    expect(stamp.size).toBeLessThanOrEqual(25);
    expect(stamp.has(cellKey(cellOf(0, CLEAN.cellU), cellOf(200, CLEAN.cellU))), 'the centre cell is lit').toBe(true);
  });
});

// --- 6. THE SWEEP GATE ------------------------------------------------------------

describe('the sweep is the only thing that paints', () => {
  const OBS: Vec2 = { x: 0, y: -300 };
  const RASTER = rasterFrom(400, box(0, 0, 60, 60, 255));

  it('a bearing the beam has not crossed is UNPAINTED', () => {
    const field = terrainField(RASTER, OBS);
    // The island sits due north of the observer, i.e. at bearing +pi/2.
    const away = marchSlice(OBS, Math.PI, Math.PI + 0.4, field, RADAR, 0, CLEAN);
    expect(away, 'a wedge pointing the other way paints nothing').toBeNull();
    const across = marchSlice(OBS, Math.PI / 2 - 0.2, Math.PI / 2 + 0.2, field, RADAR, 0, CLEAN);
    expect(across, 'the wedge that crosses it does').not.toBeNull();
  });

  it('a ZERO-WIDTH advance paints nothing (a stalled clock, or two renders in '
    + 'one millisecond)', () => {
    const field = terrainField(RASTER, OBS);
    expect(marchSlice(OBS, 1, 1, field, RADAR, 0, CLEAN)).toBeNull();
  });

  it('and slice cadence is ANGULAR, not per-frame: an arc owes the same number '
    + 'of slices however finely it is walked', () => {
    const o = CLEAN.march;
    const arc = 6 * o.sliceRad;
    expect(sliceCount(0, arc, o), 'walked in ONE advance').toBe(6);
    // Walked in forty tiny advances, driving the cursor exactly as the adapter
    // does: most steps are under a quantum and owe nothing, but the arc is never
    // LOST — it is still owed, because the cursor only ever moves by whole
    // quanta. Same arc, same slices, at any frame rate.
    let cursor = 0;
    let emitted = 0;
    for (let k = 1; k <= 40; k++) {
      const owed = sliceCount(cursor, (k * arc) / 40, o);
      emitted += owed;
      cursor = wrapPositive(cursor + owed * o.sliceRad);
    }
    expect(emitted, 'walked in forty').toBe(6);
  });

  it('the catch-up bound caps what one frame can emit', () => {
    const o = CLEAN.march;
    expect(sliceCount(0, TAU - 0.001, o)).toBe(Math.ceil(o.catchUpRad / o.sliceRad));
  });
});

// --- 6b. THE CATCH-UP PLAN (cycle-62 review gate) ---------------------------------
//
// The adapter used to own half of this rule and `sliceCount` the other half, and
// the two halves disagreed. `planMarch` is now the whole of it, and the three
// regimes below are the three ways it can be got wrong. The ADAPTER-level
// consequences — a scope that goes blank on a slow client, and arc dropped on a
// recurring cadence — are pinned where they actually live, in
// radarViewport.test.ts: the bug was invisible to this file's predecessor
// precisely because the clamp tested here was never the thing that broke.

describe('the frame march plan (catch-up)', () => {
  const O = CLEAN.march;

  it('THE CAP AND THE RESET ARE THE SAME ARC, and it covers the whole ruled '
    + 'bound — so nothing inside `catchUpRad` can be advanced past unpainted', () => {
    const arc = catchUpArc(O);
    expect(arc, 'a whole number of quanta').toBeCloseTo(Math.round(arc / O.sliceRad) * O.sliceRad, 12);
    expect(arc, 'and it reaches the ruled bound rather than falling short of it')
      .toBeGreaterThanOrEqual(O.catchUpRad);
    expect(arc, 'by less than one quantum').toBeLessThan(O.catchUpRad + O.sliceRad);
    // The emission cap agrees with it exactly, at any advance.
    expect(sliceCount(0, arc, O)).toBe(Math.round(arc / O.sliceRad));
    expect(sliceCount(0, arc + 1, O)).toBe(Math.round(arc / O.sliceRad));
  });

  it('A NORMAL ADVANCE keeps the cursor and carries its remainder', () => {
    const plan = planMarch(1, 1 + 3.5 * O.sliceRad, O);
    expect(plan.from, 'the cursor is untouched').toBe(1);
    expect(plan.owed).toBe(3); // the half-quantum is still owed, not lost
  });

  it('A LATE FRAME resumes one catch-up arc BEHIND the beam, never AT it — the '
    + 'defect that blanked the scope on a slow client', () => {
    const rot = 2;
    const arc = catchUpArc(O);
    const plan = planMarch(wrapPositive(rot - 1.5), rot, O); // 1.5 rad in one frame
    expect(plan.from, 'not the live beam').not.toBeCloseTo(rot, 6);
    expect(wrapPositive(rot - plan.from), 'exactly the arc it may paint').toBeCloseTo(arc, 9);
    expect(plan.owed, 'and it really emits it').toBe(Math.round(arc / O.sliceRad));
  });

  it('...at EVERY advance past the bound, however extreme — a stalled tab still '
    + 'paints its trailing wedge', () => {
    for (const adv of [0.41, 1, 3, 5, 40, 4000]) {
      const plan = planMarch(0, wrapPositive(adv), O);
      expect(plan.owed, `advance ${adv} rad`).toBe(Math.round(catchUpArc(O) / O.sliceRad));
    }
  });

  it('A NON-POSITIVE ADVANCE re-anchors and emits NOTHING — a clock correction '
    + 'must not re-march arc the beam already swept', () => {
    for (const back of [1e-6, 0.01, 0.2]) {
      const plan = planMarch(1, wrapPositive(1 - back), O);
      expect(plan.owed, `beam ${back} rad behind the cursor`).toBe(0);
      expect(plan.from, 'and it re-anchors on the live beam').toBeCloseTo(wrapPositive(1 - back), 9);
    }
    expect(planMarch(1, 1, O).owed, 'a stalled clock').toBe(0);
  });

  it('and a non-finite cursor or beam plans nothing rather than NaN', () => {
    for (const [from, rot] of [[Number.NaN, 1], [1, Number.NaN], [Infinity, 1]]) {
      expect(planMarch(from, rot, O).owed).toBe(0);
    }
  });

  it('THE RUNAWAY BACKSTOP: a degenerate `sliceRad` cannot ask for an unbounded '
    + 'number of marches in one frame', () => {
    const tiny = { ...O, sliceRad: 1e-9 };
    expect(catchUpArc(tiny) / tiny.sliceRad).toBe(MAX_SLICES_PER_FRAME);
    expect(sliceCount(0, Math.PI, tiny)).toBe(MAX_SLICES_PER_FRAME);
    // (Through the plan the cursor arithmetic loses a few ulps at this absurd
    // quantum, so the assertion is the BOUND — which is the whole contract.)
    expect(planMarch(0, Math.PI, tiny).owed).toBeLessThanOrEqual(MAX_SLICES_PER_FRAME);
    expect(planMarch(0, Math.PI, tiny).owed).toBeGreaterThan(0);
    // ...and a non-finite or zero one plans nothing at all.
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      expect(sliceCount(0, 1, { ...O, sliceRad: bad }), `sliceRad ${bad}`).toBe(0);
      expect(planMarch(0, 1, { ...O, sliceRad: bad }).owed, `sliceRad ${bad}`).toBe(0);
    }
    for (const bad of [Number.NaN, Infinity]) {
      expect(catchUpArc({ ...O, catchUpRad: bad }), `catchUpRad ${bad}`).toBe(0);
    }
  });
});

// --- 7. RESOLUTION ------------------------------------------------------------------

describe('ray spacing is derived from the radar range', () => {
  it('adjacent rays land about one cell apart AT THE TERMINUS, at any range', () => {
    for (const range of [330, 660, 1327]) {
      const spacing = rayStep(range, CFG.march) * range;
      expect(spacing, `arc between rays at ${range}u`)
        .toBeLessThanOrEqual(CFG.march.raySpacingU + 1e-9);
    }
  });

  it('a BOON-SCALED scope fires more rays rather than opening gaps at its rim', () => {
    expect(rayStep(1327, CFG.march)).toBeLessThan(rayStep(660, CFG.march));
  });

  it('and the derived angle is bounded at both ends', () => {
    expect(rayStep(1e9, CFG.march)).toBe(CFG.march.minRayRad);
    expect(rayStep(1, CFG.march)).toBe(CFG.march.maxRayRad);
    expect(rayStep(0, CFG.march)).toBe(CFG.march.maxRayRad);
  });
});

// --- 8. A SLICE IS A FROZEN RECORD (amendment 83) -----------------------------------

describe('a slice freezes its observer and its samples at creation', () => {
  const OBS: Vec2 = { x: 100, y: -400 };
  const RASTER = rasterFrom(700, box(0, 0, 80, 80, 200));

  it('marching the same arc twice gives byte-identical cells', () => {
    const a = marchAll(OBS, terrainField(RASTER, OBS), CFG);
    const b = marchAll(OBS, terrainField(RASTER, OBS), CFG);
    expect(a.n).toBe(b.n);
    expect([...a.cells]).toEqual([...b.cells]);
    expect([...a.w]).toEqual([...b.w]);
  });

  it('and MOVING the observer afterwards cannot touch it — the record holds no '
    + 'reference to anything live', () => {
    const s = marchAll(OBS, terrainField(RASTER, OBS), CFG);
    const before = [...s.w];
    // A later frame's field, from a different observer, over the same world.
    const later: Vec2 = { x: -500, y: 500 };
    marchAll(later, terrainField(RASTER, later), CFG);
    expect([...s.w], 'the earlier slice is untouched').toEqual(before);
  });

  it('the same observer at a different TIME paints the same cells — the grain is '
    + 'a property of the PLACE, so stacked revolutions are idempotent', () => {
    const a = marchAll(OBS, terrainField(RASTER, OBS), CFG);
    const b = marchSlice(OBS, 0, TAU - 1e-6, terrainField(RASTER, OBS), RADAR, 99_000, CFG);
    expect(b).not.toBeNull();
    expect([...b!.w]).toEqual([...a.w]);
  });

  it('its bounding box really contains every cell it holds', () => {
    const s = marchAll(OBS, terrainField(RASTER, OBS), CFG);
    for (const c of cellsOf(s, CFG)) {
      expect(c.x).toBeGreaterThanOrEqual(s.minX);
      expect(c.x).toBeLessThanOrEqual(s.maxX);
      expect(c.y).toBeGreaterThanOrEqual(s.minY);
      expect(c.y).toBeLessThanOrEqual(s.maxY);
    }
  });
});

// --- 9. DEGENERATE INPUTS ------------------------------------------------------------

describe('no NaN may ever reach a cell write', () => {
  const RASTER = rasterFrom(400, box(0, 0, 60, 60, 255));

  it('a non-finite observer, range or arc paints nothing rather than garbage', () => {
    const obs: Vec2 = { x: 0, y: -300 };
    const field = terrainField(RASTER, obs);
    const bad: [Vec2, number, number, number][] = [
      [{ x: Number.NaN, y: 0 }, 0, 1, RADAR],
      [{ x: 0, y: Number.POSITIVE_INFINITY }, 0, 1, RADAR],
      [obs, 0, 1, Number.NaN],
      [obs, 0, 1, 0],
      [obs, Number.NaN, 1, RADAR],
      [obs, 1, 1, RADAR],
    ];
    for (const [o, from, to, range] of bad) {
      expect(marchSlice(o, from, to, field, range, 0, CLEAN)).toBeNull();
    }
  });

  it('a march with NO raster and no sources at all paints nothing', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const empty = buildField({
      obs,
      raster: null,
      ships: new Map(),
      ring: null,
      cellU: CLEAN.cellU,
      // A model with the clutter coefficient zeroed, so the ocean is truly empty.
      model: { ...CLEAN.model, clutter: 0 },
    });
    expect(marchSlice(obs, 0, TAU - 1e-6, empty, RADAR, 0, CLEAN)).toBeNull();
  });

  it('a NON-FINITE storm ring bakes nothing rather than hanging or NaN-ing', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    for (const ring of [
      { cx: Number.NaN, cy: 0, r: 300 },
      { cx: 0, cy: 0, r: Number.POSITIVE_INFINITY },
      { cx: 0, cy: 0, r: 0 },
    ]) {
      const field = buildField({
        obs,
        raster: null,
        ships: new Map(),
        ring,
        cellU: CLEAN.cellU,
        model: { ...CLEAN.model, clutter: 0 },
      });
      expect(marchSlice(obs, 0, TAU - 1e-6, field, RADAR, 0, CLEAN)).toBeNull();
    }
  });

  it('a NON-FINITE loop bound answers null instead of hanging the tab — the '
    + 'guards are on FINITENESS, not merely on sign', () => {
    const obs: Vec2 = { x: 0, y: -300 };
    const field = terrainField(RASTER, obs);
    // `radarRange = Infinity` passes `> 0`, and `marchRay`'s `d <= toU` then
    // never terminates. This test would not fail — it would never return.
    expect(marchSlice(obs, 0, 1, field, Number.POSITIVE_INFINITY, 0, CLEAN)).toBeNull();
    for (const stepU of [Number.POSITIVE_INFINITY, Number.NaN, 0, -1]) {
      expect(marchSlice(obs, 0, 1, field, RADAR, 0, { ...CLEAN, march: { ...CLEAN.march, stepU } }),
        `stepU ${stepU}`).toBeNull();
    }
    for (const cellU of [Number.POSITIVE_INFINITY, Number.NaN, 0]) {
      expect(marchSlice(obs, 0, 1, field, RADAR, 0, { ...CLEAN, cellU }), `cellU ${cellU}`).toBeNull();
    }
    // A degenerate ray spacing would divide the arc into an unbounded fan.
    const noRays = { ...CLEAN.march, minRayRad: 0, maxRayRad: 0 };
    expect(marchSlice(obs, 0, 1, field, RADAR, 0, { ...CLEAN, march: noRays })).toBeNull();
  }, 5000);

  it('and every intensity a real march produces is a finite number in (0, 1]', () => {
    const obs: Vec2 = { x: 0, y: -300 };
    const field = buildField({
      obs,
      raster: RASTER,
      ships: buildShipStamp(
        [{ id: 'a', x: 40, y: -160, heading: 0.7, cls: 'mineLayer' }],
        CFG.model,
        CFG.cellU,
      ),
      ring: { cx: 0, cy: -300, r: 420 },
      cellU: CFG.cellU,
      model: CFG.model,
    });
    const s = marchAll(obs, field, CFG);
    for (let k = 0; k < s.n; k++) {
      expect(Number.isFinite(s.w[k])).toBe(true);
      expect(s.w[k]).toBeGreaterThan(0);
      expect(s.w[k]).toBeLessThanOrEqual(1);
    }
  });
});

// --- 10. THE CYCLE-62 REVIEW GATE: geometry that dropped paint ------------------
//
// Four defects that all had the same shape — a footprint or an arc that the
// pipeline computed correctly and then failed to PAINT, silently, for a subset of
// inputs. None of them could be seen from a test that only asked "does something
// paint"; each block below therefore establishes the case that used to be lost.

describe('an echo inside its own reach subtends a FULL TURN, and paints', () => {
  it('`echoArc` answers the whole circle when the observer is inside the extent', () => {
    const arc = echoArc({ x: 0, y: 0 }, 4, 0, 200);
    expect(arc.half, 'the whole circle').toBeCloseTo(Math.PI, 9);
    // `wrapPositive(2π)` folds to zero, so the arc `(centre − π, centre + π]` is a
    // full turn that a naive span computation reads as nothing at all.
    expect(wrapPositive(arc.centre + arc.half - (arc.centre - arc.half))).toBe(0);
  });

  it('and the march paints it rather than folding the span to zero', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    // A battleship footprint almost on top of the observer: its own reach
    // exceeds its distance, so its bearing window is the whole circle.
    const cov = rasterizeHullCoverage('battleship', 4, 0, 0.3, CLEAN.cellU);
    const stamp: ShipStamp = new Map();
    stampCoverage(stamp, cov, CLEAN.model);
    const c = coverageCentre(cov, CLEAN.cellU);
    const arc = echoArc(obs, c.x, c.y, Math.hypot(cov.w, cov.h) * CLEAN.cellU);
    expect(arc.half, 'the whole circle').toBeCloseTo(Math.PI, 9);
    const s = marchSlice(
      obs, arc.centre - arc.half, arc.centre + arc.half,
      shipOnlyField(stamp, CLEAN.cellU), RADAR, 0, CLEAN,
    );
    expect(s, 'an echo on top of the observer still paints').not.toBeNull();
    expect(s!.n).toBeGreaterThan(0);
  });
});

describe('a wire coverage footprint paints at EVERY heading (amendment 127 through the resolve path)', () => {
  it('a torpedo boat mask at 500u, marched over its own bearing window, lights at least one cell for 32 headings', () => {
    // The cycle-62 4-connectivity test pinned the retired `stampEcho` line
    // primitive; the wire footprint is now the true hull raster (2-D, with the
    // centre-cell fail-safe), so the guarantee to pin is the terminal one: the
    // resolve-path march — the same window/slab `marchEcho` computes — always
    // paints, whatever the hull's orientation relative to the bearing.
    const obs: Vec2 = { x: 0, y: 0 };
    for (let k = 0; k < 32; k++) {
      const heading = (k * TAU) / 32;
      const cov = rasterizeHullCoverage('torpedoBoat', 400, 300, heading, CLEAN.cellU);
      const stamp: ShipStamp = new Map();
      stampCoverage(stamp, cov, CLEAN.model);
      const c = coverageCentre(cov, CLEAN.cellU);
      const arc = echoArc(obs, c.x, c.y, Math.hypot(cov.w, cov.h) * CLEAN.cellU);
      const pad = arc.reach + 2 * CLEAN.cellU;
      const s = marchSlice(
        obs, arc.centre - arc.half, arc.centre + arc.half,
        shipOnlyField(stamp, CLEAN.cellU), Math.max(RADAR, arc.dist + pad), 0, CLEAN,
        { fromU: arc.dist - pad, toU: arc.dist + pad },
      );
      expect(s, `heading ${heading.toFixed(3)} painted`).not.toBeNull();
      expect(s!.n).toBeGreaterThan(0);
    }
  });
});

describe('the SOLID layers resolve by strength, not by rank', () => {
  const OBS: Vec2 = { x: 0, y: 0 };
  /** A hull aground on a mudflat: both layers claim the same cells. */
  const HULL: EchoHull = { id: 'a', x: 0, y: 400, heading: 0, cls: 'battleship' };

  it('A HULL AGAINST A COASTLINE IS NOT SUPPRESSED BY IT (amendment 127): the '
    + 'battleship out-reads the mudflat it is sitting on', () => {
    const raster = rasterFrom(700, box(0, 400, 90, 90, 1)); // a mudflat
    const field = buildField({
      obs: OBS,
      raster,
      ships: buildShipStamp([HULL], CLEAN.model, CLEAN.cellU),
      ring: null,
      cellU: CLEAN.cellU,
      model: CLEAN.model,
    });
    const withHull = at(marchAll(OBS, field), HULL.x, HULL.y);
    // The mudflat alone, at the same range — what the shipped terrain-first chain
    // returned for the hull's own cells.
    const land = at(marchAll(OBS, terrainField(raster, OBS)), HULL.x, HULL.y);
    expect(land, 'the mudflat does paint').toBeGreaterThan(0);
    expect(withHull, 'and the hull paints STRONGER than it').toBeGreaterThan(land + 1e-6);
  });

  it('and the stronger material wins in BOTH directions — a steep headland is '
    + 'not out-read by a needle sitting on it', () => {
    const raster = rasterFrom(700, box(0, 400, 90, 90, 255));
    const needle: ShipStamp = new Map();
    // A sub-cell echo: one covered cell — `minPeak`-floored, and genuinely
    // weaker than rock at 400u.
    stampCoverage(needle, {
      gx: Math.floor(HULL.x / CLEAN.cellU), gy: Math.floor(HULL.y / CLEAN.cellU), w: 1, h: 1, bits: [1],
    }, CLEAN.model);
    const field = buildField({
      obs: OBS, raster, ships: needle, ring: null, cellU: CLEAN.cellU, model: CLEAN.model,
    });
    const both = at(marchAll(OBS, field), HULL.x, HULL.y);
    const rock = at(marchAll(OBS, terrainField(raster, OBS)), HULL.x, HULL.y);
    expect(both, 'the headland keeps the cell').toBeCloseTo(rock, 9);
    expect(rock, 'and it is genuinely the stronger of the two')
      .toBeGreaterThan(CLEAN.model.minPeak);
  });

  it('two hulls sharing cells resolve max-wins PER CELL, whatever order they arrive in', () => {
    // RETIRES the clause that asserted "the battleship really is the stronger
    // echo". That was the aspect/size term inside a hull's REFLECTIVITY talking,
    // and cycle 67 deleted it: colour is MATERIAL and RANGE, so a battleship and
    // a torpedo boat are the same steel and read the same register (amendments
    // 171-175). Adapting the clause would have re-pinned the defect; it is
    // retired and the rule it was one example of is asserted instead.
    //
    // WHAT STILL HAS TO HOLD, and is the whole reason `putShip` exists: `Map.set`
    // is LAST-WINS, so iteration ORDER must never decide a shared cell's reading.
    // Every hull carrying one coefficient makes that a tie today rather than a
    // contest — so the pin is order-invariance plus "the shared reading is what
    // either hull alone would have written", which stays exactly as meaningful
    // the moment any hull-like material stops being plain steel.
    const strong: EchoHull = { id: 'big', x: 0, y: 300, heading: 0, cls: 'battleship' };
    const weak: EchoHull = { id: 'small', x: 2, y: 302, heading: 0, cls: 'torpedoBoat' };
    const a = buildShipStamp([strong, weak], CLEAN.model, CLEAN.cellU);
    const b = buildShipStamp([weak, strong], CLEAN.model, CLEAN.cellU);
    // Each hull's own coefficient, from its own single-hull stamp.
    const one = (h: EchoHull): number => {
      const m = buildShipStamp([h], CLEAN.model, CLEAN.cellU);
      return Math.max(...[...m.values()].map((s) => s.refl));
    };
    expect(one(strong), 'both hulls are the same steel').toBe(one(weak));
    expect(one(strong), 'and that steel is the material coefficient').toBe(CLEAN.model.ship);
    const shared = [...a.keys()].filter((k) => b.has(k));
    expect(shared.length, 'the two footprints really overlap').toBeGreaterThan(10);
    for (const k of shared) {
      expect(a.get(k)!.refl, 'order never changes a cell').toBeCloseTo(b.get(k)!.refl, 12);
      // Max-wins really ran: no shared cell reads weaker than BOTH single-hull
      // stamps say it should.
      const singleStrong = buildShipStamp([strong], CLEAN.model, CLEAN.cellU).get(k);
      const singleWeak = buildShipStamp([weak], CLEAN.model, CLEAN.cellU).get(k);
      const floor = Math.max(singleStrong?.refl ?? 0, singleWeak?.refl ?? 0);
      expect(a.get(k)!.refl).toBeCloseTo(floor, 12);
    }
  });
});

describe('the ray step is clamped to half a cell, whatever `cellU` is retuned to', () => {
  it('a ray never jumps two cells on either axis, even at cellU < stepU', () => {
    const o: HeatmapOpts = { ...CLEAN, cellU: 2 };
    const solid = rasterFrom(700, () => 255); // land everywhere: no gaps to confuse a jump
    const obs: Vec2 = { x: 0, y: 0 };
    // ONE ray (the arc is far under the derived ray spacing), so the slice's cell
    // order IS the march order along that bearing.
    const s = marchSlice(obs, 0.7, 0.7 + 1e-5, terrainField(solid, obs, o), 400, 0, o);
    expect(s, 'the ray painted').not.toBeNull();
    expect(s!.n, 'and walked a real distance').toBeGreaterThan(100);
    for (let k = 1; k < s!.n; k++) {
      const dx = Math.abs(s!.cells[k * 2] - s!.cells[(k - 1) * 2]);
      const dy = Math.abs(s!.cells[k * 2 + 1] - s!.cells[(k - 1) * 2 + 1]);
      expect(Math.max(dx, dy), `step ${k} skipped a cell`).toBeLessThanOrEqual(1);
    }
  });
});
