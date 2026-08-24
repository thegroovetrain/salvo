---
title: 'XP Assist Split + Per-Level Auto-Heal'
type: 'feature'
created: '2026-08-23'
status: 'draft'
baseline_revision: 'bdf51db'
reference_implementation: 'worktree-balance-damage-xp'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/batch-sim-evidence-2026-08-22.md'
  - '{project-root}/_bmad-output/implementation-artifacts/batch-sim-evidence-2026-08-20.md'
---

<intent-contract>

## Intent

**Problem.** Two measured defects in the level economy, both Eric-ruled at the
2026-08-22/23 balance sessions.

1. **A kill's value is all-or-nothing to whoever lands the last hit.** Measured
   over 114 sinks: a hull is worn down by a **median of SIX attackers** across a
   **median 332 s** before it dies. Every one of them but the finisher earns
   nothing. That pays the class that snipes kills and starves the classes that
   soften targets — the mechanism behind the Mine Layer's long-standing weakness.
2. **Heals eat most of the level economy.** **58.7 %** of every level earned is
   spent on `HEAL_CHOICE` rather than an upgrade (measured at n=1820; 58.9 % at
   n=7200). Eric: *"it kinda feels bad spending so many of my levels on heals,
   especially to survive early."* Raising XP does NOT fix this — the ratio holds
   at ~50-59 % across every XP rate tested, because volume scales cards and heals
   together.

**Approach.** Two independent mechanisms, each measured benign alone and
together, and each ruled by Eric.

- **THE ASSIST SPLIT.** A kill's value becomes a pot: `killerShare` (1/10) is
  guaranteed to the killer, and the remainder is divided among everyone who
  damaged that hull **in the current encounter**, in proportion to damage dealt.
  The killer shares the remainder too, so a solo kill still pays the full value.
- **THE PER-LEVEL AUTO-HEAL.** Earning a level restores **10 % of MISSING hull**
  over 5 s, free, into its own pool. It sits **in addition to** the refit-menu
  heal, which is untouched: Eric likes the heal being a strategic decision, so
  the fix targets the SHARE of levels it eats, not the decision.

**Measured effect of the pair** (n=91, roster even, menu heal left as shipped):
cards/bot **3.33 → 3.59 (+8 %)**, heal share **58.9 % → 56.0 %**, class spread
**11.7 pp → 15.4 pp**, all three classes 27.5-42.9 %. The auto-heal measured
alone is the single best mechanism in the corpus (spread **5.5 pp**, BS and TB
level at 35.2 %).

## Boundaries & Constraints

**Always:**

- **The encounter model is the ruled semantics** (Eric, 2026-08-23) and has TWO
  resets, both on a **60 s** gap:
  - **Encounter-level** — a hull that takes no participant damage for 60 s ends
    its encounter; the whole ledger is wiped, every contributor's claim with it.
  - **Per-attacker** — *"if I should rejoin the combat after [the window], it
    starts counting my damage contribution fresh, as if I had not previously
    been in the battle."* This fires **even while the fight continues**: someone
    else keeping the encounter alive does not preserve YOUR claim.
- **Eligibility on top of that:** your last damage must be inside the same 60 s
  window. `assistWindowMs` and `assistEncounterGapMs` are ONE concept in this
  model and must move together — with a 60 s gap and a 30 s eligibility window
  an attacker who lapsed 45 s would keep their tally but be dropped by
  eligibility anyway, so the gap would do nothing.
- **60 s clears every weapon cycle with room** (gun 5 s, mine 15 s, broadside
  18 s, star shells 20 s, torpedo 30 s). Eric's original 30 s was ruled first
  and left the torpedo exactly at the boundary; 60 s removes that case entirely.
  It also lets a disengage-and-return read as ONE encounter, which is closer to
  how a naval fight actually plays than a hard 30 s cut.
- **Overkill never pays** (Eric, 2026-08-22): the ledger records damage CLAMPED
  to the hp the hull actually had. *"if i do 50 damage to someone with 1 HP left,
  i get 1 damage worth of XP."*
- **The kill bonus survives** (Eric, same exchange: *"I \*DO\* get the kill bonus
  though"*): the killer takes the guaranteed share PLUS a proportional slice.
- **The bounty-holder bonus is NEVER split** — it rewards sinking the throne's
  holder, not wearing them down.
- **Fleet hulls are excluded from the split**, not counted-and-unpaid: they
  cannot accrue XP, so counting them would make their share evaporate rather
  than redistribute.
- **A storm kill still pays assists**, with the killer's guaranteed share
  unpaid — the guaranteed share is payment for the risk of closing, and if the
  storm finished them nobody took that risk.
- **Storm and fleet damage do NOT refresh the encounter clock**: a hull burning
  alone in the storm is not in a fight, so claims on it still lapse.
- **The auto-heal feeds its OWN pool at its OWN rate**, not `repairHp`. Eric
  ruled *"25 over 5 seconds"* against a shared pool that drains at 10 hp/s, and
  confirmed the numbers were deliberate. The free trickle must be
  out-damageable while the paid heal answers an emergency; a shared pool has one
  global rate by construction (the anti-flask rule) and cannot express both.
- **The auto-heal pays NOTHING to a full hull** (10 % of zero missing is zero),
  nothing to a sinking or sunk hull, and nothing to a fleet hull.
- **The menu heal is BYTE-IDENTICAL** — same 50 + 50, same fixed rate, same
  anti-flask stacking, same full-hp refusal.
- Cross-cutting: complexity ≤ 10; `npm run check` green; `world.ts`/`match.ts`
  stay Colyseus-free.

**Block If:**
- The `PROTOCOL_VERSION` question resolves to a bump and the release train is not
  ready for one. `CONFIG.xp` and `CONFIG.damageControl` ride `WelcomeMsg.config`,
  and the governing precedent (epic-6 amendment 24, re-adjudicated at cycle 96)
  is that **a CONFIG block bumps PV when the CLIENT READS IT, not merely because
  it rides the welcome snapshot**. `client/src/ui/upgradeMenu.ts healReadout()`
  reads `CONFIG.damageControl` — but only `instantHp`/`regenHp`/`regenMs`, none
  of which move. **This needs an explicit adjudication in the story, not an
  assumption either way.**
- The client's refit rail needs new copy for the auto-heal. It is a free,
  automatic effect with no button, so it may need none — but a heal the player
  receives without pressing anything and cannot see explained is a UX gap, and
  `healReadout()` is the natural home. **Design call, not an implementer's.**

**Never:**
- **NO damage→XP rule.** Measured and REJECTED at 1/100, 1/300 and 1/1000. Every
  arm containing it landed at 20.9-47.3 pp class spread against a 11.7 pp
  baseline; at 1/100 one bot reached 187 levels and max boons saturated the deck
  at 40. Do not reintroduce it as "a small amount would be fine" — 1/1000 was the
  small amount and still cost 8.8 pp.
- **NO percentage menu heal in this story.** Deferred by Eric to after the
  upgrade-card balance pass. All NINE variants measured put the Torpedo Boat at
  9.9-21.1 % against its 28.3 % baseline; the ruled 15 %+15 % config measured at
  n=360 gave BS **56.4 %** / TB **17.5 %**, spread **38.9 pp**, with both
  movements individually significant.
- **NO compensation dials.** `broadside.reloadMs` and `torpedo.damage` were
  probed as Torpedo Boat compensation and are RETIRED: they repair damage this
  configuration does not cause. (The torpedo probe also confirmed cycle 1's
  context-dependency warning — at ~720 s matches it takes from the Mine Layer,
  not the Battleship.)
- No attrition work. 4:00 sits 3-4 hulls over target in EVERY arm **including
  baseline**, and storm deaths are ~5 % of all deaths, so it is an encounter-rate
  problem and not an economy one. The zone dials are the untested lever.
- No changes to `killLevels`, `droneTierLevels`, or `levelMs`. `killLevels` 1.5
  and 2.0 were measured; 2.0 broke the field (23.1 pp) and neither is adopted.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Notes |
|---|---|---|---|
| Solo kill | one attacker, all damage recent | killer takes the FULL kill value | share + remainder both land on them |
| Even split | A 100, B 100, B kills | B 0.55, A 0.45 | conservation: the pot is never inflated |
| Uneven split | A 150, B 50, B kills | A 0.675, B 0.325 | strictly proportional |
| Attacker lapses | A hits, then 60 s+ of nothing from A, B kills | A earns 0 | A's last damage outside the window |
| Encounter lapses | A hits, 60 s of NO damage at all, B opens fresh and kills | A earns 0 | ledger wiped; the new hit opens a new encounter |
| Long fight | A opens, both trade continuously for 3 min, B kills | A's OPENING damage still counts | no lull ⇒ encounter intact |
| Rejoin mid-fight | A hits 200, absent 60 s+ while B sustains, A returns with 10, B kills | A counted for **10**, not 210 | per-attacker restart; B's tally untouched |
| Overkill | victim at 10 hp, 400-damage blow | 10 recorded, not 400 | clamped at the seam |
| Storm kill | victim softened then storm-finished | assists paid; killer share unpaid | new value vs today's "credits nobody" |
| Storm lull | victim burning alone 30 s+, then sunk | prior claims lapse | storm never refreshes the clock |
| Fleet damager | drone deals half the damage, captain kills | captain takes the whole pot | drone excluded from the split |
| Bounty victim | throne holder sunk | killer gets the FULL bonus + their split share | bonus never divided |
| Auto-heal, hurt hull | level earned at 150/350 | +20 hp into the level pool, over 5 s | 10 % of 200 missing |
| Auto-heal, full hull | level earned at max hp | nothing; no heal cue | 10 % of zero |
| Auto-heal, multi-level | one grant crossing 3 levels | fires 3 times | once per level BANKED |
| Auto-heal, sinking | level crosses during the sinking window | nothing | the no-hp-comes-back rule |
| Auto-heal, stacking | level heal on top of a menu heal | both pools drain independently | menu pool keeps its fixed rate |

</intent-contract>

## Code Map

- `shared/src/constants.ts` — `CONFIG.xp` gains `assistWindowMs` (30000),
  `killerShare` (0.1), `assistEncounterGapMs` (30000); `CONFIG.damageControl`
  gains `levelMissingPct` (0.10) and `levelRegenMs` (5000).
- `server/src/game/world.ts` —
  - `ShipRecord`: `damageFrom` (the per-victim assist ledger), `lastDamagedAt`
    (the encounter clock), `levelRepairHp` + `levelRepairRate` (the free heal's
    own channel).
  - `creditDamage` → `recordAssist`: the ONE seam every hull-damage path already
    funnels through (`hitShip` for shell/torpedo/mine, `burnShip` for incendiary
    DoT), which is why the rule cannot miss an ordnance type and why self-hits
    and the storm are excluded structurally rather than by restatement.
  - `creditKill` → `payKillValue` → `splitAssists` / `eligibleContributors`.
  - `grantPoint` → `grantLevelHeal` (fires once per level BANKED).
  - `tickRepairs` drains two independent channels through one `payRepair`.
  - `World.clearRepair` — the three sites that end a hull's repair state.
- `server/src/game/frames.ts` — `OwnShip.repairHp` mirrors the SUM of both
  channels; the field means "hp still owed", and splitting it would need a wire
  change to say something the player cannot act on differently.
- `shared/src/__tests__/barrel.test.ts` — the `CONFIG.xp` and
  `CONFIG.damageControl` shape pins move with the new keys.
- `server/src/__tests__/splitBounty.test.ts`, `levelHeal.test.ts` — the matrix
  above.
- `server/scripts/batchsim/encounterSpan.ts` — the measurement behind the
  encounter figures (median span, attackers per sink, damage recency). **It
  ships WITH this story, not before it**: it reads `ShipRecord.damageFrom` and
  `CONFIG.xp.assistWindowMs`, so it cannot compile until the ledger exists. It
  was deliberately excluded from the harness-only merge (PR #195) for that
  reason and lives here on the reference branch.
- Bookkeeping: sprint-status, gds-workflow-status, amendments, CHANGELOG,
  `PROTOCOL_VERSION` adjudication (see Block If).

## Tasks & Acceptance

**Execution (dependency order):**
- [ ] `CONFIG` dials + barrel pins
- [ ] The assist ledger + encounter/rejoin resets (`recordAssist`)
- [ ] The payout (`payKillValue` / `splitAssists`), with conservation tests
- [ ] The per-level auto-heal + its own drain channel
- [ ] `frames.ts` summed mirror
- [ ] PROTOCOL_VERSION adjudication + client copy decision
- [ ] Bookkeeping + `npm run check`

**Acceptance Criteria:**
- Given a solo kill, the killer receives the full kill value (conservation).
- Given N contributors in one encounter, the pot divides in proportion to
  clamped damage, the killer additionally receiving `killerShare`, and the
  shares SUM to the kill value.
- Given an attacker whose last damage is older than the window, they receive
  nothing.
- Given a 60 s lull in all participant damage, the ledger is wiped and prior
  contributors receive nothing.
- Given an attacker who lapses 60 s and returns while the fight continues, their
  tally counts only damage from the return onward, and other contributors'
  tallies are unaffected.
- Given a level earned by a damaged hull, 10 % of its missing hp is delivered
  over 5 s from a channel independent of the menu heal, at a rate of
  `levelMissingPct`-of-missing per `levelRegenMs`.
- Given a level earned at full hp, or by a sinking or fleet hull, nothing is
  granted and no heal cue fires.
- Given the menu heal, its amounts, rate, stacking and full-hp refusal are
  byte-identical to today.
- Given `npm run check`, lint, type-checks and all workspace tests pass.

## Evidence

Everything above rests on `batch-sim-evidence-2026-08-22.md` — **29 arms, ~2,640
matches**, `--roster even` on every run. The headline configuration was measured
at the **±5 pp tier (n=360)** against a matched 360-match baseline.

**Two standing caveats carried from the ledger.** Most arms ran at n=91 (±10 pp),
which is wider than the 4 pp target band, so single-class movements below ~20 pp
are directional only. And two bot-quality bars fail at BASELINE (bots scoring a
kill 38.6 % against a ≥60 % bar; storm deaths 4.86 % against a 5-20 % band), so
absolute class share is partly decided by bot tactics in every arm — the
between-arm differences are what carry.

### Why 60 s and not 30 s — and what is NOT established

Eric ruled the encounter model at 30 s, then asked for a 1:00 window measured.
All arms below share code and seeds (n=91), on the adopted configuration:

| window reading | BS | ML | TB | spread |
|---|---|---|---|---|
| shipped baseline (n=**360**) | 40.0 | 31.7 | 28.3 | 11.7 pp |
| plain recency gate | 42.9 | 29.7 | 27.5 | 15.4 pp |
| sliding window | 44.0 | 27.5 | 28.6 | 16.5 pp |
| encounter model, 30 s | 48.4 | 25.3 | 26.4 | 23.1 pp |
| **encounter model, 60 s** | **36.3** | **30.8** | **33.0** | **5.5 pp** |

**60 s is the best class balance measured anywhere in these sessions** — all
three classes 30.8-36.3 %, TB squarely in band — at an economy identical to
every other reading (cards 3.58, heal share 55.4 %).

**THE ECONOMY IS INVARIANT ACROSS ALL FOUR READINGS** (cards 3.58-3.60, heal
share 55.4-56.0 %). How the window is read is a FAIRNESS decision; it does not
touch the upgrade gain the story exists to deliver. Only class spread moves.

**What is NOT established, stated plainly.** No individual class movement is
significant at n=91 — the largest is BS −6.6 pp, CI[−20.3, +7.5] versus the
gate. **A 5.5 pp spread could be a lucky draw**, and a 360-match confirmation
was offered and declined as unnecessary for now. If a later cycle wants to lean
on this number, that run is the way to earn it.

**A hypothesis, offered as a hypothesis.** The apparent driver is not how
STRICT the split is but HOW MANY CONTRIBUTORS GET PAID: the 60 s arm widens the
eligibility window as well as the reset gap, so more attackers qualify per kill
and value spreads across more hulls. The 30 s encounter arm went the other way
because both of its resets discard contributions at the same 30 s the gate
already used. If that is right, **eligibility window LENGTH is the real balance
dial and the reset semantics are mostly about fairness** — which would make
this a dial worth sweeping in a later balance cycle. It is not established here,
and the author's causal predictions in these sessions have a poor record.

## Reference Implementation

Both mechanisms are already implemented and tested on branch
`worktree-balance-damage-xp` (default-OFF, so the shipped game is byte-identical
there). A dev cycle may cherry-pick rather than start cold:

- `36a5299` — the encounter model (both resets) + `encounterSpan.ts`
- `572126e` — the split bounty, conservation-pinned
- `394cef8` / `027680a` — the per-level heal, own pool, own rate
- `ec29de7` — environment dilution (**NOT adopted**; `assistEnvWeight` 0)

The branch also carries REJECTED mechanisms behind their own default-off dials
(`xp.damageLevels`, `damageControl.healFlatPct` / `healMissingPct` /
`healPoolPct`, `xp.assistSlidingWindow`). **Those must not ship** — see Never.

## Design Notes

**Why the encounter model beats the two simpler readings.** A plain recency GATE
(your last hit inside 30 s ⇒ your whole lifetime contribution counts) lets a
1-damage tag re-qualify a contribution from a fight five minutes and several
heals ago. A SLIDING window (only damage inside 30 s counts) discards the opening
damage of the brawl still in progress. The encounter model keeps a long fight
whole and drops a finished one entirely, which is what "contributed to the kill"
means. Measured context: only ~24 % of a hull's lifetime damage falls in its last
30 s, but the last hit lands a median **2.9 s** before the sink (p95 20 s) — the
fight that kills you is short, the damage history is long.

**Why the auto-heal is a fraction of MISSING rather than a flat amount.** A flat
heal is worth the same at 90 % hp as at 5 %, and a different fraction of every
hull — the reason cycle 122 had to double `damageControl` when hull HP doubled. A
missing-hull term is worth most when nearly dead, and needs no repricing when
hull HP next moves.

**What the harness cannot answer.** Bot card choice is `bestOfferIndex()` over
fixed per-profile weights, so bots cannot perceive that a synergy became
stronger. Any "does this feel better" question — notably the deferred hull-card
synergy — is unmeasurable here and belongs to human playtest.
