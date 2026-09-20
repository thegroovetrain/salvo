// THE RATIFIED CARD'S FIVE STAT ROWS (Story 8.7, ruling 12) — the numbers that
// replaced the interim face's one prose sentence.
//
// What this suite is for: the rows are the ONLY place a number reaches the refit
// card, and every one of them has to be (a) labelled with the word the rest of
// the game already uses for that stat, (b) computed through `effectiveStats` so
// the card can never promise a step the firewall would not produce, and (c)
// printed as an INTEGER where the underlying number is one (epic-8 amendment
// 39: no row ever prints a fraction of a damage value).
//
// The values below are the REAL catalog numbers, written out rather than
// recomputed from the same function the code uses — a test that derives its
// expectation from the implementation proves nothing. When a CONFIG retune moves
// one, this file is where the move becomes visible.

import { describe, expect, it } from 'vitest';
import { CATALOG, CONFIG, LINE_IDS, effectiveStats, isStubLine, type CatalogLine } from '@salvo/shared';
import { CARD_STAT_ROWS, cardStatRows, cardTierLabel } from '../ui/boonCopy.js';

/** A torpedo boat with nothing fitted — the hull every value below is read on. */
const TB = { cls: 'torpedoBoat' as const, cards: [] as string[] };

/** The same hull with `n` copies of one line already aboard. */
function held(id: string, n: number): typeof TB {
  return { cls: 'torpedoBoat', cards: Array<string>(n).fill(id) };
}

describe('cardStatRows — LADDER lines print the one number they move', () => {
  it('labels ARMOR with the word the rest of the game uses, and prints integers', () => {
    // The torpedo boat's base hull is 250 and ARMOR adds 25 a rung, so two
    // copies held puts the card at 300 → 325 — the I/O matrix's own example,
    // and whole numbers on both sides (amendment 39).
    expect(cardStatRows(CATALOG.armor, 2, held('armor', 2))).toEqual([
      { label: 'MAX HULL', cur: '300', next: '325' },
    ]);
  });

  it('reads the FIRST copy against a bare hull', () => {
    expect(cardStatRows(CATALOG.armor, 0, TB)).toEqual([
      { label: 'MAX HULL', cur: '250', next: '275' },
    ]);
  });

  it('carries each ladder\'s own label and its own printer', () => {
    const labels = (line: CatalogLine): string[] =>
      cardStatRows(line, 0, TB).map((r) => r.label);
    expect(labels(CATALOG.speed)).toEqual(['TOP SPEED']);
    expect(labels(CATALOG.turning)).toEqual(['TURNING']);
    expect(labels(CATALOG.radarSweep)).toEqual(['RADAR SWEEP']);
    expect(labels(CATALOG.reload)).toEqual(['ALL COOLDOWNS']);
    expect(labels(CATALOG.deckGun)).toEqual(['GUN DAMAGE']);
    expect(labels(CATALOG.deckGunTurret)).toEqual(['GUN ROUNDS READY']);
    expect(labels(CATALOG.deckGunBarrel)).toEqual(['SHELLS PER SHOT']);
  });

  it('keeps the RPM and PERCENTAGE printers the hover panel already uses', () => {
    const sweep = cardStatRows(CATALOG.radarSweep, 0, TB)[0];
    expect(sweep.cur).toMatch(/ RPM$/);
    expect(sweep.next).toMatch(/ RPM$/);
    const cooldowns = cardStatRows(CATALOG.reload, 0, TB)[0];
    expect(cooldowns).toEqual({ label: 'ALL COOLDOWNS', cur: '100%', next: '95%' });
  });

  it('prints the DECK GUN ladder in whole hit points (amendment 39)', () => {
    // Eric's own scale: 15 → 16 → 17 → 18 → 20, floored once post-fold. Nothing
    // on this row may show the +1.25 the catalog actually authors.
    const steps = [0, 1, 2, 3].map((k) => cardStatRows(CATALOG.deckGun, k, held('deckGun', k))[0]);
    expect(steps.map((r) => [r.cur, r.next])).toEqual([
      ['15', '16'], ['16', '17'], ['17', '18'], ['18', '20'],
    ]);
    for (const r of steps) {
      expect(r.cur).not.toContain('.');
      expect(r.next).not.toContain('.');
    }
  });
});

describe('cardStatRows — a WEAPON\'s first copy prints its whole table', () => {
  it('prints HEAVY TORPEDO absolutely, in EQUIPMENT_STAT_FIELDS order', () => {
    // No `cur`, no arrow: the first copy buys the WEAPON, not a step.
    // HOMING joined the table in Story 8.13 (epic-8 amendment 80): it is a TIER
    // STAT now, zero at tier I — which is exactly what "a straight-runner" is —
    // and the row says so rather than the card staying silent about steering.
    expect(cardStatRows(CATALOG.heavyTorpedo, 0, TB)).toEqual([
      { label: 'RELOAD', cur: null, next: '30.0 s' },
      { label: 'ROUNDS', cur: null, next: '1' },
      { label: 'SPEED', cur: null, next: '65' },
      { label: 'DAMAGE', cur: null, next: '50' },
      { label: 'HOMING TURN RATE', cur: null, next: '0' },
    ]);
  });

  // STORY 8.13 — the LIGHT TORPEDO's own table, off its own CONFIG block.
  it('prints LIGHT TORPEDO off its OWN block, never the heavy fish\'s numbers', () => {
    expect(cardStatRows(CATALOG.lightTorpedo, 0, TB)).toEqual([
      { label: 'RELOAD', cur: null, next: '25.0 s' },
      { label: 'ROUNDS', cur: null, next: '1' },
      { label: 'SPEED', cur: null, next: '45' },
      { label: 'DAMAGE', cur: null, next: '40' },
      { label: 'HOMING TURN RATE', cur: null, next: '0' },
    ]);
  });

  // THE CAPTIVE MINE'S DEFINING CIRCLE. It has no `blastRadius` FIELD at all
  // (its 32 u burst is fixed and its trip ring is derived from the TIER —
  // epic-8 amendment 84d), so the derived TRIGGER RADIUS row follows DAMAGE
  // here instead of the blast. Without that, the one number that makes a
  // captive mine a trap would never reach its own card.
  it('gives CAPTIVE MINES its tier-derived TRIP RING and its FISH\'s damage', () => {
    const rows = cardStatRows(CATALOG.captiveMines, 0, TB);
    expect(rows).toEqual([
      { label: 'RELOAD', cur: null, next: '20.0 s' },
      { label: 'ROUNDS', cur: null, next: '1' },
      { label: 'DAMAGE', cur: null, next: '55' },
      { label: 'TRIGGER RADIUS', cur: null, next: '144' },
      { label: 'HOMING TURN RATE', cur: null, next: '0' },
    ]);
    // No blast circle is printed, because the fish's 32 u burst is not a circle
    // around the mine and the line never widens it.
    expect(rows.map((r) => r.label)).not.toContain('BLAST RADIUS');
  });

  // FOULING MINES — the one line whose table plus its derived ring overflows
  // the five-row grid, so the face drops RELOAD (every TIER card of the line
  // prints it as a live diff) and keeps SLOW, which is the whole point of the
  // weapon. The factor prints as a PERCENTAGE OF SPEED, never as a bare 0.75.
  it('gives FOULING MINES the mine rows plus its SLOW, as a percentage', () => {
    const rows = cardStatRows(CATALOG.foulingMines, 0, TB);
    expect(rows).toEqual([
      { label: 'ROUNDS', cur: null, next: '2' },
      { label: 'DAMAGE', cur: null, next: '10' },
      { label: 'BLAST RADIUS', cur: null, next: '72' },
      { label: 'TRIGGER RADIUS', cur: null, next: '48' },
      { label: 'SLOW', cur: null, next: '75%' },
    ]);
    expect(rows).toHaveLength(CARD_STAT_ROWS);
  });

  it('gives NAVAL MINES its derived TRIGGER RADIUS as its own row, after the blast', () => {
    // UX-DR50's "separate rows". The trip ring is derived in clampStats, so it
    // is not stat-addressable and would otherwise never reach the player.
    const rows = cardStatRows(CATALOG.navalMines, 0, TB);
    expect(rows).toEqual([
      { label: 'RELOAD', cur: null, next: '15.0 s' },
      { label: 'ROUNDS', cur: null, next: '2' },
      { label: 'DAMAGE', cur: null, next: '55' },
      { label: 'BLAST RADIUS', cur: null, next: '48' },
      { label: 'TRIGGER RADIUS', cur: null, next: '32' },
    ]);
    // ...and the two really are adjacent and in that order.
    const labels = rows.map((r) => r.label);
    expect(labels.indexOf('TRIGGER RADIUS')).toBe(labels.indexOf('BLAST RADIUS') + 1);
  });

  it('prints copies 2 and up as the TIER step — that weapon\'s own reload', () => {
    const rows = cardStatRows(CATALOG.heavyTorpedo, 1, held('heavyTorpedo', 1));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('RELOAD');
    expect(rows[0].cur).toBe('30.0 s');
    // A tier is a cut, so the next value is strictly smaller.
    expect(Number.parseFloat(rows[0].next)).toBeLessThan(30);
  });
});

// --- THE FIRST LIVE CONSUMABLE (Story 8.8) -------------------------------------
//
// HULL REPAIR is the one consumable with a mechanism behind it, and a consumable
// fits nothing: there is no preview diff to read, so both its rows are ABSOLUTE
// (`cur` null, no arrow) exactly like a weapon's first copy. The numbers come
// out of CONFIG and are NEVER hardcoded on the face — this suite writes the real
// catalog numbers out so a retune of the ruling becomes visible HERE.

describe('cardStatRows — HULL REPAIR, the first live consumable', () => {
  it('prints the two rows the card face carries, in order, with no arrow', () => {
    const rows = cardStatRows(CATALOG.hullRepair, 0, TB);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ label: 'INSTANT', cur: null, next: '+50 HP' });
    // Epic-8 amendment 51: the shipped pool pays 50 hp over 5 s. It is printed
    // as the AMOUNT over its TIME, never as a rate — the "5 hp/s" in R13/FR47 is
    // a stale figure, and pools ADD rather than accelerate.
    expect(rows[1]).toEqual({ label: 'OVER TIME', cur: null, next: '+50 HP / 5 S' });
    expect(rows[1].next).not.toContain('/S');
    for (const r of rows) expect(r.cur, r.label).toBeNull();
  });

  it('reads every number off CONFIG.hullRepair, never a literal', () => {
    const h = CONFIG.hullRepair;
    const rows = cardStatRows(CATALOG.hullRepair, 0, TB);
    expect(rows[0].next).toContain(String(h.instantHp));
    expect(rows[1].next).toContain(String(h.regenHp));
    expect(rows[1].next).toContain(String(h.regenMs / 1000));
  });

  it('prints the SAME two rows on every hull and at every copy held', () => {
    const base = cardStatRows(CATALOG.hullRepair, 0, TB);
    for (const cls of Object.keys(CONFIG.shipClasses)) {
      for (let k = 0; k < CATALOG.hullRepair.cap; k += 1) {
        const rows = cardStatRows(CATALOG.hullRepair, k, {
          cls: cls as never,
          cards: Array<string>(k).fill('hullRepair'),
        });
        expect(rows, `${cls}@${k}`).toEqual(base);
      }
    }
  });

  it('fits the five-row grid with room to spare', () => {
    expect(cardStatRows(CATALOG.hullRepair, 0, TB).length).toBeLessThanOrEqual(CARD_STAT_ROWS);
  });
});

describe('cardStatRows — the lines that legitimately print NOTHING', () => {
  it('gives an ADD-ON no rows: a verb moves no number', () => {
    // ACOUSTIC HOMING and the FOULING MINES add-on were DELETED in Story 8.13
    // (epic-8 amendments 80/81) — both of those ids now print real rows or none
    // at all for entirely different reasons, so the claim is made on the three
    // add-ons that survive.
    expect(cardStatRows(CATALOG.heatSeeking, 0, TB)).toEqual([]);
    expect(cardStatRows(CATALOG.dazzleShells, 0, TB)).toEqual([]);
    expect(cardStatRows(CATALOG.phosphorShells, 0, TB)).toEqual([]);
  });

  it('gives a STILL-STUB CONSUMABLE no rows (DEPTH CHARGE included)', () => {
    for (const id of ['shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'depthCharge'] as const) {
      expect(cardStatRows(CATALOG[id], 0, TB), id).toEqual([]);
    }
  });

  // THE SECOND LIVE CONSUMABLE (Story 8.13, epic-8 amendment 74) — and the
  // first that is a weapon. Two absolute rows, both straight off CONFIG, and no
  // reload row because a consumable never reloads.
  it('gives SUPERCAV TORPEDO its two CONFIG rows and no reload', () => {
    const rows = cardStatRows(CATALOG.supercavTorpedo, 0, TB);
    expect(rows).toEqual([
      { label: 'SPEED', cur: null, next: String(CONFIG.supercavTorpedo.speed) },
      { label: 'DAMAGE', cur: null, next: String(CONFIG.supercavTorpedo.damage) },
    ]);
    expect(rows.map((r) => r.label)).not.toContain('RELOAD');
  });

  it('gives a STUB line no rows — there is no built module to read', () => {
    for (const id of LINE_IDS) {
      if (!isStubLine(id)) continue;
      expect(cardStatRows(CATALOG[id], 0, TB), id).toEqual([]);
    }
  });

  it('fails OPEN on an unresolvable hull rather than throwing from the ticker', () => {
    const rows = cardStatRows(CATALOG.armor, 0, { cls: 'notAHull' as never, cards: [] });
    expect(rows).toEqual([]);
  });
});

describe('cardStatRows — the laws the five-row grid imposes', () => {
  const NON_STUB = LINE_IDS.map((id) => CATALOG[id]).filter((l) => l.stub !== true);

  it('never returns more rows than the grid has (the mock\'s five)', () => {
    const over: string[] = [];
    for (const line of NON_STUB) {
      for (let k = 0; k < line.cap; k += 1) {
        for (const cls of Object.keys(CONFIG.shipClasses)) {
          const rows = cardStatRows(line, k, { cls: cls as never, cards: Array<string>(k).fill(line.id) });
          if (rows.length > CARD_STAT_ROWS) over.push(`${line.id}@${k}/${cls}: ${rows.length}`);
        }
      }
    }
    expect(over).toEqual([]);
  });

  it('gives every LADDER and every WEAPON at least one row, at every rung', () => {
    const silent: string[] = [];
    for (const line of NON_STUB) {
      if (line.kind === 'addon' || line.kind === 'consumable') continue;
      for (let k = 0; k < line.cap; k += 1) {
        const rows = cardStatRows(line, k, held(line.id, k));
        if (rows.length === 0) silent.push(`${line.id}@${k}`);
      }
    }
    expect(silent).toEqual([]);
  });

  it('labels every row with a non-empty uppercase word and prints a value', () => {
    for (const line of NON_STUB) {
      for (let k = 0; k < line.cap; k += 1) {
        for (const row of cardStatRows(line, k, held(line.id, k))) {
          expect(row.label, `${line.id}@${k}`).toBe(row.label.toUpperCase());
          expect(row.label.length, `${line.id}@${k}`).toBeGreaterThan(0);
          expect(row.next.length, `${line.id}@${k}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('reads every value through effectiveStats — a class change moves the numbers', () => {
    const tb = cardStatRows(CATALOG.armor, 0, { cls: 'torpedoBoat', cards: [] })[0];
    const bb = cardStatRows(CATALOG.armor, 0, { cls: 'battleship', cards: [] })[0];
    expect(bb.cur).not.toBe(tb.cur);
    expect(Number(bb.cur)).toBe(effectiveStats(CONFIG.shipClasses.battleship, []).maxHp);
  });
});

describe('cardTierLabel pairs with the rows — UX-DR51\'s four examples', () => {
  it('reads armor k=0 as I → II, radarSweep k=0 as I, heavyTorpedo k=1 as I → II', () => {
    expect(cardTierLabel(CATALOG.armor, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.radarSweep, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 1)).toBe('I → II');
    expect(cardTierLabel(CATALOG.hullRepair, 0)).toBeNull();
  });
});
