// ON FIRE (cycle 162, Eric 2026-10-01: "some kind of 'on fire' effect for a
// ship under 25%") — flame tongues at a critically hurt hull.
//
// IT RIDES WOUNDED SMOKE'S PULSE AND NOTHING ELSE. The server already emits an
// anonymous `{k:'sm',x,y,tier}` row at a hurt hull's TRUE position every
// `CONFIG.smoke.puffIntervalMs` (render/smoke.ts's header has the whole
// disclosure story), and `tier === 2` already says "hull below
// `CONFIG.damageBands.criticalBelow`" — 25 %. So fire is a second rendering of
// a row this client has already received: no wire change, no new field, no
// correlation handle, and a modified client that deleted this file would learn
// nothing it did not have. Tier 1 spawns nothing here (smoke alone).
//
// This file copies smoke.ts's SHAPE on purpose:
//   • a PURE core (no Pixi import needed, unit-tested in __tests__/fire.test.ts)
//     — tongue alpha, radius, flicker and rise as functions of AGE;
//   • a thin pooled `Fire` adapter that draws each tongue's geometry ONCE at
//     acquire and per frame touches nothing but alpha / scale / position.
//
// DECAY IS TIMESTAMP MATH AGAINST SERVER TIME (`serverNow - spawnT`), never an
// accumulated dt — smoke's reason verbatim: the backgrounded tab throttles the
// render loop that would do the accumulating while the pulses keep arriving.
//
// FIRE IS INFORMATION, NOT JUICE (the amendment-43 rule, copied from smoke.ts
// because the reasoning is identical). The ratified house rule
// (effects.ts:44-53) is that `motion: 'off'` removes MOTION, never INFORMATION.
// A flame says "this hull is critical, right here" — so its PRESENCE, EXTENT
// and TIER are motion-blind: only `flameFlicker` and `flameRise` are scaled,
// and both bottom out at a still tongue sitting at its true position and true
// size. This is the OPPOSITE of `isJuiceEffect` gating; do not add a motion
// test to the spawn path.
//
// THE TONGUE IS NOT A TRACK either: `CLIENT_CONFIG.fire.lifeMs` is shorter than
// smoke's `puffLifeMs`, so the flames sit on the hull and never trail a course.
// Like smoke there is no per-source cap and none can exist (amendment 45: no
// correlation handle); `capOldest` alone bounds the pool.

import { Container, Graphics } from 'pixi.js';
import type { SmokeEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import { Pool, capOldest } from '../util/pool.js';
import { clamp01 } from '../util/math.js';

const F = CLIENT_CONFIG.fire;
const TAU = Math.PI * 2;

/** The radius a tongue is DRAWN at; every live radius is a scale of it (the
 *  smoke `PUFF_DRAW_RADIUS` idiom — big enough to scale DOWN, so the polygon
 *  stays smooth at the largest on-screen size). */
export const FLAME_DRAW_RADIUS = 20;

/** The wire tier that burns: `sm` tier 2 = hull below `criticalBelow`. */
export const FIRE_TIER: SmokeEvent['tier'] = 2;

/**
 * Pure: a tongue's opacity at `ageMs` — smoke's `puffAlpha` curve: blooms in
 * over `riseFraction` of its life, then fades linearly to nothing across the
 * whole life. Dead (0) at a full life and beyond.
 *
 * A NON-POSITIVE age (clock jitter) is CLAMPED to exactly newborn, so the curve
 * is continuous at the origin — smoke.ts's clamp rule, for its reason (a full
 * alpha at age <= 0 would pop bright for a frame and then drop). Being 0 at age
 * 0 is safe because `render()` retires on AGE, never on alpha.
 *
 * `peak` is NOT motion-scaled: it is the flame's presence.
 */
export function flameAlpha(ageMs: number, lifeMs: number, peak: number): number {
  if (ageMs >= lifeMs) return 0;
  const age = ageMs > 0 ? ageMs : 0;
  const t = clamp01(age / lifeMs);
  const rise = F.riseFraction > 0 ? clamp01(age / (lifeMs * F.riseFraction)) : 1;
  return peak * rise * (1 - t);
}

/** Pure: a tongue's radius at `ageMs`, `r0` at birth growing to `r1` at death
 *  (monotonic, clamped past a full life). Extent — never motion-scaled. */
export function flameRadius(ageMs: number, lifeMs: number, r0: number, r1: number): number {
  return r0 + (r1 - r0) * clamp01(ageMs / lifeMs);
}

/**
 * Pure: the flicker MULTIPLIER on a tongue's alpha and width at `ageMs` — a
 * fast sin wobble. `intensity` is the motion multiplier (1 / 0.5 / 0); at 0
 * this returns exactly 1, a still flame at its true strength and width.
 * `phase` decorrelates the tongues of one pulse.
 */
export function flameFlicker(ageMs: number, intensity: number, phase = 0): number {
  if (intensity <= 0) return 1;
  return 1 + F.flickerAmp * intensity * Math.sin(TAU * (F.flickerHz * (ageMs / 1000) + phase));
}

/**
 * Pure: how far a tongue has risen by `ageMs`, in world units — straight UP on
 * screen (−y), scaled by the motion multiplier, so `motion: 'off'` pins it to
 * the pulse point (the hull's true position: stilling it can only make the
 * flame MORE precise).
 */
export function flameRise(ageMs: number, intensity: number): { dx: number; dy: number } {
  const s = (Math.max(0, ageMs) / 1000) * intensity;
  return { dx: 0, dy: -F.riseSpeed * s };
}

/**
 * Pure: the spawn timestamps one `sm` pulse at server time `t` produces — one
 * per tongue for a tier-2 pulse (the extras BACK-DATED by `stagger`, smoke's
 * depth idiom), and NONE for any other tier.
 */
export function flameSpawnTimes(t: number, tier: SmokeEvent['tier']): number[] {
  if (tier !== FIRE_TIER) return [];
  const out: number[] = [];
  for (let i = 0; i < F.flames; i++) out.push(t - i * F.stagger);
  return out;
}

/**
 * Pure: a teardrop polygon of round radius `r` centred on the origin, its
 * point straight up (−y) at `2r` — flat-coords [x0, y0, x1, y1, …]. The point
 * is the apex; the two tangent lines from it touch the circle at ±60° from the
 * apex direction, and the round base arcs between them through the bottom.
 */
export function flameTongue(r: number, segments = 14): number[] {
  const pts = [0, -2 * r];
  const a0 = -Math.PI / 6; // tangent point right of the apex
  const a1 = (7 * Math.PI) / 6; // tangent point left of it, via the bottom
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}

interface LiveFlame {
  gfx: Graphics;
  /** Server time the tongue was emitted at (drives every ramp above). */
  t: number;
  /** Emission point — the burning hull's TRUE position at that instant. */
  x: number;
  y: number;
  /** Flicker phase offset, so one pulse's tongues do not wobble in unison. */
  phase: number;
}

/**
 * The Pixi adapter. Thin by design: every number it draws comes from the pure
 * functions above. Its container sits at the BOTTOM of the `smoke` chart layer,
 * so the smoke puffs (wounded and SMOKE SCREEN alike) draw over the flames.
 */
export class Fire {
  private readonly root = new Container();
  private readonly pool: Pool<Graphics>;
  private readonly flames: LiveFlame[] = [];
  /** Monotonic spawn counter — only used to decorrelate flicker phases. */
  private spawned = 0;

  constructor(layer: Container) {
    // Index 0, whatever is already there or arrives later: the puffs' pools add
    // their Graphics lazily, so only the bottom slot keeps fire under smoke.
    layer.addChildAt(this.root, 0);
    this.pool = new Pool<Graphics>(() => this.makeFlameGraphics());
  }

  /** How many tongues are currently alive (debug/tests). */
  get liveFlames(): number {
    return this.flames.length;
  }

  /** One tongue, drawn ONCE per pooled Graphics: an amber rim teardrop with a
   *  hot `hitBloom` core inside it, additive so it glows over the water. */
  private makeFlameGraphics(): Graphics {
    const g = new Graphics();
    const { amber, hitBloom } = CLIENT_CONFIG.colors;
    g.poly(flameTongue(FLAME_DRAW_RADIUS), true).fill({ color: amber, alpha: 0.55 });
    g.poly(flameTongue(FLAME_DRAW_RADIUS * 0.55), true).fill({ color: hitBloom, alpha: 0.95 });
    g.blendMode = 'add';
    g.visible = false;
    this.root.addChild(g);
    return g;
  }

  /**
   * A wounded-smoke pulse arrived (fanned out beside `Smoke.onSmoke`). `t` is
   * the FRAME's server timestamp. Tier 1 spawns nothing. NO MOTION GATE LIVES
   * HERE (see the file header).
   */
  onSmoke(e: SmokeEvent, t: number): void {
    // Backgrounded tab: skip the spawn (smoke's rule); `capOldest` is the
    // second line of defence.
    if (typeof document !== 'undefined' && document.hidden) return;
    for (const spawnT of flameSpawnTimes(t, e.tier)) {
      const gfx = this.pool.acquire();
      gfx.position.set(e.x, e.y);
      gfx.visible = true;
      this.spawned += 1;
      this.flames.push({ gfx, t: spawnT, x: e.x, y: e.y, phase: (this.spawned * 0.618) % 1 });
    }
    this.retire(capOldest(this.flames, F.maxFlames));
  }

  /** Hide + pool a batch of retired tongues. */
  private retire(gone: readonly LiveFlame[]): void {
    for (const f of gone) {
      f.gfx.visible = false;
      this.pool.release(f.gfx);
    }
  }

  /** Drop every live tongue at once (teardown / a fresh hull). */
  clear(): void {
    this.retire(this.flames);
    this.flames.length = 0;
  }

  /** Per-frame: age every tongue against SERVER time, retiring the dead ones
   *  on AGE (never on alpha — see `flameAlpha`). */
  render(serverNow: number): void {
    const life = F.lifeMs;
    const intensity = motionIntensity(settings.current.motion);
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      const age = serverNow - f.t;
      if (age >= life) {
        this.retire([f]);
        this.flames.splice(i, 1);
        continue;
      }
      const flicker = flameFlicker(age, intensity, f.phase);
      const s = flameRadius(age, life, F.r0, F.r1) / FLAME_DRAW_RADIUS;
      const { dx, dy } = flameRise(age, intensity);
      f.gfx.alpha = Math.min(1, flameAlpha(age, life, F.peakAlpha) * flicker);
      f.gfx.scale.set(s * flicker, s);
      f.gfx.position.set(f.x + dx, f.y + dy);
    }
  }
}
