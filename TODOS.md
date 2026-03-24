# TODOS

## 2v2 Teams

### Friendly Fire Stats Differentiation

**What:** Track self-hits vs teammate-hits separately in PlayerGameStats. Add "Worst Teammate" highlight for excessive teammate hits. Consider distinct grid color for teammate-ship hits.

**Why:** In 2v2, hitting your teammate's ships is mechanically different from hitting your own — it hurts your team. However, shared-ocean overlap means friendly fire can be strategically necessary (enemy ship at same coordinate). The griefing angle (intentionally targeting teammate) needs exploration before implementing penalties.

**Context:** Currently `friendlyFireHits` counts only self-hits. Would need a `teammateHits` field on PlayerGameStats, updates in `fireSalvo()` to distinguish self vs teammate, and a new highlight. The grid color question (distinct color for teammate-hit vs self-hit) needs design work. Deferred from v0.10.0 CEO review for deeper exploration of the griefing vs strategy tension.

**Effort:** S
**Priority:** P3
**Depends on:** 2v2 team mode (v0.10.0)

### Full Sound Effects Audit

**What:** Comprehensive pass at sound effects across all game modes — not just team events, but placement, shots, hits, sinks, game over, chat notifications, etc.

**Why:** Currently only the Quick Play match-found sound exists. A full sound design pass would make the game feel more alive and provide audio feedback for key moments. Should be done holistically rather than piecemeal.

**Context:** The existing sound system in main.ts uses simple AudioContext beeps (no sound files). Adding tones for team events (teammate places ships, teammate eliminated, team chat received) plus general events (shot hit, ship sunk, your turn, timer warning) would enhance the experience significantly. Deferred from v0.10.0 CEO review to do as a focused effort.

**Effort:** M
**Priority:** P2
**Depends on:** None (can be done anytime)

## Game Options

### Hide Ship Name Until Sunk

**What:** Add an optional game rule (Battleship variant) where the type of ship hit is not revealed until the ship sinks. Only "hit" or "miss" is communicated — no ship name.

**Why:** Adds strategic depth — you know you hit someone but not whether it's their Scout or Battleship. This is a real Battleship variant rule that some players prefer for the added mystery.

**Context:** Currently `PlayerHit` includes `shipLength` on every hit, which lets the client display the ship name via `SHIP_NAMES[shipLength]`. To implement: strip `shipLength` from non-sunk hits in `toClientView()` when this option is enabled. Would be a game options toggle in the create-game flow. Deferred from v0.10.2 CEO review.

**Effort:** S
**Priority:** P3
**Depends on:** None
