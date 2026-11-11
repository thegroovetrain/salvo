// Round 4 (Eric 2026-11-11): the SAD TROMBONE and the AIRHORN, rebuilt from
// his notes. Trombone: "it doesn't sound much like a trombone ... too fast" —
// slower, brassy notes that slide into each other. Airhorn: "I do want that
// party meme horn sound" — the hand-held compressed-air horn, harsh and
// bright, with a little air noise only at each onset. Both stay under the
// game's 3 s horn ceiling (`MAX_HORN_S`).

import type { Echo, Layer, Sweep } from '../recipe.js';
import type { CueCandidate, CueSlot } from './types.js';
import { filters, noiseLayer } from './parts.js';

const { lp, hp, bp } = filters;

const NOTE = 'A horn a player can choose in the game (the horn rules do not change). Compare with today’s horn.';

const take = (id: string, label: string, blurb: string, layers: Layer[], echoes?: readonly Echo[], gain = 1): CueCandidate => ({
  id,
  label,
  blurb,
  recipe: { gain, family: 'horn', maxVoices: 3, reverb: 0.15, layers, echoes },
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
  mute?: Sweep;
  /** Level swells on the last note (a plunger working it: "wah-wah-wah"). */
  lastAm?: { rateHz: number; depth: number };
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
    filters: s.mute ? [lp(s.bright, 1.5), lp(s.mute, 1)] : [lp(s.bright, 1.5)],
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
/** Bass trombone, an octave down. */
const BASS = TENOR.map((hz) => hz / 2);

const OPEN_BRIGHT: Sweep = { from: 2800, to: 900, tauMs: 260 };

export const HORN_TROMBONE: CueSlot = {
  id: 'hornTrombone',
  title: 'Horn: Sad Trombone',
  note: `${NOTE} Silly on purpose: the four falling notes, "wah wah wah waaah", slower than before.`,
  todayHorn: true,
  candidates: [
    take(
      'A',
      'Slide trombone',
      'A real-sounding trombone: four slow falling notes that slide into each other, the last one long, wobbling and sagging.',
      trombone(fall(TENOR, 450, 1100), { slideTauMs: 45, bright: OPEN_BRIGHT, peak: 0.3 }),
    ),
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
    take(
      'C',
      'Lazy bass trombone',
      'Lower and even slower, with lazier slides: a big, glum bass trombone.',
      trombone(fall(BASS, 520, 1000), { slideTauMs: 90, bright: { from: 1800, to: 600, tauMs: 320 }, peak: 0.36 }),
    ),
  ],
};

// --- the airhorn ---------------------------------------------------------

/** The two clashing reeds of a hand-held air horn, about half a semitone apart. */
const AIR_HZ = 488;
const AIR_CLASH = 1.03;
/** The reeds are driven hard for the harsh tone; this trims the whole horn back to the other horns' level. */
const AIR_LEVEL = 0.45;
/** How much the pitch sags as the can runs out of pressure on a long blast. */
const AIR_SAG = 0.96;

/** One blast: two harsh reeds (square + sawtooth) driven hard through a resonant peak, with a puff of air at the onset. */
function blast(startMs: number, holdMs: number, hz = AIR_HZ, sag = 1): Layer[] {
  const reed = (h: number, wave: 'square' | 'sawtooth'): Layer => ({
    source: { kind: 'osc', wave, freq: sag < 1 ? { from: h, to: h * sag, ms: holdMs + 60 } : h },
    filters: [lp(2400, 6), hp(250)],
    env: { peak: 0.22, attackMs: 4, holdMs, tauMs: 35 },
    drive: 4,
    startMs,
  });
  const puff = noiseLayer('white', [hp(1500)], { peak: 0.25, attackMs: 0, tauMs: 18 }, { startMs });
  return [reed(hz, 'square'), reed(hz * AIR_CLASH, 'sawtooth'), puff];
}

export const HORN_AIRHORN: CueSlot = {
  id: 'hornAirhorn',
  title: 'Horn: Airhorn',
  note: `${NOTE} The party meme horn: a hand-held compressed-air horn.`,
  todayHorn: true,
  candidates: [
    take('A', 'Bap-bap-bap-baaaap', 'The classic party air horn: three quick stabs and one long blast that sags at the end.', [
      ...blast(0, 90),
      ...blast(170, 90),
      ...blast(340, 90),
      ...blast(510, 1400, AIR_HZ, AIR_SAG),
    ], undefined, AIR_LEVEL),
    take('B', 'One long blast', 'A single long, loud, obnoxious blast, sagging as the can runs out.', blast(0, 2300, AIR_HZ, AIR_SAG), undefined, AIR_LEVEL),
    take(
      'C',
      'Dancehall stutter',
      'Four quick stabs climbing in pitch, then a short echo of the whole thing, like a reggae sound system.',
      [...blast(0, 70, 440), ...blast(130, 70, 466), ...blast(260, 70, 494), ...blast(390, 260, 523)],
      [{ delayMs: 760, gain: 0.5, lowpassHz: 3500 }],
      AIR_LEVEL,
    ),
  ],
};
