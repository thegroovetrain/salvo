// Torpedo and mine candidates (Story 10.13 wave A; research §4, §5).

import type { Layer } from '../recipe.js';
import type { CueSlot } from './types.js';
import { bubbles, filters, metalRing, noiseLayer, splash, STEEL, thump, tone } from './parts.js';

const { lp, hp, bp } = filters;

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
    {
      id: 'B',
      label: 'Steel tube kick',
      blurb: 'A hard metal clank from the launch tube and a long hiss of escaping air, no splash.',
      recipe: { gain: 0.3,
        family: 'torpedo',
        maxVoices: 4,
        reverb: 0.2,
        layers: [
          metalRing(190, STEEL.slice(0, 4), 30, 9, 120, { jitter: { freq: 0.08 } }),
          thump(90, 50, 60, 0.6, 50),
          noiseLayer('white', [hp(1800), lp(7000)], { peak: 0.35, attackMs: 10, holdMs: 120, tauMs: 220 }, { startMs: 20 }),
        ],
      },
    },
    {
      id: 'C',
      label: 'Underwater thunk',
      blurb: 'A muffled deep thunk with a burst of bubbles, as if heard from below the waterline.',
      recipe: { gain: 0.3,
        family: 'torpedo',
        maxVoices: 4,
        reverb: 0.15,
        layers: [
          thump(80, 35, 120, 0.8, 90),
          noiseLayer('brown', [lp(500)], { peak: 1.2, attackMs: 3, tauMs: 140 }),
          bubbles(12, 500, 0.12, 40),
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
      id: 'A',
      label: 'Faint screw whine',
      blurb: 'A thin high whine with a fast fluttering hiss, like a small propeller spinning hard.',
      recipe: { gain: 0.15,
        family: 'torpedoRun',
        maxVoices: 2,
        layers: [
          tone(1650, { peak: 0.09, attackMs: 400, holdMs: 2000, tauMs: 200 }, { filters: [lp(2500)], jitter: { freq: 0.05 } }),
          noiseLayer('white', [hp(2000), lp(2500)], { peak: 0.5, attackMs: 400, holdMs: 2000, tauMs: 200 }, { am: { rateHz: 40, depth: 0.8 } }),
        ],
      },
    },
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

/** A plop with a gurgle (§5 A), starting at `startMs`. */
function plop(startMs: number, scale = 1): Layer[] {
  return [
    noiseLayer('white', [lp(900)], { peak: 0.8 * scale, attackMs: 1, tauMs: 40 }, { startMs }),
    tone({ from: 140, to: 224, ms: 120 }, { peak: 0.55 * scale, attackMs: 10, tauMs: 90 }, { startMs }),
    bubbles(6, 400, 0.12 * scale, startMs + 40),
    noiseLayer('brown', [bp(300, 0.7)], { peak: 1.6 * scale, attackMs: 10, tauMs: 300 }, { startMs }),
  ];
}

/** 16 chain links rattling over ~500 ms (§5 chain rattle). */
const CHAIN_ONSETS = Array.from({ length: 16 }, (_, i) => i * 31);

export const MINE_DROP: CueSlot = {
  id: 'mineDrop',
  title: 'Mine dropped',
  note: 'You drop a mine off the stern (any of the mine lines).',
  today: 'fireMine',
  candidates: [
    {
      id: 'A',
      label: 'Plop and gurgle',
      blurb: 'A heavy plop into the water with a deep bloop and a few small bubbles, no chain.',
      recipe: { gain: 0.32, family: 'mine', maxVoices: 3, reverb: 0.15, layers: plop(0) },
    },
    {
      id: 'B',
      label: 'Chain rattle, then plop',
      blurb: 'A quick rattle of chain running out, then the same heavy plop and gurgle.',
      recipe: { gain: 0.37,
        family: 'mine',
        maxVoices: 3,
        reverb: 0.15,
        layers: [
          {
            source: { kind: 'click', ms: 6 },
            filters: [bp(3500, 12)],
            env: { peak: 4, attackMs: 0, tauMs: 15 },
            grains: { onsetsMs: CHAIN_ONSETS, jitterMs: 9, spread: [0.75, 1.3] },
          },
          ...plop(420),
        ],
      },
    },
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
