// The STORM card (Story 10.13 round 3): the continuous storm bed
// (audio/stormBed.ts) on the real profiles, with a take picker (Eric's pick
// marked, every take still playable), an IN THE STORM toggle, an intensity
// slider, and a button that runs your engine underneath so the two can be
// judged together.

import { STORM_CANDIDATES } from '../../src/audio/synth/candidates/index.js';
import { StormBedVoice } from '../../src/audio/stormBed.js';
import { button, h, slider } from './dom.js';
import type { EnginePanel } from './enginePanel.js';
import type { Rig } from './rig.js';

const TICK_MS = 100;
/** Leaving the storm: the bed fades out over this long before it stops. */
const LEAVE_FADE_S = 3;

export class StormPanel {
  private setId: string;
  private intensity = 1;
  private inside = false;
  private voice: StormBedVoice | null = null;
  private stormButton: HTMLButtonElement | null = null;
  private engineButton: HTMLButtonElement | null = null;

  constructor(
    private readonly rig: Rig,
    /** Eric's picked storm profile, marked read-only. */
    private readonly picked: string,
    private readonly engines: EnginePanel,
  ) {
    this.setId = STORM_CANDIDATES.some((c) => c.id === picked) ? picked : STORM_CANDIDATES[0].id;
    rig.onStop(() => {
      this.leave();
      this.engineButton?.setAttribute('aria-pressed', 'false');
    });
    window.setInterval(() => this.voice?.update(this.intensity), TICK_MS);
  }

  render(): HTMLElement {
    const rows = STORM_CANDIDATES.map((c) =>
      h('div', { class: c.id === this.picked ? 'row picked' : 'row' }, [
        h('label', { class: 'choice listen' }, [this.listenRadio(c.id), h('span', { class: 'cand' }, [c.label])]),
        h('p', { class: 'blurb' }, [c.blurb]),
        h('span', { class: c.id === this.picked ? 'badge' : 'badge empty' }, [c.id === this.picked ? 'YOUR PICK' : '']),
      ]),
    );
    this.stormButton = button('IN THE STORM', () => this.toggle(), 'primary');
    this.stormButton.setAttribute('aria-pressed', 'false');
    this.engineButton = button('ENGINE UNDER IT', () => this.toggleEngine());
    this.engineButton.setAttribute('aria-pressed', 'false');
    const level = slider('Storm strength', { min: 0, max: 1, step: 0.01, value: this.intensity, left: 'Edge of the storm', right: 'Deep inside' }, (v) => {
      this.intensity = v;
    });
    return h('section', { class: 'card storm', 'aria-labelledby': 'storm-title' }, [
      h('h3', { id: 'storm-title', class: 'card-title' }, ['Storm (continuous)']),
      h('p', { class: 'note' }, [
        'No one-shot warning: wind and rain play the whole time you are inside the storm, and fade out over a few seconds when you leave. Turn on the engine under it to check they sit well together (the engine uses the settings in the Engines card below).',
      ]),
      h('div', { class: 'controls' }, [this.stormButton, this.engineButton]),
      level.root,
      h('div', { class: 'block' }, [h('h3', {}, ['Listen to']), ...rows]),
    ]);
  }

  private listenRadio(id: string): HTMLInputElement {
    const input = h('input', { type: 'radio', name: 'storm-set', value: id, checked: id === this.setId });
    input.addEventListener('change', () => {
      this.setId = id;
      if (this.inside) this.enter();
    });
    return input;
  }

  private toggle(): void {
    if (this.inside) this.leave();
    else this.enter();
  }

  private toggleEngine(): void {
    this.engines.setEngineOn(!this.engines.engineOn);
    this.engineButton?.setAttribute('aria-pressed', String(this.engines.engineOn));
  }

  private enter(): void {
    this.voice?.release(LEAVE_FADE_S);
    this.voice = null;
    this.rig.guard('Starting the storm', () => {
      const ctx = this.rig.start();
      const sink = this.rig.sink;
      if (!ctx || !sink) return;
      const profile = (STORM_CANDIDATES.find((c) => c.id === this.setId) ?? STORM_CANDIDATES[0]).profile;
      this.voice = new StormBedVoice(ctx, sink, profile);
      if (this.voice.released) throw new Error('the storm sound could not be built in this browser');
      this.voice.update(this.intensity);
    });
    this.inside = this.voice !== null;
    this.stormButton?.setAttribute('aria-pressed', String(this.inside));
  }

  private leave(): void {
    this.voice?.release(LEAVE_FADE_S);
    this.voice = null;
    this.inside = false;
    this.stormButton?.setAttribute('aria-pressed', 'false');
  }
}
