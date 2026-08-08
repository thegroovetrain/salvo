// THE BUFFER FOLLOWS THE VIEWPORT (cycle 58, amendments 95-99) — and this file
// is the deliverable of that cycle, not a coverage afterthought.
//
// WHY IT EXISTS. Cycle 57 attacked the same clipping bug by allocating a
// worst-case square and confining work to a paint-driven sub-rect that was
// RE-CENTRED every frame, with the sprite placed at that moving origin. It
// reached production and broke it: islands drifted with the boat, paints
// rendered misplaced, some islands vanished. Its tests were green — because they
// exercised the PURE rasterizer, where cell → world is a clean function, while
// the break was in the Pixi ADAPTER'S PLACEMENT. Amendment 98 is the standing
// order that followed: placement is pinned HERE, through the real scene graph,
// at BOTH zoom extremes and with the camera moving.
//
// SO EVERY PLACEMENT ASSERTION BELOW GOES THE LONG WAY ROUND ON PURPOSE:
//
//   texel index → the SPRITE's own position/scale (what the adapter actually
//   set) → the chart container's camera transform (copied from main.ts's
//   applyCamera) → screen px → back to world through `camera.screenToWorld`,
//   an INDEPENDENT path.
//
// Nothing here reads `originX` and calls it placement. If the sprite is placed
// at the wrong world point, or scaled so a texel is not one world cell, or the
// grid is anchored on an unsnapped centre, the round trip lands somewhere other
// than the world position the echo was created at, and these fail.
//
// PROVEN TO BITE, not assumed to (three deliberate breakages during development,
// each reverted): offsetting the sprite by three cells failed 5 tests; scaling a
// texel to 1.25 cells failed 6; dropping the `Math.floor` out of `anchorGrid`
// failed 8, the rim-clipping test among them. All 16 passed again on restore.
//
// RE-DERIVED FOR THE BEAM MARCH (cycle 62, amendment 144 — and amendment 98 says
// in as many words not to assume the old pins carry over, because THE THING BEING
// PLACED CHANGED). What is placed is no longer a per-object paint but a SLICE: a
// wedge of world cells the beam crossed, so every fixture below is a height
// raster or a hull rather than an island polygon, and "the landmass held still"
// is now asserted over the cells a marched slice froze. The properties being
// pinned are identical — one texel is one world cell, the sprite sits on the
// snapped grid origin, and nothing viewport-derived reaches creation or
// retirement.
//
// AND THE OTHER HALF OF THE RULING — amendment 97, Eric's stated requirement:
// *"if I am zoomed in when it paints and then I zoom out, it still shows me
// everything that would have been there."* That holds only if NOTHING
// viewport-derived reaches paint creation or retirement, so the last two blocks
// prove exactly that: the same world state driven through two very different
// cameras yields byte-identical paint lists, and a paint recorded off-screen at
// max zoom is on the scope the moment the camera zooms out.

import { describe, it, expect, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { CONFIG, rasterizeHullCoverage, type HeightRaster, type ReturnBlipEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ContactStore } from '../net/snapshots.js';
import { Camera, USER_ZOOM_MAX, USER_ZOOM_MIN } from '../render/camera.js';
import { DIM_MASK_LABEL, Radar, type ViewRect } from '../render/radar.js';
import { GRID_QUANTUM, anchorGrid, gridSpan, makeGrid } from '../render/radarHeatmap.js';
import { blipLifeMs } from '../render/phosphor.js';
import { DIM_MASK_TEXTURE_SIZE } from '../render/textures.js';

/** The shipped generator's height-field sample spacing. */
const RCELL = 14;

/** A HeightRaster over a square about the origin — the march's ONLY terrain
 *  input, and the fixture that replaces the retired island field. */
function rasterFrom(reachU: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reachU / RCELL);
  const n = 2 * k + 1;
  const x0 = -k * RCELL;
  const height = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) height[j * n + i] = h(x0 + i * RCELL, x0 + j * RCELL);
  }
  return { n, cell: RCELL, x0, y0: x0, seaLevel: 0, peak: 255, height, pyramid: [] };
}

/** A rectangular slab of land at a uniform height. */
function slab(cx: number, cy: number, hw: number, hh: number, h: number) {
  return (x: number, y: number): number =>
    Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh ? h : 0;
}

// jsdom has no 2d canvas, so neither baked texture the adapter builds at
// construction — the sweep wedge and the Story 4.11 near-range dim mask — can
// rasterize here. Both are stubbed; the heatmap buffer needs no canvas at all,
// and the mask's PLACEMENT (which is all these suites assert about it) is a
// sprite transform that does not depend on the texture's contents.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (): Texture => Texture.EMPTY,
  };
});

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const RADAR = CONFIG.vision.radar;
const LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);
const VIEW_W = 1280;
const VIEW_H = 720;

/** A radar wired into a chart container, exactly as main.ts wires it: the
 *  heatmap sprite lives in `layer`, `layer` lives in `chart`, and `chart` is
 *  what the camera transform is pushed onto. */
function harness(): { radar: Radar; layer: Container; chart: Container } {
  const chart = new Container();
  const layer = new Container();
  chart.addChild(layer);
  const radar = new Radar(layer, new Container(), () => null, 'return');
  radar.onSweepSample(0, 0);
  return { radar, layer, chart };
}

function camera(userZoom: number): Camera {
  const c = new Camera({ radarRange: RADAR, followRate: 6, leadSeconds: 0, leadMax: 0 });
  c.setViewport(VIEW_W, VIEW_H);
  c.setUserZoom(userZoom);
  return c;
}

/** main.ts's `applyCamera`, verbatim — the transform the chart really carries. */
function applyCamera(cam: Camera, chart: Container): void {
  const c = cam.screenCenter;
  chart.scale.set(cam.zoom);
  chart.position.set(
    c.x - cam.center.x * cam.zoom + cam.shake.x,
    c.y - cam.center.y * cam.zoom + cam.shake.y,
  );
}

/** The heatmap sprite. Selected BY LABEL, not by list order: since Story 4.11
 *  the layer also holds the near-range dim mask, which is a Sprite too (and is
 *  added first, in the constructor, so a bare `find` would return it). */
function heatSprite(layer: Container): Sprite {
  const s = layer.children.find(
    (c): c is Sprite => c instanceof Sprite && c.label !== DIM_MASK_LABEL,
  );
  if (s === undefined) throw new Error('no heatmap sprite in the layer');
  return s;
}

interface Texel {
  tx: number;
  ty: number;
  a: number;
}

/** Every lit texel of the uploaded texture, read from the SPRITE's own texture
 *  source — so a sprite pointing at some other buffer would read empty. */
function litTexels(sprite: Sprite): Texel[] {
  const src = sprite.texture.source as unknown as {
    resource: Uint8Array;
    width: number;
    height: number;
  };
  const out: Texel[] = [];
  for (let ty = 0; ty < src.height; ty++) {
    for (let tx = 0; tx < src.width; tx++) {
      const a = src.resource[(ty * src.width + tx) * 4 + 3];
      if (a > 0) out.push({ tx, ty, a });
    }
  }
  return out;
}

interface Measured {
  /** Alpha-weighted centroid of the lit region (world u). */
  x: number;
  y: number;
  /** World bounding box of the lit region. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cells: number;
}

/** A world-space disc `measure` ignores — used to keep the sea-clutter haze
 *  around own hull out of an assertion about where an ISLAND landed. */
interface Skip {
  x: number;
  y: number;
  r: number;
}

/**
 * WHERE THE ECHO ACTUALLY LANDS, in world units, measured the long way.
 *
 * Centroid (and world bounding box) of the lit texels → the sprite's local space
 * → screen px through the live scene-graph transform → world through the camera's
 * own inverse. Every number the adapter chose (sprite position, sprite scale,
 * grid origin, texel indexing) is in that path, and the reference at the end of it
 * (`screenToWorld`) shares none of them.
 *
 * THE CENTROID IS UNWEIGHTED, and cycle 62 is why. Under the retired primitive a
 * whole object was one paint at one age, so weighting by alpha sharpened the
 * measurement. Under the beam march a scope is ~124 slices per revolution at
 * ~124 different ages, so an alpha-weighted centroid of anything ring-shaped
 * measures RECENCY as much as position — it leans toward the arc the beam swept
 * most recently. Counting lit texels equally measures placement and only
 * placement, which is what these assertions are about.
 */
function measure(layer: Container, chart: Container, cam: Camera, skip?: Skip): Measured {
  const sprite = heatSprite(layer);
  const lit = litTexels(sprite);
  if (lit.length === 0) throw new Error('nothing lit');
  applyCamera(cam, chart);
  // Texel space → screen (the live scene-graph transform) → world (the camera's
  // own inverse). The transform is scale + translate only, so the bounding box
  // maps corner-wise.
  const at = (tx: number, ty: number) => cam.screenToWorld(sprite.toGlobal({ x: tx, y: ty }));
  // SEA CLUTTER LEGITIMATELY LIGHTS THE NEAR FIELD (Story 4.10, amendments 130 +
  // 133), so a test measuring where an ISLAND landed must exclude the haze disc
  // around own hull or it measures the ship instead. This is a test-rig concern
  // only: the haze is a real, wanted return, it is simply not what these
  // placement assertions are about.
  const keep = lit.filter((t) => {
    if (skip === undefined) return true;
    const w = at(t.tx + 0.5, t.ty + 0.5);
    return Math.hypot(w.x - skip.x, w.y - skip.y) > skip.r;
  });
  if (keep.length === 0) throw new Error('nothing lit outside the skip disc');
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let lo = { tx: Infinity, ty: Infinity };
  let hi = { tx: -Infinity, ty: -Infinity };
  for (const t of keep) {
    sw += 1;
    sx += t.tx + 0.5;
    sy += t.ty + 0.5;
    lo = { tx: Math.min(lo.tx, t.tx), ty: Math.min(lo.ty, t.ty) };
    hi = { tx: Math.max(hi.tx, t.tx + 1), ty: Math.max(hi.ty, t.ty + 1) };
  }
  const c = at(sx / sw, sy / sw);
  const a = at(lo.tx, lo.ty);
  const b = at(hi.tx, hi.ty);
  return {
    x: c.x,
    y: c.y,
    minX: a.x,
    maxX: b.x,
    minY: a.y,
    maxY: b.y,
    cells: lit.length,
  };
}

/** One wire echo footprint centred on a world point — built by the SAME shared
 *  rasterizer the server runs (cycle 63: the wire carries a coverage mask and
 *  nothing else), for a mine layer heading +x. The record keeps the intended
 *  centre (and a label for messages) beside the wire event, because the event
 *  itself deliberately carries no position or id any more. */
interface TestEcho { e: ReturnBlipEvent; x: number; y: number; id: string }
function echo(x: number, y: number, t = 1000, id = 'trk-1'): TestEcho {
  const c = rasterizeHullCoverage('mineLayer', x, y, 0, CELL);
  return { e: { k: 'blip', t, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits }, x, y, id };
}

/** Render one frame with the camera centred on `own` (the alive framing). */
function frame(radar: Radar, cam: Camera, own: { x: number; y: number }, t: number): ViewRect {
  cam.snapTo(own);
  const view = cam.worldView;
  radar.render(own, t, null, view);
  return view;
}

/** Placement tolerance: an echo is a grained footprint quantized onto whole
 *  cells, so its measured centroid is good to about a cell. A placement BUG is
 *  never sub-cell — cycle 57's islands drifted by hundreds of units. */
const TOL = CELL * 1.5;

/** THE HAZE AROUND OWN HULL, as a skip disc. Sea clutter is a real, wanted return
 *  and the beam paints it on every advance, so a test measuring where something
 *  ELSE landed has to exclude it or it measures the ship. Sized past the compute
 *  bound; the curve takes the haze under the threshold well inside that. */
function haze(own: { x: number; y: number }, r = CLIENT_CONFIG.blip.heatmap.model.clutterRangeU + 30): Skip {
  return { x: own.x, y: own.y, r };
}

// --- 1. PLACEMENT, at both zoom extremes (amendment 98) -------------------------

describe('an echo renders at the world position it was created at', () => {
  for (const [label, z] of [['USER_ZOOM_MIN', USER_ZOOM_MIN], ['USER_ZOOM_MAX', USER_ZOOM_MAX]] as const) {
    it(`places it exactly there at ${label} (${z}×)`, () => {
      const { radar, layer, chart } = harness();
      const cam = camera(z);
      const own = { x: 1200, y: -800 }; // nowhere near the origin: an origin bug hides there
      const e = echo(own.x + 240, own.y - 180);
      frame(radar, cam, own, 900);
      radar.onBlip(e.e);
      frame(radar, cam, own, 1000);

      const m = measure(layer, chart, cam, haze(own));
      expect(m.cells, 'the echo lit some texels').toBeGreaterThan(0);
      // The centroid of a real hull mask is cell-quantized and the silhouette
      // itself is not point-symmetric, so the pin is the TOL band (±1.5 cells)
      // rather than a sub-cell equality — a placement BUG is never sub-cell
      // (cycle 57's islands drifted by hundreds of units).
      expect(Math.abs(m.x - e.x), `x within ${TOL}u at ${label}`).toBeLessThan(TOL);
      expect(Math.abs(m.y - e.y), `y within ${TOL}u at ${label}`).toBeLessThan(TOL);
    });
  }

  it('THE QUANTIZED-MASK PIN (cycle-63 review gate): every lit texel of the echo '
    + 'lands on EXACTLY a covered wire cell, corner on the lattice, at both zooms', () => {
    // The TOL-band centroid above tolerates ±1.5 cells, which is precisely the
    // window a systematic half-cell or whole-cell offset in the
    // `stampCoverage`→buffer path hides in — the cycle-57 defect class. A
    // quantized mask allows an EXACT pin instead: round-trip every lit texel
    // through the live scene graph and the camera's own inverse, and its world
    // corner must sit ON the shared lattice, on a cell the wire mask actually
    // covers. Any sub-cell displacement anywhere in the placement chain moves
    // every corner off the lattice and fails.
    for (const [label, z] of [['USER_ZOOM_MIN', USER_ZOOM_MIN], ['USER_ZOOM_MAX', USER_ZOOM_MAX]] as const) {
      const { radar, layer, chart } = harness();
      const cam = camera(z);
      const own = { x: 1200, y: -800 };
      const e = echo(own.x + 240, own.y - 180);
      frame(radar, cam, own, 900);
      radar.onBlip(e.e);
      frame(radar, cam, own, 1000);
      applyCamera(cam, chart);
      const sprite = heatSprite(layer);
      const at = (tx: number, ty: number): { x: number; y: number } =>
        cam.screenToWorld(sprite.toGlobal({ x: tx, y: ty }));
      const covered = new Set<string>();
      for (let row = 0; row < e.e.h; row++) {
        for (let col = 0; col < e.e.w; col++) {
          const i = row * e.e.w + col;
          if (((e.e.bits[i >>> 5] >>> (i & 31)) & 1) === 1) covered.add(`${e.e.gx + col},${e.e.gy + row}`);
        }
      }
      const skip = haze(own);
      let matched = 0;
      for (const t of litTexels(sprite)) {
        const w = at(t.tx, t.ty);
        if (Math.hypot(w.x + CELL / 2 - skip.x, w.y + CELL / 2 - skip.y) <= skip.r) continue; // clutter, not the echo
        const gx = w.x / CELL;
        const gy = w.y / CELL;
        expect(Math.abs(gx - Math.round(gx)), `${label}: texel corner ON the lattice (x)`).toBeLessThan(1e-3);
        expect(Math.abs(gy - Math.round(gy)), `${label}: texel corner ON the lattice (y)`).toBeLessThan(1e-3);
        expect(covered.has(`${Math.round(gx)},${Math.round(gy)}`), `${label}: lit texel is a covered wire cell`).toBe(true);
        matched++;
      }
      expect(matched, `${label}: most of the mask rendered`).toBeGreaterThan(covered.size * 0.6);
    }
  });

  it('one texel is one world cell at BOTH zooms — the sprite scale is not a '
    + 'zoom-dependent fudge', () => {
    for (const z of [USER_ZOOM_MIN, USER_ZOOM_MAX]) {
      const { radar, layer } = harness();
      const cam = camera(z);
      const own = { x: 0, y: 0 };
      frame(radar, cam, own, 900);
      radar.onBlip(echo(300, 0).e);
      frame(radar, cam, own, 1000);
      const sprite = heatSprite(layer);
      expect(sprite.scale.x, `scale at ${z}×`).toBe(CELL);
      expect(sprite.scale.y, `scale at ${z}×`).toBe(CELL);
    }
  });

  it('and the buffer really is sized to the VIEWPORT, so zooming out costs more '
    + 'cells (amendment 99)', () => {
    const wide = harness();
    const tight = harness();
    const own = { x: 0, y: 0 };
    frame(wide.radar, camera(USER_ZOOM_MIN), own, 100);
    frame(tight.radar, camera(USER_ZOOM_MAX), own, 100);
    const w = wide.radar.heatDims;
    const t = tight.radar.heatDims;
    expect(w).not.toBeNull();
    expect(t).not.toBeNull();
    expect(w!.cols * w!.rows).toBeGreaterThan(t!.cols * t!.rows);
    // ...and the wide one is WIDER than it is tall, like the screen it covers —
    // the ring-sized square this replaced was neither.
    expect(w!.cols).toBeGreaterThan(w!.rows);
  });
});

// --- 2. PLACEMENT WHILE THE CAMERA MOVES ----------------------------------------

describe('a paint holds its world position while the camera moves over it', () => {
  it('THE CYCLE-57 SYMPTOM: the echo does not drift with the boat', () => {
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MIN);
    const own = { x: 0, y: 0 };
    const e = echo(400, 250);
    frame(radar, cam, own, 900);
    radar.onBlip(e.e);

    // Steam past it, one frame at a time, through many whole-cell boundaries and
    // several deliberately fractional camera centres (a snap bug shows up as
    // sub-cell jitter that accumulates into a drift).
    // The beam paints a fresh haze about the observer on EVERY advance, so the
    // skip disc has to cover the whole track it steams down — not just where it
    // ended up. The union of hazes lies within `clutterRangeU` of the segment
    // (0,0)→(-400,200), i.e. inside this disc; the echo at (400,250) is 620u from
    // its centre and nowhere near it.
    const TRACK = { x: -200, y: 100, r: 360 };
    for (const step of [0, 3.5, 17.25, 61.9, 120, 233.75, 400]) {
      frame(radar, cam, { x: -step, y: step * 0.5 }, 1000 + step);
      const m = measure(layer, chart, cam, TRACK);
      expect(Math.abs(m.x - e.x), `x after ${step}u of camera travel`).toBeLessThan(TOL);
      expect(Math.abs(m.y - e.y), `y after ${step}u of camera travel`).toBeLessThan(TOL);
    }
  });

  it('and a ZOOM CHANGE mid-decay does not move it either', () => {
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MAX);
    const own = { x: -500, y: 300 };
    const e = echo(own.x + 200, own.y + 100);
    frame(radar, cam, own, 900);
    radar.onBlip(e.e);
    for (const z of [USER_ZOOM_MAX, 1.2, 1.0, 0.75, USER_ZOOM_MIN, 1.5]) {
      cam.setUserZoom(z);
      frame(radar, cam, own, 1000);
      const m = measure(layer, chart, cam, haze(own));
      expect(Math.abs(m.x - e.x), `x at ${z}×`).toBeLessThan(TOL);
      expect(Math.abs(m.y - e.y), `y at ${z}×`).toBeLessThan(TOL);
    }
  });

  it('A LANDMASS holds still too — it is the thing Eric watched drift', () => {
    // A 380..620 x -90..90 ridge, as a height raster: the march's only terrain
    // input. Steep, so the whole slab saturates and its rendered bounds are its
    // real bounds rather than a threshold artefact.
    const raster = rasterFrom(900, slab(500, 0, 120, 90, 255));
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MIN);
    radar.setHeightRaster(raster);
    radar.onSweepSample(-0.6, 0);
    frame(radar, cam, { x: 0, y: 0 }, 0);
    // A whole revolution, so the beam has marched every bearing of the ridge.
    for (let t = 0; t <= 4200; t += 100) frame(radar, cam, { x: 0, y: 0 }, t);
    // The observer sits at the origin and steams west to x = -330.25 below, and
    // sea clutter paints a haze about wherever it was when the beam swept — with
    // 3-deep persistence every one of those hazes stays lit. HAZE is the union of
    // them all, and it is nowhere near the 380..620 ridge this test measures, so
    // excluding it isolates the landmass without weakening a single bound.
    const HAZE = { x: -165, y: 0, r: 330 };
    const first = measure(layer, chart, cam, HAZE);
    // ABSOLUTE first: the lit mass sits on the REAL coastline, opening at x = 380
    // and closing at x = 620 — not merely self-consistent frame to frame. The
    // slack is one raster sample, because `sampleHeight` is nearest-neighbour on a
    // 14u grid and the coastline is quantized to it.
    expect(Math.abs(first.minX - 380), 'west coast').toBeLessThan(RCELL + TOL);
    expect(Math.abs(first.maxX - 620), 'east coast — the FAR side paints now, '
      + 'amendment 140').toBeLessThan(RCELL + TOL);
    // ...then STABLE: steaming away must not move one cell of it.
    for (const step of [40, 90.5, 210, 330.25]) {
      frame(radar, cam, { x: -step, y: 0 }, 4300 + step);
      const m = measure(layer, chart, cam, HAZE);
      expect(Math.abs(m.x - first.x), `landmass x after ${step}u`).toBeLessThan(TOL);
      expect(Math.abs(m.y - first.y), `landmass y after ${step}u`).toBeLessThan(TOL);
      expect(Math.abs(m.minX - first.minX), `west coast after ${step}u`).toBeLessThan(TOL);
    }
  });
});

// --- 3. NO CLIPPING: the bug this cycle exists to fix ----------------------------

describe('a paint at the radar rim is not clipped as the observer sails away', () => {
  it('stays on the scope while it is on SCREEN (amendment 83: painted is '
    + 'painted until it decays)', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    const rim = echo(RADAR - 10, 0);
    frame(radar, cam, { x: 0, y: 0 }, 900);
    radar.onBlip(rim.e);
    frame(radar, cam, { x: 0, y: 0 }, 1000);
    expect(radar.bandAt(rim.x, rim.y), 'painted at the rim').toBeGreaterThanOrEqual(0);

    // Withdraw well past a ring-sized box: at 900u away the OLD buffer (half
    // extent = radarRange, centred on the ship) no longer contained this cell at
    // all, and the mark blinked out — the "box around the radar ring" Eric saw.
    for (const x of [-200, -500, -900]) {
      frame(radar, cam, { x, y: 0 }, 1000);
      expect(Math.abs(rim.x - x), 'genuinely outside a ring-sized box').toBeGreaterThan(RADAR);
      expect(radar.bandAt(rim.x, rim.y), `withdrawn to x=${x}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('and it comes BACK when it scrolls into view again — the buffer is scratch, '
    + 'the paint list is the history (amendment 96)', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    const e = echo(0, 620);
    frame(radar, cam, { x: 0, y: 0 }, 900);
    radar.onBlip(e.e);
    frame(radar, cam, { x: 0, y: 0 }, 1000);
    expect(radar.bandAt(e.x, e.y), 'on screen at first').toBeGreaterThanOrEqual(0);

    const held = radar.livePaints;
    frame(radar, cam, { x: 0, y: -2000 }, 1050); // scrolled off the top of the screen
    expect(radar.bandAt(e.x, e.y), 'off screen: not drawn').toBe(-1);
    expect(radar.livePaints, 'but still RECORDED — never retired by visibility')
      .toBeGreaterThanOrEqual(held);

    frame(radar, cam, { x: 0, y: 0 }, 1100); // back
    expect(radar.bandAt(e.x, e.y), 'back on screen: drawn again').toBeGreaterThanOrEqual(0);
  });
});

// --- 4. THE ZOOM-OUT REVEAL: Eric's stated requirement (amendment 97) ------------

describe('a paint recorded while zoomed IN appears when you zoom OUT', () => {
  it('records every off-screen paint at max zoom, and reveals them all at min '
    + 'zoom', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MAX);
    const own = { x: 0, y: 0 };
    // At 1.5× the visible half-height is ~440u, so these three are all off the
    // top/bottom of the screen while inside radar range.
    const off = [echo(0, 620, 1000, 'a'), echo(0, -600, 1000, 'b'), echo(120, 640, 1000, 'c')];
    frame(radar, cam, own, 900);
    for (const e of off) radar.onBlip(e.e);
    frame(radar, cam, own, 1000);

    // Every wire echo became a slice the moment it arrived, and the beam's own
    // march has added its own — the count is not the assertion, the RECORD is.
    const recorded = radar.livePaints;
    expect(recorded, 'the scope holds paints').toBeGreaterThanOrEqual(3);
    for (const e of off) {
      expect(radar.bandAt(e.x, e.y), `not drawn while zoomed in: ${e.id}`).toBe(-1);
    }

    cam.setUserZoom(USER_ZOOM_MIN);
    frame(radar, cam, own, 1001); // one frame later: under one quantum of beam
    expect(radar.livePaints, 'zooming out creates nothing').toBe(recorded);
    for (const e of off) {
      expect(radar.bandAt(e.x, e.y), `revealed by zooming out: ${e.id}`).toBeGreaterThanOrEqual(0);
    }
  });
});

// --- 5. NOTHING VIEWPORT-DERIVED REACHES CREATION OR RETIREMENT (amendment 97) ---

/** THE SLICE LIST AS COMPARABLE DATA. A slice is flat typed arrays, so this
 *  serializes every byte of it: its time, its cell indices and its frozen
 *  intensities. Two radars that agree here agree on exactly what the beam
 *  recorded and when. */
function listOf(radar: Radar): string {
  return radar.paintList
    .map((s) => `${s.t}|${s.n}|${[...s.cells].join(',')}|${[...s.w].join(',')}`)
    .join('\n');
}

describe('the camera cannot touch what is painted or when it is retired', () => {
  /** A ridge to the east, as the height raster the march reads. */
  const RASTER = rasterFrom(900, slab(500, 0, 120, 90, 255));

  /** Identical world state, one camera. Contacts, terrain, wire echoes — every
   *  source of paints in the grammar. */
  function run(view: (own: { x: number; y: number }) => ViewRect | null, times: number[]): Radar {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'return');
    const contacts = new ContactStore();
    contacts.pushFrame(0, [{ id: 'ship-7', x: 200, y: 0, heading: 0, speed: 0, cls: 'battleship' }]);
    radar.setHeightRaster(RASTER);
    radar.onSweepSample(-0.6, 0);
    const own = { x: 0, y: 0 };
    for (const t of times) {
      if (t === 400) radar.onBlip(echo(500, 300, 400, 'wire-1').e);
      radar.render(own, t, contacts, view(own));
    }
    return radar;
  }

  const TIMES = [0, 200, 400, 600, 900];

  it('two radars driven through wildly different cameras hold BYTE-IDENTICAL '
    + 'slice lists', () => {
    const tight = run((own) => {
      const c = camera(USER_ZOOM_MAX);
      c.snapTo(own);
      return c.worldView;
    }, TIMES);
    // A camera at min zoom, panned 3000u away — nothing this radar paints is
    // even on its screen.
    const wide = run(() => {
      const c = camera(USER_ZOOM_MIN);
      c.snapTo({ x: 3000, y: -3000 });
      return c.worldView;
    }, TIMES);
    const none = run(() => null, TIMES); // and no camera at all

    expect(tight.livePaints).toBeGreaterThan(1); // the comparison is not vacuous
    expect(tight.livePaintCells, 'and it painted real cells').toBeGreaterThan(100);
    expect(listOf(wide)).toBe(listOf(tight));
    expect(listOf(none)).toBe(listOf(tight));
  });

  it('and they retire on the same beat — retirement is gated by TIME alone', () => {
    const late = [...TIMES, 900 + LIFE + 1];
    const tight = run((own) => {
      const c = camera(USER_ZOOM_MAX);
      c.snapTo(own);
      return c.worldView;
    }, late);
    const wide = run(() => {
      const c = camera(USER_ZOOM_MIN);
      c.snapTo({ x: 3000, y: -3000 });
      return c.worldView;
    }, late);
    expect(tight.livePaints).toBe(0);
    expect(wide.livePaints).toBe(0);
  });
});

// --- 6. the pure sizing/snapping contract ---------------------------------------

describe('buffer sizing and the load-bearing snap', () => {
  it('gridSpan covers the span with slack and quantizes, so a wheel zoom does '
    + 'not churn allocations', () => {
    expect(gridSpan(600, 6) * 6).toBeGreaterThanOrEqual(1200);
    expect(gridSpan(600, 6) % GRID_QUANTUM).toBe(0);
    // A continuous sweep of half-extents collapses to a handful of sizes.
    const sizes = new Set<number>();
    for (let h = 600; h < 640; h += 0.37) sizes.add(gridSpan(h, 6));
    expect(sizes.size).toBeLessThanOrEqual(2);
    // Degenerate inputs answer the quantum, never NaN.
    expect(gridSpan(0, 6)).toBe(GRID_QUANTUM);
    expect(gridSpan(Number.NaN, 6)).toBe(GRID_QUANTUM);
    expect(gridSpan(600, 0)).toBe(GRID_QUANTUM);
  });

  it('anchorGrid snaps a non-square buffer to whole world cells on BOTH axes', () => {
    const g = makeGrid(900, 400, 6);
    expect(g.cols).toBeGreaterThan(g.rows);
    for (const c of [{ x: 0, y: 0 }, { x: 3.1, y: -7.9 }, { x: 1234.567, y: -998.4 }]) {
      anchorGrid(g, c.x, c.y);
      expect(g.originX / 6, `x cell index at ${c.x}`).toBe(Math.round(g.originX / 6));
      expect(g.originY / 6, `y cell index at ${c.y}`).toBe(Math.round(g.originY / 6));
      expect(g.originX).toBe(g.baseGx * 6);
      expect(g.originY).toBe(g.baseGy * 6);
      // The window really contains the centre it was given.
      expect(c.x).toBeGreaterThanOrEqual(g.originX);
      expect(c.x).toBeLessThanOrEqual(g.originX + g.cols * 6);
      expect(c.y).toBeGreaterThanOrEqual(g.originY);
      expect(c.y).toBeLessThanOrEqual(g.originY + g.rows * 6);
    }
  });

  it('a moving camera moves the origin in WHOLE CELLS only — the property that '
    + 'keeps paints still', () => {
    const g = makeGrid(900, 400, 6);
    anchorGrid(g, 0, 0);
    const base = g.baseGx;
    for (let d = 0; d < 60; d += 1.3) {
      anchorGrid(g, d, 0);
      expect(Number.isInteger(g.baseGx - base)).toBe(true);
      expect(g.baseGx - base).toBe(Math.floor(d / 6));
    }
  });
});

// --- 6b. THE TWO WEATHER MATERIALS, PINNED AT THE ADAPTER (amendment 98) --------
//
// Same standing order: a pure-rasterizer test does NOT discharge placement, so
// the storm wall and the sea-clutter haze are measured HERE, through the real
// sprite transform, at both zoom extremes and with the camera moving. Cycle 57
// shipped a placement regression under green pure tests; these blocks exist so
// they cannot repeat it. Cycle 62 turned both from paint KINDS into FIELD
// MATERIALS, which is exactly the kind of change amendment 98 says not to assume
// carries over — so they are re-derived against the march rather than adapted.
//
// AND THAT INCLUDES CLUTTER. An earlier draft of this file excused the haze on
// the grounds that it "lights no texel" — the retired amendment-130 bound, which
// amendment 133 corrected precisely because a haze that lights nothing is the
// option Eric declined. Clutter lights real texels, so its placement is
// round-tripped through the sprite like everything else here; pinning it with
// `intensityAt` alone would read the world-addressed grid and skip the Pixi
// transform entirely, which is amendment 98's exact trap (cycle 57's regression
// lived in the placement, and its pure tests were green).

/** Render one frame with a zone view (the storm wall's input). */
function frameZone(
  radar: Radar,
  cam: Camera,
  own: { x: number; y: number },
  t: number,
  zone: { state: string; cur: { cx: number; cy: number; r: number } } | null,
): void {
  cam.snapTo(own);
  radar.render(own, t, null, cam.worldView, zone);
}

/**
 * Run a whole beam revolution, so the march has walked every bearing.
 *
 * A weather material fills in BEHIND THE BEAM exactly as terrain does — a
 * half-swept scope is a half-drawn ring by design, not a bug to test around — so
 * every placement assertion below is taken after a full turn.
 */
function revolution(
  radar: Radar,
  cam: Camera,
  own: { x: number; y: number },
  zone: { state: string; cur: { cx: number; cy: number; r: number } } | null,
): void {
  radar.onSweepSample(-0.6, 0);
  for (let t = 0; t <= 4600; t += 100) frameZone(radar, cam, own, t, zone);
}

describe('the STORM WALL renders on the live ring, in world coordinates', () => {
  const OWN = { x: 400, y: -250 }; // nowhere near the origin: an origin bug hides there
  const RING = { cx: OWN.x, cy: OWN.y, r: 300 };
  const ZONE = { state: 'closing', cur: RING };
  const HALF = CLIENT_CONFIG.blip.heatmap.model.stormBandU / 2;

  for (const [label, z] of [['USER_ZOOM_MIN', USER_ZOOM_MIN], ['USER_ZOOM_MAX', USER_ZOOM_MAX]] as const) {
    it(`puts the band on the ring at ${label} (${z}×)`, () => {
      const { radar, layer, chart } = harness();
      const cam = camera(z);
      revolution(radar, cam, OWN, ZONE);
      const m = measure(layer, chart, cam);
      expect(m.cells, 'the wall lit texels').toBeGreaterThan(50);
      // A full annulus about the ring centre: its centroid is the centre and its
      // bounds open exactly one ring radius (plus half a band) either side. A
      // sprite placed at the wrong world point moves all four.
      expect(Math.abs(m.x - RING.cx), `centroid x at ${label}`).toBeLessThan(TOL);
      expect(Math.abs(m.y - RING.cy), `centroid y at ${label}`).toBeLessThan(TOL);
      expect(Math.abs(m.minX - (RING.cx - RING.r - HALF)), 'west edge').toBeLessThan(TOL);
      expect(Math.abs(m.maxX - (RING.cx + RING.r + HALF)), 'east edge').toBeLessThan(TOL);
      expect(Math.abs(m.minY - (RING.cy - RING.r - HALF)), 'south edge').toBeLessThan(TOL);
      expect(Math.abs(m.maxY - (RING.cy + RING.r + HALF)), 'north edge').toBeLessThan(TOL);
    });
  }

  it('and holds that world position while the camera moves over it — the wall is '
    + 'a record of where the ring WAS, not a chart overlay that follows you', () => {
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MIN);
    revolution(radar, cam, OWN, ZONE);
    const first = measure(layer, chart, cam);
    for (const step of [7.5, 44, 130.25, 260]) {
      // Inside ONE further revolution, so no new wall is opened from the new
      // observer: this is the ORIGINAL paint, measured from a moved camera.
      frameZone(radar, cam, { x: OWN.x - step, y: OWN.y + step * 0.5 }, 4500 + step, ZONE);
      const m = measure(layer, chart, cam);
      expect(Math.abs(m.x - first.x), `wall x after ${step}u`).toBeLessThan(TOL);
      expect(Math.abs(m.y - first.y), `wall y after ${step}u`).toBeLessThan(TOL);
      expect(Math.abs(m.minX - first.minX), `west edge after ${step}u`).toBeLessThan(TOL);
    }
  });

  it('THE TELEGRAPH DOES NOT PAINT: only the LIVE ring is a physical object', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    // A revealed next ring, well inside the live one and comfortably in range.
    const withNext = { state: 'closing', cur: RING, next: { cx: OWN.x, cy: OWN.y, r: 150 } };
    revolution(radar, cam, OWN, withNext);
    expect(radar.bandAt(OWN.x, OWN.y + RING.r), 'the live ring paints').toBeGreaterThanOrEqual(0);
    for (const a of [0, 1, 2, 3, 4, 5]) {
      const x = OWN.x + Math.cos(a) * withNext.next.r;
      const y = OWN.y + Math.sin(a) * withNext.next.r;
      expect(radar.bandAt(x, y), `dashed telegraph at ${a} rad`).toBe(-1);
    }
  });

  it('and an idle timeline (or no zone at all) paints no wall', () => {
    for (const zone of [null, { state: 'idle', cur: RING }]) {
      const { radar } = harness();
      const cam = camera(USER_ZOOM_MIN);
      revolution(radar, cam, OWN, zone);
      expect(radar.bandAt(OWN.x, OWN.y + RING.r)).toBe(-1);
      // ...and nothing anywhere on the ring, at any bearing: an idle timeline is
      // not a physical object.
      for (const a of [0.4, 1.9, 3.3, 5.1]) {
        expect(radar.bandAt(OWN.x + Math.cos(a) * RING.r, OWN.y + Math.sin(a) * RING.r)).toBe(-1);
      }
    }
  });
});

describe('the SEA CLUTTER haze sits on the observer it was frozen from', () => {
  const OWN = { x: -600, y: 900 };
  const REACH = CLIENT_CONFIG.blip.heatmap.model.clutterRangeU;
  const FUZZY = CLIENT_CONFIG.blip.heatmap.bands[1].at;

  for (const [label, z] of [['USER_ZOOM_MIN', USER_ZOOM_MIN], ['USER_ZOOM_MAX', USER_ZOOM_MAX]] as const) {
    it(`lands on the ship, in world coordinates, at ${label} (${z}×)`, () => {
      const { radar, layer, chart } = harness();
      const cam = camera(z);
      revolution(radar, cam, OWN, null);
      // THROUGH THE SPRITE, at both zooms — the haze is the only thing on the
      // scope in this run, so the lit region IS the haze. An origin bug, a
      // scale bug or an unsnapped anchor moves the centroid off the ship.
      const m = measure(layer, chart, cam);
      expect(m.cells, 'the haze lit texels').toBeGreaterThan(20);
      expect(Math.abs(m.x - OWN.x), `centroid x at ${label}`).toBeLessThan(TOL);
      expect(Math.abs(m.y - OWN.y), `centroid y at ${label}`).toBeLessThan(TOL);
      // It is a DISC about the ship, and it ends inside the compute bound (the
      // 1/d³ curve takes it under `bands[0].at` at ~79u — amendment 130's
      // "the concentration falls out of the falloff, not out of a radius").
      expect(m.maxX - m.minX, 'a real disc, not one cell').toBeGreaterThan(REACH * 0.5);
      expect(m.minX, 'nothing lit west of the bound').toBeGreaterThan(OWN.x - REACH - TOL);
      expect(m.maxX, 'nothing lit east of it').toBeLessThan(OWN.x + REACH + TOL);
      expect(m.minY).toBeGreaterThan(OWN.y - REACH - TOL);
      expect(m.maxY).toBeLessThan(OWN.y + REACH + TOL);
    });

    it(`stays GREEN texture at ${label} — never "probably a thing" on water`, () => {
      const { radar } = harness();
      const cam = camera(z);
      revolution(radar, cam, OWN, null);
      // THE HAZE IS SPECKLE, so a fixed probe is the wrong instrument: roughly a
      // sixth of its cells light and the rest are dark BY DESIGN (amendment 133's
      // straddle). Scan the disc instead and assert the distribution.
      let lit = 0;
      let strongest = 0;
      for (let dx = -REACH; dx <= REACH; dx += CELL) {
        for (let dy = -REACH; dy <= REACH; dy += CELL) {
          if (Math.hypot(dx, dy) > REACH) continue;
          const w = radar.intensityAt(OWN.x + dx, OWN.y + dy);
          if (w > 0) lit++;
          strongest = Math.max(strongest, w);
        }
      }
      expect(lit, 'the haze lights real cells').toBeGreaterThan(20);
      expect(strongest, 'and not one of them reads blue').toBeLessThan(FUZZY);
      expect(radar.intensityAt(OWN.x + REACH * 1.5, OWN.y), 'beyond the disc').toBe(0);
    });
  }

  it('stays where it was frozen as the camera moves — the haze does not follow '
    + 'the boat within a revolution', () => {
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MIN);
    revolution(radar, cam, OWN, null);
    const first = measure(layer, chart, cam);
    // Steam east. The hazes ALREADY on the scope stay where the beam swept them,
    // so the lit region's WEST edge cannot move: only new cells appear ahead.
    for (const step of [12, 90, 240]) {
      frameZone(radar, cam, { x: OWN.x + step, y: OWN.y }, 4500 + step, null);
      const m = measure(layer, chart, cam);
      expect(Math.abs(m.minX - first.minX), `west edge after ${step}u of travel`)
        .toBeLessThan(TOL);
      expect(m.maxX - first.maxX, 'and the new water ahead does paint')
        .toBeGreaterThanOrEqual(0);
    }
  });
});

// --- 6c. THE SCOPE NEVER BLINKS OUT FOR A FRAME, AT THE ADAPTER -----------------
//
// The slice bookkeeping that fills the scope in behind the beam lives in this
// adapter, not in the pure march, so it is pinned here: walk many frames across
// the whole revolution and watch the lit-texel count. Cycle 61's weather paints
// opened their arc at the FRAME's `from`, a hair short of their anchor, and
// `wrapPositive(to − from)` then wrapped a nearly-full arc down to a sliver on
// the last frame of most revolutions — the haze and the wall blinked out for one
// frame, roughly every other turn. The march makes that shape unrepresentable (a
// slice is a finished record, not a growing arc), and this is the test that says
// so at the level the failure lived at.

describe('the scope never blinks out for a frame', () => {
  const OWN = { x: 250, y: -150 };
  const ZONE = { state: 'closing', cur: { cx: OWN.x, cy: OWN.y, r: 300 } };

  it('the lit-texel count never collapses across three whole revolutions', () => {
    const { radar, layer } = harness();
    const cam = camera(USER_ZOOM_MAX);
    radar.onSweepSample(-0.6, 0);
    // 4s per revolution at 15rpm, walked in 30ms steps. The step deliberately
    // does NOT divide the revolution: the frame that lands nearest the wrap
    // drifts every turn, which is exactly how the retired form hid — it
    // collapsed on roughly every other revolution, never on all of them.
    const counts: number[] = [];
    for (let t = 0; t <= 12_000; t += 30) {
      frameZone(radar, cam, OWN, t, ZONE);
      counts.push(litTexels(heatSprite(layer)).length);
    }
    const peak = Math.max(...counts);
    expect(peak, 'the scope does paint').toBeGreaterThan(200);
    // The window opens the moment the FIRST revolution's arc has substantially
    // filled in — deliberately before a second paint exists to prop the count
    // up. That is where the collapse is fatal rather than merely dim: with one
    // live paint, a sliver arc is a blank scope.
    const first = counts.findIndex((n) => n > peak * 0.6);
    expect(first, 'the arc fills in').toBeGreaterThan(0);
    for (let i = first; i < counts.length; i++) {
      expect(counts[i], `frame ${i} collapsed`).toBeGreaterThan(peak * 0.3);
    }
  });
});

// --- 6d. THE CATCH-UP RULE, AT THE ADAPTER (cycle-62 review gate) ---------------
//
// THIS IS THE BLOCK THE CYCLE-62 GATE EXISTS FOR, and its shape is the project's
// recurring failure mode stated one more time: the pure suite pinned
// `sliceCount`'s internal clamp and was green, while the ADAPTER'S OWN cursor
// reset — the half of the rule that never appeared in a pure test — made that
// clamp nearly unreachable and blanked the scope outright on a slow client.
// Cycles 54, 55 and 57 each shipped a bug of exactly that shape (amendments 84,
// 95, 98), so the rule is now driven THROUGH `Radar.render`, at frame intervals
// chosen to land in each regime.
//
// THE ARITHMETIC THESE INTERVALS COME FROM. At 15rpm the beam turns 2π per 4s, so
// one frame of `dt` ms advances `2π·dt/4000` rad. `catchUpRad` is 0.4 and the
// catch-up arc is 8 quanta = 0.404 rad, so:
//   • 320ms → 0.503 rad/frame — PAST the bound (a client at ~3.1fps)
//   • 236ms → 0.371 rad/frame — the NEAR-MISS band, inside the bound but past the
//     7 quanta the old clamp allowed
// Both are reachable: 0.4 rad is only ~125ms of sweep at the boon-scaled
// `sweepRpmMax` of 30, so this is a live-session regime, not a pathology.

describe('the scope keeps painting at every frame rate (catch-up, at the adapter)', () => {
  const SWEEP_MS = 60_000 / CONFIG.vision.sweepRpm; // 4000ms at 15rpm
  const QUANTUM = CLIENT_CONFIG.blip.heatmap.march.sliceRad;
  /** A ring of land at 200-300u, so EVERY bearing has something to paint and a
   *  slice count is a faithful measure of the arc actually marched. */
  const RING_OF_LAND = rasterFrom(400, (x, y) => {
    const d = Math.hypot(x, y);
    return d > 200 && d < 300 ? 255 : 0;
  });

  /** Drive `frames` frames `dtMs` apart and report what the beam swept and what
   *  the march actually emitted. Nothing is pruned inside the phosphor life, so
   *  the live slice count IS the total emitted. */
  function run(dtMs: number, frames: number): { swept: number; slices: number; blank: number } {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MAX);
    const own = { x: 0, y: 0 };
    radar.setHeightRaster(RING_OF_LAND);
    radar.onSweepSample(0, 0);
    let blank = 0;
    for (let k = 0; k < frames; k++) {
      frame(radar, cam, own, k * dtMs);
      if (k > 2 && radar.livePaintCells === 0) blank++;
    }
    // The first frame only anchors the cursor, so the arc under test is what the
    // beam swept AFTER it.
    return {
      swept: ((frames - 1) * dtMs * 2 * Math.PI) / SWEEP_MS,
      slices: radar.livePaints,
      blank,
    };
  }

  it('SUSTAINED FRAMES PAST THE CATCH-UP BOUND STILL PAINT — the defect that '
    + 'left a bare sweep line rotating over an empty scope', () => {
    // 35 frames of 320ms = 11.2s, inside the 12s phosphor life so nothing is
    // pruned. Every frame advances 0.503 rad, past the 0.404 bound; the shipped
    // adapter reset the cursor to the live beam on every one of them and
    // therefore emitted NOTHING, for as long as the condition held.
    const r = run(320, 35);
    expect(r.slices, 'the beam kept emitting slices').toBeGreaterThan(200);
    expect(r.blank, 'and the scope was never blank for a frame').toBe(0);
    // It paints the trailing wedge of every advance: the bound, not zero.
    expect(r.slices * QUANTUM, 'arc painted').toBeGreaterThan(r.swept * 0.7);
  });

  it('...and it holds all the way down to a hopeless frame rate', () => {
    // (At 2000ms frames the run outlasts the 12s phosphor life, so the LIVE count
    // is what survived decay rather than what was emitted — which is the point:
    // slices keep arriving faster than they age out, so the scope never empties.)
    for (const dt of [500, 900, 2000]) {
      const r = run(dt, 12);
      expect(r.slices, `${dt}ms frames`).toBeGreaterThan(30);
      expect(r.blank, `${dt}ms frames left the scope blank`).toBe(0);
    }
  });

  it('THE NEAR-MISS BAND LOSES NO ARC: a frame inside `catchUpRad` but past the '
    + 'old 7-quantum clamp paints everything it swept', () => {
    // The shipped pair (cap at 7 quanta = 0.354 rad, reset at 0.4 rad) let the
    // deficit accumulate for two frames and then discarded ~0.4 rad on the third
    // — about a third of the arc, on a recurring cadence.
    const r = run(236, 47);
    expect(r.slices * QUANTUM, 'painted arc vs swept arc')
      .toBeGreaterThan(r.swept * 0.97);
    expect(r.slices * QUANTUM, 'and nothing is painted twice')
      .toBeLessThanOrEqual(r.swept + QUANTUM);
  });

  it('and an ordinary frame rate is unchanged: every quantum of arc, once', () => {
    const r = run(16, 300);
    expect(r.slices * QUANTUM).toBeGreaterThan(r.swept * 0.98);
    expect(r.slices * QUANTUM).toBeLessThanOrEqual(r.swept + QUANTUM);
  });

  it('A BACKWARD BEAM CORRECTION EMITS NOTHING — a fresh sweep sample that lands '
    + 'behind the cursor must not re-march arc the beam already swept', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MAX);
    const own = { x: 0, y: 0 };
    radar.setHeightRaster(RING_OF_LAND);
    radar.onSweepSample(0, 0);
    frame(radar, cam, own, 0);
    frame(radar, cam, own, 100); // beam at 0.157 rad, cursor marched up behind it
    const held = radar.livePaints;
    expect(held, 'the ordinary path emitted').toBeGreaterThan(0);
    // A corrected sample: the authoritative beam is a little BEHIND where the
    // client had extrapolated it to. `wrapPositive` reads that as ~2π, which the
    // catch-up path would otherwise treat as a hopelessly late frame.
    radar.onSweepSample(0.1, 150);
    frame(radar, cam, own, 150);
    expect(radar.livePaints, 'no duplicate wedge').toBe(held);
  });
});

// --- 6e. AN AGROUND OBSERVER MAKES NO PAINTS ------------------------------------

describe('an aground observer creates no paints at all', () => {
  const ISLAND = rasterFrom(600, slab(0, 0, 200, 200, 200));

  it('a set standing ON a landmass does not paint it from zero range', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    radar.setHeightRaster(ISLAND);
    radar.onSweepSample(-0.6, 0);
    for (let t = 0; t <= 4600; t += 100) frame(radar, cam, { x: 0, y: 0 }, t);
    expect(radar.livePaints, 'a whole revolution, nothing painted').toBe(0);
    expect(radar.bandAt(60, 60), 'not even the ground underfoot').toBe(-1);
  });

  it('and a wire echo arriving while aground is not painted either', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    radar.setHeightRaster(ISLAND);
    frame(radar, cam, { x: 0, y: 0 }, 900);
    radar.onBlip(echo(400, 0).e);
    frame(radar, cam, { x: 0, y: 0 }, 1000);
    expect(radar.livePaints).toBe(0);
  });

  it('but the same observer AFLOAT paints normally — the guard is the ground, '
    + 'not the raster', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    radar.setHeightRaster(ISLAND);
    radar.onSweepSample(-0.6, 0);
    for (let t = 0; t <= 4600; t += 100) frame(radar, cam, { x: 0, y: 400 }, t);
    expect(radar.livePaints).toBeGreaterThan(50);
  });
});

// --- 6f. A RIM ECHO PAINTS EVEN WHEN IT IS OUTSIDE THE CLIENT'S OWN RANGE -------

describe('anything the server blips paints (amendment 127), at any range', () => {
  it('a wire echo BEYOND the client-computed radar range still paints', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    const own = { x: 0, y: 0 };
    // The server blipped this hull against ITS pose and ITS range; under
    // prediction divergence or a lag spike the client's own idea of the rim can
    // sit short of it. The march used to clip every ray to the client's range,
    // so every ray stopped BEFORE the stamped footprint and the slice was null.
    const far = echo(RADAR + 40, 0);
    frame(radar, cam, own, 900);
    radar.onBlip(far.e);
    frame(radar, cam, own, 1000);
    expect(radar.bandAt(far.x, far.y), 'the rim echo painted').toBeGreaterThanOrEqual(0);
  });

  it('and so does one just inside it — the widened bound changed nothing there', () => {
    const { radar } = harness();
    const cam = camera(USER_ZOOM_MIN);
    const own = { x: 0, y: 0 };
    const inside = echo(RADAR - 40, 0);
    frame(radar, cam, own, 900);
    radar.onBlip(inside.e);
    frame(radar, cam, own, 1000);
    expect(radar.bandAt(inside.x, inside.y)).toBeGreaterThanOrEqual(0);
  });
});

// --- 7. `silhouette` is untouched (amendment 99) ---------------------------------

describe('`silhouette` mode never grows a buffer, camera or not', () => {
  it('allocates no heatmap even when a view rect is supplied every frame', () => {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'silhouette');
    const cam = camera(USER_ZOOM_MIN);
    radar.setHeightRaster(rasterFrom(600, slab(350, 0, 70, 90, 255)));
    radar.onSweepSample(-0.6, 0);
    frame(radar, cam, { x: 0, y: 0 }, 0);
    frame(radar, cam, { x: 0, y: 0 }, 900);
    radar.onBlip({
      k: 'blip', id: 'trk-s', x: 0, y: 500, t: 900, cls: 'battleship', heading: 0, speed: 20,
    });
    frame(radar, cam, { x: 0, y: 0 }, 1000);
    expect(radar.heatDims, 'no buffer at all').toBeNull();
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(0, 500)).toBe(-1);
    expect(radar.liveBlips, 'and the 4.2 outline still paints').toBe(1);
    expect(
      layer.children.some((c) => c instanceof Sprite && c.label !== DIM_MASK_LABEL),
      'no heatmap sprite',
    ).toBe(false);
  });
});

// --- 8. THE NEAR-RANGE DIM MASK (Story 4.11, amendment 181) ----------------------
//
// PINNED AT THE ADAPTER, BECAUSE NOTHING ELSE CAN SEE IT. The mask is a DISPLAY
// transform over the composited layer — it touches no cell, no slice and no
// intensity — so `bandAt`, `intensityAt` and every grid-level assertion in
// radarHeatmap.test.ts are structurally blind to it. What can go wrong with it is
// therefore exactly what amendment 98 says to test here: where the object is,
// what it is scaled to, and what it is attached to.
//
// THE TWO SHIPPED-BUG SHAPES THIS GUARDS:
//   • ATTACHED TO THE WRONG THING. `fitHeat` DESTROYS the heat sprite and adds a
//     new one whenever the buffer resizes, so a mask assigned to `heat.sprite`
//     disappears on the next zoom change and is never seen again.
//   • PLACED ON A PAINTING FRAME ONLY. `paintHeat` returns early when there are
//     no paints, so hanging placement off that path leaves the ramp parked at a
//     stale hull position for as long as the scope stays empty.

describe('the near-range dim mask', () => {
  const DIM = CLIENT_CONFIG.blip.heatmap.dim;

  it('BOTH RADII COME OFF THE EIGHTHS LADDER, never off a literal', () => {
    expect(DIM.innerU).toBeCloseTo(RADAR / 8, 12);
    expect(DIM.outerU).toBeCloseTo((RADAR * 5) / 8, 12);
    expect(DIM.minScale, "Eric's 20% floor").toBe(0.2);
  });

  it('hangs on the LAYER, not on the heat sprite — and survives the resize that '
    + 'destroys one', () => {
    const { radar, layer } = harness();
    const own = { x: 0, y: 0 };
    radar.setHeightRaster(rasterFrom(600, slab(300, 0, 60, 80, 255)));
    frame(radar, camera(USER_ZOOM_MAX), own, 0);
    frame(radar, camera(USER_ZOOM_MAX), own, 900);
    const before = heatSprite(layer);
    expect(layer.mask, 'the layer carries the mask').toBe(radar.dimMask);
    expect(radar.dimMask.parent, 'and the mask lives in the layer').toBe(layer);

    // A zoom change big enough to resize the buffer: `fitHeat` destroys the old
    // sprite and adds a new one. A mask on THAT object would be gone now.
    frame(radar, camera(USER_ZOOM_MIN), own, 1000);
    expect(heatSprite(layer), 'the heat sprite really was replaced').not.toBe(before);
    expect(layer.mask, 'the mask is still attached').toBe(radar.dimMask);
  });

  it('tracks own hull in WORLD units every frame — including a frame that paints '
    + 'NOTHING AT ALL', () => {
    // NO SWEEP SAMPLE, so the beam never advances and no slice is ever marched:
    // `paintHeat` takes its `paints.length === 0` early return on every frame,
    // which is precisely the path a placement hung off it would miss.
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'return');
    const cam = camera(1);
    frame(radar, cam, { x: 0, y: 0 }, 0);
    expect(radar.livePaints, 'the fixture really paints nothing').toBe(0);
    expect(radar.dimMask.position.x).toBeCloseTo(0, 9);
    expect(radar.dimMask.position.y).toBeCloseTo(0, 9);

    frame(radar, cam, { x: 1234, y: -567 }, 500);
    expect(radar.livePaints).toBe(0);
    expect(radar.dimMask.position.x, 'still followed the hull').toBeCloseTo(1234, 9);
    expect(radar.dimMask.position.y).toBeCloseTo(-567, 9);
    expect(layer.mask, 'and stayed attached').toBe(radar.dimMask);
  });

  it('is ZOOM-INVARIANT: it is sized in world units, so the camera never moves '
    + 'the ramp relative to the water', () => {
    const { radar } = harness();
    const own = { x: 80, y: -40 };
    const at = (zoom: number): { sx: number; sy: number } => {
      frame(radar, camera(zoom), own, 900);
      return { sx: radar.dimMask.scale.x, sy: radar.dimMask.scale.y };
    };
    const zoomedIn = at(USER_ZOOM_MAX);
    const zoomedOut = at(USER_ZOOM_MIN);
    expect(zoomedOut, 'the camera never touches it').toEqual(zoomedIn);
    // One texel is `2 · span / size` WORLD units, so the sprite's world
    // half-extent IS the configured span and the ramp's two radii land on the
    // eighths ladder whatever resolution the texture was baked at.
    expect(zoomedIn.sx * (DIM_MASK_TEXTURE_SIZE / 2), 'world half-extent = spanU')
      .toBeCloseTo(DIM.spanU, 6);
    expect(zoomedIn.sx, 'square').toBeCloseTo(zoomedIn.sy, 12);
  });

  it('COVERS EVERY CELL THE RADAR CAN DRAW: a sprite mask clips to its own '
    + 'frame, so the span has to outreach a boon-widened scope plus a whole '
    + "phosphor life of own-ship travel", () => {
    // ~2.01× base radar (the boon ceiling) plus a fast hull's 12s of travel.
    const boonScope = RADAR * 2.01;
    const travel = 60 * (blipLifeMs(60_000 / CONFIG.vision.sweepRpm) / 1000);
    expect(DIM.spanU, 'the mask reaches past the furthest possible paint')
      .toBeGreaterThan(boonScope + travel);
  });

  it('comes OFF when there is no own hull — a stale mask would hide every '
    + 'spectate-mode contact outside a square around the origin', () => {
    const { radar, layer } = harness();
    frame(radar, camera(1), { x: 300, y: 300 }, 0);
    expect(layer.mask).toBe(radar.dimMask);
    radar.render(null, 500, null, null);
    expect(layer.mask ?? null, 'no own pose, no mask').toBeNull();
    // ...and `clearBlips` (entering spectate) tears it down too.
    frame(radar, camera(1), { x: 300, y: 300 }, 900);
    expect(layer.mask).toBe(radar.dimMask);
    radar.clearBlips();
    expect(layer.mask ?? null, 'cleared').toBeNull();
  });

  it('COMES OFF FOR A NON-FINITE OWN POSE TOO — a mask does not DEGRADE under a '
    + 'NaN, it BLANKS THE WHOLE LAYER (review gate)', () => {
    // A sprite mask clips to its own frame, and a sprite positioned at NaN has
    // no frame — so one non-finite own coordinate would hide every heat cell and
    // every `silhouette` blip on the scope, not merely dim them wrongly. The
    // march already treats a non-finite observer as reachable (`marchable`
    // checks `obs.x + obs.y`), so this is the same input arriving one method
    // over. Detaching is the deliberate degradation: an UNDIMMED scope beats a
    // HIDDEN one, because the dim is legibility and the returns are the
    // instrument.
    const { radar, layer } = harness();
    const cam = camera(1);
    frame(radar, cam, { x: 300, y: 300 }, 0);
    expect(layer.mask).toBe(radar.dimMask);

    for (const own of [{ x: Number.NaN, y: 300 }, { x: 300, y: Infinity }]) {
      radar.render(own, 500, null, cam.worldView);
      expect(layer.mask ?? null, `own = (${own.x}, ${own.y}): the mask comes off`).toBeNull();
      expect(Number.isFinite(radar.dimMask.position.x), 'and never takes a NaN position')
        .toBe(true);
      expect(Number.isFinite(radar.dimMask.position.y)).toBe(true);
    }

    // ...and a finite pose puts it straight back.
    frame(radar, cam, { x: 300, y: 300 }, 900);
    expect(layer.mask, 'recovered').toBe(radar.dimMask);
  });

  it('MASKS THE `silhouette` GRAMMAR TOO — it is a property of the display, not '
    + 'of the return grammar', () => {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'silhouette');
    radar.onSweepSample(0, 0);
    radar.render({ x: 10, y: 20 }, 100, null, null);
    expect(layer.mask).toBe(radar.dimMask);
    expect(radar.dimMask.position.x).toBeCloseTo(10, 9);
  });

  it('NEVER DRAWS ITSELF: the mask is non-renderable, so it can never appear as '
    + 'a grey square over the ocean', () => {
    const { radar } = harness();
    expect(radar.dimMask.renderable).toBe(false);
    expect(radar.dimMask.label).toBe(DIM_MASK_LABEL);
  });

  it('AND IT TOUCHES NOTHING (amendment 83): moving own ship moves the MASK and '
    + 'leaves every frozen paint record byte-identical', () => {
    const { radar } = harness();
    radar.setHeightRaster(rasterFrom(600, slab(300, 0, 60, 80, 255)));
    const cam = camera(1);
    frame(radar, cam, { x: 0, y: 0 }, 0);
    frame(radar, cam, { x: 0, y: 0 }, 900);
    const frozen = radar.paintList.map((s) => [...s.w.subarray(0, s.n)]);
    expect(frozen.length, 'the scope really painted').toBeGreaterThan(0);

    // Walk own ship a long way. The mask follows it — and the records it walked
    // past do not move one bit. (Later frames enrol NEW
    // slices at the end of the list; the ones already there are the history.)
    radar.render({ x: 900, y: 900 }, 950, null, cam.worldView);
    expect(radar.dimMask.position.x).toBeCloseTo(900, 9);
    const after = radar.paintList.slice(0, frozen.length);
    expect(after.map((s) => [...s.w.subarray(0, s.n)])).toEqual(frozen);
  });
});
