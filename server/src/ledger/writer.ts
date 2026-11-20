// THE LEDGER WRITER (Story 12.1) — the AccountWriter that keeps finished
// matches. AR33's shape: an in-process FIFO, one record at a time, retry once,
// then count it as failed and move on.
//
// THE LEDGER NEVER TAKES THE GAME DOWN:
//   - `recordMatch` queues and resolves AT ONCE. It never awaits the store and
//     never rejects, so the room's fire-and-forget hand-over cannot see a
//     database at all.
//   - The store opens asynchronously, each try deadline-bounded and retried
//     (writerSupport.ts); records arriving first wait in the queue. If it never
//     opens, the writer turns itself OFF, drops what it held, logs
//     `ledger.disabled` exactly once, and from then on drops.
//   - Every write attempt is deadline-bounded: a store that never answers is a
//     failed attempt, and the queue moves on.
//   - The queue is bounded: over the cap a record is dropped, logged once per
//     overflow burst (re-armed once the queue is back down to half the cap).
//   - `flush()` (Colyseus's graceful shutdown) drains with a time bound, so a
//     redeploy keeps the matches in flight without ever hanging the exit.
//   - EVERY record accepted but never written — over the cap, cleared by
//     disable, arriving while off or closed, stranded at close — is one
//     `writeFailed`, so /metrics never under-reports a loss.
//
// Logs follow log.ts's PII rule: the match id and counts, never a callsign, a
// row value or a connection string; a store error is logged as its ROOT
// cause's message (never Drizzle's "Failed query … params: …" wrapper), with
// any postgres URL blanked, truncated (writerSupport.ts ledgerErrorText).

import type { AccountWriter } from '../game/accountWriter.js';
import type { MatchRecord } from '../game/matchRecord.js';
import { logInfo, logWarn } from '../log.js';
import { recordLedgerWriteFailed, recordLedgerWriteOk, setLedgerEnabled, setLedgerQueueDepth } from '../metrics.js';
import { recordToRows, rowCount, type LedgerRows } from './rows.js';
import { disabledReason, type LedgerStore } from './storeTypes.js';
import {
  ledgerBounds,
  ledgerErrorText,
  openWithRetry,
  within,
  withDeadline,
  type LedgerBounds,
  type LedgerOpener,
  type LedgerWriterOptions,
} from './writerSupport.js';

type WriterState = 'opening' | 'ready' | 'disabled' | 'closed';

/** Count `n` records the writer accepted and will never write. */
function countLost(n: number): void {
  for (let i = 0; i < n; i++) recordLedgerWriteFailed();
}

export class LedgerWriter implements AccountWriter {
  private state: WriterState = 'opening';
  private store: LedgerStore | null = null;
  /** queue[0] is the record being written while `writing` is true. */
  private readonly queue: MatchRecord[] = [];
  private draining: Promise<void> | null = null;
  private writing = false;
  private overflowing = false;
  private readonly ready: Promise<void>;
  private readonly bounds: LedgerBounds;

  constructor(open: LedgerOpener, opts: LedgerWriterOptions = {}) {
    this.bounds = ledgerBounds(opts);
    this.ready = openWithRetry(open, this.bounds, () => this.state === 'closed').then(
      (s) => this.onReady(s),
      (err: unknown) => this.disable(err),
    );
  }

  recordMatch(record: MatchRecord): Promise<void> {
    if (this.state === 'disabled' || this.state === 'closed') {
      recordLedgerWriteFailed();
      return Promise.resolve();
    }
    if (this.queue.length >= this.bounds.queueCap) {
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
    const drained = await within(this.idle(), this.bounds.flushTimeoutMs);
    if (!drained) logWarn('ledger.flush.timeout', { left: this.queue.length });
    else if (this.state === 'ready') logInfo('ledger.flushed', {});
  }

  /** Release the store. Records still queued (a flush that timed out) are
   *  dropped and counted; anything recorded after this is dropped too. */
  async close(): Promise<void> {
    const store = this.store;
    this.state = 'closed';
    this.store = null;
    setLedgerEnabled(false);
    // The record in flight, if any, still settles as ok or failed on its own.
    const stranded = this.queue.length - (this.writing ? 1 : 0);
    this.queue.length = 0;
    setLedgerQueueDepth(0);
    if (stranded > 0) {
      countLost(stranded);
      logWarn('ledger.write.dropped', { count: stranded });
    }
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
    setLedgerEnabled(true);
    logInfo('ledger.ready', {});
    this.kick();
  }

  private disable(err: unknown): void {
    if (this.state === 'closed') return;
    this.state = 'disabled';
    setLedgerEnabled(false);
    countLost(this.queue.length);
    this.queue.length = 0;
    setLedgerQueueDepth(0);
    logWarn('ledger.disabled', { reason: disabledReason(err) });
  }

  private overflow(): void {
    recordLedgerWriteFailed();
    if (this.overflowing) return;
    this.overflowing = true;
    logWarn('ledger.queue.overflow', { cap: this.bounds.queueCap });
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
      this.writing = true;
      await this.writeOne(this.store, this.queue[0]);
      this.writing = false;
      this.queue.shift();
      setLedgerQueueDepth(this.queue.length);
      // Low-water re-arm: one overflow line per burst, not one per freed slot.
      if (this.queue.length <= this.bounds.queueCap / 2) this.overflowing = false;
    }
  }

  private async writeOne(store: LedgerStore, record: MatchRecord): Promise<void> {
    const matchId = record.matchId;
    try {
      const rows = recordToRows(record);
      await this.attemptTwice(store, rows);
      recordLedgerWriteOk();
      logInfo('ledger.write.ok', { matchId, rows: rowCount(rows) });
    } catch (err) {
      recordLedgerWriteFailed();
      logWarn('ledger.write.failed', { matchId, err: ledgerErrorText(err) });
    }
  }

  /** Retry once, each attempt deadline-bounded. Safe because every insert is
   *  ON CONFLICT DO NOTHING. */
  private async attemptTwice(store: LedgerStore, rows: LedgerRows): Promise<void> {
    try {
      await this.attempt(store, rows);
    } catch {
      await this.attempt(store, rows);
    }
  }

  private attempt(store: LedgerStore, rows: LedgerRows): Promise<void> {
    const ms = this.bounds.writeTimeoutMs;
    return withDeadline(store.write(rows), ms, () => new Error(`ledger write timed out after ${ms} ms`));
  }
}
