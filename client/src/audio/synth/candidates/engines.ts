// Engine candidate SETS (Story 10.13 wave A; research §1). A set is one way of
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

/** Recipe B: a pulse train with an audible firing rate through hull resonances. */
const DIESEL: EngineProfile = {
  ...DEFAULT_ENGINE_PROFILE,
  kind: 'diesel',
  whineHz: [18, 52],
  whineGain: [0.35, 0.7],
  washGain: 0.35,
  drive: [2, 3.5],
  level: 0.3,
  boostWhine: 1.08,
};

/** Recipe A pushed below decks: more rumble and throb, little whine, little water. */
const BELOW_DECKS: EngineProfile = {
  ...DEFAULT_ENGINE_PROFILE,
  rumbleHz: [50, 120],
  rumbleGain: [0.55, 1],
  throbGain: 0.65,
  throbDepth: [0.35, 0.65],
  whineHz: [200, 520],
  whineGain: [0.004, 0.012],
  washGain: 0.2,
  sprayGain: 0.03,
  drive: [2, 3.5],
  level: 0.2,
};

export const ENGINE_CANDIDATES: readonly EngineCandidate[] = [
  {
    id: 'turbine',
    label: 'Steam turbine',
    blurb: 'A deep throbbing from the propellers under a faint gear whine, with water rushing past the hull. Historically right: all four ships ran steam turbines.',
    profiles: everyHull(TURBINE),
  },
  {
    id: 'diesel',
    label: 'Diesel',
    blurb: 'A grittier, chugging engine whose individual beats you can hear, like a big diesel or a tugboat.',
    profiles: everyHull(DIESEL),
  },
  {
    id: 'belowDecks',
    label: 'Below decks',
    blurb: 'The turbine heard from inside the hull: darker and heavier, mostly rumble and throb, almost no whine.',
    profiles: everyHull(BELOW_DECKS),
  },
];
