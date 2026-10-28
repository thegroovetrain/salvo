// BUOY rendering from FrameMsg.decoys (contact-like per-observer state, not
// events — the mines.ts / litZones.ts precedent, Story 1.8).
//
// THE NAME `decoy` IS KEPT FOR THE BODY (Story 10.9, epic-10 amendment 4): the
// plain DECOY BUOY line is retired and its body became the FOUR BUOYS — RADAR,
// HEALING, SHIELD, SPEED — each 50 hp, a torpedo sponge, a 30 s life
// (`CONFIG.buoy`). The wire row (`DecoyView`), the frame key and this module
// keep the machinery name; the catalog ids are the buoys'.
//
// WHAT EVERY OBSERVER READS: WHERE it is and WHAT KIND it is — the spar-buoy
// marker below in the OWNER'S personal hue (Eric 2026-09-11, UX-DR56;
// `DecoyView.by` rides every view for exactly this), with the kind's mark hung
// under the waterline (render/buoyMarks.ts — the one mark vocabulary the belt
// glyph shares). A buoy lays no wake and draws nothing else on the water; an
// ENEMY buoy shows its kind and never its timer or sweep (the wire carries
// neither for it).
//
// WHAT ONLY THE OWNER READS: ITS HULL and ITS LIFE — `DecoyView.hp` and
// `DecoyView.until` are present only on the owner's own view (the `MineView.c`
// idiom). The owner's marker wears two concentric MASTHEAD ARCS: the inner at
// `hp / CONFIG.buoy.hp` (shrinks as it takes fire) and the outer at
// `(until − serverNow) / CONFIG.buoy.lifetimeMs` (runs down over its 30 s).
//
// THE MARKER IS A SPAR BUOY, NOT A RING (Eric, 7-5-decks.md: *"The icon needs to
// be distinguished from the mines a bit more"*). A mine's mark is a ring plus a
// dot; this one shares NO primitive with a mine: a waterline tick, a vertical
// spar, a DIAMOND radar-reflector daymark at the masthead and the kind mark,
// drawn with zero circles. Shape is the channel (DESIGN.md's dual-coding
// floor); hue still says whose it is.
//
// OWN vs OTHER LAYER split (mirrors mines.ts, driven by DecoyView.own): OWN
// buoys draw in chartRoot's decoy layer (fog-immune) so you always read your
// own buoy even under fog beyond sight range; anyone else's draws in
// worldRoot's decoy layer and only ever arrives while sighted.
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
import { placeKindMark } from './buoyMarks.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export type { HueFor };

const R = CLIENT_CONFIG.mineRings; // the shared ordnance-ring stroke weights

/** The whole on-water marker drawn 25 % larger than the Story 8.16 silhouette
 *  (Eric 2026-10-17: "Make the buoy about 25% larger on the water"; epic-9
 *  amendment 188). Scales every length below together, so the shape — and
 *  the "distinct from a mine" property — is unchanged. */
const BUOY_SCALE = 1.25;
/** u — half-width of the waterline tick (7 × BUOY_SCALE). */
const WATERLINE = 7 * BUOY_SCALE;
/** u — spar height above the waterline (the masthead sits here; 16 × BUOY_SCALE). */
const SPAR = 16 * BUOY_SCALE;
/** u — half-diagonal of the diamond radar-reflector topmark (6 × BUOY_SCALE). */
const TOPMARK = 6 * BUOY_SCALE;
/** u — half-size of the kind mark hung under the waterline (5 × BUOY_SCALE). */
const KIND_MARK_HALF = 5 * BUOY_SCALE;
/** u — clear water between the waterline tick and the top of the kind mark. */
const KIND_MARK_GAP = 2.5 * BUOY_SCALE;
/** u — radius of the owner-only masthead hp arc (clear of the topmark's points). */
const HP_ARC_R = TOPMARK + 3.5;
/** u — radius of the owner-only masthead LIFE arc, one stroke outside the hp arc. */
const LIFE_ARC_R = HP_ARC_R + 3;
/** Alpha of the owner-only masthead hp arc. */
const HP_ARC_ALPHA = 0.85;
/** Alpha of the owner-only masthead life arc — quieter than the hp arc: the hull
 *  is the number a fight moves, the life is a clock. */
const LIFE_ARC_ALPHA = 0.55;
/** The life arc is redrawn only when its fraction moves by this much — a
 *  30 s life redraws in ~1/240 steps (8 Hz), never every render frame. */
const LIFE_STEP = 1 / 240;

/**
 * THE BUOY'S SILHOUETTE, as pure geometry in the sprite's local frame — a
 * waterline tick, a spar, and a diamond daymark. Exported so the "distinct from
 * a mine" property is testable without reaching into the display list, and so
 * the aim preview's drop marker draws the same shape.
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

/** Pure: the kind mark's polylines in the sprite's local frame — the shared
 *  mark (render/buoyMarks.ts) hung centred under the waterline. */
export function buoyKindMark(kind: BuoyKind): [number, number][][] {
  return placeKindMark(kind, 0, KIND_MARK_GAP + KIND_MARK_HALF, KIND_MARK_HALF) as [number, number][][];
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
 * Pure: the fraction of its LIFE an OWN buoy has left at `serverNow` —
 * `(until − serverNow) / CONFIG.buoy.lifetimeMs`, clamped to [0, 1]. `null`
 * for someone else's buoy or a view without `until`: an enemy buoy's timer is
 * never on the wire, and never drawn.
 */
export function buoyLifeFrac(view: Pick<DecoyView, 'own' | 'until'>, serverNow: number): number | null {
  if (!view.own || view.until === undefined) return null;
  return clamp01((view.until - serverNow) / CONFIG.buoy.lifetimeMs);
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
   * Per render frame: run each OWN buoy's life arc down against the server
   * clock (timestamp math off `until − serverNow`; no client timers). Redraws
   * only when the snapped fraction moves — a handful of own buoys at most.
   */
  render(serverNow: number): void {
    this.lastNow = serverNow;
    for (const s of this.sprites.values()) {
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

  /** Redraw an existing sprite's arcs when the owner's readout moved. */
  private refresh(d: DecoyView): void {
    const s = this.sprites.get(d.id);
    if (s === undefined) return;
    s.until = d.until;
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
    const s: DecoySprite = {
      g,
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
    this.sprites.delete(id);
  }

  /** The whole sprite: marker + kind mark + (own) masthead hp and life arcs. */
  private redraw(s: DecoySprite): void {
    drawMarker(s.g, s.own, s.color);
    drawKindMark(s.g, s.kind, s.own, s.color);
    if (s.hpFrac !== null) drawMastArc(s.g, HP_ARC_R, s.hpFrac, s.color, HP_ARC_ALPHA);
    if (s.lifeFrac !== null) drawMastArc(s.g, LIFE_ARC_R, s.lifeFrac, s.color, LIFE_ARC_ALPHA);
  }
}

/**
 * Draw the buoy silhouette onto `g` (clearing prior geometry — the recolor and
 * arc paths redraw in place): waterline tick, spar, diamond radar-reflector
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

/** The KIND mark under the waterline, in the marker's own stroke register —
 *  same width, same hue, same own/other brightness. Every observer sees it. */
function drawKindMark(g: Graphics, kind: BuoyKind, own: boolean, color: number): void {
  for (const line of buoyKindMark(kind)) {
    g.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) g.lineTo(line[i][0], line[i][1]);
  }
  g.stroke({ width: 1.5, color, alpha: own ? 0.7 : 0.9 });
}

/**
 * An OWNER-ONLY masthead arc: a clock face around the topmark that empties
 * clockwise from twelve o'clock as `frac` falls — the hp arc (inner) as the
 * buoy is shot down, the life arc (outer) as its 30 s run out. Drawn at the
 * MASTHEAD rather than around the hull so it can never be read as a mine's
 * ring, and only ever for an own buoy — an enemy's hull and clock are not
 * ours to know.
 */
function drawMastArc(g: Graphics, r: number, frac: number, color: number, alpha: number): void {
  if (frac <= 0) return;
  const cy = -SPAR;
  const a0 = -Math.PI / 2;
  g.moveTo(0, cy - r).arc(0, cy, r, a0, a0 + Math.PI * 2 * frac);
  g.stroke({ width: R.width, color, alpha });
}
