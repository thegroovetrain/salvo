// Pure tone map + event->cue edge-detection (no AudioContext import — unit
// tested). audio/context.ts is the thin AudioContext adapter that consumes
// this table; kept separate so the mapping/exhaustiveness is testable without
// a browser audio stack. Envelope shape follows DESIGN.md's carried-forward
// playTone(freqStart, freqMid, freqEnd, duration, volume, type) approach.

import type { BoonRarity, EquipmentId } from '@salvo/shared';

/** Every distinct cue the client can play. */
export type ToneId =
  | 'fireGun'
  | 'fireTorp'
  | 'fireMine'
  | 'fireCannon'
  | 'fireStarShells'
  | 'placeDecoy'
  | 'denied'
  | 'damage'
  | 'kill'
  | 'point'
  | 'fitCommon'
  | 'fitRare'
  | 'fitExclusive'
  | 'heal'
  | 'burn'
  | 'hitCall'
  | 'slowed'
  | 'dazzled'
  | 'sink'
  | 'bounty'
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
  // Denied press (Story 1.10 — FR12 "never silence"): a curt low square BLAT,
  // pitched fast downward with no noise layer — reads as a refusal, distinct
  // from every success cue (the gun family cracks start ≥520Hz with noise, the
  // ability drops are soft sines, damage is a triangle thud). Fired ONLY via
  // the exactly-one-feedback path (predicted denial OR an unmatched server
  // denial — weapons AND abilities), mute-aware like every tone (Audio.play).
  denied: { freqStart: 240, freqMid: 110, freqEnd: 80, duration: 0.09, volume: 0.42, type: 'square' },
  // Taking damage: dull triangle thud.
  damage: { freqStart: 220, freqMid: 160, freqEnd: 110, duration: 0.1, volume: 0.45, type: 'triangle' },
  // Kill confirm: short ascending chime.
  kill: { freqStart: 500, freqMid: 900, freqEnd: 1200, duration: 0.15, volume: 0.5, type: 'triangle' },
  // Point earned (banked, unspent): one bright continuous rise — a "ping" that
  // reads as a reward-available prompt, distinct from the upgrade two-note.
  point: { freqStart: 700, freqMid: 1100, freqEnd: 1500, duration: 0.12, volume: 0.4, type: 'triangle' },
  // --- THE FIT FAMILY (Story 2.9) — one template, three weights -------------
  // A boon FITTED. All three are the retired `upgrade` two-note verbatim in
  // shape — flat first note, stepping up a fourth at the 40% mark and holding
  // ("do-mi", distinct from the kill chime's continuous glide and the point
  // ping) — so the family reads as ONE cue heard three ways. Only the WEIGHT
  // moves with the card's tier: the root drops, the note lengthens, and the
  // level rises as the tier climbs, which is how a heavier instrument sounds
  // without becoming a different instrument. Draft specs (the draft-copy rule);
  // every one has a visual twin in audio/twinMap.ts.
  fitCommon: { freqStart: 660, freqMid: 880, freqEnd: 880, duration: 0.1, volume: 0.36, type: 'triangle' },
  fitRare: { freqStart: 550, freqMid: 733, freqEnd: 733, duration: 0.13, volume: 0.45, type: 'triangle' },
  fitExclusive: { freqStart: 440, freqMid: 587, freqEnd: 587, duration: 0.15, volume: 0.52, type: 'triangle' },
  // --- DAMAGE CONTROL (cycle 46) ---------------------------------------------
  // A banked level spent on the heal. The fit family's two-note INVERTED: where
  // a fit steps UP a fourth and holds (a permanent thing acquired), this settles
  // DOWN onto a held root — a hull steadying, not a capability gained — so the
  // two can never be confused even though both answer the same keypress family.
  // A soft sine, deliberately the roundest voice in the catalog: it is neither a
  // gun (square/noise), nor damage (triangle thud), nor a refusal (the curt
  // square blat). It sits between the fit weights in pitch and under all of them
  // in level, because the spend it confirms buys survival rather than power.
  // Draft spec, UNRATIFIED (the standing draft-copy rule); the visual twin is
  // the HP rail's jump + its incoming band (audio/twinMap.ts).
  heal: { freqStart: 620, freqMid: 466, freqEnd: 466, duration: 0.13, volume: 0.34, type: 'sine' },
  // --- THE VICTIM TELLS (Story 2.9) — what a doctrine did TO YOU --------------
  // Burning: a damage tick taken inside an enemy INCENDIARY zone. Deliberately
  // the damage thud's quieter, airier sibling — same triangle family, pitched
  // under it with a noise hiss (fire, not impact) — because it IS damage, only
  // a DoT tick rather than a slam (the shake is scaled down to match).
  burn: { freqStart: 150, freqMid: 120, freqEnd: 90, duration: 0.11, volume: 0.32, type: 'triangle', noise: true },
  // --- THE HIT CALL (Story 4.3, amendments 17/18) ----------------------------
  // Something YOU fired or laid connected — possibly at a hull you cannot see.
  // A MUFFLED BOOM: the lowest tone in the catalog, a soft triangle that punches
  // down to 85Hz in the first 40% and then ROLLS BACK UP as it fades, which is
  // what a detonation sounds like from far enough away that the crack is gone
  // and only the swell reaches you. Deliberately no noise layer — a transient
  // would make it a nearby crack, and the whole character of this cue is
  // distance.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS, all three of which are things
  // happening TO you while this is something happening FOR you:
  //   • the CONTOUR is unique in the low register — damage (220→110), burn
  //     (150→90) and stormWarn (160→70) all fall monotonically to their floor
  //     and stop; this one dips and comes back, so it lands as a swell, not a
  //     hit;
  //   • it starts BELOW all three (130 < 150 < 160 < 220), so even the contour
  //     aside it sits in its own octave;
  //   • it is not the storm's sawtooth growl, and unlike burn it carries no
  //     hiss.
  // Draft spec (the draft-copy rule); the visual twin is the Hit Call bloom
  // (audio/twinMap.ts), which stands alone — with Story 4.1 deferred there is no
  // listening ring to back it up, so the bloom is the whole muted answer.
  hitCall: { freqStart: 130, freqMid: 85, freqEnd: 120, duration: 0.12, volume: 0.42, type: 'triangle' },
  // Fouled (PROP-FOULING): a sagging low sine — the engine losing revs. Falls
  // like the denied blat but soft and round, never that curt square refusal.
  slowed: { freqStart: 300, freqMid: 190, freqEnd: 130, duration: 0.14, volume: 0.34, type: 'sine' },
  // Dazzled (DAZZLE BURST): a bright glassy sting that washes UP and thins out —
  // the optical opposite of the fouled sag, and audibly nothing like the star
  // shell's own launch whistle (that one is the firer's, this one is the
  // victim's: shorter, higher, no body).
  dazzled: { freqStart: 900, freqMid: 1400, freqEnd: 1250, duration: 0.12, volume: 0.34, type: 'sine' },
  // Own sink: the one long tone — alarm warble sliding down into a low boom.
  sink: { freqStart: 320, freqMid: 180, freqEnd: 60, duration: 0.4, volume: 0.55, type: 'sawtooth' },
  // --- THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) -------------------------
  // The throne landed on YOU. A two-tone KLAXON: a square that drops a fifth at
  // the 40% mark and comes straight back up, which is the shape of an alert
  // horn rather than of any event in the catalog. It fires on exactly one
  // occasion — the local player taking the bounty — so it has to read as a
  // status change, never as an action landing.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS: it is the only V-CONTOURED
  // cue in the HIGH register (hitCall dips and returns two octaves below it,
  // at 130Hz, on a soft triangle), and the only NON-FLAT square up there — the
  // tick (700 flat) and both telegraph detents (1200/800 flat) are the
  // register's other squares and none of them moves in pitch. Everything else
  // near this pitch glides one way and stops: kill rises 500→1200, point
  // 700→1500, dazzled washes up and thins. Draft spec (the standing draft-copy
  // rule); the visual twin is the toast + the bar's own BOUNTY register.
  bounty: { freqStart: 990, freqMid: 660, freqEnd: 990, duration: 0.15, volume: 0.46, type: 'square' },
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

/** Boon rarity -> its fit cue (Story 2.9). The tier is the ONE audible axis:
 *  a common lands light, a rare fuller, an exclusive heaviest. */
const FIT_TONE: Record<BoonRarity, ToneId> = {
  common: 'fitCommon',
  rare: 'fitRare',
  exclusive: 'fitExclusive',
};

/** Pure: the fit cue for a fitted boon's rarity tier. Fail-open to the common
 *  weight — a junk/unknown rarity must still be AUDIBLE (FR22: a
 *  presentation-silent boon is a defect), never silent. */
export function fitTone(rarity: BoonRarity | undefined): ToneId {
  return rarity !== undefined && Object.hasOwn(FIT_TONE, rarity) ? FIT_TONE[rarity] : 'fitCommon';
}

/** One semitone, in the CENTS `Audio.play`'s `detune` option speaks (the Web
 *  Audio unit — see audio/context.ts). */
const SEMITONE_CENTS = 100;

/**
 * Boon CATEGORY -> the fit cue's transposition, in cents (Story 2.9). The TIER
 * picks the instrument's weight (fitTone); the CATEGORY moves it up or down the
 * scale, so two commons fitted back to back on different slots are audibly
 * different events without becoming different cues. The nine v1 categories are
 * laid across ±4 semitones in the deck's own order — the four weapon families
 * below the root, the utilities above it, SHIP at the root — which keeps the
 * interval between any two neighbours a clean semitone. Draft mapping (the
 * draft-copy rule); the table is pinned exhaustive over the catalog by
 * __tests__/tones.test.ts, so a tenth category cannot ship untransposed.
 */
const FIT_CATEGORY_CENTS: Readonly<Record<string, number>> = {
  guns: -4 * SEMITONE_CENTS,
  cannon: -3 * SEMITONE_CENTS,
  torpedoes: -2 * SEMITONE_CENTS,
  mines: -1 * SEMITONE_CENTS,
  ship: 0,
  intel: 1 * SEMITONE_CENTS,
  speedBoost: 2 * SEMITONE_CENTS,
  starShells: 3 * SEMITONE_CENTS,
  decoyBuoy: 4 * SEMITONE_CENTS,
};

/**
 * Pure: the fit cue's detune (cents) for a fitted line's category. Fails OPEN to
 * the root — an unknown/junk category still gets the untransposed cue rather
 * than silence (FR22: a presentation-silent boon is the defect).
 */
export function fitDetune(category: string): number {
  return Object.hasOwn(FIT_CATEGORY_CENTS, category) ? FIT_CATEGORY_CENTS[category] : 0;
}

/** The categories the fit transposition covers (test seam — pinned against the
 *  live catalog so a new category cannot ship without a voice). */
export const FIT_CATEGORIES: readonly string[] = Object.keys(FIT_CATEGORY_CENTS);

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
  // 'countdown' only, deliberately: the gathering join window also renders big
  // center seconds but stays silent — the audible tick is reserved for "locked,
  // really starting" (spec design note for the 30s join window).
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
