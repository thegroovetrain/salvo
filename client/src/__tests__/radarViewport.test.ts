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

/**
 * WHERE THE ECHO ACTUALLY LANDS, in world units, measured the long way.
 *
 * Alpha-weighted centroid (and world bounding box) of the lit texels → the
 * sprite's local space → screen px through the live scene-graph transform →
 * world through the camera's own inverse. Every number the adapter chose
 * (sprite position, sprite scale, grid origin, texel indexing) is in that path,
 * and the reference at the end of it (`screenToWorld`) shares none of them.
 */
function measure(layer: Container, chart: Container, cam: Camera): Measured {
  const sprite = heatSprite(layer);
  const lit = litTexels(sprite);
  if (lit.length === 0) throw new Error('nothing lit');
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let lo = { tx: Infinity, ty: Infinity };
  let hi = { tx: -Infinity, ty: -Infinity };
  for (const t of lit) {
    sw += t.a;
    sx += t.a * (t.tx + 0.5);
    sy += t.a * (t.ty + 0.5);
    lo = { tx: Math.min(lo.tx, t.tx), ty: Math.min(lo.ty, t.ty) };
    hi = { tx: Math.max(hi.tx, t.tx + 1), ty: Math.max(hi.ty, t.ty + 1) };
  }
  applyCamera(cam, chart);
  // Texel space → screen (the live scene-graph transform) → world (the camera's
  // own inverse). The transform is scale + translate only, so the bounding box
  // maps corner-wise.
  const at = (tx: number, ty: number) => cam.screenToWorld(sprite.toGlobal({ x: tx, y: ty }));
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
    const first = measure(layer, chart, cam);
    // ABSOLUTE first: the lit mass sits on the REAL coastline. The near face of
    // a 380..620 × -90..90 ridge seen from the origin runs the full height at
    // its western edge, so the rendered bounds must open at x = 380 and span the
    // full y extent — not merely be self-consistent frame to frame.
    expect(Math.abs(first.minX - 380), 'west coast where the polygon has it').toBeLessThan(TOL);
    expect(Math.abs(first.minY - -90), 'south coast').toBeLessThan(TOL);
    expect(Math.abs(first.maxY - 90), 'north coast').toBeLessThan(TOL);
    expect(first.maxX, 'and the far side stays in shadow').toBeLessThan(620);
    // ...then STABLE: steaming away must not move one cell of it.
    for (const step of [40, 90.5, 210, 330.25]) {
      frame(radar, cam, { x: -step, y: 0 }, 950);
      const m = measure(layer, chart, cam);
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
    radar.paintList.map((p) => (p.kind === 'ship' ? p : { ...p, isle: field.indexOf(p.isle) })),
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
