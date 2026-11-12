import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  HORN_IDS,
  sanitizeHornId,
} from '../index.js';

// The Foghorn (Story 4.5) shared-half pins — amendments 51-58. Everything the
// server and client BOTH have to agree on lives here: the horn id space, its
// fail-open sanitizer, and the one sim-authoritative cadence.
//
// What is deliberately NOT pinned here: the volume-band bounds (twelfths of
// the listener's intel range since Story 9.8, epic-9 amendment 107 / ruling
// 129; eighths since Story 4.9, amendment 122) and the island
// muffle, which are per-observer server logic (signals.ts) verified by their
// own independently-reimplemented oracle in
// server/src/__tests__/perception.test.ts; and every presentation knob (band
// gains, mix cap, chevron geometry/TTL, horn voices), which is client-only.

describe('the horn catalog (amendment 52)', () => {
  // Story 10.13 (Eric 2026-11-11: five selectable horns): the catalog's
  // CONTENTS are Eric's ruling and are not pinned here; the STRUCTURE both
  // sides rely on is.
  it('is a non-empty catalog of unique ids', () => {
    expect(HORN_IDS.length).toBeGreaterThan(0);
    expect(new Set(HORN_IDS).size).toBe(HORN_IDS.length);
  });

  it('the default horn is a member of the catalog', () => {
    expect((HORN_IDS as readonly string[]).includes(DEFAULT_HORN_ID)).toBe(true);
  });
});

describe('sanitizeHornId — fail-open to the default, never a throw (amendment 52)', () => {
  it('passes through each valid id', () => {
    for (const id of HORN_IDS) expect(sanitizeHornId(id)).toBe(id);
  });

  it('falls back to the default for unknown strings (an OLD CLIENT hearing a NEW horn)', () => {
    // The whole reason this sanitizer exists: a future purchased horn must
    // degrade to a SOUND on a stale client, never to silence or an exception.
    expect(sanitizeHornId('klaxon')).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId('')).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId('STANDARD')).toBe(DEFAULT_HORN_ID); // case-sensitive
    expect(sanitizeHornId(' standard')).toBe(DEFAULT_HORN_ID);
  });

  it('falls back to the default for non-string input', () => {
    expect(sanitizeHornId(undefined)).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId(null)).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId(0)).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId(NaN)).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId(true)).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId(['standard'])).toBe(DEFAULT_HORN_ID);
    expect(sanitizeHornId({ h: 'standard' })).toBe(DEFAULT_HORN_ID);
  });

  it('never throws, for any input shape', () => {
    const hostile: unknown[] = [
      Symbol('standard'),
      () => 'standard',
      Object.create(null),
      new Map(),
      { toString: () => 'standard' },
    ];
    for (const raw of hostile) expect(() => sanitizeHornId(raw)).not.toThrow();
  });
});

describe('CONFIG.foghorn — the sim-authoritative cadence, and nothing else', () => {
  it('gates honks on a positive finite cooldown (amendment 56)', () => {
    expect(Number.isFinite(CONFIG.foghorn.cooldownMs)).toBe(true);
    expect(CONFIG.foghorn.cooldownMs).toBeGreaterThan(0);
  });

  it('carries NO reach and NO presentation knob — bands derive from the listener (amendments 42/53/122)', () => {
    // Reach is the LISTENER's own intel range (stats.radarRange, cut into
    // eighths — Story 4.9), so no foghorn range constant may exist; and no
    // FOURTH vision constant was added for it either.
    expect(Object.keys(CONFIG.foghorn)).toEqual(['cooldownMs']);
    expect(Object.keys(CONFIG.vision)).not.toContain('foghorn');
    expect(Object.keys(CONFIG.vision)).not.toContain('horn');
  });
});
