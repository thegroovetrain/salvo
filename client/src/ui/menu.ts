// Pre-join menu — plain DOM over the (already-created) Pixi canvas, styled per
// DESIGN.md: phosphor green on the black void, Geist / Geist Mono, amber for
// the one action. The client connects ONLY when PLAY is pressed; the callsign
// persists in localStorage. sanitizeName()/loadSavedName() are pure-ish and
// unit-tested; the rest is a thin DOM adapter.

import { SHIP_CLASS_IDS, sanitizeClassId, type ShipClassId } from '@salvo/shared';
import { registerCss } from './theme.js';
// Entry cap = the shared display cap (Story 1.13, Eric ruling 2026-07-23:
// tighten 16 → 14 to match the kill feed + nameplates). Re-exported so existing
// menu consumers/tests keep importing NAME_MAX from here.
import { NAME_MAX } from '../util/text.js';

export { NAME_MAX };

const MENU_ID = 'main-menu';
const NAME_KEY = 'hullcracker.name';
const CLASS_KEY = 'hullcracker.class';

/** Display label per class (spaced two-word names the id can't produce). */
const CLASS_NAMES: Record<ShipClassId, string> = {
  torpedoBoat: 'TORPEDO BOAT',
  battleship: 'BATTLESHIP',
  mineLayer: 'MINE LAYER',
};

/** One-line tradeoff caption per class (existing label style). */
const CLASS_CAPTIONS: Record<ShipClassId, string> = {
  torpedoBoat: 'FAST · FRAGILE',
  battleship: 'SLOW · ARMORED',
  mineLayer: 'AREA DENIAL',
};

/** Trim + cap a callsign; '' means "let the server assign CAPTAIN-n". */
export function sanitizeName(raw: string): string {
  return raw.trim().slice(0, NAME_MAX);
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

/** Load the saved ship class (defaults to 'torpedoBoat' via sanitizeClassId;
 *  legacy stored ids like 'cruiser' silently fall back to it). */
export function loadSavedClass(): ShipClassId {
  try {
    return sanitizeClassId(localStorage.getItem(CLASS_KEY));
  } catch {
    return 'torpedoBoat';
  }
}

function saveClass(cls: ShipClassId): void {
  try {
    localStorage.setItem(CLASS_KEY, cls);
  } catch {
    // storage unavailable — the class just won't persist
  }
}

export interface MenuHandle {
  /** Status line under the button (connection progress / errors). */
  setStatus(text: string, error?: boolean): void;
  /** Disable/enable the PLAY button while a join is in flight. */
  setBusy(busy: boolean): void;
  hide(): void;
}

const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'justify-content:center',
  'gap:16px',
  'background:var(--hc-void)',
  'z-index:1100',
].join(';');

const INPUT_CSS = [
  'width:240px',
  'padding:10px 12px',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-phosphor)',
  'color:var(--hc-text-primary)',
  'font:500 16px var(--hc-font-mono)',
  'letter-spacing:2px',
  'text-align:center',
  'text-transform:uppercase',
  'outline:none',
].join(';');

const BUTTON_CSS = [
  'width:266px',
  'padding:12px 0',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-amber)',
  'color:var(--hc-amber)',
  'font:600 16px var(--hc-font-mono)',
  'letter-spacing:4px',
  'cursor:pointer',
].join(';');

function makeTitleBlock(version: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:8px';
  const title = document.createElement('div');
  title.textContent = 'HULLCRACKER';
  // The 56px/700 title IS the DESIGN.md `hero` register — consume it for the
  // font shorthand; the mock-tuned 6px tracking stays a hand-tuned append.
  title.style.cssText = `${registerCss('hero')};color:var(--hc-phosphor);letter-spacing:6px`;
  const sub = document.createElement('div');
  sub.textContent = `RT PROTOTYPE // v${version}`;
  sub.style.cssText =
    'font:500 14px var(--hc-font-mono);color:var(--hc-text-muted);letter-spacing:3px;text-transform:uppercase';
  wrap.append(title, sub);
  return wrap;
}

const CLASS_ROW_CSS = ['display:flex', 'gap:8px', 'width:266px'].join(';');

/** Base (unselected) class-button style; selected flips border/text to amber. */
const CLASS_BTN_CSS = [
  'flex:1',
  'padding:8px 0',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-text-muted)',
  'color:var(--hc-text-muted)',
  'font:600 13px var(--hc-font-mono)',
  'letter-spacing:1px',
  'cursor:pointer',
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'gap:3px',
].join(';');

interface ClassPicker {
  element: HTMLElement;
  selected(): ShipClassId;
}

/** Three class buttons (torpedoBoat/battleship/mineLayer); amber = selected. */
function makeClassPicker(): ClassPicker {
  const row = document.createElement('div');
  row.style.cssText = CLASS_ROW_CSS;
  let current = loadSavedClass();
  const buttons = new Map<ShipClassId, HTMLButtonElement>();

  const paint = (): void => {
    for (const [id, btn] of buttons) {
      const on = id === current;
      btn.style.borderColor = on ? 'var(--hc-amber)' : 'var(--hc-text-muted)';
      btn.style.color = on ? 'var(--hc-amber)' : 'var(--hc-text-muted)';
    }
  };

  for (const id of SHIP_CLASS_IDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = CLASS_BTN_CSS;
    const name = document.createElement('span');
    name.textContent = CLASS_NAMES[id];
    const cap = document.createElement('span');
    cap.textContent = CLASS_CAPTIONS[id];
    cap.style.cssText = 'font-size:10px;letter-spacing:0.5px;opacity:0.8';
    btn.append(name, cap);
    btn.addEventListener('click', () => {
      current = id;
      saveClass(id);
      paint();
    });
    buttons.set(id, btn);
    row.appendChild(btn);
  }
  paint();
  return { element: row, selected: () => current };
}

function makeNameField(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.placeholder = 'CALLSIGN';
  input.value = loadSavedName();
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.cssText = INPUT_CSS;
  return input;
}

/**
 * Show the pre-join menu. `onPlay(name, cls)` fires on PLAY / Enter with the
 * sanitized (possibly empty) callsign + chosen ship class, after persisting both.
 */
export function showMenu(
  version: string,
  onPlay: (name: string, cls: ShipClassId) => void,
): MenuHandle {
  document.getElementById(MENU_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = MENU_ID;
  overlay.style.cssText = OVERLAY_CSS;

  const input = makeNameField();
  const classPicker = makeClassPicker();
  const button = document.createElement('button');
  button.textContent = 'PLAY';
  button.style.cssText = BUTTON_CSS;
  const status = document.createElement('div');
  status.style.cssText =
    'min-height:18px;font:400 14px var(--hc-font-mono);letter-spacing:1.5px;color:var(--hc-text-muted)';

  let busy = false;
  const play = (): void => {
    if (busy) return;
    const name = sanitizeName(input.value);
    saveName(name);
    onPlay(name, classPicker.selected());
  };
  button.addEventListener('click', play);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') play();
  });

  overlay.append(makeTitleBlock(version), input, classPicker.element, button, status);
  document.body.appendChild(overlay);
  input.focus();

  return {
    setStatus(text: string, error = false): void {
      status.textContent = text;
      status.style.color = error ? 'var(--hc-denied)' : 'var(--hc-text-muted)';
    },
    setBusy(b: boolean): void {
      busy = b;
      button.style.opacity = b ? '0.4' : '1';
      button.style.cursor = b ? 'default' : 'pointer';
    },
    hide(): void {
      overlay.remove();
    },
  };
}
