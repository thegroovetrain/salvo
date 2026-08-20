// RADAR-BUOY rendering from FrameMsg.buoys (contact-like per-observer state,
// not events — the mines.ts / litZones.ts precedent, Story 1.8).
//
// STORY 7-5 WAVE 2 REPLACED THE DECOY BUOY OUTRIGHT, and this module is the
// client half of that replacement (render/decoys.ts, `Decoys`, `DecoyView` and
// the `decoys` frame channel are all retired with the deception). The decoy's
// whole point was the LIE — it painted on enemy radar as the owner's own ship,
// and this channel existed as the truth behind it. Nothing fakes a ship contact
// any more, so what arrives here is simply the buoy seen up close: a real,
// stationary, destructible sensor.
//
// WHAT THE OWNER READS OFF ITS OWN BUOY (and what it deliberately cannot):
//   • WHERE it is — the marker, in the owner's personal hue for every observer
//     (Story 1.12, DESIGN.md:160's ordnance truth-marker rule).
//   • WHAT WATER IT WATCHES — the coverage ring at the buoy's own flat 330u
//     radar reach (`stats.radarBuoy.radarRange`), owner-only.
//   • WHICH DOCTRINE IT CARRIES — GUN BUOY strokes that ring SOLID (the mine
//     grammar's "what it kills in": the gun's target set is literally what its
//     radar sees), JAMMING BUOY washes the disc with a low-alpha fill (the
//     storm-plane grammar: this water is unreadable to everyone else). Both are
//     independent rare ×1 verbs, so they compose — solid ring AND fill.
//   • HOW LONG IT HAS LEFT — a depleting arc at the masthead, off `until` and
//     the owner's effective `durationMs`, on the FRAME's clock.
//   • NOT ITS HULL INTEGRITY. `BuoyView` carries no hp field and adding one is
//     a wire decision, not an implementation detail (shared/src/types.ts says
//     so in as many words), so a buoy being shot to pieces is silent here: it
//     is whole, and then it is gone. Flagged, not fudged.
//
// THE MARKER IS A SPAR BUOY, NOT A RING (Eric, 7-5-decks.md: *"The icon needs to
// be distinguished from the mines a bit more"*). The decoy's mark was two
// concentric rings plus a stub mast, and a mine's is a ring plus a dot — at
// speed, on a dark chart, those are the same mark. This one shares NO primitive
// with a mine: it is a waterline tick, a vertical spar and a DIAMOND radar-
// reflector daymark at the masthead, drawn with zero circles. Shape is the
// channel (DESIGN.md's dual-coding floor); hue still says whose it is.
//
// OWN vs ENEMY LAYER split (mirrors mines.ts, driven by BuoyView.own): OWN buoys
// draw in chartRoot's buoy layer (fog-immune) so you always read your own buoy
// even when it lies under fog beyond sight range; a truesighted ENEMY buoy draws
// in worldRoot's buoy layer and only ever arrives while sighted, so fog over it
// is a non-issue — exactly the mine convention. An enemy buoy NEVER draws a
// coverage ring or a life arc: those are the owner's numbers.
//
// A buoy is a static point (its position is fixed at drop) so a sprite's
// position is set once, exactly like a mine; reconcile() is the pure
// list -> lifecycle diff (unit-tested), the Pixi wiring a thin adapter. A buoy
// dropping out of the list means expired, DESTROYED, or out of view — the client
// cannot tell, and that ambiguity is the design (the mines/litZones precedent).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { BuoyView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01, dashArcs } from '../util/math.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export type { HueFor };

const R = CLIENT_CONFIG.mineRings; // the shared ordnance-ring stroke weights
const P = CLIENT_CONFIG.aimPreview; // the shared dash/dot arc grammar

/** u — half-width of the waterline tick. */
const WATERLINE = 7;
/** u — spar height above the waterline (the masthead sits here). */
const SPAR = 16;
/** u — half-diagonal of the diamond radar-reflector topmark. */
const TOPMARK = 6;
/** u — radius of the masthead life arc (clear of the topmark's points). */
const LIFE_R = TOPMARK + 3.5;

/** Alpha of the owner-only coverage ring. */
const COVERAGE_ALPHA = 0.5;
/** Alpha of the JAMMING BUOY's denied-water wash inside the coverage ring. */
const JAM_FILL_ALPHA = 0.05;
/** Alpha of the masthead life arc. */
const LIFE_ALPHA = 0.85;
/** Life-arc redraw quantum: 1/24 of the window, so a 20s buoy redraws its
 *  sprite ~24 times over its whole life instead of once per frame. */
const LIFE_STEPS = 24;

/**
 * THE BUOY'S SILHOUETTE, as pure geometry in the sprite's local frame — a
 * waterline tick, a spar, and a diamond daymark. Exported so the "distinct from
 * a mine" property is testable without reaching into the display list, and so
 * the hotbar glyph can be checked against the same shape language.
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
 * The OWNER'S live buoy numbers, fed in every sync. `radarRange` and the two
 * verb flags are read STRAIGHT off `effectiveStats().radarBuoy` — the very
 * values the server stamps onto a buoy at drop and gates its relay with — so
 * the ring IS the buoy's ground truth, not a decoration of it.
 *
 * `now` is THE FRAME'S OWN TIMESTAMP (`FrameMsg.t`), not a local clock reading,
 * for the same reason the mine's arming window uses it: `until` is a server
 * clock value, and comparing it against an estimated local now charges the
 * buoy for the transport delay.
 */
export interface OwnBuoyState {
  radarRange: number; // u — the buoy's own flat radar reach
  gun: boolean; // GUN BUOY verb
  jamming: boolean; // JAMMING BUOY verb
  durationMs: number; // ms — the owner's effective buoy lifetime (BUOY I-IV)
  now: number; // ms — the frame's server timestamp
}

/** The owner-only coverage ring. STYLE and FILL are the channels (never hue —
 *  the whole marker is already the owner's personal color). */
export interface BuoyRing {
  r: number;
  /** SOLID = GUN BUOY (this circle is a weapon envelope); DASHED = a pure
   *  sensor circle, the mine's trigger-ring grammar. */
  style: 'solid' | 'dashed';
  alpha: number;
  /** JAMMING BUOY's denied-water wash; 0 = no fill. */
  fill: number;
}

/**
 * Pure: the ring an OWN buoy draws, and how.
 *
 * There is exactly ONE radius, and that is a statement of fact rather than a
 * budget: the buoy's radar reach, its GUN BUOY target set (R2.21 — it shoots
 * anything its own radar sees) and its JAMMING BUOY fake scatter (R2.11 —
 * fakes land inside the buoy's circle) are all literally the same 330u circle.
 * Drawing three coincident rings would imply three different numbers.
 */
export function ownBuoyRing(p: OwnBuoyState): BuoyRing {
  return {
    r: p.radarRange,
    style: p.gun ? 'solid' : 'dashed',
    alpha: COVERAGE_ALPHA,
    fill: p.jamming ? JAM_FILL_ALPHA : 0,
  };
}

/**
 * Pure: the fraction of its life an own buoy has left at `now`, from the wire's
 * `until` and the owner's effective `durationMs`. 1 at the instant of the drop,
 * 0 at expiry. A non-positive duration (an impossible stat, or a caller with no
 * stats yet) reads as spent rather than dividing by zero.
 *
 * This is the ONLY state channel the buoy has beyond position: its 50 hp does
 * NOT ride `BuoyView`, so a damaged buoy looks exactly like a healthy one right
 * up until it stops being in the list at all.
 */
export function buoyLifeFrac(until: number, now: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return clamp01((until - now) / durationMs);
}

/** Pure: a redraw key for one own buoy's presentation — the sprite redraws only
 *  when this changes (a boon lands, or the life arc crosses a quantum), never
 *  per frame. */
export function buoyDrawKey(ring: BuoyRing | null, life: number): string {
  const step = Math.round(clamp01(life) * LIFE_STEPS);
  if (ring === null) return `-|${step}`;
  return `${ring.style}:${ring.r}:${ring.fill}|${step}`;
}

/** What changed between the sprites we hold and the incoming buoy list. */
export interface BuoyDiff {
  add: BuoyView[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's buoy
 * list, return which buoys to add and which sprite ids to remove. Ids present in
 * both are left in place (a buoy is static — only its life arc moves, and that
 * is refreshed separately). This is what makes a REPLACE (owner drops a second
 * buoy: the old id leaves the list, a new id joins) resolve to one remove + one
 * add, and an expiry/kill/out-of-view drop resolve to a plain remove.
 */
export function reconcileBuoys(current: ReadonlySet<string>, incoming: readonly BuoyView[]): BuoyDiff {
  const seen = new Set<string>();
  const add: BuoyView[] = [];
  for (const b of incoming) {
    seen.add(b.id);
    if (!current.has(b.id)) add.push(b);
  }
  const remove: string[] = [];
  for (const id of current) if (!seen.has(id)) remove.push(id);
  return { add, remove };
}

/** A live buoy sprite + its owner-hue latch (retryHue recolors it once the
 *  owner's roster hue syncs). `own` drives brightness and whether the owner-only
 *  ring/life readout is drawn at all. */
interface BuoySprite extends HueState {
  g: Graphics;
  own: boolean;
  /** ms — server-clock expiry, straight off the wire (the life arc's numerator). */
  until: number;
  /** The color the marker is currently painted in (hue latch or amber fallback). */
  color: number;
  /** The owner-only ring currently painted (null for an enemy buoy, or before
   *  owner stats arrive) and the life fraction it was painted at. */
  ring: BuoyRing | null;
  life: number;
  drawKey: string;
}

export class Buoys {
  private readonly sprites = new Map<string, BuoySprite>();

  /**
   * `ownLayer` = chartRoot's buoy layer (fog-immune); `enemyLayer` = worldRoot's
   * buoy layer (fogged). `onOwnBuoySpawn` (optional) fires once per OWN buoy
   * newly added this sync — the buoy's own-placement audio cue hook (a buoy has
   * no discrete GameEvent of its own; this reconcile diff is the only "just
   * placed" signal, and gating on `own` means it can never misfire on a
   * truesighted enemy buoy — the Mines onOwnMineSpawn precedent).
   */
  constructor(
    private readonly ownLayer: Container,
    private readonly enemyLayer: Container,
    private readonly onOwnBuoySpawn?: (b: BuoyView) => void,
  ) {}

  /**
   * Reconcile sprites against this observer's buoy list for the tick. Treats a
   * missing frame key as an empty list — the caller passes `f.buoys ?? []`
   * (frames omit the key when the observer sees no buoys). An empty list clears
   * every sprite, which is how a match reset / despawn-all lands (the mines
   * precedent).
   *
   * `own` carries the OWNER's live buoy stats + the server clock: OUR buoys draw
   * their coverage ring and life arc from it. Omitted (tests, spectators, any
   * caller with no own stats yet) = markers only.
   */
  sync(buoys: readonly BuoyView[], hueFor: HueFor, own?: OwnBuoyState): void {
    const { add, remove } = reconcileBuoys(new Set(this.sprites.keys()), buoys);
    for (const id of remove) this.despawn(id);
    for (const b of add) this.spawn(b, hueFor, own);
    for (const s of this.sprites.values()) {
      // Story 1.12: recolor any buoy that booted on the amber fallback (owner
      // hue not yet synced at spawn) once its personal hue lands.
      retryHue(s, hueFor, (color) => {
        s.color = color;
        this.redraw(s);
      });
      this.refresh(s, own);
    }
  }

  /** Re-evaluate one own sprite's ring + life arc against the current owner
   *  stats and clock, redrawing ONLY when the quantized presentation actually
   *  changed (a boon landed, or the life arc crossed a step). */
  private refresh(s: BuoySprite, own: OwnBuoyState | undefined): void {
    if (!s.own || own === undefined) return;
    const ring = ownBuoyRing(own);
    const life = buoyLifeFrac(s.until, own.now, own.durationMs);
    const key = buoyDrawKey(ring, life);
    if (key === s.drawKey) return;
    s.ring = ring;
    s.life = life;
    s.drawKey = key;
    this.redraw(s);
  }

  /**
   * ms — the server-clock expiry of the OWN buoy currently on the water, or 0
   * when we have none. THE hotbar's buoy ACTIVE window (main.ts activeWindows).
   *
   * DERIVED from the reconciled sprite set, deliberately, rather than latched at
   * drop: a buoy is DESTRUCTIBLE (R2.7, 50 hp) and its removal is silent
   * server-side — no event, it simply stops appearing in the frame's `buoys`
   * list — so a latched `until` kept the slot lit for the buoy's full nominal
   * life after it had been shot off the water a second later. Presence in the
   * frame IS the liveness signal, and the owner always sees their own buoy
   * (perception's buoy row: `buoy.ownerId === ctx.me.id`, no fog term), so
   * "absent from my frame" means "gone" — killed or naturally expired, both of
   * which must end the ACTIVE state.
   *
   * Max, not first: a REPLACE lands as one remove + one add inside a single
   * sync, and this is read after that reconcile has settled.
   */
  ownUntil(): number {
    let until = 0;
    for (const s of this.sprites.values()) {
      if (s.own && s.until > until) until = s.until;
    }
    return until;
  }

  /** The ring an own buoy currently draws (null for an enemy buoy, or before
   *  owner stats arrive) — the render-state seam the tests read, without
   *  reaching into the display list. */
  ringAt(id: string): BuoyRing | null {
    return this.sprites.get(id)?.ring ?? null;
  }

  /** The life fraction an own buoy's arc is currently drawn at. */
  lifeAt(id: string): number | null {
    const s = this.sprites.get(id);
    return s === undefined || !s.own ? null : s.life;
  }

  private spawn(b: BuoyView, hueFor: HueFor, own: OwnBuoyState | undefined): void {
    const g = new Graphics();
    const { color, colored, rev } = resolveHue(b.by, hueFor);
    g.position.set(b.x, b.y);
    (b.own ? this.ownLayer : this.enemyLayer).addChild(g);
    const s: BuoySprite = {
      g, by: b.by, own: b.own, colored, rev, color,
      until: b.until, ring: null, life: 0, drawKey: '',
    };
    this.sprites.set(b.id, s);
    this.refresh(s, own); // draws the ring + arc; redraw() paints the marker too
    if (s.ring === null) this.drawMarker(g, b.own, color);
    if (b.own) this.onOwnBuoySpawn?.(b);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }

  /** The whole sprite: marker + (own) coverage ring + (own) masthead life arc. */
  private redraw(s: BuoySprite): void {
    this.drawMarker(s.g, s.own, s.color);
    if (s.ring !== null) {
      drawCoverage(s.g, s.ring, s.color);
      drawLifeArc(s.g, s.life, s.color);
    }
  }

  /**
   * Draw the buoy silhouette onto `g` (clearing prior geometry — the recolor and
   * ring paths redraw in place): waterline tick, spar, diamond radar-reflector
   * topmark. NO CIRCLES — see the file header. `color` = the owner's personal
   * hue (same for all observers, Story 1.12); `own` drives only the brightness
   * (dim on your own chart, brighter as an enemy warning).
   */
  private drawMarker(g: Graphics, own: boolean, color: number): void {
    const alpha = own ? 0.7 : 0.9;
    const m = BUOY_MARKER;
    g.clear();
    g.moveTo(m.waterline[0].x, m.waterline[0].y).lineTo(m.waterline[1].x, m.waterline[1].y);
    g.moveTo(m.spar[0].x, m.spar[0].y).lineTo(m.spar[1].x, m.spar[1].y);
    g.stroke({ width: 1.5, color, alpha });
    // `close` explicitly true: an open diamond would read as a chevron.
    g.poly([...m.topmark], true).stroke({ width: 1.5, color, alpha: own ? 0.8 : 1 });
  }
}

/**
 * The owner-only coverage ring in the sprite's LOCAL frame (the graphic sits at
 * the buoy). STYLE carries the doctrine — solid for a GUN BUOY's weapon
 * envelope, dashed for a plain sensor circle — and the JAMMING wash is a fill,
 * so the whole readout survives without color vision and without motion.
 */
function drawCoverage(g: Graphics, ring: BuoyRing, color: number): void {
  if (ring.fill > 0) g.circle(0, 0, ring.r).fill({ color, alpha: ring.fill });
  const stroke = { width: R.width, color, alpha: ring.alpha };
  if (ring.style === 'solid') {
    g.circle(0, 0, ring.r).stroke(stroke);
    return;
  }
  for (const [a0, a1] of dashArcs(P.dashSegments, P.dashDuty)) {
    g.moveTo(Math.cos(a0) * ring.r, Math.sin(a0) * ring.r);
    g.arc(0, 0, ring.r, a0, a1);
  }
  g.stroke(stroke);
}

/**
 * The masthead life arc: a clock face around the topmark that empties as the
 * buoy runs out of time. Drawn at the MASTHEAD rather than around the hull so it
 * can never be read as a mine's ring, and only ever for an own buoy — an enemy's
 * remaining time is not ours to know.
 */
function drawLifeArc(g: Graphics, life: number, color: number): void {
  const frac = clamp01(life);
  if (frac <= 0) return;
  const cy = -SPAR;
  const a0 = -Math.PI / 2;
  g.moveTo(0, cy - LIFE_R).arc(0, cy, LIFE_R, a0, a0 + Math.PI * 2 * frac);
  g.stroke({ width: R.width, color, alpha: LIFE_ALPHA });
}
