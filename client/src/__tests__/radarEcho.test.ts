// The `return`-grammar acquire path of render/radar.ts — the Pixi adapter around
// the beam march (cycle 62, amendments 138-144), exercised through the real scene
// graph. The march's own math is pinned in radarMarch.test.ts and the band
// contract in radarHeatmap.test.ts; PLACEMENT is pinned in radarViewport.test.ts
// (amendment 98). This file is about the ADAPTER's contracts.
//
// WHAT IS CONTRACT HERE, not coverage:
//   • A PAINT IS POSED FROM A REAL OBSERVER OR NOT AT ALL. Radar paints arrive on
//     network cadence, not render cadence, so one can land before the first render
//     (join) or in any later gap where the own pose is unknown. Geometry is frozen
//     at resolve and the paint then decays for ~12s, so a guessed observer is not
//     a one-frame cosmetic — it is twelve seconds of a mark attenuated for the
//     wrong range on a bearing the contact does not hold.
//   • ONCE MARCHED IT STAYS FROZEN. The deferral exists to stop a paint being born
//     wrong, not to make it track the observer: a phosphor paint is a historical
//     snapshot and must not re-pose as the ship moves.
//   • TWO ARRIVAL PATHS, ONE MODEL AND ONE LIST (amendments 89 + 141). Inside
//     truesight the client stamps a hull into the field from its `Contact` and the
//     beam paints it on the crossing; beyond truesight the echo arrives on the
//     wire ALREADY sweep-gated by the server's own beam, and is marched at once.
//     `sightHoleU` is the SOURCE SEAM that keeps them from overlapping — never a
//     suppression boundary.
//   • THE SLICE LIST IS THE HISTORY, THE BUFFER IS DERIVED (ruling R1). Nothing
//     decays in place; the buffer is re-rasterized in full every frame from the
//     surviving slices. Retirement is by TIME and nothing else — there is no
//     per-track cap left to key on, because a slice is a wedge of the world rather
//     than a mark on one object.
//   • TERRAIN COMES FROM THE HEIGHT RASTER, and the beam paints all of it — near
//     face, far face, and whatever stands behind it (amendment 140).

import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics, Texture } from 'pixi.js';
import {
  CONFIG,
  WAKE_AGE_BUCKETS,
  buildHeightRaster,
  coverageHas,
  paintCoverage,
  rasterizeSegmentCoverage,
  type HeightRaster,
  type HullId,
  type ReturnBlipEvent,
  type WakeBlipEvent,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ContactStore } from '../net/snapshots.js';
import { Radar } from '../render/radar.js';
import { fogHoleRadiusU } from '../render/fog.js';
import { blipLifeMs } from '../render/phosphor.js';
import { wakeLitFloor } from '../render/radarSources.js';

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

const OWN = { x: 0, y: 0 };
const LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);
const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const RCELL = 14; // the shipped generator's height-field sample spacing

function makeRadar(): { radar: Radar; layer: Container } {
  const layer = new Container();
  const radar = new Radar(layer, new Container());
  radar.onSweepSample(0, 0);
  return { radar, layer };
}

/** A HeightRaster over a square about the origin — the march's only terrain
 *  input, and what replaced the retired island field. */
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

/** Like `rasterFrom`, but with a REAL max-height pyramid — the production shape,
 *  and the only one the Story 4.11 shadow walk will march (it fails OPEN without
 *  one, which is what keeps every other fixture in this file unshadowed). */
function rasterWithPyramid(reachU: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reachU / RCELL);
  const n = 2 * k + 1;
  const x0 = -k * RCELL;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) v[j * n + i] = h(x0 + i * RCELL, x0 + j * RCELL);
  }
  return buildHeightRaster({ n, cell: RCELL, x0, y0: x0, v }, 0, 255);
}

/** A rectangular ridge of land at a uniform height. */
function ridge(cx: number, cy: number, hw: number, hh: number, h = 255) {
  return (x: number, y: number): number =>
    Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh ? h : 0;
}

/** Run a whole beam revolution, so the march has walked every bearing. */
function revolution(radar: Radar, own = OWN, contacts: ContactStore | null = null): void {
  radar.onSweepSample(-0.6, 0);
  for (let t = 0; t <= 4200; t += 100) radar.render(own, t, contacts);
}

/** A wire coverage footprint for a hull pose — the cycle-63 payload, built by
 *  the SAME shared paint pipeline the server runs (rasterize + fuzz, seeded
 *  from the paint time and pose — amendments 156-157). The record keeps the
 *  pose beside the wire event, because the event itself deliberately carries
 *  no position, class or id any more (amendment 152). */
interface TestEcho { e: ReturnBlipEvent; x: number; y: number }
function wireEcho(cls: HullId, x: number, y: number, heading: number, t = 1000): TestEcho {
  const c = paintCoverage(cls, x, y, heading, CELL, t);
  return { e: { k: 'blip', t, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits }, x, y };
}

/** A battleship 500u due +y of the origin, heading +x (broadside to the
 *  observer): the true footprint is much WIDER (its 124u length, in x) than it
 *  is tall (its 48u beam, in y) — a fogged hull finally points the way it is
 *  headed, which is the complaint this cycle exists to fix. */
const PAINT: TestEcho = wireEcho('battleship', 0, 500, 0);

/** Extent of the lit region along one world axis through the paint centre. */
function litSpan(radar: Radar, axis: 'x' | 'y', cross: number, at: number): number {
  let span = 0;
  for (let d = -400; d <= 400; d += CELL) {
    const x = axis === 'x' ? cross + d : at;
    const y = axis === 'x' ? at : cross + d;
    if (radar.bandAt(x, y) >= 0) span += CELL;
  }
  return span;
}

describe('`return` paints are posed from a real observer or not at all', () => {
  it('holds a paint that arrives before the first render, painting nothing', () => {
    const { radar } = makeRadar();
    radar.onBlip(PAINT.e);
    expect(radar.livePaints).toBe(0); // parked, not marched
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });

  it('marches it on the FIRST frame with an own pose — and the footprint is the '
    + 'TRUE ORIENTED HULL, not a streak across the bearing', () => {
    const { radar } = makeRadar();
    radar.onBlip(PAINT.e); // arrives with no pose available
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(1);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBeGreaterThanOrEqual(0);
    // The hull heads +x, so the mark runs ALONG +x (its 124u length) and is
    // only its beam deep in y — the wire mask decides the shape, and the
    // observer decides nothing about it (cycle 63: the retired `stampEcho`
    // laid `ext` across the observer's bearing, one cell deep, which is why a
    // fogged hull never pointed the way it was moving).
    const across = litSpan(radar, 'x', 0, 500);
    const along = litSpan(radar, 'y', 500, 0);
    expect(across, 'orientation reads through the fuzz').toBeGreaterThan(along * 1.5);
    // The footprint is the hull's REAL length, cell-quantized and SMEARED —
    // the fuzz (dilation + stretch, amendments 156-157) can only ever make it
    // larger, up to 2 cells per side, never smaller than the hull.
    const grown = (span: number, trueU: number): void => {
      expect(span).toBeGreaterThanOrEqual(trueU - CELL);
      expect(span).toBeLessThanOrEqual(trueU + 5 * CELL);
    };
    grown(across, CONFIG.shipClasses.battleship.hull.length);
    grown(along, CONFIG.shipClasses.battleship.hull.beam);
  });

  it('marches immediately when a pose is already known — deferral is the '
    + 'exception, not the cadence', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900); // pose established first
    radar.onBlip(PAINT.e);
    expect(radar.livePaints).toBe(1);
  });

  it('freezes the geometry once marched — a paint is a historical snapshot', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT.e);
    radar.render(OWN, 950);
    const before = litSpan(radar, 'x', 0, 500);
    radar.render({ x: 400, y: 400 }, 1100); // observer moves; the paint must not
    expect(litSpan(radar, 'x', 0, 500)).toBe(before);
  });

  it('a wire echo is NOT held for the local beam — the server already swept it', () => {
    // `blipGate` fires on the tick the SERVER's beam crosses the hull, so the
    // client cannot wait for its own beam to come round: at 15rpm that is up to
    // four seconds, and a 45 u/s hull is 180u away by then.
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    // A bearing the beam is nowhere near (it sits at −0.6 rad and advances).
    const behind = wireEcho('battleship', 0, -500, 0, 10);
    radar.onBlip(behind.e);
    radar.render(OWN, 20); // the very next frame — the beam has moved 0.03 rad
    expect(radar.bandAt(behind.x, behind.y), 'painted on arrival')
      .toBeGreaterThanOrEqual(0);
  });
});

// --- THE WIRE VALIDATORS, DRIVEN AT THE ADAPTER (cycle-63 review gate) ----------
//
// Amendment 145's standing lesson: a test that exercises a pure function's
// branch has NOT tested the behaviour unless the adapter can reach that
// branch — so every case below goes through `radar.onBlip`, the exact door a
// malformed network payload comes through, and asserts on the adapter's own
// observable state (paints, bands, blips).

describe('malformed wire payloads are dropped whole at the adapter', () => {
  /** A valid echo the malformed variants are derived from. */
  function base(): ReturnBlipEvent {
    return wireEcho('battleship', 300, 0, 0, 1000).e;
  }

  it('a non-finite or far-future `t` paints nothing — a full-brightness mark that never decays is unrepresentable', () => {
    const { radar } = makeRadar(); // onSweepSample(0, 0): server time ~0 is the reference
    radar.render(OWN, 900);
    for (const t of [Number.NaN, Infinity, -Infinity, 1e15]) {
      radar.onBlip({ ...base(), t });
      radar.render(OWN, 1000);
      expect(radar.livePaints, `t=${t}`).toBe(0);
    }
    radar.onBlip(base()); // and a conforming paint still lands
    expect(radar.livePaints).toBe(1);
  });

  it('huge cell indices are dropped — they would break the cell-key injectivity premise and paint phantoms', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    for (const gx of [1e7, -1e7, 2 ** 31]) {
      radar.onBlip({ ...base(), gx });
      radar.render(OWN, 1000);
      expect(radar.livePaints, `gx=${gx}`).toBe(0);
    }
  });

  it('an oversized rect and a mis-sized bits array are dropped (the derived span bound)', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    const big = base();
    radar.onBlip({ ...big, w: 4096, bits: new Array<number>(Math.ceil((4096 * big.h) / 32)).fill(-1) });
    radar.onBlip({ ...big, bits: big.bits.slice(0, -1) });
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
  });

  it('the pending park is CAPPED while own pose is null — a join gap cannot grow it unboundedly', () => {
    const { radar } = makeRadar();
    // No render ever happens: own pose stays null and every echo parks.
    for (let i = 0; i < 400; i++) radar.onBlip(wireEcho('torpedoBoat', 300 + i, 0, 0, 100 + i).e);
    // The park is bounded at the same ceiling as the live-blip backstop, so
    // resolving it cannot enroll more than that many slices either.
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBeGreaterThan(0);
    expect(radar.livePaints).toBeLessThanOrEqual(128);
  });
});

describe('the slice list is the history and the buffer is derived (ruling R1)', () => {
  it('re-rasterizes from scratch: a paint that ages out leaves NOTHING behind', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT.e);
    radar.render(OWN, 1000);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBeGreaterThanOrEqual(0);
    radar.render(OWN, PAINT.e.t + LIFE + 1);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });

  it('holds the last `persistSweeps` revolutions of beam and no more — the depth '
    + 'is TIME, not a per-track count', () => {
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    // Four whole revolutions at 15rpm. The list should settle at the three the
    // phosphor keeps, and must not grow without bound.
    let peak = 0;
    for (let t = 0; t <= 16_000; t += 50) {
      radar.render(OWN, t);
      peak = Math.max(peak, radar.livePaints);
    }
    const perRev = Math.ceil((Math.PI * 2) / CLIENT_CONFIG.blip.heatmap.march.sliceRad);
    expect(peak, 'about three revolutions of slices').toBeLessThan(perRev * 4);
    expect(peak, 'and genuinely more than one').toBeGreaterThan(perRev);
  });

  it('clearBlips drops every paint (entering spectate)', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT.e);
    radar.clearBlips();
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });
});

describe('terrain paints from the height raster (amendments 129 + 140 + 142)', () => {
  const ISLE = rasterFrom(900, ridge(500, 0, 100, 90));

  it('paints the landmass the beam swept, and paints it SOLID', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(ISLE);
    revolution(radar);
    for (const x of [410, 450, 500, 550, 590]) {
      expect(radar.bandAt(x, 0), `land at x=${x}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('THE WHOLE EXTENT, near face AND far face — nothing occludes anything this '
    + 'cycle (amendment 140)', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(ISLE);
    revolution(radar);
    expect(radar.bandAt(405, 0), 'the near shore').toBeGreaterThanOrEqual(0);
    expect(radar.bandAt(585, 0), 'and the FAR shore, which used to be shadow')
      .toBeGreaterThanOrEqual(0);
  });

  it('and paints NOTHING on open water beside it — the raster is the authority', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(ISLE);
    revolution(radar);
    // 500 ± 140 in y is well clear of the 100 × 90 slab, inside radar range, and
    // comfortably beyond the sight bubble — so nothing but the raster answers.
    expect(Math.hypot(500, 140)).toBeGreaterThan(CONFIG.vision.sight);
    expect(radar.bandAt(500, 140)).toBe(-1);
    expect(radar.bandAt(500, -140)).toBe(-1);
  });

  it('a landmass never evicts a contact echo from the scope', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(ISLE);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.onBlip({ ...PAINT.e, t: 0 });
    for (let t = 100; t <= 4200; t += 100) radar.render(OWN, t);
    expect(radar.bandAt(500, 0), 'the landmass').toBeGreaterThanOrEqual(0);
    expect(radar.bandAt(PAINT.x, PAINT.y), 'and the echo').toBeGreaterThanOrEqual(0);
  });

  it('with NO raster at all the scope still runs — it simply carries no terrain', () => {
    const { radar } = makeRadar();
    revolution(radar);
    expect(radar.bandAt(500, 0)).toBe(-1);
    expect(radar.livePaints, 'the sea state still paints').toBeGreaterThan(0);
  });
});

// --- THE WIRE ECHO IS SHADOWED TOO (Story 4.11 review gate) ---------------------
//
// THE ADAPTER IS WHERE THIS CAN BREAK, which is why it is pinned here as well as
// in radarMarch.test.ts: the one-hull field only shadows what it is HANDED, so
// `marchEcho` failing to pass `heightRaster` would leave every wire echo painting
// at full strength while the scope around it went grey — and no march-level test
// could see it. Beyond truesight the wire is the ONLY source of a hull, so this
// is the tier the whole feature is about.

describe('a wire echo fades in terrain shadow, and is floored so it cannot vanish', () => {
  /** The echo used here sits on bearing 0 at 500u, with the cover between. */
  const ECHO = wireEcho('battleship', 500, 0, 0);

  /** What the buffer reads at the echo's centre, over a given terrain. NO BEAM
   *  ADVANCE: the sweep sample and the two frames share one timestamp, so the
   *  only slice in the list is the echo's own and nothing the beam painted can
   *  be mistaken for it. */
  function echoIntensity(raster: HeightRaster | null): number {
    const { radar } = makeRadar();
    if (raster !== null) radar.setHeightRaster(raster);
    radar.render(OWN, 1000);
    radar.onBlip({ ...ECHO.e, t: 1000 });
    expect(radar.livePaints, 'the echo marched').toBe(1);
    radar.render(OWN, 1000);
    return radar.intensityAt(ECHO.x, ECHO.y);
  }

  const SEA = rasterWithPyramid(900, () => 0);
  const SOFT = rasterWithPyramid(900, ridge(250, 0, 60, 200, CONFIG.vision.radarMastQ / 2));
  const HARD = rasterWithPyramid(900, ridge(250, 0, 60, 200, 255));

  it('SOFT COVER on the bearing dims it — the same echo, weaker', () => {
    const lit = echoIntensity(SEA);
    const dim = echoIntensity(SOFT);
    expect(lit, 'the echo paints over open water').toBeGreaterThan(0);
    expect(dim, 'and reads weaker behind half-mast terrain').toBeLessThan(lit);
    expect(dim, 'while still painting').toBeGreaterThan(0);
  });

  it('HARD COVER floors it at `minPeak` rather than erasing it (amendment 127)', () => {
    const dark = echoIntensity(HARD);
    expect(dark, 'a fully shadowed disclosed echo still paints its speck')
      .toBeCloseTo(Math.min(echoIntensity(SEA), CLIENT_CONFIG.blip.heatmap.model.minPeak), 6);
    expect(radarDraws(dark), 'and it is above the transparent threshold').toBe(true);
  });

  it('and a raster with no pyramid changes nothing — the walk fails OPEN, which '
    + 'is what every other fixture in this file relies on', () => {
    expect(echoIntensity(rasterFrom(900, ridge(250, 0, 60, 200, 255))))
      .toBeCloseTo(echoIntensity(null), 12);
  });
});

/** Would the heatmap draw this intensity at all (i.e. is it in a band)? */
function radarDraws(w: number): boolean {
  return w >= CLIENT_CONFIG.blip.heatmap.bands[0].at;
}

// --- THE WAKE ROW, DRIVEN AT THE ADAPTER (Story 4.12, amendments 194-206) -------
//
// A `wk` row is the ECHO PATH's sibling and is tested the same way, at the same
// door: same lattice, same world-anchored cell rect, same park-until-a-pose, same
// "already sweep-gated by the SERVER's beam" reasoning. What differs is what it
// is a row ABOUT (water, not a ship), that it carries a water-age bucket and NO
// identity, and that a ribbon discloses PER SEGMENT — which is why the adapter
// merges a tick's worth of them into one slice.

/** One disclosed wake segment on the wire, from the SAME shared rasterizer the
 *  server runs (`rasterizeSegmentCoverage`). Kept beside its world position, as
 *  the echo fixture is, because the row itself carries no position. */
interface TestWake { e: WakeBlipEvent; x: number; y: number }
function wireWake(x: number, y: number, a = 0, t = 1000, widthU = 32): TestWake {
  const step = CONFIG.vision.wakeSampleU;
  const c = rasterizeSegmentCoverage(x, y - step / 2, x, y + step / 2, widthU, CELL);
  return { e: { k: 'wk', t, a, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits }, x, y };
}

const WAKE: TestWake = wireWake(300, 0);

describe('a wake segment is posed from a real observer or not at all', () => {
  it('holds a segment that arrives before the first render, painting nothing', () => {
    const { radar } = makeRadar();
    radar.onWakeBlip(WAKE.e);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(WAKE.x, WAKE.y)).toBe(-1);
  });

  it('marches it on the first frame with an own pose, and it paints GREEN — the '
    + 'one register a wake may ever read', () => {
    const { radar } = makeRadar();
    radar.onWakeBlip(WAKE.e);
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(1);
    expect(radar.bandAt(WAKE.x, WAKE.y), 'the weakest register, never blue or red').toBe(0);
  });

  it('is NOT held for the local beam — the server\'s own beam already crossed it, '
    + 'so the very next frame paints it wherever it is', () => {
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    // A bearing the beam is nowhere near (it sits at −0.6 rad and advances).
    const behind = wireWake(0, -300, 0, 10);
    radar.onWakeBlip(behind.e);
    radar.render(OWN, 20); // the very next frame — the beam has moved 0.03 rad
    expect(radar.bandAt(behind.x, behind.y)).toBeGreaterThanOrEqual(0);
  });

  it('freezes once marched — a paint is a historical snapshot (amendment 83)', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onWakeBlip(WAKE.e);
    radar.render(OWN, 950);
    const before = radar.intensityAt(WAKE.x, WAKE.y);
    expect(before).toBeGreaterThan(0);
    radar.render({ x: 400, y: 400 }, 1100); // the observer moves; the paint must not
    expect(radar.intensityAt(WAKE.x, WAKE.y)).toBe(before);
  });

  it('A TICK\'S WORTH OF SEGMENTS BECOMES ONE SLICE, so a per-segment row cannot '
    + 'turn the runaway backstop into a trim on real history', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    for (let i = 0; i < 40; i++) radar.onWakeBlip(wireWake(300, -240 + i * 12, 0, 1000).e);
    radar.render(OWN, 1000);
    expect(radar.livePaints, 'one tick, one record').toBe(1);
    expect(radar.livePaintCells, 'carrying every segment\'s cells').toBeGreaterThan(100);
    // A DIFFERENT tick is a different record: ages are never merged.
    radar.onWakeBlip(wireWake(300, 200, 0, 1050).e);
    radar.render(OWN, 1050);
    expect(radar.livePaints).toBe(2);
  });

  it('and the whole track paints, not just the segment the beam happened to be '
    + 'on — each segment marches its own bearing window', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    for (let i = 0; i < 20; i++) radar.onWakeBlip(wireWake(300, -120 + i * 12, 0, 1000).e);
    radar.render(OWN, 1000);
    let lit = 0;
    for (let i = 0; i < 20; i++) if (radar.bandAt(300, -120 + i * 12) >= 0) lit++;
    expect(lit, 'a coherent LINE, not a dotted one (amendment 198)').toBeGreaterThanOrEqual(19);
  });

  it('clearBlips drops parked segments too (entering spectate)', () => {
    const { radar } = makeRadar();
    radar.onWakeBlip(WAKE.e); // parks: no pose yet
    radar.clearBlips();
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
  });
});

describe('malformed wake payloads are dropped whole at the adapter', () => {
  function base(): WakeBlipEvent {
    return wireWake(300, 0, 0, 1000).e;
  }
  /** Feed one row and report whether it produced any paint at all. */
  function accepts(patch: Partial<WakeBlipEvent>): boolean {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onWakeBlip({ ...base(), ...patch });
    radar.render(OWN, 1000);
    return radar.livePaints > 0;
  }

  it('a conforming row lands — the negative controls below mean something', () => {
    expect(accepts({})).toBe(true);
  });

  it('a non-finite or far-future `t` paints nothing', () => {
    for (const t of [Number.NaN, Infinity, -Infinity, 1e15]) {
      expect(accepts({ t }), `t=${t}`).toBe(false);
    }
  });

  it('an out-of-range or non-integer AGE BUCKET paints nothing — `a` indexes an '
    + 'intensity ladder and a NaN there would poison `writeCell`', () => {
    for (const a of [-1, WAKE_AGE_BUCKETS, 99, 0.5, Number.NaN]) {
      expect(accepts({ a }), `a=${a}`).toBe(false);
    }
    for (let a = 0; a < WAKE_AGE_BUCKETS; a++) {
      expect(accepts({ a }), `a=${a} is legal`).toBe(true);
    }
  });

  it('huge cell indices are dropped — the cell-key injectivity premise', () => {
    for (const gx of [1e7, -1e7, 2 ** 31, 0.5]) {
      expect(accepts({ gx }), `gx=${gx}`).toBe(false);
    }
  });

  it('an oversized rect and a mis-sized bits array are dropped, against a bound '
    + 'DERIVED from the ribbon rather than from the longest hull', () => {
    const big = base();
    expect(accepts({ w: 4096, bits: new Array<number>(Math.ceil((4096 * big.h) / 32)).fill(-1) }))
      .toBe(false);
    expect(accepts({ bits: big.bits.slice(0, -1) })).toBe(false);
    expect(accepts({ w: 0 })).toBe(false);
    expect(accepts({ bits: 'nope' as never })).toBe(false);
  });
});

describe('a disclosed wake segment ATTENUATES in shadow and is never deleted '
  + '(amendment 190)', () => {
  /** A segment on bearing 0 at 300u, with the cover between it and the ship. */
  const SEG = wireWake(300, 0);

  /** What the segment's own CORE cells read over a given terrain — the cells the
   *  wire mask actually claims, not a box around them.
   *
   *  MEASURED OVER THE WHOLE FOOTPRINT rather than at one cell, because the grain
   *  is a per-cell draw and a single sample would be asserting one noise value
   *  instead of the rule. And over the CORE only, because the chop halo around it
   *  was disclosed by nobody: it is client-synthesized texture and is free to go
   *  dark in shadow exactly as terrain is (amendment 202). */
  function wakeCells(raster: HeightRaster | null): { lit: number; max: number } {
    const { radar } = makeRadar();
    if (raster !== null) radar.setHeightRaster(raster);
    radar.render(OWN, 1000);
    radar.onWakeBlip({ ...SEG.e, t: 1000 });
    radar.render(OWN, 1000);
    expect(radar.livePaints, 'the segment marched').toBe(1);
    const cov = SEG.e;
    let lit = 0;
    let max = 0;
    for (let row = 0; row < cov.h; row++) {
      for (let col = 0; col < cov.w; col++) {
        if (!coverageHas(cov, col, row)) continue;
        const w = radar.intensityAt((cov.gx + col + 0.5) * CELL, (cov.gy + row + 0.5) * CELL);
        if (w > 0) lit++;
        if (w > max) max = w;
      }
    }
    return { lit, max };
  }

  const FLOOR = wakeLitFloor(CLIENT_CONFIG.blip.heatmap.model);
  const SEA = rasterWithPyramid(700, () => 0);
  const SOFT = rasterWithPyramid(700, ridge(150, 0, 40, 200, CONFIG.vision.radarMastQ / 2));
  const HARD = rasterWithPyramid(700, ridge(150, 0, 40, 200, 255));

  it('over open water it paints at its own strength', () => {
    const sea = wakeCells(SEA);
    expect(sea.lit, 'the whole segment is lit').toBeGreaterThan(5);
    expect(sea.max, 'and its brightest cell is above the still-lit floor')
      .toBeGreaterThan(FLOOR);
  });

  it('SOFT COVER dims it — the same water, weaker', () => {
    const sea = wakeCells(SEA);
    const soft = wakeCells(SOFT);
    expect(soft.max, 'behind half-mast terrain it reads weaker').toBeLessThan(sea.max);
    expect(soft.lit, 'and not one cell of it is deleted').toBe(sea.lit);
  });

  it('HARD COVER floors it at the still-lit intensity rather than erasing it — '
    + 'the client\'s own walk may not delete what the server\'s gate passed', () => {
    const sea = wakeCells(SEA);
    const hard = wakeCells(HARD);
    expect(hard.lit, 'a fully shadowed disclosed segment still paints every cell')
      .toBe(sea.lit);
    expect(hard.max).toBeCloseTo(FLOOR, 6);
    expect(radarDraws(hard.max), 'and the floor is above the transparent threshold')
      .toBe(true);
  });

  it('and the floor is the WAKE\'s own, not a hull\'s — shadow may never brighten '
    + 'water into the register a contact owns', () => {
    expect(FLOOR).toBeLessThan(CLIENT_CONFIG.blip.heatmap.model.minPeak);
    for (const raster of [SEA, SOFT, HARD]) {
      expect(wakeCells(raster).max).toBeLessThan(CLIENT_CONFIG.blip.heatmap.model.minPeak);
    }
  });

  it('and a raster with no pyramid changes nothing — the walk fails OPEN', () => {
    expect(wakeCells(rasterFrom(700, ridge(150, 0, 40, 200, 255))).max)
      .toBeCloseTo(wakeCells(null).max, 12);
  });
});

// --- THE SCOPE PAINTS EVERYTHING IN RANGE, through the adapter (cycle 56) -------

describe('the scope paints INSIDE truesight (amendment 88)', () => {
  /** A coastline 300u off, all of it under the 330u bubble. Under cycles 54-55
   *  this island painted NOTHING; it is the fixture the reversal is measured on. */
  const CLOSE = rasterFrom(600, ridge(300, 0, 120, 90));
  const PROBE = { x: 220, y: 0 };

  it('an island swept from INSIDE truesight paints', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(CLOSE);
    revolution(radar);
    expect(Math.hypot(PROBE.x, PROBE.y), 'the probe is inside truesight')
      .toBeLessThan(CONFIG.vision.sight);
    expect(radar.bandAt(PROBE.x, PROBE.y), 'swept inside truesight: PAINTED')
      .toBeGreaterThanOrEqual(0);
  });

  it('and the SWEEP is still the only thing that paints it — nothing appears '
    + 'before the beam arrives (amendment 83)', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(CLOSE);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    // The beam is short of bearing 0, so the probe's own bearing is unswept.
    radar.render(OWN, 200);
    expect(radar.bandAt(PROBE.x, PROBE.y), 'the beam has not reached it').toBe(-1);
    for (let t = 300; t <= 1200; t += 100) radar.render(OWN, t);
    expect(radar.bandAt(PROBE.x, PROBE.y)).toBeGreaterThanOrEqual(0);
  });

  it('and the paint is a record: withdrawing does not change one cell of it '
    + '(amendment 83)', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(CLOSE);
    revolution(radar);
    const band = radar.bandAt(PROBE.x, PROBE.y);
    expect(band).toBeGreaterThanOrEqual(0);
    for (const x of [-100, -200, -300]) {
      radar.render({ x, y: 0 }, 4250);
      expect(radar.bandAt(PROBE.x, PROBE.y), `withdrawn to x=${x}: same band`).toBe(band);
    }
  });

  it('and TIME is the only thing that takes it away', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(rasterFrom(900, ridge(600, 0, 120, 90)));
    revolution(radar);
    expect(radar.bandAt(600, 0)).toBeGreaterThanOrEqual(0);
    radar.render(OWN, 4200 + LIFE + 1);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(600, 0)).toBe(-1);
  });

  it('a ghost the ship has closed on keeps decaying in place (amendment 86, now '
    + 'the ordinary case)', () => {
    const { radar } = makeRadar();
    radar.setHeightRaster(rasterFrom(900, ridge(600, 0, 120, 90)));
    revolution(radar);
    expect(radar.bandAt(600, 0), 'swept from 600u out: painted').toBeGreaterThanOrEqual(0);
    radar.render({ x: 480, y: 0 }, 4250); // now 120u away — deep inside truesight
    expect(radar.bandAt(600, 0), 'the ghost decays in place').toBeGreaterThanOrEqual(0);
  });
});

// --- the SECOND source: sighted ships, from their Contact (amendment 89) --------

/** A static sighted contact at `x` on bearing 0 from the origin. */
function sightedStore(x: number, id = 'ship-7', heading = 0): ContactStore {
  const store = new ContactStore();
  store.pushFrame(0, [{ id, x, y: 0, heading, speed: 0, cls: 'battleship' }]);
  return store;
}

describe('a sighted ship paints from its Contact when the beam crosses it', () => {
  it('a hull inside truesight paints an echo — the server has never sent a blip '
    + 'for one', () => {
    const store = sightedStore(200);
    const { radar } = makeRadar();
    revolution(radar, OWN, store);
    expect(radar.bandAt(200, 0), 'the synthesized echo').toBeGreaterThanOrEqual(0);
  });

  it('and NOT before the beam reaches it — the sweep gate holds for this source', () => {
    const store = sightedStore(200);
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 200, store); // beam still short of bearing 0
    expect(radar.bandAt(200, 0), 'a contact is not a paint trigger').toBe(-1);
  });

  it('a contact BEYOND truesight is left to the wire — the client never '
    + 'synthesizes in the annulus the server blips', () => {
    const store = sightedStore(500); // > 330u: the server's territory
    const { radar } = makeRadar();
    revolution(radar, OWN, store);
    expect(radar.bandAt(500, 0)).toBe(-1);
  });

  it('A HULL BEHIND A HEADLAND STILL PAINTS — the accepted, temporary cost of '
    + 'amendment 140, recorded so it is not mistaken for a bug', () => {
    // Islands block every sensor (Eric ruling 2026-08-02) and every SERVER-side
    // gate still enforces that — `blipGate`, `pointSighted`, `pointDetected`, the
    // muzzle and smoke halos, the foghorn muffle. What moved is the client's PAINT
    // layer, for one cycle, on the explicit promise that Story 4.11 restores
    // occlusion as a height-derived shadow length along the same ray.
    const store = sightedStore(200);
    const { radar } = makeRadar();
    radar.setHeightRaster(rasterFrom(400, ridge(120, 0, 30, 40)));
    revolution(radar, OWN, store);
    expect(radar.bandAt(200, 0), 'painted through the headland').toBeGreaterThanOrEqual(0);
  });

});

// --- the SOURCE SEAM is the drawn fog hole, dazzle included (amendment 89) ------

describe('the source seam is `fogHoleRadiusU`, so client and server agree', () => {
  const SIGHT = CONFIG.vision.sight;
  const DAZZLE = CONFIG.starShells.dazzleSightFactor;
  /** Between the dazzled hole and the un-dazzled one: the annulus a dazzle hands
   *  from the client's synthesis to the server's blips. */
  const MID = SIGHT * ((1 + DAZZLE) / 2);

  it('the seam radius IS fogHoleRadiusU, at base stats and dazzled', () => {
    const { radar } = makeRadar();
    // Called, not re-derived: it is also, by construction, the server's own
    // dazzle-scaled `sightOf`. If either side ever changes, this equality is the
    // thing that breaks — rather than a hull at the seam painting twice.
    expect(radar.sightHoleU).toBe(fogHoleRadiusU(SIGHT, false));
    expect(radar.setDazzled(true)).toBe(true); // mirrors Fog's changed-flag
    expect(radar.isDazzled).toBe(true);
    expect(radar.sightHoleU).toBe(fogHoleRadiusU(SIGHT, true));
    // And that IS a shrink, by exactly the ratified factor.
    expect(radar.sightHoleU).toBe(SIGHT * DAZZLE);
    expect(radar.setDazzled(true)).toBe(false); // no-op flip reports no change
  });

  it('a DAZZLE hands the annulus over: the client stops synthesizing there, '
    + 'because the server has started blipping it', () => {
    expect(MID).toBeGreaterThan(SIGHT * DAZZLE);
    expect(MID).toBeLessThan(SIGHT);
    const store = sightedStore(MID);

    const { radar } = makeRadar();
    revolution(radar, OWN, store);
    expect(radar.bandAt(MID, 0), 'un-dazzled: ours to synthesize').toBeGreaterThanOrEqual(0);

    const dazzled = makeRadar().radar;
    dazzled.setDazzled(true);
    revolution(dazzled, OWN, store);
    expect(dazzled.bandAt(MID, 0), 'dazzled: the wire covers it').toBe(-1);
  });

  it('and a dazzle never reaches back into a paint already on the scope', () => {
    const store = sightedStore(MID);
    const { radar } = makeRadar();
    revolution(radar, OWN, store);
    const band = radar.bandAt(MID, 0);
    expect(band).toBeGreaterThanOrEqual(0);
    radar.setDazzled(true);
    radar.render(OWN, 4250, store);
    expect(radar.bandAt(MID, 0), 'the existing mark is untouched').toBe(band);
  });

  it('TWO SOURCES, ONE APPEARANCE (amendment 154): a wire footprint and a '
    + 'synthesized contact echo of the same pose paint IDENTICAL intensities', () => {
    // Same hull, same pose, same range, same observer — delivered once as a
    // `Contact` (undazzled: inside the seam, the client rasterizes it) and
    // once as the server's wire footprint (dazzled: the same annulus is the
    // wire's). Both run the one shared rasterizer and the one stamp, so the
    // buffers must agree cell for cell: the inside/outside split survives but
    // stops being visible.
    const pose = { x: MID, y: 0, heading: 0.7, cls: 'battleship' as const };
    const viaContact = makeRadar().radar;
    const store = new ContactStore();
    store.pushFrame(0, [{ id: 's', x: pose.x, y: pose.y, heading: pose.heading, speed: 0, cls: pose.cls }]);
    revolution(viaContact, OWN, store);
    const viaWire = makeRadar().radar;
    viaWire.setDazzled(true);
    viaWire.render(OWN, 900);
    // The wire mask is the fuzzed paint (cycle-63 gate) at the SAME glint seed
    // the contact source used: the adapter seeds a sighted hull's stamp with
    // its revolution index, which is 0 for the whole first turn — so the two
    // sources build byte-identical masks and the comparison stays cell-for-cell.
    const c = paintCoverage(pose.cls, pose.x, pose.y, pose.heading, CELL, 0);
    viaWire.onBlip({ k: 'blip', t: 1000, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits });
    viaWire.render(OWN, 1000);
    // Cell-for-cell comparable: the two paths fire DIFFERENT ray sets (the
    // beam's fixed quanta vs the echo's own bearing window), so a cell's
    // winning sample can sit up to half a ray step apart in range — a ~1e-3
    // intensity difference, not a different reading. The pure-level identity
    // (same rays, byte-equal) is pinned in radarHeatmap.test.ts; HERE the pin
    // is that both sources light the same footprint at the same strength.
    let both = 0;
    let onlyOne = 0;
    for (let row = 0; row < c.h; row++) {
      for (let col = 0; col < c.w; col++) {
        const x = (c.gx + col + 0.5) * CELL;
        const y = (c.gy + row + 0.5) * CELL;
        const a = viaContact.intensityAt(x, y);
        const b = viaWire.intensityAt(x, y);
        if (a === 0 && b === 0) continue;
        if (a === 0 || b === 0) {
          onlyOne++; // a corner-clipped cell one ray set catches and the other misses
          continue;
        }
        both++;
        expect(Math.abs(b - a), `cell ${col},${row}`).toBeLessThan(0.02);
      }
    }
    expect(both, 'the footprints really overlap').toBeGreaterThan(5);
    expect(onlyOne, 'and disagree on at most a corner cell or two').toBeLessThanOrEqual(2);
  });
});

