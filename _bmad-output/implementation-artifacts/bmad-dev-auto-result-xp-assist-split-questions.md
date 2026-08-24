---
status: blocked
---

# BMad Dev Auto Result — XP Assist Split + Per-Level Auto-Heal (questions)

Status: BLOCKED 2026-08-23 — five questions for Eric, surfaced before implementation as the
invocation requested.
Blocking condition: intent gaps — two are the spec's own "Block If" items, three arose from the
planning investigation.

Baseline: `25715a0` (origin/development, 0.17.128, PROTOCOL_VERSION 48). Branch
`dev-auto-xp-assist-split`. Spec: `spec-xp-assist-split-and-auto-heal.md` (status `blocked`,
Auto Run Result appended). Investigation: three parallel exploration agents (world.ts seams;
CONFIG/client readers/PV facts; reference-branch audit) plus direct reads of the reference
implementation and `encounterSpan.ts`.

**A mid-planning Eric statement is already incorporated, not a question.** During this run Eric
restated the encounter model: *"as long as i continue putting damage on the ship within 60s, it
tracks all the damage i have done. If that 60s window expires, then it stops tracking my damage.
When the ship is sunk, the xp reward is split proportionally to everyone who still had an active
counter at that time."* That is a per-attacker rolling 60 s counter, and it is provably equivalent
to the spec's two resets when gap = window (if everyone is silent 60 s, every counter individually
expired — the encounter-lapse case comes free). It is recorded in the spec as the ruling of record
and it is what makes Q1 askable.

---

## THE QUESTIONS

### Q1 — One dial or two? (the 60 s window's CONFIG surface)

The reference implementation (what was measured) ships TWO dials set to the same number:
`xp.assistWindowMs` (eligibility window + on-switch) and `xp.assistEncounterGapMs` (both resets).
The spec already warns they are *"ONE concept in this model and must move together."* Your
rolling-counter formulation makes them literally one rule — a single per-attacker 60 s counter —
which needs only `assistWindowMs: 60000` and makes "must move together" structural rather than a
comment (the `effectiveStats()` / derived-field house pattern).

- **Option A (recommended): one dial.** `assistWindowMs: 60000`; `assistEncounterGapMs` never
  ships; the encounter-level wipe code (`maybeEndEncounter`, `lastDamagedAt`) is not ported because
  the per-attacker restart already produces identical payouts in every case, including every row of
  the spec's I/O matrix. A future balance sweep of "the window" sweeps one number.
- **Option B: two dials, both 60000.** Byte-closer to the measured code and its tests; keeps the
  degenerate unequal configurations expressible (the spec itself argues they do nothing useful).

Behavior is identical either way at the ruled values — this is a config-surface question, not a
balance question.

### Q2 — Client copy for the free auto-heal (the spec's own "Design call, not an implementer's")

The auto-heal already has FEEDBACK with zero client change: it fires the existing self-private
`heal` event (heal tone) and the hp rail's pending segment shows the trickle draining in. What it
lacks is EXPLANATION — a free heal you never pressed a button for.

- **Option A (recommended): one line in the refit menu's heal readout** (`healReadout()`,
  `client/src/ui/upgradeMenu.ts:321` — the place heals are already explained), e.g. a second line
  under `RESTORES 50 HP NOW AND 50 HP OVER 5S` reading roughly
  `EVERY LEVEL ALSO PATCHES 10% OF MISSING HULL — FREE`. **Exact copy is yours** — the naming law
  applies; the wording above is a placeholder, not a proposal to ship.
- **Option B: nothing.** The tone + rail segment are the whole surface; How-to-Play and the refit
  menu stay silent. Cheapest; risks "why did my hp tick up?" confusion the spec flagged.
- **Option C: A plus a sentence on the How-to-Play page** (`how-to-play/copy.ts`), where the level
  economy is described.

If A/C, the line reads the new CONFIG keys at build time (shared import) — that has no PV
consequence beyond Q3's adjudication, since a stale cached client simply lacks the line.

### Q3 — PROTOCOL_VERSION: adjudicated NO BUMP — confirm or veto

The spec's Block If demanded an explicit adjudication rather than an assumption. Adjudicated
against the code:

- The governing precedent (epic-6 amendment 24, re-adjudicated cycle 96): **a CONFIG block bumps PV
  when the CLIENT READS IT**, not merely because it rides `WelcomeMsg.config` (which has zero
  client readers — re-verified this run).
- The client's only `CONFIG.damageControl` reader is `healReadout()` and it reads only
  `instantHp`/`regenHp`/`regenMs` — none of which move (the menu heal is byte-identical by
  contract). `CONFIG.xp` has zero executable client readers.
- No wire SHAPE moves: `OwnShip.repairHp` keeps its meaning ("hp still owed", now summed over two
  channels — the reference already does this without a bump); `OwnShip.xp`/`lvl` already carry
  fractional progress (droneTierLevels precedent), so split shares change nothing about the wire.
- The PV-47 counter-precedent (values compiled into both sides forced a bump) does not apply:
  nothing here is client-predicted or client-displayed from the moved values — XP and heals are
  server-authoritative and self-sync through `OwnShip` fields. A stale cached client stays fully
  correct, merely unaware of the new rules.

**Recommendation: PV stays 48.** Veto only if you want the join gate to force stale clients onto
the build that can explain the new economy (Q2's copy).

### Q4 — The rejected machinery never lands — confirm the cleanup scope

The reference branch interleaves the adopted mechanisms with rejected/not-adopted instruments, all
default-off: `xp.damageLevels` (+ `dmgXpCarryMs`, `creditDamageXp`, damageXp.test.ts),
`xp.assistSlidingWindow` (+ `recentDamage`, the sliding branch), `xp.assistEnvWeight`
(+ `envDamage` pooling, the dilution scale), `damageControl.levelHp` (the flat auto-heal variant),
and `damageControl.healFlatPct`/`healMissingPct`/`healPoolPct` (+ pctHeal.test.ts — the percentage
MENU heal you deferred).

**Recommendation: selective port — only the adopted mechanisms land, none of the above ships, not
even off.** The repo's standing convention is that no dead knob survives (the cycle-69 grey
deletion, the cycle-72 storm-return removal), and at the adopted configuration every one of those
branches is dead code. Two deliberate keeps:

- **The per-attacker bucket history stays** — `encounterSpan.ts` (which ships with this story)
  reads it to report per-window damage fractions; it is bounded (~window/1s + 1 entries) and is
  measurement substrate, not a knob.
- **The 0-sentinel OFF branches of the two SHIPPED mechanisms stay** (`assistWindowMs <= 0`,
  `levelMissingPct <= 0`) so the balance harness can still measure OFF arms via `--set` — a
  reachable configuration, not a dead one.

The full instrument set remains intact on `worktree-balance-damage-xp` for any future measuring.
Veto if you want the whole instrument kept in-tree instead.

### Q5 — Drone-kill pots split too — confirm what was measured

`payKillValue` pots `killXpLevels(victim)`, which covers PvE fleet victims (¼/½/¾ level), so a
drone's kill value splits among its recent participant attackers exactly like a captain's — killer
guaranteed 1/10, remainder proportional. Every measured arm behaved this way, and it plausibly
matters to the Mine Layer reading (forager farms drones). The spec's I/O matrix covers drones as
DAMAGERS (excluded) but never as VICTIMS.

**Recommendation: keep it** — it is what the evidence measured; carving drones out would be an
unmeasured deviation. Veto only if you want drone farming to stay last-hit-takes-all.

---

## Settled by code or evidence during this run — no decision needed

- **Storm kills**: structurally killerless today (`applyStorm` bypasses `creditDamage`, sinks with
  `by` undefined, credits nobody). The reference pays assists with the killer share unpaid
  (burned), exactly as ruled. If every counter lapsed, the pot evaporates — the storm-lull row.
- **Overkill clamp**: recorded at the seam (`dealt` is a REQUIRED parameter so a future damage path
  cannot opt back into paying for overkill by not knowing about it).
- **Killer eligibility is structural**: the killing blow itself routes through `recordAssist`, so
  the killer always holds a fresh counter and always shares the remainder — conservation holds.
- **Multi-level grants**: N levels banked in one grant each add 10 % of the SAME missing hp
  (~30 % for 3) — matches the spec's matrix row.
- **Delivery by duration**: the free channel drains at pool/`levelRegenMs` (rate recomputed on each
  add) — the evidence-documented, deliberate departure from anti-flask, confined to the free
  channel; the menu channel's fixed rate is pinned untouched.
- **Sinking guard is reachable**: a sinking hull can still bank a level through kill credit, and
  `grantLevelHeal` refuses it (`isAfloat`), per the no-hp-comes-back rule.
- **Bot policy does not move**: every measured number was produced with `chooseSpend`'s
  `healHpFrac` heal policy unchanged; retuning bots here would detach the story from its evidence.
- **Cherry-pick cleanliness**: zero textual overlap with what landed on development since the
  branch point; the selective port (Q4) is hand-work but conflict-free.
- **barrel pins**: `CONFIG.xp`'s shape pin moves with the new keys; `CONFIG.damageControl` gets its
  first shape pin (a gap found this run).

## Next command

Answer the five questions (one line each is enough), then re-invoke:
`/bmad-dev-auto spec-xp-assist-split-and-auto-heal` — the run resumes from the spec, folds the
answers in, and implements on branch `dev-auto-xp-assist-split` (off development, per this run's
directive).
