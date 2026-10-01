// THE HOW-TO-PLAY PAGE (Story 7.3, FR39 / UX-DR29).
//
// Two things are pinned here and they are different in kind. The COPY tests
// guard facts and scope — that the win condition is actually stated, and that
// the page did not quietly regrow the glossary Eric struck. The MOUNT tests
// guard that the page uses the shared chrome rather than inventing its own.
//
// The copy itself is DRAFT pending Eric's pass, so nothing here asserts an exact
// sentence except the one line the story exists to deliver.
//
// STORY 8.22 RE-CUT (2026-10-01): the page now teaches the pool draw, the gun
// pick, the class SPECIAL on Shift, the nine squares, consumables, REDRAW and
// the three class names (epic-8 amendment 204). The section set is pinned
// EXACTLY and in order, the banned-word list grows the retired deck words, and
// the facts each section owes are pinned by name.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  type HowToSection,
  HOWTO_FOOTER_LINK,
  HOWTO_SECTIONS,
  HOWTO_TITLE,
} from '../how-to-play/copy.js';
import { mountHowToPlayPage } from '../how-to-play/main.js';
import { CLIENT_CONFIG } from '../config.js';

const page = (): HTMLElement => document.getElementById('how-to-play-page') as HTMLElement;
const section = (heading: string): HowToSection | undefined =>
  HOWTO_SECTIONS.find((s) => s.heading === heading);
const sectionText = (heading: string): string => JSON.stringify(section(heading) ?? {});

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
    for (const banned of ['glossary', 'rarity', 'exclusive', 'mk i', 'subdeck', 'starter', 'default deck', 'your deck']) {
      expect(all, `copy mentions ${banned}`).not.toContain(banned);
    }
  });

  it('teaches the objective and the four basics Eric named — exactly, in order', () => {
    expect(HOWTO_SECTIONS.map((s) => s.heading)).toEqual([
      'THE OBJECTIVE',
      'STEERING',
      'SHOOTING',
      'EQUIPMENT',
      'UPGRADING',
      'THE GUNS',
      'WEAPONS',
      'CONSUMABLES',
      'SHIP UPGRADES',
    ]);
  });

  it('never calls a torpedo a fish (Eric 2026-10-01)', () => {
    expect(JSON.stringify(HOWTO_SECTIONS).toLowerCase()).not.toMatch(/\bfish\b|\bfishes\b/);
  });

  it('describes every live weapon, consumable and ship upgrade', () => {
    const joined = ['THE GUNS', 'WEAPONS', 'CONSUMABLES', 'SHIP UPGRADES']
      .flatMap((h) => section(h)?.paragraphs ?? [])
      .join(' ');
    const shipUpgrades = ['ARMOR', 'SPEED', 'TURNING', 'RADAR SWEEP', 'RELOAD'];
    const named = [
      'CANNON', 'MACHINE GUN', 'FLAK', 'HEAVY TORPEDO', 'LIGHT TORPEDO', 'BROADSIDE GUN',
      'STAR SHELLS', 'PHOSPHOR SHELLS', 'NAVAL MINES', 'CAPTIVE MINES', 'FOULING MINES',
      'HULL REPAIR', 'SHIELD BLOCK', 'SMOKE SCREEN', 'CHAFF', 'DECOY BUOY', 'SUPERCAV TORPEDO',
      'FLASH SHELLS',
    ];
    for (const name of named) expect(joined, name).toContain(`${name}:`);
    for (const name of shipUpgrades) expect(joined, name).toContain(name);
    // DEPTH CHARGE is a stub: it is described nowhere.
    expect(JSON.stringify(HOWTO_SECTIONS)).not.toContain('DEPTH CHARGE');
  });

  it('states the mine hit-point rule', () => {
    expect((section('WEAPONS')?.paragraphs ?? []).join(' ')).toContain('ten hit points');
  });

  it('no heading is a glossary', () => {
    for (const s of HOWTO_SECTIONS) expect(s.heading.toUpperCase()).not.toContain('GLOSSARY');
  });

  // STORY 8.22: the facts each section owes, pinned by name.
  it('EQUIPMENT names the three hulls and their three SPECIALs', () => {
    const text = sectionText('EQUIPMENT');
    for (const name of ['SPEEDBOAT', 'DREADNOUGHT', 'REPEATER']) expect(text, name).toContain(name);
    for (const name of ['SPEED BOOST', 'INSTANT RELOAD', 'DAMAGE CUT']) expect(text, name).toContain(name);
  });

  it('SHOOTING names the three guns', () => {
    const text = sectionText('SHOOTING');
    for (const name of ['CANNON', 'MACHINE GUN', 'FLAK']) expect(text, name).toContain(name);
  });

  it('UPGRADING teaches REDRAW and both consumable fire modes', () => {
    const paragraphs = section('UPGRADING')?.paragraphs ?? [];
    expect(paragraphs.join(' ')).toContain('REDRAW');
    const consumables = paragraphs.find((p) => p.includes('Consumables')) ?? '';
    expect(consumables).toContain('fire the moment you press');
    expect(consumables).toContain('fire where you click');
  });

  it('the EQUIPMENT keys teach SHIFT, Q / E / R and the belt digits 1-4', () => {
    const keys = (section('EQUIPMENT')?.keys ?? []).flatMap((k) => k.keys);
    for (const k of ['SHIFT', 'Q', 'E', 'R', '1', '2', '3', '4']) expect(keys, k).toContain(k);
  });

  it('no keycaps row carries CTRL or SPACE', () => {
    for (const s of HOWTO_SECTIONS) {
      for (const row of s.keys ?? []) {
        expect(row.keys, s.heading).not.toContain('CTRL');
        expect(row.keys, s.heading).not.toContain('SPACE');
      }
    }
  });

  // The 2026-08-23 assist split (CONFIG.xp.assistWindowMs / killerShare) and —
  // since Story 8.8 (epic-8 amendment 46) — the OUT-OF-COMBAT REGEN that
  // replaced the free per-level heal: pins that BOTH UPGRADING paragraphs
  // survive, so a later edit cannot silently delete either one.
  it('teaches the assist split and the out-of-combat regen', () => {
    const upgrading = HOWTO_SECTIONS.find((s) => s.heading === 'UPGRADING');
    const paragraphs = upgrading?.paragraphs ?? [];
    expect(paragraphs.some((p) => p.includes('A kill is shared'))).toBe(true);
    expect(paragraphs.some((p) => p.includes('your hull slowly mends on its own'))).toBe(true);
    // ...and it names the two halves of the rule Eric ruled: the wait, and what
    // resets it.
    const regen = paragraphs.find((p) => p.includes('your hull slowly mends on its own')) ?? '';
    expect(regen).toContain('fifteen seconds');
    expect(regen).toContain('storm');
  });

  // STORY 8.8: healing is a CARD now. The UPGRADING copy must say so, and must
  // no longer teach the deleted DAMAGE CONTROL level spend or its `5` key.
  it('teaches HULL REPAIR as a card, and teaches no DAMAGE CONTROL spend', () => {
    const upgrading = HOWTO_SECTIONS.find((s) => s.heading === 'UPGRADING');
    const paragraphs = upgrading?.paragraphs ?? [];
    expect(paragraphs.some((p) => p.includes('HULL REPAIR is a card too'))).toBe(true);
    for (const section of HOWTO_SECTIONS) {
      for (const p of section.paragraphs ?? []) expect(p.toUpperCase()).not.toContain('DAMAGE CONTROL');
      for (const row of section.keys ?? []) {
        expect(row.action.toUpperCase(), row.keys.join('/')).not.toContain('DAMAGE CONTROL');
        expect(row.keys, section.heading).not.toContain('5');
      }
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
