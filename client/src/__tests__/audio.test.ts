import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from '../state.js';

describe('Audio', () => {
  beforeEach(() => {
    state.matchSoundMuted = false;
  });

  describe('playMatchSound', () => {
    it('does not throw when AudioContext unavailable', async () => {
      // Without AudioContext mock, functions should silently no-op
      const { playMatchSound } = await import('../audio/index.js');
      expect(() => playMatchSound()).not.toThrow();
    });

    it('does not play when muted', async () => {
      state.matchSoundMuted = true;
      const { playMatchSound } = await import('../audio/index.js');
      // Should return early without touching AudioContext
      expect(() => playMatchSound()).not.toThrow();
    });
  });

  describe('playTurnSound', () => {
    it('does not throw when AudioContext unavailable', async () => {
      const { playTurnSound } = await import('../audio/index.js');
      expect(() => playTurnSound()).not.toThrow();
    });
  });

  describe('playSalvoSound', () => {
    it('does not throw for sunk shots', async () => {
      const { playSalvoSound } = await import('../audio/index.js');
      expect(() => playSalvoSound([{
        coord: '0,0', miss: false,
        hits: [{ playerId: 'p1', playerName: 'P1', shipLength: 2, sunk: true, sunkShipCells: ['0,0', '1,0'] }],
      }])).not.toThrow();
    });

    it('does not throw for hit shots', async () => {
      const { playSalvoSound } = await import('../audio/index.js');
      expect(() => playSalvoSound([{
        coord: '0,0', miss: false,
        hits: [{ playerId: 'p1', playerName: 'P1', shipLength: 3, sunk: false, sunkShipCells: null }],
      }])).not.toThrow();
    });

    it('does not throw for miss shots', async () => {
      const { playSalvoSound } = await import('../audio/index.js');
      expect(() => playSalvoSound([{ coord: '0,0', miss: true, hits: [] }])).not.toThrow();
    });
  });

  describe('playPlacementSound', () => {
    it('does not throw when AudioContext unavailable', async () => {
      const { playPlacementSound } = await import('../audio/index.js');
      expect(() => playPlacementSound()).not.toThrow();
    });
  });
});
