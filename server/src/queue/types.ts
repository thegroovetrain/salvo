// ============================================================
// Queue Ticket Types (server-internal, not sent over wire)
//
// Ticket lifecycle:
//   (none) ──createTicket──▶ QUEUED ──match──▶ MATCHED
//                              │
//                          dequeue/DC
//                              │
//                              ▼
//                           REMOVED
// ============================================================

export interface QueuedMember {
  guestId: string;       // primary identifier (stable across tab eviction)
  socketId: string;      // secondary (updated on eviction)
  playerName: string;    // from GuestSession.name, fallback 'Player'
}

export interface QueueTicket {
  id: string;
  members: QueuedMember[];
  createdAt: number;
}
