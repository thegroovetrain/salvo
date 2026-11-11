// THE SOUND AUDITION PAGE (Story 10.13 wave A) — entry. Bundled by
// client/scripts/soundAudition.mjs from the REAL client audio modules into one
// self-contained HTML file, so every candidate Eric hears is the same recipe
// data and the same render code the game will ship.

import { NEW_TAKES_GROUP, PICKED_GROUPS } from '../../src/audio/synth/candidates/index.js';
import { byId } from './dom.js';
import { cueGroup } from './cuePanel.js';
import { EnginePanel } from './enginePanel.js';
import { Picks } from './picks.js';
import { ERIC_PICKS } from './picked.js';
import { StormPanel } from './stormPanel.js';
import { Meter } from './meter.js';
import { Rig } from './rig.js';
import { auditionSelfTest } from './selfTest.js';
import { statusText } from './status.js';

declare global {
  interface Window {
    __auditionSelfTest?: typeof auditionSelfTest;
  }
}

/** Build time + a short description, injected by soundAudition.mjs. */
declare const __AUDITION_BUILD__: string;

/** Only this round's slots go into the picks summary. */
const PICK_ORDER = NEW_TAKES_GROUP.slots.map((s) => s.id);

function wireTransport(rig: Rig): void {
  const status = byId<HTMLElement>('status');
  const show = (): void => {
    status.textContent = statusText(rig.state, rig.pending);
  };
  rig.onState(show);
  byId<HTMLButtonElement>('start').addEventListener('click', () => {
    byId<HTMLElement>('error').hidden = true; // a fresh attempt; a new failure shows again
    rig.start();
    show();
  });
  byId<HTMLButtonElement>('testTone').addEventListener('click', () => rig.testTone());
  byId<HTMLButtonElement>('stopAll').addEventListener('click', () => rig.stopAll());
  const vol = byId<HTMLInputElement>('volume');
  vol.addEventListener('input', () => rig.setVolume(Number(vol.value)));
  show();
}

/** One visible error line, fed by the rig and by anything uncaught on the page. */
function wireErrors(rig: Rig): void {
  const line = byId<HTMLElement>('error');
  const show = (message: string): void => {
    line.textContent = `Something went wrong. ${message}`;
    line.hidden = false;
  };
  rig.onError(show);
  window.addEventListener('error', (e) => show(`Page error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r: unknown = e.reason;
    show(`Unhandled failure: ${r instanceof Error ? r.message : String(r)}`);
  });
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
  wireErrors(rig);
  const picks = new Picks(PICK_ORDER);
  const engines = new EnginePanel(rig, ERIC_PICKS.engines);
  byId<HTMLElement>('round3').append(cueGroup(NEW_TAKES_GROUP, 0, rig, { kind: 'pick', picks }));
  byId<HTMLElement>('storm').append(new StormPanel(rig, ERIC_PICKS.stormBed, engines).render());
  byId<HTMLElement>('engines').append(engines.render());
  const reference = { kind: 'reference', picked: ERIC_PICKS } as const;
  byId<HTMLElement>('pickedCues').append(...PICKED_GROUPS.map((group, i) => cueGroup(group, i + 1, rig, reference)));
  wireTransport(rig);
  wireSummary(picks);
  new Meter(rig, byId<HTMLCanvasElement>('meter'), byId<HTMLElement>('meterText'));
  byId<HTMLElement>('build').textContent = __AUDITION_BUILD__;
}

window.__auditionSelfTest = auditionSelfTest;
boot();
