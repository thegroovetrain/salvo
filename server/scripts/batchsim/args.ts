// CLI parsing for the batch-sim harness (latencyHarness argv discipline:
// `--flag value` pairs, fail-fast with a usage message on anything unknown).
// Pure over argv — unit-testable without a process.

import { validateTunableKey } from './overrides.js';

/** Bad command line — main prints .message and exits 2. */
export class UsageError extends Error {}

export interface SweepSpec {
  key: string;
  values: number[];
}

export interface CliOptions {
  matches: number;
  seed: number;
  captains: number;
  /** Drone fill per match; null = default (CONFIG.match.fillTo - captains). */
  drones: number | null;
  /** CONFIG overrides (tunable dials only), applied before any World is built. */
  set: Record<string, number>;
  /** Each sweep multiplies the variant grid (cartesian across repeats). */
  sweeps: SweepSpec[];
  deckOnly: boolean;
  /** Deck-only mode: total draw budget across simulated economies. */
  draws: number;
  json: string | null;
  quiet: boolean;
  help: boolean;
}

export const USAGE = `usage: HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs [options]
  --matches N        matches per run (default 100)
  --seed S           run seed (default 1)
  --captains C       scripted captains (default 3; classes round-robin)
  --drones D         drone fill per match (default CONFIG.match.fillTo - captains)
  --set key=value    CONFIG override, repeatable. Tunable dials ONLY:
                     xp.*, deck.*, offer.size, match.fillTo, zone.*
  --sweep key=v1,v2  run the full batch per value and compare side-by-side
                     (repeatable; repeats form a cartesian variant grid)
  --deck-only        pure deck-economy fast mode (no World, no Match)
  --draws N          deck-only total draw budget (default 20000)
  --json PATH        also write the machine-readable report to PATH
  --quiet            suppress stderr progress lines
  --help             print this and exit`;

function defaults(): CliOptions {
  return {
    matches: 100,
    seed: 1,
    captains: 3,
    drones: null,
    set: {},
    sweeps: [],
    deckOnly: false,
    draws: 20000,
    json: null,
    quiet: false,
    help: false,
  };
}

function parseNumber(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`${flag}: '${raw}' is not a number`);
  return n;
}

function parseCount(raw: string, flag: string, min: number): number {
  const n = parseNumber(raw, flag);
  if (!Number.isInteger(n) || n < min) throw new UsageError(`${flag}: expected an integer >= ${min}, got '${raw}'`);
  return n;
}

/** `key=value` for --set: tunable-dial key, finite numeric value. */
function parseSet(opts: CliOptions, raw: string): void {
  const eq = raw.indexOf('=');
  if (eq <= 0) throw new UsageError(`--set: expected key=value, got '${raw}'`);
  const key = raw.slice(0, eq);
  validateTunableKey(key); // throws TunableError on unknown/non-tunable keys
  opts.set[key] = parseNumber(raw.slice(eq + 1), `--set ${key}`);
}

/** `key=v1,v2,...` for --sweep: same key rules, >= 1 numeric values. */
function parseSweep(opts: CliOptions, raw: string): void {
  const eq = raw.indexOf('=');
  if (eq <= 0) throw new UsageError(`--sweep: expected key=v1,v2,..., got '${raw}'`);
  const key = raw.slice(0, eq);
  validateTunableKey(key);
  const values = raw
    .slice(eq + 1)
    .split(',')
    .map((v) => parseNumber(v, `--sweep ${key}`));
  if (values.length === 0) throw new UsageError(`--sweep ${key}: needs at least one value`);
  opts.sweeps.push({ key, values });
}

type ValueHandler = (opts: CliOptions, value: string) => void;

const VALUE_FLAGS: Record<string, ValueHandler> = {
  '--matches': (o, v) => void (o.matches = parseCount(v, '--matches', 1)),
  '--seed': (o, v) => void (o.seed = parseCount(v, '--seed', 0)),
  '--captains': (o, v) => void (o.captains = parseCount(v, '--captains', 1)),
  '--drones': (o, v) => void (o.drones = parseCount(v, '--drones', 0)),
  '--draws': (o, v) => void (o.draws = parseCount(v, '--draws', 1)),
  '--set': parseSet,
  '--sweep': parseSweep,
  '--json': (o, v) => void (o.json = v),
};

const BOOL_FLAGS: Record<string, (opts: CliOptions) => void> = {
  '--deck-only': (o) => void (o.deckOnly = true),
  '--quiet': (o) => void (o.quiet = true),
  '--help': (o) => void (o.help = true),
};

export function parseArgs(argv: readonly string[]): CliOptions {
  const opts = defaults();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const bool = BOOL_FLAGS[flag];
    if (bool) {
      bool(opts);
      continue;
    }
    const handler = VALUE_FLAGS[flag];
    if (!handler) throw new UsageError(`unknown argument: ${flag}\n${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined) throw new UsageError(`${flag} needs a value\n${USAGE}`);
    handler(opts, value);
    i += 1;
  }
  return opts;
}

export interface Variant {
  label: string;
  set: Record<string, number>;
}

/** The sweep grid: base --set overrides x cartesian product of every --sweep.
 *  Pure over the parsed options (lives here so tests never import main.ts,
 *  which runs the CLI at import time). */
export function buildVariants(opts: Pick<CliOptions, 'set' | 'sweeps'>): Variant[] {
  let variants: Variant[] = [{ label: 'baseline', set: { ...opts.set } }];
  for (const sweep of opts.sweeps) {
    variants = variants.flatMap((v) =>
      sweep.values.map((value) => ({
        label: v.label === 'baseline' ? `${sweep.key}=${value}` : `${v.label} ${sweep.key}=${value}`,
        set: { ...v.set, [sweep.key]: value },
      })),
    );
  }
  return variants;
}
