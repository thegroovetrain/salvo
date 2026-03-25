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

**What:** Comprehensive pass at remaining sound effects — team events (teammate eliminated, team chat received), timer warnings, chat notifications. Core salvo/placement/game-over sounds already shipped in v0.12.0.

**Why:** v0.12.0 added the CIC sound foundation (generic `playTone()`, salvo miss/hit/sunk, placement confirm, game-over summary). Remaining gaps: team-specific events, timer warning tones, chat notification sounds.

**Context:** The `playTone()` generic function now lives in `client/src/audio/index.ts` (extracted in v0.13.1) — adding new tones is trivial (one function call with frequency parameters). The mute toggle already works for all tones. Focus is on which events deserve audio feedback and tuning the frequencies to feel right.

**Effort:** S (reduced from M — foundation exists)
**Priority:** P3 (reduced from P2 — core sounds shipped)
**Depends on:** None

## Hex Grid

### AI Difficulty Rebalancing for Hex Grid

**What:** Evaluate and rebalance AI difficulty tiers (Easy/Medium/Hard/Impossible) for the hex grid. 6-neighbor adjacency makes Medium's hunt/target more effective, and hex 3-coloring makes Hard's hunt pattern cover 1/3 of cells (vs checkerboard's 1/2 on square grid).

**Why:** The difficulty curve may have shifted with the hex conversion. Medium could feel harder than intended, and Hard's 3-coloring is more efficient at finding ships. Need playtest data from the friend test to confirm.

**Context:** AI was rewritten in v0.11.0 for hex: `getAdjacentCoords()` now returns 6 neighbors (was 4), checkerboard hunt replaced with hex 3-coloring `((q-r) % 3 + 3) % 3`. Interior biasing uses ring distance instead of row/col edges. Impossible still cheats. Easy still random. The balance question is whether Medium and Hard feel right relative to each other and to human play.

**Effort:** S
**Priority:** P3
**Depends on:** v0.11.0 hex grid + friend test feedback

## Game Options

### Hide Ship Name Until Sunk

**What:** Add an optional game rule where the type of ship hit is not revealed until the ship sinks. Only "hit" or "miss" is communicated — no ship name.

**Why:** Adds strategic depth — you know you hit someone but not whether it's their Scout or Dreadnought. This is a classic naval combat variant rule that some players prefer for the added mystery.

**Context:** Currently `PlayerHit` includes `shipLength` on every hit, which lets the client display the ship name via `SHIP_NAMES[shipLength]`. To implement: strip `shipLength` from non-sunk hits in `toClientView()` when this option is enabled. Would be a game options toggle in the create-game flow. Deferred from v0.10.2 CEO review.

**Effort:** S
**Priority:** P3
**Depends on:** None
