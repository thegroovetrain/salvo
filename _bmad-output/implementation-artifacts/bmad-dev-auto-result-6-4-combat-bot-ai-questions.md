---
status: blocked
blocking_condition: intent gaps
story: '6.4 — Combat-Bot AI'
epic: 6
date: '2026-08-16'
base_commit: 7e9e002
branch: worktree-dev-auto-6-4-combat-bot-ai
cycle: 95
---

# Story 6-4 — Combat-Bot AI: question gate

> ## ERIC'S RULINGS — 2026-08-16 (first pass)
>
> **A1 — no playable path this cycle.** *"no, just the AI itself. 6-5 will implement solo vs ai
> mode."* The dev-gated `bots: N` room option is DECLINED. 6-4 ships the brain, the `'bot'` role and
> the evaluation harness; the bot spawn path is consumed by the batch-sim harness and unit tests
> only, and 6-5 wires it to a room. Verification is therefore **entirely** the harness — which makes
> A2's bot-vs-bot leg load-bearing rather than optional.
>
> **B3 — no targeting preference.** *"No preference at all, they should attack the best target,
> whatever that means to that bot."* Target selection is pure utility scoring, per-bot and
> per-profile. The human is a contact like any other.
>
> **C1 — TB: hit-and-run, and dogfights against its own kind.** *"TB is very much a hit-run ship,
> though a lot of TB vs TB duels end up being like dogfights, with either trying to get behind the
> other."* This is a positional requirement, not just an aggression setting: a TB bot must seek the
> rear quarter of a peer. Note the emergent geometry — the torpedo's bow ±30° arc means being behind
> an enemy denies their best weapon while keeping yours available, and the mine's astern ±60° arc
> means the same manoeuvre against a Mine Layer is dangerous.
>
> **C2 — BS: survivability is the plan.** *"BS has a lot of HP and so tries to maximize that
> survivability."* The 175 hp hull is a resource to be spent and preserved, not just a bigger buffer.
>
> **C3 — ML: the fleet-clearing economy engine.** *"ML is amazing at clearing drone fleets, and can
> gain a level lead by taking advantage of this."* Confirms B1 implicitly: bots DO farm PvE fleets,
> and for the ML that farm is a deliberate tempo strategy, not idle behaviour.
>
> **D1 — class-doctrine weights, adopted.** *"Sure."* First-pass weights derived by the
> orchestrator and placed in CONFIG as a tuning panel.
>
> **E1/E2 — NOT a difficulty ladder. PRIORITY PROFILES.** *"Each ship should just get 2-3 different
> 'priority profiles' based on whatever. I have no idea what different levels of difficulty look like
> right now, I imagine this is going to take some tweaking, so lets just get one 'difficulty' split
> across profiles working as best we can."*
>
> This is a design answer that **replaces** the question as asked. Variety comes from personality,
> not from skill tiers: every bot plays at one honest competence level, and 2-3 profiles per class
> decide what it *wants*. Consequence: the difficulty knobs (aim scatter, reaction latency) are tuned
> to a single level and are expected to be retuned by eye later.

Eric's invocation: *"6-4... Combat bot AI! This is going to be a fun one! The bots need to at least
\*appear\* to know how to play, and on top of that they have to play their ship class intelligently
and use upgrade points intelligently. You should surface absolutely all questions you may have prior
to implementation."*

**Nothing has been implemented.** The worktree carries this file only. Six read-only investigations
ran across perception, the input pipeline, the fleet AI, the boon economy, equipment/kinematics, the
room/queue seam and the batch-sim harness.

---

## The headline: Story 6-3 already built the hard part, and it fits perfectly

Amendment 13 (Eric's override — *"build the full seam now"*, against the orchestrator's
recommendation to defer) is the reason this story is mostly behaviour work rather than plumbing
work. **That call is now paying off exactly as designed.**

Adding `'bot'` to `ShipRole` and calling `addShip(id, name, 'bot', classId)` gets, with no further
code:

| Capability | Why it already works |
|---|---|
| Wins, places, contests the match | `isParticipant` is written as `role !== 'fleet'` — deliberately a negation, so `'bot'` lands on the participant side |
| Never counted for `minHumans`/countdown | `isHuman` is `role === 'captain'`; a bot can never arm a lobby (FR34 safe by construction) |
| Even, non-adjacent spawn slot | `pickSpawn` on the shared per-World lattice — 700.8u separation (amendment 20) |
| Earns XP, banks levels, draws offers | `addXpMs` refuses only `roleIsFleetHull`; a bot gets a real `buildDeck` deck |
| Spends levels through the human path | `World.spendPoint(id, choice)` is **public** and already called directly by batch-sim pilots |
| Roster row, kill feed, chrome bar, results | Insert a `PlayerMeta` — `syncRoster` picks it up; **zero schema change** |
| Personal hue + class silhouette + nameplate | `assignHue(...)`; the client's `isDroneHull` is false for a real class hull, so it renders as a captain with **zero client change** |
| Bounty/kill-leader eligibility | `bounty.ts` keys on the same predicates |

The only genuinely new server code is the brain itself, plus one `STEP_ORDER` row.

**Three corrections of record** found on the way, because CLAUDE.md will mislead the next reader:

1. **The weapon fit is PER-CLASS, not universal.** CLAUDE.md's *"universal weapon fit"* is stale.
   `loadout.ts:122-145`: Torpedo Boat = `[gun, torpedo, speedBoost]`, Battleship =
   `[gun, cannon, starShells]`, Mine Layer = `[gun, mine, decoyBuoy]`. This is the actual vocabulary
   of "play their ship class intelligently" — the classes differ by *arsenal*, not just by hull.
2. **`CONFIG.offer.size` is 4, drawn from 4 distinct card LINES** (not "3 upgrades from 3 distinct
   categories" as CLAUDE.md says). Deck sizes: TB 53, BS 55, ML 63.
3. **Blips carry identity in production.** `resolveRadarGrammar` defaults to `'silhouette'`
   (id, class, heading, speed); the identity-free raster mask is opt-in via `HC_RADAR_GRAMMAR=return`.

---

## What I intend to rule myself (orchestrator rulings — you have veto)

These are engineering calls with a clearly correct answer. I will build them this way unless you say
otherwise; I am listing them so nothing ships silently.

- **R1 — The brain runs at the `dronesTick` slot.** A `botsTick` row in `STEP_ORDER` immediately
  before `applyInputs`, exactly where the fleet AI sits, so bot input is consumed the same tick. The
  file's own comment says inserting ahead of `dronesTick` is "the one change the ordering rationale
  forbids"; beside it is the sanctioned position. Never in `ArenaRoom` — `World` stays headless.
- **R2 — Bots write `InputMsg` through `world.submitInput`, full `sanitizeInput`, `fireT: 0`.**
  Identical to the fleet AI. No shortcut, no privileged setter. This is FR36/FR37 and the GDD's
  "no special code paths" rule.
- **R3 — The observe-cost AC is met with ~5× headroom, and I will pin it.** A full 20-human lobby
  already calls `observe()` 20×/tick (one per client frame, every 50ms). Nineteen bots on a 250ms
  round-robin is **~3.8 calls/tick**. The AC's "at or below a full human lobby" is satisfied
  comfortably.
- **R4 — `observe()`'s mutation is a feature here, not a hazard.** It mutates observer state
  (`seenBallistics`, `torpDirs`) to implement exactly-once ballistic reveal, and `signals.ts:233-236`
  warns AI off it for that reason. That warning is about *speculative/repeated* calls. One call per
  bot per cadence tick is precisely the human contract, and the mutation becomes the bot's own
  reveal memory. I will pin "at most one `observe()` per bot per tick" with a test.
- **R5 — Bots narrow on the room's radar grammar exactly as the client does.** Under
  `HC_RADAR_GRAMMAR=return` a bot loses blip identity too. Cheat-proofing means inheriting the
  handicap.
- **R6 — The `ai/` import boundary uses built-in `no-restricted-imports` with path patterns.** No
  new ESLint plugin dependency; nothing suitable is installed and the built-in covers it.
- **R7 — A bot's brain must tolerate a frozen helm.** In a queue-formed room `applyPolicy` disables
  helm/weapons/radar until `active`. The brain no-ops pre-active.
- **R8 — Bot ids are namespaced (`bot-N`) and never collide** with Colyseus session ids or `fleet-N`.
- **R9 — Reuse the fleet AI's *algorithms*, not its code.** `drones.ts` already has a working
  3-iteration intercept solver, nearest-coastline island avoidance, boundary bias, un-beaching and
  target memory. The ledger explicitly warns that `fleetAI` is not reusable as combat bots (different
  perception boundary), so I will port the maths into `ai/` rather than share the module.

---

# The questions

Grouped. Every one has a recommendation; **A1, B1, C1–C3, D1 and E1 are the ones I genuinely cannot
answer for you** — they are game design.

---

## A. Scope

### A1. Does this story ship a way to actually PLAY against bots? ★

Story 6-5 (Solo vs AI) owns the *mode*. But 6-4 with no testbed is unverifiable by eye — and your
standing instruction is that a playtest checkpoint is the highest-value instrument available.

The clean seam exists: a **dev-only `bots: N` room option** on the already-doubled `HC_DEV_OPTIONS`
gate (`sanitizeRoomOptions`). A queued client can never reach it — `StandardQueueRoom.formMatch`
never forwards client options — so it is reachable only through the dev direct-join door
(`?direct=1`), which is itself gated. It decides nothing about how 6-5 selects a mode; the arena
still never learns a mode.

- **(a) Yes — dev-gated `bots: N` ships with the driver. [Recommended]** You can sail against 19
  bots this cycle via `?direct=1&bots=19`. Costs ~30 lines. Also restores the solo-playtest loop
  amendment 9 flagged as lost.
- (b) No — driver + harness only; bots are first sailable in 6-5.
- (c) Yes, and go further: make it non-dev so it is a real playable mode now (this pre-empts 6-5).

**One consequence to note either way:** `CONFIG.match.minHumans = 2` means 1 human + 19 bots never
arms a countdown in production. The dev door already has `matchOverride.minHumans`, so (a) works
today. Under (c) you would need a real ruling on solo termination — which the ledger says is
**6-5's** owed debt, not this story's.

### A2. How much of the batch-sim harness does 6-4 rebuild?

The epic-5 retro filed a hard action: *"Story 6-4 must REBUILD the AR18 batch-sim capability that
amendment 41 deleted."* AR12 named the harness triple-duty. Current state:

| Duty | Status |
|---|---|
| Economy tuning | Covered — better than before, via `pveKillsByClass` from real matches (amendment 44) |
| **Bot-vs-bot evaluation** | **Uncovered.** This story's own AC. |
| **Pre-launch load test (`loadTest.mjs`)** | **Uncovered.** Story 7-6's release gate names the file *by name*. |

The three existing harness pilots (`gunner`, `pacifist`, `endgame`) are **deliberately omniscient** —
they read `world.ships` directly. They are a measurement instrument, not AI, and the file says so.

- **(a) Bot-vs-bot evaluation only; `loadTest.mjs` stays with 7-6. [Recommended]** They are
  different instruments: bot-vs-bot is in-process (no sockets), load test is a socket-spike test
  against a deployed tier. Building the second here would be scope creep into an epic-7 gate.
- (b) Both — close the whole AR18 debt in this cycle.
- (c) Neither; defer both again (I do not recommend this — 7-6 is a beta gate).

Under (a) I would add a `combat` pilot that drives the **real** perception-gated bot brain, so the
harness measures the shipped AI rather than a proxy. That is the honest reading of "measured, not
felt".

### A3. Should the harness's existing omniscient pilots be retired?

Once a real bot brain exists, `gunner` is a second, dumber, cheating combat AI. Keeping both means
two things called "the AI".

- **(a) Keep them. [Recommended]** They are *controls* — `pacifist` and `endgame` are pinned
  instruments behind the Story 3.1/3.4 storm evidence, and their omniscience is what makes them
  reproducible. Retiring them would invalidate the batch-sim evidence chain.
- (b) Retire `gunner` (keep the two storm controls), since the combat pilot supersedes it.

---

## B. What a bot does — the behaviour model

### B1. What is the bot's job description? ★

This is the "at least *appear* to know how to play" question, and it sets everything below. A BR
captain's actual loop is: survive the ring → find someone → win the fight → bank and spend → repeat.

- **(a) Full BR citizen. [Recommended]** Storm-aware routing, hunts contacts, breaks off when
  losing, farms PvE fleets when no captain is in reach, spends levels continuously. Reads as a
  player.
- (b) Combat-focused: fight well, but ignore PvE fleets and treat the storm as a soft constraint.
- (c) Aggressive skirmisher: always hunting, never retreats. Simpler, more lethal, less believable.

**A specific sub-call inside (a):** should bots hunt **PvE fleets** for XP? It is how a human levels,
and 84 fleet hulls now carry 35 levels of income (amendment 24). If bots ignore it they will be
systematically under-levelled versus a human who farms — which makes them feel weak late. If they do
farm it, they spend match time not fighting you. I recommend **yes, farm when no captain contact is
live**, but it is a real pacing decision.

### B2. Does a bot ever retreat, and does it repair?

There is a genuine mechanic here: the heal (`HEAL_CHOICE`) is +25 instant hp and +25 into a drain
pool at 5 hp/s, spendable any time while alive. A human at 30 hp disengages and heals.

- **(a) Yes — disengage below a HP threshold, heal if a level is banked, re-engage. [Recommended]**
  What threshold? I suggest **35% hp**, tunable in CONFIG.
- (b) No retreat; fight to the death. Simpler, reads as robotic.
- (c) Retreat but never heal (heals reserved for cards).

### B3. In Solo vs AI, do bots preferentially hunt the human? ★

The single biggest determinant of whether your first match is fun. Nineteen bots that all correctly
identify and converge on the one human is a miserable first experience; nineteen bots that avoid you
is target practice.

- **(a) No preference at all — the human is just another contact. [Recommended]** Structurally
  honest, matches "the arena never knows the mode", and the fog does the balancing work naturally.
- (b) Slight aversion (bots weight the human lower) so the opening is survivable.
- (c) Slight preference, so the player always has action.

I recommend (a) on principle — but flagging that with 19 bots on a 2800u ocean, (a) is untested and
could read as either "alive world" or "nobody ever finds me". This is measurable in the harness
before you have to commit.

### B4. Do bots coordinate?

- **(a) No. Each bot is independent. [Recommended]** Coordination is a teams feature and teams are
  unhomed scope. Independent bots that happen to converge on the same fight already read as chaos.
- (b) Loose: bots avoid stealing each other's target.
- (c) Real focus-fire packs.

### B5. Do bots use the foghorn?

The horn is a deliberate, expressive player tool (bearing + variant, 660u). Bots honking would be
strong flavour — and also a real information leak they would be paying voluntarily.

- **(a) No. [Recommended]** It is a communication tool with nobody to communicate with; a bot
  honking is noise that misleads the human about another player's presence.
- (b) Yes, occasionally — it makes the ocean feel populated.

### B6. Does a bot ever deliberately eat storm damage?

At 4 hp/s with the sudden-death collapse to radius 0 at 16:00, late-match positioning is a real
skill. A bot that always leaves early is exploitable; one that cuts it fine sometimes dies.

- **(a) Leave with a safety margin derived from the class's own speed and the ring's closing rate.
  [Recommended]** Battleship leaves earliest. Emergent, no magic numbers.
- (b) Fixed early-leave timer (simpler, reads as timid).

---

## C. Playing the class intelligently ★ — the heart of the story

Each class is a different *arsenal*. This is where "play their ship class intelligently" cashes out.
I need your design voice on all three; below is my read plus the numbers that constrain it.

### C1. Torpedo Boat — `[gun, torpedo, speedBoost]`

125 hp (thinnest), 45 u/s (fastest), turn radius **56.3u** (tightest), boost +10 u/s for 6s.
Torpedo: 70 damage (the biggest single hit in the game), **30s reload**, 60 u/s, **bow arc ±30°**,
contact-only. At the 247.5u detect rung a torpedo flies **4.1s**, during which a TB target moves 185u.

- **My read:** a hit-and-run harasser. Uses speed to control engagement range, opens with a torpedo
  at close-to-mid range where the lead is solvable, guns during the 30s reload, boosts to disengage
  when hurt. **Should it attempt long-range torpedoes?** A 4s+ flight against a manoeuvring target is
  close to a coin flip, and a wasted torpedo costs 30s.
- **(a) Torpedoes only inside a range where the intercept is credible (~250u). [Recommended]**
- (b) Fire torpedoes whenever loaded and roughly aligned — more fish in the water, more misses, more
  visible threat.

### C2. Battleship — `[gun, cannon, starShells]`

175 hp (thickest), 35 u/s (slowest), turn radius **87.5u**. Cannon: 65 damage, 30u burst, **45s
reload** (25s fully cooled). Star shells: 0 damage, lights a 165u radius for 10s — a *sensor* weapon
that reveals hulls inside the lit zone.

- **My read:** a standoff brawler. Holds range, lands cannon hits, guns between. The interesting
  question is **star shells** — they are the one piece of kit that is purely informational, and using
  them well (light the water where you *suspect* a contact, then shoot what appears) is exactly what
  "appears to know how to play" looks like.
- **(a) Use star shells to resolve stale radar contacts into live sight. [Recommended]** Fire at the
  last-known position of a blip that has gone quiet. This is genuinely clever behaviour and is
  visible to the player.
- (b) Ignore star shells (bot fires cannon + gun only). Simpler; the BS bot is then just a slow gun
  platform.

### C3. Mine Layer — `[gun, mine, decoyBuoy]`

150 hp, 40 u/s, turn radius 66.7u. Mine: 55 damage, 48u blast, 32u trigger, **astern arc ±60°**,
150u placement range, 3s arm, up to 5 live. Decoy buoy: a static false contact.

- **My read:** area denial. The astern arc means mines are laid *while running away* — a bot being
  chased should be seeding its wake. That is a legible, characterful behaviour and it is exactly what
  a good human ML does. Amendment 24 also made the ML a deliberate fleet-farming machine (a base
  mine now one-shots a 45 hp small fleet hull).
- **(a) Lay mines when being pursued, and around PvE fleet groups it is farming. [Recommended]**
- (b) Also lay proactive minefields near the ring edge / chokepoints (more strategic, much harder to
  do well, risk of a bot mining empty ocean).
- **Sub-question:** should a bot **avoid its own and others' mines**? A bot must at minimum not drive
  into mines it can see (`MineView` is disclosed at the 3/8 detect rung, and own mines always). I
  recommend yes — a bot killing itself on its own mine would look broken.

### C4. Does the decoy buoy get used?

- **(a) Yes — drop when disengaging, to break a pursuer's lock. [Recommended]** It is the ML's
  disengage tool, symmetric with the TB's boost.
- (b) No — leave it unused this story.

---

## D. Spending upgrade points intelligently ★

The only card-scoring code in the repo is the batch-sim's, explicitly headered *"a measurement
instrument, NOT canon AI"*: pure rarity ranking, 75% top-pick, no stat awareness. That is not good
enough for "use upgrade points intelligently", so this is greenfield.

The offer is 4 cards from 4 distinct lines, plus the heal option always available.

### D1. What policy drives a bot's pick? ★

- **(a) Class-doctrine weights. [Recommended]** Each class carries a weight table over categories
  reflecting how that hull wants to fight — e.g. a TB values `ship` (speed), `torpedoes` and
  `intel`; a BS values `cannon`, `ship` (hull) and `guns`; an ML values `mines` and `intel`. Pick the
  highest-weighted offered card, with rarity as a tiebreak. Readable, tunable, and it makes the
  three classes *build* differently, which a player will notice in the kill feed and in how bots
  fight late.
- (b) Rarity-first (reuse the harness policy). Cheapest; bots build incoherently.
- (c) Situational scoring: weight by live match state (low HP → hull; can't find anyone → intel).
  Most "intelligent", most likely to produce weird picks, hardest to reason about.
- (d) (a) + a situational override only for the heal.

**If (a): do you want to set the weights, or should I derive a first pass and put the table in
CONFIG for you to tune by eye?** I recommend the latter — it is a tuning panel, like the height-field
knobs.

### D2. When does a bot take the heal instead of a card?

- **(a) Below a HP threshold, heal; otherwise always take a card. [Recommended]** Suggest **50%**,
  in CONFIG.
- (b) Never heal — always build.
- (c) Heal only when a card would be wasted (offer empty / all lines capped).

### D3. Do bots take doctrine exclusives?

The 8 doctrine cards (4 exclusive pairs) are the identity-defining picks — AP vs arcing cannon,
homing vs command torpedo, self-propelled vs prop-fouling mines, incendiary vs dazzle star shells.

- **(a) Yes, and prefer them. [Recommended]** They are the most visible expression of "this bot has
  a build". A bot fitting AP shells fights recognisably differently.
- (b) Yes but neutral weighting.
- (c) No — keep bots on commons for predictability.

**Note the known trap if you take (a):** three unruled dead-card findings still stand
(`mineDamage`×`minePropFouling` is pick-order dependent, 53 vs 45 hp; `mineTrigger`'s 5th card is
~75% clamped away; at most 1 of 6 acquisition cards can ever fire). A bot picking by weight will hit
the pick-order bug systematically where humans hit it by luck. **I am not proposing to fix those
here** — they are unruled and out of scope — but a doctrine-preferring ML bot will reliably land on
the worse ordering unless I special-case it, which I would rather not do silently.

### D4. Should bots spend immediately, or bank?

A human often banks a level through a fight and spends in a lull (spending is blocked while sinking,
but not in combat).

- **(a) Spend immediately when a level banks. [Recommended]** Simplest, and it never leaves a bot
  under-built by accident.
- (b) Spend in lulls only — more human-like, risks bots dying with levels unspent.

---

## E. Difficulty and fairness ★

### E1. Is there one bot skill level, or a ladder? ★

Nothing in the GDD or epics settles this. It matters because Solo vs AI is the launch-day first
match for most players.

- **(a) One level, tuned to "a competent but beatable captain". [Recommended]** Ship one honest
  difficulty now; a ladder is a menu feature (6-6) and a tuning campaign we have no evidence for yet.
- (b) A ladder (easy/normal/hard) selectable in 6-6.
- (c) One level now, but build the knobs so a ladder is a CONFIG table later. *(This is (a) with
  foresight — and is what I would actually build.)*

### E2. What is the difficulty channel?

The fleet AI's precedent is a single clean knob: `CONFIG.fleet.aimScatterU` (25/15/8 u by hull size)
— a uniform-disc scatter on the aim point. It is honest (the bot still has to be pointing the right
way) and continuous.

- **(a) Aim scatter + reaction latency. [Recommended]** Scatter blunts marksmanship; a reaction delay
  (bot does not act on a contact until it has been visible for N ms) blunts reflexes. Together they
  cover the two ways a human is worse than a machine.
- (b) Aim scatter only (matches the fleet precedent exactly).
- (c) Scatter + latency + a deliberate decision-quality knob (bots sometimes pick the wrong target).

**What should a captain-grade bot's scatter be?** Fleet hulls run 8–25u. A captain bot should be
tighter than the best fleet hull. I suggest **~6u at 250u range, scaling with range**, tunable.

### E3. Does the 250ms observe cadence double as a fairness knob?

The AC calls it "a fairness knob". At 250ms a bot's world model is up to 5 ticks stale — comparable
to a human's reaction time, which is a nice accident.

- **(a) Yes — keep 250ms and treat staleness as part of the handicap. [Recommended]**
- (b) Observe faster (every tick) and handicap only through scatter/latency. Costs 5× the perception
  budget.

### E4. Should bots be *identifiable* as bots by the player?

Story 6-5's AC says bots read as combatants everywhere (class silhouettes, personal colours,
nameplates, kill feed) — only drones are greyscale. The GDD says *"bots never masquerade as
players"*, but in context that is about **standard lobbies having no bot-fill**, which FR34 already
guarantees.

- **(a) In Solo vs AI, bots look exactly like captains. [Recommended]** You chose the mode; there is
  nobody to deceive. This also requires **no wire change** — the roster carries no human/bot bit
  today, and adding one would move `PROTOCOL_VERSION`.
- (b) Mark them (a prefix, a nameplate glyph). Honest, but costs a wire field and a PV bump, and it
  is really a 6-5 presentation decision.

### E5. What do bots get called?

Fleet hulls are all the constant `'DRONE'`. Captains get their typed name or `CAPTAIN-n`.

- **(a) A pool of nautical callsigns, drawn without repeat. [Recommended]** Fits the game's voice,
  and a kill feed reading `HALYARD sank BILGE RAT` is far better texture than `BOT-07`. I would draft
  ~30 names in CONFIG for you to edit.
- (b) `CAPTAIN-n`, same as an unnamed human.
- (c) `BOT-n` — self-identifying (interacts with E4).

---

## F. Measurement — "bot quality is measured, not felt"

### F1. What numbers constitute a pass?

The AC names the axes (kill distributions, match lengths, storm deaths) but no thresholds. My
proposal, from the shipped contract:

| Metric | Proposed bar | Why |
|---|---|---|
| Match resolves | > 95% of bot-only matches finish before the 16:00 collapse | Sudden death guarantees termination; a bot lobby that routinely rides to 16:00 is not fighting |
| Kill distribution | No bot takes > 40% of a match's kills; > 60% of bots score ≥ 1 | A flat zero for most bots means they cannot fight |
| Storm deaths | 5–20% of deaths | 0% = timid; > 20% = cannot read the ring |
| Grounding | < 1% of bot-ticks in land contact | A beached bot is the most visible possible failure |
| Levels spent | > 90% of banked levels spent before death | Proves the economy path works |

- **(a) Adopt these as the story's measured bar. [Recommended]** They are falsifiable and I can
  report the real table at the end of the cycle.
- (b) Measure and report, but set no pass/fail bar this cycle.
- (c) You set different numbers.

### F2. Do you want a bot-vs-bot evidence artifact?

Every prior tuning cycle produced one (`batch-sim-evidence-YYYY-MM-DD.md`).

- **(a) Yes — `bot-evidence-2026-08-16.md` with the F1 table across N seeds. [Recommended]**
- (b) No, put the numbers in the spec's Verification section only.

---

## G. Smaller calls I can take either way

| # | Question | Recommendation |
|---|---|---|
| G1 | Do bots respawn? | **No** — BR participants do not respawn; matches human behaviour |
| G2 | Do bots use `speedBoost`/`decoyBuoy` on cooldown or situationally? | Situationally (disengage/close) |
| G3 | Should a bot's `aimDist` be its true intercept range, or clamped? | True intercept — `burstPointAlong` clamps for it, same as a human's click |
| G4 | Do bots react to the `hc` Hit Call / `sp` splash (their own gunnery feedback)? | **Yes** — it is self-private and it is exactly how a human brackets fire. Cheap and characterful |
| G5 | Do bots react to hearing a foghorn (`fh` bearing)? | Yes — treat as a weak contact bearing |
| G6 | Do bots chase the bounty/kill leader? | No special behaviour; `bountyId` is public but chasing it is a human choice |
| G7 | Where does the bot's per-hull state live? | In `ai/`, keyed by ship id — never on `ShipRecord` (keeps `World` clean) |
| G8 | Do bots handle the `'return'` radar grammar? | Yes, per R5 — they degrade exactly as a human client does |

---

## What happens next

Answer what you care about — **A1, B1, B3, C1–C3, D1, E1 are the ones that actually change what gets
built**; anything you skip, I will take the recommendation and record it as an orchestrator ruling in
`epic-6-context-amendments.md` (flagged as mine, not yours, per the standing agreement that an
orchestrator ruling about presentation is provisional until you have seen it).

Then I will write the spec, run the implementation through routed subagents (Fable for the
perception boundary and the wire-adjacent work, Opus for the brain and the harness, Sonnet for
mechanical wiring), gate it with an adversarial review plus a Codex cross-model pass, and land it as
cycle 95 / 0.17.95.

**Estimated `PROTOCOL_VERSION` movement: none.** Everything here is server-side simulation and a
roster row that already exists on the wire. That holds unless you take E4(b) or A1(c).
