// THE SOUND AUDITION PAGE (Story 10.13) — entry. Bundled by
// client/scripts/soundAudition.mjs from the REAL client audio modules into one
// self-contained HTML file, so every sound it plays is the same recipe
// data and the same render code the game ships.

import { CUE_GROUPS } from '../../src/audio/synth/candidates/index.js';
import { byId } from './dom.js';
import { cueGroup } from './cuePanel.js';
import { EnginePanel } from './enginePanel.js';
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

function boot(): void {
  const rig = new Rig();
  wireErrors(rig);
  const engines = new EnginePanel(rig);
  byId<HTMLElement>('storm').append(new StormPanel(rig, engines).render());
  byId<HTMLElement>('engines').append(engines.render());
  byId<HTMLElement>('cues').append(...CUE_GROUPS.map((group, i) => cueGroup(group, i, rig)));
  wireTransport(rig);
  new Meter(rig, byId<HTMLCanvasElement>('meter'), byId<HTMLElement>('meterText'));
  byId<HTMLElement>('build').textContent = __AUDITION_BUILD__;
}

window.__auditionSelfTest = auditionSelfTest;
boot();
