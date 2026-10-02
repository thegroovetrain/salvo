---
title: 'Game Architecture'
project: 'Hullcracker.io'
date: '2026-07-17'
author: 'Eric'
version: '1.0'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
status: 'complete'
amendments:
  - '2026-09-09 — account store (E9): D7 superseded, D8 amended, D9–D18 added; scoped gds-game-architecture pass'
  - '2026-09-10 — the deck (E8, upgrades v3): D2 amended, D19–D31 added, Novel Patterns 2–3 amended + 10–13 added; scoped gds-game-architecture pass'
engine: 'Custom TypeScript (Colyseus 0.17 + PixiJS 8.19, npm-workspaces monorepo)'
platform: 'Desktop browser (keyboard + mouse)'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md'
epics: '_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/epics.md'
brief: '_bmad-output/planning-artifacts/briefs/brief-Hullcracker.io-2026-07-15/brief.md'
---

# Game Architecture

> **RESCOPE NOTICE — 2026-08-18, RECONCILED 2026-08-21 (Story 7.6).** Epic 7 was rescoped from
> a portal launch to a self-published beta
> (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-18.md`, approved by Eric).
> **The portal (Poki/CrazyGames) release and the low-end Chromebook reference device are both
> RETIRED.** Story 7.6 has now swept this document's constraint, risk and rationale sections;
> the portal-launch and Chromebook framing they carried is struck or restated in place, each
> site marked inline. The reference device is **Eric's MacBook Pro 16,1 (i7-9750H / 32 GB /
> Radeon Pro 5300M + UHD 630, dpr 2)** (epic-7 amendment 1); distribution is self-published at
> `https://hullcracker.io/`; monetization is Eric's own AdSense H5 Games Ads.
>
> **What survives the retirement:** the **1366×768 viewport floor** is an independent
> requirement (NFR7, UX-DR39) and is unaffected — it was never a property of the Chromebook,
> only illustrated by one. Any residual "portal"/"Chromebook" text below is either inside a
> dated superseding stamp or an explicit historical note; it is not live guidance.

> **AMENDMENT NOTICE — 2026-09-09 (the Account Store, E9).** A scoped `gds-game-architecture`
> pass added the project's first persistent store: **D7 is SUPERSEDED, D8 AMENDED, D9–D18
> ADDED**, with matching Cross-cutting, Project Structure, Implementation Patterns (Novel
> Patterns 6–9) and Validation amendments, each appended to its section under a dated heading.
> Read the amendment blocks as live guidance alongside the originals; where they disagree, the
> amendment governs. Headline: **Colyseus 0.17 → 0.18 is E9's story 0**, Render Postgres via
> `render.yaml`, `@colyseus/database` + `@colyseus/auth` (OAuth only, curated) + `@colyseus/admin`,
> the deck loaded at BOTH doors, and the sim never learning the store exists.

> **AMENDMENT NOTICE — 2026-09-10 (The Deck, E8 / upgrades v3).** A second scoped
> `gds-game-architecture` pass covers the systems catalog v3 (2026-09-09) and GDD epic *The Deck*
> add: **D2 is AMENDED, D19–D31 ADDED, Novel Patterns 2–3 AMENDED and 10–13 ADDED**, with
> matching Cross-cutting, Project Structure, Implementation Patterns and Validation blocks under
> dated headings. Headline: **one boon engine with tiers as effect bundles**, a flat 9-slot
> loadout (gun, Shift boost, three weapons, four consumables), the hidden match pool on a
> room-private stream, wake drafting as a server-computed scalar the client folds, smoke as an
> island for every sensor but radar, ONE ordnance target collector, a `held` input level for the
> machine-gun stream, ONE damage gate (the shield lives there), no mine ceiling of any kind, and
> total bot-tactic tables. Rulings Eric took live on 2026-09-10 are marked **(Eric)** in place.

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

**Amended 2026-09-09 — the account store (E9):** E1–E7 have shipped; the deck model v3 brings
the first persistence. **Ten decisions (D9–D18)** put the store IN-PROCESS on the one Render
service (Story 7-7 stays deferred), on **Render managed Postgres** declared in `render.yaml`,
through **`@colyseus/database` / `@colyseus/auth` / `@colyseus/admin` on Colyseus 0.18** —
OAuth only (Google, Discord), identity = provider + opaque subject, a curated endpoint map with
the popup callback replaced, JWT 30 days with server-side revocation. **Four new patterns
(6–9)**: the Door (verify then load, both doors, one helper), `MatchRecord → AccountWriter`
(a port with a queue — the sim never learns the store exists and the wire never carries a
deck), the curated auth map + identity upsert, and the two-state settings source. **Nine new
consistency rules**, each pinned. **Validated PASS; ready for:** `gds-create-epics-and-stories`
on E9 (with the 0.18 upgrade as story 0).

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
| Self-published beta launch: 60 FPS on the reference MacBook, fast cold load, AdSense H5 Games Ads placement (RESTATED 2026-08-21 — was "Portal launch: Chromebook 60 FPS, <10 s load, Poki/CrazyGames SDK compliance") | Medium | E7 |

### Technical Requirements

- **Simulation:** authoritative 20 Hz (50 ms) fixed-tick server; deterministic shared sim
  (same pure functions both sides) enabling client-side prediction with reconcile-and-replay;
  contacts snapshot-interpolated ~100 ms behind.
- **Performance (RESTATED 2026-08-21, Story 7.6):** 60 FPS sustained on the **reference
  device** — Eric's MacBook Pro 16,1 (i7-9750H / Radeon Pro 5300M + UHD 630, dpr 2) — in a full
  20-ship match with all effects, at the **1366×768 viewport floor** and above; link → playable
  in <~10 s; feel intact at ~150 ms residential latency — operationalized as measurable proxies
  (hit-registration agreement %, prediction-error bounds) defined in this document, not assessed
  by feel alone. *(Was: "a low-end school Chromebook" and "portal click → playable". The device
  and the click are retired; the FPS bar, the load budget and the viewport floor are not.)*
- **Networking:** client-server over Colyseus 0.16 (WebSocket); roster via schema sync, all
  spatial state via per-client frames; PROTOCOL_VERSION gates wire breaks.
- **Transport:** WebSocket (TCP) is the incumbent; its real risk at ~150 ms is head-of-line
  blocking under packet loss, not latency. Transport choice is an explicit engine-selection
  criterion (Step 3), evaluated jointly with the lag-compensation decision.
- **Scalability (RESTATED 2026-08-21, Story 7.6):** **the beta posture is a SINGLE, vertically
  scaled Render game-server instance** (Eric, 2026-08-18 — he keeps his own servers). The
  architecture must nonetheless not foreclose horizontal scale-out: monorepo is retained; no
  single-process assumptions baked into room or lobby design; Presence/Driver injectable
  (memory → Redis as config). Scale-out stays a **deploy-time knob, explicitly NOT beta work**,
  and **Render autoscaling must never be enabled** — Render has no WebSocket sticky sessions, so
  autoscaling would actively break seat reservation and matchmaking. *(Was justified by "a
  portal-launch traffic spike (hug of death)". The portal spike is retired as a driver; the
  no-single-process obligation and the never-autoscale warning survive on their own terms — see
  NFR10 and AR1.)*
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
  file pipeline. *(RE-BASED 2026-08-21, Story 7.6, following NFR9: the constraint's original
  justification was portal bundle-size limits; with the portal gone it stands on NFR2's cold-load
  budget. The constraint survives its reason — it is not relaxed.)*

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
6. **60 FPS with multiplied effects** — E6's information texture adds persistent visual state
   (smoke trails, splashes, flashes) to every fight. *(RESTATED 2026-08-21, Story 7.6: the
   driver was written as "Chromebook 60 FPS". The device is retired; the driver is not — the
   bar is now 60 FPS on the reference MacBook at the 1366×768 viewport floor, measured against
   the per-epic frame budget below.)*
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
| ~~Portal SDK constraints (ad-break hooks touch match-flow UX)~~ | **CLOSED 2026-08-21 (Story 7.6).** No portal SDK ships. The concrete integration is AdSense H5 Games Ads behind the retained `PortalAdapter` interface (AR11), landed at Story 7.4; the ad-break hook is the death→return-to-port interstitial and no ad surface exists during a live match |
| ~~Chromebook 60 FPS with full E6 effects~~ | **CLOSED 2026-08-21 (Story 7.6).** The Chromebook is retired (epic-7 amendment 1). The standing assumption is 60 FPS on the reference MacBook at the 1366×768 viewport floor, audited by the per-epic frame budget; Chrome 4× CPU throttle is retained as a cheap stress check, never as the gate |

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

- **Perf ceiling on the reference device** — the risk is discovering the blown budget at E7;
  mitigated by per-epic frame budgets and building E6 effects against a budget, not
  auditing after. *(RESTATED 2026-08-21, Story 7.6: was "on low-end hardware", framed as an E7
  portal-certification discovery. There is no certification gate; the risk is unchanged in
  substance and is now measured against the reference MacBook at the 1366×768 viewport floor.)*
- **Hug of death** — a traffic spike exceeding single-instance capacity; the architecture must
  make scale-out a deploy-time knob, not a rewrite. The drone-lobby harness doubles as the
  pre-launch load test. *(RESTATED 2026-08-21, Story 7.6: the premised spike was a portal
  feature slot. With self-publishing there is no such single event, so the LIKELIHOOD drops
  sharply — but the risk is not deleted: a link can still go around, the beta runs on one
  vertically scaled Render instance, and Render autoscaling is forbidden, so the ceiling is
  hard. Vertical scaling is the only sanctioned growth lever at beta.)*
- **First-match feel at latency** — lag comp retrofitted late is the classic failure;
  first-match feel is the entire retention funnel. *(RESTATED 2026-08-21, Story 7.6: was
  "…the entire retention funnel on a portal". Self-published, the first match is if anything
  MORE load-bearing — there is no portal catalogue to bring a second visit.)*
- **Fog-trust collapse** — one demonstrated leak ("the fog is fake") attacks the USP itself;
  invariant coverage is per-feature definition of done, not a standing test suite alone.
- **Cold start × modes** — Solo vs AI is the only mode that works at population zero, which
  makes it the launch-day first match for most players: combat-bot AI quality sits on the
  retention critical path, not in E5 filler. Architecturally first-class, never a fallback.
- **Ad seam is the death seam** — real-time multiplayer has no mid-match ad inventory; the
  death→requeue flow is simultaneously the revenue moment and the retention moment, and must
  be designed for both. *(RESTATED 2026-08-21, Story 7.6: was "portal SDK constraint, surfaced
  now, integrated at E7". The constraint is real and unchanged, but it is not a portal's — it is
  the AdSense H5 Games Ads interstitial placement ruled at Story 7.4, riding the seam AR11
  retained. Surfaced at Epic 0, integrated at Story 7.4.)*
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

*Premises changed, conclusion re-affirmed (2026-08-21, Story 7.6 — G5).* The two supporting
premises in the last sentence above have retired with the rescope: there is no portal gate and
no Chromebook load requirement. **The decision stands unchanged on its primary reasoning** — the
text-and-tests agent-substrate argument, which never depended on either — and on NFR2's cold-load
budget, which a Unity WebGL bundle would still blow. The original rationale is left verbatim as
the reasoning of record; do not re-litigate.

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
built, ahead of E1.** It was to pair with the Track-2 hosting move (Colyseus Cloud + static client
split) as "one motion" — see Hosting Posture, SUPERSEDED IN PART 2026-08-18: the static-client
half ships, Colyseus Cloud does not. Epic work (E1 onward) builds on
the stabilized 0.17 room/adapter layer; doing E1 first would mean redoing the adapter against
0.17 afterward.

### Hosting Posture — SUPERSEDED IN PART (Eric, 2026-08-18), THEN DEFERRED (Eric, 2026-08-21)

**The Track-2 trigger fired — open beta IS the first public link — but the destination
changed.** Rescoped by `sprint-change-proposal-2026-08-18.md`; assigned to Story 7.7, which was
deliberately the LAST build story of Epic 7 so beta cut clean at `0.1.0` / `0.1.0`.

> **DEFERRED IN FULL — Eric ruling 2026-08-21. The two-deployable topology below is a PLAN, not
> the shipped state, and the `0.1.0` cut is off.** Beta ships the topology that has been live all
> along: **ONE Render web service**, serving `client/dist` (`server/src/app.config.ts`'s
> `express.static`) alongside the Colyseus arena, same-origin websocket, carrying **ONE version
> number** on the `0.17.X` scheme. Static asset serving is revisited when load makes it a
> problem — revival tripwires, the three options (full split / assets-only CDN / status quo) and
> the OpenFront.io deploy evidence are in `deferred-work.md`. Everything below stands as the
> revival brief. The two bullets that did NOT change: `shared/` is still not a deployable, and
> Colyseus Cloud is still not adopted.

- **Planned topology (DEFERRED — not shipped):** **two deployables, both on Render.** The client ships as a
  **Render Static Site** on the **apex domain** (`client/dist`, CDN-served, no Node process);
  the game server ships as a **Render Web Service** on a **subdomain**, running only the
  Colyseus arena. Ad and analytics identity is per-domain, which is why the client keeps the
  apex.
- **`shared/` is NOT a third deployable** — it is a build-time library both sides compile
  against (the determinism story requires byte-identical sim functions on both). It carries a
  version; it never deploys alone. `PROTOCOL_VERSION` remains the runtime client↔server
  compatibility gate, independent of every release version.
- **Colyseus Cloud is NOT adopted.** Eric elected to stay on Render and **scale vertically**,
  retaining control of his own servers (2026-08-18: *"I don't mind vertically scaling the game
  server right now"*). **Redis-backed Presence/Driver is deferred with it** — a single instance
  needs no shared registry, and the injectability obligation below is what keeps the door open.
- **Matchmaking is NOT a separable service.** In Colyseus 0.17 the matchmaker is a library
  every process shares through Presence/Driver, not a deployable tier. The split is two
  deployables, never three; a "matchmaking service" would mean replacing Colyseus's matchmaker
  rather than deploying it.
- **Render is still structurally unable to host Colyseus scale-out**: no WebSocket sticky
  sessions / per-instance addressing (seat reservation breaks under its load balancer); no UDP
  ingress (blocks future WebTransport). **Never enable Render autoscaling** — it would actively
  break matchmaking. This warning stands for as long as Render is in the path, and vertical
  scaling is the only sanctioned growth lever at beta.
- **Code obligations now (unchanged and still binding):** no single-process assumptions;
  Presence/Driver injectable (memory → Redis as config). Horizontal scale-out remains a
  deploy-time knob, explicitly **not** beta work.

*Superseded original, retained as history:* Track 1 was Render as-is for friends-scale
playtests; Track 2 was to be executed as one motion — Colyseus 0.17 upgrade + game server to
Colyseus Cloud + client/site to static hosting — triggered by "first public link." The 0.17
upgrade shipped as work item #0; the static-client half is executed as described above; the
Colyseus Cloud half is not. The old note that "at portal launch the client bundle ships on the
portal CDN" is void — there is no portal.

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
mechanics · observability/telemetry stack.

*(RESOLVED 2026-08-21, Story 7.6: **"portal SDK integration seam" is struck from this list** — it
is no longer a remaining decision. It is settled: AdSense H5 Games Ads behind the retained
`PortalAdapter` interface, landed at Story 7.4. See AR11 and the Ad / Lifecycle Adapter Seam
section below.)*

---

## Architectural Decisions

### Decision Summary

| # | Category | Decision | Rationale |
|---|---|---|---|
| D1 | Netcode / feel | Bounded fire-time compensation (RTT-clamped) + hits vs live server state; tick ratified at 20 Hz | Removes input-delay penalty (unfair) while preserving lead-the-target (the game); no rewind kills behind cover |
| D2 (AMENDED 2026-09-10) | Boon effects | Hybrid: declarative descriptors + named shared behavior hooks (hooks pure/deterministic, parity-tested) — **amended by the Deck amendment: `stock` added, `slotReplace` deleted, lines carry tiers (D19)** | Two-home taxonomy made concrete; catalog stays data, exotic behavior stays deterministic in shared/ |
| D3 | Perception | Signal registry + listening ring as bearing-only events | Add-a-signal = fill-in-a-row; invariant coverage by construction |
| D4 | Match lifecycle | PROVISIONAL: sinking ships win-eligible until fully sunk; later-sinker wins; same-tick = draw. Sinking is a REVERSIBLE state | Design genuinely open (Eric, 2026-07-17); future heal may refloat — architecture commits to reversibility, not to the win rule |
| D5 | Combat AI | Utility AI over observe() views, staggered ~250 ms; PvE drones on cheap threat-check tier; bot-vs-bot evaluation via the triple-duty harness | Structurally fair (bots lack the data to cheat); cost ceiling ≈ human lobby |
| D6 | Matchmaking | Colyseus 0.17 QueueRoom; modes = queues (Standard, Solo vs AI); min-2 fill-or-timer, cap 20; roster-scaled map at countdown; queue-liveness UX constraint | Framework-native fit for E5's lobby rules |
| D7 | Persistence | ~~localStorage client prefs only; NO accounts, NO server player DB at beta~~ **SUPERSEDED 2026-09-09 — see the Account Store amendment (D9–D18)** | ~~Light to Hold; accounts are post-beta scope~~ Accounts ship with the deck model v3 |
| D8 | Scale plumbing | Presence/Driver injectable now; ~~Redis arrives with the Colyseus Cloud move (Track 2)~~ **AMENDED 2026-09-09:** the Cloud trigger is struck; vertical scaling only | One motion, one pipeline; no Redis on Render ever |

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

> **AMENDED 2026-09-10** — see *D2 — Boon Effect Model (AMENDED)* under the Deck amendment below. The descriptor engine stands; `slotReplace` is deleted, `stock` is added, and a catalog entry is a line with tiers (D19).

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

## Amendment 2026-09-09 — The Account Store (E9)

> **Scope.** A scoped pass of the architecture workflow on ONE system: the account store
> (GDD open note 16, delegated to this workflow with no added design constraint — Eric,
> 2026-09-03). It SUPERSEDES **D7** in full and **D8** in part, and adds **D9–D18**. Every
> other decision in this document stands. Versions verified against the npm registry on
> 2026-09-09.

### Decision Summary (account store)

| # | Category | Decision | Rationale |
|---|---|---|---|
| D7 (SUPERSEDED) | Persistence | ~~localStorage client prefs only; NO accounts, NO server player DB at beta~~ | Retired by deck model v3 (Eric, 2026-09-03: accounts ship with the deck, *"go big or go home"*) |
| D8 (AMENDED) | Scale plumbing | Presence/Driver stay injectable; still no Redis on Render; the "Colyseus Cloud move" trigger is struck — vertical scaling is the only growth lever (2026-08-18) | The account store adds no process and no shared registry, so D8's obligations are unchanged |
| D9 | Topology | **In-process module** `server/src/account/`, mounted once in `app.config.ts`, same origin as the game | Zero new deployables; Story 7-7 stays deferred; the account token rides matchmaking through the same `static onAuth` the staging gate already reads |
| D10 | Framework | **Upgrade Colyseus 0.17 → 0.18** (all packages, both sides) as the FIRST work item of E9 | Eric 2026-09-09: *"keep everything CURRENT"*; `@colyseus/database` and `@colyseus/admin` exist only on 0.18 |
| D11 | Storage | **Render managed Postgres**, one instance per environment, both on the smallest paid tier, declared in `render.yaml` `databases:` | Survives deploys, backups, keeps zero-downtime deploys (a disk would disable them); Blueprint-is-truth holds; ~$6/mo each |
| D12 | Data layer | **`@colyseus/database` 0.18** (Drizzle ORM + `postgres` driver), migrations as **checked-in SQL files** generated by `drizzle-kit` — never `"auto"` in production | Typed schema, one migration path, reviewable SQL; the module's `db.auth` service gives token revocation for free |
| D13 | Auth | **`@colyseus/auth` 0.18**, OAuth ONLY (Google, Discord, minimal scopes), a **curated endpoint subset** (userdata + OAuth), the popup **callback endpoint replaced** to pin the postMessage origin to `HC_SITE_ORIGIN`, identity keyed on **(provider, subject)** with a **second provider LINKING to the same account**, **JWT 30 days** with token-version revocation | Eric's pick over a hand-rolled client; 0.18's endpoint map lets the rejected email/password/anonymous routes stay unmounted |
| D14 | Card ids | **camelCase line ids declared in `shared/`** beside the catalog (`heavyTorpedo`, `hullRepair`); a deck row is `{lineId, copies}` | Rename-proof (FLAK GUN was SHRAPNEL GUN a week earlier); matches the existing boon-id convention the sim addresses cards by |
| D15 | Deletion | **Self-serve delete**: account, sessions, decks, unlocks and prefs removed; match-history rows keep deck contents with the account reference nulled | Google/Discord developer terms expect a deletion path; Eric's metrics survive as anonymous rows |
| D16 | Admin | **`@colyseus/admin` 0.18 for Eric** (own admin login, RBAC, CRUD over the account tables); **players get their own history route** in the account API | Eric 2026-09-09: *"I DO want @colyseus/admin for ME"* |
| D17 | Prefs & settings | **Two states, nothing in between** (Eric 2026-09-09): anonymous = starter deck only, no progression, no deck editor, settings in localStorage exactly as today; signed in = the account holds callsign, colour preference, last class AND the settings store, and the client switches to them | Adds a chosen display name to stored data (privacy paragraph names it) |
| D18 | Write path | Deck **loaded + validated at the DOOR** (queue for standard, arena for solo; one shared loader, never from the client); XP, tokens and history **written off-tick** at match end from a server-only `MatchRecord` through an `AccountWriter` port that drains on shutdown; a write failure can never touch a match | The sim stays pure and Colyseus-free; the tick loop never awaits the database |

### D9 — Topology (detail)

- `server/src/account/` is a self-contained module: `index.ts` exposes exactly two things —
  `accountEndpoints()` (a better-call endpoint map spread into the ONE `createRouter` call in
  `app.config.ts`, beside `getMetrics` / `getLiveness`) and `createAccountWriter()` (the port
  the rooms call). Nothing under `game/` imports it; `world.ts` and `match.ts` keep zero
  persistence imports exactly as they keep zero Colyseus imports.
- **Absence-gated like GA/AdSense:** with no `DATABASE_URL` the module mounts nothing, NEVER
  constructs `GameDatabase` (whose own default is a silent SQLite file at `./colyseus.db` —
  a pin test asserts no construction without the URL), the home screen renders no SIGN IN,
  and the game is byte-identical to today. Staging carries
  its own database and OAuth apps so the account layer is QA'd on the dev host — this is
  deliberately NOT the ads/analytics blind spot.
- **7-7 compatibility, checked:** the account token is a Bearer header, not a cookie, so a
  future apex/subdomain split changes nothing here; the admin console's own cookie is
  `SameSite` within the registrable domain and also survives it.

### D10 — Colyseus 0.18 upgrade (detail)

- Pinned targets (verified 2026-09-09): `colyseus` 0.18.5 · `@colyseus/core` 0.18.12 ·
  `@colyseus/schema` 5.0.27 (both sides) · `@colyseus/tools` 0.18.3 · `@colyseus/sdk` 0.18.2 ·
  `@colyseus/auth` 0.18.2 · `@colyseus/database` 0.18.3 · `@colyseus/admin` 0.18.5 ·
  `@colyseus/monitor` 0.18.3 · `@colyseus/playground` 0.18.4 · `postgres` 3.4.9 ·
  `drizzle-kit` 0.31.10. Node stays 22 (22.19 locally).
- Measured touchpoints in this codebase: `setSimulationInterval` → `setTimestep` (one call,
  `ArenaRoom.ts`); `setMetadata` now REPLACES (both rooms already write whole objects — verify,
  don't assume); `Client#id` is gone (no uses found); schema field cap 63 (`ArenaState` has
  23); `createRouter` survives; `static onAuth(token, options, context)` keeps
  `context.headers`, so the staging gate and PROTOCOL_VERSION gate are untouched. Schema 4 → 5
  on both sides is the largest piece; ~26 test files import Colyseus APIs.
- Ships as its own PR with `PROTOCOL_VERSION` bumped (the schema encoder changed) and a full
  headless-smoke pass BEFORE any account code lands. A framework upgrade and a feature never
  share a PR.

### D11 — Storage (detail)

- `render.yaml` gains two `databases:` entries (`hullcracker-db`, `hullcracker-dev-db`), each
  web service gets `DATABASE_URL` via `fromDatabase.property: connectionString`. Region
  `oregon`, same as the services. Free tier REJECTED for staging: it expires after 30 days.
  **The `databases:` entries land in the SAME PR as the code that reads them, never ahead:**
  the Blueprint auto-syncs on `main`, so the file creates and bills both instances the moment
  it merges, whether or not anything reads them.
- No persistent disk on either web service, ever: a disk disables zero-downtime deploys and
  would drop every live match on each push.
- Backups: Render's managed backups are the whole story at launch; no export job.

### D12 — Data layer (detail)

- `GameDatabase` opened with `migrations: { files }`; `drizzle-kit generate` output is committed
  under `server/drizzle/` and runs at boot. The module's own tables (`colyseus_users`,
  `colyseus_roles`, `colyseus_admin_audit`, …) are created by the same files; unused plugin
  tables (leaderboards, cloud saves, analytics) cost nothing and are NOT wired.
- **Never `applyRouterDefaults` / the auto-mount.** It spreads the ENTIRE auth endpoint map.
  The account module builds the router itself (D13).
- Account tables (Drizzle schema in `server/src/account/schema.ts`):
  `account_identities (provider, subject) → user_id` (several rows may point at one user —
  D13 linking) · `account_profiles (user_id, callsign, color_pref, last_class, settings
  jsonb)` — `color_pref` is a PREFERENCE, never the server-assigned wheel index `regatta.ts`
  hands out at join; `settings` is the client settings store's own versioned shape, migrated by
  the client's existing `migrate` · `decks (id, user_id, hull, cards jsonb[{lineId, copies}],
  updated_at)` · `unlocks (user_id, line_id)` · `account_progress (user_id, xp,
  tokens_spent)` — **level and available tokens are DERIVED** (`level = f(xp)`, `available =
  level − tokens_spent`), never stored, so the match-end write is one atomic
  `UPDATE … SET xp = xp + $1` with no read-modify-write race (one account in two browsers is
  Tuesday: `sessionLock` is per browser) · `matches (id, mode, started_at, ended_at,
  roster_size, winner_class)` · `match_participants (match_id, user_id nullable **FK ON DELETE
  SET NULL**, role, class, placement, kills, deck_brought jsonb[lineId], deck_drawn
  jsonb[{lineId, atMs}], deck_taken jsonb[{lineId, atMs}])` — the `atMs` stamps are what the
  history route prints as `T+mm:ss`. `colyseus_users.email` is NULL for every
  player, permanently.

### D13 — Auth (detail)

- OAuth apps per HOST (redirect URIs differ): `HC_OAUTH_GOOGLE_ID/SECRET`,
  `HC_OAUTH_DISCORD_ID/SECRET`, plus `JWT_SECRET`, `SESSION_SECRET` — all server env,
  `sync: false`, never `VITE_*` (`client/.env.*` is not gitignored — deferred-work.md).
  Scopes: Google `openid`, Discord `identify`. No email scope on either.
- Endpoint map is built by hand: `auth-userdata` + the OAuth `start` endpoint from
  `oauthEndpoints()`, with the `callback` entry REPLACED by `server/src/account/oauthCallback.ts`
  — a copy that posts to `postMessage(payload, HC_SITE_ORIGIN)` rather than `'*'`.
  **`HC_SITE_ORIGIN` is CONFIG, one per host, declared in the clear in `render.yaml`** (an
  origin is not a secret) — never derived from the `Host` header, which the caller controls. `auth-login`,
  `auth-register`, `auth-anonymous`, forgot/reset/confirm are never mounted. A pin test asserts
  the mounted path set.
- `onOAuthProviderCallback` is the module's; it upserts `account_identities` on
  `(provider, profile.id | profile.sub)` and returns `{ id: userId }`. **The `upgradingToken`
  branch is decided (Eric 2026-09-09): a caller already holding a valid token who completes
  OAuth with a SECOND provider gets that identity LINKED to the same user** — one account, two
  ways in, both removed by deletion. The module's default merges by email, which we never
  hold, and would have minted a second account silently. The JWT payload carries
  the opaque user id and `tokenVersion`, nothing else. `expiresIn: '30d'`. Sign-out and
  deletion call `db.auth.bumpTokenVersion(userId)`, which the module's `revocationCheck`
  enforces on every verify.
- The token lives where the SDK puts it (localStorage) and rides matchmaking as
  `Authorization: Bearer`; both rooms' `static onAuth` verify it AFTER the PV and staging gates
  and attach `{ userId }` or `null` (anonymous is a first-class result, not an error).
- **Trap:** `colyseus_users.anonymous` defaults to `true` — the callback must write `false`.

### D14 — Card ids (detail)

- `shared/src/sim/catalog.ts` declares `LINE_IDS` (29 camelCase ids, one per catalog v3 line)
  and the per-line cap; the deck-legality check (`shared/src/sim/deckRules.ts`, pure) and the
  store both address cards by these ids. Display names live only in client copy. Adding a line
  = one id + one cap; a rename = zero store migrations.

### D15 — Deletion (detail)

- `DELETE /api/account` (authenticated): one transaction — delete identities, profile, decks,
  unlocks, progress, the `colyseus_users` row; set `match_participants.user_id = NULL` on every
  row that referenced it; bump token version first so no live token survives. Response 204.
  Settings gains a DELETE ACCOUNT control with a confirm. The privacy paragraph states both the
  deletion path and that anonymized match records are retained.

### D16 — Admin & the players' history route (detail)

- `@colyseus/admin` mounted at `/admin` + `/admin-api` in BOTH environments, gated by its own
  login (the bootstrap admin is created ONCE, out of band, never by a route); on the dev host
  it sits BEHIND the staging gate so the password page comes first — two doors, one secret,
  cycle 127's posture. Player accounts never hold an admin role.
  Account tables are exposed through its `tables` option so history is browsable without SQL.
  **Knowing exception, ledgered:** the admin login stores ONE password hash — Eric's — in
  `colyseus_users`; the "no own email/password storage" rejection was about players and stands.
- Players: `GET /api/account/history?cursor=` returns the caller's own `match_participants`
  rows (brought / drawn / taken, placement, kills, T+ stamps). Enemy decks are never returned
  by any route — the query is keyed on the caller's user id, not on match id.

### D17 — Prefs & settings (detail)

- **Two states, nothing in between (Eric 2026-09-09):** *"Anonymous accounts don't get
  anything but the starter deck. If someone wants an account THEN AND ONLY THEN do they get
  progression and deckbuilding … leave settings connected to localstorage. BUT if someone DOES
  have an account, then we can switch them to their database account settings."* So the
  anonymous path is byte-identical to today: `hullcracker.*` localStorage for callsign, colour
  preference, last class and the settings store; no XP accrues, no deck editor renders.
- Signed in, `account_profiles` is the source of truth and the client switches to it: on the
  FIRST sign-in of a fresh account (no profile row) the local values SEED the row — the account
  never wipes a callsign someone has carried for weeks; on every later sign-in the account wins
  and overwrites local; edits while signed in write both. Sign-out leaves local as it was.
  The callsign becomes stored personal data and is named in the privacy paragraph.

### D18 — Write path (detail)

- **At the DOOR — both doors:** SOLO VS AI is `client.create('arena', { solo: true })` and never
  touches the queue, so "the queue loads the deck" alone would leave solo on the starter deck
  forever or, worse, trusting client options. ONE shared `loadDeckFor(userId, deckId, hull)`
  is called by `StandardQueueRoom.onJoin` for standard and by `ArenaRoom.onJoin` for solo. It
  loads the deck for that user, runs `deckRules.check()` (pure, `shared/`) against the catalog
  caps and the account's unlocks, and returns the 40 line ids, which the queue puts into the
  seat reservation options exactly as it already does for `name`/`cls`/`horn`
  (`sanitizeArenaOptions`). **A client-supplied `deck` key is REJECTED by the sanitizer at
  BOTH doors** — a deck reaches the arena only because the server put it there. Anonymous →
  the hull's starter deck; invalid → a refusal with a reason, never a silent substitution.
- **At match end:** the room builds a server-only **`MatchRecord`** from `World` (deck state is
  server-private) and `Match` (placements) and calls `accountWriter.recordMatch(record)` —
  fire-and-forget, logged on failure (`account.write.failed { matchId }`), never awaited on
  the tick. **`MatchRecord` is NEVER `ResultsMsg`:** the wire results row is broadcast to every
  client, so a deck field added there would hand every enemy deck to every player — not a
  spatial leak, so the perception invariant would not catch it. A pin test asserts `ResultsMsg`
  carries no deck field. **The writer DRAINS on shutdown** (`AccountWriter.flush()` from the app
  shutdown hook): Render sends SIGTERM on every deploy, and twenty matches ending as the process
  dies must not lose twenty XP grants. XP and tokens are computed
  from the SAME `MatchRecord` by a pure `shared/` function (`progression.ts`: placement
  scaling, Solo-vs-AI discount, the matches-to-catalog CONFIG dial) and written in the same
  transaction as the history rows. Bots' and anonymous captains' decks are recorded with
  `user_id = NULL`; a captain who DELETED their account mid-match is written the same way
  (the FK's `ON DELETE SET NULL` plus a writer that treats a vanished user as anonymous), so
  one deletion can never roll back a whole match's history.

### What did NOT move

- The master perception invariant keeps SIX declared exceptions; nothing spatial changes.
- Story 7-7 stays deferred in full; no new deployable, no CORS, no cross-origin cookie.
- `PROTOCOL_VERSION` moves for the 0.18 schema encoder (D10) and again when E8 adds `deckId`
  and consumable slot state to the wire — never for the account API, which is HTTP.

---

## Amendment 2026-09-10 — The Deck (E8, upgrades v3)

> **Scope.** A scoped pass of the architecture workflow on the systems E8 (GDD epic *The
> Deck*, catalog v3 of 2026-09-09) adds that D2, D3 and Novel Patterns 2–3 do not cover: the
> tiered card model, the generic weapon and consumable slots, the match pool and the opening,
> wake drafting, smoke as a sight occluder, the new ordnance classes and their signals, the
> damage gate, and bot decks. **D2 is AMENDED (not superseded), Novel Patterns 2 and 3 are
> AMENDED, and D19–D31 are ADDED.** Every other decision in this document stands, including the
> whole 2026-09-09 account-store amendment (D9–D18) — D14's `shared/src/sim/catalog.ts` is the
> SAME file D19 fills. Decisions marked **(Eric)** are rulings he took live on 2026-09-10; the
> rest are recommendations he accepted. Nothing here invents a card or a number: every scalar
> cited is catalog v3's, `[DRAFT]` where that document says so, and the code-seam facts were
> read from `HEAD` (`PROTOCOL_VERSION` 49) on the same day.

### Decision Summary (the deck)

| # | Category | Decision | Rationale |
|---|---|---|---|
| D2 (AMENDED) | Boon effects | The descriptor engine STANDS (`stat` / `slotFill` / `doctrine` / `behavior`) and gains ONE kind, `stock`; `slotReplace` is DELETED; a catalog entry is now a LINE with TIERS, not a flat def | v3 has no replace flow (≤3 equipment lines per deck, three slots) and no rarity; the engine's homes are unchanged — `stat` still reaches only `effectiveStats()`, slot effects still run through the one shared `applySlotEffect` both sides replay |
| D19 | Card model | **One engine, tiers as effect bundles**: a line is `{ id, kind, cap, tiers[] }`, tier N a bundle of D2's kinds, authored from a per-tier STEP TABLE so the catalog file reads like Eric's sheet; add-ons carry an explicit `appliesTo` list; the equipment reload step and the fractional-step floor are DERIVED in `clampStats`, never written by a card | Ladders, weapons, add-ons and consumables all ride one path; the sheet stays the authoring surface; order-independence of the fold becomes a pin |
| D20 | Loadout | **One flat 9-slot array with roles**: `gun`, `boost`, `weapon ×3`, `consumable ×4`; one slot-state shape for all nine (a consumable is a stack that never reloads); the wire ammo array stays slot-aligned; the client keeps rebuilding slot contents by replaying the applied-card list | Every consumer (inputs, equipment tick, hotbar, wire) keeps its shape; class identity leaves the loadout entirely — every hull's loadout at 0:00 is identical |
| D21 | Consumable activation | Consumables ride the TWO EXISTING input channels, split by `isWeapon`: key-fires on the ability counter (like the Shift boost), the aimed DECOY BUOY on the click counter with the mine's rear arc; a full slot row REFUSES the pick before the card leaves the deck, on one shared predicate both sides run | No new channel, no priming state, reconnect-safe by construction (slot state is `OwnShip`) |
| D22 | Deck state | The deck is a **server-private multiset**; the match pool is rolled ONCE per room on a **server-private stream** (the zone-ring nonce pattern) and appended to every deck AFTER the legality check; **equal-weight draw** (copies in deck, nothing else); the level-zero draw carries a **usable-card guarantee**; the **mulligan is a spend sentinel**, honoured once, countdown only; the draw-pile counter is one self-private integer | Composition never rides the wire; the never-reroll pin gains exactly one asserted exception; the pool is unforgeable from anything a client holds |
| D23 | Wake drafting | **Shared lift function, server-computed self-private scalar, client folds it**: `draftLift()` in `sim/wake.ts` over last tick's ribbons; `OwnShip.draft`; `draftedKinematics` is the THIRD per-tick step in the pinned fold `boosted → slowed → drafted → hooks`, identical on both sides | Prediction reads only own-ship state and the disclosed wake is a mask with no geometry, so client reproduction is impossible; a scalar carries no position; error is bounded by the lift |
| D24 | Smoke occluder | **One `sightClear()` predicate** = island LOS ∧ no puff crossed (`segCircleHit`), at ALL FIVE sight-tier callers (true sight, the 3/8 detect rung, the muzzle-flash and wounded-smoke halos, the foghorn muffle); radar is untouched BY CONSTRUCTION (its gate is the height march); symmetric, so a puff hides its occupant and blinds an observer inside it; puffs travel as a new frame channel | Smoke is an island for every sensor but radar — one occlusion rule, not two; the GDD's `[DRAFT]` self-hiding falls out of symmetry rather than being a rule |
| D25 | Collision | **One `hitTargets(kinds)` collector** with a per-ordnance TARGET MASK in CONFIG (`hull` / `mine` / `decoy` / `ordnance`); a burst detonates any mine inside it, **perception-blind** — *"any mine you can see"* is descriptive; chain detonations resolve in the same tick | The one-structure law; the shell step already consumes one target list (hulls + buoys) and simply widens; collision never depends on an observer |
| D26 | Held fire | **A validated `held` LEVEL on `InputMsg`**; while true with a stream-kind slot primed and in arc, the server fires at the weapon's cadence from its pool; stream shells carry no per-shell fire time and take no back-date; the click counter is untouched | A level rides latest-wins and costs no intent-queue slots; re-emitting clicks would fight the consumed-not-queued latch and make the rate the client's |
| D27 | Signals | Every new ordnance kind gets its own wire kind and registry rows, revealed at the sight boundary with position + velocity only; homing ordnance gets an update row; **gun-shell rules everywhere** — own-splash, flash, one Hit Call per shell resolution — for missile, monitor and flak; **the machine-gun stream flashes PER SHELL (Eric)**; the six declared exceptions stay six | The Gunnery Conversation's oracles extend by ordnance kind under their existing clauses; CHAFF is a second SOURCE of the jamming carve-out, not a new clause |
| D28 | Damage gate | **ONE `applyDamage()`** replaces the THREE hull-hp writers found at `HEAD` (`applyStorm`, `hitShip`, `burnShip`); SHIELD BLOCK absorbs there, **from every source (Eric)**; repairs stay the separate hp-increase path | Verified: no chokepoint exists today, so the shield would otherwise be three `if`s; the assist ledger and the sink check get one caller |
| D29 | Mines & decoys | **No per-player cap and NO room ceiling (Eric)** — `maxLive`, `globalCap` and oldest-eviction are DELETED; the only bound is pools × reloads, with a perf pin at the reachable peak; the DECOY BUOY's HP rides its view **owner-only** | *"A mine exists until triggered or destroyed"* holds absolutely; the ledgered *killed-vs-expired is indistinguishable* thread closes for the one buoy that survives |
| D30 | Shift boost | A **permanent slot** (`boost`, slot 1) on every hull through the unchanged `Equipment` interface; **+25 % of the ladder-raised max (Eric)** — `bonus = factor × kin.maxSpeed` post-fold; its reload is an equipment reload, so the RELOAD ladder scales it through the one `cooldownScale` multiply | Closes GDD open note 21's base-vs-raised question; the speed-boost EQUIPMENT (card-fitted) is deleted, its module becomes the permanent row |
| D31 | Bots | Bot decks are **authored in the player format** and legality-checked in a BOOT-TIME test; a **total consumable-tactic table** joins the total equipment-tactic table; the harness gains `authored` and `random-legal` deck arms with the pool rolled per match | No consumable and no weapon can ship without a bot rule — the type forces it, as it does today for equipment |

### D2 — Boon Effect Model (AMENDED 2026-09-10)

- Effect kinds after this amendment: `stat`, `slotFill`, `doctrine`, `behavior`, **`stock`** (new —
  puts one copy of a consumable into the ship's consumable row). **`slotReplace` is DELETED**: a
  legal deck holds at most three lines whose copy 1 fits an equipment slot (GDD note 13), so a
  fourth weapon is unreachable and the replace flow with it. Its deletion is pinned, and with it
  the two laws it carried become vacuous-but-kept: *the slot keeps its clock across replacement*
  and *swap cheese is a NEVER* are asserted as "fitting a weapon never touches another slot's
  timer", which is the only form either can still take.
- `stat` effects are still read ONLY by `effectiveStats()`; `applySlotEffect` is still the single
  slot-mutation path both sides run; `behavior` hooks stay pure and parity-tested. **The hook
  registry ships EMPTY at `HEAD` and stays empty after v3**: drafting and the boost are per-tick
  KINEMATICS STEPS in the pinned fold (D23, D30), not card-carried behaviours, so they do not enter
  `HOOK_REGISTRY`.
- Rarity is gone: `BoonRarity`, `CONFIG.deck.rareWeightBase` / `rareWeightPerDryLevel`,
  `DeckState.levelsSinceRare`, and the `exclusive` validator rule are deleted. Acquisition is gone:
  `acquire()`, `isAcquisitionDef`, `consumeAcquisition` and the per-category deck composition
  (`EQUIPMENT_CATEGORY`, `UNIVERSAL_CATEGORIES`, `buildDeck`'s subdeck walk) are deleted — a deck is
  a list of line ids and nothing derives it.

### D19 — Card model (detail)

```ts
// shared/src/sim/catalog.ts — D14's file, now holding the whole v3 catalog. Wire contract: any change bumps PROTOCOL_VERSION.
export type LineKind = 'equipment' | 'ladder' | 'addon' | 'consumable';
export interface CatalogLine {
  readonly id: LineId;                       // camelCase, D14 — 'heavyTorpedo', 'hullRepair', 'deckGun'
  readonly kind: LineKind;
  readonly cap: number;                      // copies = tier ceiling; tiers.length === cap, pinned
  readonly tiers: readonly (readonly BoonEffect[])[];   // tier N folds tiers[N-1]; copy 1 of an equipment line = [{ kind: 'slotFill', equipmentId }]
  readonly appliesTo?: readonly EquipmentId[];          // addon only: the family, as an explicit list (ACOUSTIC HOMING → ['lightTorpedo','heavyTorpedo'])
}
// Authoring helper — the file reads like Eric's sheet; the generated bundles are what is frozen and pinned.
export const CATALOG = freezeCatalog({
  heavyTorpedo:   weapon('heavyTorpedo', { damage: +5, speed: +2.5, tubes: +0.5 }),        // 5 tiers: [slotFill] + 4 step bundles
  armor:          ladder('armor', 4, { maxHp: +25 }, { healOnGrant: true }),
  acousticHoming: addon('acousticHoming', ['lightTorpedo', 'heavyTorpedo'], 'homing'),    // one doctrine effect per target
  hullRepair:     consumable('hullRepair', 5),                                             // 5 × [{ kind: 'stock', equipmentId: 'hullRepair' }]
  // …
});
```

- **The fold.** `effectiveStats(cls, cards: readonly LineId[])` — `cards` is the ship's applied
  cards in pick order (a line id appears once per copy taken; it is what rides `OwnShip.boons`
  today, renamed `cards`). Per line, copies held = count in `cards`; tiers `0..copies-1` fold in
  order. **Order-independence is a PIN**: every v3 stat effect is an `add`, or a `mult` on a path
  no other line adds to (the ×1.1 compounding rings and lit radius); `validateCatalog` refuses a
  path with both an add-writer and a mult-writer across lines, and a property test asserts that
  any permutation of a legal pick list yields byte-identical stats. Doctrine verbs are booleans and
  cannot be order-sensitive.
- **Held-ahead add-ons need no mechanism.** A doctrine verb lives on `EffectiveStats`, not on a
  slot, so ACOUSTIC HOMING taken before either torpedo simply sets `homing` on both target
  equipment rows and is true the tick a torpedo is fitted. `appliesTo` generates one `doctrine`
  effect per listed equipment; SUPERCAVITATING is excluded by not being listed (R22) — no
  family enum, no "never homes" flag.
- **Two derivations move into `clampStats`, beside `cooldownScale` and the `rangeU` re-pins:**
  the **equipment reload step** — `reloadMs = base × round3(1 − step × (tier − 1)) ×
  cooldownScale` for a weapon line, `× (1 − step × tier)` for the deck gun whose tier I is a
  real step (R14), with `step = CONFIG.catalog.reloadStepPerTier` (0.05) overridable per line —
  and the **fractional-step floor**: integer stats (tubes, turrets, flares, held mines, barrels)
  accumulate as floats in the fold and are floored ONCE at the end, so `1 + 0.5 × 2 = 2` at tier
  III and nothing shows until a whole completes (Eric's standing rule). Neither is a stat path a
  card can write; the seven `<equipment>.reloadMs` paths stay whitelisted-but-unwritten exactly as
  today, so a future per-line reload card still composes BEFORE the step.
- **`EffectiveStats.equipment` becomes a TOTAL record keyed by `EquipmentId`** (11 lines + `gun` +
  `boost`), each row carrying its `tier` — replacing the hand-named `gun` / `torpedo` / `mine` …
  fields. The three torpedoes are three equipment ids over one shared stat shape; a stat path is
  `'<equipmentId>.<field>'` and `BOON_STAT_PATHS` is generated from the record, not typed by hand.
  `sightRange`, the `rangeU` family, `mine.triggerRadius` (2/3 of blast, and the captive's ×3
  swap) stay DERIVED and off the whitelist.
- **What a card can never do under D19:** address a derived field, reload a consumable, fit a
  fourth weapon, or put a copy of a line past its cap — the last is refused at the door by
  `deckRules` (E9 Pattern 6) and again by `drawOffer`, which never offers a line at cap.

### D20 — Loadout (detail)

```ts
// shared/src/sim/loadout.ts
export const SLOT_ROLES = ['gun', 'boost', 'weapon', 'weapon', 'weapon', 'consumable', 'consumable', 'consumable', 'consumable'] as const;
export const SLOT_COUNT = 9, SLOT_GUN = 0, SLOT_BOOST = 1, WEAPON_SLOTS = [2, 3, 4] as const, CONSUMABLE_SLOTS = [5, 6, 7, 8] as const;
export interface LoadoutSlot { equipmentId: EquipmentId | null; state: EquipmentState | null }   // unchanged: { n, reloadMsLeft }
export function loadoutFor(): LoadoutSlot[]   // gun + boost fitted, seven empty — the SAME for every hull; specialsFor() is deleted
```

- **One shape for nine slots.** A consumable stack is `{ n: copiesHeld, reloadMsLeft: 0 }` with
  `maxAmmo = line cap`; its `tick` is a no-op and `tickReload` is never called for a
  `consumable` role. `slotAmmo(ship)` still emits the slot-aligned wire array, now length 9.
- **Fill rules, both on `applySlotEffect`:** `slotFill` takes the first EMPTY weapon slot (it
  cannot fail for a legal deck — a property test over random legal decks pins that the full-row
  no-op is unreachable); `stock` takes the slot already holding that consumable, else the first
  empty consumable slot, else REFUSES (D21). The client replays `you.cards` through the same
  function to rebuild `equipmentId` per slot and reads `n` from `ammo` — today's mechanism, no
  new wire field for slot contents.
- **Emptying:** a consumable slot whose `n` reaches 0 on activation clears to `equipmentId:
  null` in the same tick, so a later pick of that line stocks fresh; a weapon slot never empties.
- **The two permanents:** slot 0 is the deck gun (the `gun` equipment; DECK GUN / TURRET / BARREL
  write `gun.damage`, `gun.maxAmmo`, `gun.barrels` as ladders); slot 1 is the Shift boost (D30).
  The PvE fleet's `[gun, torpedo, mine]` fit becomes a fixed card list (`FLEET_FIT: LineId[]`,
  heavy torpedo and naval mines at tier I) applied at spawn through `applyBoon` — the fleet takes
  no special path, and `drones.test.ts`'s envelope pins are unaffected.
- **Keys:** `Q`/`E`/`R` prime slots 2–4; `1`–`4` with the refit window CLOSED fire/prime slots
  5–8; with it OPEN they still take cards (the digit's meaning is the window's state, a client
  concern); `Digit5 → HEAL_CHOICE` is deleted with the sentinel; `Shift` is slot 1's ability key.

### D21 — Consumable activation (detail)

- `EQUIPMENT_IS_WEAPON`: `hullRepair`, `shieldBlock`, `smokeScreen`, `chaff` → `false` (the
  ability channel: `actSeq` + `actSlot ∈ CONSUMABLE_SLOTS`, no aim, no latency compensation —
  `activationControl` is already ability-only); `decoyBuoy` → `true` (the click channel: primed
  by its digit, fired by click, `input.slot` carries the resolved prime, `arcs.ts` gives it the
  mine's rear sector). Both are one `activate()` on the unchanged `Equipment` interface; a
  consumable's `activate` decrements `n` and does its work.
- **Full-row refusal is a SPEND rule, not an activation rule:** `spendCard` runs
  `canStock(loadout, lineId)` BEFORE `consumeCard`; a refused pick is a silent no-op on the
  server (the card stays in the offer — the never-rerolling offer is the mechanism) and the client
  greys the card with the same predicate. No `denied` view is added: a fair client cannot reach
  the case.
- **Per consumable, the home of the effect:** HULL REPAIR — today's `spendHeal` body moves into
  `hullRepair.activate` (instant + pooled, `tickRepairs` unchanged, afloat-only as today, so a
  sinking hull can no longer heal and D4's reversibility question is not reopened); SHIELD BLOCK
  — `ship.shield = { hpLeft: 100, until }`, read by D28's gate; SMOKE SCREEN — D24; CHAFF — a
  `FakeSource` on the ship (D27); DECOY BUOY — a `decoys` store (D29) placed by `dropDecoy`.
- **Sinking:** consumables obey the existing single sinking-activation gate (Novel Pattern 3) on
  their channel; no per-consumable policy. The ONE policy statement is the gate's value, unchanged
  by this pass.

### D22 — Deck state, the pool, the draw, the opening (detail)

- `DeckState { cards: readonly LineId[] }` — a multiset in insertion order, server-private, never on
  the wire. Built at the seat: authored 40 (starter, or `loadDeckFor` — E9 Pattern 6) →
  `checkDeck` (`deckRules.ts`: exactly `CONFIG.deck.size`, ≤ `maxEquipmentLines` lines whose copy
  1 fits, every line ≤ cap, every line owned) → `+ room.pool` → 50.
- **The pool** (`shared/src/sim/pool.ts`, pure): `rollMatchPool(rng, catalog, CONFIG.pool)` draws
  `size` (10) consumable cards uniformly from the consumable lines, each line ≤ its cap WITHIN THE
  POOL (R44). The `rng` is a **room-private stream** minted the way the storm rings are — a
  per-room nonce, never derivable from `mapSeed` — rolled ONCE in room creation before any seat
  (both doors, solo included), so every deck in the room gets the identical 10. Hidden: it never
  rides the wire, never appears in `WelcomeMsg`, and reaches the store only as `MatchRecord.pool`
  on the match row (Eric's metrics); a player's own history shows the pool cards they DREW and
  nothing else — GDD note 20(a)'s reading, implemented as a filter on the record, ledgered as
  unruled.
- **The draw:** `drawOffer(deck, rng, catalog, opts?)` keeps its non-consuming shape and draws
  `CONFIG.offer.size` DIFFERENT lines, weight = copies in deck and nothing else; a line at its cap
  on the ship is never offered. `opts.guarantee` (level zero only): the first card is drawn
  uniformly among USABLE cards — a consumable, or a line whose next tier is I — then the rest from
  everything else. If a legal deck holds no usable card (a pure gunboat deck can), the guarantee is
  vacuous and the draw is plain; pinned so nobody "fixes" it into a reroll.
- **Level zero at countdown:** `Match`'s countdown-entry hook calls `grantPoint` for every
  captain BEFORE `activate()`; the offer materializes then and is spendable during the countdown
  (`spendPoint`'s guards are bank + afloat, both true). Bots receive it identically.
- **The mulligan:** `SpendMsg.choice === MULLIGAN_CHOICE` (`-2`, beside the retired `-1`, in
  `offers.ts`); `spendPoint` honours it iff `match.phase === 'countdown' ∧ !ship.mulliganed ∧
  ship.offer !== null`; it redraws with the same guarantee, sets `mulliganed`, replaces the offer
  and re-queues `pt`. Anything else is a silent no-op. The never-reroll pin (FR19) gains its ONE
  asserted exception — a test proves a second mulligan and a live-phase mulligan both leave the
  offer byte-identical.
- **The counter:** `OwnShip.deckLeft: number` = `deck.cards.length`, self-private, the only
  deck-derived number on the wire; it discloses nothing about composition. Exhaustion is the
  existing degenerate path: an empty draw banks the level silently and queues no `pt`.

### D23 — Wake drafting (detail)

- **The lift** — `draftLift(ribbons, x, y, now, cfg): number` in `shared/src/sim/wake.ts`: the MAX
  (not the sum — *"trails merge"*) over every OTHER hull's ribbon of a per-segment lift inside
  `cfg.halfWidthU` of the segment, in `[0, cfg.lift]`; own ribbon and torpedo ribbons are
  excluded. Both scalars are `CONFIG.wake.draft.{lift, halfWidthU}` — **`[DRAFT]`, Eric's to set,
  no placeholder in this document.**
- **The fold** — `draftedKinematics(kin, lift, active)` in `shared/src/sim/draft.ts`, the sibling of
  `boost.ts` and `slow.ts`: raises the forward cap by `lift × kin.maxSpeed`, returns the input
  reference when inactive. The pinned composition becomes `boosted → slowed → drafted →
  hookKinematics`, asserted byte-identical at both call sites (`world.ts stepShips`,
  `prediction.ts tickKin`).
- **Server:** in `stepShips`, per ship, `ship.draft = draftLift(...)` is read from the ribbons as
  they stood after LAST tick's `sampleWakes` (`stepShips` precedes `sampleWakes` in `STEP_ORDER`);
  one tick old IS the definition, pinned. `OwnShip.draft?: number` — omitted when 0, the
  `slowedUntil?` idiom, self-private.
- **Client:** `prediction.setDraft(you.draft)` beside `setBoostStats`; `tickKin` folds it; replay
  applies the latest scalar to every un-acked tick. Prediction error is bounded by `lift` per
  tick and is exactly 0 outside a wake — at `draft = 0` both sides are byte-identical to `HEAD`,
  which the parity test pins.
- **Perception posture:** not a registry row, not an exception — own-ship state like
  `slowedUntil`. Accepted and ledgered: the scalar tells a client "a wake is under you" even when
  its hull is island-hidden; the kinematics would disclose the same thing one frame later.
- **Bots** get it passively (no tactic); the harness reports time-in-draft per profile.

### D24 — Smoke as a sight occluder (detail)

- **Entity:** `SmokePuff { id, ownerId, x, y, bornAt, until }` in a new `world.smoke` store;
  `puffRadius(puff, now)` in `shared/src/sim/smoke.ts` = `r0 + (r1 − r0) × min(1, age /
  expandMs)` (`CONFIG.smokeScreen.{r0: 40, r1: 60, lifeMs: 30000, layMs: 5000, puffIntervalMs,
  expandMs [DRAFT]}` — a NEW block; the existing `CONFIG.smoke` is WOUNDED smoke and is untouched).
  `smokeScreen.activate` stamps `ship.smokeUntil`; a new `STEP_ORDER` row **`stepSmoke`** (after
  `sampleWakes`, before `applyStorm`) drops a puff at the stern every interval while laying and
  expires dead puffs.
- **The predicate** — `sightClear(a, b, islands, puffs, now)` in `signals.ts` = `losClear(a, b,
  islands) && !puffs.some(p => segCircleHit(a, b, p, puffRadius(p, now)))`, the shared LOS
  primitive, mandatory. The SIX call sites of the five sight-tier sensors switch to it: `shipSees`
  (the contact row), `pointSighted`, `pointDetected`, the `mz` halo, the `sm` halo, the foghorn's
  one-step muffle. `blipGate` and `buoyGate` are untouched by construction — they never called
  `losClear`. `ownZoneCovers` (a star-shell's firer-only truesight) has no island term today and
  gains no smoke term: a lit zone ignores smoke exactly as it ignores islands — pinned, ledgered.
- **Symmetry is the feature:** the segment test hides a target inside a puff, hides everything
  behind it, and blinds an observer standing in one (every segment from inside starts inside the
  circle). The GDD's `[DRAFT]` "hides its own occupant" is therefore not a rule but a consequence.
- **Wire:** `SmokeView { id, x, y, t0 }` — no radius on the wire; the client runs the shared
  `puffRadius`. A new `smoke` pseudo-row in the signal registry: visible iff the CENTRE is within
  `sight + puffRadius` with ISLAND-ONLY LOS (a puff must stay visible from inside another puff or
  it would vanish around you) OR `ownerId === me` (the mine's `own` posture). `FrameMsg.smoke?`.
  Bots receive it through `observe()` and lose smoked contacts exactly as a client does.
- **Cost bound:** live puffs ≤ (stacks in play) × `layMs / puffIntervalMs`; the LOS cost is one
  `segCircleHit` per (observer, subject, puff). A perf pin runs perception at 20 observers × 200
  puffs against the 50 ms tick.

### D25 — Ordnance collision: one target collector (detail)

```ts
// server/src/game/world.ts
export type TargetKind = 'hull' | 'mine' | 'decoy' | 'ordnance';
export interface Target { readonly id: string; readonly kind: TargetKind; readonly poly: readonly Vec[] }   // shell.ts's HullTarget, widened
hitTargets(mask: readonly TargetKind[]): readonly Target[]     // memoized per tick per mask; hulls = aliveHulls(), decoys = 12u squares, mines + ordnance = small polys
```

- **Every ordnance row declares its mask in CONFIG** (`hits: TargetKind[]`): deck gun, machine
  gun, monitor → `hull | mine | decoy`; FLAK → `hull | mine | decoy | ordnance` (its whole point);
  HORIZONTAL MISSILE → `hull | decoy` (islands stop it through terrain already, R42); all three
  torpedoes and the captive's fish → `hull | decoy`. `stepShell`'s signature does not change; what
  changes is what the caller passes. `burstVictims` widens to the same kinds, so a burst detonates
  mines and a flak burst kills fish in its radius.
- **Outcomes by kind:** `mine` → `detonateMine(mine)` at its own position with its own blast,
  **perception-blind** (Eric: *"you can see"* is descriptive); chains resolve in the same tick
  with a visited set, bounded by the mine count. `decoy` → a shell damages it (D29); a torpedo or
  missile DETONATES on it — the physical block, homing or not. `ordnance` → the struck fish or
  missile is removed; it emits no boom of its own (ledgered as a presentation gap).
- **Ownership:** owner immunity stays for HULLS only. Own mines ARE hit by own shells (the
  design's clear-your-own-field reading). The owner's fish against the owner's decoy, and own flak
  against own torpedoes, are NOT exempt — the GDD's `[DRAFT]` reading, carried as-is; both are one
  mask entry to change.
- **Homing retarget:** the seeker's acquire set is `hitTargets(['hull','decoy'])` minus the owner's
  hull; `lead.ts` is untouched. The monitor's plunging shell (R30) is `stepShell` with an
  `arcing` flag that skips terrain (as the cannon did) and resolves shell-radius-vs-target at the
  click; the missile's en-route direct hit uses `CONFIG.missile.contactDamage` (a build-time
  DRAFT the catalog names; the gun's 6-dmg rule is the precedent).

### D26 — The held-fire stream (detail)

- `InputMsg.held: boolean` — REQUIRED; a non-boolean drops the whole message (the existing
  whole-message law). It is a LEVEL: it rides `InputStore.latest`, costs no intent-queue slots and
  is not rate-capped beyond the message cap.
- `fireControl`, after the click pass: if `input.held ∧ EQUIPMENT[primed].stream ∧ inArc(aim) ∧
  n > 0`, an accumulator `ship.streamAcc += dt` fires one shell per `CONFIG.machineGun.rateMs`,
  spawned at `now` with **no `fireT` and no D1 back-date** (a stream is not a click). Release,
  arc exit or an empty pool stops it; arc exit emits ONE `out-of-arc` denial at the transition,
  then silence (GDD note 21's "cursor leaves the arc" case, answered here). `held` with a
  non-stream slot primed is ignored, pinned.
- **Ammo model is unchanged:** `ammo.ts` refills round-by-round with overshoot carry, so a
  24-round pool on a 15 s reload refills one round per 0.625 s. Catalog v3's *"6 s of fire per
  pool, 15 s reload"* reads as a MAGAZINE reload; both readings are `[DRAFT]` numbers, so the
  architecture reserves ONE optional switch — `ammo.refill: 'round' | 'magazine'` per equipment
  row, default `round` — and the build takes it only if the DRAFT numbers demand it. Ledgered.
- Client: `mouse.ts` sets `held` = pointer down inside the primed stream's arc; `ownFire.ts`'s
  click latch is untouched; no prediction (fire is server-resolved).

### D27 — Signals for the new lines (detail)

- **Wire kinds** (`BallisticEvent.k`): `shell` (the gun family — deck gun, machine gun, monitor,
  flak: *in the air*, sight-gated), `torp` (all three torpedoes — one kind; speed is the velocity
  already on the reveal; detect-gated as today, wake paints as today), **`missile`** (new: a flat
  flyer, sight-gated like a shell because it flies) with **`missileU`** (its homing update row,
  the `torpU` shape at the sight rung). The reveal gains ONE field, `w` — the weapon FAMILY needed
  to draw it (a tracer is not a shell, a plunging shell arcs) — carrying no range-derivable value
  and no identity. This is a deliberate, ledgered DISCLOSURE WIDENING: a sighted shell now says
  which weapon fired it, where today it said only shell-or-torpedo.
- **Gun-shell rules everywhere (Eric):** `sp` (own splash) for the gun family AND the missile and
  monitor (never torpedoes); `hc` exactly one per shell resolution — per machine-gun shell, per
  flak shell, per missile, per monitor shell — the broadside's per-shell reading generalized;
  `mz` per shell for every gun-family weapon and the missile, **including the STREAM (Eric)** —
  the broadside's `perShellFlash` opt-out becomes the rule for `stream` equipment, while the
  multi-barrel deck gun's one-click salvo still collapses to one flash (amendments 19/20 intact).
  Cost ledgered: 20 bots streaming at 4 Hz is 80 `mz`/s at the emitter; `flashBudget.ts` caps the
  RENDER, and a measurement is owed before the number is trusted.
- **CHAFF** is a `FakeSource { x, y, radius, count, until, seed }` on the ship — the jamming buoy's
  `scatterJamFakes` generalized to a source that is not a buoy; fakes are emitted through the
  observer's own `blipGate` and `blipShape` exactly as today, owner-exempt, epoch-rescattered per
  sweep. The perception tests' fourth `verifyBlip` arm recomputes them from `(seed, epoch,
  source)`. **The carve-out gains a second SOURCE, not a new clause; the six declared exceptions
  stay six.**
- **DECOY, SMOKE, SHIELD:** the decoy and the smoke puff are frame CHANNELS (`decoys`, `smoke`),
  not events; the shield is `OwnShip.shield?` and emits nothing — a shooter's `hc` fires on the
  hit and `dmg` (victim-private) reads 0, so the shooter gets no tell. Ledgered as a design
  question; the default is the quieter one.

### D28 — The damage gate (detail)

```ts
// server/src/game/world.ts — the ONE writer of ship.hp for damage. Verified at HEAD: three writers exist today
// (applyStorm:2780, hitShip:3369, burnShip:3738); each becomes a caller.
export type DamageSource = 'shell' | 'burst' | 'torpedo' | 'missile' | 'mine' | 'burn' | 'storm' | 'contact';
private applyDamage(victim: ShipRecord, amount: number, src: DamageSource, byId: string | null): number {
  const dealt = this.absorbShield(victim, amount, this.now);   // Eric: every source, storm and burn included
  victim.hp -= dealt;  this.tallyAssist(victim, byId, dealt);  this.checkSink(victim, byId, src);  this.queueDmg(victim, dealt);
  return dealt;
}
```

- Order inside the gate is fixed: shield → hp → assist ledger → sink check → `dmg`. Hit Calls and
  booms are emitted by the CALLER on the hit, so a fully-absorbed hit still calls (D27).
- `ship.shield = { hpLeft, until }`; expires at `until` or `hpLeft === 0`; a second shield while one
  is up REPLACES it with a fresh 100 / 10 s — no stacking, `[DRAFT]`, ledgered. `OwnShip.shield?`.
- Non-hull entities keep their own single writer each (`damageDecoy`); the law is ONE writer per
  entity kind. Repairs (`payRepair`) are the hp-INCREASE path and stay separate.

### D29 — Mines without caps, and the decoy (detail)

- **Deleted (Eric: no ceiling):** `CONFIG.mine.maxLive` and its stat path, `CONFIG.mine.globalCap`,
  both eviction branches in `addMine`, and the `maxLive` parameter itself. A mine exists until
  triggered or destroyed, absolutely. The reachable bound is pools × reloads: 20 hulls × (6 naval
  + 3 captive) per reload window; a perf pin runs `checkMineTriggers` and D25's collector at 500
  live mines against the tick, and the harness reports the live-mine peak per match.
- **Decoy store** replaces the buoy store: `DecoyState { id, ownerId, x, y, hp }`, dropped by
  `dropDecoy` into the mine's rear arc, no lifetime. `DecoyView { id, x, y, own, hp? }` — `hp`
  present ONLY when `own` (Eric); `materialize()` strips it for every other observer, the
  `sunk.seen` per-observer idiom. Whether a decoy PAINTS on radar is unruled: the default is that
  it does, through the buoy's existing footprint path, ledgered.
- The radar buoy — equipment, `BuoyView`, `buoyGate`, the `gun`/`jamming` doctrines,
  `ownBuoyScopeBlips` and the `src` blip tag — is deleted; `scatterJamFakes` survives as CHAFF's
  generator (D27).

### D30 — The Shift boost (detail)

- Slot 1, permanent, the `boost` equipment row (`isWeapon: false`, the `actSeq` channel, `Shift`
  → `actSlot: 1`); `boostUntil` is still its only writer. `boostedKinematics(kin, bonus, active)`
  is unchanged; `bonus = CONFIG.boost.factor (0.25 [DRAFT]) × kin.maxSpeed` computed from the
  POST-FOLD kinematics, so the SPEED ladder is inside it (Eric: ladder-raised max — a capped
  Torpedo Boat boosts to 68.75 u/s). `boost.reloadMs` (20 s [DRAFT]) is an equipment reload and
  takes `cooldownScale` through the one multiply (R40: 15 s under a maxed RELOAD).
- **Consequence for the bots' trap:** the boost is still applied outside `EffectiveStats`, so the
  ring-deadband's `max(rated, actual)` reading stays correct and gains nothing to re-derive.
- **GDD note 19 is NOT resolved here:** the LIGHT TORPEDO at 45 u/s against a 68.75 u/s boosted
  hull breaks *"torpedoes outrun every hull at base speed"* as written; the pin that enforces it
  must be re-scoped by Eric (bow-launched fish only, or the number moves). Ledgered for
  deferred-work.md; nothing in this pass guarantees it.

### D31 — Bot decks and consumable tactics (detail)

- `server/src/game/ai/decks.ts`: `BOT_DECKS: Readonly<Record<BotProfileId, readonly LineId[]>>` —
  40 authored cards each in the player format, validated by `checkDeck` in a BOOT-TIME test (the
  suite fails, never a room). A bot is seated through the same `addShip(deck)` path as a human and
  receives the room's pool.
- `server/src/game/ai/consumables.ts`: `CONSUMABLE_TACTICS: Readonly<Record<ConsumableId,
  ConsumableTactic>>` — TOTAL, deep-frozen, `{ want(ctx), solve?(ctx) }` (only the decoy solves a
  placement). `EQUIPMENT_TACTICS` stays total over the WIDENED `EquipmentId`, so the six new
  weapons cannot compile without a row.
- `spending.ts`: `HEAL_CHOICE` is gone; healing is `hullRepair`'s tactic on a stocked slot; the
  pick scorer weights LINE ids including consumables; `canStock` is consulted so a bot never picks
  a card it cannot hold; the mulligan policy defaults to never.
- Harness: `--deck authored | random-legal` (legal against every cap, pool rolled per match from
  the room stream); the bars E8 story 8 names are pinned there, not here.

### What did NOT move

- The master perception invariant keeps SIX declared exceptions; `frames.ts` stays the single
  spatial chokepoint; nothing spatial leaves the server outside a registry row.
- `effectiveStats()` is still the only path from (class + cards) to a derived number — widened
  to a total per-equipment record, never bypassed. `HOOK_REGISTRY` stays EMPTY.
- The `Tab` offer never rerolls, save the one asserted mulligan; the D1 fire-time back-date holds
  for every CLICK; the eighths ladder, the storm, the account store (D9–D18) and Story 7-7's
  deferral are untouched.
- `PROTOCOL_VERSION` bumps once per wire-changing E8 story (catalog content, `InputMsg.held`, the
  9-slot ammo array, `OwnShip.{deckLeft, draft, shield}`, the `missile`/`missileU`/`smoke`/
  `decoys` rows, the reveal's `w`) — never for the harness or the bots.

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
  strips them from prod); server dev behavior only under `HC_DEV_OPTIONS=1`. **Nothing debug
  ships in the production build** (RESTATED 2026-08-21, Story 7.6 — was "the portal build";
  the law is unchanged, only the name of the artifact it governs. Cf. NFR17).
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
- **Reference device pinned (UPDATED 2026-08-18):** **Eric's Intel i7 MacBook** is the
  reference device. The Chromebook target is retired — no low-end device will be acquired, and
  the MacBook's performance is accepted as the bar. Chrome at 4× CPU throttle is retained as a
  cheap stress check, never as the gate. Every epic measures against the same reference.
- Each epic's definition of done includes the budget check; E6 effects are costed against
  the render budget as they land, not audited after.

### Ad / Lifecycle Adapter Seam (was: Portal SDK Seam)

> **RETARGETED 2026-08-18 (AR11).** The concrete implementation is **Google AdSense H5 Games
> Ads** (Ad Placement API), **not Poki/CrazyGames**. `adBreak({type, beforeAd, afterAd,
> adBreakDone})` fits `requestAdBreak(): Promise<void>` exactly, and the seam's never-throw /
> always-settle contract is precisely what an ad-blocked or script-failed integration needs.
> **The interface name `PortalAdapter` is retained deliberately** — renaming ratified code to
> match a changed destination is churn, and `safeAdapter.ts`'s guarantees are the valuable part.
> Placement: interstitial at death→return-to-port; display units on home/port and How-to-Play
> only, ≥150 px clear of the canvas; no ad surface during a live match.

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

- Game code never imports an ad SDK directly; the next code that touches loading or the
  death→requeue flow goes through the seam. The **AdSense H5 Games Ads** implementation lands
  at Story 7.4 behind the same interface. A seam installed late is a seam installed never —
  and this one survived a full change of destination untouched, which is the return on
  installing it at Epic 0.

---

### Cross-cutting Concerns — Account Store amendment (2026-09-09)

The three-zone error strategy, stdout-only logging, the no-event-bus law and the activation
law above all STAND. The account store adds a FOURTH zone and extends each pattern; nothing
below relaxes an existing rule.

#### Error Handling — the fourth zone: the account layer never takes the game down

- **Boot:** `DATABASE_URL` unset → the module is inert (D9). `DATABASE_URL` set but the
  database unreachable or a migration failing → the process STILL STARTS with the account
  module OFF, logs `account.disabled { reason }` once, and `/liveness` reports
  `account: false`. The game must never depend on the database being up — and neither
  service has a `healthCheckPath` today (deferred-work.md), so a refused boot would be an
  outage, not a held deploy.
- **Doors:** a signed-in captain whose deck cannot be loaded (query failure, deck missing,
  illegal) is REFUSED with a stable code — `account.unavailable`, `deck.missing`,
  `deck.illegal { rule }` — never silently seated on the starter deck (D18). The client shows
  the reason and offers SAIL STARTER DECK as an explicit act. Anonymous joins are untouched by
  any account failure.
- **HTTP endpoints:** Result-shaped JSON — `{ ok: true, … }` or `{ ok: false, code, reason }` —
  with the same stable codes; HTTP status carries only the class (200/400/401/404/409/503).
  No stack traces, no driver messages, no SQL leave the process.
- **Tick law extended:** nothing inside `Room.update()` / `World.step()` may `await` the
  database — a query on the tick is a bug in the same class as a throw in `shared/`. The
  writer is the ONLY runtime path from a room to the store, and it is a queue.

```ts
// door (StandardQueueRoom.onJoin / ArenaRoom.onJoin — same helper, both doors)
const deck = await loadDeckFor(auth.userId, options.deckId, cls);   // Result<LineId[], DoorError>
if (!deck.ok) throw new ServerError(4001, deck.code);               // 'deck.illegal' etc. — never fall back
```

#### Logging — new events, and the FIRST PII rule the log has needed

- New dot.case events: `account.signin { provider, userId }`, `account.link { userId }`,
  `account.signout { userId }`, `account.delete { userId }`, `deck.rejected { userId, code }`,
  `account.write.ok { matchId, rows }`, `account.write.failed { matchId, err }`,
  `account.disabled { reason }`.
- **Never logged:** tokens, provider subject ids, callsigns (a callsign is stored personal data
  from D17 onward), deck contents. `userId` — the opaque server-minted id — is the only
  identity a log line may carry. `match.end` stays byte-identical: zero PII, still true.
- The hot-path law holds: the writer logs one line per match, never per row.

#### Configuration — one new env table, two new CONFIG blocks, nothing client-side

| Env var | Host | Secret | Purpose |
|---|---|---|---|
| `DATABASE_URL` | both, via `fromDatabase` | yes | Postgres connection; absent = module inert |
| `JWT_SECRET`, `SESSION_SECRET` | both, `sync: false` | yes | token signing; OAuth state cookie |
| `HC_OAUTH_GOOGLE_ID` / `_SECRET`, `HC_OAUTH_DISCORD_ID` / `_SECRET` | both, `sync: false`, one app per host | yes | provider clients (redirect URIs differ per host) |
| `HC_SITE_ORIGIN` | both, in the clear | no | postMessage target for the replaced callback |

- **No secret is ever a `VITE_` var** — `client/.env.*` is not gitignored. The client learns
  "accounts exist" from `/liveness` (`account: true`), not from build-time config.
- Shared `CONFIG` gains `deck` (`size: 40`, `maxEquipmentLines: 3`) and `progression`
  (placement XP curve, `soloXpFactor`, `matchesToCatalog` — the OPEN intent dial, no
  placeholder, and the flat unlock `tokenPrice [DRAFT]`). Both are gameplay-load-bearing, so
  they live in `shared/`, ride `WelcomeMsg.config`, and bump `PROTOCOL_VERSION` only when the
  client READS them (the `CONFIG.fleet` precedent).
- The catalog's line ids and caps (D14) are configuration-adjacent code in `shared/`,
  exactly like the boon catalog.

#### Events — still no bus; the writer is a port with a queue, not a dispatcher

- Server-internal: the room calls `accountWriter.recordMatch(record)` directly at ONE site (the
  results hook). The writer holds an in-process FIFO, retries once, drains on shutdown. It
  is a PORT (an interface the room is handed), not a pub/sub — no other subscriber may ever
  exist, so the "no event bus" law is not bent.
- Client-internal: one `account` slice in `state.ts` (`{ status: 'anonymous' | 'signedIn',
  userId?, profile?, decks?, progress? }`), written ONLY by `net/account.ts` from HTTP
  responses, read by `ui/`. One-way data flow stands; the deck editor is DOM chrome and never
  touches the sim.
- Wire: the account API is HTTP JSON and is NOT part of `PROTOCOL_VERSION`; its own contract
  is the endpoint path set, pinned by test.

#### Observability

- `/metrics` gains `account: { signIns, writeOk, writeFailed, queueDepth, deckRejected }`.
- `/liveness` gains `account: boolean` (module live) — the client's only signal to render
  SIGN IN.
- `@colyseus/admin` (D16) is the read surface for history; it is an ops console, not a metric.

#### Debug & Development Tools

- **Local dev needs no Postgres:** `@colyseus/database` supports the `pglite` dialect
  (in-process Postgres). `HC_DEV_DB=pglite` runs the real schema and migrations in memory;
  the server tests use the same dialect, so every account path is exercised by `npm run check`
  against the real SQL. PGlite is dev/test only — production takes `DATABASE_URL` or nothing.
- **The one sanctioned deck override:** under `HC_DEV_OPTIONS=1` ONLY, a door accepts a
  `deckOverride` room option (line ids) for headless smokes and the batch-sim harness — gated
  in `sanitizeRoomOptions` exactly like `matchOverride`, rejected everywhere else. This is the
  sole exception to D18's "a client never supplies a deck".
- Dev-only OAuth: a `HC_DEV_OPTIONS`-gated `devSignIn` endpoint mints a token for a named
  local user so the deck editor can be driven without provider apps. Never mounted in
  production — same activation law as every other dev tool.
- Rate limiting: sign-in start and deck writes share `soloThrottle.ts`'s per-IP shape
  (epic-7 amendment 45), env-tunable, in-memory — single instance, so no Redis.

---

### Cross-cutting Concerns — The Deck amendment (2026-09-10)

The three-zone error strategy, the account layer's fourth zone, stdout-only logging, the
no-event-bus law and the activation law all STAND. The deck adds no zone; it adds rows to the
tick table, blocks to `CONFIG`, and self-private fields to the wire.

#### Error Handling — refusals are silent no-ops, malformed input is a whole-message drop

- **Spend path (D21, D22):** a pick the ship cannot stock, a mulligan outside its window or a
  second mulligan, and a spend of a card at its cap are all SILENT NO-OPS on the server — the
  offer is left byte-identical and the client, running the same shared predicates (`canStock`,
  `MULLIGAN_CHOICE` gating), never presents the action. No new `denied` reason is added for any of
  them; the `denied` view stays the ACTIVATION channel's feedback.
- **Input (D26):** `held` joins the finite-checked field set; a message with a non-boolean `held`
  is dropped whole, exactly like a non-finite `aim`. Nothing is ever partially applied.
- **Doors (E9 Pattern 6, unchanged):** an illegal deck is refused at the door with its stable
  code; the pool is appended only to a deck that passed, so a pool can never make a deck legal or
  illegal.
- **Tick law extended by two rows:** `stepSmoke` (D24) and the draft read inside `stepShips`
  (D23) are pure over world state; neither may allocate per observer. `applyDamage` (D28) is not a
  row — it is a function every damage row calls.

#### Logging — two new events, the PII rule unchanged

- `match.pool { matchId, count }` once per room at roll (count only, NEVER contents — the pool is
  hidden by ruling and its contents reach only `MatchRecord.pool`); `deck.exhausted { matchId,
  shipId }` once per ship the first time a draw returns nothing.
- `match.end` stays byte-identical. The E9 rule stands: no callsigns, no deck contents, no tokens.

#### Configuration — the catalog moves, seven equipment blocks are born, four die

- **`shared/src/sim/catalog.ts` is the catalog** (D14 + D19): 29 lines, tiers, caps, `appliesTo`,
  the three starters, `FLEET_FIT`. `BOON_CATALOG` in `boons.ts` is deleted. Catalog content is
  wire contract; every content change bumps `PROTOCOL_VERSION` (unchanged rule).
- **New `CONFIG` blocks, all gameplay-load-bearing, all in `shared/`:** `lightTorpedo`,
  `heavyTorpedo`, `supercavTorpedo` (three ids over one torpedo shape), `machineGun` (with
  `rateMs`, `stream: true`), `flak`, `monitor` (`arcing: true`), `missile` (with
  `contactDamage`), `captiveMines`, `smokeScreen`, `shield`, `chaff`, `decoy`, `pool` (`size:
  10`), `wake.draft` (`lift`, `halfWidthU` — `[DRAFT]`, no placeholder), `catalog`
  (`reloadStepPerTier: 0.05`), and every ordnance row's `hits` mask (D25). `boost` gains `factor`
  and loses its card-fitted identity.
- **Deleted:** `CONFIG.radarBuoy`, `CONFIG.speedBoost` (as equipment), `CONFIG.mine.maxLive`,
  `CONFIG.mine.globalCap`, `CONFIG.deck.rareWeightBase` / `rareWeightPerDryLevel`, `HEAL_CHOICE`.
  `CONFIG.damageControl` splits: the paid heal's two numbers move to `hullRepair`; the FREE
  per-level auto-heal's fields (`levelMissingPct`, `levelRegenMs`) STAY under `damageControl`
  because GDD note 14 leaves that mechanism unruled until the balance pass — nothing here deletes
  it.
- Every `[DRAFT]` in catalog v3 is a `CONFIG` dial the harness tunes; none is invented here and
  none is given a value this document did not read from the catalog.

#### Events — still no bus; two frame channels replace one

- `FrameMsg.buoys` is DELETED with the radar buoy; `FrameMsg.decoys?` and `FrameMsg.smoke?` are
  added, each a pseudo-row of the signal registry with its own `visible()` / `materialize()`.
  `OwnShip` gains `deckLeft`, `draft?`, `shield?`; `boons` is renamed `cards`. `InputMsg` gains
  `held`. `SpendMsg` gains the `MULLIGAN_CHOICE` sentinel and loses `HEAL_CHOICE`.
- Client one-way flow stands: `net/` mirrors the new fields into `state.ts`, `sim/prediction.ts`
  reads `draft`, `render/` reads the two channels and the 9-slot ammo array. No render module
  drives net or sim.

#### Observability

- `/metrics` gains `deck: { picks, mulligans, stockRefused, exhausted }`, `world: { minesLivePeak,
  smokeLivePeak, streamShellsPerTick }` — the three numbers the perf pins in D24/D26/D29 are
  written against.

#### Debug & Development Tools

- `deckOverride` (E9, `HC_DEV_OPTIONS` only) is the harness's and the smokes' deck input; it gains
  a sibling **`poolOverride`** (line ids) under the same gate so a headless smoke can assert a
  deterministic pool, and `matchOverride` learns a `mulligan` beat so the countdown path is
  smoke-testable. Never mounted in production — the existing activation law.
- The batch-sim harness's `--deck authored | random-legal` arms (D31) replace `--bots N`'s implicit
  fixed fit; the `pacifist` storm control keeps its gun-only posture as a deck of zero equipment
  lines, which is LEGAL by design (GDD: a gunboat deck is legal).

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
│   ├── portal/                   # Ad/lifecycle seam — PortalAdapter interface (name retained
│   │                             #   per AR11) + nullAdapter.ts + safeAdapter.ts. SHIPPED.
│   │                             #   No pokiAdapter/crazyAdapter will ever land (7.6, 2026-08-21).
│   ├── ads/                      # AdSense H5 Games Ads impl behind that seam (Story 7.4):
│   │                             #   adsAdapter.ts, adsense.ts, adsHead.ts, resultsAd.ts
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
| Ad / lifecycle seam (Step 5) | `client/src/portal/` (interface + null + safe wrapper); `client/src/ads/` (AdSense impl) | Game code never imports an ad SDK directly. Directory and interface keep the `portal` name per AR11 — a retained name, not a promised portal integration |
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
8. Debug/dev code → `client/src/debug/` or behind `HC_DEV_OPTIONS` — never in production builds.
   *(RESTATED 2026-08-21, Story 7.6 — was "never in portal builds".)*

---

### Project Structure — Account Store amendment (2026-09-09)

The organization pattern (layer-first, domain-organized within each layer) and the one law
(`shared` imports from neither side) STAND. The store adds one server domain, one client
domain, two shared modules, and a migrations folder — no new workspace and no new deployable.

#### New homes

```
salvo/
├── render.yaml                   # + databases: hullcracker-db / hullcracker-dev-db (D11), lands WITH the code
├── shared/src/
│   ├── constants.ts              # + CONFIG.deck, CONFIG.progression (Step 5)
│   └── sim/
│       ├── catalog.ts            # NEW — LINE_IDS (29 camelCase ids) + per-line caps + starter decks (D14)
│       ├── deckRules.ts          # NEW — legal-deck check: exactly 40, ≤3 equipment lines, caps, ownership (pure)
│       └── progression.ts        # NEW — xp per placement, solo discount, level(xp), tokensAvailable (pure)
├── server/
│   ├── drizzle/                  # NEW — drizzle-kit SQL migrations, checked in, run at boot (D12)
│   └── src/
│       ├── app.config.ts         # + ONE spread of accountEndpoints() into the existing createRouter call;
│       │                         #   + admin mount (D16); + writer handed to both rooms; + shutdown drain
│       ├── liveness.ts           # + account: boolean
│       ├── metrics.ts            # + account counters
│       ├── account/              # NEW — the whole store; imports nothing from game/
│       │   ├── index.ts          #   accountEndpoints(), createAccountWriter(), isAccountEnabled() — the ONLY exports
│       │   ├── db.ts             #   GameDatabase construction (pg | pglite dev/test); refuses without DATABASE_URL
│       │   ├── schema.ts         #   Drizzle tables: account_identities, account_profiles, decks, unlocks,
│       │   │                     #   account_progress, matches, match_participants (D12)
│       │   ├── auth.ts           #   curated @colyseus/auth endpoint map; onOAuthProviderCallback (identity upsert + link)
│       │   ├── oauthCallback.ts  #   the REPLACED popup callback — postMessage to HC_SITE_ORIGIN (D13)
│       │   ├── session.ts        #   verifyToken(headers) → { userId } | null — what both rooms' static onAuth call
│       │   ├── decks.ts          #   loadDeckFor(userId, deckId, hull) — the door helper (D18); deck CRUD for the editor
│       │   ├── progress.ts       #   unlock(lineId), atomic xp increment, derived level/tokens
│       │   ├── history.ts        #   the player's own history query (cursor-paged)
│       │   ├── writer.ts         #   AccountWriter: FIFO, recordMatch(MatchRecord), flush() (D18)
│       │   ├── deletion.ts       #   the one-transaction delete (D15)
│       │   ├── endpoints.ts      #   better-call endpoints: /api/account/{me,profile,decks,unlock,history,delete}
│       │   ├── throttle.ts       #   per-IP limits, soloThrottle's shape
│       │   └── devSignIn.ts      #   HC_DEV_OPTIONS-only token mint
│       ├── rooms/
│       │   ├── roomOptions.ts    # + deckId sanitizer; REJECTS `deck`; deckOverride under HC_DEV_OPTIONS only
│       │   ├── StandardQueueRoom.ts  # + verifyToken in static onAuth; + loadDeckFor in onJoin
│       │   └── ArenaRoom.ts      # + verifyToken in static onAuth; + loadDeckFor for solo; + MatchRecord → writer
│       └── game/
│           └── matchRecord.ts    # NEW — MatchRecord type + builder from World + Match (server-only, never wire)
└── client/src/
    ├── state.ts                  # + account slice (leaf stays a leaf)
    ├── net/account.ts            # NEW — the ONLY writer of the account slice: sign-in (client.auth), /api/account/* calls
    ├── settings/store.ts         # + account-backed source when signed in (D17); localStorage otherwise
    └── ui/
        ├── signIn.ts             # NEW — SIGN IN row on the home screen (DOM chrome), rendered only when liveness says account:true
        ├── deckEditor.ts         # NEW — the deckbuilder (DOM chrome); legality feedback via shared deckRules
        ├── history.ts            # NEW — own match history (DOM chrome)
        └── settings.ts           # + DELETE ACCOUNT control
```

#### System → Location Mapping (additions)

| System (decision) | Home | Boundary note |
|---|---|---|
| Catalog ids + caps + starters (D14) | `shared/src/sim/catalog.ts` | Data; the deck rules and the store address cards by these ids only |
| Deck legality (D18) | `shared/src/sim/deckRules.ts` | Pure; server runs it at the door, client runs it in the editor for feedback — one function, never two |
| Progression math (D18) | `shared/src/sim/progression.ts` | Pure; the writer folds its result into one atomic update |
| The store (D9–D13, D15) | `server/src/account/` | Imports `shared/` and Colyseus; NEVER `game/`. `game/` never imports it |
| Token verification (D13) | `account/session.ts` ← both rooms' `static onAuth` | Runs AFTER the PV and staging gates; `null` = anonymous, never an error |
| Deck at the door (D18) | `account/decks.ts` ← `StandardQueueRoom.onJoin` + `ArenaRoom.onJoin` (solo) | The one helper, both doors; a client `deck` key is rejected in `roomOptions.ts` |
| Match record (D18) | `game/matchRecord.ts` → `account/writer.ts` | Server-only type; a pin test proves `ResultsMsg` has no deck field |
| Admin console (D16) | `app.config.ts` mount | Behind its own login; behind the staging gate on dev |
| Account API (D16) | `account/endpoints.ts` spread into the ONE `createRouter` call | HTTP JSON, not `PROTOCOL_VERSION` |
| Client account state (Step 5) | `client/src/state.ts` + `net/account.ts` | One-way: net → state → ui; the sim never reads it |
| Deck editor / history / sign-in (E9) | `client/src/ui/` | DOM chrome only; nothing tactical |

#### Naming Conventions (additions)

| Element | Convention | Example |
|---|---|---|
| Database tables / columns | snake_case, plural tables, `account_` prefix on account-owned tables | `account_profiles.color_pref`, `match_participants` |
| Migration files | drizzle-kit's `NNNN_<slug>.sql`, committed | `server/drizzle/0001_account_store.sql` |
| Line ids | camelCase, one per catalog line, matching boon-id style | `'heavyTorpedo'`, `'hullRepair'` |
| HTTP paths | `/api/account/<noun>`; auth stays at the module's `/auth/*` | `/api/account/history` |
| Error codes | dot.case, `<domain>.<reason>` | `deck.illegal`, `account.unavailable` |
| Env vars | `HC_` prefix for ours; the module's own names kept verbatim | `HC_SITE_ORIGIN`, `JWT_SECRET` |

#### Architectural Boundaries (two new placement rules)

9. **Persistence → `server/src/account/`, and it never reaches the sim.** `game/` imports
   nothing from `account/`; rooms touch it at exactly three sites — `static onAuth`
   (verify), `onJoin` (load deck), the results hook (record). No fourth site without an
   amendment.
10. **A deck enters a match only through `loadDeckFor`.** Never from a client option, never
    from schema, never from `WelcomeMsg`. The single dev exception is `deckOverride`, gated
    like `matchOverride`.

---

### Project Structure — The Deck amendment (2026-09-10)

The organization pattern and the one law (`shared` imports from neither side) STAND. The deck
adds shared sim modules, replaces the equipment registry's membership, and adds two `ai/`
tables — no new workspace, no new deployable, nothing under `account/`.

#### New homes

```
salvo/
├── shared/src/
│   ├── index.ts                  # PROTOCOL_VERSION log entries per wire-changing E8 story
│   ├── constants.ts              # + the equipment/consumable blocks, pool, wake.draft, catalog.reloadStepPerTier, hits masks; − radarBuoy, speedBoost, mine.maxLive/globalCap, deck.rareWeight*
│   ├── types.ts                  # InputMsg.held; OwnShip.{cards, deckLeft, draft?, shield?}; ammo length 9; missile/missileU; SmokeView, DecoyView; FrameMsg.{smoke?, decoys?}; − BuoyView, HEAL_CHOICE
│   └── sim/
│       ├── catalog.ts            # THE catalog (D14 + D19): CatalogLine, CATALOG, starters, FLEET_FIT, the weapon()/ladder()/addon()/consumable() authoring helpers
│       ├── boons.ts              # the ENGINE only: effect kinds (+ stock, − slotReplace), applyBoonStats, applySlotEffect, canStock, validateCatalog (add/mult exclusivity)
│       ├── stats.ts              # EffectiveStats.equipment: total per-EquipmentId record with tier; clampStats: reload step, floor-once, cooldownScale, rangeU re-pins
│       ├── loadout.ts            # 9 roles: SLOT_ROLES, WEAPON_SLOTS, CONSUMABLE_SLOTS; loadoutFor() identical for every hull; − specialsFor
│       ├── deck.ts               # DeckState multiset; drawOffer(equal weight, guarantee opt); consumeCard; − levelsSinceRare, buildDeck's subdecks, consumeAcquisition
│       ├── pool.ts               # NEW — rollMatchPool(rng, catalog, cfg): 10 consumables, caps within the pool (D22)
│       ├── offers.ts             # BoonOffer + MULLIGAN_CHOICE (D22)
│       ├── deckRules.ts          # (E9) checkDeck — unchanged contract, now consulted by drawOffer's cap rule too
│       ├── draft.ts              # NEW — draftedKinematics(kin, lift, active): the third per-tick step (D23)
│       ├── wake.ts               # + draftLift(ribbons, x, y, now, cfg) (D23)
│       ├── smoke.ts              # NEW — SmokePuff type, puffRadius(puff, now) (D24)
│       ├── shell.ts              # Target { id, kind, poly } replaces HullTarget; arcing flag; ordnance/mine/decoy outcomes (D25)
│       ├── arcs.ts               # + the six new arcs (light twin-sector, heavy/supercav/monitor/missile/machine-gun bow sectors); decoy = the mine's rear sector
│       ├── aim.ts                # + missile burst point, monitor landing point, machine-gun range clamp
│       ├── boost.ts / slow.ts    # unchanged; the fold order is pinned with draft.ts in one test
│       └── hooks.ts              # unchanged and STILL EMPTY
├── server/src/
│   ├── game/
│   │   ├── world.ts              # applyDamage (D28); hitTargets (D25); stepSmoke row (D24); draft in stepShips (D23); stream fire in fireControl (D26); pool at addShip, mulligan in spendPoint, level zero at countdown (D22); − maxLive/globalCap plumbing, − buoys store, + decoys store, + smoke store
│   │   ├── inputs.ts             # + held (boolean, whole-message drop)
│   │   ├── signals.ts            # sightClear (D24) at the six sight call sites; + missile, missileU, smoke, decoy rows; − buoy row, buoyGate, ownBuoyScopeBlips; sp/hc/mz clauses widened by ordnance kind; FakeSource fakes (D27)
│   │   ├── perception.ts         # PerceptionView.{smoke, decoys} replace buoys; the fourth verifyBlip arm recomputes CHAFF fakes
│   │   ├── matchRecord.ts        # (E9) + pool: LineId[] on the match row; participants' brought/drawn/taken unchanged
│   │   ├── match.ts              # countdown-entry hook → grantPoint for every captain (D22)
│   │   ├── fakes.ts              # NEW — scatterFakes(seed, epoch, cx, cy, radius, count): radarBuoy.ts's generator, generalized for CHAFF (D27)
│   │   ├── equipment/
│   │   │   ├── index.ts          # Equipment interface UNCHANGED; registry membership: gun, boost, lightTorpedo, heavyTorpedo, supercavTorpedo, navalMines, captiveMines, missile, machineGun, flak, monitor, broadside, starShells, hullRepair, shieldBlock, smokeScreen, chaff, decoyBuoy — TOTAL over EquipmentId
│   │   │   ├── ammo.ts           # unchanged; the optional refill:'magazine' switch is reserved, not built, until the DRAFT numbers demand it (D26)
│   │   │   ├── guns.ts           # the deck gun (slot 0 permanent)
│   │   │   ├── boost.ts          # the Shift boost (slot 1 permanent, D30)
│   │   │   ├── torpedoCore.ts    # NEW — the shared launch/clearance/homing body the three torpedo rows call
│   │   │   ├── lightTorpedo.ts / heavyTorpedo.ts / supercavTorpedo.ts   # NEW — three ids, one core
│   │   │   ├── mines.ts          # naval mines: − addMine caps/eviction; detonateMine(mine) for D25
│   │   │   ├── captiveMines.ts   # NEW — its own line: the swapped rings, the held fish
│   │   │   ├── missile.ts / machineGun.ts / flak.ts / monitor.ts   # NEW — each declares its hits mask, stream/arcing flags via CONFIG
│   │   │   ├── broadside.ts / starShells.ts   # unchanged bodies; tiers via stats
│   │   │   └── consumables/
│   │   │       ├── hullRepair.ts     # NEW — spendHeal's body (afloat-only)
│   │   │       ├── shieldBlock.ts    # NEW — ship.shield = { hpLeft, until }
│   │   │       ├── smokeScreen.ts    # NEW — ship.smokeUntil; puffs laid by stepSmoke
│   │   │       ├── chaff.ts          # NEW — ship.fakeSource
│   │   │       └── decoyBuoy.ts      # NEW — isWeapon, rear arc, dropDecoy
│   │   │   (radarBuoy.ts DELETED)
│   │   └── ai/
│   │       ├── decks.ts          # NEW — BOT_DECKS per profile, 40 cards, boot-test legality (D31)
│   │       ├── consumables.ts    # NEW — CONSUMABLE_TACTICS, total (D31)
│   │       ├── equipment.ts      # EQUIPMENT_TACTICS total over the widened EquipmentId (six new rows)
│   │       └── spending.ts       # line-id weights incl. consumables; canStock; − HEAL_CHOICE
│   └── scripts/                  # batch-sim: --deck authored|random-legal, per-match pool; smokes: poolOverride
└── client/src/
    ├── input/keyboard.ts         # Shift → actSlot 1; 1–4 dual role by refit-window state; − Digit5
    ├── input/mouse.ts            # held = pointer down in the primed stream's arc (D26)
    ├── sim/prediction.ts         # setDraft; tickKin folds draftedKinematics in the pinned order (D23)
    ├── net/snapshots.ts          # + missile/missileU interpolation
    ├── render/
    │   ├── projectiles.ts        # + missile, tracer, arcing shell (from the reveal's w)
    │   ├── smokeScreen.ts        # NEW — puffs from FrameMsg.smoke via shared puffRadius (render/smoke.ts stays WOUNDED smoke)
    │   ├── decoys.ts             # NEW — replaces buoys.ts; owner-only hp readout
    │   ├── hotbar.ts             # 9 slots; consumable stacks show n
    │   ├── hud.ts                # + deckLeft counter; − DAMAGE CONTROL rail
    │   └── weaponArc.ts / aimPreview.ts   # the six new arcs; monitor arc preview
    └── ui/upgradeMenu.ts         # mulligan during countdown; greyed cards via shared canStock; − key 5
```

#### System → Location Mapping (additions)

| System (decision) | Home | Boundary note |
|---|---|---|
| Catalog lines, tiers, starters (D19) | `shared/src/sim/catalog.ts` | Data + authoring helpers; the ONLY catalog; content = wire contract |
| The fold, reload step, floor-once (D19) | `shared/src/sim/stats.ts` `clampStats` | Derived post-fold; no stat path addresses either |
| Slot roles + fill/stock (D20, D21) | `shared/src/sim/loadout.ts`, `boons.ts` `applySlotEffect` / `canStock` | One function, both sides replay it |
| Pool, draw, mulligan (D22) | `shared/src/sim/pool.ts`, `deck.ts`, `offers.ts` ← `world.ts` | Pure; the rng streams are the server's; nothing rides the wire but `deckLeft` |
| Drafting (D23) | `shared/src/sim/wake.ts` `draftLift` + `sim/draft.ts` ← `world.ts stepShips`, `prediction.ts tickKin` | The fold order is one pinned array; `OwnShip.draft` self-private |
| Smoke occlusion (D24) | `shared/src/sim/smoke.ts` + `signals.ts` `sightClear` | The six sight call sites; radar never calls it |
| Target collector + masks (D25) | `world.ts` `hitTargets` + `CONFIG.<ordnance>.hits` | Ordnance never enumerates entities itself |
| Held stream (D26) | `inputs.ts` (validate) → `world.ts fireControl` | A level; no `fireT`; no D1 clamp |
| New signal rows (D27) | `signals.ts` | Every spatial thing still leaves through a row; `verifyBlip` gains CHAFF's arm |
| Damage gate (D28) | `world.ts` `applyDamage` | The ONE hull-hp damage writer; three callers at `HEAD` become four (+ decoy contact) |
| Decoys, mines uncapped (D29) | `world.ts` stores; `equipment/mines.ts`, `consumables/decoyBuoy.ts` | `DecoyView.hp` stripped for non-owners in `materialize()` |
| Boost (D30) | `equipment/boost.ts`, `shared/sim/boost.ts` | Post-fold `maxSpeed`; the RELOAD ladder scales it via `cooldownScale` |
| Bot decks + tactics (D31) | `ai/decks.ts`, `ai/consumables.ts`, `ai/equipment.ts` | Boot-test legality; total records; `ai/` still never imports `world.js` |

#### Naming Conventions (additions)

| Element | Convention | Example |
|---|---|---|
| Equipment ids | camelCase, one per catalog equipment line, = the line id | `'lightTorpedo'`, `'captiveMines'`, `'decoyBuoy'` |
| Consumable modules | `server/src/game/equipment/consumables/<id>.ts` | `consumables/shieldBlock.ts` |
| Ordnance target masks | `CONFIG.<ordnance>.hits: TargetKind[]` | `flak.hits: ['hull','mine','decoy','ordnance']` |
| Frame channels | plural noun on `FrameMsg` / `PerceptionView`, matching the registry pseudo-row | `smoke`, `decoys` (as `mines`, `litZones`) |
| Spend sentinels | `SCREAMING_CHOICE` constants in `offers.ts`, negative integers | `MULLIGAN_CHOICE = -2` |
| Tick rows | verb-first camelCase in `STEP_ORDER` | `stepSmoke` |

#### Architectural Boundaries (three new placement rules)

11. **Every catalog fact lives in `shared/src/sim/catalog.ts`.** No line, tier, cap, starter or
    family list may be declared anywhere else — not in `constants.ts`, not in a server module, not
    in client copy (display names excepted, per D14).
12. **Damage to a hull enters through `applyDamage` and nowhere else.** A `ship.hp -=` outside it
    is a defect of the same class as a spatial emit outside `frames.ts`; a lint restriction and a
    grep pin enforce it.
13. **An ordnance step never enumerates world entities.** It receives `hitTargets(mask)` from the
    world and nothing else; adding a target kind is one union member + one collector branch, never
    a per-weapon lookup.

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

> **AMENDED 2026-09-10** — the shape below predates catalog v3; the live shape (tiered lines, `stock`, no `slotReplace`, an EMPTY hook registry) is *Novel Pattern 2 (AMENDED)* in the Deck amendment further down.

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

> **AMENDED 2026-09-10** — the interface below is byte-identical today; membership (18 rows), the slot table (nine roles, two permanents) and the consumable/stream/arcing row kinds are *Novel Pattern 3 (AMENDED)* in the Deck amendment further down.

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

### Implementation Patterns — Account Store amendment (2026-09-09)

Four patterns, all novel to this codebase because nothing persisted before. Each has ONE
canonical shape; an agent that finds itself writing a second shape for the same job is
wrong.

#### Novel Pattern 6: The Door (verify, then load — both doors, one helper)

**Purpose:** a token becomes a seat and a deck at exactly one place per door, and the two
doors (queue for standard, arena for solo) cannot drift.

**Components:** `account/session.ts` (`verifyToken`), `account/decks.ts` (`loadDeckFor`),
`rooms/roomOptions.ts` (the sanitizer that ACCEPTS `deckId` and REJECTS `deck`),
`shared/sim/deckRules.ts` (the pure check).

**Data flow:** `static onAuth(token, options, ctx)` → PV gate → staging gate →
`verifyToken(ctx.headers)` → `{ userId } | null` → `onJoin(client, options)` →
`loadDeckFor(userId, options.deckId, cls)` → `Result<LineId[], DoorError>` → seat options (queue)
or the ship's deck (solo arena). The ORDER of the three gates is fixed: cheapest and most
disclosing-of-nothing first.

```ts
// rooms/StandardQueueRoom.ts and rooms/ArenaRoom.ts — identical shape, no copy-paste: both call the helpers
static async onAuth(token: string, options: JoinOptions, ctx: AuthContext) {
  const pv = protocolVersionError(options.pv);  if (pv) throw new ServerError(4000, pv);
  const gate = stagingGateError(ctx.headers);   if (gate) throw new ServerError(4000, gate);
  return { userId: await verifyToken(ctx.headers) };            // null = anonymous, a valid answer
}
async onJoin(client: Client, options: JoinOptions) {
  const deck = await loadDeckFor(client.auth.userId, options.deckId, sanitizeClassId(options.cls));
  if (!deck.ok) throw new ServerError(4001, deck.code);          // never a silent starter
  …
}
```

**Edge cases the pattern owns:** anonymous + `deckId` present → ignored, starter deck;
signed in + no `deckId` → the account's LAST-USED deck for that hull, else starter; a deck
whose lines the account no longer owns (can't happen today — unlocks are never revoked — but
`deckRules` checks ownership anyway); module disabled → `account.unavailable` for a
token-bearer, silent anonymous for everyone else.

#### Novel Pattern 7: MatchRecord → AccountWriter (a port with a queue)

**Purpose:** the sim's private truth (every deck, every draw, every pick) reaches the store
without the sim knowing the store exists, and without ever touching the wire.

**Components:** `game/matchRecord.ts` (type + `buildMatchRecord(world, match)`),
`account/writer.ts` (`AccountWriter` interface + `createAccountWriter(db)` + a `NullWriter`
for tests and the disabled state), `shared/sim/progression.ts` (pure XP/token math).

**Data flow:** results hook fires ONCE → room builds `MatchRecord` → `writer.recordMatch(rec)`
returns synchronously after enqueueing → the queue drains off-tick: one transaction per match
(insert `matches`, insert N `match_participants`, N atomic `xp` increments computed by
`progression.ts`) → `account.write.ok` / `account.write.failed`. `flush()` awaits the queue
from the app shutdown hook.

```ts
// game/matchRecord.ts — server-only. Pin test: ResultsMsg has no key named deck*.
export interface MatchRecord {
  matchId: string; mode: 'standard' | 'solo'; startedAt: number; endedAt: number;
  participants: Array<{ userId: string | null; role: ShipRole; cls: ClassId; placement: number;
    kills: number; brought: LineId[]; drawn: Array<{ lineId: LineId; atMs: number }>;
    taken:  Array<{ lineId: LineId; atMs: number }> }>;
}
// rooms/ArenaRoom.ts — the ONLY call site
this.writer.recordMatch(buildMatchRecord(this.world, this.match));   // returns void; never awaited here
```

**Rules:** the room never awaits the writer; the writer never throws into the room; a
`NullWriter` is what a disabled module injects, so rooms carry no `if (accountEnabled)`.

#### Novel Pattern 8: Curated Auth Map + Identity Upsert (the module, used narrowly)

**Purpose:** take `@colyseus/auth`'s OAuth machinery and JWT plumbing while mounting NONE of
its rejected surfaces and keying identity our way.

**Components:** `account/auth.ts` (builds the map), `account/oauthCallback.ts` (the replaced
endpoint), `account/schema.ts` (`account_identities`).

```ts
// account/auth.ts — the map is built by hand; a pin test asserts exactly this key set
const oauth = oauthEndpoints({ prefix: '/auth/provider' });
export const authMap = {
  'auth-userdata':        userdataEndpoint('/auth'),
  'auth-oauth-start':     oauth['auth-oauth-start'],
  'auth-oauth-callback':  pinnedOriginCallback(process.env.HC_SITE_ORIGIN!),   // ours, not the module's
};
// onOAuthProviderCallback — identity, never email
auth.settings.onOAuthProviderCallback = async (data, provider) => {
  const subject = data.profile.sub ?? data.profile.id;
  const linkTo  = data.upgradingToken?.id ?? null;                  // a signed-in caller adding a 2nd provider
  const userId  = await upsertIdentity({ provider, subject, linkTo });
  return { id: userId, anonymous: false };                          // this object IS the JWT payload
};
```

**Rules:** the returned object is the JWT payload — return the id and nothing else; `email`
is never read from a profile; `anonymous: false` is explicit because the module's column
default is `true`; `upgradingToken` links, never merges, never mints.

#### Novel Pattern 9: Two-State Settings Source

**Purpose:** Eric's ruling — anonymous is localStorage as today; signed in switches to the
account — implemented as ONE store with two backends, never two stores.

```ts
// client/settings/store.ts — the subscribe seam every consumer already reads is unchanged
type SettingsSource = 'local' | 'account';
// on sign-in: if the account has no profile row → seed it from local (never wipe a callsign);
// else load account → overwrite local. On every edit while signed in: write both. Sign-out: leave local.
```

**Rules:** consumers never know which backend is live; `net/account.ts` is the only module
that flips the source; the anonymous path is byte-identical to today, pinned by the existing
settings tests running with `source: 'local'`.

#### Consistency Rules (additions)

| Rule | Convention | Enforcement |
|---|---|---|
| One helper per door duty | `verifyToken` + `loadDeckFor` called from BOTH rooms; never reimplemented | pin test: both rooms import both; review |
| Deck never from the client | `roomOptions.ts` rejects `deck`; accepts `deckId`; `deckOverride` only under `HC_DEV_OPTIONS` | sanitizer tests |
| MatchRecord ≠ ResultsMsg | server-only type; the wire results row carries no deck field | pin test on `ResultsMsg` keys |
| No `await` on the tick | no database call inside `update()` / `World.step()` | lint restriction on `account/` imports under `game/` + review |
| One transaction per match | history + N atomic `xp` increments together | writer tests |
| JWT payload is `{ id, tokenVersion }` | nothing else, ever; screens read `/api/account/me` | callback test asserts payload keys |
| Curated auth map | exactly userdata + oauth-start + our callback | pin test on mounted path set |
| Line ids everywhere | store, `deckId` wire, editor, sim speak `LineId`; display names only in `client/src/ui/` | type; review |
| Module inert without `DATABASE_URL` | no `GameDatabase` construction, no routes, no SIGN IN | boot test |

---

### Implementation Patterns — The Deck amendment (2026-09-10)

Two existing patterns are amended and four are added. Each has ONE canonical shape; an agent
writing a second shape for the same job is wrong.

#### Novel Pattern 2 (AMENDED): Boon Effects — lines with tiers, and `stock`

```ts
// shared/src/sim/boons.ts — the engine. slotReplace is gone; stock is new.
export type BoonEffect =
  | { kind: 'stat'; path: BoonStatPath; add?: number; mult?: number }     // → effectiveStats() only
  | { kind: 'slotFill'; equipmentId: EquipmentId }                        // → first empty WEAPON slot (copy 1 of a weapon line)
  | { kind: 'stock'; equipmentId: EquipmentId }                           // → the consumable's slot, else first empty CONSUMABLE slot, else REFUSE
  | { kind: 'doctrine'; weapon: EquipmentId; mode: string }               // → a boolean verb on that equipment's stats row
  | { kind: 'behavior'; hookId: string; params: HookParams };             // → HOOK_REGISTRY (still empty)
export function canStock(loadout: readonly LoadoutSlot[], line: CatalogLine): boolean;   // the ONE refusal predicate, both sides
```

**Rules:** a line's `tiers[N]` folds when copy N+1 is taken; the fold is order-independent by
construction (`validateCatalog` forbids add+mult on one path across lines; a permutation test
pins it). `stock` is refused BEFORE the card leaves the deck, by `canStock`, on both sides.
Applying a card touches: `cards`, `stats`, the slot row, pools/timers via `reconcilePools` /
`rescaleReloadTimers` — nothing else.

#### Novel Pattern 3 (AMENDED): Equipment — nine roles, two permanents, consumables

The `Equipment` interface is byte-identical. What changes is membership (18 rows, total over the
widened `EquipmentId`) and the slot table (D20). A consumable row implements `tick` as a no-op and
`activate` as "decrement `n`, do the thing"; a `stream` row (machine gun) is fired by `fireControl`'s
held pass rather than by a click; an `arcing` row (monitor) skips terrain in `stepShell`. The
one-structure law (a slot IS the runtime) and the single sinking-activation gate are unchanged.

#### Novel Pattern 10: The Damage Gate

**Purpose:** every hp loss on a hull passes one function, so the shield, the assist ledger, the
sink check and the `dmg` event cannot drift apart.

```ts
// server/src/game/world.ts — callers: shell/burst hits, torpedo & missile strikes, mine blasts, phosphor burn, the storm bite, decoy contact
const dealt = this.applyDamage(victim, amount, 'mine', mine.ownerId);   // returns what landed after the shield
```

**Rules:** callers emit their own `hc` / `boom` on the HIT, before calling (a fully-absorbed hit
still calls); the gate never emits anything but `dmg`; `payRepair` is the only hp INCREASE path
and never runs inside the gate. Pin: a grep test asserts exactly one `victim.hp -=` in `world.ts`.

#### Novel Pattern 11: The Target Collector

**Purpose:** ordnance collides with whatever the world says is hittable, by kind, without knowing
the world's stores.

```ts
// server/src/game/world.ts
const targets = this.hitTargets(CONFIG[eq].hits);           // memoized per tick per mask
const out = stepShell(shell, dtMs, { ...ctx, targets });    // shared; outcome carries target.kind
switch (out.kind) { case 'hull': …applyDamage…; case 'mine': this.detonateMine(out.id); case 'decoy': …; case 'ordnance': this.removeOrdnance(out.id); }
```

**Rules:** masks live in CONFIG on the ordnance row; the collector is the only place entity stores
are enumerated for collision; chain detonation uses a per-tick visited set; owner immunity applies
to `hull` only. A new target kind = one union member + one collector branch.

#### Novel Pattern 12: Sight Occluders

**Purpose:** smoke blocks exactly what an island blocks, minus radar, through one predicate.

```ts
// server/src/game/signals.ts
export function sightClear(a: Vec, b: Vec, islands: readonly Island[], puffs: readonly SmokePuff[], now: number): boolean {
  return losClear(a, b, islands) && !puffs.some(p => segCircleHit(a, b, p, puffRadius(p, now)));
}
```

**Rules:** the six sight call sites call `sightClear`; `blipGate` / `buoyGate` never do; `ownZoneCovers`
ignores both occluders; the `smoke` pseudo-row's own visibility is island-only + owner. Adding a
second occluder kind (a future terrain feature) is one more term in this function, never a
second predicate.

#### Novel Pattern 13: The Held Stream

**Purpose:** a weapon that fires while a key is held, without a second fire channel.

```ts
// shared/src/types.ts — InputMsg gains one LEVEL
held: boolean;
// server/src/game/world.ts fireControl — after the click pass
if (input.held && EQUIPMENT[primed].stream && inArc && slot.state.n > 0) {
  ship.streamAcc += dtMs;
  while (ship.streamAcc >= rateMs && slot.state.n > 0) { ship.streamAcc -= rateMs; this.fireStreamShell(ship, slot); }   // fireT = now, no back-date
} else ship.streamAcc = 0;
```

**Rules:** `held` with a non-stream prime is ignored; arc exit emits one denial then silence;
stream shells emit `mz` per shell (Eric) and `hc` per shell; the click counter's semantics are
untouched.

#### Consistency Rules (additions)

| Rule | Convention | Enforcement |
|---|---|---|
| One catalog | every line in `catalog.ts`; `BOON_CATALOG` gone | grep pin + type |
| Order-independent fold | no path has add+mult across lines | `validateCatalog` + permutation property test |
| Floor once | integer stats floored in `clampStats` only | stats tests per fractional line |
| Reload composition | `base × step(tier) × cooldownScale`, rounded to 3 decimals | stats tests at every tier × every RELOAD rung |
| Fill/stock on one function | `applySlotEffect` + `canStock`, both sides | client replay test = server loadout |
| Pool is room-private | rolled on the nonce stream before any seat; never on the wire | perception/wire key pin; determinism test on the nonce |
| One mulligan, countdown only | `MULLIGAN_CHOICE` honoured once; every other case a no-op | offer byte-identity tests |
| Pinned kinematics fold | `boosted → slowed → drafted → hooks` at both call sites | one shared test runs both |
| Smoke is an island for sight | six sight call sites use `sightClear`; radar gates never | perception invariant + a "smoked hull never in frame" property |
| One hull-damage writer | `applyDamage` only | grep pin on `victim.hp -=` |
| Masks in CONFIG | every ordnance row has `hits` | type: `Record<OrdnanceId, {hits}>` total |
| Six exceptions | `sp`, `hc`, `mz`, `sunk`, `sm`, `fh` — unchanged | the master invariant's exception list is a literal |
| Total tactic tables | `EQUIPMENT_TACTICS`, `CONSUMABLE_TACTICS` | `Record<…>` totality |
| Bot decks legal | `checkDeck` over `BOT_DECKS` | boot-time test |

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

### Architecture Validation — Account Store amendment (2026-09-09)

#### Validation Summary

| Check | Result | Notes |
|---|---|---|
| Decision Compatibility | PASS | D9 in-process ↔ 7-7 deferred (no new deployable); D12/D13/D16 all 0.18-only ↔ D10 upgrade sequenced FIRST; D8's "no Redis on Render" ↔ 0.18 auth keeps OAuth state in a signed cookie and the admin rate limiter in memory — no Redis anywhere; D11 no-disk ↔ zero-downtime deploys kept; D18 off-tick writer ↔ the zero-Colyseus-in-World law and the tick-error boundary |
| GDD Coverage | PASS | Every GDD account clause has a home: two states / no guest tier (D17, Pattern 9); provider + opaque subject only (D13, Pattern 8); no email/name/password (schema: `email` NULL forever, no password for players); deck frozen at queue (Pattern 6); server-private deck state (Pattern 7 — `MatchRecord` never the wire); several decks per hull (`decks` table); own history to the player, every deck to Eric (D16 + `match_participants`); unlocks variety-never-power (store shape only — the win-band is the harness's job); privacy-policy delta inputs enumerated below; "no account required, playable in ~10 s" preserved (anonymous path byte-identical) |
| Pattern Completeness | PASS | Door (creation of a seat+deck), writer (communication: port + queue), two-state settings (state), fourth error zone (errors), Drizzle via the module (data access), no bus (events) — each with one canonical shape and a pin |
| Version Specificity | PASS | Every package pinned and registry-verified 2026-09-09 (D10). ONE flagged RC: `@colyseus/database` 0.18.3 depends on `drizzle-orm 1.0.0-rc.2` — the only pre-release in the tree; it is the module's choice, not ours, and is ledgered |
| Epic Mapping | PASS with one consequence | E9 stories 1–7 each map to files (below). **E9 has no story for the 0.18 upgrade** (D10) — `gds-create-epics-and-stories` must add it as story 0, sequenced first, its own PR |
| Document Completeness | PASS | No placeholders of this document's own; the two `[DRAFT]` tags (`tokenPrice`, the `matchesToCatalog` dial) are the GDD's declared open items, carried by name, never invented |

#### E9 story → architecture mapping

| E9 story | Home | Pattern |
|---|---|---|
| 0 (NEW) Colyseus 0.18 upgrade | every `@colyseus/*` on both sides; `ArenaRoom` `setTimestep`; schema 5 | D10; own PR; PV bump |
| 1 OAuth sign-in + two-state posture | `account/auth.ts`, `oauthCallback.ts`, `session.ts`; `ui/signIn.ts`; `net/account.ts` | Pattern 8; D17 |
| 2 Store + non-ops HTTP API | `account/db.ts`, `schema.ts`, `endpoints.ts`, `server/drizzle/`; `render.yaml` `databases:` | D11, D12; Step 5 env table |
| 3 Deck editor | `ui/deckEditor.ts`; `shared/sim/deckRules.ts`, `catalog.ts`; `account/decks.ts` CRUD | D14; one legality function both sides |
| 4 Deck selection at join + freeze | `roomOptions.ts` (`deckId`), both rooms' `onJoin`, `account/decks.ts` `loadDeckFor` | Pattern 6 |
| 5 Tokens, XP, unlocks, the dial | `shared/sim/progression.ts`, `CONFIG.progression`; `account/progress.ts`; `writer.ts` | Pattern 7; atomic increments |
| 6 Match history + Eric's view | `game/matchRecord.ts`, `account/history.ts`, `ui/history.ts`; `@colyseus/admin` mount | Pattern 7; D16 |
| 7 Privacy paragraph | `client/src/privacy/policyCopy.ts` | inputs enumerated below |

#### Privacy-paragraph inputs (what the store makes true, for E9 story 7)

Signed-in accounts hold: a provider name and an opaque provider subject id; the chosen
callsign, colour preference and last class; the settings store; decks; unlocks and progress
(xp, tokens spent); per-match rows of the player's own deck, draws and picks with placement
and kills. A session token is kept in the browser's localStorage for 30 days. Deleting the
account removes all of the above and leaves match rows with no account reference. Nothing is
stored for a player who does not sign in. The operator's admin console can read these tables.
(Every sentence above is a claim about shipped behaviour — `policyCopy.ts`'s standing rule.)

#### Issues Found & Resolved (this pass)

- **Solo door bypass** (party): the arena creates its own room and never touches the queue,
  so "load at queue" alone left a hole — resolved by one helper at both doors + sanitizer
  rejection of `deck` (Pattern 6).
- **Enemy-deck leak via `ResultsMsg`** (party): resolved by the server-only `MatchRecord` and a
  key pin (Pattern 7).
- **History rollback on mid-match deletion** (party): resolved by `ON DELETE SET NULL` and the
  anonymous-write rule (D15/D18).
- **Lost writes on deploy** (party): resolved by `flush()` on shutdown (Pattern 7).
- **Module identity keyed by email** (measured): resolved by our own callback keyed on
  `(provider, subject)` with linking (Pattern 8).
- **Wildcard postMessage** (measured): resolved by the replaced callback + `HC_SITE_ORIGIN`.
- **Silent SQLite fallback** (party): resolved by the no-URL-no-database pin (D9).

#### Ledgered, not resolved (for deferred-work.md)

- `drizzle-orm` is an RC inside `@colyseus/database` 0.18.3 — pin the module's exact version;
  revisit when the module moves to a stable Drizzle.
- Six new `sync: false` secrets in `render.yaml` — an unattended Blueprint sync reports
  `error` and skips each until its value is set in the dashboard (cycle 127's
  `HC_STAGING_KEY` observation, now ×7). The account module is inert until they exist; set
  them BEFORE merging the account PR to `main`.
- The admin console stores Eric's one password hash (D16 knowing exception).
- `@colyseus/admin`'s own guidance — *"serve on separate hostname or behind network guard
  until access controls tighten"* — is not followed at launch; it sits on the public host
  behind its login (and the staging gate on dev). Revisit if it ever holds more than one
  admin.
- Story 7-7's revival brief gains a line: the account API is same-origin HTTP with a Bearer
  token, so option A (full split) needs CORS on `/api/*` and `/auth/*`; options B and C need
  nothing.

#### Overall Status: PASS — the amendment is ready to guide E9 story creation

#### Validation Date

2026-09-09

---

### Architecture Validation — The Deck amendment (2026-09-10)

#### Validation Summary

| Check | Result | Notes |
|---|---|---|
| Decision Compatibility | PASS | D19's total per-equipment record ↔ the `effectiveStats()` firewall (widened, never bypassed); D20's nine roles ↔ `InputMsg.slot` integer validation, `slotAmmo`, the hotbar; D21 ↔ the two existing input channels and the one sinking gate; D22's room-private pool stream ↔ the storm-ring nonce precedent and the E9 door (pool AFTER legality); D23 ↔ the pinned kinematics fold and the one-tick-old ribbon read (`stepShips` precedes `sampleWakes`); D24 ↔ radar's height-march gate (never `losClear`) — "smoke blocks sight only" is true by construction; D25 ↔ `stepShell`'s existing single target list; D26 ↔ latest-wins input semantics and the intent-queue cap; D27 ↔ the Gunnery Conversation's three oracles and the jamming carve-out; D28 ↔ the assist ledger (one caller); D29 ↔ the "mine exists until destroyed" rule; D30 ↔ the boost-outside-`EffectiveStats` trap the bots already handle; D31 ↔ the structural `ai/` boundary (bots still hold no `World`) |
| GDD Coverage | PASS with named deferrals | Card model A, copies = tier ceiling, add-ons by family, tier I is the bare weapon, the deck gun's real tier I (D19); three generic weapon slots, four consumable slots, slot keeps its clock (vacuous, kept), swap cheese NEVER (D20); key-fires vs key-primes-click-fires, full-slot refusal, server-owned slot state (D21); legal deck at the door, equal weight, card leaves on take, exhaustion, draw-pile counter, the hidden pool, level zero at countdown, mulligan, weighted first draw (D22); wake drafting's prediction seam (D23 — the named delegation); smoke as a sight occluder incl. the `[DRAFT]` self-hiding (D24 — the named delegation); shoot-any-mine, flak vs ordnance, the decoy's physical block, homing retarget (D25); the held stream and its arc-exit behaviour (D26); per-line signals incl. note 21's design half, CHAFF on the carve-out (D27); Shield Block's scope (D28); no live-mine cap, the room ceiling's fate, decoy HP (D29); Shift universal and the base-vs-raised question (D30); bot decks, total consumable tactics, harness arms (D31). Deferred by name below: notes 14, 19, 20(a), the decoy's radar paint |
| Pattern Completeness | PASS | Boon effects (creation of a build), equipment (the runtime), damage gate (state), target collector (collision), sight occluders (perception), held stream (input) — each with one canonical shape and a pin |
| Version Specificity | PASS (n/a) | No new package. The Colyseus 0.18 upgrade (D10) is E9 story 0 and precedes nothing here; E8 builds on the same runtime E9 does |
| Epic Mapping | PASS with one ordering consequence | E8 stories 1–15 each map to files below. **The damage gate (D28) and the target collector (D25) are prerequisites of stories 5, 12, 13 and 15 but belong to none of them** — `gds-create-epics-and-stories` should land them in story 4 (the slot rework touches `fireControl` anyway) or as a story 0 of E8, its own PR, no wire change |
| Document Completeness | PASS | No placeholder of this document's own. Every `[DRAFT]` tag names a catalog v3 cell (turning step, boost numbers, machine-gun numbers, flak base, captive pool/clock, shield scope now RULED, smoke self-hiding now a consequence, draft lift + width, the magazine reading of the stream's ammo) and is carried, never filled |

#### E8 story → architecture mapping

| E8 story | Home | Pattern / decision |
|---|---|---|
| 1 Card model + catalog hooks | `shared/sim/catalog.ts`, `boons.ts`, `stats.ts` | D19; NP2 amended |
| 2 Legal-deck rules, starters, freeze at queue | `shared/sim/deckRules.ts` (E9), `catalog.ts` starters; both doors | D22; E9 Pattern 6 |
| 3 Equal-weight draw, card-leaves, exhaustion, counter | `shared/sim/deck.ts`; `OwnShip.deckLeft`; `render/hud.ts` | D22 |
| 4 Deck gun + three weapon slots | `shared/sim/loadout.ts`; `equipment/index.ts`; `world.ts fireControl`; hotbar | D20; NP3 amended; **+ D25/D28 prerequisites (see Epic Mapping)** |
| 5 Four consumable slots | `loadout.ts`; `boons.ts` `stock`/`canStock`; `inputs.ts`; `keyboard.ts`; `upgradeMenu.ts` | D20, D21 |
| 6 Heal as a card; retire `5` | `consumables/hullRepair.ts`; `offers.ts` (− `HEAL_CHOICE`); `hud.ts` (− rail) | D21 |
| 7 The opening: gun-and-Shift spawn, level zero, mulligan, weighted draw | `match.ts` hook; `world.ts spendPoint`; `deck.ts` guarantee; `offers.ts` `MULLIGAN_CHOICE` | D22 |
| 8 Bot decks, consumable tactics, harness arms | `ai/decks.ts`, `ai/consumables.ts`, `ai/equipment.ts`, `ai/spending.ts`; `server/scripts/` | D31 |
| 9 Own-deck results + the per-match record | `game/matchRecord.ts` (+ `pool`), `ui/results.ts` | E9 Pattern 7; D22 |
| 10 The match consumable pool | `shared/sim/pool.ts`; `world.ts addShip`; room creation (both doors) | D22 |
| 11 Ladders + deck gun content | `catalog.ts`; `stats.ts clampStats` (reload step, floor-once) | D19 |
| 12 Equipment lines + add-ons | `equipment/*` (six new rows, `torpedoCore.ts`, `captiveMines.ts`); `signals.ts` rows; `shell.ts`; `arcs.ts`; `aim.ts`; `render/projectiles.ts` | D25, D26, D27 |
| 13 Consumables content | `equipment/consumables/*`; `fakes.ts`; `smoke.ts`; `signals.ts` `sightClear` + `smoke`/`decoy` rows; `render/smokeScreen.ts`, `render/decoys.ts` | D24, D27, D28, D29 |
| 14 Shift boost universal; retire the boost equipment | `equipment/boost.ts`; `loadout.ts` slot 1; `keyboard.ts` | D30 |
| 15 Shoot-any-spotted-mine; wake drafting | `world.ts hitTargets`/`detonateMine`; `shared/sim/wake.ts` `draftLift`, `sim/draft.ts`; `prediction.ts` | D25, D23 |

#### Issues Found & Resolved (this pass)

- **No damage chokepoint exists** (measured at `HEAD`: `applyStorm`, `hitShip`, `burnShip` each
  write `hp`): resolved by D28 — the shield would otherwise have been three independent `if`s.
- **Prediction cannot see wakes** (measured: `prediction.ts` reads only own-ship state; the `wk`
  event is a mask with no geometry): resolved by D23's server scalar rather than any client-side
  reconstruction.
- **"Smoke blocks sight only" was two rules waiting to drift**: resolved by D24 — radar's gate is
  the height march and never `losClear`, so one predicate at the sight call sites cannot touch radar.
- **A click is a counter, not a level** (measured: `fireSeq` cumulative, consumed once): a
  re-emitted-click stream would fight the consumed-not-queued latch — resolved by D26's `held`.
- **The full-slot refusal had no natural home**: resolved as a SPEND-path predicate shared by both
  sides (D21), not an activation denial.
- **The pool could have leaked through `WelcomeMsg.config` or the results row**: resolved by
  rolling it on a room-private stream and recording it only on `MatchRecord.pool` (D22).
- **The equipment reload step, written as a card effect, would have been order-sensitive against
  `cooldownScale` and the per-line `reloadMs` paths**: resolved by deriving it from the tier count
  in `clampStats` (D19).
- **`HOOK_REGISTRY` looked like the home for drafting and the boost**: it is not — both are
  unconditional per-tick steps, and putting them behind card-carried hooks would make them
  removable by a deck. The registry stays empty (D2 amended).

#### Ledgered, not resolved (for deferred-work.md)

- GDD note 19: the LIGHT TORPEDO (45 u/s) against the boosted, ladder-raised Torpedo Boat
  (68.75 u/s under D30) breaks the "torpedoes outrun every hull" pin as written — Eric re-scopes
  the law or moves the number; nothing here guarantees it.
- GDD note 14: the free per-level auto-heal stays built and its CONFIG stays under
  `damageControl` until the balance pass rules on it.
- GDD note 20(a): a player's history shows the pool cards they drew and nothing else — the
  facilitator's reading, implemented as a filter on `MatchRecord`, awaiting Eric.
- The reveal's new `w` (weapon family) field is a disclosure widening: a sighted shell now names
  the weapon that fired it. Needed to draw a tracer vs a shell vs an arc; carries no range or
  identity; declared here so it is not rediscovered as a leak.
- Stream flash cost: 20 bots at 4 Hz is 80 `mz`/s at the emitter; `flashBudget.ts` caps the
  render, but the wire and perception cost are unmeasured. Measure before trusting the 0.25 s
  cadence.
- The stream's ammo model: `ammo.ts` refills round-by-round; "6 s of fire, 15 s reload" reads as
  a magazine. Both are `[DRAFT]`; the `refill: 'magazine'` switch is reserved, not built.
- Shield: no tell to the shooter (an absorbed hit still calls); a second shield replaces rather
  than stacks. Both defaults, both `[DRAFT]`.
- Decoy: whether it paints on radar (default: yes, the buoy's footprint path); the owner's own
  fish and own flak are NOT exempt from it (the GDD's DRAFT reading, carried).
- A lit zone (`ownZoneCovers`) ignores smoke as it ignores islands — consistent, pinned, and a
  design question if a star shell should not see into smoke.
- A puff is visible with island-only LOS so it never vanishes around you; a destroyed torpedo or
  missile emits no boom of its own — two presentation gaps.
- Perf pins owed at build: perception at 20 observers × 200 puffs; `checkMineTriggers` + the
  collector at 500 live mines; the parity test at `draft = 0`.
- E8 ordering: D25 + D28 need a home before stories 5/12/13/15 (see Epic Mapping).

#### Overall Status: PASS — the amendment is ready to guide E8 story creation

#### Validation Date

2026-09-10 (scoped pass; decisions taken live with Eric; code seams read at `HEAD`, `PROTOCOL_VERSION` 49).

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

### Setup Commands — Account Store additions (2026-09-09)

```bash
# Local dev needs no Postgres: the module runs the real schema on PGlite (in-process Postgres).
HC_DEV_DB=pglite HC_DEV_OPTIONS=1 npm run dev     # accounts ON locally, devSignIn endpoint mounted
npm run dev                                        # accounts OFF (no DATABASE_URL) — the game is byte-identical to today
npx drizzle-kit generate --config server/drizzle.config.ts   # after a schema.ts change: writes server/drizzle/NNNN_*.sql (commit it)
```

- Server tests run the account paths on the `pglite` dialect, so `npm run check` exercises
  the real SQL with no service running.
- Real OAuth needs one app per host (redirect URIs differ): set the `HC_OAUTH_*`, `JWT_SECRET`,
  `SESSION_SECRET` and `HC_SITE_ORIGIN` values in the Render dashboard for `hullcracker-dev`
  first; the module is inert until `DATABASE_URL` exists. Never put any of them in a `VITE_`
  var or a `client/.env.*` file (not gitignored).

### Setup Commands — Deck additions (2026-09-10)

```bash
# Batch-sim: deck arms (D31). The pool is rolled per match from the room stream in every arm.
node server/scripts/batchSim.mjs --deck authored --matches 30      # the six authored bot decks
node server/scripts/batchSim.mjs --deck random-legal --matches 30  # random decks legal against every cap
# Headless smokes: deterministic pool + the countdown mulligan beat (HC_DEV_OPTIONS only)
HC_DEV_OPTIONS=1 node server/scripts/matchSmoke.mjs --poolOverride hullRepair,shieldBlock,…
```

- No new env var, no new service, no new package: E8 runs on the runtime E9 story 0 (Colyseus
  0.18) leaves behind, and every dial it adds is a shared `CONFIG` value.

### AI Tooling (MCP Servers)

No engine-specific MCP is applicable (custom TypeScript engine — see the closed MCP-engine
question in Engine & Framework). Recommended, engine-agnostic:

| Tool | Purpose | Install type |
|---|---|---|
| **Context7** (upstash/context7) | Current-docs lookup for Colyseus 0.18 / PixiJS 8 APIs instead of training-data recall (0.17 → 0.18 per D10, 2026-09-09) | MCP server |
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

**Amended 2026-09-09 — E8/E9 order.** E1–E7 have shipped. Next: **E9 story 0 — Colyseus
0.17 → 0.18** (its own PR, PV bump, full smoke pass), then E8 (the deck, plays anonymously on
starter decks) and E9 (the account) as the ratified one-unit release; `gds-create-epics-and-
stories` cuts E9's stories against the Account Store amendment, and the `databases:` entries
in `render.yaml` land in the same PR as the code that reads them.

---

_End of architecture document. This is a living document — revise it as playtests teach
(see A Living Document under Architecture Validation)._
