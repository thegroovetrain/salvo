// THE HOME'S FRAME: TOP BAR, CONSOLE ROW, BOTTOM BAR (Eric ruling 2026-11-25,
// "A3 · Banded Bars", with his placements).
//
// The home overlay is ONE full-height CSS grid — `header` / `main` / `footer` —
// and nothing in it is absolutely positioned ("Absolute positioning is the
// fucking devil"): the overlay itself is the only fixed layer (it IS the
// viewport layer). The bars never move; the `main` row centers the console and
// scrolls internally only when a window is shorter than the console.
//
//   header: server status (left) · PLAYERS ONLINE / LIVE GAMES (center) · the
//           settings gear (right)
//   main:   the squared console — wordmark, tagline, then callsign, class chip
//           and the four doors on one 540px column
//   footer: `© {year}` and the version line (left) · HOW TO PLAY · PRIVACY
//           (center) · the social brand icons (right)
//
// Each bar is a BAND: the panel tone at 72% alpha with a hairline edge toward
// the console, so its readouts stay legible over any water. Every footer piece
// is a SERVED element adopted by `ui/homeStatic.ts`, never rebuilt here; the
// header's pieces are JS-driven (the probe, the liveness poll, the gear).
//
// THE SHORT WINDOW. The design's sizes switch to a tighter rhythm below a
// 600px-tall window (bars 60 → 48, doors 64 → 44, …). Inline styles cannot hold
// a media query, so the sizes are custom properties on `#main-menu`, set by the
// one small stylesheet `ensureHomeStyle` injects, and every inline style reads
// them by `var()`. That sheet also carries the keyboard focus ring for the
// bars' links and the gear (`:focus-visible` cannot be inline either).
//
// JSDOM HAZARD: a `border:` or `background:` SHORTHAND inside a `cssText` blob
// voids the whole blob there, so the band's bed and edge are longhands.
// `homeYieldStyle` stays the only `visibility` writer in the home tree.

import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { applySafeCenterScroll } from './fit.js';
import type { ServedHome } from './homeStatic.js';

/** The home overlay's id (kept: index.html / any external hook is stable). */
export const HOME_ID = 'main-menu';
const HOME_STYLE_ID = 'hc-home-style';

/** The window height at and below which the console takes the tight rhythm. */
const SHORT_WINDOW_PX = 600;

/** The design's sizes: [normal, short window]. */
const SIZES: Record<string, readonly [string, string]> = {
  '--hc-home-bar': ['60px', '48px'],
  '--hc-home-gap': ['40px', '12px'],
  '--hc-home-pad': ['16px 26px', '4px 26px'],
  '--hc-home-brand-gap': ['10px', '4px'],
  '--hc-home-col-gap': ['16px', '8px'],
  '--hc-home-doors-mt': ['16px', '4px'],
  '--hc-home-door-gap': ['12px', '8px'],
  '--hc-home-door': ['64px', '44px'],
  '--hc-home-door-font': ['34px', '28px'],
  '--hc-home-input': ['52px', '44px'],
  '--hc-home-chip': ['64px', '56px'],
  '--hc-home-mark-vh': ['11vh', '9.5vh'],
};

function sizeRule(pick: 0 | 1): string {
  return `#${HOME_ID}{${Object.entries(SIZES).map(([k, v]) => `${k}:${v[pick]}`).join(';')}}`;
}

/** The home's one stylesheet: the size properties (normal, then the short
 *  window) and the focus ring. Idempotent: keyed by element id. */
export function ensureHomeStyle(doc: Document = document): void {
  if (doc.getElementById(HOME_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = HOME_STYLE_ID;
  const focus =
    `#${HOME_ID} header [role="button"]:focus-visible,#${HOME_ID} footer a:focus-visible` +
    '{outline:2px solid var(--hc-phosphor);outline-offset:4px;border-radius:2px}';
  style.textContent =
    sizeRule(0) + `@media (max-height:${SHORT_WINDOW_PX}px){${sizeRule(1)}}` + focus;
  doc.head.appendChild(style);
}

/** The overlay: the viewport layer, a three-row grid (bar / console / bar). */
export function makeOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = HOME_ID;
  overlay.style.cssText =
    'position:fixed;inset:0;display:grid;grid-template-columns:minmax(0, 1fr);' +
    'background-color:transparent;z-index:1100;overflow:hidden';
  // Assigned on its own: the parser that voids a blob on one bad declaration
  // must not take the rows with it.
  overlay.style.gridTemplateRows = 'auto minmax(0, 1fr) auto';
  return overlay;
}

/** The text register every bar readout and link speaks in. */
export const BAR_TEXT_CSS =
  'font:500 15px var(--hc-font-mono);letter-spacing:0.14em;text-transform:uppercase;' +
  'white-space:nowrap;color:var(--hc-phosphor)';

type Edge = 'top' | 'bottom';

/** A band: the panel tone at 72% alpha, a hairline on the edge facing the
 *  console, three slots (left / center / right) on a 1fr-auto-1fr grid so the
 *  center slot is centered on the window whatever the sides hold. */
function makeBar(tag: 'header' | 'footer', edge: Edge, slots: readonly HTMLElement[][]): HTMLElement {
  const bar = document.createElement(tag);
  bar.style.cssText =
    'display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;' +
    'padding:0 26px;box-sizing:border-box;height:var(--hc-home-bar);min-width:0';
  bar.style.backgroundColor = cssRgba(CLIENT_CONFIG.colors.panel, 0.72);
  bar.style.setProperty(`border-${edge}-width`, '1px');
  bar.style.setProperty(`border-${edge}-style`, 'solid');
  bar.style.setProperty(`border-${edge}-color`, 'var(--hc-hairline)');
  const justify = ['start', 'center', 'end'];
  slots.forEach((kids, i) => {
    const slot = document.createElement('div');
    slot.style.cssText = 'display:flex;align-items:center;gap:28px;min-width:0';
    slot.style.justifySelf = justify[i];
    slot.append(...kids);
    bar.append(slot);
  });
  return bar;
}

/** The server status line (the probe's, plus the connect flow's register). */
export function makeStatusEl(): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = BAR_TEXT_CSS;
  return el;
}

export interface LivenessEls {
  root: HTMLElement;
  players: HTMLElement;
  games: HTMLElement;
}

/**
 * The GLOBAL population register — `PLAYERS ONLINE: n` and `LIVE GAMES: n` on
 * one line, centered in the top bar (Eric 2026-11-25). Phosphor, never muted
 * (DESIGN.md:153: load-bearing numbers); `tabular-nums` arrives globally from
 * ui/theme.ts so the digits sit still under the 10s poll. A readout: it never
 * takes pointer events. Hidden (`display:none`) until a payload arrives and
 * again whenever liveness is unavailable — `livenessLines` owns that rule.
 */
export function makeLiveness(): LivenessEls {
  const root = document.createElement('div');
  root.style.cssText = 'display:none;align-items:center;gap:28px;pointer-events:none';
  const players = document.createElement('span');
  players.style.cssText = BAR_TEXT_CSS;
  const games = document.createElement('span');
  games.style.cssText = BAR_TEXT_CSS;
  root.append(players, games);
  return { root, players, games };
}

/** The settings gear: click, or Enter/Space when focused. */
export function makeGear(onClick: () => void): HTMLElement {
  const gear = document.createElement('div');
  gear.textContent = '⚙';
  gear.setAttribute('role', 'button');
  gear.setAttribute('title', 'Settings');
  gear.tabIndex = 0;
  gear.style.cssText =
    'font-size:32px;line-height:40px;width:40px;height:40px;text-align:center;' +
    'color:var(--hc-phosphor);cursor:pointer;flex:none';
  gear.addEventListener('click', onClick);
  gear.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onClick();
  });
  return gear;
}

/** The top bar: status left, liveness center, gear right. */
export function makeHeader(status: HTMLElement, liveness: HTMLElement, gear: HTMLElement): HTMLElement {
  return makeBar('header', 'bottom', [[status], [liveness], [gear]]);
}

function styleFooterPieces(served: ServedHome): void {
  for (const p of [served.copyright, served.version]) {
    p.style.cssText = `${BAR_TEXT_CSS};margin:0`;
  }
  served.links.style.cssText = 'display:flex;align-items:center;gap:28px';
  for (const a of served.links.querySelectorAll<HTMLElement>('a')) {
    a.style.cssText = `${BAR_TEXT_CSS};text-decoration:underline;text-underline-offset:4px;cursor:pointer`;
  }
  served.social.style.cssText = 'display:flex;align-items:center;gap:20px';
  for (const a of served.social.querySelectorAll<HTMLElement>('a')) {
    a.style.cssText = 'display:inline-flex;align-items:center;color:var(--hc-phosphor);cursor:pointer';
  }
}

/** The bottom bar, from the SERVED pieces: `© {year}` + version left, the link
 *  nav center, the social icons right. (The served whitespace between anchors
 *  is a flex container's ignorable text: no box, no gap.) */
export function makeFooter(served: ServedHome): HTMLElement {
  styleFooterPieces(served);
  return makeBar('footer', 'top', [[served.copyright, served.version], [served.links], [served.social]]);
}

/** The console row: the page's `<main>`, centering its stack, scrolling (and
 *  never centering its head out of reach — ui/fit.ts) only when the window is
 *  shorter than the console. */
export function makeConsoleRow(...kids: HTMLElement[]): HTMLElement {
  const main = document.createElement('main');
  main.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:var(--hc-home-gap);' +
    'padding:var(--hc-home-pad);min-height:0;box-sizing:border-box';
  applySafeCenterScroll(main);
  main.append(...kids);
  return main;
}

/** The console's one 540px column: callsign, class chip, the doors. */
export function makeConsoleColumn(...kids: HTMLElement[]): HTMLElement {
  const col = document.createElement('div');
  col.style.cssText =
    'width:540px;max-width:100%;display:flex;flex-direction:column;gap:var(--hc-home-col-gap)';
  col.append(...kids);
  return col;
}
