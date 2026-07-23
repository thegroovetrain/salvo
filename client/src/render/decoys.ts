// Decoy-buoy rendering from FrameMsg.decoys (contact-like per-observer state,
// not events — the mines.ts / litZones.ts precedent, Story 1.8). This channel
// carries the TRUTH — the buoy for what it is — delivered to the OWNER always,
// to enemies only where they legitimately truesight it (sight bubble / own lit
// zone), and to spectators. The DECEPTION (the buoy painting as the owner's ship
// on radar) never rides here — it arrives as an ordinary `blip` event and is
// rendered by the phosphor/radar path with zero changes.
//
// OWN vs ENEMY LAYER split (mirrors mines.ts, driven by DecoyView.own): OWN buoys
// draw in chartRoot's decoy layer (fog-immune) so you always read your own buoy
// even when it lies under fog beyond sight range; a truesighted ENEMY buoy draws
// in worldRoot's decoy layer and only ever arrives while sighted, so fog over it
// is a non-issue — exactly the mine convention. The MARKER COLOR, as of Story
// 1.12, is the OWNER's personal hue (DecoyView.by → hueFor) — the SAME hue for
// every observer, not an own-green / enemy-amber split (amber survives only as
// the roster-miss fallback); `own` now drives only the layer + brightness.
//
// A buoy is a static point (its position is fixed at spawn) so a sprite's
// position is set once, exactly like a mine; reconcile() is the pure
// list -> lifecycle diff (unit-tested), the Pixi wiring a thin adapter. A buoy
// dropping out of the list means expired OR out of view — the client cannot
// tell, and that ambiguity is the design (the mines/litZones precedent).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { DecoyView } from '@salvo/shared';
import { resolveHue, retryHue, type HueFor } from './hueLatch.js';

export type { HueFor };

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

/** A live buoy sprite + its firer-hue latch (retryHue recolors it once the
 *  owner's roster hue syncs). `own` drives only brightness on redraw. */
interface DecoySprite {
  g: Graphics;
  by: string;
  own: boolean;
  colored: boolean;
}

export class Decoys {
  private readonly sprites = new Map<string, DecoySprite>();

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
  sync(decoys: readonly DecoyView[], hueFor: HueFor): void {
    const { add, remove } = reconcileDecoys(new Set(this.sprites.keys()), decoys);
    for (const id of remove) this.despawn(id);
    for (const d of add) this.spawn(d, hueFor);
    // Story 1.12: recolor any buoy that booted on the amber fallback (owner hue
    // not yet synced at spawn) once its personal hue lands — the mines precedent.
    for (const s of this.sprites.values()) retryHue(s, hueFor, (color) => this.drawMarker(s.g, s.own, color));
  }

  private spawn(d: DecoyView, hueFor: HueFor): void {
    const g = new Graphics();
    const { color, colored } = resolveHue(d.by, hueFor);
    this.drawMarker(g, d.own, color);
    g.position.set(d.x, d.y);
    (d.own ? this.ownLayer : this.enemyLayer).addChild(g);
    this.sprites.set(d.id, { g, by: d.by, own: d.own, colored });
    if (d.own) this.onOwnDecoySpawn?.(d);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }

  /** Draw a buoy topmark onto `g` (clearing prior geometry — the recolor path
   *  redraws in place): two concentric rings + a short mast, distinct from a
   *  mine. `color` = the owner's personal hue (same for all observers, Story
   *  1.12); `own` drives only the brightness (dim on your own chart, brighter as
   *  an enemy warning). */
  private drawMarker(g: Graphics, own: boolean, color: number): void {
    const ringAlpha = own ? 0.7 : 0.9;
    const innerAlpha = own ? 0.9 : 1;
    g.clear();
    g.circle(0, 0, OUTER_R).stroke({ width: 1.5, color, alpha: ringAlpha });
    g.circle(0, 0, INNER_R).stroke({ width: 1.5, color, alpha: innerAlpha });
    g.moveTo(0, -OUTER_R).lineTo(0, -OUTER_R - MAST).stroke({ width: 1.5, color, alpha: innerAlpha });
  }
}
