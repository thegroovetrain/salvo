// Special-shell candidates (Story 10.13 wave A; research §6): one slot per live
// special-shell line in the catalog (Stories 10.5 / 10.6): STAR SHELLS,
// PHOSPHOR SHELLS, FOULING SHELL, FLASH SHELLS. Each candidate is the whole
// event as the firer hears it: a muffled launch, then the shell's own burst.

import type { Layer } from '../recipe.js';
import type { CueSlot } from './types.js';
import { bark, bubbles, crack, filters, hiss, metalRing, noiseLayer, splash } from './parts.js';

const { lp, hp, bp } = filters;

/** The secondary bark at −6 dB through a 1 kHz lowpass (§6). */
const launch = (): Layer[] => bark(0.5, 1000);

/** When the shell bursts after launch, ms. */
const BURST_MS = 800;

const SHELL = { family: 'shell', maxVoices: 4 } as const;

export const STAR_SHELL: CueSlot = {
  id: 'starShell',
  title: 'Star shell (launch and burst)',
  note: 'You fire STAR SHELLS: a launch, then the flare igniting high above the water.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'A',
      label: 'Pop, then fizzing flare',
      blurb: 'A muffled gun pop, then a soft pop overhead and a long fizzing hiss as the flare burns.',
      recipe: { gain: 0.51,
        ...SHELL,
        reverb: 0.35,
        layers: [
          ...launch(),
          noiseLayer('white', [bp(1400, 1)], { peak: 0.5, attackMs: 1, tauMs: 40 }, { startMs: BURST_MS }),
          hiss(2500, 0.12, 1800, 300, { startMs: BURST_MS + 30 }),
        ],
      },
    },
  ],
};

export const PHOSPHOR_SHELL: CueSlot = {
  id: 'phosphorShell',
  title: 'Phosphor shell (launch and burst)',
  note: 'You fire PHOSPHOR SHELLS: a launch, then the shell bursting into a burning patch on the water.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'B',
      label: 'Whoomp of flame',
      blurb: 'A pop, then a deep whoomp like gas catching fire, and a low roar that dies away.',
      recipe: { gain: 0.15,
        ...SHELL,
        reverb: 0.35,
        layers: [
          ...launch(),
          noiseLayer('pink', [lp({ from: 200, to: 1400, ms: 250 }, 1.2)], { peak: 2.2, attackMs: 60, tauMs: 260 }, { startMs: BURST_MS }),
          noiseLayer('brown', [lp(350)], { peak: 0.9, attackMs: 120, holdMs: 600, tauMs: 500 }, { startMs: BURST_MS + 80, am: { rateHz: 3, depth: 0.4, jitter: 0.3 } }),
        ],
      },
    },
  ],
};

export const FOULING_SHELL: CueSlot = {
  id: 'foulingShell',
  title: 'Fouling shell (launch and burst)',
  note: 'You fire the FOULING SHELL: a launch, then the shell landing in the water to foul propellers.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'A',
      label: 'Wet gloop',
      blurb: 'A pop, then a thick wet splash with a downward gloop and a cluster of bubbles.',
      recipe: { gain: 0.48,
        ...SHELL,
        reverb: 0.25,
        layers: [
          ...launch(),
          ...splash(0.5, BURST_MS),
          noiseLayer('white', [bp({ from: 800, to: 250, ms: 200 }, 5)], { peak: 1.6, attackMs: 10, tauMs: 90 }, { startMs: BURST_MS + 40 }),
          bubbles(10, 600, 0.12, BURST_MS + 80),
        ],
      },
    },
  ],
};

export const FLASH_SHELL: CueSlot = {
  id: 'flashShell',
  title: 'Flash shell (launch and burst)',
  note: 'You fire FLASH SHELLS: a launch, then the blinding flash going off.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'B',
      label: 'Magnesium crack and ring',
      blurb: 'A pop, then a very sharp crack with a high glassy ring hanging in the air.',
      recipe: { gain: 0.15,
        ...SHELL,
        reverb: 0.5,
        layers: [
          ...launch(),
          crack(3500, 0.9, 15, { startMs: BURST_MS }),
          metalRing(2800, [1, 1.52, 2.31], 60, 14, 600, { startMs: BURST_MS }),
          noiseLayer('white', [hp(5000)], { peak: 0.08, attackMs: 20, holdMs: 400, tauMs: 200 }, { startMs: BURST_MS + 20 }),
        ],
      },
    },
  ],
};
