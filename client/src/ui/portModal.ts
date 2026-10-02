// Shared bones for the private-lobby modals (cycle 167): ui/joinCodeModal.ts and
// ui/lobbyModal.ts. Both sit in the QUEUE MODAL's slot of the z ladder (1150,
// between the home at 1100 and the class bay at 1200) with its transparent,
// click-blocking backdrop, and both take the {components.modal} register:
// panel bed, 1px hairline, {rounded.lg} 12px, mono uppercase tabular-nums.
// ui/queueModal.ts is the model and stays untouched; the CSSOM hazards it
// documents (no `border:` shorthand, no `background:` shorthand before
// `z-index`) are honored here the same way.

import { registerCss } from './theme.js';

export const MODAL_Z = 1150;

const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'padding:24px',
  'box-sizing:border-box',
  'background-color:transparent',
  `z-index:${MODAL_Z}`,
].join(';');

const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  'align-items:stretch',
  'gap:14px',
  'min-width:320px',
  'max-width:100%',
  'padding:28px 36px',
  'box-sizing:border-box',
  'max-height:100%',
  'overflow-y:auto',
  'background-color:var(--hc-panel)',
  'border-radius:12px',
  'font-family:var(--hc-font-mono)',
  'font-variant-numeric:tabular-nums',
].join(';');

/** The 1px outline, as SEPARATE properties (the shorthand is rejected whole). */
export function applyHairline(el: HTMLElement, color: string): void {
  el.style.borderWidth = '1px';
  el.style.borderStyle = 'solid';
  el.style.borderColor = color;
}

/** A `document.body` sibling overlay + its panel, both with ids. */
export function makeModalShell(id: string): { overlay: HTMLElement; panel: HTMLElement } {
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = OVERLAY_CSS;
  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;
  applyHairline(panel, 'var(--hc-hairline)');
  overlay.appendChild(panel);
  return { overlay, panel };
}

/**
 * Set a slot's copy without moving what is below it (queueModal's `paintSlot`:
 * a hidden slot keeps its line). Safe for the same structural reason — these
 * modals are body siblings, never inside the home root that yields.
 */
export function paintSlot(el: HTMLElement, text: string): void {
  el.textContent = text === '' ? '\u00a0' : text;
  el.style.visibility = text === '' ? 'hidden' : 'visible';
}

/** A one-line text block in a register and color. */
export function makeLine(register: 'hudReadout' | 'hudMicro' | 'label', color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `${registerCss(register)};color:${color};text-transform:uppercase;text-align:center`;
  return el;
}

/**
 * An outlined port-chrome button — {rounded.md} 8px, transparent bed (never a
 * filled slab), mono uppercase letter-spaced. `color` is the register: amber for
 * the one primary action, phosphor for secondaries, denied for leaving.
 */
export function makeModalButton(label: string, color: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = [
    'padding:12px 28px',
    'background-color:transparent',
    'border-radius:8px',
    `color:${color}`,
    'font:600 13px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'cursor:pointer',
  ].join(';');
  applyHairline(btn, color);
  btn.textContent = label;
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    onClick();
  });
  return btn;
}

/** Enable/disable a modal button, dimming it the way the home dims its doors. */
export function setButtonEnabled(btn: HTMLButtonElement, enabled: boolean): void {
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '0.4';
  btn.style.cursor = enabled ? 'pointer' : 'default';
}

/** A mono text input in the port-chrome register ({rounded.md} 8px, hairline). */
export function makeModalInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.cssText = [
    'padding:10px 14px',
    'box-sizing:border-box',
    'width:100%',
    'background-color:var(--hc-panel-deep)',
    'border-radius:8px',
    'color:var(--hc-text-primary)',
    'font:600 16px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'text-align:center',
    'outline:none',
  ].join(';');
  applyHairline(input, 'var(--hc-hairline)');
  return input;
}

/**
 * The modal's ESC (and optionally Enter) — bound on `window` in the CAPTURE
 * phase and stopped there, so the home's own bubble-phase ESC (which toggles
 * settings, UNDER this modal) never sees the key while the modal is up.
 * Returns the detach.
 */
export function bindModalKeys(onEscape: () => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    onEscape();
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}
