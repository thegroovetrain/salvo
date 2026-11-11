// Round 3 (Eric 2026-11-11): new takes for the sounds he marked "none of
// these", made from what he asked for. His general note — "too much
// static?" — applies to every take here: clean tonal sources, little or no
// noise, modest reverb. The kill is the one exception: an explosion IS noise.

import type { Layer } from '../recipe.js';
import type { CueSlot } from './types.js';
import { click, filters, groan, metalRing, noiseLayer, thump, tone } from './parts.js';

const { lp, bp } = filters;

/** A glassy chime note: a sine with a faint bell-like shimmer that dies fast. */
function chime(hz: number, startMs: number, peak: number, tauMs = 180): Layer {
  return {
    source: { kind: 'osc', wave: 'sine', freq: hz, fm: { ratio: 3.5, index: { from: 0.6, to: 0, tauMs: 60 } } },
    env: { peak, attackMs: 3, tauMs },
    startMs,
  };
}

/** A soft marimba-like bar: fundamental plus its quick-dying fourth partial. */
function bar(hz: number, startMs: number, peak: number): Layer[] {
  return [
    tone(hz, { peak, attackMs: 2, tauMs: 150 }, { startMs }),
    tone(hz * 3.93, { peak: peak * 0.35, attackMs: 1, tauMs: 30 }, { startMs }),
  ];
}

export const AIRDROP_CHIME: CueSlot = {
  id: 'airdropChime',
  title: 'Airdrop picked up (reward chime)',
  note: 'Your ship hauls an airdrop crate aboard. Not realistic on purpose: a short, pleasant "got something" chime. Silent in the game today.',
  candidates: [
    {
      id: 'A',
      label: 'Rising glass chime',
      blurb: 'Three quick, clear notes climbing upward, like tapping glasses.',
      recipe: { gain: 1, family: 'pickup', maxVoices: 2, reverb: 0.1, layers: [chime(1047, 0, 0.18), chime(1319, 80, 0.18), chime(1568, 160, 0.2, 260)] },
    },
    {
      id: 'B',
      label: 'Soft marimba pair',
      blurb: 'Two warm, wooden-sounding notes, low then high.',
      recipe: { gain: 0.78, family: 'pickup', maxVoices: 2, reverb: 0.08, layers: [...bar(523, 0, 0.3), ...bar(784, 110, 0.3)] },
    },
    {
      id: 'C',
      label: 'Coin ting',
      blurb: 'A bright little two-step "ting-ting", like picking up a coin in a game.',
      recipe: {
        gain: 1,
        family: 'pickup',
        maxVoices: 2,
        reverb: 0.05,
        layers: [
          tone(988, { peak: 0.15, attackMs: 2, holdMs: 50, tauMs: 15 }, { filters: [lp(5000)] }, 'square'),
          tone(1319, { peak: 0.15, attackMs: 2, holdMs: 150, tauMs: 90 }, { startMs: 70, filters: [lp(5000)] }, 'square'),
        ],
      },
    },
  ],
};

export const KILL_SOUND: CueSlot = {
  id: 'killSound',
  title: 'You sank a ship (the explosion)',
  note: 'No signal sound: the confirmation is the ship blowing up, heard from a distance. It can play in the same second as the sinking sound you picked, so it is the blast, not another groan.',
  today: 'kill',
  candidates: [
    {
      id: 'A',
      label: 'Magazine blast, tearing steel',
      blurb: 'A huge deep boom as the ammunition goes up, then steel tearing apart.',
      recipe: {
        gain: 0.29,
        family: 'kill',
        maxVoices: 2,
        reverb: 0.4,
        layers: [
          thump(42, 20, 500, 1, 600, { drive: 3 }),
          noiseLayer('brown', [lp({ from: 1500, to: 120, ms: 1000 }, 0.8)], { peak: 1.4, attackMs: 3, tauMs: 700 }),
          metalRing(380, [1, 1.47, 2.09, 2.56], 25, 8, 120, { startMs: 350, filters: [lp(1500)], grains: { count: 9, windowMs: 900, thin: 0.5, spread: [0.7, 1.4] } }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Double blast',
      blurb: 'Two heavy explosions close together, the second bigger, then a low rumble.',
      recipe: {
        gain: 0.32,
        family: 'kill',
        maxVoices: 2,
        reverb: 0.4,
        layers: [
          thump(50, 26, 300, 0.7, 350, { drive: 3 }),
          noiseLayer('brown', [lp(700)], { peak: 1, attackMs: 3, tauMs: 300 }),
          thump(40, 18, 500, 1, 650, { drive: 3, startMs: 420 }),
          noiseLayer('brown', [lp({ from: 1200, to: 140, ms: 900 })], { peak: 1.4, attackMs: 3, tauMs: 650 }, { startMs: 420 }),
          groan(48, 34, 1600, 0.12, { startMs: 1200 }),
        ],
      },
    },
    {
      id: 'C',
      label: 'Far boom, slow roll',
      blurb: 'A muffled boom far away whose rumble keeps rolling for a couple of seconds.',
      recipe: {
        gain: 0.42,
        family: 'kill',
        maxVoices: 2,
        reverb: 0.5,
        echoes: [
          { delayMs: 500, gain: 0.35, lowpassHz: 300, jitter: 0.2 },
          { delayMs: 1100, gain: 0.2, lowpassHz: 250, jitter: 0.2 },
        ],
        layers: [
          thump(45, 22, 400, 0.9, 500, { drive: 2, filters: [lp(250)] }),
          noiseLayer('brown', [lp(280)], { peak: 1.5, attackMs: 20, tauMs: 900 }, { am: { rateHz: 4, depth: 0.35, jitter: 0.3 } }),
        ],
      },
    },
  ],
};

export const CARD_FITTED_SUBTLE: CueSlot = {
  id: 'cardFittedSubtle',
  title: 'Card fitted (subtle)',
  note: 'You fit an upgrade card. Much quieter and shorter than before: a single soft click or tap.',
  today: 'fitCommon',
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: 'Soft latch click',
      blurb: 'A small, soft click, like a cabinet latch closing.',
      recipe: { gain: 1, family: 'fit', maxVoices: 3, layers: [click(1800, 2, 6, 8), thump(180, 120, 20, 0.15, 12)] },
    },
    {
      id: 'B',
      label: 'Muted wooden tap',
      blurb: 'One quiet knock on wood.',
      recipe: {
        gain: 1,
        family: 'fit',
        maxVoices: 3,
        layers: [{ source: { kind: 'click', ms: 3 }, modes: { f0: 300, ratios: [1, 2.3], q: 8, falloffDb: 4 }, env: { peak: 20, attackMs: 0, tauMs: 25 } }],
      },
    },
    {
      id: 'C',
      label: 'Tiny brass tick',
      blurb: 'A tiny, light metallic tick.',
      recipe: { gain: 1, family: 'fit', maxVoices: 3, layers: [metalRing(3200, [1, 1.8], 40, 6, 22)] },
    },
  ],
};

export const BOUNTY_OMINOUS: CueSlot = {
  id: 'bountyOminous',
  title: 'The bounty lands on you (ominous)',
  note: 'You become the bounty. Not an alarm: something dark that says "you are being hunted".',
  today: 'bounty',
  candidates: [
    {
      id: 'A',
      label: 'Low dark swell',
      blurb: 'A deep, dark chord that slowly swells up and fades away.',
      recipe: {
        gain: 1,
        family: 'bounty',
        maxVoices: 1,
        reverb: 0.35,
        layers: [55, 82.4, 65.4].map((hz) =>
          tone(hz, { peak: 0.2, attackMs: 900, holdMs: 300, tauMs: 350 }, { filters: [lp({ from: 150, to: 700, ms: 1100 })] }, 'sawtooth'),
        ),
      },
    },
    {
      id: 'B',
      label: 'One deep drum',
      blurb: 'A single huge, low drum hit that hangs in the air.',
      recipe: {
        gain: 0.46,
        family: 'bounty',
        maxVoices: 1,
        reverb: 0.4,
        layers: [thump(70, 40, 250, 1, 600, { drive: 2 }), tone({ from: 105, to: 62, ms: 300 }, { peak: 0.25, attackMs: 3, tauMs: 250 }, {}, 'triangle')],
      },
    },
    {
      id: 'C',
      label: 'Slow heartbeat',
      blurb: 'Two deep heartbeat thumps, "lub-dub", like a drum in the dark.',
      recipe: {
        gain: 0.42,
        family: 'bounty',
        maxVoices: 1,
        reverb: 0.3,
        layers: [thump(60, 36, 150, 1, 220, { drive: 2, grains: { onsetsMs: [0, 300, 1100, 1400] } })],
      },
    },
  ],
};

/**
 * The round-2 klaxon voice (Eric 2026-11-11: "you had a Klaxon choice that
 * sounded pretty good"), recovered from the round-2 `bounty` take A at
 * 6b9e8f5a. Round 5: "Make the klaxon deeper" — every frequency is scaled by
 * `pitch` (the scoop, and the band filter by `band`); shape, drive and length
 * are unchanged.
 */
function ahOoGah(pitch: number, band = pitch): Layer {
  return {
    source: { kind: 'osc', wave: 'square', freq: { from: 220 * pitch, to: 430 * pitch, ms: 260 } },
    filters: [bp(900 * band, 1.5)],
    env: { peak: 0.3, attackMs: 20, holdMs: 380, tauMs: 40 },
    drive: 3,
    grains: { onsetsMs: [0] },
  };
}

const KLAXON_RECIPE = { gain: 1, family: 'klaxon', maxVoices: 4, reverb: 0.15 } as const;

export const KLAXON: CueSlot = {
  id: 'klaxon',
  title: 'Klaxon (hull alarms and your own sinking)',
  note: 'The klaxon you liked, made deeper. One voice for all three: PLAY = the alarm when your hull drops under half; \u00d73 = three of them under a quarter; SINKING = it repeating while everything muffles under rushing water and goes quiet.',
  today: 'hpHurt',
  todayMore: [
    { label: "Today's under-a-quarter sound", tone: 'hpCritical' },
    { label: "Today's sinking sound", tone: 'sink' },
  ],
  klaxon: true,
  candidates: [
    {
      id: 'A',
      label: 'A little deeper',
      blurb: 'The same "ah-oo-gah", about four notes lower.',
      recipe: { ...KLAXON_RECIPE, layers: [ahOoGah(0.79)] },
    },
    {
      id: 'B',
      label: 'Deeper',
      blurb: 'The same "ah-oo-gah", about seven notes lower: heavier and more serious.',
      recipe: { ...KLAXON_RECIPE, layers: [ahOoGah(0.67)] },
    },
    {
      id: 'C',
      label: 'An octave down',
      blurb: 'The same "ah-oo-gah" a full octave lower: a big, growling ship\u2019s klaxon.',
      // The band filter falls only to x0.67 so the lowest take keeps its bite on small speakers.
      recipe: { ...KLAXON_RECIPE, layers: [ahOoGah(0.5, 0.67)] },
    },
  ],
};

/** Gap after the last "ah-oo-gah" of one alarm before the next alarm starts, seconds. */
export const KLAXON_STEP_S = 0.9;

/** Seconds from one alarm to the next for this klaxon take (a double alarm needs more room). */
export function klaxonStepS(recipe: { layers: readonly Layer[] }): number {
  const lastOnsetMs = recipe.layers.reduce((m, l) => Math.max(m, ...(l.grains?.onsetsMs ?? [0])), 0);
  return KLAXON_STEP_S + lastOnsetMs / 1000;
}

/** The sinking demo's length, seconds. */
export const SINKING_DEMO_S = 7;
