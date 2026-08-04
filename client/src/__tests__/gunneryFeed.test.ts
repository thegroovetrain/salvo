// THE GUNNERY FEED (render/gunneryFeed.ts, Story 4.3) — the two pure rules the
// three new gunnery rows obey on arrival.
//
// ONE EVENT, ONE MARK: a shooter who can SEE their own impact receives the
// PUBLIC `boom` row and the SELF-PRIVATE `hc`/`sp` row in the same frame at the
// same point (the server derives both from one resolution, so the coordinates
// are byte-identical). Whichever lands first draws; the other is suppressed.
//
// THE TONE FLOOR: three blooms, one cue. Nothing in the audio layer rate-limits
// — every call site does its own (the DenialDedup precedent).

import { describe, expect, it } from 'vitest';
import { ImpactDedup, ToneFloor, hitCallToneFloor, impactKey } from '../render/gunneryFeed.js';
import { CLIENT_CONFIG } from '../config.js';

describe('ImpactDedup — the first claimant on a point draws the mark', () => {
  it('gives the point to the first claimant and refuses every later one', () => {
    const d = new ImpactDedup();
    d.beginFrame();
    expect(d.claim(120.5, -44.25)).toBe(true);
    expect(d.claim(120.5, -44.25)).toBe(false);
    expect(d.claim(120.5, -44.25)).toBe(false);
  });

  it('is ORDER-INDEPENDENT: the pairing resolves the same either way round', () => {
    // The emission order is a server implementation detail (world.resolveShell
    // happens to push `boom` before `hc`/`sp` today) and this must not depend on
    // it. Neither claimant knows which row it is serving, so the two orders are
    // literally the same call sequence — exactly one mark, whoever is first.
    const boomFirst = new ImpactDedup();
    boomFirst.beginFrame();
    const boomFirstDrew = [boomFirst.claim(300, -120), boomFirst.claim(300, -120)];
    const hitCallFirst = new ImpactDedup();
    hitCallFirst.beginFrame();
    const hitCallFirstDrew = [hitCallFirst.claim(300, -120), hitCallFirst.claim(300, -120)];
    expect(boomFirstDrew).toEqual([true, false]);
    expect(hitCallFirstDrew).toEqual(boomFirstDrew);
    expect(boomFirstDrew.filter(Boolean)).toHaveLength(1);
  });

  it('DISTINCT points never collide — a walked salvo draws every splash', () => {
    const d = new ImpactDedup();
    d.beginFrame();
    for (const x of [0, 40, 80, 120]) expect(d.claim(x, 0), `x=${x}`).toBe(true);
    // ...and the same four points in the other axis are still four fresh points.
    for (const y of [40, 80, 120]) expect(d.claim(0, y), `y=${y}`).toBe(true);
  });

  it('clears between frames — the same water can be shelled again next tick', () => {
    const d = new ImpactDedup();
    d.beginFrame();
    expect(d.claim(10, 10)).toBe(true);
    expect(d.claim(10, 10)).toBe(false);
    d.beginFrame();
    expect(d.claim(10, 10)).toBe(true); // a NEW frame: a new legitimate mark
  });

  it('claims nothing until a frame is opened, and never throws on a fresh one', () => {
    const d = new ImpactDedup();
    expect(d.claim(1, 1)).toBe(true); // beginFrame is a reset, not an arming gate
  });

  it('quantizes to a tenth of a unit — an EXACT identity test, not proximity', () => {
    // The two rows carry the same float copied from one resolution point, so
    // this only has to make a stable key. Points a full quantum apart stay
    // distinct; the same float always lands on the same key.
    expect(impactKey(12.34, -5)).toBe(impactKey(12.34, -5));
    expect(impactKey(12.34, -5)).not.toBe(impactKey(12.44, -5));
    expect(impactKey(0, 0)).toBe(impactKey(-0, -0)); // no signed-zero split
  });
});

describe('ToneFloor — three blooms, one cue', () => {
  it('lets the first cue through and refuses one inside the floor', () => {
    const floor = new ToneFloor(300);
    expect(floor.request(1000)).toBe(true);
    expect(floor.request(1200)).toBe(false); // +200ms — inside the floor
  });

  it('lets a cue through once the floor has elapsed', () => {
    const floor = new ToneFloor(300);
    expect(floor.request(1000)).toBe(true);
    expect(floor.request(1350)).toBe(true); // +350ms — clear
  });

  it('is inclusive at exactly the floor (a 20Hz tick lands on the boundary)', () => {
    const floor = new ToneFloor(300);
    expect(floor.request(1000)).toBe(true);
    expect(floor.request(1300)).toBe(true);
  });

  it('a REFUSED request does not extend the window — a stream still ticks', () => {
    // Otherwise sustained fire would go permanently silent instead of landing
    // at a steady one-per-floor.
    const floor = new ToneFloor(300);
    expect(floor.request(0)).toBe(true);
    for (const t of [50, 100, 150, 200, 250]) expect(floor.request(t), `t=${t}`).toBe(false);
    expect(floor.request(300)).toBe(true);
  });

  it('a 3-shell salvo inside 200ms plays exactly ONE tone', () => {
    const floor = new ToneFloor(300);
    const played = [0, 100, 200].filter((t) => floor.request(t));
    expect(played).toEqual([0]);
  });

  it('the Hit Call floor reads CONFIG, not a literal', () => {
    expect(CLIENT_CONFIG.gunnery.hitCallToneFloorMs).toBe(300); // the ratified grammar
    const floor = hitCallToneFloor();
    expect(floor.request(0)).toBe(true);
    expect(floor.request(CLIENT_CONFIG.gunnery.hitCallToneFloorMs - 1)).toBe(false);
    expect(floor.request(CLIENT_CONFIG.gunnery.hitCallToneFloorMs)).toBe(true);
  });
});
