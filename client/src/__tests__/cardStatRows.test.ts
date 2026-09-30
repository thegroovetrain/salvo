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
      { label: 'HOMING', cur: null, next: '0 rad/s' },
    ]);
  });

  // STORY 8.13 — the LIGHT TORPEDO's own table, off its own CONFIG block.
  it('prints LIGHT TORPEDO off its OWN block, never the heavy fish\'s numbers', () => {
    expect(cardStatRows(CATALOG.lightTorpedo, 0, TB)).toEqual([
      { label: 'RELOAD', cur: null, next: '25.0 s' },
      { label: 'ROUNDS', cur: null, next: '1' },
      { label: 'SPEED', cur: null, next: '45' },
      { label: 'DAMAGE', cur: null, next: '40' },
      { label: 'HOMING', cur: null, next: '0 rad/s' },
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
      { label: 'HOMING', cur: null, next: '0 rad/s' },
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

  it('prints copies 2 and up as the TIER step — that weapon\'s own reload FIRST', () => {
    const rows = cardStatRows(CATALOG.heavyTorpedo, 1, held('heavyTorpedo', 1));
    expect(rows[0].label).toBe('RELOAD');
    expect(rows[0].cur).toBe('30.0 s');
    // A tier is a cut, so the next value is strictly smaller.
    expect(Number.parseFloat(rows[0].next)).toBeLessThan(30);
  });

  // THE LAST EMPTY LADDERS ARE AUTHORED (Story 8.17, Eric ruling 2026-09-29,
  // amendments 130/131/133/135(j)). BROADSIDE and STAR SHELLS printed only the
  // reload row until now; they — and the new PHOSPHOR SHELLS line — print the
  // reload step and then every authored step whose DISPLAYED value moves
  // (amendment 87(b): a +0.5 flare / turret that floors back is skipped).
  it('STAR SHELLS: RELOAD, LIT, RADIUS, (FLARES on the whole step), DAMAGE', () => {
    const t2 = cardStatRows(CATALOG.starShells, 1, held('starShells', 1));
    expect(t2.map((r) => r.label)).toEqual(['RELOAD', 'LIT', 'RADIUS', 'DAMAGE']); // 1.5 flares floors to 1
    expect(t2[1]).toEqual({ label: 'LIT', cur: '10.0 s', next: '12.5 s' });
    expect(t2[3]).toEqual({ label: 'DAMAGE', cur: '10', next: '12' });
    const t3 = cardStatRows(CATALOG.starShells, 2, held('starShells', 2));
    expect(t3.map((r) => r.label)).toEqual(['RELOAD', 'LIT', 'RADIUS', 'FLARES', 'DAMAGE']);
    expect(t3[3]).toEqual({ label: 'FLARES', cur: '1', next: '2' });
    expect(t3[4]).toEqual({ label: 'DAMAGE', cur: '12', next: '15' });
  });

  it('BROADSIDE: RELOAD, SPREAD, and TURRETS on the whole step', () => {
    const t2 = cardStatRows(CATALOG.broadside, 1, held('broadside', 1));
    expect(t2.map((r) => r.label)).toEqual(['RELOAD', 'SPREAD']); // 4.5 turrets floors to 4
    expect(t2[1]).toEqual({ label: 'SPREAD', cur: '1', next: '2' });
    const t3 = cardStatRows(CATALOG.broadside, 2, held('broadside', 2));
    expect(t3.map((r) => r.label)).toEqual(['RELOAD', 'SPREAD', 'TURRETS']);
    expect(t3[2]).toEqual({ label: 'TURRETS', cur: '4', next: '5' });
  });

  it('PHOSPHOR SHELLS: RELOAD, DAMAGE, BURN (hp/s), RADIUS, and LASTS where it moves', () => {
    const t2 = cardStatRows(CATALOG.phosphorShells, 1, held('phosphorShells', 1));
    expect(t2.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS']); // no duration step at II
    expect(t2[2]).toEqual({ label: 'BURN', cur: '5', next: '6 hp/s' });
    expect(t2[3]).toEqual({ label: 'RADIUS', cur: '100', next: '110' });
    const t3 = cardStatRows(CATALOG.phosphorShells, 2, held('phosphorShells', 2));
    expect(t3.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS', 'LASTS']);
    expect(t3[4]).toEqual({ label: 'LASTS', cur: '8.0 s', next: '9.0 s' });
    // Tier IV omits LASTS again; tier V is the fullest face and still FITS the
    // five-row grid exactly (RELOAD + the four authored steps).
    const t4 = cardStatRows(CATALOG.phosphorShells, 3, held('phosphorShells', 3));
    expect(t4.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS']);
    const t5 = cardStatRows(CATALOG.phosphorShells, 4, held('phosphorShells', 4));
    expect(t5.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS', 'LASTS']);
    expect(t5).toHaveLength(CARD_STAT_ROWS);
    expect(t5[1]).toEqual({ label: 'DAMAGE', cur: '27', next: '30' });
    expect(t5[2]).toEqual({ label: 'BURN', cur: '8', next: '10 hp/s' });
  });

  // PHOSPHOR's FIT card: six stat fields against a five-row grid, so it drops
  // ROUNDS (a one-shell pool no tier moves) and keeps BURN — the positional
  // slice would have dropped the one number that makes it a burning weapon.
  it('PHOSPHOR SHELLS fit card keeps BURN and drops ROUNDS', () => {
    const rows = cardStatRows(CATALOG.phosphorShells, 0, TB);
    expect(rows.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'RADIUS', 'LASTS', 'BURN']);
    expect(rows[4]).toEqual({ label: 'BURN', cur: null, next: '5 hp/s' });
  });
});

// --- THE TIER FACE PRINTS EVERY STEP IT BUYS (Story 8.13, amendment 85) --------
//
// The shipped tier face printed ONE row — the reload — by the deck-gun
// precedent (amendment 71). That understated the five ladders this story
// authored: a tier-II LIGHT TORPEDO card said only `RELOAD 25.0 s → 23.8 s`
// while also buying +5 damage, +2.5 u/s and the first 0.125 rad/s of homing.
// Eric's answer: the reload step PLUS every stat effect the tier authors, in
// catalog order, on the existing five-row grid at the existing type sizes.
//
// The numbers below are the REAL catalog numbers written out, this file's rule.

describe('cardStatRows — a TIER card prints its reload step AND every authored effect', () => {
  /** Every row of `line` at `copiesHeld`, as `LABEL cur>next` strings. */
  function face(id: string, copiesHeld: number): string[] {
    return cardStatRows(CATALOG[id], copiesHeld, held(id, copiesHeld))
      .map((r) => `${r.label} ${r.cur ?? ''}>${r.next}`);
  }

  // THE RULING'S OWN EXAMPLE, pinned exactly: reload first, then the catalog's
  // own effect order (damage, speed, tubes, homing).
  //
  // THE TUBE ROW IS ABSENT AT TIER II, and that is the cycle-148 review gate's
  // P5: the line authors +0.5 tubes per tier against an INTEGER pool, so the
  // fold FLOORS tier II back to the one tube it already had. `ROUNDS 1 → 1`
  // promised a round the card was not buying. The half-tube is still bought and
  // still lands — at tier III, where the row appears (below).
  it('LIGHT TORPEDO II: reload, damage, speed and homing — no ROUNDS 1 → 1', () => {
    expect(cardStatRows(CATALOG.lightTorpedo, 1, held('lightTorpedo', 1))).toEqual([
      { label: 'RELOAD', cur: '25.0 s', next: '23.8 s' },
      { label: 'DAMAGE', cur: '40', next: '45' },
      { label: 'SPEED', cur: '45', next: '47.5' },
      { label: 'HOMING', cur: '0', next: '0.125 rad/s' },
    ]);
  });

  // ...AND TIER III IS WHERE THE TUBE ACTUALLY LANDS: the two authored halves
  // have added up to a whole round, so the row is back, and it is true.
  it('LIGHT TORPEDO III prints the ROUNDS step the floored tier II did not buy', () => {
    expect(face('lightTorpedo', 2)).toEqual([
      'RELOAD 23.8 s>22.5 s',
      'DAMAGE 45>50',
      'SPEED 47.5>50',
      'ROUNDS 1>2',
      'HOMING 0.125>0.25 rad/s',
    ]);
  });

  it('LIGHT TORPEDO V is the same five rows at the top of the ladder', () => {
    expect(face('lightTorpedo', 4)).toEqual([
      'RELOAD 21.3 s>20.0 s',
      'DAMAGE 55>60',
      'SPEED 52.5>55',
      'ROUNDS 2>3',
      'HOMING 0.375>0.5 rad/s',
    ]);
  });

  it('HEAVY TORPEDO prints the same five rows off its own block, at II and at V', () => {
    expect(face('heavyTorpedo', 1)).toEqual([
      'RELOAD 30.0 s>28.5 s',
      'DAMAGE 50>55',
      'SPEED 65>67.5',
      // no ROUNDS row: the tier-II half-tube floors back to one (P5)
      'HOMING 0>0.125 rad/s',
    ]);
    expect(face('heavyTorpedo', 4)).toEqual([
      'RELOAD 25.5 s>24.0 s',
      'DAMAGE 65>70',
      'SPEED 72.5>75',
      'ROUNDS 2>3',
      'HOMING 0.375>0.5 rad/s',
    ]);
  });

  it('NAVAL MINES prints reload, damage, blast and pool — four rows, no homing', () => {
    expect(face('navalMines', 1)).toEqual([
      'RELOAD 15.0 s>14.3 s',
      'DAMAGE 55>60',
      'BLAST RADIUS 48>52.8',
      'ROUNDS 2>3',
    ]);
    expect(face('navalMines', 4)).toEqual([
      'RELOAD 12.8 s>12.0 s',
      'DAMAGE 70>75',
      'BLAST RADIUS 63.9>70.3',
      'ROUNDS 5>6',
    ]);
  });

  // The captive line buys its FISH's damage, another moored mine and the
  // fish's steering; the trip ring grows too but is DERIVED from the tier
  // (amendment 84d), so it is not an authored effect and gets no tier row.
  it('CAPTIVE MINES prints reload, damage, held and homing — never its derived trip ring', () => {
    expect(face('captiveMines', 1)).toEqual([
      'RELOAD 20.0 s>19.0 s',
      'DAMAGE 55>60',
      // no ROUNDS row: the tier-II half-mine floors back to one (P5)
      'HOMING 0>0.075 rad/s',
    ]);
    expect(face('captiveMines', 4)).toEqual([
      'RELOAD 17.0 s>16.0 s',
      'DAMAGE 70>75',
      'ROUNDS 2>3',
      'HOMING 0.225>0.3 rad/s',
    ]);
    for (let k = 1; k < CATALOG.captiveMines.cap; k += 1) {
      expect(face('captiveMines', k).some((r) => r.startsWith('TRIGGER RADIUS'))).toBe(false);
    }
  });

  // FOULING MINES' damage is FIXED at 10 (amendment 81), so its tier authors
  // no damage effect and no damage row — the tier buys blast, pool and SLOW.
  it('FOULING MINES prints reload, blast, pool and its deepening SLOW — and no damage row', () => {
    expect(face('foulingMines', 1)).toEqual([
      'RELOAD 15.0 s>14.3 s',
      'BLAST RADIUS 72>79.2',
      'ROUNDS 2>3',
      'SLOW 75%>70%',
    ]);
    expect(face('foulingMines', 4)).toEqual([
      'RELOAD 12.8 s>12.0 s',
      'BLAST RADIUS 95.8>105.4',
      'ROUNDS 5>6',
      'SLOW 60%>55%',
    ]);
  });

  // THE LAW, over every line and every rung: a tier card carries the reload row
  // plus exactly one row per `stat` effect the tier actually MOVES, in catalog
  // order, and the grid never overflows. The walk is over every authored line —
  // counting the steps that change, which is the cycle-148 P5 rule stated as a
  // law rather than as a list of lines.
  it('carries one row per CHANGED stat effect, reload first, for EVERY equipment line at EVERY rung', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      if (line.kind !== 'equipment' || line.stub === true) continue;
      for (let k = 1; k < line.cap; k += 1) {
        const rows = cardStatRows(line, k, held(id, k));
        expect(rows.length, `${id}@${k}`).toBe(Math.min(1 + changedSteps(line, k), CARD_STAT_ROWS));
        expect(rows[0].label, `${id}@${k}`).toBe('RELOAD');
        for (const row of rows) expect(row.cur, `${id}@${k}`).not.toBeNull();
      }
    }
  });

  /** How many of `line`'s authored stat steps at rung `k` actually MOVE the
   *  number they address — folded straight through `effectiveStats`, never read
   *  off the rows under test, so the law is an independent statement. */
  function changedSteps(line: CatalogLine, k: number): number {
    const cls = CONFIG.shipClasses.torpedoBoat;
    const before = effectiveStats(cls, Array<string>(k).fill(line.id));
    const after = effectiveStats(cls, Array<string>(k + 1).fill(line.id));
    let moved = 0;
    for (const e of line.tiers[k] ?? []) {
      if (e.kind === 'stat' && statAt(before, e.path) !== statAt(after, e.path)) moved += 1;
    }
    return moved;
  }

  /** Read a dotted stat path off a fold (the test's own reader). */
  function statAt(stats: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>(
      (o, key) => (o === null || typeof o !== 'object' ? undefined : (o as Record<string, unknown>)[key]),
      stats,
    );
  }

  // THE DECK GUN FACE IS UNCHANGED (amendment 85 keeps amendment 71): it is a
  // LADDER, not an equipment line, so it never touches the tier-card rule —
  // one authored damage row, and its tier-derived reload cut stays silent.
  it('leaves the DECK GUN family exactly as amendment 71 ruled it — one row', () => {
    expect(cardStatRows(CATALOG.deckGun, 1, held('deckGun', 1))).toEqual([
      { label: 'GUN DAMAGE', cur: '16', next: '17' },
    ]);
    expect(face('deckGunTurret', 0)).toEqual(['GUN ROUNDS READY 1>2']);
    expect(face('deckGunBarrel', 1)).toEqual(['SHELLS PER SHOT 2>3']);
    for (const id of ['deckGun', 'deckGunTurret', 'deckGunBarrel'] as const) {
      for (let k = 0; k < CATALOG[id].cap; k += 1) {
        expect(cardStatRows(CATALOG[id], k, held(id, k)), `${id}@${k}`).toHaveLength(1);
      }
    }
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
    // NO add-on survives in the catalog since Story 8.17 (amendment 134): the
    // last two became an equipment line and the FLASH SHELLS consumable, and
    // both print real rows (pinned above and below). The `addon` kind stays in
    // place, unused, so the claim is made on an INJECTED add-on line.
    const addon: CatalogLine = {
      id: 'injectedAddon' as CatalogLine['id'],
      kind: 'addon',
      cap: 1,
      tiers: [[{ kind: 'doctrine', weapon: 'starShells', mode: 'injected' }]],
      appliesTo: ['starShells'],
    };
    expect(cardStatRows(addon, 0, TB)).toEqual([]);
  });

  // FLASH SHELLS (Story 8.17, amendment 135(j)): absolute rows, every number off
  // CONFIG.flashShells, in the 8.16 belt register's uppercase units.
  it('prints FLASH SHELLS as RADIUS 150 U / BLINDS 10 S / SIGHT 1/8 INTEL', () => {
    expect(cardStatRows(CATALOG.dazzleShells, 0, TB)).toEqual([
      { label: 'RADIUS', cur: null, next: `${CONFIG.flashShells.radius} U` },
      { label: 'BLINDS', cur: null, next: `${CONFIG.flashShells.durationMs / 1000} S` },
      { label: 'SIGHT', cur: null, next: '1/8 INTEL' },
    ]);
  });

  it('gives a STILL-STUB CONSUMABLE no rows (DEPTH CHARGE)', () => {
    // TWO since Story 8.16 flipped SHIELD BLOCK, CHAFF and DECOY BUOY; ONE since
    // Story 8.18 flipped SMOKE SCREEN.
    expect(cardStatRows(CATALOG.depthCharge, 0, TB)).toEqual([]);
  });

  // SMOKE SCREEN (Story 8.18): DRAFT rows, every number off CONFIG.smokeScreen,
  // in the 8.16 belt register's uppercase units.
  it('gives SMOKE SCREEN its trail, puff life and growth, off CONFIG', () => {
    const k = CONFIG.smokeScreen;
    expect(cardStatRows(CATALOG.smokeScreen, 0, TB)).toEqual([
      { label: 'TRAIL', cur: null, next: `${k.layMs / 1000} S` },
      { label: 'PUFF', cur: null, next: `${k.lifeMs / 1000} S` },
      { label: 'RADIUS', cur: null, next: `${k.r0} → ${k.r1} U` },
    ]);
    // The 2026-09-30 radii (1/8 → 2/8 of intel range) through the row's
    // one-decimal `num()` formatter, as the card prints them.
    expect(cardStatRows(CATALOG.smokeScreen, 0, TB)[2].next).toBe('82.5 → 165 U');
  });

  // THE THREE 8.16 CONSUMABLES (catalog-v3 R36/R37/R39): absolute rows in the
  // hullRepair shape, every number read off CONFIG — never a literal.
  it('gives SHIELD BLOCK what it absorbs and how long it lasts, off CONFIG', () => {
    expect(cardStatRows(CATALOG.shieldBlock, 0, TB)).toEqual([
      { label: 'ABSORBS', cur: null, next: `${CONFIG.shieldBlock.hp} HP` },
      { label: 'LASTS', cur: null, next: `${CONFIG.shieldBlock.durationMs / 1000} S` },
    ]);
  });

  it('gives CHAFF its fake count, scatter radius and duration, off CONFIG', () => {
    expect(cardStatRows(CATALOG.chaff, 0, TB)).toEqual([
      { label: 'FAKES', cur: null, next: String(CONFIG.chaff.count) },
      { label: 'RADIUS', cur: null, next: `${CONFIG.chaff.radius} U` },
      { label: 'LASTS', cur: null, next: `${CONFIG.chaff.durationMs / 1000} S` },
    ]);
  });

  it('gives DECOY BUOY its hull and where it drops, off CONFIG', () => {
    expect(cardStatRows(CATALOG.decoyBuoy, 0, TB)).toEqual([
      { label: 'HULL', cur: null, next: `${CONFIG.decoyBuoy.hp} HP` },
      { label: 'DROP', cur: null, next: 'REAR ARC' },
    ]);
  });

  it('the three 8.16 rows are the same on every hull and at every copy count', () => {
    for (const id of ['shieldBlock', 'chaff', 'decoyBuoy'] as const) {
      const base = cardStatRows(CATALOG[id], 0, TB);
      expect(base.length, id).toBeGreaterThan(0);
      expect(cardStatRows(CATALOG[id], 3, { cls: 'battleship', cards: ['armor'] }), id).toEqual(base);
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

// --- THE TWO PICKABLE GUNS' LADDERS (Story 8.15, amendments 104/105) -----------
//
// A LADDER line each (the gun is the seat's pick, never a card), but each tier
// ALSO cuts that gun's reload by 5 % — so the tier card prints the reload step
// FIRST, then every authored step (amendments 85/87(b)): MACHINE GUN +2 shells
// and +1 damage per shell, FLAK +2 damage (blast fixed). The machine gun's pool
// is a MAGAZINE, so its row says SHELLS where every other pool says ROUNDS.
describe('cardStatRows — the machine gun and flak ladders (Story 8.15)', () => {
  function face(id: 'machineGun' | 'flak', copiesHeld: number): string[] {
    return cardStatRows(CATALOG[id], copiesHeld, held(id, copiesHeld)).map((r) => `${r.label} ${r.cur ?? ''}>${r.next}`);
  }

  it('MACHINE GUN tier II: RELOAD 15.0 s to 14.3 s, SHELLS 16 to 18, DAMAGE 4 to 5', () => {
    expect(face('machineGun', 0)).toEqual(['RELOAD 15.0 s>14.3 s', 'SHELLS 16>18', 'DAMAGE 4>5']);
  });

  it('MACHINE GUN tops out at 24 shells / 8 damage / 12.0 s at tier V', () => {
    expect(face('machineGun', 3)).toEqual(['RELOAD 12.8 s>12.0 s', 'SHELLS 22>24', 'DAMAGE 7>8']);
  });

  it('FLAK tier II: RELOAD 6.0 s to 5.7 s, DAMAGE 12 to 14 — and the blast never moves', () => {
    expect(face('flak', 0)).toEqual(['RELOAD 6.0 s>5.7 s', 'DAMAGE 12>14']);
    expect(face('flak', 3)).toEqual(['RELOAD 5.1 s>4.8 s', 'DAMAGE 18>20']);
    expect(face('flak', 3).some((r) => r.startsWith('BURST'))).toBe(false);
  });

  it('every rung of both ladders fits the five-row grid', () => {
    for (const id of ['machineGun', 'flak'] as const) {
      for (let k = 0; k < CATALOG[id].cap; k += 1) {
        const rows = cardStatRows(CATALOG[id], k, held(id, k));
        expect(rows.length, `${id}@${k}`).toBeGreaterThan(0);
        expect(rows.length, `${id}@${k}`).toBeLessThanOrEqual(CARD_STAT_ROWS);
      }
    }
  });
});
