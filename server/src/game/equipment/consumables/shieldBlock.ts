// SHIELD BLOCK (Story 8.16, catalog-v3 R37, epic-8 amendments 100, 116–118) —
// a key-fired consumable. One copy writes the ship's shield seat
// `{ hpLeft: CONFIG.shieldBlock.hp, until: now + durationMs }` through the
// World's `setShield` capability; a second copy REPLACES the first (a fresh
// 100 hp for a fresh 10 s — never stacked).
//
// The absorb path is NOT here: the World's damage gate (`applyDamage`) already
// runs `absorbShield` after the DAMAGE CUT and before the hull decrement, on
// EVERY damage source — storm bites and phosphor burn included (amendment 118).
// This row only arms the seat.
//
// NEVER REFUSED WHILE AFLOAT: a full hull still buys a shield (it absorbs the
// NEXT hit). A sinking or sunk hull is refused 'blocked' — the sinking-
// activation gate lets a doomed captain's presses through (amendment 10), and
// "afloat-only" lives in the row (the HULL REPAIR precedent). Nothing is spent
// on a denial (ONE SPEND LAW, row.ts).

import { CONFIG, isAfloat, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { consumableRow, type ConsumableRow } from './row.js';

function shieldBlockEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  if (!isAfloat(ctx.ship.lifecycle)) return { ok: false, reason: 'blocked' };
  ctx.setShield({ hpLeft: CONFIG.shieldBlock.hp, until: ctx.now + CONFIG.shieldBlock.durationMs });
  return { ok: true };
}

export const shieldBlockRow: ConsumableRow = consumableRow('shieldBlock', shieldBlockEffect);
