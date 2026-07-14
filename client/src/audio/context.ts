// Thin AudioContext adapter (not unit tested — audio/tones.ts holds the pure
// mapping). Oscillator + noise-burst envelopes only, no audio assets, in the
// spirit of the old game's playTone(freqStart, freqMid, freqEnd, duration,
// volume, type). Master mute persists to localStorage (default UNMUTED, per
// the plan); the AudioContext itself is constructed lazily and resumed on the
// first user gesture (PLAY click) to satisfy browser autoplay policy.

import { TONES, type ToneId, type ToneSpec } from './tones.js';

const MUTE_KEY = 'hullcracker-muted';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false; // storage unavailable — default unmuted
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // best-effort persistence only
  }
}

/** Fraction of a tone's duration given to a layered noise transient. */
const NOISE_DURATION_FRACTION = 0.5;
const NOISE_VOLUME_FRACTION = 0.5;

export class Audio {
  private ctx: AudioContext | null = null;
  muted: boolean;

  constructor() {
    this.muted = loadMuted();
  }

  /** Lazily create + resume the AudioContext. Call from a user-gesture handler. */
  resume(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ctx = Ctor ? new Ctor() : null;
      } catch {
        this.ctx = null; // unsupported browser — tones silently no-op
      }
    }
    void this.ctx?.resume().catch(() => undefined);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    saveMuted(this.muted);
  }

  /** Play a tone by id (no-op if muted, unsupported, or not yet resumed). */
  play(id: ToneId): void {
    if (this.muted || !this.ctx) return;
    this.playSpec(TONES[id]);
  }

  private playSpec(spec: ToneSpec): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    this.playOscillator(ctx, spec, t0);
    if (spec.noise) this.playNoiseBurst(ctx, t0, spec.duration * NOISE_DURATION_FRACTION, spec.volume * NOISE_VOLUME_FRACTION);
  }

  private playOscillator(ctx: AudioContext, spec: ToneSpec, t0: number): void {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freqStart, t0);
    osc.frequency.linearRampToValueAtTime(spec.freqMid, t0 + spec.duration * 0.4);
    osc.frequency.linearRampToValueAtTime(spec.freqEnd, t0 + spec.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(spec.volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + spec.duration + 0.02);
  }

  /** Short filtered noise burst (procedural — no assets) for the crack/whoosh weapons. */
  private playNoiseBurst(ctx: AudioContext, t0: number, duration: number, volume: number): void {
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
  }
}
