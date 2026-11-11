// Round 2 (Eric 2026-11-11, "re-voice everything"): the short SIGNAL cues
// that replace today's beeps — kill, level, card fitted, denied, countdown,
// match start, engine telegraph. Each should sound like something real aboard
// a 1940s warship and still say at once what it means. The frequent ones stay
// short and nearly dry so a quick series never smears.

import type { CueSlot } from './types.js';
import { bell, buzzer, click, every, filters, metalRing, noiseLayer, thump, whistleChord } from './parts.js';

const { lp, bp } = filters;

export const KILL: CueSlot = {
  id: 'kill',
  title: 'You sank a ship',
  note: 'A ship you hit goes down and the kill is yours.',
  today: 'kill',
  candidates: [
    {
      id: 'A',
      label: "Ship's bell, two pairs",
      blurb: 'A ship’s bell struck twice and twice again, "ding-ding, ding-ding", the way bells are rung aboard.',
      recipe: { gain: 1, family: 'signal', maxVoices: 2, reverb: 0.2, layers: [bell(560, 0.2, 500, { grains: { onsetsMs: [0, 260, 700, 960] } })] },
    },
    {
      id: 'B',
      label: 'Steam whistle toot',
      blurb: 'A short, cheerful two-blast toot of a steam whistle: "toot-tooot".',
      recipe: {
        gain: 1,
        family: 'signal',
        maxVoices: 2,
        reverb: 0.25,
        layers: [...whistleChord([392, 494, 587], 0, 160, 0.16), ...whistleChord([392, 494, 587], 320, 520, 0.16)],
      },
    },
    {
      id: 'C',
      label: 'Signal lamp and bell',
      blurb: 'The clatter of a signal lamp’s shutter flashing, then one bright bell stroke.',
      recipe: {
        gain: 0.58,
        family: 'signal',
        maxVoices: 2,
        reverb: 0.15,
        layers: [click(2600, 6, 6, 12, { grains: { onsetsMs: every(85, 5), jitterMs: 10, spread: [0.85, 1.15] } }), bell(880, 0.2, 550, { startMs: 520 })],
      },
    },
  ],
};

export const LEVEL_UP: CueSlot = {
  id: 'levelUp',
  title: 'Level earned',
  note: 'You earn a level (a point to spend on a card).',
  today: 'point',
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: "Bosun's pipe",
      blurb: 'The bosun’s whistle: a shrill note that rises and trills, the call that gets the crew’s attention.',
      recipe: {
        gain: 1,
        family: 'signal',
        maxVoices: 3,
        reverb: 0.05,
        layers: [
          { source: { kind: 'osc', wave: 'sine', freq: { from: 1700, to: 2350, ms: 220 }, vibrato: { rateHz: 11, depth: 0.012 } }, env: { peak: 0.15, attackMs: 15, holdMs: 260, tauMs: 40 } },
          noiseLayer('white', [bp(2200, 6)], { peak: 0.5, attackMs: 15, holdMs: 260, tauMs: 40 }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Single bright bell',
      blurb: 'One clear, high bell stroke that dies away quickly.',
      recipe: { gain: 1, family: 'signal', maxVoices: 3, reverb: 0.05, layers: [bell(1320, 0.3, 180)] },
    },
    {
      id: 'C',
      label: 'Telegraph "ready" ding',
      blurb: 'A small brass "ding" like a bridge instrument confirming it is ready.',
      recipe: { gain: 0.16, family: 'signal', maxVoices: 3, reverb: 0.05, layers: [metalRing(1500, [1, 2.76, 5.4], 120, 22, 140), click(4000, 4, 2, 4)] },
    },
  ],
};

export const CARD_FITTED: CueSlot = {
  id: 'cardFitted',
  title: 'Card fitted',
  note: 'You fit an upgrade card. The heavier card kinds play the same sound a little lower and fuller.',
  today: 'fitCommon',
  salvo: true,
  candidates: [
    {
      id: 'A',
      label: 'Ratchet and clunk',
      blurb: 'Three quick ratchet clicks, then a solid clunk of something locking into place.',
      recipe: {
        gain: 0.19,
        family: 'signal',
        maxVoices: 3,
        reverb: 0.05,
        layers: [
          metalRing(2400, [1, 1.55], 15, 7, 12, { grains: { onsetsMs: every(55, 3) } }),
          metalRing(420, [1, 1.47, 2.09], 20, 9, 70, { startMs: 200 }),
          thump(120, 70, 40, 0.4, 35, { startMs: 200 }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Breech closing',
      blurb: 'A short metal slide and a heavy "chunk", like a gun breech being shut.',
      recipe: {
        gain: 0.19,
        family: 'signal',
        maxVoices: 3,
        reverb: 0.05,
        layers: [
          noiseLayer('white', [bp({ from: 900, to: 2400, ms: 120 }, 3)], { peak: 0.6, attackMs: 30, holdMs: 60, tauMs: 15 }),
          metalRing(260, [1, 1.47, 2.09, 2.56], 18, 10, 80, { startMs: 150 }),
          thump(100, 55, 50, 0.5, 45, { startMs: 150 }),
        ],
      },
    },
    {
      id: 'C',
      label: 'Wrench ring',
      blurb: 'A spanner tapped on steel: one short, bright metallic ring.',
      recipe: { gain: 0.2, family: 'signal', maxVoices: 3, reverb: 0.05, layers: [metalRing(900, [1, 2.08, 3.3, 4.9], 60, 18, 160)] },
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
      id: 'A',
      label: 'Locked firing key',
      blurb: 'A dry double click of a firing key that will not go down.',
      recipe: { gain: 0.4, family: 'denied', maxVoices: 3, layers: [click(2200, 4, 10, 6, { grains: { onsetsMs: [0, 38] } }), click(700, 3, 8, 10)] },
    },
    {
      id: 'B',
      label: 'Interlock thud',
      blurb: 'A short, dull thud, like pushing against a lever that is blocked.',
      recipe: {
        gain: 0.35,
        family: 'denied',
        maxVoices: 3,
        layers: [thump(140, 90, 40, 0.6, 30, { drive: 1.5 }), noiseLayer('brown', [lp(400)], { peak: 0.8, attackMs: 1, tauMs: 30 })],
      },
    },
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
    {
      id: 'B',
      label: 'Small bell tap',
      blurb: 'A light tap on a small bell, short and clean.',
      recipe: { gain: 0.15, family: 'tick', maxVoices: 3, layers: [metalRing(2100, [1, 2.4], 80, 12, 90)] },
    },
    {
      id: 'C',
      label: 'Relay click',
      blurb: 'The solid click of an electrical relay closing.',
      recipe: { gain: 0.6, family: 'tick', maxVoices: 3, layers: [click(1500, 3, 14, 6), click(420, 2, 10, 12, { startMs: 3 })] },
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
      id: 'A',
      label: 'General quarters gong',
      blurb: 'The "bong-bong-bong" battle-stations alarm, about a second long.',
      recipe: {
        gain: 0.56,
        family: 'alarm',
        maxVoices: 1,
        reverb: 0.15,
        layers: [
          { source: { kind: 'osc', wave: 'triangle', freq: { from: 300, to: 420, ms: 230 } }, filters: [lp(2000)], env: { peak: 0.35, attackMs: 4, holdMs: 120, tauMs: 60 }, drive: 2, grains: { onsetsMs: every(300, 4) } },
          metalRing(420, [1, 2.4, 3.9], 30, 8, 120, { grains: { onsetsMs: every(300, 4) } }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Steam whistle blast',
      blurb: 'One long, full blast of the ship’s steam whistle.',
      recipe: { gain: 0.98, family: 'alarm', maxVoices: 1, reverb: 0.3, layers: whistleChord([233, 294, 349], 0, 1100, 0.2) },
    },
    {
      id: 'C',
      label: 'Bell rung fast',
      blurb: 'The ship’s bell rung hard and fast for a second, like an all-hands call.',
      recipe: { gain: 1, family: 'alarm', maxVoices: 1, reverb: 0.2, layers: [bell(700, 0.2, 260, { grains: { onsetsMs: every(115, 10), jitterMs: 8 } })] },
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
      id: 'A',
      label: 'Brass bell ding',
      blurb: 'The small bell inside the engine-order telegraph: a quick brass "ding".',
      recipe: { gain: 0.15, family: 'telegraph', maxVoices: 3, reverb: 0.05, layers: [metalRing(1800, [1, 2.7, 5.1], 150, 18, 110)] },
    },
    {
      id: 'B',
      label: 'Lever clack and ding',
      blurb: 'The handle clacking into its notch, with a softer ding just after.',
      recipe: {
        gain: 0.27,
        family: 'telegraph',
        maxVoices: 3,
        reverb: 0.05,
        layers: [click(1200, 3, 5, 10), thump(220, 140, 25, 0.3, 15), metalRing(1800, [1, 2.7], 150, 9, 90, { startMs: 50 })],
      },
    },
    {
      id: 'C',
      label: 'Dry clack only',
      blurb: 'Just the handle clacking into place, no bell.',
      recipe: { gain: 0.5, family: 'telegraph', maxVoices: 3, layers: [click(900, 2, 15, 14), click(2600, 3, 9, 6)] },
    },
  ],
};
