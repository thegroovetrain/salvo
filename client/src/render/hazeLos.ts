// THE HAZE'S ISLAND LINE OF SIGHT (Story 9.3 session 6) — the pure ray cast
// behind the halo mask render/countermeasure.ts hangs on the `cloud` layer.
// No Pixi, no canvas: own position + islands in, one hit distance per bearing
// out.
//
// WHY (Eric 2026-10-12, on 0.18.43): *"Yes, if I can't see it because of an
// island or any other sight block, don't render it."* The countermeasure's
// grey haze is a SMOKE EFFECT, seen by eye only inside the 5/8 halo
// (render/hazeHalo.ts) AND only where the viewer has island line of sight —
// wounded smoke's own rule (the server sends a plume only with island LOS
// clear). Islands are the only sight blockers in the game today.
//
// THE CAST: `CLIENT_CONFIG.countermeasure.losRays` evenly spaced bearings
// (ray k at k·2π/N, world axes — the mask sprite is unrotated in world space)
// from the own hull out to `reachU` (halo + feather). Each ray's distance is
// the nearest island ENTRY along it (shared `islandSegHit`, the one island
// seam — never a second polygon test), or `reachU` where nothing blocks.
//
// THE PREFILTER: an island is a candidate only when its bounding circle comes
// within `reachU` of the hull; and a candidate is only tested on the rays
// inside the cone its bounding circle subtends (± asin(r/d)), widened by one
// ray each side so float rounding at the cone's edge can never drop a ray that
// enters it (`islandSegHit`'s own bounding-circle broadphase rejects the
// extras). A hull inside a bounding circle tests every ray.
//
// GROUNDED (the hull centre inside an island polygon — collision pushes hulls
// off coasts, so this should not happen): FAIL OPEN, every ray unblocked — the
// radar dim's "show rather than hide" rule.

import { islandSegHit, pointInIsland, type Island, type Vec2 } from '@salvo/shared';

const TAU = Math.PI * 2;

/** One own-hull cast: N bearings, preallocated, reused every call. */
export class HazeLosCaster {
  /** Hit distance (u) per bearing — `reachU` where nothing blocks. */
  readonly rays: Float32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly step: number;
  private readonly a: Vec2 = { x: 0, y: 0 };
  private readonly b: Vec2 = { x: 0, y: 0 };
  /** The candidate islands of the last cast (reused; test seam). */
  readonly candidates: Island[] = [];

  constructor(readonly count: number) {
    this.rays = new Float32Array(count);
    this.cos = new Float64Array(count);
    this.sin = new Float64Array(count);
    this.step = TAU / count;
    for (let k = 0; k < count; k++) {
      this.cos[k] = Math.cos(k * this.step);
      this.sin[k] = Math.sin(k * this.step);
    }
  }

  /** Cast from (ox, oy) out to `reachU` against `islands`; fills `rays`.
   *  Returns false when the hull is grounded (every ray left unblocked). */
  cast(ox: number, oy: number, reachU: number, islands: readonly Island[]): boolean {
    this.rays.fill(reachU);
    this.a.x = ox;
    this.a.y = oy;
    if (!this.gather(reachU, islands)) return false;
    // NEAREST FIRST, so the nearer islands' shadows shorten the later rays.
    this.candidates.sort(this.byNearEdge);
    for (const isle of this.candidates) this.castIsland(isle);
    return true;
  }

  /** Order by bounding-circle near edge from the hull (a bound closure, made
   *  once — no per-cast allocation). */
  private readonly byNearEdge = (p: Island, q: Island): number =>
    Math.hypot(p.x - this.a.x, p.y - this.a.y) - p.r - (Math.hypot(q.x - this.a.x, q.y - this.a.y) - q.r);

  /** Collect the islands whose bounding circle the reach can touch; false if
   *  the hull stands inside one's polygon (grounded → fail open). */
  private gather(reachU: number, islands: readonly Island[]): boolean {
    this.candidates.length = 0;
    for (const isle of islands) {
      if (Math.hypot(isle.x - this.a.x, isle.y - this.a.y) - isle.r > reachU) continue;
      if (pointInIsland(this.a, isle)) {
        this.candidates.length = 0;
        return false;
      }
      this.candidates.push(isle);
    }
    return true;
  }

  /** Test one island on every ray inside its bounding cone (± one ray). */
  private castIsland(isle: Island): void {
    const n = this.count;
    const d = Math.hypot(isle.x - this.a.x, isle.y - this.a.y);
    if (d <= isle.r) {
      for (let k = 0; k < n; k++) this.castRay(k, isle);
      return;
    }
    const centre = Math.atan2(isle.y - this.a.y, isle.x - this.a.x);
    const half = Math.asin(isle.r / d);
    const k0 = Math.floor((centre - half) / this.step) - 1;
    const k1 = Math.min(Math.ceil((centre + half) / this.step) + 1, k0 + n - 1);
    for (let j = k0; j <= k1; j++) this.castRay(((j % n) + n) % n, isle);
  }

  /** Shorten ray k to this island's entry, if it enters nearer. The segment
   *  runs only to the ray's CURRENT end, so an island behind a nearer one's
   *  shadow is rejected by `islandSegHit`'s bounding-circle broadphase. */
  private castRay(k: number, isle: Island): void {
    const len = this.rays[k];
    this.b.x = this.a.x + this.cos[k] * len;
    this.b.y = this.a.y + this.sin[k] * len;
    const t = islandSegHit(this.a, this.b, isle);
    if (t !== null) this.rays[k] = t * len;
  }
}
