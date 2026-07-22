// @salvo/shared — single barrel for the real-time prototype.
// Wire types, kinematics, geometry, and deterministic mapgen used by both
// the Colyseus server and the Pixi client (client-side prediction).

/** Bumped on any breaking change to the client/server wire protocol.
 *  8: battleship loadout (Story 1.7) — FrameMsg gains optional litZones
 *  (LitZoneView {id,x,y,r,until,by}: star-shell lit zones, owner-always /
 *  radar-gated circle); CONFIG gains cannon + starShells blocks (rides the
 *  welcome config snapshot); the battleship fit becomes
 *  [gun, cannon, starShells, empty].
 *  7: torpedo-boat loadout (Story 1.6) — InputMsg gains required actSeq/actSlot
 *  (instant ability activation); OwnShip gains required owner-only boostUntil
 *  (active speed-boost window end, server-clock ms).
 *  6: firing under latency (D1) — InputMsg gains required fireT (client
 *  server-clock fire timestamp, 0 = no claim); new 'p' ping channel
 *  (PingMsg/PongMsg) for server-side RTT measurement.
 *  5: universal standard gun — InputMsg.weapon (WeaponId) replaced by
 *  InputMsg.slot (loadout slot index); OwnShip.weapon removed; OwnShip.ammo
 *  became slot-aligned (WeaponAmmo | null)[]; new 'burst' GameEvent;
 *  WeaponId/WEAPON retired from the wire contract.
 *  4: three-hull-envelopes re-scope — the `cls` values on the wire changed
 *  (torpedoBoat/battleship/mineLayer classes; Contact.cls widened to HullId
 *  with droneSmall/droneMedium/droneLarge).
 *  3: Colyseus 0.17 / @colyseus/schema 4.x serializer wire break. NOTE: this
 *  constant IS a runtime join gate (since 1.4): the server rejects a
 *  mismatched-or-missing client `pv` at matchmake time with a clean version
 *  error (server/src/rooms/roomOptions.ts protocolVersionError), before any
 *  seat is reserved. */
export const PROTOCOL_VERSION = 8;

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
export * from './sim/boost.js';
export * from './sim/offers.js';
export * from './sim/collision.js';
export * from './sim/silhouette.js';
export * from './sim/shell.js';
export * from './sim/map.js';
export * from './sim/zone.js';
