// The shipped takes Eric picked (Story 10.13, epic-10 amendment 22): the short SIGNAL cues
// that replace today's beeps — kill, level, card fitted, denied, countdown,
// match start, engine telegraph. Each should sound like something real aboard
// a 1940s warship and still say at once what it means. The frequent ones stay
// short and nearly dry so a quick series never smears.

import type { CueSlot } from './types.js';
import { buzzer, click, metalRing, whistleChord } from './parts.js';

export const LEVEL_UP: CueSlot = {
  id: 'levelUp',
  title: 'Level earned',
  note: 'You earn a level (a point to spend on a card).',
  today: 'point',
  salvo: true,
  candidates: [
    {
      id: 'C',
      label: 'Telegraph "ready" ding',
      blurb: 'A small brass "ding" like a bridge instrument confirming it is ready.',
      recipe: { gain: 0.16, family: 'signal', maxVoices: 3, reverb: 0.05, layers: [metalRing(1500, [1, 2.76, 5.4], 120, 22, 140), click(4000, 4, 2, 4)] },
    },
  ],
};

export const DENIED: CueSlot = {
  id: 'denied',
  title: 'Denied press',
  note: 'You press something that cannot fire right now (reloading, out of range, nothing there).',
  today: 'denied',
  salvo: true,
  candidates: [
    {
      id: 'C',
      label: 'Short buzzer',
      blurb: 'A brief, flat electric buzz: "no".',
      recipe: { gain: 0.48, family: 'denied', maxVoices: 3, layers: [buzzer(120, [0], 140, 0.25)] },
    },
  ],
};

export const COUNTDOWN_TICK: CueSlot = {
  id: 'countdownTick',
  title: 'Countdown tick',
  note: 'Once a second in the last five seconds before the match starts.',
  today: 'tick',
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: 'Chronometer tick',
      blurb: 'The crisp tick of the ship’s chronometer.',
      recipe: { gain: 0.6, family: 'tick', maxVoices: 3, layers: [click(4200, 6, 15, 5), metalRing(3100, [1, 1.9], 60, 9, 20)] },
    },
  ],
};

export const MATCH_START: CueSlot = {
  id: 'matchStart',
  title: 'Match starts',
  note: 'The countdown ends and the match goes live.',
  today: 'matchStart',
  candidates: [
    {
      id: 'B',
      label: 'Steam whistle blast',
      blurb: 'One long, full blast of the ship’s steam whistle.',
      recipe: { gain: 0.98, family: 'alarm', maxVoices: 1, reverb: 0.3, layers: whistleChord([233, 294, 349], 0, 1100, 0.2) },
    },
  ],
};

export const TELEGRAPH: CueSlot = {
  id: 'telegraph',
  title: 'Engine telegraph',
  note: 'Each notch you move the throttle. Ahead and astern use the same sound, a little higher or lower.',
  today: 'telegraphUp',
  salvo: true,
  candidates: [
    {
      id: 'C',
      label: 'Dry clack only',
      blurb: 'Just the handle clacking into place, no bell.',
      recipe: { gain: 0.5, family: 'telegraph', maxVoices: 3, layers: [click(900, 2, 15, 14), click(2600, 3, 9, 6)] },
    },
  ],
};
