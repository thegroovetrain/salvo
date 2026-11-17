// THE TUNED CATALOG (Eric 2026-11-15: "modify the harness so all weapon stats
// can be played with"). A harness-only seam: one run's private, UNFROZEN copy
// of the shared CATALOG, handed to every World through its existing
// `opts.catalog` injection. The shipped CATALOG stays deep-frozen and is never
// touched (its freeze guards against a cross-match desync; a copy owned by one
// run cannot desync anything — the harness has no client).
//
// WHY A COPY IS NEEDED. Two kinds of per-tier number live in the catalog, not
// in CONFIG, so a CONFIG `--tune` alone cannot reach them:
//
//   1. STEPS DERIVED FROM CONFIG AT MODULE LOAD (sim/catalog.ts): the range
//      step (rangeUAtV − rangeU) / 4, the torpedo run step (runUAtV − runU) / 4,
//      the flash / fouling shell radius step, and the HULL REPAIR / SMOKE
//      per-card amounts. `--tune` mutates CONFIG after that load, so a tuned
//      run used to keep the shipped steps (and `rangeUAtV` / `runUAtV` were
//      refused for it). `deriveSteps` re-derives every one of them from the
//      LIVE (tuned) CONFIG.
//   2. AUTHORED LITERAL STEPS (torpedo speed +2.5, mine blast ×1.1, star lit
//      time +2500 ms, …). `ladder.<line>.<stat>[.<tier>]=<value>` sets them.
//
// THE LADDER KEY. `ladder.<line>.<stat>=v` sets that stat's step on every
// UPGRADE tier of the line (II–V for a weapon, whose Tier I card only fits it;
// every card for a ladder such as `power`). `ladder.<line>.<stat>.<N>=v` sets
// tier N (1–5) alone. `<stat>` is the end of the stat path — `speed`,
// `blastRadius`, `repair.instantHp`; it must name one path in the line. A
// step keeps its operator (an `add` step takes the value as the new add, a
// `mult` step as the new factor, which must be > 0). A tier with no step on
// that path gets a new `add` step — so `ladder.supercavTorpedo.damage=100`
// puts a damage ladder back — provided the path is a real stat
// (BOON_STAT_PATH_SET); for a weapon the path is `equipment.<row>.<stat>`.
//
// ORDER: CONFIG tunes are applied first (overrides.ts), then `deriveSteps`
// reads the tuned CONFIG, then explicit `ladder.*` keys win over anything
// derived.
//
// READ THE ARM, NOT JUST THE KEY: bots score upgrades (ai/spending.ts) and
// estimate a mine's blast (ai/battery.ts) against the SHIPPED catalog. Under
// `--bot-spend random` scoring is unused; the blast estimate only shapes how
// far a bot stands off its own mine.

import { BOON_STAT_PATH_SET, CATALOG, CONFIG, type Catalog } from '@salvo/shared';

export const LADDER_PREFIX = 'ladder.';

/** A catalog stat step, read structurally (the copy is plain JSON). */
interface StatStep {
  kind: 'stat';
  path: string;
  add?: number;
  mult?: number;
}
interface PlainLine {
  kind: string;
  tiers: { kind: string; path?: string; add?: number; mult?: number; equipmentId?: string }[][];
}
type PlainCatalog = Record<string, PlainLine>;

interface LadderKey {
  line: string;
  stat: string;
  tier: number | null; // 1-based, null = every upgrade tier
}

export function isLadderKey(key: string): boolean {
  return key.startsWith(LADDER_PREFIX);
}

/** `ladder.<line>.<stat...>[.<1-5>]` → its parts (no catalog checks). */
function parseLadderKey(key: string): LadderKey | string {
  const parts = key.slice(LADDER_PREFIX.length).split('.');
  const last = parts[parts.length - 1];
  const tier = /^[1-5]$/.test(last) ? Number(last) : null;
  const body = tier === null ? parts : parts.slice(0, -1);
  if (body.length < 2 || body.some((p) => p === '')) {
    return `'${key}': expected ladder.<line>.<stat>[.<tier 1-5>]`;
  }
  return { line: body[0], stat: body.slice(1).join('.'), tier };
}

const statSteps = (tier: PlainLine['tiers'][number]): StatStep[] =>
  tier.filter((e): e is StatStep => e.kind === 'stat' && typeof e.path === 'string');

const matchesStat = (path: string, stat: string): boolean => path === stat || path.endsWith(`.${stat}`);

/** The weapon row a line fits (its Tier I `slotFill`), if it is a weapon. */
function rowOf(line: PlainLine): string | null {
  const fill = line.tiers[0]?.find((e) => e.kind === 'slotFill');
  return fill?.equipmentId ?? null;
}

/** The tiers a ladder key addresses: one tier, or every upgrade tier. */
function targetTiers(line: PlainLine, tier: number | null): number[] {
  if (tier !== null) return [tier - 1];
  const first = rowOf(line) !== null ? 1 : 0; // a weapon's Tier I card only fits it
  return Array.from({ length: line.tiers.length - first }, (_, i) => i + first);
}

interface Resolved {
  path: string;
  op: 'add' | 'mult';
  tiers: number[];
}

/** The line a parsed key names, with its tier in range, or why not. */
function lineFor(cat: PlainCatalog, key: string, parsed: LadderKey): PlainLine | string {
  const line = Object.hasOwn(cat, parsed.line) ? cat[parsed.line] : undefined;
  if (line === undefined) return `'${key}': no catalog line '${parsed.line}'`;
  if (parsed.tier !== null && parsed.tier > line.tiers.length) {
    return `'${key}': line '${parsed.line}' has ${line.tiers.length} tier(s)`;
  }
  return line;
}

/** The one stat path (and its operator) a key's `<stat>` names in a line, or why not. */
function pathFor(line: PlainLine, key: string, parsed: LadderKey): Omit<Resolved, 'tiers'> | string {
  const existing = line.tiers.flatMap(statSteps).filter((s) => matchesStat(s.path, parsed.stat));
  const paths = [...new Set(existing.map((s) => s.path))];
  if (paths.length > 1) return `'${key}': '${parsed.stat}' is ambiguous in '${parsed.line}' (${paths.join(', ')})`;
  const row = rowOf(line);
  const path = paths[0] ?? (row !== null ? `equipment.${row}.${parsed.stat}` : parsed.stat);
  if (!BOON_STAT_PATH_SET.has(path)) return `'${key}': '${path}' is not a stat a card can write`;
  const op = existing.length > 0 && existing.every((s) => s.mult !== undefined) ? 'mult' : 'add';
  return { path, op };
}

/** Resolve a ladder key against a catalog, or say why it cannot be. */
function resolveLadder(cat: PlainCatalog, key: string): Resolved | string {
  const parsed = parseLadderKey(key);
  if (typeof parsed === 'string') return parsed;
  const line = lineFor(cat, key, parsed);
  if (typeof line === 'string') return line;
  const at = pathFor(line, key, parsed);
  if (typeof at === 'string') return at;
  return { ...at, tiers: targetTiers(line, parsed.tier) };
}

/** Why a `ladder.*` key is invalid, or null. Checked against the shipped catalog. */
export function ladderKeyProblem(key: string): string | null {
  const r = resolveLadder(CATALOG as unknown as PlainCatalog, key);
  return typeof r === 'string' ? r : null;
}

/** Why a `ladder.*` value is invalid for its key, or null. */
export function ladderValueProblem(key: string, value: number): string | null {
  if (!Number.isFinite(value)) return `'${key}': value must be finite`;
  const r = resolveLadder(CATALOG as unknown as PlainCatalog, key);
  if (typeof r === 'string') return r;
  if (r.op === 'mult' && value <= 0) return `'${key}': a multiplier step must be > 0`;
  return null;
}

/** Set every existing `add` step on `path` to `value`, across the catalog. */
function setAddSteps(cat: PlainCatalog, path: string, value: number): void {
  for (const line of Object.values(cat)) {
    for (const tier of line.tiers) {
      for (const s of statSteps(tier)) if (s.path === path && s.add !== undefined) s.add = value;
    }
  }
}

const RANGE_BLOCKS = ['gun', 'machineGun', 'flak', 'broadside', 'starShells', 'phosphorShells'] as const;
const RUN_BLOCKS = [
  ['lightTorpedo', 'lightTorpedo'],
  ['torpedo', 'heavyTorpedo'],
  ['supercavTorpedo', 'supercavTorpedo'],
] as const;

/** Re-derive every catalog step sim/catalog.ts reads from CONFIG at load,
 *  from the LIVE CONFIG — the same formulas, so an untuned CONFIG reproduces
 *  the shipped catalog exactly. */
function deriveSteps(cat: PlainCatalog): void {
  for (const b of RANGE_BLOCKS) setAddSteps(cat, `equipment.${b}.rangeU`, (CONFIG[b].rangeUAtV - CONFIG[b].rangeU) / 4);
  for (const [block, row] of RUN_BLOCKS) {
    setAddSteps(cat, `equipment.${row}.runU`, (CONFIG[block].runUAtV - CONFIG[block].runU) / 4);
  }
  setAddSteps(cat, 'equipment.foulingShell.radius', CONFIG.foulingShell.radiusStepPerTier);
  setAddSteps(cat, 'equipment.dazzleShells.radius', CONFIG.flashShells.radiusStepPerTier);
  setAddSteps(cat, 'repair.instantHp', CONFIG.hullRepair.hpPerCard);
  setAddSteps(cat, 'repair.regenHp', CONFIG.hullRepair.hpPerCard);
  setAddSteps(cat, 'repair.reload', CONFIG.hullRepair.reloadPerCard);
  setAddSteps(cat, 'smoke.reload', CONFIG.countermeasure.reloadPerCard);
  setAddSteps(cat, 'smoke.lifeMs', CONFIG.countermeasure.lifeMsPerCard);
}

/** Apply one validated ladder key to the copy. */
function applyLadder(cat: PlainCatalog, key: string, value: number): void {
  const r = resolveLadder(cat, key);
  if (typeof r === 'string') throw new Error(r); // validated at parse time; defense in depth
  const line = cat[(parseLadderKey(key) as LadderKey).line];
  for (const t of r.tiers) {
    const steps = statSteps(line.tiers[t]).filter((s) => s.path === r.path);
    if (steps.length === 0) line.tiers[t].push({ kind: 'stat', path: r.path, [r.op]: value });
    for (const s of steps) s[r.op] = value;
  }
}

/**
 * The catalog one tuned run plays with, built AFTER the CONFIG tunes are
 * applied. `undefined` for an untuned run (the World then uses the shipped
 * CATALOG, so an untuned report is byte-identical to before this seam).
 */
export function buildTunedCatalog(tune: Readonly<Record<string, number>>): Catalog | undefined {
  if (Object.keys(tune).length === 0) return undefined;
  const cat = structuredClone(CATALOG) as unknown as PlainCatalog;
  deriveSteps(cat);
  for (const key of Object.keys(tune).sort()) if (isLadderKey(key)) applyLadder(cat, key, tune[key]);
  return cat as unknown as Catalog;
}
