// sanitizeRoomOptions (server/src/rooms/roomOptions.ts) — the gate for
// client-supplied dev-only room options (FINDINGS C1/C2). Pure function: no
// Colyseus room needed to exercise every branch.

import { describe, it, expect } from 'vitest';
import { NAME_MAX, sanitizeName, sanitizeRoomOptions, type RoomOptions } from '../rooms/roomOptions.js';

const MATCH_OVERRIDE = { sandbox: true, minHumans: 1, countdownMs: 1, resultsMs: 1 };
const ZONE_OVERRIDE = { grace: 1, shrinkDuration: 1, endRadiusFraction: 0.1 };

describe('sanitizeRoomOptions — devEnabled=false (production default)', () => {
  it('strips matchOverride and reports it rejected', () => {
    const options: RoomOptions = { matchOverride: MATCH_OVERRIDE };
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, false);
    expect(sanitized.matchOverride).toBeUndefined();
    expect(rejectedKeys).toEqual(['matchOverride']);
  });

  it('strips zoneOverride and reports it rejected', () => {
    const options: RoomOptions = { zoneOverride: ZONE_OVERRIDE };
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, false);
    expect(sanitized.zoneOverride).toBeUndefined();
    expect(rejectedKeys).toEqual(['zoneOverride']);
  });

  it('strips both simultaneously (hostile payload with sandbox + zone desync)', () => {
    const options: RoomOptions = { matchOverride: MATCH_OVERRIDE, zoneOverride: ZONE_OVERRIDE };
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, false);
    expect(sanitized).toEqual({});
    expect(rejectedKeys.sort()).toEqual(['matchOverride', 'zoneOverride']);
  });

  it('a bare {matchOverride:{sandbox:true}} payload never reaches sanitized output', () => {
    const options: RoomOptions = { matchOverride: { sandbox: true } };
    const { sanitized } = sanitizeRoomOptions(options, false);
    expect(sanitized.matchOverride?.sandbox).toBeUndefined();
  });

  it('a DoS-shaped payload (huge minHumans/resultsMs) never reaches sanitized output', () => {
    const options: RoomOptions = { matchOverride: { minHumans: 9999, resultsMs: 1e9 } };
    const { sanitized } = sanitizeRoomOptions(options, false);
    expect(sanitized.matchOverride).toBeUndefined();
  });

  it('no rejection noise when the caller passed neither override', () => {
    const { sanitized, rejectedKeys } = sanitizeRoomOptions({}, false);
    expect(sanitized).toEqual({});
    expect(rejectedKeys).toEqual([]);
  });

  it('strips mapSeed and reports it rejected (a production client can never pin a map)', () => {
    const { sanitized, rejectedKeys } = sanitizeRoomOptions({ mapSeed: 1234 }, false);
    expect(sanitized.mapSeed).toBeUndefined();
    expect(rejectedKeys).toEqual(['mapSeed']);
  });

  it('name (a legitimate, non-dev option) is unaffected by gating — sanitizer is scoped to overrides only', () => {
    const options: RoomOptions = { name: 'CAPTAIN' };
    const { rejectedKeys } = sanitizeRoomOptions(options, false);
    expect(rejectedKeys).toEqual([]);
  });
});

describe('sanitizeRoomOptions — devEnabled=true (HC_DEV_OPTIONS=1, smokes/tests)', () => {
  it('passes matchOverride through unchanged', () => {
    const options: RoomOptions = { matchOverride: MATCH_OVERRIDE };
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, true);
    expect(sanitized.matchOverride).toEqual(MATCH_OVERRIDE);
    expect(rejectedKeys).toEqual([]);
  });

  it('passes zoneOverride through unchanged', () => {
    const options: RoomOptions = { zoneOverride: ZONE_OVERRIDE };
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, true);
    expect(sanitized.zoneOverride).toEqual(ZONE_OVERRIDE);
    expect(rejectedKeys).toEqual([]);
  });

  it('passes both through unchanged', () => {
    const options: RoomOptions = { matchOverride: MATCH_OVERRIDE, zoneOverride: ZONE_OVERRIDE };
    const { sanitized } = sanitizeRoomOptions(options, true);
    expect(sanitized).toEqual({ matchOverride: MATCH_OVERRIDE, zoneOverride: ZONE_OVERRIDE });
  });

  it('absent options fine — no crash, both fields undefined', () => {
    const { sanitized, rejectedKeys } = sanitizeRoomOptions({}, true);
    expect(sanitized.matchOverride).toBeUndefined();
    expect(sanitized.zoneOverride).toBeUndefined();
    expect(sanitized.mapSeed).toBeUndefined();
    expect(rejectedKeys).toEqual([]);
  });

  it('passes a non-negative integer mapSeed through (0 is a legal seed)', () => {
    expect(sanitizeRoomOptions({ mapSeed: 1234 }, true).sanitized.mapSeed).toBe(1234);
    expect(sanitizeRoomOptions({ mapSeed: 0 }, true).sanitized.mapSeed).toBe(0);
  });

  it('value-sanitizes mapSeed EVEN under dev: junk is stripped, not honored', () => {
    const junk: unknown[] = [-1, 1.5, NaN, Infinity, '1234', null, {}, true];
    for (const v of junk) {
      const { sanitized, rejectedKeys } = sanitizeRoomOptions(
        { mapSeed: v as number }, true,
      );
      expect(sanitized.mapSeed).toBeUndefined();
      expect(rejectedKeys).toEqual([]); // stripped silently — dev asked, dev gave junk
    }
  });
});


// --- callsign hardening (Story 2.3 — deferred-work 127/130) ------------------

describe('sanitizeName — options.name is client-supplied and untrusted', () => {
  it('type-guards a NON-STRING to undefined instead of throwing on .trim()', () => {
    // The pre-2.3 call site was `options.name?.trim()`, which THREW on a number
    // or an object. undefined ⇒ the caller falls back to CAPTAIN-n.
    expect(sanitizeName(123)).toBeUndefined();
    expect(sanitizeName({ toString: () => 'HAX' })).toBeUndefined();
    expect(sanitizeName([])).toBeUndefined();
    expect(sanitizeName(null)).toBeUndefined();
    expect(sanitizeName(undefined)).toBeUndefined();
    expect(sanitizeName(true)).toBeUndefined();
  });

  it('trims, and treats an empty / all-whitespace name as absent', () => {
    expect(sanitizeName('  SALTY DOG  ')).toBe('SALTY DOG');
    expect(sanitizeName('')).toBeUndefined();
    expect(sanitizeName('    ')).toBeUndefined();
  });

  it('caps at NAME_MAX CODE POINTS (the client entry cap)', () => {
    const long = 'X'.repeat(40);
    expect(sanitizeName(long)).toHaveLength(NAME_MAX);
    expect(NAME_MAX).toBe(14);
  });

  it('counts CODE POINTS, never UTF-16 units — a surrogate pair is not split', () => {
    const emoji = '🚢'.repeat(20); // 20 code points, 40 UTF-16 units
    const capped = sanitizeName(emoji) ?? '';
    expect([...capped]).toHaveLength(NAME_MAX);
    expect(capped).toBe('🚢'.repeat(NAME_MAX)); // no lone surrogate at the tail
  });

  it('leaves a name already inside the cap byte-identical', () => {
    expect(sanitizeName('CAPTAIN-9')).toBe('CAPTAIN-9');
  });

  // --- REGRESSION (Story 2.3 review gate): identity spoofing ----------------
  // Control/format code points survived trim + cap, so a callsign could render
  // as a BLANK captain on every plate/feed/results row, or reverse the display
  // order of everything painted after it.

  it('a ZERO-WIDTH-ONLY callsign falls back to CAPTAIN-n, never a blank identity', () => {
    expect(sanitizeName('\u200b\u200b\u200b')).toBeUndefined(); // ZWSP
    expect(sanitizeName('\u200d\u2060\ufeff')).toBeUndefined(); // ZWJ / word-joiner / BOM
    expect(sanitizeName('\u200b   \u200b')).toBeUndefined(); // invisibles + whitespace
  });

  it('strips an embedded BIDI OVERRIDE instead of letting it mangle the roster', () => {
    expect(sanitizeName('AB\u202eCD')).toBe('ABCD'); // RIGHT-TO-LEFT OVERRIDE
    expect(sanitizeName('\u2066HORNET\u2069')).toBe('HORNET'); // isolates
  });

  it('strips control characters (a newline must never reach a rendered plate)', () => {
    expect(sanitizeName('OLD\nSALT')).toBe('OLDSALT');
    expect(sanitizeName('OLD\u0000SALT')).toBe('OLDSALT');
    expect(sanitizeName('\u0007')).toBeUndefined();
  });

  it('strips BEFORE the cap, so invisibles can never eat visible characters', () => {
    expect(sanitizeName('\u200b'.repeat(20) + 'HORNET')).toBe('HORNET');
    expect(sanitizeName('\u200b'.repeat(20) + 'X'.repeat(40))).toHaveLength(NAME_MAX);
  });

  it('leaves ordinary names — including emoji — untouched', () => {
    expect(sanitizeName('SALTY DOG')).toBe('SALTY DOG');
    expect(sanitizeName('🚢 AHOY')).toBe('🚢 AHOY'); // a paired surrogate is one code point
  });
});
