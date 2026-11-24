// THE BUILD-TIME PRERENDER (Story 13.1, AC 1-4): each served document's words,
// as static markup, from the SAME copy modules the live pages build from.
//
// Pure string building, Node-safe: the `hc-crawlable` plugin in
// `client/vite.config.ts` runs it at config time. It imports copy and config
// only — never a `main.ts` (they self-boot), never a DOM builder.
//
// SHAPE: one `<div id={PRERENDER_ID}>` per document, holding a `<main>` (the
// single `<h1>` and the sections) and a `<nav>` (real `<a href>`s). The live
// renderer removes the block when it mounts (`seo/takeover.ts`).
//
// MIRRORS THE LIVE TREE'S TEXT, element for element where it matters: section
// `<h2>`, entry `<h3>` + its description `<p>`, key rows as a table of `<kbd>`s
// and the action, the footer `<p>` with its link spliced between lead and tail.
// The live renderer applies no string transform (uppercase is CSS only), so the
// prerender writes each copy string raw (escaped). The stat tables and glyphs
// are derived data, not copy, and are left out.

import {
  HOWTO_FOOTER_LEAD,
  HOWTO_FOOTER_LINK,
  HOWTO_FOOTER_TAIL,
  HOWTO_SECTIONS,
  HOWTO_TITLE,
  type HowToEntry,
  type HowToSection,
} from '../how-to-play/copy.js';
import {
  POLICY_SECTIONS,
  POLICY_TITLE,
  POLICY_UPDATED,
  type PolicySection,
} from '../privacy/policyCopy.js';
import type { KeyBinding } from '../ui/page.js';
import { CLIENT_CONFIG } from '../config.js';
import { BACK_TO_PORT_LABEL } from '../ui/siteCopy.js';
import { escapeHtml } from './escape.js';
import { PRERENDER_ID } from './takeover.js';

/** An element holding escaped text. */
function text(tag: string, content: string): string {
  return `<${tag}>${escapeHtml(content)}</${tag}>`;
}

/** A real anchor. */
function anchor(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/** The one block per document: `<main>` content, then the `<nav>` links. */
function block(main: string, links: readonly string[]): string {
  return `<div id="${PRERENDER_ID}"><main>${main}</main><nav>${links.join(' ')}</nav></div>`;
}

function paragraphs(list: readonly string[] | undefined): string {
  return (list ?? []).map((p) => text('p', p)).join('');
}

function section(heading: string, inner: string): string {
  return `<section>${text('h2', heading)}${inner}</section>`;
}

/** The back link every static page carries, in the live back button's words. */
function backLinks(): string[] {
  return [anchor(BACK_TO_PORT_LABEL, '/')];
}

// --- how to play --------------------------------------------------------------

function keyRow(row: KeyBinding): string {
  const caps = row.keys.map((k) => text('kbd', k)).join(' ');
  return `<tr><td>${caps}</td>${text('td', row.action)}</tr>`;
}

function keyTable(rows: readonly KeyBinding[] | undefined): string {
  if (rows === undefined) return '';
  return `<table><tbody>${rows.map(keyRow).join('')}</tbody></table>`;
}

function entry(e: HowToEntry): string {
  return text('h3', e.name) + text('p', e.description);
}

function howToSection(s: HowToSection): string {
  const entries = (s.entries ?? []).map(entry).join('');
  return section(s.heading, paragraphs(s.paragraphs) + keyTable(s.keys) + entries + paragraphs(s.tail));
}

/** The footer line, composed exactly as `how-to-play/main.ts` composes it. */
function howToFooter(): string {
  const link = anchor(HOWTO_FOOTER_LINK, CLIENT_CONFIG.consent.policyHref);
  return `<p>${escapeHtml(HOWTO_FOOTER_LEAD)}${link}${escapeHtml(HOWTO_FOOTER_TAIL)}</p>`;
}

/** How to Play: title, every section, the footer, the way back. */
export function prerenderHowToPlay(): string {
  const main = text('h1', HOWTO_TITLE) + HOWTO_SECTIONS.map(howToSection).join('') + howToFooter();
  return block(main, backLinks());
}

// --- privacy ------------------------------------------------------------------

function bulletList(items: readonly string[] | undefined): string {
  if (items === undefined) return '';
  return `<ul>${items.map((i) => text('li', i)).join('')}</ul>`;
}

function policySection(s: PolicySection): string {
  return section(s.heading, paragraphs(s.paragraphs) + bulletList(s.bullets) + paragraphs(s.trailing));
}

/** Privacy: title, the updated line, every section, the way back. */
export function prerenderPrivacy(): string {
  const main = text('h1', POLICY_TITLE) + text('p', POLICY_UPDATED) + POLICY_SECTIONS.map(policySection).join('');
  return block(main, backLinks());
}
