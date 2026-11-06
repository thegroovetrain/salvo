// THE TORPEDO LAUNCHERS AND MINE RACKS ON THE SHIP RECORD (Story 10.6, Eric
// 2026-11-05, R6 / R7 / R13 / R14 / R16 / R17 / R18, I3, epic-10 amendment 12)
// — the server's half of the two models in shared sim/launchers.ts and
// sim/racks.ts. The shared modules own every law (aim, pick, clocks, turn);
// this module owns WHEN the World calls them:
//
//   - LIFECYCLE: a ship's `launchers` / `racks` are EMPTY until its torpedo /
//     mine FAMILY SLOT is filled; they come up full when it fills (I3 —
//     everything arrives loaded) and again at every fresh life (`resetMounts`,
//     beside `resetBattery`).
//   - CARDS (`refitMounts`, from applyCard after the refold): a launcher, a
//     tube, a rack or an expanded seat a card adds arrives loaded (I3; an
//     EXPANDED seat arrives holding its mine), and every RUNNING tube / rack
//     clock is rescaled by the held weapon's new ÷ old folded reload (the
//     2026-08-04 progress-fraction rule) — a RELOAD card and the weapon's own
//     tier card alike.
//   - INSTANT RELOAD (`instantReloadMounts`, R14): every tube loads; every
//     short rack gains ONE mine.
//   - THE HOTBAR SUMMARY: the torpedo / mine slot's `{n, reloadMsLeft}` pair is
//     DERIVED from these (`launcherSummary` / `rackSummary`), exactly as the
//     main battery's slot 0 pair is from its turrets — so `OwnShip.ammo[slot]`
//     stays valid and every reader of a slot pool (a bot's "do I hold one")
//     keeps working. The generic per-round pool machine never runs on them.
//
// Pure adapter over a ShipRecord: no World reference, no I/O.

import {
  FAMILY_SLOT,
  initialLaunchers,
  initialRacks,
  instantReloadRacks,
  isMineEquipment,
  launcherAimPoint,
  launcherSummary,
  rackCapacity,
  rackSummary,
  reloadAllTubes,
  rescaleRackReloads,
  rescaleTubeReloads,
  resizeLaunchers,
  resizeRacksFor,
  stepLaunchers,
  tickRacks,
  isAfloat,
  type EffectiveStats,
  type EquipmentId,
  type LoadoutSlot,
  type MineEquipmentId,
  type RackBank,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';

/** The three torpedo lines — the torpedo FAMILY slot's members. */
export type TorpedoMountId = 'heavyTorpedo' | 'lightTorpedo' | 'supercavTorpedo';

const TORPEDO_IDS: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['heavyTorpedo', 'lightTorpedo', 'supercavTorpedo']);

/**
 * True for the ids whose slot pool is a SUMMARY of a mount model (every
 * torpedo and mine): the generic pool passes (applyCard's reconcilePools /
 * rescaleReloadTimers, INSTANT RELOAD's per-slot finish) skip them, because
 * the launchers / racks are the truth and `refitMounts` /
 * `instantReloadMounts` own them.
 */
export function isMountBacked(id: EquipmentId): boolean {
  return TORPEDO_IDS.has(id) || isMineEquipment(id);
}

/** A bank with no rack — what a ship holds until its mine slot fills. */
export function emptyRackBank(): RackBank {
  return { racks: [], next: 0 };
}

/** The torpedo the ship's torpedo FAMILY slot holds, or null. */
export function heldTorpedo(ship: Pick<ShipRecord, 'loadout'>): TorpedoMountId | null {
  const id = ship.loadout[FAMILY_SLOT.torpedo]?.equipmentId ?? null;
  return id !== null && TORPEDO_IDS.has(id) ? (id as TorpedoMountId) : null;
}

/** The mine the ship's mine FAMILY slot holds, or null. */
export function heldMine(ship: Pick<ShipRecord, 'loadout'>): MineEquipmentId | null {
  const id = ship.loadout[FAMILY_SLOT.mine]?.equipmentId ?? null;
  return isMineEquipment(id) ? id : null;
}

/** Write a summary pair onto a slot's pool (no-op on an empty slot). */
function writeSummary(slot: LoadoutSlot | undefined, sum: { n: number; reloadMsLeft: number }): void {
  if (slot?.state == null) return;
  slot.state.n = sum.n;
  slot.state.reloadMsLeft = sum.reloadMsLeft;
}

/** The torpedo slot's hotbar pair, re-derived from the launchers. */
export function syncTorpedoSlot(ship: ShipRecord): void {
  if (heldTorpedo(ship) === null) return;
  writeSummary(ship.loadout[FAMILY_SLOT.torpedo], launcherSummary(ship.launchers));
}

/** The mine slot's hotbar pair, re-derived from the racks. */
export function syncMineSlot(ship: ShipRecord): void {
  if (heldMine(ship) === null) return;
  writeSummary(ship.loadout[FAMILY_SLOT.mine], rackSummary(ship.racks));
}

/**
 * A FRESH LIFE'S MOUNTS (the `resetBattery` edges — spawn, redeploy,
 * respawn): launchers at rest with every tube loaded and every rack full,
 * for whatever the family slots hold (I3); empty for an empty slot.
 */
export function resetMounts(ship: ShipRecord): void {
  ship.launchers = heldTorpedo(ship) === null ? [] : initialLaunchers(ship.hullId, ship.stats);
  const mine = heldMine(ship);
  ship.racks = mine === null ? emptyRackBank() : initialRacks(ship.stats, mine);
  syncTorpedoSlot(ship);
  syncMineSlot(ship);
}

/** A positive finite new ÷ old reload ratio, or null when nothing moved. */
function reloadRatio(prev: EffectiveStats, next: EffectiveStats, id: EquipmentId): number | null {
  const oldMs = prev.equipment[id].reloadMs;
  const newMs = next.equipment[id].reloadMs;
  if (!Number.isFinite(oldMs) || oldMs <= 0 || oldMs === newMs) return null;
  return newMs / oldMs;
}

/** `refitMounts`' torpedo half. */
function refitLaunchers(ship: ShipRecord, prevStats: EffectiveStats): void {
  const id = heldTorpedo(ship);
  if (id === null) {
    ship.launchers = [];
    return;
  }
  // A slot filled by THIS card arrives from an empty array: every launcher
  // and tube is new, so all of it arrives loaded (I3).
  resizeLaunchers(ship.launchers, ship.hullId, ship.stats);
  const ratio = reloadRatio(prevStats, ship.stats, id);
  if (ratio !== null) rescaleTubeReloads(ship.launchers, ratio);
  syncTorpedoSlot(ship);
}

/** `refitMounts`' mine half. */
function refitRacks(ship: ShipRecord, prevStats: EffectiveStats): void {
  const id = heldMine(ship);
  if (id === null) {
    ship.racks = emptyRackBank();
    return;
  }
  if (ship.racks.racks.length === 0) ship.racks = initialRacks(ship.stats, id);
  else resizeRacksFor(ship.racks, prevStats, ship.stats, id);
  const ratio = reloadRatio(prevStats, ship.stats, id);
  if (ratio !== null) rescaleRackReloads(ship.racks, ratio);
  syncMineSlot(ship);
}

/**
 * AFTER A CARD (applyCard, after the refold and the slot effects): bring the
 * launchers and racks to the folded counts — new seats arrive loaded (I3) —
 * and rescale every running tube and rack clock by the held weapon's new ÷
 * old folded reload. The slot summaries are re-derived.
 */
export function refitMounts(ship: ShipRecord, prevStats: EffectiveStats): void {
  refitLaunchers(ship, prevStats);
  refitRacks(ship, prevStats);
}

/** INSTANT RELOAD's mount half (R14): every tube loaded, ONE mine per short rack. */
export function instantReloadMounts(ship: ShipRecord): void {
  reloadAllTubes(ship.launchers);
  const mine = heldMine(ship);
  if (mine !== null) {
    instantReloadRacks(ship.racks, rackCapacity(ship.stats, mine), ship.stats.equipment[mine].reloadMs);
  }
  syncTorpedoSlot(ship);
  syncMineSlot(ship);
}

/**
 * THE LAUNCHER STEP for one ship (the World's `stepLaunchers` STEP_ORDER row):
 * an AFLOAT hull's launchers chase the latest input's aim point (R13 — always,
 * like the turrets); a sinking or dead hull's HOLD their angles while the tube
 * clocks still run. A ship with no launcher steps nothing.
 */
export function stepShipLaunchers(ship: ShipRecord, dtMs: number): void {
  if (ship.launchers.length === 0) return;
  const aim = isAfloat(ship.lifecycle)
    ? launcherAimPoint(ship.state, ship.hullId, ship.input.aim, ship.input.aimDist)
    : null;
  stepLaunchers(ship.launchers, ship.hullId, ship.state, aim, dtMs);
}

/** One tick of the held mine's rack clocks (the mine row's `tick`). */
export function tickShipRacks(ship: ShipRecord, id: MineEquipmentId, dtMs: number): void {
  tickRacks(ship.racks, rackCapacity(ship.stats, id), ship.stats.equipment[id].reloadMs, dtMs);
}
