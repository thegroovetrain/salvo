// THE AIRDROP INGEST GATE (Story 10.9, epic-10 amendment 16) — FrameMsg.drops
// as the renderer may see it. FAIL-CLOSED, per WHOLE VIEW: a crate whose id is
// not a string, whose position is not finite, or whose `g` is not a non-empty
// list of rolls that each pass the shared `isDropRoll` (a known stat, a whole
// positive amount) is DROPPED — a malformed crate is not drawn at all, never
// drawn with the bad roll skipped. Pure; no Pixi.

import { isDropRoll, type DropView } from '@salvo/shared';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isRollList(g: unknown): boolean {
  return Array.isArray(g) && g.length > 0 && g.every((r) => isDropRoll(r));
}

/** Pure: is `v` a drawable DropView? */
export function isDropView(v: unknown): v is DropView {
  if (!isRecord(v) || typeof v.id !== 'string') return false;
  if (typeof v.x !== 'number' || !Number.isFinite(v.x)) return false;
  if (typeof v.y !== 'number' || !Number.isFinite(v.y)) return false;
  return isRollList(v.g);
}

/** Pure: the drawable crates of a frame's `drops` channel (anything not an
 *  array — including the omitted key — is no crates). */
export function sanitizeDrops(views: unknown): DropView[] {
  if (!Array.isArray(views)) return [];
  return views.filter(isDropView);
}
