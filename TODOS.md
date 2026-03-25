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

## AI

### Team-Aware Bot Shot Coordination (Simultaneous Mode)

**What:** When multiple bots on the same team fire simultaneously (not current turn-based mode), coordinate their targets to avoid redundant shots on the same cell. Bots partition targets: "I'll finish this ship, you hunt for new ones."

**Why:** In the current turn-based system, bots fire sequentially and can't target already-shot cells, so coordination is moot. But if simultaneous mode is implemented (all players fire at once), same-team bots would waste shots firing at the same cells.

**Context:** The doctrine + gunnery architecture from the AI overhaul (v0.14.0) provides the foundation — doctrine selection could include a team coordination layer that shares target assignments between same-team bots. Would require passing a "claimed cells" set between bot salvo calculations. Deferred from CEO review of the AI difficulty overhaul.

**Effort:** M
**Priority:** P3
**Depends on:** AI difficulty overhaul + simultaneous mode (if implemented)

## Game Options

### Hide Ship Name Until Sunk

**What:** Add an optional game rule where the type of ship hit is not revealed until the ship sinks. Only "hit" or "miss" is communicated — no ship name.

**Why:** Adds strategic depth — you know you hit someone but not whether it's their Scout or Dreadnought. This is a classic naval combat variant rule that some players prefer for the added mystery.

**Context:** Currently `PlayerHit` includes `shipLength` on every hit, which lets the client display the ship name via `SHIP_NAMES[shipLength]`. To implement: strip `shipLength` from non-sunk hits in `toClientView()` when this option is enabled. Would be a game options toggle in the create-game flow. Deferred from v0.10.2 CEO review.

**Effort:** S
**Priority:** P3
**Depends on:** None
