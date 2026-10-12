// MULTI-SPECTRAL COUNTERMEASURE (Story 9.3; Eric rulings 2026-10-11, epic-9
// amendments 40–47) — the key-fired consumable on key 3 that REPLACES SMOKE
// SCREEN (Story 8.18) and absorbs CHAFF's role (retired in 9.2). One copy =
// ONE stationary pixel cloud made at the activating hull's CENTRE
// (`CONFIG.countermeasure`: 300 pixels born inside r0 = 200 u, scaling
// outward to r1 = 500 u over a 15 s life, each pixel dying at its own age in
// 6–15 s, each living pixel a 6 u footprint — shared/src/sim/cloud.ts, the
// one pixel function both sides run). A living pixel blocks SIGHT for every
// observer, the owner included (amendment 40 — "blind by eye inside their own
// cloud, radar only"); for everyone EXCEPT the owner it also drops a RADAR
// return on a point inside the cloud's outline (amendment 41 — no shadow
// beyond). The decay IS the fade.
//
// A NEW CLOUD EVERY PRESS (amendment 46): no lay window, no restart, no
// refuse-while-live — five copies can stack five clouds. Clouds already made
// live out their 15 s whatever happens to the hull (amendment 127: everything
// on the water outlives its owner); a press while SINKING is refused
// `blocked` here, nothing spent (the ONE SPEND LAW; the shield row's
// not-afloat guard). The World owns every write (`setCountermeasure` — the
// ActivationContext capability); this row keeps only the guard.

import { isAfloat, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { consumableRow, type ConsumableRow } from './row.js';

function countermeasureEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  if (!isAfloat(ctx.ship.lifecycle)) return { ok: false, reason: 'blocked' };
  ctx.setCountermeasure();
  return { ok: true };
}

export const countermeasureRow: ConsumableRow = consumableRow('countermeasure', countermeasureEffect);
