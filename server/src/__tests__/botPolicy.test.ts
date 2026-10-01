// COMBAT-BOT POLICY — the six priority profiles (ai/profiles.ts), utility
// scoring over the perception view (ai/utility.ts) and the card spend policy
// (ai/spending.ts). bots.test.ts owns the driver plumbing (cadence, port,
// lifecycle, emission); nothing here touches a World.
//
// The things this file exists to pin:
//   * BOTH BLIP GRAMMARS fold — a `silhouette` paint carries pose, a `return`
//     paint carries only a cell footprint and must still produce a usable
//     identity-free track (the room picks one grammar per match; a bot cannot
//     choose which one it gets);
//   * RING ESCAPE DOMINATES every other posture, at any hp, with any target;
//   * THE REACTION DELAY gates action on a freshly acquired track — the E2
//     competence knob, in one place;
//   * THE POINTS SCORER (Story 8.20, Eric ruling 2026-09-30) — every scorer
//     row of the spec's I/O matrix with its exact CONFIG.bots.cardPoints
//     arithmetic, the seeded tie-break (one spend-stream draw, only on a tie),
//     refused cards never scored, and a seeded property through the REAL
//     draw that no personality sails ten levels without a Q/E/R weapon;
//   * THE SIX TASTES are Eric's verbatim — the proof that personalities change
//     what a bot wants rather than how good it is.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_SLOTS,
  GUN_IDS,
  MOUNTED_GUN,
  MULLIGAN_CHOICE,
  SHIP_CLASS_IDS,
  WEAPON_SLOTS,
  classShift,
  drawOffer,
  effectiveStats,
  hullEnvelope,
  mulberry32,
  slotsWithCards,
  type Contact,
  type EffectiveStats,
  type EquipmentId,
  type GameEvent,
  type HullId,
  type LineId,
  type Rng,
  type SlotItemId,
  type ZoneRing,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import type { PerceptionView } from '../game/perception.js';
import type { AnyProfileId, BotMind, BotPosture, BotProfileId } from '../game/ai/types.js';
import {
  BOT_PROFILES,
  TEST_PROFILES,
  TEST_PROFILE_HULL,
  TEST_PROFILE_IDS,
  engagementBand,
  isTestProfileId,
  profileOf,
  testProfileHull,
} from '../game/ai/profiles.js';
import {
  choosePosture,
  foldView,
  hasPersistence,
  isActionable,
  pullBand,
  ringDeadband,
  scoreTrack,
  selectTarget,
  TRACK_PERSIST_MS,
  tracksOf,
  type BotSituation,
  type BotTrack,
} from '../game/ai/utility.js';
import { cardScore, chooseSpend, type BotSpendState } from '../game/ai/spending.js';
import { APPETITE_EAGER, APPETITE_NEUTRAL, appetiteFor } from '../game/ai/equipment.js';

// --- builders ---------------------------------------------------------------

function mind(profile: BotProfileId = 'duelist'): BotMind {
  return {
    rng: mulberry32(7),
    spendRng: mulberry32(11),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile,
    phase: 0,
    view: null,
    viewAt: -1,
    contacts: new Map(),
    targetKey: null,
    posture: 'reposition',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

function view(over: Partial<PerceptionView> = {}): PerceptionView {
  return { contacts: [], events: [], mines: [], litZones: [], burnZones: [], decoys: [], smoke: [], ...over };
}

function contact(id: string, x: number, y: number, cls: HullId = 'battleship'): Contact {
  return { id, x, y, heading: 0, speed: 20, cls };
}

/** A radar paint: a 2x2 all-lit footprint at absolute cell (gx, gy).
 *  Centroid = ((gx+1) * cell, (gy+1) * cell). */
function returnBlip(gx: number, gy: number, t: number): GameEvent {
  return { k: 'blip', t, gx, gy, w: 2, h: 2, bits: [0b1111] };
}

const CELL = CONFIG.vision.radarCellU;

function stats(cls: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'battleship'): EffectiveStats {
  return effectiveStats(hullEnvelope(cls));
}

const WIDE_RING: ZoneRing = { cx: 0, cy: 0, r: 100000 };

/** THE FIXTURE HULL per profile (Story 8.20 unlocked personalities from
 *  hulls). A test FIXTURE, not a game rule: each in-game row keeps sailing the
 *  hull it was written against so every stats-dependent expectation below
 *  reads exactly as before; a test row reads its bound hull. */
const FIXTURE_HULL: Readonly<Record<BotProfileId, 'torpedoBoat' | 'battleship' | 'mineLayer'>> = {
  raider: 'torpedoBoat',
  duelist: 'torpedoBoat',
  bulwark: 'battleship',
  siege: 'battleship',
  forager: 'mineLayer',
  trapper: 'mineLayer',
};

function fixtureHull(id: AnyProfileId): 'torpedoBoat' | 'battleship' | 'mineLayer' {
  return isTestProfileId(id) ? TEST_PROFILE_HULL[id] : FIXTURE_HULL[id];
}

/** Open water unless a test names terrain — `islands: []` is the explicit
 *  statement of intent, exactly as `openWorld()` is in botTactics.test.ts. */
function situation(over: Partial<BotSituation> = {}): BotSituation {
  const profile = over.profile ?? profileOf('duelist');
  return {
    now: 10000,
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    stats: over.stats ?? stats(fixtureHull(profile.id)),
    // Dead in the water by default: `ringDeadband` floors at RATED speed, so
    // 0 here means every test that does not name a speed reads the rated turn
    // radius — the figure the class table publishes.
    speed: 0,
    profile,
    ring: WIDE_RING,
    islands: [],
    ...over,
  };
}

/** The one track in a mind (tests always fold a single subject). */
function onlyTrack(m: BotMind): BotTrack {
  const all = tracksOf(m);
  expect(all.length).toBe(1);
  return all[0];
}

// --- profiles ---------------------------------------------------------------

describe('ai/profiles — six priority profiles, one competence level', () => {
  it('covers exactly CONFIG.bots.profiles, and no in-game row names a hull (Story 8.20)', () => {
    expect(Object.keys(BOT_PROFILES).sort()).toEqual([...CONFIG.bots.profiles].sort());
    for (const p of Object.values(BOT_PROFILES)) {
      expect(Object.hasOwn(p, 'hullId'), p.id).toBe(false);
      expect(testProfileHull(p.id), p.id).toBeNull(); // a personality never decides the hull
    }
  });

  it('carries the SIX TASTES of Eric ruling 2026-09-30 (R5) verbatim', () => {
    const tastes = Object.fromEntries(Object.values(BOT_PROFILES).map((p) => [p.id, p.taste]));
    expect(tastes).toEqual({
      raider: {
        style: 'specialist',
        favoriteUpgrades: ['speed', 'weapons'],
        favoriteConsumables: ['smokeScreen', 'chaff'],
        favoriteWeapons: ['heavyTorpedo', 'lightTorpedo'],
        beltHunger: 'medium',
      },
      duelist: {
        style: 'specialist',
        favoriteUpgrades: ['gun', 'turning', 'reload'],
        favoriteConsumables: ['shieldBlock', 'dazzleShells'],
        favoriteWeapons: ['heavyTorpedo', 'lightTorpedo'],
        beltHunger: 'low',
      },
      bulwark: {
        style: 'rounded',
        favoriteUpgrades: ['armor'],
        favoriteConsumables: ['hullRepair', 'shieldBlock'],
        favoriteWeapons: ['broadside', 'starShells'],
        beltHunger: 'high',
      },
      siege: {
        style: 'specialist',
        favoriteUpgrades: ['weapons', 'radarSweep'],
        favoriteConsumables: ['dazzleShells', 'supercavTorpedo'],
        favoriteWeapons: ['starShells', 'phosphorShells', 'broadside'],
        beltHunger: 'low',
      },
      forager: {
        style: 'rounded',
        favoriteUpgrades: ['gun', 'reload'],
        favoriteConsumables: ['hullRepair', 'decoyBuoy'],
        favoriteWeapons: ['navalMines', 'captiveMines', 'foulingMines'],
        beltHunger: 'medium',
      },
      trapper: {
        style: 'rounded',
        favoriteUpgrades: ['weapons', 'speed'],
        favoriteConsumables: ['smokeScreen', 'decoyBuoy', 'chaff'],
        favoriteWeapons: ['navalMines', 'captiveMines', 'foulingMines'],
        beltHunger: 'high',
      },
    });
    // Every favorite names something real.
    for (const p of Object.values(BOT_PROFILES)) {
      for (const c of p.taste.favoriteConsumables) expect(Object.hasOwn(CATALOG, c), c).toBe(true);
      for (const w of p.taste.favoriteWeapons) expect(Object.hasOwn(CATALOG, w), w).toBe(true);
    }
  });

  // THE FAMILY FALLBACK IS GONE WITH ZERO BEHAVIOR CHANGE (Story 8.20). The
  // old resolver read `appetite[id] ?? appetite[family[id]] ?? base`; the
  // family map is hard-coded HERE as the oracle, so this pin proves the
  // explicit per-line rows reproduce every number it used to resolve.
  it('appetiteFor with explicit rows equals the retired APPETITE_FAMILY resolution, row x id', () => {
    const OLD_FAMILY: Partial<Record<EquipmentId, EquipmentId>> = {
      lightTorpedo: 'heavyTorpedo',
      captiveMines: 'navalMines',
      foulingMines: 'navalMines',
      machineGun: 'gun',
      flak: 'gun',
      instantReload: 'boost',
      damageCut: 'boost',
      phosphorShells: 'starShells',
    };
    // The pre-8.20 appetite tables, verbatim (the oracle's input).
    const OLD_APPETITE: Record<AnyProfileId, Partial<Record<EquipmentId, number>>> = {
      raider: { heavyTorpedo: 2.5, boost: 2.0 },
      duelist: { heavyTorpedo: 1.5, boost: 1.5 },
      bulwark: { broadside: 2.0, starShells: 1.2 },
      siege: { starShells: 2.4, broadside: 2.2 },
      forager: { navalMines: 1.4 },
      trapper: { navalMines: 2.6 },
      randomTorpedoBoat: { gun: 2.0, heavyTorpedo: 2.2, navalMines: 2.2, boost: 2.2, broadside: 2.2, starShells: 2.2 },
      randomBattleship: { gun: 2.0, heavyTorpedo: 2.2, navalMines: 2.2, boost: 2.2, broadside: 2.2, starShells: 2.2 },
      randomMineLayer: { gun: 2.0, heavyTorpedo: 2.2, navalMines: 2.2, boost: 2.2, broadside: 2.2, starShells: 2.2 },
    };
    const ALL_EQUIPMENT: EquipmentId[] = [
      'gun', 'boost', 'lightTorpedo', 'heavyTorpedo', 'navalMines', 'captiveMines', 'foulingMines',
      'machineGun', 'flak', 'broadside', 'starShells', 'phosphorShells', 'instantReload', 'damageCut',
    ];
    const rows: AnyProfileId[] = [...CONFIG.bots.profiles, ...TEST_PROFILE_IDS];
    for (const id of rows) {
      const row = profileOf(id);
      const bare = { ...row, appetite: {} };
      for (const eq of ALL_EQUIPMENT) {
        const fam = OLD_FAMILY[eq];
        const old = OLD_APPETITE[id][eq] ?? (fam === undefined ? undefined : OLD_APPETITE[id][fam]) ?? appetiteFor(bare, eq);
        expect(appetiteFor(row, eq), `${id}.${eq}`).toBe(old);
      }
    }
  });

  it('carries no competence knob — scatter and reaction stay CONFIG-only', () => {
    // E1/E2: profiles decide WANT, never SKILL. If either of the two
    // difficulty knobs ever appears on a profile row, difficulty has become a
    // ladder and the ruling is broken.
    for (const p of Object.values(BOT_PROFILES)) {
      const row = p as unknown as Record<string, unknown>;
      expect(row.aimScatterU).toBeUndefined();
      expect(row.reactionMs).toBeUndefined();
    }
  });

  it('bands are ordered fractions of INTEL RANGE, so they move with the ruler rather than a literal', () => {
    for (const p of Object.values(BOT_PROFILES)) {
      expect(p.bandMinFrac).toBeGreaterThan(0);
      expect(p.bandMaxFrac).toBeGreaterThan(p.bandMinFrac);
      expect(p.bandMaxFrac).toBeLessThanOrEqual(1);
    }
    const base = stats('battleship');
    const wide = { ...base, radarRange: base.radarRange * 2 };
    const siege = profileOf('siege');
    expect(engagementBand(siege, wide).max).toBeCloseTo(engagementBand(siege, base).max * 2, 6);
  });

  it('siege stands off, duelist knife-fights, bulwark trades longest', () => {
    expect(profileOf('siege').bandMinFrac).toBeGreaterThan(profileOf('duelist').bandMaxFrac);
    // Eric ruling C2, carried by the appetite table since the doctrine pass:
    // siege reaches for flares EAGERLY (the shipped staleness trigger).
    expect(appetiteFor(profileOf('siege'), 'starShells')).toBeGreaterThanOrEqual(APPETITE_EAGER);
    for (const id of ['raider', 'duelist', 'forager', 'trapper'] as const) {
      expect(profileOf('bulwark').disengageHpFrac).toBeLessThan(profileOf(id).disengageHpFrac);
    }
  });

  it('siege\'s band stays inside the broadside rung (ruled: bandMaxFrac <= 0.625)', () => {
    // `broadside.rangeU` is the 5/8 rung (radarRange x muzzleFlashFactor), so
    // a band max past 0.625 would stand siege's heavy weapon out of range of
    // its own preferred water.
    expect(profileOf('siege').bandMaxFrac).toBeLessThanOrEqual(CONFIG.vision.muzzleFlashFactor);
  });

  it('THE MINE LAYER HANGS BACK (Eric ruling 2026-08-20, cycle 111): ruled bands and thresholds', () => {
    // Cycle 110's A/B measured the ML dying before its payoff (181.1s afloat
    // vs the random control's 264.0s); Eric ruled these values verbatim —
    // hang back to survive to the payoff. Pinned as literals so a "tuning"
    // drift is a reviewed edit, not an accident.
    const forager = profileOf('forager');
    expect(forager.bandMinFrac).toBe(0.45);
    expect(forager.bandMaxFrac).toBe(0.8);
    expect(forager.disengageHpFrac).toBe(0.55);
    expect(forager.healHpFrac).toBe(0.6);
    const trapper = profileOf('trapper');
    expect(trapper.bandMinFrac).toBe(0.25);
    expect(trapper.bandMaxFrac).toBe(0.5);
    expect(trapper.disengageHpFrac).toBe(0.45);
    expect(trapper.healHpFrac).toBe(0.6);
    // Forager is now the EARLIEST break-off in the game — survival IS its
    // plan — and its whole band stays inside its own gun reach (rangeU is
    // radarRange), so hanging back costs no firepower.
    for (const id of ['raider', 'duelist', 'bulwark', 'siege', 'trapper'] as const) {
      expect(forager.disengageHpFrac).toBeGreaterThan(profileOf(id).disengageHpFrac);
    }
    expect(forager.bandMaxFrac).toBeLessThanOrEqual(1);
  });

  // REWRITTEN (Story 8.4, FR57/AR48): the old half of this pin —
  // `preparedMineReserve + mine.maxAmmo <= mine.maxLive` — measured headroom
  // under a board cap that no longer exists. Nothing is ever evicted now, so
  // the reserve is a pure restraint dial and all that remains to pin is that
  // it is a real, positive bound on unprompted seeding.
  it('the prepared-lay reserve is a positive restraint dial (there is no board cap left)', () => {
    expect(CONFIG.bots.preparedMineReserve).toBeGreaterThan(0);
    expect('maxLive' in CONFIG.mine).toBe(false);
  });

  it('the appetite table is the ONLY weapon word a profile carries, and every entry is positive', () => {
    // The retired capability flags may not regrow: capability comes from the
    // LOADOUT, appetite only modulates proactivity.
    for (const p of Object.values(BOT_PROFILES)) {
      const row = p as unknown as Record<string, unknown>;
      expect(row.usesStarShells).toBeUndefined();
      expect(row.usesMinesProactively).toBeUndefined();
      expect(row.usesBoost).toBeUndefined();
      for (const v of Object.values(p.appetite)) expect(v).toBeGreaterThan(0);
    }
    // Temperament modulates PROACTIVITY only: trapper lays as a standing plan
    // (eager), siege only reacts (neutral base for an acquired mine).
    expect(appetiteFor(profileOf('trapper'), 'navalMines')).toBeGreaterThanOrEqual(APPETITE_EAGER);
    expect(appetiteFor(profileOf('siege'), 'navalMines')).toBeLessThan(APPETITE_EAGER);
    expect(appetiteFor(profileOf('siege'), 'navalMines')).toBeGreaterThanOrEqual(APPETITE_NEUTRAL);
    // The gun is the fallback: no profile ranks anything below it.
    for (const p of Object.values(BOT_PROFILES)) {
      for (const [id, v] of Object.entries(p.appetite)) {
        if (id === 'gun') continue;
        expect(v).toBeGreaterThan(appetiteFor(p, 'gun'));
      }
    }
  });

  it('forager is the one profile that would rather shoot world content', () => {
    const f = profileOf('forager');
    expect(f.targetWeights.fleet).toBeGreaterThan(f.targetWeights.captain);
    for (const id of ['raider', 'duelist', 'bulwark', 'siege', 'trapper'] as const) {
      const w = profileOf(id).targetWeights;
      expect(w.fleet).toBeLessThanOrEqual(w.captain);
    }
  });
});

// --- perception fold: the radar wire -----------------------------------------

describe('ai/utility — the fold works on the identity-free radar wire', () => {
  it('position derived from the footprint, identity-free', () => {
    const m = mind();
    foldView(m, view({ events: [returnBlip(10, 20, 900)] }), 1000);
    const t = onlyTrack(m);
    expect(t.id).toBeNull();
    expect(t.heading).toBeNull();
    expect(t.speed).toBeNull();
    expect(t.cls).toBeNull();
    expect(t.x).toBeCloseTo(11 * CELL, 6);
    expect(t.y).toBeCloseTo(21 * CELL, 6);
  });

  it('an empty mask is not a contact, and never throws', () => {
    const m = mind();
    const empty: GameEvent = { k: 'blip', t: 900, gx: 3, gy: 4, w: 2, h: 2, bits: [0] };
    expect(() => foldView(m, view({ events: [empty] }), 1000)).not.toThrow();
    expect(tracksOf(m).length).toBe(0);
  });

  it('a nearby second paint ASSOCIATES to the same track', () => {
    const m = mind();
    foldView(m, view({ events: [returnBlip(10, 20, 900)] }), 1000);
    foldView(m, view({ events: [returnBlip(11, 20, 1150)] }), 1200);
    const t = onlyTrack(m); // one track, moved — not two ghosts
    expect(t.firstSeenAt).toBe(1000); // the reaction gate's clock survives
    expect(t.seenAt).toBe(1200);
    expect(t.x).toBeCloseTo(12 * CELL, 6);
  });

  it('memory expires at contactMemoryMs and a sunk hull is retired at once', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 120, 0)] }), 1000);
    foldView(m, view(), 1000 + CONFIG.bots.contactMemoryMs);
    expect(tracksOf(m).length).toBe(1); // still inside the window
    foldView(m, view(), 1000 + CONFIG.bots.contactMemoryMs + 1);
    expect(tracksOf(m).length).toBe(0);

    foldView(m, view({ contacts: [contact('e2', 50, 0)] }), 5000);
    foldView(m, view({ events: [{ k: 'sunk', id: 'e2' }] }), 5050);
    expect(tracksOf(m).length).toBe(0);
  });
});

// --- `live` means SIGHTED NOW ------------------------------------------------

describe('ai/utility — `live` is a truesight claim, not a write-only flag', () => {
  it('is DROPPED by the first fold that carries no truesight contact for the track', () => {
    // It shipped as a flag `writeTrack` set and nothing ever cleared, so a
    // hull sighted once read as visible for the whole 8s memory window
    // (observed at ageMs 6950). The PLOT survives; only the claim to see it
    // right now is dropped.
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 120, 0)] }), 1000);
    expect(onlyTrack(m).live).toBe(true);
    foldView(m, view(), 1050);
    const t = onlyTrack(m);
    expect(t.live).toBe(false);
    expect(t.seenAt).toBe(1000);
    expect({ x: t.x, y: t.y }).toEqual({ x: 120, y: 0 });
  });

  it('a radar paint refreshes a track without ever making it live, and so does a Hit Call', () => {
    // This is why the fix is "clear the flag" and not "read seenAt === now":
    // `seenAt` is refreshed by every sensor, so that predicate would have let
    // the broadside spend its reload on a same-tick blip.
    const m = mind();
    foldView(m, view({ events: [returnBlip(10, 20, 900)] }), 1000);
    expect(onlyTrack(m).live).toBe(false);
    foldView(m, view({ events: [returnBlip(11, 20, 1400)] }), 1500);
    expect(onlyTrack(m).live).toBe(false);
    expect(onlyTrack(m).seenAt).toBe(1500);
    foldView(m, view({ events: [{ k: 'hc', id: 'me', x: 12 * CELL, y: 21 * CELL }] }), 2000);
    expect(onlyTrack(m).live).toBe(false);
    expect(onlyTrack(m).seenAt).toBe(2000);
  });

  it('a re-sighting raises it again — one tick out of the bubble is not amnesia', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 120, 0)] }), 1000);
    foldView(m, view(), 1050);
    foldView(m, view({ contacts: [contact('e1', 130, 0)] }), 1100);
    expect(onlyTrack(m).live).toBe(true);
  });

  it('so freshness DECAYS a lost plot — the flag used to pin its score at a flat 1.0', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 300, 0)] }), 1000);
    const fresh = scoreTrack(onlyTrack(m), situation({ now: 1000 }), tracksOf(m));
    foldView(m, view(), 5000); // four seconds with nothing sighted
    const stale = scoreTrack(onlyTrack(m), situation({ now: 5000 }), tracksOf(m));
    expect(stale).toBeLessThan(fresh);
  });
});

// --- a blocked line of fire has a consequence --------------------------------

describe('ai/utility — LAND IN THE WAY is scored and postured on', () => {
  /** A hand-built plot (these cases are about geometry, not about the fold). */
  function plotTrack(over: Partial<BotTrack> = {}): BotTrack {
    return {
      id: 't',
      x: 0,
      y: 0,
      heading: 0,
      speed: 0,
      seenAt: 10000,
      live: true,
      cls: 'battleship' as HullId,
      fleet: false,
      firstSeenAt: 0,
      hits: 0,
      ...over,
    };
  }

  const ROCK = circleIsland(200, 0, 60);

  it('de-scores a track with a coastline in the way', () => {
    const t = plotTrack({ x: 400, y: 0 });
    const open = scoreTrack(t, situation(), [t]);
    const behind = scoreTrack(t, situation({ islands: [ROCK] }), [t]);
    expect(behind).toBeGreaterThan(0); // a PENALTY, never a veto
    expect(behind).toBeLessThan(open);
  });

  it('a clear-line target takes the slot from a blocked one — including a forager\'s fleet prize', () => {
    // The measured worst case: `forager` weights fleet 2.0 against captain
    // 0.5, which is what parked a Mine Layer on a drone group behind a rock.
    const m = mind('forager');
    m.contacts.set('behindRock', plotTrack({ id: 'behindRock', x: 400, y: 0, fleet: true, cls: 'droneSmall' as HullId }));
    m.contacts.set('openWater', plotTrack({ id: 'openWater', x: 0, y: 400 }));
    const sit = situation({ profile: profileOf('forager'), stats: stats('mineLayer'), islands: [ROCK] });
    expect(selectTarget(m, sit)?.id).toBe('openWater');
    // With the rock gone the fleet weight wins, exactly as it always did.
    expect(selectTarget(m, situation({ profile: profileOf('forager'), stats: stats('mineLayer') }))?.id).toBe('behindRock');
  });

  it('forces PURSUE over the band postures, so the bot opens the angle', () => {
    const band = engagementBand(profileOf('duelist'), stats('torpedoBoat'));
    const t = plotTrack({ x: Math.min(400, band.max * 0.5), y: 0 });
    const sit = () => situation({ profile: profileOf('duelist'), stats: stats('torpedoBoat') });
    expect(choosePosture(sit(), t)).toBe('engage'); // in-band, clear water
    expect(choosePosture({ ...sit(), islands: [circleIsland(t.x * 0.5, 0, 40)] }, t)).toBe('pursue');
  });

  it('does not outrank the storm or a broken hull — the priority order is unchanged', () => {
    const t = plotTrack({ x: 400, y: 0 });
    const blocked = situation({ islands: [ROCK] });
    expect(choosePosture({ ...blocked, ring: { cx: 5000, cy: 0, r: 100 } }, t)).toBe('ringRun');
    expect(choosePosture({ ...blocked, hp: 1, maxHp: 100 }, t)).toBe('disengage');
  });
});

// --- the bot's own gunnery feedback -----------------------------------------

describe('ai/utility — self-private Hit Calls (hc)', () => {
  it('a Hit Call reinforces the track it landed on (and refreshes it)', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 200, 0)] }), 1000);
    foldView(m, view({ events: [{ k: 'hc', id: 'me', x: 205, y: 3 }] }), 1500);
    const t = onlyTrack(m);
    expect(t.hits).toBe(1);
    expect(t.seenAt).toBe(1500);
  });

  it('a splash (sp) is deliberately IGNORED — the dead feedback channel was deleted', () => {
    // The review gate removed wave 2's unconsumed `splash` return (no tactics
    // ever read it; bracket-and-walk fire is LEDGERED in deferred-work.md,
    // not built). A splash event must fold nothing and disclose nothing.
    const m = mind();
    foldView(m, view({ events: [{ k: 'sp', id: 'me', x: 400, y: -20 }] }), 1000);
    expect(tracksOf(m).length).toBe(0); // a MISS discloses nothing about anyone
  });

  it('hits raise a track\'s score — a hurt target is a better target', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 200, 0)] }), 1000);
    const sit = situation({ now: 2000, profile: profileOf('raider'), stats: stats('torpedoBoat') });
    const before = scoreTrack(onlyTrack(m), sit, tracksOf(m));
    foldView(m, view({ events: [{ k: 'hc', id: 'me', x: 200, y: 0 }] }), 1500);
    const after = scoreTrack(onlyTrack(m), sit, tracksOf(m));
    expect(after).toBeGreaterThan(before);
  });
});

// --- the reaction gate ------------------------------------------------------

describe('ai/utility — the reaction delay (E2 competence knob)', () => {
  it('a freshly acquired track is not actionable until reactionMs has passed', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 150, 0)] }), 1000);
    const t = onlyTrack(m);
    expect(isActionable(t, 1000 + CONFIG.bots.reactionMs - 1)).toBe(false);
    expect(isActionable(t, 1000 + CONFIG.bots.reactionMs)).toBe(true);
  });

  it('selectTarget refuses a target inside the delay and takes it after', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 150, 0)] }), 1000);
    expect(selectTarget(m, situation({ now: 1000 + CONFIG.bots.reactionMs - 1 }))).toBeNull();
    const picked = selectTarget(m, situation({ now: 1000 + CONFIG.bots.reactionMs }));
    expect(picked?.id).toBe('e1');
  });

  it('the delay is measured from FIRST acquisition, not from the last refresh', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 150, 0)] }), 1000);
    foldView(m, view({ contacts: [contact('e1', 160, 0)] }), 1000 + CONFIG.bots.reactionMs);
    expect(selectTarget(m, situation({ now: 1000 + CONFIG.bots.reactionMs }))?.id).toBe('e1');
  });
});

// --- target selection -------------------------------------------------------

describe('ai/utility — profile-weighted target selection', () => {
  const NOW = 20000;

  function twoTargets(m: BotMind): void {
    foldView(m, view({ contacts: [contact('cap', 200, 0, 'battleship'), contact('fleet', 210, 0, 'droneSmall')] }), 1000);
  }

  it('forager prefers the fleet hull; duelist prefers the captain', () => {
    const mf = mind('forager');
    twoTargets(mf);
    expect(selectTarget(mf, situation({ now: NOW, profile: profileOf('forager'), stats: stats('mineLayer') }))?.id).toBe('fleet');

    const md = mind('duelist');
    twoTargets(md);
    expect(selectTarget(md, situation({ now: NOW, profile: profileOf('duelist'), stats: stats('torpedoBoat') }))?.id).toBe('cap');
  });

  it('a human is a contact like any other (ruling B3) — only KIND is weighed', () => {
    // Two participant contacts, identical but for id: nothing in the score
    // can separate them, because nothing on the wire separates a human
    // captain from another bot.
    const m = mind('duelist');
    foldView(m, view({ contacts: [contact('human', 200, 0), contact('bot-3', -200, 0)] }), 1000);
    const sit = situation({ now: NOW, profile: profileOf('duelist'), stats: stats('torpedoBoat') });
    const all = tracksOf(m);
    expect(scoreTrack(all[0], sit, all)).toBeCloseTo(scoreTrack(all[1], sit, all), 9);
  });

  it('an isolated target outscores one with company, for a raider', () => {
    const m = mind('raider');
    foldView(m, view({ contacts: [contact('lone', 250, 0), contact('pair', -250, 0), contact('escort', -260, 10)] }), 1000);
    const sit = situation({ now: NOW, profile: profileOf('raider'), stats: stats('torpedoBoat') });
    expect(selectTarget(m, sit)?.id).toBe('lone');
  });

  it('a stale plot is worth less than a live one at the same range', () => {
    const m = mind();
    foldView(m, view({ events: [returnBlip(-34, -1, 12000)] }), 12000); // anon paint near (-300, 0)
    foldView(m, view({ contacts: [contact('live', 300, 0)] }), 19000);
    const sit = situation({ now: NOW });
    const all = tracksOf(m);
    const live = all.find((t) => t.id === 'live');
    const stale = all.find((t) => t.id === null);
    expect(scoreTrack(live!, sit, all)).toBeGreaterThan(scoreTrack(stale!, sit, all));
  });
});

// --- posture ----------------------------------------------------------------

describe('ai/utility — posture, and the dominance of ring escape', () => {
  const NOW = 20000;

  function target(m: BotMind, x: number): BotTrack {
    foldView(m, view({ contacts: [contact('e1', x, 0)] }), 1000);
    return onlyTrack(m);
  }

  it('OUTSIDE THE LIVE RING, nothing else matters — not hp, not a target', () => {
    const m = mind('bulwark');
    const t = target(m, 40); // point-blank, fully actionable
    const ring: ZoneRing = { cx: 0, cy: 0, r: 500 };
    const sit = situation({ now: NOW, profile: profileOf('bulwark'), ring, x: 900, y: 0, hp: 5 });
    expect(choosePosture(sit, t)).toBe('ringRun');
  });

  it('inside the ring, low hp disengages at the PROFILE\'s fraction', () => {
    const m = mind('bulwark');
    const t = target(m, 100);
    const bulwark = profileOf('bulwark');
    const raider = profileOf('raider');
    const hp = (bulwark.disengageHpFrac + raider.disengageHpFrac) / 2; // between the two
    expect(choosePosture(situation({ now: NOW, profile: bulwark, hp: hp * 100 }), t)).not.toBe('disengage');
    expect(choosePosture(situation({ now: NOW, profile: raider, hp: hp * 100 }), t)).toBe('disengage');
  });

  it('no target = reposition; in band = engage; beyond band = pursue', () => {
    const duelist = profileOf('duelist');
    const st = stats('torpedoBoat');
    const band = engagementBand(duelist, st);
    expect(choosePosture(situation({ now: NOW, profile: duelist, stats: st }), null)).toBe('reposition');

    const near = mind('duelist');
    expect(choosePosture(situation({ now: NOW, profile: duelist, stats: st }), target(near, band.max - 10))).toBe('engage');

    const far = mind('duelist');
    expect(choosePosture(situation({ now: NOW, profile: duelist, stats: st }), target(far, band.max + 200))).toBe('pursue');
  });

  /**
   * THE DEADBAND — the posture half of the storm-chatter fix.
   *
   * The two ring tests either side of this one place the hull 400u outside a
   * 500u ring and 900u outside it: correct, kept, and blind to the defect,
   * which lives entirely in the last metre. `isOutside` is boundary-inclusive
   * with no hysteresis at all, so escape released at exactly `dist == r` and
   * whatever was pushing the hull outward resumed on the next deliberation.
   */
  it('RING ESCAPE RELEASES A DEADBAND INSIDE THE RIM, not on the boundary', () => {
    const m = mind('bulwark');
    const t = target(m, 40);
    const ring: ZoneRing = { cx: 0, cy: 0, r: 500 };
    const st = stats('battleship');
    const margin = ringDeadband(st, 0);
    const at = (x: number, prev: BotPosture): BotPosture =>
      choosePosture(situation({ now: NOW, profile: profileOf('bulwark'), stats: st, ring, x, y: 0 }), t, prev);

    // A hull ALREADY RUNNING stays running across the rim and through the
    // deadband, and is released one unit past it.
    expect(at(500, 'ringRun')).toBe('ringRun');
    expect(at(500 - margin + 1, 'ringRun')).toBe('ringRun');
    expect(at(500 - margin - 1, 'ringRun')).not.toBe('ringRun');

    // THE ARM THRESHOLD DOES NOT MOVE — it is still `isOutside`, exactly. A
    // hull that was not running only starts when it is genuinely wet, so the
    // deadband can never keep a healthy bot off the water it is entitled to.
    expect(at(500, 'engage')).not.toBe('ringRun');
    expect(at(500.5, 'engage')).toBe('ringRun');
  });

  it('the deadband is the HULL\'s own full-ahead turn radius — per class, off EffectiveStats', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const k = CONFIG.shipClasses[cls].kinematics;
      expect(ringDeadband(stats(cls), 0)).toBeCloseTo(k.maxSpeed / k.turnRate, 6);
    }
    // The ordering is the whole point: the hull that takes longest to turn
    // around gets the most water to do it in.
    expect(ringDeadband(stats('battleship'), 0)).toBeGreaterThan(ringDeadband(stats('mineLayer'), 0));
    expect(ringDeadband(stats('mineLayer'), 0)).toBeGreaterThan(ringDeadband(stats('torpedoBoat'), 0));
    // NEVER a fraction of ring radius: that would be widest on the opening
    // 2800u ring and tightest on the 660u endgame ring, i.e. backwards.
    expect(ringDeadband(stats('battleship'), 0)).toBeLessThan(CONFIG.vision.radar);
  });

  /**
   * THE SPEED BOOST IS NOT IN `EffectiveStats` — `World.stepShips` raises the
   * per-tick cap outside the stat block — so BOTH ring lengths have to read
   * the hull's live speed or they size a boosted hull as if it still turned
   * like a rated one. The lookahead was made boost-aware when the measurement
   * named boosted raiders as 15 of 19 residual crossings; the deadband was
   * missed, and the cross-model review caught it. This pins the pair.
   */
  it('BOTH RING LENGTHS ARE BOOST-AWARE, and rated speed is a FLOOR', () => {
    const st = stats('torpedoBoat');
    const rated = st.kinematics.maxSpeed;
    const boosted = rated * 1.3; // roughly what a `raider` makes under boost

    // Rated is a floor: a loafing hull keeps its rated turn radius, because it
    // can still accelerate out of the trouble the deadband is guarding against.
    expect(ringDeadband(st, 0)).toBe(ringDeadband(st, rated));
    expect(ringDeadband(st, 5)).toBe(ringDeadband(st, rated));
    expect(ringDeadband(st, -rated * 2)).toBeCloseTo((rated * 2) / st.kinematics.turnRate, 6); // magnitude, not sign

    // Above rated it grows exactly in proportion — a hull making 30% more way
    // turns through a 30% wider circle.
    expect(ringDeadband(st, boosted)).toBeCloseTo(boosted / st.kinematics.turnRate, 6);
    expect(ringDeadband(st, boosted)).toBeGreaterThan(ringDeadband(st, rated));

    // AND THE RELEASE THRESHOLD MOVES WITH IT. A boosted hull sitting between
    // the rated deadband and its own is still escaping; the same hull at rated
    // speed at the same point has been released. That divergence is the bug.
    const ring: ZoneRing = { cx: 0, cy: 0, r: 1000 };
    const x = 1000 - (rated / st.kinematics.turnRate) - 1; // one unit past the RATED band
    const m = mind('raider');
    const t = target(m, 40);
    const at = (speed: number): BotPosture =>
      choosePosture(
        situation({ now: NOW, profile: profileOf('raider'), stats: st, ring, x, y: 0, speed }),
        t,
        'ringRun',
      );
    expect(at(rated)).not.toBe('ringRun');
    expect(at(boosted)).toBe('ringRun');
  });

  it('a COLLAPSED ring (sudden death, r <= 0) is outside for everyone, latched or not', () => {
    const m = mind('bulwark');
    const t = target(m, 40);
    const dead: ZoneRing = { cx: 0, cy: 0, r: 0 };
    const sit = situation({ now: NOW, profile: profileOf('bulwark'), ring: dead, x: 0, y: 0 });
    expect(choosePosture(sit, t, 'engage')).toBe('ringRun');
    expect(choosePosture(sit, t, 'ringRun')).toBe('ringRun');
  });

  it('forager on a fleet hull farms; duelist on the same hull does not', () => {
    const m = mind('forager');
    foldView(m, view({ contacts: [contact('d1', 100, 0, 'droneSmall')] }), 1000);
    const t = onlyTrack(m);
    expect(choosePosture(situation({ now: NOW, profile: profileOf('forager'), stats: stats('mineLayer') }), t)).toBe('farm');
    expect(choosePosture(situation({ now: NOW, profile: profileOf('duelist'), stats: stats('torpedoBoat') }), t)).not.toBe('farm');
  });
});

// --- spending ---------------------------------------------------------------

/** A bare spend state: one level banked, healthy, nothing fitted, every slot
 *  empty and the cannon mounted (the defaults `BotSpendState` documents). */
function spendState(over: Partial<BotSpendState> = {}): BotSpendState {
  return { bankedLevels: 1, offer: null, cards: [], hp: 100, maxHp: 100, ...over };
}

/** Nine slot ids: the given gun, the boost, then Q/E/R and the belt as named
 *  (missing entries are empty). */
function slotsOf(
  weapons: readonly (SlotItemId | null)[] = [],
  belt: readonly (SlotItemId | null)[] = [],
  gun: EquipmentId = 'gun',
): (SlotItemId | null)[] {
  const out: (SlotItemId | null)[] = [gun, 'boost'];
  for (let i = 0; i < WEAPON_SLOTS.length; i += 1) out.push(weapons[i] ?? null);
  for (let i = 0; i < CONSUMABLE_SLOTS.length; i += 1) out.push(belt[i] ?? null);
  return out;
}

/** An rng that COUNTS every call made on it, whatever the method. */
function countingRng(seed: number): { rng: Rng; calls: () => number } {
  const inner = mulberry32(seed);
  let n = 0;
  const rng: Rng = {
    next: () => { n += 1; return inner.next(); },
    float: (a, b) => { n += 1; return inner.float(a, b); },
    int: (a, b) => { n += 1; return inner.int(a, b); },
    pick: (arr) => { n += 1; return inner.pick(arr); },
  };
  return { rng, calls: () => n };
}

const P = CONFIG.bots.cardPoints;
const SHIP_LADDERS = ['armor', 'speed', 'turning', 'radarSweep', 'reload'] as const;
/** Every equipment line (copy 1 = a new weapon), read off the catalog. */
const EQUIPMENT_LINES = Object.keys(CATALOG).filter((k) => CATALOG[k].kind === 'equipment' && CATALOG[k].stub !== true);

describe('ai/spending — the card policy', () => {
  it('returns null with nothing banked, and null with a healthy hull + no offer', () => {
    expect(chooseSpend(profileOf('raider'), spendState({ bankedLevels: 0, offer: ['deckGun'] }))).toBeNull();
    expect(chooseSpend(profileOf('raider'), spendState())).toBeNull();
  });

  // THE HEAL LEFT THE SPEND POLICY (Story 8.8, epic-8 amendments 46 + 49).
  // `healHpFrac` gates FIRING a stocked HULL REPAIR from the belt, not buying
  // one with a level, and the policy NEVER returns a negative — which matters
  // because World.spendPoint refuses every negative as malformed. (Hurt DOES
  // raise the HULL REPAIR card's score since Story 8.20 — pinned below.)
  it('a hurt hull still picks a card off an ordinary hand — and never returns a negative', () => {
    const raider = profileOf('raider');
    const hurt = raider.healHpFrac * 100 - 1;
    expect(chooseSpend(raider, spendState({ hp: hurt, offer: null }))).toBeNull();
    expect(chooseSpend(raider, spendState({ hp: hurt, offer: ['heavyTorpedo'] }))).toBe(0);
    expect(chooseSpend(raider, spendState({ hp: 100, offer: ['heavyTorpedo'] }))).toBe(0);
    expect(chooseSpend(raider, spendState({ hp: raider.healHpFrac * 100, offer: ['deckGun'] }))).toBe(0);
  });

  // ...AND THE MULLIGAN NEVER REACHES THE BOTS (Story 8.10, amendment 60).
  // MULLIGAN_CHOICE (-2) is a HUMAN captain's button: World.mulligan refuses
  // any other role outright. This pin is the other half: the policy cannot
  // even ask.
  it('no profile, at any hp, on any hand or seed, ever returns a negative choice', () => {
    const hands = [
      ['deckGun', 'armor'],
      ['hullRepair', 'reload', 'speed', 'armor'],
      ['heavyTorpedo', 'navalMines', 'broadside', 'starShells'],
      ['armor'],
    ];
    for (const row of [...Object.values(BOT_PROFILES), ...Object.values(TEST_PROFILES)]) {
      const id = row.id;
      for (const hp of [1, 10, 50, 99, 100]) {
        for (const [h, offer] of hands.entries()) {
          for (let seed = 1; seed <= 8; seed += 1) {
            const where = `${id}@${hp}/hand${h}/seed${seed}`;
            const got = chooseSpend(row, spendState({ hp, offer }), undefined, mulberry32(seed));
            expect(got, where).not.toBeNull();
            expect(got!, where).toBeGreaterThanOrEqual(0);
            expect(got!, where).not.toBe(MULLIGAN_CHOICE);
            expect(got!, where).toBeLessThan(offer.length); // ...and always a real index
          }
        }
      }
    }
  });

  it('an all-junk hand is still SPENT — a banked level held forever is wasted', () => {
    const idx = chooseSpend(profileOf('siege'), spendState({ offer: ['turning', 'radarSweep'] }));
    expect(idx).not.toBeNull();
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  // --- THE REFUSED CARD (Story 8.14 review, F4) -----------------------------
  // `World.spendCard` refuses a card this hull cannot take, and the offer does
  // NOT reroll on a refusal. A scorer that keeps naming the refused card spends
  // the same banked level into a no-op every tick, forever — so the scorer runs
  // the same `pickRefusal` the server does and never scores what it refuses.

  it('SKIPS an at-cap line and takes a card it can actually hold', () => {
    const five = new Array<string>(CATALOG.hullRepair.cap).fill('hullRepair');
    const offer = ['hullRepair', 'armor', 'speed', 'reload'];
    const idx = chooseSpend(profileOf('siege'), spendState({ cards: five, offer }));
    expect(idx).not.toBeNull();
    expect(offer[idx!]).not.toBe('hullRepair');
    expect(cardScore(profileOf('siege'), spendState({ cards: five }), 'hullRepair')).toBeNull();
  });

  it('SKIPS copy 1 of a weapon with Q/E/R full, and a consumable with a full belt', () => {
    const rowFull = ['gun', 'boost', 'lightTorpedo', 'heavyTorpedo', 'navalMines', null, null, null, null] as const;
    const idx = chooseSpend(profileOf('siege'), spendState({ slotIds: rowFull, offer: ['broadside', 'armor'] }));
    expect(idx).toBe(1); // `broadside` is copy 1 with nowhere to go
    const beltFull = ['gun', 'boost', null, null, null, 'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff'] as const;
    expect(chooseSpend(profileOf('siege'), spendState({ slotIds: beltFull, offer: ['supercavTorpedo', 'armor'] })))
      .toBe(1);
  });

  it('DOES NOT SPEND when every card in the hand is refused — the level stays banked (matrix: Dead hand)', () => {
    const five = new Array<string>(CATALOG.hullRepair.cap).fill('hullRepair');
    const capped = [...five, ...new Array<string>(CATALOG.armor.cap).fill('armor')];
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      const { rng, calls } = countingRng(5);
      expect(chooseSpend(profileOf(id), spendState({ cards: capped, offer: ['hullRepair', 'armor'] }), undefined, rng), id)
        .toBeNull();
      expect(calls(), id).toBe(0);
    }
    // ...and a RANDOM profile holds it too, rather than rolling a dead index.
    expect(chooseSpend(profileOf('randomMineLayer'), spendState({ cards: capped, offer: ['hullRepair', 'armor'] }),
      undefined, mulberry32(3))).toBeNull();
  });

  it('an unknown id or a stub is never scored and never wins, and cannot crash the policy', () => {
    const siege = profileOf('siege');
    expect(cardScore(siege, spendState(), 'noSuchLine')).toBeNull();
    expect(cardScore(siege, spendState(), 'depthCharge')).toBeNull(); // the one stub consumable
    expect(cardScore(siege, spendState(), '__proto__')).toBeNull();
    expect(chooseSpend(siege, spendState({ offer: ['noSuchLine', 'depthCharge', 'armor'] }))).toBe(2);
    expect(chooseSpend(siege, spendState({ offer: ['noSuchLine'] }))).toBeNull();
  });
});

// --- THE POINTS SCORER (Story 8.20, Eric ruling 2026-09-30, R3/R4) ------------
// Every scorer row of the spec's I/O matrix, with its exact arithmetic read
// through `cardScore` and its outcome through `chooseSpend`.

describe('ai/spending — the points scorer (Story 8.20 matrix)', () => {
  it('Eric\'s example: raider, heavy torpedo at 4 (its highest), slots full → torpedo 4 beats smoke 3', () => {
    const raider = profileOf('raider');
    const s = spendState({
      cards: ['heavyTorpedo', 'heavyTorpedo', 'heavyTorpedo', 'heavyTorpedo', 'lightTorpedo', 'navalMines'],
      slotIds: slotsOf(['heavyTorpedo', 'lightTorpedo', 'navalMines']),
    });
    expect(cardScore(raider, s, 'heavyTorpedo')).toBe(P.base + P.favorite + P.style);
    expect(cardScore(raider, s, 'heavyTorpedo')).toBe(4);
    expect(cardScore(raider, s, 'smokeScreen')).toBe(P.base + P.favorite + P.beltHunger.medium);
    expect(cardScore(raider, s, 'smokeScreen')).toBe(3);
    expect(chooseSpend(raider, { ...s, offer: ['smokeScreen', 'heavyTorpedo'] })).toBe(1);
  });

  it('Weapon vs plain upgrade: every personality takes a non-favorite weapon (3.5) over a no-bonus ladder (2)', () => {
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      const row = profileOf(id);
      const favUps: readonly string[] = row.taste.favoriteUpgrades;
      const [plain, other] = SHIP_LADDERS.filter((l) => !favUps.includes(l));
      const weapon = EQUIPMENT_LINES.find((l) => !(row.taste.favoriteWeapons as readonly string[]).includes(l))!;
      // `plain` at 1 copy, `other` at 2, the rest at 0: neither min nor max of U.
      const s = spendState({ cards: [plain, other, other] });
      expect(cardScore(row, s, weapon), id).toBe(P.weapon);
      expect(cardScore(row, s, plain), id).toBe(P.base);
      expect(chooseSpend(row, { ...s, offer: [plain, weapon] }), id).toBe(1);
    }
  });

  it('Two-bonus upgrade vs favorite weapon: siege radarSweep at max(U) 4 beats starShells 3.75', () => {
    const siege = profileOf('siege');
    const s = spendState({ cards: ['radarSweep'] });
    expect(cardScore(siege, s, 'starShells')).toBe(P.favoriteWeapon);
    expect(cardScore(siege, s, 'radarSweep')).toBe(P.base + P.favorite + P.style);
    expect(cardScore(siege, s, 'radarSweep')).toBe(4);
    expect(chooseSpend(siege, { ...s, offer: ['starShells', 'radarSweep'] })).toBe(1);
  });

  it('Favorite among weapons: trapper takes navalMines (3.75) over broadside (3.5)', () => {
    const trapper = profileOf('trapper');
    expect(cardScore(trapper, spendState(), 'navalMines')).toBe(P.favoriteWeapon);
    expect(cardScore(trapper, spendState(), 'broadside')).toBe(P.weapon);
    expect(chooseSpend(trapper, spendState({ offer: ['broadside', 'navalMines'] }))).toBe(1);
  });

  it('Needed heal: siege at 30% hp, none carried → hullRepair 4 beats a favorite weapon 3.75 (hunger NOT applied)', () => {
    const siege = profileOf('siege');
    const hurt = spendState({ hp: 30 });
    expect(30 / 100).toBeLessThan(siege.healHpFrac);
    expect(cardScore(siege, hurt, 'hullRepair')).toBe(P.base + P.hurtRepair);
    expect(cardScore(siege, hurt, 'hullRepair')).toBe(4);
    expect(chooseSpend(siege, { ...hurt, offer: ['starShells', 'hullRepair'] })).toBe(1);
    // The same bot healthy reads its LOW belt hunger instead: 2 − 1 = 1.
    expect(cardScore(siege, spendState(), 'hullRepair')).toBe(P.base + P.beltHunger.low);
    // HURT counts the repair still draining in — the heal tactic's own read.
    expect(cardScore(siege, spendState({ hp: 30, repairHp: 30 }), 'hullRepair')).toBe(P.base + P.beltHunger.low);
    // A zero maxHp is never "hurt" (no divide-by-zero verdict).
    expect(cardScore(siege, spendState({ hp: 0, maxHp: 0 }), 'hullRepair')).toBe(P.base + P.beltHunger.low);
  });

  it('a HURT bot already carrying HULL REPAIR scores it as carried, favorite still counted', () => {
    const bulwark = profileOf('bulwark'); // hullRepair IS a bulwark favorite
    const carrying = spendState({ hp: 10, cards: ['hullRepair'], slotIds: slotsOf([], ['hullRepair']) });
    expect(cardScore(bulwark, carrying, 'hullRepair')).toBe(P.base + P.favorite + P.carried);
    // ...and hurt with none carried: base + hurtRepair + favorite, never below 4.
    expect(cardScore(bulwark, spendState({ hp: 10 }), 'hullRepair')).toBe(P.base + P.hurtRepair + P.favorite);
  });

  it('Healthy, low hunger: duelist takes a plain ladder (2) over an uncarried HULL REPAIR (1)', () => {
    const duelist = profileOf('duelist');
    const s = spendState({ cards: ['speed'] }); // armor below max(U): no specialist bonus
    expect(cardScore(duelist, s, 'hullRepair')).toBe(P.base + P.beltHunger.low);
    expect(cardScore(duelist, s, 'hullRepair')).toBe(1);
    expect(cardScore(duelist, s, 'armor')).toBe(P.base);
    expect(chooseSpend(duelist, { ...s, offer: ['hullRepair', 'armor'] })).toBe(1);
  });

  it('Already carried: bulwark carrying shieldBlock takes chaff 3 over shieldBlock 2', () => {
    const bulwark = profileOf('bulwark');
    const s = spendState({ cards: ['shieldBlock'], slotIds: slotsOf([], ['shieldBlock']) });
    expect(cardScore(bulwark, s, 'shieldBlock')).toBe(P.base + P.favorite + P.carried);
    expect(cardScore(bulwark, s, 'shieldBlock')).toBe(2);
    expect(cardScore(bulwark, s, 'chaff')).toBe(P.base + P.beltHunger.high);
    expect(cardScore(bulwark, s, 'chaff')).toBe(3);
    expect(chooseSpend(bulwark, { ...s, offer: ['shieldBlock', 'chaff'] })).toBe(1);
  });

  it('Style rounded: bulwark armor 3, speed 0 → speed 3 (min of U) ties armor 3 (favorite)', () => {
    const bulwark = profileOf('bulwark');
    const s = spendState({ cards: ['armor', 'armor', 'armor'] });
    expect(cardScore(bulwark, s, 'speed')).toBe(P.base + P.style);
    expect(cardScore(bulwark, s, 'armor')).toBe(P.base + P.favorite);
    expect(cardScore(bulwark, s, 'speed')).toBe(cardScore(bulwark, s, 'armor'));
  });

  it('Tie, no rng: the lowest offer index wins', () => {
    const bulwark = profileOf('bulwark');
    const s = spendState({ cards: ['armor', 'armor', 'armor'] });
    expect(chooseSpend(bulwark, { ...s, offer: ['armor', 'speed'] })).toBe(0);
    expect(chooseSpend(bulwark, { ...s, offer: ['speed', 'armor'] })).toBe(0);
    // A lower-scoring card ahead of the tie does not shift the answer.
    const withReload = spendState({ cards: ['armor', 'armor', 'armor', 'reload'] }); // reload 1 copy: plain 2
    expect(chooseSpend(bulwark, { ...withReload, offer: ['reload', 'speed', 'armor'] })).toBe(1);
  });

  it('Tie, rng: exactly ONE draw, a tied index, and both tied indices occur over seeds', () => {
    const bulwark = profileOf('bulwark');
    // armor 3 (favorite) and speed 3 (min of U) tie; reload at 1 copy is plain 2.
    const two = spendState({ cards: ['armor', 'armor', 'armor', 'reload'], offer: ['reload', 'armor', 'speed'] });
    expect(two.offer!.map((id) => cardScore(bulwark, two, id))).toEqual([P.base, P.base + P.favorite, P.base + P.style]);
    const tied = [1, 2];
    const seen = new Set<number>();
    for (let seed = 1; seed <= 64; seed += 1) {
      const { rng, calls } = countingRng(seed);
      const got = chooseSpend(bulwark, two, undefined, rng);
      expect(calls(), `seed ${seed}`).toBe(1);
      expect(tied, `seed ${seed}`).toContain(got);
      // ...and it is the uniform pick a replay of the same seed predicts.
      expect(got).toBe(tied[mulberry32(seed).int(0, tied.length - 1)]);
      seen.add(got!);
    }
    expect([...seen].sort()).toEqual(tied);
  });

  it('Tie, rng: a NON-tied hand consumes no draw', () => {
    const trapper = profileOf('trapper');
    const { rng, calls } = countingRng(9);
    expect(chooseSpend(trapper, spendState({ offer: ['broadside', 'navalMines', 'armor'] }), undefined, rng)).toBe(1);
    expect(calls()).toBe(0);
  });

  it('Style specialist: the build\'s HIGHEST line earns the bonus; a line at cap leaves U', () => {
    const raider = profileOf('raider');
    // speed at 2 is max(U): +favorite +style; armor at 0 is not.
    const s = spendState({ cards: ['speed', 'speed'] });
    expect(cardScore(raider, s, 'speed')).toBe(P.base + P.favorite + P.style);
    expect(cardScore(raider, s, 'armor')).toBe(P.base);
    // speed at CAP leaves U (and is refused); armor at 1 is now the max.
    const capped = spendState({ cards: [...new Array<string>(CATALOG.speed.cap).fill('speed'), 'armor'] });
    expect(cardScore(raider, capped, 'speed')).toBeNull();
    expect(cardScore(raider, capped, 'armor')).toBe(P.base + P.style);
  });

  it('an empty build is FLAT (min = max of U), so no ladder earns either style\'s bonus (R11)', () => {
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      const row = profileOf(id);
      const favUps: readonly string[] = row.taste.favoriteUpgrades;
      for (const l of SHIP_LADDERS) {
        expect(cardScore(row, spendState(), l), `${id} ${l}`).toBe(P.base + (favUps.includes(l) ? P.favorite : 0));
      }
    }
  });

  it('Flat build (R11): bulwark at level 0 → armor 2+1 = 3 (no style bonus), a non-favorite weapon 3.5 wins', () => {
    const bulwark = profileOf('bulwark'); // rounded; favorite upgrade armor; favorite weapons broadside + starShells
    const s = spendState();
    expect(cardScore(bulwark, s, 'armor')).toBe(P.base + P.favorite);
    expect(cardScore(bulwark, s, 'armor')).toBe(3);
    expect(cardScore(bulwark, s, 'lightTorpedo')).toBe(P.weapon);
    expect(cardScore(bulwark, s, 'lightTorpedo')).toBe(3.5);
    expect(chooseSpend(bulwark, { ...s, offer: ['armor', 'lightTorpedo'] })).toBe(1);
  });

  it('Uneven build: bulwark holding one weapon, ladders at 0 → both at min(U) = 0: armor 4, speed 3', () => {
    const bulwark = profileOf('bulwark');
    const s = spendState({ cards: ['lightTorpedo'], slotIds: slotsOf(['lightTorpedo']) });
    expect(cardScore(bulwark, s, 'armor')).toBe(P.base + P.favorite + P.style);
    expect(cardScore(bulwark, s, 'armor')).toBe(4);
    expect(cardScore(bulwark, s, 'speed')).toBe(P.base + P.style);
    expect(cardScore(bulwark, s, 'speed')).toBe(3);
    expect(chooseSpend(bulwark, { ...s, offer: ['speed', 'armor'] })).toBe(1);
  });

  it('"gun" favors EVERY ladder of the mounted gun, and style reads only the MOUNTED gun\'s ladders', () => {
    const forager = profileOf('forager'); // rounded; favorites gun + reload
    const s = spendState({ cards: ['armor'] });
    // The cannon mounted: its one ladder (turret + barrel are its rungs) is a favorite and sit at min(U) = 0.
    for (const l of ['deckGun']) {
      expect(cardScore(forager, s, l), l).toBe(P.base + P.favorite + P.style);
    }
    // The machine gun mounted: its ladder is the gun favorite and in U...
    const mg = { ...s, slotIds: slotsOf([], [], 'machineGun') };
    expect(cardScore(forager, mg, 'machineGun')).toBe(P.base + P.favorite + P.style);
    // ...and the cannon's ladders leave U (still `gun` family — never dealt here).
    expect(cardScore(forager, mg, 'deckGun')).toBe(P.base + P.favorite);
    // A personality without the gun favorite reads a gun ladder as plain + style.
    expect(cardScore(profileOf('raider'), spendState({ cards: ['speed'] }), 'deckGun')).toBe(P.base);
  });

  it('"weapons" favors a tier copy of a HELD weapon; copy 1 is a weapon card, not an upgrade', () => {
    const siege = profileOf('siege'); // favorites weapons + radarSweep; specialist
    const s = spendState({ cards: ['navalMines', 'navalMines'], slotIds: slotsOf(['navalMines']) });
    expect(cardScore(siege, s, 'navalMines')).toBe(P.base + P.favorite + P.style); // 2 copies = max(U)
    expect(cardScore(siege, s, 'broadside')).toBe(P.favoriteWeapon); // unheld: a weapon for an empty slot
    expect(cardScore(profileOf('duelist'), s, 'navalMines')).toBe(P.base + P.style); // no `weapons` favorite
  });

  it('every personality ranks every new weapon above any one-bonus upgrade or consumable', () => {
    const oneBonusCeiling = P.base + P.favorite; // === base + style === base + beltHunger.high
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      for (const w of EQUIPMENT_LINES) {
        expect(cardScore(profileOf(id), spendState(), w)!, `${id} ${w}`).toBeGreaterThan(oneBonusCeiling);
      }
    }
  });

  it('a bot SETTLES: its favorite weapon absent, it takes the best card present', () => {
    const trapper = profileOf('trapper'); // favorite weapons: the three mine racks
    expect(chooseSpend(trapper, spendState({ offer: ['hullRepair', 'broadside', 'armor'] }))).toBe(1);
  });

  it('cardScore is pure: no rng, and the same answer twice', () => {
    const s = spendState({ cards: ['armor'] });
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      for (const l of Object.keys(CATALOG)) {
        expect(cardScore(profileOf(id), s, l)).toBe(cardScore(profileOf(id), s, l));
      }
    }
  });
});

// --- THE PROPERTY: NO PERSONALITY SAILS TEN LEVELS WEAPONLESS ------------------
// Through the REAL draw: each level's hand is `drawOffer` over the ship's own
// state (neutral weights; the level-zero guarantee on the first offer only, as
// World.materializeOffer passes it), the pick is `chooseSpend`, and the pick is
// applied by replaying the cards through `slotsWithCards` — the one slot fold
// the World and the client share. The bot sails healthy and never FIRES a
// consumable, so the belt only fills. The distribution is logged per
// personality as a reading, not a threshold.

describe('ai/spending — ten seeded levels through the real draw (Story 8.20)', () => {
  const SEEDS = 50;
  const LEVELS = 10;

  interface RunResult { weapons: number; consumableCopies: number; beltLines: number; wasted: number }

  function runOnce(id: BotProfileId, seed: number): RunResult {
    const pickRng = mulberry32((seed * 7919 + 17) >>> 0);
    const cls = pickRng.pick(SHIP_CLASS_IDS);
    const gun = pickRng.pick(GUN_IDS);
    const drawRng = mulberry32(seed);
    const spendRng = mulberry32((seed * 104729 + 3) >>> 0);
    const profile = profileOf(id);
    const cards: string[] = [];
    let wasted = 0;
    const slotIds = (): (SlotItemId | null)[] =>
      slotsWithCards(effectiveStats(hullEnvelope(cls), cards), cards, CATALOG, false, gun, classShift(cls))
        .map((s) => s.equipmentId);
    for (let level = 0; level < LEVELS; level += 1) {
      const ids = slotIds();
      const ship = { held: cards as readonly LineId[], slotIds: ids, mountedGun: MOUNTED_GUN[gun] };
      const offer = drawOffer(ship, new Map(), drawRng, CATALOG, { guarantee: level === 0 });
      const choice = chooseSpend(profile, spendState({ offer, cards, slotIds: ids }), CATALOG, spendRng);
      if (choice === null) wasted += 1;
      else cards.push(offer[choice]);
    }
    const ids = slotIds();
    return {
      weapons: WEAPON_SLOTS.filter((i) => ids[i] !== null).length,
      consumableCopies: cards.filter((c) => CATALOG[c].kind === 'consumable').length,
      beltLines: CONSUMABLE_SLOTS.filter((i) => ids[i] !== null).length,
      wasted,
    };
  }

  it('no personality × seed ends ten levels with zero Q/E/R weapons (distribution logged)', () => {
    const table: Record<string, { meanWeapons: number; meanConsumableCopies: number; meanBeltLines: number; zeroWeapon: number; wasted: number }> = {};
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      let w = 0;
      let c = 0;
      let b = 0;
      let zero = 0;
      let wasted = 0;
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const r = runOnce(id, seed);
        w += r.weapons;
        c += r.consumableCopies;
        b += r.beltLines;
        wasted += r.wasted;
        if (r.weapons === 0) zero += 1;
      }
      table[id] = { meanWeapons: w / SEEDS, meanConsumableCopies: c / SEEDS, meanBeltLines: b / SEEDS, zeroWeapon: zero, wasted };
    }
    console.log('[8.20 scorer distribution, 50 seeds x 10 levels]', JSON.stringify(table));
    for (const [id, row] of Object.entries(table)) expect(row.zeroWeapon, id).toBe(0);
  });
});

// --- track persistence: the structural jamming counter -----------------------

describe('ai/utility — track persistence (the chaff counter; the jamming buoy before it)', () => {
  // A chaff cloud scatters 10 fakes per sweep period, wire-indistinguishable
  // from real blips and folded into memory as ordinary tracks — but fakes
  // RE-SCATTER WHOLESALE each revolution, so no fake persists as one coherent
  // track across a full sweep period. Persistence is therefore the honest
  // discriminator, and it gates ONLY the 30s-reload commits (torpedo /
  // broadside want gates in ai/equipment.ts) — never the gun, because
  // shooting at radar blips is a ruled skill (Eric, cycle 99).
  const NOW = 50000;

  function anonAt(now: number, firstSeenAt: number): BotTrack {
    return {
      id: null, x: 400, y: 0, heading: null, speed: null, seenAt: now,
      live: false, cls: null, fleet: false, firstSeenAt, hits: 0,
    };
  }

  it('derives the bar from one BASE sweep revolution', () => {
    expect(TRACK_PERSIST_MS).toBeCloseTo(60000 / CONFIG.vision.sweepRpm, 6);
  });

  it('a freshly scattered plot has no persistence; a held track does', () => {
    expect(hasPersistence(anonAt(NOW, NOW - TRACK_PERSIST_MS + 1), NOW)).toBe(false);
    expect(hasPersistence(anonAt(NOW, NOW - TRACK_PERSIST_MS), NOW)).toBe(true);
  });

  it('a LIVE truesight contact passes instantly — fakes never appear in the bubble', () => {
    const t = { ...anonAt(NOW, NOW), live: true };
    expect(hasPersistence(t, NOW)).toBe(true);
  });
});

// --- the band pull -----------------------------------------------------------

describe('ai/utility — the band pull is bounded (Eric ruling 2026-08-20)', () => {
  it('a ready short-reach weapon tugs the NEAR edge exactly halfway, never further', () => {
    const band = { min: 264, max: 396 };
    const pulled = pullBand(band, [250]);
    expect(pulled.min).toBeCloseTo((264 + 250) / 2, 6); // halfway — the cap IS the move
    expect(pulled.max).toBe(396); // the far edge never moves
  });

  it('a reach already usable in the band pulls nothing; long reaches pull nothing', () => {
    const band = { min: 264, max: 396 };
    expect(pullBand(band, [300, 412.5, 660])).toEqual(band); // gun/broadside never re-band a hull
    expect(pullBand(band, [])).toEqual(band); // an empty tube reverts the band
  });

  it('several short reaches: the strongest pull wins, still capped at halfway', () => {
    const band = { min: 264, max: 396 };
    const pulled = pullBand(band, [250, 150]);
    expect(pulled.min).toBeCloseTo((264 + 150) / 2, 6);
    expect(pulled.min).toBeGreaterThan(150); // identity survives: never AT the reach
  });
});

// --- the test-only blind-vacuum rig (Story 7-6 wave 4) -----------------------

describe('ai/profiles — the TEST-ONLY random-spend rows (wave 4)', () => {
  it('lives in a SEPARATE id space: no test id is reachable through in-game enrollment', () => {
    // STRUCTURAL, not sampled: botDriver.enroll's in-game roll is
    // `rng.pick(CONFIG.bots.profiles)` and ArenaRoom.buildBotFleet
    // passes no override, so the ONLY profiles a real Solo vs AI lobby can
    // deal are the ids in that CONFIG table. Test ids being absent from that
    // flat list — and from BOT_PROFILES entirely — is therefore proof of
    // unreachability, not a probabilistic claim.
    const testIds = Object.keys(TEST_PROFILES);
    expect(testIds.sort()).toEqual(['randomBattleship', 'randomMineLayer', 'randomTorpedoBoat']);
    for (const id of CONFIG.bots.profiles) expect(testIds).not.toContain(id);
    for (const id of testIds) expect(Object.hasOwn(BOT_PROFILES, id)).toBe(false);
  });

  it('three rows, one per hull, carrying the RULED blind-vacuum values verbatim', () => {
    // Story 8.20: the test rows stay hull-bound through TEST_PROFILE_HULL.
    const hulls = TEST_PROFILE_IDS.map((id) => testProfileHull(id));
    expect([...hulls].sort()).toEqual([...SHIP_CLASS_IDS].sort());
    for (const id of TEST_PROFILE_IDS) {
      const row = TEST_PROFILES[id];
      expect(row.id).toBe(id);
      expect(row.spend).toBe('random');
      expect(row.bandMinFrac).toBe(0.15);
      expect(row.bandMaxFrac).toBe(0.55);
      expect(row.targetWeights).toEqual({ captain: 1.0, fleet: 1.0, damaged: 1.0, isolated: 1.0 });
      expect(row.disengageHpFrac).toBe(CONFIG.bots.disengageHpFrac);
      expect(row.healHpFrac).toBe(CONFIG.bots.healHpFrac);
      // Every appetite entry at or above EAGER, so every equipment verb is
      // exercised and the read is not shaped by a doctrine preference…
      for (const v of Object.values(row.appetite)) expect(v).toBeGreaterThanOrEqual(APPETITE_EAGER);
      // …with the gun ladder still the LOWEST entries (the universal fallback
      // order). Story 8.20 writes the two pickable guns explicitly at the
      // gun's own 2.0 (the numbers the retired family fallback resolved).
      const GUNS = ['gun', 'machineGun', 'flak'];
      for (const [eq, v] of Object.entries(row.appetite)) {
        if (GUNS.includes(eq)) expect(v).toBe(appetiteFor(row, 'gun'));
        else expect(v).toBeGreaterThan(appetiteFor(row, 'gun'));
      }
    }
  });

  it('every in-game row spends WEIGHTED; profileOf resolves both id spaces', () => {
    for (const p of Object.values(BOT_PROFILES)) expect(p.spend).toBe('weighted');
    expect(profileOf('raider')).toBe(BOT_PROFILES.raider);
    expect(profileOf('randomBattleship')).toBe(TEST_PROFILES.randomBattleship);
  });
});

describe('ai/spending — random mode (wave 4)', () => {
  /** An rng that fails the test if it is touched at all. */
  function trapRng(): never {
    throw new Error('the weighted spend path drew from the rng');
  }
  const TRAP = { next: trapRng, float: trapRng, int: trapRng, pick: trapRng } as unknown as Rng;

  it('the WEIGHTED path draws ONLY on a tie, and is byte-identical with or without an rng on a clear winner', () => {
    const offer = ['deckGun', 'heavyTorpedo', 'armor'];
    const bare = chooseSpend(profileOf('raider'), spendState({ offer }));
    expect(bare).toBe(1); // a favorite weapon, 3.75, clears every 3-point card
    // No tie: a trap rng must neither change the answer nor be touched.
    expect(chooseSpend(profileOf('raider'), spendState({ offer }), undefined, TRAP)).toBe(bare);
    // A tie: exactly one draw.
    const { rng, calls } = countingRng(4);
    chooseSpend(profileOf('raider'), spendState({ offer: ['deckGun', 'armor'] }), undefined, rng);
    expect(calls()).toBe(1);
  });

  it('a random profile picks UNIFORMLY over the offer off its own stream', () => {
    const row = profileOf('randomMineLayer');
    const offer = ['deckGun', 'heavyTorpedo', 'armor', 'speed'];
    // The policy must be exactly one rng.int(0, offer.length - 1) draw: replay
    // the same seed independently and demand index equality, draw for draw.
    const rng = mulberry32(99);
    const expected = mulberry32(99);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      const got = chooseSpend(row, spendState({ offer }), undefined, rng);
      expect(got).toBe(expected.int(0, offer.length - 1));
      seen.add(got!);
    }
    // 40 draws over 4 slots on a FIXED seed: a deterministic replay, not flake.
    expect(seen.size).toBe(offer.length);
  });

  it('a hurt random profile picks a card like any other — the heal branch is gone', () => {
    const row = profileOf('randomTorpedoBoat');
    const hurt = row.healHpFrac * 100 - 1;
    const rng = mulberry32(7);
    expect(chooseSpend(row, spendState({ hp: hurt, offer: ['deckGun', 'armor'] }), undefined, rng))
      .toBe(mulberry32(7).int(0, 1));
  });

  it('nothing banked / no offer stay null in random mode, same as weighted', () => {
    const row = profileOf('randomBattleship');
    const rng = mulberry32(3);
    expect(chooseSpend(row, spendState({ bankedLevels: 0, offer: ['x'] }), undefined, rng)).toBeNull();
    expect(chooseSpend(row, spendState({ offer: null }), undefined, rng)).toBeNull();
    expect(chooseSpend(row, spendState({ offer: [] }), undefined, rng)).toBeNull();
  });
});

// STORY 8.15 (amendment 109): the two pickable guns and the two class Shifts
// read their family's appetite, adding no number — a machine gun exactly as
// the cannon, a Shift exactly as the boost. Story 8.20 writes those numbers
// explicitly per line (the family fallback is deleted); the equality stands.
describe('Story 8.15 — the new ids read their family\'s appetite', () => {
  const ALL_ROWS: AnyProfileId[] = [...(Object.keys(BOT_PROFILES) as BotProfileId[]), ...TEST_PROFILE_IDS];

  it('MG/flak read the CANNON appetite; INSTANT RELOAD / DAMAGE CUT read the BOOST appetite', () => {
    for (const id of ALL_ROWS) {
      const row = profileOf(id);
      expect(appetiteFor(row, 'machineGun'), id).toBe(appetiteFor(row, 'gun'));
      expect(appetiteFor(row, 'flak'), id).toBe(appetiteFor(row, 'gun'));
      expect(appetiteFor(row, 'instantReload'), id).toBe(appetiteFor(row, 'boost'));
      expect(appetiteFor(row, 'damageCut'), id).toBe(appetiteFor(row, 'boost'));
    }
  });
});
