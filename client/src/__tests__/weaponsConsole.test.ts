// THE WEAPONS CONSOLE (Story 10.10, R17 / R18 / R23 / R24; plan O4 / O5 / O7, F2 / F4) — the Pixi
// painter instantiated under jsdom and read back: what it shows for a row
// model (texts, marks, colours) and what a press on its rects routes to.
// Contracts, not pins: the models are hand-built so each rule is exercised in
// isolation; geometry comes from the W1 spine, never from a px literal here.

import { describe, it, expect } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, SLOT_FAMILIES, effectiveStats, familyMembers, FAMILY_SLOT, type EquipmentId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { consoleLayout, rowSlot, WEAPON_ROW_KINDS, type WeaponRowKind } from '../render/console/layout.js';
import { monoTextWidth } from '../util/monoMeasure.js';
import { EQUIPMENT_NAME } from '../render/equipmentInfo.js';
import { romanTier } from '../ui/tierRamp.js';
import {
  ROW_STATE_WORD,
  ROW_KEY_GLYPH,
  consoleReadouts,
  weaponRowModels,
  type AbilityModel,
  type MountClock,
  type PreviewMark,
  type Readout,
  type WeaponRowModel,
} from '../render/console/readouts.js';
import {
  WeaponsConsole,
  consoleChipWidth,
  extraMarks,
  floorScale,
  markedValue,
  statLines,
  type WeaponsConsoleLayout,
  type WeaponsConsoleView,
} from '../render/console/weaponsConsole.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const PIP = K.cell.rackPip;
const CLOCK_R = K.cell.clock / 2;

const KEYS: Record<WeaponRowKind, string> = { mainBattery: 'LMB', secondaries: 'RMB', torpedo: 'Q', mines: 'E', special: 'R' };
const NAMES: Record<WeaponRowKind, string> = { mainBattery: 'MAIN BATTERY', secondaries: 'SECONDARIES', torpedo: 'HEAVY TORPEDO', mines: 'NAVAL MINES', special: 'STAR SHELLS' };

const READY: MountClock = { group: 0, ready: true, progress: 1, msLeft: 0, numeral: '' };
const cooling = (numeral: string, progress = 0.5, group = 0): MountClock => ({ group, ready: false, progress, msLeft: 4000, numeral });
const stat = (kind: WeaponRowKind, field: string, label: string, value: string, raw: number): Readout =>
  ({ key: `row.${kind}.${field}`, label, value, raw, role: 'stat' });

function row(kind: WeaponRowKind, over: Partial<WeaponRowModel> = {}): WeaponRowModel {
  return {
    kind, slot: rowSlot(kind), id: null, name: NAMES[kind], emptyGlyph: null, state: 'ready', stateWord: 'READY',
    readied: false, tier: 1, tierNumeral: 'I', keyGlyph: KEYS[kind], clocks: [READY], racks: [], heat: null, stats: [],
    ...over,
  };
}

function ability(kind: AbilityModel['kind'], over: Partial<AbilityModel> = {}): AbilityModel {
  return { kind, keyGlyph: kind === 'repair' ? 'C' : kind === 'smoke' ? 'V' : 'Shift', name: kind.toUpperCase(), state: 'ready', stateWord: 'READY', msLeft: 0, numeral: '', progress: 1, tier: 0, ...over };
}

function baseRows(): WeaponRowModel[] {
  return WEAPON_ROW_KINDS.map((k) => (k === 'secondaries' ? row(k, { clocks: [], heat: { heat: 0.3, locked: false }, tier: 0, tierNumeral: '' }) : row(k)));
}

function view(over: Partial<WeaponsConsoleView> = {}): WeaponsConsoleView {
  return {
    rows: baseRows(),
    abilities: [ability('repair'), ability('smoke'), ability('shift')],
    preview: null, nowSec: 0, nowMs: 0, motion: 'full', uiScale: 1,
    denied: { rows: [false, false, false, false, false], abilities: [false, false, false] },
    dim: false,
    ...over,
  };
}

function withRow(i: number, r: WeaponRowModel): WeaponRowModel[] {
  const rows = baseRows();
  rows[i] = r;
  return rows;
}

const LAYOUT = ((): WeaponsConsoleLayout => {
  const l = consoleLayout(1920, 1080);
  return { ...l.weapons, abilities: l.abilities };
})();

interface Op { action: string; color: number; alpha: number; rects: number[][]; circles: number[][] }

function opsOf(g: Graphics): Op[] {
  const raw = g.context.instructions as { action: string; data: { style?: { color?: number; alpha?: number }; path?: { instructions: { action: string; data: unknown[] }[] } } }[];
  return raw.map((ins) => {
    const path = ins.data.path?.instructions ?? [];
    return {
      action: ins.action,
      color: ins.data.style?.color ?? -1,
      alpha: ins.data.style?.alpha ?? -1,
      rects: path.filter((q) => q.action === 'rect').map((q) => (q.data as number[]).slice(0, 4)),
      circles: path.filter((q) => q.action === 'circle').map((q) => (q.data as number[]).slice(0, 3)),
    };
  });
}

function paint(v: WeaponsConsoleView) {
  const layer = new Container();
  const console = new WeaponsConsole(layer);
  console.update(v, LAYOUT);
  const root = layer.children[0] as Container;
  const bed = opsOf(root.children[0] as Graphics);
  const ops = opsOf(root.children[2] as Graphics);
  const texts = root.children.filter((c): c is Text => c instanceof Text && c.visible && c.text !== '');
  const inRow = (i: number) => {
    const r = LAYOUT.rows[i];
    return texts.filter((t) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y < r.y + r.h);
  };
  return { console, root, bed, ops, texts, inRow, words: texts.map((t) => t.text) };
}

const fillOf = (t: Text): number => t.style.fill as number;

describe('the five cells, each with its key chip, on one bed', () => {
  it('draws every weapon in its own cell with LMB / RMB / Q / E / R', () => {
    const p = paint(view());
    WEAPON_ROW_KINDS.forEach((kind, i) => {
      const words = p.inRow(i).map((t) => t.text);
      expect(words).toContain(NAMES[kind]);
      expect(words).toContain(KEYS[kind]);
    });
  });

  it('draws the dark-glass bed (R24) over the layout`s bed rect, beneath the linework', () => {
    const p = paint(view());
    const b = LAYOUT.bed;
    const fills = p.bed.filter((o) => o.action === 'fill' && o.color === C.cardScrim).flatMap((o) => o.rects);
    expect(fills).toContainEqual([b.x, b.y, b.w, b.h]);
  });

  it('three ability buttons carry their key chips C / V / Shift', () => {
    const words = paint(view()).words;
    for (const k of ['C', 'V', 'Shift']) expect(words).toContain(k);
  });
});

describe('the per-mount clocks', () => {
  it('a cooling turret prints its seconds numeral; a ready one prints none and is a solid disc', () => {
    const mb = row('mainBattery', { clocks: [cooling('7'), READY] });
    const p = paint(view({ rows: withRow(0, mb) }));
    const numerals = p.inRow(0).filter((t) => /^\d/.test(t.text));
    expect(numerals.map((t) => t.text)).toEqual(['7']);
    const discs = p.ops.filter((o) => o.action === 'fill' && o.color === C.phosphor).flatMap((o) => o.circles);
    const rowRect = LAYOUT.rows[0];
    expect(discs.filter((c) => c[0] > rowRect.x && c[0] < rowRect.x + rowRect.w && c[1] > rowRect.y && c[1] < rowRect.y + rowRect.h && c[2] === CLOCK_R)).toHaveLength(1);
  });
});

describe('the mines row: one ring per rack + its held-mine pips', () => {
  it('two captive racks draw 2 × 2 pips, filled per held mine', () => {
    const mines = row('mines', { clocks: [READY, cooling('3')], racks: [{ rack: 0, held: 2, capacity: 2 }, { rack: 1, held: 1, capacity: 2 }] });
    const p = paint(view({ rows: withRow(3, mines) }));
    const isPip = (r: number[]) => r[2] === PIP.w && r[3] === PIP.h;
    const filled = p.ops.filter((o) => o.action === 'fill').flatMap((o) => o.rects).filter(isPip);
    const hollow = p.ops.filter((o) => o.action === 'stroke').flatMap((o) => o.rects).filter(isPip);
    expect(filled).toHaveLength(3);
    expect(hollow).toHaveLength(1);
  });
});

describe('the secondaries row', () => {
  it('LOCKED prints the denied state word and hatches the heat fill in denied red', () => {
    const sec = row('secondaries', { clocks: [], state: 'locked', stateWord: 'LOCKED', heat: { heat: 0.8, locked: true }, tier: 0, tierNumeral: '' });
    const p = paint(view({ rows: withRow(1, sec) }));
    const word = p.inRow(1).find((t) => t.text === 'LOCKED');
    expect(word).toBeDefined();
    expect(fillOf(word!)).toBe(C.denied);
    const deniedStrokes = p.ops.filter((o) => o.action === 'stroke' && o.color === C.denied);
    // the row outline, the bar outline and the hatch run
    expect(deniedStrokes.length).toBeGreaterThanOrEqual(3);
  });

  it('cool secondaries fill the heat bar in phosphor, no hatch', () => {
    const p = paint(view());
    expect(p.ops.some((o) => o.action === 'stroke' && o.color === C.denied)).toBe(false);
  });
});

describe('a READIED torpedo row', () => {
  it('reads ARMED in amber, washes amber and fills its key chip amber', () => {
    const q = row('torpedo', { state: 'readied', stateWord: 'ARMED', readied: true });
    const p = paint(view({ rows: withRow(2, q) }));
    const armed = p.inRow(2).find((t) => t.text === 'ARMED');
    expect(fillOf(armed!)).toBe(C.amber);
    const chip = p.inRow(2).find((t) => t.text === 'Q')!;
    expect(fillOf(chip)).toBe(C.void);
    const r = LAYOUT.rows[2];
    const amberFills = p.ops.filter((o) => o.action === 'fill' && o.color === C.amber).flatMap((o) => o.rects);
    expect(amberFills.some((x) => x[0] === r.x && x[1] === r.y && x[2] === r.w && x[3] === r.h)).toBe(true);
    expect(amberFills.some((x) => x[2] < r.w && x[1] > r.y)).toBe(true); // the chip
  });

  it('an un-readied row fills nothing amber', () => {
    const p = paint(view());
    expect(p.ops.some((o) => o.action === 'fill' && o.color === C.amber)).toBe(false);
  });
});

describe('the hover preview (R18)', () => {
  const mark = (key: string, value: string, raw: number, from: number | null): PreviewMark =>
    ({ key, value, raw, from, direction: from === null || raw > from ? 'up' : 'down' });

  it('a marked stat prints new▲ in amber in place of its value; unmarked values stay phosphor', () => {
    const q = row('torpedo', { clocks: [READY, READY], stats: [stat('torpedo', 'damage', 'DAMAGE', '250', 250), stat('torpedo', 'speed', 'SPEED', '47.5', 47.5)] });
    const preview = new Map([['row.torpedo.damage', mark('row.torpedo.damage', '300', 300, 250)]]);
    const p = paint(view({ rows: withRow(2, q), preview }));
    const words = p.inRow(2);
    const dmg = words.find((t) => t.text === '300▲');
    expect(dmg).toBeDefined();
    expect(fillOf(dmg!)).toBe(C.amber);
    expect(words.some((t) => t.text === '250')).toBe(false);
    expect(fillOf(words.find((t) => t.text === '47.5')!)).toBe(C.phosphor);
  });

  it('a falling value reads ▼; a marked tier reads I→II amber', () => {
    expect(markedValue('9.5S', mark('k', '8.0S', 8000, 9500)).text).toBe('8.0S▼');
    const preview = new Map([['row.torpedo.tier', mark('row.torpedo.tier', 'II', 2, 1)]]);
    const p = paint(view({ preview }));
    const tier = p.inRow(2).find((t) => t.text === 'I→II');
    expect(fillOf(tier!)).toBe(C.amber);
  });

  it('a marked tube count draws one hollow amber clock beyond the current ones', () => {
    const q = row('torpedo', { clocks: [READY, READY] });
    const preview = new Map([['row.torpedo.tubes', mark('row.torpedo.tubes', '3', 3, 2)]]);
    const amberRings = (v: WeaponsConsoleView) => paint(v).ops.filter((o) => o.action === 'stroke' && o.color === C.amber).flatMap((o) => o.circles);
    expect(amberRings(view({ rows: withRow(2, q) }))).toHaveLength(0);
    const rings = amberRings(view({ rows: withRow(2, q), preview }));
    expect(rings).toHaveLength(1);
    const discs = paint(view({ rows: withRow(2, q), preview })).ops.filter((o) => o.action === 'fill' && o.color === C.phosphor).flatMap((o) => o.circles).filter((c) => Math.abs(c[1] - rings[0][1]) < 1e-9);
    expect(rings[0][0]).toBeGreaterThan(Math.max(...discs.map((c) => c[0])));
  });

  it('extraMarks counts a rise only', () => {
    expect(extraMarks(new Map([['k', mark('k', '4', 4, 2)]]), 'k')).toBe(2);
    expect(extraMarks(new Map([['k', mark('k', '1', 1, 2)]]), 'k')).toBe(0);
    expect(extraMarks(null, 'k')).toBe(0);
  });
});

describe('ONE STAT PER LINE (R23)', () => {
  const r = row('special', { stats: [stat('special', 'damage', 'DAMAGE', '200', 200), stat('special', 'blastRadius', 'BLAST RADIUS', '48', 48), stat('special', 'reloadMs', 'RELOAD', '14.3S', 14300)] });

  it('prints each stat on its own line: the label left, the value right-aligned, never joined', () => {
    expect(statLines(r, null).map((l) => [l.label, l.value])).toEqual(r.stats.map((x) => [x.label, x.value]));
    const p = paint(view({ rows: withRow(4, r) }));
    const cell = LAYOUT.rows[4];
    r.stats.forEach((x, k) => {
      const line = cell.statLines[k];
      const label = p.inRow(4).find((t) => t.text === x.label)!;
      const value = p.inRow(4).find((t) => t.text === x.value)!;
      expect(label.x).toBe(line.x);
      expect(value.anchor.x).toBe(1);
      expect(value.x).toBe(line.x + line.w);
      expect(label.y).toBe(value.y);
      expect(label.y).toBe(line.y + line.h / 2);
    });
    expect(p.words.some((w) => w.includes(' · '))).toBe(false);
  });

  it('draws every readable text at or above the text rule (values 17 / 600, labels 14, chips 12)', () => {
    const p = paint(view({ rows: withRow(4, r) }));
    for (const t of p.texts) expect(t.style.fontSize, t.text).toBeGreaterThanOrEqual(12);
    for (const x of r.stats) {
      const v = p.inRow(4).find((t) => t.text === x.value)!;
      expect(v.style.fontSize).toBeGreaterThanOrEqual(17);
      expect(v.style.fontWeight).toBe('600');
      expect(p.inRow(4).find((t) => t.text === x.label)!.style.fontSize).toBeGreaterThanOrEqual(14);
    }
    expect(p.inRow(4).find((t) => t.text === NAMES.special)!.style.fontSize).toBeGreaterThanOrEqual(14);
  });
});

/** Every family weapon fitted alone in its slot, with its readouts and rows. */
function fittedAlone(): { id: EquipmentId; readouts: Readout[]; rows: WeaponRowModel[] }[] {
  const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], [], CATALOG);
  return SLOT_FAMILIES.flatMap((family) => familyMembers(family).map((id) => {
    const loadout: (EquipmentId | null)[] = [];
    loadout[FAMILY_SLOT[family]] = id;
    const readouts = consoleReadouts({ stats, loadout, cards: [], cls: DEFAULT_CLASS_ID });
    const rows = weaponRowModels({
      stats, cards: [], cls: DEFAULT_CLASS_ID, loadout, ammo: [], turrets: [], launchers: [], racks: [],
      sec: { heat: 0, locked: false }, primedSlot: -1, readouts,
    });
    return { id, readouts, rows };
  }));
}

const SLOTLESS_INPUT = ((): Parameters<typeof weaponRowModels>[0] => {
  const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], [], CATALOG);
  return {
    stats, cards: [], cls: DEFAULT_CLASS_ID, loadout: [], ammo: [], turrets: [], launchers: [], racks: [],
    sec: { heat: 0, locked: false }, primedSlot: -1, readouts: [],
  };
})();

describe('every printable header and stat line FITS its cell at the text rule (the box grows, never the text shrinks)', () => {
  const T = K.type;
  const header = LAYOUT.rows[2].header;
  const line = LAYOUT.rows[2].statLines[0];
  /** The widest hovered tier mark the ramp can print (`II→III`). */
  const widestTier = Math.max(...[1, 2, 3, 4].map((t) => monoTextWidth(`${romanTier(t)}→${romanTier(t + 1)}`, T.tier)));
  /** The state words a FAMILY cell can print (LOCKED is the secondaries' alone). */
  const widestState = Math.max(...(['empty', 'ready', 'cooling', 'readied'] as const).map((st) => monoTextWidth(ROW_STATE_WORD[st], T.state)));

  it('the longest weapon name of each family, its widest state word and a hovered tier, beside its chip', () => {
    // The slotless cells: their own names, every state word, a hovered tier.
    for (const kind of ['mainBattery', 'secondaries'] as const) {
      const name = weaponRowModels(SLOTLESS_INPUT).find((m) => m.kind === kind)!.name;
      const w = monoTextWidth(name, T.name) + Math.max(...Object.values(ROW_STATE_WORD).map((x) => monoTextWidth(x, T.state))) + widestTier + consoleChipWidth(ROW_KEY_GLYPH[kind]) + 3 * K.cell.padX;
      expect(w, kind).toBeLessThanOrEqual(header.w);
    }
    for (const family of SLOT_FAMILIES) {
      const kind = WEAPON_ROW_KINDS.find((k) => rowSlot(k) === FAMILY_SLOT[family])!;
      for (const id of familyMembers(family)) {
        const w = monoTextWidth(EQUIPMENT_NAME[id].toUpperCase(), T.name) + widestState + widestTier + consoleChipWidth(ROW_KEY_GLYPH[kind]) + 3 * K.cell.padX;
        expect(w, id).toBeLessThanOrEqual(header.w);
      }
    }
  });

  it('every stat line a fitted weapon prints — label, gap, hovered value — fits one line', () => {
    for (const { id, readouts } of fittedAlone()) {
      for (const r of readouts.filter((x) => x.role === 'stat')) {
        const w = monoTextWidth(r.label, T.statLabel) + K.cell.padX + monoTextWidth(`${r.value}▲`, T.statValue);
        expect(w, `${id} ${r.key}`).toBeLessThanOrEqual(line.w);
      }
    }
  });

  it('no cell carries more stats than it has lines', () => {
    for (const { id, rows } of fittedAlone()) {
      for (const m of rows) expect(m.stats.length, `${id} ${m.kind}`).toBeLessThanOrEqual(K.cell.statLines);
    }
  });
});

describe('the ability buttons (O5)', () => {
  it('ready prints READY; cooling prints its numeral with a progress hairline instead', () => {
    const p = paint(view({ abilities: [ability('repair', { state: 'cooling', stateWord: '', numeral: '12', progress: 0.4 }), ability('smoke'), ability('shift')] }));
    expect(p.words).toContain('12');
    expect(p.words.filter((w) => w === 'READY').length).toBeGreaterThanOrEqual(2);
    const a = LAYOUT.abilities[0];
    const hair = p.ops.filter((o) => o.action === 'fill' && o.color === C.phosphor).flatMap((o) => o.rects)
      .find((x) => x[0] === a.x && x[1] + x[3] === a.y + a.h);
    expect(hair).toBeDefined();
    expect(hair![2]).toBeCloseTo(a.w * 0.4);
  });

  it('a denied pulse paints the button edge denied red', () => {
    const p = paint(view({ denied: { rows: [false, false, false, false, false], abilities: [false, true, false] } }));
    const v = LAYOUT.abilities[1];
    const edge = p.ops.filter((o) => o.action === 'stroke' && o.color === C.denied).flatMap((o) => o.rects);
    expect(edge.some((x) => x[0] === v.x && x[1] === v.y && x[2] === v.w)).toBe(true);
  });
});

describe('hit-testing by the layout rects', () => {
  const centre = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it('a row returns its slot, a button its ability, the water null; a hidden console routes nothing', () => {
    const { console } = paint(view());
    LAYOUT.rows.forEach((r) => expect(console.hit(centre(r))).toEqual({ kind: 'slot', row: r.kind, slot: rowSlot(r.kind) }));
    LAYOUT.abilities.forEach((a) => expect(console.hit(centre(a))).toEqual({ kind: 'ability', ability: a.kind }));
    expect(console.hit({ x: 10, y: 10 })).toBeNull();
    console.hide();
    expect(console.hit(centre(LAYOUT.rows[0]))).toBeNull();
  });
});

describe('dim', () => {
  it('drops the whole console to the bar’s dim alpha, and back', () => {
    const layer = new Container();
    const c = new WeaponsConsole(layer);
    c.update(view({ dim: true }), LAYOUT);
    expect(layer.children[0].alpha).toBe(CLIENT_CONFIG.console.dimAlpha);
    c.update(view(), LAYOUT);
    expect(layer.children[0].alpha).toBe(1);
  });
});

describe('floorScale — the mono floor under the HUD factor', () => {
  const FLOOR = CLIENT_CONFIG.settings.monoFloorPx;

  it('leaves a register alone wherever it renders at or above the floor', () => {
    expect(floorScale(K.type.keyChip, 1)).toBe(1);
    expect(floorScale(K.type.statValue, K.viewport.min)).toBe(1);
  });

  it('holds a chip ON the floor at the smallest HUD factor × the smallest tier, never above it', () => {
    const f = K.viewport.min * (Math.min(...CLIENT_CONFIG.settings.scaleTiers) / 100);
    expect(K.type.keyChip * f * floorScale(K.type.keyChip, f)).toBeCloseTo(Math.max(FLOOR, K.type.keyChip * f), 9);
  });

  it('fails to 1 on an unreadable factor', () => {
    expect(floorScale(12, Number.NaN)).toBe(1);
    expect(floorScale(12, 0)).toBe(1);
  });
});
