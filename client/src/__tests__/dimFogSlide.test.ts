// THE DIM MASK FOLLOWS THE FOGGED EYE (epic-9 amendment 210, Eric 2026-10-21):
// the near-range dim keeps its look — the floor across the sight bubble, linear
// to full at the flash rung — but on each bearing the ramp SLIDES inward to
// where the observer's fog-tolled eye actually ends, by the `dim.fogLift` dial:
//     scale(θ, d) = radial(d + (sight − reach(θ)) × fogLift)
// Contracts pinned here: no fog (or fogLift 0) IS today's mask; a fogged
// bearing's floor ends at its reach and full strength begins one ramp-width
// later; the bake draws one wedge per bearing (jsdom cannot rasterize, so the
// wedge geometry and the recorded draw calls are the evidence); the Radar
// re-casts and re-bakes on the fog cadence or a move, never per frame; the
// FogFieldView casts the shared fan at its drawn cut, or null with no fog.
// Radii are derived from CONFIG / CLIENT_CONFIG, never literals.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { CanvasSource, Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG, FOG_NO_CUT, fogEyeReachFan, makeFogField } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { dimFanSlides, dimRadii, dimRampU, dimScaleAt, dimSlideU } from '../render/radarDim.js';
import { DIM_MASK_TEXTURE_SIZE, dimWedge } from '../render/textures.js';
import { Radar, type EyeReachSource } from '../render/radar.js';
import { FogFieldView } from '../render/fogField.js';

const bakes = vi.hoisted(() => ({ fans: [] as Array<Float32Array | null> }));

vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (_sightU: number, into?: Texture | null, reach: Float32Array | null = null): Texture => {
      bakes.fans.push(reach === null ? null : Float32Array.from(reach));
      return into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
    },
    bakeHaloMaskTexture: (_haloU: number, into?: Texture | null): Texture =>
      into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) }),
  };
});

const DIM = CLIENT_CONFIG.blip.heatmap.dim as unknown as { fogLift: number };
const SHIPPED_LIFT = DIM.fogLift;
afterEach(() => {
  DIM.fogLift = SHIPPED_LIFT;
});

const SIGHT = CONFIG.vision.sight;
const { innerU: INNER, outerU: OUTER } = dimRadii(SIGHT);
const FLOOR = CLIENT_CONFIG.blip.heatmap.dim.minScale;
const RAYS = CLIENT_CONFIG.blip.heatmap.dim.reachRays;

/** Distances across the whole mask, past the outer rung. */
const sweepD = (): number[] => Array.from({ length: 81 }, (_, i) => (i / 40) * OUTER);

describe('dimScaleAt with a reach — the slide', () => {
  it("a reach at sight is today's curve, at every distance", () => {
    for (const d of sweepD()) expect(dimScaleAt(d, SIGHT, SIGHT)).toBe(dimScaleAt(d, SIGHT));
  });

  it('fogLift 1: the floor holds to the reach R and full strength begins at R + (outer − inner)', () => {
    DIM.fogLift = 1;
    const R = SIGHT * 0.4;
    const width = OUTER - INNER;
    const floorEndU = INNER - (SIGHT - R); // = R with the shipped innerFactor 1
    expect(dimScaleAt(Math.max(0, floorEndU), SIGHT, R)).toBeCloseTo(FLOOR, 9);
    expect(dimScaleAt(floorEndU + width, SIGHT, R)).toBe(1);
    expect(dimScaleAt(floorEndU + width / 2, SIGHT, R)).toBeCloseTo(FLOOR + (1 - FLOOR) / 2, 9);
    // the translated curve, everywhere
    for (const d of sweepD()) expect(dimScaleAt(d, SIGHT, R)).toBeCloseTo(dimScaleAt(d + (SIGHT - R), SIGHT), 9);
  });

  it("fogLift 0 is today's mask, fog or no fog", () => {
    DIM.fogLift = 0;
    for (const d of sweepD()) expect(dimScaleAt(d, SIGHT, SIGHT * 0.3)).toBe(dimScaleAt(d, SIGHT));
  });

  it('a partial lift slides by that share of the shortfall', () => {
    DIM.fogLift = 0.5;
    expect(dimSlideU(SIGHT, SIGHT * 0.6)).toBeCloseTo(SIGHT * 0.2, 9);
  });

  it('a non-finite, negative or beyond-sight reach reads as sight — no slide', () => {
    for (const r of [Number.NaN, Number.POSITIVE_INFINITY, -1, SIGHT * 2]) {
      expect(dimSlideU(SIGHT, r)).toBe(0);
      for (const d of sweepD()) expect(dimScaleAt(d, SIGHT, r)).toBe(dimScaleAt(d, SIGHT));
    }
  });

  it('dimRampU translates both radii by the slide and never changes the width', () => {
    DIM.fogLift = 1;
    const out = { innerU: 0, outerU: 0 };
    dimRampU(SIGHT, SIGHT * 0.25, out);
    expect(out.outerU - out.innerU).toBeCloseTo(OUTER - INNER, 9);
    expect(out.innerU).toBeCloseTo(INNER - SIGHT * 0.75, 9);
  });

  it('dimFanSlides: an all-sight fan and fogLift 0 slide nothing; one short bearing slides', () => {
    const fan = new Float32Array(RAYS).fill(SIGHT);
    expect(dimFanSlides(fan, SIGHT)).toBe(false);
    fan[7] = SIGHT / 2;
    expect(dimFanSlides(fan, SIGHT)).toBe(true);
    DIM.fogLift = 0;
    expect(dimFanSlides(fan, SIGHT)).toBe(false);
  });

  it('a non-dyadic sight: an all-fround(sight) fan (the Float32Array a clear cast stores) slides nothing', () => {
    DIM.fogLift = 1;
    const sight = (SIGHT * 7) / 6;
    expect(Math.fround(sight), 'premise: the sight is not float32-representable').not.toBe(sight);
    const fan = new Float32Array(RAYS).fill(sight);
    for (const r of fan) expect(dimSlideU(sight, r)).toBe(0);
    expect(dimFanSlides(fan, sight)).toBe(false);
  });

  it('dimRampU with a non-finite or non-positive sight writes a zero ramp (never NaN into the gradient)', () => {
    for (const s of [Number.NaN, Number.POSITIVE_INFINITY, 0, -SIGHT]) {
      const out = dimRampU(s, SIGHT / 2, { innerU: 7, outerU: 9 });
      expect(out).toEqual({ innerU: 0, outerU: 0 });
      const w = dimWedge(new Float32Array(RAYS).fill(SIGHT / 2), 0, s, 1);
      for (const v of [w.r0, w.r1, w.inner]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('the wedge bake (real bakeDimMaskTexture over a recording canvas)', () => {
  const actual = async (): Promise<typeof import('../render/textures.js')> =>
    vi.importActual<typeof import('../render/textures.js')>('../render/textures.js');
  const SIZE = DIM_MASK_TEXTURE_SIZE;
  const PX = SIZE / 2 / CLIENT_CONFIG.blip.heatmap.dim.spanU;

  /** A 2d stand-in logging every draw call with its arguments. */
  const recording = (): { tex: Texture; log: string[] } => {
    const log: string[] = [];
    const ctx: Record<string, unknown> = {
      setTransform: (): void => {},
      fillRect: (...a: number[]): void => void log.push(`fillRect ${a.join()} ${String(ctx.fillStyle)}`),
      createRadialGradient: (...a: number[]): { addColorStop: (o: number, c: string) => void } => {
        log.push(`grad ${a.join()}`);
        return { addColorStop: (o, c): void => void log.push(`stop ${o} ${c}`) };
      },
      beginPath: (): void => void log.push('beginPath'),
      moveTo: (...a: number[]): void => void log.push(`moveTo ${a.join()}`),
      arc: (...a: number[]): void => void log.push(`arc ${a.join()}`),
      closePath: (): void => void log.push('closePath'),
      fill: (): void => void log.push('fill'),
    };
    const canvas = { width: SIZE, height: SIZE, getContext: (): unknown => ctx };
    const source = new CanvasSource({ resource: canvas as unknown as HTMLCanvasElement, width: SIZE, height: SIZE });
    return { tex: new Texture({ source }), log };
  };

  it('an all-sight fan draws exactly the no-fan radial bake', async () => {
    const { bakeDimMaskTexture } = await actual();
    const a = recording();
    const b = recording();
    bakeDimMaskTexture(SIGHT, a.tex);
    bakeDimMaskTexture(SIGHT, b.tex, new Float32Array(RAYS).fill(SIGHT));
    expect(a.log.length).toBeGreaterThan(0);
    expect(b.log).toEqual(a.log);
  });

  it('fogLift 0 with a fogged fan draws exactly the radial bake', async () => {
    DIM.fogLift = 0;
    const { bakeDimMaskTexture } = await actual();
    const a = recording();
    const b = recording();
    bakeDimMaskTexture(SIGHT, a.tex);
    bakeDimMaskTexture(SIGHT, b.tex, new Float32Array(RAYS).fill(SIGHT / 3));
    expect(b.log).toEqual(a.log);
  });

  it('a fogged fan draws one gradient wedge per bearing over the opaque full-canvas fill', async () => {
    DIM.fogLift = 1;
    const { bakeDimMaskTexture } = await actual();
    const rec = recording();
    const fan = new Float32Array(RAYS).fill(SIGHT);
    fan[0] = SIGHT / 2;
    bakeDimMaskTexture(SIGHT, rec.tex, fan);
    expect(rec.log[0]).toMatch(new RegExp(`^fillRect 0,0,${SIZE},${SIZE} `));
    expect(rec.log.filter((l) => l.startsWith('grad '))).toHaveLength(RAYS);
    expect(rec.log.filter((l) => l === 'fill')).toHaveLength(RAYS);
    // wedge 0 is centred on bearing 0 (world +x), and overlaps its neighbours
    const arc0 = rec.log.find((l) => l.startsWith('arc '))!.split(' ')[1].split(',').map(Number);
    const half = Math.PI / RAYS;
    expect(arc0[3]).toBeLessThan(-half);
    expect(arc0[4]).toBeGreaterThan(half);
  });

  it("dimWedge: a fogged bearing's ramp starts at its slid inner radius and keeps the observer's width", () => {
    DIM.fogLift = 1;
    const R = SIGHT * 0.6;
    const fan = new Float32Array(RAYS).fill(SIGHT);
    fan[3] = R;
    const fogged = dimWedge(fan, 3, SIGHT, PX);
    expect(fogged.r0).toBeCloseTo((INNER - (SIGHT - R)) * PX, 2);
    expect(fogged.r1 - fogged.r0).toBeCloseTo((OUTER - INNER) * PX, 2);
    expect(fogged.inner).toBeCloseTo(FLOOR, 6);
    const clear = dimWedge(fan, 4, SIGHT, PX);
    expect(clear.r0).toBeCloseTo(INNER * PX, 6);
    expect(clear.r1).toBeCloseTo(OUTER * PX, 6);
  });

  it("dimWedge: a slide past the centre starts the gradient at the centre, at the curve's level there", () => {
    DIM.fogLift = 1;
    const fan = new Float32Array(RAYS).fill(0); // eye blind on every bearing
    const w = dimWedge(fan, 0, SIGHT, PX);
    expect(w.r0).toBeGreaterThanOrEqual(0);
    expect(w.inner).toBeCloseTo(dimScaleAt(w.r0 / PX, SIGHT, 0), 9);
    expect(w.r1).toBeCloseTo(Math.max(w.r0 + 1, (OUTER - SIGHT) * PX), 6);
  });
});

describe('Radar: the fan is cast and baked on a cadence, never per frame', () => {
  const REFRESH = CLIENT_CONFIG.fogField.refreshMs;
  const MOVE = CLIENT_CONFIG.blip.heatmap.dim.reachRecastMoveU;

  /** A source that answers a fan with one fogged bearing (or null), counting calls. */
  const sourceOf = (fogged: () => boolean): EyeReachSource & { calls: number } => {
    const src = {
      calls: 0,
      eyeReachFan(_ox: number, _oy: number, sightU: number, _t: number, out: Float32Array): Float32Array | null {
        src.calls++;
        if (!fogged()) return null;
        out.fill(sightU);
        out[0] = sightU / 2;
        return out;
      },
    };
    return src;
  };
  const radarWith = (src: EyeReachSource | null): Radar => {
    const r = new Radar(new Container(), new Container());
    r.setEyeReachSource(src);
    bakes.fans.length = 0;
    return r;
  };

  it('casts and bakes a fan once, then not again until the fog refresh interval has elapsed', () => {
    const src = sourceOf(() => true);
    const radar = radarWith(src);
    for (let t = 0; t < REFRESH; t += 16) radar.render({ x: 0, y: 0 }, t, null);
    expect(src.calls, 'one cast inside one refresh interval').toBe(1);
    expect(bakes.fans, 'one fanned bake').toHaveLength(1);
    expect(bakes.fans[0]).not.toBeNull();
    expect(bakes.fans[0]!.length).toBe(RAYS);
    radar.render({ x: 0, y: 0 }, REFRESH, null);
    expect(src.calls).toBe(2);
    expect(bakes.fans, 'the same fan again: no re-bake (P10)').toHaveLength(1);
  });

  it('two consecutive due casts returning the same fan bake once; a changed entry bakes again', () => {
    let short = 0;
    const src = {
      calls: 0,
      eyeReachFan(_ox: number, _oy: number, sightU: number, _t: number, out: Float32Array): Float32Array {
        src.calls++;
        out.fill(sightU);
        out[short] = sightU / 2;
        return out;
      },
    };
    const radar = radarWith(src);
    radar.render({ x: 0, y: 0 }, 0, null);
    radar.render({ x: 0, y: 0 }, REFRESH, null);
    expect(src.calls, 'two due casts').toBe(2);
    expect(bakes.fans, 'the identical fan baked once').toHaveLength(1);
    short = 5;
    radar.render({ x: 0, y: 0 }, REFRESH * 2, null);
    expect(src.calls).toBe(3);
    expect(bakes.fans, 'a changed entry bakes again').toHaveLength(2);
    expect(bakes.fans[1]![5]).toBe(Math.fround(SIGHT / 2));
  });

  it('re-casts early on a move past reachRecastMoveU, not on a smaller one', () => {
    const src = sourceOf(() => true);
    const radar = radarWith(src);
    radar.render({ x: 0, y: 0 }, 0, null);
    radar.render({ x: MOVE * 0.5, y: 0 }, 16, null);
    expect(src.calls).toBe(1);
    radar.render({ x: MOVE, y: 0 }, 32, null);
    expect(src.calls).toBe(2);
  });

  it('a null fan after a fan gets ONE radial re-bake, then stays quiet', () => {
    let fog = true;
    const src = sourceOf(() => fog);
    const radar = radarWith(src);
    radar.render({ x: 0, y: 0 }, 0, null);
    fog = false;
    for (let t = REFRESH; t <= REFRESH * 4; t += REFRESH) radar.render({ x: 0, y: 0 }, t, null);
    expect(bakes.fans).toEqual([expect.any(Float32Array), null]);
  });

  it('no fog ever: the source is asked on the cadence but nothing is re-baked', () => {
    const src = sourceOf(() => false);
    const radar = radarWith(src);
    for (let t = 0; t <= REFRESH * 4; t += 16) radar.render({ x: 0, y: 0 }, t, null);
    expect(src.calls).toBeGreaterThan(0);
    expect(bakes.fans).toHaveLength(0);
  });

  it('fogLift 0: a fogged fan bakes nothing (the radial mask already is that bake)', () => {
    DIM.fogLift = 0;
    const radar = radarWith(sourceOf(() => true));
    for (let t = 0; t <= REFRESH * 2; t += 16) radar.render({ x: 0, y: 0 }, t, null);
    expect(bakes.fans).toHaveLength(0);
  });

  it('a non-dyadic sight with a clear fan (all fround(sight)) never takes the fanned bake', () => {
    const sight = (SIGHT * 7) / 6;
    expect(Math.fround(sight), 'premise: the sight is not float32-representable').not.toBe(sight);
    const src = {
      calls: 0,
      eyeReachFan(_ox: number, _oy: number, sightU: number, _t: number, out: Float32Array): Float32Array {
        src.calls++;
        return out.fill(sightU); // a clear cast, stored at float32
      },
    };
    const radar = radarWith(src);
    radar.setRanges(sight, CONFIG.vision.radar, 60000 / CONFIG.vision.sweepRpm);
    bakes.fans.length = 0;
    for (let t = 0; t <= REFRESH * 4; t += 16) radar.render({ x: 0, y: 0 }, t, null);
    expect(src.calls).toBeGreaterThan(1);
    expect(bakes.fans.filter((f) => f !== null)).toHaveLength(0);
  });

  it('a non-finite clock never makes the cast due every frame', () => {
    const src = sourceOf(() => true);
    const radar = radarWith(src);
    for (let i = 0; i < 20; i++) radar.render({ x: 0, y: 0 }, Number.NaN, null);
    expect(src.calls).toBe(0);
  });

  it('a negative or non-finite reachRays dial constructs (an empty fan), never throws', () => {
    const D = CLIENT_CONFIG.blip.heatmap.dim as unknown as { reachRays: number };
    const shipped = D.reachRays;
    try {
      for (const n of [-5, Number.NaN, Number.POSITIVE_INFINITY, 2.7]) {
        D.reachRays = n;
        expect(() => radarWith(sourceOf(() => true)).render({ x: 0, y: 0 }, 0, null)).not.toThrow();
      }
    } finally {
      D.reachRays = shipped;
    }
  });

  it('the spectate path (no own pose) never casts and never bakes a fan', () => {
    const src = sourceOf(() => true);
    const radar = radarWith(src);
    for (let t = 0; t <= REFRESH * 4; t += 16) radar.render(null, t, null);
    expect(src.calls).toBe(0);
    expect(bakes.fans).toHaveLength(0);
  });

  it('losing the pose after a fan takes the fan off with one radial re-bake', () => {
    const radar = radarWith(sourceOf(() => true));
    radar.render({ x: 0, y: 0 }, 0, null);
    for (let t = 16; t <= 160; t += 16) radar.render(null, t, null);
    expect(bakes.fans).toEqual([expect.any(Float32Array), null]);
  });
});

describe('FogFieldView.eyeReachFan — the shared fan at the drawn cut', () => {
  const SEED = 0x1234abcd;
  const OCEAN = 5000;
  const MID = 0.1;
  const viewAt = (cut: number): FogFieldView => {
    const view = new FogFieldView(new Container());
    view.setSeed(SEED, OCEAN);
    view.setCut(cut);
    view.update(16, 0, false, null); // eases the cut; no pose → nothing drawn
    return view;
  };

  it('returns null with no fog cut', () => {
    expect(viewAt(FOG_NO_CUT).eyeReachFan(0, 0, SIGHT, 0, new Float32Array(RAYS))).toBeNull();
  });

  it('returns null before a field exists', () => {
    const view = new FogFieldView(new Container());
    view.setCut(MID);
    view.update(16, 0, false, null);
    expect(view.eyeReachFan(0, 0, SIGHT, 0, new Float32Array(RAYS))).toBeNull();
  });

  it('fills the given array with the shared fan at the drawn cut: every entry ≤ sight, some short where a bank lies ahead', () => {
    const view = viewAt(MID);
    const field = makeFogField(SEED, CONFIG.fog, OCEAN);
    const out = new Float32Array(RAYS);
    let shortened = false;
    for (let x = -2000; x <= 2000 && !shortened; x += 400) {
      for (let y = -2000; y <= 2000 && !shortened; y += 400) {
        expect(view.eyeReachFan(x, y, SIGHT, 1000, out)).toBe(out);
        expect(out).toEqual(fogEyeReachFan(field, x, y, SIGHT, 1000, view.drawnCut, new Float32Array(RAYS)));
        for (const r of out) expect(r).toBeLessThanOrEqual(SIGHT);
        shortened = out.some((r) => r < SIGHT);
      }
    }
    expect(shortened, 'some observer on the lattice has a bank ahead').toBe(true);
  });
});
