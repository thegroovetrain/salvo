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

type Kind = BallisticEvent['k'];

/** Per-kind sprite look. Torpedoes read slower + fatter with a cooler tint. */
interface ProjectileLook {
  core: number;
  glow: number;
  coreR: number; // u
  glowR: number; // u
  glowAlpha: number;
}

const LOOKS: Record<Kind, ProjectileLook> = {
  shell: { core: 0xffe08a, glow: 0xffb800, coreR: 2.2, glowR: 6, glowAlpha: 0.25 },
  // Torpedo: fatter, cool steel-green core so a fish reads distinct from a shell.
  torp: { core: 0xcfe8dd, glow: 0x3fbf8f, coreR: 3.4, glowR: 8, glowAlpha: 0.22 },
};

/** Spawn a torpedo wake dot roughly every this many world-units of travel. */
const TORP_TRAIL_SPACING = 16; // u

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
  kind: Kind;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  t0: number;
  expiresAt: number; // server time (ms) the shell self-terminates
  trailAt: number; // next travel-distance (u) to drop a wake dot (torpedoes only)
}

export class Projectiles {
  private readonly pool: Pool<Graphics>;
  private readonly live = new Map<string, LiveShell>();

  /**
   * `trail` drops a torpedo-wake particle at a world point (wired to the effects
   * pool in main.ts); omitted in tests. Called throttled by travelled distance.
   */
  constructor(
    private readonly layer: Container,
    private readonly trail?: (x: number, y: number) => void,
  ) {
    this.pool = new Pool<Graphics>(() => this.makeBlank());
  }

  private makeBlank(): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';
    g.visible = false;
    this.layer.addChild(g);
    return g;
  }

  private paint(g: Graphics, kind: Kind): void {
    const look = LOOKS[kind];
    g.clear();
    g.circle(0, 0, look.glowR).fill({ color: look.glow, alpha: look.glowAlpha });
    g.circle(0, 0, look.coreR).fill({ color: look.core, alpha: 1 });
  }

  /** Register a newly-seen projectile (shell or torpedo). */
  onShell(ev: BallisticEvent): void {
    if (this.live.has(ev.id)) return;
    const gfx = this.pool.acquire();
    this.paint(gfx, ev.k);
    gfx.visible = true;
    this.live.set(ev.id, {
      gfx,
      kind: ev.k,
      x0: ev.x,
      y0: ev.y,
      vx: ev.vx,
      vy: ev.vy,
      t0: ev.t,
      expiresAt: ev.t + MAX_LIFETIME_MS[ev.k],
      trailAt: TORP_TRAIL_SPACING,
    });
  }

  /** Terminate the projectile that produced this boom (if we were tracking it). */
  onBoom(ev: BoomEvent): void {
    if (ev.id) this.remove(ev.id);
  }

  /**
   * Advance all live projectiles to `serverNow` (ms). Retire any past their
   * per-kind max lifetime, or (when `ownPos` is known) once their dead-reckoned
   * position leaves the own ship's sight bubble — invisible under fog there
   * anyway. Torpedoes drop a throttled wake trail along their dead-reckoned path.
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
      if (s.kind === 'torp') this.emitTrail(s, p, serverNow);
    }
  }

  /** Drop wake dots behind a torpedo at fixed travel-distance spacing. */
  private emitTrail(s: LiveShell, p: { x: number; y: number }, serverNow: number): void {
    if (!this.trail) return;
    const speed = Math.hypot(s.vx, s.vy);
    const travelled = (speed * Math.max(0, serverNow - s.t0)) / 1000;
    while (travelled >= s.trailAt) {
      // Back the dot up to the spacing mark so the trail is evenly laid.
      const back = travelled - s.trailAt;
      const ux = speed > 0 ? s.vx / speed : 0;
      const uy = speed > 0 ? s.vy / speed : 0;
      this.trail(p.x - ux * back, p.y - uy * back);
      s.trailAt += TORP_TRAIL_SPACING;
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
