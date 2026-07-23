// Storm-circle renderer. Two pieces:
//   1. CHARTED rings (chartRoot, fog-immune): the live safe circle (thin bright
//      GREEN ring — the safe side), a wide translucent dimensional-purple storm
//      annulus just outside it, and a dim dashed purple target ring at the final
//      radius (shown from grace onward so players can plan). All are
//      camera-transformed world geometry.
//   2. SCREEN vignette (hudRoot): a pre-baked dimensional-purple radial-gradient
//      sprite whose alpha pulses while the own ship is out of the zone.
//
// The safe radius is DERIVED on the client from zoneStartT + CONFIG via
// serverNow() (see ArenaState JSDoc) so it is smooth at 60fps; this module just
// draws whatever radius it is handed. Charted ring/annulus redraws are throttled
// to meaningful radius changes (>1u) — the vignette is the only per-frame cost.
// Thin Pixi adapter except vignetteAlpha(), which is pure + unit-tested.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ZonePhase } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { bakeVignetteTexture } from './textures.js';

const SAFE_RING = CLIENT_CONFIG.colors.phosphor; // phosphor-green safe boundary — the safe side
// The wide storm band is the storm FILL (`storm`); the thin dashed final-radius
// ring is a graphic on-water edge stroke, so it reads at readout brightness
// (`storm-readout`) — the `storm` fill at 2.87:1 is below the 3:1 graphic
// threshold (DESIGN.md storm color note).
const TARGET_RING = CLIENT_CONFIG.colors.stormReadout; // on-water final-radius edge telegraph
const STORM = CLIENT_CONFIG.colors.storm; // storm band fill
const STORM_BAND = 70; // u — annulus width painted outside the safe ring
const TARGET_DASHES = 48; // dash segments around the target ring
const REDRAW_EPS = 1; // u — min radius change before re-stroking the rings

/** Zone display state incl. the pre-start `idle` (charted rings hidden). */
export type ZoneDisplay = 'idle' | ZonePhase;

// Purple reads calmer than the old red, so the out-of-zone vignette leans on
// alpha (brightness), not saturation, to keep its alarm legibility (DESIGN.md).
const VIGNETTE_BASE = 0.27; // mean alpha while outside
const VIGNETTE_AMP = 0.17; // pulse amplitude (stays > 0 at the trough)
const VIGNETTE_PULSE_HZ = 1.1; // pulses per second

/**
 * Out-of-zone vignette alpha (pure). 0 when safely inside; otherwise a gentle
 * sinusoidal pulse in [base−amp, base+amp] driven by wall-clock seconds. Kept
 * pure so the state→alpha mapping is unit-tested without Pixi.
 */
export function vignetteAlpha(inStorm: boolean, tSec: number): number {
  if (!inStorm) return 0;
  return VIGNETTE_BASE + VIGNETTE_AMP * Math.sin(tSec * VIGNETTE_PULSE_HZ * Math.PI * 2);
}

/** Draw a dashed circle (50% duty) into `g` as many arc subpaths; caller strokes. */
function dashedCircle(g: Graphics, r: number, segments: number): void {
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.5;
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    g.arc(0, 0, r, a0, a1);
  }
}

export class Zone {
  private readonly rings = new Graphics(); // safe ring + storm annulus (redrawn on change)
  private readonly target = new Graphics(); // dashed final-radius ring (drawn once)
  private readonly vignette: Sprite;
  private readonly endRadius: number;
  private lastRadius = -Infinity;

  constructor(chartLayer: Container, vignetteLayer: Container, mapRadius: number, endRadiusFraction: number) {
    this.endRadius = mapRadius * endRadiusFraction;
    chartLayer.addChild(this.rings);
    chartLayer.addChild(this.target);
    dashedCircle(this.target, this.endRadius, TARGET_DASHES);
    this.target.stroke({ width: 2, color: TARGET_RING, alpha: 0.5 });
    this.target.visible = false;

    this.vignette = new Sprite(bakeVignetteTexture());
    this.vignette.anchor.set(0.5);
    this.vignette.alpha = 0;
    vignetteLayer.addChild(this.vignette);
  }

  /** Re-stroke the safe ring + storm band for a new radius (throttled by caller). */
  private drawRings(radius: number): void {
    const g = this.rings;
    g.clear();
    // Wide storm band hugging the outside of the safe ring (purple reads calmer
    // than red, so a touch more alpha keeps it legible as a hazard).
    g.circle(0, 0, radius + STORM_BAND / 2).stroke({ width: STORM_BAND, color: STORM, alpha: 0.11 });
    // Thin bright safe boundary (stays green — the safe side).
    g.circle(0, 0, radius).stroke({ width: 2, color: SAFE_RING, alpha: 0.7 });
  }

  /**
   * Update the zone visuals for this frame.
   *   radius   — current safe radius (u), derived on the client for smoothness
   *   state    — 'idle' (hide everything) | 'grace' | 'shrinking' | 'closed'
   *   inStorm  — own ship currently outside the safe radius
   *   nowSec   — wall-clock seconds (drives the vignette pulse)
   *   screenW/H — viewport (positions + stretches the screen-space vignette)
   */
  update(radius: number, state: ZoneDisplay, inStorm: boolean, nowSec: number, screenW: number, screenH: number): void {
    const active = state !== 'idle';
    this.rings.visible = active;
    // The final-radius telegraph shows from grace onward (plan) but not once the
    // ring has already reached it (closed) — then the safe ring sits on top.
    this.target.visible = active && state !== 'closed';
    if (active && Math.abs(radius - this.lastRadius) > REDRAW_EPS) {
      this.drawRings(radius);
      this.lastRadius = radius;
    }
    this.vignette.position.set(screenW / 2, screenH / 2);
    this.vignette.width = screenW;
    this.vignette.height = screenH;
    this.vignette.alpha = active ? vignetteAlpha(inStorm, nowSec) : 0;
  }

  destroy(): void {
    const tex = this.vignette.texture;
    this.vignette.destroy();
    if (tex !== Texture.EMPTY) tex.destroy(true);
    this.rings.destroy();
    this.target.destroy();
  }
}
