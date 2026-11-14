// STORM FIELD — the rain of the eye of the hurricane (PLAN.md §7, Eric
// 2026-11-14). Written in the shared/ posture so it can move to shared/sim
// nearly verbatim: PURE, DETERMINISTIC, plain objects, time is an argument,
// zero I/O, NO Math.sin/cos/exp/pow/random (rotation goes through
// `fogSinCos`; only + − × ÷, floor and sqrt).
//
// The field in plain words:
// • The storm's EYE is the LIVE zone ring (`zoneStateAt` on the match's rolled
//   rings): its center is the eye's center and moves with it (linearly during
//   each closing beat), its radius R sets every distance through ρ = r / R.
// • Noise is sampled in the EYE'S FRAME (point minus the live center), so the
//   clouds travel with the eye. There is no wind.
// • The clouds SPIN about the eye: linear speed is 0 at the center and
//   `edgeSpeedU` at the ring edge (turn rate inside = edge rate ×
//   (centerTurnFrac + (1 − centerTurnFrac) × ρ)); outside the ring the linear
//   speed holds at `edgeSpeedU` (turn rate edgeSpeedU / r — slower outward, the
//   shear that lays out trailing spiral bands). Direction: a per-match coin
//   flip from the seed.
// • BOUNDED SHEAR (the morph-reset trick fog.ts uses): two fbm layers
//   cross-fade on a triangle wave of period `morphMs`; each layer's whole twist
//   is measured from its last INVISIBLE instant (weight 0), so differential
//   rotation never winds the pattern up forever. At that invisible instant the
//   layer is laid down PRE-WOUND by a trailing spiral of `windRad` radians at
//   the ring edge (θ₀ = −windRad × 2ρ / (1 + ρ): the stretch r·dθ/dr peaks at
//   the ring edge and fades inward and outward), so spiral banding reads at
//   any spin speed; real shear then adds to it until the layer fades out.
//   Because a parcel keeps its eye-frame radius, the twist since reset is the
//   exact time integral of the turn rate at that radius over the live R(τ)
//   (piecewise: held beats in closed form, closing beats by a fixed midpoint
//   rule) — a smooth function of t, tabulated once per frame over radius.
// • DENSITY by ρ through a coverage → cut map: coverage is the share of area at
//   solid rain (density ≥ ½, fog.ts's amendment-178 semantics). 0 inside the
//   eye (ρ ≤ eyeFrac: a TRUE clear eye), thin → thick on a smoothstep to
//   the live edge coverage (`coverageEdgeByRing`, stepped by ring, linear through each closing beat) at the ring edge, then a smoothstep over `edgeSoftW` (in ρ)
//   to `coverageOutside` (heavy rain with gaps). The cut for a coverage comes
//   from the noise's value distribution, measured ONCE per seed (a quantile
//   table); the layer blend is variance-normalized so one table holds at every
//   morph phase. Density = clamp01((n − cut) / edgeBand). Zero beyond the map.

import {
  fbm,
  fogSinCos,
  makeLayer,
  mulberry32,
  zoneStateAt,
  type NoiseLayer,
  type ZoneRing,
  type ZoneTimeline,
} from '@salvo/shared';

export interface StormFieldConfig {
  wavelengthU: number; // u — noise base feature size
  octaves: number;
  gain: number;
  edgeBand: number; // noise units over which density ramps 0 → 1 above the cut
  morphMs: number; // ms — the two-layer cross-fade period (and the shear reset)
  edgeSpeedU: number; // u/s — cloud speed at the ring edge (held outside it)
  centerTurnFrac: number; // turn rate at the center as a fraction of the edge's (linear speed at the center is 0 regardless)
  windRad: number; // rad — trailing spiral pre-wind at the ring edge, laid down at each layer's invisible instant
  eyeFrac: number; // ρ — radius of the clear eye as a fraction of the live ring
  coverageEdgeByRing: number[]; // share at solid rain just inside the ring edge, per ring (index = group; held at the last entry past it)
  coverageOutside: number; // share at solid rain out in the storm
  edgeSoftW: number; // ρ — width of the ring-edge → outside coverage blend
  minRadiusU: number; // u — floor on R for the spin (the collapse drives R to 0)
}

export interface StormField {
  readonly layerA: NoiseLayer;
  readonly layerB: NoiseLayer;
  readonly spinSign: 1 | -1; // the per-match coin flip
  readonly rings: readonly ZoneRing[];
  readonly timeline: ZoneTimeline;
  readonly mapRadiusU: number; // rain only inside this disc about the origin
  readonly quant: Float64Array; // QUANT_N + 1 quantiles of the blended noise; [QUANT_N] = max + edgeBand (coverage 0 ⇒ no rain)
  readonly cfg: StormFieldConfig;
}

/** One instant of the field, precomputed once and shared by every sample at that instant. */
export interface StormFrame {
  tMs: number;
  cx: number; // u — the live ring (eye) center
  cy: number;
  R: number; // u — the live ring radius (0 once collapsed)
  edgeCov: number; // share at solid rain at the live ring edge (stepped by ring, linear through each closing beat)
  w: number; // layer B's cross-fade weight
  norm: number; // variance normalizer of the blend
  binU: number; // u per twist-table bin
  twistA: Float64Array; // rad — layer A's forward rotation at radius k × binU from the eye
  twistB: Float64Array;
}

const QUANT_N = 256;
const TWIST_BINS = 512;
const CLOSE_STEPS = 12; // midpoint steps per closing-beat segment of the twist integral
const LAYER_B_OFFSET_U = 1000;

/** The quantile table of fbm on `layer` (a lattice far from integer alignment). */
function quantiles(layer: NoiseLayer, cfg: StormFieldConfig): Float64Array {
  const side = 200;
  const step = 0.3719;
  const vals = new Float64Array(side * side);
  let k = 0;
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) vals[k++] = fbm(i * step + 0.13, j * step + 0.71, layer, cfg.octaves, cfg.gain);
  vals.sort();
  const q = new Float64Array(QUANT_N + 1);
  for (let i = 0; i < QUANT_N; i++) q[i] = vals[Math.floor((i / QUANT_N) * (vals.length - 1))];
  q[QUANT_N] = vals[vals.length - 1] + (cfg.edgeBand > 0 ? cfg.edgeBand : 0);
  return q;
}

/**
 * Build the storm field for `seed` on the match's rolled `rings` (rollZoneRings)
 * and `timeline` (CONFIG.zone). Deterministic. Holds `cfg` by reference: the
 * dials may change live, but the quantile table reads octaves / gain /
 * edgeBand once (rebuild the field when those change).
 */
export function makeStormField(
  seed: number, cfg: StormFieldConfig, mapRadiusU: number, rings: readonly ZoneRing[], timeline: ZoneTimeline,
): StormField {
  const s = seed >>> 0;
  const layerA = makeLayer((s ^ 0x5bd1e995) >>> 0);
  return {
    layerA,
    layerB: makeLayer((s ^ 0x9e3779b9) >>> 0),
    spinSign: mulberry32((s ^ 0x27d4eb2f) >>> 0).next() < 0.5 ? 1 : -1,
    rings,
    timeline,
    mapRadiusU,
    quant: quantiles(layerA, cfg),
    cfg,
  };
}

/** The live ring at `tMs` (ms from zone start). */
export function stormRingAt(field: StormField, tMs: number): ZoneRing {
  return zoneStateAt(tMs, 0, field.rings, field.timeline).current;
}

/** rad/ms — the turn rate at distance `r` from the eye when the ring's radius is `R`. */
function turnRate(cfg: StormFieldConfig, r: number, R: number): number {
  const Rs = R > cfg.minRadiusU ? R : cfg.minRadiusU;
  const v = cfg.edgeSpeedU / 1000;
  if (r < Rs) return (v / Rs) * (cfg.centerTurnFrac + (1 - cfg.centerTurnFrac) * (r / Rs));
  return v / r;
}

/** out[k] += ∫ turnRate(k × binU, R(τ)) dτ over [t0, t1]: held beats exactly, closing beats by midpoints. */
function addTwist(field: StormField, t0: number, t1: number, binU: number, out: Float64Array): void {
  const beat = field.timeline.beatMs > 0 ? field.timeline.beatMs : t1 - t0;
  const cfg = field.cfg;
  let a = t0;
  while (a < t1) {
    const b = Math.min(t1, (Math.floor(a / beat) + 1) * beat);
    const Ra = stormRingAt(field, a).r;
    const Rb = stormRingAt(field, b).r;
    const len = b - a;
    if (Ra === Rb) {
      for (let k = 0; k < out.length; k++) out[k] += turnRate(cfg, k * binU, Ra) * len;
    } else {
      const h = len / CLOSE_STEPS;
      for (let m = 0; m < CLOSE_STEPS; m++) {
        const Rm = Ra + (Rb - Ra) * ((m + 0.5) / CLOSE_STEPS); // R is linear inside one beat
        for (let k = 0; k < out.length; k++) out[k] += turnRate(cfg, k * binU, Rm) * h;
      }
    }
    a = b;
  }
}

/** One layer's twist table: pre-wind laid at `tReset` (invisible), plus the spin integrated to `tMs`. */
function layerTwist(field: StormField, tReset: number, tMs: number, binU: number, out: Float64Array): void {
  const cfg = field.cfg;
  const R0 = stormRingAt(field, tReset).r;
  const Rs = R0 > cfg.minRadiusU ? R0 : cfg.minRadiusU;
  for (let k = 0; k < out.length; k++) {
    const rho = (k * binU) / Rs;
    out[k] = -cfg.windRad * ((2 * rho) / (1 + rho));
  }
  addTwist(field, tReset, tMs, binU, out);
  for (let k = 0; k < out.length; k++) out[k] *= field.spinSign;
}

/** Triangle wave in [0, 1]: 0 at phase 0, 1 at phase ½. */
function morphWeight(tMs: number, period: number): number {
  if (!(period > 0)) return 0;
  const q = tMs / period;
  const p = q - Math.floor(q);
  return p < 0.5 ? 2 * p : 2 - 2 * p;
}

/** Precompute the field at `tMs` (ms from zone start). Reuses `out`'s tables when given. */
export function stormFrame(field: StormField, tMs: number, out?: StormFrame): StormFrame {
  const ring = stormRingAt(field, tMs);
  const P = field.cfg.morphMs > 0 ? field.cfg.morphMs : 0;
  const tB = P > 0 ? Math.floor(tMs / P) * P : tMs;
  const tA = P > 0 ? Math.floor((tMs - P / 2) / P) * P + P / 2 : tMs;
  const w = morphWeight(tMs, P);
  const binU = (2 * field.mapRadiusU + 200) / (TWIST_BINS - 1);
  const f: StormFrame = out ?? {
    tMs, cx: 0, cy: 0, R: 0, edgeCov: 0, w: 0, norm: 1, binU,
    twistA: new Float64Array(TWIST_BINS), twistB: new Float64Array(TWIST_BINS),
  };
  f.tMs = tMs;
  f.cx = ring.cx;
  f.cy = ring.cy;
  f.R = ring.r;
  f.edgeCov = stormEdgeCoverageAt(field, tMs);
  f.w = w;
  f.norm = 1 / Math.sqrt((1 - w) * (1 - w) + w * w);
  f.binU = binU;
  layerTwist(field, tA, tMs, binU, f.twistA);
  layerTwist(field, tB, tMs, binU, f.twistB);
  return f;
}

const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The share at solid rain at ρ = distance / live ring radius. */
export function stormCoverageAt(cfg: StormFieldConfig, edgeCov: number, rho: number): number {
  const e = cfg.eyeFrac;
  if (rho <= e) return 0;
  if (rho <= 1) return edgeCov * smooth(e < 1 ? (rho - e) / (1 - e) : 1);
  const u = cfg.edgeSoftW > 0 ? (rho - 1) / cfg.edgeSoftW : 1;
  return edgeCov + (cfg.coverageOutside - edgeCov) * smooth(u);
}

/**
 * The live edge coverage at `tMs`: ring g's entry of `coverageEdgeByRing`
 * (clamped to the last), and during a closing beat a linear blend toward ring
 * g+1's entry by the SAME progress fraction zoneStateAt uses for the ring's
 * radius (1 − closesInMs / beatMs). Holds the last entry through the collapse
 * (the collapse group's index is past the table) and after it.
 */
export function stormEdgeCoverageAt(field: StormField, tMs: number): number {
  const tab = field.cfg.coverageEdgeByRing;
  const last = tab.length - 1;
  if (last < 0) return 0;
  const st = zoneStateAt(tMs, 0, field.rings, field.timeline);
  const g = Math.min(st.groupIndex, last);
  const a = tab[g];
  if (st.phase !== 'closing' || !(field.timeline.beatMs > 0)) return a;
  const f = 1 - st.closesInMs / field.timeline.beatMs;
  const b = tab[Math.min(st.groupIndex + 1, last)];
  return a + (b - a) * (f < 0 ? 0 : f > 1 ? 1 : f);
}

/** The cut whose solid share is `cov` (quantile of 1 − cov, less half the edge band). */
export function stormCutFor(field: StormField, cov: number): number {
  const q = field.quant;
  const p = (1 - (cov < 0 ? 0 : cov > 1 ? 1 : cov)) * QUANT_N;
  const i = Math.min(QUANT_N - 1, Math.floor(p));
  const v = q[i] + (q[i + 1] - q[i]) * (p - i);
  return v - (field.cfg.edgeBand > 0 ? field.cfg.edgeBand : 0) / 2;
}

function twistAt(table: Float64Array, g: number): number {
  const n = table.length - 1;
  if (!(g < n)) return table[n];
  const i = Math.floor(g);
  return table[i] + (table[i + 1] - table[i]) * (g - i);
}

const SC = { s: 0, c: 0 };

/** Rain density in [0, 1] at world (x, y) for the precomputed `frame`. */
export function stormDensityAt(field: StormField, frame: StormFrame, x: number, y: number): number {
  const M = field.mapRadiusU;
  if (!(x * x + y * y <= M * M)) return 0;
  const cfg = field.cfg;
  const qx = x - frame.cx;
  const qy = y - frame.cy;
  const r = Math.sqrt(qx * qx + qy * qy);
  const rho = frame.R > 0 ? r / frame.R : Infinity;
  const cov = stormCoverageAt(cfg, frame.edgeCov, rho);
  if (!(cov > 0)) return 0;
  const cut = stormCutFor(field, cov);
  const g = r / frame.binU;
  const inv = 1 / cfg.wavelengthU;
  fogSinCos(-twistAt(frame.twistA, g), SC);
  const ax = (qx * SC.c - qy * SC.s) * inv;
  const ay = (qx * SC.s + qy * SC.c) * inv;
  fogSinCos(-twistAt(frame.twistB, g), SC);
  const off = LAYER_B_OFFSET_U * inv;
  const bx = (qx * SC.c - qy * SC.s) * inv + off;
  const by = (qx * SC.s + qy * SC.c) * inv + off;
  const a = fbm(ax, ay, field.layerA, cfg.octaves, cfg.gain);
  const b = fbm(bx, by, field.layerB, cfg.octaves, cfg.gain);
  const n = (a + (b - a) * frame.w) * frame.norm;
  const band = cfg.edgeBand;
  if (!(band > 0)) return n > cut ? 1 : 0;
  const d = (n - cut) / band;
  return d <= 0 ? 0 : d >= 1 ? 1 : d;
}

/** Convenience (slow): density at (x, y, tMs) building the frame on the spot. */
export function stormDensityRef(field: StormField, x: number, y: number, tMs: number): number {
  return stormDensityAt(field, stormFrame(field, tMs), x, y);
}
