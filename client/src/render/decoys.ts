// BUOY rendering from FrameMsg.decoys (contact-like per-observer state, not
// events — the mines.ts / litZones.ts precedent, Story 1.8).
//
// THE NAME `decoy` IS KEPT FOR THE BODY (Story 10.9, epic-10 amendment 4): the
// plain DECOY BUOY line is retired and its body became the FOUR BUOYS — RADAR,
// HEALING, SHIELD, SPEED — each 50 hp, a torpedo sponge, a 30 s life
// (`CONFIG.buoy`). The wire row (`DecoyView`), the frame key and this module
// keep the machinery name; the catalog ids are the buoys'.
//
// WHAT EVERY OBSERVER READS: WHERE it is, WHAT KIND it is and how far its
// effect reaches. The marker is the buoy's own GLYPH — the TINTED BEACON
// (Eric 2026-10-29, family C; render/buoyMarks.ts, drawn through the one glyph
// source, render/equipmentIcons.ts, exactly as the belt square draws it): the
// hull in the OWNER'S personal hue (Eric 2026-09-11, UX-DR56; `DecoyView.by`
// rides every view for exactly this) under a head filled in the kind's colour.
// Around it, its EFFECT RING (render/buoyRings.ts): own in the kind's colour,
// a sighted enemy's in the shared alert blend. A buoy lays no wake; an ENEMY
// buoy shows its kind and its reach, never its timer or sweep (the wire
// carries neither for it).
//
// WHAT ONLY THE OWNER READS: ITS HULL and ITS LIFE — `DecoyView.hp` and
// `DecoyView.until` are present only on the owner's own view (the `MineView.c`
// idiom). The owner's marker wears two concentric MASTHEAD ARCS over the head:
// the inner at `hp / CONFIG.buoy.hp` (shrinks as it takes fire) and the outer
// at `(until − serverNow) / CONFIG.buoy.lifetimeMs` (runs down over its 30 s);
// the own ring dims with the same life fraction.
//
// THE MARKER IS NOT A RING (Eric, 7-5-decks.md: *"The icon needs to be
// distinguished from the mines a bit more"*): the beacon draws no circle
// primitive at all (the healing disc is a filled polygon), and its waterline,
// can and head share nothing with the mine glyphs.
//
// OWN vs OTHER LAYER split (mirrors mines.ts, driven by DecoyView.own): OWN
// buoys draw in chartRoot's decoy layer (fog-immune) so you always read your
// own buoy even under fog beyond sight range; anyone else's draws in
// worldRoot's decoy layer and only ever arrives while sighted. Each buoy's
// ring sits in the same layer, beneath its marker.
//
// A buoy is a static point (its position is fixed at drop) so a sprite's
// position is set once; reconcile() is the pure list -> lifecycle diff
// (unit-tested), the Pixi wiring a thin adapter. A buoy dropping out of the
// list means DESTROYED, EXPIRED or out of view — the client cannot tell, and
// that ambiguity is the design (the mines precedent).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { BUOY_LINE_IDS, CONFIG, buoyKindOf, type BuoyKind, type BuoyLineId, type DecoyView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01 } from '../util/math.js';
import { settings } from '../settings/store.js';
import { alertClock, alertTint, OWN_TINT } from './alertBlend.js';
import { BUOY_HEAD_CENTER, BUOY_HEAD_REACH } from './buoyMarks.js';
import { ENEMY_RING_DRAW_COLOR, buoyLifeFrac, drawBuoyRing, ringModelFor, type BuoyRingModel } from './buoyRings.js';
import { drawEquipmentIcon } from './equipmentIcons.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export { buoyLifeFrac };

export type { HueFor };

const R = CLIENT_CONFIG.mineRings; // the shared ordnance-ring stroke weights

/** u — the height of the retired spar-buoy marker (waterline, spar, diamond
 *  topmark and the kind mark hung under it, at its 1.25 scale — Eric
 *  2026-10-17, epic-9 amendment 188). The beacon keeps that footprint. */
const RETIRED_MARKER_HEIGHT_U = 43.125;
/** The beacon's drawn content spans 19 of its glyph box's 24 units (y 2–21). */
const GLYPH_CONTENT_SHARE = 19 / 24;
/**
 * u — the side of the box the beacon glyph is drawn in on the water, sized so
 * its drawn height equals the retired marker's (same footprint at default
 * zoom). The drop preview (render/aimPreview.ts) draws in the same box.
 */
export const BUOY_MARKER_BOX_U = RETIRED_MARKER_HEIGHT_U / GLYPH_CONTENT_SHARE;
/** The marker's hull stroke width (u) — the retired marker's weight. */
const MARKER_W = 1.5;
/** u — the masthead arcs' centre (the middle of the head band) and radii: the
 *  hp arc clears every kind's head, the life arc one stroke outside it. */
const ARC_CY = BUOY_HEAD_CENTER[1] * (BUOY_MARKER_BOX_U / 2);
const HP_ARC_R = BUOY_HEAD_REACH * (BUOY_MARKER_BOX_U / 2) + 3.5;
const LIFE_ARC_R = HP_ARC_R + 3;
/** Alpha of the owner-only masthead hp arc. */
const HP_ARC_ALPHA = 0.85;
/** Alpha of the owner-only masthead life arc — quieter than the hp arc: the hull
 *  is the number a fight moves, the life is a clock. */
const LIFE_ARC_ALPHA = 0.55;
/** The life arc is redrawn only when its fraction moves by this much — a
 *  30 s life redraws in ~1/240 steps (8 Hz), never every render frame. */
const LIFE_STEP = 1 / 240;

/** The buoy LINE whose glyph a buoy of each kind draws — the inverse of
 *  shared `buoyKindOf`, built from it so the two can never disagree. */
const LINE_OF_KIND = Object.fromEntries(BUOY_LINE_IDS.map((line) => [buoyKindOf(line), line])) as Readonly<
  Record<BuoyKind, BuoyLineId>
>;

/** Pure: the buoy line whose glyph draws a buoy of `kind`. */
export function buoyLineOf(kind: BuoyKind): BuoyLineId {
  return LINE_OF_KIND[kind];
}

/**
 * Pure: the fraction of its hull an OWN buoy has left — `hp / CONFIG.buoy.hp`,
 * clamped to [0, 1]. `null` when there is no owner readout at all (someone
 * else's buoy, or a view without `hp`): the arc is the owner's number and is
 * never drawn for anyone else.
 */
export function decoyHpFrac(view: Pick<DecoyView, 'own' | 'hp'>): number | null {
  if (!view.own || view.hp === undefined) return null;
  return clamp01(view.hp / CONFIG.buoy.hp);
}

/**
 * Pure: per buoy LINE, the server-clock expiry of the EARLIEST own LIVE buoy
 * of that line's kind (`until > serverNow`) — the hotbar's ACTIVE window for a
 * buoy square (Story 10.9, AC 8: "the existing tell grammar, no new copy").
 * A line with no live own buoy is absent (no window). Someone else's buoy, or
 * an own view without `until`, never counts.
 */
export function ownBuoyUntil(
  decoys: readonly DecoyView[],
  serverNow: number,
): Partial<Record<BuoyLineId, number>> {
  const out: Partial<Record<BuoyLineId, number>> = {};
  for (const line of BUOY_LINE_IDS) {
    const kind = buoyKindOf(line);
    for (const d of decoys) {
      if (!d.own || d.kind !== kind || d.until === undefined || d.until <= serverNow) continue;
      out[line] = Math.min(out[line] ?? Infinity, d.until);
    }
  }
  return out;
}

/** Pure: a life fraction snapped to the redraw step (null passes through). */
function lifeStep(frac: number | null): number | null {
  return frac === null ? null : Math.ceil(frac / LIFE_STEP) * LIFE_STEP;
}

/** What changed between the sprites we hold and the incoming buoy list. */
export interface DecoyDiff {
  add: DecoyView[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's buoy
 * list, return which buoys to add and which sprite ids to remove. Ids present
 * in both are left in place (a buoy is static — only its owner-only arcs move,
 * and those are refreshed separately). A kill / expiry / out-of-view drop
 * resolves to a plain remove.
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

/** A live buoy sprite + its owner-hue latch (retryHue recolors it once the
 *  owner's roster hue syncs). `own` drives brightness and the layer. */
interface DecoySprite extends HueState {
  g: Graphics;
  /** The effect ring (render/buoyRings.ts) — its own Graphics, beneath the
   *  marker in the same layer, so an enemy ring's alert tint never tints the
   *  owner-hued marker. */
  ring: Graphics;
  /** The ring model currently drawn (null = no ring). */
  ringModel: BuoyRingModel | null;
  /** The wire view the sprite was last synced from (the ring reads it). */
  view: DecoyView;
  own: boolean;
  kind: BuoyKind;
  /** The color the marker is currently painted in (hue latch or amber fallback). */
  color: number;
  /** The owner-only hp fraction currently painted (null = no arc). */
  hpFrac: number | null;
  /** The owner-only server-clock expiry (undefined = not ours / not sent). */
  until: number | undefined;
  /** The owner-only life fraction currently painted, snapped (null = no arc). */
  lifeFrac: number | null;
}

export class Decoys {
  private readonly sprites = new Map<string, DecoySprite>();
  /** The last server time `render` saw — a spawn between renders paints its
   *  life arc against it rather than drawing a full arc for one frame. */
  private lastNow = -Infinity;

  /**
   * `ownLayer` = chartRoot's decoy layer (fog-immune); `otherLayer` = worldRoot's
   * decoy layer (fogged). `onOwnDecoySpawn` (optional) fires once per OWN buoy
   * newly added this sync — the `placeDecoy` audio cue hook (a buoy has no
   * discrete GameEvent of its own; this reconcile diff is the only "just
   * placed" signal, and gating on `own` means it can never misfire on someone
   * else's buoy — the Mines onOwnMineSpawn precedent).
   */
  constructor(
    private readonly ownLayer: Container,
    private readonly otherLayer: Container,
    private readonly onOwnDecoySpawn?: (d: DecoyView) => void,
  ) {}

  /**
   * Reconcile sprites against this observer's buoy list for the tick. The
   * caller passes `f.decoys ?? []` (frames omit the key when the observer sees
   * no buoys). An empty list clears every sprite, which is how a match reset
   * lands (the mines precedent).
   */
  sync(decoys: readonly DecoyView[], hueFor: HueFor): void {
    const { add, remove } = reconcileDecoys(new Set(this.sprites.keys()), decoys);
    for (const id of remove) this.despawn(id);
    for (const d of add) this.spawn(d, hueFor);
    for (const d of decoys) this.refresh(d);
    for (const s of this.sprites.values()) {
      // Story 1.12: recolor any buoy that booted on the amber fallback (owner
      // hue not yet synced at spawn) once its personal hue lands.
      retryHue(s, hueFor, (color) => {
        s.color = color;
        this.redraw(s);
      });
    }
  }

  /**
   * Per render frame: run each OWN buoy's life arc and ring down against the
   * server clock (timestamp math off `until − serverNow`; no client timers),
   * redrawing only when the snapped fraction moves — a handful of own buoys at
   * most — and tint every ENEMY ring by the shared alert clock (the phase
   * Mines.render advances once per frame).
   */
  render(serverNow: number): void {
    this.lastNow = serverNow;
    const alert = alertTint(alertClock.phase, settings.current.motion);
    for (const s of this.sprites.values()) {
      s.ring.tint = s.own ? OWN_TINT : alert;
      const frac = lifeStep(buoyLifeFrac({ own: s.own, until: s.until }, serverNow));
      if (frac === s.lifeFrac) continue;
      s.lifeFrac = frac;
      this.redraw(s);
    }
  }

  /** The owner-only hp fraction a buoy's arc is currently drawn at (null for
   *  someone else's buoy) — the render-state seam the tests read. */
  hpFracAt(id: string): number | null {
    return this.sprites.get(id)?.hpFrac ?? null;
  }

  /** The owner-only life fraction a buoy's outer arc is currently drawn at
   *  (snapped; null for someone else's buoy) — a render-state test seam. */
  lifeFracAt(id: string): number | null {
    return this.sprites.get(id)?.lifeFrac ?? null;
  }

  /** The kind a buoy's marker is drawn as (null when not held) — test seam. */
  kindAt(id: string): BuoyKind | null {
    return this.sprites.get(id)?.kind ?? null;
  }

  /** The color a buoy's marker is currently painted in (tests/debug). */
  colorAt(id: string): number | null {
    return this.sprites.get(id)?.color ?? null;
  }

  /** The effect ring a buoy currently draws (null when not held) — test seam. */
  ringAt(id: string): BuoyRingModel | null {
    return this.sprites.get(id)?.ringModel ?? null;
  }

  /** The ring's Graphics (test seam: its layer and its alert tint). */
  ringGraphicsAt(id: string): Graphics | null {
    return this.sprites.get(id)?.ring ?? null;
  }

  /** Redraw an existing sprite's arcs when the owner's readout moved. */
  private refresh(d: DecoyView): void {
    const s = this.sprites.get(d.id);
    if (s === undefined) return;
    s.view = d;
    s.until = d.until;
    const frac = decoyHpFrac(d);
    if (frac === s.hpFrac) return;
    s.hpFrac = frac;
    this.redraw(s);
  }

  private spawn(d: DecoyView, hueFor: HueFor): void {
    const g = new Graphics();
    const ring = new Graphics();
    const { color, colored, rev } = resolveHue(d.by, hueFor);
    g.position.set(d.x, d.y);
    ring.position.set(d.x, d.y);
    const layer = d.own ? this.ownLayer : this.otherLayer;
    layer.addChild(ring); // beneath its marker
    layer.addChild(g);
    ring.tint = d.own ? OWN_TINT : alertTint(alertClock.phase, settings.current.motion);
    const s: DecoySprite = {
      g,
      ring,
      ringModel: null,
      view: d,
      by: d.by,
      own: d.own,
      kind: d.kind,
      colored,
      rev,
      color,
      hpFrac: decoyHpFrac(d),
      until: d.until,
      lifeFrac: lifeStep(buoyLifeFrac(d, this.lastNow)),
    };
    this.sprites.set(d.id, s);
    this.redraw(s);
    if (d.own) this.onOwnDecoySpawn?.(d);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    s.ring.destroy();
    this.sprites.delete(id);
  }

  /** The whole sprite: the beacon glyph + (own) masthead hp and life arcs,
   *  and the effect ring beneath it. */
  private redraw(s: DecoySprite): void {
    drawMarker(s.g, s.kind, s.own, s.color);
    if (s.hpFrac !== null) drawMastArc(s.g, HP_ARC_R, s.hpFrac, s.color, HP_ARC_ALPHA);
    if (s.lifeFrac !== null) drawMastArc(s.g, LIFE_ARC_R, s.lifeFrac, s.color, LIFE_ARC_ALPHA);
    this.redrawRing(s);
  }

  /** The effect ring at the current clock (positioned at the buoy, so the
   *  model is drawn in the ring's local frame). */
  private redrawRing(s: DecoySprite): void {
    const m = ringModelFor(s.view, this.lastNow);
    s.ringModel = m;
    if (m === null) {
      s.ring.clear();
      return;
    }
    drawBuoyRing(s.ring, m, s.own ? m.color : ENEMY_RING_DRAW_COLOR);
  }
}

/**
 * Draw the beacon onto `g` (clearing prior geometry — the recolor and arc
 * paths redraw in place): the buoy line's own glyph, the hull in `color` (the
 * owner's personal hue, the same for all observers) and the head in the
 * kind's colour, in a `BUOY_MARKER_BOX_U` box centred on the buoy. `own`
 * drives only the brightness (dim on your own chart, brighter as a warning on
 * someone else's).
 */
function drawMarker(g: Graphics, kind: BuoyKind, own: boolean, color: number): void {
  g.clear();
  drawEquipmentIcon(g, buoyLineOf(kind), 0, 0, BUOY_MARKER_BOX_U, { width: MARKER_W, color, alpha: own ? 0.7 : 0.9 });
}

/**
 * An OWNER-ONLY masthead arc: a half clock face OVER the head that runs from
 * nine o'clock through twelve to three and empties from the three o'clock end
 * as `frac` falls — the hp arc (inner) as the buoy is shot down, the life arc
 * (outer) as its 30 s run out. Over the head only, so it never crosses the can
 * and never reads as a mine's ring; only ever for an own buoy — an enemy's
 * hull and clock are not ours to know.
 */
function drawMastArc(g: Graphics, r: number, frac: number, color: number, alpha: number): void {
  if (frac <= 0) return;
  const a0 = Math.PI;
  g.moveTo(-r, ARC_CY).arc(0, ARC_CY, r, a0, a0 + Math.PI * frac);
  g.stroke({ width: R.width, color, alpha });
}
