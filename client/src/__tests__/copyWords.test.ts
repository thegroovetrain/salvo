// THE RETIRED DECK WORDS (Story 8.22 AC): no deck, DEFAULT or STARTER string
// ships in client copy (UX-DR77 void). Decks are gone (the common pool draw,
// epic-8 amendment 89), so every surface a player reads is swept here: the
// How-to-Play page, the settings binding reference, the class names, the
// SPECIAL names and every boon's card name.
//
// `deck gun` is the one legal use of the word (amendments 96/107), so the deck
// pattern exempts it.
//
// The sweep covers the copy surfaces the 8.22 AC names (How-to-Play, Settings
// rows, class and SPECIAL names, card line names). `ui/taglines.ts` is Eric's
// frozen home copy and its "ALL HANDS ON DECK" is the ship's deck, deliberately
// outside the sweep, like "deck gun".

import { describe, expect, it } from 'vitest';
import { HOWTO_SECTIONS } from '../how-to-play/copy.js';
import { bindingRows } from '../ui/settings.js';
import { CLASS_DISPLAY_NAMES } from '../ui/classNames.js';
import { SPECIAL_NAMES } from '../ui/classSelect.js';
import { COPY_LINE_IDS, boonName } from '../ui/boonCopy.js';

function allCopy(): string[] {
  const out: string[] = [];
  for (const s of HOWTO_SECTIONS) {
    out.push(s.heading, ...(s.paragraphs ?? []));
    for (const k of s.keys ?? []) out.push(k.action, ...k.keys);
  }
  for (const r of bindingRows()) out.push(r.keys, r.action);
  out.push(...Object.values(CLASS_DISPLAY_NAMES), ...Object.values(SPECIAL_NAMES));
  for (const id of COPY_LINE_IDS) out.push(boonName(id, 0));
  return out;
}

describe('client copy carries no retired deck word', () => {
  const strings = allCopy();

  it('sweeps a real body of copy', () => {
    expect(strings.length).toBeGreaterThan(50);
    expect(COPY_LINE_IDS.length).toBeGreaterThan(0);
  });

  it.each([
    ['deck (except "deck gun")', /\bdeck\b(?!\s+gun\b)/i],
    ['DEFAULT', /\bdefault\b/i],
    ['STARTER', /\bstarter\b/i],
  ])('no string matches %s', (_label, re) => {
    expect(strings.filter((s) => re.test(s))).toEqual([]);
  });
});
