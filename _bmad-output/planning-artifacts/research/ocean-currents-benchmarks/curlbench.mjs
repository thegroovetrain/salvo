// Benchmark: cost of a 2D curl-noise current sample built from Hullcracker's
// OWN noise.ts primitives (perlin/fbm copied byte-for-byte from
// shared/src/sim/noise.ts) plus Bridson's boundary ramp (quintic polynomial).
//
// Measures the per-sample cost that a current field would add to the 20Hz tick.

const D = 0.7071067811865476;
const GX = new Float64Array([1, -1, 0, 0, D, -D, D, -D]);
const GY = new Float64Array([0, 0, 1, -1, D, D, -D, -D]);

function makeU32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function makeLayer(seed) {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  const next = makeU32(seed);
  for (let i = 255; i > 0; i--) {
    const j = next() % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return p;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function perlin(x, y, P) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fade(fx);
  const v = fade(fy);
  const X = xi & 255;
  const Y = yi & 255;
  const A = P[X] + Y;
  const B = P[X + 1] + Y;
  let h = P[A] & 7;
  const n00 = GX[h] * fx + GY[h] * fy;
  h = P[B] & 7;
  const n10 = GX[h] * (fx - 1) + GY[h] * fy;
  h = P[A + 1] & 7;
  const n01 = GX[h] * fx + GY[h] * (fy - 1);
  h = P[B + 1] & 7;
  const n11 = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return (a + v * (b - a)) * 1.4142135623730951;
}

function fbm(x, y, P, oct, gain) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * perlin(x * freq, y * freq, P);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

// Bridson eq.4 ramp — a QUINTIC POLYNOMIAL. Zero transcendentals.
function ramp(r) {
  if (r >= 1) return 1;
  if (r <= -1) return -1;
  return (15 / 8) * r - (10 / 8) * r * r * r + (3 / 8) * r * r * r * r * r;
}

const P = makeLayer(1337);
const L = 1 / 600; // noise length scale: ~600u eddies
const EPS = 0.5; // finite-difference displacement in world units
const D0 = 120; // boundary ramp width in world units

// --- Scenario A: raw curl sample, no boundary term (3 fbm, forward diff) ---
function curlPlain(x, y, oct) {
  const p0 = fbm(x * L, y * L, P, oct, 0.5);
  const px = fbm((x + EPS) * L, y * L, P, oct, 0.5);
  const py = fbm(x * L, (y + EPS) * L, P, oct, 0.5);
  return [(py - p0) / EPS, -(px - p0) / EPS];
}

// --- Scenario B: boundary-respecting curl (ramp applied INSIDE the potential,
// so the finite difference sees the ramped field — this is what makes flow
// tangent to the coast). Needs the distance field at all 3 stencil points. ---
function curlBounded(x, y, oct, distFn) {
  const p0 = fbm(x * L, y * L, P, oct, 0.5) * ramp(distFn(x, y) / D0);
  const px = fbm((x + EPS) * L, y * L, P, oct, 0.5) * ramp(distFn(x + EPS, y) / D0);
  const py = fbm(x * L, (y + EPS) * L, P, oct, 0.5) * ramp(distFn(x, y + EPS) / D0);
  return [(py - p0) / EPS, -(px - p0) / EPS];
}

// A representative island polygon distance (40 verts) — matches
// closestPointOnPolygon's arithmetic (sqrt, NOT hypot).
function makePoly(cx, cy, r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + 0.4 * Math.sin(a * 3));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}
const POLY = makePoly(0, 0, 200, 40);

function polyDist(px, py, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 1e-12 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const ddx = px - qx;
    const ddy = py - qy;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d < best) best = d;
  }
  return best;
}

// Baked-raster sampling: bilinear read from a Float32Array lattice.
function makeRaster(n) {
  const vx = new Float32Array(n * n);
  const vy = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [a, b] = curlPlain(i * 20, j * 20, 4);
      vx[j * n + i] = a;
      vy[j * n + i] = b;
    }
  return { vx, vy, n };
}

function sampleRaster(r, x, y, cell) {
  const fx = x / cell;
  const fy = y / cell;
  let i = fx | 0;
  let j = fy | 0;
  if (i < 0) i = 0;
  else if (i > r.n - 2) i = r.n - 2;
  if (j < 0) j = 0;
  else if (j > r.n - 2) j = r.n - 2;
  const tx = fx - i;
  const ty = fy - j;
  const k = j * r.n + i;
  const a = r.vx[k] + (r.vx[k + 1] - r.vx[k]) * tx;
  const b = r.vx[k + r.n] + (r.vx[k + r.n + 1] - r.vx[k + r.n]) * tx;
  const c = r.vy[k] + (r.vy[k + 1] - r.vy[k]) * tx;
  const d = r.vy[k + r.n] + (r.vy[k + r.n + 1] - r.vy[k + r.n]) * tx;
  return [a + (b - a) * ty, c + (d - c) * ty];
}

function bench(name, fn, iters) {
  // warmup
  for (let i = 0; i < 50000; i++) fn(i);
  let acc = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) acc += fn(i);
  const t1 = process.hrtime.bigint();
  const ns = Number(t1 - t0) / iters;
  console.log(`${name.padEnd(46)} ${ns.toFixed(2).padStart(8)} ns/sample   (sink ${acc.toFixed(3)})`);
  return ns;
}

console.log('\n=== Per-sample cost (node ' + process.version + ', ' + process.arch + ') ===\n');

const N = 2_000_000;
const r1 = bench('perlin (1 octave)', (i) => perlin(i * 0.013, i * 0.007, P), N);
const r2 = bench('fbm 3 octaves', (i) => fbm(i * 0.013, i * 0.007, P, 3, 0.5), N);
const r4 = bench('fbm 4 octaves', (i) => fbm(i * 0.013, i * 0.007, P, 4, 0.5), N);
const cA3 = bench('curl velocity, 3 oct, NO boundary (3x fbm)', (i) => curlPlain(i * 1.7, i * 0.9, 3)[0], N);
const cA4 = bench('curl velocity, 4 oct, NO boundary (3x fbm)', (i) => curlPlain(i * 1.7, i * 0.9, 4)[0], N);
const pd = bench('polygon distance, 40 verts (1 island)', (i) => polyDist((i % 900) - 450, (i % 700) - 350, POLY), 500_000);
const cB = bench(
  'curl velocity, 4 oct + boundary (3x fbm+3x dist)',
  (i) => curlBounded(i * 1.7, i * 0.9, 4, (x, y) => polyDist(x % 900, y % 700, POLY))[0],
  200_000,
);

const RAST = makeRaster(256);
const cR = bench('BAKED raster bilinear sample (256x256)', (i) => sampleRaster(RAST, (i * 7) % 5000, (i * 3) % 5000, 20)[0], N);

console.log('\n=== Per-tick extrapolation (20 hulls + 12 torpedoes + wake heads) ===\n');
const scenarios = [
  ['analytic curl 4oct, no boundary', cA4],
  ['analytic curl 4oct + 1-island boundary', cB],
  ['baked raster bilinear', cR],
];
// Sample counts per tick: 20 hulls, 12 torps in flight, 20 wake head samples.
const SAMPLES = 20 + 12 + 20;
for (const [name, ns] of scenarios) {
  const perTick = (ns * SAMPLES) / 1000; // µs
  console.log(
    `${name.padEnd(42)} ${SAMPLES} samples -> ${perTick.toFixed(2).padStart(8)} µs/tick   (${((perTick / 50000) * 100).toFixed(4)}% of 50ms)`,
  );
}

console.log('\n=== Bake cost (generation-time, one-off per match) ===\n');
for (const n of [128, 256, 512]) {
  const t0 = process.hrtime.bigint();
  makeRaster(n);
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  const bytes = n * n * 8;
  console.log(
    `${n}x${n} lattice: ${ms.toFixed(1).padStart(7)} ms bake, ${(bytes / 1024).toFixed(0).padStart(5)} KB (2x Float32), cell=${(4800 / n).toFixed(1)}u`,
  );
}
console.log('');
