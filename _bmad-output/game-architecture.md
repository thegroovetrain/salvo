---
title: 'Game Architecture'
project: 'Hullcracker.io'
date: '2026-07-17'
author: 'Eric'
version: '1.0'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
status: 'complete'
engine: 'Custom TypeScript (Colyseus 0.17 + PixiJS 8.19, npm-workspaces monorepo)'
platform: 'Desktop browser (keyboard + mouse)'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md'
epics: '_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/epics.md'
brief: '_bmad-output/planning-artifacts/briefs/brief-Hullcracker.io-2026-07-15/brief.md'
---

# Game Architecture

## Executive Summary

**Hullcracker.io**'s architecture governs the evolution of a working v0.16 prototype (649
tests) into a public beta, on a **custom TypeScript engine** — an npm-workspaces monorepo
(`shared` deterministic sim → `server` Colyseus 0.17 + `client` PixiJS 8.19) targeting the
**desktop browser**. The custom engine is ratified as the *superior* AI-agent substrate: an
all-text source of truth with a test-suite oracle, where engine MCPs would solve an opacity
problem this project doesn't have.

**Key architectural decisions:**

- **Firing under latency** — bounded, RTT-clamped fire-time compensation; hits always resolve
  against live server state (no victim rewind), preserving the Narrow Escape. Tick ratified 20 Hz.
- **Boons in two homes** — numeric effects through the `effectiveStats()` firewall; slot and
  behavior changes through loadout state + pure, parity-tested shared hooks. Survives an
  undecided catalog and a future heal.
- **Perception as a signal registry** — every spatial signal is one declarative row with
  visibility + materialization + auto-extended invariant coverage; the fog cannot silently leak.
- **Structural fairness** — combat bots consume the same `observe()` boundary as clients and
  cannot wallhack; counter-intel lies are real server entities reusing genuine signal rows.
- **Scale as a deploy-time knob** — Render for weekend playtests; the 0.16→0.17 upgrade +
  Colyseus Cloud move is work item #0, executed as one motion before the first stranger.

**Structure:** layer-first monorepo, 5 fully-designed novel patterns + 4 ratified standard
patterns, 12 enforced consistency rules. **Validated PASS. Ready for:** the epic
implementation phase (E1–E7).

---

## Document Status

Created through the GDS Architecture Workflow. **Status: COMPLETE** — all 9 steps.

**Steps Completed:** 9 of 9 (Initialize, Project Context, Engine Selection, Architectural Decisions, Cross-cutting Concerns, Project Structure, Implementation Patterns, Validation, Completion)

---

## Project Context

### Game Overview

**Hullcracker.io** — a real-time, top-down naval battle royale in the browser. One captain
per warship on a shrinking, procedurally seeded island ocean; two-tier fog of war (truesight
bubble + rotating radar sweep) makes information the primary resource. Battleship's
hidden-information DNA with World of Warships' feel and none of its weight; matches complete
inside ~15 minutes. Last hull floating wins.

### Technical Scope

**Platform:** Desktop browser (Chrome, Edge, Firefox, Safari), keyboard + mouse. Mobile out of scope.
**Genre:** Top-down real-time shooter (naval battle royale, .io)
**Project Level:** Working prototype (v0.16.0, 649 tests) evolving to public beta — this
architecture governs the beta delta (epics E1–E7), not a greenfield build.
**Team:** Solo developer (30-year engineer) + AI agents. Scope discipline is the survival
constraint; this document's job is AI-agent implementation consistency.

### Core Systems

| System | Complexity | Source |
|---|---|---|
| Slot grammar: universal gun + 2 class specials + 1 economy-filled slot (3 classes at beta; re-scoped 2026-07-19) | High | GDD Weapon Systems, E1 |
| Boon economy: passive XP tick + kill bonuses → pre-rolled 4-boon offers; offer types span numeric slot upgrades, slot fill/replace, and slot behavior changes (catalog undecided; not directly Hades) | High | GDD Upgrade Economy, E2 |
| Aim reconciliation under latency (lag compensation decision) | High | GDD Dependencies — delegated to architecture |
| Perception/sensors: truesight + radar sweep + NEW listening ring; class-legible blips | High | GDD Sensor Suite, E6 |
| Information texture: hit call, fall-of-shot, muzzle flash carries, wounded smoke, foghorn, Bounty | Medium-High | E6 |
| Living ocean: fog banks, hemisphered whirlpools, roving PvE fleets (3 tiers), sinking window | Medium-High | E4 |
| Phased ring storm: 3×4min groups, minute rhythm, Endgame Guarantee (2 truesight diameters) | Medium | E3 |
| Lobbies & modes: min-2 fill-or-timer, cap 20, no bot-fill, roster-scaled maps, Solo vs AI combat bots | Medium-High | E5 |
| Portal launch: Chromebook 60 FPS, <10 s load, Poki/CrazyGames SDK compliance | Medium | E7 |

### Technical Requirements

- **Simulation:** authoritative 20 Hz (50 ms) fixed-tick server; deterministic shared sim
  (same pure functions both sides) enabling client-side prediction with reconcile-and-replay;
  contacts snapshot-interpolated ~100 ms behind.
- **Performance:** 60 FPS sustained on a low-end school Chromebook in a full 20-ship match with
  all effects; portal click → playable in <~10 s; feel intact at ~150 ms residential latency —
  operationalized as measurable proxies (hit-registration agreement %, prediction-error bounds)
  defined in this document, not assessed by feel alone.
- **Networking:** client-server over Colyseus 0.16 (WebSocket); roster via schema sync, all
  spatial state via per-client frames; PROTOCOL_VERSION gates wire breaks.
- **Transport:** WebSocket (TCP) is the incumbent; its real risk at ~150 ms is head-of-line
  blocking under packet loss, not latency. Transport choice is an explicit engine-selection
  criterion (Step 3), evaluated jointly with the lag-compensation decision.
- **Scalability:** the architecture must survive a portal-launch traffic spike ("hug of
  death"). Monorepo is retained; the server tier must scale horizontally — multiple match
  processes/instances behind matchmaking, no single-process assumptions baked into room or
  lobby design. Scale-out capability is an engine-selection evaluation criterion (Step 3).
  Posture: constraints now, infrastructure later — scale-out is a deploy-time knob, not a
  launch-day platform build.
- **Anti-cheat (structural):** everything spatial leaving the server passes through the
  perception boundary — nothing outside sight ∪ this-tick radar paints reaches any client;
  counter-intel lies live on the server and are wire-indistinguishable; player intent enters
  only through validated input messages.
- **Determinism:** seeded mulberry32 RNG streams only; maps rebuild from seed (never on the
  wire); no Math.random()/Date.now() in sim code.
- **Test harnesses as infrastructure:** (a) the drone-lobby batch-sim harness (committed for
  economy tuning) doubles as the pre-launch load-test harness; (b) a simulated-latency
  harness (~150 ms + jitter + loss) gates feel via the measurable proxies above; (c)
  sim-parity property tests are mandatory for every new shared-sim feature; (d) the
  add-a-signal pattern includes perception-invariant extension and, for counter-intel
  objects, wire-indistinguishability tests as definition of done — enforced as a per-epic
  gate, not an aspiration.
- **Assets:** procedural vector linework + synthesized WebAudio tones — no texture/model/audio
  file pipeline; bundle stays within portal size limits.

### Complexity Drivers

1. **Boon effect taxonomy — two homes** — offers may upgrade a slot numerically, fill or
   replace the extra slot, or attach/replace behavior modifiers. Numeric effects flow through
   effectiveStats() (the firewall is preserved and load-bearing); everything else — slot
   contents and slot behavior — is loadout-composition state feeding the weapon/ability
   registry. Two mechanisms, not three: a slot's contents and its configuration are both
   loadout state. The mechanism must be robust to an undecided catalog — including the open
   heal question — without forking sim logic per side.
2. **Perception boundary under feature pressure** — E6/E4 add many new signal types; each
   needs a visibility rule and invariant-test coverage. The pattern for adding a signal must
   be architectural, not per-feature improvisation.
3. **Lag compensation × tick rate** — feel-defining decision explicitly delegated to this
   document: how firing resolves against moving targets at ~150 ms. Must be decided jointly
   with tick rate (50 ms quantization compounds with RTT), and validated against the
   simulated-latency harness, not localhost feel.
4. **A third sensor tier** — the listening ring (bearing-grade audio detection) joins
   truesight and radar; perception, frames, and HUD all assume two tiers today.
5. **Non-human ships — fairness with a known cost ceiling** — PvE fleets and Solo-vs-AI
   combat bots drive through the same input pipeline (output side). On the input side, fair
   combat bots consume perception.observe(); the worst case (1 human + 19 bots) equals a
   full 20-human lobby's existing perception load, so the cost ceiling is already proven.
   Staggered low-cadence bot perception (~250 ms) is a fairness tuning knob (human-ish
   reflexes), not a perf necessity. PvE drones use a cheaper threat-check tier, not full
   observe(). Combat-bot AI remains dedicated design work.
6. **Chromebook 60 FPS with multiplied effects** — E6's information texture adds persistent
   visual state (smoke trails, splashes, flashes) to every fight.
7. **Horizontal scale-out** — from one process on one Render instance to N match processes
   under a matchmaking layer, without breaking the single-server-clock-per-World invariant
   (each World owns its clock; scale-out is more Worlds, never a shared one).

### Assumptions Under Audit

| Assumption | Status |
|---|---|
| Colyseus horizontal scale-out is sufficient for launch spikes | Verify at engine selection |
| WebSocket/TCP adequate at ~150 ms (HOL blocking is the real risk) | Evaluate at engine selection, jointly with lag compensation |
| 20Hz tick carries forward | Decide jointly with lag compensation |
| Sinking ships and the win check (participant while sinking? both finalists sinking?) | Semantic decision needed (match lifecycle) |
| Portal SDK constraints (ad-break hooks touch match-flow UX) | Surface constraints early; integrate late |
| Chromebook 60 FPS with full E6 effects | Per-epic frame budget, low-end benchmark cadence |

### Novel Concepts (no off-the-shelf pattern)

- **Decoy buoy / counter-intel law** — deceptions must be indistinguishable on the wire;
  the server is the only place a lie may exist.
- **Class-legible radar returns** — blips carry outline, speed, heading — deliberately more
  info, without becoming a wallhack.
- **Hidden whirlpool hemisphere** — per-match server-secret world state inferable only
  through observation (spin direction). Whirlpool current lives in shared sim (own-ship
  prediction requires it); touching one reveals the hemisphere by design.
- **Sinking window** — a ~5 s state between alive and destroyed: hull decelerating, guns
  live, then omniscient reveal → spectate/re-queue. Touches win checks, perception, input
  validation, and match lifecycle.

### Technical Risks

- **Perf ceiling on low-end hardware** — the risk is discovering the blown budget at E7;
  mitigated by per-epic frame budgets and building E6 effects against a budget, not
  auditing after.
- **Hug of death** — a portal feature spike exceeding single-instance capacity; the
  architecture must make scale-out a deploy-time knob, not a rewrite. The drone-lobby
  harness doubles as the pre-launch load test.
- **First-match feel at latency** — lag comp retrofitted late is the classic failure;
  first-match feel is the entire retention funnel on a portal.
- **Fog-trust collapse** — one demonstrated leak ("the fog is fake") attacks the USP itself;
  invariant coverage is per-feature definition of done, not a standing test suite alone.
- **Cold start × modes** — Solo vs AI is the only mode that works at population zero, which
  makes it the launch-day first match for most players: combat-bot AI quality sits on the
  retention critical path, not in E5 filler. Architecturally first-class, never a fallback.
- **Ad seam is the death seam** — real-time multiplayer has no mid-match ad inventory; the
  death→requeue flow is simultaneously the revenue moment and the retention moment, and must
  be designed for both (portal SDK constraint, surfaced now, integrated at E7).
- **Observability gap** — no telemetry/ops story exists yet; when the traffic spike arrives,
  the difference between an incident and a shrug is a dashboard. RESOLVED in Cross-cutting
  Concerns (metrics route, match telemetry, perf overlay).
- **Boon catalog is undesigned** — architecture must define the two-home boon mechanism
  robustly enough to survive a catalog that doesn't exist yet (and the unresolved heal
  question).
- **Combat-bot AI scope** — a real design/implementation effort riding inside E5.
- **Population cold start** — launch-planning risk (LAUNCH_PLAN.md), held out of
  architecture scope but constrains lobby design (fill-or-timer must feel honest).

---

## Engine & Framework

### Selected Engine

**Custom TypeScript engine (ratified)** — npm-workspaces monorepo: `shared` (pure deterministic
sim) → `server` (Colyseus) + `client` (PixiJS + Vite).

**Components (versions verified 2026-07-17):**

- **Colyseus 0.17.x** (server networking/rooms) — UPGRADE from 0.16 (see below)
- **PixiJS 8.19** (client rendering) — current; no action
- **Vite 6** (client build), **TypeScript ~5.7**, **Node 22**

**Rationale:** A working v0.16 prototype (649 tests) already embodies the hardest architectural
wins — deterministic shared sim, structural anti-cheat perception boundary, client prediction.
No off-the-shelf engine provides these; PixiJS is the right renderer for procedural CIC vector
linework. Alternatives were evaluated on the merits and rejected: a networking-layer swap
(geckos.io/WebRTC, bespoke uWS) trades away rooms/matchmaking/reconnection/scaling for a
transport benefit that Colyseus H3Transport (WebTransport) will deliver in-framework;
a full engine move (Phaser, Godot web) discards the codebase and provides nothing required.

**The MCP-engine question (closed — do not re-litigate):** moving to an engine with an MCP
bridge (Unity, Godot) was evaluated for AI-agent developability and rejected. Engine MCPs
exist to periscope into *opaque* editor state (scenes, prefabs, binary blobs); this project's
source of truth is entirely text — pure-function sim, greppable invariants, and a 649-test
oracle any agent can consult via `npm run check`. Custom TS is the *superior* agent substrate
here, not a compromise. Additionally, MCP-bearing engines fail the portal gate on their own:
Unity WebGL bundle sizes and cold starts blow the <10 s Chromebook load requirement, and
Godot 4 web export still fights SharedArrayBuffer/threading issues on exactly the target
low-end hardware.

### Decision: Upgrade Colyseus 0.16 → 0.17 (early — before E1 and before any public playtest)

0.17 (released 2026-02-06, targeting 1.0 this year) directly serves recorded risks — this
upgrade is a **retention feature**, not tech-debt hygiene:

- **Automatic reconnection** — school-wifi drops resume mid-match with state listeners intact;
  a stranger on bad wifi who drops and can't rejoin is a churned player and a bad review
- **QueueRoom** — built-in queue matchmaking; near-exact fit for E5's fill-or-timer lobbies
- **Rate limiting** (`maxMessagesPerSecond`) — transport-level input-flood protection
- **Typed HTTP routes (Zod)**, `room.ping()`, latency-based endpoint selection (multi-region later)

Migration is bounded by design: `ArenaRoom` is a thin adapter; `World`/`Match` have zero
Colyseus imports.

**Sequencing (unambiguous):** the 0.16 → 0.17 upgrade is **work item #0 — the first thing
built, ahead of E1.** It pairs with the Track-2 hosting move (Colyseus Cloud + static client
split) as the "one motion" described under Hosting Posture. Epic work (E1 onward) builds on
the stabilized 0.17 room/adapter layer; doing E1 first would mean redoing the adapter against
0.17 afterward.

### Hosting Posture — committed two-track timeline

- **Track 1 (now):** Render as-is for friends-scale playtests — zero infra work required.
- **Track 2 (before the first stranger):** executed as **one motion**, so only one new deploy
  pipeline is ever built: Colyseus 0.17 upgrade + game server to **Colyseus Cloud** + client/
  site to static hosting. The trigger is "first public link," not a calendar date.
- **Render is structurally unable to host Colyseus scale-out**: no WebSocket sticky sessions /
  per-instance addressing (seat reservation breaks under its load balancer); no UDP ingress
  (blocks future WebTransport). **Never enable Render autoscaling** — it would actively break
  matchmaking. Warning stands for as long as Render is in the path.
- **Code obligations now:** no single-process assumptions; Presence/Driver injectable
  (memory → Redis as config); at portal launch the client bundle ships on the portal CDN —
  only the game-server tier and site are ours to scale.

### Engine-Provided Architecture

| Component | Solution | Notes |
|---|---|---|
| Rendering | PixiJS 8.19 (WebGL/WebGPU) | Scene graph, textures, batching |
| Networking/rooms | Colyseus 0.17 | Rooms, matchmaking (QueueRoom), schema sync (roster only), reconnection, rate limiting |
| Transport | @colyseus/ws-transport (WebSocket) | H3Transport (WebTransport, Baseline since 2026-03) recorded as post-beta path |
| Scale primitives | Colyseus Presence/Driver | Memory now; Redis-ready as config |
| Physics/kinematics | Custom shared sim | Deliberate: deterministic, no engine physics |
| Audio | WebAudio (custom tones) | No engine audio; zero sound files |
| Input | Custom (keyboard/mouse → validated InputMsg) | The only path into the sim |
| Build | Vite 6 (client), tsc (server/shared) | Build order: shared → client → server |

### Starter Template

N/A — existing production codebase; this section governs evolution, not initialization.

### AI Development Tooling

- **Context7 MCP** (upstash/context7) — current-docs lookup for Colyseus 0.17/PixiJS 8 APIs
  instead of training-data recall; recommended for all agent work in this repo.
- **PixiJS official AI agent skills** (shipped with 8.19, June 2026) — evaluate and adopt for
  client render work.
- No engine MCP exists for a custom engine and none is needed (see the closed MCP-engine
  question above); the repo's own `project-context.md` (41 rules) plus this document serve
  that role. Text, tests, and this document are the tooling investment.

### Remaining Architectural Decisions

Carried to the next steps: lag-compensation model (× tick-rate ratification) · Redis adoption
timing within the Colyseus Cloud move · boon effect data model (two-home taxonomy) ·
add-a-signal perception pattern (incl. third sensor tier) · sinking-window lifecycle semantics ·
state-sync evolution (outline blips, listening ring on the wire) · per-epic perf budget
mechanics · observability/telemetry stack · portal SDK integration seam.

---

## Architectural Decisions

### Decision Summary

| # | Category | Decision | Rationale |
|---|---|---|---|
| D1 | Netcode / feel | Bounded fire-time compensation (RTT-clamped) + hits vs live server state; tick ratified at 20 Hz | Removes input-delay penalty (unfair) while preserving lead-the-target (the game); no rewind kills behind cover |
| D2 | Boon effects | Hybrid: declarative descriptors + named shared behavior hooks (hooks pure/deterministic, parity-tested) | Two-home taxonomy made concrete; catalog stays data, exotic behavior stays deterministic in shared/ |
| D3 | Perception | Signal registry + listening ring as bearing-only events | Add-a-signal = fill-in-a-row; invariant coverage by construction |
| D4 | Match lifecycle | PROVISIONAL: sinking ships win-eligible until fully sunk; later-sinker wins; same-tick = draw. Sinking is a REVERSIBLE state | Design genuinely open (Eric, 2026-07-17); future heal may refloat — architecture commits to reversibility, not to the win rule |
| D5 | Combat AI | Utility AI over observe() views, staggered ~250 ms; PvE drones on cheap threat-check tier; bot-vs-bot evaluation via the triple-duty harness | Structurally fair (bots lack the data to cheat); cost ceiling ≈ human lobby |
| D6 | Matchmaking | Colyseus 0.17 QueueRoom; modes = queues (Standard, Solo vs AI); min-2 fill-or-timer, cap 20; roster-scaled map at countdown; queue-liveness UX constraint | Framework-native fit for E5's lobby rules |
| D7 | Persistence | localStorage client prefs only; NO accounts, NO server player DB at beta | Light to Hold; accounts are post-beta scope |
| D8 | Scale plumbing | Presence/Driver injectable now; Redis arrives with the Colyseus Cloud move (Track 2) | One motion, one pipeline; no Redis on Render ever |

### D1 — Firing Under Latency (detail)

- Fire commands carry a client timestamp, validated against the server clock estimate and
  **clamped to `min(claimed, server-measured RTT + jitter allowance)`** (measured via
  `room.ping()`) — never a bare fixed cap, and never earlier than the previous input.
  A client claiming more latency than it has gets its *measured* reality; the
  claim-the-cap exploit (free shell speed) is closed by construction. Hard ceiling 150 ms.
- The projectile spawns back-dated along its trajectory by the validated latency; observers
  see it materialize slightly ahead of the muzzle (masked by muzzle-flash VFX — E6).
- Hits ALWAYS resolve against live server state — no victim rewind, ever. The Narrow Escape
  (helming behind an island) can never be retroactively undone.
- Torpedoes/mines: same spawn rule, negligible effect at their timescales.
- Validation: simulated-latency harness (~150 ms + jitter + loss) measuring hit-registration
  agreement % and prediction-error bounds. Tick stays 20 Hz (50 ms).

### D2 — Boon Effect Model (detail)

- Each boon in the catalog: `{ id, category, effects: [...] }` in shared CONFIG.
- Effect kinds and their homes:
  - `stat` descriptors → consumed exclusively by effectiveStats() (firewall preserved)
  - `slotFill` / `slotReplace` descriptors → loadout-composition state → weapon/ability registry
  - `behavior(hookId, params)` → named hooks implemented ONCE in shared/, referenced by id —
    both sides execute identical boon behavior, so prediction survives
- **Hook purity law:** behavior hooks must be pure and deterministic, enforced structurally —
  sim-parity property tests iterate the hook registry; a hook cannot be registered without
  parity coverage (the signal-registry trick, applied to the second registry).
- The catalog (E2 design work) can therefore contain any mix of numeric upgrades, slot
  fills/replacements, and behavior changes — including a future heal — without new mechanisms.

### D3 — Sensor & Signal Architecture (detail)

- One signal registry (server perception): every spatial signal declares
  `{ eventType, visibilityPredicate, materializationFields, counterIntel? }`.
- Perception invariant tests ITERATE THE REGISTRY — a signal cannot exist without coverage.
- Counter-intel entries additionally get wire-indistinguishability tests (decoy vs real ship).
- Third sensor tier — the listening ring: bearing-only events (bearing + sound class; NO
  position, NO range-derivable fields), computed in observe(); hydrophones are the torpedo
  warning (torpedoes never paint on radar).
- E6 signals (hit call, fall-of-shot, muzzle flash carries, wounded smoke, foghorn, Bounty
  bloom, class-legible blip outline/speed/heading) each land as registry rows.

### D4 — Sinking Window (detail; PROVISIONAL)

- ARCHITECTURAL COMMITMENT (firm): sinking is a reversible lifecycle state —
  `alive → sinking → sunk`, with `sinking → alive` a reserved legal transition (future heal
  may refloat). Sinking is not a death animation; it is a state the sim, perception, input
  validation, and win check all understand.
- WIN SEMANTICS (provisional, option b — design open per Eric 2026-07-17): sinking ships stay
  win-eligible until fully sunk; if the last participants are all sinking, the later sinker
  wins; same-tick mutual destruction = draw. Revisit is cheap: the rule is one predicate over
  lifecycle states.
- During sinking: hull decelerates (ritardando), guns live, inputs restricted to fire/aim.

### D5 — Combat-Bot AI (detail)

- Bots consume perception.observe() output — the same view a client would get; they are
  structurally incapable of wallhacking.
- Staggered cadence (~250 ms, spread across ticks): fairness feature (human-ish reflexes)
  with flat, proven cost (worst case ≈ full human lobby).
- Utility AI: scored actions (hunt / position / strike / evade / storm-avoid) over observed
  contacts + blips; drives ships through the same validated input pipeline.
- **Bot quality is measured, not felt:** the batch-sim harness is formally triple-duty —
  economy tuning, load testing, and bot-vs-bot AI evaluation (scored on kill distributions,
  match lengths, storm deaths).
- PvE fleet drones: cheap threat-check tier (react to being hit / truesight proximity), NOT
  full observe(). Defensive-only per GDD.

### D6 — Lobby & Matchmaking (detail)

- Two QueueRooms (Standard BR, Solo vs AI) → seat reservation into arena rooms.
- Min 2 humans, fill-or-timer, cap 20; zero bot-fill in Standard (drones are not fill).
- Map seed + generation params derived from ACTUAL roster at countdown (roster-scaled ocean).
- Mode selection is a queue choice in the menu — no room-flag forks inside arena logic.
- **UX constraint (flagged to design):** the menu must surface queue liveness (player counts /
  wait honesty) and steer players toward Solo vs AI when Standard is empty — dead-queue
  mitigation at launch population.

### D7 / D8 — Persistence & Scale Plumbing (detail)

- Client: localStorage (name, mute, future keybinds). Server: no player persistence at beta;
  match results are ephemeral (telemetry is Step 8's concern, not a player DB).
- Presence/Driver constructed via config injection; memory implementations on Render,
  @colyseus/redis-* engaged at the Colyseus Cloud move. No code path may assume same-process
  room co-residency.

---

## Cross-cutting Concerns

These patterns apply to ALL systems and must be followed by every implementation.

### Error Handling — three-zone strategy

- **Shared sim: never throws.** Pure functions over validated inputs; invalid data is
  impossible by construction (validated upstream). A throw in `shared/` is a bug — fail fast
  in dev/tests; no defensive try/catch in the hot path.
- **Server: validate-and-drop at the edge, contain-and-dispose at the tick.** Malformed
  player input → silently dropped (anti-cheat posture, ratified). Errors inside
  `World.step()` → caught at the room's tick boundary, logged with `{matchId, roomId, tick}`.
  Consecutive-failure threshold is an **env knob** (`HC_TICK_ERROR_TOLERANCE`): **1 in
  dev/friend playtests** (fail loud — a dead match is a bug report), **3 in public builds**
  (a stranger's match survives a hiccup). On threshold: dispose the room gracefully
  (players → error banner → menu) and log `match.abort`. The process survives; other rooms
  are unaffected.
- **Client: the loop never dies.** Global error handler → banner + auto-reconnect (0.17);
  a render error skips the frame, never kills the loop. Expected failures (join refused,
  version mismatch) are Result-style returns, not exceptions.

**Reconnection semantics (0.17 auto-reconnect):** on disconnect, the ship **keeps being
simulated** — it stays in the match under its last input (a set-and-forget telegraph order
means it keeps its heading/throttle; it does not freeze). The player reconnects straight back
into that same ship and resumes control, **as long as the ship has not sunk** (lifecycle
phase is `alive` or `sinking`). **Resumption must be authenticated by the 0.17 reconnection
token — never a guessable or replayable session id.** A live disconnected ship is a target
to be hunted, never an identity to be seized: without token auth, "hunt a disconnected
captain" would silently include "*become* one." If the ship reached `sunk` while the player was away, reconnect
lands them in the post-death flow (reveal → spectate/re-queue), same as any death. Consequence
made explicit: a disconnected ship is a live, vulnerable target, not a safe pause — it can be
hunted and killed while its captain is gone. Full reconnection UX (grace window, "reconnecting"
banner, abandon-after-timeout for a never-returning captain) is E5 design work.

```ts
// server tick boundary (ArenaRoom)
try {
  this.world.step();
  this.consecutiveTickErrors = 0;
} catch (err) {
  log.error('tick.failed', { matchId, roomId: this.roomId, tick: this.world.tick, err });
  if (++this.consecutiveTickErrors >= TICK_ERROR_TOLERANCE) {
    log.info('match.abort', { matchId, reason: 'sim-wedged', tick: this.world.tick });
    this.disposeGracefully();
  }
}
```

### Logging — structured lines to stdout, stdout only

- Format: `level event {fields}` with `matchId`/`roomId`/`tick` context on every server line;
  destinations: stdout only (Render / Colyseus Cloud capture it). No files, no third-party
  service at beta.
- Levels: `error` / `warn` / `info` / `debug`. `debug` gated by `HC_DEBUG=1` (server) /
  `?debug=1` (client).
- **Hot-path law:** no logging inside per-tick/per-frame loops except throttled aggregates
  (e.g., once-per-second tick-duration summaries). One `info` line per match lifecycle event.
- **Error logs always carry `matchId`** so any dead match reconstructs from stdout alone.

### Configuration

- Ratified: `CONFIG` (shared, gameplay-authoritative) · `CLIENT_CONFIG` (client feel) · env
  (`PORT`, `HC_DEV_OPTIONS`, `HC_DEBUG`, `HC_TICK_ERROR_TOLERANCE`) · `sanitizeRoomOptions()`
  for anything client-supplied. Promotion rule stands: a feel knob moves to CONFIG the moment
  it becomes gameplay-load-bearing.
- The three registries (boon catalog, signal registry, behavior hooks) are
  configuration-adjacent code in `shared/` — data-shaped, `PROTOCOL_VERSION`-versioned when
  wire-visible.

### Events — no event bus, on purpose

- Wire: typed `MSG` channels + per-client frames (discriminated unions in `types.ts`),
  `PROTOCOL_VERSION`-gated.
- Server-internal: systems communicate through the tick's explicit step order and per-tick
  event arrays — **no pub/sub inside the sim** (ordering stays explicit and deterministic).
- Client-internal: one-way data flow stands (net → sim → render); render/UI read state,
  never subscribe. **The absence of an event bus is a decision** — no agent may "helpfully"
  introduce one.

### Observability

- **Server metrics:** `/metrics` typed HTTP route (0.17): room/player counts, tick-duration
  p50/p95/max, message rates. `@colyseus/monitor` in dev only. Colyseus Cloud dashboard
  layers on top after the Track 2 move.
- **Match telemetry (no player DB):** one `info` line per match end —
  `match.end { matchId, mode, rosterSize, rosterByClass, durationS, winnerClass,
  killsByClass, stormDeaths }` — and `match.abort { matchId, reason, tick }` for disposed
  matches (no survivorship bias in balance data). `rosterByClass` instruments the GDD's
  "no class is a dead button" metric (pick rate + win rate per class from playtest one).
  Zero PII; D7's no-player-DB stance intact.
- **Client perf overlay:** FPS, frame-time breakdown (sim/render), RTT, prediction error,
  entity/sprite counts — debug-toggled; the instrument for the per-epic frame budget.

### Debug & Development Tools

- Ratified existing: `P` prediction toggle, `HC_DEV_OPTIONS` room overrides, headless smokes,
  the triple-duty batch-sim harness.
- New: the perf overlay; **dev-only fog-lift** (server-side, `HC_DEV_OPTIONS`-gated room
  option — fog is server-authoritative, so a client-side fog-off is impossible by design);
  dev spectate-all camera.
- **Activation law:** client dev tools exist only in dev builds (`import.meta.env.DEV`; Vite
  strips them from prod); server dev behavior only under `HC_DEV_OPTIONS=1`. Nothing debug
  ships in the portal build.
- Noted as future (not committed): input-log deterministic replay — the seeded sim makes it
  cheap later.

### Per-Epic Performance Budget

- Frame budget on the **reference device**: 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms +
  headroom ≥ 3.6 ms. **Reference scenario = worst-case total entity count, not just
  contestants.** Contestants (stakeholders in the outcome) cap at 20 — either 20 humans, or
  1 human + 19 combat bots (Solo vs AI is exactly one player against nineteen bots). On top of
  that, every match carries roving PvE fleet ships (a non-trivial entity count) plus live
  projectiles, mines, and E6 effects. The perf target is the full populated match — 20
  contestants + PvE fleets + in-flight ordnance + effects — driven by the batch-sim harness,
  not a bare 20-hull count.
- **Reference device pinned:** Chrome at 4× CPU throttle, integrated GPU, until a real
  low-end Chromebook is benched — at which point the real device becomes the reference and
  the proxy retires. Every epic measures against the same reference.
- Each epic's definition of done includes the budget check; E6 effects are costed against
  the render budget as they land, not audited after.

### Portal SDK Seam

- One adapter interface in the client, **null implementation installed NOW** (not at E7):

```ts
interface PortalAdapter {
  init(): Promise<void>;
  loadingProgress(pct: number): void;
  matchStart(): void;
  matchEnd(): void;
  requestAdBreak(): Promise<void>; // the death→requeue seam
}
```

- Game code never imports a portal SDK directly; the next code that touches loading or the
  death→requeue flow goes through the seam. Poki/CrazyGames implementations land at E7
  behind the same interface. A seam installed late is a seam installed never.

---

## Project Structure

### Organization Pattern

**Pattern:** Layer-first (npm workspaces enforce the dependency direction), domain-organized
within each layer. Ratified from the working codebase.

**The one law:** `shared` imports from neither side, ever. `server` and `client` import from
`shared` only. Nothing imports across server ↔ client.

### Directory Structure (existing + NEW homes for decided systems)

```
salvo/
├── shared/src/
│   ├── index.ts                  # single barrel export; PROTOCOL_VERSION
│   ├── constants.ts              # CONFIG (single source of gameplay truth)
│   ├── types.ts                  # wire contract (frames, events, MSG)
│   ├── math/                     # vec, angle, geom (segCircleHit), rng (mulberry32)
│   └── sim/
│       ├── ship.ts               # kinematics (stepShip)
│       ├── stats.ts              # effectiveStats() — the stat firewall
│       ├── loadout.ts            # NEW — slot grammar state: slots, fill/replace, per-slot config
│       ├── boons.ts              # NEW — boon catalog + effect descriptors (stat/slotFill/slotReplace/behavior)
│       ├── hooks.ts              # NEW — behavior hook registry (pure, deterministic, parity-tested)
│       ├── offers.ts             # rollOffer() — evolves to 4-boon offers
│       ├── lifecycle.ts          # NEW — ship lifecycle states (alive → sinking → sunk, reversible)
│       ├── whirlpool.ts          # NEW — whirlpool current/heading math (shared: prediction needs it)
│       ├── zone.ts               # storm timeline — evolves to 3×4 phased rings
│       ├── map.ts                # generateMap — evolves: roster-scaled params, fog banks, whirlpools
│       ├── collision.ts, shell.ts
│       └── …
├── server/src/
│   ├── index.ts, app.config.ts   # boot; registers arena + queue rooms; /metrics route
│   ├── log.ts                    # NEW — structured logger (level event {fields})
│   ├── metrics.ts                # NEW — /metrics payload assembly
│   ├── rooms/
│   │   ├── ArenaRoom.ts          # thin adapter; tick-error boundary lives here
│   │   ├── StandardQueueRoom.ts  # NEW — QueueRoom: standard BR fill-or-timer
│   │   ├── SoloVsAiQueueRoom.ts  # NEW — QueueRoom: solo-vs-AI
│   │   ├── roomOptions.ts        # sanitizeRoomOptions()
│   │   └── schema/ArenaState.ts  # roster-only schema (unchanged law)
│   └── game/
│       ├── world.ts              # authoritative sim (zero Colyseus imports — law)
│       ├── match.ts              # lifecycle state machine; win predicate over lifecycle states
│       ├── perception.ts         # observe() — two tiers + NEW listening ring tier
│       ├── signals.ts            # NEW — the signal registry (visibility predicates, materialization)
│       ├── frames.ts             # per-client frames (sole spatial chokepoint — law)
│       ├── inputs.ts             # validation; fire-timestamp clamping (D1) lands here
│       ├── spawn.ts, drones.ts
│       ├── ai/                   # NEW — utility.ts (combat bots), botDriver.ts (staggered observe
│       │                         #       cadence), pveFleet.ts (roving fleets + cheap threat tier)
│       └── equipment/            # RENAMED from weapons/ — ALL fitted systems, weapon or not:
│                                 #   guns, torpedoes, mines, smoke, starShells, decoyBuoy,
│                                 #   speedBoost + ballistics, ammo, registry (index.ts).
│                                 #   One Equipment interface: a piece of equipment on the ship
│                                 #   that adds a capability. combat.ts compat re-export retained.
├── client/src/
│   ├── main.ts, state.ts, config.ts (CLIENT_CONFIG)
│   ├── app/loop.ts
│   ├── net/                      # connection (0.17 reconnect), clock, snapshots, roomBindings
│   ├── sim/                      # prediction, inputSampler
│   ├── input/                    # keyboard, mouse, telegraph — E2 rebind work lands here
│   ├── portal/                   # NEW — PortalAdapter interface + nullAdapter.ts (NOW);
│   │                             #       pokiAdapter.ts / crazyAdapter.ts at E7
│   ├── debug/                    # NEW — perfOverlay.ts, devTools.ts (import.meta.env.DEV only)
│   ├── render/                   # stage, camera, ships, contacts, fog, radar, phosphor, zone, hud…
│   │                             # E6 renderers land here: listeningRing.ts, splashes.ts, smokeTrails.ts
│   ├── ui/                       # DOM chrome only: menu (queue liveness), results, killFeed,
│   │                             # upgradeMenu → boon offer UI
│   ├── audio/                    # context, tones — listening-ring audio cues land here
│   └── util/                     # banner, math, pool
└── server/scripts/               # headless smokes + NEW triple-duty harness:
                                  #   batchSim.mjs (economy/AI eval), loadTest.mjs, latencyHarness.mjs
```

### System → Location Mapping (the decided systems)

| System (decision) | Home | Boundary note |
|---|---|---|
| Boon catalog + descriptors (D2) | `shared/src/sim/boons.ts` | Data + types; consumed by stats.ts and loadout.ts |
| Behavior hooks (D2) | `shared/src/sim/hooks.ts` | Pure/deterministic; parity tests iterate registry |
| Slot grammar / loadout state (E1) | `shared/src/sim/loadout.ts` | Both sides read; server mutates via offers/spend |
| Equipment (E1: all fitted systems) | `server/src/game/equipment/` | One `Equipment` interface + registry; weapon or not |
| Signal registry (D3) | `server/src/game/signals.ts` | Server-only (visibility is server business) |
| Listening ring (D3) | `perception.ts` (tier) + `client/render/listeningRing.ts` + `audio/` | Bearing-only events on the wire |
| Sinking lifecycle (D4) | `shared/src/sim/lifecycle.ts` + win predicate in `match.ts` | Reversible state machine |
| Combat-bot AI (D5) | `server/src/game/ai/` | Consumes observe() ONLY; drives via inputs.ts |
| Queues (D6) | `server/src/rooms/*QueueRoom.ts` | Modes are queues; arena logic never forks on mode |
| Fire-time compensation (D1) | `inputs.ts` (clamp) + `equipment/ballistics.ts` (back-dated spawn) | RTT measured via room.ping() |
| Whirlpools / fog banks (E4) | `shared/src/sim/whirlpool.ts` / `map.ts` + perception modifier | Hemisphere secret lives in World, not the map seed |
| Telemetry (Step 5) | `server/src/log.ts` + match.end/abort in `match.ts` hooks | stdout only |
| Portal seam (Step 5) | `client/src/portal/` | Game code never imports an SDK directly |
| Harnesses | `server/scripts/` | HC_DEV_OPTIONS-gated room options |

### Naming Conventions (ratified from codebase + extended)

| Element | Convention | Example |
|---|---|---|
| Files (modules) | lowerCamelCase | `roomOptions.ts`, `killFeed.ts`, `perfOverlay.ts` |
| Files (classes: rooms/schema) | PascalCase | `ArenaRoom.ts`, `StandardQueueRoom.ts` |
| Classes / types / interfaces | PascalCase | `World`, `Equipment`, `PortalAdapter` |
| Functions / variables | camelCase | `effectiveStats`, `rollOffer` |
| Constants / registries | UPPER_SNAKE | `CONFIG`, `MSG`, `BOON_CATALOG`, `SIGNAL_REGISTRY` |
| Ids (boons, hooks, signals, equipment) | camelCase strings | `'smokeScreen'`, `'blipOutline'` |
| Telemetry/log events | dot.case | `match.end`, `match.abort`, `tick.failed` |
| Wire message channels | terse strings in `MSG` only | `MSG.input = 'i'` — never inline literals |

### Architectural Boundaries (the laws, restated as placement rules)

1. Sim behavior → `shared/` (both sides run it) — NEVER forked per side.
2. Anything spatial leaving the server → through `frames.ts`, fed by `perception.observe()`.
3. Player/bot intent entering the sim → through `inputs.ts`. Bots are not exempt.
4. Derived stats → `effectiveStats()`. Slot contents/config → `loadout.ts`. No third path.
5. New fitted capability → implement `Equipment`, register in `equipment/index.ts` — weapon
   or not, same interface, same registry, reload ticks every tick.
6. New spatial signal → a `signals.ts` registry row (invariants auto-cover it).
7. DOM is chrome; everything tactical is Pixi. `state.ts` stays a leaf.
8. Debug/dev code → `client/src/debug/` or behind `HC_DEV_OPTIONS` — never in portal builds.

---

## Implementation Patterns

These patterns ensure consistent implementation across all AI agents. Every pattern shows
the canonical shape; deviations require updating this document first.

### Novel Pattern 1: Signal Registry (perception boundary)

**Purpose:** every spatial signal (E6's eight, and all future ones) is one declarative row —
visibility logic can never scatter across the codebase, and invariant coverage is automatic.

```ts
// server/src/game/signals.ts
export interface SignalSpec<E extends GameEvent> {
  eventType: E['type'];
  /** May this observer receive this event this tick? Pure — no side effects. */
  visible(observer: ObserverState, source: SignalSource, world: WorldView): boolean;
  /** Strip to wire shape. NEVER include range-derivable fields beyond the contract. */
  materialize(source: SignalSource, observer: ObserverState): E;
  /** Marks counter-intel entries — wire-indistinguishability tests apply. */
  counterIntel?: boolean;
}

export const SIGNAL_REGISTRY = [muzzleFlashSignal, hitCallSignal, fallOfShotSignal,
  woundedSmokeSignal, foghornSignal, bountyBloomSignal, blipSignal, audioBearingSignal,
  /* new signals register HERE — nowhere else */] as const;
```

**Rules:** `observe()` iterates the registry — it is the only caller of `visible`/`materialize`.
The perception invariant test suite iterates `SIGNAL_REGISTRY` too: a signal without a
passing invariant case fails CI by construction. Adding a signal = one row + its test case.

### Novel Pattern 2: Boon Effects (two homes + hooks)

**Purpose:** an undecided catalog can express numeric upgrades, slot changes, and behavior
changes without new mechanisms or per-side forks.

```ts
// shared/src/sim/boons.ts
export type BoonEffect =
  | { kind: 'stat'; stat: StatKey; op: 'add' | 'mul'; value: number }        // → effectiveStats()
  | { kind: 'slotFill'; slot: SlotId; equipment: EquipmentId }               // → loadout
  | { kind: 'slotReplace'; slot: SlotId; equipment: EquipmentId }            // → loadout
  | { kind: 'behavior'; hookId: HookId; params: Readonly<Record<string, number>> }; // → hooks

export interface Boon { id: BoonId; category: BoonCategory; effects: readonly BoonEffect[]; }
export const BOON_CATALOG: readonly Boon[] = [ /* E2 design work fills this */ ];
```

```ts
// shared/src/sim/hooks.ts — pure, deterministic, parity-tested (the hook purity law)
export const HOOK_REGISTRY = {
  // example shape — a hook adjusts sim behavior from params; same code runs both sides
  torpedoBowClearance: (params, ctx) => ({ ...ctx.spawn, clearance: ctx.spawn.clearance * params.mul }),
} satisfies Record<HookId, BehaviorHook>;
```

**Rules:** `stat` effects are read ONLY by `effectiveStats()`. `slotFill`/`slotReplace`
mutate loadout state server-side (spend flow) and replicate via `you.loadout`. `behavior`
hooks execute identically on both sides (prediction survives). The parity test suite
iterates `HOOK_REGISTRY`. Applying a boon touches no other path.

### Novel Pattern 3: Equipment (unified fitted systems)

**Purpose:** guns, torpedoes, mines, smoke, star shells, decoys, speed boosts — one
interface: a piece of equipment on the ship that adds a capability.

```ts
// server/src/game/equipment/index.ts
export interface Equipment {
  id: EquipmentId;
  isWeapon: boolean;                      // weapons obey arcs + ammo; non-weapons may not need aim
  /** Called EVERY tick for EVERY fitted instance — reload/cooldown always ticks (law). */
  tick(state: EquipmentState, ship: ShipState, world: World): void;
  /** Attempt activation (fire/deploy/trigger). Returns denial reason for explicit feedback.
   *  During ship 'sinking' state, activation routes through ONE gate (see one-structure +
   *  sinking-activation rules below). */
  activate(state: EquipmentState, ship: ShipState, world: World, aim?: Aim): ActivationResult;
}
export const EQUIPMENT_REGISTRY: Record<EquipmentId, Equipment> = { /* all register here */ };
```

**One-structure law (no parallel truth):** a ship's loadout IS its equipment runtime — a slot
holds `{ equipmentId, state: EquipmentState }`. There is no separate "loadout composition"
structure beside "equipment state"; `slotFill`/`slotReplace` (Pattern 2) set the slot's
`equipmentId` and initialize its `state` in the same place. An agent can never update one
half and forget the other, because there is only one half.

**Sinking-activation gate:** when the ship lifecycle is `sinking` (D4), `activate` is filtered
through a SINGLE gate point (not scattered per-equipment checks). The gate's VALUE — which
equipment may fire while sinking (weapons-only via `isWeapon`? mines too? no screens?) — is
**TBD, tied to D4's provisional win semantics and the open heal question.** Architecture
guarantees one gate; the policy inside it is design work.

**Rules:** loadout slots reference `EquipmentId`s; the extra slot fills via boon offers with
the SAME ids. New equipment = implement interface + register + CONFIG entry. No equipment
code outside `equipment/`.

### Novel Pattern 4: Server Lies (counter-intel)

**Purpose:** "lies must live on the server" made mechanical. A deception (decoy buoy) is a
REAL World entity that produces signals through the SAME registry rows as the truth it
imitates — the wire cannot distinguish because there is nothing different on the wire.

**Rules:**
- Never implement deception client-side or as a special event type; implement it as a world
  entity whose emitted signals reuse the genuine signal's `materialize`.
- **Temporal indistinguishability:** the decoy must draw from the SAME RNG/jitter stream as
  the genuine signal (e.g. radar-cross-section bearing jitter). Identical payload is not
  enough — a decoy that pips on a suspiciously regular cadence is a tell in *timing*, not in
  the bytes.
- Registry entries marked `counterIntel` get wire-indistinguishability tests (serialized
  decoy blip ≡ serialized real blip, field for field, modulo position).
- **Design note (flag to GDD, not architecture):** the legitimate disambiguation oracle is
  *interaction* — shooting where a decoy blip sits produces no hit call, so testing a contact
  confirms it, at the cost of a reload and a self-revealing muzzle flash. This is intended
  counterplay, not a leak — but it must be a written design decision, not an accident.

### Novel Pattern 5: Observed AI (fair bots)

**Purpose:** bots that structurally cannot cheat.

```ts
// server/src/game/ai/botDriver.ts — the ONLY inputs a bot gets:
const view = observe(world, bot.observerState);   // same function clients' frames use
const intent = utilityDecide(bot.brain, view);    // scores hunt/position/strike/evade/stormAvoid
inputs.submit(bot.sessionId, toInputMsg(intent)); // same validated pipeline as humans
```

**Rules:** `ai/` imports `perception` and `inputs` — NEVER `world` internals for decision
data. Stagger: each bot observes every ~250 ms (round-robin across ticks). PvE fleet drones
use `pveFleet.ts`'s threat-check (hit-reaction + truesight proximity), not `observe()`.

### Standard Patterns (ratified, with the one canonical shape)

**Communication:** within a layer — direct function calls; sim systems — the tick's explicit
step order (see STEP_ORDER below); server → client — frames only; client internal — one-way
flow. No event bus anywhere (Step 5 law).

**Tick step order as a registry (STEP_ORDER):** `world.step()` iterates a named `STEP_ORDER`
array — steps are DATA, not an order implied by code layout. Inserting a step (sinking
deceleration, whirlpool force) is a one-line, reviewable edit with the position visible,
mirroring the signal/hook registries.

```ts
// server/src/game/world.ts
const STEP_ORDER: readonly Step[] = [stepInputs, stepShips, stepBoundary, stepIslands,
  stepShells, stepFireControl, stepRadarPaint, stepSweepAdvance, stepRespawns];
step() { for (const s of STEP_ORDER) s(this); this.tick++; }
```

**Entity creation:** World entities are plain objects in typed arrays, created by the owning
step (spawn, equipment activation), ids from World counters — never `Math.random()`. Client
render ephemera come from `util/pool.ts` pools — no fresh allocations in loop paths.

**State transitions:** explicit state machines as discriminated unions + transition
functions (the `match.ts` model). Ship lifecycle (`lifecycle.ts`) follows it:
`{ phase: 'alive' } | { phase: 'sinking', since: tick } | { phase: 'sunk', at: tick }` —
transitions validated in one place; `sinking → alive` reserved for future heal.

**Data access:** import `CONFIG`/registries from the `shared` barrel (`hullcracker-shared`).
No data managers, no locators, no runtime loading of gameplay data. Client feel knobs from
`CLIENT_CONFIG` only.

### Consistency Rules

| Rule | Convention | Enforcement |
|---|---|---|
| Complexity ≤ 10 | refactor, never suppress | ESLint (error) |
| No Math.random/Date.now in sim | seeded streams / World clock | ESLint restriction + review |
| Signals only via registry | one row per signal | invariant suite iterates registry |
| Hooks pure/deterministic | no I/O, no ambient state | parity suite iterates registry |
| Step order is data | STEP_ORDER array, not code layout | review; new step = one array edit |
| Loadout = equipment state | one structure `{ equipmentId, state }` | review; no parallel loadout struct |
| Stats only via effectiveStats() | no ad-hoc derivation | review + balance-identity tests |
| Bots read observe() only | no world internals in ai/ | lint import boundary + review |
| Decoys reuse real signal + jitter stream | temporal + payload indistinguishability | wire-indistinguishability tests |
| Frames are the spatial exit | no other spatial emission | invariant tests |
| Wire changes bump PROTOCOL_VERSION | every types.ts contract change | review checklist |
| npm run check green | lint + tsc + all tests | the gate, every ship |

---

## Architecture Validation

### Validation Summary

| Check | Result | Notes |
|---|---|---|
| Decision Compatibility | PASS | D1↔0.17 ping, D6↔QueueRoom, D8↔Track-2 all consistent; novel patterns respect the zero-Colyseus-in-World law |
| GDD Coverage | PASS | Every GDD system (E1–E7) + 3rd sensor tier + sinking window mapped to a home |
| Pattern Completeness | PASS | Creation, communication, state, error, data, events all have canonical shapes |
| Version Specificity | PASS | Colyseus 0.17.x, PixiJS 8.19, Vite 6, TS ~5.7, Node 22 — WebSearch-verified 2026-07-17 |
| Epic Mapping | PASS | E1–E7 each map to files/patterns; work item #0 (0.17 upgrade) sequenced ahead of E1 |
| Document Completeness | PASS | No stray placeholders; the one TBD (sinking-activation value) is explicitly D4-scoped |

### Coverage Report

- **Decisions:** 8 (7 firm, 1 provisional-with-firm-architectural-commitment — D4)
- **Novel patterns fully designed:** 5 (Signal Registry, Boon Effects, Equipment, Server Lies, Observed AI)
- **Standard patterns ratified:** 4 (communication, entity creation incl. STEP_ORDER, state machines, data access)
- **Consistency rules:** 12, each with an enforcement mechanism

### Issues Found & Resolved (this step)

1. **Reconnection semantics** were unspecified → RESOLVED: ship keeps simulating under last
   input; player resumes the same ship while it is `alive`/`sinking`; a `sunk` ship routes to
   post-death flow. A disconnected unsunk ship remains a live target and a valid win-check
   participant. Full UX deferred to E5.
2. **Perf budget entity count** conflated contestants with total entities → RESOLVED:
   contestants cap 20 (20 humans OR 1 human + 19 bots); reference scenario is the fully
   populated match (contestants + PvE fleets + ordnance + effects).
3. **Migration sequence** was implicit → RESOLVED: the 0.16→0.17 upgrade is work item #0,
   ahead of E1, paired with the Track-2 hosting move.

### Deferred by Design (not gaps)

- **Boon catalog contents** — E2 design work; architecture specifies the mechanism, not the list.
- **D4 win semantics** — provisional per Eric (2026-07-17); reversible-lifecycle commitment is firm.
- **Sinking-activation policy value** — one gate guaranteed; which equipment fires while sinking is tied to D4.
- **Heal mechanic** — open design question; the boon `behavior`-effect path and reversible lifecycle already accommodate it if adopted.

### Overall Status: PASS — ready to guide implementation

Recommended next step after this workflow: the **implementation-readiness** check (GDD ↔
Architecture ↔ Stories alignment) before E1 begins.

### A Living Document

This architecture is revised by what playtests teach — it is a foundation, not a monument.
The expected first amendments are already visible: D4's win semantics, the heal question, and
the boon catalog contents will each resolve against real play and should be written back into
this document when they do. An architecture that cannot be edited by what you learn is a cage
with good posture. When the game tells you something the document didn't know, change the
document.

### Validation Date

2026-07-17

---

## Development Environment

### Prerequisites

- **Node.js 22**, npm (workspaces)
- The existing monorepo (`shared` / `server` / `client`); no new project initialization —
  this architecture governs evolution, not a greenfield scaffold.
- A modern browser for the client (Chrome/Edge/Firefox/Safari).

### Setup Commands (existing, unchanged)

```bash
npm install                 # root; installs all workspaces
npm run dev                 # Colyseus server (:2567) + Vite client (:5173) — USER-MANAGED, never auto-started
npm run check               # lint + type-check + all tests — the gate before any ship
npm run build               # build order: shared → client → server
```

### AI Tooling (MCP Servers)

No engine-specific MCP is applicable (custom TypeScript engine — see the closed MCP-engine
question in Engine & Framework). Recommended, engine-agnostic:

| Tool | Purpose | Install type |
|---|---|---|
| **Context7** (upstash/context7) | Current-docs lookup for Colyseus 0.17 / PixiJS 8 APIs instead of training-data recall | MCP server |
| **PixiJS AI agent skills** (bundled with 8.19) | Client render assistance | Package (evaluate) |

The repo's `project-context.md` (41 rules) plus this architecture document are the primary
AI-agent guidance — text, tests, and these two documents are the tooling investment.

### First Steps (implementation order)

1. **Work item #0 — Colyseus 0.16 → 0.17 upgrade**, paired with the Track-2 hosting move
   (Colyseus Cloud + static client split). Before E1, before any public playtest.
2. **E1 — The Armory** (slot grammar, universal gun, three class loadouts) on the stabilized
   0.17 adapter, building the `equipment/`, `loadout.ts`, and boon-slot plumbing.
3. Then the GDD epic sequence: **E1 → E2 → E3 → E6 → E4 → E5 → E7.**
4. Recommended gate before E1 code: the **implementation-readiness** check (GDD ↔ Architecture
   ↔ Stories alignment).

---

_End of architecture document. This is a living document — revise it as playtests teach
(see A Living Document under Architecture Validation)._
