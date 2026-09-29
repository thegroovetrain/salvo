// CHAFF (Story 8.16, catalog-v3 R39, epic-8 amendment 124(b)(c)) — a
// key-fired consumable. One copy bursts a false-return SOURCE at the OWNER's
// position at activation (it does not follow the ship): for
// `CONFIG.chaff.durationMs` it paints `count` server-generated fakes inside
// `radius` on every OTHER observer's radar, re-scattered once per the owner's
// sweep period and water-filtered (game/fakes.ts). The owner never receives
// them. A second copy REPLACES the source (fresh seed, fresh 15 s).
//
// The seed is minted by the World (`setChaff`) off its server-private stream,
// so this row never sees an RNG; emission lives in signals.ts
// (`chaffFakeBlips`). Refused only when not afloat ('blocked', nothing spent).

import { CONFIG, isAfloat, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { consumableRow, type ConsumableRow } from './row.js';

function chaffEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  const ship = ctx.ship;
  if (!isAfloat(ship.lifecycle)) return { ok: false, reason: 'blocked' };
  ctx.setChaff({
    x: ship.state.x,
    y: ship.state.y,
    radius: CONFIG.chaff.radius,
    count: CONFIG.chaff.count,
    until: ctx.now + CONFIG.chaff.durationMs,
    at: ctx.now,
  });
  return { ok: true };
}

export const chaffRow: ConsumableRow = consumableRow('chaff', chaffEffect);
