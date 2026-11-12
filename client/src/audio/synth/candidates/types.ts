// The sound slots' DATA SHAPES (Story 10.13, epic-10 amendment 22). A slot is one sound the game
// needs; what remains in it are the takes Eric picked on the audition page
// (the unpicked ones were pruned); the game plays exactly those.

import type { ShipClassId } from '@salvo/shared';
import type { EngineProfile } from '../../engine.js';
import type { ToneId } from '../../tones.js';
import type { CueRecipe } from '../recipe.js';

export interface CueCandidate {
  /** 'A' | 'B' | 'C' */
  id: string;
  label: string;
  /** One plain sentence: what it sounds like. */
  blurb: string;
  recipe: CueRecipe;
}

export interface CueSlot {
  id: string;
  title: string;
  /** When the player hears it, in plain words. */
  note: string;
  /** The legacy tone it would replace, if any. */
  today?: ToneId;
  /** Heard at a distance: the page shows the distance dial. */
  world?: boolean;
  /** The page offers a "3 in quick series" button. */
  salvo?: boolean;
  /** "Today's sound" is the default synthesized foghorn (audio/horns.ts), not a tone. */
  todayHorn?: boolean;
  /** Extra "today" comparisons, each with its own button label. */
  todayMore?: ReadonlyArray<{ label: string; tone: ToneId }>;
  /** A klaxon: each take also offers "×3 (hull under a quarter)" and the SINKING demo. */
  klaxon?: boolean;
  candidates: CueCandidate[];
}

/** A heading on the audition page and the slots under it. */
export interface CueGroup {
  title: string;
  /** One plain sentence under the heading. */
  intro: string;
  slots: readonly CueSlot[];
}

export interface EngineCandidate {
  id: string;
  label: string;
  blurb: string;
  profiles: Record<ShipClassId, EngineProfile>;
}
