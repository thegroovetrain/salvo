// THE STORM BED (audio/stormBed.ts): the pure targets (monotone in intensity,
// silent outside the storm, junk reads as outside) and the voice's graph
// against a fake context (built once, reaches the sink, glides with the slow
// fade, thunder only inside the storm, releases cleanly). Never timbre.

import { describe, it, expect } from 'vitest';
import { SILENCE, STORM_FADE_TAU_S, StormBedVoice, stormBedTargets, type StormBedProfile } from '../stormBed.js';
import { FakeAudioContext, downstream, seeded, type FakeNode, type FakeParam } from '../synth/__tests__/fakeAudio.js';

const PROFILE: StormBedProfile = {
  windHz: [300, 700],
  windGain: [0.2, 1],
  windQ: 1,
  wanderHz: 0.08,
  wanderDepth: 0.3,
  rainBand: [2500, 9000],
  rainGain: [0.1, 0.6],
  thunderGain: 0.8,
  thunderEveryS: [8, 20],
  level: 0.3,
};

const steps = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => i / n);

describe('stormBedTargets', () => {
  it('every target is monotone non-decreasing in intensity', () => {
    const xs = steps(20);
    for (let i = 1; i < xs.length; i++) {
      const a = stormBedTargets(PROFILE, xs[i - 1]);
      const b = stormBedTargets(PROFILE, xs[i]);
      for (const k of Object.keys(a) as Array<keyof typeof a>) expect(b[k], k).toBeGreaterThanOrEqual(a[k]);
    }
  });

  it('outside the storm the level is the silence floor; inside it is not', () => {
    expect(stormBedTargets(PROFILE, 0).level).toBe(SILENCE);
    expect(stormBedTargets(PROFILE, 1).level).toBeGreaterThan(SILENCE);
  });

  it('junk intensity reads as outside the storm; out of range is clamped', () => {
    for (const junk of [NaN, Infinity, -Infinity]) expect(stormBedTargets(PROFILE, junk)).toEqual(stormBedTargets(PROFILE, 0));
    expect(stormBedTargets(PROFILE, 5)).toEqual(stormBedTargets(PROFILE, 1));
  });
});

function voice(ctx = new FakeAudioContext()) {
  const sink = ctx.node('sink');
  const v = new StormBedVoice(ctx.asContext, sink as unknown as AudioNode, PROFILE, { rand: seeded(3) });
  return { ctx, sink, v };
}

const outGain = (ctx: FakeAudioContext, sink: FakeNode): FakeParam =>
  (ctx.built.find((n) => n.outputs.includes(sink)) as FakeNode).gain as FakeParam;

describe('StormBedVoice', () => {
  it('builds once, starts every source, and every noise path reaches the sink', () => {
    const { ctx, sink, v } = voice();
    expect(v.released).toBe(false);
    const sources = ctx.built.filter((n) => n.started);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(s.started?.length).toBe(1);
    for (const n of ctx.nodesOf('bufferSource')) expect(downstream(n).has(sink)).toBe(true);
    const count = ctx.built.length;
    v.update(1, 11);
    v.update(0.5, 12);
    expect(ctx.built.length).toBe(count);
  });

  it('update glides the level with the slow storm fade', () => {
    const { ctx, sink, v } = voice();
    v.update(1, 11);
    const last = outGain(ctx, sink).writes.at(-1)!;
    expect(last.method).toBe('target');
    expect(last.value).toBe(stormBedTargets(PROFILE, 1).level);
    expect(last.time).toBe(11);
    // The fake records the tau only through the method; the constant is the contract.
    expect(STORM_FADE_TAU_S).toBeGreaterThan(1);
  });

  it('thunder is scheduled only inside the storm', () => {
    const quiet = voice();
    quiet.v.update(0, 1000);
    const inside = voice();
    inside.v.update(1, 1000);
    const thunderWrites = (c: FakeAudioContext) =>
      c.nodesOf('gain').some((g) => (g.gain as FakeParam).writes.some((w) => w.method === 'target' && w.value === stormBedTargets(PROFILE, 1).thunderGain));
    expect(thunderWrites(quiet.ctx)).toBe(false);
    expect(thunderWrites(inside.ctx)).toBe(true);
  });

  it('P6: the release fade anchors from the level last WRITTEN, never a mid-automation .value', () => {
    const { ctx, sink, v } = voice();
    v.update(1, 11);
    const p = outGain(ctx, sink);
    p.value = 0.777;
    v.release(2);
    expect(p.writes.filter((w) => w.method === 'set').at(-1)?.value).toBe(stormBedTargets(PROFILE, 1).level);
  });

  it('release fades the output to silence, stops every source, disconnects on end, ignores later updates', () => {
    const { ctx, sink, v } = voice();
    v.update(1, 11);
    // The shared synth fake predates cancelScheduledValues; a no-op is enough here.
    Object.assign(outGain(ctx, sink), { cancelScheduledValues: () => undefined });
    v.release(2);
    expect(outGain(ctx, sink).writes.at(-1)).toMatchObject({ method: 'exp', value: SILENCE });
    for (const s of ctx.built.filter((n) => n.started)) expect(s.stopped?.length).toBe(1);
    const writes = outGain(ctx, sink).writes.length;
    v.update(1, 20);
    expect(outGain(ctx, sink).writes.length).toBe(writes);
    ctx.endAll();
    for (const n of ctx.built) expect(n.disconnected, n.kind).toBe(true);
  });
});
