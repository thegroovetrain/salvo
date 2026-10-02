// THE PRIVATE-LOBBY DOORS (cycle 167) — app/privateLobby.ts between the home,
// the two modals and net/lobby.ts (stubbed here). Pinned: modals never stack
// (the first lobby view REPLACES the join modal); a refusal stays in the join
// modal with the field intact; a non-refusal failure lands on the home status
// line; the seat closes the lobby modal and launches; anything else returns the
// port with the lock released.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LobbyHooks, LobbyView } from '../net/lobby.js';

let capturedHooks: LobbyHooks | null = null;
let settle: ((c: unknown) => void) | null = null;

vi.mock('../net/lobby.js', async (orig) => {
  const real = await orig<typeof import('../net/lobby.js')>();
  const run = (_a: unknown, _b: unknown, hooks: LobbyHooks): Promise<unknown> => {
    capturedHooks = hooks;
    return new Promise((resolve) => {
      settle = resolve;
    });
  };
  return {
    ...real,
    createLobby: (deploy: unknown, hooks: LobbyHooks) => run(deploy, null, hooks),
    joinLobby: (code: unknown, deploy: unknown, hooks: LobbyHooks) => run(code, deploy, hooks),
    leaveLobby: vi.fn(),
  };
});

import { leaveLobby } from '../net/lobby.js';
import { createPrivateLobby, openJoinPrivateLobby, type PrivateLobbyDeps } from '../app/privateLobby.js';
import { hideJoinCodeModal } from '../ui/joinCodeModal.js';
import { hideLobbyModal } from '../ui/lobbyModal.js';
import type { HomeHandle } from '../ui/home.js';

function view(): LobbyView {
  return {
    code: 'QWERTY',
    hostId: 'me',
    mySessionId: 'me',
    seedText: '',
    botFill: false,
    forced: false,
    countdownEndT: 0,
    deadlineAt: null,
    players: [{ id: 'me', name: 'NEMO', ready: false }],
    phase: 'open',
  };
}

function deps(claim = true): PrivateLobbyDeps & { log: string[] } {
  const log: string[] = [];
  const home = {
    setBusy: (b: boolean) => log.push(`busy:${b}`),
    setStatus: (t: string, tone?: string) => log.push(`status:${t}:${tone}`),
  } as unknown as HomeHandle;
  return {
    log,
    home,
    claimPort: () => Promise.resolve(claim),
    serverReady: () => void log.push('serverReady'),
    backToPort: () => void log.push('backToPort'),
    launch: () => void log.push('launch'),
  };
}

const joinModal = (): HTMLElement | null => document.getElementById('join-code-modal');
const lobbyModal = (): HTMLElement | null => document.getElementById('lobby-modal');

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function typeAndJoin(code: string): void {
  const input = joinModal()?.querySelector('input') as HTMLInputElement;
  input.value = code;
  input.dispatchEvent(new Event('input'));
  (joinModal()?.querySelector('button') as HTMLButtonElement).click();
}

beforeEach(() => {
  capturedHooks = null;
  settle = null;
});

afterEach(() => {
  hideJoinCodeModal();
  hideLobbyModal();
});

describe('CREATE', () => {
  it('busies the home, says CONNECTING…, opens the lobby modal on the first view', async () => {
    const d = deps();
    void createPrivateLobby(d, { name: 'NEMO' });
    await flush();
    expect(d.log).toEqual(['busy:true', 'status:CONNECTING…:info']);
    capturedHooks?.onLobby(view());
    expect(lobbyModal()).not.toBeNull();
    expect(d.log).toContain('serverReady');
  });

  it('the seat closes the modal and the welcome launches', async () => {
    const d = deps();
    const done = createPrivateLobby(d, {});
    await flush();
    capturedHooks?.onLobby(view());
    capturedHooks?.onSeat();
    expect(lobbyModal()).toBeNull();
    settle?.({});
    await done;
    expect(d.log.at(-1)).toBe('launch');
  });

  it('a failure lands on the home status line and returns the port', async () => {
    const d = deps();
    const done = createPrivateLobby(d, {});
    await flush();
    capturedHooks?.onError('VERSION MISMATCH — PLEASE REFRESH THE PAGE');
    settle?.(null);
    await done;
    expect(d.log).toContain('status:VERSION MISMATCH — PLEASE REFRESH THE PAGE:denied');
    expect(d.log.at(-1)).toBe('backToPort');
  });

  it('a refused session lock stops before any socket', async () => {
    const d = deps(false);
    await createPrivateLobby(d, {});
    expect(capturedHooks).toBeNull();
  });
});

describe('JOIN', () => {
  it('opens the join modal; JOIN starts the lobby; the first view REPLACES it', async () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    expect(joinModal()).not.toBeNull();
    typeAndJoin('qwerty');
    await flush();
    expect(capturedHooks).not.toBeNull();
    capturedHooks?.onLobby(view());
    expect(joinModal()).toBeNull();
    expect(lobbyModal()).not.toBeNull();
  });

  it('a refusal stays in the join modal, field intact, and the port is returned', async () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    await flush();
    capturedHooks?.onError('LOBBY FULL');
    settle?.(null);
    await flush();
    expect(joinModal()?.textContent).toContain('LOBBY FULL');
    expect((joinModal()?.querySelector('input') as HTMLInputElement).value).toBe('QWERTY');
    // The port is returned, then the doors are held again under the still-open modal.
    expect(d.log.slice(-2)).toEqual(['backToPort', 'busy:true']);
    expect(d.log.some((l) => l.startsWith('status:LOBBY FULL'))).toBe(false);
  });

  it('a non-refusal failure closes the join modal and speaks on the status line', async () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    await flush();
    capturedHooks?.onError('CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?');
    expect(joinModal()).toBeNull();
    expect(d.log).toContain('status:CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?:denied');
  });

  it('LEAVE from the lobby modal returns the port quietly', async () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    await flush();
    capturedHooks?.onLobby(view());
    capturedHooks?.onLeft();
    settle?.(null);
    await flush();
    expect(lobbyModal()).toBeNull();
    expect(d.log.at(-1)).toBe('backToPort');
    expect(d.log.some((l) => l.startsWith('status:'))).toBe(false);
  });
});

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

const lastBusy = (log: string[]): string | undefined => log.filter((l) => l.startsWith('busy:')).at(-1);

// REVIEW C5: ESC while the join is in the air must not let the lobby open
// behind the player's back.
describe('ESC during an in-flight JOIN', () => {
  it('the arriving lobby is left at once and no lobby modal opens', async () => {
    vi.mocked(leaveLobby).mockClear();
    const d = deps();
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    await flush();
    pressEscape();
    expect(joinModal()).toBeNull();
    capturedHooks?.onLobby(view());
    expect(lobbyModal()).toBeNull();
    expect(leaveLobby).toHaveBeenCalledTimes(1);
    expect(d.log).not.toContain('serverReady');
    capturedHooks?.onLeft();
    settle?.(null);
    await flush();
    expect(d.log.at(-1)).toBe('backToPort');
  });

  it('a refusal arriving after ESC says nothing on the status line', async () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    await flush();
    pressEscape();
    capturedHooks?.onError('NO SUCH LOBBY');
    settle?.(null);
    await flush();
    expect(d.log.some((l) => l.startsWith('status:'))).toBe(false);
    expect(d.log.at(-1)).toBe('backToPort');
  });

  it('ESC before the session lock answers never starts the join', async () => {
    const d = deps();
    let grant: (ok: boolean) => void = () => undefined;
    d.claimPort = () => new Promise((r) => (grant = r));
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    pressEscape();
    grant(true);
    await flush();
    expect(capturedHooks).toBeNull();
    expect(d.log.at(-1)).toBe('backToPort');
  });
});

// REVIEW C6: the join modal's backdrop blocks clicks, not Tab + Space — the
// home's doors are held busy for as long as it is up.
describe('the home doors under the join modal', () => {
  it('are busy while the modal is open and live again after ESC', () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    expect(lastBusy(d.log)).toBe('busy:true');
    pressEscape();
    expect(lastBusy(d.log)).toBe('busy:false');
  });

  it('stay busy after a refusal leaves the modal up', async () => {
    const d = deps();
    openJoinPrivateLobby(d, {});
    typeAndJoin('qwerty');
    await flush();
    capturedHooks?.onError('NO SUCH LOBBY');
    settle?.(null);
    await flush();
    expect(joinModal()).not.toBeNull();
    expect(d.log.at(-1)).toBe('busy:true');
    pressEscape();
    expect(lastBusy(d.log)).toBe('busy:false');
  });
});
