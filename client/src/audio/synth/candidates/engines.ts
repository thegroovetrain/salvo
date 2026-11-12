// The shipped engine set (Story 10.13, epic-10 amendment 22; research §1), the one Eric picked. A set is one way of
// voicing the plant; inside a set the four hulls share the graph and differ by
// weight (how much low rumble), pitch (every band and the whine moved up or
// down together), shaft count and propeller speed (the throb rate).
//
// Hull traits are the implementer's reading of the four ships, for Eric's ear:
// YAMATO is the heaviest (deepest everything); WARSPITE is the slowest hull in
// CONFIG (engines index 80), so it gets the slowest throb but sits above Yamato
// in pitch; BISMARCK is the baseline (three shafts, as built); IOWA is the
// fastest (index 120): lightest, highest, quickest throb.

import type { ShipClassId } from '@salvo/shared';
import { DEFAULT_ENGINE_PROFILE, type EngineProfile, type Range } from '../../engine.js';
import type { EngineCandidate } from './types.js';

interface HullTrait {
  /** Multiplier on every band and on the whine / firing rate. */
  readonly pitch: number;
  /** Multiplier on the rumble level. */
  readonly weight: number;
  readonly shafts: number;
  readonly blades: number;
  readonly rpm: Range;
}

const HULLS: Record<ShipClassId, HullTrait> = {
  yamato: { pitch: 0.72, weight: 1.2, shafts: 4, blades: 3, rpm: [22, 150] },
  warspite: { pitch: 0.88, weight: 1.05, shafts: 4, blades: 3, rpm: [20, 130] },
  bismarck: { pitch: 1, weight: 0.95, shafts: 3, blades: 3, rpm: [28, 190] },
  iowa: { pitch: 1.4, weight: 0.7, shafts: 4, blades: 4, rpm: [35, 235] },
};

const times = (r: Range, k: number): Range => [r[0] * k, r[1] * k];

/** One set's base profile, re-voiced for one hull. */
function forHull(base: EngineProfile, h: HullTrait): EngineProfile {
  return {
    ...base,
    shafts: h.shafts,
    blades: h.blades,
    rpmIdle: h.rpm[0],
    rpmMax: h.rpm[1],
    rumbleHz: times(base.rumbleHz, h.pitch),
    rumbleGain: times(base.rumbleGain, h.weight),
    throbHz: times(base.throbHz, h.pitch),
    whineHz: times(base.whineHz, h.pitch),
    washHz: times(base.washHz, Math.sqrt(h.pitch)),
  };
}

function everyHull(base: EngineProfile): Record<ShipClassId, EngineProfile> {
  const out = {} as Record<ShipClassId, EngineProfile>;
  for (const id of Object.keys(HULLS) as ShipClassId[]) out[id] = forHull(base, HULLS[id]);
  return out;
}

/** Recipe A: rumble + shaft throb + gear whine + hull wash. */
const TURBINE: EngineProfile = { ...DEFAULT_ENGINE_PROFILE, level: 0.2 };

export const ENGINE_CANDIDATES: readonly EngineCandidate[] = [
  {
    id: 'turbine',
    label: 'Steam turbine',
    blurb: 'A deep throbbing from the propellers under a faint gear whine, with water rushing past the hull. Historically right: all four ships ran steam turbines.',
    profiles: everyHull(TURBINE),
  },
];
