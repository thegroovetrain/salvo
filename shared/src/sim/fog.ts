// RAIN — the storm-eye rain field and its optical depth (Story 11.6; Eric
// 2026-11-14 on the rain-sight bench page: "the eye of a closing hurricane",
// and rain must occlude "in a realistic way" — you see the PARTS of a ship the
// rain lets through). Ported from the approved bench module
// (`bench/rain-sight/src/stormField.ts`, branch worktree-rain-sight-bench).
// The old fog banks (a coverage-target cut, a free own bank, a sight toll in
// extra distance) are GONE.
//
// This module is the ONE derivation of the rain. Server and client evaluate it
// identically from PUBLIC inputs only: `fogSeed` (rides the welcome), CONFIG,
// the ocean radius, `zoneStartT`, the clock, the public ring-radius LADDER
// (`zoneRingRadii` on the public beat timeline) and the LIVE ring center
// (`zoneLiveState` — never the unrevealed next ring; the server frounds it so
// it matches the client's float32 schema copy).
//
// The field in plain words:
// • The storm's EYE is the live zone ring: noise is sampled in the eye's frame
//   (point minus the live center), so the clouds travel with the eye. No wind.
// • The clouds SPIN about the eye: linear speed 0 at the center, `edgeSpeedU`
//   at the ring edge (turn rate inside = edge rate × (centerTurnFrac + (1 −
//   centerTurnFrac) × ρ), ρ = r / R); outside the ring the linear speed holds
//   at `edgeSpeedU` (turn rate edgeSpeedU / r — the shear that lays out trailing
//   spiral bands). Direction: a per-match coin flip from the seed. R is floored
//   at `spinRadiusFloorU` for the spin (the collapse drives R to 0).
// • BOUNDED SHEAR: two fbm layers cross-fade on a triangle wave of period
//   `morphMs`; each layer's twist is measured from its last INVISIBLE instant
//   (weight 0), where it is laid down PRE-WOUND by a trailing spiral of
//   `spiralWindRad` at the ring edge (θ₀ = −wind × 2ρ / (1 + ρ)). A parcel keeps
//   its eye-frame radius, so the twist since reset is the time integral of the
//   turn rate at that radius over R(τ) — held beats in closed form, closing
//   beats by a fixed midpoint rule — tabulated once per frame over radius.
// • DENSITY by ρ through a coverage → cut map (coverage = the share of area at
//   solid rain, density ≥ ½): 0 inside the eye (ρ ≤ the live eye fraction,
//   `eyeRadiusFracByRing` stepped by ring like the edge coverage — Eric
//   2026-11-14, superseding the bench's flat 0.40), a smoothstep
//   up to the live edge coverage at the ring edge (`edgeCoverageByRing`, lerped
//   through each closing beat by its progress, held at the last entry through
//   the collapse), then a smoothstep over `edgeSoftFrac` (in ρ) to
//   `outsideCoverage`. The cut for a coverage comes from the noise's value
//   distribution, measured ONCE per seed (a quantile table); the layer blend is
//   variance-normalized so one table holds at every morph phase. Density =
//   clamp01((n − cut) / edgeBand). Zero beyond the ocean rim. Before the zone
//   starts the field is the ring-0 state (Eric 2026-11-15: no roll-in).
// • SIGHT: optical depth τ = Σ density × step along a ray (a `marchStepU`
//   midpoint march). Visibility is V = exp(−extinctionPerU × τ) — evaluated in
//   sim/fogDepth.ts, never here; a thing is seen while V ≥ sightCutoffV, i.e.
//   τ ≤ fogMaxDepth(cfg). NO own-bank exemption: rain you stand in blocks your
//   sight. Radar never reads this file.
//
// PURE, DETERMINISTIC, ZERO I/O, plain objects. NO TRANSCENDENTALS (the
// map-gen posture): `Math.sqrt` only — no hypot, trig, pow, exp/log, random,
// and no clock (time arrives as an argument). A shared test guards the source.

import { CONFIG } from '../constants.js';
import { fbm, makeLayer, type NoiseLayer } from './noise.js';
import { mulberry32 } from '../math/rng.js';
import { ZONE_BEATS_PER_GROUP, zoneGroups, zoneLadderRadiusAt, zoneRingRadii, type ZoneTimeline } from './zone.js';

/** Density ≥ this is SOLID rain — the share the coverage dials count, and what the bots call cover. */
export const FOG_SOLID_DENSITY = 0.5;

/** The slice of `CONFIG.fog` the field math reads (CONFIG.fog fits). */
export interface FogFieldConfig {
  wavelengthU: number; // u — noise base feature size
  octaves: number;
  gain: number;
  edgeBand: number; // noise units over which density ramps 0 → 1 above the cut
  morphMs: number; // ms — two-layer cross-fade period (and the shear reset)
  marchStepU: number; // u — the optical-depth march step
  edgeSpeedU: number; // u/s — cloud speed at the ring edge (held outside it)
  centerTurnFrac: number; // turn rate at the center as a fraction of the edge's
  spiralWindRad: number; // rad — trailing spiral pre-wind at the ring edge, laid at each layer's invisible instant
  eyeRadiusFracByRing: readonly number[]; // ρ — the clear eye's radius as a fraction of the live ring, per ring group (held at the last entry past it)
  edgeCoverageByRing: readonly number[]; // solid share at the ring edge, per ring group (held at the last entry past it)
  outsideCoverage: number; // solid share out in the storm
  edgeSoftFrac: number; // ρ — width of the edge → outside blend
  spinRadiusFloorU: number; // u — floor on R for the spin
}

/** A built rain field: two noise layers, the coin flip and the coverage → cut table. */
export interface FogField {
  readonly layerA: NoiseLayer;
  readonly layerB: NoiseLayer;
  readonly spinSign: 1 | -1; // the per-match coin flip
  readonly oceanRadiusU: number; // u — rain only inside this disc about the origin (0 = no rain)
  readonly quant: Float64Array; // QUANT_N + 1 quantiles of the blended noise; [QUANT_N] = max + edgeBand
  readonly cfg: FogFieldConfig;
}

/** One instant of the rain, precomputed once and shared by every sample at that instant. */
export interface FogFrame {
  field: FogField;
  on: boolean; // false = no rain anywhere (pre-zone, non-finite input, no ocean)
  cx: number; // u — the live ring (eye) center
  cy: number;
  R: number; // u — the live ring radius from the public ladder (0 once collapsed)
  edgeCov: number; // solid share at the live ring edge
  eyeFrac: number; // ρ — the live clear-eye radius as a fraction of R
  w: number; // layer B's cross-fade weight
  norm: number; // variance normalizer of the blend
  binU: number; // u per twist-table bin
  twistA: Float64Array; // rad — layer A's forward rotation at radius k × binU from the eye
  twistB: Float64Array;
}

const QUANT_N = 256;
const TWIST_BINS = 512;
const CLOSE_STEPS = 12; // midpoint steps per closing-beat segment of the twist integral
// The most beat segments one twist integral walks. The shipped dials need a
// handful (a layer's window is at most `morphMs`, 2.5 beats); the cap is what
// keeps a tuning arm or a dev zone override (`morphMs / beatMs` is unbounded)
// from pinning a tick — past it the rest of the window is integrated as one
// held segment (see `addTwist`).
const TWIST_MAX_SEGMENTS = 256;
const LAYER_B_OFFSET_U = 1000; // u — layer B's sample offset, so the layers never line up
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/**
 * sin and cos of `a` radians by plain arithmetic (no Math.sin/cos: the
 * map-gen posture — byte-identical on every JS engine). Range-reduce to
 * [-π/2, π/2] with Math.floor, then an odd degree-11 series: error < 1e-6.
 */
export function fogSinCos(a: number, out: { s: number; c: number }): void {
  const q = a / TWO_PI;
  let x = (q - Math.floor(q)) * TWO_PI; // [0, 2π)
  if (x > 3.141592653589793) x -= TWO_PI; // (-π, π]
  const flip = x > HALF_PI ? 1 : x < -HALF_PI ? -1 : 0;
  if (flip === 1) x = 3.141592653589793 - x;
  else if (flip === -1) x = -3.141592653589793 - x;
  const x2 = x * x;
  const sn = x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110)))));
  const cs = 1 - x2 / 2 * (1 - x2 / 12 * (1 - x2 / 30 * (1 - x2 / 56 * (1 - x2 / 90))));
  out.s = sn;
  out.c = flip === 0 ? cs : -cs;
}

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The quantile table of fbm on `layer` (a lattice far from integer alignment). */
function quantiles(layer: NoiseLayer, cfg: FogFieldConfig): Float64Array {
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
 * Build the rain field for `seed` over an ocean of radius `oceanRadiusU` about
 * the origin. Deterministic: same seed + cfg + ocean → identical field. Holds
 * `cfg` by reference; the quantile table reads octaves / gain / edgeBand ONCE
 * (rebuild the field when those change). A non-positive or NaN radius builds a
 * field with no rain anywhere.
 */
export function makeFogField(seed: number, cfg: FogFieldConfig, oceanRadiusU: number): FogField {
  const s = seed >>> 0;
  const layerA = makeLayer((s ^ 0x5bd1e995) >>> 0);
  return {
    layerA,
    layerB: makeLayer((s ^ 0x9e3779b9) >>> 0),
    spinSign: mulberry32((s ^ 0x27d4eb2f) >>> 0).next() < 0.5 ? 1 : -1,
    oceanRadiusU: oceanRadiusU > 0 && Number.isFinite(oceanRadiusU) ? oceanRadiusU : 0,
    quant: quantiles(layerA, cfg),
    cfg,
  };
}

/** rad/ms — the turn rate at distance `r` from the eye when the ring's radius is `R`. */
function turnRate(cfg: FogFieldConfig, r: number, R: number): number {
  const Rs = R > cfg.spinRadiusFloorU ? R : cfg.spinRadiusFloorU;
  const v = cfg.edgeSpeedU / 1000;
  if (r < Rs) return (v / Rs) * (cfg.centerTurnFrac + (1 - cfg.centerTurnFrac) * (r / Rs));
  return v / r;
}

/** out[k] += turnRate(k × binU, R) × dt for every bin. */
function addRate(cfg: FogFieldConfig, R: number, dt: number, binU: number, out: Float64Array): void {
  for (let k = 0; k < out.length; k++) out[k] += turnRate(cfg, k * binU, R) * dt;
}

/** What the twist integral reads of the zone: the ladder and the beat. */
interface ZoneClock {
  radii: readonly number[];
  zoneCfg: ZoneTimeline;
  beatMs: number;
}

/**
 * out[k] += ∫ turnRate(k × binU, R(τ)) dτ over [e0, e1] (zone-relative ms): held beats exactly, closing beats by midpoints.
 *
 * ALWAYS FINITE WORK: the walk is one segment per beat boundary, at most
 * `TWIST_MAX_SEGMENTS` of them. A boundary that does not advance (a
 * non-integer beat under a clock so large that `(⌊a / beat⌋ + 1) × beat`
 * rounds back onto `a`) or a window longer than the cap ends the walk with
 * ONE held segment over the rest at the radius where it stopped — an
 * approximation only pathological dials ever reach (the shipped ones walk
 * three segments), never a hang.
 */
function addTwist(cfg: FogFieldConfig, zc: ZoneClock, e0: number, e1: number, binU: number, out: Float64Array): void {
  let a = e0;
  for (let seg = 0; a < e1; seg++) {
    const b = Math.min(e1, (Math.floor(a / zc.beatMs) + 1) * zc.beatMs);
    const Ra = zoneLadderRadiusAt(a, zc.radii, zc.zoneCfg);
    if (!(b > a) || seg >= TWIST_MAX_SEGMENTS) {
      addRate(cfg, Ra, e1 - a, binU, out); // the rest as ONE held segment — never a hang
      return;
    }
    const Rb = zoneLadderRadiusAt(b, zc.radii, zc.zoneCfg);
    if (Ra === Rb) {
      addRate(cfg, Ra, b - a, binU, out);
    } else {
      const h = (b - a) / CLOSE_STEPS;
      for (let m = 0; m < CLOSE_STEPS; m++) addRate(cfg, Ra + (Rb - Ra) * ((m + 0.5) / CLOSE_STEPS), h, binU, out); // R is linear inside one beat
    }
    a = b;
  }
}

/** One layer's twist table: the pre-wind laid at `eReset` (invisible), plus the spin integrated to `e`. */
function layerTwist(field: FogField, zc: ZoneClock, eReset: number, e: number, binU: number, out: Float64Array): void {
  const cfg = field.cfg;
  const R0 = zoneLadderRadiusAt(eReset, zc.radii, zc.zoneCfg);
  const Rs = R0 > cfg.spinRadiusFloorU ? R0 : cfg.spinRadiusFloorU;
  for (let k = 0; k < out.length; k++) {
    const rho = (k * binU) / Rs;
    out[k] = -cfg.spiralWindRad * ((2 * rho) / (1 + rho));
  }
  addTwist(cfg, zc, eReset, e, binU, out);
  for (let k = 0; k < out.length; k++) out[k] *= field.spinSign;
}

/** Triangle wave in [0, 1]: 0 at phase 0, 1 at phase ½. A non-positive period reads 0. */
function morphWeight(e: number, period: number): number {
  if (!(period > 0)) return 0;
  const q = e / period;
  const p = q - Math.floor(q);
  return p < 0.5 ? 2 * p : 2 - 2 * p;
}

/**
 * A per-ring dial's live value at `e` ms from zone start (the edge coverage and
 * the eye radius are both stepped by ring): ring group g's entry of `tab`
 * (clamped to the last), and during a closing beat a linear blend toward group
 * g+1's entry by the SAME progress fraction the ring's radius uses. Held at the
 * last applicable entry once closed (and on a degenerate beat), so the
 * sudden-death collapse holds the last entry. THE BLEND TARGET IS CLAMPED TO
 * THE ZONE'S LAST GROUP as well as the table's last entry: a table longer
 * than the zone has groups never blends toward an entry no group reaches
 * (the last group's closing beat would ramp to it and then snap back to the
 * closed value). An empty table reads 0.
 */
export function fogRingStepAt(tab: readonly number[], e: number, zoneCfg: ZoneTimeline = CONFIG.zone): number {
  const last = tab.length - 1;
  if (last < 0) return 0;
  const groups = zoneGroups(zoneCfg);
  const beatMs = zoneCfg.beatMs;
  const closed = tab[Math.min(groups - 1, last)];
  if (!(beatMs > 0) || !Number.isFinite(beatMs)) return closed;
  const elapsed = e > 0 ? e : 0;
  const beat = Math.floor(elapsed / beatMs);
  const g = Math.floor(beat / ZONE_BEATS_PER_GROUP);
  if (!(g < groups)) return closed;
  const a = tab[Math.min(g, last)];
  if (beat - g * ZONE_BEATS_PER_GROUP < ZONE_BEATS_PER_GROUP - 1) return a;
  const f = (elapsed - ((g + 1) * ZONE_BEATS_PER_GROUP - 1) * beatMs) / beatMs;
  return a + (tab[Math.min(g + 1, groups - 1, last)] - a) * clamp01(f);
}

/** The solid share at ρ = distance / live ring radius, for the live eye fraction `eyeFrac` and edge coverage `edgeCov`. */
export function fogCoverageAt(cfg: FogFieldConfig, eyeFrac: number, edgeCov: number, rho: number): number {
  const e = eyeFrac;
  if (!(rho > e)) return 0;
  if (rho <= 1) return edgeCov * smooth(e < 1 ? (rho - e) / (1 - e) : 1);
  const u = cfg.edgeSoftFrac > 0 ? (rho - 1) / cfg.edgeSoftFrac : 1;
  return edgeCov + (cfg.outsideCoverage - edgeCov) * smooth(u);
}

function newFrame(field: FogField): FogFrame {
  return {
    field, on: false, cx: 0, cy: 0, R: 0, edgeCov: 0, eyeFrac: 0, w: 0, norm: 1, binU: 1,
    twistA: new Float64Array(TWIST_BINS), twistB: new Float64Array(TWIST_BINS),
  };
}

/** Are the frame's inputs ones that can rain? (a started zone, finite clock and eye, a real ocean and beat) */
function canRain(field: FogField, tMs: number, zoneStartT: number | null, liveCx: number, liveCy: number, zoneCfg: ZoneTimeline): boolean {
  if (!(field.oceanRadiusU > 0)) return false;
  if (!Number.isFinite(tMs) || !Number.isFinite(liveCx) || !Number.isFinite(liveCy)) return false;
  if (zoneStartT !== null && !Number.isFinite(zoneStartT)) return false;
  return zoneCfg.beatMs > 0 && Number.isFinite(zoneCfg.beatMs);
}

/**
 * Precompute the rain at match time `tMs`: the zone started at `zoneStartT`
 * (null = not started: the ring-0 state, already spinning — Eric 2026-11-15),
 * the live ring center is (`liveCx`, `liveCy`)
 * (zoneLiveState's current ring — the server frounds it), and the timeline is
 * `zoneCfg` (the radius R(τ), the twist integral and the edge coverage come
 * from its public ladder over the field's ocean radius). Reuses `out`'s tables
 * when given (it must belong to `field`). A degenerate beat, a zero ocean, or
 * any non-finite input returns a frame with `on` false (density 0 everywhere).
 */
export function fogFrameAt(
  field: FogField, tMs: number, zoneStartT: number | null, liveCx: number, liveCy: number,
  zoneCfg: ZoneTimeline = CONFIG.zone, out?: FogFrame,
): FogFrame {
  const f = out ?? newFrame(field);
  f.field = field;
  f.on = canRain(field, tMs, zoneStartT, liveCx, liveCy, zoneCfg);
  if (!f.on) return f;
  const cfg = field.cfg;
  // RAIN BEFORE THE START (Eric 2026-11-15: "i want the rain bands to exist
  // before the game starts, not for them to roll in"): with no zone start the
  // timeline's origin is put just past `tMs`, so every instant of the twist
  // window reads ring 0 held — exactly the zone's first held beats, so the
  // field runs on without a jump when the zone starts. The morph phase rides
  // the MATCH clock (`tMs`), never the zone's, for the same reason.
  const origin = zoneStartT === null ? tMs + 1 : zoneStartT;
  const e = tMs - origin;
  const zc: ZoneClock = { radii: zoneRingRadii(field.oceanRadiusU, zoneCfg), zoneCfg, beatMs: zoneCfg.beatMs };
  const P = cfg.morphMs > 0 ? cfg.morphMs : 0;
  const tB = P > 0 ? Math.floor(tMs / P) * P : tMs;
  const tA = P > 0 ? Math.floor((tMs - P / 2) / P) * P + P / 2 : tMs;
  f.w = morphWeight(tMs, P);
  f.norm = 1 / Math.sqrt((1 - f.w) * (1 - f.w) + f.w * f.w);
  f.cx = liveCx;
  f.cy = liveCy;
  f.R = zoneLadderRadiusAt(e, zc.radii, zoneCfg);
  f.edgeCov = fogRingStepAt(cfg.edgeCoverageByRing, e, zoneCfg);
  f.eyeFrac = fogRingStepAt(cfg.eyeRadiusFracByRing, e, zoneCfg);
  f.binU = (2 * field.oceanRadiusU + 200) / (TWIST_BINS - 1);
  layerTwist(field, zc, tA - origin, e, f.binU, f.twistA);
  layerTwist(field, zc, tB - origin, e, f.binU, f.twistB);
  return f;
}

/** The cut whose solid share is `cov` (the quantile of 1 − cov, less half the edge band). */
function cutFor(field: FogField, cov: number): number {
  const q = field.quant;
  const p = (1 - clamp01(cov)) * QUANT_N;
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

/** The variance-normalized blend of the two twisted layers at eye-frame offset (qx, qy), distance r. */
function blendedNoise(frame: FogFrame, qx: number, qy: number, r: number): number {
  const field = frame.field;
  const cfg = field.cfg;
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
  return (a + (b - a) * frame.w) * frame.norm;
}

/** Map noise to density with the soft edge: clamp01((n − cut) / edgeBand); edgeBand ≤ 0 → a hard step. */
function densityOf(n: number, cut: number, edgeBand: number): number {
  if (!(edgeBand > 0)) return n > cut ? 1 : 0;
  return clamp01((n - cut) / edgeBand);
}

/** Is (x, y) a finite point on the ocean (inside the rim, boundary inclusive)? */
function onOcean(field: FogField, x: number, y: number): boolean {
  const M = field.oceanRadiusU;
  return x * x + y * y <= M * M; // NaN compares false
}

/**
 * Rain density at world (x, y) for `frame`, in [0, 1]: 0 with no rain, beyond
 * the ocean rim, inside the clear eye, or on any non-finite input.
 */
export function fogDensityAt(frame: FogFrame, x: number, y: number): number {
  if (!frame.on || !onOcean(frame.field, x, y)) return 0;
  const qx = x - frame.cx;
  const qy = y - frame.cy;
  const r = Math.sqrt(qx * qx + qy * qy);
  const rho = frame.R > 0 ? r / frame.R : Infinity;
  const cov = fogCoverageAt(frame.field.cfg, frame.eyeFrac, frame.edgeCov, rho);
  if (!(cov > 0)) return 0;
  const n = blendedNoise(frame, qx, qy, r);
  const d = densityOf(n, cutFor(frame.field, cov), frame.field.cfg.edgeBand);
  return d > 0 ? d : 0; // NaN → 0
}

function allFinite(a: number, b: number, c: number, d: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d);
}

/** The march step for a ray of length `len` (a non-positive step dial marches the ray as ONE slot). */
function stepFor(frame: FogFrame, len: number): number {
  const s = frame.field.cfg.marchStepU;
  return s > 0 ? s : len;
}

/**
 * Optical depth τ of the rain along A → B for `frame`: the ray is cut into
 * SLOTS of `marchStepU` laid from A; each full slot pays its midpoint density ×
 * the step, the last partial slot pays ITS SLOT's midpoint density × the
 * partial length (so τ(d) is piecewise linear in the distance d from A —
 * exactly what `fogDepthReach` inverts). No own-bank exemption: the rain A
 * stands in counts. Always ≥ 0 and finite; 0 with no rain, a zero-length ray
 * or any non-finite input.
 */
export function fogDepthAlong(frame: FogFrame, ax: number, ay: number, bx: number, by: number): number {
  if (!frame.on || !allFinite(ax, ay, bx, by)) return 0;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0) || !Number.isFinite(len)) return 0;
  const ux = dx / len;
  const uy = dy / len;
  const step = stepFor(frame, len);
  let tau = 0;
  for (let d0 = 0; d0 < len; d0 += step) {
    const mid = d0 + step / 2;
    const seg = d0 + step <= len ? step : len - d0;
    tau += fogDensityAt(frame, ax + ux * mid, ay + uy * mid) * seg;
  }
  return Number.isFinite(tau) && tau > 0 ? tau : 0;
}

const RSC = { s: 0, c: 0 };

/** The distance from (ox, oy) along unit (ux, uy) where τ first reaches `maxDepth`, capped at `range`. */
function marchReach(frame: FogFrame, ox: number, oy: number, ux: number, uy: number, range: number, maxDepth: number): number {
  const step = stepFor(frame, range);
  let tau = 0;
  for (let d0 = 0; d0 < range; d0 += step) {
    const mid = d0 + step / 2;
    const dens = fogDensityAt(frame, ox + ux * mid, oy + uy * mid);
    if (dens > 0 && tau + dens * step >= maxDepth) {
      const d = d0 + (maxDepth - tau) / dens;
      return d < range ? d : range;
    }
    tau += dens * step;
  }
  return range;
}

/**
 * How far an eye at (ox, oy) sees along bearing `angle` (radians, world axes:
 * dx = cos, dy = sin) through the rain of `frame`: the first distance where the
 * optical depth `fogDepthAlong` from the observer reaches `maxDepth`
 * (fogMaxDepth(cfg)), capped at `range`. Linear inside the slot that fills;
 * the march is laid from the observer independent of `range`, so the result is
 * monotone non-decreasing in `range` and never exceeds it. Fail-open "no
 * shortening": no rain, a NaN `maxDepth` or a non-finite pose returns `range`;
 * a non-finite `range` returns itself; `range ≤ 0` returns 0; a negative
 * `maxDepth` returns 0.
 */
export function fogDepthReach(frame: FogFrame, ox: number, oy: number, angle: number, range: number, maxDepth: number): number {
  if (!Number.isFinite(range)) return range;
  if (range <= 0) return 0;
  if (!frame.on || Number.isNaN(maxDepth) || !allFinite(ox, oy, angle, 0)) return range;
  if (maxDepth < 0) return 0;
  fogSinCos(angle, RSC);
  return marchReach(frame, ox, oy, RSC.c, RSC.s, range, maxDepth);
}

/**
 * `fogDepthReach` on `out.length` evenly spaced bearings — `out[k]` at
 * `k × 2π / out.length` — so the client casts its mask's fan in one call.
 * Returns `out`.
 */
export function fogDepthReachFan(
  frame: FogFrame, ox: number, oy: number, range: number, maxDepth: number, out: Float32Array,
): Float32Array {
  const n = out.length;
  for (let k = 0; k < n; k++) out[k] = fogDepthReach(frame, ox, oy, (k * TWO_PI) / n, range, maxDepth);
  return out;
}

const HSC = { s: 0, c: 0 };

/**
 * The hull's sight grid: `cols × rows` world points at the cell centers of the
 * hull's local `lengthU × beamU` rectangle about (cx, cy), the bow along
 * `heading` (rad, 0 = +x, CCW — the ship convention). Columns run stern → bow,
 * rows starboard → port (local +y is port); point (col c, row r) is written at
 * `out[2 × (r × cols + c)]` (x) and the next slot (y). Both sides use this one
 * grid. Returns the point count (0 for a non-positive count).
 */
export function fogHullGrid(
  cx: number, cy: number, heading: number, lengthU: number, beamU: number, cols: number, rows: number,
  out: Float64Array | number[],
): number {
  if (!(cols >= 1) || !(rows >= 1)) return 0;
  fogSinCos(heading, HSC);
  for (let r = 0; r < rows; r++) {
    const v = ((r + 0.5) / rows - 0.5) * beamU;
    for (let c = 0; c < cols; c++) {
      const u = ((c + 0.5) / cols - 0.5) * lengthU;
      const i = 2 * (r * cols + c);
      out[i] = cx + u * HSC.c - v * HSC.s;
      out[i + 1] = cy + u * HSC.s + v * HSC.c;
    }
  }
  return cols * rows;
}
