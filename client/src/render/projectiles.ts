// Dead-reckoned shell rendering. The server sends one `shell` event per shot
// (launch pos + velocity + t0 + ttl); the client extrapolates the flight path
// locally — pos = p0 + v*(serverNow - t0) — so no per-tick shell sync is needed.
// A shell is removed on its matching `boom` (id match) or when its ttl elapses.
// Each shell draws as a bright dot with an additive glow, pooled.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { BallisticEvent, BoomEvent } from '@salvo/shared';
import { Pool } from '../util/pool.js';

const CORE_COLOR = 0xffe08a; // hot shell core (warm amber-white)
const GLOW_COLOR = 0xffb800; // DESIGN.md amber, additive glow
const CORE_R = 2.2; // u
const GLOW_R = 6; // u

/** Pure: dead-reckoned shell position at server time `now` (ms). */
export function shellPosition(
  p0: { x: number; y: number },
  v: { vx: number; vy: number },
  t0: number,
  now: number,
): { x: number; y: number } {
  const dt = Math.max(0, now - t0) / 1000;
  return { x: p0.x + v.vx * dt, y: p0.y + v.vy * dt };
}

interface LiveShell {
  gfx: Graphics;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  t0: number;
  expiresAt: number; // server time (ms) the shell self-terminates
}

export class Projectiles {
  private readonly pool: Pool<Graphics>;
  private readonly live = new Map<string, LiveShell>();

  constructor(private readonly layer: Container) {
    this.pool = new Pool<Graphics>(() => this.makeShell());
  }

  private makeShell(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, GLOW_R).fill({ color: GLOW_COLOR, alpha: 0.25 });
    g.circle(0, 0, CORE_R).fill({ color: CORE_COLOR, alpha: 1 });
    g.blendMode = 'add';
    g.visible = false;
    this.layer.addChild(g);
    return g;
  }

  /** Register a newly-seen shell. */
  onShell(ev: BallisticEvent): void {
    if (this.live.has(ev.id)) return;
    const gfx = this.pool.acquire();
    gfx.visible = true;
    this.live.set(ev.id, {
      gfx,
      x0: ev.x,
      y0: ev.y,
      vx: ev.vx,
      vy: ev.vy,
      t0: ev.t,
      expiresAt: ev.t + ev.ttl,
    });
  }

  /** Terminate the shell that produced this boom (if we were tracking it). */
  onBoom(ev: BoomEvent): void {
    if (ev.id) this.remove(ev.id);
  }

  /** Advance all live shells to `serverNow` (ms); retire any past their ttl. */
  render(serverNow: number): void {
    for (const [id, s] of this.live) {
      if (serverNow >= s.expiresAt) {
        this.remove(id);
        continue;
      }
      const p = shellPosition({ x: s.x0, y: s.y0 }, s, s.t0, serverNow);
      s.gfx.position.set(p.x, p.y);
    }
  }

  private remove(id: string): void {
    const s = this.live.get(id);
    if (!s) return;
    s.gfx.visible = false;
    this.pool.release(s.gfx);
    this.live.delete(id);
  }
}
