// Pre-join HOME chrome (Story 1.14) — replaces the prototype menu. Plain DOM
// over the live ambient CIC Pixi scene (render/ambient.ts), styled per DESIGN.md
// and the ratified mock (home-class-picker-1.html): wordmark, callsign, a
// slim current-class Class Chip that OPENS the class-select layer
// (ui/classSelect.ts), one dominant amber OUTLINE+GLOW PLAY button, an inert
// How-to-Play link + server status line, and the settings gear — which as of
// Story 2.3 opens the REAL settings overlay (ui/settings.ts), as does ESC with
// the class bay closed. The overlay is TRANSPARENT so the ambient scene
// breathes behind it; the ambient's scrim keeps this text legible.
//
// The color picker lives ONLY in the class bay's footer now (Eric ruling — the
// duplicate home hoist is retired). The shared ColorHoist still lives here, as
// the state the home's PERSONAL TINT follows: the chip's border/glow/name and
// the callsign field's border + focus ring all take the player's Regatta hue
// (via `repaintAccent`, resubscribed on every hoist change so a pick in the bay
// repaints the port behind it). Amber stays the ACTION register (PLAY only) and
// phosphor stays the system/status register — neither is ever personalized.
//
// First-run (no stored class): the chip shows a SELECT CLASS prompt and PLAY/
// Enter OPENS the layer instead of connecting — no default class is ever pushed.
// A returning player (stored class) deploys straight from PLAY. The callsign
// persists in localStorage; sanitizeName/load-save helpers are pure + tested.
// All colors/typography via CLIENT_CONFIG tokens (var(--hc-*) + registerCss;
// cssHex for the personal hues, which have no --hc-* var).

import { sanitizeClassId, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { applySafeCenterScroll } from './fit.js';
import { textFieldElement } from '../input/keyboard.js';
import { cssRgba } from '../util/color.js';
import { registerCss } from './theme.js';
import { silhouetteSvg } from '../util/silhouetteSvg.js';
import {
  ColorHoist,
  openClassSelect,
  CLASS_DISPLAY_NAMES,
  type ClassSelectHandle,
} from './classSelect.js';
// Entry cap = the shared display cap (Story 1.13). Re-exported so existing
// consumers/tests keep importing NAME_MAX from the home module.
import { NAME_MAX } from '../util/text.js';

export { NAME_MAX };

const HOME_ID = 'main-menu'; // kept id so index.html / any external hook is stable
const NAME_KEY = 'hullcracker.name';
const CLASS_KEY = 'hullcracker.class';

const NOTE_HOWTO = 'FIELD MANUAL ARRIVES IN A LATER REFIT';
const NOTE_CONNECTING = 'CONNECTING…'; // re-asserted when PLAY is pressed mid-connect

// --- pure name / class persistence (tested) ----------------------------------

/**
 * Unicode category C — control / format (zero-width joiners, bidi overrides) /
 * surrogate / private-use / unassigned. Stripped so what you TYPE is what the
 * server keeps: the server's `sanitizeName` strips exactly this set, and a
 * client that let them through would show the player a callsign (blank, or
 * reversed by a bidi override) that no one else ever sees.
 */
const CONTROL_OR_FORMAT = /\p{C}/gu;

/** Strip control/format code points, then trim + cap a callsign to NAME_MAX
 *  CODE POINTS ('' = server assigns). Mirrors server roomOptions.sanitizeName. */
export function sanitizeName(raw: string): string {
  return [...raw.replace(CONTROL_OR_FORMAT, '').trim()].slice(0, NAME_MAX).join('');
}

export function loadSavedName(): string {
  try {
    return sanitizeName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage unavailable — the name just won't persist
  }
}

/**
 * The saved ship class, or NULL when nothing is stored (the first-run signal —
 * no default is ever pushed). A stored-but-legacy id ('cruiser') is a RETURNING
 * player and sanitizes to a real class, never null.
 */
export function loadSavedClassOrNull(): ShipClassId | null {
  try {
    const raw = localStorage.getItem(CLASS_KEY);
    return raw === null ? null : sanitizeClassId(raw);
  } catch {
    return null;
  }
}

/** Defaulting variant (torpedoBoat when unset/garbage) for in-game consumers. */
export function loadSavedClass(): ShipClassId {
  return loadSavedClassOrNull() ?? 'torpedoBoat';
}

/** True when no class is stored yet (drives first-run PLAY→layer routing). */
export function isFirstRun(): boolean {
  return loadSavedClassOrNull() === null;
}

function saveClass(cls: ShipClassId): void {
  try {
    localStorage.setItem(CLASS_KEY, cls);
  } catch {
    // storage unavailable — the class just won't persist
  }
}

// --- pure copy + status reducers (tested) ------------------------------------

/** PLAY sub-line copy: prompt when no class chosen, else DEPLOY AS <CLASS> · SOLO. */
export function deploySubline(cls: ShipClassId | null): string {
  return cls === null ? 'SELECT A CLASS TO DEPLOY' : `DEPLOY AS ${CLASS_DISPLAY_NAMES[cls]} · SOLO`;
}

export type ProbeState = 'probing' | 'ready' | 'unreachable';
export type StatusTone = 'info' | 'denied' | 'tertiary';
export interface StatusLine {
  text: string;
  tone: StatusTone;
}

/** Server status line copy + tone from the probe outcome (Eric ruling — client
 *  probe, no server endpoint). READY/CHECKING are quiet; UNREACHABLE is denied. */
export function serverStatusLine(state: ProbeState): StatusLine {
  if (state === 'ready') return { text: 'SERVER: READY', tone: 'tertiary' };
  if (state === 'unreachable') return { text: 'SERVER: UNREACHABLE', tone: 'denied' };
  return { text: 'SERVER: CHECKING…', tone: 'tertiary' };
}

function toneColor(tone: StatusTone): string {
  if (tone === 'info') return 'var(--hc-info)';
  if (tone === 'denied') return 'var(--hc-denied)';
  // Story 2.3 (amendment 17): the quiet tone is a SYSTEM line, not decoration —
  // it reads phosphor now, never the retired grey.
  return 'var(--hc-phosphor)';
}

// --- handle ------------------------------------------------------------------

export interface HomeHandle {
  /** Generic status-line setter (connect flow: CONNECTING / failure copy). */
  setStatus(text: string, tone?: StatusTone): void;
  /** Server-probe status line (probing → ready / unreachable). */
  setServerProbe(state: ProbeState): void;
  /** Disable/enable PLAY while a join is in flight. */
  setBusy(busy: boolean): void;
  /** YIELD the whole home surface while the settings overlay is open (see
   *  `homeYieldStyle`). Idempotent; restored with `false`. */
  setYielded(yielded: boolean): void;
  hide(): void;
}

/** The two style properties the home root takes to yield / come back. */
export interface YieldStyle {
  visibility: 'hidden' | 'visible';
  pointerEvents: 'none' | 'auto';
}

/**
 * Pure: how the HOME chrome must behave while the settings overlay is open.
 *
 * The z register is RATIFIED — settings sits at 1050, between the refit modal
 * (1000) and this home (1100) — so the overlay legitimately renders UNDER a
 * fullscreen home that hit-tests every pixel. Re-cutting the register to fix
 * that would break the ruled ordering; instead the home YIELDS: it stops
 * painting and stops hit-testing for as long as settings is up, and comes back
 * unchanged when it closes.
 *
 * Reverse stacking falls out of the same rule rather than needing its own
 * guard: a yielded home cannot be clicked, so PLAY and the class chip are both
 * unreachable while the overlay is open — which is exactly the "never stack, in
 * either direction" law the in-match surfaces obey.
 */
export function homeYieldStyle(settingsOpen: boolean): YieldStyle {
  return settingsOpen
    ? { visibility: 'hidden', pointerEvents: 'none' }
    : { visibility: 'visible', pointerEvents: 'auto' };
}

// --- DOM builders ------------------------------------------------------------

// AMENDMENT 47 (the container-fit law). The port stack is a rigid column of hard
// px margins — wordmark, callsign field, class chip, PLAY, the HOW TO PLAY /
// SERVER row — measuring ~668px tall, and it does NOT ride the HUD's ui-scale.
// Below a 668px-tall viewport it therefore overflowed `inset:0` in BOTH
// directions: the wordmark clipped off the top and the HOW TO PLAY / SERVER row
// fell past the bottom edge, unreachable (index.html sets `body{overflow:hidden}`
// so there is no page scroll to rescue it).
//
// The guard is applied by applyOverflowGuard() below, deliberately as SEPARATE
// property assignments rather than inside this cssText blob (the CSSOM-blob
// hazard the refit band documents: one declaration the test environment's parser
// dislikes silently voids the WHOLE blob, and this blob is already one of those
// — so anything load-bearing has to be assigned on its own).
const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'gap:0',
  'background:transparent', // the ambient CIC scene breathes behind
  'z-index:1100',
].join(';');

function makeWordmark(version: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
  const mark = document.createElement('div');
  mark.style.cssText =
    'font:700 clamp(48px, 9vw, 104px) var(--hc-font-display);letter-spacing:0.14em;color:var(--hc-text-primary);' +
    'line-height:1;text-align:center';
  mark.append(document.createTextNode('HULLCRACKER'));
  const io = document.createElement('span');
  io.textContent = '.IO';
  io.style.color = 'var(--hc-phosphor-bright)';
  mark.appendChild(io);
  const tagline = document.createElement('div');
  tagline.textContent = 'LAST HULL FLOATING WINS';
  tagline.style.cssText = `${registerCss('label')};color:var(--hc-phosphor);letter-spacing:0.44em;margin-top:8px`;
  const ver = document.createElement('div');
  ver.textContent = `RT PROTOTYPE // v${version}`;
  ver.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.2em`;
  wrap.append(mark, tagline, ver);
  return wrap;
}

function makeNameField(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.placeholder = 'CALLSIGN';
  input.value = loadSavedName();
  input.autocomplete = 'off';
  input.spellcheck = false;
  // The border color is a PLACEHOLDER: `paintCallsign` overwrites it (and the
  // focus glow) with the player's personal hue on mount and on every hoist pick.
  input.style.cssText =
    'width:340px;max-width:calc(100vw - 48px);height:52px;background:var(--hc-panel-deep);' +
    'border:1px solid var(--hc-hairline);border-radius:6px;padding:0 18px;color:var(--hc-text-primary);' +
    'font:500 20px var(--hc-font-mono);letter-spacing:0.12em;text-transform:uppercase;outline:none';
  return input;
}

function makeCallsignRow(input: HTMLInputElement): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:14px;margin-top:44px';
  const label = document.createElement('label');
  label.textContent = 'CALLSIGN';
  label.style.cssText = `${registerCss('label')};color:var(--hc-text-primary);letter-spacing:0.22em`;
  row.append(label, input);
  return row;
}

interface ChipEls {
  root: HTMLElement;
  sil: HTMLElement;
  role: HTMLElement;
  name: HTMLElement;
}

/**
 * The Class Chip — SLIM (Eric ruling): silhouette, role tag, class name and the
 * CHANGE CLASS affordance, nothing else. The loadout sub-line is gone (it was
 * the widest thing in the chip and the class bay already sells the loadout), so
 * the box hugs what's left: tighter gaps/padding and a `max-width` + border-box
 * so it can never outgrow the 1366×768 floor viewport (amendment 47).
 */
function makeChip(onOpen: () => void): ChipEls {
  const root = document.createElement('div');
  root.style.cssText =
    'display:flex;align-items:center;gap:14px;background:var(--hc-panel-deep);border:1px solid var(--hc-hairline);' +
    'border-radius:8px;padding:10px 16px 10px 12px;cursor:pointer;margin-top:22px;' +
    'max-width:calc(100vw - 48px);box-sizing:border-box';
  root.setAttribute('role', 'button');
  root.setAttribute('title', 'Open the class-select layer');
  root.tabIndex = 0;
  const sil = document.createElement('span');
  sil.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;min-height:44px';
  const meta = document.createElement('span');
  meta.style.cssText = 'display:flex;flex-direction:column;min-width:0';
  const role = document.createElement('span');
  role.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.24em`;
  const name = document.createElement('div');
  name.style.cssText = 'font:700 24px var(--hc-font-display);letter-spacing:0.06em;white-space:nowrap';
  meta.append(role, name);
  const change = document.createElement('span');
  change.innerHTML = '<b style="color:var(--hc-phosphor);font-weight:600">▸</b>&nbsp; CHANGE CLASS';
  change.style.cssText =
    `${registerCss('hudMicro')};margin-left:12px;color:var(--hc-phosphor);letter-spacing:0.18em;` +
    'border-left:1px solid var(--hc-hairline);padding-left:14px;white-space:nowrap';
  root.append(sil, meta, change);
  root.addEventListener('click', onOpen);
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation(); // don't let the Enter reach the layer's window listener (insta-pick)
    onOpen();
  });
  return { root, sil, role, name };
}

function makePlayButton(onPlay: () => void): { root: HTMLButtonElement; sub: HTMLElement } {
  const root = document.createElement('button');
  root.type = 'button';
  root.style.cssText =
    'margin-top:26px;width:480px;max-width:calc(100vw - 48px);height:86px;background:var(--hc-panel-deep);' +
    'border:1px solid var(--hc-amber);border-radius:8px;display:flex;flex-direction:column;align-items:center;' +
    `justify-content:center;cursor:pointer;box-shadow:0 0 44px ${cssRgba(CLIENT_CONFIG.colors.amber, 0.28)}`;
  const big = document.createElement('span');
  big.textContent = 'PLAY';
  big.style.cssText = 'font:800 34px var(--hc-font-mono);letter-spacing:0.34em;text-indent:0.34em;color:var(--hc-amber)';
  const sub = document.createElement('span');
  sub.style.cssText = `${registerCss('hudMicro')};color:var(--hc-amber);letter-spacing:0.2em;margin-top:3px;opacity:0.72`;
  root.append(big, sub);
  root.addEventListener('click', onPlay);
  return { root, sub };
}

function makeUnderplay(statusEl: HTMLElement, onHowTo: () => void): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:26px;margin-top:16px';
  const howto = document.createElement('span');
  howto.textContent = 'HOW TO PLAY';
  howto.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.14em;text-decoration:underline;` +
    'text-underline-offset:4px;cursor:pointer';
  howto.addEventListener('click', onHowTo);
  row.append(howto, statusEl);
  return row;
}

function makeStatusEl(): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = `${registerCss('hudMicro')};letter-spacing:0.14em;color:var(--hc-phosphor)`;
  return el;
}

function makeGear(onClick: () => void): HTMLElement {
  const gear = document.createElement('div');
  gear.textContent = '⚙';
  gear.setAttribute('role', 'button');
  gear.setAttribute('title', 'Settings');
  gear.tabIndex = 0;
  gear.style.cssText =
    'position:absolute;top:22px;right:26px;font-size:32px;line-height:1;color:var(--hc-phosphor);' +
    'cursor:pointer';
  gear.addEventListener('click', onClick);
  gear.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onClick();
  });
  return gear;
}

// --- home controller ---------------------------------------------------------

interface Home {
  overlay: HTMLElement;
  input: HTMLInputElement;
  hoist: ColorHoist;
  statusEl: HTMLElement;
  chip: ChipEls;
  playSub: HTMLElement;
  playBtn: HTMLButtonElement;
  onDeploy: (name: string, cls: ShipClassId) => void;
  /** Open/toggle the settings overlay (gear + home ESC — Story 2.3). */
  onSettings: () => void;
  currentClass: ShipClassId | null;
  layerOpen: boolean;
  busy: boolean;
  /** Drives the callsign field's personal-color focus ring (see paintCallsign). */
  inputFocused: boolean;
  /** The live class-select layer, if open — so hide() can tear it down instead of
   *  orphaning its window listener (which could write hullcracker.class in-game). */
  layer: ClassSelectHandle | null;
  /** True once the connect flow has written the status line (CONNECTING / error):
   *  a late server-probe resolution must NOT overwrite it (status state machine). */
  statusLocked: boolean;
  /** Teardown for subscriptions/listeners created at mount (run by hide()). */
  disposers: Array<() => void>;
}

function paintStatus(h: Home, text: string, tone: StatusTone): void {
  h.statusEl.textContent = text;
  h.statusEl.style.color = toneColor(tone);
}

/**
 * Rebuild the chip contents for the current class + personal accent. The border
 * and silhouette take the RAW hue (graphic marks); the class name is TEXT, so it
 * takes the WCAG-lifted `accentText` (textSafe) instead. No loadout sub-line —
 * the chip is slim now (the class bay carries the loadout).
 */
function repaintChip(h: Home): void {
  const accent = h.hoist.accent;
  h.chip.root.style.borderColor = accent;
  h.chip.root.style.boxShadow = `0 0 22px ${cssRgba(h.hoist.accentValue, 0.16)}`;
  h.chip.name.style.color = h.hoist.accentText;
  if (h.currentClass === null) {
    h.chip.sil.innerHTML = '';
    h.chip.role.textContent = 'SELECT CLASS';
    h.chip.name.textContent = 'CHOOSE A HULL';
    return;
  }
  h.chip.sil.innerHTML = silhouetteSvg(h.currentClass, { stroke: accent, fill: h.hoist.accentFill, strokeWidth: 2 });
  const svg = h.chip.sil.firstElementChild as HTMLElement | null;
  if (svg) svg.style.cssText = 'height:40px;width:auto';
  h.chip.role.textContent = 'YOUR SHIP';
  h.chip.name.textContent = CLASS_DISPLAY_NAMES[h.currentClass];
}

/** The callsign field's personal-color chrome: a hue border always, plus a ring
 *  + glow in the same hue while it holds focus (it replaces the native outline,
 *  which is suppressed). Text stays --hc-text-primary; only the chrome tints. */
function paintCallsign(h: Home): void {
  const accent = h.hoist.accent;
  h.input.style.borderColor = accent;
  h.input.style.boxShadow = h.inputFocused
    ? `0 0 0 1px ${accent}, 0 0 18px ${cssRgba(h.hoist.accentValue, 0.28)}`
    : 'none';
}

/** Repaint everything the personal color owns (chip + callsign chrome). Runs at
 *  mount and on every hoist pick, so a hue chosen in the class bay is already
 *  painted on the port the moment the layer closes. */
function repaintAccent(h: Home): void {
  repaintChip(h);
  paintCallsign(h);
}

function updateSubline(h: Home): void {
  h.playSub.textContent = deploySubline(h.currentClass);
}

function setClass(h: Home, cls: ShipClassId): void {
  h.currentClass = cls;
  saveClass(cls);
  repaintChip(h);
  updateSubline(h);
}

function deploy(h: Home): void {
  // Never-silence: a press mid-connect re-asserts CONNECTING… rather than dying.
  if (h.busy) return paintStatus(h, NOTE_CONNECTING, 'info');
  if (h.currentClass === null) return;
  const name = sanitizeName(h.input.value);
  saveName(name);
  h.onDeploy(name, h.currentClass);
}

function onPlay(h: Home): void {
  if (h.currentClass === null) return openLayer(h);
  deploy(h);
}

/** Refocus the callsign field after any layer exit, so Enter=PLAY lives again —
 *  but only while the home is still on screen. */
function refocusInput(h: Home): void {
  if (document.body.contains(h.overlay)) h.input.focus();
}

function openLayer(h: Home): void {
  if (h.busy || h.layerOpen) return;
  h.layerOpen = true;
  h.layer = openClassSelect({
    initial: h.currentClass ?? 'torpedoBoat',
    hoist: h.hoist,
    blurTarget: h.overlay,
    onPick: (cls) => {
      h.layerOpen = false;
      h.layer = null;
      setClass(h, cls);
      refocusInput(h);
    },
    // CONFIRM SELECTION (and Enter) saves the class and comes back to port —
    // deliberately NO deploy(h) here: PLAY is the only path to onDeploy.
    onConfirm: (cls) => {
      h.layerOpen = false;
      h.layer = null;
      setClass(h, cls);
      refocusInput(h);
    },
    onClose: () => {
      h.layerOpen = false;
      h.layer = null;
      refocusInput(h);
    },
  });
}

/** Assemble the overlay children, wire events + initial paint; returns the ESC
 *  handler (so `hide()` can detach it). Split out to keep showHome lean. */
function mountHome(h: Home, playBtn: HTMLButtonElement, version: string): (e: KeyboardEvent) => void {
  const console_ = document.createElement('div');
  console_.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:22px';
  // NO hoist row here: the color picker lives only in the class bay footer now.
  console_.append(
    makeCallsignRow(h.input),
    h.chip.root,
    playBtn,
    makeUnderplay(h.statusEl, () => paintStatus(h, NOTE_HOWTO, 'tertiary')),
  );
  h.overlay.append(makeWordmark(version), console_, makeGear(() => h.onSettings()));
  h.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // Stop the SAME keystroke from bubbling to the layer's window listener (which
    // the click may attach mid-dispatch → insta-pick). Never deploy behind an open layer.
    e.stopPropagation();
    if (h.layerOpen) return;
    onPlay(h);
  });
  h.input.addEventListener('focus', () => {
    h.inputFocused = true;
    paintCallsign(h);
  });
  h.input.addEventListener('blur', () => {
    h.inputFocused = false;
    paintCallsign(h);
  });
  h.disposers.push(h.hoist.onChange(() => repaintAccent(h)));
  repaintAccent(h);
  updateSubline(h);
  paintStatus(h, ...statusTuple(serverStatusLine('probing')));
  return bindHomeKeys(h);
}

/**
 * Home ESC (with the class bay closed) TOGGLES the settings overlay, mirroring
 * the gear and the in-match ESC (Story 2.3 — the inert "settings arrive in a
 * later refit" note is gone). The callsign field keeps ESC to itself so a player
 * mid-edit isn't yanked into a modal. Toggling means a second ESC closes the
 * overlay, exactly as it does in a match.
 */
function bindHomeKeys(h: Home): (e: KeyboardEvent) => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || h.layerOpen) return;
    // The callsign field keeps ESC to itself — but a focused VOLUME SLIDER
    // inside the overlay must NOT (textFieldElement excludes ranges), or ESC
    // dies the moment the player touches a volume from the home gear.
    if (textFieldElement(document.activeElement)) return;
    h.onSettings();
  };
  window.addEventListener('keydown', handler);
  return handler;
}

/**
 * Show the pre-join home. `onDeploy(name, cls)` fires ONLY from PLAY with a
 * chosen class — the class bay never deploys (CONFIRM SELECTION saves and comes
 * back to port). First-run PLAY opens the layer instead of connecting.
 * `onSettings()` is the gear + home-ESC settings toggle (Story 2.3).
 * Returns the handle main.ts drives for status/busy/hide.
 */
export function showHome(
  version: string,
  onDeploy: (name: string, cls: ShipClassId) => void,
  onSettings: () => void = () => undefined,
): HomeHandle {
  document.getElementById(HOME_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = HOME_ID;
  overlay.style.cssText = OVERLAY_CSS;
  applySafeCenterScroll(overlay); // amendment 47 — see ui/fit.ts

  const input = makeNameField();
  const statusEl = makeStatusEl();
  const play = makePlayButton(() => onPlay(h));
  const chip = makeChip(() => openLayer(h));

  const h: Home = {
    overlay,
    input,
    hoist: new ColorHoist(),
    statusEl,
    chip,
    playSub: play.sub,
    playBtn: play.root,
    onDeploy,
    onSettings,
    currentClass: loadSavedClassOrNull(),
    layerOpen: false,
    busy: false,
    inputFocused: false,
    layer: null,
    statusLocked: false,
    disposers: [],
  };

  const keyHandler = mountHome(h, play.root, version);
  document.body.appendChild(overlay);
  input.focus();
  return makeHandle(h, keyHandler);
}

/** Build the HomeHandle main.ts drives — status state machine, busy dimming, and
 *  a hide() that tears down the layer + all mount-time subscriptions. */
function makeHandle(h: Home, keyHandler: (e: KeyboardEvent) => void): HomeHandle {
  return {
    setStatus: (text, tone = 'tertiary') => {
      h.statusLocked = true; // the connect flow owns the line now; late probes yield
      paintStatus(h, text, tone);
    },
    setServerProbe: (state) => {
      if (h.statusLocked) return; // a connect attempt already claimed the line
      paintStatus(h, ...statusTuple(serverStatusLine(state)));
    },
    setBusy: (busy) => {
      h.busy = busy;
      h.playBtn.style.opacity = busy ? '0.4' : '1';
      h.playBtn.style.cursor = busy ? 'default' : 'pointer';
    },
    setYielded: (yielded) => {
      const style = homeYieldStyle(yielded);
      h.overlay.style.visibility = style.visibility;
      h.overlay.style.pointerEvents = style.pointerEvents;
    },
    hide: () => {
      h.layer?.close(); // never orphan a live layer's window listener into the game
      h.layer = null;
      for (const off of h.disposers.splice(0)) off();
      window.removeEventListener('keydown', keyHandler);
      h.overlay.remove();
    },
  };
}

/** Spread a StatusLine into paintStatus's (text, tone) args. */
function statusTuple(s: StatusLine): [string, StatusTone] {
  return [s.text, s.tone];
}
