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
//
// The expectations are read off `effectiveStats` (and CONFIG for the
// consumables) — never typed literals and never the row labels, which are
// copy: the contract is how many rows a card prints, in which order, and that
// each value is the fold's number in the face's printer.

import { describe, expect, it } from 'vitest';
import { BUOY_LINE_IDS, CATALOG, CONFIG, LINE_IDS, effectiveStats, isStubLine, tierTargetOf, type CatalogLine } from '@salvo/shared';
import { CARD_STAT_ROWS, cardStatRows, cardTierLabel, shipStatRows } from '../ui/boonCopy.js';


/** A torpedo boat with nothing fitted — the hull every value below is read on. */
const TB = { cls: 'torpedoBoat' as const, cards: [] as string[] };

/** RANGE's printer (Eric 2026-10-13): whole values whole, else one decimal. */
const rangeTxt = (v: number): string => (v % 1 === 0 ? String(v) : v.toFixed(1));
/** A reload in the face's printer: seconds, one decimal, unit on both sides. */
const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** The fold of `n` copies of `line` on the bare torpedo boat. */
const foldOf = (line: string, n: number) => effectiveStats(CONFIG.shipClasses.torpedoBoat, Array<string>(n).fill(line));

/** A row list as `[cur, next]` pairs — label-blind (the labels are copy). */
const pairs = (rows: readonly { cur: string | null; next: string }[]): (string | null)[][] =>
  rows.map((r) => [r.cur, r.next]);

/**
 * THE RANGE ROW a gun card prints (Story 9.8, ruling 125: every card of a gun
 * line steps its reach by (V − I) / 4), read off the SAME fold the card reads —
 * never a literal. One decimal only when needed (Eric 2026-10-13; the sim
 * keeps the exact value), the unit on `next` alone (FIELD_UNITS).
 */
function rangePair(
  line: string,
  w: 'gun' | 'machineGun' | 'flak' | 'broadside' | 'starShells' | 'phosphorShells',
  k: number,
): [string, string] {
  const at = (n: number): number => foldOf(line, n).equipment[w].rangeU;
  return [rangeTxt(at(k)), `${rangeTxt(at(k + 1))} u`];
}
/**
 * A gun's DAMAGE before and after the card at `k` copies held, read off the
 * SAME fold the card reads — never a literal, so a retune of the deck-gun
 * damage dials (Eric's 2026-10-13 experiment moved CANNON and FLAK) moves the
 * expectation with it. Integers on the face (amendment 39).
 */
function dmgPair(line: string, w: 'gun' | 'flak' | 'lightTorpedo' | 'heavyTorpedo' | 'navalMines' | 'captiveMines', k: number): [string, string] {
  const at = (n: number): string => String(foldOf(line, n).equipment[w].damage);
  return [at(k), at(k + 1)];
}

function held(id: string, n: number): typeof TB {
  return { cls: 'torpedoBoat', cards: Array<string>(n).fill(id) };
}

describe('cardStatRows — LADDER lines print the one number they move', () => {
  it('prints HULL as one row of whole numbers, the fold before and after the card', () => {
    // Two copies held: the card reads the 2-copy fold → the 3-copy fold, whole
    // numbers on both sides (amendment 39).
    expect(pairs(cardStatRows(CATALOG.hullPoints, 2, held('hullPoints', 2)))).toEqual([
      [String(foldOf('hullPoints', 2).maxHp), String(foldOf('hullPoints', 3).maxHp)],
    ]);
  });

  it('reads the FIRST copy against a bare hull', () => {
    expect(pairs(cardStatRows(CATALOG.hullPoints, 0, TB))).toEqual([
      [String(foldOf('hullPoints', 0).maxHp), String(foldOf('hullPoints', 1).maxHp)],
    ]);
  });

  // PASSIVE HEALING (Story 9.6, Eric 2026-10-13, epic-9 amendment 95): ONE row,
  // the rate as a share of missing hull per second — the wait the card also
  // shortens is not a row. The values are read through effectiveStats, off the
  // SHIP panel's own HEAL printer (its last row).
  it('prints PASSIVE HEALING as one row, the SHIP panel\'s folded heal rate before and after', () => {
    const heal = (n: number): string | undefined => shipStatRows(foldOf('passiveHealing', n)).at(-1)?.next;
    expect(pairs(cardStatRows(CATALOG.passiveHealing, 0, TB))).toEqual([[heal(0), heal(1)]]);
    expect(pairs(cardStatRows(CATALOG.passiveHealing, 4, held('passiveHealing', 4)))).toEqual([[heal(4), heal(5)]]);
  });

  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 110–117): ONE row,
  // the whole-number Armor read through effectiveStats — no unit, no decimal.
  it('prints ARMOR as one row, whole numbers off the fold', () => {
    const armorAt = (n: number): string => String(foldOf('armor', n).armor);
    expect(pairs(cardStatRows(CATALOG.armor, 0, TB))).toEqual([[armorAt(0), armorAt(1)]]);
    expect(pairs(cardStatRows(CATALOG.armor, 4, held('armor', 4)))).toEqual([[armorAt(4), armorAt(5)]]);
  });

  // ARMOR PIERCING (Story 9.9, epic-9 amendments 145, 159 — mirrors ARMOR): ONE
  // row, the whole-number piercing off the fold.
  it('prints ARMOR PIERCING as one row, whole numbers off the fold', () => {
    const apAt = (n: number): string => String(foldOf('armorPiercing', n).armorPiercing);
    expect(pairs(cardStatRows(CATALOG.armorPiercing, 0, TB))).toEqual([[apAt(0), apAt(1)]]);
    expect(pairs(cardStatRows(CATALOG.armorPiercing, 2, held('armorPiercing', 2)))).toEqual([[apAt(2), apAt(3)]]);
    expect(cardTierLabel(CATALOG.armorPiercing, 2)).toBe('II → III');
  });

  it('prints ONE row for each ship ladder, and the CANNON\'s damage step plus its reach', () => {
    for (const id of ['speed', 'turning', 'radarSweep', 'reload'] as const) {
      expect(cardStatRows(CATALOG[id], 0, TB), id).toHaveLength(1);
    }
    // rung to II: the damage step (the barrels are FIXED since Story 9.12) and
    // (Story 9.8, ruling 125) the reach step, RANGE last
    expect(pairs(cardStatRows(CATALOG.deckGun, 0, TB))).toEqual([dmgPair('deckGun', 'gun', 0), rangePair('deckGun', 'gun', 0)]);
  });

  it('TURNING prints WHOLE DEGREES PER SECOND with the unit (Eric 2026-09-30), and every rung moves the number', () => {
    const deg = (n: number): string => `${Math.round((foldOf('turning', n).kinematics.turnRate * 180) / Math.PI)}°/s`;
    expect(pairs(cardStatRows(CATALOG.turning, 0, TB))).toEqual([[deg(0), deg(1)]]);
    const ladder = [0, 1, 2, 3].map((k) => cardStatRows(CATALOG.turning, k, held('turning', k))[0].next);
    expect(ladder).toEqual([1, 2, 3, 4].map(deg));
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it('keeps the RPM and PERCENTAGE printers the hover panel already uses', () => {
    const sweep = cardStatRows(CATALOG.radarSweep, 0, TB)[0];
    expect(sweep.cur).toMatch(/ RPM$/);
    expect(sweep.next).toMatch(/ RPM$/);
    const cooldowns = cardStatRows(CATALOG.reload, 0, TB)[0];
    expect(cooldowns.cur).toMatch(/^\d+%$/);
    expect(cooldowns.next).toMatch(/^\d+%$/);
    // A RELOAD card cuts every cooldown.
    expect(Number.parseFloat(cooldowns.next)).toBeLessThan(Number.parseFloat(cooldowns.cur!));
  });

  it('prints the DECK GUN ladder in whole hit points (amendment 39)', () => {
    // Damage moves on EVERY rung since Story 9.12 (the values are Eric's
    // dials, read off the fold), so every face carries the damage row FIRST.
    // Nothing on this row may show a fraction.
    const steps = [0, 1, 2, 3].map((k) => cardStatRows(CATALOG.deckGun, k, held('deckGun', k))[0]);
    expect(steps.map((r) => [r.cur, r.next])).toEqual([
      dmgPair('deckGun', 'gun', 0), dmgPair('deckGun', 'gun', 1), dmgPair('deckGun', 'gun', 2), dmgPair('deckGun', 'gun', 3),
    ]);
    for (const r of steps) {
      expect(r.cur).not.toContain('.');
      expect(r.next).not.toContain('.');
    }
  });
});

describe('cardStatRows — a WEAPON\'s first copy prints its whole table', () => {
  /** A torpedo's whole first-copy table, off its tier-I fold. */
  const torpTable = (id: 'heavyTorpedo' | 'lightTorpedo'): (string | null)[][] => {
    const t = foldOf(id, 1).equipment[id];
    return [[null, secs(t.reloadMs)], [null, String(t.maxAmmo)], [null, String(t.speed)], [null, String(t.damage)], [null, `${t.homingTurnRate} rad/s`]];
  };

  it('prints HEAVY TORPEDO absolutely, in EQUIPMENT_STAT_FIELDS order', () => {
    // No `cur`, no arrow: the first copy buys the WEAPON, not a step.
    // HOMING joined the table in Story 8.13 (epic-8 amendment 80): it is a TIER
    // STAT now, zero at tier I — which is exactly what "a straight-runner" is —
    // and the row says so rather than the card staying silent about steering.
    expect(pairs(cardStatRows(CATALOG.heavyTorpedo, 0, TB))).toEqual(torpTable('heavyTorpedo'));
  });

  // STORY 8.13 — the LIGHT TORPEDO's own table, off its own CONFIG block.
  it('prints LIGHT TORPEDO off its OWN block, never the heavy fish\'s numbers', () => {
    const light = pairs(cardStatRows(CATALOG.lightTorpedo, 0, TB));
    expect(light).toEqual(torpTable('lightTorpedo'));
    expect(light).not.toEqual(torpTable('heavyTorpedo'));
  });

  // THE CAPTIVE MINE'S DEFINING CIRCLE. It has no `blastRadius` FIELD at all
  // (its 32 u burst is fixed and its trip ring is derived from the TIER —
  // epic-8 amendment 84d), so the derived TRIGGER RADIUS row follows DAMAGE
  // here instead of the blast. Without that, the one number that makes a
  // captive mine a trap would never reach its own card.
  it('gives CAPTIVE MINES its tier-derived TRIP RING and its FISH\'s damage', () => {
    const m = foldOf('captiveMines', 1).equipment.captiveMines;
    expect(pairs(cardStatRows(CATALOG.captiveMines, 0, TB))).toEqual([
      [null, secs(m.reloadMs)],
      [null, String(m.maxAmmo)],
      [null, String(m.damage)],
      [null, String(m.triggerRadius)],
      [null, `${m.homingTurnRate} rad/s`],
    ]);
  });

  // FOULING MINES — the line whose table plus its derived ring overflowed the
  // five-row grid (six since Story 9.8), so the face drops RELOAD (every TIER card of the line
  // prints it as a live diff) and keeps SLOW, which is the whole point of the
  // weapon. The factor prints as a PERCENTAGE OF SPEED, never as a bare 0.75.
  it('gives FOULING MINES the mine rows plus its SLOW, as a percentage', () => {
    const m = foldOf('foulingMines', 1).equipment.foulingMines;
    expect(pairs(cardStatRows(CATALOG.foulingMines, 0, TB))).toEqual([
      [null, String(m.maxAmmo)],
      [null, String(m.damage)],
      [null, String(m.blastRadius)],
      [null, String(m.triggerRadius)],
      [null, `${Math.round(m.slowFactor * 100)}%`],
    ]);
  });

  it('gives NAVAL MINES its derived TRIGGER RADIUS as its own row, after the blast', () => {
    // UX-DR50's "separate rows". The trip ring is derived in clampStats, so it
    // is not stat-addressable and would otherwise never reach the player.
    const m = foldOf('navalMines', 1).equipment.navalMines;
    expect(pairs(cardStatRows(CATALOG.navalMines, 0, TB))).toEqual([
      [null, secs(m.reloadMs)],
      [null, String(m.maxAmmo)],
      [null, String(m.damage)],
      [null, String(m.blastRadius)],
      [null, String(m.triggerRadius)],
    ]);
  });

  it('prints copies 2 and up as the TIER step — that weapon\'s own reload FIRST', () => {
    const rows = cardStatRows(CATALOG.heavyTorpedo, 1, held('heavyTorpedo', 1));
    expect(rows[0].cur).toBe(secs(foldOf('heavyTorpedo', 1).equipment.heavyTorpedo.reloadMs));
    // A tier is a cut, so the next value is strictly smaller.
    expect(Number.parseFloat(rows[0].next)).toBeLessThan(Number.parseFloat(rows[0].cur!));
  });

  // THE SIX-ROW GRID (Story 9.8, Eric 2026-10-13: "Six-row card grid"). The
  // STAR SHELLS and PHOSPHOR SHELLS cards to III and to V author SIX printed
  // steps once the reach step joins them — the fullest faces in the catalog —
  // and the grid holds every one of them, RANGE last, nothing cut.
  it('STAR SHELLS and PHOSPHOR SHELLS to III and V print all six rows, RANGE last', () => {
    for (const [id, w] of [['starShells', 'starShells'], ['phosphorShells', 'phosphorShells']] as const) {
      for (const k of [2, 4]) {
        const rows = cardStatRows(CATALOG[id], k, held(id, k));
        expect(rows, `${id}@${k}`).toHaveLength(6);
        expect(rows.length, `${id}@${k}`).toBeLessThanOrEqual(CARD_STAT_ROWS);
        expect([rows[5]!.cur, rows[5]!.next], `${id}@${k}`).toEqual(rangePair(id, w, k));
      }
    }
  });

  // PHOSPHOR's FIT card: six stat fields against what was a five-row grid, so
  // it drops ROUNDS (a one-shell pool no tier moves) and keeps BURN — the
  // positional slice would have dropped the one number that makes it a burning
  // weapon. Since Story 9.8 its RANGE prints in the sixth row, LAST.
  it('PHOSPHOR SHELLS fit card keeps BURN on the full six-row face', () => {
    const rows = cardStatRows(CATALOG.phosphorShells, 0, TB);
    expect(rows).toHaveLength(CARD_STAT_ROWS);
    expect(rows.map((r) => r.next)).toContain(`${foldOf('phosphorShells', 1).equipment.phosphorShells.dps} hp/s`);
  });

  // EVERY GUN'S FIT FACE PRINTS ITS REACH (Story 9.8, the six-row grid): the
  // RANGE row is absolute (no `before` on a first copy), LAST, whole units.
  it('prints RANGE last, absolute, once, on every gun fit face', () => {
    for (const id of ['broadside', 'starShells', 'phosphorShells'] as const) {
      const fit = `${rangeTxt(foldOf(id, 1).equipment[id].rangeU)} u`;
      const rows = cardStatRows(CATALOG[id], 0, TB);
      expect(rows.at(-1)?.cur, id).toBeNull();
      expect(rows.at(-1)?.next, id).toBe(fit);
      expect(rows.filter((r) => r.next === fit), id).toHaveLength(1);
    }
  });
});

// --- THE TIER FACE PRINTS EVERY STEP IT BUYS (Story 8.13, amendment 85) --------
//
// The shipped tier face printed ONE row — the reload — by the deck-gun
// precedent (amendment 71). That understated the five ladders this story
// authored: a tier-II LIGHT TORPEDO card said only its reload step while also
// buying damage, speed and the first homing. Eric's answer: the reload step
// PLUS every stat effect the tier authors, in catalog order, on the existing
// grid at the existing type sizes.
//
// THE CYCLE-148 REVIEW GATE'S P5: a step that FLOORS back to the number it
// already had (+0.5 tubes against an integer pool) prints no row — `ROUNDS
// 1 → 1` would promise a round the card is not buying. A DERIVED number (the
// captive mine's trip ring, amendment 84d) is not an authored effect and gets
// no tier row either.

describe('cardStatRows — a TIER card prints its reload step AND every authored effect', () => {
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
        // The reload step first, off the fold before and after the card.
        const w = tierTargetOf(line)! as keyof ReturnType<typeof foldOf>['equipment'];
        const reload = (n: number): number => (foldOf(id, n).equipment[w] as { reloadMs: number }).reloadMs;
        expect([rows[0].cur, rows[0].next], `${id}@${k}`).toEqual([secs(reload(k)), secs(reload(k + 1))]);
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

// --- THE CANNON AND FLAK FACES (amendment 197, 198(a)) -------------------------
//
// TURRET and BARREL folded into the gun ladders: CANNON adds the second turret
// on the rung to III; FLAK adds its turret on the rung to II (Story 9.12).
// Every authored step prints its own row, off the fold.
describe('cardStatRows — the CANNON rungs that carry a turret or a barrel', () => {
  it('CANNON: damage on every rung, the second turret (ROUNDS) on the rung to III only, RANGE last', () => {
    const ammo = (n: number): string => String(foldOf('deckGun', n).equipment.gun.maxAmmo);
    for (const k of [0, 1, 2, 3]) {
      const want = [dmgPair('deckGun', 'gun', k), ...(k === 1 ? [[ammo(1), ammo(2)]] : []), rangePair('deckGun', 'gun', k)];
      expect(pairs(cardStatRows(CATALOG.deckGun, k, held('deckGun', k))), `rung ${k}`).toEqual(want);
    }
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
    // Epic-8 amendment 51: the shipped pool pays its hp over a time. It is
    // printed as the AMOUNT over its TIME, never as a rate — the "5 hp/s" in
    // R13/FR47 is a stale figure, and pools ADD rather than accelerate.
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
    expect(pairs(cardStatRows(CATALOG.foulingShell, 0, TB))).toEqual([
      [null, `${f.radius} U`],
      [null, `${f.durationMs / 1000} S`],
      [null, `×${f.slowFactor}`],
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
    expect(pairs(cardStatRows(CATALOG.countermeasure, 0, TB))).toEqual([
      [null, `${k.lifeMs / 1000} S`],
      [null, `${k.r0} → ${k.r1} U`],
    ]);
  });

  // THE 8.16 CONSUMABLES (catalog-v3 R36/R37; CHAFF retired in 9.2): absolute rows in the
  // hullRepair shape, every number read off CONFIG — never a literal.
  it('gives SHIELD BLOCK what it absorbs and how long it lasts, off CONFIG', () => {
    expect(pairs(cardStatRows(CATALOG.shieldBlock, 0, TB))).toEqual([
      [null, `${CONFIG.shieldBlock.hp} HP`],
      [null, `${CONFIG.shieldBlock.durationMs / 1000} S`],
    ]);
  });

  // THE FOUR BUOYS (Story 10.9): the body's four rows (hull, effect reach,
  // life, drop arc) plus ONE kind row; every number derived from CONFIG.buoy.
  it('gives every BUOY the shared body rows off CONFIG.buoy, then exactly one kind row', () => {
    const b = CONFIG.buoy;
    const kindRows = new Set<string>();
    for (const id of BUOY_LINE_IDS) {
      const rows = cardStatRows(CATALOG[id], 0, TB);
      expect(rows.length, id).toBe(5);
      expect(rows.length, id).toBeLessThanOrEqual(CARD_STAT_ROWS);
      expect(pairs(rows.slice(0, 3)), id).toEqual([
        [null, `${b.hp} HP`],
        [null, `${b.radiusU} U`],
        [null, `${b.lifetimeMs / 1000} S`],
      ]);
      expect(rows.every((r) => r.cur === null), id).toBe(true);
      kindRows.add(rows[4].next);
    }
    expect(kindRows.size).toBe(BUOY_LINE_IDS.length); // each kind says something different
  });

  it('the buoys\' kind rows carry their CONFIG numbers', () => {
    const b = CONFIG.buoy;
    const kindRow = (id: (typeof BUOY_LINE_IDS)[number]) => cardStatRows(CATALOG[id], 0, TB)[4].next;
    expect(kindRow('radarBuoy')).toContain(`${b.radiusU}`);
    expect(kindRow('healingBuoy')).toContain(`${b.heal.missingPctPerS * 100}%`);
    expect(kindRow('shieldBuoy')).toContain(`${b.shield.maxHpPctPerS * 100}%`);
    expect(kindRow('speedBuoy')).toContain(`${b.speed.factor * 100}%`);
  });

  it('every buoy prints the SAME drop row (one arc for the four)', () => {
    const drops = new Set(BUOY_LINE_IDS.map((id) => cardStatRows(CATALOG[id], 0, TB)[3].next));
    expect(drops.size).toBe(1);
  });

  // FLASH SHELLS (Story 10.9 — the 8.17 rows restored): radius, blind time and
  // the sight fraction, every number off CONFIG.flashShells.
  it('prints the FLASH SHELLS rows from CONFIG.flashShells (radius, blind time, sight fraction)', () => {
    const f = CONFIG.flashShells;
    expect(pairs(cardStatRows(CATALOG.dazzleShells, 0, TB))).toEqual([
      [null, `${f.radius} U`],
      [null, `${f.durationMs / 1000} S`],
      [null, `1/${Math.round(1 / f.sightFraction)}`],
    ]);
  });

  it('the 8.16 rows are the same on every hull and at every copy count', () => {
    for (const id of ['shieldBlock', ...BUOY_LINE_IDS, 'dazzleShells'] as const) {
      const base = cardStatRows(CATALOG[id], 0, TB);
      expect(base.length, id).toBeGreaterThan(0);
      expect(cardStatRows(CATALOG[id], 3, { cls: 'battleship', cards: ['hullPoints'] }), id).toEqual(base);
    }
  });

  // THE SECOND LIVE CONSUMABLE (Story 8.13, epic-8 amendment 74) — and the
  // first that is a weapon. Two absolute rows, both straight off CONFIG, and no
  // reload row because a consumable never reloads.
  it('gives SUPERCAV TORPEDO its two CONFIG rows and no reload', () => {
    expect(pairs(cardStatRows(CATALOG.supercavTorpedo, 0, TB))).toEqual([
      [null, String(CONFIG.supercavTorpedo.speed)],
      [null, String(CONFIG.supercavTorpedo.damage)],
    ]);
  });


  it('gives a STUB line no rows — there is no built module to read', () => {
    for (const id of LINE_IDS) {
      if (!isStubLine(id)) continue;
      expect(cardStatRows(CATALOG[id], 0, TB), id).toEqual([]);
    }
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

// --- THE TWO PICKABLE GUNS' LADDERS (Story 8.15, amendments 104/105) -----------
//
// A LADDER line each (the gun is the seat's pick, never a card), but each tier
// ALSO cuts that gun's reload by 5 % — so the tier card prints the reload step
// FIRST, then every authored step (amendments 85/87(b)): MACHINE GUN more
// shells and a shorter shot delay (a two-decimal RATE row), FLAK more damage
// (blast fixed).
describe('cardStatRows — the machine gun and flak ladders (Story 8.15)', () => {
  /** One MG stat before and after the card at `k` copies held, off the fold. */
  const mgAt = (k: number, f: 'reloadMs' | 'maxAmmo' | 'rateMs'): number => foldOf('machineGun', k).equipment.machineGun[f];
  const mgFace = (k: number): (string | null)[][] => [
    [secs(mgAt(k, 'reloadMs')), secs(mgAt(k + 1, 'reloadMs'))],
    [String(mgAt(k, 'maxAmmo')), String(mgAt(k + 1, 'maxAmmo'))],
    [`${(mgAt(k, 'rateMs') / 1000).toFixed(2)} s`, `${(mgAt(k + 1, 'rateMs') / 1000).toFixed(2)} s`],
    rangePair('machineGun', 'machineGun', k),
  ];

  it('MACHINE GUN: every rung prints its reload, shells and rate steps and NEVER a damage row (flat since Story 9.12)', () => {
    for (let k = 0; k < CATALOG.machineGun.cap - 1; k += 1) {
      expect(pairs(cardStatRows(CATALOG.machineGun, k, held('machineGun', k))), `rung ${k}`).toEqual(mgFace(k));
      // the magazine grows and the shot delay shrinks on every rung
      expect(mgAt(k + 1, 'maxAmmo')).toBeGreaterThan(mgAt(k, 'maxAmmo'));
      expect(mgAt(k + 1, 'rateMs')).toBeLessThan(mgAt(k, 'rateMs'));
    }
    // the tier-I reload is the CONFIG dial
    expect(cardStatRows(CATALOG.machineGun, 0, TB)[0].cur).toBe(secs(CONFIG.machineGun.reloadMs));
  });

  it('FLAK ladder: DAMAGE climbs every rung and the pool step sits on the rung to II ONLY — the blast never moves', () => {
    const reload = (n: number): string => secs(foldOf('flak', n).equipment.flak.reloadMs);
    const ammo = (n: number): string => String(foldOf('flak', n).equipment.flak.maxAmmo);
    for (const k of [0, 1, 2, 3]) {
      const want = [[reload(k), reload(k + 1)], dmgPair('flak', 'flak', k), ...(k === 0 ? [[ammo(0), ammo(1)]] : []), rangePair('flak', 'flak', k)];
      expect(pairs(cardStatRows(CATALOG.flak, k, held('flak', k))), `rung ${k}`).toEqual(want);
    }
    // Damage CLIMBS on every rung (whatever Eric's dial values are).
    for (let k = 0; k < 4; k += 1) expect(Number(dmgPair('flak', 'flak', k)[1])).toBeGreaterThan(Number(dmgPair('flak', 'flak', k)[0]));
  });
});
