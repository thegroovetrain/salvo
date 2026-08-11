// THE AGGREGATE FLASH BUDGET (Story 4.8, amendment 240) — the mechanism behind
// the ratified photosensitivity floor: *"no element or screen region flashes
// more than 3x/s regardless of how many compliant events stack"* (NFR13 /
// EXPERIENCE.md:138 / DESIGN.md:256). The floor has been ratified since day one
// and had never had an implementation; the client counted flashes per region
// nowhere. This is that counter, in the deniedFire / gunneryFeed house shape:
// pure logic, no Pixi import, clock INJECTED by the caller, unit tested.
//
// TWO STAGES, NEITHER OF WHICH INVENTS A PRINCIPLE:
//   1. COALESCE — co-located same-kind flashes inside ONE frame collapse to a
//      single draw. This is amendment 37's already-ratified one-frame-one-cue
//      grammar ("one shake, one tone at the summed magnitude") extended from
//      audio to visuals, and it is the cheap stage: a salvo landing on one point
//      is one fact, so it should have been one mark all along.
//   2. DEGRADE — if a key is STILL over budget, further flashes render at their
//      already-ratified `motion: 'off'` keyframe: a flat, non-flashing mark at
//      the true position for the effect's normal life. Presence, position and
//      weight survive BY CONSTRUCTION, because every channel already guarantees
//      its off-state carries the information.
//
// IT NEVER DELETES. The worst stacking in this game is muzzle flashes, hull hit
// flashes and fall-of-shot splashes, and Story 4.3 deliberately promoted
// `muzzle` and `spark` OUT of `isJuiceEffect` — they are sanctioned SENSOR
// READINGS. A budget that dropped them would delete information under exactly
// the load the floor was written for, violating the standing law that the motion
// setting *"removes MOTION, never INFORMATION."* The degraded rendering is a
// state the game already ships and every player can already select, so the
// budget can never be accused of leaking or hiding anything.
//
// BREATHING CHANNELS ARE EXEMPT BY CONSTRUCTION — DO NOT "FIX" THIS OMISSION.
// Every pulsing surface in the game is capped at `settings.pulseCapHz` (1.1 Hz)
// or below (the HP rail's ramp, the storm vignette, the ring segment, the bank
// chip, the ember disc), which is well under 3 flashes/s. A breathing channel
// cannot bind this budget, so routing one through it would only be counting
// something that can never exceed the count. THE BUDGET GOVERNS ONE-SHOTS.
//
// TIERS ARE A DIFFERENT QUESTION (amendment 241). Tier arbitration
// (render/attention.ts) stops at HUD chrome, because "hold at your lit keyframe"
// is a coherent instruction for a breathing widget and a meaningless one for a
// 120ms muzzle flash at a world position. The budget covers EVERYTHING including
// the water — its floor says "element OR SCREEN REGION", and exempting the water
// would gut it.

import { CLIENT_CONFIG } from '../config.js';

const FB = CLIENT_CONFIG.flashBudget;

/**
 * What a claimant may do with its flash this frame.
 *   `animate` — run the normal peak→fade ramp.
 *   `degrade` — draw the flat `motion: 'off'` mark instead (same life, same
 *               position, `FB.degradeAlphaFactor` of the peak, no ramp).
 */
export type FlashVerdict = 'animate' | 'degrade';

/** The budget's whole surface. One instance per client (main.ts owns it). */
export interface FlashBudget {
  /**
   * Claim a flash ONSET against `key` (a `regionKey()` for world flashes, a
   * `FLASH_ELEMENTS` constant for element-scoped chrome) at `nowMs`.
   *
   * A `'degrade'` verdict RECORDS NOTHING: a degraded flash did not flash, so
   * it must not consume budget — otherwise a heavy stack would hold the window
   * permanently full and starve the animations that follow it.
   */
  claim(key: string, nowMs: number): FlashVerdict;
  /**
   * Per-frame coalescer. True the FIRST time this (kind, quantized position) is
   * seen in `frameId`, false for every duplicate in that same frame. The frame
   * set clears whenever `frameId` changes, so the memory can never outlive the
   * frame and start eating legitimately repeated marks (a second salvo walked
   * back onto the same water, a minefield chain-detonating at a fixed point).
   */
  coalesce(kind: string, x: number, y: number, frameId: number): boolean;
  /** Forget everything — a hard boundary (return to port, reconnect, a new
   *  match), where carrying a stale window into a fresh screen is meaningless. */
  reset(): void;
}

/**
 * Pure: the per-key onset list, minus everything outside the window at `nowMs`.
 * The surviving predicate is "this onset is IN THE PAST and inside the window".
 *
 * PRUNED BY TIMESTAMP, NEVER BY COUNT. A backgrounded tab (or a long hitch)
 * jumps the clock by seconds; a count-based ring would keep those stale onsets
 * and burst-degrade the first real flashes after the restore, which is exactly
 * the accessibility promise inverted. Filtering also tolerates a non-monotonic
 * clock without assuming the list stays sorted.
 *
 * A FUTURE TIMESTAMP IS DROPPED, NOT RETAINED (review gate P2). `nowMs - t <
 * windowMs` alone is true for ANY `t > nowMs` — a negative difference is always
 * under the window — so an onset stamped ahead of the clock would survive every
 * prune FOREVER: a permanent false `'degrade'` on that key, and a key the sweep
 * can never collect. It is reachable through any backward clock movement, and
 * it was reachable outright while a second clock domain claimed on this budget.
 * The guard FAILS SAFE, toward `'animate'`: an onset whose timestamp cannot be
 * trusted is dropped from the window rather than held against the next flash,
 * because the budget's whole job is to be a ceiling on real flashes, not on
 * bookkeeping artifacts. `t === nowMs` (a same-frame claim, difference 0) is IN
 * the window and still counts, which is the common case for a stack.
 */
function withinWindow(onsets: readonly number[], nowMs: number): number[] {
  return onsets.filter((t) => {
    const age = nowMs - t;
    return age >= 0 && age < FB.windowMs;
  });
}

/** How many claims between sweeps of the onset map. Keys accumulate over a long
 *  match (a region key per screen cell, an element key per surface); a key whose
 *  window has emptied is dead weight, so the map is swept periodically rather
 *  than grown without bound. */
const SWEEP_EVERY_CLAIMS = 64;

class SlidingFlashBudget implements FlashBudget {
  /** key → the onset timestamps still inside the window (≤ maxPerSecond each). */
  private readonly onsets = new Map<string, number[]>();
  /** The frame the coalescer's set belongs to; null before the first frame. */
  private frameId: number | null = null;
  private readonly frameSeen = new Set<string>();
  private sinceSweep = 0;

  claim(key: string, nowMs: number): FlashVerdict {
    const kept = withinWindow(this.onsets.get(key) ?? [], nowMs);
    this.maybeSweep(nowMs);
    if (kept.length >= FB.maxPerSecond) {
      this.onsets.set(key, kept); // the prune is kept; the refused onset is NOT
      return 'degrade';
    }
    kept.push(nowMs);
    this.onsets.set(key, kept);
    return 'animate';
  }

  coalesce(kind: string, x: number, y: number, frameId: number): boolean {
    if (frameId !== this.frameId) {
      this.frameId = frameId;
      this.frameSeen.clear();
    }
    const key = `${kind}|${coalesceKey(x, y)}`;
    if (this.frameSeen.has(key)) return false;
    this.frameSeen.add(key);
    return true;
  }

  reset(): void {
    this.onsets.clear();
    this.frameSeen.clear();
    this.frameId = null;
    this.sinceSweep = 0;
  }

  /** Drop key buckets whose window has emptied (memory hygiene — a long match
   *  must not grow the map forever). Amortized: once every SWEEP_EVERY_CLAIMS. */
  private maybeSweep(nowMs: number): void {
    if (++this.sinceSweep < SWEEP_EVERY_CLAIMS) return;
    this.sinceSweep = 0;
    for (const [key, list] of this.onsets) {
      const kept = withinWindow(list, nowMs);
      if (kept.length === 0) this.onsets.delete(key);
      else this.onsets.set(key, kept);
    }
  }
}

/** A fresh budget. One per client; tests make their own and inject a clock. */
export function createFlashBudget(): FlashBudget {
  return new SlidingFlashBudget();
}

/** Pure: the quantized position half of a coalescing key. */
function coalesceKey(x: number, y: number): string {
  const q = FB.coalesceQuantumU;
  return `${Math.round(x / q)}:${Math.round(y / q)}`;
}

/** Pure: a cell index in [0, n), clamping anything off the edge into the edge
 *  cell — an out-of-viewport flash is a real flash at a real place, and it must
 *  not mint an unbounded key (which would both leak memory and let a stack
 *  escape its region's budget by drifting off screen). */
function cellIndex(v: number, extent: number, n: number): number {
  if (!Number.isFinite(v) || !(extent > 0)) return 0;
  const i = Math.floor((v / extent) * n);
  if (i < 0) return 0;
  return i > n - 1 ? n - 1 : i;
}

/**
 * Pure: the budget key for a flash at a SCREEN position, on the viewport's
 * `regionCols` x `regionRows` grid. A region is therefore a stable FRACTION of
 * the screen at any resolution — the same fractional position yields the same
 * key on a 1366x768 laptop and a 4K monitor, so the floor means the same thing
 * on both.
 */
export function regionKey(screenX: number, screenY: number, viewW: number, viewH: number): string {
  const col = cellIndex(screenX, viewW, FB.regionCols);
  const row = cellIndex(screenY, viewH, FB.regionRows);
  return `r${col}:${row}`;
}

/**
 * ELEMENT-SCOPED keys. The ratified floor is per "element OR screen region": a
 * chrome surface that flashes in place is one ELEMENT no matter where the
 * viewport puts it, so it claims a named constant rather than a region derived
 * from its screen position (which would let a re-layout silently re-bucket it,
 * or let two unrelated surfaces share one budget because they happen to sit in
 * the same twelfth of the screen).
 */
export const FLASH_ELEMENTS: { readonly [k: string]: string } = {
  /** The on-water denied-fire pulse (arc + aim marker). */
  deniedArc: 'e:deniedArc',
  /** Prefix for the per-slot hotbar denied pulses — use `hotbarSlotKey(slot)`,
   *  so each slot carries its own budget (three slots denying at once is three
   *  separate elements, not one over-budget one). */
  hotbarSlot: 'e:hotbarSlot',
  /** The hotbar's frame-level flash (ready / state change). */
  hotbarFrame: 'e:hotbarFrame',
  /** The storm's reveal-beat flash on the ring telegraph (Story 3.2's 80ms,
   *  ring-identity keyed — it already never re-fires, and the claim is the
   *  aggregate guarantee on top of that). */
  zoneReveal: 'e:zoneReveal',
  /** The foghorn's bearing chevron one-shot. */
  foghornChevron: 'e:foghornChevron',
  /** The refit/upgrade menu's denied-pick flash. */
  refitDenied: 'e:refitDenied',
};

/** The element key for one hotbar slot's denied pulse. */
export function hotbarSlotKey(slot: number): string {
  return `${FLASH_ELEMENTS.hotbarSlot}:${slot}`;
}
