// MULTI-SPECTRAL COUNTERMEASURE clouds on the client (Story 9.3; "smoke is
// paint", Eric 2026-10-12): the server hides nothing behind a cloud, and the
// client paints each held cloud as a smoke-brush bitmap — render/cloudPaint.ts
// (the pure field: soft overlapping puffs of many sizes and greys) under
// render/countermeasure.ts (one Sprite per cloud on the `cloud` chart layer;
// the radar reads its haze as a return source — radarCloudReturns.test.ts).
// Contracts only: no literal alpha, no pixel pins.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasSource, Container, Texture, TextureSource, updateRenderGroupTransforms } from 'pixi.js';
import { CONFIG, cloudOutlineRadius, mulberry32, wrapPositive, type CloudView, type Island } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Countermeasure } from '../render/countermeasure.js';
import { Camera } from '../render/camera.js';
import {
  CLOUD_CELLS,
  FADED_ALPHA,
  RNG_PER_PUFF,
  advanceField,
  cellOffsetU,
  decayField,
  fieldToRgba,
  makeField,
  samplePuff,
  stampPuff,
  stepField,
  type CloudField,
} from '../render/cloudPaint.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';
import { BASE_HAZE_HALO_U, haloAlphaAt, haloSpanU, hazeHaloU } from '../render/hazeHalo.js';
// Re-exported through the mock's `...actual` spread, so this is the real constant.
import { HALO_MASK_TEXTURE_SIZE } from '../render/textures.js';

// jsdom has no 2d canvas, so the halo bake is stubbed the way the radar suites
// stub the dim bake — MIRRORING the real reuse contract (a live texture is
// redrawn in place and handed back; only a bare call mints) and recording each
// call. The last suite drops the stub and pins the real draw.
const haloBakes = vi.hoisted(() => ({
  calls: [] as Array<{ haloU: number; into: unknown }>,
  /** The island-shadow rays each bake drew (null = the plain disc), copied. */
  rays: [] as Array<number[] | null>,
}));

vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeHaloMaskTexture: (haloU: number, into?: Texture | null, rays?: Float32Array | null): Texture => {
      haloBakes.calls.push({ haloU, into });
      haloBakes.rays.push(rays ? [...rays] : null);
      // The real bake's SIZE (no pixels): the mask's world bounds are then the
      // halo's, which the screen-clip test below measures.
      const size = actual.HALO_MASK_TEXTURE_SIZE;
      return into ?? new Texture({ source: new TextureSource({ width: size, height: size }) });
    },
  };
});

const LIFE = CONFIG.countermeasure.lifeMs;
const K = CLIENT_CONFIG.countermeasure;
const MAX = Math.fround(K.maxAlpha); // float32 storage
const cloud = (id: string, t0 = 0, x = 0, y = 0): CloudView => ({ id, x, y, t0 });

/** A seeded RNG so a test's brush is reproducible. */
const seeded = (seed = 1): (() => number) => mulberry32(seed).next;

const total = (f: CloudField): number => f.alpha.reduce((s, v) => s + v, 0);

/** Run `ms` of frames at `frameMs` against a renderer, from `from`. */
function play(cm: Countermeasure, from: number, ms: number, frameMs = 16): number {
  let t = from;
  for (; t < from + ms; t += frameMs) cm.render(t);
  return t;
}

/** Mean alpha of the cells whose centre lies in the annulus [r0, r1) u. */
function annulusMean(f: CloudField, r0: number, r1: number): number {
  let sum = 0;
  let n = 0;
  for (let j = 0; j < CLOUD_CELLS; j++) {
    for (let i = 0; i < CLOUD_CELLS; i++) {
      const d = Math.hypot(cellOffsetU(i), cellOffsetU(j));
      if (d < r0 || d >= r1) continue;
      sum += f.alpha[j * CLOUD_CELLS + i];
      n++;
    }
  }
  return sum / n;
}

describe('one bitmap per held cloud, on the `cloud` layer', () => {
  it('a held cloud gets one LINEAR-scaled Sprite with a square CLOUD_CELLS texture, one texel per cellU, at the cloud centre', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, seeded());
    cm.sync([cloud('c1', 0, 300, -120)]);
    const s = cm.spriteOf('c1')!;
    expect(layer.children, 'the halo mask leads, then the cloud body').toEqual([cm.haloMask, cm.cloudBody]);
    expect(cm.cloudBody.children).toEqual([s]);
    expect(s.texture.source.width).toBe(CLOUD_CELLS);
    expect(s.texture.source.height).toBe(CLOUD_CELLS);
    expect(s.texture.source.scaleMode).toBe('linear');
    expect(CLOUD_CELLS * K.cellU).toBeGreaterThanOrEqual(2 * (CONFIG.countermeasure.r1 + K.puffMaxU));
    expect(s.scale.x).toBe(K.cellU);
    expect(s.tint).toBe(CLIENT_CONFIG.colors.countermeasureSmoke);
    expect([s.x, s.y]).toEqual([300, -120]);
    expect(cm.fieldOf('c1')!.alpha).toHaveLength(CLOUD_CELLS * CLOUD_CELLS);
  });

  it('sync only ADDS: a held id is never respawned and an id absent from the next list is still held', () => {
    const cm = new Countermeasure(new Container(), seeded());
    cm.sync([cloud('a'), cloud('b')]);
    const first = cm.spriteOf('a');
    cm.sync([cloud('a'), cloud('b'), cloud('c')]);
    expect(cm.spriteOf('a')).toBe(first);
    cm.sync([]);
    expect(cm.size).toBe(3);
  });

  it('main.ts constructs it on stage.layers.cloud and puts the own hull on ownShip', () => {
    // main.ts boots the app at module load, so the construction site is a source scan.
    const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
    expect(main).toContain('new Countermeasure(stage.layers.cloud)');
    expect(main, 'the radar reads the clouds as a return source').toContain('radar.setCloudSource(countermeasure)');
    expect(main).toContain('stage.layers.ownShip.addChild(ownView.gfx)');
    expect(main, 'the halo follows the live intel range, beside radar.setRanges')
      .toContain('g.countermeasure.setHaloU(hazeHaloU(stats.radarRange))');
    expect(main, 'the alive path centres the halo on the own pose, clipped to the screen')
      .toContain('g.countermeasure.render(now, pose, g.camera.screenWorldRect)');
    expect(main, 'the halo sees past no island: the map\'s islands, beside the radar\'s wake sources')
      .toContain('g.countermeasure.setIslands(g.islands)');
  });
});

describe('the haze is seen by eye only inside the 5/8 halo (Eric 2026-10-12)', () => {
  const OWN = { x: 120, y: -340 };
  const fresh = (): { cm: Countermeasure; layer: Container } => {
    haloBakes.calls.length = 0;
    haloBakes.rays.length = 0;
    const layer = new Container();
    return { cm: new Countermeasure(layer, seeded()), layer };
  };

  it('the halo radius is the wounded-smoke rung: radarRange × muzzleFlashFactor, starting at the base intel range', () => {
    expect(hazeHaloU(CONFIG.vision.radar)).toBe(CONFIG.vision.muzzleFlash);
    expect(BASE_HAZE_HALO_U).toBe(CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor);
    const { cm } = fresh();
    expect(cm.haloU).toBe(BASE_HAZE_HALO_U);
    expect(haloBakes.calls).toEqual([{ haloU: BASE_HAZE_HALO_U, into: undefined }]);
  });

  it('with an own pose, the cloud layer is masked by the halo sprite, centred on the own hull', () => {
    const { cm, layer } = fresh();
    cm.sync([cloud('c1', 0, 900, 900)]);
    cm.render(100, OWN);
    expect(layer.mask).toBe(cm.haloMask);
    expect([cm.haloMask.x, cm.haloMask.y]).toEqual([OWN.x, OWN.y]);
    expect(cm.haloMask.renderable, 'a mask, never painted').toBe(false);
    cm.render(116, { x: 5, y: 6 });
    expect([cm.haloMask.x, cm.haloMask.y], 'it follows the hull').toEqual([5, 6]);
  });

  // THE PERF GATE (Story 9.8): a masked layer is a full filter pass every frame
  // in Pixi, sized to the HALO (2264 px at DPR 2 on the twelfths ladder) and
  // not to the screen — so an alive captain with no haze must run none.
  it('holds NO mask while no cloud is held — 600 alive frames run no mask pass', () => {
    const { cm, layer } = fresh();
    for (let f = 0; f < 600; f += 1) {
      cm.render(f * 16, OWN);
      expect(layer.mask ?? null, `frame ${f}`).toBeNull();
    }
    cm.sync([cloud('c1', 0, 900, 900)]);
    cm.render(600 * 16, OWN);
    expect(layer.mask, 'a held cloud is masked at once').toBe(cm.haloMask);
    cm.clear();
    cm.render(601 * 16, OWN);
    expect(layer.mask ?? null, 'the last cloud gone, the pass goes with it').toBeNull();
  });

  // THE PASS IS CLIPPED TO THE SCREEN (Story 9.8 perf gate). Pixi's mask filter
  // opts out of viewport clipping, so with a cloud held the masked layer's
  // pass was (clouds ∩ halo) — up to the 750 u halo's full size at the close
  // framing. Its bounds must sit inside the screen's world rect at every
  // framing; the mask (fan + feather) itself is unchanged.
  it.each([
    ['close', CLIENT_CONFIG.zoom.closeSpanU],
    ['default', CLIENT_CONFIG.zoom.defaultSpanU],
  ])('with a cloud held, the masked pass stays inside the screen at the %s framing', (_name, spanU) => {
    const root = new Container({ isRenderGroup: true });
    const { cm, layer } = fresh();
    root.addChild(layer);
    // Clouds above, on and below the hull: their union spans the whole halo.
    const reach = haloSpanU(cm.haloU);
    cm.sync([cloud('n', 0, OWN.x, OWN.y - reach), cloud('c', 0, OWN.x, OWN.y), cloud('s', 0, OWN.x, OWN.y + reach)]);
    const cam = new Camera({
      defaultSpanU: CLIENT_CONFIG.zoom.defaultSpanU,
      closeSpanU: CLIENT_CONFIG.zoom.closeSpanU,
      ringFitMargin: CLIENT_CONFIG.reveal.mapFitMargin,
      followRate: 5,
      leadSeconds: 4,
      leadMax: 110,
    });
    cam.setViewport(1600, 900);
    cam.setRing(0, 0, 100_000);
    cam.setUserZoom(CLIENT_CONFIG.zoom.defaultSpanU / spanU);
    cam.snapTo(OWN);
    const screen = cam.screenWorldRect;
    expect(screen.h).toBeCloseTo(spanU, 6);
    // Unclipped, the pass would be the halo's height — taller than the screen.
    expect(2 * reach).toBeGreaterThan(screen.h);
    cm.render(16, OWN, screen);
    expect(layer.mask).toBe(cm.haloMask);
    // The renderer refreshes transforms each frame; headless, do it here so the
    // bounds read the halo where render() just put it.
    updateRenderGroupTransforms(root.renderGroup!, true);
    const b = layer.getFastGlobalBounds(true);
    const eps = 1e-6;
    expect(b.minX).toBeGreaterThanOrEqual(screen.x - eps);
    expect(b.minY).toBeGreaterThanOrEqual(screen.y - eps);
    expect(b.maxX).toBeLessThanOrEqual(screen.x + screen.w + eps);
    expect(b.maxY).toBeLessThanOrEqual(screen.y + screen.h + eps);
    expect(b.height, 'it is the screen, not a sliver').toBeCloseTo(screen.h, 6);
    // ...and the clip comes off with the mask.
    cm.clear();
    cm.render(32, OWN, screen);
    expect(cm.cloudBody.boundsArea ?? null).toBeNull();
  });

  it('the mask sprite covers the halo plus its feather, at one texel = 2·span/size world units', () => {
    const { cm } = fresh();
    const span = haloSpanU(cm.haloU);
    expect(span).toBeGreaterThanOrEqual(cm.haloU + K.haloFeatherU);
    expect(cm.haloMask.scale.x).toBeCloseTo((2 * span) / HALO_MASK_TEXTURE_SIZE, 9);
  });

  it('no own pose (a spectator) → no mask: the haze shows everywhere; a non-finite pose likewise', () => {
    const { cm, layer } = fresh();
    cm.render(100, OWN);
    cm.render(116, null);
    expect(layer.mask ?? null).toBeNull();
    cm.render(132);
    expect(layer.mask ?? null).toBeNull();
    cm.render(148, { x: Number.NaN, y: 0 });
    expect(layer.mask ?? null).toBeNull();
  });

  it('setHaloU re-bakes IN PLACE only on a real change; the texture is never swapped or destroyed', () => {
    const { cm } = fresh();
    const tex = cm.haloMask.texture;
    cm.setHaloU(cm.haloU);
    cm.setHaloU(Number.NaN);
    cm.setHaloU(0);
    expect(haloBakes.calls, 'no-change / degenerate values cost nothing').toHaveLength(1);
    const wider = hazeHaloU(CONFIG.vision.radar * 1.2);
    cm.setHaloU(wider);
    expect(haloBakes.calls.at(-1)).toEqual({ haloU: wider, into: tex });
    expect(cm.haloMask.texture).toBe(tex);
    expect(tex.source.destroyed).toBe(false);
    cm.setHaloU(wider);
    expect(haloBakes.calls).toHaveLength(2);
  });

  it('a radar-range rise widens the opaque disc and the sprite with it', () => {
    const { cm } = fresh();
    const before = cm.haloMask.scale.x;
    const wider = hazeHaloU(CONFIG.vision.radar * 1.2);
    cm.setHaloU(wider);
    expect(cm.haloU).toBe(wider);
    expect(cm.haloMask.scale.x).toBeGreaterThan(before);
    // water just inside the new halo but past the old feather: hidden before, seen now
    const d = wider - 1;
    expect(d).toBeGreaterThan(BASE_HAZE_HALO_U + K.haloFeatherU);
    expect(haloAlphaAt(d, BASE_HAZE_HALO_U), 'hidden at the base range').toBe(0);
    expect(haloAlphaAt(d, cm.haloU), 'seen after the rise').toBe(1);
  });

  describe('the halo sees past no island (session 6, Eric 2026-10-12)', () => {
    // A box island due east of OWN, its near edge 200 u away.
    const EAST: Island = {
      x: OWN.x + 220, y: OWN.y, r: Math.hypot(20, 20), pole: { x: OWN.x + 220, y: OWN.y }, core: 1, contours: [],
      poly: [
        { x: OWN.x + 200, y: OWN.y - 20 }, { x: OWN.x + 240, y: OWN.y - 20 },
        { x: OWN.x + 240, y: OWN.y + 20 }, { x: OWN.x + 200, y: OWN.y + 20 },
      ],
    };
    const reach = (cm: Countermeasure): number => Math.fround(cm.haloU + K.haloFeatherU);

    it('with islands set, a posed render re-bakes the mask IN PLACE through the cast rays, cut at the island', () => {
      const { cm } = fresh();
      const tex = cm.haloMask.texture;
      cm.sync([cloud('c1')]);
      cm.setIslands([EAST]);
      cm.render(0, OWN);
      const rays = haloBakes.rays.at(-1)!;
      expect(rays).toHaveLength(K.losRays);
      expect(rays[0], 'bearing 0 stops at the near edge').toBeCloseTo(200, 3);
      expect(rays[K.losRays / 2], 'the far side runs the full reach').toBe(reach(cm));
      expect(haloBakes.calls.at(-1)).toEqual({ haloU: cm.haloU, into: tex });
      expect(cm.haloMask.texture).toBe(tex);
    });

    it('re-casts only after a move of losRecastMoveU, or a halo change', () => {
      const { cm } = fresh();
      cm.sync([cloud('c1')]);
      cm.setIslands([EAST]);
      cm.render(0, OWN);
      const n = haloBakes.calls.length;
      cm.render(16, { x: OWN.x + K.losRecastMoveU * 0.9, y: OWN.y });
      expect(haloBakes.calls, 'a small move costs nothing').toHaveLength(n);
      cm.render(32, { x: OWN.x + K.losRecastMoveU, y: OWN.y });
      expect(haloBakes.calls).toHaveLength(n + 1);
      cm.setHaloU(hazeHaloU(CONFIG.vision.radar * 1.2));
      cm.render(48, { x: OWN.x + K.losRecastMoveU, y: OWN.y });
      expect(haloBakes.rays.at(-1)![K.losRays / 2], 'the new reach').toBe(reach(cm));
    });

    it('no held cloud → no cast on a posed render, even after moving', () => {
      const { cm } = fresh();
      cm.setIslands([EAST]);
      const n = haloBakes.calls.length;
      cm.render(0, OWN);
      cm.render(16, { x: OWN.x + 50, y: OWN.y + 50 });
      expect(haloBakes.calls, 'the mask masks nothing, so no work').toHaveLength(n);
    });

    it('the first cloud held forces a cast that frame, whatever the move threshold', () => {
      const { cm } = fresh();
      cm.sync([cloud('c1')]);
      cm.setIslands([EAST]);
      cm.render(0, OWN); // cast from OWN
      cm.clear();
      cm.render(16, OWN); // no cloud: nothing
      const n = haloBakes.calls.length;
      cm.sync([cloud('c2', 16)]);
      cm.render(32, OWN); // same spot — under the threshold, yet a cloud just appeared
      expect(haloBakes.calls).toHaveLength(n + 1);
      expect(haloBakes.rays.at(-1)![0]).toBeCloseTo(200, 3);
    });

    it('no pose casts nothing; setIslands([]) restores the plain disc', () => {
      const { cm, layer } = fresh();
      cm.sync([cloud('c1')]);
      cm.setIslands([EAST]);
      cm.render(0, null);
      expect(layer.mask, "no pose, no mask").toBeFalsy();
      expect(haloBakes.rays.every((r) => r === null), 'no pose, no cast').toBe(true);
      cm.render(16, OWN);
      expect(haloBakes.rays.at(-1)).not.toBeNull();
      cm.setIslands([]);
      expect(haloBakes.rays.at(-1), 'the plain disc, at once').toBeNull();
      const n = haloBakes.calls.length;
      cm.render(32, { x: OWN.x + 50, y: OWN.y });
      expect(haloBakes.calls, 'no islands, no casting').toHaveLength(n);
    });
  });

  it('clear() leaves the mask on the layer', () => {
    const { cm, layer } = fresh();
    cm.sync([cloud('c1')]);
    cm.render(100, OWN);
    cm.clear();
    expect(layer.children).toEqual([cm.haloMask, cm.cloudBody]);
    expect(cm.cloudBody.children).toEqual([]);
    expect(cm.haloMask.destroyed).toBe(false);
  });
});

describe('the halo profile: opaque inside, a monotone feather, nothing beyond', () => {
  const H = BASE_HAZE_HALO_U;
  const F = K.haloFeatherU;

  it('is opaque at the centre and just inside the halo, zero at and beyond halo + feather', () => {
    expect(haloAlphaAt(0, H)).toBe(1);
    expect(haloAlphaAt(H - 0.5, H)).toBe(1);
    expect(haloAlphaAt(H, H)).toBe(1);
    expect(haloAlphaAt(H + F, H)).toBe(0);
    expect(haloAlphaAt(H + F + 1, H)).toBe(0);
    expect(haloAlphaAt(10 * H, H)).toBe(0);
  });

  it('falls monotonically across the feather, strictly inside it', () => {
    let prev = 1;
    for (let d = H + 1; d < H + F; d += 1) {
      const a = haloAlphaAt(d, H);
      expect(a).toBeLessThan(prev);
      expect(a).toBeGreaterThan(0);
      prev = a;
    }
  });

  describe('the real bake draws that profile', () => {
    const actual = async (): Promise<typeof import('../render/textures.js')> =>
      vi.importActual<typeof import('../render/textures.js')>('../render/textures.js');
    const SIZE = HALO_MASK_TEXTURE_SIZE;

    /** A 2d-context stand-in recording the draw (jsdom cannot rasterize). */
    const recording = (): {
      canvas: unknown;
      rect: number[] | null;
      rectStyle: string;
      grad: number[] | null;
      stops: Array<[number, string]>;
      arcR: number | null;
    } => {
      const rec = {
        rect: null as number[] | null,
        rectStyle: '',
        grad: null as number[] | null,
        stops: [] as Array<[number, string]>,
        arcR: null as number | null,
      };
      const ctx = {
        fillStyle: '' as string | object,
        globalAlpha: 0.5,
        globalCompositeOperation: 'destination-out',
        setTransform: (): void => {},
        fillRect: (x: number, y: number, w: number, h: number): void => {
          rec.rect = [x, y, w, h];
          rec.rectStyle = String(ctx.fillStyle);
        },
        createRadialGradient: (...a: number[]): { addColorStop: (o: number, c: string) => void } => {
          rec.grad = a;
          return { addColorStop: (o: number, c: string): void => void rec.stops.push([o, c]) };
        },
        beginPath: (): void => {},
        arc: (_x: number, _y: number, r: number): void => {
          rec.arcR = r;
        },
        fill: (): void => {},
      };
      const canvas = { width: SIZE, height: SIZE, getContext: (): unknown => ctx };
      return Object.assign(rec, { canvas });
    };

    /** Parse an `rgba(r, g, b, a)` / `rgb(...)` string's red channel. */
    const red = (css: string): number => Number(/\d+/.exec(css)![0]);

    it('black to the corners, a white disc to haloU, linear to black at haloU + feather — redrawn in place', async () => {
      const { bakeHaloMaskTexture } = await actual();
      const rec = recording();
      const source = new CanvasSource({ resource: rec.canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
      const tex = new Texture({ source });
      const update = vi.spyOn(source, 'update');
      expect(bakeHaloMaskTexture(H, tex)).toBe(tex);
      expect(update).toHaveBeenCalledTimes(1);
      expect(rec.rect).toEqual([0, 0, SIZE, SIZE]);
      expect(red(rec.rectStyle), 'beyond: zero').toBe(0);
      const px = SIZE / 2 / haloSpanU(H);
      const [, , r0, , , r1] = rec.grad!;
      expect(r0).toBeCloseTo(H * px, 6);
      expect(r1).toBeCloseTo((H + F) * px, 6);
      expect(rec.arcR).toBeCloseTo(r1, 6);
      expect(r1, 'the feathered disc fits inside the texture').toBeLessThanOrEqual(SIZE / 2);
      expect(rec.stops.map(([o, c]) => [o, red(c)])).toEqual([[0, 255], [1, 0]]);
    });

    it('a wider halo pushes both radii out', async () => {
      const { bakeHaloMaskTexture } = await actual();
      const radiiU = (h: number): number[] => {
        const rec = recording();
        const source = new CanvasSource({ resource: rec.canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
        bakeHaloMaskTexture(h, new Texture({ source }));
        const px = SIZE / 2 / haloSpanU(h);
        return [rec.grad![2] / px, rec.grad![5] / px];
      };
      const [a0, a1] = radiiU(H);
      const [b0, b1] = radiiU(H * 1.3);
      expect(b0).toBeGreaterThan(a0);
      expect(b1).toBeGreaterThan(a1);
    });
  });
});

describe('the smoke brush: one soft puff', () => {
  // A puff centred on a cell centre (cell IC, IC), radius 6.5 cells.
  const IC = 64;
  const R = 6.5 * K.cellU;
  const S = (K.puffMinAlpha + K.puffMaxAlpha) / 2;
  const puffed = (): CloudField => {
    const f = makeField();
    stampPuff(f, cellOffsetU(IC), cellOffsetU(IC), R, S, K.shadeMin);
    return f;
  };
  const along = (f: CloudField, k: number): number => f.alpha[IC * CLOUD_CELLS + IC + k];

  it('falls off smoothly: centre > mid > edge > 0 inside R, and 0 at R and beyond', () => {
    const f = puffed();
    expect(along(f, 0)).toBeGreaterThan(along(f, 3));
    expect(along(f, 3)).toBeGreaterThan(along(f, 6));
    expect(along(f, 6)).toBeGreaterThan(0);
    expect(along(f, 7)).toBe(0);
    expect(along(f, -7)).toBe(0);
  });

  it('has no hard step: the profile only decreases outward and its outermost lit cell is a faint fraction of the centre', () => {
    const f = puffed();
    for (let k = 1; k <= 7; k++) expect(along(f, k)).toBeLessThanOrEqual(along(f, k - 1));
    expect(along(f, 6)).toBeLessThan(0.1 * along(f, 0));
  });

  it('composites "over": repeated puffs raise a cell by ever smaller steps, saturating toward maxAlpha and never past it', () => {
    const f = makeField();
    let prev = 0;
    let prevStep = Infinity;
    for (let n = 0; n < 200; n++) {
      stampPuff(f, cellOffsetU(IC), cellOffsetU(IC), R, K.puffMaxAlpha, K.shadeMax);
      const a = along(f, 0);
      expect(a).toBeLessThanOrEqual(MAX);
      const step = a - prev;
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(prevStep + 1e-7);
      prev = a;
      prevStep = step;
    }
    expect(prev).toBeCloseTo(MAX, 5);
  });

  it('a puff samples a landing point inside the given disc, a size, a strength and a grey inside their knobs', () => {
    const rng = seeded(21);
    for (let n = 0; n < 500; n++) {
      const p = samplePuff(300, rng);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(300);
      expect(p.r).toBeGreaterThanOrEqual(K.puffMinU);
      expect(p.r).toBeLessThanOrEqual(K.puffMaxU);
      expect(p.s).toBeGreaterThanOrEqual(K.puffMinAlpha);
      expect(p.s).toBeLessThanOrEqual(K.puffMaxAlpha);
      expect(p.shade).toBeGreaterThanOrEqual(K.shadeMin);
      expect(p.shade).toBeLessThanOrEqual(K.shadeMax);
    }
  });
});

describe('the brush over a cloud life, and the fade', () => {
  it('every painted cell carries a grey within [shadeMin, shadeMax], and fieldToRgba writes it as rgb with the alpha in a', () => {
    const f = makeField();
    const rng = seeded(13);
    for (let t = 0; t < 4000; t += 16) stepField(f, 16, rng);
    const rgba = new Uint8Array(f.alpha.length * 4);
    fieldToRgba(f, rgba);
    let painted = 0;
    for (let k = 0; k < f.alpha.length; k++) {
      if (f.alpha[k] === 0) continue;
      painted++;
      expect(f.shade[k]).toBeGreaterThanOrEqual(Math.fround(K.shadeMin) - 1e-6);
      expect(f.shade[k]).toBeLessThanOrEqual(Math.fround(K.shadeMax) + 1e-6);
      expect(rgba[k * 4]).toBe(Math.round(f.shade[k] * 255));
      expect(rgba[k * 4 + 1]).toBe(rgba[k * 4]);
      expect(rgba[k * 4 + 3]).toBe(Math.round(f.alpha[k] * 255));
    }
    expect(painted).toBeGreaterThan(0);
  });

  it('puffs land only inside the current outline (plus one largest puff)', () => {
    const rng = seeded(3);
    for (const age of [500, 5000, LIFE]) {
      const f = makeField();
      const startAge = Math.max(0, age - 400);
      f.age = startAge;
      for (let t = startAge; t < age; t += 20) stepField(f, 20, rng);
      const reach = cloudOutlineRadius(age) + K.puffMaxU;
      let painted = 0;
      for (let j = 0; j < CLOUD_CELLS; j++) {
        for (let i = 0; i < CLOUD_CELLS; i++) {
          if (f.alpha[j * CLOUD_CELLS + i] === 0) continue;
          painted++;
          expect(Math.hypot(cellOffsetU(i), cellOffsetU(j))).toBeLessThanOrEqual(reach);
        }
      }
      expect(painted).toBeGreaterThan(0);
    }
  });

  it('no cell ever exceeds maxAlpha', () => {
    const f = makeField();
    const rng = seeded(11);
    for (let t = 0; t < 6000; t += 16) stepField(f, 16, rng);
    expect(f.peak).toBeLessThanOrEqual(K.maxAlpha);
    expect(Math.max(...f.alpha)).toBeLessThanOrEqual(MAX);
  });

  it('decay is LINEAR: every cell drops by maxAlpha·dt/fadeMs (floored at 0) and a full fadeMs takes any cell to 0', () => {
    const f = makeField();
    const rng = seeded(7);
    for (let t = 0; t < 2000; t += 16) stepField(f, 16, rng);
    const before = Float32Array.from(f.alpha);
    decayField(f, K.fadeMs / 4);
    const drop = K.maxAlpha / 4;
    for (let k = 0; k < before.length; k++) expect(f.alpha[k]).toBeCloseTo(Math.max(0, before[k] - drop), 5);
    decayField(f, (3 * K.fadeMs) / 4);
    expect(total(f)).toBe(0);
  });

  it('the same number of puffs lands at a low frame rate as at a high one (the fractional carry)', () => {
    const count = (frameMs: number): number => {
      const f = makeField();
      let draws = 0;
      const rng = (): number => {
        draws++;
        return 0.5;
      };
      for (let t = 0; t < 1000; t += frameMs) stepField(f, frameMs, rng);
      return draws / RNG_PER_PUFF;
    };
    expect(count(7)).toBe(count(50));
    expect(Math.abs(count(50) - K.puffsPerSec)).toBeLessThanOrEqual(1);
  });

  it('a pre-rolled mid-life cloud has a dense body and a wispy rim (centre thicker than 0.9 R)', () => {
    const f = makeField();
    advanceField(f, 9000, seeded(5));
    const R = cloudOutlineRadius(9000);
    expect(annulusMean(f, 0, 0.2 * R)).toBeGreaterThan(annulusMean(f, 0.85 * R, 0.95 * R));
  });
});

describe('a cloud leaves only after its spray is over AND its paint has faded', () => {
  it('survives past lifeMs while paint remains, then despawns and frees its sprite', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, seeded());
    cm.sync([cloud('old', 0)]);
    const s = cm.spriteOf('old')!;
    let t = play(cm, 0, LIFE + 32);
    expect(cm.size, 'still painted just after its life').toBe(1);
    expect(cm.fieldOf('old')!.peak).toBeGreaterThanOrEqual(FADED_ALPHA);
    t = play(cm, t, K.fadeMs + 100);
    expect(cm.size).toBe(0);
    expect(cm.spriteOf('old')).toBeNull();
    expect(s.destroyed).toBe(true);
    expect(cm.cloudBody.children, 'only the halo mask is left').toEqual([]);
  });

  it('clear() empties every held cloud (the match-start edge)', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, seeded());
    cm.sync([cloud('c1'), cloud('c2')]);
    cm.render(1000);
    cm.clear();
    expect(cm.size).toBe(0);
    expect(cm.cloudBody.children, 'only the halo mask is left').toEqual([]);
  });
});

describe('pre-roll: a cloud first seen mid-life looks mid-life', () => {
  it('its first render yields a non-empty field already spread past the birth disc', () => {
    const cm = new Countermeasure(new Container(), seeded(5));
    cm.sync([cloud('late', 0)]);
    cm.render(9000);
    const f = cm.fieldOf('late')!;
    expect(total(f)).toBeGreaterThan(0);
    let farthest = 0;
    for (let j = 0; j < CLOUD_CELLS; j++) {
      for (let i = 0; i < CLOUD_CELLS; i++) {
        if (f.alpha[j * CLOUD_CELLS + i] > 0) farthest = Math.max(farthest, Math.hypot(cellOffsetU(i), cellOffsetU(j)));
      }
    }
    expect(farthest).toBeGreaterThan(CONFIG.countermeasure.r0 + K.puffMaxU);
  });

  it('a cloud first seen long after its paint would have faded despawns on its first render', () => {
    const cm = new Countermeasure(new Container(), seeded());
    cm.sync([cloud('gone', 0)]);
    cm.render(LIFE + K.fadeMs + 1000);
    expect(cm.size).toBe(0);
  });

  it('a clock estimate behind t0 renders an empty newborn without throwing', () => {
    const cm = new Countermeasure(new Container(), seeded());
    cm.sync([cloud('young', 1000)]);
    cm.render(900);
    expect(total(cm.fieldOf('young')!)).toBe(0);
    expect(cm.size).toBe(1);
  });
});

describe('the declared seat (Eric 2026-10-12: above everything except radar paints; own hull on top)', () => {
  const at = (n: string): number => CHART_LAYER_ORDER.indexOf(n as never);
  it('cloud above contact hulls and names, below radar paints, which sit below the own hull', () => {
    expect(at('cloud')).toBeGreaterThan(at('ship'));
    expect(at('cloud')).toBeGreaterThan(at('plate'));
    expect(at('blip')).toBeGreaterThan(at('cloud'));
    expect(at('ownShip')).toBeGreaterThan(at('blip'));
    expect(at('aim')).toBeGreaterThan(at('ownShip'));
  });
});

describe('coverAt: the cloud haze under a world point', () => {
  it('is 0 with no clouds, > 0 at the centre of a sprayed cloud, 0 well outside its grid', () => {
    const cm = new Countermeasure(new Container(), seeded(9));
    expect(cm.coverAt(0, 0)).toBe(0);
    cm.sync([cloud('c', 0, 500, 500)]);
    cm.render(3000);
    expect(cm.coverAt(500, 500)).toBeGreaterThan(0);
    expect(cm.coverAt(500, 500)).toBeLessThanOrEqual(MAX);
    const far = CLOUD_CELLS * K.cellU;
    expect(cm.coverAt(500 + far, 500)).toBe(0);
    expect(cm.coverAt(500, 500 - far)).toBe(0);
  });
});
