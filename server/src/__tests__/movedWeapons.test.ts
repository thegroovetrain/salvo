// THE TWO BURST SHELLS AS SLOT WEAPONS (Story 10.5, Eric 2026-11-05, epic-10
// amendment 10, R4 / R7): FLASH SHELLS (`dazzleShells`) and the FOULING SHELL
// sit in the special-shell family slot on the standard reload pool, and their
// TIER widens the burst — `CONFIG.<block>.radius + radiusStepPerTier × (N − 1)`
// at tier N. The radius is STAMPED on the shell at launch and is the one the
// flash's victim set, the foul zone and the flash burst event's `r` all read.
// (The SUPERCAV's slot-weapon contract lives in weapons.test.ts.)

import { describe, it, expect } from 'vitest';
import { CATALOG, CONFIG, familySlotFor, type BurstEvent, type GameEvent, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

/** Islands cleared and the raster flattened: open water. */
function bareWorld(seed = 11): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, undefined);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

const SHELL_SLOT = familySlotFor('dazzleShells')!;

type BurstLine = 'dazzleShells' | 'foulingShell';
const BLOCK = { dazzleShells: CONFIG.flashShells, foulingShell: CONFIG.foulingShell } as const;

/** The ruled radius at tier `n` (R7). */
const radiusAt = (line: BurstLine, n: number): number => BLOCK[line].radius + BLOCK[line].radiusStepPerTier * (n - 1);

/** A firer at the origin holding `n` copies of `line`, aimed east at `aimDist`. */
function armed(w: World, line: BurstLine, n: number, aimDist: number): ShipRecord {
  const a = place(w, 'a', 0, 0);
  for (let i = 0; i < n; i += 1) w.applyCard(a, line);
  const input: InputMsg = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist, slot: SHELL_SLOT, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
  a.input = input;
  return a;
}

/** Step until a burst lands; return every event seen. */
function untilBurst(w: World): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < 120; i += 1) {
    w.step();
    seen.push(...w.tickEvents);
    if (seen.some((e) => e.k === 'burst')) break;
  }
  return seen;
}

describe('the burst shells fill the special-shell family slot on the reload pool', () => {
  for (const line of ['dazzleShells', 'foulingShell'] as const) {
    it(`${line}: lands in the shell slot loaded; a click spends a round and starts the row's reload; the card stays`, () => {
      const w = bareWorld();
      const a = armed(w, line, 1, 400);
      const row = a.stats.equipment[line];
      expect(a.loadout[SHELL_SLOT]).toEqual({ equipmentId: line, state: { n: row.maxAmmo, reloadMsLeft: 0 } });
      expect(w.sinkingActivationGate(a, SHELL_SLOT)).toEqual({ ok: true });
      expect(a.loadout[SHELL_SLOT].state).toEqual({ n: row.maxAmmo - 1, reloadMsLeft: row.reloadMs });
      expect(a.cards).toEqual([line]);
      expect(w.sinkingActivationGate(a, SHELL_SLOT)).toEqual({ ok: false, reason: 'no-ammo' });
    });
  }
});

describe('R7 — the tier widens the burst, stamped on the shell at launch', () => {
  for (const line of ['dazzleShells', 'foulingShell'] as const) {
    it(`${line}: at every tier N the effective row, the shell's burstRadius and its payload tag carry radius + step × (N − 1)`, () => {
      for (let n = 1; n <= CATALOG[line].cap; n += 1) {
        const w = bareWorld();
        const a = armed(w, line, n, 400);
        expect(a.stats.equipment[line].radius).toBe(radiusAt(line, n));
        expect(w.sinkingActivationGate(a, SHELL_SLOT)).toEqual({ ok: true });
        const shell = [...w.shells.values()][0];
        expect(shell.burstRadius, `${line} tier ${n}`).toBe(radiusAt(line, n));
        const tag = line === 'dazzleShells' ? shell.flash : shell.foul;
        expect(tag!.radius, `${line} tier ${n}`).toBe(radiusAt(line, n));
      }
      // ...and the top tier is wider than tier I (the step is real).
      expect(radiusAt(line, CATALOG[line].cap)).toBeGreaterThan(BLOCK[line].radius);
    });

    it(`${line}: a tier card taken while the shell flies never changes that shell`, () => {
      const w = bareWorld();
      const a = armed(w, line, 1, 400);
      expect(w.sinkingActivationGate(a, SHELL_SLOT)).toEqual({ ok: true });
      w.applyCard(a, line); // tier II mid-flight
      expect(a.stats.equipment[line].radius).toBe(radiusAt(line, 2));
      const shell = [...w.shells.values()][0];
      expect(shell.burstRadius).toBe(radiusAt(line, 1));
    });
  }

  it('FOULING SHELL: the foul zone it leaves takes the tier radius', () => {
    const n = CATALOG.foulingShell.cap;
    const w = bareWorld();
    const a = armed(w, 'foulingShell', n, 400);
    a.input = { ...a.input, fireSeq: 1, seq: 2 };
    untilBurst(w);
    expect(w.foulZones.size).toBe(1);
    expect([...w.foulZones.values()][0].r).toBe(radiusAt('foulingShell', n));
  });

  it('FLASH SHELLS: the burst event carries r = the tier radius, and the victim set is that radius', () => {
    const n = CATALOG.dazzleShells.cap;
    const r = radiusAt('dazzleShells', n);
    const tierOne = radiusAt('dazzleShells', 1);
    const w = bareWorld();
    const a = armed(w, 'dazzleShells', n, 400);
    // Beam-on hulls PAST the burst point (off the shell's path): one centre
    // inside the tier-N radius but OUTSIDE tier I's, one just past tier N's.
    const inside = place(w, 'in', 400 + (tierOne + r) / 2, 0, Math.PI / 2);
    const outside = place(w, 'out', 400 + r + 20, 0, Math.PI / 2);
    a.input = { ...a.input, fireSeq: 1, seq: 2 };
    const seen = untilBurst(w);
    const burst = seen.find((e): e is BurstEvent => e.k === 'burst')!;
    expect(burst.f).toBe(true);
    expect(burst.r).toBe(r);
    expect(inside.dazzledUntil).toBeGreaterThan(w.now);
    expect(outside.dazzledUntil).toBe(0);
  });

  it('a NON-flash burst carries no `r` (present iff `f`)', () => {
    const w = bareWorld();
    const a = armed(w, 'foulingShell', 1, 400);
    a.input = { ...a.input, fireSeq: 1, seq: 2 };
    const burst = untilBurst(w).find((e): e is BurstEvent => e.k === 'burst')!;
    expect(burst.f).toBeUndefined();
    expect('r' in burst).toBe(false);
  });
});
