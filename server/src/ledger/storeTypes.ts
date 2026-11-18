// The ledger's store seam (Story 12.1) — the shapes writer.ts and index.ts
// share with store.ts WITHOUT importing it. store.ts pulls in Drizzle and a
// database driver; this file pulls in nothing, so a server with no store
// configured never pays for either.

import type { LedgerRows } from './rows.js';

/** Where the ledger lives. `pglite` with no `dataDir` is in-memory (tests). */
export type StoreTarget =
  | { kind: 'postgres'; url: string }
  | { kind: 'pglite'; dataDir?: string };

/** An open, migrated store. */
export interface LedgerStore {
  /** Write one record's rows in ONE transaction; a row whose primary key
   *  already exists is skipped (ON CONFLICT DO NOTHING), so a retry is safe. */
  write(rows: LedgerRows): Promise<void>;
  close(): Promise<void>;
}

/** The short category `ledger.disabled` logs — never the error text, which
 *  could carry a host or a connection string. */
export type LedgerDisabledReason = 'driver' | 'connect' | 'migrate' | 'unknown';

/** A store that could not be opened, tagged with the phase that failed. */
export class StoreOpenError extends Error {
  constructor(
    readonly reason: LedgerDisabledReason,
    cause: unknown,
  ) {
    super(`ledger store open failed: ${reason}`, { cause });
    this.name = 'StoreOpenError';
  }
}

/** Run one phase of opening a store; any failure becomes a StoreOpenError
 *  naming that phase (an inner StoreOpenError keeps its own phase). */
export async function inPhase<T>(reason: LedgerDisabledReason, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw err instanceof StoreOpenError ? err : new StoreOpenError(reason, err);
  }
}

export function disabledReason(err: unknown): LedgerDisabledReason {
  return err instanceof StoreOpenError ? err.reason : 'unknown';
}

const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s'"]*/gi;

/** Error text with any postgres connection string blanked — the only form an
 *  error may take in a ledger log line. */
export function redactUrls(text: string): string {
  return text.replace(POSTGRES_URL, '[redacted-url]');
}
