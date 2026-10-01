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

describe('coverage — every catalog line has a name and a kind word', () => {
  it('names every one of the 26 lines (never the humanized fallback)', () => {
    // 29 until Story 8.15 CUT missile, monitor and heat seeking (amendment 89e).
    expect(LINE_IDS).toHaveLength(26);
    for (const id of LINE_IDS) {
      const name = boonName(id);
      expect(name.length, id).toBeGreaterThan(0);
      // A real sheet name is authored UPPERCASE; the fallback humanizer would
      // produce Title Case de-camelCased text instead.
      expect(name, id).toBe(name.toUpperCase());
    }
  });

  it('gives every line a kind LABEL — one of catalog v3\'s four words', () => {
    const WORDS = ['WEAPON', 'UPGRADE', 'ADD-ON', 'CONSUMABLE'];
    for (const id of LINE_IDS) {
      const label = boonKindLabel(CATALOG[id].kind);
      expect(WORDS, id).toContain(label);
    }
    // ...and all but ADD-ON are used by the shipped catalog: Story 8.17 re-cut
    // the last two add-ons (amendment 134), so the word survives for the kind
    // the catalog keeps, unused.
    expect([...new Set(LINE_IDS.map((id) => boonKindLabel(CATALOG[id].kind)))].sort())
      .toEqual(['CONSUMABLE', 'UPGRADE', 'WEAPON']);
    expect(boonKindLabel('addon')).toBe('ADD-ON');
  });

  it('carries the sheet\'s names verbatim (spot checks across the four kinds)', () => {
    expect(boonName('armor')).toBe('ARMOR');
    expect(boonName('radarSweep')).toBe('RADAR SWEEP');
    expect(boonName('deckGunTurret')).toBe('DECK GUN TURRET');
    // `SUPERCAV TORPEDO`, not the sheet's `SUPERCAVITATING TORPEDO` — the ONE
    // name Eric shortened (2026-09-19, epic-8 amendment 75) because the long
    // form never fitted the refit card's name box. See refitCardFit.test.ts:
    // the fit exemption it used to carry is retired with it.
    expect(boonName('supercavTorpedo')).toBe('SUPERCAV TORPEDO');
    expect(boonName('depthCharge')).toBe('DEPTH CHARGE');
    expect(boonName('foulingMines')).toBe('FOULING MINES');
    // Story 8.15: the plain gun's ladder reads CANNON (amendment 108; TURRET
    // and BARREL keep their names), and the two pickable guns' ladders are
    // named for their guns.
    expect(boonName('deckGun')).toBe('CANNON');
    expect(boonName('deckGunBarrel')).toBe('DECK GUN BARREL');
    expect(boonName('machineGun')).toBe('MACHINE GUN');
    expect(boonName('flak')).toBe('FLAK');
    expect(boonName('broadside')).toBe('BROADSIDE GUN');
    expect(boonName('decoyBuoy')).toBe('DECOY BUOY');
    expect(boonName('phosphorShells')).toBe('PHOSPHOR SHELLS');
  });

  it('names the LINE, not the rung — the tier numerals carry the position', () => {
    // The v2 ladders (HULL I..IV) are gone with the v2 catalog: the sheet gives
    // one name per line, so `stack` no longer selects anything.
    expect(boonName('armor', 0)).toBe(boonName('armor', 3));
    // Story 8.7 retired `boonLineageLine`'s "II/V" handrail: the ratified face
    // DRAWS the ladder, so what the numerals say is the STEP this card buys.
    expect(cardTierLabel(CATALOG.armor, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.armor, 3)).toBe('IV → V');
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
    expect(stubs).toHaveLength(1);
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
  const text = (rows: readonly { label: string; cur: string | null; next: string }[]) =>
    rows.map((r) => `${r.label} ${statValueText(r)}`);

  it('equipmentStatRows: the EQUIPMENT_STAT_FIELDS in order, ABSOLUTE, off the live fold', () => {
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['heavyTorpedo', 'heavyTorpedo']);
    const rows = equipmentStatRows('heavyTorpedo', s);
    expect(rows.every((r) => r.cur === null)).toBe(true);
    expect(text(rows)).toEqual([
      `RELOAD ${(s.equipment.heavyTorpedo.reloadMs / 1000).toFixed(1)} s`,
      `ROUNDS ${s.equipment.heavyTorpedo.maxAmmo}`,
      `SPEED ${s.equipment.heavyTorpedo.speed}`,
      `DAMAGE ${s.equipment.heavyTorpedo.damage}`,
      `HOMING ${s.equipment.heavyTorpedo.homingTurnRate} rad/s`,
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
    expect(equipmentStatRows('navalMines', s).map((r) => r.label)).toEqual([
      'RELOAD', 'ROUNDS', 'DAMAGE', 'BLAST RADIUS', 'TRIGGER RADIUS',
    ]);
    // The CAPTIVE mine has no blast field: the ring follows DAMAGE.
    expect(equipmentStatRows('captiveMines', s).map((r) => r.label)).toEqual([
      'RELOAD', 'ROUNDS', 'DAMAGE', 'TRIGGER RADIUS', 'HOMING',
    ]);
  });

  it('prints RANGE (the derived rangeU) LAST, in lowercase world units', () => {
    expect(text(equipmentStatRows('gun', bare)).at(-1)).toBe(`RANGE ${bare.equipment.gun.rangeU} u`);
    expect(text(equipmentStatRows('flak', bare)).at(-1)).toBe(`RANGE ${bare.equipment.flak.rangeU} u`);
    // A torpedo's row carries no rangeU, so it prints none.
    expect(equipmentStatRows('heavyTorpedo', bare).map((r) => r.label)).not.toContain('RANGE');
  });

  it('the MACHINE GUN: SHELLS, and RATE to two decimals with the trailing zero kept', () => {
    expect(text(equipmentStatRows('machineGun', bare))).toEqual([
      'RELOAD 10.0 s',
      'SHELLS 16',
      'DAMAGE 4',
      'RATE 0.35 s',
      `RANGE ${bare.equipment.machineGun.rangeU} u`,
    ]);
    const top = effectiveStats(CONFIG.shipClasses.torpedoBoat, Array<string>(4).fill('machineGun'));
    expect(text(equipmentStatRows('machineGun', top))).toContain('RATE 0.20 s');
  });

  it('a Shift opens with its factor off CONFIG and prints no ROUNDS line', () => {
    expect(text(equipmentStatRows('boost', bare))).toEqual(['BOOST +25%', 'DURATION 10.0 s', 'RELOAD 25.0 s']);
    expect(equipmentStatRows('boost', bare)[0].next).toBe(`+${CONFIG.boost.factor * 100}%`);
    expect(text(equipmentStatRows('instantReload', bare))).toEqual([
      `RELOAD ${(CONFIG.instantReload.reloadMs / 1000).toFixed(1)} s`,
    ]);
    expect(text(equipmentStatRows('damageCut', bare))).toEqual([
      `CUT ${Math.round((1 - CONFIG.damageCut.factor) * 100)}%`,
      `DURATION ${(CONFIG.damageCut.durationMs / 1000).toFixed(1)} s`,
      `RELOAD ${(CONFIG.damageCut.reloadMs / 1000).toFixed(1)} s`,
    ]);
  });

  it('consumableStatRows is the face\'s CONSUMABLE_ROWS, and none for a stub or a junk id', () => {
    expect(consumableStatRows('hullRepair')).toEqual(cardStatRows(CATALOG.hullRepair, 0, TB));
    expect(text(consumableStatRows('hullRepair'))).toEqual(['INSTANT +50 HP', 'OVER TIME +50 HP / 5 S']);
    expect(consumableStatRows('depthCharge')).toEqual([]);
    expect(consumableStatRows('constructor')).toEqual([]);
  });

  it('shipStatRows: the five ladders in order, uppercased words, each line\'s own printer', () => {
    expect(text(shipStatRows(bare))).toEqual([
      `MAX HULL ${bare.maxHp}`,
      `TOP SPEED ${bare.kinematics.maxSpeed}`,
      `TURNING ${Math.round((bare.kinematics.turnRate * 180) / Math.PI)}°/s`, // 0.8 rad/s → 46°/s (P10)
      `RADAR SWEEP ${bare.sweepRpm} RPM`,
      'ALL COOLDOWNS 100%',
    ]);
  });

  it('cardHoverRows: the full table of what the card touches, valued AFTER the card', () => {
    // A weapon line: its weapon's table on the after fold.
    const after = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['lightTorpedo']);
    expect(cardHoverRows(CATALOG.lightTorpedo, 0, TB)).toEqual(equipmentStatRows('lightTorpedo', after));
    // A ship ladder: the five ship stats after the card (MAX HULL moved).
    const armored = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['armor']);
    expect(cardHoverRows(CATALOG.armor, 0, TB)).toEqual(shipStatRows(armored));
    expect(text(cardHoverRows(CATALOG.armor, 0, TB))[0]).toBe(`MAX HULL ${armored.maxHp}`);
    // A gun ladder: the CANNON's table after the card (the deck-gun family).
    const barrel = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['deckGunBarrel']);
    expect(cardHoverRows(CATALOG.deckGunBarrel, 0, TB)).toEqual(equipmentStatRows('gun', barrel));
    // The two pickable guns' ladders climb their own gun.
    const mg = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['machineGun']);
    expect(cardHoverRows(CATALOG.machineGun, 0, TB)).toEqual(equipmentStatRows('machineGun', mg));
    expect(text(cardHoverRows(CATALOG.machineGun, 0, TB))).toContain('RATE 0.31 s');
    // A consumable: its CONFIG rows; a stub: none.
    expect(cardHoverRows(CATALOG.smokeScreen, 0, TB)).toEqual(consumableStatRows('smokeScreen'));
    expect(cardHoverRows(CATALOG.depthCharge, 0, TB)).toEqual([]);
  });
});

// --- THE CARD KIND (cycle 158, Eric ruling 2026-09-30, amendment 188) -----------
describe('cardKind — what the card does for the player', () => {
  it('has exactly the five kind words, longest WEAPON UPGRADE', () => {
    expect([...KIND_WORDS].sort()).toEqual(['ADD-ON', 'CONSUMABLE', 'SHIP UPGRADE', 'WEAPON', 'WEAPON UPGRADE']);
    expect(Math.max(...KIND_WORDS.map((w) => w.length))).toBe('WEAPON UPGRADE'.length);
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
      for (const id of ['deckGun', 'deckGunTurret', 'deckGunBarrel', 'machineGun', 'flak']) {
        expect(cardKind(CATALOG[id], n), id).toBe('weaponUpgrade');
      }
      for (const id of ['armor', 'speed', 'turning', 'radarSweep', 'reload']) {
        expect(cardKind(CATALOG[id], n), id).toBe('shipUpgrade');
      }
    }
  });

  it('a consumable is a CONSUMABLE, an add-on an ADD-ON, and the words map one to one', () => {
    for (const id of ['hullRepair', 'smokeScreen', 'chaff', 'supercavTorpedo', 'dazzleShells']) {
      expect(cardKind(CATALOG[id], 0), id).toBe('consumable');
    }
    expect(cardKind({ ...CATALOG.armor, kind: 'addon' } as CatalogLine, 0)).toBe('addon');
    const words: Record<CardKind, string> = {
      weapon: 'WEAPON',
      weaponUpgrade: 'WEAPON UPGRADE',
      shipUpgrade: 'SHIP UPGRADE',
      consumable: 'CONSUMABLE',
      addon: 'ADD-ON',
    };
    for (const [k, w] of Object.entries(words)) expect(cardKindLabel(k as CardKind)).toBe(w);
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
    // A hull sails with armor / speed / turning / a deck gun fitted, so the
    // first card of one of those is I → II rather than the purchase of a Tier I.
    expect(cardTierLabel(CATALOG.armor, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.speed, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.turning, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.deckGun, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.armor, 2)).toBe('III → IV');
  });

  it('reads every OTHER ladder and every weapon as a bare I on its first copy', () => {
    expect(cardTierLabel(CATALOG.radarSweep, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.reload, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.deckGunTurret, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 0)).toBe('I');
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
    expect(cardTierLabel(CATALOG.decoyBuoy, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.dazzleShells, 0)).toBeNull();
  });

  it('carries the same step as NUMBERS, so the DOM can tint each numeral', () => {
    expect(cardTierSteps(CATALOG.armor, 0)).toEqual({ cur: 1, next: 2 });
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
    expect(cardTierLabel(CATALOG.armor, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.speed, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.turning, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.deckGun, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.radarSweep, 5)).toBe('V');
    // A ONE-RUNG ladder is at its ceiling the moment it is held: the TURRET is
    // fitted once and has nowhere to climb.
    expect(cardTierLabel(CATALOG.deckGunTurret, 1)).toBe('I');
    expect(cardTierSteps(CATALOG.armor, 4)).toEqual({ cur: 5, next: null });
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
    expect(cardTierLabel(CATALOG.armor, 3)).toBe('IV → V');
    expect(cardTierLabel(CATALOG.armor, 2)).toBe('III → IV');
    expect(cardTierLabel(CATALOG.radarSweep, 4)).toBe('IV → V');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 4)).toBe('IV → V');
    expect(cardTierSteps(CATALOG.armor, 2)).toEqual({ cur: 3, next: 4 });
    expect(cardTierSteps(CATALOG.deckGunTurret, 0)).toEqual({ cur: 1, next: null });
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
      ...CATALOG.armor,
      cap: 5,
      tiers: [...CATALOG.armor.tiers, CATALOG.armor.tiers[0]],
    } as CatalogLine;
    expect(cardTierLabel(overCapped, 4)).toBe('V');
  });
});

describe('the fitted toast', () => {
  it('names the line that was fitted and carries the accrued-card diamond', () => {
    expect(boonFitToastLine('reload', 1)).toBe('◆ RELOAD FITTED');
    expect(boonFitToastLine('reload', 3)).toBe('◆ RELOAD FITTED');
    expect(boonFitToastLine('heavyTorpedo', 1)).toBe('◆ HEAVY TORPEDO FITTED');
  });

  it('floors a defensive 0 rather than going blank', () => {
    expect(boonFitToastLine('reload', 0)).toBe('◆ RELOAD FITTED');
  });

  it('fails open on an unknown id', () => {
    expect(boonFitToastLine('someFutureCard', 1)).toBe('◆ Some Future Card FITTED');
  });

  // STORY 8.7, RULING 14 (UX-DR48's "consumable stocked"). Nothing about the
  // hull changed when a consumable lands — a copy went onto the belt — so the
  // verb has to say so or the toast claims a fit that never happened.
  it('says STOCKED for a consumable line, and FITTED for every other kind', () => {
    expect(boonFitToastLine('hullRepair', 1, 'consumable')).toBe('◆ HULL REPAIR STOCKED');
    expect(boonFitToastLine('decoyBuoy', 2, 'consumable')).toBe('◆ DECOY BUOY STOCKED');
    expect(boonFitToastLine('reload', 1, 'ladder')).toBe('◆ RELOAD FITTED');
    expect(boonFitToastLine('heavyTorpedo', 1, 'equipment')).toBe('◆ HEAVY TORPEDO FITTED');
    // FLASH SHELLS (`dazzleShells`) is a CONSUMABLE since Story 8.17 (amendment
    // 132) — stocked, and under its new display name.
    expect(boonFitToastLine('dazzleShells', 1, 'consumable')).toBe('◆ FLASH SHELLS STOCKED');
    // An add-on (the kind the catalog keeps, unused) still reads FITTED.
    expect(boonFitToastLine('someFutureAddon', 1, 'addon')).toBe('◆ Some Future Addon FITTED');
  });

  it('keeps the pre-8.7 default when no kind is passed or the kind is unknown', () => {
    expect(boonFitToastLine('hullRepair', 1)).toBe('◆ HULL REPAIR FITTED');
    expect(boonFitToastLine('hullRepair', 1, 'someFutureKind')).toBe('◆ HULL REPAIR FITTED');
  });
});

describe('the tooltip effect line (Story 2.9) — the HOLDING, not the sales pitch', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  it('reports a stat line\'s LIVE value, with no current→next arrow', () => {
    expect(boonEffectLine('armor', bare)).toBe(`Max hull: ${bare.maxHp}`);
    expect(boonEffectLine('armor', bare)).not.toContain('→');
    expect(boonEffectLine('radarSweep', bare)).toBe(`Radar sweep: ${bare.sweepRpm} RPM`);
    expect(boonEffectLine('reload', bare)).toBe('All cooldowns: 100%');
    // TURNING in whole degrees per second (Eric 2026-09-30): 0.8 rad/s → 46°/s.
    expect(boonEffectLine('turning', bare)).toBe('Turning: 46°/s');
  });

  it('MOVES with the fitted stack (it reads the firewall\'s output, not CONFIG)', () => {
    const stacked = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['armor', 'armor']);
    expect(boonEffectLine('armor', stacked)).not.toBe(boonEffectLine('armor', bare));
    expect(boonEffectLine('armor', stacked)).toBe(`Max hull: ${stacked.maxHp}`);
  });

  it('reports the value only — never the card\'s sales pitch or its explanation', () => {
    expect(boonEffectLine('armor', bare)).not.toContain('Repairs');
  });

  // A verb card's holding row was its own short table until STORY 8.17 emptied
  // it (amendment 134), and cycle 158 deleted the empty table: PHOSPHOR SHELLS
  // holds its own RELOAD like every weapon line.
  it('a former add-on holds a NUMBER now — PHOSPHOR SHELLS reports its reload', () => {
    const phos = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['phosphorShells']);
    const holding = boonEffectLine('phosphorShells', phos);
    expect(holding).toBe(`Reload: ${(phos.equipment.phosphorShells.reloadMs / 1000).toFixed(1)} s`);
  });

  it('fails open to \'\' for a line with no headline stat', () => {
    // A STUB equipment line has no built weapon to read a holding off, so it
    // reports its `◆ NAME` row alone — the honest readout. A LIVE one prints
    // the reload it is actually carrying.
    expect(boonEffectLine('depthCharge', bare)).toBe('');
    expect(boonEffectLine('notARealCard', bare)).toBe('');
    expect(boonEffectLine('heavyTorpedo', bare)).toBe('Reload: 30.0 s');
  });
});
