#!/usr/bin/env node
// Economy batch-sim harness — entry point (Story 2.10, amendments 54-56).
//
// FIRST DUTY of the triple-duty harness: an IN-PROCESS headless batch sim.
// World + Match are Colyseus-free and wall-clock-free, so N full matches run
// directly in one node process — no sockets, no rooms, no frames — with
// scripted captains + drone fill and deterministic seeded pilots. See
// batchsim/runner.ts (the runner seam) and batchsim/pilots.ts (the pilot
// seam + spend policy): those two interfaces are the documented reuse points
// for the later load-test and bot-vs-bot duties (AR12).
//
// This .mjs is only the gate + bootstrap:
//   - refuses to run without HC_DEV_OPTIONS=1 (dev-tooling convention gate —
//     no room is involved, but the harness must never look like a prod tool);
//   - re-execs into the TS implementation (batchsim/main.ts) via the
//     workspace's tsx binary — the SAME binary the smokes boot the server
//     with. server/dist AND shared/dist are stale-prone build artifacts and
//     are deliberately NOT dependencies: batchsim/tsconfig.json maps
//     @salvo/shared onto shared/src, so the whole run executes from source.
//
// Usage (see batchsim/args.ts USAGE for the full flag set):
//   HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 500 --seed 7
//   HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --deck-only --draws 20000
//   HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --sweep xp.levelMs=45000,60000
//
// Determinism: identical run key (seed + overrides + roster + mode) =>
// byte-identical report body; only the trailing `meta:` line carries wall
// clock (compare with `grep -v '^meta:'`).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.HC_DEV_OPTIONS !== '1') {
  console.error(
    'batchSim: refusing to run without HC_DEV_OPTIONS=1 — this is a dev-only ' +
      'balance-evidence harness, never a production tool.\n' +
      'Run: HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs [options]',
  );
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const tsx = path.join(repo, 'node_modules/.bin/tsx');
const tsconfig = path.join(here, 'batchsim/tsconfig.json');
const entry = path.join(here, 'batchsim/main.ts');

const result = spawnSync(tsx, ['--tsconfig', tsconfig, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
