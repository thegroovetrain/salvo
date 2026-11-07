// THE INDEX DERIVATIONS (Story 10.3, Eric 2026-11-04, epic-10 amendment 8) —
// the one home for "what does an index BUY". Every ship stat is a plain
// number around 100 (ARMOR, POWER, RELOAD, ENGINES, INTEL, RANGE —
// `INDEX_IDS` in constants.ts): the hull envelope seeds them, the ship
// ladders step them (+20 ARMOR / POWER / INTEL, +10 RELOAD / ENGINES / RANGE
// since Story 10.6, R1), and NOTHING else is authored. The speed, the radar
// sweep, the cooldown scale and the deck-gun reach are
// DERIVED from them here and ONLY here, called from the fold's two re-pin
// homes (sim/boons.ts `rePinDerived` and sim/stats.ts `clampStats`) exactly as
// `damageMultiplierFor` and `deriveMineRings` are. No tick, no predictor, no
// HUD and no bot may compute a speed from ENGINES or a cooldown from RELOAD —
// they read the folded `kinematics` / `cooldownScale` / `sweepRpm`.
//
// Split out of sim/stats.ts (the file is already past the ~500 LOC soft cap)
// and kept BELOW it in the import graph: this module imports CONFIG and the
// `EffectiveStats` TYPE only, so stats.ts and boons.ts can both import it
// without a cycle.
//
// THE LAWS, Eric's words (story 10-3 § Eric's rulings):
//   ENGINES (ruling 15) — "Top speed = 30 u/s * (ENGINES / 100)" — LINEAR,
//     "+100 will be +100% more distance covered per minute".
//   RUDDER is DELETED (Story 10.6, Eric 2026-11-05, R2): every captain hull
//     turns at the one baseline `CONFIG.index.turnRate`, seeded in sim/stats.ts
//     baseStats (the PvE drone's authored rate, I5, retired at Story 10.8,
//     2026-11-06). Nothing derives it.
//   INTEL (ruling 14) — "Radar sweep = 15 RPM × INTEL / 100; INTEL 200 = 30
//     RPM" — the base IS `CONFIG.vision.sweepRpm` (not restated), UNCAPPED
//     since Story 10.7, R6 (Eric 2026-11-06, epic-10 amendment 13: there is
//     no INTEL cap any more, for any reason — `sweepRpmMax` is deleted).
//   RELOAD (ruling 14, verbatim) — "Final Cooldown = Base Cooldown / (1 +
//     ((RELOAD − INDEX)/K), where INDEX and K are both 100." Both are
//     `CONFIG.index.base`; algebraically `base × 100 / RELOAD` (120 = ×0.833,
//     200 = half). `cooldownScale` publishes it for the ship's own RELOAD;
//     clampStats runs the SAME law once per row on RELOAD + that weapon's
//     tier bonus (Story 10.6, R5 — the −5 %/tier step is gone), and the
//     HULL REPAIR / SMOKE SCREEN cooldowns run it on their own fixed score
//     (R8 / R9, sim/abilityStats.ts).
//   RANGE (ruling 14) — "reach × index / 100 on the battleship's base": the
//     four deck-gun rows' folded `rangeU` (Tier I CONFIG + ladder steps) × RANGE
//     / 100. A ONE-SHOT multiply, so it lives in clampStats alone (see
//     `RANGE_ROWS` and `scaleDeckGunRange`) — never here, where a second pass
//     would double-apply it. Star / phosphor / fouling / flash reach is untouched.
//
// Every derivation here is IDEMPOTENT in the authored index (reads an index,
// writes a derived field, never the reverse), which is what lets both re-pin
// homes call it and what makes card order irrelevant.

import { CONFIG } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/** ms per minute — the rpm -> period conversion for effective stats. Render-
 *  side BASE defaults (radar.ts, ambient.ts) derive 60000/CONFIG rpm at their
 *  own edges; only THIS conversion ever sees an INTEL-scaled rpm. */
export const MS_PER_MINUTE = 60000;

/** Round to 3 decimals — far finer than any authored step, and enough to kill
 *  float dust on a scalar that ammo.ts ticks against in 50 ms steps (an
 *  un-rounded 0.8333… would cost a whole extra tick on every reload). */
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * THE DECK-GUN ROWS whose reach the RANGE index scales (Story 10.3 reading of
 * "the main-gun reach": the four gun-family rows a captain aims by click —
 * the cannon, the two pickable guns and the broadside) plus, since Story
 * 10.4, THE MAIN BATTERY — the row a captain actually mounts, and through it
 * the secondaries' reach (a fraction of the folded main reach, derived in
 * sim/stats.ts clampStats AFTER this multiply). STAR SHELLS and
 * PHOSPHOR SHELLS keep their own tiered dials untouched: their reach is a
 * lighting / zone tool, not a gun's.
 */
export const RANGE_ROWS = ['gun', 'machineGun', 'flak', 'broadside', 'mainBattery'] as const;

/**
 * `ref × index / base` — the one linear law every index obeys. PRODUCT
 * FIRST, division last: `(30 × 117) / 100` is exactly 35.1 while
 * `30 × (117 / 100)` is 35.099999999999994, and both sides must land on the
 * identical double (the sim/arcs.ts `deg` precedent). Never rewrite it as
 * `ref × (index / base)`.
 */
function scaled(ref: number, index: number): number {
  return (ref * index) / CONFIG.index.base;
}

/**
 * THE RELOAD HASTE LAW (ruling 14): `1 / (1 + (RELOAD − INDEX) / K)` with
 * INDEX = K = CONFIG.index.base. Written in Eric's shape rather than the
 * algebraic `base / reload` so the comment and the code say the same thing;
 * round3'd for the tick-dust reason above and floored at 0.1 as the malformed-
 * data guard (unreachable through the catalog — RELOAD is floored ≥ 1 in
 * clampStats so the law is always finite; a fold that somehow handed it an
 * absurd index could otherwise drive the cadence toward zero).
 */
export function reloadCooldownScale(reload: number): number {
  const base = CONFIG.index.base;
  return Math.max(0.1, round3(1 / (1 + (reload - base) / base)));
}

/**
 * Write every index-DERIVED field from the AUTHORED indices on `stats`, in
 * place: `kinematics.maxSpeed` (ENGINES),
 * `sweepRpm` + `sweepPeriodMs` (INTEL, uncapped) and
 * `cooldownScale` (RELOAD). Idempotent — safe in both re-pin homes. The
 * indices themselves are floored whole by clampStats before its call; the
 * mid-fold call in rePinDerived may see a fractional index and that is fine,
 * because clampStats re-derives from the floored value afterwards.
 *
 * NO SWEEP CEILING (Story 10.7, R6, Eric 2026-11-06, epic-10 amendment 13 —
 * "There shouldn't be an intel cap anymore anyway, like for any reason."):
 * the sweep is the plain linear INTEL law for cards and the exhausted hull's
 * bonus points alike; the old `sweepRpmMax` (30 RPM) is deleted. The INTEL
 * floor of 1 (clampStats) still keeps the period finite.
 */
export function deriveIndexStats(stats: EffectiveStats): void {
  stats.kinematics.maxSpeed = scaled(CONFIG.index.engines, stats.engines);
  stats.sweepRpm = scaled(CONFIG.vision.sweepRpm, stats.intel);
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
  stats.cooldownScale = reloadCooldownScale(stats.reload);
}

/**
 * THE ONE-SHOT RANGE MULTIPLY: each deck-gun row's folded reach × RANGE / base.
 * Called from clampStats ONLY (the reload multiply's precedent) —
 * it consumes the value it overwrites, so a second pass would compound it.
 * At the base index the scale is exactly 1, so a zero-card fold is
 * byte-identical to its CONFIG dials (here the RATIO is taken first, on
 * purpose: `range / base` is exactly 1 at base, where `(rangeU × range) /
 * base` would round a fractional reach through a large intermediate).
 */
export function scaleDeckGunRange(stats: EffectiveStats): void {
  const scale = stats.range / CONFIG.index.base;
  for (const id of RANGE_ROWS) {
    const row = stats.equipment[id];
    const scaled = row.rangeU * scale;
    // FAIL CLOSED on a non-finite product (review gate 2026-11-04): a finite
    // but absurd RANGE (an injected catalog near MAX_VALUE) passes the fold's
    // positive-finite effect gate, and the multiply alone would overflow to
    // Infinity. The unscaled reach stands — the firewall's output stays finite.
    if (Number.isFinite(scaled)) row.rangeU = scaled;
  }
}
