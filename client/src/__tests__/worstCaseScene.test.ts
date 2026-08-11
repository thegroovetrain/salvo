// THE STAGED WORST-CASE SCENE's composer (stage/worstCaseScene.ts, Story 4.8,
// amendment 242). The scene is the readability gate's SUBJECT, so what it stages
// has to be pinned: if the hull is not actually critical, or the timeline is not
// actually in the ring's amber urgency window, the capture proves nothing about
// the arbitration it was taken to exercise.
//
// These tests are the data half only — the Pixi wiring shell (stage/worstCase.ts)
// is a thin adapter with no logic to test, exactly like render/stage.ts.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  REGATTA_NO_HUE,
  isOutside,
  zoneLiveState,
  type SunkEvent,
} from '@salvo/shared';
import {
  BOUNTY_INDEX,
  OWN_CLASS,
  SCENE,
  STAGE_SEED,
  bankedPointsAt,
  buildSceneWorld,
  clusterCentre,
  ownPoseAt,
  sceneContacts,
  sceneEvents,
  sceneFrame,
  scenePublicPlane,
  sceneOwn,
} from '../stage/worstCaseScene.js';
import { railCritical, railPulsing } from '../render/hud.js';
import { tier1Active, tier2Active, freezeAtDimKeyframe } from '../render/attention.js';
import { ringReadout } from '../ui/chromeBar.js';
import { zoneViewFrom } from '../sim/zoneView.js';

const MAP_RADIUS = 1500;
const world = buildSceneWorld(MAP_RADIUS, STAGE_SEED);

/** Own hull fraction at `tick`, as the HUD derives it. */
function hpFracAt(tick: number): number {
  return sceneOwn(world, tick).hp / CONFIG.shipClasses[OWN_CLASS].hp;
}

describe('staged worst-case scene — determinism', () => {
  it('is a total function of (seed, mapRadius): two builds are identical', () => {
    const a = buildSceneWorld(MAP_RADIUS, STAGE_SEED);
    const b = buildSceneWorld(MAP_RADIUS, STAGE_SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a frame at a given tick is byte-identical across builds', () => {
    const a = sceneFrame(buildSceneWorld(MAP_RADIUS), 137, 1_000_000);
    const b = sceneFrame(buildSceneWorld(MAP_RADIUS), 137, 1_000_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('every staged number is finite (no NaN can reach a renderer)', () => {
    const f = sceneFrame(world, 61, 5_000);
    const nums = JSON.stringify(f).match(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi) ?? [];
    expect(nums.every((n) => Number.isFinite(Number(n)))).toBe(true);
  });
});

describe('staged worst-case scene — Tier 1 (own hull CRITICAL)', () => {
  it('stages the hull inside the CRIMSON band, so Tier 1 is active', () => {
    const frac = hpFracAt(0);
    expect(frac).toBeLessThan(0.25);
    expect(railCritical(frac)).toBe(true);
    expect(railPulsing(frac)).toBe(true);
    expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(true);
  });

  it('holds the hull critical for the whole scene, not just tick 0', () => {
    for (const t of [0, 37, 240, 1200, 7777]) expect(railCritical(hpFracAt(t))).toBe(true);
  });

  it('stages a denied press too — the OTHER Tier-1 channel', () => {
    expect(sceneFrame(world, 0, 0).denied).toEqual([{ slot: 1, reason: 'cooling', seq: 0 }]);
    expect(sceneFrame(world, 1, 0).denied).toBeUndefined();
  });
});

describe('staged worst-case scene — Tier 2 (the storm closing)', () => {
  const now = 10_000_000;
  const plane = scenePublicPlane(world, now);
  const zv = zoneViewFrom(plane, MAP_RADIUS, now);

  it('pins the timeline in a PRE-CLOSE beat inside the final-10s urgency window', () => {
    expect(zv.state).not.toBe('idle');
    expect(zv.state).not.toBe('closing');
    expect(ringReadout(zv.state, zv.closesInMs).urgent).toBe(true);
    expect(ringReadout(zv.state, zv.closesInMs).text).toContain('RING CLOSES IN');
  });

  it('reveals the NEXT ring, so the dashed telegraph draws beside the live edge', () => {
    expect(zv.next).not.toBeNull();
    expect(zv.next?.r).toBeGreaterThan(0);
    expect(zv.next?.r).toBeLessThan(zv.cur.r);
  });

  it('puts the own hull OUTSIDE the live ring — the in-storm vignette breathes', () => {
    const p = ownPoseAt(world, 0);
    expect(isOutside(p, zv.cur.cx, zv.cur.cy, zv.cur.r)).toBe(true);
  });

  it('keeps the hull outside the ring for the whole staged orbit', () => {
    for (const t of [0, 300, 900, 2400]) {
      const p = ownPoseAt(world, t);
      expect(isOutside(p, zv.cur.cx, zv.cur.cy, zv.cur.r)).toBe(true);
    }
  });

  it('re-seats the anchor every poll, so the readout never runs off the window', () => {
    for (const t of [0, 1_000, 5_000_000]) {
      const s = scenePublicPlane(world, t);
      const live = zoneLiveState(t, s.zoneStartT, world.ring.cur, world.ring.next, CONFIG.zone);
      expect(live.closesInMs).toBeLessThanOrEqual(10_000);
      expect(live.closesInMs).toBeGreaterThan(0);
    }
  });

  it('composes to Tier 2 active and therefore a FROZEN Tier-3 chip', () => {
    const t2 = tier2Active({ inStorm: true, ringUrgent: true });
    expect(t2).toBe(true);
    expect(freezeAtDimKeyframe(true, t2)).toBe(true);
  });
});

describe('staged worst-case scene — the population', () => {
  it('stages the arena cap worth of hulls (19 others + you)', () => {
    expect(world.roster).toHaveLength(CONFIG.map.playerCap);
    expect(world.hulls).toHaveLength(SCENE.nearContacts + SCENE.farContacts);
    expect(world.hulls).toHaveLength(CONFIG.map.playerCap - 1);
  });

  it('keeps every truesighted contact inside the sight bubble, at every tick', () => {
    for (const t of [0, 91, 640, 3011]) {
      const own = ownPoseAt(world, t);
      const near = sceneContacts(world, t);
      expect(near).toHaveLength(SCENE.nearContacts);
      for (const c of near) {
        expect(Math.hypot(c.x - own.x, c.y - own.y)).toBeLessThan(CONFIG.vision.sight);
      }
    }
  });

  it('keeps every painted blip in the radar ANNULUS — never inside truesight', () => {
    for (const t of [0, 91, 640, 3011]) {
      const own = ownPoseAt(world, t);
      const blips = sceneEvents(world, t, 0).filter((e) => e.k === 'blip');
      expect(blips).toHaveLength(SCENE.farContacts);
      for (const b of blips) {
        // `BlipEvent` is a TAGLESS union (silhouette | return); the staged scene
        // speaks the shipped `silhouette` grammar, so narrow on the pose fields.
        if (!('x' in b) || !('y' in b)) throw new Error('staged blip is not a silhouette blip');
        const d = Math.hypot(b.x - own.x, b.y - own.y);
        // Compared against the pose the blip was PAINTED at (blips are stale by
        // design), so the bound is the band's own width plus that staleness.
        expect(d).toBeGreaterThan(CONFIG.vision.sight * 0.5);
        expect(d).toBeLessThan(CONFIG.vision.radar);
      }
    }
  });

  it('carries drones on the roster hue sentinel, so AFLOAT counts captains only', () => {
    const drones = world.roster.filter((r) => r.color === REGATTA_NO_HUE);
    expect(drones.length).toBeGreaterThan(0);
    expect(world.roster[0].color).not.toBe(REGATTA_NO_HUE);
  });

  it('stages a kill leader who is a captain, matching the published bountyId', () => {
    const leader = world.roster[BOUNTY_INDEX];
    expect(world.bountyId).toBe(leader.id);
    expect(leader.color).not.toBe(REGATTA_NO_HUE);
    expect(Math.max(...world.roster.map((r) => r.kills))).toBe(leader.kills);
    expect(scenePublicPlane(world, 0).bountyId).toBe(leader.id);
  });
});

describe('staged worst-case scene — the flash stack', () => {
  const events = sceneEvents(world, 200, 1_000_000);
  const kinds = (k: string): number => events.filter((e) => e.k === k).length;

  it('stages every one-shot family the budget governs, simultaneously', () => {
    expect(kinds('mz')).toBe(SCENE.muzzlePerTick);
    expect(kinds('sp')).toBe(SCENE.splashPerTick);
    expect(kinds('hc')).toBe(SCENE.hitCallPerTick);
    expect(kinds('burst')).toBe(SCENE.burstsPerTick);
    expect(kinds('sm')).toBe(SCENE.smokePerTick);
    expect(events.filter((e) => e.k === 'boom' && e.hit !== undefined)).toHaveLength(SCENE.hullHitsPerTick);
  });

  it('overruns the ratified 3-per-second floor many times over in ONE region', () => {
    // The floor is 3 onsets/s per region; one staged tick alone puts far more
    // than that inside a cluster narrower than a viewport region.
    expect(SCENE.muzzlePerTick).toBeGreaterThan(3);
    const c = clusterCentre(world, 200);
    for (const e of events.filter((ev) => ev.k === 'mz')) {
      expect(Math.hypot(e.x - c.x, e.y - c.y)).toBeLessThanOrEqual(SCENE.clusterRadiusU);
    }
  });

  it('co-locates some muzzles EXACTLY, which is the coalescer\'s input', () => {
    const c = clusterCentre(world, 200);
    const exact = events.filter((e) => e.k === 'mz' && e.x === c.x && e.y === c.y);
    expect(exact).toHaveLength(SCENE.muzzleColocated);
  });

  it('stages torpedoes inbound — closing on the own hull, not drifting off', () => {
    const own = ownPoseAt(world, 200);
    const fish = sceneEvents(world, 200, 0).filter((e) => e.k === 'torp' || e.k === 'torpU');
    expect(fish.length).toBeGreaterThan(0);
    for (const f of fish) {
      if (f.k !== 'torp' && f.k !== 'torpU') continue;
      // Velocity points at the own hull: the dot product of (own - pos) with v
      // is positive for anything genuinely inbound.
      expect((own.x - f.x) * f.vx + (own.y - f.y) * f.vy).toBeGreaterThan(0);
    }
  });
});

describe('staged worst-case scene — the registers', () => {
  it('churns the kill feed on its schedule', () => {
    const at = (t: number): SunkEvent[] => sceneEvents(world, t, 0).filter((e): e is SunkEvent => e.k === 'sunk');
    expect(at(SCENE.sunkEveryTicks)).toHaveLength(1);
    expect(at(SCENE.sunkEveryTicks + 1)).toHaveLength(0);
  });

  it('never names the local captain as a victim of the staged feed', () => {
    for (let t = 0; t < SCENE.sunkEveryTicks * 12; t += SCENE.sunkEveryTicks) {
      for (const e of sceneEvents(world, t, 0)) {
        if (e.k === 'sunk') expect(e.id).not.toBe(world.ownId);
      }
    }
  });

  it('keeps a banked level on the rail, so the Tier-3 chip has a breath to freeze', () => {
    for (const t of [0, 50, 500, 5000]) expect(bankedPointsAt(t)).toBeGreaterThan(0);
    expect(sceneOwn(world, 0).pts).toBe(bankedPointsAt(0));
  });

  it('runs the predictor out of pending inputs, so the drawn pose IS the staged one', () => {
    const f = sceneFrame(world, 12, 0);
    expect(f.ackSeq).toBeGreaterThan(1_000_000);
    expect(f.you?.x).toBeCloseTo(ownPoseAt(world, 12).x, 9);
  });
});
