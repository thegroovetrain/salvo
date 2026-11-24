// THE HOME IS ONE VERSION (Story 13.1; Eric 2026-11-24). Structural pins only:
// the served wordmark, version line and link row ARE the live home's elements —
// moved in on the first mount, reused on every later one, never cloned, never
// rebuilt — and the served container is gone once they are taken. No copy is
// pinned: every expected word is read from the copy module.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showHome } from '../ui/home.js';
import { forgetServedHome } from '../ui/homeStatic.js';
import { communityLinks } from '../ui/communityLinks.js';
import { HOME_LINKS_ID, HOME_VERSION_ID, HOME_WORDMARK_ID, prerenderHome } from '../seo/homeMarkup.js';
import { PRERENDER_ID } from '../seo/takeover.js';
import { HOWTO_HREF, WORDMARK_TLD, wordmarkText } from '../ui/siteCopy.js';

const VERSION = '0.0.0-test';

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

  it('community anchors are off-site like the live ones; the static pages are not', () => {
    const community = [
      { label: 'DISCORD' as const, href: 'https://discord.gg/abc' },
      { label: 'REDDIT' as const, href: 'https://www.reddit.com/r/abc/' },
    ];
    const doc = parse(prerenderHome({ version: VERSION, community }));
    const anchors = [...doc.querySelectorAll(`#${HOME_LINKS_ID} a`)];
    expect(anchors).toHaveLength(4);
    for (const a of anchors.slice(0, 2)) expect(a.hasAttribute('target')).toBe(false);
    for (const a of anchors.slice(2)) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
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

  it('the home has one main (the console) and one nav, and the h1 sits outside the main', () => {
    serve();
    showHome(VERSION, vi.fn());
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('nav')).toHaveLength(1);
    expect(menu()?.querySelector('main input')).not.toBeNull();
    expect(menu()?.querySelector('main h1')).toBeNull();
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
