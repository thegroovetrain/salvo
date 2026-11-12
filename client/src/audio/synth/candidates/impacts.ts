// The shipped hit, miss and sinking takes Eric picked (Story 10.13, epic-10 amendment 22; research §7).

import type { Layer } from '../recipe.js';
import type { CueSlot } from './types.js';
import { bark, bubbles, crack, droplets, filters, metalRing, noiseLayer, STEEL, thump } from './parts.js';

const { lp, hp, bp } = filters;

/** The secondary bark stretched ×1.5 for an explosion body (§7). */
function blastBody(scale: number): Layer[] {
  return bark(scale).map((l) => (l.env.tauMs !== undefined ? { ...l, env: { ...l.env, tauMs: l.env.tauMs * 1.5 } } : l));
}

export const STEEL_HIT: CueSlot = {
  id: 'steelHit',
  title: 'Shell hits a ship',
  note: 'A shell striking a hull you can see, yours to watch out on the water.',
  today: 'impact',
  world: true,
  candidates: [
    {
      id: 'C',
      label: 'Punch-through',
      blurb: 'A sharp clang, then a muffled boom a split second later, like the shell bursting inside the ship.',
      recipe: { gain: 0.2,
        family: 'hit',
        maxVoices: 4,
        reverb: 0.3,
        layers: [
          crack(2500, 0.6, 15, { farCut: 0.5 }),
          metalRing(320, [1, 1.47, 2.09], 40, 16, 120, { jitter: { freq: 0.15 } }),
          thump(70, 35, 150, 0.8, 200, { startMs: 60 }),
          noiseLayer('brown', [lp(400)], { peak: 1.4, attackMs: 4, tauMs: 260 }, { startMs: 60 }),
        ],
      },
    },
  ],
};

/** Small metal debris clicks rattling down (§7 own hull hit). */
const debris = (count: number, windowMs: number, startMs: number) =>
  metalRing(6000, [1, 1.3], 20, 3, 20, { startMs, grains: { count, windowMs, thin: 0.6, spread: [0.8, 1.3] } });

export const OWN_HIT: CueSlot = {
  id: 'ownHit',
  title: 'Your hull is hit',
  note: 'Your own ship taking a shell. Heavier and closer than watching someone else get hit.',
  today: 'damage',
  candidates: [
    {
      id: 'A',
      label: 'Hull groan and sub thump',
      blurb: 'A deep thump you feel more than hear, with the hull groaning like a huge steel drum and debris rattling down.',
      recipe: { gain: 0.31,
        family: 'ownHit',
        maxVoices: 2,
        reverb: 0.2,
        layers: [
          thump(50, 25, 300, 1, 400, { drive: 3 }),
          metalRing(150, STEEL, 80, 30, 450, { jitter: { freq: 0.15 } }),
          ...blastBody(0.7),
          debris(8, 400, 80),
        ],
      },
    },
  ],
};

export const SPLASH: CueSlot = {
  id: 'splash',
  title: 'Shell misses (splash)',
  note: 'A shell falling into the water. Heard a lot, so it should stay modest.',
  today: 'splash',
  world: true,
  salvo: true,
  candidates: [
    {
      id: 'C',
      label: 'Big plume',
      blurb: 'A deeper, heavier slam of water that hangs in the air before it falls back for a long time.',
      recipe: { gain: 0.15,
        family: 'splash',
        maxVoices: 6,
        reverb: 0.3,
       
        layers: [
          thump(70, 40, 120, 0.6, 120),
          noiseLayer('brown', [lp({ from: 1200, to: 300, ms: 400 })], { peak: 1.4, attackMs: 8, tauMs: 320 }),
          noiseLayer('white', [bp({ from: 1800, to: 500, ms: 500 }, 0.8)], { peak: 0.6, attackMs: 20, tauMs: 260 }),
          droplets(110, 2000, 0.05, 400),
          noiseLayer('white', [hp(2500)], { peak: 0.06, attackMs: 200, holdMs: 600, tauMs: 350 }, { startMs: 350 }),
        ],
      },
    },
  ],
};

export const SINK_WITNESS: CueSlot = {
  id: 'sinkWitness',
  title: 'A ship sinks (extra)',
  note: 'A hull you can see going down. Not in the story’s list: an extra, offered because today’s sound for it is a short beep.',
  today: 'sunkWitness',
  world: true,
  candidates: [
    {
      id: 'A',
      label: 'Groan and rushing water',
      blurb: 'A long, low metal groan as the hull bends, with water rushing in and big bubbles breaking.',
      recipe: { gain: 0.74,
        family: 'sink',
        maxVoices: 2,
        reverb: 0.45,
        layers: [
          {
            source: { kind: 'osc', wave: 'sawtooth', freq: { from: 70, to: 42, ms: 3000 }, vibrato: { rateHz: 2.5, depth: 0.02 } },
            filters: [bp(260, 3)],
            env: { peak: 0.45, attackMs: 500, holdMs: 1200, tauMs: 700 },
          },
          metalRing(95, STEEL.slice(0, 4), 90, 22, 900, { startMs: 300 }),
          noiseLayer('pink', [bp(600, 0.7)], { peak: 1, attackMs: 600, holdMs: 1400, tauMs: 600 }, { am: { rateHz: 0.7, depth: 0.4 } }),
          bubbles(18, 3000, 0.1, 400, [0.15, 0.6]),
        ],
      },
    },
  ],
};
