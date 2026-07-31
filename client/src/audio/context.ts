// Thin AudioContext adapter (not unit tested — audio/tones.ts holds the pure
// mapping). Oscillator + noise-burst envelopes only, no audio assets, in the
// spirit of the old game's playTone(freqStart, freqMid, freqEnd, duration,
// volume, type). The AudioContext itself is constructed lazily and resumed on
// the first user gesture (PLAY click) to satisfy browser autoplay policy.
//
// Story 2.3 — the bus graph. Every tone routes through a two-stage bus so the
// accessibility volumes are ONE gain write each, live, with no per-tone math:
//
//   tone → effectsGain → masterGain → monoNode → destination
//
//   effectsGain   the EFFECTS category (every tone today is an effect; a future
//                 music/voice category gets its own sibling bus here)
//   masterGain    master volume AND mute (mute is master gain 0 — the play()
//                 early-out below is just an optimization on top of it)
//   monoNode      the mono-audio downmix: an explicit 1-channel gain node, so a
//                 stereo-panned future source folds to centre. Audibly a no-op
//                 today (nothing is panned) — shipped per the committed AC as
//                 plumbing for when stereo bearing audio lands.
//
// Mute/volume state lives in settings/store.ts (ONE persisted value shared with
// the M key); this class subscribes and re-applies the gains on every change.

import { settings, volumeGain, type Settings } from '../settings/store.js';
import { TONES, type ToneId, type ToneSpec } from './tones.js';

/** Fraction of a tone's duration given to a layered noise transient. */
const NOISE_DURATION_FRACTION = 0.5;
const NOISE_VOLUME_FRACTION = 0.5;

/** The bus chain, built once the AudioContext exists. */
interface Buses {
  effects: GainNode;
  master: GainNode;
  mono: GainNode;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private buses: Buses | null = null;
  private readonly unsubscribe: () => void;

  constructor() {
    this.unsubscribe = settings.subscribe((s) => this.applySettings(s));
  }

  /** Master mute (the single persisted value, shared with the M key). */
  get muted(): boolean {
    return settings.current.muted;
  }

  /** Lazily create + resume the AudioContext and its bus chain. Call from a
   *  user-gesture handler. */
  resume(): void {
    if (!this.ctx) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ctx = Ctor ? new Ctor() : null;
      } catch {
        this.ctx = null; // unsupported browser — tones silently no-op
      }
      if (this.ctx) this.buildBuses(this.ctx);
    }
    void this.ctx?.resume().catch(() => undefined);
  }

  private buildBuses(ctx: AudioContext): void {
    const mono = ctx.createGain();
    // An EXPLICIT channel count is what actually performs the downmix: with
    // channelCount 1 + 'explicit' + 'speakers' the node folds its stereo input
    // to a single channel, which the destination then plays to both ears.
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';
    mono.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(mono);
    const effects = ctx.createGain();
    effects.connect(master);
    this.buses = { effects, master, mono };
    this.applySettings(settings.current);
  }

  /** Push the live settings onto the bus gains (a no-op before the context exists). */
  private applySettings(s: Settings): void {
    const b = this.buses;
    if (!b) return;
    b.master.gain.value = s.muted ? 0 : volumeGain(s.masterVolume);
    b.effects.gain.value = volumeGain(s.effectsVolume);
    b.mono.channelCount = s.monoAudio ? 1 : 2;
  }

  /** Toggle master mute through the store (persisted, live, shared with M). */
  toggleMute(): void {
    settings.set({ muted: !settings.current.muted });
  }

  /**
   * Play a tone by id (no-op if muted, unsupported, or not yet resumed).
   *
   * `opts.detune` transposes the whole envelope, in CENTS (the Web Audio unit —
   * 100 cents = one semitone), applied to the oscillator's `detune` param so the
   * frequency RAMP shape is untouched and only the pitch moves. It defaults to
   * 0, which is byte-identical to the pre-Story-2.9 behavior for every existing
   * callsite. Today's one user is the fit cue's per-category transposition
   * (audio/tones.ts fitDetune) — one tone family heard nine ways.
   */
  play(id: ToneId, opts?: { detune?: number }): void {
    if (this.muted || !this.ctx || !this.buses) return;
    this.playSpec(TONES[id], opts?.detune ?? 0);
  }

  /** Drop the settings subscription (teardown; the page reload normally does it). */
  destroy(): void {
    this.unsubscribe();
  }

  private playSpec(spec: ToneSpec, detune: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    this.playOscillator(ctx, spec, t0, detune);
    if (spec.noise) {
      this.playNoiseBurst(ctx, t0, spec.duration * NOISE_DURATION_FRACTION, spec.volume * NOISE_VOLUME_FRACTION);
    }
  }

  /** The head of the bus chain every tone connects into (never `destination`). */
  private get sink(): GainNode | null {
    return this.buses?.effects ?? null;
  }

  private playOscillator(ctx: AudioContext, spec: ToneSpec, t0: number, detune: number): void {
    const sink = this.sink;
    if (!sink) return;
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    if (detune !== 0) osc.detune.setValueAtTime(detune, t0);
    osc.frequency.setValueAtTime(spec.freqStart, t0);
    osc.frequency.linearRampToValueAtTime(spec.freqMid, t0 + spec.duration * 0.4);
    osc.frequency.linearRampToValueAtTime(spec.freqEnd, t0 + spec.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(spec.volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);
    osc.connect(gain).connect(sink);
    osc.start(t0);
    osc.stop(t0 + spec.duration + 0.02);
  }

  /** Short filtered noise burst (procedural — no assets) for the crack/whoosh weapons. */
  private playNoiseBurst(ctx: AudioContext, t0: number, duration: number, volume: number): void {
    const sink = this.sink;
    if (!sink) return;
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
}
