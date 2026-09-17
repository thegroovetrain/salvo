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
//
// Story 8.5 adds the RELEASE EDGE beside the click counter, where the prime's
// auto-revert now happens (UX-DR42: "firing auto-reverts on RELEASE, never on
// press"). It is deliberately NOT canvas-target-only and NOT lockout-gated,
// unlike the click it closes: a press that began on the water is over the
// moment the button comes up, wherever the pointer has since travelled and
// whatever surface has since opened. Gating it would strand a prime armed for a
// trigger the player has already let go of.
//
// THE RELEASE NAMES ITS CLICK (Story 8.5 review fix). A bare release COUNTER
// could not say WHICH hold had ended, and three defects lived in that gap:
//   * a pointerup of click A and the pointerdown of click B inside one 50ms
//     tick were indistinguishable from "B is still held", so the tick paid A's
//     release against B's press and the wrong weapon fired;
//   * a hold whose pointerup never arrived (window blur mid-hold, or a
//     pointercancel from touch/pen) left the debt standing for the next
//     unrelated release to pay;
//   * a SECOND pointer's release closed the first pointer's hold.
// So the adapter tracks the ACTIVE HOLD — the pointerId that pressed and the
// click sequence number it opened — and publishes `releasedClickSeq`: the seq
// of the last click whose hold ENDED. A release from another pointerId is not
// that hold and is ignored; a blur or a pointercancel for the active pointer
// IS (the button may never come back up, and the click has already fired).
// `releaseCount` survives as the raw button-0 tally; nothing branches on it.
//
// Story 8.7 (ruling 9) adds the OTHER way a hold can end: `endHolds()`, which
// main.ts calls when the refit window OPENS. The window's lockout has always
// dropped new presses; this is what closes a stream that was already running
// when it opened, so no hold — and no prime-revert debt — outlives the window.

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

/**
 * jsdom's MouseEvent stand-in (and any synthetic event) carries no pointerId;
 * one synthetic id then stands for "the only pointer there is", which is
 * exactly the single-mouse case every desktop player is in.
 */
const LONE_POINTER_ID = -1;

function pointerIdOf(e: PointerEvent): number {
  return Number.isFinite(e.pointerId) ? e.pointerId : LONE_POINTER_ID;
}

export class MouseInput {
  private readonly pos: ScreenPoint = { x: 0, y: 0 };
  private clicks = 0;
  private clickT = 0;
  private releases = 0;
  /** The pointerId currently holding the trigger (null = no hold open). Only a
   *  release from THIS pointer — or a blur, which ends every hold — closes it. */
  private activePointerId: number | null = null;
  /** The click sequence number that open hold belongs to (`clicks` at its press). */
  private activeClickSeq = 0;
  /** Sequence number of the last click whose hold ENDED; 0 = none yet (clicks
   *  are numbered from 1). Monotonic, so main.ts polls it as an edge. */
  private releasedSeq = 0;
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
    // The window lost focus mid-hold: the pointerup will land somewhere we
    // never hear, so the hold ends HERE rather than standing forever.
    this.endHold(null);
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
    // This press opens a HOLD, owned by this pointer and named by this click's
    // sequence number: only its own end (pointerup/pointercancel from the same
    // pointerId, or a blur) may close it.
    this.activePointerId = pointerIdOf(e);
    this.activeClickSeq = this.clicks;
    // Stamp the honest fire instant at pointerdown (not sample time): a click
    // can sit up to a tick in the sampler before it ships. Feeds InputMsg.fireT.
    this.clickT = this.nowServer();
  };

  /** A button-0 RELEASE — the edge that closes a hold. Counted anywhere (see
   *  the file header): the button is up, so any hold it began is over. It
   *  closes the OPEN hold only when it is that hold's own pointer. */
  private readonly onUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.releases += 1;
    this.endHold(pointerIdOf(e));
  };

  /** The OS took the pointer away (touch/pen gesture, pointer capture loss): no
   *  pointerup is coming, so this is the hold's end. No button check — a
   *  pointercancel carries no meaningful button. */
  private readonly onCancel = (e: PointerEvent): void => {
    this.endHold(pointerIdOf(e));
  };

  /**
   * Close the open hold and publish its click's sequence number. `pointerId`
   * null means "every hold ends" (a window blur — the button may come back up
   * with the page unfocused and never reach us); a non-null id must BE the
   * holding pointer, so a second pointer's release is not this hold's end.
   */
  private endHold(pointerId: number | null): void {
    if (this.activePointerId === null) return;
    if (pointerId !== null && pointerId !== this.activePointerId) return;
    this.releasedSeq = this.activeClickSeq;
    this.activePointerId = null;
  }

  /**
   * END EVERY LIVE HOLD, exactly as a pointerup would (Story 8.7, ruling 9).
   * Called by main.ts's refit-visibility watcher on the window's OPEN edge: the
   * refit modal is a full combat lockout, but the lockout only ever gated the
   * PRESS — a stream already running kept its hold open behind the window, and
   * the pointerup that ends it might land after the player has closed the
   * window, switched weapons or died, paying an owed prime-revert into a
   * trigger they are no longer pulling.
   *
   * It publishes the hold's own click sequence number, so main.ts's release
   * poll pays exactly the debt that click armed — the same edge, from a
   * different cause, which is why it reuses `endHold` rather than inventing a
   * second ending. Counters are untouched: no click is counted, no button-0
   * release is tallied (none happened), and the cursor position is left alone.
   * The keyboard's QUEUED activation presses are deliberately NOT cleared by
   * the caller: an already-queued press is a press.
   */
  endHolds(): void {
    this.endHold(null);
  }

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
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('pointerout', this.onOut);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Detach window + canvas listeners. */
  detach(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
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

  /**
   * Cumulative button-0 RELEASES since boot — the raw tally, kept for
   * diagnostics and for the adapter's own tests. NOT the revert's driver:
   * `releasedClickSeq` is, because a count cannot say which hold ended.
   */
  get releaseCount(): number {
    return this.releases;
  }

  /**
   * Sequence number of the last CLICK whose hold ended (0 before any). This is
   * the prime's release edge: main.ts diffs it once per tick and pays the debt
   * the matching press armed, so a release can only ever revert the prime of
   * the click it actually closed. Nothing rides the wire on it.
   */
  get releasedClickSeq(): number {
    return this.releasedSeq;
  }
}
