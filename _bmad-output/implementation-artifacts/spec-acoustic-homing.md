---
title: 'Acoustic homing standard on light / heavy / captive torpedoes; heavy reload 40 s, light damage 250, Iowa ARMOR 95'
type: 'balance'
created: '2026-11-16'
status: 'done'
review_loop_iteration: 0
context: ['epic-11-context-amendments.md#20', 'batch-sim-evidence-2026-11-16.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** with tracking bought by tiers, a Tier I light or heavy torpedo was a straight-runner and the supercav dominated the torpedo slot (shipped: kills per holder 0.09 / 0.16 / 0.53).

**Approach (Eric's rulings, epic-11 amendment 20):** acoustic homing standard from Tier I, scaled by the target's engine noise; heavy reload 40 s, light damage 250, Iowa ARMOR 95.

</intent-contract>

## Result

- `sim/shell.ts`: `Target.loud`; `homing.acoustic` → `steerAcoustic` (loudest legal target in range, turn = rate × loudness; a locked captive keeps its victim).
- `sim/stats.ts`: light / heavy rows home at `CONFIG.torpedo.homingTurnRate`, captive at `CONFIG.captiveMines.homingTurnRate`; `sim/catalog.ts`: homing tier steps removed.
- Server: hull targets carry loudness (ENGINES / 100 × |throttle|); light / heavy / captive launches are acoustic.
- CONFIG: heavy reloadMs 40000, light damage 250, Iowa armor 95.
- How-to-Play: light / heavy "Homes in on the loudest ship nearby."
- Tests: new pure steering tests (loudest wins, turn = rate × loudness, silent never locked, locked fish follows its victim's noise); tiered-homing tests deleted or re-fixtured from CONFIG; the radar golden re-recorded.
- Cycle 242, 0.19.36, PV 109 → 110.
