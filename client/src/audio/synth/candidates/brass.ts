// The shipped SAD TROMBONE horn (Story 10.13, Eric 2026-11-11: "Muted
// wah-wah"). It stays under the game's 3 s horn ceiling (`MAX_HORN_S`).

import type { Layer, Sweep } from '../recipe.js';
import type { CueCandidate, CueSlot } from './types.js';
import { filters } from './parts.js';

const { lp, bp } = filters;

const NOTE = 'A horn a player can choose in the game (the horn rules do not change). Compare with the old horn.';

const take = (id: string, label: string, blurb: string, layers: Layer[]): CueCandidate => ({
  id,
  label,
  blurb,
  recipe: { gain: 1, family: 'horn', maxVoices: 3, reverb: 0.15, layers },
});

// --- the trombone --------------------------------------------------------

/** One trombone note as written: pitch, when, how long it is held. */
interface TbNote {
  hz: number;
  startMs: number;
  holdMs: number;
}

interface TbStyle {
  /** How quickly each note slides from the previous pitch, ms (time constant). */
  slideTauMs: number;
  /** Lowpass on each note: bright "blat" at the start, darker as it settles. */
  bright: Sweep;
  /** Extra closing filter for the plunger-mute "wah" (open then closed on every note). */
  mute: Sweep;
  /** Level swells on the last note (a plunger working it: "wah-wah-wah"). */
  lastAm: { rateHz: number; depth: number };
  peak: number;
}

/** The last note: the pitch droops ~8 % as it wobbles (the "waaah" sagging away). */
const DROOP = 0.92;
const VIBRATO = { rateHz: 5, depth: 0.022 };
const FORMANT_HZ = 600;

/** Pitch path of note i: a scoop up from below on the first note, a slide down from the previous note after. */
function tbFreq(notes: readonly TbNote[], i: number, s: TbStyle): Sweep {
  const n = notes[i];
  if (i === 0) return { from: n.hz * 0.96, to: n.hz, tauMs: 40 };
  if (i === notes.length - 1) return { from: notes[i - 1].hz, to: n.hz * DROOP, tauMs: n.holdMs * 0.9 };
  return { from: notes[i - 1].hz, to: n.hz, tauMs: s.slideTauMs };
}

/** One note = the brassy body plus a formant bump around 600 Hz, sharing one pitch path. */
function tbNote(notes: readonly TbNote[], i: number, s: TbStyle): Layer[] {
  const n = notes[i];
  const last = i === notes.length - 1;
  const freq = tbFreq(notes, i, s);
  const source = { kind: 'osc' as const, wave: 'sawtooth' as const, freq, vibrato: last ? VIBRATO : undefined };
  const env = { peak: s.peak, attackMs: 30, holdMs: n.holdMs, tauMs: last ? 140 : 45 };
  const body: Layer = {
    source,
    filters: [lp(s.bright, 1.5), lp(s.mute, 1)],
    env,
    drive: 1.8,
    startMs: n.startMs,
    am: last ? s.lastAm : undefined,
  };
  const formant: Layer = { ...body, filters: [bp(FORMANT_HZ, 2.5)], env: { ...env, peak: s.peak * 0.8 }, drive: undefined };
  return [body, formant];
}

function trombone(notes: readonly TbNote[], s: TbStyle): Layer[] {
  return notes.flatMap((_, i) => tbNote(notes, i, s));
}

/** Four falling notes, the last one long: `shortMs` per short note, `lastMs` held. */
function fall(hzs: readonly number[], shortMs: number, lastMs: number): TbNote[] {
  return hzs.map((hz, i) => ({ hz, startMs: i * shortMs, holdMs: i === hzs.length - 1 ? lastMs : shortMs - 60 }));
}

/** Tenor trombone, a chromatic fall: Bb3, A3, Ab3, G3. */
const TENOR = [233.1, 220, 207.7, 196];

export const HORN_TROMBONE: CueSlot = {
  id: 'hornTrombone',
  title: 'Horn: Sad Trombone',
  note: `${NOTE} Silly on purpose: the four falling notes, "wah wah wah waaah", slower than before.`,
  todayHorn: true,
  candidates: [
    take(
      'B',
      'Muted wah-wah',
      'The same four notes through a plunger mute: every note goes "wah", and the last one goes "wah-wah-wah".',
      trombone(fall(TENOR, 500, 1100), {
        slideTauMs: 45,
        bright: { from: 400, to: 2600, ms: 160 },
        mute: { from: 9000, to: 450, tauMs: 260 },
        lastAm: { rateHz: 2.6, depth: 0.6 },
        peak: 0.38,
      }),
    ),
  ],
};
