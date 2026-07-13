import { describe, it, expect } from 'vitest';
import { MSG, type InputMsg } from '@salvo/shared';
import { InputSampler, buildInput, type Aiming } from '../sim/inputSampler.js';

const AIM: Aiming = { aim: 0.5, fireSeq: 4, aimDist: 260, weapon: 0 };

describe('buildInput', () => {
  it('carries aim/fireSeq/aimDist/weapon from the mouse sample', () => {
    const msg = buildInput(3, { throttle: 1, rudder: -1 }, AIM);
    expect(msg).toEqual({ seq: 3, throttle: 1, rudder: -1, aim: 0.5, fireSeq: 4, aimDist: 260, weapon: 0 });
  });

  it('clamps axes to [-1, 1]', () => {
    const msg = buildInput(1, { throttle: 5, rudder: -7 }, { aim: 0, fireSeq: 0, aimDist: 0, weapon: 0 });
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
    expect(msg.fireSeq).toBe(AIM.fireSeq);
  });
});

describe('InputSampler.sendNeutralNow — preserves the throttle order', () => {
  it('sends the given throttle with rudder zeroed and a monotonic seq', () => {
    const sent: { type: string; msg: InputMsg }[] = [];
    const sampler = new InputSampler((type, msg) => sent.push({ type, msg }));
    sampler.sample({ throttle: 0.5, rudder: -1 }, AIM);
    const msg = sampler.sendNeutralNow(0.5);
    expect(msg).toEqual({
      seq: 2,
      throttle: 0.5,
      rudder: 0,
      aim: AIM.aim,
      fireSeq: AIM.fireSeq,
      aimDist: AIM.aimDist,
      weapon: AIM.weapon,
    });
    expect(sent).toHaveLength(2);
    expect(sent[1].type).toBe(MSG.input);
    expect(sampler.lastSeq).toBe(2);
  });

  it('zeroes the rudder (the dangerous stale input) but keeps the throttle steaming', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 1, rudder: 1 }, { aim: 1.75, fireSeq: 7, aimDist: 300, weapon: 2 });
    const msg = sampler.sendNeutralNow(1);
    expect(msg.throttle).toBe(1); // deliberate engine order preserved
    expect(msg.rudder).toBe(0);
    expect(msg.aim).toBe(1.75); // last aim + weapon retained
    expect(msg.weapon).toBe(2);
  });

  it('re-sends the LAST fireSeq — never 0 after clicks — as the honest "no new clicks" signal', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { aim: 0, fireSeq: 9, aimDist: 120, weapon: 0 });
    const msg = sampler.sendNeutralNow(0);
    expect(msg.fireSeq).toBe(9); // NOT reset — the counter states "9 clicks so far, none new"
    expect(msg.aimDist).toBe(120); // last aim distance retained too
  });

  it('sends a click landing in the gap since the last sample (live count wins at hide time)', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { aim: 0, fireSeq: 9, aimDist: 120, weapon: 0 });
    // Click #10 lands after the sample but before visibilitychange fires:
    const msg = sampler.sendNeutralNow(0, 10);
    expect(msg.fireSeq).toBe(10); // fires NOW at a ≤1-tick-old aim, not minutes later on refocus
    // And the counter never regresses if the live count is somehow behind:
    expect(sampler.sendNeutralNow(0, 3).fireSeq).toBe(10);
  });

  it('clamps the passed throttle into [-1, 1] like any other input', () => {
    const sampler = new InputSampler(() => undefined);
    expect(sampler.sendNeutralNow(5).throttle).toBe(1);
    expect(sampler.sendNeutralNow(-9).throttle).toBe(-1);
  });

  it('keeps seq strictly increasing across interleaved sample() and sendNeutralNow() calls', () => {
    const sampler = new InputSampler(() => undefined);
    const seqs = [
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).seq,
      sampler.sendNeutralNow(0).seq,
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).seq,
    ];
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('works before any sample() call, defaulting aim/fireSeq/aimDist/weapon to zero', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sendNeutralNow(0);
    expect(msg).toEqual({ seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, weapon: 0 });
  });
});
