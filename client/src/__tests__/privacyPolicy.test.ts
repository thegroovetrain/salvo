// THE PRIVACY POLICY SPEAKS AS HULLCRACKER.IO (cycle 108, Eric ruling 2026-08-19,
// which supersedes Story 7.2's R11).
//
// The policy copy is FROZEN and had zero content coverage, so nothing stopped the
// operator's real-world identity — or the first-person voice that names them by
// another word — creeping back in a later edit. These pins read the DATA
// (`POLICY_SECTIONS` headings, paragraphs, bullets and trailing prose), never the
// rendered DOM: the ruling is about what the copy SAYS, and a render test would go
// quiet the day the page chrome changed.
//
// THE SWEEP COVERS HEADINGS TOO. Story 7.2 froze the headings, and the one that
// carried first person — 'WHY WE ARE ALLOWED TO DO THIS' — was rewritten to 'WHY
// THIS IS ALLOWED' in this cycle, because a first-person heading is the same
// reference to the operator that the body text just stopped making. Nothing is
// exempt from the voice rule.
//
// THE TWO IDENTITY SECTIONS ARE PINNED WHOLE, not by denylist. A denylist can
// never be complete — a city instead of a country, an initial instead of a
// surname, a social handle instead of either, would each satisfy every keyword
// pin ever written. WHO RUNS THIS and CONTACT are short, frozen, and the only
// two places the operator was ever named, so they are asserted VERBATIM: they
// admit no name because they admit no other text at all, and any edit to them
// must come back through this test.
//
// ONE DELIBERATE EXCLUSION, which looks like a gap until you know why:
//   * 'processed outside your country, including in the United States' is
//     GOOGLE's processing location, not the operator's home, and must SURVIVE —
//     a future redaction pass must not mistake it for a residence disclosure.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  POLICY_CONTACT,
  POLICY_SECTIONS,
  POLICY_TITLE,
  POLICY_UPDATED,
} from '../privacy/policyCopy.js';

type Section = (typeof POLICY_SECTIONS)[number];

/** Every piece of prose the reader sees under a heading, as one string. */
function bodyText(sections: readonly Section[]): string {
  return sections
    .flatMap((s) => [...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.trailing ?? [])])
    .join('\n');
}

/** Body text plus headings — the whole policy as the reader meets it. */
function allText(): string {
  return POLICY_SECTIONS.map((s) => s.heading).join('\n') + '\n' + bodyText(POLICY_SECTIONS);
}

/** A section by heading. Pins uniqueness: a DUPLICATE heading would otherwise let
 *  a second CONTACT block hide behind the first one `find()` returns. */
function section(heading: string): Section {
  const hits = POLICY_SECTIONS.filter((s) => s.heading === heading);
  expect(hits, `exactly one section titled ${heading}`).toHaveLength(1);
  return hits[0] as Section;
}

describe('privacy policy — no operator identity', () => {
  // The two sections that named a person are pinned VERBATIM. See the header note
  // on why a denylist cannot do this job.
  it('WHO RUNS THIS says only that Hullcracker.io runs it, and where to write', () => {
    expect(bodyText([section('WHO RUNS THIS')])).toBe(
      'This site and the game on it are run by Hullcracker.io. For anything in this policy — '
      + 'questions, requests, complaints — write to ' + POLICY_CONTACT + '.',
    );
  });

  it('CONTACT names Hullcracker.io and the contact address, and nothing else', () => {
    expect(bodyText([section('CONTACT')])).toBe('Hullcracker.io — ' + POLICY_CONTACT + '.');
  });

  // NOTE THE ABSENCE OF A NAME DENYLIST, AND DO NOT ADD ONE. A test asserting
  // `not.toMatch(/<surname>/)` would publish the redacted name in a tracked file
  // of a public repository — the pin would republish exactly what the ruling
  // removes, and `grep` for the name would still find it. The verbatim pins
  // above are stronger anyway: they admit no name because they admit no other
  // text at all. What follows sweeps the SHAPES a re-identification takes,
  // which can be named without naming him.

  it('states no entity type for the operator', () => {
    expect(allText()).not.toMatch(/sole propriet|sole trad|unincorporated/i);
    expect(allText()).not.toMatch(/\bindividual (?:operator|trader)\b/i);
    expect(allText()).not.toMatch(/\b(?:LLC|Ltd|GmbH|Inc)\b/i);
    // "There is no company behind it" is an entity-status statement too: saying
    // no company exists says a person does. Eric ruled it out (cycle 108) after
    // a review pass argued for restoring it — the ruling is the requirement.
    expect(allText()).not.toMatch(/no company behind/i);
  });

  it('states no residence for the operator, in any section', () => {
    // Residence reached the page as a bare trailing country, but it could come
    // back as a city, a state, or another country entirely — so the pin is on
    // the PHRASING that introduces a location, swept over the whole policy.
    expect(allText()).not.toMatch(/\b(?:based in|located in|operated from|resident in)\b/i);
  });

  it('publishes no contact route but the frozen address', () => {
    // `toContain` alone would be satisfied while a personal email or handle sat
    // beside it. Every address in the policy must BE the frozen one.
    const addresses = allText().match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) expect(address).toBe(POLICY_CONTACT);
  });

  it('publishes no byline in the privacy page shell either', () => {
    // The <title> and <meta description> are game text too, and are the obvious
    // place a byline would land without any POLICY_SECTIONS pin firing. Pinned
    // by SHAPE rather than by name, for the reason in the note above.
    // vitest's root is the client workspace dir, so process.cwd() === client/ —
    // the same idiom tokens.test.ts uses to reach index.html. `import.meta.url`
    // is NOT a file: URL under this transform and throws.
    const html = readFileSync(join(process.cwd(), 'privacy/index.html'), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).not.toMatch(/\b(?:author|copyright|byline)\b/i);
    expect(head).not.toMatch(/[\w.+-]+@[\w.-]+\.\w+/);
  });
});

describe('privacy policy — voice', () => {
  // Word boundaries are load-bearing: without them 'however' and 'trouser'
  // contain 'we' and 'us', and the assertion would fail on innocent prose.
  //
  // FIRST PERSON SINGULAR IS COVERED TOO, and it matters more than the plural:
  // the operator is one person, so 'I do not store it' is the likeliest way the
  // voice comes back. 'I' is matched case-SENSITIVELY (an uppercase pronoun),
  // which keeps it off the lowercase 'i' of ordinary words split by punctuation.
  const FIRST_PERSON = /\b(?:we|our|ours|ourselves|ourself|me|my|mine|myself)\b/i;
  // 'us' is matched case-sensitively so the required disclosure 'in the United
  // States' can be shortened to 'the US' one day without tripping the voice pin.
  const FIRST_PERSON_CASED = /\b(?:[Uu]s|I)\b/;

  function firstPerson(text: string): boolean {
    return FIRST_PERSON.test(text) || FIRST_PERSON_CASED.test(text);
  }

  it('the regexes it is pinned with actually catch first-person prose', () => {
    expect(firstPerson('we do not check it')).toBe(true);
    expect(firstPerson('stored on our servers')).toBe(true);
    expect(firstPerson('never sent to us as a profile')).toBe(true);
    expect(firstPerson('I do not store it')).toBe(true);
    expect(firstPerson('write to me and my provider')).toBe(true);
    expect(firstPerson('we keep it to ourselves')).toBe(true);
    // ...and are not fooled by substrings inside ordinary words, by the reader's
    // own voice, or by the United States disclosure that must survive.
    expect(firstPerson('however, the browser trouser house')).toBe(false);
    expect(firstPerson('your callsign is shown to every other player')).toBe(false);
    expect(firstPerson('processed outside your country, including in the US')).toBe(false);
  });

  it('no standalone first-person token in any paragraph, bullet or trailing line', () => {
    for (const s of POLICY_SECTIONS) {
      for (const line of [...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.trailing ?? [])]) {
        expect(firstPerson(line), `${s.heading}: ${line}`).toBe(false);
      }
    }
  });

  it('no standalone first-person token in any heading either', () => {
    for (const s of POLICY_SECTIONS) {
      expect(firstPerson(s.heading), s.heading).toBe(false);
    }
  });

  it('still addresses the reader directly', () => {
    const text = bodyText(POLICY_SECTIONS);
    expect(text).toMatch(/\byou\b/i);
    expect(text).toMatch(/\byour\b/i);
  });
});

describe('privacy policy — disclosures that must survive the redaction', () => {
  it("keeps Google's processing-location sentence", () => {
    // Swept over the whole policy, not one section: the disclosure must exist,
    // and moving it elsewhere is not a failure.
    expect(bodyText(POLICY_SECTIONS))
      .toContain('Data may be processed outside your country, including in the United States.');
  });

  // Eric ruling 2026-08-27: the Global Privacy Control disclosure (matches the
  // shipped behaviour in analytics/consent.ts's gpcDenied()/consentDefaults()/
  // consentUpdate() — GPC denies both analytics AND the three ad signals).
  it('discloses that Global Privacy Control is honoured, for both analytics and advertising', () => {
    expect(bodyText(POLICY_SECTIONS)).toContain(
      'Hullcracker.io honours the Global Privacy Control signal: a browser that sends it is '
      + 'treated as having declined analytics and advertising consent.',
    );
  });

  it('keeps the frozen contact address, the title, and a stamped date', () => {
    expect(POLICY_CONTACT).toBe('contact@hullcracker.io');
    expect(POLICY_TITLE).toBe('PRIVACY POLICY');
    // The date must stay STAMPED (the file's own rule: it records when the
    // contents last changed), but pinning today's value would only force a test
    // edit on every future policy change without proving the stamp is current.
    expect(POLICY_UPDATED).toMatch(/^Last updated \d{1,2} [A-Z][a-z]+ \d{4}$/);
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
