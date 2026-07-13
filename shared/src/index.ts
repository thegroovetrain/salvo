// @salvo/shared — single barrel for the real-time prototype.
// Wire types, kinematics, geometry, and deterministic mapgen used by both
// the Colyseus server and the Pixi client (client-side prediction).

/** Bumped on any breaking change to the client/server wire protocol. */
export const PROTOCOL_VERSION = 1;

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
export * from './sim/collision.js';
export * from './sim/shell.js';
export * from './sim/map.js';
