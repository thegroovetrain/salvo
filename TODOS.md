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

## Party System

### Quick Play vs Bots

**What:** Add a "vs Bots" option in the PLAY modal alongside Quick Play modes and Custom Match. Party instantly enters a game against AI opponents with no matchmaking wait. Bot difficulty selectable (Easy/Medium/Hard/Impossible). Game fills remaining seats with bots to match the selected mode's player count.

**Why:** Parties who don't want to wait for matchmaking (or are testing with friends) can instantly play together. Also useful for solo players who want a quick game without waiting for opponents. The AI doctrine/gunnery system (v0.14.0) is already capable — this just needs a new entry point that bypasses the queue.

**Context:** Currently bots are only available in private lobbies (host manually adds them). This feature would expose bot games as a first-class option from the PLAY modal. Implementation: create a game with the party members + fill remaining seats with bots at selected difficulty, skip queue entirely. Deferred from v0.15.0 design review to keep Phase 1 focused on the party social layer.

**Effort:** S (queue bypass + bot fill logic exists, just needs a new entry point)
**Priority:** P2
**Depends on:** Party system (v0.15.0)

## Chat

### Emoji-Only Communication System

**What:** Replace free-text chat with a predefined emoji/reaction system. Players pick from a curated set of naval-themed emojis (anchor, skull, wave, thumbs up/down, etc.) instead of typing messages. Applies to both in-game chat and future party chat.

**Why:** Eliminates moderation burden for a public beta. No profanity filters, no report system, no toxicity concerns. Current free-text chat creates abuse potential that requires either moderation infrastructure or community risk.

**Context:** The existing chat system (ChatMessage with team/global channels, rendering in `client/src/rendering/chat.ts`) would need a UI overhaul — replace the text input with an emoji picker grid. Server-side routing stays the same (ChatMessage.text becomes an emoji code). Deferred from Sprint 1b CEO review where the user flagged chat moderation as a concern.

**Effort:** M (human: ~1 week / CC: ~30min)
**Priority:** P2
**Depends on:** None (can be done independently, ideally before public beta)

## Replays

### Event-Sourced Game State

**What:** Refactor Game state mutations (fireSalvo, placeShips, startGame, etc.) to append events to an event log. Current state is still derived from direct mutations, but the event log enables replay by replaying the event sequence.

**Why:** Enables replays and spectator mode (both on post-beta roadmap). Game state changes are already well-defined transitions — fireSalvo produces hits/misses, placeShips assigns positions. These map cleanly to events. Also enables post-game analysis tools.

**Context:** Originally considered for party state in Sprint 1b, but two independent AI reviews flagged it as premature for transient in-memory objects. Game state is the right first target because: (1) games are the product — replays have user value, (2) game state transitions are already pure functions in `game.ts`, (3) `toClientView()` security boundary already serializes state — event replay would feed through the same chokepoint.

**Effort:** L (human: ~3 weeks / CC: ~2hrs) — touches core game loop
**Priority:** P2
**Depends on:** Game stabilization post-beta

## Game Options

### Hide Ship Name Until Sunk

**What:** Add an optional game rule where the type of ship hit is not revealed until the ship sinks. Only "hit" or "miss" is communicated — no ship name.

**Why:** Adds strategic depth — you know you hit someone but not whether it's their Destroyer or Dreadnought. This is a classic naval combat variant rule that some players prefer for the added mystery.

**Context:** Currently `PlayerHit` includes `shipLength` on every hit, which lets the client display the ship name via `SHIP_NAMES[shipLength]`. To implement: strip `shipLength` from non-sunk hits in `toClientView()` when this option is enabled. Would be a game options toggle in the create-game flow. Deferred from v0.10.2 CEO review.

**Effort:** S
**Priority:** P3
**Depends on:** None
