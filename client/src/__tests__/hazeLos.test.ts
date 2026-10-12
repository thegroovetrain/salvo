// THE HAZE HALO SEES PAST NO ISLAND (Story 9.3 session 6, Eric 2026-10-12:
// "Yes, if I can't see it because of an island or any other sight block, don't
// render it."). Contracts of the pure ray cast (render/hazeLos.ts) and of the
// real bake drawing the halo gradient through its fan (render/textures.ts),
// sampled off a recording 2d context the way countermeasure.test.ts samples
// the plain halo — jsdom cannot rasterize.

import { describe, it, expect } from 'vitest';
import { CanvasSource, Texture } from 'pixi.js';
import { islandSegHit, mulberry32, type Island, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { BASE_HAZE_HALO_U, haloSpanU } from '../render/hazeHalo.js';
import { HazeLosCaster } from '../render/hazeLos.js';
import { HALO_MASK_TEXTURE_SIZE, bakeHaloMaskTexture } from '../render/textures.js';

const N = CLIENT_CONFIG.countermeasure.losRays;
const H = BASE_HAZE_HALO_U;
const F = CLIENT_CONFIG.countermeasure.haloFeatherU;
const REACH = H + F;
const SIZE = HALO_MASK_TEXTURE_SIZE;

/** An Island from a polygon: bounding circle about the vertex centroid unless
 *  a wider (still conservative) `r` is given. */
function island(poly: Vec2[], r?: number, centre?: Vec2): Island {
  const cx = centre?.x ?? poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = centre?.y ?? poly.reduce((s, p) => s + p.y, 0) / poly.length;
  const rMin = Math.max(...poly.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  return { x: cx, y: cy, r: Math.max(r ?? 0, rMin), poly, pole: { x: cx, y: cy }, core: 1, contours: [] };
}

/** An axis-aligned CCW box island. */
const box = (x0: number, y0: number, x1: number, y1: number): Island =>
  island([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);

/** The island squarely east of the hull, its near edge at x = 200. */
const EAST = box(200, -20, 240, 20);

describe('the ray cast: one island-entry distance per bearing', () => {
  it('no islands → every ray runs the full reach (halo + feather)', () => {
    const c = new HazeLosCaster(N);
    expect(c.cast(0, 0, REACH, [])).toBe(true);
    expect([...c.rays].every((r) => r === Math.fround(REACH))).toBe(true);
  });

  it('an island stops the rays it covers at its NEAR edge, and only those', () => {
    const c = new HazeLosCaster(N);
    c.cast(0, 0, REACH, [EAST]);
    expect(c.rays[0], 'bearing 0 enters at x = 200').toBeCloseTo(200, 3);
    expect(c.rays[N / 2], 'the opposite bearing is clear').toBe(Math.fround(REACH));
    expect(c.rays[N / 4], 'a perpendicular bearing is clear').toBe(Math.fround(REACH));
  });

  it('an island beyond the reach is not even a candidate and changes nothing', () => {
    const c = new HazeLosCaster(N);
    c.cast(0, 0, REACH, [box(REACH + 40, -20, REACH + 80, 20)]);
    expect(c.candidates).toHaveLength(0);
    expect([...c.rays].every((r) => r === Math.fround(REACH))).toBe(true);
  });

  it('a ray that crosses the bounding circle but misses the polygon is unblocked', () => {
    // A 20 u box at x = 300 behind a deliberately wide 60 u bounding circle:
    // the 6° ray passes 31 u from the centre — inside the circle, clear of the box.
    const c = new HazeLosCaster(N);
    const isle = island(
      [{ x: 290, y: -10 }, { x: 310, y: -10 }, { x: 310, y: 10 }, { x: 290, y: 10 }],
      60,
      { x: 300, y: 0 },
    );
    c.cast(0, 0, REACH, [isle]);
    const k = Math.round((6 / 360) * N);
    expect(300 * Math.sin((k / N) * Math.PI * 2)).toBeLessThan(isle.r);
    expect(c.rays[k]).toBe(Math.fround(REACH));
    expect(c.rays[0], 'while the bearing through the box is cut').toBeCloseTo(290, 3);
  });

  it('a hull standing inside an island polygon FAILS OPEN: no shadows at all', () => {
    const c = new HazeLosCaster(N);
    expect(c.cast(0, 0, REACH, [box(-10, -10, 10, 10), EAST])).toBe(false);
    expect([...c.rays].every((r) => r === Math.fround(REACH))).toBe(true);
  });

  it('the prefilter never drops an island a ray can enter (property: vs brute force over every island)', () => {
    const rng = mulberry32(42).next;
    const c = new HazeLosCaster(N);
    const end: Vec2 = { x: 0, y: 0 };
    for (let trial = 0; trial < 40; trial++) {
      const isles: Island[] = [];
      for (let m = 0; m < 6; m++) {
        // a random star polygon (concave allowed), centred anywhere near the reach
        const cx = (rng() * 2 - 1) * (REACH + 100);
        const cy = (rng() * 2 - 1) * (REACH + 100);
        const n = 5 + Math.floor(rng() * 8);
        const poly: Vec2[] = [];
        for (let v = 0; v < n; v++) {
          const t = (v / n) * Math.PI * 2;
          const rr = 15 + rng() * 120;
          poly.push({ x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr });
        }
        isles.push(island(poly));
      }
      const o = { x: (rng() * 2 - 1) * 50, y: (rng() * 2 - 1) * 50 };
      if (!c.cast(o.x, o.y, REACH, isles)) continue; // grounded draw: covered above
      for (let k = 0; k < N; k++) {
        const th = (k / N) * Math.PI * 2;
        end.x = o.x + Math.cos(th) * REACH;
        end.y = o.y + Math.sin(th) * REACH;
        let brute = REACH;
        for (const isle of isles) {
          const t = islandSegHit(o, end, isle);
          if (t !== null) brute = Math.min(brute, t * REACH);
        }
        expect(Math.abs(c.rays[k] - brute), `trial ${trial} ray ${k}`).toBeLessThan(1e-3);
      }
    }
  });
});

/** A 2d-context stand-in recording the halo draw: the gradient radii and stops
 *  and the filled path (arc or fan vertices). */
function recording(): {
  canvas: unknown;
  grad: number[] | null;
  stops: Array<[number, string]>;
  arcR: number | null;
  fan: Array<[number, number]>;
  closed: boolean;
} {
  const rec = {
    grad: null as number[] | null,
    stops: [] as Array<[number, string]>,
    arcR: null as number | null,
    fan: [] as Array<[number, number]>,
    closed: false,
  };
  const ctx = {
    fillStyle: '' as string | object,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    setTransform: (): void => {},
    fillRect: (): void => {},
    createRadialGradient: (...a: number[]): { addColorStop: (o: number, c: string) => void } => {
      rec.grad = a;
      return { addColorStop: (o: number, c: string): void => void rec.stops.push([o, c]) };
    },
    beginPath: (): void => {
      rec.fan = [];
      rec.arcR = null;
      rec.closed = false;
    },
    arc: (_x: number, _y: number, r: number): void => {
      rec.arcR = r;
    },
    moveTo: (x: number, y: number): void => void rec.fan.push([x, y]),
    lineTo: (x: number, y: number): void => void rec.fan.push([x, y]),
    closePath: (): void => {
      rec.closed = true;
    },
    fill: (): void => {},
  };
  const canvas = { width: SIZE, height: SIZE, getContext: (): unknown => ctx };
  return Object.assign(rec, { canvas });
}

/** Bake into a recording canvas; return the recorder. */
function bake(rays: Float32Array | null): ReturnType<typeof recording> {
  const rec = recording();
  const source = new CanvasSource({ resource: rec.canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
  expect(bakeHaloMaskTexture(H, new Texture({ source }), rays)).toBeDefined();
  return rec;
}

/** Even-odd point-in-polygon over texture px. */
function inside(fan: Array<[number, number]>, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = fan.length - 1; i < fan.length; j = i++) {
    const [xi, yi] = fan[i];
    const [xj, yj] = fan[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The drawn mask (0..1) at world offset (dx, dy) from the hull: the gradient
 *  (red channel of its two stops, linear r0 → r1) where the path covers it,
 *  black elsewhere. */
function maskAt(rec: ReturnType<typeof recording>, dx: number, dy: number): number {
  const c = SIZE / 2;
  const px = c / haloSpanU(H);
  const x = c + dx * px;
  const y = c + dy * px;
  const r = Math.hypot(x - c, y - c);
  const covered = rec.arcR !== null ? r <= rec.arcR : inside(rec.fan, x, y);
  if (!covered) return 0;
  const [, , r0, , , r1] = rec.grad!;
  const red = (i: number): number => Number(/\d+/.exec(rec.stops[i][1])![0]) / 255;
  if (r <= r0) return red(0);
  if (r >= r1) return red(1);
  return red(0) + ((r - r0) / (r1 - r0)) * (red(1) - red(0));
}

describe('the bake fills the halo gradient through the line-of-sight fan', () => {
  const cast = (isles: Island[]): Float32Array => {
    const c = new HazeLosCaster(N);
    c.cast(0, 0, REACH, isles);
    return c.rays;
  };

  it('with no islands the mask is the 0.18.43 profile: opaque centre and just inside haloU, 0 past haloU + feather', () => {
    for (const rec of [bake(null), bake(cast([]))]) {
      expect(maskAt(rec, 0, 0)).toBe(1);
      expect(maskAt(rec, H - 1, 0)).toBe(1);
      expect(maskAt(rec, 0, -(H - 1))).toBe(1);
      expect(maskAt(rec, H + F + 1, 0)).toBe(0);
      expect(maskAt(rec, -(H + F + 1), 0)).toBe(0);
    }
    expect(bake(cast([])).closed, 'the fan is one closed path').toBe(true);
    expect(bake(cast([])).fan).toHaveLength(N);
  });

  it('an island between the hull and a point inside the halo hides it; the same distance on a clear bearing still shows', () => {
    const rec = bake(cast([EAST]));
    expect(maskAt(rec, 300, 0), 'behind the island').toBe(0);
    expect(maskAt(rec, 0, 300), 'same range, clear bearing').toBe(1);
    expect(maskAt(rec, -300, 0)).toBe(1);
  });

  it('the shadow starts at the island NEAR edge: opaque just before the entry, 0 just after', () => {
    const rec = bake(cast([EAST]));
    expect(maskAt(rec, 196, 0)).toBe(1);
    expect(maskAt(rec, 204, 0)).toBe(0);
  });

  it('an island beyond the halo changes nothing', () => {
    const plain = bake(cast([]));
    const far = bake(cast([box(REACH + 40, -20, REACH + 80, 20)]));
    expect(far.fan).toEqual(plain.fan);
  });

  it('the feather and the 5/8 edge are unchanged on unblocked bearings (same gradient radii and stops)', () => {
    const plain = bake(null);
    const cut = bake(cast([EAST]));
    expect(cut.grad).toEqual(plain.grad);
    expect(cut.stops).toEqual(plain.stops);
  });
});
