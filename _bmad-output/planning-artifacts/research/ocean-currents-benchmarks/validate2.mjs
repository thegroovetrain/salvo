// VALIDATION v2 — corrected tangency test.
// v1 estimated the coast normal from a polygon EDGE, which is wrong near
// concave features: the ramp's gradient follows the NEAREST BOUNDARY POINT
// (the distance field's gradient), not the local edge. This version uses the
// true nearest-point direction — exactly what island.ts's coastNormal returns.
// It also locates where divergence spikes, to test the medial-axis hypothesis.

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
  for (let i = 255; i > 0; i--) { const j = next() % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return p;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function perlin(x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fade(fx), v = fade(fy);
  const X = xi & 255, Y = yi & 255;
  const A = P[X] + Y, B = P[X + 1] + Y;
  let h = P[A] & 7;
  const n00 = GX[h] * fx + GY[h] * fy;
  h = P[B] & 7;
  const n10 = GX[h] * (fx - 1) + GY[h] * fy;
  h = P[A + 1] & 7;
  const n01 = GX[h] * fx + GY[h] * (fy - 1);
  h = P[B + 1] & 7;
  const n11 = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
  return (a + v * (b - a)) * 1.4142135623730951;
}
function fbm(x, y, P, oct, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * perlin(x * freq, y * freq, P); norm += amp; amp *= gain; freq *= 2; }
  return sum / norm;
}
function ramp(r) {
  if (r >= 1) return 1;
  if (r <= -1) return -1;
  const r3 = r * r * r;
  return (15 / 8) * r - (10 / 8) * r3 + (3 / 8) * r3 * r * r;
}

// Smooth hook island — concave, no degenerate edges
function hookIsland() {
  const pts = [], N = 128;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const bay = 1 - 0.55 * Math.exp(-Math.pow((a - 1.55) / 0.55, 2));
    const r = (185 + 55 * Math.sin(a * 2 + 0.7) + 22 * Math.sin(a * 5 + 1.9)) * bay;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}
const POLY = hookIsland();
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function closestPointOnPolygon(p, poly) {
  let best = { x: poly[0].x, y: poly[0].y, dist: Infinity };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 1e-12 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const qx = a.x + dx * t, qy = a.y + dy * t;
    const ddx = p.x - qx, ddy = p.y - qy;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d < best.dist) best = { x: qx, y: qy, dist: d };
  }
  return best;
}
function signedDist(x, y) {
  const q = closestPointOnPolygon({ x, y }, POLY);
  return pointInPolygon({ x, y }, POLY) ? -q.dist : q.dist;
}
// True outward normal at p = direction from nearest boundary point to p
function coastNormal(x, y) {
  const q = closestPointOnPolygon({ x, y }, POLY);
  if (q.dist < 1e-9) return null;
  const inside = pointInPolygon({ x, y }, POLY);
  const s = inside ? -1 : 1;
  return { nx: (s * (x - q.x)) / q.dist, ny: (s * (y - q.y)) / q.dist };
}

const P = makeLayer(20260811);
const L = 1 / 700, D0 = 110, OCT = 4, STRENGTH = 900;
function psi(x, y) {
  return fbm(x * L, y * L, P, OCT, 0.5) * STRENGTH * ramp(signedDist(x, y) / D0);
}
const H = 0.5;
function currentAt(x, y) {
  const dpdy = (psi(x, y + H) - psi(x, y - H)) / (2 * H);
  const dpdx = (psi(x + H, y) - psi(x - H, y)) / (2 * H);
  return [dpdy, -dpdx];
}

console.log('\n===== VALIDATION v2 — true nearest-boundary normals =====\n');

console.log('1. TANGENCY AT COASTLINE (|v.n|/|v|, n = true nearest-boundary normal)');
const bands = [1, 2, 5, 10, 20, 40, 80];
for (const band of bands) {
  let sum = 0, n = 0, worst = 0, into = 0;
  for (let i = 0; i < POLY.length; i++) {
    const a = POLY[i];
    const nb = coastNormal(a.x, a.y);
    // step outward from a point slightly off the vertex to get a valid normal
    const seedN = nb ?? { nx: a.x, ny: a.y };
    const nl = Math.sqrt(seedN.nx * seedN.nx + seedN.ny * seedN.ny) || 1;
    const px = a.x + (seedN.nx / nl) * band, py = a.y + (seedN.ny / nl) * band;
    if (pointInPolygon({ x: px, y: py }, POLY)) continue;
    const nn = coastNormal(px, py);
    if (!nn) continue;
    const [vx, vy] = currentAt(px, py);
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp < 1e-9) continue;
    const dot = (vx * nn.nx + vy * nn.ny) / sp;
    const align = Math.abs(dot);
    sum += align; n++;
    if (align > worst) worst = align;
    if (dot < -0.3) into++;
  }
  console.log(
    `   ${String(band).padStart(3)}u offshore: mean ${(sum / n).toFixed(4)}  worst ${worst.toFixed(4)}  shoreward>0.3: ${into}/${n}`,
  );
}

console.log('\n2. DIVERGENCE vs DISTANCE-TO-COAST (medial-axis hypothesis)');
// bucket divergence by distance to the island; a medial-axis spike should show
// up at intermediate distances, not at the coast and not far out.
const buckets = new Map();
const E = 1.0;
let globalMax = 0, argMax = null;
for (let y = -900; y <= 900; y += 17) {
  for (let x = -900; x <= 900; x += 17) {
    if (pointInPolygon({ x, y }, POLY)) continue;
    const [vx1] = currentAt(x + E, y);
    const [vx0] = currentAt(x - E, y);
    const [, vy1] = currentAt(x, y + E);
    const [, vy0] = currentAt(x, y - E);
    const div = Math.abs((vx1 - vx0) / (2 * E) + (vy1 - vy0) / (2 * E));
    const d = signedDist(x, y);
    const key = d < 20 ? '  0- 20u' : d < 60 ? ' 20- 60u' : d < 110 ? ' 60-110u' : d < 200 ? '110-200u' : '  >200u ';
    const b = buckets.get(key) ?? { sum: 0, n: 0, max: 0 };
    b.sum += div; b.n++; if (div > b.max) b.max = div;
    buckets.set(key, b);
    if (div > globalMax) { globalMax = div; argMax = { x, y, d }; }
  }
}
for (const k of ['  0- 20u', ' 20- 60u', ' 60-110u', '110-200u', '  >200u ']) {
  const b = buckets.get(k);
  if (b) console.log(`   d=${k}: mean|div| ${(b.sum / b.n).toExponential(2)}   max ${b.max.toExponential(2)}   (n=${b.n})`);
}
console.log(`   global max |div| = ${globalMax.toExponential(3)} at (${argMax.x}, ${argMax.y}), d=${argMax.d.toFixed(1)}u`);

// Divergence measured with a stencil MATCHING the curl stencil (H), which is
// the mathematically fair test of the curl identity.
let m2 = 0, s2 = 0, n2 = 0;
for (let y = -900; y <= 900; y += 37) {
  for (let x = -900; x <= 900; x += 37) {
    if (pointInPolygon({ x, y }, POLY)) continue;
    const [vx1] = currentAt(x + H, y);
    const [vx0] = currentAt(x - H, y);
    const [, vy1] = currentAt(x, y + H);
    const [, vy0] = currentAt(x, y - H);
    const div = Math.abs((vx1 - vx0) / (2 * H) + (vy1 - vy0) / (2 * H));
    s2 += div; n2++; if (div > m2) m2 = div;
  }
}
console.log(`\n   matched-stencil divergence: mean ${(s2 / n2).toExponential(2)}  max ${m2.toExponential(2)}  (n=${n2})`);

console.log('\n3. SPEED DISTRIBUTION (is the field usable / well-conditioned?)');
const speeds = [];
for (let y = -900; y <= 900; y += 13) {
  for (let x = -900; x <= 900; x += 13) {
    if (pointInPolygon({ x, y }, POLY)) continue;
    const [vx, vy] = currentAt(x, y);
    speeds.push(Math.sqrt(vx * vx + vy * vy));
  }
}
speeds.sort((a, b) => a - b);
const pct = (p) => speeds[Math.floor(speeds.length * p)].toFixed(2);
console.log(`   p10 ${pct(0.1)}  p50 ${pct(0.5)}  p90 ${pct(0.9)}  p99 ${pct(0.99)}  max ${speeds[speeds.length - 1].toFixed(2)} u/s`);
console.log(`   (STRENGTH=${STRENGTH} chosen to land the median near 1.5 u/s)\n`);
