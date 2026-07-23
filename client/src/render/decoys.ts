// Decoy-buoy rendering from FrameMsg.decoys (contact-like per-observer state,
// not events — the mines.ts / litZones.ts precedent, Story 1.8). This channel
// carries the TRUTH — the buoy for what it is — delivered to the OWNER always,
// to enemies only where they legitimately truesight it (sight bubble / own lit
// zone), and to spectators. The DECEPTION (the buoy painting as the owner's ship
// on radar) never rides here — it arrives as an ordinary `blip` event and is
// rendered by the phosphor/radar path with zero changes.
//
// OWN vs ENEMY split (mirrors mines.ts, driven by DecoyView.own): OWN buoys draw
// in chartRoot's decoy layer (fog-immune, dim own-green) so you always read your
// own buoy even when it lies under fog beyond sight range; a truesighted ENEMY
// buoy draws in worldRoot's decoy layer (amber warning marker) and only ever
// arrives while sighted, so fog over it is a non-issue — exactly the mine
// convention. Without the split a truesighted enemy buoy would have read as
// YOURS; `own` is the per-observer discriminator that prevents that.
//
// A buoy is a static point (its position is fixed at spawn) so a sprite's
// position is set once, exactly like a mine; reconcile() is the pure
// list -> lifecycle diff (unit-tested), the Pixi wiring a thin adapter. A buoy
// dropping out of the list means expired OR out of view — the client cannot
// tell, and that ambiguity is the design (the mines/litZones precedent).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { DecoyView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const OWN_COLOR = CLIENT_CONFIG.colors.legacy.ownAssetGreen; // dim own-ordnance green (→ 1.12)
const ENEMY_COLOR = CLIENT_CONFIG.colors.amber; // amber warning marker
const OUTER_R = 13; // u — slightly larger than a mine (10u ring): a buoy, not a mine
const INNER_R = 5; // u — inner ring
const MAST = 6; // u — short topmark mast so the buoy reads distinct from a mine's ring+dot

/** What changed between the sprites we hold and the incoming decoy list. */
export interface DecoyDiff {
  add: DecoyView[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's decoy
 * list, return which buoys to add and which sprite ids to remove. Ids present in
 * both are left untouched (a buoy is static — nothing to update). This is what
 * makes a REPLACE (owner drops a second buoy: the old id leaves the list, a new
 * id joins) resolve to one remove + one add, and an expiry/out-of-view drop
 * resolve to a plain remove.
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

export class Decoys {
  private readonly sprites = new Map<string, Graphics>();

  /**
   * `ownLayer` = chartRoot's decoy layer (fog-immune); `enemyLayer` = worldRoot's
   * decoy layer (fogged). `onOwnDecoySpawn` (optional) fires once per OWN buoy
   * newly added this sync — the buoy's own-placement audio cue hook (a decoy has
   * no discrete GameEvent of its own; this reconcile diff is the only "just
   * placed" signal, and gating on `own` means it can never misfire on a
   * truesighted enemy buoy — the Mines onOwnMineSpawn precedent).
   */
  constructor(
    private readonly ownLayer: Container,
    private readonly enemyLayer: Container,
    private readonly onOwnDecoySpawn?: (d: DecoyView) => void,
  ) {}

  /**
   * Reconcile sprites against this observer's decoy list for the tick. Treats a
   * missing frame key as an empty list — the caller passes `f.decoys ?? []`
   * (frames omit the key when the observer sees no buoys). An empty list clears
   * every sprite, which is how a match reset / despawn-all lands (the mines
   * precedent).
   */
  sync(decoys: readonly DecoyView[]): void {
    const { add, remove } = reconcileDecoys(new Set(this.sprites.keys()), decoys);
    for (const id of remove) this.despawn(id);
    for (const d of add) this.spawn(d);
  }

  private spawn(d: DecoyView): void {
    const g = this.marker(d.own);
    g.position.set(d.x, d.y);
    (d.own ? this.ownLayer : this.enemyLayer).addChild(g);
    this.sprites.set(d.id, g);
    if (d.own) this.onOwnDecoySpawn?.(d);
  }

  private despawn(id: string): void {
    const g = this.sprites.get(id);
    if (!g) return;
    g.destroy();
    this.sprites.delete(id);
  }

  /** A buoy topmark: two concentric rings + a short mast — distinct from a mine.
   *  Own = dim green (fog-immune chart marker); enemy = amber warning (the mines
   *  own/enemy tint convention). */
  private marker(own: boolean): Graphics {
    const color = own ? OWN_COLOR : ENEMY_COLOR;
    const ringAlpha = own ? 0.7 : 0.9;
    const innerAlpha = own ? 0.9 : 1;
    const g = new Graphics();
    g.circle(0, 0, OUTER_R).stroke({ width: 1.5, color, alpha: ringAlpha });
    g.circle(0, 0, INNER_R).stroke({ width: 1.5, color, alpha: innerAlpha });
    g.moveTo(0, -OUTER_R).lineTo(0, -OUTER_R - MAST).stroke({ width: 1.5, color, alpha: innerAlpha });
    return g;
  }
}
