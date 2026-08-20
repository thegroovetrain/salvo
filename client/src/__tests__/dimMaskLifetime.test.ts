// THE DIM MASK'S TEXTURE OUTLIVES EVERY REBAKE — the frozen-client bug.
//
// Two playtesters lost their client mid-match: the canvas froze on its last frame
// while the socket and server sim carried on ("the game is still going, but my UI
// and cam are fully frozen"). One had just fitted a radar upgrade; the other had
// no boons at all and was in a star-shell dazzle. Both saw the same throw inside
// `renderer.render()` — `Cannot read properties of null (reading '0')` at Pixi's
// `BindGroup.getResource`.
//
// THE MECHANISM, AND WHY IT IS A LIFETIME RULE RATHER THAN A RADAR RULE.
// `Radar.dim` is a SPRITE, and it is `blipLayer`'s mask. Pixi decides
// `renderMaskToTexture = !(mask instanceof Sprite)`, so a Sprite mask skips the
// pooled scratch-texture path and `MaskFilter.apply` binds OUR OWN `TextureSource`
// as `uMaskTexture`. `BindGroup.setResource` subscribes to that source's `change`
// event; `TextureSource.destroy()` emits exactly that event with `destroyed`; and
// `BindGroup.onResourceChange` answers it by destroying ITSELF and nulling its
// resources. The filter comes from `BigPool`, so the damage is app-wide and
// permanent — the very next alpha-mask push (the fog's inverse hole mask will do)
// throws, and the ticker dies.
//
// `syncDimMask` used to swap in a new texture and destroy the old one, which is
// precisely that. So the pin is: A REBAKE MUST REDRAW THE LIVE TEXTURE IN PLACE
// AND NEVER DESTROY IT. Both triggers are covered, because they are independent
// inputs to the same radius (`fogHoleRadiusU(sightRange, dazzled)`): a radar-range
// change via `setRanges`, and a dazzle flip via `setDazzled`. Since cycle 118
// deleted the INTEL RANGE line, DAZZLE is the only trigger left in production —
// the `setRanges` half is pinned anyway, because that setter is the seam a future
// radar card would arrive through and the lifetime bug is silent until it fires.
//
// The bake is stubbed here for the same reason the other radar suites stub it —
// jsdom has no 2d canvas — but the stub MIRRORS the real reuse contract (hand a
// live texture back, mint only on a bare call) and records the `into` it was given,
// so a revert to the destroying form fails on the recorded call rather than on a
// rasterization detail. The last suite drops the stub and pins the real function.

import { describe, it, expect, vi } from 'vitest';
import { CanvasSource, Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { Radar } from '../render/radar.js';
// Re-exported through the mock's `...actual` spread, so this is the real constant.
import { DIM_MASK_TEXTURE_SIZE } from '../render/textures.js';

const bakes = vi.hoisted(() => ({ into: [] as Array<Texture | null | undefined> }));

vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (_sightU: number, into?: Texture | null): Texture => {
      bakes.into.push(into);
      // The real contract, mirrored: a live texture is redrawn in place and handed
      // straight back; only a bare call mints. Nothing is ever destroyed.
      return into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
    },
  };
});

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const OWN = { x: 0, y: 0 };

const radarFor = (): Radar => {
  bakes.into.length = 0;
  return new Radar(new Container(), new Container());
};

describe('a dim-mask rebake never destroys the bound TextureSource', () => {
  it('keeps ONE texture and source across a radar-range change', () => {
    const radar = radarFor();
    const first = radar.dimMask.texture;
    const destroyed = vi.spyOn(first, 'destroy');
    radar.render(OWN, 100, null, null);

    radar.setRanges(SIGHT * 1.15, RADAR * 1.15, 6000);
    radar.render(OWN, 200, null, null);

    expect(bakes.into.at(-1), 'the live texture is handed back to the bake').toBe(first);
    expect(radar.dimMask.texture, 'the same Texture object stays on the sprite').toBe(first);
    expect(first.source.destroyed, 'the bound source survives the rebake').toBe(false);
    expect(destroyed, 'nothing is destroyed — that is the whole fix').not.toHaveBeenCalled();
    destroyed.mockRestore();
  });

  it('keeps ONE texture and source across a dazzle flip, both ways', () => {
    const radar = radarFor();
    const first = radar.dimMask.texture;
    const destroyed = vi.spyOn(first, 'destroy');
    radar.render(OWN, 100, null, null);

    radar.setDazzled(true);
    radar.render(OWN, 200, null, null);
    expect(bakes.into.at(-1), 'the flare rebake reuses it').toBe(first);

    radar.setDazzled(false);
    radar.render(OWN, 300, null, null);
    expect(bakes.into.at(-1), 'and so does burning out').toBe(first);

    expect(radar.dimMask.texture).toBe(first);
    expect(first.source.destroyed).toBe(false);
    expect(destroyed).not.toHaveBeenCalled();
    destroyed.mockRestore();
  });

  it('does NOT rebake every frame on a non-finite bubble', () => {
    // The failure this guards is one the fix itself created. `NaN === dimBakedAtU`
    // is false forever, so without the finiteness check a NaN bubble would redraw
    // and re-upload the full 1024² surface on EVERY frame, silently, for the rest
    // of the match. The old destroying code crashed on the first such frame, which
    // is why nothing needed to guard it before. `radarDim` already treats a
    // non-finite bubble as reachable (both `dimRadii` and `dimScaleAt` guard it).
    const radar = radarFor();
    radar.render(OWN, 100, null, null);
    const baseline = bakes.into.length;

    radar.setRanges(Number.NaN, Number.NaN, 6000);
    for (let t = 200; t <= 600; t += 100) radar.render(OWN, t, null, null);

    expect(bakes.into, 'a NaN bubble holds the last good radius, it does not churn')
      .toHaveLength(baseline);
  });

  it('mints on construction and only there — the first bake gets no `into`', () => {
    const radar = radarFor();
    expect(bakes.into, 'exactly one bake').toHaveLength(1);
    // Nullish rather than `undefined` exactly: passing an explicit null is the same
    // call to the implementation (`if (into != null)`), so pinning which one would
    // be pinning style, not behaviour.
    expect(bakes.into[0] ?? null, 'and it had nothing to reuse').toBeNull();

    radar.render(OWN, 100, null, null);
    expect(bakes.into, 'a steady frame costs one float compare').toHaveLength(1);
  });
});

describe('bakeDimMaskTexture itself: redraw in place, or mint', () => {
  // The real function, unstubbed. jsdom cannot rasterize, so the CANVAS is faked —
  // but the texture and source around it are REAL Pixi objects wherever the branch
  // under test reads them, because "our texture exposes its canvas at
  // `source.resource`" is exactly the assumption that, if wrong, would make the
  // whole fix inert while leaving every test green.
  const actual = async (): Promise<typeof import('../render/textures.js')> =>
    vi.importActual<typeof import('../render/textures.js')>('../render/textures.js');

  const SIZE = DIM_MASK_TEXTURE_SIZE;

  /** A 2d-context stand-in that records what the draw actually did. */
  const recordingCanvas = (size = SIZE): { canvas: unknown; rect: number[] | null; rectStyle: string } => {
    const rec = { rect: null as number[] | null, rectStyle: '' };
    const ctx = {
      fillStyle: '' as string | object,
      globalAlpha: 0.5,
      globalCompositeOperation: 'destination-out',
      setTransform: (): void => {},
      fillRect: (x: number, y: number, w: number, h: number): void => {
        rec.rect = [x, y, w, h];
        rec.rectStyle = String(ctx.fillStyle);
      },
      createRadialGradient: (): { addColorStop: () => void } => ({ addColorStop: (): void => {} }),
      beginPath: (): void => {},
      arc: (): void => {},
      fill: (): void => {},
    };
    const canvas = { width: size, height: size, getContext: (): unknown => ctx };
    return { canvas, get rect() { return rec.rect; }, get rectStyle() { return rec.rectStyle; } };
  };

  it('redraws a REAL Pixi canvas-backed texture in place and re-uploads it', async () => {
    const { bakeDimMaskTexture } = await actual();
    const { canvas } = recordingCanvas();
    // A real CanvasSource and a real Texture: this is the test that proves the
    // reuse branch engages against Pixi's actual object shape rather than against
    // a hand-made object built to satisfy our own guard.
    const source = new CanvasSource({ resource: canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
    const tex = new Texture({ source });
    const update = vi.spyOn(source, 'update');

    expect(bakeDimMaskTexture(SIGHT, tex), 'the same Texture object comes back').toBe(tex);
    expect(update, 're-uploaded exactly once').toHaveBeenCalledTimes(1);
    expect(source.destroyed, 'and nothing was destroyed').toBe(false);
  });

  it('opens the redraw with an OPAQUE FULL-CANVAS fill, so a shrinking ramp leaves no ghost', async () => {
    const { bakeDimMaskTexture } = await actual();
    const rec = recordingCanvas();
    const source = new CanvasSource({ resource: rec.canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
    bakeDimMaskTexture(SIGHT, new Texture({ source }));

    // In-place redraw has no clear — correctness rests entirely on this fill
    // covering the whole surface at full alpha. Under the old mint-per-rebake code
    // a partial fill was harmless (fresh canvas); now it would composite the new
    // ramp OVER the old one, and a shrinking radius would keep a ghost of the
    // larger bubble the player no longer has.
    expect(rec.rect, 'covers the entire canvas').toEqual([0, 0, SIZE, SIZE]);
    expect(rec.rectStyle, 'at alpha 1').toMatch(/(,\s*1\)|rgb\()/);
  });

  it('resets the compositing state it depends on, since the context is now reused', async () => {
    const { bakeDimMaskTexture } = await actual();
    const rec = recordingCanvas();
    const ctx = (rec.canvas as { getContext: () => Record<string, unknown> }).getContext();
    const source = new CanvasSource({ resource: rec.canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
    bakeDimMaskTexture(SIGHT, new Texture({ source }));

    // Seeded hostile above (0.5 / 'destination-out'): a reused context carries the
    // previous draw's state, and 'destination-out' would ERASE the mask instead of
    // drawing it.
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  describe('refuses to reuse anything that is not ours, and mints instead', () => {
    // Every refusal falls through to the mint path, which jsdom cannot complete.
    // The throw is NOT the evidence — it is an environment artifact that would
    // invert on a host with a real 2d context. The evidence is the observable:
    // the input was neither updated nor handed back.
    const expectRefused = (
      bake: typeof import('../render/textures.js').bakeDimMaskTexture,
      input: Texture,
      update: { mock?: unknown } | ReturnType<typeof vi.fn>,
    ): void => {
      let returned: Texture | null = null;
      try {
        returned = bake(SIGHT, input);
      } catch {
        returned = null; // mint path; no 2d context under jsdom
      }
      expect(returned, 'never handed back as if it had been redrawn').not.toBe(input);
      expect(update, 'never re-uploaded').not.toHaveBeenCalled();
    };

    it('the shared Texture.EMPTY singleton', async () => {
      const { bakeDimMaskTexture } = await actual();
      const update = vi.spyOn(Texture.EMPTY.source, 'update');
      expectRefused(bakeDimMaskTexture, Texture.EMPTY, update);
      expect(Texture.EMPTY.source.destroyed, 'the singleton survives').toBe(false);
      update.mockRestore();
    });

    it('a canvas that is not our size — every other bake in textures.ts is canvas-backed too', async () => {
      const { bakeDimMaskTexture } = await actual();
      const { canvas } = recordingCanvas(SIZE / 2);
      const source = new CanvasSource({
        resource: canvas as HTMLCanvasElement, width: SIZE / 2, height: SIZE / 2,
      });
      const update = vi.spyOn(source, 'update');
      expectRefused(bakeDimMaskTexture, new Texture({ source }), update);
    });

    it('a destroyed Texture whose source is still alive', async () => {
      const { bakeDimMaskTexture } = await actual();
      const { canvas } = recordingCanvas();
      const source = new CanvasSource({ resource: canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
      const update = vi.spyOn(source, 'update');
      const tex = new Texture({ source });
      tex.destroy(false); // Pixi leaves `_source` live on a texture-only destroy
      expectRefused(bakeDimMaskTexture, tex, update);
    });

    it('a live Texture whose SOURCE has been destroyed', async () => {
      const { bakeDimMaskTexture } = await actual();
      const { canvas } = recordingCanvas();
      const source = new CanvasSource({ resource: canvas as HTMLCanvasElement, width: SIZE, height: SIZE });
      const tex = new Texture({ source });
      source.destroy();
      const update = vi.spyOn(source, 'update');
      expectRefused(bakeDimMaskTexture, tex, update);
    });
  });
});
