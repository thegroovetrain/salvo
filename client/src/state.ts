// Mutable client game state. Three plain domains with one-way data flow per
// the plan: server mirror (net) -> sim state (prediction) -> render views.
// The net mirror here is plain data only; the stateful net machinery
// (SnapshotBuffer/ContactStore/ServerClock) lives in net/ and is composed in
// main.ts. Kept a leaf module: it imports only shared types, never render,
// net, or input code.

import type { BurnZoneView, CloudView, DecoyView, FoulZoneView, LitZoneView, OwnShip } from '@salvo/shared';

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
  /** Latest per-observer PHOSPHOR burning-zone list (mirrors FrameMsg.burnZones;
   *  [] when none — Story 8.17). Read by the burn classifier only: a burning
   *  zone reveals nothing, so it never feeds the fog or the projectile cull. */
  burnZones: BurnZoneView[];
  /** Latest per-observer FOULING SHELL foul-zone list (mirrors
   *  FrameMsg.foulZones; [] when none — Story 9.4). A foul zone reveals
   *  nothing; its slow reaches this client only as the victim-private
   *  `you.fouledUntil`, never from this list. */
  foulZones: FoulZoneView[];
  /** Latest per-observer buoy list (mirrors FrameMsg.decoys; absent / [] when
   *  none — Story 10.9). Read by the hotbar's ACTIVE windows (an own buoy's
   *  `until`) and the radar-buoy sweep (an own RADAR buoy's `sweep`). */
  decoys?: DecoyView[];
  /** Server time (ms) of the frame `decoys` came from — the instant each own
   *  radar buoy's `sweep` was sampled (render/buoySweep.ts extrapolates it). */
  decoysAt?: number;
  /** The HELD MULTI-SPECTRAL COUNTERMEASURE cloud list (Story 9.3, epic-9
   *  amendment 51): every cloud any FrameMsg.clouds has delivered, held until
   *  its life ends on the frame's server time — a cloud once seen is held
   *  until it dies, because delivery is per-sweep (Eric 2026-10-12: "If it's
   *  detected by my radar, I want my radar to paint it"); nothing new is
   *  disclosed by holding what was already sent. [] when none. Fed to the renderer
   *  (render/countermeasure.ts); since 2026-10-12 the server hides nothing
   *  behind smoke, so no client mirror reads it. */
  clouds: HeldCloud[];
  /** The HELD cloud set behind `clouds`, by id — net/roomBindings.ts merges
   *  every frame's clouds into it and expires them on the FRAME's server time;
   *  `clouds` is its unexpired list. Lives here (not in the binding) so the
   *  match-start edge in main.ts can clear it with the renderer: the server
   *  clears its store at the practice → match boundary (world.ts
   *  resetForMatchStart) and a held practice cloud must not ghost into the
   *  match. */
  heldClouds: Map<string, HeldCloud>;
}

/** A HELD countermeasure cloud (net/roomBindings.ts holdClouds): the wire's
 *  CloudView plus `deliveredAt`, the server time (ms) of the last frame whose
 *  `clouds` carried its row. The radar's return source gates on it
 *  (render/cloudReturnGate.ts, Story 9.8 review gate F1); the haze and the
 *  wake mirror ignore it. */
export type HeldCloud = CloudView & { deliveredAt: number };

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
  /** True while the own hull BLEEDS against a hull or the coast (Story 9.5,
   *  amendments 79 + 83): stamped every render frame by main.ts from the
   *  predictor's last live tick (sim/contactBleed.ts, held
   *  `CLIENT_CONFIG.contactFx.bleedGraceMs` past the last bleeding frame);
   *  read by net/roomBindings.ts flushDamage, which drops the small windowed
   *  bleed `dmg` from the thud and the shake (the grind tone is the cue). */
  contactBleeding: boolean;
}

/** Build a fresh client state for a joined session. */
export function createGameState(sessionId: string): GameState {
  return {
    phase: 'connecting',
    mode: 'predict',
    net: { sessionId, tick: 0, ackSeq: 0, you: null, litZones: [], burnZones: [], foulZones: [], clouds: [], heldClouds: new Map() },
    respawnEta: null,
    spectating: false,
    killerId: null,
    matchOver: false,
    contactBleeding: false,
  };
}
