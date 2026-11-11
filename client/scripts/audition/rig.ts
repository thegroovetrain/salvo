// The audition page's audio rig (Story 10.13): ONE AudioContext, created or
// resumed only from a click, and the same chain the game will use:
//
//   cue / engine voices → session gain → master chain → volume → destination
//
// STOP ALL drops the current session gain (everything still scheduled on it
// goes silent) and opens a fresh one with a fresh Synth; the master chain and
// the volume stay.

import { Synth } from '../../src/audio/synth/render.js';
import { createMasterChain } from '../../src/audio/synth/master.js';
import type { CueRecipe } from '../../src/audio/synth/recipe.js';
import type { ToneSpec } from '../../src/audio/tones.js';

/** The game's legacy noise-layer proportions (audio/context.ts). */
const NOISE_DURATION_FRACTION = 0.5;
const NOISE_VOLUME_FRACTION = 0.5;
const SILENCE = 0.0001;

interface Session {
  gain: GainNode;
  synth: Synth;
}

export class Rig {
  private ctx: AudioContext | null = null;
  private volume: GainNode | null = null;
  private chainIn: AudioNode | null = null;
  private session: Session | null = null;
  private volumeValue = 0.7;
  private readonly stopListeners: Array<() => void> = [];

  /** Create or resume the context. Call only from a click handler. */
  start(): AudioContext | null {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const chain = createMasterChain(ctx);
    const volume = ctx.createGain();
    volume.gain.value = this.volumeValue;
    chain.output.connect(volume).connect(ctx.destination);
    this.ctx = ctx;
    this.volume = volume;
    this.chainIn = chain.input;
    this.openSession();
  }

  private openSession(): void {
    if (!this.ctx || !this.chainIn) return;
    const gain = this.ctx.createGain();
    gain.connect(this.chainIn);
    this.session = { gain, synth: new Synth(this.ctx, gain) };
  }

  /** Where continuous voices (engines) connect. */
  get sink(): AudioNode | null {
    return this.session?.gain ?? null;
  }

  setVolume(v: number): void {
    this.volumeValue = Math.max(0, Math.min(1, v));
    if (this.volume && this.ctx) this.volume.gain.setTargetAtTime(this.volumeValue, this.ctx.currentTime, 0.03);
  }

  onStop(fn: () => void): void {
    this.stopListeners.push(fn);
  }

  stopAll(): void {
    for (const fn of this.stopListeners) fn();
    const old = this.session;
    if (!old || !this.ctx) return;
    old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    setTimeout(() => old.gain.disconnect(), 100);
    this.openSession();
  }

  /** Play one shot of a candidate recipe. */
  play(recipe: CueRecipe, distance01: number, delayS = 0): void {
    this.start();
    this.session?.synth.play(recipe, { distance01, delayS });
  }

  /** Play a legacy ToneSpec exactly as audio/context.ts does today. */
  playTone(spec: ToneSpec): void {
    const ctx = this.start();
    const sink = this.session?.gain;
    if (!ctx || !sink) return;
    const t0 = ctx.currentTime;
    playOscillator(ctx, spec, t0, sink, spec.volume);
    if (spec.noise) playNoiseBurst(ctx, t0, spec.duration * NOISE_DURATION_FRACTION, spec.volume * NOISE_VOLUME_FRACTION, sink);
  }
}

/** A faithful copy of context.ts `playOscillator` (detune 0). */
function playOscillator(ctx: BaseAudioContext, spec: ToneSpec, t0: number, sink: AudioNode, volume: number): void {
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freqStart, t0);
  osc.frequency.linearRampToValueAtTime(spec.freqMid, t0 + spec.duration * 0.4);
  osc.frequency.linearRampToValueAtTime(spec.freqEnd, t0 + spec.duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENCE, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(SILENCE, t0 + spec.duration);
  osc.connect(gain).connect(sink);
  osc.start(t0);
  osc.stop(t0 + spec.duration + 0.02);
}

/** A faithful copy of context.ts `playNoiseBurst`. */
function playNoiseBurst(ctx: BaseAudioContext, t0: number, duration: number, volume: number, sink: AudioNode): void {
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  src.connect(gain).connect(sink);
  src.start(t0);
}
