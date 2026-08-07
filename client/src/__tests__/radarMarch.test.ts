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
//   • NOTHING OCCLUDES ANYTHING (amendment 140). The far side of a landmass
//     paints, an island behind an island paints, and a hull behind a hull paints.
//     This is a knowing, temporary regression scoped to the paint layer; Story
//     4.11 restores occlusion as a height-derived shadow length along this same
//     ray. No server-side sensor gate is touched by any of it.
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
  hullSilhouette,
  sampleHeight,
  transformPolygon,
  wrapPositive,
  type HeightRaster,
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
  hullSample,
  shipOnlyField,
  stampEcho,
  type EchoHull,
  type RadarField,
  type ShipStamp,
} from '../render/radarField.js';
import { marchSlice, rayStep, sliceCount, type MarchSlice } from '../render/radarMarch.js';

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

// --- 2. NOTHING OCCLUDES ANYTHING (amendment 140) ---------------------------------

describe('nothing occludes anything this cycle', () => {
  it('the FAR side of a landmass paints — the island is no longer its own '
    + 'shadow', () => {
    const s = marchAll(FLANK, terrainField(RIDGE_RASTER, FLANK));
    expect(near(s, 0, -RIDGE.hh + 4, 8), 'near face').toBe(true);
    expect(near(s, 0, RIDGE.hh - 4, 8), 'FAR face').toBe(true);
  });

  it('an island BEHIND an island paints too', () => {
    const near1 = box(0, 200, 60, 60, 255);
    const far1 = box(0, 420, 60, 60, 255);
    const raster = rasterFrom(700, both(near1, far1));
    const obs: Vec2 = { x: 0, y: -200 };
    const s = marchAll(obs, terrainField(raster, obs));
    expect(near(s, 0, 200, 10), 'the near island').toBe(true);
    expect(near(s, 0, 420, 10), 'the one directly behind it').toBe(true);
  });

  it('a hull behind a hull paints (amendment 141: ships never shadow ships)', () => {
    const obs: Vec2 = { x: 0, y: 0 };
    const hulls: EchoHull[] = [
      { id: 'near', x: 0, y: 150, heading: 0, cls: 'battleship' },
      { id: 'far', x: 0, y: 300, heading: 0, cls: 'battleship' },
    ];
    const stamp = buildShipStamp(hulls, obs, CLEAN.model, CLEAN.cellU);
    const s = marchAll(obs, shipOnlyField(stamp, CLEAN.cellU));
    expect(near(s, 0, 150, 12), 'the near hull').toBe(true);
    expect(near(s, 0, 300, 12), 'the one directly behind it').toBe(true);
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
    expect(litG, 'with the shipped grain a fraction of the cells light')
      .toBeGreaterThan(20);
  });
});

// --- 5. HULLS (amendment 141) ------------------------------------------------------

describe('a hull falls out of its own footprint, under POINT falloff', () => {
  const OBS: Vec2 = { x: 0, y: 0 };

  /** Extent of the painted region across the observer's bearing, for one hull. */
  function beamWidth(heading: number): number {
    const hull: EchoHull = { id: 'a', x: 0, y: 300, heading, cls: 'battleship' };
    const stamp = buildShipStamp([hull], OBS, CLEAN.model, CLEAN.cellU);
    const s = marchAll(OBS, shipOnlyField(stamp, CLEAN.cellU));
    const xs = cellsOf(s).map((c) => c.x);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('a BROADSIDE hull paints broader than a bow-on one', () => {
    const broadside = beamWidth(0); // heading +x, observer looking +y
    const bowOn = beamWidth(Math.PI / 2); // heading +y, pointing at the observer
    expect(broadside, 'broadside spans most of the hull length').toBeGreaterThan(90);
    expect(bowOn, 'bow-on is a needle').toBeLessThan(45);
    expect(broadside).toBeGreaterThan(bowOn * 2);
  });

  it('and it is the SHARED silhouette that decides the footprint, not a kernel', () => {
    const hull: EchoHull = { id: 'a', x: 0, y: 300, heading: 0, cls: 'battleship' };
    const stamp = buildShipStamp([hull], OBS, CLEAN.model, CLEAN.cellU);
    const poly = transformPolygon(hullSilhouette('battleship'), hull.x, hull.y, 0, []);
    const maxX = Math.max(...poly.map((p) => p.x));
    const s = marchAll(OBS, shipOnlyField(stamp, CLEAN.cellU));
    const xs = cellsOf(s).map((c) => c.x);
    expect(Math.max(...xs), 'nothing painted past the real hull').toBeLessThanOrEqual(maxX + CLEAN.cellU);
  });

  it('the same hull reads STRONGER close than far — the point curve still '
    + 'carries strength', () => {
    const read = (dist: number): number => {
      const hull: EchoHull = { id: 'a', x: 0, y: dist, heading: 0, cls: 'battleship' };
      const stamp = buildShipStamp([hull], OBS, CLEAN.model, CLEAN.cellU);
      const s = marchAll(OBS, shipOnlyField(stamp, CLEAN.cellU));
      return Math.max(...cellsOf(s).map((c) => c.w));
    };
    expect(read(120)).toBeGreaterThan(read(600));
  });

  it('NOTHING INSIDE RADAR RANGE PAINTS NOTHING (amendment 127): a needle at the '
    + 'rim still lights a cell', () => {
    const stamp: ShipStamp = new Map();
    const ext = 8; // narrower than a cell, bow-on, at the rim
    stampEcho(stamp, 0, RADAR - 20, Math.PI / 2, ext, hullSample(ext, CFG.model), CFG.cellU);
    const s = marchSlice(
      { x: 0, y: 0 }, -0.2, 0.2 + Math.PI, shipOnlyField(stamp, CFG.cellU), RADAR, 0, CFG,
    );
    expect(s, 'the rim echo painted').not.toBeNull();
    const peak = Math.max(...cellsOf(s!, CFG).map((c) => c.w));
    expect(peak, 'at least the minPeak floor, grain and all').toBeGreaterThan(BANDS[0].at);
  });

  it('an UNKNOWN hull id paints nothing and never throws', () => {
    const bad = [{ id: 'x', x: 0, y: 200, heading: 0, cls: 'notAHull' as never }];
    const stamp = buildShipStamp(bad, OBS, CLEAN.model, CLEAN.cellU);
    expect(stamp.size).toBe(0);
    expect(marchSlice(OBS, 0, 1, shipOnlyField(stamp, CLEAN.cellU), RADAR, 0, CLEAN)).toBeNull();
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
    expect(sliceCount(0, TAU - 0.001, o)).toBe(Math.floor(o.catchUpRad / o.sliceRad));
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

  it('and every intensity a real march produces is a finite number in (0, 1]', () => {
    const obs: Vec2 = { x: 0, y: -300 };
    const field = buildField({
      obs,
      raster: RASTER,
      ships: buildShipStamp(
        [{ id: 'a', x: 40, y: -160, heading: 0.7, cls: 'mineLayer' }],
        obs,
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
