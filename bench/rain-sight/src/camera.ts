// Zoom + pan for every bench view. One Cam per view family (the ship views share
// one, Radar and Storm have their own). The mouse wheel zooms smoothly — about
// the cursor when the camera is free, about the followed thing when it follows
// a ship or the observer; left-drag pans (and stops following); double-click
// goes Home. A click that did not drag is handed back (pop smoke).

export interface Cam {
  x: number;
  y: number;
  /** u across the viewport's short axis (what is drawn). */
  span: number;
  /** u the wheel is easing `span` toward. */
  target: number;
  /** -1 the observer, ≥ 0 a ship index, -2 free (panned). */
  follow: number;
}

/** A panel's screen rect (px, relative to the canvas). */
export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FOLLOW_OWN = -1;
export const FREE = -2;

export const ppuOf = (c: Cam, vp: Viewport): number => Math.min(vp.w, vp.h) / c.span;

/** Screen px (canvas-relative) → world u through `c` in `vp`. */
export function screenToWorld(c: Cam, vp: Viewport, sx: number, sy: number, span = c.span): { x: number; y: number } {
  const ppu = Math.min(vp.w, vp.h) / span;
  return { x: c.x + (sx - vp.x - vp.w / 2) / ppu, y: c.y + (sy - vp.y - vp.h / 2) / ppu };
}

export interface CamHost {
  /** The active view's camera (null: nothing to steer). */
  cam(): Cam | null;
  /** The panel under a canvas point, or null. */
  hit(sx: number, sy: number): Viewport | null;
  minSpan: number;
  maxSpan: number;
  /** A click that did not drag (canvas px), with the panel it landed on. */
  click(sx: number, sy: number, vp: Viewport, e: PointerEvent): void;
  home(): void;
}

const DRAG_PX = 4;
const EASE_MS = 70; // the wheel's smoothing time constant

export class CamControl {
  private anchor: { sx: number; sy: number; vp: Viewport } | null = null;
  private drag: { id: number; sx: number; sy: number; lx: number; ly: number; vp: Viewport; moved: boolean } | null = null;

  constructor(private readonly el: HTMLElement, private readonly host: CamHost) {
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => (this.drag = null));
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.anchor = null;
      host.home();
    });
  }

  private local(e: MouseEvent): { sx: number; sy: number } {
    const r = this.el.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  private clamp(span: number): number {
    return Math.max(this.host.minSpan, Math.min(this.host.maxSpan, span));
  }

  private wheel(e: WheelEvent): void {
    const c = this.host.cam();
    if (!c) return;
    const { sx, sy } = this.local(e);
    const vp = this.host.hit(sx, sy);
    if (!vp) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const k = e.ctrlKey ? 0.01 : 0.0015; // a trackpad pinch arrives as ctrl + small deltas
    c.target = this.clamp(c.target * Math.exp(e.deltaY * unit * k));
    this.anchor = c.follow === FREE ? { sx, sy, vp } : null;
  }

  /** Ease the active camera's span toward its target (call once per frame). */
  step(dtMs: number): void {
    const c = this.host.cam();
    if (!c || c.span === c.target) return;
    const before = this.anchor && c.follow === FREE ? screenToWorld(c, this.anchor.vp, this.anchor.sx, this.anchor.sy) : null;
    const f = Math.exp(-dtMs / EASE_MS);
    c.span = c.target + (c.span - c.target) * f;
    if (Math.abs(c.span - c.target) / c.target < 0.002) c.span = c.target;
    if (before && this.anchor) {
      // keep the world point under the cursor still
      const ppu = ppuOf(c, this.anchor.vp);
      c.x = before.x - (this.anchor.sx - this.anchor.vp.x - this.anchor.vp.w / 2) / ppu;
      c.y = before.y - (this.anchor.sy - this.anchor.vp.y - this.anchor.vp.h / 2) / ppu;
    }
  }

  /** Set the span outright (the slider / the test hook): no easing, about the view center. */
  setSpan(c: Cam, span: number): void {
    c.span = c.target = this.clamp(span);
    this.anchor = null;
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const { sx, sy } = this.local(e);
    const vp = this.host.hit(sx, sy);
    if (!vp) return;
    this.drag = { id: e.pointerId, sx, sy, lx: sx, ly: sy, vp, moved: false };
    this.el.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const c = this.host.cam();
    if (!c) return;
    const { sx, sy } = this.local(e);
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < DRAG_PX) return;
    if (!d.moved) {
      d.moved = true;
      c.follow = FREE; // panning stops following
      this.anchor = null;
    }
    const ppu = ppuOf(c, d.vp);
    c.x -= (sx - d.lx) / ppu;
    c.y -= (sy - d.ly) / ppu;
    d.lx = sx;
    d.ly = sy;
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (!d.moved) this.host.click(d.sx, d.sy, d.vp, e);
  }
}
