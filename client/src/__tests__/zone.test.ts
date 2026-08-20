// The storm plane's pure mappings (render/zone.ts) + the client's zone-view
// derivation (sim/zoneView.ts). The timeline math itself lives in
// shared/src/sim/zone.ts (ONE implementation for both sides — see
// shared/src/__tests__/zone.test.ts); the client-specific parts tested here are
// the STALE-BOUNDARY GUARD and Story 3.2's render grammar.
//
// Every number below is READ FROM CLIENT_CONFIG.zone, never mirrored: the 3.1
// version of this file kept its own BASE/AMP copies of the renderer's consts,
// which is a drift bomb (a config change that the test happily keeps passing
// against the old literal). Promoting the tunables (Story 3.2) retires it.

import { describe, it, expect } from 'vitest';
import { CONFIG, ZONE_BEATS_PER_GROUP, isOutside, type ZoneRing } from '@salvo/shared';
import {
  EDGE_COLOR,
  FILL_COLOR,
  RevealOneShot,
  dashSpans,
  degradedFlashAlpha,
  easeHold,
  fillOuterRadius,
  type FillView,
  markRingOf,
  needsRedraw,
  planeVisibility,
  revealFlashAlpha,
  ringKey,
  strokeWorldWidth,
  vignetteAlpha,
  vignetteHeld,
} from '../render/zone.js';
import { FLASH_ELEMENTS, createFlashBudget } from '../render/flashBudget.js';
import { zoneViewFrom, type ZonePlane } from '../sim/zoneView.js';
import { CLIENT_CONFIG } from '../config.js';

const Z = CLIENT_CONFIG.zone;
const CAP_HZ = CLIENT_CONFIG.settings.pulseCapHz;
/** The shipped user-zoom range (CLIENT_CONFIG.zoom) — the zoom-lock's contract. */
const ZOOMS = [CLIENT_CONFIG.zoom.min, 1, CLIENT_CONFIG.zoom.max];

const RING = (r: number, cx = 0, cy = 0): ZoneRing => ({ cx, cy, r });

describe('ring grammar (amendment 14) — solid current, dashed next, both violet', () => {
  it('draws BOTH on-water edges at storm-readout, and the fill at storm', () => {
    expect(EDGE_COLOR).toBe(CLIENT_CONFIG.colors.stormReadout);
    expect(FILL_COLOR).toBe(CLIENT_CONFIG.colors.storm);
  });

  it('retires the phosphor-green "safe ring" — no green enters the zone plane', () => {
    expect(EDGE_COLOR).not.toBe(CLIENT_CONFIG.colors.phosphor);
    expect(FILL_COLOR).not.toBe(CLIENT_CONFIG.colors.phosphor);
  });

  it('separates the two edges by SHAPE, not hue: the telegraph is the dashed one', () => {
    // The non-color channel is the whole point — the current edge is one
    // unbroken circle (no spans), the telegraph is a dash/gap pattern.
    const spans = dashSpans(Z.telegraphDashes, Z.telegraphDuty);
    expect(spans).toHaveLength(Z.telegraphDashes);
    const lit = spans.reduce((sum, [a0, a1]) => sum + (a1 - a0), 0);
    expect(lit).toBeCloseTo(Math.PI * 2 * Z.telegraphDuty, 9); // half lit at 50% duty
    // Dashes are evenly spaced and never overlap the next dash's start.
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
  });

  it('keeps the telegraph subordinate to the live boundary (alpha)', () => {
    expect(Z.telegraphAlpha).toBeLessThan(Z.edgeAlpha);
    expect(Z.telegraphAlpha).toBeCloseTo(0.5, 6); // the ratified ~50%
  });

  it('dashSpans survives a degenerate config: always dashed, never empty', () => {
    // Pure hardening. A mistuned segment count or duty must still produce a
    // readable DASHED telegraph — an empty span list draws no telegraph at all
    // (information deleted) and a full-duty one draws a solid circle, which is
    // the CURRENT edge's grammar (the two would stop being distinguishable).
    for (const segments of [0, -3, 2.7, NaN]) {
      const spans = dashSpans(segments, Z.telegraphDuty);
      expect(spans.length).toBeGreaterThanOrEqual(1);
      for (const [a0, a1] of spans) {
        expect(Number.isFinite(a0)).toBe(true);
        expect(a1).toBeGreaterThan(a0);
      }
    }
    for (const duty of [0, -1, 1, 1.5, NaN]) {
      const spans = dashSpans(Z.telegraphDashes, duty);
      expect(spans).toHaveLength(Z.telegraphDashes);
      const lit = spans.reduce((sum, [a0, a1]) => sum + (a1 - a0), 0);
      expect(lit).toBeGreaterThan(0); // never invisible
      expect(lit).toBeLessThan(Math.PI * 2); // never solid
      // gaps survive: every dash still ends before the next one starts
      for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
    }
  });
});

describe('strokeWorldWidth — the SCREEN-LOCKED stroke (zoom invariance)', () => {
  it('renders the same on-screen px at 0.5x / 1.0x / 1.5x zoom', () => {
    for (const zoom of ZOOMS) {
      // chartRoot is scaled by exactly `zoom`, so on-screen px = world width x zoom.
      expect(strokeWorldWidth(Z.edgePx, zoom) * zoom).toBeCloseTo(Z.edgePx, 9);
      expect(strokeWorldWidth(Z.telegraphPx, zoom) * zoom).toBeCloseTo(Z.telegraphPx, 9);
    }
  });

  it('FATTENS the world stroke as the camera zooms out (the 3.1 hairline bug)', () => {
    // The interim renderer used a fixed 2 WORLD units, which at 0.5x drew ~1px.
    expect(strokeWorldWidth(Z.edgePx, 0.5)).toBeGreaterThan(strokeWorldWidth(Z.edgePx, 1.5));
    expect(strokeWorldWidth(Z.edgePx, 0.5)).toBe(Z.edgePx / 0.5);
  });

  it('never yields NaN/Infinity for a degenerate camera zoom', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const w = strokeWorldWidth(Z.edgePx, bad);
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(0);
    }
  });
});

describe('fillOuterRadius — the FULL-AREA storm fill (amendment 15)', () => {
  const MAP_R = CONFIG.map.baseRadius;
  /** The maximum effective radar range. No card writes `radarRange` (the boon
   *  line that did was deleted in cycle 119), so the ceiling IS the base — and
   *  the camera fits 2 x radar on the SHORT axis, so this is the widest view a
   *  player's own sensors ever give the fill to cover. */
  const MAX_RADAR = CONFIG.vision.radar;

  const view = (o: Partial<FillView> = {}): FillView => ({
    cur: { cx: 0, cy: 0 },
    camX: 0,
    camY: 0,
    zoom: 1,
    screenW: 1920,
    screenH: 1080,
    mapRadius: MAP_R,
    ...o,
  });

  /** The camera zoom a viewport lands at for a given radar range + user zoom. */
  const zoomFor = (vw: number, vh: number, radar: number, user: number): number =>
    (Math.min(vw, vh) / (2 * radar)) * user;

  /** EXACTLY what the disc must reach: the ring center is its origin, and the
   *  farthest visible point is the opposite screen corner from the camera. */
  const needed = (v: FillView): number =>
    Math.hypot(v.camX - v.cur.cx, v.camY - v.cur.cy) +
    Math.hypot(v.screenW, v.screenH) / 2 / v.zoom;

  it('reaches well past the map edge in ordinary play, and stays on its floor', () => {
    const v = view({ zoom: zoomFor(1920, 1080, CONFIG.vision.radar, 1) });
    expect(fillOuterRadius(v)).toBeGreaterThan(MAP_R);
    // Ordinary play never leaves the floor's bucket — so the disc is drawn once
    // and never re-tessellated by a camera that is merely following a hull.
    expect(fillOuterRadius(v)).toBe(Math.ceil((MAP_R * Z.fillOuterFactor) / Z.fillBucketU) * Z.fillBucketU);
  });

  it('covers ANY viewport / zoom / camera offset thrown at it (the dynamic bound)', () => {
    const viewports = [
      [1280, 614], // the logical floor
      [1920, 1080],
      [2560, 1080],
      [3440, 720], // short-wide: the case a constant x7 factor misses
      [3840, 1080],
      [720, 3440], // portrait, for symmetry
    ];
    for (const [vw, vh] of viewports) {
      for (const radar of [CONFIG.vision.radar, MAX_RADAR]) {
        for (const user of [CLIENT_CONFIG.zoom.min, 1, CLIENT_CONFIG.zoom.max]) {
          for (const [dx, dy] of [[0, 0], [MAP_R, MAP_R], [-9_000, 4_000]]) {
            const v = view({
              zoom: zoomFor(vw, vh, radar, user),
              screenW: vw,
              screenH: vh,
              cur: { cx: 180, cy: -90 },
              camX: 180 + dx,
              camY: -90 + dy,
            });
            expect(fillOuterRadius(v)).toBeGreaterThan(needed(v));
          }
        }
      }
    }
  });

  it('FAIL-PROOF: 3440x720 at min zoom with a maxed radar stack', () => {
    // THE HISTORICAL DEMONSTRATION IS RETIRED, NOT THE TEST (Story 5.6,
    // amendment 41). At mapRadius 2400 the pre-fix CONSTANT bound
    // (mapRadius x 7 = 16800u) fell ~760u short of this configuration, and this
    // case asserted that shortfall directly. At 2800 the constant scales to
    // 19600u while the viewport term does not move at all, so the constant
    // would now cover THIS case — the old assertion is simply false, and
    // re-deriving a bigger constant to chase it would be re-introducing the bug
    // the dynamic bound exists to prevent. What remains is the property that
    // was always the point: the dynamic radius covers the honest worst case at
    // the map's widest camera separation. That no constant can EVER cover it is
    // proved by the far-panned-spectator case below, where free pan is
    // unclamped and `needed` is unbounded.
    const v = view({
      screenW: 3440,
      screenH: 720,
      zoom: zoomFor(3440, 720, MAX_RADAR, CLIENT_CONFIG.zoom.min),
      // A ring hugging one map edge with the camera at the opposite one: the
      // two are 2 x mapRadius apart, which is the honest worst case.
      cur: { cx: -MAP_R, cy: 0 },
      camX: MAP_R,
      camY: 0,
    });
    // The camera sits a full map diameter from the ring and still sees past it.
    expect(needed(v)).toBeGreaterThan(2 * MAP_R);
    expect(fillOuterRadius(v)).toBeGreaterThan(needed(v));
  });

  it('covers a far-panned SPECTATOR (free pan is unclamped — no constant covers it)', () => {
    for (const d of [10_000, 250_000, 5_000_000]) {
      const v = view({ camX: d, camY: -d, zoom: zoomFor(2560, 1080, MAX_RADAR, 1), screenW: 2560, screenH: 1080 });
      expect(fillOuterRadius(v)).toBeGreaterThan(needed(v));
      expect(Number.isFinite(fillOuterRadius(v))).toBe(true);
    }
  });

  it('BUCKETS upward, so a panning camera does not re-tessellate every frame', () => {
    const base = view({ camX: 29_000, zoom: 0.2 });
    const r = fillOuterRadius(base);
    expect(r % Z.fillBucketU).toBe(0); // always on a bucket step
    // Creeping the camera a few hundred units cannot move the drawn radius.
    for (const dx of [1, 50, 400]) {
      expect(fillOuterRadius(view({ camX: 29_000 + dx, zoom: 0.2 }))).toBe(r);
    }
    // ...but a genuine pan past a step does.
    expect(fillOuterRadius(view({ camX: 29_000 + Z.fillBucketU * 2, zoom: 0.2 }))).toBeGreaterThan(r);
  });

  it('stays finite and positive for a degenerate map radius or camera', () => {
    expect(fillOuterRadius(view({ mapRadius: 0 }))).toBeGreaterThan(0);
    for (const bad of [0, -1, NaN, Infinity]) {
      const r = fillOuterRadius(view({ zoom: bad }));
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
    for (const bad of [NaN, Infinity]) {
      const r = fillOuterRadius(view({ camX: bad, mapRadius: NaN, screenW: bad }));
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });

  it('keeps the fill low enough to be ambience, not a legibility surface', () => {
    // The EDGE carries the 3:1 contrast (DESIGN.md storm note); blips, contacts
    // and the sweep all draw ABOVE layers.zone and must stay readable through it.
    expect(Z.fillAlpha).toBeGreaterThan(0);
    expect(Z.fillAlpha).toBeLessThanOrEqual(0.15);
    expect(Z.fillAlpha).toBeLessThan(Z.edgeAlpha);
  });
});

describe('planeVisibility — the I/O matrix rows that decide what is drawn', () => {
  const next = RING(1561, 180, -90);
  const COLLAPSE = RING(0, 300, 120); // the sudden-death final ring: a POINT

  it('pre-reveal (clear/supply, next=null): plane only, no telegraph anywhere', () => {
    expect(planeVisibility('clear', RING(2400), null)).toEqual({ plane: true, telegraph: false, mark: false });
    expect(planeVisibility('supply', RING(2400), null)).toEqual({ plane: true, telegraph: false, mark: false });
  });

  it('reveal + closing: plane AND telegraph', () => {
    expect(planeVisibility('reveal', RING(2400), next)).toEqual({ plane: true, telegraph: true, mark: false });
    expect(planeVisibility('closing', RING(2000), next)).toEqual({ plane: true, telegraph: true, mark: false });
  });

  it('closed: terminal ring holds, no telegraph', () => {
    expect(planeVisibility('closed', RING(660, 300, 120), null)).toEqual({
      plane: true,
      telegraph: false,
      mark: false,
    });
  });

  it('idle draws nothing at all', () => {
    expect(planeVisibility('idle', RING(2400), next)).toEqual({ plane: false, telegraph: false, mark: false });
  });

  // RETIRED (sudden death, 2026-08-14): "a degenerate r=0 sentinel draws
  // nothing". That row was written when radius 0 could only mean "no data";
  // under the final collapse it is a real ring and hiding the plane there would
  // erase the storm at the exact instant the whole map becomes storm. What
  // replaces it is below — the plane STAYS and the X mark takes the dashed
  // telegraph's place, because a ring with no radius is a point, not a circle.
  it('a COLLAPSE ring revealed: plane, the X mark, and NO dashed telegraph', () => {
    expect(planeVisibility('reveal', RING(660, 300, 120), COLLAPSE)).toEqual({
      plane: true,
      telegraph: false,
      mark: true,
    });
    expect(planeVisibility('closing', RING(330, 300, 120), COLLAPSE)).toEqual({
      plane: true,
      telegraph: false,
      mark: true,
    });
  });

  it('a FULLY collapsed live ring still draws the plane (the whole map is storm) and keeps the mark', () => {
    expect(planeVisibility('closed', COLLAPSE, null)).toEqual({
      plane: true,
      telegraph: false,
      mark: true,
    });
    // FAIL-PROOF: the pre-ruling rule returned plane:false here, which would
    // delete the storm from the screen at the worst possible moment.
    expect(planeVisibility('closed', COLLAPSE, null).plane).toBe(true);
  });

  it('idle still draws nothing, mark included (the collapse point is not a pre-match cue)', () => {
    expect(planeVisibility('idle', COLLAPSE, COLLAPSE)).toEqual({
      plane: false,
      telegraph: false,
      mark: false,
    });
  });

  it('markRingOf points at the revealed collapse ring, then at the live ring once it has landed on it', () => {
    // Through the close the mark rides the revealed collapse ring...
    expect(markRingOf(RING(330, 300, 120), COLLAPSE)).toBe(COLLAPSE);
    // ...and after full closure there is no next ring, so it rides the live one.
    expect(markRingOf(COLLAPSE, null)).toBe(COLLAPSE);
    // An ordinary ring pair marks nothing at all.
    expect(markRingOf(RING(2400), next)).toBeNull();
    expect(markRingOf(RING(660, 300, 120), null)).toBeNull();
    // The two rings are the same POINT by construction (the collapse is
    // concentric), so the mark never moves and its identity never changes —
    // which is what lets it claim exactly one reveal flash and then persist.
    expect(ringKey(markRingOf(RING(330, 300, 120), COLLAPSE))).toBe(ringKey(markRingOf(COLLAPSE, null)));
  });
});

describe('needsRedraw — the throttle keyed on radius AND zoom', () => {
  it('always draws the first frame (never-drawn sentinel)', () => {
    expect(needsRedraw(-1, -1, 2400, 1)).toBe(true);
  });

  it('ALWAYS redraws when the ring collapses to nothing, however small the last step', () => {
    // The collapse ends by pinning the radius at exactly 0, arriving from a
    // last redraw somewhere inside the sub-unit epsilon. Without the degenerate
    // -boundary clause the epsilon swallows that final step, drawStorm's whole
    // radius-0 branch never runs, and the fully collapsed plane keeps a
    // sub-unit hole with a ring edge stroked around the collapse point — a
    // visible dot where the map is supposed to be solid storm.
    expect(needsRedraw(Z.redrawEpsU / 2, 1, 0, 1)).toBe(true);
    expect(needsRedraw(0.01, 1, 0, 1)).toBe(true);
    // ...and in the other direction, so a re-anchored zone re-cuts its hole.
    expect(needsRedraw(0, 1, Z.redrawEpsU / 2, 1)).toBe(true);
    // A non-degenerate sub-epsilon step is still throttled (the clause is about
    // a change of KIND, not a change of size).
    expect(needsRedraw(0.6, 1, 0.9, 1)).toBe(false);
  });

  it('ignores sub-epsilon radius drift while closing (position-only updates)', () => {
    expect(needsRedraw(2400, 1, 2400 + Z.redrawEpsU / 2, 1)).toBe(false);
    expect(needsRedraw(2400, 1, 2400 - Z.redrawEpsU * 2, 1)).toBe(true);
  });

  it('re-strokes when the ZOOM moves past the epsilon (else the lock is a lie)', () => {
    const z = 1;
    expect(needsRedraw(2400, z, 2400, z * (1 + Z.redrawZoomFrac / 2))).toBe(false);
    expect(needsRedraw(2400, z, 2400, z * (1 + Z.redrawZoomFrac * 4))).toBe(true);
    expect(needsRedraw(2400, z, 2400, z * 0.5)).toBe(true); // a full zoom-out step
  });

  it('is relative to the current zoom, so it behaves the same at any base zoom', () => {
    for (const base of [0.2, 1, 5]) {
      expect(needsRedraw(2400, base, 2400, base * 1.5)).toBe(true);
      expect(needsRedraw(2400, base, 2400, base * (1 + Z.redrawZoomFrac / 2))).toBe(false);
    }
  });
});

describe('the reveal ONE-SHOT (amendment 17)', () => {
  const RING1 = RING(1561, 180, -90);
  const RING2 = RING(1015, 260, -40);
  const AMP = Z.revealAmp;

  it('is silent while nothing is revealed', () => {
    const os = new RevealOneShot();
    expect(os.update(null, 0, AMP)).toBe(0);
    expect(os.update(null, 1_000, AMP)).toBe(0);
  });

  it('flashes ONCE on the null -> non-null edge and settles inside the envelope', () => {
    const os = new RevealOneShot();
    const t0 = 10_000;
    expect(os.update(null, t0 - 16, AMP)).toBe(0);
    expect(os.update(RING1, t0, AMP)).toBeCloseTo(AMP, 9); // peak at the reveal
    expect(os.update(RING1, t0 + Z.revealMs / 2, AMP)).toBeCloseTo(AMP / 2, 9); // decaying
    expect(os.update(RING1, t0 + Z.revealMs, AMP)).toBe(0); // settled
    expect(os.update(RING1, t0 + 5_000, AMP)).toBe(0); // and stays settled
  });

  it('never re-fires for the SAME ring — the stale-boundary re-derivation guard', () => {
    // zoneViewFrom's guard can flip `next` non-null -> null -> non-null for the
    // same ring as the server-clock estimate jitters across a group boundary.
    // A naive rising edge would flash on every flip; the ring identity must not.
    const os = new RevealOneShot();
    os.update(RING1, 0, AMP);
    os.update(RING1, Z.revealMs, AMP); // settled
    expect(os.update(null, 1_000, AMP)).toBe(0);
    expect(os.update(RING1, 1_016, AMP)).toBe(0); // same ring back — no flash
    expect(os.update(RING1, 60_000, AMP)).toBe(0);
  });

  it('DOES fire for the next group’s ring (a genuinely new reveal)', () => {
    const os = new RevealOneShot();
    os.update(RING1, 0, AMP);
    expect(os.update(RING2, 240_000, AMP)).toBeCloseTo(AMP, 9);
  });

  it('structurally guarantees the >=300ms spacing between fires', () => {
    const os = new RevealOneShot();
    expect(os.update(RING1, 0, AMP)).toBeCloseTo(AMP, 9);
    // A second ring arriving inside the floor cannot fire a second flash there.
    expect(os.update(RING2, Z.revealFloorMs - 1, AMP)).toBe(0);
    expect(Z.revealFloorMs).toBeGreaterThanOrEqual(300);
    expect(Z.revealMs).toBeLessThanOrEqual(80);
  });

  it('motion=off: no flourish, and no delayed flash if motion comes back on', () => {
    const os = new RevealOneShot();
    expect(os.update(RING1, 0, 0)).toBe(0); // amp 0 = the motion-scaled `off` level
    expect(os.update(RING1, 20, 0)).toBe(0);
    // The reveal was still RECORDED, so re-enabling motion cannot resurrect it.
    expect(os.update(RING1, 40, AMP)).toBe(0);
  });

  it('dies INSTANTLY when motion drops to off mid-envelope (latched amp clamp)', () => {
    // The amplitude is latched at fire time so a later motion change cannot
    // resurrect a flash. The other direction has to hold too: a player who hits
    // "reduce motion" DURING the 80ms envelope must not keep watching the flash
    // they just switched off — the CURRENT frame's amp caps the returned alpha.
    const os = new RevealOneShot();
    expect(os.update(RING1, 0, AMP)).toBeCloseTo(AMP, 9); // fired at motion=full
    expect(os.update(RING1, Z.revealMs / 4, 0)).toBe(0); // motion -> off mid-flash
    expect(os.update(RING1, Z.revealMs / 2, 0)).toBe(0);
    // ...and `reduced` mid-envelope clamps to the reduced level, not the latch.
    const os2 = new RevealOneShot();
    os2.update(RING1, 0, AMP);
    expect(os2.update(RING1, 0, AMP * 0.5)).toBeCloseTo(AMP * 0.5, 9);
  });

  it('halves the flash at motion=reduced (amplitude is the motion channel)', () => {
    const os = new RevealOneShot();
    expect(os.update(RING1, 0, AMP * 0.5)).toBeCloseTo(AMP / 2, 9);
  });

  // --- STORY 4.8: the aggregate flash budget's element claim -------------------
  //
  // The reveal is `FLASH_ELEMENTS.zoneReveal`. It already fires at most once per
  // ring identity behind a 300ms floor, so the claim can never realistically
  // bind — it is the AGGREGATE guarantee stated in code. What matters is that
  // when a verdict DOES come back `'degrade'`, the mark still lands.

  it('claims the budget ONCE per fire, never per frame', () => {
    const budget = createFlashBudget();
    const claims: number[] = [];
    const spy = { claim: (k: string, t: number) => (claims.push(t), budget.claim(k, t)), coalesce: budget.coalesce.bind(budget), reset: budget.reset.bind(budget) };
    const os = new RevealOneShot();
    os.update(RING1, 0, AMP);
    for (let t = 0; t < Z.revealMs; t += 8) os.update(RING1, t, AMP, spy);
    expect(claims).toHaveLength(0); // the fire already happened, unclaimed above
    const os2 = new RevealOneShot();
    for (let t = 0; t < Z.revealMs * 4; t += 8) os2.update(RING1, t, AMP, spy);
    expect(claims).toEqual([0]); // one onset, one claim, however many frames run
  });

  it('spends NO onset for a flash the motion setting suppressed', () => {
    // The budget's own contract: a flash that did not flash must not consume
    // budget (a degraded claim records nothing for exactly this reason). At
    // `motion: 'off'` the amplitude is 0 and the reveal draws nothing at all, so
    // claiming there would charge the zoneReveal element for a flash no one saw
    // — and the other three sites already order it this way (effects.ts claims
    // after its `peakAlpha <= 0` early-out; ships.ts and upgradeMenu.ts gate the
    // claim behind their motion checks).
    const budget = createFlashBudget();
    const claims: number[] = [];
    const spy = { claim: (k: string, t: number) => (claims.push(t), budget.claim(k, t)), coalesce: budget.coalesce.bind(budget), reset: budget.reset.bind(budget) };
    const os = new RevealOneShot();
    expect(os.update(RING1, 0, 0, spy)).toBe(0); // motion off: nothing draws
    expect(claims).toHaveLength(0);
    // ...and the element's window is untouched: three real flashes still animate.
    for (let i = 0; i < CLIENT_CONFIG.flashBudget.maxPerSecond; i++) {
      expect(budget.claim(FLASH_ELEMENTS.zoneReveal, 0)).toBe('animate');
    }
  });

  it('a DEGRADED reveal still lands its mark — flat, full life, never zero', () => {
    // Force the verdict by filling the element's window first: the budget's
    // floor is `maxPerSecond` onsets, so the next claim degrades.
    const budget = createFlashBudget();
    for (let i = 0; i < CLIENT_CONFIG.flashBudget.maxPerSecond; i++) {
      expect(budget.claim(FLASH_ELEMENTS.zoneReveal, i)).toBe('animate');
    }
    expect(budget.claim(FLASH_ELEMENTS.zoneReveal, 10)).toBe('degrade');
    const os = new RevealOneShot();
    const flat = AMP * CLIENT_CONFIG.flashBudget.degradeAlphaFactor;
    expect(os.update(RING1, 20, AMP, budget)).toBeCloseTo(flat, 9); // still a mark
    for (let t = 20; t < 20 + Z.revealMs; t += 8) {
      expect(os.update(RING1, t, AMP, budget)).toBeCloseTo(flat, 9); // FLAT: no ramp
    }
    expect(os.update(RING1, 20 + Z.revealMs, AMP, budget)).toBe(0); // same envelope length
  });

  it('degradedFlashAlpha is the ratified degrade shape: same life, no ramp', () => {
    const flat = AMP * CLIENT_CONFIG.flashBudget.degradeAlphaFactor;
    expect(degradedFlashAlpha(-Infinity, AMP)).toBe(0);
    expect(degradedFlashAlpha(-5, AMP)).toBe(0);
    for (let t = 0; t < Z.revealMs; t += 1) expect(degradedFlashAlpha(t, AMP)).toBeCloseTo(flat, 9);
    expect(degradedFlashAlpha(Z.revealMs, AMP)).toBe(0);
    // It is DIMMER than the animated peak but never invisible, and it never
    // makes anything MORE visible than the animation it replaced.
    expect(flat).toBeGreaterThan(0);
    expect(flat).toBeLessThan(revealFlashAlpha(0, AMP));
    expect(degradedFlashAlpha(0, 0)).toBe(0); // motion=off stays off
  });

  it('revealFlashAlpha is a single decay, never negative, never re-blooming', () => {
    expect(revealFlashAlpha(-Infinity, AMP)).toBe(0); // never fired
    expect(revealFlashAlpha(-5, AMP)).toBe(0);
    expect(revealFlashAlpha(0, AMP)).toBeCloseTo(AMP, 9);
    expect(revealFlashAlpha(Z.revealMs, AMP)).toBe(0);
    expect(revealFlashAlpha(Z.revealMs * 10, AMP)).toBe(0);
    for (let t = 0; t < Z.revealMs; t += 1) {
      const a = revealFlashAlpha(t, AMP);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(AMP);
    }
  });

  it('the settled telegraph alpha never exceeds full opacity at the peak', () => {
    expect(Z.telegraphAlpha + Z.revealAmp).toBeLessThanOrEqual(1);
  });

  it('ringKey identifies a ring, and null stays null', () => {
    expect(ringKey(null)).toBeNull();
    expect(ringKey(RING1)).toBe(ringKey({ ...RING1 }));
    expect(ringKey(RING1)).not.toBe(ringKey(RING2));
  });
});

describe('vignetteAlpha — out-of-zone feedback mapping', () => {
  const BASE = Z.vignetteBase;
  const AMP = Z.vignetteAmp;

  it('is exactly 0 when not in the storm (any time, any tier)', () => {
    expect(vignetteAlpha(false, 0)).toBe(0);
    expect(vignetteAlpha(false, 12.34)).toBe(0);
    expect(vignetteAlpha(false, 999, AMP, true)).toBe(0);
  });

  it('sits at the base alpha at the pulse zero-crossing (t=0)', () => {
    expect(vignetteAlpha(true, 0)).toBeCloseTo(BASE, 9);
  });

  it('stays within [base-amp, base+amp] and always strictly positive while in storm', () => {
    for (let t = 0; t < 4; t += 0.05) {
      const a = vignetteAlpha(true, t);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeGreaterThanOrEqual(BASE - AMP - 1e-9);
      expect(a).toBeLessThanOrEqual(BASE + AMP + 1e-9);
    }
  });

  it('breathes at the SHARED photosensitivity ceiling, never its own rate', () => {
    const peakT = 0.25 / CAP_HZ; // sin = +1
    const troughT = 0.75 / CAP_HZ; // sin = -1
    expect(vignetteAlpha(true, peakT)).toBeCloseTo(BASE + AMP, 6);
    expect(vignetteAlpha(true, troughT)).toBeCloseTo(BASE - AMP, 6);
  });

  it('motion=off holds the steady BASE alpha (information, not motion)', () => {
    for (const t of [0, 0.3, 1.7, 42]) expect(vignetteAlpha(true, t, 0)).toBeCloseTo(BASE, 9);
  });

  it('TIER-1 HOLD: freezes at the lit (max-alpha) keyframe, then resumes breathing', () => {
    for (const t of [0, 0.3, 1.7, 42]) {
      expect(vignetteAlpha(true, t, AMP, true)).toBeCloseTo(BASE + AMP, 9);
      // ...and it is a HOLD at the top of the same wave, never a new brightness.
      expect(vignetteAlpha(true, t, AMP, true)).toBeCloseTo(vignetteAlpha(true, 0.25 / CAP_HZ), 6);
    }
    expect(vignetteAlpha(true, 0.75 / CAP_HZ, AMP, false)).toBeCloseTo(BASE - AMP, 6); // resumed
  });

  it('the Tier-1 hold is a no-op at motion=off (never a hidden motion exception)', () => {
    expect(vignetteAlpha(true, 1.7, 0, true)).toBeCloseTo(BASE, 9);
  });
});

describe('the Tier-1 hold EASING (amendment 16 under the photosensitivity floor)', () => {
  const AMP = Z.vignetteAmp;
  const FRAME_MS = 16; // ~60fps

  /**
   * The renderer's per-frame vignette alpha over a script of Tier-1 states —
   * exactly what Zone.updateVignette computes, frame by frame, so what these
   * tests measure is what the player sees.
   */
  const run = (holds: boolean[], amp: number = AMP): number[] => {
    const out: number[] = [];
    let tSec = 0;
    let hold = 0;
    for (const h of holds) {
      hold = easeHold(hold, h ? 1 : 0, FRAME_MS);
      out.push(vignetteHeld(true, tSec, amp, hold));
      tSec += FRAME_MS / 1000;
    }
    return out;
  };

  /** The frame-by-frame breathing baseline (no Tier-1 anywhere). */
  const baseline = (n: number, amp: number = AMP): number[] => run(new Array(n).fill(false), amp);

  /** The LIT keyframe (what a sustained hold must converge to). */
  const LIT = Z.vignetteBase + AMP;

  /** How far a run departed from the breathing baseline, as a fraction of the
   *  full hold delta (breathing → lit) available on that frame. */
  const departure = (got: number[], base: number[]): number =>
    Math.max(...got.map((a, i) => Math.abs(a - base[i]) / Math.abs(LIT - base[i])));

  it('FAIL-PROOF: one 80ms denied-fire blip must not square-wave the vignette', () => {
    // Click-spam in the storm lands an accepted denial every 300ms, each live
    // for 80ms. A hold that SNAPS turns that into up to 3.3 full-amplitude
    // full-screen flashes per second — over the ≤1.1Hz / ≤3-flashes-per-region
    // floor this story itself pins. A brief blip may only swell the vignette.
    const blip = [true, true, true, true, true]; // 5 x 16ms ≈ the 80ms pulse
    expect(departure(run(blip), baseline(blip.length))).toBeLessThan(0.35);
  });

  it('a SUSTAINED hold (low hull) still converges to the lit keyframe', () => {
    const frames = new Array(Math.ceil(2_000 / FRAME_MS)).fill(true);
    const alphas = run(frames);
    expect(alphas[alphas.length - 1]).toBeCloseTo(LIT, 3);
    // ...it gets there without ever overshooting the lit keyframe (the hold is
    // an approach, never a brighter-than-lit flash)...
    for (const a of alphas) expect(a).toBeLessThanOrEqual(LIT + 1e-9);
    // ...and it is already most of the way there within ~3 time constants.
    const settled = alphas[Math.ceil((Z.holdEaseMs * 3) / FRAME_MS)];
    expect(settled).toBeGreaterThan(Z.vignetteBase + AMP * 0.9);
  });

  it('RELEASE eases back down to the breathing curve', () => {
    const hold = new Array(Math.ceil(2_000 / FRAME_MS)).fill(true);
    const release = new Array(Math.ceil(2_000 / FRAME_MS)).fill(false);
    const alphas = run([...hold, ...release]);
    const base = baseline(alphas.length);
    expect(alphas[alphas.length - 1]).toBeCloseTo(base[base.length - 1], 3);
  });

  it('motion=off stays CONSTANT at the base alpha, held or not (no new motion)', () => {
    const script = [false, false, true, true, true, false, false, true];
    for (const a of run(script, 0)) expect(a).toBeCloseTo(Z.vignetteBase, 9);
  });
});

describe('zoneViewFrom — the stale close-boundary guard (review FIX 1)', () => {
  const BEAT = CONFIG.zone.beatMs;
  const GROUP_MS = ZONE_BEATS_PER_GROUP * BEAT;
  const START = 5_000;
  // The schema pair as it stands DURING group 0's close: cur = ring 0 (full
  // map at origin), next = the revealed ring 1 (offset, smaller).
  const RING0 = { cx: 0, cy: 0, r: 2400 };
  const RING1 = { cx: 180, cy: -90, r: 1561 };
  const staleSchema: ZonePlane = {
    zoneState: 'closing',
    zoneStartT: START,
    zoneCurCx: RING0.cx, zoneCurCy: RING0.cy, zoneCurR: RING0.r,
    zoneNextCx: RING1.cx, zoneNextCy: RING1.cy, zoneNextR: RING1.r,
  };

  it('holds ring g+1 when the local clock crosses the boundary before the promoting patch', () => {
    // Local server-clock estimate has entered group 1's clear beat, but the
    // schema still carries the pre-promotion pair. FAIL-PROOF: without the
    // guard the derived cur is ring 0 (r=2400) — the ring "pops back out".
    const now = START + GROUP_MS + 10;
    const zv = zoneViewFrom(staleSchema, 2400, now);
    expect(zv.state).toBe('clear');
    expect(zv.cur).toEqual(RING1); // ring g+1, not the stale ring g
    expect(zv.next).toBeNull(); // a clear beat reveals nothing
    // inStorm continuity corollary: a hull at ring 0's edge stays OUT.
    const edge = { x: 2300, y: 0 };
    expect(Math.hypot(edge.x - zv.cur.cx, edge.y - zv.cur.cy) > zv.cur.r).toBe(true);
  });

  it('still interpolates normally INSIDE the close beat (guard must not fire early)', () => {
    const now = START + GROUP_MS - BEAT / 2; // f = 0.5 through the close
    const zv = zoneViewFrom(staleSchema, 2400, now);
    expect(zv.state).toBe('closing');
    expect(zv.cur.r).toBeCloseTo((RING0.r + RING1.r) / 2, 9);
    expect(zv.next).toEqual(RING1);
  });

  it('final closure with a stale pair collapses onto the terminal ring’s center (closed branch)', () => {
    // RE-DERIVED for sudden death (2026-08-14): full closure is now 16:00, one
    // group past the 660u endgame ring, and the closed state is the COLLAPSE
    // ring — the terminal ring's own center at radius 0. Holding the 660u ring
    // through the stale window would draw an open safe circle over a map that
    // is entirely storm, which is precisely what closedState now prevents.
    const terminal = { cx: 300, cy: 120, r: 660 };
    const lastClose: ZonePlane = {
      ...staleSchema,
      zoneCurCx: RING1.cx, zoneCurCy: RING1.cy, zoneCurR: RING1.r,
      zoneNextCx: terminal.cx, zoneNextCy: terminal.cy, zoneNextR: terminal.r,
    };
    const now = START + 4 * GROUP_MS + 10; // past full closure, patch not landed
    const zv = zoneViewFrom(lastClose, 2400, now);
    expect(zv.state).toBe('closed');
    expect(zv.cur).toEqual({ cx: terminal.cx, cy: terminal.cy, r: 0 });
    expect(zv.next).toBeNull();
  });

  it('decodes a genuinely COLLAPSED current ring verbatim — never the full map', () => {
    // THE TRAP (pre-existing, written when radius 0 could only mean "no data"):
    // `s.zoneCurR || mapRadius` turned the server's fully collapsed ring into a
    // FULL-MAP SAFE ring — the exact inverse of the truth, at the one moment it
    // matters most. The fallback is absence-gated now.
    const collapsed: ZonePlane = {
      zoneState: 'closed',
      zoneStartT: START,
      zoneCurCx: 300, zoneCurCy: 120, zoneCurR: 0,
      zoneNextCx: 0, zoneNextCy: 0, zoneNextR: 0,
    };
    const zv = zoneViewFrom(collapsed, 2400, START + 4 * GROUP_MS + 10);
    expect(zv.state).toBe('closed');
    expect(zv.cur).toEqual({ cx: 300, cy: 120, r: 0 });
    expect(zv.cur.r).not.toBe(2400); // FAIL-PROOF against the `||` fallback
    // ...and nowhere on the map is safe from it.
    expect(isOutside({ x: 300, y: 120 }, zv.cur.cx, zv.cur.cy, zv.cur.r)).toBe(true);
    expect(isOutside({ x: 0, y: 0 }, zv.cur.cx, zv.cur.cy, zv.cur.r)).toBe(true);
  });

  it('still falls back to the full map when the schema simply has NO ring yet (absence, not zero)', () => {
    const unsynced: ZonePlane = { zoneState: 'clear', zoneStartT: START };
    expect(zoneViewFrom(unsynced, 2400, START + 10).cur).toEqual({ cx: 0, cy: 0, r: 2400 });
  });

  it('synthesizes the collapse ring from the wire sentinel through the whole final group', () => {
    // The server mirrors the collapse ring as `zoneNextR === 0` (the unrevealed
    // sentinel), so the client never RECEIVES it — in the final group it
    // rebuilds it from the terminal ring it already holds. Center held fixed,
    // radius interpolating to zero.
    const terminal = { cx: 300, cy: 120, r: 660 };
    const finalGroup: ZonePlane = {
      zoneState: 'reveal',
      zoneStartT: START,
      zoneCurCx: terminal.cx, zoneCurCy: terminal.cy, zoneCurR: terminal.r,
      zoneNextCx: terminal.cx, zoneNextCy: terminal.cy, zoneNextR: 0, // the sentinel
    };
    const mark = zoneViewFrom(finalGroup, 2400, START + 3 * GROUP_MS + 2 * BEAT + 10);
    expect(mark.state).toBe('reveal');
    expect(mark.next).toEqual({ cx: terminal.cx, cy: terminal.cy, r: 0 });
    expect(mark.cur).toEqual(terminal); // the live ring HOLDS through the mark
    const mid = zoneViewFrom(finalGroup, 2400, START + 3 * GROUP_MS + 3 * BEAT + BEAT / 2);
    expect(mid.state).toBe('closing');
    expect(mid.cur.cx).toBe(terminal.cx); // BYTE-exact: concentric, no drift
    expect(mid.cur.cy).toBe(terminal.cy);
    expect(mid.cur.r).toBeCloseTo(330, 9);
    expect(mid.closesInMs).toBeCloseTo(BEAT / 2, 9);
  });

  it('a REAL clear beat (next zeroed by the server) is untouched by the guard', () => {
    const clearSchema: ZonePlane = {
      zoneState: 'clear',
      zoneStartT: START,
      zoneCurCx: RING1.cx, zoneCurCy: RING1.cy, zoneCurR: RING1.r,
      zoneNextCx: 0, zoneNextCy: 0, zoneNextR: 0,
    };
    const zv = zoneViewFrom(clearSchema, 2400, START + GROUP_MS + 10);
    expect(zv.state).toBe('clear');
    expect(zv.cur).toEqual(RING1);
  });

  it('feeds the one-shot a STABLE ring identity across the guard flip', () => {
    // The guard's window: `next` is the same RING1 before the boundary and null
    // after it. The renderer keys the flash on identity, so a jittering clock
    // estimate flipping back and forth cannot strobe the telegraph.
    const before = zoneViewFrom(staleSchema, 2400, START + GROUP_MS - 10);
    const after = zoneViewFrom(staleSchema, 2400, START + GROUP_MS + 10);
    expect(ringKey(before.next)).toBe(ringKey(RING1));
    expect(ringKey(after.next)).toBeNull();
    const os = new RevealOneShot();
    expect(os.update(before.next, 0, Z.revealAmp)).toBeCloseTo(Z.revealAmp, 9);
    expect(os.update(after.next, Z.revealMs, Z.revealAmp)).toBe(0);
    expect(os.update(before.next, Z.revealMs * 2, Z.revealAmp)).toBe(0); // no re-flash
  });
});
