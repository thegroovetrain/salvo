// Pure tone map + event->cue edge-detection (no AudioContext import — unit
// tested). audio/context.ts is the thin AudioContext adapter that consumes
// this table; kept separate so the mapping/exhaustiveness is testable without
// a browser audio stack. Envelope shape follows DESIGN.md's carried-forward
// playTone(freqStart, freqMid, freqEnd, duration, volume, type) approach.

import type { EquipmentId } from '@salvo/shared';

/** Every distinct cue the client can play. */
export type ToneId =
  | 'fireGun'
  | 'fireTorp'
  | 'fireMine'
  | 'fireCannon'
  | 'fireStarShells'
  | 'placeDecoy'
  | 'damage'
  | 'kill'
  | 'point'
  | 'upgrade'
  | 'sink'
  | 'tick'
  | 'matchStart'
  | 'stormWarn'
  | 'telegraphUp'
  | 'telegraphDown';

export interface ToneSpec {
  freqStart: number; // Hz
  freqMid: number; // Hz — reached at 40% of duration
  freqEnd: number; // Hz — reached at duration
  duration: number; // s
  volume: number; // 0..1 peak gain
  type: OscillatorType;
  /** Layer a short filtered noise burst under the tone (cracks/whooshes). */
  noise?: boolean;
}

/** Max tone duration (s) — "each ≤ ~150ms except sink (~400ms)" per the plan. */
export const MAX_TONE_S = 0.15;
export const MAX_SINK_TONE_S = 0.45;

export const TONES: Record<ToneId, ToneSpec> = {
  // Guns: sharp crack — fast downward chirp + a noise transient.
  fireGun: { freqStart: 900, freqMid: 320, freqEnd: 150, duration: 0.09, volume: 0.5, type: 'square', noise: true },
  // Torpedo: low whoosh, longer than the gun crack but still brief.
  fireTorp: { freqStart: 180, freqMid: 140, freqEnd: 90, duration: 0.14, volume: 0.4, type: 'sawtooth', noise: true },
  // Mine: soft low plop, no noise layer (a drop, not a launch).
  fireMine: { freqStart: 220, freqMid: 150, freqEnd: 90, duration: 0.12, volume: 0.4, type: 'sine' },
  // Cannon (Story 1.7): a HEAVIER gun report — lower + more body than the gun
  // crack, with a bigger noise transient (the Battleship's big shell).
  fireCannon: { freqStart: 520, freqMid: 200, freqEnd: 80, duration: 0.14, volume: 0.55, type: 'square', noise: true },
  // Star shell (Story 1.7): a distinct utility POP — a bright airy rising whistle
  // (a flare climbing into the sky), no heavy noise: not a gun, not a fish.
  fireStarShells: { freqStart: 360, freqMid: 640, freqEnd: 900, duration: 0.13, volume: 0.4, type: 'triangle' },
  // Decoy buoy placement (Story 1.8): a hollow water "bloop" — same soft sine
  // drop family as the mine plop but pitched a touch higher + brighter so
  // seeding a buoy is audibly distinct from dropping a mine.
  placeDecoy: { freqStart: 340, freqMid: 260, freqEnd: 160, duration: 0.13, volume: 0.38, type: 'sine' },
  // Taking damage: dull triangle thud.
  damage: { freqStart: 220, freqMid: 160, freqEnd: 110, duration: 0.1, volume: 0.45, type: 'triangle' },
  // Kill confirm: short ascending chime.
  kill: { freqStart: 500, freqMid: 900, freqEnd: 1200, duration: 0.15, volume: 0.5, type: 'triangle' },
  // Point earned (banked, unspent): one bright continuous rise — a "ping" that
  // reads as a reward-available prompt, distinct from the upgrade two-note.
  point: { freqStart: 700, freqMid: 1100, freqEnd: 1500, duration: 0.12, volume: 0.4, type: 'triangle' },
  // Upgrade granted / point SPENT: short rising two-note — flat first note,
  // stepping up a fourth at the 40% mark and holding (reads as "do-mi",
  // distinct from the kill chime's continuous glide and the point ping).
  upgrade: { freqStart: 660, freqMid: 880, freqEnd: 880, duration: 0.14, volume: 0.45, type: 'triangle' },
  // Own sink: the one long tone — alarm warble sliding down into a low boom.
  sink: { freqStart: 320, freqMid: 180, freqEnd: 60, duration: 0.4, volume: 0.55, type: 'sawtooth' },
  // Countdown tick (last 5s): short, neutral, clock-like.
  tick: { freqStart: 700, freqMid: 700, freqEnd: 700, duration: 0.06, volume: 0.3, type: 'square' },
  // Match start: bright rising-then-settling tone.
  matchStart: { freqStart: 400, freqMid: 900, freqEnd: 650, duration: 0.14, volume: 0.5, type: 'triangle' },
  // Storm-enter warning: descending growl.
  stormWarn: { freqStart: 160, freqMid: 110, freqEnd: 70, duration: 0.15, volume: 0.5, type: 'sawtooth' },
  // Engine-telegraph detent clicks: tiny, dry ticks — a brass bell chime. The
  // ahead click sits a fifth above the astern click so ringing up vs down the
  // scale is audibly distinct without reading as a "real" cue.
  telegraphUp: { freqStart: 1200, freqMid: 1200, freqEnd: 1200, duration: 0.04, volume: 0.28, type: 'square' },
  telegraphDown: { freqStart: 800, freqMid: 800, freqEnd: 800, duration: 0.04, volume: 0.28, type: 'square' },
};

/** Pure: the telegraph-click tone for a step direction (+1 ahead / -1 astern). */
export function telegraphTone(dir: number): ToneId {
  return dir > 0 ? 'telegraphUp' : 'telegraphDown';
}

/** Equipment with a discrete own-fire/placement cue routed through fireTone. The
 *  instant abilities that have NO such cue here are excluded at the type level:
 *  speedBoost (a pure speed window) and decoyBuoy (its placement cue is played
 *  as 'placeDecoy' from the Decoys reconcile own-spawn hook, not via fireTone).
 *  The MINE stays included even though it is now an ability (Story 1.8) — its
 *  'fireMine' drop cue still fires, via the Mines reconcile own-spawn hook
 *  (main.ts); the decoy's cue rides the same hook shape on Decoys. */
type FiringEquipmentId = Exclude<EquipmentId, 'speedBoost' | 'decoyBuoy'>;

const FIRE_TONE: Record<FiringEquipmentId, ToneId> = {
  gun: 'fireGun',
  torpedo: 'fireTorp',
  mine: 'fireMine',
  cannon: 'fireCannon',
  starShells: 'fireStarShells',
};

/** Pure: which tone a weapon's own-fire cue plays. */
export function fireTone(id: FiringEquipmentId): ToneId {
  return FIRE_TONE[id];
}

// --- match-phase edge cues (countdown tick + match-start) -------------------

/** Countdown seconds at/under which a tick plays. */
const TICK_WINDOW_S = 5;

export interface AudioCueState {
  lastPhase: string;
  /** Last countdown second a tick fired for (dedupes multiple frames of the
   *  same second); null when not in the tick window / not counting down. */
  lastTickSec: number | null;
}

export const INITIAL_CUE_STATE: AudioCueState = { lastPhase: 'connecting', lastTickSec: null };

export interface AudioCueResult {
  tick: boolean;
  matchStart: boolean;
  state: AudioCueState;
}

/**
 * Pure edge-detector: given the previous cue state and this frame's match
 * phase/countdown deadline, decide whether a tick or match-start cue should
 * fire THIS frame, and return the updated state to carry into next frame.
 * `secondsRemaining` is precomputed by the caller (ui/phase.ts's
 * secondsUntil) so this module stays clock-agnostic.
 */
export function audioCues(prev: AudioCueState, phase: string, secondsRemaining: number): AudioCueResult {
  const inTickWindow = phase === 'countdown' && secondsRemaining <= TICK_WINDOW_S;
  const tick = inTickWindow && secondsRemaining !== prev.lastTickSec;
  const matchStart = phase === 'active' && prev.lastPhase !== 'active';
  return {
    tick,
    matchStart,
    state: { lastPhase: phase, lastTickSec: inTickWindow ? secondsRemaining : null },
  };
}

/** Pure: true the instant the own ship crosses from inside to outside the storm. */
export function stormEnterEdge(prevInStorm: boolean, inStorm: boolean): boolean {
  return inStorm && !prevInStorm;
}
