---
title: 'The Mine Layer hangs back and prepares — posture, payoff cards, and pre-positioned traps'
type: 'feature'
created: '2026-08-20'
status: 'done'
review_loop_iteration: 1
final_revision: 'pending-codex'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/bot-evidence-2026-08-20.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Cycle 110's blind-vacuum A/B showed the Mine Layer's bots build and sail it **worse than chance** — 4/30 wins under `forager`/`trapper` against 12/30 under random picks. The cause is SURVIVAL, not target choice: the weighted ML lives **181.1s** against the random ML's **264.0s**, fitting 1.97 boons against 2.96. Eric's playtest names the class exactly — *"hang back and be safe/strategic… it wants certain things, and when it gets them it is a powerhouse, it just needs to survive until then"* — and neither ML profile actually hangs back (`forager` 0.20–0.45R, `trapper` 0.12–0.35R, the closest band of any profile in the game). Two of the cards Eric calls *"REALLY powerful"* are mispriced: cycle 110 demoted `forager.mineCaptive` to near-junk on a farming argument, and `buoyGun` is named by **neither** ML table.

**Approach:** Three coupled moves, all BOT POLICY — no hull, catalog or combat constant moves. (1) Re-band both ML profiles OUTWARD and make them break off and heal sooner, so they live long enough to reach their payoff. (2) Re-price the payoff cards they were never buying. (3) Teach the mine to be laid **prepared** — seeded while safe, so the trap is already in the water when it is needed — gated on the bot's own live-mine count, which also closes a shipped field-churn defect.

## Boundaries & Constraints

**Always:**
- `ai/` may import ONLY `@salvo/shared`, `../inputs.js`, `../participants.js`, `../signals.js` (types), `import type` from `../perception.js`, and siblings. `world.js` banned including type imports; the token `observeSpectator` may not appear under `ai/` (pinned `bots.test.ts:269-300`).
- A bot's world knowledge stays `perception.observe()` + its own ship record. Own live mines/buoys are read from `mind.view.mines` / `.buoys` via the `own` flag — the SAME data a client receives. No new port members.
- Bands stay fractions of the bot's own `stats.radarRange`. No literal ranges in `profiles.ts`.
- THE TWO AXES STAY SEPARATED (epic-7 amendment 29): weapon geometry, arcs, placement and doctrine handling live ONLY in `EQUIPMENT_TACTICS`; the ship profile may express appetite, targeting, band, posture and nothing else.
- A DOCTRINE MAY ADD AN OCCASION, NEVER SILENTLY REMOVE ONE — the rule five defects produced last cycle. A prepared lay must ADD to the reactive lays, never replace one.
- No rng in any `want()`. Determinism pin `botTactics.test.ts` must stay green.
- Every per-line key in `CONFIG.bots.boonWeights` must name a real catalog line (pinned `botPolicy.test.ts`).
- Cyclomatic complexity ≤ 10 (ESLint error).

**Block If:**
- A change would require moving a hull stat, a card magnitude, or any `CONFIG` combat constant. Eric: *"A lot of this is what the balance pass is going to be for! But it still needs to play intelligently."* This cycle is the INTELLIGENCE half only.
- Prepared laying cannot be bounded by the bot's own live-mine count (i.e. `MineView.own` turns out not to be readable) — without that bound it churns its own field and must not ship.

**Never:**
- Do NOT bump `PROTOCOL_VERSION` (stays 43).
- Do NOT touch `client/`, the four non-ML profiles, or `CONFIG.bots.profiles`.
- Do NOT re-tune the test-only random-spend rows — they are the measuring instrument and must not move, or the A/B stops being comparable to cycle 110's.
- Do NOT widen `BotWorldPort`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| forager at reach | fleet target at 400u (inside new 0.45–0.80 band) | Holds the band and farms; does not close to 132u as before | Target outside band.max → close normally |
| forager hurt | hp/maxHp < 0.55 | Disengages — the earliest break-off of any profile | Already disengaging → unchanged |
| ML banked level, hurt | hp/maxHp < 0.60 | Takes DAMAGE CONTROL over a card (bulwark precedent) | Above 0.60 → builds |
| forager offered CAPTIVE | `mineCaptive` in offer | Wanted line again — it is a survival/payoff tool, not a farming tool | Already held → held-line demotion (copies 1) |
| Either ML offered GUN BUOY | `buoyGun` in offer | Explicitly wanted; no longer falls through to a bare category weight | — |
| Prepared lay, field thin | captive held, no target, safe posture, own live mines < reserve | Lays astern — the trap is seeded before it is needed | Blocked water → no lay, pool untouched |
| Prepared lay, field full | own live mines ≥ reserve | Does NOT lay — never evicts its own oldest mine | — |
| Reactive lay still wins | pursuer closing, field already at reserve | Reactive lay still fires (prepared ADDS an occasion, never removes one) | — |
| Prepared lay while threatened | target closing | Reactive path governs; prepared branch does not suppress it | — |

</intent-contract>

## Code Map

- `server/src/game/ai/profiles.ts` -- `forager` / `trapper` rows: bands, disengage, heal, appetite.
- `server/src/game/ai/equipment.ts` -- `mineWant` / `captiveMineWant` / `mineSolve`; the prepared branch and the live-mine bound.
- `server/src/game/ai/utility.ts` -- where a `ownLiveMines(mind)` helper belongs beside the existing `mind.view.mines` consumer (`avoidMines`).
- `shared/src/constants.ts` -- `CONFIG.bots.boonWeights.forager` / `.trapper` line overrides ONLY.
- `server/src/__tests__/botPolicy.test.ts` -- band/profile pins, weight-table pins.
- `server/src/__tests__/botTactics.test.ts` -- the equipment-axis describe; determinism pin.

## Tasks & Acceptance

**Execution:**
- [x] `server/src/game/ai/profiles.ts` -- RULED (Eric, 2026-08-20): `forager` band `0.45`–`0.80`, `disengageHpFrac` `0.55`, `healHpFrac` `0.60`; `trapper` band `0.25`–`0.50`, `disengageHpFrac` `0.45`, `healHpFrac` `0.60` -- the ML dies before it reaches its payoff, and neither profile hangs back today.
- [x] `shared/src/constants.ts` -- restore `forager.mineCaptive` as a WANTED line and add an explicit `buoyGun` override to BOTH ML tables -- cycle 110 demoted captive on a farming argument that was the wrong frame (it is a survival/payoff tool), and `buoyGun` is named by neither table despite being half the combo Eric calls a powerhouse. Record the corrected rationale in the block comment; do NOT leave the retracted one.
- [x] `server/src/game/ai/utility.ts` -- add `ownLiveMines(mind)` reading `mind.view.mines` through the `own` flag -- the same data a client receives, no port change.
- [x] `server/src/game/ai/equipment.ts` -- the PREPARED LAY: a mine may be laid with NO target when the posture is safe (`reposition` / `farm`) and `ownLiveMines < CONFIG.bots.preparedMineReserve`. Gate: appetite ≥ EAGER, OR the bot holds `mine.captive` at ≥ NEUTRAL — a captive mine is a ranged trap that works without a pursuer, which is exactly why it suits a hull that is hanging back. Prepared ADDS an occasion; every reactive lay still fires.
- [x] `server/src/game/ai/equipment.ts` -- bound EVERY lay (prepared and reactive) by `stats.mine.maxLive` -- closes a shipped defect ledgered during the cycle-110 investigation: `addMine` silently evicts the owner's OLDEST mine at the cap, so a bot could churn its own field.
- [x] `shared/src/constants.ts` -- add `CONFIG.bots.preparedMineReserve` -- the headroom kept under `maxLive` so a reactive lay is always possible. This is a deliberate edit to the `CONFIG.bots` key-set pin (`bots.test.ts:45`).
- [x] `server/src/__tests__/botPolicy.test.ts` + `botTactics.test.ts` -- pin the new bands/thresholds, the restored weights, the prepared lay, the field-churn bound, and that a reactive lay still fires with the field at reserve.

**Acceptance Criteria:**
- Given a `forager` with a fleet target at 400u, when it deliberates, then it holds its band rather than closing to the old 132–297u window.
- Given any ML bot at `maxLive` mines, when a lay is considered, then no lay is emitted — a bot never evicts its own mine.
- Given a bot at the prepared reserve with a pursuer closing, when it deliberates, then the reactive lay still fires.
- Given `forager` offered `mineCaptive` or `buoyGun`, when it spends, then both outrank the unlisted default and are reachable picks.
- Given identical `--seed`, when the harness runs twice, then report bodies are byte-identical excluding `meta:`.
- Given `npm run check`, then lint, three type-checks and the full suite pass.
- Given the follow-up campaign at seed 11 / 18 bots / 30 matches, then the Mine Layer's time afloat and boons fitted are reported against cycle 110's 181.1s / 1.97 — improvement is the hypothesis under test, and a null result is reported as a null result rather than re-tuned toward.

## Design Notes

**Why bands are the lever.** `choosePosture` → `bandBearing` steers to hold the band: outside `band.max` close, inside `band.min` open, in-band orbit beam-on. A band of 0.20–0.45R is an instruction to fight at 132–297u. Moving it to 0.45–0.80R is the mechanical expression of "hang back", and it costs nothing else — gun `rangeU` IS `radarRange`, so the whole new band is inside the ML's own gun reach.

**Why prepared laying is doctrine-shaped, not profile-shaped.** A contact mine needs something following you, so laying one into empty water is close to wasted. A CAPTIVE mine is a 144u-trip torpedo launcher that fires at the first hostile into range — it works with nobody following. So "lay while safe" is right for captive at any appetite, and right for a plain rack only when the profile is an eager layer. Putting the branch on the doctrine keeps the two axes separated: the profile still only says how eager it is.

**The reserve is what makes this safe.** `addMine` evicts the owner's oldest at `maxLive`, silently. Without a live-mine bound a prepared lay every 15s reload would churn the field the bot just built — the feature would actively destroy itself. The reserve keeps headroom so a reactive lay always has a round's worth of room.

## Verification

**Commands:**
- `npm run build -w shared` then `npm run check` -- expected: lint + 3 type-checks + full suite green. Cycle-110 baseline to beat: 5439 tests (768 / 1551 / 3120).
- `npx eslint server/src/game/ai --max-warnings 0` -- expected: clean.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 18 --matches 30 --seed 11` -- the AFTER arm. Compare ML rows against cycle 110's: wins 4/30, lifeS 181.1, boons 1.97, alive 2.3%.
- Same command twice -- expected: byte-identical bodies excluding `meta:`.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 18 --bot-profile random --matches 30 --seed 11` -- the random control MUST be unchanged from cycle 110 (12/30 ML wins, 264.0s); if it moved, something outside the ML profiles moved and that is a defect.
