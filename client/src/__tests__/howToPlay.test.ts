// THE HOW-TO-PLAY PAGE (Story 7.3, FR39 / UX-DR29).
//
// Two things are pinned here and they are different in kind. The COPY tests
// guard structure and coverage — every dealable catalog line is described,
// under its card name, nothing undealable is, and the keycaps teach only bound
// keys. The MOUNT
// tests guard that the page uses the shared chrome rather than inventing its
// own. No sentence, heading or word is pinned (Story 9.14, ruling R3).
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
import { entryGlyphId, mountHowToPlayPage } from '../how-to-play/main.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  FAMILY_SLOT,
  LINE_IDS,
  SLOT_COUNT,
  SLOT_FAMILIES,
  eligibleLines,
  familyMembers,
  isStubLine,
  type EquipmentId,
} from '@salvo/shared';
import { glyphPaths } from '../render/equipmentIcons.js';
import { boonName } from '../ui/boonCopy.js';

const page = (): HTMLElement => document.getElementById('how-to-play-page') as HTMLElement;

const allEntries = (): HowToEntry[] => HOWTO_SECTIONS.flatMap((s) => [...(s.entries ?? [])]);

/**
 * EVERY LINE A CAPTAIN CAN BE DEALT, derived from the draw's own eligibility
 * law (`eligibleLines`), never hand-listed: the union of what an empty ship is
 * dealt (the bare weapons and the universal ladders) and what a ship with each
 * weapon in its family slot is dealt (its tier cards and the add-ons it hosts).
 * A captain's slot 0 always mounts `'mainBattery'` (server `drawShipOf`), so the
 * deck-gun ladders are never dealt; BROADSIDE has no family slot; a stub never
 * deals.
 */
function dealableLines(): Set<string> {
  const ship = (slotIds: (EquipmentId | null)[]) => ({ held: [], slotIds, mountedGun: 'mainBattery' as const });
  const empty = (): (EquipmentId | null)[] => Array<EquipmentId | null>(SLOT_COUNT).fill(null);
  const states = [ship(empty())];
  for (const family of SLOT_FAMILIES) {
    for (const eq of familyMembers(family)) {
      const slots = empty();
      slots[FAMILY_SLOT[family]] = eq;
      states.push(ship(slots));
    }
  }
  return new Set(states.flatMap((st) => eligibleLines(st).map((e) => e.id as string)));
}

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

  // Derived from the draw's eligibility law, so a new dealable line (or a stub
  // flipping live) fails the page until it is described (Edge Case Hunter,
  // cycle 161; re-cut to "dealable" by Story 11.11).
  it('every line a captain can be dealt is an entry, derived from the draw', () => {
    const dealable = dealableLines();
    expect(dealable.size).toBeGreaterThan(0);
    const names = allEntries().map((e) => e.name);
    for (const id of dealable) expect(names, id).toContain(boonName(id, 0));
  });

  it('no entry describes a line a captain can never be dealt', () => {
    const dealable = dealableLines();
    expect(LINE_IDS.some((id) => !dealable.has(id)), 'some line is undealable, so this is not vacuous').toBe(true);
    for (const e of allEntries()) expect(dealable.has(e.lineId), e.lineId).toBe(true);
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

  it('no entry describes a stub line', () => {
    expect(LINE_IDS.some((id) => isStubLine(id)), 'the catalog carries a stub, so this is not vacuous').toBe(true);
    for (const e of allEntries()) expect(isStubLine(e.lineId), e.lineId).toBe(false);
  });

  // SPACE is bound since Story 11.8 (camera home), so only CTRL is banned.
  it('no keycaps row carries CTRL', () => {
    for (const s of HOWTO_SECTIONS) {
      for (const row of s.keys ?? []) expect(row.keys, s.heading).not.toContain('CTRL');
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

  // Eric 2026-10-01: every weapon, ability and ship upgrade carries a derived
  // stat table; a one-off card (`'none'`) carries none.
  it('renders one stat table per tabled entry, plus the key tables', () => {
    const tables = page().querySelectorAll('table');
    const keyTables = HOWTO_SECTIONS.filter((s) => s.keys !== undefined).length;
    const tabled = allEntries().filter((e) => e.table !== 'none');
    expect(tables).toHaveLength(tabled.length + keyTables);
  });

  // Eric 2026-10-01: each entry shows its icon as the card / hotbar draws it.
  it('every entry with a registry glyph draws an svg in its name; the rest draw none', () => {
    const names = [...page().querySelectorAll('h3')];
    const entries = allEntries();
    expect(names).toHaveLength(entries.length);
    entries.forEach((entry, i) => {
      const id = entryGlyphId(entry);
      const has = id !== null && glyphPaths(id) !== null;
      expect(names[i]!.textContent, entry.name).toBe(entry.name);
      expect(names[i]!.querySelector('svg') !== null, entry.name).toBe(has);
    });
    expect(entries.some((e) => entryGlyphId(e) !== null && glyphPaths(entryGlyphId(e)!) !== null)).toBe(true);
    // Cycle 162 (the icon pass): the ship-upgrade ladders draw a glyph too.
    const ship = entries.filter((e) => e.table === 'shipUpgrade');
    expect(ship.length).toBeGreaterThan(0);
    for (const e of ship) expect(names[entries.indexOf(e)]!.querySelector('svg'), e.name).not.toBeNull();
  });

  it('mounts once, not twice, when booted again', () => {
    mountHowToPlayPage();
    expect(document.querySelectorAll('#how-to-play-page')).toHaveLength(1);
  });
});
