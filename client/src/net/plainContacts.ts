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
 * An INWARD contact may arrive a frame after its plain row ended, and a plain
 * row that drops out for a frame may return under a new handle (PLAIN
 * RE-ENTRY); past this window the two are unrelated and each fades on its own.
 * OUTWARD pairs only within the one frame (the server swaps tiers atomically).
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
 * Pure: pair APPEARING hulls with DISAPPEARING hulls inside
 * `PLAIN_HULL_LENGTH_U` and `HANDOFF_WINDOW_MS`, ONE-TO-ONE and NEAREST FIRST
 * over every candidate pair (never in arrival order — two hulls crossing the
 * reach side by side must not pair crosswise), exact ties broken by the keys so
 * the result never depends on list order. Returns [appearingKey, goneKey] pairs.
 */
export function matchHandoff(appearing: readonly TierPoint[], gone: readonly TierPoint[]): Array<[string, string]> {
  const cands = candidatePairs(appearing, gone).sort(byDistanceThenKeys);
  const out: Array<[string, string]> = [];
  const usedA = new Set<string>();
  const usedG = new Set<string>();
  for (const c of cands) {
    if (usedA.has(c.a) || usedG.has(c.g)) continue;
    usedA.add(c.a);
    usedG.add(c.g);
    out.push([c.a, c.g]);
  }
  return out;
}

interface Candidate {
  a: string;
  g: string;
  d: number;
}

function candidatePairs(appearing: readonly TierPoint[], gone: readonly TierPoint[]): Candidate[] {
  const out: Candidate[] = [];
  for (const a of appearing) {
    for (const g of gone) {
      if (Math.abs(a.t - g.t) > HANDOFF_WINDOW_MS) continue;
      const d = Math.hypot(a.x - g.x, a.y - g.y);
      if (d <= PLAIN_HULL_LENGTH_U) out.push({ a: a.key, g: g.key, d });
    }
  }
  return out;
}

function byDistanceThenKeys(p: Candidate, q: Candidate): number {
  if (p.d !== q.d) return p.d - q.d;
  if (p.a !== q.a) return p.a < q.a ? -1 : 1;
  if (p.g === q.g) return 0;
  return p.g < q.g ? -1 : 1;
}

/** A plain handle that left the channel: its last pose and its history. */
interface Departed extends TierPoint {
  heading: number;
  speed: number;
  buf: SnapshotBuffer;
}

function departedFrom(key: string, s: Snapshot, buf: SnapshotBuffer): Departed {
  return { key, x: s.x, y: s.y, t: s.t, heading: s.heading, speed: s.speed, buf };
}

/** `d` dead-reckoned along its last heading at its last speed to server time `t`. */
function reckonTo(d: Departed, t: number): TierPoint {
  const dt = (t - d.t) / 1000;
  return { key: d.key, x: d.x + Math.cos(d.heading) * d.speed * dt, y: d.y + Math.sin(d.heading) * d.speed * dt, t };
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
  private departed: Departed[] = [];
  /**
   * PLAIN RE-ENTRY (a one-frame dropout at an island edge / fog wobble): a new
   * handle that took over a departed handle's history, new → old. One-shot,
   * read by the view layer to carry the old view over instead of cross-fading
   * two hulls on one spot; unread entries expire after `RETENTION_MS`.
   */
  private readonly carried = new Map<string, { from: string; t: number }>();
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
    // A malformed `pc` (not a list) is "none" — never a throw that aborts the frame handler.
    for (const r of Array.isArray(rows) ? (rows as readonly unknown[]) : []) {
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
    for (const [h, c] of this.carried) if (t - c.t > RETENTION_MS) this.carried.delete(h);
    for (const [h, buf] of this.buffers) {
      if (seen.has(h)) continue;
      const last = buf.newest;
      if (last) this.departed.push(departedFrom(h, last, buf));
      this.buffers.delete(h);
    }
    return appeared;
  }

  /**
   * PLAIN RE-ENTRY: pair each newly appeared handle in `appearing` (the ones
   * no tier handoff claimed) with a handle that departed inside the handoff
   * window at a CONSISTENT position — its last pose dead-reckoned by its last
   * speed and heading to `t`, within one plain-hull length. The new handle
   * inherits the departed one's history and is marked so its view carries over.
   */
  pairReentries(t: number, appearing: readonly TierPoint[]): void {
    const projected = this.departed.map((d) => reckonTo(d, t));
    for (const [h, old] of matchHandoff(appearing, projected)) {
      const d = this.departed.find((x) => x.key === old);
      const fresh = this.buffers.get(h)?.newest;
      if (!d || !fresh) continue;
      d.buf.push(fresh);
      this.buffers.set(h, d.buf);
      this.departed = this.departed.filter((x) => x.key !== old);
      this.carried.set(h, { from: old, t });
    }
  }

  /** One-shot: the departed handle whose view handle `h` carries over, if any. */
  takeCarriedFrom(h: string): string | undefined {
    const c = this.carried.get(h);
    this.carried.delete(h);
    return c?.from;
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

/** A row the client can draw: an object with a string handle and a finite numeric pose (fail closed). */
function validRow(r: unknown): r is PlainContact {
  if (r === null || typeof r !== 'object') return false;
  const p = r as Partial<Record<keyof PlainContact, unknown>>;
  return typeof p.h === 'string' && [p.x, p.y, p.heading, p.speed].every((n) => typeof n === 'number' && Number.isFinite(n));
}
