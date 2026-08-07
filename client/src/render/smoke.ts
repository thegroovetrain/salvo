// WOUNDED SMOKE (Story 4.4, amendments 40-47) — the client half of the game's
// FIFTH declared perception exception. The server emits an anonymous
// `{k:'sm',x,y,tier}` pulse at a hurt hull's TRUE position every
// `CONFIG.smoke.puffIntervalMs`, within the derived `CONFIG.vision.muzzleFlash`
// halo (412.5u — the ladder's 5/8 rung since Story 4.9) with island LOS clear,
// and keeps NO plume history whatsoever. All
// persistence is synthesized here — the shipped phosphor-blip arrangement
// (render/phosphor.ts pure + render/radar.ts adapter) applied to a second
// anonymous pulse, which is exactly what amendment 45 requires: the plume is
// built the way a BLIP is built, never the way a CONTACT is built.
//
// This file follows that split:
//   • a PURE core (no Pixi import, unit-tested in __tests__/smoke.test.ts) —
//     puff alpha, radius, billow and drift as functions of AGE;
//   • a thin `Smoke` adapter that pools Graphics, draws each puff's geometry
//     ONCE at acquire, and per frame touches nothing but alpha / scale /
//     position.
//
// DECAY IS TIMESTAMP MATH AGAINST SERVER TIME (`serverNow - spawnT`), never an
// accumulated dt — radar.ts:279-303 is the precedent and the reason is the
// backgrounded tab, where the render loop that would do the accumulating is
// throttled or paused while the pulses keep arriving.
//
// TWO CONSTRAINTS THAT ARE NOT STYLE:
//
//   1. THE COLUMN IS NOT A TRACK. `CLIENT_CONFIG.smoke.puffLifeMs` is the only
//      thing separating amendment 43's attached, drifting plume from the
//      decaying trail of puffs Eric explicitly REJECTED (a trail encodes
//      course, speed and origin — continuous ghost blips, a strictly larger
//      disclosure). Raising it is a design change requiring a ruling.
//
//   2. SMOKE IS INFORMATION, NOT JUICE. The ratified house rule
//      (effects.ts:44-53) is that `motion: 'off'` removes MOTION, never
//      INFORMATION. So the plume's PRESENCE, EXTENT and TIER are motion-blind
//      here — only `puffDrift` and `puffBillow` are scaled, and both bottom out
//      at a still puff sitting at its true position and true size. This is the
//      OPPOSITE of `isJuiceEffect` gating; do not add a motion test to the
//      spawn path.
//
// There is no per-source cap and none can exist: the wire carries no
// correlation handle at all (amendment 45), so puffs cannot be grouped by the
// hull that made them. `capOldest` alone bounds the pool.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { SmokeEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import { Pool, capOldest } from '../util/pool.js';
import { clamp01 } from '../util/math.js';

const S = CLIENT_CONFIG.smoke;
const TAU = Math.PI * 2;

/** The radius the puff blob is DRAWN at; every live radius is a scale of it.
 *  Big enough that a 34u heavy puff scales DOWN rather than up, so the circle
 *  tessellation stays smooth at the largest size on screen. */
export const PUFF_DRAW_RADIUS = 40;

/** One tier's presentation — see `CLIENT_CONFIG.smoke.light` / `.heavy`. */
export interface PuffTier {
  readonly puffs: number;
  readonly r0: number;
  readonly r1: number;
  readonly peakAlpha: number;
  readonly stagger: number;
}

/** A fixed drift vector, u/s. */
export interface Wind {
  readonly x: number;
  readonly y: number;
}

/**
 * Pure: the presentation for a wire tier. 1 = light (hp fraction below
 * `CONFIG.damageBands.amberBelow`), 2 = heavy (below `criticalBelow`) — an
 * ENUM, never a fraction. The two differ in COUNT, radius RAMP and peak ALPHA
 * at once so severity survives a glance and a colorblind read alike; hue is
 * identical (`colors.woundedSmoke`) for both.
 */
export function smokeTier(tier: SmokeEvent['tier']): PuffTier {
  return tier === 2 ? S.heavy : S.light;
}

/**
 * Pure: a puff's opacity at `ageMs` — blooms in over `riseFraction` of its
 * life, then fades linearly to nothing across the whole life. Dead (0) at a
 * full life and beyond.
 *
 * A NON-POSITIVE age (clock jitter — the observer's `serverNow` estimate
 * briefly reads BEHIND the pulse's own spawn timestamp) is CLAMPED TO ZERO, so
 * it reads as exactly newborn: the puff sits at the foot of its bloom-in ramp
 * and rises from there. Note the deliberate difference from `phosphor.ts`'s
 * `blipAlpha`, which resolves the same condition to FULL brightness: a blip has
 * no bloom-in ramp, so "newborn" and "full" coincide for it and diverge here.
 * Returning full alpha at age <= 0 would put a discontinuity at the origin —
 * full, then near-zero one millisecond later — which reads as a bright pop
 * followed by a fade-in every time the clock slews backward.
 *
 * Being 0 at age 0 is SAFE only because `render()` retires on AGE, never on
 * alpha; an alpha-based retirement would delete every puff at birth.
 *
 * `peak` is the TIER's peak alpha and is deliberately NOT motion-scaled: it is
 * the plume's presence, which `motion: 'off'` may not touch.
 */
export function puffAlpha(ageMs: number, lifeMs: number, peak: number): number {
  if (ageMs >= lifeMs) return 0;
  // Clamp jitter-negative ages to exactly newborn, so the curve is CONTINUOUS
  // at the origin (see the docstring). Everything below reads `age`, not
  // `ageMs`.
  const age = ageMs > 0 ? ageMs : 0;
  const t = clamp01(age / lifeMs);
  const rise = S.riseFraction > 0 ? clamp01(age / (lifeMs * S.riseFraction)) : 1;
  return peak * rise * (1 - t);
}

/**
 * Pure: a puff's radius at `ageMs` — `r0` at birth growing to `r1` at death,
 * because real smoke disperses as it ages. This is the plume's EXTENT, so it is
 * motion-blind by the same rule that keeps `peakAlpha` motion-blind.
 */
export function puffRadius(ageMs: number, lifeMs: number, r0: number, r1: number): number {
  return r0 + (r1 - r0) * clamp01(ageMs / lifeMs);
}

/**
 * Pure: the billow MULTIPLIER on a puff's radius at `ageMs` — a slow wobble so
 * a column looks alive instead of stamped. `intensity` is the motion multiplier
 * (1 / 0.5 / 0), and at 0 this returns exactly 1: the puff holds its true
 * extent, motionless. Motion, therefore scalable; extent, therefore never
 * scaled to nothing.
 *
 * `phase` decorrelates the puffs of one column so they do not pulse in unison
 * (the adapter passes the puff's own index).
 */
export function puffBillow(ageMs: number, intensity: number, phase = 0): number {
  if (intensity <= 0) return 1;
  return 1 + S.billowAmp * intensity * Math.sin(TAU * (S.billowHz * (ageMs / 1000) + phase));
}

/**
 * Pure: how far a puff has drifted downwind by `ageMs`, in world units.
 * `intensity` is the motion multiplier, so `motion: 'off'` pins every puff to
 * the point it was emitted at — which is the hull's TRUE position, so stilling
 * the wind can only make the plume MORE precise, never less informative.
 */
export function puffDrift(ageMs: number, wind: Wind, intensity: number): { dx: number; dy: number } {
  const s = (Math.max(0, ageMs) / 1000) * intensity;
  return { dx: wind.x * s, dy: wind.y * s };
}

/**
 * Pure: the spawn timestamps one `sm` pulse at server time `t` produces for a
 * tier — one per puff, the extras BACK-DATED by `stagger` so a heavy pulse
 * reads as a dense column with depth rather than one hard-edged stamp. Every
 * timestamp is in server time, which is what the decay is measured against.
 */
export function puffSpawnTimes(t: number, tier: PuffTier): number[] {
  const out: number[] = [];
  for (let i = 0; i < tier.puffs; i++) out.push(t - i * tier.stagger);
  return out;
}

interface LivePuff {
  gfx: Graphics;
  /** Server time the puff was emitted at (drives every ramp above). */
  t: number;
  /** Emission point — the smoking hull's TRUE position at that instant. */
  x: number;
  y: number;
  tier: PuffTier;
  /** Billow phase offset, so one column's puffs do not wobble in unison. */
  phase: number;
}

/**
 * The Pixi adapter. Thin by design (not unit tested beyond its cap/spawn
 * bookkeeping): every number it draws comes from the pure functions above.
 */
export class Smoke {
  private readonly pool: Pool<Graphics>;
  private readonly puffs: LivePuff[] = [];
  /** Monotonic spawn counter — only used to decorrelate billow phases. */
  private spawned = 0;

  constructor(layer: Container) {
    this.pool = new Pool<Graphics>(() => this.makePuffGraphics(layer));
  }

  /** How many puffs are currently alive (debug/tests). */
  get livePuffs(): number {
    return this.puffs.length;
  }

  /**
   * A soft blob, drawn ONCE per pooled Graphics and thereafter animated by
   * scale/alpha alone. Three concentric fills stand in for a radial gradient:
   * cheap, texture-free, and enough to keep the edge from reading as a hard
   * disc. Drawn at `PUFF_DRAW_RADIUS`; the live radius is a scale of it.
   */
  private makePuffGraphics(layer: Container): Graphics {
    const g = new Graphics();
    const c = CLIENT_CONFIG.colors.woundedSmoke;
    g.circle(0, 0, PUFF_DRAW_RADIUS).fill({ color: c, alpha: 0.35 });
    g.circle(0, 0, PUFF_DRAW_RADIUS * 0.68).fill({ color: c, alpha: 0.35 });
    g.circle(0, 0, PUFF_DRAW_RADIUS * 0.36).fill({ color: c, alpha: 0.3 });
    g.visible = false;
    layer.addChild(g);
    return g;
  }

  /**
   * A wounded-smoke pulse arrived: accumulate it into the plume. `t` is the
   * FRAME's server timestamp — the row itself carries no time, and none of the
   * ramps here may be driven off a local clock (see the file header).
   *
   * NO MOTION GATE LIVES HERE. A puff that failed to spawn at `motion: 'off'`
   * would delete the disclosure this story exists to make, which the ratified
   * rule forbids outright.
   */
  onSmoke(e: SmokeEvent, t: number): void {
    // Backgrounded tab: skip the spawn entirely rather than let puffs pile into
    // the pool while the render loop that ages and retires them is throttled.
    // `capOldest` below is the second line of defence, not the first.
    if (typeof document !== 'undefined' && document.hidden) return;
    const tier = smokeTier(e.tier);
    for (const spawnT of puffSpawnTimes(t, tier)) {
      const gfx = this.pool.acquire();
      gfx.position.set(e.x, e.y);
      gfx.visible = true;
      this.spawned += 1;
      // Golden-ratio phase walk: adjacent puffs never share a billow phase.
      this.puffs.push({ gfx, t: spawnT, x: e.x, y: e.y, tier, phase: (this.spawned * 0.618) % 1 });
    }
    this.retire(capOldest(this.puffs, S.maxPuffs));
  }

  /** Hide + pool a batch of retired puffs. */
  private retire(gone: readonly LivePuff[]): void {
    for (const p of gone) {
      p.gfx.visible = false;
      this.pool.release(p.gfx);
    }
  }

  /** Drop every live puff at once (teardown / a fresh hull). */
  clear(): void {
    this.retire(this.puffs);
    this.puffs.length = 0;
  }

  /** Per-frame: age every puff against SERVER time, retiring the dead ones. */
  render(serverNow: number): void {
    const life = S.puffLifeMs;
    // Read the motion level straight from the store each frame (the settings
    // panel can change it mid-match, and a cached copy would strand the plume
    // drifting after the player turned motion off).
    const intensity = motionIntensity(settings.current.motion);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      const age = serverNow - p.t;
      // Retire on AGE, not on alpha: `puffAlpha` legitimately returns 0 at
      // both ends of a puff's life (the pre-bloom instant and the post-fade
      // one), so gating retirement on `alpha <= 0` could delete a puff that
      // is merely between frames, not actually dead. `age >= life` is the
      // same condition `puffAlpha` itself uses to report "dead".
      if (age >= life) {
        this.retire([p]);
        this.puffs.splice(i, 1);
        continue;
      }
      const alpha = puffAlpha(age, life, p.tier.peakAlpha);
      const r = puffRadius(age, life, p.tier.r0, p.tier.r1) * puffBillow(age, intensity, p.phase);
      const { dx, dy } = puffDrift(age, S.wind, intensity);
      p.gfx.alpha = alpha;
      p.gfx.scale.set(r / PUFF_DRAW_RADIUS);
      p.gfx.position.set(p.x + dx, p.y + dy);
    }
  }
}
