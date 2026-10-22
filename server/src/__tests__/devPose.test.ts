// THE DEV DOOR'S TWO SCRIPTED-SCENARIO ARMS, at the World (Story 9.15):
//   • the DEV SPAWN POSE — a captain's placement honoured at EVERY placement
//     edge it crosses (addShip, the countdown→active redeploy, respawn), and a
//     placement only: hp is the redeploy's/respawn's to restore, never the pose's;
//   • the FLEET-WAVES SWITCH — `WorldOptions.fleetWaves: false` turns the PvE
//     wave scheduler off, and nothing else.
// The room-side gate (dev-only, value-sanitized) is pinned in roomOptions.test.ts.

import { describe, it, expect, vi } from 'vitest';
import { CONFIG, DEFAULT_GUN, DEFAULT_HORN_ID, wrapAngle } from '@salvo/shared';
import { World, type DevPose, type WorldOptions } from '../game/world.js';
import { islandClearance, SPAWN_ISLAND_CLEARANCE } from '../game/spawn.js';

const DT = CONFIG.tick.simDtMs;

/** A World on open water (the drones.test bareWorld recipe) so a posed hull
 *  never meets land between its placement and the assertion. */
function openWorld(seed: number, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

/** A pose well off the spawn ring, facing neither the centre nor away from it. */
function offRingPose(w: World): DevPose {
  const r = w.map.spawnRing / 3;
  return { x: r, y: -r / 2, heading: 0.75 };
}

function posedCaptain(w: World, id: string, pose: DevPose) {
  return w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', DEFAULT_HORN_ID, undefined, DEFAULT_GUN, [], pose);
}

function expectAtPose(rec: { state: { x: number; y: number; heading: number } }, pose: DevPose): void {
  expect(rec.state.x).toBe(pose.x);
  expect(rec.state.y).toBe(pose.y);
  expect(wrapAngle(rec.state.heading)).toBeCloseTo(pose.heading, 12);
}

describe('dev spawn pose — a captain placed at its pose at every placement edge', () => {
  it('a captain added with a pose sits at that pose with that heading', () => {
    const w = openWorld(31);
    const pose = offRingPose(w);
    const rec = posedCaptain(w, 'a', pose);
    expectAtPose(rec, pose);
    expect(rec.state.speed).toBe(0);
    expect(rec.hp).toBe(rec.stats.maxHp);
  });

  it('the countdown→active redeploy puts a posed captain back at its pose, at full hp', () => {
    const w = openWorld(32);
    const pose = offRingPose(w);
    const rec = posedCaptain(w, 'a', pose);
    // The ready room: the hull sailed somewhere else and took damage.
    rec.state.x += 400;
    rec.state.y -= 250;
    rec.state.heading = -2;
    rec.hp = Math.floor(rec.stats.maxHp / 2);
    w.resetForMatchStart();
    expectAtPose(rec, pose);
    expect(rec.state.speed).toBe(0);
    expect(rec.hp).toBe(rec.stats.maxHp);
  });

  it('a respawn brings a posed captain back at its pose', () => {
    const w = openWorld(33);
    const pose = offRingPose(w);
    const rec = posedCaptain(w, 'a', pose);
    rec.state.x += 300;
    w.sinkShip('a', 'b');
    // The revive lands on the founder tick (world.test's respawn recipe).
    for (let t = 0; t < CONFIG.ship.sinkingWindowMs / DT; t++) w.step();
    expect(rec.respawnAt).toBe(0);
    expectAtPose(rec, pose);
    expect(rec.hp).toBe(rec.stats.maxHp);
  });

  it('a hull without a pose still goes through pickSpawn — on the spawn ring, at both edges', () => {
    const w = openWorld(34);
    const pose = offRingPose(w);
    posedCaptain(w, 'a', pose);
    const b = w.addShip('b', 'BRAVO', 'captain', 'torpedoBoat', DEFAULT_HORN_ID, undefined);
    expect(b.devPose).toBeUndefined();
    expect(Math.hypot(b.state.x, b.state.y)).toBeCloseTo(w.map.spawnRing, 6);
    w.resetForMatchStart();
    expect(Math.hypot(b.state.x, b.state.y)).toBeCloseTo(w.map.spawnRing, 6);
    expect(b.state.heading).toBeCloseTo(Math.atan2(-b.state.y, -b.state.x), 12);
  });

  it('the pose is a CAPTAIN arm only — a bot handed one spawns by pickSpawn', () => {
    const w = openWorld(35);
    const pose = offRingPose(w);
    const bot = w.addShip('bot-1', 'BOT', 'bot', 'torpedoBoat', DEFAULT_HORN_ID, undefined, DEFAULT_GUN, [], pose);
    expect(bot.devPose).toBeUndefined();
    expect(Math.hypot(bot.state.x, bot.state.y)).toBeCloseTo(w.map.spawnRing, 6);
  });
});

describe('dev spawn pose — an invalid pose is rejected at the World, logged, and the hull takes the spawn ring', () => {
  /** Run `body` with console.log captured; returns the dev.poseRejected lines. */
  function rejections(body: () => void): string[] {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      body();
      return log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('dev.poseRejected'));
    } finally {
      log.mockRestore();
    }
  }

  function expectOnClearRing(w: World, rec: { state: { x: number; y: number; heading: number } }): void {
    expect(Math.hypot(rec.state.x, rec.state.y)).toBeCloseTo(w.map.spawnRing, 6);
    expect(rec.state.heading).toBeCloseTo(Math.atan2(-rec.state.y, -rec.state.x), 12);
    expect(islandClearance(rec.state, w.map.islands)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
  }

  it('a pose on an island of the generated map falls back to an island-clear spawn-ring point and logs dev.poseRejected once', () => {
    const w = new World(51, CONFIG.map.playerCap, CONFIG.zone);
    const isle = w.map.islands[0];
    expect(isle, 'the generated map has an island').toBeDefined();
    const pose: DevPose = { x: isle.pole.x, y: isle.pole.y, heading: 0.5 };
    let rec!: ReturnType<typeof posedCaptain>;
    const lines = rejections(() => {
      rec = posedCaptain(w, 'a', pose);
    });
    expectOnClearRing(w, rec);
    expect(rec.landContact).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"id":"a"');
  });

  it("a pose past the water's edge falls back to the spawn ring and logs, at the redeploy edge too", () => {
    const w = openWorld(52);
    const pose: DevPose = { x: w.map.radius, y: 0, heading: 0 };
    let rec!: ReturnType<typeof posedCaptain>;
    const atAdd = rejections(() => {
      rec = posedCaptain(w, 'a', pose);
    });
    expectOnClearRing(w, rec);
    expect(atAdd).toHaveLength(1);
    const atRedeploy = rejections(() => w.resetForMatchStart());
    expectOnClearRing(w, rec);
    expect(atRedeploy).toHaveLength(1);
  });

  it('a valid pose is honoured exactly and logs nothing', () => {
    const w = openWorld(53);
    const pose = offRingPose(w);
    let rec!: ReturnType<typeof posedCaptain>;
    const lines = rejections(() => {
      rec = posedCaptain(w, 'a', pose);
    });
    expectAtPose(rec, pose);
    expect(lines).toHaveLength(0);
  });
});

describe('fleetWaves switch — false keeps the PvE wave scheduler out of the world', () => {
  const hasFleetHull = (w: World): boolean => [...w.ships.keys()].some((id) => id.startsWith('fleet-'));

  /** Anchor the zone so the first beat has passed, then run a few live ticks. */
  function runPastFirstBeat(w: World): void {
    w.damageEnabled = true;
    w.startZone(w.now - CONFIG.fleet.waves[0].atMs);
    for (let t = 0; t < 5; t++) w.step();
  }

  it('fleetWaves: false — no fleet hull exists past the first beat', () => {
    const w = openWorld(41, { fleetWaves: false });
    runPastFirstBeat(w);
    expect(hasFleetHull(w)).toBe(false);
  });

  it('the default (switch absent) still spawns the first wave', () => {
    const w = openWorld(41);
    runPastFirstBeat(w);
    expect(hasFleetHull(w)).toBe(true);
  });
});
