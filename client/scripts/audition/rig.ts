// The audition page's audio rig (Story 10.13): ONE AudioContext, created or
// resumed only from a click, and the same chain the game will use:
//
//   cue / engine voices → session gain → master chain → volume → destination
//                                                               └→ level tap (meter)
//
// STOP ALL drops the current session gain (everything still scheduled on it
// goes silent) and opens a fresh one with a fresh Synth; the master chain and
// the volume stay.
//
// FAILURE IS VISIBLE: every play path runs through `guard`, a rejected
// resume() is reported, and the state listeners keep the status line honest.

import { Synth } from '../../src/audio/synth/render.js';
import { createMasterChain } from '../../src/audio/synth/master.js';
import type { CueRecipe } from '../../src/audio/synth/recipe.js';
import type { ToneSpec } from '../../src/audio/tones.js';
import type { HornSynthVoice } from '../../src/audio/horns.js';
import { SINKING_DEMO_S } from '../../src/audio/synth/candidates/index.js';
import { playSynthHorn, playToneSpec } from './legacy.js';
import { scheduleSinkingDemo } from './sinking.js';

interface Session {
  gain: GainNode;
  synth: Synth;
}

/** Re-check the state this long after a click; the second one ends "Starting". */
const RECHECK_MS = [300, 1000] as const;
const TEST_TONE = { hz: 440, s: 0.5, gain: 0.3 } as const;

export class Rig {
  private ctx: AudioContext | null = null;
  private volume: GainNode | null = null;
  private tap: AnalyserNode | null = null;
  private chainIn: AudioNode | null = null;
  private session: Session | null = null;
  private volumeValue = 0.7;
  private unlocked = false;
  private resumePending = false;
  private readonly stopListeners: Array<() => void> = [];
  private readonly stateListeners: Array<() => void> = [];
  private readonly errorListeners: Array<(message: string) => void> = [];

  /**
   * Create or resume the context. Call only from a click handler: resume() is
   * called synchronously inside the gesture, and the first call also starts a
   * one-sample silent buffer (the classic autoplay unlock).
   */
  start(): AudioContext | null {
    try {
      if (!this.ctx) this.build();
    } catch (e) {
      this.report('Creating the audio engine', e);
      return null;
    }
    const ctx = this.ctx;
    if (!ctx) {
      this.report('Creating the audio engine', new Error('this browser has no Web Audio support'));
      return null;
    }
    this.unlock(ctx);
    this.resume(ctx);
    return ctx;
  }

  /** The context's state, or null before the first START. */
  get state(): string | null {
    return this.ctx?.state ?? null;
  }

  /** True while a click's resume() has neither settled nor timed out. */
  get pending(): boolean {
    return this.resumePending;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** The output level tap (after the volume), or null before START. */
  get analyser(): AnalyserNode | null {
    return this.tap;
  }

  onState(fn: () => void): void {
    this.stateListeners.push(fn);
  }

  onError(fn: (message: string) => void): void {
    this.errorListeners.push(fn);
  }

  /** Show a failure in plain words plus the error's own message. */
  report(what: string, err: unknown): void {
    const detail = err instanceof Error ? err.message : String(err);
    for (const fn of this.errorListeners) fn(`${what} did not work: ${detail}`);
  }

  /** Run `fn`; a throw is reported, never swallowed. */
  guard(what: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.report(what, e);
    }
  }

  private notify(): void {
    for (const fn of this.stateListeners) fn();
  }

  private unlock(ctx: AudioContext): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  }

  private resume(ctx: AudioContext): void {
    this.resumePending = ctx.state !== 'running';
    this.notify();
    const settle = (): void => {
      this.resumePending = false;
      this.notify();
    };
    try {
      ctx.resume().then(settle, (e: unknown) => {
        this.report('Starting sound', e);
        settle();
      });
    } catch (e) {
      this.report('Starting sound', e);
      settle();
    }
    // A resume() that never settles must not leave the line saying "Starting".
    setTimeout(() => this.notify(), RECHECK_MS[0]);
    setTimeout(settle, RECHECK_MS[1]);
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const chain = createMasterChain(ctx);
    const volume = ctx.createGain();
    volume.gain.value = this.volumeValue;
    chain.output.connect(volume).connect(ctx.destination);
    const tap = ctx.createAnalyser();
    tap.fftSize = 2048;
    volume.connect(tap);
    ctx.addEventListener('statechange', () => this.notify());
    this.ctx = ctx;
    this.volume = volume;
    this.tap = tap;
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
    this.guard('Stopping all sound', () => {
      for (const fn of this.stopListeners) fn();
      const old = this.session;
      if (!old || !this.ctx) return;
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      setTimeout(() => old.gain.disconnect(), 100);
      this.openSession();
    });
  }

  /** The simplest possible sound: a plain 440 Hz sine for 0.5 s straight to
   *  the speakers, bypassing the master chain, the synth and the volume. */
  testTone(): void {
    this.guard('The test tone', () => {
      const ctx = this.start();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.frequency.value = TEST_TONE.hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(TEST_TONE.gain, t);
      g.gain.setValueAtTime(TEST_TONE.gain, t + TEST_TONE.s - 0.02);
      g.gain.linearRampToValueAtTime(0, t + TEST_TONE.s);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + TEST_TONE.s + 0.02);
    });
  }

  /** Play one shot of a candidate recipe. */
  play(recipe: CueRecipe, distance01: number, delayS = 0): void {
    this.guard('Playing that sound', () => {
      this.start();
      if (this.session && !this.session.synth.play(recipe, { distance01, delayS })) {
        throw new Error('the sound engine dropped it (too many sounds at once, or it could not be built)');
      }
    });
  }

  /** The ~7 s sinking demo: the blast repeating under the real SinkFade insert. */
  playSinking(recipe: CueRecipe): void {
    this.guard('The sinking demo', () => {
      const ctx = this.start();
      const sink = this.session?.gain;
      if (!ctx || !sink) return;
      const fade = scheduleSinkingDemo(ctx, sink, recipe);
      setTimeout(() => fade.release(), (SINKING_DEMO_S + 1) * 1000);
    });
  }

  /** Play the old oscillator horn exactly as audio/context.ts renders it. */
  playHorn(voice: HornSynthVoice): void {
    this.guard("Playing the old horn", () => {
      const ctx = this.start();
      const sink = this.session?.gain;
      if (ctx && sink) playSynthHorn(ctx, voice, sink);
    });
  }

  /** Play a legacy ToneSpec exactly as audio/context.ts does today. */
  playTone(spec: ToneSpec): void {
    this.guard("Playing today's sound", () => {
      const ctx = this.start();
      const sink = this.session?.gain;
      if (ctx && sink) playToneSpec(ctx, spec, sink);
    });
  }
}
