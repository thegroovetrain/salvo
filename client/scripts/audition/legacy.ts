// Faithful copies of how the game plays TODAY's sounds (audio/context.ts),
// for the audition page's "Today's sound" buttons. context.ts itself is not
// imported: it drags in the settings store.

import { hornGain, type HornSynthVoice } from '../../src/audio/horns.js';
import type { ToneSpec } from '../../src/audio/tones.js';

/** The game's legacy noise-layer proportions (audio/context.ts). */
const NOISE_DURATION_FRACTION = 0.5;
const NOISE_VOLUME_FRACTION = 0.5;
const SILENCE = 0.0001;

/** context.ts `playSpec`: the tone, plus its noise layer when it has one (detune 0, gain 1). */
export function playToneSpec(ctx: BaseAudioContext, spec: ToneSpec, sink: AudioNode): void {
  const t0 = ctx.currentTime;
  playOscillator(ctx, spec, t0, sink, spec.volume);
  if (spec.noise) playNoiseBurst(ctx, t0, spec.duration * NOISE_DURATION_FRACTION, spec.volume * NOISE_VOLUME_FRACTION, sink);
}

/** context.ts `playSynthHorn`, heard at the nearest band (band gain 1). */
export function playSynthHorn(ctx: BaseAudioContext, voice: HornSynthVoice, sink: AudioNode): void {
  const t0 = ctx.currentTime;
  const peak = hornGain(voice, 1);
  const hold = Math.max(voice.attackS, voice.durationS - voice.releaseS);
  for (const layer of voice.layers) {
    const osc = ctx.createOscillator();
    osc.type = layer.type;
    osc.frequency.setValueAtTime(layer.freq, t0);
    if (layer.detuneCents) osc.detune.setValueAtTime(layer.detuneCents, t0);
    const g = ctx.createGain();
    const level = Math.max(SILENCE, peak * layer.gain);
    g.gain.setValueAtTime(SILENCE, t0);
    g.gain.linearRampToValueAtTime(level, t0 + voice.attackS);
    g.gain.setValueAtTime(level, t0 + hold);
    g.gain.exponentialRampToValueAtTime(SILENCE, t0 + voice.durationS);
    osc.connect(g).connect(sink);
    osc.start(t0);
    osc.stop(t0 + voice.durationS + 0.02);
  }
}

/** context.ts `playOscillator` (detune 0). */
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

/** context.ts `playNoiseBurst`. */
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
