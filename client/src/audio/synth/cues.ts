// THE SHIPPED CUE TABLE (Story 10.13, epic-10 amendment 22): Eric's PICKED
// takes, imported from the shipped sound files in candidates/ by slot and
// take — never copied — so the game plays exactly the recipe data Eric heard
// on the audition page. The unpicked takes were pruned at the review gate.
//
// What this file adds on top of a picked recipe is the VOICE BUDGET only:
// every cue gets the family and per-family cap it plays under in the game,
// and a TIER. Own cues (your guns, your hull, your console) and world cues
// (something out on the water) never share a family, so a crowded ocean can
// never use up the voices your own fire needs; `cueAdmitted` drops world cues
// before own ones, far ones first.

import type { ShipClassId } from '@salvo/shared';
import type { EngineProfile } from '../engine.js';
import type { ToneId } from '../tones.js';
import type { CueRecipe } from './recipe.js';
import { MAIN_BATTERY, SECONDARIES } from './candidates/guns.js';
import { MINE_DROP, TORPEDO_LAUNCH, TORPEDO_RUN } from './candidates/ordnance.js';
import { FLASH_SHELL, FOULING_SHELL, PHOSPHOR_SHELL, STAR_SHELL } from './candidates/shells.js';
import { OWN_HIT, SINK_WITNESS, SPLASH, STEEL_HIT } from './candidates/impacts.js';
import { BEACON, BOOST, REPAIR, SMOKE } from './candidates/ship.js';
import { COUNTDOWN_TICK, DENIED, LEVEL_UP, MATCH_START, TELEGRAPH } from './candidates/signals.js';
import { BURNING, DAZZLED, HIT_CALL, PROP_FOULED, RAM_GRIND } from './candidates/hull.js';
import { ENGINE_CANDIDATES } from './candidates/engines.js';
import { AIRDROP_CHIME, BOUNTY_OMINOUS, CARD_FITTED_SUBTLE, KILL_SOUND, KLAXON } from './candidates/round3.js';
import { STORM_CANDIDATES } from './candidates/storm.js';
import type { StormBedProfile } from '../stormBed.js';
import type { CueSlot } from './candidates/types.js';

/** Every layered cue the game can play. `…World` ids are another ship's
 *  version of an own cue: the same take, in a world family. */
export type CueId =
  | 'mainBattery'
  | 'secondaries'
  | 'mainBatteryWorld'
  | 'secondariesWorld'
  | 'torpedoLaunch'
  | 'torpedoRun'
  | 'torpedoRunOwn'
  | 'mineDrop'
  | 'starShell'
  | 'phosphorShell'
  | 'foulingShell'
  | 'flashShell'
  | 'steelHit'
  | 'ownHit'
  | 'burning'
  | 'splash'
  | 'repair'
  | 'smoke'
  | 'beacon'
  | 'boostSurge'
  | 'sinkWitness'
  | 'levelUp'
  | 'denied'
  | 'countdownTick'
  | 'matchStart'
  | 'telegraph'
  | 'ramGrind'
  | 'hitCall'
  | 'propFouled'
  | 'dazzled'
  // wave C (Eric's round-3 picks)
  | 'airdropChime'
  | 'killSound'
  | 'cardFitted'
  | 'bounty'
  | 'klaxon';

/** 'own' = about the player's own ship or console; 'world' = out on the water. */
export type CueTier = 'own' | 'world';

/** The take a slot plays, by its audition id ('A' / 'B' / 'C'). Throws at load
 *  for a take that does not exist — a broken pick must fail the suite, not
 *  ship a silent cue. */
function take(slot: CueSlot, id: string): CueRecipe {
  const c = slot.candidates.find((x) => x.id === id);
  if (!c) throw new Error(`no take ${id} in ${slot.id}`);
  return c.recipe;
}

interface Budget {
  readonly family: string;
  readonly maxVoices: number;
  readonly tier: CueTier;
}

/** One table row: the picked recipe under its game budget. */
const row = (recipe: CueRecipe, b: Budget): { recipe: CueRecipe; tier: CueTier } => ({
  recipe: { ...recipe, family: b.family, maxVoices: b.maxVoices },
  tier: b.tier,
});

const own = (family: string, maxVoices: number): Budget => ({ family, maxVoices, tier: 'own' });
const world = (family: string, maxVoices: number): Budget => ({ family, maxVoices, tier: 'world' });

/** The four special-shell launches share one own family (one launch at a time per click). */
const OWN_SHELL = own('ownShell', 2);

/** Eric's picks (2026-11-11, the takes shipped in candidates/) under their game budgets. */
const TABLE: Record<CueId, { recipe: CueRecipe; tier: CueTier }> = {
  // Own fire. A secondary round leaves at up to `CONFIG.secondaries.coldRatePerS`
  // a second while held (slower as it heats) and rings ~1.3 s, so its family
  // holds a held stream (cheap: ~17 nodes a voice).
  mainBattery: row(take(MAIN_BATTERY, 'A'), own('ownMain', 6)),
  secondaries: row(take(SECONDARIES, 'A'), own('ownSecondary', 12)),
  torpedoLaunch: row(take(TORPEDO_LAUNCH, 'A'), own('ownTorpedo', 2)),
  mineDrop: row(take(MINE_DROP, 'C'), own('ownMine', 2)),
  starShell: row(take(STAR_SHELL, 'A'), OWN_SHELL),
  phosphorShell: row(take(PHOSPHOR_SHELL, 'B'), OWN_SHELL),
  foulingShell: row(take(FOULING_SHELL, 'A'), OWN_SHELL),
  flashShell: row(take(FLASH_SHELL, 'B'), OWN_SHELL),
  // Own hull and console.
  ownHit: row(take(OWN_HIT, 'A'), own('ownHit', 3)),
  burning: row(take(BURNING, 'A'), own('burn', 2)),
  repair: row(take(REPAIR, 'A'), own('repair', 1)),
  boostSurge: row(take(BOOST, 'B'), own('boost', 1)),
  beacon: row(take(BEACON, 'A'), own('beacon', 1)),
  levelUp: row(take(LEVEL_UP, 'C'), own('signal', 2)),
  denied: row(take(DENIED, 'C'), own('denied', 1)),
  countdownTick: row(take(COUNTDOWN_TICK, 'A'), own('tick', 2)),
  matchStart: row(take(MATCH_START, 'B'), own('alarm', 1)),
  telegraph: row(take(TELEGRAPH, 'C'), own('telegraph', 2)),
  ramGrind: row(take(RAM_GRIND, 'B'), own('grind', 2)),
  hitCall: row(take(HIT_CALL, 'A'), own('hitCall', 2)),
  propFouled: row(take(PROP_FOULED, 'A'), own('slowed', 1)),
  dazzled: row(take(DAZZLED, 'B'), own('dazzled', 1)),
  airdropChime: row(take(AIRDROP_CHIME, 'C'), own('pickup', 2)),
  // Your credited kill is about YOU even when it is placed far away: own tier.
  killSound: row(take(KILL_SOUND, 'C'), own('kill', 2)),
  cardFitted: row(take(CARD_FITTED_SUBTLE, 'A'), own('fit', 2)),
  bounty: row(take(BOUNTY_OMINOUS, 'A'), own('bounty', 1)),
  // The hull alarms and the sinking repeat (audio/klaxon.ts): three blasts of
  // a series can overlap a held sinking blast, so four seats.
  klaxon: row(take(KLAXON, 'C'), own('klaxon', 4)),
  // Out on the water.
  mainBatteryWorld: row(take(MAIN_BATTERY, 'A'), world('worldMain', 4)),
  secondariesWorld: row(take(SECONDARIES, 'A'), world('worldSecondary', 4)),
  steelHit: row(take(STEEL_HIT, 'C'), world('worldHit', 4)),
  splash: row(take(SPLASH, 'C'), world('worldSplash', 3)),
  sinkWitness: row(take(SINK_WITNESS, 'A'), world('worldSink', 2)),
  smoke: row(take(SMOKE, 'A'), world('worldSmoke', 2)),
  torpedoRun: row(take(TORPEDO_RUN, 'B'), world('torpedoRun', 2)),
  // Review P3c: the hum of YOUR OWN torpedo (Eric: own torpedoes hum too) on
  // its own family, so it never starves an enemy torpedo's hum.
  torpedoRunOwn: row(take(TORPEDO_RUN, 'B'), own('ownTorpedoRun', 1)),
};

const ids = Object.keys(TABLE) as CueId[];

/** CueId → the recipe the game plays (with its game family and cap). */
export const CUES: Record<CueId, CueRecipe> = Object.fromEntries(ids.map((id) => [id, TABLE[id].recipe])) as Record<
  CueId,
  CueRecipe
>;

/** CueId → own or world (see `cueAdmitted`). */
export const CUE_TIER: Record<CueId, CueTier> = Object.fromEntries(ids.map((id) => [id, TABLE[id].tier])) as Record<
  CueId,
  CueTier
>;

/** The shipped engine set ("Deep rumble"), one profile per hull. */
function pickedEngines(): Record<ShipClassId, EngineProfile> {
  const set = ENGINE_CANDIDATES.find((c) => c.id === 'deepRumble');
  if (!set) throw new Error('no deepRumble engine set');
  return set.profiles;
}

export const ENGINE_PROFILES: Record<ShipClassId, EngineProfile> = pickedEngines();

/** The storm bed Eric picked ("Heavy rain, far thunder" — `downpour`). */
function pickedStormBed(): StormBedProfile {
  const c = STORM_CANDIDATES.find((x) => x.id === 'downpour');
  if (!c) throw new Error('no downpour storm bed');
  return c.profile;
}

export const STORM_BED_PROFILE: StormBedProfile = pickedStormBed();

/**
 * The legacy tone a cue falls back to when the layered path cannot build on
 * this browser (a missing node type, a throwing factory). A cue with no row —
 * the three NEW cues (smoke, beacon, boost surge) and the torpedo hum — falls
 * back to silence: they had no sound before, so silence is no regression.
 */
export const LEGACY_FALLBACK: Partial<Record<CueId, ToneId>> = {
  mainBattery: 'fireGun',
  secondaries: 'fireGun',
  mainBatteryWorld: 'gunReport',
  secondariesWorld: 'gunReport',
  torpedoLaunch: 'fireTorp',
  mineDrop: 'fireMine',
  starShell: 'fireStarShells',
  phosphorShell: 'fireStarShells',
  foulingShell: 'fireStarShells',
  flashShell: 'fireStarShells',
  steelHit: 'impact',
  ownHit: 'damage',
  burning: 'burn',
  splash: 'splash',
  repair: 'heal',
  sinkWitness: 'sunkWitness',
  levelUp: 'point',
  denied: 'denied',
  countdownTick: 'tick',
  matchStart: 'matchStart',
  telegraph: 'telegraphUp',
  ramGrind: 'grind',
  hitCall: 'hitCall',
  propFouled: 'slowed',
  dazzled: 'dazzled',
  killSound: 'kill',
  cardFitted: 'fitCommon',
  bounty: 'bounty',
  klaxon: 'hpHurt',
};

/** The voice-budget knobs `cueAdmitted` reads (CLIENT_CONFIG.audio's). */
export interface CueBudget {
  readonly cueVoiceCap: number;
  readonly worldCueVoiceCap: number;
  readonly farWorldCueVoiceCap: number;
  readonly farWorldFrom: number;
}

/**
 * Pure: may a cue of this tier start with `live` voices already sounding?
 * Own cues are bounded only by the synth's global cap (and their family);
 * world cues stop at the world cap, and far world cues (distance01 above
 * `farWorldFrom`) at the lower far cap — so under pressure the distant noise
 * goes first, then the near noise, and the player's own cues keep their room.
 * A non-finite distance reads as near (it is placed as unplaced elsewhere).
 */
export function cueAdmitted(tier: CueTier, distance01: number | undefined, live: number, b: CueBudget): boolean {
  if (tier === 'own') return true;
  if (live >= b.worldCueVoiceCap) return false;
  const far = distance01 !== undefined && Number.isFinite(distance01) && distance01 > b.farWorldFrom;
  return !far || live < b.farWorldCueVoiceCap;
}

/** Sum of every own family's cap (each family counted once) — what the own
 *  tier can ever hold at once; the global cap keeps this much headroom. */
/** Every WORLD-tier family — the families the world caps count (review P2). */
export const WORLD_FAMILIES: readonly string[] = [
  ...new Set(ids.filter((id) => CUE_TIER[id] === 'world').map((id) => CUES[id].family as string)),
];

export function ownVoiceCeiling(): number {
  const caps = new Map<string, number>();
  for (const id of ids) {
    const r = CUES[id];
    if (CUE_TIER[id] === 'own' && r.family !== undefined) caps.set(r.family, r.maxVoices ?? 0);
  }
  return [...caps.values()].reduce((a, b) => a + b, 0);
}
