// Round 3 (Eric 2026-11-11): the five PLAYER-SELECTABLE horn voices —
// Foghorn, Whistle, Bell, Sad Trombone, Airhorn. Every take is clean: pure
// oscillators and filters, no hiss, no breath, no static (his note on the
// round-2 horns: "too much static?"). Each is loud and prominent like today's
// horn and about two seconds or less. The foghorn's RULES do not change; only
// the voices a player can choose from.

import type { Layer } from '../recipe.js';
import type { CueCandidate, CueSlot } from './types.js';
import { bell, filters, tone } from './parts.js';

const { lp } = filters;

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface StackOpts {
  peak: number;
  holdMs: number;
  startMs?: number;
  attackMs?: number;
  tauMs?: number;
  /** Lowpass, Hz — a number, or a moving "wah". */
  lowpass?: number | { from: number; to: number; ms: number };
  /** Start this fraction below pitch and rise to it (a whistle's quick rise). */
  scoop?: number;
  scoopMs?: number;
  vibrato?: { rateHz: number; depth: number };
  drive?: number;
}

/** One clean partial per pitch, all sharing an envelope and filter. */
function stack(hzs: readonly number[], wave: Wave, o: StackOpts): Layer[] {
  return hzs.map((hz): Layer => ({
    source: {
      kind: 'osc',
      wave,
      freq: o.scoop ? { from: hz * (1 - o.scoop), to: hz, ms: o.scoopMs ?? 120 } : hz,
      vibrato: o.vibrato,
    },
    filters: o.lowpass !== undefined ? [lp(o.lowpass)] : [],
    env: { peak: o.peak, attackMs: o.attackMs ?? 40, holdMs: o.holdMs, tauMs: o.tauMs ?? 90 },
    startMs: o.startMs,
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

const NOTE = 'A horn a player can choose in the game (the horn rules do not change). Compare with today’s horn.';

export const HORN_FOGHORN: CueSlot = {
  id: 'hornFoghorn',
  title: 'Horn: Foghorn',
  note: NOTE,
  todayHorn: true,
  candidates: [
    take('A', 'Ocean liner, two notes', 'Two deep notes sounding together, each slowly wavering, like a big passenger liner.', [
      ...stack(beating([110, 138.6], 0.8), 'sawtooth', { peak: 0.14, holdMs: 1300, attackMs: 220, tauMs: 140, lowpass: 900 }),
      ...stack([220], 'triangle', { peak: 0.08, holdMs: 1300, attackMs: 220, tauMs: 140 }),
    ]),
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
    take('A', 'Steam whistle chord', 'A clean three-note ship’s whistle that slides up into pitch at the start.', [
      ...stack([330, 415, 494], 'triangle', { peak: 0.2, holdMs: 1300, attackMs: 60, tauMs: 110, scoop: 0.12, lowpass: 2500 }),
    ]),
    take('B', 'Tug whistle', 'A higher, brighter little tugboat whistle.', [
      ...stack([587, 740, 880], 'triangle', { peak: 0.18, holdMs: 1000, attackMs: 40, tauMs: 90, scoop: 0.1, scoopMs: 90, lowpass: 3500 }),
    ]),
    take('C', 'Deep steam whistle', 'A lower, fuller whistle chord, closer to a big steamer.', [
      ...stack([196, 247, 294], 'sawtooth', { peak: 0.14, holdMs: 1300, attackMs: 70, tauMs: 110, scoop: 0.1, lowpass: 1300 }),
    ]),
  ],
};

/** A bell from summed partials (hum, prime, tierce, quint, nominal…), higher ones dying faster. */
function partialBell(hz: number, peak: number, onsetsMs: readonly number[]): Layer[] {
  const ratios = [0.5, 1, 1.19, 1.5, 2, 2.5, 3];
  return ratios.map((r, i) => tone(hz * r, { peak: peak / (1 + i * 0.4), attackMs: 2, tauMs: 1200 / (0.6 + r) }, { grains: { onsetsMs } }));
}

export const HORN_BELL: CueSlot = {
  id: 'hornBell',
  title: 'Horn: Bell',
  note: NOTE,
  todayHorn: true,
  candidates: [
    take('A', "Ship's bell, two strikes", 'A bright, clear ship’s bell struck twice, "ding-ding", ringing on.', [bell(620, 0.35, 900, { grains: { onsetsMs: [0, 330] } })]),
    take('B', 'Church-style bell', 'A deeper, richer bell with many ringing tones, struck twice.', partialBell(520, 0.18, [0, 360])),
  ],
};
