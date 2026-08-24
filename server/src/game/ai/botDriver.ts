// COMBAT-BOT CONTROLLER (Story 6.4) — the driver for `role: 'bot'` ships.
//
// A bot is an ORDINARY ship (World.addBot → addShip with role='bot'); it has
// no client. This controller is its hands and its eyes:
//
//   EYES — the fogged perception view world.ts hands in as a bound per-bot
//   observe thunk (BotTickEntry.observe), called EXACTLY ONCE per live bot
//   per tick and folded into the mind every tick. This is the honest human
//   client contract — a frame per tick at 20Hz — and it is a REVIEW-GATE
//   CORRECTION of wave 1's observe round-robin: radar blips and the
//   self-private gunnery rows live for exactly one tick, and a 1-in-5
//   observe cadence RESONATES with the sweep (80 ticks/revolution at 15 rpm,
//   80 ≡ 0 mod 5), leaving a bot PERMANENTLY radar-blind to any bearing
//   whose paint phase missed its slot. The handicap lives in the DECISION
//   cadence and CONFIG.bots.reactionMs, never in dropped perception.
//   observe()'s observer-state mutation (`seenBallistics`/`torpDirs`) is
//   CORRECT here, not a hazard: one call per tick is precisely the human
//   client contract, and the mutation becomes the bot's own exactly-once
//   ballistic reveal memory. That is why "exactly one call per live bot per
//   tick" is a pinned invariant, not a performance nicety.
//
//   HANDS — one sanitized-shape InputMsg per live bot per tick through
//   port.submitInput (full sanitizeInput, `fireT: 0`, no privileged path),
//   exactly as the fleet AI and every human client write intent. Steering
//   and firing are therefore emitted EVERY tick; only DELIBERATION (target
//   reselection, posture, boon spends) is gated, on this bot's
//   decision-cadence slot (CONFIG.bots.decisionCadenceMs, staggered by id
//   hash so 19 bots spread the scoring work across ticks instead of
//   bunching it). The frozen-helm path still bypasses the brain entirely.
//
// THE DRIVER HOLDS NO WORLD — not even as a type. Its whole handle on the
// simulation is the narrow BotWorldPort (clock, map, live ring, the two
// intent paths) plus the per-tick BotTickEntry array world.ts builds for it
// (each bot's own record and its bound observe thunk). ai/ is structurally
// incapable of addressing any ship but its own; the eslint boundary bans
// world.js outright and makes perception.js type-only for this directory.

import { CONFIG, SHIP_CLASS_IDS, mulberry32, type InputMsg, type Rng, type ShipClassId } from '@salvo/shared';
import { profileOf } from './profiles.js';
import { COMBAT_BRAIN } from './tactics.js';
import type {
  AnyProfileId,
  BotBrain,
  BotDecision,
  BotEngageGate,
  BotMind,
  BotTickEntry,
  BotWorldPort,
} from './types.js';

/** The MIND-STREAM multiplier — per-enrollment decorrelation of the mind's own
 *  rng (aim scatter). Named so its sibling below reads as the pair it is. */
const MIND_STREAM_K = 0x9e3779b9;
/** The SPEND-STREAM multiplier (Story 7-6 wave 4) — a DISTINCT odd constant
 *  (unused by any other stream mint in the codebase), so the random-spend
 *  stream can never collide with the mind stream at any enrollment count:
 *  `seed + n·K1` and `seed + m·K2` coincide only where n·K1 ≡ m·K2 (mod 2^32),
 *  unreachable at lobby-sized n, m with these two constants. */
const SPEND_STREAM_K = 0x7f4a7c15;

/**
 * The deliberation-stagger slot for a bot id: FNV-1a over the id, mod the
 * cadence window. Pure and exported so the stagger test can compute the
 * expected per-tick histogram independently. With `bot-1`..`bot-19` at
 * cadence 5 the buckets measure [6,3,4,2,4] — spread, never bunched.
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
 * zero Colyseus. World calls tick() once per step at the `botsTick` row —
 * immediately before applyInputs, so bot input is consumed the same tick —
 * handing in the per-bot entries it built for this tick.
 */
export class BotController {
  private readonly minds = new Map<string, BotMind>();
  /** The narrow port — the ONLY world handle the driver holds (see header). */
  private readonly port: BotWorldPort;
  /** The controller's own decision stream (enroll rolls: class, profile,
   *  callsign order) — decorrelated from every other world stream. */
  private readonly rng: Rng;
  private readonly seed: number;
  /** The deliberation round-robin window, in ticks (250ms / 50ms = 5). */
  private readonly cadenceTicks: number;
  /** Controller-local tick counter driving the stagger (self-contained —
   *  the port deliberately exposes no tick number). */
  private tickCount = 0;
  /** observe() calls made during the most recent tick() — the
   *  exactly-once-and-always pin's per-tick instrument. */
  private observesLastTickCount = 0;
  /** Callsign draw order: a Fisher-Yates shuffle of the CONFIG pool, fixed at
   *  construction; draws walk it without repeat, suffixing on wrap. */
  private readonly callsignOrder: readonly string[];
  private callsignsDrawn = 0;
  private enrollCounter = 0;
  /** The pluggable brain — the real profile-driven tactics since wave 3. */
  private readonly brain: BotBrain = COMBAT_BRAIN;
  /**
   * THE ENGAGE GATE (Story 7-6 wave 4) — 'always' is the shipped behaviour
   * and the default, so nothing in production moves. Under 'endgame' every
   * bot runs the brain's HELD decision (sail the ring rhythm, spend levels,
   * never target or fire) until `port.zoneEndgameReached` — which is FALSE
   * while the zone timeline is idle, so a gated bot can never degenerate into
   * a plain always-engage bot before the match arms. Set only by the
   * batch-sim harness (`--bot-engage endgame`), before any tick runs.
   */
  engage: BotEngageGate = 'always';
  /**
   * THE SPEND MODE (balance campaign, 2026-08-24) — 'profile' is the shipped
   * behaviour and the default, so nothing in production moves. Under 'random'
   * every subsequently-enrolled bot keeps its rolled profile's TEMPERAMENT
   * (band, targeting, disengage/heal thresholds, appetite) but picks cards
   * uniformly at random from its offer — the tuned-profile instance of the
   * blind-vacuum rows' measurement design, reachable only through the
   * batch-sim harness (`--bot-spend random`), set before any enrollment.
   */
  spend: 'profile' | 'random' = 'profile';

  constructor(port: BotWorldPort, seed: number) {
    this.port = port;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.cadenceTicks = Math.max(1, Math.round(CONFIG.bots.decisionCadenceMs / CONFIG.tick.simDtMs));
    this.callsignOrder = shuffled(CONFIG.bots.callsigns, this.rng);
  }

  /** How many bots are currently under control. */
  get size(): number {
    return this.minds.size;
  }

  /** observe() calls made during the most recent tick() (testing/inspection
   *  only — the exactly-once-and-always pin's per-tick reading). */
  get observesLastTick(): number {
    return this.observesLastTickCount;
  }

  /** A bot's deliberation-stagger slot (testing/inspection only). -1 =
   *  unknown id. */
  phaseOf(id: string): number {
    return this.minds.get(id)?.phase ?? -1;
  }

  /** Server ms of a bot's latest observe, -1 = never (testing/inspection). */
  viewAtOf(id: string): number {
    return this.minds.get(id)?.viewAt ?? -1;
  }

  /** A bot's assigned priority profile (testing/inspection only). */
  profileOf(id: string): AnyProfileId | null {
    return this.minds.get(id)?.profile ?? null;
  }

  /** Remembered contact-track count for a bot (testing/inspection only —
   *  the perception-regression suite's instrument). -1 = unknown id. */
  trackCountOf(id: string): number {
    return this.minds.get(id)?.contacts.size ?? -1;
  }

  /**
   * Enroll a new bot: roll its class, priority profile and callsign off the
   * controller's seeded stream, create its mind (stagger phase from the id
   * hash), and hand back what World.addBot needs for addShip. The mind's own
   * rng is decorrelated per enrollment (the FleetController idiom).
   *
   * `hull` (Story 6.5) lets the CALLER pick the class — a caller building a
   * whole field at once deals a balanced spread rather than nineteen
   * independent uniform draws. The roll still HAPPENS and is then discarded, so
   * the stream position of every subsequent draw (profile, callsign) is
   * identical whether or not a class was supplied: an enrollment count is the
   * only thing that advances the stream, never the caller's choice. NO
   * behaviour change — a bot's brain does not know where its class came from.
   *
   * `profile` (Story 7-6 wave 4) is the batch-sim harness's door to the
   * TEST-ONLY rows and obeys the SAME stream discipline: the profile roll
   * still happens off the class the roll landed on, and is then discarded —
   * so every downstream draw (callsign order, every later enrollment's class
   * and mind seed) is byte-identical whether or not a profile was forced. A
   * forced profile also governs the HULL (each row is hull-bound by
   * construction), so a caller passes the profile alone. The in-game path
   * (ArenaRoom.buildBotFleet) never passes one, and the rolled profile comes
   * from CONFIG.bots.profiles — which contains no test id — so a real Solo vs
   * AI opponent can never carry a test row.
   */
  enroll(id: string, hull?: ShipClassId, profile?: AnyProfileId): { name: string; hullId: ShipClassId } {
    this.enrollCounter += 1;
    const rolled = this.rng.pick(SHIP_CLASS_IDS);
    const rolledHull = hull ?? rolled;
    const rolledProfile = this.rng.pick(CONFIG.bots.profiles[rolledHull]);
    const prof: AnyProfileId = profile ?? rolledProfile;
    const hullId = profile === undefined ? rolledHull : profileOf(profile).hullId;
    const name = this.drawCallsign();
    this.minds.set(id, {
      rng: mulberry32((this.seed + this.enrollCounter * MIND_STREAM_K) >>> 0),
      spendRng: mulberry32((this.seed + this.enrollCounter * SPEND_STREAM_K) >>> 0),
      seq: 0,
      fireSeq: 0,
      actSeq: 0,
      profile: prof,
      spendRandom: this.spend === 'random',
      phase: botPhase(id, this.cadenceTicks),
      view: null,
      viewAt: -1,
      contacts: new Map(),
      targetKey: null,
      posture: 'reposition',
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
   * Draw a REPLACEMENT callsign for an already-enrolled bot (Story 6.5) — the
   * next name off the same without-repeat order, so a redraw can never collide
   * with a name already flying. Pure naming: the mind, its profile, its stagger
   * phase and every scrap of brain state are untouched (the id is taken only to
   * refuse an unknown one). World.renameBot is the one caller.
   */
  redrawCallsign(id: string): string {
    return this.minds.has(id) ? this.drawCallsign() : '';
  }

  /**
   * One controller step (the `botsTick` STEP_ORDER row), over the per-bot
   * entries world.ts built for this tick. Per live bot: observe (exactly
   * once), then submit exactly one input. A frozen helm (boarding room)
   * skips observe and emits neutral input without ever advancing fireSeq; a
   * non-afloat hull releases its per-life brain state and emits nothing
   * (sinking/sunk row of the I/O contract).
   */
  tick(entries: readonly BotTickEntry[]): void {
    this.tickCount += 1;
    this.observesLastTickCount = 0;
    for (const e of entries) {
      const mind = this.minds.get(e.id);
      if (mind === undefined) continue;
      if (!e.afloat) {
        this.releasePerLifeState(mind);
        continue;
      }
      this.driveBot(e, mind);
    }
  }

  /**
   * Sinking/sunk: the brain releases EVERYTHING that belongs to the life
   * that just ended — its view, its plot, its deliberated target/posture,
   * and the un-beach manoeuvre's timers. The manoeuvre release is the
   * review-gate fix for the respawn quirk: without it a bot that died
   * mid-burst respawned into a stale 3s exit-heading hold pointed at
   * wherever it happened to die (the old "self-heal" only released the
   * BURST, via the teleport tripping the displacement test, and released it
   * INTO the hold). A respawn now starts with a clean helm.
   */
  private releasePerLifeState(mind: BotMind): void {
    mind.view = null;
    mind.viewAt = -1;
    mind.contacts.clear();
    mind.targetKey = null;
    mind.posture = 'reposition';
    mind.stuckMs = 0;
    mind.unbeachUntil = 0;
    mind.unbeach = null;
  }

  /** Observe + decide + emit for one live bot. */
  private driveBot(e: BotTickEntry, mind: BotMind): void {
    if (!this.port.helmEnabled) {
      // THE BOARDING FREEZE: no observe (radar is off and the room is
      // pre-active — there is nothing legitimate to learn), neutral input so
      // the seq stream stays warm, fireSeq untouched by construction.
      this.submit(e.id, mind, FROZEN_DECISION);
      return;
    }
    // THE ONE PERCEPTION CALL in the entire ai/ module — exactly once per
    // live bot per tick, EVERY tick (the exactly-once-and-always pin).
    mind.view = e.observe();
    mind.viewAt = this.port.now;
    this.observesLastTickCount += 1;
    // Deliberation (target reselection, posture, spends) runs on this bot's
    // own stagger slot; steering and firing are emitted every tick.
    const deliberate = (this.tickCount + mind.phase) % this.cadenceTicks === 0;
    // THE ENGAGE GATE: while closed, the HELD decision — full ring rhythm and
    // economy, zero weapons. Perception stays per-tick either way (a fairness
    // gate may hold a bot's fire; it may never delete its perception).
    const held = this.engage === 'endgame' && !this.port.zoneEndgameReached;
    const d = held
      ? this.brain.decideHeld(e.self, mind, this.port, deliberate)
      : this.brain.decide(e.self, mind, this.port, deliberate);
    this.submit(e.id, mind, d);
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
