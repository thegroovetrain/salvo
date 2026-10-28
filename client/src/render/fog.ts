// Screen-space fog overlay. The pre-baked fog texture (dark fill + feathered
// sight hole at its center) is positioned every frame so the hole tracks the
// own ship's SCREEN position; it is re-baked whenever the baked hole radius
// goes stale — on resize, and (Story 2.1) on an alive USER ZOOM change, since
// the hole radius is derived from the composed zoom. main.ts debounces both to
// the trailing edge of a burst. Fog is cosmetic and MOSTLY
// redundant — the server culls almost everything outside sight — it just sells
// the reveal. The ONE exception (Story 1.7): the server reveals enemy
// ships/mines/ballistics inside the firer's own star-shell lit zones (truesight
// parity), and those render in worldRoot BENEATH this overlay. So owned lit
// zones punch extra holes here (updateHoles) via an INVERSE geometry mask on the
// fog sprite — the fog simply is not drawn inside those circles, revealing the
// unfogged world under them (an alpha 'erase' would only blacken the
// already-composited world, not reveal it). Enemy zones never clear your fog
// (you gain no vision from them — their amber circle stays a marker only).
//
// Z-order (verified against stage.ts): worldRoot (shells/wake/mines, fogged) →
// fogSprite (this) → chartRoot (islands/blips/HULLS/sweep, fog-immune) → hudRoot.
// HULLS ARE NO LONGER UNDER THIS OVERLAY (this cycle): they moved into chartRoot
// so radar paint stops covering the ships it represents, which means the sight-
// boundary softening this composite used to give them was mirrored per hull by
// `hullSightSoftness` below — retired by epic-9 amendment 212 (cycle 203):
// delivered hulls draw at full alpha. Thin Pixi adapter (not unit tested); the hole participation + fade
// math it consumes are the pure functions in render/litZones.ts.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG, effectiveSight, type EffectiveStats } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { FOG_FILL_ALPHA, bakeFogTexture } from './textures.js';

/** The observer's two vision ranges, as the stat plumbing carries them; the
 *  sight derivation (`effectiveSight`, shared/src/sim/sight.ts) reads the
 *  sight half. */
export type VisionRanges = Pick<EffectiveStats, 'sightRange' | 'radarRange'>;

/**
 * Pure: the world-space radius (u) the fog's sight hole is baked at — the
 * observer's effective truesight: the boon-widened sight range, or
 * `sightRange × CONFIG.flashShells.sightFraction` while an enemy FLASH SHELLS
 * burst holds this ship (Story 8.17; restored by Story 10.9 at 1/4 of SIGHT,
 * epic-10 amendment 4 ruling 1). It is the SHARED `effectiveSight` — the very
 * function the server's perception (`sightOf`) calls for a dazzled observer —
 * never a local factor, which is the whole point: an un-shrunk hole would draw
 * clear water where the server reveals nothing, i.e. the fog circle would LIE.
 *
 * (Story 9.3, epic-9 amendment 40, deleted the in-smoke argument: a
 * countermeasure cloud never shrinks the hole.)
 */
export function fogHoleRadiusU(ranges: VisionRanges, dazzled: boolean): number {
  return effectiveSight(ranges, dazzled);
}

/**
 * Pure: the alpha multiplier a HULL wears at `_distU` from own hull — now 1,
 * always.
 *
 * THE FEATHER IS RETIRED (Eric 2026-10-21, cycle 203, epic-9 amendment 212):
 * *"ships are being visually hidden while they are still near the edge of my
 * sight range, and that should not be the case."* This used to mirror the fog
 * composite's hole feather per hull (`1 − FOG_FILL_ALPHA × feather` across
 * `HOLE_FEATHER_START × sight → sight`), which drew a contact at the rim of the
 * bubble at 15 % alpha. The fog composite's hole feather is the fog's look on
 * the WATER; a contact the server delivers is never softened. The 150 ms sight
 * fade (render/fade.ts) alone takes a hull off when the server stops sending it.
 *
 * KEPT, NOT DELETED, so its callers (main.ts `hullSoftnessFor`, and through it
 * the hull, the aggro mark and the nameplate — render/contacts.ts) need no
 * change. Every input, finite or garbage (NaN, non-positive sight), reads as 1:
 * the hull is VISIBLE, the direction every unwired render path fails.
 */
export function hullSightSoftness(_distU: number, _sightU: number): number {
  return 1;
}

/** One fog-clearing hole in SCREEN space: center + (fade-scaled) radius, px. */
export interface FogHole {
  sx: number;
  sy: number;
  sr: number;
}

/**
 * Extra bake margin (px) beyond camera lead: shake headroom (step 11) + slack.
 * Exported so render/shake.ts can clamp its peak magnitude to the same budget
 * — the fog overlay must never expose a screen edge, however hard the hit.
 */
export const EXTRA_MARGIN_PX = 64;

/**
 * Pure: has the composed zoom drifted far enough from the zoom the fog was last
 * baked at to need a re-bake (Story 9.8)? True past `frac` of the baked zoom —
 * the same 2 % sub-pixel precedent the terrain and storm layers redraw on — and
 * always true before any bake (a non-finite or non-positive baked zoom). This is
 * the hysteresis that keeps a ring-fit zoom limit, which moves every tick while
 * the ring closes, from re-baking the full-canvas fog every frame.
 */
export function fogZoomStale(bakedZoom: number, zoom: number, frac: number): boolean {
  if (!Number.isFinite(bakedZoom) || bakedZoom <= 0) return true;
  if (!Number.isFinite(zoom)) return false;
  return Math.abs(zoom - bakedZoom) > bakedZoom * frac;
}

/** A screen-space rectangle (px). */
export interface FogRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pure: the screen strips the baked fog sprite does NOT cover (Story 9.8). The
 * sprite is the screen plus a lead/shake margin, centred on the own hull; while
 * the camera centre SLIDES toward the ring centre (ruling 128) the hull can sit
 * far from screen centre, past any affordable margin, and the far side of the
 * screen would show unfogged water. These strips (left, right, then top and
 * bottom between them) are filled flat with the fog's own colour and alpha so
 * the overlay covers the whole screen at any slide. Empty when the sprite
 * covers the screen (every frame at and inside the default framing).
 *
 * `sx`/`sy` is the sprite's top-left, `sw`/`sh` its size, `vw`/`vh` the screen.
 */
export function fogFrameRects(sx: number, sy: number, sw: number, sh: number, vw: number, vh: number): FogRect[] {
  const l = Math.min(vw, Math.max(0, sx));
  const r = Math.max(l, Math.min(vw, sx + sw));
  const t = Math.min(vh, Math.max(0, sy));
  const b = Math.max(t, Math.min(vh, sy + sh));
  const out: FogRect[] = [];
  if (l > 0) out.push({ x: 0, y: 0, w: l, h: vh });
  if (r < vw) out.push({ x: r, y: 0, w: vw - r, h: vh });
  if (t > 0 && r > l) out.push({ x: l, y: 0, w: r - l, h: t });
  if (b < vh && r > l) out.push({ x: l, y: b, w: r - l, h: vh - b });
  return out;
}

export class Fog {
  /** Sprite + frame strips; the lit-zone inverse mask applies to this whole
   *  group, so a far own flare clears the strips too. */
  private readonly root = new Container();
  private readonly sprite: Sprite;
  /** The flat fog strips around the sprite while the camera slides (Story 9.8,
   *  fogFrameRects). Redrawn only when the strip set changes. */
  private readonly frame = new Graphics();
  private frameKey = '';
  /** The zoom and viewport of the last bake (fogZoomStale, fogFrameRects). */
  private bakedZoomValue = NaN;
  private viewW = 0;
  private viewH = 0;
  /** Inverse mask that punches star-shell lit-zone holes in the fog sprite —
   *  its filled circles become the CLEARED regions (setMask inverse). Empty when
   *  no owned zone is active, in which case the mask is detached so the fog
   *  renders normally everywhere. Screen-space sibling of the fog sprite. */
  private readonly holeMask = new Graphics();
  private holesActive = false;
  /** Effective sight AND radar radii (u) the hole is derived from — swapped
   *  by a boon via setSightRange(); base = CONFIG.vision. */
  private ranges: VisionRanges = { sightRange: CONFIG.vision.sight, radarRange: CONFIG.vision.radar };
  /** Is the own ship dazzled by an enemy FLASH SHELLS burst right now (the
   *  victim-private you.dazzledUntil)? While true the baked hole shrinks to
   *  `effectiveSight(…, true)`, because the SERVER is already perceiving this
   *  ship that way: an un-shrunk hole would draw clear water where the server
   *  reveals nothing, i.e. the fog circle would lie. */
  private dazzled = false;

  constructor(layer: Container) {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5); // hole is baked at the texture center
    this.root.addChild(this.frame, this.sprite);
    layer.addChild(this.root);
    layer.addChild(this.holeMask); // in the scene graph so its transform resolves
  }

  /** Adopt new (effective) sight and radar radii. Callers must rebake()
   *  after — same path as a resize — so the baked hole matches the server's
   *  fog. */
  setSightRange(sightRange: number, radarRange: number): void {
    this.ranges = { sightRange, radarRange };
  }

  /**
   * Adopt the DAZZLE state (Story 2.8; a FLASH SHELLS burst since 8.17,
   * restored by 10.9). Returns TRUE when the baked hole went stale (the state
   * actually flipped) so the caller can rebake on exactly the two frames per
   * dazzle event that need it — never per frame. Deliberately un-animated: the
   * hole simply IS smaller while the dazzle holds (motion/accessibility — the
   * information is carried by the radius, not by movement).
   */
  setDazzled(dazzled: boolean): boolean {
    if (dazzled === this.dazzled) return false;
    this.dazzled = dazzled;
    return true;
  }

  /** Is the dazzle currently held? Test/observation seam. */
  get isDazzled(): boolean {
    return this.dazzled;
  }

  /** The radius (u) this instance's hole is baked at (the pure rule above). */
  private holeRadiusU(): number {
    return fogHoleRadiusU(this.ranges, this.dazzled);
  }

  /** The composed zoom of the last bake (NaN before the first). */
  get bakedZoom(): number {
    return this.bakedZoomValue;
  }

  /** (Re)bake for a viewport + zoom. Call at boot, on every resize, and after
   *  a sight/radar (zoom) stat change. */
  rebake(viewW: number, viewH: number, zoom: number): void {
    this.bakedZoomValue = zoom;
    this.viewW = viewW;
    this.viewH = viewH;
    const old = this.sprite.texture;
    const margin = CLIENT_CONFIG.camera.leadMax * zoom + EXTRA_MARGIN_PX;
    this.sprite.texture = bakeFogTexture(viewW, viewH, this.holeRadiusU() * zoom, margin);
    if (old !== Texture.EMPTY) old.destroy(true);
  }

  /** Track the own ship: place the baked hole on its screen position, and
   *  fill whatever the sprite no longer covers (the centre slide, Story 9.8).
   *  The sprite's top-left is snapped to whole pixels (the hole moves < 0.5 px)
   *  so its edges meet the strips without a coverage seam. */
  update(holeScreenX: number, holeScreenY: number): void {
    const tex = this.sprite.texture;
    const left = Math.round(holeScreenX - tex.width / 2);
    const top = Math.round(holeScreenY - tex.height / 2);
    this.sprite.position.set(left + tex.width / 2, top + tex.height / 2);
    this.drawFrame(fogFrameRects(left, top, tex.width, tex.height, this.viewW, this.viewH));
  }

  private drawFrame(rects: readonly FogRect[]): void {
    const key = rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';');
    if (key === this.frameKey) return;
    this.frameKey = key;
    const g = this.frame;
    g.clear();
    for (const r of rects) g.rect(r.x, r.y, r.w, r.h).fill({ color: CLIENT_CONFIG.colors.fogBase, alpha: FOG_FILL_ALPHA });
  }

  /**
   * Redraw the owned-lit-zone fog holes (Story 1.7). Each `FogHole` is a
   * SCREEN-space circle (its radius already fade-scaled by the caller) that the
   * inverse mask clears from the fog. With no holes the mask is detached so the
   * fog renders normally — an empty inverse mask is avoided as an edge case.
   * Enemy zones are never passed here (fog stays over them — marker only).
   */
  updateHoles(holes: readonly FogHole[]): void {
    const g = this.holeMask;
    g.clear();
    for (const h of holes) g.circle(h.sx, h.sy, h.sr).fill({ color: CLIENT_CONFIG.colors.white, alpha: 1 });
    const want = holes.length > 0;
    if (want !== this.holesActive) {
      this.root.setMask(want ? { mask: g, inverse: true } : { mask: null });
      this.holesActive = want;
    }
  }

  /** Hide/show the whole overlay (hidden while spectating — spec frames are unfogged). */
  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }
}
