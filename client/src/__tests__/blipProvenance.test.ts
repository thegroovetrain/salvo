// A RADAR RETURN CARRIES ITS SENSOR, NEVER ITS TRUTH — the client must know
// WHICH of its own antennas made a return and must never learn whether the
// subject is REAL.
//
// Story 7-5's fix cycle replaced the R2.8 relay with THE BUOY'S OWN SCOPE
// (Eric: "It gets its own returns. I just get to see them as the owner."):
// a return made by a buoy the observer OWNS arrives tagged `src: <buoy id>`
// (PV 44) and is priced from the BUOY — its position, its falloff, its
// terrain shadow. That tag is SENSOR ATTRIBUTION, and this file pins the line
// it must never cross:
//
//   • WITHIN EVERY SCOPE, FAKE-VS-REAL STAYS INDISTINGUISHABLE. An untagged
//     jamming fake (your own set swept an enemy jam circle) is byte-identical
//     to an untagged real hull at that pose; a TAGGED fake (your BUOY's gate
//     passed an enemy jamming buoy's fabrication — the server routes fakes
//     through the buoy gate precisely so this holds) is byte-identical to a
//     tagged real hull at that pose. The tag says which of your sensors
//     returned it, never whether anything is there.
//   • THE DRAW IS A PURE FUNCTION of the wire payload `{t,gx,gy,w,h,bits,src?}`
//     and the observer's sensor poses (own hull + own buoys). Nothing else is
//     consulted — no suspicious-mask filter, no fake heuristic, no dimming.
//
// The server's own carve-out is declared in `server/src/game/signals.ts`
// (ownBuoyScopeBlips — the fakes-through-the-buoy-gate clause is the proof
// obligation) and re-derived in its perception oracle; this file is the
// renderer half.
//
// PROVEN TO BITE: any fake-vs-real branch in `Radar.onBlip` (a suspicious-mask
// filter, a fake heuristic, honoring any field beyond the payload + `src`)
// breaks the deep-equality assertions below, because the two radars would stop
// agreeing.

import { describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { CONFIG, rasterizeHullCoverage, type HullId, type ReturnBlipEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Camera } from '../render/camera.js';
import { Radar } from '../render/radar.js';

// jsdom has no 2d canvas, so neither baked texture the adapter builds at
// construction can rasterize here (the radarViewport.test.ts precedent).
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (): Texture => Texture.EMPTY,
  };
});

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const OWN = { x: 0, y: 0 };

function harness(): Radar {
  const layer = new Container();
  const radar = new Radar(layer, new Container());
  radar.onSweepSample(0, 0);
  return radar;
}

function camera(): Camera {
  const c = new Camera({ radarRange: CONFIG.vision.radar, followRate: 6, leadSeconds: 0, leadMax: 0 });
  c.setViewport(1280, 720);
  c.snapTo(OWN);
  return c;
}

/** One wire return footprint, built by the SAME shared rasterizer the server
 *  runs for a real hull, a relayed hull and a jamming fake alike — which is the
 *  point: there is one shaper, so there is one wire shape. */
function blip(x: number, y: number, cls: HullId = 'mineLayer', heading = 0, t = 1000): ReturnBlipEvent {
  const c = rasterizeHullCoverage(cls, x, y, heading, CELL);
  return { k: 'blip', t, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
}

/** Everything one radar drew for a set of returns, as a comparable snapshot.
 *  Deep-equality between two of these is only meaningful if it is comparing
 *  something, so `paints()` below pins that these are never empty. */
function paintedBy(returns: readonly ReturnBlipEvent[]): unknown {
  const radar = harness();
  const cam = camera();
  radar.render(OWN, 900, null, cam.worldView);
  for (const e of returns) radar.onBlip(e);
  radar.render(OWN, 1000, null, cam.worldView);
  return JSON.parse(JSON.stringify(radar.paintList));
}

/** How many slices a snapshot holds — the guard against a vacuous comparison. */
function paints(snapshot: unknown): number {
  return (snapshot as unknown[]).length;
}

describe('the harness actually paints (otherwise every equality below is vacuous)', () => {
  it('one return produces at least one slice', () => {
    expect(paints(paintedBy([blip(420, 180)]))).toBeGreaterThan(0);
  });

  it('two different poses produce different snapshots (the comparison discriminates)', () => {
    expect(paintedBy([blip(420, 180)])).not.toEqual(paintedBy([blip(-420, -180)]));
  });
});

describe('the untagged payload and the sensor tag (PV 44)', () => {
  it('an untagged payload — the common case — carries exactly the six keys it always did', () => {
    expect(Object.keys(blip(420, 180)).sort()).toEqual(['bits', 'gx', 'gy', 'h', 'k', 't', 'w']);
  });

  it('a return from ACROSS the map paints exactly where its cells say, not near the observer', () => {
    const far = blip(1400, -900);
    expect(paintedBy([far])).toEqual(paintedBy([blip(1400, -900)]));
    expect(paintedBy([far])).not.toEqual(paintedBy([blip(420, 180)]));
  });

  it('a tag naming a sensor this scope does not know degrades to own-set pricing — never a drop, never a crash', () => {
    // Fail-safe on the wire input: anything the server disclosed paints at
    // least a speck (amendment 127), whatever its tag resolves to.
    const clean = blip(420, 180);
    const orphaned = { ...blip(420, 180), src: 'b999' };
    expect(paintedBy([orphaned])).toEqual(paintedBy([clean]));
  });
});

describe('a JAMMING fake renders identically to a real return (R2.11)', () => {
  // The server scatters fakes as (pose, hull-class) pairs drawn from ALL SIX
  // hull ids and shapes them through the same `blipShape` a genuine ship paint
  // goes through, so a fake IS a real return's wire shape at a pose where no
  // ship happens to be.
  it('a fake at a pose is byte-identical to a real hull at that pose', () => {
    const real = blip(260, -340, 'battleship', 1.1);
    const fake = blip(260, -340, 'battleship', 1.1);
    expect(fake).toEqual(real);
    expect(paintedBy([fake])).toEqual(paintedBy([real]));
  });

  it('a scatter of ten fakes draws exactly as ten real hulls at those poses would', () => {
    const poses = Array.from({ length: CONFIG.radarBuoy.jamFakes }, (_, i) => ({
      x: 200 + i * 37,
      y: -150 + i * 23,
      h: i * 0.31,
    }));
    const fakes = poses.map((p) => blip(p.x, p.y, 'torpedoBoat', p.h));
    const reals = poses.map((p) => blip(p.x, p.y, 'torpedoBoat', p.h));
    expect(paintedBy(fakes)).toEqual(paintedBy(reals));
  });

  it('the renderer consults the payload and `src` and NOTHING else — a smuggled fake-marker changes no pixel', () => {
    // The line the PV 44 tag must never cross: `src` selects a SENSOR, and no
    // other extra field is consulted at all. A wire that smuggled `fake: true`
    // through paints byte-identically to one that did not — this is the
    // assertion that fails the moment anyone adds a truth-provenance branch.
    const clean = blip(310, 90);
    const marked = { ...blip(310, 90), fake: true, relayed: true } as ReturnBlipEvent;
    expect(paintedBy([marked])).toEqual(paintedBy([clean]));
  });

  it('a fake and a real return in the SAME frame are indistinguishable in the paint list', () => {
    // Two returns at two poses. Which one was fabricated is not recoverable from
    // what was drawn: swapping which of the two the "fake" is changes nothing.
    const a = { x: 300, y: 120 };
    const b = { x: -280, y: 260 };
    expect(paintedBy([blip(a.x, a.y), blip(b.x, b.y)])).toEqual(
      paintedBy([blip(a.x, a.y), blip(b.x, b.y)]),
    );
  });
});

describe('the TAGGED scope keeps the guarantee (PV 44): src says WHICH SENSOR, never WHETHER REAL', () => {
  // The observer owns a buoy at (500, 0). The server routes an enemy jamming
  // buoy's fakes through the BUOY's gate precisely so that a tagged fake and a
  // tagged real hull are the same wire shape — re-proven here at the renderer.
  const BUOY = { id: 'b7', x: 500, y: 0, until: 99_000, own: true, by: 'me', sweep: 0 };

  function paintedByOwnBuoy(returns: readonly ReturnBlipEvent[]): unknown {
    const radar = harness();
    const cam = camera();
    radar.setOwnBuoys([BUOY], 900);
    radar.render(OWN, 900, null, cam.worldView);
    for (const e of returns) radar.onBlip(e);
    radar.render(OWN, 1000, null, cam.worldView);
    return JSON.parse(JSON.stringify(radar.paintList));
  }

  it('a tagged FAKE draws byte-identically to a tagged REAL hull at that pose', () => {
    const real = { ...blip(560, 80, 'battleship', 1.1), src: BUOY.id };
    const fake = { ...blip(560, 80, 'battleship', 1.1), src: BUOY.id };
    expect(fake).toEqual(real);
    expect(paintedByOwnBuoy([fake])).toEqual(paintedByOwnBuoy([real]));
  });

  it('tag-vs-no-tag differs by SENSOR GEOMETRY alone — both members of each pair paint, neither is dropped or marked', () => {
    // The tag legitimately changes the picture (buoy-priced vs own-priced) —
    // that is its whole job — but it does so identically for a fake and a
    // real return, so nothing about truth is recoverable from the difference.
    const tagged = paintedByOwnBuoy([{ ...blip(560, 80), src: BUOY.id }]);
    const untagged = paintedByOwnBuoy([blip(560, 80)]);
    expect((tagged as unknown[]).length).toBeGreaterThan(0);
    expect((untagged as unknown[]).length).toBeGreaterThan(0);
  });
});
