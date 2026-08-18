// THE SINGLE-SESSION LOCK (Eric ruling 2026-08-17) — one match per browser at a
// time. *"Honestly I just don't want people to be able to play from multiple
// tabs or windows on the same computer. I have been leaving that enabled for
// testing purposes, but with Solo vs AI and more playtesters, that is less
// relevant."*
//
// IT IS PLAYTESTER HYGIENE, NOT ANTI-CHEAT, and the mechanism is chosen to say
// so: everything here is CLIENT-SIDE. No server identity, no IP tracking, no
// rate limiting — those were considered and set aside. A determined user still
// has a second browser, a private window, a second profile, and devtools; what
// this stops is the ordinary accident of a second tab, which is what was
// actually happening.
//
// THE MECHANISM is the Web Locks API (`navigator.locks.request` with
// `{mode:'exclusive', ifAvailable:true}`). It is the right tool for exactly one
// reason: the lock is released AUTOMATICALLY when the tab closes, navigates away
// or crashes. There is no stale lock to reap and no heartbeat timeout to tune,
// which is the failure mode every hand-rolled version of this has.
//
// THE FALLBACK, for a browser without `navigator.locks` (feature-detected — never
// assumed), is a localStorage heartbeat: one key holding `{id, ts}`, refreshed
// every SESSION_HEARTBEAT_MS and treated as free once `ts` is SESSION_STALE_MS
// old, so a crashed tab frees the port in ~3s rather than forever. It uses the
// same fail-open try/catch idiom the other `hullcracker.*` keys already use
// (ui/home.ts loadSavedName/saveName, net/connection.ts loadColorPref).
//
// FAIL OPEN, ALWAYS. If the machinery throws, is unavailable, or is ambiguous,
// THE PLAYER PLAYS. This feature is never allowed to be the reason someone
// cannot start a game — a hygiene measure that can deny a match is worse than
// the thing it prevents. Every failure path below lands on NOOP_HANDLE, which
// reports "you hold it" and releases to nothing.
//
// WHEN IT IS TAKEN: at DEPLOY, not at page load (a second tab merely sitting on
// the home screen is harmless). It is held for the whole session — including
// across Story 6.3's in-place auto-requeue, which re-enters `startGame` with the
// lock still held; the module-level `held` singleton is what makes that a no-op
// rather than a tab refusing itself. It is released at return to port, at a
// disconnect, at a failed/cancelled connect, and — free of charge on the Web
// Locks path — at tab close.

import type { StatusLine, StatusTone } from '../ui/home.js';

/** The one well-known lock name. Also the fallback's localStorage key, so the
 *  two backends can never disagree about what is being claimed. */
export const SESSION_LOCK_NAME = 'hullcracker.session';

/** ms — how often the fallback holder re-stamps its heartbeat. */
export const SESSION_HEARTBEAT_MS = 1000;

/** ms — how old a fallback heartbeat may be before the lock reads as FREE. A
 *  small multiple of the interval: tight enough that a crashed tab frees up in
 *  about three seconds, loose enough that a throttled background timer (browsers
 *  clamp intervals in hidden tabs) does not evict a live holder on the first
 *  missed beat. */
export const SESSION_STALE_MS = 3 * SESSION_HEARTBEAT_MS;

/**
 * ms — how long an acquire may take before the lock gives up and FAILS OPEN.
 *
 * Both backends answer in microseconds when they work at all (a Web Locks grant
 * is same-process; the fallback is one synchronous storage read), so this can
 * only fire against machinery that is broken in a way nothing here can inspect.
 * That is precisely the "ambiguous" case the fail-open rule names: a hung
 * acquire would leave a player staring at a live SOLO button that does nothing,
 * which is the one outcome this feature is never allowed to cause.
 */
export const SESSION_ACQUIRE_TIMEOUT_MS = 1500;

/** A held lock. `release()` is idempotent and never throws. */
export interface SessionLockHandle {
  release(): void;
}

/** The one thing this needs from the home screen — its status line. Narrowed to
 *  a single method so nothing in `app/` depends on the home's DOM. */
export interface StatusSink {
  setStatus(text: string, tone?: StatusTone): void;
}

/** The fail-open handle: claims to hold the lock, releases to nothing. */
const NOOP_HANDLE: SessionLockHandle = { release: () => undefined };

/**
 * The refusal, in the house register (uppercase, mono, terse, nautical) and in
 * the two-part `<STATE> — <REMEDY>` grammar every other denied line uses
 * (`VERSION MISMATCH — PLEASE REFRESH THE PAGE`, `QUEUE CLOSED — PLEASE TRY
 * AGAIN`). It goes out through the home's EXISTING status line: no alert, no
 * dead button, no silent no-op, and the tab stays fully usable — press SOLO
 * again once the other tab finishes and it deploys, with no reload.
 */
export function sessionBusyStatusLine(): StatusLine {
  return { text: 'ALREADY AT SEA IN ANOTHER TAB — CLOSE IT TO DEPLOY', tone: 'denied' };
}

// --- the lock this tab holds -------------------------------------------------

/** The handle this tab holds, or null. Module-level BY DESIGN: the lock belongs
 *  to the tab, not to any one deploy, so a second acquire inside the same page
 *  (the auto-requeue) must resolve to the SAME handle rather than ask the
 *  backend a question it would answer "taken — by you". */
let held: SessionLockHandle | null = null;

/** An acquire already in flight, so two overlapping deploys cannot each open a
 *  backend request (the second of which our own tab would refuse). */
let pending: Promise<SessionLockHandle | null> | null = null;

function hold(handle: SessionLockHandle): SessionLockHandle {
  held = handle;
  bindUnloadRelease();
  return handle;
}

/**
 * RELEASE THE PORT WHEN THIS PAGE GOES AWAY (Story 6.7).
 *
 * The Web Locks backend gets this free from the browser; the localStorage
 * fallback did NOT, and that is a defect a refresh-resume walks straight into —
 * a reloading tab would find its own ≤1s-old heartbeat still in the key and
 * refuse ITSELF with `ALREADY AT SEA IN ANOTHER TAB`, at its own ghost. Calling
 * it here on BOTH backends closes the reload window rather than merely
 * surviving it.
 *
 * `persisted` is checked because a bfcache'd page can come BACK: releasing a
 * lock we would then still be holding is the one direction this must not go.
 * (A live WebSocket disqualifies bfcache in practice, so this is belt-and-
 * braces — and fail-open is the module's standing doctrine either way.)
 *
 * Registered once, on the first hold, so a tab that never deploys attaches
 * nothing.
 */
let unloadBound = false;
function bindUnloadRelease(): void {
  if (unloadBound || typeof window === 'undefined') return;
  unloadBound = true;
  window.addEventListener('pagehide', (ev: PageTransitionEvent) => {
    if (!ev.persisted) releaseSessionLock();
  });
}

/**
 * Take the single-session lock for this tab.
 *
 * Resolves to a handle when the lock is ours (including every fail-open case),
 * or NULL when another tab is already at sea. Never throws.
 */
export function acquireSessionLock(): Promise<SessionLockHandle | null> {
  if (held) return Promise.resolve(held);
  if (!pending) {
    pending = acquireOnce();
    void pending.finally(() => {
      pending = null;
    });
  }
  return pending;
}

async function acquireOnce(): Promise<SessionLockHandle | null> {
  // DEV ESCAPE — `?multi=1`, the `?direct=1` precedent (net/connection.ts)
  // exactly: `import.meta.env.DEV` is substituted with `false` before Rollup
  // runs, so this branch (and the reader behind it) is not merely ignored in
  // production, it is not shipped. Eric multi-tabs deliberately when testing.
  if (import.meta.env.DEV && multiSessionRequested()) return hold(NOOP_HANDLE);
  try {
    const acquired = await raceTimeout(acquireBackend(), SESSION_ACQUIRE_TIMEOUT_MS);
    if (acquired === TIMED_OUT) {
      console.warn('[session] single-session lock did not answer in time; deploying anyway');
      return hold(NOOP_HANDLE); // FAIL OPEN — an ambiguous answer is a yes
    }
    return acquired ? hold(acquired) : null;
  } catch (err) {
    // FAIL OPEN. Whatever just went wrong, it must not cost anyone a match.
    console.warn('[session] single-session lock unavailable; deploying anyway', err);
    return hold(NOOP_HANDLE);
  }
}

/** The "nobody answered" outcome — a third result, distinct from both a grant
 *  and a refusal, so a hang can never be mistaken for either. */
const TIMED_OUT = Symbol('session-lock-timeout');

/** Await `work`, or the sentinel if it has not settled within `ms`. The timer is
 *  always cleared, so the fast path leaves nothing pending behind it. */
async function raceTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Web Locks when the browser has them, the heartbeat when it does not. */
async function acquireBackend(): Promise<SessionLockHandle | null> {
  const locks = lockManager();
  return locks === null ? acquireStorageLock() : await acquireWebLock(locks);
}

/**
 * Release the lock this tab holds (idempotent, never throws).
 *
 * On the Web Locks path the browser would do this for us at tab close; calling
 * it explicitly is what makes the OTHER exits — return to port, a disconnect, a
 * failed connect — free the port immediately instead of at page teardown, and it
 * is REQUIRED on the fallback path, where a lingering key would hold the port
 * for SESSION_STALE_MS.
 */
export function releaseSessionLock(): void {
  const handle = held;
  held = null;
  try {
    handle?.release();
  } catch (err) {
    console.warn('[session] releasing the single-session lock failed', err);
  }
}

/**
 * Claim the lock for a deploy, painting the refusal on the home's status line
 * when another tab has it. Returns true when the deploy may proceed — which
 * includes every fail-open case.
 */
export async function claimSessionForDeploy(home: StatusSink): Promise<boolean> {
  if (await acquireSessionLock()) return true;
  const line = sessionBusyStatusLine();
  home.setStatus(line.text, line.tone);
  return false;
}

/** Test-only: drop this tab's lock and any in-flight acquire, so one test's
 *  singleton cannot leak into the next (net/connection.ts's
 *  `__resetSessionColorPrefForTests` precedent). */
export function __resetSessionLockForTests(): void {
  releaseSessionLock();
  pending = null;
}

/**
 * Test-only: adopt this tab's identity NOW, from whatever sessionStorage is
 * visible at this instant, and return it.
 *
 * It exists because `vi.resetModules()` — the suite's model of "a second tab" —
 * gives each module instance its own module state but leaves them sharing the
 * page's ONE sessionStorage, which real tabs do not. Left to lazy minting, two
 * simulated tabs would read the same key and resolve to the SAME id, and the
 * "a genuine second tab is still refused" guarantee would silently stop being
 * tested. The suite calls this at tab-open time, having first cleared (a new
 * tab) or preserved (the same tab reloading) `SESSION_TAB_KEY`.
 */
export function __adoptTabIdForTests(): string {
  tabId = null;
  return holderId();
}

// --- `?multi=1`, the dev escape ----------------------------------------------

/** `?multi=1` in the URL. Read defensively: a hostile or absent `location` must
 *  never be the reason a deploy throws. */
function multiSessionRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('multi') === '1';
  } catch {
    return false; // no window/location (tests, SSR) — never bypass
  }
}

// --- backend 1: the Web Locks API --------------------------------------------

/** The slice of `LockManager` this module uses. Declared locally rather than
 *  leaning on lib.dom's `navigator.locks`, which is not present in every
 *  TS lib target and is exactly the thing being feature-detected. */
interface LockManagerLike {
  request(
    name: string,
    options: { mode: 'exclusive'; ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

/** The live `navigator.locks`, or null when this browser has none. THE feature
 *  detection — `request` is probed as a function, so a stub object cannot pass. */
function lockManager(): LockManagerLike | null {
  const nav = globalThis.navigator as { locks?: LockManagerLike } | undefined;
  const locks = nav?.locks;
  return typeof locks?.request === 'function' ? locks : null;
}

/**
 * Acquire through the Web Locks API.
 *
 * The shape is dictated by the API: `request()`'s promise does not settle until
 * the CALLBACK's promise does, so holding the lock means never resolving the
 * callback — while the answer to "did we get it?" has to escape immediately.
 * Hence the deferred outer promise: the callback resolves it with a handle whose
 * `release()` is the callback promise's own resolver, and the lock lives exactly
 * as long as the session does.
 *
 * `ifAvailable: true` is what makes this a TEST rather than a queue: a lock
 * another tab holds yields `null` at once instead of parking us until they
 * finish, so the refusal is instant and the button stays honest.
 */
function acquireWebLock(locks: LockManagerLike): Promise<SessionLockHandle | null> {
  return new Promise<SessionLockHandle | null>((resolve, reject) => {
    let settled = false;
    const answer = (value: SessionLockHandle | null): void => {
      settled = true;
      resolve(value);
    };
    const granted = (): Promise<void> =>
      new Promise<void>((releaseHold) => answer({ release: () => releaseHold() }));
    void Promise.resolve(
      locks.request(SESSION_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) =>
        lock ? granted() : answer(null),
      ),
    ).catch((err: unknown) => {
      // Only a failure BEFORE the grant is ours to report; once the handle is
      // out, a late rejection has nothing left to tell anyone. A rejection here
      // reaches acquireOnce's catch and fails OPEN.
      if (!settled) reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

// --- backend 2: the localStorage heartbeat -----------------------------------

interface Heartbeat {
  id: string;
  ts: number;
}

/** sessionStorage key holding THIS TAB's identity (Story 6.7) — see holderId. */
export const SESSION_TAB_KEY = 'hullcracker.tab';

/** In-memory fallback for the tab id when sessionStorage cannot persist it, so
 *  two acquires inside one page still agree about who they are. */
let tabId: string | null = null;

/**
 * THIS TAB's holder id — random, and only ever compared for equality (nothing is
 * authenticated here; it exists so a release cannot delete another tab's claim,
 * and so a stale key can be told apart from our own).
 *
 * IT LIVES IN `sessionStorage`, which is what makes a REFRESH work (Story 6.7).
 * sessionStorage survives a reload and is scoped per tab, so the reloaded page
 * recognises the heartbeat its own predecessor left behind and takes the port
 * over instead of refusing itself — while a genuine SECOND TAB, which gets a
 * fresh sessionStorage and therefore a different id, is still refused exactly as
 * before. (The resume token uses the same store for the same reason: refresh
 * yes, second tab no.)
 */
function holderId(): string {
  if (tabId !== null) return tabId;
  try {
    const stored = sessionStorage.getItem(SESSION_TAB_KEY);
    if (stored !== null && stored !== '') {
      tabId = stored;
      return stored;
    }
  } catch {
    // blocked/private-mode storage — fall through to a session-lifetime id
  }
  const minted = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  tabId = minted;
  try {
    sessionStorage.setItem(SESSION_TAB_KEY, minted);
  } catch {
    // not persisted: a refresh will mint a new id and fall back to the stale
    // timeout, which is the pre-6.7 behaviour rather than a new failure
  }
  return minted;
}

/** The stored heartbeat, or null when the key is absent, malformed or a shape
 *  we do not recognise — all of which read as FREE (fail open). */
function readHeartbeat(): Heartbeat | null {
  const raw = localStorage.getItem(SESSION_LOCK_NAME);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Heartbeat> | null;
    const id = parsed?.id;
    const ts = parsed?.ts;
    return typeof id === 'string' && typeof ts === 'number' && Number.isFinite(ts) ? { id, ts } : null;
  } catch {
    return null;
  }
}

function writeHeartbeat(beat: Heartbeat): void {
  localStorage.setItem(SESSION_LOCK_NAME, JSON.stringify(beat));
}

/**
 * Acquire through the localStorage heartbeat.
 *
 * A throw anywhere here (blocked/private-mode storage, quota) propagates to
 * acquireOnce's catch and fails OPEN — which is why the read is deliberately NOT
 * wrapped: an unreadable store must mean "play", not "refused".
 *
 * KNOWN AND ACCEPTED: two tabs pressing SOLO within the same millisecond can
 * both read a free key and both write. There is no compare-and-swap in
 * localStorage, and inventing one (a random back-off re-read) would buy a
 * vanishing case at the cost of a delay on every honest deploy. This is the
 * fallback for a browser without Web Locks, and it is hygiene either way.
 */
function acquireStorageLock(): SessionLockHandle | null {
  const id = holderId();
  const existing = readHeartbeat();
  // A live claim refuses us — UNLESS it is OUR OWN, left in the key by this same
  // tab before a reload (Story 6.7). Without this clause a refresh-resume
  // deterministically refuses itself at its own ghost, since the heartbeat it is
  // reading is at most SESSION_HEARTBEAT_MS old. A second TAB has a different
  // sessionStorage and therefore a different id, so it is still refused.
  if (existing !== null && existing.id !== id && Date.now() - existing.ts < SESSION_STALE_MS) return null;
  writeHeartbeat({ id, ts: Date.now() });
  const timer = setInterval(() => beat(id), SESSION_HEARTBEAT_MS);
  return { release: () => releaseStorageLock(timer, id) };
}

/** Re-stamp our claim. Best-effort: a storage failure mid-session must not
 *  throw out of a timer callback — the claim simply goes stale and another tab
 *  may take the port, which is the fail-open direction. */
function beat(id: string): void {
  try {
    if (readHeartbeat()?.id === id) writeHeartbeat({ id, ts: Date.now() });
  } catch {
    // storage went away mid-session; the claim ages out on its own
  }
}

/** Stop beating and drop the key — but ONLY if it is still ours, so a release
 *  arriving after another tab has legitimately taken a stale port cannot delete
 *  their live claim. */
function releaseStorageLock(timer: ReturnType<typeof setInterval>, id: string): void {
  clearInterval(timer);
  try {
    if (readHeartbeat()?.id === id) localStorage.removeItem(SESSION_LOCK_NAME);
  } catch {
    // storage unavailable — the claim ages out after SESSION_STALE_MS
  }
}
