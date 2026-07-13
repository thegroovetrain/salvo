// @salvo/shared — single barrel export for the real-time prototype.
// Wire types, kinematics, and mapgen land here in later build-order steps.

/** Bumped on any breaking change to the client/server wire protocol. */
export const PROTOCOL_VERSION = 1;

/** Placeholder constants object; real CONFIG (constants.ts) arrives in step 2. */
export const SHARED = {
  PROTOCOL_VERSION,
} as const;
