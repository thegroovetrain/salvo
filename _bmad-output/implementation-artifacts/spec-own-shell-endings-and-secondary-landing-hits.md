---
title: 'Own shells always end on screen; secondaries hit only where they land'
type: 'feature'
created: '2026-11-13'
status: 'in-progress'
baseline_revision: 'ce2fe0f4a23b684ec908408a0bf87d21b9b6a4be'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: ['multiple-goals']
---

<intent-contract>

## Intent

**Problem:** Eric 2026-11-13, after playing 0.19.26: "I think Secondaries should also require aim like main guns. I saw a few main guns that I had aimed but missed just keep flying instead of splashing the water." (1) A firer's own shell whose end he is not sent (an island / high-ground stop, a map-edge end, an interception out of eye reach) is never removed from his screen: it dead-reckons on to full reach. (2) A secondary round damages the first hull on its path, so it needs no range aim.

**Approach:** (1) Eric: "go with fix 1" — the firer is always sent the terminal `boom` of his own gun shell, however it ended, so his screen ends the track there. (2) Eric: "correct read" — a secondary round follows the main battery's rule: it passes over every ship and beacon in flight and damages only a hull whose silhouette contains its landing point.

## Boundaries & Constraints

**Always:**
- Reproduce (1) with a headless probe against a real server before fixing, and name which termination paths lacked an owner-visible terminal event.
- The owner arm adds no information the owner does not already hold (he is already sent `sp` for every own miss and `hc` for every own hit): the boom's `hit` id stays stripped by the class-reach rule; the owner tag is server-internal and never on the wire; non-owners' rules are byte-for-byte unchanged; torpedoes are unchanged (the run-out rule stays as it is).
- The declared perception exceptions stay at SIX; extend the property-style invariant tests to cover the widened owner arm.
- Secondaries after the change: full `CONFIG.secondaries.damage` to every afloat non-owner hull whose silhouette contains the landing point (the main battery's landing rule, same code path); a beacon by its body, as the main battery; a mine exactly as today (only where the round lands); islands exactly as today (lowest band cleared, high ground stops it, a landing on land does nothing); no friendly fire; dispersion unchanged.
- Placeholders `<VERSION>`, `<CYCLE>`, `<AMENDMENT>`, `<PV>` in comments and records; the orchestrator fills them at PR time.

**Block If:** the fix would need a seventh perception exception, a new wire field or event kind, new HUD art or copy, or any bot rule beyond following the new hit rule.

**Never:** change any damage, reach, rate, heat or dispersion number; change the main battery's rule; touch `CONFIG.bots` values; pin Eric's numbers in a test; edit `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own shell stopped by high ground out of eye reach | main shell, terrain stop | owner's frame carries that shell's `boom` (no `hit`); a non-owner out of reach gets nothing | none |
| Own shell hits a hull beyond class reach | landing in a plain / unseen hull | owner gets the `boom` with `hit` stripped | none |
| Secondary round, hull on the path, landing beyond it | aim past a ship | the round passes over; no damage | none |
| Secondary round lands inside a hull | aim on a ship | full damage to that hull | none |
| Secondary round lands on a mine's marker | as today | mine takes the round's damage | none |

</intent-contract>

## Code Map

- `server/src/game/world.ts` -- `resolveShell`, `missBoom`, `announceLanding`, `resolveBurst`, `emitSplash` (~l.6380–6830): where a shell ends and which event it emits
- `server/src/game/signals.ts` -- `BoomSubject.land`, `boomSignal` (~l.1690–1790): the owner arm today covers only main-battery landings
- `server/src/game/equipment/secondaries.ts`, `equipment/ballistics.ts` -- the secondary round's flight; the main battery's `overShips` flight to copy
- `shared/src/sim/shell.ts` -- `overShips` / `overLand` / `terrainStop` flags
- `client/src/render/projectiles.ts` -- track removal on `boom`; `trackExpiresAt` fallback (header comment is now stale)
- `server/src/game/ai/battery.ts` -- bot secondaries aim (must still aim at the hull)
- Tests: `server/src/__tests__/{perception,frames,goldenFrames,mainBattery,mineHp,beaconDamage,botGunnery,botSweep}.test.ts`, `server/scripts/weaponsSmoke.mjs`

## Tasks & Acceptance

**Execution:**
- [x] probe (throwaway, deleted after) -- reproduce a main shell whose owner never receives its terminal `boom`; record which paths -- root cause before fix
- [x] `server/src/game/world.ts`, `server/src/game/signals.ts` -- every gun-shell (`kind === 'shell'`) terminal boom carries the server-internal owner tag and the boom row shows it to that owner; wire shape unchanged -- fix 1
- [x] `server/src/game/equipment/secondaries.ts` (+ shared flags as needed) -- the secondary round flies over ships and resolves at its landing by the main battery's landing rule -- the ruled hit rule
- [x] `client/src/render/projectiles.ts` -- comments follow; keep the lifetime backstop as a leak guard -- truthful docs
- [x] bots, smokes, tests -- follow the new rule; perception invariants extended; golden frames re-recorded only if they differ -- coverage
- [x] `_bmad-output/implementation-artifacts/epic-11-context-amendments.md` -- append amendment `<AMENDMENT>` with Eric's quotes above, the root cause found, both rules, and the hit-chance consequence (secondaries at 95 hm, broadside target: about 85 % -> about 59 %; end-on about 100 %) -- durable home

**Acceptance Criteria:**
- Given any own gun shell that has ended, when the owner's next frame is built, then it contains a `boom` with that shell's id, with no `hit` unless the victim is class-sighted.
- Given the same end out of a non-owner's reach, then that observer's frame is unchanged from today.
- Given a held secondary stream aimed beyond a hull standing on the line of fire, then the hull loses no hp; aimed on the hull, it does.
- Given `npm run check`, then everything passes; `matchSmoke.mjs` and `weaponsSmoke.mjs` pass first try.

## Spec Change Log

- 2026-11-13, review-gate fix pass: the client never draws or sounds an own hit as a miss (a hit-less own boom at a same-frame `hc` point gets the spark and the Hit Call tone only; the track still retires by the boom's id — main battery too); the secondaries' landing blow keeps the `'shell'` damage source (hull and beacon), the main battery's stays `'burst'`. Intent unchanged.

## Review Triage Log

- 2026-11-13, review gate (two Fable hunters: build on it; Codex: fix first). Fixed: (A) a hit shown as a miss splash + splash cue when the boom's `hit` was stripped (client, `roomBindings.ts`, with a contract test proven to fail without the fix); (B) the secondaries' damage-source label (`world.ts` `landingSource`; `beaconDamage.test.ts` restored to `'shell'`; a source test in `arcingFlight.test.ts`); (C) `weaponsSmoke.mjs` halved `dispersionAxes` semi-axes again in the secondaries and main-battery-direct phases; (D) the perception owner-arm justification now reads `sp` / `hc` off the observer's own frame; (E) the batch-sim mines-swept readout credits a secondary round's `hc` landing (direct shells still excluded).

## Verification

**Commands:**
- `npm run build -w shared && npm run check` -- expected: all green
- `node server/scripts/matchSmoke.mjs` (self-boots) and `weaponsSmoke.mjs` (own server from `server/`, `HC_DEV_OPTIONS=1 PORT=<p>`, `WS_URL=ws://localhost:<p>`) -- expected: OK first try
- `HC_DEV_OPTIONS=1 node server/scripts/tickCost.mjs` -- expected: 16-hull tick no worse than 2.8 ms mean
