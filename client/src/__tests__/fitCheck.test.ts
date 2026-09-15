// FIT-CHECK — the structural proof for FR22 ("a presentation-silent boon is a
// defect"), Story 2.9 task 5, re-keyed to catalog v3 in Story 8.1. Walks the
// FULL live CATALOG and asserts, per line, that every presentation channel the
// intent-contract promises is actually wired: an audible cue (kind tone + kind
// voice), a visible toast at every stack position, a non-empty tooltip effect
// line wherever the line has authored content, correct slot routing (weapon slot
// or shipwide), and — for the doctrine add-ons — a real on-water identity
// registration.
//
// This is a CATALOG WALK, not a fixed id list: every assertion below reads
// CATALOG itself, so adding a new line with no mapping anywhere in this file
// fails the build the moment `npm test -w client` runs, exactly as the AC
// requires. Where a helper fails OPEN by design (boonFitToastLine's humanized-id
// fallback, fitTone/fitDetune's root fallback), this file uses the fail-CLOSED
// seam instead (FIT_KINDS membership, boonEffectLine's empty-string branch,
// slotForCard's null branch) so a real gap cannot hide behind a fallback.
//
// WHAT CATALOG V3 CHANGED HERE. Eleven EQUIPMENT lines spend copy 1 on the
// weapon itself and leave tiers II–V empty until Stories 8.12–8.16 author them,
// and the five CONSUMABLES are stubs until Story 8.7 builds the rack. Those
// lines move no number and carry no verb, so they have no tooltip effect line to
// print — their fit channel is the SLOT ITSELF (a weapon appears in the hotbar).
// The effect-line walk therefore covers the lines that DO carry authored
// content, and `SILENT_BY_KIND` names the exemption explicitly so it cannot rot.

import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import {
  CATALOG,
  CONFIG,
  LINE_IDS,
  effectiveStats,
  type CatalogLine,
  type BoonDoctrineEffect,
  type EquipmentId,
  type ShipClassId,
} from '@salvo/shared';
import { FIT_KINDS, TONES, fitTone } from '../audio/tones.js';
import { boonEffectLine, boonFitToastLine } from '../ui/boonCopy.js';
import { cardEquipmentIds, isShipwideCard, slotForCard } from '../render/equipmentInfo.js';
import { lookForReveal } from '../render/projectiles.js';
import { LitZones, zoneVerbs } from '../render/litZones.js';
import { tellLine } from '../render/hud.js';

const LINES: readonly CatalogLine[] = Object.values(CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

describe('fit-check — catalog sanity (the walk covers something real)', () => {
  it('the catalog has every id keyed to itself and exactly the ratified 29 lines', () => {
    expect(LINES).toHaveLength(LINE_IDS.length);
    expect(LINE_IDS).toHaveLength(29);
    for (const [key, line] of Object.entries(CATALOG)) expect(line.id).toBe(key);
  });
});

// --- AUDIBLE ----------------------------------------------------------------

describe('fit-check — AUDIBLE (every line has a real kind tone + kind voice)', () => {
  it('every line resolves fitTone(kind) to a spec present in TONES', () => {
    const silent = LINES.filter((l) => TONES[fitTone(l.kind)] === undefined).map((l) => l.id);
    expect(silent).toEqual([]);
  });

  it('every line\'s kind is REGISTERED in fitDetune\'s table (fail-CLOSED check — '
    + 'fitDetune itself fails open to 0, so membership must be checked directly)', () => {
    const uncovered = LINES.filter((l) => !FIT_KINDS.includes(l.kind)).map((l) => l.id);
    expect(uncovered).toEqual([]);
  });
});

// --- VISIBLE: toast -----------------------------------------------------------

describe('fit-check — VISIBLE toast (every stack position prints a line)', () => {
  it('every line has a non-empty FITTED toast at every held stack position', () => {
    const blank: string[] = [];
    for (const line of LINES) {
      for (let stack = 1; stack <= line.cap; stack += 1) {
        if (boonFitToastLine(line.id, stack).trim() === '') blank.push(`${line.id}@${stack}`);
      }
    }
    expect(blank).toEqual([]);
  });
});

// --- VISIBLE: tooltip effect line ----------------------------------------------

/**
 * The lines with NO tooltip effect line, and why. EXACT (not a superset), so an
 * agent that authors an equipment line's tiers II–V, or wires the consumable
 * rack, has to delete its entry here — which is what turns "pending" back into a
 * real check rather than a permanent exemption.
 *
 * `equipment` (STUB ONLY) — a stub line's weapon does not exist, so there is no
 *   row to read a holding off. A LIVE equipment line DOES print one: its own
 *   reload, which every copy past the first cuts by 5 %.
 * `consumable` — the whole rack is Story 8.7.
 * `heatSeeking` — the only add-on whose weapon (the missile) is not built.
 * `turning` / `deckGun` — new v3 lines with no v2 text to carry: they DO print a
 *   live `current → next` sentence on the card face, which is the channel that
 *   matters; this list covers the hotbar/results HOLDING readout only.
 */
const SILENT_EFFECT_LINE: readonly string[] = [
  ...LINES.filter((l) => (l.kind === 'equipment' && l.stub === true) || l.kind === 'consumable').map((l) => l.id),
  'heatSeeking',
];

describe('fit-check — VISIBLE tooltip (every authored line reports a real effect)', () => {
  it('boonEffectLine is non-empty for every authored id on every ship class', () => {
    const blank: string[] = [];
    for (const line of LINES) {
      if (SILENT_EFFECT_LINE.includes(line.id)) continue;
      for (const cls of CLASSES) {
        const stats = effectiveStats(CONFIG.shipClasses[cls], [line.id]);
        if (boonEffectLine(line.id, stats).trim() === '') blank.push(`${line.id}/${cls}`);
      }
    }
    expect(blank).toEqual([]);
  });

  it('the SILENT list cannot rot — every id on it really does print nothing', () => {
    const stats = effectiveStats(CONFIG.shipClasses.mineLayer, []);
    const stale = SILENT_EFFECT_LINE.filter((id) => boonEffectLine(id, stats).trim() !== '');
    expect(stale).toEqual([]);
  });
});

// --- SLOT ROUTING ---------------------------------------------------------------

describe('fit-check — SLOT ROUTING (every line lands on a slot or is shipwide)', () => {
  it('every line that addresses equipment routes to the slot carrying it', () => {
    const unrouted: string[] = [];
    for (const line of LINES) {
      const targets = cardEquipmentIds(line.id);
      if (targets.length === 0) continue; // shipwide — asserted below
      const equipmentId = targets[0] as EquipmentId;
      const loadout: (EquipmentId | null)[] = [null, equipmentId, null, null];
      if (slotForCard(loadout, line.id) !== 1) unrouted.push(line.id);
    }
    expect(unrouted).toEqual([]);
  });

  it('the shipwide lines are EXACTLY the five universal ladders — no gap, no orphan', () => {
    const shipwide = LINES.filter((l) => isShipwideCard(l.id) && l.kind !== 'consumable').map((l) => l.id);
    expect(shipwide.sort()).toEqual(['armor', 'radarSweep', 'reload', 'speed', 'turning']);
  });

  it('a shipwide ladder owns no slot, so its fit falls through to the rank-wide pulse', () => {
    const loadout: (EquipmentId | null)[] = ['gun', 'navalMines', 'radarBuoy', null];
    expect(slotForCard(loadout, 'armor')).toBeNull();
    expect(slotForCard(loadout, 'radarSweep')).toBeNull();
    // ...and an id nothing can resolve fails open the same way.
    expect(slotForCard(loadout, 'notACard')).toBeNull();
  });
});

// --- DOCTRINE IDENTITY -----------------------------------------------------------
//
// Every doctrine line (an effect of kind 'doctrine' — catalog v3's five add-ons)
// must register a real on-water identity check below, keyed by id. A doctrine
// with no entry here fails the coverage test immediately.

function doctrineEffectOf(line: CatalogLine): BoonDoctrineEffect | undefined {
  for (const tier of line.tiers) {
    const hit = tier.find((e): e is BoonDoctrineEffect => e.kind === 'doctrine');
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const DOCTRINE_LINES = LINES.filter((l) => doctrineEffectOf(l) !== undefined);

/** A lit-zone wire view carrying an arbitrary set of VERB FLAGS (Story 7-5
 *  wave 1 — `phos` and `daz` are independent and may both be present). */
const zoneView = (id: string, verbs: { phos?: true; daz?: true }) =>
  ({ id, x: 0, y: 0, r: 100, until: 10_000, by: 'firer', ...verbs }) as const;

/**
 * One real assertion per doctrine line id — the identity CHANNEL that proves
 * "no fitted card is presentation-silent". Each reads the real exported pure
 * seam (never a mock), matching the code map: projectiles' look table, litZones'
 * per-mode rendering, and the HUD's victim tell lines.
 */
const DOCTRINE_IDENTITY: Readonly<Record<string, () => void>> = {
  // ACOUSTIC HOMING: an own fish launched under the homing verb resolves to
  // 'torpHoming' from launch (self-private identity, Wave 3).
  acousticHoming: () => {
    const look = lookForReveal('torp', 'heavyTorpedo', { torpedoHoming: true });
    expect(look).toBe('torpHoming');
  },
  // FOULING MINES: the victim's SLOWED tell renders a real dual-coded line.
  foulingMines: () => {
    expect(tellLine('SLOWED', 2000)).toBe('SLOWED 2s');
  },
  // PHOSPHOR SHELLS: the zone carries the burn verb (not the bare flare) and
  // the burning ember breathes above zero alpha.
  phosphorShells: () => {
    const zones = new LitZones(new Container());
    zones.sync([zoneView('z-burn', { phos: true })], () => null);
    expect(zoneVerbs({ phos: true })).toEqual({ phos: true, daz: false });
    expect(zones.verbsOf('z-burn')?.phos).toBe(true);
    expect(zones.emberAlphaOf('z-burn')).toBeGreaterThan(0);
  },
  // DAZZLE SHELLS: the zone carries the blind verb AND the victim's DAZZLED
  // tell renders a real dual-coded line — both channels the catalog line owns.
  dazzleShells: () => {
    const zones = new LitZones(new Container());
    zones.sync([zoneView('z-glare', { daz: true })], () => null);
    expect(zones.verbsOf('z-glare')?.daz).toBe(true);
    expect(tellLine('DAZZLED', 2000)).toBe('DAZZLED 2s');
  },
};

/**
 * DOCTRINE LINES WHOSE CLIENT IDENTITY CHANNEL IS NOT BUILT YET. The list is
 * deliberately EXACT (not a `>=`), so the agent that builds a pending line has
 * to delete its entry here, which is what turns "pending" back into a real
 * identity check instead of a permanent exemption.
 *
 * HEAT SEEKING is the only entry: its verb rides the HORIZONTAL MISSILE, whose
 * module is Story 8.14. Its catalog line is a stub and is excluded from every
 * deck, so nothing can fit it today.
 */
const PENDING_IDENTITY: readonly string[] = ['heatSeeking'];

describe('fit-check — DOCTRINE IDENTITY (every doctrine line registers an on-water tell)', () => {
  it('the catalog carries catalog v3\'s five add-on doctrine lines', () => {
    expect(DOCTRINE_LINES.map((l) => l.id).sort()).toEqual(
      ['acousticHoming', 'dazzleShells', 'foulingMines', 'heatSeeking', 'phosphorShells'],
    );
  });

  it('every doctrine line is either registered or explicitly PENDING a later slice', () => {
    const missing = DOCTRINE_LINES.filter(
      (l) => DOCTRINE_IDENTITY[l.id] === undefined && !PENDING_IDENTITY.includes(l.id),
    ).map((l) => l.id);
    expect(missing).toEqual([]);
  });

  it('the PENDING list names only lines that really are unregistered (it cannot rot)', () => {
    const stale = PENDING_IDENTITY.filter((id) => DOCTRINE_IDENTITY[id] !== undefined);
    expect(stale).toEqual([]);
    const known = new Set<string>(DOCTRINE_LINES.map((l) => l.id));
    expect(PENDING_IDENTITY.filter((id) => !known.has(id))).toEqual([]);
  });

  for (const line of DOCTRINE_LINES.filter((l) => !PENDING_IDENTITY.includes(l.id))) {
    it(`${line.id}: identity channel is real (fails if a future catalog edit strips it)`, () => {
      const check = DOCTRINE_IDENTITY[line.id];
      expect(check, `${line.id} has no doctrine identity registration`).toBeDefined();
      check?.();
    });
  }
});
