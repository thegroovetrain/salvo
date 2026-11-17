// THE SHIP-ROLE SEAM (Story 6.3, epic-6 amendment 13) — the truth table for
// game/participants.ts.
//
// Why this file exists at all: `ShipRecord.isDrone` used to answer three
// different questions with one boolean. Story 6.4 landed AI CAPTAINS (the
// `'bot'` role), participants that are not people; Story 10.8 retired the PvE
// fleet and its `'fleet'` role, so every role left contests the outcome. The
// property below is the one that catches a future agent "simplifying"
// `isParticipant` into `role === 'captain'`, which silently drops every bot
// out of the win check.

import { describe, it, expect } from 'vitest';
import { World } from '../game/world.js';
import { isHuman, isParticipant, type ShipRole } from '../game/participants.js';

const ROLES: ShipRole[] = ['captain', 'bot'];

describe('participants — the two readings', () => {
  it('a captain is a human and a participant', () => {
    const s = { role: 'captain' as const };
    expect(isHuman(s)).toBe(true);
    expect(isParticipant(s)).toBe(true);
  });

  it('THE SEAM: a bot is a participant and never a human', () => {
    // FR34: a bot may never satisfy minHumans — and it must land on the
    // participant side with no edit to the predicate. This is the assertion
    // that fails if someone rewrites isParticipant as a positive captain test.
    const bot = { role: 'bot' as const };
    expect(isParticipant(bot)).toBe(true);
    expect(isHuman(bot)).toBe(false);
  });

  it('every role contests the outcome (Story 10.8: the fleet role is gone)', () => {
    for (const role of ROLES) expect(isParticipant({ role })).toBe(true);
  });
});

describe('participants — the seam is what World actually stamps', () => {
  it('addShip defaults to captain; addBot stamps bot', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    const cap = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    const bot = w.addBot(undefined, undefined); // Story 6.4: the second role, stamped for real
    expect(cap.role).toBe('captain');
    expect(bot.role).toBe('bot');
    expect(isHuman(cap)).toBe(true);
    expect(isHuman(bot)).toBe(false);
  });
});
