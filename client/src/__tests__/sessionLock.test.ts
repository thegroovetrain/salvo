// THE SINGLE-SESSION LOCK (app/sessionLock.ts, Eric ruling 2026-08-17) — one
// match per browser at a time.
//
// TWO TABS ARE SIMULATED WITH `vi.resetModules()` + a fresh dynamic import. The
// lock's state is module-level (it belongs to the tab, not to a deploy), so a
// second module instance IS a second tab: it shares the page's `navigator.locks`
// and `localStorage` — exactly what two real tabs share — and nothing else. A
// test that reused one instance would only ever prove the same-tab shortcut.
//
// BOTH BACKENDS ARE EXERCISED DELIBERATELY, and that is the point of the
// `hasWebLocks` assertions dotted through the suite: jsdom ships NO
// `navigator.locks`, so a suite that merely "ran" would silently test the
// fallback twice and leave the primary path unproven. Every Web Locks test
// installs a manager that models the real `ifAvailable` semantics and asserts it
// was the path taken; every fallback test asserts the manager is genuinely
// ABSENT.
//
// THE HARD RULE THIS SUITE EXISTS FOR: FAIL OPEN. If the machinery throws, is
// unavailable, or is ambiguous, the player plays. Three independent breakages
// (a throwing request, a rejecting request, throwing storage) each pin it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type SessionLockModule = typeof import('../app/sessionLock.js');

/**
 * A fresh module instance = a fresh TAB.
 *
 * `vi.resetModules()` models only the MODULE state a tab owns privately; the two
 * instances still share the page's one `sessionStorage`, which real tabs do not.
 * Since Story 6.7 the fallback backend tells "my own predecessor" from "another
 * tab" by an id kept in exactly that store, so the harness has to model it: a
 * NEW tab starts with the key cleared, and adopts its identity immediately (a
 * lazy mint later would read whatever the other instance had written and the two
 * would resolve to one id — silently retiring the second-tab guarantee).
 */
async function openTab(): Promise<SessionLockModule> {
  vi.resetModules();
  const mod = await import('../app/sessionLock.js');
  sessionStorage.removeItem(mod.SESSION_TAB_KEY); // a new tab's store is empty
  mod.__adoptTabIdForTests();
  return mod;
}

/**
 * THE SAME TAB, RELOADED — the refresh-resume case (Story 6.7). Identical to
 * `openTab` except the tab-identity key is left in place, which is precisely what
 * a real refresh preserves: sessionStorage survives a reload of the same tab and
 * is invisible to every other one.
 */
async function reloadTab(): Promise<SessionLockModule> {
  vi.resetModules();
  const mod = await import('../app/sessionLock.js');
  mod.__adoptTabIdForTests(); // reads the id its predecessor left behind
  return mod;
}

// --- a Web Locks manager that models the real semantics ----------------------

interface FakeLocks {
  manager: unknown;
  /** Every request that reached the manager: the proof of which path ran. */
  calls: Array<{ name: string; options: unknown }>;
  /** Names currently held by some tab. */
  holders: Set<string>;
}

function fakeLocks(): FakeLocks {
  const holders = new Set<string>();
  const calls: Array<{ name: string; options: unknown }> = [];
  const manager = {
    request: async (
      name: string,
      options: unknown,
      callback: (lock: unknown) => Promise<void> | void,
    ): Promise<unknown> => {
      calls.push({ name, options });
      // `ifAvailable: true` — a held lock yields a null grant IMMEDIATELY rather
      // than queueing the requester behind the holder.
      if (holders.has(name)) return await callback(null);
      holders.add(name);
      try {
        // The grant callback returns a promise that settles only on release,
        // so this `await` models the lock being HELD.
        return await callback({ name });
      } finally {
        holders.delete(name);
      }
    },
  };
  return { manager, calls, holders };
}

function installLocks(locks: FakeLocks): void {
  Object.defineProperty(globalThis.navigator, 'locks', {
    value: locks.manager,
    configurable: true,
    writable: true,
  });
}

/** Install a `navigator.locks` whose `request` blows up in the caller's face. */
function installBrokenLocks(request: () => unknown): void {
  Object.defineProperty(globalThis.navigator, 'locks', {
    value: { request },
    configurable: true,
    writable: true,
  });
}

function removeLocks(): void {
  Reflect.deleteProperty(globalThis.navigator, 'locks');
}

/** True when the feature detection would pick the Web Locks backend. */
function hasWebLocks(): boolean {
  const nav = globalThis.navigator as { locks?: { request?: unknown } };
  return typeof nav.locks?.request === 'function';
}

/** The tabs a test opened, so nothing leaks a held lock or a live interval. */
const tabs: SessionLockModule[] = [];

async function tab(): Promise<SessionLockModule> {
  const t = await openTab();
  tabs.push(t);
  return t;
}

beforeEach(() => {
  removeLocks();
  localStorage.clear();
  sessionStorage.clear();
  tabs.length = 0;
});

afterEach(() => {
  for (const t of tabs) t.__resetSessionLockForTests();
  tabs.length = 0;
  removeLocks();
  localStorage.clear();
  vi.useRealTimers();
});

// --- backend 1: the Web Locks API --------------------------------------------

describe('the Web Locks path (the primary)', () => {
  it('takes an exclusive, non-queueing lock on the one well-known name', async () => {
    const locks = fakeLocks();
    installLocks(locks);
    expect(hasWebLocks()).toBe(true); // the primary path, not the fallback
    const a = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
    expect(locks.calls).toHaveLength(1);
    expect(locks.calls[0]).toEqual({
      name: a.SESSION_LOCK_NAME,
      // `ifAvailable` is what makes this a TEST rather than a queue: without it
      // the second tab would PARK until the first finished, and its refusal
      // would arrive minutes late instead of instantly.
      options: { mode: 'exclusive', ifAvailable: true },
    });
    expect(locks.holders.has(a.SESSION_LOCK_NAME)).toBe(true);
    // ...and it writes NOTHING to storage on this path.
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).toBeNull();
  });

  it('refuses a second tab while the first holds it', async () => {
    installLocks(fakeLocks());
    const a = await tab();
    const b = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
    expect(await b.acquireSessionLock()).toBeNull();
  });

  it('frees the port on release, so the second tab can then deploy', async () => {
    installLocks(fakeLocks());
    const a = await tab();
    const b = await tab();
    await a.acquireSessionLock();
    expect(await b.acquireSessionLock()).toBeNull();
    a.releaseSessionLock();
    await Promise.resolve(); // the fake's `finally` frees on a microtask
    expect(await b.acquireSessionLock()).not.toBeNull();
  });

  it('re-acquiring in the SAME tab is a no-op, not a self-refusal', async () => {
    // This is the auto-requeue (Story 6.3): the shell goes back to port and
    // deploys again WITHOUT a page reload, so startGame re-enters with the lock
    // still held. Without the module singleton the tab would refuse itself.
    const locks = fakeLocks();
    installLocks(locks);
    const a = await tab();
    const first = await a.acquireSessionLock();
    const second = await a.acquireSessionLock();
    expect(second).toBe(first);
    expect(locks.calls).toHaveLength(1); // the backend was asked exactly once
  });

  it('two overlapping acquires in one tab open exactly one request', async () => {
    const locks = fakeLocks();
    installLocks(locks);
    const a = await tab();
    const [x, y] = await Promise.all([a.acquireSessionLock(), a.acquireSessionLock()]);
    expect(x).not.toBeNull();
    expect(y).toBe(x);
    expect(locks.calls).toHaveLength(1);
  });

  it('release is idempotent and survives being called twice', async () => {
    installLocks(fakeLocks());
    const a = await tab();
    await a.acquireSessionLock();
    a.releaseSessionLock();
    expect(() => a.releaseSessionLock()).not.toThrow();
  });
});

// --- backend 2: the localStorage heartbeat -----------------------------------

describe('the localStorage fallback (no navigator.locks)', () => {
  it('claims the port with a heartbeat when the API is absent', async () => {
    expect(hasWebLocks()).toBe(false); // the fallback path, genuinely
    const a = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
    const raw = localStorage.getItem(a.SESSION_LOCK_NAME);
    expect(raw).not.toBeNull();
    const beat = JSON.parse(raw ?? '{}') as { id?: unknown; ts?: unknown };
    expect(typeof beat.id).toBe('string');
    expect(typeof beat.ts).toBe('number');
  });

  it('refuses a second tab while the heartbeat is fresh', async () => {
    const a = await tab();
    const b = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
    expect(await b.acquireSessionLock()).toBeNull();
  });

  it('release drops the key, so the second tab can then deploy', async () => {
    const a = await tab();
    const b = await tab();
    await a.acquireSessionLock();
    a.releaseSessionLock();
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).toBeNull();
    expect(await b.acquireSessionLock()).not.toBeNull();
  });

  it('treats a stale heartbeat as free — a crashed tab never holds the port', async () => {
    const a = await tab();
    localStorage.setItem(
      a.SESSION_LOCK_NAME,
      JSON.stringify({ id: 'a-tab-that-died', ts: Date.now() - a.SESSION_STALE_MS - 1 }),
    );
    expect(await a.acquireSessionLock()).not.toBeNull();
  });

  it('a live holder re-stamps its heartbeat so it never ages out under itself', async () => {
    vi.useFakeTimers();
    const a = await tab();
    await a.acquireSessionLock();
    const first = JSON.parse(localStorage.getItem(a.SESSION_LOCK_NAME) ?? '{}') as { ts: number };
    await vi.advanceTimersByTimeAsync(a.SESSION_HEARTBEAT_MS * 2);
    const later = JSON.parse(localStorage.getItem(a.SESSION_LOCK_NAME) ?? '{}') as { ts: number };
    expect(later.ts).toBeGreaterThan(first.ts);
    // ...and the beat stops at release, rather than resurrecting the key.
    a.releaseSessionLock();
    await vi.advanceTimersByTimeAsync(a.SESSION_HEARTBEAT_MS * 3);
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).toBeNull();
  });

  it('a release arriving late never deletes another tab’s live claim', async () => {
    const a = await tab();
    await a.acquireSessionLock();
    // Tab B legitimately took over (say, after A appeared stale). A's late
    // release must leave B's key alone.
    localStorage.setItem(a.SESSION_LOCK_NAME, JSON.stringify({ id: 'tab-b', ts: Date.now() }));
    a.releaseSessionLock();
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).not.toBeNull();
  });

  it('a malformed key reads as FREE rather than as a refusal', async () => {
    const a = await tab();
    localStorage.setItem(a.SESSION_LOCK_NAME, 'not json at all');
    expect(await a.acquireSessionLock()).not.toBeNull();
  });
});

// --- Story 6.7: A REFRESH MUST NOT REFUSE ITSELF -----------------------------
//
// Root now means RESUME (there is no match URL — R0), so a mid-match reload
// re-deploys through the same single-session gate. On this backend the reloading
// page finds its own heartbeat still in the key, at most SESSION_HEARTBEAT_MS
// old — well inside SESSION_STALE_MS — so before this story it refused ITSELF
// with `ALREADY AT SEA IN ANOTHER TAB`, at its own ghost, deterministically.

describe('the refresh case (Story 6.7)', () => {
  it('a RELOADED tab recognises its own predecessor and takes the port back', async () => {
    expect(hasWebLocks()).toBe(false); // the fallback backend, genuinely
    const before = await tab();
    await before.acquireSessionLock();
    const beat = localStorage.getItem(before.SESSION_LOCK_NAME);
    expect(beat).not.toBeNull(); // a live, seconds-fresh claim is sitting there

    // The page reloads: module state is gone, localStorage and this tab's OWN
    // sessionStorage both survive. Nothing simulates a release, because the
    // point is that the reload must work even if `pagehide` never fired.
    const after = await reloadTab();
    tabs.push(after);
    expect(await after.acquireSessionLock()).not.toBeNull();
  });

  it('...while a genuine SECOND TAB is still refused at the same instant', async () => {
    // The guarantee the fix must not buy its way out of. Same fresh heartbeat,
    // same moment — the only difference is whose sessionStorage is doing the
    // asking.
    const a = await tab();
    await a.acquireSessionLock();
    const b = await tab(); // a new tab: its own, empty sessionStorage
    expect(await b.acquireSessionLock()).toBeNull();
  });

  it('releases the port on `pagehide`, so the reload window is closed rather than merely survived', async () => {
    const a = await tab();
    await a.acquireSessionLock();
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).not.toBeNull();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).toBeNull();
  });

  it('...but NOT when the page is going into bfcache and may come back', async () => {
    // Releasing a lock we would still be holding is the one direction this must
    // not go. (A live WebSocket disqualifies bfcache in practice, so this is
    // belt-and-braces — and fail open is the doctrine either way.)
    const a = await tab();
    await a.acquireSessionLock();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).not.toBeNull();
  });
});

// --- FAIL OPEN, ALWAYS -------------------------------------------------------

describe('fail open — the hard rule', () => {
  it('a Web Locks request that THROWS still lets the player deploy', async () => {
    installBrokenLocks(() => {
      throw new Error('SecurityError: locks are blocked here');
    });
    expect(hasWebLocks()).toBe(true);
    const a = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
  });

  it('a Web Locks request that REJECTS still lets the player deploy', async () => {
    installBrokenLocks(() => Promise.reject(new Error('NotSupportedError')));
    expect(hasWebLocks()).toBe(true);
    const a = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
  });

  it('a Web Locks request that NEVER ANSWERS still lets the player deploy', async () => {
    // A manager that swallows the callback entirely: the request promise never
    // settles and the grant never arrives. This is the one shape that would
    // strand a player at the port with a live SOLO button that does nothing, so
    // the acquire is bounded and an ambiguous answer counts as a yes.
    vi.useFakeTimers();
    installBrokenLocks(() => new Promise(() => undefined));
    expect(hasWebLocks()).toBe(true);
    const a = await tab();
    const claim = a.acquireSessionLock();
    await vi.advanceTimersByTimeAsync(a.SESSION_ACQUIRE_TIMEOUT_MS + 1);
    expect(await claim).not.toBeNull();
  });

  it('storage that throws on read still lets the player deploy', async () => {
    expect(hasWebLocks()).toBe(false); // the fallback path is the one breaking
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is blocked');
    });
    try {
      const a = await tab();
      expect(await a.acquireSessionLock()).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('storage that throws on write still lets the player deploy', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const a = await tab();
      expect(await a.acquireSessionLock()).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('a fail-open handle releases without throwing', async () => {
    installBrokenLocks(() => {
      throw new Error('nope');
    });
    const a = await tab();
    await a.acquireSessionLock();
    expect(() => a.releaseSessionLock()).not.toThrow();
  });
});

// --- the refusal the player actually sees ------------------------------------

describe('the refusal surfaces through the home status line', () => {
  it('claimSessionForDeploy paints the denied line and returns false', async () => {
    installLocks(fakeLocks());
    const a = await tab();
    const b = await tab();
    await a.acquireSessionLock();
    const painted: Array<{ text: string; tone?: string }> = [];
    const ok = await b.claimSessionForDeploy({
      setStatus: (text, tone) => void painted.push({ text, tone }),
    });
    expect(ok).toBe(false);
    expect(painted).toEqual([
      { text: 'ALREADY AT SEA IN ANOTHER TAB — CLOSE IT TO DEPLOY', tone: 'denied' },
    ]);
  });

  it('a granted claim returns true and paints NOTHING', async () => {
    installLocks(fakeLocks());
    const a = await tab();
    const painted: string[] = [];
    const ok = await a.claimSessionForDeploy({ setStatus: (text) => void painted.push(text) });
    expect(ok).toBe(true);
    expect(painted).toEqual([]);
  });

  it('a refused tab stays usable: the next attempt succeeds once the port frees', async () => {
    // NO PAGE RELOAD in the refusal path — the player presses SOLO again.
    installLocks(fakeLocks());
    const a = await tab();
    const b = await tab();
    await a.acquireSessionLock();
    const sink = { setStatus: () => undefined };
    expect(await b.claimSessionForDeploy(sink)).toBe(false);
    a.releaseSessionLock();
    await Promise.resolve();
    expect(await b.claimSessionForDeploy(sink)).toBe(true);
  });

  it('the copy is in the house register: uppercase, terse, STATE — REMEDY', async () => {
    const a = await tab();
    const line = a.sessionBusyStatusLine();
    expect(line.text).toBe(line.text.toUpperCase());
    expect(line.text).toContain(' — ');
    expect(line.tone).toBe('denied');
    // No longer than the longest shipped status line, so the underplay row's
    // single register does not have to grow to hold it.
    const longestShipped = 'CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?';
    expect(line.text.length).toBeLessThanOrEqual(longestShipped.length);
  });
});

// --- the dev escape ----------------------------------------------------------

describe('?multi=1 — the dev escape (import.meta.env.DEV only)', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('bypasses the lock entirely: no backend is even asked', async () => {
    const locks = fakeLocks();
    installLocks(locks);
    window.history.replaceState({}, '', '/?multi=1');
    const a = await tab();
    const b = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
    expect(await b.acquireSessionLock()).not.toBeNull(); // both tabs sail
    expect(locks.calls).toHaveLength(0);
    expect(localStorage.getItem(a.SESSION_LOCK_NAME)).toBeNull();
  });

  it('any other query string leaves the lock fully armed', async () => {
    installLocks(fakeLocks());
    window.history.replaceState({}, '', '/?multi=0&direct=1');
    const a = await tab();
    const b = await tab();
    expect(await a.acquireSessionLock()).not.toBeNull();
    expect(await b.acquireSessionLock()).toBeNull();
  });
});

// --- taken at DEPLOY, never at load ------------------------------------------

describe('the lock is taken at deploy and not at page load', () => {
  it('importing the module claims nothing', async () => {
    const locks = fakeLocks();
    installLocks(locks);
    await tab();
    expect(locks.calls).toHaveLength(0);
    expect(localStorage.getItem('hullcracker.session')).toBeNull();
  });

  // The foghorn/projectiles suites' precedent for reading main.ts as text.
  const mainSrc = (): string => readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

  /** A top-level function body, by this file's own formatting (closing brace in
   *  column 0). Good enough to say WHICH function a call lives in. */
  function bodyOf(src: string, signature: string): string {
    const start = src.indexOf(signature);
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n}\n', start);
    return src.slice(start, end);
  }

  it('startGame is the only door that claims it', () => {
    const src = mainSrc();
    expect(bodyOf(src, 'async function startGame(')).toContain('claimPortForDeploy(home)');
    expect(bodyOf(src, 'async function claimPortForDeploy(')).toContain('claimSessionForDeploy(home)');
    // The two routes into port must NOT claim: a tab sitting on the home screen
    // is harmless, and claiming there would refuse a second tab that never
    // pressed anything.
    expect(bodyOf(src, 'function enterPort(')).not.toContain('claimSessionForDeploy');
    expect(bodyOf(src, 'async function main(')).not.toContain('claimSessionForDeploy');
  });

  it('every session exit releases it', () => {
    const src = mainSrc();
    // A failed or cancelled connect (the session never started)...
    expect(bodyOf(src, 'async function startGame(')).toContain('releaseSessionLock()');
    // ...return to port...
    expect(bodyOf(src, 'function makeGameReturnToPort(')).toContain('releaseSessionLock()');
    // ...and a disconnect.
    expect(bodyOf(src, 'function handleRoomLeave(')).toContain('releaseSessionLock()');
  });
});
