import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../state.js';
import type { AppState } from '../state.js';

describe('AppState', () => {
  it('has expected default values', () => {
    expect(state.screen).toBe('lobby');
    expect(state.playerId).toBeNull();
    expect(state.gameId).toBeNull();
    expect(state.joinCode).toBeNull();
    expect(state.game).toBeNull();
    expect(state.isHost).toBe(false);
    expect(state.placedShips).toEqual([]);
    expect(state.placingShip).toBeNull();
    expect(state.ghostCells).toEqual([]);
    expect(state.ghostValid).toBe(false);
    expect(state.shipsSent).toBe(false);
    expect(state.selectedTargets).toEqual([]);
    expect(state.isMyTurn).toBe(false);
    expect(state.shotLog).toEqual([]);
    expect(state.chatMessages).toEqual([]);
    expect(state.chatChannel).toBe('global');
    expect(state.gameOverStats).toBeNull();
    expect(state.rematchPending).toBeNull();
    expect(state.showJoinModal).toBe(false);
    expect(state.queueSize).toBe(0);
    expect(state.onlineCount).toBe(0);
    expect(state.openDropdownId).toBeNull();
    expect(state.showSurrenderModal).toBe(false);
    expect(state.errorMessage).toBeNull();
  });

  it('is mutable — state changes persist across imports', () => {
    const original = state.screen;
    state.screen = 'battle';
    expect(state.screen).toBe('battle');
    state.screen = original; // restore
  });

  it('savedPlayerName defaults to empty string (initialized in main.ts)', () => {
    // state.ts sets empty string; main.ts fills it from localStorage/generateRandomName
    expect(typeof state.savedPlayerName).toBe('string');
  });
});
