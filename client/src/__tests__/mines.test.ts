import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { Container, type Graphics } from 'pixi.js';
import {
  CONFIG,
  effectiveStats,
  type EffectiveMine,
  type MineKind,
  type MineView,
} from '@salvo/shared';
import {
  reconcileMines,
  mineArmed,
  mineKindOfView,
  ownMineRings,
  ringsKey,
  Mines,
  GLYPH_R,
  type OwnMineRings,
} from '../render/mines.js';
import { alertClock, alertTint } from '../render/alertBlend.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

/** A mine view. `c` — the mine's kind, on EVERY row since cycle 162 ("Everyone
 *  sees the kind", Eric 2026-10-01) — is set where a test says it is; a
 *  kind-less view exercises the defensive naval default. */
const mine = (id: string, own = false, by = 'p1', c?: MineKind): MineView =>
  (c === undefined ? { id, x: 0, y: 0, own, by } : { id, x: 0, y: 0, own, by, c });

/** A synthetic mine ROW at literal radii — the ring pins read radii, not the
 *  rest of the row, and literal numbers keep the alpha/style claims from
 *  agreeing with whatever CONFIG happens to hold. */
const row = (blastRadius: number, triggerRadius: number): EffectiveMine => ({
  tier: 1, reloadMs: 15_000, maxAmmo: 2, damage: 55,
  blastRadius, triggerRadius, homingTurnRate: 0, slowFactor: 1,
});

/** The owner's three rows, all at the same literal radii unless overridden. */
const params = (over: Partial<Record<MineKind, EffectiveMine>> = {}, now = 0): OwnMineRings => ({
  rows: { naval: row(48, 32), captive: row(32, 144), fouling: row(72, 48), ...over },
  now,
});

/** The owner's three rows as the REAL fold produces them for a Mine Layer. */
const liveParams = (cards: readonly string[] = [], now = 0): OwnMineRings => {
  const e = effectiveStats(CONFIG.shipClasses.mineLayer, cards).equipment;
  return { rows: { naval: e.navalMines, captive: e.captiveMines, fouling: e.foulingMines }, now };
};
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
    mines.sync([at('m1', 40, -12)]);
    expect(mines.spriteAt('m1')).toEqual({ x: 40, y: -12 });
    // Even if a frame somehow re-sent it elsewhere, there is no move path at
    // all: the reconcile diff carries add/remove only.
    const diff = reconcileMines(new Set(['m1']), [at('m1', 999, 999)]);
    expect(diff).toEqual({ add: [], remove: [] });
    expect(mines.spriteAt('m1')).toEqual({ x: 40, y: -12 });
  });
});

describe('Mines — ALERTS (Story 9.11, amendment 152) + the own/enemy layer split', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    const mines = new Mines(ownLayer, enemyLayer);
    return { ownLayer, enemyLayer, mines };
  }
  /** Every stroke color a sprite's Graphics recorded. */
  function strokeColors(layer: Container): number[] {
    const g = layer.children[0] as Graphics;
    return g.context.instructions.map((i) => (i.data.style as { color: number }).color);
  }
  beforeEach(() => alertClock.reset());
  afterEach(() => settings.reset());

  it('routes own mines to the chart layer and enemy mines to the world layer', () => {
    const { ownLayer, enemyLayer, mines } = harness();
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')]);
    expect(ownLayer.children).toHaveLength(1);
    expect(enemyLayer.children).toHaveLength(1);
  });

  it('draws every mine in WHITE at one bright alpha — own and enemy alike', () => {
    const { ownLayer, enemyLayer, mines } = harness();
    mines.sync([], params());
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')], params({}, CONFIG.mine.armDelay));
    // The own sprite's glyph AND its rings are white.
    expect(new Set(strokeColors(ownLayer))).toEqual(new Set([0xffffff]));
    expect(new Set(strokeColors(enemyLayer))).toEqual(new Set([0xffffff]));
    const glyphAlpha = (layer: Container): number =>
      ((layer.children[0] as Graphics).context.instructions[0].data.style as { alpha: number }).alpha;
    expect(glyphAlpha(ownLayer)).toBe(glyphAlpha(enemyLayer)); // the own dim is retired
  });

  it('own mines keep the white tint; an enemy mine wears the alert blend', () => {
    const { mines } = harness();
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')]);
    mines.render(1);
    mines.render(1.2);
    expect(mines.tintAt('m1')).toBe(0xffffff);
    expect(mines.tintAt('m2')).toBe(alertTint(alertClock.phase, 'full'));
    expect(mines.tintAt('nope')).toBeNull();
  });

  it('motion off: an enemy mine sits at steady ORANGE, frame after frame', () => {
    settings.set({ motion: 'off' });
    const { mines } = harness();
    mines.sync([mine('m2', false, 'foe')]);
    for (let t = 0; t < 3; t += 0.23) {
      mines.render(t);
      expect(mines.tintAt('m2')).toBe(CLIENT_CONFIG.colors.alertOrange);
    }
  });

  it('full motion: the enemy tint moves between the two warning colors', () => {
    const { mines } = harness();
    mines.sync([mine('m2', false, 'foe')]);
    const seen = new Set<number>();
    for (let t = 0; t < 1; t += 0.05) {
      mines.render(t);
      seen.add(mines.tintAt('m2') ?? -1);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('the glyph box is 10 % larger than the hit disc; the hit disc is untouched', () => {
    expect(GLYPH_R).toBeCloseTo(CONFIG.mine.hitRadiusU * 1.1, 12);
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
  const base = params({}, 10_000);

  it('is blast-solid + trigger-dashed for a NAVAL mine', () => {
    const rings = ownMineRings(base, 'naval', true);
    expect(rings.map((r) => [r.r, r.style])).toEqual([
      [48, 'solid'],
      [32, 'dashed'],
    ]);
  });

  // STORY 8.13 (epic-8 amendment 81): FOULING MINES is its own LINE — a contact
  // mine with a wider, weaker burst — so it draws the naval PAIR, off its own
  // row. The slow it applies is a card row, never a circle on the water.
  it('is the same pair for a FOULING mine, read off the FOULING row', () => {
    const rings = ownMineRings(base, 'fouling', true);
    expect(rings.map((r) => [r.r, r.style])).toEqual([
      [72, 'solid'],
      [48, 'dashed'],
    ]);
  });

  // THE POINT OF THE WIRE KIND (amendment 76): one hull may lay all three at
  // once, so the same params object must answer three different ring sets.
  it('answers per KIND from ONE params object — three fields, three answers', () => {
    const p = params();
    expect(ownMineRings(p, 'naval', true).map((r) => r.r)).toEqual([48, 32]);
    expect(ownMineRings(p, 'fouling', true).map((r) => r.r)).toEqual([72, 48]);
    expect(ownMineRings(p, 'captive', true).map((r) => r.r)).toEqual([144]);
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
  // CATALOG V3 MOVED THE CAPTIVE FLAG (R25) and STORY 8.13 DELETED IT (epic-8
  // amendments 76/81): captive mines are their own LINE, so there is no verb to
  // read — the row IS the identity, and the mine on the water says which row it
  // came from through its own wire kind. The trip ring is DERIVED from the
  // line's tier inside the fold (144 u at I, ×1.1 a rung) and its 32 u burst is
  // fixed, so the ring set READS both and re-derives neither.
  it('CAPTIVE: draws the CONFIG trip ring alone (120 u since 2026-10-08) — no 32u contact-blast ring', () => {
    const stats = effectiveStats(CONFIG.shipClasses.mineLayer, []);
    expect(stats.equipment.captiveMines.triggerRadius).toBeCloseTo(CONFIG.captiveMines.triggerRadius, 9);
    expect(stats.equipment.captiveMines.blastRadius).toBeCloseTo(32, 9);
    const rings = ownMineRings(liveParams(), 'captive', true);
    expect(rings.map((r) => [r.r, r.style])).toEqual([[CONFIG.captiveMines.triggerRadius, 'dotted']]);
    // ...and specifically NOT the blast radius, in any style.
    expect(rings.some((r) => r.r === stats.equipment.captiveMines.blastRadius)).toBe(false);
  });

  // THE LADDER IS LIVE as of Story 8.13 (amendment 84d): five CAPTIVE MINES
  // copies step the trip ring ×1.1 a rung to 210.8 u while the burst stays 32 u.
  // The ring set follows the fold without arithmetic of its own.
  it('CAPTIVE: the trip ring follows the fold to tier V without re-deriving it', () => {
    const maxed = Array<string>(5).fill('captiveMines');
    const e = effectiveStats(CONFIG.shipClasses.mineLayer, maxed).equipment.captiveMines;
    expect(e.triggerRadius).toBeCloseTo(CONFIG.captiveMines.triggerRadius * CONFIG.captiveMines.triggerStepPerTier ** 4, 6); // 175.7 u at the 120 u ring
    expect(e.blastRadius).toBeCloseTo(32, 9);
    const [ring] = ownMineRings(liveParams(maxed), 'captive', true);
    expect(ring.r).toBe(e.triggerRadius);
  });

  it('every radius carries a DISTINCT line style — the rings never rely on hue', () => {
    const styles = ownMineRings(base, 'naval', true).map((r) => r.style);
    expect(new Set(styles).size).toBe(styles.length);
  });

  it('dims the whole set while the mine is still arming, and snaps to full when armed', () => {
    // LITERAL alphas, deliberately: re-deriving them from CLIENT_CONFIG would
    // make this test agree with any value the config happens to hold, including
    // an armingScale of 1 that renders the arming state invisible.
    expect(ownMineRings(base, 'naval', true).map((r) => r.alpha)).toEqual([0.6, 0.65]);
    const arming = ownMineRings(base, 'naval', false).map((r) => r.alpha);
    expect(arming[0]).toBeCloseTo(0.24, 9); // 0.6 × armingScale 0.4 (cycle 162 rings)
    expect(arming[1]).toBeCloseTo(0.26, 9); // 0.65 × 0.4
    // ...and the arming set is unambiguously the quieter of the two.
    for (let i = 0; i < arming.length; i++) {
      expect(arming[i]).toBeLessThan(ownMineRings(base, 'naval', true)[i].alpha);
    }
  });

  it('tracks EFFECTIVE radii — a card that widens the blast widens the ring', () => {
    const wide = ownMineRings(params({ naval: row(60, 40) }), 'naval', true);
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
    const p = params();
    expect(ringsKey(ownMineRings(p, 'naval', true))).toBe(ringsKey(ownMineRings(p, 'naval', true)));
    expect(ringsKey(ownMineRings(p, 'naval', true))).not.toBe(ringsKey(ownMineRings(p, 'naval', false)));
    // The three kinds draw three different sets off the same params, so their
    // keys must differ — otherwise a captive laid beside a naval mine would
    // reuse the naval sprite's geometry and draw a contact-blast ring it has not
    // got.
    expect(ringsKey(ownMineRings(p, 'naval', true))).not.toBe(ringsKey(ownMineRings(p, 'captive', true)));
    expect(ringsKey(ownMineRings(p, 'naval', true))).not.toBe(ringsKey(ownMineRings(p, 'fouling', true)));
  });
});

describe('mineKindOfView — the wire kind, for every observer (cycle 162)', () => {
  it('reads the kind the server stamped on an OWN mine', () => {
    expect(mineKindOfView(mine('m', true, 'me', 'captive'))).toBe('captive');
    expect(mineKindOfView(mine('m', true, 'me', 'fouling'))).toBe('fouling');
  });

  // Cycle 162 (Eric 2026-10-01, "Everyone sees the kind"): an ENEMY's mine
  // carries `c` too, and its marker draws that kind's glyph.
  it('reads the kind on an ENEMY mine too', () => {
    expect(mineKindOfView(mine('m', false, 'foe', 'captive'))).toBe('captive');
  });

  // The default is defensive only — this server stamps `c` on every row.
  it('falls back to naval when the field is absent (an old/foreign frame)', () => {
    expect(mineKindOfView(mine('m', false, 'foe'))).toBe('naval');
  });

  it('falls back to naval when the field is not one of the three kinds', () => {
    expect(mineKindOfView({ c: 'bogus' as never })).toBe('naval');
  });
});

describe("Mines — the marker is the kind's glyph (cycle 162)", () => {
  /** Every Pixi path action a sprite's Graphics recorded, in order. */
  function actions(layer: Container): string[] {
    const g = layer.children[0] as unknown as {
      context: { instructions: { data: { path?: { instructions: { action: string }[] } } }[] };
    };
    return g.context.instructions.flatMap((ins) => ins.data.path?.instructions.map((p) => p.action) ?? []);
  }
  /** The marker one ENEMY mine of `kind` draws (no owner rings). */
  function marker(c?: MineKind): string[] {
    const layer = new Container();
    new Mines(new Container(), layer).sync([mine('m', false, 'foe', c)]);
    return actions(layer);
  }

  it('an enemy mine\'s kind is READ off its wire view; a kind-less (legacy) view falls back to naval', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('c', false, 'foe', 'captive'), mine('x', false, 'foe')]);
    expect(mines.kindAt('c')).toBe('captive');
    expect(mines.kindAt('x')).toBe('naval');
    // ...and still no ring for an enemy, whatever its kind.
    expect(mines.ringsAt('c')).toEqual([]);
  });

  it('the three kinds draw three different markers', () => {
    const drawn = (['naval', 'captive', 'fouling'] as const).map((k) => marker(k).join(','));
    expect(new Set(drawn).size).toBe(3);
    // The kind-less defensive branch draws exactly the naval glyph.
    expect(marker().join(',')).toBe(drawn[0]);
  });

  it('a `c` that is not one of the three kinds draws the NAVAL marker, never nothing (the defensive branch type-guards the value)', () => {
    const bogus = marker('bogus' as never);
    expect(bogus.length).toBeGreaterThan(0);
    expect(bogus.join(',')).toBe(marker('naval').join(','));
  });

  it('the naval marker is the spiked sphere: one circle and eight spikes', () => {
    const a = marker('naval');
    expect(a.filter((x) => x === 'circle')).toHaveLength(1);
    expect(a.filter((x) => x === 'lineTo')).toHaveLength(8);
  });
});

describe('Mines — rings are drawn for OWN mines only', () => {
  const rings = params();

  it('draws nothing extra when no owner stats are supplied (the pre-feature path)', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('m1', true, 'me')]);
    expect(mines.ringsAt('m1')).toEqual([]);
  });

  it('gives an OWN mine its rings and an ENEMY mine none', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')], rings);
    expect(mines.ringsAt('m1')).toHaveLength(2);
    expect(mines.ringsAt('m2')).toEqual([]);
  });

  it('snaps an arming mine to full brightness on the tick it goes live', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([], rings); // the rejoin snapshot (empty water)
    mines.sync([mine('m1', true, 'me')], rings); // a REAL drop
    const arming = mines.ringsAt('m1')[0].alpha;
    mines.sync([mine('m1', true, 'me')], { ...rings, now: CONFIG.mine.armDelay });
    expect(mines.ringsAt('m1')[0].alpha).toBeGreaterThan(arming);
  });

  // P2(a): the arming window is a SERVER-side 3s. Dating first-seen by a local
  // clock reading instead charges the mine for the transport delay, so the dim
  // outlives the arming every time by however laggy the connection is.
  it('dates first-seen by the FRAME clock, so the dim lasts exactly armDelay', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([], { ...rings, now: 5_000 });
    mines.sync([mine('m1', true, 'me')], { ...rings, now: 5_000 }); // dropped at t=5000
    const arming = mines.ringsAt('m1')[0].alpha;
    // One frame short of the window: still arming, to the millisecond.
    mines.sync([mine('m1', true, 'me')], {
      ...rings,
      now: 5_000 + CONFIG.mine.armDelay - 1,
    });
    expect(mines.ringsAt('m1')[0].alpha).toBe(arming);
    // The frame that crosses it: live.
    mines.sync([mine('m1', true, 'me')], {
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
    mines.sync([mine('old', true, 'me')], { ...rings, now: 900_000 });
    const rejoined = mines.ringsAt('old')[0].alpha;
    // Identical to a mine that has sat through its whole arming window.
    mines.sync([], rings);
    mines.sync([mine('fresh', true, 'me')], { ...rings, now: 0 });
    mines.sync([mine('fresh', true, 'me')], { ...rings, now: CONFIG.mine.armDelay });
    expect(mines.ringsAt('fresh')[0].alpha).toBe(rejoined);
    // ...and a drop laid AFTER that first frame still dims honestly.
    mines.sync([mine('later', true, 'me')], { ...rings, now: 900_000 });
    expect(mines.ringsAt('later')[0].alpha).toBeLessThan(rejoined);
  });

  it('follows a mid-life stat change (a card fitted while the field is out)', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('m1', true, 'me', 'naval')], rings);
    mines.sync([mine('m1', true, 'me', 'naval')], params({ naval: row(70, 47) }));
    expect(mines.ringsAt('m1')[0].r).toBe(70);
  });

  it('never rings an enemy mine, even on the first (rejoin) frame', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([mine('foe', false, 'them')], rings);
    expect(mines.ringsAt('foe')).toEqual([]);
  });

  // STORY 8.13, THE FAIL-FIRST PIN (epic-8 amendment 76). Before it, every own
  // mine drew `stats.equipment.navalMines` — so a captive mine laid beside a
  // naval one drew the NAVAL pair: a solid 48 u contact-blast ring around a
  // casing that never detonates on contact, and no trip ring at all. Each
  // sprite now reads the kind off ITS OWN wire view.
  it('draws each own mine off ITS OWN kind — a captive never reads the naval row', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([], rings); // rejoin snapshot: empty water
    mines.sync(
      [
        mine('n', true, 'me', 'naval'),
        mine('c', true, 'me', 'captive'),
        mine('f', true, 'me', 'fouling'),
      ],
      params({}, CONFIG.mine.armDelay * 10),
    );
    expect(mines.kindAt('c')).toBe('captive');
    // The captive draws ONE dotted trip ring at the CAPTIVE row's 144 u...
    expect(mines.ringsAt('c').map((r) => [r.r, r.style])).toEqual([[144, 'dotted']]);
    // ...while its neighbours draw their own pairs, off their own rows.
    expect(mines.ringsAt('n').map((r) => r.r)).toEqual([48, 32]);
    expect(mines.ringsAt('f').map((r) => r.r)).toEqual([72, 48]);
  });
});
