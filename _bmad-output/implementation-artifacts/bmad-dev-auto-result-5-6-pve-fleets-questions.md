---
status: blocked
---

# BMad Dev Auto Result — Story 5.6 Roving PvE Fleets + ring scale-up: QUESTION GATE

Status: blocked (pre-implementation question gate; Eric rulings required before a spec exists)
Blocking condition: nineteen design rulings across five clusters — the XP arithmetic (which decides
how many hulls are on the water, and therefore whether the story is buildable at all), the
self-defence behaviour model, the mid-match spawn rule, what survives the deletion of the
match-start fill, and the ring scale-up (where the shipped constraint test says the requested
change is impossible without a second ruling).

## Intent (invocation, 2026-08-14)

> `/bmad-dev-auto 5-6. we are going to defer fog and whirlpools for now, lets move on to PvE fleets.
> Drones are now going to be retooled! ... ||| while we are at it, lets scale the ring up a bit, I
> feel like the map is a little too small, so each stage doesn't force enough movement. ||| surface
> all questions before implementation, use /orchestrate to select models for subagents based on task
> complexity.`

Branched fresh from `origin/main`, which carries Story 5-3 (PR #135, the omniscient reveal) —
Eric's local `main` was 5 commits behind it. Stories 5.4 (Fog Banks) and 5.5 (Whirlpools) are
**deferred by this invocation**, not cancelled. **No code, CONFIG, wire or test change has been
made.** Everything below is investigation.

Four investigation subagents were dispatched, model-routed per `/orchestrate` — **Opus** for the
three architectural sweeps (the drone subsystem end-to-end, the fire-control/equipment path, the
perception + spawn boundary), **Sonnet** for the mechanical dependency inventory (map radius and
ring geometry). Every load-bearing claim below was re-verified by hand against the source.

## Already ruled in the invocation (not questions — recorded so the spec can cite them)

| | small | medium | large |
|---|---|---|---|
| hp | 60 | 75 | 90 | *(was 80 / 100 / 120)* |
| gun damage | 6 | 8 | 10 | on a flat 5 s cooldown, all sizes |
| kill value | ¼ level | ⅓ level | ½ level | already shipped verbatim |
| max speed | **40** | **35** | **30** | *(was 46 / 38 / 30)* |

The speed ruling **discharges the rescale `epics.md:1090` has owed since Story 1.6**: `droneSmall`
at 46 was the fastest hull afloat, ahead of the Torpedo Boat's 45. At 40 it now sits below every
player class, `droneMedium` at 35 ties the Battleship, and the torpedo's `speed: 60` still outruns
everything (the `damageGuardrail` pin holds). Also ruled: **rudimentary pathfinding** so a fleet
ship neither beaches nor sails out of the ring, and a **full throttle range** — slow down, speed up,
and reverse.

That last clause pulls a deferred item forward: `deferred-work.md:352-354` records that `drones.ts`
has *no stuck-detection or un-beach AI* and homes it at Story 6-4 (Combat-Bot AI). Reverse is
exactly the missing tool — today's controller rolls `throttle ∈ [0.5, 1.0]` (`drones.ts:62-63`) and
can only ever drive *forward into* whatever it is stuck on. Building it here closes that entry
early rather than duplicating it.

---

## Headline 1: the hard part of "give drones a gun" is already built. It is one line.

This is the opposite of what the story's size suggests, and it is worth stating first.

`shared/src/sim/loadout.ts:116-121` keys fitment off **hull id with a catch-all default**:

```ts
if (hullId === 'torpedoBoat') return ['torpedo', 'speedBoost'];
if (hullId === 'battleship')  return ['cannon', 'starShells'];
if (hullId === 'mineLayer')   return ['mine', 'decoyBuoy'];
return ['torpedo', 'mine'];        // ← every drone size falls through here
```

So **every drone afloat today already carries a fully-fitted, fully-loaded gun** — plus torpedo
tubes and mines — and `fireControl` (`world.ts:2842-2846`) already ticks their reloads every tick.
The only thing stopping them shooting is `drones.ts:140`'s constant `fireSeq: 0`: a constant counter
can never out-run `lastFireSeq`. That is the whole "STRUCTURAL GUARANTEE" (`drones.ts:9-15`).

Three more things are free:

- **Per-size gun damage.** `ShellState.damage` is captured **at fire time from `ship.stats.gun`**
  (`guns.ts:141-152`) and read at hit time from the shell, never from CONFIG. A per-size damage
  value needs no change to the damage path at all.
- **"They have no radar sensors" is the default, not a feature.** `observe()` runs only inside
  `for (const client of this.clients)` (`ArenaRoom.ts:823`). A drone has no client, so it is never
  an observer. No `hasRadar` flag is needed. *(Note in passing: `advanceSweeps` (`world.ts:3211`)
  spins a radar sweep for every drone that nothing ever reads.)*
- **Muzzle flash / splash / hit-call** are shooter-agnostic (`world.ts:3084`, `:2492`, `:2475`), so
  a firing fleet ship emits `mz` correctly and anonymously with zero perception work. See the
  flagged spectator consequence at the end of Cluster D for the one place this bites.

**What is genuinely new is the AI.** There is no target, aggro, or threat concept anywhere in the
server — a sweep for `aggro|threat|npc|hostil|pursue|chase` returns two incidental comments.
`DroneController` says so itself (`drones.ts:17`): *"Steering is deliberately dumb (this is NOT an
AI)"*. Its `DroneMind` is `{rng, seq, waypoint, throttle}` and it never reads another ship.

## Headline 2: the XP arithmetic decides whether this story is buildable, and I cannot resolve it

The tier values are already shipped and already match the ruling exactly —
`CONFIG.xp.droneTierLevels` = `{droneSmall: 0.25, droneMedium: 1/3, droneLarge: 0.5}`
(`constants.ts:846-850`), consumed by `World.killXpLevels` (`world.ts:1377-1382`). Nothing to change.

The problem is the wave totals. The codebase has **no XP unit other than the level** — `killLevels:
1`, `levelMs: 60000`, and the tiers are literally fractions of a level. So *"enough PvE fleets to
provide 15 XP"* reads as **15 levels**, and the hull counts follow directly:

| Wave | Target | Fewest hulls (all large) | Most hulls (all small) |
|---|---|---|---|
| 1:00 | 15 levels | **30** | 60 |
| 5:00 | 10 levels | **20** | 40 |
| 9:00 | 5 levels | **10** | 20 |
| **cumulative** | 30 levels | **60** | **120** |

The *exactly* constraint is satisfiable — in twelfths the sizes are 3/4/6 and the targets 180/120/60,
so `3a + 4b + 6c = target` has many integer solutions. That part is fine.

**The hull count is not fine.** Today's reference scenario is 20 hulls. This is 4–7× that, on top
of up to 20 captains, and the measured budgets were taken at 20:

- Client radar worst case **1.74 ms against a 2.5 ms bar** with 20 moving hulls (cycle 70).
- Server wake rasterization **+425–470 µs/tick** adversarial at 20 hulls.
- `observe()` per client is a full scan of ships, shells, mines, zones, decoys **and every wake
  ribbon segment** (`perception.ts:113-259`), run once per connected client per tick. At 140 hulls
  × 20 clients that is 2,800 ship rows per tick before the wake ribbons.

There is also a **geometry** problem independent of perf: by 9:00 the live ring is ~1015 u
(see Headline 3), and 60–120 fleet hulls do not fit in it in any meaningful sense.

For scale on the economy side: 30 levels of PvE XP is **more than every captain kill in a full
20-player match combined** (19 levels) and ~2.5× a survivor's whole passive accrual. That may be
exactly the intent — *"my XP has a second faucet"* — but it is a large enough shift that I will not
assume it.

## Headline 3: the ring cannot be scaled up. A shipped test says so, and it is the right test.

`shared/src/__tests__/zone.test.ts:235-247` pins the **closing-rate criterion**:

```
worstEscape = (1 + offsetCap) × maxΔr      must satisfy   0.75 < worstEscape / battleshipMinute < 0.85
battleshipMinute = battleship.maxSpeed(35) × beatMs/1000 = 2100 u
```

Today: `R=2400`, `T=660` (derived from truesight, radius-independent), rings
`2400 → 1560.8 → 1015.0 → 660`, `maxΔr = 839.2`, `worstEscape = 1678.4`, **fraction 0.799**.

Because `T` is fixed while `R` grows, `maxΔr` grows while the denominator does not move at all:

| R | maxΔr | worstEscape | fraction @ 60 s beat | verdict |
|---|---|---|---|---|
| 2400 (today) | 839 | 1678 | **0.80** | in band |
| 2480 | 886 | 1771 | 0.843 | last passing value |
| 3000 | 1189 | 2378 | 1.13 | **test fails** |
| 4800 | 2319 | 4638 | 2.21 | fails badly |

**So there is ~3% of headroom in `baseRadius` and no more.** Raising it *requires* a second ruling.

**And here is the finding that reframes the ask entirely:** that test pins worst-case forced
movement at ~80% of a battleship-minute *regardless of map size*. Scaling the ocean therefore
**cannot** make each stage force more movement — the criterion holds it constant by construction.
A bigger map buys more open water, more islands, longer transits and lower encounter density. If the
complaint is *"each stage doesn't force enough movement,"* **the lever is the criterion itself, not
the radius.** They are two different asks and Eric's sentence contains both.

Four coherent packages, with exact numbers:

| # | Change | Ocean | Close urgency | Match length | Cost |
|---|---|---|---|---|---|
| **0** | `beatMs` 60 s → 48 s only | unchanged | 0.80 → **1.00** | 12:00 → **9:36** | shortest match; smoke re-tune |
| **1** ★ | `baseRadius` 2400 → **2800** only | **+36%** | 0.80 → **1.02** | **12:00 unchanged** | re-ratify the test band |
| **2** | `baseRadius` → 3000, `offsetCap` 1.0 → **0.4** | +56% | **0.79 unchanged** | **12:00 unchanged** | rings much less off-centre |
| **3** | `baseRadius` → 3000, `beatMs` → **68 s** | +56% | 0.80 → **1.00** | 12:00 → **13:35** | still inside the ~15:00 contract |

★ **Option 1 is my recommendation**: it is the only one that delivers *both* halves of the sentence
(a bigger ocean **and** a genuinely urgent close) while leaving match length and ring eccentricity
alone. A fraction of ~1.0 means a battleship caught at the worst possible position must run the
entire close beat at flank speed to *just barely* survive — which is a precise statement of "forces
movement." Above 1.0 it takes storm damage, which is also defensible; that is Eric's dial.

Whatever is chosen: `PROTOCOL_VERSION` bumps (same seed builds a different ocean — the cycle-59
precedent), and `heightField.ts:160-221`'s `regionWavelength: 2400` is a **fixed world-unit literal
currently sized to span the disc exactly once** — past ~2400 u the macro land-clustering term starts
repeating across the map. It should track the radius, and the result wants an eyeball pass.

**Collision check, deliberate:** Story 6.2 (Roster-Scaled Oceans) owns roster-dynamic sizing and its
AC explicitly names this same coupling. `deferred-work.md:313-314` says the 3.1 map bump was *"sized
for the closing-rate criterion, NOT for teams; 6.2 owns roster-dynamic sizing."* Doing the radius
half now without a curve is the wrong half first — but it is a static-literal change 6.2 would
re-derive anyway, so I read it as cheap to do now. Q19 puts that to Eric rather than assuming.

---

# THE QUESTIONS

## Cluster A — the economy (these decide whether the story is buildable)

**Q1. Does "15 XP / 10 XP / 5 XP" mean 15 / 10 / 5 LEVELS?**
If yes, the waves are 30–60, 20–40 and 10–20 hulls (table above), cumulative 60–120, against a
20-hull reference scenario and a measured 1.74 ms/2.5 ms client budget. I do not think that ships.
If the intended unit is smaller — e.g. quarter-levels, giving wave 1 as 15 small ships ≈ 3.75 levels —
the numbers become ordinary and the whole story fits inside the existing budgets.
*My read:* the phrasing points at levels, the arithmetic points away from it. **Needs your number.**

**Q2. Do unkilled fleet ships persist, or does a wave despawn when the next arrives?**
Nothing removes a drone mid-match today (`removeShip` is called only for real client sessions,
`ArenaRoom.ts:652`). **The follow-up ruling closes the elegant option**: because fleets must *not*
leave the ring, they cannot be allowed to drown in the storm as a self-cleaning mechanism — every
hull that is not sunk by a captain is still afloat, inside an ever-smaller circle, at 12:00. Two
options remain: (a) they persist and accumulate, or (b) an earlier wave despawns when the next
spawns — clean for perf, but the XP vanishes and a hull evaporating in open water is a strange
thing to watch.
*Recommendation:* (a) persist, **conditional on Q1 producing ordinary hull counts.** At 60–120
hulls persistence is not survivable: the terminal ring is 660 u across and would contain more fleet
ships than water. So Q1 and Q2 are really one ruling — if the counts stay large, (b) becomes
mandatory whatever it looks like.

**Q3. Do the wave totals scale with roster size?**
15 levels split among 2 captains is 7.5 each; among 20 it is 0.75 each. Fixed totals mean a small
lobby is drowning in XP. *Recommendation:* fixed for now (it is one constant to change later), but
say so explicitly if that is the intent.

## Cluster B — self-defence behaviour

**Q4. What is the fleet ship's "LOS range"?**
The ruling says they follow an aggressor *"within LOS range"* but names no number. Candidates:
`CONFIG.vision.sight` (330 u, the captain's truesight bubble) for all sizes, or a per-size ladder
(a bigger ship has a better lookout). Island LOS applies either way — `losClear` is the shipped
primitive and is already exported (`signals.ts:196`).
*Recommendation:* one number, `CONFIG.vision.sight`, for all three sizes. Per-size vision is a
second dial with no clear payoff.

**Q5. The player's gun outranges fleet vision 2:1. Is free sniping intended?**
Gun base range is `CONFIG.vision.radar` = **660 u** (`stats.ts:244`); fleet vision would be ~330 u.
So a captain can shell a fleet ship from outside its world entirely, and under a strict reading of
*"defend themselves ... within LOS range"* the target can neither shoot back nor chase. That makes
farming completely risk-free and the whole self-defence model decorative.
Options: (a) accept it — sniping is a legitimate skill expression, and the 5 s reload caps the rate;
(b) an attacked-but-blind ship steers toward the incoming bearing and closes until it *does* have
LOS; (c) fleet vision is raised to gun range, which makes them fight back properly but also makes
them much more dangerous.
*Recommendation:* (b). It preserves "they cannot see you" while denying a free kill, and it costs
one bearing field on the mind.

**Q6. Does an attack the target cannot see cause aggro at all?**
Same seam, different case: mines, torpedoes and shells from beyond vision. A mine in particular has
a layer who may be nowhere nearby. *Recommendation:* the victim aggros on the *attacker id* the
damage already carries (`hitShip(victim, amount, byId)`), and Q5's answer decides what it can do
about it. A mine kill should probably **not** aggro, since there is nothing to chase.

**Q7. Confirming target-switching, and asking when the witness check is evaluated.**
The first half looks **already answered** — *"once you leave their LOS, they stop chasing you and
can acquire a new target if attacked by someone else"* implies a held target is **not** given up for
a new attacker; re-acquisition happens only after the current one is lost. I am reading it that way
and only flagging it in case the directly-attacked case was meant to be an exception. It makes
third-party rescue a real play, so I like it.
The genuinely open half is **timing**: *"all PvE ships who can see both you and the ship that was
attacked"* — is that evaluated **once, at the instant of the hit**, or **continuously while the
fight lasts**? One-shot means a fleet ship that rounds an island two seconds later never joins in;
continuous means a running fight steadily recruits everything that wanders into view, which is a
much bigger fight and a much bigger perf question.
*Recommendation:* evaluate **once, at the instant of the hit.** It is cheaper, it is bounded, and it
rewards positioning — hit them where the rest of the fleet cannot see you.

**Q8. On losing LOS, do they forget instantly?**
An instant drop makes them jitter at every island edge and trivially kiteable behind a rock.
*Recommendation:* a short memory (~3 s) during which they hold the last known bearing, then revert
to roving. One constant.

**Q9. Do they lead the target?**
The gun bursts at a **clicked point** (`burstPointAlong`, `guns.ts:61`), 15 u burst radius, shell
speed 500 u/s. At 330 u the flight time is 0.66 s, in which a torpedo boat moves 30 u — twice the
burst radius. So **no-lead misses almost every moving target and perfect lead almost never misses.**
The accuracy model is a design decision, not an implementation detail.
*Recommendation:* lead the target, then add a per-size aim error (largest error on the small hull),
so size reads as competence as well as toughness.

**Q10. Fleet-on-fleet: friendly fire, and does it cause aggro?**
`burstVictims` excludes only the owner (`world.ts:2617`), so a fleet burst damages other fleet ships,
and under the ruling as written that would aggro them at each other.
*Recommendation:* fleet ships never damage fleet ships, and never aggro each other. Anything else is
a comedy of drones brawling in the corner while captains watch.

**Q11. Gun only — or do they keep the torpedoes and mines they already have?**
Today every drone hull fits `[gun, torpedo, mine, empty]` (Headline 1). Leaving that fit means their
torpedo and mine reloads tick every tick for nothing; restricting `specialsFor()` to gun-only is the
honest shape, but **`server/src/__tests__/equipment.test.ts:46-65` uses `droneMedium` as the fixture
the entire equipment suite is built on**, so that suite needs a new fixture hull.
*Recommendation:* gun-only, and re-point the equipment suite at a real ship class.

**Balance note attached to Q1, worth reading before answering it.** With the witness-aggro rule, a
cluster fights as one. At 6/8/10 damage on a 5 s cooldown a single large fleet ship is 2 dps — a
nuisance against a 125 hp torpedo boat. **Five of them are 10 dps; twenty are 40.** Meanwhile the
captain's own gun (15 damage, 5 s) needs 4/5/6 hits to sink one, i.e. **20–30 seconds per kill with
every shot landing.** So the fight is: 30 seconds to earn ½ a level, while everything that watched
you start shoots back. That is a genuinely interesting engagement at 3–5 hulls per fleet, and a
massacre at 30.

**Q17. `maxSpeed` moved — does the rest of the envelope move with it?** *(added after the follow-up
ruling)*
Each drone size carries a full kinematics block — `reverseSpeed`, `accel`, `decel`, `turnRate`,
`steerageSpeed` — and those are still **byte-for-byte the retired destroyer/cruiser/battleship
prototype blocks**, pinned deliberately by `shared/src/__tests__/shipClasses.test.ts:121-156`. With
`maxSpeed` now ruled, the rest is either re-derived or left as-is, and the test table updates
deliberately either way (it is designed to make exactly this a reviewed edit).
Sub-question that matters for the pathfinding ask: `reverseSpeed` is currently **14 / 12 / 10**, and
reverse is the tool an un-beaching manoeuvre actually uses.
*Recommendation:* scale `reverseSpeed`, `accel` and `decel` proportionally with the speed change and
leave `turnRate`/`steerageSpeed` alone, so agility reads as a size property rather than drifting
with a speed retune. Say the word if you want the whole block set by hand instead — these are your
numbers, and I would rather ask than derive them for you.

## Cluster C — mid-match spawning

**Q12. Where may a fleet spawn, and what happens when nowhere qualifies?**
Two facts: **nothing in the codebase spawns a ship mid-match today** (`addShip` at join, redeploy at
the countdown boundary, respawn in the waiting phase only), and **`pickSpawn` has no hard
minimum-distance constraint at all** — `occupied` only affects a max-min *score* (`spawn.ts:124-138`),
so "outside every combatant's intel range" is a genuinely new hard constraint with no existing
infeasibility branch. The arithmetic is against us: at R=2400 the map is 18.1 M u² and each captain's
intel disc is π·660² = 1.37 M u² (up to 1327 u with a stacked `intelRadar` build, `boons.ts:344`).
Twenty captains deny more area than the map contains. By 9:00 the live ring is ~1015 u — 3.2 M u² —
and the third wave is the hardest of the three.
Sub-questions: **(a)** must fleets spawn *inside* the live ring, or may they spawn in the storm and
sail in? **(b)** when no qualifying point exists — spawn at the max-min point anyway, defer a tick
and retry, or drop that ship? **(c)** does the spawn emit the public `spawn` event (its visibility
rides `pointSighted`, so outside everyone's intel nobody receives it — but confirm rather than
inherit)?
*Recommendation:* inside the ring; on infeasibility, retry for a bounded number of ticks then fall
back to plain max-min, logged. And note this constraint is a **second, independent argument for the
bigger ocean** in Cluster D.

**Q13. Is a "fleet" a cohesive group or just N independent ships?**
The word implies formation sailing, a shared spawn point, and mutual escort — and the witness-aggro
rule (*"all PvE ships who can see both you and the ship that was attacked"*) only bites if they are
clustered. But formation-keeping is substantially more AI than waypoint roving.
*Recommendation:* fleets share a spawn point and a waypoint stream (so they arrive and travel
together and naturally witness each other) but keep no formation geometry. That buys the whole
tactical effect for almost none of the code.

## Cluster D — deleting the match-start fill, and identity

**Q14. The batch-sim economy harness is built on drone lobbies. Does it keep a dev-only fill?**
AR12 names the drone-lobby batch-sim harness as *triple-duty* infrastructure (economy tuning, load
test, bot-vs-bot evaluation) and AR18 commits to *"batch-simulate XP tick and kill-bonus outcomes
with drone lobbies before human playtests."* Deleting the fill outright kills it, along with
`dronesSmoke.mjs` (entire smoke), `drones.test.ts`'s fill suite, and the `--drones D` flag
(`batchsim/runner.ts:227-240`).
*Recommendation:* keep the fill as a **dev-only path behind `HC_DEV_OPTIONS`**, exactly as
`matchOverride`/`zoneOverride` already work. Production loses it as ruled; the evidence
infrastructure survives. Also note FR34 already says *"zero bot-fill exists in Standard — roving PvE
fleets are world content, never roster fill"* — so this deletion is a ratified direction, not a
surprise.

**Q15. `CONFIG.match.fillTo` also sizes the map, and that coupling should probably break.**
`ArenaRoom.ts:253` constructs `new World(seed, CONFIG.match.fillTo, ...)` and `mapRadius(playerCap) =
baseRadius × sqrt(playerCap / capRef)` (`constants.ts:1108-1110`). So the constant meaning *"how many
drones to fill to"* is currently also the constant meaning *"how big is the ocean."* If fill is
deleted, `fillTo` should stop being the map-size input — `CONFIG.map.playerCap` is the honest source.
*Recommendation:* decouple. This is a correctness cleanup, not a behaviour change (both are 20).

**Q16. Fleet ships and the roster — do they still get `PlayerMeta` rows?**
Today every drone gets one (`ArenaRoom.ts:444-448`) with the `REGATTA_NO_HUE` (255) sentinel, and
`syncRoster` mirrors `alive`/`kills`/`deaths` to every client every tick. The client learns
drone-ness from **two independent channels** — `Contact.cls` being a drone hull id (drives the
greyscale chevron and the `DRONE` nameplate) and that 255 sentinel (drives kill-feed grey, blip
grey, `n AFLOAT` exclusion, and "SHIPS YOU SANK" exclusion). At 60–120 fleet hulls the roster
becomes the dominant schema cost, and only the *second* channel needs it.
Also, a fleet ship that sinks a captain currently **accrues a roster kill and appears in the public
kill feed as `DRONE-07`** (`world.ts:1350-1357`) — correct code, unruled presentation.
*Recommendation:* answer Q1 first. At ordinary counts, leave the roster alone (it is shipped and
correct). At 60–120, fleet ships must come off the roster and the client's drone test must move
wholly onto `Contact.cls`.

**One thing I am flagging rather than asking**, because it is a consequence rather than a decision:
`sp` (splash) and `hc` (hit call) are **spectator-public** (`signals.ts:1370-1381`). A fleet
shooter's id matches no observer, so fogged captains correctly never see them — but **every
spectator receives a splash and a hit-call marker for every shot every fleet ship fires**, at any
range, through any fog. That is existing correct-for-humans behaviour meeting a new class of
shooter. At 60 armed hulls the spectate view becomes unreadable. Either suppress at the emission
sites for drone owners, or accept it. I will take the suppression unless told otherwise.

## Cluster E — the ring scale-up

**Q18. Which package?** The four costed options are tabled in Headline 3. In one line each:
**(0)** shorter close, same ocean, 9:36 match · **(1) ★** +36% ocean and an urgent close, 12:00
unchanged · **(2)** +56% ocean, urgency unchanged, rings much less off-centre · **(3)** +56% ocean,
urgent close, 13:35 match.
The thing to decide first is which half of your sentence matters more, because they are separate
levers: *"the map is a little too small"* is the radius, and *"each stage doesn't force enough
movement"* is the closing-rate band — and **the band is what currently holds forced movement
constant no matter how big the ocean gets.** Option 1 moves both.
Whichever lands, the target fraction replaces the ratified 0.75–0.85 band in
`zone.test.ts:235-247`, and that re-ratification is yours to make, not mine — the test is doing its
job by refusing the change.

**Q19. Now, or with Story 6.2?** 6.2 (Roster-Scaled Oceans) owns roster-dynamic sizing and its AC
names this exact coupling; `deferred-work.md:313-314` says the 3.1 map bump was *"sized for the
closing-rate criterion, NOT for teams; 6.2 owns roster-dynamic sizing."* So doing the radius half
now is the wrong half first, and whatever compensation is chosen may be re-derived as a function of
dynamic radius later.
*Recommendation:* **do it now anyway.** It is a static-literal change 6.2 would revisit regardless,
and you want to sail the bigger ocean long before Epic 6 lands. But it should be a knowing choice.

---

## What is already correct and needs no work (recorded so it is not re-audited)

- **XP tier values** — `droneTierLevels` is already ¼/⅓/½ keyed by hull id, already fail-closed on
  an unknown hull, and the CONFIG comment already calls itself *"the PvE fleet-tier hook the later
  fleets epic reuses verbatim."*
- **Win check** — drones stopped gating the win in Story 5.1 (amendment 4). `match.ts:211`
  `isAfloatCaptain = !isDrone && isAfloat`.
- **Results** — drones are excluded from rows and placements (amendment 9, `match.ts:669`/`:684`).
- **`n AFLOAT`** — captains only (epic-4 amendment 29-34).
- **Kill feed disclosure** — a drone wreck reaches only the witness and the killer, never the public
  register (`signals.ts:1287`), with an independently-reimplemented oracle already testing it.
- **Bounty** — drones can neither hold the throne nor advance anyone toward it (`bounty.ts:41,59,78`).
- **XP guard** — `addXpMs` early-returns on `isDrone` (`world.ts:1409`), so an armed fleet ship
  earning kills still banks nothing.
- **Sinking window** — fleet ships inherit the 5 s window, the kill flash and the settle
  (amendments 13/21) with no work; a sinking drone already never holds the match open
  (`match.ts:590`).
- **`STEP_ORDER`** — `dronesTick` is row 0, immediately before `applyInputs` (`world.ts:1719`), which
  is exactly where a fleet-AI step belongs; adding rows is the one-line insertion AR8 promised.

## Size estimate, once the rulings land

| Area | Size |
|---|---|
| Arming + per-size gun stats | **small** — `fireSeq` advance, `stats.gun.*` at two seams |
| Fleet AI (target, aggro propagation, chase, memory, aim) | **large** — genuinely new; no prior art in the repo |
| Pathfinding, un-beaching, full throttle range incl. reverse | **medium** — extends today's three rudder overrides; closes `deferred-work.md:352-354` |
| Mid-match wave spawning | **medium** — new edge; must detach the wake ribbon (`world.ts:3330`) and emit `spawn` |
| Deleting the match-start fill | **medium** — 6 test files + 3 smokes + the batch-sim harness |
| Ring scale-up | **small in code, large in consequence** — 1–2 constants, a re-ratified test band, a PV bump, an eyeball pass on terrain |

## What I did NOT do

No code, CONFIG, wire, test or planning-artifact change. No amendment was written — every ruling
above is Eric's, and amendments get recorded once he has ruled. `epic-5-context.md` and
`epic-5-context-amendments.md` are untouched. Stories 5.4 and 5.5 remain `ready` in the sprint
tracker, deferred by this invocation rather than cancelled.
