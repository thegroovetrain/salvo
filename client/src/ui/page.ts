// THE STANDARD PAGE CHROME (Story 7.2, Eric ruling R12).
//
// This is the port's FULL-PAGE register — the one the privacy policy ships in
// today and the one Story 7.3's How-to-Play page inherits tomorrow. Until now it
// existed as TWO SENTENCES AND NO COMPONENT: DESIGN.md:94/:201 ("DOM port chrome
// … centers at {spacing.chrome-max-width} max", UX-DR39) and EXPERIENCE.md:37
// ("Static page (standard page chrome; ESC/back returns home)"). R12 makes 7.2
// mint it so the two pages cannot diverge into two chromes.
//
// IT IS DELIBERATELY DUMB. It knows nothing about privacy, analytics, consent,
// the game, the net layer or the ambient scene — a title, an optional sub-line,
// a stack of caller-built blocks, and one way back. That is what lets it serve
// BOTH as a standalone page's whole body (`src/privacy/main.ts`) and as an
// in-app overlay if 7.3 wants one (its choice, not this module's): the caller
// supplies the host and the z-rung, and neither is assumed here.
//
// THE BED IS THE SETTINGS OVERLAY'S, NOT A NEW ONE (ui/settings.ts:190-215):
// {colors.panel} bed, 1px {colors.hairline} outline, {rounded.lg}, and
// `box-sizing:border-box` beside its own `overflow-y:auto` — amendment 47, the
// container-fit law: under the default content-box the padding and border sit
// OUTSIDE `max-height:100%` and clip the panel's own chrome at every viewport.
//
// TWO CSSOM-BLOB HAZARDS, both measured in this repo's test environment and both
// documented at length in ui/queueModal.ts. One declaration the parser dislikes
// voids the ENTIRE declaration list, so (1) the `border:1px solid var(--x)`
// SHORTHAND is never used — border goes on as separate properties — and (2) the
// `background:` shorthand poisons everything after it in the same blob, so the
// `background-color` LONGHAND is used instead. Copying ui/settings.ts's blobs
// verbatim would have made this module's geometry unassertable.
//
// COLOUR: every value is an `--hc-*` token or a `registerCss()` ramp entry.
// `client/src/__tests__/tokens.test.ts` fails the whole suite on a single colour
// literal anywhere under `client/src`.

import { CLIENT_CONFIG } from '../config.js';
import { registerCss } from './theme.js';

const P = CLIENT_CONFIG.page;

/** A mounted page: its root element, and the one teardown path. */
export interface MountedPage {
  /** The outermost element, already appended to the host. */
  root: HTMLElement;
  /** Remove the page, its ESC binding and its `pagehide` disposal hook.
   *  Idempotent — safe to call after `pagehide` has already fired it. */
  destroy(): void;
}

export interface PageOptions {
  /** The page title — uppercase mono, the port's SYSTEM register. */
  title: string;
  /** Optional sub-line under the title (a "last updated" stamp, a one-line
   *  summary). Dimmer than the title but never `text-muted`. */
  subtitle?: string;
  /** The page body, stacked in order at the page's vertical rhythm. Built by
   *  the caller — see `makePageHeading` / `makePageParagraph` / `makePageList`
   *  for the ratified copy registers. */
  body: readonly HTMLElement[];
  /** Where the back affordance and ESC both go. See `goHome`. */
  onBack: () => void;
  /** Back-button copy. Uppercase mono; defaults to the port's own word for it. */
  backLabel?: string;
  /** DOM id for the root (so a host can find or replace it). */
  id?: string;
  /** Where to mount. Defaults to `document.body`. */
  host?: HTMLElement;
}

/**
 * RETURN HOME — an explicit navigation to `/`, NEVER `history.back()`.
 *
 * The trap this exists to avoid: a visitor can land on `/privacy` directly (a
 * search result, a link in a store listing, a legal footer somewhere else), and
 * for that visitor `history.back()` leaves the site entirely. EXPERIENCE.md:37's
 * contract is "returns home", which is a destination, not a direction.
 *
 * The BROWSER's own back button is the other half of that contract and needs no
 * code at all for a standalone page: `/privacy` is a real navigation, so back
 * unwinds to wherever the player came from — the port, when they came from the
 * port. An in-app OVERLAY host that wants browser-back to close it owns that
 * history entry itself; this module deliberately pushes none, because a
 * component that pushes history it does not own is a component you cannot use
 * twice on one page.
 */
export function goHome(): void {
  window.location.href = '/';
}

// --- copy registers -----------------------------------------------------------
//
// EXPERIENCE.md:53: "uppercase mono for labels and system lines; sentences only
// in descriptions and How-to-Play". A page's headings are system lines and take
// the mono label register; a page's PROSE is body copy and takes Geist at the
// `body` ramp entry. That split is the whole reason these three helpers exist
// rather than each page inventing its own type.

/** A section heading — uppercase mono, phosphor (the port's system voice). */
export function makePageHeading(text: string): HTMLElement {
  const el = document.createElement('h2');
  el.textContent = text;
  el.style.cssText = `${registerCss('label')};color:var(--hc-phosphor);margin:0`;
  return el;
}

/**
 * A prose paragraph — Geist body, `text-primary`.
 *
 * NEVER `text-muted`: DESIGN.md:153 bars muted from load-bearing copy, and page
 * copy is the only thing on a page. `text-secondary` is available for genuinely
 * secondary asides (see `makePageNote`).
 */
export function makePageParagraph(text: string): HTMLElement {
  const el = document.createElement('p');
  el.textContent = text;
  el.style.cssText = `${registerCss('body')};color:var(--hc-text-primary);line-height:1.6;margin:0`;
  return el;
}

/** A secondary aside — same ramp one step down, `text-secondary`. */
export function makePageNote(text: string): HTMLElement {
  const el = document.createElement('p');
  el.textContent = text;
  el.style.cssText = `${registerCss('small')};color:var(--hc-text-secondary);line-height:1.6;margin:0`;
  return el;
}

/**
 * An inline link — the body register in phosphor, underlined.
 *
 * `makePageParagraph` and friends set `textContent`, so before this helper NO
 * page could render a clickable anything: the privacy policy's contact address
 * and both Google policy URLs shipped as dead text (Story 7.2 review gate).
 * Returns an `<a>` that composes either way — spliced into a paragraph beside
 * text nodes, or stood up on its own as a page block.
 *
 * UNDERLINED, not colour-only: phosphor-on-panel is also the page's HEADING
 * colour, so hue alone would not distinguish a link from a system line (and
 * would carry nothing at all for a colour-blind reader). `rel` is set because a
 * page's links point off-site by construction; the target is deliberately NOT
 * forced to a new tab — that is the visitor's call, and a page reached by
 * navigation always has the browser's own way back.
 */
export function makePageLink(text: string, href: string): HTMLElement {
  const el = document.createElement('a');
  el.textContent = text;
  el.href = href;
  el.rel = 'noopener noreferrer';
  el.style.cssText = [
    registerCss('body'),
    'color:var(--hc-phosphor)',
    'text-decoration:underline',
    'text-underline-offset:2px',
    'cursor:pointer',
  ].join(';');
  return el;
}

/** A bulleted list of prose items — same register as a paragraph. */
export function makePageList(items: readonly string[]): HTMLElement {
  const ul = document.createElement('ul');
  ul.style.cssText =
    `${registerCss('body')};color:var(--hc-text-primary);line-height:1.6;margin:0;padding-left:22px`;
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
  return ul;
}

/** A stacked block: heading + its children, at the page's vertical rhythm. */
export function makePageSection(heading: string, ...children: HTMLElement[]): HTMLElement {
  const el = document.createElement('section');
  el.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  el.append(makePageHeading(heading), ...children);
  return el;
}

// --- the controls table -------------------------------------------------------
//
// ERIC RULING (2026-08-19): keys on a page render as KEYCAP BOXES, matching the
// in-game treatment — never as plain text.
//
// The canonical DOM keycap is the refit card's digit chip (ui/upgradeMenu.ts's
// `KEY_CHIP_CSS`): a 22px square, a 1px `currentColor` hairline, `400 14px` mono,
// flex-centred. It is RESTATED here rather than imported, exactly as this module
// already restates the results button chip (see `makeKeyChip` below) — a page
// must not pull the spend window in to draw a box, and the two chips answer to
// different owners. The 22px/14px figures are the ones that module carries in
// `CLIENT_CONFIG.upgrade`; they are literals here because config.ts's `page`
// block has no keycap token and a page may not read the refit block.

/** One row of the controls table. */
export interface KeyBinding {
  /** One or more keycaps for this row, e.g. ['W','S'] or ['TAB'] or ['1','2','3','4']. */
  keys: readonly string[];
  /** What the key does, in sentence case. */
  action: string;
}

const KEYCAP_SIZE_PX = 22;

/** The keycap square. Border goes on through `applyHairline` as longhands, never
 *  the shorthand — CSSOM hazard 1 above, and the geometry has to stay
 *  assertable. */
const KEYCAP_CSS = [
  'display:inline-flex',
  'align-items:center',
  'justify-content:center',
  // `min-width` rather than `width`: a wide cap (TAB, ENTER, SHIFT) grows
  // sideways, but the HEIGHT and the type never move, so a mixed row still
  // reads as one family of boxes sitting on one line.
  `min-width:${KEYCAP_SIZE_PX}px`,
  `height:${KEYCAP_SIZE_PX}px`,
  'padding:0 5px',
  'box-sizing:border-box',
  'flex:none',
  'color:var(--hc-phosphor)',
  'font:400 14px var(--hc-font-mono)',
  'white-space:nowrap',
].join(';');

/** A single keycap box. Internal: pages get keys through `makeKeyTable`, so a
 *  cap and its row can never drift apart. */
function makeKeycap(label: string): HTMLElement {
  const cap = document.createElement('span');
  cap.textContent = label;
  cap.style.cssText = KEYCAP_CSS;
  applyHairline(cap, 'currentColor');
  return cap;
}

/**
 * The controls table — one row per binding: its keycaps, then what they do.
 *
 * A real `<table>`, not a grid of divs: this IS tabular data, the column
 * alignment comes free, and assistive tech gets the row/cell structure for
 * nothing. The keys cell is `nowrap` and content-sized (`width:1%`) while the
 * action cell takes the rest, so the table can never widen past the 1100px
 * column — the action text wraps instead, which is what keeps the panel free of
 * a horizontal scrollbar at the ratified 1366x768 floor.
 */
export function makeKeyTable(rows: readonly KeyBinding[]): HTMLElement {
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;max-width:100%';
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const keys = document.createElement('td');
    keys.style.cssText = 'padding:5px 16px 5px 0;vertical-align:top;white-space:nowrap;width:1%';
    const caps = document.createElement('div');
    caps.style.cssText = 'display:flex;align-items:center;gap:6px';
    for (const key of row.keys) caps.appendChild(makeKeycap(key));
    keys.appendChild(caps);
    const action = document.createElement('td');
    action.textContent = row.action;
    action.style.cssText =
      `${registerCss('body')};color:var(--hc-text-primary);line-height:1.6;` +
      'padding:5px 0;vertical-align:top';
    tr.append(keys, action);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// --- the chrome ---------------------------------------------------------------

const ROOT_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  `padding:${P.gutter}px`,
  'box-sizing:border-box',
  // No fullscreen dim — DESIGN dims behind the results screen only, and a
  // standalone page has nothing behind it to dim.
  'background-color:transparent',
].join(';');

const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  `gap:${P.gap}px`,
  `width:${P.maxWidthPx}px`,
  `max-width:${P.maxWidthPx}px`,
  'max-height:100%',
  // Amendment 47, the container-fit law — the padding and border must count
  // INSIDE the max, or the panel clips its own chrome.
  'box-sizing:border-box',
  'overflow-y:auto',
  `padding:${P.pad}px`,
  'background-color:var(--hc-panel)',
  `border-radius:${P.radius}px`,
  'font-family:var(--hc-font-mono)',
  'color:var(--hc-text-primary)',
].join(';');

/** The 1px hairline outline as SEPARATE properties (CSSOM hazard 1, above). */
function applyHairline(el: HTMLElement, color: string): void {
  el.style.borderWidth = '1px';
  el.style.borderStyle = 'solid';
  el.style.borderColor = color;
}

/** Mockup F3 `.res-key` — the boxed key glyph before a button's label
 *  (ui/results.ts's own chip, restated so a page needs no results import). */
function makeKeyChip(glyph: string): HTMLElement {
  const chip = document.createElement('span');
  chip.textContent = glyph;
  chip.style.cssText =
    'display:inline-block;padding:0 5px;border:1px solid currentColor;margin-right:7px;font-size:10px';
  return chip;
}

/**
 * The back affordance — {components.button-primary}'s shape in its SECONDARY
 * treatment: outline + no glow, in phosphor rather than amber.
 *
 * DESIGN.md:111/:244 ratifies exactly ONE button ("outline + glow, never filled
 * slab"), and ui/results.ts:733-770 is the precedent for the unlit variant: same
 * geometry, same 1px accent hairline, glow omitted. A page's way out is not the
 * page's call to action, so it does not get the amber bloom.
 *
 * IT NEVER KEEPS FOCUS. A focused `<button>` trips the keyboard chokepoint's
 * text-entry guard and swallows the very ESC this page binds — the trap
 * ui/settings.ts:229-240 and ui/results.ts:733-770 both document, and the reason
 * for the `mousedown` preventDefault plus the `blur()` on click.
 */
function makeBackButton(label: string, onBack: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = [
    'padding:10px 18px',
    'background-color:transparent', // never a filled slab
    `border-radius:${CLIENT_CONFIG.results.controlRadius}px`,
    'color:var(--hc-phosphor)',
    'font:600 13px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'cursor:pointer',
    'white-space:nowrap',
  ].join(';');
  applyHairline(btn, 'var(--hc-phosphor)');
  btn.appendChild(makeKeyChip('ESC'));
  btn.appendChild(document.createTextNode(label));
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    btn.blur();
    onBack();
  });
  return btn;
}

/** Title + optional sub-line on the left, the back affordance on the right. */
function makeHeader(opts: PageOptions): HTMLElement {
  const row = document.createElement('header');
  row.style.cssText =
    'display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap';
  const titles = document.createElement('div');
  titles.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  const title = document.createElement('h1');
  title.textContent = opts.title;
  title.style.cssText =
    `${registerCss('hudReadout')};color:var(--hc-phosphor);letter-spacing:0.18em;` +
    'text-transform:uppercase;margin:0';
  titles.appendChild(title);
  if (opts.subtitle !== undefined) {
    const sub = document.createElement('div');
    sub.textContent = opts.subtitle;
    sub.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-secondary)`;
    titles.appendChild(sub);
  }
  row.append(titles, makeBackButton(opts.backLabel ?? 'BACK TO PORT', opts.onBack));
  return row;
}

/**
 * THE ONE LIVE MOUNT. The page chrome is a SINGLETON, and a second `renderPage`
 * tears the previous one down rather than refusing.
 *
 * Why a singleton at all: the root is `position:fixed;inset:0` and the ESC
 * binding is document-level and capture-phase, so two simultaneous mounts are
 * never a composition — they are two full-viewport sheets with duplicate ids
 * firing `onBack` twice per key press. There is no arrangement in which the
 * second one is anything but a bug.
 *
 * Why TEAR DOWN rather than REFUSE: the caller that actually hits this is one
 * that discarded its handle (`src/privacy/main.ts` does exactly that, which is
 * how the undisposed capture-phase listener got ledgered at the 7.2 review
 * gate), so refusing would leave the stale page on screen and the fresh call
 * silently doing nothing — a failure the caller cannot see and cannot fix
 * without the handle it already threw away. Replacing is the behaviour that is
 * correct WITHOUT the caller's cooperation, which is the whole point. Story
 * 7-8's `pagehide` disposal below is the same argument applied to the document
 * going away, and it does not change this one: it gives the discarded handle a
 * teardown path, it does not make a second mount any less of a bug to absorb.
 */
let liveMount: MountedPage | null = null;

/**
 * Build and mount the page. Returns its root plus the ONE teardown path, which
 * is also the only place the ESC binding is removed — a page that outlived its
 * listener would keep answering a key for a screen that is no longer there.
 *
 * ESC is bound on `document` in the CAPTURE phase deliberately: an overlay host
 * may have its own document-level bindings, and the page that is actually on top
 * should get the key first. `destroy()` unbinds with the same flag, or the
 * removal silently does nothing.
 *
 * Three ways the binding can no longer outlive its page: mounting again replaces
 * the previous mount (see `liveMount`), the handler DISOWNS ITSELF if its root
 * has left the document — a host that drops the root without calling
 * `destroy()` would otherwise leave a capture-phase key that navigates home
 * behind a screen that is gone — and `pagehide` disposes the whole thing when
 * the document goes away.
 *
 * THE `pagehide` LEG IS WHAT MAKES DISPOSAL REACHABLE WITHOUT THE CALLER
 * (Story 7-8, closing the 7.2 review-gate ledger entry): both static-page mains
 * boot at module scope and discard the handle, so `destroy()` had no reachable
 * path at all. It is `pagehide` rather than `unload` because `unload` is
 * deprecated and disables the back/forward cache outright.
 */
export function renderPage(opts: PageOptions): MountedPage {
  liveMount?.destroy();

  const root = document.createElement('div');
  if (opts.id !== undefined) root.id = opts.id;
  root.style.cssText = ROOT_CSS;

  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;
  applyHairline(panel, 'var(--hc-hairline)');

  const body = document.createElement('div');
  body.style.cssText = `display:flex;flex-direction:column;gap:${P.gap}px`;
  body.append(...opts.body);

  panel.append(makeHeader(opts), body);
  root.appendChild(panel);
  (opts.host ?? document.body).appendChild(root);

  let live = true;
  const destroy = (): void => {
    if (!live) return;
    live = false;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pagehide', onPageHide);
    root.remove();
    if (liveMount === mount) liveMount = null;
  };
  /**
   * The document is going away — dispose, so the capture-phase ESC listener
   * cannot outlive the page that owns it.
   *
   * `persisted` IS THE TRAP. A `pagehide` with `persisted: true` means the
   * document is entering the back/forward cache and may be shown again exactly
   * as it is — including any mutation this handler makes. Tearing the root out
   * there would restore a BLANK page on a back-navigation, and there is nothing
   * to clean up anyway: a frozen document's listeners are frozen with it. The
   * listener stays bound (no `once`) so the real termination still reaches
   * here; `destroy()` is what unbinds it.
   */
  function onPageHide(e: PageTransitionEvent): void {
    if (e.persisted) return;
    destroy();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    // The page left the DOM without a teardown: unbind instead of navigating.
    if (!root.isConnected) {
      destroy();
      return;
    }
    e.preventDefault();
    opts.onBack();
  }
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('pagehide', onPageHide);

  const mount: MountedPage = { root, destroy };
  liveMount = mount;
  return mount;
}
