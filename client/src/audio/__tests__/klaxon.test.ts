// The klaxon (audio/klaxon.ts): blast counts per band edge, the audition's
// spacing, the sinking repeat, and the host's stop-everything gate. Counts and
// times only — never a sound.

import { describe, it, expect, vi } from 'vitest';
import { KLAXON_BLASTS, Klaxon, klaxonBlasts, klaxonStepS, sinkingBlastDue, type KlaxonBlast } from '../klaxon.js';
import { klaxonStepS as candidateStepS } from '../synth/candidates/round3.js';
import { CUES } from '../synth/cues.js';

const recipe = CUES.klaxon;

describe('klaxonBlasts', () => {
  it('one blast for the half-hull edge, three for the quarter, none without an edge', () => {
    expect(klaxonBlasts(recipe, 'hurt')).toHaveLength(KLAXON_BLASTS.hurt);
    expect(klaxonBlasts(recipe, 'critical')).toHaveLength(KLAXON_BLASTS.critical);
    expect(KLAXON_BLASTS.critical).toBeGreaterThan(KLAXON_BLASTS.hurt);
    expect(klaxonBlasts(recipe, null)).toEqual([]);
  });

  it('the first blast is now and the rest are spaced by the audition’s own step', () => {
    expect(klaxonStepS(recipe)).toBe(candidateStepS(recipe));
    const at = klaxonBlasts(recipe, 'critical');
    expect(at[0]).toBe(0);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeCloseTo(klaxonStepS(recipe), 12);
  });
});

describe('sinkingBlastDue', () => {
  it('due at once in a fresh window, then once per step while sinking', () => {
    const step = klaxonStepS(recipe);
    expect(sinkingBlastDue(recipe, true, null, 10)).toBe(true);
    expect(sinkingBlastDue(recipe, true, 10, 10 + step / 2)).toBe(false);
    expect(sinkingBlastDue(recipe, true, 10, 10 + step)).toBe(true);
  });

  it('never due outside the sinking window or on a junk clock', () => {
    expect(sinkingBlastDue(recipe, false, null, 10)).toBe(false);
    expect(sinkingBlastDue(recipe, true, null, NaN)).toBe(false);
  });
});

describe('Klaxon — the host', () => {
  function rig() {
    let t = 0;
    const shots: Array<{ blast: KlaxonBlast; stop: ReturnType<typeof vi.fn>; ended: boolean }> = [];
    const k = new Klaxon(
      recipe,
      (blast) => {
        const s = { blast, stop: vi.fn(), ended: false };
        shots.push(s);
        return s;
      },
      () => t,
    );
    return { k, shots, at: (s: number) => (t = s) };
  }

  it('a quarter edge schedules three blasts, only the first carrying the legacy fallback', () => {
    const r = rig();
    r.k.band('critical');
    expect(r.shots.map((s) => s.blast.delayS)).toEqual(klaxonBlasts(recipe, 'critical'));
    expect(r.shots.map((s) => s.blast.fallback)).toEqual(['hpCritical', null, null]);
    r.k.band('hurt');
    expect(r.shots.at(-1)?.blast.fallback).toBe('hpHurt');
  });

  it('repeats through the sinking window, each blast capped to the time left; re-arms outside it', () => {
    const r = rig();
    const step = klaxonStepS(recipe);
    r.k.frame(true, 5);
    r.at(step / 2);
    r.k.frame(true, 5 - step / 2);
    r.at(step);
    r.k.frame(true, 5 - step);
    expect(r.shots.map((s) => s.blast.maxS)).toEqual([5, 5 - step]);
    expect(r.shots.map((s) => s.blast.fallback)).toEqual(['sink', null]);
    r.k.frame(true, null); // not sinking (respawned alive)
    r.at(step * 1.1);
    r.k.frame(true, 4);
    expect(r.shots.at(-1)?.blast.fallback).toBe('sink'); // a fresh window
  });

  it('P13a: a sinking blast that did not sound (dropped) does not advance the repeat — it is tried again', () => {
    let t = 0;
    const play = vi.fn((_b: KlaxonBlast): { stop: () => void; ended: boolean } | null => null);
    const k = new Klaxon(recipe, play, () => t);
    k.frame(true, 4);
    t = 0.01;
    k.frame(true, 4);
    expect(play).toHaveBeenCalledTimes(2);
    // ...and the first blast that DID sound still carries the fallback
    expect(play.mock.calls.map(([b]) => (b as KlaxonBlast).fallback)).toEqual(['sink', 'sink']);
  });

  it('P13b: the sinking window starting stops the hull-alarm blasts still pending, so the alarm has its seats', () => {
    const r = rig();
    r.k.band('critical');
    r.k.frame(true, 4);
    for (const s of r.shots.slice(0, 3)) expect(s.stop).toHaveBeenCalledTimes(1);
    expect(r.shots[3].stop).not.toHaveBeenCalled();
  });

  it('P10: the event-driven first blast (sinkStart) is not doubled by the per-frame repeat', () => {
    const r = rig();
    r.k.sinkStart();
    r.k.frame(true, 4);
    expect(r.shots).toHaveLength(1);
    expect(r.shots[0].blast.fallback).toBe('sink');
    r.at(klaxonStepS(recipe));
    r.k.frame(true, 3);
    expect(r.shots).toHaveLength(2);
  });

  it('stops every blast still held when the hull is gone — founder, spectate or match over', () => {
    const r = rig();
    r.k.band('critical');
    r.shots[0].ended = true; // the first already rang out
    r.k.frame(true, 3);
    r.k.frame(false, null);
    expect(r.shots[0].stop).not.toHaveBeenCalled();
    for (const s of r.shots.slice(1)) expect(s.stop).toHaveBeenCalledTimes(1);
    r.k.frame(false, null);
    for (const s of r.shots.slice(1)) expect(s.stop).toHaveBeenCalledTimes(1);
  });
});
