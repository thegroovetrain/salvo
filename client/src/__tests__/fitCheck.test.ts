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
import { CARD_STAT_ROWS, boonEffectLine, boonFitToastLine, cardStatRows, cardTierLabel } from '../ui/boonCopy.js';
import { cardEquipmentIds, isShipwideCard, slotForCard } from '../render/equipmentInfo.js';
import { lookForReveal } from '../render/projectiles.js';
import { BurnZones } from '../render/burnZones.js';
import { glyphPaths } from '../render/equipmentIcons.js';
import { tellLine } from '../render/hud.js';

const LINES: readonly CatalogLine[] = Object.values(CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

describe('fit-check — catalog sanity (the walk covers something real)', () => {
  it('the catalog has every id keyed to itself and exactly the ratified 26 lines', () => {
    expect(LINES).toHaveLength(LINE_IDS.length);
    // 29 until Story 8.15 CUT missile, monitor and heat seeking (amendment 89e).
    expect(LINE_IDS).toHaveLength(26);
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
  it('every line has a non-empty toast at every held stack position, in BOTH verbs', () => {
    const blank: string[] = [];
    for (const line of LINES) {
      for (let stack = 1; stack <= line.cap; stack += 1) {
        // The kind is what picks the VERB (Story 8.7, ruling 14): a consumable
        // is STOCKED, everything else is FITTED. Both are walked, because
        // net/roomBindings passes the resolved kind and a missing one must
        // still print a line.
        if (boonFitToastLine(line.id, stack).trim() === '') blank.push(`${line.id}@${stack}`);
        if (boonFitToastLine(line.id, stack, line.kind).trim() === '') blank.push(`${line.id}@${stack}/kind`);
      }
    }
    expect(blank).toEqual([]);
  });

  it('says STOCKED for exactly the consumables, and FITTED for everything else', () => {
    for (const line of LINES) {
      const toast = boonFitToastLine(line.id, 1, line.kind);
      expect(toast.endsWith(line.kind === 'consumable' ? ' STOCKED' : ' FITTED'), line.id).toBe(true);
    }
  });
});

// --- VISIBLE: the refit card's five rows (Story 8.7, ruling 12) -----------------
//
// The card FACE is a presentation channel too, and it is the one the player
// meets FIRST — before the toast, before the tooltip. A line that prints no rows
// is not automatically a defect (an add-on moves no number and a stub has no
// module), but a LADDER or a WEAPON that prints none is: the whole point of the
// re-cut face is that the numbers are on it.

describe('fit-check — VISIBLE card rows (every offerable ladder/weapon prints numbers)', () => {
  const LIVE = LINES.filter((l) => l.stub !== true);

  it('every LADDER and WEAPON line yields 1-5 rows at every rung, on every class', () => {
    const bad: string[] = [];
    for (const line of LIVE) {
      if (line.kind === 'addon' || line.kind === 'consumable') continue;
      for (let k = 0; k < line.cap; k += 1) {
        for (const cls of CLASSES) {
          const rows = cardStatRows(line, k, { cls, cards: Array<string>(k).fill(line.id) });
          if (rows.length < 1 || rows.length > CARD_STAT_ROWS) bad.push(`${line.id}@${k}/${cls}: ${rows.length}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('every row it does print carries a LABEL and a VALUE — never a half-row', () => {
    const bad: string[] = [];
    for (const line of LIVE) {
      for (let k = 0; k < line.cap; k += 1) {
        for (const row of cardStatRows(line, k, { cls: 'torpedoBoat', cards: Array<string>(k).fill(line.id) })) {
          if (row.label.trim() === '' || row.next.trim() === '') bad.push(`${line.id}@${k}: ${JSON.stringify(row)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('every offerable line states its TIER STEP, except the two kinds with no ladder', () => {
    for (const line of LIVE) {
      const label = cardTierLabel(line, 0);
      const noLadder = line.kind === 'addon' || line.kind === 'consumable';
      expect(label === null, line.id).toBe(noLadder);
    }
  });
});

// --- STORY 8.13: THE LINES THAT WENT LIVE ---------------------------------------
//
// The walks above are generic, which is the point — but four lines changed
// state in one cycle (LIGHT TORPEDO, CAPTIVE MINES and the SUPERCAV TORPEDO
// stopped being stubs; FOULING MINES moved from the add-on space to the
// equipment space), and naming them once makes the coverage legible to the next
// agent instead of implied by a filter.

describe('fit-check — the four lines Story 8.13 brought to life', () => {
  const LIVE_8_13 = ['lightTorpedo', 'captiveMines', 'foulingMines', 'supercavTorpedo'] as const;

  it('none of them is a stub any more, and DEPTH CHARGE still is', () => {
    for (const id of LIVE_8_13) expect(CATALOG[id].stub, id).not.toBe(true);
    expect(CATALOG.depthCharge.stub).toBe(true); // Eric's line, mechanism a later story
  });

  it('each is AUDIBLE, VISIBLE and routed — the same four channels every line owes', () => {
    for (const id of LIVE_8_13) {
      const line = CATALOG[id];
      expect(TONES[fitTone(line.kind)], id).toBeDefined();
      expect(FIT_KINDS.includes(line.kind), id).toBe(true);
      expect(boonFitToastLine(id, 1, line.kind).trim(), id).not.toBe('');
      expect(cardTierLabel(line, 0) === null, id).toBe(line.kind === 'consumable');
    }
  });

  it('the three EQUIPMENT lines print rows and route to the slot carrying them', () => {
    for (const id of ['lightTorpedo', 'captiveMines', 'foulingMines'] as const) {
      const rows = cardStatRows(CATALOG[id], 0, { cls: 'mineLayer', cards: [] });
      expect(rows.length, id).toBeGreaterThan(0);
      expect(rows.length, id).toBeLessThanOrEqual(CARD_STAT_ROWS);
      const loadout: (EquipmentId | null)[] = [null, id, null, null];
      expect(slotForCard(loadout, id), id).toBe(1);
    }
  });

  it('the SUPERCAV TORPEDO routes as a CONSUMABLE — stocked, never slot-fitted', () => {
    expect(CATALOG.supercavTorpedo.kind).toBe('consumable');
    expect(boonFitToastLine('supercavTorpedo', 1, 'consumable')).toContain('STOCKED');
    // It addresses no EQUIPMENT, so it owns no weapon slot — its square is a
    // belt square, and the stock rides the slot tooltip's interaction line.
    expect(cardEquipmentIds('supercavTorpedo')).toEqual([]);
    // ...and its fish never takes the homing look at any build (amendment 74).
    expect(lookForReveal('torp', 'supercavTorpedo', { lightTorpedo: true, heavyTorpedo: true })).toBe('torp');
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
 * (`heatSeeking` left this list when Story 8.15 CUT it with the missile.)
 * `turning` / `deckGun` — new v3 lines with no v2 text to carry: they DO print a
 *   live `current → next` sentence on the card face, which is the channel that
 *   matters; this list covers the hotbar/results HOLDING readout only.
 */
const SILENT_EFFECT_LINE: readonly string[] = [
  ...LINES.filter((l) => (l.kind === 'equipment' && l.stub === true) || l.kind === 'consumable').map((l) => l.id),
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
    const loadout: (EquipmentId | null)[] = ['gun', 'navalMines', 'starShells', null];
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

/**
 * One real assertion per doctrine line id — the identity CHANNEL that proves
 * "no fitted card is presentation-silent".
 *
 * EMPTY SINCE STORY 8.17 (Eric ruling 2026-09-29, epic-8 amendment 134): the
 * last two add-ons left the add-on space — PHOSPHOR SHELLS became its own
 * equipment line and DAZZLE SHELLS the FLASH SHELLS consumable — so the catalog
 * carries no doctrine line at all. The `addon` kind and the doctrine machinery
 * stay in place, unused, so the table and the coverage law below stay too: a
 * future add-on lands here or fails the walk (pinned on an INJECTED line
 * below, the shared draw test's precedent). The two former add-ons' own
 * channels are pinned in the Story 8.17 block after this one.
 */
const DOCTRINE_IDENTITY: Readonly<Record<string, () => void>> = {};

/** The coverage law as a function, so it can be run against an injected line
 *  as well as the live catalog. */
function unregisteredDoctrines(lines: readonly CatalogLine[]): string[] {
  return lines
    .filter((l) => doctrineEffectOf(l) !== undefined)
    .filter((l) => DOCTRINE_IDENTITY[l.id] === undefined && !PENDING_IDENTITY.includes(l.id))
    .map((l) => l.id);
}

/**
 * DOCTRINE LINES WHOSE CLIENT IDENTITY CHANNEL IS NOT BUILT YET. The list is
 * deliberately EXACT (not a `>=`), so the agent that builds a pending line has
 * to delete its entry here, which is what turns "pending" back into a real
 * identity check instead of a permanent exemption.
 *
 * EMPTY since Story 8.15: its one entry, HEAT SEEKING, rode the HORIZONTAL
 * MISSILE, which Eric CUT for good on 2026-09-21 (epic-8 amendment 89e), and
 * 8.15 deleted the row and this entry with it.
 */
const PENDING_IDENTITY: readonly string[] = [];

describe('fit-check — DOCTRINE IDENTITY (every doctrine line registers an on-water tell)', () => {
  it('the catalog carries NO add-on doctrine line any more (Story 8.17, amendment 134)', () => {
    // Five until Story 8.13, when Eric deleted ACOUSTIC HOMING (homing became a
    // tier stat) and the FOULING MINES add-on (fouling became its own equipment
    // line) — amendments 80/81; three until Story 8.15 CUT HEAT SEEKING (89e);
    // two until Story 8.17 re-cut PHOSPHOR (equipment) and DAZZLE (the FLASH
    // SHELLS consumable) out of the add-on space.
    expect(DOCTRINE_LINES.map((l) => l.id)).toEqual([]);
    expect(LINES.filter((l) => l.kind === 'addon')).toEqual([]);
  });

  it('every doctrine line is either registered or explicitly PENDING a later slice', () => {
    expect(unregisteredDoctrines(LINES)).toEqual([]);
  });

  it('...and the law still BITES: an injected add-on with no identity is reported', () => {
    const injected: CatalogLine = {
      id: 'injectedAddon' as CatalogLine['id'],
      kind: 'addon',
      cap: 1,
      tiers: [[{ kind: 'doctrine', weapon: 'starShells', mode: 'injected' }]],
      appliesTo: ['starShells'],
    };
    expect(unregisteredDoctrines([...LINES, injected])).toEqual(['injectedAddon']);
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

// --- STORY 8.17: the two FORMER add-ons keep a real presentation channel -----
//
// They are no longer verbs, so they left DOCTRINE_IDENTITY — but the rule that
// table enforced ("no fitted card is presentation-silent") still holds for the
// lines they became. PHOSPHOR SHELLS is a weapon: its slot draws a glyph and
// its burst leaves a BURNING zone whose ember breathes. FLASH SHELLS is a belt
// consumable: its square draws a glyph and its victim wears the DAZZLED tell.
describe('fit-check — the former add-ons are not presentation-silent (Story 8.17)', () => {
  it('PHOSPHOR SHELLS: a slot glyph and a breathing burning zone', () => {
    expect(glyphPaths('phosphorShells')).not.toBeNull();
    const zones = new BurnZones(new Container());
    zones.sync([{ id: 'z-burn', x: 0, y: 0, r: 100, until: 10_000, by: 'firer' }], () => null);
    expect(zones.emberAlphaOf('z-burn')).toBeGreaterThan(0);
  });

  it('FLASH SHELLS: a belt glyph and the victim\'s DAZZLED tell', () => {
    expect(glyphPaths('dazzleShells')).not.toBeNull();
    expect(tellLine('DAZZLED', 2000)).toBe('DAZZLED 2s');
  });
});
