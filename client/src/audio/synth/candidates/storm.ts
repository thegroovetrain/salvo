// Round 3 (Eric 2026-11-11: "continuous storm bed"): three storm-bed profiles
// for audio/stormBed.ts, played the whole time the ship is inside the storm.
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
    id: 'gale',
    label: 'Gale and rain',
    blurb: 'A strong, gusting wind with steady rain hissing softly on the water.',
    profile: {
      windHz: [350, 750],
      windGain: [0.5, 1.4],
      windQ: 1.2,
      wanderHz: 0.09,
      wanderDepth: 0.45,
      rainBand: [2500, 9000],
      rainGain: [0.04, 0.12],
      thunderGain: 0,
      thunderEveryS: [8, 20],
      level: 0.17,
    },
  },
  {
    id: 'howl',
    label: 'Low howling wind',
    blurb: 'A deeper wind that moans and howls, with only a little rain.',
    profile: {
      windHz: [180, 380],
      windGain: [0.6, 1.8],
      windQ: 2.5,
      wanderHz: 0.06,
      wanderDepth: 0.6,
      rainBand: [3000, 8000],
      rainGain: [0.01, 0.04],
      thunderGain: 0,
      thunderEveryS: [8, 20],
      level: 0.17,
    },
  },
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
