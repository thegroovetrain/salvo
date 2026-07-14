// sanitizeRoomOptions (server/src/rooms/roomOptions.ts) — the gate for
// client-supplied dev-only room options (FINDINGS C1/C2). Pure function: no
// Colyseus room needed to exercise every branch.

import { describe, it, expect } from 'vitest';
import { sanitizeRoomOptions, type RoomOptions } from '../rooms/roomOptions.js';

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
    expect(rejectedKeys).toEqual([]);
  });
});
