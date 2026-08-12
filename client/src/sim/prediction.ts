// Own-ship prediction + reconciliation (build-order step 6). The client steps
// its own hull locally with the shared stepShip at the same fixed 50ms dt the
// server uses, keeping a ring of pending (un-acked) inputs. On every server
// frame it drops acked inputs, replays the pending ones from the server's
// authoritative `you` kinematics, and reconciles:
//   error < 0.01u              -> ignore (adopt speed only, no visual churn)
//   error > 3 ship lengths     -> hard snap (teleport-scale divergence)
//   otherwise                  -> adopt the replayed state and fold the delta
//                                 into a visualError offset that is added at
//                                 render time only and decays x exp(-12*dt)
// so authoritative state converges immediately while the picture stays smooth.
//
// Speed boost (Story 1.6): every tick — local AND replayed — derives its
// kinematics through the shared boostedKinematics(kin, bonus, active) hook,
// the identical per-tick rule the server's stepShips applies. Each pending
// input records its own server-time estimate + actSeq, so replays re-make the
// exact boost decisions the original ticks made; see boostActiveAt for the
// optimistic-press vs authoritative-window regimes.
//
// PROP-FOULING SLOW (Story 2.8): the victim-private you.slowedUntil folds in
// per tick through the shared slowedKinematics, in the PINNED composition
// order the server's stepShips uses byte-for-byte:
//   boostedKinematics → slowedKinematics → hookKinematics
// (boost first, slow second, hooks last — sim/slow.ts header). The window is
// purely authoritative: nothing on the client predicts being mined, so unlike
// boost there is no optimistic regime — a tick is slowed iff its OWN recorded
// server-time estimate is inside the last frame's window (`t < slowedUntil`),
// which makes localTick and replayFrom agree by construction.
//
// THE SINKING WINDOW (Story 5.2, amendments 10/13/16): the self-private
// you.sinkingUntil folds in per tick through the SHARED applySinkingDecel —
// the identical function world.ts calls, the applyGroundingDamp precedent — so
// the ritardando cannot drift between the two sides. Authoritative-only for the
// same reason the slow is: the client never predicts its own sinking, so a tick
// is capped iff the last frame reported a window. Two properties make replay
// safe here: the cap is derived purely from (since, now), so applying it twice
// or replaying it across a reconcile yields the same speed; and it is applied
// AFTER stepShip, so this tick's integrated position is untouched and the cap
// only shapes the next tick's start speed — exactly as on the server.

import {
  angleDiff,
  applyGroundingDamp,
  applySinkingDecel,
  boostedKinematics,
  hookKinematics,
  slowedKinematics,
  hullSilhouette,
  resolveShipPose,
  stepShip,
  wrapAngle,
  CONFIG,
  HOOK_REGISTRY,
  SHIP_CLASS_IDS,
  type HookRegistry,
  type InputMsg,
  type Island,
  type KinematicsBehavior,
  type Pose,
  type ShipConfig,
  type ShipState,
  type Vec2,
} from '@salvo/shared';
import { lerp, lerpAngle } from '../util/math.js';

/** Collision inputs the predictor shares with the server sim (radius + rocks). */
export interface CollisionMap {
  radius: number;
  islands: readonly Island[];
}

/** Pending-input ring capacity (~64 ticks = 3.2s of un-acked input). */
export const PENDING_CAPACITY = 64;
/** Positional error below this is ignored entirely (u). */
export const IGNORE_EPSILON_U = 0.01;
/** Heading error below this is ignored alongside the positional epsilon (rad). */
export const IGNORE_EPSILON_RAD = 1e-3;
/** Positional error beyond this hard-snaps with no visual smoothing (u).
 *  Derivation: the longest class hull length × 3 — a class-agnostic teleport
 *  threshold sized off the biggest hull so no legitimate replay for any class
 *  ever trips it (currently battleship 124 × 3 = 372u). */
export const HARD_SNAP_U =
  Math.max(...SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id].hull.length)) * 3;
/** visualError decay constant: error *= exp(-ERROR_DECAY_RATE * dt). */
export const ERROR_DECAY_RATE = 12;

/** The server's authoritative own-ship kinematics (subset of OwnShip). */
export interface ServerKinematics {
  x: number;
  y: number;
  heading: number;
  speed: number;
  /**
   * ms — server-clock time the active speed-boost window ends (OwnShip.boostUntil,
   * Story 1.6); 0/omitted = inactive. Optional so pure-kinematics callers (tests,
   * interp mode) need not fabricate it; a real frame's `you` always carries it.
   */
  boostUntil?: number;
  /**
   * ms — server-clock time the PROP-FOULING slow window ends
   * (OwnShip.slowedUntil, Story 2.8); 0/omitted = not slowed. Optional for the
   * same reason as boostUntil (pure-kinematics callers need not fabricate it);
   * a real frame's `you` carries it whenever the victim is fouled.
   */
  slowedUntil?: number;
  /**
   * ms — server-clock time this SINKING hull founders (OwnShip.sinkingUntil,
   * Story 5.2); ABSENT = not sinking. Optional for the same reason as the two
   * windows above, and absent for all but five seconds of any hull's life.
   */
  sinkingUntil?: number;
}

interface PendingInput {
  seq: number;
  throttle: number;
  rudder: number;
  /** InputMsg.actSeq this tick carried — lets onServerState detect when an ack
   *  covers the optimistic press (the replay gate itself keys on seq/pressSeq). */
  actSeq: number;
  /** ms — THIS tick's own server-time estimate (clock.serverNow at localTick).
   *  Each replayed tick re-evaluates boost-active at its own recorded time, so
   *  a replay reproduces exactly the per-tick decisions the original local
   *  ticks made (self-consistent by construction — never one frozen "now"). */
  t: number;
}

/** What the renderer draws: predicted pose + decaying visual error. */
export interface RenderPose {
  x: number;
  y: number;
  heading: number;
  speed: number;
}

function clone(s: ShipState): ShipState {
  return { x: s.x, y: s.y, heading: s.heading, speed: s.speed };
}

export class Predictor {
  private prev: ShipState = { x: 0, y: 0, heading: 0, speed: 0 };
  private curr: ShipState = { x: 0, y: 0, heading: 0, speed: 0 };
  private pending: PendingInput[] = [];
  private ve = { x: 0, y: 0, heading: 0 }; // render-time-only visual error
  private ready = false;
  /** Reused transform scratch for resolveShipPose (allocation-light replay). */
  private readonly scratch: Vec2[] = [];
  /** Effective boost numbers (effectiveStats().boost pass-through; CONFIG at zero upgrades). */
  private boost: { bonus: number; durationMs: number } = {
    bonus: CONFIG.speedBoost.speedBonus,
    durationMs: CONFIG.speedBoost.durationMs,
  };
  /** Authoritative boost-window end (you.boostUntil from the latest server frame; 0 = inactive). */
  private authBoostUntil = 0;
  /**
   * Authoritative PROP-FOULING slow-window end (you.slowedUntil from the
   * latest server frame; 0 = not slowed). Authoritative-ONLY by design — the
   * client never predicts a mine blast, so there is no optimistic twin here.
   */
  private authSlowedUntil = 0;
  /**
   * Authoritative SINKING-window deadline (you.sinkingUntil from the latest
   * server frame; 0 = not sinking). Authoritative-ONLY, exactly like the slow:
   * the client never predicts its own sinking, so there is no optimistic twin.
   * Stored as the DEADLINE (the wire's own shape) and converted to the shared
   * fold's `since` at use — one subtraction against the shared window constant,
   * so the two sides read the same pair of numbers.
   */
  private authSinkingUntil = 0;
  /**
   * Optimistic boost window opened at a predicted-ready activation press
   * (predictBoostActivation), so the speed-up doesn't wait a round trip.
   * `actSeq` is the counter value the press rides on the wire; `pressSeq` is
   * the input seq of the FIRST tick that carried it (recorded by localTick).
   * PRESS-TICK SEMANTICS (server truth — activationControl runs AFTER
   * stepShips): the tick that carries the new actSeq itself steps UNBOOSTED
   * and the window opens for the following tick, so the gate is `seq >
   * pressSeq` (never `>=`) and `until` is shifted one sim tick past the press
   * estimate. Cleared the moment a frame's ack covers `actSeq` — from then on
   * the authoritative you.boostUntil governs, and any mismatch (denied press,
   * ~½RTT window offset) folds into that reconcile's visual-error decay.
   */
  private optimisticBoost: { until: number; actSeq: number; pressSeq: number | null } | null = null;

  /**
   * Behavior-boon hook workload for the per-tick kinematics fold (Story 2.5):
   * the own ship's `behavior` effects, handed over by main.applyOwnStats via
   * setBoons. Empty (the pre-boon identity path) until a frame's you.boons
   * resolves to a behavior-carrying def — which no production catalog entry
   * does until 2.8.
   */
  private behaviors: readonly KinematicsBehavior[] = [];

  constructor(
    private readonly map: CollisionMap,
    private kin: ShipConfig = CONFIG.shipClasses.torpedoBoat.kinematics,
    private localPoly: readonly Vec2[] = hullSilhouette('torpedoBoat'),
    private readonly dt: number = CONFIG.tick.simDtMs / 1000,
    /** Hook registry the kinematics fold runs against — injectable for tests
     *  (parity suites), the empty shared HOOK_REGISTRY in production. */
    private readonly hookRegistry: HookRegistry = HOOK_REGISTRY,
  ) {}

  /**
   * Swap in a ship class's kinematics + silhouette polygon and re-initialize.
   * The own class is authoritative from the first server frame (you.cls), so if
   * the localStorage guess was wrong this re-inits prediction from the next
   * frame — the desync firewall for the physics model.
   *
   * `localPoly` is the shared hullSilhouette(cls) — the SAME polygon the server
   * feeds resolveShipPose, so collision parity holds by construction.
   *
   * `snap` — pass true ONLY for an actual class change (first-frame localStorage
   * correction): the physics model was materially wrong, so re-init cleanly.
   * For an upgrade grant (e.g. maxSpeed), pass false: the pending-input ring is
   * KEPT and the next reconcile replays it under the new kinematics — the small
   * transient folds into the visual-error smoothing instead of hard-snapping
   * the hull backward by the full RTT lead on every kill.
   */
  setClassConfig(kin: ShipConfig, localPoly: readonly Vec2[], snap = true): void {
    this.kin = kin;
    this.localPoly = localPoly;
    if (snap) this.forceSnap();
  }

  /** Swap the effective boost numbers alongside setClassConfig (applyOwnStats seam). */
  setBoostStats(bonus: number, durationMs: number): void {
    this.boost = { bonus, durationMs };
  }

  /**
   * Swap the own ship's behavior-boon hook workload (Story 2.5 —
   * applyOwnStats seam, beside setBoostStats/setClassConfig). NO snap: like
   * an upgrade grant, the pending ring is kept and the next reconcile replays
   * it under the new fold; the transient folds into visual-error smoothing.
   */
  setBoons(behaviors: readonly KinematicsBehavior[]): void {
    this.behaviors = behaviors;
  }

  /**
   * Open the optimistic boost window for a predicted-ready ability press:
   * `atServerT` is the press's server-clock estimate (clock.serverNow — never
   * wall clock), `actSeq` the keyboard counter value the press will ride.
   * The window END is shifted ONE SIM TICK past the press estimate, mirroring
   * the server's step order (the tick that consumes the actSeq advance steps
   * BEFORE activation applies, so its boostUntil ≈ pressT + tick + duration);
   * the window START is gated per tick by pressSeq (see boostActiveAt), so the
   * press input's tick steps unboosted and the boost begins the tick after.
   * While an un-acked optimistic window is already pending, a new press is
   * IGNORED — a double-press within RTT (predicted-ready off stale ammo) must
   * not extend the estimate the server will never honor. The authoritative
   * you.boostUntil takes over once the press's input is acked (onServerState).
   */
  predictBoostActivation(atServerT: number, actSeq: number): void {
    if (this.optimisticBoost !== null) return; // pending window: never overwrite/extend
    this.optimisticBoost = {
      until: atServerT + CONFIG.tick.simDtMs + this.boost.durationMs,
      actSeq,
      pressSeq: null,
    };
  }

  /**
   * ms — the current best estimate of the boost window's end (0 = inactive):
   * the optimistic press-time window until the activation is acked, the
   * authoritative you.boostUntil after. Drives the HUD's active-chip outline
   * and boosted speed-needle cap; compare against clock.serverNow().
   */
  get boostUntilEstimate(): number {
    return this.optimisticBoost?.until ?? this.authBoostUntil;
  }

  /** False until the first server state initializes the predicted ship. */
  get isInitialized(): boolean {
    return this.ready;
  }

  /** Number of un-acked inputs currently pending (tests/debug). */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Magnitude of the current positional visual error (u). Tests/debug. */
  get visualErrorMagnitude(): number {
    return Math.hypot(this.ve.x, this.ve.y);
  }

  /** Current predicted state (post-newest local tick). Tests/debug. */
  get predicted(): Readonly<ShipState> {
    return this.curr;
  }

  /**
   * Forget everything and re-initialize from the next server state (used on
   * respawn teleports and when switching back into prediction mode).
   */
  forceSnap(): void {
    this.ready = false;
    this.pending.length = 0;
    this.ve.x = 0;
    this.ve.y = 0;
    this.ve.heading = 0;
    // A hard re-init (respawn / reconnect / class swap) drops any un-acked
    // optimistic boost window; the authoritative you.boostUntil re-seeds the
    // window on the very next frame (death resets it to 0 server-side).
    this.optimisticBoost = null;
    // Same for the slow window: the server clears slowedUntil on death /
    // redeploy, and the next frame re-seeds it.
    this.authSlowedUntil = 0;
    // ...and for the sinking window. A hard re-init is a respawn / reconnect /
    // class swap, none of which a sinking hull survives — leaving a stale
    // deadline behind would cap the NEXT life's speed to zero for the rest of
    // an already-expired window.
    this.authSinkingUntil = 0;
  }

  /**
   * Advance the local prediction one fixed sim tick with the input that was
   * just sent to the server. Call exactly once per 50ms tick, after sending.
   * `tickT` is THIS tick's server-time estimate (clock.serverNow()) —
   * REQUIRED, so no call site can silently freeze the boost gate at 0 — and is
   * recorded on the pending entry so a later replay of this tick re-evaluates
   * the boost gate at the identical time (never wall clock, never a frozen
   * shared "now").
   */
  localTick(input: InputMsg, tickT: number): void {
    if (!this.ready) return;
    // First tick carrying the pending press's actSeq: pin it as the press
    // tick. It steps UNBOOSTED (the server's activationControl runs after
    // stepShips); every later tick gates on `seq > pressSeq`.
    const o = this.optimisticBoost;
    if (o !== null && o.pressSeq === null && input.actSeq >= o.actSeq) o.pressSeq = input.seq;
    this.pending.push({
      seq: input.seq,
      throttle: input.throttle,
      rudder: input.rudder,
      actSeq: input.actSeq,
      t: tickT,
    });
    if (this.pending.length > PENDING_CAPACITY) this.pending.shift();
    // this.prev is the pre-step (induction-valid) pose — reuse it as the
    // rollback prev for this tick's collision resolve.
    this.prev = clone(this.curr);
    const kin = this.tickKin(tickT, input.seq);
    stepShip(this.curr, input, kin, this.dt);
    // The sinking cap folds against THIS tick's effective kinematics (see
    // sinkingDecel) — the same object stepShip just used, so a live boost
    // raises the ceiling the ritardando scales rather than being refused.
    this.sinkingDecel(this.curr, kin, tickT);
    this.resolveCollisions(this.curr, this.prev);
  }

  /**
   * Reconcile against an authoritative server state that has applied inputs
   * up to `ackSeq`. Drops acked inputs, replays the rest, folds the error.
   */
  onServerState(you: ServerKinematics, ackSeq: number): void {
    let ackedActSeq = -1;
    while (this.pending.length > 0 && this.pending[0].seq <= ackSeq) {
      ackedActSeq = this.pending[0].actSeq; // actSeq is monotonic — the last shifted wins
      this.pending.shift();
    }
    // Once the frame's ack covers the optimistic press's actSeq, you.boostUntil
    // reflects the server's verdict (activated or denied) — drop the estimate
    // and let the authoritative window govern from here. A mismatch folds into
    // this same reconcile's replay+visual-error path.
    if (this.optimisticBoost !== null && ackedActSeq >= this.optimisticBoost.actSeq) {
      this.optimisticBoost = null;
    }
    this.authBoostUntil = you.boostUntil ?? 0;
    // The slow window is authoritative-only (see authSlowedUntil): adopting it
    // BEFORE the replay is what makes the replayed ticks re-make the same
    // slow decisions the original local ticks will make from here on.
    this.authSlowedUntil = you.slowedUntil ?? 0;
    // Adopted BEFORE the replay for the same reason the slow is: the pending
    // ticks about to be replayed will be re-stepped from here on under this
    // window, so they must re-make the same decisions the original local ticks
    // will. A frame that omits the key (not sinking / foundered) clears it.
    this.authSinkingUntil = you.sinkingUntil ?? 0;
    const replayed = this.replayFrom(you);
    if (!this.ready) {
      this.adopt(replayed);
      this.ready = true;
      return;
    }
    this.reconcile(replayed);
  }

  /** Decay the visual error. Call once per render frame with real frameDt (s). */
  decayError(frameDt: number): void {
    const k = Math.exp(-ERROR_DECAY_RATE * frameDt);
    this.ve.x *= k;
    this.ve.y *= k;
    this.ve.heading *= k;
  }

  /** Pose to draw: prev->curr interpolated by `alpha`, plus the visual error. */
  renderPose(alpha: number): RenderPose {
    return {
      x: lerp(this.prev.x, this.curr.x, alpha) + this.ve.x,
      y: lerp(this.prev.y, this.curr.y, alpha) + this.ve.y,
      heading: wrapAngle(lerpAngle(this.prev.heading, this.curr.heading, alpha) + this.ve.heading),
      speed: lerp(this.prev.speed, this.curr.speed, alpha),
    };
  }

  /** Server state + every pending input stepped at the fixed dt, each tick
   *  re-deriving its kinematics from the boost gate at ITS OWN recorded time
   *  (the identical per-tick rule localTick applied — see tickKin). */
  private replayFrom(you: ServerKinematics): ShipState {
    const s: ShipState = { x: you.x, y: you.y, heading: you.heading, speed: you.speed };
    const prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    for (const p of this.pending) {
      prev.x = s.x;
      prev.y = s.y;
      prev.heading = s.heading;
      const kin = this.tickKin(p.t, p.seq);
      stepShip(s, { throttle: p.throttle, rudder: p.rudder }, kin, this.dt);
      this.sinkingDecel(s, kin, p.t);
      this.resolveCollisions(s, prev);
    }
    return s;
  }

  /**
   * The SINKING RITARDANDO for one tick — the SHARED applySinkingDecel, the
   * identical function world.ts folds into its own stepShips, at the identical
   * 50ms dt (the applyGroundingDamp precedent: one implementation, so the two
   * sides cannot drift).
   *
   * `kin.maxSpeed` is the PER-TICK EFFECTIVE forward max — post
   * boostedKinematics/slowedKinematics/hookKinematics — and that is
   * DELIBERATELY UNLIKE the RATED max resolveCollisions passes to
   * applyGroundingDamp. Amendment 10 admits speedBoost while sinking knowing it
   * fights the ritardando, so the boost must raise the CEILING the ramp scales
   * (a doomed surge the hull can accelerate into) rather than be refused; the
   * cap still reaches exactly 0 at the deadline either way. sinking.ts's header
   * is where that composition is ruled.
   *
   * Not sinking (the overwhelmingly common case, and every tick of a hull that
   * never sank) costs one compare and returns the tick byte-identical to the
   * pre-5.2 one.
   */
  private sinkingDecel(s: ShipState, kin: ShipConfig, t: number): void {
    if (this.authSinkingUntil <= 0) return;
    applySinkingDecel(s, kin.maxSpeed, this.authSinkingUntil - CONFIG.ship.sinkingWindowMs, t);
  }

  /**
   * Per-tick kinematics for the tick with input `seq` at server-time estimate
   * `t` — the shared folds in the PINNED composition order the server's
   * stepShips applies byte-for-byte (sim/slow.ts header):
   *
   *   hookKinematics(
   *     slowedKinematics(
   *       boostedKinematics(kinematics, bonus, t < boostUntil),
   *       CONFIG.mine.foulFactor, t < slowedUntil),
   *     behaviors, registry)
   *
   * An inactive boost/slow and zero behaviors each return their input
   * reference unchanged, so the un-boosted, un-fouled, pre-boon tick is
   * byte-identical to the pre-2.8 one. Used identically by localTick and
   * replayFrom (both pass the tick's OWN recorded time + seq), which is what
   * keeps a replay across a slow window self-consistent.
   */
  private tickKin(t: number, seq: number): ShipConfig {
    const boosted = boostedKinematics(this.kin, this.boost.bonus, this.boostActiveAt(t, seq));
    const slowed = slowedKinematics(boosted, CONFIG.mine.foulFactor, this.slowActiveAt(t));
    return hookKinematics(slowed, this.behaviors, this.hookRegistry);
  }

  /**
   * The PROP-FOULING slow gate for one tick: the server's own rule at THIS
   * tick's recorded server-time estimate (`t < you.slowedUntil`). No seq gate
   * and no optimistic regime — the fouling is an enemy's mine, never a local
   * press, so there is nothing to predict ahead of the frame that reports it.
   * A refresh (the server refreshes, never stacks) just moves the end.
   */
  private slowActiveAt(t: number): boolean {
    return t < this.authSlowedUntil;
  }

  /**
   * The boost gate for one tick. Two regimes:
   *  - An un-acked activation press (optimisticBoost set): the press's window
   *    governs, gated STRICTLY past the press tick (`seq > pressSeq`) — the
   *    press input's tick itself steps UNBOOSTED, mirroring the server's
   *    activationControl-after-stepShips order, and ticks sampled before the
   *    press stay unboosted too. Per-tick fidelity across the activation edge,
   *    identical in localTick and replayFrom (both pass the tick's own seq).
   *  - Otherwise: the authoritative `t < you.boostUntil`, the server's own
   *    rule. No lower bound is needed: every pending tick is applied by the
   *    server AFTER the frame that carried boostUntil, hence after the
   *    activation itself; and the same comparison handles the expiry edge
   *    (ticks recorded past the window decay at class decel via the base kin).
   */
  private boostActiveAt(t: number, seq: number): boolean {
    const o = this.optimisticBoost;
    if (o !== null) return o.pressSeq !== null && seq > o.pressSeq && t < o.until;
    return t < this.authBoostUntil;
  }

  private reconcile(replayed: ShipState): void {
    const dx = replayed.x - this.curr.x;
    const dy = replayed.y - this.curr.y;
    const dh = angleDiff(this.curr.heading, replayed.heading);
    const err = Math.hypot(dx, dy);
    if (err > HARD_SNAP_U) {
      this.adopt(replayed); // teleport-scale: snap, no smoothing
      return;
    }
    if (err >= IGNORE_EPSILON_U || Math.abs(dh) >= IGNORE_EPSILON_RAD) {
      // Fold the correction into the visual error (render = old pose now,
      // decaying toward truth) and shift prev by the same delta so the
      // alpha-interpolated pose stays continuous through the swap.
      this.ve.x -= dx;
      this.ve.y -= dy;
      this.ve.heading = wrapAngle(this.ve.heading - dh);
      this.prev.x += dx;
      this.prev.y += dy;
      this.prev.heading = wrapAngle(this.prev.heading + dh);
    }
    this.prev.speed += replayed.speed - this.curr.speed;
    this.curr = replayed; // authoritative state adopted immediately
  }

  private adopt(s: ShipState): void {
    this.prev = clone(s);
    this.curr = clone(s);
    this.ve.x = 0;
    this.ve.y = 0;
    this.ve.heading = 0;
  }

  /**
   * Ship vs island + map edge via the SAME shared pose-validity rollback the
   * server runs in world.ts, with the SAME arguments (prev pose, silhouette
   * polygon, map radius), so prediction never diverges on rocks or the
   * boundary. The speed response is the SHARED applyGroundingDamp — one
   * implementation, called here with `this.kin.maxSpeed` (the hull's RATED
   * effective max, exactly what the server passes from
   * ship.stats.kinematics.maxSpeed; deliberately NOT the per-tick
   * boosted/slowed value, so the two sides read the identical number).
   */
  private resolveCollisions(s: ShipState, prev: Pose): void {
    const res = resolveShipPose(
      prev,
      s,
      this.map.islands,
      this.map.radius,
      this.localPoly,
      this.scratch,
    );
    applyGroundingDamp(s, res, this.kin.maxSpeed);
  }
}
