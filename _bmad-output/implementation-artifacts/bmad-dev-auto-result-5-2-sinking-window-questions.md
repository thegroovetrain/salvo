---
status: blocked
---

# BMad Dev Auto Result — Story 5.2 The Sinking Window: QUESTION GATE

Status: blocked (pre-implementation question gate; Eric rulings required before a spec exists)
Blocking condition: five design rulings — the sinking-activation policy (the AC's own named TBD),
when the kill actually lands, whether a sinking hull can be finished off early, the window length,
and whether the draw gets built.

## Intent (invocation, 2026-08-12)

> `/bmad-dev-auto 5-2. surface questions before implementation. use /orchestrate to decide on model
> for subagents based on task complexity.`

Local `main` was 10 commits behind `origin/main`; Story 5-1 (PR #132, cycle 76, 0.17.76) had merged
there. This worktree is branched from `origin/main`, so 5-1's lifecycle union and STEP_ORDER
registry are present. **No code, CONFIG, wire or test change has been made.** Everything below is
investigation.

Four investigation subagents were dispatched, model-routed per `/orchestrate` §2 — **Fable** for the
two whole-system seams (the lifecycle/step-order/win-predicate spine, and the perception/wire/
anti-cheat boundary), **Opus** for the two local seams (the equipment activation path, the client
death UX). Every load-bearing claim below was then re-verified by hand against the source.

---

## Headline: Story 5-1 left a clean handoff, and it pre-marked every decision 5-2 has to make

This is unusual and worth saying plainly. The seams 5-2 touches carry comments written *for* 5-2:

- `world.ts:2860-2875` — the AR7 gate **exists and is real**, not vapor. Verbatim: *"Today otherwise
  a PASSTHROUGH: every activation on a fitted slot is allowed. The sinking-state policy (which
  equipment a sinking ship may still activate) is deliberately TBD per D4 — Epic 5 wires the sinking
  state through here; **no policy logic lands before it.**"* Its body is three lines
  (`world.ts:2876-2885`) and it is the ONLY call path to `Equipment.activate()` anywhere.
- `shared/src/sim/lifecycle.ts:104-119` — *"whether a sinking hull is afloat is Story 5.2's ruling and
  deliberately NOT pre-decided here… this is a ONE-LINE change."*
- `frames.ts:104-108` — amendment 7's warning, in the file: *"a sinking hull reaching this predicate
  would receive full-map vision for the whole window."*
- `world.ts:3126-3128` — `processRespawns` already gates on `isSunk()` not `!isAfloat`, with a comment
  saying a hull *"on its way down must not be revived out from under it."*

So the architecture is ready. What is missing is **policy**, and the AC says so out loud.

## The one fact that reframes the whole story

`isAfloat()` is advertised as a one-line lever, and it is — but **flipping it is not the design.**
It has ~30 server call sites and Story 5-2's own ACs want *different answers at different gates*:

| AC clause | wants |
|---|---|
| "helm inputs accepted but decay; fire/aim stay live" | fire gates afloat=**true** (`world.ts:2733`, `:2811`) |
| "remains fully perceivable — still a target" | contact + blip rows afloat=**true** (`signals.ts:424`, `:575`) |
| "stays win-eligible until fully sunk" (D4) | win predicate afloat=**true** (`match.ts:581`) |
| "hull decelerates as a STEP_ORDER step" | `stepShips` afloat=**true**, plus a new decel term (`world.ts:1841`) |
| amendment 7 — no full-map vision | `spectates()` afloat=**false** (`frames.ts:112`) |
| exactly one `sunk` event per life | `sinkShip`'s idempotency lock afloat=**false** (`world.ts:1220`) |

Four clauses say afloat, two say not-afloat. **`isAfloat(sinking) = true` with two named exceptions**
is the only reading that satisfies all six, and I have taken it as a ruling (R1/R2/R3 below) because
it is derived from the ACs rather than invented. Everything Eric actually has to decide is below.

---

## Q1 (BLOCKING — the AC's own named TBD) — Which equipment may a sinking ship activate?

The registry has **seven** rows, not three (`equipment/index.ts:107-115`):

| | rows | `isWeapon` |
|---|---|---|
| Weapons | gun, torpedo, mine, cannon, starShells | true |
| Abilities | speedBoost, decoyBuoy | false |

> **Stale comment found while verifying this table:** `equipment/index.ts:107` still annotates the
> mine row *"Story 1.8: flipped to a non-weapon (instant drop-astern ability)"*. That was superseded
> by Story 2.8 / epic-2 amendment 45, which made the mine a click-aimed weapon again — the actual
> source of truth, `EQUIPMENT_IS_WEAPON` (`shared/src/sim/loadout.ts:32-44`), says `mine: true` with
> the supersession recorded inline. Worth correcting whenever this file is next touched; it would
> mislead anyone implementing Q1 off the registry alone.

**Option A — everything.** The gate stays a passthrough forever; the TBD closes as "no policy".
**Option B — weapons only (RECOMMENDED).** All five weapons fire; speedBoost and decoyBuoy refused.
**Option C — direct-fire only.** gun/cannon/starShells; mine and torpedo refused.
**Option D — gun only.** The strictest reading of "guns still live".

**Why I'd recommend B.** The two refusals have mechanical justifications, not taste ones: a
**speedBoost** on a hull whose defining behavior this story is *decelerating to a stop* is a direct
contradiction — it would fight the ritardando the story exists to create. A **decoyBuoy** laid at
0 HP is a free posthumous ghost, and the decoy is already ruled out-of-scope and due for major
changes (epic-4 amendment 206, Eric: *"Decoy will get major changes soon"*). Everything else is a
weapon, and "I go down shooting" is the story's whole pitch.

**Why mines should be IN (the argument against C), stated honestly with its exposure.** Denying
mines to a sinking Mine Layer removes exactly that class's take-you-with-me moment — a minefield
that kills your killer after you're gone is the best version of this story. The exposures are real
but each already has a **shipped, ratified answer**: an orphan mine already persists forever after
its owner leaves or dies, and already loses that owner's upgrades (`world.ts:2260-2267`, pinned by
tests); posthumous mine kills already credit a dead-but-present layer (`creditKill`, `world.ts:1289`,
documented as deliberate). The genuinely new bit is small: `maxLive` 5 is enforced per-owner at lay
time (`mines.ts:84-87`) and nothing ever sweeps a sunk owner's board, so a sinking Mine Layer can
bank its 2-round pool onto the water permanently. That is a **quantity** question (2 mines), not an
architecture one.

The `armDelay` is 3000ms (`constants.ts:629`) against a ~5000ms window, so a mine laid in the first
2 seconds arms before you're on the bottom, and one laid later arms after. That asymmetry is
probably fine — but it is the reason the window length (Q4) and this answer interact.

---

## Q2 (BLOCKING) — When does the kill actually land? The five-second question.

Today `sinkShip` (`world.ts:1215-1260`) does **everything at one instant**: kill credit, XP, bounty
recompute, `deaths++`, the public `sunk` event (→ kill feed, → the Public Register), the roster
`alive` flip (→ the AFLOAT count in the chrome bar), and — one tick later via `consumeSinks()` →
`checkWin()` — the match ending. A sinking window splits that instant into two, five seconds apart.

**Option A — everything at founder (RECOMMENDED).** The ship isn't dead until it's on the bottom.
**Option B — split:** credit/XP/bounty at sink-entry; public register, AFLOAT and the win check at
founder.
**Option C — everything at sink-entry;** only the hull's physical presence persists (a corpse that
shoots).

**Why A.** It is the only option that preserves the property amendment 1 was written to protect —
**exactly one `sunk` emission at exactly one transition** — without inventing a second bookkeeping
moment that can double-fire or silently not fire. It is also the coherent reading of D4 (*"sinking
ships stay win-eligible until fully sunk"*): a hull that can still sink you is not a hull you have
killed yet.

**The felt cost, stated plainly, because it is the real content of this question:** under A you put
someone at zero and get **no confirmation for five seconds** — no kill-feed line, no XP, no banked
point, no bounty throne movement, and AFLOAT stays put. In a 1v1 the match does not end for five
more seconds (which is arguably exactly the beat the story wants). Partial mitigation already ships:
the **Hit Call** (`hc`, epic-4 amendment 17) tells the shooter *immediately* that they connected —
carrying no severity channel by ruling, so it says "you hit" and never "you killed". Under A that
stays true and the kill arrives late; under B the kill feed and the XP disagree about when you died.

**Interaction Eric should know about:** under A, a killer who *themself* sinks during those five
seconds still gets full credit — `creditKill` guards only on a *departed* killer, and a
dead-but-present one is credited by explicit design (`world.ts:1210`). Mutual destruction pays both.

---

## Q3 (BLOCKING) — Can a sinking hull be finished off early?

hp is already 0 when the window opens, so "more damage" has no natural meaning; this needs a ruling
either way, because the split lifecycle **throws** on an illegal `sink`-from-`sinking` edge
(`lifecycle.ts:205`) if `hitShip` isn't told what to do.

**Option A — immune (RECOMMENDED).** Damage lands and does nothing; the window always runs its full
length. The revenge shot is guaranteed.
**Option B — damage shortens the window** (an overkill accumulator drives founder early).
**Option C — any further hit founders it immediately.**

**Why A.** It is the only option that reliably delivers the story's promise (*"maybe take my killer
with me"*) — under B or C a killer with a second shell simply deletes the mechanic, and the players
most able to do that are the ones the mechanic exists to punish. It is also the cheapest predicate
(one early-return in `hitShip`), it needs no new state, and it matches the shipped same-tick
semantics where a hull sunk earlier in a tick eats later hits harmlessly.

**Cost of A, named:** for five seconds a hull that cannot be stopped is shooting at you, and there
is nothing you can do about it but leave. That is the design. If Eric wants counterplay, B is the
option that provides it, and it costs a new overkill field.

---

## Q4 — The window length: one number, or one per class?

The AC says *"~5 s (CONFIG design target)"*.

**Option A — flat 5000 ms for all three classes (RECOMMENDED for this story).** One CONFIG key.
**Option B — per class** (Battleship longest, Torpedo Boat shortest). Naval-honest — the classes
already differ in every other kinematic — and it hands the heavy hull a longer revenge window as
compensation for being the easiest to hit.

**Why A now.** Per-class windows change the take-your-killer-with-you budget by class, which is a
**balance** question, and this project's balance numbers have consistently wanted live play or a
derivation before they get set (the wake clock became `detect / 45 u/s` rather than a feel number).
Shipping one number and ledgering per-class keeps 5-2 about the mechanism. But B is a legitimate
first choice if Eric wants it, and it costs one CONFIG table instead of one constant.

Note Q1's interaction: at 5000 ms the mine `armDelay` of 3000 ms splits the window roughly 60/40
into "my mine arms before I'm gone" and "after". A shorter window makes sinking-laid mines almost
always posthumous; a longer one makes them almost always live.

---

## Q5 (SCOPE) — Does the draw get built?

D4 and the AC say *"same-tick mutual destruction = draw"*. **A draw is not representable today.**
`Match.finish()` resolves a zero-afloat-captains finish to `latestSunkHuman()` (`match.ts:586-592`) —
somebody always wins; `winnerId` is `''` only when no human is in the sink order at all.

**Option A — keep the shipped fallback and ledger it.** The later sinker wins; a literal same-tick
pair resolves by position in `sinkOrder`.
**Option B — build a real draw** (a results state, a wire field, a results-screen treatment).
**Option C — defer explicitly to Story 5-3**, which owns the results modal.

I do **not** have a confident recommendation here, and one common intuition about it is wrong, so
it is worth stating: you might expect the sinking window to make true same-tick destruction rare.
**It doesn't.** With a fixed window length, two hulls that enter `sinking` on the same tick found on
the same tick — the window is a constant delay, so exact ties are preserved exactly, not scattered.
What the window *does* create is a genuinely reachable *"all remaining participants are sinking"*
state, which was nearly impossible before and which D4's "later sinker wins" clause already covers
and the code already implements.

My weak preference is **C** — 5-3 owns the screen a draw would have to render on, and building a
draw state with nowhere to draw it is the kind of half-feature that gets discovered at a review gate.
But this is a scope call, not a technical one.

---

## Rulings I took (derived from the ACs, not invented — Eric has veto on every one)

| # | Ruling | Basis |
|---|---|---|
| R1 | `isAfloat(sinking) = true`, with exactly two named exceptions (R2, R3) | The four-vs-two AC table above |
| R2 | `spectates()` moves from `!isAfloat` to `isSunk` | Amendment 7, warned in `frames.ts:104-108` |
| R3 | `sinkShip` splits into `enterSinking` (`sink` edge) + `founder` (`founder` edge); the idempotency lock moves to `enterSinking`; **exactly one `sunk` emission survives** | Amendment 1's stated hazard |
| R4 | Repairs/regen do **not** tick while sinking; the `heal` edge stays RESERVED — no damage-control save in this story | `tickRepairs` reads post-damage truth (amendment 6); "future heal" means not now |
| R5 | Wire = one optional self-private `OwnShip` key (the `slowedUntil`/`dazzledUntil` precedent), **no new perception exception**, **PV 33 → 34** | `types.ts:319-326`; the six exceptions stay six |
| R6 | **No new enemy-facing sinking channel.** A sighted enemy already sees the hull decelerate (`Contact.speed`), and wounded smoke already covers the wounded case | House rule: take the smallest new information channel |
| R7 | The hull keeps laying wake through the window, and that wake outlives it | `deferred-work.md:848(b)` asked for this line explicitly; epic-4 amendment 205 |
| R8 | Client: the ELIMINATED modal defers to founder; the camera stays on the own hull for the window; the alive HUD stays up minus refit | The modal is *focused* and calls `clearKeys()` (`main.ts:1150`, `keyboard.ts:409`) — a live helm is impossible until it defers |
| R9 | Sinking decel is a **shared pure fold** (`sinkingKinematics`, sibling of `slowedKinematics`) called identically by `world.ts` and `prediction.ts` | The `applyGroundingDamp` precedent (`collision.ts:273`); prediction desyncs otherwise |
| R10 | One new STEP_ORDER row, pinned by the existing identity test | Amendment 6 (`stepOrder.test.ts`) |
| R11 | `respawnAt` keeps arming at sink-entry | Respawn is ready-room-only and damage is active-only, so it is unreachable in production; this keeps the cadence byte-identical |
| R12 | No tick-XP accrual while sinking | `tickXp` gates on afloat today; earning while dying is a mechanic nobody asked for |

Reload timers already tick for dead hulls today (`fireControl` has no liveness filter,
`world.ts:2715-2722`), so they keep ticking through the window for free — consistent with "guns live".

## The two traps I'd flag to whoever implements this

1. **`main.ts` defaults liveness to TRUE when `you` is null** — `alive: you?.alive ?? true`
   (`main.ts:548`). Any wire shape that omits `you` mid-window silently reads as alive.
2. **`computePlacements`' correctness proof is a comment** (`match.ts:477-491`) whose reasoning
   depends verbatim on *"`sinkShip` is the sole edge and always emits `sunk`"*. Splitting into
   `enterSinking`/`founder` invalidates the comment's argument even where behavior is preserved, so
   the comment has to be rewritten, not left to rot.

## Scale estimate (for sizing, not a commitment)

Server: the sink split + the decel step + one STEP_ORDER row + the `spectates`/`hitShip`/`tickRepairs`
exceptions + the activation policy. Shared: `sinkingKinematics` + one CONFIG block + one `OwnShip`
key + PV 34. Client: defer the modal, hold the camera, predict the decel, keep the HUD up. Plus the
invariant tests the AC names (perception + input validation during sinking). Comparable to a
mid-sized Epic 4 cycle — larger than 4-8, smaller than 4-12.

## What happens next

Answer Q1-Q5 (a sentence each is plenty) and re-run `/bmad-dev-auto 5-2`. The answers become
epic-5 amendments 10+, the spec gets written against them, and implementation follows. Veto any of
R1-R12 in the same breath if they're wrong.
