// CLI parsing for the batch-sim harness (latencyHarness argv discipline:
// `--flag value` pairs, fail-fast with a usage message on anything unknown).
// Pure over argv — unit-testable without a process.

import { GUN_IDS, SHIP_CLASS_IDS, isGunId, type GunId, type ShipClassId } from '@salvo/shared';
import { validateTunableKey, validateTunableValue, validateTuneKey, validateTuneValue } from './overrides.js';
import { CONTROL_REGISTRY } from './controls.js';
import { BOT_PROFILES, TEST_PROFILE_IDS } from '../../src/game/ai/profiles.js';

/** The scheme keyword for --bot-profile: deal the three test rows round-robin
 *  (TB, BS, ML), so one flag exercises all three hulls in a balanced spread. */
export const BOT_PROFILE_SCHEME = 'random';

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
  /** COMBAT BOTS in the lobby (Story 6.4). Bots have no control — they drive
   *  themselves from World's botsTick row — so this is purely a lobby size. */
  bots: number;
  /** Scripted captain control name (CONTROL_REGISTRY key); default 'pacifist'. */
  control: string;
  /** TEST-ONLY bot profile forcing (Story 7-6 wave 4): a TestProfileId, the
   *  'random' round-robin scheme, or null = the shipped rolled profiles.
   *  In-game profile ids are REJECTED at parse time — the test rows live in a
   *  separate id space precisely so they can never reach a real lobby, and
   *  the harness door only opens toward the test side. */
  botProfile: string | null;
  /** The controller-level engage gate: 'endgame' holds every bot's fire until
   *  the terminal ring is reached (the Story 3.4 evidence instrument). */
  botEngage: 'always' | 'endgame';
  /** SPEND MODE (balance campaign, 2026-08-24): 'profile' (default, shipped
   *  weighted policy) | 'random' — rolled IN-GAME profiles keep their whole
   *  temperament but pick cards uniformly at random, the tuned-profile
   *  instance of the blind-vacuum measurement design. */
  botSpend: 'profile' | 'random' | 'gun';
  /** FORCED HULL for every bot on the ROLLED-profile path (mono-class arms
   *  with tuned temperaments): each bot still rolls an in-game profile for
   *  that hull. Null = the roster policy deals as usual. */
  botHull: ShipClassId | null;
  /** FORCED GUN for every bot (Story 8.15, amendment 109: "a harness/dev arm
   *  may force every bot to one gun"). Null = production's rule — each bot
   *  mounts a seeded uniform gun off the match seed (runner.ts botGunFor). */
  botGun: GunId | null;
  /** CONFIG overrides (tunable dials only), applied before any World is built. */
  set: Record<string, number>;
  /** HARNESS SPAWN LAYOUT (Epic 9 tuning pass, 2026-10-06): rings of
   *  `slots@fraction` installed on server/src/game/spawn.ts for the run; null
   *  = the shipped single ring. A different lobby geometry, so it joins the
   *  run key and the JSON variant. */
  spawnRings: { slots: number; fraction: number }[] | null;
  /** EQUIPMENT CONFIG overrides (--tune), applied alongside `set` before any
   *  World is built. A SEPARATE surface from --set/--sweep with its own env
   *  gate (HC_BALANCE=1) enforced in batchSim.mjs and re-checked in main.ts —
   *  this module stays pure over argv and reads no process.env. */
  tune: Record<string, number>;
  /** LOBBY HULL POLICY. 'rolled' (default) lets every bot roll its own class
   *  off the controller's stream — the shipped behaviour, and the reason every
   *  existing bot-mode run key stays byte-identical. 'even' round-robins
   *  SHIP_CLASS_IDS across bots AND captains OFFSET BY MATCH INDEX, so
   *  per-class win share measures BALANCE instead of representation. See
   *  RunSpec.roster for the exact evenness guarantee. */
  roster: 'even' | 'rolled';
  /** Each sweep multiplies the variant grid (cartesian across repeats). */
  sweeps: SweepSpec[];
  /** Include RAW per-match bot rows (builds, picks, offers, placement) in the
   *  --json envelope — the per-upgrade evidence surface. Opt-in because it
   *  multiplies the JSON size by the lobby; the deterministic stdout body is
   *  untouched either way. */
  raw: boolean;
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
                     --control does not apply to them. A bot-only lobby drops
                     minHumans to 0 so the match can actually start
  --roster MODE      hull policy for the lobby: rolled (default; each bot rolls
                     its own class) | even (round-robin SHIP_CLASS_IDS across
                     bots AND captains, offset by match index, so per-class win
                     share measures BALANCE rather than representation). Within
                     one match the per-class spread is at most 1; campaign
                     totals are exactly even when either --matches or --bots is
                     a multiple of 3, and otherwise even to within one hull per
                     class
  --set key=value    CONFIG override, repeatable. Tunable dials ONLY:
                     xp.*, offer.size, match.fillTo, map.baseRadius,
                     zone.* (phased shape: beatMs, ringRadii.N — the ring
                     ladder in world units, terminal last — offsetCap,
                     stormDps.N — the damage ramp by close, hp/s, last =
                     fully closed; bare zone.stormDps=X flattens every rung),
                     terrain.* (TERRAIN_PARAMS: coverTarget / coverMin /
                     coverMax as fractions in (0,1), regionWavelength —
                     which FOLLOWS a map.baseRadius override unless set)
  --spawn-rings SPEC harness spawn layout: comma list of slots@fraction of
                     the map radius, e.g. 12@0.8,8@0.4 (outer 12, inner 8).
                     Default: the shipped single ring of playerCap slots
  --sweep key=v1,v2  run the full batch per value and compare side-by-side
                     (repeatable; repeats form a cartesian variant grid)
  --tune key=value   EQUIPMENT CONFIG override, repeatable. Combat dials only:
                     gun.*, machineGun.*, flak.*, broadside.*, torpedo.*,
                     mine.*, starShells.*, boost.*, instantReload.*,
                     damageCut.*, shipClasses.*, offer.weighting.*.
                     Requires
                     HC_BALANCE=1 as well as HC_DEV_OPTIONS=1 — this edits
                     combat numbers, not harness dials. Not sweepable (one
                     labelled arm per candidate)
  --control NAME     scripted captain control: pacifist (default, and the only
                     one) — sails the storm ring rhythm, spends its levels, and
                     never targets or fires. Lethal AI is a BOT (--bots), which
                     earns its information through perception.observe()
  --bot-profile NAME force every bot onto a TEST-ONLY profile (blind-vacuum
                     rig): one of ${TEST_PROFILE_IDS.join(' | ')},
                     or '${BOT_PROFILE_SCHEME}' to deal all three round-robin (TB, BS, ML).
                     In-game profile ids are refused — test rows are a separate
                     id space and cannot reach a real Solo vs AI lobby
  --bot-engage MODE  'always' (default) or 'endgame': under 'endgame' bots hold
                     the ring rhythm and never fire until the terminal ring is
                     reached, then fight normally
  --bot-spend MODE   'profile' (default; the shipped weighted boon policy) or
                     'random': rolled in-game profiles keep their temperament
                     but pick cards uniformly at random (tuned-profile
                     instance of the randomized-pick measurement design), or
                     'gun': take the mounted gun's ladder card whenever the
                     hand deals it, else the weighted policy (reaches tier V)
  --bot-hull CLASS   force every rolled-path bot onto one hull
                     (${SHIP_CLASS_IDS.join(' | ')}); personalities still roll
                     among all six, as on any hull. Mono-class arms with tuned
                     temperaments. Not valid with --bot-profile or --roster even
  --gun GUN          force every bot's deck gun (${GUN_IDS.join(' | ')}).
                     Without it each bot mounts a seeded uniform gun off the
                     match seed — production's rule (amendment 109). Needs --bots
  --raw              include raw per-match bot rows (builds, pick timing,
                     offers seen, placement) in the --json envelope
  --json PATH        also write the machine-readable report to PATH
  --quiet            suppress stderr progress lines
  --help             print this and exit`;

function defaults(): CliOptions {
  return {
    matches: 100,
    seed: 1,
    captains: 3,
    bots: 0,
    control: 'pacifist',
    botProfile: null,
    botEngage: 'always',
    botSpend: 'profile',
    botHull: null,
    botGun: null,
    set: {},
    spawnRings: null,
    tune: {},
    roster: 'rolled',
    sweeps: [],
    raw: false,
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

/** `key=value` for --tune: EQUIPMENT dial key, finite numeric value. The
 *  mirror of parseSet against the separately-gated tune surface — never
 *  sweepable, so there is no --sweep sibling. */
function parseTune(opts: CliOptions, raw: string): void {
  const eq = raw.indexOf('=');
  if (eq <= 0) throw new UsageError(`--tune: expected key=value, got '${raw}'`);
  const key = raw.slice(0, eq);
  validateTuneKey(key); // throws TunableError outside the equipment families
  // A REPEATED KEY IS A FABRICATED ARM, exactly as parseSweep has it: the later
  // value silently last-wins, so `--tune gun.damage=20 --tune gun.damage=30`
  // runs one sim while the operator believes they asked for two values. The
  // sweep guard exists for that reason and this is the same failure.
  if (Object.hasOwn(opts.tune, key)) throw new UsageError(`duplicate tune key: ${key}`);
  const value = parseNumber(raw.slice(eq + 1), `--tune ${key}`);
  validateTuneValue(key, value); // reload/cooldown floor (see overrides)
  opts.tune[key] = value;
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

/** One `slots@fraction` ring of a --spawn-rings spec. */
function parseSpawnRing(part: string): { slots: number; fraction: number } {
  const m = /^(\d+)@(\d*\.?\d+)$/.exec(part);
  if (m === null) throw new UsageError(`--spawn-rings: expected slots@fraction[,...], got '${part}'`);
  const slots = Number(m[1]);
  const fraction = Number(m[2]);
  if (slots < 1) throw new UsageError(`--spawn-rings: a ring needs >= 1 slot, got '${part}'`);
  if (!(fraction > 0 && fraction <= 1)) throw new UsageError(`--spawn-rings: fraction must be in (0, 1], got '${part}'`);
  return { slots, fraction };
}

const VALUE_FLAGS: Record<string, ValueHandler> = {
  '--matches': (o, v) => void (o.matches = parseCount(v, '--matches', 1)),
  '--seed': (o, v) => void (o.seed = toUint32Seed(parseCount(v, '--seed', 0))),
  '--captains': (o, v) => void (o.captains = parseCount(v, '--captains', 0)),
  '--bots': (o, v) => void (o.bots = parseCount(v, '--bots', 0)),
  // Validated against the real registry at parse time so a typo fails fast
  // with the legal names instead of silently running the default control.
  '--control': (o, v) => {
    if (!Object.hasOwn(CONTROL_REGISTRY, v)) {
      throw new UsageError(`--control: unknown control '${v}' (available: ${Object.keys(CONTROL_REGISTRY).sort().join(', ')})`);
    }
    o.control = v;
  },
  '--bot-profile': (o, v) => {
    if (v !== BOT_PROFILE_SCHEME && !TEST_PROFILE_IDS.includes(v as (typeof TEST_PROFILE_IDS)[number])) {
      const legal = [BOT_PROFILE_SCHEME, ...TEST_PROFILE_IDS].join(', ');
      const inGame = Object.hasOwn(BOT_PROFILES, v)
        ? ` ('${v}' is an IN-GAME profile — the harness may only force the test-only rows)`
        : '';
      throw new UsageError(`--bot-profile: unknown test profile '${v}'${inGame} (available: ${legal})`);
    }
    o.botProfile = v;
  },
  '--bot-engage': (o, v) => {
    if (v !== 'always' && v !== 'endgame') {
      throw new UsageError(`--bot-engage: expected 'always' or 'endgame', got '${v}'`);
    }
    o.botEngage = v;
  },
  '--bot-spend': (o, v) => {
    if (v !== 'profile' && v !== 'random' && v !== 'gun') {
      throw new UsageError(`--bot-spend: expected 'profile', 'random' or 'gun', got '${v}'`);
    }
    o.botSpend = v;
  },
  '--bot-hull': (o, v) => {
    if (!SHIP_CLASS_IDS.includes(v as ShipClassId)) {
      throw new UsageError(`--bot-hull: unknown class '${v}' (available: ${SHIP_CLASS_IDS.join(', ')})`);
    }
    o.botHull = v as ShipClassId;
  },
  '--gun': (o, v) => {
    if (!isGunId(v)) throw new UsageError(`--gun: unknown gun '${v}' (available: ${GUN_IDS.join(', ')})`);
    o.botGun = v;
  },
  '--set': parseSet,
  '--sweep': parseSweep,
  '--tune': parseTune,
  '--spawn-rings': (o, v) => {
    o.spawnRings = v.split(',').map((part) => parseSpawnRing(part.trim()));
  },
  '--roster': (o, v) => {
    if (v !== 'even' && v !== 'rolled') {
      throw new UsageError(`--roster: expected 'even' or 'rolled', got '${v}'`);
    }
    o.roster = v;
  },
  // A dropped path (`--json --quiet`) would otherwise write the report to a
  // file literally named '--quiet' and swallow the flag.
  '--json': (o, v) => {
    if (v.startsWith('--')) throw new UsageError(`--json requires a path, got '${v}'`);
    o.json = v;
  },
};

const BOOL_FLAGS: Record<string, (opts: CliOptions) => void> = {
  '--raw': (o) => void (o.raw = true),
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
  assertCoherent(opts);
  return opts;
}

/** Post-loop coherence checks — the flags parse, but the COMBINATION cannot
 *  produce evidence. Lives here, where CliOptions is fully known and the module
 *  is still pure over argv (no process.env), so every refusal is a usage error
 *  (exit 2) rather than a structural one. */
function assertCoherent(opts: CliOptions): void {
  // An EMPTY LOBBY is a run key that can never produce evidence: with no
  // captains and no bots the match activates on its first tick against nothing
  // and every row reads zero.
  if (opts.captains + opts.bots === 0) {
    throw new UsageError('--captains 0 needs --bots N: a lobby needs at least one participant');
  }
  // A forced profile with no bots is a run key that silently measures nothing.
  if (opts.botProfile !== null && opts.bots === 0) {
    throw new UsageError('--bot-profile needs --bots N: there is no bot to force it onto');
  }
  assertBotFlagsCoherent(opts);
  assertRawCoherent(opts);
}

/** The tuned-profile measurement flags (balance campaign, 2026-08-24): both
 *  need bots to act on, --bot-hull contradicts a forced test profile (the
 *  profile governs the hull — buildBotLobby would silently ignore the hull),
 *  and it contradicts --roster even (one hull for all IS the roster). Each
 *  refusal closes a run key that would silently measure something other than
 *  what the operator asked for. */
function assertBotFlagsCoherent(opts: CliOptions): void {
  if (opts.botSpend !== 'profile' && opts.bots === 0) {
    throw new UsageError('--bot-spend needs --bots N: there is no bot to apply it to');
  }
  if (opts.botGun !== null && opts.bots === 0) {
    throw new UsageError('--gun needs --bots N: there is no bot to mount it on');
  }
  if (opts.botHull === null) return;
  if (opts.bots === 0) throw new UsageError('--bot-hull needs --bots N: there is no bot to force it onto');
  if (opts.botProfile !== null) {
    throw new UsageError('--bot-hull conflicts with --bot-profile: a forced test profile governs the hull');
  }
  if (opts.roster === 'even') {
    throw new UsageError('--bot-hull conflicts with --roster even: one forced hull IS the roster');
  }
}

/** RAW ROWS ARE BOT ROWS: a lobby with no bots emits none, which is a run key
 *  that silently measures nothing — the same false-evidence class
 *  assertCoherent's other refusals close. */
function assertRawCoherent(opts: CliOptions): void {
  if (opts.raw && opts.bots === 0) {
    throw new UsageError('--raw needs a bot lobby (--bots N): raw rows are per-bot rows');
  }
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
