// THE AIRDROP INGEST GATE (Story 10.9, epic-10 amendment 16) — FrameMsg.drops
// as the renderer may see it. FAIL-CLOSED, per WHOLE VIEW: a crate whose id is
// not a string, whose position is not finite, or whose KIND `c` is not a
// `DropKind` (an index stat, or `'wreck'` — the shared `isDropKind`) is
// DROPPED, never drawn. A crate carries only its kind: the bonus is rolled AT
// PICKUP (Eric 2026-11-08), so there is no amount on the wire to check. Pure;
// no Pixi.

import { isDropKind, type DropView } from '@salvo/shared';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Pure: is `v` a drawable DropView? */
export function isDropView(v: unknown): v is DropView {
  if (!isRecord(v) || typeof v.id !== 'string') return false;
  if (typeof v.x !== 'number' || !Number.isFinite(v.x)) return false;
  if (typeof v.y !== 'number' || !Number.isFinite(v.y)) return false;
  return isDropKind(v.c);
}

/** Pure: the drawable crates of a frame's `drops` channel (anything not an
 *  array — including the omitted key — is no crates). */
export function sanitizeDrops(views: unknown): DropView[] {
  if (!Array.isArray(views)) return [];
  return views.filter(isDropView);
}
