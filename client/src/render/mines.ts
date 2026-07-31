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
import type { MineView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export type { HueFor };

const O = CLIENT_CONFIG.ordnance;
const RING_R = 10; // u (Eric 2026-07-22: the mine graphic read a bit small)
const DOT_R = 3.5; // u

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
}

export class Mines {
  private readonly sprites = new Map<string, MineSprite>();

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
   *  fallback and recolor here on a later tick once the hue lands. */
  sync(mines: readonly MineView[], hueFor: HueFor): void {
    const { add, move, remove } = reconcileMines(this.sprites, mines);
    for (const id of remove) this.despawn(id);
    for (const m of add) this.spawn(m, hueFor);
    for (const m of move) this.moveTo(m); // SELF-PROPELLED: the mine is under way
    for (const s of this.sprites.values()) {
      retryHue(s, hueFor, (color) => {
        s.color = color;
        this.drawMarker(s.g, s.own, color, s.bearing);
      });
    }
  }

  /** Where a held mine's SPRITE actually sits, and the course it is making good
   *  (null = moored) — the render-state seams the creep tests read, without
   *  reaching into the display list. Null for an id we hold no sprite for. */
  spriteAt(id: string): { x: number; y: number; bearing: number | null } | null {
    const s = this.sprites.get(id);
    return s ? { x: s.g.position.x, y: s.g.position.y, bearing: s.bearing } : null;
  }

  private spawn(m: MineView, hueFor: HueFor): void {
    const g = new Graphics();
    const { color, colored, rev } = resolveHue(m.by, hueFor);
    this.drawMarker(g, m.own, color, null);
    g.position.set(m.x, m.y);
    (m.own ? this.ownLayer : this.enemyLayer).addChild(g);
    this.sprites.set(m.id, {
      g, by: m.by, own: m.own, colored, rev, color,
      x: m.x, y: m.y, bearing: null, wakeIn: O.creepWakeSpacing,
    });
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
    this.drawMarker(s.g, s.own, s.color, bearing);
  }

  /** Pay out wake dots behind a creeping mine across the `dist` it just covered
   *  (the projectiles wake-trail idiom, at the mine's own spacing). */
  private dropWake(s: MineSprite, m: MineView, dist: number): void {
    if (!this.wake) {
      s.wakeIn = O.creepWakeSpacing;
      return;
    }
    let remaining = dist;
    while (remaining >= s.wakeIn) {
      remaining -= s.wakeIn;
      s.wakeIn = O.creepWakeSpacing;
      this.wake(m.x, m.y);
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
