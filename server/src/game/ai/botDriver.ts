// COMBAT-BOT CONTROLLER (Story 6.4, wave 1) — the driver for `role: 'bot'`
// ships, and THE PERCEPTION CHOKEPOINT of the whole ai/ module.
//
// A bot is an ORDINARY ship (World.addBot → addShip with role='bot'); it has
// no client. This controller is its hands and its eyes:
//
//   EYES — `perception.observe(world, botId)`, called AT MOST ONCE per bot
//   per tick and on average every CONFIG.bots.observeCadenceMs, on a
//   round-robin staggered by id hash (botPhase) so 19 bots spread ~4
//   observes across each 5-tick window instead of bunching 19 on one tick.
//   observe()'s observer-state mutation (`seenBallistics`/`torpDirs`) is
//   CORRECT here, not a hazard: one call per cadence tick is precisely the
//   human client contract, and the mutation becomes the bot's own
//   exactly-once ballistic reveal memory. That is why "at most one call per
//   bot per tick" is a pinned invariant, not a performance nicety.
//
//   HANDS — one sanitized-shape InputMsg per live bot per tick through
//   World.submitInput (full sanitizeInput, `fireT: 0`, no privileged path),
//   exactly as the fleet AI and every human client write intent. The DECISION
//   behind that input comes from the pluggable BotBrain: wave 1 shipped a
//   neutral stand-in, wave 3 plugged ai/tactics.ts COMBAT_BRAIN behind the
//   same seam without touching the cadence, the port, the state lifecycle or
//   the emission — the frozen-helm path still bypasses the brain entirely.
//
// THE ONE EXCEPTION to "the driver only ever sees BotWorldPort": observe()'s
// signature takes the real World, so the constructor keeps a SECOND reference
// to the same object under the World type — `perceptionHost` — dereferenced
// at exactly one call site (the observe call) and nowhere else. Every state
// read and intent write goes through `port`. The lint boundary keeps World a
// type-only import for this directory, so the host reference cannot grow new
// uses without a reviewable widening of the port.

import { CONFIG, SHIP_CLASS_IDS, isAfloat, mulberry32, type InputMsg, type Rng, type ShipClassId } from '@salvo/shared';
import { observe } from '../perception.js';
import type { ShipRecord, World } from '../world.js';
import { COMBAT_BRAIN } from './tactics.js';
import type { BotBrain, BotDecision, BotMind, BotProfileId, BotWorldPort } from './types.js';

/**
 * The observe-stagger slot for a bot id: FNV-1a over the id, mod the cadence
 * window. Pure and exported so the stagger test can compute the expected
 * per-tick histogram independently. With `bot-1`..`bot-19` at cadence 5 the
 * buckets measure [6,3,4,2,4] — spread, never bunched.
 */
export function botPhase(id: string, cadenceTicks: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % cadenceTicks;
}

/**
 * THE FROZEN-HELM DECISION — a dead helm, quiet guns, nothing spent. This was
 * wave 1's stand-in for the whole brain; wave 3 plugged the real one
 * (ai/tactics.ts COMBAT_BRAIN) and kept this for the ONE seat it still owns:
 * the boarding freeze, where the room is pre-active and there is nothing
 * legitimate to decide. Keeping it as a decision rather than a brain is the
 * point — the freeze must not run tactics at all, not even to discard them.
 */
const FROZEN_DECISION: BotDecision = Object.freeze({
  throttle: 0,
  rudder: 0,
  aim: 0,
  aimDist: 0,
  fireSlot: null,
  actSlot: null,
  spendChoice: null,
});

/**
 * Drives every enrolled bot through the normal input path. Owned by World
 * (constructed beside FleetController on its own decorrelated seed); still
 * zero Colyseus. World calls tick() once per step at the `botsTick` row,
 * immediately before applyInputs, so bot input is consumed the same tick.
 */
export class BotController {
  private readonly minds = new Map<string, BotMind>();
  /** The narrow port — the ONLY view the driver reads world state through. */
  private readonly port: BotWorldPort;
  /** Held SOLELY for perception.observe()'s World-typed parameter — the one
   *  sanctioned dereference. See the file header. */
  private readonly perceptionHost: World;
  /** The controller's own decision stream (enroll rolls: class, profile,
   *  callsign order) — decorrelated from every other world stream. */
  private readonly rng: Rng;
  private readonly seed: number;
  /** The observe round-robin window, in ticks (250ms / 50ms = 5). */
  private readonly cadenceTicks: number;
  /** Controller-local tick counter driving the stagger (self-contained —
   *  the port deliberately exposes no tick number). */
  private tickCount = 0;
  /** observe() calls made during the most recent tick() — the stagger
   *  test's per-tick instrument. */
  private observesLastTickCount = 0;
  /** Callsign draw order: a Fisher-Yates shuffle of the CONFIG pool, fixed at
   *  construction; draws walk it without repeat, suffixing on wrap. */
  private readonly callsignOrder: readonly string[];
  private callsignsDrawn = 0;
  private enrollCounter = 0;
  /** The pluggable brain — the real profile-driven tactics since wave 3. */
  private readonly brain: BotBrain = COMBAT_BRAIN;

  constructor(world: World, seed: number) {
    this.port = world;
    this.perceptionHost = world;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.cadenceTicks = Math.max(1, Math.round(CONFIG.bots.observeCadenceMs / CONFIG.tick.simDtMs));
    this.callsignOrder = shuffled(CONFIG.bots.callsigns, this.rng);
  }

  /** How many bots are currently under control. */
  get size(): number {
    return this.minds.size;
  }

  /** observe() calls made during the most recent tick() (testing/inspection
   *  only — the stagger pin's per-tick reading). */
  get observesLastTick(): number {
    return this.observesLastTickCount;
  }

  /** A bot's stagger slot (testing/inspection only). -1 = unknown id. */
  phaseOf(id: string): number {
    return this.minds.get(id)?.phase ?? -1;
  }

  /** Server ms of a bot's latest observe, -1 = never (testing/inspection). */
  viewAtOf(id: string): number {
    return this.minds.get(id)?.viewAt ?? -1;
  }

  /** A bot's assigned priority profile (testing/inspection only). */
  profileOf(id: string): BotProfileId | null {
    return this.minds.get(id)?.profile ?? null;
  }

  /**
   * Enroll a new bot: roll its class, priority profile and callsign off the
   * controller's seeded stream, create its mind (stagger phase from the id
   * hash), and hand back what World.addBot needs for addShip. The mind's own
   * rng is decorrelated per enrollment (the FleetController idiom).
   */
  enroll(id: string): { name: string; hullId: ShipClassId } {
    this.enrollCounter += 1;
    const hullId = this.rng.pick(SHIP_CLASS_IDS);
    const profile = this.rng.pick(CONFIG.bots.profiles[hullId]);
    const name = this.drawCallsign();
    this.minds.set(id, {
      rng: mulberry32((this.seed + this.enrollCounter * 0x9e3779b9) >>> 0),
      seq: 0,
      fireSeq: 0,
      actSeq: 0,
      hullId,
      profile,
      phase: botPhase(id, this.cadenceTicks),
      view: null,
      viewAt: -1,
      contacts: new Map(),
      stuckMs: 0,
      unbeachUntil: 0,
    });
    return { name, hullId };
  }

  /** Forget a bot (called by World.removeShip). */
  remove(id: string): void {
    this.minds.delete(id);
  }

  /**
   * One controller step (the `botsTick` STEP_ORDER row). Per live bot:
   * observe if due this tick (at most once), then submit exactly one input.
   * A frozen helm (boarding room) skips observe and emits neutral input
   * without ever advancing fireSeq; a non-afloat hull releases its view
   * state and emits nothing (sinking/sunk row of the I/O contract).
   */
  tick(): void {
    this.tickCount += 1;
    this.observesLastTickCount = 0;
    for (const [id, mind] of this.minds) {
      const ship = this.port.ships.get(id);
      if (!ship) {
        this.minds.delete(id);
        continue;
      }
      if (!isAfloat(ship.lifecycle)) {
        // Sinking/sunk: the brain releases its perception state and goes
        // silent — no input at all through the whole window (the fleet
        // controller's dead-hull idiom, plus the view release the spec pins).
        mind.view = null;
        mind.viewAt = -1;
        mind.contacts.clear();
        continue;
      }
      this.driveBot(id, mind, ship);
    }
  }

  /** Observe-if-due + decide + emit for one live bot. */
  private driveBot(id: string, mind: BotMind, ship: ShipRecord): void {
    if (!this.port.helmEnabled) {
      // THE BOARDING FREEZE: no observe (radar is off and the room is
      // pre-active — there is nothing legitimate to learn), neutral input so
      // the seq stream stays warm, fireSeq untouched by construction.
      this.submit(id, mind, FROZEN_DECISION);
      return;
    }
    if ((this.tickCount + mind.phase) % this.cadenceTicks === 0) {
      // THE ONE PERCEPTION CALL in the entire ai/ module — at most once per
      // bot per tick, on the bot's own stagger slot.
      mind.view = observe(this.perceptionHost, id);
      mind.viewAt = this.port.now;
      this.observesLastTickCount += 1;
    }
    this.submit(id, mind, this.brain.decide(ship, mind, this.port));
  }

  /** Fold a decision into one validated InputMsg (and at most one spend). */
  private submit(id: string, mind: BotMind, d: BotDecision): void {
    if (d.fireSlot !== null) mind.fireSeq += 1;
    if (d.actSlot !== null) mind.actSeq += 1;
    mind.seq += 1;
    const msg: InputMsg = {
      seq: mind.seq,
      throttle: d.throttle,
      rudder: d.rudder,
      aim: d.aim,
      fireSeq: mind.fireSeq,
      aimDist: d.aimDist,
      slot: d.fireSlot ?? 0,
      fireT: 0, // no-claim sentinel: a server-driven shooter never back-dates
      actSeq: mind.actSeq,
      actSlot: d.actSlot ?? 0,
      hornSeq: 0, // bots never honk (question-gate B5)
    };
    this.port.submitInput(id, msg);
    if (d.spendChoice !== null) this.port.spendPoint(id, d.spendChoice);
  }

  /** Next callsign: walk the shuffled order without repeat; a pool exhausted
   *  anyway (tests, giant lobbies) reuses names with a numeric suffix. */
  private drawCallsign(): string {
    const order = this.callsignOrder;
    const i = this.callsignsDrawn % order.length;
    const cycle = Math.floor(this.callsignsDrawn / order.length);
    this.callsignsDrawn += 1;
    return cycle === 0 ? order[i] : `${order[i]} ${cycle + 1}`;
  }
}

/** Fisher-Yates off the given rng (the pool itself is never mutated). */
function shuffled(pool: readonly string[], rng: Rng): string[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
