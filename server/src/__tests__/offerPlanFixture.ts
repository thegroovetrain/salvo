// THE OFFER PLAN, as a server test reads it (Story 10.7, epic-10 amendment 13):
// slot 0 is a SHIP card (a `ladder` line), slot 1 an EQUIPMENT card — and on a
// level-zero hull every eligible equipment line is a BARE WEAPON, so slot 1 is
// a weapon this hull can take. Asserted by catalog kind and the shared
// `pickRefusal` (the same predicate the server spends through), never by a
// pinned id.

import { expect } from 'vitest';
import { CATALOG, pickRefusal } from '@salvo/shared';
import type { ShipRecord } from '../game/world.js';

/** A level-zero hand: a ladder in slot 0 and a takeable bare weapon in slot 1. */
export function expectLevelZeroPlan(ship: ShipRecord, label = ship.id): void {
  const offer = ship.offer;
  expect(offer, label).not.toBeNull();
  const [ship0, equip1] = offer!;
  expect(CATALOG[ship0]?.kind, `${label}: slot 0 ${ship0}`).toBe('ladder');
  expect(CATALOG[equip1]?.kind, `${label}: slot 1 ${equip1}`).toBe('equipment');
  expect(ship.cards.includes(equip1), `${label}: slot 1 ${equip1} is copy 1`).toBe(false);
  expect(pickRefusal(ship.cards, ship.loadout.map((s) => s.equipmentId), equip1), `${label}: slot 1 ${equip1}`).toBeNull();
}
