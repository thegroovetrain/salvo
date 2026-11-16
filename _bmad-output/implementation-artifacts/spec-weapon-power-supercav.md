---
title: 'Weapon power per tier (+10), supercav base 300, shot mines destroyed'
type: 'balance'
created: '2026-11-16'
status: 'done'
review_loop_iteration: 0
baseline_revision: '64d9a27c'
context: ['batch-sim-evidence-2026-11-15.md', 'epic-11-context-amendments.md#17']
warnings: []
---

<intent-contract>

## Intent

**Problem:** Eric (2026-11-15): Tier V supercavs one-shot full hulls regardless of armor (a bare Yamato's Tier V supercav hit a Warspite for 1028 of 1000 hp).

**Approach (Eric's rulings, epic-11 amendment 17):** weapon damage stays its Tier I base; each tier above I adds +10 POWER to that weapon's own hits at the damage gate; supercav base damage 300; a mine shot to 0 hp is destroyed, never detonated.

</intent-contract>

## Result

- `CONFIG.armor.weaponPowerPerTier = 10`; server gate `world.ts weaponPowerOf`; projectiles stamp `weapon`; mine blasts map by kind; burn is phosphor's.
- Damage steps removed from every weapon ladder (`sim/catalog.ts`); `CONFIG.supercavTorpedo.damage` 400 → 300.
- `World.popMine`: every kind is consumed with its boom; no blast / slow / chain.
- Mine triggers: `mine.triggerFactor` 2/3 → 0.4 (naval + fouling), `mine.triggerRadius` 32 → 19.2, captive `triggerRadius` 120 → 180.
- Battle HUD: a weapon row's damage adds that weapon's tier POWER (`weaponPowerFor`, shared with the gate), so the number climbs with each tier and the hover preview shows the gain.
- Tier V supercav worst case (POWER V Yamato into a bare Iowa): 1286 → 498 hp.
- Client burn identity: `BURN_AMOUNT_CAP` now includes the damage curve's ×2 bound, so a burn tick raised by POWER and phosphor's weapon POWER never misreads as an impact.
- Tests: ladder-number pins deleted (Eric: balance numbers are never tests); three mine fixtures that parked a hull at a literal distance now derive it from CONFIG and the hull's own outline (verified at a 0.6 trigger factor too); the captive damage test computes its expected hit from CONFIG and the shared curve; six mine-pop tests flipped to the new rule.
- Cycle 239, 0.19.33, PV 108 → 109.
