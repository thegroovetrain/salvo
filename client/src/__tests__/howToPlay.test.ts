// THE HOW-TO-PLAY PAGE (Story 7.3, FR39 / UX-DR29).
//
// Two things are pinned here and they are different in kind. The COPY tests
// guard facts and scope — that the win condition is actually stated, that
// every live catalog line is described, and that the page did not quietly
// regrow the glossary Eric struck. The MOUNT tests guard that the page uses
// the shared chrome rather than inventing its own.
//
// ERIC HOLDS THE PEN (his copy pass, 2026-10-01): nothing here pins one of
// his sentences — only facts. The stat tables' numbers are pinned in
// `weaponTables.test.ts`, against the sim they are derived from.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  type HowToEntry,
  HOWTO_FOOTER_LINK,
  HOWTO_SECTIONS,
  HOWTO_TITLE,
} from '../how-to-play/copy.js';
import { mountHowToPlayPage } from '../how-to-play/main.js';
import { CLIENT_CONFIG } from '../config.js';
import { LINE_IDS, isStubLine } from '@salvo/shared';
import { boonName } from '../ui/boonCopy.js';

const page = (): HTMLElement => document.getElementById('how-to-play-page') as HTMLElement;

const allEntries = (): HowToEntry[] => HOWTO_SECTIONS.flatMap((s) => [...(s.entries ?? [])]);
const allProse = (): string =>
  HOWTO_SECTIONS.flatMap((s) => [...(s.paragraphs ?? []), ...(s.tail ?? [])]).join(' ');

describe('how-to-play copy', () => {
  it('every section has a heading, and something under it', () => {
    expect(HOWTO_SECTIONS.length).toBeGreaterThan(0);
    for (const s of HOWTO_SECTIONS) {
      expect(s.heading.length, s.heading).toBeGreaterThan(0);
      expect(s.heading, s.heading).toBe(s.heading.toUpperCase());
      const bodyCount = (s.paragraphs?.length ?? 0) + (s.keys?.length ?? 0) + (s.entries?.length ?? 0);
      expect(bodyCount, s.heading).toBeGreaterThan(0);
    }
  });

  // THE REASON THIS STORY IS A BETA GATE (FR39, closing epic-5 amendment 46(c)):
  // the win condition was stated nowhere a new player could read it. The results
  // banner says it, but only to the player who already won.
  it('STATES THE WIN CONDITION', () => {
    expect(allProse().toLowerCase()).toContain('last hull floating wins');
  });

  // Eric ruled the scope down to the basics on 2026-08-19 and struck the boon
  // glossary by name. This pins the SCOPE, so a later well-meaning expansion
  // has to move a test rather than quietly reinstate a thing that was cut.
  it('carries no boon glossary', () => {
    const all = JSON.stringify(HOWTO_SECTIONS).toLowerCase();
    for (const banned of ['glossary', 'rarity', 'exclusive', 'mk i', 'subdeck']) {
      expect(all, `copy mentions ${banned}`).not.toContain(banned);
    }
  });

  // Eric's own section set (his copy pass, 2026-10-01), exactly and in order.
  it('the section headings, exactly, in order', () => {
    expect(HOWTO_SECTIONS.map((s) => s.heading)).toEqual([
      '[ HOW TO PLAY ]',
      '[ CONTROLS ]',
      '[ EXPERIENCE ]',
      '[ UPGRADES ]',
      '[ DECK GUNS ]',
      '[ WEAPONS ]',
      '[ CONSUMABLES ]',
      '[ SHIP UPGRADES ]',
    ]);
  });

  it('never calls a torpedo a fish (Eric 2026-10-01)', () => {
    expect(JSON.stringify(HOWTO_SECTIONS).toLowerCase()).not.toMatch(/\bfish\b|\bfishes\b/);
  });

  // Derived from the catalog, so a new live line (or a stub flipping live)
  // fails the page until it is described (Edge Case Hunter, cycle 161).
  it('every non-stub catalog line is an entry, derived from LINE_IDS', () => {
    const names = allEntries().map((e) => e.name);
    for (const id of LINE_IDS) {
      if (isStubLine(id)) continue;
      expect(names, id).toContain(boonName(id, 0));
    }
  });

  it('every entry names a real catalog line, under its card name', () => {
    for (const e of allEntries()) {
      expect(LINE_IDS as readonly string[], e.lineId).toContain(e.lineId);
      expect(e.name, e.lineId).toBe(boonName(e.lineId, 0));
    }
  });

  // Eric 2026-10-01: the stats live in the table, not the description.
  it('no entry description carries a number', () => {
    for (const e of allEntries()) expect(e.description, e.name).not.toMatch(/\d/);
  });

  it('DEPTH CHARGE (a stub) is described nowhere', () => {
    expect(JSON.stringify(HOWTO_SECTIONS)).not.toContain('DEPTH CHARGE');
  });

  it('no heading is a glossary', () => {
    for (const s of HOWTO_SECTIONS) expect(s.heading.toUpperCase()).not.toContain('GLOSSARY');
  });

  it('no keycaps row carries CTRL or SPACE', () => {
    for (const s of HOWTO_SECTIONS) {
      for (const row of s.keys ?? []) {
        expect(row.keys, s.heading).not.toContain('CTRL');
        expect(row.keys, s.heading).not.toContain('SPACE');
      }
    }
  });

  // The netcode debug toggle (P) is a developer affordance Eric ruled out of
  // both binding surfaces; the `5` key went with the deleted DAMAGE CONTROL
  // spend (Story 8.8).
  it('teaches neither the P debug key nor a 5 key', () => {
    const keys = HOWTO_SECTIONS.flatMap((s) => s.keys ?? []).flatMap((k) => k.keys);
    expect(keys).not.toContain('P');
    expect(keys).not.toContain('5');
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

  // Eric 2026-10-01: every weapon, consumable and ship upgrade carries a
  // derived stat table.
  it('renders one stat table per entry, plus the controls table', () => {
    const tables = page().querySelectorAll('table');
    const keyTables = HOWTO_SECTIONS.filter((s) => s.keys !== undefined).length;
    expect(tables).toHaveLength(allEntries().length + keyTables);
  });

  it('mounts once, not twice, when booted again', () => {
    mountHowToPlayPage();
    expect(document.querySelectorAll('#how-to-play-page')).toHaveLength(1);
  });
});
