// Mutable client game state. Three plain domains with one-way data flow per
// the plan: server mirror (net) -> sim state (prediction) -> render views.
// The net mirror here is plain data only; the stateful net machinery
// (SnapshotBuffer/ContactStore/ServerClock) lives in net/ and is composed in
// main.ts. Kept a leaf module: it imports only shared types, never render,
// net, or input code.

import type { LitZoneView, OwnShip } from '@salvo/shared';

/** Coarse client phase. Expands (waiting/countdown/spectate) in later steps. */
export type Phase = 'connecting' | 'active';

/**
 * Own-ship render source — the step-5/6 A/B switch (toggled with P):
 *   'predict' — local prediction + reconciliation (step 6, default)
 *   'interp'  — own ship drawn from server frames at -50ms (step 5 checkpoint)
 */
export type NetMode = 'predict' | 'interp';

/** Plain mirror of the latest server frame data for this client. */
export interface NetState {
  sessionId: string;
  tick: number; // latest server tick seen
  ackSeq: number; // highest input seq the server has applied
  you: OwnShip | null; // latest authoritative own-ship, null pre-first-frame
  /** Latest per-observer lit-zone list (mirrors FrameMsg.litZones; [] when the
   *  observer sees none). Read by the render loop to derive the own ACTIVE zones
   *  that keep beyond-sight shells (projectiles) and clear the own fog (fog). */
  litZones: LitZoneView[];
}

export interface GameState {
  phase: Phase;
  mode: NetMode;
  net: NetState;
  /** Server time (ms) the own ship respawns at while sunk; null when alive. */
  respawnEta: number | null;
  /** True once spec (unfogged) frames arrive: dead in active, or match finished. */
  spectating: boolean;
  /** Killer's id from the own sunk event's `by` (null for storm/unknown). */
  killerId: string | null;
  /** True once the results broadcast arrived (drives auto-return on disconnect). */
  matchOver: boolean;
}

/** Build a fresh client state for a joined session. */
export function createGameState(sessionId: string): GameState {
  return {
    phase: 'connecting',
    mode: 'predict',
    net: { sessionId, tick: 0, ackSeq: 0, you: null, litZones: [] },
    respawnEta: null,
    spectating: false,
    killerId: null,
    matchOver: false,
  };
}
