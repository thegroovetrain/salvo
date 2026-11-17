// The scrape host (audio/grindCue.ts): one shot per period while asked, every
// live shot stopped when the scrape ends, and the next scrape starts at once.

import { describe, it, expect, vi } from 'vitest';
import { GrindCue } from '../grindCue.js';

function rig(period = 1000) {
  let t = 0;
  const shots: Array<{ stop: ReturnType<typeof vi.fn>; ended: boolean }> = [];
  const play = vi.fn((_gain: number) => {
    const s = { stop: vi.fn(), ended: false };
    shots.push(s);
    return s;
  });
  const cue = new GrindCue(play, period, () => t);
  return { cue, play, shots, at: (ms: number) => (t = ms) };
}

describe('GrindCue', () => {
  it('starts one shot per period while the scrape is asked for, at the asked level', () => {
    const r = rig();
    r.cue.play(0.4);
    r.at(500);
    r.cue.play(0.5);
    r.at(1000);
    r.cue.play(0.6);
    expect(r.play.mock.calls.map(([g]) => g)).toEqual([0.4, 0.6]);
  });

  it('the end stops every live shot (not ones already ended) and re-arms at once', () => {
    const r = rig();
    r.cue.play(1);
    r.at(1000);
    r.cue.play(1);
    r.shots[0].ended = true;
    r.at(1100);
    r.cue.end();
    expect(r.shots[1].stop).toHaveBeenCalledTimes(1);
    r.cue.play(1); // a new scrape right away, inside the old period
    expect(r.play).toHaveBeenCalledTimes(3);
    r.cue.end();
    r.cue.end();
    expect(r.shots[2].stop).toHaveBeenCalledTimes(1);
  });

  it('a dropped shot (null) is simply not tracked', () => {
    const cue = new GrindCue(() => null, 1000, () => 0);
    expect(() => {
      cue.play(1);
      cue.end();
    }).not.toThrow();
  });
});
