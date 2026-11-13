// Snapshot interpolation for remote contacts (and the own ship in the
// interp-checkpoint render mode). Each entity keeps a short ring of
// timestamped kinematic snapshots fed from FrameMsg.contacts; the renderer
// samples at serverNow() - interpDelay with lerp (shortest-arc heading),
// dead-reckons up to MAX_EXTRAPOLATION_MS on underrun, then freezes.

import { decodeLauncherAngle, decodeTurretAngle, hullEnvelope, type Contact, type HullId, type PlainContact } from '@salvo/shared';
import { SnapshotBuffer } from './snapshotBuffer.js';
import { HandoffMarks, PlainContactStore, matchHandoff, type TierPoint } from './plainContacts.js';

export { MAX_EXTRAPOLATION_MS, RETENTION_MS, SnapshotBuffer, type Snapshot } from './snapshotBuffer.js';

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
   * reused across frames. SNAPPED, not interpolated: the turrets themselves
   * snap to their captain's aim (no traverse — Story 11.1 R16), so the latest
   * frame is the truth. Absent when the row carries no `tu`.
   */
  private turretAngles = new Map<string, number[]>();
  /**
   * THE CONTACT'S TORPEDO LAUNCHER ANGLES (Story 10.6, I7): the latest frame's
   * `Contact.lu`, decoded (`decodeLauncherAngle`) and SNAPPED exactly as the
   * turret angles are. Its LENGTH is the launcher count; tubes never travel.
   * Absent while the hull holds no torpedo (no `lu`).
   */
  private launcherAngles = new Map<string, number[]>();

  /**
   * THE PLAIN HULL CHANNEL (Story 11.2, R3) — `FrameMsg.pc`, ingested by the
   * same `pushFrame` call so the TIER HANDOFF sees both lists of one frame
   * (net/plainContacts.ts). Never part of `ids()`: a plain hull has no roster
   * id, so it gets no engine voice, no collision body and no targeting.
   */
  readonly plain = new PlainContactStore();
  /** Ids whose view must be born at full alpha (an inward handoff). */
  private readonly bornByHandoff = new HandoffMarks();
  /** Ids dropped by an outward handoff: their view goes at once, unfaded. */
  private readonly retiredByHandoff = new HandoffMarks();

  /**
   * Ingest one frame at server time `t`: its contact list and its plain-hull
   * rows (`pc`, omitted = none), then pair the hulls that changed tier on
   * this frame (`handoff`).
   */
  pushFrame(t: number, contacts: readonly Contact[], pc?: readonly PlainContact[]): void {
    const appeared: TierPoint[] = [];
    for (const c of contacts) {
      let buf = this.buffers.get(c.id);
      if (!buf) {
        buf = new SnapshotBuffer();
        this.buffers.set(c.id, buf);
        appeared.push({ key: c.id, x: c.x, y: c.y, t });
        this.retiredByHandoff.forget(c.id); // back on the wire: a stale retire mark must not kill its new view
      } else if (this.missedPreviousFrame(c.id)) {
        // A QUICK RE-ENTRY: the id still holds a TTL buffer from an earlier
        // disappearance, but for the handoff it is appearing on this frame.
        appeared.push({ key: c.id, x: c.x, y: c.y, t });
      }
      buf.push({ t, x: c.x, y: c.y, heading: c.heading, speed: c.speed });
      this.lastSeen.set(c.id, t);
      this.classes.set(c.id, c.cls);
      // An unknown hull id (a malformed row) decodes to no mount angles — never a throw that drops the frame's other contacts.
      const known = (hullEnvelope(c.cls) as unknown) !== undefined;
      pushAngles(this.turretAngles, c.id, known ? c.tu : undefined, (i, q) => decodeTurretAngle(c.cls, i, q));
      pushAngles(this.launcherAngles, c.id, known ? c.lu : undefined, (i, q) => decodeLauncherAngle(c.cls, i, q));
    }
    this.bornByHandoff.expire(t);
    this.retiredByHandoff.expire(t);
    const plainAppeared = this.plain.pushFrame(t, pc);
    this.handoff(t, appeared, plainAppeared);
    this.prevT = t;
  }

  /** Server time of the previous frame (undefined before the first). */
  private prevT: number | undefined;

  /** True when `id` was not on the previous frame (read before this frame's `lastSeen` update). */
  private missedPreviousFrame(id: string): boolean {
    const seen = this.lastSeen.get(id);
    return this.prevT !== undefined && seen !== undefined && seen < this.prevT;
  }

  /**
   * THE TIER HANDOFF (Story 11.2): INWARD, a new contact id near a plain
   * handle that just left → the handle is retired (its view goes at once) and
   * the contact's view is born at full alpha; OUTWARD, a new plain handle near
   * a contact that stopped arriving inside the handoff window → the contact is
   * dropped now (its view goes at once) and the handle's view is born at full
   * alpha. One hull on screen across the swap, never two. The server swaps
   * tiers ATOMICALLY, so outward pairs only with a contact that disappeared on
   * THIS frame. A new plain handle no handoff claimed then tries a PLAIN
   * RE-ENTRY (a one-frame dropout under a new handle — the view carries over).
   */
  private handoff(t: number, appeared: readonly TierPoint[], plainAppeared: readonly TierPoint[]): void {
    for (const [id, h] of matchHandoff(appeared, this.plain.recentlyDeparted())) {
      this.plain.retire(h, t);
      this.bornByHandoff.add(id, t);
    }
    const claimed = new Set<string>();
    for (const [h, id] of matchHandoff(plainAppeared, this.goneThisFrame())) {
      this.drop(id);
      this.retiredByHandoff.add(id, t);
      this.plain.markBornByHandoff(h, t);
      claimed.add(h);
    }
    this.plain.pairReentries(
      t,
      plainAppeared.filter((p) => !claimed.has(p.key)),
    );
  }

  /** Contacts that were on the previous frame and are missing from this one (newest pose each). */
  private goneThisFrame(): TierPoint[] {
    const out: TierPoint[] = [];
    if (this.prevT === undefined) return out;
    for (const [id, seen] of this.lastSeen) {
      const last = seen === this.prevT ? this.buffers.get(id)?.newest : undefined;
      if (last) out.push({ key: id, x: last.x, y: last.y, t: seen });
    }
    return out;
  }

  /** One-shot: was contact `id` born by a handoff? (its view skips the fade-in) */
  takeBornByHandoff(id: string): boolean {
    return this.bornByHandoff.take(id);
  }

  /** One-shot: was contact `id` dropped by a handoff? (its view goes unfaded) */
  takeRetiredByHandoff(id: string): boolean {
    return this.retiredByHandoff.take(id);
  }

  /** Forget one contact entirely, now (the prune's removal, for one id). */
  private drop(id: string): void {
    this.buffers.delete(id);
    this.lastSeen.delete(id);
    this.classes.delete(id);
    this.turretAngles.delete(id);
    this.launcherAngles.delete(id);
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
      this.drop(id);
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
