// Regression pins for MACHINE-GUN bot gunnery (cycle 165, spec-bot-radar-plots-lead-and-wake).
// A pinned MG duelist at the origin faces a target on a scripted path in empty
// water. We measure what the real bot achieves: hit rate (hp lost / MG tier-I
// damage, per MG shell fired), "ghost-aim" ticks (the bot's chosen track sits
// far from the target's TRUE position) and the number of distinct tracks held.
// Deterministic: fixed seed, scripted target, no randomness in the harness.

import { describe, it, expect } from 'vitest';
import { World, type ShipRecord } from '../game/world.js';
import type { BotMind } from '../game/ai/types.js';
import { predictedPos } from '../game/ai/plot.js';

const TICKS = 1200;
const DT = 0.05;
const SPEED = 45;
const GHOST_U = 60;

interface Pose {
  heading: number;
  speed: number;
}

interface Scenario {
  /** Place the target for tick `t` (mutates x/y); returns its heading and speed. */
  place: (t: number, tgt: ShipRecord) => Pose;
}

interface Acc {
  targeted: number;
  ghost: number;
  maxTracks: number;
}

interface Result {
  shells: number;
  hits: number;
  hitRate: number;
  targeted: number;
  ghost: number;
  ghostFrac: number;
  maxTracks: number;
}

interface Rig {
  w: World;
  bot: ShipRecord;
  tgt: ShipRecord;
  minds: Map<string, BotMind>;
  seq: number;
}

function buildRig(start: { x: number; y: number }): Rig {
  const w = new World(9101, 4);
  w.map.islands.length = 0;
  const bot = w.addBot('torpedoBoat', 'duelist', 'machineGun');
  bot.state.x = 0;
  bot.state.y = 0;
  bot.prevPose = { ...bot.state };
  const tgt = w.addShip('tgt', 'TGT', 'captain', 'torpedoBoat', undefined, start);
  const minds = (w.bots as unknown as { minds: Map<string, BotMind> }).minds;
  return { w, bot, tgt, minds, seq: 0 };
}

/** Pin the bot in place (heading stays free) and re-seat the target. */
function reseat(rig: Rig, pose: Pose): void {
  const { bot, tgt } = rig;
  bot.state.x = 0;
  bot.state.y = 0;
  bot.state.speed = 0;
  tgt.state.heading = pose.heading;
  tgt.state.speed = pose.speed;
  tgt.prevPose = { ...tgt.state };
  tgt.hp = tgt.stats.maxHp;
}

function pushTargetInput(rig: Rig, throttle: number): void {
  rig.seq += 1;
  rig.w.submitInput('tgt', {
    seq: rig.seq, throttle, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0,
    fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false,
  });
}

/** Per tick: distinct tracks held, and whether the chosen track is a ghost. */
function observeMind(rig: Rig, acc: Acc): void {
  const mind = rig.minds.get(rig.bot.id);
  if (!mind) return;
  acc.maxTracks = Math.max(acc.maxTracks, mind.contacts.size);
  if (mind.targetKey === null) return;
  const c = mind.contacts.get(mind.targetKey);
  if (!c) return;
  acc.targeted += 1;
  // Ghost = the PREDICTED position (not the raw last paint) is far from the truth.
  const p = predictedPos(c, rig.w.now);
  if (Math.hypot(p.x - rig.tgt.state.x, p.y - rig.tgt.state.y) > GHOST_U) acc.ghost += 1;
}

interface Miss {
  along: number;
  lat: number;
}
type Flight = { x: number; y: number; vx: number; vy: number; distLeft: number };

/** Remember every live MG shell's last pose; return the ones that vanished this tick. */
function vanishedShells(rig: Rig, flying: Map<string, Flight>): Flight[] {
  const gone: Flight[] = [];
  for (const [id, f] of flying) {
    if (!rig.w.shells.has(id)) {
      gone.push(f);
      flying.delete(id);
    }
  }
  for (const [id, s] of rig.w.shells) {
    const mg = (s as unknown as { family?: string }).family === 'mg' && s.ownerId === rig.bot.id;
    if (mg) flying.set(id, { x: s.x, y: s.y, vx: s.vx, vy: s.vy, distLeft: s.distLeft });
  }
  return gone;
}

/** Miss decomposition vs the target's true position: along the bot->target line
 *  (positive = past the target) and lateral. A shell's expiry is its last seen
 *  pose advanced one step (capped by distLeft). Of the shells that vanished on a
 *  tick that cost the target hp, the nearest `hitN` are the hits. */
function recordMisses(rig: Rig, gone: Flight[], hitN: number, out: Miss[]): void {
  const tx = rig.tgt.state.x;
  const ty = rig.tgt.state.y;
  const d = Math.hypot(tx, ty) || 1;
  const ux = tx / d;
  const uy = ty / d;
  const ends = gone.map((f) => {
    const sp = Math.hypot(f.vx, f.vy) || 1;
    const k = Math.min(sp * DT, f.distLeft) / sp;
    return { x: f.x + f.vx * k - tx, y: f.y + f.vy * k - ty };
  });
  ends.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  for (const e of ends.slice(hitN)) out.push({ along: e.x * ux + e.y * uy, lat: e.x * -uy + e.y * ux });
}

function missSummary(m: Miss[]): string {
  if (m.length === 0) return 'misses=0';
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
  const al = m.map((e) => e.along);
  const la = m.map((e) => Math.abs(e.lat));
  const short = m.filter((e) => e.along < 0).length;
  const lateral = m.filter((e) => Math.abs(e.lat) > 4.5).length; // half the 9 u beam
  return `misses=${m.length} along mean=${mean(al).toFixed(1)} max=${Math.max(...al).toFixed(1)} min=${Math.min(...al).toFixed(1)} ` +
    `|lat| mean=${mean(la).toFixed(1)} max=${Math.max(...la).toFixed(1)} short=${short} lateral(>4.5u)=${lateral}`;
}

function countNewMgShells(rig: Rig, seen: Set<string>): number {
  let n = 0;
  for (const [id, s] of rig.w.shells) {
    if (seen.has(id)) continue;
    seen.add(id);
    if ((s as unknown as { family?: string }).family === 'mg' && s.ownerId === rig.bot.id) n += 1;
  }
  return n;
}

function run(start: { x: number; y: number }, sc: Scenario, label: string, decompose = false): Result {
  const rig = buildRig(start);
  const dmg = rig.bot.stats.equipment.machineGun.damage;
  const seen = new Set<string>();
  const acc: Acc = { targeted: 0, ghost: 0, maxTracks: 0 };
  let shells = 0;
  let lost = 0;
  const flying = new Map<string, Flight>();
  const misses: Miss[] = [];
  for (let t = 0; t < TICKS; t += 1) {
    reseat(rig, sc.place(t, rig.tgt));
    pushTargetInput(rig, 1);
    rig.w.step();
    const tickLoss = rig.tgt.stats.maxHp - rig.tgt.hp;
    lost += tickLoss;
    recordMisses(rig, vanishedShells(rig, flying), Math.round(tickLoss / dmg), misses);
    shells += countNewMgShells(rig, seen);
    observeMind(rig, acc);
  }
  const hits = lost / dmg;
  const r: Result = {
    shells, hits, hitRate: shells > 0 ? hits / shells : 0, targeted: acc.targeted,
    ghost: acc.ghost, ghostFrac: acc.targeted > 0 ? acc.ghost / acc.targeted : 0, maxTracks: acc.maxTracks,
  };
  console.log(`[botGunnery ${label}] shells=${r.shells} hits=${r.hits.toFixed(1)} hitRate=${(r.hitRate * 100).toFixed(1)}% ` +
    `targeted=${r.targeted} ghost=${r.ghost} (${(r.ghostFrac * 100).toFixed(1)}%) maxTracks=${r.maxTracks}`);
  if (decompose) console.log(`[botGunnery ${label} decomposition] ${missSummary(misses)}`);
  return r;
}

function orbit(radius: number): Scenario {
  let theta = 0;
  return {
    place: (_t, tgt) => {
      theta += (SPEED * DT) / radius;
      tgt.state.x = Math.cos(theta) * radius;
      tgt.state.y = Math.sin(theta) * radius;
      return { heading: theta + Math.PI / 2, speed: SPEED };
    },
  };
}

function parked(x: number, y: number, heading = 0): Scenario {
  return {
    place: (_t, tgt) => {
      tgt.state.x = x;
      tgt.state.y = y;
      return { heading, speed: 0 };
    },
  };
}

function straight(): Scenario {
  let y = -300;
  let dir = 1;
  return {
    place: (_t, tgt) => {
      y += dir * SPEED * DT;
      if (Math.hypot(500, y) > 600) dir = -dir; // turn around: never a jump
      tgt.state.x = 500;
      tgt.state.y = y;
      return { heading: (dir * Math.PI) / 2, speed: SPEED };
    },
  };
}

/** S5: parked at (500,0) for 400 ticks, then gone to (-500,0). Returns the
 *  ticks after the jump the bot's mind still held a contact near the old spot. */
function sweepMissLag(): number {
  const rig = buildRig({ x: 500, y: 0 });
  let lag = 0;
  for (let t = 0; t < 1000; t += 1) {
    const gone = t >= 400;
    rig.tgt.state.x = gone ? -500 : 500;
    rig.tgt.state.y = 0;
    reseat(rig, { heading: 0, speed: 0 });
    rig.w.step();
    const mind = rig.minds.get(rig.bot.id);
    if (gone && mind && [...mind.contacts.values()].some((c) => Math.hypot(c.x - 500, c.y) < 100)) lag += 1;
  }
  return lag;
}

describe('machine-gun bot gunnery (probe scenarios as pins)', () => {
  it('S1 SIGHT: orbit at 250 u inside the bubble hits every shell', () => {
    const r = run({ x: 250, y: 0 }, orbit(250), 'S1 sight orbit 250');
    expect(r.shells).toBeGreaterThan(0);
    // Measured 100 %: a true-sight contact is exact, so the lead must be too.
    expect(r.hitRate).toBeGreaterThanOrEqual(0.99);
  });

  it('S2 RADAR MOVING: orbit at 500 u (radar only)', () => {
    const r = run({ x: 500, y: 0 }, orbit(500), 'S2 radar orbit 500');
    // Measured ~84 % after the estimator fixes; the margin covers the chord bias
    // of a straight-line lead on a curved course.
    expect(r.hitRate).toBeGreaterThanOrEqual(0.7);
    expect(r.ghostFrac).toBeLessThan(0.25);
    expect(r.maxTracks).toBeLessThanOrEqual(2);
  });

  it('S3 RADAR PARKED END-ON: a parked target at 500 u, bow pointing away', () => {
    const r = run({ x: 500, y: 0 }, parked(500, 0), 'S3 radar parked 500 end-on', true);
    // Measured 59-64 %, bounded by geometry: the bot's aim scatter is a ~12 u disc
    // at 500 u against a 9 u-wide end-on torpedo boat. Scatter is the competence
    // knob (Eric's), not the estimator's, so this bar is not raised.
    expect(r.hitRate).toBeGreaterThanOrEqual(0.5);
    expect(r.maxTracks).toBeLessThanOrEqual(2);
  });

  it('S3b RADAR PARKED BEAM-ON: same target broadside to the shooter', () => {
    const r = run({ x: 500, y: 0 }, parked(500, 0, Math.PI / 2), 'S3b radar parked 500 beam-on', true);
    // Measured 100 %: a 100 u long silhouette swallows the same scatter disc.
    expect(r.hitRate).toBeGreaterThanOrEqual(0.95);
  });

  it('S4 RADAR STRAIGHT: a runner on x = 500 that turns around at 600 u', () => {
    const r = run({ x: 500, y: -300 }, straight(), 'S4 radar straight x=500');
    // Measured ~97 %; a constant-velocity lead on a straight course is near exact.
    expect(r.hitRate).toBeGreaterThanOrEqual(0.8);
    expect(r.ghostFrac).toBeLessThan(0.25);
    expect(r.maxTracks).toBeLessThanOrEqual(2);
  });

  it('S5 SWEEP-MISS: a vanished target\'s plot is gone within 4 ticks', () => {
    const lag = sweepMissLag();
    console.log(`[botGunnery S5 sweep-miss] ticks holding a contact near the old spot after the jump = ${lag}`);
    // Measured 2 (the two-tick grace after the beam passes the old spot).
    expect(lag).toBeLessThanOrEqual(4);
  });
});
