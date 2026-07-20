// @salvo/shared — single barrel for the real-time prototype.
// Wire types, kinematics, geometry, and deterministic mapgen used by both
// the Colyseus server and the Pixi client (client-side prediction).

/** Bumped on any breaking change to the client/server wire protocol.
 *  4: three-hull-envelopes re-scope — the `cls` values on the wire changed
 *  (torpedoBoat/battleship/mineLayer classes; Contact.cls widened to HullId
 *  with droneSmall/droneMedium/droneLarge).
 *  3: Colyseus 0.17 / @colyseus/schema 4.x serializer wire break. NOTE: this
 *  constant is documentation, not (yet) a runtime gate — a stale bundle
 *  fails at schema decode, not with a clean version rejection. A join-time
 *  version check is deferred work (see reconnection stories). */
export const PROTOCOL_VERSION = 4;

// Tunables
export * from './constants.js';

// Wire contract
export * from './types.js';

// Math
export * from './math/vec.js';
export * from './math/angle.js';
export * from './math/geom.js';
export * from './math/rng.js';

// Simulation
export * from './sim/ship.js';
export * from './sim/stats.js';
export * from './sim/loadout.js';
export * from './sim/offers.js';
export * from './sim/collision.js';
export * from './sim/silhouette.js';
export * from './sim/shell.js';
export * from './sim/map.js';
export * from './sim/zone.js';
