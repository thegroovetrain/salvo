// THE RELATION COLOR RULE (Story 10.4, Eric's ruling R6). The 20-hue personal
// wheel is gone everywhere: every piece of ship linework — hull stroke and fill,
// wake foam, nameplate, kill-feed and bounty name, results own-name, own buoy
// marker, contact FX — reads ONE relation to the viewer. Own = cyan, every other
// captain or bot = red. Drones keep their own greys (render/ships.ts DRONE_STYLE)
// and the reserved amber, mine, lit-zone and hazard colors are untouched.
//
// Pure and leaf-level: no Pixi, no state. The one place the two colors and the
// dark fill rule live, so a later skin story swaps one module.

import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;

/** A ship's relation to the viewer. */
export type Relation = 'own' | 'enemy';

/** Hull stroke + interior fill (null fill = hollow outline). */
export interface ShipStyle {
  stroke: number;
  fill: number | null;
}

/** Pure: `id`'s relation to the viewer `ownId`. A spectator (no own id) sees
 *  every ship as an enemy. */
export function relationOf(id: string, ownId: string | null | undefined): Relation {
  return ownId !== null && ownId !== undefined && id === ownId ? 'own' : 'enemy';
}

/** Pure: per-sRGB-channel value scale of a packed 0xRRGGBB (an HSV value scale). */
export function scaleValue(color: number, k: number): number {
  const ch = (shift: number): number => Math.round(((color >> shift) & 0xff) * k) << shift;
  return ch(16) | ch(8) | ch(0);
}

/** The bright linework color of a relation. */
export function relationStroke(r: Relation): number {
  return r === 'own' ? C.relationOwn : C.relationEnemy;
}

/** The dark hull interior of a relation — the stroke at the fill value scale. */
export function relationFill(r: Relation): number {
  return scaleValue(relationStroke(r), CLIENT_CONFIG.ship.relationFillValue);
}

const STYLES: Readonly<Record<Relation, ShipStyle>> = {
  own: { stroke: relationStroke('own'), fill: relationFill('own') },
  enemy: { stroke: relationStroke('enemy'), fill: relationFill('enemy') },
};

/** The hull style of a relation (shared objects — never mutate). */
export function relationStyle(r: Relation): ShipStyle {
  return STYLES[r];
}
