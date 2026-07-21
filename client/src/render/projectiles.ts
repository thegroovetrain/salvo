// Dead-reckoned shell rendering. The server sends one `shell` event per shot
// (reveal pos + velocity + t0 — NO range-derivable field; see BallisticEvent's
// anti-cheat note); the client extrapolates the flight path locally — pos =
// p0 + v*(serverNow - t0) — so no per-tick shell sync is needed. A shell is
// removed when ANY of these fire, whichever first:
//   (a) its matching `boom` arrives (id match) — the true splash;
//   (b) a diameter-derived, velocity-scaled backstop elapses —
//       maxLifetimeMs(mapRadius, eventSpeed) = (2*mapRadius + margin) / speed.
//       Shells no longer fly a fixed range and torpedoes run until they cross
//       the map edge, so the bound is the map-crossing time, not range/speed;
//       deriving it from the event's own velocity keeps it correct for free as
//       gun range / torpedo speed become upgradeable (Stage D). This bounds a
//       reveal whose boom we never see (fired at us from fog, then it leaves and
//       detonates unseen);
//   (c) sight-bubble cull: its dead-reckoned position leaves the own ship's
//       sight bubble (+ margin). It is invisible under fog out there anyway, and
//       culling stops a ghost shell from rendering past its true splash point.
//       Applies to everyone incl. the owner — a shell outrunning the bubble
//       (gun range 480 > sight 220) fades into fog, which is thematic.
// Each shell draws as a bright dot with an additive glow, pooled.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, type BallisticEvent, type BoomEvent, type BurstEvent } from '@salvo/shared';
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

/** Extra map crossings' worth of slack on the lifetime backstop (u). */
const LIFETIME_MARGIN = 100; // u

/**
 * Diameter-plus-margin backstop: the longest a projectile could fly across the
 * map before we force-retire it (a leak guard only — booms + bubble-cull do the
 * real termination). Velocity-derived from the event's own speed so upgraded gun
 * range / torpedo speed (Stage D) stay correct for free. A zero/negative speed
 * never self-terminates on time (Infinity) — the bubble-cull still catches it.
 */
export function maxLifetimeMs(mapRadius: number, speed: number): number {
  if (speed <= 0) return Infinity;
  return ((2 * mapRadius + LIFETIME_MARGIN) / speed) * 1000;
}

/** Cull a dead-reckoned shell once it is this far outside the sight bubble (u). */
const SIGHT_CULL_MARGIN = 40; // u

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
function outsideBubble(
  p: { x: number; y: number },
  origin: { x: number; y: number },
  cull2: number,
): boolean {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return dx * dx + dy * dy > cull2;
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
  /** Squared cull radius — follows the EFFECTIVE sight range (upgradeable). */
  private cull2 = (CONFIG.vision.sight + SIGHT_CULL_MARGIN) ** 2;

  constructor(
    private readonly mapRadius: number,
    private readonly layer: Container,
    private readonly trail?: (x: number, y: number) => void,
  ) {
    this.pool = new Pool<Graphics>(() => this.makeBlank());
  }

  /** Track the own ship's effective sight range so reveals don't pop early. */
  setSightRange(sightRange: number): void {
    this.cull2 = (sightRange + SIGHT_CULL_MARGIN) ** 2;
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
      expiresAt: ev.t + maxLifetimeMs(this.mapRadius, Math.hypot(ev.vx, ev.vy)),
      trailAt: TORP_TRAIL_SPACING,
    });
  }

  /** Terminate the projectile that produced this boom (if we were tracking it). */
  onBoom(ev: BoomEvent): void {
    if (ev.id) this.remove(ev.id);
  }

  /** Terminate the shell that burst at its target point (same removal as boom). */
  onBurst(ev: BurstEvent): void {
    this.remove(ev.id);
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
      if (ownPos && outsideBubble(p, ownPos, this.cull2)) {
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
