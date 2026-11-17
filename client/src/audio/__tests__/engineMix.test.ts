// THE PER-FRAME SHIP AUDIO (audio/engineMix.ts): the pure selections (who is
// heard, the sink-fade latch) and the voice life cycle against counting fakes —
// no AudioContext, no graph, no sound.

import { describe, it, expect, vi } from 'vitest';
import { CONFIG } from '@salvo/shared';
import type { CueId } from '../synth/cues.js';
import type { StoppableBlast } from '../klaxon.js';
import { CLIENT_CONFIG } from '../../config.js';
import { CLOSE_ALONGSIDE_CUTOFF } from '../engine.js';
import {
  EngineMix,
  audibleHulls,
  sinkFadeTarget,
  sinkingLeftS,
  sinkingProgress,
  speedFraction,
  STORM_UPDATE_S,
  type EngineAudio,
  type EngineFrame,
  type RemoteHull,
  type VoiceMakers,
} from '../engineMix.js';

/** u — the engines' earshot scale: the client feel knob (Story 11.2 gate C6),
 *  never the gameplay eye reach `CONFIG.vision.sight`. */
const SIGHT = CLIENT_CONFIG.audio.remoteEngineHearU;
const EAR = { x: 0, y: 0 };
/** Inside earshot: a quarter of the close-alongside band. */
const NEAR = SIGHT * CLOSE_ALONGSIDE_CUTOFF * 0.25;

const hull = (id: string, x: number, cls: RemoteHull['cls'] = 'bismarck'): RemoteHull => ({ id, cls, x, y: 0, speed: 10 });

describe('audibleHulls', () => {
  it('keeps only hulls close alongside, nearest first, at most n', () => {
    const hulls = [hull('c', NEAR * 3), hull('a', NEAR), hull('far', SIGHT), hull('b', NEAR * 2)];
    expect(audibleHulls(EAR, hulls, SIGHT, 2).map((h) => h.id)).toEqual(['a', 'b']);
    expect(audibleHulls(EAR, hulls, SIGHT, 10).map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('a hull at or past the close-alongside cutoff is not heard', () => {
    expect(audibleHulls(EAR, [hull('x', SIGHT * CLOSE_ALONGSIDE_CUTOFF)], SIGHT, 3)).toEqual([]);
  });

  it('distance grows and pan follows the side', () => {
    const [a, b] = audibleHulls(EAR, [hull('a', NEAR), hull('b', -NEAR * 2)], SIGHT, 3);
    expect(b.distance01).toBeGreaterThan(a.distance01);
    expect(a.pan).toBeGreaterThan(0);
    expect(b.pan).toBeLessThan(0);
  });

  it('junk positions, a junk listener and n = 0 hear nothing', () => {
    expect(audibleHulls(EAR, [{ ...hull('j', 0), x: NaN }], SIGHT, 3)).toEqual([]);
    expect(audibleHulls({ x: NaN, y: 0 }, [hull('a', NEAR)], SIGHT, 3)).toEqual([]);
    expect(audibleHulls(EAR, [hull('a', NEAR)], SIGHT, 0)).toEqual([]);
  });
});

describe('speedFraction / sinkingProgress', () => {
  it('speed is |speed| over the max; junk is 0', () => {
    expect(speedFraction(-15, 30)).toBe(0.5);
    expect(speedFraction(NaN, 30)).toBe(0);
    expect(speedFraction(10, 0)).toBe(0);
  });

  it('progress runs 0 → 1 across the window, clamped; junk is 0', () => {
    expect(sinkingProgress(5000, 0, 5000)).toBe(0);
    expect(sinkingProgress(5000, 2500, 5000)).toBe(0.5);
    expect(sinkingProgress(5000, 9000, 5000)).toBe(1);
    expect(sinkingProgress(NaN, 0, 5000)).toBe(0);
  });
});

describe('sinkFadeTarget', () => {
  it('follows the sinking, holds closed after it until cleared, then unplugs', () => {
    let st = sinkFadeTarget(false, 0.4, false);
    expect(st).toEqual({ target: 0.4, latched: true });
    st = sinkFadeTarget(st.latched, null, false); // foundered, not yet spectating
    expect(st).toEqual({ target: 1, latched: true });
    st = sinkFadeTarget(st.latched, null, true); // spectating / respawned / match over
    expect(st).toEqual({ target: null, latched: false });
    expect(sinkFadeTarget(false, null, false)).toEqual({ target: null, latched: false });
  });
});

// --- the class, against counting fakes --------------------------------------

function rig() {
  const own = { update: vi.fn(), release: vi.fn() };
  const ownBuilt: unknown[] = [];
  const remotes = new Map<number, { update: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }>();
  let n = 0;
  const storms: Array<{ update: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> = [];
  const makers: VoiceMakers = {
    storm: () => {
      const v = { update: vi.fn(), release: vi.fn() };
      storms.push(v);
      return v;
    },
    own: (_c, _s, profile) => {
      ownBuilt.push(profile);
      return { update: own.update, release: own.release };
    },
    remote: () => {
      const v = { update: vi.fn(), release: vi.fn() };
      remotes.set(n++, v);
      return v;
    },
  };
  const clock = { currentTime: 0 };
  let bus: ReturnType<EngineAudio['engineBus']> = { ctx: clock as BaseAudioContext, sink: {} as AudioNode };
  // A cue that PLAYED returns a handle (Audio.playCue); a dropped one null.
  const audio = {
    engineBus: () => bus,
    setSinkFade: vi.fn(),
    playCue: vi.fn((_id: CueId, _opts?: unknown): StoppableBlast | null => ({ stop: vi.fn() as StoppableBlast['stop'], ended: false })),
  };
  const mix = new EngineMix(audio, makers, () => clock.currentTime);
  const setBus = (on: boolean): void => {
    bus = on ? { ctx: clock as BaseAudioContext, sink: {} as AudioNode } : null;
  };
  return { mix, audio, own, ownBuilt, remotes, setBus, storms, clock };
}

const frame = (over: Partial<EngineFrame> = {}): EngineFrame => ({
  own: { cls: 'bismarck', throttle: 0.5, speed01: 0.3, boost: false },
  sinking01: null,
  sinkCleared: false,
  listener: EAR,
  hulls: [],
  drawn: [],
  beaconCycle: undefined,
  beaconAfloat: false,
  inStorm: false,
  matchOver: false,
  boostConfirmed: false,
  listenerKind: 'own',
  sinkLatchable: true,
  ...over,
});

describe('EngineMix — the own engine', () => {
  it('builds one voice for a conned hull and feeds it every frame', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.update(frame());
    expect(r.ownBuilt).toHaveLength(1);
    expect(r.own.update).toHaveBeenCalledTimes(2);
    expect(r.own.update).toHaveBeenLastCalledWith({ throttle: 0.5, speed01: 0.3, boost: false });
  });

  it('builds nothing without a bus (no context yet, muted, ducked) and releases a running voice', () => {
    const r = rig();
    r.setBus(false);
    r.mix.update(frame());
    expect(r.ownBuilt).toHaveLength(0);
    r.setBus(true);
    r.mix.update(frame());
    r.setBus(false);
    r.mix.update(frame());
    expect(r.own.release).toHaveBeenCalledTimes(1);
    expect(r.mix.voices).toBe(0);
  });

  it('releases on no own hull (dead / spectating / match over) and rebuilds on the next live frame', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.update(frame({ own: null }));
    expect(r.own.release).toHaveBeenCalledTimes(1);
    r.mix.update(frame());
    expect(r.ownBuilt).toHaveLength(2);
  });

  it('a hull change rebuilds the voice with the new hull’s profile', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.update(frame({ own: { cls: 'iowa', throttle: 0, speed01: 0, boost: false } }));
    expect(r.own.release).toHaveBeenCalledTimes(1);
    expect(r.ownBuilt).toHaveLength(2);
    expect(r.ownBuilt[0]).not.toBe(r.ownBuilt[1]);
  });
});

describe('EngineMix — other ships', () => {
  it('voices the nearest audible hulls, up to the knob, and releases one that leaves earshot', () => {
    const r = rig();
    const n = CLIENT_CONFIG.audio.remoteEngineVoices;
    const many = Array.from({ length: n + 2 }, (_, i) => hull(`h${i}`, NEAR * (1 + i * 0.1)));
    r.mix.update(frame({ hulls: many }));
    expect(r.remotes.size).toBe(n);
    r.mix.update(frame({ hulls: many.slice(1) })); // h0 gone: one released, one new
    const released = [...r.remotes.values()].filter((v) => v.release.mock.calls.length > 0);
    expect(released).toHaveLength(1);
    expect(r.mix.voices).toBe(1 + n);
  });

  it('releases every remote voice on match over or without a bus', () => {
    const r = rig();
    r.mix.update(frame({ hulls: [hull('a', NEAR)] }));
    r.mix.update(frame({ hulls: [hull('a', NEAR)], matchOver: true }));
    expect(r.remotes.get(0)?.release).toHaveBeenCalledTimes(1);
  });
});

describe('EngineMix — the sink fade and the edge cues', () => {
  it('drives the insert through the window and unplugs once cleared (only once)', () => {
    const r = rig();
    r.mix.update(frame({ sinking01: 0.2 }));
    r.mix.update(frame({ own: null }));
    r.mix.update(frame({ own: null, sinkCleared: true }));
    r.mix.update(frame({ own: null, sinkCleared: true }));
    expect(r.audio.setSinkFade.mock.calls.map(([p]) => p)).toEqual([0.2, 1, null]);
  });

  it('boost surge on the rising edge only, never on the first observation', () => {
    const r = rig();
    const boosting = frame({ own: { cls: 'bismarck', throttle: 1, speed01: 1, boost: true }, boostConfirmed: true });
    r.mix.update(boosting); // first observation: already boosting
    r.mix.update(frame());
    r.mix.update(boosting);
    r.mix.update(boosting);
    expect(r.audio.playCue.mock.calls.filter(([id]) => id === 'boostSurge')).toHaveLength(1);
  });

  it('a beacon set surfacing sounds once', () => {
    const r = rig();
    r.mix.update(frame({ beaconCycle: 2, beaconAfloat: false }));
    r.mix.update(frame({ beaconCycle: 2, beaconAfloat: true }));
    r.mix.update(frame({ beaconCycle: 2, beaconAfloat: true }));
    expect(r.audio.playCue.mock.calls.filter(([id]) => id === 'beacon')).toHaveLength(1);
  });

  it('a drawn torpedo coming close hums once, placed over the close radius', () => {
    const r = rig();
    const R = CLIENT_CONFIG.audio.torpedoHumRadiusU;
    r.mix.update(frame()); // the first frame only seeds (P3a)
    r.mix.update(frame({ drawn: [{ id: 't', kind: 'torp', x: R * 0.5, y: 0 }] }));
    r.mix.update(frame({ drawn: [{ id: 't', kind: 'torp', x: R * 0.4, y: 0 }] }));
    const hums = r.audio.playCue.mock.calls.filter(([id]) => id === 'torpedoRun');
    expect(hums).toHaveLength(1);
    const opts = hums[0][1] as { pan: number; distance01: number };
    expect(opts.distance01).toBeCloseTo(0.5, 10);
    expect(opts.pan).toBeGreaterThan(0);
  });
});

describe('EngineMix — the storm bed', () => {
  it('is built the first frame inside the storm, at intensity 1; outside it glides to 0 on the same voice', () => {
    const r = rig();
    r.mix.update(frame());
    expect(r.storms).toHaveLength(0); // never built before it is needed
    r.mix.update(frame({ inStorm: true }));
    r.mix.update(frame({ inStorm: false }));
    expect(r.storms).toHaveLength(1);
    expect(r.storms[0].update.mock.calls.map(([i]) => i)).toEqual([1, 0]);
  });

  it('re-targets only on a flip or after STORM_UPDATE_S (its thunder is scheduled from updates)', () => {
    const r = rig();
    r.mix.update(frame({ inStorm: true }));
    r.mix.update(frame({ inStorm: true }));
    expect(r.storms[0].update).toHaveBeenCalledTimes(1);
    r.clock.currentTime = STORM_UPDATE_S;
    r.mix.update(frame({ inStorm: true }));
    expect(r.storms[0].update).toHaveBeenCalledTimes(2);
  });

  it('is released with no conned hull (spectating is silent), no bus, or match over', () => {
    for (const gate of [{ own: null }, { matchOver: true }] as Partial<EngineFrame>[]) {
      const r = rig();
      r.mix.update(frame({ inStorm: true }));
      r.mix.update(frame({ inStorm: true, ...gate }));
      expect(r.storms[0].release).toHaveBeenCalledTimes(1);
    }
    const r = rig();
    r.mix.update(frame({ inStorm: true }));
    r.setBus(false);
    r.mix.update(frame({ inStorm: true }));
    expect(r.storms[0].release).toHaveBeenCalledTimes(1);
  });
});

describe('EngineMix — the klaxon (Story 10.13)', () => {
  it('a sinking frame sounds the klaxon capped to the window left; a band edge schedules its blasts', () => {
    const r = rig();
    r.mix.update(frame({ sinking01: 0.5 }));
    const klaxons = r.audio.playCue.mock.calls.filter(([id]) => id === 'klaxon');
    expect(klaxons).toHaveLength(1);
    expect((klaxons[0][1] as { maxS: number }).maxS).toBeCloseTo(sinkingLeftS(0.5) as number, 9);
    r.mix.klaxonEdge('critical');
    expect(r.audio.playCue.mock.calls.filter(([id]) => id === 'klaxon')).toHaveLength(4);
  });

  it('seconds left in the window from its progress; null when not sinking', () => {
    expect(sinkingLeftS(null)).toBeNull();
    expect(sinkingLeftS(1)).toBe(0);
    expect(sinkingLeftS(0)).toBe(CONFIG.ship.sinkingWindowMs / 1000);
  });
});

// --- review-gate regressions (Story 10.13 wave C fixes) ----------------------

describe('P1 / P4 / P5 — halt and resume', () => {
  it('halt releases every voice, stops the klaxon, unplugs the fade at once, and holds until resume', () => {
    const r = rig();
    r.mix.update(frame({ inStorm: true, sinking01: 0.5, hulls: [hull('a', NEAR)] }));
    r.mix.halt();
    expect(r.own.release).toHaveBeenCalledTimes(1);
    expect(r.storms[0].release).toHaveBeenCalledTimes(1);
    expect(r.remotes.get(0)?.release).toHaveBeenCalledTimes(1);
    expect(r.audio.setSinkFade).toHaveBeenLastCalledWith(null, { immediate: true });
    const klaxon = r.audio.playCue.mock.results.find((x, i) => r.audio.playCue.mock.calls[i][0] === 'klaxon')?.value;
    expect(klaxon?.stop).toHaveBeenCalled();
    r.mix.update(frame({ inStorm: true }));
    expect(r.ownBuilt).toHaveLength(1); // nothing rebuilt while halted
  });

  it('resume rebuilds from the next frame with every edge detector re-seeded', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.halt();
    r.mix.resume();
    const boosting = frame({ own: { cls: 'bismarck', throttle: 1, speed01: 1, boost: true }, boostConfirmed: true });
    r.mix.update({ ...boosting, beaconCycle: 4, beaconAfloat: true, drawn: [{ id: 't', kind: 'torp', x: 1, y: 0 }] });
    expect(r.ownBuilt).toHaveLength(2);
    const ids = r.audio.playCue.mock.calls.map(([id]) => id);
    expect(ids).not.toContain('boostSurge');
    expect(ids).not.toContain('beacon');
    expect(ids).not.toContain('torpedoRun');
  });
});

describe('P3 — the torpedo hum', () => {
  const R = () => CLIENT_CONFIG.audio.torpedoHumRadiusU;
  const hums = (r: ReturnType<typeof rig>) => r.audio.playCue.mock.calls.filter(([id]) => id === 'torpedoRun' || id === 'torpedoRunOwn');

  it('(a) the first frame only seeds: a torpedo already inside does not hum; a later one does', () => {
    const r = rig();
    r.mix.update(frame({ drawn: [{ id: 'old', kind: 'torp', x: R() / 2, y: 0 }] }));
    expect(hums(r)).toHaveLength(0);
    r.mix.update(frame({ drawn: [{ id: 'old', kind: 'torp', x: R() / 2, y: 0 }, { id: 'new', kind: 'torp', x: R() / 3, y: 0 }] }));
    expect(hums(r)).toHaveLength(1);
  });

  it('(a) the listener changing kind (own hull → camera) re-seeds: a camera jump does not hum', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.update(frame({ own: null, listenerKind: 'camera', drawn: [{ id: 't', kind: 'torp', x: 1, y: 0 }] }));
    expect(hums(r)).toHaveLength(0);
  });

  it('(b) a hum dropped by a cap is retried while the torpedo is still inside', () => {
    const r = rig();
    r.mix.update(frame());
    r.audio.playCue.mockReturnValueOnce(null);
    const t = { id: 't', kind: 'torp', x: R() / 2, y: 0 };
    r.mix.update(frame({ drawn: [t] }));
    r.mix.update(frame({ drawn: [t] }));
    r.mix.update(frame({ drawn: [t] }));
    expect(hums(r)).toHaveLength(2); // the dropped one, then the one that played — then never again
  });

  it('(c) an OWN torpedo hums on its own family, lower; an enemy one on the world family', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.update(frame({ drawn: [{ id: 'mine', kind: 'torp', x: 1, y: 0, own: true }, { id: 'foe', kind: 'torp', x: 2, y: 0 }] }));
    const own = hums(r).find(([id]) => id === 'torpedoRunOwn');
    expect(own).toBeDefined();
    expect((own?.[1] as { gain: number }).gain).toBe(CLIENT_CONFIG.audio.ownTorpedoHumGain);
    expect(hums(r).filter(([id]) => id === 'torpedoRun')).toHaveLength(1);
  });
});

describe('P8 / P9 — the sink fade writes', () => {
  it('P8: writes only when the target moved meaningfully, and nothing while latched', () => {
    const r = rig();
    r.mix.update(frame({ sinking01: 0.5 }));
    r.mix.update(frame({ sinking01: 0.5001 }));
    expect(r.audio.setSinkFade).toHaveBeenCalledTimes(1);
    r.mix.update(frame({ own: null })); // foundered: latched closed
    r.mix.update(frame({ own: null }));
    r.mix.update(frame({ own: null }));
    expect(r.audio.setSinkFade.mock.calls.map(([p]) => p)).toEqual([0.5, 1]);
  });

  it('P9: cleared wins over a running window, and a death with respawns coming never latches', () => {
    expect(sinkFadeTarget(true, 0.5, true)).toEqual({ target: null, latched: false });
    let st = sinkFadeTarget(false, 0.5, false, false);
    expect(st.target).toBe(0.5);
    st = sinkFadeTarget(st.latched, null, false, false);
    expect(st).toEqual({ target: null, latched: false });
  });
});

describe('P10 / P11 / P14 / P15', () => {
  it('P10: the own sunk event sounds one klaxon blast; the per-frame repeat does not double it', () => {
    const r = rig();
    r.mix.klaxonSinkStart();
    r.mix.update(frame({ sinking01: 0.01 }));
    const blasts = r.audio.playCue.mock.calls.filter(([id]) => id === 'klaxon');
    expect(blasts).toHaveLength(1);
    expect((blasts[0][1] as { fallback: string }).fallback).toBe('sink');
  });

  it('P11: the surge follows the SERVER-confirmed boost window, never the predicted flag alone', () => {
    const r = rig();
    r.mix.update(frame());
    r.mix.update(frame({ own: { cls: 'bismarck', throttle: 1, speed01: 1, boost: true }, boostConfirmed: false }));
    expect(r.audio.playCue.mock.calls.filter(([id]) => id === 'boostSurge')).toHaveLength(0);
    r.mix.update(frame({ own: { cls: 'bismarck', throttle: 1, speed01: 1, boost: true }, boostConfirmed: true }));
    expect(r.audio.playCue.mock.calls.filter(([id]) => id === 'boostSurge')).toHaveLength(1);
  });

  it('P14: no beacon data (an unsynced first frame) never arms a set', () => {
    const r = rig();
    r.mix.update(frame({ beaconCycle: 3, beaconAfloat: null }));
    r.mix.update(frame({ beaconCycle: 3, beaconAfloat: true }));
    expect(r.audio.playCue.mock.calls.filter(([id]) => id === 'beacon')).toHaveLength(0);
  });

  it('P15: a hull hovering at the cutoff keeps ONE voice (hysteresis), and nearest-N order swaps never rebuild', () => {
    const r = rig();
    const edge = SIGHT * CLOSE_ALONGSIDE_CUTOFF;
    for (let i = 0; i < 6; i++) r.mix.update(frame({ hulls: [hull('a', i % 2 ? edge * 0.99 : edge * 1.01)] }));
    expect(r.remotes.size).toBe(1);
    const n = CLIENT_CONFIG.audio.remoteEngineVoices;
    const r2 = rig();
    const base = Array.from({ length: n - 1 }, (_, i) => hull(`h${i}`, NEAR * (1 + i * 0.01)));
    for (let i = 0; i < 6; i++) {
      const x = i % 2 ? [hull('p', NEAR * 2), hull('q', NEAR * 2.01)] : [hull('p', NEAR * 2.01), hull('q', NEAR * 2)];
      r2.mix.update(frame({ hulls: [...base, ...x] }));
    }
    expect(r2.remotes.size).toBe(n);
  });

  it('P15: a hull whose voice is still fading is not given a second voice', () => {
    const r = rig();
    r.mix.update(frame({ hulls: [hull('a', NEAR)] }));
    r.mix.update(frame({ hulls: [] })); // released, fading
    r.mix.update(frame({ hulls: [hull('a', NEAR)] }));
    expect(r.remotes.size).toBe(1);
    r.clock.currentTime = 5; // the fade is long over
    r.mix.update(frame({ hulls: [hull('a', NEAR)] }));
    expect(r.remotes.size).toBe(2);
  });
});
