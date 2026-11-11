// THE SOUND AUDITION PAGE (Story 10.13 wave A) — entry. Bundled by
// client/scripts/soundAudition.mjs from the REAL client audio modules into one
// self-contained HTML file, so every candidate Eric hears is the same recipe
// data and the same render code the game will ship.

import { CUE_SLOTS } from '../../src/audio/synth/candidates/index.js';
import { byId } from './dom.js';
import { cueCard } from './cuePanel.js';
import { EnginePanel } from './enginePanel.js';
import { Picks } from './picks.js';
import { Rig } from './rig.js';
import { auditionSelfTest } from './selfTest.js';

declare global {
  interface Window {
    __auditionSelfTest?: typeof auditionSelfTest;
  }
}

const PICK_ORDER = ['engines', ...CUE_SLOTS.map((s) => s.id)];

function wireTransport(rig: Rig): void {
  const status = byId<HTMLElement>('status');
  const show = (): void => {
    status.textContent = rig.running ? 'Sound is on.' : 'Sound is off. Click START SOUND.';
  };
  byId<HTMLButtonElement>('start').addEventListener('click', () => {
    const ctx = rig.start();
    if (!ctx) status.textContent = 'This browser has no Web Audio support.';
    ctx?.addEventListener('statechange', show);
    show();
  });
  byId<HTMLButtonElement>('stopAll').addEventListener('click', () => rig.stopAll());
  const vol = byId<HTMLInputElement>('volume');
  vol.addEventListener('input', () => rig.setVolume(Number(vol.value)));
  show();
}

function wireSummary(picks: Picks): void {
  const box = byId<HTMLTextAreaElement>('summary');
  const note = byId<HTMLElement>('copyStatus');
  const refresh = (): void => {
    box.value = picks.summary();
  };
  picks.onChange(refresh);
  refresh();
  byId<HTMLButtonElement>('copy').addEventListener('click', () => {
    // Called inside the click (the clipboard needs the gesture); a missing
    // clipboard API throws synchronously, which the wrapper turns into a rejection.
    new Promise<void>((ok, fail) => navigator.clipboard.writeText(box.value).then(ok, fail))
      .then(() => (note.textContent = 'Copied. Paste it into the chat.'))
      .catch(() => {
        box.focus();
        box.select();
        note.textContent = 'Copy was blocked; the text is selected, press Ctrl+C or Cmd+C.';
      });
  });
}

function boot(): void {
  const rig = new Rig();
  const picks = new Picks(PICK_ORDER);
  const engines = new EnginePanel(rig, picks);
  byId<HTMLElement>('engines').append(engines.render());
  byId<HTMLElement>('cues').append(...CUE_SLOTS.map((slot) => cueCard(slot, rig, picks)));
  wireTransport(rig);
  wireSummary(picks);
}

window.__auditionSelfTest = auditionSelfTest;
boot();
