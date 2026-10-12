// MULTI-SPECTRAL COUNTERMEASURE (Story 9.3; Eric rulings 2026-10-11, epic-9
// amendments 40–47) — the key-fired consumable on key 3 that REPLACES SMOKE
// SCREEN (Story 8.18) and absorbs CHAFF's role (retired in 9.2). One copy =
// ONE stationary cloud made at the activating hull's CENTRE, living
// `CONFIG.countermeasure.lifeMs` (15 s) while its spray disc grows r0 → r1
// (200 → 500 u). A CLIENT VISUAL OVERLAY (Story 9.3 session 2, Eric ruling
// 2026-10-12: "just draw it on top of ships"): the server hides NOTHING
// behind or inside it — it only places and times the cloud; every client
// that senses it paints it.
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
