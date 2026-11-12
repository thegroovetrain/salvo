// THE ENGINE RETUNE (after Story 10.13): three calmer engine takes for the
// audition page, after Eric's verdict on the merged turbine ("too loud and too
// whiny, like a vacuum cleaner"). Not played by the game: `ENGINE_PROFILES`
// (synth/cues.ts) still points at the shipped `turbine` set until he picks.
//
// All three drop what made the vacuum cleaner: the gear whine (silent, no boost
// overshoot), the spray (off) and the bright hull wash (moved down to a faint
// low rush, narrower). The rumble and the propeller throb carry the sound, the
// idle share is far lower (nearly inaudible on the start line), and another
// ship close alongside is lowpassed hard so it never brings hiss back.
//
// Hulls differ by the PACE of the throb (pulses a second, idle → full ahead;
// `blades: 1`, so the throb follows the shaft turning, not each blade) and by
// its DEPTH (every band moved down or up together). Warspite is the slowest
// hull in CONFIG, Iowa the fastest; Yamato is the deepest, Iowa the lightest.

import type { ShipClassId } from '@salvo/shared';
import { DEFAULT_ENGINE_PROFILE, type EngineProfile, type Range } from '../../engine.js';
import type { EngineCandidate } from './types.js';

interface HullTrait {
  /** Multiplier on every band (rumble, throb, wash). */
  readonly depth: number;
  /** Multiplier on the rumble level. */
  readonly weight: number;
  readonly shafts: number;
  /** Throb pulses per second, [idle, full ahead]. */
  readonly pulseHz: Range;
}

const HULLS: Record<ShipClassId, HullTrait> = {
  yamato: { depth: 0.82, weight: 1.15, shafts: 4, pulseHz: [0.9, 3.2] },
  warspite: { depth: 0.92, weight: 1.05, shafts: 4, pulseHz: [0.7, 2.6] },
  bismarck: { depth: 1, weight: 1, shafts: 3, pulseHz: [1.1, 3.8] },
  iowa: { depth: 1.15, weight: 0.85, shafts: 4, pulseHz: [1.4, 4.8] },
};

const times = (r: Range, k: number): Range => [r[0] * k, r[1] * k];
const dB = (db: number): number => 10 ** (db / 20);

/** One take's base profile re-voiced for one hull; `pace` scales the pulse rate. */
function forHull(base: EngineProfile, h: HullTrait, pace: number): EngineProfile {
  return {
    ...base,
    shafts: h.shafts,
    blades: 1,
    rpmIdle: h.pulseHz[0] * 60 * pace,
    rpmMax: h.pulseHz[1] * 60 * pace,
    rumbleHz: times(base.rumbleHz, h.depth),
    rumbleGain: times(base.rumbleGain, h.weight),
    throbHz: times(base.throbHz, h.depth),
    washHz: times(base.washHz, h.depth),
  };
}

function everyHull(base: EngineProfile, pace: number): Record<ShipClassId, EngineProfile> {
  const out = {} as Record<ShipClassId, EngineProfile>;
  for (const id of Object.keys(HULLS) as ShipClassId[]) out[id] = forHull(base, HULLS[id], pace);
  return out;
}

/** What every retune take shares: no whine, no spray, no bright wash, no boost whine. */
const CALM: EngineProfile = {
  ...DEFAULT_ENGINE_PROFILE,
  whineGain: [0, 0],
  whineOvershoot: 1,
  boostWhine: 1,
  sprayGain: 0,
  boostWash: 1,
  washQ: 1.2,
  remoteLowpassHz: 500,
  drive: [1, 1.4],
};

/** A — rumble and a slow throb, a faint low rush of water. */
const DEEP_RUMBLE: EngineProfile = {
  ...CALM,
  rumbleHz: [55, 130],
  rumbleGain: [0.2, 0.8],
  throbHz: [60, 110],
  throbDepth: [0.3, 0.5],
  throbGain: 0.5,
  washHz: [150, 400],
  washGain: 0.05,
  level: 0.1,
  idleShare: 0.2,
  boostLevel: dB(1.5),
};

/** B — the propeller throb out front, a clear slow pulse; less rumble and water. */
const SLOW_THROB: EngineProfile = {
  ...CALM,
  rumbleHz: [50, 110],
  rumbleGain: [0.1, 0.4],
  throbHz: [65, 120],
  throbDepth: [0.45, 0.55],
  throbGain: 0.8,
  washHz: [150, 350],
  washGain: 0.02,
  level: 0.085,
  idleShare: 0.18,
  boostLevel: dB(1.5),
};

/** C — a low hum and a faint throb you stop noticing. */
const BARELY_THERE: EngineProfile = {
  ...CALM,
  rumbleHz: [50, 100],
  rumbleGain: [0.15, 0.6],
  throbHz: [55, 95],
  throbDepth: [0.2, 0.35],
  throbGain: 0.35,
  washHz: [150, 300],
  washGain: 0.01,
  level: 0.07,
  idleShare: 0.15,
  boostLevel: dB(1),
};

export const ENGINE_RETUNE_CANDIDATES: readonly EngineCandidate[] = [
  {
    id: 'A',
    label: 'Deep rumble',
    blurb: 'A low rumble with a slow propeller throb under it and only a faint rush of water. No whine. Much quieter than today.',
    profiles: everyHull(DEEP_RUMBLE, 1),
  },
  {
    id: 'B',
    label: 'Slow throb',
    blurb: 'The propellers are what you hear: a clear, slow pulse that quickens as you speed up. Almost no water noise, a touch quieter than A.',
    profiles: everyHull(SLOW_THROB, 0.85),
  },
  {
    id: 'C',
    label: 'Barely there',
    blurb: 'The quietest: a low hum and a faint throb you would stop noticing after a minute.',
    profiles: everyHull(BARELY_THERE, 0.9),
  },
];
