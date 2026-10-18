// The predictor's HULL pass (Story 9.5, epic-9 amendment 74): the own hull
// pushed apart from the sighted contacts by the ONE shared resolver
// (`resolveHullContacts`, shared sim/contact.ts) — the same function the
// server's hull row runs, at the same place in the tick (after the step,
// BEFORE the land pass), so a hull pressed against another lands in the same
// place on both sides up to what the client cannot know (a contact's upgrades,
// the 100 ms interpolation lag). The reconcile covers that residue.
//
// CONTACT BODIES ARE RESTORED BEFORE EVERY PASS. The resolver translates every
// movable body it pushes — contacts included, because the mass share must
// match the server's (a contact is `movable: true`). The caller hands over
// freshly built bodies once per render frame, but one reconcile replays
// several ticks against that ONE set, and two sim ticks can run inside one
// render frame. So `set` snapshots each body's pose and world polygon, and
// every pass starts from that snapshot: a replay of N pending inputs pushes
// each contact once, never N times stacked.
//
// Allocation: the body list, the own polygon and the snapshot are reused; the
// only per-pass allocation is inside the shared resolver.

import {
  resolveHullContacts,
  transformPolygon,
  type ContactBody,
  type HullContact,
  type ShipState,
  type Vec2,
} from '@salvo/shared';

export class HullContactPass {
  private contacts: readonly ContactBody[] = [];
  /** Per contact: x, y, then every polygon vertex's x, y — the pass's start. */
  private readonly base: number[] = [];
  private readonly bodies: ContactBody[] = [];
  private readonly ownPoly: Vec2[] = [];
  private readonly own: ContactBody = {
    id: '',
    state: { x: 0, y: 0, heading: 0, speed: 0 },
    poly: this.ownPoly,
    mass: 1,
    movable: true,
  };
  private readonly rows: HullContact[] = [];
  /** The own hull's id — orients the pair rows and picks out the own rows. */
  ownId = '';
  /** hp — the own hull's EFFECTIVE max hull (`effectiveStats().maxHp`). */
  ownMass = 1;

  /** True iff there is at least one contact to push against. */
  get active(): boolean {
    return this.contacts.length > 0;
  }

  /** Hold this frame's contact bodies (by reference) and snapshot their poses. */
  set(bodies: readonly ContactBody[]): void {
    this.contacts = bodies;
    const b = this.base;
    b.length = 0;
    for (const c of bodies) {
      b.push(c.state.x, c.state.y);
      for (const p of c.poly) b.push(p.x, p.y);
    }
  }

  /**
   * One hull pass on the own state `s` (mutated: x/y by its mass share).
   * `localPoly` is the own LOCAL silhouette. When `ownOut` is given it is
   * refilled with the rows that involve the own hull.
   */
  run(s: ShipState, localPoly: readonly Vec2[], ownOut: HullContact[] | null): void {
    this.restore();
    const bodies = this.bodies;
    bodies.length = 0;
    const own = this.own;
    own.id = this.ownId;
    own.state = s;
    own.mass = this.ownMass;
    transformPolygon(localPoly, s.x, s.y, s.heading, this.ownPoly);
    bodies.push(own);
    for (const c of this.contacts) bodies.push(c);
    resolveHullContacts(bodies, this.rows);
    if (ownOut === null) return;
    ownOut.length = 0;
    for (const r of this.rows) if (r.a === this.ownId || r.b === this.ownId) ownOut.push(r);
  }

  /** Put every contact body back at the pose `set` snapshotted. */
  private restore(): void {
    const b = this.base;
    let i = 0;
    for (const c of this.contacts) {
      c.state.x = b[i++];
      c.state.y = b[i++];
      for (const p of c.poly) {
        p.x = b[i++];
        p.y = b[i++];
      }
    }
  }
}
