// Pre-join menu — plain DOM over the (already-created) Pixi canvas, styled per
// DESIGN.md: phosphor green on the black void, Geist / Geist Mono, amber for
// the one action. The client connects ONLY when PLAY is pressed; the callsign
// persists in localStorage. sanitizeName()/loadSavedName() are pure-ish and
// unit-tested; the rest is a thin DOM adapter.

import { SHIP_CLASS_IDS, sanitizeClassId, type ShipClassId } from '@salvo/shared';

const MENU_ID = 'main-menu';
const NAME_KEY = 'hullcracker.name';
const CLASS_KEY = 'hullcracker.class';
export const NAME_MAX = 16;

/** One-line tradeoff caption per class (existing label style). */
const CLASS_CAPTIONS: Record<ShipClassId, string> = {
  destroyer: 'FAST · LIGHT',
  cruiser: 'BALANCED',
  battleship: 'SLOW · HEAVY',
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

/** Load the saved ship class (defaults to 'cruiser' via sanitizeClassId). */
export function loadSavedClass(): ShipClassId {
  try {
    return sanitizeClassId(localStorage.getItem(CLASS_KEY));
  } catch {
    return 'cruiser';
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
  'background:#000000',
  'z-index:1100',
].join(';');

const INPUT_CSS = [
  'width:240px',
  'padding:10px 12px',
  'background:#111111',
  'border:1px solid #00FF88',
  'color:#E2E8F0',
  'font:500 16px "Geist Mono", monospace',
  'letter-spacing:2px',
  'text-align:center',
  'text-transform:uppercase',
  'outline:none',
].join(';');

const BUTTON_CSS = [
  'width:266px',
  'padding:12px 0',
  'background:#111111',
  'border:1px solid #FFB800',
  'color:#FFB800',
  'font:600 16px "Geist Mono", monospace',
  'letter-spacing:4px',
  'cursor:pointer',
].join(';');

function makeTitleBlock(version: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:8px';
  const title = document.createElement('div');
  title.textContent = 'HULLCRACKER';
  title.style.cssText =
    'font:700 56px Geist, "Geist Mono", monospace;color:#00FF88;letter-spacing:6px';
  const sub = document.createElement('div');
  sub.textContent = `RT PROTOTYPE // v${version}`;
  sub.style.cssText =
    'font:500 14px "Geist Mono", monospace;color:#5A6478;letter-spacing:3px;text-transform:uppercase';
  wrap.append(title, sub);
  return wrap;
}

const CLASS_ROW_CSS = ['display:flex', 'gap:8px', 'width:266px'].join(';');

/** Base (unselected) class-button style; selected flips border/text to amber. */
const CLASS_BTN_CSS = [
  'flex:1',
  'padding:8px 0',
  'background:#111111',
  'border:1px solid #5A6478',
  'color:#5A6478',
  'font:600 13px "Geist Mono", monospace',
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

/** Three class buttons (destroyer/cruiser/battleship); amber = selected. */
function makeClassPicker(): ClassPicker {
  const row = document.createElement('div');
  row.style.cssText = CLASS_ROW_CSS;
  let current = loadSavedClass();
  const buttons = new Map<ShipClassId, HTMLButtonElement>();

  const paint = (): void => {
    for (const [id, btn] of buttons) {
      const on = id === current;
      btn.style.borderColor = on ? '#FFB800' : '#5A6478';
      btn.style.color = on ? '#FFB800' : '#5A6478';
    }
  };

  for (const id of SHIP_CLASS_IDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = CLASS_BTN_CSS;
    const name = document.createElement('span');
    name.textContent = id.toUpperCase();
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
    'min-height:18px;font:400 14px "Geist Mono", monospace;letter-spacing:1.5px;color:#5A6478';

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
      status.style.color = error ? '#FF3B30' : '#5A6478';
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
