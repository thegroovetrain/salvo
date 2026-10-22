import { describe, expect, it } from 'vitest';
import { POLICY_SECTIONS, POLICY_TITLE, POLICY_UPDATED } from '../privacy/policyCopy.js';

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
