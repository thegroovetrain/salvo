// ============================================================
// Queue Matcher — Pure matching logic operating on tickets
//
// Greedy FIFO: iterate tickets in order, sum member counts,
// skip tickets that don't fit remaining slots.
//
// Party-aware team assignment: party members always on same team.
// ============================================================

import type { QuickPlayMode, Game } from '@salvo/shared';
import type { QueueTicket } from './types.js';

const TEAM_LAYOUTS: Record<string, { teams: string[]; perTeam: number }> = {
  '2v2':   { teams: ['alpha', 'bravo'], perTeam: 2 },
  '3v3':   { teams: ['alpha', 'bravo'], perTeam: 3 },
  '2v2v2': { teams: ['alpha', 'bravo', 'charlie'], perTeam: 2 },
};

/**
 * Greedy FIFO matching: iterate tickets in order, accumulate members
 * until we reach the target player count. Skip tickets that would overflow.
 */
export function tryMatch(
  tickets: QueueTicket[],
  targetSize: number,
): QueueTicket[] | null {
  const matched: QueueTicket[] = [];
  let total = 0;

  for (const ticket of tickets) {
    if (total + ticket.members.length > targetSize) continue;
    matched.push(ticket);
    total += ticket.members.length;
    if (total === targetSize) return matched;
  }

  return null;
}

export function isTeamMode(mode: QuickPlayMode): boolean {
  return mode === '2v2' || mode === '3v3' || mode === '2v2v2';
}

export function getTargetSize(mode: QuickPlayMode): number {
  switch (mode) {
    case '1v1': return 2;
    case '2v2': return 4;
    case '3v3': return 6;
    case '3ffa': return 3;
    case '6ffa': return 6;
    case '2v2v2': return 6;
  }
}

// ── Team Assignment ───────────────────────────────────────

function collectShuffledSoloIds(
  soloTickets: QueueTicket[],
  playerIdsByTicket: Map<string, string[]>,
): string[] {
  const ids: string[] = [];
  for (const ticket of soloTickets) {
    ids.push(...(playerIdsByTicket.get(ticket.id) ?? []));
  }
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function placeParties(
  game: Game,
  partyTickets: QueueTicket[],
  playerIdsByTicket: Map<string, string[]>,
  layout: { teams: string[]; perTeam: number },
  teamSlots: Map<string, number>,
): void {
  for (const ticket of partyTickets) {
    const pids = playerIdsByTicket.get(ticket.id) ?? [];
    const team = findTeamForParty(layout.teams, teamSlots, pids.length, layout.perTeam);
    if (!team) continue;
    for (const pid of pids) game.teams.set(pid, team);
    teamSlots.set(team, (teamSlots.get(team) ?? 0) + pids.length);
  }
}

function fillSoloSlots(
  game: Game,
  soloPlayerIds: string[],
  layout: { teams: string[]; perTeam: number },
  teamSlots: Map<string, number>,
): void {
  let idx = 0;
  for (const team of layout.teams) {
    const remaining = layout.perTeam - (teamSlots.get(team) ?? 0);
    for (let i = 0; i < remaining && idx < soloPlayerIds.length; i++) {
      game.teams.set(soloPlayerIds[idx++], team);
    }
  }
}

/**
 * Party-aware team assignment.
 * 1. Place party tickets first — each party gets one team.
 * 2. Fill remaining team slots with shuffled solo players.
 */
export function assignTeams(
  game: Game,
  matchedTickets: QueueTicket[],
  playerIdsByTicket: Map<string, string[]>,
  mode: QuickPlayMode,
): void {
  if (!isTeamMode(mode)) return;
  const layout = TEAM_LAYOUTS[mode];
  if (!layout) return;

  game.teamsEnabled = true;

  const teamSlots = new Map<string, number>();
  for (const team of layout.teams) teamSlots.set(team, 0);

  const partyTickets = matchedTickets.filter(t => t.partyId !== null);
  const soloTickets = matchedTickets.filter(t => t.partyId === null);

  placeParties(game, partyTickets, playerIdsByTicket, layout, teamSlots);
  fillSoloSlots(game, collectShuffledSoloIds(soloTickets, playerIdsByTicket), layout, teamSlots);
}

function findTeamForParty(
  teams: string[],
  teamSlots: Map<string, number>,
  partySize: number,
  perTeam: number,
): string | null {
  for (const team of teams) {
    if ((teamSlots.get(team) ?? 0) + partySize <= perTeam) return team;
  }
  return null;
}
