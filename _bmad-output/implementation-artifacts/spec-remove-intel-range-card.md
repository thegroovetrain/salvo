---
title: 'Remove the INTEL RANGE upgrade card line'
type: 'chore'
created: '2026-08-20'
status: 'done'
baseline_revision: '7157dc42f959bb05b496d9f22e4954eb19156656'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Eric has ruled the INTEL RANGE boon line (`intelRange` — category `intel`, common ×4, `radarRange` +50u per card, player copy IMPROVED OPTICS → HIGH-GAIN ANTENNA → DIRECTOR TOWER → CAVITY MAGNETRON) out of the game. It is the only card in the catalog that writes `stats.radarRange`, so it is also the only thing that can move the eighths ladder.

**Approach:** Delete the line end to end — definition, copy, tooltip, bot weights, batch-sim probe entry, and every test whose subject is the card — in the established deletion style of cycle 93 (`cannonBlast`) and cycle 95 (`mineTrigger`): tests RETIRED rather than adapted, no dead knob left behind. Two Eric rulings (2026-08-20) bound the change: **base radar range does NOT compensate** (`CONFIG.vision.radar` stays `SIGHT * 2` = 660, so zero-boon play is byte-identical to today) and **the `intel` category SURVIVES** as a one-line category carrying `intelSweep` ×5.

## Boundaries & Constraints

**Always:**
- `CONFIG.vision.radar` stays 660u and `CONFIG.vision.sight` stays 330u. Every derived rung (detect 0.375R, sight 0.5R, muzzle/smoke 0.625R, farRadar 0.875R) keeps its factor and its base value. No combat, sensor, storm, or economy tunable moves.
- `UNIVERSAL_CATEGORIES` stays `['intel','ship','guns']`; `intelSweep` stays in `intel`; the `INTEL` category label and `SHIPWIDE_CATEGORIES` are untouched.
- `'radarRange'` STAYS on `BOON_STAT_PATHS` as a whitelisted-but-unwritten path — the established shape (`gun.burstRadius`, `<equipment>.reloadMs`, `radarBuoy.sweepRpm`, `kinematics.reverseSpeed`) — and is added to the `orphaned` list in `shared/src/__tests__/boons.test.ts`. This keeps the injected-def test escape hatch (`OMNI_BOON`) legal and lets a future radar card land without touching the whitelist.
- The four post-fold re-pins (`gun.rangeU`, `starShells.rangeU`, `broadside.rangeU`, `sightRange = radarRange / 2`) stay in BOTH `applyBoonStats` and `clampStats`. They are the base derivation path and `effectiveStats()` remains the sole derivation seam; only their *"a mid-list fold would leave this stale"* comments need rewording.
- `PROTOCOL_VERSION` 45 → 46 (catalog content IS wire contract — `shared/src/index.ts:454`, `shared/src/sim/boons.ts:354`), with a new entry in the version-history ladder and its mirror in `shared/src/__tests__/barrel.test.ts`.
- Every count assertion and doc figure moves together: catalog 29 → **28** lines, intel subdeck 9 → **5**, universal (intel+ship+guns) 25 → **21**, per-class deck 41 → **37** for all three hulls.
- Both tracker files (`sprint-status.yaml`, `gds-workflow-status.yaml`) updated in this same change, one line each.

**Block If:**
- Deleting the line would require changing any gameplay tunable other than the catalog itself (it should not — if a value must move to keep tests green, that is a signal something else is wrong).
- Any structural invariant requires a minimum number of lines per universal category (none found; if one surfaces, HALT rather than inventing a filler card).

**Never:**
- Do NOT raise `CONFIG.vision.radar`, `CONFIG.vision.sight`, or any rung factor to compensate for the lost ceiling (explicit Eric ruling).
- Do NOT retire the `intel` category, move `intelSweep` to another category, or add a replacement card (explicit Eric ruling).
- Do NOT retune the `siege` / `forager` bot `cat.intel` appetites, or any other bot weight, beyond deleting the two dangling `intelRange` keys. Any retune belongs to a balance pass, not this removal — ledger it in `deferred-work.md` instead.
- Do NOT de-scale the observer-anchored resolvers (`muzzleFlashReach(me)`, the foghorn band divisor, the radar dim ramp) back to flat literals. They still resolve through `stats.radarRange`; they simply now resolve to the same number for everyone. Re-litigating epic-6 amendment 22's mechanism is out of scope.
- Do NOT rewrite historical records: the epic-4/5/6 amendment files, superseded specs, investigation write-ups, batch-sim evidence and brainstorming notes describe what was true when written and stay verbatim.
- Do NOT split this into multiple PRs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Catalog lookup of the deleted id | `BOON_CATALOG['intelRange']` | `undefined` — the id no longer exists | Client resolve is fail-closed (unknown id silently dropped); the PV gate is what actually prevents a stale client seeing it |
| Deck build, any hull | `buildDeck(cls, carried)` | 37 cards; `intel` contributes exactly 5 (`intelSweep` ×5); `intelRange` appears in no hull's deck | No error expected |
| Offer roll | any RNG stream, any hull | Offers still draw from 3 distinct categories; `intel` can still be one of them | No error expected |
| Max-stack stat envelope | every universal line stacked to its copy cap | `radarRange` = 660 exactly (was 860); `sightRange` = 330; `gun/starShells.rangeU` = 660; `broadside.rangeU` = 412.5 | `balanceProbe.ts` must not deref `BOON_CATALOG['intelRange'].copies` — hard TypeError if the id is left in its `universal` array |
| Bot boon pick | `siege` or `forager` profile scoring a hand | Profile scores only surviving lines; no `lines` key names a missing catalog id | `bots.test.ts` asserts every `lines` key exists in `BOON_CATALOG` — a dangling key is a hard test failure |
| Stale client joins | client sends `pv: 45` | Matchmake refused by `protocolVersionError` before a seat is reserved | Existing PV gate; no new handling |

</intent-contract>

## Code Map

- `shared/src/sim/boons.ts` -- the card definition (`:470`) + its authoring comment block (`:460-469`); `BOON_STAT_PATHS` (`:115`, keep `radarRange`); `applyBoonStats` re-pin comments (`:657-680`)
- `shared/src/sim/stats.ts` -- `clampStats` sibling re-pins + comment naming `intelRange` (`:340-360`)
- `shared/src/index.ts` -- `PROTOCOL_VERSION` (`:501`) + version-history ladder
- `shared/src/constants.ts` -- bot profile weight keys `siege.lines.intelRange` (`:574`), `forager.lines.intelRange` (`:580`); `CONFIG.broadside` doc (`:1249-1253`); `siege` profile comment (`:565-571`)
- `client/src/ui/boonCopy.ts` -- copy ladder (`:132`), `STAT_LINES_WITH_NUMBERS` row (`:263`), tooltip prose (`:394-396`)
- `client/src/config.ts` -- `fillOuterFactor` rationale (`:1278`), `radar.dim.innerFactor` doc (`:2783`)
- `client/src/render/{radar,radarDim,radarHeatmap,textures,wake,weaponArc,camera}.ts`, `client/src/main.ts` -- comment-only mentions of "an `intelRange` boon widens it"
- `server/src/game/signals.ts` -- comment mentions (`:262`, `:1780`, `:1802`)
- `server/scripts/batchsim/balanceProbe.ts` -- `universal` id array (`:137`) — **hard break if left**
- Tests (subject = the card, RETIRE): `shared/src/__tests__/stats.test.ts` (`:152-181`, `:217`, `:245-267`), `server/src/__tests__/upgrades.test.ts` (`:1064-1145`), `server/src/__tests__/broadside.test.ts` (`:100-112`), `client/src/__tests__/boonCopy.test.ts` (`:62-63`, `:177`), `client/src/__tests__/refitFailOpen.test.ts` (`:46-79`)
- Tests (counts/pins, RETARGET): `shared/src/__tests__/boons.test.ts` (`:115`, `:130-136`, `:148`, `:243-253` orphaned list), `shared/src/__tests__/barrel.test.ts` (`:170-180`, `:438`), `shared/src/__tests__/deck.test.ts` (`:74-146` incl. the `gone` deletion pin), `server/src/__tests__/perception.test.ts` (`:113-139` oracle, `:3084-3089` fuzz)
- Tests (incidental widener, SWAP the id or drive stats directly): `server/src/__tests__/radarWire.test.ts` (`:149`), `client/src/__tests__/{aimPreview,buoys,upgradeMenu,boonStats,hotbar,roomBindings,zone}.test.ts`
- Docs: `CLAUDE.md`, `_bmad-output/implementation-artifacts/7-5-upgrade-catalog.md`, `epic-7-context-amendments.md` (new amendment 30), `deferred-work.md`, `sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/planning-artifacts/epics.md`
- `VERSION` + `package.json` -- 0.17.117 → 0.17.119

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/boons.ts` -- delete the `intelRange` definition and its authoring comment; keep `'radarRange'` in `BOON_STAT_PATHS`; reword the `applyBoonStats` re-pin comments that justify themselves by "an `intelRange` fold" -- the definition is the root of the change
- [ ] `shared/src/sim/stats.ts` -- reword the `clampStats` re-pin comment naming `intelRange`; leave all four re-pins in place -- derivation path must not move
- [ ] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` 45 → 46 and add a 45 → 46 entry to the history ladder -- catalog content is wire contract
- [ ] `shared/src/constants.ts` -- delete the two dangling `intelRange` bot weight keys; reword the `CONFIG.broadside` and `siege` profile comments that describe range as scalable -- a dangling key is a hard test failure
- [ ] `client/src/ui/boonCopy.ts` -- delete the copy ladder, the `STAT_LINES_WITH_NUMBERS` row, and the tooltip prose entry -- no orphan copy
- [ ] `server/scripts/batchsim/balanceProbe.ts` -- remove `'intelRange'` from the `universal` array -- otherwise the probe throws on `.copies` of `undefined`
- [ ] `client/src/config.ts`, `client/src/render/*.ts`, `client/src/main.ts`, `server/src/game/signals.ts` -- reword every comment asserting that a boon widens radar range; correct `fillOuterFactor`'s stale `1.15^4` rationale and `zone.test.ts`'s stale `MAX_RADAR` -- a comment that is now false is worse than no comment
- [ ] `shared/src/__tests__/{boons,barrel,deck,stats}.test.ts` -- retarget every count (29→28, 9→5, 25→21, 41→37), add `intelRange` to the deck `gone` deletion pin, add `radarRange` to the `orphaned` whitelisted-path list, and RETIRE the stacking tests whose subject is the card -- counts and pins are the structural guard
- [ ] `server/src/__tests__/{upgrades,broadside,perception,radarWire,bots}.test.ts` -- retire the per-observer intel-range describe block and the broadside stacking test; collapse the perception `effRadar` oracle to the constant and drop the fuzz's `intelRange` stack; swap the incidental id in `radarWire` -- retire rather than adapt
- [ ] `client/src/__tests__/*.test.ts` -- retire the card-subject tests (`boonCopy` rows, `refitFailOpen`'s intelRange-authored case) and swap the incidental id in `upgradeMenu`/`boonStats`/`hotbar`/`roomBindings`; give `aimPreview`/`buoys`/`weaponArc` a stats-override escape hatch so the buoy-vs-owner-radar contrast case survives -- those tests are about buoy geometry, not about the card
- [ ] `CLAUDE.md`, `7-5-upgrade-catalog.md`, `_bmad-output/planning-artifacts/epics.md` -- record the removal where those docs state the card as current; leave every historical amendment/investigation/evidence file verbatim -- minimal design-doc edits
- [ ] `epic-7-context-amendments.md` -- add **Amendment 31** recording both Eric rulings (base does not compensate; `intel` category survives) and the consequence that the eighths ladder is now frozen for every observer -- durable home for rulings
- [ ] `deferred-work.md` -- ledger the follow-ons this removal creates: `siege`/`forager` `cat.intel` appetite now buys sweep only (untuned); the radar dim-mask rebake has ONE live production trigger (dazzle) so `spec-radar-dim-mask-render-freeze.md`'s manual QA step is stale; the "ladder ordering holds at every stack level" invariant is now vacuous -- track rather than lose
- [ ] `VERSION`, `package.json`, `sprint-status.yaml`, `gds-workflow-status.yaml` -- bump to 0.17.119 and stamp both trackers one line each -- every landed PR updates both

**Acceptance Criteria:**
- Given a fresh build, when `BOON_CATALOG` is enumerated, then it holds 28 lines and no key named `intelRange`.
- Given any of the three hull classes, when its deck is built, then it holds 37 cards of which exactly 5 are category `intel`, and `intelRange` appears in no deck.
- Given a ship with every reachable boon stacked to its copy cap, when `effectiveStats()` resolves it, then `radarRange` is exactly `CONFIG.vision.radar` (660) and `sightRange` is exactly 330.
- Given zero boons, when `effectiveStats()` resolves any hull, then every field is byte-identical to the pre-change result (pure removal — nothing base moved).
- Given a client reporting `pv: 45`, when it attempts to matchmake, then the join is refused by the existing protocol gate.
- Given `npm run lint` and the three workspace test suites, when they run, then they pass with no LIVE reference to `intelRange` anywhere under `shared/src`, `server/src`, `server/scripts`, or `client/src` — no catalog entry, no stat write, no bot weight key, no test scaffolding. **AMENDED during implementation (the original "zero grep matches" wording was unsatisfiable):** three classes of reference legitimately survive and are required — the `gone` deletion pin in `deck.test.ts` (which cannot assert an id's absence without naming it), the NEW `PROTOCOL_VERSION` 45 → 46 history entry (which must say what broke), and the HISTORICAL PV entries naming the card (precedent: `boostMax`, `torpedoCommand`, `gunDamage`, `mineDamage` all still appear there from prior deletions; rewriting them would falsify a record).

## Spec Change Log

## Review Triage Log

### Pass 1 — 2026-08-20 (Fable adversarial + Codex cross-model, run in parallel)

Counts: intent_gap 0, bad_spec 0, patch 1 (low), defer 1 (low), reject 0.

- **Codex (cross-model): ZERO findings.** No `[P1]`, no `[P2]`. It independently ran
  representative shared/server/client suites and concluded the only production logic change
  is the catalog deletion plus the PV bump. Gate: PASS.
- **Fable (adversarial): 1 CONFIRMED, 1 PLAUSIBLE-informational. Verdict: build-on-it.**
- PATCH (confirmed, test-only): `client/src/__tests__/hotbar.test.ts` moved its cramped
  viewport 500 → 420 but its closing assertion still bounded `panelH` against `500 - 2*margin`,
  so a trim stopping 80px short of fitting would have passed. Tightened to 420; re-run green
  (79/79), which also proves the trim genuinely fits rather than merely passing on slack.
- DEFER (informational): with no card able to move `radarRange`, the deliberately-kept
  observer-anchored resolvers (`muzzleFlashReach`, blip gate, foghorn divisor, dim ramp) are
  no longer falsifiable by the suite — a refactor hardcoding `CONFIG.vision.radar` would pass
  green. Not a defect of this change; ledgered in `deferred-work.md` with the cheapest fix.

Both models independently cleared every attack point the gate was seeded with: the injected
`BoonDef` tests are legal and assert their widening premise before the contrast (no
tautology); the retired per-observer block's coverage claim checks out rung by rung; the
golden-frame snapshot moved only its two `offer` arrays with every position, event, blip
bitfield and timestamp byte-identical; the slackened floors are non-degeneracy guards with
the exact counts pinned hard elsewhere; bot scoring has no empty-set or divide-by-zero path;
and PV 46 is sufficient because catalog content is the only wire-shaped thing that moved.


## Design Notes

**Why the observer-scaled resolvers stay.** Epic-6 amendment 22 anchored the 5/8 muzzle/smoke rung on `me.stats.radarRange` so the ladder scaled with the player's build. With no card behind `radarRange`, every observer resolves to the same 412.5u — the rung is *effectively* flat again, but through the same single derivation seam rather than a re-introduced literal. Keeping the anchor is the smaller and safer diff, keeps `effectiveStats()` the sole derivation path, and means a future radar card needs no re-scaling work. This does **not** touch the master perception invariant's declared exceptions: that count is about which signal rows bypass the invariant, not about whether a reach is observer-scaled. It stays at SIX.

**Retire, don't adapt.** The project's two prior card deletions (cycle 93 `cannonBlast`, cycle 95 `mineTrigger`) both retired their tests rather than rewriting them around a surviving mechanism, precisely so no unused knob or vestigial assertion survives. Tests whose *subject* is the card go. Tests that merely used the card as a convenient way to widen radar keep their subject and change their scaffolding — several already drive raw numbers or poke `stats` directly (`foghorn`, `dimMaskLifetime`, `hullOverRadar`) and need only a name/comment edit.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity errors
- `npm test -w shared` -- expected: pass, with the retargeted catalog/deck/stat counts
- `npm test -w server` -- expected: pass, including `bots.test.ts`'s "every weight key exists in the catalog" assertion
- `npm test -w client` -- expected: pass
- `npm run build` -- expected: shared → client → server all build
- `grep -rn "intelRange" shared/src server/src server/scripts client/src` -- expected: **no matches**
- Note: `npm run check` is known to exit 1 on this machine from a pre-existing load-flaky map-generation timing guard (cycle 117 finding) — that failure is unrelated and must not be "fixed" here.

## Auto Run Result

Status: **done**. Cycle 119, version 0.17.119, `PROTOCOL_VERSION` 45 → 46, epic-7 amendment 31.

Baseline `7157dc4` → `3b28a21` (shared + docs) → `7114c3c` (server + client) → review-gate patch.

**Verification (run by the orchestrator, not taken on an agent's word):**
- `npm test -w shared` — 776/776, 34 files
- `npm test -w server` — 1536/1536, 58 files
- `npm test -w client` — 3150/3150, 101 files
- `npm run lint` — 0 errors (3 pre-existing `max-lines-per-function` warnings in functions this
  diff never touches)
- `npm run build` — green, shared → client → server
- `balanceProbe` runs to completion and now fails LOUDLY on a deleted id; its max-stack envelope
  reads base == maxed on every range (radar 660, sight 330, gun 660, broadside 412.5)

**Environment repair, worth recording because it hid real verification.** This worktree had no
`node_modules`, so `@salvo/*` resolved to the MAIN checkout: the build was type-checking against
a stale pre-Story-7-5 `shared/dist`, 12 server suites could not load at all (`colyseus`
unresolvable, contributing 0 tests), and 9 client suites could not collect. Repaired with
gitignored symlinks only — no code workaround, no dependency version change. Server coverage went
from 1266 tests over 46 loadable files to **1536 over 58**. Anyone verifying a worktree on this
machine should expect the same and repair it the same way rather than reporting the reduced
numbers as green.
