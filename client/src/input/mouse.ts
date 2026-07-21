// Mouse aiming input. Tracks the cursor's screen position (pointermove) and a
// cumulative CLICK counter (button-0 pointerdown only) — one shot per click:
// the server consumes each new counter value as exactly one shot request, so
// there is no held-fire latch and nothing to clear on blur (a counter can't
// stick). World aim/distance are computed at sample time (camera.screenToWorld
// then a bearing/distance from the own ship), kept out of this DOM adapter so
// the aim math stays pure, unit-testable helpers (worldAim/worldAimDist below).

/** A screen-space point (px). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Pure: world-space firing bearing (rad) from the own ship at (ox, oy) to a
 * world point. Undefined origin/target degenerates to 0 (harmless — nothing
 * fires until you actually aim into an arc).
 */
export function worldAim(ox: number, oy: number, target: ScreenPoint): number {
  return Math.atan2(target.y - oy, target.x - ox);
}

/**
 * Pure: world-space distance (u) from the own ship at (ox, oy) to a world
 * point — the gun aim-point distance carried on InputMsg.aimDist.
 */
export function worldAimDist(ox: number, oy: number, target: ScreenPoint): number {
  return Math.hypot(target.x - ox, target.y - oy);
}

export class MouseInput {
  private readonly pos: ScreenPoint = { x: 0, y: 0 };
  private clicks = 0;
  private clickT = 0;

  /**
   * Server-clock estimate thunk, injected so this DOM adapter stays pure of the
   * net layer. Resolved lazily AT pointerdown (never captured), so a MouseInput
   * built before the clock exists still stamps the live estimate. `ServerClock.
   * serverNow()` returns 0 until the first sample lands — 0 flows straight
   * through as InputMsg.fireT's "no claim" sentinel, which is exactly right.
   */
  constructor(private readonly nowServer: () => number = () => 0) {}

  private readonly onMove = (e: PointerEvent): void => {
    this.pos.x = e.clientX;
    this.pos.y = e.clientY;
  };
  private readonly onDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.clicks += 1;
      // Stamp the honest fire instant at pointerdown (not sample time): a click
      // can sit up to a tick in the sampler before it ships. Feeds InputMsg.fireT.
      this.clickT = this.nowServer();
    }
  };

  /** Attach window listeners. Call once on boot. */
  attach(): void {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerdown', this.onDown);
  }

  /** Detach window listeners. */
  detach(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
  }

  /** Current cursor screen position (px). */
  get screenPos(): ScreenPoint {
    return this.pos;
  }

  /** Cumulative button-0 clicks since boot (feeds InputMsg.fireSeq). */
  get clickCount(): number {
    return this.clicks;
  }

  /**
   * Server-clock estimate captured at the most recent button-0 pointerdown
   * (feeds InputMsg.fireT for D1 fire-time compensation). 0 before any click —
   * the "no claim" sentinel.
   */
  get lastClickT(): number {
    return this.clickT;
  }
}
