// Pure fade state machine (no Pixi import — unit-tested). Drives the 150ms
// fade in/out of sighted contacts: show() ramps alpha toward 1, hide() toward
// 0, both at the same linear rate, reversible mid-fade (a contact that blinks
// back into sight fades back up from wherever it was).

/** Fade duration (ms) for a full 0 → 1 or 1 → 0 ramp. */
export const FADE_MS = 150;

export class Fader {
  /** Current alpha in [0, 1]. */
  alpha: number;
  private target: number;

  constructor(visible = false) {
    this.alpha = visible ? 1 : 0;
    this.target = this.alpha;
  }

  /** Ramp toward fully visible. */
  show(): void {
    this.target = 1;
  }

  /** Ramp toward fully hidden. */
  hide(): void {
    this.target = 0;
  }

  /** True once fully faded out (safe to destroy the faded thing). */
  get hidden(): boolean {
    return this.alpha === 0 && this.target === 0;
  }

  /** Advance by `dtMs`; returns the new alpha. */
  update(dtMs: number): number {
    const step = dtMs / FADE_MS;
    if (this.alpha < this.target) this.alpha = Math.min(this.target, this.alpha + step);
    else if (this.alpha > this.target) this.alpha = Math.max(this.target, this.alpha - step);
    return this.alpha;
  }
}
