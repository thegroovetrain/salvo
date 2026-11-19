// Snapshot interpolation for remote contacts (and the own ship in the
// interp-checkpoint render mode). Each entity keeps a short ring of
// timestamped kinematic snapshots fed from FrameMsg.contacts; the renderer
// samples at serverNow() - interpDelay with lerp (shortest-arc heading),
// dead-reckons up to MAX_EXTRAPOLATION_MS on underrun, then freezes.

import { CONFIG, decodeLauncherAngle, decodeTurretAngle, hullEnvelope, type Contact, type HullId } from '@salvo/shared';
import { SnapshotBuffer } from './snapshotBuffer.js';

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
  /** THE CONTACT'S HULL BAR STEP (Story 12.3): the latest frame's `Contact.hb`
   *  (1..CONFIG.hullBar.blocks). Absent while the row carries none. */
  private hullBlocks = new Map<string, number>();

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
      pushBlocks(this.hullBlocks, c.id, c.hb);
    }
  }

  /** Forget one contact entirely, now (the prune's removal, for one id). */
  private drop(id: string): void {
    this.buffers.delete(id);
    this.lastSeen.delete(id);
    this.classes.delete(id);
    this.turretAngles.delete(id);
    this.launcherAngles.delete(id);
    this.hullBlocks.delete(id);
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

  /** The contact's hull bar step (`Contact.hb`) as of its last frame, or
   *  undefined when it carried none or is pruned. */
  hullBlocksOf(id: string): number | undefined {
    return this.hullBlocks.get(id);
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

/** Record one frame's `hb` for `id` — an integer in 1..CONFIG.hullBar.blocks,
 *  anything else (absent, malformed) clears it, so a bad row never draws a bar. */
function pushBlocks(into: Map<string, number>, id: string, hb: unknown): void {
  if (typeof hb === 'number' && Number.isInteger(hb) && hb >= 1 && hb <= CONFIG.hullBar.blocks) into.set(id, hb);
  else into.delete(id);
}
