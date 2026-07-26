// Shared firer-hue LATCH for the ordnance markers (mines / decoys / lit-zones),
// Story 1.12. A marker's tint is its firer's personal hue — but the roster
// schema can sync AFTER the marker spawns, so `hueFor(by)` returns null until
// the firer's hue lands. A marker that spawned on the miss boots on the amber
// fallback and must retry every frame until a real hue resolves, then redraw
// ONCE and stop probing — the same `colored` latch the contact views use
// (render/contacts.ts). This module is the one place that pattern lives so the
// three renderers don't triplicate it.

import { CLIENT_CONFIG } from '../config.js';
import { hueRevision } from './ships.js';

/** Resolve a firer id (`by`) → its personal hue, or null when the roster hasn't
 *  synced yet or the firer has left the match (the marker shows amber until it
 *  resolves; a firer who left never resolves and stays amber). */
export type HueFor = (by: string) => number | null;

/** The amber fallback a marker paints while its firer hue is unresolved. */
const AMBER = CLIENT_CONFIG.colors.amber;

/** A marker's firer-hue latch: what to paint now, whether that is the real
 *  resolved hue (true → stop retrying) or the amber fallback (false → retry),
 *  and the hue-table REVISION it was resolved against. */
export interface HueResolution {
  color: number;
  colored: boolean;
  /** render/ships.ts `hueRevision()` at resolve time — a colorblind-assist
   *  toggle bumps it, which un-latches every marker so it repaints (Story 2.3). */
  rev: number;
}

/** Resolve `by` to a paint color: the firer's hue (latched), or amber while the
 *  roster hasn't synced it (unlatched — retryHue keeps probing). */
export function resolveHue(by: string, hueFor: HueFor): HueResolution {
  const hue = hueFor(by);
  const rev = hueRevision();
  return hue === null ? { color: AMBER, colored: false, rev } : { color: hue, colored: true, rev };
}

/** A marker that can still be recolored: its firer id, whether it's latched,
 *  and the hue-table revision that latch was taken against. */
export interface HueState {
  by: string;
  colored: boolean;
  rev: number;
}

/**
 * Retry a marker's firer hue and, on resolve, `redraw` it once in the real hue
 * and latch (`colored`) so it never probes again. Two things un-latch a marker:
 * an amber fallback that has not resolved yet, and — Story 2.3 — a hue-table
 * REVISION bump (the colorblind-assist toggle swapped PLAYER_HUES under us), so
 * an already-latched marker repaints in its new family within a frame. The
 * revision check is one int compare per marker per frame; no per-entity string
 * work is done unless the revision actually moved.
 */
export function retryHue(state: HueState, hueFor: HueFor, redraw: (color: number) => void): void {
  const rev = hueRevision();
  if (state.colored && state.rev === rev) return;
  state.rev = rev;
  const hue = hueFor(state.by);
  if (hue === null) return;
  redraw(hue);
  state.colored = true;
}
