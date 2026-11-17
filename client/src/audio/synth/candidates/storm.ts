// The shipped storm bed (Eric 2026-11-11: "continuous storm bed"): the
// profile for audio/stormBed.ts, played the whole time the ship is inside the storm.
// Rain is soft band-limited noise, never a click scatter (the round-2 click
// rain read as frying). Levels sit under the engine.

import type { StormBedProfile } from '../../stormBed.js';

export interface StormCandidate {
  id: string;
  label: string;
  blurb: string;
  profile: StormBedProfile;
}

export const STORM_CANDIDATES: readonly StormCandidate[] = [
  {
    id: 'downpour',
    label: 'Heavy rain, far thunder',
    blurb: 'A heavy downpour with a soft wind under it and distant thunder rolling now and then.',
    profile: {
      windHz: [300, 550],
      windGain: [0.3, 0.7],
      windQ: 1,
      wanderHz: 0.08,
      wanderDepth: 0.35,
      rainBand: [1800, 7000],
      rainGain: [0.08, 0.25],
      thunderGain: 1.6,
      thunderEveryS: [8, 20],
      level: 0.13,
    },
  },
];
