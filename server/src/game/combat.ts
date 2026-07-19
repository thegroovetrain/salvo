// Gun fire control moved to equipment/guns.ts (step 12 moved it out of this
// file into weapons/, which Story 1.2 ported to the Equipment interface: guns,
// torpedoes, mines all implement one interface). Re-exported here so existing
// imports (combat.test.ts) keep resolving `../game/combat.js`.
export * from './equipment/guns.js';
