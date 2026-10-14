// Spectator camera math — pure helpers (no Pixi), unit-tested. Drives the
// death → spectate mode: follow-your-killer by default, WASD free pan, and
// wheel / X-Z zoom. SINCE ERIC'S 2026-10-14 RULING (*"The full zoom-out needs to
// apply to spectate mode, as well … localized around my mouse cursor"*) the
// spectate zoom range IS the alive range (Camera.spectateZoomLimits = the close
// framing in, the live ring fit out) and every spectate zoom anchors at the
// cursor (Camera.zoomAbout); the old fixed 2,640–1,320 u spans are gone.
//
// THESE TWO ARE THE MANUAL-CONTROL SEAM (Story 5.3, amendment 25). Both feed a
// Camera mutator — `wheelZoom` → `Camera.zoomAbout` (→ setZoomFactor),
// `spectatePan` → `Camera.pan` — and BOTH of those mutators release the reveal
// framing, so taking the camera by hand always hands it back to the clamped
// spectate path. The release lives on the camera rather than here on purpose:
// these helpers are pure arithmetic that hold no camera and no mode, and a "did
// the player touch it" flag threaded through them would be a second place to
// forget. The resulting whole-map → clamp pop on the first wheel notch is
// ledgered and accepted (see Camera.setZoomFactor).

import { stepZoom } from './camera.js';
import { CLIENT_CONFIG } from '../config.js';
import type { Axes } from '../input/keyboard.js';

/** Free-pan speed at zoomFactor 1 — the default framing (world units per second). */
export const SPECTATE_PAN_SPEED = 600;

/**
 * World-space pan delta for one render frame. W pans up (screen -y), S down,
 * A left, D right; speed scales inversely with zoom so a zoomed-out spectator
 * crosses the same SCREEN distance per second.
 */
export function spectatePan(axes: Axes, dt: number, zoomFactor: number): { dx: number; dy: number } {
  // A degenerate factor pans at the default-framing speed rather than at an
  // infinite / NaN one (the camera never holds one, but the helper is pure).
  const f = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  const speed = SPECTATE_PAN_SPEED / f;
  return { dx: axes.rudder * speed * dt, dy: -axes.throttle * speed * dt };
}

/** Wheel input → new (UNCLAMPED) zoom factor: scroll down zooms out. The same
 *  log step the alive wheel uses (stepZoom × CLIENT_CONFIG.zoom.wheelRate) —
 *  the spectate range is the alive range now, so it gets the alive step; the
 *  camera's setZoomFactor / zoomAbout applies the clamp. */
export function wheelZoom(current: number, deltaY: number): number {
  return stepZoom(current, -deltaY * CLIENT_CONFIG.zoom.wheelRate);
}

/**
 * Whether this frame's driving axes should latch spectate into free-pan mode.
 * Callers MUST clear the keyboard's held-key set on the death -> spectate
 * transition (KeyboardInput.clearKeys, wired from main.ts's onSpectate hook)
 * before reading axes() here — otherwise WASD held at the moment of death
 * reads as nonzero on the very first spectate frame and this latches
 * permanently, defeating the follow-your-killer default (see FINDING 1).
 * This predicate itself is intentionally dumb: any nonzero axis latches.
 */
export function shouldEngageFreePan(axes: Axes): boolean {
  return axes.throttle !== 0 || axes.rudder !== 0;
}

/**
 * The ship to follow while spectating: the killer when still afloat (its id
 * comes from the own sunk event's `by`, absent for storm deaths), otherwise
 * any alive ship, otherwise nobody (hold position).
 */
export function pickSpectateTarget(
  killerId: string | null,
  aliveIds: readonly string[],
): string | null {
  if (killerId !== null && aliveIds.includes(killerId)) return killerId;
  return aliveIds[0] ?? null;
}
