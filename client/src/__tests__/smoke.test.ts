import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../state.js';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    connected: false,
  })),
}));

// Mock hexGrid SVG rendering
vi.mock('../hexGrid.js', () => ({
  renderHexGridSVG: vi.fn(() => '<svg class="hex-grid"></svg>'),
  svgClickToHex: vi.fn(),
  getShipPreview: vi.fn(),
  nextDirection: vi.fn(),
  parseHex: vi.fn(),
  hexToString: vi.fn(),
  allHexes: vi.fn(() => []),
  hexLinear: vi.fn(),
  isValidHex: vi.fn(),
  HEX_DIRECTIONS: [],
  PLAYER_COLOR_HEX: {},
}));

// Mock marked for changelog rendering
vi.mock('marked', () => ({
  marked: vi.fn((md: string) => `<p>${md}</p>`),
}));

import { renderLobby, renderQueue, renderChangelog, renderError } from '../rendering/lobby.js';
import { renderSurrenderModal } from '../rendering/modals.js';

describe('Smoke Tests — Screen Rendering', () => {
  beforeEach(() => {
    // Reset to clean lobby state
    state.screen = 'lobby';
    state.playerId = null;
    state.game = null;
    state.savedPlayerName = 'TestPlayer';
    state.onlineCount = 5;
    state.showJoinModal = false;
    state.errorMessage = null;
    state.infoMessage = null;
    state.queueSize = 0;
    state.changelogHtml = null;
    state.showSurrenderModal = false;
  });

  describe('renderLobby', () => {
    it('renders without errors', () => {
      const html = renderLobby();
      expect(html).toContain('HULLCRACKER.IO');
    });

    it('contains player name input', () => {
      const html = renderLobby();
      expect(html).toContain('id="player-name"');
    });

    it('contains Quick Play button', () => {
      const html = renderLobby();
      expect(html).toContain('id="btn-quickplay"');
    });

    it('contains Create and Join buttons', () => {
      const html = renderLobby();
      expect(html).toContain('id="btn-create"');
      expect(html).toContain('id="btn-show-join"');
    });

    it('shows online count when > 0', () => {
      const html = renderLobby();
      expect(html).toContain('5 players online');
    });
  });

  describe('renderQueue', () => {
    it('renders queue screen', () => {
      state.queueSize = 1;
      const html = renderQueue();
      expect(html).toContain('SEARCHING FOR MATCH');
      expect(html).toContain('id="btn-queue-cancel"');
    });

    it('shows correct player count', () => {
      state.queueSize = 3;
      const html = renderQueue();
      expect(html).toContain('3 of 6');
    });
  });

  describe('renderChangelog', () => {
    it('renders loading state when no content', () => {
      const html = renderChangelog();
      expect(html).toContain('Loading changelog...');
    });

    it('renders cached content when available', () => {
      state.changelogHtml = '<p>v0.13.0 changelog</p>';
      const html = renderChangelog();
      expect(html).toContain('v0.13.0 changelog');
    });
  });

  describe('renderError', () => {
    it('returns empty string when no error', () => {
      expect(renderError()).toBe('');
    });

    it('renders error message', () => {
      state.errorMessage = 'Something went wrong';
      const html = renderError();
      expect(html).toContain('alert-error');
      expect(html).toContain('Something went wrong');
    });

    it('renders info message', () => {
      state.infoMessage = 'You are now the host';
      const html = renderError();
      expect(html).toContain('alert-info');
      expect(html).toContain('You are now the host');
    });
  });

  describe('Modals', () => {
    it('renderSurrenderModal returns empty when not showing', () => {
      expect(renderSurrenderModal()).toBe('');
    });

    it('renderSurrenderModal renders when showing', () => {
      state.showSurrenderModal = true;
      const html = renderSurrenderModal();
      expect(html).toContain('btn-surrender-confirm');
      expect(html).toContain('btn-surrender-cancel');
    });

});
});
