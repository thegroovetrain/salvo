// Thin AudioContext adapter. Oscillator + noise-burst envelopes only, no audio
// assets, in the spirit of the old game's playTone(freqStart, freqMid, freqEnd,
// duration, volume, type). The AudioContext itself is constructed lazily and
// resumed on the first user gesture (PLAY click) to satisfy browser autoplay
// policy.
//
// THE GRAPH IS NOW UNIT TESTED (audio/__tests__/context.test.ts, review gate).
// This header used to say the file was deliberately untested because
// audio/tones.ts holds the pure mapping — a fair convention for an adapter that
// only forwarded a table, and one Story 4.7 outgrew: the sound map gave this
// file arithmetic (`cueGain`/`cuePan`, the `spec.volume * gain` multiply), a
// conditional node splice (`cueSink`), and an ACCEPTANCE CRITERION of its own
// ("given monoAudio is on, a panned world cue folds to centre"), none of which
// any pure table can cover. The tests drive a minimal fake AudioContext and
// assert on the GRAPH and the ARITHMETIC — which nodes exist, what connects to
// what, what value lands on which param. They deliberately assert nothing about
// how anything SOUNDS: timbre belongs to the tone table, and the browser's own
// mixing is not ours to test.
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
//                 stereo-panned source folds to centre. Shipped as plumbing and
//                 an audible no-op for eight cycles; STORY 4.7 FINALLY MADE IT
//                 MEAN SOMETHING — the sound map's world cues pan (see `play`'s
//                 `opts.pan` and `cueSink`), so this is now the node that makes
//                 the monoAudio accessibility toggle do real work.
//
// Mute/volume state lives in settings/store.ts (ONE persisted value shared with
// the M key); this class subscribes and re-applies the gains on every change.
//
// Story 4.5 — the FOGHORN path (`playHorn`). The one thing here that is not a
// ToneSpec: a ~1.8s multi-layer horn (or a decoded sample), with its own mix cap
// and its own asset fallback. It hangs off the SAME effects bus, so mute,
// volumes and the mono downmix need no special case. Its voices and the pure
// half of its logic live in audio/horns.ts; this file is still the only place
// that touches an AudioContext.

import { DEFAULT_HORN_ID } from '@salvo/shared';
import { settings, volumeGain, type Settings } from '../settings/store.js';
import { TONES, type ToneId, type ToneSpec } from './tones.js';
import {
  HORNS,
  HORN_MAX_CONCURRENT,
  HornBufferCache,
  hornGain,
  hornVoice,
  type HornSampleVoice,
  type HornSynthVoice,
  type HornVoice,
} from './horns.js';

/** Fraction of a tone's duration given to a layered noise transient. */
const NOISE_DURATION_FRACTION = 0.5;
const NOISE_VOLUME_FRACTION = 0.5;

/** Floor for the exponential gain ramps (Web Audio cannot ramp to exactly 0). */
const SILENCE = 0.0001;

/**
 * Fail-safe sanitizers for the two optional world-cue knobs (Story 4.7).
 *
 * Junk must never THROW and must never SILENCE a cue: a cue heard at the wrong
 * level is a bug, while a missing cue is a LIE about what happened on the water
 * (the horn's asset-fallback principle, applied to arithmetic). So a non-finite
 * gain degrades to 1 — the cue plays at its spec's own level — and a non-finite
 * pan degrades to 0, dead centre. An absent gain is likewise 1, which is exactly
 * byte-identical to every pre-4.7 call site: `spec.volume * 1 === spec.volume`.
 */
function cueGain(gain: number | undefined): number {
  return gain !== undefined && Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 1;
}

function cuePan(pan: number): number {
  return Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
}

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
  /** Horns sounding right now (the `HORN_MAX_CONCURRENT` mix cap). */
  private liveHorns = 0;
  /** Decoded sample-horn buffers. Unused by the shipped catalog (the seam is
   *  exercised by tests only — amendment 57); wired here so a licensed horn is
   *  one catalog line and nothing else. */
  private readonly hornBuffers = new HornBufferCache((url) => this.fetchHorn(url));

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
   *
   * `opts.pan` (-1..1) and `opts.gain` (0..1) are THE SOUND MAP's two knobs
   * (Story 4.7), and both are computed by the pure `worldCue()` helper from a
   * position the client already holds and has already DRAWN. `gain` multiplies
   * the spec's own volume; `pan` splices one StereoPannerNode in front of the
   * bus (see `cueSink`). Both are optional and both are inert when absent: with
   * no `pan` no node is created at all and the graph is byte-identical to
   * today's, so not one existing call site moves.
   */
  play(id: ToneId, opts?: { detune?: number; pan?: number; gain?: number }): void {
    if (this.muted || !this.ctx || !this.buses) return;
    this.playSpec(TONES[id], opts?.detune ?? 0, opts?.pan, opts?.gain);
  }

  /**
   * Play a FOGHORN (Story 4.5) — its own play path, deliberately not `play()`.
   *
   * A horn is ~1.8s and multi-layered; every `ToneSpec` is a single oscillator
   * under `MAX_TONE_S` (150ms). Rather than exempt the horn from that ceiling —
   * which would hollow it out for the 24 short cues it was written for
   * (amendment 57) — the horn gets this path. It still rides the EXISTING
   * `effects → master → mono` bus, so mute, effects volume and mono audio all
   * keep working with zero special-casing.
   *
   * `gain` is the caller's per-observer tier multiplier (1 / 0.75 / 0.5 for the
   * three earshot bands); it is clamped to 0..1 and multiplied into the voice's
   * own level. Junk (NaN, out of range) degrades to silence for THAT honk
   * rather than throwing.
   *
   * At `HORN_MAX_CONCURRENT` live horns the honk is DROPPED — not queued, not
   * voice-stolen (a late honk is a lie about when it happened). The drop is
   * silent and audio-only: the caller's chevron still draws, so the visual twin
   * survives a crowded room even when the mix cannot (amendment 56).
   */
  playHorn(hornId: string, gain: number): void {
    if (this.muted || !this.ctx || !this.buses) return;
    if (this.liveHorns >= HORN_MAX_CONCURRENT) return;
    const voice = this.resolveHornVoice(hornVoice(hornId));
    const peak = hornGain(voice, gain);
    if (peak <= 0) return;
    if (voice.kind === 'sample') this.playSampleHorn(voice, peak);
    else this.playSynthHorn(voice, peak);
  }

  /**
   * Which voice this honk actually renders with. A sample voice plays only once
   * its buffer is decoded; until then (and forever, if the url failed) the honk
   * falls back to the synthesized default rather than playing LATE or not at
   * all. An asset problem must never produce silence or a throw.
   */
  private resolveHornVoice(voice: HornVoice): HornVoice {
    if (voice.kind === 'synth') return voice;
    if (this.hornBuffers.get(voice.url)) return voice;
    if (!this.hornBuffers.hasFailed(voice.url)) void this.hornBuffers.load(voice.url);
    return HORNS[DEFAULT_HORN_ID];
  }

  /** Fetch + decode a horn sample. Rejection is caught by HornBufferCache, which
   *  marks the url failed for the session (no retry storm). */
  private async fetchHorn(url: string): Promise<AudioBuffer> {
    const ctx = this.ctx;
    if (!ctx) throw new Error('no audio context');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`horn ${url}: ${res.status}`);
    return await ctx.decodeAudioData(await res.arrayBuffer());
  }

  /** Multi-oscillator horn: every layer shares one slow-attack / long-tail
   *  envelope, and the slight per-layer detune is what makes it BEAT rather than
   *  drone (see the recipe in audio/horns.ts). */
  private playSynthHorn(voice: HornSynthVoice, peak: number): void {
    const ctx = this.ctx;
    const sink = this.sink;
    if (!ctx || !sink) return;
    const t0 = ctx.currentTime;
    const hold = Math.max(voice.attackS, voice.durationS - voice.releaseS);
    let lead: OscillatorNode | null = null;
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
      lead ??= osc;
    }
    if (lead) this.trackHorn(lead);
  }

  /** Sample horn: the decoded buffer straight onto the effects bus. Only ever
   *  reached with a buffer already in the cache (resolveHornVoice guarantees
   *  it), so there is no late-play path. */
  private playSampleHorn(voice: HornSampleVoice, peak: number): void {
    const ctx = this.ctx;
    const sink = this.sink;
    const buffer = this.hornBuffers.get(voice.url);
    if (!ctx || !sink || !buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, ctx.currentTime);
    src.connect(g).connect(sink);
    src.start(ctx.currentTime);
    this.trackHorn(src);
  }

  /** Count a horn against the mix cap until its source reports `ended`. One
   *  count per HONK (the synth path tracks its lead oscillator only — every
   *  layer stops at the same time). */
  private trackHorn(node: AudioScheduledSourceNode): void {
    this.liveHorns++;
    node.onended = () => {
      this.liveHorns = Math.max(0, this.liveHorns - 1);
    };
  }

  /** Drop the settings subscription (teardown; the page reload normally does it). */
  destroy(): void {
    this.unsubscribe();
  }

  private playSpec(spec: ToneSpec, detune: number, pan?: number, gain?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const sink = this.cueSink(ctx, pan, t0);
    if (!sink) return;
    // ONE level for the whole cue: the tone and its noise layer are the same
    // event, so a distance-attenuated crack must not keep a full-level transient
    // (that would make every far shot sound like a near one that lost its body).
    const volume = spec.volume * cueGain(gain);
    this.playOscillator(ctx, spec, t0, detune, sink, volume);
    if (spec.noise) {
      this.playNoiseBurst(ctx, t0, spec.duration * NOISE_DURATION_FRACTION, volume * NOISE_VOLUME_FRACTION, sink);
    }
  }

  /** The head of the bus chain every tone connects into (never `destination`). */
  private get sink(): GainNode | null {
    return this.buses?.effects ?? null;
  }

  /**
   * The node THIS cue connects into (Story 4.7).
   *
   * With no `pan` the answer is the effects bus itself, so the graph stays
   * byte-identical to every pre-4.7 call site — `osc → gain → effects`, no extra
   * node built, nothing extra to collect. With a `pan` we splice in ONE
   * StereoPannerNode — `osc → gain → panner → effects` — shared by the tone and
   * its noise layer, so a panned crack's transient travels with it instead of
   * staying stubbornly centred.
   *
   * This is exactly what the mono bus (see the graph at the top of this file)
   * was pre-plumbed for in Story 2.3: `monoNode` folds a panned source back to
   * centre, which until now was an audible no-op because nothing panned.
   *
   * A browser without `createStereoPanner` falls back to the bare bus — the cue
   * plays CENTRED rather than not at all. A presentation shortfall must never
   * become silence (the horn's asset-fallback rule).
   */
  private cueSink(ctx: AudioContext, pan: number | undefined, t0: number): AudioNode | null {
    const bus = this.sink;
    if (!bus || pan === undefined) return bus;
    if (typeof ctx.createStereoPanner !== 'function') return bus;
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(cuePan(pan), t0);
    panner.connect(bus);
    return panner;
  }

  private playOscillator(
    ctx: AudioContext,
    spec: ToneSpec,
    t0: number,
    detune: number,
    sink: AudioNode,
    volume: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    if (detune !== 0) osc.detune.setValueAtTime(detune, t0);
    osc.frequency.setValueAtTime(spec.freqStart, t0);
    osc.frequency.linearRampToValueAtTime(spec.freqMid, t0 + spec.duration * 0.4);
    osc.frequency.linearRampToValueAtTime(spec.freqEnd, t0 + spec.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);
    osc.connect(gain).connect(sink);
    osc.start(t0);
    osc.stop(t0 + spec.duration + 0.02);
  }

  /** Short filtered noise burst (procedural — no assets) for the crack/whoosh
   *  weapons. Takes its `sink` from the caller so a panned cue's transient rides
   *  the SAME panner as its tone (Story 4.7). */
  private playNoiseBurst(ctx: AudioContext, t0: number, duration: number, volume: number, sink: AudioNode): void {
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
