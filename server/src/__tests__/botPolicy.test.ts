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
import type { PerceptionView } from '../game/perception.js';
import type { BotMind, BotProfileId } from '../game/ai/types.js';
import { BOT_PROFILES, engagementBand, profileOf } from '../game/ai/profiles.js';
import {
  choosePosture,
  foldView,
  isActionable,
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
  return { contacts: [], events: [], mines: [], litZones: [], decoys: [], ...over };
}

function contact(id: string, x: number, y: number, cls: HullId = 'battleship'): Contact {
  return { id, x, y, heading: 0, speed: 20, cls };
}

/** A `silhouette`-grammar paint (pose on the wire). */
function silhouetteBlip(id: string, x: number, y: number, t: number): GameEvent {
  return { k: 'blip', id, x, y, t, cls: 'mineLayer', heading: 1, speed: 12 };
}

/** A `return`-grammar paint: a 2x2 all-lit footprint at absolute cell
 *  (gx, gy). Centroid = ((gx+1) * cell, (gy+1) * cell). */
function returnBlip(gx: number, gy: number, t: number): GameEvent {
  return { k: 'blip', t, gx, gy, w: 2, h: 2, bits: [0b1111] };
}

const CELL = CONFIG.vision.radarCellU;

function stats(cls: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'battleship'): EffectiveStats {
  return effectiveStats(hullEnvelope(cls));
}

const WIDE_RING: ZoneRing = { cx: 0, cy: 0, r: 100000 };

function situation(over: Partial<BotSituation> = {}): BotSituation {
  const profile = over.profile ?? profileOf('duelist');
  return {
    now: 10000,
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    stats: over.stats ?? stats(profile.hullId),
    profile,
    ring: WIDE_RING,
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

// --- perception fold: BOTH blip grammars ------------------------------------

describe('ai/utility — the fold works under either radar grammar', () => {
  it('silhouette grammar: pose lands on the track, stale (not live)', () => {
    const m = mind();
    foldView(m, view({ events: [silhouetteBlip('e1', 300, 40, 900)] }), 1000);
    const t = onlyTrack(m);
    expect(t.id).toBe('e1');
    expect({ x: t.x, y: t.y }).toEqual({ x: 300, y: 40 });
    expect(t.heading).toBe(1);
    expect(t.speed).toBe(12);
    expect(t.cls).toBe('mineLayer');
    expect(t.live).toBe(false);
  });

  it('return grammar: position derived from the footprint, identity-free', () => {
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

  it('return grammar: an empty mask is not a contact, and never throws', () => {
    const m = mind();
    const empty: GameEvent = { k: 'blip', t: 900, gx: 3, gy: 4, w: 2, h: 2, bits: [0] };
    expect(() => foldView(m, view({ events: [empty] }), 1000)).not.toThrow();
    expect(tracksOf(m).length).toBe(0);
  });

  it('return grammar: a nearby second paint ASSOCIATES to the same track', () => {
    const m = mind();
    foldView(m, view({ events: [returnBlip(10, 20, 900)] }), 1000);
    foldView(m, view({ events: [returnBlip(11, 20, 1150)] }), 1200);
    const t = onlyTrack(m); // one track, moved — not two ghosts
    expect(t.firstSeenAt).toBe(1000); // the reaction gate's clock survives
    expect(t.seenAt).toBe(1200);
    expect(t.x).toBeCloseTo(12 * CELL, 6);
  });

  it('a live contact outranks a same-tick paint of the same hull', () => {
    const m = mind();
    foldView(m, view({ contacts: [contact('e1', 120, 0)], events: [silhouetteBlip('e1', 300, 40, 900)] }), 1000);
    const t = onlyTrack(m);
    expect(t.live).toBe(true);
    expect(t.x).toBe(120);
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
    foldView(m, view({ contacts: [contact('live', 300, 0)] }), 19000);
    foldView(m, view({ events: [silhouetteBlip('stale', -300, 0, 12000)] }), 12000);
    const sit = situation({ now: NOW });
    const all = tracksOf(m);
    const live = all.find((t) => t.id === 'live');
    const stale = all.find((t) => t.id === 'stale');
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
    expect(chooseSpend(profileOf('raider'), spendState({ bankedLevels: 0, offer: ['gunDamage'] }))).toBeNull();
    expect(chooseSpend(profileOf('raider'), spendState())).toBeNull();
  });

  it('below the heal fraction it heals — even with no offer materialized', () => {
    const raider = profileOf('raider');
    const hurt = raider.healHpFrac * 100 - 1;
    expect(chooseSpend(raider, spendState({ hp: hurt, offer: null }))).toBe(-1); // HEAL_CHOICE
    expect(chooseSpend(raider, spendState({ hp: hurt, offer: ['torpedoHoming'] }))).toBe(-1);
    // At the threshold exactly, it builds.
    expect(chooseSpend(raider, spendState({ hp: raider.healHpFrac * 100, offer: ['gunDamage'] }))).toBe(0);
  });

  it('picks the profile\'s highest-weighted line out of the offered hand', () => {
    const offer = ['gunDamage', 'torpedoHoming', 'shipHull'];
    expect(chooseSpend(profileOf('raider'), spendState({ offer }))).toBe(1); // torpedoHoming 3.0
    expect(chooseSpend(profileOf('bulwark'), spendState({ offer }))).toBe(2); // shipHull 3.0
  });

  it('a per-LINE override beats its own category base', () => {
    // siege's cannon category is 2.6 and its cannonDamage override is 2.8, so
    // the named line must win over an unnamed sibling of the same category.
    expect(boonWeightFor('siege', 'cannonDamage')).toBeGreaterThan(boonWeightFor('siege', 'cannonArcing'));
    expect(chooseSpend(profileOf('siege'), spendState({ offer: ['cannonArcing', 'cannonDamage'] }))).toBe(1);
  });

  it('demotes an exclusive whose PAIR IS ALREADY RESOLVED (no doctrine ping-pong)', () => {
    const raider = profileOf('raider');
    const offer = ['torpedoHoming', 'gunDamage'];
    // Fresh: homing is the top line in the whole raider table.
    expect(chooseSpend(raider, spendState({ offer }))).toBe(0);
    // Holding it already — re-buying is a no-op, so it drops below a real card.
    expect(chooseSpend(raider, spendState({ offer, boons: ['torpedoHoming'] }))).toBe(1);
    // Holding the RIVAL — taking it would swap the doctrine back and forth
    // forever, which is exactly the ping-pong the demotion exists to stop.
    expect(chooseSpend(raider, spendState({ offer, boons: ['torpedoCommand'] }))).toBe(1);
    expect(boonWeightFor('raider', 'torpedoHoming', ['torpedoCommand']))
      .toBeLessThan(boonWeightFor('raider', 'torpedoHoming', []));
  });

  it('an all-junk hand is still SPENT — a banked level held forever is wasted', () => {
    const idx = chooseSpend(profileOf('siege'), spendState({ offer: ['decoyDuration', 'boostMax'] }));
    expect(idx).not.toBeNull();
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it('an unknown id never wins, and cannot crash the policy', () => {
    expect(boonWeightFor('siege', 'notACard')).toBe(0);
    expect(chooseSpend(profileOf('siege'), spendState({ offer: ['notACard', 'cannonDamage'] }))).toBe(1);
  });

  it('every per-line override names a REAL catalog line', () => {
    for (const id of Object.keys(BOT_PROFILES) as BotProfileId[]) {
      const t = CONFIG.bots.boonWeights[id] as { lines: Record<string, number> };
      for (const line of Object.keys(t.lines)) expect(Object.hasOwn(BOON_CATALOG, line)).toBe(true);
    }
  });

  // THE PROOF THAT PROFILES MATTER -------------------------------------------
  it('forager and trapper genuinely DISAGREE about PROP-FOULING MINES', () => {
    // The mechanism, not a taste: a base mine does 55 and the small fleet hull
    // has 45 hp, so a base mine ONE-SHOTS it. Prop-fouling's x0.6 drops that
    // to 33 and breaks the one-shot — the thing forager lives on. Trapper
    // wants the identical card, because the fouling slow drags a victim into
    // its field.
    const forager = boonWeightFor('forager', 'minePropFouling');
    const trapper = boonWeightFor('trapper', 'minePropFouling');
    expect(forager).toBeLessThan(1);
    expect(trapper).toBeGreaterThan(forager * 4);

    // Forager ranks it below EVERY other mines-category line it can be
    // offered — the demotion is not marginal.
    for (const id of ['mineDamage', 'mineBlast', 'mineTrigger', 'mineMax', 'mineSelfPropelled']) {
      expect(boonWeightFor('forager', id)).toBeGreaterThan(forager);
    }

    // And it changes the actual PICK on the same hand.
    const offer = ['minePropFouling', 'decoyDuration'];
    expect(chooseSpend(profileOf('forager'), { bankedLevels: 1, offer, boons: [], hp: 100, maxHp: 100 })).toBe(1);
    expect(chooseSpend(profileOf('trapper'), { bankedLevels: 1, offer, boons: [], hp: 100, maxHp: 100 })).toBe(0);
  });

  it('the mineDamage x minePropFouling PICK-ORDER BUG is deliberately not dodged', () => {
    // Eric-confirmed (spec "Never" clause): bots eat it exactly as humans do.
    // Both cards stay ordinarily weighted for trapper — no ordering
    // preference, no lookahead, no "take the multiplier last" special case.
    // If this test starts failing because someone taught the policy about
    // pick order, the fix belongs in the boon engine, with a ruling.
    expect(boonWeightFor('trapper', 'mineDamage')).toBeGreaterThan(0);
    expect(boonWeightFor('trapper', 'minePropFouling')).toBeGreaterThan(0);
    const withDamageFitted = boonWeightFor('trapper', 'minePropFouling', ['mineDamage']);
    expect(withDamageFitted).toBe(boonWeightFor('trapper', 'minePropFouling', []));
  });
});
