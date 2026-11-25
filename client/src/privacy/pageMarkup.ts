// THE PRIVACY PAGE, AS ITS ONE BUILD STRING (Story 7.2, Eric ruling R8;
// Story 13.1).
//
// Built ONCE by the shared page chrome (`ui/pageMarkup.ts`); the `hc-crawlable`
// Vite plugin writes it into `dist/privacy/index.html` at build time, so the
// served HTML IS the policy; `main.ts` only attaches behavior to it. Pure and
// Node-safe: the copy and the chrome, nothing else.

import { pageList, pageMarkup, pageParagraph, pageSection } from '../ui/pageMarkup.js';
import { POLICY_SECTIONS, POLICY_TITLE, POLICY_UPDATED, type PolicySection } from './policyCopy.js';

/** The page root's DOM id — how `attachPage` finds the served page. */
export const PRIVACY_PAGE_ID = 'privacy-page';

/** One policy section → one page block, in the ratified copy registers. */
function sectionBlock(section: PolicySection): string {
  const children = (section.paragraphs ?? []).map(pageParagraph);
  if (section.bullets !== undefined) children.push(pageList(section.bullets));
  for (const t of section.trailing ?? []) children.push(pageParagraph(t));
  return pageSection(section.heading, ...children);
}

/** The whole privacy page, as served. */
export function privacyMarkup(): string {
  return pageMarkup({
    id: PRIVACY_PAGE_ID,
    title: POLICY_TITLE,
    subtitle: POLICY_UPDATED,
    body: POLICY_SECTIONS.map(sectionBlock),
  });
}
