// THE MATCH LEDGER WRITER UNDER FAULT (Story 12.1 review) — what the writer
// does when the store misbehaves: the error it logs, the deadlines that keep a
// silent store from holding it, the open retries, the overflow re-arm, and the
// rule that every record accepted but never written is counted.
//
// Fake stores everywhere except the error-text case, which drives a REAL
// failing Drizzle insert on in-memory PGlite (the wrapper Drizzle throws is
// the thing that must never reach the log).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { storeOnPglite } from '../ledger/store.js';
import { LedgerWriter } from '../ledger/writer.js';
import { LEDGER_ERROR_TEXT_MAX, ledgerErrorText } from '../ledger/writerSupport.js';
import { StoreOpenError, type LedgerStore } from '../ledger/storeTypes.js';
import type { LedgerRows } from '../ledger/rows.js';
import { metricsPayload, resetMetrics } from '../metrics.js';
import { fixtureRecord } from './ledgerFixture.js';

vi.setConfig({ testTimeout: 30_000 });

let lines: string[] = [];

beforeEach(() => {
  resetMetrics();
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => void lines.push(String(line)));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const linesFor = (event: string): string[] => lines.filter((l) => l.split(' ')[1] === event);
const fieldsOf = (line: string): Record<string, unknown> => JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};
const never = <T>(): Promise<T> => new Promise<T>(() => {});

/** A store that records the match ids it wrote; `write` may be overridden. */
function fakeStore(write?: (rows: LedgerRows) => Promise<void>): { store: LedgerStore; written: string[] } {
  const written: string[] = [];
  const store: LedgerStore = {
    write: write ?? (async (rows) => void written.push(rows.match.id)),
    close: async () => {},
  };
  return { store, written };
}

/** A store whose writes each wait until released, one at a time, in order. */
function gatedStore(): { store: LedgerStore; written: string[]; release: () => Promise<void> } {
  const written: string[] = [];
  const pending: (() => void)[] = [];
  const store: LedgerStore = {
    write: (rows) => new Promise<void>((resolve) => pending.push(() => (written.push(rows.match.id), resolve()))),
    close: async () => {},
  };
  const release = async (): Promise<void> => {
    pending.shift()?.();
    await settle();
  };
  return { store, written, release };
}

describe('ledger.write.failed logs the root cause, never the query', () => {
  it('a real failing Drizzle insert logs the Postgres message without the SQL, the params or any row value', async () => {
    const client = await PGlite.create();
    const real = await storeOnPglite(client);
    // A NOT NULL violation: Drizzle sends the null, Postgres refuses it.
    const violating: LedgerStore = {
      write: (rows) => real.write({ ...rows, match: { ...rows.match, mode: null as unknown as string } }),
      close: () => real.close(),
    };
    const writer = new LedgerWriter(async () => violating);
    const record = fixtureRecord();
    void writer.recordMatch(record);
    await writer.flush();

    const failed = linesFor('ledger.write.failed');
    expect(failed).toHaveLength(1);
    const err = String(fieldsOf(failed[0]).err);
    expect(err).toContain('null value in column "mode"');
    expect(err).not.toContain('Failed query');
    expect(err).not.toContain('params:');
    const values = [record.matchId, record.gameVersion, record.endedBy, String(record.endedAtEpochMs), String(record.durationS)];
    for (const v of values) expect(err).not.toContain(v);
    await writer.close();
  });

  it('the logged text is the deepest cause, URL-blanked and bounded in length', () => {
    const root = new Error(`refused by postgres://u:pw@h/db ${'x'.repeat(2 * LEDGER_ERROR_TEXT_MAX)}`);
    const wrapper = new Error('Failed query: insert … params: secret-value', { cause: root });
    const text = ledgerErrorText(new Error('outer', { cause: wrapper }));
    expect(text.startsWith('refused by')).toBe(true);
    expect(text).not.toMatch(/postgres:\/\/|pw@|secret-value/);
    expect(text.length).toBeLessThanOrEqual(LEDGER_ERROR_TEXT_MAX);
  });
});

describe('deadlines', () => {
  it('a store open that never resolves times out, and the writer turns off exactly once', async () => {
    const writer = new LedgerWriter(never, { openTimeoutMs: 10, openRetryDelayMs: 1, flushTimeoutMs: 3_000 });
    void writer.recordMatch(fixtureRecord('m-1'));
    await writer.flush();

    expect(linesFor('ledger.flush.timeout')).toHaveLength(0);
    const disabled = linesFor('ledger.disabled');
    expect(disabled).toHaveLength(1);
    expect(fieldsOf(disabled[0])).toEqual({ reason: 'timeout' });
    expect(metricsPayload().ledger).toEqual({ enabled: false, writeOk: 0, writeFailed: 1, queueDepth: 0 });
    await writer.close();
  });

  it('a write that never resolves is a failed attempt: the record is counted failed and the next is written', async () => {
    const { store, written } = fakeStore();
    const realWrite = store.write;
    store.write = (rows) => (rows.match.id === 'm-stuck' ? never() : realWrite(rows));
    const writer = new LedgerWriter(async () => store, { writeTimeoutMs: 10, flushTimeoutMs: 3_000 });
    void writer.recordMatch(fixtureRecord('m-stuck'));
    void writer.recordMatch(fixtureRecord('m-next'));
    await writer.flush();

    expect(linesFor('ledger.flush.timeout')).toHaveLength(0);
    expect(written).toEqual(['m-next']);
    expect(metricsPayload().ledger).toMatchObject({ writeOk: 1, writeFailed: 1, queueDepth: 0 });
    const failed = linesFor('ledger.write.failed');
    expect(failed).toHaveLength(1);
    expect(fieldsOf(failed[0]).matchId).toBe('m-stuck');
    await writer.close();
  });
});

describe('open retry', () => {
  it('an open that fails twice then succeeds is ready and writes what queued meanwhile', async () => {
    const { store, written } = fakeStore();
    let tries = 0;
    const open = async (): Promise<LedgerStore> => {
      if (++tries < 3) throw new StoreOpenError('connect', new Error('refused'));
      return store;
    };
    const writer = new LedgerWriter(open, { openRetryDelayMs: 1 });
    for (const id of ['m-1', 'm-2']) void writer.recordMatch(fixtureRecord(id));
    await writer.flush();

    expect(tries).toBe(3);
    expect(linesFor('ledger.open.retry').map(fieldsOf)).toEqual([
      { attempt: 1, reason: 'connect' },
      { attempt: 2, reason: 'connect' },
    ]);
    expect(linesFor('ledger.disabled')).toHaveLength(0);
    expect(written).toEqual(['m-1', 'm-2']);
    expect(metricsPayload().ledger).toEqual({ enabled: true, writeOk: 2, writeFailed: 0, queueDepth: 0 });
    await writer.close();
  });

  it('an open that fails every attempt logs the retries, then exactly one ledger.disabled', async () => {
    let tries = 0;
    const open = async (): Promise<LedgerStore> => {
      tries++;
      throw new StoreOpenError('migrate', new Error('bad sql'));
    };
    const writer = new LedgerWriter(open, { openRetryDelayMs: 1 });
    await writer.flush();
    await writer.flush();

    expect(tries).toBe(3);
    expect(linesFor('ledger.open.retry')).toHaveLength(2);
    const disabled = linesFor('ledger.disabled');
    expect(disabled).toHaveLength(1);
    expect(fieldsOf(disabled[0])).toEqual({ reason: 'migrate' });
    await writer.close();
  });
});

describe('every record accepted but never written is counted', () => {
  it('records cleared by disable, and records arriving while off, are writeFailed', async () => {
    const open = async (): Promise<LedgerStore> => {
      throw new StoreOpenError('connect', new Error('refused'));
    };
    const writer = new LedgerWriter(open, { openAttempts: 1 });
    for (const id of ['m-1', 'm-2']) void writer.recordMatch(fixtureRecord(id));
    await writer.flush();
    expect(metricsPayload().ledger).toEqual({ enabled: false, writeOk: 0, writeFailed: 2, queueDepth: 0 });

    void writer.recordMatch(fixtureRecord('m-3'));
    expect(metricsPayload().ledger.writeFailed).toBe(3);
    await writer.close();
  });

  it('close() after a flush timeout drops the stranded records, counted, with ONE ledger.write.dropped', async () => {
    const { store, release } = gatedStore();
    const writer = new LedgerWriter(async () => store, { flushTimeoutMs: 20 });
    for (const id of ['m-0', 'm-1', 'm-2']) void writer.recordMatch(fixtureRecord(id));
    await writer.flush();
    expect(linesFor('ledger.flush.timeout')).toHaveLength(1);
    expect(metricsPayload().ledger.enabled).toBe(true);

    await writer.close();
    // m-0 is in flight and settles on its own; m-1 and m-2 are stranded.
    const dropped = linesFor('ledger.write.dropped');
    expect(dropped).toHaveLength(1);
    expect(fieldsOf(dropped[0])).toEqual({ count: 2 });
    expect(metricsPayload().ledger).toEqual({ enabled: false, writeOk: 0, writeFailed: 2, queueDepth: 0 });

    void writer.recordMatch(fixtureRecord('m-late'));
    expect(metricsPayload().ledger.writeFailed).toBe(3);
    await release();
    expect(metricsPayload().ledger).toMatchObject({ writeOk: 1, writeFailed: 3, queueDepth: 0 });
  });
});

describe('overflow re-arm', () => {
  it('logs one ledger.queue.overflow per burst, re-armed only once the queue is down to half the cap', async () => {
    const { store, release } = gatedStore();
    const cap = 4;
    const writer = new LedgerWriter(async () => store, { queueCap: cap });
    let n = 0;
    const push = (): void => void writer.recordMatch(fixtureRecord(`m-${n++}`));
    const depth = (): number => metricsPayload().ledger.queueDepth;
    await writer.recordMatch(fixtureRecord(`m-${n++}`));
    await settle(); // the store is up; m-0 is in flight
    while (depth() < cap) push();
    push(); // over the cap: the burst's one line
    expect(linesFor('ledger.queue.overflow')).toHaveLength(1);

    // One slot frees (the queue stays above half the cap); refilling it and
    // overflowing again is the same burst.
    await release();
    expect(depth()).toBeGreaterThan(cap / 2);
    while (depth() < cap) push();
    push();
    expect(linesFor('ledger.queue.overflow')).toHaveLength(1);

    // Down to half the cap: the next overflow is a new burst.
    while (depth() > cap / 2) await release();
    while (depth() < cap) push();
    push();
    expect(linesFor('ledger.queue.overflow')).toHaveLength(2);

    while (depth() > 0) await release();
    await writer.close();
  });
});
