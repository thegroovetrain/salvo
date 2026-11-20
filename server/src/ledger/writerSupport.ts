// The ledger writer's helpers (Story 12.1): its operational bounds, the
// deadline wrappers that keep a silent database from holding the writer, the
// open-with-retry loop, and the one form a store error may take in a log line.
// No Drizzle, no driver: like storeTypes.ts, this file pulls in nothing heavy.

import { describeError, logWarn } from '../log.js';
import { disabledReason, redactUrls, StoreOpenError, type LedgerStore } from './storeTypes.js';

/** Records the queue holds before a new one is dropped (operational, not
 *  gameplay: a stalled store must not grow the heap without bound). */
export const LEDGER_QUEUE_CAP = 500;
/** How long shutdown waits for the queue to drain before giving up on it. */
export const LEDGER_FLUSH_TIMEOUT_MS = 10_000;
/** One store open (connect + migrate) is given up on after this long. */
export const LEDGER_OPEN_TIMEOUT_MS = 30_000;
/** Store opens tried before the writer turns itself off. */
export const LEDGER_OPEN_ATTEMPTS = 3;
/** The wait between two store opens. */
export const LEDGER_OPEN_RETRY_DELAY_MS = 10_000;
/** One `store.write` attempt is given up on after this long (a failed attempt). */
export const LEDGER_WRITE_TIMEOUT_MS = 20_000;
/** The longest error text a `ledger.write.failed` line carries. */
export const LEDGER_ERROR_TEXT_MAX = 300;
/** How far down an error's `.cause` chain the log looks for the root. */
const CAUSE_DEPTH_MAX = 8;

export interface LedgerWriterOptions {
  queueCap?: number;
  flushTimeoutMs?: number;
  openTimeoutMs?: number;
  openAttempts?: number;
  openRetryDelayMs?: number;
  writeTimeoutMs?: number;
}

export type LedgerBounds = Required<LedgerWriterOptions>;

export function ledgerBounds(opts: LedgerWriterOptions): LedgerBounds {
  return {
    queueCap: opts.queueCap ?? LEDGER_QUEUE_CAP,
    flushTimeoutMs: opts.flushTimeoutMs ?? LEDGER_FLUSH_TIMEOUT_MS,
    openTimeoutMs: opts.openTimeoutMs ?? LEDGER_OPEN_TIMEOUT_MS,
    openAttempts: opts.openAttempts ?? LEDGER_OPEN_ATTEMPTS,
    openRetryDelayMs: opts.openRetryDelayMs ?? LEDGER_OPEN_RETRY_DELAY_MS,
    writeTimeoutMs: opts.writeTimeoutMs ?? LEDGER_WRITE_TIMEOUT_MS,
  };
}

/** Opens (connects + migrates) a store; called again for each retry. */
export type LedgerOpener = () => Promise<LedgerStore>;

/** An unref'd timer, so a pending deadline never holds the process open. */
function timer(ms: number, fire: () => void): ReturnType<typeof setTimeout> {
  const t = setTimeout(fire, ms);
  t.unref?.();
  return t;
}

/** Resolves true if `work` settled within `ms`, false on timeout. */
export async function within(work: Promise<void>, ms: number): Promise<boolean> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => (t = timer(ms, () => resolve(false))));
  try {
    return await Promise.race([work.then(() => true as const), timeout]);
  } finally {
    clearTimeout(t);
  }
}

/** `work`'s outcome, or a rejection with `onTimeout()` if it takes over `ms`. */
export async function withDeadline<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => (t = timer(ms, () => reject(onTimeout()))));
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => timer(ms, resolve));

/** The deepest Error on `.cause` (bounded): the driver's own message, never
 *  Drizzle's "Failed query: <sql> params: <values>" wrapper above it. */
export function rootCause(err: unknown): unknown {
  let at = err;
  for (let depth = 0; depth < CAUSE_DEPTH_MAX; depth++) {
    const cause: unknown = at instanceof Error ? at.cause : undefined;
    if (!(cause instanceof Error)) break;
    at = cause;
  }
  return at;
}

/** The only form a store error takes in a ledger log line: the root cause's
 *  message, any postgres URL blanked, truncated. */
export function ledgerErrorText(err: unknown): string {
  return redactUrls(String(describeError(rootCause(err)).error)).slice(0, LEDGER_ERROR_TEXT_MAX);
}

/** One bounded open. A store that turns up after its deadline is released. */
async function openOnce(open: LedgerOpener, ms: number): Promise<LedgerStore> {
  const opening = open();
  try {
    return await withDeadline(opening, ms, () => new StoreOpenError('timeout', null));
  } catch (err) {
    opening.then((late) => late.close()).catch(() => {});
    throw err;
  }
}

/** Open the store, up to `openAttempts` tries `openRetryDelayMs` apart, each
 *  bounded by `openTimeoutMs`. `stopped()` ends the loop early (shutdown).
 *  Rejects with the last failure; logs only the reason category. */
export async function openWithRetry(open: LedgerOpener, b: LedgerBounds, stopped: () => boolean): Promise<LedgerStore> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openOnce(open, b.openTimeoutMs);
    } catch (err) {
      if (attempt >= b.openAttempts || stopped()) throw err;
      logWarn('ledger.open.retry', { attempt, reason: disabledReason(err) });
      await sleep(b.openRetryDelayMs);
      if (stopped()) throw err;
    }
  }
}
