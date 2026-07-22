// Mine field rendering from FrameMsg.mines (contact-like per-observer state, not
// events). Own mines are drawn in chartRoot (fog-immune, dim green) so you can
// always read your own field even when it lies under fog beyond sight range;
// enemy mines are drawn in worldRoot (amber warning marker) and only ever arrive
// while sighted, so fog over them is a non-issue. A mine dropping out of the
// frame list simply despawns its sprite — the client cannot tell whether it was
// triggered or just fell out of sight, and that ambiguity is the design.
//
// Mines are static points: a sprite's position is set once on spawn. reconcile()
// is the pure list→lifecycle diff (unit-tested); the Pixi wiring is a thin
// adapter around it.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { MineView } from '@salvo/shared';

const OWN_COLOR = 0x2f7d5a; // dim tactical green (your own ordnance)
const ENEMY_COLOR = 0xffb800; // DESIGN.md amber warning
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

export class Mines {
  private readonly sprites = new Map<string, Graphics>();

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

  /** Reconcile sprites against this observer's mine list for the tick. */
  sync(mines: readonly MineView[]): void {
    const { add, remove } = reconcileMines(new Set(this.sprites.keys()), mines);
    for (const id of remove) this.despawn(id);
    for (const m of add) this.spawn(m);
  }

  private spawn(m: MineView): void {
    const g = this.marker(m.own);
    g.position.set(m.x, m.y);
    (m.own ? this.ownLayer : this.enemyLayer).addChild(g);
    this.sprites.set(m.id, g);
    if (m.own) this.onOwnMineSpawn?.(m);
  }

  private despawn(id: string): void {
    const g = this.sprites.get(id);
    if (!g) return;
    g.destroy();
    this.sprites.delete(id);
  }

  private marker(own: boolean): Graphics {
    const color = own ? OWN_COLOR : ENEMY_COLOR;
    const g = new Graphics();
    g.circle(0, 0, RING_R).stroke({ width: 1.5, color, alpha: own ? 0.7 : 0.9 });
    g.circle(0, 0, DOT_R).fill({ color, alpha: own ? 0.8 : 1 });
    return g;
  }
}
