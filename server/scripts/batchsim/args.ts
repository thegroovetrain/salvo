// CLI parsing for the batch-sim harness (latencyHarness argv discipline:
// `--flag value` pairs, fail-fast with a usage message on anything unknown).
// Pure over argv — unit-testable without a process.

import { validateTunableKey, validateTunableValue } from './overrides.js';
import { PILOT_REGISTRY } from './pilots.js';

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
  /** COMBAT BOTS in the lobby (Story 6.4). Bots have no pilot — they drive
   *  themselves from World's botsTick row — so this is purely a lobby size. */
  bots: number;
  /** Captain pilot policy name (PILOT_REGISTRY key); default 'gunner'. */
  pilot: string;
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
  --captains C       scripted captains (default 3; classes round-robin).
                     0 is legal ONLY with --bots (a bot-only lobby)
  --bots N           combat bots (Story 6.4 AI captains; default 0). Bots roll
                     their own class/profile/callsign and drive themselves;
                     --pilot does not apply to them. A bot-only lobby drops
                     minHumans to 0 so the match can actually start
  --set key=value    CONFIG override, repeatable. Tunable dials ONLY:
                     xp.*, deck.*, offer.size, match.fillTo, map.baseRadius,
                     zone.* (phased shape: beatMs, ringSteps.N, offsetCap,
                     terminalSightFactor, stormDps)
  --sweep key=v1,v2  run the full batch per value and compare side-by-side
                     (repeatable; repeats form a cartesian variant grid)
  --pilot NAME       captain pilot policy: gunner (default) | pacifist
                     (no-hunt control — sails the ring rhythm, never fires) |
                     endgame (pacifist until the zone closes, then hunts —
                     the Story 3.4 endgame-guarantee evidence instrument)
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
    bots: 0,
    pilot: 'gunner',
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
  // Number('') and Number('  ') are 0, not NaN — an empty value (or an empty
  // element in a `1,,2` sweep list) would silently become a legitimate-looking
  // zero dial. Reject before coercion.
  if (raw.trim() === '') throw new UsageError(`${flag}: expected a number, got an empty value`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`${flag}: '${raw}' is not a number`);
  return n;
}

/** Fold a seed into the uint32 domain every mulberry32 stream actually uses, so
 *  a >= 2^32 seed cannot alias another run's key while printing as distinct. */
function toUint32Seed(n: number): number {
  return (n % 2 ** 32) >>> 0;
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
  const value = parseNumber(raw.slice(eq + 1), `--set ${key}`);
  validateTunableValue(key, value); // per-key floor (see overrides.MIN_ONE_KEYS)
  opts.set[key] = value;
}

/** `key=v1,v2,...` for --sweep: same key rules, >= 1 numeric values, and the
 *  key may appear only ONCE across all --sweep flags — a repeat would make the
 *  later value overwrite the earlier one in every grid cell (buildVariants
 *  spreads onto the same key), fabricating a comparison of identical runs under
 *  different labels. */
function parseSweep(opts: CliOptions, raw: string): void {
  const eq = raw.indexOf('=');
  if (eq <= 0) throw new UsageError(`--sweep: expected key=v1,v2,..., got '${raw}'`);
  const key = raw.slice(0, eq);
  validateTunableKey(key);
  if (opts.sweeps.some((s) => s.key === key)) throw new UsageError(`duplicate sweep key: ${key}`);
  const values = raw
    .slice(eq + 1)
    .split(',')
    .map((v) => parseNumber(v, `--sweep ${key}`));
  for (const v of values) validateTunableValue(key, v);
  if (values.length === 0) throw new UsageError(`--sweep ${key}: needs at least one value`);
  opts.sweeps.push({ key, values });
}

type ValueHandler = (opts: CliOptions, value: string) => void;

const VALUE_FLAGS: Record<string, ValueHandler> = {
  '--matches': (o, v) => void (o.matches = parseCount(v, '--matches', 1)),
  '--seed': (o, v) => void (o.seed = toUint32Seed(parseCount(v, '--seed', 0))),
  '--captains': (o, v) => void (o.captains = parseCount(v, '--captains', 0)),
  '--bots': (o, v) => void (o.bots = parseCount(v, '--bots', 0)),
  '--draws': (o, v) => void (o.draws = parseCount(v, '--draws', 1)),
  // Validated against the real registry at parse time so a typo fails fast
  // with the legal names instead of silently running the default pilot.
  '--pilot': (o, v) => {
    if (!Object.hasOwn(PILOT_REGISTRY, v)) {
      throw new UsageError(`--pilot: unknown pilot '${v}' (available: ${Object.keys(PILOT_REGISTRY).sort().join(', ')})`);
    }
    o.pilot = v;
  },
  '--set': parseSet,
  '--sweep': parseSweep,
  // A dropped path (`--json --quiet`) would otherwise write the report to a
  // file literally named '--quiet' and swallow the flag.
  '--json': (o, v) => {
    if (v.startsWith('--')) throw new UsageError(`--json requires a path, got '${v}'`);
    o.json = v;
  },
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
  // An EMPTY LOBBY is a run key that can never produce evidence: with no
  // captains and no bots the match activates on its first tick against nothing
  // and every row reads zero. Caught here rather than in the runner so the
  // failure is a usage error (exit 2) instead of a structural one.
  if (!opts.deckOnly && opts.captains + opts.bots === 0) {
    throw new UsageError('--captains 0 needs --bots N: a lobby needs at least one participant');
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
