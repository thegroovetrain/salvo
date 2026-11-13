#!/usr/bin/env node
// Tick-cost probe — entry point (Story 11.2 follow-up). A DIAGNOSTIC: it
// compares two builds on one machine and is never a performance verdict.
//
// One short offline scenario (no sockets): 1 idle captain + bots on one map
// seed, stepped like a solo room; reports ms per tick (mean / p50 / p95 / p99)
// over the first seconds of the active phase, the live shell count, and the
// perception WORK per tick (fog lattice walks, island narrow-phase tests).
// See batchsim/tickCost.ts.
//
// Usage:
//   HC_DEV_OPTIONS=1 node server/scripts/tickCost.mjs [--seed 7] [--hulls 16] [--seconds 62]
//
// Like batchSim.mjs this only gates and re-execs into the TS implementation
// through the workspace's tsx, from source (batchsim/tsconfig.json maps
// @salvo/shared onto shared/src).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.HC_DEV_OPTIONS !== '1') {
  console.error('tickCost: refusing to run without HC_DEV_OPTIONS=1 — a dev-only diagnostic.');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const tsx = path.join(repo, 'node_modules/.bin/tsx');
const tsconfig = path.join(here, 'batchsim/tsconfig.json');
const entry = path.join(here, 'batchsim/tickCost.ts');

// Extra node flags (e.g. --cpu-prof) ride NODE_OPTIONS, set by the caller.
const result = spawnSync(tsx, ['--tsconfig', tsconfig, entry, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
if (result.error) console.error(`tickCost: could not launch tsx at ${tsx}: ${result.error.message}`);
process.exit(result.status ?? 1);
