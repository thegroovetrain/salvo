// Gun candidates (Story 10.13 wave A): the main battery (research §2) and the
// secondary guns (§3).

import type { CueSlot } from './types.js';
import { bark, crack, filters, noiseLayer, thump } from './parts.js';

const { lp } = filters;

const HORIZON_ECHOES = [
  { delayMs: 420, gain: 0.35, lowpassHz: 500, jitter: 0.2 },
  { delayMs: 950, gain: 0.2, lowpassHz: 500, jitter: 0.2 },
] as const;

export const MAIN_BATTERY: CueSlot = {
  id: 'mainBattery',
  title: 'Main battery fires',
  note: 'Your own big guns going off (and, with the distance dial, another battleship firing far away). The loudest sound in the game.',
  today: 'fireGun',
  world: true,
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: 'Layered cannon',
      blurb: 'A huge low thump with a sharp crack on top, then a rolling rumble and two faint echoes off the horizon.',
      recipe: { gain: 0.51,
        family: 'main',
        maxVoices: 6,
        reverb: 0.5,
        echoes: HORIZON_ECHOES,
        layers: [
          thump(60, 26, 300, 0.9, 350, { drive: 3, jitter: { freq: 0.08, decay: 0.15, gainDb: 2 } }),
          noiseLayer('white', [lp({ from: 2500, to: 140, ms: 700 }, 0.8)], { peak: 0.6, attackMs: 1, tauMs: 450 }, { jitter: { decay: 0.15 } }),
          noiseLayer('brown', [lp({ from: 2500, to: 140, ms: 700 }, 0.8)], { peak: 0.9, attackMs: 1, tauMs: 450 }),
          crack(1800, 0.7, 18, { farCut: 0.5 }),
          noiseLayer('brown', [lp(260)], { peak: 0.7, attackMs: 30, tauMs: 1400 }, { startMs: 40, am: { rateHz: 5.5, depth: 0.4, jitter: 0.25 } }),
        ],
      },
    },
  ],
};

export const SECONDARIES: CueSlot = {
  id: 'secondaries',
  title: 'Secondary guns fire',
  note: 'The smaller guns along the hull firing, often several in a row.',
  today: 'fireGun',
  world: true,
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: 'Sharp bark',
      blurb: 'A short, dry, punchy bang that stays clean when many fire in a row.',
      recipe: { gain: 0.34, family: 'secondary', maxVoices: 6, reverb: 0.2, reverbHighpassHz: 180, layers: bark(1) },
    },
  ],
};
