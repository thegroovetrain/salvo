// Denied-fire feedback: pure predicate + a rate-limited pulse driver (no Pixi
// import — unit tested). "Denied" mirrors the server's derived-fire gate
// cosmetically (cooldown / arc) so held fire against a closed door reads
// immediately, without waiting on a round trip — the server stays the sole
// source of truth for whether a shot actually leaves the tube; this only
// decides whether to flash red.
//
// NOTE: the waiting/countdown "weapons safe" phase is NOT part of this
// predicate. The server fires all weapons in those phases too (only damage is
// suppressed — see World.damageEnabled), so denying fire there was cosmetic
// fiction: shells visibly leave the tube while the UI red-pulsed "denied".
// The HUD's separate "WEAPONS SAFE" tag (ui/phase.ts's matchUx) still
// communicates the damage-suppression fact; it just isn't a fire-denial gate.

/** Inputs to the denied-fire predicate, already resolved by the caller. */
export interface DeniedParams {
  /** Fire is currently held (mouse button 0 down). */
  fireHeld: boolean;
  /** Selected weapon's ready fraction, 0 (just fired) .. 1 (ready). */
  ready: number;
  /** Aim bearing falls within the selected weapon's firing arc (mines: always true). */
  inArc: boolean;
}

/**
 * True iff fire is held but the shot can't go out for a *sustained* reason:
 * aim outside the selected weapon's arc. A bare cooldown (ready < 1) is
 * deliberately NOT denial here — hold-to-fire means ready < 1 for the entire
 * gap between shots during normal, correct play, so gating on it alone would
 * strobe the red pulse roughly once a reload, forever. The cooldown bars
 * already communicate "reloading"; see isPressEdgeNotReady for the one-shot
 * "not ready yet" blip on a fresh press.
 */
export function isFireDenied(p: DeniedParams): boolean {
  if (!p.fireHeld) return false;
  return !p.inArc;
}

/** True on the rising edge of fireHeld — a fresh press, not a sustained hold. */
export function firePressEdge(prevFireHeld: boolean, fireHeld: boolean): boolean {
  return fireHeld && !prevFireHeld;
}

/**
 * True iff this frame should trigger a single "not ready yet" blip: a fresh
 * fire press (not a held/repeated fire) while still on cooldown, in arc.
 * Sustained holds through a reload are excluded — that's isFireDenied's job
 * (and it deliberately says no). Feed the OR of both predicates into
 * DeniedPulse so a genuine denial and this one-shot blip share the same rate
 * limit.
 */
export function isPressEdgeNotReady(p: DeniedParams, prevFireHeld: boolean): boolean {
  if (!p.inArc) return false; // isFireDenied already covers this
  if (p.ready >= 1) return false;
  return firePressEdge(prevFireHeld, p.fireHeld);
}

/** Pulse duration (ms) once triggered — DESIGN.md-scale "brief" red flash. */
export const PULSE_DURATION_MS = 80;
/** Minimum gap (ms) between pulse triggers — held-fire denial reads as one
 *  flash roughly every 1/300ms, not a strobe. */
export const PULSE_RATE_MS = 300;

/**
 * Rate-limited pulse: feed it isFireDenied()'s result once per frame with a
 * monotonic clock (ms); it returns whether the arc/marker + HUD chip should
 * render in their "denied" state THIS frame. A new trigger is accepted only
 * once the rate-limit window has elapsed since the last one; the pulse itself
 * always runs its full PULSE_DURATION_MS regardless of how often update() is
 * called while active.
 */
export class DeniedPulse {
  private lastTriggerAt = -Infinity;
  private activeUntil = -Infinity;

  update(denied: boolean, nowMs: number): boolean {
    if (denied && nowMs - this.lastTriggerAt >= PULSE_RATE_MS) {
      this.lastTriggerAt = nowMs;
      this.activeUntil = nowMs + PULSE_DURATION_MS;
    }
    return nowMs < this.activeUntil;
  }
}
