// THE TWO COOLDOWN ABILITIES' PER-SHIP NUMBERS (Story 10.6, Eric 2026-11-05,
// R8 / R9 / R15) — HULL REPAIR on `C` and SMOKE on `V` became card-improvable
// with the HULL REPAIR and SMOKE SCREEN ladders (SHIP kind, five cards each),
// so their numbers left CONFIG for the stats tree: `EffectiveStats.repair` and
// `EffectiveStats.smoke`, seeded here from the CONFIG bases, stepped by the
// cards through the ordinary stat fold, and DERIVED here — the one home for
// "what does a HULL REPAIR / SMOKE SCREEN card buy". Both sides read the
// folded numbers off `ship.stats`; nothing recomputes them from CONFIG.
//
// THE LAWS, Eric's words:
//   HULL REPAIR (R8) — "+20 at once and +20 over time per card"; the pool
//     window is FIXED at every card count (R15); cooldown base 75 s, "each
//     card +5 to a fixed score of 100": 75 × 100 ÷ (100 + 5 × cards).
//   SMOKE SCREEN (R9) — cooldown 60 s on the same rule ("Make it +5 Reload
//     for both Hull Repair and Smoke"); life 15 s + 1 s a card; "each card
//     about 10 % larger, and TODAY's size (150 → 300 u) is the TWO-card size".
//   "The ship's RELOAD is never applied" to either.
//
// THE "+5 TO A FIXED SCORE OF 100" IS A STAT. Each ability carries its own
// `reload` score, seeded at `CONFIG.index.base` (the "fixed score of 100") and
// stepped +5 a card by its ladder, and the cooldown is the ONE haste law
// (`reloadCooldownScale`, sim/indexStats.ts) over that score — the same
// function every weapon's reload runs, never a second formula. The SIZE is a
// 1-based `sizeRung` (1 = no card — the broadside `spreadRung` precedent, so
// every whitelisted stat stays strictly positive) from which the disc is
// derived by REPEATED multiply / divide anchored at `sizeAnchorCards` — no
// transcendental, so the anchor size is CONFIG's r0 / r1 byte for byte.
//
// Every derivation here is IDEMPOTENT in the authored fields (reads a score or
// rung, writes a derived field, never the reverse), so both re-pin homes may
// call it. Pure, zero I/O. Imports CONFIG and the EffectiveStats TYPE only.

import { CONFIG } from '../constants.js';
import { reloadCooldownScale } from './indexStats.js';
import type { EffectiveStats } from './stats.js';

/**
 * HULL REPAIR's per-ship numbers (R8 / R15). `reload`, `instantHp` and
 * `regenHp` are what a card writes; `regenMs` is the fixed pool window and
 * `cooldownMs` is DERIVED.
 */
export interface RepairStats {
  reload: number; // the ability's own haste score — CONFIG.index.base + 5 a card (never the ship's RELOAD)
  instantHp: number; // hp restored at the press (clamped to maxHp by the caller)
  regenHp: number; // hp the regen pool is SET to at the press, paid over regenMs
  regenMs: number; // ms — the pool's payout window, FIXED at every card count (R15)
  cooldownMs: number; // ms — DERIVED: CONFIG.hullRepair.cooldownMs × haste(reload)
}

/**
 * SMOKE's per-ship numbers (R9) — what a press STAMPS on its cloud (I6).
 * `reload`, `sizeRung` and `lifeMs` are what a card writes; `r0`, `r1` and
 * `cooldownMs` are DERIVED.
 */
export interface SmokeStats {
  reload: number; // the ability's own haste score — CONFIG.index.base + 5 a card (never the ship's RELOAD)
  sizeRung: number; // 1-based: 1 + SMOKE SCREEN cards held
  lifeMs: number; // ms a cloud made now lives
  r0: number; // u — the disc radius at birth — DERIVED from sizeRung
  r1: number; // u — the disc radius at the end of life — DERIVED from sizeRung
  cooldownMs: number; // ms — DERIVED: CONFIG.countermeasure.cooldownMs × haste(reload)
}

/** HULL REPAIR at zero cards — the CONFIG base, with the derived cooldown. */
export function baseRepairStats(): RepairStats {
  const h = CONFIG.hullRepair;
  return { reload: CONFIG.index.base, instantHp: h.instantHp, regenHp: h.regenHp, regenMs: h.regenMs, cooldownMs: h.cooldownMs };
}

/** SMOKE at zero cards — the CONFIG base, every derived field derived. */
export function baseSmokeStats(): SmokeStats {
  const c = CONFIG.countermeasure;
  const smoke: SmokeStats = { reload: CONFIG.index.base, sizeRung: 1, lifeMs: c.lifeMs, r0: 0, r1: 0, cooldownMs: 0 };
  deriveSmoke(smoke);
  return smoke;
}

/** The most card steps the size law will walk — a PLUMBING guard against a
 *  malformed rung (an injected catalog), far past the ladder's cap of 5. */
const MAX_SIZE_STEPS = 64;

/**
 * × on the CONFIG disc for a ship holding `cards` SMOKE SCREEN cards:
 * exactly 1 at `CONFIG.countermeasure.sizeAnchorCards`, × `sizeStepPerCard`
 * for each card above it and ÷ it for each card below — REPEATED multiply /
 * divide, never a power (the cloud code's no-transcendentals posture).
 * A non-finite or negative count reads as zero cards; the walk is bounded by
 * `MAX_SIZE_STEPS`.
 */
export function smokeSizeScale(cards: number): number {
  const { sizeStepPerCard: step, sizeAnchorCards: anchor } = CONFIG.countermeasure;
  const n = Number.isFinite(cards) ? Math.min(MAX_SIZE_STEPS, Math.max(0, Math.floor(cards))) : 0;
  let scale = 1;
  for (let k = anchor; k < n; k += 1) scale *= step;
  for (let k = n; k < anchor; k += 1) scale /= step;
  return scale;
}

/** A whole number ≥ `floor` (non-finite → `floor`). */
const wholeAtLeast = (v: number, floor: number): number => (Number.isFinite(v) ? Math.max(floor, Math.floor(v)) : floor);

/** SMOKE's derived fields from its score and rung, in place. */
function deriveSmoke(smoke: SmokeStats): void {
  const c = CONFIG.countermeasure;
  const scale = smokeSizeScale(smoke.sizeRung - 1);
  smoke.r0 = c.r0 * scale;
  smoke.r1 = c.r1 * scale;
  smoke.cooldownMs = c.cooldownMs * reloadCooldownScale(smoke.reload);
}

/**
 * Write every ability-DERIVED field from the authored ones, in place: both
 * cooldowns (the haste law over each ability's own score) and the smoke disc
 * (from its rung). Idempotent — safe in both re-pin homes.
 */
export function deriveAbilityStats(stats: EffectiveStats): void {
  stats.repair.cooldownMs = CONFIG.hullRepair.cooldownMs * reloadCooldownScale(stats.repair.reload);
  stats.repair.regenMs = CONFIG.hullRepair.regenMs; // FIXED at every card count (R15) — never stat-addressable
  deriveSmoke(stats.smoke);
}

/**
 * The firewall's floor on the authored ability fields (clampStats only): the
 * two scores and the rung are whole numbers ≥ 1, so the haste law and the size
 * walk are always finite. The heal amounts and the life are left as folded —
 * the fold's positive-finite gate already refuses a bad effect.
 */
export function clampAbilityStats(stats: EffectiveStats): void {
  stats.repair.reload = wholeAtLeast(stats.repair.reload, 1);
  stats.smoke.reload = wholeAtLeast(stats.smoke.reload, 1);
  stats.smoke.sizeRung = wholeAtLeast(stats.smoke.sizeRung, 1);
}
