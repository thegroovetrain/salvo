// THE AUDITION CANDIDATES (Story 10.13 wave A): every cue slot in audition
// order, and the engine sets. Data only — the audition page
// (client/scripts/soundAudition.mjs) plays them through the real renderer, and
// wave B moves only Eric's picks into the game path and deletes the rest.

import { MAIN_BATTERY, SECONDARIES } from './guns.js';
import { MINE_DROP, TORPEDO_LAUNCH, TORPEDO_RUN } from './ordnance.js';
import { FLASH_SHELL, FOULING_SHELL, PHOSPHOR_SHELL, STAR_SHELL } from './shells.js';
import { OWN_HIT, SINK_WITNESS, SPLASH, STEEL_HIT } from './impacts.js';
import { AIRDROP, BEACON, BOOST, REPAIR, SMOKE } from './ship.js';
import type { CueSlot } from './types.js';

export type { CueCandidate, CueSlot, EngineCandidate } from './types.js';
export { ENGINE_CANDIDATES } from './engines.js';

export const CUE_SLOTS: readonly CueSlot[] = [
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
  AIRDROP,
  BOOST,
  SINK_WITNESS,
];
