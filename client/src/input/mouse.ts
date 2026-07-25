// Mouse aiming input. Tracks the cursor's screen position (pointermove) and a
// cumulative CLICK counter (button-0 pointerdown only) — one shot per click:
// the server consumes each new counter value as exactly one shot request, so
// there is no held-fire latch and nothing to clear on blur (a counter can't
// stick). World aim/distance are computed at sample time (camera.screenToWorld
// then a bearing/distance from the own ship), kept out of this DOM adapter so
// the aim math stays pure, unit-testable helpers (worldAim/worldAimDist below).
//
// Story 2.1 hygiene: fire is CANVAS-TARGET-ONLY — the pointerdown listener
// still lives on the window (DOM overlays with pointer-events pass water
// clicks through with the canvas as target), but only events whose target IS
// the game canvas count a click, so clicking any DOM chrome (refit card, kill
// feed, results) can never fire the gun. The canvas' contextmenu is
// suppressed (right-click must not pop a browser menu over a knife fight),
// and an injected lockout predicate (the refit modal — full combat lockout,
// Eric ruling 2026-07-24) drops even canvas clicks while it holds.
//
// Story 2.2 adds a second injected gate on the same listener: a pointerdown
// whose position lands on a HOTBAR SLOT is that slot's key-equivalent action
// and is swallowed here, so a click on the hotbar can never fire the gun at the
// water beneath it (amendment 11).

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
  private canvas: EventTarget | null = null;
  /**
   * Is the pointer currently INSIDE the window? Deliberately separate from
   * `pos`: the aim path must keep using the last known position (a ship keeps
   * aiming where you left the cursor), while hover-only UI — the hotbar
   * tooltip — must not hang open after the pointer leaves the window entirely.
   * Consumed ONLY by the hotbar's hover; nothing else reads it.
   */
  private inside = false;

  /**
   * @param nowServer Server-clock estimate thunk, injected so this DOM adapter
   *   stays pure of the net layer. Resolved lazily AT pointerdown (never
   *   captured); returns 0 until the first sample lands — 0 flows straight
   *   through as InputMsg.fireT's "no claim" sentinel, which is exactly right.
   * @param isLocked Combat-lockout predicate (the refit modal): while true, NO
   *   pointerdown counts a click — even on the canvas. Feedback-free by design
   *   (the modal owns the player's attention; a swallowed click is the ruling).
   * @param onSlotPress Hotbar gate (Story 2.2, amendment 11): given the
   *   pointerdown's screen position, returns true iff the press landed on a
   *   hotbar slot — in which case it is routed to that slot's key-equivalent
   *   action by the injector and SWALLOWED here (the gun never fires at the
   *   water beneath the hotbar). Pixi does not retarget events, so a click over
   *   the Pixi hotbar has the canvas as its target and would otherwise fire;
   *   this predicate is that gate, and it keeps the hit-test pure (no Pixi
   *   eventMode / interactivity system).
   */
  constructor(
    private readonly nowServer: () => number = () => 0,
    private readonly isLocked: () => boolean = () => false,
    private readonly onSlotPress: (p: ScreenPoint) => boolean = () => false,
  ) {}

  private readonly onMove = (e: PointerEvent): void => {
    this.pos.x = e.clientX;
    this.pos.y = e.clientY;
    this.inside = true;
  };

  /** The pointer left the WINDOW (a null relatedTarget — leaving for another
   *  element inside the page keeps presence). */
  private readonly onOut = (e: PointerEvent): void => {
    if (e.relatedTarget === null) this.inside = false;
  };

  private readonly onBlur = (): void => {
    this.inside = false;
  };

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (e.target !== this.canvas) return; // canvas-target-only: DOM chrome never fires
    if (this.isLocked()) return; // refit modal — full combat lockout
    // Hotbar first: a press over a slot IS that slot's action and never a shot
    // (amendment 11). Suspended-while-modal is already handled above — a locked
    // click reaches neither the hotbar nor the tube.
    this.inside = true;
    if (this.onSlotPress({ x: e.clientX, y: e.clientY })) return;
    this.clicks += 1;
    // Stamp the honest fire instant at pointerdown (not sample time): a click
    // can sit up to a tick in the sampler before it ships. Feeds InputMsg.fireT.
    this.clickT = this.nowServer();
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  /**
   * Attach window listeners + the canvas contextmenu suppression. Call once on
   * boot with the game canvas — the ONLY element whose pointerdowns fire.
   */
  attach(canvas: EventTarget): void {
    this.canvas = canvas;
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerout', this.onOut);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Detach window + canvas listeners. */
  detach(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerout', this.onOut);
    window.removeEventListener('blur', this.onBlur);
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas = null;
  }

  /** Current cursor screen position (px) — the aim source; NEVER cleared. */
  get screenPos(): ScreenPoint {
    return this.pos;
  }

  /** Is the pointer inside the window? Hover-only UI (the hotbar tooltip) reads
   *  this so it can't hang open once the pointer leaves; aiming ignores it. */
  get pointerInside(): boolean {
    return this.inside;
  }

  /** Cumulative button-0 canvas clicks since boot (feeds InputMsg.fireSeq). */
  get clickCount(): number {
    return this.clicks;
  }

  /**
   * Server-clock estimate captured at the most recent counted button-0
   * pointerdown (feeds InputMsg.fireT for D1 fire-time compensation). 0 before
   * any click — the "no claim" sentinel.
   */
  get lastClickT(): number {
    return this.clickT;
  }
}
