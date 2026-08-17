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
// inputs to the same radius (`fogHoleRadiusU(sightRange, dazzled)`): an
// `intelRange` boon via `setRanges`, and a dazzle flip via `setDazzled`.
//
// The bake is stubbed here for the same reason the other radar suites stub it —
// jsdom has no 2d canvas — but the stub MIRRORS the real reuse contract (hand a
// live texture back, mint only on a bare call) and records the `into` it was given,
// so a revert to the destroying form fails on the recorded call rather than on a
// rasterization detail. The last suite drops the stub and pins the real function.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { Radar } from '../render/radar.js';

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
  return new Radar(new Container(), new Container(), () => null, 'return');
};

describe('a dim-mask rebake never destroys the bound TextureSource', () => {
  it('keeps ONE texture and source across an intelRange boon', () => {
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

  it('mints on construction and only there — the first bake gets no `into`', () => {
    const radar = radarFor();
    expect(bakes.into, 'exactly one bake, with nothing to reuse').toEqual([undefined]);

    radar.render(OWN, 100, null, null);
    expect(bakes.into, 'a steady frame costs one float compare').toHaveLength(1);
  });
});

describe('bakeDimMaskTexture itself: redraw in place, or mint', () => {
  // The real function, unstubbed. It cannot rasterize under jsdom, so the canvas
  // is faked — which is enough, because what is under test is the LIFETIME branch
  // (reuse vs. mint), not the gradient.
  const actual = async (): Promise<typeof import('../render/textures.js')> =>
    vi.importActual<typeof import('../render/textures.js')>('../render/textures.js');

  const fakeCanvasTexture = (): { tex: Texture; update: ReturnType<typeof vi.fn>; fills: number } => {
    const rec = { fills: 0 };
    const ctx = {
      fillStyle: '',
      fillRect: (): void => { rec.fills += 1; },
      createRadialGradient: (): { addColorStop: () => void } => ({ addColorStop: (): void => {} }),
      beginPath: (): void => {},
      arc: (): void => {},
      fill: (): void => {},
    };
    const update = vi.fn();
    const tex = {
      destroyed: false,
      source: { destroyed: false, resource: { getContext: (): unknown => ctx }, update },
    } as unknown as Texture;
    return { tex, update, get fills() { return rec.fills; } };
  };

  it('redraws a live canvas-backed texture and re-uploads it, returning the SAME object', async () => {
    const { bakeDimMaskTexture } = await actual();
    const held = fakeCanvasTexture();

    expect(bakeDimMaskTexture(SIGHT, held.tex), 'same object back').toBe(held.tex);
    expect(held.fills, 'the ramp was actually redrawn').toBeGreaterThan(0);
    expect(held.update, 'and re-uploaded exactly once').toHaveBeenCalledTimes(1);
  });

  it('never draws into or updates a source that is not one of our canvases', async () => {
    const { bakeDimMaskTexture } = await actual();
    const update = vi.fn();
    // `Texture.EMPTY`'s shape: a real source with no canvas behind it. Every
    // headless caller holds it, and drawing into it would take down every other
    // consumer of the shared singleton.
    const emptyLike = {
      destroyed: false,
      source: { destroyed: false, resource: null, update },
    } as unknown as Texture;

    // It falls through to the mint path, which jsdom cannot complete — that throw
    // IS the evidence it refused to reuse. The assertion that matters is below it.
    expect(() => bakeDimMaskTexture(SIGHT, emptyLike)).toThrow();
    expect(update, 'a non-canvas source is never updated').not.toHaveBeenCalled();
  });
});
