// Reusable LAYER BUILDERS for the shipped recipes (Story 10.13, epic-10 amendment 22). Each
// returns plain `Layer` data — nothing here touches a node. The recipes are the
// research record's (sound-synthesis-research-2026-11-11.md); the section a
// builder comes from is named on it. Peaks are relative: the self-test of the
// audition builder (client/scripts/soundAudition.mjs --selftest) is what
// balanced them against each other through the master chain.

import type { Envelope, Filter, Layer, NoiseSource, Sweep } from '../recipe.js';
import type { NoiseColor } from '../noise.js';

const noise = (color: NoiseColor): NoiseSource => ({ kind: 'noise', color });

/** Filtered noise with an envelope. */
export function noiseLayer(color: NoiseColor, filters: readonly Filter[], env: Envelope, extra: Partial<Layer> = {}): Layer {
  return { source: noise(color), filters, env, ...extra };
}

/** One sine (or other wave) with an envelope. */
export function tone(freq: Sweep, env: Envelope, extra: Partial<Layer> = {}, wave: 'sine' | 'triangle' | 'sawtooth' | 'square' = 'sine'): Layer {
  return { source: { kind: 'osc', wave, freq }, env, ...extra };
}

const lp = (freq: Sweep, q?: number): Filter => ({ type: 'lowpass', freq, q });
const hp = (freq: Sweep, q?: number): Filter => ({ type: 'highpass', freq, q });
const bp = (freq: Sweep, q?: number): Filter => ({ type: 'bandpass', freq, q });
export const filters = { lp, hp, bp };

/** A falling sine "thump", soft-clipped so small speakers still get weight (§2). */
export function thump(from: number, to: number, glideMs: number, peak: number, tauMs: number, extra: Partial<Layer> = {}): Layer {
  return tone({ from, to, ms: glideMs }, { peak, attackMs: 2, tauMs }, { drive: 2.5, ...extra });
}

/** High-passed white-noise crack (§2 / §3). */
export function crack(hpHz: number, peak: number, tauMs: number, extra: Partial<Layer> = {}): Layer {
  return noiseLayer('white', [hp(hpHz)], { peak, attackMs: 0.5, tauMs }, extra);
}

/** A metal ring: noise exciting inharmonic resonators (§7, §8). */
export function metalRing(f0: number, ratios: readonly number[], q: number, peak: number, tauMs: number, extra: Partial<Layer> = {}): Layer {
  return noiseLayer('white', [], { peak, attackMs: 1, tauMs }, { modes: { f0, ratios, q }, ...extra });
}

/** Inharmonic partial ratios that read as struck plate steel (§7). */
export const STEEL = [1, 1.47, 2.09, 2.56, 3.39, 4.17] as const;

/** Rising-pitch bubble grains (§5, the SC bubble model). */
export function bubbles(count: number, windowMs: number, peak: number, startMs: number, spread: readonly [number, number] = [0.6, 2.5]): Layer {
  return tone({ from: 1000, to: 1600, ms: 90 }, { peak, attackMs: 8, tauMs: 30 }, {
    startMs,
    grains: { count, windowMs, thin: 0.5, spread },
  });
}

/** Droplets falling back after a splash: short high pings, thinning out (§7). */
export function droplets(count: number, windowMs: number, peak: number, startMs: number): Layer {
  return tone({ from: 2000, to: 2600, ms: 20 }, { peak, attackMs: 1, tauMs: 9 }, {
    startMs,
    grains: { count, windowMs, thin: 1.2, spread: [0.5, 2] },
  });
}

/** The §7 "water column" splash, every peak × `scale`, starting at `startMs`. */
export function splash(scale: number, startMs = 0): Layer[] {
  return [
    noiseLayer('white', [bp({ from: 2500, to: 400, ms: 350 }, 1)], { peak: 0.9 * scale, attackMs: 5, tauMs: 150 }, { startMs, jitter: { freq: 0.1, decay: 0.15 } }),
    noiseLayer('brown', [lp(600)], { peak: 1.2 * scale, attackMs: 4, tauMs: 250 }, { startMs }),
    tone(90, { peak: 0.5 * scale, attackMs: 2, endMs: 30 }, { startMs }),
    droplets(60, 1200, 0.05 * scale, startMs + 300),
  ];
}

/** The §3 secondary-gun bark, every peak × `scale`; `muffleHz` darkens it (a special-shell launch). */
export function bark(scale: number, muffleHz?: number): Layer[] {
  const muffle = muffleHz !== undefined ? [lp(muffleHz)] : [];
  return [
    noiseLayer('white', [hp(1200), ...muffle], { peak: 0.5 * scale, attackMs: 0.5, tauMs: 25 }, { farCut: 0.5 }),
    noiseLayer('white', [bp(320, 1.2), ...muffle], { peak: 1.6 * scale, attackMs: 1, tauMs: 70 }, { jitter: { freq: 0.1 } }),
    thump(110, 55, 70, 0.6 * scale, 60),
    noiseLayer('brown', [lp(400)], { peak: 0.5 * scale, attackMs: 5, tauMs: 180 }),
  ];
}

/** A hiss that sputters (§9 / the [S1] fire recipe's hiss). */
export function hiss(hpHz: number, peak: number, holdMs: number, tauMs: number, extra: Partial<Layer> = {}): Layer {
  return noiseLayer('white', [hp(hpHz)], { peak, attackMs: 60, holdMs, tauMs }, {
    am: { rateHz: 11, depth: 0.35, jitter: 0.3, wave: 'triangle' },
    ...extra,
  });
}

/** Random fire crackles: short white bursts through random bands (§6, [S1]). */
export function crackles(count: number, windowMs: number, peak: number, startMs: number): Layer {
  return {
    source: { kind: 'click', ms: 6 },
    filters: [bp(400, 6)],
    env: { peak, attackMs: 0, tauMs: 8 },
    startMs,
    grains: { count, windowMs, spread: [0.3, 3] },
  };
}

// --- round 2: alerts, signals and shipboard machinery ------------------------

/** A struck bell: FM with an inharmonic ratio whose brightness dies away (§11 B). */
export function bell(hz: number, peak: number, tauMs: number, extra: Partial<Layer> = {}): Layer {
  return {
    source: { kind: 'osc', wave: 'sine', freq: hz, fm: { ratio: 1.4, index: { from: 5, to: 0, tauMs: Math.min(300, tauMs) } } },
    env: { peak, attackMs: 2, tauMs },
    ...extra,
  };
}

/** A steam / air whistle: a chord of buzzy partials with a breathy edge. */
export function whistleChord(hzs: readonly number[], startMs: number, holdMs: number, peak: number): Layer[] {
  const env = { peak, attackMs: 50, holdMs, tauMs: 70 };
  const tones = hzs.map(
    (hz): Layer => ({ source: { kind: 'osc', wave: 'sawtooth', freq: hz, vibrato: { rateHz: 5, depth: 0.003 } }, filters: [lp(2200)], env, startMs }),
  );
  const breath = noiseLayer('white', [bp(hzs[0] * 2, 1.5)], { peak: peak * 2.5, attackMs: 20, holdMs, tauMs: 60 }, { startMs });
  return [...tones, breath];
}

/** An electric buzzer: a square hum through a small speaker, keyed at `onsetsMs`. */
export function buzzer(hz: number, onsetsMs: readonly number[], holdMs: number, peak: number): Layer {
  return {
    source: { kind: 'osc', wave: 'square', freq: hz },
    filters: [bp(hz * 5, 1.2)],
    env: { peak, attackMs: 4, holdMs, tauMs: 10 },
    drive: 2,
    grains: { onsetsMs },
  };
}

/** A short mechanical click: a noise impulse through one band. */
export function click(hz: number, q: number, peak: number, tauMs: number, extra: Partial<Layer> = {}): Layer {
  return { source: { kind: 'click', ms: 2 }, filters: [bp(hz, q)], env: { peak, attackMs: 0, tauMs }, ...extra };
}
