import { state } from '../state.js';
import { renderSurrenderModal } from './modals.js';
import { renderLobby, renderQueue, renderChangelog } from './lobby.js';
import { renderWaiting } from './waiting.js';
import { renderPlacement, renderBattle } from './battle.js';
import { renderGameOver } from './gameOver.js';

// bindEvents is expected to be injected via setBindEvents before render() is called.
// This avoids a circular dependency with handlers/eventBindings.ts.
let _bindEvents: (() => void) | null = null;

export function setBindEvents(fn: () => void): void {
  _bindEvents = fn;
}

export function render(): void {
  const app = document.getElementById('app')!;

  // Capture scroll positions before innerHTML destroys the DOM
  const shotLog = document.querySelector('.shot-log');
  const chatMsgs = document.querySelector('.chat-messages');
  const shotLogScroll = shotLog ? shotLog.scrollTop : null;
  const chatScroll = chatMsgs ? chatMsgs.scrollTop : null;

  const screenRenderers: Record<string, () => string> = {
    lobby: renderLobby,
    queue: renderQueue,
    waiting: renderWaiting,
    placement: renderPlacement,
    battle: renderBattle,
    gameover: renderGameOver,
    changelog: renderChangelog,
  };
  const renderer = screenRenderers[state.screen];
  if (renderer) app.innerHTML = renderer();

  // Append modals (surrender confirmation)
  app.innerHTML += renderSurrenderModal();

  // Restore scroll positions after DOM rebuild
  if (shotLogScroll !== null) {
    const el = document.querySelector('.shot-log');
    if (el) el.scrollTop = shotLogScroll;
  }
  if (chatScroll !== null) {
    const el = document.querySelector('.chat-messages');
    if (el) el.scrollTop = chatScroll;
  }

  if (_bindEvents) _bindEvents();
}
