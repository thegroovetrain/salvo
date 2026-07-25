// Pre-join ambient CIC scene (Story 1.14 · UX-DR25) — the game "breathing"
// behind the DOM home menu so the canvas is NEVER blank before PLAY. A thin Pixi
// adapter (not unit tested); the layout/crossing math is extracted into the
// pure, exported functions below and tested in __tests__/ambient.test.ts (the
// repo pattern: pure logic tested, the Pixi shell left to manual/visual QA).
//
// This is the GAME's radar, idling (Eric ruling 2026-07-24 — the ambient must
// not be "its own thing with its own rules"):
//   • the sweep is the in-game wedge texture (render/textures.bakeSweepTexture)
//     rotating at the game's base rate (CONFIG.vision.sweepRpm — the real,
//     un-upgraded revolution);
//   • blips are the in-game blip sprite (bakeBlipTexture) and only LIGHT when
//     the beam actually crosses a contact's bearing; they then decay via the
//     game's own phosphor math (render/phosphor.blipAlpha/blipTint), dying
//     exactly as the beam comes back around — no independent timers, no decay
//     tiers, no random respawns;
//   • a handful of fake drifting contacts stand in for ships (client render MAY
//     use Math.random — the seeded-RNG law binds SIM code only);
//   • concentric range-ring hairlines, faint island masses, and a radial scrim
//     (chart furniture — not radar-ruled) complete the picture.
//
// Photosensitivity law: nothing here flashes — the sweep rotates continuously
// and a fresh paint fades over a full sweep period. All colors come from
// CLIENT_CONFIG.colors tokens (zero raw literals — the tokens guard scans this
// file); the blip/sweep textures carry the game's own phosphor palette.

import { Application, Container, FillGradient, Graphics, Sprite } from 'pixi.js';
import { CONFIG, wrapPositive } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { bakeSweepTexture, bakeBlipTexture, SWEEP_TEXTURE_RADIUS, BLIP_TEXTURE_SIZE } from './textures.js';
import { blipAlpha, blipTint } from './phosphor.js';

const A = CLIENT_CONFIG.home.ambient;
const C = CLIENT_CONFIG.colors;

// --- pure layout / crossing math (tested) ------------------------------------

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

/** Sweep beam heading (rad) at `elapsedMs` into a `periodMs` full revolution. */
export function sweepAngleAt(elapsedMs: number, periodMs: number): number {
  if (!(periodMs > 0)) return 0;
  return ((elapsedMs % periodMs) / periodMs) * Math.PI * 2;
}

/**
 * Did the beam cross `bearing` while advancing `prevAngle` → `curAngle`
 * (wrap-safe)? The half-open sweep interval (prev, cur] means a stationary
 * beam (zero step) never paints and a bearing exactly at the new beam angle
 * paints exactly once.
 */
export function sweepCrossed(prevAngle: number, curAngle: number, bearing: number): boolean {
  const step = wrapPositive(curAngle - prevAngle);
  if (step === 0) return false;
  const offset = wrapPositive(bearing - prevAngle);
  return offset > 0 && offset <= step;
}

// --- Pixi scene shell (not unit tested) -------------------------------------

/** A fake drifting ship the idle radar keeps painting. The single blip sprite
 *  is unlit (age = Infinity → alpha 0) until the beam first crosses it. */
interface Contact {
  blip: Sprite;
  fx: number; // viewport-fractional position [0,1]
  fy: number;
  vx: number; // drift, fractions of min(viewport) per second
  vy: number;
  paintAgeMs: number;
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

function driftVelocity(): { vx: number; vy: number } {
  const heading = rand(0, Math.PI * 2);
  return { vx: Math.cos(heading) * A.contactDriftFrac, vy: Math.sin(heading) * A.contactDriftFrac };
}

export class AmbientScene {
  private readonly root = new Container();
  private readonly rings = new Graphics();
  private readonly sweep: Sprite;
  private readonly scrim = new Graphics();
  private readonly islands: Island[] = [];
  private readonly contacts: Contact[] = [];
  private elapsedMs = 0;
  private sweepAngle = 0;
  private readonly onResize = (): void => this.layout();

  /** `parent` = a screen-space-ish container beneath any DOM and above the void
   *  clear color; pass `stage.worldRoot` (empty + identity-transformed pre-join). */
  constructor(
    private readonly app: Application,
    parent: Container,
  ) {
    this.root.alpha = A.sceneAlpha; // master menu-page dimmer
    this.sweep = new Sprite(bakeSweepTexture());
    this.sweep.anchor.set(0.5);
    this.sweep.blendMode = 'add';
    this.sweep.alpha = A.sweepAlpha;
    const blipTexture = bakeBlipTexture();
    for (let i = 0; i < A.islandCount; i++) this.islands.push(this.makeIsland());
    for (let i = 0; i < A.contactCount; i++) this.contacts.push(this.makeContact(blipTexture));
    // z-order within the scene: chart furniture (rings → islands) under the
    // legibility scrim, then the LIVE radar (sweep → blips) above it — the same
    // relationship the game gives blips/sweep, which render fog-immune above
    // the fog composite (see render/stage.ts chartRoot).
    this.root.addChild(this.rings);
    for (const isl of this.islands) this.root.addChild(isl.g);
    this.root.addChild(this.scrim, this.sweep);
    for (const c of this.contacts) this.root.addChild(c.blip);
    parent.addChild(this.root);
    this.layout();
    window.addEventListener('resize', this.onResize);
  }

  /** Advance the idling radar (call every render frame): rotate the beam at the
   *  game's real period, paint any contact the beam crossed, phosphor-decay. */
  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    // Base (un-upgraded) revolution — no observer exists on the menu.
    const period = 60000 / CONFIG.vision.sweepRpm;
    const prev = this.sweepAngle;
    const cur = sweepAngleAt(this.elapsedMs, period);
    this.sweep.rotation = cur;
    this.sweepAngle = cur;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;
    const cy = h * A.centerYFrac;
    for (const c of this.contacts) this.stepContact(c, prev, cur, { w, h, cx, cy, dtMs, period });
  }

  /** Tear the scene down (at game start). */
  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.root.destroy({ children: true });
  }

  // --- radar rules (game-faithful) -------------------------------------------

  private stepContact(
    c: Contact,
    prevAngle: number,
    curAngle: number,
    v: { w: number; h: number; cx: number; cy: number; dtMs: number; period: number },
  ): void {
    // Drift + bounce inside the visible band. Velocity is in fractions of the
    // min viewport dimension per second; convert to per-axis fractions.
    const driftPx = Math.min(v.w, v.h) * (v.dtMs / 1000);
    if (v.w > 0) c.fx += c.vx * (driftPx / v.w);
    if (v.h > 0) c.fy += c.vy * (driftPx / v.h);
    if (c.fx < 0.06 || c.fx > 0.94) c.vx = -c.vx;
    if (c.fy < 0.08 || c.fy > 0.92) c.vy = -c.vy;
    const x = c.fx * v.w;
    const y = c.fy * v.h;
    // The paint rule: light ONLY when the beam crosses the contact's bearing.
    const bearing = wrapPositive(Math.atan2(y - v.cy, x - v.cx));
    if (sweepCrossed(prevAngle, curAngle, bearing)) {
      c.paintAgeMs = 0;
      c.blip.position.set(x, y); // painted where the beam found it
    } else {
      c.paintAgeMs += v.dtMs;
    }
    // The game's phosphor decay: alpha 1 → 0 across one sweep period, tint
    // cooling bright → dark over the first ~30% (render/phosphor.ts).
    c.blip.alpha = blipAlpha(c.paintAgeMs, v.period);
    c.blip.tint = blipTint(c.paintAgeMs, v.period);
  }

  // --- layout (screen-size aware, re-run on resize) -------------------------

  private layout(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = ambientScale(h);
    const cx = w / 2;
    const cy = h * A.centerYFrac;
    const outer = A.ringRadii[A.ringRadii.length - 1] * scale;
    this.rings.position.set(cx, cy);
    this.sweep.position.set(cx, cy);
    this.sweep.scale.set(outer / SWEEP_TEXTURE_RADIUS);
    this.drawRings(scale);
    for (const isl of this.islands) this.placeIsland(isl, scale, w, h);
    this.drawScrim(w, h);
  }

  private drawRings(scale: number): void {
    this.rings.clear();
    ringLayout(A.ringRadii, scale).forEach((r, i) => {
      const color = i === 0 ? C.phosphorBright : C.silver;
      this.rings.circle(0, 0, r).stroke({ width: A.ringWidth, color, alpha: A.ringAlphas[i] });
    });
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

  private makeContact(blipTexture: ReturnType<typeof bakeBlipTexture>): Contact {
    const blip = new Sprite(blipTexture);
    blip.anchor.set(0.5);
    blip.blendMode = 'add';
    blip.scale.set(A.blipDiameterPx / BLIP_TEXTURE_SIZE);
    blip.alpha = 0; // unlit until the beam first finds it
    return { blip, ...driftVelocity(), fx: rand(0.1, 0.9), fy: rand(0.12, 0.88), paintAgeMs: Number.POSITIVE_INFINITY };
  }
}
