// THE CONSOLES' VIEW MODEL (Story 10.10, R9 / R17 / R18 / R19; plan O4–O8) —
// pure, no Pixi, no DOM. Every number either console prints comes out of here.
//
//   • `consoleReadouts` — EVERY number on both consoles as `{ key, label,
//     value, raw }`, off one `effectiveStats()` fold. Never re-derived: the
//     numbers are the fold's fields (and the shared rack / ability helpers).
//   • `shownDamage` — R19: a weapon's DAMAGE as shown is its number × today's
//     gate multiplier against an ARMOR-100 hull, E = base − own POWER, floored
//     (integer damage, Eric's rule). Display only; the server, the fold and the
//     wire are untouched.
//   • `previewReadouts` / `hoverPreview` — R18: a hovered offer card re-folds
//     `effectiveStats` WITH the card and marks exactly the keys whose raw
//     number differs, with the direction (amber ▲ / ▼ at the draw).
//   • `weaponRowModel(s)` — the five row-buttons in the ruled order (R17):
//     state word, tier, key chip, one clock per turret / tube / rack / shot,
//     the mines' held-mine pips, the secondaries' heat, the stats line.
//   • `abilityModel(s)` — the three ability buttons C · V · Shift (O5).
//
// The hull / level / helm pure cores live beside this file (hull.ts,
// level.ts, helm.ts) and are re-exported here so a console reads ONE module.
//
// LABELS ARE THE GAME'S OWN WORDS: a weapon row's field labels are read off
// ui/boonCopy.ts `equipmentStatRows` (the stat tables the tooltips print), the
// index words off `indexWord`, ability names off `abilityName` and weapon
// names off `EQUIPMENT_NAME`. The plan's few new words (O13) are the family
// words on an empty row, the two row names and the three state words below.

import {
  CATALOG,
  CONFIG,
  EQUIPMENT_STAT_FIELDS,
  INDEX_IDS,
  abilityCooldownFraction,
  abilityCooldownMs,
  damageMultiplierFor,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  isMineEquipment,
  rackCapacity,
  rackCount,
  slotsWithCards,
  turretMounts,
  type CooldownAbilityId,
  type EffectiveStats,
  type EquipmentId,
  type HullId,
  type IndexBonus,
  type IndexId,
  type LauncherState,
  type RackState,
  type SecondariesHeat,
  type ShiftId,
  type TurretState,
  type WeaponAmmo,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { abilityName, equipmentStatRows, indexWord } from '../../ui/boonCopy.js';
import { romanTier } from '../../ui/tierRamp.js';
import { EQUIPMENT_NAME, lineTier, slotTier } from '../equipmentInfo.js';
import { rowSlot, WEAPON_ROW_KINDS, ABILITY_KINDS, type AbilityKind, type WeaponRowKind } from './layout.js';

export * from './hull.js';
export * from './level.js';
export * from './helm.js';
export type { ConsoleLayout, ConsoleHit, WeaponRowKind, AbilityKind, Rect } from './layout.js';

// --- the readout ---------------------------------------------------------------

/** What a readout IS on the console: a printed stats-line number, a printed
 *  index value, a tier numeral, a count drawn as marks (pips, ladder bars,
 *  clocks), or an ability's cooldown. W2a/W2b key their amber marks by `key`. */
export type ReadoutRole = 'stat' | 'index' | 'held' | 'tier' | 'count' | 'cooldown';

/** ONE console number (O7). `raw` is what the preview compares; `value` is
 *  what is printed; `label` is the game's word for it ('' where the console
 *  prints no label — a count, a tier, an ability's own button). */
export interface Readout {
  key: string;
  label: string;
  value: string;
  raw: number;
  role: ReadoutRole;
}

/** The readout keys, spelled once. */
export const READOUT_KEY = {
  index: (id: IndexId): string => `index.${id}`,
  held: (id: IndexId): string => `index.${id}.held`,
  stat: (kind: WeaponRowKind, field: string): string => `row.${kind}.${field}`,
  tier: (kind: WeaponRowKind): string => `row.${kind}.tier`,
  count: (kind: WeaponRowKind, what: 'tubes' | 'racks' | 'capacity' | 'rounds'): string => `row.${kind}.${what}`,
  cooldown: (kind: 'repair' | 'smoke'): string => `ability.${kind}.cooldown`,
  abilityTier: (kind: 'repair' | 'smoke'): string => `ability.${kind}.tier`,
} as const;

/**
 * Pure: R19 — the DAMAGE a weapon shows, `floor(base × damageMultiplierFor(
 * CONFIG.index.base − power))`: what one hit deals against an ARMOR-100 hull
 * at today's gate. ×1 at POWER = base; a non-finite input fails to the base
 * multiplier the gate itself fails to (×1), never NaN.
 */
export function shownDamage(base: number, power: number): number {
  const m = damageMultiplierFor(CONFIG.index.base - power);
  const v = Math.floor(base * m);
  return Number.isFinite(v) ? v : 0;
}

/** Seconds to one decimal with the console's unit glyph — `9.5S` (O4). */
function secsText(ms: number): string {
  return `${(ms / 1000).toFixed(1)}S`;
}

/** A plain number: whole when whole, else one decimal (`47.5`, `950`). */
function numText(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fieldText(field: string, v: number): string {
  if (field === 'damage') return String(v);
  return /Ms$/.test(field) ? secsText(v) : numText(v);
}

// --- field labels: the stat tables' own words ----------------------------------

/**
 * Pure: the field order `equipmentStatRows` prints for a (non-Shift) weapon —
 * its table less `rangeU`, the derived TRIGGER RADIUS after the blast radius
 * (else the damage) where the row carries one, RANGE last. Aligning this with
 * the printed rows is how each field finds its label without a second word
 * table (the alignment is pinned by console.readouts.test.ts).
 */
export function statRowFields(target: EquipmentId, stats: EffectiveStats): string[] {
  const fields = EQUIPMENT_STAT_FIELDS[target] as readonly string[];
  const row = stats.equipment[target] as unknown as Record<string, unknown>;
  const hasTrigger = typeof row.triggerRadius === 'number' && !fields.includes('triggerRadius');
  const after = fields.includes('blastRadius') ? 'blastRadius' : 'damage';
  const out: string[] = [];
  for (const f of fields) {
    if (f === 'rangeU') continue;
    out.push(f);
    if (hasTrigger && f === after) out.push('triggerRadius');
  }
  if (typeof row.rangeU === 'number') out.push('rangeU');
  return out;
}

const LABEL_CACHE = new Map<EquipmentId, ReadonlyMap<string, string>>();

/** Pure (memoized — the labels are structural): field → the stat table's word. */
function fieldLabels(target: EquipmentId, stats: EffectiveStats): ReadonlyMap<string, string> {
  const hit = LABEL_CACHE.get(target);
  if (hit !== undefined) return hit;
  const rows = equipmentStatRows(target, stats);
  const fields = statRowFields(target, stats);
  const map = new Map<string, string>();
  fields.forEach((f, i) => {
    if (rows[i] !== undefined) map.set(f, rows[i].label);
  });
  LABEL_CACHE.set(target, map);
  return map;
}

// --- which fields a row prints (O4) -------------------------------------------

/** The radius-like fields a mine / special row may print, in preference. */
const RADIUS_FIELDS = ['blastRadius', 'triggerRadius', 'litRadius', 'zoneRadius', 'radius', 'burstRadius'] as const;

function carries(stats: EffectiveStats, target: EquipmentId, field: string): boolean {
  return typeof (stats.equipment[target] as unknown as Record<string, unknown>)[field] === 'number';
}

/**
 * Pure: the fields a weapon row's stats line prints, in order (O4):
 * MAIN BATTERY `DAMAGE · RANGE · RELOAD`; TORPEDO `DAMAGE · SPEED · RELOAD`;
 * MINES `DAMAGE · <its radius> · RELOAD`; SPECIAL the first two of
 * DAMAGE / its radius / RANGE it carries, then RELOAD.
 */
export function rowStatFields(kind: WeaponRowKind, target: EquipmentId, stats: EffectiveStats): string[] {
  // A field prints only if the row carries it AND its stat table names it —
  // the captive mine's fixed 32 u burst rides the row unaddressed and unnamed,
  // so its radius is the derived TRIGGER RADIUS the table does print.
  const labels = fieldLabels(target, stats);
  const has = (f: string): boolean => carries(stats, target, f) && labels.has(f);
  const radius = RADIUS_FIELDS.find(has);
  let head: string[];
  if (kind === 'mainBattery') head = ['damage', 'rangeU'];
  else if (kind === 'torpedo') head = ['damage', 'speed'];
  else if (kind === 'mines') head = radius === undefined ? ['damage'] : ['damage', radius];
  else head = ['damage', radius ?? '', 'rangeU'].filter((f) => f !== '' && has(f)).slice(0, 2);
  return [...head.filter(has), 'reloadMs'];
}

// --- consoleReadouts ------------------------------------------------------------

/** What the readouts are folded from (the own ship; slot-aligned loadout ids). */
export interface ReadoutSource {
  stats: EffectiveStats;
  loadout: readonly (EquipmentId | null)[];
  cards: readonly string[];
  cls: HullId;
}

/** The equipment a weapon row shows, or null (empty Q/E/R; the slotless
 *  secondaries ride the main battery's row for their words). */
export function rowEquipment(kind: WeaponRowKind, loadout: readonly (EquipmentId | null)[]): EquipmentId | null {
  const slot = rowSlot(kind);
  return slot === null ? null : (loadout[slot] ?? null);
}

function indexReadouts(stats: EffectiveStats, cards: readonly string[]): Readout[] {
  const out: Readout[] = [];
  for (const id of INDEX_IDS) {
    const v = stats[id];
    out.push({ key: READOUT_KEY.index(id), label: indexWord(id), value: String(v), raw: v, role: 'index' });
    const held = Math.min(lineTier(cards, id), CLIENT_CONFIG.console.ship.tierBars);
    out.push({ key: READOUT_KEY.held(id), label: '', value: String(held), raw: held, role: 'held' });
  }
  return out;
}

/** Guns per salvo of the hull's main battery (the `27×2` count) — the most any
 *  turret carries (today every hull's turrets agree). */
function gunsPerSalvo(cls: HullId): number {
  return turretMounts(cls).reduce((m, t) => Math.max(m, t.guns), 0);
}

function statReadout(kind: WeaponRowKind, target: EquipmentId, field: string, src: ReadoutSource): Readout {
  const row = src.stats.equipment[target] as unknown as Record<string, number>;
  const label = fieldLabels(target, src.stats).get(field) ?? '';
  const raw = field === 'damage' ? shownDamage(row.damage, src.stats.power) : row[field];
  let value = fieldText(field, raw);
  if (kind === 'mainBattery' && field === 'damage') value = `${value}×${gunsPerSalvo(src.cls)}`;
  return { key: READOUT_KEY.stat(kind, field), label, value, raw, role: 'stat' };
}

function secondariesReadouts(src: ReadoutSource): Readout[] {
  const labels = fieldLabels('mainBattery', src.stats);
  const dmg = shownDamage(CONFIG.secondaries.damage, src.stats.power);
  const reach = src.stats.secondaryRangeU;
  return [
    { key: READOUT_KEY.stat('secondaries', 'damage'), label: labels.get('damage') ?? '', value: String(dmg), raw: dmg, role: 'stat' },
    { key: READOUT_KEY.stat('secondaries', 'rangeU'), label: labels.get('rangeU') ?? '', value: numText(Math.round(reach)), raw: Math.round(reach), role: 'stat' },
  ];
}

function countReadout(kind: WeaponRowKind, what: 'tubes' | 'racks' | 'capacity' | 'rounds', n: number): Readout {
  return { key: READOUT_KEY.count(kind, what), label: '', value: String(n), raw: n, role: 'count' };
}

/** The mount counts a fitted row draws as marks (a SECOND TUBE card adds a clock). */
function countReadouts(kind: WeaponRowKind, id: EquipmentId, stats: EffectiveStats): Readout[] {
  if (kind === 'torpedo') return [countReadout(kind, 'tubes', stats.torpedoLaunchers * stats.tubesPerLauncher)];
  if (kind === 'mines' && isMineEquipment(id)) {
    return [countReadout(kind, 'racks', rackCount(stats)), countReadout(kind, 'capacity', rackCapacity(stats, id))];
  }
  if (kind === 'special') return [countReadout(kind, 'rounds', equipmentMaxAmmo(stats, id))];
  return [];
}

function weaponReadouts(kind: WeaponRowKind, src: ReadoutSource): Readout[] {
  if (kind === 'secondaries') return secondariesReadouts(src);
  const id = rowEquipment(kind, src.loadout);
  if (id === null) return [];
  const out = rowStatFields(kind, id, src.stats).map((f) => statReadout(kind, id, f, src));
  const tier = slotTier(src.stats, src.cards, id);
  if (tier > 0) out.push({ key: READOUT_KEY.tier(kind), label: '', value: romanTier(tier), raw: tier, role: 'tier' });
  return [...out, ...countReadouts(kind, id, src.stats)];
}

function abilityReadouts(stats: EffectiveStats, cards: readonly string[]): Readout[] {
  const out: Readout[] = [];
  for (const kind of ['repair', 'smoke'] as const) {
    const ms = abilityCooldownMs(stats, kind);
    out.push({ key: READOUT_KEY.cooldown(kind), label: '', value: secsText(ms), raw: ms, role: 'cooldown' });
    const tier = lineTier(cards, ABILITY_LINE[kind]);
    out.push({ key: READOUT_KEY.abilityTier(kind), label: '', value: tier > 0 ? romanTier(tier) : '', raw: tier, role: 'tier' });
  }
  return out;
}

/** The card line each cooldown ability's tier counts. */
const ABILITY_LINE: Readonly<Record<CooldownAbilityId, string>> = { repair: 'hullRepair', smoke: 'smokeScreen' };

/** Pure: EVERY console number (O7), in console order: indices, then the five
 *  rows top to bottom, then C / V. */
export function consoleReadouts(src: ReadoutSource): Readout[] {
  return [
    ...indexReadouts(src.stats, src.cards),
    ...WEAPON_ROW_KINDS.flatMap((kind) => weaponReadouts(kind, src)),
    ...abilityReadouts(src.stats, src.cards),
  ];
}

/** The own-ship fields a fold needs (all on `you`). */
export interface ReadoutShip {
  cls: HullId;
  cards: readonly string[];
  ib: IndexBonus;
  shift: ShiftId;
}

/** Pure: fold the own ship (plus an optional hovered card line) and read
 *  every console number — the ONE path both the live consoles and the hover
 *  preview take. Null on an unknown class (fail-open, like the card rows). */
export function shipReadouts(you: ReadoutShip, extraLine?: string): Readout[] | null {
  if (!Object.hasOwn(CONFIG.shipClasses, you.cls)) return null;
  const cards = extraLine === undefined ? you.cards : [...you.cards, extraLine];
  const stats = effectiveStats(CONFIG.shipClasses[you.cls], cards, CATALOG, you.ib);
  const loadout = slotsWithCards(stats, cards, CATALOG, you.shift).map((s) => s.equipmentId);
  return consoleReadouts({ stats, loadout, cards, cls: you.cls });
}

// --- the preview (R18) ----------------------------------------------------------

/** One amber mark: the incoming value and which way it moved. `from` is null
 *  for a number that does not exist yet (a first torpedo card's row). */
export interface PreviewMark {
  key: string;
  value: string;
  raw: number;
  from: number | null;
  direction: 'up' | 'down';
}

export type PreviewMarks = ReadonlyMap<string, PreviewMark>;

/** Pure: mark EXACTLY the keys whose raw differs between the two readout sets
 *  (a key new in `next` counts as a rise from nothing); nothing else. */
export function previewReadouts(current: readonly Readout[], next: readonly Readout[]): PreviewMarks {
  const before = new Map(current.map((r) => [r.key, r.raw]));
  const marks = new Map<string, PreviewMark>();
  for (const r of next) {
    const from = before.has(r.key) ? before.get(r.key)! : null;
    if (from === r.raw) continue;
    const direction = from === null || r.raw > from ? 'up' : 'down';
    marks.set(r.key, { key: r.key, value: r.value, raw: r.raw, from, direction });
  }
  return marks;
}

/** Pure: the marks a hovered card line paints (null: nothing hovered, or an
 *  unknown class). The incoming numbers are a REAL re-fold with the card. */
export function hoverPreview(you: ReadoutShip, line: string | null): PreviewMarks | null {
  if (line === null) return null;
  const cur = shipReadouts(you);
  const next = shipReadouts(you, line);
  return cur === null || next === null ? null : previewReadouts(cur, next);
}

// --- the weapon rows (O4) -----------------------------------------------------

/** The row state the outline is drawn in. */
export type RowState = 'empty' | 'ready' | 'cooling' | 'readied' | 'locked';

/** The state word each state prints ('' = none: the clocks say cooling, an
 *  empty row says nothing). */
export const ROW_STATE_WORD: Readonly<Record<RowState, string>> = {
  empty: '',
  ready: 'READY',
  cooling: '',
  readied: 'ARMED',
  locked: 'LOCKED',
};

/** The key each row and button spells — the keys input binds. */
export const ROW_KEY_GLYPH: Readonly<Record<WeaponRowKind, string>> = {
  mainBattery: 'LMB',
  secondaries: 'RMB',
  torpedo: 'Q',
  mines: 'E',
  special: 'R',
};

/** The two slot-less row names, and the family word an EMPTY Q / E / R row
 *  prints (O13's new strings). */
const ROW_NAME: Readonly<Partial<Record<WeaponRowKind, string>>> = {
  mainBattery: 'MAIN BATTERY',
  secondaries: 'SECONDARIES',
};
const FAMILY_WORD: Readonly<Partial<Record<WeaponRowKind, string>>> = {
  torpedo: 'TORPEDO',
  mines: 'MINES',
  special: 'SPECIAL SHELL',
};

/** The glyph an EMPTY row draws dim (the empty hotbar square's family glyph). */
const FAMILY_GLYPH: Readonly<Partial<Record<WeaponRowKind, EquipmentId>>> = {
  torpedo: 'heavyTorpedo',
  mines: 'navalMines',
  special: 'starShells',
};

/** One per-mount reload ring: `progress` = elapsed 0..1 (1 when ready),
 *  `numeral` = the seconds inside while cooling ('' when ready / idle). */
export interface MountClock {
  group: number;
  ready: boolean;
  progress: number;
  msLeft: number;
  numeral: string;
}

/** One mine rack's held-mine pips (capacity from the shared rack helper). */
export interface RackPips {
  rack: number;
  held: number;
  capacity: number;
}

export interface WeaponRowModel {
  kind: WeaponRowKind;
  /** The loadout slot a press acts on (null for the secondaries). */
  slot: number | null;
  id: EquipmentId | null;
  name: string;
  /** Empty Q / E / R: the family glyph drawn dim; null otherwise. */
  emptyGlyph: EquipmentId | null;
  state: RowState;
  stateWord: string;
  /** Q / E / R armed (the filled amber key chip) — independent of `state`. */
  readied: boolean;
  tier: number;
  tierNumeral: string;
  keyGlyph: string;
  clocks: MountClock[];
  racks: RackPips[];
  /** The secondaries' heat bar; null on every other row. */
  heat: SecondariesHeat | null;
  /** The stats line's readouts, in print order. */
  stats: Readout[];
}

/** Everything the five rows read — the own block + the predicted mounts. */
export interface WeaponsInput {
  stats: EffectiveStats;
  cards: readonly string[];
  cls: HullId;
  loadout: readonly (EquipmentId | null)[];
  ammo: readonly (WeaponAmmo | null)[];
  turrets: readonly TurretState[];
  launchers: readonly LauncherState[];
  racks: readonly RackState[];
  sec: SecondariesHeat;
  primedSlot: number;
  /** This frame's readouts (`consoleReadouts`) — the stats lines' source. */
  readouts: readonly Readout[];
}

/** Pure: a clock's seconds numeral — tenths under `tenthsBelowMs`, whole
 *  seconds rounded UP above it; '' when expired or unreadable (never `0`). */
export function clockNumeral(msLeft: number): string {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return '';
  if (msLeft < CLIENT_CONFIG.console.tenthsBelowMs) return (Math.round(msLeft / 100) / 10).toFixed(1);
  return String(Math.ceil(msLeft / 1000));
}

/** Pure: one ring off a remaining time against the weapon's folded reload. */
export function mountClock(msLeft: number, reloadMs: number, group = 0): MountClock {
  const ready = !(msLeft > 0);
  const progress = ready ? 1 : reloadMs > 0 ? Math.min(1, Math.max(0, 1 - msLeft / reloadMs)) : 0;
  return { group, ready, progress, msLeft: ready ? 0 : msLeft, numeral: ready ? '' : clockNumeral(msLeft) };
}

/** A shot that is neither loaded nor loading (behind the one in the breech). */
const IDLE_CLOCK: MountClock = { group: 0, ready: false, progress: 0, msLeft: 0, numeral: '' };

/** Pure: the special's rounds — `n` loaded, the next one loading, the rest idle. */
function shotClocks(ammo: WeaponAmmo | null, max: number, reloadMs: number): MountClock[] {
  const n = ammo?.n ?? 0;
  return Array.from({ length: Math.max(1, max) }, (_, k) => {
    if (k < n) return mountClock(0, reloadMs);
    return k === n ? mountClock(ammo?.reloadMsLeft ?? 0, reloadMs) : IDLE_CLOCK;
  });
}

/** Pure: a row's clocks — one per turret / tube / rack / special shot. */
export function rowClocks(kind: WeaponRowKind, id: EquipmentId, input: WeaponsInput): MountClock[] {
  const reloadMs = equipmentReloadMs(input.stats, id);
  if (kind === 'mainBattery') return input.turrets.map((t) => mountClock(t.reloadMsLeft, reloadMs));
  if (kind === 'torpedo') return input.launchers.flatMap((l, g) => l.tubes.map((t) => mountClock(t, reloadMs, g)));
  if (kind === 'mines') return input.racks.map((r, g) => mountClock(r.reloadMsLeft, reloadMs, g));
  if (kind === 'special') return shotClocks(input.ammo[rowSlot(kind) ?? -1] ?? null, equipmentMaxAmmo(input.stats, id), reloadMs);
  return [];
}

/** Pure: the mines row's pips — every rack, its held mines, its capacity. */
export function rowRackPips(id: EquipmentId, input: WeaponsInput): RackPips[] {
  if (!isMineEquipment(id)) return [];
  const capacity = rackCapacity(input.stats, id);
  return input.racks.map((r, rack) => ({ rack, held: Math.max(0, Math.min(r.n, capacity)), capacity }));
}

/** Pure: is anything on the row ready to fire now? */
function rowReady(kind: WeaponRowKind, clocks: readonly MountClock[], racks: readonly RackPips[], ammo: WeaponAmmo | null): boolean {
  if (kind === 'mines' && racks.length > 0) return racks.some((r) => r.held > 0);
  if (clocks.length > 0) return clocks.some((c) => c.ready);
  return ammo !== null && ammo.n > 0;
}

function emptyRow(kind: WeaponRowKind): WeaponRowModel {
  return {
    kind, slot: rowSlot(kind), id: null, name: FAMILY_WORD[kind] ?? '', emptyGlyph: FAMILY_GLYPH[kind] ?? null,
    state: 'empty', stateWord: '', readied: false, tier: 0, tierNumeral: '', keyGlyph: ROW_KEY_GLYPH[kind],
    clocks: [], racks: [], heat: null, stats: [],
  };
}

function secondariesRow(input: WeaponsInput): WeaponRowModel {
  const state: RowState = input.sec.locked ? 'locked' : 'ready';
  return {
    kind: 'secondaries', slot: null, id: null, name: ROW_NAME.secondaries ?? '', emptyGlyph: null,
    state, stateWord: ROW_STATE_WORD[state], readied: false, tier: 0, tierNumeral: '', keyGlyph: ROW_KEY_GLYPH.secondaries,
    clocks: [], racks: [], heat: { heat: input.sec.heat, locked: input.sec.locked }, stats: rowStats('secondaries', input.readouts),
  };
}

/** Pure: the stats-line readouts of one row, in print order. */
export function rowStats(kind: WeaponRowKind, readouts: readonly Readout[]): Readout[] {
  const prefix = `row.${kind}.`;
  return readouts.filter((r) => r.role === 'stat' && r.key.startsWith(prefix));
}

/** Pure: one weapon row-button (O4). */
export function weaponRowModel(kind: WeaponRowKind, input: WeaponsInput): WeaponRowModel {
  if (kind === 'secondaries') return secondariesRow(input);
  const id = rowEquipment(kind, input.loadout);
  if (id === null) return emptyRow(kind);
  const slot = rowSlot(kind);
  const clocks = rowClocks(kind, id, input);
  const racks = rowRackPips(id, input);
  const readied = kind !== 'mainBattery' && slot === input.primedSlot;
  const ready = rowReady(kind, clocks, racks, input.ammo[slot ?? -1] ?? null);
  const state: RowState = readied ? 'readied' : ready ? 'ready' : 'cooling';
  const tier = slotTier(input.stats, input.cards, id);
  return {
    kind, slot, id, name: ROW_NAME[kind] ?? EQUIPMENT_NAME[id].toUpperCase(), emptyGlyph: null,
    state, stateWord: ROW_STATE_WORD[state], readied, tier, tierNumeral: tier > 0 ? romanTier(tier) : '',
    keyGlyph: ROW_KEY_GLYPH[kind], clocks, racks, heat: null, stats: rowStats(kind, input.readouts),
  };
}

/** Pure: the five rows, in the ruled order MB · SEC · TORP · MINES · SPECIAL. */
export function weaponRowModels(input: WeaponsInput): WeaponRowModel[] {
  return WEAPON_ROW_KINDS.map((kind) => weaponRowModel(kind, input));
}

// --- the ability buttons (O5) ---------------------------------------------------

export type AbilityState = 'ready' | 'cooling' | 'active';

export interface AbilityModel {
  kind: AbilityKind;
  keyGlyph: string;
  name: string;
  state: AbilityState;
  stateWord: string;
  /** Cooling: ms to ready; ACTIVE: ms of the running window; 0 when ready. */
  msLeft: number;
  numeral: string;
  /** The progress hairline: elapsed 0..1 of the cooldown (1 when ready). */
  progress: number;
  /** Cards held on the ability's line (C / V); 0 for the Shift. */
  tier: number;
}

/** What the three buttons read. Stamps are the server's, read against the
 *  server-clock estimate; the Shift's pool rides slot 1 of `ammo`. */
export interface AbilitiesInput {
  stats: EffectiveStats;
  cards: readonly string[];
  shift: ShiftId;
  nowMs: number | undefined;
  repairReadyAt: number | undefined;
  smokeReadyAt: number | undefined;
  shiftAmmo: WeaponAmmo | null;
  /** Remaining ms of the running Shift window (boost / hunker), 0 = none. */
  shiftActiveMsLeft: number;
}

/** The key each ability button spells. */
export const ABILITY_KEY_GLYPH: Readonly<Record<AbilityKind, string>> = { repair: 'C', smoke: 'V', shift: 'Shift' };

/** Pure: a cooldown ability's remaining ms and elapsed fraction at `nowMs` —
 *  the shared `abilityCooldownFraction` law; an unreadable clock reads cooling
 *  with no numeral (Infinity), the ms left never exceeds the whole cooldown. */
export function cooldownState(
  id: CooldownAbilityId,
  stats: EffectiveStats,
  nowMs: number | undefined,
  readyAt: number | undefined,
): { msLeft: number; progress: number } {
  if (nowMs === undefined || readyAt === undefined) return { msLeft: 0, progress: 1 };
  const remaining = abilityCooldownFraction(nowMs, readyAt, stats, id);
  if (remaining <= 0) return { msLeft: 0, progress: 1 };
  const left = readyAt - nowMs;
  const msLeft = Number.isNaN(left) ? Infinity : Math.min(abilityCooldownMs(stats, id), left);
  return { msLeft, progress: 1 - remaining };
}

function abilityFace(kind: AbilityKind, name: string, state: AbilityState, msLeft: number, progress: number, tier: number): AbilityModel {
  return {
    kind, keyGlyph: ABILITY_KEY_GLYPH[kind], name, state, stateWord: state === 'ready' ? ROW_STATE_WORD.ready : '',
    msLeft, numeral: state === 'ready' ? '' : clockNumeral(msLeft), progress, tier,
  };
}

function shiftModel(input: AbilitiesInput): AbilityModel {
  const name = EQUIPMENT_NAME[input.shift].toUpperCase();
  if (input.shiftActiveMsLeft > 0) return abilityFace('shift', name, 'active', input.shiftActiveMsLeft, 1, 0);
  const a = input.shiftAmmo;
  if (a === null || a.n > 0 || !(a.reloadMsLeft > 0)) return abilityFace('shift', name, 'ready', 0, 1, 0);
  const clock = mountClock(a.reloadMsLeft, equipmentReloadMs(input.stats, input.shift));
  return abilityFace('shift', name, 'cooling', clock.msLeft, clock.progress, 0);
}

/** Pure: one ability button (O5). */
export function abilityModel(kind: AbilityKind, input: AbilitiesInput): AbilityModel {
  if (kind === 'shift') return shiftModel(input);
  const cd = cooldownState(kind, input.stats, input.nowMs, kind === 'repair' ? input.repairReadyAt : input.smokeReadyAt);
  const tier = lineTier(input.cards, ABILITY_LINE[kind]);
  return abilityFace(kind, abilityName(kind).toUpperCase(), cd.msLeft > 0 ? 'cooling' : 'ready', cd.msLeft, cd.progress, tier);
}

/** Pure: the three buttons, C · V · Shift. */
export function abilityModels(input: AbilitiesInput): AbilityModel[] {
  return ABILITY_KINDS.map((kind) => abilityModel(kind, input));
}
