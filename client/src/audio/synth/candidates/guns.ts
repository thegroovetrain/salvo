// Gun candidates (Story 10.13 wave A): the main battery (research §2) and the
// secondary guns (§3).

import type { CueSlot } from './types.js';
import { bark, crack, filters, metalRing, noiseLayer, thump } from './parts.js';

const { lp, hp, bp } = filters;

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
    {
      id: 'B',
      label: 'Hard blast',
      blurb: 'One tight, hard punch of air like a real recording, with the open sea ringing on long after it.',
      recipe: { gain: 0.41,
        family: 'main',
        maxVoices: 6,
        reverb: 0.85,
        layers: [
          { source: { kind: 'click', ms: 25 }, filters: [lp({ from: 3000, to: 200, ms: 400 })], env: { peak: 2.2, attackMs: 0, tauMs: 140 }, drive: 4 },
          thump(48, 30, 120, 1, 110, { drive: 4, jitter: { freq: 0.08, gainDb: 2 } }),
          crack(2500, 0.35, 10, { farCut: 0.5 }),
        ],
      },
    },
    {
      id: 'C',
      label: 'Thunder roll',
      blurb: 'A deep boom that keeps rolling and grumbling for a couple of seconds, like close thunder.',
      recipe: { gain: 0.41,
        family: 'main',
        maxVoices: 6,
        reverb: 0.55,
        echoes: [...HORIZON_ECHOES, { delayMs: 1500, gain: 0.12, lowpassHz: 400, jitter: 0.2 }],
        layers: [
          thump(45, 20, 450, 0.9, 500, { drive: 3, jitter: { freq: 0.08, gainDb: 2 } }),
          noiseLayer('brown', [lp({ from: 900, to: 100, ms: 1200 }, 0.7)], { peak: 1, attackMs: 3, tauMs: 600 }),
          crack(1500, 0.45, 25, { farCut: 0.5 }),
          noiseLayer('brown', [lp(300)], { peak: 0.5, attackMs: 40, tauMs: 260 }, { startMs: 150, grains: { count: 6, windowMs: 1300, thin: 0.8, spread: [0.7, 1.4] } }),
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
    {
      id: 'B',
      label: 'Brassy bark',
      blurb: 'The same bang with a slight metallic ring from the gun mount, like brass and steel rattling.',
      recipe: { gain: 0.38,
        family: 'secondary',
        maxVoices: 6,
        reverb: 0.2,
        reverbHighpassHz: 180,
        layers: [...bark(1), metalRing(1100, [1, 1.47], 25, 3, 90, { jitter: { freq: 0.06 } })],
      },
    },
    {
      id: 'C',
      label: 'Shielded thud',
      blurb: 'A rounder, duller boom with almost no crack, as if the guns sit behind steel shields.',
      recipe: { gain: 0.3,
        family: 'secondary',
        maxVoices: 6,
        reverb: 0.25,
        reverbHighpassHz: 180,
        layers: [
          noiseLayer('brown', [lp({ from: 900, to: 220, ms: 150 }, 0.8)], { peak: 1.4, attackMs: 1, tauMs: 90 }, { jitter: { freq: 0.1 } }),
          thump(90, 45, 90, 0.8, 80),
          noiseLayer('white', [bp(600, 1.5), hp(300)], { peak: 0.25, attackMs: 1, tauMs: 20 }, { farCut: 0.5 }),
          noiseLayer('brown', [lp(300)], { peak: 0.45, attackMs: 8, tauMs: 220 }),
        ],
      },
    },
  ],
};
