// THE STORM BED (Story 10.13, Eric 2026-11-11: "continuous storm bed"): wind
// and rain that play the whole time the ship is inside the storm and fade when
// it leaves — a continuous voice like the engine, not a one-shot warning.
//
//   wind:    pink noise → band (centre wanders slowly) → wander AM → wind gain ─┐
//   rain:    white noise → highpass → lowpass → rain gain ───────────────────────┤→ out → sink
//   thunder: brown noise → lowpass → thunder envelope (a rumble every so often) ┘
//
// The arithmetic is pure (`stormBedTargets`); the class builds its graph once
// and afterwards only glides params. BaseAudioContext APIs only, so it renders
// offline for the audition self-test. Thunder is scheduled from `update`, so
// it needs no timer of its own.

import { noiseBuffer, noiseOffset, type NoiseColor } from './synth/noise.js';

/** Gain floor: exponential ramps and "silent" targets never reach exactly 0. */
export const SILENCE = 0.0001;

/** Enter/leave fade time constant, seconds (~1.5 s, Eric's "fade when you leave"). */
export const STORM_FADE_TAU_S = 1.5;
/** Default release fade, seconds. */
export const STORM_RELEASE_S = 3;

export type Range = readonly [lo: number, hi: number];

export interface StormBedProfile {
  /** Wind band centre (Hz) and level, by intensity. */
  readonly windHz: Range;
  readonly windGain: Range;
  readonly windQ: number;
  /** Slow wander of the wind: rate (Hz) and depth (fraction of the centre / of the level). */
  readonly wanderHz: number;
  readonly wanderDepth: number;
  /** Rain: a soft band of high noise; level by intensity. */
  readonly rainBand: Range;
  readonly rainGain: Range;
  /** Far thunder: peak level at full intensity (0 = none) and the gap between rumbles, seconds. */
  readonly thunderGain: number;
  readonly thunderEveryS: Range;
  /** Overall level at full intensity. */
  readonly level: number;
}

export interface StormBedTargets {
  readonly windHz: number;
  readonly windGain: number;
  readonly rainGain: number;
  readonly thunderGain: number;
  readonly level: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (r: Range, x: number): number => r[0] + (r[1] - r[0]) * x;
const floor = (g: number): number => Math.max(SILENCE, g);

/** Pure: every target for this intensity (0 = outside the storm). Junk reads as 0. */
export function stormBedTargets(profile: StormBedProfile, intensity01: number): StormBedTargets {
  const i = Number.isFinite(intensity01) ? clamp01(intensity01) : 0;
  return {
    windHz: lerp(profile.windHz, i),
    windGain: floor(lerp(profile.windGain, i)),
    rainGain: floor(lerp(profile.rainGain, i)),
    thunderGain: floor(profile.thunderGain * i),
    level: floor(profile.level * i),
  };
}

/** Ramp a gain from where it is now down to the silence floor over `fadeS`. */
function fadeOut(g: GainNode, t: number, fadeS: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(Math.max(SILENCE, g.gain.value), t);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + fadeS);
}

const THUNDER = { lowpassHz: 140, attackS: 0.4, decayTauS: 1.1, firstS: [1.5, 5] as Range } as const;
const WIND_WANDER_RATES = [1, 2.3] as const;

interface Parts {
  windBand: BiquadFilterNode;
  windWander: GainNode;
  windGain: GainNode;
  rainGain: GainNode;
  thunderEnv: GainNode;
  out: GainNode;
}

export class StormBedVoice {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: Array<{ src: AudioScheduledSourceNode; offset?: number }> = [];
  private parts: Parts | null = null;
  private isReleased = false;
  private nextThunderS: number;
  private lastIntensity = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    sink: AudioNode,
    private readonly profile: StormBedProfile,
    private readonly opts: { rand?: () => number } = {},
  ) {
    this.nextThunderS = ctx.currentTime + lerp(THUNDER.firstS, this.rand());
    try {
      this.parts = this.build();
      this.parts.out.connect(sink);
      for (const { src, offset } of this.sources) {
        if (offset === undefined) src.start(ctx.currentTime);
        else (src as AudioBufferSourceNode).start(ctx.currentTime, offset);
      }
    } catch {
      this.isReleased = true;
      this.disconnect();
    }
  }

  get released(): boolean {
    return this.isReleased;
  }

  private rand(): number {
    return (this.opts.rand ?? Math.random)();
  }

  private keep<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  private gain(v: number): GainNode {
    const g = this.keep(this.ctx.createGain());
    g.gain.value = v;
    return g;
  }

  private filter(type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
    const f = this.keep(this.ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    return f;
  }

  private noise(color: NoiseColor): AudioBufferSourceNode {
    const src = this.keep(this.ctx.createBufferSource());
    src.buffer = noiseBuffer(this.ctx, color);
    src.loop = true;
    this.sources.push({ src, offset: noiseOffset(0, () => this.rand()) });
    return src;
  }

  private lfo(hz: number, depth: number, param: AudioParam): void {
    const osc = this.keep(this.ctx.createOscillator());
    osc.frequency.value = hz;
    osc.connect(this.gain(depth)).connect(param);
    this.sources.push({ src: osc });
  }

  private build(): Parts {
    const p = this.profile;
    const x = stormBedTargets(p, 0);
    const out = this.gain(SILENCE);
    const windBand = this.filter('bandpass', x.windHz, p.windQ);
    const windWander = this.gain(1 - p.wanderDepth / 2);
    const windGain = this.gain(x.windGain);
    this.noise('pink').connect(windBand).connect(windWander).connect(windGain).connect(out);
    for (const k of WIND_WANDER_RATES) {
      this.lfo(p.wanderHz * k, (p.wanderDepth * x.windHz) / 2, windBand.frequency);
      this.lfo(p.wanderHz * k * 0.7, p.wanderDepth / 4, windWander.gain);
    }
    const rainGain = this.gain(x.rainGain);
    this.noise('white').connect(this.filter('highpass', p.rainBand[0])).connect(this.filter('lowpass', p.rainBand[1])).connect(rainGain).connect(out);
    const thunderEnv = this.gain(SILENCE);
    this.noise('brown').connect(this.filter('lowpass', THUNDER.lowpassHz)).connect(thunderEnv).connect(out);
    return { windBand, windWander, windGain, rainGain, thunderEnv, out };
  }

  /** Glide toward `intensity01` (0 = outside the storm) with the slow fade. Junk reads as 0. */
  update(intensity01: number, nowS?: number): void {
    const parts = this.parts;
    if (this.isReleased || !parts) return;
    const t = nowS !== undefined && Number.isFinite(nowS) ? nowS : this.ctx.currentTime;
    const x = stormBedTargets(this.profile, intensity01);
    this.lastIntensity = Number.isFinite(intensity01) ? clamp01(intensity01) : 0;
    parts.windBand.frequency.setTargetAtTime(x.windHz, t, STORM_FADE_TAU_S);
    parts.windGain.gain.setTargetAtTime(x.windGain, t, STORM_FADE_TAU_S);
    parts.rainGain.gain.setTargetAtTime(x.rainGain, t, STORM_FADE_TAU_S);
    parts.out.gain.setTargetAtTime(x.level, t, STORM_FADE_TAU_S);
    this.thunder(parts, x.thunderGain, t);
  }

  /** A far rumble once the gap has passed (and only while in the storm). */
  private thunder(parts: Parts, peak: number, t: number): void {
    if (t < this.nextThunderS) return;
    this.nextThunderS = t + lerp(this.profile.thunderEveryS, this.rand());
    if (!(this.profile.thunderGain > 0) || this.lastIntensity <= 0) return;
    const g = parts.thunderEnv.gain;
    g.setTargetAtTime(peak, t, THUNDER.attackS / 3);
    g.setTargetAtTime(SILENCE, t + THUNDER.attackS, THUNDER.decayTauS);
  }

  /** Fade out over `fadeS`, then stop every source and disconnect. */
  release(fadeS: number = STORM_RELEASE_S): void {
    if (this.isReleased) return;
    this.isReleased = true;
    const fade = Number.isFinite(fadeS) && fadeS > 0 ? fadeS : STORM_RELEASE_S;
    const t = this.ctx.currentTime;
    if (this.parts) fadeOut(this.parts.out, t, fade);
    const first = this.sources[0]?.src;
    if (first) first.onended = () => this.disconnect();
    try {
      for (const { src } of this.sources) src.stop(t + fade);
    } catch {
      this.disconnect();
    }
  }

  private disconnect(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // already detached
      }
    }
  }
}
