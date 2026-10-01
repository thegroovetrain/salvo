// THE MATCH RECORD (Story 8.21, Eric rulings R1/R3 of 2026-09-30) — the
// server-only artifact of a FINISHED match: who sailed, how each placed, what
// each built and every hand each was dealt. Built once, at the results hook,
// under the `match.end` latch (ArenaRoom), and handed to the AccountWriter port
// (accountWriter.ts; the NullWriter until Epic 9).
//
// SERVER-ONLY, FOREVER. A MatchRecord is never a ResultsMsg: no field of it —
// least of all `hands` — may reach a client by any path, because an enemy's
// draws are build information (pinned by matchRecord.test.ts and the
// perception invariant's forbidden-key walk). ZERO Colyseus imports: this is
// game/, and the builder is pure over plain snapshots.

import { PROTOCOL_VERSION, type GunId, type HullId, type LineId } from '@salvo/shared';
import type { Match, MatchEndCause, MatchOutcome, Participant } from './match.js';
import { isParticipant, type ShipRole } from './participants.js';

/**
 * ONE HAND DEALT (R1): the offered line ids, the id taken (null when the hand
 * was thrown back or was still open at the end), and whether the countdown
 * REDRAW threw it back. On the ShipRecord / Participant the `*AtMs` stamps are
 * RAW `world.now`; inside a built MatchRecord they are `T+` ms from activation
 * — NEGATIVE for the countdown's level-zero hand and its REDRAW, deliberately
 * (the results modal's `T+` is the same clock, and a countdown pick really did
 * happen before 0:00).
 */
export interface HandRecord {
  dealtAtMs: number;
  offered: readonly LineId[];
  taken: LineId | null;
  takenAtMs: number | null;
  redrawn: boolean;
}

/** One combatant who sailed in the match — a human captain or a bot; a fleet
 *  hull is world content and never appears (Story 6.3's participant rule). */
export interface ParticipantRecord {
  id: string;
  name: string;
  role: Exclude<ShipRole, 'fleet'>;
  /** Account link — null for everyone until Epic 9 has accounts. */
  userId: null;
  hullId: HullId;
  gun: GunId;
  placement: number;
  kills: number;
  pveKills: Record<string, number>;
  damageDealt: number;
  /** The final build: fitted line ids, fit order, repeats intact (devfit
   *  cards included — they are cards, not hands). */
  cards: readonly LineId[];
  hands: readonly HandRecord[];
  /** Levels banked and never spent at the end (an open hand counts). */
  bankedLevels: number;
}

export interface MatchRecord {
  matchId: string;
  mode: string;
  protocolVersion: number;
  /** The server build (root package.json), '' where none was registered. */
  gameVersion: string;
  endedAtEpochMs: number;
  /** Server-clock ms the match went active — the `T+` zero. */
  activatedAtMs: number;
  durationS: number;
  endedBy: MatchEndCause;
  outcome: MatchOutcome;
  winnerId: string;
  participants: ParticipantRecord[];
}

/** What the room knows that the Match does not. */
export interface MatchRecordMeta {
  matchId: string;
  mode: string;
  gameVersion: string;
  endedAtEpochMs: number;
}

/** A raw-clock hand → a `T+` hand (a fresh object; the snapshot is untouched). */
function toTPlus(hand: HandRecord, zero: number): HandRecord {
  return {
    dealtAtMs: hand.dealtAtMs - zero,
    offered: [...hand.offered],
    taken: hand.taken,
    takenAtMs: hand.takenAtMs === null ? null : hand.takenAtMs - zero,
    redrawn: hand.redrawn,
  };
}

function participantRecord(match: Match, id: string, p: Readonly<Participant>, placement: number): ParticipantRecord {
  return {
    id,
    name: p.name,
    role: p.role as Exclude<ShipRole, 'fleet'>, // narrowed by the caller's isParticipant filter
    userId: null,
    hullId: p.hullId,
    gun: p.gun,
    placement,
    kills: p.kills,
    pveKills: { ...p.pveKills },
    damageDealt: p.damageDealt,
    cards: [...p.cards],
    hands: p.hands.map((h) => toTPlus(h, match.activatedAt)),
    bankedLevels: p.bankedLevels,
  };
}

/**
 * Build the record of a finished match. PURE over the Match's participant
 * snapshots (leavers included — R3 — because a leave snapshots before the hull
 * goes) and its placements: it never reads the wire and never mutates.
 * It takes no World: every per-ship fact was snapshotted into the Match at
 * leave or finish, which is what lets a leaver's build survive their hull.
 */
export function buildMatchRecord(match: Match, meta: MatchRecordMeta): MatchRecord {
  const summary = match.endSummary();
  const participants: ParticipantRecord[] = [];
  for (const [id, p] of match.participantRecords()) {
    if (isParticipant(p)) participants.push(participantRecord(match, id, p, match.placementOf(id)));
  }
  participants.sort((a, b) => a.placement - b.placement);
  // COUNTDOWN LEAVERS LAST, PLACEMENT 0 (Eric 2026-09-30: *"If the game
  // starts, I want the player's choices tracked."*): dealt the opening hand,
  // gone before 0:00 — in no placement, no results row, but their choices are
  // in the record. Placement 0 is the marker; their stamps are negative T+.
  for (const [id, p] of match.countdownLeaverRecords()) {
    if (isParticipant(p)) participants.push(participantRecord(match, id, p, 0));
  }
  return {
    matchId: meta.matchId,
    mode: meta.mode,
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: meta.gameVersion,
    endedAtEpochMs: meta.endedAtEpochMs,
    activatedAtMs: match.activatedAt,
    durationS: summary.durationS,
    endedBy: summary.endedBy,
    outcome: summary.outcome,
    winnerId: match.winnerId,
    participants,
  };
}

/** Total hands across a record — the count-only `match.record` log field. */
export function handCount(record: MatchRecord): number {
  let n = 0;
  for (const p of record.participants) n += p.hands.length;
  return n;
}
