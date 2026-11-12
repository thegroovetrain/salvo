// THE SINKING FADE (audio/sinkFade.ts): the pure targets (monotone, silent at
// the end, water swells and dies, junk is "not sinking") and the insert's
// graph against a fake context. Nothing here is about how it sounds.

import { describe, it, expect } from 'vitest';
import { SILENCE, SinkFade, sinkFadeTargets } from '../sinkFade.js';
import { FakeAudioContext, downstream, type FakeNode, type FakeParam } from '../synth/__tests__/fakeAudio.js';

const steps = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => i / n);

describe('sinkFadeTargets', () => {
  it('lowpass and gain only fall as progress rises', () => {
    const ps = steps(40);
    for (let i = 1; i < ps.length; i++) {
      const a = sinkFadeTargets(ps[i - 1]);
      const b = sinkFadeTargets(ps[i]);
      expect(b.lowpassHz).toBeLessThanOrEqual(a.lowpassHz);
      expect(b.gain).toBeLessThanOrEqual(a.gain);
    }
  });

  it('starts open and at full level, ends at the silence floor', () => {
    expect(sinkFadeTargets(0).gain).toBe(1);
    expect(sinkFadeTargets(1).gain).toBe(SILENCE);
    expect(sinkFadeTargets(1).waterGain).toBe(SILENCE);
    expect(sinkFadeTargets(1).lowpassHz).toBeLessThan(sinkFadeTargets(0).lowpassHz);
  });

  it('the water rises and then falls back', () => {
    const w = steps(20).map((p) => sinkFadeTargets(p).waterGain);
    const top = w.indexOf(Math.max(...w));
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(w.length - 1);
    for (let i = 1; i <= top; i++) expect(w[i]).toBeGreaterThanOrEqual(w[i - 1]);
    for (let i = top + 1; i < w.length; i++) expect(w[i]).toBeLessThanOrEqual(w[i - 1]);
  });

  it('junk progress reads as 0; out-of-range is clamped', () => {
    for (const junk of [NaN, Infinity, -Infinity]) expect(sinkFadeTargets(junk)).toEqual(sinkFadeTargets(0));
    expect(sinkFadeTargets(-3)).toEqual(sinkFadeTargets(0));
    expect(sinkFadeTargets(9)).toEqual(sinkFadeTargets(1));
  });
});

describe('SinkFade', () => {
  it('is an insert: input reaches output through the lowpass, and the water joins before the lowpass', () => {
    const ctx = new FakeAudioContext();
    const fade = new SinkFade(ctx.asContext);
    const input = fade.input as unknown as FakeNode;
    const output = fade.output as unknown as FakeNode;
    expect(downstream(input).has(output)).toBe(true);
    const water = ctx.nodesOf('bufferSource')[0];
    expect(water.started?.length).toBe(1);
    const lowpass = ctx.nodesOf('biquad').find((b) => b.type === 'lowpass') as FakeNode;
    expect(downstream(water).has(lowpass)).toBe(true);
    expect(downstream(input).has(lowpass)).toBe(true);
    expect(output.outputs).toEqual([]);
  });

  it('update glides every param toward its target at the given time', () => {
    const ctx = new FakeAudioContext();
    const fade = new SinkFade(ctx.asContext);
    fade.update(0.5, 12);
    const want = sinkFadeTargets(0.5);
    const last = (p: unknown) => (p as FakeParam).writes.at(-1)!;
    expect(last((fade.input as unknown as FakeNode).gain)).toMatchObject({ method: 'target', value: want.gain, time: 12 });
    const lowpass = ctx.nodesOf('biquad').find((b) => b.type === 'lowpass') as FakeNode;
    expect(last(lowpass.frequency)).toMatchObject({ method: 'target', value: want.lowpassHz, time: 12 });
  });

  it('release stops the water and disconnects every node; later updates are ignored', () => {
    const ctx = new FakeAudioContext();
    const fade = new SinkFade(ctx.asContext);
    fade.release();
    expect(ctx.nodesOf('bufferSource')[0].stopped?.length).toBe(1);
    for (const n of ctx.built) expect(n.disconnected, n.kind).toBe(true);
    const writes = ((fade.input as unknown as FakeNode).gain as FakeParam).writes.length;
    fade.update(0.9);
    expect(((fade.input as unknown as FakeNode).gain as FakeParam).writes.length).toBe(writes);
  });
});
