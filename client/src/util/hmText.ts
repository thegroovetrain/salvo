// THE CLIENT'S ONE DISTANCE PRINTER (Story 11.2, 2026-11-12, rulings R1 / R18):
// every distance a player reads — a weapon's reach on a card, a tooltip, a
// How-to-Play table, a console readout, an effect's radius — is spoken in
// hectometers on the one ruler (shared `sim/hm.ts`). Whole hectometers go
// through the shared `formatHm`; a radius under 10 hm (a burst, a blast, a
// trigger ring, a lit circle, a smoke cloud) keeps ONE decimal, because a
// whole-hectometer print would flatten 30 u and 40 u into the same "1".
//
// Pure, no I/O.

import { formatHm, uToHm } from '@salvo/shared';

/** The unit suffix every distance row prints (lowercase, the unit register). */
export const HM_UNIT = ' hm';

/**
 * A distance in u as hectometer text: one decimal under 10 hm (`1.3`), whole
 * from 10 hm up (`380`, through `formatHm`). Non-finite fails closed to ''.
 */
export function hmText(u: number): string {
  const hm = uToHm(u);
  if (!Number.isFinite(hm)) return '';
  const tenth = Math.round(hm * 10) / 10;
  if (Math.abs(tenth) < 10) return (tenth + 0).toFixed(1);
  return formatHm(u);
}

/** `text` with its trailing `unit` — or '' when `text` is '' (a non-finite
 *  value fails closed to an EMPTY readout, never a bare unit). */
export function withUnit(text: string, unit: string): string {
  return text === '' ? '' : text + unit;
}

/** A distance in u as hectometer text WITH the unit (`380 hm`); '' when non-finite. */
export function hmWithUnit(u: number): string {
  return withUnit(hmText(u), HM_UNIT);
}

/**
 * The stat-table fields that ARE distances (u in the sim) and print through
 * `hmText` + `HM_UNIT`: a weapon's reach and a torpedo's run, then every
 * effect radius a card or the console can show.
 */
export const DISTANCE_FIELDS: ReadonlySet<string> = new Set([
  'rangeU',
  'runU',
  'burstRadius',
  'blastRadius',
  'triggerRadius',
  'litRadius',
  'zoneRadius',
  'radius',
]);

/** Is this stat field a distance (printed in hm)? */
export function isDistanceField(field: string): boolean {
  return DISTANCE_FIELDS.has(field);
}
