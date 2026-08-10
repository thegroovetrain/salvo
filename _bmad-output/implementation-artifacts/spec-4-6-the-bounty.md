---
title: 'Story 4-6: The Bounty'
type: 'feature'
created: '2026-08-10'
status: 'done'
baseline_revision: '36e5a4f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The kill leader is the strongest player in the match and nothing marks them. Story 4.6 as written answers this by blooming the leader on every player's radar at true position — but Eric ruled on 2026-08-10 that **no location disclosure of any kind may ship** (amendment 216), which deletes the Bounty Bloom, FR17's "one sanctioned non-sweep radar paint", and UX-DR19 outright. What survives is the part that was never a fog question: an economic price on the throne and a public register that names who sits on it.

**Approach:** The bounty is a **held throne** over captain-only kills, tracked authoritatively on the server, published as one new `ArenaState.bountyId` scalar (identity only — the roster already broadcasts every player's kills to every client every tick, so this discloses nothing new). Sinking the holder pays **one extra level** on top of the standard captain kill. The client presents it in three places: a persistent chrome-bar segment, two kill-feed registers, and a toast + tone when the throne lands on you. No new perception exception, no new `GameEvent` kind, no radar change.

## Boundaries & Constraints

**Always:**
- **The throne moves only on a STRICT OVERTAKE.** A tie never transfers it, in either direction: a vacant throne stays vacant while the top captain-kill count is shared, and a held throne stays with the incumbent until another *alive captain* strictly exceeds their count. Evaluate once per sink, in sink order, so simultaneous challengers resolve sequentially.
- **Captain kills only.** Sinking a drone never advances anyone toward the throne. This follows the Public Register's ratified position that drones are not combatants; `ShipRecord.kills` (which counts drones) stays untouched and keeps driving the roster tally, the KILLS chrome segment, and results.
- **Minimum one captain kill.** A zero-kill field has no bounty.
- **The holder must be alive.** When the holder sinks, the throne vacates; re-claiming it then requires a fresh strict unique maximum among alive captains.
- **`bountyId` is identity only.** It carries a roster id and nothing else — never a position, class, hp, hue, or kill count.
- Every new tunable lives in `CONFIG.bounty` (shared) with a provenance comment naming the 2026-08-10 ruling. Client-only feel knobs go in `CLIENT_CONFIG`.
- `effectiveStats()` is untouched: the bounty is not a stat and must never enter the upgrade fold.

**Block If:**
- The implementation cannot deliver the throne rule without disclosing position, bearing, range, or area to anyone. HALT — that is the one thing the ruling forbids.
- Any change would be needed to `blipSignal`, `perception.blipGate`, `radarShadow`, or the radar render grammar. HALT — the bounty touches none of them.
- A seventh declared exception to the master perception invariant appears necessary. HALT — the design was chosen specifically so none is.

**Never:**
- No radar paint, ring, bloom, halo, rim tick, sector, or on-water marker of the holder. No bearing. No range band.
- No change to what a blip carries, to `visibilityTo`, or to any sensor radius.
- No new `GameEvent` kind. (The one wire addition to an event is an optional `bty` flag on the existing `sunk` row.)
- No `damageDealt`-style live leak: nothing new about the holder beyond their identity.
- No drone may ever hold the bounty or count toward it.
- Do not restyle, reword, or "improve" adjacent DESIGN.md / EXPERIENCE.md rows beyond retiring the ones this ruling kills.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vacant, first captain kill | throne `''`; A sinks captain B; A now 1, all others 0 | A takes the throne; `bountyId='A'`; claim line in feed; A gets toast + tone | No error expected |
| Vacant, tied top | throne `''`; A and B each at 1 captain kill | Throne stays `''` — a tie never claims | No error expected |
| Held, challenger TIES incumbent | throne `A` (2); B reaches 2 | **A keeps it.** No feed line, no toast, `bountyId` unchanged | No error expected |
| Held, challenger OVERTAKES | throne `A` (2); B reaches 3 | B takes it; claim line; B gets toast + tone; A gets nothing | No error expected |
| Drone kill by the leader | throne `A` (2); A sinks a drone | `kills` +1, `captainKills` unchanged, throne unchanged | No error expected |
| Drone kill by a challenger | throne `A` (2); B at 2 sinks two drones | B still at 2 captain kills; A keeps the throne | No error expected |
| Holder sunk by a captain | throne `A`; C sinks A | C gets standard captain XP **+ `CONFIG.bounty.killLevels`**; `sunk` carries `bty:true`; bounty-kill feed line; throne recomputed among alive captains (vacant unless someone holds a strict unique max) | No error expected |
| Holder sunk by the storm | throne `A`; A dies outside the ring | No XP to anyone (no killer); `sunk` still carries `bty:true`; feed prints the no-killer bounty register; throne vacates | No error expected |
| Holder disconnects | throne `A`; A leaves the room | Throne recomputed immediately on ship removal; never points at an absent player | Missing ship ⇒ treat as not a candidate |
| Match restart | throne held; match resets | `captainKills` zeroed per hull in `redeployShip`; `bountyId` cleared in `resetForMatchStart` | No error expected |
| Ready room churn | phase `waiting`; hulls sink and respawn freely | Throne follows the same rule; redeploy wipes kills so it naturally clears at match start | No error expected |
| Client roster miss | `bountyId` names an id absent from the roster | Chrome-bar segment is omitted; feed uses `UNKNOWN VESSEL` fallback; never print a raw session id | Fail soft, never throw |
| Self-sink / suicide | A (holder) sinks with `by === id` or no `by` | No kill credit, no bonus XP, `bty:true`, throne vacates | No error expected |

</intent-contract>

## Code Map

**Shared**
- `shared/src/constants.ts` -- new `CONFIG.bounty` block; place it in the economy cluster after `xp` / `offer` and before `damageControl`.
- `shared/src/types.ts` -- `SunkEvent` gains optional `bty?: true`, appended LAST (msgpack key order is load-bearing).
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 32 → 33 (ArenaState schema field + `sunk` payload widening).

**Server**
- `server/src/game/bounty.ts` -- NEW. Pure, zero-Colyseus throne rule beside `spawn.ts` / `drones.ts`. Exports the candidate type and `nextBountyHolder(current, candidates)`.
- `server/src/game/world.ts` -- `ShipRecord.captainKills`; `World.bountyId`; the pre-sink read, the `captainKills` increment, the bonus grant, and the post-sink recompute inside `sinkShip` (:1116-1143); recompute on ship removal; reset in `redeployShip` (:1096) and `resetForMatchStart` (:1025).
- `server/src/game/signals.ts` -- `sunk` row's `materialize` emits `bty` last, only when true; the row's comment records that `bty` adds no disclosure because `bountyId` is already public.
- `server/src/rooms/schema/ArenaState.ts` -- `@type('string') bountyId = ''` appended after `winnerId`.
- `server/src/rooms/ArenaRoom.ts` -- `syncBounty()` called from `afterStep()` after `syncMatch()`, guarded-assign idiom.

**Client**
- `client/src/main.ts` -- `PublicState.bountyId?: string`; `Game.bountyPrev`; drive the edge detector; feed the chrome-bar view.
- `client/src/ui/bounty.ts` -- NEW. Pure module: the transition edge detector and the three copy builders (claim line, bounty-kill line suffix, toast line). Zero DOM, zero Pixi — the testable seam.
- `client/src/ui/chromeBar.ts` -- `ChromeBarView` gains `bounty`; new segment; `CHROME_BAR_SEGMENTS` 10 → 13.
- `client/src/ui/killFeed.ts` -- consumes the new builders; no API change to `pushKillLine`.
- `client/src/net/roomBindings.ts` -- `handleSunk` branches on `e.bty` for the bounty-kill register.
- `client/src/audio/tones.ts` + `client/src/audio/twinMap.ts` -- new `bounty` cue + its mandatory twin row.
- `client/src/config.ts` -- any `CLIENT_CONFIG.chromeBar` addition the bounty segment needs.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- add `CONFIG.bounty { killLevels: 1, minCaptainKills: 1 }` with provenance comments citing the 2026-08-10 ruling -- one source of truth for the two numbers.
- [x] `shared/src/types.ts` -- add `bty?: true` as the LAST key of `SunkEvent`, documented as "the victim held the bounty; identity-only, adds no disclosure".
- [x] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 33 -- the schema field and the widened `sunk` payload both break old clients.
- [x] `server/src/game/bounty.ts` -- NEW pure module implementing the strict-overtake throne rule over alive captain candidates -- keeps the rule unit-testable and out of `world.ts`.
- [x] `server/src/game/world.ts` -- add `captainKills` to `ShipRecord` and `World.bountyId`; wire `sinkShip` (pre-sink read → `captainKills` increment gated on `!victim.isDrone` → bonus XP when the victim held the throne → push `sunk` with `bty` → recompute); recompute on ship removal; reset both in `redeployShip` and `resetForMatchStart`.
- [x] `server/src/game/signals.ts` -- emit `bty` last in the `sunk` row's `materialize`, only when true, never `undefined`.
- [x] `server/src/rooms/schema/ArenaState.ts` + `server/src/rooms/ArenaRoom.ts` -- publish `bountyId` via a `syncBounty()` in `afterStep()`.
- [x] `client/src/ui/bounty.ts` -- NEW pure module: `bountyTransition(prev, next, selfId)` edge detector plus `bountyClaimLine`, `bountyKillSuffix`, `bountyToastLine`.
- [x] `client/src/ui/chromeBar.ts` -- add the `BOUNTY: <NAME>` segment in the holder's text-safe personal hue; raise `CHROME_BAR_SEGMENTS` to 13 -- the pool literal must move or the renderer silently drops the tail.
- [x] `client/src/main.ts` -- mirror `bountyId`, hold the previous value, drive the toast + tone on self-claim and the claim line on any change, and pass the bounty into `chromeBarView`.
- [x] `client/src/net/roomBindings.ts` + `client/src/ui/killFeed.ts` -- branch `handleSunk` on `e.bty` to print the bounty-kill register.
- [x] `client/src/audio/tones.ts` + `client/src/audio/twinMap.ts` -- add the `bounty` cue (≤150 ms) and its twin row naming the toast.
- [x] `server/src/__tests__/bounty.test.ts` -- NEW. Cover every I/O Matrix row for the throne rule and the XP bonus, including the tie-does-not-transfer case in both directions.
- [x] `server/src/__tests__/signals.test.ts`, `perception.test.ts`, `goldenFrames.test.ts` -- extend the `sunk` key-set pins and the independently-reimplemented `sunk` oracle to cover `bty`; refresh snapshots.
- [x] `client/src/__tests__/bounty.test.ts` (NEW) + `chromeBar.test.ts` + `killFeed.test.ts` + `tones.test.ts` + `twinMap.test.ts` -- cover the edge detector, the copy builders, the new segment, and the new cue.
- [x] Docs & trackers -- retire the Bounty Bloom rows in `DESIGN.md` and `EXPERIENCE.md`; record amendments 216+ in `epic-4-context-amendments.md`; update `sprint-status.yaml` AND `gds-workflow-status.yaml`; bump `VERSION` to 0.17.73; add the CHANGELOG entry and the CLAUDE.md key-decision entry.

**Acceptance Criteria:**
- Given a live match, when any player inspects any frame, then nothing anywhere discloses the bounty holder's position, bearing, range, or area — the master perception invariant still has exactly six declared exceptions and `perception.test.ts` passes unchanged apart from the `bty` key-set pin.
- Given the throne is held at N captain kills, when a challenger reaches exactly N, then the incumbent keeps it and no feed line, toast, or tone fires.
- Given the throne is held, when a challenger reaches N+1, then the throne transfers, the feed prints the claim register, and only the new holder gets the toast and tone.
- Given a player sinks the bounty holder, when XP is granted, then they receive the standard captain-kill level plus exactly `CONFIG.bounty.killLevels`, banked through the existing `grantXp` pipeline with no change to fractional carry.
- Given the bounty holder is sunk by the storm, when the feed renders, then the bounty register prints and no player receives bonus XP.
- Given a match resets, when the next match starts, then `captainKills` is zero on every hull and `bountyId` is empty.
- Given `npm run check`, when it completes, then lint is error-free and every test passes, with the new tests failing if the strict-overtake rule is relaxed to a `>=` comparison.

## Spec Change Log

## Review Triage Log

### 2026-08-10 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 3: (high 0, medium 1, low 2)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` `respawn()` changed the candidate set without re-evaluating the throne — `recomputeBounty()` ran at only two seams (`sinkShip`, `removeShip`) while `captainKills` persists across a respawn, so in the ready room a respawning ex-holder could strictly exceed the incumbent with no transfer. Added the third seam in `respawn()`, corrected both "exactly two seams" doc comments, and added both reproductions as tests (observed pre-fix failures: `expected '' to be 'a'`, `expected 'a' to be 'b'`).
  - `[medium]` `[patch]` A self-sinking bounty holder printed ` — BOUNTY CLAIMED` although `creditKill` early-returns on `by === victim.id` and pays nobody. The suffix now derives from a `bountyPaid(e)` helper (`!!e.by && e.by !== e.id`); the extraction was required to keep `handleSunk` under the complexity-10 bar. Observed pre-fix failure: received `VICTIM SUNK BY VICTIM — BOUNTY CLAIMED`.
  - `[low]` `[patch]` `nextBountyHolder` was not fail-closed on non-finite counts — `NaN <= floor` is false, so a NaN candidate cleared the floor and was crowned, and a NaN incumbent produced a NaN floor admitting every zero-kill captain. Eligibility now requires `Number.isFinite`, and a corrupt incumbent's floor becomes `+Infinity`. Unreachable today; matches the `addXpMs` fail-closed precedent.

Cross-model check: a Codex review of the same diff independently found no defects and confirmed the throne rule, the `bty` wire shape, the reset paths, and the absence of any location disclosure. It did not surface the three findings above, so each was verified by direct inspection before being dispatched.

## Design Notes

**Why identity is free but position is not.** `syncRoster()` has always mirrored `kills` to every client every tick (`ArenaRoom.ts:880`), so any client can already compute the kill leader. Publishing `bountyId` therefore reconciles the server's answer with information the client could derive anyway — the same argument the Public Register used for the `sunk` row. Position was the only genuinely new thing Story 4.6 proposed, and it is the thing the ruling removes. This is why no seventh exception is needed.

**Why the server owns the answer even though the client could derive it.** Two independent derivations of the same rule is exactly the desync class `effectiveStats()` exists to prevent. The XP bonus must be authoritative, so the server computes the throne; the client reads one scalar and never re-derives it.

**Why `bty` on `sunk` rather than a client-side comparison.** The client cannot safely compare a sunk id against its own copy of `bountyId`: the schema patch and the event arrive in the same frame with no guaranteed ordering, so the throne may already have been recomputed. The server knows the pre-sink truth. `bty` discloses nothing — a drone can never hold the bounty, so the flag can only appear on a combatant sinking, which is already public.

**Shape of the throne rule** (illustrative, not prescriptive):

```ts
// A tie never transfers. Vacant stays vacant on a tie; held stays held on a tie.
export function nextBountyHolder(current: string, cands: BountyCandidate[]): string {
  const held = cands.find((c) => c.id === current && c.alive);
  const floor = held ? held.captainKills : CONFIG.bounty.minCaptainKills - 1;
  let best: BountyCandidate | null = null;
  for (const c of cands) {
    if (!c.alive || c.id === current) continue;
    if (c.captainKills <= floor) continue;          // strict overtake only
    if (!best || c.captainKills > best.captainKills) best = c;
    else if (c.captainKills === best.captainKills) best = null; // tied challengers: nobody
  }
  if (best) return best.id;
  return held ? current : '';
}
```

**Copy grammar (presentation, chosen here — flag to Eric).** Claim register: `BOUNTY: <NAME>`. Bounty kill with a killer: the existing `<VICTIM> SUNK BY <KILLER>` line plus a trailing connective ` — BOUNTY CLAIMED`. Bounty kill with no killer (storm/self): the existing `<VICTIM> LOST WITH ALL HANDS` plus ` — BOUNTY LIFTED`. Toast: `YOU ARE THE BOUNTY`.

**Chrome bar.** `BOUNTY: <NAME>` is the first per-player hue the bar has ever carried; run it through `textSafe()` exactly as the kill feed does, and omit the whole segment (separator included) when the throne is vacant or the roster lookup misses. `CHROME_BAR_SEGMENTS` is a pinned pool size — raising it to 13 is mandatory, not optional.

**What this story deliberately does not close.** The Bounty Bloom's retirement removes an event from Story 4.7's sound map and a channel from Story 4.8's squint test; both should be recorded as scope reductions rather than silently dropped.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean; run FIRST after any shared change or the server type-check reports phantom missing exports.
- `npm run lint` -- expected: 0 errors (complexity ≤ 10 enforced; the `sinkShip` additions are the risk).
- `npm run check` -- expected: all three type-checks clean and every test green; baseline before this story is 3745 passing.
- `npm test -w server -- bounty` -- expected: the new throne-rule suite passes and fails if strict overtake is weakened.

**Manual checks:**
- `grep -rn "bounty" client/src/render/` -- expected: no matches. The bounty must not reach any renderer that draws the water or the scope.

## Auto Run Result

Status: done
Cycle 73 (0.17.73). Baseline `36e5a4f` -> final revision recorded below.

**Implemented change.** Story 4-6 ships as an economy-and-register feature with ZERO location
disclosure. Eric's 2026-08-10 rulings deleted the Bounty Bloom outright, which struck FR17's
"one sanctioned non-sweep radar paint", UX-DR19, and the DESIGN.md/EXPERIENCE.md rows built on
them. The bounty is now a HELD THRONE over captain-only kills that moves only on a strict
overtake (a tie never transfers it, in either direction); sinking the holder pays one extra
level; and the holder is named -- never located -- in a chrome-bar register, two kill-feed
lines, and a toast plus a new audio cue when the throne lands on you.

**Why no seventh perception exception was needed.** `syncRoster()` has always mirrored every
player's kills to every client every tick, so the kill leader was already derivable client-side.
Position was the only genuinely new disclosure the story proposed, and the ruling removed it.
The master perception invariant still has exactly six declared exceptions.

**Files changed.**
- `shared/src/constants.ts` -- new `CONFIG.bounty { killLevels, minCaptainKills }`.
- `shared/src/types.ts` -- optional `bty?: true` appended last on `SunkEvent`.
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 32 -> 33.
- `server/src/game/bounty.ts` (new) -- the pure strict-overtake throne rule, zero Colyseus.
- `server/src/game/world.ts` -- `captainKills`, `World.bountyId`, `creditKill` extraction, and
  `recomputeBounty()` at three seams (sink, removal, respawn).
- `server/src/game/signals.ts` -- `bty` emitted last on the `sunk` row, only when true.
- `server/src/rooms/schema/ArenaState.ts`, `server/src/rooms/ArenaRoom.ts` -- `bountyId` published.
- `client/src/ui/bounty.ts` (new) -- the pure edge detector and the three copy builders.
- `client/src/ui/chromeBar.ts` -- the optional `BOUNTY: <NAME>` register; pool 10 -> 13.
- `client/src/main.ts`, `client/src/net/roomBindings.ts` -- mirror, announce, and the `bty` branch.
- `client/src/audio/tones.ts`, `twinMap.ts` -- the new `bounty` cue and its mandatory twin row.
- Docs/trackers: `VERSION`, `CLAUDE.md`, amendments 216-221, DESIGN.md, EXPERIENCE.md, both
  tracker YAMLs, and the cycle-51 deferred entry this ruling resolves.

**Review findings.** 3 patches applied (2 medium, 1 low), 3 deferred, 0 rejected, 0 intent gaps,
0 spec loopbacks. Patches: the missing respawn recompute seam, a self-sink printing
"BOUNTY CLAIMED" when nobody was paid, and non-finite fail-closing in the throne rule -- each
with a regression test observed FAILING before its fix. Deferred: an intra-tick double-kill
ordering dependency, the chrome bar's single-sided edge clamp, and a departed killer still
printing CLAIMED.

**Verification.** `npm run check` green: 684 shared / 1054 server / 2084 client = 3822 tests,
0 lint errors (2 pre-existing warnings untouched). `grep -rn "bounty" client/src/render/`
returns nothing -- no renderer that draws the water or the scope learns the bounty exists.
Three independent reviewers (two adversarial, one cross-model Codex) each confirmed no path
discloses the holder's position, bearing, range, or area.

**Residual risks.** Mid-match join and reconnect announce the sitting holder once, and the
self-toast fires if that holder is you -- deliberate (it is the register telling a fresh client
the current state) but ungated by match phase. In a mutual-destruction exchange the first sink
crowns the killer, so the return kill is a bounty kill paying 2 levels; ruled a consequence,
and two pre-existing tests were updated to expect it. The chrome bar now carries its first
per-player hue, which Story 4-8's readability gate will need to arbitrate.
