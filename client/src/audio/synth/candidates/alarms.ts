// Round 2 (Eric 2026-11-11, "re-voice everything"): the ALARMS — storm, the
// bounty, the two hull-damage bands, your own sinking — and the foghorn's
// voice. Prominent by design: these say "something is wrong" or "everyone,
// listen".

import type { CueSlot } from './types.js';
import { alarmBell, bubbles, buzzer, every, filters, groan, metalRing, noiseLayer, thump, tone } from './parts.js';

const { lp, hp, bp } = filters;

export const STORM_WARNING: CueSlot = {
  id: 'stormWarning',
  title: 'You enter the storm',
  note: 'Your ship crosses into the storm, where it takes damage.',
  today: 'stormWarn',
  candidates: [
    {
      id: 'A',
      label: 'Wind gust and thunder',
      blurb: 'A rising gust of wind with a low roll of thunder under it.',
      recipe: {
        gain: 0.38,
        family: 'alarm',
        maxVoices: 1,
        reverb: 0.3,
        layers: [
          noiseLayer('pink', [bp({ from: 300, to: 1100, ms: 800 }, 1.2)], { peak: 2, attackMs: 400, holdMs: 400, tauMs: 350 }, { am: { rateHz: 1.3, depth: 0.4 } }),
          noiseLayer('brown', [lp(160)], { peak: 1.2, attackMs: 60, tauMs: 280 }, { startMs: 300, grains: { count: 4, windowMs: 800, thin: 0.6 } }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Rain and wind closing in',
      blurb: 'Hard rain starting to hammer down as the wind picks up.',
      recipe: {
        gain: 0.16,
        family: 'alarm',
        maxVoices: 1,
        reverb: 0.2,
        layers: [
          noiseLayer('pink', [bp({ from: 400, to: 900, ms: 900 }, 1)], { peak: 1.5, attackMs: 500, holdMs: 500, tauMs: 300 }),
          { source: { kind: 'click', ms: 3 }, filters: [hp(2500)], env: { peak: 2, attackMs: 0, tauMs: 6 }, startMs: 150, grains: { count: 160, windowMs: 1200, spread: [0.6, 1.8] } },
        ],
      },
    },
    {
      id: 'C',
      label: 'Hull creak in a swell',
      blurb: 'The long creak of the hull flexing as a big swell lifts it, with water slapping the side.',
      recipe: {
        gain: 0.69,
        family: 'alarm',
        maxVoices: 1,
        reverb: 0.25,
        layers: [groan(85, 68, 1100, 0.5), noiseLayer('brown', [bp(350, 0.8)], { peak: 1.5, attackMs: 300, holdMs: 300, tauMs: 300 }, { startMs: 400 })],
      },
    },
  ],
};

export const BOUNTY: CueSlot = {
  id: 'bounty',
  title: 'The bounty lands on you',
  note: 'You become the bounty: every other ship is now paid extra to sink you.',
  today: 'bounty',
  candidates: [
    {
      id: 'A',
      label: 'Klaxon',
      blurb: 'The "ah-oo-gah" of a dive klaxon, twice.',
      recipe: {
        gain: 1,
        family: 'alarm',
        maxVoices: 1,
        reverb: 0.15,
        layers: [
          {
            source: { kind: 'osc', wave: 'square', freq: { from: 220, to: 430, ms: 260 } },
            filters: [bp(900, 1.5)],
            env: { peak: 0.3, attackMs: 20, holdMs: 380, tauMs: 40 },
            drive: 3,
            grains: { onsetsMs: [0, 620] },
          },
        ],
      },
    },
    {
      id: 'B',
      label: 'Rapid alarm bell',
      blurb: 'An electric alarm bell ringing hard for a second.',
      recipe: { gain: 0.41, family: 'alarm', maxVoices: 1, reverb: 0.15, layers: [alarmBell(1350, 10, 42, 1000)] },
    },
    {
      id: 'C',
      label: 'Radio alert burst',
      blurb: 'A burst of fast, urgent radio beeps.',
      recipe: {
        gain: 1,
        family: 'alarm',
        maxVoices: 1,
        reverb: 0.1,
        layers: [tone(1050, { peak: 0.5, attackMs: 3, holdMs: 70, tauMs: 6 }, { filters: [bp(1200, 0.7)], grains: { onsetsMs: every(120, 7) } }, 'square')],
      },
    },
  ],
};

export const HULL_HURT: CueSlot = {
  id: 'hullHurt',
  title: 'Hull below half',
  note: 'Your hull drops under half. The next slot is the worse one, under a quarter.',
  today: 'hpHurt',
  candidates: [
    {
      id: 'A',
      label: 'Alarm bell, slow',
      blurb: 'A damage-control alarm bell ringing in a slow burst.',
      recipe: { gain: 0.35, family: 'alarm', maxVoices: 1, reverb: 0.1, layers: [alarmBell(1150, 10, 75, 650)] },
    },
    {
      id: 'B',
      label: 'Buzzer, two pulses',
      blurb: 'Two flat pulses of an alarm buzzer.',
      recipe: { gain: 1, family: 'alarm', maxVoices: 1, reverb: 0.05, layers: [buzzer(150, [0, 380], 230, 0.3)] },
    },
    {
      id: 'C',
      label: 'Straining steel and a buzz',
      blurb: 'The hull groaning under strain, with one buzzer pulse over it.',
      recipe: { gain: 1, family: 'alarm', maxVoices: 1, reverb: 0.15, layers: [groan(95, 80, 900, 0.5), buzzer(150, [120], 260, 0.2)] },
    },
  ],
};

export const HULL_CRITICAL: CueSlot = {
  id: 'hullCritical',
  title: 'Hull below a quarter',
  note: 'Your hull drops under a quarter. It should sound clearly worse than the slot above.',
  today: 'hpCritical',
  candidates: [
    {
      id: 'A',
      label: 'Alarm bell, fast',
      blurb: 'The same alarm bell, lower, ringing fast and for longer.',
      recipe: { gain: 0.37, family: 'alarm', maxVoices: 1, reverb: 0.1, layers: [alarmBell(950, 12, 38, 1200)] },
    },
    {
      id: 'B',
      label: 'Buzzer, urgent',
      blurb: 'Four quick, lower buzzer pulses: hurry.',
      recipe: { gain: 1, family: 'alarm', maxVoices: 1, reverb: 0.05, layers: [buzzer(110, every(210, 4), 140, 0.45)] },
    },
    {
      id: 'C',
      label: 'Groaning hull and buzzer',
      blurb: 'A deeper groan as the hull buckles, under three urgent buzzer pulses.',
      recipe: { gain: 1, family: 'alarm', maxVoices: 1, reverb: 0.15, layers: [groan(70, 50, 1300, 0.6), buzzer(110, every(260, 3, 100), 170, 0.25)] },
    },
  ],
};

export const OWN_SINK: CueSlot = {
  id: 'ownSink',
  title: 'Your ship sinks',
  note: 'Your own ship goes down.',
  today: 'sink',
  candidates: [
    {
      id: 'A',
      label: 'Alarm drowning out',
      blurb: 'An alarm bell that goes muffled and dies as water rushes in, under a long hull groan.',
      recipe: {
        gain: 0.38,
        family: 'sink',
        maxVoices: 1,
        reverb: 0.35,
        layers: [
          alarmBell(1100, 10, 45, 1500, { filters: [lp({ from: 4000, to: 300, ms: 1500 })] }),
          groan(65, 38, 3000, 0.5, { startMs: 200 }),
          noiseLayer('pink', [bp({ from: 900, to: 300, ms: 2500 }, 0.7)], { peak: 1.6, attackMs: 600, holdMs: 1500, tauMs: 500 }, { startMs: 300 }),
          bubbles(20, 2500, 0.08, 800, [0.15, 0.6]),
        ],
      },
    },
    {
      id: 'B',
      label: 'Boom, then the water closes',
      blurb: 'A deep boom inside the ship, then rushing water that closes over and goes quiet.',
      recipe: {
        gain: 0.29,
        family: 'sink',
        maxVoices: 1,
        reverb: 0.4,
        layers: [
          thump(50, 24, 400, 1, 450, { drive: 3 }),
          noiseLayer('brown', [lp(500)], { peak: 1.3, attackMs: 4, tauMs: 400 }),
          noiseLayer('pink', [lp({ from: 2500, to: 200, ms: 3000 })], { peak: 1.5, attackMs: 300, holdMs: 1500, tauMs: 500 }, { startMs: 250 }),
          bubbles(26, 3000, 0.08, 500, [0.15, 0.7]),
        ],
      },
    },
  ],
};

export const FOGHORN: CueSlot = {
  id: 'foghorn',
  title: 'Foghorn',
  note: 'The horn every ship can sound. Its rules do not change, only its voice. Players pick their horn in the game today, so this would replace the default horn.',
  todayHorn: true,
  candidates: [
    {
      id: 'A',
      label: 'Typhon, two-tone',
      blurb: 'A deep two-note air horn whose notes waver slowly against each other, like a big ship’s typhon.',
      recipe: {
        gain: 1,
        family: 'horn',
        maxVoices: 3,
        reverb: 0.4,
        layers: [
          ...[110, 110.9, 138.6, 139.5].map((hz) =>
            tone(hz, { peak: 0.15, attackMs: 250, holdMs: 1150, tauMs: 220 }, { filters: [lp(900)] }, 'sawtooth'),
          ),
          noiseLayer('pink', [bp(300, 1.5)], { peak: 0.5, attackMs: 120, holdMs: 1250, tauMs: 200 }),
        ],
      },
    },
    {
      id: 'B',
      label: 'Steam whistle',
      blurb: 'A breathy rush of steam that builds into a deep whistle chord.',
      recipe: {
        gain: 1,
        family: 'horn',
        maxVoices: 3,
        reverb: 0.4,
        layers: [
          noiseLayer('white', [bp(450, 1.2)], { peak: 1, attackMs: 60, holdMs: 1400, tauMs: 220 }),
          ...[196, 247, 294].map((hz) =>
            tone(hz, { peak: 0.13, attackMs: 350, holdMs: 1100, tauMs: 220 }, { startMs: 120, filters: [lp(1800)], source: { kind: 'osc', wave: 'sawtooth', freq: hz, vibrato: { rateHz: 4.5, depth: 0.004 } } }),
          ),
        ],
      },
    },
    {
      id: 'C',
      label: 'Diaphone with a grunt',
      blurb: 'One low, buzzing horn note that ends in the downward "grunt" of a lighthouse diaphone.',
      recipe: {
        gain: 0.64,
        family: 'horn',
        maxVoices: 3,
        reverb: 0.4,
        layers: [
          tone(92, { peak: 0.35, attackMs: 150, holdMs: 1150, tauMs: 50 }, { filters: [lp(1200)], drive: 2 }, 'sawtooth'),
          tone({ from: 90, to: 48, ms: 280 }, { peak: 0.4, attackMs: 10, holdMs: 120, tauMs: 90 }, { startMs: 1300, filters: [lp(900)], drive: 3 }, 'sawtooth'),
          metalRing(280, [1, 1.5], 12, 3, 300, { startMs: 100 }),
        ],
      },
    },
  ],
};
