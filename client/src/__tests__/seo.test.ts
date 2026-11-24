// THE CRAWLABLE DOCUMENTS (Story 13.1, AC 17) — structural contracts only.
//
// No copy is pinned here: every expected heading or paragraph is read from the
// copy module itself, so a copy edit never breaks a test, and a prerender that
// drops, reorders or retypes a string always does.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOWTO_FOOTER_LEAD, HOWTO_FOOTER_LINK, HOWTO_FOOTER_TAIL, HOWTO_SECTIONS, HOWTO_TITLE } from '../how-to-play/copy.js';
import { POLICY_SECTIONS, POLICY_TITLE, POLICY_UPDATED } from '../privacy/policyCopy.js';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex } from '../util/color.js';
import { HOWTO_HREF, wordmarkText, versionLine } from '../ui/siteCopy.js';
import { escapeHtml, unescapeHtml } from '../seo/escape.js';
import { prerenderHowToPlay, prerenderPrivacy } from '../seo/prerender.js';
import { prerenderHome } from '../seo/homeMarkup.js';
import { prerenderStyle } from '../seo/prerenderStyle.js';
import { headTags, injectHead, readDescription, readTitle } from '../seo/head.js';
import { robotsTxt, sitemapXml } from '../seo/robots.js';
import { SITE_ORIGIN, SITE_PAGES, canonicalUrl, pageForHtmlPath } from '../seo/site.js';
import { crawlableDocument, injectBody } from '../seo/crawlable.js';
import { PRERENDER_ID } from '../seo/takeover.js';

const HOME_OPTS = { version: '9.9.9', community: [] };

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function texts(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((e) => e.textContent ?? '');
}

/** Every origin any element attribute names. */
function attributeOrigins(doc: Document): Set<string> {
  const out = new Set<string>();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      for (const m of attr.value.match(/https?:\/\/[a-z0-9.-]+/gi) ?? []) out.add(m);
    }
  }
  return out;
}

/** Heading levels in document order. */
function headingLevels(root: ParentNode): number[] {
  return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName.slice(1)));
}

/** Starts at h1, and never steps down more than one level at a time. */
function skipsNoLevel(levels: readonly number[]): boolean {
  return levels[0] === 1 && levels.every((l, i) => i === 0 || l <= levels[i - 1] + 1);
}

const BLOCKS = {
  home: prerenderHome(HOME_OPTS),
  howToPlay: prerenderHowToPlay(),
  privacy: prerenderPrivacy(),
} as const;

describe('the prerendered block (every page)', () => {
  for (const [key, html] of Object.entries(BLOCKS)) {
    it(`${key}: one block, one h1, a main and a nav of real links`, () => {
      const doc = parse(html);
      const block = doc.getElementById(PRERENDER_ID);
      expect(block).not.toBeNull();
      expect(doc.querySelectorAll(`#${PRERENDER_ID}`)).toHaveLength(1);
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
      expect(block?.querySelector('main h1')).not.toBeNull();
      const nav = block?.querySelector('nav');
      expect(nav).not.toBeNull();
      const links = [...(nav?.querySelectorAll('a') ?? [])];
      expect(links.length).toBeGreaterThan(0);
      for (const a of links) expect(a.getAttribute('href') ?? '').not.toBe('');
      expect(nav?.children.length).toBe(links.length);
    });

    it(`${key}: headings never skip a level`, () => {
      expect(skipsNoLevel(headingLevels(parse(html)))).toBe(true);
    });

    it(`${key}: carries no script and loads nothing`, () => {
      expect(html).not.toMatch(/<script\b/i);
      expect(parse(html).querySelectorAll('[src], link, style, iframe, img')).toHaveLength(0);
    });
  }
});

describe('how to play prerender', () => {
  const doc = parse(BLOCKS.howToPlay);

  it('every title, section heading and entry name, in source order', () => {
    const expected = [
      HOWTO_TITLE,
      ...HOWTO_SECTIONS.flatMap((s) => [s.heading, ...(s.entries ?? []).map((e) => e.name)]),
    ];
    expect(texts(doc, 'h1,h2,h3')).toEqual(expected);
  });

  it('one section per copy section, each led by its h2', () => {
    const sections = [...doc.querySelectorAll('main > section')];
    expect(sections).toHaveLength(HOWTO_SECTIONS.length);
    for (const s of sections) expect(s.firstElementChild?.tagName).toBe('H2');
  });

  it('every paragraph, entry description, tail and the footer, in order', () => {
    const expected = [
      ...HOWTO_SECTIONS.flatMap((s) => [
        ...(s.paragraphs ?? []),
        ...(s.entries ?? []).map((e) => e.description),
        ...(s.tail ?? []),
      ]),
      HOWTO_FOOTER_LEAD + HOWTO_FOOTER_LINK + HOWTO_FOOTER_TAIL,
    ];
    expect(texts(doc, 'main p')).toEqual(expected);
  });

  it('key bindings are table rows: one kbd per key, then the action', () => {
    const rows = HOWTO_SECTIONS.flatMap((s) => s.keys ?? []);
    const trs = [...doc.querySelectorAll('main table tr')];
    expect(trs).toHaveLength(rows.length);
    trs.forEach((tr, i) => {
      expect(texts(tr, 'kbd')).toEqual(rows[i].keys);
      expect(tr.lastElementChild?.textContent).toBe(rows[i].action);
    });
  });

  it('the footer links to the policy, and the nav leads home', () => {
    expect(doc.querySelector('main p:last-of-type a')?.getAttribute('href')).toBe(
      CLIENT_CONFIG.consent.policyHref,
    );
    expect(doc.querySelector('nav a')?.getAttribute('href')).toBe('/');
  });
});

describe('privacy prerender', () => {
  const doc = parse(BLOCKS.privacy);

  it('the title, then every section heading, in source order', () => {
    expect(texts(doc, 'h1,h2,h3')).toEqual([POLICY_TITLE, ...POLICY_SECTIONS.map((s) => s.heading)]);
  });

  it('the updated line right after the h1, then paragraphs, bullets and trailing in order', () => {
    expect(doc.querySelector('h1')?.nextElementSibling?.textContent).toBe(POLICY_UPDATED);
    const expected = [
      POLICY_UPDATED,
      ...POLICY_SECTIONS.flatMap((s) => [...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.trailing ?? [])]),
    ];
    expect(texts(doc, 'main p, main li')).toEqual(expected);
  });

  it('bullets are list items in a ul', () => {
    const bullets = POLICY_SECTIONS.flatMap((s) => s.bullets ?? []);
    expect(texts(doc, 'main ul > li')).toEqual(bullets);
  });
});

describe('home prerender', () => {
  it('the h1 is the wordmark, then the version line', () => {
    const doc = parse(prerenderHome(HOME_OPTS));
    expect(doc.querySelector('h1')?.textContent).toBe(wordmarkText());
    expect(texts(doc, 'main p')).toEqual([versionLine(HOME_OPTS.version)]);
  });

  it('the nav holds the two static pages, then the build env community links in order', () => {
    const community = [
      { label: 'DISCORD' as const, href: 'https://discord.gg/abc' },
      { label: 'REDDIT' as const, href: 'https://www.reddit.com/r/abc/' },
    ];
    const doc = parse(prerenderHome({ version: '1', community }));
    const hrefs = [...doc.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([HOWTO_HREF, CLIENT_CONFIG.consent.policyHref, ...community.map((c) => c.href)]);
  });
});

describe('escaping', () => {
  const NASTY = 'a<b>&"c\'';

  it('escapes & < > " and round-trips through a parser', () => {
    const escaped = escapeHtml(NASTY);
    expect(escaped).not.toMatch(/[<>"]/);
    expect(parse(`<p title="${escaped}">${escaped}</p>`).querySelector('p')?.textContent).toBe(NASTY);
    expect(parse(`<p title="${escaped}"></p>`).querySelector('p')?.getAttribute('title')).toBe(NASTY);
  });

  it('unescape inverts escape, so read-then-write never double-escapes', () => {
    expect(unescapeHtml(escapeHtml(NASTY))).toBe(NASTY);
    expect(escapeHtml(unescapeHtml('&amp;lt;'))).toBe('&amp;lt;');
  });

  it('a hostile title reaches the head set as text, never markup', () => {
    const html = `<html><head><title>${escapeHtml(NASTY)}</title></head><body></body></html>`;
    const doc = parse(injectHead(html, SITE_PAGES[0]));
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(NASTY);
    expect(doc.querySelectorAll('head > *:not(meta):not(link):not(title)')).toHaveLength(0);
  });
});

describe('the head set', () => {
  const fixture = (title: string, desc: string): string =>
    `<!DOCTYPE html><html><head><title>${title}</title>` +
    `<meta name="description" content="${desc}"></head><body></body></html>`;

  for (const page of SITE_PAGES) {
    it(`${page.key}: its own canonical and og:url, the OG + Twitter set, from the document's own words`, () => {
      const html = fixture('T', 'D');
      const out = injectHead(html, page);
      const doc = parse(out);
      const url = canonicalUrl(page);
      expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url);
      const meta = (sel: string): string | null | undefined => doc.querySelector(`meta[${sel}]`)?.getAttribute('content');
      expect(meta('property="og:url"')).toBe(url);
      expect(doc.querySelectorAll('title')).toHaveLength(1);
      expect(meta('property="og:title"')).toBe(readTitle(html));
      expect(meta('name="twitter:title"')).toBe(readTitle(html));
      expect(meta('property="og:description"')).toBe(readDescription(html));
      expect(meta('name="twitter:description"')).toBe(readDescription(html));
      for (const key of ['og:type', 'og:site_name']) expect(meta(`property="${key}"`)).toBeTruthy();
      expect(meta('name="twitter:card"')).toBeTruthy();
      expect(out).not.toMatch(/<script\b/i);
      const origins = new Set(out.match(/https?:\/\/[a-z0-9.-]+/gi) ?? []);
      expect([...origins]).toEqual([SITE_ORIGIN]);
    });
  }

  it('canonicals are distinct per page', () => {
    expect(new Set(SITE_PAGES.map(canonicalUrl)).size).toBe(SITE_PAGES.length);
  });

  it('a document without a description gets no empty description tags', () => {
    const tags = headTags(SITE_PAGES[0], 'T', null).join('');
    expect(tags).not.toContain('description');
  });

  it('a document with no </head> is returned unchanged', () => {
    expect(injectHead('<p>x</p>', SITE_PAGES[0])).toBe('<p>x</p>');
  });
});

describe('the body injection', () => {
  it('lands after the real body tag, not a head comment that mentions one', () => {
    const html = '<html><head><!-- into <body> --></head><body class="x"><div id="app"></div></body></html>';
    const doc = parse(injectBody(html, '<p id="m"></p>'));
    expect(doc.body.firstElementChild?.id).toBe('m');
  });
});

describe('the page table', () => {
  it('maps each entry html, either separator, and nothing else', () => {
    for (const page of SITE_PAGES) {
      expect(pageForHtmlPath(`/repo${page.sourceSuffix}`)).toBe(page);
      expect(pageForHtmlPath(`C:\\repo${page.sourceSuffix.replace(/\//g, '\\')}`)).toBe(page);
    }
    expect(pageForHtmlPath('/repo/client/leaderboard/index.html')).toBeUndefined();
    expect(pageForHtmlPath('/repo/client/src/main.ts')).toBeUndefined();
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('robots allows everything and names the sitemap at the site origin', () => {
    const txt = robotsTxt();
    const sitemapLine = txt.split('\n').find((l) => l.startsWith('Sitemap:'));
    expect(sitemapLine).toBe(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(txt).not.toMatch(/Disallow/i);
    expect(txt.endsWith('\n')).toBe(true);
  });

  it('the sitemap parses as XML and its locs are exactly the canonicals', () => {
    const xml = new DOMParser().parseFromString(sitemapXml(), 'application/xml');
    expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(xml.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
    const locs = [...xml.getElementsByTagName('loc')].map((l) => l.textContent);
    expect(locs.sort()).toEqual(SITE_PAGES.map(canonicalUrl).sort());
    expect(xml.getElementsByTagName('lastmod')).toHaveLength(0);
  });
});

describe('the pre-JS style', () => {
  it('names only token colors, and no script', () => {
    const css = prerenderStyle();
    const tokens = new Set(Object.values(CLIENT_CONFIG.colors).filter((v) => typeof v === 'number').map(cssHex));
    const used = css.match(/#[0-9a-f]{6}\b/gi) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) expect(tokens.has(c.toLowerCase()), c).toBe(true);
    expect(css).not.toMatch(/<script\b/i);
  });
});

describe('the hc-crawlable plugin is wired', () => {
  const src = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

  it('registers the transform and emits both files', () => {
    expect(src).toContain("name: 'hc-crawlable'");
    expect(src).toMatch(/transformIndexHtml\(html: string, ctx: \{ filename: string \}\) \{\s*return crawlableDocument\(/);
    expect(src).toContain("fileName: 'robots.txt'");
    expect(src).toContain("fileName: 'sitemap.xml'");
    expect(src).toMatch(/plugins: \[[\s\S]*crawlablePlugin\(crawlable\)[\s\S]*\]/);
    expect(src).toContain('communityLinks(env)');
  });
});

describe('the real source documents, transformed', () => {
  const PAGES = [
    { rel: 'index.html' },
    { rel: 'how-to-play/index.html' },
    { rel: 'privacy/index.html' },
  ] as const;
  const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

  for (const { rel } of PAGES) {
    it(`${rel}: one h1, main, nav, canonical, description, and no added script or origin`, () => {
      const abs = join(process.cwd(), rel);
      const source = readFileSync(abs, 'utf8');
      const out = crawlableDocument(source, abs, HOME_OPTS);
      const doc = parse(out);
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
      expect(doc.querySelectorAll('main')).toHaveLength(1);
      expect(doc.querySelectorAll('nav')).toHaveLength(1);
      expect(doc.querySelectorAll(`#${PRERENDER_ID}`)).toHaveLength(1);
      expect(doc.body.firstElementChild?.id).toBe(PRERENDER_ID);
      expect(doc.querySelectorAll('title')).toHaveLength(1);
      expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect((readDescription(out) ?? '').length).toBeGreaterThan(0);
      expect(out.match(/<script\b/gi) ?? []).toHaveLength((source.match(/<script\b/gi) ?? []).length);
      // Origins named in MARKUP (attributes). The policy's prose names URLs as
      // plain text, exactly as the live page shows them; text loads nothing.
      for (const o of attributeOrigins(doc)) expect([...FONT_ORIGINS, SITE_ORIGIN], o).toContain(o);
    });
  }
});
