// THE CLIENT'S THIRD LIFECYCLE STATE (Story 5.2, amendments 10/11/16).
//
// `you.alive` goes FALSE at sink-entry (the kill is real immediately) while the
// captain keeps helm, hotbar, firing arc and foghorn for five more seconds, so
// the controls stop keying on `alive` and start keying on these predicates.
// What is pinned here is the truth table itself, the RECORDED TRAP (main.ts
// builds its HUD status with `alive: you?.alive ?? true`, so a missing `you`
// reads as ALIVE — the third state must never inherit that), and the deferred
// modal's founder rule.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { conningFlag, founderDue, isSinkingNow, type SinkingOwn } from '../sim/sinkingWindow.js';
import { conning } from '../render/hud.js';

const SINCE = 900_000;
const UNTIL = SINCE + CONFIG.ship.sinkingWindowMs;

/** The three states, as the wire delivers them. */
const ALIVE: SinkingOwn = { alive: true };
const SINKING: SinkingOwn = { alive: false, sinkingUntil: UNTIL };
const DEAD: SinkingOwn = { alive: false }; // foundered: the key is OMITTED, never undefined

describe('isSinkingNow — the third state', () => {
  it('is true only between sink-entry and the founder deadline', () => {
    expect(isSinkingNow(SINKING, SINCE)).toBe(true);
    expect(isSinkingNow(SINKING, UNTIL - 1)).toBe(true);
    // Inclusive at the deadline, matching the shared hasFoundered(`>=`): the
    // hull stops moving on the tick it founders, never one tick apart.
    expect(isSinkingNow(SINKING, UNTIL)).toBe(false);
    expect(isSinkingNow(SINKING, UNTIL + 5000)).toBe(false);
  });

  it('is false for both of the other two states', () => {
    expect(isSinkingNow(ALIVE, SINCE)).toBe(false);
    expect(isSinkingNow(DEAD, SINCE)).toBe(false);
  });

  it('never treats a MISSING own ship as sinking (the `?? true` trap)', () => {
    // main.ts's HUD `alive` deliberately defaults a missing `you` to TRUE so the
    // pre-first-frame gap does not read as death. The window must NOT inherit
    // that default in either direction: absent `you` is simply not a window, so
    // no frame shape can fabricate one that keeps a torn-down hull's controls
    // live (and none can suppress the elimination modal forever).
    expect(isSinkingNow(null, SINCE)).toBe(false);
    expect(isSinkingNow(undefined, SINCE)).toBe(false);
  });

  it('is disjoint from `alive` even if a frame carried both', () => {
    // Defensive: the server omits the key unless the hull is sinking, but the
    // predicate must never report a live hull as sinking whatever arrives.
    expect(isSinkingNow({ alive: true, sinkingUntil: UNTIL }, SINCE)).toBe(false);
  });
});

describe('conningFlag — `alive` widened through the window', () => {
  it('reads TRUE while alive AND while sinking, FALSE once foundered', () => {
    expect(conningFlag(ALIVE, SINCE)).toBe(true);
    expect(conningFlag(SINKING, SINCE)).toBe(true);
    expect(conningFlag(SINKING, UNTIL)).toBe(false);
    expect(conningFlag(DEAD, SINCE)).toBe(false);
  });

  it('preserves UNDEFINED for a missing own ship, so each gate keeps its own default', () => {
    // The shipped gates each pick their own default deliberately (`?? true` for
    // the ability press, `?? false` for the horn, `=== true` for helm/zoom,
    // `=== false` for the server-denial guard). Collapsing the absence to a
    // boolean here would silently overrule all four.
    expect(conningFlag(null, SINCE)).toBeUndefined();
    expect(conningFlag(undefined, SINCE)).toBeUndefined();
  });
});

describe('conning(status) — the HUD-side gate', () => {
  it('is true while alive or sinking, false once foundered', () => {
    expect(conning({ alive: true, sinking: false })).toBe(true);
    expect(conning({ alive: false, sinking: true })).toBe(true);
    expect(conning({ alive: false, sinking: false })).toBe(false);
  });
});

describe('founderDue — the deferred ELIMINATED modal', () => {
  it('holds the modal for the whole window and fires exactly at founder', () => {
    // The modal is FOCUSED (it clears held keys and suppresses every non-overlay
    // key), so a live helm is impossible while it is up — hence the deferral.
    expect(founderDue(true, true)).toBe(false); // latched, still sinking → hold
    expect(founderDue(true, false)).toBe(true); // latched, window over → open
  });

  it('never fires without a latched elimination', () => {
    expect(founderDue(false, false)).toBe(false);
    expect(founderDue(false, true)).toBe(false);
  });
});
