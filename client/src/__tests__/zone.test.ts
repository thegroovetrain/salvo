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
import { CONFIG, ZONE_BEATS_PER_GROUP, type ZoneRing } from '@salvo/shared';
import {
  EDGE_COLOR,
  FILL_COLOR,
  RevealOneShot,
  dashSpans,
  fillOuterRadius,
  needsRedraw,
  planeVisibility,
  revealFlashAlpha,
  ringKey,
  strokeWorldWidth,
  vignetteAlpha,
} from '../render/zone.js';
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
  it('reaches well past the map edge, so no open water sits outside the ring', () => {
    const mapR = CONFIG.map.baseRadius;
    expect(fillOuterRadius(mapR)).toBeGreaterThan(mapR);
    expect(fillOuterRadius(mapR)).toBeCloseTo(mapR * Z.fillOuterFactor, 9);
  });

  it('clears the farthest screen CORNER in the worst case (no open-void arc)', () => {
    // The disc is centered on the LIVE RING, so the bound is
    //   |ring center| + |camera center| + half the visible diagonal.
    // Worst case: a maximally offset ring, a hull at the far map edge, an
    // ultrawide viewport at the widest user zoom, with an upgraded radar range
    // (the camera fits 2x radar on the SHORT axis, so a bigger radar = a wider
    // view). If this ever fails, the storm fill ends mid-screen.
    const mapR = CONFIG.map.baseRadius;
    const [vw, vh] = [3840, 1080]; // 32:9
    const radar = CONFIG.vision.radar * 2; // a heavily stacked radarRange build
    const zoom = (Math.min(vw, vh) / (2 * radar)) * CLIENT_CONFIG.zoom.min;
    const halfDiag = Math.hypot(vw / 2, vh / 2) / zoom;
    const worstCase = 2 * mapR + CLIENT_CONFIG.camera.leadMax + halfDiag;
    expect(fillOuterRadius(mapR)).toBeGreaterThan(worstCase);
  });

  it('stays finite and positive for a degenerate map radius', () => {
    expect(fillOuterRadius(0)).toBeGreaterThan(0);
    expect(Number.isFinite(fillOuterRadius(0))).toBe(true);
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

  it('pre-reveal (clear/supply, next=null): plane only, no telegraph anywhere', () => {
    expect(planeVisibility('clear', RING(2400), null)).toEqual({ plane: true, telegraph: false });
    expect(planeVisibility('supply', RING(2400), null)).toEqual({ plane: true, telegraph: false });
  });

  it('reveal + closing: plane AND telegraph', () => {
    expect(planeVisibility('reveal', RING(2400), next)).toEqual({ plane: true, telegraph: true });
    expect(planeVisibility('closing', RING(2000), next)).toEqual({ plane: true, telegraph: true });
  });

  it('closed: terminal ring holds, no telegraph', () => {
    expect(planeVisibility('closed', RING(660, 300, 120), null)).toEqual({
      plane: true,
      telegraph: false,
    });
  });

  it('idle draws nothing at all', () => {
    expect(planeVisibility('idle', RING(2400), next)).toEqual({ plane: false, telegraph: false });
  });

  it('a degenerate r=0 sentinel draws nothing (never a hole-less world-wide fill)', () => {
    expect(planeVisibility('closing', RING(0), next)).toEqual({ plane: false, telegraph: false });
    expect(planeVisibility('reveal', RING(2400), RING(0, 10, 10))).toEqual({
      plane: true,
      telegraph: false,
    });
  });
});

describe('needsRedraw — the throttle keyed on radius AND zoom', () => {
  it('always draws the first frame (never-drawn sentinel)', () => {
    expect(needsRedraw(-1, -1, 2400, 1)).toBe(true);
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

  it('halves the flash at motion=reduced (amplitude is the motion channel)', () => {
    const os = new RevealOneShot();
    expect(os.update(RING1, 0, AMP * 0.5)).toBeCloseTo(AMP / 2, 9);
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

  it('final closure with a stale pair holds the terminal ring (closed branch)', () => {
    const terminal = { cx: 300, cy: 120, r: 660 };
    const lastClose: ZonePlane = {
      ...staleSchema,
      zoneCurCx: RING1.cx, zoneCurCy: RING1.cy, zoneCurR: RING1.r,
      zoneNextCx: terminal.cx, zoneNextCy: terminal.cy, zoneNextR: terminal.r,
    };
    const now = START + 3 * GROUP_MS + 10; // past full closure, patch not landed
    const zv = zoneViewFrom(lastClose, 2400, now);
    expect(zv.state).toBe('closed');
    expect(zv.cur).toEqual(terminal);
    expect(zv.next).toBeNull();
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
