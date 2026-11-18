// THE LEDGER WRITER (Story 12.1) — the AccountWriter that keeps finished
// matches. AR33's shape: an in-process FIFO, one record at a time, retry once,
// then count it as failed and move on.
//
// THE LEDGER NEVER TAKES THE GAME DOWN:
//   - `recordMatch` queues and resolves AT ONCE. It never awaits the store and
//     never rejects, so the room's fire-and-forget hand-over cannot see a
//     database at all.
//   - The store opens asynchronously; records arriving first wait in the queue.
//     If it never opens, the writer turns itself OFF, drops what it held, logs
//     `ledger.disabled` exactly once, and from then on drops silently.
//   - The queue is bounded: over the cap a record is dropped and counted as
//     failed, logged once per overflow burst.
//   - `flush()` (Colyseus's graceful shutdown) drains with a time bound, so a
//     redeploy keeps the matches in flight without ever hanging the exit.
//
// Logs follow log.ts's PII rule: the match id and counts, never a callsign, a
// row value or a connection string; error text goes through describeError and
// then has any postgres URL blanked.

import type { AccountWriter } from '../game/accountWriter.js';
import type { MatchRecord } from '../game/matchRecord.js';
import { describeError, logInfo, logWarn } from '../log.js';
import { recordLedgerWriteFailed, recordLedgerWriteOk, setLedgerQueueDepth } from '../metrics.js';
import { recordToRows, rowCount, type LedgerRows } from './rows.js';
import { disabledReason, redactUrls, type LedgerStore } from './storeTypes.js';

/** Records the queue holds before a new one is dropped (operational, not
 *  gameplay: a stalled store must not grow the heap without bound). */
export const LEDGER_QUEUE_CAP = 500;
/** How long shutdown waits for the queue to drain before giving up on it. */
export const LEDGER_FLUSH_TIMEOUT_MS = 10_000;

export interface LedgerWriterOptions {
  queueCap?: number;
  flushTimeoutMs?: number;
}

type WriterState = 'opening' | 'ready' | 'disabled' | 'closed';

/** Resolves true if `work` settled within `ms`, false on timeout. */
async function within(work: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work.then(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class LedgerWriter implements AccountWriter {
  private state: WriterState = 'opening';
  private store: LedgerStore | null = null;
  private readonly queue: MatchRecord[] = [];
  private draining: Promise<void> | null = null;
  private overflowing = false;
  private readonly ready: Promise<void>;
  private readonly queueCap: number;
  private readonly flushTimeoutMs: number;

  constructor(store: Promise<LedgerStore>, opts: LedgerWriterOptions = {}) {
    this.queueCap = opts.queueCap ?? LEDGER_QUEUE_CAP;
    this.flushTimeoutMs = opts.flushTimeoutMs ?? LEDGER_FLUSH_TIMEOUT_MS;
    this.ready = store.then(
      (s) => this.onReady(s),
      (err: unknown) => this.disable(err),
    );
  }

  recordMatch(record: MatchRecord): Promise<void> {
    if (this.state === 'disabled' || this.state === 'closed') return Promise.resolve();
    if (this.queue.length >= this.queueCap) {
      this.overflow();
      return Promise.resolve();
    }
    this.queue.push(record);
    setLedgerQueueDepth(this.queue.length);
    this.kick();
    return Promise.resolve();
  }

  /** Drain the queue, bounded by the flush timeout; never rejects. */
  async flush(): Promise<void> {
    const drained = await within(this.idle(), this.flushTimeoutMs);
    if (!drained) logWarn('ledger.flush.timeout', { left: this.queue.length });
    else if (this.state === 'ready') logInfo('ledger.flushed', {});
  }

  /** Release the store. Anything recorded after this is dropped. */
  async close(): Promise<void> {
    const store = this.store;
    this.state = 'closed';
    this.store = null;
    if (store) await store.close();
  }

  private onReady(store: LedgerStore): void {
    if (this.state === 'closed') {
      // Shut down before the store finished opening: release it unused.
      void store.close().catch(() => {});
      return;
    }
    this.store = store;
    this.state = 'ready';
    logInfo('ledger.ready', {});
    this.kick();
  }

  private disable(err: unknown): void {
    if (this.state === 'closed') return;
    this.state = 'disabled';
    this.queue.length = 0;
    setLedgerQueueDepth(0);
    logWarn('ledger.disabled', { reason: disabledReason(err) });
  }

  private overflow(): void {
    recordLedgerWriteFailed();
    if (this.overflowing) return;
    this.overflowing = true;
    logWarn('ledger.queue.overflow', { cap: this.queueCap });
  }

  /** Start the drain loop if the store is up and none is running. */
  private kick(): void {
    if (this.state !== 'ready' || this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
      if (this.queue.length > 0) this.kick();
    });
  }

  /** Resolves once the store has opened (or failed to) and the queue is empty. */
  private async idle(): Promise<void> {
    await this.ready;
    this.kick();
    while (this.draining) await this.draining;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && this.store) {
      await this.writeOne(this.store, this.queue[0]);
      this.queue.shift();
      setLedgerQueueDepth(this.queue.length);
      if (this.queue.length < this.queueCap) this.overflowing = false;
    }
  }

  private async writeOne(store: LedgerStore, record: MatchRecord): Promise<void> {
    const matchId = record.matchId;
    try {
      const rows = recordToRows(record);
      await attemptTwice(store, rows);
      recordLedgerWriteOk();
      logInfo('ledger.write.ok', { matchId, rows: rowCount(rows) });
    } catch (err) {
      recordLedgerWriteFailed();
      logWarn('ledger.write.failed', { matchId, err: redactUrls(String(describeError(err).error)) });
    }
  }
}

/** Retry once. Safe because every insert is ON CONFLICT DO NOTHING. */
async function attemptTwice(store: LedgerStore, rows: LedgerRows): Promise<void> {
  try {
    await store.write(rows);
  } catch {
    await store.write(rows);
  }
}
