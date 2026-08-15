// THE SHIP-ROLE SEAM (Story 6.3, epic-6 amendment 13) — the truth table for
// game/participants.ts plus the two structural properties that make the seam
// worth building AHEAD of its consumer.
//
// Why this file exists at all: `ShipRecord.isDrone` used to answer three
// different questions with one boolean, and they were the same set only
// because every non-human hull was a weaponless PvE fleet ship. Story 6.4
// lands AI CAPTAINS, who are participants and are not fleet hulls. The
// property tests below are the ones that catch a future agent "simplifying"
// `isParticipant` into `role === 'captain'` — which reads identically today
// and silently drops every bot out of the win check when 6.4 lands.

import { describe, it, expect } from 'vitest';
import { World } from '../game/world.js';
import { isFleetHull, isHuman, isParticipant, type ShipRole } from '../game/participants.js';

const ROLES: ShipRole[] = ['captain', 'fleet'];

describe('participants — the three readings', () => {
  it('a captain is a human, a participant, and not fleet content', () => {
    const s = { role: 'captain' as const };
    expect(isHuman(s)).toBe(true);
    expect(isParticipant(s)).toBe(true);
    expect(isFleetHull(s)).toBe(false);
  });

  it('a fleet hull is content only — no vote in the outcome, not a person', () => {
    const s = { role: 'fleet' as const };
    expect(isHuman(s)).toBe(false);
    expect(isParticipant(s)).toBe(false);
    expect(isFleetHull(s)).toBe(true);
  });

  it('participant and fleet-hull are exact complements at every role', () => {
    for (const role of ROLES) expect(isParticipant({ role })).toBe(!isFleetHull({ role }));
  });

  it('THE SEAM: participant is the NEGATION of fleet, never "=== captain"', () => {
    // The property, stated so it survives a role the union does not carry yet:
    // a hypothetical THIRD role must land on the participant side and OUTSIDE
    // both `isHuman` and `isFleetHull`. Story 6.4's 'bot' is exactly that hull,
    // and this is the assertion that fails if someone rewrites isParticipant as
    // a positive captain test. (Cast because 'bot' is deliberately NOT in the
    // union yet — a branch with no producer is dead code.)
    const bot = { role: 'bot' as unknown as ShipRole };
    expect(isParticipant(bot)).toBe(true);
    expect(isFleetHull(bot)).toBe(false);
    expect(isHuman(bot)).toBe(false); // FR34: a bot may never satisfy minHumans
  });
});

describe('participants — the seam is what World actually stamps', () => {
  it('addShip defaults to captain, and World.isFleetHull agrees with the predicate', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    const cap = w.addShip('a', 'A');
    const fleet = w.addShip('f', 'FLEET', 'fleet', 'droneSmall');
    expect(cap.role).toBe('captain');
    expect(fleet.role).toBe('fleet');
    // The id-keyed method and the record-keyed predicate are ONE definition.
    expect(w.isFleetHull('a')).toBe(isFleetHull(cap));
    expect(w.isFleetHull('f')).toBe(isFleetHull(fleet));
    expect(w.isFleetHull('nobody')).toBe(false); // absent record fails closed
  });
});
