// Round 4 (Eric 2026-11-11): the SAD TROMBONE (he picked B, "Muted wah-wah")
// and the AIRHORN. Both stay under the game's 3 s horn ceiling (`MAX_HORN_S`).
//
// ROUND 5 AIRHORN RESEARCH ("the airhorn still sounds nothing like the party
// airhorn"). Sources are THIN — no source gives a measured spectrum or
// fundamental for the classic dancehall / "MLG" sample or for canister horns:
//   • KVR "To Synthesize an Air Horn" (kvraudio.com/forum/viewtopic.php?t=182090):
//     start from a bright, powerful BRASS patch; DROP THE PITCH at the start of
//     the note; keep the AMP ENVELOPE FLAT; heavy distortion was suggested but
//     the one person who built it said it "didn't add much"; envelopes should
//     be quick; much of the perceived pitch movement is REVERB/room.
//   • howtomakeelectronicmusic.com "harder style beat in FL Studio" (the only
//     full recipe found): 3xOsc, two SAWS detuned -40 / +40 CENTS (a chorus-y
//     stack, not a semitone clash), base note E4, layered an octave up (quieter)
//     and down; overdrive; +6.5 dB presence boost near 8 kHz; a trance gate
//     chops it into stabs; a heavy DELAY (72 % mix); no filter; a 17.6 ms Haas
//     widening.
//   • samplefocus.com "MLG Air Horn SFX" (uploader tags, unverified): key G,
//     about 3 s long.
//   • Wikipedia "Air horn": the sample is a reggae / dancehall staple for four
//     decades, popularized in hip hop by DJ Cipha Sounds (Hot 97, 2001); pitch
//     is set by the horn's length.
//   • Practical Sailor "Handheld Horns & Whistles": canister horns measure
//     115-124 dB at 1 m and their TONE FALLS OFF as the can empties.
// What the earlier takes missed, per these: the chorus-detuned saw STACK with
// octave doubling (not two reeds a semitone apart), the quick pitch DROP into
// each blast, a FLAT sustained level, bright presence, and the echo.

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

// --- the airhorn (round 5) ---------------------------------------------------

/** Cents → frequency ratio. */
const cents = (c: number): number => 2 ** (c / 1200);

/** The classic stack: the note detuned -40 / 0 / +40 cents, plus an octave below and a quieter octave above. */
const MEME_STACK: ReadonlyArray<{ ratio: number; peak: number }> = [
  { ratio: cents(-40), peak: 0.16 },
  { ratio: 1, peak: 0.16 },
  { ratio: cents(40), peak: 0.16 },
  { ratio: 0.5, peak: 0.12 },
  { ratio: 2, peak: 0.06 },
];
/** G4 — the key the uploaded "MLG" sample is tagged with (unverified). */
const MEME_HZ = 392;
/** Each blast starts this much sharp and drops onto the note in DROP_MS. */
const DROP = 1.07;
const DROP_MS = 70;

/** One blast of the stack: flat level, a quick pitch drop into the note, driven, with a bright presence copy on top. */
function hornBlast(startMs: number, holdMs: number, hz = MEME_HZ): Layer[] {
  const env = { peak: 0, attackMs: 6, holdMs, tauMs: 30 };
  const body = MEME_STACK.map(
    (v): Layer => ({
      source: { kind: 'osc', wave: 'sawtooth', freq: { from: hz * v.ratio * DROP, to: hz * v.ratio, ms: DROP_MS } },
      env: { ...env, peak: v.peak },
      drive: 2.5,
      startMs,
    }),
  );
  // The "+6.5 dB near 8 kHz" presence boost, approximated as a highpassed copy of the middle voice.
  const presence: Layer = {
    source: { kind: 'osc', wave: 'sawtooth', freq: { from: hz * DROP, to: hz, ms: DROP_MS } },
    filters: [hp(4000)],
    env: { ...env, peak: 0.12 },
    startMs,
  };
  return [...body, presence];
}

/** The dancehall echo: a strong first repeat and a fainter second one. */
const DANCEHALL_ECHO: readonly Echo[] = [
  { delayMs: 375, gain: 0.45, lowpassHz: 6000 },
  { delayMs: 750, gain: 0.2, lowpassHz: 4000 },
];

/** A real canister horn: two buzzing reed tones, a puff of air, the tone sagging as the can empties. */
function canBlast(holdMs: number): Layer[] {
  const reed = (hz: number, wave: 'sawtooth' | 'square', peak: number): Layer => ({
    source: { kind: 'osc', wave, freq: { from: hz, to: hz * 0.95, ms: holdMs } },
    filters: [lp(5000, 3)],
    env: { peak, attackMs: 15, holdMs, tauMs: 60 },
    drive: 3,
  });
  return [reed(440, 'sawtooth', 0.2), reed(440 * cents(25), 'sawtooth', 0.2), reed(880, 'square', 0.06), noiseLayer('white', [hp(2000)], { peak: 0.15, attackMs: 0, tauMs: 25 })];
}

export const HORN_AIRHORN: CueSlot = {
  id: 'hornAirhorn',
  title: 'Horn: Airhorn',
  note: `${NOTE} The party / dancehall air horn, rebuilt from how producers make it: a stack of detuned brassy saws with octave doubling, a quick pitch drop into each blast, a flat level and an echo.`,
  todayHorn: true,
  candidates: [
    take(
      'A',
      'Dancehall meme horn',
      'The DJ air horn: "BWAAAP, bwap-bwap, BWAAAAAP", with the echo bouncing after it.',
      [...hornBlast(0, 420), ...hornBlast(520, 110), ...hornBlast(720, 110), ...hornBlast(920, 950)],
      DANCEHALL_ECHO,
      0.63,
    ),
    take(
      'B',
      'Bap-bap-baaaap',
      'The same horn and echo, as two quick stabs and one long blast.',
      [...hornBlast(0, 110), ...hornBlast(190, 110), ...hornBlast(380, 1100)],
      DANCEHALL_ECHO.slice(0, 1),
      0.53,
    ),
    take('C', 'Real canister horn', 'A real hand-held air horn: one long, harsh blast whose tone sags as the can runs out, no echo.', canBlast(2100), undefined, 0.7),
  ],
};
