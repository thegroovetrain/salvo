import { beforeEach, describe, expect, it } from 'vitest';
import { POLICY_SECTIONS, POLICY_TITLE, POLICY_UPDATED } from '../privacy/policyCopy.js';
import { attachPrivacyPage } from '../privacy/main.js';
import { PRIVACY_PAGE_ID, privacyMarkup } from '../privacy/pageMarkup.js';

describe('privacy policy — structure', () => {
  it('carries a title and a stamped date', () => {
    expect(POLICY_TITLE.length).toBeGreaterThan(0);
    // The date must stay STAMPED (the file's own rule: it records when the
    // contents last changed), but pinning today's value would only force a test
    // edit on every future policy change without proving the stamp is current.
    expect(POLICY_UPDATED).toMatch(/\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  it('every section still has a heading and body under it', () => {
    expect(POLICY_SECTIONS.length).toBeGreaterThan(0);
    for (const s of POLICY_SECTIONS) {
      expect(s.heading, s.heading).toBe(s.heading.toUpperCase());
      const body = (s.paragraphs?.length ?? 0) + (s.bullets?.length ?? 0)
        + (s.trailing?.length ?? 0);
      expect(body, s.heading).toBeGreaterThan(0);
    }
  });
});

// The page as SERVED: the build string first thing in <body> (what the
// `hc-crawlable` plugin writes), then the boot's attach.
describe('privacy page, served and attached', () => {
  const page = (): HTMLElement => document.getElementById(PRIVACY_PAGE_ID) as HTMLElement;

  beforeEach(() => {
    for (const el of document.querySelectorAll(`#${PRIVACY_PAGE_ID}`)) el.remove();
    document.body.insertAdjacentHTML('afterbegin', privacyMarkup());
    attachPrivacyPage();
  });

  it('one h1 (the title), one main holding every section, a nav leading home', () => {
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(page().querySelector('h1')?.textContent).toBe(POLICY_TITLE);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(page().querySelectorAll('main > section')).toHaveLength(POLICY_SECTIONS.length);
    expect(page().querySelector('nav a')?.getAttribute('href')).toBe('/');
  });

  it('attaching again adds nothing: one page, the same served nodes', () => {
    const h1 = page().querySelector('h1');
    const before = document.body.innerHTML;
    attachPrivacyPage();
    expect(document.querySelectorAll(`#${PRIVACY_PAGE_ID}`)).toHaveLength(1);
    expect(page().querySelector('h1')).toBe(h1);
    expect(document.body.innerHTML).toBe(before);
  });
});
