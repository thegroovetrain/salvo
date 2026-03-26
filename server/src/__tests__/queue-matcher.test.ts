import { describe, it, expect } from 'vitest';
import { tryMatch, getTargetSize, isTeamMode, assignTeams } from '../queue/matcher.js';
import { createGame, addPlayer } from '../game.js';
import type { QueueTicket } from '../queue/types.js';
import type { QuickPlayMode } from '@salvo/shared';

function ticket(id: string, size: number, partyId: string | null = null, mode: QuickPlayMode = '2v2'): QueueTicket {
  const members = Array.from({ length: size }, (_, i) => ({
    guestId: `${id}-g${i}`,
    socketId: `${id}-s${i}`,
    playerName: `P${i}`,
  }));
  return { id, members, partyId, mode, createdAt: Date.now() };
}

// ============================================================
// getTargetSize
// ============================================================

describe('getTargetSize', () => {
  it('1v1 = 2', () => expect(getTargetSize('1v1')).toBe(2));
  it('2v2 = 4', () => expect(getTargetSize('2v2')).toBe(4));
  it('3v3 = 6', () => expect(getTargetSize('3v3')).toBe(6));
  it('3ffa = 3', () => expect(getTargetSize('3ffa')).toBe(3));
  it('6ffa = 6', () => expect(getTargetSize('6ffa')).toBe(6));
  it('2v2v2 = 6', () => expect(getTargetSize('2v2v2')).toBe(6));
});

// ============================================================
// isTeamMode
// ============================================================

describe('isTeamMode', () => {
  it('2v2 is team mode', () => expect(isTeamMode('2v2')).toBe(true));
  it('3v3 is team mode', () => expect(isTeamMode('3v3')).toBe(true));
  it('2v2v2 is team mode', () => expect(isTeamMode('2v2v2')).toBe(true));
  it('1v1 is not team mode', () => expect(isTeamMode('1v1')).toBe(false));
  it('3ffa is not team mode', () => expect(isTeamMode('3ffa')).toBe(false));
  it('6ffa is not team mode', () => expect(isTeamMode('6ffa')).toBe(false));
});

// ============================================================
// tryMatch — greedy FIFO with skip
// ============================================================

describe('tryMatch', () => {
  it('matches 2 solo tickets for 1v1', () => {
    const tickets = [ticket('a', 1), ticket('b', 1)];
    const result = tryMatch(tickets, 2);
    expect(result).toHaveLength(2);
  });

  it('matches party-of-2 + 2 solos for 2v2', () => {
    const tickets = [ticket('party', 2, 'p1'), ticket('solo1', 1), ticket('solo2', 1)];
    const result = tryMatch(tickets, 4);
    expect(result).toHaveLength(3);
    expect(result!.reduce((s, t) => s + t.members.length, 0)).toBe(4);
  });

  it('matches 3 parties of 2 for 2v2v2', () => {
    const tickets = [ticket('p1', 2, 'party-1'), ticket('p2', 2, 'party-2'), ticket('p3', 2, 'party-3')];
    const result = tryMatch(tickets, 6);
    expect(result).toHaveLength(3);
  });

  it('skips oversized ticket and takes smaller ones', () => {
    // ticket of 3 can't fit when only 2 slots remain after the first 4
    const tickets = [
      ticket('big', 3, 'p1'),   // skipped (3 > remaining after first)
      ticket('s1', 1),
      ticket('s2', 1),
    ];
    const result = tryMatch(tickets, 2);
    expect(result).toHaveLength(2);
    expect(result![0].id).toBe('s1');
    expect(result![1].id).toBe('s2');
  });

  it('returns null when not enough players', () => {
    const tickets = [ticket('a', 1)];
    expect(tryMatch(tickets, 2)).toBeNull();
  });

  it('returns null for empty ticket list', () => {
    expect(tryMatch([], 2)).toBeNull();
  });

  it('matches single ticket that exactly fills target', () => {
    const tickets = [ticket('party', 3, 'p1')];
    const result = tryMatch(tickets, 3);
    expect(result).toHaveLength(1);
    expect(result![0].members.length).toBe(3);
  });

  it('skips ticket that would overflow and finds a valid combination', () => {
    // party3 has 3 members. After taking s1 (total=1), party3 would make total=4 which fits.
    // So this tests a different scenario: party3 + s1 = 4 ✓
    // For a real overflow test: target=2, party of 3 skipped
    const tickets = [
      ticket('party3', 3, 'p1'),  // 3 players, too big for target=2
      ticket('s1', 1),
      ticket('s2', 1),
    ];
    const result = tryMatch(tickets, 2);
    expect(result).toHaveLength(2);
    // Both solo tickets (party was skipped)
    expect(result!.every(t => t.partyId === null)).toBe(true);
  });
});

// ============================================================
// assignTeams — party-aware
// ============================================================

describe('assignTeams', () => {
  it('places party of 2 on same team in 2v2', () => {
    const game = createGame('host', 'Host', { enabled: false, seconds: 60 }, 'quickplay-2v2', true);
    const partyTicket = ticket('party', 2, 'p1', '2v2');
    const solo1 = ticket('s1', 1, null, '2v2');
    const solo2 = ticket('s2', 1, null, '2v2');

    const playerIdsByTicket = new Map([
      ['party', ['pid-0', 'pid-1']],
      ['s1', ['pid-2']],
      ['s2', ['pid-3']],
    ]);

    // Add all players to game
    for (const [, pids] of playerIdsByTicket) {
      for (const pid of pids) {
        if (pid !== 'host') addPlayer(game, pid, pid);
      }
    }

    assignTeams(game, [partyTicket, solo1, solo2], playerIdsByTicket, '2v2');

    // Party members must be on the same team
    const team0 = game.teams.get('pid-0');
    const team1 = game.teams.get('pid-1');
    expect(team0).toBeDefined();
    expect(team0).toBe(team1);
  });

  it('places party of 3 on same team in 3v3', () => {
    const game = createGame('host', 'Host', { enabled: false, seconds: 60 }, 'quickplay-3v3', true);
    const partyTicket = ticket('party', 3, 'p1', '3v3');
    const solos = [ticket('s1', 1), ticket('s2', 1), ticket('s3', 1)];

    const playerIdsByTicket = new Map([
      ['party', ['pid-0', 'pid-1', 'pid-2']],
      ['s1', ['pid-3']],
      ['s2', ['pid-4']],
      ['s3', ['pid-5']],
    ]);

    for (const [, pids] of playerIdsByTicket) {
      for (const pid of pids) {
        if (pid !== 'host') addPlayer(game, pid, pid);
      }
    }

    assignTeams(game, [partyTicket, ...solos], playerIdsByTicket, '3v3');

    const team0 = game.teams.get('pid-0');
    const team1 = game.teams.get('pid-1');
    const team2 = game.teams.get('pid-2');
    expect(team0).toBeDefined();
    expect(team0).toBe(team1);
    expect(team1).toBe(team2);
  });

  it('places 2 parties of 2 on different teams in 2v2v2', () => {
    const game = createGame('host', 'Host', { enabled: false, seconds: 60 }, 'quickplay-2v2v2', true);
    const p1 = ticket('pa', 2, 'party-a', '2v2v2');
    const p2 = ticket('pb', 2, 'party-b', '2v2v2');
    const solos = [ticket('s1', 1), ticket('s2', 1)];

    const playerIdsByTicket = new Map([
      ['pa', ['pid-0', 'pid-1']],
      ['pb', ['pid-2', 'pid-3']],
      ['s1', ['pid-4']],
      ['s2', ['pid-5']],
    ]);

    for (const [, pids] of playerIdsByTicket) {
      for (const pid of pids) {
        if (pid !== 'host') addPlayer(game, pid, pid);
      }
    }

    assignTeams(game, [p1, p2, ...solos], playerIdsByTicket, '2v2v2');

    // Party A members on same team
    expect(game.teams.get('pid-0')).toBe(game.teams.get('pid-1'));
    // Party B members on same team
    expect(game.teams.get('pid-2')).toBe(game.teams.get('pid-3'));
    // Parties on different teams
    expect(game.teams.get('pid-0')).not.toBe(game.teams.get('pid-2'));
  });

  it('does nothing for FFA modes', () => {
    const game = createGame('host', 'Host', { enabled: false, seconds: 60 }, 'quickplay-3ffa');
    const tickets = [ticket('s1', 1), ticket('s2', 1), ticket('s3', 1)];
    const playerIdsByTicket = new Map([['s1', ['p1']], ['s2', ['p2']], ['s3', ['p3']]]);

    assignTeams(game, tickets, playerIdsByTicket, '3ffa');
    expect(game.teamsEnabled).toBe(false);
    expect(game.teams.size).toBe(0);
  });

  it('fills all team slots when mixing parties and solos', () => {
    const game = createGame('host', 'Host', { enabled: false, seconds: 60 }, 'quickplay-3v3', true);
    const partyTicket = ticket('party', 2, 'p1', '3v3');
    const solos = [ticket('s1', 1), ticket('s2', 1), ticket('s3', 1), ticket('s4', 1)];

    const playerIdsByTicket = new Map([
      ['party', ['pid-0', 'pid-1']],
      ['s1', ['pid-2']],
      ['s2', ['pid-3']],
      ['s3', ['pid-4']],
      ['s4', ['pid-5']],
    ]);

    for (const [, pids] of playerIdsByTicket) {
      for (const pid of pids) {
        if (pid !== 'host') addPlayer(game, pid, pid);
      }
    }

    assignTeams(game, [partyTicket, ...solos], playerIdsByTicket, '3v3');

    // All 6 players should be assigned a team
    expect(game.teams.size).toBe(6);
    // Party members on same team
    expect(game.teams.get('pid-0')).toBe(game.teams.get('pid-1'));
  });
});
