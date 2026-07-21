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

const SPECS: Record<Exclude<EffectKind, 'wake'>, OneShotSpec> = {
  muzzle: { type: 'dot', life: 0.12, color: 0xffe08a, r0: 5, r1: 1, width: 0, alpha: 0.9, additive: true },
  spark: { type: 'dot', life: 0.2, color: 0xffb800, r0: 7, r1: 1, width: 0, alpha: 1, additive: true },
  splash: { type: 'ring', life: 0.5, color: 0x66ffaa, r0: 3, r1: 22, width: 2, alpha: 0.7, additive: false },
  // Gun-shell burst at the clicked point: a bright amber ring expanding to the
  // CONFIG burst radius (the area every enemy hull in it takes full damage),
  // additive so it reads as a detonation flash. Sized from shared CONFIG (the
  // radius never travels on the wire — see BurstEvent).
  burst: { type: 'ring', life: 0.35, color: 0xffb800, r0: 4, r1: CONFIG.gun.burstRadius, width: 3, alpha: 0.95, additive: true },
  sink: { type: 'ring', life: 0.9, color: 0x8b0000, r0: 6, r1: 40, width: 3, alpha: 0.9, additive: false },
  // Torpedo wake: a small dim bubble dropped along the fish's run; fades fast so
  // the trail reads as a fresh streak, not a persistent line.
  torpwake: { type: 'dot', life: 0.7, color: 0x9fd8c4, r0: 2, r1: 3.5, width: 0, alpha: 0.4, additive: false },
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
}

export class Effects {
  private readonly wakePool: Pool<Graphics>;
  private readonly shotPool: Pool<Graphics>;
  private readonly wake: WakeParticle[] = [];
  private readonly shots: OneShot[] = [];
  private accumDist = 0;
  /** Own hull half-length (stern offset) + top speed, per own hull envelope. */
  private ownHalfLen: number = hullEnvelope('torpedoBoat').hull.length / 2;
  private ownMaxSpeed: number = hullEnvelope('torpedoBoat').kinematics.maxSpeed;

  constructor(
    private readonly wakeLayer: Container,
    private readonly fxLayer: Container = wakeLayer,
  ) {
    this.wakePool = new Pool<Graphics>(() => this.makeWakeDot());
    this.shotPool = new Pool<Graphics>(() => this.makeShotGfx());
  }

  /** Set the own ship's hull id (drives wake stern offset + intensity scaling).
   *  Accepts any HullId via hullEnvelope so it is drone-safe, though the own
   *  ship is always one of the three pickable classes. */
  setOwnClass(cls: HullId): void {
    this.ownHalfLen = hullEnvelope(cls).hull.length / 2;
    this.ownMaxSpeed = hullEnvelope(cls).kinematics.maxSpeed;
  }

  private makeWakeDot(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, CLIENT_CONFIG.wake.radius).fill({ color: CLIENT_CONFIG.wake.color, alpha: 1 });
    g.visible = false;
    this.wakeLayer.addChild(g);
    return g;
  }

  private makeShotGfx(): Graphics {
    const g = new Graphics();
    g.visible = false;
    this.fxLayer.addChild(g);
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
    g.visible = true;
    const baseAlpha = CLIENT_CONFIG.wake.alpha * intensity;
    g.alpha = baseAlpha;
    this.wake.push({ gfx: g, age: 0, life: CLIENT_CONFIG.wake.life, baseAlpha });
  }

  private spawnOneShot(kind: Exclude<EffectKind, 'wake'>, x: number, y: number): void {
    // Backgrounded tab: skip one-shot spawns entirely rather than let them pile
    // up in the pool while the render loop that ages/retires them is throttled.
    if (typeof document !== 'undefined' && document.hidden) return;
    const g = this.shotPool.acquire();
    g.clear();
    g.visible = true;
    g.alpha = 1;
    g.scale.set(1);
    g.position.set(x, y);
    this.shots.push({ gfx: g, spec: SPECS[kind], x, y, age: 0 });
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
        this.retire(s.gfx, this.shotPool);
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
