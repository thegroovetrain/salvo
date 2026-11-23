// The shipped special-shell takes Eric picked (Story 10.13, epic-10 amendment 22; research §6), one pair of
// slots per live special-shell line in the catalog (Stories 10.5 / 10.6): STAR SHELLS, PHOSPHOR SHELLS,
// FOULING SHELL, FLASH SHELLS. Each picked take was one recipe — a muffled launch, then the shell's own burst
// at a fixed 800 ms — but a real shell's flight time depends on range. Since epic-12 amendment 16 each take is
// SPLIT, its layers unchanged: the `…_SHELL` slot is the launch alone (played on firing), the `…_BURST` slot is
// the burst alone with its layers moved to start at 0 (played by net/roomBindings.ts when our shell bursts).

import type { Layer } from '../recipe.js';
import type { CueSlot } from './types.js';
import { bark, bubbles, crack, filters, hiss, metalRing, noiseLayer, splash } from './parts.js';

const { lp, hp, bp } = filters;

/** The secondary bark at −6 dB through a 1 kHz lowpass (§6). */
const launch = (): Layer[] => bark(0.5, 1000);

const SHELL = { family: 'shell', maxVoices: 4 } as const;

export const STAR_SHELL: CueSlot = {
  id: 'starShell',
  title: 'Star shell (launch)',
  note: 'You fire STAR SHELLS: the launch. The flare plays separately, when the shell bursts.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'A',
      label: 'Launch pop',
      blurb: 'A muffled gun pop.',
      recipe: { gain: 0.51, ...SHELL, reverb: 0.35, layers: [...launch()] },
    },
  ],
};

export const STAR_BURST: CueSlot = {
  id: 'starShellBurst',
  title: 'Star shell (burst)',
  note: 'Your STAR SHELL ignites high above the water, whenever it reaches the end of its path.',
  candidates: [
    {
      id: 'A',
      label: 'Fizzing flare',
      blurb: 'A soft pop overhead and a long fizzing hiss as the flare burns.',
      recipe: { gain: 0.51,
        ...SHELL,
        reverb: 0.35,
        layers: [
          noiseLayer('white', [bp(1400, 1)], { peak: 0.5, attackMs: 1, tauMs: 40 }, { startMs: 0 }),
          hiss(2500, 0.12, 1800, 300, { startMs: 30 }),
        ],
      },
    },
  ],
};

export const PHOSPHOR_SHELL: CueSlot = {
  id: 'phosphorShell',
  title: 'Phosphor shell (launch)',
  note: 'You fire PHOSPHOR SHELLS: the launch. The flame plays separately, when the shell bursts.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'B',
      label: 'Launch pop',
      blurb: 'A muffled gun pop.',
      recipe: { gain: 0.15, ...SHELL, reverb: 0.35, layers: [...launch()] },
    },
  ],
};

export const PHOSPHOR_BURST: CueSlot = {
  id: 'phosphorShellBurst',
  title: 'Phosphor shell (burst)',
  note: 'Your PHOSPHOR SHELL bursts into a burning patch on the water, whenever it reaches the end of its path.',
  candidates: [
    {
      id: 'A',
      label: 'Whoomp of flame',
      blurb: 'A deep whoomp like gas catching fire, and a low roar that dies away.',
      recipe: { gain: 0.15,
        ...SHELL,
        reverb: 0.35,
        layers: [
          noiseLayer('pink', [lp({ from: 200, to: 1400, ms: 250 }, 1.2)], { peak: 2.2, attackMs: 60, tauMs: 260 }, { startMs: 0 }),
          noiseLayer('brown', [lp(350)], { peak: 0.9, attackMs: 120, holdMs: 600, tauMs: 500 }, { startMs: 80, am: { rateHz: 3, depth: 0.4, jitter: 0.3 } }),
        ],
      },
    },
  ],
};

export const FOULING_SHELL: CueSlot = {
  id: 'foulingShell',
  title: 'Fouling shell (launch)',
  note: 'You fire the FOULING SHELL: the launch. The splash plays separately, when the shell lands.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'A',
      label: 'Launch pop',
      blurb: 'A muffled gun pop.',
      recipe: { gain: 0.48, ...SHELL, reverb: 0.25, layers: [...launch()] },
    },
  ],
};

export const FOULING_BURST: CueSlot = {
  id: 'foulingShellBurst',
  title: 'Fouling shell (burst)',
  note: 'Your FOULING SHELL lands in the water to foul propellers, whenever it reaches the end of its path.',
  candidates: [
    {
      id: 'A',
      label: 'Wet gloop',
      blurb: 'A thick wet splash with a downward gloop and a cluster of bubbles.',
      recipe: { gain: 0.48,
        ...SHELL,
        reverb: 0.25,
        layers: [
          ...splash(0.5, 0),
          noiseLayer('white', [bp({ from: 800, to: 250, ms: 200 }, 5)], { peak: 1.6, attackMs: 10, tauMs: 90 }, { startMs: 40 }),
          bubbles(10, 600, 0.12, 80),
        ],
      },
    },
  ],
};

export const FLASH_SHELL: CueSlot = {
  id: 'flashShell',
  title: 'Flash shell (launch)',
  note: 'You fire FLASH SHELLS: the launch. The flash plays separately, when the shell bursts.',
  today: 'fireStarShells',
  candidates: [
    {
      id: 'B',
      label: 'Launch pop',
      blurb: 'A muffled gun pop.',
      recipe: { gain: 0.15, ...SHELL, reverb: 0.5, layers: [...launch()] },
    },
  ],
};

export const FLASH_BURST: CueSlot = {
  id: 'flashShellBurst',
  title: 'Flash shell (burst)',
  note: 'Your FLASH SHELL goes off in a blinding flash, whenever it reaches the end of its path.',
  candidates: [
    {
      id: 'A',
      label: 'Magnesium crack and ring',
      blurb: 'A very sharp crack with a high glassy ring hanging in the air.',
      recipe: { gain: 0.15,
        ...SHELL,
        reverb: 0.5,
        layers: [
          crack(3500, 0.9, 15, { startMs: 0 }),
          metalRing(2800, [1, 1.52, 2.31], 60, 14, 600, { startMs: 0 }),
          noiseLayer('white', [hp(5000)], { peak: 0.08, attackMs: 20, holdMs: 400, tauMs: 200 }, { startMs: 20 }),
        ],
      },
    },
  ],
};
