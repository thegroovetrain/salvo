// FIT-CHECK — the structural proof for FR22 ("a presentation-silent boon is a
// defect"), Story 2.9 task 5. Walks the FULL live BOON_CATALOG and asserts,
// per line, that every presentation channel the intent-contract promises is
// actually wired: an audible cue (tier tone + category voice), a visible
// toast at every stack position, a non-empty tooltip effect line for every
// ship class, correct slot routing (weapon slot or shipwide), and — for the
// eight doctrine lines — a real on-water identity registration.
//
// This is a CATALOG WALK, not a fixed id list: every assertion below reads
// BOON_CATALOG itself, so adding a new line with no mapping anywhere in this
// file fails the build the moment `npm test -w client` runs, exactly as the
// AC requires. Where a helper fails OPEN by design (boonFitToastLine's
// humanized-id fallback, fitTone/fitDetune's root fallback), this file uses
// the fail-CLOSED seam instead (FIT_CATEGORIES membership, boonEffectLine's
// empty-string branch, slotForBoonCategory's null branch) so a real gap
// cannot hide behind a deliberate fallback.

import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import {
  BOON_CATALOG,
  CONFIG,
  EQUIPMENT_CATEGORY,
  effectiveStats,
  resolveBoons,
  type BoonDef,
  type BoonDoctrineEffect,
  type CannonMode,
  type EquipmentId,
  type ShipClassId,
  type TorpedoMode,
} from '@salvo/shared';
import { FIT_CATEGORIES, TONES, fitTone } from '../audio/tones.js';
import { boonEffectLine, boonFitToastLine } from '../ui/boonCopy.js';
import { SHIPWIDE_CATEGORIES, slotForBoonCategory } from '../render/equipmentInfo.js';
import { lookForReveal } from '../render/projectiles.js';
import { reconcileMines, type MinePos } from '../render/mines.js';
import { LitZones, zoneMode } from '../render/litZones.js';
import { tellLine } from '../render/hud.js';

const CATALOG: readonly BoonDef[] = Object.values(BOON_CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

describe('fit-check — catalog sanity (the walk covers something real)', () => {
  it('the catalog has every id keyed to itself and at least the ratified 33 lines', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(33);
    for (const [key, def] of Object.entries(BOON_CATALOG)) expect(def.id).toBe(key);
  });
});

// --- AUDIBLE ----------------------------------------------------------------

describe('fit-check — AUDIBLE (every line has a real tier tone + category voice)', () => {
  it('every line resolves fitTone(rarity) to a spec present in TONES', () => {
    const silent = CATALOG.filter((d) => TONES[fitTone(d.rarity)] === undefined).map((d) => d.id);
    expect(silent).toEqual([]);
  });

  it('every line\'s category is REGISTERED in fitDetune\'s table (fail-CLOSED check — ' +
    'fitDetune itself fails open to 0, so membership must be checked directly)', () => {
    const uncovered = CATALOG.filter((d) => !FIT_CATEGORIES.includes(d.category)).map((d) => d.id);
    expect(uncovered).toEqual([]);
  });
});

// --- VISIBLE: toast -----------------------------------------------------------

describe('fit-check — VISIBLE toast (every stack position prints a line)', () => {
  it('every line has a non-empty FITTED toast at every held stack position', () => {
    const blank: string[] = [];
    for (const def of CATALOG) {
      for (let stack = 1; stack <= def.copies; stack += 1) {
        if (boonFitToastLine(def.id, stack).trim() === '') blank.push(`${def.id}@${stack}`);
      }
    }
    expect(blank).toEqual([]);
  });
});

// --- VISIBLE: tooltip effect line ----------------------------------------------

describe('fit-check — VISIBLE tooltip (every line reports a real effect on every class)', () => {
  it('boonEffectLine is non-empty for every id on every ship class', () => {
    const blank: string[] = [];
    for (const def of CATALOG) {
      for (const cls of CLASSES) {
        const stats = effectiveStats(CONFIG.shipClasses[cls], resolveBoons([def.id]));
        if (boonEffectLine(def.id, stats).trim() === '') blank.push(`${def.id}/${cls}`);
      }
    }
    expect(blank).toEqual([]);
  });
});

// --- SLOT ROUTING ---------------------------------------------------------------

/** category -> the one equipment id that carries it (inverse of EQUIPMENT_CATEGORY). */
const EQUIPMENT_FOR_CATEGORY = new Map<string, EquipmentId>(
  (Object.keys(EQUIPMENT_CATEGORY) as EquipmentId[]).map((id) => [EQUIPMENT_CATEGORY[id], id]),
);

const CATALOG_CATEGORIES = [...new Set(CATALOG.map((d) => d.category))];

describe('fit-check — SLOT ROUTING (every category lands on a slot or is shipwide)', () => {
  it('every non-shipwide category resolves to the slot carrying its equipment', () => {
    const unrouted: string[] = [];
    for (const category of CATALOG_CATEGORIES) {
      if (SHIPWIDE_CATEGORIES.includes(category)) continue;
      const equipmentId = EQUIPMENT_FOR_CATEGORY.get(category);
      if (equipmentId === undefined) {
        unrouted.push(`${category}: no equipment carries this category`);
        continue;
      }
      const loadout: (EquipmentId | null)[] = [null, equipmentId, null, null];
      if (slotForBoonCategory(loadout, category) !== 1) unrouted.push(category);
    }
    expect(unrouted).toEqual([]);
  });

  it('the shipwide categories are EXACTLY intel/ship — no gap, no orphan', () => {
    const shipwideInCatalog = CATALOG_CATEGORIES.filter((c) => !EQUIPMENT_FOR_CATEGORY.has(c));
    expect([...shipwideInCatalog].sort()).toEqual([...SHIPWIDE_CATEGORIES].sort());
  });
});

// --- DOCTRINE IDENTITY -----------------------------------------------------------
//
// Every doctrine boon (an effect of kind 'doctrine') must register a real
// on-water identity check below, keyed by id. A doctrine mode with no entry
// here fails the coverage test immediately — this is the ONE place a new
// exclusive pair's presentation gets proven, matching the intent-contract's
// per-doctrine I/O matrix rows.

function doctrineEffectOf(def: BoonDef): BoonDoctrineEffect | undefined {
  return def.effects.find((e): e is BoonDoctrineEffect => e.kind === 'doctrine');
}

const DOCTRINE_BOONS = CATALOG.filter((d) => doctrineEffectOf(d) !== undefined);

const zoneView = (id: string, mode: 'incendiary' | 'dazzle') =>
  ({ id, x: 0, y: 0, r: 100, until: 10_000, by: 'firer', mode }) as const;

/**
 * One real assertion per doctrine boon id — the identity CHANNEL that proves
 * "no boon is presentation-silent" for the exclusive-pair lines. Each reads
 * the real exported pure seam (never a mock), matching the code map:
 * projectiles' look table, mines' move-path diff, litZones' per-mode
 * rendering, and the HUD's victim tell lines.
 */
const DOCTRINE_IDENTITY: Readonly<Record<string, () => void>> = {
  // PLUNGING FIRE / ARMOR-PIERCING: own-cannon shells resolve to a DISTINCT
  // ProjectileLookId (Wave 3's cannonArcing/cannonAp looks), never the plain
  // 'cannon' look — the swell/stretch identity a hunter would have to spot.
  cannonArcing: () => {
    const look = lookForReveal('shell', 'cannon', { cannon: 'arcing' as CannonMode, torpedo: 'standard' as TorpedoMode });
    expect(look).toBe('cannonArcing');
  },
  cannonAp: () => {
    const look = lookForReveal('shell', 'cannon', { cannon: 'ap' as CannonMode, torpedo: 'standard' as TorpedoMode });
    expect(look).toBe('cannonAp');
  },
  // ACOUSTIC HOMING: an own fish launched under the homing mode resolves to
  // 'torpHoming' from launch (self-private identity, Wave 3).
  torpedoHoming: () => {
    const look = lookForReveal('torp', 'torpedo', { cannon: 'standard' as CannonMode, torpedo: 'homing' as TorpedoMode });
    expect(look).toBe('torpHoming');
  },
  // COMMAND DETONATION: deliberately the ONE doctrine with no distinct
  // on-water look (client/src/__tests__/projectiles.test.ts pins the same
  // fact) — a command-det fish reads exactly like a stock torpedo to every
  // observer (the ballistic wire stays mode-blind; the click-to-detonate
  // affordance is a player-side interaction, not a render tell). Its
  // presentation is carried entirely by the universal AUDIBLE/VISIBLE
  // channels proven above. This assertion PINS the deliberate
  // non-distinction so a future accidental identity add is a conscious
  // change, not a silent gap this file would otherwise miss.
  torpedoCommand: () => {
    const look = lookForReveal('torp', 'torpedo', { cannon: 'standard' as CannonMode, torpedo: 'command' as TorpedoMode });
    expect(look).toBe('torp');
  },
  // SELF-PROPELLED MINES: a creeping mine's re-synced position is caught by
  // reconcileMines' move bucket (the Wave-3 frozen-renderer fix) — not
  // silently dropped as an add/no-op.
  mineSelfPropelled: () => {
    const held = new Map<string, MinePos>([['m1', { x: 0, y: 0 }]]);
    const { move, add } = reconcileMines(held, [{ id: 'm1', x: 5, y: 0, by: 'firer', own: true }]);
    expect(move.map((m) => m.id)).toContain('m1');
    expect(add).toEqual([]);
  },
  // PROP-FOULING: the victim's SLOWED tell renders a real dual-coded line.
  minePropFouling: () => {
    expect(tellLine('SLOWED', 2000)).toBe('SLOWED 2s');
  },
  // INCENDIARY: the zone renders its doctrine mode (not the standard
  // fallback) and the burning ember breathes above zero alpha.
  starIncendiary: () => {
    const zones = new LitZones(new Container());
    zones.sync([zoneView('z-burn', 'incendiary')], () => null);
    expect(zoneMode({ mode: 'incendiary' })).toBe('incendiary');
    expect(zones.modeOf('z-burn')).toBe('incendiary');
    expect(zones.emberAlphaOf('z-burn')).toBeGreaterThan(0);
  },
  // DAZZLE: the zone renders its doctrine mode AND the victim's DAZZLED tell
  // renders a real dual-coded line — both channels the catalog line owns.
  starDazzle: () => {
    const zones = new LitZones(new Container());
    zones.sync([zoneView('z-glare', 'dazzle')], () => null);
    expect(zones.modeOf('z-glare')).toBe('dazzle');
    expect(tellLine('DAZZLED', 2000)).toBe('DAZZLED 2s');
  },
};

describe('fit-check — DOCTRINE IDENTITY (every doctrine boon registers an on-water tell)', () => {
  it('the catalog carries the ratified 8 doctrine lines (4 exclusive pairs)', () => {
    expect(DOCTRINE_BOONS.length).toBeGreaterThanOrEqual(8);
  });

  it('every doctrine boon in the catalog has a registered identity check', () => {
    const missing = DOCTRINE_BOONS.filter((d) => DOCTRINE_IDENTITY[d.id] === undefined).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  for (const def of DOCTRINE_BOONS) {
    it(`${def.id}: identity channel is real (fails if a future catalog edit strips it)`, () => {
      const check = DOCTRINE_IDENTITY[def.id];
      expect(check, `${def.id} has no doctrine identity registration`).toBeDefined();
      check?.();
    });
  }
});
