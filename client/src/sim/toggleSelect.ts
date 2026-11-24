// WEAPON SELECT = TOGGLE (Eric 2026-11-23): a toggled weapon stays selected
// until the shot just fired empties its loaded stock, then returns to the gun —
// on that click's RELEASE, never its press (the latch main.ts arms). PRIME arms
// that revert on every fireable click. Client-only UX; nothing rides the wire.
//
// THE STOCK IS PREDICTED, not read raw: the server's `you.ammo[slot].n` is a
// frame stale, so three clicks inside one round trip would all read the same
// count. Every predicted-FIREABLE shot is recorded as (slot, input seq); a
// shot the server has not yet applied (seq > the frame's `ackSeq`) is still
// owed off the server's count. Recorded shots at or below `ackSeq` are in the
// server's count already and are pruned.
//
// THE BACKSTOP: a toggled shot that left stock predicted WATCHES its slot. If
// the predicted stock later reads 0 (the server's count came back lower than
// the click believed), the watch arms the revert — on the release of the
// click that emptied it. Selecting anything else, or leaving TOGGLE, drops the
// watch. Pure functions over an immutable state; zero I/O.

import type { WeaponSelectMode } from '../settings/store.js';
import { revertsAfterShot } from './inputSampler.js';

/** A predicted-fireable shot: the slot it spent and the input seq it rode. */
export interface ToggleShot {
  readonly slot: number;
  readonly seq: number;
}

/** A slot left selected by a toggled shot, and the click that fired it. */
export interface ToggleWatch {
  readonly slot: number;
  readonly clickSeq: number;
}

export interface ToggleState {
  readonly shots: readonly ToggleShot[];
  readonly watch: ToggleWatch | null;
}

export const TOGGLE_IDLE: ToggleState = { shots: [], watch: null };

/** The server's loaded stock for a slot (`you.ammo[slot].n`, 0 when unknown). */
export type ServerStock = (slot: number) => number;

/** Drop the shots the server has applied (seq ≤ `ackSeq`): its count holds them. */
function pruneAcked(st: ToggleState, ackSeq: number): ToggleState {
  if (st.shots.every((s) => s.seq > ackSeq)) return st;
  return { shots: st.shots.filter((s) => s.seq > ackSeq), watch: st.watch };
}

/** Pure: the slot's predicted loaded stock — the server's count less this
 *  slot's shots the server has not applied yet, never below 0. */
export function predictedStock(st: ToggleState, slot: number, serverN: number, ackSeq: number): number {
  let owed = 0;
  for (const s of st.shots) if (s.slot === slot && s.seq > ackSeq) owed += 1;
  return Math.max(0, serverN - owed);
}

/** One new click on a primed slot. */
export interface ToggleShotInput {
  /** The click prediction's verdict (`shouldConsumePrime`): a predicted-DENIED
   *  click records nothing and arms nothing — the selection is kept. */
  fireable: boolean;
  mode: WeaponSelectMode;
  slot: number;
  /** The input seq the click rides (`InputMsg.seq`). */
  seq: number;
  /** The mouse click's sequence number — the hold whose release pays the revert. */
  clickSeq: number;
  serverN: number;
  ackSeq: number;
}

/**
 * Pure: record a click's shot (fireable clicks only) and decide whether it arms the release revert:
 * `revertsAfterShot(mode, stock before this shot)` — always in PRIME, in TOGGLE
 * only when this shot empties the slot. A shot that does not arm watches its
 * slot for the backstop.
 */
export function recordShot(st: ToggleState, f: ToggleShotInput): { state: ToggleState; arm: boolean } {
  if (!f.fireable) return { state: st, arm: false };
  const pruned = pruneAcked(st, f.ackSeq);
  const loadedBefore = predictedStock(pruned, f.slot, f.serverN, f.ackSeq);
  const shots = [...pruned.shots, { slot: f.slot, seq: f.seq }];
  if (revertsAfterShot(f.mode, loadedBefore)) return { state: { shots, watch: null }, arm: true };
  return { state: { shots, watch: { slot: f.slot, clickSeq: f.clickSeq } }, arm: false };
}

/** The per-tick reads the backstop needs. */
export interface ToggleTickInput {
  mode: WeaponSelectMode;
  primedSlot: number;
  serverStock: ServerStock;
  ackSeq: number;
  /** The latest click's sequence number (`MouseInput.clickCount`). */
  clickCount: number;
  /** The last click whose hold ended (`MouseInput.releasedClickSeq`). */
  releasedClickSeq: number;
}

/**
 * Which click's release pays the backstop's revert: the emptying click while
 * it is still held; once its hold has ended, the latest click (released → the
 * revert is paid at once by the arm; still held → on its release).
 */
function payingClick(w: ToggleWatch, t: ToggleTickInput): number {
  return t.releasedClickSeq >= w.clickSeq ? t.clickCount : w.clickSeq;
}

/**
 * Pure: the TOGGLE backstop, once per sim tick. Returns the click seq to arm
 * the release revert for (null = nothing to arm) and the next state. A watch is
 * dropped when its slot is no longer selected or the mode is not TOGGLE.
 */
export function toggleBackstop(st: ToggleState, t: ToggleTickInput): { state: ToggleState; armSeq: number | null } {
  const pruned = pruneAcked(st, t.ackSeq);
  const w = pruned.watch;
  if (w === null) return { state: pruned, armSeq: null };
  if (t.primedSlot !== w.slot || t.mode !== 'TOGGLE') return { state: { shots: pruned.shots, watch: null }, armSeq: null };
  if (predictedStock(pruned, w.slot, t.serverStock(w.slot), t.ackSeq) > 0) return { state: pruned, armSeq: null };
  return { state: { shots: pruned.shots, watch: null }, armSeq: payingClick(w, t) };
}
