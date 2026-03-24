import { describe, it, expect } from 'vitest';
import { addBot, removeBot } from '../game.js';
import { makeTeamGame } from './helpers.js';
import type { Game } from '@salvo/shared';

// ============================================================
// Helpers — mirrors the swap-team and swap-players socket handlers
// ============================================================

/** Replicate swap-team handler logic */
function swapTeam(game: Game, requesterId: string, targetPlayerId: string): boolean {
  if (game.phase !== 'lobby') return false;
  if (game.hostId !== requesterId && targetPlayerId !== requesterId) return false;
  const target = game.players.get(targetPlayerId);
  if (!target) return false;

  const currentTeam = game.teams.get(targetPlayerId);
  if (!currentTeam) {
    game.teams.set(targetPlayerId, 'alpha');
  } else if (currentTeam === 'alpha') {
    game.teams.set(targetPlayerId, 'bravo');
  } else {
    game.teams.set(targetPlayerId, 'alpha');
  }
  return true;
}

/** Replicate swap-players handler logic */
function swapPlayers(game: Game, requesterId: string, playerA: string, playerB: string): boolean {
  if (game.phase !== 'lobby') return false;
  if (game.hostId !== requesterId) return false;
  if (playerA === playerB) return false;

  const pA = game.players.get(playerA);
  const pB = game.players.get(playerB);
  if (!pA || !pB) return false;

  const teamA = game.teams.get(playerA);
  const teamB = game.teams.get(playerB);
  if (!teamA || !teamB || teamA === teamB) return false;

  game.teams.set(playerA, teamB);
  game.teams.set(playerB, teamA);
  return true;
}

// ============================================================
// swap-team tests
// ============================================================

describe('swap-team', () => {
  it('host can move a player to the other team', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    expect(game.teams.get('p3')).toBe('bravo');
    const ok = swapTeam(game, 'p1', 'p3');
    expect(ok).toBe(true);
    expect(game.teams.get('p3')).toBe('alpha');
  });

  it('player can move themselves', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    expect(game.teams.get('p3')).toBe('bravo');
    const ok = swapTeam(game, 'p3', 'p3');
    expect(ok).toBe(true);
    expect(game.teams.get('p3')).toBe('alpha');
  });

  it('rejects non-host moving another player', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    const ok = swapTeam(game, 'p2', 'p3');
    expect(ok).toBe(false);
    expect(game.teams.get('p3')).toBe('bravo');
  });

  it('rejects swap in non-lobby phase', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    game.phase = 'placement';
    const ok = swapTeam(game, 'p1', 'p3');
    expect(ok).toBe(false);
  });
});

// ============================================================
// swap-players tests
// ============================================================

describe('swap-players', () => {
  it('host can swap two players on different teams', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    // p1=alpha, p3=bravo
    const ok = swapPlayers(game, 'p1', 'p1', 'p3');
    expect(ok).toBe(true);
    expect(game.teams.get('p1')).toBe('bravo');
    expect(game.teams.get('p3')).toBe('alpha');
  });

  it('rejects non-host caller', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    const ok = swapPlayers(game, 'p2', 'p1', 'p3');
    expect(ok).toBe(false);
  });

  it('rejects swap in non-lobby phase', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    game.phase = 'placement';
    const ok = swapPlayers(game, 'p1', 'p1', 'p3');
    expect(ok).toBe(false);
  });

  it('rejects swapping a player with themselves', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    const ok = swapPlayers(game, 'p1', 'p2', 'p2');
    expect(ok).toBe(false);
  });

  it('rejects swapping two players on the same team', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    // p1 and p2 are both alpha
    const ok = swapPlayers(game, 'p1', 'p1', 'p2');
    expect(ok).toBe(false);
  });
});

// ============================================================
// Regression: removeBot must clean up team assignment
// Found by /investigate on 2026-03-23
// ============================================================

describe('removeBot team cleanup', () => {
  it('removes bot team assignment so the slot is actually freed', () => {
    const { game } = makeTeamGame(['alpha']);

    // Add a bot to alpha
    const result = addBot(game, 'hard');
    expect('botId' in result).toBe(true);
    const botId = (result as { botId: string }).botId;
    game.teams.set(botId, 'alpha');

    // Alpha now has 2 members
    let alphaCount = 0;
    for (const t of game.teams.values()) if (t === 'alpha') alphaCount++;
    expect(alphaCount).toBe(2);

    // Kick the bot
    const err = removeBot(game, botId);
    expect(err).toBeNull();

    // Alpha should have 1 member — the team entry must be cleaned up
    alphaCount = 0;
    for (const t of game.teams.values()) if (t === 'alpha') alphaCount++;
    expect(alphaCount).toBe(1);

    // The bot should not be in the teams map at all
    expect(game.teams.has(botId)).toBe(false);
  });
});
