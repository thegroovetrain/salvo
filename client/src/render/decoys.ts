// Decoy-buoy rendering from FrameMsg.decoys (contact-like per-observer state,
// not events — the mines.ts / litZones.ts precedent, Story 1.8). This channel
// carries the TRUTH — the buoy for what it is — delivered to the OWNER always,
// to enemies only where they legitimately truesight it (sight bubble / own lit
// zone), and to spectators. The DECEPTION (the buoy painting as the owner's ship
// on radar) never rides here — it arrives as an ordinary `blip` event and is
// rendered by the phosphor/radar path with zero changes.
//
// Buoys draw in chartRoot's decoy layer (fog-immune, like own mines): every
// DecoyView that reaches us is one we are entitled to see (the server gates
// visibility), so a fog-immune chart marker is always plan-correct and lets you
// read your own buoy under fog beyond sight range.
//
// CONTRACT GAP (reported to the orchestrator): DecoyView is `{id,x,y,until}` with
// NO owner discriminator (unlike MineView's `own`), so the client CANNOT split
// own vs enemy buoys — every buoy renders in one style, and the owner's
// placement cue is played from the key-press path (main.handleAbilityPress), not
// from a reconcile hook, so it can never misfire on an enemy buoy we truesight.
// If an own-green / enemy-amber split is wanted, DecoyView needs an `own` field
// mirroring mineSignal.materialize.
//
// A buoy is a static point (its position is fixed at spawn) so a sprite's
// position is set once, exactly like a mine; reconcile() is the pure
// list -> lifecycle diff (unit-tested), the Pixi wiring a thin adapter. A buoy
// dropping out of the list means expired OR out of view — the client cannot
// tell, and that ambiguity is the design (the mines/litZones precedent).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { DecoyView } from '@salvo/shared';

const COLOR = 0x2f7d5a; // dim tactical green — own-ordnance family (mines convention)
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

  /** `layer` = chartRoot's decoy layer (fog-immune, above the base map). */
  constructor(private readonly layer: Container) {}

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
    const g = this.marker();
    g.position.set(d.x, d.y);
    this.layer.addChild(g);
    this.sprites.set(d.id, g);
  }

  private despawn(id: string): void {
    const g = this.sprites.get(id);
    if (!g) return;
    g.destroy();
    this.sprites.delete(id);
  }

  /** A buoy topmark: two concentric rings + a short mast — distinct from a mine. */
  private marker(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, OUTER_R).stroke({ width: 1.5, color: COLOR, alpha: 0.7 });
    g.circle(0, 0, INNER_R).stroke({ width: 1.5, color: COLOR, alpha: 0.9 });
    g.moveTo(0, -OUTER_R).lineTo(0, -OUTER_R - MAST).stroke({ width: 1.5, color: COLOR, alpha: 0.9 });
    return g;
  }
}
