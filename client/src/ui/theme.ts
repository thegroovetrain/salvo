// Design-token → CSS bridge (Story 1.11). Projects the numeric CLIENT_CONFIG
// tokens into `--hc-*` CSS custom properties on the document root so DOM chrome
// (menu, results, kill feed, toasts, banner, spend window) can read them as
// `var(--hc-panel)` etc. Also registers the type stacks (`--hc-font-display` /
// `--hc-font-mono`) and sets `font-variant-numeric: tabular-nums` for all DOM
// chrome — UX-DR2, "every number sits still". Must run BEFORE any DOM UI builds
// (called first thing in main()); Pixi text reads the same tokens directly.

import { CLIENT_CONFIG } from '../config.js';
import { cssHex } from '../util/color.js';

/** camelCase token key → kebab CSS-var suffix (textMuted → text-muted). */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/**
 * Inject the token custom properties + type registers onto `:root`. Idempotent
 * (setProperty overwrites), so a re-call is harmless. Nested token groups
 * (`players`, `legacy`) are Pixi-only and intentionally skipped — DOM chrome
 * never references a personal hue or a legacy carry-over.
 */
export function injectTheme(root: HTMLElement = document.documentElement): void {
  for (const [key, val] of Object.entries(CLIENT_CONFIG.colors)) {
    if (typeof val === 'number') root.style.setProperty(`--hc-${kebab(key)}`, cssHex(val));
  }
  root.style.setProperty('--hc-font-display', CLIENT_CONFIG.type.display);
  root.style.setProperty('--hc-font-mono', CLIENT_CONFIG.type.mono);
  // Every DOM number sits still (tabular-nums inherits to all chrome).
  root.style.fontVariantNumeric = 'tabular-nums';
}
