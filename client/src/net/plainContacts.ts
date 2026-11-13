// THE PLAIN HULL CHANNEL (Story 11.2, Eric 2026-11-12, ruling R3) — the client
// mirror of `FrameMsg.pc`: hulls seen by eye beyond the class-and-name reach and
// inside the plain-hull reach, each under an ANONYMOUS per-observer handle `h`
// with its true pose and nothing else (no class, no roster id, no turret or
// launcher angles). One SnapshotBuffer per handle, so a plain hull gets the same
// snapshot interpolation a full contact gets.
//
// FRAME-AUTHORITATIVE, NOT TTL-PRUNED. The server's rule is that a row missing
// from a frame means that hull is no longer seen that way (it left the band, or
// it crossed inward and is a full contact now, or outward under a NEW handle),
// so a handle absent from the newest frame is dropped on that frame — never
// held on a stale timer the way a full contact is (`ContactStore.prune`).
//
// THE TIER HANDOFF (no doubled hull). A hull crossing the class-and-name reach
// swaps channels: its plain row ends and a full contact begins near the same
// spot (inward), or its full contact stops arriving while a new plain handle
// begins near it (outward). `ContactStore.pushFrame` pairs the two through
// `matchHandoff` below and records the pair, so the render layer can swap the
// two views on one frame (the outgoing view destroyed at once, the incoming one
// born at full alpha) instead of cross-fading two hulls for a stale window.
//
// Pure data, no Pixi. net → render one-way: the views read this store.

import type { PlainContact } from '@salvo/shared';
import { CONFIG, SHIP_CLASS_IDS } from '@salvo/shared';
import { RETENTION_MS, SnapshotBuffer, type Snapshot } from './snapshotBuffer.js';

/**
 * u — the ONE length every plain hull is drawn at: the mean of the four hull
 * lengths (computed from CONFIG, never typed in). A plain hull's class is not
 * on the wire, so its size must not hint at one either. Also the tolerance the
 * tier handoff pairs a disappearing hull with an appearing one inside.
 */
export const PLAIN_HULL_LENGTH_U =
  SHIP_CLASS_IDS.reduce((s, id) => s + CONFIG.shipClasses[id].hull.length, 0) / SHIP_CLASS_IDS.length;

/** u — the mean of the four hull beams (the plain hull's one beam). */
export const PLAIN_HULL_BEAM_U =
  SHIP_CLASS_IDS.reduce((s, id) => s + CONFIG.shipClasses[id].hull.beam, 0) / SHIP_CLASS_IDS.length;

/**
 * ms — how long a hull that left one channel stays pairable with a hull that
 * appears in the other: ONE interpolation window (`CONFIG.tick.interpDelayMs`).
 * The server may emit the incoming row a frame after the outgoing one ended;
 * past this window the two are unrelated and each fades on its own.
 */
export const HANDOFF_WINDOW_MS = CONFIG.tick.interpDelayMs;

/** A hull that just appeared or just disappeared in one channel (pose at `t`). */
export interface TierPoint {
  key: string;
  x: number;
  y: number;
  t: number;
}

/**
 * Pure: pair every APPEARING hull with the nearest DISAPPEARING hull of the
 * other channel inside `PLAIN_HULL_LENGTH_U` and `HANDOFF_WINDOW_MS`; each
 * disappearing hull pairs at most once. Returns [appearingKey, goneKey] pairs.
 */
export function matchHandoff(appearing: readonly TierPoint[], gone: readonly TierPoint[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const taken = new Set<string>();
  for (const a of appearing) {
    const best = nearestFree(a, gone, taken);
    if (best === null) continue;
    taken.add(best.key);
    out.push([a.key, best.key]);
  }
  return out;
}

function nearestFree(a: TierPoint, gone: readonly TierPoint[], taken: ReadonlySet<string>): TierPoint | null {
  let best: TierPoint | null = null;
  let bestD = PLAIN_HULL_LENGTH_U;
  for (const g of gone) {
    if (taken.has(g.key) || Math.abs(a.t - g.t) > HANDOFF_WINDOW_MS) continue;
    const d = Math.hypot(a.x - g.x, a.y - g.y);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

/** One handle's first-frame pose (an appearing plain hull). */
function point(key: string, s: Snapshot): TierPoint {
  return { key, x: s.x, y: s.y, t: s.t };
}

/**
 * One-shot handoff marks, keyed by id / handle, read once by the views. A mark
 * nobody reads (its view never existed — two frames landed between renders)
 * expires after `RETENTION_MS` of server time, so the set stays bounded.
 */
export class HandoffMarks {
  private marks = new Map<string, number>();

  add(key: string, t: number): void {
    this.marks.set(key, t);
  }

  /** One-shot read: true (and cleared) when `key` carries a mark. */
  take(key: string): boolean {
    return this.marks.delete(key);
  }

  /** Forget `key`'s mark without reading it. */
  forget(key: string): void {
    this.marks.delete(key);
  }

  /** Drop marks older than `RETENTION_MS` at server time `t`. */
  expire(t: number): void {
    for (const [k, at] of this.marks) if (t - at > RETENTION_MS) this.marks.delete(k);
  }
}

export class PlainContactStore {
  private buffers = new Map<string, SnapshotBuffer>();
  /** Handles that left the channel inside the last handoff window (their last pose). */
  private departed: TierPoint[] = [];
  /** Handles whose view must be born at full alpha (an outward handoff). */
  private readonly bornByHandoff = new HandoffMarks();
  /** Handles that became a full contact: their view goes at once, unfaded. */
  private readonly retiredByHandoff = new HandoffMarks();

  /**
   * Ingest one frame's `pc` list at server time `t` (an omitted key = none).
   * Returns the handles that APPEARED on this frame (new to the channel).
   * Every handle absent from this frame is dropped now (frame-authoritative)
   * and remembered for one handoff window.
   */
  pushFrame(t: number, rows: readonly PlainContact[] | undefined): TierPoint[] {
    const seen = new Set<string>();
    const appeared: TierPoint[] = [];
    for (const r of rows ?? []) {
      if (!validRow(r)) continue;
      seen.add(r.h);
      let buf = this.buffers.get(r.h);
      if (!buf) {
        buf = new SnapshotBuffer();
        this.buffers.set(r.h, buf);
        appeared.push({ key: r.h, x: r.x, y: r.y, t });
      }
      buf.push({ t, x: r.x, y: r.y, heading: r.heading, speed: r.speed });
    }
    this.departed = this.departed.filter((d) => t - d.t <= HANDOFF_WINDOW_MS);
    this.bornByHandoff.expire(t);
    this.retiredByHandoff.expire(t);
    for (const [h, buf] of this.buffers) {
      if (seen.has(h)) continue;
      const last = buf.newest;
      if (last) this.departed.push(point(h, last));
      this.buffers.delete(h);
    }
    return appeared;
  }

  /** The handles that left inside the last handoff window, with their last pose. */
  recentlyDeparted(): readonly TierPoint[] {
    return this.departed;
  }

  /** Record an INWARD handoff: handle `h` became a full contact. */
  retire(h: string, t: number): void {
    this.retiredByHandoff.add(h, t);
    this.departed = this.departed.filter((d) => d.key !== h);
  }

  /** Record an OUTWARD handoff: handle `h`'s view is born at full alpha. */
  markBornByHandoff(h: string, t: number): void {
    this.bornByHandoff.add(h, t);
  }

  /** One-shot: was handle `h` born by a handoff? (its view skips the fade-in) */
  takeBornByHandoff(h: string): boolean {
    return this.bornByHandoff.take(h);
  }

  /** One-shot: did handle `h` leave by a handoff? (its view goes unfaded) */
  takeRetiredByHandoff(h: string): boolean {
    return this.retiredByHandoff.take(h);
  }

  get(h: string): SnapshotBuffer | undefined {
    return this.buffers.get(h);
  }

  ids(): IterableIterator<string> {
    return this.buffers.keys();
  }

  get size(): number {
    return this.buffers.size;
  }
}

/** A row the client can draw: a string handle and a finite pose (fail closed). */
function validRow(r: PlainContact): boolean {
  return typeof r.h === 'string' && Number.isFinite(r.x + r.y + r.heading + r.speed);
}
