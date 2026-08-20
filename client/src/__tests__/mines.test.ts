import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, effectiveStats, resolveBoons, type MineView } from '@salvo/shared';
import { reconcileMines, mineArmed, ownMineRings, ringsKey, Mines } from '../render/mines.js';
import { CLIENT_CONFIG } from '../config.js';

const mine = (id: string, own = false, by = 'p1'): MineView => ({ id, x: 0, y: 0, own, by });
/** A mine at a world point. */
const at = (id: string, x: number, y: number): MineView => ({ id, x, y, own: false, by: 'p1' });
/** Sprite ids we currently hold. */
const heldAtOrigin = (...ids: string[]): ReadonlySet<string> => new Set(ids);

describe('reconcileMines — mine list → sprite lifecycle diff', () => {
  it('adds every mine when starting from nothing', () => {
    const { add, remove } = reconcileMines(new Set(), [mine('m1'), mine('m2', true)]);
    expect(add.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose mine dropped out of the list (triggered or fogged)', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('m1', 'm2'), [mine('m1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['m2']);
  });

  it('leaves a mine present in both untouched', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('m1'), [mine('m1'), mine('m3')]);
    expect(add.map((m) => m.id)).toEqual(['m3']);
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

// --- RETIRED (Story 7-5 wave 2): THE CREEP RENDER PATH ------------------------
//
// Story 2.9 fixed a real defect — the renderer discarded the position updates a
// SELF-PROPELLED mine sent every tick, so the marker sat at the drop point while
// the lethal mine walked away — and pinned the fix across eight cases: the move
// diff, `mineMoved`'s float-noise epsilon, the sprite walk, the heading tick and
// four wake-dot placement cases.
//
// All eight are RETIRED, not adapted. The doctrine that made a mine move left
// the game with its card in Story 7-5 wave 2, and CAPTIVE MINES — which replaced
// it — is MOORED: it attacks by launching a torpedo. There is no move path left
// to defend, so the pins go with the code rather than testing a branch that can
// never be taken. What survives as the standing claim is the ONE case below.

describe('Mines.sync — a mine is MOORED (Story 7-5 wave 2)', () => {
  it('places the sprite once at the drop point and never walks it', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([at('m1', 40, -12)], () => 0x00ff00);
    expect(mines.spriteAt('m1')).toEqual({ x: 40, y: -12 });
    // Even if a frame somehow re-sent it elsewhere, there is no move path at
    // all: the reconcile diff carries add/remove only.
    const diff = reconcileMines(new Set(['m1']), [at('m1', 999, 999)]);
    expect(diff).toEqual({ add: [], remove: [] });
    expect(mines.spriteAt('m1')).toEqual({ x: 40, y: -12 });
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
