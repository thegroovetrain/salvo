// Feel effects, funneled through one spawnEffect() entry + a shared sprite pool.
// The offline-drive step ships the highest-payoff item: wake particles behind
// the hull that give continuous speed feedback. Later steps add muzzle flash,
// splash, hit spark, sink, etc. through the same seam.
//
// Wake dots are world-space (added to worldRoot.wake): once spawned they sit
// still in the water while the ship sails on and the camera pans over them.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { ShipState } from '@salvo/shared';
import { CONFIG } from '@salvo/shared';
import { Pool } from '../util/pool.js';
import { CLIENT_CONFIG } from '../config.js';

const HALF_LEN = 20; // u — stern offset from ship center (matches hull length)

interface WakeParticle {
  gfx: Graphics;
  age: number; // s
  life: number; // s
  baseAlpha: number;
}

/** Effect kinds routed through spawnEffect(). Only 'wake' exists this step. */
export type EffectKind = 'wake';

export class Effects {
  private readonly pool: Pool<Graphics>;
  private readonly live: WakeParticle[] = [];
  private accumDist = 0;

  constructor(private readonly wakeLayer: Container) {
    this.pool = new Pool<Graphics>(() => this.makeDot());
  }

  private makeDot(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, CLIENT_CONFIG.wake.radius).fill({ color: CLIENT_CONFIG.wake.color, alpha: 1 });
    g.visible = false;
    this.wakeLayer.addChild(g);
    return g;
  }

  /** Single entry point for one-shot effects. */
  spawnEffect(kind: EffectKind, x: number, y: number, intensity = 1): void {
    if (kind === 'wake') this.spawnWake(x, y, intensity);
  }

  private spawnWake(x: number, y: number, intensity: number): void {
    const g = this.pool.acquire();
    g.position.set(x, y);
    g.visible = true;
    g.alpha = 1;
    const baseAlpha = CLIENT_CONFIG.wake.alpha * intensity;
    this.live.push({ gfx: g, age: 0, life: CLIENT_CONFIG.wake.life, baseAlpha });
    g.alpha = baseAlpha;
  }

  /**
   * Advance effects by `dt`. Spawns wake dots at the stern proportional to the
   * distance travelled (so faster = denser trail), with alpha scaled by speed
   * fraction, then ages and recycles live particles.
   */
  update(dt: number, ship: ShipState): void {
    this.spawnTrail(dt, ship);
    this.ageParticles(dt);
  }

  private spawnTrail(dt: number, ship: ShipState): void {
    const speed = Math.abs(ship.speed);
    if (speed < CLIENT_CONFIG.wake.minSpeed) {
      this.accumDist = 0;
      return;
    }
    this.accumDist += speed * dt;
    const sternX = ship.x - Math.cos(ship.heading) * HALF_LEN;
    const sternY = ship.y - Math.sin(ship.heading) * HALF_LEN;
    const intensity = Math.min(speed / CONFIG.ship.maxSpeed, 1);
    while (this.accumDist >= CLIENT_CONFIG.wake.spacing) {
      this.accumDist -= CLIENT_CONFIG.wake.spacing;
      this.spawnEffect('wake', sternX, sternY, intensity);
    }
  }

  private ageParticles(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.gfx.visible = false;
        this.pool.release(p.gfx);
        this.live.splice(i, 1);
        continue;
      }
      p.gfx.alpha = p.baseAlpha * (1 - k);
      p.gfx.scale.set(1 + k * 0.8); // spread slightly as it dissipates
    }
  }
}
