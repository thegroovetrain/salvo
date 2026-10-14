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
import { CARD_STAT_ROWS, cardStatRows, cardTierLabel, shipStatRows } from '../ui/boonCopy.js';

/** A torpedo boat with nothing fitted — the hull every value below is read on. */
const TB = { cls: 'torpedoBoat' as const, cards: [] as string[] };

/** The same hull with `n` copies of one line already aboard. */
/**
 * THE RANGE ROW a gun card prints (Story 9.8, ruling 125: every card of a gun
 * line steps its reach by (V − I) / 4), read off the SAME fold the card reads —
 * never a literal. Whole units on the face (the orchestrator's display ruling;
 * the sim keeps the exact value), the unit on `next` alone (FIELD_UNITS).
 */
function rangeRow(
  line: string,
  w: 'gun' | 'machineGun' | 'flak' | 'broadside' | 'starShells' | 'phosphorShells',
  k: number,
): { label: string; cur: string; next: string } {
  const at = (n: number): number =>
    effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<string>(n).fill(line)).equipment[w].rangeU;
  return { label: 'RANGE', cur: String(Math.round(at(k))), next: `${Math.round(at(k + 1))} u` };
}
/** The same row as `face()` strings print it. */
function rangeLine(line: string, w: Parameters<typeof rangeRow>[1], k: number): string {
  const r = rangeRow(line, w, k);
  return `${r.label} ${r.cur}>${r.next}`;
}

function held(id: string, n: number): typeof TB {
  return { cls: 'torpedoBoat', cards: Array<string>(n).fill(id) };
}

describe('cardStatRows — LADDER lines print the one number they move', () => {
  it('labels HULL with the word the rest of the game uses, and prints integers', () => {
    // The torpedo boat's base hull is 250 and HULL adds 50 a rung (Story 9.6,
    // epic-9 amendments 90/93 — was ARMOR +25), so two copies held puts the
    // card at 350 → 400, whole numbers on both sides (amendment 39).
    expect(cardStatRows(CATALOG.hullPoints, 2, held('hullPoints', 2))).toEqual([
      { label: 'MAX HULL', cur: '350', next: '400' },
    ]);
  });

  it('reads the FIRST copy against a bare hull', () => {
    expect(cardStatRows(CATALOG.hullPoints, 0, TB)).toEqual([
      { label: 'MAX HULL', cur: '250', next: '300' },
    ]);
  });

  // PASSIVE HEALING (Story 9.6, Eric 2026-10-13, epic-9 amendment 95): ONE row,
  // the rate as a share of missing hull per second — the wait the card also
  // shortens is not a row. The values are read through effectiveStats; the
  // `N %/S` print is the contract.
  it('prints PASSIVE HEALING as one HEAL row, the folded rate in %/S', () => {
    const heal = (n: number): string | undefined =>
      shipStatRows(effectiveStats(CONFIG.shipClasses.torpedoBoat, Array<string>(n).fill('passiveHealing')))
        .find((r) => r.label === 'HEAL')?.next;
    // n = 0 and n = 5 cards, folded by effectiveStats (2 %/s base, 5 %/s at V).
    expect(heal(0)).toBe('2 %/S');
    expect(heal(5)).toBe('5 %/S');
    // The card face: one row, `cur → next` off the same printer — one decimal
    // only when the rate needs it.
    expect(cardStatRows(CATALOG.passiveHealing, 0, TB)).toEqual([{ label: 'HEAL', cur: heal(0), next: heal(1) }]);
    expect(heal(1)).toBe('2.6 %/S');
    expect(cardStatRows(CATALOG.passiveHealing, 4, held('passiveHealing', 4))).toEqual([
      { label: 'HEAL', cur: heal(4), next: heal(5) },
    ]);
  });

  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 110–117): ONE row,
  // the whole-number Armor read through effectiveStats — no unit, no decimal.
  it('prints ARMOR as one row, whole numbers off the fold', () => {
    const armorAt = (n: number): number =>
      effectiveStats(CONFIG.shipClasses.torpedoBoat, Array<string>(n).fill('armor')).armor;
    expect(cardStatRows(CATALOG.armor, 0, TB)).toEqual([
      { label: 'ARMOR', cur: String(armorAt(0)), next: String(armorAt(1)) },
    ]);
    expect(cardStatRows(CATALOG.armor, 4, held('armor', 4))).toEqual([
      { label: 'ARMOR', cur: String(armorAt(4)), next: String(armorAt(5)) },
    ]);
  });

  it('carries each ladder\'s own label and its own printer', () => {
    const labels = (line: CatalogLine): string[] =>
      cardStatRows(line, 0, TB).map((r) => r.label);
    expect(labels(CATALOG.speed)).toEqual(['TOP SPEED']);
    expect(labels(CATALOG.turning)).toEqual(['TURNING']);
    expect(labels(CATALOG.radarSweep)).toEqual(['RADAR SWEEP']);
    expect(labels(CATALOG.reload)).toEqual(['ALL COOLDOWNS']);
    // rung to II: a barrel, and (Story 9.8, ruling 125) the reach step, RANGE last
    expect(labels(CATALOG.deckGun)).toEqual(['SHELLS PER SHOT', 'RANGE']);
  });

  it('TURNING prints WHOLE DEGREES PER SECOND with the unit (Eric 2026-09-30): 46°/s → 49°/s on a bare Torpedo Boat', () => {
    expect(cardStatRows(CATALOG.turning, 0, TB)).toEqual([{ label: 'TURNING', cur: '46°/s', next: '49°/s' }]);
    // Every rung moves the printed number (0.05 rad/s ≈ 2.9°): 46 / 49 / 52 / 54 / 57.
    const ladder = [0, 1, 2, 3].map((k) =>
      cardStatRows(CATALOG.turning, k, { cls: 'torpedoBoat', cards: new Array<string>(k).fill('turning') })[0].next,
    );
    expect(ladder).toEqual(['49°/s', '52°/s', '54°/s', '57°/s']);
  });

  it('keeps the RPM and PERCENTAGE printers the hover panel already uses', () => {
    const sweep = cardStatRows(CATALOG.radarSweep, 0, TB)[0];
    expect(sweep.cur).toMatch(/ RPM$/);
    expect(sweep.next).toMatch(/ RPM$/);
    const cooldowns = cardStatRows(CATALOG.reload, 0, TB)[0];
    expect(cooldowns).toEqual({ label: 'ALL COOLDOWNS', cur: '100%', next: '95%' });
  });

  it('prints the DECK GUN ladder in whole hit points (amendment 39)', () => {
    // Eric's own scale (2026-10-02): 16 / 16 / 18 / 18 / 21 — damage moves only
    // on the rungs to III and V, so only those faces carry a GUN DAMAGE row.
    // Nothing on this row may show a fraction.
    const steps = [0, 1, 2, 3]
      .map((k) => cardStatRows(CATALOG.deckGun, k, held('deckGun', k)).find((r) => r.label === 'GUN DAMAGE'));
    expect(steps.map((r) => (r === undefined ? null : [r.cur, r.next]))).toEqual([
      null, ['16', '18'], null, ['18', '21'],
    ]);
    for (const r of steps) {
      if (r === undefined) continue;
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
      { label: 'TRIGGER RADIUS', cur: null, next: String(CONFIG.captiveMines.triggerRadius) },
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
  // STORY 9.8 (ruling 125): every card of these lines ALSO steps the line's
  // reach, and the RANGE row prints LAST (amendment 185's grammar, one rule for
  // card and table alike).
  it('STAR SHELLS: RELOAD, LIT, RADIUS, (FLARES on the whole step), DAMAGE, RANGE', () => {
    const t2 = cardStatRows(CATALOG.starShells, 1, held('starShells', 1));
    expect(t2.map((r) => r.label)).toEqual(['RELOAD', 'LIT', 'RADIUS', 'DAMAGE', 'RANGE']); // 1.5 flares floors to 1
    expect(t2[1]).toEqual({ label: 'LIT', cur: '10.0 s', next: '12.5 s' });
    expect(t2[3]).toEqual({ label: 'DAMAGE', cur: '20', next: '22' });
    expect(t2[4]).toEqual(rangeRow('starShells', 'starShells', 1));
    const t3 = cardStatRows(CATALOG.starShells, 2, held('starShells', 2));
    expect(t3.slice(0, 5).map((r) => r.label)).toEqual(['RELOAD', 'LIT', 'RADIUS', 'FLARES', 'DAMAGE']);
    expect(t3[3]).toEqual({ label: 'FLARES', cur: '1', next: '2' });
    expect(t3[4]).toEqual({ label: 'DAMAGE', cur: '22', next: '25' });
  });

  // OPEN (Story 9.8, reported to the orchestrator for Eric): the STAR SHELLS
  // and PHOSPHOR SHELLS cards to III and to V author SIX printed steps once the
  // reach step joins them, against the five-row grid (`CARD_STAT_ROWS`,
  // amendment 101b). RANGE prints last, so it is the row the grid cuts there
  // and every shipped row survives — an interim, not a layout anyone ruled on.
  it.todo('STAR SHELLS and PHOSPHOR SHELLS to III and V: six rows against the five-row grid — Eric to rule (Story 9.8)');

  it('BROADSIDE: RELOAD, SPREAD, TURRETS on the whole step, and RANGE', () => {
    const t2 = cardStatRows(CATALOG.broadside, 1, held('broadside', 1));
    expect(t2.map((r) => r.label)).toEqual(['RELOAD', 'SPREAD', 'RANGE']); // 4.5 turrets floors to 4
    expect(t2[1]).toEqual({ label: 'SPREAD', cur: '1', next: '2' });
    expect(t2[2]).toEqual(rangeRow('broadside', 'broadside', 1));
    const t3 = cardStatRows(CATALOG.broadside, 2, held('broadside', 2));
    expect(t3.map((r) => r.label)).toEqual(['RELOAD', 'SPREAD', 'TURRETS', 'RANGE']);
    expect(t3[2]).toEqual({ label: 'TURRETS', cur: '4', next: '5' });
  });

  it('PHOSPHOR SHELLS: RELOAD, DAMAGE, BURN (hp/s), RADIUS, LASTS where it moves, and RANGE', () => {
    const t2 = cardStatRows(CATALOG.phosphorShells, 1, held('phosphorShells', 1));
    expect(t2.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS', 'RANGE']); // no duration step at II
    expect(t2[2]).toEqual({ label: 'BURN', cur: '5', next: '6 hp/s' });
    expect(t2[3]).toEqual({ label: 'RADIUS', cur: '100', next: '110' });
    expect(t2[4]).toEqual(rangeRow('phosphorShells', 'phosphorShells', 1));
    const t3 = cardStatRows(CATALOG.phosphorShells, 2, held('phosphorShells', 2));
    expect(t3.slice(0, 5).map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS', 'LASTS']);
    expect(t3[4]).toEqual({ label: 'LASTS', cur: '8.0 s', next: '9.0 s' });
    // Tier IV omits LASTS again; tier V is the fullest face (see the OPEN item
    // above: its RANGE row is the one the grid cuts).
    const t4 = cardStatRows(CATALOG.phosphorShells, 3, held('phosphorShells', 3));
    expect(t4.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS', 'RANGE']);
    const t5 = cardStatRows(CATALOG.phosphorShells, 4, held('phosphorShells', 4));
    expect(t5.map((r) => r.label)).toEqual(['RELOAD', 'DAMAGE', 'BURN', 'RADIUS', 'LASTS']);
    expect(t5).toHaveLength(CARD_STAT_ROWS);
    expect(t5[1]).toEqual({ label: 'DAMAGE', cur: '17', next: '20' });
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

  // THE DECK GUN FACE (amendment 71, read since amendment 197 as ONE ROW PER
  // AUTHORED STEP — 198(a)): it is a LADDER, not an equipment line, so it never
  // touches the tier-card rule and its tier-derived reload cut stays silent.
  // Under Eric's 16/16/18/18/21 (2026-10-02) the rungs to II and IV author a
  // barrel alone, the rung to III damage plus a turret, the rung to V damage
  // alone, printed with the copy table's existing words `ROUNDS` and
  // `SHELLS PER SHOT`.
  it('prints the CANNON face one row per authored step — one at II, two at III, one at IV and V, plus RANGE', () => {
    // Story 9.8 (ruling 125): every rung also steps the cannon's reach.
    const rowsAt = (k: number): number => cardStatRows(CATALOG.deckGun, k, held('deckGun', k)).length;
    expect([0, 1, 2, 3].map(rowsAt)).toEqual([2, 3, 2, 2]);
  });
});

// --- THE CANNON AND FLAK FACES, BYTE-EXACT (amendment 197, 198(a)) -------------
//
// TURRET and BARREL folded into the gun ladders: CANNON adds the second turret
// on the rung to III and the second barrel on the rung to V; FLAK adds a turret
// on the rungs to III and V. Every authored step prints its own row, with no
// new words.
describe('cardStatRows — the CANNON and FLAK rungs that carry a turret or a barrel', () => {
  it('CANNON rung to II: SHELLS PER SHOT 1 to 2 (the second barrel), alone', () => {
    expect(cardStatRows(CATALOG.deckGun, 0, held('deckGun', 0))).toEqual([
      { label: 'SHELLS PER SHOT', cur: '1', next: '2' },
      rangeRow('deckGun', 'gun', 0),
    ]);
  });

  it('CANNON rung to III: GUN DAMAGE 16 to 18 and ROUNDS 1 to 2 (the second turret)', () => {
    expect(cardStatRows(CATALOG.deckGun, 1, held('deckGun', 1))).toEqual([
      { label: 'GUN DAMAGE', cur: '16', next: '18' },
      { label: 'ROUNDS', cur: '1', next: '2' },
      rangeRow('deckGun', 'gun', 1),
    ]);
  });

  it('CANNON rung to IV: SHELLS PER SHOT 2 to 3 (the third barrel), alone', () => {
    expect(cardStatRows(CATALOG.deckGun, 2, held('deckGun', 2))).toEqual([
      { label: 'SHELLS PER SHOT', cur: '2', next: '3' },
      rangeRow('deckGun', 'gun', 2),
    ]);
  });

  it('CANNON rung to V: GUN DAMAGE 18 to 21, alone', () => {
    expect(cardStatRows(CATALOG.deckGun, 3, held('deckGun', 3))).toEqual([
      { label: 'GUN DAMAGE', cur: '18', next: '21' },
      rangeRow('deckGun', 'gun', 3),
    ]);
  });

  it('FLAK rung to II: RELOAD, DAMAGE 12 to 20 and ROUNDS 1 to 2', () => {
    expect(cardStatRows(CATALOG.flak, 0, held('flak', 0))).toEqual([
      { label: 'RELOAD', cur: '3.5 s', next: '3.3 s' },
      { label: 'DAMAGE', cur: '12', next: '20' },
      { label: 'ROUNDS', cur: '1', next: '2' },
      rangeRow('flak', 'flak', 0),
    ]);
  });

  it('FLAK rung to IV: RELOAD, DAMAGE 28 to 36 and ROUNDS 2 to 3', () => {
    expect(cardStatRows(CATALOG.flak, 2, held('flak', 2))).toEqual([
      { label: 'RELOAD', cur: '3.1 s', next: '3.0 s' },
      { label: 'DAMAGE', cur: '28', next: '36' },
      { label: 'ROUNDS', cur: '2', next: '3' },
      rangeRow('flak', 'flak', 2),
    ]);
  });

  it('a dead TURRET/BARREL id prints no face at all', () => {
    expect(Object.hasOwn(CATALOG, 'deckGunTurret')).toBe(false);
    expect(Object.hasOwn(CATALOG, 'deckGunBarrel')).toBe(false);
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

  // THE FOULING SHELL (Story 9.4, epic-9 amendment 66): absolute rows whose
  // numbers are read off CONFIG.foulingShell (the contract: a re-tuned dial
  // reaches the card), in the 8.16 belt register's uppercase units.
  it('prints the FOULING SHELL rows from CONFIG.foulingShell (radius, life, speed factor)', () => {
    const f = CONFIG.foulingShell;
    expect(cardStatRows(CATALOG.foulingShell, 0, TB)).toEqual([
      { label: 'RADIUS', cur: null, next: `${f.radius} U` },
      { label: 'LASTS', cur: null, next: `${f.durationMs / 1000} S` },
      { label: 'SPEED', cur: null, next: `×${f.slowFactor}` },
    ]);
  });

  it('gives a STILL-STUB CONSUMABLE no rows (DEPTH CHARGE)', () => {
    // TWO since Story 8.16 flipped SHIELD BLOCK, CHAFF and DECOY BUOY; ONE since
    // Story 8.18 flipped SMOKE SCREEN (CHAFF left the catalog in Story 9.2).
    expect(cardStatRows(CATALOG.depthCharge, 0, TB)).toEqual([]);
  });

  // MULTI-SPECTRAL COUNTERMEASURE (Story 9.3, Eric ruling 2026-10-11, epic-9
  // amendment 45): LASTS / CLOUD, every number off CONFIG.countermeasure, in the
  // 8.16 belt register's uppercase units.
  it('gives the COUNTERMEASURE its life and spread, off CONFIG', () => {
    const k = CONFIG.countermeasure;
    expect(cardStatRows(CATALOG.countermeasure, 0, TB)).toEqual([
      { label: 'LASTS', cur: null, next: `${k.lifeMs / 1000} S` },
      { label: 'CLOUD', cur: null, next: `${k.r0} → ${k.r1} U` },
    ]);
  });

  // THE 8.16 CONSUMABLES (catalog-v3 R36/R37; CHAFF retired in 9.2): absolute rows in the
  // hullRepair shape, every number read off CONFIG — never a literal.
  it('gives SHIELD BLOCK what it absorbs and how long it lasts, off CONFIG', () => {
    expect(cardStatRows(CATALOG.shieldBlock, 0, TB)).toEqual([
      { label: 'ABSORBS', cur: null, next: `${CONFIG.shieldBlock.hp} HP` },
      { label: 'LASTS', cur: null, next: `${CONFIG.shieldBlock.durationMs / 1000} S` },
    ]);
  });

  it('gives DECOY BUOY its hull and where it drops, off CONFIG', () => {
    expect(cardStatRows(CATALOG.decoyBuoy, 0, TB)).toEqual([
      { label: 'HULL', cur: null, next: `${CONFIG.decoyBuoy.hp} HP` },
      { label: 'DROP', cur: null, next: 'REAR ARC' },
    ]);
  });

  it('the 8.16 rows are the same on every hull and at every copy count', () => {
    for (const id of ['shieldBlock', 'decoyBuoy'] as const) {
      const base = cardStatRows(CATALOG[id], 0, TB);
      expect(base.length, id).toBeGreaterThan(0);
      expect(cardStatRows(CATALOG[id], 3, { cls: 'battleship', cards: ['hullPoints'] }), id).toEqual(base);
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
    const rows = cardStatRows(CATALOG.hullPoints, 0, { cls: 'notAHull' as never, cards: [] });
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
    const tb = cardStatRows(CATALOG.hullPoints, 0, { cls: 'torpedoBoat', cards: [] })[0];
    const bb = cardStatRows(CATALOG.hullPoints, 0, { cls: 'battleship', cards: [] })[0];
    expect(bb.cur).not.toBe(tb.cur);
    expect(Number(bb.cur)).toBe(effectiveStats(CONFIG.shipClasses.battleship, []).maxHp);
  });
});

describe('cardTierLabel pairs with the rows — UX-DR51\'s four examples', () => {
  it('reads deckGun k=0 as I → II, hullPoints and radarSweep k=0 as I, heavyTorpedo k=1 as I → II', () => {
    // HULL reads 0 → V since Story 9.6 (epic-9 amendment 94); the base-tier
    // example is the CANNON's now.
    expect(cardTierLabel(CATALOG.deckGun, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.hullPoints, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.radarSweep, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 1)).toBe('I → II');
    expect(cardTierLabel(CATALOG.hullRepair, 0)).toBeNull();
  });
});

// --- THE TWO PICKABLE GUNS' LADDERS (Story 8.15, amendments 104/105) -----------
//
// A LADDER line each (the gun is the seat's pick, never a card), but each tier
// ALSO cuts that gun's reload by 5 % — so the tier card prints the reload step
// FIRST, then every authored step (amendments 85/87(b)): MACHINE GUN +2 shells,
// +1 damage per shell and the shot-delay step −40/−40/−40/−30 ms (Eric
// 2026-09-30: 0.35 → 0.20 s, a RATE row), FLAK +2 damage (blast fixed). The machine gun's pool
// is a MAGAZINE, so its row says SHELLS where every other pool says ROUNDS.
describe('cardStatRows — the machine gun and flak ladders (Story 8.15)', () => {
  function face(id: 'machineGun' | 'flak', copiesHeld: number): string[] {
    return cardStatRows(CATALOG[id], copiesHeld, held(id, copiesHeld)).map((r) => `${r.label} ${r.cur ?? ''}>${r.next}`);
  }

  it('MACHINE GUN tier II: RELOAD 12.0 s to 11.4 s, SHELLS 12 to 16, DAMAGE 5 to 6, RATE 0.30 s to 0.25 s', () => {
    expect(face('machineGun', 0)).toEqual([
      'RELOAD 12.0 s>11.4 s', 'SHELLS 12>16', 'DAMAGE 5>6', 'RATE 0.30 s>0.25 s', rangeLine('machineGun', 'machineGun', 0),
    ]);
  });

  it('MACHINE GUN rungs to III and V author no damage: RELOAD, SHELLS and RATE only', () => {
    expect(face('machineGun', 1)).toEqual([
      'RELOAD 11.4 s>10.8 s', 'SHELLS 16>20', 'RATE 0.25 s>0.20 s', rangeLine('machineGun', 'machineGun', 1),
    ]);
    expect(face('machineGun', 3)).toEqual([
      'RELOAD 10.2 s>9.6 s', 'SHELLS 24>28', 'RATE 0.15 s>0.10 s', rangeLine('machineGun', 'machineGun', 3),
    ]);
  });

  it('MACHINE GUN rung to IV: damage 6 to 7 returns', () => {
    expect(face('machineGun', 2)).toEqual([
      'RELOAD 10.8 s>10.2 s', 'SHELLS 20>24', 'DAMAGE 6>7', 'RATE 0.20 s>0.15 s', rangeLine('machineGun', 'machineGun', 2),
    ]);
  });

  it('FLAK ladder: DAMAGE climbs 12 / 20 / 28 / 36 / 44 and the pool steps sit on the rungs to II and IV — the blast never moves', () => {
    expect(face('flak', 0)).toEqual(['RELOAD 3.5 s>3.3 s', 'DAMAGE 12>20', 'ROUNDS 1>2', rangeLine('flak', 'flak', 0)]);
    expect(face('flak', 1)).toEqual(['RELOAD 3.3 s>3.1 s', 'DAMAGE 20>28', rangeLine('flak', 'flak', 1)]);
    expect(face('flak', 2)).toEqual(['RELOAD 3.1 s>3.0 s', 'DAMAGE 28>36', 'ROUNDS 2>3', rangeLine('flak', 'flak', 2)]);
    expect(face('flak', 3)).toEqual(['RELOAD 3.0 s>2.8 s', 'DAMAGE 36>44', rangeLine('flak', 'flak', 3)]);
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
