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
// NEVER IN THE SHIPPED BUILD. Nothing in the shipped game imports this module;
// the sole reference is a dynamic import behind `import.meta.env.DEV ||
// __HC_PERF__` in main.ts. In `npm run build` Vite folds BOTH terms to `false`
// before Rollup runs, so the whole module is dropped from the bundle. See
// STAGE_MARKER.
//
// THE SECOND DOOR IS THE PERF BUILD (Story 7.1), not a widening of the first:
// `__HC_PERF__` is true only under `vite build --mode perf`, which writes to
// `dist-perf`. It exists because NFR1's verdict must be taken on a
// production-identical bundle (Eric ruling 2026-08-11) and the instrument used
// to live behind the dev gate alone.
//
// TWO POPULATIONS, ONE SCENE (Story 7.1). `READABILITY_PROFILE` is Story 4.8's
// ratified subject and is FROZEN; `NFR1_PROFILE` stages the frame budget's
// reference scenario. `/?stage=worstcase` with no `profile` parameter stages
// exactly the former, which is what keeps the 4.8 gate working unchanged.

import {
  CONFIG,
  SHIP_CLASS_IDS,
  mulberry32,
  paintCoverage,
  type Contact,
  type FrameMsg,
  type GameEvent,
  type HullId,
  type OwnShip,
  type ShipClassId,
  type WelcomeMsg,
  type ZoneRing,
} from '@salvo/shared';
import { isDroneHull } from '../render/ships.js';

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

/**
 * THE TWO SCENE PROFILES (Story 7.1). `readability` is Story 4.8's ratified
 * subject and its population is FROZEN; `nfr1` is the reference scenario the
 * frame budget is judged against.
 *
 * WHY A SECOND PROFILE RATHER THAN A BIGGER `SCENE`. `SCENE`'s counts are
 * reasoned against the ATTENTION ceiling — ~100x the ratified onset budget
 * inside ONE viewport region — and Story 4.8's gate is ratified on them.
 * NFR1's ceiling is a different one: the TOTAL entity population across the
 * whole viewport. Editing `SCENE` would silently re-take a ratified decision;
 * adding a profile takes neither.
 */
export type SceneProfileId = 'readability' | 'nfr1';

/**
 * One staged population.
 *
 * BOTH SHIPPED PROFILES POINT `scene` AT THE SAME `SCENE` OBJECT, deliberately.
 * The flash stack is already sized several times above anything the arena can
 * structurally produce (see SCENE), so re-inflating it for NFR1 would make the
 * frame-budget number a lie in the PESSIMISTIC direction — the one failure mode
 * that would let this story report a breach nobody could ever provoke. The field
 * exists so the knobs have exactly ONE reader per profile, not so they differ.
 */
export interface SceneProfile {
  id: SceneProfileId;
  /** The per-tick event knobs this profile stages with. */
  scene: typeof SCENE;
  /** Staged hulls BESIDES the local captain. */
  contacts: number;
  /** True when slot `i` is staged inside the truesight bubble. Everything else
   *  sits in the radar annulus and reaches the client as paint instead (see
   *  `blipEvents`). A PREDICATE rather than a count, so a profile can INTERLEAVE
   *  the two bands: NFR1's fleet hulls are the tail of the slot range, and a
   *  bare `i <= nearContacts` split would have put every one of them outside the
   *  bubble — no drone silhouette, no aggro bracket, no hull-hit flash, i.e. the
   *  cheap half of the picture measured as if it were the whole one. */
  near(i: number): boolean;
  /**
   * Ticks between radar paints of ONE far hull. 1 = every far hull paints every
   * tick, which is what Story 4.8's scene has always done and must keep doing.
   *
   * A REAL SWEEP DOES NOT DO THAT, and at NFR1's population the difference stops
   * being cosmetic: a hull paints once per revolution (15 rpm = 4 s = 80 ticks),
   * so 50 far hulls are ~0.6 paints/tick, not 50. Emitting one per hull per tick
   * would bury the scope in ~80x the phosphor a real match can hold and report a
   * frame cost no player could ever provoke.
   */
  blipStrideTicks: number;
  /** The hull staged in slot `i`. Slot 0 is the local captain. */
  hullFor(i: number): HullId;
}

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

/**
 * The staged hull id for scene slot `i` — ONE expression, read by both the hull
 * builder and the roster builder, because Story 5.6 made them disagree at their
 * peril: a PvE fleet hull holds NO roster row (amendment 39), so "which slots
 * are drones" is now a fact both sides have to answer identically.
 */
export function sceneHullFor(i: number): HullId {
  return CONTACT_HULLS[i % CONTACT_HULLS.length];
}

// `sceneSlotIsDrone(i)` USED TO LIVE HERE AND WAS DELETED (Story 7.1 review).
// It answered "is this slot a fleet hull" against the READABILITY hull cycle
// only, and once profiles arrived it became a public helper that returns the
// wrong answer for the `nfr1` profile while looking like the obvious one to
// reach for. Its own docstring warned that these two sides "disagree at their
// peril". Use `slotIsDrone(profile, i)` below, which cannot be asked the
// question without naming the profile it is about.

/** The same question against an arbitrary profile — the form every internal
 *  reader uses. Slot 0 is always the local captain and is never a fleet hull. */
function slotIsDrone(profile: SceneProfile, i: number): boolean {
  return i > 0 && isDroneHull(profile.hullFor(i));
}

/** The local captain's class. */
export const OWN_CLASS: ShipClassId = 'battleship';

/**
 * STORY 4.8's RATIFIED POPULATION — 12 near + 7 far contacts around the local
 * captain, hulls cycled off CONTACT_HULLS, every far hull painting every tick.
 * The default everywhere, so no pre-7.1 call site changes behaviour.
 */
export const READABILITY_PROFILE: SceneProfile = {
  id: 'readability',
  scene: SCENE,
  contacts: Math.min(CONFIG.map.playerCap - 1, SCENE.nearContacts + SCENE.farContacts),
  near: (i) => i <= SCENE.nearContacts,
  blipStrideTicks: 1,
  hullFor: sceneHullFor,
};

/**
 * NFR1's REFERENCE SCENARIO, derived from CONFIG rather than written down: a
 * FULL arena of contestants plus the PEAK concurrent PvE fleet.
 *
 * `playerCap` is 20, so 19 rival captains ride slots 1..19 and the local captain
 * is slot 0 — twenty contestants, the number NFR1 names. Fleet hulls follow on
 * slots 20+.
 */
const NFR1_CAPTAIN_SLOTS = CONFIG.map.playerCap;

/** One PvE fleet group's hulls, in `CONFIG.fleet.composition` proportion
 *  (1 large : 2 medium : 3 small = the six-hull half-fleet Eric ruled is the
 *  spawn unit). Built from CONFIG so a composition retune moves the staged
 *  fleet with it. */
const FLEET_GROUP: readonly HullId[] = [
  ...Array<HullId>(CONFIG.fleet.composition.large).fill('droneLarge'),
  ...Array<HullId>(CONFIG.fleet.composition.medium).fill('droneMedium'),
  ...Array<HullId>(CONFIG.fleet.composition.small).fill('droneSmall'),
];

/**
 * The PEAK CONCURRENT fleet population — the largest single wave, not the sum
 * of the schedule. `CONFIG.fleet.waves` spawns 8 groups at 1:00, 4 at 5:00 and
 * 2 at 9:00; at six hulls a group that is 48 / 24 / 12, and the waves are
 * spaced minutes apart precisely so the field is thinned between them. 48 is
 * therefore the number a frame can actually be asked to draw.
 */
const NFR1_FLEET_HULLS =
  FLEET_GROUP.length * CONFIG.fleet.waves.reduce((peak, w) => Math.max(peak, w.fleets), 0);

/**
 * NEAR/FAR INTERLEAVE for the NFR1 profile: every 4th slot sits inside the
 * truesight bubble.
 *
 * FOUR IS THE AREA RATIO, not a feel number. The bubble is `sight` (330u) and
 * the scope reaches `radar` (660u), so the bubble is (330/660)² = one QUARTER
 * of the disc a uniformly-spread population occupies — a quarter near, three
 * quarters in the annulus. Taking every 4th slot also mixes captains and fleet
 * hulls into both bands, which is the point of using a stride at all.
 */
const NFR1_NEAR_STRIDE = 4;

/** Ticks per radar revolution at the shipped sweep rate — how often ONE far
 *  hull legitimately paints. 15 rpm ⇒ 4 s ⇒ 80 ticks at the 20 Hz sim rate. */
const SWEEP_REVOLUTION_TICKS = Math.round(60_000 / CONFIG.vision.sweepRpm / SCENE_TICK_MS);

/**
 * THE NFR1 POPULATION PROFILE (Story 7.1) — 20 contestants + the 48-hull peak
 * PvE fleet = 68 hulls, sharing SCENE's flash stack and torpedo salvo.
 *
 * Reached at `/?stage=worstcase&profile=nfr1`; the readability gate's own URL
 * (no `profile`) is untouched.
 */
export const NFR1_PROFILE: SceneProfile = {
  id: 'nfr1',
  scene: SCENE,
  contacts: NFR1_CAPTAIN_SLOTS - 1 + NFR1_FLEET_HULLS,
  near: (i) => (i - 1) % NFR1_NEAR_STRIDE === 0,
  blipStrideTicks: SWEEP_REVOLUTION_TICKS,
  hullFor: (i) =>
    i < NFR1_CAPTAIN_SLOTS
      ? SHIP_CLASS_IDS[i % SHIP_CLASS_IDS.length]
      : FLEET_GROUP[(i - NFR1_CAPTAIN_SLOTS) % FLEET_GROUP.length],
};

/** Every profile by id — the selector's table (see `sceneProfile`). */
const PROFILES: Readonly<Record<SceneProfileId, SceneProfile>> = {
  readability: READABILITY_PROFILE,
  nfr1: NFR1_PROFILE,
};

/**
 * Resolve a profile from a raw query-string value.
 *
 * AN UNKNOWN STRING FALLS BACK TO THE READABILITY PROFILE and warns, rather
 * than throwing or staging nothing: this is a measurement door, and a typo in a
 * capture script must degrade to the ratified scene (which is at least a scene)
 * instead of a blank page nobody can diagnose. An ABSENT value is the ordinary
 * Story 4.8 case and warns about nothing.
 */
export function sceneProfile(raw: string | null | undefined): SceneProfile {
  if (raw === null || raw === undefined || raw === '') return READABILITY_PROFILE;
  const hit = Object.prototype.hasOwnProperty.call(PROFILES, raw) ? PROFILES[raw as SceneProfileId] : undefined;
  if (hit) return hit;
  console.warn(`[stage] unknown scene profile "${raw}" — falling back to the readability profile`);
  return READABILITY_PROFILE;
}

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
  /** Story 5.6: this hull has acquired the local captain, so its contact rows
   *  carry the self-private `aggro` mark and it wears the bracket. */
  aggro: boolean;
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
  /** The population this world was built from. Carried on the world so every
   *  frame builder DEFAULTS to it: a world staged with one profile and framed
   *  with another would disagree about which hulls are near and how often the
   *  scope paints, which is exactly the two-derivations class this codebase
   *  refuses everywhere else. */
  profile: SceneProfile;
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
 * The roster: the local captain plus every RIVAL CAPTAIN slot — and NOTHING
 * ELSE.
 *
 * STORY 5.6 (amendment 39): a PvE fleet hull is not a roster member, so the
 * slots staging drone hulls contribute no row at all. The scene keeps its drone
 * CONTACTS (the greyscale chevrons are part of what the readability gate has to
 * show) while the roster shrinks around them, which is exactly the shape the
 * arena now has — and it is what makes the chrome bar's AFLOAT count exercise
 * its captains-only rule, since AFLOAT is now simply the roster's live rows.
 *
 * The kill leader carries the highest kill count, which is the count `bountyId`
 * agrees with.
 */
function buildRoster(profile: SceneProfile, count: number): SceneRosterRow[] {
  const rows: SceneRosterRow[] = [];
  for (let i = 0; i < count; i += 1) {
    if (slotIsDrone(profile, i)) continue;
    rows.push({
      id: hullId(i),
      name: callsign(i),
      color: i % 20,
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
function buildHull(i: number, rng: () => number, profile: SceneProfile): SceneHull {
  const far = !profile.near(i);
  const band = far ? 400 + rng() * 180 : 60 + rng() * 180;
  const bearing = rng() * Math.PI * 2;
  return {
    id: hullId(i),
    cls: profile.hullFor(i),
    cx: Math.cos(bearing) * band,
    cy: Math.sin(bearing) * band,
    radiusU: 18 + rng() * 46,
    phase: rng() * Math.PI * 2,
    // ~1 lap per 12-30s at 20 Hz — visible motion, so every hull lays wake.
    rateRadPerTick: (0.008 + rng() * 0.012) * (rng() < 0.5 ? -1 : 1),
    far,
    // Every NEAR fleet hull is hunting us, so the readability gate sees the
    // aggro bracket stacked with every other channel rather than in isolation.
    // A FAR one is not: at radar range you hold no hull view to hang a bracket
    // on, which is the honest picture of what amendment 40 actually renders.
    aggro: !far && slotIsDrone(profile, i),
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

/** Build the staged world. Pure and total: same (seed, mapRadius, profile) ⇒
 *  same world. */
export function buildSceneWorld(
  mapRadius: number,
  seed: number = STAGE_SEED,
  profile: SceneProfile = READABILITY_PROFILE,
): SceneWorld {
  const stream = mulberry32(seed);
  const rng = (): number => stream.next();
  const total = profile.contacts;
  // Slot 0 is the local captain, so the roster scan spans one more slot than
  // there are contacts. Fleet slots contribute no row (amendment 39) and are
  // skipped inside buildRoster.
  const roster = buildRoster(profile, total + 1);
  const ownStart = { x: 0, y: 0 };
  const hulls: SceneHull[] = [];
  for (let i = 1; i <= total; i += 1) hulls.push(buildHull(i, rng, profile));
  return {
    profile,
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
  // THE AGGRO BRACKET is a channel the readability gate has to see stacked with
  // everything else (Story 5.6, amendment 40), so every NEAR fleet hull in the
  // scene is hunting us. `aggro` is self-private on the wire and this scene is
  // always the local captain's own frame, so setting it here is exactly what a
  // real server would send this observer.
  return h.aggro ? { id: h.id, x, y, heading, speed, cls: h.cls, aggro: true } : { id: h.id, x, y, heading, speed, cls: h.cls };
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
export function bankedPointsAt(tick: number, profile: SceneProfile = READABILITY_PROFILE): number {
  return 1 + Math.floor(tick / profile.scene.pointEveryTicks) % 3;
}

/** The staged own ship for `tick`. hp sits in the CRIMSON band by construction. */
export function sceneOwn(world: SceneWorld, tick: number): OwnShip {
  const s = world.profile.scene;
  const p = ownPoseAt(world, tick);
  const maxHp = CONFIG.shipClasses[OWN_CLASS].hp;
  return {
    id: world.ownId,
    x: p.x,
    y: p.y,
    heading: p.heading,
    speed: p.speed,
    hp: Math.round(maxHp * s.ownHpFrac),
    alive: true,
    ammo: [
      { n: 1, reloadMsLeft: 0 },
      { n: 0, reloadMsLeft: 4200 },
      { n: 2, reloadMsLeft: 0 },
      null,
    ],
    sweep: (tick * 0.06) % (Math.PI * 2),
    cls: OWN_CLASS,
    pts: bankedPointsAt(tick, world.profile),
    offer: ['intelSweep', 'torpedoSpeed', 'cannonDamage'],
    boostUntil: 0,
    boons: [],
    lvl: 4 + Math.floor(tick / s.pointEveryTicks),
    xp: (tick % s.pointEveryTicks) / s.pointEveryTicks,
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
  const off = world.profile.scene.clusterOffsetU;
  return { x: p.x + Math.cos(p.heading) * off, y: p.y + Math.sin(p.heading) * off };
}

/**
 * THE FLASH STACK: muzzle flashes, fall-of-shot splashes and Hit Calls, all
 * inside one tight cluster so a single viewport region is asked for far more
 * than three onsets a second. `muzzleColocated` of the muzzles share ONE exact
 * point, which is the coalescer's input (one draw, one charge) as distinct from
 * the window's (the fourth onset onward degrades).
 */
function gunneryEvents(world: SceneWorld, tick: number): GameEvent[] {
  const s = world.profile.scene;
  const c = clusterCentre(world, tick);
  const out: GameEvent[] = [];
  for (let i = 0; i < s.muzzlePerTick; i += 1) {
    const p = i < s.muzzleColocated ? c : scatter(c.x, c.y, i, tick, s.clusterRadiusU);
    out.push({ k: 'mz', x: p.x, y: p.y });
  }
  for (let i = 0; i < s.splashPerTick; i += 1) {
    const p = scatter(c.x, c.y, i + 40, tick, s.clusterRadiusU * 1.6);
    out.push({ k: 'sp', id: world.ownId, x: p.x, y: p.y });
  }
  for (let i = 0; i < s.hitCallPerTick; i += 1) {
    const p = scatter(c.x, c.y, i + 80, tick, s.clusterRadiusU * 1.2);
    out.push({ k: 'hc', id: world.ownId, x: p.x, y: p.y });
  }
  return out;
}

/** Hull hit flashes + burst rings: `boom` with `hit` drives render/ships.ts's
 *  130 ms flash (itself budget-gated), `burst` the fog-immune ring. */
function impactEvents(world: SceneWorld, tick: number): GameEvent[] {
  const s = world.profile.scene;
  const near = world.hulls.filter((h) => !h.far);
  const out: GameEvent[] = [];
  for (let i = 0; i < s.hullHitsPerTick && near.length > 0; i += 1) {
    const h = near[(tick + i * 3) % near.length];
    const p = hullPose(h, world, tick);
    out.push({ k: 'boom', id: `b${tick}_${i}`, hit: h.id, x: p.x, y: p.y });
  }
  const c = clusterCentre(world, tick);
  for (let i = 0; i < s.burstsPerTick; i += 1) {
    const p = scatter(c.x, c.y, i + 120, tick, s.clusterRadiusU * 2.2);
    out.push({ k: 'burst', id: `s${tick}_${i}`, x: p.x, y: p.y });
  }
  for (let i = 0; i < s.smokePerTick && near.length > 0; i += 1) {
    const h = near[(tick * 2 + i * 5) % near.length];
    const p = hullPose(h, world, tick);
    out.push({ k: 'sm', x: p.x, y: p.y, tier: i % 2 === 0 ? 2 : 1 });
  }
  return out;
}

/**
 * Radar paint for the fogged far band — the scope's load under the same frame.
 *
 * A wire blip is a world-anchored cell-rect plus a packed coverage mask,
 * carrying NO identity. The mask comes from the SHIPPED
 * shaper (`paintCoverage`, the same function the server's blip row calls) at
 * the shipped lattice, so a staged echo and a real one are the same artifact by
 * construction; anything hand-rolled here would be a picture of a mask, not a
 * mask. Each paint is deliberately STALE by its own age, exactly as a real
 * sweep's paints are, and its `t` is the time it was painted at.
 *
 * THE STRIDE IS WHY THE NFR1 PROFILE'S SCOPE IS A MEASUREMENT AND NOT A FICTION
 * (Story 7.1). Story 4.8's profile paints EVERY far hull EVERY tick — fine at 7
 * hulls, and preserved byte-for-byte at `blipStrideTicks === 1`. At NFR1's 50
 * far hulls it would lay ~80x the phosphor a real sweep can produce, because a
 * hull only paints when the beam crosses its bearing: once per revolution. Above
 * 1 the stride spreads the far band over one revolution — hull `i` paints on the
 * ticks where `(tick + i) % stride === 0` — so the scope holds the paint count a
 * player can actually provoke.
 */
function blipEvents(world: SceneWorld, tick: number, serverT: number): GameEvent[] {
  const stride = world.profile.blipStrideTicks;
  const out: GameEvent[] = [];
  const far = world.hulls.filter((h) => h.far);
  for (let i = 0; i < far.length; i += 1) {
    if (stride > 1 && (tick + i) % stride !== 0) continue;
    const h = far[i];
    const age = (i * 7) % 40;
    const p = hullPose(h, world, tick - age);
    const t = serverT - age * SCENE_TICK_MS;
    const c = paintCoverage(h.cls, p.x, p.y, p.heading, CONFIG.vision.radarCellU, t);
    out.push({ k: 'blip' as const, t, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits });
  }
  return out;
}

/**
 * INBOUND TORPEDOES. Each fish is revealed once (its `torp` reveal) and then
 * corrected every tick with a `torpU`, which is exactly how a real run of fish
 * reaches the client; they close on the own hull and re-launch on a cycle so the
 * scene never runs out of them.
 */
function torpedoEvents(world: SceneWorld, tick: number, serverT: number): GameEvent[] {
  const s = world.profile.scene;
  const own = ownPoseAt(world, tick);
  const cycle = 240; // ticks — 12 s run, then the salvo re-launches
  const out: GameEvent[] = [];
  for (let i = 0; i < s.torpedoes; i += 1) {
    const local = (tick + i * 37) % cycle;
    const run = Math.floor((tick + i * 37) / cycle);
    const id = `t${i}_${run}`;
    const bearing = (i / s.torpedoes) * Math.PI * 2 + run * 0.7;
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
  const s = world.profile.scene;
  const out: GameEvent[] = [];
  if (tick % s.sunkEveryTicks === 0) {
    const n = world.roster.length;
    const victim = world.roster[1 + ((tick / s.sunkEveryTicks) % (n - 1))];
    const killerIdx = 1 + (((tick / s.sunkEveryTicks) * 3 + 2) % (n - 1));
    const killer = world.roster[killerIdx];
    const bty = killer.id === world.bountyId ? ('k' as const) : victim.id === world.bountyId ? ('v' as const) : undefined;
    out.push(bty ? { k: 'sunk', id: victim.id, by: killer.id, seen: true, bty } : { k: 'sunk', id: victim.id, by: killer.id, seen: true });
  }
  if (tick % s.pointEveryTicks === 0) out.push({ k: 'pt', id: world.ownId });
  if (tick % s.ownDamageEveryTicks === 0) {
    const maxHp = CONFIG.shipClasses[OWN_CLASS].hp;
    out.push({ k: 'dmg', id: world.ownId, amount: 6, hp: Math.round(maxHp * s.ownHpFrac) });
  }
  if (tick % s.foghornEveryTicks === 0) out.push({ k: 'fh', h: 'standard', b: (tick * 0.13) % (Math.PI * 2), v: 6 });
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
  if (tick % world.profile.scene.deniedEveryTicks === 0) frame.denied = [{ slot: 1, reason: 'cooling', seq: tick }];
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
 */
export function sceneWelcome(mapRadius: number, serverT: number): WelcomeMsg {
  return {
    sessionId: 'hc00',
    mapSeed: STAGE_MAP_SEED,
    mapRadius,
    playerCap: CONFIG.map.playerCap,
    t: serverT,
    config: CONFIG,
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
    zoneStartT: serverNow - world.profile.scene.zoneElapsedMs,
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
