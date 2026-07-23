// Shared firer-hue LATCH for the ordnance markers (mines / decoys / lit-zones),
// Story 1.12. A marker's tint is its firer's personal hue — but the roster
// schema can sync AFTER the marker spawns, so `hueFor(by)` returns null until
// the firer's hue lands. A marker that spawned on the miss boots on the amber
// fallback and must retry every frame until a real hue resolves, then redraw
// ONCE and stop probing — the same `colored` latch the contact views use
// (render/contacts.ts). This module is the one place that pattern lives so the
// three renderers don't triplicate it.

import { CLIENT_CONFIG } from '../config.js';

/** Resolve a firer id (`by`) → its personal hue, or null when the roster hasn't
 *  synced yet or the firer has left the match (the marker shows amber until it
 *  resolves; a firer who left never resolves and stays amber). */
export type HueFor = (by: string) => number | null;

/** The amber fallback a marker paints while its firer hue is unresolved. */
const AMBER = CLIENT_CONFIG.colors.amber;

/** A marker's firer-hue latch: what to paint now + whether that is the real
 *  resolved hue (true → stop retrying) or the amber fallback (false → retry). */
export interface HueResolution {
  color: number;
  colored: boolean;
}

/** Resolve `by` to a paint color: the firer's hue (latched), or amber while the
 *  roster hasn't synced it (unlatched — retryHue keeps probing). */
export function resolveHue(by: string, hueFor: HueFor): HueResolution {
  const hue = hueFor(by);
  return hue === null ? { color: AMBER, colored: false } : { color: hue, colored: true };
}

/** A marker that can still be recolored: its firer id + whether it's latched. */
export interface HueState {
  by: string;
  colored: boolean;
}

/** Retry an amber-fallback marker's firer hue; on resolve, `redraw` it once in
 *  the real hue and latch (`colored`) so it never probes again. No-op once
 *  latched or while the hue is still unresolved. */
export function retryHue(state: HueState, hueFor: HueFor, redraw: (color: number) => void): void {
  if (state.colored) return;
  const hue = hueFor(state.by);
  if (hue === null) return;
  redraw(hue);
  state.colored = true;
}
