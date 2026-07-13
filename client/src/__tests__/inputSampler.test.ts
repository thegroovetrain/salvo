import { describe, it, expect } from 'vitest';
import { MSG, type InputMsg } from '@salvo/shared';
import { InputSampler, buildInput, type Aiming } from '../sim/inputSampler.js';

const AIM: Aiming = { aim: 0.5, fire: true, weapon: 0 };

describe('buildInput', () => {
  it('carries aim/fire/weapon from the mouse sample', () => {
    const msg = buildInput(3, { throttle: 1, rudder: -1 }, AIM);
    expect(msg).toEqual({ seq: 3, throttle: 1, rudder: -1, aim: 0.5, fire: true, weapon: 0 });
  });

  it('clamps axes to [-1, 1]', () => {
    const msg = buildInput(1, { throttle: 5, rudder: -7 }, { aim: 0, fire: false, weapon: 0 });
    expect(msg.throttle).toBe(1);
    expect(msg.rudder).toBe(-1);
  });
});

describe('InputSampler', () => {
  it('sends exactly one strictly-monotonic-seq input per sample', () => {
    const sent: { type: string; msg: InputMsg }[] = [];
    const sampler = new InputSampler((type, msg) => sent.push({ type, msg }));
    expect(sampler.lastSeq).toBe(0);
    for (let i = 0; i < 20; i++) sampler.sample({ throttle: 0.5, rudder: 0 }, AIM);
    expect(sent).toHaveLength(20);
    expect(sent.every((s) => s.type === MSG.input)).toBe(true);
    for (let i = 0; i < sent.length; i++) {
      expect(sent[i].msg.seq).toBe(i + 1);
    }
    expect(sampler.lastSeq).toBe(20);
  });

  it('returns the sent message for local prediction', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sample({ throttle: -0.25, rudder: 1 }, AIM);
    expect(msg.seq).toBe(1);
    expect(msg.throttle).toBe(-0.25);
    expect(msg.rudder).toBe(1);
    expect(msg.fire).toBe(true);
  });
});

describe('InputSampler.sendNeutralNow', () => {
  it('sends an all-stop, no-fire input with a monotonic seq', () => {
    const sent: { type: string; msg: InputMsg }[] = [];
    const sampler = new InputSampler((type, msg) => sent.push({ type, msg }));
    sampler.sample({ throttle: 1, rudder: -1 }, AIM);
    const msg = sampler.sendNeutralNow();
    expect(msg).toEqual({ seq: 2, throttle: 0, rudder: 0, aim: AIM.aim, fire: false, weapon: AIM.weapon });
    expect(sent).toHaveLength(2);
    expect(sent[1].type).toBe(MSG.input);
    expect(sampler.lastSeq).toBe(2);
  });

  it('carries the last sampled aim + weapon even though fire is forced off', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0.5, rudder: 0 }, { aim: 1.75, fire: true, weapon: 2 });
    const msg = sampler.sendNeutralNow();
    expect(msg.aim).toBe(1.75);
    expect(msg.weapon).toBe(2);
    expect(msg.fire).toBe(false);
  });

  it('keeps seq strictly increasing across interleaved sample() and sendNeutralNow() calls', () => {
    const sampler = new InputSampler(() => undefined);
    const seqs = [
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).seq,
      sampler.sendNeutralNow().seq,
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).seq,
    ];
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('works before any sample() call, defaulting aim/weapon to zero', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sendNeutralNow();
    expect(msg).toEqual({ seq: 1, throttle: 0, rudder: 0, aim: 0, fire: false, weapon: 0 });
  });
});
