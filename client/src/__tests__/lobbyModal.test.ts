// THE LOBBY MODAL (cycle 167, Eric rulings 2026-10-02; re-laid out the same
// day on Eric's staging ruling: "two columns of 10 slots … the modal changes
// size … options CLEARLY LABELED … Bot fill needs to be a yes/no selection …
// Start Now triggers the countdown"). Pinned: ONE fixed geometry in every
// state, exactly CAP slots filled left to right then top to bottom, the ready
// circle's color, label + control for the host and label + status for everyone
// else, the bot-fill pair with exactly one lit, START NOW disabled while any
// countdown runs, the hand-off notice (ruling 6), ESC = LEAVE, the z rung and
// backdrop. The WORDING is Eric's and is not pinned (Story 9.14, ruling R3):
// every control is found by its data-lobby role or its cell, never its label.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LobbyCaptain, LobbyView } from '../net/lobby.js';
import { CONFIG } from '@salvo/shared';
import { LAYOUT } from '../ui/lobbyLayout.js';
import { LOBBY_SEED_DEBOUNCE_MS } from '../config.js';
import {
  aboardLine,
  codeLine,
  hideLobbyModal,
  lobbyCountdownLine,
  lobbyModalVisible,
  showLobbyModal,
  startEligible,
  startEnabled,
  updateLobbyModal,
  type LobbyActions,
} from '../ui/lobbyModal.js';

const NOW = 1_000_000;
/** The arena cap — the slot count (ruling 4; 16 since Story 9.8, Eric
 *  2026-10-13 — was 20). Every count below is read off it, never typed. */
const CAP = CONFIG.map.playerCap;
/** Two columns, so the slots fill CAP / 2 rows of 20 px inside the ruled box. */
const ROWS = Math.ceil(CAP / 2);

function view(over: Partial<LobbyView> = {}): LobbyView {
  return {
    code: 'QWERTY',
    hostId: 'me',
    mySessionId: 'me',
    seedText: '',
    botFill: false,
    countdownEndT: 0,
    deadlineAt: null,
    forced: false,
    players: [{ id: 'me', name: 'NEMO', ready: false, slot: 0 }],
    phase: 'open',
    ...over,
  };
}

function captains(n: number): LobbyCaptain[] {
  return Array.from({ length: n }, (_, i) => ({ id: i === 0 ? 'me' : `c${i}`, name: `CAPT${i + 1}`, ready: i % 2 === 0, slot: i }));
}

function actions(): LobbyActions & Record<string, ReturnType<typeof vi.fn>> {
  return { onReady: vi.fn(), onSeed: vi.fn(), onBotFill: vi.fn(), onStart: vi.fn(), onLeave: vi.fn() };
}

function overlay(): HTMLElement {
  return document.getElementById('lobby-modal') as HTMLElement;
}

function role(r: string): HTMLElement[] {
  return [...overlay().querySelectorAll<HTMLElement>(`[data-lobby="${r}"]`)];
}

/** A line's VISIBLE text: a reserved-but-empty slot (nbsp, hidden) reads ''. */
function shown(el: Element | null | undefined): string {
  if (!(el instanceof HTMLElement) || el.style.visibility === 'hidden') return '';
  return (el.textContent ?? '').trim();
}

const line = (r: string): string => shown(role(r)[0]);

/** The button row's three cells: [READY toggle, LEAVE, START NOW (host only)]. */
function cellButton(i: number): HTMLButtonElement | undefined {
  return (role('cell')[i]?.querySelector('button') ?? undefined) as HTMLButtonElement | undefined;
}
const readyBtn = (): HTMLButtonElement => cellButton(0) as HTMLButtonElement;
const leaveBtn = (): HTMLButtonElement => cellButton(1) as HTMLButtonElement;
const startBtn = (): HTMLButtonElement | undefined => cellButton(2);

/** The host's bot-fill pair, [on, off], inside the second option row. */
function chips(): HTMLButtonElement[] {
  return [...role('option')[1].querySelectorAll<HTMLButtonElement>('[data-lobby="option-value"] button')];
}
const yesChip = (): HTMLButtonElement => chips()[0];
const noChip = (): HTMLButtonElement => chips()[1];

function seedInput(): HTMLInputElement | null {
  return overlay().querySelector('input');
}

const GEOMETRY_ROLES = [
  'panel',
  'heading',
  'notice',
  'code',
  'options',
  'option',
  'option-label',
  'option-value',
  'aboard',
  'grid',
  'slot',
  'dot',
  'name',
  'countdown',
  'buttons',
  'cell',
  'reason',
];

/** Every sized region's explicit width × height, in DOM order. */
function geometry(): string {
  return GEOMETRY_ROLES.map((r) => `${r}=${role(r).map((e) => `${e.style.width}x${e.style.height}`).join(',')}`).join('|');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  hideLobbyModal();
  vi.useRealTimers();
});

describe('pure lines and rules', () => {
  it('the code line carries the code, the aboard line n/CAP, the countdown m:ss or nothing', () => {
    expect(codeLine('KXQMAB')).toContain('KXQMAB');
    expect(aboardLine(1)).toContain(`1/${CAP}`);
    expect(aboardLine(CAP)).toContain(`${CAP}/${CAP}`);
    expect(lobbyCountdownLine(NOW + 9_000, NOW).endsWith('0:09')).toBe(true);
    expect(lobbyCountdownLine(NOW + 10_000, NOW).endsWith('0:10')).toBe(true);
    expect(lobbyCountdownLine(NOW - 50, NOW).endsWith('0:00')).toBe(true);
    expect(lobbyCountdownLine(null, NOW)).toBe('');
  });

  it('a start is eligible with two captains, or with bot-fill on (ruling 2)', () => {
    expect(startEligible(view())).toBe(false);
    expect(startEligible(view({ botFill: true }))).toBe(true);
    expect(startEligible(view({ players: captains(2) }))).toBe(true);
  });
});

describe('what each role sees', () => {
  it("the HOST's view, alone and unready: the seed field, the bot-fill pair, START NOW and the blocked reason", () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(seedInput()).not.toBeNull();
    expect(chips()).toHaveLength(2);
    expect(startBtn()).toBeDefined();
    expect(line('reason')).not.toBe('');
    expect(line('notice')).toBe('');
    expect(line('countdown')).toBe('');
    expect(line('code')).toBe(codeLine('QWERTY'));
    expect(line('aboard')).toBe(aboardLine(1));
    expect(role('slot')[0].textContent).toBe('NEMO');
  });

  it("a NON-HOST's view, mid-countdown, with a seed set: the seed as status, the clock, no host controls", () => {
    showLobbyModal(actions());
    updateLobbyModal(
      view({
        hostId: 'h',
        mySessionId: 'me',
        seedText: 'bananas',
        countdownEndT: 5,
        deadlineAt: NOW + 9_000,
        players: [
          { id: 'h', name: 'AHAB', ready: true, slot: 0 },
          { id: 'me', name: 'NEMO', ready: true, slot: 1 },
        ],
      }),
    );
    expect(seedInput()).toBeNull();
    expect(chips()).toHaveLength(0);
    expect(startBtn()).toBeUndefined();
    expect(shown(role('option-value')[0].firstElementChild)).toBe('bananas');
    expect(line('countdown')).toBe(lobbyCountdownLine(NOW + 9_000, NOW));
    expect(line('aboard')).toBe(aboardLine(2));
    expect(role('slot').slice(0, 2).map((s) => s.textContent)).toEqual(['AHAB', 'NEMO']);
    expect(line('reason')).toBe('');
  });

  it("a NON-HOST sees bot-fill's status follow the lobby, and a blank seed as nothing", () => {
    showLobbyModal(actions());
    const guest = (botFill: boolean): LobbyView =>
      view({ hostId: 'h', botFill, players: [{ id: 'h', name: 'AHAB', ready: false, slot: 0 }, { ...captains(1)[0], slot: 1 }] });
    updateLobbyModal(guest(true));
    const on = shown(role('option-value')[1].firstElementChild);
    expect(shown(role('option-value')[0].firstElementChild)).toBe('');
    updateLobbyModal(guest(false));
    const off = shown(role('option-value')[1].firstElementChild);
    expect(on).not.toBe('');
    expect(off).not.toBe('');
    expect(on).not.toBe(off);
  });

  it('no title tooltips or other hidden words ride the modal', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(overlay().querySelectorAll('[title]').length).toBe(0);
  });
});

describe('fixed geometry (Eric: "the modal changes size … poor attention to detail")', () => {
  // RULED (Eric R1, amendments 235–242): a fixed 600 × 598 panel and a 544 × 236
  // grid box, whatever the arena cap — at 16 captains (Story 9.8) the eight
  // slot rows sit top-aligned inside the box and the panel does not move.
  it('the panel is 600 × 598 px (Eric R1: fits a 768-tall laptop) and the grid box 544 × 236 px', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const panel = role('panel')[0];
    expect(panel.style.width).toBe('600px');
    expect(parseInt(panel.style.height, 10)).toBeLessThanOrEqual(620);
    expect(LAYOUT.panelH).toBe(598);
    expect(panel.style.height).toBe(`${LAYOUT.panelH}px`);
    expect(role('grid')[0].style.width).toBe('544px');
    expect(role('grid')[0].style.height).toBe('236px');
    expect(role('grid')[0].style.alignContent).toBe('start');
    expect(LAYOUT.slotRowsH, 'the slot rows fit the ruled box').toBeLessThanOrEqual(LAYOUT.gridH);
  });

  // R1 + review: the shared shell's max-width/max-height:100% and overflow-y:auto
  // could clamp the fixed panel and scroll it. They are overridden.
  it('the panel can never be clamped by the shell or scrolled', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const panel = role('panel')[0];
    expect(panel.style.maxHeight).toBe('none');
    expect(panel.style.maxWidth).toBe('none');
    expect(panel.style.overflow).toBe('hidden');
    expect(panel.style.overflowY).toBe('hidden');
  });

  it('every reserved region + the gaps + the padding sum to exactly the panel height', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const panel = role('panel')[0];
    const kids = [...panel.children] as HTMLElement[];
    const regions = kids.reduce((sum, el) => sum + parseInt(el.style.height, 10), 0);
    const total = regions + (kids.length - 1) * parseInt(panel.style.gap, 10) + 2 * LAYOUT.padV;
    expect(panel.style.padding).toBe(`${LAYOUT.padV}px ${LAYOUT.padH}px`);
    expect(total).toBe(LAYOUT.panelH);
    expect(panel.style.height).toBe(`${LAYOUT.panelH}px`);
    // The same sum from the exported budget alone.
    const budget =
      LAYOUT.lineH.heading +
      LAYOUT.lineH.notice +
      LAYOUT.lineH.code +
      LAYOUT.optionsH +
      LAYOUT.lineH.aboard +
      LAYOUT.gridH +
      LAYOUT.lineH.countdown +
      LAYOUT.buttonH +
      LAYOUT.lineH.reason;
    expect(budget + 8 * LAYOUT.gap + 2 * LAYOUT.padV).toBe(LAYOUT.panelH);
  });

  it('every sized region is identical across roster size, role, bot-fill, countdown and seed length', () => {
    showLobbyModal(actions());
    const states: LobbyView[] = [
      view(),
      view({ players: captains(2) }),
      view({ players: captains(CAP) }),
      view({ hostId: 'c1', players: captains(2) }),
      view({ hostId: 'c1', players: captains(CAP), botFill: true }),
      view({ botFill: true }),
      view({ countdownEndT: 5, deadlineAt: NOW + 10_000, forced: true, botFill: true }),
      view({ hostId: 'c1', players: captains(3), countdownEndT: 5, deadlineAt: NOW + 10_000 }),
      view({ seedText: 'x'.repeat(32) }),
      view({ hostId: 'c1', players: captains(2), seedText: 'W'.repeat(32) }),
    ];
    updateLobbyModal(states[0]);
    const first = geometry();
    expect(first).toContain(`panel=600pxx${LAYOUT.panelH}px`);
    for (const v of states) {
      updateLobbyModal(v);
      expect(geometry()).toBe(first);
    }
  });

  it('nothing that sizes the layout is ever display:none', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'c1', players: captains(2) }));
    for (const r of GEOMETRY_ROLES) {
      expect(role(r).length).toBeGreaterThan(0);
      for (const el of role(r)) expect(el.style.display).not.toBe('none');
    }
  });

  it('a long seed is clipped with an ellipsis inside its fixed box', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'c1', players: captains(2), seedText: 'W'.repeat(32) }));
    const value = role('option-value')[0].firstElementChild as HTMLElement;
    expect(value.style.textOverflow).toBe('ellipsis');
    expect(value.style.overflow).toBe('hidden');
    expect(value.style.whiteSpace).toBe('nowrap');
  });
});

describe('the slot grid', () => {
  it('always holds exactly CAP slots, in two columns', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(role('slot').length).toBe(CAP);
    updateLobbyModal(view({ players: captains(CAP) }));
    expect(role('slot').length).toBe(CAP);
    updateLobbyModal(view({ hostId: 'c1', players: captains(2) }));
    expect(role('slot').length).toBe(CAP);
    const grid = role('grid')[0];
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 260px)');
    expect(grid.style.gridTemplateRows).toBe(`repeat(${ROWS}, 20px)`);
    expect(grid.style.rowGap).toBe('4px');
  });

  it('slot i is row floor(i/2)+1, column i%2+1 (left to right, top to bottom)', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ players: captains(3) }));
    const slots = role('slot');
    const at = (i: number): string => `${slots[i].style.gridRow}/${slots[i].style.gridColumn}:${slots[i].textContent}`;
    expect(at(0)).toBe('1/1:CAPT1');
    expect(at(1)).toBe('1/2:CAPT2');
    expect(at(2)).toBe('2/1:CAPT3');
    expect(at(3)).toBe('2/2:');
    expect(at(CAP - 1)).toBe(`${ROWS}/2:`);
  });

  // Eric R2: "Leave the slot empty; next joiner fills the first empty slot —
  // names never move once seated." The slot is the server's, not array order.
  it("places each captain by the server's slot; the others stay empty", () => {
    showLobbyModal(actions());
    updateLobbyModal(
      view({
        players: [
          { id: 'me', name: 'NEMO', ready: true, slot: 0 },
          { id: 'b', name: 'AHAB', ready: false, slot: 2 },
          { id: 'c', name: 'ISHMAEL', ready: true, slot: 5 },
        ],
      }),
    );
    const slots = role('slot');
    const at = (i: number): string => `${slots[i].style.gridRow}/${slots[i].style.gridColumn}:${slots[i].textContent}`;
    expect(at(0)).toBe('1/1:NEMO');
    expect(at(2)).toBe('2/1:AHAB');
    expect(at(5)).toBe('3/2:ISHMAEL');
    const filled = slots.map((s, i) => (s.textContent === '' ? -1 : i)).filter((i) => i >= 0);
    expect(filled).toEqual([0, 2, 5]);
    expect(role('dot').filter((d) => d.dataset.state === 'empty').length).toBe(CAP - 3);
    expect(line('aboard')).toBe(aboardLine(3));
  });

  it('a vacated slot renders empty — nobody below it moves up', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ players: captains(3) }));
    updateLobbyModal(view({ players: [captains(3)[0], captains(3)[2]] })); // slot 1 left
    const slots = role('slot');
    expect(slots[0].textContent).toBe('CAPT1');
    expect(slots[1].textContent).toBe('');
    expect(role('dot')[1].dataset.state).toBe('empty');
    expect(slots[2].textContent).toBe('CAPT3');
  });

  it('the circle is phosphor green when ready, denied red otherwise, a hairline ring when empty', () => {
    showLobbyModal(actions());
    updateLobbyModal(
      view({
        players: [
          { id: 'me', name: 'NEMO', ready: true, slot: 0 },
          { id: 'b', name: 'AHAB', ready: false, slot: 1 },
        ],
      }),
    );
    const dots = role('dot');
    expect(dots.length).toBe(CAP);
    expect(dots[0].dataset.state).toBe('ready');
    expect(dots[0].style.backgroundColor).toBe('var(--hc-phosphor)');
    expect(dots[1].dataset.state).toBe('unready');
    expect(dots[1].style.backgroundColor).toBe('var(--hc-denied)');
    expect(dots[2].dataset.state).toBe('empty');
    expect(dots[2].style.backgroundColor).toBe('transparent');
    expect(dots[2].style.borderColor).toBe('var(--hc-hairline)');
    expect(dots[0].style.width).toBe('10px');
    expect(dots[0].style.borderRadius).toBe('50%');
    updateLobbyModal(view({ players: [{ id: 'me', name: 'NEMO', ready: false, slot: 0 }] }));
    expect(role('dot')[0].dataset.state).toBe('unready');
  });

  it('a long callsign is clipped with an ellipsis in its fixed box', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const name = role('name')[0];
    expect(name.style.width).toBe('240px');
    expect(name.style.textOverflow).toBe('ellipsis');
    expect(name.style.overflow).toBe('hidden');
  });
});

describe('the options block', () => {
  it('sits under the code and above the roster: label then control for the host', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const panelKids = [...role('panel')[0].children].map((e) => (e as HTMLElement).dataset.lobby);
    expect(panelKids.indexOf('options')).toBe(panelKids.indexOf('code') + 1);
    expect(panelKids.indexOf('aboard')).toBe(panelKids.indexOf('options') + 1);
    const [seedRow, botRow] = role('option');
    for (const r of [seedRow, botRow]) {
      expect([...r.children].map((c) => (c as HTMLElement).dataset.lobby)).toEqual(['option-label', 'option-value']);
      expect(shown(r.querySelector('[data-lobby="option-label"]'))).not.toBe('');
    }
    expect(seedRow.querySelector('[data-lobby="option-value"] input')).not.toBeNull();
    expect(botRow.querySelectorAll('[data-lobby="option-value"] button')).toHaveLength(2);
  });

  it('label then status for a non-host — no input, no buttons', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'h', seedText: 'bananas', botFill: true, players: [{ id: 'h', name: 'AHAB', ready: false, slot: 0 }, { ...captains(1)[0], slot: 1 }] }));
    const [seedRow, botRow] = role('option');
    for (const r of [seedRow, botRow]) expect(shown(r.querySelector('[data-lobby="option-label"]'))).not.toBe('');
    expect(seedRow.querySelector('[data-lobby="option-value"]')?.textContent).toBe('bananas');
    expect(seedRow.querySelector('input')).toBeNull();
    expect(shown(botRow.querySelector('[data-lobby="option-value"]'))).not.toBe('');
    expect(botRow.querySelector('button')).toBeNull();
  });

  it('bot-fill is an on | off pair with exactly one lit, and each sends its own value', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const lit = (): string[] =>
      (['on', 'off'] as const).filter((w) => (w === 'on' ? yesChip() : noChip()).getAttribute('aria-pressed') === 'true');
    expect(lit()).toEqual(['off']);
    expect(noChip().style.borderColor).toBe('var(--hc-phosphor)');
    expect(yesChip().style.borderColor).toBe('var(--hc-hairline)');
    yesChip().click();
    expect(a.onBotFill).toHaveBeenLastCalledWith(true);
    expect(lit()).toEqual(['on']);
    updateLobbyModal(view({ botFill: true }));
    expect(lit()).toEqual(['on']);
    yesChip().click(); // already on — nothing to send
    expect(a.onBotFill).toHaveBeenCalledTimes(1);
    noChip().click();
    expect(a.onBotFill).toHaveBeenLastCalledWith(false);
    expect(lit()).toEqual(['off']);
  });
});

describe('host controls', () => {
  it('exist ONLY for the host — a non-host has no bot-fill pair, START NOW or seed input', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'h', players: [{ id: 'h', name: 'AHAB', ready: false, slot: 0 }, { id: 'me', name: 'NEMO', ready: false, slot: 1 }] }));
    expect(chips()).toHaveLength(0);
    expect(startBtn()).toBeUndefined();
    expect(seedInput()).toBeNull();
    expect(line('reason')).toBe('');
  });

  it('START NOW is disabled with the reason, then enabled by bot-fill or a second captain', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    expect(startBtn()?.disabled).toBe(true);
    expect(line('reason')).not.toBe('');
    startBtn()?.click();
    expect(a.onStart).not.toHaveBeenCalled();
    updateLobbyModal(view({ botFill: true }));
    expect(startBtn()?.disabled).toBe(false);
    expect(line('reason')).toBe('');
    startBtn()?.click();
    expect(a.onStart).toHaveBeenCalledTimes(1);
    updateLobbyModal(view({ players: captains(2) }));
    expect(startBtn()?.disabled).toBe(false);
  });

  // Eric R3: "START NOW locks it … START NOW stays lit during an all-ready
  // countdown and goes dim once forced."
  it('startEnabled: lit with no countdown, lit during an all-ready countdown, dim once forced', () => {
    const two = captains(2);
    expect(startEnabled(view({ players: two }))).toBe(true);
    expect(startEnabled(view({ players: two, countdownEndT: 6, deadlineAt: NOW + 10_000 }))).toBe(true);
    expect(startEnabled(view({ players: two, countdownEndT: 6, deadlineAt: NOW + 10_000, forced: true }))).toBe(false);
    expect(startEnabled(view())).toBe(false); // ineligible
  });

  it('START NOW stays lit during an all-ready countdown and goes dim once forced', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view({ players: captains(2), countdownEndT: 6, deadlineAt: NOW + 10_000 }));
    expect(startBtn()?.disabled).toBe(false);
    startBtn()?.click();
    expect(a.onStart).toHaveBeenCalledTimes(1);
    updateLobbyModal(view({ botFill: true, countdownEndT: 6, deadlineAt: NOW + 10_000, forced: true }));
    expect(startBtn()?.disabled).toBe(true);
    startBtn()?.click();
    expect(a.onStart).toHaveBeenCalledTimes(1);
    expect(line('reason')).toBe(''); // dim because forced, not because blocked
    updateLobbyModal(view({ players: captains(2) }));
    expect(startBtn()?.disabled).toBe(false);
  });

  // Review (low): the reason line and START NOW followed the server's botFill,
  // so turning bot-fill on left the blocked reason up until the patch landed.
  it('a bot-fill-on click clears the reason line and lights START NOW before the patch lands', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(line('reason')).not.toBe('');
    yesChip().click();
    expect(line('reason')).toBe('');
    expect(startBtn()?.disabled).toBe(false);
    updateLobbyModal(view()); // a stale patch (botFill still false) keeps the intent
    expect(line('reason')).toBe('');
    expect(startBtn()?.disabled).toBe(false);
  });

  it('the seed is sent on Enter and on blur, trimmed, and only when changed', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const input = seedInput() as HTMLInputElement;
    input.focus();
    input.value = '  bananas ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(a.onSeed).toHaveBeenLastCalledWith('bananas');
    updateLobbyModal(view({ seedText: 'bananas' }));
    input.blur();
    expect(a.onSeed).toHaveBeenCalledTimes(1); // unchanged — nothing re-sent
    input.focus();
    input.value = '';
    input.blur();
    expect(a.onSeed).toHaveBeenLastCalledWith(''); // cleared = no seed
  });

  it('the seed input is capped at CONFIG.lobby.seedTextMax', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect((seedInput() as HTMLInputElement).maxLength).toBe(CONFIG.lobby.seedTextMax);
  });

  it('a state push never clobbers what the host is typing', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const input = seedInput() as HTMLInputElement;
    input.focus();
    input.value = 'half-typ';
    updateLobbyModal(view({ seedText: 'old' }));
    expect(input.value).toBe('half-typ');
  });
});

// Review (Opus): between the lobby forming and the seat landing the server
// clears the countdown and sets phase 'started'; the modal must not look live.
describe("phase 'started' (formed, waiting for the seat)", () => {
  it('disables START NOW, READY and the bot-fill pair, and the countdown line keeps its last text', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view({ players: captains(2), countdownEndT: 6, deadlineAt: NOW + 10_000 }));
    vi.advanceTimersByTime(9_600);
    const last = lobbyCountdownLine(NOW + 10_000, NOW + 9_600);
    expect(line('countdown')).toBe(last);
    updateLobbyModal(view({ players: captains(2), countdownEndT: 0, deadlineAt: null, phase: 'started' }));
    expect(startBtn()?.disabled).toBe(true);
    expect(readyBtn().disabled).toBe(true);
    expect(yesChip().disabled).toBe(true);
    expect(noChip().disabled).toBe(true);
    expect(leaveBtn().disabled).toBe(false);
    expect(line('countdown')).toBe(last);
    vi.advanceTimersByTime(2_000);
    expect(line('countdown')).toBe(last);
    startBtn()?.click();
    readyBtn().click();
    yesChip().click();
    expect(a.onStart).not.toHaveBeenCalled();
    expect(a.onReady).not.toHaveBeenCalled();
    expect(a.onBotFill).not.toHaveBeenCalled();
  });
});

describe('READY / UNREADY', () => {
  it('the ready toggle relabels once the player is ready, and sends the flip', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const idle = readyBtn().textContent;
    readyBtn().click();
    expect(a.onReady).toHaveBeenLastCalledWith(true);
    updateLobbyModal(view({ players: [{ id: 'me', name: 'NEMO', ready: true, slot: 0 }] }));
    expect(readyBtn().textContent).not.toBe(idle);
    readyBtn().click();
    expect(a.onReady).toHaveBeenLastCalledWith(false);
  });
});

// REVIEW C4: two clicks before the server's patch lands must flip twice. The
// modal keeps a local intended value per control until the view catches up.
describe('rapid double clicks', () => {
  it('the ready toggle twice before the patch sends true then false, and the label follows the intent', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const idle = readyBtn().textContent;
    readyBtn().click();
    expect(readyBtn().textContent).not.toBe(idle);
    readyBtn().click();
    expect(vi.mocked(a.onReady).mock.calls).toEqual([[true], [false]]);
    expect(readyBtn().textContent).toBe(idle);
  });

  it('a stale patch does not flip the label back; the matching one drops the intent', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const idle = readyBtn().textContent;
    readyBtn().click();
    readyBtn().click(); // intent: not ready
    updateLobbyModal(view({ players: [{ id: 'me', name: 'NEMO', ready: true, slot: 0 }] })); // the first send's echo
    expect(readyBtn().textContent).toBe(idle);
    updateLobbyModal(view()); // the second send's echo — the view now matches
    updateLobbyModal(view({ players: [{ id: 'me', name: 'NEMO', ready: true, slot: 0 }] })); // ready set elsewhere
    expect(readyBtn().textContent).not.toBe(idle); // the view rules again
  });

  it('bot-fill on then off before the patch sends true then false, and the lit chip follows the intent', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    yesChip().click();
    expect(yesChip().getAttribute('aria-pressed')).toBe('true');
    noChip().click();
    expect(vi.mocked(a.onBotFill).mock.calls).toEqual([[true], [false]]);
    expect(noChip().getAttribute('aria-pressed')).toBe('true');
    updateLobbyModal(view({ botFill: true })); // the first send's echo — stale
    expect(noChip().getAttribute('aria-pressed')).toBe('true');
  });
});

// REVIEW C7: text typed during a countdown without Enter/blur must still reach
// the lobby before it forms.
describe('seed debounce', () => {
  it('typing sends once after the debounce, without Enter or blur', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const input = seedInput() as HTMLInputElement;
    input.focus();
    input.value = 'ban';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(LOBBY_SEED_DEBOUNCE_MS - 1);
    input.value = 'bananas';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(LOBBY_SEED_DEBOUNCE_MS - 1);
    expect(a.onSeed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(vi.mocked(a.onSeed).mock.calls).toEqual([['bananas']]);
    input.blur(); // already sent — blur adds nothing
    expect(a.onSeed).toHaveBeenCalledTimes(1);
  });

  it('closing the modal cancels a pending send', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const input = seedInput() as HTMLInputElement;
    input.value = 'bananas';
    input.dispatchEvent(new Event('input'));
    hideLobbyModal();
    vi.advanceTimersByTime(LOBBY_SEED_DEBOUNCE_MS * 2);
    expect(a.onSeed).not.toHaveBeenCalled();
  });
});

describe('the countdown line', () => {
  it('appears only while a deadline stands, ticks, and goes when it is cleared', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(line('countdown')).toBe('');
    updateLobbyModal(view({ countdownEndT: 5, deadlineAt: NOW + 10_000 }));
    expect(line('countdown')).toBe(lobbyCountdownLine(NOW + 10_000, NOW));
    vi.advanceTimersByTime(4_000);
    expect(line('countdown')).toBe(lobbyCountdownLine(NOW + 10_000, NOW + 4_000));
    updateLobbyModal(view({ countdownEndT: 0, deadlineAt: null }));
    expect(line('countdown')).toBe('');
  });

  it('closing clears the tick', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');
    showLobbyModal(actions());
    updateLobbyModal(view({ countdownEndT: 5, deadlineAt: NOW + 10_000 }));
    hideLobbyModal();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});

describe('the hand-off notice (ruling 6)', () => {
  const two = [
    { id: 'h', name: 'AHAB', ready: false, slot: 0 },
    { id: 'me', name: 'NEMO', ready: false, slot: 1 },
  ];

  it('never shows for the creator, who was host from the start', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    updateLobbyModal(view({ players: two.slice(1) }));
    expect(line('notice')).toBe('');
  });

  it('shows on a hand-off under the heading, with the host controls revealed', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'h', players: two }));
    expect(line('notice')).toBe('');
    updateLobbyModal(view({ hostId: 'me', players: two.slice(1) }));
    expect(line('notice')).not.toBe('');
    const panelKids = [...role('panel')[0].children].map((el) => (el as HTMLElement).dataset.lobby);
    expect(panelKids.indexOf('notice')).toBe(panelKids.indexOf('heading') + 1);
    expect(seedInput()).not.toBeNull();
    expect(chips()).toHaveLength(2);
    expect(startBtn()).toBeDefined();
  });
});

describe('lifecycle', () => {
  it("sits at the queue modal's z rung with a click-blocking backdrop, in the modal register", () => {
    showLobbyModal(actions());
    expect(overlay().style.zIndex).toBe('1150');
    expect(overlay().style.position).toBe('fixed');
    expect(overlay().style.inset).toBe('0px');
    const panel = overlay().firstElementChild as HTMLElement;
    expect(panel.style.borderRadius).toBe('12px');
    expect(panel.style.borderColor).toBe('var(--hc-hairline)');
    expect(leaveBtn().style.borderRadius).toBe('8px');
  });

  it('LEAVE closes the modal, then leaves', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    leaveBtn().click();
    expect(a.onLeave).toHaveBeenCalledTimes(1);
    expect(lobbyModalVisible()).toBe(false);
  });

  it('ESC is LEAVE, and the home never sees the key', () => {
    const a = actions();
    const homeEsc = vi.fn();
    window.addEventListener('keydown', homeEsc);
    showLobbyModal(a);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.removeEventListener('keydown', homeEsc);
    expect(a.onLeave).toHaveBeenCalledTimes(1);
    expect(lobbyModalVisible()).toBe(false);
    expect(homeEsc).not.toHaveBeenCalled();
  });

  it('a view after close resurrects nothing; a second open replaces the first', () => {
    showLobbyModal(actions());
    hideLobbyModal();
    updateLobbyModal(view());
    expect(overlay()).toBeNull();
    showLobbyModal(actions());
    showLobbyModal(actions());
    expect(document.querySelectorAll('#lobby-modal').length).toBe(1);
  });

  it('clicking the code line copies the code', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    showLobbyModal(actions());
    updateLobbyModal(view());
    role('code')[0].click();
    expect(writeText).toHaveBeenCalledWith('QWERTY');
  });
});
