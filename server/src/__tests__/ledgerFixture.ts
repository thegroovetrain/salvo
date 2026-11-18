// A hand-built finished MatchRecord for the ledger suites (Story 12.1): two
// placed combatants (a captain who won, a bot), a countdown leaver (placement
// 0, negative T+ stamps) and fractional numbers where the sim produces them.
// The real builder is pinned by matchRecord.test.ts; matchSmoke writes real
// records end to end.

import { INDEX_IDS, LINE_IDS, type IndexId } from '@salvo/shared';
import type { MatchRecord, ParticipantRecord } from '../game/matchRecord.js';

const [L0, L1, L2, L3] = LINE_IDS;
const zeroBonus = (): Record<IndexId, number> =>
  Object.fromEntries(INDEX_IDS.map((id) => [id, 0])) as Record<IndexId, number>;

export const CALLSIGN = 'Captain Secretname';

function participant(over: Partial<ParticipantRecord> & Pick<ParticipantRecord, 'id'>): ParticipantRecord {
  return {
    name: CALLSIGN,
    role: 'captain',
    userId: null,
    hullId: 'bismarck',
    shift: 'boost',
    placement: 1,
    kills: 0,
    damageDealt: 0,
    beaconXpMs: 0,
    dropsTaken: 0,
    cards: [],
    hands: [],
    bankedLevels: 0,
    indexBonus: zeroBonus(),
    ...over,
  };
}

export function fixtureRecord(matchId = 'm-ledger-1', outcome: 'winner' | 'draw' = 'winner'): MatchRecord {
  return {
    matchId,
    mode: 'standard',
    protocolVersion: 1,
    gameVersion: '0.0.0-test',
    endedAtEpochMs: 1_700_000_123_456,
    activatedAtMs: 10_050,
    durationS: 312.4,
    endedBy: 'lastHumanSunk',
    outcome,
    winnerId: outcome === 'draw' ? '' : 'a',
    participants: [
      participant({
        id: 'a',
        placement: 1,
        kills: 2,
        damageDealt: 1234.5,
        beaconXpMs: 750.25,
        dropsTaken: 1,
        cards: [L0, L1, L0],
        bankedLevels: 1,
        indexBonus: { ...zeroBonus(), [INDEX_IDS[0]]: 2 },
        hands: [
          { dealtAtMs: -2_000, offered: [L0, L1, L2], taken: null, takenAtMs: null, redrawn: true },
          { dealtAtMs: -1_500, offered: [L0, L3, L2], taken: L0, takenAtMs: -900, redrawn: false },
          { dealtAtMs: 40_000, offered: [L1, L3, L0], taken: L1, takenAtMs: 42_500, redrawn: false },
        ],
      }),
      participant({ id: 'bot-1', role: 'bot', hullId: 'yamato', shift: 'hunker', placement: 2, damageDealt: 0.5 }),
      participant({
        id: 'c',
        placement: 0,
        hands: [{ dealtAtMs: -3_000, offered: [L2, L1, L3], taken: L2, takenAtMs: -2_800, redrawn: false }],
        cards: [L2],
      }),
    ],
  };
}
