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
//   (c) reveal-ring cull: its dead-reckoned position leaves the ring the server
//       reveals it within (+ margin) — the SIGHT bubble for a shell, the shorter
//       DETECT ring (3/8 of intel range) for an ENEMY TORPEDO, since Story 4.9's
//       eighths ladder stopped both the reveal and the `torpU` corrections at
//       detect for a fish that is not ours. It is invisible under fog out there
//       anyway, and culling stops a ghost from rendering past its true splash
//       point — or, for a fish, from dead-reckoning on past the range the server
//       stopped correcting it. The SIGHT ring applies to an unclaimed shell and
//       to our own ordnance alike — a shell outrunning the bubble (gun range 480
//       > sight 220) fades into fog, which is thematic. THE ENEMY rings are
//       DAZZLE-SCALED, because the server's own reveal ring for them is
//       `sightOf(me, now)` and a dazzled client that kept the full ring would
//       dead-reckon exactly what the server abandoned; a track the client
//       believes is OURS is not, because the server's ballistic rows
//       short-circuit on ownership BEFORE any range or dazzle term is consulted
//       (see `trackCullRadiusSq`).
// Each shell draws as a bright dot with an additive glow, pooled.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import {
  CONFIG,
  type BallisticEvent,
  type BoomEvent,
  type BurstEvent,
  type TorpedoUpdateEvent,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Pool } from '../util/pool.js';
import type { WakeHull } from './wake.js';

const C = CLIENT_CONFIG.colors;
const O = CLIENT_CONFIG.ordnance;
import { insideAnyZone, type OwnZone } from './litZones.js';

export type Kind = BallisticEvent['k'];

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
 *   broadside      OWN fire only, correlated by roomBindings' own-fire
 *                  heuristic (self-private). The ballistic wire shape cannot
 *                  say "broadside" and must not — an onlooker sees the ordinary
 *                  shell look, which is the correct amount of information.
 *
 * STORY 7-5 WAVE 2 retired `cannon`/`cannonArcing`/`cannonAp` with the weapon
 * (R2.6). The BROADSIDE BARRAGE that replaces it has NO doctrine cards at all,
 * so it takes ONE look rather than a family of three — and with PLUNGING FIRE
 * and ARMOR-PIERCING went the `swell` (height-as-size) and `stretch` (dart)
 * channels, which had no other user.
 */
export type ProjectileLookId = 'shell' | 'torp' | 'torpHoming' | 'broadside';

/** Per-look sprite paint. Torpedoes read slower + fatter with a cooler tint. */
interface ProjectileLook {
  core: number;
  glow: number;
  coreR: number; // u
  glowR: number; // u
  glowAlpha: number;
}

const LOOKS: Record<ProjectileLookId, ProjectileLook> = {
  // core = legacy shell tone; glow = amber (the gun's warning glow).
  shell: { core: C.legacy.shellCore, glow: C.amber, coreR: 2.2, glowR: 6, glowAlpha: 0.25 },
  // Torpedo: fatter, cool steel-green core (torpedo on-water render) so a fish
  // reads distinct from a shell; glow = legacy torpedo secondary tone.
  torp: { core: C.torpedo, glow: C.legacy.torpGlow, coreR: 3.4, glowR: 8, glowAlpha: 0.22 },
  // ACOUSTIC HOMING: a brighter, bigger head — a fish under power and steering,
  // against the straight-runner. IT NO LONGER RUNS A TIGHTER WAKE, and that is
  // a DEVIATION OF RECORD from the shipped look rather than an oversight
  // (cycle-69 review gate, P10): the fish's trail is now the ONE shared wake
  // ribbon at the ONE shared sample cadence (amendment 204), so a per-look
  // spacing override would be exactly the second wake model that amendment
  // forbids. The doctrine tell survives in the head, which is where it reads.
  torpHoming: {
    core: C.muzzle,
    glow: C.legacy.torpGlow,
    coreR: O.homingCoreR,
    glowR: 9,
    glowAlpha: 0.3,
  },
  // The OWN BROADSIDE BARRAGE (Story 7-5 wave 2): a visibly bigger, heavier dot
  // than the gun's, on the SAME amber warning glow — it inherits the ratified
  // "a main-battery shell must read heavier than the gun" weights from the
  // cannon look it replaces, and no new hue is invented for it (DESIGN.md owns
  // the palette; SIZE is the channel that was ratified for this read).
  broadside: {
    core: C.legacy.shellCore,
    glow: C.amber,
    coreR: O.broadsideCoreR,
    glowR: O.broadsideGlowR,
    glowAlpha: O.broadsideGlowAlpha,
  },
};

/** The OWN loadout's doctrine state — the self-private half of the identity
 *  split (main.applyOwnStats fans them in, mirroring setSightRange).
 *
 *  STORY 7-5 WAVE 1 turned every doctrine into an independent verb FLAG, and
 *  WAVE 2 deleted the last enum with the cannon (R2.6). ACOUSTIC HOMING is the
 *  only verb the water styles, so this is now a single boolean. */
export interface OwnModes {
  torpedoHoming: boolean;
}

/** Which own weapon a `shell`/`torp` reveal came out of, when the client can
 *  honestly say (roomBindings' own-fire correlation); null = not our shot.
 *  `starShells` rides the `shell` wire kind too (server/equipment/starShells.ts),
 *  so it is claimable — it earns its OWN report (fireStarShells) while keeping
 *  the generic shell LOOK, because a flare in flight is just a shell until it
 *  bursts. */
export type OwnFire = 'gun' | 'broadside' | 'torpedo' | 'starShells' | null;

/**
 * Pure: the look a newly-revealed track paints with.
 *
 * A torpedo is `torpHoming` from LAUNCH only when it is OUR fish and our own
 * torpedo doctrine is homing (self-private knowledge); an enemy's homing fish
 * earns the same look the moment it visibly steers (onBallisticUpdate). A shell
 * is a broadside look only when it is OUR barrage — the wire is weapon-blind for
 * ballistics and stays that way, and an own STAR SHELL (which rides the same
 * wire kind) falls through to the generic shell look on the same clause.
 */
export function lookForReveal(kind: Kind, own: OwnFire, modes: OwnModes): ProjectileLookId {
  if (kind === 'torp') return own === 'torpedo' && modes.torpedoHoming ? 'torpHoming' : 'torp';
  return own === 'broadside' ? 'broadside' : 'shell';
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

/** Cull a dead-reckoned shell once it is this far outside its reveal ring (u). */
const SIGHT_CULL_MARGIN = 40; // u

/**
 * Pure: the SQUARED dead-reckoning cull radius for one ordnance kind, given the
 * sight range the ring is measured against — always boon-widened
 * (`stats.sightRange`, plumbed in by main.applyOwnStats → `setSightRange`), and
 * dazzle-scaled ONLY on the enemy path (the flag main.updateDazzle fans out →
 * `setDazzled`, applied by `effectiveSight` below). `trackCullRadiusSq` is the
 * one caller that decides which of the two a given track gets; this function
 * takes the number already resolved.
 *
 * THE TWO KINDS NO LONGER SHARE A RING (Story 4.9, the eighths ladder). A shell
 * is still first revealed at the TRUESIGHT boundary, so it still culls there.
 * An ENEMY torpedo is now revealed — and, crucially, CORRECTED (`torpU`) — only
 * out to the DETECT rung, 3/8 of intel range, which the server resolves as
 * `sightOf(me, now) * CONFIG.vision.detectFactor` (amendments 119/121). Culling
 * a fish at the old truesight ring would leave the client dead-reckoning an
 * un-corrected ghost across the 82.5u (at base stats) the server has already
 * stopped updating — the client inventing information it does not have.
 *
 * `detectFactor` is applied to the SAME plumbed `sightRange`, never to a second
 * copy of the rung: `CONFIG.vision.detect === CONFIG.vision.sight *
 * CONFIG.vision.detectFactor` is pinned shared-side precisely so there is one
 * derivation, and an observer's detect ring must scale with their own sight.
 */
export function cullRadiusSq(sightRange: number, kind: Kind): number {
  const reveal = kind === 'torp' ? sightRange * CONFIG.vision.detectFactor : sightRange;
  return (reveal + SIGHT_CULL_MARGIN) ** 2;
}

/**
 * Pure: the observer's EFFECTIVE sight radius (u) for cull purposes — the
 * client-side twin of the server's `sightOf()`, cut by the SAME ratified factor
 * while a DAZZLE BURST holds this ship. `render/fog.ts:fogHoleRadiusU` states
 * the identical rule for the fog hole and `render/radar.ts` for the source seam;
 * this is the third consumer, and it reads `CONFIG.starShells.dazzleSightFactor`
 * for the same reason they do — there is exactly one dazzle factor in the game.
 */
export function effectiveSight(sightRange: number, dazzled: boolean): number {
  return dazzled ? sightRange * CONFIG.starShells.dazzleSightFactor : sightRange;
}

/**
 * Pure: THE cull radius (squared) for one live track — the single place the
 * three inputs (ownership, kind, dazzle) turn into a ring.
 *
 * A TRACK THE CLIENT BELIEVES IS ITS OWN RIDES THE UN-DAZZLED, SIGHT-DERIVED
 * RING — exactly its pre-Story-4.9 behavior. The server's ballistic rows
 * short-circuit on `shell.ownerId === me.id` BEFORE any range test at all
 * (signals.ts `ballisticSignal` and `torpedoUpdateSignal`), so the server never
 * stops revealing or correcting an OWNER's own shell or fish — dazzled or not.
 * Both narrowings therefore have no server basis on this path: the detect ring's
 * rationale ("the server stopped correcting it") is false for an owner, and so
 * is the dazzle scaling — a dazzled captain's own tracer would otherwise vanish
 * at 205u instead of 370u at base stats, for no stated reason.
 *
 * EVERYTHING ELSE rides the DAZZLE-SCALED ring (the server gates it on
 * `sightOf(me, now)`, which IS dazzle-scaled), detect-derived for a torpedo.
 *
 * KNOWN AND ACCEPTED: ownership is a soft click-time latch, so a MISSED latch
 * degrades an own track to the enemy ring. That one-sided error is deliberate —
 * inverting it would hand every enemy fish a long ghost.
 */
export function trackCullRadiusSq(sightRange: number, dazzled: boolean, kind: Kind, own: OwnFire): number {
  if (own !== null) return cullRadiusSq(sightRange, 'shell'); // believed-own: un-dazzled truesight
  return cullRadiusSq(effectiveSight(sightRange, dazzled), kind);
}

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
  expiresAt: number; // server time (ms) the shell self-terminates
  /** Which OWN weapon this track was DRESSED as (roomBindings' near-own-hull
   *  heuristic, including its ratified 'gun' fallback for an unclaimed reveal)
   *  — the LOOK/audio channel only. NOT the burst-ring authority: see the
   *  `claims` tombstone map, which holds only genuine latch claims. */
  own: OwnFire;
}

/** How many own-shot claim tombstones are retained (oldest evicted). One entry
 *  per own shot; the gun's floor is a 3s reload, so this is minutes of cover
 *  for a burst that arrives seconds after launch. */
export const MAX_OWN_CLAIMS = 32;

export class Projectiles {
  private readonly pool: Pool<Graphics>;
  private readonly live = new Map<string, LiveShell>();
  /** id → the GENUINELY claimed own weapon, kept past the sprite's death (cull
   *  / lifetime backstop) so a late burst can still be sized off our own stats.
   *  Bounded, and consumed by the burst/boom that ends the track. */
  private readonly claims = new Map<string, OwnFire>();

  /** The plumbed BOON-widened sight range (u) and the DAZZLE flag — the two
   *  observer inputs every cull ring is resolved from, per track and per frame
   *  (`trackCullRadiusSq`). Kept as state so either can change alone without the
   *  other being silently reset (a boon landing mid-dazzle must not un-dazzle
   *  the enemy rings, and vice versa). */
  private sightRange: number = CONFIG.vision.sight;
  private dazzled = false;

  constructor(
    private readonly mapRadius: number,
    private readonly layer: Container,
  ) {
    this.pool = new Pool<Graphics>(() => this.makeBlank());
  }

  /**
   * EVERY LIVE TORPEDO, as the wake layer needs it (cycle-69 review gate, P10).
   *
   * The fish's on-water trail used to be a private one-shot dot chain emitted
   * from `render()` at a per-look spacing, with a 0.7s life — a SECOND wake
   * object, ~8× shorter than the 6s ribbon the same fish paints on the scope,
   * which is exactly the fork amendment 204 forbids (*"I didn't say shit about
   * the lengths being different here"*). It is gone: this module now only
   * REPORTS the fish's dead-reckoned pose, and `Effects` lays it onto the one
   * shared `WakeRibbon` — the same model, the same cadence and the same
   * `torpWakeLifeMs` the server samples and the scope draws.
   *
   * PULLED, NOT PUSHED, and the ordering is the reason: `main.ts` assembles
   * every wake source in one place and hands them to `effects.update()` BEFORE
   * `projectiles.render()` runs, so a push from inside `render()` would land
   * after that frame's prune and chop pass. Pose is computed at the caller's
   * `serverNow`, so pulling one frame "early" is not stale — it is the same
   * dead reckoning `render()` does, from the same anchor.
   *
   * The colour is the fish's own legacy wake tone, so the foam it lays keeps the
   * identity it has always had on the water.
   */
  torpWakeHulls(serverNow: number): WakeHull[] {
    const out: WakeHull[] = [];
    for (const [id, s] of this.live) {
      if (s.kind !== 'torp') continue;
      const p = shellPosition({ x: s.x0, y: s.y0 }, s, s.t0, serverNow);
      const speed = Math.hypot(s.vx, s.vy);
      out.push({
        id,
        x: p.x,
        y: p.y,
        heading: Math.atan2(s.vy, s.vx),
        speed,
        cls: 'torp',
        color: C.legacy.torpWake,
      });
    }
    return out;
  }

  /** The OWN doctrine modes, fanned in from applyOwnStats (Story 2.9) — the
   *  seam setSightRange established, for the self-private half of ordnance
   *  identity. Stock until the first authoritative `you` lands. */
  private ownModes: OwnModes = { torpedoHoming: false };

  /** Track the own ship's boon-widened sight range so reveals don't pop early.
   *  ONE plumbed value, THREE rings — the enemy-torpedo ring is `detectFactor`
   *  of it and the enemy rings are dazzle-scaled (see `trackCullRadiusSq`),
   *  never a second plumbing path. */
  setSightRange(sightRange: number): void {
    this.sightRange = sightRange;
  }

  /**
   * Adopt the DAZZLE state (Story 2.8) — the projectile half of the plumbing
   * `Fog` and `Radar` have always had, and the reason it is not optional: the
   * SERVER reveals and corrects an ENEMY's ballistics inside `sightOf(me, now)`,
   * which IS dazzle-scaled, so a client holding the full ring would go on
   * dead-reckoning a track the server had already stopped correcting — the
   * amendment-81 bug class (a shrunken fog hole beside an unshrunken companion
   * circle), one layer down. It reaches the ENEMY rings only: the server's owner
   * path never consults a range at all (`trackCullRadiusSq`). Returns TRUE when
   * the state actually flipped, mirroring `Fog.setDazzled`'s changed-flag
   * contract so one call site drives all three; there is nothing to rebake here,
   * so the caller may ignore the result.
   */
  setDazzled(dazzled: boolean): boolean {
    if (dazzled === this.dazzled) return false;
    this.dazzled = dazzled;
    return true;
  }

  /** Is the dazzle currently held? Test/observation seam (mirrors `Fog`). */
  get isDazzled(): boolean {
    return this.dazzled;
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

  private makeBlank(): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';
    g.visible = false;
    this.layer.addChild(g);
    return g;
  }

  /** Paint a track's identity onto its sprite: a round core inside its glow.
   *  Every shipped look is a DOT — the AP dart's `stretch` channel died with
   *  ARMOR-PIERCING (Story 7-5 wave 2, R2.6). */
  private paint(g: Graphics, id: ProjectileLookId): void {
    const look = LOOKS[id];
    g.clear();
    g.circle(0, 0, look.glowR).fill({ color: look.glow, alpha: look.glowAlpha });
    g.circle(0, 0, look.coreR).fill({ color: look.core, alpha: 1 });
  }

  /** Re-paint a live track (a look CHANGED — an enemy fish just revealed itself
   *  as a steering one). */
  private restyle(s: LiveShell, look: ProjectileLookId): void {
    if (s.look === look) return;
    s.look = look;
    this.paint(s.gfx, look);
  }

  /**
   * Register a newly-seen projectile (shell or torpedo). `own` names the OWN
   * weapon that fired it when the client can honestly correlate the reveal with
   * a click we just made (roomBindings' own-fire heuristic — the same one the
   * muzzle flash and own-fire tone already ride); it is null for every other
   * observer, who gets exactly today's look.
   *
   * `claimed` is the STRICTER half of that pair: the weapon only when the
   * click-time latch was genuinely claimed for this reveal. `own` carries a
   * ratified FALLBACK ('gun' for any unclaimed shell surfacing near our hull,
   * which is pre-2.9 behavior and includes an ENEMY's shell revealed on our
   * bow), and that fallback is fine for a look and a crack — but it must never
   * size a burst ring off OUR effective blast radius. Only `claimed` may.
   */
  onShell(ev: BallisticEvent, own: OwnFire = null, claimed: OwnFire = null): void {
    if (this.live.has(ev.id)) return;
    // A GENUINE latch claim is remembered independently of the sprite, because
    // the burst that needs it arrives long after this track may be gone.
    if (claimed !== null) this.rememberClaim(ev.id, claimed);
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
      expiresAt: ev.t + maxLifetimeMs(this.mapRadius, Math.hypot(ev.vx, ev.vy)),
      own,
    };
    this.live.set(ev.id, s);
  }

  /**
   * Which own weapon GENUINELY fired the track `id` (a claimed click-time
   * latch), or null. Read at BURST time so the ring may size itself off our own
   * effective blast radius (aimPreview.ownBurstRadius) — the wire will never
   * say, and must not.
   *
   * It reads the tombstone map, NOT the live track, because the two ways a
   * track dies before it bursts are exactly the cases the effective radius
   * matters most for: the sight-bubble cull (~370u) and the lifetime backstop
   * both fire long before a boosted gun/cannon shell reaches its 660u+ burst
   * point. Consulting `live` alone handed every long shot the CONFIG default —
   * i.e. it failed precisely for the upgraded blasts it exists to draw.
   */
  ownFireOf(id: string): OwnFire {
    return this.claims.get(id) ?? null;
  }

  /**
   * Remember a genuine claim past the life of its sprite. BOUNDED by count
   * (MAX_OWN_CLAIMS, oldest evicted) rather than by a timer: only our OWN shots
   * ever land here — a few per reload cycle — so the cap is far more headroom
   * than any shell's flight time needs, and it cannot grow without limit even
   * if a burst/boom never arrives to consume the entry.
   */
  private rememberClaim(id: string, claimed: OwnFire): void {
    this.claims.delete(id); // re-insert so eviction order is true recency
    this.claims.set(id, claimed);
    if (this.claims.size <= MAX_OWN_CLAIMS) return;
    const oldest = this.claims.keys().next().value;
    if (oldest !== undefined) this.claims.delete(oldest);
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
   * changed it). The wake needs no re-anchoring of its own any more: since the
   * fish's trail became the one shared ribbon (P10), its cadence is measured in
   * travelled DISTANCE by the shared model off the stored samples, not against
   * a per-track counter that a steer would invalidate.
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
  }

  /** Register a track from a `torpU` for an id we hold no track for (see
   *  onBallisticUpdate): a torpedo-kind track — only a torpedo ever steers —
   *  seeded from the update, which the caller then re-anchors.
   *
   *  OWNERSHIP COMES FROM THE CLAIM TOMBSTONE, not from the payload. A `torpU`
   *  carries no ownership channel and must not (it is the same constant-free
   *  shape as the reveal), but this client already recorded a GENUINE claim for
   *  its own fish at launch, and `claims` deliberately outlives the sprite for
   *  exactly this reason. Left at `null`, our own resurrected fish would take
   *  the ENEMY cull ring — a track the server is still correcting, dropped
   *  82.5u early. An id we never claimed still resolves to null, so no fish is
   *  ever fabricated as ours. */
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
      expiresAt: ev.t,
      own: this.claims.get(ev.id) ?? null, // ours only on a genuine launch claim
    };
    this.live.set(ev.id, s);
    return s;
  }

  /** Terminate the projectile that produced this boom (if we were tracking it).
   *  A boom is terminal, so its claim tombstone is consumed with it. */
  onBoom(ev: BoomEvent): void {
    if (!ev.id) return;
    this.remove(ev.id);
    this.claims.delete(ev.id);
  }

  /** Terminate the shell that burst at its target point (same removal as boom).
   *  The caller reads ownFireOf FIRST — this consumes the claim. */
  onBurst(ev: BurstEvent): void {
    this.remove(ev.id);
    this.claims.delete(ev.id);
  }

  /**
   * Advance all live projectiles to `serverNow` (ms). Retire any past their
   * per-kind max lifetime, or (when `ownPos` is known) once their dead-reckoned
   * position leaves the ring the server reveals them within — the UN-dazzled
   * sight bubble for anything the client believes is OURS, the dazzle-scaled
   * sight bubble for an enemy shell, the shorter DETECT ring for an ENEMY
   * torpedo (Story 4.9; see `cullRadiusSq` and `trackCullRadiusSq`) — invisible
   * under fog there anyway, UNLESS it lies inside
   * an own active lit zone (`keepZones`, Story 1.7: truesight parity keeps
   * revealing it; culling would blind the firer permanently, the reveal is
   * exactly-once). The lit-zone exemption is IDENTICAL for both kinds.
   *
   * IT NO LONGER LAYS A WAKE TRAIL (cycle-69 review gate, P10). A fish's water
   * is the ONE shared ribbon now: `torpWakeHulls` reports the dead-reckoned
   * pose and `Effects` lays it, on the same model, cadence and life the scope
   * draws.
   */
  render(serverNow: number, ownPos?: { x: number; y: number }, keepZones: readonly OwnZone[] = []): void {
    for (const [id, s] of this.live) {
      if (serverNow >= s.expiresAt) {
        this.remove(id);
        continue;
      }
      const p = shellPosition({ x: s.x0, y: s.y0 }, s, s.t0, serverNow);
      const cull2 = trackCullRadiusSq(this.sightRange, this.dazzled, s.kind, s.own);
      if (ownPos && shellCulledBeyondSight(p, ownPos, cull2, keepZones)) {
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
