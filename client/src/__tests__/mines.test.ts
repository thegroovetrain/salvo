import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, effectiveStats, resolveBoons, type MineView } from '@salvo/shared';
import {
  reconcileMines,
  mineArmed,
  mineMoved,
  ownMineRings,
  ringsKey,
  Mines,
  type MinePos,
} from '../render/mines.js';
import { CLIENT_CONFIG } from '../config.js';

const mine = (id: string, own = false, by = 'p1'): MineView => ({ id, x: 0, y: 0, own, by });
/** A mine at a world point (the SELF-PROPELLED cases move them around). */
const at = (id: string, x: number, y: number): MineView => ({ id, x, y, own: false, by: 'p1' });
/** Sprites we currently hold, id → where we last drew them. */
const held = (...entries: [string, number, number][]): Map<string, MinePos> =>
  new Map(entries.map(([id, x, y]) => [id, { x, y }]));
/** Sprites held at the origin (the pre-2.9 "just these ids" shorthand). */
const heldAtOrigin = (...ids: string[]): Map<string, MinePos> =>
  held(...ids.map((id) => [id, 0, 0] as [string, number, number]));

describe('reconcileMines — mine list → sprite lifecycle diff', () => {
  it('adds every mine when starting from nothing', () => {
    const { add, move, remove } = reconcileMines(new Map(), [mine('m1'), mine('m2', true)]);
    expect(add.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(move).toEqual([]);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose mine dropped out of the list (triggered or fogged)', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('m1', 'm2'), [mine('m1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['m2']);
  });

  it('leaves a mine present in both AT THE SAME POINT untouched (moored)', () => {
    const { add, move, remove } = reconcileMines(heldAtOrigin('m1'), [mine('m1'), mine('m3')]);
    expect(add.map((m) => m.id)).toEqual(['m3']);
    expect(move).toEqual([]);
    expect(remove).toEqual([]);
  });

  it('handles a full swap (all gone, all new)', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('a', 'b'), [mine('c')]);
    expect(add.map((m) => m.id)).toEqual(['c']);
    expect(remove.sort()).toEqual(['a', 'b']);
  });

  it('empty incoming clears everything', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('a', 'b'), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });
});

// --- STORY 2.9: THE FROZEN-RENDERER DEFECT ------------------------------------
//
// Story 2.8's SELF-PROPELLED doctrine put mines under power: the server creeps
// them and re-sends their positions every tick. The renderer's "mines are
// static" assumption silently discarded every one of those updates, so the
// marker sat at the drop point while the live mine walked away — the player was
// shown a lie about where the lethal thing was. reconcile() now reports MOVES.

describe('reconcileMines — the creep (move) path', () => {
  it('reports a held mine that TRAVELLED as a move, not an add and not a removal', () => {
    const { add, move, remove } = reconcileMines(held(['m1', 0, 0]), [at('m1', 12, 0)]);
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
    expect(move.map((m) => [m.id, m.x, m.y])).toEqual([['m1', 12, 0]]);
  });

  it('separates the creepers from the moored ones in one sync', () => {
    const { add, move, remove } = reconcileMines(
      held(['moored', 5, 5], ['creeper', 0, 0], ['gone', 9, 9]),
      [at('moored', 5, 5), at('creeper', 0, 30), at('fresh', 1, 1)],
    );
    expect(add.map((m) => m.id)).toEqual(['fresh']);
    expect(move.map((m) => m.id)).toEqual(['creeper']);
    expect(remove).toEqual(['gone']);
  });

  it('mineMoved ignores float noise but catches a real crawl', () => {
    expect(mineMoved({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(mineMoved({ x: 0, y: 0 }, { x: 0.001, y: 0 })).toBe(false);
    expect(mineMoved({ x: 0, y: 0 }, { x: 0, y: 0.5 })).toBe(true);
  });
});

describe('Mines.sync — a creeping mine MOVES on screen (the defect fix)', () => {
  it('walks the sprite with the wire position instead of freezing it at the drop point', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    expect(mines.spriteAt('m1')).toEqual({ x: 0, y: 0, bearing: null });
    // Three ticks of creep down +x. Before Story 2.9 the sprite stayed at 0,0.
    for (const x of [10, 20, 30]) mines.sync([at('m1', x, 0)], () => 0x00ff00);
    expect(mines.spriteAt('m1')?.x).toBe(30);
  });

  it('turns the creep tick onto the course made good (a STATIC tell — reads at motion=off)', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    expect(mines.spriteAt('m1')?.bearing).toBeNull(); // a moored mine has no course
    mines.sync([at('m1', 0, 20)], () => 0x00ff00); // due +y
    expect(mines.spriteAt('m1')?.bearing).toBeCloseTo(Math.PI / 2, 9);
    mines.sync([at('m1', -20, 20)], () => 0x00ff00); // turned onto -x
    expect(mines.spriteAt('m1')?.bearing).toBeCloseTo(Math.PI, 9);
  });

  it('lays a wake behind the creep — one dot per spacing interval, none while moored', () => {
    const wake = vi.fn();
    const mines = new Mines(new Container(), new Container(), undefined, wake);
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    expect(wake).not.toHaveBeenCalled(); // a drop is not a creep
    mines.sync([at('m1', 0, 0)], () => 0x00ff00); // re-sent verbatim: still moored
    expect(wake).not.toHaveBeenCalled();
    mines.sync([at('m1', 100, 0)], () => 0x00ff00); // a long leg pays out several
    const afterLeg = wake.mock.calls.length;
    expect(afterLeg).toBeGreaterThan(1);
    mines.sync([at('m1', 100, 0)], () => 0x00ff00); // stopped again — nothing more
    expect(wake.mock.calls.length).toBe(afterLeg);
  });

  // STORY 2.9 REVIEW: the dots were all dropped at the leg's ENDPOINT — where
  // the mine now IS, not where it has BEEN — so a leg covering several spacings
  // painted its whole wake as one clot on the mine's nose. A wake that leads its
  // own mine points the player the wrong way down the mine's track.
  it('lays each wake dot where the mine CROSSED it, along the leg', () => {
    const wake = vi.fn();
    const spacing = CLIENT_CONFIG.ordnance.creepWakeSpacing;
    const mines = new Mines(new Container(), new Container(), undefined, wake);
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    mines.sync([at('m1', spacing * 3, 0)], () => 0x00ff00); // one frame, three spacings
    expect(wake.mock.calls).toEqual([
      [spacing, 0],
      [spacing * 2, 0],
      [spacing * 3, 0],
    ]);
  });

  it('follows the LEG bearing, not an axis (a diagonal creep)', () => {
    const wake = vi.fn();
    const s = CLIENT_CONFIG.ordnance.creepWakeSpacing;
    const mines = new Mines(new Container(), new Container(), undefined, wake);
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    // Two spacings due north-east (a 3-4-5 leg scaled to 2 spacings).
    mines.sync([at('m1', 2 * s * 0.6, 2 * s * 0.8)], () => 0x00ff00);
    expect(wake).toHaveBeenCalledTimes(2);
    const [first, second] = wake.mock.calls;
    expect(first[0]).toBeCloseTo(s * 0.6, 6);
    expect(first[1]).toBeCloseTo(s * 0.8, 6);
    expect(second[0]).toBeCloseTo(2 * s * 0.6, 6);
    expect(second[1]).toBeCloseTo(2 * s * 0.8, 6);
  });
});

describe('Mines — firer-hue tint (Story 1.12) + own/enemy layer split', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    const mines = new Mines(ownLayer, enemyLayer);
    return { ownLayer, enemyLayer, mines };
  }

  it('resolves each new mine’s tint from its dropper id (`by`) via hueFor', () => {
    const { mines } = harness();
    const hueFor = vi.fn((_by: string) => 0x123456);
    mines.sync([mine('m1', true, 'alice'), mine('m2', false, 'bob')], hueFor);
    expect(hueFor.mock.calls.map((c) => c[0]).sort()).toEqual(['alice', 'bob']);
  });

  it('routes own mines to the chart layer and enemy mines to the world layer', () => {
    const { ownLayer, enemyLayer, mines } = harness();
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')], () => 0x00ff00);
    expect(ownLayer.children).toHaveLength(1);
    expect(enemyLayer.children).toHaveLength(1);
  });

  it('recolors a mine that booted on the amber fallback once its firer hue later resolves, then latches', () => {
    const { mines } = harness();
    // hueFor returns null at spawn (roster hue not yet synced) → amber fallback.
    const hueFor = vi.fn((_by: string) => null as number | null);
    mines.sync([mine('m1', true, 'late')], hueFor);
    expect(hueFor).toHaveBeenCalled(); // probed at spawn + retry, still unresolved
    // The roster hue lands: the next sync's retry resolves + redraws once.
    hueFor.mockReturnValue(0x00ff00);
    mines.sync([mine('m1', true, 'late')], hueFor);
    const afterResolve = hueFor.mock.calls.length;
    // Latched now — a further sync must NOT probe the resolved marker again.
    mines.sync([mine('m1', true, 'late')], hueFor);
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });
});

// --- OWN-MINE RINGS (aim-preview cycle) -------------------------------------
//
// Your own minefield used to be a set of dots: the numbers that decide whether
// a hull dies — trip radius, blast radius, and (under SELF-PROPELLED) the water
// the mine hunts — were invisible to the only player entitled to know them.
// These rings are owner-private and always-on, dual-coded by LINE STYLE rather
// than hue (all three render in the dropper's personal color), and dimmed while
// the mine is still arming. An enemy observer gets none of it.

describe('ownMineRings — the owner-private radius set', () => {
  const base = { blast: 48, trigger: 32, captive: false, now: 10_000 };

  it('is blast-solid + trigger-dashed for an ORDINARY mine', () => {
    const rings = ownMineRings(base, true);
    expect(rings.map((r) => [r.r, r.style])).toEqual([
      [48, 'solid'],
      [32, 'dashed'],
    ]);
  });

  // RETIRED with SELF-PROPELLED MINES (R2.6): the sparse-dotted ACQUISITION
  // ring had exactly one source — the creeping mine's hunting reach — and that
  // verb left the game with its card, taking `OwnMineRings.acquire` with it.
  // The dotted STYLE survives, inherited by the captive trip ring below,
  // because "the water this mine hunts" is exactly what that ring now means.

  // CAPTIVE MINES (R2.12): the numbers arrive ALREADY transformed off
  // effectiveStats (trigger and blast swap, then trigger triples), so the ring
  // set reads them and never re-derives them. The tell that matters is which
  // rings exist: a captive mine draws its wide TRIP ring and NO blast circle,
  // because it never detonates on contact and a solid ring around the casing
  // would promise a kill it cannot deliver.
  it('CAPTIVE: draws the 144u trip ring alone — no 32u contact-blast ring', () => {
    const stats = effectiveStats(CONFIG.shipClasses.mineLayer, resolveBoons(['mineCaptive']));
    expect(stats.mine.captive).toBe(true);
    expect(stats.mine.triggerRadius).toBeCloseTo(144, 9);
    expect(stats.mine.blastRadius).toBeCloseTo(32, 9);
    const rings = ownMineRings(
      { blast: stats.mine.blastRadius, trigger: stats.mine.triggerRadius, captive: true, now: 0 },
      true,
    );
    expect(rings.map((r) => [r.r, r.style])).toEqual([[144, 'dotted']]);
    // ...and specifically NOT the blast radius, in any style.
    expect(rings.some((r) => r.r === stats.mine.blastRadius)).toBe(false);
  });

  it('CAPTIVE: the trip ring follows the MINES ladder without re-deriving it', () => {
    const maxed = effectiveStats(
      CONFIG.shipClasses.mineLayer,
      resolveBoons(['mineCaptive', 'mineBlast', 'mineBlast', 'mineBlast', 'mineBlast']),
    );
    const [ring] = ownMineRings(
      { blast: maxed.mine.blastRadius, trigger: maxed.mine.triggerRadius, captive: true, now: 0 },
      true,
    );
    expect(ring.r).toBe(maxed.mine.triggerRadius);
    expect(ring.r).toBeCloseTo(210.8, 1);
  });

  it('every radius carries a DISTINCT line style — the rings never rely on hue', () => {
    const styles = ownMineRings(base, true).map((r) => r.style);
    expect(new Set(styles).size).toBe(styles.length);
  });

  it('dims the whole set while the mine is still arming, and snaps to full when armed', () => {
    // LITERAL alphas, deliberately: re-deriving them from CLIENT_CONFIG would
    // make this test agree with any value the config happens to hold, including
    // an armingScale of 1 that renders the arming state invisible.
    expect(ownMineRings(base, true).map((r) => r.alpha)).toEqual([0.3, 0.34]);
    const arming = ownMineRings(base, false).map((r) => r.alpha);
    expect(arming[0]).toBeCloseTo(0.12, 9);
    expect(arming[1]).toBeCloseTo(0.136, 9);
    // ...and the arming set is unambiguously the quieter of the two.
    for (let i = 0; i < arming.length; i++) {
      expect(arming[i]).toBeLessThan(ownMineRings(base, true)[i].alpha);
    }
  });

  it('tracks EFFECTIVE radii — a boon that widens the blast widens the ring', () => {
    const wide = ownMineRings({ ...base, blast: 60 }, true);
    expect(wide[0].r).toBe(60);
  });
});

describe('mineArmed / ringsKey — the client-inferred arming window', () => {
  it('arms exactly CONFIG.mine.armDelay after the mine was first seen', () => {
    expect(mineArmed(1000, 1000)).toBe(false);
    expect(mineArmed(1000, 1000 + CONFIG.mine.armDelay - 1)).toBe(false);
    expect(mineArmed(1000, 1000 + CONFIG.mine.armDelay)).toBe(true);
  });

  it('keys a ring set so an unchanged set never redraws, and any change does', () => {
    const p = { blast: 48, trigger: 32, captive: false, now: 0 };
    expect(ringsKey(ownMineRings(p, true))).toBe(ringsKey(ownMineRings(p, true)));
    expect(ringsKey(ownMineRings(p, true))).not.toBe(ringsKey(ownMineRings(p, false)));
    // Fitting CAPTIVE MINES mid-match rewrites the set, so the key must move —
    // otherwise a live field keeps drawing contact-blast rings it no longer has.
    expect(ringsKey(ownMineRings(p, true))).not.toBe(
      ringsKey(ownMineRings({ ...p, captive: true }, true)),
    );
  });
});

describe('Mines — rings are drawn for OWN mines only', () => {
  const rings = { blast: 48, trigger: 32, captive: false, now: 0 };

  it('draws nothing extra when no owner stats are supplied (the pre-feature path)', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00);
    expect(mines.ringsAt('m1')).toEqual([]);
  });

  it('gives an OWN mine its rings and an ENEMY mine none', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')], () => 0x00ff00, rings);
    expect(mines.ringsAt('m1')).toHaveLength(2);
    expect(mines.ringsAt('m2')).toEqual([]);
  });

  it('snaps an arming mine to full brightness on the tick it goes live', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([], () => 0x00ff00, rings); // the rejoin snapshot (empty water)
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, rings); // a REAL drop
    const arming = mines.ringsAt('m1')[0].alpha;
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, { ...rings, now: CONFIG.mine.armDelay });
    expect(mines.ringsAt('m1')[0].alpha).toBeGreaterThan(arming);
  });

  // P2(a): the arming window is a SERVER-side 3s. Dating first-seen by a local
  // clock reading instead charges the mine for the transport delay, so the dim
  // outlives the arming every time by however laggy the connection is.
  it('dates first-seen by the FRAME clock, so the dim lasts exactly armDelay', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([], () => 0x00ff00, { ...rings, now: 5_000 });
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, { ...rings, now: 5_000 }); // dropped at t=5000
    const arming = mines.ringsAt('m1')[0].alpha;
    // One frame short of the window: still arming, to the millisecond.
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, {
      ...rings,
      now: 5_000 + CONFIG.mine.armDelay - 1,
    });
    expect(mines.ringsAt('m1')[0].alpha).toBe(arming);
    // The frame that crosses it: live.
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, {
      ...rings,
      now: 5_000 + CONFIG.mine.armDelay,
    });
    expect(mines.ringsAt('m1')[0].alpha).toBeGreaterThan(arming);
  });

  // P2(b): a reload/rejoin re-adds a field that has been on the water for
  // minutes. Treating those as fresh drops flashes live ordnance as "arming"
  // for 3s — a lie about which of your own mines can kill right now.
  it('treats the FIRST synced frame as a rejoin: its mines come up ARMED, not arming', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('old', true, 'me')], () => 0x00ff00, { ...rings, now: 900_000 });
    const rejoined = mines.ringsAt('old')[0].alpha;
    // Identical to a mine that has sat through its whole arming window.
    mines.sync([], () => 0x00ff00, rings);
    mines.sync([mine('fresh', true, 'me')], () => 0x00ff00, { ...rings, now: 0 });
    mines.sync([mine('fresh', true, 'me')], () => 0x00ff00, { ...rings, now: CONFIG.mine.armDelay });
    expect(mines.ringsAt('fresh')[0].alpha).toBe(rejoined);
    // ...and a drop laid AFTER that first frame still dims honestly.
    mines.sync([mine('later', true, 'me')], () => 0x00ff00, { ...rings, now: 900_000 });
    expect(mines.ringsAt('later')[0].alpha).toBeLessThan(rejoined);
  });

  it('follows a mid-life stat change (a boon fitted while the field is out)', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, rings);
    mines.sync([mine('m1', true, 'me')], () => 0x00ff00, { ...rings, blast: 70 });
    expect(mines.ringsAt('m1')[0].r).toBe(70);
  });

  it('never rings an enemy mine, even on the first (rejoin) frame', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('foe', false, 'them')], () => 0x00ff00, rings);
    expect(mines.ringsAt('foe')).toEqual([]);
  });
});
