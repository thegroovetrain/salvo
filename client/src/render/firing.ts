// Firing UX, split across two camera-transformed layers (see render/stage.ts
// for the full z-order rationale):
//   - Gun-arc sectors (port +90°, starboard −90°, each ±60°) go in the `ship`
//     layer (worldRoot, fogged) — they rotate with the own ship and are always
//     inside the sight bubble, so fog over them is plan-correct. The sector the
//     cursor bears into brightens; a cooldown wedge sweeps back to full as the
//     guns reload.
//   - The crosshair + bearing line go in the `aim` layer (chartRoot, fog-immune)
//     because gun range (480u) exceeds sight range (220u): aiming at a radar
//     blip beyond sight must not put the reticle under the fog. Amber when the
//     aim is in a firing arc AND guns are ready, else dim. The bearing line still
//     originates at the own ship's world position — chartRoot shares worldRoot's
//     camera transform, so it lines up exactly with the hull.
// Pure Pixi adapter (not unit tested); the in-arc test reuses shared inArc.

import { Container, Graphics } from 'pixi.js';
import { CONFIG, inArc, wrapAngle } from '@salvo/shared';

const AMBER = 0xffb800;
const DIM = 0x5a6478;
const ARC_R = 72; // u — sector indicator radius
const RETICLE_R = 7; // u — crosshair size

const MOUNTS = CONFIG.gun.mounts;

export interface FiringPose {
  x: number;
  y: number;
  heading: number;
}

export class FiringUX {
  private readonly arcs = new Graphics();
  private readonly reticle = new Graphics();

  /**
   * `shipLayer` (worldRoot's `ship`) hosts the gun-arc sectors; `aimLayer`
   * (chartRoot's `aim`, fog-immune) hosts the crosshair + bearing line.
   */
  constructor(shipLayer: Container, aimLayer: Container) {
    shipLayer.addChild(this.arcs);
    aimLayer.addChild(this.reticle);
  }

  /** Clear both graphics (own ship sunk — no arcs/reticle). */
  hide(): void {
    this.arcs.clear();
    this.reticle.clear();
  }

  /**
   * Redraw for this frame. `aim` is the world bearing to the cursor, `ready` in
   * [0,1] is the gun ready fraction (1 = loaded). `cursor` is the world point.
   */
  update(pose: FiringPose, aim: number, ready: number, cursor: { x: number; y: number }): void {
    this.drawArcs(pose, aim, ready);
    this.drawReticle(pose, aim, ready, cursor);
  }

  private drawArcs(pose: FiringPose, aim: number, ready: number): void {
    const g = this.arcs;
    g.clear();
    g.position.set(pose.x, pose.y);
    g.rotation = pose.heading;
    for (const m of MOUNTS) {
      const lit = inArc(aim, wrapAngle(pose.heading + m.offset), m.halfArc) && ready >= 1;
      const alpha = lit ? 0.5 : 0.14;
      g.moveTo(0, 0);
      g.arc(0, 0, ARC_R, m.offset - m.halfArc, m.offset + m.halfArc);
      g.lineTo(0, 0);
      g.fill({ color: lit ? AMBER : DIM, alpha });
      // Cooldown sweep-back: an inner wedge that fills toward the full arc.
      if (ready < 1) {
        g.moveTo(0, 0);
        g.arc(0, 0, ARC_R * 0.5, m.offset - m.halfArc, m.offset + m.halfArc);
        g.lineTo(0, 0);
        g.fill({ color: DIM, alpha: 0.1 + 0.2 * ready });
      }
    }
  }

  private drawReticle(
    pose: FiringPose,
    aim: number,
    ready: number,
    cursor: { x: number; y: number },
  ): void {
    const g = this.reticle;
    g.clear();
    const inAnyArc = MOUNTS.some((m) => inArc(aim, wrapAngle(pose.heading + m.offset), m.halfArc));
    const color = inAnyArc && ready >= 1 ? AMBER : DIM;
    g.moveTo(pose.x, pose.y).lineTo(cursor.x, cursor.y).stroke({ width: 1, color, alpha: 0.25 });
    g.circle(cursor.x, cursor.y, RETICLE_R).stroke({ width: 1.5, color, alpha: 0.8 });
    g.moveTo(cursor.x - RETICLE_R - 3, cursor.y).lineTo(cursor.x + RETICLE_R + 3, cursor.y);
    g.moveTo(cursor.x, cursor.y - RETICLE_R - 3).lineTo(cursor.x, cursor.y + RETICLE_R + 3);
    g.stroke({ width: 1, color, alpha: 0.6 });
  }
}
