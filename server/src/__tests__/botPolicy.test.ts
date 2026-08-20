// COMBAT-BOT POLICY — wave-2 coverage (Story 6.4): the six priority profiles
// (ai/profiles.ts), utility scoring over the perception view (ai/utility.ts)
// and the boon spend policy (ai/spending.ts). Wave 1's bots.test.ts owns the
// driver plumbing (cadence, port, lifecycle, emission); nothing here touches
// a World.
//
// The six things this file exists to pin:
//   * BOTH BLIP GRAMMARS fold — a `silhouette` paint carries pose, a `return`
//     paint carries only a cell footprint and must still produce a usable
//     identity-free track (the room picks one grammar per match; a bot cannot
//     choose which one it gets);
//   * RING ESCAPE DOMINATES every other posture, at any hp, with any target;
//   * THE REACTION DELAY gates action on a freshly acquired track — the E2
//     competence knob, in one place;
//   * THE HEAL THRESHOLD outranks buying cards, and works with no offer;
//   * A RESOLVED EXCLUSIVE is demoted, or the policy ping-pongs a doctrine;
//   * FORAGER AND TRAPPER GENUINELY DISAGREE about PROP-FOULING MINES — the
//     proof that profiles change what a bot wants rather than how good it is.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  hullEnvelope,
  mulberry32,
  type Contact,
  type EffectiveStats,
  type GameEvent,
  type HullId,
  type ZoneRing,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import type { PerceptionView } from '../game/perception.js';
import type { BotMind, BotPosture, BotProfileId } from '../game/ai/types.js';
import { BOT_PROFILES, engagementBand, profileOf } from '../game/ai/profiles.js';
import {
  choosePosture,
  foldView,
  isActionable,
  ringDeadband,
  scoreTrack,
  selectTarget,
  tracksOf,
  type BotSituation,
  type BotTrack,
} from '../game/ai/utility.js';
import { boonWeightFor, chooseSpend, type BotSpendState } from '../game/ai/spending.js';

// --- builders ---------------------------------------------------------------

function mind(profile: BotProfileId = 'duelist'): BotMind {
  return {
    rng: mulberry32(7),
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
  return { contacts: [], events: [], mines: [], litZones: [], buoys: [], ...over };
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
    stats: over.stats ?? stats(profile.hullId),
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
  it('covers exactly CONFIG.bots.profiles, each row on its own hull', () => {
    const ids = SHIP_CLASS_IDS.flatMap((cls) => [...CONFIG.bots.profiles[cls]]);
    expect(Object.keys(BOT_PROFILES).sort()).toEqual([...ids].sort());
    for (const cls of SHIP_CLASS_IDS) {
      for (const id of CONFIG.bots.profiles[cls]) expect(BOT_PROFILES[id].hullId).toBe(cls);
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

  it('bands are ordered fractions of INTEL RANGE, so boons widen them', () => {
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
    expect(profileOf('siege').usesStarShells).toBe(true); // Eric ruling C2
    for (const id of ['raider', 'duelist', 'forager', 'trapper'] as const) {
      expect(profileOf('bulwark').disengageHpFrac).toBeLessThan(profileOf(id).disengageHpFrac);
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

describe('ai/spending — the boon policy', () => {
  function spendState(over: Partial<BotSpendState> = {}): BotSpendState {
    return { bankedLevels: 1, offer: null, boons: [], hp: 100, maxHp: 100, ...over };
  }

  it('returns null with nothing banked, and null with a healthy hull + no offer', () => {
    expect(chooseSpend(profileOf('raider'), spendState({ bankedLevels: 0, offer: ['gunBarrel'] }))).toBeNull();
    expect(chooseSpend(profileOf('raider'), spendState())).toBeNull();
  });

  it('below the heal fraction it heals — even with no offer materialized', () => {
    const raider = profileOf('raider');
    const hurt = raider.healHpFrac * 100 - 1;
    expect(chooseSpend(raider, spendState({ hp: hurt, offer: null }))).toBe(-1); // HEAL_CHOICE
    expect(chooseSpend(raider, spendState({ hp: hurt, offer: ['torpedoHoming'] }))).toBe(-1);
    // At the threshold exactly, it builds.
    expect(chooseSpend(raider, spendState({ hp: raider.healHpFrac * 100, offer: ['gunBarrel'] }))).toBe(0);
  });

  it('picks the profile\'s highest-weighted line out of the offered hand', () => {
    const offer = ['gunBarrel', 'torpedoHoming', 'shipHull'];
    expect(chooseSpend(profileOf('raider'), spendState({ offer }))).toBe(1); // torpedoHoming 3.0
    expect(chooseSpend(profileOf('bulwark'), spendState({ offer }))).toBe(2); // shipHull 3.0
  });

  it('a per-LINE override beats its own category base', () => {
    // siege's broadside category is 2.6 and its broadsideTurrets override is
    // 2.8, so the named line must win over an unnamed sibling of the same
    // category (re-keyed off the deleted cannon lines, Story 7-5 wave 2).
    expect(boonWeightFor('siege', 'broadsideTurrets')).toBeGreaterThan(boonWeightFor('siege', 'broadsideSpread'));
    expect(chooseSpend(profileOf('siege'), spendState({ offer: ['broadsideSpread', 'broadsideTurrets'] }))).toBe(1);
  });

  // RE-KEYED AGAIN IN STORY 7-5 WAVE 2, and NARROWED. Wave 1 pointed this pin
  // at the cannon pair as the last `exclusiveWith` users; wave 2 DELETED
  // exclusivity outright with the cannon (R2.6), so the "holding the RIVAL
  // demotes this line" half has no mechanism left and is RETIRED. What
  // survives — and is what the demotion was always for — is that a line the
  // bot ALREADY HOLDS drops below a real card, so a one-copy doctrine is never
  // re-bought as a no-op.
  it('demotes a line this bot ALREADY HOLDS (re-buying a one-copy doctrine is a no-op)', () => {
    const bulwark = profileOf('bulwark');
    const offer = ['starIncendiary', 'starDazzle'];
    // Fresh: bulwark's `starDazzle` line override (1.6) beats its unnamed
    // sibling on the starShells category base (1.0).
    expect(chooseSpend(bulwark, spendState({ offer }))).toBe(1);
    // Holding it already — re-buying is a no-op, so it drops below its sibling.
    expect(chooseSpend(bulwark, spendState({ offer, boons: ['starDazzle'] }))).toBe(0);
    expect(boonWeightFor('bulwark', 'starDazzle', ['starDazzle']))
      .toBeLessThan(boonWeightFor('bulwark', 'starDazzle', []));
  });

  // Wave 1's counterpart, now the GENERAL rule (wave 2 deleted exclusivity):
  // holding one verb never demotes ANOTHER line. Holding one star-shell verb
  // must not push the other down — every doctrine stacks.
  it('a non-exclusive doctrine verb is NEVER demoted by holding its former rival', () => {
    expect(boonWeightFor('bulwark', 'starDazzle', ['starIncendiary']))
      .toBe(boonWeightFor('bulwark', 'starDazzle', []));
  });

  it('an all-junk hand is still SPENT — a banked level held forever is wasted', () => {
    const idx = chooseSpend(profileOf('siege'), spendState({ offer: ['buoySweep', 'boostSpeed'] }));
    expect(idx).not.toBeNull();
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it('an unknown id never wins, and cannot crash the policy', () => {
    expect(boonWeightFor('siege', 'notACard')).toBe(0);
    expect(chooseSpend(profileOf('siege'), spendState({ offer: ['notACard', 'broadsideTurrets'] }))).toBe(1);
  });

  it('every per-line override names a REAL catalog line', () => {
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      const t = CONFIG.bots.boonWeights[id] as { lines: Record<string, number> };
      for (const line of Object.keys(t.lines)) expect(Object.hasOwn(BOON_CATALOG, line)).toBe(true);
    }
  });

  // THE PROOF THAT PROFILES MATTER -------------------------------------------
  it('the two Mine Layer profiles rank the mine DOCTRINES differently', () => {
    // WEAKENED DELIBERATELY at the cycle-95 merge, and the history matters.
    // This test used to assert a hard split (forager < 1, trapper > 4x) on an
    // arithmetic mechanism: prop-fouling carried mult 0.6 on mine.damage, which
    // dropped a 55-damage mine to 33 and BROKE the one-shot on a 45 hp fleet
    // hull — the thing forager lives on. Amendment 25 DELETED that multiplier
    // (Eric: "remove damage decrease for the fouling mines"), so the penalty is
    // gone and prop-fouling is a pure add. The weights were retired rather than
    // defended: a bot avoiding a card for a reason the game no longer contains
    // is a stale rationale, not a profile.
    //
    // What remains is real but softer — trapper's whole plan is dragging a
    // victim INTO its field, forager merely has no use for a slow (a fleet hull
    // dies to one mine either way) and prefers the mine that closes by itself.
    const forager = boonWeightFor('forager', 'minePropFouling');
    const trapper = boonWeightFor('trapper', 'minePropFouling');
    expect(trapper).toBeGreaterThan(forager);

    // Forager prefers CAPTIVE over prop-fouling; trapper is the reverse.
    // (Re-keyed in wave 2: `mineSelfPropelled` is deleted and `mineCaptive` is
    // its direct successor — a mine that reaches the target itself.)
    expect(boonWeightFor('forager', 'mineCaptive')).toBeGreaterThan(forager);
    expect(boonWeightFor('trapper', 'mineCaptive')).toBeLessThan(trapper);

    // Neither profile REFUSES a doctrine any more — both are pure adds.
    expect(forager).toBeGreaterThan(0);

    // And the ranking still changes the actual pick on a shared hand.
    const offer = ['minePropFouling', 'mineCaptive'];
    expect(chooseSpend(profileOf('forager'), { bankedLevels: 1, offer, boons: [], hp: 100, maxHp: 100 })).toBe(1);
    expect(chooseSpend(profileOf('trapper'), { bankedLevels: 1, offer, boons: [], hp: 100, maxHp: 100 })).toBe(0);
  });

  // RETIRED at the cycle-95 merge: "the mineDamage x minePropFouling PICK-ORDER
  // BUG is deliberately not dodged". The bug it guarded (53 vs 45 hp depending
  // on pick order, because prop-fouling's multiplicative write raced
  // mineDamage's additive ladder) was FIXED UPSTREAM by amendment 25, which
  // deleted the multiplier outright — "with no multiplier left, one effect
  // writes the path and order cannot matter." The test is retired rather than
  // adapted, per the project's standing rule; the spec's matching "Never"
  // clause is discharged, not overruled.
});
