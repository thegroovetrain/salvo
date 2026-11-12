// The shipped torpedo and mine takes Eric picked (Story 10.13, epic-10 amendment 22; research §4, §5).

import type { CueSlot } from './types.js';
import { filters, metalRing, noiseLayer, splash, STEEL, thump, tone } from './parts.js';

const { lp, bp } = filters;

export const TORPEDO_LAUNCH: CueSlot = {
  id: 'torpedoLaunch',
  title: 'Torpedo launch',
  note: 'You fire a torpedo (light, heavy or supercavitating; all three share one launch sound).',
  today: 'fireTorp',
  candidates: [
    {
      id: 'A',
      label: 'Air whoosh, then splash',
      blurb: 'A soft thump and a rush of compressed air, then the torpedo hitting the water a moment later.',
      recipe: { gain: 0.25,
        family: 'torpedo',
        maxVoices: 4,
        reverb: 0.25,
        layers: [
          thump(70, 40, 80, 0.6, 70),
          noiseLayer('pink', [bp({ from: 3500, to: 700, ms: 300 }, 2)], { peak: 2.4, attackMs: 15, tauMs: 120 }, { jitter: { freq: 0.1 } }),
          ...splash(0.5, 320),
        ],
      },
    },
  ],
};

export const TORPEDO_RUN: CueSlot = {
  id: 'torpedoRun',
  title: 'Torpedo running (optional)',
  note: 'A short excerpt of a torpedo running through the water. Optional to ship: if none of these is right, the game simply stays quiet here.',
  candidates: [
    {
      id: 'B',
      label: 'Low propeller hum',
      blurb: 'A lower buzzing hum with a quick flutter, closer to a motor than a whistle.',
      recipe: { gain: 0.22,
        family: 'torpedoRun',
        maxVoices: 2,
        layers: [
          tone(420, { peak: 0.12, attackMs: 400, holdMs: 2000, tauMs: 200 }, { filters: [lp(900)], am: { rateHz: 25, depth: 0.6 } }, 'triangle'),
          noiseLayer('pink', [bp(800, 1.5)], { peak: 0.6, attackMs: 400, holdMs: 2000, tauMs: 200 }, { am: { rateHz: 25, depth: 0.5 } }),
        ],
      },
    },
  ],
};
export const MINE_DROP: CueSlot = {
  id: 'mineDrop',
  title: 'Mine dropped',
  note: 'You drop a mine off the stern (any of the mine lines).',
  today: 'fireMine',
  candidates: [
    {
      id: 'C',
      label: 'Rack clunk, big splash',
      blurb: 'A dull steel clunk as the rack releases, then a bigger, deeper splash.',
      recipe: { gain: 0.33,
        family: 'mine',
        maxVoices: 3,
        reverb: 0.2,
        layers: [metalRing(220, STEEL.slice(0, 3), 20, 5, 90), thump(120, 70, 50, 0.4, 40), ...splash(0.7, 260)],
      },
    },
  ],
};
