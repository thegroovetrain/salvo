// The predictor's contact bodies (Story 9.5, epic-9 amendment 74): one
// `ContactBody` per SIGHTED contact, built once per render frame from the SAME
// interpolated poses the renderer draws (the contact store sampled at
// `serverNow − interpDelayMs`) and handed to `Predictor.setContacts`.
//
// WHAT COUNTS AS SIGHTED. A contact the store still produces a LIVE pose for:
// the sample time is no further past its last observed frame than the buffer's
// own dead-reckoning limit (`MAX_EXTRAPOLATION_MS`). Past that the buffer
// freezes a ghost where the hull USED to be — a hull that slipped out of sight
// or foundered (its frames stop at founder) — and a ghost must never shove the
// own hull. Sinking hulls still ride the frames and stay solid (amendment 82).
//
// MASS. A contact's class base hp (or the drone envelope's) through the shared
// `hullEnvelope`: the client cannot know a contact's upgrades, and the share
// error is bounded by the overlap depth, which the reconcile folds away.
//
// ALLOCATION. One body (state + world polygon scratch) per id, created on its
// first sighting and dropped when the store no longer holds the id — never per
// frame. The returned list is reused.

import { hullEnvelope, hullSilhouette, transformPolygon, type ContactBody, type HullId } from '@salvo/shared';
import { MAX_EXTRAPOLATION_MS, type Snapshot } from '../net/snapshots.js';

/** The slice of the contact store the builder reads (net/snapshots.ts). */
export interface ContactPoseSource {
  ids(): Iterable<string>;
  classOf(id: string): HullId | undefined;
  lastSeenAt(id: string): number | undefined;
  get(id: string): { sampleAt(t: number): Snapshot | null } | undefined;
}

export class ContactBodies {
  private readonly byId = new Map<string, ContactBody>();
  private readonly list: ContactBody[] = [];
  private readonly held = new Set<string>();

  /**
   * This frame's bodies: every sighted contact except `ownId`, posed at `at`
   * (server ms). The list (and its bodies) is reused by the next call.
   */
  build(src: ContactPoseSource, at: number, ownId: string): readonly ContactBody[] {
    this.list.length = 0;
    this.held.clear();
    for (const id of src.ids()) {
      this.held.add(id);
      if (id === ownId) continue;
      const body = this.bodyAt(src, id, at);
      if (body !== null) this.list.push(body);
    }
    for (const id of this.byId.keys()) if (!this.held.has(id)) this.byId.delete(id);
    return this.list;
  }

  /** The id's body posed at `at`, or null when it has no live pose. */
  private bodyAt(src: ContactPoseSource, id: string, at: number): ContactBody | null {
    const cls = src.classOf(id);
    const seen = src.lastSeenAt(id);
    if (cls === undefined || seen === undefined || at - seen > MAX_EXTRAPOLATION_MS) return null;
    const pose = src.get(id)?.sampleAt(at);
    if (pose === null || pose === undefined) return null;
    const body = this.bodyFor(id, cls);
    const st = body.state;
    st.x = pose.x;
    st.y = pose.y;
    st.heading = pose.heading;
    st.speed = pose.speed;
    transformPolygon(hullSilhouette(cls), pose.x, pose.y, pose.heading, body.poly);
    return body;
  }

  private bodyFor(id: string, cls: HullId): ContactBody {
    let body = this.byId.get(id);
    if (body === undefined) {
      body = { id, state: { x: 0, y: 0, heading: 0, speed: 0 }, poly: [], mass: 0, movable: true };
      this.byId.set(id, body);
    }
    body.mass = hullEnvelope(cls).hp;
    return body;
  }
}
