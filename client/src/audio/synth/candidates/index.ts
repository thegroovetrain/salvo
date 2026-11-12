// THE SHIPPED SOUNDS (Story 10.13): every cue slot in audition order, grouped
// under the audition page's headings, plus the engine set and the storm-bed
// profile. Data only — the game imports its takes from here (audio/synth/
// cues.ts, audio/horns.ts), and the audition page (client/scripts/
// soundAudition.mjs) plays them through the real renderer.

import { MAIN_BATTERY, SECONDARIES } from './guns.js';
import { MINE_DROP, TORPEDO_LAUNCH, TORPEDO_RUN } from './ordnance.js';
import { FLASH_SHELL, FOULING_SHELL, PHOSPHOR_SHELL, STAR_SHELL } from './shells.js';
import { OWN_HIT, SINK_WITNESS, SPLASH, STEEL_HIT } from './impacts.js';
import { BEACON, BOOST, REPAIR, SMOKE } from './ship.js';
import { COUNTDOWN_TICK, DENIED, LEVEL_UP, MATCH_START, TELEGRAPH } from './signals.js';
import { BURNING, DAZZLED, HIT_CALL, PROP_FOULED, RAM_GRIND } from './hull.js';
import { AIRDROP_CHIME, BOUNTY_OMINOUS, CARD_FITTED_SUBTLE, KILL_SOUND, KLAXON } from './round3.js';
import { HORN_BELL, HORN_FOGHORN, HORN_WHISTLE } from './hornVoices.js';
import { HORN_TROMBONE } from './brass.js';
import type { CueGroup, CueSlot } from './types.js';

export type { CueCandidate, CueGroup, CueSlot, EngineCandidate } from './types.js';
export type { StormCandidate } from './storm.js';
export { ENGINE_CANDIDATES } from './engines.js';
export { STORM_CANDIDATES } from './storm.js';
export { KLAXON_STEP_S, SINKING_DEMO_S, klaxonStepS } from './round3.js';

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
      BOOST,
      SINK_WITNESS,
      AIRDROP_CHIME,
      KILL_SOUND,
    ],
  },
  {
    title: 'Alerts, signals and the ship itself',
    intro: 'The short signals, the hull alarms and what happens to your own ship.',
    slots: [LEVEL_UP, DENIED, COUNTDOWN_TICK, MATCH_START, TELEGRAPH, RAM_GRIND, BURNING, HIT_CALL, PROP_FOULED, DAZZLED, CARD_FITTED_SUBTLE, BOUNTY_OMINOUS, KLAXON],
  },
  {
    title: 'Horns',
    intro: 'The horns a player can choose on the ship-select screen.',
    slots: [HORN_FOGHORN, HORN_WHISTLE, HORN_BELL, HORN_TROMBONE],
  },
];

/** Every slot, in page order. */
export const CUE_SLOTS: readonly CueSlot[] = CUE_GROUPS.flatMap((g) => g.slots);
