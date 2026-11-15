// RAIN FIXTURES (Story 11.6) — the frames the server tests pin through
// `World.setFogFrameForTest`, and the INDEPENDENT optical-depth oracle the
// perception suites hold production against.
//
// A frame is the shared field precomputed at one instant (`fogFrameAt`), so a
// test names its weather by the same public inputs a client has: the seed's
// field, a zone clock and an eye center. Nothing here reads a production
// gate: the oracle re-integrates the SHARED density itself.

import { CONFIG, fogDensityAt, fogFrameAt, fogMaxDepth, makeFogField, type FogFrame } from '@salvo/shared';
import type { World } from '../game/world.js';

/** T — the optical depth at which a thing vanishes (the one threshold every eye gate compares against). */
export const RAIN_T = fogMaxDepth(CONFIG.fog);

/**
 * A REAL storm frame over `w`'s own field: the zone started at 0, the clock at
 * `tMs` (default: one second past the roll-in, so the onset ramp is 1 and the
 * first ring still stands), the eye at (`cx`, `cy`) (default: the ocean
 * center). Real rain with real gaps and a clear eye.
 */
export function stormFrame(w: World, tMs: number = CONFIG.fog.onsetMs + 1000, cx = 0, cy = 0): FogFrame {
  return fogFrameAt(w.fogFieldForTest(), tMs, 0, cx, cy, CONFIG.zone);
}

/**
 * UNIFORM rain: density exactly `density` at every point of `w`'s ocean (0
 * past the rim, as always). Built from the shared functions over a field
 * whose cut sits below every noise value — hard edge, coverage 1, no roll-in,
 * the ring collapsed so the whole ocean is "outside" — with the frame's onset
 * factor standing in for the density. So τ along a ray on the ocean is
 * `density × its length`, exactly, and a directed test can place a subject a
 * known optical depth away.
 */
export function uniformRainFrame(w: World, density: number): FogFrame {
  const cfg = { ...CONFIG.fog, edgeBand: 0, outsideCoverage: 1, onsetMs: 0 };
  const built = makeFogField(w.fogSeed, cfg, w.map.radius);
  const field = { ...built, quant: new Float64Array(built.quant.length).fill(-10) }; // every cut is −10: under all noise
  const frame = fogFrameAt(field, 0, 0, 0, 0, CONFIG.zone);
  frame.R = 0; // collapsed: the whole ocean reads the outside coverage
  frame.onset = density;
  return frame;
}

/** No rain at all (the pre-zone frame). */
export function clearFrame(w: World): FogFrame {
  return fogFrameAt(w.fogFieldForTest(), 0, null, 0, 0, CONFIG.zone);
}

/** One ray's optical depth by the oracle: τ, the dead band around it, and whether the ray touches rain at all. */
export interface RainDepth {
  tau: number;
  slack: number;
  touched: boolean;
}

const NO_RAIN: RainDepth = { tau: 0, slack: 0, touched: false };

/** The oracle's sample spacing (u): a tenth of production's cell. */
export const ORACLE_STEP_U = 1;
/** How many samples share one oscillation stencil (the oscillation varies over tens of u — the rain's edge band is wider than a cell). */
const STENCIL_EVERY = 5;

/** The largest |density − d0| over the four points `reach` u from (x, y): along the ray both ways and across it both ways. */
function stencilOsc(frame: FogFrame, x: number, y: number, ux: number, uy: number, reach: number, d0: number): number {
  let osc = 0;
  for (const [ox, oy] of [[ux, uy], [-ux, -uy], [-uy, ux], [uy, -ux]]) {
    osc = Math.max(osc, Math.abs(fogDensityAt(frame, x + ox * reach, y + oy * reach) - d0));
  }
  return osc;
}

/**
 * THE ORACLE: τ of the rain on A → B, re-integrated from the SHARED density
 * on `frame` by a midpoint sum at ~1 u — never production's walk (which sums
 * 10 u memo cells, each read at its centre). `slack` is the honest dead band
 * between the two integrations of the one field:
 *
 *   production's τ = Σ_cells density(cell centre) × (ray length in the cell).
 *   A cell's centre lies within half a cell diagonal (ρ = marchStepU × √2 / 2
 *   ≈ 7.1 u) of EVERY ray point inside that cell — along the ray or across
 *   it. So |production − ∫ density ds| ≤ ∫ osc(s) ds, where osc(s) is the
 *   most the density differs from its on-ray value anywhere within ρ of the
 *   ray point at s. The oracle samples osc with a four-point stencil at
 *   distance ρ (along the ray both ways, across it both ways); for a locally
 *   linear density the stencil reads at least 1/√2 of the true oscillation
 *   (the gradient is at most 45° off a stencil arm), hence the √2. To that
 *   it adds its own midpoint error (one oracle step × the total variation of
 *   the sampled profile) and half a unit for float32 memo cells and the
 *   sampling of the stencil every few samples.
 *
 * With no rain on the ray (every sample 0) the slack is 0 and a gate built
 * on this is the exact pre-rain test. No own-bank term: the rain the
 * observer stands in counts, so there is ONE τ, not a band.
 */
export function rainDepthOracle(frame: FogFrame, a: { x: number; y: number }, b: { x: number; y: number }): RainDepth {
  if (!frame.on) return NO_RAIN;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(len / ORACLE_STEP_U);
  if (n === 0 || !Number.isFinite(len)) return NO_RAIN;
  const step = len / n;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const reach = (CONFIG.fog.marchStepU * Math.SQRT2) / 2;
  let sum = 0;
  let tv = 0;
  let oscSum = 0;
  let osc = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = a.x + ux * (i + 0.5) * step;
    const y = a.y + uy * (i + 0.5) * step;
    const d = fogDensityAt(frame, x, y);
    if (i % STENCIL_EVERY === 0) osc = stencilOsc(frame, x, y, ux, uy, reach, d);
    sum += d;
    oscSum += osc;
    tv += Math.abs(d - prev);
    prev = d;
  }
  if (!(sum > 0) && !(oscSum > 0)) return NO_RAIN;
  return { tau: sum * step, slack: Math.SQRT2 * oscSum * step + step * tv + 0.5, touched: true };
}
