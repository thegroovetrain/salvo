// THE SOUND PASS'S EDGE DETECTORS (audio/cueEdges.ts): each fires once per
// new thing, never on the first observation of something already there (the
// reconnect rule), and the own-hit level map is monotone and clamped.

import { describe, it, expect } from 'vitest';
import {
  beaconSurfaced,
  boostRose,
  freshBeaconCueState,
  freshCloudCueState,
  freshTorpedoHumState,
  newClouds,
  ownHitGain,
  torpedoHumCandidates,
  markHumHeard,
  unseedTorpedoHum,
} from '../cueEdges.js';

const cloud = (id: string, t0: number) => ({ id, x: 1, y: 2, t0 });

describe('newClouds (smoke deployed)', () => {
  const FRESH = 1000;

  it('the first observation only seeds — clouds already on the water are silent', () => {
    const s = freshCloudCueState();
    expect(newClouds(s, [cloud('a', 990)], 1000, FRESH)).toEqual([]);
  });

  it('fires once per new fresh id; a re-delivery is silent', () => {
    const s = freshCloudCueState();
    newClouds(s, [], 0, FRESH);
    expect(newClouds(s, [cloud('a', 100)], 100, FRESH).map((c) => c.id)).toEqual(['a']);
    expect(newClouds(s, [cloud('a', 100)], 150, FRESH)).toEqual([]);
    expect(newClouds(s, [cloud('a', 100), cloud('b', 200)], 200, FRESH).map((c) => c.id)).toEqual(['b']);
  });

  it('a cloud first seen long after its birth is old news; a junk birth never fires', () => {
    const s = freshCloudCueState();
    newClouds(s, [], 0, FRESH);
    expect(newClouds(s, [cloud('old', 0)], FRESH + 1, FRESH)).toEqual([]);
    expect(newClouds(s, [cloud('nan', NaN)], 10, FRESH)).toEqual([]);
  });
});

describe('beaconSurfaced', () => {
  it('fires once when a watched set surfaces, never again for that set', () => {
    const s = freshBeaconCueState();
    expect(beaconSurfaced(s, 1, false)).toBe(false); // charted: armed
    expect(beaconSurfaced(s, 1, true)).toBe(true); // surfaced
    expect(beaconSurfaced(s, 1, true)).toBe(false);
    expect(beaconSurfaced(s, 1, false)).toBe(false); // sinking / gone
    expect(beaconSurfaced(s, 1, true)).toBe(false);
  });

  it('a set first seen already afloat (a resume mid-set) is silent; the next set still sounds', () => {
    const s = freshBeaconCueState();
    expect(beaconSurfaced(s, 4, true)).toBe(false);
    expect(beaconSurfaced(s, 5, false)).toBe(false);
    expect(beaconSurfaced(s, 5, true)).toBe(true);
  });

  it('no set (missing / negative / junk cycle) never fires', () => {
    const s = freshBeaconCueState();
    for (const c of [undefined, -1, NaN]) expect(beaconSurfaced(s, c, true)).toBe(false);
  });
});

describe('boostRose', () => {
  it('fires only on a watched false → true edge', () => {
    expect(boostRose(false, true)).toBe(true);
    expect(boostRose(true, true)).toBe(false);
    expect(boostRose(null, true)).toBe(false); // first observation: already boosting
    expect(boostRose(false, false)).toBe(false);
  });
});

describe('torpedoHumCandidates (the torpedo hum)', () => {
  const ear = { x: 0, y: 0 };
  const R = 100;
  const seeded = () => {
    const s = freshTorpedoHumState();
    torpedoHumCandidates(s, [], ear, R, 'own'); // the first frame only seeds
    return s;
  };

  it('a torpedo inside is a candidate until its hum is marked heard; never re-armed after that', () => {
    const s = seeded();
    const far = { id: 't1', kind: 'torp', x: 500, y: 0 };
    const close = { id: 't1', kind: 'torp', x: 50, y: 0 };
    expect(torpedoHumCandidates(s, [far], ear, R, 'own')).toEqual([]);
    expect(torpedoHumCandidates(s, [close], ear, R, 'own').map((t) => t.id)).toEqual(['t1']);
    expect(torpedoHumCandidates(s, [close], ear, R, 'own').map((t) => t.id)).toEqual(['t1']); // not played yet: retried
    markHumHeard(s, 't1');
    expect(torpedoHumCandidates(s, [close], ear, R, 'own')).toEqual([]);
    expect(torpedoHumCandidates(s, [far], ear, R, 'own')).toEqual([]);
    expect(torpedoHumCandidates(s, [close], ear, R, 'own')).toEqual([]); // back again: heard once
  });

  it('the first frame, a listener-kind change and an unseed only SEED: torpedoes already inside never hum', () => {
    const s = freshTorpedoHumState();
    const inside = { id: 'a', kind: 'torp', x: 10, y: 0 };
    expect(torpedoHumCandidates(s, [inside], ear, R, 'own')).toEqual([]);
    const b = { id: 'b', kind: 'torp', x: 20, y: 0 };
    expect(torpedoHumCandidates(s, [inside, b], ear, R, 'camera')).toEqual([]);
    unseedTorpedoHum(s);
    const c = { id: 'c', kind: 'torp', x: 30, y: 0 };
    expect(torpedoHumCandidates(s, [c], ear, R, 'camera')).toEqual([]);
    const d = { id: 'd', kind: 'torp', x: 40, y: 0 };
    expect(torpedoHumCandidates(s, [c, d], ear, R, 'camera').map((t) => t.id)).toEqual(['d']);
  });

  it('ignores every other kind and any junk position', () => {
    const s = seeded();
    const drawn = [
      { id: 's1', kind: 'shell', x: 1, y: 1 },
      { id: 't2', kind: 'torp', x: NaN, y: 0 },
    ];
    expect(torpedoHumCandidates(s, drawn, ear, R, 'own')).toEqual([]);
    expect(torpedoHumCandidates(s, [{ id: 't3', kind: 'torp', x: 1, y: 1 }], { x: NaN, y: 0 }, R, 'own')).toEqual([]);
  });
});

describe('ownHitGain', () => {
  const FULL = 60;
  const MIN = 0.35;

  it('is monotone in the blow, from the floor to 1 at the full blow, and clamped above', () => {
    const levels = [1, 3, 10, 30, 59, 60, 200].map((hp) => ownHitGain(hp, FULL, MIN));
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(levels[0]).toBeGreaterThanOrEqual(MIN);
    expect(ownHitGain(FULL, FULL, MIN)).toBe(1);
    expect(ownHitGain(FULL * 5, FULL, MIN)).toBe(1);
  });

  it('a junk or zero blow plays at the floor (a hit happened)', () => {
    for (const hp of [0, -5, NaN]) expect(ownHitGain(hp, FULL, MIN)).toBe(MIN);
  });
});
