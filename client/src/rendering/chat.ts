import { state } from '../state.js';
import type { ChatMessage } from '@salvo/shared';
import { formatTime } from '../helpers/format.js';
import { playerIcon, esc } from '../helpers/dom.js';

function renderChatMessage(m: ChatMessage, teamsEnabled: boolean): string {
  if (m.playerId === 'system') {
    return `<div class="chat-msg chat-msg-game"><span class="chat-time">${formatTime(m.timestamp)}</span> ${esc(m.text)}</div>`;
  }
  const chatPlayer = state.game?.players[m.playerId];
  const chatIcon = chatPlayer ? playerIcon(chatPlayer.isBot) : '';
  const teamBadge = teamsEnabled && state.game?.teams[m.playerId]
    ? `<span class="team-badge small ${state.game.teams[m.playerId]}">${state.game.teams[m.playerId].charAt(0).toUpperCase()}</span>`
    : '';
  const chatColor = chatPlayer?.color ?? 'green';
  return `<div class="chat-msg chat-msg-player">
    <div class="chat-msg-header">${chatIcon}${teamBadge}<span class="chat-name player-color-${chatColor}">${esc(m.playerName)}</span><span class="chat-time">${formatTime(m.timestamp)}</span></div>
    <div class="chat-msg-body">${esc(m.text)}</div>
  </div>`;
}

function getChatInputStyle(teamsEnabled: boolean): { placeholder: string; sendBtnClass: string } {
  if (!teamsEnabled) {
    return { placeholder: 'Type a message...', sendBtnClass: 'btn btn-secondary' };
  }
  const isTeam = state.chatChannel === 'team';
  return {
    placeholder: isTeam ? 'Team message...' : 'Message everyone...',
    sendBtnClass: isTeam ? 'btn btn-chat-team' : 'btn btn-chat-global',
  };
}

function renderChatToggle(): string {
  return `
    <div class="chat-toggle" role="tablist">
      <button class="chat-toggle-tab ${state.chatChannel === 'team' ? 'active team' : ''}" data-channel="team" role="tab" aria-selected="${state.chatChannel === 'team'}">Team</button>
      <button class="chat-toggle-tab ${state.chatChannel === 'global' ? 'active global' : ''}" data-channel="global" role="tab" aria-selected="${state.chatChannel === 'global'}">Global</button>
    </div>
  `;
}

export function renderChat(): string {
  const teamsEnabled = state.game?.teamsEnabled ?? false;

  const filteredMessages = teamsEnabled
    ? state.chatMessages.filter(m => m.playerId === 'system' || m.channel === state.chatChannel)
    : state.chatMessages;

  const chatHtml = filteredMessages.slice(-30).map(m => renderChatMessage(m, teamsEnabled)).join('');
  const toggleHtml = teamsEnabled ? renderChatToggle() : '';
  const { placeholder, sendBtnClass } = getChatInputStyle(teamsEnabled);

  return `
    <div class="chat-panel">
      <h3>Chat</h3>
      ${toggleHtml}
      <div class="chat-messages">${chatHtml}</div>
      <div class="chat-input-row">
        <input class="input" id="chat-input" type="text" placeholder="${placeholder}" maxlength="200" autocomplete="off">
        <button class="${sendBtnClass}" id="btn-chat">Send</button>
      </div>
    </div>`;
}
