// THE LEDGER'S TABLES (Story 12.1) — a mirror of the `MatchRecord` AS BUILT
// TODAY (game/matchRecord.ts), one table per level of the record: the match,
// each combatant who sailed in it, and every hand each was dealt.
//
// TWO COLUMNS ARE ABSENT ON PURPOSE. `ParticipantRecord.name` (the callsign) is
// never stored — rows.ts drops it at the mapping — and `userId` is not a column
// until Epic 14 brings accounts. The participant id kept is the record's
// opaque per-match `id`.
//
// Numbers that are not guaranteed whole (damage, beacon XP, durations, clock
// stamps) are `double precision`: Postgres REJECTS a fractional value written
// to an integer column, and the ledger must never lose a match to a rounding
// assumption. Counts that are whole by construction are `integer`.
//
// CHANGING THIS FILE means a new migration: `npm run db:generate -w server`,
// check the SQL in under server/drizzle/. Boot applies migrations; nothing ever
// pushes this schema directly.

import {
  boolean,
  doublePrecision,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

export const matches = pgTable('matches', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(),
  protocolVersion: integer('protocol_version').notNull(),
  gameVersion: text('game_version').notNull(),
  /** Wall-clock epoch ms the match ended (the room's Date.now()). */
  endedAtEpochMs: doublePrecision('ended_at_epoch_ms').notNull(),
  /** Server-clock ms the match went active — the T+ zero, not an epoch. */
  activatedAtMs: doublePrecision('activated_at_ms').notNull(),
  durationS: doublePrecision('duration_s').notNull(),
  endedBy: text('ended_by').notNull(),
  outcome: text('outcome').notNull(),
  /** '' on a draw, stored as-is. */
  winnerId: text('winner_id').notNull(),
});

export const matchParticipants = pgTable(
  'match_participants',
  {
    matchId: text('match_id').notNull(),
    participantId: text('participant_id').notNull(),
    role: text('role').notNull(),
    hullId: text('hull_id').notNull(),
    shift: text('shift').notNull(),
    /** 0 = left during the countdown (no placement, choices still kept). */
    placement: integer('placement').notNull(),
    kills: integer('kills').notNull(),
    damageDealt: doublePrecision('damage_dealt').notNull(),
    beaconXpMs: doublePrecision('beacon_xp_ms').notNull(),
    dropsTaken: integer('drops_taken').notNull(),
    /** Fitted line ids in fit order, repeats intact. */
    cards: text('cards').array().notNull(),
    bankedLevels: integer('banked_levels').notNull(),
    /** IndexId → bonus points (Story 10.7). */
    indexBonus: jsonb('index_bonus').$type<Record<string, number>>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.participantId] }),
    foreignKey({ columns: [t.matchId], foreignColumns: [matches.id] }),
  ],
);

export const matchHands = pgTable(
  'match_hands',
  {
    matchId: text('match_id').notNull(),
    participantId: text('participant_id').notNull(),
    /** The hand's position in the participant's dealing order, from 0. */
    ordinal: integer('ordinal').notNull(),
    /** T+ ms from activation — negative for countdown hands. */
    dealtAtMs: doublePrecision('dealt_at_ms').notNull(),
    offered: text('offered').array().notNull(),
    taken: text('taken'),
    takenAtMs: doublePrecision('taken_at_ms'),
    redrawn: boolean('redrawn').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.participantId, t.ordinal] }),
    foreignKey({ columns: [t.matchId], foreignColumns: [matches.id] }),
  ],
);

export type MatchRow = typeof matches.$inferInsert;
export type ParticipantRow = typeof matchParticipants.$inferInsert;
export type HandRow = typeof matchHands.$inferInsert;
