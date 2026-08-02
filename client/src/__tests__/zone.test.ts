// Pure vignette state→alpha mapping (render/zone.ts) + the client's zone-view
// derivation (sim/zoneView.ts). The timeline math itself lives in
// shared/src/sim/zone.ts (ONE implementation for both sides — see
// shared/src/__tests__/zone.test.ts); the client-specific part re-tested here
// is the STALE-BOUNDARY GUARD around it.

import { describe, it, expect } from 'vitest';
import { CONFIG, ZONE_BEATS_PER_GROUP } from '@salvo/shared';
import { vignetteAlpha } from '../render/zone.js';
import { zoneViewFrom, type ZonePlane } from '../sim/zoneView.js';

// Must track render/zone.ts's VIGNETTE_BASE/AMP (bumped for the purple storm —
// purple reads calmer than red, so it leans on alpha to keep alarm legibility).
const BASE = 0.27;
const AMP = 0.17;

describe('vignetteAlpha — out-of-zone feedback mapping', () => {
  it('is exactly 0 when not in the storm (any time)', () => {
    expect(vignetteAlpha(false, 0)).toBe(0);
    expect(vignetteAlpha(false, 12.34)).toBe(0);
    expect(vignetteAlpha(false, 999)).toBe(0);
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

  it('reaches its peak a quarter-pulse in and its trough three-quarters in', () => {
    const hz = 1.1;
    const peakT = 0.25 / hz; // sin = +1
    const troughT = 0.75 / hz; // sin = -1
    expect(vignetteAlpha(true, peakT)).toBeCloseTo(BASE + AMP, 6);
    expect(vignetteAlpha(true, troughT)).toBeCloseTo(BASE - AMP, 6);
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
});
