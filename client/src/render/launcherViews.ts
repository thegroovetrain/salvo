// THE DECK TORPEDO LAUNCHERS ON A HULL VIEW (Story 10.6, Eric 2026-11-05, R6 /
// I2 / I7, epic-10 amendment 12) — the turrets' pattern (render/ships.ts):
// one Graphics per launcher, borrowing a shared art context
// (render/hullArt/pixiArt.ts `launcherContext`), seated on the deck UNDER the
// turrets at the hull's shared
// station (`launcherStation` — FORE, and AFT when held) and rotated by its
// hull-relative angle. Per frame only rotations are written; the children are
// rebuilt only when the launcher count, the tube count or the line color
// changes (a card, a sighting, a relation flip).
//
// WHAT IS KNOWN DECIDES WHAT IS DRAWN. The own hull knows its tubes
// (`stats.tubesPerLauncher`) and draws them; a sighted enemy carries only its
// launcher ANGLES (`Contact.lu` — I7: the count is the array's length, the
// tubes are never on the wire), so it draws the one generic housing
// (`tubes` null). A drone mounts none.

import { Graphics, type Container } from 'pixi.js';
import { launcherRest, launcherStation, type ShipClassId } from '@salvo/shared';
import { launcherContext } from './hullArt/pixiArt.js';

export class LauncherMounts {
  private views: Graphics[] = [];
  /** What the current children were built for (no per-frame allocation to compare). */
  private builtFor: { cls: ShipClassId | null; n: number; tubes: number | null; stroke: number } | null = null;

  /** `parent` is the hull view's container; `deck` the child the launchers
   *  are seated directly OVER — the deck art — so every turret (and its
   *  barrels) draws on top of them (Eric 2026-11-05: "It needs to render
   *  under the gun barrels, not over"). */
  constructor(
    private readonly parent: Container,
    private readonly deck: Container,
  ) {}

  /** How many launcher children are drawn (tests/debug). */
  get count(): number {
    return this.views.length;
  }

  /** Launcher `i`'s child Graphics (tests/debug), or undefined. */
  view(i: number): Graphics | undefined {
    return this.views[i];
  }

  /**
   * Draw `angles.length` launchers on captain hull `cls` (null = a drone:
   * none), launcher `i` pointing along its hull-relative `angles[i]`, with
   * `tubes` tubes each (null = the generic enemy housing), lined in `stroke`.
   */
  set(cls: ShipClassId | null, angles: readonly number[], tubes: number | null, stroke: number): void {
    const n = cls === null ? 0 : angles.length;
    const b = this.builtFor;
    if (b === null || b.cls !== cls || b.n !== n || b.tubes !== tubes || b.stroke !== stroke) this.rebuild(cls, n, tubes, stroke);
    for (let i = 0; i < this.views.length; i++) this.views[i].rotation = angles[i] ?? launcherRest(i);
  }

  /** Drop every launcher child (hull change). */
  clear(): void {
    for (const v of this.views) v.destroy();
    this.views = [];
    this.builtFor = null;
  }

  private rebuild(cls: ShipClassId | null, n: number, tubes: number | null, stroke: number): void {
    this.clear();
    this.builtFor = { cls, n, tubes, stroke };
    if (cls === null) return;
    for (let i = 0; i < n; i++) {
      const g = new Graphics(launcherContext(cls, tubes, stroke));
      const p = launcherStation(cls, i);
      g.position.set(p.x, p.y);
      this.parent.addChildAt(g, this.parent.getChildIndex(this.deck) + 1 + i);
      this.views.push(g);
    }
  }
}
