// FIT-CHECK — the structural proof for FR22 ("a presentation-silent boon is a
// defect"), Story 2.9 task 5. Walks the FULL live BOON_CATALOG and asserts,
// per line, that every presentation channel the intent-contract promises is
// actually wired: an audible cue (tier tone + category voice), a visible
// toast at every stack position, a non-empty tooltip effect line for every
// ship class, correct slot routing (weapon slot or shipwide), and — for the
// seven doctrine lines — a real on-water identity registration.
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
  type EquipmentId,
  type ShipClassId,
} from '@salvo/shared';
import { FIT_CATEGORIES, TONES, fitTone } from '../audio/tones.js';
import { boonEffectLine, boonFitToastLine } from '../ui/boonCopy.js';
import { SHIPWIDE_CATEGORIES, slotForBoonCategory } from '../render/equipmentInfo.js';
import { lookForReveal } from '../render/projectiles.js';
import { ownMineRings, reconcileMines } from '../render/mines.js';
import { LitZones, zoneVerbs } from '../render/litZones.js';
import { tellLine } from '../render/hud.js';

const CATALOG: readonly BoonDef[] = Object.values(BOON_CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

describe('fit-check — catalog sanity (the walk covers something real)', () => {
  // Story 7-5 wave 1 SHRANK the catalog: 33 → 28 lines (seven deleted, two
  // added when `boostMax` split into BOOST DURATION + BOOST SPEED).
  it('the catalog has every id keyed to itself and at least the ratified 28 lines', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(28);
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

/** A lit-zone wire view carrying an arbitrary set of VERB FLAGS (Story 7-5
 *  wave 1 — `phos` and `daz` are independent and may both be present). */
const zoneView = (id: string, verbs: { phos?: true; daz?: true }) =>
  ({ id, x: 0, y: 0, r: 100, until: 10_000, by: 'firer', ...verbs }) as const;

/**
 * One real assertion per doctrine boon id — the identity CHANNEL that proves
 * "no boon is presentation-silent" for the exclusive-pair lines. Each reads
 * the real exported pure seam (never a mock), matching the code map:
 * projectiles' look table, mines' move-path diff, litZones' per-mode
 * rendering, and the HUD's victim tell lines.
 */
const DOCTRINE_IDENTITY: Readonly<Record<string, () => void>> = {
  // ACOUSTIC HOMING: an own fish launched under the homing verb resolves to
  // 'torpHoming' from launch (self-private identity, Wave 3).
  torpedoHoming: () => {
    const look = lookForReveal('torp', 'torpedo', { torpedoHoming: true });
    expect(look).toBe('torpHoming');
  },
  // PROP-FOULING: the victim's SLOWED tell renders a real dual-coded line.
  minePropFouling: () => {
    expect(tellLine('SLOWED', 2000)).toBe('SLOWED 2s');
  },
  // CAPTIVE MINES: the own-mine ring set says what this mine actually is — the
  // WIDE trip ring it hunts with, drawn in the acquisition (dotted) grammar,
  // and NO blast circle about the casing, because it never detonates on
  // contact. The identity is the RING SET, not a radius: both radii are derived
  // inside effectiveStats, so this reads them and asserts the shape.
  mineCaptive: () => {
    const s = effectiveStats(CONFIG.shipClasses.mineLayer, resolveBoons(['mineCaptive']));
    const rings = ownMineRings(
      { blast: s.mine.blastRadius, trigger: s.mine.triggerRadius, captive: true, now: 0 },
      true,
    );
    expect(rings.map((r) => [r.r, r.style])).toEqual([[s.mine.triggerRadius, 'dotted']]);
    expect(rings.some((r) => r.style === 'solid')).toBe(false);
  },
  // PHOSPHOR SHELLS: the zone carries the burn verb (not the bare flare) and
  // the burning ember breathes above zero alpha.
  starIncendiary: () => {
    const zones = new LitZones(new Container());
    zones.sync([zoneView('z-burn', { phos: true })], () => null);
    expect(zoneVerbs({ phos: true })).toEqual({ phos: true, daz: false });
    expect(zones.verbsOf('z-burn')?.phos).toBe(true);
    expect(zones.emberAlphaOf('z-burn')).toBeGreaterThan(0);
  },
  // DAZZLE SHELLS: the zone carries the blind verb AND the victim's DAZZLED
  // tell renders a real dual-coded line — both channels the catalog line owns.
  starDazzle: () => {
    const zones = new LitZones(new Container());
    zones.sync([zoneView('z-glare', { daz: true })], () => null);
    expect(zones.verbsOf('z-glare')?.daz).toBe(true);
    expect(tellLine('DAZZLED', 2000)).toBe('DAZZLED 2s');
  },
};

/**
 * DOCTRINE LINES WHOSE CLIENT IDENTITY CHANNEL IS NOT BUILT YET — the Story 7-5
 * wave-2 lines whose behaviour lands in a LATER slice of the same story (the
 * radar buoy's gun and jamming displays; CAPTIVE MINES left this list when its
 * ring set shipped). They are in the catalog, so
 * they must be listed SOMEWHERE rather than silently missing from the registry,
 * and this list is deliberately EXACT (not a `>=`): the agent that builds one of
 * them has to delete its line here, which is what turns "pending" back into a
 * real identity check instead of a permanent exemption.
 *
 * PLUNGING FIRE / ARMOR-PIERCING / SELF-PROPELLED MINES are NOT here — their
 * registrations are RETIRED with the lines themselves (R2.6).
 */
const PENDING_IDENTITY: readonly string[] = ['buoyGun', 'buoyJamming'];

describe('fit-check — DOCTRINE IDENTITY (every doctrine boon registers an on-water tell)', () => {
  // Story 7-5 wave 2: still SEVEN doctrine lines — the cannon pair and
  // SELF-PROPELLED left, CAPTIVE MINES / GUN BUOY / JAMMING BUOY arrived.
  it('the catalog carries the ratified 7 doctrine lines', () => {
    expect(DOCTRINE_BOONS.length).toBeGreaterThanOrEqual(7);
  });

  it('every doctrine boon is either registered or explicitly PENDING a later slice', () => {
    const missing = DOCTRINE_BOONS.filter(
      (d) => DOCTRINE_IDENTITY[d.id] === undefined && !PENDING_IDENTITY.includes(d.id),
    ).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it('the PENDING list names only lines that really are unregistered (it cannot rot)', () => {
    const stale = PENDING_IDENTITY.filter((id) => DOCTRINE_IDENTITY[id] !== undefined);
    expect(stale).toEqual([]);
    const known = new Set(DOCTRINE_BOONS.map((d) => d.id));
    expect(PENDING_IDENTITY.filter((id) => !known.has(id))).toEqual([]);
  });

  for (const def of DOCTRINE_BOONS.filter((d) => !PENDING_IDENTITY.includes(d.id))) {
    it(`${def.id}: identity channel is real (fails if a future catalog edit strips it)`, () => {
      const check = DOCTRINE_IDENTITY[def.id];
      expect(check, `${def.id} has no doctrine identity registration`).toBeDefined();
      check?.();
    });
  }
});
