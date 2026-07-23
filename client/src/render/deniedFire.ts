// Denied-fire feedback: pure predicate + a rate-limited pulse driver (no Pixi
// import — unit tested). "Denied" mirrors the server's one-shot-per-click gate
// cosmetically (not ready / out of arc) so a click against a closed door reads
// immediately, without waiting on a round trip — the server stays the sole
// source of truth for whether a shot actually leaves the tube; this only
// decides whether to flash red. Under click-to-fire a click on cooldown DOES
// blip: the old hold-to-fire suppression existed because a sustained hold
// spent most of its time on cooldown by design, which is void now that every
// shot is a deliberate click.
//
// NOTE: the waiting/countdown "weapons safe" phase is NOT part of this
// predicate. The server fires all weapons in those phases too (only damage is
// suppressed — see World.damageEnabled), so denying fire there was cosmetic
// fiction: shells visibly leave the tube while the UI red-pulsed "denied".
// The HUD's separate "WEAPONS SAFE" tag (ui/phase.ts's matchUx) still
// communicates the damage-suppression fact; it just isn't a fire-denial gate.

/** Inputs to the denied-click predicate, already resolved by the caller. */
export interface DeniedParams {
  /** A fresh click landed this frame (clickCount advanced since last frame). */
  clicked: boolean;
  /**
   * The selected weapon can put a shot out right now. Deliberately abstract:
   * today it means "off cooldown"; the ammo model redefines it as "ammo > 0"
   * with no change to this predicate.
   */
  ready: boolean;
  /** Aim bearing falls within the selected weapon's firing arc (mines: always true). */
  inArc: boolean;
}

/**
 * True iff this frame's click can't produce a shot: out of the selected
 * weapon's arc, or the weapon isn't ready. No click, no denial — the pulse
 * only ever answers a deliberate press.
 */
export function isClickDenied(p: DeniedParams): boolean {
  return p.clicked && (!p.inArc || !p.ready);
}

/** Pulse duration (ms) once triggered — DESIGN.md-scale "brief" red flash. */
export const PULSE_DURATION_MS = 80;
/** Minimum gap (ms) between pulse triggers — click-spam denial reads as one
 *  flash roughly every 1/300ms, not a strobe. */
export const PULSE_RATE_MS = 300;

/**
 * Rate-limited pulse: feed it isClickDenied()'s result once per frame with a
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

/** Cap on remembered predicted-denial keys (FIFO evicted past it) — bounds
 *  memory over a long session; far larger than anything in flight over an RTT. */
export const DEDUP_KEY_CAP = 64;

/**
 * Exactly-one-feedback dedup for denied presses (Story 1.10), keyed by
 * (slot, seq) — the press identity shared with the server's self-private
 * denial channel (DeniedView: fireSeq for weapon clicks, actSeq for ability
 * presses). Contract: feedback = predicted ∪ server-signal —
 *   - a PREDICTED denial fires its feedback instantly and marks the key;
 *   - the matching server denial (~RTT later) is then SUPPRESSED (the echo);
 *   - an UNPREDICTED server denial (the previously-silent stale-ammo races:
 *     within-RTT double press, reload-boundary race, blocked stern drop)
 *     fires the full feedback late-but-explicit.
 * Never zero, never two. Keys are remembered FIFO up to DEDUP_KEY_CAP (a
 * server echo lands within ~RTT, so eviction can never realistically race a
 * live key); serverDenied() also marks, so a duplicate server denial for the
 * same press could never double-fire either.
 */
export class DenialDedup {
  private readonly order: string[] = [];
  private readonly seen = new Set<string>();

  private mark(key: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.order.push(key);
    if (this.order.length > DEDUP_KEY_CAP) this.seen.delete(this.order.shift()!);
  }

  /** A client-side prediction denied this press (feedback already firing). */
  markPredicted(slot: number, seq: number): void {
    this.mark(`${slot}:${seq}`);
  }

  /** A server denial arrived: true iff feedback should fire NOW (the press
   *  was NOT predicted-denied — the previously-silent case). */
  serverDenied(slot: number, seq: number): boolean {
    const key = `${slot}:${seq}`;
    if (this.seen.has(key)) return false; // predicted already fed back — suppress the echo
    this.mark(key);
    return true;
  }

  /**
   * Forget every remembered key. MUST fire at the same hard boundaries that
   * clear the keyboard's activation queue (own sunk / respawn / spectate /
   * reconnect): clearActivations() drops queued presses WITHOUT advancing
   * actCount, so the next press reuses an actSeq a stale key might already
   * hold — a later genuine server denial for that (slot, seq) would then be
   * suppressed as an echo (silent denial) unless the memory is reset here too.
   */
  clear(): void {
    this.order.length = 0;
    this.seen.clear();
  }
}
