// One card per cue slot (Story 10.13): a PLAY button per candidate, its
// blurb and a pick radio; a distance dial for sounds heard out on the water; a
// "3 in quick series" button where the sound comes in bursts; and today's
// legacy tone for comparison.

import type { CueCandidate, CueSlot } from '../../src/audio/synth/candidates/index.js';
import { TONES } from '../../src/audio/tones.js';
import { button, h, slider } from './dom.js';
import type { Picks } from './picks.js';
import type { Rig } from './rig.js';

/** Main-battery salvo: each gun 70–180 ms after the last. Other series: 250 ms apart. */
const MAIN_STAGGER_S: readonly [number, number] = [0.07, 0.18];
const SERIES_STEP_S = 0.25;
const SERIES_COUNT = 3;

function seriesDelays(slotId: string): number[] {
  const out = [0];
  for (let i = 1; i < SERIES_COUNT; i++) {
    const step = slotId === 'mainBattery' ? MAIN_STAGGER_S[0] + Math.random() * (MAIN_STAGGER_S[1] - MAIN_STAGGER_S[0]) : SERIES_STEP_S;
    out.push(out[i - 1] + step);
  }
  return out;
}

export function cueCard(slot: CueSlot, rig: Rig, picks: Picks): HTMLElement {
  const dial = { distance: 0 };
  const extras: HTMLElement[] = [];
  if (slot.world) {
    extras.push(slider('Distance', { min: 0, max: 1, step: 0.01, value: 0, left: 'Near', right: 'Far' }, (v) => (dial.distance = v)).root);
  }
  const today = slot.today;
  if (today !== undefined) extras.push(button("Today's sound", () => rig.playTone(TONES[today]), 'ghost'));
  const rows = slot.candidates.map((c) => candidateRow(slot, c, rig, picks, dial));
  rows.push(noneRow(slot, picks));
  return h('section', { class: 'card', 'aria-labelledby': `t-${slot.id}` }, [
    h('h2', { id: `t-${slot.id}` }, [slot.title]),
    h('p', { class: 'note' }, [slot.note]),
    h('div', { class: 'controls' }, extras),
    ...rows,
  ]);
}

function candidateRow(slot: CueSlot, c: CueCandidate, rig: Rig, picks: Picks, dial: { distance: number }): HTMLElement {
  const play = button(`${c.id} — ${c.label}`, () => rig.play(c.recipe, dial.distance), 'play');
  const actions: HTMLElement[] = [play];
  if (slot.salvo) {
    actions.push(button('×3 quick series', () => seriesDelays(slot.id).forEach((d) => rig.play(c.recipe, dial.distance, d)), 'ghost'));
  }
  return h('div', { class: 'row' }, [
    h('div', { class: 'actions' }, actions),
    h('p', { class: 'blurb' }, [c.blurb]),
    pickRadio(slot.id, c.id, `Pick ${c.id}`, picks),
  ]);
}

function noneRow(slot: CueSlot, picks: Picks): HTMLElement {
  return h('div', { class: 'row none' }, [pickRadio(slot.id, 'none', 'None of these', picks)]);
}

function pickRadio(slotId: string, value: string, text: string, picks: Picks): HTMLElement {
  const input = h('input', { type: 'radio', name: `pick-${slotId}`, value, checked: picks.get(slotId) === value });
  input.addEventListener('change', () => {
    if (input.checked) picks.set(slotId, value);
  });
  return h('label', { class: 'choice pick' }, [input, h('span', {}, [text])]);
}
