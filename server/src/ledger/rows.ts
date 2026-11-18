// RECORD → ROWS (Story 12.1). PURE: one finished `MatchRecord` becomes the
// rows of the three ledger tables, nothing else read, nothing mutated.
//
// THE CALLSIGN STOPS HERE. `ParticipantRecord.name` is never copied, and
// `userId` has no column — the stored participant id is the record's opaque
// per-match `id`. Everything else is mirrored as built, including a countdown
// leaver's placement 0 and negative T+ stamps, and a draw's '' winner.

import type { HandRecord, MatchRecord, ParticipantRecord } from '../game/matchRecord.js';
import type { HandRow, MatchRow, ParticipantRow } from './schema.js';

export interface LedgerRows {
  match: MatchRow;
  participants: ParticipantRow[];
  hands: HandRow[];
}

function matchRow(r: MatchRecord): MatchRow {
  return {
    id: r.matchId,
    mode: r.mode,
    protocolVersion: r.protocolVersion,
    gameVersion: r.gameVersion,
    endedAtEpochMs: r.endedAtEpochMs,
    activatedAtMs: r.activatedAtMs,
    durationS: r.durationS,
    endedBy: r.endedBy,
    outcome: r.outcome,
    winnerId: r.winnerId,
  };
}

function participantRow(matchId: string, p: ParticipantRecord): ParticipantRow {
  return {
    matchId,
    participantId: p.id,
    role: p.role,
    hullId: p.hullId,
    shift: p.shift,
    placement: p.placement,
    kills: p.kills,
    damageDealt: p.damageDealt,
    beaconXpMs: p.beaconXpMs,
    dropsTaken: p.dropsTaken,
    cards: [...p.cards],
    bankedLevels: p.bankedLevels,
    indexBonus: { ...p.indexBonus },
  };
}

function handRow(matchId: string, participantId: string, h: HandRecord, ordinal: number): HandRow {
  return {
    matchId,
    participantId,
    ordinal,
    dealtAtMs: h.dealtAtMs,
    offered: [...h.offered],
    taken: h.taken,
    takenAtMs: h.takenAtMs,
    redrawn: h.redrawn,
  };
}

export function recordToRows(record: MatchRecord): LedgerRows {
  const participants: ParticipantRow[] = [];
  const hands: HandRow[] = [];
  for (const p of record.participants) {
    participants.push(participantRow(record.matchId, p));
    p.hands.forEach((h, i) => hands.push(handRow(record.matchId, p.id, h, i)));
  }
  return { match: matchRow(record), participants, hands };
}

/** Rows a record becomes — the count-only `ledger.write.ok` field. */
export function rowCount(rows: LedgerRows): number {
  return 1 + rows.participants.length + rows.hands.length;
}
