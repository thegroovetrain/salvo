// The shipped selectable horn voices (Story 10.13, Eric 2026-11-11): Foghorn,
// Whistle and Bell. Every take is clean: pure oscillators and filters, no
// hiss, no breath, no static. Loud and prominent like the old horn and about
// two seconds or less.

import type { Layer } from '../recipe.js';
import type { CueCandidate, CueSlot } from './types.js';
import { bell, filters } from './parts.js';

const { lp } = filters;

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface StackOpts {
  peak: number;
  holdMs: number;
  attackMs?: number;
  tauMs?: number;
  /** Lowpass, Hz. */
  lowpass?: number;
  /** Start this fraction below pitch and rise to it (a whistle's quick rise). */
  scoop?: number;
  drive?: number;
}

/** One clean partial per pitch, all sharing an envelope and filter. */
function stack(hzs: readonly number[], wave: Wave, o: StackOpts): Layer[] {
  return hzs.map((hz): Layer => ({
    source: {
      kind: 'osc',
      wave,
      freq: o.scoop ? { from: hz * (1 - o.scoop), to: hz, ms: 120 } : hz,
    },
    filters: o.lowpass !== undefined ? [lp(o.lowpass)] : [],
    env: { peak: o.peak, attackMs: o.attackMs ?? 40, holdMs: o.holdMs, tauMs: o.tauMs ?? 90 },
    drive: o.drive,
  }));
}

/** Each pitch doubled a fraction of a hertz apart, so the pair beats slowly. */
const beating = (hzs: readonly number[], beatHz: number): number[] => hzs.flatMap((hz) => [hz, hz + beatHz]);

const HORN = { family: 'horn', maxVoices: 3, reverb: 0.2 } as const;

const take = (id: string, label: string, blurb: string, layers: Layer[]): CueCandidate => ({
  id,
  label,
  blurb,
  recipe: { gain: 1, ...HORN, layers },
});

const NOTE = 'A horn a player can choose in the game (the horn rules do not change). Compare with the old horn.';

export const HORN_FOGHORN: CueSlot = {
  id: 'hornFoghorn',
  title: 'Horn: Foghorn',
  note: NOTE,
  todayHorn: true,
  candidates: [
    take('B', 'Single deep horn', 'One very low, round horn note with a slow throb.', [
      ...stack(beating([73.4], 0.6), 'sawtooth', { peak: 0.22, holdMs: 1300, attackMs: 250, tauMs: 150, lowpass: 700, drive: 1.5 }),
      ...stack([146.8], 'triangle', { peak: 0.1, holdMs: 1300, attackMs: 250, tauMs: 150 }),
    ]),
  ],
};

export const HORN_WHISTLE: CueSlot = {
  id: 'hornWhistle',
  title: 'Horn: Whistle',
  note: NOTE,
  todayHorn: true,
  candidates: [
    take('C', 'Deep steam whistle', 'A lower, fuller whistle chord, closer to a big steamer.', [
      ...stack([196, 247, 294], 'sawtooth', { peak: 0.14, holdMs: 1300, attackMs: 70, tauMs: 110, scoop: 0.1, lowpass: 1300 }),
    ]),
  ],
};

export const HORN_BELL: CueSlot = {
  id: 'hornBell',
  title: 'Horn: Bell',
  note: NOTE,
  todayHorn: true,
  candidates: [
    take('A', "Ship's bell, two strikes", 'A bright, clear ship’s bell struck twice, "ding-ding", ringing on.', [bell(620, 0.35, 900, { grains: { onsetsMs: [0, 330] } })]),
  ],
};
