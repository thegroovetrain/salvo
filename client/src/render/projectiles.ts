// Dead-reckoned shell rendering. The server sends one `shell` event per shot
// (reveal pos + velocity + t0 — NO range-derivable field; see BallisticEvent's
// anti-cheat note); the client extrapolates the flight path locally — pos =
// p0 + v*(serverNow - t0) — so no per-tick shell sync is needed. A shell is
// removed when ANY of these fire, whichever first:
//   (a) its matching `boom` arrives (id match) — the true splash;
//   (b) a CONFIG-derived per-kind MAX LIFETIME elapses (gun = shellRange/
//       shellSpeed, torp = range/speed) — the longest a projectile of that kind
//       can possibly fly, computed client-side from the shared CONFIG so the
//       wire need not carry a lifetime. This bounds a reveal whose boom we never
//       see (fired at us from fog, then it leaves and detonates unseen);
//   (c) sight-bubble cull: its dead-reckoned position leaves the own ship's
//       sight bubble (+ margin). It is invisible under fog out there anyway, and
//       culling stops a ghost shell from rendering past its true splash point.
//       Applies to everyone incl. the owner — a shell outrunning the bubble
//       (gun range 480 > sight 220) fades into fog, which is thematic.
// Each shell draws as a bright dot with an additive glow, pooled.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, type BallisticEvent, type BoomEvent } from '@salvo/shared';
import { Pool } from '../util/pool.js';

const CORE_COLOR = 0xffe08a; // hot shell core (warm amber-white)
const GLOW_COLOR = 0xffb800; // DESIGN.md amber, additive glow
const CORE_R = 2.2; // u
const GLOW_R = 6; // u

/**
 * Max flight time (ms) per projectile kind = range / speed, from the shared
 * CONFIG. The client derives termination locally so the wire carries no
 * range-derivable field. Keyed by BallisticEvent['k'] so step 12's torpedoes
 * pick up their lifetime for free.
 */
const MAX_LIFETIME_MS: Record<BallisticEvent['k'], number> = {
  shell: (CONFIG.gun.shellRange / CONFIG.gun.shellSpeed) * 1000,
  torp: (CONFIG.torpedo.range / CONFIG.torpedo.speed) * 1000,
};

/** Cull a dead-reckoned shell once it is this far outside the sight bubble (u). */
const SIGHT_CULL_MARGIN = 40; // u
const SIGHT_CULL = CONFIG.vision.sight + SIGHT_CULL_MARGIN;
const SIGHT_CULL2 = SIGHT_CULL * SIGHT_CULL;

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

/** True once `p` is beyond the sight bubble (+ margin) around `origin`. */
function outsideBubble(p: { x: number; y: number }, origin: { x: number; y: number }): boolean {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return dx * dx + dy * dy > SIGHT_CULL2;
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
      expiresAt: ev.t + MAX_LIFETIME_MS[ev.k],
    });
  }

  /** Terminate the shell that produced this boom (if we were tracking it). */
  onBoom(ev: BoomEvent): void {
    if (ev.id) this.remove(ev.id);
  }

  /**
   * Advance all live shells to `serverNow` (ms). Retire any past their per-kind
   * max lifetime, or (when `ownPos` is known) once their dead-reckoned position
   * leaves the own ship's sight bubble — invisible under fog there anyway.
   */
  render(serverNow: number, ownPos?: { x: number; y: number }): void {
    for (const [id, s] of this.live) {
      if (serverNow >= s.expiresAt) {
        this.remove(id);
        continue;
      }
      const p = shellPosition({ x: s.x0, y: s.y0 }, s, s.t0, serverNow);
      if (ownPos && outsideBubble(p, ownPos)) {
        this.remove(id);
        continue;
      }
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
