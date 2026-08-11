// VALIDATION v3 — BAKE THE POTENTIAL, NOT THE VELOCITY.
//
// Literature (divergence-free interpolation on MAC grids) says a bilinearly
// interpolated velocity field is NOT divergence-free, and the fix is to store
// the stream function and apply the continuous curl to the interpolant.
// This measures both, on the same island, and compares:
//   divergence · coastal tangency · memory · per-sample cost

const D = 0.7071067811865476;
const GX = new Float64Array([1, -1, 0, 0, D, -D, D, -D]);
const GY = new Float64Array([0, 0, 1, -1, D, D, -D, -D]);
function makeU32(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0; }; }
function makeLayer(seed) { const p = new Uint8Array(512); for (let i = 0; i < 256; i++) p[i] = i; const next = makeU32(seed); for (let i = 255; i > 0; i--) { const j = next() % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; } for (let i = 0; i < 256; i++) p[256 + i] = p[i]; return p; }
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function perlin(x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y); const fx = x - xi, fy = y - yi;
  const u = fade(fx), v = fade(fy); const X = xi & 255, Y = yi & 255;
  const A = P[X] + Y, B = P[X + 1] + Y;
  let h = P[A] & 7; const n00 = GX[h] * fx + GY[h] * fy;
  h = P[B] & 7; const n10 = GX[h] * (fx - 1) + GY[h] * fy;
  h = P[A + 1] & 7; const n01 = GX[h] * fx + GY[h] * (fy - 1);
  h = P[B + 1] & 7; const n11 = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
  return (a + v * (b - a)) * 1.4142135623730951;
}
function fbm(x, y, P, oct, gain) { let amp = 1, freq = 1, sum = 0, norm = 0; for (let i = 0; i < oct; i++) { sum += amp * perlin(x * freq, y * freq, P); norm += amp; amp *= gain; freq *= 2; } return sum / norm; }
function ramp(r) { if (r >= 1) return 1; if (r <= -1) return -1; const r3 = r * r * r; return (15 / 8) * r - (10 / 8) * r3 + (3 / 8) * r3 * r * r; }

function hookIsland() { const pts = [], N = 128; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; const bay = 1 - 0.55 * Math.exp(-Math.pow((a - 1.55) / 0.55, 2)); const r = (185 + 55 * Math.sin(a * 2 + 0.7) + 22 * Math.sin(a * 5 + 1.9)) * bay; pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); } return pts; }
const POLY = hookIsland();
function pointInPolygon(p, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i]; if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside; } return inside; }
function closestPointOnPolygon(p, poly) { let best = { x: poly[0].x, y: poly[0].y, dist: Infinity }; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i]; const dx = b.x - a.x, dy = b.y - a.y; const len2 = dx * dx + dy * dy; let t = len2 > 1e-12 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0; if (t < 0) t = 0; else if (t > 1) t = 1; const qx = a.x + dx * t, qy = a.y + dy * t; const ddx = p.x - qx, ddy = p.y - qy; const d = Math.sqrt(ddx * ddx + ddy * ddy); if (d < best.dist) best = { x: qx, y: qy, dist: d }; } return best; }
function signedDist(x, y) { const q = closestPointOnPolygon({ x, y }, POLY); return pointInPolygon({ x, y }, POLY) ? -q.dist : q.dist; }
function coastNormal(x, y) { const q = closestPointOnPolygon({ x, y }, POLY); if (q.dist < 1e-9) return null; const inside = pointInPolygon({ x, y }, POLY); const s = inside ? -1 : 1; return { nx: (s * (x - q.x)) / q.dist, ny: (s * (y - q.y)) / q.dist }; }

const P = makeLayer(20260811);
const L = 1 / 700, D0 = 110, OCT = 4, STRENGTH = 900;
const psiExact = (x, y) => fbm(x * L, y * L, P, OCT, 0.5) * STRENGTH * ramp(signedDist(x, y) / D0);
const H = 0.5;
function curlExact(x, y) { return [(psiExact(x, y + H) - psiExact(x, y - H)) / (2 * H), -(psiExact(x + H, y) - psiExact(x - H, y)) / (2 * H)]; }

// ---------- BAKE A: velocity raster (vx, vy) ----------
// ---------- BAKE B: potential raster (psi)    ----------
const EXTENT = 1000, N = 128;                 // 128x128 over [-1000,1000]
const CELL = (2 * EXTENT) / (N - 1);
const bakeVx = new Float32Array(N * N), bakeVy = new Float32Array(N * N);
const bakePsi = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -EXTENT + i * CELL, y = -EXTENT + j * CELL;
    const [vx, vy] = curlExact(x, y);
    bakeVx[j * N + i] = vx; bakeVy[j * N + i] = vy;
    bakePsi[j * N + i] = psiExact(x, y);
  }
}
function cellOf(x, y) {
  const fx = (x + EXTENT) / CELL, fy = (y + EXTENT) / CELL;
  let i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0) i = 0; else if (i > N - 2) i = N - 2;
  if (j < 0) j = 0; else if (j > N - 2) j = N - 2;
  return [i, j, fx - i, fy - j];
}
// A: bilinear velocity
function sampleA(x, y) {
  const [i, j, tx, ty] = cellOf(x, y); const k = j * N + i;
  const ax = bakeVx[k] + (bakeVx[k + 1] - bakeVx[k]) * tx;
  const bx = bakeVx[k + N] + (bakeVx[k + N + 1] - bakeVx[k + N]) * tx;
  const ay = bakeVy[k] + (bakeVy[k + 1] - bakeVy[k]) * tx;
  const by = bakeVy[k + N] + (bakeVy[k + N + 1] - bakeVy[k + N]) * tx;
  return [ax + (bx - ax) * ty, ay + (by - ay) * ty];
}
// B: ANALYTIC curl of the bilinear potential.
// psi(x,y) = p00(1-tx)(1-ty) + p10 tx(1-ty) + p01 (1-tx)ty + p11 tx ty
// dpsi/dx = [ (p10-p00)(1-ty) + (p11-p01) ty ] / CELL   ; dpsi/dy analogous
// v = ( dpsi/dy, -dpsi/dx )  -> exactly divergence-free inside each cell.
function sampleB(x, y) {
  const [i, j, tx, ty] = cellOf(x, y); const k = j * N + i;
  const p00 = bakePsi[k], p10 = bakePsi[k + 1], p01 = bakePsi[k + N], p11 = bakePsi[k + N + 1];
  const dpdx = ((p10 - p00) * (1 - ty) + (p11 - p01) * ty) / CELL;
  const dpdy = ((p01 - p00) * (1 - tx) + (p11 - p10) * tx) / CELL;
  return [dpdy, -dpdx];
}

console.log('\n===== VALIDATION v3 — bake VELOCITY vs bake POTENTIAL =====');
console.log(`   lattice ${N}x${N} over ${2 * EXTENT}u  (cell ${CELL.toFixed(1)}u)\n`);

function divOf(fn, x, y, e) {
  const [vx1] = fn(x + e, y); const [vx0] = fn(x - e, y);
  const [, vy1] = fn(x, y + e); const [, vy0] = fn(x, y - e);
  return Math.abs((vx1 - vx0) / (2 * e) + (vy1 - vy0) / (2 * e));
}
// probe INSIDE cells (avoid cell edges where bilinear derivatives jump)
console.log('1. DIVERGENCE of the SAMPLED field (probed strictly inside cells)');
for (const [name, fn] of [['A  bake velocity (vx,vy)', sampleA], ['B  bake potential (psi) ', sampleB]]) {
  let sum = 0, max = 0, n = 0;
  for (let j = 2; j < N - 3; j += 3) {
    for (let i = 2; i < N - 3; i += 3) {
      const x = -EXTENT + (i + 0.5) * CELL, y = -EXTENT + (j + 0.5) * CELL;
      if (pointInPolygon({ x, y }, POLY)) continue;
      const d = divOf(fn, x, y, CELL * 0.15);
      sum += d; n++; if (d > max) max = d;
    }
  }
  console.log(`   ${name}: mean|div| ${(sum / n).toExponential(2)}   max ${max.toExponential(2)}   (n=${n})`);
}

console.log('\n2. COASTAL TANGENCY of the SAMPLED field (|v.n|/|v| at 2u offshore)');
for (const [name, fn] of [['A  bake velocity', sampleA], ['B  bake potential', sampleB], ['   exact (no bake)', curlExact]]) {
  let sum = 0, n = 0, worst = 0, into = 0;
  for (const a of POLY) {
    // a vertex sits ON the coastline (dist 0), where coastNormal is degenerate;
    // seed the outward direction radially, then take the TRUE normal offshore.
    const rl = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
    const nb = { nx: a.x / rl, ny: a.y / rl };
    const px = a.x + nb.nx * 2, py = a.y + nb.ny * 2;
    if (pointInPolygon({ x: px, y: py }, POLY)) continue;
    const nn = coastNormal(px, py); if (!nn) continue;
    const [vx, vy] = fn(px, py);
    const sp = Math.sqrt(vx * vx + vy * vy); if (sp < 1e-9) continue;
    const dot = (vx * nn.nx + vy * nn.ny) / sp;
    sum += Math.abs(dot); n++; if (Math.abs(dot) > worst) worst = Math.abs(dot);
    if (dot < -0.3) into++;
  }
  console.log(`   ${name.padEnd(18)}: mean ${(sum / n).toFixed(4)}  worst ${worst.toFixed(4)}  shoreward: ${into}/${n}`);
}

console.log('\n3. ACCURACY vs the exact field (speed error, open water)');
for (const [name, fn] of [['A  bake velocity', sampleA], ['B  bake potential', sampleB]]) {
  let err = 0, n = 0, ref = 0;
  for (let j = 2; j < N - 3; j += 3) {
    for (let i = 2; i < N - 3; i += 3) {
      const x = -EXTENT + (i + 0.5) * CELL, y = -EXTENT + (j + 0.5) * CELL;
      if (pointInPolygon({ x, y }, POLY)) continue;
      const [ex, ey] = curlExact(x, y); const [ax, ay] = fn(x, y);
      err += Math.sqrt((ax - ex) ** 2 + (ay - ey) ** 2);
      ref += Math.sqrt(ex * ex + ey * ey); n++;
    }
  }
  console.log(`   ${name}: mean abs err ${(err / n).toFixed(4)} u/s   (${((err / ref) * 100).toFixed(1)}% of mean speed)`);
}

console.log('\n4. MEMORY');
console.log(`   A  bake velocity : 2 x Float32 x ${N}x${N} = ${((N * N * 8) / 1024).toFixed(0)} KB`);
console.log(`   B  bake potential: 1 x Float32 x ${N}x${N} = ${((N * N * 4) / 1024).toFixed(0)} KB   (HALF)`);

console.log('\n5. PER-SAMPLE COST');
function bench(name, fn, iters) {
  for (let i = 0; i < 100000; i++) fn(((i * 7) % 1900) - 950, ((i * 13) % 1900) - 950);
  let acc = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) acc += fn(((i * 7) % 1900) - 950, ((i * 13) % 1900) - 950)[0];
  const t1 = process.hrtime.bigint();
  console.log(`   ${name.padEnd(20)} ${(Number(t1 - t0) / iters).toFixed(2).padStart(7)} ns/sample  (sink ${acc.toFixed(1)})`);
}
bench('A  bake velocity', sampleA, 2_000_000);
bench('B  bake potential', sampleB, 2_000_000);
bench('   exact analytic', curlExact, 200_000);
console.log('');
