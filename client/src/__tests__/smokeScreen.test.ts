// SMOKE SCREEN puffs on the client (Story 8.18, catalog-v3 R38; Eric rulings
// 2026-09-29, epic-8 amendments 138–145). Two halves:
//   • render/smokeScreen.ts — the id-keyed disc reconcile off FrameMsg.smoke,
//     grown along the SHARED `puffRadius` (never a client re-derivation), faded
//     over the last `fadeMs` of life, and MOTION-BLIND (presence and extent are
//     information — the wounded-smoke rule).
//   • render/wake.ts — the in-bubble wake synthesis owes the server's smoke term
//     (ruling 143: torpedo water inside the sight bubble is hidden by smoke), so
//     a segment behind a puff is not revealed, and one with no puff in the way is.

import { afterEach, describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, eachWakeSegment, effectiveSight, puffRadius, type SmokeView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { PUFF_DRAW_RADIUS, SmokeScreen, puffFade } from '../render/smokeScreen.js';
import {
  SMOKE_GROWTH_BUCKET_MS,
  WAKE_STAMP_MIN_MS,
  WAKE_STAMP_REBUILD_MS,
  WakeSources,
  WakeStampCache,
  buildTruesightWakeStamp,
  smokeSetKey,
  type WakeHull,
} from '../render/wake.js';

const K = CONFIG.smokeScreen;
const puff = (id: string, t0 = 0, x = 0, y = 0): SmokeView => ({ id, x, y, t0 });

describe('SmokeScreen.sync — the id-keyed puff reconcile', () => {
  it('adds one disc per puff, keeps held ids, and destroys ids that left the list', () => {
    const layer = new Container();
    const smoke = new SmokeScreen(layer);
    smoke.sync([puff('sk1'), puff('sk2', 0, 100, 0)]);
    expect(smoke.size).toBe(2);
    expect(layer.children).toHaveLength(2);
    const first = layer.children[0];
    smoke.sync([puff('sk1'), puff('sk2', 0, 100, 0), puff('sk3', 500, 200, 0)]);
    expect(smoke.size).toBe(3);
    expect(layer.children[0]).toBe(first); // a held puff is never respawned
    smoke.sync([puff('sk3', 500, 200, 0)]); // sk1/sk2 expired or out of sight
    expect(smoke.size).toBe(1);
    expect(layer.children).toHaveLength(1);
    expect(first.destroyed).toBe(true);
    smoke.sync([]); // the frame omitted the key
    expect(smoke.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });

  it('places each disc at its puff centre and never moves it (puffs do not drift)', () => {
    const layer = new Container();
    const smoke = new SmokeScreen(layer);
    smoke.sync([puff('sk1', 0, 120, -40)]);
    smoke.render(10_000);
    const g = layer.children[0];
    expect([g.x, g.y]).toEqual([120, -40]);
    smoke.render(20_000);
    expect([g.x, g.y]).toEqual([120, -40]);
  });

  it('draws ONE disc: a fill and a rim, nothing else (shape, not colour, is the tell)', () => {
    const layer = new Container();
    new SmokeScreen(layer).sync([puff('sk1')]);
    // One node per puff in the layer; under it exactly the fill and the rim,
    // split so the end-of-life fade can thin the fill while the rim holds.
    expect(layer.children).toHaveLength(1);
    const [fill, rim] = layer.children[0].children as Graphics[];
    expect(layer.children[0].children).toHaveLength(2);
    expect(fill.context.instructions.map((i) => i.action)).toEqual(['fill']);
    expect(rim.context.instructions.map((i) => i.action)).toEqual(['stroke']);
  });
});

describe('the radius is the SHARED curve — the drawn edge is the occlusion edge', () => {
  it('equals puffRadius(t0, serverNow) at birth, mid-life and full growth', () => {
    const smoke = new SmokeScreen(new Container());
    const t0 = 1_000;
    smoke.sync([puff('sk1', t0)]);
    for (const now of [t0, t0 + K.expandMs / 2, t0 + 12_345, t0 + K.expandMs]) {
      smoke.render(now);
      expect(smoke.radiusOf('sk1')).toBeCloseTo(puffRadius(t0, now), 9);
    }
    smoke.render(t0);
    expect(smoke.radiusOf('sk1')).toBeCloseTo(K.r0, 9);
    smoke.render(t0 + K.expandMs);
    expect(smoke.radiusOf('sk1')).toBeCloseTo(K.r1, 9);
  });

  it('draws the geometry once at full growth and scales it (no re-tessellation)', () => {
    expect(PUFF_DRAW_RADIUS).toBe(K.r1);
    expect(new SmokeScreen(new Container()).radiusOf('nope')).toBeNull();
  });
});

describe('the end-of-life fade — the last fadeMs of a puff, timestamp math', () => {
  const FADE = CLIENT_CONFIG.smokeScreen.fadeMs;

  it('holds full alpha until the last fadeMs, then eases linearly to 0 at removal', () => {
    const t0 = 0;
    const end = t0 + K.lifeMs;
    expect(puffFade(t0, t0)).toBe(1);
    expect(puffFade(t0, end - FADE)).toBe(1);
    expect(puffFade(t0, end - FADE / 2)).toBeCloseTo(0.5, 9);
    expect(puffFade(t0, end)).toBe(0);
    expect(puffFade(t0, end + 1_000)).toBe(0);
  });

  it('applies the fade to the FILL only — the rim (the occlusion edge) holds for the whole life', () => {
    const smoke = new SmokeScreen(new Container());
    smoke.sync([puff('sk1', 0)]);
    smoke.render(1_000);
    expect(smoke.alphaOf('sk1')).toBe(1);
    expect(smoke.rimAlphaOf('sk1')).toBe(1);
    smoke.render(K.lifeMs - FADE / 4);
    expect(smoke.alphaOf('sk1')).toBeCloseTo(0.25, 9);
    // The puff still occludes at full strength until the server removes it, so
    // the drawn edge must not thin with the fill.
    expect(smoke.rimAlphaOf('sk1')).toBe(1);
    smoke.render(K.lifeMs - 1);
    expect(smoke.rimAlphaOf('sk1')).toBe(1);
    expect(smoke.rimAlphaOf('nope')).toBeNull();
  });
});

describe('MOTION-BLIND — the motion setting never hides or shrinks a puff', () => {
  afterEach(() => settings.reset());

  it('renders identical presence, radius and alpha at every motion level', () => {
    const seen: [number, number | null, number | null][] = [];
    for (const motion of ['full', 'reduced', 'off'] as const) {
      settings.set({ motion });
      const smoke = new SmokeScreen(new Container());
      smoke.sync([puff('sk1', 0), puff('sk2', 10_000, 50, 50)]);
      smoke.render(K.lifeMs - 1_000);
      seen.push([smoke.size, smoke.radiusOf('sk1'), smoke.alphaOf('sk1')]);
    }
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    expect(seen[0][0]).toBe(2);
  });
});

// --- the wake mirror (render/wake.ts segmentRevealable) ------------------------

/** A battleship track at y=40 running +x from x=60, observed up to `t`. */
function tracked(): { sources: WakeSources; t: number } {
  const sources = new WakeSources();
  const h: WakeHull = { id: 'a', x: 60, y: 40, heading: 0, speed: 30, cls: 'battleship', color: 0xffffff, maxSpeedU: 60 };
  let t = 0;
  for (let i = 0; i < 8; i++) {
    sources.observe(h, t);
    h.x += CONFIG.vision.wakeSampleU + 1;
    t += 50;
  }
  return { sources, t };
}

describe('the in-bubble wake mirror owes the server smoke term (ruling 143)', () => {
  const MODEL = CLIENT_CONFIG.blip.heatmap.model;
  const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
  const SIGHT = CONFIG.vision.sight;
  /** The observer sits well SOUTH of the track so a single r40 puff 60 u away
   *  along the track's mean bearing covers every observer→segment line. */
  const own = { x: 0, y: -100 };
  const bearing = Math.atan2(40 - own.y, 150 - own.x);
  const between = (t0: number): SmokeView =>
    puff('sk1', t0, own.x + 60 * Math.cos(bearing), own.y + 60 * Math.sin(bearing));

  it('reveals the segment with no puff, and hides it with a puff on the line', () => {
    const { sources, t } = tracked();
    const clear = buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, []);
    expect(clear.size).toBeGreaterThan(0);
    const smoked = buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, [between(t)]);
    expect(smoked.size).toBe(0);
  });

  it('a puff OFF the line hides nothing', () => {
    const { sources, t } = tracked();
    const behind = puff('sk2', t, own.x, own.y - 200); // behind the observer
    const clear = buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, []);
    const stamp = buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, [behind]);
    expect(stamp.size).toBe(clear.size);
  });

  it('an observer standing INSIDE a puff synthesizes nothing (segCircleHit starts inside)', () => {
    const { sources, t } = tracked();
    const onMe = puff('sk3', t, own.x + 10, own.y);
    expect(buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, [onMe]).size).toBe(0);
  });

  it('uses the shared radius at the frame clock: an r40 puff that misses can grow to hide', () => {
    const { sources, t } = tracked();
    // Put the puff OUTSIDE the fan of observer→segment lines: 100 u out, 30°
    // past the steepest line — 50 u from the nearest line. Just born (r40) it
    // misses every line; at full growth (r60) it crosses the steepest ones.
    let steepest = -Infinity;
    eachWakeSegment(sources.get('a')!.ribbon, t, (seg) => {
      steepest = Math.max(steepest, Math.atan2(seg.my - own.y, seg.mx - own.x));
    });
    const at = steepest + Math.PI / 6;
    const px = own.x + 100 * Math.cos(at);
    const py = own.y + 100 * Math.sin(at);
    const young = puff('sk4', t, px, py);
    const old = puff('sk4', t - K.expandMs, px, py);
    const clear = buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, []).size;
    expect(buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, [young]).size).toBe(clear);
    expect(buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, [old]).size).toBeLessThan(clear);
  });

  it('a puff laid (or gone) forces the stamp cache to rebuild', () => {
    const { sources, t } = tracked();
    const cache = new WakeStampCache();
    expect(cache.stampFor(sources, own, SIGHT, t, CELL, MODEL, [], 0, []).size).toBeGreaterThan(0);
    const later = t + WAKE_STAMP_MIN_MS + 1;
    sources.get('a')!.seenMs = later; // still observed
    expect(cache.stampFor(sources, own, SIGHT, later, CELL, MODEL, [], 0, [between(later)]).size).toBe(0);
    const again = later + WAKE_STAMP_MIN_MS + 1;
    sources.get('a')!.seenMs = again;
    expect(cache.stampFor(sources, own, SIGHT, again, CELL, MODEL, [], 0, []).size).toBeGreaterThan(0);
  });

  // --- cycle-153 review gate: the cache key and the in-smoke observer ---------

  it('(i) a puff arriving INSIDE the min-ms floor invalidates the stamp at once', () => {
    const { sources, t } = tracked();
    const cache = new WakeStampCache();
    expect(cache.stampFor(sources, own, SIGHT, t, CELL, MODEL, [], 0, []).size).toBeGreaterThan(0);
    const soon = t + WAKE_STAMP_MIN_MS / 2; // under the floor
    sources.get('a')!.seenMs = soon + 1; // still observed throughout
    expect(cache.stampFor(sources, own, SIGHT, soon, CELL, MODEL, [], 0, [between(soon)]).size).toBe(0);
    // ...and a puff leaving under the floor re-reveals at once too.
    expect(cache.stampFor(sources, own, SIGHT, soon + 1, CELL, MODEL, [], 0, []).size).toBeGreaterThan(0);
  });

  it('(ii) a mid-list swap with the same count and the same first/last id changes the key', () => {
    const a = [puff('sk1'), puff('sk2'), puff('sk9')];
    const b = [puff('sk1'), puff('sk5'), puff('sk9')];
    expect(smokeSetKey(a, 0)).not.toBe(smokeSetKey(b, 0));
    expect(smokeSetKey(a, 0)).toBe(smokeSetKey([puff('sk1'), puff('sk2'), puff('sk9')], 0));
    // ...and the cache acts on it: swap in a middle puff that sits on the line.
    const { sources, t } = tracked();
    const cache = new WakeStampCache();
    const off1 = puff('sk1', t, own.x, own.y - 200);
    const off9 = puff('sk9', t, own.x, own.y - 300);
    const offMid = puff('sk2', t, own.x - 300, own.y);
    const onLine = { ...between(t), id: 'sk5' };
    expect(cache.stampFor(sources, own, SIGHT, t, CELL, MODEL, [], 0, [off1, offMid, off9]).size).toBeGreaterThan(0);
    expect(cache.stampFor(sources, own, SIGHT, t + 1, CELL, MODEL, [], 0, [off1, onLine, off9]).size).toBe(0);
  });

  it('(iii) a young r40 puff that misses at build time hides the segment once grown, within one bucket', () => {
    const { sources, t } = tracked();
    let steepest = -Infinity;
    eachWakeSegment(sources.get('a')!.ribbon, t, (seg) => {
      steepest = Math.max(steepest, Math.atan2(seg.my - own.y, seg.mx - own.x));
    });
    const at = steepest + Math.PI / 6;
    // The steepest line passes 100·sin 30° = 50 u from the puff centre. Born
    // so it is r 49.5 at the build (misses), it crosses 50 u ~0.75 s later.
    const born = t - ((49.5 - K.r0) / (K.r1 - K.r0)) * K.expandMs;
    const p = puff('sk4', born, own.x + 100 * Math.cos(at), own.y + 100 * Math.sin(at));
    const src = sources.get('a')!;
    const clear = buildTruesightWakeStamp(sources, own, SIGHT, t, CELL, MODEL, [], 0, []).size;
    const cache = new WakeStampCache();
    // Find the first instant the one-shot build hides something.
    const hides = (now: number): boolean => {
      src.seenMs = now; // keep the source observed; only growth moves
      return buildTruesightWakeStamp(sources, own, SIGHT, now, CELL, MODEL, [], 0, [p]).size < clear;
    };
    let hideAt = t;
    while (!hides(hideAt) && hideAt < t + 5_000) hideAt += 50;
    expect(hideAt).toBeGreaterThan(t); // it really did miss at build time
    expect(hideAt).toBeLessThan(t + 5_000); // ...and really does hide once grown
    src.seenMs = t;
    expect(cache.stampFor(sources, own, SIGHT, t, CELL, MODEL, [], 0, [p]).size).toBe(clear);
    // Observer still, segment set fixed: only growth (the bucket) can re-key it.
    const within = hideAt + SMOKE_GROWTH_BUCKET_MS;
    src.seenMs = within;
    // ...and before the generic rebuild clock would have caught it anyway, so
    // the growth bucket is what does the work here.
    expect(within - t).toBeLessThan(WAKE_STAMP_REBUILD_MS);
    expect(cache.stampFor(sources, own, SIGHT, within, CELL, MODEL, [], 0, [p]).size).toBeLessThan(clear);
  });

  it('(iv) an IN-SMOKE observer sees INTO smoke within its 1/8 bubble and nothing beyond', () => {
    const inSmokeSight = effectiveSight({ sightRange: CONFIG.vision.sight, radarRange: CONFIG.vision.radar }, false, true);
    expect(inSmokeSight).toBe(CONFIG.vision.radar * CONFIG.smokeScreen.inSmokeSightFraction);
    // A short track running along y = 60 u from the observer: every segment
    // midpoint well inside 82.5 u, a puff squarely on the line between.
    const near = new WakeSources();
    const h: WakeHull = { id: 'n', x: -20, y: 60, heading: 0, speed: 30, cls: 'battleship', color: 0xffffff, maxSpeedU: 60 };
    let t = 0;
    for (let i = 0; i < 4; i++) {
      near.observe(h, t);
      h.x += CONFIG.vision.wakeSampleU + 1;
      t += 50;
    }
    const origin = { x: 0, y: 0 };
    const mid = puff('sk1', t, 0, 30);
    const smoke = [mid, puff('sk2', t, 0, 0)]; // the observer's own puff too
    expect(buildTruesightWakeStamp(near, origin, inSmokeSight, t, CELL, MODEL, [], 0, smoke, false).size).toBe(0);
    expect(buildTruesightWakeStamp(near, origin, inSmokeSight, t, CELL, MODEL, [], 0, smoke, true).size).toBeGreaterThan(0);
    // A CLEAR segment at ~100 u (no puff anywhere near it) is beyond the in-smoke
    // bubble and is NOT revealed.
    const far = tracked();
    const farOwn = { x: 150, y: 140 }; // ~100 u north of the track at y=40
    expect(buildTruesightWakeStamp(far.sources, farOwn, SIGHT, far.t, CELL, MODEL, [], 0, []).size).toBeGreaterThan(0);
    expect(buildTruesightWakeStamp(far.sources, farOwn, inSmokeSight, far.t, CELL, MODEL, [], 0, [], true).size).toBe(0);
  });

  it('an in-smoke flip invalidates the cached stamp inside the floor', () => {
    const { sources, t } = tracked();
    const cache = new WakeStampCache();
    const onMe = puff('sk3', t, own.x + 10, own.y);
    expect(cache.stampFor(sources, own, SIGHT, t, CELL, MODEL, [], 0, [onMe], false).size).toBe(0);
    // Same sight radius on purpose, so only the flag can be the reason.
    expect(cache.stampFor(sources, own, SIGHT, t + 1, CELL, MODEL, [], 0, [onMe], true).size).toBeGreaterThan(0);
  });

  it('the growth bucket ticks only while a puff is live', () => {
    expect(smokeSetKey([], 0)).toBe(smokeSetKey([], 10 * SMOKE_GROWTH_BUCKET_MS));
    expect(smokeSetKey([puff('sk1')], 0)).toBe(smokeSetKey([puff('sk1')], SMOKE_GROWTH_BUCKET_MS - 1));
    expect(smokeSetKey([puff('sk1')], 0)).not.toBe(smokeSetKey([puff('sk1')], SMOKE_GROWTH_BUCKET_MS));
    expect(smokeSetKey([puff('sk1')], 0, true)).toBe(smokeSetKey([puff('sk2')], 99_999, true));
  });
});
