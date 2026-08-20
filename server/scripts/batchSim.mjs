#!/usr/bin/env node
// Economy batch-sim harness — entry point (Story 2.10, amendments 54-56).
//
// FIRST DUTY of the triple-duty harness: an IN-PROCESS headless batch sim.
// World + Match are Colyseus-free and wall-clock-free, so N full matches run
// directly in one node process — no sockets, no rooms, no frames — with
// a scripted storm-pacing control + drone fill, all deterministically seeded.
// See batchsim/runner.ts (the runner seam) and batchsim/controls.ts (the
// control seam; the spend policy lives in batchsim/spendPolicy.ts): those
// interfaces are the documented reuse points for the later load-test and
// bot-vs-bot duties (AR12).
//
// SECOND DUTY, since Story 6.4: the BOT-VS-BOT instrument (`--bots N`). Story
// 6.4 ships no playable path at all (Eric ruling A1 — Story 6-5 wires the
// mode), so this harness is the ENTIRE verification instrument for combat-bot
// quality and its report carries the spec's quality bar with a PASS/FAIL per
// row. A bot needs NO control: it drives itself from World's `botsTick`
// STEP_ORDER row, so "bot mode" is a lobby constructor (world.addBot() x N)
// plus the read-only observer in batchsim/botMetrics.ts. A bot-only lobby
// drops the harness's dev minHumans to 0 — `humanCount()` counts real captains
// only, so a lobby of bots would otherwise never leave the waiting phase.
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
//   HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50 --seed 7
//   HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 2 --bots 18 --matches 20  (mixed lobby)
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

// SECOND GATE: --tune edits COMBAT numbers (gun/broadside/torpedo/mine/
// starShells/speedBoost/radarBuoy/shipClasses), not harness dials, so it
// carries its own env var on top of the dev gate above. Scanned off argv here —
// args.ts stays pure over argv and reads no process.env — and re-checked in
// batchsim/main.ts, which a direct tsx invocation can reach without passing
// through this file at all.
if (process.argv.includes('--tune') && process.env.HC_BALANCE !== '1') {
  console.error(
    'batchSim: refusing --tune without HC_BALANCE=1 — --tune mutates COMBAT ' +
      'CONFIG (gun.*, broadside.*, torpedo.*, mine.*, starShells.*, ' +
      'speedBoost.*, radarBuoy.*, shipClasses.*), ' +
      'a separate surface from the --set/--sweep harness dials.\n' +
      'Run: HC_DEV_OPTIONS=1 HC_BALANCE=1 node server/scripts/batchSim.mjs --tune key=value [options]',
  );
  // EXIT 2, matching batchsim/main.ts's documented codes and its own HC_BALANCE
  // re-check: the flags were legal, the invocation was not — that is a command
  // line failure. The HC_DEV_OPTIONS gate above deliberately keeps exiting 1,
  // so a wrapper can still tell "not a dev box" from "usage error".
  process.exit(2);
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
// A spawn failure (ENOENT: node_modules/.bin/tsx missing after a fresh clone or
// a pruned install) leaves status null — without this the harness would exit 1
// with NO output at all, which reads like a silent sim failure.
if (result.error) {
  console.error(
    `batchSim: could not launch tsx at ${tsx}: ${result.error.message}\n` +
      'The workspace dependencies are probably not installed — run `npm ci` at the repo root.',
  );
}
process.exit(result.status ?? 1);
