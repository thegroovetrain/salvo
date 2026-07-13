// Mutable client game state. Three plain domains with one-way data flow per the
// plan: server mirror (net) -> sim state (prediction) -> render views. Only the
// sim domain exists at the offline-drive step; the net domain (contacts/blips)
// arrives with the netcode steps. Kept a leaf module: it imports only shared
// types, never render or input code.

import type { ShipState } from '@salvo/shared';

/** Coarse client phase. Expands (waiting/countdown/active/spectate) with the
 *  match-lifecycle step; offline drive lives entirely in 'active'. */
export type Phase = 'offline' | 'active';

/**
 * Own ship kept as prev/curr fixed-step snapshots so the render loop can
 * interpolate between the last two sim ticks by the accumulator alpha.
 */
export interface OwnShipDomain {
  prev: ShipState;
  curr: ShipState;
}

/** Placeholder for remote contacts (filled from frame `contacts` in net steps). */
export interface EntityView {
  x: number;
  y: number;
  heading: number;
  speed: number;
}

export interface GameState {
  phase: Phase;
  ownShip: OwnShipDomain;
  /** Remote entities by id — empty until netcode lands. */
  entities: Map<string, EntityView>;
}

function cloneShip(s: ShipState): ShipState {
  return { x: s.x, y: s.y, heading: s.heading, speed: s.speed };
}

/** Build a fresh client state with the own ship seeded at `spawn`. */
export function createGameState(spawn: ShipState): GameState {
  return {
    phase: 'active',
    ownShip: { prev: cloneShip(spawn), curr: cloneShip(spawn) },
    entities: new Map(),
  };
}
