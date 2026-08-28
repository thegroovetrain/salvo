// THE RL ENVIRONMENT (scaffold, 2026-08-24) — a gym-style wrapper over the
// authoritative sim, built on the batch-sim runner's exact construction
// (World + Match direct, no sockets, dev timings).
//
// AGENTS ARE CAPTAINS. Each RL agent is an ordinary `role: 'captain'` hull
// driven through `world.submitInput` — the same validated path a human client
// uses — and observed through `perception.observe`, the same fogged boundary
// a human client is served. No ai/ code is involved and nothing here can see
// more than a player could. Opponents (curriculum) are ordinary combat bots;
// self-play is simply agents = 20, bots = 0.
//
// SPENDS ARE RANDOMIZED BY THE ENV (domain randomization over builds): the
// policy must learn to fight with whatever it is dealt, which is what makes a
// trained agent double as the randomized-assignment measurement design's
// high-skill instance. A simple env-side heal rule (hp < 40%) mirrors the
// profile default so agents don't bleed out holding banked levels.
//
// REWARD IS EMITTED AS COMPONENTS, never combined here: [dmgDealt Δ, hpLost Δ,
// kills Δ, alive, win]. The learner owns the weights, so reward-shaping
// iteration never touches TS.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  HEAL_CHOICE,
  mulberry32,
  zoneClosedAtMs,
  zoneGroups,
  type Rng,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../../src/game/world.js';
import { Match, type MatchTimings } from '../../src/game/match.js';
import { observe } from '../../src/game/perception.js';
import { applyOverrides } from '../batchsim/overrides.js';
import { mixSeed } from '../batchsim/stats.js';
import { FEATURE_DIM, featurize, foldBlips, type BlipMark } from './features.js';

export const DEFAULT_DECISION_TICKS = 5; // 250ms between decisions
const COUNTDOWN_MS = 1000;
const ENDGAME_SLACK_MS = 600000;
const ZONE_SEED_ORDINAL = 0x7a0e;
const SPEND_STREAM_K = 0x51ed;

/** Integer action bins, decoded server-side (see decode()). */
export interface AgentAction {
  rudder: number; // 0..4
  throttle: number; // 0..4
  fire: number; // 0|1
  bearing: number; // 0..15 (relative to own heading)
  range: number; // 0..7 (fraction of gun reach)
  slot: number; // 0..3
  boost: number; // 0|1 (activates the first non-weapon slot, if any)
}

export const ACTION_BINS = Object.freeze({ rudder: 5, throttle: 5, fire: 2, bearing: 16, range: 8, slot: 4, boost: 2 });

const RUDDER = [-1, -0.5, 0, 0.5, 1];
const THROTTLE = [-0.5, 0, 0.35, 0.7, 1];

/** Reward components per agent per step — combined learner-side. */
export const REWARD_COMPONENTS = Object.freeze(['dmgDealt', 'hpLost', 'kills', 'alive', 'win'] as const);

export interface ResetOptions {
  seed: number;
  agents: number; // RL captains (>= 1)
  bots?: number; // scripted opponents (default 0)
  agentHulls?: ShipClassId[]; // per-agent hulls; default round-robin
  set?: Record<string, number>; // CONFIG overrides (batchsim tunable dials)
  tune?: Record<string, number>; // equipment overrides (HC_BALANCE gated upstream)
  decisionTicks?: number;
}

export interface StepResult {
  obs: Float32Array[];
  rewards: number[][]; // [agent][component]
  done: boolean;
  /** Present when done: 1-based placement per agent (null = none computed). */
  placements?: (number | null)[];
}

interface AgentState {
  id: string;
  seq: number;
  fireSeq: number;
  actSeq: number;
  blips: BlipMark[];
  spendRng: Rng;
  prevDamageDealt: number;
  prevHp: number;
  prevKills: number;
}

const HULLS: readonly ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];

export class HullcrackerEnv {
  private world: World | null = null;
  private match: Match | null = null;
  private agents: AgentState[] = [];
  private restore: (() => void) | null = null;
  private decisionTicks = DEFAULT_DECISION_TICKS;
  private tick = 0;
  private tickCap = 0;

  reset(opts: ResetOptions): Float32Array[] {
    this.close();
    this.restore = applyOverrides(opts.set ?? {}, opts.tune ?? {});
    this.decisionTicks = Math.max(1, opts.decisionTicks ?? DEFAULT_DECISION_TICKS);
    const seed = opts.seed >>> 0;
    const botCount = opts.bots ?? 0;
    const playerCap = Math.max(CONFIG.map.playerCap, opts.agents + botCount);
    const zoneSeeds = Array.from({ length: zoneGroups(CONFIG.zone) }, (_, i) => mixSeed(seed, ZONE_SEED_ORDINAL + i));
    const world = new World(seed, playerCap, CONFIG.zone, { zoneSeeds });
    const timings: MatchTimings = {
      countdownMs: COUNTDOWN_MS,
      resultsMs: CONFIG.match.resultsSeconds * 1000,
      joinWindowMs: 0,
      minHumans: 1,
    };
    const match = new Match(world, timings, {
      lock: () => {},
      unlock: () => {},
      broadcastResults: () => {},
      requeue: () => {},
      disconnect: () => {},
    });
    this.agents = enrollAgents(world, seed, opts);
    for (let i = 0; i < botCount; i += 1) world.addBot();
    match.notifyRosterChanged();
    this.world = world;
    this.match = match;
    this.tick = 0;
    this.tickCap = Math.ceil((COUNTDOWN_MS + zoneClosedAtMs(CONFIG.zone) + ENDGAME_SLACK_MS) / CONFIG.tick.simDtMs);
    // Run the countdown out so the first decision lands in the live phase.
    while (match.phase !== 'active' && this.tick < this.tickCap) {
      world.step();
      match.update();
      this.tick += 1;
    }
    return this.observations();
  }

  /** Advance one decision: apply every agent's action, run decisionTicks sim
   *  ticks, return fresh observations + reward components. */
  step(actions: readonly AgentAction[]): StepResult {
    const world = this.world;
    const match = this.match;
    if (world === null || match === null) throw new Error('step before reset');
    for (let i = 0; i < this.agents.length; i += 1) {
      const agent = this.agents[i];
      const action = actions[i];
      if (action !== undefined) this.applyAction(world, agent, action);
    }
    let done = false;
    for (let t = 0; t < this.decisionTicks; t += 1) {
      world.step();
      match.update();
      this.tick += 1;
      for (const a of this.agents) foldBlips(a.blips, observe(world, a.id).events, world.now);
      this.autoSpend(world);
      if (match.phase === 'finished' || this.tick >= this.tickCap) {
        done = true;
        break;
      }
    }
    const result: StepResult = { obs: this.observations(), rewards: this.rewards(done), done };
    if (done) result.placements = this.agents.map((a) => match.placements.get(a.id) ?? null);
    return result;
  }

  close(): void {
    this.restore?.();
    this.restore = null;
    this.world = null;
    this.match = null;
    this.agents = [];
  }

  private applyAction(world: World, agent: AgentState, action: AgentAction): void {
    const me = world.ships.get(agent.id);
    if (me === undefined) return;
    agent.seq += 1;
    if (action.fire === 1) agent.fireSeq += 1;
    const boostSlot = action.boost === 1 ? nonWeaponSlot(me) : -1;
    if (boostSlot >= 0) agent.actSeq += 1;
    const bearing = me.state.heading + (action.bearing / ACTION_BINS.bearing) * Math.PI * 2;
    const reach = me.stats.gun.rangeU;
    world.submitInput(agent.id, {
      seq: agent.seq,
      throttle: THROTTLE[action.throttle] ?? 0,
      rudder: RUDDER[action.rudder] ?? 0,
      aim: bearing,
      fireSeq: agent.fireSeq,
      aimDist: ((action.range + 1) / ACTION_BINS.range) * reach,
      slot: action.slot >= 0 && action.slot < 4 ? action.slot : 0,
      fireT: 0,
      actSeq: agent.actSeq,
      actSlot: boostSlot >= 0 ? boostSlot : 0,
      hornSeq: 0,
    });
  }

  /** Randomized build assignment (see module header): heal under 40%, else a
   *  uniform card off the front offer. One spend per agent per tick, exactly
   *  the public path a SpendMsg lands on. */
  private autoSpend(world: World): void {
    for (const agent of this.agents) {
      const me = world.ships.get(agent.id);
      if (me === undefined || me.bankedLevels <= 0) continue;
      if (me.stats.maxHp > 0 && me.hp / me.stats.maxHp < 0.4) {
        world.spendPoint(agent.id, HEAL_CHOICE);
        continue;
      }
      const offer = me.offer;
      if (offer === null || offer.length === 0) continue;
      world.spendPoint(agent.id, agent.spendRng.int(0, offer.length - 1));
    }
  }

  private observations(): Float32Array[] {
    const world = this.world!;
    const match = this.match!;
    const elapsedMs = match.activatedAt > 0 ? world.now - match.activatedAt : 0;
    return this.agents.map((agent) => {
      const me = world.ships.get(agent.id);
      if (me === undefined) return new Float32Array(FEATURE_DIM);
      return featurize(world, me, {
        view: observe(world, agent.id),
        blipMarks: agent.blips,
        now: world.now,
        elapsedMs,
        cur: ringOf(world.zoneLiveRing),
        next: ringOf(world.zoneRevealedNextRing),
      });
    });
  }

  private rewards(done: boolean): number[][] {
    const world = this.world!;
    const match = this.match!;
    return this.agents.map((agent) => {
      const me = world.ships.get(agent.id);
      if (me === undefined) return [0, 0, 0, 0, 0];
      const dmg = me.damageDealt - agent.prevDamageDealt;
      const hpLost = Math.max(0, agent.prevHp - me.hp);
      const kills = me.kills - agent.prevKills;
      agent.prevDamageDealt = me.damageDealt;
      agent.prevHp = me.hp;
      agent.prevKills = me.kills;
      const alive = me.hp > 0 ? 1 : 0;
      const win = done && match.placements.get(agent.id) === 1 ? 1 : 0;
      return [dmg, hpLost, kills, alive, win];
    });
  }
}

/** RL captains: ordinary role='captain' hulls on the human input path. */
function enrollAgents(world: World, seed: number, opts: ResetOptions): AgentState[] {
  const agents: AgentState[] = [];
  for (let i = 0; i < opts.agents; i += 1) {
    const id = `rl-${i + 1}`;
    const hull = opts.agentHulls?.[i] ?? HULLS[i % HULLS.length];
    world.addShip(id, `RL-${String(i + 1).padStart(2, '0')}`, 'captain', hull);
    agents.push({
      id,
      seq: 0,
      fireSeq: 0,
      actSeq: 0,
      blips: [],
      spendRng: mulberry32((seed + (i + 1) * SPEND_STREAM_K) >>> 0),
      prevDamageDealt: 0,
      prevHp: world.ships.get(id)!.hp,
      prevKills: 0,
    });
  }
  return agents;
}

function ringOf(ring: { cx: number; cy: number; r: number } | null): { cx: number; cy: number; r: number } | null {
  return ring === null ? null : { cx: ring.cx, cy: ring.cy, r: ring.r };
}

/** The first fitted non-weapon slot (the speed boost's shape), or -1. */
function nonWeaponSlot(me: ShipRecord): number {
  for (let i = 0; i < me.loadout.length; i += 1) {
    const id = me.loadout[i]?.equipmentId;
    if (id !== null && id !== undefined && !EQUIPMENT_IS_WEAPON[id]) return i;
  }
  return -1;
}
