// THE CARD COPY LAYER (ui/boonCopy.ts) — catalog v3's names (Eric's authored
// sheet, §1, verbatim), the four KIND words, and the "name is flavor, rules text
// is the contract" law. Three properties carry the whole module:
//
//   1. COVERAGE — every one of the 26 shipped lines has a real display name and
//      a real kind label. A missing entry would print the humanized id
//      mid-match, or an unlabelled meta row.
//   2. THE MINIMAL FACE (R2.17) — a line that moves a NUMBER prints its live
//      `current → next` sentence and nothing else; every other line prints
//      nothing at all. Since cycle 158 (amendments 185-188) the hovers print
//      STAT TABLES off the same row builder (no prose), and the refit card's
//      kind word splits into five (`cardKind`).
//   3. LIVE VALUES — the rules text is computed through a REAL effectiveStats
//      preview diff, so it can never promise a number the firewall would not
//      produce (clamps and caps included).
//
// WHAT CATALOG V3 CHANGED. Rarity and the nine categories are DELETED, replaced
// by ONE neutral meta word — the line's KIND (Eric ruling 2026-09-15, amendment
// 8) — and the v2 per-rung name ladders are gone: the sheet names the LINE and
// the lineage handrail prints the rung. Thirteen lines are STUBS whose mechanism
// is not built, and they have to render FAIL-OPEN (a name, a kind, no
// explanation) rather than breaking the card view.

import { describe, it, expect } from 'vitest';
import { CATALOG, CONFIG, LINE_IDS, effectiveStats, type CatalogLine } from '@salvo/shared';
import {
  boonEffectLine,
  boonFitToastLine,
  boonKindLabel,
  boonName,
  KIND_WORDS,
  cardHoverRows,
  cardKind,
  cardKindLabel,
  cardStatRows,
  cardTierLabel,
  cardTierSteps,
  consumableStatRows,
  equipmentStatRows,
  shipStatRows,
  statValueText,
  type CardKind,
} from '../ui/boonCopy.js';

const TB = { cls: 'torpedoBoat' as const, cards: [] as string[] };

/** RANGE's printer (Eric 2026-10-13): whole values whole, else one decimal. */
const rangeTxt = (v: number): string => (v % 1 === 0 ? String(v) : v.toFixed(1));

describe('coverage — every catalog line has a name and a kind word', () => {
  it('names every line (never the humanized fallback)', () => {
    expect(LINE_IDS.length).toBeGreaterThan(0);
    for (const id of LINE_IDS) {
      const name = boonName(id);
      expect(name.length, id).toBeGreaterThan(0);
      // A real sheet name is authored UPPERCASE; the fallback humanizer would
      // produce Title Case de-camelCased text instead.
      expect(name, id).toBe(name.toUpperCase());
    }
  });

  it('gives every line a kind LABEL, and each of the four catalog kinds its own', () => {
    for (const id of LINE_IDS) expect(boonKindLabel(CATALOG[id].kind).trim(), id).not.toBe('');
    const kinds = ['equipment', 'ladder', 'consumable', 'addon'];
    expect(new Set(kinds.map(boonKindLabel)).size).toBe(kinds.length);
  });

  it('names the LINE, not the rung — the tier numerals carry the position', () => {
    // The v2 ladders (HULL I..IV) are gone with the v2 catalog: the sheet gives
    // one name per line, so `stack` no longer selects anything.
    expect(boonName('hullPoints', 0)).toBe(boonName('hullPoints', 3));
    // Story 8.7 retired `boonLineageLine`'s "II/V" handrail: the ratified face
    // DRAWS the ladder, so what the numerals say is the STEP this card buys.
    // HULL reads 0 → V since Story 9.6 (epic-9 amendment 94).
    expect(cardTierLabel(CATALOG.hullPoints, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.hullPoints, 3)).toBe('III → IV');
  });

  it('fails OPEN on an unknown id/kind (a readable fallback, never an empty card)', () => {
    expect(boonName('someFutureCard')).toBe('Some Future Card');
    expect(boonKindLabel('someFutureKind')).toBe('SOMEFUTUREKIND');
  });
});

// The one-sentence `boonDescription` reader (and its face/rules-text suites)
// was DELETED in cycle 158's review gate: the face prints `cardStatRows`
// (cardStatRows.test.ts) and the hover prints `cardHoverRows` (amendment 187).
describe('the card view renders a STUB fail-open (amendment 5)', () => {
  // THE STUB PIN (Eric ruling 2026-09-15, amendment 5): lines authored in full
  // shape with no mechanism behind them. They are excluded from every deck, so
  // they can never be offered — but the card view must still render them
  // FAIL-OPEN rather than throwing or going blank, because the catalog is wire
  // contract and a stale client could see one. THIRTEEN at 8.7; TWELVE once
  // Story 8.8 flipped `hullRepair`'s stub; TEN since Story 8.13 flipped LIGHT
  // TORPEDO, CAPTIVE MINES and the SUPERCAV TORPEDO and added the stub DEPTH
  // CHARGE (epic-8 amendments 74/83); FIVE since Story 8.15 cut missile,
  // monitor and heat seeking and built the machine gun and flak (amendments
  // 89e/103-105); TWO since Story 8.16 flipped SHIELD BLOCK, CHAFF and DECOY
  // BUOY; ONE since Story 8.18 flipped SMOKE SCREEN (DEPTH CHARGE remains). It
  // is the number to move as each content story lands.
  it('renders every STUB line fail-open: a name, a kind word, no explanation', () => {
    const stubs = LINE_IDS.map((id) => CATALOG[id]).filter((l) => l.stub === true);
    expect(stubs.length).toBeGreaterThan(0);
    for (const line of stubs) {
      expect(boonName(line.id), line.id).toBe(boonName(line.id).toUpperCase());
      expect(boonKindLabel(line.kind), line.id).not.toBe('');
      // ...and no hover rows, so no hover panel (amendment 187).
      expect(cardHoverRows(line, 0, TB), line.id).toEqual([]);
      // A STUB line prints no rows on the ratified face either — there is no
      // built module whose numbers could be read (Story 8.7, ruling 12).
      expect(cardStatRows(line, 0, TB), line.id).toEqual([]);
    }
  });
});

// --- THE STAT TABLES (cycle 158, Eric ruling 2026-09-30, amendments 185-187) ----
//
// *"What I want to see when I hover over my weapon are the weapon's actual
// stats/numbers. One per line."* The prose explanations are DELETED; the slot
// tooltip, the SHIP panel and the refit card's hover print these rows.
describe('the stat tables — one builder for the face and both hovers', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);
  const text = (rows: readonly { label: string; cur: string | null; next: string }[]) => rows.map(statValueText);

  it('equipmentStatRows: the EQUIPMENT_STAT_FIELDS in order, ABSOLUTE, off the live fold', () => {
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['heavyTorpedo', 'heavyTorpedo']);
    const rows = equipmentStatRows('heavyTorpedo', s);
    expect(rows.every((r) => r.cur === null)).toBe(true);
    expect(text(rows)).toEqual([
      `${(s.equipment.heavyTorpedo.reloadMs / 1000).toFixed(1)} s`,
      `${s.equipment.heavyTorpedo.maxAmmo}`,
      `${s.equipment.heavyTorpedo.speed}`,
      `${s.equipment.heavyTorpedo.damage}`,
      `${s.equipment.heavyTorpedo.homingTurnRate} rad/s`,
    ]);
  });

  it('reuses the card face\'s row strings byte-for-byte (a weapon\'s fit card)', () => {
    // The fit card is the line's table valued on the AFTER fold; the hover of
    // that card is the same table, so every face row appears verbatim in it.
    for (const id of ['heavyTorpedo', 'navalMines', 'lightTorpedo', 'broadside'] as const) {
      const face = cardStatRows(CATALOG[id], 0, TB);
      const hover = cardHoverRows(CATALOG[id], 0, TB);
      for (const row of face) expect(hover, id).toContainEqual(row);
    }
  });

  it('inserts the mine\'s derived TRIGGER RADIUS by the fit card\'s rule', () => {
    const s = effectiveStats(CONFIG.shipClasses.mineLayer, ['navalMines']);
    const naval = text(equipmentStatRows('navalMines', s));
    // After the blast radius, the table's last row.
    expect(naval).toHaveLength(5);
    expect(naval[3]).toBe(String(s.equipment.navalMines.blastRadius));
    expect(naval[4]).toBe(String(s.equipment.navalMines.triggerRadius));
    // The CAPTIVE mine has no blast field: the ring follows DAMAGE.
    const captive = text(equipmentStatRows('captiveMines', s));
    expect(captive).toHaveLength(5);
    expect(captive[2]).toBe(String(s.equipment.captiveMines.damage));
    expect(captive[3]).toBe(String(s.equipment.captiveMines.triggerRadius));
  });

  it('prints RANGE (the derived rangeU) LAST, in lowercase world units', () => {
    expect(text(equipmentStatRows('gun', bare)).at(-1)).toBe(`${rangeTxt(bare.equipment.gun.rangeU)} u`);
    expect(text(equipmentStatRows('flak', bare)).at(-1)).toBe(`${rangeTxt(bare.equipment.flak.rangeU)} u`);
    // A torpedo's row carries no rangeU, so it prints none.
    expect(text(equipmentStatRows('heavyTorpedo', bare)).filter((v) => v.endsWith(' u'))).toEqual([]);
    // ...and ONCE: since Story 9.8 `rangeU` is also a stat-table field (ruling
    // 125), and the table must not print it mid-row as well as last.
    expect(text(equipmentStatRows('gun', bare)).filter((v) => v.endsWith(' u'))).toHaveLength(1);
  });

  it('prints RANGE to ONE DECIMAL ONLY WHEN NEEDED — whole values whole, a +31.25 u card step to one decimal (Eric 2026-10-13)', () => {
    // One flak card: Tier I + one (V − I) / 4 step, a quarter-unit value.
    const one = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['flak']);
    expect(Number.isInteger(one.equipment.flak.rangeU), 'the premise: a fractional reach').toBe(false);
    expect(text(equipmentStatRows('flak', one)).at(-1)).toBe(`${one.equipment.flak.rangeU.toFixed(1)} u`);
    // A whole reach prints whole — no trailing ".0".
    expect(Number.isInteger(bare.equipment.flak.rangeU), 'the premise: a whole reach').toBe(true);
    expect(text(equipmentStatRows('flak', bare)).at(-1)).toBe(`${bare.equipment.flak.rangeU} u`);
  });

  it('the MACHINE GUN: its shells, and the fire rate to two decimals with the trailing zero kept', () => {
    expect(text(equipmentStatRows('machineGun', bare))).toEqual([
      `${(CONFIG.machineGun.reloadMs / 1000).toFixed(1)} s`,
      `${CONFIG.machineGun.maxAmmo}`,
      `${CONFIG.machineGun.damage}`,
      `${(CONFIG.machineGun.rateMs / 1000).toFixed(2)} s`,
      `${rangeTxt(bare.equipment.machineGun.rangeU)} u`,
    ]);
    const top = effectiveStats(CONFIG.shipClasses.torpedoBoat, Array<string>(4).fill('machineGun'));
    expect(text(equipmentStatRows('machineGun', top))).toContain(`${(top.equipment.machineGun.rateMs / 1000).toFixed(2)} s`);
  });

  it('a Shift opens with its factor off CONFIG and prints no ROUNDS line', () => {
    expect(text(equipmentStatRows('boost', bare))).toEqual([
      `+${CONFIG.boost.factor * 100}%`,
      `${(CONFIG.boost.durationMs / 1000).toFixed(1)} s`,
      `${(CONFIG.boost.reloadMs / 1000).toFixed(1)} s`,
    ]);
    expect(text(equipmentStatRows('instantReload', bare))).toEqual([
      `${(CONFIG.instantReload.reloadMs / 1000).toFixed(1)} s`,
    ]);
    expect(text(equipmentStatRows('hunker', bare))).toEqual([
      `+${CONFIG.hunker.armorBonus}`, // Story 9.7: the cut adds Armor (epic-9 amendments 110–117)
      `${(CONFIG.hunker.durationMs / 1000).toFixed(1)} s`,
      `${(CONFIG.hunker.reloadMs / 1000).toFixed(1)} s`,
    ]);
  });

  it('consumableStatRows is the face\'s CONSUMABLE_ROWS, and none for a stub or a junk id', () => {
    expect(consumableStatRows('hullRepair')).toEqual(cardStatRows(CATALOG.hullRepair, 0, TB));
    expect(consumableStatRows('depthCharge')).toEqual([]);
    expect(consumableStatRows('constructor')).toEqual([]);
  });

  it('shipStatRows: the eight ladders in order, each line\'s own printer', () => {
    expect(text(shipStatRows(bare))).toEqual([
      `${bare.maxHp}`,
      `${bare.armor}`, // Story 9.7: right after HULL (epic-9 amendments 110–117)
      `${bare.armorPiercing}`, // Story 9.9: right after ARMOR (epic-9 amendment 159)
      `${bare.kinematics.maxSpeed}`,
      `${Math.round((bare.kinematics.turnRate * 180) / Math.PI)}°/s`, // rad/s printed as whole degrees/s (P10)
      `${bare.sweepRpm} RPM`,
      '100%', // the bare cooldown multiplier
      `${Math.round(bare.regen.missingPctPerS * 100)} %/S`, // Story 9.6, amendment 95
    ]);
  });

  it('cardHoverRows: the full table of what the card touches, valued AFTER the card', () => {
    // A weapon line: its weapon's table on the after fold.
    const after = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['lightTorpedo']);
    expect(cardHoverRows(CATALOG.lightTorpedo, 0, TB)).toEqual(equipmentStatRows('lightTorpedo', after));
    // A ship ladder: the eight ship stats after the card (MAX HULL moved).
    const hulled = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['hullPoints']);
    expect(cardHoverRows(CATALOG.hullPoints, 0, TB)).toEqual(shipStatRows(hulled));
    // A gun ladder: the CANNON's table after the card (the CANNON ladder —
    // DECK GUN BARREL folded into it, amendment 197).
    const cannon = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['deckGun']);
    expect(cardHoverRows(CATALOG.deckGun, 0, TB)).toEqual(equipmentStatRows('gun', cannon));
    // The two pickable guns' ladders climb their own gun.
    const mg = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['machineGun']);
    expect(cardHoverRows(CATALOG.machineGun, 0, TB)).toEqual(equipmentStatRows('machineGun', mg));
    // A consumable: its CONFIG rows; a stub: none.
    expect(cardHoverRows(CATALOG.countermeasure, 0, TB)).toEqual(consumableStatRows('countermeasure'));
    expect(cardHoverRows(CATALOG.depthCharge, 0, TB)).toEqual([]);
  });
});

// --- THE CARD KIND (cycle 158, Eric ruling 2026-09-30, amendment 188) -----------
describe('cardKind — what the card does for the player', () => {
  it('has one distinct, non-empty kind word per card kind', () => {
    const kinds: CardKind[] = ['weapon', 'weaponUpgrade', 'shipUpgrade', 'consumable', 'addon'];
    expect(KIND_WORDS).toHaveLength(kinds.length);
    expect(new Set(kinds.map(cardKindLabel))).toEqual(new Set(KIND_WORDS));
    for (const w of KIND_WORDS) expect(w.trim()).not.toBe('');
  });

  it('copy 1 of an equipment line is a WEAPON; every later copy a WEAPON UPGRADE', () => {
    for (const id of ['heavyTorpedo', 'lightTorpedo', 'navalMines', 'broadside', 'starShells', 'phosphorShells']) {
      expect(cardKind(CATALOG[id], 0), id).toBe('weapon');
      expect(cardKind(CATALOG[id], 1), id).toBe('weaponUpgrade');
      expect(cardKind(CATALOG[id], 3), id).toBe('weaponUpgrade');
    }
    expect(cardKind(CATALOG.heavyTorpedo, Number.NaN)).toBe('weapon'); // fail-open to copy 1
  });

  it('every gun ladder is a WEAPON UPGRADE, every ship ladder a SHIP UPGRADE, whatever the copies', () => {
    for (const n of [0, 1, 3]) {
      for (const id of ['deckGun', 'machineGun', 'flak']) {
        expect(cardKind(CATALOG[id], n), id).toBe('weaponUpgrade');
      }
      // ARMOR PIERCING joined in Story 9.9 (epic-9 amendment 159).
      for (const id of ['hullPoints', 'armor', 'armorPiercing', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing']) {
        expect(cardKind(CATALOG[id], n), id).toBe('shipUpgrade');
      }
    }
  });

  it('a consumable is a CONSUMABLE and an add-on an ADD-ON', () => {
    for (const id of ['hullRepair', 'countermeasure', 'supercavTorpedo', 'foulingShell']) {
      expect(cardKind(CATALOG[id], 0), id).toBe('consumable');
    }
    expect(cardKind({ ...CATALOG.hullPoints, kind: 'addon' } as CatalogLine, 0)).toBe('addon');
  });

  it('every shipped line resolves to a kind at every copy count', () => {
    for (const id of LINE_IDS) {
      for (let n = 0; n <= CATALOG[id].cap; n += 1) expect(KIND_WORDS, id).toContain(cardKindLabel(cardKind(CATALOG[id], n)));
    }
  });
});

// THE TIER NUMERALS (Story 8.7, ruling 11 / UX-DR51) — what replaced the
// "II/V" handrail. The ladder itself is drawn on the face, so these say the
// STEP the card buys, which the rungs cannot.
describe('cardTierLabel — the step, not the position', () => {
  it('reads a BASE-TIER line as a step from what the hull already has', () => {
    // A hull sails with its deck gun fitted, so the first card of that ladder
    // is I → II rather than the purchase of a Tier I.
    expect(cardTierLabel(CATALOG.deckGun, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.deckGun, 2)).toBe('III → IV');
  });

  it('reads every OTHER ladder and every weapon as a bare I on its first copy', () => {
    // HULL / SPEED / TURNING left the base-tier set in Story 9.6 (epic-9
    // amendment 94): five cards each, 0 → V, like PASSIVE HEALING — and ARMOR
    // (Story 9.7, epic-9 amendments 110–117) and ARMOR PIERCING (Story 9.9,
    // epic-9 amendment 159: out of the base-tier set, Tier 0 → V like ARMOR).
    for (const id of ['hullPoints', 'armor', 'armorPiercing', 'speed', 'turning', 'passiveHealing']) {
      expect(cardTierLabel(CATALOG[id], 0), id).toBe('I');
      expect(cardTierLabel(CATALOG[id], 1), id).toBe('I → II');
      expect(cardTierLabel(CATALOG[id], 4), id).toBe('IV → V'); // the fifth card
      expect(cardTierLabel(CATALOG[id], 5), id).toBe('V'); // at the cap
    }
    expect(cardTierLabel(CATALOG.radarSweep, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.reload, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.navalMines, 0)).toBe('I');
  });

  // Story 8.15: the machine gun's and the flak gun's ladders are BASE-TIER
  // lines like the cannon's — the gun is already mounted at rung I, so the
  // first card is the step I → II and the fourth tops out at V.
  it('reads the two pickable guns\' ladders as base-tier lines (I → II … IV → V)', () => {
    for (const line of [CATALOG.machineGun, CATALOG.flak]) {
      expect(cardTierLabel(line, 0), line.id).toBe('I → II');
      expect(cardTierLabel(line, 3), line.id).toBe('IV → V');
    }
  });

  it('and as a step from the copy held once there is one', () => {
    expect(cardTierLabel(CATALOG.heavyTorpedo, 1)).toBe('I → II');
    expect(cardTierLabel(CATALOG.reload, 1)).toBe('I → II');
    expect(cardTierLabel(CATALOG.radarSweep, 4)).toBe('IV → V');
  });

  it('shows NO ladder at all for a consumable or an add-on', () => {
    expect(cardTierLabel(CATALOG.hullRepair, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.radarBuoy, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.dazzleShells, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.foulingShell, 0)).toBeNull();
  });

  it('carries the same step as NUMBERS, so the DOM can tint each numeral', () => {
    expect(cardTierSteps(CATALOG.deckGun, 0)).toEqual({ cur: 1, next: 2 });
    expect(cardTierSteps(CATALOG.radarSweep, 0)).toEqual({ cur: 1, next: null });
    expect(cardTierSteps(CATALOG.heavyTorpedo, 2)).toEqual({ cur: 2, next: 3 });
    expect(cardTierSteps(CATALOG.hullRepair, 0)).toBeNull();
  });

  // STORY 8.12 — THE CEILING. The ramp is five rungs (UX-DR51) and the caps are
  // authored to land on it, so the top of a ladder must read as the bare rung it
  // is standing on: there is no sixth rung to sell. A base-tier line's ceiling is
  // `cap + 1` (the hull already sails at I and every card steps above it); every
  // other line's is the cap itself.
  it('stops at the TOP RUNG — a card at the cap sells no step', () => {
    // HULL / SPEED / TURNING run five cards from nothing since Story 9.6
    // (epic-9 amendment 94), so they top out at the cap, as RADAR SWEEP does.
    expect(cardTierLabel(CATALOG.hullPoints, 5)).toBe('V');
    expect(cardTierLabel(CATALOG.speed, 5)).toBe('V');
    expect(cardTierLabel(CATALOG.turning, 5)).toBe('V');
    expect(cardTierLabel(CATALOG.deckGun, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.radarSweep, 5)).toBe('V');
    // An OVER-STACK of the CANNON ladder (more copies than its cap) still reads
    // the top rung. (This pinned the one-rung TURRET until it was deleted,
    // amendment 197; no one-rung ladder ships now.)
    expect(cardTierLabel(CATALOG.deckGun, 5)).toBe('V');
    expect(cardTierSteps(CATALOG.hullPoints, 5)).toEqual({ cur: 5, next: null });
    expect(cardTierSteps(CATALOG.radarSweep, 5)).toEqual({ cur: 5, next: null });
  });

  it('never prints a SIXTH rung — on any ladder, at any count the wire can carry', () => {
    // Property-style: walk every line that has a ladder at all, from empty to
    // three copies past its cap (an over-stack the server should never grant),
    // and assert no label ever reaches VI — neither side of the arrow.
    for (const line of Object.values(CATALOG)) {
      for (let held = 0; held <= line.cap + 3; held += 1) {
        const label = cardTierLabel(line, held);
        if (label === null) continue;
        expect(label, `${line.id} @ ${held}`).not.toContain('VI');
        const step = cardTierSteps(line, held)!;
        expect(step.cur, `${line.id} @ ${held}`).toBeLessThanOrEqual(5);
        expect(step.next ?? 0, `${line.id} @ ${held}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('moves NOTHING below the ceiling — every step is what it was', () => {
    expect(cardTierLabel(CATALOG.deckGun, 3)).toBe('IV → V');
    expect(cardTierLabel(CATALOG.deckGun, 2)).toBe('III → IV');
    expect(cardTierLabel(CATALOG.radarSweep, 4)).toBe('IV → V');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 4)).toBe('IV → V');
    expect(cardTierSteps(CATALOG.hullPoints, 2)).toEqual({ cur: 2, next: 3 });
    expect(cardTierSteps(CATALOG.deckGun, 3)).toEqual({ cur: 4, next: 5 });
  });

  // REVIEW GATE, CYCLE 147: `Math.trunc(NaN)` is `NaN`, so a non-finite
  // `copiesHeld` used to sail through the old `Math.max(0, Math.trunc(...))`
  // untouched and poison `cur`/`next` with NaN. Fenced to a held-nothing read.
  it('fences a non-finite copiesHeld to held-nothing, never NaN', () => {
    expect(cardTierSteps(CATALOG.reload, NaN)).toEqual({ cur: 1, next: null });
  });

  // REVIEW GATE, CYCLE 147: `tierCeiling` used to read `cap + 1` for a base-tier
  // line with NO independent clamp to the five-rung ramp — so a base-tier line
  // authored (or, defensively, injected) with `cap` at 5 would ceiling at 6 and
  // print `V → VI`. `RAMP_RUNGS` is the second, catalog-independent stop.
  it('never lets a base-tier line\'s ceiling exceed the five-rung ramp, whatever its cap', () => {
    const overCapped: CatalogLine = {
      ...CATALOG.deckGun,
      cap: 5,
      tiers: [...CATALOG.deckGun.tiers, CATALOG.deckGun.tiers[0]],
    } as CatalogLine;
    expect(cardTierLabel(overCapped, 4)).toBe('V');
  });
});

describe('the fitted toast', () => {
  it('names the line that was fitted, whatever the stack', () => {
    expect(boonFitToastLine('reload', 1)).toContain(boonName('reload'));
    expect(boonFitToastLine('heavyTorpedo', 1)).toContain(boonName('heavyTorpedo'));
    expect(boonFitToastLine('reload', 3)).toBe(boonFitToastLine('reload', 1));
  });

  it('floors a defensive 0 rather than going blank', () => {
    expect(boonFitToastLine('reload', 0)).toBe(boonFitToastLine('reload', 1));
  });

  it('fails open on an unknown id', () => {
    expect(boonFitToastLine('someFutureCard', 1)).toContain(boonName('someFutureCard'));
  });

  // STORY 8.7, RULING 14 (UX-DR48's "consumable stocked"). Nothing about the
  // hull changed when a consumable lands — a copy went onto the belt — so the
  // verb has to say so or the toast claims a fit that never happened.
  it('only the consumable kind switches the verb: ladder, equipment, add-on, an unknown kind and no kind all read the fitted default', () => {
    const fitted = boonFitToastLine('hullRepair', 1);
    expect(boonFitToastLine('hullRepair', 1, 'consumable')).not.toBe(fitted);
    expect(boonFitToastLine('hullRepair', 1, 'consumable')).toContain(boonName('hullRepair'));
    for (const kind of ['ladder', 'equipment', 'addon', 'someFutureKind']) {
      expect(boonFitToastLine('hullRepair', 1, kind), kind).toBe(fitted);
    }
  });
});

describe('the tooltip effect line (Story 2.9) — the HOLDING, not the sales pitch', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  it('reports a stat line\'s LIVE value, with no current→next arrow', () => {
    expect(boonEffectLine('hullPoints', bare)).toContain(`${bare.maxHp}`);
    expect(boonEffectLine('hullPoints', bare)).not.toContain('→');
    expect(boonEffectLine('radarSweep', bare)).toContain(`${bare.sweepRpm} RPM`);
    expect(boonEffectLine('reload', bare)).toContain('100%');
    // TURNING in whole degrees per second (Eric 2026-09-30).
    expect(boonEffectLine('turning', bare)).toContain(`${Math.round((bare.kinematics.turnRate * 180) / Math.PI)}°/s`);
  });

  it('MOVES with the fitted stack (it reads the firewall\'s output, not CONFIG)', () => {
    const stacked = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['hullPoints', 'hullPoints']);
    expect(boonEffectLine('hullPoints', stacked)).not.toBe(boonEffectLine('hullPoints', bare));
    expect(boonEffectLine('hullPoints', stacked)).toContain(`${stacked.maxHp}`);
  });

  // A verb card's holding row was its own short table until STORY 8.17 emptied
  // it (amendment 134), and cycle 158 deleted the empty table: PHOSPHOR SHELLS
  // holds its own RELOAD like every weapon line.
  it('a former add-on holds a NUMBER now — PHOSPHOR SHELLS reports its reload', () => {
    const phos = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['phosphorShells']);
    const holding = boonEffectLine('phosphorShells', phos);
    expect(holding).toContain(`${(phos.equipment.phosphorShells.reloadMs / 1000).toFixed(1)} s`);
  });

  it('fails open to \'\' for a line with no headline stat', () => {
    // A STUB equipment line has no built weapon to read a holding off, so it
    // reports its `◆ NAME` row alone — the honest readout. A LIVE one prints
    // the reload it is actually carrying.
    expect(boonEffectLine('depthCharge', bare)).toBe('');
    expect(boonEffectLine('notARealCard', bare)).toBe('');
    expect(boonEffectLine('heavyTorpedo', bare)).toContain(`${(bare.equipment.heavyTorpedo.reloadMs / 1000).toFixed(1)} s`);
  });
});
