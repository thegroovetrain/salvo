// THE LEDGER STORE (Story 12.1) — opens a Drizzle handle on Postgres
// (postgres-js, the DATABASE_URL path) or on PGlite (HC_DEV_DB=pglite and the
// tests), applies the CHECKED-IN migrations under server/drizzle/ with Drizzle's
// own migrator, and writes one record's rows per transaction.
//
// Only ever reached through a dynamic import (ledger/index.ts), and each
// driver is itself imported dynamically, so a server without a store loads
// neither — and PGlite, a devDependency, is never loaded in production.
//
// Opening is phased (driver → connect → migrate) and a failure is tagged with
// its phase (StoreOpenError) so `ledger.disabled` can say WHICH without ever
// logging the error text, which could carry a host or a connection string.

import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { matchHands, matches, matchParticipants } from './schema.js';
import type { LedgerRows } from './rows.js';
import { inPhase, type LedgerStore, type StoreTarget } from './storeTypes.js';

// Resolved from THIS module's file, so the same relative step reaches
// server/drizzle from src/ledger/ (tsx, vitest) and from dist/ledger/ (node).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

type LedgerDb = PgDatabase<PgQueryResultHKT>;

/** postgres-js connect deadline, seconds (its own unit). */
const PG_CONNECT_TIMEOUT_S = 10;
/** Server-side bounds sent as startup parameters, ms: no statement, lock wait
 *  or idle-open transaction can hold the ledger's one connection forever. The
 *  writer also bounds each attempt itself (writerSupport.ts). */
const PG_STATEMENT_TIMEOUT_MS = 15_000;
const PG_LOCK_TIMEOUT_MS = 5_000;
const PG_IDLE_IN_TRANSACTION_TIMEOUT_MS = 15_000;

/** One record = one transaction. ON CONFLICT DO NOTHING on every table makes a
 *  retry of a write that in fact committed a no-op rather than an error. */
async function writeRows(db: LedgerDb, rows: LedgerRows): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(matches).values(rows.match).onConflictDoNothing();
    if (rows.participants.length > 0) {
      await tx.insert(matchParticipants).values(rows.participants).onConflictDoNothing();
    }
    if (rows.hands.length > 0) {
      await tx.insert(matchHands).values(rows.hands).onConflictDoNothing();
    }
  });
}

/** Best-effort close used when an open fails part-way. */
async function quietly(close: () => Promise<unknown>): Promise<void> {
  try {
    await close();
  } catch {
    /* the open already failed; that error is the one reported */
  }
}

async function openPostgres(url: string): Promise<LedgerStore> {
  const [{ default: postgres }, { drizzle }, { migrate }] = await inPhase('driver', () =>
    Promise.all([
      import('postgres'),
      import('drizzle-orm/postgres-js'),
      import('drizzle-orm/postgres-js/migrator'),
    ]),
  );
  // ONE connection: the writer is strictly one record at a time. Notices
  // (e.g. "schema already exists, skipping" from the migrator) are dropped —
  // postgres-js would otherwise print them to stdout outside log.ts's format.
  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    connect_timeout: PG_CONNECT_TIMEOUT_S,
    connection: {
      statement_timeout: PG_STATEMENT_TIMEOUT_MS,
      lock_timeout: PG_LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: PG_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
  });
  const close = () => client.end({ timeout: 5 });
  try {
    await inPhase('connect', () => client`select 1`);
    const db = drizzle({ client });
    await inPhase('migrate', () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }));
    return { write: (rows) => writeRows(db, rows), close };
  } catch (err) {
    await quietly(close);
    throw err;
  }
}

type PGliteClient = import('@electric-sql/pglite').PGlite;

/** Migrate an already-open PGlite and wrap it as a store (closing the store
 *  closes the client). Exported for the tests, which keep the client to read
 *  the rows back. */
export async function storeOnPglite(client: PGliteClient): Promise<LedgerStore> {
  const [{ drizzle }, { migrate }] = await inPhase('driver', () =>
    Promise.all([import('drizzle-orm/pglite'), import('drizzle-orm/pglite/migrator')]),
  );
  const close = () => client.close();
  try {
    const db = drizzle({ client });
    await inPhase('migrate', () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }));
    return { write: (rows) => writeRows(db, rows), close };
  } catch (err) {
    await quietly(close);
    throw err;
  }
}

async function openPglite(dataDir: string | undefined): Promise<LedgerStore> {
  const { PGlite } = await inPhase('driver', () => import('@electric-sql/pglite'));
  const client = await inPhase('connect', () => PGlite.create(dataDir));
  return storeOnPglite(client);
}

/** Open and migrate the store. Rejects with a StoreOpenError naming the phase
 *  that failed; never logs. */
export function openStore(target: StoreTarget): Promise<LedgerStore> {
  return target.kind === 'postgres' ? openPostgres(target.url) : openPglite(target.dataDir);
}
