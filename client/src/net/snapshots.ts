// Snapshot interpolation for remote contacts (and the own ship in the
// interp-checkpoint render mode). Each entity keeps a short ring of
// timestamped kinematic snapshots fed from FrameMsg.contacts; the renderer
// samples at serverNow() - interpDelay with lerp (shortest-arc heading),
// dead-reckons up to MAX_EXTRAPOLATION_MS on underrun, then freezes.

import { decodeLauncherAngle, decodeTurretAngle, hullEnvelope, lerpAngle, type Contact, type HullId } from '@salvo/shared';
import { lerp } from '../util/math.js';

/** One timestamped kinematic sample. `t` is server time (ms). */
export interface Snapshot {
  t: number; // ms — server time
  x: number; // u
  y: number; // u
  heading: number; // rad
  speed: number; // u/s (signed)
}

/** Max dead-reckoning past the newest snapshot before freezing (ms). */
export const MAX_EXTRAPOLATION_MS = 100;
/** How much history each buffer retains behind its newest snapshot (ms). */
export const RETENTION_MS = 1000;

function dup(s: Snapshot): Snapshot {
  return { t: s.t, x: s.x, y: s.y, heading: s.heading, speed: s.speed };
}

/** Dead-reckon `s` forward by `dtMs` along its heading at its speed. */
function extrapolate(s: Snapshot, dtMs: number): Snapshot {
  const dt = Math.min(dtMs, MAX_EXTRAPOLATION_MS) / 1000;
  return {
    t: s.t + dt * 1000,
    x: s.x + Math.cos(s.heading) * s.speed * dt,
    y: s.y + Math.sin(s.heading) * s.speed * dt,
    heading: s.heading,
    speed: s.speed,
  };
}

export class SnapshotBuffer {
  private buf: Snapshot[] = [];

  get size(): number {
    return this.buf.length;
  }

  get newest(): Snapshot | undefined {
    return this.buf[this.buf.length - 1];
  }

  /** Drop all history (teleports: respawn snaps instead of interpolating). */
  clear(): void {
    this.buf.length = 0;
  }

  /** Append a snapshot. Non-monotonic timestamps are dropped. Prunes history. */
  push(s: Snapshot): void {
    const last = this.newest;
    if (last && s.t <= last.t) return;
    this.buf.push(dup(s));
    const cutoff = s.t - RETENTION_MS;
    let drop = 0;
    while (drop < this.buf.length - 1 && this.buf[drop].t < cutoff) drop += 1;
    if (drop > 0) this.buf.splice(0, drop);
  }

  /**
   * Sample the entity's pose at server time `t` (ms). Brackets by binary
   * search + lerp; clamps to the oldest sample; extrapolates at most
   * MAX_EXTRAPOLATION_MS past the newest, then freezes. Null when empty.
   */
  sampleAt(t: number): Snapshot | null {
    if (this.buf.length === 0) return null;
    const first = this.buf[0];
    const last = this.buf[this.buf.length - 1];
    if (t <= first.t) return dup(first);
    if (t >= last.t) return extrapolate(last, t - last.t);
    const hi = this.upperBound(t);
    const a = this.buf[hi - 1];
    const b = this.buf[hi];
    const k = (t - a.t) / (b.t - a.t);
    return {
      t,
      x: lerp(a.x, b.x, k),
      y: lerp(a.y, b.y, k),
      heading: lerpAngle(a.heading, b.heading, k),
      speed: lerp(a.speed, b.speed, k),
    };
  }

  /** Smallest index whose snapshot time is strictly greater than `t`. */
  private upperBound(t: number): number {
    let lo = 0;
    let hi = this.buf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.buf[mid].t <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/**
 * Entity lifecycle for remote contacts: one SnapshotBuffer per id, fed from
 * each frame's `contacts`, pruned once unseen for a TTL. Add/remove only for
 * now — step 9's fade in/out slots into the renderer on top of this (a view
 * fades in when an id first appears here and fades out when prune drops it).
 */
export class ContactStore {
  private buffers = new Map<string, SnapshotBuffer>();
  private lastSeen = new Map<string, number>(); // server time (ms)
  /** Static per-id hull id (a contact never changes hull mid-life). */
  private classes = new Map<string, HullId>();
  /**
   * THE CONTACT'S TURRET ANGLES (Story 10.4): the latest frame's `Contact.tu`,
   * decoded to hull-relative radians (`decodeTurretAngle`), one array per id
   * reused across frames. SNAPPED, not interpolated: a turret moves at most
   * 90°/s, i.e. 4.5° between 20 Hz frames. Absent when the row carries no `tu`.
   */
  private turretAngles = new Map<string, number[]>();
  /**
   * THE CONTACT'S TORPEDO LAUNCHER ANGLES (Story 10.6, I7): the latest frame's
   * `Contact.lu`, decoded (`decodeLauncherAngle`) and SNAPPED exactly as the
   * turret angles are. Its LENGTH is the launcher count; tubes never travel.
   * Absent while the hull holds no torpedo (no `lu`).
   */
  private launcherAngles = new Map<string, number[]>();

  /** Ingest one frame's contact list at server time `t`. */
  pushFrame(t: number, contacts: readonly Contact[]): void {
    for (const c of contacts) {
      let buf = this.buffers.get(c.id);
      if (!buf) {
        buf = new SnapshotBuffer();
        this.buffers.set(c.id, buf);
      }
      buf.push({ t, x: c.x, y: c.y, heading: c.heading, speed: c.speed });
      this.lastSeen.set(c.id, t);
      this.classes.set(c.id, c.cls);
      // An unknown hull id (a malformed row) decodes to no mount angles — never a throw that drops the frame's other contacts.
      const known = (hullEnvelope(c.cls) as unknown) !== undefined;
      pushAngles(this.turretAngles, c.id, known ? c.tu : undefined, (i, q) => decodeTurretAngle(c.cls, i, q));
      pushAngles(this.launcherAngles, c.id, known ? c.lu : undefined, (i, q) => decodeLauncherAngle(c.cls, i, q));
    }
  }

  /** The contact's turret angles (hull-relative rad, bow to stern) as of its
   *  last frame, or undefined when it carried none or is pruned. */
  turretAnglesOf(id: string): readonly number[] | undefined {
    return this.turretAngles.get(id);
  }

  /** The contact's torpedo launcher angles (hull-relative rad, fore first) as
   *  of its last frame, or undefined when it carried none (no torpedo held). */
  launcherAnglesOf(id: string): readonly number[] | undefined {
    return this.launcherAngles.get(id);
  }

  get(id: string): SnapshotBuffer | undefined {
    return this.buffers.get(id);
  }

  /** The hull id of a LIVE contact (static, set on first sighting; undefined once
   *  the contact is pruned). Everything POSITIONAL reads this. */
  classOf(id: string): HullId | undefined {
    return this.classes.get(id);
  }

  /** Server time (ms) of the last frame that carried this contact; undefined
   *  once pruned (or never seen). */
  lastSeenAt(id: string): number | undefined {
    return this.lastSeen.get(id);
  }

  ids(): IterableIterator<string> {
    return this.buffers.keys();
  }

  /** Drop history for one contact (respawn teleport: snap, don't interpolate). */
  clear(id: string): void {
    this.buffers.get(id)?.clear();
  }

  /** Remove contacts not seen for `ttlMs` of server time. Returns removed ids. */
  prune(serverNow: number, ttlMs: number): string[] {
    const removed: string[] = [];
    for (const [id, seen] of this.lastSeen) {
      if (serverNow - seen <= ttlMs) continue;
      this.buffers.delete(id);
      this.lastSeen.delete(id);
      this.classes.delete(id);
      this.turretAngles.delete(id);
      this.launcherAngles.delete(id);
      removed.push(id);
    }
    return removed;
  }
}

/** Decode one frame's whole-degree angle key (`tu` / `lu`) into the id's
 *  reused array — or drop the id's entry when the key is absent. */
function pushAngles(
  into: Map<string, number[]>,
  id: string,
  wire: readonly number[] | undefined,
  decode: (i: number, q: number) => number,
): void {
  if (wire === undefined) {
    into.delete(id);
    return;
  }
  let out = into.get(id);
  if (out === undefined) {
    out = [];
    into.set(id, out);
  }
  out.length = wire.length;
  for (let i = 0; i < wire.length; i++) out[i] = decode(i, wire[i]);
}
