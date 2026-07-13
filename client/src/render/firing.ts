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
import { CONFIG, WEAPON, inArc, wrapAngle, type WeaponId } from '@salvo/shared';
import { weaponArcHit } from './weaponArc.js';

const AMBER = 0xffb800;
const TORP_TINT = 0x3fbf8f; // cool green — torpedo bow arc
const DIM = 0x5a6478;
const DENIED_RED = 0xff3b3b; // DESIGN.md invalid-placement red
const ARC_R = 72; // u — sector indicator radius
const RETICLE_R = 7; // u — crosshair size

const MOUNTS = CONFIG.gun.mounts;
const MINE_MARKER = CONFIG.ship.length / 2 + CONFIG.mine.triggerRadius; // astern drop point (local -x)
// Farthest point (from ship center) a shell can splash: the muzzle offset the
// server spawns shells at (hull-clear: half hull + shell radius) plus max gun
// range. Clicks beyond it get an impact marker at the clamped point so a long
// click reads as "splashes HERE", not as a silent miss.
const GUN_SPLASH_MAX = CONFIG.ship.length / 2 + CONFIG.gun.shellRadius + CONFIG.gun.shellRange;
const IMPACT_R = 4; // u — range-clamped impact marker ring

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
   * Redraw for this frame. `aim` is the world bearing to the cursor, `weapon` is
   * the selected weapon (drives which arc/marker shows), `ready` in [0,1] is the
   * selected weapon's ready fraction (1 = loaded). `cursor` is the world point.
   * `denied` (default false) briefly overrides the sector/marker to a red pulse
   * — driven by render/deniedFire.ts's rate-limited predicate.
   */
  update(
    pose: FiringPose,
    aim: number,
    weapon: WeaponId,
    ready: number,
    cursor: { x: number; y: number },
    denied = false,
  ): void {
    this.arcs.clear();
    this.arcs.position.set(pose.x, pose.y);
    this.arcs.rotation = pose.heading;
    if (weapon === WEAPON.gun) this.drawGunArcs(aim, pose.heading, ready, denied);
    else if (weapon === WEAPON.torpedo) this.drawBowArc(aim, pose.heading, ready, denied);
    else this.drawMineMarker(ready, denied);
    this.drawReticle(pose, aim, weapon, ready, cursor);
  }

  /** One sector fill (+ cooldown sweep-back), in the arcs graphic's local frame. */
  private sector(offset: number, halfArc: number, color: number, lit: boolean, ready: number): void {
    const g = this.arcs;
    g.moveTo(0, 0);
    g.arc(0, 0, ARC_R, offset - halfArc, offset + halfArc);
    g.lineTo(0, 0);
    g.fill({ color: lit ? color : DIM, alpha: lit ? 0.5 : 0.14 });
    if (ready < 1) {
      g.moveTo(0, 0);
      g.arc(0, 0, ARC_R * 0.5, offset - halfArc, offset + halfArc);
      g.lineTo(0, 0);
      g.fill({ color: DIM, alpha: 0.1 + 0.2 * ready });
    }
  }

  private drawGunArcs(aim: number, heading: number, ready: number, denied: boolean): void {
    for (const m of MOUNTS) {
      const lit = inArc(aim, wrapAngle(heading + m.offset), m.halfArc) && ready >= 1;
      this.sector(m.offset, m.halfArc, denied ? DENIED_RED : AMBER, denied || lit, ready);
    }
  }

  private drawBowArc(aim: number, heading: number, ready: number, denied: boolean): void {
    const t = CONFIG.torpedo;
    const lit = inArc(aim, wrapAngle(heading + t.offset), t.halfArc) && ready >= 1;
    this.sector(t.offset, t.halfArc, denied ? DENIED_RED : TORP_TINT, denied || lit, ready);
  }

  /** Astern drop indicator (local -x): a small ring where the next mine lands. */
  private drawMineMarker(ready: number, denied: boolean): void {
    const g = this.arcs;
    const color = denied ? DENIED_RED : ready >= 1 ? AMBER : DIM;
    const alpha = denied ? 0.9 : ready >= 1 ? 0.8 : 0.3;
    g.circle(-MINE_MARKER, 0, 6).stroke({ width: 1.5, color, alpha });
    g.circle(-MINE_MARKER, 0, 2).fill({ color, alpha });
  }

  private drawReticle(
    pose: FiringPose,
    aim: number,
    weapon: WeaponId,
    ready: number,
    cursor: { x: number; y: number },
  ): void {
    const g = this.reticle;
    g.clear();
    if (weapon === WEAPON.mine) return; // mines don't aim — no reticle
    const color = this.reticleColor(pose.heading, aim, weapon, ready);
    g.moveTo(pose.x, pose.y).lineTo(cursor.x, cursor.y).stroke({ width: 1, color, alpha: 0.25 });
    g.circle(cursor.x, cursor.y, RETICLE_R).stroke({ width: 1.5, color, alpha: 0.8 });
    g.moveTo(cursor.x - RETICLE_R - 3, cursor.y).lineTo(cursor.x + RETICLE_R + 3, cursor.y);
    g.moveTo(cursor.x, cursor.y - RETICLE_R - 3).lineTo(cursor.x, cursor.y + RETICLE_R + 3);
    g.stroke({ width: 1, color, alpha: 0.6 });
    if (weapon === WEAPON.gun) this.drawRangeClampMarker(pose, aim, cursor, color);
  }

  /**
   * Guns splash AT the clicked point, clamped to max range: when the cursor
   * sits beyond it, mark where the shell will actually land — a small ring +
   * tick on the aim bearing at the clamped distance. The crosshair stays at
   * the cursor; this marker is the truth about the splash point.
   */
  private drawRangeClampMarker(
    pose: FiringPose,
    aim: number,
    cursor: { x: number; y: number },
    color: number,
  ): void {
    if (Math.hypot(cursor.x - pose.x, cursor.y - pose.y) <= GUN_SPLASH_MAX) return;
    const g = this.reticle;
    const ix = pose.x + Math.cos(aim) * GUN_SPLASH_MAX;
    const iy = pose.y + Math.sin(aim) * GUN_SPLASH_MAX;
    g.circle(ix, iy, IMPACT_R).stroke({ width: 1.5, color, alpha: 0.9 });
    // A short cross-bearing tick: "the shell stops on this line".
    const tx = Math.cos(aim + Math.PI / 2) * (IMPACT_R + 4);
    const ty = Math.sin(aim + Math.PI / 2) * (IMPACT_R + 4);
    g.moveTo(ix - tx, iy - ty).lineTo(ix + tx, iy + ty).stroke({ width: 1, color, alpha: 0.6 });
  }

  /** Reticle tint: bright when the aim is in the selected weapon's arc + ready. */
  private reticleColor(heading: number, aim: number, weapon: WeaponId, ready: number): number {
    if (!(weaponArcHit(heading, aim, weapon) && ready >= 1)) return DIM;
    return weapon === WEAPON.torpedo ? TORP_TINT : AMBER;
  }
}
