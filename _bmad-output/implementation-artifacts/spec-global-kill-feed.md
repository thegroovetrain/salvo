---
title: 'The Public Register — a global kill feed'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_revision: 'fc83e7af7a7fe5eba5cf004e9e19ceeb375467ca'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '41088e3d82e6e1a4c2f368322423b9a6c25791f3'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** A captain only learns that A sank B if they could *see the wreck* (`sunk` row, `server/src/game/signals.ts:641-652`) — yet `PlayerMeta.kills`/`deaths`/`alive` already sync live to every client every tick (`ArenaRoom.ts:859-871`), so the information is public and only the *feed line* is withheld. The result is a match register that silently omits most of the match, and a shooter who lands a fog kill gets no confirmation and no "SHIPS YOU SANK" credit.

**Approach:** Widen the `sunk` row's gate to three clauses — **witnessed** (today's rule, unchanged), **or the victim is a combatant** (the public register: every captain's sinking reaches every client), **or you are the killer** (you learn that anything you sank went down, combatant or not). Add a per-observer `seen` flag through the row's existing `materialize()` so everything *spatial* (sink VFX, contact-view teardown) stays exactly as gated as it is today. The event payload carries no position, so no clause leaks anything the roster schema does not already broadcast. Non-combatants stay off the public register because they are not contestants: a drone kill is worth a fraction of a level (`CONFIG.xp.droneTierLevels`) where a captain is worth a full one — and the same reasoning makes `n AFLOAT` a humans-only count.

## Boundaries & Constraints

**Always:**
- The public path is **identity only** — `{k:'sunk', id, by?}` gains no position, class, hue, damage, or weapon field. The one new field is the per-observer `seen` boolean.
- Everything positional stays behind `seen`: the sink VFX and `contactViews.markSunk` fire **only** when the observer legitimately witnessed the wreck (sight+LOS, or a lit zone they own, or it was their own hull, or they are a spectator).
- `seen` is computed from the **existing** predicate verbatim — `pointSighted(me, wreck.state, islands, now) || ownZoneCovers(ctx, wreck.state)` — so today's gate keeps its exact meaning and simply becomes a flag instead of a filter.
- Non-combatant (drone) victims are delivered on exactly two paths: **witnessed** (today's rule, unchanged) or **you are the killer** (`e.by === ctx.me.id`). Never globally.
- The killer clause is the same principle Story 4.3 amendment 17 ratified for the Hit Call — shooter-only confirmation that something of yours connected, deliberately reaching past sight. It must be written as one named predicate so the future "or the killer's TEAM" extension changes at a single site.
- `sunk` becomes the **4th declared exception** to the master perception invariant (joining `sp`/`hc`/`mz` from Story 4.3). It needs its own independently-reimplemented oracle in `perception.test.ts`, and the completeness suite must still pass.
- `PROTOCOL_VERSION` bumps 22 → 23 (wire payload gained a field). `VERSION` bumps to 0.17.45 (cycle 45 — cycle 44/0.17.44 was the per-weapon balance pass, developed in parallel and landed first; this spec was written against 0.17.43 and renumbered on merge).
- Signal-registry row count stays **18** — this amends a row, it does not add one.
- Wire key order is load-bearing: `k, id, by?, seen?`. Never emit a key with an `undefined` value.

**Block If:**
- The change would require sending any spatial field to an observer who cannot see the wreck.
- The registry row count or the completeness/invariant suites cannot be made to pass without weakening an existing oracle for a signal other than `sunk`.

**Never:**
- Do not broadcast **drone** deaths (Eric ruling — drones are temporary scaffolding). Do not broadcast PvE-ship deaths (none exist yet; leave the predicate shaped so a future combat bot can be flipped in at one site).
- Do not add a witnessed/reported visual distinction — a kill is a kill, identical styling (Eric ruling).
- Do not gate the kill tone or score credit on `seen` — a fog kill gets both (Eric ruling).
- **Do not touch `Match.checkWin()` or the drone-gated win condition.** Eric deferred that change to Story 6-3 ("The Participants-Only Win Check"). Drones still gate the win today; only the feed and the AFLOAT count change here.
- Do not edit `DESIGN.md` / `EXPERIENCE.md` / `epics.md` in-cycle. Ledger the UX-DR17 drift to the Eric-gated 7-5 doc-sync batch (house rule; see amendments 14 and 21-24).
- Do not touch the roster schema, `ResultsMsg`, or any other signal row.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fog kill, third-party observer | Human `b` sunk by human `a`; observer `c` is far away, no LOS | `c` receives `{k:'sunk', id:'b', by:'a'}` with **no** `seen`; feed prints `B SUNK BY A`; **no** sink VFX, **no** `markSunk` | No error expected |
| Witnessed kill | Observer `c` is 150u from the wreck, LOS clear | `c` receives the event with `seen: true`; feed line **and** sink VFX **and** `markSunk`, exactly as today | No error expected |
| Own fog kill | `a` sinks `b` beyond sight | `a` gets the event (no `seen`), the feed line, the `kill` tone, and a `recordSunk` score credit | No error expected |
| Storm / unattributed death of a human | `b` sinks with no killer | Every client gets `{k:'sunk', id:'b'}` (no `by`); feed prints `B LOST WITH ALL HANDS` | `by` absent, never `undefined`-valued |
| Drone victim, someone else's kill, unwitnessed | Drone `d` sunk by `a`; observer `c` far away | `c` receives **nothing** — unchanged from today | No error expected |
| Drone victim, witnessed | Observer can see the drone wreck | Event delivered with `seen: true`; feed line + VFX, unchanged from today | No error expected |
| Drone victim, MY kill, unwitnessed | `a` sinks drone `d` beyond sight | `a` receives `{k:'sunk', id:'d', by:'a'}` with no `seen`; feed line (drone name in grey) + `kill` tone + score credit; no VFX | No error expected |
| Victim record missing | `ctx.ships.get(e.id)` is `undefined` | Fail closed: not visible, no `seen` | Returns false, no throw |
| Spectator | Dead or post-match observer | Raw event, always `seen: true` | No error expected |

</intent-contract>

## Code Map

- `shared/src/types.ts:467-472` -- `SunkEvent`; add the optional `seen` field with its wire-contract comment.
- `shared/src/index.ts:150` -- `PROTOCOL_VERSION` 22 → 23.
- `server/src/game/signals.ts:633-652` -- the `sunk` row: split the current predicate into a `sunkWitnessed()` helper, widen `visible()` to the public register for non-drone victims, and rewrite `materialize()` to stamp `seen`. Row doc comment must record the exception and its rationale.
- `server/src/game/world.ts:231` -- `ShipRecord.isDrone`, the discriminator the new predicate reads.
- `client/src/net/roomBindings.ts:790-811` -- `handleSunk`: gate `spawnEffect('sink', …)` and `contactViews.markSunk` on `e.seen`; leave the feed line, `onSunkObserved`, the `kill` tone, and the own-death branch ungated.
- `client/src/ui/killFeed.ts:20-22` -- `LINE_TTL_MS` 6000 → 8000, `MAX_LINES` 5 → 6.
- `client/src/score.ts:116-152` -- `isAfloatHull` / `afloatCount`: exclude drones (the `droneHue` sentinel `isLiveRival` already takes). The doctrine comment at `:120-131` is now WRONG and must be rewritten, not deleted.
- `client/src/main.ts:850-852` -- the `afloat:` wiring point and its amendment-19 comment; `client/src/ui/chromeBar.ts:14,153-154` -- the same claim in two more comments.
- `server/src/__tests__/perception.test.ts:1036-1043` -- `verifySunk`, the independent invariant oracle; `:415-453` the targeted sight tests; `:1247` the row-count pin (stays 18).
- `server/src/__tests__/signals.test.ts:488-511` -- the row's zone-ownership unit tests.
- `server/src/__tests__/frames.test.ts:183-194` -- per-client `sunk` delivery.
- `server/src/__tests__/spectator.test.ts:307-309` -- the spectator-path verifier.
- `client/src/__tests__/killFeed.test.ts` -- cap/TTL assertions.
- `client/src/__tests__/roomBindings.test.ts:293-330` -- own-`sunk` handling.
- `_bmad-output/implementation-artifacts/epic-4-context-amendments.md` -- amendments 29-34 (append only).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/deferred-work.md`, `VERSION`, `package.json`, `CLAUDE.md` -- cycle bookkeeping.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/types.ts` -- add `seen?: true` to `SunkEvent` with a comment stating it is per-observer, means "you legitimately witnessed the wreck", and gates everything spatial -- the wire contract is the one place this must be unambiguous.
- [x] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 23 -- the payload shape changed, and the version is a live join gate.
- [x] `server/src/game/signals.ts` -- extract `sunkWitnessed(ctx, e)` from the current predicate; add a named `sunkCreditedTo(ctx, e)` for the killer clause (the future team-extension site); `visible()` returns `sunkWitnessed(...) || sunkCreditedTo(...) || (wreck !== undefined && !wreck.isDrone)`; `materialize()` builds a fresh object in key order `k, id, by?, seen?`, omitting absent keys entirely -- the registry is the single chokepoint, and `materialize` is the sanctioned per-observer shaper.
- [x] `client/src/net/roomBindings.ts` -- in `handleSunk`, wrap the `sunkPosition`/`spawnEffect('sink', …)` call and the `contactViews.markSunk(e.id)` call in `if (e.seen)`; leave the feed line, `onSunkObserved`, the `kill` tone, and the own-death branch unconditional -- a stale last-known position must never draw a plume for a kill you did not see.
- [x] `client/src/ui/killFeed.ts` -- `LINE_TTL_MS = 8000`, `MAX_LINES = 6` -- Eric ruling: a global feed carries more traffic and needs the headroom.
- [x] `client/src/score.ts` -- give `isAfloatHull` the `droneHue` sentinel and exclude drones; thread it through `afloatCount`; REWRITE the amendment-19 doctrine comment to state the new rule and why (drones are not combatants — a fraction of a level, not a full one) -- the old comment argues the opposite case and would become a live lie.
- [x] `client/src/main.ts`, `client/src/ui/chromeBar.ts` -- update the `afloat:` call site to pass the drone hue and correct the three amendment-19 comments -- a stale "counts drones" comment in three files is how the next cycle re-introduces the bug.
- [x] `client/src/__tests__/` (score/chromeBar suites) -- assert AFLOAT excludes drones and still counts the local player -- the local-player inclusion is the half of the asymmetry that SURVIVES.
- [x] `server/src/__tests__/perception.test.ts` -- rewrite `verifySunk` as an independent oracle: victim-is-self returns; a drone victim MUST be sighted-or-owned-zone OR killed by the observer; a human victim is unconditionally allowed; and in every case, if `seen` is present the sight-or-owned-zone condition MUST hold. Add targeted cases for the fog-kill third party, the drone-unwitnessed-by-a-bystander case, the drone-killed-by-me case, and `seen` absence/presence. Keep the row-count pin at 18.
- [x] `server/src/__tests__/signals.test.ts` -- add cases for the widened `visible()` (human victim beyond sight → true; drone victim beyond sight to a bystander → false; the SAME drone to its killer → true) and pin the materialized key order for both the `seen` and no-`seen` shapes, including the no-killer variant.
- [x] `server/src/__tests__/frames.test.ts`, `server/src/__tests__/spectator.test.ts` -- update to the new delivery rule; spectators always carry `seen: true`.
- [x] `client/src/__tests__/roomBindings.test.ts` -- assert an unseen `sunk` prints a feed line but spawns no sink effect and calls no `markSunk`, and that a `seen` one does both; assert an own fog kill still plays the `kill` tone and reaches `onSunkObserved`.
- [x] `client/src/__tests__/killFeed.test.ts` -- update the cap test to 6 lines and the TTL expectation to 8s.
- [x] `_bmad-output/implementation-artifacts/epic-4-context-amendments.md` -- append amendments 29-34 recording the Eric rulings verbatim-sourced (including the two reversals on drone status and the reasoning path, since the discarded branches are what a future cycle will re-propose), plus the declared-exception note and the UX-DR17 doc drift -- ratified corrections must live in the durable file, never only in regenerable context.
- [x] `VERSION`, `package.json` (+ workspace manifests if they carry the version) -- 0.17.43 → 0.17.45 -- cycle 45 (renumbered on merge; see the note above).
- [x] `CLAUDE.md` -- update `PROTOCOL_VERSION` to 23 and add a Key Decision bullet for the public register -- CLAUDE.md is the standing architecture brief.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and `_bmad-output/gds-workflow-status.yaml` -- record cycle 45 -- both trackers must move in the same PR.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger the UX-DR17 (`DESIGN.md`) and `epics.md:534` 5-lines/6s drift into the 7-5 doc-sync batch -- no design-doc edits in-cycle.

**Acceptance Criteria:**
- Given a human captain sunk anywhere on the map, when any living client receives that tick's frame, then it contains the `sunk` event and the kill feed prints the line, whether or not the wreck was in sight.
- Given an observer who could not see the wreck, when the `sunk` event arrives, then no sink effect is spawned and no contact view is marked sunk, and the event carries no positional field of any kind.
- Given a drone is sunk out of a bystander's sight by someone else, when frames are built, then that bystander receives no `sunk` event at all.
- Given a captain sinks a drone beyond their own sight, when the event arrives, then they get the feed line, the `kill` tone, and the score credit — the killer always learns what they sank.
- Given a captain sinks an enemy beyond their own sight, when the event arrives, then the `kill` tone plays and the sinking is recorded in their personal "SHIPS YOU SANK" score.
- Given the full test suite runs, when the perception invariant property tests execute over their seeded worlds, then the `sunk` oracle passes with `sunk` as a declared exception and the registry row count is still 18.
- Given seven kill lines land inside eight seconds, when the feed renders, then at most 6 lines are shown and each expires 8s after it landed.
- Given a room of 4 humans and 16 drones all alive, when the chrome bar renders, then it reads `4 AFLOAT`, and it still counts the local player.
- Given the whole change set, when `Match.checkWin()` is inspected, then it is byte-identical to `baseline_revision` — the drone-gated win condition is untouched and belongs to Story 6-3.

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 1, medium 3, low 4)
- defer: 6: (high 0, medium 5, low 1)
- reject: 3: (high 0, medium 1, low 2)
- addressed_findings:
  - `[high]` `[patch]` The declared-exception oracle asserted the VISIBILITY rule but never the wire PAYLOAD, so a positional field added at the world emission — or a `materialize()` regression back to pass-through — would have reached every fogged client with the master invariant suite still green. `verifySunk` now pins `Object.keys(ev) ⊆ {k,id,by,seen}` before any visibility logic, giving the spec's "Block If: any spatial field to an unsighted observer" boundary a property-level backstop.
  - `[medium]` `[patch]` `verifySunk` encoded a STRICTER rule than the row it verifies: it asserted the wreck record exists, but production `visible()` deliberately delivers to the credited killer without consulting one. The oracle would have rejected a legitimate delivery the moment a victim's record is removed in the tick its `sunk` rides. Restructured so the record-absent path asserts exactly what production permits (`by === me` and `seen` ABSENT). Same latent shape found and fixed in `spectator.test.ts`'s `verifyFoggedEvent`.
  - `[medium]` `[patch]` A departed player's raw Colyseus session id would now print in EVERY client's kill feed (`rosterName`'s id fallback, blast radius widened from witnesses-only to the whole room). The feed now renders a neutral `UNKNOWN VESSEL`; `rosterName` itself proved to have no other callers and was removed as dead code, with every consumer now supplying its own null policy.
  - `[medium]` `[patch]` The row's own anti-leak rationale overstated its case — it claimed a client could already derive "A killed B" from schema deltas "at tick precision". False twice over: frame events are same-tick sends while schema patches ride Colyseus's patch-rate timer, and two same-tick kills by different killers aggregate into unpairable `(+1, +1)` counters where `by` pairs them exactly. Comment rewritten to claim only what is true (the schema makes the FACT public; the row makes ATTRIBUTION explicit and same-tick). The ratification is unaffected — the payload is still identity-only.
  - `[low]` `[patch]` Scoped the "independently reimplemented oracle" claim honestly: the sight/zone terms are genuine reimplementations, but the drone discrimination reads the same production `isDrone` field the row reads, so a hull mis-flagged at construction would put row and oracle in agreement on the same wrong answer.
  - `[low]` `[patch]` Documented the sentinel contract `isAfloatHull` now leans on — `REGATTA_NO_HUE` means both "drone" and "hue not yet assigned", and an `alive` entry with an undefined colour counts as a captain by design (correct, previously undocumented).
  - `[low]` `[patch]` The `score.ts` module header rewritten this cycle claimed the personal roll matches the roster tally; two retained paths contradict it (`scoreAfterReconnect` wipes the roll, `recordSunk` skips a departed victim). Reworded to "complete while connected", naming both exceptions.
  - `[low]` `[patch]` Corrected the orphaned consistency argument in the chrome-bar comments: AFLOAT is now captains-only while KILLS still counts every hull, so the two deliberately differ pending a ruling. Behavior untouched.

## Design Notes

**Why this is not a new fog leak.** `syncRoster()` already mirrors `alive`, `kills`, and `deaths` to every client every tick, and the `sunk` row's own comment ratifies the principle: *"Everyone still learns alive/kills/deaths from the public roster schema — sinking is public knowledge, its LOCATION is not."* A client can already derive "A killed B" from schema deltas at tick precision; the feed line just says out loud what the schema whispers. The declared exception is therefore a *reconciliation* of the row with its own stated principle, not a widening of it.

**Why a `seen` flag rather than client-side derivation.** The client's contact buffer keeps the last-known snapshot with no freshness contract, so "was this hull visible when it died?" cannot be answered honestly on the client. The server is the authority on what an observer saw, and `materialize(ctx, subject)` is the registry's existing per-observer shaper — this is what it is for.

**The shape of the predicate** (illustrative, not prescriptive):

```ts
function sunkWitnessed(ctx: SignalContext, e: SunkEvent): boolean {
  if (ctx.mode === 'spectator' || e.id === ctx.me.id) return true;
  const wreck = ctx.ships.get(e.id);
  if (wreck === undefined) return false;
  return pointSighted(ctx.me, wreck.state, ctx.islands, ctx.now) || ownZoneCovers(ctx, wreck.state);
}

/** Your kill. The future "or a teammate's kill" extension changes HERE and nowhere else. */
function sunkCreditedTo(ctx: SignalContext, e: SunkEvent): boolean {
  return e.by !== undefined && e.by === ctx.me.id;
}
```

`visible()` then reads: witnessed, **or** credited to you, **or** the victim belongs on the public register (`!wreck.isDrone`). Three clauses, three separate reasons, each independently testable — and `!wreck.isDrone` is the single site a future PvE/combat-bot distinction changes.

**Why the killer clause is not a new principle.** Story 4.3 amendment 17 already ratified that a shooter learns their ordnance connected even through fog, knowingly superseding the old anti-leak rule for the owner-hit case. "Your target went down" is the terminal case of that same conversation. It also closes a real gap: today a fog kill never reaches `recordSunk`, so it is missing from "SHIPS YOU SANK" even though the server's roster tally counted it.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), all three workspaces type-check, full suite green with the new cases.
- `npm test -w server` -- expected: perception invariant + completeness suites pass with `sunk` as a declared exception; registry length still 18.
- `npm test -w client` -- expected: kill-feed cap/TTL and `roomBindings` seen/unseen split pass.
- `npm run build` -- expected: shared → client → server build clean.

**Manual checks (if no CLI):**
- Confirm no key in the materialized `sunk` payload is ever present with an `undefined` value (msgpack encodes it; the no-killer path must omit `by` entirely).
</content>

## Auto Run Result

Status: **done**. Cycle 45 (0.17.45). Branch `worktree-dev-auto-global-kill-feed`.

**What shipped.** The kill feed is global. The `sunk` registry row became the 4th declared exception to
the master perception invariant, gated by three clauses — witnessed (the historical rule, extracted
verbatim), credited-to-you (you learn anything you sank went down, at any range through any fog), or
the victim is a combatant. A per-observer `seen?: true` flag, stamped by `materialize()` exactly when
the witness predicate holds, keeps everything SPATIAL as gated as before. `n AFLOAT` now counts
captains only. PROTOCOL_VERSION 22 → 23.

**Design gate.** Four rounds with Eric (two AskUserQuestion rounds, three mid-run interruptions),
recorded as amendments 29-34. He reversed himself twice on drone status before settling — the
amendments record the reasoning path, not just the outcome, because the discarded branches are what a
future cycle will re-propose. Two consequential deferrals came out of it: the matching win-condition
change went to Story 6-3 (dropping the drone guard outright makes a solo match finish the instant it
activates), and the `n KILLS` denominator question is ledgered unresolved.

**Files changed (26 code + 6 bookkeeping).** Server: `signals.ts` (the three-clause row + `seen`).
Shared: `types.ts` (`SunkEvent.seen`), `index.ts` (PV 23). Client: `roomBindings.ts` (spatial
reactions behind `seen`, `feedNameRef` fallback), `killFeed.ts` (6 lines / 8s TTL, `UNKNOWN_VESSEL`),
`score.ts` (captains-only AFLOAT + corrected doctrine), `main.ts`, `chromeBar.ts`. Tests: 9 suites
updated, incl. the rewritten `verifySunk` oracle and a regenerated golden-frame snapshot (diff verified
as 7 rows, all `sunk` payloads). `server/src/game/match.ts` is BYTE-IDENTICAL to baseline, as ruled.

**Review.** Two adversarial Fable passes (Blind Hunter, Edge Case Hunter). 8 patches applied, 6 items
deferred to `deferred-work.md`, 3 rejected. The single most valuable finding was that the new
declared exception's oracle pinned the visibility rule but not the wire payload — now fixed, and it is
the guard that makes the whole exception safe to leave in place.

**Verification.** `npm run check` green, run independently by the orchestrator after the patches:
lint 0 errors (2 pre-existing `max-lines-per-function` warnings in untouched functions, confirmed
present at baseline), all three workspaces type-check, **2751 tests pass** (shared 416 / server 878 /
client 1457). `npm run build` clean. `git diff` against baseline confirms `match.ts` untouched and
`package-lock.json` unchanged.

**Residual risks.**
1. **Not playtested.** Every claim here is test- and inspection-backed; nobody has watched a real
   match with a global feed. The feed's new traffic volume at 6 lines / 8s is a judgment call of
   Eric's that only live play can validate.
2. **The interim AFLOAT inconsistency is live** until Story 6-3: the bar reads captains-only while
   drones still gate the ending, so `1 AFLOAT` does not yet mean "one hull from over".
3. **Reconnect gaps** (ledgered): a resuming client silently misses every `sunk` from its
   disconnected window, and an own-sinking during the grace never replays its elimination modal —
   the second is pre-existing and independent of this cycle.
4. **PV 23 is a hard join gate.** Any client build older than this deploy is rejected at matchmake;
   server and client must ship together.
