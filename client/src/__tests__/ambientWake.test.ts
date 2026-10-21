// THE HOME SCENE's stand-in `wk` rows (epic-9 amendment 210; Eric 2026-10-21:
// "I want the menu to look like footage from the game").
//
// The server returns the entire sweep, wake water included, and the client
// paints only wire rows — so the menu's stand-in server must emit wake returns
// the way the real server's `wakeScan` + `wk` row do. These tests pin that
// contract: the gate (radar range + this tick's sweep crossing, no self
// exclusion), the wire shape (key order and the shared per-segment rasterizer),
// and that the rows reach the real Radar through its wire entry.

import { describe, it, expect, vi } from 'vitest';
import {
  CONFIG,
  appendWakeSample,
  createShipWake,
  eachWakeSegment,
  paintSegmentCoverage,
  wrapPositive,
  type WakeBlipEvent,
  type WakeRibbon,
} from '@salvo/shared';
import { feedWakeReturns, sampleWireWakes } from '../render/ambient.js';
import type { Radar } from '../render/radar.js';
import { WakeSources } from '../render/wake.js';
import {
  advanceAmbient,
  ambientWakeRows,
  buildAmbientWorld,
  type AmbientMapLike,
  type AmbientRibbonStore,
  type AmbientTick,
  type AmbientWorld,
} from '../render/ambientScene.js';

const TAU = Math.PI * 2;
const OPEN: AmbientMapLike = { radius: 2400, islands: [] };
const NOW = 5_000;
const WIRE_KEYS = ['k', 't', 'a', 'gx', 'gy', 'w', 'h', 'bits'];

/** A tick whose beam swept the half-open window (prev, cur]. */
function tickAt(prevSweep: number, sweep: number): AmbientTick {
  return { dtMs: 50, dtSec: 0.05, travelSec: 0.05, nowMs: NOW, prevSweep: wrapPositive(prevSweep), sweep: wrapPositive(sweep) };
}

/** A beam window straddling `bearing`. */
function tickAcross(bearing: number): AmbientTick {
  return tickAt(bearing - 0.05, bearing + 0.05);
}

/** A short straight track on `bearing` from the observer, starting `fromU`
 *  out and running radially away, laid over the second before NOW. */
function radialTrack(world: AmbientWorld, bearing: number, fromU: number): WakeRibbon {
  const o = world.observer.state;
  const cls = world.observer.cls;
  const r = createShipWake(cls, CONFIG.shipClasses[cls].kinematics.maxSpeed);
  const step = CONFIG.vision.wakeSampleU;
  for (let i = 0; i < 5; i += 1) {
    const d = fromU + i * step;
    appendWakeSample(r, o.x + Math.cos(bearing) * d, o.y + Math.sin(bearing) * d, NOW - 1_000 + i * 200);
  }
  return r;
}

function storeOf(...ribbons: WakeRibbon[]): AmbientRibbonStore {
  return { each: (fn) => ribbons.forEach((ribbon) => fn({ ribbon })) };
}

describe('ambientWakeRows — the stand-in server\'s wk rows', () => {
  it('a ribbon inside radar range on a bearing the sweep crossed yields wire-shaped rows from the shared rasterizer', () => {
    const w = buildAmbientWorld(OPEN);
    const bearing = 1.0;
    const ribbon = radialTrack(w, bearing, w.stats.radarRange * 0.5);
    const rows = ambientWakeRows(w, tickAcross(bearing), storeOf(ribbon));
    const expected: WakeBlipEvent[] = [];
    eachWakeSegment(ribbon, NOW, (seg) => {
      const c = paintSegmentCoverage(seg.ax, seg.ay, seg.bx, seg.by, ribbon.widthU, CONFIG.vision.radarCellU, NOW);
      expected.push({ k: 'wk', t: NOW, a: seg.bucket, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits });
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows).toEqual(expected);
    for (const row of rows) expect(Object.keys(row)).toEqual(WIRE_KEYS);
  });

  it('a ribbon beyond radar range yields no rows', () => {
    const w = buildAmbientWorld(OPEN);
    const bearing = 1.0;
    const ribbon = radialTrack(w, bearing, w.stats.radarRange + CONFIG.vision.wakeSampleU);
    expect(ambientWakeRows(w, tickAcross(bearing), storeOf(ribbon))).toEqual([]);
  });

  it('a ribbon on a bearing the sweep did not cross yields no rows', () => {
    const w = buildAmbientWorld(OPEN);
    const bearing = 1.0;
    const ribbon = radialTrack(w, bearing, w.stats.radarRange * 0.5);
    expect(ambientWakeRows(w, tickAcross(bearing + Math.PI), storeOf(ribbon))).toEqual([]);
  });

  it('reuses the caller\'s row array', () => {
    const w = buildAmbientWorld(OPEN);
    const bearing = 1.0;
    const scratch: WakeBlipEvent[] = [];
    const ribbon = radialTrack(w, bearing, w.stats.radarRange * 0.5);
    expect(ambientWakeRows(w, tickAcross(bearing), storeOf(ribbon), scratch)).toBe(scratch);
    expect(scratch.length).toBeGreaterThan(0);
    ambientWakeRows(w, tickAcross(bearing + Math.PI), storeOf(ribbon), scratch);
    expect(scratch.length).toBe(0);
  });
});

/** Advance the real scene ~3s, laying the stand-in server's ribbons as the
 *  shell does each frame. */
function sailedScene(): { w: AmbientWorld; wire: WakeSources } {
  const w = buildAmbientWorld(OPEN);
  const wire = new WakeSources();
  for (let i = 0; i < 60; i += 1) {
    const t = advanceAmbient(w, OPEN, 50, 1);
    sampleWireWakes(wire, w, t.nowMs);
  }
  return { w, wire };
}

/** A beam window covering (almost) the whole circle at the scene's clock. */
function wholeCircle(w: AmbientWorld): AmbientTick {
  return { ...tickAt(0, TAU - 1e-9), nowMs: w.elapsedMs };
}

describe('the menu scene\'s server-side wake', () => {
  it('lays a ribbon for EVERY hull, and the observer\'s own water returns like any other (no self-exclusion)', () => {
    const { w, wire } = sailedScene();
    for (const h of w.hulls) expect(wire.get(h.id), h.id).toBeDefined();
    const own = wire.get(w.observer.id);
    if (own === undefined) throw new Error('observer laid no ribbon');
    const rows = ambientWakeRows(w, wholeCircle(w), storeOf(own.ribbon));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('feeds every wk row to the real Radar through its wire entry, onWakeBlip', () => {
    const { w, wire } = sailedScene();
    // jsdom has no 2d canvas, so a real Radar cannot be built here; the sink is
    // typed as the Radar's own `onWakeBlip` (the wire entry), which is the contract.
    const spy = vi.fn<Radar['onWakeBlip']>();
    const radar: Pick<Radar, 'onWakeBlip'> = { onWakeBlip: spy };
    const scratch: WakeBlipEvent[] = [];
    const tick = wholeCircle(w);
    const sent = feedWakeReturns(radar, w, tick, wire, scratch);
    expect(sent).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(sent);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(ambientWakeRows(w, tick, wire));
  });
});
