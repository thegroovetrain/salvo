---
title: 'Story 9.5: Ramming and Contact Damage'
type: 'feature'
created: '2026-10-12'
status: 'in-progress'
baseline_revision: '79a2bfdf'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-4-fouling-shell.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Hulls pass through each other, and touching land only caps speed. Eric (2026-10-11): *"I would like to add RAMMING and contact hull damage into the game, creating an incentive to stay away from other ships and avoid running aground."* — *"flat out ramming an enemy ship at full speed is a last ditch effort to sink it, while grinding up against another ship could deal lesser damage over the duration of contact."*

**Approach:** Hulls become SOLID: a pure shared resolver pushes overlapping hull polygons apart, split by mass (the heavier hull moves less), in a new `STEP_ORDER` row and in the client predictor against the contacts it can see. Contact damage follows the energy law of record (amendment 25): a one-time HIT on the closing (normal) speed when it exceeds an allowance, a per-second GRIND on the sliding (tangential) speed while pressed together, land as infinite mass times a softness factor (the quarter-speed land cap stays). Mass is `effectiveStats().maxHp`. All damage goes through `applyDamage` as source `'contact'`, floored to whole hp. Bots and drones avoid hulls; bots gain a `ram` posture with a conservative `[DRAFT]` trigger. The harness reports contact deaths, groundings and land damage. Cycle 182, `0.18.47`, `PROTOCOL_VERSION` 78 → 79.

## Boundaries & Constraints

**Always:**
- **Rulings of record — Eric 2026-10-12 at this spec step (AskUserQuestion; recorded as epic-9 amendments 73–82):**
  - (73) **Dials as accepted:** `CONFIG.ram = { energyPerHp: 1266, grindPerUnit: 0.222, allowanceU: 5, landSoftness: 0.25 }`. Told the outcomes in plain words: full speed head-on before upgrades, speedboat vs speedboat costs each 200; speedboat vs dreadnought 215 / 153; dreadnought vs dreadnought 169 each; a boosted speedboat into a stopped dreadnought 106 / 76; a speedboat into a stopped speedboat 50 each; grinding at 45 u/s past a stopped hull 5 hp/s each; land head-on at full speed speedboat 50, repeater 47, dreadnought 42 (boosted speedboat 78); the land grind at the quarter-speed cap is under 1 hp/s. Told that mass = effective max hull makes a tier-V HULL POINTS speedboat (500 hp after 9.6) mass like two dreadnoughts. Every number is a harness dial (`--tune ram.*`). Rejected: harsher land; softer hull hits.
  - (74) **The predictor pushes against sighted contacts:** the own hull is pushed apart from the contact poses the client holds (interpolated 100 ms behind, sighted only); the server stays authoritative and the reconcile corrects rim disagreements. Rejected: server-only with a reconcile snap.
  - (75) **DAMAGE CUT and SHIELD BLOCK apply to contact damage like any damage.** One damage path, no exception. Rejected: contact bypasses both; cut yes shield no.
  - (76) **The kill feed keeps today's lines:** a ram or grind kill reads `X SUNK BY Y`, a grounding death reads `X LOST WITH ALL HANDS`; no cause on the wire, no new copy. Rejected: `RAMMED`; `RAMMED` + `RAN AGROUND`.
  - (77) **The bot `ram` disposition ships LIVE with a conservative `[DRAFT]` trigger:** a bot rams only when it is already below its profile's disengage hp fraction AND the predicted hit at its current closing speed would sink the target by the bot's own damage estimate of that track. Rejected: row exists but disabled; live and eager.
  - (78) **PvE drones get avoidance only:** they steer clear of hulls; they never choose to ram. Rejected: drones ram.
  - (79) **The contact hit visual is judged on staging:** the existing shake and damage sound, plus a brief impact spark in both hulls' colors at the contact point and a short grinding sound while pressed together, built as client feel knobs; Eric looks on the development deploy. Rejected: a rendered page first; shake and sound only.
  - (80) **No harness run this cycle; readouts only.** Rejected: one 91-match readout.
  - (81) **Land: hit AND grind, as the model.** Every fresh strike costs by the closing speed; scraping bleeds the formula's trickle (fractions accumulate and apply as whole hp); a hull parked against land takes nothing. Rejected: hit only; a flat scrape rate.
  - (82) **A sinking wreck is SOLID and the live hull still pays:** you cannot sail through a wreck; the live hull takes its share of the hit and grind, the wreck takes nothing (the damage path already refuses a sinking victim). Rejected: solid with no damage either way; not solid.
- **Model of record (amendment 25), as built:** for a pair A/B with masses `mA = A.stats.maxHp`, `mB = B.stats.maxHp` (a drone's envelope hp; a wreck keeps its maxHp), contact normal `n` (from B toward A), relative velocity `v = vA − vB` with each hull's velocity `speed × (cos heading, sin heading)`: `v_n = max(0, −v·n)` (closing), `v_t = |v × n|`. HIT once per contact when `v_n > allowanceU`: `E = ½·μ·v_n²`, `μ = mA·mB/(mA+mB)`; A takes `floor(E · mB/(mA+mB) / energyPerHp)`, B takes `floor(E · mA/(mA+mB) / energyPerHp)`. GRIND per tick while overlapping: A accrues `grindPerUnit · v_t · mB/(mA+mB) · dt`, B the mirror; each hull's accrued fraction is a server-only pool, and whole hp is applied as it accumulates (`floor(pool)`, remainder kept). LAND: `mB → ∞` so `μ → mA` and the share → 1, times `landSoftness`: strike hit `floor(½·mA·v_n²/energyPerHp · landSoftness)` on the tick `landContact` turns true with `v_n = |speed before the damp| × headOn`; land grind per tick `grindPerUnit · v_t · landSoftness · dt` with `v_t = |speed| × √(1 − headOn²)` while `landContact` holds. The quarter-speed cap (`applyGroundingDamp`) is untouched. Damage is whole hp everywhere (Eric's integer-damage rule).
- **Once per contact:** a hull-pair HIT fires on the first tick the pair overlaps; the pair is latched (server-private `Set` keyed by the sorted id pair) until a tick in which it does not overlap, then re-arms. A land HIT fires on the `landContact` false → true edge only. A strike under the allowance arms the latch without damage (no free repeat hits from a slow nudge).
- **Solidity (push-apart):** NEW `shared/src/sim/contact.ts`, pure, zero I/O, no transcendentals beyond what `collision.ts` already uses. `resolveHullContacts(bodies, dt)` over `ContactBody { id, state: ShipState, poly: Vec2[] (world), mass, movable }`: for every overlapping pair the minimum push that separates them (reuse `collision.ts`'s polygon push-out core — extract `pushOutOf` / `escapeAim` / `hullOverlapsIsland` over a `Solid { x, y, r, poly }` that `Island` satisfies structurally; never a second geometry implementation) is split `A moves mB/(mA+mB)`, `B moves mA/(mA+mB)`; an immovable body (`movable: false`) takes none and the other takes all. Returns one `HullContact { a, b, nx, ny, vn, vt }` per overlapping pair. Broadphase on bounding circles (`polygonMaxRadius`) before any edge test. Both sides call this one function.
- **STEP_ORDER:** a new row `resolveHullContacts` BEFORE `resolveCollisions` (hull pass, then the land pass, so the land no-escape invariant stays strict and a hull pushed toward a coast resolves against it the same tick). The row also records the tick's contacts for the damage row. A new row `applyContactDamage` AFTER `resolveCollisions` and BEFORE `sampleWakes`: hull-pair hits and grinds through `hitShip(victim, amount, otherId, false, 'contact')` (aggro: a drone rammed or scraped by a captain acquires it, like a shell), land hits and grinds through `applyDamage(ship, amount, 'contact', undefined)` (no credit, a `dmg` event, no feed cause — amendment 76). `DamageSource` `'contact'` is reused; its doc line is re-cut (it was declared as the decoy-contact seat and never used). `stepOrder.test.ts` re-pins the sequence. Afloat and sinking hulls are bodies; a sinking hull is `movable` and takes no damage (amendment 82 — `applyDamage`'s sinking guard is the refusal; the live hull pays). Respawned / off-water hulls are not bodies.
- **Credit:** a hit or grind with `byId` credits damage and, on a sink, the kill through the existing `creditDamage` / `sinkShip(id, by)` (XP by damage dealt, the kill, the bounty; a mutual ram credits both, which `sinkShip` already allows). A grounding sink has no killer.
- **Wire:** NOTHING spatial is added. `dmg` stays victim-private; no new event; no `OwnShip` field. The SIX perception exceptions are untouched; the invariant suites are unchanged in intent. `PROTOCOL_VERSION` 78 → 79 because the client now READS `CONFIG.ram` and runs the contact resolver in prediction (same-seed sims differ at the hull-contact seam); history line in `shared/src/index.ts`.
- **Client (amendment 74):** `Predictor` gains `setContacts(bodies: readonly ContactBody[])` fed every render frame from the interpolated contact list (`g.contacts` sampled at `serverNow − interpDelayMs`, the same poses the renderer draws) with `poly = transformPolygon(hullSilhouette(cls), …)`, `mass = CONFIG.shipClasses[cls].hp` or the drone envelope hp (the client cannot know a contact's upgrades; the reconcile covers the share error), `movable: true`; the own body uses `effectiveStats().maxHp` from `you`. `predict` and the reconcile replay run `resolveHullContacts` on the own body + contacts BEFORE `resolveCollisions`, mirroring the server order; only the own body's result is applied. The resolver's `HullContact` rows for the own hull drive the legibility layer: `render/contactFx.ts` (NEW) spawns a brief spark burst at the contact point in the own hull's color and the other hull's roster color (land strike: own color + the island grey) when `vn > CONFIG.ram.allowanceU`, and a `grind` audio loop (`audio/tones.ts`, procedural like the rest) plays while a contact with `vt` above `CLIENT_CONFIG.contactFx.grindMinVt` persists; knobs in `CLIENT_CONFIG.contactFx = { sparkCount, sparkLifeMs, sparkSpeedU, grindMinVt, grindGainMax }` (feel; Eric may re-tune on staging). The shake and `damage` sound keep firing off the server `dmg` event. No HUD readout, no tell, no copy.
- **Bots (`server/src/game/ai/`, amendments 26, 77):** `avoidHulls(self, mind)` sums `pointBias` over every LIVE remembered contact (position known, not the ram target) with `HULL_LOOKAHEAD` = `CONFIG.bots.hullLookaheadU` (NEW, 150 u — the island lookahead plus a hull length, `[DRAFT]`), composed into `helmFor`'s `avoid` sum beside islands, mines and the boundary. NEW posture `'ram'` on `BotPosture`: chosen in `choosePosture` when (a) `self.hp / self.stats.maxHp < profile.disengageHpFrac`, (b) the target is a live sighted contact with a known class within `CONFIG.bots.ramReachU` (NEW, 400 u, `[DRAFT]`), and (c) the hit the bot would land at its CURRENT closing speed (shared `contactHitDamage(mA, mB, vn, cfg)`, mB = the target's class base hp) ≥ the target's remaining hp by the bot's own `damageEstimate(track)` (`ai/utility.ts`); the trigger comment carries `[DRAFT]` and names the two knobs. Under `'ram'`: full throttle, bearing = the lead intercept of the target plot (`plotAt`), hull avoidance skips the target only, island / mine / boundary avoidance stay live; the posture is re-chosen on the decision cadence like any other and drops when the target is gone. The `ram` row is listed in the doctrine table (`doctrines.test.ts` pins postures). Every profile gets it; no per-profile knob.
- **Drones (`server/src/game/drones.ts`, amendment 78):** `avoidHulls(ship)` over `world.ships` (afloat, not self, within the lookahead) with the same `pointBias` kernel and `CONFIG.bots.hullLookaheadU`, summed into the rudder beside `avoidIslands` and `boundaryBias`. Nothing else changes for drones: they are rammable, they pay like any hull, they never ram.
- **Harness (`server/scripts/batchsim/`):** `ShipRecord` gains server-only `lastDamageSrc: DamageSource | null` (written by `applyDamage` when `dealt > 0`), `contactDamageTaken` and `landDamageTaken` (whole hp, accumulated in `applyDamage` for `'contact'` by `byId` defined / undefined). `BotEnd` gains `'sunkByContact'` (killer defined, `lastDamageSrc === 'contact'`) and `'ranAground'` (no killer, `lastDamageSrc === 'contact'`); `endCause` reads the victim's record. `BotAggregate` gains `contactDeaths`, `groundingDeaths`, `landDamage` (sum) and `landDamagePerBotMatch` (mean); the deaths line reads `… + N by ramming + N aground + N by storm`; a new line `land-contact damage: total N hp, mean N hp per bot-match (land-contact rate P %)` sits beside the land-contact rate so the deferred 7.3 % grounding thread (amendment 14) has its cost readout. `--tune ram.*` family added (floor 1 on `energyPerHp`; `allowanceU` and `landSoftness` floor 0). No run is launched (amendment 80).
- **Tests are contracts** (epic-8 amendment 243; epic-9 amendment 8): the shared resolver's contract (overlap-free after the pass, the mass split, the immovable body, no teleport, symmetry), the damage formulas reproducing Eric's two calibration sentences FROM THE DIALS (speedboat head-on speedboat at 90 u/s closing costs each 200; a speedboat scraping a stopped speedboat at 45 u/s costs each 5 hp/s) and the land softness, the once-per-contact latch and its re-arm, the fractional grind pool, the land-edge hit, the wreck rule, drones rammed and credited, damage cut and shield applied, the allowance, the mutual kill, the STEP_ORDER pin, the bot avoidance term and the ram trigger (fires in the ruled state, holds otherwise), the drone term, the harness readouts, the predictor's contact push and its order, the contactFx trigger. No vocabulary pins, no ring/geometry pins, no wall-clock pins.
- **Records:** `VERSION` + root `package.json` + `package-lock.json` → `0.18.47`; `CHANGELOG.md` cycle 182; `epics.md` 9.5 stamp; both trackers one-line stamps; epic-9 amendments 73–82 (rulings) + 83 (implementer readings) in BOTH homes (`epic-9-context-amendments.md`, `epic-9-context.md` § Ratified Amendments); `deferred-work.md` gets review-gate defers only. How-to-Play copy stays frozen until 9.11 (amendment 36); the ramming entry is 9.11's. `DESIGN.md` only if a statement there becomes false (none expected).
- **Process:** orchestrate skill routing — shared wave Opus; server wave Fable (sim seam, damage chokepoint, STEP_ORDER, perception-adjacent); client wave Opus; records Sonnet; review gate Blind Hunter + Edge Case Hunter on Fable plus Codex `gpt-5.6-sol` on the same diff. Commit and push the branch after each verified wave; ONE PR to `development` at the end, never merged by the agent. American spelling throughout.

**Block If:**
- Any reading here contradicts a numbered epic-9 amendment or a CLAUDE.md invariant.
- A wire shape beyond `PROTOCOL_VERSION` turns out to be needed (a new event or `OwnShip` field) — amendment 76 ruled none.
- The polygon push-out core cannot be shared between island and hull without a second geometry implementation.

**Never:**
- No new perception exception; nothing about a hull outside sight ∪ this-tick radar reaches a client through this story (the contact push uses only contacts the client already holds).
- No damage outside `applyDamage`; no second hp write; no ad-hoc mass derivation (mass is `stats.maxHp` from `effectiveStats()`).
- No new kill-feed cause, HUD readout, tell, card or How-to-Play copy.
- No harness run; no batch sim.
- Never describe pre-start-phase behavior as a risk or a question (amendment 71): the `damageEnabled` gate inside `applyDamage` is simply reused.
- Buoys, mines, torpedoes, shells and clouds are not bodies; mines and buoys are not rammable.
- Spectators, dead hulls and respawn-pending hulls are not bodies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Head-on ram, equal hulls | two speedboats (250 hp) closing at 90 u/s, first overlapping tick | each takes 200 (post cut/shield); both pushed apart half the overlap each; pair latched | — |
| Unequal masses | speedboat (250) into dreadnought (350) closing 80 u/s | speedboat 215, dreadnought 153; speedboat moves 350/600 of the overlap, dreadnought 250/600 | — |
| Under the allowance | closing 4 u/s | no hit; pair latched; grind applies by `v_t` only | — |
| Grind | speedboat scraping a stopped speedboat at 45 u/s tangential | each accrues 5 hp/s; whole hp applied as the pool crosses integers; `dmg` per applied hp batch | — |
| Separation and return | pair overlaps, separates one tick, overlaps again at closing 60 u/s | second hit fires (latch re-armed) | — |
| Land strike | speedboat at 45 u/s dead-on into a coast (`headOn` 1) | 50 hp on the `landContact` edge; no credit; `dmg` emitted; speed capped as today | — |
| Land scrape | hull sliding along a coast at the land cap | `0.222 × v_t × 0.25` hp/s accrues; whole hp applied as it accumulates; a parked hull (speed 0) takes nothing | — |
| Wreck | live hull rams a sinking hull | wreck pushed and unharmed; live hull takes its share; no credit to the wreck's captain for a sink it did not cause | — |
| Drone | captain rams a 60-hp drone at 80 u/s closing | drone takes its share and dies; captain takes ~23; `pveKills` credit; the drone aggroes its rammer first | — |
| Shield / cut | victim shielded or with DAMAGE CUT up | contact amount cut then absorbed exactly as a shell | — |
| Damage off | `damageEnabled` false | push-apart still runs; no hp moves (the gate inside `applyDamage`) | — |
| Mutual kill | both hulls at low hp, head-on | both sink; each credits the other (`sinkShip` allows a dead killer) | — |
| Client predictor | own hull overlaps a held contact in `predict` | own hull pushed by its mass share using base class hp for the contact; a server frame reconciles the difference under `HARD_SNAP_U` | — |
| Client spark | predictor reports an own contact with `vn > allowanceU` | spark burst at the contact point in both colors; land strike in own color + island grey | — |
| Bot ram trigger | bot hp below its disengage fraction, target sighted within reach, predicted hit ≥ estimated remaining hp | posture `ram`: full throttle on the lead intercept, hull avoidance skips the target | — |
| Bot avoidance | a live contact dead ahead within `hullLookaheadU` | rudder bias away, same sign law as islands | — |
| Harness | a bot sunk by a ram; a bot sunk by grounding | `sunkByContact` / `ranAground` in the deaths line; `landDamage` totals | — |
| `--tune ram.energyPerHp=0` | zero divisor | refused by the floor of 1 | error at parse |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- NEW `CONFIG.ram` block (doc cites amendments 25, 73, 81, 82); `CONFIG.bots.hullLookaheadU`, `CONFIG.bots.ramReachU` (`[DRAFT]`)
- `shared/src/sim/contact.ts` (NEW) -- `ContactBody`, `HullContact`, `resolveHullContacts(bodies, dt)`, `contactHitDamage(mA, mB, vn, cfg)` → `{ a, b }`, `contactGrindRate(mA, mB, vt, cfg)`, `landHitDamage(m, vn, cfg)`, `landGrindRate(vt, cfg)`
- `shared/src/sim/collision.ts` -- extract the polygon push-out core over a `Solid { x, y, r, poly }` (Island satisfies it); export for `contact.ts`; island behavior byte-identical (the suite pins it)
- `shared/src/sim/silhouette.ts` -- `polygonMaxRadius`, `transformPolygon` reused; no change expected
- `shared/src/index.ts` -- barrel exports; `PROTOCOL_VERSION` 79 + history line
- `server/src/game/world.ts` -- `ShipRecord.lastDamageSrc / contactDamageTaken / landDamageTaken`, `contactLatch: Set<string>`, `grindPool`, `landGrindPool`, `landWasContact`, `preDampSpeed`; rows `resolveHullContacts` (before `resolveCollisions`) and `applyContactDamage` (after it, before `sampleWakes`); `DamageSource` doc re-cut; `applyDamage` stamps the src and the two counters; life-boundary resets of the new fields (addShip / sink / founder / respawn / redeploy)
- `server/src/game/drones.ts` -- `avoidHulls(ship)` beside `avoidIslands`
- `server/src/game/ai/tactics.ts` -- `avoidHulls(self, mind)` in `helmFor`; `'ram'` helm (full throttle, lead intercept, target excluded from avoidance)
- `server/src/game/ai/utility.ts` -- `choosePosture` gains the `ram` trigger (`[DRAFT]`); `damageEstimate` reused
- `server/src/game/ai/types.ts` -- `BotPosture` + `'ram'`
- `server/scripts/batchsim/{botMetrics,botReport,overrides}.ts` -- `BotEnd` values, aggregates, report lines, `ram.` family + floors
- `client/src/sim/prediction.ts` -- `setContacts`, contact pass before `resolveCollisions` in `predict` and the replay, `ownContacts` for the fx layer
- `client/src/main.ts` -- feed the interpolated contacts to the predictor each frame; wire `contactFx`
- `client/src/render/contactFx.ts` (NEW), `client/src/audio/tones.ts` (`grind`), `client/src/config.ts` (`contactFx` knobs)
- Tests: shared `__tests__/contact.test.ts` (NEW), `collision.test.ts` (unchanged pins green), `barrel.test.ts`; server `__tests__/contactDamage.test.ts` (NEW), `stepOrder.test.ts`, `damageGate.test.ts`, `botTactics.test.ts` / `botPolicy.test.ts` / `doctrines.test.ts`, `drones` tests, `scripts/batchsim/__tests__/batchSim.test.ts`, perception / frames / goldenFrames (expected unchanged; re-record ONLY if a golden scenario has overlapping hulls, and note the diff here); client `__tests__/prediction.test.ts`, `contactFx.test.ts` (NEW), `tones.test.ts`
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md,deferred-work.md}`, `_bmad-output/planning-artifacts/epics.md` (9.5 stamp)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [ ] `shared/src/constants.ts`, `shared/src/sim/{contact,collision}.ts`, `shared/src/index.ts` -- `CONFIG.ram` + bot knobs, the pure resolver and the damage math, the extracted push-out core, barrel + PV 79 -- the one source both sides run
- [ ] `shared/src/__tests__/contact.test.ts` + existing suites -- resolver contract, calibration sentences from the dials, land softness, allowance; `npm test -w shared`, `npm run build -w shared`

**Execution (wave 2 — server Fable and client Opus in parallel, shared frozen):**
- [ ] `server/src/game/world.ts`, `drones.ts`, `ai/{tactics,utility,types}.ts`, `scripts/batchsim/{botMetrics,botReport,overrides}.ts` -- the two rows, latch + pools, damage through the gate, credit, record fields, avoidance for bots and drones, the `ram` posture, harness readouts and the `ram.` family
- [ ] `server/src/__tests__/*` + `scripts/batchsim/__tests__/*` -- every matrix row that is server-side, stepOrder re-pin, bot/drone/harness contracts; `npm test -w server`
- [ ] `client/src/sim/prediction.ts`, `main.ts`, `render/contactFx.ts`, `audio/tones.ts`, `config.ts` -- contact push in prediction and replay, the spark + grind feel layer
- [ ] `client/src/__tests__/*` -- predictor contact push and order, contactFx trigger, tone; `npm test -w client`

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; triage per the orchestrate skill; regression tests that fail without each patch.

**Execution (wave 3 — record, Sonnet):**
- [ ] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md`, both trackers, amendments 73–83 in BOTH homes, `deferred-work.md` (review defers only) -- 0.18.47 / cycle 182 / PV 79
- [ ] `npm run check` green; results recorded under Verification; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given two overlapping hull bodies of masses 250 and 350, when `resolveHullContacts` runs, then the pass ends overlap-free, the lighter body moved 350/600 of the separation and the heavier 250/600, an immovable body did not move, and no body moved farther than the overlap depth plus the tick's travel.
- Given `CONFIG.ram` as shipped, when `contactHitDamage(250, 250, 90)` and `contactGrindRate(250, 250, 45)` are read, then they return 200 / 200 and 5 / 5 per second; `landHitDamage(250, 45)` returns 50.
- Given a seeded server world with two hulls driven head-on at 90 u/s closing, when they first overlap, then each loses exactly 200 (no cut, no shield), one `dmg` per victim, the pair is latched, the next tick deals no hit, and after one separated tick a second overlap at closing speed above the allowance hits again.
- Given a hull driven dead-on into a coast at 45 u/s, when `landContact` turns true, then it loses 50 with no killer and the quarter-speed cap still applies; while it scrapes along the coast its land pool accrues at `0.222 × v_t × 0.25` per second and whole hp is applied as the pool crosses integers.
- Given the perception fuzz and the frame invariant suites, when the story lands, then every suite passes unchanged and the exception count is six.
- Given a bot below its disengage fraction with a sighted target whose estimated remaining hp is at or under the bot's predicted hit, when it deliberates, then its posture is `ram`; given the same bot with a healthy target, then it is not.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 79.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the hull pass runs before the land pass:** the land resolver's no-escape invariant (every tick ends with no hull inside land) is pinned and strict; putting hulls first lets a hull that was pushed toward a coast resolve against the coast in the same tick, so land stays the hard constraint and hull overlap is the soft one (two hulls both pushed off the same coast may touch again for a tick, which is harmless and re-resolves next tick).
- **Why the client's contact mass is the class base hp:** a contact's upgrades are private; the only thing the share error changes is how far the own hull is pushed on the client for a tick or two before the authoritative frame arrives, and that error is bounded by the overlap depth, far under `HARD_SNAP_U`.
- **Why there is no new wire event for the spark:** the client already knows when its own hull touches something — the predictor's resolver reports it — and the server's `dmg` already carries the cost; a server-stamped contact event would add a seventh-exception question for nothing.
- **Why `lastDamageSrc` is server-only:** the harness runs the `World` in-process and reads records; the feed keeps today's lines (amendment 76), so no cause rides the wire.
- **Calibration of the dials (for the doc block, never derived in the literal):** `energyPerHp` from "speedboat head-on speedboat at 90 u/s costs each 200": μ = 125, E = ½·125·90² = 506,250, share ½ → 253,125 / 200 = 1265.6 ≈ 1266. `grindPerUnit` from "speedboat scraping a stopped speedboat at 45 costs each 5/s": 5 = g·45·½ → g = 0.222.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean (before server/client tests)
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green; counts recorded in CHANGELOG
- `grep -n "'contact'" server/src/game/world.ts` -- expected: the DamageSource doc names ramming / grinding / land, and every contact damage call sits inside `applyContactDamage`

**Manual checks:**
- Eric judges the spark, the grind sound and the feel of solid hulls on staging after the PR (amendment 79).
