// THE BOOT FACTORY (Story 12.1) — the ONE place the server chooses where a
// finished match's record goes. app.config.ts calls it once at boot and
// installs the result in the AccountWriter registry (game/accountWriter.ts).
// It lives here, not in game/, so game/ never imports the ledger.
//
//   DATABASE_URL set   → the ledger on Postgres (it wins over the next line)
//   HC_DEV_DB=pglite   → the ledger on file-backed PGlite at server/.pglite
//   neither            → the NullWriter: identical to before the ledger
//                        existed, and no database code is even loaded.
//
// The store opens asynchronously (store.ts, dynamically imported), so the
// writer exists at once and queues until it is ready; the writer retries a
// failed or overlong open, and if it never opens turns itself off (writer.ts). Boot never waits for, or fails on, the
// database.

import { fileURLToPath } from 'node:url';
import { NullWriter, type AccountWriter } from '../game/accountWriter.js';
import { LedgerWriter } from './writer.js';
import { inPhase, type LedgerStore, type StoreTarget } from './storeTypes.js';
import type { LedgerWriterOptions } from './writerSupport.js';

/** HC_DEV_DB=pglite's on-disk database: server/.pglite (gitignored), resolved
 *  from this module's file so src/ledger (tsx) and dist/ledger (node) agree. */
const DEV_PGLITE_DIR = fileURLToPath(new URL('../../.pglite', import.meta.url));

/** Which store, if any, the environment asks for. Pure. */
export function storeTargetFromEnv(env: NodeJS.ProcessEnv): StoreTarget | null {
  const url = env.DATABASE_URL?.trim();
  if (url) return { kind: 'postgres', url };
  if (env.HC_DEV_DB === 'pglite') return { kind: 'pglite', dataDir: DEV_PGLITE_DIR };
  return null;
}

/** Load store.ts and open the target; a failed module load is a 'driver' failure. */
async function openTarget(target: StoreTarget): Promise<LedgerStore> {
  const { openStore } = await inPhase('driver', () => import('./store.js'));
  return openStore(target);
}

/** A ledger writer on an explicit target; every open retry re-opens it.
 *  `opts` lets the tests shrink the writer's time bounds. */
export function createLedgerWriter(target: StoreTarget, opts: LedgerWriterOptions = {}): LedgerWriter {
  return new LedgerWriter(() => openTarget(target), opts);
}

/** THE BOOT FACTORY: the ledger when the environment names a store, else the
 *  NullWriter. Nothing else in the server chooses a writer. */
export function createAccountWriter(env: NodeJS.ProcessEnv = process.env): AccountWriter {
  const target = storeTargetFromEnv(env);
  return target ? createLedgerWriter(target) : new NullWriter();
}
