// Denied-fire feedback: pure predicate + a rate-limited pulse driver (no Pixi
// import — unit tested). "Denied" mirrors the server's derived-fire gate
// cosmetically (cooldown / arc / weapons-safe phase) so held fire against a
// closed door reads immediately, without waiting on a round trip — the
// server stays the sole source of truth for whether a shot actually leaves
// the tube; this only decides whether to flash red.

/** Inputs to the denied-fire predicate, already resolved by the caller. */
export interface DeniedParams {
  /** Fire is currently held (mouse button 0 down). */
  fireHeld: boolean;
  /** Match phase suppresses all damage (waiting/countdown — "weapons safe"). */
  weaponsSafe: boolean;
  /** Selected weapon's ready fraction, 0 (just fired) .. 1 (ready). */
  ready: number;
  /** Aim bearing falls within the selected weapon's firing arc (mines: always true). */
  inArc: boolean;
}

/**
 * True iff fire is held but the shot can't go out this instant: weapons-safe
 * phase, cooldown not elapsed, or aim outside the selected weapon's arc.
 * Order matters only for readability — all three gates are independent.
 */
export function isFireDenied(p: DeniedParams): boolean {
  if (!p.fireHeld) return false;
  if (p.weaponsSafe) return true;
  if (p.ready < 1) return true;
  return !p.inArc;
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
