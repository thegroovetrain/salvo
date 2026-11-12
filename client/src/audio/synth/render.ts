// The layered-cue RENDERER (Story 10.13): turns a `CueRecipe` into Web Audio
// nodes for one shot. The only file on the synthesis path that touches nodes.
// Uses BaseAudioContext APIs only, so the same code plays live in the game and
// renders offline for the audition page / pre-rendered variants.
//
// One shot's graph:
//
//   grains… → cueIn (level) → [distance lowpass] → post ─┬→ [panner] → sink
//                                                        ├→ echo: delay → lowpass → gain → [panner]
//                                                        └→ send → [highpass] → shared reverb → sink
//
// The distance PRE-DELAY is not a DelayNode: the whole shot is simply
// scheduled later, which costs nothing and needs no factory.

import { noiseBuffer, noiseOffset, softClipCurve } from './noise.js';
import { reverbBuffer } from './reverb.js';
import {
  SILENCE,
  distanceShape,
  isPointSweep,
  sweepPoints,
  sweepStartValue,
  envTimes,
  planShot,
  sanitizeDelay,
  sanitizeDistance,
  sanitizeGain,
  sanitizePan,
  type AmpMod,
  type CueRecipe,
  type EchoPlan,
  type Envelope,
  type Filter,
  type GrainPlan,
  type Layer,
  type ModeBank,
  type OscSource,
  type PointSweep,
  type ShotPlan,
  type Source,
  type Sweep,
} from './recipe.js';

export interface SynthOptions {
  /** Global live-voice cap (default 24); at the cap new cues are dropped. */
  maxVoices?: number;
  /** Randomness for the reverb IR (default Math.random). */
  rand?: () => number;
}

export interface PlayOptions {
  /** 0..1 multiplier on the recipe's level; junk → 1. */
  gain?: number;
  /** -1..1 stereo position; junk → 0. Absent = no panner built. */
  pan?: number;
  /** 0..1 normalized distance (see `distanceShape`); junk → 0. */
  distance01?: number;
  /** Seconds from now to start (e.g. a salvo stagger); junk → 0. */
  delayS?: number;
  /** Per-shot randomness (default Math.random). */
  rand?: () => number;
  /** A hard length ceiling, seconds: a shot whose plan runs longer is faded
   *  out to end AT this length (the horn path's MAX_HORN_S). Junk = none. */
  maxS?: number;
  /** Frequency multiplier for the whole shot (see `planShot`); junk → 1. */
  pitch?: number;
}

/** What one `playResult` call did: sounded, was dropped on purpose (a cap, a
 *  zero level, nothing left after the distance cut), or FAILED to build (an
 *  unsupported node or a throwing factory — the caller may fall back). */
export type PlayResult = 'played' | 'dropped' | 'failed';

export const DEFAULT_MAX_VOICES = 24;

/** Everything one shot built, so it can be torn down as a unit. */
interface Shot {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  /** Each source's scheduled stop time (parallel to `sources`), so an early
   *  stop only ever SHORTENS a source, never extends one. */
  stopAt: number[];
  /** The level the shot's level gain is set to (its param's `.value` may not
   *  have reached it yet when a stop is scheduled ahead). */
  levelValue?: number;
  /** The shot's level gain — everything of the shot (dry, echoes, reverb
   *  send) is downstream of it, so fading it fades the whole shot. */
  level?: GainNode;
  /** Set once the last source has ended and the voice was released. */
  ended?: boolean;
}

/** Default fade of an early stop (s): short enough to read as "it stopped",
 *  long enough not to click. */
export const STOP_FADE_S = 0.08;

/** A live shot, so its owner can end it early (the hull-contact scrape when
 *  the scrape ends). `stop` fades the shot's level to the silence floor over
 *  `fadeS`, then stops its sources — which releases the voice through the
 *  ordinary `ended` path. A no-op once the shot has ended or was stopped. */
export interface ShotHandle {
  stop(fadeS?: number): void;
  readonly ended: boolean;
}

const has = (ctx: BaseAudioContext, factory: string): boolean =>
  typeof (ctx as unknown as Record<string, unknown>)[factory] === 'function';

const centsOf = (fraction: number): number => 1200 * Math.log2(1 + Math.max(-0.99, fraction));

/** Write a Sweep onto a param starting at `t`, every value × `scale`. */
export function applySweep(param: AudioParam, sweep: Sweep, t: number, scale = 1): void {
  if (typeof sweep === 'number') {
    param.setValueAtTime(sweep * scale, t);
    return;
  }
  if (isPointSweep(sweep)) {
    applyPoints(param, sweep, t, scale);
    return;
  }
  if (sweep.tauMs !== undefined) {
    param.setValueAtTime(sweep.from * scale, t);
    param.setTargetAtTime(sweep.to * scale, t, Math.max(0.001, sweep.tauMs / 1000));
    return;
  }
  param.setValueAtTime(Math.max(SILENCE, sweep.from * scale), t);
  param.exponentialRampToValueAtTime(Math.max(SILENCE, sweep.to * scale), t + Math.max(0.001, (sweep.ms ?? 0) / 1000));
}

/** A breakpoint sweep: the first point set, every later one ramped to —
 *  exponential where both ends are above 0, else linear. Every value × `scale`. */
function applyPoints(param: AudioParam, sweep: PointSweep, t: number, scale: number): void {
  const pts = sweepPoints(sweep);
  pts.forEach((p, i) => {
    const at = t + p.atMs / 1000;
    const v = p.value * scale;
    if (i === 0) param.setValueAtTime(v, at);
    else if (pts[i - 1].value * scale > 0 && v > 0) param.exponentialRampToValueAtTime(v, at);
    else param.linearRampToValueAtTime(v, at);
  });
}

/** The first value of a Sweep (FM needs the modulator's start frequency). */
const sweepStart = (s: Sweep): number => sweepStartValue(s);

/** Write the amplitude envelope onto a gain param starting at `t`. */
export function applyEnvelope(param: AudioParam, env: Envelope, t: number, peak: number, decayScale: number): void {
  const e = envTimes(env, decayScale);
  const level = Math.max(SILENCE, peak);
  param.setValueAtTime(SILENCE, t);
  if (e.attackS > 0) param.linearRampToValueAtTime(level, t + e.attackS);
  else param.setValueAtTime(level, t);
  const decayAt = t + e.attackS + e.holdS;
  if (e.holdS > 0) param.setValueAtTime(level, decayAt);
  if (e.mode === 'tau') param.setTargetAtTime(SILENCE, decayAt, Math.max(0.001, e.decayS));
  else param.exponentialRampToValueAtTime(SILENCE, decayAt + Math.max(0.001, e.decayS));
}

export class Synth {
  private readonly maxVoices: number;
  private readonly rand: () => number;
  private live = 0;
  private readonly families = new Map<string, number>();
  /** Shared reverb input: undefined = not built yet, null = unavailable. */
  private reverbIn: AudioNode | null | undefined;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly sink: AudioNode,
    opts: SynthOptions = {},
  ) {
    const cap = opts.maxVoices;
    this.maxVoices = cap !== undefined && Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : DEFAULT_MAX_VOICES;
    this.rand = opts.rand ?? Math.random;
  }

  /** Voices sounding now (global, or in one family). */
  get liveVoices(): number {
    return this.live;
  }

  familyVoices(family: string): number {
    return this.families.get(family) ?? 0;
  }

  /**
   * Play one shot of `recipe`. Returns false — and builds nothing — when the
   * cue is dropped: the global or family voice cap is reached (a late cue is
   * a lie about when it happened, so nothing is queued or stolen), the level
   * is 0, nothing survives the distance cut, or the graph could not be built.
   * Never throws.
   */
  play(recipe: CueRecipe, opts: PlayOptions = {}): boolean {
    return this.launch(recipe, opts).result === 'played';
  }

  /** `play`, telling a deliberate drop apart from a build failure. Never throws. */
  playResult(recipe: CueRecipe, opts: PlayOptions = {}): PlayResult {
    return this.launch(recipe, opts).result;
  }

  /** `playResult` plus, when the shot sounded, a handle that can end it early. */
  launch(recipe: CueRecipe, opts: PlayOptions = {}): { result: PlayResult; handle: ShotHandle | null } {
    if (!this.hasRoom(recipe)) return DROPPED;
    const level = sanitizeGain(recipe.gain) * sanitizeGain(opts.gain);
    const d01 = sanitizeDistance(opts.distance01);
    const plan = planShot(recipe, opts.rand ?? Math.random, d01, opts.pitch);
    if (level <= 0 || plan.grains.length === 0) return DROPPED;
    const shot: Shot = { nodes: [], sources: [], stopAt: [] };
    try {
      const t0 = this.buildShot(shot, recipe, plan, level, d01, opts);
      capShot(shot, t0, plan.lengthS, opts.maxS);
    } catch {
      teardown(shot, true);
      return { result: 'failed', handle: null };
    }
    this.track(shot, recipe.family);
    return { result: 'played', handle: this.handleOf(shot) };
  }

  private handleOf(shot: Shot): ShotHandle {
    const ctx = this.ctx;
    let stopped = false;
    return {
      get ended() {
        return shot.ended === true;
      },
      stop(fadeS?: number) {
        if (stopped || shot.ended) return;
        stopped = true;
        const fade = fadeS !== undefined && Number.isFinite(fadeS) && fadeS > 0 ? fadeS : STOP_FADE_S;
        const t = ctx.currentTime;
        stopShot(shot, t, fade);
      },
    };
  }

  private hasRoom(recipe: CueRecipe): boolean {
    if (this.live >= this.maxVoices) return false;
    if (recipe.family === undefined || recipe.maxVoices === undefined) return true;
    return this.familyVoices(recipe.family) < recipe.maxVoices;
  }

  /** Build the shot's graph; returns its start time. */
  private buildShot(shot: Shot, recipe: CueRecipe, plan: ShotPlan, level: number, d01: number, opts: PlayOptions): number {
    const shape = distanceShape(d01);
    const t0 = this.ctx.currentTime + sanitizeDelay(opts.delayS) + shape.preDelayS;
    const out = this.outNode(shot, opts.pan, t0);
    const cueIn = this.gain(shot, level * shape.gain, t0);
    shot.level = cueIn;
    shot.levelValue = level * shape.gain;
    const post = d01 > 0 ? this.filter(shot, { type: 'lowpass', freq: shape.lowpassHz }, t0, 1) : cueIn;
    if (post !== cueIn) cueIn.connect(post);
    post.connect(out);
    for (const e of plan.echoes) this.echo(shot, post, out, e, t0);
    this.send(shot, post, recipe, shape.wet, t0);
    // Every source is held open for the echo tail, so the delay lines are not
    // disconnected mid-repeat when the voice is released.
    for (const g of plan.grains) {
      this.grain(shot, recipe.layers[g.layer], g, cueIn, t0 + g.onsetS, g.lengthS + plan.echoTailS);
    }
    return t0;
  }

  /** Where the dry path lands: a panner when a pan was given (and exists), else the sink. */
  private outNode(shot: Shot, pan: number | undefined, t0: number): AudioNode {
    if (pan === undefined || !has(this.ctx, 'createStereoPanner')) return this.sink;
    const panner = this.ctx.createStereoPanner();
    shot.nodes.push(panner);
    panner.pan.setValueAtTime(sanitizePan(pan), t0);
    panner.connect(this.sink);
    return panner;
  }

  private echo(shot: Shot, from: AudioNode, to: AudioNode, e: EchoPlan, t0: number): void {
    if (!has(this.ctx, 'createDelay') || !(e.delayS > 0)) return;
    const delay = this.ctx.createDelay(e.delayS + 0.1);
    shot.nodes.push(delay);
    delay.delayTime.setValueAtTime(e.delayS, t0);
    const lp = this.filter(shot, { type: 'lowpass', freq: e.lowpassHz }, t0, 1);
    from.connect(delay).connect(lp).connect(this.gain(shot, sanitizeGain(e.gain), t0)).connect(to);
  }

  private send(shot: Shot, from: AudioNode, recipe: CueRecipe, wet: number, t0: number): void {
    const amount = Math.max(0, Math.min(1, recipe.reverb ?? 0));
    if (!(amount > 0)) return;
    const reverb = this.reverbInput();
    if (!reverb) return;
    const send = this.gain(shot, amount * wet, t0);
    from.connect(send);
    const hp = recipe.reverbHighpassHz;
    if (hp !== undefined && hp > 0) send.connect(this.filter(shot, { type: 'highpass', freq: hp }, t0, 1)).connect(reverb);
    else send.connect(reverb);
  }

  /** The ONE shared convolver, built on first use; null when unsupported. */
  private reverbInput(): AudioNode | null {
    if (this.reverbIn !== undefined) return this.reverbIn;
    this.reverbIn = null;
    if (!has(this.ctx, 'createConvolver')) return null;
    try {
      const conv = this.ctx.createConvolver();
      conv.buffer = reverbBuffer(this.ctx, this.rand);
      conv.connect(this.sink);
      this.reverbIn = conv;
    } catch {
      this.reverbIn = null;
    }
    return this.reverbIn;
  }

  /** One grain: source → filters → [modes] → env → [drive] → [AM] → dest. */
  private grain(shot: Shot, layer: Layer, g: GrainPlan, dest: AudioNode, t: number, runS: number): void {
    let node = this.source(shot, layer.source, g.freqScale, t, runS);
    for (const f of layer.filters ?? []) node = node.connect(this.filter(shot, f, t, g.freqScale));
    const env = this.ctx.createGain();
    shot.nodes.push(env);
    applyEnvelope(env.gain, layer.env, t, layer.env.peak * g.gain, g.decayScale);
    if (layer.modes) this.modes(shot, node, env, layer.modes, g.freqScale, t);
    else node.connect(env);
    node = this.drive(shot, env, layer.drive);
    node = this.am(shot, node, layer.am, g.amRateScale, t, runS);
    node.connect(dest);
  }

  private source(shot: Shot, src: Source, scale: number, t: number, runS: number): AudioNode {
    if (src.kind === 'osc') return this.osc(shot, src, scale, t, runS);
    const buf = this.ctx.createBufferSource();
    buf.buffer = noiseBuffer(this.ctx, src.kind === 'click' ? 'white' : src.color);
    buf.loop = true;
    this.start(shot, buf, t, runS, noiseOffset(0));
    if (src.kind === 'noise') return buf;
    // The click's own linear gate: a burst that falls to 0 over `ms`.
    const gate = this.ctx.createGain();
    shot.nodes.push(gate);
    gate.gain.setValueAtTime(1, t);
    gate.gain.linearRampToValueAtTime(0, t + Math.max(0.0005, src.ms / 1000));
    return buf.connect(gate);
  }

  private osc(shot: Shot, src: OscSource, scale: number, t: number, runS: number): AudioNode {
    const osc = this.ctx.createOscillator();
    this.setWave(osc, src.wave);
    applySweep(osc.frequency, src.freq, t, scale);
    this.start(shot, osc, t, runS);
    if (src.vibrato) this.lfo(shot, osc.detune, src.vibrato.rateHz, centsOf(src.vibrato.depth), 'sine', t, runS);
    if (src.fm) {
      const mod = this.ctx.createOscillator();
      const modScale = scale * src.fm.ratio;
      applySweep(mod.frequency, src.freq, t, modScale);
      const dev = this.ctx.createGain();
      shot.nodes.push(dev);
      applySweep(dev.gain, src.fm.index, t, sweepStart(src.freq) * modScale);
      mod.connect(dev).connect(osc.frequency);
      this.start(shot, mod, t, runS);
    }
    return osc;
  }

  /** A stock wave, or a partials series through createPeriodicWave (sawtooth
   *  when the browser has no such factory). */
  private setWave(osc: OscillatorNode, wave: OscSource['wave']): void {
    if (typeof wave === 'string') {
      osc.type = wave;
      return;
    }
    if (!has(this.ctx, 'createPeriodicWave') || wave.partials.length === 0) {
      osc.type = 'sawtooth';
      return;
    }
    const imag = new Float32Array(wave.partials.length + 1);
    wave.partials.forEach((a, i) => (imag[i + 1] = Number.isFinite(a) ? a : 0));
    osc.setPeriodicWave(this.ctx.createPeriodicWave(new Float32Array(imag.length), imag));
  }

  /** A modulating oscillator: lfo → depth gain → param. */
  private lfo(shot: Shot, param: AudioParam, rateHz: number, depth: number, wave: OscillatorType, t: number, runS: number): void {
    const lfo = this.ctx.createOscillator();
    lfo.type = wave;
    lfo.frequency.setValueAtTime(rateHz, t);
    const depthGain = this.gain(shot, depth, t);
    lfo.connect(depthGain).connect(param);
    this.start(shot, lfo, t, runS);
  }

  private modes(shot: Shot, from: AudioNode, to: AudioNode, bank: ModeBank, scale: number, t: number): void {
    const falloff = bank.falloffDb ?? 3;
    bank.ratios.forEach((ratio, i) => {
      const bp = this.filter(shot, { type: 'bandpass', freq: bank.f0 * ratio, q: bank.q }, t, scale);
      from.connect(bp).connect(this.gain(shot, Math.pow(10, (-falloff * i) / 20), t)).connect(to);
    });
  }

  private drive(shot: Shot, from: AudioNode, k: number | undefined): AudioNode {
    if (k === undefined || !(k > 0) || !has(this.ctx, 'createWaveShaper')) return from;
    const shaper = this.ctx.createWaveShaper();
    shot.nodes.push(shaper);
    shaper.curve = softClipCurve(k) as Float32Array<ArrayBuffer>;
    shaper.oversample = '4x';
    return from.connect(shaper);
  }

  /** Level swings between (1 - depth) and 1: base gain 1 - depth/2, LFO ± depth/2. */
  private am(shot: Shot, from: AudioNode, am: AmpMod | undefined, rateScale: number, t: number, runS: number): AudioNode {
    if (!am) return from;
    const depth = Math.max(0, Math.min(1, am.depth));
    const vca = this.gain(shot, 1 - depth / 2, t);
    this.lfo(shot, vca.gain, am.rateHz * rateScale, depth / 2, am.wave ?? 'sine', t, runS);
    return from.connect(vca);
  }

  private filter(shot: Shot, f: Filter, t: number, scale: number): BiquadFilterNode {
    const bq = this.ctx.createBiquadFilter();
    shot.nodes.push(bq);
    bq.type = f.type;
    // Settle the coefficients NOW, not only at `t`: a source may start a frame
    // before its filter's scheduled values (start times and automation times
    // round to frames differently), and a high-Q resonator whose frequency / Q
    // jump from the defaults while it already carries signal rings out tens of
    // dB hot (measured in Chromium: +25 dB on a Q 90 mode bank).
    if (f.q !== undefined) bq.Q.value = f.q;
    if (f.gainDb !== undefined && Number.isFinite(f.gainDb)) bq.gain.value = f.gainDb;
    bq.frequency.value = Math.max(SILENCE, sweepStart(f.freq) * scale);
    applySweep(bq.frequency, f.freq, t, scale);
    return bq;
  }

  private gain(shot: Shot, value: number, t: number): GainNode {
    const g = this.ctx.createGain();
    shot.nodes.push(g);
    g.gain.setValueAtTime(value, t);
    return g;
  }

  private start(shot: Shot, src: AudioScheduledSourceNode, t: number, runS: number, offset?: number): void {
    shot.nodes.push(src);
    shot.sources.push(src);
    if (offset !== undefined) (src as AudioBufferSourceNode).start(t, offset);
    else src.start(t);
    const end = t + runS + 0.02;
    src.stop(end);
    shot.stopAt.push(end);
  }

  /** Count the voice until its LAST source ends, then disconnect everything. */
  private track(shot: Shot, family: string | undefined): void {
    this.live++;
    if (family !== undefined) this.families.set(family, this.familyVoices(family) + 1);
    let pending = shot.sources.length;
    const release = (): void => {
      pending--;
      if (pending > 0) return;
      teardown(shot);
      shot.ended = true;
      this.live = Math.max(0, this.live - 1);
      if (family !== undefined) this.families.set(family, Math.max(0, this.familyVoices(family) - 1));
    };
    for (const s of shot.sources) s.onended = release;
  }
}

const DROPPED: { result: PlayResult; handle: null } = { result: 'dropped', handle: null };

/** End a live shot early: fade its level to the floor over `fade`, then stop
 *  every source at the end of the fade (their `ended` releases the voice). */
function stopShot(shot: Shot, t: number, fade: number, from?: number): void {
  const g = shot.level?.gain;
  if (g) {
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(SILENCE, from ?? g.value), t);
      g.exponentialRampToValueAtTime(SILENCE, t + fade);
    } catch {
      /* a param that refuses automation: the stop below still ends the shot */
    }
  }
  const end = t + fade;
  shot.sources.forEach((s, i) => {
    if (!(shot.stopAt[i] > end)) return; // never extend a source that ends sooner
    try {
      s.stop(end);
      shot.stopAt[i] = end;
    } catch {
      /* already stopped */
    }
  });
}

/** Longest fade a length ceiling uses (s); a short ceiling fades over a quarter of itself. */
export const CAP_FADE_S = 0.5;

/** Apply a length ceiling: a shot planned longer than `maxS` fades out to end at it. */
function capShot(shot: Shot, t0: number, lengthS: number, maxS: number | undefined): void {
  if (maxS === undefined || !Number.isFinite(maxS) || maxS <= 0 || lengthS <= maxS) return;
  const fade = Math.min(CAP_FADE_S, maxS / 4);
  stopShot(shot, t0 + maxS - fade, fade, shot.levelValue);
}

/** Silence and disconnect every node of a shot; a node that refuses is
 *  ignored (a released voice's sources have already stopped). */
function teardown(shot: Shot, stop = false): void {
  if (stop) {
    for (const s of shot.sources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* never started or already stopped */
      }
    }
  }
  for (const n of shot.nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected — nothing to collect */
    }
  }
}
