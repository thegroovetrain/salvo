// THE HOME IS ONE VERSION (Story 13.1; Eric 2026-11-24). Structural pins only:
// the served wordmark, version line and link row ARE the live home's elements —
// moved in on the first mount, reused on every later one, never cloned, never
// rebuilt — and the served container is gone once they are taken. No copy is
// pinned: every expected word is read from the copy module.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showHome } from '../ui/home.js';
import { forgetServedHome, servedHome } from '../ui/homeStatic.js';
import { communityLinks } from '../ui/communityLinks.js';
import {
  HOME_COPYRIGHT_ID,
  HOME_LINKS_ID,
  HOME_SOCIAL_ID,
  HOME_VERSION_ID,
  HOME_WORDMARK_ID,
  prerenderHome,
} from '../seo/homeMarkup.js';
import { PRERENDER_ID } from '../seo/homeMarkup.js';
import { HOWTO_HREF, WORDMARK_TLD, copyrightLine, wordmarkText } from '../ui/siteCopy.js';
import type { CommunityLink } from '../ui/communityLinks.js';

const VERSION = '0.0.0-test';

const COMMUNITY: readonly CommunityLink[] = [
  { service: 'discord', name: 'Discord', href: 'https://discord.gg/abc' },
  { service: 'reddit', name: 'Reddit', href: 'https://www.reddit.com/r/abc/' },
];

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Serve the home as the build does: the container first thing in `<body>`. */
function serve(): void {
  document.body.insertAdjacentHTML('afterbegin', prerenderHome({ version: VERSION, community: communityLinks() }));
}

function served(id: string): Element | null {
  return document.getElementById(PRERENDER_ID)?.querySelector(`#${id}`) ?? null;
}

const menu = (): HTMLElement | null => document.getElementById('main-menu');

describe('the served home markup', () => {
  it('the h1 is the live wordmark structure: the name, then the suffix span', () => {
    const doc = parse(prerenderHome({ version: VERSION, community: [] }));
    const h1 = doc.getElementById(HOME_WORDMARK_ID);
    expect(h1?.tagName).toBe('H1');
    expect(h1?.textContent).toBe(wordmarkText());
    expect(h1?.children).toHaveLength(1);
    expect(h1?.firstElementChild?.tagName).toBe('SPAN');
    expect(h1?.firstElementChild?.textContent).toBe(WORDMARK_TLD);
    expect(doc.getElementById(HOME_VERSION_ID)?.textContent).toContain(VERSION);
    expect(doc.getElementById(HOME_LINKS_ID)?.tagName).toBe('NAV');
  });

  it('social anchors are off-site brand icons outside the nav; the static pages are not', () => {
    const doc = parse(prerenderHome({ version: VERSION, community: COMMUNITY }));
    const nav = [...doc.querySelectorAll(`#${HOME_LINKS_ID} a`)];
    expect(nav).toHaveLength(2);
    for (const a of nav) expect(a.hasAttribute('target')).toBe(false);
    const social = [...doc.querySelectorAll(`#${HOME_SOCIAL_ID} a`)];
    expect(social.map((a) => a.getAttribute('href'))).toEqual(COMMUNITY.map((c) => c.href));
    for (const a of social) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('aria-label')).toBeTruthy();
      expect(a.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
    }
  });

  it('no community link set: the social group is served empty', () => {
    const doc = parse(prerenderHome({ version: VERSION, community: [] }));
    expect(doc.getElementById(HOME_SOCIAL_ID)?.children).toHaveLength(0);
  });

  it('serves the copyright line for the given year, and the build year by default', () => {
    const at = (year?: number): string | null | undefined =>
      parse(prerenderHome({ version: VERSION, community: [], year })).getElementById(HOME_COPYRIGHT_ID)?.textContent;
    expect(at(1999)).toBe(copyrightLine(1999));
    expect(at()).toBe(copyrightLine(new Date().getFullYear()));
  });

  it('the copyright, version, nav and social group are the served footer, in bar order', () => {
    const doc = parse(prerenderHome({ version: VERSION, community: COMMUNITY }));
    const ids = [...(doc.querySelector('footer')?.children ?? [])].map((c) => c.id);
    expect(ids).toEqual([HOME_COPYRIGHT_ID, HOME_VERSION_ID, HOME_LINKS_ID, HOME_SOCIAL_ID]);
    expect(doc.querySelectorAll(`#${HOME_VERSION_ID}`)).toHaveLength(1);
  });
});

describe('the live home adopts the served elements', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_DISCORD_INVITE', '');
    vi.stubEnv('VITE_SUBREDDIT', '');
    forgetServedHome();
  });
  afterEach(() => {
    menu()?.remove();
    document.getElementById(PRERENDER_ID)?.remove();
    vi.unstubAllEnvs();
  });

  it('moves the served h1, version line and nav into the home; the container is gone', () => {
    serve();
    const h1 = served(HOME_WORDMARK_ID);
    const ver = served(HOME_VERSION_ID);
    const nav = served(HOME_LINKS_ID);
    showHome(VERSION, vi.fn());
    expect(document.getElementById(PRERENDER_ID)).toBeNull();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')).toBe(h1);
    expect(menu()?.contains(h1)).toBe(true);
    expect(menu()?.contains(ver)).toBe(true);
    expect(menu()?.contains(nav)).toBe(true);
    expect(menu()?.querySelector(`nav a[href="${HOWTO_HREF}"]`)).not.toBeNull();
  });

  // Eric ruling 2026-11-25 ("A3 · Banded Bars"): the home is a header / main /
  // footer frame. The main is the console row (wordmark + the console column);
  // the nav is in the footer.
  it('the home is header, main, footer in that order: one h1, one main, one nav (in the footer)', () => {
    serve();
    showHome(VERSION, vi.fn());
    expect([...(menu()?.children ?? [])].map((c) => c.tagName)).toEqual(['HEADER', 'MAIN', 'FOOTER']);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('nav')).toHaveLength(1);
    expect(menu()?.querySelector('main input')).not.toBeNull();
    expect(menu()?.querySelector('main h1')).not.toBeNull();
    expect(menu()?.querySelector('footer nav')).not.toBeNull();
  });

  it('the copyright, version and social group are the served nodes, in the bottom bar', () => {
    vi.stubEnv('VITE_DISCORD_INVITE', 'abc123');
    vi.stubEnv('VITE_SUBREDDIT', 'hullcracker');
    serve();
    const copy = served(HOME_COPYRIGHT_ID);
    const ver = served(HOME_VERSION_ID);
    const social = served(HOME_SOCIAL_ID);
    const anchors = [...(social?.querySelectorAll('a') ?? [])];
    expect(anchors).toHaveLength(2);
    showHome(VERSION, vi.fn());
    const footer = menu()?.querySelector('footer');
    for (const el of [copy, ver, social, ...anchors]) expect(footer?.contains(el)).toBe(true);
    expect(document.getElementById(HOME_COPYRIGHT_ID)).toBe(copy);
    expect(document.querySelectorAll(`#${HOME_VERSION_ID}`)).toHaveLength(1);
    // Left slot: the copyright then the version; right slot: the social group.
    expect([...(footer?.children[0].children ?? [])]).toEqual([copy, ver]);
    expect(footer?.children[2].firstElementChild).toBe(social);
  });

  it('hide then show again re-uses the same nodes, still one h1', () => {
    serve();
    const h1 = served(HOME_WORDMARK_ID);
    const nav = served(HOME_LINKS_ID);
    showHome(VERSION, vi.fn()).hide();
    expect(menu()).toBeNull();
    showHome(VERSION, vi.fn());
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')).toBe(h1);
    expect(document.querySelector('nav')).toBe(nav);
  });

  // A resumed match mounts no home, so `main()` adopts at boot, before the
  // resume branch: the served anchors must not stay focusable under `#app`.
  it('adopting at boot (no home mounted) leaves no served link in the document', () => {
    serve();
    const h1 = served(HOME_WORDMARK_ID);
    const nav = served(HOME_LINKS_ID);
    const pieces = servedHome(VERSION);
    expect(document.getElementById(PRERENDER_ID)).toBeNull();
    expect(pieces.wordmark).toBe(h1);
    expect(pieces.links).toBe(nav);
    for (const a of document.querySelectorAll('a')) {
      expect([pieces.wordmark, pieces.version, pieces.links].some((p) => p.contains(a))).toBe(true);
    }
    for (const p of [pieces.wordmark, pieces.version, pieces.links]) expect(p.isConnected).toBe(false);
    // The later home takes the SAME held nodes.
    showHome(VERSION, vi.fn());
    expect(menu()?.contains(h1)).toBe(true);
    expect(menu()?.contains(nav)).toBe(true);
  });

  it('with no served container it adopts from the same builder', () => {
    showHome(VERSION, vi.fn());
    const h1 = document.querySelector('h1');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(h1?.id).toBe(HOME_WORDMARK_ID);
    expect(h1?.textContent).toBe(wordmarkText());
    expect(menu()?.querySelector(`nav#${HOME_LINKS_ID} a[href="${HOWTO_HREF}"]`)).not.toBeNull();
    menu()?.remove();
    showHome(VERSION, vi.fn());
    expect(document.querySelector('h1')).toBe(h1);
  });

  it('the adopted h1 and version line have no UA margin (pixel parity with the divs)', () => {
    serve();
    showHome(VERSION, vi.fn());
    expect((document.getElementById(HOME_WORDMARK_ID) as HTMLElement).style.margin).toBe('0px');
    expect((document.getElementById(HOME_VERSION_ID) as HTMLElement).style.margin).toBe('0px');
  });
});
