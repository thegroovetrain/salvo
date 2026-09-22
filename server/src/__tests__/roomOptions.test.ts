// sanitizeRoomOptions (server/src/rooms/roomOptions.ts) — the gate for
// client-supplied dev-only room options (FINDINGS C1/C2). Pure function: no
// Colyseus room needed to exercise every branch.

import { describe, it, expect } from 'vitest';
import { DEFAULT_GUN, GUN_IDS } from '@salvo/shared';
import {
  DEV_LIST_MAX,
  NAME_MAX,
  sanitizeGun,
  sanitizeName,
  sanitizeRoomOptions,
  type JoinOptions,
  type RoomOptions,
} from '../rooms/roomOptions.js';

const MATCH_OVERRIDE = { sandbox: true, minHumans: 1, countdownMs: 1, resultsMs: 1, joinWindowMs: 0, mulligan: true };
const ZONE_OVERRIDE = { beatMs: 1000, ringSteps: [1 / 3, 2 / 3], offsetCap: 0.5, terminalSightFactor: 1 };

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

  it('the Story 8.10 smoke arm {mulligan:true} is stripped with the rest', () => {
    // It makes the ROOM redraw every captain's opening hand — a dev tool for
    // the headless smoke, never something a production client may ask for.
    const options: RoomOptions = { matchOverride: { mulligan: true } };
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, false);
    expect(sanitized.matchOverride).toBeUndefined();
    expect(rejectedKeys).toEqual(['matchOverride']);
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

// --- fitOverride (Story 8.10, amendment 65; re-homed here in Story 8.14) -----
// THE DEV SPAWN FIT is the ONE dev id list left now that the deck door is gone.
// It used to arrive through `sanitizeDeckOptions` at the seat; with no deck to
// pay a copy out of it is admitted here instead, by the same `admitDevIdList`
// — same gate, same bounds, same reporting. PRODUCTION MUST NEVER SEE IT, which
// is what the gate-off rows pin. Ids are NOT filtered here: the World drops an
// id the catalog cannot resolve, a stub line, and one already held at its cap.

describe('sanitizeRoomOptions — fitOverride (the dev spawn fit)', () => {
  const FIT = ['heavyTorpedo', 'nope', 'lightTorpedo'];

  it('is DROPPED and reported without HC_DEV_OPTIONS, whatever its shape', () => {
    const out = sanitizeRoomOptions({ fitOverride: FIT }, false);
    expect(out.sanitized.fitOverride).toBeUndefined();
    expect(out.rejectedKeys).toEqual(['fitOverride']);
    expect(sanitizeRoomOptions({ fitOverride: 'junk' as unknown as string[] }, false).rejectedKeys)
      .toEqual(['fitOverride']);
  });

  it('is honoured under devEnabled as a FRESH array, ids unfiltered (the World judges them)', () => {
    const list = [...FIT];
    const out = sanitizeRoomOptions({ fitOverride: list }, true);
    expect(out.sanitized.fitOverride).toEqual(FIT);
    expect(out.sanitized.fitOverride).not.toBe(list);
    expect(out.rejectedKeys).toEqual([]);
  });

  it('DROPS AND REPORTS a malformed shape, on the shared dev-list bounds', () => {
    const bad: unknown[] = [
      'heavyTorpedo',
      { 0: 'heavyTorpedo' },
      null,
      ['heavyTorpedo', 7],
      new Array<string>(DEV_LIST_MAX + 1).fill('heavyTorpedo'),
      ['x'.repeat(65)],
    ];
    for (const v of bad) {
      const out = sanitizeRoomOptions({ fitOverride: v as string[] }, true);
      expect(out.sanitized.fitOverride, JSON.stringify(v)?.slice(0, 40)).toBeUndefined();
      // A drop is never silent — the room logs the rejected keys once.
      expect(out.rejectedKeys, JSON.stringify(v)?.slice(0, 40)).toEqual(['fitOverride']);
    }
    // ...and the bounds themselves are inclusive.
    expect(sanitizeRoomOptions({ fitOverride: new Array<string>(DEV_LIST_MAX).fill('heavyTorpedo') }, true)
      .sanitized.fitOverride).toHaveLength(DEV_LIST_MAX);
    expect(sanitizeRoomOptions({ fitOverride: ['x'.repeat(64)] }, true).sanitized.fitOverride)
      .toEqual(['x'.repeat(64)]);
  });

  it('an EMPTY list is honoured — an explicit "fit nothing" is a legal ask', () => {
    expect(sanitizeRoomOptions({ fitOverride: [] }, true).sanitized.fitOverride).toEqual([]);
  });

  it('no rejection noise when the caller passed no override', () => {
    expect(sanitizeRoomOptions({}, true).rejectedKeys).toEqual([]);
    expect(sanitizeRoomOptions({}, false).rejectedKeys).toEqual([]);
  });

  it('is reported LAST of the room keys when a hostile payload carries all four', () => {
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(
      { matchOverride: MATCH_OVERRIDE, zoneOverride: ZONE_OVERRIDE, mapSeed: 7, fitOverride: FIT },
      false,
    );
    expect(sanitized).toEqual({});
    expect(rejectedKeys).toEqual(['matchOverride', 'zoneOverride', 'mapSeed', 'fitOverride']);
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

// sanitizeGun (Story 8.14, epic-8 amendment 95) — THE SEAT'S GUN at both
// doors, and the whole of what replaced the deck door. It is an IDENTITY option
// like `cls` and `horn`, not a privileged override: it fails OPEN to `deckGun`
// and can never refuse a join. All three ids are accepted today;
// `machineGun`/`flak` mount the shipped deck-gun module until Story 8.15.

describe('sanitizeGun — the three ids', () => {
  it('passes every GunId through verbatim', () => {
    for (const id of GUN_IDS) expect(sanitizeGun(id)).toBe(id);
    expect(GUN_IDS).toEqual(['deckGun', 'machineGun', 'flak']);
  });

  it('coerces anything else to deckGun — never a throw, never a refusal', () => {
    for (const bad of ['gun', 'DECKGUN', '', ' deckGun', 'monitor', 42, {}, [], null, true, undefined]) {
      expect(sanitizeGun(bad), String(bad)).toBe(DEFAULT_GUN);
    }
    expect(DEFAULT_GUN).toBe('deckGun');
  });

  it('LOGS a present-but-invalid value once, and says nothing at all about an absent one', () => {
    const lines: { event: string; fields: unknown }[] = [];
    const log = { warn: (event: string, fields?: unknown) => lines.push({ event, fields }) };
    expect(sanitizeGun('bogus', log as unknown as Parameters<typeof sanitizeGun>[1])).toBe(DEFAULT_GUN);
    expect(lines).toHaveLength(1);
    expect(lines[0].event).toBe('join.gunCoerced');
    sanitizeGun(undefined, log as unknown as Parameters<typeof sanitizeGun>[1]);
    sanitizeGun('flak', log as unknown as Parameters<typeof sanitizeGun>[1]);
    expect(lines).toHaveLength(1); // absent and valid both stay silent
  });

  it('never reads the prototype: an inherited gun is not this seat\'s pick', () => {
    const inherited = Object.create({ gun: 'flak' }) as { gun?: unknown };
    expect(sanitizeGun(inherited.gun)).toBe('flak'); // a READ of the value still resolves...
    expect(sanitizeGun((inherited as JoinOptions).gun)).toBe('flak'); // ...the door passes the value, not the object
  });
});

// THE DECK KEYS ARE DEAD KEYS (Story 8.14, amendment 89a). `deck`, `deckId`
// and `deckOverride` used to be a refusal, a bounded string and a dev override.
// The deck door is deleted: they are now unknown options, dropped in silence
// like any other, and there is no 4402 refusal code to export.

describe('the retired deck keys are dropped like any unknown option', () => {
  it('sanitizeRoomOptions ignores them entirely, dev gate open or shut', () => {
    const opts = { deck: ['armor'], deckId: 'd', deckOverride: ['armor'] } as unknown as RoomOptions;
    for (const dev of [false, true]) {
      const { sanitized, rejectedKeys } = sanitizeRoomOptions(opts, dev);
      expect(rejectedKeys, String(dev)).toEqual([]);
      expect(Object.hasOwn(sanitized, 'deck'), String(dev)).toBe(false);
      expect(Object.hasOwn(sanitized, 'deckId'), String(dev)).toBe(false);
      expect(Object.hasOwn(sanitized, 'deckOverride'), String(dev)).toBe(false);
    }
  });

  it('a `deck` key beside a real option does not disturb it', () => {
    const opts = { deck: [], fitOverride: ['heavyTorpedo'] } as unknown as RoomOptions;
    expect(sanitizeRoomOptions(opts, true).sanitized.fitOverride).toEqual(['heavyTorpedo']);
    expect(sanitizeRoomOptions(opts, true).rejectedKeys).toEqual([]);
  });

  it('the module exports no deck surface at all — no refusal code, no deck sanitizer', async () => {
    const mod = await import('../rooms/roomOptions.js');
    for (const gone of ['sanitizeDeckOptions', 'DECK_ID_MAX', 'DECK_OVERRIDE_MAX', 'DECK_REFUSED_CODE']) {
      expect(Object.hasOwn(mod, gone), gone).toBe(false);
    }
  });
});
