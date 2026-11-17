// The shipped shipboard-event takes Eric picked (Story 10.13, epic-10 amendment 22): hull repair (research §8),
// smoke screen (§9), radio beacon (§10), airdrop pickup (§11) and the boost
// onset surge (§1 "Boost", the one-shot swell the engine voice leaves out).

import type { Layer } from '../recipe.js';
import type { CueSlot } from './types.js';
import { crackles, filters, metalRing, noiseLayer, thump, tone } from './parts.js';

const { lp, hp, bp } = filters;

export const REPAIR: CueSlot = {
  id: 'repair',
  title: 'Hull repair',
  note: 'You press HULL REPAIR (C) and the damage-control crew gets to work.',
  today: 'heal',
  candidates: [
    {
      id: 'A',
      label: 'Hammers and pump',
      blurb: 'A few quick hammer blows on steel over the chugging of a pump.',
      recipe: { gain: 0.18,
        family: 'repair',
        maxVoices: 1,
        reverb: 0.15,
        layers: [
          metalRing(1000, [1, 2.3, 3.7], 25, 9, 60, { grains: { onsetsMs: [0, 290, 570, 860, 1140], jitterMs: 45, spread: [0.9, 1.1] } }),
          noiseLayer('white', [hp(3000)], { peak: 0.3, attackMs: 0, tauMs: 6 }, { grains: { onsetsMs: [0, 290, 570, 860, 1140], jitterMs: 45 } }),
          noiseLayer('brown', [bp(150, 2)], { peak: 2.4, attackMs: 80, holdMs: 1100, tauMs: 150 }, { am: { rateHz: 2, depth: 0.6, wave: 'triangle' } }),
        ],
      },
    },
  ],
};

export const SMOKE: CueSlot = {
  id: 'smoke',
  title: 'Smoke screen',
  note: 'You press SMOKE SCREEN (V) and the ship starts laying smoke.',
  candidates: [
    {
      id: 'A',
      label: 'Pressurized hiss',
      blurb: 'A valve thunk, then a strong sputtering hiss of gas being pushed out.',
      recipe: { gain: 0.36,
        family: 'smoke',
        maxVoices: 1,
        reverb: 0.2,
        layers: [
          thump(120, 60, 60, 0.4, 40),
          noiseLayer('white', [bp(2800, 0.7)], { peak: 0.4, attackMs: 80, holdMs: 900, tauMs: 600 }, { am: { rateHz: 11, depth: 0.15, jitter: 0.3 } }),
          noiseLayer('white', [lp({ from: 300, to: 900, ms: 400 })], { peak: 0.5, attackMs: 80, holdMs: 700, tauMs: 500 }),
        ],
      },
    },
  ],
};

/** Morse at ~20 words per minute: a dot is 60 ms. */
const DOT_MS = 60;
/** "V V" (· · · —) keyed as dot and dash onsets, ms. */
const MORSE_DOTS = [0, 120, 240, 720, 840, 960];
const MORSE_DASHES = [360, 1080];

/** One keyed element of a CW (Morse) carrier with a slow shortwave drift. */
function keyed(onsetsMs: number[], holdMs: number, hz: number): Layer {
  return {
    source: { kind: 'osc', wave: 'sine', freq: hz, vibrato: { rateHz: 0.1, depth: 3 / hz } },
    filters: [bp(1200, 0.5)],
    env: { peak: 0.22, attackMs: 5, holdMs, tauMs: 4 },
    am: { rateHz: 0.25, depth: 0.4 },
    grains: { onsetsMs, jitterMs: 4 },
  };
}

/** The shortwave static bed under a beacon (§10). */
const STATIC: Layer[] = [
  noiseLayer('pink', [hp(300), lp(3000)], { peak: 0.12, attackMs: 150, holdMs: 1700, tauMs: 150 }),
  { ...crackles(7, 2000, 1.2, 0), filters: [hp(1000)] },
];

export const BEACON: CueSlot = {
  id: 'beacon',
  title: 'Radio beacon signal',
  note: 'A radio beacon calling out. Kept under 3 seconds.',
  candidates: [
    {
      id: 'A',
      label: 'Morse on shortwave',
      blurb: 'A clean Morse tone keying dots and dashes through crackling radio static.',
      recipe: { gain: 0.2,
        family: 'beacon',
        maxVoices: 2,
        layers: [keyed(MORSE_DOTS, DOT_MS - 9, 700), keyed(MORSE_DASHES, DOT_MS * 3 - 9, 700), ...STATIC],
      },
    },
  ],
};

export const BOOST: CueSlot = {
  id: 'boostSurge',
  title: 'Boost kicks in',
  note: 'The one-time surge when you hit BOOST. The engine sound itself (above) changes on its own; this is the swell on top.',
  candidates: [
    {
      id: 'B',
      label: 'Turbine spool-up',
      blurb: 'A whine climbing in pitch as the turbines spin up, over a rising rush of air.',
      recipe: { gain: 0.26,
        family: 'boost',
        maxVoices: 1,
        reverb: 0.15,
        layers: [
          tone({ from: 300, to: 950, ms: 1200 }, { peak: 0.08, attackMs: 500, holdMs: 500, tauMs: 300 }, { filters: [bp(700, 1)] }, 'triangle'),
          noiseLayer('pink', [bp({ from: 300, to: 1200, ms: 1200 }, 0.8)], { peak: 1.2, attackMs: 600, holdMs: 400, tauMs: 350 }),
        ],
      },
    },
  ],
};
