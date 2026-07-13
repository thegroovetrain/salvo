import { describe, it, expect } from 'vitest';
import { MSG, type InputMsg } from '@salvo/shared';
import { InputSampler, buildInput } from '../sim/inputSampler.js';

describe('buildInput', () => {
  it('stubs aim/fire/weapon for the pre-combat steps', () => {
    const msg = buildInput(3, { throttle: 1, rudder: -1 });
    expect(msg).toEqual({ seq: 3, throttle: 1, rudder: -1, aim: 0, fire: false, weapon: 0 });
  });

  it('clamps axes to [-1, 1]', () => {
    const msg = buildInput(1, { throttle: 5, rudder: -7 });
    expect(msg.throttle).toBe(1);
    expect(msg.rudder).toBe(-1);
  });
});

describe('InputSampler', () => {
  it('sends exactly one strictly-monotonic-seq input per sample', () => {
    const sent: { type: string; msg: InputMsg }[] = [];
    const sampler = new InputSampler((type, msg) => sent.push({ type, msg }));
    expect(sampler.lastSeq).toBe(0);
    for (let i = 0; i < 20; i++) sampler.sample({ throttle: 0.5, rudder: 0 });
    expect(sent).toHaveLength(20);
    expect(sent.every((s) => s.type === MSG.input)).toBe(true);
    for (let i = 0; i < sent.length; i++) {
      expect(sent[i].msg.seq).toBe(i + 1);
    }
    expect(sampler.lastSeq).toBe(20);
  });

  it('returns the sent message for local prediction', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sample({ throttle: -0.25, rudder: 1 });
    expect(msg.seq).toBe(1);
    expect(msg.throttle).toBe(-0.25);
    expect(msg.rudder).toBe(1);
  });
});
