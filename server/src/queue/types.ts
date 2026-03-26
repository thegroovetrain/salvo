// ============================================================
// Queue Ticket Types (server-internal, not sent over wire)
//
// Ticket lifecycle:
//   (none) ──createTicket──▶ QUEUED ──match──▶ MATCHED
//                              │
//              ┌───────────────┼───────────────┐
//              │               │               │
//        leader cancel    member DC      party mutation
//              │               │               │
//              ▼               ▼               ▼
//                       DISSOLVED
// ============================================================

import type { QuickPlayMode } from '@salvo/shared';

export interface QueuedMember {
  guestId: string;       // primary identifier (stable across tab eviction)
  socketId: string;      // secondary (updated on eviction)
  playerName: string;    // from GuestSession.name, fallback 'Player'
}

export interface QueueTicket {
  id: string;
  members: QueuedMember[];
  partyId: string | null;  // null = solo player
  mode: QuickPlayMode;
  createdAt: number;
}
