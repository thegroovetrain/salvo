// The layered-cue DATA MODEL (Story 10.13) and its pure helpers. No
// AudioContext, no DOM: everything here is arithmetic over plain objects, so
// the contracts (length, distance shaping, per-shot randomness) are unit
// tested without a fake context. `render.ts` is the only place that turns a
// recipe into Web Audio nodes.
//
// A cue is a list of LAYERS mixed into one cue bus. Each layer is one signal
// chain, built once per GRAIN:
//
//   source → filters… → [modal bank] → envelope gain → [soft clip] → [AM] → cue bus
//
// Every random choice (noise offset aside) is drawn in `planShot` from an
// injectable `rand`, so one seed reproduces one shot exactly.

import type { NoiseColor } from './noise.js';

/** Floor for gain targets and exponential ramps (Web Audio cannot ramp to 0). */
export const SILENCE = 0.0001;

/** How many time constants a `tauMs` decay is given before its source stops:
 *  e^-7 ≈ -61 dB, under the SILENCE floor relative to a unity peak. */
export const DECAY_TAUS = 7;

/** Hard ceiling on grains per layer, so a typo in a recipe cannot build
 *  thousands of nodes for one shot. */
export const MAX_GRAINS = 256;

export type OscWave = 'sine' | 'triangle' | 'sawtooth' | 'square';

/**
 * A value fixed for the whole grain, or a glide from `from` to `to`.
 * With `ms` the glide is an exponential ramp ending `ms` after the grain
 * starts (values floored at SILENCE: exponential ramps cannot touch 0); with
 * `tauMs` it is a `setTargetAtTime` approach (which MAY target 0, e.g. an FM
 * index dying away). Give one of the two; `tauMs` wins if both are present.
 */
export type Sweep = number | { from: number; to: number; ms?: number; tauMs?: number };

/** Looping noise from the shared buffer, read from a random offset. */
export interface NoiseSource {
  kind: 'noise';
  color: NoiseColor;
}

/** One oscillator. `vibrato.depth` is a fraction of the pitch (0.004 = ±0.4 %).
 *  `fm` adds a modulator at `ratio ×` the carrier pitch whose deviation is
 *  `index ×` the modulator frequency (the classic FM index). */
export interface OscSource {
  kind: 'osc';
  wave: OscWave;
  freq: Sweep;
  vibrato?: { rateHz: number; depth: number };
  fm?: { ratio: number; index: Sweep };
}

/** A short white-noise impulse that falls linearly to 0 over `ms` — the
 *  exciter for a modal bank, a hard-keying click, a crackle. */
export interface ClickSource {
  kind: 'click';
  ms: number;
}

export type Source = NoiseSource | OscSource | ClickSource;

export interface Filter {
  type: 'lowpass' | 'highpass' | 'bandpass';
  freq: Sweep;
  q?: number;
}

/** Amplitude envelope: linear attack to `peak`, optional hold, then either a
 *  `setTargetAtTime` decay with time constant `tauMs`, or an exponential ramp
 *  reaching SILENCE at `endMs` (measured from the grain start). */
export type Envelope = { peak: number; attackMs: number; holdMs?: number } & (
  | { tauMs: number; endMs?: undefined }
  | { endMs: number; tauMs?: undefined }
);

/** Parallel bandpass resonators fed by the layer's (filtered) source; replace
 *  the dry path. Each mode rings for T60 ≈ 2.2·Q/f, so Q sets the ring. Mode
 *  i's level is `-falloffDb · i` dB (default 3 dB per mode). */
export interface ModeBank {
  f0: number;
  ratios: readonly number[];
  q: number;
  falloffDb?: number;
}

/** Amplitude modulation: the layer level swings between (1 - depth) and 1 at
 *  `rateHz`; `jitter` is a ± fraction on the rate drawn once per shot. */
export interface AmpMod {
  rateHz: number;
  depth: number;
  jitter?: number;
  wave?: OscWave;
}

/**
 * Repeat the layer as GRAINS. Either an explicit onset pattern (Morse keying,
 * hammer strikes, ratchet clicks; `jitterMs` nudges each onset ±), or a random
 * scatter of `count` onsets in `windowMs` where `thin` > 0 crowds them toward
 * the start so the density thins out (droplets, crackles, bubbles).
 * `spread` [lo, hi] multiplies every frequency of each grain (source, filters,
 * modes) by a log-uniform pick in that range.
 */
export type Grains = { spread?: readonly [number, number] } & (
  | { onsetsMs: readonly number[]; jitterMs?: number; count?: undefined }
  | { count: number; windowMs: number; thin?: number; onsetsMs?: undefined }
);

/** Per-shot randomization of one layer: ± fraction on every frequency and on
 *  the decay, ± dB on the level. Drawn once per shot, shared by its grains. */
export interface LayerJitter {
  freq?: number;
  decay?: number;
  gainDb?: number;
}

export interface Layer {
  source: Source;
  env: Envelope;
  filters?: readonly Filter[];
  modes?: ModeBank;
  /** Soft-clip drive k (tanh curve), applied AFTER the envelope, so a louder
   *  peak drives harder — the sub-thump's "weight on small speakers". */
  drive?: number;
  am?: AmpMod;
  grains?: Grains;
  jitter?: LayerJitter;
  /** Offset of this layer inside the cue, ms. */
  startMs?: number;
  /** Skip this layer when the cue's distance01 is above this (e.g. a gun's
   *  crack is gone at range). */
  farCut?: number;
}

/** A discrete late repeat of the whole cue (horizon echo), dry-path. */
export interface Echo {
  delayMs: number;
  gain: number;
  lowpassHz: number;
  /** ± fraction on the delay, per shot. */
  jitter?: number;
}

export interface CueRecipe {
  layers: readonly Layer[];
  /** Cue master level (default 1). */
  gain?: number;
  /** Send level 0..1 to the one shared open-water reverb. */
  reverb?: number;
  /** Highpass on this cue's reverb send, so rapid fire does not mud the tail. */
  reverbHighpassHz?: number;
  echoes?: readonly Echo[];
  /** Voice family for the per-family cap (e.g. 'secondary'). */
  family?: string;
  /** Live voices allowed in `family`; at the cap a new cue is DROPPED. */
  maxVoices?: number;
}

// --- sanitizers (the context.ts cueGain / cuePan rule, restated here because
// --- those are private to the adapter) ---------------------------------------

/** Non-finite or absent → 1 (play at the recipe's own level); else 0..1. */
export function sanitizeGain(gain: number | undefined): number {
  return gain !== undefined && Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 1;
}

/** Non-finite → 0 (centred); else -1..1. */
export function sanitizePan(pan: number): number {
  return Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
}

/** Non-finite → 0 (at the listener); else 0..1. */
export function sanitizeDistance(d01: number | undefined): number {
  return d01 !== undefined && Number.isFinite(d01) ? Math.max(0, Math.min(1, d01)) : 0;
}

/** A frequency multiplier: finite and positive, else 1 (untransposed). */
export function sanitizePitch(pitch: number | undefined): number {
  return pitch !== undefined && Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
}

/** Non-finite or negative → 0. */
export function sanitizeDelay(s: number | undefined): number {
  return s !== undefined && Number.isFinite(s) ? Math.max(0, s) : 0;
}

// --- randomness -------------------------------------------------------------

/** `value` moved by a uniform ± `frac` (e.g. 0.1 = ±10 %). A non-finite or
 *  non-positive frac returns `value` untouched; frac is capped below 1 so a
 *  jittered value never crosses 0. */
export function jitter(value: number, frac: number | undefined, rand: () => number = Math.random): number {
  if (frac === undefined || !Number.isFinite(frac) || frac <= 0) return value;
  const f = Math.min(frac, 0.99);
  return value * (1 + f * (rand() * 2 - 1));
}

/** A level multiplier from a uniform ± `db` decibel draw. */
export function jitterDb(db: number | undefined, rand: () => number = Math.random): number {
  if (db === undefined || !Number.isFinite(db) || db <= 0) return 1;
  return Math.pow(10, (db * (rand() * 2 - 1)) / 20);
}

/** Log-uniform pick in [lo, hi] — the natural spread for pitches. */
export function logPick(range: readonly [number, number] | undefined, rand: () => number = Math.random): number {
  if (!range) return 1;
  const [lo, hi] = range;
  if (!(lo > 0) || !(hi > 0)) return 1;
  return lo * Math.pow(hi / lo, rand());
}

// --- time -------------------------------------------------------------------

/** The concrete envelope times of one grain, seconds, with the decay scaled. */
export interface EnvTimes {
  attackS: number;
  holdS: number;
  /** tau of the setTargetAtTime decay (tau mode) or ramp length (ramp mode). */
  decayS: number;
  mode: 'tau' | 'ramp';
  /** When the grain is inaudible and its sources may stop. */
  lengthS: number;
}

const ms = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) ? Math.max(0, v) / 1000 : 0);

export function envTimes(env: Envelope, decayScale = 1): EnvTimes {
  const attackS = ms(env.attackMs);
  const holdS = ms(env.holdMs);
  const scale = Number.isFinite(decayScale) && decayScale > 0 ? decayScale : 1;
  if (env.tauMs !== undefined) {
    const decayS = ms(env.tauMs) * scale;
    return { attackS, holdS, decayS, mode: 'tau', lengthS: attackS + holdS + decayS * DECAY_TAUS };
  }
  const decayS = Math.max(0, ms(env.endMs) - attackS - holdS) * scale;
  return { attackS, holdS, decayS, mode: 'ramp', lengthS: attackS + holdS + decayS };
}

/** The latest a grain of this layer can start, relative to the layer start (s). */
function maxOnsetS(grains: Grains | undefined): number {
  if (!grains) return 0;
  if (grains.onsetsMs !== undefined) {
    const last = grains.onsetsMs.reduce((m, v) => Math.max(m, ms(v)), 0);
    return last + ms(grains.jitterMs);
  }
  return ms(grains.windowMs);
}

/** Worst-case end of one layer, relative to the cue start (s). */
export function layerLengthS(layer: Layer): number {
  const decayMax = 1 + Math.min(Math.max(layer.jitter?.decay ?? 0, 0), 0.99);
  return ms(layer.startMs) + maxOnsetS(layer.grains) + envTimes(layer.env, decayMax).lengthS;
}

/** Worst-case delay of the latest echo (s). */
export function echoTailS(echoes: readonly Echo[] | undefined): number {
  if (!echoes) return 0;
  return echoes.reduce((m, e) => Math.max(m, ms(e.delayMs) * (1 + Math.min(Math.max(e.jitter ?? 0, 0), 0.99))), 0);
}

/**
 * The time (s, from the cue start) by which every source of any shot of this
 * recipe has stopped: the latest layer end under worst-case jitter, plus the
 * longest echo (sources are held open for the echo tail so the delay lines are
 * not disconnected mid-repeat). The reverb tail is shared and outlives voices.
 */
export function cueLengthS(recipe: CueRecipe): number {
  const layers = recipe.layers.reduce((m, l) => Math.max(m, layerLengthS(l)), 0);
  return layers + echoTailS(recipe.echoes);
}

// --- distance ---------------------------------------------------------------

/** The far end of the distance shaping; the near end is "untouched". */
export const DISTANCE = {
  /** Gain at d01 = 1 (≈ -20 dB). */
  farGain: 0.1,
  /** Distance lowpass at the listener (wide open) and at range (dark). */
  nearLowpassHz: 20_000,
  farLowpassHz: 350,
  /** Sound-travel pre-delay at d01 = 1 (research §2: capped at 1.5 s). */
  farPreDelayS: 1.5,
  /** Reverb-send multiplier at d01 = 1 (the wet/dry ratio rises with range). */
  farWet: 3,
} as const;

export interface DistanceShape {
  gain: number;
  lowpassHz: number;
  preDelayS: number;
  wet: number;
}

/**
 * Normalized distance → how the cue is heard. 0 = at the listener (full gain,
 * open filter, no delay, wet multiplier 1); 1 = far (quieter, dark, delayed,
 * wetter). Each output is monotone in d01: gain follows the research's
 * 1/(1 + k·d) rolloff, the lowpass glides exponentially (equal steps in
 * pitch), delay and wet are linear. Non-finite input degrades to 0.
 */
export function distanceShape(d01: number): DistanceShape {
  const d = sanitizeDistance(d01);
  const k = 1 / DISTANCE.farGain - 1;
  return {
    gain: 1 / (1 + k * d),
    lowpassHz: DISTANCE.nearLowpassHz * Math.pow(DISTANCE.farLowpassHz / DISTANCE.nearLowpassHz, d),
    preDelayS: DISTANCE.farPreDelayS * d,
    wet: 1 + (DISTANCE.farWet - 1) * d,
  };
}

// --- the shot plan ----------------------------------------------------------

/** One grain with every random choice already made. */
export interface GrainPlan {
  /** Index into recipe.layers. */
  layer: number;
  /** Start, seconds from the cue start. */
  onsetS: number;
  /** Multiplier on every frequency of this grain (layer jitter × spread). */
  freqScale: number;
  /** Multiplier on this grain's decay. */
  decayScale: number;
  /** Multiplier on this grain's peak. */
  gain: number;
  /** Multiplier on the AM rate. */
  amRateScale: number;
  /** When this grain's sources may stop, seconds from its onset. */
  lengthS: number;
}

export interface EchoPlan {
  delayS: number;
  gain: number;
  lowpassHz: number;
}

export interface ShotPlan {
  grains: GrainPlan[];
  echoes: EchoPlan[];
  /** Latest grain end + longest echo: when the last source stops. */
  lengthS: number;
  /** The echo tail every source is held open for. */
  echoTailS: number;
}

/** Onsets (s, relative to the layer start) of one layer's grains. */
export function grainOnsetsS(grains: Grains | undefined, rand: () => number = Math.random): number[] {
  if (!grains) return [0];
  if (grains.onsetsMs !== undefined) {
    const j = ms(grains.jitterMs);
    return grains.onsetsMs.slice(0, MAX_GRAINS).map((o) => Math.max(0, ms(o) + j * (rand() * 2 - 1)));
  }
  const n = Number.isFinite(grains.count) ? Math.max(0, Math.min(MAX_GRAINS, Math.floor(grains.count))) : 0;
  const w = ms(grains.windowMs);
  const p = 1 + Math.max(0, grains.thin ?? 0);
  return Array.from({ length: n }, () => w * Math.pow(rand(), p));
}

function planLayer(layer: Layer, index: number, rand: () => number): GrainPlan[] {
  const freq = jitter(1, layer.jitter?.freq, rand);
  const decayScale = jitter(1, layer.jitter?.decay, rand);
  const gain = jitterDb(layer.jitter?.gainDb, rand);
  const amRateScale = jitter(1, layer.am?.jitter, rand);
  const lengthS = envTimes(layer.env, decayScale).lengthS;
  const startS = ms(layer.startMs);
  return grainOnsetsS(layer.grains, rand).map((onset) => ({
    layer: index,
    onsetS: startS + onset,
    freqScale: freq * logPick(layer.grains?.spread, rand),
    decayScale,
    gain,
    amRateScale,
    lengthS,
  }));
}

/**
 * Resolve every random choice of one shot. Layers whose `farCut` is below the
 * shot's distance are left out. Deterministic for a given `rand`.
 *
 * `pitch` transposes the whole shot: it multiplies every grain's `freqScale`,
 * which the renderer applies to every oscillator (and FM modulator), every
 * layer filter and every mode of the shot. Junk → 1. The distance lowpass and
 * the echo lowpasses are where the shot is HEARD from, not part of its voice,
 * and are not transposed.
 */
export function planShot(recipe: CueRecipe, rand: () => number = Math.random, distance01 = 0, pitch = 1): ShotPlan {
  const d = sanitizeDistance(distance01);
  const p = sanitizePitch(pitch);
  const grains: GrainPlan[] = [];
  recipe.layers.forEach((layer, i) => {
    if (layer.farCut !== undefined && d > layer.farCut) return;
    for (const g of planLayer(layer, i, rand)) grains.push(p === 1 ? g : { ...g, freqScale: g.freqScale * p });
  });
  const echoes = (recipe.echoes ?? []).map((e) => ({
    delayS: jitter(ms(e.delayMs), e.jitter, rand),
    gain: e.gain,
    lowpassHz: e.lowpassHz,
  }));
  const tail = echoes.reduce((m, e) => Math.max(m, e.delayS), 0);
  const end = grains.reduce((m, g) => Math.max(m, g.onsetS + g.lengthS), 0);
  return { grains, echoes, lengthS: end + tail, echoTailS: tail };
}
