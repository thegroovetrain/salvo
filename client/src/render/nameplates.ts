// Truesight nameplates (Story 1.13) — a screen-space callsign label floated
// above every truesight combatant hull (own ship + contacts). The plates live in
// their OWN screen-space container (render/stage.ts's plateRoot), NOT as children
// of the camera-scaled world root or the heading-rotating ShipView.gfx: the text
// holds a constant hud-micro screen size (mono 9px, 0.18em tracking, uppercase)
// at any zoom and never tilts with the hull. Each plate is positioned per frame
// at its hull's PROJECTED screen position (the same camera transform the hull
// gets) and bottom-center anchored above the hull's bounding circle.
//
// Latch discipline (mirrors render/contacts.ts tryRecolor / render/hueLatch.ts):
// a plate's text + color are resolved ONCE — the moment the roster name/hue land —
// then latched. A human contact whose name/color hasn't synced gets NO plate (we
// never render a session id); once latched, the plate persists even if the player
// later leaves the roster. Per-frame work is position + alpha writes only (Pixi
// re-rasterizes Text on .text assignment, so the driver only calls set() once).

import { Container, Text } from 'pixi.js';
import { hullSilhouette, polygonMaxRadius, HULL_IDS, type HullId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { textSafe } from '../util/color.js';
import { ellipsizeName, NAME_MAX } from '../util/text.js';
import { PLAYER_HUES } from './ships.js';

const C = CLIENT_CONFIG.colors;

/** Constant screen font size (px) — the DESIGN hud-micro floor; plates never
 *  scale with camera zoom (they live in screen space), so this holds at 0.5×. */
export const PLATE_FONT_PX = 9;

/** hud-micro register in Pixi (DESIGN §Typography): mono, 9px, 0.18em tracking
 *  (= 9 × 0.18 = 1.62px). Uppercase is applied in code (Pixi has no
 *  text-transform); `fill` is set per-plate on resolve (mirrors hud.ts). */
const PLATE_STYLE = {
  fontFamily: CLIENT_CONFIG.type.mono,
  fontSize: PLATE_FONT_PX,
  letterSpacing: PLATE_FONT_PX * 0.18, // hud-micro 0.18em tracking (= 9 × 0.18 = 1.62px)
} as const;

/** Display text for a callsign: mid-ellipsized to the shared cap on the RAW name
 *  first, THEN uppercased — so the kill feed and the plate agree on which
 *  characters survive the ellipsis (the feed ellipsizes the same raw name).
 *  toUpperCase() can EXPAND code points ('ß'→'SS', 'ﬁ'→'FI'), so if the
 *  uppercased result overruns NAME_MAX we re-ellipsize the uppercased string. */
export function plateText(name: string): string {
  const up = ellipsizeName(name).toUpperCase();
  return [...up].length > NAME_MAX ? ellipsizeName(up) : up;
}

/** Plate text color: a drone is the `droneOutline` grey VERBATIM (never through
 *  textSafe); a human is its personal hue's text-safe (≥4.5:1) variant. The
 *  caller only passes a human `hueIndex` once it has resolved (non-null). */
export function plateColor(hueIndex: number, isDrone: boolean): number {
  // `?? amber` guards an out-of-range index so textSafe never gets undefined —
  // belt-and-braces like the 1.12 siblings (amber is the roster-miss fallback).
  return isDrone ? C.droneOutline : textSafe(PLAYER_HUES[hueIndex] ?? C.amber);
}

/** The plate a hull should show, or null when it cannot yet resolve (the latch
 *  gate): a drone always resolves to the literal "DRONE" (never its roster
 *  "DRONE-NN" name); a human needs BOTH a synced name and a hue index. */
export function resolvePlate(
  name: string | null,
  hueIndex: number | null,
  isDrone: boolean,
): { text: string; color: number } | null {
  if (isDrone) return { text: 'DRONE', color: plateColor(0, true) };
  if (name === null || hueIndex === null) return null;
  // Strip control chars only (a newline must never reach Pixi as a multi-line
  // plate) — KEEP format chars (\p{Cf}) so emoji ZWJ sequences survive intact.
  // A name that is empty or ALL whitespace/format chars can't latch a blank
  // plate: treat as unresolved (null) so the driver keeps retrying.
  const stripped = name.replace(/\p{Cc}/gu, '');
  if ([...stripped].every((ch) => /[\s\p{Cf}]/u.test(ch))) return null;
  return { text: plateText(stripped), color: plateColor(hueIndex, false) };
}

/** One latch step for a plate driver: given the current latch flag + resolver
 *  inputs, the plate to SET this frame (null = set nothing) and the next latch.
 *  Once latched it never re-resolves — the plate persists even if the roster
 *  entry later vanishes (name/hue back to null). */
export function latchPlate(
  latched: boolean,
  name: string | null,
  hueIndex: number | null,
  isDrone: boolean,
): { plate: { text: string; color: number } | null; latched: boolean } {
  if (latched) return { plate: null, latched: true };
  const plate = resolvePlate(name, hueIndex, isDrone);
  return { plate, latched: plate !== null };
}

/** Plate offset radius (world u) per hull id — each hull's silhouette
 *  bounding-circle radius, computed ONCE at module load (HULL_IDS covers the
 *  three classes + the three drone ids) so plateScreenY runs no per-frame
 *  polygon scan in the render hot path. */
const PLATE_OFFSET_R: Readonly<Record<HullId, number>> = Object.fromEntries(
  HULL_IDS.map((id) => [id, polygonMaxRadius(hullSilhouette(id))]),
) as Record<HullId, number>;

/** Bottom-edge screen-y for a plate floated above a hull: above the hull's
 *  bounding circle (world radius × zoom) plus a constant screen-space pad. The
 *  offset scales with zoom (the hull shrinks) while the font size does not. */
export function plateScreenY(shipScreenY: number, hullId: HullId, zoom: number, pad: number): number {
  return shipScreenY - PLATE_OFFSET_R[hullId] * zoom - pad;
}

/**
 * The screen-space plate container: one Pixi Text per hull id, created lazily on
 * resolve and destroyed with its contact view. Thin over the pure helpers above —
 * it only owns Pixi lifecycle (create/position/alpha/destroy).
 */
export class NameplateLayer {
  private plates = new Map<string, Text>();

  constructor(private readonly layer: Container) {}

  /** True once a plate has been created (latched) for this id. */
  has(id: string): boolean {
    return this.plates.has(id);
  }

  /** Create (lazily) + latch a plate's text/color — called ONCE by the driver
   *  when the name/hue first resolve. Diff-before-assign guards the text (Pixi
   *  re-rasterizes on assignment); fill is a cheap per-plate style write. */
  set(id: string, text: string, color: number): void {
    let t = this.plates.get(id);
    if (!t) {
      t = new Text({ text, style: PLATE_STYLE });
      t.anchor.set(0.5, 1); // bottom-center: the plate floats above the hull
      this.layer.addChild(t);
      this.plates.set(id, t);
    } else if (t.text !== text) {
      t.text = text;
    }
    t.style.fill = color;
  }

  /** Per-frame position (screen px) + alpha for a resolved plate. No text/color
   *  churn. A no-op for an id without a latched plate (nothing to place). */
  place(id: string, x: number, y: number, alpha: number): void {
    const t = this.plates.get(id);
    if (!t) return;
    t.position.set(x, y);
    t.alpha = alpha;
    t.visible = alpha > 0;
  }

  /** Hide a resolved plate without destroying it (own hull on spectate/sunk). */
  hide(id: string): void {
    const t = this.plates.get(id);
    if (t) t.visible = false;
  }

  /** Destroy a plate (its contact view was pruned). */
  remove(id: string): void {
    const t = this.plates.get(id);
    if (t) {
      t.destroy();
      this.plates.delete(id);
    }
  }
}
