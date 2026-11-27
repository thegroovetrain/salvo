// THE SERVER ICON (Eric 2026-11-27): the home top bar's left slot. It used to be
// a `SERVER: …` text line that the connect flow also wrote into, so the server
// readout kept turning into a status message. The two jobs are split: messages
// go to the notice under CREATE | JOIN (ui/homeNotice.ts), and this icon shows
// the client-side probe alone (main.ts `probeServer` → `setServerProbe`).
//
// The glyph is Font Awesome Free solid `faServer` — only its definition (width,
// height, path), rendered as an inline `<svg>` in `currentColor` by the same
// helper the footer brand icons use (seo/socialIcons.ts). The TINT is the probe:
// phosphor = ready, denied = unreachable, muted = checking (Eric's ruling).
//
// HOVER OR KEYBOARD FOCUS opens a small tooltip listing each game service and
// its status, one row per entry in `SERVICES` (the ui/communityLinks.ts table
// pattern). A new service is one more entry. The tooltip is the home's ONE
// floating element: anchored to the icon's own `position:relative` wrapper
// (`top:100%`), above the bars, `pointer-events:none`, so it never pushes the
// layout. Its rows re-render on every probe change, open or not.

import { faServer } from '@fortawesome/free-solid-svg-icons';
import { faIconSvg } from '../seo/socialIcons.js';
import { BAR_TEXT_CSS, SERVER_ICON_CLASS } from './homeBars.js';

export type ProbeState = 'probing' | 'ready' | 'unreachable';

/** The icon's rendered height in px (the bar text register's icon size). */
const SERVER_ICON_PX = 22;
const TOOLTIP_ID = 'hc-server-tooltip';

/** One game service: the tooltip's row name. Today every service reads the one
 *  client probe. */
interface ServiceEntry {
  name: string;
}

/** THE SERVICES, in ROW ORDER. A new service is one more entry here. */
const SERVICES: readonly ServiceEntry[] = [{ name: 'GAME SERVER' }];

const PROBE_WORD: Record<ProbeState, string> = {
  ready: 'ONLINE',
  unreachable: 'OFFLINE',
  probing: 'CHECKING…',
};

/** The probe state's color token (icon tint and the tooltip's status word). */
export function probeColor(state: ProbeState): string {
  if (state === 'ready') return 'var(--hc-phosphor)';
  if (state === 'unreachable') return 'var(--hc-denied)';
  return 'var(--hc-text-muted)';
}

export interface ServiceStatusLine {
  name: string;
  status: string;
  color: string;
}

/** The tooltip's rows for a probe state: one per service, in table order. */
export function serviceStatusLines(state: ProbeState): ServiceStatusLine[] {
  return SERVICES.map((s) => ({ name: s.name, status: PROBE_WORD[state], color: probeColor(state) }));
}

export interface ServerStatusEls {
  /** The wrapper the top bar's left slot holds (icon + its tooltip). */
  root: HTMLElement;
  setProbe(state: ProbeState): void;
}

function makeIcon(): HTMLElement {
  const icon = document.createElement('span');
  icon.className = SERVER_ICON_CLASS;
  icon.tabIndex = 0;
  icon.setAttribute('aria-label', 'Server status');
  icon.setAttribute('aria-describedby', TOOLTIP_ID);
  icon.style.cssText = 'display:inline-flex;align-items:center;cursor:default';
  icon.innerHTML = faIconSvg(faServer, SERVER_ICON_PX);
  return icon;
}

function makeTooltip(): HTMLElement {
  const tip = document.createElement('div');
  tip.id = TOOLTIP_ID;
  tip.setAttribute('role', 'tooltip');
  tip.style.cssText =
    'position:absolute;top:100%;left:0;margin-top:10px;z-index:2;pointer-events:none;' +
    'display:none;grid-template-columns:auto auto;column-gap:20px;row-gap:6px;' +
    'padding:10px 14px;box-sizing:border-box';
  tip.style.backgroundColor = 'var(--hc-panel)';
  tip.style.borderWidth = '1px';
  tip.style.borderStyle = 'solid';
  tip.style.borderColor = 'var(--hc-hairline)';
  return tip;
}

function paintRows(tip: HTMLElement, state: ProbeState): void {
  const cells = serviceStatusLines(state).flatMap((line) => {
    const name = document.createElement('span');
    name.style.cssText = BAR_TEXT_CSS;
    name.textContent = line.name;
    const status = document.createElement('span');
    status.style.cssText = BAR_TEXT_CSS;
    status.style.color = line.color;
    status.textContent = line.status;
    return [name, status];
  });
  tip.replaceChildren(...cells);
}

/** The top bar's server icon with its hover/focus tooltip, booted `probing`. */
export function makeServerStatus(): ServerStatusEls {
  const root = document.createElement('span');
  root.style.cssText = 'position:relative;display:inline-flex;align-items:center';
  const icon = makeIcon();
  const tip = makeTooltip();
  const open = (on: boolean) => (): void => {
    tip.style.display = on ? 'grid' : 'none';
  };
  icon.addEventListener('mouseenter', open(true));
  icon.addEventListener('focus', open(true));
  icon.addEventListener('mouseleave', open(false));
  icon.addEventListener('blur', open(false));
  root.append(icon, tip);
  const setProbe = (state: ProbeState): void => {
    icon.style.color = probeColor(state);
    paintRows(tip, state);
  };
  setProbe('probing');
  return { root, setProbe };
}
