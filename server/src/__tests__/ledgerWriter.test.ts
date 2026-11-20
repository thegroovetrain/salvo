// THE MATCH LEDGER WRITER (Story 12.1) — integration on in-memory PGlite with
// the REAL checked-in migrations (server/drizzle/), so the suite exercises the
// SQL production runs with no Postgres installed.
//
// Contracts: a finished record lands as one match row + its participants + its
// hands, with no callsign column; a retry after a write that did commit is a
// no-op, not a duplicate; a record that fails twice is counted and logged and
// never rejects into the room; a store that never opens turns the writer off
// with exactly one `ledger.disabled` and no connection string in any output;
// the queue is bounded; flush drains, and is bounded in time; with no store
// configured the factory hands back the NullWriter.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { NullWriter } from '../game/accountWriter.js';
import { createAccountWriter, createLedgerWriter, storeTargetFromEnv } from '../ledger/index.js';
import { storeOnPglite } from '../ledger/store.js';
import { LedgerWriter } from '../ledger/writer.js';
import type { LedgerStore } from '../ledger/storeTypes.js';
import type { LedgerRows } from '../ledger/rows.js';
import { metricsPayload, resetMetrics } from '../metrics.js';
import { CALLSIGN, fixtureRecord } from './ledgerFixture.js';

// Each case boots its own in-memory PGlite (~1-2 s of WASM start-up), which a
// loaded full-suite run can stretch past vitest's 5 s default.
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

async function freshDb(): Promise<{ client: PGlite; store: LedgerStore }> {
  const client = await PGlite.create();
  return { client, store: await storeOnPglite(client) };
}

async function count(client: PGlite, table: string): Promise<number> {
  const res = await client.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return res.rows[0].n;
}

/** A store whose `write` is replaced, delegating to the real one when asked. */
function wrapped(store: LedgerStore, write: (rows: LedgerRows, real: LedgerStore) => Promise<void>): LedgerStore {
  return { write: (rows) => write(rows, store), close: () => store.close() };
}

function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => (open = resolve));
  return { wait, open };
}

describe('LedgerWriter on PGlite with the real migrations', () => {
  it('writes a finished match as one match row + participants + hands, with no callsign column', async () => {
    const { client, store } = await freshDb();
    const writer = new LedgerWriter(async () => store);
    const record = fixtureRecord();
    const handTotal = record.participants.reduce((n, p) => n + p.hands.length, 0);

    await expect(writer.recordMatch(record)).resolves.toBeUndefined();
    await writer.flush();

    expect(await count(client, 'matches')).toBe(1);
    expect(await count(client, 'match_participants')).toBe(record.participants.length);
    expect(await count(client, 'match_hands')).toBe(handTotal);

    const cols = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name in ('matches','match_participants','match_hands')`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).not.toContain('name');
    expect(names).not.toContain('user_id');

    const dump = await client.query(`select * from matches, match_participants, match_hands`);
    expect(JSON.stringify(dump.rows)).not.toContain(CALLSIGN);

    // Values round-trip as built: the leaver's negative stamps, fit order, a fractional number.
    const a = record.participants[0];
    const pa = await client.query<{ cards: string[]; damage_dealt: number; index_bonus: Record<string, number> }>(
      `select cards, damage_dealt, index_bonus from match_participants where participant_id = $1`,
      [a.id],
    );
    expect(pa.rows[0]).toEqual({ cards: [...a.cards], damage_dealt: a.damageDealt, index_bonus: a.indexBonus });
    const leaver = record.participants.find((p) => p.placement === 0)!;
    const lh = await client.query<{ dealt_at_ms: number; placement: number }>(
      `select h.dealt_at_ms, p.placement from match_hands h join match_participants p using (match_id, participant_id) where participant_id = $1`,
      [leaver.id],
    );
    expect(lh.rows).toEqual(leaver.hands.map((h) => ({ dealt_at_ms: h.dealtAtMs, placement: 0 })));

    expect(metricsPayload().ledger).toEqual({ enabled: true, writeOk: 1, writeFailed: 0, queueDepth: 0 });
    expect(linesFor('ledger.write.ok')).toHaveLength(1);
    expect(linesFor('ledger.write.ok')[0]).toContain(`"rows":${1 + record.participants.length + handTotal}`);
    await writer.close();
  });

  it('a draw stores its empty winner as-is', async () => {
    const { client, store } = await freshDb();
    const writer = new LedgerWriter(async () => store);
    void writer.recordMatch(fixtureRecord('m-draw', 'draw'));
    await writer.flush();
    const res = await client.query<{ winner_id: string; outcome: string }>(`select winner_id, outcome from matches`);
    expect(res.rows).toEqual([{ winner_id: '', outcome: 'draw' }]);
    await writer.close();
  });

  it('retry-once is idempotent: a write that committed but reported failure is not duplicated', async () => {
    const { client, store } = await freshDb();
    let calls = 0;
    const flaky = wrapped(store, async (rows, real) => {
      calls++;
      await real.write(rows);
      if (calls === 1) throw new Error('connection lost after commit');
    });
    const writer = new LedgerWriter(async () => flaky);
    const record = fixtureRecord();
    void writer.recordMatch(record);
    await writer.flush();

    expect(calls).toBe(2);
    expect(await count(client, 'matches')).toBe(1);
    expect(await count(client, 'match_participants')).toBe(record.participants.length);
    expect(metricsPayload().ledger).toMatchObject({ writeOk: 1, writeFailed: 0 });
    await writer.close();
  });

  it('a record that fails twice is counted and logged, never rejects, and the queue moves on', async () => {
    const { client, store } = await freshDb();
    const broken = wrapped(store, async (rows, real) => {
      if (rows.match.id === 'm-bad') throw new Error('write refused for postgres://ledger:hunter2@db.internal:5432/hc');
      await real.write(rows);
    });
    const writer = new LedgerWriter(async () => broken);

    await expect(writer.recordMatch(fixtureRecord('m-bad'))).resolves.toBeUndefined();
    await expect(writer.recordMatch(fixtureRecord('m-good'))).resolves.toBeUndefined();
    await writer.flush();

    expect(metricsPayload().ledger).toEqual({ enabled: true, writeOk: 1, writeFailed: 1, queueDepth: 0 });
    const failed = linesFor('ledger.write.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toContain('"matchId":"m-bad"');
    expect(lines.join('\n')).not.toMatch(/postgres:\/\/|hunter2/);
    const ids = await client.query<{ id: string }>(`select id from matches`);
    expect(ids.rows).toEqual([{ id: 'm-good' }]);
    await writer.close();
  });

  it('records arriving before the store opens wait, and flush drains them all', async () => {
    const { client, store } = await freshDb();
    const opened = gate();
    const writer = new LedgerWriter(() => opened.wait.then(() => store));
    for (const id of ['m-1', 'm-2', 'm-3']) void writer.recordMatch(fixtureRecord(id));
    expect(metricsPayload().ledger.queueDepth).toBe(3);

    opened.open();
    await writer.flush();
    expect(await count(client, 'matches')).toBe(3);
    expect(metricsPayload().ledger).toEqual({ enabled: true, writeOk: 3, writeFailed: 0, queueDepth: 0 });
    expect(linesFor('ledger.ready')).toHaveLength(1);
    await writer.close();
  });
});

describe('LedgerWriter bounds', () => {
  it('over the queue cap a record is dropped and counted, logged once per burst', async () => {
    const { client, store } = await freshDb();
    const held = gate();
    const slow = wrapped(store, async (rows, real) => {
      await held.wait;
      await real.write(rows);
    });
    const cap = 2;
    const writer = new LedgerWriter(async () => slow, { queueCap: cap });
    await writer.recordMatch(fixtureRecord('m-0'));
    await new Promise((r) => setImmediate(r)); // the store is up; m-0 is in flight
    const dropped = 3;
    for (let i = 1; i < cap + dropped; i++) await writer.recordMatch(fixtureRecord(`m-${i}`));

    expect(metricsPayload().ledger).toMatchObject({ writeFailed: dropped, queueDepth: cap });
    expect(linesFor('ledger.queue.overflow')).toHaveLength(1);

    held.open();
    await writer.flush();
    expect(await count(client, 'matches')).toBe(cap);
    expect(metricsPayload().ledger).toMatchObject({ writeOk: cap, writeFailed: dropped, queueDepth: 0 });

    // A new burst after the queue drained logs again.
    for (let i = 0; i < cap + 1; i++) void writer.recordMatch(fixtureRecord(`m-next-${i}`));
    await writer.flush();
    expect(linesFor('ledger.queue.overflow')).toHaveLength(2);
    expect(metricsPayload().ledger).toMatchObject({ writeOk: 2 * cap, writeFailed: dropped + 1 });
    await writer.close();
  });

  it('flush is bounded: a store that never answers cannot hold shutdown', async () => {
    const { store } = await freshDb();
    // (Each write attempt has its own deadline too — ledgerWriterFaults.test.ts.)
    const stuck = wrapped(store, () => new Promise<void>(() => {}));
    const writer = new LedgerWriter(async () => stuck, { flushTimeoutMs: 20 });
    void writer.recordMatch(fixtureRecord());
    await expect(writer.flush()).resolves.toBeUndefined();
    expect(linesFor('ledger.flush.timeout')).toHaveLength(1);
    expect(linesFor('ledger.flush.timeout')[0]).toContain('"left":1');
    await writer.close();
  });
});

describe('a store that never opens', () => {
  it('retries, then turns the writer off with exactly one ledger.disabled, counts every drop, never leaks the URL', async () => {
    const url = 'postgres://nobody:s3cret-pw@127.0.0.1:1/x';
    const writer = createLedgerWriter({ kind: 'postgres', url }, { openRetryDelayMs: 1 });
    for (const id of ['m-1', 'm-2']) await expect(writer.recordMatch(fixtureRecord(id))).resolves.toBeUndefined();
    await writer.flush();
    for (const id of ['m-3', 'm-4']) await expect(writer.recordMatch(fixtureRecord(id))).resolves.toBeUndefined();
    await writer.flush();

    expect(linesFor('ledger.open.retry')).toHaveLength(2);
    const disabled = linesFor('ledger.disabled');
    expect(disabled).toHaveLength(1);
    expect(disabled[0]).toContain('"reason":"connect"');
    expect(lines.join('\n')).not.toMatch(/postgres:\/\/|s3cret-pw|nobody/);
    expect(linesFor('ledger.write.failed')).toHaveLength(0);
    // Two queued while opening (cleared by disable) + two arriving while off.
    expect(metricsPayload().ledger).toEqual({ enabled: false, writeOk: 0, writeFailed: 4, queueDepth: 0 });
    await writer.close();
  });
});

describe('createAccountWriter — the one selection point', () => {
  it('no store configured → the NullWriter, and no ledger log', () => {
    expect(createAccountWriter({})).toBeInstanceOf(NullWriter);
    expect(createAccountWriter({ DATABASE_URL: '  ', HC_DEV_DB: 'other' })).toBeInstanceOf(NullWriter);
    expect(lines.filter((l) => l.includes('ledger.'))).toHaveLength(0);
  });

  it('DATABASE_URL wins over HC_DEV_DB=pglite; HC_DEV_DB=pglite alone is file-backed PGlite', () => {
    const url = 'postgres://u@h/db';
    expect(storeTargetFromEnv({ DATABASE_URL: url, HC_DEV_DB: 'pglite' })).toEqual({ kind: 'postgres', url });
    const dev = storeTargetFromEnv({ HC_DEV_DB: 'pglite' });
    expect(dev).toMatchObject({ kind: 'pglite' });
    expect(dev?.kind === 'pglite' && dev.dataDir).toBeTruthy();
    expect(storeTargetFromEnv({})).toBeNull();
  });
});
