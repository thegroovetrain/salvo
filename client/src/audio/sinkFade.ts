// THE SINKING FADE (Story 10.13, Eric 2026-11-11: "continuous klaxon fading
// out as you take on water and eventually all sound goes quiet"). An INSERT
// the game puts on its effects bus for the own-ship sinking window:
//
//   input → level → lowpass → output
//   water (pink noise) → band → water gain ──┘
//
// As `progress01` runs 0 → 1 the lowpass closes over everything, the level
// falls to the silence floor, and a rush of water swells and then dies away.
// The arithmetic is pure (`sinkFadeTargets`); the class is wiring only and
// uses BaseAudioContext APIs, so it renders offline too.

import { noiseBuffer, noiseOffset } from './synth/noise.js';

/** Gain floor: exponential ramps and "silent" targets never reach exactly 0. */
export const SILENCE = 0.0001;

export const SINK_FADE = {
  /** Lowpass at progress 0 (wide open) and at 1 (only a dull thud gets through). */
  openLowpassHz: 20_000,
  closedLowpassHz: 120,
  /** Peak level of the water rush (at progress 0.5). */
  waterPeak: 0.5,
  /** Centre and Q of the water rush band. */
  waterHz: 450,
  waterQ: 0.7,
  /** Glide time constant for every update. */
  tauS: 0.2,
} as const;

export interface SinkFadeTargets {
  lowpassHz: number;
  gain: number;
  waterGain: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Pure: the insert's targets at a point in the sinking. Lowpass and gain only
 * fall as progress rises (gain reaches the silence floor at 1); the water
 * rises then falls back to the floor by 1. Junk progress reads as 0.
 */
export function sinkFadeTargets(progress01: number): SinkFadeTargets {
  const p = Number.isFinite(progress01) ? clamp01(progress01) : 0;
  const { openLowpassHz, closedLowpassHz, waterPeak } = SINK_FADE;
  return {
    lowpassHz: openLowpassHz * (closedLowpassHz / openLowpassHz) ** p,
    gain: p >= 1 ? SILENCE : Math.max(SILENCE, (1 - p) ** 2),
    waterGain: p >= 1 ? SILENCE : Math.max(SILENCE, waterPeak * Math.sin(Math.PI * p)),
  };
}

export class SinkFade {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly water: AudioBufferSourceNode;
  private readonly waterGain: GainNode;
  private readonly nodes: AudioNode[];
  private released = false;

  constructor(private readonly ctx: BaseAudioContext) {
    const t = sinkFadeTargets(0);
    this.input = ctx.createGain();
    this.input.gain.value = t.gain;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = t.lowpassHz;
    this.output = ctx.createGain();
    this.input.connect(this.lowpass).connect(this.output);
    this.water = ctx.createBufferSource();
    this.water.buffer = noiseBuffer(ctx, 'pink');
    this.water.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = SINK_FADE.waterHz;
    band.Q.value = SINK_FADE.waterQ;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = t.waterGain;
    this.water.connect(band).connect(this.waterGain).connect(this.lowpass);
    this.water.start(ctx.currentTime, noiseOffset(0));
    this.nodes = [this.input, this.lowpass, this.output, this.water, band, this.waterGain];
  }

  /** Glide toward the targets for `progress01`, starting at `nowS` (default now). */
  update(progress01: number, nowS?: number): void {
    if (this.released) return;
    const t = nowS !== undefined && Number.isFinite(nowS) ? nowS : this.ctx.currentTime;
    const x = sinkFadeTargets(progress01);
    this.input.gain.setTargetAtTime(x.gain, t, SINK_FADE.tauS);
    this.lowpass.frequency.setTargetAtTime(x.lowpassHz, t, SINK_FADE.tauS);
    this.waterGain.gain.setTargetAtTime(x.waterGain, t, SINK_FADE.tauS);
  }

  /** Stop the water and disconnect everything (the caller has unplugged the insert or is done with it). */
  release(): void {
    if (this.released) return;
    this.released = true;
    try {
      this.water.stop();
    } catch {
      // already stopped
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // already detached
      }
    }
  }
}
