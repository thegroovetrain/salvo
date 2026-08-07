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
// AND THE OTHER HALF OF THE RULING — amendment 97, Eric's stated requirement:
// *"if I am zoomed in when it paints and then I zoom out, it still shows me
// everything that would have been there."* That holds only if NOTHING
// viewport-derived reaches paint creation or retirement, so the last two blocks
// prove exactly that: the same world state driven through two very different
// cameras yields byte-identical paint lists, and a paint recorded off-screen at
// max zoom is on the scope the moment the camera zooms out.

import { describe, it, expect, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { CONFIG, islandFromPolygon, type ReturnBlipEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ContactStore } from '../net/snapshots.js';
import { Camera, USER_ZOOM_MAX, USER_ZOOM_MIN } from '../render/camera.js';
import { Radar, type ViewRect } from '../render/radar.js';
import { GRID_QUANTUM, anchorGrid, gridSpan, makeGrid } from '../render/radarHeatmap.js';
import { blipLifeMs } from '../render/phosphor.js';

// jsdom has no 2d canvas, so the baked sweep wedge can't rasterize here; the
// heatmap buffer (what this file is about) needs no canvas at all.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return { ...actual, bakeSweepTexture: (): Texture => Texture.EMPTY };
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

/** The heatmap sprite (the only Sprite the `return` grammar adds to the layer). */
function heatSprite(layer: Container): Sprite {
  const s = layer.children.find((c): c is Sprite => c instanceof Sprite);
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
 * Alpha-weighted centroid (and world bounding box) of the lit texels → the
 * sprite's local space → screen px through the live scene-graph transform →
 * world through the camera's own inverse. Every number the adapter chose
 * (sprite position, sprite scale, grid origin, texel indexing) is in that path,
 * and the reference at the end of it (`screenToWorld`) shares none of them.
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
    sw += t.a;
    sx += t.a * (t.tx + 0.5);
    sy += t.a * (t.ty + 0.5);
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

/** One wire echo at a world point, ext 100u. */
function echo(x: number, y: number, t = 1000, id = 'trk-1'): ReturnBlipEvent {
  return { k: 'blip', id, x, y, ext: 100, t };
}

/** Render one frame with the camera centred on `own` (the alive framing). */
function frame(radar: Radar, cam: Camera, own: { x: number; y: number }, t: number): ViewRect {
  cam.snapTo(own);
  const view = cam.worldView;
  radar.render(own, t, null, view);
  return view;
}

/** Placement tolerance: an echo is a noisy kernel quantized onto whole cells,
 *  so its measured centroid is good to about a cell. A placement BUG is never
 *  sub-cell — cycle 57's islands drifted by hundreds of units. */
const TOL = CELL * 1.5;

// --- 1. PLACEMENT, at both zoom extremes (amendment 98) -------------------------

describe('an echo renders at the world position it was created at', () => {
  for (const [label, z] of [['USER_ZOOM_MIN', USER_ZOOM_MIN], ['USER_ZOOM_MAX', USER_ZOOM_MAX]] as const) {
    it(`places it exactly there at ${label} (${z}×)`, () => {
      const { radar, layer, chart } = harness();
      const cam = camera(z);
      const own = { x: 1200, y: -800 }; // nowhere near the origin: an origin bug hides there
      const e = echo(own.x + 240, own.y - 180);
      frame(radar, cam, own, 900);
      radar.onBlip(e);
      frame(radar, cam, own, 1000);

      const m = measure(layer, chart, cam);
      expect(m.cells, 'the echo lit some texels').toBeGreaterThan(0);
      expect(m.x, `x at ${label}`).toBeCloseTo(e.x, -Math.log10(TOL));
      expect(Math.abs(m.x - e.x), `x within ${TOL}u at ${label}`).toBeLessThan(TOL);
      expect(Math.abs(m.y - e.y), `y within ${TOL}u at ${label}`).toBeLessThan(TOL);
    });
  }

  it('one texel is one world cell at BOTH zooms — the sprite scale is not a '
    + 'zoom-dependent fudge', () => {
    for (const z of [USER_ZOOM_MIN, USER_ZOOM_MAX]) {
      const { radar, layer } = harness();
      const cam = camera(z);
      const own = { x: 0, y: 0 };
      frame(radar, cam, own, 900);
      radar.onBlip(echo(300, 0));
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
    radar.onBlip(e);

    // Steam past it, one frame at a time, through many whole-cell boundaries and
    // several deliberately fractional camera centres (a snap bug shows up as
    // sub-cell jitter that accumulates into a drift).
    for (const step of [0, 3.5, 17.25, 61.9, 120, 233.75, 400]) {
      frame(radar, cam, { x: -step, y: step * 0.5 }, 1000 + step);
      const m = measure(layer, chart, cam);
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
    radar.onBlip(e);
    for (const z of [USER_ZOOM_MAX, 1.2, 1.0, 0.75, USER_ZOOM_MIN, 1.5]) {
      cam.setUserZoom(z);
      frame(radar, cam, own, 1000);
      const m = measure(layer, chart, cam);
      expect(Math.abs(m.x - e.x), `x at ${z}×`).toBeLessThan(TOL);
      expect(Math.abs(m.y - e.y), `y at ${z}×`).toBeLessThan(TOL);
    }
  });

  it('an ISLAND holds still too — the landmass is the thing Eric watched drift', () => {
    const isle = islandFromPolygon([
      { x: 380, y: -90 }, { x: 620, y: -90 }, { x: 620, y: 90 }, { x: 380, y: 90 },
    ]);
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MIN);
    radar.setIslands([isle]);
    radar.onSweepSample(-0.6, 0);
    frame(radar, cam, { x: 0, y: 0 }, 0);
    frame(radar, cam, { x: 0, y: 0 }, 900); // beam crosses bearing 0, bakes the paint
    expect(radar.liveIslandPaints).toBe(1);
    // The observer sits at the origin and steams west to x = -330.25 below, and
    // sea clutter paints a `clutterRangeU` disc about wherever it was when the
    // beam crossed — with 3-deep persistence, every one of those discs stays lit.
    // HAZE is the union of them all, and it is nowhere near the 380..620 ridge
    // this test is measuring (nearest approach is 545u), so excluding it isolates
    // the landmass without weakening a single bound.
    const HAZE = { x: -165, y: 0, r: 300 };
    const first = measure(layer, chart, cam, HAZE);
    // ABSOLUTE first: the lit mass sits on the REAL coastline. The near face of
    // a 380..620 × -90..90 ridge seen from the origin runs the full height at
    // its western edge, so the rendered bounds must open at x = 380 — not merely
    // be self-consistent frame to frame.
    //
    // PLUS THE SURF FRINGE (Story 4.10, amendment 131): breakers paint up to
    // `surfBandU` SEAWARD of that coastline, so the lit region legitimately opens
    // a band's width further west and cannot open any further than that. Both
    // bounds are asserted, which pins the fringe's placement as well as the
    // coast's — a fringe on the wrong side, or one that ran on for a hundred
    // units, fails here.
    const SURF = CLIENT_CONFIG.blip.heatmap.model.surfBandU;
    expect(first.minX, 'no lit cell west of the surf band').toBeGreaterThan(380 - SURF - TOL);
    expect(first.minX, 'and the fringe does reach out past the coast').toBeLessThan(380);
    expect(first.maxX, 'and the far side stays in shadow').toBeLessThan(620);
    // ...then STABLE: steaming away must not move one cell of it.
    for (const step of [40, 90.5, 210, 330.25]) {
      frame(radar, cam, { x: -step, y: 0 }, 950);
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
    radar.onBlip(rim);
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
    radar.onBlip(e);
    frame(radar, cam, { x: 0, y: 0 }, 1000);
    expect(radar.bandAt(e.x, e.y), 'on screen at first').toBeGreaterThanOrEqual(0);

    frame(radar, cam, { x: 0, y: -2000 }, 1050); // scrolled off the top of the screen
    expect(radar.bandAt(e.x, e.y), 'off screen: not drawn').toBe(-1);
    expect(radar.livePaints, 'but still RECORDED — never retired by visibility').toBe(1);

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
    for (const e of off) radar.onBlip(e);
    frame(radar, cam, own, 1000);

    expect(radar.livePaints, 'all three RECORDED while zoomed in').toBe(3);
    for (const e of off) {
      expect(radar.bandAt(e.x, e.y), `not drawn while zoomed in: ${e.id}`).toBe(-1);
    }

    cam.setUserZoom(USER_ZOOM_MIN);
    frame(radar, cam, own, 1001); // one frame later: no new sweep, no new paint
    expect(radar.livePaints, 'zooming out creates nothing').toBe(3);
    for (const e of off) {
      expect(radar.bandAt(e.x, e.y), `revealed by zooming out: ${e.id}`).toBeGreaterThanOrEqual(0);
    }
  });
});

// --- 5. NOTHING VIEWPORT-DERIVED REACHES CREATION OR RETIREMENT (amendment 97) ---

/** The paint list as comparable data. `isle` is replaced by its index so two
 *  radars sharing one island field compare structurally rather than by identity. */
function listOf(radar: Radar, field: readonly unknown[]): string {
  return JSON.stringify(
    radar.paintList.map((p) => (p.kind === 'island' ? { ...p, isle: field.indexOf(p.isle) } : p)),
  );
}

describe('the camera cannot touch what is painted or when it is retired', () => {
  const ISLE = islandFromPolygon([
    { x: 380, y: -90 }, { x: 620, y: -90 }, { x: 620, y: 90 }, { x: 380, y: 90 },
  ]);
  const FIELD = [ISLE];

  /** Identical world state, one camera. Contacts, islands, wire echoes — every
   *  source of paints in the grammar. */
  function run(view: (own: { x: number; y: number }) => ViewRect | null, times: number[]): Radar {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'return');
    const contacts = new ContactStore();
    contacts.pushFrame(0, [{ id: 'ship-7', x: 200, y: 0, heading: 0, speed: 0, cls: 'battleship' }]);
    radar.setIslands(FIELD);
    radar.onSweepSample(-0.6, 0);
    const own = { x: 0, y: 0 };
    for (const t of times) {
      if (t === 400) radar.onBlip(echo(500, 300, 400, 'wire-1'));
      radar.render(own, t, contacts, view(own));
    }
    return radar;
  }

  const TIMES = [0, 200, 400, 600, 900];

  it('two radars driven through wildly different cameras hold BYTE-IDENTICAL '
    + 'paint lists', () => {
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
    expect(listOf(wide, FIELD)).toBe(listOf(tight, FIELD));
    expect(listOf(none, FIELD)).toBe(listOf(tight, FIELD));
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

// --- 6b. THE TWO NEW SOURCES, PINNED AT THE ADAPTER (Story 4.10 + amendment 98) --
//
// Same standing order, new paints: a pure-rasterizer test does NOT discharge
// placement, so the storm wall and the sea-clutter haze are measured HERE,
// through the real sprite transform, at both zoom extremes and with the camera
// moving. Cycle 57 shipped a placement regression under green pure tests; these
// blocks exist so a fifth and sixth source cannot repeat it.
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
 * Run a whole beam revolution so a weather paint opens AND fills its arc.
 *
 * The beam starts just short of the weather anchor bearing, so the paint opens
 * early in the run and its arc has a full revolution to grow — a weather paint
 * fills in behind the beam exactly as an island's does, so a half-swept scope is
 * a half-drawn ring by design, not a bug to test around.
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
      expect(radar.paintList.some((p) => p.kind === 'storm'), 'no storm paint').toBe(false);
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
      for (const d of [6, REACH * 0.3, REACH * 0.6]) {
        const w = radar.intensityAt(OWN.x + d, OWN.y);
        expect(w, `intensity at ${d}u`).toBeGreaterThan(0);
        expect(w, 'and never strong enough to read blue').toBeLessThan(FUZZY);
      }
      expect(radar.intensityAt(OWN.x + REACH * 1.5, OWN.y), 'beyond the disc').toBe(0);
      expect(radar.bandAt(OWN.x + 6, OWN.y), 'never above the weakest band')
        .toBeLessThan(1);
    });
  }

  it('stays where it was frozen as the camera moves — the haze does not follow '
    + 'the boat within a revolution', () => {
    const { radar, layer, chart } = harness();
    const cam = camera(USER_ZOOM_MIN);
    revolution(radar, cam, OWN, null);
    const first = measure(layer, chart, cam);
    for (const step of [12, 90, 240]) {
      frameZone(radar, cam, { x: OWN.x + step, y: OWN.y }, 4500 + step, null);
      expect(radar.intensityAt(OWN.x + 6, OWN.y), `still at the old ship at ${step}u`)
        .toBeGreaterThan(0);
      const m = measure(layer, chart, cam);
      expect(Math.abs(m.x - first.x), `haze x after ${step}u of camera travel`)
        .toBeLessThan(TOL);
      expect(Math.abs(m.y - first.y), `haze y after ${step}u`).toBeLessThan(TOL);
    }
  });
});

// --- 6c. THE WEATHER ARC NEVER COLLAPSES, AT THE ADAPTER ------------------------
//
// The bookkeeping that fills a weather arc in behind the beam lives in this
// adapter, not in the pure sources, so it is pinned here: walk many frames
// across the anchor bearing and watch the lit-texel count. A paint opened at the
// FRAME's `from` — a hair short of the anchor — made `wrapPositive(to − from)`
// wrap a nearly-full arc down to a sliver on the last frame of most revolutions,
// so the haze and the wall blinked out for one frame roughly every other turn.

describe('the haze and the wall never blink out for a frame', () => {
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

// --- 7. `silhouette` is untouched (amendment 99) ---------------------------------

describe('`silhouette` mode never grows a buffer, camera or not', () => {
  it('allocates no heatmap even when a view rect is supplied every frame', () => {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'silhouette');
    const cam = camera(USER_ZOOM_MIN);
    radar.setIslands([islandFromPolygon([
      { x: 280, y: -90 }, { x: 420, y: -90 }, { x: 420, y: 90 }, { x: 280, y: 90 },
    ])]);
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
    expect(layer.children.some((c) => c instanceof Sprite), 'no heatmap sprite').toBe(false);
  });
});
