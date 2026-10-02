// THE LOBBY MODAL (cycle 167, Eric rulings 2026-10-02; re-laid out the same
// day on Eric's staging ruling — "far too janky … the modal changes size").
//
// EVERY WORD IS RULING 9'S plus the option labels, and nothing else is
// rendered. Top to bottom: `LOBBY`; a reserved line for `YOU ARE HOST` (once
// the host role is handed to this player, ruling 6); `CODE XXXXXX` (a click
// copies the code — no toast text); the OPTIONS — `SEED` then the host's input
// (placeholder `OPTIONAL`) or, for everyone else, the seed text as typed
// (ruling 9: every player sees it), and `BOT-FILL` then the host's `YES` |
// `NO` chips (exactly one lit) or the status word; `N/20 ABOARD`; TWENTY slots,
// two columns of ten, filled left to right then top to bottom in join order,
// each a circle (phosphor when ready, denied red when not) and the callsign;
// `STARTS IN m:ss` while the server's countdown runs; `READY` / `UNREADY`,
// `LEAVE` (ESC too) and, for the host, `START NOW` — which ARMS the server's
// countdown, so it is disabled while one runs, and while ineligible with `2
// CAPTAINS OR BOT-FILL REQUIRED` under the row (ruling 2). lobbyModal.test.ts
// pins the whole text.
//
// ONE FIXED GEOMETRY (ui/lobbyLayout.ts): nothing here may resize the panel.
// HOST CONTROLS EXIST ONLY FOR THE HOST — built into their fixed boxes when
// `hostId` becomes this session and swapped out otherwise; the boxes stay.
//
// It reads `LobbyView`s and calls `LobbyActions`; it never touches a room
// (net → ui one-way). It sits in the queue modal's slot (z 1150) and replaces
// the join-code modal — modals never stack.

import { CONFIG } from '@salvo/shared';
import { LOBBY_SEED_DEBOUNCE_MS } from '../config.js';
import type { LobbyView } from '../net/lobby.js';
import {
  fillCell,
  fixPanel,
  makeButtonRow,
  makeChip,
  makeFixedLine,
  makeOptionStatus,
  makeOptionsBlock,
  makeSeedField,
  makeSlotGrid,
  paintChip,
  paintSlotEls,
  type SlotEls,
} from './lobbyLayout.js';
import { bindModalKeys, makeModalButton, makeModalShell, paintSlot, setButtonEnabled } from './portModal.js';
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

/** START NOW arms the server's countdown, so it is dead while one runs. */
export function startEnabled(v: LobbyView): boolean {
  return startEligible(v) && !(v.countdownEndT > 0);
}

export const START_BLOCKED = '2 CAPTAINS OR BOT-FILL REQUIRED';

/** `STARTS IN m:ss` while a deadline stands, else empty. */
export function lobbyCountdownLine(deadlineAt: number | null, nowMs: number): string {
  return deadlineAt === null ? '' : `STARTS IN ${countdownMmSs(deadlineAt - nowMs)}`;
}

// --- DOM ---------------------------------------------------------------------

interface HostEls {
  seed: HTMLInputElement;
  /** Drops a pending debounced seed send (teardown). */
  cancelSeed: () => void;
  /** The BOT-FILL value last chosen, until the lobby's view agrees (see `Mounted.wantReady`). */
  wantBotFill: boolean | null;
  chips: HTMLElement;
  yes: HTMLButtonElement;
  no: HTMLButtonElement;
  start: HTMLButtonElement;
}

interface GuestEls {
  seed: HTMLElement;
  botFill: HTMLElement;
}

/** The fixed boxes whose CONTENTS change with the host role. */
interface RoleBoxes {
  seedValue: HTMLElement;
  botFillValue: HTMLElement;
  startCell: HTMLElement;
}

interface Mounted {
  overlay: HTMLElement;
  notice: HTMLElement;
  code: HTMLElement;
  aboard: HTMLElement;
  slots: SlotEls[];
  boxes: RoleBoxes;
  countdown: HTMLElement;
  reason: HTMLElement;
  ready: HTMLButtonElement;
  /**
   * The READY value last clicked, until the lobby's view agrees with it. Two
   * clicks before the server's patch lands must send true THEN false — a
   * toggle computed from the stale view would send the same value twice. The
   * label follows this intent; null = the view rules.
   */
  wantReady: boolean | null;
  actions: LobbyActions;
  view: LobbyView | null;
  host: HostEls | null;
  guest: GuestEls | null;
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
  const el = makeFixedLine('code', 'hudReadout', 'var(--hc-phosphor)');
  el.style.letterSpacing = '0.18em';
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    const code = mounted?.view?.code ?? '';
    if (code === '') return;
    void navigator.clipboard?.writeText(code).catch(() => undefined);
  });
  return el;
}

function makeSeedInput(actions: LobbyActions): { input: HTMLInputElement; cancel: () => void } {
  const input = makeSeedField();
  // Sent on Enter, on blur, and LOBBY_SEED_DEBOUNCE_MS after the last
  // keystroke (text typed during a countdown must not be lost at form) — and
  // only when it differs from what was last sent (or, before any send, from
  // what the lobby holds): a focus that wanders through the field sends nothing.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSent: string | null = null;
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const send = (): void => {
    cancel();
    const text = input.value.trim();
    if (text === (lastSent ?? mounted?.view?.seedText ?? '')) return;
    lastSent = text;
    actions.onSeed(text);
  };
  input.addEventListener('input', () => {
    cancel();
    timer = setTimeout(send, LOBBY_SEED_DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.stopPropagation();
    send();
  });
  input.addEventListener('blur', send);
  return { input, cancel };
}

/** BOT-FILL as the host last chose it, else as the lobby holds it. */
function shownBotFill(h: HostEls): boolean {
  return h.wantBotFill ?? mounted?.view?.botFill ?? false;
}

function paintBotFillChips(h: HostEls, on: boolean): void {
  paintChip(h.yes, on);
  paintChip(h.no, !on);
}

/** YES / NO: choosing the lit chip sends nothing; the other sends its value. */
function chooseBotFill(h: HostEls, actions: LobbyActions, on: boolean): void {
  if (shownBotFill(h) === on) return;
  h.wantBotFill = on;
  actions.onBotFill(on);
  paintBotFillChips(h, on);
}

function makeHostEls(actions: LobbyActions): HostEls {
  const seed = makeSeedInput(actions);
  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;gap:8px;align-items:center';
  const h: HostEls = {
    seed: seed.input,
    cancelSeed: seed.cancel,
    wantBotFill: null,
    chips,
    yes: makeChip('YES', () => chooseBotFill(h, actions, true)),
    no: makeChip('NO', () => chooseBotFill(h, actions, false)),
    start: fillCell(makeModalButton('START NOW', 'var(--hc-phosphor)', () => actions.onStart())),
  };
  chips.append(h.yes, h.no);
  return h;
}

function paintHost(m: Mounted, h: HostEls, v: LobbyView): void {
  if (document.activeElement !== h.seed) h.seed.value = v.seedText;
  if (h.wantBotFill === v.botFill) h.wantBotFill = null; // the lobby caught up
  paintBotFillChips(h, h.wantBotFill ?? v.botFill);
  setButtonEnabled(h.start, startEnabled(v));
  paintSlot(m.reason, startEligible(v) ? '' : START_BLOCKED);
}

function paintGuest(m: Mounted, g: GuestEls, v: LobbyView): void {
  paintSlot(g.seed, v.seedText);
  g.botFill.textContent = v.botFill ? 'YES' : 'NO';
  paintSlot(m.reason, '');
}

function becomeHost(m: Mounted): void {
  m.guest = null;
  m.host = makeHostEls(m.actions);
  m.boxes.seedValue.replaceChildren(m.host.seed);
  m.boxes.botFillValue.replaceChildren(m.host.chips);
  m.boxes.startCell.replaceChildren(m.host.start);
}

function becomeGuest(m: Mounted): void {
  m.host?.cancelSeed();
  m.host = null;
  m.guest = { seed: makeOptionStatus(true), botFill: makeOptionStatus(false) };
  m.boxes.seedValue.replaceChildren(m.guest.seed);
  m.boxes.botFillValue.replaceChildren(m.guest.botFill);
  m.boxes.startCell.replaceChildren();
}

/** Swap the role boxes' contents; the boxes themselves never move or resize. */
function syncRole(m: Mounted, host: boolean): void {
  if (host && m.host === null) becomeHost(m);
  else if (!host && m.guest === null) becomeGuest(m);
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

/** READY as the player last asked for it, else as the lobby holds it. */
function shownReady(m: Mounted): boolean {
  return m.wantReady ?? (m.view !== null && myReady(m.view));
}

function paintReady(m: Mounted): void {
  m.ready.textContent = shownReady(m) ? 'UNREADY' : 'READY';
}

function toggleReady(m: Mounted): void {
  if (m.view === null) return;
  const next = !shownReady(m);
  m.wantReady = next;
  m.actions.onReady(next);
  paintReady(m);
}

/** Join order fills slot 1, 2, 3 … = r1c1, r1c2, r2c1 …; the rest stay empty. */
function paintRoster(m: Mounted, v: LobbyView): void {
  m.aboard.textContent = aboardLine(v.players.length);
  m.slots.forEach((s, i) => paintSlotEls(s, v.players[i]));
}

function mountParts(
  overlay: HTMLElement,
  actions: LobbyActions,
  leave: () => void,
): { m: Mounted; parts: HTMLElement[] } {
  const options = makeOptionsBlock();
  const { grid, slots } = makeSlotGrid();
  const buttons = makeButtonRow();
  const m: Mounted = {
    overlay,
    notice: makeFixedLine('notice', 'hudMicro', 'var(--hc-amber)'),
    code: makeCodeLine(),
    aboard: makeFixedLine('aboard', 'hudMicro', 'var(--hc-phosphor)'),
    slots,
    boxes: { seedValue: options.seed.value, botFillValue: options.botFill.value, startCell: buttons.cells[2] },
    countdown: makeFixedLine('countdown', 'hudMicro', 'var(--hc-phosphor)'),
    reason: makeFixedLine('reason', 'hudMicro', 'var(--hc-text-secondary)'),
    ready: fillCell(makeModalButton('READY', 'var(--hc-amber)', () => toggleReady(m))),
    wantReady: null,
    actions,
    view: null,
    host: null,
    guest: null,
    handedOff: false,
    tick: null,
    detachKeys: bindModalKeys(leave),
  };
  buttons.cells[0].appendChild(m.ready);
  buttons.cells[1].appendChild(fillCell(makeModalButton('LEAVE', 'var(--hc-denied)', leave)));
  const heading = makeFixedLine('heading', 'label', 'var(--hc-phosphor)');
  heading.textContent = 'LOBBY';
  return { m, parts: [heading, m.notice, m.code, options.root, m.aboard, grid, m.countdown, buttons.row, m.reason] };
}

/**
 * Open the modal with nothing known yet (the first view follows at once).
 * Replaces any open lobby modal — never two.
 */
export function showLobbyModal(actions: LobbyActions): void {
  hideLobbyModal();
  const { overlay, panel } = makeModalShell(LOBBY_MODAL_ID);
  fixPanel(panel);
  const leave = (): void => {
    hideLobbyModal();
    actions.onLeave();
  };
  const { m, parts } = mountParts(overlay, actions, leave);
  for (const el of [m.notice, m.countdown, m.reason]) paintSlot(el, '');
  m.slots.forEach((s) => paintSlotEls(s, undefined));
  panel.append(...parts);
  document.body.appendChild(overlay);
  mounted = m;
}

/** Fold one `LobbyView` into the open modal; a no-op when none is open. */
export function updateLobbyModal(v: LobbyView): void {
  const m = mounted;
  if (m === null) return;
  noteHandOff(m, v);
  m.view = v;
  syncRole(m, isHost(v));
  paintSlot(m.notice, m.handedOff ? 'YOU ARE HOST' : '');
  m.code.textContent = codeLine(v.code);
  paintRoster(m, v);
  if (m.host !== null) paintHost(m, m.host, v);
  if (m.guest !== null) paintGuest(m, m.guest, v);
  if (m.wantReady === myReady(v)) m.wantReady = null; // the lobby caught up
  paintReady(m);
  paintCountdown(m);
  retick(m);
}

/** Close. Idempotent; the one teardown path (LEAVE, ESC, the seat, a failure). */
export function hideLobbyModal(): void {
  const m = mounted;
  mounted = null;
  if (m !== null) {
    if (m.tick !== null) clearInterval(m.tick);
    m.host?.cancelSeed();
    m.detachKeys();
    m.overlay.remove();
  }
  document.getElementById(LOBBY_MODAL_ID)?.remove();
}
