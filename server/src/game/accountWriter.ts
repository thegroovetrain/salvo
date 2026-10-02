// THE ACCOUNT WRITER PORT (Story 8.21) — where a finished match's
// `MatchRecord` goes. This story ships the port and the NullWriter only: no
// store, no queue, no retry, no env var. Epic 9 branches `createAccountWriter()`
// to a real writer, and AR33's FIFO + retry-once + flush-on-shutdown belong to
// THAT writer (a NullWriter cannot fail, so there is nothing to retry).
//
// The room hands records over FIRE-AND-FORGET (ArenaRoom, under the
// `match.end` latch): `recordMatch` is never awaited on the tick, and a
// rejection is logged as `account.write.failed`. ZERO Colyseus imports.

import type { MatchRecord } from './matchRecord.js';

export interface AccountWriter {
  /** Persist one finished match. Must not be awaited on the tick. */
  recordMatch(record: MatchRecord): Promise<void>;
  /** Drain anything in flight (graceful shutdown). */
  flush(): Promise<void>;
}

/** The writer that writes nothing: both calls resolve at once, nothing kept. */
export class NullWriter implements AccountWriter {
  recordMatch(_record: MatchRecord): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}

// --- registry (the metrics.ts module-seam pattern) ----------------------------

let writer: AccountWriter = new NullWriter();
/** The server build stamped on every record (root package.json), registered
 *  at boot beside the writer; '' in tests and anywhere nothing registered it. */
let gameVersion = '';

/** The installed writer (the NullWriter unless boot or a test installed one). */
export function getAccountWriter(): AccountWriter {
  return writer;
}

/** Install a writer — the boot path and the tests' seam. */
export function setAccountWriter(w: AccountWriter): void {
  writer = w;
}

export function getGameVersion(): string {
  return gameVersion;
}

export function setGameVersion(v: string): void {
  gameVersion = v;
}

/** THE BOOT FACTORY: the NullWriter today. Epic 9 branches here on its store
 *  configuration; nothing else in the server chooses a writer. */
export function createAccountWriter(): AccountWriter {
  return new NullWriter();
}
