import './style.css';
import { state } from './state.js';
import { generateRandomName } from './helpers/format.js';
import { migrateStorageKeys } from './helpers/storage.js';
import { initTheme, initMuteToggle } from './settings/index.js';
import { render, setBindEvents } from './rendering/render.js';
import { bindEvents } from './handlers/eventBindings.js';
import { registerGameHandlers } from './handlers/socketGame.js';
import { registerLobbyHandlers } from './handlers/socketLobby.js';
import { registerSocialHandlers } from './handlers/socketSocial.js';
import { socket } from './socket.js';

// ============================================================
// Bootstrap
// ============================================================

// Migrate legacy storage keys
migrateStorageKeys();

// Initialize state from localStorage (state.ts has safe defaults)
state.savedPlayerName = localStorage.getItem('hullcracker-player-name') || generateRandomName();
state.matchSoundMuted = localStorage.getItem('hullcracker-muted') === 'true';

// Persist initial name (covers first-visit generation)
if (!localStorage.getItem('hullcracker-player-name')) {
  localStorage.setItem('hullcracker-player-name', state.savedPlayerName);
}

// Wire up bindEvents for the render cycle
setBindEvents(bindEvents);

// Register all socket event handlers
registerGameHandlers();
registerLobbyHandlers();
registerSocialHandlers();

// Back button guard for queue screen
window.addEventListener('popstate', () => {
  if (state.screen === 'queue') {
    socket.emit('quickplay-leave');
    state.screen = 'lobby';
    state.queueSize = 0;
    render();
  }
});

// Persistent UI elements
initTheme();
initMuteToggle();

// Click-outside handler for dropdowns — registered once, not per-render
document.addEventListener('click', () => {
  if (state.openDropdownId) {
    state.openDropdownId = null;
    render();
  }
});

// Initial render
render();
