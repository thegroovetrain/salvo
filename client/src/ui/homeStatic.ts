// THE HOME'S SERVED ELEMENTS, ADOPTED (Story 13.1; Eric 2026-11-24: "I don't
// want two versions of the same thing").
//
// The served `index.html` already holds the home's wordmark `<h1>`, version line
// and link `<nav>` (`seo/homeMarkup.ts`). The first time the home mounts, this
// MOVES those nodes out of the served container — never clones, never rebuilds —
// keeps them here, and removes the emptied container. Every later `showHome`
// re-uses the same nodes: `hide()` drops the overlay with them inside, and the
// next mount moves them into the new overlay.
//
// Where the served container is absent (a dev server without the plugin's
// output, a bare jsdom test) it parses the SAME `prerenderHome(...)` string —
// the runtime version and `communityLinks()`, which read the same build-time
// env the plugin did — and adopts from that. One builder, one source.
//
// On a resumed match (`tryResumeMatch` → 'resumed') no home mounts, so the
// served container simply stays under the opaque, fixed `#app`: one copy,
// invisible, adopted whenever the player next comes back to port.

import { communityLinks } from './communityLinks.js';
import {
  HOME_LINKS_ID,
  HOME_VERSION_ID,
  HOME_WORDMARK_ID,
  PRERENDER_ID,
  prerenderHome,
} from '../seo/homeMarkup.js';

/** The home's three served elements, once adopted. */
export interface ServedHome {
  /** The wordmark `<h1>`: `HULLCRACKER` + its `.IO` span. */
  wordmark: HTMLElement;
  /** The version line. */
  version: HTMLElement;
  /** The underplay link row (`<nav>` of anchors). */
  links: HTMLElement;
}

let adopted: ServedHome | null = null;

function pick(root: ParentNode): ServedHome | null {
  const wordmark = root.querySelector<HTMLElement>(`#${HOME_WORDMARK_ID}`);
  const version = root.querySelector<HTMLElement>(`#${HOME_VERSION_ID}`);
  const links = root.querySelector<HTMLElement>(`#${HOME_LINKS_ID}`);
  if (wordmark === null || version === null || links === null) return null;
  return { wordmark, version, links };
}

/** The same served string, parsed off-document (never painted). */
function built(version: string): ServedHome {
  const tpl = document.createElement('template');
  tpl.innerHTML = prerenderHome({ version, community: communityLinks() });
  const pieces = pick(tpl.content);
  if (pieces === null) throw new Error('prerenderHome lost an adopted element');
  return pieces;
}

function adopt(version: string): ServedHome {
  const container = document.getElementById(PRERENDER_ID);
  const pieces = (container !== null ? pick(container) : null) ?? built(version);
  for (const el of [pieces.wordmark, pieces.version, pieces.links]) el.remove();
  // Emptied (or, in an edge that never ships, stale): either way it must not
  // leave a second h1 behind under `#app`.
  container?.remove();
  return pieces;
}

/** The home's served elements: adopted on the first call, the same nodes after. */
export function servedHome(version: string): ServedHome {
  adopted ??= adopt(version);
  return adopted;
}

/** Forget the adopted nodes, as a fresh document load would. Tests only: a
 *  suite that stubs the community env must see a home built from it. */
export function forgetServedHome(): void {
  adopted = null;
}
