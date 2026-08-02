---
title: '3-1 Phased Zone Timeline (+ ratified map bump)'
type: 'feature'
created: '2026-08-01'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false # flag retired (Epic 2 retro Ruling 1) — residuals are ledger entries with evidence + named home
baseline_revision: 'cd91b4a2b79aa42f6b1a27134a4d482f2306548f'
final_revision: 'ec2e00a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** The storm is a single 45s-grace + 3-min continuous shrink fully closed at 3:45 on a 900u map — no pacing arc (matches end 0:40–1:20 p50 in the harness), the ratified 12–20 picks-per-match band is arithmetically unreachable (match length, not XP dials, owns the fix — amendment 2), and on today's map the ring would be toothless (worst-case escape ≈ 8% of a battleship-minute).

**Approach:** Replace `sim/zone.ts` with a phased three-group offset-ring timeline (pure shared sim; per group: clear seas → reserved supply-drop no-op → next ring revealed → ring closes over one minute; full closure ~12:00; terminal radius = 2 × truesight radius derived from `CONFIG.vision.sight`; geometric radius steps), retune map/fill design targets to the closing-rate criterion (map radius ≈ 2400u, fill ≈ 20 — amendments 7/8), bump PROTOCOL_VERSION 17→18, update every consumer/smoke/harness touchpoint, and prove pacing with a batch-sim evidence campaign (lethal baseline + new pacifist-pilot control) whose tuning values commit ONLY via an Eric mid-run checkpoint.

## Boundaries & Constraints

**Always:**
- Timeline is pure shared sim: both sides derive identical {phase, current ring, closing interpolation} from (zoneStartT, clock, CONFIG); zero I/O, zero Colyseus imports, no `Math.random`/`Date.now` — ring-center rolls use a seeded server-private stream (see Design Notes).
- Storm deals flat `CONFIG.zone.stormDps` (4 hp/s reference) outside the live ring in EVERY phase and never blinds/degrades any sensor tier.
- Supply-drop beat is a named structural phase with ZERO HUD footprint and zero behavior.
- Terminal ring radius = 2 × `CONFIG.vision.sight` (660u today), computed from CONFIG — never an independent constant.
- Every next ring is fully contained within the current ring for every seed (offset cap enforced structurally).
- PROTOCOL_VERSION 17→18 with a changelog entry; `zoneState` phase values, new ArenaState ring fields, and the CONFIG.zone snapshot reshape are all wire contract.
- Closing-rate criterion pinned as a CONFIG-invariant test: worst-case escape distance per close ≤ battleship-minute (2100u), with the ratified ~80% target at defaults.
- Map/fill/ring tuning values are DESIGN TARGETS; exact committed values require Eric's ratification at the mid-run evidence checkpoint (amendment-55 pattern). No autonomous balance commits.
- Interim client adaptation only: map new phases onto the existing storm-readout registers (draft copy) and thread ring center/radius through existing renderers; degenerate-numeric guards (0/NaN/negative durations, radii, caps) are first-write habit.
- Epic-3 amendments 1–9 bind; complexity ≤ 10; `npm run check` green.

**Block If:**
- The evidence checkpoint cannot reach Eric, or evidence shows the ratified shape (3×4min, geometric steps, 660u terminal) cannot satisfy the closing-rate criterion at ANY map size — do not self-modify the ratified shape.
- Any change outside zone/map/fill scope appears necessary to satisfy an AC (e.g. XP dials chasing the picks band, pilot lethality retunes beyond the pacifist flag).

**Never:**
- No ring-reveal/storm rendering work (3.2), no chrome bar (3.3), no endgame-constraint evidence beyond exposing the terminal value (3.4).
- No supply-drop mechanic, hint, or HUD trace; no escalating storm damage; no roster-dynamic map sizing (6.2); no teams/squads work (Epic 6 ledger).
- Never derive future ring centers from client-known seeds (precompute cheat); never send unrevealed ring geometry to clients.
- One PR; never split.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-start | zone not started | phase `idle`, full map radius, no damage | No error |
| Group g, beats 1–3 | elapsed in clear/supply/reveal | radius+center hold at ring g; phase names exact; next-ring geometry exposed from reveal beat only | No error |
| Close beat | elapsed in group g beat 4 | center+radius interpolate linearly ring g → ring g+1 over beat duration | No error |
| Past closure | elapsed ≥ timeline total | phase `closed`, holds final ring (center + 660u) forever | No error |
| Ship vs ring | pos on live ring boundary / outside | boundary-inclusive SAFE; strictly outside takes `stormDps·dt`, storm kills unattributed | No error |
| Containment | any seed, any group | next ring circle ⊆ current ring circle; terminal = 2×sight | Structural clamp, property-tested |
| Stale client | join with pv 17 | rejected at matchmake (`protocolVersionError`) | Clean rejection |
| Degenerate cfg | 0/negative beat ms, 0 groups, offsetCap>1 | clamped/guarded; no NaN, no hang, no divide-by-zero | Fail-closed guards |
| zoneOverride | dev-gated new-shape override | honored under HC_DEV_OPTIONS=1 only; stripped otherwise (unchanged gate) | rejectedKeys unchanged |

</intent-contract>

## Code Map

- `shared/src/sim/zone.ts` — REWRITE: phased timeline model + API (see Design Notes); keep `isOutside` semantics (center-aware).
- `shared/src/constants.ts` — CONFIG.zone reshape (beats/groups/offsetCap/stormDps + geometric ring derivation); CONFIG.map/match retune to targets (radius ≈2400, fill ≈20; expression implementer-drafted per amendment 8).
- `shared/src/index.ts` — PROTOCOL_VERSION 17→18 + changelog entry.
- `server/src/game/world.ts` — zone stream (seeded, server-private), ring-state getters, `applyStorm` center-aware; `startZone` anchor unchanged.
- `server/src/game/drones.ts` — zone-recovery steers to live ring center, not (0,0).
- `server/src/rooms/schema/ArenaState.ts` + `ArenaRoom.ts` (`syncZone`) — phase string + current/next ring geometry fields, revealed-only.
- `server/src/rooms/roomOptions.ts` — `zoneOverride` typed to the new timeline shape (gate logic unchanged).
- `client/src/main.ts` — `zoneView`/`zoneHud` derive from schema ring fields + clock; interim phase→register mapping; Zone ctor args.
- `client/src/render/zone.ts` — accept ring center; draw whatever geometry it's handed (no new visuals).
- `shared/src/__tests__/zone.test.ts` — full rewrite + containment/determinism/closing-rate property tests.
- `server/src/__tests__/{zone,match,drones,roomOptions,boons,upgrades}.test.ts`, `client/src/__tests__/{zone,hud}.test.ts` — timeline-literal reshapes + behavior updates.
- `server/scripts/*.mjs` (11 smokes) — override literals reshaped; `zoneSmoke.mjs` phase assertions rewritten.
- `server/scripts/batchsim/overrides.ts` — phased-key sweep support; `runner.ts` — tick budget from a shared time-to-closed helper; `pilots.ts` — ring-center goal + pacifist (no-hunt) policy flag; `report.ts` — closure-time/phase columns as needed.
- `VERSION` + root `package.json` — 0.X.0 feature bump; `CLAUDE.md` zone line; `sprint-status.yaml` + `gds-workflow-status.yaml` ride the PR; deferred-work picks-band entry status updated from evidence.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/zone.ts` + `shared/src/constants.ts` + `shared/src/index.ts` — phased model, CONFIG reshape, PV 18 — the spine everything else consumes.
- [x] `shared/src/__tests__/zone.test.ts` — rewrite + new property tests (containment ∀ seeds, boundary semantics, interpolation, closing-rate criterion, degenerate guards).
- [x] `server/src/game/{world,drones}.ts` + `rooms/{schema/ArenaState,ArenaRoom,roomOptions}.ts` — server integration: stream, getters, storm, steering, reveal-gated sync (ring stream server-private via per-room nonce, amendment 10).
- [x] `server/src/__tests__/*` — reshaped literals + new behavior pins (reveal-gating: next-ring fields absent pre-reveal; zone-seed independence).
- [x] `client/src/main.ts` + `render/zone.ts` (+ hud doc comment) — interim adaptation; client tests green unchanged.
- [x] `server/scripts/*.mjs` — smoke literals + zoneSmoke assertions; all 11 smokes run green (matchSmoke/dronesSmoke pin offsetCap:0 for their hand-tuned choreography; offset proven by zoneSmoke).
- [x] `server/scripts/batchsim/{overrides,args,runner,pilots,main}.ts` + harness tests — phased sweep keys, zoneClosedAtMs tick budget, ring-center goal, pacifist flag, 'unresolved' endedBy for uncompleted pacifist matches.
- [x] Evidence campaign + checkpoint — lethal baseline (200), pacifist control (50), map sweep (3×100), closing-rate table; Eric ratified as evidenced, unchanged (amendment 11); `batch-sim-evidence-2026-08-01.md` written; deferred-work picks-band entry RESOLVED.
- [x] Docs/bookkeeping — VERSION 0.17.0→0.18.0 + root package.json, CLAUDE.md (zone lines + PV), sprint/workflow status files ride the PR at finalize.

**Acceptance Criteria:**
- Given an unmodified match, when the timeline runs, then phases follow clear→supply→reveal→close per group, three groups, full closure at the CONFIG target (~12:00), then `closed` holds the terminal ring.
- Given the same schema fields and clock, when server and client compute ring state during any beat, then geometry and phase agree exactly (shared function, shared inputs).
- Given any zone-stream seed, when all rings are rolled, then every next ring is contained in the current one and the terminal radius equals 2×`CONFIG.vision.sight`.
- Given a client before a group's reveal beat, when frames/schema arrive, then no future-ring geometry is present anywhere on the wire.
- Given the committed CONFIG defaults, when the closing-rate test computes worst-case escape per close, then it is ≤ 2100u and ≈ the ratified 80% target.
- Given the batch-sim pacifist control, when matches run, then they reach storm-forced conclusions with closure ≈ the CONFIG target and the evidence report states match-length distributions, picks-band position, `endedBy` split, and the lower-bounds caveat.
- Given a pv-17 client, when it attempts matchmake, then it is rejected cleanly before seat reservation.

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass (2 Fable hunters + Codex cross-model; verdict: build-on-it)
- intent_gap: 0 (the island-density gap was resolved live by Eric ruling → amendment 12, not a HALT; versioning re-ruled → amendment 13)
- bad_spec: 0
- patch: 9: (high 0, medium 3, low 6)
- defer: 1: (low 1)
- reject: 3: (low 3)
- addressed_findings:
  - `[medium]` `[patch]` Client ring pop-back at intermediate close completions (all three reviewers) — stale-boundary guard in new `client/src/sim/zoneView.ts` (schema's revealed next IS ring g+1 during the latency window); 4 client tests, core one fail-proven.
  - `[medium]` `[patch]` Zone-stream PRNG state recovery (Codex, orchestrator-verified) — revealing ring 1 disclosed two raw outputs of one 32-bit stream, brute-forceable offline; per-ring independent streams (`WorldOptions.zoneSeeds`, per-ring room nonces, harness per-ring derivation); forward-secrecy pins (prefix stability + offset-delta invariance).
  - `[medium]` `[patch]` Island field didn't scale with the map bump (Blind Hunter; Eric-ratified amendment 12) — cluster budget ~× map-area, sizes 30–90u (2400u board: ~37 islands / 2.22% cover vs old realized ~5.6 / 1.40%); smoke seeds re-scanned (fogSmoke/latencyHarness 110→265), island avoidance added to straight-line smoke pilots; both evidence runs re-executed (evidence-doc addendum).
  - `[low]` `[patch]` Amendment 7's perf leg unmeasured (Blind Hunter) — probe: 20 captains × 20 observers × real observe()/frames, p50 1.33ms/tick vs 3ms budget; recorded in evidence doc, probe deleted.
  - `[low]` `[patch]` r===0 unrevealed-sentinel collision with terminalSightFactor 0 (both hunters) — terminal radius floored at 1u structurally, pinned.
  - `[low]` `[patch]` Harness at-cap mislabel (Edge Case Hunter) — `capSample` classifies genuinely-finished matches at the tick cap; fail-proven at the seam (the live path is unreachable in the current loop — guard is defensive; honesty note in report).
  - `[low]` `[patch]` zoneSmoke couldn't catch late storm-damage start (Codex) — live-boundary crossing assertion added (observed +0ms) + server unit pin for mid-close live-radius damage.
  - `[low]` `[patch]` `World.zoneClosesInMs` dead code (Blind Hunter) — removed.
  - `[low]` `[patch]` No regression pin that ArenaRoom supplies private zone seeds (both hunters) — `zoneSeeds.test.ts`: same map seed ⇒ identical maps, different rings.
- defer: fogSmoke shell-reveal intermittent (pre-existing flakiness family; one non-reproducible failure in 4 runs; candidate fix documented) → deferred-work entry.
- reject: float32 schema quantization at the ring boundary (server-authoritative, sub-0.01u); interim HUD countdown semantics drift note (spec-compliant; 3.3 reads the spec); pre-existing smoke rot observation (already repaired in wave 1, informational).

## Design Notes

- **Anti-cheat ruling (Eric-ratified, amendment 10):** ring centers roll on a **server-private seeded stream** (decorrelated from mapSeed, offer-stream pattern) — mapSeed is client-known, so seed-derived centers would let a modded client precompute future rings. Revealed geometry travels via ArenaState fields at reveal time. Preserves amendment 3's ratified WHAT (offset rings, containment, reveal at minute 3); harness reproducibility holds (World seed → zone stream).
- **API sketch (shape, not prescription):** `zoneStateAt(t, startT, rings, cfg) → { phase, groupIndex, current: {cx, cy, r}, next: {cx, cy, r} | null, closesInMs }` with `rings` rolled once at `startZone` by the server and mirrored (revealed-prefix only) to clients; plus `zoneClosedAtMs(cfg)` for tick budgets and `isOutside(pos, ring)`.
- **Closing-rate criterion (the design equation):** worst-case escape per close = (1 + offsetCap) × Δr where Δr = r_g − r_g+1; criterion: ≤ 0.8 × 35 u/s × beatMs. Geometric steps 2400→660 give Δ₁ ≈ 840u → 1680u ≈ 80% ✓. Pinned as a test over CONFIG so future retunes can't silently make the ring unwinnable.
- **Interim HUD mapping (draft copy):** clear/supply → the existing "STORM M:SS" countdown register (to next close), reveal → same countdown (3.2 owns the reveal moment), close → "STORM CLOSING", terminal → "STORM CLOSED". Zero supply-drop trace.

## Verification

**Commands:**
- `npm run check` — expected: lint + type-check + full suite green (test count grows; no complexity errors).
- `HC_DEV_OPTIONS=1 node server/scripts/zoneSmoke.mjs` (server booted per its header) — expected: phased assertions pass over real sockets.
- Harness evidence runs (batchSim CLI per its `--help`): lethal baseline, pacifist control, `--sweep` over map/ring keys — expected: seeded, byte-identical reruns; evidence doc written; checkpoint held with Eric before committing tuning values.

**Manual checks (if no CLI):**
- Worktree diff contains no unrelated files (Eric's HULLCRACKER_NOTES.md untouched); PV changelog entry present; supply beat greps to zero client-visible strings.

## Auto Run Result

**Status:** done. **Final revision:** ec2e00a (code); branch worktree-dev-auto-3-1-phased-zone-timeline.

**Summary.** The storm is now the designed pacing arc: three ring groups × (clear seas → reserved supply-drop no-op → next ring revealed → ring closes), 60s beats, full closure at 12:00, offset-center rings rolled on server-private per-ring seed streams and revealed to clients only from each group's reveal beat (PV 17→18). The board grew to the closing-rate criterion (map 2400u, fill 20, worst-case escape ≈80% of a battleship-minute — pinned as a CONFIG-invariant test) and the island field scaled with it (amendment 12). Terminal ring = 2×truesight, derived. Eric ratified every tuning value from a seeded evidence campaign (amendment 11); the 2-10 picks-band ledger entry is RESOLVED (pacifist picks p50 = 12.0 exactly at the 12:00 closure). VERSION scheme re-ruled mid-run (amendment 13): 0.17.31.

**Files changed (grouped).** shared: sim/zone.ts (phased model, per-ring streams, terminal floor), sim/map.ts (area-scaled islands), constants.ts (CONFIG.zone reshape; map/match retune), index.ts (PV 18); server: game/world.ts (zoneSeeds, ring getters, center-aware storm), game/drones.ts (ring-center steering), rooms/ArenaRoom.ts (buildWorld + per-ring nonces, syncZone), rooms/schema/ArenaState.ts (reveal-gated ring fields), rooms/roomOptions.ts (new zoneOverride shape); client: new sim/zoneView.ts (derivation + stale-boundary guard), main.ts, render/zone.ts (offset center; revealed-next telegraph); tooling: all 11 smokes (incl. zoneSmoke live-boundary honesty, fogSmoke/latencyHarness seed 265, avoidance pilots), batchsim (phased sweep keys, zoneClosedAtMs tick budget, pacifist pilot, capSample, per-ring seeds); tests across all three workspaces (2314 → 2363); artifacts: evidence doc + addendum, amendments 1–13, deferred-work (teams entry, fogSmoke flake entry, picks-band RESOLVED), sprint/gds status, VERSION/package.json 0.17.31, CLAUDE.md.

**Review findings breakdown.** 2 Fable hunters + Codex cross-model, verdict build-on-it: 9 patches applied (3 medium — client ring pop-back guard [all three reviewers], zone-stream forward secrecy via per-ring independent seeds [Codex; 32-bit stream state was brute-forceable from ring 1's revealed geometry], island scaling [Eric-ratified amendment 12]; 6 low), 1 defer (fogSmoke flake family → ledger), 3 rejects, 0 intent gaps, 0 bad-spec. Follow-up-review flag: retired category (Epic 2 retro Ruling 1) — residuals live in the ledger.

**Verification.** `npm run check` green at every wave (final: 2363 tests — 379 shared / 809 server / 1175 client; lint 0 errors). All 11 headless smokes green over real sockets on the final code state (zoneSmoke proves offset rings, reveal gating, +0ms live-boundary damage start, 4.00 hp/s decay, unattributed storm kill). Batch-sim byte-identical rerun property re-verified. Evidence campaign (seeded): lethal 200 (length p50 293.3s, picks p50 5), pacifist 50 (picks p50 12.0 at t=720s, 21 at cap; storm deaths 6.2/match), map sweep (length scales with board), analytic closing-rate table, perf probe (total p50 1.33ms/tick, p95 1.85ms vs 3ms budget, 20 captains × 20 observers).

**Residual risks.** Harness numbers remain lower/upper bounds (omniscient pilots) — human match lengths land between the lethal floor (~5 min) and the pacifist ceiling (22 min cap); Eric's live-play eye is the acceptance mechanism of record. Pacifist lobbies end 'unresolved' by construction — the endgame-conclusion guarantee is Story 3.4's evidence. fogSmoke's shell-reveal intermittent (pre-existing family) is ledgered with a candidate fix. The drone XP piñata (84% of hunter kills are drones at fill 20) is measured and accepted until Epic 6's real bots.
