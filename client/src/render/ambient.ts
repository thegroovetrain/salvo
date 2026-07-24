// Pre-join ambient CIC scene (Story 1.14 · UX-DR25) — the game "breathing"
// behind the DOM home menu so the canvas is NEVER blank before PLAY. A thin Pixi
// adapter (not unit tested); the layout/decay math is extracted into the pure,
// exported functions below and tested in __tests__/ambient.test.ts (the repo
// pattern: pure logic tested, the Pixi shell left to manual/visual QA).
//
// The picture, per the ratified mock (`.cic` in home-class-picker-1.html):
//   • concentric range-ring hairlines — innermost phosphor, outers silver,
//     centered slightly below screen center;
//   • ONE conic sweep wedge (phosphor) in slow, continuous rotation;
//   • a handful of phosphor blips that decay through dim tiers then respawn
//     elsewhere (client render MAY use Math.random — the seeded-RNG law binds
//     SIM code only, not decorative render);
//   • faint island masses;
//   • a radial scrim so the DOM text over it stays legible.
//
// Photosensitivity law: nothing here flashes — the sweep rotates continuously and
// blips step down gently over seconds. All colors come from CLIENT_CONFIG.colors
// tokens (zero raw literals — the tokens guard scans this file).

import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';

const A = CLIENT_CONFIG.home.ambient;
const C = CLIENT_CONFIG.colors;

// --- pure layout / decay math (tested) --------------------------------------

/**
 * Uniform scale that fits the reference-authored ring geometry to the live
 * viewport height, clamped so the scene never collapses on a short viewport or
 * balloons on a very tall one. `ambientScale(1080, 1080) === 1`.
 */
export function ambientScale(screenH: number, refHeight: number = A.refHeight): number {
  if (!(refHeight > 0)) return 1;
  return Math.min(1.5, Math.max(0.5, screenH / refHeight));
}

/** The reference ring radii scaled to the live viewport. */
export function ringLayout(radii: readonly number[], scale: number): number[] {
  return radii.map((r) => r * scale);
}

/** Sweep wedge heading (rad) at `elapsedMs` into a `periodMs` full revolution. */
export function sweepAngleAt(elapsedMs: number, periodMs: number): number {
  if (!(periodMs > 0)) return 0;
  return ((elapsedMs % periodMs) / periodMs) * Math.PI * 2;
}

/**
 * Which discrete decay tier a blip sits in at `ageMs` of its `lifeMs` lifetime:
 * an integer in [0, tierCount-1] (0 = freshest). Life is split into `tierCount`
 * equal windows; at/after full life it stays pinned to the dimmest tier (the
 * scene's update respawns it on the next frame).
 */
export function blipTierIndex(ageMs: number, lifeMs: number, tierCount: number): number {
  if (!(lifeMs > 0) || tierCount <= 1) return 0;
  if (ageMs <= 0) return 0;
  return Math.min(tierCount - 1, Math.floor((ageMs / lifeMs) * tierCount));
}

/** A blip's alpha at `ageMs` — the tier alphas indexed by `blipTierIndex`.
 *  An empty tier array yields a fully-transparent (0) blip rather than
 *  `undefined` (which would poison Graphics.alpha). */
export function blipTierAlpha(
  ageMs: number,
  lifeMs: number,
  tierAlphas: readonly number[],
): number {
  if (tierAlphas.length === 0) return 0;
  return tierAlphas[blipTierIndex(ageMs, lifeMs, tierAlphas.length)];
}

// --- Pixi scene shell (not unit tested) -------------------------------------

interface Blip {
  g: Graphics;
  fx: number; // viewport-fractional position [0,1]
  fy: number;
  ageMs: number;
}

interface Island {
  g: Graphics;
  fx: number;
  fy: number;
  r: number; // reference-px radius (scaled at layout)
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class AmbientScene {
  private readonly root = new Container();
  private readonly rings = new Graphics();
  private readonly sweep = new Graphics();
  private readonly scrim = new Graphics();
  private readonly islands: Island[] = [];
  private readonly blips: Blip[] = [];
  private elapsedMs = 0;
  private readonly onResize = (): void => this.layout();

  /** `parent` = a screen-space-ish container beneath any DOM and above the void
   *  clear color; pass `stage.worldRoot` (empty + identity-transformed pre-join). */
  constructor(
    private readonly app: Application,
    parent: Container,
  ) {
    for (let i = 0; i < A.islandCount; i++) this.islands.push(this.makeIsland());
    for (let i = 0; i < A.blipCount; i++) this.blips.push(this.makeBlip());
    // z-order within the scene: rings → sweep → islands → blips → scrim (on top).
    this.root.addChild(this.rings, this.sweep);
    for (const isl of this.islands) this.root.addChild(isl.g);
    for (const b of this.blips) this.root.addChild(b.g);
    this.root.addChild(this.scrim);
    parent.addChild(this.root);
    this.layout();
    window.addEventListener('resize', this.onResize);
  }

  /** Advance the animated elements (call every render frame). */
  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    this.sweep.rotation = sweepAngleAt(this.elapsedMs, A.sweepPeriodMs);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    for (const b of this.blips) {
      b.ageMs += dtMs;
      if (b.ageMs >= A.blipLifeMs) this.respawn(b, w, h);
      b.g.alpha = blipTierAlpha(b.ageMs, A.blipLifeMs, A.blipTierAlphas);
    }
  }

  /** Tear the scene down (at game start). */
  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.root.destroy({ children: true });
  }

  // --- layout (screen-size aware, re-run on resize) -------------------------

  private layout(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = ambientScale(h);
    const cx = w / 2;
    const cy = h * A.centerYFrac;
    this.rings.position.set(cx, cy);
    this.sweep.position.set(cx, cy);
    this.drawRings(scale);
    this.drawSweep(scale);
    for (const isl of this.islands) this.placeIsland(isl, scale, w, h);
    for (const b of this.blips) b.g.position.set(b.fx * w, b.fy * h);
    this.drawScrim(w, h);
  }

  private drawRings(scale: number): void {
    this.rings.clear();
    ringLayout(A.ringRadii, scale).forEach((r, i) => {
      const color = i === 0 ? C.phosphorBright : C.silver;
      this.rings.circle(0, 0, r).stroke({ width: A.ringWidth, color, alpha: A.ringAlphas[i] });
    });
  }

  private drawSweep(scale: number): void {
    const r = A.ringRadii[A.ringRadii.length - 1] * scale;
    this.sweep.clear();
    this.sweep
      .moveTo(0, 0)
      .arc(0, 0, r, 0, A.sweepWidth)
      .fill({ color: C.phosphorBright, alpha: A.sweepAlpha });
  }

  private drawScrim(w: number, h: number): void {
    const cyFrac = A.scrimCenterYFrac;
    const grad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: cyFrac },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: cyFrac },
      outerRadius: 0.75,
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: cssRgba(C.void, A.scrimInnerAlpha) },
        { offset: 0.62, color: cssRgba(C.void, A.scrimMidAlpha) },
        { offset: 1, color: cssRgba(C.void, A.scrimOuterAlpha) },
      ],
    });
    this.scrim.clear();
    this.scrim.rect(0, 0, w, h).fill(grad);
  }

  private makeIsland(): Island {
    return { g: new Graphics(), fx: rand(0.08, 0.92), fy: rand(0.1, 0.9), r: rand(A.islandMinR, A.islandMaxR) };
  }

  private placeIsland(isl: Island, scale: number, w: number, h: number): void {
    isl.g.clear();
    isl.g
      .ellipse(0, 0, isl.r * scale, isl.r * scale * 0.78)
      .fill({ color: C.islandFill, alpha: A.islandFillAlpha })
      .stroke({ width: 1, color: C.islandStroke, alpha: A.islandStrokeAlpha });
    isl.g.position.set(isl.fx * w, isl.fy * h);
  }

  private makeBlip(): Blip {
    // Drawn at full alpha (soft halo + core); the per-frame tier alpha rides on
    // g.alpha so a fresh blip reads at exactly the mock's fresh tier (.55).
    const g = new Graphics();
    g.blendMode = 'add';
    g.circle(0, 0, A.blipRadius * 2.4).fill({ color: C.phosphorBright, alpha: 0.35 });
    g.circle(0, 0, A.blipRadius).fill({ color: C.phosphorBright, alpha: 1 });
    return { g, fx: rand(0.1, 0.9), fy: rand(0.1, 0.9), ageMs: rand(0, A.blipLifeMs) };
  }

  private respawn(b: Blip, w: number, h: number): void {
    b.ageMs = 0;
    b.fx = rand(0.1, 0.9);
    b.fy = rand(0.1, 0.9);
    b.g.position.set(b.fx * w, b.fy * h);
  }
}
