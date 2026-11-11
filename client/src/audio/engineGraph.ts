// THE ENGINE'S NODE GRAPH (Story 10.13): `EngineVoice` (own ship, research §1
// recipes A "turbine" and B "diesel") and `RemoteEngineVoice` (another ship by
// distance). Each builds its continuous graph ONCE and afterwards only glides
// AudioParams with setTargetAtTime — never a per-frame `.value` write, never a
// rebuild. The arithmetic lives in engine.ts; this file is wiring.
//
// Only BaseAudioContext APIs, so the same voice runs in an OfflineAudioContext
// (the audition page renders through one). Mute and duck happen upstream on the
// bus; a voice never reads settings.

import { noiseBuffer, noiseOffset, softClipCurve, type NoiseColor } from './synth/noise.js';
import {
  SILENCE,
  engineTargets,
  remoteEngineTargets,
  DEFAULT_DIESEL_VOICING,
  type EngineInput,
  type EngineProfile,
  type EngineTargets,
  type RemoteEngineInput,
  type RemoteEngineTargets,
} from './engine.js';

/** Updates closer together than this are dropped (unless boost flipped). */
export const UPDATE_MIN_S = 0.08;
/** Ordinary glide time constant. */
export const GLIDE_TAU_S = 0.25;
/** Boost onset: the slower flank surge. */
export const SURGE_TAU_S = 0.6;
/** First update: fade the voice in from silence over about this long. */
export const FADE_IN_S = 0.5;
/** Default release fade. */
export const RELEASE_S = 0.3;
/** Boost onset whine overshoot: × this for WHINE_OVERSHOOT_S, then settle. */
export const WHINE_OVERSHOOT = 1.15;
export const WHINE_OVERSHOOT_S = 1.5;

const VIBRATO_HZ = 0.3;
const VIBRATO_DEPTH = 0.004;
const WHINE_PARTIAL = 2.01;
const WASH_AM_HZ = [0.13, 0.31] as const;
const WASH_AM_DEPTH = 0.15; // per sine; two sum to the research's ±0.3
const SPRAY_HPF_HZ = 3000;
const DIESEL_HARMONICS = 24;
const DIESEL_FALLOFF = 0.8;
/** The throb LFO's "peaky pulse": cosine partials [1, ½, ¼]. */
const THROB_PULSE = [1, 0.5, 0.25];

type Rand = () => number;

/** Every node a voice builds, so release can stop and disconnect all of them. */
class NodeBag {
  readonly nodes: AudioNode[] = [];
  private readonly starts: Array<{ src: AudioScheduledSourceNode; offset?: number }> = [];

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly rand: Rand,
  ) {}

  private keep<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  gain(value: number): GainNode {
    const g = this.keep(this.ctx.createGain());
    g.gain.value = value;
    return g;
  }

  filter(type: BiquadFilterType, hz: number, q: number): BiquadFilterNode {
    const f = this.keep(this.ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    return f;
  }

  /** A looping noise source reading the shared buffer from a random offset. */
  noise(color: NoiseColor): AudioBufferSourceNode {
    const src = this.keep(this.ctx.createBufferSource());
    src.buffer = noiseBuffer(this.ctx, color, this.rand);
    src.loop = true;
    this.starts.push({ src, offset: noiseOffset(0, this.rand) });
    return src;
  }

  /** An oscillator on a custom wave (cosine partials), or `fallback` when the
   *  browser has no createPeriodicWave. */
  osc(hz: number, fallback: OscillatorType, partials?: readonly number[]): OscillatorNode {
    const o = this.keep(this.ctx.createOscillator());
    const wave = partials ? this.wave(partials) : null;
    if (wave) o.setPeriodicWave(wave);
    else o.type = fallback;
    o.frequency.value = hz;
    this.starts.push({ src: o });
    return o;
  }

  private wave(partials: readonly number[]): PeriodicWave | null {
    if (typeof this.ctx.createPeriodicWave !== 'function') return null;
    const real = new Float32Array(partials.length + 1);
    real.set(partials, 1);
    return this.ctx.createPeriodicWave(real, new Float32Array(real.length));
  }

  /** Soft clip, or null (the caller passes straight through) without WaveShaper. */
  shaper(k: number): WaveShaperNode | null {
    if (typeof this.ctx.createWaveShaper !== 'function') return null;
    const s = this.keep(this.ctx.createWaveShaper());
    s.curve = softClipCurve(k) as Float32Array<ArrayBuffer>;
    s.oversample = '4x';
    return s;
  }

  /** A stereo panner, or null (centred) without StereoPanner. */
  panner(): StereoPannerNode | null {
    if (typeof this.ctx.createStereoPanner !== 'function') return null;
    return this.keep(this.ctx.createStereoPanner());
  }

  startAll(t: number): void {
    for (const { src, offset } of this.starts) {
      if (offset === undefined) src.start(t);
      else (src as AudioBufferSourceNode).start(t, offset);
    }
  }

  /** Stop every source at `t`; disconnect everything once the first one ends. */
  stopAll(t: number): void {
    const first = this.starts[0]?.src;
    if (first) first.onended = () => this.disconnectAll();
    try {
      for (const { src } of this.starts) src.stop(t);
    } catch {
      this.disconnectAll(); // a closed context: nothing left to fade
    }
  }

  disconnectAll(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // already detached
      }
    }
  }
}

/** Chain nodes left to right, skipping a missing (null) stage. */
function chain(...stages: Array<AudioNode | null>): void {
  const present = stages.filter((s): s is AudioNode => s !== null);
  for (let i = 1; i < present.length; i++) present[i - 1].connect(present[i]);
}

const glide = (p: AudioParam, v: number, t: number, tau: number): void => {
  p.setTargetAtTime(v, t, tau);
};

function fadeOut(g: GainNode, t: number, fadeS: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(Math.max(SILENCE, g.gain.value), t);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + fadeS);
}

const fadeOf = (fadeS: number | undefined): number =>
  Number.isFinite(fadeS) && (fadeS as number) > 0 ? (fadeS as number) : RELEASE_S;

/** The life-cycle both voices share: throttled updates, fade-in, release. */
abstract class ContinuousVoice<I> {
  protected readonly bag: NodeBag;
  protected out!: GainNode;
  private isReleased = false;
  private started = false;
  private lastAt = -Infinity;
  private level01 = 1;
  private lastLevel = SILENCE;

  protected constructor(ctx: BaseAudioContext, rand: Rand) {
    this.bag = new NodeBag(ctx, rand);
  }

  get released(): boolean {
    return this.isReleased;
  }

  /** Build, wire to `sink`, start. A failure leaves a released, silent voice. */
  protected boot(sink: AudioNode, build: () => GainNode): void {
    try {
      this.out = build();
      this.out.gain.value = SILENCE;
      this.out.connect(sink);
      this.bag.startAll(this.bag.ctx.currentTime);
    } catch {
      this.isReleased = true;
      this.bag.disconnectAll();
    }
  }

  protected when(nowS: number | undefined): number {
    return nowS !== undefined && Number.isFinite(nowS) ? nowS : this.bag.ctx.currentTime;
  }

  /** True when this update should be written (and records it). */
  protected admit(t: number, force: boolean): boolean {
    if (this.isReleased || (!force && t - this.lastAt < UPDATE_MIN_S)) return false;
    this.lastAt = t;
    return true;
  }

  protected writeLevel(level: number, t: number, tau: number): void {
    this.lastLevel = level;
    const fadeTau = this.started ? tau : FADE_IN_S / 3; // first write = the fade-in
    this.started = true;
    glide(this.out.gain, Math.max(SILENCE, level * this.level01), t, fadeTau);
  }

  /** External trim (0..1) on top of the computed level. Junk is ignored. */
  setLevel(gain01: number): void {
    if (this.isReleased || !Number.isFinite(gain01)) return;
    this.level01 = Math.min(1, Math.max(0, gain01));
    if (this.started) this.writeLevel(this.lastLevel, this.bag.ctx.currentTime, GLIDE_TAU_S);
  }

  /** Fade to the silence floor, stop every source after the fade, disconnect. */
  release(fadeS?: number): void {
    if (this.isReleased) return;
    this.isReleased = true;
    const t = this.bag.ctx.currentTime;
    const fade = fadeOf(fadeS);
    fadeOut(this.out, t, fade);
    this.bag.stopAll(t + fade);
  }

  abstract update(input: I, nowS?: number): void;
}

// --- own engine ---------------------------------------------------------------

interface Shaft {
  readonly lfo: OscillatorNode;
  readonly depth: GainNode;
}

interface TurbineParts {
  readonly rumbleLp: BiquadFilterNode;
  readonly rumbleGain: GainNode;
  readonly whineA: OscillatorNode;
  readonly whineB: OscillatorNode;
  readonly whineBp: BiquadFilterNode;
  readonly whineGain: GainNode;
  readonly vibA: GainNode;
  readonly vibB: GainNode;
}

interface DieselParts {
  readonly pulse: OscillatorNode;
  readonly jitter: GainNode;
  readonly lowpass: BiquadFilterNode;
  readonly gain: GainNode;
}

interface CommonParts {
  readonly throbBp: BiquadFilterNode;
  readonly throbAmp: GainNode;
  readonly shafts: readonly Shaft[];
  readonly washBp: BiquadFilterNode;
  readonly washGain: GainNode;
  readonly sprayGain: GainNode;
  readonly shaper: WaveShaperNode | null;
}

const isFiniteInput = (i: EngineInput | null | undefined): i is EngineInput =>
  !!i && Number.isFinite(i.throttle) && Number.isFinite(i.speed01);

export class EngineVoice extends ContinuousVoice<EngineInput> {
  private common!: CommonParts;
  private turbine: TurbineParts | null = null;
  private diesel: DieselParts | null = null;
  private lastBoost = false;
  private overshootUntil = -Infinity;
  private lastDrive = NaN;

  constructor(
    ctx: BaseAudioContext,
    sink: AudioNode,
    private readonly profile: EngineProfile,
    opts: { rand?: Rand } = {},
  ) {
    super(ctx, opts.rand ?? Math.random);
    this.boot(sink, () => this.build());
  }

  private build(): GainNode {
    const t = engineTargets(this.profile, { throttle: 0, speed01: 0, boost: false });
    const mix = this.bag.gain(1);
    const out = this.bag.gain(SILENCE);
    if (this.profile.kind === 'diesel') {
      this.diesel = buildDiesel(this.bag, this.profile, t, mix);
      this.common = buildCommon(this.bag, t, mix, null);
      chain(mix, out); // recipe B clips before its resonators, not at the sum
    } else {
      this.turbine = buildTurbine(this.bag, t, mix);
      this.common = buildCommon(this.bag, t, mix, this.bag.shaper(t.drive));
      chain(mix, this.common.shaper, out);
    }
    this.lastDrive = t.drive;
    return out;
  }

  /** Glide toward this input's targets. Non-finite input holds the last good one. */
  update(input: EngineInput, nowS?: number): void {
    if (!isFiniteInput(input)) return;
    const t = this.when(nowS);
    const boost = input.boost === true;
    const flipped = boost !== this.lastBoost;
    if (!this.admit(t, flipped)) return;
    this.lastBoost = boost;
    const surge = flipped && boost;
    if (flipped && !boost) this.overshootUntil = -Infinity;
    const targets = engineTargets(this.profile, input);
    const tau = surge ? SURGE_TAU_S : GLIDE_TAU_S;
    this.applyCommon(targets, t, tau);
    this.applyPlant(targets, t, tau, surge);
    this.writeLevel(targets.level, t, tau);
  }

  private applyCommon(x: EngineTargets, t: number, tau: number): void {
    const c = this.common;
    glide(c.throbBp.frequency, x.throbHz, t, tau);
    glide(c.throbAmp.gain, x.throbGain, t, tau);
    const perShaft = x.throbDepth / c.shafts.length;
    c.shafts.forEach((s, i) => {
      glide(s.lfo.frequency, x.bladeHz[i] ?? x.bladeHz[0], t, tau);
      glide(s.depth.gain, perShaft, t, tau);
    });
    glide(c.washBp.frequency, x.washHz, t, tau);
    glide(c.washGain.gain, x.washGain, t, tau);
    glide(c.sprayGain.gain, x.sprayGain, t, tau);
    if (c.shaper && x.drive !== this.lastDrive) c.shaper.curve = softClipCurve(x.drive) as Float32Array<ArrayBuffer>;
    this.lastDrive = x.drive;
  }

  private applyPlant(x: EngineTargets, t: number, tau: number, surge: boolean): void {
    if (surge) this.overshootUntil = t + WHINE_OVERSHOOT_S;
    this.writePitch(x.whineHz, t, surge);
    if (this.turbine) applyTurbine(this.turbine, x, t, tau);
    if (this.diesel) applyDiesel(this.diesel, x, t, tau);
  }

  /** [pitch param, multiple of the whine / firing rate] for this recipe. */
  private pitchParams(): Array<readonly [AudioParam, number]> {
    if (this.turbine) {
      return [
        [this.turbine.whineA.frequency, 1],
        [this.turbine.whineB.frequency, WHINE_PARTIAL],
      ];
    }
    return this.diesel ? [[this.diesel.pulse.frequency, 1]] : [];
  }

  /** The whine / firing rate. A boost onset overshoots, then settles; ordinary
   *  updates inside that window must not cut the overshoot short. */
  private writePitch(hz: number, t: number, surge: boolean): void {
    if (!surge && t < this.overshootUntil) return;
    for (const [p, mult] of this.pitchParams()) {
      if (surge) {
        glide(p, hz * mult * WHINE_OVERSHOOT, t, GLIDE_TAU_S / 2);
        glide(p, hz * mult, t + WHINE_OVERSHOOT_S, GLIDE_TAU_S);
      } else {
        glide(p, hz * mult, t, GLIDE_TAU_S);
      }
    }
  }
}

function buildCommon(bag: NodeBag, x: EngineTargets, mix: GainNode, shaper: WaveShaperNode | null): CommonParts {
  // Throb: pink noise in the throb band, its gain pulsed at blade rate per shaft.
  const throbBp = bag.filter('bandpass', x.throbHz, 1.5);
  const throbAmp = bag.gain(x.throbGain);
  chain(bag.noise('pink'), throbBp, throbAmp, mix);
  const perShaft = x.throbDepth / x.bladeHz.length;
  const shafts = x.bladeHz.map((hz) => {
    const lfo = bag.osc(hz, 'sine', THROB_PULSE);
    const depth = bag.gain(perShaft);
    lfo.connect(depth).connect(throbAmp.gain);
    return { lfo, depth };
  });
  // Hull wash: pink noise with a slow, irregular swell; spray rides on top.
  const washBp = bag.filter('bandpass', x.washHz, 0.5);
  const washAm = bag.gain(1);
  const washGain = bag.gain(x.washGain);
  chain(bag.noise('pink'), washBp, washAm, washGain, mix);
  for (const hz of WASH_AM_HZ) bag.osc(hz, 'sine').connect(bag.gain(WASH_AM_DEPTH)).connect(washAm.gain);
  const sprayGain = bag.gain(x.sprayGain);
  chain(bag.noise('white'), bag.filter('highpass', SPRAY_HPF_HZ, 0.7), sprayGain, mix);
  return { throbBp, throbAmp, shafts, washBp, washGain, sprayGain, shaper };
}

function buildTurbine(bag: NodeBag, x: EngineTargets, mix: GainNode): TurbineParts {
  const rumbleLp = bag.filter('lowpass', x.rumbleHz, 0.7);
  const rumbleGain = bag.gain(x.rumbleGain);
  chain(bag.noise('brown'), rumbleLp, rumbleGain, mix);
  // Gear whine: a near-octave pair through a narrow band, with a slow vibrato.
  const whineA = bag.osc(x.whineHz, 'triangle');
  const whineB = bag.osc(x.whineHz * WHINE_PARTIAL, 'triangle');
  const whineBp = bag.filter('bandpass', x.whineHz, 6);
  const whineGain = bag.gain(x.whineGain);
  whineA.connect(whineBp);
  whineB.connect(whineBp);
  chain(whineBp, whineGain, mix);
  const vibrato = bag.osc(VIBRATO_HZ, 'sine');
  const vibA = bag.gain(x.whineHz * VIBRATO_DEPTH);
  const vibB = bag.gain(x.whineHz * WHINE_PARTIAL * VIBRATO_DEPTH);
  vibrato.connect(vibA).connect(whineA.frequency);
  vibrato.connect(vibB).connect(whineB.frequency);
  return { rumbleLp, rumbleGain, whineA, whineB, whineBp, whineGain, vibA, vibB };
}

function applyTurbine(p: TurbineParts, x: EngineTargets, t: number, tau: number): void {
  glide(p.rumbleLp.frequency, x.rumbleHz, t, tau);
  glide(p.rumbleGain.gain, x.rumbleGain, t, tau);
  glide(p.whineBp.frequency, x.whineHz, t, tau);
  glide(p.whineGain.gain, x.whineGain, t, tau);
  glide(p.vibA.gain, x.whineHz * VIBRATO_DEPTH, t, tau);
  glide(p.vibB.gain, x.whineHz * WHINE_PARTIAL * VIBRATO_DEPTH, t, tau);
}

function dieselPartials(): number[] {
  return Array.from({ length: DIESEL_HARMONICS }, (_, i) => 1 / (i + 1) ** DIESEL_FALLOFF);
}

function buildDiesel(bag: NodeBag, profile: EngineProfile, x: EngineTargets, mix: GainNode): DieselParts {
  const voicing = profile.diesel ?? DEFAULT_DIESEL_VOICING;
  // Firing pulses (a plain sawtooth without PeriodicWave), jittered by brown noise.
  const pulse = bag.osc(x.whineHz, 'sawtooth', dieselPartials());
  const jitter = bag.gain(x.jitterHz);
  chain(bag.noise('brown'), jitter);
  jitter.connect(pulse.frequency);
  const clip = bag.shaper(x.drive);
  const bus = bag.gain(1);
  chain(pulse, clip, bus);
  const lowpass = bag.filter('lowpass', x.toneLowpassHz, 0.7);
  for (const band of voicing.resonators) {
    chain(bus, bag.filter('bandpass', band.hz, band.q), bag.gain(band.gain), lowpass);
  }
  const gain = bag.gain(x.whineGain);
  chain(lowpass, gain, mix);
  return { pulse, jitter, lowpass, gain };
}

function applyDiesel(p: DieselParts, x: EngineTargets, t: number, tau: number): void {
  glide(p.jitter.gain, x.jitterHz, t, tau);
  glide(p.lowpass.frequency, x.toneLowpassHz, t, tau);
  glide(p.gain.gain, x.whineGain, t, tau);
}

// --- another ship ---------------------------------------------------------------

interface RemoteParts {
  readonly band: BiquadFilterNode;
  readonly amp: GainNode;
  readonly lfo: OscillatorNode;
  readonly depth: GainNode;
  readonly lowpass: BiquadFilterNode;
  readonly pan: StereoPannerNode | null;
}

/** The cheap one-chain engine of a ship heard at a distance. */
export class RemoteEngineVoice extends ContinuousVoice<RemoteEngineInput> {
  private parts!: RemoteParts;

  constructor(
    ctx: BaseAudioContext,
    sink: AudioNode,
    private readonly profile: EngineProfile,
    opts: { rand?: Rand } = {},
  ) {
    super(ctx, opts.rand ?? Math.random);
    this.boot(sink, () => this.build());
  }

  private build(): GainNode {
    const x = remoteEngineTargets(this.profile, { speed01: 0, distance01: 1, pan: 0 });
    const band = this.bag.filter('bandpass', x.bandHz, 1.5);
    const amp = this.bag.gain(x.ampGain);
    const lfo = this.bag.osc(x.bladeHz, 'sine', THROB_PULSE);
    const depth = this.bag.gain(x.ampDepth);
    lfo.connect(depth).connect(amp.gain);
    const lowpass = this.bag.filter('lowpass', x.lowpassHz, 0.7);
    const pan = this.bag.panner();
    // `out` is the distance gain: it rides the voice output so setLevel trims it.
    const out = this.bag.gain(SILENCE);
    chain(this.bag.noise('brown'), band, amp, lowpass, pan, out);
    this.parts = { band, amp, lfo, depth, lowpass, pan };
    return out;
  }

  update(input: RemoteEngineInput, nowS?: number): void {
    const t = this.when(nowS);
    if (!this.admit(t, false)) return;
    const x: RemoteEngineTargets = remoteEngineTargets(this.profile, input);
    const p = this.parts;
    glide(p.band.frequency, x.bandHz, t, GLIDE_TAU_S);
    glide(p.lfo.frequency, x.bladeHz, t, GLIDE_TAU_S);
    glide(p.depth.gain, x.ampDepth, t, GLIDE_TAU_S);
    glide(p.lowpass.frequency, x.lowpassHz, t, GLIDE_TAU_S);
    if (p.pan) glide(p.pan.pan, x.pan, t, GLIDE_TAU_S);
    this.writeLevel(x.gain, t, GLIDE_TAU_S);
  }
}
