// THE AUDITION CANDIDATES (Story 10.13 wave A): every cue slot in audition
// order, grouped under the page's headings, and the engine sets. Data only —
// the audition page (client/scripts/soundAudition.mjs) plays them through the
// real renderer, and wave B moves only Eric's picks into the game path and
// deletes the rest.

import { MAIN_BATTERY, SECONDARIES } from './guns.js';
import { MINE_DROP, TORPEDO_LAUNCH, TORPEDO_RUN } from './ordnance.js';
import { FLASH_SHELL, FOULING_SHELL, PHOSPHOR_SHELL, STAR_SHELL } from './shells.js';
import { OWN_HIT, SINK_WITNESS, SPLASH, STEEL_HIT } from './impacts.js';
import { AIRDROP, BEACON, BOOST, REPAIR, SMOKE } from './ship.js';
import { CARD_FITTED, COUNTDOWN_TICK, DENIED, KILL, LEVEL_UP, MATCH_START, TELEGRAPH } from './signals.js';
import { BOUNTY, FOGHORN, HULL_CRITICAL, HULL_HURT, OWN_SINK, STORM_WARNING } from './alarms.js';
import { BURNING, DAZZLED, HIT_CALL, PROP_FOULED, RAM_GRIND } from './hull.js';
import type { CueGroup, CueSlot } from './types.js';

export type { CueCandidate, CueGroup, CueSlot, EngineCandidate } from './types.js';
export { ENGINE_CANDIDATES } from './engines.js';

export const CUE_GROUPS: readonly CueGroup[] = [
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
      AIRDROP,
      BOOST,
      SINK_WITNESS,
    ],
  },
  {
    title: 'Alerts, signals and the ship itself',
    intro:
      'These replace the short beeps the game uses today. Each should sound like something real aboard a 1940s warship, and still be instantly recognizable for what it tells you.',
    slots: [
      KILL,
      LEVEL_UP,
      CARD_FITTED,
      DENIED,
      COUNTDOWN_TICK,
      MATCH_START,
      STORM_WARNING,
      BOUNTY,
      HULL_HURT,
      HULL_CRITICAL,
      TELEGRAPH,
      RAM_GRIND,
      OWN_SINK,
      BURNING,
      HIT_CALL,
      PROP_FOULED,
      DAZZLED,
      FOGHORN,
    ],
  },
];

/** Every slot, in page order. */
export const CUE_SLOTS: readonly CueSlot[] = CUE_GROUPS.flatMap((g) => g.slots);
