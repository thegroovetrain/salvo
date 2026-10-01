// THE HOW-TO-PLAY PAGE'S BOOT (Story 7.3, FR39 / UX-DR29).
//
// A THIRD VITE ENTRY, exactly as `/privacy` is a second one, and for the reason
// recorded in `src/privacy/main.ts`: a file under `public/` cannot import the
// token bridge, so it could not reuse the page chrome at all.
// `client/how-to-play/index.html` is a Rollup entry, which emits
// `dist/how-to-play/index.html`, which `express.static` serves at
// `/how-to-play`.
//
// THERE IS NO GAME HERE. No Pixi, no socket, no analytics: this module imports
// the theme bridge, the page chrome, the copy and its stat tables. Rollup gives
// the page its own chunk, so a reader never downloads the renderer to read the
// manual.
//
// THE "NO SHARED SIM" RULE IS SUPERSEDED (Eric ruling 2026-10-01: "give me a
// stat table showing its exact attributes at each tier"). The manual now
// derives every table from `effectiveStats` — the sim's one stat function —
// through `weaponTables.ts` and the refit card's own row builders, so the page
// can never disagree with the card. That pulls `@salvo/shared`'s pure stat
// fold into this chunk; it still pulls no renderer and no socket.
//
// `injectTheme()` MUST RUN FIRST, exactly as it does in `main.ts` and the
// privacy page: every style below is written in `var(--hc-*)`, and those
// properties do not exist until the bridge publishes them onto `:root`.
//
// KEYS RENDER AS KEYCAPS, NOT AS TEXT (Eric ruling 2026-08-19). `makeKeyTable`
// wears the in-game refit-card chip — a 22px square in mono — so "keys look
// like this" reads as one system across the hotbar, the refit cards and this
// page.

import { injectTheme, registerCss } from '../ui/theme.js';
import {
  goHome,
  makeKeyTable,
  makePageLink,
  makePageParagraph,
  makePageSection,
  makeStatTable,
  renderPage,
} from '../ui/page.js';
import {
  HOWTO_FOOTER_LEAD,
  HOWTO_FOOTER_LINK,
  HOWTO_FOOTER_TAIL,
  HOWTO_SECTIONS,
  HOWTO_TITLE,
  type HowToEntry,
  type HowToSection,
} from './copy.js';
import { consumableTable, shipUpgradeTable, tierTable, type StatTable } from './weaponTables.js';
import { CLIENT_CONFIG } from '../config.js';

/** An entry's derived table, or null (a consumable with no live rows). */
function entryTable(entry: HowToEntry): StatTable | null {
  if (entry.table === 'tier') return tierTable(entry.lineId);
  if (entry.table === 'shipUpgrade') return shipUpgradeTable(entry.lineId);
  return consumableTable(entry.lineId);
}

/** An entry's name — the uppercase mono system register, like the headings. */
function entryName(text: string): HTMLElement {
  const el = document.createElement('h3');
  el.textContent = text;
  el.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);margin:8px 0 0`;
  return el;
}

/** One entry → its name line, its description, then its stat table. */
function entryBlocks(entry: HowToEntry): HTMLElement[] {
  const blocks = [entryName(entry.name), makePageParagraph(entry.description)];
  const table = entryTable(entry);
  if (table !== null) blocks.push(makeStatTable(table));
  return blocks;
}

/** One copy section → one page block: prose, keycaps, entries, closing prose. */
function sectionBlock(section: HowToSection): HTMLElement {
  const children: HTMLElement[] = (section.paragraphs ?? []).map(makePageParagraph);
  if (section.keys !== undefined) children.push(makeKeyTable(section.keys));
  for (const entry of section.entries ?? []) children.push(...entryBlocks(entry));
  children.push(...(section.tail ?? []).map(makePageParagraph));
  return makePageSection(section.heading, ...children);
}

/**
 * The closing line, which is the one place this page links onward. Built here
 * rather than in `copy.ts` because a link is DOM, and the copy module stays
 * pure data so Eric's copy pass never has to read markup.
 */
function footerBlock(): HTMLElement {
  const p = makePageParagraph(HOWTO_FOOTER_LEAD);
  p.appendChild(makePageLink(HOWTO_FOOTER_LINK, CLIENT_CONFIG.consent.policyHref));
  p.appendChild(document.createTextNode(HOWTO_FOOTER_TAIL));
  return p;
}

/** Build and mount the page. Exported so a test can drive it without the
 *  module-scope boot below (which only runs in a browser). */
export function mountHowToPlayPage(): void {
  injectTheme();
  renderPage({
    id: 'how-to-play-page',
    title: HOWTO_TITLE,
    body: [...HOWTO_SECTIONS.map(sectionBlock), footerBlock()],
    // Back means the PORT, never `history.back()` — a reader can arrive here
    // straight from a search result, and for them "back" leaves the site.
    onBack: goHome,
  });
}

mountHowToPlayPage();
