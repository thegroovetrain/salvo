// THE ENGINE VOICE (Story 10.13): the pure target maps (engine.ts) and the node
// graph that glides toward them (engineGraph.ts). Contracts only — monotone
// targets, boost never lowers, idle is audible, junk never NaNs out, the graph
// is built once, reaches the sink, is throttled and releases cleanly. Nothing
// here asserts how anything sounds.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENGINE_PROFILE,
  DEFAULT_DIESEL_VOICING,
  REMOTE_LOWPASS_HZ,
  REMOTE_PAN_MAX,
  SHAFT_DETUNE,
  SILENCE,
  SPEED_CAP,
  CLOSE_ALONGSIDE_CUTOFF,
  closeAlongside01,
  engineTargets,
  remoteEngineTargets,
  type EngineProfile,
  type EngineTargets,
} from '../engine.js';
import {
  EngineVoice,
  RemoteEngineVoice,
  UPDATE_MIN_S,
  WHINE_OVERSHOOT,
  WHINE_OVERSHOOT_S,
} from '../engineGraph.js';
import { FakeEngineCtx, fixedRand, reaches, type FakeNode, type FakeParam, type Factory } from './fakeEngineAudio.js';

const HEAVY: EngineProfile = {
  ...DEFAULT_ENGINE_PROFILE,
  shafts: 4,
  blades: 3,
  rpmMax: 160,
  whineHz: [220, 500],
  rumbleHz: [60, 140],
};
const DIESEL: EngineProfile = {
  ...DEFAULT_ENGINE_PROFILE,
  kind: 'diesel',
  shafts: 2,
  whineHz: [17, 65],
  whineGain: [0.2, 0.5],
};

const PROFILES: ReadonlyArray<readonly [string, EngineProfile]> = [
  ['standard', DEFAULT_ENGINE_PROFILE],
  ['heavy', HEAVY],
  ['diesel', DIESEL],
];

const steps = (lo: number, hi: number, n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
const THROTTLES = steps(0, 1, 8);
const SPEEDS = steps(0, SPEED_CAP, 10);

/** Every scalar target plus each shaft's blade rate, flattened by name. */
function flat(t: EngineTargets): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'number') out[k] = v;
  }
  t.bladeHz.forEach((hz, i) => (out[`bladeHz${i}`] = hz));
  return out;
}

function expectNonDecreasing(a: EngineTargets, b: EngineTargets, label: string): void {
  const fa = flat(a);
  const fb = flat(b);
  for (const k of Object.keys(fa)) {
    expect(fb[k], `${label}: ${k}`).toBeGreaterThanOrEqual(fa[k] - 1e-12);
  }
}

describe('engineTargets — the own-engine arithmetic', () => {
  describe.each(PROFILES)('%s profile', (_name, profile) => {
    it('every target is monotone non-decreasing in throttle magnitude (ahead and astern)', () => {
      for (const sign of [1, -1]) {
        for (const speed01 of SPEEDS) {
          for (let i = 1; i < THROTTLES.length; i++) {
            for (const boost of [false, true]) {
              const lo = engineTargets(profile, { throttle: sign * THROTTLES[i - 1], speed01, boost });
              const hi = engineTargets(profile, { throttle: sign * THROTTLES[i], speed01, boost });
              expectNonDecreasing(lo, hi, `t ${sign * THROTTLES[i]} s ${speed01}`);
            }
          }
        }
      }
    });

    it('every target is monotone non-decreasing in speed01', () => {
      for (const throttle of THROTTLES) {
        for (let i = 1; i < SPEEDS.length; i++) {
          for (const boost of [false, true]) {
            const lo = engineTargets(profile, { throttle, speed01: SPEEDS[i - 1], boost });
            const hi = engineTargets(profile, { throttle, speed01: SPEEDS[i], boost });
            expectNonDecreasing(lo, hi, `t ${throttle} s ${SPEEDS[i]}`);
          }
        }
      }
    });

    it('astern uses the throttle magnitude', () => {
      for (const throttle of THROTTLES) {
        expect(engineTargets(profile, { throttle: -throttle, speed01: 0.4, boost: false })).toEqual(
          engineTargets(profile, { throttle, speed01: 0.4, boost: false }),
        );
      }
    });

    it('boost never lowers a target and raises the whine pitch and the level', () => {
      for (const throttle of THROTTLES) {
        for (const speed01 of SPEEDS) {
          const calm = engineTargets(profile, { throttle, speed01, boost: false });
          const surge = engineTargets(profile, { throttle, speed01, boost: true });
          expectNonDecreasing(calm, surge, `boost t ${throttle} s ${speed01}`);
          expect(surge.whineHz).toBeGreaterThan(calm.whineHz);
          expect(surge.level).toBeGreaterThan(calm.level);
        }
      }
    });

    it('idle (throttle 0, speed 0) is audible but quieter than full load', () => {
      const idle = engineTargets(profile, { throttle: 0, speed01: 0, boost: false });
      const full = engineTargets(profile, { throttle: 1, speed01: 1, boost: false });
      expect(idle.level).toBeGreaterThan(SILENCE);
      expect(idle.level).toBeLessThan(full.level);
      expect(Math.max(idle.rumbleGain, idle.throbGain, idle.whineGain)).toBeGreaterThan(SILENCE);
      expect(idle.bladeHz.every((hz) => hz > 0)).toBe(true);
    });

    it('non-finite input degrades to the idle targets', () => {
      const idle = engineTargets(profile, { throttle: 0, speed01: 0, boost: false });
      for (const bad of [NaN, Infinity, -Infinity]) {
        expect(engineTargets(profile, { throttle: bad, speed01: 0.5, boost: true })).toEqual(idle);
        expect(engineTargets(profile, { throttle: 0.5, speed01: bad, boost: false })).toEqual(idle);
      }
    });

    it('speed past the boost cap stops growing, and every target stays finite', () => {
      const atCap = engineTargets(profile, { throttle: 1, speed01: SPEED_CAP, boost: true });
      expect(engineTargets(profile, { throttle: 1, speed01: SPEED_CAP * 4, boost: true })).toEqual(atCap);
      for (const v of Object.values(flat(atCap))) expect(Number.isFinite(v)).toBe(true);
    });

    it('one blade-rate LFO per shaft, spread within the detune so they beat', () => {
      const t = engineTargets(profile, { throttle: 0.5, speed01: 0.5, boost: false });
      expect(t.bladeHz).toHaveLength(profile.shafts);
      const mid = (Math.max(...t.bladeHz) + Math.min(...t.bladeHz)) / 2;
      for (const hz of t.bladeHz) expect(Math.abs(hz / mid - 1)).toBeLessThanOrEqual(SHAFT_DETUNE + 1e-9);
      expect(new Set(t.bladeHz).size).toBe(profile.shafts);
    });
  });

  it('two different profiles give different targets for the same input', () => {
    const input = { throttle: 0.6, speed01: 0.7, boost: false };
    expect(engineTargets(HEAVY, input)).not.toEqual(engineTargets(DEFAULT_ENGINE_PROFILE, input));
  });
});

describe('closeAlongside01 — another ship heard only close alongside', () => {
  it('is monotone non-decreasing in distance and starts at the listener', () => {
    const ds = steps(0, 1, 40);
    for (let i = 1; i < ds.length; i++) expect(closeAlongside01(ds[i])).toBeGreaterThanOrEqual(closeAlongside01(ds[i - 1]));
    expect(closeAlongside01(0)).toBe(0);
  });

  it('puts the engine at the silence floor at and beyond the cutoff (and on junk)', () => {
    for (const d of [CLOSE_ALONGSIDE_CUTOFF, 0.5, 1, 7, Infinity, NaN]) {
      expect(closeAlongside01(d)).toBe(1);
      const t = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: 1, distance01: closeAlongside01(d), pan: 0 });
      expect(t.gain).toBe(SILENCE);
    }
  });

  it('is still audible inside the cutoff', () => {
    const t = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: 1, distance01: closeAlongside01(CLOSE_ALONGSIDE_CUTOFF / 2), pan: 0 });
    expect(t.gain).toBeGreaterThan(SILENCE);
  });
});

describe('remoteEngineTargets — another ship by distance', () => {
  const DISTANCES = steps(0, 1, 10);

  it('gain and lowpass are monotone non-increasing in distance', () => {
    for (const speed01 of SPEEDS) {
      for (let i = 1; i < DISTANCES.length; i++) {
        const near = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01, distance01: DISTANCES[i - 1], pan: 0 });
        const far = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01, distance01: DISTANCES[i], pan: 0 });
        expect(far.gain).toBeLessThanOrEqual(near.gain);
        expect(far.lowpassHz).toBeLessThanOrEqual(near.lowpassHz);
      }
    }
  });

  it('reaches the silence floor at and beyond the edge of hearing (and on junk distance)', () => {
    for (const distance01 of [1, 1.5, Infinity, NaN]) {
      expect(remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: 1, distance01, pan: 0 }).gain).toBe(SILENCE);
    }
  });

  it('a stopped ship next to the listener is still audible; the lowpass spans its range', () => {
    const near = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: 0, distance01: 0, pan: 0 });
    const far = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: 0, distance01: 1, pan: 0 });
    expect(near.gain).toBeGreaterThan(SILENCE);
    expect(near.lowpassHz).toBeCloseTo(REMOTE_LOWPASS_HZ[0]);
    expect(far.lowpassHz).toBeCloseTo(REMOTE_LOWPASS_HZ[1]);
  });

  it('is louder and throbs faster as the ship speeds up', () => {
    for (let i = 1; i < SPEEDS.length; i++) {
      const slow = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: SPEEDS[i - 1], distance01: 0.3, pan: 0 });
      const fast = remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: SPEEDS[i], distance01: 0.3, pan: 0 });
      expect(fast.gain).toBeGreaterThanOrEqual(slow.gain);
      expect(fast.bladeHz).toBeGreaterThan(slow.bladeHz);
    }
  });

  it('pan is clamped, and junk pans centre', () => {
    const pan = (p: number) => remoteEngineTargets(DEFAULT_ENGINE_PROFILE, { speed01: 0.5, distance01: 0.2, pan: p }).pan;
    expect(pan(5)).toBe(REMOTE_PAN_MAX);
    expect(pan(-5)).toBe(-REMOTE_PAN_MAX);
    expect(pan(NaN)).toBe(0);
    expect(pan(0.25)).toBe(0.25);
  });
});

// --- the graph ---------------------------------------------------------------

const asCtx = (c: FakeEngineCtx) => c as unknown as BaseAudioContext;
const asSink = (c: FakeEngineCtx) => c.sink as unknown as AudioNode;
const outOf = (c: FakeEngineCtx): FakeNode => {
  const outs = c.built.filter((n) => n.outputs.includes(c.sink));
  expect(outs).toHaveLength(1);
  return outs[0];
};
const outGain = (c: FakeEngineCtx): FakeParam => outOf(c).gain as FakeParam;
const writeCount = (c: FakeEngineCtx): number => c.allWrites().length;
const RUN = { throttle: 0.5, speed01: 0.5, boost: false };

type AnyVoice = EngineVoice | RemoteEngineVoice;
const VOICES: ReadonlyArray<readonly [string, (c: FakeEngineCtx) => AnyVoice, (v: AnyVoice, t?: number) => void]> = [
  ['turbine', (c) => new EngineVoice(asCtx(c), asSink(c), DEFAULT_ENGINE_PROFILE, { rand: fixedRand }), (v, t) => (v as EngineVoice).update(RUN, t)],
  ['diesel', (c) => new EngineVoice(asCtx(c), asSink(c), DIESEL, { rand: fixedRand }), (v, t) => (v as EngineVoice).update(RUN, t)],
  [
    'remote',
    (c) => new RemoteEngineVoice(asCtx(c), asSink(c), DEFAULT_ENGINE_PROFILE, { rand: fixedRand }),
    (v, t) => (v as RemoteEngineVoice).update({ speed01: 0.5, distance01: 0.3, pan: 0.4 }, t),
  ],
];

describe.each(VOICES)('%s voice graph', (_name, make, drive) => {
  it('builds once: every source started exactly once and every source reaches the sink through one output', () => {
    const c = new FakeEngineCtx();
    const v = make(c);
    expect(c.sources().length).toBeGreaterThan(0);
    for (const s of c.sources()) {
      expect(s.starts).toBe(1);
      expect(reaches(s, c.sink)).toBe(true);
    }
    outOf(c);
    const built = c.built.length;
    drive(v, 11);
    drive(v, 12);
    expect(c.built.length).toBe(built);
  });

  it('starts silent and fades in on the first update', () => {
    const c = new FakeEngineCtx();
    const v = make(c);
    expect(outGain(c).value).toBe(SILENCE);
    expect(outGain(c).writes).toHaveLength(0);
    drive(v, 11);
    const [first] = outGain(c).writes;
    expect(first.method).toBe('target');
    expect(first.value).toBeGreaterThan(SILENCE);
  });

  it('drops updates closer together than the throttle interval', () => {
    const c = new FakeEngineCtx();
    const v = make(c);
    drive(v, 11);
    const after = writeCount(c);
    drive(v, 11 + UPDATE_MIN_S / 2);
    expect(writeCount(c)).toBe(after);
    drive(v, 11 + UPDATE_MIN_S * 1.5);
    expect(writeCount(c)).toBeGreaterThan(after);
  });

  it('release fades to the floor, stops every source after the fade, disconnects, and silences later calls', () => {
    const c = new FakeEngineCtx();
    const v = make(c);
    drive(v, 10);
    v.release(0.5);
    expect(v.released).toBe(true);
    const fade = outGain(c).writes.at(-1);
    expect(fade).toEqual({ method: 'exp', value: SILENCE, time: c.currentTime + 0.5 });
    for (const s of c.sources()) expect(s.stops).toBe(1);
    const ender = c.sources().find((s) => s.onended);
    expect(ender).toBeDefined();
    ender?.onended?.();
    expect(c.built.every((n) => n.disconnected)).toBe(true);
    const after = writeCount(c);
    drive(v, 20);
    v.setLevel(0.5);
    v.release();
    expect(writeCount(c)).toBe(after);
    for (const s of c.sources()) expect(s.stops).toBe(1);
  });

  it('never targets a gain at or below zero', () => {
    const c = new FakeEngineCtx();
    const v = make(c);
    drive(v, 11);
    v.setLevel(0);
    v.release();
    const gainWrites = c.of('gain').flatMap((g) => (g.gain as FakeParam).writes).filter((w) => w.method !== 'cancel');
    expect(gainWrites.length).toBeGreaterThan(0);
    for (const w of gainWrites) expect(w.value).toBeGreaterThanOrEqual(SILENCE);
  });

  it('setLevel trims the output target proportionally and ignores junk', () => {
    const c = new FakeEngineCtx();
    const v = make(c);
    drive(v, 11);
    const full = outGain(c).writes.at(-1)?.value as number;
    v.setLevel(0.5);
    expect(outGain(c).writes.at(-1)?.value).toBeCloseTo(full * 0.5);
    const n = outGain(c).writes.length;
    v.setLevel(NaN);
    expect(outGain(c).writes).toHaveLength(n);
  });

  it('missing panner / shaper / periodic-wave factories degrade without throwing', () => {
    const c = new FakeEngineCtx(['createStereoPanner', 'createWaveShaper', 'createPeriodicWave'] as Factory[]);
    const v = make(c);
    expect(v.released).toBe(false);
    expect(c.of('panner')).toHaveLength(0);
    expect(c.of('shaper')).toHaveLength(0);
    for (const s of c.sources()) expect(reaches(s, c.sink)).toBe(true);
    expect(() => drive(v, 11)).not.toThrow();
    expect(() => v.release()).not.toThrow();
  });
});

describe('own-engine specifics', () => {
  const whinePitch = (c: FakeEngineCtx): FakeParam => c.of('oscillator')
    .map((o) => o.frequency as FakeParam)
    .find((p) => p.value === engineTargets(DEFAULT_ENGINE_PROFILE, { throttle: 0, speed01: 0, boost: false }).whineHz) as FakeParam;

  it('a boost flip is never throttled, and its onset overshoots the whine then settles', () => {
    const c = new FakeEngineCtx();
    const v = new EngineVoice(asCtx(c), asSink(c), DEFAULT_ENGINE_PROFILE, { rand: fixedRand });
    v.update(RUN, 11);
    const pitch = whinePitch(c);
    const before = pitch.writes.length;
    v.update({ ...RUN, boost: true }, 11 + UPDATE_MIN_S / 4);
    const surge = engineTargets(DEFAULT_ENGINE_PROFILE, { ...RUN, boost: true }).whineHz;
    const [peak, settle] = pitch.writes.slice(before);
    expect(peak.value).toBeCloseTo(surge * WHINE_OVERSHOOT);
    expect(settle).toMatchObject({ time: 11 + UPDATE_MIN_S / 4 + WHINE_OVERSHOOT_S });
    expect(settle.value).toBeCloseTo(surge);
    // Ordinary updates inside the window leave the overshoot alone.
    const inWindow = pitch.writes.length;
    v.update({ ...RUN, boost: true }, 11 + WHINE_OVERSHOOT_S / 2);
    expect(pitch.writes).toHaveLength(inWindow);
    v.update({ ...RUN, boost: true }, 11 + WHINE_OVERSHOOT_S * 2);
    expect(pitch.writes.length).toBeGreaterThan(inWindow);
  });

  it('non-finite input holds the last good targets (writes nothing)', () => {
    const c = new FakeEngineCtx();
    const v = new EngineVoice(asCtx(c), asSink(c), DEFAULT_ENGINE_PROFILE, { rand: fixedRand });
    v.update(RUN, 11);
    const after = writeCount(c);
    v.update({ throttle: NaN, speed01: 0.5, boost: false }, 12);
    v.update({ throttle: 0.5, speed01: Infinity, boost: false }, 13);
    expect(writeCount(c)).toBe(after);
  });

  it('one throb LFO per shaft drives the throb gain; diesel rings through its resonators', () => {
    const turbine = new FakeEngineCtx();
    new EngineVoice(asCtx(turbine), asSink(turbine), DEFAULT_ENGINE_PROFILE, { rand: fixedRand });
    const lfoCount = (c: FakeEngineCtx) =>
      c.of('oscillator').filter((o) => o.wave !== undefined).length;
    expect(lfoCount(turbine)).toBe(DEFAULT_ENGINE_PROFILE.shafts);

    const diesel = new FakeEngineCtx();
    new EngineVoice(asCtx(diesel), asSink(diesel), DIESEL, { rand: fixedRand });
    // The pulse oscillator plus one LFO per shaft carry a custom wave.
    expect(lfoCount(diesel)).toBe(DIESEL.shafts + 1);
    const bands = diesel.of('biquad').filter((f) => f.type === 'bandpass');
    for (const r of DEFAULT_DIESEL_VOICING.resonators) {
      expect(bands.some((f) => (f.frequency as FakeParam).value === r.hz)).toBe(true);
    }
  });

  it('a diesel without PeriodicWave falls back to a plain sawtooth pulse', () => {
    const c = new FakeEngineCtx(['createPeriodicWave']);
    new EngineVoice(asCtx(c), asSink(c), DIESEL, { rand: fixedRand });
    expect(c.of('oscillator').some((o) => o.type === 'sawtooth')).toBe(true);
  });
});
