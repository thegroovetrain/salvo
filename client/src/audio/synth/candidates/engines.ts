// The shipped engine (epic-10 amendment 23, after Story 10.13): "Deep rumble",
// Eric's pick from three calmer takes after he called the first turbine "too
// loud and too whiny, like a vacuum cleaner". It carries a low rumble, a slow
// propeller throb and only a faint low rush of water: no gear whine, no spray,
// no bright hull wash, and another ship close alongside is lowpassed hard so it
// never brings hiss back.
//
// Hulls differ by the PACE of the throb (pulses a second, idle -> full ahead;
// `blades: 1`, so the throb follows the shaft turning, not each blade) and by
// its DEPTH (every band moved down or up together). Warspite is the slowest hull
// in CONFIG, Iowa the fastest; Yamato is the deepest, Iowa the lightest.

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

/** The base profile re-voiced for one hull. */
function forHull(base: EngineProfile, h: HullTrait): EngineProfile {
  return {
    ...base,
    shafts: h.shafts,
    blades: 1,
    rpmIdle: h.pulseHz[0] * 60,
    rpmMax: h.pulseHz[1] * 60,
    rumbleHz: times(base.rumbleHz, h.depth),
    rumbleGain: times(base.rumbleGain, h.weight),
    throbHz: times(base.throbHz, h.depth),
    washHz: times(base.washHz, h.depth),
  };
}

function everyHull(base: EngineProfile): Record<ShipClassId, EngineProfile> {
  const out = {} as Record<ShipClassId, EngineProfile>;
  for (const id of Object.keys(HULLS) as ShipClassId[]) out[id] = forHull(base, HULLS[id]);
  return out;
}

/**
 * Eric 2026-11-12, "engine=A; engineVolume=75": the auditioned level times 0.75.
 * Baked into `level`, which scales the whole voice linearly, so it equals the
 * audition page's volume slider; it is not a setting.
 */
const OWNER_VOLUME = 0.75;

/** No whine, no spray, no bright wash, no boost whine; a rumble and a slow throb. */
const DEEP_RUMBLE: EngineProfile = {
  ...DEFAULT_ENGINE_PROFILE,
  whineGain: [0, 0],
  whineOvershoot: 1,
  boostWhine: 1,
  sprayGain: 0,
  boostWash: 1,
  washQ: 1.2,
  remoteLowpassHz: 500,
  drive: [1, 1.4],
  rumbleHz: [55, 130],
  rumbleGain: [0.2, 0.8],
  throbHz: [60, 110],
  throbDepth: [0.3, 0.5],
  throbGain: 0.5,
  washHz: [150, 400],
  washGain: 0.05,
  level: 0.1 * OWNER_VOLUME,
  idleShare: 0.2,
  boostLevel: dB(1.5),
};

export const ENGINE_CANDIDATES: readonly EngineCandidate[] = [
  {
    id: 'deepRumble',
    label: 'Deep rumble',
    blurb: 'A low rumble with a slow propeller throb under it and only a faint rush of water. No whine, and quiet.',
    profiles: everyHull(DEEP_RUMBLE),
  },
];
