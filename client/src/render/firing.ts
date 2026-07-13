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
const IMPACT_R = 4; // u — range-clamped impact marker ring

/** Astern mine-drop marker distance (local -x) for a given own hull length. */
function mineMarkerFor(hullLength: number): number {
  return hullLength / 2 + CONFIG.mine.triggerRadius;
}

/**
 * Farthest point (from ship center) a shell can splash: the muzzle offset the
 * server spawns shells at (hull-clear: half hull + shell radius) plus the
 * EFFECTIVE max gun range (stats.gun.rangeU — the gunRange upgrade; mirrors
 * the server's shellRangeFor clamp). Clicks beyond it get an impact marker at
 * the clamped point so a long click reads as "splashes HERE", not a silent miss.
 */
function gunSplashMaxFor(hullLength: number, gunRangeU: number): number {
  return hullLength / 2 + CONFIG.gun.shellRadius + gunRangeU;
}

export interface FiringPose {
  x: number;
  y: number;
  heading: number;
}

/**
 * The selected weapon's ammo state for the firing UX: `hasAmmo` gates whether an
 * arc/marker lights (a round is loadable); `reloadFrac` in [0,1) drives the
 * reload sweep-back wedge (0 = idle/just-fired, → 1 = round nearly ready).
 */
export interface FiringAmmo {
  hasAmmo: boolean;
  reloadFrac: number;
}

export class FiringUX {
  private readonly arcs = new Graphics();
  private readonly reticle = new Graphics();
  /** Own hull length (u), fed each frame by update(); default cruiser. */
  private hullLength: number = CONFIG.shipClasses.cruiser.hull.length;
  /** Effective max gun range (u), fed each frame by update(); base CONFIG. */
  private gunRangeU: number = CONFIG.gun.shellRange;

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
   * the selected weapon (drives which arc/marker shows), `ammo` is the selected
   * weapon's pool state ({hasAmmo, reloadFrac}). `cursor` is the world point.
   * `denied` (default false) briefly overrides the sector/marker to a red pulse
   * — driven by render/deniedFire.ts's rate-limited predicate. `gunRangeU` is
   * the own ship's EFFECTIVE gun range (stats.gun.rangeU) for the splash-max
   * clamp marker.
   */
  update(
    pose: FiringPose,
    aim: number,
    weapon: WeaponId,
    ammo: FiringAmmo,
    cursor: { x: number; y: number },
    hullLength: number,
    denied = false,
    gunRangeU: number = CONFIG.gun.shellRange,
  ): void {
    this.hullLength = hullLength;
    this.gunRangeU = gunRangeU;
    this.arcs.clear();
    this.arcs.position.set(pose.x, pose.y);
    this.arcs.rotation = pose.heading;
    if (weapon === WEAPON.gun) this.drawGunArcs(aim, pose.heading, ammo, denied);
    else if (weapon === WEAPON.torpedo) this.drawBowArc(aim, pose.heading, ammo, denied);
    else this.drawMineMarker(ammo, denied);
    this.drawReticle(pose, aim, weapon, ammo.hasAmmo, cursor);
  }

  /** One sector fill (+ reload sweep-back), in the arcs graphic's local frame. */
  private sector(offset: number, halfArc: number, color: number, lit: boolean, reloadFrac: number): void {
    const g = this.arcs;
    g.moveTo(0, 0);
    g.arc(0, 0, ARC_R, offset - halfArc, offset + halfArc);
    g.lineTo(0, 0);
    g.fill({ color: lit ? color : DIM, alpha: lit ? 0.5 : 0.14 });
    if (reloadFrac > 0 && reloadFrac < 1) {
      g.moveTo(0, 0);
      g.arc(0, 0, ARC_R * 0.5, offset - halfArc, offset + halfArc);
      g.lineTo(0, 0);
      g.fill({ color: DIM, alpha: 0.1 + 0.2 * reloadFrac });
    }
  }

  private drawGunArcs(aim: number, heading: number, ammo: FiringAmmo, denied: boolean): void {
    for (const m of MOUNTS) {
      const lit = inArc(aim, wrapAngle(heading + m.offset), m.halfArc) && ammo.hasAmmo;
      this.sector(m.offset, m.halfArc, denied ? DENIED_RED : AMBER, denied || lit, ammo.reloadFrac);
    }
  }

  private drawBowArc(aim: number, heading: number, ammo: FiringAmmo, denied: boolean): void {
    const t = CONFIG.torpedo;
    const lit = inArc(aim, wrapAngle(heading + t.offset), t.halfArc) && ammo.hasAmmo;
    this.sector(t.offset, t.halfArc, denied ? DENIED_RED : TORP_TINT, denied || lit, ammo.reloadFrac);
  }

  /** Astern drop indicator (local -x): a small ring where the next mine lands. */
  private drawMineMarker(ammo: FiringAmmo, denied: boolean): void {
    const g = this.arcs;
    const color = denied ? DENIED_RED : ammo.hasAmmo ? AMBER : DIM;
    const alpha = denied ? 0.9 : ammo.hasAmmo ? 0.8 : 0.3;
    const marker = mineMarkerFor(this.hullLength);
    g.circle(-marker, 0, 6).stroke({ width: 1.5, color, alpha });
    g.circle(-marker, 0, 2).fill({ color, alpha });
  }

  private drawReticle(
    pose: FiringPose,
    aim: number,
    weapon: WeaponId,
    hasAmmo: boolean,
    cursor: { x: number; y: number },
  ): void {
    const g = this.reticle;
    g.clear();
    if (weapon === WEAPON.mine) return; // mines don't aim — no reticle
    const color = this.reticleColor(pose.heading, aim, weapon, hasAmmo);
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
    const splashMax = gunSplashMaxFor(this.hullLength, this.gunRangeU);
    if (Math.hypot(cursor.x - pose.x, cursor.y - pose.y) <= splashMax) return;
    const g = this.reticle;
    const ix = pose.x + Math.cos(aim) * splashMax;
    const iy = pose.y + Math.sin(aim) * splashMax;
    g.circle(ix, iy, IMPACT_R).stroke({ width: 1.5, color, alpha: 0.9 });
    // A short cross-bearing tick: "the shell stops on this line".
    const tx = Math.cos(aim + Math.PI / 2) * (IMPACT_R + 4);
    const ty = Math.sin(aim + Math.PI / 2) * (IMPACT_R + 4);
    g.moveTo(ix - tx, iy - ty).lineTo(ix + tx, iy + ty).stroke({ width: 1, color, alpha: 0.6 });
  }

  /** Reticle tint: bright when the aim is in the selected weapon's arc + has ammo. */
  private reticleColor(heading: number, aim: number, weapon: WeaponId, hasAmmo: boolean): number {
    if (!(weaponArcHit(heading, aim, weapon) && hasAmmo)) return DIM;
    return weapon === WEAPON.torpedo ? TORP_TINT : AMBER;
  }
}
