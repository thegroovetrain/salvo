// Mine activation + trigger resolution — the mine Equipment row.
// A mine is a STATIC point in world state (not a ballistic): PLACED at the
// clicked point by a click-aimed WEAPON activation (Story 2.8, amendment 45 —
// the fireSeq channel; supersedes the 1.8 instant stern drop): the click must
// lie within the REAR placement sector (heading + CONFIG.mine.offset ±
// placeHalfArcDeg — sim/arcs.ts, the single arc-shape source) AND within
// CONFIG.mine.placeRange of the ship; a bad aim is an 'out-of-arc' denial
// (nothing consumed). The mine arms after armDelay, then TRIPS when any
// NON-OWNER live hull silhouette comes within the OWNER's effective
// triggerRadius of it. A trip detonates as a BLAST (Eric ruling 2026-07-22):
// every non-owner hull silhouette within the owner's effective blastRadius
// takes the owner's effective damage (mineBlastVictims below — the owner is
// ALWAYS excluded, the universal AoE convention), with one boom at the mine
// point; chains cascade in the World into every armed non-captive mine in
// range WHOEVER LAID IT (amendment 18, superseding amendment 46's same-owner
// rule). MINES HAVE NO CAP AT ALL (Story 8.4, FR57/AR48): the per-player
// `maxLive` board cap with its silent oldest-eviction and the defensive global
// cap are both DELETED — a mine exists until it is triggered or destroyed, and
// shooting one is the sanctioned way to clear it (amendment 16). Mines never
// radar-paint; their per-observer visibility is contact-like (the `mine`
// signal row).
//
// THREE KINDS, ONE CHASSIS (Story 8.13, epic-8 amendments 76/81). NAVAL,
// CAPTIVE and FOULING MINES are three EQUIPMENT LINES over the same rack: the
// same rear sector, the same 150 u leash, the same 3000 ms arm delay, the same
// blocked-water refusal. They differ in their own rows' numbers and in what
// the trip does, and `mineLine` below builds all three from that one body.
//
// THE KIND RIDES THE MINE, NOT THE OWNER. Until 8.13 `captive` and
// `propFouling` were DOCTRINE flags on the naval row, so a refit converted a
// whole field already on the water and "which kind is this" was a read of the
// layer's live stats. With three racks fittable at once that answer is no
// longer unique, so the kind is stamped on `MineState` at drop and every
// reader keys off it — while every NUMBER still comes from the owner's live
// row for that kind (`MINE_ROW_ID`), with the vacated-owner CONFIG fallback.
//
// CAPTIVE MINES (Story 7-5 wave 2, R2.12-R2.14) change the TRIP and what
// follows it, and nothing else. A captive mine is immune to shells, bursts and
// chains (R2.18, re-affirmed by amendment 16), NEVER detonates on contact, and
// trips only on a HOSTILE (R2.13: an enemy captain or bot, or a fleet drone
// whose CURRENT acquired target is the layer; a neutral drone may sail straight
// over it) — answering by LAUNCHING its one torpedo and expending itself.
//
// FOULING MINES (amendment 81) detonate exactly as a naval mine does, for a
// fixed 10 hp over a much larger blast, and SLOW every victim: `slowFactor` x
// both speed caps for CONFIG.foulingMines.slowDurationMs, REFRESH-NOT-STACK.
// A NAVAL MINE NEVER FOULS any more — the PROP FOULING add-on is deleted.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  blockedWater,
  mineTriggerRadius,
  burstVictims,
  hullSilhouette,
  inArc,
  mineEquipmentFor,
  mineKindOf,
  pointPolygonDistance,
  sectorArcFor,
  transformPolygon,
  wrapAngle,
  type Island,
  type MineEquipmentId,
  type MineKind,
  type Target,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

/** A dropped mine. Server-owned; synced to clients as contact-like MineView. */
export interface MineState {
  id: string;
  ownerId: string;
  x: number; // u
  y: number; // u
  armedAt: number; // ms — server time it becomes live (drop time + armDelay)
  /**
   * WHICH LINE LAID IT (Story 8.13, epic-8 amendments 76/81). The kind is
   * STAMPED AT DROP from the laying slot's equipment id and never changes:
   * one hull may now hold naval, captive AND fouling racks at once, so "which
   * kind is this mine" can no longer be answered by reading the OWNER's
   * doctrine (the pre-8.13 rule, where refitting converted a whole field).
   *
   * Every runtime number still comes from the OWNER's live row FOR THIS KIND,
   * with the CONFIG base as the vacated-owner fallback — so a laid trap tracks
   * its layer's tier exactly as it always did, and an orphan keeps no dead
   * build's numbers. The kind is the only per-mine field.
   */
  kind: MineKind;
}

/** The three MINE LINE ids — the EquipmentId subset whose stat row is an
 *  `EffectiveMine`. Narrow on purpose: a reader indexing `stats.equipment`
 *  with one of these gets the mine row back without a cast.
 *
 *  A THIN ALIAS of the shared `MineEquipmentId` since Story 8.13: the list
 *  lives in `sim/arcs.ts` (the rear placement sector is what makes these ids
 *  one family) and the server keeps the local name its callers already
 *  import. */
export type MineLineId = MineEquipmentId;

/** The EQUIPMENT ROW each mine kind reads its live numbers from — the ONE
 *  mapping, so no reader re-derives it from a string. A thin re-expression of
 *  the shared `mineEquipmentFor` (Story 8.13), kept because `world.ts` reads
 *  it as a table (`MINE_ROW_ID[kind]`) at two hot sites. */
export const MINE_ROW_ID: Readonly<Record<MineKind, MineLineId>> = Object.freeze({
  naval: mineEquipmentFor('naval'),
  captive: mineEquipmentFor('captive'),
  fouling: mineEquipmentFor('fouling'),
});

/** The VACATED-OWNER trip ring for one kind — the CONFIG base a mine falls
 *  back to when its layer has left the room. Naval and fouling derive 2/3 of
 *  their own base blast (the shared `mineTriggerRadius`); the captive's trip
 *  ring is its own tier-I literal (amendment 84d). */
export function configTriggerRadius(kind: MineKind): number {
  if (kind === 'captive') return CONFIG.captiveMines.triggerRadius;
  if (kind === 'fouling') return mineTriggerRadius(CONFIG.foulingMines.blastRadius);
  return CONFIG.mine.triggerRadius;
}

/** A mine that triggered this tick, with the ship that set it off. The
 *  `captive` flag is GONE (Story 8.13): the answer is `mine.kind === 'captive'`
 *  — a per-mine fact stamped at drop, not a doctrine read off the owner. */
export interface MineTrigger {
  mine: MineState;
  victimId: string;
}

/**
 * The per-owner policy `checkMineTriggers` resolves each mine against. Injected
 * (rather than read off a World here) so the row stays pure: the World supplies
 * the owner-stats lookups and the aggro read, tests supply whatever they mean.
 */
export interface MineTripRules {
  /** The owner's EFFECTIVE trip ring (u) for THIS mine's kind — the row
   *  `MINE_ROW_ID[kind]` names, with the vacated-owner CONFIG fallback. */
  triggerRadius(ownerId: string, kind: MineKind): number;
  /**
   * CAPTIVE-ONLY (R2.13, Eric): is `victimId` HOSTILE to `ownerId`? An enemy
   * captain or bot always is; a fleet drone is hostile ONLY while its CURRENT
   * acquired target is the mine's owner, so a drone that breaks off becomes
   * safe to sail past again. NEVER consulted for a naval or fouling mine —
   * those still trip on ANY non-owner hull, drones included.
   */
  hostile(ownerId: string, victimId: string): boolean;
}

/** The CONFIG-base policy: each kind's base trip ring, everyone hostile. The
 *  default for direct callers (tests). */
const CONFIG_TRIP_RULES: MineTripRules = {
  triggerRadius: (_ownerId, kind) => configTriggerRadius(kind),
  hostile: () => true,
};

/**
 * THE TRIP SCAN'S TARGET SET, PER MINE KIND (cycle-148 review gate, P4).
 *
 * Every mine line authors its own `hits` mask, and one hull may hold all three
 * racks — so the scan cannot take a single collected list and call it "the
 * hulls". It takes a per-kind lookup instead, which the World backs with its
 * memoized `hitTargets(mask)`: identical masks resolve to the identical array,
 * so the three kinds cost exactly as much as the distinct masks among them (one
 * collection today, since all three are hull-only).
 */
export type MineTripHulls = (kind: MineKind) => readonly Target[];

/**
 * Add a mine to the world store. NO CAP OF ANY KIND (Story 8.4, FR57/AR48):
 * `ownMineCount`, `oldestOwnMine`, the per-player `maxLive` eviction branch,
 * the `globalCap` eviction branch and the `maxLive` parameter are all DELETED.
 * A mine now exists until it is triggered or destroyed, so a laid trap is never
 * silently taken off the water by the act of laying another one. The only
 * bound left is pools x reloads; the 500-live-mine perf pin is what holds that
 * honest, not a ceiling. Returns the new mine. Exported for tests + the World
 * drop closure.
 */
export function addMine(
  mines: Map<string, MineState>,
  ownerId: string,
  x: number,
  y: number,
  now: number,
  id: string,
  kind: MineKind = 'naval',
): MineState {
  const mine: MineState = { id, ownerId, x, y, armedAt: now + CONFIG.mine.armDelay, kind };
  mines.set(id, mine);
  return mine;
}

// The mine's ratified REAR placement sector (Story 2.8, amendment 45): the
// shared arcFor family is the single arc-shape source, so the enforced sector
// can never drift from what the client classifies/renders. Resolved at module
// load — a non-sector mine arc is a CONFIG/arcs authoring error, failed loudly
// at boot (sectorArcFor throws), never mid-tick.
const REAR_SECTOR = sectorArcFor('navalMines');

/** The clicked placement point: along the aim bearing at the clicked distance
 *  (never negative), measured from the ship CENTER — "place the mine AT the
 *  clicked point" (amendment 45). Range/arc validity is the row's job. */
export function minePlacePoint(ship: ShipRecord): Vec2 {
  const dist = Math.max(0, ship.input.aimDist);
  return {
    x: ship.state.x + Math.cos(ship.input.aim) * dist,
    y: ship.state.y + Math.sin(ship.input.aim) * dist,
  };
}

/**
 * Is a placement/drop point ILLEGAL water (Story 1.10 'blocked')? True when
 * the point lands inside any island circle or outside the water disk. The mine
 * AND decoy rows both refuse a blocked point WITHOUT consuming anything (charge
 * + reload kept), so the previously silent wasted-charge failure becomes an
 * explicit 'blocked' denial. The rule itself now lives in shared sim/aim.ts
 * (blockedWater) because the client's mine-placement preview draws its blocked
 * tell off the same predicate; this stays as the row's named seam.
 */
export function dropBlocked(p: Vec2, islands: readonly Island[], mapRadius: number): boolean {
  return blockedWater(p, islands, mapRadius);
}

/**
 * The first hull that trips `mine`: a non-owner silhouette within `radius`
 * (pointPolygonDistance — 0 inside, concave-safe), scanned in hull order.
 * `hostile` is the CAPTIVE-ONLY gate (null for every other mine): a hull it
 * refuses is SKIPPED, not returned — the scan continues, so a neutral drone
 * sitting on a captive mine never masks the enemy captain right behind it.
 */
function firstTripper(
  mine: MineState,
  hulls: readonly Target[],
  radius: number,
  hostile: ((victimId: string) => boolean) | null,
): string | null {
  for (const hull of hulls) {
    if (hull.id === mine.ownerId) continue; // owner never trips its own mine
    if (hostile !== null && !hostile(hull.id)) continue; // captive: not a target
    if (pointPolygonDistance(mine, hull.poly) <= radius) return hull.id;
  }
  return null;
}

/**
 * Mines that trigger this tick against the given (post-move) hull silhouette
 * polygons: any armed mine within its OWNER's effective trigger radius of a
 * qualifying non-owner polygon. `rules` is the World's owner-stats lookup with
 * the vacated-owner CONFIG fallback (Story 2.8) plus, since Story 7-5 wave 2,
 * the CAPTIVE doctrine read and its hostile gate (R2.13). One victim per mine
 * (the first qualifying ship found). Pure — the World deletes the mine and
 * resolves the detonation or the launch.
 *
 * `hulls` IS PER KIND (cycle-148 review gate, P4 — see `MineTripHulls`): each
 * mine is scanned against the target set ITS OWN row's `hits` mask collects,
 * not against one list gathered for the naval rack.
 */
export function checkMineTriggers(
  mines: Map<string, MineState>,
  hulls: MineTripHulls,
  now: number,
  rules: MineTripRules = CONFIG_TRIP_RULES,
): MineTrigger[] {
  const triggers: MineTrigger[] = [];
  for (const mine of mines.values()) {
    if (now < mine.armedAt) continue; // still arming
    const hostile =
      mine.kind === 'captive' ? (victimId: string) => rules.hostile(mine.ownerId, victimId) : null;
    const victimId = firstTripper(
      mine,
      hulls(mine.kind),
      rules.triggerRadius(mine.ownerId, mine.kind),
      hostile,
    );
    if (victimId !== null) triggers.push({ mine, victimId });
  }
  return triggers;
}

/**
 * The BLAST membership for one detonating mine (Story 1.8): every hull whose
 * silhouette lies within `blastRadius` of the mine point (the OWNER's
 * effective blast radius as of Story 2.8 — the World threads it in with the
 * vacated-owner CONFIG fallback) — OWNER EXCLUDED, enemies AND drones alike,
 * full damage each (the World applies it). Reuses the shared burstVictims
 * silhouette-in-radius rule (the gun/starShells AoE precedent), so mine blasts
 * and shell bursts can never diverge on what "inside the blast" means. Pure —
 * the World deletes the mine and resolves damage/booms.
 *
 * Takes a POINT + owner rather than a MineState (Story 7-5 wave 2): the CAPTIVE
 * MINE's torpedo blasts on the same rule at its IMPACT point, where no mine
 * exists any more. A MineState still satisfies the parameter unchanged.
 */
export function mineBlastVictims(
  mine: { x: number; y: number; ownerId: string },
  hulls: readonly Target[],
  blastRadius: number = CONFIG.mine.blastRadius,
): Target[] {
  return burstVictims(mine, blastRadius, hulls, mine.ownerId);
}

/**
 * THE CAPTIVE MINE'S TORPEDO (Story 7-5 wave 2, R2.12). A captive mine NEVER
 * detonates on contact: it holds ONE torpedo on the HEAVY fish's hull — the
 * family's speed, hit radius and target mask (amendment 82 leaves speed alone)
 * — fired along `dir` (the World's lead solution) from the mine's own point.
 * The mine is EXPENDED on fire.
 *
 * ITS HOMING IS A TIER STAT (Eric ruling 2026-09-19, amendment 82): the
 * CAPTIVE row's `homingTurnRate` is 0 at tier I and steps +0.075 to 0.3 rad/s
 * at tier V. At zero the fish is a straight-runner with no steering and no
 * die-distance; above zero it takes the FAMILY's acquire range and the
 * FAMILY's total-travel budget, exactly as a launched fish does (the one
 * rule, `equipment/torpedoCore.ts`, applied here by hand because this fish is
 * spawned from a mine point rather than a hull).
 *
 * ...AND ITS LOCK IS THE TRIPPING HULL, PINNED (cycle-148 review gate, P6):
 * `targetId` is the victim the hostile gate cleared, and `locked` stops the
 * fish re-acquiring anybody else for the rest of its run.
 *
 * IT IS THE GAME'S ONE CONTACT-BLAST PROJECTILE, and it says so entirely through
 * its per-projectile hit rule (the Story 1.4 seam — nothing about a projectile's
 * behaviour lives outside its ShellState): point-less (`targetX === null`, so it
 * is contact-only to stepShell and never seeks a burst point) yet carrying a
 * non-zero `burstRadius`, a combination NO other projectile in the game has —
 * every ordinary torpedo sets 0 there, and every burster carries a target point.
 * `contactBlastRadius` below reads exactly that, so the World needs no side
 * table, no extra ShellState field and no cleanup path that a reset or a spent
 * shell could leak through.
 *
 * `damage`/`blastRadius`/`homingTurnRate` arrive from the OWNER's effective
 * CAPTIVE MINES row at LAUNCH time; the World re-reads damage and blast at
 * detonation exactly as a mine blast does (a vacated owner falls back to
 * CONFIG). The captive's burst is FIXED at 32 u and never steps (amendment
 * 84d), so the trap's reach grows with the line but the bang does not.
 */
export function captiveTorpedo(
  id: string,
  mine: MineState,
  dir: number,
  now: number,
  p: { damage: number; blastRadius: number; homingTurnRate: number; targetId: string },
): ShellState {
  const homes = p.homingTurnRate > 0;
  const shell: ShellState = {
    id,
    ownerId: mine.ownerId,
    // AR44: the captive's fish is a TORPEDO — hulls and decoys. It runs under
    // a minefield exactly as a launched torpedo does.
    hits: CONFIG.torpedo.hits,
    x: mine.x,
    y: mine.y,
    vx: Math.cos(dir) * CONFIG.torpedo.speed,
    vy: Math.sin(dir) * CONFIG.torpedo.speed,
    // A straight-runner runs until impact; only a STEERING fish carries the
    // family's finite travel budget (an orbiting fish must die).
    distLeft: homes ? CONFIG.torpedo.homingMaxRangeU : Number.POSITIVE_INFINITY,
    bornAt: now,
    kind: 'torp',
    damage: p.damage,
    hitRadius: CONFIG.torpedo.hitRadius,
    targetX: null,
    targetY: null,
    burstRadius: p.blastRadius,
    contactDamage: p.damage,
  };
  // THE LOCK IS PINNED AT LAUNCH (cycle-148 review gate, P6): this fish was
  // fired at the ONE hull that tripped the mine and cleared the hostile gate
  // (R2.13), so it must never re-acquire. A neutral fleet drone drifting nearer
  // mid-run would otherwise steal a trap it was never allowed to spring — and
  // the gate cannot be re-run in flight, because `steerHoming` is pure shared
  // sim with no idea what a drone's current aggro is. See `ShellState.homing`.
  if (homes) {
    shell.homing = {
      turnRate: p.homingTurnRate,
      acquireRange: CONFIG.torpedo.homingAcquireRange,
      targetId: p.targetId,
      locked: true,
    };
  }
  return shell;
}

/** The CONTACT-BLAST radius of a spent projectile, or 0 if it is not one: a
 *  point-less projectile carrying a burst radius detonates AT ITS IMPACT POINT
 *  rather than dealing plain contact damage (see `captiveTorpedo`, its only
 *  producer). Reading the hit rule off the projectile is what keeps the rule
 *  with the projectile. */
export function contactBlastRadius(shell: ShellState): number {
  return shell.targetX === null && shell.burstRadius > 0 ? shell.burstRadius : 0;
}

/** The world-space hull target for a ship pose (test/inspection convenience —
 *  the sim itself builds targets in World.aliveHulls with per-ship scratch). */
export function hullFor(ship: ShipRecord): Target {
  const s = ship.state;
  return { id: ship.id, kind: 'hull', poly: transformPolygon(hullSilhouette(ship.hullId), s.x, s.y, s.heading) };
}

/**
 * ONE MINE LINE'S Equipment row — the shared chassis, built three times
 * (Story 8.13). A click-aimed WEAPON since Story 2.8 (amendment 45, isWeapon
 * true via the shared flag): activation rides the fireSeq click channel with
 * the D1-validated fireT (armedAt = fireT + armDelay). Checks in the torpedo's
 * arc-first order, nothing consumed on a denial: the click must lie in the
 * REAR sector (heading + offset ± placeHalfArcDeg) AND within
 * CONFIG.mine.placeRange — either miss is 'out-of-arc' (the aim-denial
 * channel, per the amendment ruling); a clicked point inside a rock / off the
 * water is 'blocked' (Story 1.10); an empty pool is 'no-ammo'. The drop ammo
 * pool is the ONLY mine bound since Story 8.4 deleted the live-board cap.
 *
 * EVERY CHASSIS FIELD IS SHARED AND READ FROM `CONFIG.mine` — the rear sector,
 * the 150 u leash and the 3 s arm delay are the naval rack's, deliberately not
 * restated per line (the CONFIG blocks say so). Only pool size and reload come
 * from THIS line's own effective row, and the kind is what the drop stamps.
 */
function mineLine(id: MineLineId): Equipment {
  const kind = mineKindOf(id);
  return {
    id,
    isWeapon: EQUIPMENT_IS_WEAPON[id], // shared weapon/ability split — single source
    tick(ship, slot, dtMs): void {
      const row = ship.stats.equipment[id];
      tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
    },
    activate(ctx, slot) {
      const ship = ctx.ship;
      const center = wrapAngle(ship.state.heading + REAR_SECTOR.offset); // astern-centered
      if (!inArc(ship.input.aim, center, REAR_SECTOR.halfArc)) return { ok: false, reason: 'out-of-arc' };
      // Out-of-RANGE shares the aim-denial channel (amendment 45 ruling): the
      // click names a point the rack cannot reach — same "bad aim" grammar.
      if (ship.input.aimDist > CONFIG.mine.placeRange) return { ok: false, reason: 'out-of-arc' };
      const p = minePlacePoint(ship);
      if (dropBlocked(p, ctx.islands, ctx.mapRadius)) return { ok: false, reason: 'blocked' }; // nothing consumed
      if (!consume(slot.state!, ship.stats.equipment[id].reloadMs)) return { ok: false, reason: 'no-ammo' }; // pool empty
      ctx.dropMine(p.x, p.y, kind);
      return { ok: true };
    },
  };
}

/** NAVAL MINES — the contact rack (the shipped mine under its v3 id). */
export const mineEquipment: Equipment = mineLine('navalMines');

/** CAPTIVE MINES (catalog-v3 R25) — the moored torpedo launcher. */
export const captiveMineEquipment: Equipment = mineLine('captiveMines');

/** FOULING MINES (epic-8 amendment 81) — minimal damage, wide blast, a slow. */
export const foulingMineEquipment: Equipment = mineLine('foulingMines');
