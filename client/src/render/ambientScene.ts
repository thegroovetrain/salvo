// THE HOME SCENE — pure composer (cycle 82).
//
// The pre-join backdrop is a REAL, SEEDED SLICE OF THE GAME: a generated
// height-field ocean, hulls under way on the shared `stepShip` kinematics, and
// the shipped radar idling over them. Story 1.14's version imitated all of that
// — fake drifting ellipse "islands", viewport-FRACTION geometry, anonymous
// sprite dots — and every system it imitated has since been replaced (fractal
// terrain, the physical return model, height-aware shadows, radar wakes), so
// the menu had drifted into advertising a game that no longer exists. That is
// exactly what the standing Eric ruling of 2026-07-24 forbids: the ambient must
// not be *"its own thing with its own rules"*.
//
// THIS MODULE IS THE DATA HALF AND IT IS PURE — no Pixi, no DOM, no clock, no
// I/O — the same split `stage/worstCaseScene.ts` uses for the readability gate
// and `ui/chromeBar.ts` for the BR register, so the scene's COMPOSITION (where
// hulls are, where they steer, what the beam paints, where the camera looks) is
// unit-tested rather than eyeballed. `render/ambient.ts` is the thin Pixi shell
// that pumps these answers into the shipped renderers.
//
// THE WORLD BUILD IS SEEDED (`mulberry32`), so the picture is reproducible and a
// screenshot is evidence about a scene anyone can rebuild. `Math.random` would
// be legal here — the seeded-RNG law binds SIM code — but a menu you cannot
// reproduce cannot be tuned by eye against a screenshot.
//
// NO COMBAT LIVES HERE AND NONE MAY BE ADDED. There are no shells, torpedoes,
// bursts, muzzle flashes, hull-hit flashes, splashes or smoke on the menu:
// introducing a flashing channel to a page every player stares at is a
// photosensitivity-relevant DESIGN decision reserved for Eric (the standing law
// this file inherits from ambient.ts, and EXPERIENCE.md's accessibility floor).
// The question is ledgered in deferred-work.md, not answered here.

import {
  CONFIG,
  coastNormal,
  effectiveStats,
  islandBlocksSegment,
  islandDistance,
  mulberry32,
  stepShip,
  wrapAngle,
  wrapPositive,
  type Contact,
  type EffectiveStats,
  type Island,
  type ShipClassId,
  type ShipConfig,
  type ShipState,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, type MotionLevel } from '../settings/store.js';

const A = CLIENT_CONFIG.home.ambient;

/**
 * The dt clamp, and it is load-bearing (Design Note trap 1). `AmbientScene.update`
 * is driven straight off `Ticker.deltaMS`, which — unlike `app/loop.ts`, whose
 * `MAX_FRAME_DT` is 0.25 s — carries no clamp of its own: a backgrounded tab
 * delivers one frame worth tens of seconds, and an unclamped integration would
 * teleport every hull across the ocean (and through the islands the router is
 * steering them around) on the frame the player comes back.
 */
export const MAX_FRAME_MS = 250;

/** The scene's only structural need from a `GameMap` — so a test can drive the
 *  router against a hand-built island without generating a whole ocean. */
export interface AmbientMapLike {
  radius: number;
  islands: readonly Island[];
}

/** One hull under way in the home scene. `state` is mutated in place by
 *  `stepShip`, exactly as the sim mutates a ship. */
export interface AmbientHull {
  id: string;
  cls: ShipClassId;
  /** Regatta wheel index handed to `contactStyle` — never a colour. */
  hue: number;
  state: ShipState;
  /** Fixed throttle (helm only steers). Well under full ahead: a menu is a
   *  calm sea, and a slower hull turns inside a tighter radius, which is what
   *  keeps the coast-avoidance router honest. */
  throttle: number;
  /** Circulation sense about the anchor: +1 counter-clockwise, -1 clockwise. */
  spin: number;
  /** The annulus about the scene anchor this hull holds (u). */
  minU: number;
  maxU: number;
  /** Kinematics from `effectiveStats` — THE only legal path to a derived stat. */
  cfg: ShipConfig;
}

/** The whole home scene, built once from a seed and then only stepped. */
export interface AmbientWorld {
  /** The open-water point the whole formation is held about. */
  anchor: { x: number; y: number };
  /** The hull the camera follows and the scope belongs to. */
  observer: AmbientHull;
  /** Every hull, observer FIRST — one list for the shell to iterate. */
  hulls: AmbientHull[];
  /** The scene clock (ms since construction). It is the scene's SERVER clock:
   *  contact frames, radar paints, wake ages and phosphor decay are all stamped
   *  in it, so there is exactly one clock in the picture. */
  elapsedMs: number;
  /** Beam heading (rad) after the last advance. */
  sweepAngle: number;
  /** The observer's effective vision stats — sight/radar/sweep come from here
   *  and never from a literal (`effectiveStats` is the desync firewall, and the
   *  sweep period it derives is `60000 / CONFIG.vision.sweepRpm`). */
  stats: EffectiveStats;
}

/** What one advance produced — everything the shell needs to drive a frame. */
export interface AmbientTick {
  /** Clamped frame time (ms) and its seconds twin. */
  dtMs: number;
  dtSec: number;
  /** The scene clock after the advance. */
  nowMs: number;
  /** Beam heading before and after — the half-open crossing interval. */
  prevSweep: number;
  sweep: number;
}

// --- the sweep (moved verbatim from the Story 1.14 ambient) -------------------

/** Sweep beam heading (rad) at `elapsedMs` into a `periodMs` full revolution. */
export function sweepAngleAt(elapsedMs: number, periodMs: number): number {
  if (!(periodMs > 0)) return 0;
  return ((elapsedMs % periodMs) / periodMs) * Math.PI * 2;
}

/**
 * Did the beam cross `bearing` while advancing `prevAngle` → `curAngle`
 * (wrap-safe)? The half-open sweep interval (prev, cur] means a stationary
 * beam (zero step) never paints and a bearing exactly at the new beam angle
 * paints exactly once.
 */
export function sweepCrossed(prevAngle: number, curAngle: number, bearing: number): boolean {
  const step = wrapPositive(curAngle - prevAngle);
  if (step === 0) return false;
  const offset = wrapPositive(bearing - prevAngle);
  return offset > 0 && offset <= step;
}

/** Clamp one raw `Ticker.deltaMS` into something safe to integrate. */
export function clampFrameMs(dtMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  return Math.min(dtMs, MAX_FRAME_MS);
}

// --- the seeded world build ---------------------------------------------------

/** Clearance from every coastline at `p` — the minimum signed island distance,
 *  or `Infinity` on an island-free ocean. Negative means aground. */
export function coastClearance(p: { x: number; y: number }, islands: readonly Island[]): number {
  let min = Infinity;
  for (const isle of islands) min = Math.min(min, islandDistance(p, isle));
  return min;
}

/** Seeded rejection sampling for a point in a disc with real sea room. Falls
 *  back to the ROOMIEST candidate seen rather than to a fixed point: an ocean
 *  whose every sample is tight still yields the best of them, never a beached
 *  hull at the origin. */
function pickWater(
  rng: () => number,
  centre: { x: number; y: number },
  minR: number,
  maxR: number,
  clearU: number,
  islands: readonly Island[],
): { x: number; y: number } {
  let best = { x: centre.x, y: centre.y };
  let bestClear = -Infinity;
  for (let i = 0; i < A.placementTries; i += 1) {
    const bearing = rng() * Math.PI * 2;
    const r = minR + rng() * (maxR - minR);
    const p = { x: centre.x + Math.cos(bearing) * r, y: centre.y + Math.sin(bearing) * r };
    const clear = coastClearance(p, islands);
    if (clear >= clearU) return p;
    if (clear > bestClear) {
      bestClear = clear;
      best = p;
    }
  }
  return best;
}

/** One hull, seeded: pose, circulation sense and the annulus it holds. */
function buildHull(
  id: string,
  cls: ShipClassId,
  hue: number,
  band: { minU: number; maxU: number },
  rng: () => number,
  anchor: { x: number; y: number },
  islands: readonly Island[],
): AmbientHull {
  const p = pickWater(rng, anchor, band.minU, band.maxU, A.spawnClearU, islands);
  return {
    id,
    cls,
    hue,
    state: { x: p.x, y: p.y, heading: rng() * Math.PI * 2, speed: 0 },
    throttle: A.throttle,
    spin: rng() < 0.5 ? -1 : 1,
    minU: band.minU,
    maxU: band.maxU,
    cfg: effectiveStats(CONFIG.shipClasses[cls]).kinematics,
  };
}

/**
 * Build the home scene. Pure and total: the same (map, seed) always yields the
 * same world, byte for byte.
 *
 * The FORMATION is the composition decision. The observer holds a small disc
 * about the anchor; each rival holds its own annulus about the SAME anchor, and
 * the bands are chosen (in `CLIENT_CONFIG.home.ambient.rivalBands`, as multiples
 * of base truesight) so that at any moment one rival reads as a live silhouette
 * inside the bubble and the others sit out in the radar annulus where they exist
 * only as returns. Both halves of the two-tier vision model are therefore always
 * on screen — which is the whole picture the menu is trying to sell — without
 * any hull being pinned to a role: a rival that wanders inside truesight simply
 * becomes a contact that frame, because the range predicate is evaluated live.
 */
export function buildAmbientWorld(map: AmbientMapLike, seed: number = A.seed): AmbientWorld {
  const stream = mulberry32(seed);
  const rng = (): number => stream.next();
  const anchor = pickWater(rng, { x: 0, y: 0 }, 0, map.radius * A.anchorSpreadFrac, A.anchorClearU, map.islands);
  const observer = buildHull(
    'home-observer',
    A.observerClass,
    0,
    { minU: A.observerRoamU * 0.35, maxU: A.observerRoamU },
    rng,
    anchor,
    map.islands,
  );
  const hulls = [observer];
  A.rivalBands.forEach((band, i) => {
    hulls.push(buildHull(`home-rival-${i}`, A.rivalClasses[i % A.rivalClasses.length], i + 1, band, rng, anchor, map.islands));
  });
  return {
    anchor,
    observer,
    hulls,
    elapsedMs: 0,
    sweepAngle: 0,
    stats: effectiveStats(CONFIG.shipClasses[A.observerClass]),
  };
}

// --- the helm: open-water routing --------------------------------------------

/** Accumulator for the steering vector — one object, mutated, never allocated
 *  per island (this runs for every hull on every frame). */
interface Steer {
  x: number;
  y: number;
}

/** The closest coastline within reach, and the way out of it. */
interface Coast {
  d: number;
  nx: number;
  ny: number;
}

/** Push the hull away from every coastline within `avoidU`, along the shipped
 *  ESCAPE direction (`coastNormal` — the same push-out authority the collision
 *  resolver uses), weighted by how close it has got; report the CLOSEST of them.
 *  `islandDistance`'s own broadphase keeps this cheap, and past its slack the
 *  cheap bound it returns UNDER-estimates the true distance, so avoidance only
 *  ever triggers EARLY. */
function avoidCoast(acc: Steer, p: { x: number; y: number }, islands: readonly Island[]): Coast | null {
  let near: Coast | null = null;
  for (const isle of islands) {
    const d = islandDistance(p, isle);
    if (d >= A.avoidU) continue;
    const n = coastNormal(p, isle);
    const w = Math.min(2, (A.avoidU - d) / A.avoidU) * A.avoidGain;
    acc.x += n.nx * w;
    acc.y += n.ny * w;
    if (near === null || d < near.d) near = { d, nx: n.nx, ny: n.ny };
  }
  return near;
}

/**
 * The heading this hull wants: circulate about the anchor, spring back toward
 * the middle of its own annulus, and stand off every nearby coast.
 *
 * Deliberately a POTENTIAL FIELD over a heading, never a position clamp: the
 * hull is then driven entirely through `stepShip` at the shipped turn rate and
 * steerage model, so what the menu shows is a hull that really could have
 * sailed that line. `resolveShipPose` is NOT used — it wants hull polygons and
 * would let a hull ground and be shoved off, which is a different picture; the
 * router keeps hulls in open water by construction instead.
 *
 * THE HARD CLAUSE IS NOT DECORATION. A summed field can be argued down: a hull
 * standing into a bay has the coast pushing it out while its own band spring and
 * circulation term pull it back in, and the resulting compromise heading grounds
 * it (measured: a torpedo boat grazed a coastline by half a unit at ~30 s of
 * scene time before this clause existed). Inside `avoidHardU` the escape
 * direction is the ONLY term, and that radius is sized against the worst hull's
 * real turning circle — a battleship at this throttle needs `v/ω` ≈ 48u to swing
 * 90° — so a hull that commits to the turn always has the room to complete it.
 */
export function desiredHeading(h: AmbientHull, world: AmbientWorld, islands: readonly Island[]): number {
  const dx = h.state.x - world.anchor.x;
  const dy = h.state.y - world.anchor.y;
  const r = Math.max(1e-6, Math.hypot(dx, dy));
  const ux = dx / r;
  const uy = dy / r;
  const mid = (h.minU + h.maxU) / 2;
  const span = Math.max(1, (h.maxU - h.minU) / 2);
  const pull = Math.max(-1, Math.min(1, (r - mid) / span)) * A.bandGain;
  const acc: Steer = { x: -uy * h.spin - ux * pull, y: ux * h.spin - uy * pull };
  const near = avoidCoast(acc, h.state, islands);
  if (near !== null && near.d < A.avoidHardU) return Math.atan2(near.ny, near.nx);
  return Math.atan2(acc.y, acc.x);
}

/** Advance one hull: rudder toward the desired heading, then the shared sim. */
function helm(h: AmbientHull, world: AmbientWorld, islands: readonly Island[], dtSec: number): void {
  const err = wrapAngle(desiredHeading(h, world, islands) - h.state.heading);
  const rudder = Math.max(-1, Math.min(1, err / A.rudderBandRad));
  stepShip(h.state, { throttle: h.throttle, rudder }, h.cfg, dtSec);
}

/**
 * Advance the scene by one raw frame time and report what the shell needs.
 *
 * THE MOTION SETTING IS HONOURED HERE, closing a gap the Story 1.14 ambient
 * carried from the day the setting shipped: it consulted `settings/store` in
 * exactly no place. `motionIntensity` scales the hulls' integration step —
 * `reduced` is half amplitude, `off` freezes travel outright, and the camera
 * follows the observer so its drift stops with them. What it does NOT touch is
 * the scene CLOCK or the BEAM: the sweep is the game's own radar and its
 * rotation is the information channel the picture exists to show, and the
 * standing law of the setting (settings/store.ts, *"off removes motion, never
 * information"*) is that an accessibility choice costs travel, never content.
 * Phosphor keeps decaying, returns keep arriving, the picture stays whole.
 */
export function advanceAmbient(
  world: AmbientWorld,
  map: AmbientMapLike,
  rawDtMs: number,
  motion: MotionLevel,
): AmbientTick {
  const dtMs = clampFrameMs(rawDtMs);
  const dtSec = dtMs / 1000;
  world.elapsedMs += dtMs;
  const travel = dtSec * motionIntensity(motion);
  if (travel > 0) for (const h of world.hulls) helm(h, world, map.islands, travel);
  const prevSweep = world.sweepAngle;
  world.sweepAngle = sweepAngleAt(world.elapsedMs, world.stats.sweepPeriodMs);
  return { dtMs, dtSec, nowMs: world.elapsedMs, prevSweep, sweep: world.sweepAngle };
}

// --- what the observer perceives ---------------------------------------------

/** Bearing from the observer to a hull (rad, [0, 2π)). */
function bearingTo(world: AmbientWorld, h: AmbientHull): number {
  return wrapPositive(Math.atan2(h.state.y - world.observer.state.y, h.state.x - world.observer.state.x));
}

/** Range from the observer to a hull (u). */
export function rangeTo(world: AmbientWorld, h: AmbientHull): number {
  return Math.hypot(h.state.x - world.observer.state.x, h.state.y - world.observer.state.y);
}

/**
 * Is this hull inside the observer's TRUESIGHT — within the sight radius and
 * with a clear line? The LOS rule is the shipped one (`islandBlocksSegment`,
 * the `segCircleHit` primitive behind the whole perception layer), never a
 * hand-rolled test: islands block every sensor at every range (Eric ruling
 * 2026-08-02), and the menu obeys that like everything else.
 */
export function sighted(world: AmbientWorld, h: AmbientHull, islands: readonly Island[]): boolean {
  if (rangeTo(world, h) > world.stats.sightRange) return false;
  const a = world.observer.state;
  for (const isle of islands) if (islandBlocksSegment(a, h.state, isle)) return false;
  return true;
}

/**
 * The truesighted contacts this frame — the INSIDE-the-bubble source of hull
 * returns (amendment 89). They reach the scope only by being pushed through a
 * real `ContactStore`, which the radar samples `interpDelayMs` in the past
 * exactly as it does in a live match, so the synthesized echo, the drawn
 * silhouette and the wake all agree about where the hull was.
 */
export function ambientContacts(world: AmbientWorld, islands: readonly Island[]): Contact[] {
  const out: Contact[] = [];
  for (const h of world.hulls) {
    if (h === world.observer || !sighted(world, h, islands)) continue;
    out.push({ id: h.id, x: h.state.x, y: h.state.y, heading: h.state.heading, speed: h.state.speed, cls: h.cls });
  }
  return out;
}

/**
 * The hulls the beam PAINTED this frame: beyond truesight, inside radar range,
 * and the beam actually crossed their bearing on this advance. That is the
 * whole outside-the-bubble rule, and it is the reason a menu hull does not
 * simply glow — it is found, then decays, then is found again a revolution
 * later.
 *
 * TERRAIN IS NOT TESTED HERE ON PURPOSE. Whether a return survives the ground
 * between it and the observer is the shipped height-aware shadow march's answer
 * (`Radar.setHeightRaster`), and re-deciding it here with a second rule would be
 * the two-derivations class the project refuses. This function answers only
 * "did the beam sweep over it".
 */
export function ambientPaints(world: AmbientWorld, tick: AmbientTick): AmbientHull[] {
  const out: AmbientHull[] = [];
  for (const h of world.hulls) {
    if (h === world.observer) continue;
    const range = rangeTo(world, h);
    if (range <= world.stats.sightRange || range > world.stats.radarRange) continue;
    if (sweepCrossed(tick.prevSweep, tick.sweep, bearingTo(world, h))) out.push(h);
  }
  return out;
}

/**
 * Where the camera looks — the observer's pose pushed OFF-CENTRE.
 *
 * DOM legibility is a gate, not a nicety: the home column is ~480px wide and has
 * only ~50px of vertical slack at the 1366×768 floor, and the one genuinely
 * BRIGHT region of the scene is the truesight bubble. Offsetting the camera
 * centre seats the observer (and therefore that bubble) out on a free flank
 * instead of behind the text. The offset is expressed in multiples of base
 * truesight so it scales with the sensor it is dodging, and it is a WORLD offset
 * — the world is never rotated, so a fixed world offset is a fixed screen offset
 * at any zoom.
 */
export function ambientCameraTarget(world: AmbientWorld): {
  x: number;
  y: number;
  heading: number;
  speed: number;
} {
  const s = world.observer.state;
  return {
    x: s.x + A.observerOffset.x,
    y: s.y + A.observerOffset.y,
    heading: s.heading,
    speed: s.speed,
  };
}
