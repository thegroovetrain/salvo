// SMOKE SIGHT — the optical depth a set of SMOKE SCREEN clouds adds to an eye
// line (Story 11.6 scope add, Eric 2026-11-14: smoke occludes sight like rain;
// "your own smoke blinds you too"; thickness is HIS dial, set on the bench).
// Written in the shared/ posture so it ports to `shared/src/sim/` verbatim:
// pure, deterministic, plain objects, zero I/O, NO TRANSCENDENTALS (Math.sqrt
// only — no exp / log / pow / trig / random, no clock).
//
// The model in plain words:
// • A cloud is a stationary disc {x, y, r} (r = `cloudOutlineRadius(age,
//   size)` — the spray disc, r0 → r1 over the cloud's life).
// • Its density across the disc is `thickness` (in units of the HEAVIEST rain,
//   density 1 — so one u of smoke at thickness 3 costs what 3 u of solid rain
//   costs) times an EDGE PROFILE of the distance d from the center:
//     1                                   for d ≤ r × (1 − softFrac)
//     smoothstep((r − d) / (r × softFrac))  across the soft rim
//     0                                   beyond r
//   softFrac 0 is a hard disc; 1 is soft all the way to the center.
// • The depth it adds along A → B is the integral of that density over the
//   part of the segment inside the disc: the chord [t0, t1] (exact, by the
//   line/circle quadratic) clipped to the segment. A hard disc pays chord
//   length × thickness exactly; a soft one integrates the profile over the
//   chord with a fixed `SMOKE_CHORD_SAMPLES`-point midpoint rule (the profile
//   is smooth and the chord short, so a handful of samples is within a few %).
// • Clouds sum (overlapping smoke is thicker). The observer gets NO exemption:
//   an eye inside a cloud pays its own smoke out to the rim.
// • Total sight depth is rain τ (`fogDepthAlong`) + this, compared against the
//   ONE threshold `fogMaxDepth` (sim/fogDepth.ts).
//
// Fail-open like the rain: any non-finite endpoint, a zero-length segment or a
// non-positive thickness adds 0; a cloud with a non-finite or non-positive
// radius is skipped.

/** One smoke cloud as sight reads it: a disc in world u. */
export interface SmokeDisc {
  readonly x: number;
  readonly y: number;
  readonly r: number; // u — the spray-disc radius right now
}

/** The smoke dials sight reads. */
export interface SmokeSightConfig {
  thickness: number; // density inside the core, × the heaviest rain (density 1)
  softFrac: number; // soft rim width as a fraction of r (0 = hard disc, 1 = soft to the center)
}

/** Midpoint samples across a soft chord. */
export const SMOKE_CHORD_SAMPLES = 8;

const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The edge profile at squared distance `d2` from a disc of radius `r` (core radius `ri`, rim width `w`). */
function profile(d2: number, r: number, ri: number, w: number): number {
  if (d2 <= ri * ri) return 1;
  if (d2 >= r * r) return 0;
  return smooth((r - Math.sqrt(d2)) / w);
}

/**
 * The profile's integral along the line p(t) = (px + ux t, py + uy t) — p
 * relative to the disc center, u a unit vector — for t in [t0, t1], fully
 * inside the disc.
 */
function softChord(px: number, py: number, ux: number, uy: number, t0: number, t1: number, r: number, soft: number): number {
  const w = r * soft;
  const ri = r - w;
  const h = (t1 - t0) / SMOKE_CHORD_SAMPLES;
  let sum = 0;
  for (let k = 0; k < SMOKE_CHORD_SAMPLES; k++) {
    const t = t0 + h * (k + 0.5);
    const x = px + ux * t;
    const y = py + uy * t;
    sum += profile(x * x + y * y, r, ri, w);
  }
  return sum * h;
}

/** One cloud's depth along A + u t, t in [0, len], before × thickness. */
function discDepth(c: SmokeDisc, ax: number, ay: number, ux: number, uy: number, len: number, soft: number): number {
  const r = c.r;
  if (!(r > 0) || !Number.isFinite(r) || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return 0;
  const px = ax - c.x;
  const py = ay - c.y;
  // |p + u t|² = r²  →  t² + 2 b t + q = 0
  const b = px * ux + py * uy;
  const q = px * px + py * py - r * r;
  const disc = b * b - q;
  if (!(disc > 0)) return 0; // misses (or grazes) the disc
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, -b - s);
  const t1 = Math.min(len, -b + s);
  if (!(t1 > t0)) return 0;
  if (!(soft > 0)) return t1 - t0;
  return softChord(px, py, ux, uy, t0, t1, r, soft > 1 ? 1 : soft);
}

/**
 * Optical depth the clouds add along A → B, in rain-density units × u (the
 * same units as `fogDepthAlong`). Always ≥ 0 and finite. No observer
 * exemption: a cloud A stands in counts from A to its rim.
 */
export function smokeDepthAlong(
  clouds: readonly SmokeDisc[], ax: number, ay: number, bx: number, by: number, cfg: SmokeSightConfig,
): number {
  const k = cfg.thickness;
  if (!(k > 0) || clouds.length === 0) return 0;
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return 0;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0) || !Number.isFinite(len)) return 0;
  const ux = dx / len;
  const uy = dy / len;
  let tau = 0;
  for (let i = 0; i < clouds.length; i++) tau += discDepth(clouds[i], ax, ay, ux, uy, len, cfg.softFrac);
  tau *= k;
  return Number.isFinite(tau) && tau > 0 ? tau : 0;
}
