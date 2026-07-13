// Spectator camera math — pure helpers (no Pixi), unit-tested. Drives the
// death → spectate mode: follow-your-killer by default, WASD free pan, and
// mouse-wheel zoom OUT (spectators only, clamped [0.5x, 1x]).

import { SPECTATE_ZOOM_MIN, SPECTATE_ZOOM_MAX } from './camera.js';
import type { Axes } from '../input/keyboard.js';

/** Free-pan speed at zoomFactor 1 (world units per second). */
export const SPECTATE_PAN_SPEED = 600;

/** Wheel-to-zoom sensitivity (zoomFactor per deltaY unit). */
const WHEEL_ZOOM_RATE = 0.0008;

/**
 * World-space pan delta for one render frame. W pans up (screen -y), S down,
 * A left, D right; speed scales inversely with zoom so a zoomed-out spectator
 * crosses the same SCREEN distance per second.
 */
export function spectatePan(axes: Axes, dt: number, zoomFactor: number): { dx: number; dy: number } {
  const speed = SPECTATE_PAN_SPEED / Math.max(zoomFactor, SPECTATE_ZOOM_MIN);
  return { dx: axes.rudder * speed * dt, dy: -axes.throttle * speed * dt };
}

/** Wheel input → new zoom factor: scroll down zooms out, clamped [0.5, 1]. */
export function wheelZoom(current: number, deltaY: number): number {
  const next = current - deltaY * WHEEL_ZOOM_RATE;
  return Math.min(SPECTATE_ZOOM_MAX, Math.max(SPECTATE_ZOOM_MIN, next));
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
