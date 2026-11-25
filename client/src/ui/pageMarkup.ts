// THE STANDARD PAGE CHROME'S MARKUP (Story 7.2, Eric ruling R12; Story 13.1).
//
// ONE VERSION OF EVERY PAGE (Eric 2026-11-24: "I don't want two versions of the
// same thing"). This module is the ONE builder of How to Play's and Privacy's
// page, and it builds an HTML STRING: the `hc-crawlable` Vite plugin writes it
// into the served document at build time, so the HTML the server sends IS the
// page, fully styled before any JavaScript runs. At runtime `ui/page.ts`'s
// `attachPage` only wires behavior onto the served root; it inserts this same
// string itself only when no served root exists (a bare jsdom test).
//
// PURE AND NODE-SAFE: no DOM, no `import.meta.env`, nothing at module scope but
// constants. The Vite config imports it (through `seo/crawlable.ts`).
//
// IT IS DELIBERATELY DUMB. It knows nothing about privacy, analytics, consent,
// the game or the net layer: a title, an optional sub-line, a stack of
// caller-built blocks, and one way back.
//
// THE BED IS THE SETTINGS OVERLAY'S, NOT A NEW ONE (ui/settings.ts:190-215):
// {colors.panel} bed, 1px {colors.hairline} outline, {rounded.lg}, and
// `box-sizing:border-box` beside its own `overflow-y:auto` — amendment 47, the
// container-fit law: under the default content-box the padding and border sit
// OUTSIDE `max-height:100%` and clip the panel's own chrome at every viewport.
//
// THE STYLE STRINGS ARE THE ONES THE DOM BUILDERS WROTE, as `style` attributes.
// Two CSSOM-blob hazards (ui/queueModal.ts) still shape them, because jsdom
// parses a `style` attribute through the same CSSOM a `cssText` write uses: one
// declaration the parser dislikes voids the ENTIRE list, so (1) the
// `border:1px solid var(--x)` SHORTHAND is never used — borders go on as
// separate longhands (`HAIRLINE`) — and (2) the `background:` shorthand is
// never used, the `background-color` LONGHAND is.
//
// COLOUR: every value is an `--hc-*` token or a `registerCss()` ramp entry.
// `tokens.test.ts` fails the suite on a single colour literal under `client/src`.
//
// ESCAPING: every text argument is escaped here (`escapeHtml`); no markup comes
// from a copy module. The `...Html` variants take markup this module built.

import { CLIENT_CONFIG } from '../config.js';
import { escapeHtml } from '../seo/escape.js';
import { BACK_TO_PORT_LABEL } from './siteCopy.js';
import { registerCss } from './theme.js';

const P = CLIENT_CONFIG.page;

/** One element: tag, inline style, already-built inner markup, extra attributes
 *  (values escaped here). */
export function element(tag: string, style: string, inner = '', attrs: Readonly<Record<string, string>> = {}): string {
  const extra = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join('');
  const styleAttr = style === '' ? '' : ` style="${escapeHtml(style)}"`;
  return `<${tag}${extra}${styleAttr}>${inner}</${tag}>`;
}

/** The 1px outline as SEPARATE properties (CSSOM hazard 1, above). */
function hairline(color: string): string {
  return `border-width:1px;border-style:solid;border-color:${color}`;
}

// --- copy registers -----------------------------------------------------------
//
// EXPERIENCE.md:53: "uppercase mono for labels and system lines; sentences only
// in descriptions and How-to-Play". A page's headings are system lines and take
// the mono label register; its PROSE is body copy and takes Geist at `body`.

const PARAGRAPH_CSS = `${registerCss('body')};color:var(--hc-text-primary);line-height:1.6;margin:0`;

/** A section heading — uppercase mono, phosphor (the port's system voice). */
export function pageHeading(text: string): string {
  return element('h2', `${registerCss('label')};color:var(--hc-phosphor);margin:0`, escapeHtml(text));
}

/**
 * A prose paragraph — Geist body, `text-primary`. NEVER `text-muted`:
 * DESIGN.md:153 bars muted from load-bearing copy. `text-secondary` is for
 * genuinely secondary asides (`pageNote`).
 */
export function pageParagraph(text: string): string {
  return pageParagraphHtml(escapeHtml(text));
}

/** A paragraph around markup this module built (a link spliced into prose). */
export function pageParagraphHtml(inner: string): string {
  return element('p', PARAGRAPH_CSS, inner);
}

/** A secondary aside — same ramp one step down, `text-secondary`. */
export function pageNote(text: string): string {
  return element('p', `${registerCss('small')};color:var(--hc-text-secondary);line-height:1.6;margin:0`, escapeHtml(text));
}

/**
 * An inline link — the body register in phosphor, UNDERLINED (phosphor is also
 * the heading colour, so hue alone would not mark a link, and carries nothing
 * for a colour-blind reader). `rel` is set because a page's links point
 * off-site by construction; the target is NOT forced to a new tab.
 */
export function pageLink(text: string, href: string): string {
  const css = [
    registerCss('body'),
    'color:var(--hc-phosphor)',
    'text-decoration:underline',
    'text-underline-offset:2px',
    'cursor:pointer',
  ].join(';');
  return element('a', css, escapeHtml(text), { href, rel: 'noopener noreferrer' });
}

/** A bulleted list of prose items — same register as a paragraph. */
export function pageList(items: readonly string[]): string {
  const lis = items.map((i) => element('li', '', escapeHtml(i))).join('');
  return element('ul', `${registerCss('body')};color:var(--hc-text-primary);line-height:1.6;margin:0;padding-left:22px`, lis);
}

/** A stacked block: heading + its children, at the page's vertical rhythm. */
export function pageSection(heading: string, ...children: string[]): string {
  return element('section', 'display:flex;flex-direction:column;gap:10px', pageHeading(heading) + children.join(''));
}

// --- the controls table -------------------------------------------------------
//
// ERIC RULING (2026-08-19): keys on a page render as KEYCAP BOXES, matching the
// in-game treatment — never as plain text. The canonical keycap is the refit
// card's digit chip (ui/upgradeMenu.ts's `KEY_CHIP_CSS`): a 22px square, a 1px
// `currentColor` hairline, `400 14px` mono. RESTATED here, never imported: a
// page must not pull the spend window in to draw a box.

/** One row of the controls table. */
export interface KeyBinding {
  /** One or more keycaps for this row, e.g. ['W','S'] or ['TAB'] or ['1','2','3','4']. */
  keys: readonly string[];
  /** What the key does, in sentence case. */
  action: string;
}

const KEYCAP_SIZE_PX = 22;

const KEYCAP_CSS = [
  'display:inline-flex',
  'align-items:center',
  'justify-content:center',
  // `min-width` rather than `width`: a wide cap (TAB, ENTER, SHIFT) grows
  // sideways while the height and the type never move.
  `min-width:${KEYCAP_SIZE_PX}px`,
  `height:${KEYCAP_SIZE_PX}px`,
  'padding:0 5px',
  'box-sizing:border-box',
  'flex:none',
  'color:var(--hc-phosphor)',
  'font:400 14px var(--hc-font-mono)',
  'white-space:nowrap',
  hairline('currentColor'),
].join(';');

function keyRow(row: KeyBinding): string {
  const caps = row.keys.map((k) => element('span', KEYCAP_CSS, escapeHtml(k))).join('');
  const keys = element(
    'td',
    'padding:5px 16px 5px 0;vertical-align:top;white-space:nowrap;width:1%',
    element('div', 'display:flex;align-items:center;gap:6px', caps),
  );
  const action = element(
    'td',
    `${registerCss('body')};color:var(--hc-text-primary);line-height:1.6;padding:5px 0;vertical-align:top`,
    escapeHtml(row.action),
  );
  return element('tr', '', keys + action);
}

/**
 * The controls table — one row per binding: its keycaps, then what they do. A
 * real `<table>`: the keys cell is `nowrap` and content-sized (`width:1%`), the
 * action cell takes the rest and wraps, so the table never widens past the
 * 1100px column (no horizontal scrollbar at the 1366x768 floor).
 */
export function keyTable(rows: readonly KeyBinding[]): string {
  return element('table', 'border-collapse:collapse;width:100%;max-width:100%', element('tbody', '', rows.map(keyRow).join('')));
}

// --- the stat table -----------------------------------------------------------
//
// ERIC RULING (2026-10-01): each weapon on How-to-Play gets a stat table of its
// exact attributes at each tier. A header row of column labels (skipped when
// every label is blank), the row label first, values right-aligned. Mono at the
// `hudMicro` register, 1px hairline rules as longhands, and an `overflow-x:auto`
// wrapper so a five-tier table scrolls inside itself at phone width.

/** Shape-compatible with `how-to-play/weaponTables.ts`'s `StatTable`. */
export interface StatTableData {
  columns: readonly string[];
  rows: readonly { label: string; values: readonly string[] }[];
}

const STAT_CELL_CSS = `${registerCss('hudMicro')};padding:4px 10px;white-space:nowrap;line-height:1.4`;
const STAT_RULE = 'border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:var(--hc-hairline)';

function statCell(tag: 'td' | 'th', text: string, align: 'left' | 'right', color: string): string {
  const attrs: Record<string, string> = tag === 'th' && text !== '' ? { scope: align === 'left' ? 'row' : 'col' } : {};
  return element(tag, `${STAT_CELL_CSS};text-align:${align};color:${color};${STAT_RULE}`, escapeHtml(text), attrs);
}

function statHead(columns: readonly string[]): string {
  if (!columns.some((c) => c.length > 0)) return '';
  const cells = [statCell('th', '', 'left', 'var(--hc-text-secondary)')];
  for (const c of columns) cells.push(statCell('th', c, 'right', 'var(--hc-text-secondary)'));
  return element('thead', '', element('tr', '', cells.join('')));
}

function statRow(row: StatTableData['rows'][number]): string {
  const cells = [statCell('th', row.label, 'left', 'var(--hc-text-secondary)')];
  for (const v of row.values) cells.push(statCell('td', v, 'right', 'var(--hc-text-primary)'));
  return element('tr', '', cells.join(''));
}

/** A stat table (How-to-Play's weapon tables): row label, then one value per column. */
export function statTable(table: StatTableData): string {
  const body = element('tbody', '', table.rows.map(statRow).join(''));
  const el = element('table', 'border-collapse:collapse;font-variant-numeric:tabular-nums', statHead(table.columns) + body);
  return element('div', 'overflow-x:auto;max-width:100%', el);
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
  // No fullscreen dim — a standalone page has nothing behind it to dim.
  'background-color:transparent',
].join(';');

const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  `gap:${P.gap}px`,
  `width:${P.maxWidthPx}px`,
  `max-width:${P.maxWidthPx}px`,
  'max-height:100%',
  // Amendment 47, the container-fit law.
  'box-sizing:border-box',
  'overflow-y:auto',
  `padding:${P.pad}px`,
  'background-color:var(--hc-panel)',
  `border-radius:${P.radius}px`,
  'font-family:var(--hc-font-mono)',
  'color:var(--hc-text-primary)',
  hairline('var(--hc-hairline)'),
].join(';');

/** Mockup F3 `.res-key` — the boxed key glyph before the back label
 *  (ui/results.ts's own chip, restated so a page needs no results import). */
function keyChip(glyph: string): string {
  return element('span', 'display:inline-block;padding:0 5px;border:1px solid currentColor;margin-right:7px;font-size:10px', escapeHtml(glyph));
}

/**
 * The back affordance — {components.button-primary}'s shape in its SECONDARY
 * treatment: outline + no glow, in phosphor (ui/results.ts:733-770's unlit
 * precedent). A page's way out is not its call to action.
 *
 * A REAL `<a href="/">` IN A `<nav>` (Story 13.1): it used to be a `<button>`
 * whose click ran `location.href = '/'`, so the anchor is the same navigation
 * and works with scripting off. Explicitly `/`, never `history.back()` — a
 * reader who landed here from a search result would leave the site. It wears
 * the button's declarations plus the three a `<button>` gets from the UA and an
 * `<a>` does not (`display:inline-block`, `text-decoration:none`,
 * `text-align:center`); the `<nav>` is a flex box so the link sits in the header
 * row exactly as the button's own flex item did.
 */
function backLink(label: string): string {
  const css = [
    'display:inline-block',
    'padding:10px 18px',
    'background-color:transparent', // never a filled slab
    `border-radius:${CLIENT_CONFIG.results.controlRadius}px`,
    'color:var(--hc-phosphor)',
    'font:600 13px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'text-decoration:none',
    'text-align:center',
    'cursor:pointer',
    'white-space:nowrap',
    hairline('var(--hc-phosphor)'),
  ].join(';');
  return element('nav', 'display:flex', element('a', css, keyChip('ESC') + escapeHtml(label), { href: '/' }));
}

/** What a page is made of. */
export interface PageMarkupOptions {
  /** The root's DOM id — how `attachPage` finds the served page. */
  id: string;
  /** The page title — uppercase mono, the port's SYSTEM register. */
  title: string;
  /** Optional sub-line under the title (a "last updated" stamp). */
  subtitle?: string;
  /** The page body: blocks built by this module, stacked in order. */
  body: readonly string[];
  /** Back-link words. Defaults to the port's own word for it. */
  backLabel?: string;
}

/** Title + optional sub-line on the left, the way back on the right. */
function header(opts: PageMarkupOptions): string {
  const title = element(
    'h1',
    `${registerCss('hudReadout')};color:var(--hc-phosphor);letter-spacing:0.18em;text-transform:uppercase;margin:0`,
    escapeHtml(opts.title),
  );
  const sub =
    opts.subtitle === undefined
      ? ''
      : element('p', `${registerCss('hudMicro')};color:var(--hc-text-secondary);margin:0`, escapeHtml(opts.subtitle));
  const titles = element('div', 'display:flex;flex-direction:column;gap:6px', title + sub);
  return element(
    'header',
    'display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap',
    titles + backLink(opts.backLabel ?? BACK_TO_PORT_LABEL),
  );
}

/**
 * THE WHOLE PAGE: a fixed full-viewport root centring the panel, the header,
 * and the body as the document's `<main>`.
 */
export function pageMarkup(opts: PageMarkupOptions): string {
  const main = element('main', `display:flex;flex-direction:column;gap:${P.gap}px`, opts.body.join(''));
  const panel = element('div', PANEL_CSS, header(opts) + main);
  return element('div', ROOT_CSS, panel, { id: opts.id });
}
