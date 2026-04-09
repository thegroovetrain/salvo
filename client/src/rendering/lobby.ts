import { state } from '../state.js';
import { esc } from '../helpers/dom.js';
import { marked } from 'marked';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

export function renderError(): string {
  const parts: string[] = [];
  if (state.errorMessage) parts.push(`<div class="alert alert-error">${esc(state.errorMessage)}</div>`);
  if (state.infoMessage) parts.push(`<div class="alert alert-info">${esc(state.infoMessage)}</div>`);
  return parts.join('');
}

export function renderLobby(): string {
  const joinModalHtml = state.showJoinModal ? `
    <div class="modal-overlay" id="join-modal-overlay">
      <div class="modal">
        <h2 class="label" style="margin-bottom:12px">Enter Game Code</h2>
        <input class="input input-code" id="join-code" type="text" placeholder="XXXX" maxlength="8" autocomplete="off" autofocus>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn btn-amber" id="btn-join" style="flex:1">Join</button>
          <button class="btn btn-secondary" id="btn-join-cancel" style="flex:1">Cancel</button>
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="screen">
      <h1 class="game-title">HULLCRACKER.IO</h1>
      <p class="game-subtitle">Multiplayer Naval Warfare</p>
      <p class="online-count" id="online-count">${state.onlineCount > 0 ? `${state.onlineCount} player${state.onlineCount !== 1 ? 's' : ''} online` : ''}</p>
      ${renderError()}
      <div class="lobby-card" style="max-width:400px;width:100%">
        <label class="input-label">Your Name</label>
        <div style="display:flex;gap:8px">
          <input class="input" id="player-name" type="text" placeholder="Enter your name" maxlength="20" autocomplete="off" value="${esc(state.savedPlayerName)}" style="flex:1">
          <button class="btn-dice" id="btn-randomize" type="button" title="Random name">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
        <button class="btn btn-amber" id="btn-quickplay" style="width:100%;margin:12px 0 8px">Quick Play</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="btn-create" style="flex:1">Create Game</button>
          <button class="btn btn-outline-green" id="btn-show-join" style="flex:1">Join Game</button>
        </div>
      </div>
      ${joinModalHtml}
      <div class="lobby-footer">
        <span>v${VERSION}</span>
        <span class="footer-sep">&bull;</span>
        <a href="#" id="btn-changelog">Changelog</a>
      </div>
    </div>`;
}


export function renderQueue(): string {
  const target = 6;
  const size = state.queueSize;

  const dots = Array.from({ length: target }, (_, i) =>
    `<span class="queue-dot ${i < size ? 'filled' : ''}">${i < size ? '\u25CF' : '\u25CB'}</span>`
  ).join(' ');

  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:24px">HULLCRACKER.IO</h1>
      <div class="queue-wait">
        <p class="label queue-label">SEARCHING FOR MATCH...</p>
        <div class="queue-dots">${dots}</div>
        <p class="queue-count">${size} of ${target}</p>
        <button class="btn btn-secondary" id="btn-queue-cancel" style="margin-top:24px">Cancel</button>
      </div>
    </div>`;
}

export function renderChangelog(): string {
  // Content loaded async — show cached or loading state
  const content = state.changelogHtml || '<p style="color:var(--text-muted)">Loading changelog...</p>';
  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:32px">CHANGELOG</h1>
      <button class="btn btn-secondary" id="btn-changelog-back" style="max-width:200px;margin-bottom:16px">Back to Lobby</button>
      <div class="changelog">${content}</div>
    </div>`;
}

export async function loadChangelog(): Promise<void> {
  try {
    const resp = await fetch('/CHANGELOG.md');
    if (!resp.ok) throw new Error(`${resp.status}`);
    const md = await resp.text();
    state.changelogHtml = marked(md) as string;
  } catch {
    state.changelogHtml = '<p style="color:var(--text-muted)">Could not load changelog.</p>';
  }
  if (state.screen === 'changelog') {
    const { render } = await import('./render.js');
    render();
  }
}
