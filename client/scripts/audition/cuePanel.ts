// One card per cue slot (Story 10.13): a PLAY button per shipped take and its
// blurb; a distance dial for sounds heard out on the water; a "3 in quick
// series" button where the sound comes in bursts; the old sound for
// comparison; and, for the klaxon, "×3 (hull under a quarter)" and the
// SINKING demo.

import type { CueCandidate, CueGroup, CueSlot } from '../../src/audio/synth/candidates/index.js';
import { TONES } from '../../src/audio/tones.js';
import { STANDARD_HORN } from '../../src/audio/horns.js';
import { button, h, slider } from './dom.js';
import type { Rig } from './rig.js';
import { klaxonSeriesS } from './sinking.js';

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

export function cueCard(slot: CueSlot, rig: Rig): HTMLElement {
  const dial = { distance: 0 };
  const extras: HTMLElement[] = [];
  if (slot.world) {
    extras.push(slider('Distance', { min: 0, max: 1, step: 0.01, value: 0, left: 'Near', right: 'Far' }, (v) => (dial.distance = v)).root);
  }
  extras.push(...compareButtons(slot, rig));
  const rows = slot.candidates.map((c) => candidateRow(slot, c, rig, dial));
  return h('section', { class: 'card', 'aria-labelledby': `t-${slot.id}` }, [
    h('h3', { id: `t-${slot.id}`, class: 'card-title' }, [slot.title]),
    h('p', { class: 'note' }, [slot.note]),
    h('div', { class: 'controls' }, extras),
    ...rows,
  ]);
}

/** The old-sound buttons: the legacy tone(s), or the old oscillator horn. */
function compareButtons(slot: CueSlot, rig: Rig): HTMLButtonElement[] {
  const out: HTMLButtonElement[] = [];
  const tone = slot.today;
  if (tone !== undefined) out.push(button("Today's sound", () => rig.playTone(TONES[tone]), 'ghost'));
  for (const more of slot.todayMore ?? []) out.push(button(more.label, () => rig.playTone(TONES[more.tone]), 'ghost'));
  if (slot.todayHorn) out.push(button('The old horn', () => rig.playHorn(STANDARD_HORN), 'ghost'));
  return out;
}

/** One heading on the page and the cards under it. */
export function cueGroup(group: CueGroup, index: number, rig: Rig): HTMLElement {
  const id = `group-${index}`;
  return h('section', { class: 'group', 'aria-labelledby': id }, [
    h('h2', { id, class: 'group-title' }, [group.title]),
    h('p', { class: 'intro' }, [group.intro]),
    ...group.slots.map((slot) => cueCard(slot, rig)),
  ]);
}

function actionsFor(slot: CueSlot, c: CueCandidate, rig: Rig, dial: { distance: number }): HTMLElement[] {
  const actions: HTMLElement[] = [button(`${c.id} — ${c.label}`, () => rig.play(c.recipe, dial.distance), 'play')];
  if (slot.salvo) {
    actions.push(button('×3 quick series', () => seriesDelays(slot.id).forEach((d) => rig.play(c.recipe, dial.distance, d)), 'ghost'));
  }
  if (slot.klaxon) {
    actions.push(button('×3 (hull under a quarter)', () => klaxonSeriesS(c.recipe).forEach((d) => rig.play(c.recipe, 0, d)), 'ghost'));
    actions.push(button('SINKING', () => rig.playSinking(c.recipe), 'ghost'));
  }
  return actions;
}

function candidateRow(slot: CueSlot, c: CueCandidate, rig: Rig, dial: { distance: number }): HTMLElement {
  return h('div', { class: 'row' }, [h('div', { class: 'actions' }, actionsFor(slot, c, rig, dial)), h('p', { class: 'blurb' }, [c.blurb])]);
}
