// Mouse aiming input. Tracks the cursor's screen position (pointermove) and a
// hold-to-fire latch (button-0 down/up), cleared on blur (stuck-fire guard).
// Firing is HELD, not clicked — the server derives shots from the held flag and
// per-mount cooldowns. World aim is computed at sample time (camera.screenToWorld
// then a bearing from the own ship), kept out of this DOM adapter so the aim
// math stays a pure, unit-testable helper (worldAim below).

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

export class MouseInput {
  private readonly pos: ScreenPoint = { x: 0, y: 0 };
  private firing = false;

  private readonly onMove = (e: PointerEvent): void => {
    this.pos.x = e.clientX;
    this.pos.y = e.clientY;
  };
  private readonly onDown = (e: PointerEvent): void => {
    if (e.button === 0) this.firing = true;
  };
  private readonly onUp = (e: PointerEvent): void => {
    if (e.button === 0) this.firing = false;
  };
  private readonly onBlur = (): void => {
    this.firing = false;
  };

  /** Attach window listeners. Call once on boot. */
  attach(): void {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Detach window listeners. */
  detach(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Current cursor screen position (px). */
  get screenPos(): ScreenPoint {
    return this.pos;
  }

  /** True while button 0 is held (hold-to-fire). */
  get fire(): boolean {
    return this.firing;
  }
}
