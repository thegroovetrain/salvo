// Snapshot interpolation for remote contacts (and the own ship in the
// interp-checkpoint render mode). Each entity keeps a short ring of
// timestamped kinematic snapshots fed from FrameMsg.contacts; the renderer
// samples at serverNow() - interpDelay with lerp (shortest-arc heading),
// dead-reckons up to MAX_EXTRAPOLATION_MS on underrun, then freezes.

import { lerpAngle, type Contact, type HullId } from '@salvo/shared';
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
  /** Static per-id hull id (a contact never changes hull mid-life; may be a
   *  drone id, so this is HullId, not just a pickable ShipClassId). */
  private classes = new Map<string, HullId>();
  /**
   * Ids whose LAST OBSERVED frame carried the self-private `aggro` mark (Story
   * 5.6, amendment 40) — a PvE fleet ship that has acquired US specifically.
   *
   * A SET, NOT A TIMESTAMP, and re-derived on every push: unlike `classes` this
   * is not static — the server omits the key the moment the hull's memory of us
   * expires, and the absence IS the de-aggro. A contact that stops appearing in
   * frames altogether keeps its last mark until prune drops it, which is
   * correct: its hull view is already fading out on the same beat.
   */
  private aggro = new Set<string>();
  /**
   * THE HULL MEMO (Story 5.6 follow-up): every hull id we have EVER observed a
   * contact wearing, NEVER cleared on prune.
   *
   * WHY IT EXISTS. `classes` above is deleted the moment a contact ages out, and
   * amendment 39 left `Contact.cls` as the client's ONLY channel for "is this a
   * PvE fleet hull" — so a fleet ship you sailed past and then MINED after it
   * dropped out of your contact set became unidentifiable, and its kill-feed
   * line read the neutral `UNKNOWN VESSEL` instead of `DRONE`. That is not an
   * exotic case: laying a trap and waiting is a Mine Layer's whole playstyle.
   *
   * WHY REMEMBERING IS HONEST. For that case the client genuinely DID observe
   * the hull. The memo asserts nothing it did not see — it only declines to
   * forget. A contact never changes hull mid-life, so a remembered id can never
   * go stale, and the population is bounded by the ids one match produces.
   *
   * WHY IT SURVIVES `SunkEvent.vcls`. The wire field names the victim of YOUR
   * OWN kills and is absent on every other observer's copy of the row — so the
   * memo still owns the case `vcls` cannot reach: a fleet sinking you WITNESSED
   * but were not credited with, on a hull that has since aged out. The two
   * compose (see net/roomBindings.ts `victimNameRef`) rather than competing.
   *
   * WHY IT IS SEPARATE FROM `classes` RATHER THAN `classes` SIMPLY SURVIVING
   * PRUNE: `classOf` going undefined on prune is LOAD-BEARING elsewhere — it is
   * the reason render/contacts.ts caches a view's hull id at creation, and
   * widening it would silently change the plate-offset path. Two questions, two
   * lifetimes, two maps.
   *
   * WHAT IT DELIBERATELY DOES NOT DO: a hull that was NEVER in our bubble and is
   * not our own kill is still absent here, and its feed line still reads
   * `UNKNOWN VESSEL`. We truly do not know what we are looking at. Do NOT
   * "complete" this by inferring drone-ness from an absent roster row either: a
   * DISCONNECTED captain's row is removed too, and the schema patch races the
   * `sunk` event in the same frame with no guaranteed ordering (the hazard
   * epic-4 amendment 221 names for `SunkEvent.bty`) — that would render a
   * departed captain as `DRONE`, a worse and far more visible wrong.
   */
  private everSeenClasses = new Map<string, HullId>();

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
      this.everSeenClasses.set(c.id, c.cls);
      if (c.aggro === true) this.aggro.add(c.id);
      else this.aggro.delete(c.id);
    }
  }

  get(id: string): SnapshotBuffer | undefined {
    return this.buffers.get(id);
  }

  /** The hull id of a LIVE contact (static, set on first sighting; undefined once
   *  the contact is pruned). Everything POSITIONAL reads this. */
  classOf(id: string): HullId | undefined {
    return this.classes.get(id);
  }

  /**
   * The hull id this contact was EVER seen wearing — a superset of `classOf`
   * that survives prune (see `everSeenClasses` for the full reasoning).
   *
   * Read it for questions about IDENTITY that outlive sight ("what was that
   * thing that just went down?"); read `classOf` for anything about the contact
   * we are currently holding. Superset BY CONSTRUCTION — both maps are written
   * on the same push — so a caller needs this alone and never a
   * `classOf(id) ?? …` chain, which would be dead code.
   */
  everSeenClassOf(id: string): HullId | undefined {
    return this.everSeenClasses.get(id);
  }

  /** Has this contact acquired US, as of its last observed frame? (Story 5.6 —
   *  self-private by construction: the server only ever sets `aggro` on the
   *  frame it sends to the observer being hunted.) */
  aggroOf(id: string): boolean {
    return this.aggro.has(id);
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
      this.aggro.delete(id);
      removed.push(id);
    }
    return removed;
  }
}
