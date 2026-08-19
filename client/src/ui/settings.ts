// THE settings overlay (Story 2.3) — plain DOM port chrome over the canvas,
// reachable from the home gear, home ESC, and the in-match ESC toggle. It NEVER
// pauses the simulation: while it is open the keyboard chokepoint suppresses ALL
// sim keys (the focused-overlay rule — helm included, unlike the refit modal)
// and canvas clicks can't fire, but the ocean keeps running behind it.
//
// Shape: a PURE VIEW-MODEL (the option sets, the binding reference, the
// danger-row confirm machine) with a thin DOM shell under it, so the contract is
// unit-testable without a browser. Every value is read from and written to
// settings/store.ts — the overlay owns no state of its own except which danger
// action is armed.
//
// Register: the DOM `panel` bed, a 1px `hairline` border, 12px radius, and NO
// fullscreen backdrop dim (DESIGN dims behind results only). z sits between the
// refit modal (1000) and the home (1100). Tokens only — no color literals.

import { CLIENT_CONFIG } from '../config.js';
import { applyViewportCap } from './fit.js';
import {
  scaleTierEnabled,
  scaleTierNote,
  type MotionLevel,
  type Settings,
  type SettingsStore,
  type UiScale,
} from '../settings/store.js';
import { registerCss } from './theme.js';

const S = CLIENT_CONFIG.settings;
const OVERLAY_ID = 'hc-settings';
/** Stable ids the tests pin (never "the only button"). */
export const ABANDON_BUTTON_ID = 'hc-settings-abandon';
export const RESET_BUTTON_ID = 'hc-settings-reset';
export const CLOSE_BUTTON_ID = 'hc-settings-close';

// --- pure view model ----------------------------------------------------------

/** One selectable option in a segmented row. */
export interface OptionModel<T> {
  value: T;
  label: string;
  /** Selectable at the current viewport (the 125% UI-scale gate). */
  enabled: boolean;
  /** Why it is disabled ('' when it isn't). */
  note: string;
}

export const MOTION_OPTIONS: readonly OptionModel<MotionLevel>[] = [
  { value: 'full', label: 'FULL', enabled: true, note: '' },
  { value: 'reduced', label: 'REDUCED', enabled: true, note: '' },
  { value: 'off', label: 'OFF', enabled: true, note: '' },
];

/**
 * Pure: the UI-scale options for a viewport width. The 125% tier is always
 * SHOWN — hiding it would make the capability invisible — but is disabled with
 * an explanatory note below `scaleGateWidthPx` (the committed AC).
 */
export function scaleOptions(viewportW: number): OptionModel<UiScale>[] {
  return S.scaleTiers.map((tier) => ({
    value: tier as UiScale,
    label: `${tier}%`,
    enabled: scaleTierEnabled(tier, viewportW),
    note: scaleTierNote(tier, viewportW),
  }));
}

/** One row of the view-only binding reference. */
export interface BindingRow {
  keys: string;
  action: string;
}

/**
 * Pure: the CURRENT-TRUTH binding reference (amendments 1–13). Authored from
 * `input/keyboard.ts` — the one keydown chokepoint — never copied from
 * EXPERIENCE/DESIGN — those tables predate the 2026-07-21/24 re-rulings
 * (Q-on-gun, the F slot, SPACE-hold refit). This is a REFERENCE, not a
 * remapper: key remapping is post-beta.
 *
 * F IS NOW A REAL BINDING (Story 4.5, amendment 56 — UX open question #20
 * closed). It sat reserved-and-unbound here since Epic 2 and was deliberately
 * ABSENT from this table for exactly as long; that omission is wrong by design
 * as of the foghorn, and the row below replaces it. Listed right after the slot
 * keys because it is a conning-position action, not chrome.
 *
 * Story 7-3 (Eric ruling 2026-08-19): this list disagreed with keyboard.ts on
 * three points and is now reconciled — W/S and A/D alias the arrows
 * (`THROTTLE_AHEAD`/`THROTTLE_ASTERN` in telegraph.ts, `LEFT`/`RIGHT` in
 * keyboard.ts), the refit digit row silently stopped at 4 and omitted 5
 * (DAMAGE CONTROL, the always-available heal rail — `REFIT_DIGIT_CODES`,
 * which also aliases the numpad), and the gun (slot 0) had no row at all even
 * though it is the permanently-selected default reachable ONLY by clicking
 * its hotbar tile — Q/E/R are the OTHER slots, never the gun's key. `P`
 * (netcode debug) is deliberately still absent; it stays out of this surface.
 */
export function bindingRows(): BindingRow[] {
  return [
    { keys: 'W / S (+ ARROWS)', action: 'ENGINE TELEGRAPH — ONE DETENT PER TAP' },
    { keys: 'A / D (+ ARROWS)', action: 'RUDDER — HELD' },
    { keys: '(NONE)', action: 'GUN — ALWAYS-SELECTED DEFAULT; CLICK ITS HOTBAR TILE TO RESELECT' },
    { keys: 'Q / E', action: 'CLASS SPECIAL SLOTS' },
    { keys: 'R', action: 'PICKUP SLOT — INERT WHILE EMPTY' },
    { keys: 'F', action: 'FOGHORN — SOUND OFF (BEARING ONLY)' },
    { keys: 'CLICK', action: 'FIRE THE SELECTED WEAPON / PRIME A SKILLSHOT' },
    { keys: 'TAB', action: 'REFIT WINDOW — TOGGLE' },
    { keys: '1 – 5 (+ NUMPAD)', action: 'PICK A REFIT CARD — 5 IS DAMAGE CONTROL (WHILE THE WINDOW IS OPEN)' },
    { keys: 'ESC', action: 'CLOSE THE TOPMOST SURFACE / OPEN SETTINGS' },
    { keys: 'Z / X', action: 'CAMERA ZOOM OUT / IN — WHEEL ZOOMS SMOOTHLY' },
    { keys: 'M', action: 'MUTE' },
    { keys: 'ENTER', action: 'CONFIRM THE TOPMOST SURFACE' },
  ];
}

/** Which surfaces are currently up, topmost-first in the ratified order. */
export interface OpenSurfaces {
  /** The elimination / game-end results modal. */
  results: boolean;
  /** The TAB refit modal. */
  refit: boolean;
  /** This overlay. */
  settings: boolean;
}

/** What ESC does, given the open surfaces. */
export type EscapeAction =
  | 'closeResults'
  | 'closeRefit'
  | 'closeSettings'
  | 'openSettings'
  | 'reopenResults';

/**
 * Pure: THE uniform ESC law (amendment 23). ESC closes the TOPMOST open surface
 * — results modal, then refit modal, then this overlay — and only opens/toggles
 * settings when nothing is open at all. Consequences of note, all encoded here:
 *   • settings NEVER opens over another surface (no stacking, ever);
 *   • ESC never returns to port — closing the results modal equals pressing
 *     SPECTATE, and leaving is RETURN TO PORT or ABANDON MATCH;
 *   • from spectate (nothing open) ESC REOPENS THE SCORE SCREEN — see below.
 *
 * ERIC RULING 2026-08-19: *"when you have been eliminated and see the score
 * screen, if I click spectate, I would like the score screen to open back up,
 * rather than the regular menu."* SPECTATE only ever HID the score screen (its
 * handler was a literal no-op), and nothing in the client could bring it back —
 * ESC from spectate opened SETTINGS, which is the "regular menu" he means, the
 * home gear being pre-join only. ESC is now a TOGGLE while spectating: score
 * screen ⇄ the water.
 *
 * THE CONSEQUENCE, TAKEN DELIBERATELY: settings is no longer reachable while
 * spectating, because ESC was its only in-match opener. That does NOT trap
 * anyone — the score screen's own RETURN TO PORT is a better-signposted exit
 * than settings' ABANDON MATCH ever was, and it is the button the player just
 * came from. What is genuinely lost is mid-spectate access to volume/motion
 * settings; if that matters it wants its own key, not this one back.
 */
export function escapeAction(open: OpenSurfaces, spectating = false): EscapeAction {
  if (open.results) return 'closeResults';
  if (open.refit) return 'closeRefit';
  if (open.settings) return 'closeSettings';
  return spectating ? 'reopenResults' : 'openSettings';
}

/**
 * Pure: may a surface OPEN right now? Nothing stacks — the refit modal cannot
 * open over settings and settings cannot open over the refit modal or the
 * results screen (the I/O matrix's "Never stack" row, both directions).
 */
export function canOpenSurface(surface: keyof OpenSurfaces, open: OpenSurfaces): boolean {
  return !Object.entries(open).some(([k, v]) => v && k !== surface);
}

/**
 * Pure: may ABANDON MATCH be offered right now? Amendment 19 renders it "only
 * while in a live match", and the previous predicate (`joined && !returning`)
 * was true in states where the button is meaningless or actively wrong:
 *   • `finished` / matchOver — the match is over and the results modal's RETURN
 *     TO PORT is the one way home; a second, `danger`-styled leave button next
 *     to it just invites a mis-click into an identical outcome;
 *   • `returning` — the leave is already in flight.
 *
 * `waiting`, `gathering`, and `countdown` DO keep it, deliberately: the
 * weapons-safe ready room is where a solo captain can sit indefinitely (the
 * countdown needs two humans, and the gathering join window is still pre-match),
 * and the spec's leaving law is "the modal's RETURN TO PORT or
 * settings' ABANDON MATCH — never ESC, never a page refresh". Hiding it there
 * would leave a ready-room captain with no sanctioned way back to port at all.
 */
export function canAbandon(phase: string, matchOver: boolean, returning: boolean): boolean {
  return !returning && !matchOver && phase !== 'finished';
}

/** The two confirm-gated danger actions (amendment 19). */
export type DangerAction = 'abandon' | 'reset';

/**
 * Pure: the danger-row confirm machine. A first press ARMS the action (the
 * button relabels to its confirm copy); a second press on the SAME action fires
 * it; pressing the other danger action re-arms that one instead. No stacked
 * modal — the confirmation happens inside the overlay, on the button itself.
 */
export function nextArmed(armed: DangerAction | null, pressed: DangerAction): { armed: DangerAction | null; fire: boolean } {
  return armed === pressed ? { armed: null, fire: true } : { armed: pressed, fire: false };
}

/** Pure: a danger button's label for the current armed state. */
export function dangerLabel(action: DangerAction, armed: DangerAction | null): string {
  const base = action === 'abandon' ? 'ABANDON MATCH' : 'RESET SETTINGS';
  return armed === action ? `${base} — CONFIRM?` : base;
}

// --- DOM shell ----------------------------------------------------------------

const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:none', // flipped to 'flex' by open()
  'align-items:center',
  'justify-content:center',
  'padding:24px',
  // No fullscreen dim — DESIGN dims behind the results screen only.
  'background:transparent',
  `z-index:${S.zIndex}`,
].join(';');

const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  'gap:20px',
  `width:${S.panelWidth}px`,
  'max-width:100%',
  'max-height:100%',
  // AMENDMENT 47: without border-box the 28px padding + 1px border sit OUTSIDE
  // the 100% max-height, so the overlay clipped 5px off the panel's top and
  // bottom chrome at every viewport. Same one-word defect as results/class bay.
  'box-sizing:border-box',
  'overflow-y:auto',
  `padding:${S.panelPad}px`,
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-hairline)',
  `border-radius:${S.panelRadius}px`,
  'font-family:var(--hc-font-mono)',
  'color:var(--hc-text-primary)',
].join(';');

const SECTION_CSS = 'display:flex;flex-direction:column;gap:10px';
const ROW_CSS = 'display:flex;align-items:center;gap:14px;flex-wrap:wrap';
const HEADING_CSS = `${registerCss('label')};color:var(--hc-phosphor)`;
const LABEL_CSS = `${registerCss('hudMicro')};color:var(--hc-text-primary);min-width:170px`;
const NOTE_CSS = `${registerCss('hudMicro')};color:var(--hc-phosphor);opacity:0.75`;
const VALUE_CSS = 'font:500 17px var(--hc-font-mono);color:var(--hc-phosphor);min-width:56px;text-align:right';

const CHOICE_CSS = [
  'padding:7px 16px',
  'background:var(--hc-panel-deep)',
  'border:1px solid var(--hc-hairline)',
  'color:var(--hc-text-primary)',
  'font:500 17px var(--hc-font-mono)',
  'letter-spacing:0.08em',
  'border-radius:4px',
  'cursor:pointer',
].join(';');

const DANGER_CSS = [
  'padding:9px 20px',
  'background:var(--hc-panel-deep)',
  'border:1px solid var(--hc-danger)',
  'color:var(--hc-denied)',
  'font:600 17px var(--hc-font-mono)',
  'letter-spacing:0.14em',
  'border-radius:4px',
  'cursor:pointer',
].join(';');

/** A DOM button that never keeps focus (a focused BUTTON would trip the
 *  keyboard chokepoint's text-entry guard and swallow the ESC that closes us). */
function makeButton(css: string, text: string, onClick: () => void, id?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (id) b.id = id;
  b.textContent = text;
  b.style.cssText = css;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    b.blur();
    onClick();
  });
  return b;
}

function makeHeading(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = HEADING_CSS;
  return el;
}

function makeSection(title: string, ...children: HTMLElement[]): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = SECTION_CSS;
  el.append(makeHeading(title), ...children);
  return el;
}

function makeLabel(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  el.style.cssText = LABEL_CSS;
  return el;
}

/** A segmented choice row: label + one button per option, the selected one
 *  amber-outlined (a disabled option renders inert with its note beside it). */
function makeChoiceRow<T>(
  label: string,
  options: readonly OptionModel<T>[],
  selected: T,
  onPick: (v: T) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = ROW_CSS;
  row.append(makeLabel(label));
  for (const opt of options) {
    const b = makeButton(CHOICE_CSS, opt.label, () => onPick(opt.value));
    b.dataset.value = String(opt.value);
    if (opt.value === selected) {
      b.style.borderColor = 'var(--hc-amber)';
      b.style.color = 'var(--hc-amber)';
    }
    if (!opt.enabled) {
      b.disabled = true;
      b.style.opacity = '0.4';
      b.style.cursor = 'default';
    }
    row.appendChild(b);
    if (opt.note !== '') {
      const note = document.createElement('span');
      note.textContent = opt.note;
      note.style.cssText = NOTE_CSS;
      row.appendChild(note);
    }
  }
  return row;
}

/**
 * A 0–100 slider row with a live numeric readout.
 *
 * The row updates ITSELF on `input` — readout text only — and the caller writes
 * through to the store WITHOUT repainting the panel. Rebuilding the panel on
 * every input event (the old behavior) destroyed the very `<input>` the pointer
 * was dragging, so a drag moved the value one step and then died; the same
 * rebuild stole focus back from a keyboard user between arrow presses.
 *
 * `pointerup` blurs the slider — the same focus hygiene the buttons have — so a
 * mouse user doesn't leave a focused control behind. Keyboard focus is
 * deliberately LEFT alone (arrows must keep nudging); the chokepoint's
 * range-input fallthrough is what keeps ESC alive in that state.
 */
function makeSliderRow(label: string, value: number, onInput: (v: number) => void): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = ROW_CSS;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(S.volumeMax);
  input.step = '1';
  input.value = String(value);
  input.style.cssText = 'flex:1 1 220px;accent-color:var(--hc-phosphor)';
  const readout = document.createElement('span');
  readout.textContent = String(value);
  readout.style.cssText = VALUE_CSS;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    readout.textContent = String(v);
    onInput(v);
  });
  input.addEventListener('pointerup', () => input.blur());
  row.append(makeLabel(label), input, readout);
  return row;
}

/** An on/off row (the same segmented control, over booleans). */
function makeToggleRow(label: string, value: boolean, onPick: (v: boolean) => void): HTMLElement {
  const options: OptionModel<boolean>[] = [
    { value: false, label: 'OFF', enabled: true, note: '' },
    { value: true, label: 'ON', enabled: true, note: '' },
  ];
  return makeChoiceRow(label, options, value, onPick);
}

function makeBindings(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  for (const r of bindingRows()) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:16px;align-items:baseline';
    const keys = document.createElement('span');
    keys.textContent = r.keys;
    keys.style.cssText = 'font:600 17px var(--hc-font-mono);color:var(--hc-phosphor);min-width:96px';
    const action = document.createElement('span');
    action.textContent = r.action;
    action.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-primary)`;
    row.append(keys, action);
    wrap.appendChild(row);
  }
  return wrap;
}

/** Everything the overlay needs from the app (all late-bound thunks). */
export interface SettingsOverlayDeps {
  store: SettingsStore;
  /** True while the player is in a LIVE match — gates ABANDON MATCH. */
  inMatch: () => boolean;
  /** Confirmed ABANDON MATCH: leave the room cleanly for the home port. */
  onAbandon: () => void;
  /** Current viewport width (drives the 125% UI-scale gate). */
  viewportWidth: () => number;
  /**
   * Fired on EVERY open/close, however it was triggered (gear, ESC, the CLOSE
   * button, abandon). The home chrome subscribes so it can yield while the
   * overlay is up — the ratified z register puts this overlay UNDER the home
   * (1050 < 1100), so without the yield the home swallows every click.
   */
  onVisibility?: (visible: boolean) => void;
  /**
   * THE ANALYTICS CONSENT ROW (Story 7.2, Eric ruling 2026-08-18 at the review
   * gate). GDPR Art. 7(3) requires withdrawing consent to be as easy as giving
   * it, and the shipped answer was "clear site data" — which also destroys the
   * callsign, class, colour and every accessibility setting, i.e. strictly
   * harder than the single ACCEPT press that granted it.
   *
   * SINCE STORY 7.4 IT IS THE ONLY IN-PRODUCT ANALYTICS DOOR. The consent card
   * is deleted and Google's own CMP owns the EEA/UK/CH dialog, which asks about
   * ADS as well as analytics; this row is the local analytics override Eric
   * specifically kept, and it has no authority over the three ad signals.
   *
   * CALLBACKS, NOT AN IMPORT: this overlay stays renderable with no analytics
   * layer at all, and `analytics/ga.ts` remains the only module in the client
   * that knows GA4 exists. Omitted ⇒ no row, so every existing construction site
   * and test is unaffected.
   */
  consent?: {
    /** `true` granted, `false` denied, `null` not yet answered. */
    granted: () => boolean | null;
    set: (granted: boolean) => void;
  };
}

/**
 * The settings overlay. `visible` is the surface state the uniform ESC law and
 * the sim-suppression predicate both read; open/close/toggle are the only ways
 * it changes. Content is rebuilt on every open (and on every settings change
 * while open) so it always reflects the live store — the panel is small and this
 * is chrome, not a hot path.
 */
export class SettingsOverlay {
  private overlay: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private shown = false;
  private armed: DangerAction | null = null;
  private unsubscribe: (() => void) | null = null;
  /**
   * True while THIS overlay is the one writing to the store. The store's own
   * subscription repaints the panel so an external writer (the M key) is
   * reflected live — but a repaint triggered by our own slider drag would
   * destroy the `<input>` under the pointer, so our writes suppress it and the
   * writer decides whether a repaint is warranted.
   */
  private writing = false;

  constructor(private readonly deps: SettingsOverlayDeps) {}

  get visible(): boolean {
    return this.shown;
  }

  open(): void {
    if (this.shown) return;
    this.shown = true;
    this.armed = null;
    this.render();
    this.ensureOverlay().style.display = 'flex';
    // Live-refresh while open: an M-key mute (or any other writer) must be
    // reflected in the overlay's own controls — one persisted value, one truth.
    this.unsubscribe ??= this.deps.store.subscribe(() => {
      if (this.shown && !this.writing) this.render();
    });
    // The 125% tier's gate is a VIEWPORT predicate: a window resized while the
    // overlay is open must re-evaluate it, or the row keeps advertising a stale
    // enabled/disabled state and note.
    window.addEventListener('resize', this.onResize);
    this.deps.onVisibility?.(true);
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.armed = null;
    if (this.overlay) this.overlay.style.display = 'none';
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener('resize', this.onResize);
    this.deps.onVisibility?.(false);
  }

  /** Re-evaluate the viewport-dependent rows (the 125% gate) on a live resize. */
  private readonly onResize = (): void => {
    if (this.shown) this.render();
  };

  /**
   * ENTER while this overlay is the topmost surface: fire the ARMED danger
   * action, if any. Amendment 19 rules the confirm as "second click OR Enter",
   * and the danger buttons never keep focus, so the key has to route through the
   * chokepoint's confirm hook rather than a native button activation. Returns
   * true when it consumed the key.
   */
  confirmArmed(): boolean {
    if (this.armed === null) return false;
    this.press(this.armed); // armed === pressed ⇒ nextArmed fires it
    return true;
  }

  toggle(): void {
    if (this.shown) this.close();
    else this.open();
  }

  /** Teardown (return to port / test cleanup). */
  destroy(): void {
    this.close();
    this.overlay?.remove();
    this.overlay = null;
    this.panel = null;
  }

  private ensureOverlay(): HTMLDivElement {
    if (this.overlay) return this.overlay;
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = OVERLAY_CSS;
    const panel = document.createElement('div');
    panel.style.cssText = PANEL_CSS;
    applyViewportCap(panel); // amendment 47 — border-box + a real scroll surface (ui/fit.ts)
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.panel = panel;
    return overlay;
  }

  private render(): void {
    this.ensureOverlay();
    const panel = this.panel!;
    const s = this.deps.store.current;
    panel.replaceChildren(
      this.makeHeader(),
      makeSection('MOTION', makeChoiceRow('SCREEN MOTION', MOTION_OPTIONS, s.motion, (v) => this.set({ motion: v }))),
      makeSection('DISPLAY', this.makeScaleRow(s), makeToggleRow('COLORBLIND ASSIST', s.colorblind, (v) => this.set({ colorblind: v }))),
      makeSection(
        'AUDIO',
        // Sliders write through WITHOUT a repaint (they own their readout) —
        // rebuilding mid-drag would destroy the input under the pointer.
        makeSliderRow('MASTER VOLUME', s.masterVolume, (v) => this.set({ masterVolume: v }, false)),
        makeSliderRow('EFFECTS VOLUME', s.effectsVolume, (v) => this.set({ effectsVolume: v }, false)),
        makeToggleRow('MONO AUDIO', s.monoAudio, (v) => this.set({ monoAudio: v })),
        makeToggleRow('MUTE (M)', s.muted, (v) => this.set({ muted: v })),
      ),
      ...this.makePrivacySection(),
      makeSection('CONTROLS — REFERENCE ONLY', makeBindings()),
      this.makeDangerRow(),
    );
  }

  /**
   * The PRIVACY section, or nothing when no consent wiring was supplied.
   *
   * AN UNANSWERED PLAYER NOW SHOWS AS **ON**, WHICH IS THE INVERSE OF WHAT 7.2
   * SHIPPED, AND DELIBERATELY SO (Story 7.4, Eric rulings 2026-08-19). 7.2 chose
   * OFF because Consent Mode BASIC meant nothing was measured until an explicit
   * grant, so OFF was the literal truth. That premise is gone: 7.4 deleted the
   * consent card, adopted Google's own CMP, and moved the tag to ADVANCED with a
   * GRANTED global default — so for a player with no local override analytics
   * IS running, and rendering OFF would be a lie about the shipped behaviour.
   *
   * `!== false` rather than `=== true`: only an explicit local denial reads as
   * off. `null` (no override) sits with granted, which is where the defaults put
   * the player.
   */
  private makePrivacySection(): HTMLElement[] {
    const c = this.deps.consent;
    if (c === undefined) return [];
    return [
      makeSection(
        'PRIVACY',
        makeToggleRow('ANALYTICS', c.granted() !== false, (v) => {
          c.set(v);
          this.render();
        }),
      ),
    ];
  }

  private makeHeader(): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px';
    const title = document.createElement('div');
    title.textContent = 'SETTINGS';
    title.style.cssText = 'font:700 26px var(--hc-font-display);letter-spacing:0.14em;color:var(--hc-text-primary)';
    row.append(title, makeButton(CHOICE_CSS, 'CLOSE (ESC)', () => this.close(), CLOSE_BUTTON_ID));
    return row;
  }

  private makeScaleRow(s: Settings): HTMLElement {
    return makeChoiceRow('UI SCALE', scaleOptions(this.deps.viewportWidth()), s.uiScale, (v) => this.set({ uiScale: v }));
  }

  private makeDangerRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `${ROW_CSS};justify-content:flex-end;border-top:1px solid var(--hc-hairline);padding-top:16px`;
    if (this.deps.inMatch()) {
      row.appendChild(
        makeButton(DANGER_CSS, dangerLabel('abandon', this.armed), () => this.press('abandon'), ABANDON_BUTTON_ID),
      );
    }
    row.appendChild(makeButton(DANGER_CSS, dangerLabel('reset', this.armed), () => this.press('reset'), RESET_BUTTON_ID));
    return row;
  }

  /** A danger button was pressed: arm it, or fire it if it was already armed. */
  private press(action: DangerAction): void {
    const next = nextArmed(this.armed, action);
    this.armed = next.armed;
    if (!next.fire) {
      this.render();
      return;
    }
    if (action === 'reset') {
      this.writing = true; // own the repaint (the subscription would double it)
      try {
        this.deps.store.reset();
      } finally {
        this.writing = false;
      }
      this.render(); // reset must repaint even if nothing actually changed
      return;
    }
    this.close();
    this.deps.onAbandon();
  }

  /**
   * A control changed: write through the store (persisted + live) and repaint so
   * the segmented selection follows. Any armed danger action disarms — the
   * player's attention moved — and that alone forces a repaint even for a
   * `repaint: false` writer, since the confirm label must stop lying.
   *
   * `repaint = false` is the SLIDER path: it has already updated its own
   * readout, nothing else on the panel depends on a volume, and rebuilding would
   * destroy the control being dragged (or steal focus between arrow presses).
   */
  private set(patch: Partial<Settings>, repaint = true): void {
    const wasArmed = this.armed !== null;
    this.armed = null;
    this.writing = true;
    try {
      this.deps.store.set(patch);
    } finally {
      this.writing = false;
    }
    if (repaint || wasArmed) this.render();
  }
}
