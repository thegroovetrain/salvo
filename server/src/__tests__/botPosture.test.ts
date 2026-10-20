// THE EXTENDED POSTURE CHAIN (Story 9.13, Eric rulings 2026-10-17, epic-9
// amendments 193–201) — ai/posture.ts, plus the decoy and hits-per-click
// halves of ai/utility.ts / ai/plot.ts it stands on. Contracts only: every
// number is read off CONFIG, the class table or the fixture's own geometry.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  effectiveStats,
  hullBumper,
  hullEnvelope,
  mulberry32,
  type DecoyView,
  type EffectiveStats,
  type GameEvent,
  type HullId,
  type ZoneRing,
} from '@salvo/shared';
import type { PerceptionView } from '../game/perception.js';
import type { BotMind, BotProfileId } from '../game/ai/types.js';
import { profileOf } from '../game/ai/profiles.js';
import { probableDecoy } from '../game/ai/plot.js';
import { noteContact, oddsFor, outnumbered, targetReachU } from '../game/ai/posture.js';
import {
  choosePosture,
  damageEstimate,
  foldView,
  scoreTrack,
  selectTargetKey,
  type BotSituation,
  type BotTrack,
} from '../game/ai/utility.js';

const NOW = 50000;
const WIDE: ZoneRing = { cx: 0, cy: 0, r: 100000 };

function mind(profile: BotProfileId = 'bulwark'): BotMind {
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
    wakeCells: [],
    lastSweep: -1,
    targetKey: null,
    posture: 'reposition',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

function view(over: Partial<PerceptionView> = {}): PerceptionView {
  return { contacts: [], events: [], mines: [], litZones: [], burnZones: [], foulZones: [], decoys: [], clouds: [], ...over };
}

function stats(cls: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat'): EffectiveStats {
  return effectiveStats(hullEnvelope(cls));
}

/** A hull on the torpedo-boat class at full health by default. */
function situation(over: Partial<BotSituation> = {}): BotSituation {
  const st = over.stats ?? stats('torpedoBoat');
  return {
    now: NOW,
    x: 0,
    y: 0,
    hp: st.maxHp,
    maxHp: st.maxHp,
    stats: st,
    speed: 0,
    heading: 0,
    profile: profileOf('bulwark'),
    ring: WIDE,
    islands: [],
    hullId: 'torpedoBoat',
    ...over,
  };
}

/** A track, live and sighted unless a test says otherwise. */
function track(over: Partial<BotTrack> = {}): BotTrack {
  return {
    id: 'e1',
    x: 0,
    y: 0,
    heading: 0,
    speed: 0,
    seenAt: NOW,
    live: true,
    sunk: false,
    cls: 'torpedoBoat' as HullId,
    fleet: false,
    firstSeenAt: 0,
    hits: 0,
    vx: null,
    vy: null,
    vAt: -1,
    vSrc: null,
    paintX: 0,
    paintY: 0,
    paintAt: -1,
    missSweptAt: -1,
    ...over,
  };
}

/** An anonymous radar plot (no id, no class, not live). */
function plot(over: Partial<BotTrack> = {}): BotTrack {
  return track({ id: null, cls: null, live: false, ...over });
}

const reachOf = (st: EffectiveStats): number => st.equipment.gun.rangeU;
const solidFog = (): number => 1;
const noFog = (): number => 0;

describe('ai/posture — THE ODDS GATE beyond own reach (epic-9 amendments 194–195)', () => {
  it('odds = own hp × (1 + own damage estimate) / peer factor − the crowd term; an unclassed plot is a peer', () => {
    const sit = situation({ hp: situation().maxHp / 2 });
    const anon = plot({ x: reachOf(sit.stats) + 200, hits: 1 });
    expect(oddsFor(sit, anon, [anon], [])).toBeCloseTo(0.5 * (1 + damageEstimate(anon)), 9);
    // A sighted battleship: its base hull over the torpedo boat's base hull.
    const bs = track({ x: reachOf(sit.stats) + 200, cls: 'battleship' });
    const peer = hullEnvelope('battleship').hp / hullEnvelope('torpedoBoat').hp;
    expect(oddsFor(sit, bs, [bs], [])).toBeCloseTo(0.5 / peer, 9);
  });

  it('PASS -> pursue: a full hull against a peer beyond own reach clears the bulwark bar', () => {
    const sit = situation();
    const t = track({ x: reachOf(sit.stats) + 200 });
    expect(oddsFor(sit, t, [t], [])).toBeGreaterThanOrEqual(profileOf('bulwark').oddsThreshold);
    expect(choosePosture(sit, t)).toBe('pursue');
  });

  it('IN OWN REACH -> engage, whatever the odds', () => {
    const sit = situation({ hp: 1 + situation().maxHp * profileOf('bulwark').disengageHpFrac });
    expect(choosePosture(sit, track({ x: reachOf(sit.stats) - 10, cls: 'battleship' }))).toBe('engage');
  });

  // Amendment 194 read literally (orchestrator ruling 2026-10-17): a failed
  // gate that is not outnumbered SHADOWS the contact at the edge of own reach.
  it('FAIL -> KITE (shadow) on a contact that is not closing, or that closes against a gun no longer than own', () => {
    const base = stats('torpedoBoat');
    const longer = { ...base, equipment: { ...base.equipment, gun: { ...base.equipment.gun, rangeU: base.equipment.gun.rangeU * 1.3 } } };
    const sit = situation({ stats: longer });
    const at = reachOf(longer) + 100;
    const closing = track({ x: at, cls: 'battleship', heading: Math.PI, speed: 20 });
    expect(oddsFor(sit, closing, [closing], [])).toBeLessThan(profileOf('bulwark').oddsThreshold);
    expect(choosePosture(sit, closing)).toBe('kite');
    // Running away (not closing): shadowed too.
    expect(choosePosture(sit, track({ x: at, cls: 'battleship', heading: 0, speed: 20 }))).toBe('kite');
    // A course-less plot is not closing: shadowed.
    expect(choosePosture(situation(), track({ x: reachOf(base) + 200, cls: 'battleship' }))).toBe('kite');
    // A closing sighted peer whose base reach equals own: ≥, so shadowed.
    expect(targetReachU(situation(), track({ cls: 'battleship' }))).toBeLessThanOrEqual(reachOf(base));
    expect(choosePosture(situation(), track({ x: reachOf(base) + 100, cls: 'battleship', heading: Math.PI, speed: 20 }))).toBe('kite');
  });

  it('FAIL + closing with the LONGER gun -> HIDE with a cover point (solid fog), DISENGAGE without one', () => {
    const base = stats('torpedoBoat');
    const shorter = { ...base, equipment: { ...base.equipment, gun: { ...base.equipment.gun, rangeU: base.equipment.gun.rangeU * 0.7 } } };
    const sit = situation({ stats: shorter });
    const t = track({ x: reachOf(shorter) + 200, cls: 'battleship', heading: Math.PI, speed: 20 });
    expect(targetReachU(sit, t)).toBeGreaterThan(reachOf(shorter));
    const foggy = mind();
    foggy.fogAt = solidFog;
    foggy.contacts.set('e1', t);
    expect(choosePosture(sit, t, 'pursue', { mind: foggy, targetKey: 'e1' })).toBe('hide');
    expect(foggy.coverPoint).toBeTruthy();
    const clear = mind();
    clear.fogAt = noFog;
    clear.contacts.set('e1', t);
    expect(choosePosture(sit, t, 'pursue', { mind: clear, targetKey: 'e1' })).toBe('disengage');
  });

  it('a LEANS-IN profile closes on a failed gate down to three quarters of its bar', () => {
    // A slightly worn hull (90 %), so the odds sit under the bar whatever the
    // class hp ratio (a full 300 hp torpedoBoat vs a 350 hp battleship reads
    // 0.857, over the raider's bar, since amendment 209).
    const st = stats('torpedoBoat');
    const sit = situation({ profile: profileOf('raider'), hp: st.maxHp * 0.9 });
    const t = track({ x: reachOf(sit.stats) + 200, cls: 'battleship' });
    const odds = oddsFor(sit, t, [t], []);
    const bar = profileOf('raider').oddsThreshold;
    expect(odds).toBeLessThan(bar);
    expect(choosePosture(sit, t)).toBe(odds >= bar * CONFIG.bots.leanInFactor ? 'pursue' : 'kite');
    // The same odds on a non-leaning profile with the same bar never close.
    expect(choosePosture({ ...sit, profile: { ...profileOf('raider'), leansIn: false } }, t)).not.toBe('pursue');
  });

  it('OUTNUMBERED fails outright: outnumberedCount other hostiles within radar range', () => {
    const sit = situation();
    const t = track({ x: reachOf(sit.stats) + 200 });
    const others = Array.from({ length: CONFIG.bots.outnumberedCount }, (_, i) =>
      track({ id: `o${i}`, x: 0, y: (i + 1) * 100 }),
    );
    const m = mind();
    m.contacts.set('e1', t);
    others.forEach((o) => m.contacts.set(o.id!, o));
    const all = [t, ...others];
    expect(outnumbered(sit, t, all, [])).toBe(true);
    expect(['hide', 'disengage']).toContain(choosePosture(sit, t, 'pursue', { mind: m, targetKey: 'e1' }));
    // PvE fleet hulls, wrecks and beyond-radar plots do not count.
    const harmless = [
      track({ id: 'f', x: 0, y: 100, fleet: true, cls: 'droneSmall' }),
      track({ id: 'w', x: 0, y: 200, sunk: true }),
      track({ id: 'far', x: 0, y: sit.stats.radarRange + 100 }),
    ];
    expect(outnumbered(sit, t, [t, ...harmless], [])).toBe(false);
  });
});

describe('ai/posture — THE DISENGAGE LATCH (epic-9 amendment 196)', () => {
  const bulwark = profileOf('bulwark');

  it('holds below line + hysteresis, and above it while a hostile still paints; releases once contact is broken', () => {
    const st = stats('torpedoBoat');
    const m = mind();
    m.fogAt = noFog;
    const chaser = plot({ x: 800, paintX: 800, paintAt: NOW, seenAt: NOW });
    m.contacts.set('c', chaser);
    const at = (now: number, frac: number) =>
      choosePosture(situation({ now, hp: st.maxHp * frac }), null, m.posture, { mind: m });

    m.posture = at(NOW, bulwark.disengageHpFrac - 0.01);
    expect(m.posture).toBe('disengage');
    expect(m.disengagedSince).toBe(NOW);
    // Back over the line by less than the hysteresis: still breaking off.
    m.posture = at(NOW + 1000, bulwark.disengageHpFrac + CONFIG.bots.disengageHysteresis / 2);
    expect(m.posture).toBe('disengage');
    // Past the hysteresis, but the chaser painted just now: still breaking off.
    chaser.paintAt = NOW + 2000;
    const healed = bulwark.disengageHpFrac + CONFIG.bots.disengageHysteresis + 0.01;
    m.posture = at(NOW + 2000, healed);
    expect(m.posture).toBe('disengage');
    // Contact broken for contactBrokenMs: released.
    m.posture = at(NOW + 2000 + CONFIG.bots.contactBrokenMs, healed);
    expect(m.posture).not.toBe('disengage');
    expect(m.disengagedSince).toBeNull();
  });

  it('reaching the cover point releases a healed hull even under paint', () => {
    const st = stats('torpedoBoat');
    const m = mind();
    m.contacts.set('c', plot({ x: 800, paintAt: NOW, seenAt: NOW }));
    m.disengagedSince = NOW - 5000;
    m.coverPoint = { x: 0, y: 0 }; // standing on it
    const healed = st.maxHp * (bulwark.disengageHpFrac + CONFIG.bots.disengageHysteresis + 0.01);
    expect(choosePosture(situation({ hp: healed }), null, 'disengage', { mind: m })).not.toBe('disengage');
  });

  it('the contact clock reads live sightings and paint times, never wrecks or decoys', () => {
    const m = mind();
    m.contacts.set('w', track({ id: 'w', sunk: true, live: false }));
    noteContact(m, NOW);
    expect(m.lastContactAt).toBe(-1);
    m.contacts.set('p', plot({ paintAt: NOW - 300 }));
    noteContact(m, NOW);
    expect(m.lastContactAt).toBe(NOW - 300);
    m.contacts.set('s', track({ id: 's' }));
    noteContact(m, NOW);
    expect(m.lastContactAt).toBe(NOW);
  });
});

describe('ai/posture — THE RAM EXIT (epic-9 amendment 201)', () => {
  const TB = stats('torpedoBoat');
  const raider = profileOf('raider');
  const broken = TB.maxHp * raider.disengageHpFrac - 1;
  const touching = hullBumper('torpedoBoat', 'droneMedium') - 1;

  it('falls to disengage ramExitMs after the strike on a surviving target, and never re-arms on it until the pair separate', () => {
    const m = mind('raider');
    m.fogAt = noFog;
    m.targetKey = 'e1';
    const t = track({ x: touching, cls: 'droneMedium', hits: 3 });
    m.contacts.set('e1', t);
    const at = (now: number) =>
      choosePosture(
        situation({ now, profile: raider, hp: broken, speed: TB.kinematics.maxSpeed }),
        t,
        m.posture,
        { mind: m },
      );
    m.posture = at(NOW);
    expect(m.posture).toBe('ram');
    expect(m.ramTargetKey).toBe('e1');
    expect(m.ramStruckAt).toBe(NOW);
    m.posture = at(NOW + CONFIG.bots.ramExitMs - 1);
    expect(m.posture).toBe('ram');
    m.posture = at(NOW + CONFIG.bots.ramExitMs);
    expect(m.posture).toBe('disengage');
    // Still inside ram reach: the trigger refuses that key.
    t.x = CONFIG.bots.ramReachU - 50;
    m.posture = at(NOW + CONFIG.bots.ramExitMs + 500);
    expect(m.posture).toBe('disengage');
    expect(m.ramTargetKey).toBe('e1');
    // Separated: the ban lifts, and a fresh approach may ram again.
    t.x = CONFIG.bots.ramReachU + 50;
    m.posture = at(NOW + CONFIG.bots.ramExitMs + 1000);
    expect(m.ramTargetKey).toBeNull();
    t.x = CONFIG.bots.ramReachU - 50;
    m.posture = at(NOW + CONFIG.bots.ramExitMs + 1500);
    expect(m.posture).toBe('ram');
  });
});

describe('ai/posture — THE RING CLAUSES (epic-9 amendment 200(2))', () => {
  const ring: ZoneRing = { cx: 0, cy: 0, r: 2000 };

  it('a target outside the live ring is never pursued; in own reach it is engaged from where the bot is', () => {
    const sit = situation({ ring, x: ring.r - 500 });
    const reach = reachOf(sit.stats);
    const beyond = track({ x: ring.r + 100 + (reach - 500) + 300 }); // outside the ring, past own reach
    expect(Math.hypot(beyond.x - sit.x, 0)).toBeGreaterThan(reach);
    expect(choosePosture(sit, beyond)).toBe('reposition');
    const inReach = track({ x: ring.r + 100 });
    expect(Math.hypot(inReach.x - sit.x, 0)).toBeLessThanOrEqual(reach);
    expect(choosePosture(sit, inReach)).toBe('engage');
  });

  it('a close inside ringOpenMarginMs opens no fight beyond own reach; at the margin, or already in reach, it does', () => {
    const sit = situation();
    const far = track({ x: reachOf(sit.stats) + 200 });
    const soon = { zone: { phase: 'closing' as const, closesInMs: CONFIG.bots.ringOpenMarginMs - 1 } };
    expect(choosePosture(sit, far, 'reposition', soon)).toBe('reposition');
    expect(choosePosture(sit, far, 'reposition', { zone: { phase: 'closing', closesInMs: CONFIG.bots.ringOpenMarginMs } })).toBe('pursue');
    expect(choosePosture(sit, track({ x: reachOf(sit.stats) - 10 }), 'reposition', soon)).toBe('engage');
    // Already deep inside the revealed next ring: nothing to leave for.
    expect(choosePosture(sit, far, 'reposition', { ...soon, nextRing: { cx: 0, cy: 0, r: 5000 } })).toBe('pursue');
  });
});

describe('ai/posture — HOLD in cover with no target (epic-9 amendments 199/202)', () => {
  it('siege and trapper standing at their cover point hold; elsewhere, or any other profile, reposition', () => {
    for (const id of ['siege', 'trapper'] as const) {
      const m = mind(id);
      m.coverPoint = { x: 0, y: 0 };
      expect(choosePosture(situation({ profile: profileOf(id) }), null, 'reposition', { mind: m })).toBe('hold');
      m.coverPoint = { x: 0, y: 1000 };
      m.fogAt = noFog;
      expect(choosePosture(situation({ profile: profileOf(id) }), null, 'reposition', { mind: m })).toBe('reposition');
    }
    const b = mind('bulwark');
    b.coverPoint = { x: 0, y: 0 };
    expect(choosePosture(situation({ profile: profileOf('bulwark') }), null, 'reposition', { mind: b })).toBe('reposition');
  });
});

describe('ai/utility — DECOYS (epic-9 amendment 197)', () => {
  const ownBuoy = (x: number, y: number): DecoyView => ({ id: 'd1', x, y, own: true, by: 'me', hp: 50 });

  it('an OWN decoy\'s paint is never selected, even as the only thing on the water', () => {
    const m = mind();
    m.view = view({ decoys: [ownBuoy(-600, 0)] });
    m.contacts.set('a', plot({ x: -600, y: 0 }));
    expect(selectTargetKey(m, situation())).toBeNull();
  });

  it('a SIGHTED enemy decoy\'s plot is excluded; the live hull in reach is selected', () => {
    const m = mind();
    m.view = view({ decoys: [{ id: 'd2', x: 300, y: 0, own: false, by: 'enemy' }] });
    m.contacts.set('buoy', plot({ x: 300, y: 5 }));
    m.contacts.set('hull', track({ id: 'hull', x: 0, y: 450 }));
    expect(selectTargetKey(m, situation())).toBe('hull');
  });

  it('a probable buoy (tiny, wake-less, stationary for decoyStillSweeps) is demoted ONLY while a live hull is in reach', () => {
    const sit = situation();
    const cues = { paintCells: 4, stillSweeps: CONFIG.bots.decoyStillSweeps };
    const buoy = plot({ x: -600, y: 0, ...cues });
    const notBuoy = plot({ x: -600, y: 0, ...cues, paintCells: 40 });
    expect(probableDecoy(buoy)).toBe(true);
    expect(probableDecoy(notBuoy)).toBe(false);
    expect(probableDecoy({ ...buoy, hasWake: true })).toBe(false);
    expect(probableDecoy({ ...buoy, stillSweeps: CONFIG.bots.decoyStillSweeps - 1 })).toBe(false);
    const near = track({ id: 'h', x: 0, y: reachOf(sit.stats) - 50 });
    const far = track({ id: 'h', x: 0, y: reachOf(sit.stats) + 50 });
    const ratio = (h: BotTrack) => scoreTrack(buoy, sit, [buoy, h]) / scoreTrack(notBuoy, sit, [notBuoy, h]);
    expect(ratio(near)).toBeCloseTo(CONFIG.bots.decoyDemote, 9);
    expect(ratio(far)).toBeCloseTo(1, 9);
  });

  it('the fold carries the cues: a 2x2 paint painted stationary across sweeps reads as a probable buoy', () => {
    const m = mind();
    const blip = (t: number): GameEvent => ({ k: 'blip', t, gx: 40, gy: 0, w: 2, h: 2, bits: [0b1111] });
    const sweep = 60000 / CONFIG.vision.sweepRpm;
    for (let i = 0; i <= CONFIG.bots.decoyStillSweeps; i += 1) foldView(m, view({ events: [blip(i)] }), 1000 + i * sweep);
    const [t] = [...m.contacts.values()];
    expect(m.contacts.size).toBe(1);
    expect(t.paintCells).toBe(4);
    expect(t.stillSweeps).toBe(CONFIG.bots.decoyStillSweeps);
    expect(probableDecoy(t)).toBe(true);
  });

  it('a decoy never counts as a hostile in the odds count', () => {
    const sit = situation();
    const t = track({ x: reachOf(sit.stats) + 200 });
    const buoys = Array.from({ length: CONFIG.bots.outnumberedCount }, (_, i) =>
      plot({ x: 0, y: (i + 1) * 100, paintCells: 4, stillSweeps: CONFIG.bots.decoyStillSweeps }),
    );
    expect(outnumbered(sit, t, [t, ...buoys], [])).toBe(false);
  });
});

describe('ai/utility — HITS PER CLICK (epic-9 amendment 195)', () => {
  it('two hc rows of one click count one hit; the next click counts again', () => {
    const m = mind();
    foldView(m, view({ contacts: [{ id: 'e1', x: 200, y: 0, heading: 0, speed: 0, cls: 'battleship' }] }), 1000);
    m.fireSeq = 1;
    foldView(m, view({ events: [{ k: 'hc', id: 'me', x: 200, y: 0 }, { k: 'hc', id: 'me', x: 202, y: 0 }] }), 1500);
    expect(m.contacts.get('e1')!.hits).toBe(1);
    // The second barrel's shell landing a tick later, same click: still one.
    foldView(m, view({ events: [{ k: 'hc', id: 'me', x: 201, y: 0 }] }), 1500 + CONFIG.tick.simDtMs);
    expect(m.contacts.get('e1')!.hits).toBe(1);
    m.fireSeq = 2;
    foldView(m, view({ events: [{ k: 'hc', id: 'me', x: 200, y: 0 }] }), 4000);
    expect(m.contacts.get('e1')!.hits).toBe(2);
  });
});
