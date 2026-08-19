// Mine field rendering from FrameMsg.mines (contact-like per-observer state, not
// events). Own mines are drawn in chartRoot (fog-immune) so you can always read
// your own field even when it lies under fog beyond sight range; enemy mines are
// drawn in worldRoot and only ever arrive while sighted, so fog over them is a
// non-issue. A mine dropping out of the frame list simply despawns its sprite —
// the client cannot tell whether it was triggered or just fell out of sight, and
// that ambiguity is the design.
//
// Story 1.12 (Regatta Hoist): the marker COLOR is the DROPPER's personal hue
// (MineView.by → hueFor), the SAME hue for every observer — the old own-green /
// enemy-amber color split is gone (amber survives only as the roster-miss
// fallback inside hueFor). The own/enemy LAYER + brightness split stays: own
// mines dim on the fog-immune chart, enemy mines brighter in the fogged world.
//
// STORY 2.9 — MINES MOVE. They were rendered as static points ("a sprite's
// position is set once on spawn"), which was true until the SELF-PROPELLED
// doctrine (Story 2.8) put mines under power: the server creeps them and
// re-sends their positions every tick, and this renderer silently discarded
// every one of those updates — a creeping mine sat frozen at its drop point
// while the real, lethal one walked away. reconcile() therefore returns a MOVE
// list alongside add/remove, and a mine that actually moved gets a creep tell:
// a heading tick along its course (static — it reads at motion=off) plus a
// faint wake dot dropped behind it every few units. The MOTION itself is the
// information; the tell only makes it legible when the mine is barely crawling.
//
// reconcile() is the pure list→lifecycle diff (unit-tested); the Pixi wiring is
// a thin adapter around it.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, type MineView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { dashArcs } from '../util/math.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export type { HueFor };

const O = CLIENT_CONFIG.ordnance;
const R = CLIENT_CONFIG.mineRings;
const P = CLIENT_CONFIG.aimPreview;
const RING_R = 10; // u (Eric 2026-07-22: the mine graphic read a bit small)
const DOT_R = 3.5; // u

/**
 * The OWNER'S live mine numbers, fed in every sync (they are effectiveStats
 * values, so a boon fitted this second must move the rings this second). The
 * server reads these same owner stats when a mine trips or blasts, so the rings
 * ARE the mine's ground truth, not a decoration of it.
 *
 * `captive` is the CAPTIVE MINES verb (Story 7-5 wave 2, R2.12), read straight
 * off `stats.mine.captive`. It does NOT carry a radius of its own: the captive
 * transform (swap trigger/blast, then trigger x3) is DERIVED inside
 * effectiveStats, so `blast`/`trigger` above already arrive transformed
 * (144u/32u at base, 210.8u/46.9u at a maxed MINES ladder). Nothing here may
 * re-derive them.
 *
 * THE `acquire` CHANNEL IS DELETED. It carried the SELF-PROPELLED doctrine's
 * hunting reach, and that verb left the game with its card (R2.6), so the field
 * could only ever be null. It was NOT repurposed for the captive trip ring:
 * that ring IS `trigger` (it is literally `stats.mine.triggerRadius`), so a
 * second field carrying the same number would be two names for one radius —
 * exactly the drift a single derivation exists to prevent. What the channel's
 * GRAMMAR is inherited by is the line STYLE: dotted has always meant "the water
 * this mine hunts", which is precisely what a captive mine's trip ring is.
 *
 * `now` is THE FRAME'S OWN TIMESTAMP (`FrameMsg.t`), not a local clock reading,
 * and that distinction is the whole accuracy of the arming dim: `armedAt` is
 * not on the wire and does not need to be — these are OUR mines and we watched
 * them appear — but only if both ends of the comparison come from the same
 * authoritative clock. Dating first-seen by local receive time instead charges
 * the mine for the transport delay and holds the dim systematically late.
 */
export interface OwnMineRings {
  blast: number;
  trigger: number;
  captive: boolean;
  now: number;
}

/** One own-mine radius ring. STYLE, not hue, is what separates them (all three
 *  render in the dropper's personal color — DESIGN.md dual-coding). */
export interface MineRing {
  r: number;
  style: 'solid' | 'dashed' | 'dotted';
  alpha: number;
}

/**
 * Pure: the rings an OWN mine draws. `armed` false dims every ring by
 * `armingScale`: a mine that cannot trip yet must not draw a live trip ring.
 *
 * AN ORDINARY MINE draws two: solid blast (the killing area it detonates in)
 * and dashed trigger (what sets it off).
 *
 * A CAPTIVE MINE draws exactly ONE, and the difference is a statement of fact
 * rather than a style choice (R2.12): a captive mine NEVER detonates on
 * contact, so a solid ring around the casing would promise a contact blast that
 * cannot happen — the one affordance this verb has to stop. Its `blast` is the
 * radius the LAUNCHED TORPEDO bursts in, wherever that torpedo eventually
 * connects, so it is not a circle centred on the mine at all and is not drawn
 * as one. What IS true of the water around the mine is the trip ring, and it is
 * drawn DOTTED — the acquisition grammar the retired SELF-PROPELLED ring used —
 * because that is what this ring now means: the water the mine hunts, and the
 * line the first hostile crosses to eat a torpedo.
 */
export function ownMineRings(p: OwnMineRings, armed: boolean): MineRing[] {
  const scale = armed ? 1 : R.armingScale;
  if (p.captive) return [{ r: p.trigger, style: 'dotted', alpha: R.triggerAlpha * scale }];
  return [
    { r: p.blast, style: 'solid', alpha: R.blastAlpha * scale },
    { r: p.trigger, style: 'dashed', alpha: R.triggerAlpha * scale },
  ];
}

/** Pure: has a mine we first saw at `seenAt` finished arming by `now`? Both are
 *  FRAME timestamps, so the window is measured on the server's own clock. A
 *  `seenAt` of -Infinity means "already armed when we first laid eyes on it" —
 *  the rebuild/rejoin case (see Mines.sync's first-frame rule). */
export function mineArmed(seenAt: number, now: number): boolean {
  return now - seenAt >= CONFIG.mine.armDelay;
}

/** Pure: a redraw key for a ring set — the sprite redraws only when this
 *  changes (a boon lands, or the mine finishes arming), never per frame. */
export function ringsKey(rings: readonly MineRing[]): string {
  return rings.map((r) => `${r.style}:${r.r}:${r.alpha.toFixed(3)}`).join('|');
}

/** What changed between the sprites we hold and the incoming mine list. */
export interface MineDiff {
  add: MineView[];
  /** Held mines whose position CHANGED this sync — the creeping ones. */
  move: MineView[];
  remove: string[];
}

/** The minimum a held sprite needs for the diff: where we last drew it. */
export interface MinePos {
  x: number;
  y: number;
}

/**
 * Pure: true if a re-synced mine has actually TRAVELLED since we last drew it.
 * Frame positions are exact server values, so the epsilon only guards float
 * noise — a stationary mine re-sent verbatim must not read as creeping.
 */
export function mineMoved(prev: MinePos, next: MinePos): boolean {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx * dx + dy * dy > O.creepEpsilon * O.creepEpsilon;
}

/**
 * Pure: given where we currently have sprites (id → last drawn position) and the
 * new frame's mine list, return which mines to add, which to MOVE, and which
 * sprite ids to remove. A mine in both lists at the same position is left
 * untouched (the common case — most mines are moored); one that travelled lands
 * in `move`, which is the defect this signature exists to make impossible to
 * forget.
 */
export function reconcileMines(current: ReadonlyMap<string, MinePos>, incoming: readonly MineView[]): MineDiff {
  const seen = new Set<string>();
  const add: MineView[] = [];
  const move: MineView[] = [];
  for (const m of incoming) {
    seen.add(m.id);
    const held = current.get(m.id);
    if (!held) add.push(m);
    else if (mineMoved(held, m)) move.push(m);
  }
  const remove: string[] = [];
  for (const id of current.keys()) if (!seen.has(id)) remove.push(id);
  return { add, move, remove };
}

/** A live mine sprite + its firer-hue latch (retryHue recolors it once the
 *  dropper's roster hue syncs). `own` drives only brightness on redraw; `x`/`y`
 *  are where we last DREW it (the move-diff input), and `bearing` is its course
 *  once it has been seen to creep (null while it has never moved). */
interface MineSprite extends HueState, MinePos {
  g: Graphics;
  own: boolean;
  /** The color the marker is currently painted in (the hue latch's resolved
   *  hue, or the amber fallback) — a creep redraw needs it without re-probing. */
  color: number;
  bearing: number | null;
  /** Units of creep still owed before the next wake dot drops. */
  wakeIn: number;
  /** Server time (ms) we first saw this mine — the arming-window clock. */
  seenAt: number;
  /** The own-mine radius rings currently painted (empty for an enemy mine),
   *  plus their redraw key, so a per-frame sync is a no-op until something
   *  actually changes. */
  rings: MineRing[];
  ringsKey: string;
}

export class Mines {
  private readonly sprites = new Map<string, MineSprite>();
  /** Has any frame been synced yet? The FIRST one is a rejoin snapshot whose
   *  mines are already on the water (see sync), not a batch of fresh drops. */
  private synced = false;

  /**
   * `ownLayer` = chartRoot (fog-immune); `enemyLayer` = worldRoot.
   * `onOwnMineSpawn` (optional) fires once per own mine newly added this
   * sync — the audio own-fire cue hook (mines have no discrete GameEvent of
   * their own; this reconcile diff is the only "just placed" signal).
   */
  constructor(
    private readonly ownLayer: Container,
    private readonly enemyLayer: Container,
    private readonly onOwnMineSpawn?: (m: MineView) => void,
    /** Drops a creep wake dot at a world point (wired to the effects pool in
     *  main.ts, the projectiles-trail precedent); omitted in tests. */
    private readonly wake?: (x: number, y: number) => void,
  ) {}

  /** Reconcile sprites against this observer's mine list for the tick. `hueFor`
   *  resolves each mine's dropper id (`by`) → its personal hue (Story 1.12), or
   *  null while the roster hasn't synced — those markers boot on the amber
   *  fallback and recolor here on a later tick once the hue lands.
   *
   *  `own` carries the OWNER's live mine radii + the server clock: OUR mines
   *  draw their blast/trigger(/acquisition) rings always-on from it. Omitted
   *  (tests, and any caller that has no own stats yet) = markers only, exactly
   *  as before. An enemy's mine NEVER draws a ring — their numbers are theirs. */
  sync(mines: readonly MineView[], hueFor: HueFor, own?: OwnMineRings): void {
    const { add, move, remove } = reconcileMines(this.sprites, mines);
    // THE FIRST SYNCED FRAME is a rejoin, not a drop: every mine already on the
    // water when we arrive has been there for some unknowable time, and most of
    // them are long armed. Stamping them as first-seen NOW would flash the
    // whole field back to the arming dim for 3s after any reconnect or reload —
    // a lie about live ordnance. They come up ARMED; anything laid after this
    // frame is a real drop and dims honestly.
    const seenAt = this.synced ? (own?.now ?? 0) : -Infinity;
    this.synced = true;
    for (const id of remove) this.despawn(id);
    for (const m of add) this.spawn(m, hueFor, own, seenAt);
    for (const m of move) this.moveTo(m); // SELF-PROPELLED: the mine is under way
    for (const s of this.sprites.values()) {
      retryHue(s, hueFor, (color) => {
        s.color = color;
        this.redraw(s);
      });
      this.refreshRings(s, own);
    }
  }

  /** Re-evaluate one own sprite's rings against the current owner stats +
   *  clock, redrawing ONLY when they actually changed (a boon landed, or the
   *  mine just finished arming and snaps from dim to full). */
  private refreshRings(s: MineSprite, own: OwnMineRings | undefined): void {
    if (!s.own || own === undefined) return;
    const rings = ownMineRings(own, mineArmed(s.seenAt, own.now));
    const key = ringsKey(rings);
    if (key === s.ringsKey) return;
    s.rings = rings;
    s.ringsKey = key;
    this.redraw(s);
  }

  /** The whole sprite: marker + (own) radius rings, in its current hue. */
  private redraw(s: MineSprite): void {
    this.drawMarker(s.g, s.own, s.color, s.bearing);
    for (const ring of s.rings) drawRing(s.g, ring, s.color);
  }

  /** Where a held mine's SPRITE actually sits, and the course it is making good
   *  (null = moored) — the render-state seams the creep tests read, without
   *  reaching into the display list. Null for an id we hold no sprite for. */
  spriteAt(id: string): { x: number; y: number; bearing: number | null } | null {
    const s = this.sprites.get(id);
    return s ? { x: s.g.position.x, y: s.g.position.y, bearing: s.bearing } : null;
  }

  /** The radius rings a held mine currently draws (empty for an enemy mine, or
   *  before owner stats arrive) — the ring tests' render-state seam, without
   *  reaching into the display list. */
  ringsAt(id: string): readonly MineRing[] {
    return this.sprites.get(id)?.rings ?? [];
  }

  private spawn(m: MineView, hueFor: HueFor, own: OwnMineRings | undefined, seenAt: number): void {
    const g = new Graphics();
    const { color, colored, rev } = resolveHue(m.by, hueFor);
    g.position.set(m.x, m.y);
    (m.own ? this.ownLayer : this.enemyLayer).addChild(g);
    const s: MineSprite = {
      g, by: m.by, own: m.own, colored, rev, color,
      x: m.x, y: m.y, bearing: null, wakeIn: O.creepWakeSpacing,
      // A mine appearing after the first synced frame is one we just dropped
      // (own mines never leave our own frame list), so first-seen IS the drop
      // time — dated by the FRAME's clock, the same one `now` reads.
      seenAt, rings: [], ringsKey: '',
    };
    this.sprites.set(m.id, s);
    this.refreshRings(s, own); // draws the rings; redraw() paints the marker too
    if (s.rings.length === 0) this.drawMarker(g, m.own, color, null);
    if (m.own) this.onOwnMineSpawn?.(m);
  }

  /**
   * A creeping mine walked: move its sprite to the new position (THE frozen-
   * renderer fix), turn its heading tick onto the course it just made good, and
   * pay out wake dots along the leg it covered. The tick is redrawn only when the
   * course actually changes — a mine running straight is one position write per
   * tick, not a redraw.
   */
  private moveTo(m: MineView): void {
    const s = this.sprites.get(m.id);
    if (!s) return;
    const dx = m.x - s.x;
    const dy = m.y - s.y;
    const bearing = Math.atan2(dy, dx);
    this.dropWake(s, m, Math.hypot(dx, dy));
    s.x = m.x;
    s.y = m.y;
    s.g.position.set(m.x, m.y);
    if (s.bearing === bearing) return;
    s.bearing = bearing;
    this.redraw(s);
  }

  /**
   * Pay out wake dots behind a creeping mine ALONG the leg it just covered (the
   * projectiles emitTrail idiom, at the mine's own spacing): each owed dot lands
   * at the point on the segment where the mine actually crossed its spacing mark,
   * interpolated from the previous position toward the new one.
   *
   * Stacking them all at the endpoint (which is where the mine IS, not where it
   * has BEEN) drew the whole leg's wake as one bright clot on the mine's nose —
   * a wake that leads its own mine, which is backwards. It only shows up when a
   * frame covers several spacings: a hitch, a tab regaining focus, or simply a
   * mine under enough power to out-travel one dot per tick.
   */
  private dropWake(s: MineSprite, m: MineView, dist: number): void {
    if (!this.wake) {
      s.wakeIn = O.creepWakeSpacing;
      return;
    }
    const ux = dist > 0 ? (m.x - s.x) / dist : 0;
    const uy = dist > 0 ? (m.y - s.y) / dist : 0;
    let along = 0; // distance into the leg the next owed dot sits at
    let remaining = dist;
    while (remaining >= s.wakeIn) {
      remaining -= s.wakeIn;
      along += s.wakeIn;
      s.wakeIn = O.creepWakeSpacing;
      this.wake(s.x + ux * along, s.y + uy * along);
    }
    s.wakeIn -= remaining;
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }

  /**
   * Draw the mine marker onto `g` (clearing any prior geometry — the recolor and
   * creep paths redraw in place). `color` = the dropper's personal hue (same for
   * all observers); `own` drives only the brightness (dim on your own chart,
   * brighter as an enemy warning).
   *
   * `bearing` (radians, null for a moored mine) adds the CREEP TICK: a short
   * spur out of the ring on the course the mine is making good. It is a static
   * shape, so the SELF-PROPELLED doctrine reads at motion=off — where the sprite
   * still moves (position is information, never juice) but a slow crawl between
   * two frames is easy to miss.
   */
  private drawMarker(g: Graphics, own: boolean, color: number, bearing: number | null): void {
    const alpha = own ? 0.7 : 0.9;
    g.clear();
    g.circle(0, 0, RING_R).stroke({ width: 1.5, color, alpha });
    g.circle(0, 0, DOT_R).fill({ color, alpha: own ? 0.8 : 1 });
    if (bearing === null) return;
    const cx = Math.cos(bearing);
    const cy = Math.sin(bearing);
    g.moveTo(cx * RING_R, cy * RING_R)
      .lineTo(cx * (RING_R + O.creepTickLen), cy * (RING_R + O.creepTickLen))
      .stroke({ width: 1.5, color, alpha });
  }
}

/**
 * One own-mine radius ring in the dropper's hue, in the sprite's LOCAL frame
 * (the graphic is positioned at the mine). Style is the channel that separates
 * the radii — solid blast, dashed trigger, sparse-dotted acquisition — so the
 * set reads without color vision and without motion.
 */
function drawRing(g: Graphics, ring: MineRing, color: number): void {
  const stroke = { width: R.width, color, alpha: ring.alpha };
  if (ring.style === 'solid') {
    g.circle(0, 0, ring.r).stroke(stroke);
    return;
  }
  const dashed = ring.style === 'dashed';
  for (const [a0, a1] of dashArcs(
    dashed ? P.dashSegments : P.dotSegments,
    dashed ? P.dashDuty : P.dotDuty,
  )) {
    g.moveTo(Math.cos(a0) * ring.r, Math.sin(a0) * ring.r);
    g.arc(0, 0, ring.r, a0, a1);
  }
  g.stroke(stroke);
}
