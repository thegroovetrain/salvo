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

import {
  angleDiff,
  boostedKinematics,
  hullSilhouette,
  resolveShipPose,
  stepShip,
  wrapAngle,
  CONFIG,
  SHIP_CLASS_IDS,
  type Circle,
  type InputMsg,
  type Pose,
  type ShipConfig,
  type ShipState,
  type Vec2,
} from '@salvo/shared';
import { lerp, lerpAngle } from '../util/math.js';

/** Collision inputs the predictor shares with the server sim (radius + rocks). */
export interface CollisionMap {
  radius: number;
  islands: readonly Circle[];
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
}

interface PendingInput {
  seq: number;
  throttle: number;
  rudder: number;
  /** InputMsg.actSeq this tick carried — replays the server's ability gate (see boostActiveAt). */
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
   * Optimistic boost window opened at a predicted-ready activation press
   * (predictBoostActivation), so the speed-up doesn't wait a round trip.
   * `actSeq` is the counter value the press rides on the wire: it gates the
   * replay per tick (pending ticks sampled BEFORE the press stay unboosted —
   * the exact gate the server applies when it consumes the actSeq advance).
   * Cleared the moment a frame's ack covers that actSeq — from then on the
   * authoritative you.boostUntil governs, and any mismatch (denied press,
   * ~½RTT window offset) folds into that same reconcile's visual-error decay.
   */
  private optimisticBoost: { until: number; actSeq: number } | null = null;

  constructor(
    private readonly map: CollisionMap,
    private kin: ShipConfig = CONFIG.shipClasses.torpedoBoat.kinematics,
    private localPoly: readonly Vec2[] = hullSilhouette('torpedoBoat'),
    private readonly dt: number = CONFIG.tick.simDtMs / 1000,
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
   * Open the optimistic boost window for a predicted-ready ability press:
   * `atServerT` is the press's server-clock estimate (clock.serverNow — never
   * wall clock), `actSeq` the keyboard counter value the press will ride, so
   * replayed ticks that span the press see the boost exactly from the
   * activation tick onward. The authoritative you.boostUntil takes over once
   * the press's input is acked (see onServerState).
   */
  predictBoostActivation(atServerT: number, actSeq: number): void {
    this.optimisticBoost = { until: atServerT + this.boost.durationMs, actSeq };
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
  }

  /**
   * Advance the local prediction one fixed sim tick with the input that was
   * just sent to the server. Call exactly once per 50ms tick, after sending.
   * `tickT` is THIS tick's server-time estimate (clock.serverNow()) — it is
   * recorded on the pending entry so a later replay of this tick re-evaluates
   * the boost gate at the identical time (never wall clock, never a frozen
   * shared "now").
   */
  localTick(input: InputMsg, tickT = 0): void {
    if (!this.ready) return;
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
    stepShip(this.curr, input, this.tickKin(tickT, input.actSeq), this.dt);
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
      stepShip(s, { throttle: p.throttle, rudder: p.rudder }, this.tickKin(p.t, p.actSeq), this.dt);
      this.resolveCollisions(s, prev);
    }
    return s;
  }

  /**
   * Per-tick kinematics for a tick at server-time estimate `t` carrying
   * `actSeq`: the shared boostedKinematics is the ONLY speed mutator — the
   * exact per-tick rule the server's stepShips applies
   * (boostedKinematics(stats.kinematics, bonus, now < boostUntil)).
   */
  private tickKin(t: number, actSeq: number): ShipConfig {
    return boostedKinematics(this.kin, this.boost.bonus, this.boostActiveAt(t, actSeq));
  }

  /**
   * The boost gate for one tick. Two regimes:
   *  - An un-acked activation press (optimisticBoost set): the press's window
   *    governs, gated by actSeq so replayed ticks sampled BEFORE the press
   *    stay unboosted — per-tick fidelity across the activation edge.
   *  - Otherwise: the authoritative `t < you.boostUntil`, the server's own
   *    rule. No lower bound is needed: every pending tick is applied by the
   *    server AFTER the frame that carried boostUntil, hence after the
   *    activation itself; and the same comparison handles the expiry edge
   *    (ticks recorded past the window decay at class decel via the base kin).
   */
  private boostActiveAt(t: number, actSeq: number): boolean {
    const o = this.optimisticBoost;
    if (o !== null) return actSeq >= o.actSeq && t < o.until;
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
   * boundary. islandSpeedMult is applied once on contact, matching the server.
   */
  private resolveCollisions(s: ShipState, prev: Pose): void {
    const { contact } = resolveShipPose(
      prev,
      s,
      this.map.islands,
      this.map.radius,
      this.localPoly,
      this.scratch,
    );
    if (contact) s.speed *= CONFIG.ship.islandSpeedMult;
  }
}
