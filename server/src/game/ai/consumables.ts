// THE CONSUMABLE AXIS (epic-8 amendment 49, "the belt" until Story 9.2) — one
// bot tactic row per consumable line.
//
// A stocked consumable slot (5-10, one fixed slot per kind since Story 9.2) is
// a fitted slot like any other: tactics.ts ranks
// it by `slotAppetite` and resolves it through `tacticFor`. `CONSUMABLE_TACTICS`
// is TOTAL over ConsumableId — a new line cannot land without a bot row (the
// compiler refuses the record) — and deep-frozen. Every row is the rule a bot
// fires by (Eric ruling R9, 2026-09-30); no row reads anything the bot's own
// record, its mind or its folded situation does not already carry.
//
// Every want() here is AFLOAT-guarded (a sinking hull presses nothing the
// server would refuse anyway), draws no rng and writes nothing.

import { CONFIG, isAfloat, sectorArcFor, type ConsumableId } from '@salvo/shared';
import type { BotMind, BotSelf } from './types.js';
import { hasPersistence, type BotTrack } from './utility.js';
import {
  APPETITE_NEUTRAL,
  TORPEDO_CREDIBLE_U,
  burstOnLiveContact,
  damageCutCues,
  deepFreezeRows,
  nearestLiveAstern,
  nearestLiveInSight,
  sectorPlacement,
  solveTorpedoShot,
  type ConsumableTactic,
  type TacticContext,
} from './tacticKit.js';
import { torpedoInbound } from './torpedoThreat.js';

/** The DECOY BUOY's placement sector — the mine's astern sector verbatim
 *  (sectorArcFor('decoyBuoy') IS the mine's descriptor, Story 8.16). */
const DECOY_SECTOR = sectorArcFor('decoyBuoy');

// ---------------------------------------------------------------------------
// HULL REPAIR — pressed under the profile's healHpFrac.
// ---------------------------------------------------------------------------

const hullRepairTactic: ConsumableTactic = {
  id: 'hullRepair',
  kind: 'ability',
  // Never pulls the engagement band: healing is not a reach.
  reachU: () => 0,
  // TWO THINGS THE BARE `hp / maxHp` READ GETS WRONG:
  //
  //   * THE PAID POOL IS HP ALREADY BOUGHT. `repairHp` is the last copy's
  //     second 50 hp, landing over 5 s. Reading `hp` alone reads the hull
  //     mid-payment, so a bot that fires at 120/350 sees 170 on the next tick
  //     and fires again for hp already on its way — a three-deep stack gone
  //     inside one pool's lifetime. Counting the pool asks the only question
  //     worth asking: where will this hull BE?
  //   * A SINKING HULL IS THE HUNGRIEST OF ALL. It reads 0/350 and the row
  //     would press every tick, at a slot the server always refuses (no hp
  //     comes back in the window — amendment 10). The driver drops non-afloat
  //     bots before they decide; this is the tactic's own guard, so a caller
  //     that reaches the brain another way cannot resurrect the behaviour.
  //
  // The threshold is the profile's `healHpFrac` — the same HURT read the card
  // scorer uses.
  want: (ctx) =>
    isAfloat(ctx.self.lifecycle) &&
    ctx.sit.maxHp > 0 &&
    (ctx.sit.hp + ctx.self.repairHp) / ctx.sit.maxHp < ctx.sit.profile.healHpFrac,
  // Abilities ride the actSeq channel and solve no shot.
  solve: () => null,
};

// ---------------------------------------------------------------------------
// SUPERCAV TORPEDO — the belt's torpedo.
// ---------------------------------------------------------------------------

/**
 * The torpedo tactic with three substitutions and nothing else (epic-8
 * amendments 74/79): the bow ±15° sector, the 195 u/s lead, and the
 * straight-runner's credible range (it never homes, so the gate never widens).
 * A stack has no stat row, so the speed comes from CONFIG exactly as the
 * server's row reads it.
 */
const supercavTorpedoTactic: ConsumableTactic = {
  id: 'supercavTorpedo',
  kind: 'shot',
  reachU: () => TORPEDO_CREDIBLE_U,
  want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
  solve: (ctx) =>
    solveTorpedoShot(ctx, 'supercavTorpedo', CONFIG.supercavTorpedo.speed, TORPEDO_CREDIBLE_U),
};

// ---------------------------------------------------------------------------
// SHIELD BLOCK, MULTI-SPECTRAL COUNTERMEASURE, DECOY BUOY — each rule reuses a cue
// another row already acts on.
// ---------------------------------------------------------------------------

/** Is this bot's own SHIELD BLOCK still up? A self-read of the one seat its
 *  owner is told about (`OwnShip.shield`). */
function shieldUp(self: BotSelf, now: number): boolean {
  const s = self.shield;
  return s !== undefined && s !== null && s.hpLeft > 0 && now < s.until;
}

/**
 * Could one of this bot's OWN countermeasure clouds still be alive? A press
 * stamps `cloudUntil = now + lifeMs` (the world keeps the stamp after the
 * cloud expires and zeroes it only at a life boundary), so every own cloud
 * is gone once `now >= cloudUntil`. An undefined or 0 stamp means nothing is
 * running. (`cloudUntil` arrives on the mind, copied by the driver.)
 */
function ownCloudRunning(mind: BotMind, now: number): boolean {
  const until = mind.cloudUntil;
  if (until === undefined || until === 0) return false;
  return now < until;
}

/** SHIELD BLOCK — pressed on the DAMAGE CUT cues, never over a shield already
 *  up (a second copy would REPLACE it, wasting the first's remainder). */
const shieldBlockTactic: ConsumableTactic = {
  id: 'shieldBlock',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx) => isAfloat(ctx.self.lifecycle) && !shieldUp(ctx.self, ctx.sit.now) && damageCutCues(ctx),
  solve: () => null,
};

/**
 * MULTI-SPECTRAL COUNTERMEASURE (Story 9.3 — SMOKE SCREEN's seat) — pressed on
 * the way OUT (the disengage posture), NEVER while one of the bot's own
 * clouds is still up (Eric ruling R12, 2026-09-30: "never while one of your
 * own is running — bad play"; supersedes R8's once-per-retreat bookkeeping).
 * No posture-edge state: a retreat that outlives its cloud may press again
 * once it has expired, and a posture flicker (storm-edge dodge, heal pop-up)
 * cannot re-arm it early.
 */
const countermeasureTactic: ConsumableTactic = {
  id: 'countermeasure',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx: TacticContext) =>
    isAfloat(ctx.self.lifecycle) &&
    ctx.posture === 'disengage' &&
    !ownCloudRunning(ctx.mind, ctx.sit.now),
  solve: () => null,
};

/** DECOY BUOY — dropped dead astern at the full placeRange (the mine's rear
 *  sector, the same sector-centre construction) when a seen enemy torpedo is
 *  inbound: a float behind you for the homing fish to find first. */
const decoyBuoyTactic: ConsumableTactic = {
  id: 'decoyBuoy',
  kind: 'placement',
  reachU: () => CONFIG.mine.placeRange,
  want: (ctx) => isAfloat(ctx.self.lifecycle) && torpedoInbound(ctx.self, ctx.mind, ctx.sit.now),
  solve: (ctx) => sectorPlacement(ctx, DECOY_SECTOR, CONFIG.mine.placeRange),
};

/**
 * FOULING SHELL (`foulingShell`, Story 9.4 — FLASH SHELLS' seat) — a 'shot'
 * row that PRIMES and FIRES one copy at a live contact in sight, afloat only,
 * on BOTH postures (Eric ruling 2026-10-12, epic-9 amendment 65 — one row,
 * two cues, no own-zone bookkeeping):
 *   ENGAGING  → the nearest live contact in sight (the flash's old rule:
 *               stall the target);
 *   DISENGAGING → the nearest live contact in sight that lies ASTERN of the
 *               bot — behind the beam, more than 90° off its heading (pin
 *               the chaser); nothing astern, no press.
 * The zone slows the bot too if it sails back through it; the row does not
 * track that (amendment 65). Stock is the slot's own `n` (firePass's
 * readiness gate); reach is the shell's own dial (`CONFIG.foulingShell.rangeU`,
 * Story 9.8 ruling 125), which is what the row's clamp uses server-side.
 */
const foulingShellTactic: ConsumableTactic = {
  id: 'foulingShell',
  kind: 'shot',
  reachU: () => CONFIG.foulingShell.rangeU,
  want: (ctx) => isAfloat(ctx.self.lifecycle) && foulingShellTarget(ctx) !== null,
  solve: (ctx) => burstOnLiveContact(ctx, CONFIG.foulingShell.rangeU, foulingShellTarget(ctx)),
};

/** The FOULING SHELL's target under the bot's posture (amendment 65), or
 *  null: engage → nearest live in sight; disengage → nearest live in sight
 *  astern; any other posture → none. */
function foulingShellTarget(ctx: TacticContext): BotTrack | null {
  if (ctx.posture === 'engage') return nearestLiveInSight(ctx);
  if (ctx.posture === 'disengage') return nearestLiveAstern(ctx);
  return null;
}

/** DEPTH CHARGE — the line is an undealt stub (its mechanism is unbuilt), so
 *  its row never fires. */
const depthChargeTactic: ConsumableTactic = {
  id: 'depthCharge',
  kind: 'ability',
  reachU: () => 0,
  want: () => false,
  solve: () => null,
};

// ---------------------------------------------------------------------------
// THE TABLES
// ---------------------------------------------------------------------------

/** The consumable half of the tactic registry — TOTAL over ConsumableId. */
export const CONSUMABLE_TACTICS: Readonly<Record<ConsumableId, ConsumableTactic>> = deepFreezeRows({
  hullRepair: hullRepairTactic,
  supercavTorpedo: supercavTorpedoTactic,
  shieldBlock: shieldBlockTactic,
  countermeasure: countermeasureTactic,
  decoyBuoy: decoyBuoyTactic,
  foulingShell: foulingShellTactic,
  depthCharge: depthChargeTactic,
});

/**
 * HOW EAGER A BOT IS ABOUT ONE BELT LINE. A profile says nothing about
 * consumables at fire time, so the table is TOTAL over ConsumableId at the SAME
 * neutral base an unlisted equipment sits at — which keeps the ranking stable
 * and the tie-break on slot index (the consumable slots are always to the
 * right of the weapons, so a consumable never displaces a weapon the bot already reached
 * for).
 */
const CONSUMABLE_APPETITE: Readonly<Record<ConsumableId, number>> = Object.freeze({
  hullRepair: APPETITE_NEUTRAL,
  shieldBlock: APPETITE_NEUTRAL,
  countermeasure: APPETITE_NEUTRAL,
  decoyBuoy: APPETITE_NEUTRAL,
  depthCharge: APPETITE_NEUTRAL,
  supercavTorpedo: APPETITE_NEUTRAL,
  foulingShell: APPETITE_NEUTRAL,
});

/** How eager any bot is about one belt line. */
export function consumableAppetite(id: ConsumableId): number {
  return CONSUMABLE_APPETITE[id];
}
