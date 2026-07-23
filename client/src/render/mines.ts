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
// Mines are static points: a sprite's position is set once on spawn. reconcile()
// is the pure list→lifecycle diff (unit-tested); the Pixi wiring is a thin
// adapter around it.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { MineView } from '@salvo/shared';
import { resolveHue, retryHue, type HueFor } from './hueLatch.js';

export type { HueFor };

const RING_R = 10; // u (Eric 2026-07-22: the mine graphic read a bit small)
const DOT_R = 3.5; // u

/** What changed between the sprites we hold and the incoming mine list. */
export interface MineDiff {
  add: MineView[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's mine
 * list, return which mines to add and which sprite ids to remove. Ids present
 * in both are left untouched (mines are static — nothing to update).
 */
export function reconcileMines(current: ReadonlySet<string>, incoming: readonly MineView[]): MineDiff {
  const seen = new Set<string>();
  const add: MineView[] = [];
  for (const m of incoming) {
    seen.add(m.id);
    if (!current.has(m.id)) add.push(m);
  }
  const remove: string[] = [];
  for (const id of current) if (!seen.has(id)) remove.push(id);
  return { add, remove };
}

/** A live mine sprite + its firer-hue latch (retryHue recolors it once the
 *  dropper's roster hue syncs). `own` drives only brightness on redraw. */
interface MineSprite {
  g: Graphics;
  by: string;
  own: boolean;
  colored: boolean;
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
  ) {}

  /** Reconcile sprites against this observer's mine list for the tick. `hueFor`
   *  resolves each mine's dropper id (`by`) → its personal hue (Story 1.12), or
   *  null while the roster hasn't synced — those markers boot on the amber
   *  fallback and recolor here on a later tick once the hue lands. */
  sync(mines: readonly MineView[], hueFor: HueFor): void {
    const { add, remove } = reconcileMines(new Set(this.sprites.keys()), mines);
    for (const id of remove) this.despawn(id);
    for (const m of add) this.spawn(m, hueFor);
    for (const s of this.sprites.values()) retryHue(s, hueFor, (color) => this.drawMarker(s.g, s.own, color));
  }

  private spawn(m: MineView, hueFor: HueFor): void {
    const g = new Graphics();
    const { color, colored } = resolveHue(m.by, hueFor);
    this.drawMarker(g, m.own, color);
    g.position.set(m.x, m.y);
    (m.own ? this.ownLayer : this.enemyLayer).addChild(g);
    this.sprites.set(m.id, { g, by: m.by, own: m.own, colored });
    if (m.own) this.onOwnMineSpawn?.(m);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }

  /** Draw the mine marker onto `g` (clearing any prior geometry — the recolor
   *  path redraws in place). `color` = the dropper's personal hue (same for all
   *  observers); `own` drives only the brightness (dim on your own chart,
   *  brighter as an enemy warning). */
  private drawMarker(g: Graphics, own: boolean, color: number): void {
    g.clear();
    g.circle(0, 0, RING_R).stroke({ width: 1.5, color, alpha: own ? 0.7 : 0.9 });
    g.circle(0, 0, DOT_R).fill({ color, alpha: own ? 0.8 : 1 });
  }
}
