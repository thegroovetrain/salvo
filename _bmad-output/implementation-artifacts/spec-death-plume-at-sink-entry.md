---
title: 'The death plume lands at the killing blow'
type: 'bugfix'
created: '2026-08-14'
status: 'done'
baseline_revision: '799b14f9097283335f9a4ec24545525de802e72c'
final_revision: 'c7754ee'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A hull hit for 0 HP enters its 5 s sinking window, and the crimson `sink` plume — the
red explosion that reads as *the ship blew up* — fires five seconds later at founder, on a hull that
has been visibly settling that whole time. Eric, on the water: *"There is a red explosion when the
ship sinks all the way. Makes no sense? Lets move that to the moment when the ship is brought to
0 HP or less and begins sinking. Slowly fading to black is indication enough that it has sunk."*

**Approach:** Move the plume from founder to sink-entry, inside the same `seen`-gated enqueue that
already owns the kill flash and the settle, drawn at the one `sunkPosition` read `handleSunk` already
makes for the death cue. Founder keeps the settle's arrival and the `markSunk` wreck-tint latch —
the fade IS the foundering. This partially reverses epic-5 amendment 18 (its LOCATION-at-founder
clause, for the plume only) and closes that amendment's own ledgered defect: the groan and the plume
have been ~5 s and up to 110 u apart, unseen on the water, and this reunites them at one instant and
one point.

## Boundaries & Constraints

**Always:**
- `openWreckWindow`'s `if (!e.seen) return;` stays the SINGLE gate owning every spatial channel —
  flash, plume, settle, teardown. An unwitnessed sinking draws nothing, anywhere, ever.
- Exactly ONE `sunkPosition` read per sinking, shared by the plume and the cue, so the mark and the
  groan can never disagree about where the hull was — the property `sunkCue`'s header already claims
  and that amendment 18 broke.
- The dedup guard runs BEFORE the plume: a replayed `sunk` draws one plume and one flash.
- Client presentation only: no wire field, `PROTOCOL_VERSION` stays 34, no server change, no shared
  change, no CONFIG tunable moved.
- Founder keeps `markSunk` and the settle that arrives exactly at it (`setSink(1) === setDowned(true)`
  is untouched).
- The ruling is recorded as epic-5 **amendment 32** in `epic-5-context-amendments.md`, and the
  compiled `epic-5-context.md` amendment summary gains its line.
- `npm run check` green; complexity ≤ 10.

**Block If:**
- Moving the plume turns out to need a wire field, a new `SunkEvent` key, or a seventh perception
  exception (it must not — both facts are already client-side).
- The change cannot be made without deleting or retuning the amendment-21 kill flash: that is a
  ratified Eric channel, so ledger the stacking question instead of resolving it unattended.

**Never:**
- Never draw the plume twice (entry AND founder), and never leave a founder-time plume path behind.
- Never delete the kill flash, the settle ramp, or the founder wreck-tint latch.
- Never widen disclosure: no plume for an unseen sinking, and no position invented beyond
  `sunkPosition`'s existing staleness rules.
- Never touch `CONFIG.ship.sinkingWindowMs`, the server's `founderSinking` step, or the sinking sim.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Witnessed enemy sinking | `sunk{seen}`, contact in store | Plume at the sink-entry position NOW, with the kill flash and the first settle push; NO `markSunk` yet | No error expected |
| Founder | queued deadline elapses | `markSunk` latches the wreck tint; NO second plume | No error expected |
| Unwitnessed sinking | `sunk` with no `seen` | Nothing: no plume, no flash, no settle, no teardown; feed line + credit still land | No error expected |
| Replayed `sunk` | same id twice | Exactly one plume, one flash, one queue entry | Dedup guard returns early |
| Contact unplaceable at sink-entry | `sunkPosition` → null | No plume; the hull still queues, still settles, still tears down at founder | `if (pos)` guard |
| Own death | `sunk` for our own id | Plume at our hull's sink-entry pose (from `net.you`, adopted before events); never `markSunk` on ourselves | No error expected |

</intent-contract>

## Code Map

- `client/src/net/roomBindings.ts` -- the whole path: `handleSunk` (:1417), `openWreckWindow` (:1511),
  `driveSettle` (:1534), `flushFoundered` (:1550), `presentWreck` (:1576), `sunkPosition` (:1739).
- `client/src/render/effects.ts:269` -- the `sink` ring spec (crimson, life 0.9 s). Unchanged.
- `client/src/render/contacts.ts` -- `sinkFlash` (:125), `setSink` (:135), `markSunk` (:142). Unchanged.
- `client/src/render/sinkSettle.ts` -- settle math; its header narrates the amendment-18 split and
  needs re-truthing only.
- `client/src/__tests__/roomBindings.test.ts` -- the deferral suites at :478, :586-830.
- `client/src/__tests__/sinkSettle.test.ts:98` -- "the plume lands on a match" rationale.
- `_bmad-output/implementation-artifacts/epic-5-context-amendments.md` -- amendment 32 lands here.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/net/roomBindings.ts` -- resolve `pos` once at the top of `handleSunk` and pass it to
      `openWreckWindow`; spawn the `sink` plume there, after the `seen` gate and after the dedup
      guard -- one read, one gate, one plume, and the cue keeps the same `pos`.
- [x] `client/src/net/roomBindings.ts` -- strip the plume out of `presentWreck`, leaving the founder
      beat as the `markSunk` teardown alone; rewrite the stale header blocks (:1379-1416, :1487-1510,
      :1563-1574) to state the new split -- plume + flash at the killing blow, settle across the
      window, wreck tint at founder.
- [x] `client/src/render/sinkSettle.ts` -- correct the module header: the settle no longer runs
      *toward* a deferred plume, it is the sole founder indicator. Math untouched.
- [x] `client/src/__tests__/roomBindings.test.ts` -- invert the deferral assertions: plume + flash on
      the sink-entry tick at the sink-entry position (including our own hull, :478), `markSunk` still
      withheld to founder, unseen still silent, replay still one plume, unplaceable-at-entry still
      draws no plume but still tears down.
- [x] `client/src/__tests__/sinkSettle.test.ts` -- keep the `setSink(1) === setDowned(true)` pin;
      restate its comment (the founder handover is now settle → tint, with no plume to match).
- [x] `_bmad-output/implementation-artifacts/epic-5-context-amendments.md` -- append amendment 32.
- [x] `_bmad-output/implementation-artifacts/epic-5-context.md` -- add the amendment-32 line to the
      Ratified Amendments summary.
- [x] `VERSION`, `package.json` -- 0.17.80 → 0.17.81 (cycle 81).
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`
      -- one-line cycle stamp in each (tracker discipline: both files, same PR).

**Acceptance Criteria:**
- Given a witnessed enemy hull taken to 0 HP, when the `sunk` event arrives, then the crimson plume
  draws on that tick at that hull's current position, and no plume draws at founder.
- Given that same hull, when its 5 s window elapses, then only the wreck tint latches — the player's
  cue that it is gone is the completed settle, not a second explosion.
- Given a sinking never witnessed by this client, when founder passes, then no plume, flash, settle
  or teardown is ever emitted, while the kill-feed line and credit land unchanged.
- Given our own hull is holed, when the `sunk` for our session id arrives, then our plume draws at
  our own sink-entry pose and `markSunk` is never called on ourselves.
- Given the death groan and the plume, when a witnessed hull sinks, then both resolve from the same
  `sunkPosition` read on the same tick.

## Spec Change Log

No entries — the spec was never amended; no `intent_gap` or `bad_spec` finding arose.

## Review Triage Log

### 2026-08-14 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 0, low 1)
- defer: 2: (high 0, medium 0, low 2)
- reject: 0
- addressed_findings:
  - `[low]` `[patch]` A `handleSunk` note still described the `markSunk` teardown as riding the
    deferred queue "with the plume" — true before this change, false after. Rewritten to state why
    the tint stays at founder while the plume came back.

**HOW THIS PASS WAS RUN, stated plainly because it departs from the workflow's normal guarantee:**
the two adversarial review subagents (Blind Hunter, Edge Case Hunter) were both launched against the
diff and NEITHER RETURNED — both stalled on their first read for ~2 hours under heavy machine
contention (three other background jobs running concurrently) and were stopped. The review was
therefore performed IN-SESSION by the orchestrator, which is not the independent-eyes pass the
workflow is designed to provide. `followup_review_recommended` is `true` for this reason alone, and
the gap is also entered in `deferred-work.md`.

**What the in-session pass checked and found sound** (recorded so it is not re-audited): the `seen`
gate still owns every spatial channel from one early return; the dedup guard precedes the plume
spawn, so a replayed `sunk` cannot detonate twice; `sunkPosition` resolves the true holing point on
BOTH paths at event-routing time (`net.you` is this frame's own ship, and enemy contacts were pushed
earlier in the same `handleFrame`); the ready-room founder-then-respawn ordering is untouched because
`markSunk` still rides the deferred queue; `setSink(1) === setDowned(true)` is unchanged, so the
founder handover still cannot pop; `openWreckWindow` sits at complexity 4; and no server, shared,
wire or CONFIG surface was touched (`PROTOCOL_VERSION` stays 34).

**Deferred (2):** the kill-flash-under-a-co-located-plume question (an Eric call), and this cycle's
missing independent review + missing human look. Both are in `deferred-work.md`.

## Design Notes

**Why amendment 18's reasoning does not defend the plume.** Amendment 18 moved two things together —
the persistent `sunkTint` wreck look and the transient plume — because a hull rendering "already
dead" while it still turns and shoots is the misread the window exists to prevent. That argument is
about the hull's LOOK, and it is fully served by the settle (amendment 21) plus the founder tint,
both of which stay. A 0.9 s expanding ring is not a state, it is an event mark: it says *a hit
landed here*, which is exactly true at sink-entry and only approximately true 110 u later. Eric's
ruling picks the beat the mark was always describing.

**What this closes.** Amendment 18 ledgered its own consequence — *"the death GROAN still sounds at
sink-entry at the sink-entry position, so the cue and its plume are now ~5 s and up to 110 u apart.
If it reads badly, the cue is the thing to move, not the plume."* It read badly, and the owner moved
the plume. Resolving them from one `sunkPosition` read restores `sunkCue`'s stated property.

**Ledger, do not fix:** the plume now lands on the same tick and the same hull as amendment 21's
300 ms kill flash. Both claim `WorldFlashGate` in one screen region (2 of the ratified 3 onsets per
region per second), so they do not degrade each other alone but leave less headroom in a scrum. The
flash is a ratified Eric channel and its possible redundancy under a co-located plume is his call,
not the implementer's.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + full suite green, no complexity errors.
- `npm test -w client` -- expected: the roomBindings sunk suites and sinkSettle suite pass under the
  inverted assertions, with no test deleted that still describes shipped behaviour.

## Auto Run Result

Status: done — cycle 81 (0.17.81), epic-5 amendment 32, `PROTOCOL_VERSION` unchanged at 34.

**What changed.** The crimson `sink` plume moves from FOUNDER (5 s after a hull is holed) to
SINK-ENTRY (the tick it is holed). Everything else about the death beat is untouched: the 300 ms kill
flash still opens the beat, the settle still walks the hull continuously from its alive look to the
wreck look, and `markSunk` still latches that wreck tint at founder. Client presentation only — no
wire field, no server or shared change, no CONFIG tunable moved, no perception exception added.

**Files changed**
- `client/src/net/roomBindings.ts` — `pos` resolved once at the top of `handleSunk` and passed to
  `openWreckWindow`, which spawns the plume after the `seen` gate and after the dedup guard;
  `presentWreck` reduced to the `markSunk` teardown; four stale comment blocks re-truthed.
- `client/src/render/sinkSettle.ts` — module header corrected (the settle is now the sole founder
  indicator); math untouched.
- `client/src/render/ships.ts` — `hullLook`'s founder-handover rationale restated.
- `client/src/__tests__/roomBindings.test.ts` — deferral assertions inverted, not deleted.
- `client/src/__tests__/sinkSettle.test.ts` — `setSink(1) === setDowned(true)` pin kept, rationale
  restated.
- `epic-5-context-amendments.md` — amendment 32 appended; `epic-5-context.md` — summary line added.
- `VERSION` / `package.json` — 0.17.80 → 0.17.81; both tracker files stamped.
- `deferred-work.md` — two entries (the kill-flash question, the missing independent review).

**Review findings:** 0 intent_gap, 0 bad_spec, 1 patch (a stale comment, fixed), 2 defer, 0 reject.
The two adversarial review subagents did not return — see the Review Triage Log for the full account
and why `followup_review_recommended` is `true`.

**Verification:** `npm run check` exit 0 twice (after implementation and again after the patch) —
lint + type-check + 4314 tests green (720 shared / 1101 server / 2493 client). The behavioural change
is directly pinned by the inverted assertions in the two client suites (173 tests).

**Residual risks:** (1) no human or browser look — the third epic-5 cycle in a row shipping on unit
tests alone, and this one is entirely presentation; (2) no independent review pass; (3) the kill
flash now shares a tick with the plume, which is an open Eric call rather than a defect; (4) two
other dev-auto branches are in flight, so `VERSION` and the tracker stamps may need a rebase
depending on landing order.
