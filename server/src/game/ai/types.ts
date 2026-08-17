// COMBAT-BOT AI — the type seam (Story 6.4, wave 1; hardened at the review
// gate).
//
// Everything the ai/ module and its wave-2 siblings (profiles.ts, utility.ts,
// tactics.ts, spending.ts) build against lives here. Two contracts matter:
//
// 1. THE PERCEPTION BOUNDARY. A bot's world knowledge comes EXCLUSIVELY from
//    the fogged perception view World hands the driver as a bound per-bot
//    observe thunk (BotTickEntry.observe — called exactly once per live bot
//    per tick), plus a SELF-READ of its own hull (BotSelf below: its own
//    hp/ammo/reload/boons/offer — the bot's OwnShip equivalent). Never a
//    world collection, and never a lookup by id: ai/ is handed exactly its
//    own record and its own view, so it is STRUCTURALLY incapable of
//    addressing any other ship. The lint boundary in eslint.config.js bans
//    `world.js` outright (type imports included) and makes `perception.js`
//    type-only for this whole directory, so the structure is enforced, not
//    advisory — the UNFOGGED spectator view exported beside observe() cannot
//    even be imported here without failing the lint AND the import-surface
//    pin test in bots.test.ts (which refuses the very token anywhere in ai/).
//
// 2. THE NARROW WORLD PORT (`BotWorldPort` below). The driver's only handle
//    on the world for clock/map/ring reads and intent writes. World passes
//    ITSELF — it satisfies the interface structurally — but the driver stores
//    it AS the port type, and the port deliberately exposes NO ship store of
//    any kind, so nothing in ai/ can reach world internals without a visible,
//    reviewable widening of this interface.

import type {
  GameMap,
  HullId,
  Rng,
  ZoneRing,
  CONFIG,
  BoonOffer,
  EffectiveStats,
  LoadoutSlot,
  ShipState,
} from '@salvo/shared';
import type { PerceptionView } from '../perception.js';

/**
 * The six priority profiles (Eric ruling E1, 2026-08-16) — derived from
 * CONFIG.bots.profiles so the CONFIG tuning panel and this union can never
 * drift: adding a profile id there without a wave-2 behaviour table here
 * fails to type-check in profiles.ts's Record<BotProfileId, ...>.
 */
export type BotProfileId =
  (typeof CONFIG.bots.profiles)[keyof typeof CONFIG.bots.profiles][number];

/**
 * THE SELF-READ, AS A STRUCTURAL VIEW: everything the brain may know about its
 * OWN hull, and nothing else. World's ShipRecord satisfies this structurally
 * (world.ts hands the record itself in each tick's BotTickEntry), but ai/
 * speaks only this type — every field here is one a human client is sent
 * about its own ship (pose, hp, effective stats, loadout pools, economy) plus
 * the simulation's own grounding bit (which the owner's client can equally
 * derive from its collision feedback). Defined here from shared types alone
 * so ai/ needs no world.js import, type or value.
 */
export interface BotSelf {
  readonly state: ShipState;
  readonly hp: number;
  readonly stats: EffectiveStats;
  readonly loadout: readonly LoadoutSlot[];
  /** The sim's own "this hull is pressing into LAND" bit (map-edge press is
   *  deliberately NOT contact — cycle 59). The un-beach trip reads this,
   *  never a speed guess. */
  readonly landContact: boolean;
  readonly bankedLevels: number;
  readonly offer: BoonOffer | null;
  readonly boons: readonly string[];
}

/**
 * ONE BOT'S TICK ENTRY — built by world.ts every tick and handed to
 * BotController.tick(). The observe thunk is BOUND to this bot's id by
 * world.ts, so ai/ can capture a fogged view without ever holding a World or
 * choosing an observer: the injection is what makes the perception boundary
 * structural rather than disciplinary.
 */
export interface BotTickEntry {
  readonly id: string;
  /** isAfloat(lifecycle), computed by world.ts — a non-afloat bot goes
   *  silent and releases its per-life state. */
  readonly afloat: boolean;
  /** The bot's own record (see BotSelf). */
  readonly self: BotSelf;
  /** This bot's fogged perception view for THIS tick — perception.observe()
   *  bound to this bot's id by world.ts. Called exactly once per live bot per
   *  tick by the driver (observe() mutates per-observer reveal memory, so the
   *  call count is a pinned invariant, not a nicety). */
  observe(): PerceptionView;
}

/**
 * THE NARROW WORLD PORT — everything the bot driver needs from World beyond
 * its per-tick entries, and nothing else. World satisfies this structurally
 * and passes itself (world.ts constructs BotController beside
 * FleetController); the driver only ever stores it as this type.
 *
 * Deliberately absent: ANY ship store (a bot's own record arrives in its
 * BotTickEntry; everything else reaches it only through the fogged view),
 * `shells`, `mines`, `decoys`, `litZones`, events, other observers.
 */
export interface BotWorldPort {
  /** ms since world creation — the one server clock. */
  readonly now: number;
  /** The generated map: islands (avoidance/LOS context) + radius (boundary). */
  readonly map: GameMap;
  /** The LIVE storm ring — ring escape overrides all other steering (wave 2). */
  readonly zoneLiveRing: ZoneRing;
  /** THE BOARDING FREEZE (Story 6.1): false = the helm is dead. The brain
   *  no-ops — no observe, neutral input, fireSeq never advances. */
  readonly helmEnabled: boolean;
  /** THE ONE INTENT PATH: a complete InputMsg through the same validated
   *  store a human uses (full sanitizeInput, `fireT: 0`, no privileged
   *  setter). Returns false when the message was dropped. */
  submitInput(id: string, raw: unknown): boolean;
  /** THE ONE ECONOMY PATH: consume a banked level through the public spend
   *  entry point (a card index, or HEAL_CHOICE). At most one call per bot
   *  per tick; false is non-fatal. Driven by ai/spending.ts's doctrine-
   *  weighted pick policy + the healHpFrac rule. */
  spendPoint(id: string, rawChoice: unknown): boolean;
}

/** Posture is the one-word answer to "what am I doing this tick"; wave-3
 *  tactics turns it into throttle, rudder and trigger. Chosen on the DECISION
 *  cadence and cached on the mind between deliberations. */
export type BotPosture = 'engage' | 'pursue' | 'disengage' | 'reposition' | 'farm' | 'ringRun';

/**
 * A remembered contact — the decayed form of a live Contact or a radar blip
 * once it leaves the current view (CONFIG.bots.contactMemoryMs governs
 * expiry). Identity-optional by construction: a `return`-grammar blip carries
 * no id/class/heading/speed, so every field beyond position is nullable and
 * the brain must not crash on either grammar.
 *
 * Populated by ai/utility.ts from each observe() view; target scoring and
 * wave-3 tactics read these, never the view's raw arrays directly.
 *
 * THE LAST FOUR FIELDS WERE PROMOTED IN WAVE 3 (wave 2 asked for it in its
 * report). ai/utility.ts carried them on a `BotTrack extends RememberedContact`
 * and normalized every read through an `asTrack()` fallback, because a plain
 * wave-1 entry written by another wave would have been missing them. They are
 * part of one track record, not a second one: promoting them here makes
 * `BotTrack` a pure alias, deletes the fallback, and removes the only way the
 * two shapes could ever disagree.
 */
export interface RememberedContact {
  /** Roster/track id, or null (identity-free return-grammar blip). */
  id: string | null;
  /** Last-known position (u). */
  x: number;
  y: number;
  /** Last-known heading/speed, or null when the grammar carried none. */
  heading: number | null;
  speed: number | null;
  /** Server ms this contact was last seen/painted. */
  seenAt: number;
  /** True iff a live truesight `Contact` for this track was in the MOST
   *  RECENTLY FOLDED view — i.e. "I can see it right now", not "the last thing
   *  that refreshed it was truesight". `foldView` drops the flag on every
   *  track before folding and `foldContact` re-raises it, so it survives
   *  exactly one tick without a sighting. It shipped as a write-only flag
   *  nothing ever cleared, which made a plot last seen seven seconds ago read
   *  as visible to the cannon gate, to `freshness()` and to `flareTarget()`. */
  live: boolean;
  /** Hull class if the grammar disclosed one, else null (return blips are
   *  identity-free by ruling). Drives the rear-quarter mine-layer exception
   *  in wave-3 tactics and the participant-vs-fleet split below. */
  cls: HullId | null;
  /** True when the disclosed class is a PvE fleet hull rather than a
   *  participant. Unknown class = false (assume a captain: the safer read). */
  fleet: boolean;
  /** Server ms this track was FIRST acquired — the reaction gate's input.
   *  Survives every refresh; a forgotten-then-reacquired track starts over,
   *  which is correct (you did lose the plot). */
  firstSeenAt: number;
  /** Self-private Hit Calls that landed on this track — the ONLY damage
   *  estimate a bot can legitimately have (no hp, no severity, ever). */
  hits: number;
}

/**
 * Per-bot mind state, keyed by ship id in the BotController, created at
 * enroll() and released with the ship. Lives in ai/, NEVER on ShipRecord
 * (question-gate G7 — World stays clean).
 */
export interface BotMind {
  /** This bot's private decision stream (decorrelated per bot off the
   *  controller seed) — profile rolls, wave-2 scatter draws, waypoints. */
  rng: Rng;
  /** Monotonic input seq (InputStore requires strictly increasing). */
  seq: number;
  /** Monotonic click counter — advanced exactly when a shot is taken. */
  fireSeq: number;
  /** Monotonic ability-activation counter. */
  actSeq: number;
  /** The priority profile assigned at enroll off the seeded RNG. */
  profile: BotProfileId;
  /** Deliberation-stagger slot in [0, cadenceTicks) — botPhase(id,
   *  cadenceTicks). Staggers DECISION work, never perception. */
  phase: number;
  /** The latest perception view, or null before the first observe (and
   *  after lifecycle release). THE bot's whole world model — refreshed every
   *  live tick since the review-gate cadence fix. */
  view: PerceptionView | null;
  /** Server ms `view` was captured at; -1 = never observed. */
  viewAt: number;
  /** Contact memory across grammar gaps (ai/utility.ts is the only writer). */
  contacts: Map<string, RememberedContact>;
  /** THE DELIBERATED TARGET: the `contacts` key of the track chosen on the
   *  last decision tick, or null. Re-resolved against the live track store
   *  every tick (so steering/firing follow the track's freshest plot between
   *  deliberations); a pruned/sunk key resolves to no target until the next
   *  decision tick. */
  targetKey: string | null;
  /** THE DELIBERATED POSTURE, cached between decision ticks. Safety-critical
   *  steering never waits on it: ring escape and the un-beach manoeuvre are
   *  re-evaluated every tick inside tactics regardless of this value. */
  posture: BotPosture;
  /** ms of SUSTAINED LAND CONTACT accumulated toward arming the un-beach
   *  manoeuvre (CONFIG.bots.stuckMs). Reset by any tick out of contact. */
  stuckMs: number;
  /** Server ms the full-astern burst may run to AT MOST — its CEILING
   *  (CONFIG.bots.unbeachAsternMaxMs), 0 when not backing off. The burst
   *  normally ends earlier, on the clearance condition in ai/tactics.ts. */
  unbeachUntil: number;
  /** The rest of the un-beach manoeuvre's live state (see UnbeachState).
   *  ABSENT/null = sailing normally, which is exactly the state an enrolled
   *  mind starts in — the field is optional so enrollment stays the plain
   *  literal it is in botDriver.ts and this state can never be half-built. */
  unbeach?: UnbeachState | null;
}

/**
 * THE UN-BEACH MANOEUVRE'S LIVE STATE — one object rather than four loose
 * BotMind fields, because it is one two-stage machine: a full-astern BURST
 * with a captured rudder, then an EXIT-HEADING GRACE HOLD that commits to
 * whatever heading the burst finished on. `BotMind.unbeachUntil` is stage
 * one's clock (it is the field that predates the split); everything stage one
 * captured, plus the whole of stage two, lives here.
 */
export interface UnbeachState {
  /** The rudder held for the WHOLE burst, captured ONCE as it arms so the bow
   *  swings away from the blocking coast instead of flapping tick to tick.
   *  Already sign-corrected for sternway (see ai/tactics.ts asternRudder). */
  rudder: number;
  /** Where the hull stood when the burst armed — the datum the "has it made
   *  real sternway yet" test measures against (CONFIG.bots.unbeachClearU). */
  fromX: number;
  fromY: number;
  /** Server ms the exit-heading hold runs until, and the heading it commits
   *  to. Both 0 while the burst is still running: the hold is armed by the
   *  burst's last tick, which is the first moment an exit heading exists. */
  holdUntil: number;
  holdHeading: number;
}

/**
 * What the brain returns to the driver each tick — pure INTENT, folded into
 * a validated InputMsg (and at most one spendPoint call) by the driver, which
 * owns all emission. The wire fields the decision deliberately cannot touch:
 * `fireT` is always 0 (a server-driven shooter never back-dates), `hornSeq`
 * is always 0 (bots never honk — question-gate B5), and every seq is the
 * driver's bookkeeping, not the brain's.
 */
export interface BotDecision {
  /** -1..1 engine order. */
  throttle: number;
  /** -1..1 rudder. */
  rudder: number;
  /** rad — world-space firing bearing (only consumed when firing/aiming). */
  aim: number;
  /** u — aim-point distance along the bearing (gun burst point). */
  aimDist: number;
  /** Loadout slot to fire this tick, or null to hold fire. A non-null value
   *  advances the mind's fireSeq exactly once. */
  fireSlot: number | null;
  /** Loadout slot to activate (ability press), or null. A non-null value
   *  advances the mind's actSeq exactly once. */
  actSlot: number | null;
  /** Spend a banked level: an offer index, HEAL_CHOICE, or null for no spend.
   *  Only ever non-null on a deliberation tick (the decision cadence). */
  spendChoice: number | null;
}

/**
 * THE BRAIN SEAM — ai/tactics.ts implements this (composing ai/utility.ts
 * target/posture scoring, ai/profiles.ts priority tables and ai/spending.ts
 * boon policy). The driver calls decide() exactly once per live bot per tick,
 * AFTER the tick's observe, with:
 *   - `self`: the bot's own record (the sanctioned self-read — see BotSelf),
 *   - `mind`: its per-bot state (including the fresh view),
 *   - `port`: the narrow world port (clock, map, live ring),
 *   - `deliberate`: true on this bot's decision-cadence tick — the ONLY tick
 *     the brain may reselect its target, re-choose its posture or spend.
 *     Steering, avoidance, the un-beach machine and the trigger run every
 *     tick regardless (a bot that only steered every 5th tick would drive
 *     like a drunk). Defaults true so a single-decision test IS a
 *     deliberation.
 */
export interface BotBrain {
  decide(self: BotSelf, mind: BotMind, port: BotWorldPort, deliberate?: boolean): BotDecision;
}
