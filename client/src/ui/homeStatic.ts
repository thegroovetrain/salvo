// THE HOME'S SERVED ELEMENTS, ADOPTED (Story 13.1; Eric 2026-11-24: "I don't
// want two versions of the same thing").
//
// The served `index.html` already holds the home's wordmark `<h1>`, copyright
// line, version line, link `<nav>` and social-link group (`seo/homeMarkup.ts`).
// The first time the home mounts, this MOVES those nodes out of the served
// container — never clones, never rebuilds — keeps them here, and removes the
// emptied container. Every later `showHome` re-uses the same nodes: `hide()`
// drops the overlay with them inside, and the next mount moves them into the
// new overlay (the wordmark into the console, the rest into the bottom bar —
// `ui/homeBars.ts`).
//
// Where the served container is absent (a dev server without the plugin's
// output, a bare jsdom test) it parses the SAME `prerenderHome(...)` string —
// the runtime version and `communityLinks()`, which read the same build-time
// env the plugin did — and adopts from that. One builder, one source.
//
// ADOPTED EAGERLY AT BOOT. `main()` calls `servedHome(version)` before the
// resume branch: a resumed match (`tryResumeMatch` → 'resumed') mounts no home,
// and a served container left in place would keep its anchors focusable under
// the opaque `#app` (Shift+Tab from an overlay reached an invisible link). So
// the nodes are taken out at boot and held here, detached — still moved once,
// never cloned — until the player next comes back to port.

import { communityLinks } from './communityLinks.js';
import {
  HOME_COPYRIGHT_ID,
  HOME_LINKS_ID,
  HOME_SOCIAL_ID,
  HOME_VERSION_ID,
  HOME_WORDMARK_ID,
  PRERENDER_ID,
  prerenderHome,
} from '../seo/homeMarkup.js';

/** The home's served elements, once adopted. */
export interface ServedHome {
  /** The wordmark `<h1>`: `HULLCRACKER` + its `.IO` span. */
  wordmark: HTMLElement;
  /** The version line (bottom bar, left, beside the copyright). */
  version: HTMLElement;
  /** The static-page link row (`<nav>` of anchors; bottom bar, center). */
  links: HTMLElement;
  /** The `© {year}` line (bottom bar, left). */
  copyright: HTMLElement;
  /** The icon-only social anchors (bottom bar, right); empty when none is set. */
  social: HTMLElement;
}

const IDS: Record<keyof ServedHome, string> = {
  wordmark: HOME_WORDMARK_ID,
  version: HOME_VERSION_ID,
  links: HOME_LINKS_ID,
  copyright: HOME_COPYRIGHT_ID,
  social: HOME_SOCIAL_ID,
};

let adopted: ServedHome | null = null;

function pick(root: ParentNode): ServedHome | null {
  const out: Partial<ServedHome> = {};
  for (const [key, id] of Object.entries(IDS) as [keyof ServedHome, string][]) {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (el === null) return null;
    out[key] = el;
  }
  return out as ServedHome;
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
  for (const el of Object.values(pieces)) el.remove();
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
