// THE LOBBY MODAL (cycle 167, Eric rulings 2026-10-02).
//
// EVERY WORD IS RULING 9'S, and nothing else is rendered: `LOBBY`; `CODE
// XXXXXX` (a click copies the code — no toast text); `N/20 ABOARD` and one row
// per captain, callsign plus `READY` when ready; the seed — an input with the
// placeholder `SEED (OPTIONAL)` for the host, the seed text shown read-only in
// the same place for everyone else (ruling 9: every player sees it); the
// host-only `BOT-FILL` toggle and `START NOW` (disabled with `2 CAPTAINS OR
// BOT-FILL REQUIRED` while fewer than two captains are aboard and bot-fill is
// off — ruling 2); `STARTS IN m:ss` only while the server's countdown runs;
// `READY` / `UNREADY`; `LEAVE` (ESC too); and `YOU ARE HOST` once the host role
// is handed to this player (ruling 6). lobbyModal.test.ts pins the whole text.
//
// HOST CONTROLS EXIST ONLY FOR THE HOST: they are built when `hostId` becomes
// this session and torn down otherwise — never merely hidden.
//
// It reads `LobbyView`s and calls `LobbyActions`; it never touches a room
// (net → ui one-way). It sits in the queue modal's slot (z 1150) and replaces
// the join-code modal — modals never stack.

import { CONFIG } from '@salvo/shared';
import type { LobbyView } from '../net/lobby.js';
import {
  applyHairline,
  bindModalKeys,
  makeLine,
  makeModalButton,
  makeModalInput,
  makeModalShell,
  paintSlot,
  setButtonEnabled,
} from './portModal.js';
import { countdownMmSs } from './queueModal.js';

const LOBBY_MODAL_ID = 'lobby-modal';
const TICK_MS = 250;

export interface LobbyActions {
  onReady(ready: boolean): void;
  onSeed(text: string): void;
  onBotFill(on: boolean): void;
  onStart(): void;
  /** LEAVE / ESC. The modal is already gone when this runs. */
  onLeave(): void;
}

// --- pure copy + rules (tested) ----------------------------------------------

export function codeLine(code: string): string {
  return `CODE ${code}`;
}

/** `N/20 ABOARD` — the cap is `CONFIG.map.playerCap` (ruling 4: fixed 20). */
export function aboardLine(n: number, cap: number = CONFIG.map.playerCap): string {
  return `${n}/${cap} ABOARD`;
}

export function isHost(v: LobbyView): boolean {
  return v.hostId !== '' && v.hostId === v.mySessionId;
}

export function myReady(v: LobbyView): boolean {
  return v.players.some((p) => p.id === v.mySessionId && p.ready);
}

/** Ruling 2: a start is legal with two captains aboard, or with bot-fill on. */
export function startEligible(v: LobbyView): boolean {
  return v.players.length >= 2 || v.botFill;
}

export const START_BLOCKED = '2 CAPTAINS OR BOT-FILL REQUIRED';

/** `STARTS IN m:ss` while a deadline stands, else empty. */
export function lobbyCountdownLine(deadlineAt: number | null, nowMs: number): string {
  return deadlineAt === null ? '' : `STARTS IN ${countdownMmSs(deadlineAt - nowMs)}`;
}

// --- DOM ---------------------------------------------------------------------

interface HostEls {
  root: HTMLElement;
  seed: HTMLInputElement;
  botFill: HTMLButtonElement;
  start: HTMLButtonElement;
  reason: HTMLElement;
}

interface Mounted {
  overlay: HTMLElement;
  notice: HTMLElement;
  code: HTMLElement;
  aboard: HTMLElement;
  roster: HTMLElement;
  seedSlot: HTMLElement;
  hostSlot: HTMLElement;
  countdown: HTMLElement;
  ready: HTMLButtonElement;
  actions: LobbyActions;
  view: LobbyView | null;
  host: HostEls | null;
  readOnlySeed: HTMLElement | null;
  /** Set when the host role passes TO this player after the first view. */
  handedOff: boolean;
  tick: ReturnType<typeof setInterval> | null;
  detachKeys: () => void;
}

let mounted: Mounted | null = null;

export function lobbyModalVisible(): boolean {
  return mounted !== null;
}

function makeCodeLine(): HTMLElement {
  const el = makeLine('hudReadout', 'var(--hc-phosphor)');
  el.style.letterSpacing = '0.18em';
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    const code = mounted?.view?.code ?? '';
    if (code === '') return;
    void navigator.clipboard?.writeText(code).catch(() => undefined);
  });
  return el;
}

function makeRoster(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto;min-width:260px';
  return el;
}

function makeRosterRow(name: string, ready: boolean): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;justify-content:space-between;gap:24px;' +
    'font:500 14px var(--hc-font-mono);letter-spacing:.1em;text-transform:uppercase';
  const callsign = document.createElement('span');
  callsign.style.color = 'var(--hc-text-primary)';
  callsign.textContent = name;
  const mark = document.createElement('span');
  mark.style.color = 'var(--hc-phosphor)';
  mark.textContent = ready ? 'READY' : '';
  row.append(callsign, mark);
  return row;
}

function makeSeedInput(actions: LobbyActions): HTMLInputElement {
  const input = makeModalInput();
  input.placeholder = 'SEED (OPTIONAL)';
  // The seed is free text hashed AS TYPED, so it is shown as typed — an
  // uppercased display would hide the difference between two different maps.
  input.style.textTransform = 'none';
  input.maxLength = CONFIG.lobby.seedTextMax;
  // Sent on Enter and on blur, and only when it differs from what the lobby
  // already holds — a focus that wanders through the field sends nothing.
  const send = (): void => {
    const text = input.value.trim();
    if (text === (mounted?.view?.seedText ?? '')) return;
    actions.onSeed(text);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.stopPropagation();
    send();
  });
  input.addEventListener('blur', send);
  return input;
}

/** BOT-FILL is a toggle chip: lit phosphor when on, hairline + muted when off. */
function paintBotFill(btn: HTMLButtonElement, on: boolean): void {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.style.color = on ? 'var(--hc-phosphor)' : 'var(--hc-text-secondary)';
  applyHairline(btn, on ? 'var(--hc-phosphor)' : 'var(--hc-hairline)');
}

function makeHostEls(actions: LobbyActions): HostEls {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px';
  const botFill = makeModalButton('BOT-FILL', 'var(--hc-phosphor)', () =>
    actions.onBotFill(!(mounted?.view?.botFill ?? false)),
  );
  const start = makeModalButton('START NOW', 'var(--hc-phosphor)', () => actions.onStart());
  const reason = makeLine('hudMicro', 'var(--hc-text-secondary)');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap';
  row.append(botFill, start);
  root.append(row, reason);
  return { root, seed: makeSeedInput(actions), botFill, start, reason };
}

function paintHost(h: HostEls, v: LobbyView): void {
  if (document.activeElement !== h.seed) h.seed.value = v.seedText;
  paintBotFill(h.botFill, v.botFill);
  const eligible = startEligible(v);
  setButtonEnabled(h.start, eligible);
  paintSlot(h.reason, eligible ? '' : START_BLOCKED);
}

/** Build or tear down the host-only controls and the seed's two forms. */
function syncRole(m: Mounted, host: boolean): void {
  if (host && m.host === null) {
    m.readOnlySeed = null;
    m.host = makeHostEls(m.actions);
    m.seedSlot.replaceChildren(m.host.seed);
    m.hostSlot.replaceChildren(m.host.root);
  } else if (!host && (m.host !== null || m.readOnlySeed === null)) {
    m.host = null;
    m.readOnlySeed = makeLine('label', 'var(--hc-text-primary)');
    m.readOnlySeed.style.textTransform = 'none'; // as typed — see makeSeedInput
    m.seedSlot.replaceChildren(m.readOnlySeed);
    m.hostSlot.replaceChildren();
  }
}

function paintCountdown(m: Mounted): void {
  paintSlot(m.countdown, lobbyCountdownLine(m.view?.deadlineAt ?? null, Date.now()));
}

/** The local repaint tick exists only while a countdown stands. */
function retick(m: Mounted): void {
  const counting = (m.view?.deadlineAt ?? null) !== null;
  if (counting && m.tick === null) m.tick = setInterval(() => paintCountdown(m), TICK_MS);
  else if (!counting && m.tick !== null) {
    clearInterval(m.tick);
    m.tick = null;
  }
}

function noteHandOff(m: Mounted, v: LobbyView): void {
  const prev = m.view;
  if (prev !== null && prev.hostId !== '' && prev.hostId !== v.hostId && isHost(v)) m.handedOff = true;
  if (!isHost(v)) m.handedOff = false;
}

function paintRoster(m: Mounted, v: LobbyView): void {
  m.aboard.textContent = aboardLine(v.players.length);
  m.roster.replaceChildren(...v.players.map((p) => makeRosterRow(p.name, p.ready)));
}

/**
 * Open the modal with nothing known yet (the first view follows at once).
 * Replaces any open lobby modal — never two.
 */
export function showLobbyModal(actions: LobbyActions): void {
  hideLobbyModal();
  const { overlay, panel } = makeModalShell(LOBBY_MODAL_ID);
  const heading = makeLine('label', 'var(--hc-phosphor)');
  heading.textContent = 'LOBBY';
  const leave = (): void => {
    hideLobbyModal();
    actions.onLeave();
  };
  const m: Mounted = {
    overlay,
    notice: makeLine('hudMicro', 'var(--hc-amber)'),
    code: makeCodeLine(),
    aboard: makeLine('hudMicro', 'var(--hc-phosphor)'),
    roster: makeRoster(),
    seedSlot: document.createElement('div'),
    hostSlot: document.createElement('div'),
    countdown: makeLine('hudMicro', 'var(--hc-phosphor)'),
    ready: makeModalButton('READY', 'var(--hc-amber)', () => {
      if (m.view !== null) actions.onReady(!myReady(m.view));
    }),
    actions,
    view: null,
    host: null,
    readOnlySeed: null,
    handedOff: false,
    tick: null,
    detachKeys: bindModalKeys(leave),
  };
  paintSlot(m.notice, '');
  paintSlot(m.countdown, '');
  const leaveBtn = makeModalButton('LEAVE', 'var(--hc-denied)', leave);
  panel.append(heading, m.notice, m.code, m.aboard, m.roster, m.seedSlot, m.hostSlot, m.countdown, m.ready, leaveBtn);
  document.body.appendChild(overlay);
  mounted = m;
}

/** Fold one `LobbyView` into the open modal; a no-op when none is open. */
export function updateLobbyModal(v: LobbyView): void {
  const m = mounted;
  if (m === null) return;
  noteHandOff(m, v);
  m.view = v;
  const host = isHost(v);
  syncRole(m, host);
  paintSlot(m.notice, m.handedOff ? 'YOU ARE HOST' : '');
  m.code.textContent = codeLine(v.code);
  paintRoster(m, v);
  if (m.host !== null) paintHost(m.host, v);
  if (m.readOnlySeed !== null) paintSlot(m.readOnlySeed, v.seedText);
  m.ready.textContent = myReady(v) ? 'UNREADY' : 'READY';
  paintCountdown(m);
  retick(m);
}

/** Close. Idempotent; the one teardown path (LEAVE, ESC, the seat, a failure). */
export function hideLobbyModal(): void {
  const m = mounted;
  mounted = null;
  if (m !== null) {
    if (m.tick !== null) clearInterval(m.tick);
    m.detachKeys();
    m.overlay.remove();
  }
  document.getElementById(LOBBY_MODAL_ID)?.remove();
}
