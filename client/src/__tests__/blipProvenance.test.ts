// A RADAR RETURN HAS NO PROVENANCE, AND THE CLIENT MUST NEVER GAIN ONE.
//
// Story 7-5 wave 2 gave the server two new ways to emit a blip into an
// observer's frame, on top of the observer's own sweep:
//
//   • THE RELAY (R2.8) — a radar buoy the observer OWNS returned the point, so
//     the hull paints in the owner's frame from the BUOY's position, its island
//     shadowing and its sweep window rather than the ship's.
//   • THE JAMMING FAKE (R2.11) — a fabricated (pose, hull) scattered on the
//     buoy's server-private jam stream, shaped by the SAME `blipShape` and gated
//     by the SAME `blipGate` every genuine ship paint goes through.
//
// The fakes are wire-indistinguishable BY CONSTRUCTION, and that is the entire
// feature: jamming's purpose is DENYING information, so a client that could drop
// the fakes (or dim them, or mark them, or sort them last) would gain a decisive
// advantage and the doctrine would be worth nothing. This file is the structural
// pin on the client half of that guarantee — the server's own carve-out is
// declared in `server/src/game/signals.ts` and re-derived in its perception
// oracle, and neither is worth anything if the RENDERER learns to tell them
// apart.
//
// THE PROPERTY: everything the radar draws is a pure function of the wire
// payload `{ t, gx, gy, w, h, bits }` and the observer's own pose. Nothing else
// is consulted, so two returns carrying the same payload are the same return —
// whoever generated them, and whatever they claim to be.
//
// PROVEN TO BITE: adding any provenance branch to `Radar.onBlip` (an ignored
// field consulted, a source tag honored, a suspicious-mask filter) breaks the
// deep-equality assertions below, because the two radars would stop agreeing.

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

describe('a relayed return renders identically to a directly-observed one (R2.8)', () => {
  // The SAME hull at the SAME pose. One reached the observer off their own
  // sweep; the other was returned by a buoy they own, 300u away, and relayed —
  // so it crossed the BUOY's beam and the BUOY's terrain shadow, not the ship's.
  // The server merges it into the one blip subsequence with no marking of any
  // kind, and here it must draw the same pixels.
  const direct = blip(420, 180);
  const relayed = blip(420, 180);

  it('the wire payloads are byte-identical — there is nothing to tell apart', () => {
    expect(relayed).toEqual(direct);
    expect([...relayed.bits]).toEqual([...direct.bits]);
  });

  it('the payload carries NO provenance field of any kind', () => {
    expect(Object.keys(direct).sort()).toEqual(['bits', 'gx', 'gy', 'h', 'k', 't', 'w']);
  });

  it('the draw is identical: same slices, same cells, same intensities', () => {
    expect(paintedBy([relayed])).toEqual(paintedBy([direct]));
  });

  it('a relay from ACROSS the map paints exactly where its cells say, not near the observer', () => {
    // The whole value of the relay is seeing water your own hull is nowhere
    // near. The paint is placed off `gx/gy`, so this lands out at the buoy.
    const far = blip(1400, -900);
    expect(paintedBy([far])).toEqual(paintedBy([blip(1400, -900)]));
    expect(paintedBy([far])).not.toEqual(paintedBy([direct]));
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

  it('the renderer IGNORES any field it was not given — a marked fake still paints the same', () => {
    // Belt and braces on the property rather than the payload: even if some
    // future wire change smuggled a tag through, `onBlip` reads six fields and
    // consults nothing else, so the tag could not reach the scope. This is the
    // assertion that fails the moment anyone adds a provenance branch.
    const clean = blip(310, 90);
    const tagged = { ...blip(310, 90), fake: true, relayed: true, src: 'buoy-7' } as ReturnBlipEvent;
    expect(paintedBy([tagged])).toEqual(paintedBy([clean]));
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
