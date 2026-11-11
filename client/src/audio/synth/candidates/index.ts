// THE AUDITION CANDIDATES (Story 10.13 wave A): every cue slot in audition
// order, grouped under the page's headings, the engine sets and the storm-bed
// profiles. Data only — the audition page (client/scripts/soundAudition.mjs)
// plays them through the real renderer, and wave B moves only Eric's picks
// into the game path and deletes the rest.
//
// Round 3 (Eric 2026-11-11): ROUND3_GROUP holds the new takes for the sounds
// he marked "none of these"; PICKED_GROUPS hold the slots he has already
// picked, kept untouched for reference.

import { MAIN_BATTERY, SECONDARIES } from './guns.js';
import { MINE_DROP, TORPEDO_LAUNCH, TORPEDO_RUN } from './ordnance.js';
import { FLASH_SHELL, FOULING_SHELL, PHOSPHOR_SHELL, STAR_SHELL } from './shells.js';
import { OWN_HIT, SINK_WITNESS, SPLASH, STEEL_HIT } from './impacts.js';
import { BEACON, BOOST, REPAIR, SMOKE } from './ship.js';
import { COUNTDOWN_TICK, DENIED, LEVEL_UP, MATCH_START, TELEGRAPH } from './signals.js';
import { BURNING, DAZZLED, HIT_CALL, PROP_FOULED, RAM_GRIND } from './hull.js';
import { AIRDROP_CHIME, BOUNTY_OMINOUS, CARD_FITTED_SUBTLE, KILL_SOUND, KLAXON } from './round3.js';
import { HORN_AIRHORN, HORN_BELL, HORN_FOGHORN, HORN_TROMBONE, HORN_WHISTLE } from './hornVoices.js';
import type { CueGroup, CueSlot } from './types.js';

export type { CueCandidate, CueGroup, CueSlot, EngineCandidate } from './types.js';
export type { StormCandidate } from './storm.js';
export { ENGINE_CANDIDATES } from './engines.js';
export { STORM_CANDIDATES } from './storm.js';
export { KLAXON_SERIES_ONSETS_MS, KLAXON_STEP_S, SINKING_DEMO_S } from './round3.js';

export const ROUND3_GROUP: CueGroup = {
  title: 'Round 3 — new takes',
  intro: 'These are new takes for the sounds you marked "none of these", made from what you asked for.',
  slots: [AIRDROP_CHIME, KILL_SOUND, CARD_FITTED_SUBTLE, BOUNTY_OMINOUS, KLAXON, HORN_FOGHORN, HORN_WHISTLE, HORN_BELL, HORN_TROMBONE, HORN_AIRHORN],
};

export const PICKED_GROUPS: readonly CueGroup[] = [
  {
    title: 'Weapons, hits and events',
    intro: 'The sounds of combat and of things happening on the water.',
    slots: [
      MAIN_BATTERY,
      SECONDARIES,
      TORPEDO_LAUNCH,
      TORPEDO_RUN,
      MINE_DROP,
      STAR_SHELL,
      PHOSPHOR_SHELL,
      FOULING_SHELL,
      FLASH_SHELL,
      STEEL_HIT,
      OWN_HIT,
      SPLASH,
      REPAIR,
      SMOKE,
      BEACON,
      BOOST,
      SINK_WITNESS,
    ],
  },
  {
    title: 'Alerts, signals and the ship itself',
    intro: 'Replacements for the short beeps the game uses today.',
    slots: [LEVEL_UP, DENIED, COUNTDOWN_TICK, MATCH_START, TELEGRAPH, RAM_GRIND, BURNING, HIT_CALL, PROP_FOULED, DAZZLED],
  },
];

export const CUE_GROUPS: readonly CueGroup[] = [ROUND3_GROUP, ...PICKED_GROUPS];

/** Every slot, in page order. */
export const CUE_SLOTS: readonly CueSlot[] = CUE_GROUPS.flatMap((g) => g.slots);
