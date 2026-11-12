// Graph contract of the master chain (audio/synth/master.ts): input → bus
// compressor → limiter → output, settings written as declared, and a plain
// pass-through gain where the browser has no DynamicsCompressor. Nothing here
// is about how the chain sounds.

import { describe, it, expect } from 'vitest';
import { BUS_COMPRESSOR, LIMITER, createMasterChain, type CompressorSettings } from '../master.js';
import { FakeAudioContext, downstream, fakeParam, type FakeNode } from './fakeAudio.js';

/** The fake context plus the one factory it lacks. */
class CompressingContext extends FakeAudioContext {
  createDynamicsCompressor(): FakeNode {
    const n = this.node('compressor', {
      threshold: fakeParam(-24),
      knee: fakeParam(30),
      ratio: fakeParam(12),
      attack: fakeParam(0.003),
      release: fakeParam(0.25),
    });
    this.built.push(n);
    return n;
  }
}

const settingsOf = (n: FakeNode): CompressorSettings => {
  const v = (k: string): number => (n[k] as { value: number }).value;
  return { threshold: v('threshold'), knee: v('knee'), ratio: v('ratio'), attack: v('attack'), release: v('release') };
};

describe('createMasterChain', () => {
  it('chains bus compressor → limiter → output, each with its declared settings', () => {
    const ctx = new CompressingContext();
    const chain = createMasterChain(ctx.asContext);
    const input = chain.input as unknown as FakeNode;
    const output = chain.output as unknown as FakeNode;
    const comps = ctx.nodesOf('compressor');
    expect(comps).toHaveLength(2);
    expect(input).toBe(comps[0]);
    expect(input.outputs).toEqual([comps[1]]);
    expect(comps[1].outputs).toEqual([output]);
    expect(settingsOf(comps[0])).toEqual(BUS_COMPRESSOR);
    expect(settingsOf(comps[1])).toEqual(LIMITER);
    expect(output.kind).toBe('gain');
    expect((output.gain as { value: number }).value).toBe(1);
  });

  it('the output is reachable from the input and leads nowhere yet (the caller wires it)', () => {
    const ctx = new CompressingContext();
    const chain = createMasterChain(ctx.asContext);
    expect(downstream(chain.input as unknown as FakeNode).has(chain.output as unknown as FakeNode)).toBe(true);
    expect((chain.output as unknown as FakeNode).outputs).toEqual([]);
  });

  it('degrades to one pass-through gain without DynamicsCompressor', () => {
    const ctx = new FakeAudioContext();
    const chain = createMasterChain(ctx.asContext);
    expect(chain.input).toBe(chain.output);
    expect(ctx.built).toHaveLength(1);
    expect((chain.output as unknown as FakeNode).kind).toBe('gain');
  });

  it('the limiter is the harder of the two stages', () => {
    expect(LIMITER.threshold).toBeGreaterThan(BUS_COMPRESSOR.threshold);
    expect(LIMITER.ratio).toBeGreaterThan(BUS_COMPRESSOR.ratio);
    expect(LIMITER.attack).toBeLessThan(BUS_COMPRESSOR.attack);
  });
});
