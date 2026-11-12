// The ENGINES section of the audition page (Story 10.13): your own engine
// (EngineVoice) with throttle / speed / boost, and another ship heard across
// the water (RemoteEngineVoice) with distance and left–right. Both are the
// game's real voices on the shipped profiles in candidates/engines.ts.

import type { ShipClassId } from '@salvo/shared';
import { ENGINE_CANDIDATES } from '../../src/audio/synth/candidates/index.js';
import { EngineVoice, RemoteEngineVoice } from '../../src/audio/engineGraph.js';
import { closeAlongside01 } from '../../src/audio/engine.js';
import { button, h, radios, slider } from './dom.js';
import type { Rig } from './rig.js';

const TICK_MS = 100;
/** "Speed follows throttle": a heavy ship eases toward the ordered speed with this time constant. */
const SPEED_TAU_S = 3;
/** Where boost pushes speed (the engine model honors a little past 1). */
const BOOST_SPEED = 1.15;

const HULLS = Object.keys(ENGINE_CANDIDATES[0].profiles) as ShipClassId[];
const hullName = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);
const HULL_OPTIONS = HULLS.map((id) => ({ value: id, label: hullName(id) }));

interface OwnState {
  setId: string;
  hull: ShipClassId;
  throttle: number;
  speed: number;
  follow: boolean;
  boost: boolean;
  on: boolean;
}

interface RemoteState {
  hull: ShipClassId;
  distance: number;
  pan: number;
  speed: number;
  on: boolean;
}

export class EnginePanel {
  private readonly own: OwnState = { setId: ENGINE_CANDIDATES[0].id, hull: HULLS[0], throttle: 0.5, speed: 0, follow: true, boost: false, on: false };
  private readonly remote: RemoteState = { hull: HULLS[1] ?? HULLS[0], distance: 0.3, pan: 0.4, speed: 0.7, on: false };
  private ownVoice: EngineVoice | null = null;
  private remoteVoice: RemoteEngineVoice | null = null;
  private speedInput: HTMLInputElement | null = null;
  private onButton: HTMLButtonElement | null = null;
  private remoteButton: HTMLButtonElement | null = null;
  private boostButton: HTMLButtonElement | null = null;

  constructor(private readonly rig: Rig) {
    rig.onStop(() => this.stopEverything());
    window.setInterval(() => this.tick(), TICK_MS);
  }

  render(): HTMLElement {
    return h('section', { class: 'card engines', 'aria-labelledby': 'engines-title' }, [
      h('h2', { id: 'engines-title' }, ['Engines']),
      h('p', { class: 'note' }, ['The engine plays all the time while you sail. Pick a ship, then move the throttle. Each ship has its own weight and pitch.']),
      this.setList(),
      this.ownControls(),
      this.remoteControls(),
    ]);
  }

  private setList(): HTMLElement {
    const rows = ENGINE_CANDIDATES.map((c) =>
      h('div', { class: 'row' }, [h('span', { class: 'cand' }, [c.label]), h('p', { class: 'blurb' }, [c.blurb])]),
    );
    return h('div', { class: 'block' }, [h('h3', {}, ['The engine']), ...rows]);
  }

  private ownControls(): HTMLElement {
    const hull = radios('own-hull', 'Ship', HULL_OPTIONS, this.own.hull, (v) => {
      this.own.hull = v as ShipClassId;
      this.rebuildOwn();
    });
    const throttle = slider('Throttle', { min: -1, max: 1, step: 0.01, value: this.own.throttle, left: 'Full astern', right: 'Full ahead' }, (v) => {
      this.own.throttle = v;
    });
    const speed = slider('Speed', { min: 0, max: BOOST_SPEED, step: 0.01, value: this.own.speed, left: 'Stopped', right: 'Flat out' }, (v) => {
      this.own.speed = v;
    });
    this.speedInput = speed.input;
    const follow = h('input', { type: 'checkbox', checked: this.own.follow });
    follow.addEventListener('change', () => {
      this.own.follow = follow.checked;
    });
    this.onButton = button('ENGINE ON', () => this.toggleOwn(), 'primary');
    this.boostButton = button('BOOST', () => this.toggleBoost());
    this.boostButton.setAttribute('aria-pressed', 'false');
    return h('div', { class: 'block' }, [
      h('h3', {}, ['Your ship']),
      h('div', { class: 'controls' }, [this.onButton, this.boostButton]),
      hull,
      throttle.root,
      speed.root,
      h('label', { class: 'choice' }, [follow, h('span', {}, ['Speed follows throttle (eases toward it slowly, like a heavy ship)'])]),
    ]);
  }

  private remoteControls(): HTMLElement {
    const hull = radios('remote-hull', 'Ship', HULL_OPTIONS, this.remote.hull, (v) => {
      this.remote.hull = v as ShipClassId;
      this.rebuildRemote();
    });
    const dist = slider('Distance', { min: 0, max: 1, step: 0.01, value: this.remote.distance, left: 'Close', right: 'Edge of hearing' }, (v) => (this.remote.distance = v));
    const pan = slider('Left – right', { min: -1, max: 1, step: 0.01, value: this.remote.pan, left: 'Left', right: 'Right' }, (v) => (this.remote.pan = v));
    const speed = slider('Their speed', { min: 0, max: 1, step: 0.01, value: this.remote.speed, left: 'Stopped', right: 'Flat out' }, (v) => (this.remote.speed = v));
    this.remoteButton = button('PLAY OTHER SHIP', () => this.toggleRemote(), 'primary');
    return h('div', { class: 'block' }, [
      h('h3', {}, ['Another ship, heard across the water']),
      h('p', { class: 'note' }, ['A simpler, cheaper engine voice for ships you can see. It uses the same engine.']),
      h('p', { class: 'note ruling' }, ['Ruling: realistic \u2014 your own machinery drowns out other ships; you only hear another ship\u2019s engine when it is close alongside.']),
      h('div', { class: 'controls' }, [this.remoteButton]),
      hull,
      dist.root,
      pan.root,
      speed.root,
    ]);
  }

  private profile(hull: ShipClassId) {
    const set = ENGINE_CANDIDATES.find((c) => c.id === this.own.setId) ?? ENGINE_CANDIDATES[0];
    return set.profiles[hull];
  }

  /** Turn your own engine on or off (the storm card uses this to play an engine under the storm). */
  setEngineOn(on: boolean): void {
    if (this.own.on !== on) this.toggleOwn();
  }

  get engineOn(): boolean {
    return this.own.on;
  }

  private toggleOwn(): void {
    this.own.on = !this.own.on;
    this.rebuildOwn();
    this.label(this.onButton, this.own.on, 'ENGINE OFF', 'ENGINE ON');
  }

  private toggleRemote(): void {
    this.remote.on = !this.remote.on;
    this.rebuildRemote();
    this.label(this.remoteButton, this.remote.on, 'STOP OTHER SHIP', 'PLAY OTHER SHIP');
  }

  private toggleBoost(): void {
    this.own.boost = !this.own.boost;
    this.boostButton?.setAttribute('aria-pressed', String(this.own.boost));
  }

  private label(b: HTMLButtonElement | null, on: boolean, onText: string, offText: string): void {
    if (!b) return;
    b.textContent = on ? onText : offText;
    b.setAttribute('aria-pressed', String(on));
  }

  private rebuildOwn(): void {
    this.ownVoice?.release();
    this.ownVoice = null;
    if (!this.own.on) return;
    this.rig.guard('Starting the engine', () => {
      const ctx = this.rig.start();
      const sink = this.rig.sink;
      if (!ctx || !sink) return;
      this.ownVoice = new EngineVoice(ctx, sink, this.profile(this.own.hull));
      if (this.ownVoice.released) throw new Error('the engine sound could not be built in this browser');
    });
  }

  private rebuildRemote(): void {
    this.remoteVoice?.release();
    this.remoteVoice = null;
    if (!this.remote.on) return;
    this.rig.guard("Starting the other ship's engine", () => {
      const ctx = this.rig.start();
      const sink = this.rig.sink;
      if (!ctx || !sink) return;
      this.remoteVoice = new RemoteEngineVoice(ctx, sink, this.profile(this.remote.hull));
      if (this.remoteVoice.released) throw new Error('the engine sound could not be built in this browser');
    });
  }

  private stopEverything(): void {
    this.own.on = false;
    this.remote.on = false;
    this.rebuildOwn();
    this.rebuildRemote();
    this.label(this.onButton, false, 'ENGINE OFF', 'ENGINE ON');
    this.label(this.remoteButton, false, 'STOP OTHER SHIP', 'PLAY OTHER SHIP');
  }

  private tick(): void {
    this.easeSpeed();
    this.ownVoice?.update({ throttle: this.own.throttle, speed01: this.own.speed, boost: this.own.boost });
    this.remoteVoice?.update({ speed01: this.remote.speed, distance01: closeAlongside01(this.remote.distance), pan: this.remote.pan });
  }

  private easeSpeed(): void {
    if (!this.own.follow) return;
    const target = this.own.boost ? BOOST_SPEED : Math.abs(this.own.throttle);
    this.own.speed += (target - this.own.speed) * (1 - Math.exp(-TICK_MS / 1000 / SPEED_TAU_S));
    if (this.speedInput) this.speedInput.value = String(this.own.speed);
  }
}
