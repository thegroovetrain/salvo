// THE ARC BENCH (Story 11.3, R5 + R6) — the model: the targets, their paints
// through the REAL pipeline (rasterize → smearArc → fuzzCoverage at the
// shipped CONFIG.vision.radarFuzz), the plain-number readouts and the three
// far-cell candidates. Pure over the page state; no DOM.

import {
  CONFIG,
  SHIP_CLASS_IDS,
  coverageCellCount,
  coverageHas,
  fuzzCoverage,
  hmToU,
  hullSilhouette,
  paintSeed,
  rasterizeDiscCoverage,
  rasterizeHullCoverage,
  rasterizeSegmentCoverage,
  segmentPaintSeed,
  shipWakeWidthU,
  smearArc,
  transformPolygon,
  type GameMap,
  type HullCoverage,
  type ShipClassId,
  type Vec2,
} from '@salvo/shared';

export type Candidate = 'A' | 'B' | 'C';

export interface BenchState {
  seed: number;
  /** Beam width, degrees (R1 default: CONFIG.vision.beamDeg). */
  beamDeg: number;
  /** Pulse term, hm (R3 default: CONFIG.vision.pulseHm). */
  pulseHm: number;
  fuzz: boolean;
  /** Paint clock: re-rolling bumps it, so the fuzz draws fresh. */
  roll: number;
  candidate: Candidate;
}

export function defaultState(seed: number): BenchState {
  return { seed, beamDeg: CONFIG.vision.beamDeg, pulseHm: CONFIG.vision.pulseHm, fuzz: true, roll: 1, candidate: 'A' };
}

export const CELL_U = CONFIG.vision.radarCellU;
export const RANGES_HM = [50, 100, 200, 300, 400];
/** One lane (bearing off the observer's look direction, degrees) per hull. */
const LANES_DEG = [-12, -4, 4, 12];
const WAKE_HOST = { hull: 3, range: 3 }; // the Iowa at 300 hm leaves the wake
const CRATE_HM = 350;

export interface Paint {
  key: string;
  label: string;
  /** True target centre (hull centre, segment midpoint, crate centre). */
  at: Vec2;
  rangeU: number;
  /** What the true target looks like, for the thin white outline. */
  shape: { kind: 'poly'; poly: Vec2[] } | { kind: 'disc'; r: number } | { kind: 'seg'; a: Vec2; b: Vec2; widthU: number };
  sharp: HullCoverage;
  mask: HullCoverage;
}

/** The observer: near the west rim, looking east across the board. */
export function observer(map: GameMap): Vec2 {
  return { x: -0.86 * map.radius, y: 0 };
}

function polar(o: Vec2, hm: number, deg: number): Vec2 {
  const t = (deg * Math.PI) / 180;
  return { x: o.x + hmToU(hm) * Math.cos(t), y: o.y + hmToU(hm) * Math.sin(t) };
}

/** smearArc → fuzz (when on): the arc law, then today's fuzz, unchanged. */
function finish(s: BenchState, sharp: HullCoverage, o: Vec2, seed: number): HullCoverage {
  const arc = smearArc(sharp, o.x, o.y, CELL_U, (s.beamDeg * Math.PI) / 180, hmToU(s.pulseHm));
  return s.fuzz ? fuzzCoverage(arc, seed, CONFIG.vision.radarFuzz) : arc;
}

function hullPaint(s: BenchState, o: Vec2, cls: ShipClassId, lane: number, j: number, sideOn = (lane + j) % 2 === 0): Paint {
  const at = polar(o, RANGES_HM[j], LANES_DEG[lane]);
  const brg = Math.atan2(at.y - o.y, at.x - o.x);
  const heading = sideOn ? brg + Math.PI / 2 : brg;
  const sharp = rasterizeHullCoverage(cls, at.x, at.y, heading, CELL_U);
  return {
    key: `${cls}-${RANGES_HM[j]}-${sideOn ? 'side' : 'end'}`,
    label: `${cls[0].toUpperCase()}${cls.slice(1)} at ${RANGES_HM[j]} hm, ${sideOn ? 'side-on' : 'end-on'}`,
    at,
    rangeU: hmToU(RANGES_HM[j]),
    shape: { kind: 'poly', poly: transformPolygon(hullSilhouette(cls), at.x, at.y, heading) },
    sharp,
    mask: finish(s, sharp, o, paintSeed(s.roll, at.x, at.y, heading)),
  };
}

/** One real wake segment (CONFIG.vision.wakeSampleU long, the hull's own
 *  beam wide) right astern of the host hull, which is running away end-on. */
function wakePaint(s: BenchState, o: Vec2): Paint {
  const cls = SHIP_CLASS_IDS[WAKE_HOST.hull];
  const at = polar(o, RANGES_HM[WAKE_HOST.range], LANES_DEG[WAKE_HOST.hull]);
  const brg = Math.atan2(at.y - o.y, at.x - o.x);
  const sternU = -Math.min(...hullSilhouette(cls).map((p) => p.x));
  const ux = Math.cos(brg);
  const uy = Math.sin(brg);
  const a = { x: at.x - ux * sternU, y: at.y - uy * sternU };
  const b = { x: a.x - ux * CONFIG.vision.wakeSampleU, y: a.y - uy * CONFIG.vision.wakeSampleU };
  const widthU = shipWakeWidthU(cls);
  const sharp = rasterizeSegmentCoverage(a.x, a.y, b.x, b.y, widthU, CELL_U);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    key: 'wake',
    label: `One wake segment behind the ${cls[0].toUpperCase()}${cls.slice(1)} (${RANGES_HM[WAKE_HOST.range]} hm)`,
    at: mid,
    rangeU: Math.hypot(mid.x - o.x, mid.y - o.y),
    shape: { kind: 'seg', a, b, widthU },
    sharp,
    mask: finish(s, sharp, o, segmentPaintSeed(s.roll, a.x, a.y, b.x, b.y)),
  };
}

function cratePaint(s: BenchState, o: Vec2): Paint {
  const at = polar(o, CRATE_HM, 0);
  const r = CONFIG.drops.radiusU;
  const sharp = rasterizeDiscCoverage(at.x, at.y, r, CELL_U);
  return {
    key: 'crate',
    label: `Airdrop crate at ${CRATE_HM} hm`,
    at,
    rangeU: hmToU(CRATE_HM),
    shape: { kind: 'disc', r },
    sharp,
    mask: finish(s, sharp, o, paintSeed(s.roll, at.x, at.y, 0)),
  };
}

/** Every paint on the page: 4 hulls × 5 ranges, then the wake, then the crate. */
export function paintAll(s: BenchState, map: GameMap): Paint[] {
  const o = observer(map);
  const out: Paint[] = [];
  SHIP_CLASS_IDS.forEach((cls, lane) => RANGES_HM.forEach((_, j) => out.push(hullPaint(s, o, cls, lane, j))));
  out.push(wakePaint(s, o), cratePaint(s, o));
  return out;
}

/** The far-cell candidate panels' paints: the Yamato at 400 hm side-on, at
 *  400 hm end-on (on its own lane, not on the chart) and at 200 hm. */
export function candidatePaints(s: BenchState, map: GameMap): Paint[] {
  const o = observer(map);
  const far = RANGES_HM.indexOf(400);
  const mid = RANGES_HM.indexOf(200);
  return [hullPaint(s, o, 'yamato', 0, far, true), hullPaint(s, o, 'yamato', 0, far, false), hullPaint(s, o, 'yamato', 0, mid, true)];
}

export interface Measure {
  rangeHm: number;
  /** Bearing span of the lit cell centres × range, plus one cell (u). */
  widthU: number;
  /** Range span of the lit cell centres, plus one cell (u). */
  depthU: number;
  cells: number;
}

/** The readouts for one paint, measured about the observer on the 9 u mask. */
export function measure(p: Paint, o: Vec2): Measure {
  const phi = Math.atan2(p.at.y - o.y, p.at.x - o.x);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  let tMin = Infinity;
  let tMax = -Infinity;
  let rMin = Infinity;
  let rMax = -Infinity;
  forEachLit(p.mask, (x, y) => {
    const dx = x - o.x;
    const dy = y - o.y;
    const t = Math.atan2(dy * c - dx * s, dx * c + dy * s);
    const r = Math.hypot(dx, dy);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
  });
  return { rangeHm: p.rangeU / hmToU(1), widthU: (tMax - tMin) * p.rangeU + CELL_U, depthU: rMax - rMin + CELL_U, cells: coverageCellCount(p.mask) };
}

/** Visit every lit cell's centre in world u. */
export function forEachLit(m: HullCoverage, fn: (x: number, y: number) => void): void {
  for (let row = 0; row < m.h; row++) {
    for (let col = 0; col < m.w; col++) {
      if (coverageHas(m, col, row)) fn((m.gx + col + 0.5) * CELL_U, (m.gy + row + 0.5) * CELL_U);
    }
  }
}

// ---------------------------------------------------------------------------
// THE FAR-CELL CANDIDATES (R6): how big a radar cell is DRAWN at a range. A
// coarse cell is k × 9 u (k a power of two, so it nests on the 9 u wire
// lattice) and lights when any 9 u cell inside it is lit.
// ---------------------------------------------------------------------------

export const CANDIDATES: Array<{ id: Candidate; title: string; line: string }> = [
  { id: 'A', title: 'A · Today', line: 'Every radar cell is 9 u at every range.' },
  { id: 'B', title: 'B · Two steps', line: '9 u cells inside 200 hm, 18 u cells beyond.' },
  { id: 'C', title: 'C · Three steps', line: '9 u cells to 130 hm, 18 u to 260 hm, 36 u beyond.' },
];

/** How many 9 u cells across one drawn cell is, for a paint at this range. */
export function cellFactor(cand: Candidate, rangeU: number): number {
  const hm = rangeU / hmToU(1);
  if (cand === 'B') return hm < 200 ? 1 : 2;
  if (cand === 'C') return hm < 130 ? 1 : hm < 260 ? 2 : 4;
  return 1;
}

/** The lit drawn cells: [x0, y0] world corners of each k × 9 u cell. */
export function coarseCells(m: HullCoverage, k: number): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  forEachLit(m, (x, y) => {
    const cx = Math.floor(Math.floor(x / CELL_U) / k);
    const cy = Math.floor(Math.floor(y / CELL_U) / k);
    const key = `${cx},${cy}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([cx * k * CELL_U, cy * k * CELL_U]);
  });
  return out;
}
