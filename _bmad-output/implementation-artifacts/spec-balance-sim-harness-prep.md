---
title: 'batchSim harness prep for /balance-sim'
type: 'chore'
created: '2026-08-20'
status: 'done'
baseline_revision: '5de9e0c1bea71ab7996953da58ed2bc2b800a127'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** `/balance-sim` cannot produce a trustworthy reading against today's batchSim harness. Bot classes are ROLLED rather than assigned (measured 5/5/10 in one 20-bot match, 67/86/87 across 12), so per-class win share measures REPRESENTATION instead of balance; and no equipment dial (`gun.` `cannon.` `torpedo.` `mine.` `starShells.` `shipClasses.`) is reachable from the CLI, so no candidate change can be simulated at all.

**Approach:** Two additive, independently-gated harness surfaces — an opt-in `--roster even` that round-robins `SHIP_CLASS_IDS` into `world.addBot(hull)` OFFSET BY MATCH INDEX, and a `--tune` flag reaching equipment CONFIG paths behind a SECOND env gate (`HC_BALANCE=1`) while leaving the `--set`/`--sweep` whitelist byte-identical. Plus raw per-bot survivorship in the JSON so the attrition curve stops being an approximation.

## Boundaries & Constraints

**Always:**
- Every EXISTING run key stays byte-identical. Defaults are `--roster rolled` and no `--tune`; the deterministic report body (`main.ts` `headerLines`) gains a `roster=`/`tune=` segment ONLY when non-default — the exact pattern `bots=` already uses.
- `isTunableKey`, `TUNABLE_FAMILIES`, `TUNABLE_EXACT`, `MIN_ONE_KEYS` and the "never quietly become a general balance-editing backdoor" rationale comment in `overrides.ts` stay BYTE-IDENTICAL. `--tune` is a SEPARATE, separately-gated surface placed BESIDE them, so the boundary stays visible rather than quietly moving.
- `args.ts` stays PURE OVER ARGV — it reads no `process.env` (its header claims this; its tests depend on it). The `HC_BALANCE` gate lives in `batchSim.mjs` (which already owns env gating) and is re-checked in `main.ts` before tune overrides are applied.
- The `--json` contract is FROZEN: `variants[].label`, `variants[].aggregate.winnerClass|.matches|.durationS`, `variants[].bots.byClass[].key|.n|.lifeS`, `variants[].bots.botsPerMatch|.endedBy`. `winnerClass` must keep tallying `'none'` for an unresolved match.
- Tests must NEVER import `./main.ts` (it runs the CLI at import time) — the existing rule at `batchSim.test.ts:9`.

**Block If:**
- Passing the precondition gate would require making the even roster the DEFAULT (it does not — a hull-argument call satisfies the regex; see Design Notes).
- Any frozen contract key turns out to need renaming or restructuring to land the work.

**Never:**
- Do not widen `--set`/`--sweep` to equipment paths.
- Do not change any CONFIG VALUE, gameplay tunable, or `PROTOCOL_VERSION`. Harness-only work.
- Do not add `--sweep` support for tune keys (explicitly optional — `/balance-sim` runs one labelled arm per candidate).
- Do not touch `shared/` or `server/src/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default roster | no `--roster` | `addBot(undefined)`; classes roll off the same stream position as today; run key unchanged | No error expected |
| Even roster | `--roster even --bots 20`, match `index` | bot `i` gets `SHIP_CLASS_IDS[(i + index) % 3]`; per-match spread <= 1, campaign total exactly even over any multiple of 3 | No error expected |
| Bad roster value | `--roster spread` | usage error, exit 2, message names `even` and `rolled` | `UsageError` |
| Tune, gate on | `HC_BALANCE=1`, `--tune gun.reloadMs=4000` | CONFIG mutated before any World is built; restore closure reverts it | No error expected |
| Tune, gate off | `HC_DEV_OPTIONS=1` only, `--tune ...` | refuses, names `HC_BALANCE` in the message, non-zero exit | explicit refusal |
| Tune, non-equipment key | `--tune xp.levelMs=1000` | rejected; message names the six tune families | `TunableError` |
| Tune, zero reload | `--tune gun.reloadMs=0` | rejected (divide-or-spin hazard) | `TunableError`, floor 1 |
| Tune, missing path | `--tune gun.nope=1` | rejected as not a numeric CONFIG entry | `TunableError` |
| `--set` unchanged | `--set gun.damage=5` | STILL rejected (whitelist untouched) | `TunableError` |

</intent-contract>

## Code Map

- `server/scripts/batchsim/runner.ts` -- `runMatch(index, spec)`; bot lobby at `:337` (`world.addBot().id`), captain round-robin at `:328`; `RunSpec` at `:54`. `SHIP_CLASS_IDS` imported from `@salvo/shared` at `:28` (= `['torpedoBoat','battleship','mineLayer']`).
- `server/src/game/world.ts:1298` -- `addBot(hull?: ShipClassId)`; passing `undefined` is identical to omitting it. READ ONLY — do not modify.
- `server/scripts/batchsim/args.ts` -- `CliOptions`, `USAGE`, `VALUE_FLAGS`, `parseSet` (the mirror for `parseTune`). Pure over argv.
- `server/scripts/batchsim/overrides.ts` -- `resolveLeaf`, `isTunableKey`, `validateTunableKey/Value`, `applyOverrides` restore closure.
- `server/scripts/batchsim/main.ts` -- `headerLines` (run key) `:41`, `batchMode` apply/restore loop `:62`, `--json` writer `:155`. Envelope is `{ meta, variants: [{label, overrides, aggregate, bots?}] }`.
- `server/scripts/batchSim.mjs:46` -- the `HC_DEV_OPTIONS` gate + tsx bootstrap.
- `server/scripts/batchsim/botMetrics.ts:78` -- `BotSample.lifeS`, one raw value per bot-match row.
- `server/scripts/batchsim/botReport.ts` -- `BotGroup` `:53`, `groupOf` `:141` (where `summarize` pools quantiles), `BotAggregate` `:81`, `buildBotAggregate` `:178`.
- `server/scripts/batchsim/__tests__/batchSim.test.ts` -- `:26` full-flag-set round-trip (must be extended), `:51` pins `gun.damage` REJECTED for `--set` (must stay green).
- `server/scripts/batchsim/__tests__/botHarness.test.ts` -- `:214` by-class slicing, `:230` deterministic rendered body (must stay green).

## Tasks & Acceptance

**Execution:**
- [x] `server/scripts/batchsim/args.ts` -- add `roster: 'even' | 'rolled'` (default `'rolled'`) and `tune: Record<string, number>` (default `{}`) to `CliOptions`; add `'--roster'` and `'--tune': parseTune` to `VALUE_FLAGS`; document both in `USAGE` -- the CLI surface. `--tune` must appear as a LITERAL string for the precondition gate's grep.
- [x] `server/scripts/batchsim/overrides.ts` -- add `TUNE_FAMILIES` with each family QUOTED (`'gun.'`, `'cannon.'`, `'torpedo.'`, `'mine.'`, `'starShells.'`, `'shipClasses.'`), plus `isTuneKey()`, `validateTuneKey/Value`, and an `allowTune` parameter on `resolveLeaf`; extend `applyOverrides(set, tune?)` to fold tune keys into the SAME undo list -- reuses the restore closure unchanged so sweeps/arms restore exactly as today.
- [x] `server/scripts/batchsim/runner.ts` -- add `roster?: 'even' | 'rolled'` to `RunSpec`; replace the bare `world.addBot()` with a hull-argument call, round-robining `SHIP_CLASS_IDS[(i + index) % SHIP_CLASS_IDS.length]` under `even` and passing `undefined` under `rolled` -- the offset makes campaign totals even; the hull argument flips the precondition gate.
- [x] `server/scripts/batchSim.mjs` -- refuse a `--tune` present in argv unless `HC_BALANCE=1`, with a message naming the variable -- two gates, because this edits combat numbers rather than harness dials.
- [x] `server/scripts/batchsim/main.ts` -- thread `opts.roster`/`opts.tune` into `RunSpec` and `applyOverrides`; re-check `HC_BALANCE` before applying tune (defence in depth for a direct tsx entry); append `roster=`/`tune=` to the run-key line only when non-default -- run-key honesty (NFR5) without breaking existing keys.
- [x] `server/scripts/batchsim/botMetrics.ts` -- export a `lifeSamples()` helper returning the raw per-bot life values from `BotSample` rows -- makes the attrition curve EXACT instead of quantile-pooled (prep item 4). The identifier `lifeSamples` must appear in THIS file for the precondition advisory to clear.
- [x] `server/scripts/batchsim/botReport.ts` -- add `lifeSamples: number[]` to `BotGroup`, populated in `groupOf` via the helper; do NOT render it -- JSON-only, so the deterministic text body stays byte-identical.
- [x] `server/scripts/batchsim/__tests__/batchSim.test.ts` -- extend the `:26` full-flag-set test for the two new fields; cover every I/O Matrix row for `--roster` and `--tune`; add a CONTRACT PIN asserting the frozen key set on `buildAggregate(...)` and `buildBotAggregate(...)` outputs (these objects ARE `variants[].aggregate` / `.bots`) -- today NO test guards the JSON shape, so the skill can be silently broken.
- [x] `server/scripts/batchsim/__tests__/botHarness.test.ts` -- assert `lifeSamples` is raw, per-class, and its length equals the group's `n`; assert the rendered report text is unchanged.

**Acceptance Criteria:**
- Given no new flags, when a previously-recorded run is re-run, then the report body (excluding the `meta:` line) is byte-identical to before this change.
- Given `--roster even --bots 20` over any multiple of 3 matches, when the campaign finishes, then each class's bot count differs from the others by at most 1 within a match and is exactly equal in the campaign total.
- Given `HC_DEV_OPTIONS=1` without `HC_BALANCE=1`, when `--tune` is passed, then the harness refuses with a message naming `HC_BALANCE` and exits non-zero.
- Given `check_preconditions.py --repo .`, when run after this change, then `ok` is true with zero blocking findings and no "no exact survivorship data" advisory.
- Given `npm run check`, when run at the repo root, then lint, type-check and all tests pass.

## Spec Change Log

## Review Triage Log

### 2026-08-20 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 17: (high 4, medium 7, low 6)
- defer: 7: (high 0, medium 3, low 4)
- reject: 4
- addressed_findings:
  - `[high]` `[patch]` `--tune` could walk OFF CONFIG: `broadside.traverseDeg.length=1` truncated a live CONFIG array and ran the batch normally; `...__proto__.length=1` reached `Array.prototype`. Reproduced both. Walker now requires own-properties at each interior step and admits array entries only by index, so the documented `zone.ringSteps.0` dial still resolves.
  - `[high]` `[patch]` `applyOverrides` was not transactional — a throw mid-apply left earlier keys mutated with NO closure returned, so the next sweep variant ran on a poisoned CONFIG and reported normally. Now all-or-nothing with rollback-then-rethrow.
  - `[high]` `[patch]` `--tune`/`--roster` never reached the `--json` envelope, so a tuned arm serialised byte-identically to its own baseline — and the JSON is the ONLY thing `/balance-sim` reads. Added as additive `tune`/`roster` keys on every variant.
  - `[high]` `[patch]` Divisor floors: `steerageSpeed=0` → `0/0` NaN into heading/position; `turnRate=0` → Infinity/NaN steer silently dropped by the `inputs.ts` finite check, yielding an ordinary-looking report of inert bots. `TUNE_MIN_ONE_LEAVES` now floors steerageSpeed, turnRate, shellSpeed, torpedo.speed and hp at 1, each justified by a divisor call site.
  - `[medium]` `[patch]` `cannon.` is EXTINCT (Story 7-5 replaced it with the BROADSIDE BARRAGE), so the prep doc's family list left the battleship's main weapon untunable. Dropped the dead family; added the three live blocks the doc predates (`broadside.`, `speedBoost.`, `radarBuoy.`).
  - `[medium]` `[patch]` Reload floor matched the leaf by exact name and missed `radarBuoy.gunReloadMs`. Now a case-insensitive suffix match on `reloadms`/`cooldownms`.
  - `[medium]` `[patch]` Four DERIVED paths (`mine.triggerRadius`, `gun.rangeU`, `starShells.rangeU`, `broadside.rangeU`) were accepted and stamped into the run key while being re-derived post-fold — false evidence. Now refused up front, each naming the real dial.
  - `[medium]` `[patch]` `--roster even` rotated bots but not captains, leaving a mixed lobby short the SAME class every match — the exact artefact the flag exists to remove. One shared `rotate()` helper now serves both loops; `rolled` stays byte-identical.
  - `[medium]` `[patch]` The evenness claim was unconditional but only holds when `matches` or `bots` is a multiple of 3 (at the default `--matches 100`: 667/667/666), and the test used `matches: 3` — the one exact case. Claim reworded in USAGE and `RunSpec`; test is now `it.each([1,2,3,4])` asserting `max-min <= 1` plus exactness where the condition holds.
  - `[medium]` `[patch]` `main.ts` re-checked `HC_BALANCE` for the direct-tsx path but left `HC_DEV_OPTIONS` unmirrored on that same path, while its header still claimed the `.mjs` owned that gate. Both gates now checked in both places; header corrected.
  - `[medium]` `[patch]` `--tune`/`--roster` were inert under `--deck-only` yet stamped into the run key, so two different keys provably produced byte-identical bodies. Both combinations now refused as usage errors (exit 2).
  - `[low]` `[patch]` A tautological test compared `lifeSamples(...)` against `lifeSamples(...)` and could not fail; both sides now assert hand-written literals.
  - `[low]` `[patch]` `lifeSamples` was populated in the shared `groupOf`, emitting every value TWICE (byProfile + byClass). Now carried by a `BotClassGroup` type so `byProfile` is structurally unable to hold it.
  - `[low]` `[patch]` `.mjs` exited 1 for a refused `--tune` while the documented contract and the direct-tsx path used 2. `.mjs` now exits 2 for that case; `HC_DEV_OPTIONS` keeps exiting 1 so a wrapper can still tell "not a dev box" from "you typed it wrong".
  - `[low]` `[patch]` A repeated `--tune` key silently last-won; now a `UsageError`, mirroring the existing `duplicate sweep key` precedent.
  - `[low]` `[patch]` The `--json` contract pin used `toBeTypeOf('object')`, which PASSES for `null`; now asserts non-null, and pins `lifeSamples` presence with `length === n`.
  - `[low]` `[patch]` `'the pin discriminates'` asserted `not.toEqual([20,20,20])` for one seed — a coincidence could fail the suite for an unrelated reason. Now asserts the discriminating property (`max-min > 1`).

## Design Notes

**Why `--roster` defaults to `rolled`.** The precondition gate greps for a BARE `addBot()` (regex `addBot\(\s*\)`); an explicit `addBot(undefined)` under the default satisfies it while keeping every prior bot-mode run key reproducible. Flipping the default would invalidate existing evidence — a deliberate call, not made here.

**Why the offset is load-bearing.** 20 bots over 3 classes is 7/7/6 at best. Without `+ index` the SAME class is short in every match and the campaign stays ~14% skewed — enough to fail the evenness gate. Rotating by match index lands a 91-match campaign at 607/607/606 (~0.16% spread).

```ts
const hull = spec.roster === 'even'
  ? SHIP_CLASS_IDS[(i + index) % SHIP_CLASS_IDS.length]
  : undefined;
botIds.push(world.addBot(hull).id);
```

**Tune floor.** Reload/cooldown paths are the same divide-or-spin hazard class as the existing `MIN_ONE_KEYS`: a tune key whose FINAL SEGMENT is `reloadMs` or `cooldownMs` requires `>= 1`; every other tune key requires a finite `>= 0`.

**Why the contract pin lives on the aggregates.** Tests may not import `main.ts`, so the envelope cannot be exercised directly; `buildAggregate`/`buildBotAggregate` return exactly the objects `JSON.stringify` writes as `aggregate`/`bots`, which is the part `/balance-sim` reads.

## Verification

**Commands:**
- `npm run lint` -- expected: clean; complexity <= 10 on every new function.
- `npm test -w server` -- expected: all pass, including the new roster/tune/contract tests.
- `npm run check` -- expected: lint + type-check + full suite green.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 3 --seed 7 --roster even --json /tmp/even.json` -- expected: exit 0; `variants[0].bots.byClass` counts exactly even.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --tune gun.reloadMs=4000 --matches 1` -- expected: refusal naming `HC_BALANCE`, non-zero exit.
- `HC_DEV_OPTIONS=1 HC_BALANCE=1 node server/scripts/batchSim.mjs --tune gun.reloadMs=4000 --captains 0 --bots 6 --matches 2 --seed 7` -- expected: exit 0, run-key line shows `tune=gun.reloadMs=4000`.
- `uv run --python 3.11 /Users/ericseibt/Code/salvo/.claude/skills/balance-sim/scripts/check_preconditions.py --repo .` -- expected: `"ok": true`, empty `blocking`, empty `advisories`.

## Auto Run Result

Status: done — cycle 115 (0.17.115), interstitial harness chore. PV unchanged at 44 (no wire contract moved).

### Summary

The `/balance-sim` precondition gate is GREEN (`ok: true`, `blocking: []`, `advisories: []`). All three required prep items landed plus the optional fourth:

1. **Even class roster** — `--roster even|rolled` (default `rolled`). Under `even`, hull `i` in match `index` takes `SHIP_CLASS_IDS[(i + index) % 3]`; the `+ index` offset is what makes campaign totals even rather than short the same class every match. Measured: 20 bots x 3 matches = 20/20/20 exactly, against 19/20/21 on the default path.
2. **`--tune`** — an equipment CONFIG surface behind a SECOND env gate (`HC_BALANCE=1`) checked in both entry points, deliberately kept BESIDE the `--set`/`--sweep` whitelist rather than widening it. `--set gun.damage=5` is still refused exactly as before.
3. **JSON contract** — every frozen key preserved, and now pinned by a regression test. There was NO test guarding the report shape before this cycle, so the skill could have been broken silently.
4. **(optional) survivorship** — raw per-bot `lifeSamples` on each `byClass` row, JSON-only, so the deterministic text body is byte-identical.

**Deviation from the prep doc, deliberate:** the doc's family list named `cannon.`, which no longer exists — Story 7-5 replaced the cannon with the BROADSIDE BARRAGE. Shipping it verbatim would have passed the family gate and then died on the CONFIG walk while the battleship's main weapon stayed untunable. The dead family was dropped and the three live blocks the doc predates (`broadside.`, `speedBoost.`, `radarBuoy.`) added.

### Files changed

- `server/scripts/batchsim/args.ts` -- `roster`/`tune` options, `--roster`/`--tune` flags, USAGE rows, duplicate-key guard, `assertCoherent` (deck-only refusals). Still reads no `process.env`.
- `server/scripts/batchsim/overrides.ts` -- `TUNE_FAMILIES`/`isTuneKey`/`validateTuneKey|Value`, `allowTune` on `resolveLeaf`, own-property + array-index walk guards, `DERIVED_TUNE_KEYS` refusals, divisor floors, transactional `applyOverrides`. The `--set` whitelist and its rationale comment are byte-identical.
- `server/scripts/batchsim/runner.ts` -- `RunSpec.roster`, one shared `rotate()`/`rosterOffset()` serving BOTH the bot and captain loops.
- `server/scripts/batchSim.mjs` -- `HC_BALANCE` argv gate (exit 2); the `HC_DEV_OPTIONS` refusal still exits 1.
- `server/scripts/batchsim/main.ts` -- `JsonVariant` with additive `tune`/`roster`, run-key segments, both env gates re-checked for the direct-tsx path.
- `server/scripts/batchsim/botMetrics.ts` -- exported `lifeSamples()` helper.
- `server/scripts/batchsim/botReport.ts` -- `BotClassGroup.lifeSamples` on `byClass` only.
- `server/scripts/batchsim/__tests__/batchSim.test.ts`, `botHarness.test.ts` -- +29 tests (server workspace 1513 -> 1542).
- `VERSION`, `package.json`, `package-lock.json` -- 0.17.114 -> 0.17.115 (the lockfile was stale at 0.17.108; reconciled deliberately rather than left as a stray diff).

### Review findings

17 patches applied (4 high, 7 medium, 6 low), 7 deferred, 4 rejected, 0 intent gaps, 0 bad-spec loopbacks. Three reviewers: Codex (cross-model), Blind Hunter, Edge Case Hunter. Full breakdown in the Review Triage Log above; deferrals in `deferred-work.md`.

The dominant theme was a single failure class — **a run that reads fine while the sim underneath it is wrong**, which is the one failure a balance harness may not have. Four instances were live: `--tune` could truncate a live CONFIG array (reproduced: `restore()` reported success while leaving `[null x 5]`); a mid-apply throw left CONFIG poisoned for the next sweep variant; `--tune`/`--roster` never reached the JSON, so a tuned arm was indistinguishable from its baseline to the only consumer that reads it; and four DERIVED paths were accepted and stamped into the run key while being re-derived post-fold.

### Verification

- `npm test -w shared` 776 passed; `npm test -w server` 1542 passed; `npm test -w client` 3140 passed (5458 total). `npm run lint` 0 errors, 3 pre-existing warnings.
- **`npm run check` exits 1** on one PRE-EXISTING, load-flaky test unrelated to this change: `shared/src/__tests__/map.test.ts` "a production map generates within budget" (499ms standalone against its own 500ms bar; 529.9ms under three concurrent workspace suites). Reproduced twice under load, passes twice standalone. `git diff HEAD -- shared/ client/ server/src/` is EMPTY, so this change cannot have caused it. Ledgered in `deferred-work.md`.
- Byte-identity of the default path verified twice by independent agents via `git archive` of HEAD (never `git stash`) — identical bodies (md5 match) for both a bot lobby and a captain lobby.
- Precondition gate: `ok: true`, `blocking: []`, `advisories: []`.
- Behaviour smokes all confirmed by the orchestrator directly: gate refusals (both doors), deck-only refusals, derived-path refusal, divisor-floor refusal, array-index refusal, even-roster 20/20/20, JSON carrying `tune`/`roster`, `lifeSamples` on `byClass` and absent from `byProfile`.

### Residual risks

- **The instrument is now trustworthy; its current READINGS are not yet.** The prep doc's closing note stands: on the last measured run two of the six bot quality bars were failing (participant-kill rate 42% against a 60% bar; storm deaths 2.1% against a 5-20% band). While those are red, class win share is decided by TACTICS rather than equipment, and an equipment proposal built on it is the classic wrong fix. A green precondition gate does not clear that bar.
- `lifeSamples` is right-censored (a survivor and a death at match end are the same number), so "exact alive-at-T" is not yet true — better than the pooled quantiles it replaced, but the limitation is real and ledgered.
- `--tune` has no integer or upper bound; a fractional ammo count silently disables a weapon and reports zero activity as a result. Ledgered.
- `--roster even` totals are exactly even only when `matches` or `bots` is a multiple of 3 (0.05% residual skew at the default `--matches 100`). The claim is now worded truthfully in USAGE and `RunSpec`.
