// THE STAGED WORST-CASE SCENE — pure composer (Story 4.8, amendment 242).
//
// Amendment 242 ships the readability gate as *"a dev-only staged worst-case
// scene (multiple contacts, torpedoes inbound, storm closing, kill leader
// active, own hull critical), captured headlessly at both zoom extremes with
// the measured per-frame cost alongside"* — because the only squint test of
// record (EXPERIENCE.md:160) was run on a static HTML mockup, which by
// construction cannot show the thing 4.8 exists to bound: channels STACKING.
//
// THIS MODULE IS THE DATA HALF and it is PURE — no Pixi, no DOM, no clock, no
// I/O — exactly like ui/chromeBar.ts and render/attention.ts, so the scene's
// composition is unit-tested rather than eyeballed. render/../stage/worstCase.ts
// is the thin wiring shell that pumps these frames into the REAL client
// pipeline (buildGame → bindRoom → the render loop): the gate must exercise the
// shipped renderers, not a mock of them, or it proves nothing about the shipped
// arbitration.
//
// EVERYTHING IS SEEDED AND TICK-INDEXED. `Math.random` is never called; every
// hull's orbit, every flash's position and every schedule is a total function of
// (seed, tick), so two captures at the same scene time are comparable. The one
// thing that is NOT frozen is real elapsed time inside the shipped channels
// (pulse phases, phosphor decay, effect ages) — that is deliberate, since the
// capture also measures real per-frame cost, and a scene driven off a fake clock
// would not.
//
// DEV-ONLY. Nothing in the shipped game imports this module; the sole reference
// is a dynamic import behind `import.meta.env.DEV` in main.ts, which Vite folds
// to `false` in a production build so the whole module is dropped from the
// bundle. See STAGE_MARKER.

import {
  CONFIG,
  REGATTA_NO_HUE,
  mulberry32,
  paintCoverage,
  type Contact,
  type FrameMsg,
  type GameEvent,
  type HullId,
  type OwnShip,
  type RadarGrammar,
  type ShipClassId,
  type WelcomeMsg,
  type ZoneRing,
} from '@salvo/shared';

/**
 * A string that exists NOWHERE ELSE in the codebase, emitted onto `window` by
 * the staging shell. The production-bundle check greps the built assets for it:
 * if it is absent, the staged scene was dead-stripped. Do not reuse it.
 */
export const STAGE_MARKER = 'HC_STAGED_WORSTCASE_4_8';

/** The one seed. Changing it changes the scene; two captures must share it.
 *  Written in decimal, not hex — the token guard scan (tokens.test.ts) rejects
 *  a `0x` literal anywhere outside the colour token source, and a seed is not
 *  worth an exemption. */
export const STAGE_SEED = 4082026;

/** Scene tick = the sim tick (20 Hz), so a tick index IS a scene time. */
export const SCENE_TICK_MS = CONFIG.tick.simDtMs;

/** The map seed the staged ocean is generated from (deterministic, like a
 *  room's). Lives here, with the rest of the scene's data, because the welcome
 *  it rides in is composed here too. */
export const STAGE_MAP_SEED = 20260811;

/**
 * THE RADAR GRAMMAR THE SCENE STAGES (Eric ruling 2026-08-11).
 *
 * `return` — the physical return model — is what ships; `silhouette` (Story
 * 4.2's true-scale hull outlines + ARPA vector) is being removed wholesale
 * (*"I am going to be completely removing all radar shit that existed before
 * that. Its too good."*). A readability gate captured against a doomed grammar
 * would be evidence about the wrong game, so the scene synthesizes its own
 * welcome with this value and the wire blips it emits are `ReturnBlipEvent`s.
 *
 * IT IS NOT READ FROM THE SERVER. The scene builds a STUB room and synthesizes
 * the welcome handshake, so the server process's `HC_RADAR_GRAMMAR` never
 * reaches it: THIS constant is what decides the capture, which is why it is
 * pinned by a test rather than left as a literal in the wiring shell.
 *
 * `radarIdentity` stays `roster` and is out of scope: under `return` the hue
 * resolver is never called (amendments 65/67), so identity is independent.
 */
export const SCENE_RADAR_GRAMMAR: RadarGrammar = 'return';

/**
 * THE STAGED SERVER-CLOCK EPOCH (ms) — the origin the scene's server
 * timestamps are measured from, and the fix for a defect that silently voided
 * a whole channel of the gate's evidence.
 *
 * The scene's own clock is `performance.now()`, which starts at 0 on page load.
 * `scenePublicPlane` anchors the zone timeline at `serverNow − zoneElapsedMs`
 * (175 s), so on a fresh page every plausible `serverNow` produced an anchor
 * ~170 s in the NEGATIVE — and `barVisible()` requires `zoneStartT > 0`
 * (correctly: 0 is the server's "not anchored yet" sentinel, and `now − 0`
 * would print the server's whole uptime as the match clock). The BR chrome bar
 * therefore never drew in a capture, taking with it one of only two Tier-2
 * channels the gate exists to demonstrate and the kill-leader register.
 *
 * A real server stamps frames off a clock that has been running for far longer
 * than one match, so the scene does too: every server timestamp it emits (the
 * welcome's `t` and every frame's) is `SCENE_EPOCH_MS + elapsed`. The client's
 * ServerClock estimates offset = clientAt − serverT, so `serverNow()` simply
 * tracks `performance.now() + SCENE_EPOCH_MS` — one clock, no skew to model,
 * and an anchor that is a real timestamp.
 */
export const SCENE_EPOCH_MS = 86_400_000; // a day of "server uptime"

/**
 * The staged constants, each traceable to what amendment 242 names.
 *
 * `zoneElapsedMs` is the load-bearing one: it seats the timeline inside the
 * REVEAL beat of group 0 with 5s left to the close start, which is
 * simultaneously (a) a pre-close beat, so the chrome bar's ring readout is in
 * its final-10s AMBER URGENCY window (a Tier-2 channel animating), and (b) a
 * beat where the next ring is revealed, so the dashed on-water telegraph draws
 * alongside the solid live edge. It is re-seated every tick rather than allowed
 * to run, so the capture is not a race against a countdown.
 */
export const SCENE = {
  /** Own hull fraction — CRIMSON band (<25%, amendment 239) ⇒ Tier 1 ACTIVE. */
  ownHpFrac: 0.2,
  /** Contacts inside the truesight bubble (hulls the eye must pick out). */
  nearContacts: 12,
  /** Contacts in the radar annulus (fogged hulls that also paint as blips). */
  farContacts: 7,
  /** Torpedoes inbound on the own hull. */
  torpedoes: 5,
  // THE FLASH STACK. Sized ABOVE anything the arena can structurally produce
  // but not absurdly so, because this scene's frame cost is also the number
  // reported against the 16.6 ms budget — an unreachable effect count would
  // make that measurement a lie in the pessimistic direction. The reference is
  // the arena's structural ceiling: 20 hulls with the gun at its shortest
  // possible reload (2.5 s at a maxed cooldown build) is 8 shots/s ARENA-WIDE,
  // i.e. 0.4 muzzle onsets per tick. Every count below is several times that,
  // and all of them land inside ONE viewport region rather than spread over
  // twelve — so the region under the cluster is asked for ~100x the ratified
  // 3 onsets/s while the total sprite population stays in a range the renderer
  // could genuinely be asked for.
  /** Muzzle flashes per tick in the hot cluster (~10x the structural max). */
  muzzlePerTick: 4,
  /** Of those, how many are EXACTLY co-located (exercises the coalescer). */
  muzzleColocated: 2,
  splashPerTick: 3,
  hitCallPerTick: 2,
  hullHitsPerTick: 3,
  burstsPerTick: 2,
  smokePerTick: 3,
  /** Ticks between kill-feed lines (churn). */
  sunkEveryTicks: 40,
  /** Ticks between banked-level events (keeps the Tier-3 chip inside its
   *  10s breathing window so there is something to freeze). */
  pointEveryTicks: 120,
  /** Ticks between own-damage aggregates (shake + the crimson rail's sting). */
  ownDamageEveryTicks: 60,
  /** Ticks between denied presses (a Tier-1 channel that is NOT the hull). */
  deniedEveryTicks: 90,
  foghornEveryTicks: 200,
  /** ms into the zone timeline the scene is pinned at (see above). */
  zoneElapsedMs: 175_000,
  /** World radius of the hot flash cluster (u) — tight enough that every
   *  member lands in one viewport region at both zoom extremes. */
  clusterRadiusU: 26,
  /** Where the hot cluster sits relative to the own hull (u). */
  clusterOffsetU: 130,
} as const;

/** The kill leader's roster index (a captain, never the local player). */
export const BOUNTY_INDEX = 7;

/** Hull ids the staged contacts wear, cycled deterministically. */
const CONTACT_HULLS: readonly HullId[] = [
  'torpedoBoat',
  'battleship',
  'mineLayer',
  'droneMedium',
  'battleship',
  'torpedoBoat',
  'droneLarge',
  'mineLayer',
];

/** The local captain's class. */
export const OWN_CLASS: ShipClassId = 'battleship';

/** One roster row, in exactly the shape main.ts's `publicState()` reads. */
export interface SceneRosterRow {
  id: string;
  name: string;
  color: number;
  kills: number;
  alive: boolean;
}

/** A staged hull's fixed orbit — everything about its motion, seeded once. */
export interface SceneHull {
  id: string;
  cls: HullId;
  /** Orbit centre offset from the own start point (u). */
  cx: number;
  cy: number;
  radiusU: number;
  phase: number; // rad
  rateRadPerTick: number;
  /** True once the hull is far enough out to be a radar contact rather than a
   *  truesighted one — it paints blips instead of reading as a live silhouette. */
  far: boolean;
}

/** The whole staged world, built once from the seed + the real map radius. */
export interface SceneWorld {
  mapRadius: number;
  ownId: string;
  ownStart: { x: number; y: number };
  roster: SceneRosterRow[];
  hulls: SceneHull[];
  ring: { cur: ZoneRing; next: ZoneRing };
  bountyId: string;
}

/** Deterministic id for roster slot `i` (slot 0 is the local captain). */
function hullId(i: number): string {
  return `hc${String(i).padStart(2, '0')}`;
}

/** Deterministic callsign for roster slot `i`. */
function callsign(i: number): string {
  return i === 0 ? 'YOU' : `VESSEL-${String(i).padStart(2, '0')}`;
}

/**
 * The roster: 20 rows (`CONFIG.map.playerCap`) — the local captain, a set of
 * rival captains, and drones wearing the `REGATTA_NO_HUE` sentinel so the
 * chrome bar's AFLOAT count exercises its captains-only rule. The kill leader
 * carries the highest kill count, which is the count `bountyId` agrees with.
 */
function buildRoster(count: number): SceneRosterRow[] {
  const rows: SceneRosterRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const drone = i > 0 && i % 5 === 0;
    rows.push({
      id: hullId(i),
      name: callsign(i),
      color: drone ? REGATTA_NO_HUE : i % 20,
      kills: i === BOUNTY_INDEX ? 6 : (i * 3) % 5,
      alive: true,
    });
  }
  return rows;
}

/**
 * One staged hull's seeded orbit. `i` is 1-based over the non-own roster.
 *
 * The two bands are chosen so that, once the hull's own orbit radius is added,
 * a NEAR hull is always inside the truesight bubble (it must read as a live
 * silhouette, with a nameplate and a wake) and a FAR hull is always in the radar
 * annulus (it must read as phosphor, never as a hull the fog is hiding). The
 * orbits are centred on the own hull's live pose — see `hullPose`.
 */
function buildHull(i: number, rng: () => number, near: number): SceneHull {
  const far = i > near;
  const band = far ? 400 + rng() * 180 : 60 + rng() * 180;
  const bearing = rng() * Math.PI * 2;
  return {
    id: hullId(i),
    cls: CONTACT_HULLS[i % CONTACT_HULLS.length],
    cx: Math.cos(bearing) * band,
    cy: Math.sin(bearing) * band,
    radiusU: 18 + rng() * 46,
    phase: rng() * Math.PI * 2,
    // ~1 lap per 12-30s at 20 Hz — visible motion, so every hull lays wake.
    rateRadPerTick: (0.008 + rng() * 0.012) * (rng() < 0.5 ? -1 : 1),
    far,
  };
}

/**
 * The storm rings. The LIVE ring deliberately EXCLUDES the own hull (the in-storm
 * vignette is a Tier-2 channel and must be active), and the revealed next ring is
 * the dashed telegraph. Both are offset circles, exactly as the server rolls them.
 */
function buildRings(mapRadius: number, own: { x: number; y: number }): { cur: ZoneRing; next: ZoneRing } {
  const curR = mapRadius * 0.52;
  // Centre the live ring far enough away that the own hull sits OUTSIDE it.
  const off = curR + CONFIG.vision.sight * 0.9;
  return {
    cur: { cx: own.x + off, cy: own.y, r: curR },
    next: { cx: own.x + off * 1.05, cy: own.y + curR * 0.1, r: curR * 0.62 },
  };
}

/** Build the staged world. Pure and total: same (seed, mapRadius) ⇒ same world. */
export function buildSceneWorld(mapRadius: number, seed: number = STAGE_SEED): SceneWorld {
  const stream = mulberry32(seed);
  const rng = (): number => stream.next();
  const cap = CONFIG.map.playerCap;
  const roster = buildRoster(cap);
  const ownStart = { x: 0, y: 0 };
  const hulls: SceneHull[] = [];
  const total = Math.min(cap - 1, SCENE.nearContacts + SCENE.farContacts);
  for (let i = 1; i <= total; i += 1) hulls.push(buildHull(i, rng, SCENE.nearContacts));
  return {
    mapRadius,
    ownId: hullId(0),
    ownStart,
    roster,
    hulls,
    ring: buildRings(mapRadius, ownStart),
    bountyId: hullId(BOUNTY_INDEX),
  };
}

/**
 * A staged hull's pose at `tick` (pure; the orbit is closed-form).
 *
 * Centred on the OWN hull's live pose, not on the world origin: the whole point
 * of the scene is what the local captain's screen looks like, and a formation
 * anchored to a fixed world point would drift out of frame and out of its
 * sensor band as the own hull travels. Relative motion — and therefore wake,
 * heading and speed vectors — still comes from each hull's own orbit.
 */
export function hullPose(h: SceneHull, world: SceneWorld, tick: number): Contact {
  const own = ownPoseAt(world, tick);
  const a = h.phase + h.rateRadPerTick * tick;
  const x = own.x + h.cx + Math.cos(a) * h.radiusU;
  const y = own.y + h.cy + Math.sin(a) * h.radiusU;
  // Heading is the orbit tangent, so the hull points where it is going and its
  // wake trails astern — the wake ribbon is one of the channels under test.
  const heading = a + (h.rateRadPerTick >= 0 ? Math.PI / 2 : -Math.PI / 2);
  const speed = Math.abs(h.rateRadPerTick) * h.radiusU * (1000 / SCENE_TICK_MS);
  return { id: h.id, x, y, heading, speed, cls: h.cls };
}

/** The own hull's pose at `tick` — a slow wide turn, so it lays a wake too. */
export function ownPoseAt(world: SceneWorld, tick: number): { x: number; y: number; heading: number; speed: number } {
  const r = 210;
  const a = tick * 0.0016;
  return {
    x: world.ownStart.x + Math.cos(a) * r,
    y: world.ownStart.y + Math.sin(a) * r,
    heading: a + Math.PI / 2,
    speed: 0.0016 * r * (1000 / SCENE_TICK_MS),
  };
}

/** Banked levels at `tick` — bumped on the schedule so the Tier-3 bank chip
 *  stays inside its ~10 s breathing window and therefore has a breath to freeze. */
export function bankedPointsAt(tick: number): number {
  return 1 + Math.floor(tick / SCENE.pointEveryTicks) % 3;
}

/** The staged own ship for `tick`. hp sits in the CRIMSON band by construction. */
export function sceneOwn(world: SceneWorld, tick: number): OwnShip {
  const p = ownPoseAt(world, tick);
  const maxHp = CONFIG.shipClasses[OWN_CLASS].hp;
  return {
    id: world.ownId,
    x: p.x,
    y: p.y,
    heading: p.heading,
    speed: p.speed,
    hp: Math.round(maxHp * SCENE.ownHpFrac),
    alive: true,
    ammo: [
      { n: 1, reloadMsLeft: 0 },
      { n: 0, reloadMsLeft: 4200 },
      { n: 2, reloadMsLeft: 0 },
      null,
    ],
    sweep: (tick * 0.06) % (Math.PI * 2),
    cls: OWN_CLASS,
    pts: bankedPointsAt(tick),
    offer: ['gunDamage', 'torpedoSpeed', 'cannonBlast'],
    boostUntil: 0,
    boons: [],
    lvl: 4 + Math.floor(tick / SCENE.pointEveryTicks),
    xp: (tick % SCENE.pointEveryTicks) / SCENE.pointEveryTicks,
    repairHp: 0,
  };
}

/** The truesighted contacts this tick (the near band; the far band is fogged
 *  and reaches the client as radar paint instead — see `blipEvents`). */
export function sceneContacts(world: SceneWorld, tick: number): Contact[] {
  return world.hulls.filter((h) => !h.far).map((h) => hullPose(h, world, tick));
}

/** Deterministic scatter around a point: a seeded ring walk, never `Math.random`. */
function scatter(cx: number, cy: number, i: number, tick: number, radius: number): { x: number; y: number } {
  const a = (i * 2.399963 + tick * 0.11) % (Math.PI * 2);
  const r = radius * (0.15 + ((i * 7 + tick * 3) % 17) / 20);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

/** The hot region's world centre this tick — a fixed offset off the own bow. */
export function clusterCentre(world: SceneWorld, tick: number): { x: number; y: number } {
  const p = ownPoseAt(world, tick);
  return {
    x: p.x + Math.cos(p.heading) * SCENE.clusterOffsetU,
    y: p.y + Math.sin(p.heading) * SCENE.clusterOffsetU,
  };
}

/**
 * THE FLASH STACK: muzzle flashes, fall-of-shot splashes and Hit Calls, all
 * inside one tight cluster so a single viewport region is asked for far more
 * than three onsets a second. `muzzleColocated` of the muzzles share ONE exact
 * point, which is the coalescer's input (one draw, one charge) as distinct from
 * the window's (the fourth onset onward degrades).
 */
function gunneryEvents(world: SceneWorld, tick: number): GameEvent[] {
  const c = clusterCentre(world, tick);
  const out: GameEvent[] = [];
  for (let i = 0; i < SCENE.muzzlePerTick; i += 1) {
    const p = i < SCENE.muzzleColocated ? c : scatter(c.x, c.y, i, tick, SCENE.clusterRadiusU);
    out.push({ k: 'mz', x: p.x, y: p.y });
  }
  for (let i = 0; i < SCENE.splashPerTick; i += 1) {
    const p = scatter(c.x, c.y, i + 40, tick, SCENE.clusterRadiusU * 1.6);
    out.push({ k: 'sp', id: world.ownId, x: p.x, y: p.y });
  }
  for (let i = 0; i < SCENE.hitCallPerTick; i += 1) {
    const p = scatter(c.x, c.y, i + 80, tick, SCENE.clusterRadiusU * 1.2);
    out.push({ k: 'hc', id: world.ownId, x: p.x, y: p.y });
  }
  return out;
}

/** Hull hit flashes + burst rings: `boom` with `hit` drives render/ships.ts's
 *  130 ms flash (itself budget-gated), `burst` the fog-immune ring. */
function impactEvents(world: SceneWorld, tick: number): GameEvent[] {
  const near = world.hulls.filter((h) => !h.far);
  const out: GameEvent[] = [];
  for (let i = 0; i < SCENE.hullHitsPerTick && near.length > 0; i += 1) {
    const h = near[(tick + i * 3) % near.length];
    const p = hullPose(h, world, tick);
    out.push({ k: 'boom', id: `b${tick}_${i}`, hit: h.id, x: p.x, y: p.y });
  }
  const c = clusterCentre(world, tick);
  for (let i = 0; i < SCENE.burstsPerTick; i += 1) {
    const p = scatter(c.x, c.y, i + 120, tick, SCENE.clusterRadiusU * 2.2);
    out.push({ k: 'burst', id: `s${tick}_${i}`, x: p.x, y: p.y });
  }
  for (let i = 0; i < SCENE.smokePerTick && near.length > 0; i += 1) {
    const h = near[(tick * 2 + i * 5) % near.length];
    const p = hullPose(h, world, tick);
    out.push({ k: 'sm', x: p.x, y: p.y, tier: i % 2 === 0 ? 2 : 1 });
  }
  return out;
}

/**
 * Radar paint for the fogged far band — the scope's load under the same frame.
 *
 * `RETURN` GRAMMAR (SCENE_RADAR_GRAMMAR): a wire blip is a world-anchored
 * cell-rect plus a packed coverage mask, carrying NO identity — never the
 * `silhouette` grammar's id/pose payload. The mask comes from the SHIPPED
 * shaper (`paintCoverage`, the same function the server's blip row calls) at
 * the shipped lattice, so a staged echo and a real one are the same artifact by
 * construction; anything hand-rolled here would be a picture of a mask, not a
 * mask. Each paint is deliberately STALE by its own age, exactly as a real
 * sweep's paints are, and its `t` is the time it was painted at.
 */
function blipEvents(world: SceneWorld, tick: number, serverT: number): GameEvent[] {
  const far = world.hulls.filter((h) => h.far);
  return far.map((h, i) => {
    const age = (i * 7) % 40;
    const p = hullPose(h, world, tick - age);
    const t = serverT - age * SCENE_TICK_MS;
    const c = paintCoverage(h.cls, p.x, p.y, p.heading, CONFIG.vision.radarCellU, t);
    return { k: 'blip' as const, t, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
  });
}

/**
 * INBOUND TORPEDOES. Each fish is revealed once (its `torp` reveal) and then
 * corrected every tick with a `torpU`, which is exactly how a real run of fish
 * reaches the client; they close on the own hull and re-launch on a cycle so the
 * scene never runs out of them.
 */
function torpedoEvents(world: SceneWorld, tick: number, serverT: number): GameEvent[] {
  const own = ownPoseAt(world, tick);
  const cycle = 240; // ticks — 12 s run, then the salvo re-launches
  const out: GameEvent[] = [];
  for (let i = 0; i < SCENE.torpedoes; i += 1) {
    const local = (tick + i * 37) % cycle;
    const run = Math.floor((tick + i * 37) / cycle);
    const id = `t${i}_${run}`;
    const bearing = (i / SCENE.torpedoes) * Math.PI * 2 + run * 0.7;
    const speed = CONFIG.torpedo.speed;
    const dist = 620 - local * (speed * SCENE_TICK_MS) / 1000;
    const x = own.x + Math.cos(bearing) * dist;
    const y = own.y + Math.sin(bearing) * dist;
    const vx = -Math.cos(bearing) * speed;
    const vy = -Math.sin(bearing) * speed;
    if (local === 0) out.push({ k: 'torp', id, x, y, vx, vy, t: serverT });
    else if (dist > 0) out.push({ k: 'torpU', id, x, y, vx, vy, t: serverT });
  }
  return out;
}

/**
 * The public register + the economy: a kill-feed line on a churn schedule (one
 * of them carrying the kill leader's skull through `bty`), a banked level, an
 * own-damage aggregate, and a foghorn.
 */
function registerEvents(world: SceneWorld, tick: number): GameEvent[] {
  const out: GameEvent[] = [];
  if (tick % SCENE.sunkEveryTicks === 0) {
    const n = world.roster.length;
    const victim = world.roster[1 + ((tick / SCENE.sunkEveryTicks) % (n - 1))];
    const killerIdx = 1 + (((tick / SCENE.sunkEveryTicks) * 3 + 2) % (n - 1));
    const killer = world.roster[killerIdx];
    const bty = killer.id === world.bountyId ? ('k' as const) : victim.id === world.bountyId ? ('v' as const) : undefined;
    out.push(bty ? { k: 'sunk', id: victim.id, by: killer.id, seen: true, bty } : { k: 'sunk', id: victim.id, by: killer.id, seen: true });
  }
  if (tick % SCENE.pointEveryTicks === 0) out.push({ k: 'pt', id: world.ownId });
  if (tick % SCENE.ownDamageEveryTicks === 0) {
    const maxHp = CONFIG.shipClasses[OWN_CLASS].hp;
    out.push({ k: 'dmg', id: world.ownId, amount: 6, hp: Math.round(maxHp * SCENE.ownHpFrac) });
  }
  if (tick % SCENE.foghornEveryTicks === 0) out.push({ k: 'fh', h: 'standard', b: (tick * 0.13) % (Math.PI * 2), v: 6 });
  return out;
}

/** Every staged event for `tick`, in the order a real frame would carry them. */
export function sceneEvents(world: SceneWorld, tick: number, serverT: number): GameEvent[] {
  return [
    ...torpedoEvents(world, tick, serverT),
    ...gunneryEvents(world, tick),
    ...impactEvents(world, tick),
    ...blipEvents(world, tick, serverT),
    ...registerEvents(world, tick),
  ];
}

/**
 * The whole staged frame. `ackSeq` runs far ahead of any input the sampler could
 * have produced, so the predictor has no pending inputs to replay and the drawn
 * own pose IS the staged one — the scene must not wobble on local prediction.
 */
export function sceneFrame(world: SceneWorld, tick: number, serverT: number): FrameMsg {
  const frame: FrameMsg = {
    t: serverT,
    tick,
    ackSeq: tick + 1_000_000,
    you: sceneOwn(world, tick),
    contacts: sceneContacts(world, tick),
    events: sceneEvents(world, tick, serverT),
    mines: [],
  };
  if (tick % SCENE.deniedEveryTicks === 0) frame.denied = [{ slot: 1, reason: 'cooling', seq: tick }];
  return frame;
}

/**
 * The staged welcome handshake.
 *
 * `t` is a REAL server timestamp (`SCENE_EPOCH_MS + elapsed`), not the client's
 * `performance.now()` — see SCENE_EPOCH_MS for the defect that cost. The
 * ServerClock's offset therefore lands at −SCENE_EPOCH_MS and `serverNow()`
 * tracks the scene's stamps exactly: one clock, no skew to model.
 *
 * `radarGrammar` is SCENE_RADAR_GRAMMAR (`return`), which is the whole reason
 * this function lives in the pure half — the value that decides what the
 * capture is evidence ABOUT is pinned by a test, not buried in wiring.
 */
export function sceneWelcome(mapRadius: number, serverT: number): WelcomeMsg {
  return {
    sessionId: 'hc00',
    mapSeed: STAGE_MAP_SEED,
    mapRadius,
    playerCap: CONFIG.map.playerCap,
    t: serverT,
    config: CONFIG,
    radarGrammar: SCENE_RADAR_GRAMMAR,
    radarIdentity: 'roster',
  };
}

/** The zone + match plane of the room schema, in `publicState()`'s shape. */
export interface ScenePublicPlane {
  zoneState: string;
  zoneStartT: number;
  zoneCurCx: number;
  zoneCurCy: number;
  zoneCurR: number;
  zoneNextCx: number;
  zoneNextCy: number;
  zoneNextR: number;
  matchPhase: string;
  countdownEndT: number;
  winnerId: string;
  bountyId: string;
}

/**
 * The polled public plane for `serverNow`. `zoneStartT` is RE-SEATED every tick
 * so the timeline is pinned at `SCENE.zoneElapsedMs` — the capture is a still
 * life, not a race against a countdown, and the ring readout therefore reads the
 * same amber `RING CLOSES IN 0:05` in every capture.
 */
export function scenePublicPlane(world: SceneWorld, serverNow: number): ScenePublicPlane {
  return {
    zoneState: 'active',
    zoneStartT: serverNow - SCENE.zoneElapsedMs,
    zoneCurCx: world.ring.cur.cx,
    zoneCurCy: world.ring.cur.cy,
    zoneCurR: world.ring.cur.r,
    zoneNextCx: world.ring.next.cx,
    zoneNextCy: world.ring.next.cy,
    zoneNextR: world.ring.next.r,
    matchPhase: 'active',
    countdownEndT: 0,
    winnerId: '',
    bountyId: world.bountyId,
  };
}
