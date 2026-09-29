// DECOY-BUOY rendering from FrameMsg.decoys (contact-like per-observer state,
// not events — the mines.ts / litZones.ts precedent, Story 1.8).
//
// STORY 8.16 (catalog-v3 R36/R41, epic-8 amendments 119–124) brought the DECOY
// BUOY back as a CONSUMABLE and deleted the RADAR BUOY this module used to draw
// (render/buoys.ts, `BuoyView`, `FrameMsg.buoys`). Everything that was the radar
// buoy's own is gone with it: the 330u coverage ring, the JAMMING wash and the
// masthead LIFE arc (a decoy has no radar, no doctrine and NO LIFETIME — it
// floats until it is destroyed, and outlives its owner, amendment 122).
//
// WHAT EVERY OBSERVER READS: WHERE it is — the spar-buoy marker below, in the
// OWNER'S personal hue for every observer (Eric 2026-09-11, UX-DR56; `DecoyView.by`
// rides every view for exactly this, amendment 124(a)). A decoy lays no wake
// (amendment 123) and draws nothing else on the water.
//
// WHAT ONLY THE OWNER READS: ITS HULL — `DecoyView.hp` is present only on the
// owner's own view (the `MineView.c` idiom), and the owner's marker wears a
// masthead arc at `hp / CONFIG.decoyBuoy.hp` (full at the drop, shrinking as it
// takes fire). IMPLEMENTER DRAFT (amendment 124(f)): the arc reuses the deleted
// radar buoy's life-arc geometry, for Eric's eye on staging.
//
// THE MARKER IS A SPAR BUOY, NOT A RING (Eric, 7-5-decks.md: *"The icon needs to
// be distinguished from the mines a bit more"*). A mine's mark is a ring plus a
// dot; this one shares NO primitive with a mine: a waterline tick, a vertical
// spar and a DIAMOND radar-reflector daymark at the masthead, drawn with zero
// circles. Shape is the channel (DESIGN.md's dual-coding floor); hue still says
// whose it is.
//
// OWN vs OTHER LAYER split (mirrors mines.ts, driven by DecoyView.own): OWN
// decoys draw in chartRoot's decoy layer (fog-immune) so you always read your
// own decoy even under fog beyond sight range; anyone else's decoy draws in
// worldRoot's decoy layer and only ever arrives while sighted (or lit by your
// own zone), so fog over it is a non-issue — exactly the mine convention.
//
// A decoy is a static point (its position is fixed at drop) so a sprite's
// position is set once, exactly like a mine; reconcile() is the pure
// list -> lifecycle diff (unit-tested), the Pixi wiring a thin adapter. A decoy
// dropping out of the list means DESTROYED or out of view — the client cannot
// tell, and that ambiguity is the design (the mines precedent).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, type DecoyView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01 } from '../util/math.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export type { HueFor };

const R = CLIENT_CONFIG.mineRings; // the shared ordnance-ring stroke weights

/** u — half-width of the waterline tick. */
const WATERLINE = 7;
/** u — spar height above the waterline (the masthead sits here). */
const SPAR = 16;
/** u — half-diagonal of the diamond radar-reflector topmark. */
const TOPMARK = 6;
/** u — radius of the owner-only masthead hp arc (clear of the topmark's points). */
const HP_ARC_R = TOPMARK + 3.5;
/** Alpha of the owner-only masthead hp arc. */
const HP_ARC_ALPHA = 0.85;

/**
 * THE DECOY'S SILHOUETTE, as pure geometry in the sprite's local frame — a
 * waterline tick, a spar, and a diamond daymark. Exported so the "distinct from
 * a mine" property is testable without reaching into the display list, and so
 * the belt glyph (render/equipmentIcons.ts) can be checked against the same
 * shape language.
 *
 * DELIBERATELY CIRCLE-FREE. A mine's marker is a ring plus a dot; anything
 * round here walks straight back into the mark Eric asked to be told apart.
 */
export const BUOY_MARKER = {
  waterline: [
    { x: -WATERLINE, y: 0 },
    { x: WATERLINE, y: 0 },
  ],
  spar: [
    { x: 0, y: 0 },
    { x: 0, y: -SPAR },
  ],
  /** The radar-reflector daymark: a diamond centred on the masthead. */
  topmark: [
    { x: 0, y: -SPAR - TOPMARK },
    { x: TOPMARK, y: -SPAR },
    { x: 0, y: -SPAR + TOPMARK },
    { x: -TOPMARK, y: -SPAR },
  ],
} as const;

/**
 * Pure: the fraction of its hull an OWN decoy has left — `hp / CONFIG.decoyBuoy.hp`,
 * clamped to [0, 1]. `null` when there is no owner readout at all (someone
 * else's decoy, or a view without `hp`): the arc is the owner's number and is
 * never drawn for anyone else.
 */
export function decoyHpFrac(view: Pick<DecoyView, 'own' | 'hp'>): number | null {
  if (!view.own || view.hp === undefined) return null;
  return clamp01(view.hp / CONFIG.decoyBuoy.hp);
}

/** What changed between the sprites we hold and the incoming decoy list. */
export interface DecoyDiff {
  add: DecoyView[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's decoy
 * list, return which decoys to add and which sprite ids to remove. Ids present
 * in both are left in place (a decoy is static — only its owner-only hp arc
 * moves, and that is refreshed separately). A kill / out-of-view drop resolves
 * to a plain remove.
 */
export function reconcileDecoys(current: ReadonlySet<string>, incoming: readonly DecoyView[]): DecoyDiff {
  const seen = new Set<string>();
  const add: DecoyView[] = [];
  for (const d of incoming) {
    seen.add(d.id);
    if (!current.has(d.id)) add.push(d);
  }
  const remove: string[] = [];
  for (const id of current) if (!seen.has(id)) remove.push(id);
  return { add, remove };
}

/** A live decoy sprite + its owner-hue latch (retryHue recolors it once the
 *  owner's roster hue syncs). `own` drives brightness and the layer. */
interface DecoySprite extends HueState {
  g: Graphics;
  own: boolean;
  /** The color the marker is currently painted in (hue latch or amber fallback). */
  color: number;
  /** The owner-only hp fraction currently painted (null = no arc). */
  hpFrac: number | null;
}

export class Decoys {
  private readonly sprites = new Map<string, DecoySprite>();

  /**
   * `ownLayer` = chartRoot's decoy layer (fog-immune); `otherLayer` = worldRoot's
   * decoy layer (fogged). `onOwnDecoySpawn` (optional) fires once per OWN decoy
   * newly added this sync — the `placeDecoy` audio cue hook (a decoy has no
   * discrete GameEvent of its own; this reconcile diff is the only "just
   * placed" signal, and gating on `own` means it can never misfire on someone
   * else's decoy — the Mines onOwnMineSpawn precedent).
   */
  constructor(
    private readonly ownLayer: Container,
    private readonly otherLayer: Container,
    private readonly onOwnDecoySpawn?: (d: DecoyView) => void,
  ) {}

  /**
   * Reconcile sprites against this observer's decoy list for the tick. The
   * caller passes `f.decoys ?? []` (frames omit the key when the observer sees
   * no decoys). An empty list clears every sprite, which is how a match reset
   * lands (the mines precedent).
   */
  sync(decoys: readonly DecoyView[], hueFor: HueFor): void {
    const { add, remove } = reconcileDecoys(new Set(this.sprites.keys()), decoys);
    for (const id of remove) this.despawn(id);
    for (const d of add) this.spawn(d, hueFor);
    for (const d of decoys) this.refresh(d);
    for (const s of this.sprites.values()) {
      // Story 1.12: recolor any decoy that booted on the amber fallback (owner
      // hue not yet synced at spawn) once its personal hue lands.
      retryHue(s, hueFor, (color) => {
        s.color = color;
        this.redraw(s);
      });
    }
  }

  /** The owner-only hp fraction a decoy's arc is currently drawn at (null for
   *  someone else's decoy) — the render-state seam the tests read. */
  hpFracAt(id: string): number | null {
    return this.sprites.get(id)?.hpFrac ?? null;
  }

  /** The color a decoy's marker is currently painted in (tests/debug). */
  colorAt(id: string): number | null {
    return this.sprites.get(id)?.color ?? null;
  }

  /** Redraw an existing sprite's hp arc when the owner's readout moved. */
  private refresh(d: DecoyView): void {
    const s = this.sprites.get(d.id);
    if (s === undefined) return;
    const frac = decoyHpFrac(d);
    if (frac === s.hpFrac) return;
    s.hpFrac = frac;
    this.redraw(s);
  }

  private spawn(d: DecoyView, hueFor: HueFor): void {
    const g = new Graphics();
    const { color, colored, rev } = resolveHue(d.by, hueFor);
    g.position.set(d.x, d.y);
    (d.own ? this.ownLayer : this.otherLayer).addChild(g);
    const s: DecoySprite = { g, by: d.by, own: d.own, colored, rev, color, hpFrac: decoyHpFrac(d) };
    this.sprites.set(d.id, s);
    this.redraw(s);
    if (d.own) this.onOwnDecoySpawn?.(d);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }

  /** The whole sprite: marker + (own) masthead hp arc. */
  private redraw(s: DecoySprite): void {
    drawMarker(s.g, s.own, s.color);
    if (s.hpFrac !== null) drawHpArc(s.g, s.hpFrac, s.color);
  }
}

/**
 * Draw the decoy silhouette onto `g` (clearing prior geometry — the recolor and
 * hp paths redraw in place): waterline tick, spar, diamond radar-reflector
 * topmark. NO CIRCLES — see the file header. `color` = the owner's personal hue
 * (same for all observers); `own` drives only the brightness (dim on your own
 * chart, brighter as a warning on someone else's).
 */
function drawMarker(g: Graphics, own: boolean, color: number): void {
  const alpha = own ? 0.7 : 0.9;
  const m = BUOY_MARKER;
  g.clear();
  g.moveTo(m.waterline[0].x, m.waterline[0].y).lineTo(m.waterline[1].x, m.waterline[1].y);
  g.moveTo(m.spar[0].x, m.spar[0].y).lineTo(m.spar[1].x, m.spar[1].y);
  g.stroke({ width: 1.5, color, alpha });
  // `close` explicitly true: an open diamond would read as a chevron.
  g.poly([...m.topmark], true).stroke({ width: 1.5, color, alpha: own ? 0.8 : 1 });
}

/**
 * The OWNER-ONLY masthead hp arc (IMPLEMENTER DRAFT, amendment 124(f)): a clock
 * face around the topmark that empties as the decoy is shot down. Drawn at the
 * MASTHEAD rather than around the hull so it can never be read as a mine's
 * ring, and only ever for an own decoy — an enemy's hull is not ours to know.
 */
function drawHpArc(g: Graphics, frac: number, color: number): void {
  if (frac <= 0) return;
  const cy = -SPAR;
  const a0 = -Math.PI / 2;
  g.moveTo(0, cy - HP_ARC_R).arc(0, cy, HP_ARC_R, a0, a0 + Math.PI * 2 * frac);
  g.stroke({ width: R.width, color, alpha: HP_ARC_ALPHA });
}
