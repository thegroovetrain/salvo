// THE ENGINE'S ARITHMETIC (Story 10.13): a hull's engine character as DATA
// (`EngineProfile`) and the pure maps from (throttle, speed, boost) — and, for
// another ship, (speed, distance, pan) — to every AudioParam target the engine
// graph writes. No nodes here; `engineGraph.ts` owns the WebAudio side, so the
// contracts that matter (monotone, boost never lowers, idle is audible, junk
// never NaNs out) are testable without a context.
//
// Recipes and the "Standard" numbers come from the research record
// (sound-synthesis-research-2026-11-11.md §1); they are tuned by ear later.

/** Gain floor: exponential ramps and "silent" targets never reach exactly 0. */
export const SILENCE = 0.0001;

/** A [low, high] pair the target slides across as its driver goes 0 → 1. */
export type Range = readonly [lo: number, hi: number];

/** One band-pass resonator: centre Hz, Q, linear gain. */
export interface EngineBand {
  readonly hz: number;
  readonly q: number;
  readonly gain: number;
}

/** Recipe B's extra data (diesel only). */
export interface DieselVoicing {
  /** Parallel "pipe / hull" resonators the firing pulses ring through. */
  readonly resonators: readonly EngineBand[];
  /** Lowpass cutoff after the resonators, Hz, by throttle. */
  readonly lowpassHz: Range;
  /** Firing-rate jitter depth as a fraction of the firing rate (0.02 = ±2 %). */
  readonly jitter: number;
}

export interface EngineProfile {
  /** 'turbine' = recipe A (rumble + shaft throb + gear whine); 'diesel' = recipe B (pulse train). */
  readonly kind: 'turbine' | 'diesel';
  /** Propeller shafts: one throb LFO each, detuned so they beat. */
  readonly shafts: number;
  /** Blades per propeller: blade rate = blades × rpm / 60 Hz. */
  readonly blades: number;
  /** Shaft rpm at speed 0 (the plant idles, it does not stop). */
  readonly rpmIdle: number;
  /** Shaft rpm at full speed. */
  readonly rpmMax: number;
  /** Rumble lowpass cutoff, Hz, by throttle (turbine). */
  readonly rumbleHz: Range;
  /** Rumble gain, by throttle (turbine). */
  readonly rumbleGain: Range;
  /** Throb band-pass centre, Hz, by speed. */
  readonly throbHz: Range;
  /** Throb amplitude-modulation depth (0..1 of the throb gain), by speed. */
  readonly throbDepth: Range;
  /** Throb path base gain. */
  readonly throbGain: number;
  /** Turbine: gear-whine pitch, Hz. Diesel: firing-pulse rate, Hz. By throttle. */
  readonly whineHz: Range;
  /** Turbine: whine level. Diesel: pulse-train level. By throttle. */
  readonly whineGain: Range;
  /** Hull-wash band-pass centre, Hz, by speed. */
  readonly washHz: Range;
  /** Hull-wash gain at full speed (scaled by speed^1.5 — silent when stopped). */
  readonly washGain: number;
  /** Spray (high-passed noise) gain per unit of speed above SPRAY_FROM. */
  readonly sprayGain: number;
  /** Soft-clip drive k: [cruising, boost]. */
  readonly drive: Range;
  /** Overall voice level at full load (0..1). */
  readonly level: number;
  /** Sustained boost multipliers (≥ 1; anything lower is read as 1). */
  readonly boostWhine: number;
  readonly boostWash: number;
  readonly boostLevel: number;
  /** Recipe B data; a diesel profile without it uses DEFAULT_DIESEL_VOICING. */
  readonly diesel?: DieselVoicing;
}

/** Research §1 recipe B's resonators and lowpass. */
export const DEFAULT_DIESEL_VOICING: DieselVoicing = {
  resonators: [
    { hz: 110, q: 4, gain: 1 },
    { hz: 240, q: 4, gain: 0.6 },
    { hz: 480, q: 4, gain: 0.3 },
  ],
  lowpassHz: [200, 1400],
  jitter: 0.02,
};

const dB = (db: number): number => 10 ** (db / 20);

/** The research table's "Standard" row on recipe A — the neutral test profile. */
export const DEFAULT_ENGINE_PROFILE: EngineProfile = {
  kind: 'turbine',
  shafts: 4,
  blades: 4,
  rpmIdle: 30,
  rpmMax: 200,
  rumbleHz: [70, 180],
  rumbleGain: [0.35, 0.8],
  throbHz: [55, 115],
  throbDepth: [0.25, 0.55],
  throbGain: 0.5,
  whineHz: [280, 800],
  whineGain: [0.015, 0.04],
  washHz: [600, 1500],
  washGain: 0.5,
  sprayGain: 0.1,
  drive: [1.5, 3],
  level: 0.5,
  boostWhine: 1.05,
  boostWash: dB(4),
  boostLevel: dB(1),
};

/** Own-ship input. `throttle` −1..1 (astern negative; magnitude is used);
 *  `speed01` = |speed| / hull max speed (boost may push it past 1). */
export interface EngineInput {
  readonly throttle: number;
  readonly speed01: number;
  readonly boost: boolean;
}

export interface EngineTargets {
  /** Throb LFO rate per shaft, Hz (blade rate, detuned ± SHAFT_DETUNE). */
  readonly bladeHz: readonly number[];
  readonly rumbleHz: number;
  readonly rumbleGain: number;
  readonly throbHz: number;
  /** Throb gain (the AM carrier level). */
  readonly throbGain: number;
  /** AM depth as an absolute gain swing, summed across shafts. */
  readonly throbDepth: number;
  readonly whineHz: number;
  readonly whineGain: number;
  readonly washHz: number;
  readonly washGain: number;
  readonly sprayGain: number;
  /** Diesel: post-resonator lowpass cutoff, Hz. */
  readonly toneLowpassHz: number;
  /** Diesel: firing-rate jitter depth, Hz. */
  readonly jitterHz: number;
  /** Soft-clip k. */
  readonly drive: number;
  /** Voice output level. */
  readonly level: number;
}

/** Max speed01 honored (boost overshoot); beyond it the targets stop growing. */
export const SPEED_CAP = 1.25;
/** Shafts spread across ± this fraction of the blade rate so they beat. */
export const SHAFT_DETUNE = 0.015;
/** Spray starts above this speed01. */
export const SPRAY_FROM = 0.6;
/** Share of `level` the plant keeps at idle — quiet, never silent. */
export const IDLE_LEVEL_SHARE = 0.45;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (r: Range, x: number): number => r[0] + (r[1] - r[0]) * x;
const floor = (g: number): number => Math.max(SILENCE, g);
const atLeastOne = (x: number): number => (Number.isFinite(x) ? Math.max(1, x) : 1);

interface Drive {
  readonly load: number;
  readonly speed: number;
  readonly boost: boolean;
}

/** Non-finite or missing input degrades to idle — the plant keeps running. */
function engineDrive(input: EngineInput | null | undefined): Drive {
  if (!input || !Number.isFinite(input.throttle) || !Number.isFinite(input.speed01)) {
    return { load: 0, speed: 0, boost: false };
  }
  const boost = input.boost === true;
  // Boost is a flank surge: the throttle target goes to full.
  const load = boost ? 1 : clamp(Math.abs(input.throttle), 0, 1);
  return { load, speed: clamp(input.speed01, 0, SPEED_CAP), boost };
}

/** Shaft i of n: −1..1 across the spread (a single shaft sits on the rate). */
const shaftSpread = (i: number, n: number): number => (n <= 1 ? 0 : (2 * i) / (n - 1) - 1);

function bladeRates(profile: EngineProfile, speed: number): number[] {
  const rpm = profile.rpmIdle + (profile.rpmMax - profile.rpmIdle) * speed;
  const base = (profile.blades * rpm) / 60;
  const n = Math.max(1, Math.floor(profile.shafts));
  return Array.from({ length: n }, (_, i) => base * (1 + SHAFT_DETUNE * shaftSpread(i, n)));
}

function voiceLevel(profile: EngineProfile, d: Drive): number {
  const work = Math.max(d.load, Math.min(d.speed, 1));
  const share = IDLE_LEVEL_SHARE + (1 - IDLE_LEVEL_SHARE) * work;
  return floor(profile.level * share * (d.boost ? atLeastOne(profile.boostLevel) : 1));
}

function washTargets(profile: EngineProfile, d: Drive): { washGain: number; sprayGain: number } {
  const lift = d.boost ? atLeastOne(profile.boostWash) : 1;
  return {
    washGain: floor(profile.washGain * d.speed ** 1.5 * lift),
    sprayGain: floor(profile.sprayGain * Math.max(0, d.speed - SPRAY_FROM) * lift),
  };
}

/** Every own-engine AudioParam target for this input. Pure. */
export function engineTargets(profile: EngineProfile, input: EngineInput): EngineTargets {
  const d = engineDrive(input);
  const diesel = profile.diesel ?? DEFAULT_DIESEL_VOICING;
  const whineHz = lerp(profile.whineHz, d.load) * (d.boost ? atLeastOne(profile.boostWhine) : 1);
  const bladeHz = bladeRates(profile, d.speed);
  return {
    bladeHz,
    rumbleHz: lerp(profile.rumbleHz, d.load),
    rumbleGain: floor(lerp(profile.rumbleGain, d.load)),
    throbHz: lerp(profile.throbHz, d.speed),
    throbGain: floor(profile.throbGain),
    throbDepth: lerp(profile.throbDepth, d.speed) * profile.throbGain,
    whineHz,
    whineGain: floor(lerp(profile.whineGain, d.load)),
    washHz: lerp(profile.washHz, d.speed),
    ...washTargets(profile, d),
    toneLowpassHz: lerp(diesel.lowpassHz, d.load),
    jitterHz: diesel.jitter * whineHz,
    drive: d.boost ? profile.drive[1] : profile.drive[0],
    level: voiceLevel(profile, d),
  };
}

// --- another ship, heard by distance (research §1 "Other ships' engines") ---

export interface RemoteEngineInput {
  readonly speed01: number;
  /** 0 at the listener, 1 at the edge of hearing. */
  readonly distance01: number;
  /** −1 (left) .. 1 (right). */
  readonly pan: number;
}

export interface RemoteEngineTargets {
  /** The one blade-rate LFO, Hz. */
  readonly bladeHz: number;
  /** Band-pass centre (the hull's throb band), Hz. */
  readonly bandHz: number;
  /** AM carrier gain and absolute swing. */
  readonly ampGain: number;
  readonly ampDepth: number;
  /** Distance lowpass cutoff, Hz. */
  readonly lowpassHz: number;
  /** Output gain (SILENCE at or beyond the edge of hearing). */
  readonly gain: number;
  /** Stereo pan, clamped to ± REMOTE_PAN_MAX. */
  readonly pan: number;
}

/** Distance lowpass: REMOTE_LOWPASS_HZ[0] at the listener down to [1] at the edge. */
export const REMOTE_LOWPASS_HZ: Range = [2500, 120];
/** Gain rolloff steepness: gain ∝ (1 − d) / (1 + k·d). */
export const REMOTE_ROLLOFF = 3;
/** Never pan hard: a far hull still reaches both ears a little. */
export const REMOTE_PAN_MAX = 0.8;
/** Share of the remote level a stopped hull keeps (its plant still runs). */
export const REMOTE_IDLE_SHARE = 0.35;

const finiteOr = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/** Every remote-engine AudioParam target. Pure; junk distance is "out of earshot". */
export function remoteEngineTargets(profile: EngineProfile, input: RemoteEngineInput): RemoteEngineTargets {
  const speed = clamp(finiteOr(input?.speed01, 0), 0, SPEED_CAP);
  const d = clamp(finiteOr(input?.distance01, 1), 0, 1);
  const near = (1 - d) / (1 + REMOTE_ROLLOFF * d);
  const share = REMOTE_IDLE_SHARE + (1 - REMOTE_IDLE_SHARE) * Math.min(speed, 1);
  const [lpNear, lpFar] = REMOTE_LOWPASS_HZ;
  const rpm = profile.rpmIdle + (profile.rpmMax - profile.rpmIdle) * speed;
  return {
    bladeHz: (profile.blades * rpm) / 60,
    bandHz: lerp(profile.throbHz, speed),
    ampGain: floor(profile.throbGain),
    ampDepth: lerp(profile.throbDepth, speed) * profile.throbGain,
    // Geometric slide: equal steps of distance darken by equal musical intervals.
    lowpassHz: lpNear * (lpFar / lpNear) ** d,
    gain: floor(profile.level * share * near),
    pan: clamp(finiteOr(input?.pan, 0), -REMOTE_PAN_MAX, REMOTE_PAN_MAX),
  };
}
