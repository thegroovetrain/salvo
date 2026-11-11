// Round 2 (Eric 2026-11-11, "re-voice everything"): what happens TO the ship
// itself — scraping, burning, fouled screws, being dazzled — and the far-off
// "your shot connected" call.

import type { CueSlot } from './types.js';
import { crack, crackles, filters, groan, noiseLayer, thump, tone } from './parts.js';

const { lp, hp, bp } = filters;

export const RAM_GRIND: CueSlot = {
  id: 'ramGrind',
  title: 'Hull scraping (ramming)',
  note: 'Your hull sliding against another ship or a coast. This is a 1.2-second excerpt: in the game it keeps going for as long as the scrape lasts.',
  today: 'grind',
  candidates: [
    {
      id: 'A',
      label: 'Steel shriek and grind',
      blurb: 'A high shriek of steel on steel over a low, rough grinding.',
      recipe: {
        gain: 0.39,
        family: 'grind',
        maxVoices: 1,
        layers: [
          tone(950, { peak: 0.1, attackMs: 80, holdMs: 1000, tauMs: 60 }, {
            source: { kind: 'osc', wave: 'sawtooth', freq: 950, vibrato: { rateHz: 7, depth: 0.03 } },
            filters: [bp(1900, 6)],
            am: { rateHz: 3, depth: 0.6, jitter: 0.4 },
          }),
          noiseLayer('brown', [lp(320)], { peak: 1.6, attackMs: 60, holdMs: 1000, tauMs: 60 }, { am: { rateHz: 13, depth: 0.7, jitter: 0.3 } }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Dull crunching grind',
      blurb: 'A heavy, duller crunch and rumble, like a hull riding over rock.',
      recipe: {
        gain: 0.32,
        family: 'grind',
        maxVoices: 1,
        layers: [
          noiseLayer('brown', [lp(500)], { peak: 1.8, attackMs: 60, holdMs: 1000, tauMs: 60 }, { am: { rateHz: 18, depth: 0.8, jitter: 0.4 } }),
          { ...crackles(30, 1100, 3, 40), filters: [bp(300, 3)] },
        ],
      },
    },
    {
      id: 'C',
      label: 'Groan and scrape',
      blurb: 'The hull groaning low while plating scrapes along its side.',
      recipe: {
        gain: 0.75,
        family: 'grind',
        maxVoices: 1,
        layers: [
          groan(62, 55, 1100, 0.5, { env: { peak: 0.5, attackMs: 80, holdMs: 1000, tauMs: 60 } }),
          noiseLayer('white', [bp(2500, 2)], { peak: 0.6, attackMs: 60, holdMs: 1000, tauMs: 60 }, { am: { rateHz: 9, depth: 0.7, jitter: 0.4 } }),
        ],
      },
    },
  ],
};

export const BURNING: CueSlot = {
  id: 'burning',
  title: 'Burning damage',
  note: 'A damage tick while you sit in a burning patch. Repeats often, so it stays short.',
  today: 'burn',
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: 'Fire puff',
      blurb: 'A soft "whuff" of flame with a few crackles.',
      recipe: {
        gain: 0.31,
        family: 'burn',
        maxVoices: 3,
        layers: [noiseLayer('pink', [lp({ from: 300, to: 1500, ms: 80 })], { peak: 1.2, attackMs: 15, tauMs: 60 }), crackles(6, 250, 2.5, 10)],
      },
    },
    {
      id: 'B',
      label: 'Steam hiss on hot steel',
      blurb: 'A short hiss like water spitting on hot steel.',
      recipe: {
        gain: 0.35,
        family: 'burn',
        maxVoices: 3,
        layers: [noiseLayer('white', [hp(2500)], { peak: 0.4, attackMs: 8, holdMs: 120, tauMs: 70 }, { am: { rateHz: 30, depth: 0.4 } }), crackles(3, 150, 2, 0)],
      },
    },
  ],
};

export const HIT_CALL: CueSlot = {
  id: 'hitCall',
  title: 'Your shot connected',
  note: 'Something you fired hit, possibly somewhere you cannot see.',
  today: 'hitCall',
  candidates: [
    {
      id: 'A',
      label: 'Far boom rolling back',
      blurb: 'A muffled, distant boom that rolls back across the water.',
      recipe: {
        gain: 0.28,
        family: 'hitCall',
        maxVoices: 2,
        reverb: 0.5,
        layers: [thump(55, 30, 200, 0.8, 220, { filters: [lp(300)] }), noiseLayer('brown', [lp(250)], { peak: 1.2, attackMs: 25, tauMs: 300 })],
      },
    },
    {
      id: 'B',
      label: 'Dull double thump',
      blurb: 'Two quick, dull thumps, like a hit and the blast inside it, heard from far off.',
      recipe: {
        gain: 0.31,
        family: 'hitCall',
        maxVoices: 2,
        reverb: 0.3,
        layers: [
          thump(70, 40, 80, 0.7, 90, { grains: { onsetsMs: [0, 150] } }),
          noiseLayer('brown', [lp(350)], { peak: 1, attackMs: 5, tauMs: 90 }, { grains: { onsetsMs: [0, 150] } }),
        ],
      },
    },
  ],
};

export const PROP_FOULED: CueSlot = {
  id: 'propFouled',
  title: 'Propellers fouled',
  note: 'Something fouls your propellers and the ship slows down.',
  today: 'slowed',
  candidates: [
    {
      id: 'A',
      label: 'Engine bogging down',
      blurb: 'The engine note sagging and laboring while the shaft shudders.',
      recipe: {
        gain: 0.35,
        family: 'slowed',
        maxVoices: 1,
        reverb: 0.1,
        layers: [
          tone({ from: 60, to: 32, ms: 700 }, { peak: 0.5, attackMs: 30, holdMs: 400, tauMs: 200 }, { filters: [lp(350)], am: { rateHz: 8, depth: 0.6 }, drive: 2 }, 'sawtooth'),
          noiseLayer('brown', [lp(200)], { peak: 1, attackMs: 30, holdMs: 400, tauMs: 200 }, { am: { rateHz: 8, depth: 0.6 } }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Rope thrashing the screw',
      blurb: 'A rough, flapping thrash under the stern, like line wrapped round a spinning propeller.',
      recipe: {
        gain: 0.55,
        family: 'slowed',
        maxVoices: 1,
        reverb: 0.1,
        layers: [
          noiseLayer('brown', [bp(400, 1.2)], { peak: 2.5, attackMs: 20, holdMs: 600, tauMs: 150 }, { am: { rateHz: 12, depth: 0.9, jitter: 0.3, wave: 'square' } }),
          { ...crackles(14, 700, 2.5, 0), filters: [bp(220, 3)] },
        ],
      },
    },
  ],
};

export const DAZZLED: CueSlot = {
  id: 'dazzled',
  title: 'Dazzled by a flash shell',
  note: 'A flash shell goes off near you and blinds you for a moment.',
  today: 'dazzled',
  candidates: [
    {
      id: 'A',
      label: 'Ears ringing',
      blurb: 'A muffled thump, then a thin high ringing in your ears that fades.',
      recipe: {
        gain: 0.43,
        family: 'dazzled',
        maxVoices: 1,
        layers: [
          thump(90, 45, 80, 0.6, 70, { filters: [lp(400)] }),
          tone(3800, { peak: 0.05, attackMs: 40, holdMs: 400, tauMs: 450 }, { source: { kind: 'osc', wave: 'sine', freq: 3800, vibrato: { rateHz: 5, depth: 0.002 } } }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Crack, then ringing',
      blurb: 'A sharp crack, then two high tones wavering against each other as your ears ring.',
      recipe: {
        gain: 0.38,
        family: 'dazzled',
        maxVoices: 1,
        reverb: 0.1,
        layers: [
          crack(3000, 0.7, 15),
          tone(2900, { peak: 0.1, attackMs: 20, holdMs: 300, tauMs: 500 }),
          tone(2913, { peak: 0.1, attackMs: 20, holdMs: 300, tauMs: 500 }),
        ],
      },
    },
  ],
};
