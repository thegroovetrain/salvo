---
title: 'Story 4.4 — Wounded Smoke'
type: 'feature'
created: '2026-08-05'
status: 'done'
baseline_revision: '5263cb4'
final_revision: '4446939'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** A hurt hull is indistinguishable from a whole one at any range — no hp, damage amount, or damage fraction about another ship has ever reached a client, so a hunter cannot tell wounded prey from a fresh fight, and the colour-banded HP rail every captain reads about themselves has no enemy-facing half.

**Approach:** Add `sm`, a neutral two-tier smoke pulse, as the FIFTH declared exception to the master perception invariant. The server emits a puff at a smoking hull's true position on a fixed cadence; the client accumulates puffs into a drifting plume. Tiers are the HP rail's own ratified bands (light <50%, heavy <25%), promoted to shared CONFIG so exactly one set of thresholds exists.

## Boundaries & Constraints

**Always:**
- Smoke tiers and the own-vitals rail bands derive from ONE source of truth in shared `CONFIG`; `CLIENT_CONFIG.vitals.amberBelow`/`criticalBelow` must reference it, not restate it (amendment 41).
- Reach is `CONFIG.vision.muzzleFlash` (`SIGHT * 1.5`, 495u) reused verbatim — no fourth vision constant (amendment 42).
- Island LOS applies, exactly as it does for `mz` (amendment 44).
- The wire payload is `{k, x, y, tier}` and NOTHING else — no ship id, no hue, no class, no hp, no fraction, for any observer including spectators (amendment 45).
- `tier` is an enum (`1` light / `2` heavy), never a fraction and never an hp value (amendment 41).
- The new row gets its own INDEPENDENTLY REIMPLEMENTED oracle in `perception.test.ts` — re-derive `SIGHT * 1.5` as a literal there; do not share a helper with the `mz` verifier (house rule, `perception.test.ts:1-17`).
- `motion: 'off'` removes drift and billow, never the plume's presence or tier (`effects.ts:44-53`).
- Every hull with hp smokes, drones included (amendment 47).
- Your own plume is visible to you, via the same row with no special case (amendment 46).

**Block If:**
- The single-source band promotion cannot be done without changing the rail's shipped 0.5/0.25 values — HALT rather than retune the rail.
- Puff cadence or lifetime cannot be tuned to keep the plume reading as an attached column rather than a track (amendment 43) — that inversion is a design change, not a tuning call.

**Never:**
- No correlation handle of any kind on the wire — not the real ship id, not a per-observer alias, not a stable anonymous key (amendment 45). Per-source puff capping is therefore impossible by construction; cap globally only.
- No audio twin this cycle — 4.7 owns any decision to voice it (amendment 49).
- No trail semantics: puffs must not outlive the column (amendment 43).
- No decoy smoke (amendment 48). No combat tunable, hp, damage, reload, range, or catalog value moves (amendment 49).
- No design-doc edits — drift goes to the 7-5 batch (amendment 50, already ledgered).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Healthy hull | hp/maxHp ≥ 0.5 | No `sm` emitted at all | No error expected |
| Light band | 0.25 ≤ hp/maxHp < 0.5 | `sm` emitted on cadence with `tier: 1` | No error expected |
| Heavy band | 0 < hp/maxHp < 0.25 | `sm` emitted on cadence with `tier: 2` | No error expected |
| Exact band edge | hp/maxHp === 0.5 exactly | NO smoke — thresholds are exclusive lower bounds for the better state, matching `hpColor()` (`frac >= amberBelow` reads healthy) | No error expected |
| Observer in annulus | Smoking hull 400u away, LOS clear, observer outside 330u sight | `sm` delivered; no contact, no blip unless swept | No error expected |
| Observer past reach | Smoking hull 500u away | No `sm` delivered | No error expected |
| Island between | Smoking hull 400u away, island on the segment | No `sm` delivered | No error expected |
| Own hull hurt | Observer's own hp in a band | `sm` delivered to self (dist 0 passes the halo trivially) | No error expected |
| Smoking drone | Drone hp in a band | `sm` emitted identically to a captain's | No error expected |
| Dead hull | `alive === false` | No `sm` emitted | No error expected |
| Heal above band | hp regens past 0.5 | Emission stops; already-spawned puffs decay out naturally (no strobe, no hysteresis constant needed) | No error expected |
| Spectator | `mode: 'spectator'` | All `sm` delivered, payload still `{k,x,y,tier}` — no id may appear on the spectator path either | No error expected |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- add `CONFIG.damageBands` (`amberBelow: 0.5`, `criticalBelow: 0.25`) as the ONE source; add `CONFIG.smoke.puffIntervalMs`. `CONFIG.vision.muzzleFlash` at :159 is the reach, reused.
- `shared/src/types.ts` -- new `SmokeEvent` interface + add `'sm'` to the `GameEvent` union (:672-686). Model the doc-comment on `MuzzleEvent` (:476-480), which is the neutral-payload precedent.
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 24 → 25 (:168).
- `server/src/game/signals.ts` -- new `woundedSmokeSignal` row modelled on `muzzleFlashSignal` (:825-840): same halo constant, same `losClear`, same fresh-bare-object materialize. Register it in `SIGNAL_REGISTRY` (:865-891).
- `server/src/game/world.ts` -- per-ship smoke emit timer + a `tickSmoke()` step after damage resolution, pushing to `tickEvents`. `emitMuzzleFlash` (:2305-2309) is the emission-site pattern.
- `server/src/__tests__/perception.test.ts` -- add `'sm'` to `EVENT_KINDS` (:1366), bump the registry count 19 → 20 (:1371), add an independent `sm` verifier to `EVENT_VERIFIERS` (:1148-1226).
- `server/src/__tests__/signals.test.ts` -- row unit tests; bump its registry count (:107).
- `client/src/config.ts` -- `CLIENT_CONFIG.vitals.amberBelow`/`criticalBelow` (:1014-1015) become references to `CONFIG.damageBands`; new `CLIENT_CONFIG.smoke` block (puff life, per-tier radius/alpha ramps, wind vector, global cap) modelled on `blip` (:1137-1219). `colors.woundedSmoke` (:53) already exists, unused.
- `client/src/render/smoke.ts` -- NEW. Pure decay/drift math + thin Pixi adapter. `render/phosphor.ts` (pure) + `render/radar.ts` (adapter, pooling, `capOldest`) are the twin models.
- `client/src/render/stage.ts` -- new `smoke` layer in `chartRoot` (fog-immune), placed between `litZone` and `mineChart` so blips/mines/reticle stay readable on top (:142-150).
- `client/src/net/roomBindings.ts` -- dispatch `sm` in `handleEvent` (:485-498); `handleMuzzle` (:528) is the pattern.
- `client/src/main.ts` -- drive `smoke.update()` from both the alive (:1688) and spectate (:2222) render paths, as `Effects` is.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- add `CONFIG.damageBands` (`amberBelow: 0.5`, `criticalBelow: 0.25`) + `CONFIG.smoke` (`puffIntervalMs: 250`) -- amendment 41 forbids a second set of band numbers existing anywhere.
- [ ] `shared/src/types.ts` -- add `SmokeEvent` + union member -- the wire contract; doc-comment must state the neutral-payload law verbatim as `MuzzleEvent` does.
- [ ] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 25 -- new wire signal.
- [ ] `shared/src/__tests__/` -- constraint test: smoke bands ARE the rail bands (one source), and smoke reach IS `CONFIG.vision.muzzleFlash` -- pins amendments 41-42 so a later retune can't silently fork them.
- [ ] `server/src/game/signals.ts` -- add the `sm` row + register it -- the perception boundary; fresh bare `{k,x,y,tier}` every time.
- [ ] `server/src/game/world.ts` -- emit `sm` on cadence for every alive hull inside a band -- keep `tickSmoke()` under complexity 10.
- [ ] `server/src/__tests__/perception.test.ts` -- `EVENT_KINDS` + count bump + independent `sm` verifier -- a row without its oracle is the failure mode the registry exists to prevent.
- [ ] `server/src/__tests__/signals.test.ts` -- row visibility/key-order tests + count bump.
- [ ] `server/src/__tests__/` (world) -- emission tests: band boundaries (exactly 0.5 = no smoke), cadence, tier selection, dead hulls silent, drones smoke.
- [ ] `client/src/config.ts` -- point vitals bands at `CONFIG.damageBands`; add the `smoke` block.
- [ ] `client/src/render/smoke.ts` -- NEW: pure puff math + Pixi adapter, global `capOldest` only.
- [ ] `client/src/render/stage.ts` -- new fog-immune `smoke` layer.
- [ ] `client/src/net/roomBindings.ts` -- dispatch `sm` → spawn puff.
- [ ] `client/src/main.ts` -- drive smoke from alive + spectate paths.
- [ ] `client/src/__tests__/smoke.test.ts` -- pure decay/drift/cap math + the motion contract (presence survives `off`).

**Acceptance Criteria:**
- Given a hull at 40% hp 400u away with clear LOS, when the observer is outside their 330u sight bubble, then a light plume renders at the hull's true position with no contact, no blip, and nothing identifying the hull.
- Given the same hull at 500u, or at 400u with an island on the segment, when frames are built, then no `sm` event reaches that observer.
- Given any observer and any smoking hull, when a frame is inspected, then no `sm` payload contains an id, hue, class, hp, or fraction — spectator frames included.
- Given a hull healing from 20% to 60%, when it crosses each band, then the plume steps heavy → light → none without strobing, and no hysteresis constant was introduced.
- Given `motion: 'off'`, when a smoking hull is in reach, then the plume is present at full extent and correct tier, with drift and billow removed.
- Given `npm run check`, when it runs, then lint, all three type-checks, and the full suite pass with the new tests included.

## Design Notes

**Why a pulse, not a contact-like channel.** Amendment 45 forbids any correlation handle on the wire, which rules out the `litzone`/`decoy` shape (those carry ids and are recomputed per tick). The shipped precedent for "server keeps no history, client synthesizes persistence" is the phosphor blip, and the precedent for a truly anonymous payload is `mz`'s fresh bare `{k,x,y}`. Smoke is both at once: a periodic anonymous pulse that the client accumulates. This also means the row needs no new `PerceptionView` field, no new scan function, and no new `FrameMsg` field — it rides `tickEvents` like every other pulse.

**Why the plume stays a column, with the arithmetic.** Puffs are emitted at the hull's position, so a moving ship necessarily leaves them behind; puff LIFETIME is the only thing separating amendment 43's attached plume from the track it explicitly rejected. The fastest hull in the game is the Torpedo Boat at `maxSpeed: 45` u/s (`constants.ts:50`), 55 u/s under boost, and it is ~100u long. **Starting values: `puffLifeMs: 1400`, `puffIntervalMs: 250`** — a 63u tail at full ahead (77u boosted), comfortably inside one hull length, with ~6 live puffs forming the column. That reads as smoke blowing off the stern, not a track to follow. Any later increase to `puffLifeMs` is a design change requiring a ruling, not a tuning call.

**Wind.** A single fixed drift vector in `CLIENT_CONFIG.smoke` — purely decorative, never gameplay-authoritative, so it stays client-side. Deriving a per-map wind from `welcome.mapSeed` was considered and deliberately not adopted: it adds a dependency for zero gameplay gain, and the ruling only asks that the plume drift.

**Why the bands move to shared CONFIG.** They become gameplay-authoritative the moment the server decides smoke from them, and CLAUDE.md's rule is to promote on exactly that event. Leaving `0.5`/`0.25` restated in `CLIENT_CONFIG.vitals` would create the second set of numbers amendment 41 forbids — the rail and the plume would drift apart on the next retune.

**Capping.** `radar.ts:208-210` caps per-track then globally; per-track is impossible here (no key), so only `capOldest` applies. Keep the global ceiling low enough that a full room of smoking hulls cannot outpace decay in a backgrounded tab — `effects.ts:239`'s `document.hidden` guard is the companion measure.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity violations (`tickSmoke` and the smoke renderer are the risk sites).
- `npm test -w shared` -- expected: pass, including the new band/reach constraint test.
- `npm test -w server` -- expected: pass, including the `sm` verifier and the registry-count gate at 20.
- `npm test -w client` -- expected: pass, including `smoke.test.ts`.
- `npm run check` -- expected: full green.
- `node server/scripts/weaponsSmoke.mjs` -- expected: unchanged pass; smoke must not perturb existing flows.

**Manual checks:**
- Confirm `git grep -n "0\.5\|0\.25" client/src/config.ts` shows the vitals bands as references, not literals — the single-source requirement is the one thing a passing test suite could still miss.

## Review Triage Log

**Pass 1 (2026-08-05, cycle 49) — Fable adversarial review + Codex cross-model check, run in parallel.**

Counts: `intent_gap` 0, `bad_spec` 0, `patch` 2 (1 low, 1 medium-downgraded-to-hygiene), `defer` 0, `reject` 0.
Verdict from the Fable gate: **build-on-it**. Zero model overlap — each reviewer found what the other missed,
which is the whole argument for running both.

- **CONFIRMED (Fable), low — puff deleted at birth under clock slew.** `puffAlpha()` returned exactly 0 for a
  non-positive age and `render()` retired on `alpha <= 0`, so a puff whose first render landed behind its own
  spawn timestamp was destroyed permanently — losing its entire 1400ms disclosure window, not one frame of it.
  Reachable in ordinary play: the server-clock estimator slews toward a rolling-min offset, so any transit-time
  improvement spawns puffs at negative age until it converges; a heavy plume degraded to its stagger-ghost.
  PATCHED: retire on AGE (`age >= life`), never on alpha, and clamp jitter-negative ages to exactly newborn.
  The clamp is deliberate and differs from `phosphor.ts`'s `blipAlpha`, which resolves the same condition to
  FULL brightness — a blip has no bloom-in ramp so newborn and full coincide for it, while for a puff they
  diverge, and resolving to full would put a discontinuity at the origin (bright pop, then near-zero 1ms later)
  precisely when the clock is already slewing. Regression test proven to fail under alpha-based retirement.
- **PLAUSIBLE (Codex), adjudicated NOT a shipped defect — `Smoke.clear()` had no call site.** Codex projected
  stale plumes rendering at pre-reset coordinates across a match restart. Verified against the code: match end
  always ends in `location.reload()` (`main.ts:1065-1069`), so no no-reload restart path exists today, and the
  1.4s tail after a respawn is legitimately-disclosed information decaying — which is what puff life IS.
  The dead method was the real finding. PATCHED as hygiene: wired into the return-to-port teardown so the API
  is live and a future no-reload restart cannot leak stale plumes.

Both reviewers independently cleared the load-bearing risks: no identity/hp leak through `sm` on any path
including spectators, band comparisons correct at both exact boundaries, `nextSmokeAt` reset on every
spawn/respawn/match-restart path, the blip dispatch refactor byte-identical, and the motion contract
structurally enforced (`puffAlpha`/`puffRadius` take no intensity argument, so `motion: 'off'` cannot dim or
shrink a plume). Fable additionally caught that the property-fuzz suite ran the new `sm` oracle **zero** times
before the wave-2 agent seeded two wounded hulls — a row whose oracle never executes is exactly the vacuity the
registry design exists to prevent; it now executes 102 times per run.
