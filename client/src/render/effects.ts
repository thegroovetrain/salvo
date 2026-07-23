// Feel effects, funneled through one spawnEffect() entry + a shared sprite pool.
//   - wake:   continuous speed feedback behind the own hull (world-space dots)
//   - muzzle: brief flash at a gun's shell spawn (bright dot)
//   - spark:  bright hit spark at a shell-vs-ship impact (additive)
//   - splash: expanding ring at a shell splash (miss / island / range-out)
//   - sink:   larger expanding crimson ring where a hull went down
// One-shots share a redraw-per-frame Graphics pool; wake keeps its own aged
// pool. All spawn through spawnEffect(kind, x, y).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { ShipState, HullId } from '@salvo/shared';
import { CONFIG, hullEnvelope } from '@salvo/shared';
import { Pool } from '../util/pool.js';
import { CLIENT_CONFIG } from '../config.js';

/** Effect kinds routed through spawnEffect(). */
export type EffectKind = 'wake' | 'muzzle' | 'spark' | 'splash' | 'sink' | 'torpwake' | 'burst';

/**
 * Pure layer-routing predicate: which one-shot kinds render into the FOG-IMMUNE
 * chart layer instead of the fogged world. Only the gun-shell `burst` does — a
 * burst at radar range (well beyond the sight bubble) must read as a detonation
 * flash above the fog, mirroring the reticle's fog-immunity (render/firing.ts).
 * Muzzle/spark/splash/sink/torpwake stay in the fogged world (they only ever
 * occur inside or near your own sight). Unit-tested; no Pixi involved.
 */
export function isFogImmuneEffect(kind: EffectKind): boolean {
  return kind === 'burst';
}

interface OneShotSpec {
  type: 'dot' | 'ring';
  life: number; // s
  color: number;
  r0: number; // u — start radius
  r1: number; // u — end radius
  width: number; // ring stroke width (u)
  alpha: number; // peak alpha
  additive: boolean;
}

const C = CLIENT_CONFIG.colors;

const SPECS: Record<Exclude<EffectKind, 'wake'>, OneShotSpec> = {
  muzzle: { type: 'dot', life: 0.12, color: C.muzzle, r0: 5, r1: 1, width: 0, alpha: 0.9, additive: true },
  // spark = the hit flash at a shell-vs-ship impact → Hit Call bloom.
  spark: { type: 'dot', life: 0.2, color: C.hitBloom, r0: 7, r1: 1, width: 0, alpha: 1, additive: true },
  // Miss splash ring (replaces the retired blip-green double-duty — see DESIGN.md).
  splash: { type: 'ring', life: 0.5, color: C.splash, r0: 3, r1: 22, width: 2, alpha: 0.7, additive: false },
  // Gun-shell burst at the clicked point: a bright amber ring expanding to the
  // CONFIG burst radius (the area every enemy hull in it takes full damage) —
  // the gun's own action detonation, additive so it reads as a flash. Sized from
  // shared CONFIG (the radius never travels on the wire — see BurstEvent).
  burst: { type: 'ring', life: 0.35, color: C.amber, r0: 4, r1: CONFIG.gun.burstRadius, width: 3, alpha: 0.95, additive: true },
  // Sink ring where a hull went down → damage-marker (DESIGN.md Combat Effects).
  sink: { type: 'ring', life: 0.9, color: C.damageMarker, r0: 6, r1: 40, width: 3, alpha: 0.9, additive: false },
  // Torpedo wake: a small dim bubble dropped along the fish's run; fades fast so
  // the trail reads as a fresh streak, not a persistent line (legacy torp tone).
  torpwake: { type: 'dot', life: 0.7, color: C.legacy.torpWake, r0: 2, r1: 3.5, width: 0, alpha: 0.4, additive: false },
};

interface WakeParticle {
  gfx: Graphics;
  age: number;
  life: number;
  baseAlpha: number;
}

interface OneShot {
  gfx: Graphics;
  spec: OneShotSpec;
  x: number;
  y: number;
  age: number;
  /** The pool this gfx was acquired from — burst gfx live on the fog-immune
   *  layer (burstPool), everything else on shotPool; retire returns to its own. */
  pool: Pool<Graphics>;
}

export class Effects {
  private readonly wakePool: Pool<Graphics>;
  private readonly shotPool: Pool<Graphics>;
  /** Fog-immune one-shot pool (bursts) — gfx parented to the chart burst layer. */
  private readonly burstPool: Pool<Graphics>;
  private readonly wake: WakeParticle[] = [];
  private readonly shots: OneShot[] = [];
  private accumDist = 0;
  /** Own hull half-length (stern offset) + top speed, per own hull envelope. */
  private ownHalfLen: number = hullEnvelope('torpedoBoat').hull.length / 2;
  private ownMaxSpeed: number = hullEnvelope('torpedoBoat').kinematics.maxSpeed;
  /** Wake tint (Story 1.12): the OWN personal hue, set by setWakeColor once the
   *  own roster color is known; amber is the pre-roster fallback. Wake dots are
   *  drawn white and tinted, so a recolor is a pool-tint swap, not a redraw. */
  private wakeColor: number = CLIENT_CONFIG.colors.amber;

  constructor(
    private readonly wakeLayer: Container,
    private readonly fxLayer: Container = wakeLayer,
    /** Fog-immune layer for burst rings; defaults to fxLayer for headless tests. */
    private readonly burstLayer: Container = fxLayer,
  ) {
    this.wakePool = new Pool<Graphics>(() => this.makeWakeDot());
    this.shotPool = new Pool<Graphics>(() => this.makeShotGfx(this.fxLayer));
    this.burstPool = new Pool<Graphics>(() => this.makeShotGfx(this.burstLayer));
  }

  /** Set the own ship's hull id (drives wake stern offset + intensity scaling).
   *  Accepts any HullId via hullEnvelope so it is drone-safe, though the own
   *  ship is always one of the three pickable classes. */
  setOwnClass(cls: HullId): void {
    this.ownHalfLen = hullEnvelope(cls).hull.length / 2;
    this.ownMaxSpeed = hullEnvelope(cls).kinematics.maxSpeed;
  }

  /** Set the own wake tint to the pilot's personal hue (Story 1.12), applied to
   *  every wake dot spawned from here on (short-lived, so it takes over in ~1s). */
  setWakeColor(color: number): void {
    this.wakeColor = color;
  }

  private makeWakeDot(): Graphics {
    const g = new Graphics();
    // Drawn WHITE + tinted per spawn (setWakeColor), so a personal-hue recolor is
    // a cheap tint swap on the pool rather than a redraw.
    g.circle(0, 0, CLIENT_CONFIG.wake.radius).fill({ color: CLIENT_CONFIG.colors.white, alpha: 1 });
    g.visible = false;
    this.wakeLayer.addChild(g);
    return g;
  }

  private makeShotGfx(layer: Container): Graphics {
    const g = new Graphics();
    g.visible = false;
    layer.addChild(g);
    return g;
  }

  /** Single entry point for one-shot effects. */
  spawnEffect(kind: EffectKind, x: number, y: number, intensity = 1): void {
    if (kind === 'wake') this.spawnWake(x, y, intensity);
    else this.spawnOneShot(kind, x, y);
  }

  private spawnWake(x: number, y: number, intensity: number): void {
    const g = this.wakePool.acquire();
    g.position.set(x, y);
    g.scale.set(1);
    g.tint = this.wakeColor; // personal-hue wake (Story 1.12); amber pre-roster
    g.visible = true;
    const baseAlpha = CLIENT_CONFIG.wake.alpha * intensity;
    g.alpha = baseAlpha;
    this.wake.push({ gfx: g, age: 0, life: CLIENT_CONFIG.wake.life, baseAlpha });
  }

  private spawnOneShot(kind: Exclude<EffectKind, 'wake'>, x: number, y: number): void {
    // Backgrounded tab: skip one-shot spawns entirely rather than let them pile
    // up in the pool while the render loop that ages/retires them is throttled.
    if (typeof document !== 'undefined' && document.hidden) return;
    const pool = isFogImmuneEffect(kind) ? this.burstPool : this.shotPool;
    const g = pool.acquire();
    g.clear();
    g.visible = true;
    g.alpha = 1;
    g.scale.set(1);
    g.position.set(x, y);
    this.shots.push({ gfx: g, spec: SPECS[kind], x, y, age: 0, pool });
  }

  /** Advance all effects by `dt`; spawn wake behind the own ship first
   *  (null while spectating — no own hull, no wake, effects still age). */
  update(dt: number, ship: ShipState | null): void {
    if (ship) this.spawnTrail(dt, ship);
    this.ageWake(dt);
    this.ageShots(dt);
  }

  private spawnTrail(dt: number, ship: ShipState): void {
    const speed = Math.abs(ship.speed);
    if (speed < CLIENT_CONFIG.wake.minSpeed) {
      this.accumDist = 0;
      return;
    }
    this.accumDist += speed * dt;
    const sternX = ship.x - Math.cos(ship.heading) * this.ownHalfLen;
    const sternY = ship.y - Math.sin(ship.heading) * this.ownHalfLen;
    const intensity = Math.min(speed / this.ownMaxSpeed, 1);
    while (this.accumDist >= CLIENT_CONFIG.wake.spacing) {
      this.accumDist -= CLIENT_CONFIG.wake.spacing;
      this.spawnEffect('wake', sternX, sternY, intensity);
    }
  }

  private ageWake(dt: number): void {
    for (let i = this.wake.length - 1; i >= 0; i--) {
      const p = this.wake[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.retire(p.gfx, this.wakePool);
        this.wake.splice(i, 1);
        continue;
      }
      p.gfx.alpha = p.baseAlpha * (1 - k);
      p.gfx.scale.set(1 + k * 0.8);
    }
  }

  private ageShots(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;
      const k = s.age / s.spec.life;
      if (k >= 1) {
        this.retire(s.gfx, s.pool);
        this.shots.splice(i, 1);
        continue;
      }
      this.drawShot(s, k);
    }
  }

  private drawShot(s: OneShot, k: number): void {
    const spec = s.spec;
    const r = spec.r0 + (spec.r1 - spec.r0) * k;
    const a = spec.alpha * (1 - k);
    const g = s.gfx;
    g.clear();
    if (spec.type === 'dot') g.circle(0, 0, r).fill({ color: spec.color, alpha: a });
    else g.circle(0, 0, r).stroke({ width: spec.width, color: spec.color, alpha: a });
    g.blendMode = spec.additive ? 'add' : 'normal';
  }

  private retire(g: Graphics, pool: Pool<Graphics>): void {
    g.visible = false;
    pool.release(g);
  }
}
