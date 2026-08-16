// COMBAT-BOT AI — the type seam (Story 6.4, wave 1).
//
// Everything the ai/ module and its wave-2 siblings (profiles.ts, utility.ts,
// tactics.ts, spending.ts) build against lives here. Two contracts matter:
//
// 1. THE PERCEPTION BOUNDARY. A bot's world knowledge comes EXCLUSIVELY from
//    `perception.observe(world, botId)` — at most once per bot per tick —
//    plus a SELF-READ of its own ShipRecord (its own hp/ammo/reload/boons/
//    offer: the bot's OwnShip equivalent). Never a world collection. The
//    lint boundary in eslint.config.js makes `world.js` a type-only import
//    for this whole directory, so the structure is enforced, not advisory.
//
// 2. THE NARROW WORLD PORT (`BotWorldPort` below). The driver's only handle
//    on the World for state reads and intent writes. World passes ITSELF —
//    it satisfies the interface structurally — but the driver stores it AS
//    the port type, so nothing in ai/ can reach world internals without a
//    visible, reviewable widening of this interface.

import type { GameMap, Rng, ShipClassId, ZoneRing, CONFIG } from '@salvo/shared';
import type { PerceptionView } from '../perception.js';
import type { ShipRecord } from '../world.js';

/**
 * The six priority profiles (Eric ruling E1, 2026-08-16) — derived from
 * CONFIG.bots.profiles so the CONFIG tuning panel and this union can never
 * drift: adding a profile id there without a wave-2 behaviour table here
 * fails to type-check in profiles.ts's Record<BotProfileId, ...>.
 */
export type BotProfileId =
  (typeof CONFIG.bots.profiles)[keyof typeof CONFIG.bots.profiles][number];

/**
 * SELF-READ ONLY: the one lookup the driver may make against the world's ship
 * store — its OWN record by id. Structurally satisfied by Map<string,
 * ShipRecord>, but typed to expose `.get` alone: no size, no iteration, no
 * scan. Reading ANOTHER ship's record through this would be a perception
 * bypass; the boundary tests stub the world collections to prove the brain
 * never notices.
 */
export interface BotSelfReader {
  get(id: string): ShipRecord | undefined;
}

/**
 * THE NARROW WORLD PORT — everything the bot driver needs from World, and
 * nothing else. World satisfies this structurally and passes itself
 * (world.ts constructs BotController beside FleetController); the driver
 * only ever stores it as this type.
 *
 * Deliberately absent: `ships` as an iterable, `shells`, `mines`, `decoys`,
 * `litZones`, events, other observers — all of that reaches a bot ONLY
 * through perception.observe()'s fogged view.
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
  /** Self-read of the bot's own ShipRecord (see BotSelfReader). */
  readonly ships: BotSelfReader;
  /** THE ONE INTENT PATH: a complete InputMsg through the same validated
   *  store a human uses (full sanitizeInput, `fireT: 0`, no privileged
   *  setter). Returns false when the message was dropped. */
  submitInput(id: string, raw: unknown): boolean;
  /** THE ONE ECONOMY PATH: consume a banked level through the public spend
   *  entry point (a card index, or HEAL_CHOICE). At most one call per bot
   *  per tick; false is non-fatal. TODO(wave-2 ai/spending.ts): the doctrine-
   *  weighted pick policy + the healHpFrac rule drive this. */
  spendPoint(id: string, rawChoice: unknown): boolean;
}

/**
 * A remembered contact — the decayed form of a live Contact or a radar blip
 * once it leaves the current view (CONFIG.bots.contactMemoryMs governs
 * expiry). Identity-optional by construction: a `return`-grammar blip carries
 * no id/class/heading/speed, so every field beyond position is nullable and
 * the brain must not crash on either grammar.
 *
 * TODO(wave-2 ai/utility.ts): populated from each observe() view; target
 * scoring reads these, never the view's raw arrays directly.
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
  /** True while backed by a live truesight Contact (vs a decaying blip). */
  live: boolean;
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
  /** Monotonic click counter — wave 1 never advances it (no fire); wave-2
   *  tactics advance it exactly when a shot is taken (the fleet precedent). */
  fireSeq: number;
  /** Monotonic ability-activation counter — wave 1 never advances it. */
  actSeq: number;
  /** The class hull this bot sails (fixed at enroll). */
  hullId: ShipClassId;
  /** The priority profile assigned at enroll off the seeded RNG. */
  profile: BotProfileId;
  /** Observe-stagger slot in [0, cadenceTicks) — botPhase(id, cadenceTicks). */
  phase: number;
  /** The latest perception view, or null before the first observe (and
   *  after lifecycle release). THE bot's whole world model. */
  view: PerceptionView | null;
  /** Server ms `view` was captured at; -1 = never observed. */
  viewAt: number;
  /** Contact memory across observe gaps. TODO(wave-2 ai/utility.ts). */
  contacts: Map<string, RememberedContact>;
  /** ms of commanding ahead while going nowhere (un-beach trip accumulator,
   *  CONFIG.bots.stuckMs). TODO(wave-2 ai/tactics.ts). */
  stuckMs: number;
  /** Server ms until which the un-beach manoeuvre runs (0 = not armed).
   *  TODO(wave-2 ai/tactics.ts). */
  unbeachUntil: number;
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
   *  advances the mind's fireSeq exactly once. TODO(wave-2 ai/tactics.ts). */
  fireSlot: number | null;
  /** Loadout slot to activate (ability press), or null. A non-null value
   *  advances the mind's actSeq exactly once. TODO(wave-2 ai/tactics.ts). */
  actSlot: number | null;
  /** Spend a banked level: an offer index, HEAL_CHOICE, or null for no spend.
   *  TODO(wave-2 ai/spending.ts). */
  spendChoice: number | null;
}

/**
 * THE BRAIN SEAM — wave 2 implements this (ai/tactics.ts composing
 * ai/utility.ts target/posture scoring, ai/profiles.ts priority tables and
 * ai/spending.ts boon policy); wave 1 plugs a neutral stand-in. The driver
 * calls decide() at most once per bot per tick, AFTER any due observe, with:
 *   - `self`: the bot's own ShipRecord (the sanctioned self-read),
 *   - `mind`: its per-bot state (including the latest view),
 *   - `port`: the narrow world port (clock, map, live ring — NEVER used by a
 *     conforming brain to read other ships; that is what `mind.view` is for).
 */
export interface BotBrain {
  decide(self: ShipRecord, mind: BotMind, port: BotWorldPort): BotDecision;
}
