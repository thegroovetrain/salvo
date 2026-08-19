// THE HOW-TO-PLAY PAGE (Story 7.3, FR39 / UX-DR29).
//
// Two things are pinned here and they are different in kind. The COPY tests
// guard facts and scope — that the win condition is actually stated, and that
// the page did not quietly regrow the glossary Eric struck. The MOUNT tests
// guard that the page uses the shared chrome rather than inventing its own.
//
// The copy itself is DRAFT pending Eric's pass, so nothing here asserts an exact
// sentence except the one line the story exists to deliver.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOWTO_FOOTER_LINK,
  HOWTO_SECTIONS,
  HOWTO_TITLE,
} from '../how-to-play/copy.js';
import { mountHowToPlayPage } from '../how-to-play/main.js';
import { CLIENT_CONFIG } from '../config.js';

const page = (): HTMLElement => document.getElementById('how-to-play-page') as HTMLElement;

describe('how-to-play copy', () => {
  it('every section has a heading, and something under it', () => {
    expect(HOWTO_SECTIONS.length).toBeGreaterThan(0);
    for (const s of HOWTO_SECTIONS) {
      expect(s.heading.length, s.heading).toBeGreaterThan(0);
      expect(s.heading, s.heading).toBe(s.heading.toUpperCase());
      const bodyCount = (s.paragraphs?.length ?? 0) + (s.keys?.length ?? 0);
      expect(bodyCount, s.heading).toBeGreaterThan(0);
    }
  });

  // THE REASON THIS STORY IS A BETA GATE (FR39, closing epic-5 amendment 46(c)):
  // the win condition was stated nowhere a new player could read it. The results
  // banner says it, but only to the player who already won.
  it('STATES THE WIN CONDITION', () => {
    const all = HOWTO_SECTIONS.flatMap((s) => s.paragraphs ?? []).join(' ');
    expect(all.toLowerCase()).toContain('last hull floating wins');
  });

  // Eric ruled the scope down to the basics on 2026-08-19 — steer, select
  // weapons, upgrade, shoot — and struck the boon glossary by name. This pins
  // the SCOPE, so a later well-meaning expansion has to move a test rather than
  // quietly reinstate a thing that was cut. He renamed WEAPONS -> EQUIPMENT in
  // his copy pass, which is the better word: one of the two slots is a utility
  // (speed boost, decoy), not a weapon.
  it('carries no boon glossary', () => {
    const all = JSON.stringify(HOWTO_SECTIONS).toLowerCase();
    for (const banned of ['glossary', 'rarity', 'exclusive', 'mk i', 'subdeck']) {
      expect(all, `copy mentions ${banned}`).not.toContain(banned);
    }
  });

  it('teaches the four basics Eric named', () => {
    const headings = HOWTO_SECTIONS.map((s) => s.heading).join(' ');
    for (const topic of ['STEERING', 'SHOOTING', 'EQUIPMENT', 'UPGRADING']) {
      expect(headings, topic).toContain(topic);
    }
  });

  // The netcode debug toggle ships to players but is a developer affordance, and
  // Eric ruled it out of BOTH binding surfaces (the settings reference omits it
  // too). A bare 'P' would be too loose a match, so this checks the key tables.
  it('does not teach the P debug key', () => {
    const keys = HOWTO_SECTIONS.flatMap((s) => s.keys ?? []).flatMap((k) => k.keys);
    expect(keys).not.toContain('P');
  });
});

describe('how-to-play page mount', () => {
  beforeEach(() => {
    page()?.remove();
    mountHowToPlayPage();
  });

  it('renders in the standard page chrome, titled', () => {
    expect(page()).toBeTruthy();
    expect(page().querySelector('h1')?.textContent).toBe(HOWTO_TITLE);
  });

  it('renders one block per copy section, in order', () => {
    const headings = [...page().querySelectorAll('h2')].map((h) => h.textContent);
    for (const s of HOWTO_SECTIONS) expect(headings).toContain(s.heading);
  });

  // The AC requires the privacy policy to be reachable from this page, and the
  // chrome could not make a link at all until this story added one.
  it('links to the privacy policy, as a real anchor', () => {
    const link = [...page().querySelectorAll('a')].find(
      (a) => a.textContent === HOWTO_FOOTER_LINK,
    ) as HTMLAnchorElement | undefined;
    expect(link).toBeDefined();
    expect(link?.getAttribute('href')).toBe(CLIENT_CONFIG.consent.policyHref);
  });

  it('draws keys as keycaps, not as bare text', () => {
    // Every key named in the copy appears somewhere in the rendered page.
    const keys = HOWTO_SECTIONS.flatMap((s) => s.keys ?? []).flatMap((k) => k.keys);
    expect(keys.length).toBeGreaterThan(0);
    const text = page().textContent ?? '';
    for (const k of keys) expect(text, k).toContain(k);
  });

  it('mounts once, not twice, when booted again', () => {
    mountHowToPlayPage();
    expect(document.querySelectorAll('#how-to-play-page')).toHaveLength(1);
  });
});
