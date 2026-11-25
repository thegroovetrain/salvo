// THE HOW-TO-PLAY PAGE, AS ITS ONE BUILD STRING (Story 7.3; Story 13.1).
//
// The whole page — copy, keycaps, every derived stat table and every glyph —
// built ONCE by the shared page chrome (`ui/pageMarkup.ts`). The `hc-crawlable`
// Vite plugin writes it into `dist/how-to-play/index.html` at build time, so
// the served HTML IS the page; `main.ts` only attaches behavior to it.
//
// Pure and Node-safe (the Vite config imports it): copy, the stat-table data
// (`weaponTables.ts`, derived from `effectiveStats`, the sim's one stat
// function, so the page can never disagree with the refit card) and the glyph
// path data (`render/equipmentIcons.ts`). No DOM.
//
// KEYS RENDER AS KEYCAPS, NOT AS TEXT (Eric ruling 2026-08-19).

import {
  element,
  keyTable,
  pageLink,
  pageMarkup,
  pageParagraph,
  pageParagraphHtml,
  pageSection,
  statTable,
} from '../ui/pageMarkup.js';
import { registerCss } from '../ui/theme.js';
import { escapeHtml } from '../seo/escape.js';
import {
  HOWTO_FOOTER_LEAD,
  HOWTO_FOOTER_LINK,
  HOWTO_FOOTER_TAIL,
  HOWTO_SECTIONS,
  HOWTO_TITLE,
  type HowToEntry,
  type HowToSection,
} from './copy.js';
import { abilityTable, shipUpgradeTable, tierTable, type StatTable } from './weaponTables.js';
import { CLIENT_CONFIG } from '../config.js';
import { equipmentGlyphSvgMarkup } from '../render/equipmentIcons.js';

/** The page root's DOM id — how `attachPage` finds the served page. */
export const HOWTO_PAGE_ID = 'how-to-play-page';

/** An entry's derived table, or null (`'none'`: a one-off card has no table). */
function entryTable(entry: HowToEntry): StatTable | null {
  switch (entry.table) {
    case 'tier':
      return tierTable(entry.lineId);
    case 'shipUpgrade':
      return shipUpgradeTable(entry.lineId);
    case 'ability':
      return abilityTable(entry.lineId);
    case 'none':
      return null;
  }
}

/**
 * The glyph id an entry draws — its LINE id, the SAME id the refit card feeds
 * `equipmentGlyphSvg`. The one glyph lookup answers every card line since
 * cycle 162, so there is nothing to map.
 */
export function entryGlyphId(entry: HowToEntry): string | null {
  return entry.lineId;
}

const GLYPH_CSS = 'display:inline-block;flex:none;color:var(--hc-phosphor)';

/** An entry's name — the uppercase mono system register — with its glyph (the
 *  retired hotbar's icon size, phosphor via currentColor) before it. */
function entryName(entry: HowToEntry): string {
  const id = entryGlyphId(entry);
  const svg = id === null ? null : equipmentGlyphSvgMarkup(id, CLIENT_CONFIG.page.glyph, escapeHtml(GLYPH_CSS));
  return element(
    'h3',
    `${registerCss('hudMicro')};color:var(--hc-phosphor);margin:8px 0 0;display:flex;align-items:center;gap:8px`,
    (svg ?? '') + escapeHtml(entry.name),
  );
}

/** One entry → its name line, its description, then its stat table. */
function entryBlocks(entry: HowToEntry): string[] {
  const blocks = [entryName(entry), pageParagraph(entry.description)];
  const table = entryTable(entry);
  if (table !== null) blocks.push(statTable(table));
  return blocks;
}

/** One copy section → one page block: prose, keycaps, entries, closing prose. */
function sectionBlock(section: HowToSection): string {
  const children = (section.paragraphs ?? []).map(pageParagraph);
  if (section.keys !== undefined) children.push(keyTable(section.keys));
  for (const entry of section.entries ?? []) children.push(...entryBlocks(entry));
  children.push(...(section.tail ?? []).map(pageParagraph));
  return pageSection(section.heading, ...children);
}

/** The closing line, the one place this page links onward. */
function footerBlock(): string {
  const link = pageLink(HOWTO_FOOTER_LINK, CLIENT_CONFIG.consent.policyHref);
  return pageParagraphHtml(escapeHtml(HOWTO_FOOTER_LEAD) + link + escapeHtml(HOWTO_FOOTER_TAIL));
}

/** The whole How-to-Play page, as served. */
export function howToPlayMarkup(): string {
  return pageMarkup({
    id: HOWTO_PAGE_ID,
    title: HOWTO_TITLE,
    body: [...HOWTO_SECTIONS.map(sectionBlock), footerBlock()],
  });
}
