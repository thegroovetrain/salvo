// Pre-join menu — plain DOM over the (already-created) Pixi canvas, styled per
// DESIGN.md: phosphor green on the black void, Geist / Geist Mono, amber for
// the one action. The client connects ONLY when PLAY is pressed; the callsign
// persists in localStorage. sanitizeName()/loadSavedName() are pure-ish and
// unit-tested; the rest is a thin DOM adapter.

const MENU_ID = 'main-menu';
const NAME_KEY = 'hullcracker.name';
export const NAME_MAX = 16;

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
    'font:500 11px "Geist Mono", monospace;color:#5A6478;letter-spacing:3px;text-transform:uppercase';
  wrap.append(title, sub);
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
  input.style.cssText = INPUT_CSS;
  return input;
}

/**
 * Show the pre-join menu. `onPlay(name)` fires on PLAY / Enter with the
 * sanitized (possibly empty) callsign, after persisting it.
 */
export function showMenu(version: string, onPlay: (name: string) => void): MenuHandle {
  document.getElementById(MENU_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = MENU_ID;
  overlay.style.cssText = OVERLAY_CSS;

  const input = makeNameField();
  const button = document.createElement('button');
  button.textContent = 'PLAY';
  button.style.cssText = BUTTON_CSS;
  const status = document.createElement('div');
  status.style.cssText =
    'min-height:16px;font:400 12px "Geist Mono", monospace;letter-spacing:1.5px;color:#5A6478';

  let busy = false;
  const play = (): void => {
    if (busy) return;
    const name = sanitizeName(input.value);
    saveName(name);
    onPlay(name);
  };
  button.addEventListener('click', play);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') play();
  });

  overlay.append(makeTitleBlock(version), input, button, status);
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
