import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  HORN_IDS,
  sanitizeHornId,
  type FoghornEvent,
  type HornId,
} from '../index.js';

// The Foghorn (Story 4.5) shared-half pins — amendments 51-58. Everything the
// server and client BOTH have to agree on lives here: the horn id space, its
// fail-open sanitizer, and the one sim-authoritative cadence.
//
// What is deliberately NOT pinned here: the volume-tier bounds and the
// island muffle, which are per-observer server logic (signals.ts) verified by
// their own independently-reimplemented oracle in
// server/src/__tests__/perception.test.ts; and every presentation knob (tier
// gains, mix cap, chevron geometry/TTL, horn voices), which is client-only.

describe('the horn catalog (amendment 52)', () => {
  it('ships EXACTLY ONE horn — a second variant is Eric-gated CONTENT, not an implementation choice', () => {
    // This pin is the scope fence. A cycle that adds a horn without an Eric
    // ruling fails here first, deliberately.
    expect(HORN_IDS).toEqual(['standard']);
    expect(HORN_IDS).toHaveLength(1);
  });

  it('the default horn is a member of the catalog', () => {
    expect((HORN_IDS as readonly string[]).includes(DEFAULT_HORN_ID)).toBe(true);
    expect(DEFAULT_HORN_ID).toBe('standard');
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
  it('gates honks on a positive finite cooldown (1.5s — amendment 56)', () => {
    expect(CONFIG.foghorn.cooldownMs).toBe(1500);
    expect(Number.isFinite(CONFIG.foghorn.cooldownMs)).toBe(true);
    expect(CONFIG.foghorn.cooldownMs).toBeGreaterThan(0);
  });

  it('carries NO reach and NO presentation knob — tiers derive from the listener (amendments 42/53)', () => {
    // Reach is the LISTENER's own sightOf/muzzleFlash/radarRange, so no
    // foghorn range constant may exist; and no FOURTH vision constant was
    // added for it either.
    expect(Object.keys(CONFIG.foghorn)).toEqual(['cooldownMs']);
    expect(Object.keys(CONFIG.vision)).not.toContain('foghorn');
    expect(Object.keys(CONFIG.vision)).not.toContain('horn');
  });
});

describe('FoghornEvent wire shape (amendments 51/52)', () => {
  it('a fogged listener gets {k,h,b,v} in that key order — no position, no id', () => {
    const heard: FoghornEvent = { k: 'fh', h: 'standard', b: 1.25, v: 2 };
    expect(Object.keys(heard)).toEqual(['k', 'h', 'b', 'v']);
    // The anti-cheat law, stated as a key-SET assertion: nothing positional,
    // nothing identifying, and no correlation handle (amendment 45's rule).
    for (const forbidden of ['x', 'y', 'id', 'self']) {
      expect(Object.keys(heard)).not.toContain(forbidden);
    }
  });

  it('the honker gets {k,h,self} — no bearing to yourself', () => {
    const own: FoghornEvent = { k: 'fh', h: 'standard', self: true };
    expect(Object.keys(own)).toEqual(['k', 'h', 'self']);
    expect(own.self).toBe(true); // present-means-true; never emitted as false
  });

  it('only the omniscient spectator path carries {k,h,x,y}', () => {
    const spec: FoghornEvent = { k: 'fh', h: 'standard', x: 120, y: -40 };
    expect(Object.keys(spec)).toEqual(['k', 'h', 'x', 'y']);
    expect(Object.keys(spec)).not.toContain('id');
  });

  it('the volume tier is a THREE-value enum, never a gain fraction', () => {
    const tiers: NonNullable<FoghornEvent['v']>[] = [1, 2, 3];
    expect(tiers).toEqual([1, 2, 3]);
    // Gains (1 / 0.75 / 0.5) are CLIENT-side presentation; putting one on the
    // wire would make hearing a property of sound rather than of the listener,
    // which is exactly what amendment 53 rejected.
    for (const v of tiers) expect(Number.isInteger(v)).toBe(true);
  });

  it('`h` is typed to the catalog, so an invented variant cannot reach the wire', () => {
    const h: HornId = DEFAULT_HORN_ID;
    const ev: FoghornEvent = { k: 'fh', h, self: true };
    expect((HORN_IDS as readonly string[]).includes(ev.h)).toBe(true);
  });
});
