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
import {
  CONFIG,
  type BallisticEvent,
  type BoomEvent,
  type BurstEvent,
  type CannonMode,
  type TorpedoMode,
  type TorpedoUpdateEvent,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { Pool } from '../util/pool.js';

const C = CLIENT_CONFIG.colors;
const O = CLIENT_CONFIG.ordnance;
import { insideAnyZone, type OwnZone } from './litZones.js';

type Kind = BallisticEvent['k'];

/**
 * The painted identities a track can carry (Story 2.9). The two WIRE kinds are
 * the floor; everything past them is doctrine identity, and each is legal on
 * exactly the evidence named beside it — nothing here infers a build from data
 * the observer was not already given:
 *
 *   shell / torp   the wire kind, as ever (any observer)
 *   torpHoming     the track has taken a `torpU` steer — observable behavior,
 *                  the same evidence a player watching the fish turn has (any
 *                  observer); OWN fish are styled from launch off own stats
 *   cannon*        OWN fire only, keyed off `g.ownStats.cannon.mode` (self-
 *                  private). The ballistic wire shape cannot say "cannon" and
 *                  must not — an onlooker sees the ordinary shell look, which
 *                  is the correct amount of information.
 */
export type ProjectileLookId = 'shell' | 'torp' | 'torpHoming' | 'cannon' | 'cannonArcing' | 'cannonAp';

/** Per-look sprite paint. Torpedoes read slower + fatter with a cooler tint. */
interface ProjectileLook {
  core: number;
  glow: number;
  coreR: number; // u
  glowR: number; // u
  glowAlpha: number;
  /** Core stretched this many times along the travel bearing (1 = round dot).
   *  The ARMOR-PIERCING dart — a SHAPE channel, so it reads without color. */
  stretch?: number;
  /** Peak extra scale at the top of a plunging arc (0 = flat trajectory). */
  swell?: number;
  /** Wake-dot spacing override (u) — a tighter wake reads as a fish under power. */
  trailSpacing?: number;
}

const LOOKS: Record<ProjectileLookId, ProjectileLook> = {
  // core = legacy shell tone; glow = amber (the gun's warning glow).
  shell: { core: C.legacy.shellCore, glow: C.amber, coreR: 2.2, glowR: 6, glowAlpha: 0.25 },
  // Torpedo: fatter, cool steel-green core (torpedo on-water render) so a fish
  // reads distinct from a shell; glow = legacy torpedo secondary tone.
  torp: { core: C.torpedo, glow: C.legacy.torpGlow, coreR: 3.4, glowR: 8, glowAlpha: 0.22 },
  // ACOUSTIC HOMING: a brighter head running a tighter wake — a fish under
  // power and steering, against the straight-runner's loose trail.
  torpHoming: {
    core: C.muzzle,
    glow: C.legacy.torpGlow,
    coreR: O.homingCoreR,
    glowR: 9,
    glowAlpha: 0.3,
    trailSpacing: O.homingTrailSpacing,
  },
  // The OWN cannon, at every doctrine: bigger and heavier than the gun's dot.
  cannon: { core: C.legacy.shellCore, glow: C.amber, coreR: O.cannonCoreR, glowR: O.cannonGlowR, glowAlpha: O.cannonGlowAlpha },
  // PLUNGING FIRE: the same heavy shell, swelling as it climbs and settling as
  // it falls — height, read as size.
  cannonArcing: {
    core: C.legacy.shellCore,
    glow: C.amber,
    coreR: O.cannonCoreR,
    glowR: O.cannonGlowR,
    glowAlpha: O.cannonGlowAlpha,
    swell: O.arcSwell,
  },
  // ARMOR-PIERCING: the heavy shell drawn out into a dart along its bearing.
  cannonAp: {
    core: C.legacy.shellCore,
    glow: C.amber,
    coreR: O.cannonCoreR,
    glowR: O.cannonGlowR,
    glowAlpha: O.cannonGlowAlpha,
    stretch: O.apStretch,
  },
};

/** The OWN loadout's doctrine modes — the self-private half of the identity
 *  split (main.applyOwnStats fans them in, mirroring setSightRange). */
export interface OwnModes {
  cannon: CannonMode;
  torpedo: TorpedoMode;
}

/** Which own weapon a `shell`/`torp` reveal came out of, when the client can
 *  honestly say (roomBindings' own-fire correlation); null = not our shot.
 *  `starShells` rides the `shell` wire kind too (server/equipment/starShells.ts),
 *  so it is claimable — it earns its OWN report (fireStarShells) while keeping
 *  the generic shell LOOK, because a flare in flight is just a shell until it
 *  bursts. */
export type OwnFire = 'gun' | 'cannon' | 'torpedo' | 'starShells' | null;

/**
 * Pure: the look a newly-revealed track paints with.
 *
 * A torpedo is `torpHoming` from LAUNCH only when it is OUR fish and our own
 * torpedo doctrine is homing (self-private knowledge); an enemy's homing fish
 * earns the same look the moment it visibly steers (onBallisticUpdate). A shell
 * is a cannon look only when it is OUR cannon shot — the wire is mode-blind for
 * ballistics and stays that way, and an own STAR SHELL (which rides the same
 * wire kind) falls through to the generic shell look on the same clause.
 */
export function lookForReveal(kind: Kind, own: OwnFire, modes: OwnModes): ProjectileLookId {
  if (kind === 'torp') return own === 'torpedo' && modes.torpedo === 'homing' ? 'torpHoming' : 'torp';
  if (own !== 'cannon') return 'shell';
  if (modes.cannon === 'arcing') return 'cannonArcing';
  return modes.cannon === 'ap' ? 'cannonAp' : 'cannon';
}

/**
 * Pure: split a boom id into the TRACK it belongs to and its pierce ORDER.
 *
 * ARMOR-PIERCING emits a boom per hull it punches through while the shell keeps
 * flying, so world.ts sends those under a DERIVED id — `<shellId>#p<order>` —
 * and keeps the real id for the terminal event. Both halves matter to the
 * client: the derived id must not retire the still-flying track (it never
 * matches a tracked id — the Story 2.8 contract), and the pierce ORDER is the
 * one legal enemy-side tell that a build carries AP. A missing/garbled suffix
 * reads as an ordinary boom (`null`), which is the fail-open branch: an
 * unrecognized id can only ever cost the pierce styling, never the impact.
 */
export function pierceOrder(id: string): number | null {
  const m = /#p(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Default spawn spacing for a torpedo wake dot, in world-units of travel. */
const TORP_TRAIL_SPACING = 16; // u

/** Pure: a look's wake-dot spacing (u) — the default unless it overrides it. */
export function trailSpacing(look: ProjectileLookId): number {
  return LOOKS[look].trailSpacing ?? TORP_TRAIL_SPACING;
}

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

/**
 * Pure: should a dead-reckoned projectile at `p` be culled this frame? Culled
 * once it leaves the sight bubble (+ margin) UNLESS it lies inside one of the
 * own ship's active lit zones — a star-shell zone grants truesight parity, so
 * the server keeps revealing an enemy shell/torpedo inside it and (crucially)
 * NEVER re-sends after a cull destroys the local track (exactly-once reveal).
 * `keepZones` is the own ACTIVE zones (litZones.ownActiveZones); empty for a
 * hull that fired no flare, restoring the pre-1.7 bubble-only cull exactly.
 */
export function shellCulledBeyondSight(
  p: { x: number; y: number },
  origin: { x: number; y: number },
  cull2: number,
  keepZones: readonly OwnZone[],
): boolean {
  return outsideBubble(p, origin, cull2) && !insideAnyZone(p, keepZones);
}

interface LiveShell {
  gfx: Graphics;
  kind: Kind;
  look: ProjectileLookId;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  t0: number;
  /** Server time (ms) the track was first REVEALED — the arc-swell clock, which
   *  must survive a mid-flight re-anchor (`t0` moves with every steer). */
  launchedAt: number;
  expiresAt: number; // server time (ms) the shell self-terminates
  trailAt: number; // next travel-distance (u) to drop a wake dot (torpedoes only)
  /** Which OWN weapon fired this track, when roomBindings could honestly
   *  correlate the reveal with a click of ours — null for everyone else's. Held
   *  so a LATER event on the same track (the burst, which arrives long after
   *  the 400ms click latch has expired) can still be attributed to us. */
  own: OwnFire;
}

/**
 * Pure: the scale a PLUNGING FIRE shell renders at, `elapsed` ms after launch —
 * one smooth swell from 1 up to `1 + amp` and back, over `periodMs`, holding at
 * 1 thereafter. Height read as size: the shell climbs, tops out, comes down.
 *
 * `amp` is motion-scaled by the caller (halved at `reduced`, 0 at `off`), which
 * is what makes this legal as juice: the shell's POSITION — the only thing that
 * carries information — is untouched at every motion level, and at `off` the
 * dart/dot simply holds its size.
 */
export function arcSwellScale(elapsedMs: number, amp: number, periodMs: number = O.arcSwellMs): number {
  if (amp <= 0 || periodMs <= 0) return 1;
  const k = elapsedMs / periodMs;
  if (k <= 0 || k >= 1) return 1;
  return 1 + amp * Math.sin(Math.PI * k);
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

  /** The OWN doctrine modes, fanned in from applyOwnStats (Story 2.9) — the
   *  seam setSightRange established, for the self-private half of ordnance
   *  identity. Stock until the first authoritative `you` lands. */
  private ownModes: OwnModes = { cannon: 'standard', torpedo: 'standard' };

  /** Track the own ship's effective sight range so reveals don't pop early. */
  setSightRange(sightRange: number): void {
    this.cull2 = (sightRange + SIGHT_CULL_MARGIN) ** 2;
  }

  /** Set the own loadout's doctrine modes (main.applyOwnStats). Affects only
   *  tracks revealed FROM NOW ON — a fish already in the water keeps the look it
   *  launched with, which is also what the server's already-fired ordnance does. */
  setOwnModes(modes: OwnModes): void {
    this.ownModes = { ...modes };
  }

  /** Number of projectiles currently tracked (test/diagnostic observability). */
  get liveCount(): number {
    return this.live.size;
  }

  /** The identity a tracked projectile is currently painted with (test/debug
   *  seam — the render state machine, without reaching into the display list).
   *  Null for an id we hold no track for. */
  lookOf(id: string): ProjectileLookId | null {
    return this.live.get(id)?.look ?? null;
  }

  /** The live scale of a tracked sprite (test seam for the plunging-fire swell). */
  scaleOf(id: string): number {
    return this.live.get(id)?.gfx.scale.x ?? 1;
  }

  private makeBlank(): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';
    g.visible = false;
    this.layer.addChild(g);
    return g;
  }

  /** Paint a track's identity onto its sprite. A stretched core (the AP dart) is
   *  drawn as an ellipse and the sprite is ROTATED onto its bearing by the
   *  caller, so the dart always points where the shell is going. */
  private paint(g: Graphics, id: ProjectileLookId): void {
    const look = LOOKS[id];
    g.clear();
    g.circle(0, 0, look.glowR).fill({ color: look.glow, alpha: look.glowAlpha });
    if (look.stretch) g.ellipse(0, 0, look.coreR * look.stretch, look.coreR).fill({ color: look.core, alpha: 1 });
    else g.circle(0, 0, look.coreR).fill({ color: look.core, alpha: 1 });
  }

  /** Re-paint a live track (a look CHANGED — an enemy fish just revealed itself
   *  as a steering one) and re-apply the bearing rotation the new look wants. */
  private restyle(s: LiveShell, look: ProjectileLookId): void {
    if (s.look === look) return;
    s.look = look;
    this.paint(s.gfx, look);
    this.orient(s);
  }

  /** Point a stretched (dart) sprite along its travel bearing; round looks keep
   *  rotation 0 so a pooled sprite never inherits a previous track's angle. */
  private orient(s: LiveShell): void {
    s.gfx.rotation = LOOKS[s.look].stretch ? Math.atan2(s.vy, s.vx) : 0;
  }

  /**
   * Register a newly-seen projectile (shell or torpedo). `own` names the OWN
   * weapon that fired it when the client can honestly correlate the reveal with
   * a click we just made (roomBindings' own-fire heuristic — the same one the
   * muzzle flash and own-fire tone already ride); it is null for every other
   * observer, who gets exactly today's look.
   */
  onShell(ev: BallisticEvent, own: OwnFire = null): void {
    if (this.live.has(ev.id)) return;
    const gfx = this.pool.acquire();
    const look = lookForReveal(ev.k, own, this.ownModes);
    this.paint(gfx, look);
    gfx.visible = true;
    const s: LiveShell = {
      gfx,
      kind: ev.k,
      look,
      x0: ev.x,
      y0: ev.y,
      vx: ev.vx,
      vy: ev.vy,
      t0: ev.t,
      launchedAt: ev.t,
      expiresAt: ev.t + maxLifetimeMs(this.mapRadius, Math.hypot(ev.vx, ev.vy)),
      trailAt: trailSpacing(look),
      own,
    };
    this.live.set(ev.id, s);
    this.orient(s);
  }

  /** Which own weapon fired the track `id`, or null (unknown track, or not
   *  ours). Read at BURST time, before onBurst retires the track: the burst
   *  ring needs to know whether it may size itself off our own effective blast
   *  radius (aimPreview.ownBurstRadius) — the wire will never say. */
  ownFireOf(id: string): OwnFire {
    return this.live.get(id)?.own ?? null;
  }

  /**
   * A live torpedo CHANGED COURSE (Story 2.8 — the ACOUSTIC HOMING doctrine's
   * `torpU` re-emit): re-anchor the dead-reckoned track IN PLACE at the update's
   * position/velocity/time, so extrapolation continues from the steer instead of
   * running on the launch bearing. Same-shaped payload as the reveal (pos +
   * velocity only — no range-derivable field), so nothing new is inferable.
   *
   * An update for an id we are NOT tracking CREATES the track (Story 2.8
   * review, P3). Dropping it permanently hid a re-sighted fish: the client
   * culls a track the moment it leaves the sight bubble, and the server only
   * ever emits `torpU` to an observer who can legitimately see the torpedo
   * RIGHT NOW (owner / sight+LOS / owned lit zone — the reveal predicate), so
   * a torpU arriving for an unknown id means "you can see this fish and you
   * are not drawing it". The payload is the same constant-free shape as the
   * reveal (pos + velocity + t, no range-derivable field), so spawning from it
   * leaks nothing the reveal would not have.
   *
   * The lifetime backstop is re-derived from the NEW speed (a doctrine may have
   * changed it) and the wake trail restarts its spacing count, because travelled
   * distance is measured from the anchor this call just moved.
   */
  onBallisticUpdate(ev: TorpedoUpdateEvent): void {
    const s = this.live.get(ev.id) ?? this.spawnFromUpdate(ev);
    s.x0 = ev.x;
    s.y0 = ev.y;
    s.vx = ev.vx;
    s.vy = ev.vy;
    s.t0 = ev.t;
    s.expiresAt = ev.t + maxLifetimeMs(this.mapRadius, Math.hypot(ev.vx, ev.vy));
    // STORY 2.9 — a track that STEERS is a homing track, for everyone. This is
    // the enemy-side ACOUSTIC HOMING tell, and it leaks nothing: the steer is
    // already on screen (the fish visibly turns), so styling it only names what
    // the player can see. Own fish were already styled at launch off own stats.
    this.restyle(s, 'torpHoming');
    this.orient(s);
    s.trailAt = trailSpacing(s.look);
  }

  /** Register a track from a `torpU` for an id we hold no track for (see
   *  onBallisticUpdate): a torpedo-kind track — only a torpedo ever steers —
   *  seeded from the update, which the caller then re-anchors. */
  private spawnFromUpdate(ev: TorpedoUpdateEvent): LiveShell {
    const gfx = this.pool.acquire();
    this.paint(gfx, 'torpHoming'); // only a steering fish ever arrives this way
    gfx.visible = true;
    const s: LiveShell = {
      gfx,
      kind: 'torp',
      look: 'torpHoming',
      x0: ev.x,
      y0: ev.y,
      vx: ev.vx,
      vy: ev.vy,
      t0: ev.t,
      launchedAt: ev.t,
      expiresAt: ev.t,
      trailAt: trailSpacing('torpHoming'),
      own: null, // a track we only learned about from a steer is never ours
    };
    this.live.set(ev.id, s);
    return s;
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
   * anyway — UNLESS it lies inside an own active lit zone (`keepZones`, Story
   * 1.7: truesight parity keeps revealing it; culling would blind the firer
   * permanently, the reveal is exactly-once). Torpedoes drop a throttled wake
   * trail along their dead-reckoned path.
   */
  render(serverNow: number, ownPos?: { x: number; y: number }, keepZones: readonly OwnZone[] = []): void {
    // Resolved ONCE per frame, not per shell: the plunging-fire swell is juice,
    // so it rides the accessibility motion level (halved at `reduced`, gone at
    // `off` — where the shell simply holds its size and keeps its position).
    const swellAmp = motionScaled(1, settings.current.motion);
    for (const [id, s] of this.live) {
      if (serverNow >= s.expiresAt) {
        this.remove(id);
        continue;
      }
      const p = shellPosition({ x: s.x0, y: s.y0 }, s, s.t0, serverNow);
      if (ownPos && shellCulledBeyondSight(p, ownPos, this.cull2, keepZones)) {
        this.remove(id);
        continue;
      }
      s.gfx.position.set(p.x, p.y);
      const swell = LOOKS[s.look].swell;
      if (swell) s.gfx.scale.set(arcSwellScale(serverNow - s.launchedAt, swell * swellAmp));
      if (s.kind === 'torp') this.emitTrail(s, p, serverNow);
    }
  }

  /** Drop wake dots behind a torpedo at its look's travel-distance spacing (a
   *  homing fish lays a tighter trail than a straight-runner). */
  private emitTrail(s: LiveShell, p: { x: number; y: number }, serverNow: number): void {
    if (!this.trail) return;
    const spacing = trailSpacing(s.look);
    const speed = Math.hypot(s.vx, s.vy);
    const travelled = (speed * Math.max(0, serverNow - s.t0)) / 1000;
    while (travelled >= s.trailAt) {
      // Back the dot up to the spacing mark so the trail is evenly laid.
      const back = travelled - s.trailAt;
      const ux = speed > 0 ? s.vx / speed : 0;
      const uy = speed > 0 ? s.vy / speed : 0;
      this.trail(p.x - ux * back, p.y - uy * back);
      s.trailAt += spacing;
    }
  }

  private remove(id: string): void {
    const s = this.live.get(id);
    if (!s) return;
    s.gfx.visible = false;
    s.gfx.scale.set(1); // a swollen arcing shell must not hand its scale on
    s.gfx.rotation = 0;
    this.pool.release(s.gfx);
    this.live.delete(id);
  }
}
