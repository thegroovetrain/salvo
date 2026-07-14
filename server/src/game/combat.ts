// Gun fire control moved to weapons/guns.ts as part of the WeaponSystem
// generalization (step 12: guns, torpedoes, mines all implement one interface).
// Re-exported here so existing imports (world.ts, frames.ts, combat.test.ts)
// keep resolving `../game/combat.js`.
export * from './weapons/guns.js';
