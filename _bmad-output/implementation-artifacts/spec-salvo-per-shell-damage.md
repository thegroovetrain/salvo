---
title: 'Every Shell That Connects Deals Damage — retiring the same-click salvo single-hit rule'
type: 'bugfix'
created: '2026-08-05'
status: 'done'
baseline_revision: 'cf74009790dc6dec30d837ebc4d6014aac9d3aca'
review_loop_iteration: 0
final_revision: 'd72a070'
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** A TWIN/TRIPLE MOUNT gun click fires 2–3 real shells, but `World.claimSalvoHit()` holds any one victim to a SINGLE damage application per click — so a hull inside all three overlapping bursts takes one shell's damage and the two rare MOUNT cards add zero single-target damage. Eric (2026-08-05): *"if all the bullets hit, it only counts for damage once. That's wrong. Everything that connects should deal damage."*

**Approach:** Delete the same-click salvo single-hit rule outright — the ledger, the tag, and the two gates — so each shell resolves through the normal `hitShip` choke independently. Re-pin the one-hit-kill guardrail as a **per-SHELL** law (Eric ruling, this cycle), and aggregate the victim's same-frame `dmg` events client-side into ONE honest shake + ONE tone so a 3× hit feels like a 3× hit instead of a 1× hit with a tripled tone.

## Boundaries & Constraints

**Always:**
- Damage still flows exclusively through `World.hitShip()` — kill credit, `dmg` emission, sink handling, and the damage-suppression phase guard are untouched.
- Permanent owner immunity is untouched: a firer is never hit by its own shells, at any barrel count.
- The `salvo` tag was NEVER on the wire; deleting it requires **no `PROTOCOL_VERSION` bump** (23 stands) and no change to any perception/wire-shape guard.
- Area throughput is preserved by construction — different victims already each took their own hit; now the same victim does too.
- Every deletion is complete: no orphaned field, map, method, call site, or stale rationale comment survives.

**Block If:**
- Removing the gates turns out to change behavior for any weapon OTHER than the multi-barrel gun (only `guns.ts` ever wrote the tag; if a second writer exists, stop and report).
- Any perception/anti-cheat invariant test fails — that would mean the tag was observable after all.

**Never:**
- Do NOT retune `CONFIG.gun.damage`, `contactDamage`, `burstRadius`, `BARREL_FAN_STEP_RAD`, the `gunBarrel` catalog step, drone hp, or any class hp. Eric ruled the numbers stand as-is; this cycle is mechanism-only.
- Do NOT replace the rule with a cap, a falloff, or a diminishing-returns curve — all three were explicitly REJECTED by Eric in favor of full damage per shell.
- Do NOT touch `Match.checkWin()`, the muzzle-flash per-tick dedupe, or the `hc`/`sp` gunnery-feed dedupe — all are presentational or unrelated and all stay exactly as shipped.
- Do NOT edit design docs (`DESIGN.md`, `EXPERIENCE.md`, GDD, `epics.md`) in-cycle — house rule; ledger any drift instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Triple mount, one hull in all 3 bursts | 3 barrels, victim at the click point | 3 `dmg` events, `3 × gun.damage` total hp lost | No error expected |
| Triple mount, two hulls straddling the fan | 2 victims, each inside a subset of bursts | Each victim takes one application PER burst that contains it | No error expected |
| Single-barrel click | `barrels === 1` | Byte-for-byte unchanged (a salvo of one was always trivially satisfied) | No error expected |
| Mixed contact + burst in one click | Shell A intercepted early on the victim, shell B bursts on it | Victim takes `contactDamage` AND `damage` — both connected | No error expected |
| Same shell, one victim | Any single shell | Still exactly ONE application — contact XOR burst, never both (the shipped no-double-dipping rule is per-SHELL and survives) | No error expected |
| Max-stacked triple mount vs 80hp small drone | 5× HEAVY SHELLS + 2× MOUNT, all 3 connect | 90 damage — the drone dies in one click. ACCEPTED (Eric ruling) | Not an error |
| Victim takes 3 hits in one frame | 3 `dmg` events, same frame | ONE shake at the SUMMED amount, ONE tone | No error expected |
| Victim takes 1 hit in a frame | 1 `dmg` event | Byte-for-byte identical to today (shake at that amount, one tone) | No error expected |
| Burn DoT flush alone in a frame | One small incendiary flush | Still classifies as `burn` (sum == the single amount) | No error expected |

</intent-contract>

## Code Map

- `shared/src/sim/shell.ts` -- `ShellState.salvo` field + its 11-line rationale block (lines ~97–107). The tag itself; `stepShell` never reads it.
- `server/src/game/equipment/guns.ts` -- `fireGunShells`: the ONLY writer of the tag (line ~151) + the 9-line "SAME-CLICK SALVO SINGLE-HIT RULE" doc block (~104–112).
- `server/src/game/world.ts` -- `salvoHits` map (~511–520), `claimSalvoHit()` (~1720–1738), `releaseSalvo()` (~1741–1748), its call site in `stepShells` (~1487–1489), and the two damage gates in `resolveShell` (~1850–1852, contact) and `resolveBurst` (~1924–1926, burst).
- `shared/src/__tests__/damageGuardrail.test.ts` -- the `'a FULL TRIPLE-BARREL SALVO...'` pin (~107–120): passes numerically but its title/comment assert a rule that no longer exists. Must be rewritten as the per-SHELL law.
- `server/src/__tests__/combat.test.ts` -- the whole `describe('same-click salvo — one victim, one damage application')` block (~371–433): all three `it()`s assert the removed behavior and invert.
- `client/src/net/roomBindings.ts` -- `handleEvents` (~469–472) and `handleDamage` (~878–883): the per-event shake+tone that must become a per-frame aggregate.
- `server/src/__tests__/perception.test.ts` -- `BALLISTIC_KEYS` wire-shape guard (~216–218). Positive whitelist, never names `salvo`. **No edit needed** — confirms the tag was invisible.
- `server/src/__tests__/gunnery.test.ts` -- the multi-barrel `mz` dedupe test (~124–131). No damage assertion; must stay green untouched.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/shell.ts` -- Delete the `salvo?: string` field and its rationale block -- the tag has no remaining reader.
- [x] `server/src/game/equipment/guns.ts` -- Delete the tag-writing line and rewrite the doc block to state the ratified per-shell rule (each barrel is a real shell that deals full damage where it connects) -- the rationale must record the new law, not the deleted one.
- [x] `server/src/game/world.ts` -- Delete `salvoHits`, `claimSalvoHit()`, `releaseSalvo()`, the `releaseSalvo` call site, and both damage gates; repair every rationale comment that cites same-click double-dipping (`resolveBurst` doc, the `resolved` counter comment) so no stale claim survives -- complete removal, no orphans.
- [x] `client/src/net/roomBindings.ts` -- Aggregate the local player's `dmg` events within one frame: accumulate in `handleDamage`, flush ONCE at the end of `handleEvents` as a single `shake.trigger(total)` + single tone, classifying burn on the summed amount -- `triggerShake` takes `max`, so three separate 15hp triggers would report a 15hp hit for 45hp of damage.
- [x] `shared/src/__tests__/damageGuardrail.test.ts` -- Replace the salvo pin with the ratified per-SHELL law: every max-stacked ladder stays under the lightest hull PER SHELL, and record in-comment that a multi-shell click may legitimately exceed it (Eric ruling 2026-08-05) -- CI-as-policy must state the law that actually holds.
- [x] `server/src/__tests__/combat.test.ts` -- Rewrite the salvo describe block into its inverse: a hull inside all three bursts takes THREE applications totalling `3 × damage`; area throughput still holds for two hulls; contact and burst from DIFFERENT shells of one click both land -- these are the regressions that prove the fix.
- [x] `client/src/__tests__/roomBindings.test.ts` -- Add coverage for the frame aggregate: three same-frame `dmg` events produce one shake at the summed amount and one tone; a single event is unchanged -- pins the feel fix.

**Acceptance Criteria:**
- Given a triple-mount gun and a hull inside all three bursts, when the player clicks once, then the hull loses `3 × gun.damage` hp and receives three `dmg` events.
- Given a single-barrel gun, when the player clicks, then damage resolution is byte-for-byte identical to before this change.
- Given any single shell, when it both could contact and burst on one victim, then that victim still takes exactly one application from that shell.
- Given the local player takes three hits in one frame, when the frame is handled, then exactly one shake fires at the summed magnitude and exactly one damage tone plays.
- Given the full test suite, when `npm run check` runs, then lint, all three type-checks, and every test pass — including the untouched perception invariants and the multi-barrel `mz` dedupe test.

## Spec Change Log

## Review Triage Log

### 2026-08-05 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 4, low 2)
- defer: 3: (high 0, medium 2, low 1)
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` The rewritten AREA THROUGHPUT test was tautological — `toBeGreaterThanOrEqual(1)` is satisfied by the deleted rule, and its hp check summed the same events it asserted against, so it could not fail on revert. Measured the real geometry (each hull sits inside 2 of the 3 bursts) and pinned exact counts: `toHaveLength(2)` per hull plus `hp === maxHp - 2 × damage`. Now fails outright if the salvo rule returns.
  - `[medium]` `[patch]` The CONTACT+BURST test asserted only `toContain`, so an `amounts` array of `[6,15,15,15]` — i.e. a shell that double-dipped — would have passed while the comment claimed the opposite. Added `toHaveLength(2)` and an exact sorted-pair equality, which is what actually pins the surviving per-SHELL rule.
  - `[medium]` `[patch]` Burn identity misclassified under the new aggregate: `BURN_AMOUNT_CAP`'s ×4 headroom was derived for ONE event, but `applyZoneEffects` emits one bite per (owner, victim) per tick, so four distinct enemy burners (~2.75hp each) sum past the 10hp cap and pure fire reported as an impact. Reworked to classify PER EVENT and fold (the frame reads as fire only when every application does), with a regression test for the four-burner case.
  - `[low]` `[patch]` The aggregate flushed AFTER the fan-out, so on the death frame the sink cue played before the thud that caused it (the server pushes `dmg` then `sunk`). Moved the flush to a pre-pass over `f.events`, dropping `BindState.dmgSum` entirely; added a test pinning the `['damage','sink']` order.
  - `[low]` `[patch]` The re-pinned guardrail comment claimed "no PLAYER hull can be one-clicked" while a burst also detonates the shooter's own armed mines inside `burstRadius` (`detonateMinesInBurst` + the 2.8 same-owner cascade), which can exceed any hull's hp. Scoped the claim explicitly to gun shells and named the minefield exclusion.
  - `[medium]` `[patch]` The cycle carried none of the release bookkeeping every landed cycle requires. Added: `VERSION` + `package.json` → 0.17.48, epic-4 amendments 35-39, the `sprint-status.yaml` entry, the `gds-workflow-status.yaml` `last_updated` + `next_expected` update (both YAMLs validated as parsing), and the spec doc itself tracked in the commit.

## Design Notes

**Why this was never Eric's rule.** The salvo single-hit rule was an *orchestrator* ruling made during the Story 2.8 review (`spec-2-8-boon-catalog-v1.md:142`), invented to protect Eric's actual law — `HULLCRACKER_NOTES.md:83`, *"nothing should be a 1-hit kill on an otherwise undamaged ship."* At that time the gun dealt 25 and the lightest hull was 70hp, so `3 × 25 = 75` breached the law **at base**, with no upgrades at all. The cycle-44 rebalance dissolved that premise: gun 15 base, lightest hull 80hp, so `3 × 15 = 45` is safe by a wide margin.

**The ratified reinterpretation (Eric ruling 2026-08-05).** The law governs a single SHELL, not a single CLICK. Three shells landing is three hits. The consequence Eric was shown and accepted: a fully max-stacked triple mount (5× HEAVY SHELLS → 30/shell, 2× MOUNT cards → 3 barrels) deals 90 and one-clicks an undamaged 80hp small drone. No player hull can be one-clicked — the lightest is the 125hp Torpedo Boat, which takes 72%. Eric explicitly rejected three alternatives: falloff on later same-click hits, an aggregate cap below the floor, and shrinking the HEAVY SHELLS step.

**Geometry, for the record.** `BARREL_FAN_STEP_RAD` is 3° and `gun.burstRadius` is 15u, so adjacent burst centers sit `R × 0.052` apart — they stop overlapping only past ~573u, against a 660u base gun range. Overlap is therefore the normal case at fighting range, which is exactly why the MOUNT cards read as dead weight today and why removing the rule is a genuine power increase, not a corner-case fix.

**Why the client change is in scope.** `triggerShake` resolves collisions with `Math.max`, not a sum. Left alone, a victim taking `15 + 15 + 15` would feel a 15hp shake while three identical tones fire in the same frame and simply smear. That would make the damage upgrade land invisibly — a direct contradiction of Story 2.9 ("the build must be felt"). Aggregating per frame applies the grammar the shooter's side already ships (`CLIENT_CONFIG.gunnery.hitCallToneFloorMs`: *"three overlapping muffled booms are just a smear"*) to the victim's side. No new tunable is invented.

**Burn identity survives.** `readsAsBurn` classifies on the summed amount. A lone DoT flush sums to itself and still reads as `burn`; a shell landing in the same frame as a flush sums past `BURN_AMOUNT_CAP` (10hp) and correctly reads as the slam it was.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10 holds — the change is net-deleting), all three workspaces type-check, and the full suite passes with the rewritten guardrail/combat/roomBindings tests.
- `npm test -w server` -- expected: the rewritten `combat.test.ts` salvo block proves 3 applications; `gunnery.test.ts` `mz` dedupe and `perception.test.ts` invariants pass untouched.
- `npm test -w shared` -- expected: `damageGuardrail.test.ts` pins the per-SHELL law and still fails if any single weapon's max-stacked damage reaches the 80hp floor.
- `grep -rn "salvo" server/src/game shared/src/sim client/src/net` -- expected: zero hits other than `@salvo/shared` package imports and presentational comments that legitimately use the word for "a volley".

## Auto Run Result

Status: **done** (cycle 48, 0.17.48)

### Implemented change

The Story 2.8 review's same-click salvo single-hit rule is deleted in full — `ShellState.salvo`,
`World.salvoHits`, `claimSalvoHit()`, `releaseSalvo()` and its call site, and both damage gates. Every
shell of a multi-barrel gun click that connects now deals full damage. The one-hit-kill guardrail is
re-pinned as a per-SHELL law (Eric ruling 2026-08-05), with a NEW CI pin — `perShell × barrels <
min(classHps)` — so "no player hull is ever one-clicked by gunfire" is enforced rather than assumed.
Client victim feedback became a per-frame aggregate (one shake at the summed magnitude, one cue),
without which the ruling would have landed invisibly: `triggerShake` resolves collisions with
`Math.max`, so a 45hp click would have reported a 15hp hit.

### Files changed

- `shared/src/sim/shell.ts` — deleted the `salvo` field and its rationale block.
- `server/src/game/equipment/guns.ts` — deleted the only tag writer; doc block rewritten to record the
  new law, the burst geometry, and why the old premise dissolved.
- `server/src/game/world.ts` — deleted the ledger, both methods, the call site, and both gates; three
  rationale comments repaired (including the `resolved` counter, which was doubly stale).
- `client/src/net/roomBindings.ts` — own damage resolved once per frame in a pre-pass (`flushDamage`),
  burn classified per event then folded; `DamageEvent` import and `BindState.dmgSum` both retired.
- `shared/src/__tests__/damageGuardrail.test.ts` — per-SHELL law + the new player-hull pin, scoped
  explicitly to gun shells.
- `server/src/__tests__/combat.test.ts` — the salvo describe block inverted: 3 applications on one
  hull, exact area-throughput counts, and contact+burst from different shells of one click.
- `client/src/__tests__/roomBindings.test.ts` — 8 tests for the aggregate (sum, single-event parity, no
  cross-frame carry, silence, slam-vs-flush, lone flush, four-burner burn, death-frame ordering).
- `VERSION`, `package.json` — 0.17.47 → 0.17.48 (cycle 47 landed in parallel as PR #96; Eric renumbered this cycle to 48).
- `_bmad-output/implementation-artifacts/epic-4-context-amendments.md` — amendments 35-39.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`,
  `_bmad-output/implementation-artifacts/deferred-work.md` — cycle bookkeeping.

### Review findings

6 patches applied (4 medium, 2 low), 3 deferred, 3 rejected, 0 intent gaps, 0 bad-spec loopbacks.
Both hunters independently confirmed the deletion is complete, the per-SHELL no-double-dipping rule is
structurally intact, kill credit cannot double-fire (`sinkShip` early-returns on `!alive`), and no
anti-cheat regression exists (`dmg` is a self-private signal; the `BALLISTIC_KEYS` wire guard never
named the tag).

Rejected: holding the client aggregate ACROSS ticks to catch clicks whose shells resolve on different
frames — per-frame is the correct granularity and holding adds feedback latency; restoring the deleted
"ledger resets per click" pin — it pinned a mechanism that no longer exists; adding a `CHANGELOG.md`
entry — not this project's convention (the previous cycle's PR touched no changelog).

### Verification

- `npm run check` — GREEN. 0 lint errors (2 pre-existing `max-lines-per-function` warnings in
  `main.ts`/`menu.ts`, untouched by this cycle), all three type-checks pass, **2815 tests** (shared 422
  · server 893 · client 1500), up from 2813.
- `grep -rn "salvo" server/src/game shared/src/sim client/src/net client/src/render` — no mechanism
  remains; every hit is either the `@salvo/shared` package name, plain-English "volley", or a
  deliberate historical citation of the deleted ledger.
- Exact damage counts were measured against the real geometry with a throwaway probe (since deleted)
  rather than assumed, then hard-pinned in the tests.
- Both YAML trackers validated as parsing after edit (the `next_expected` scalar is single-quoted, so
  appended apostrophes required doubling — caught and fixed).

### Residual risks

1. **A killing click reports itself as a miss.** A burst resolving over a hull an earlier shell of the
   same click just sank emits `sp` (fall of shot) instead of `hc`, because `resolved` counts only LIVE
   victims. Pre-existing, but now common — clicks kill mid-fan far more often at 3× damage. Deferred
   rather than patched because the fix changes what "resolved" means in Story 4.3's ratified `hc`/`sp`
   grammar, and the same code path explicitly forbids counting geometric victims for the zero-damage
   star shell. **Eric-gated.**
2. **A same-tick shell can be consumed by a wreck** (the per-tick hull snapshot is not refreshed on
   sink), denying its burst to live hulls. Pre-existing, same aggravating factor. Deferred.
3. **`burnShakeScale` is inert** for every DoT flush the server can emit (the 4px shake floor swallows
   it), so half of the ratified burn-identity rule is undelivered. Pre-existing and unchanged by this
   cycle. Deferred.
4. **Doc drift:** `HULLCRACKER_NOTES.md:83` still states the one-hit-kill law without the per-SHELL
   qualifier, and `CLAUDE.md` still records `PROTOCOL_VERSION` as 23 (actual: 24). Both routed to the
   Eric-gated 7-5 doc-sync batch per the house no-design-doc-edits rule.
5. **Correction of record:** the intent contract's Boundaries line says "no `PROTOCOL_VERSION` bump (23
   stands)". The substantive claim is right — no bump is needed, the tag was never on the wire — but
   the current value is **24**, not 23. The contract is read-only under the workflow rules, so the
   correction is recorded here and in amendment 38 rather than edited in place.

Follow-up review recommended: **true** — the client damage-feedback path was materially reworked
during the review pass (accumulator → pre-pass, sum-classification → per-event fold), which is a
behavior change to a felt system that no independent reviewer has seen in its final shape.
