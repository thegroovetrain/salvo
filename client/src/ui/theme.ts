// Design-token → CSS bridge (Story 1.11). Projects the numeric CLIENT_CONFIG
// tokens into `--hc-*` CSS custom properties on the document root so DOM chrome
// (menu, results, kill feed, toasts, banner, spend window) can read them as
// `var(--hc-panel)` etc. Also registers the type stacks (`--hc-font-display` /
// `--hc-font-mono`), exposes the DESIGN.md type ramp via `registerCss(name)`,
// and pins `font-variant-numeric: tabular-nums` for all DOM chrome — UX-DR2,
// "every number sits still". Must run BEFORE any DOM UI builds (called first
// thing in main()); Pixi text reads the same tokens directly.

import { CLIENT_CONFIG } from '../config.js';
import { cssHex } from '../util/color.js';

/** camelCase token key → kebab CSS-var suffix (textMuted → text-muted). */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/** Utility-only color tokens: Pixi tint/clear/mask constants, never a DOM design
 *  color — no DOM chrome references `var(--hc-black)`/`var(--hc-white)`, so we
 *  skip projecting them (verified unused; keeps the design var surface honest). */
const UTILITY_ONLY = new Set(['black', 'white']);

type RegisterName = keyof typeof CLIENT_CONFIG.type.registers;

/**
 * Project a DESIGN.md type register into a cssText `font:` fragment DOM chrome
 * can splice into a `style.cssText` (family re-sourced from the `--hc-font-*`
 * var, matching what every DOM declaration already uses). Returns e.g.
 * `font:700 56px var(--hc-font-display)` for `hero`, plus `letter-spacing`/
 * `text-transform` when the register defines them. The `data` register carries
 * no fixed size (context sizes it), so it has no shorthand and is excluded.
 */
export function registerCss(name: Exclude<RegisterName, 'data'>): string {
  const r = CLIENT_CONFIG.type.registers[name];
  const weight = 'weight' in r ? `${r.weight} ` : '';
  const parts = [`font:${weight}${r.size}px var(--hc-font-${r.family})`];
  if ('tracking' in r) parts.push(`letter-spacing:${r.tracking}`);
  if ('upper' in r) parts.push('text-transform:uppercase');
  return parts.join(';');
}

const TABULAR_STYLE_ID = 'hc-tabular-nums';

/**
 * Inject a one-rule stylesheet forcing tabular digits across ALL DOM chrome.
 * The `!important` is REQUIRED: the CSS `font:` shorthand (results cells, kill
 * feed, menu, banner, upgradeMenu…) implicitly resets `font-variant-numeric`
 * to `normal`, which would silently defeat the `:root` longhand below. The
 * design mandates tabular digits everywhere — "every number sits still"
 * (UX-DR2). Idempotent: keyed by element id, so a re-call is a no-op.
 */
function injectTabularStylesheet(doc: Document): void {
  if (doc.getElementById(TABULAR_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = TABULAR_STYLE_ID;
  style.textContent = 'body, body * { font-variant-numeric: tabular-nums !important; }';
  doc.head.appendChild(style);
}

/**
 * Inject the token custom properties + type stacks onto `:root`. Idempotent
 * (setProperty overwrites), so a re-call is harmless. Nested token groups
 * (`players`, `legacy`) are Pixi-only and intentionally skipped — DOM chrome
 * never references a personal hue or a legacy carry-over.
 */
export function injectTheme(root: HTMLElement = document.documentElement): void {
  for (const [key, val] of Object.entries(CLIENT_CONFIG.colors)) {
    if (typeof val === 'number' && !UTILITY_ONLY.has(key)) {
      root.style.setProperty(`--hc-${kebab(key)}`, cssHex(val));
    }
  }
  root.style.setProperty('--hc-font-display', CLIENT_CONFIG.type.display);
  root.style.setProperty('--hc-font-mono', CLIENT_CONFIG.type.mono);
  // Every DOM number sits still (tabular-nums inherits to all chrome).
  root.style.fontVariantNumeric = 'tabular-nums';
  injectTabularStylesheet(root.ownerDocument ?? document);
}
