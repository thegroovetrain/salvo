// The camera's PURE ZOOM MATH (split out of render/camera.ts at Story 11.8 to
// keep that file near its size cap): absolute spans across the viewport's short
// axis (Story 9.8, epic-9 amendments 127/128), the waypoints (amendments 142 /
// 208) and the log zoom step. camera.ts re-exports every public name here, so
// callers keep importing from './camera.js'.

/**
 * The zoom FACTOR (over the default framing) that shows `spanU` world units
 * across the short axis: defaultSpanU / spanU. The one conversion every
 * absolute framing in this module goes through. A degenerate input returns 1
 * (the plain default framing) rather than a NaN/Infinity factor, which would
 * permanently poison the composed zoom.
 */
export function spanFactor(defaultSpanU: number, spanU: number): number {
  if (!Number.isFinite(defaultSpanU) || defaultSpanU <= 0) return 1;
  if (!Number.isFinite(spanU) || spanU <= 0) return 1;
  return defaultSpanU / spanU;
}

/**
 * THE REVEAL FRAMING FACTOR (Story 5.3, epic-5 amendment 25) — the zoomFactor
 * that frames the WHOLE OCEAN, for the omniscient reveal at your own founder.
 *
 * ABSOLUTE SINCE STORY 9.8 (ruling 127): the reveal shows 2 × mapRadius ×
 * margin world units across the short axis — shortAxis / (2 × mapRadius ×
 * margin) px per u — written directly. As a factor over the default framing
 * that is defaultSpanU / (2 × mapRadius × margin), the same number the old
 * radar-diameter derivation gave while the default framing was 2 × 660 u.
 *
 * `margin` (> 1) is breathing room: it fits a slightly LARGER disc than the map
 * so the ocean's edge is not flush with the short axis. The map radius is the
 * Game's live, roster-dynamic one (Story 6.2), so no literal lives here. A
 * degenerate input returns 1 (the default framing), never NaN.
 */
export function revealZoomFactor(defaultSpanU: number, mapRadius: number, margin: number): number {
  return spanFactor(defaultSpanU, 2 * mapRadius * margin);
}

/**
 * THE RING-FIT SPAN (ruling 127): the live ring's diameter × the fit margin, in
 * world units across the short axis. NaN when the ring is unusable (non-finite
 * or negative radius, or a degenerate margin) — the caller then falls back to
 * the default framing. A radius of exactly 0 (the final ring closed onto its
 * point) is a legitimate span of 0; `userZoomLimits` holds the out limit at
 * the default framing for any fit under it, so r → 0 is continuous.
 */
export function ringFitSpanU(ringRadius: number, margin: number): number {
  if (!Number.isFinite(ringRadius) || ringRadius < 0) return NaN;
  if (!Number.isFinite(margin) || margin <= 0) return NaN;
  return 2 * ringRadius * margin;
}

/**
 * THE USER-ZOOM LIMITS as factors over the default framing (ruling 127):
 * `max` (zoomed fully IN) = defaultSpanU / closeSpanU; `min` (zoomed fully OUT)
 * = defaultSpanU / outSpanU — the whole-map fit since amendment 142
 * (`zoomOutSpanU`; it was the live ring fit in Story 9.8).
 *
 * THE OUT SPAN IS A ZOOM-OUT LIMIT ONLY (Story 9.8 review gate, F3): `min` is
 * never above 1, so the default framing is always reachable. An out span
 * under the default framing stops the out limit AT the default framing — it
 * never forces a captain in toward the close framing. A span of 0 is the same
 * case, and an unusable one (NaN) falls back to the default framing too.
 */
export function userZoomLimits(
  defaultSpanU: number,
  closeSpanU: number,
  outSpanU: number,
): { min: number; max: number } {
  const max = spanFactor(defaultSpanU, closeSpanU);
  const fit = Number.isNaN(outSpanU) || outSpanU <= 0 ? 1 : defaultSpanU / outSpanU;
  return { min: Math.min(1, max, fit), max };
}

/** A span (u) that can frame anything: finite and positive. */
export function usableSpan(spanU: number): boolean {
  return Number.isFinite(spanU) && spanU > 0;
}

/** Every input finite and positive. */
function allUsable(...xs: number[]): boolean {
  return xs.every(usableSpan);
}

/**
 * THE INTEL FIT SPAN (Eric 2026-10-19, epic-9 amendment 208: *"insert a
 * 'waypoint' in between them that keeps the camera centered until I have
 * zoomed out to my entire intel area, which should have a bit of clearance
 * around it so that the hotbar isn't covering it up."*), in world units across
 * the short axis.
 *
 * The own ship sits at the exact screen center (H/2) in FOLLOW (Story 11.8
 * retired the follow lead). The fit covers a radius E = R·m (m = the fit
 * margin, the clearance): the disc's bottom edge clears the bar's top edge
 * when H/2 + E·z ≤ H − inset, its sides when W/2 ≥ E·z (the top is symmetric
 * with the bottom, so implied). The widest zoom that holds both is
 * z = min(H/2 − inset, W/2) / E px per u, i.e. a span of min(W, H) / z.
 * Everything in REAL px: `bottomInsetPx` is the bar's logical inset × the UI
 * scale. NaN when unusable (no room above the bar, a missing radius or margin,
 * a degenerate viewport or inset) — the caller then falls back to the default
 * framing.
 */
export function intelFitSpanU(viewW: number, viewH: number, bottomInsetPx: number, radiusU: number, margin: number): number {
  if (!allUsable(viewW, viewH, radiusU, margin)) return NaN;
  if (!Number.isFinite(bottomInsetPx)) return NaN;
  const room = Math.min(viewH / 2 - Math.max(0, bottomInsetPx), viewW / 2);
  if (!(room > 0)) return NaN;
  return (Math.min(viewW, viewH) * radiusU * margin) / room;
}

/**
 * THE ZOOM-OUT SPAN (Eric 2026-10-14, amendment 142: *"Maybe we shouldn't cap
 * the zoom out to the current ring. Instead lets set the current ring as a sort
 * of 'waypoint' and from there you could zoom out to the entire map, even the
 * stormed-out bits."*): the WHOLE MAP fit (2 × mapRadius × margin, the reveal's
 * own framing), storm and all. Never tighter than the live ring fit (the ring
 * never outgrows the map, but a junk feed must not put the waypoint past the
 * limit). Before the map radius is known it falls back to the ring fit; NaN
 * when neither is usable (`userZoomLimits` then holds the default framing).
 */
export function zoomOutSpanU(mapSpanU: number, ringSpanU: number): number {
  const m = Math.max(usableSpan(mapSpanU) ? mapSpanU : 0, usableSpan(ringSpanU) ? ringSpanU : 0);
  return m > 0 ? m : NaN;
}

/**
 * THE RING WAYPOINT (amendment 142) as a span: the live ring fit, never
 * tighter than the floor span (so after the final close, or before any ring,
 * the waypoint IS the floor). Every zoom step that would cross it lands exactly
 * on it (`stepZoom`); the next step continues past it. The spectate camera
 * floors it at the default framing; the alive camera at the intel waypoint
 * (amendment 208), so a ring fit at or inside the intel span merges into it.
 */
export function detentSpanU(defaultSpanU: number, ringSpanU: number): number {
  return usableSpan(ringSpanU) ? Math.max(defaultSpanU, ringSpanU) : defaultSpanU;
}

/**
 * THE KEY / WHEEL ZOOM STEP (Story 9.8, ruling 127). MULTIPLICATIVE in the
 * factor: `amount` is the logarithmic step, so next = f × e^amount. The X/Z
 * keys pass ±keyStep (0.1), the wheel −deltaY × wheelRate (0.0008/unit).
 *
 * Why not today's additive step: the range now runs from the close framing
 * (1.5×) down to a ring fit near 0.2× on a big ocean, and a fixed +0.1 is a
 * ~10 % step at the default framing but a ~50 % jolt at the ring fit. A log
 * step is the same PERCEIVED step everywhere, and at today's framings it is
 * today's feel: around the default framing e^±0.1 = ×1.105 / ×0.905 against
 * the old ±0.1, and one 100-unit wheel notch e^−0.08 = ×0.923 against the old
 * −0.08. A non-finite amount returns the factor unchanged.
 *
 * `detents` (amendment 142; a list since amendment 208) are the waypoints as
 * factors: the spectate ring waypoint (Camera.zoomDetent) or the alive pair
 * [intel, ring] (Camera.aliveZoomDetents). A step that would CROSS any of them
 * from either side lands exactly on the FIRST one crossed (the one nearest the
 * starting factor) and the rest of the step is dropped (a wheel event's whole
 * delta is one step); a step that STARTS on one moves on. Omitted or unusable
 * = a free step.
 */
export function stepZoom(factor: number, amount: number, detents?: number | readonly number[]): number {
  if (!Number.isFinite(amount)) return factor;
  const next = factor * Math.exp(amount);
  return firstCrossed(factor, next, detentList(detents)) ?? next;
}

/** The detent argument of `stepZoom` as a list. */
function detentList(detents: number | readonly number[] | undefined): readonly number[] {
  if (detents === undefined) return [];
  return typeof detents === 'number' ? [detents] : detents;
}

/** Among the usable detents strictly crossed by from → to, the one nearest
 *  `from`; undefined when none is crossed. */
function firstCrossed(from: number, to: number, detents: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const d of detents) {
    if (!usableSpan(d) || (from - d) * (to - d) >= 0) continue;
    if (best === undefined || Math.abs(d - from) < Math.abs(best - from)) best = d;
  }
  return best;
}

/**
 * THE alive-only gate for user zoom (X/Z + wheel), pure so it is testable apart
 * from main.ts's bootstrap glue. Zoom applies ONLY to a genuinely-alive captain:
 * spectators use the separate spectate zoom-out path, and a MISSING own ship
 * (`alive` undefined — pre-join, pre-first-frame, between lives) is treated as
 * NOT alive. Checking `alive === false` instead would let zoom (and the fog
 * re-bake it schedules) run before the first frame ever arrives.
 */
export function canUserZoom(spectating: boolean, alive: boolean | undefined): boolean {
  return !spectating && alive === true;
}
