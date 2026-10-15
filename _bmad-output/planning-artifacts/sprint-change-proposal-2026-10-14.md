# Sprint Change Proposal — 2026-10-14: four stories inserted after 9.8 — Armor Piercing (and the Armor rescale), Fog Banks, Alerts on the Water and One Row, the Second Tuning Pass

**Workflow:** `gds-correct-course` · **Mode:** Incremental (each item taken in turn, Eric dumping, the author asking) · **Author:** Claude (Developer) · **Decider:** Eric
**Trigger:** Eric, 2026-10-14, after 9.8 The Twelfths Ladder reached staging (0.18.50 → 0.18.54): *"I'd like to insert a/some stor[y/ies] next up in this epic to make a few balance adjustments, dial in some visuals, revisit the idea of ocean currents and fog banks, and add in an 'armor penetration' mechanic. … I think the order we should do them in is the Armor Penetration (and some rescaling to Armor), then the ocean and fog banks, then the visual pass on a few things, and finally we touch up on the balance."*

**Rulings taken in this run (2026-10-14, chat and AskUserQuestion; every one is Eric's):**

1. **Armor rescale.** K 5 → 100; the ARMOR ladder +1 → +20 per card (cap 5); DAMAGE CUT is renamed **HUNKER** and grants +100 temporary Armor (was +5), window unchanged. *"Armor works fine as is. I want to set K to 100 … This will allow for more granularity with respect to balancing."* Every ratio today is preserved exactly (Tier V Armor 100 = ×0.5, Hunker at Tier 0 = ×0.5).
2. **Armor Piercing.** *"The Armor Penetration should work like 'Lethality' in League… the target's effective armor is calculated first (Armor − Penetration) and then the damage is multiplied by K / K+E."* A new ship ladder **ARMOR PIERCING**, right after ARMOR, cap 5, +20 per card, starts at 0. Offensive-posture bots favor it.
3. **The curve below zero.** Raw K / (K + E) divides by zero at E = −100 and is ×5 at −80; Eric: *"Lets go with the League style equation just like you shared. Its just the opposite curve."* E ≥ 0: `K / (K + E)`. E < 0: `2 − K / (K − E)`. Smooth at 0, tops out under ×2 (E −100 = ×1.5).
4. **Scope of piercing.** Every source the attacker owns, same exemption list as Armor (storm only): *"Make it simple, apply it to all damage. We'll roll with that and can change it later if needed."* A HIGH EXPLOSIVE ladder for "the other damage" was offered and rejected as a second ladder doing the same job. PvE drones hold no cards, so AP 0.
5. **Ocean currents stay shelved.** *"Forget currents for now, that's too ambitious."* No story; the 2026-08-11 forge outcome (SHELVED, not killed) stands unchanged.
6. **Fog banks.** A sight-only haze: *"a sort of haze that obscures vision (but not radar), its main function being a sort of light hide/engage/disengage but also to obscure mines to some degree. Sailing into fog would suck for mine and torpedo detection."* Haze eats range (every unit of fog a sight ray crosses costs extra sight; thin edges show a little, deep fog shows nothing — the recommended option). Banks **spawn, grow, fade and re-form elsewhere** ("Spawn and die"). Budget **2–8 % of the live ring's water** at any time. A bank is seen with the eye only, inside your sight bubble, at the distance smoke or fire is seen; it produces **no radar return and changes no return passing through it** (*"the fog does not affect radar at all, so nothing is added to or removed from whatever the radar return would be if the fog wasn't there"*). Look: *"similar to smoke, but it should still be distinct. Lighter greys maybe."* Dials still Eric's at spec: sight lost per unit of fog, bank size range, count, lifetime, spawn-over-island / spawn-over-hull.
7. **One row.** *"We need to move back to a single row of icons, this just takes up too much vertical space. So revert back to the previous sizing and such. Just make sure there are 6 item slots instead of 4."* The 8.6 one-row bar (globes 104, weapon squares and belt squares on one line) returns with six consumable squares where the belt had four; the 9.2 two-row stack (option D′, amendment 22) is superseded. The results LOADOUT twin follows the bar.
8. **Mines as alerts.** Marker glyph box +10 %. Own mines tinted **white**; enemy mines spotted tinted **yellow, flashing orange** — *"These should read like alerts. Like, WARNING, MINE!"* The dropper's-hue rule for mines (Story 1.12 Regatta Hoist) and the own-dim / enemy-bright split are superseded; every mine is bright.
9. **Zones as alerts, all three kinds.** Burn, foul **and lit** zones share one ring rule: own ring white, others' ring flashing warning orange and yellow (Eric chose "Same rule as hazards" for the lit zones). The firer's identity hue leaves the zone family.
10. **The burn zone is white fire on the water.** *"I'd like to give them a white flame effect on the water, similarly to how the ship on fire effect looks. This instead of the red circle that currently exists."* Flames are white for everyone; ownership reads on the ring only (recommended option). The foul zone's weed and net are unchanged; its ring takes the new rule.
11. **The second tuning pass.** *"The game is too killy. In particular, before i tweaked the deck gun range/damage profiles, they scaled from 3 DPS at Tier I to 18ish DPS at Tier V, which is quite honestly absurd! So the balance goals are going to be to make the game a bit less killy, so that we can hit my target numbers of ~50% gone during each ring cycle a bit better."* Numbers at the story: *"At story. I'm going to make a whole thing of it."*

---

## 1. Issue Summary

9.8 put the game on a 10,000 u ocean with a 1,500 u radar scope, tiered gun ranges and an experimental deck-gun damage ladder. Playing it on staging, Eric wants four things that are not in the epic as cut:

- **Armor has no counter and too little resolution.** 9.7's ladder runs 0–5 on K = 5: one card is the whole step from ×1 to ×0.83, and nothing an attacker buys answers it. Eric wants the same curve on a hundred-point scale (K 100, +20 a card) so a future rung can be any size, and a mirror ladder, ARMOR PIERCING, that subtracts from the victim's Armor before the one multiply — League's lethality, with the opposite curve below zero so a pierced, unarmored hull takes more but never unbounded damage.
- **Fog banks were deferred in 2026-08-14 (epic-5 amendment 47) with a re-derivation owed** against a radar model that has since changed twice. Eric now wants them as a sight-only material with no radar term at all, which IS the re-derivation amendment 47 demanded: there is no area return because fog has no return.
- **Three visual reads are wrong on staging.** The two-row HUD stack spends vertical space the one-row bar did not; mines and hazard zones drawn in a captain's personal hue read as "whose" when they must read as "WARNING"; and the burn zone's crimson disc does not read as fire.
- **The game is too killy** for the ~50 %-per-ring attrition target; the deck-gun DPS ladder (about 3 → 18 across the tiers before the 9.8 experiment) is the named offender.

Ocean currents were revisited and set aside again (ruling 5).

## 2. Impact Analysis

### Epic impact

Epic 9 goes from thirteen stories to seventeen. Four stories are inserted after 9.8, in Eric's order: **9.9 Armor Piercing**, **9.10 Fog Banks**, **9.11 Alerts on the Water and One Row**, **9.12 The Second Tuning Pass**. The former 9.9–9.13 become **9.13–9.17**. Epic 10 is untouched.

One ordering consideration recorded, not decided: 9.12's attrition readouts will be taken with bots on the 9.8 stopgap posture bands, because 9.13 (the bot posture workover) lands after it. Eric may swap 9.12 and 9.13 at either story's spec step; nothing in this proposal depends on the order of those two.

### Story impact

- **9.9 Armor Piercing** *(new)*. Full text §4.1. The rescale, the rename, the ladder, the two-branch curve, the chokepoint change, the card, the bots.
- **9.10 Fog Banks** *(new)*. Full text §4.2. Revives deferred Story 5.4 under new rules; 5.4's number stays reserved and its `deferred` status becomes `superseded by 9.10`.
- **9.11 Alerts on the Water and One Row** *(new)*. Full text §4.3. Four visual changes, every one judged on a rendered page or staging before commit (the show-visual-proposals-first rule).
- **9.12 The Second Tuning Pass** *(new)*. Full text §4.4. Eric's harness session sets the dials; dev-story builds them.
- **9.7 Armor (in review, PR #278).** Its numbers are superseded by 9.9 the day 9.9 lands; 9.7's text is stamped, not rewritten. 9.9 lands after 9.7 and 9.8 are merged.
- **9.8 The Twelfths Ladder (in review, PR #279 + fixes #280–#283).** Untouched. Its deck-gun damage experiment (amendment 131) is one input to 9.12.
- **9.3 Multi-Spectral Countermeasure (in review).** Untouched. Its cloud keeps its radar fakes; fog is a different material with none.
- **9.4 Fouling Shell / 9.5 Ramming (review / done).** The foul zone's ring and the burn zone's body change under 9.11; the zones' mechanics do not. Contact damage carries AP like every other source (ruling 4).
- **9.13 Bot Posture Workover** *(was 9.9)*. Gains ARMOR PIERCING in the offensive bots' pick weighting (9.9 does the weighting; 9.13 re-reads it with the posture model) and fog as an input to the posture model (a bank is a place to break contact). Text: one added clause.
- **9.14–9.16** *(were 9.10–9.12)*. Renumbered; "was 9.N" notes extended.
- **9.17 How-to-Play and Record** *(was 9.13)*. Its AC ranges widen (9.1–9.15 landed; mechanics sections 9.1–9.12); it gains the ARMOR PIERCING and FOG BANK entries, the HUNKER rename in the Battleship entry, the alert-palette note, and the GDD / EXPERIENCE stamps for all four.

### Artifact conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `planning-artifacts/epics.md` Epic 9 | thirteen stories; tail 9.9–9.13 | four stories inserted (§4.1–4.4); tail renumbered with "was 9.N until 2026-10-14" notes; 9.13 and 9.17 ACs amended (§4.5) |
| `implementation-artifacts/epic-9-context.md` | story list, Technical Decisions, UX patterns (the D′ bar), dependencies | regenerable; edited in place (§4.6); amendments 143–155 appended |
| `implementation-artifacts/epic-9-context-amendments.md` | none yet | amendments 143–155 appended (§4.7) |
| `implementation-artifacts/sprint-status.yaml` | tail keys 9-9…9-13; `5-4-fog-banks: deferred` | four new keys at `backlog`; tail renumbered; 5-4 stamped "superseded by 9-10" (§4.8) |
| `gds-workflow-status.yaml` | correct-course row | one-line stamp; `last_updated` 2026-10-14 (§4.8) |
| GDD `gdd.md` E9 row (464) | no mention of piercing, fog, the alert palette, the second pass | dated "superseded in part 2026-10-14" clause naming this file and 143–155; the mechanics sentences are stamped at 9.17 |
| GDD Arena / E4-E5 fog-bank sentences; `epics.md` FR28 / Story 5.4; `EXPERIENCE.md` fog reads | "truesight shrinks … radar may still paint you" | stamped at 9.17 (the amendment-89(k) pattern); the new rule is §4.2 |
| `DESIGN.md` HUD bar (D′, globes 124, two-row stack, six-row cards) | the one-row bar returns | 9.11's spec shows the rendered bar first; DESIGN.md gains a dated stamp pointing at the 8.6 geometry + six squares; no rewrite |
| `catalog-v3.md` | no ARMOR PIERCING line; DAMAGE CUT name | dated addendum at 9.17 (the existing R8 ARMOR rows are already stale from 9.6/9.7 and stamped there) |
| `game-architecture.md` | fog bank listed under E4 `map.ts` / "perception modifier" | 9.10's spec places it (a sight-range modifier inside `perception.observe()` + a server-side bank list; islands' "never on the wire" rule does NOT transfer, since banks move) — dated notice at 9.17 |
| `deferred-work.md` | 5.4 revival pointers; "radar re-derivation owed before 5.4 may be specified" | stamped RESOLVED by this proposal's ruling 6 at 9.10's spec |
| epic-5 amendment 47 | 5.4 deferred, re-derivation owed | superseded in part by amendment 146 (fog has no radar term); 5.5 whirlpools stay deferred and currents stay shelved |

### Technical impact

- **9.9 (shared + server, PV bump — the client reads the catalog and `CONFIG.armor`):** `CONFIG.armor.k` 5 → 100; `catalog.ts` `armor` ladder step +1 → +20; new `armorPiercing` ladder (cap 5, +20) seated after `armor` in `LINE_IDS`, `SHIP_STAT_LINES`, the LOADOUT ladder line (the results block's 4 + 3 becomes 4 + 4 or 5 + 3 — Eric picks on the rendered page) and the How-to-Play table; `effectiveStats()` gains `armorPiercing`; `damageMultiplierFor(armor)` becomes `damageMultiplierFor(effectiveArmor)` with the two-branch curve, STILL the one formula in `sim/stats.ts`; `World.armorDamage(victim, amount, src)` gains the attacker (every `DamageSource` but storm already knows its owner — shells, torpedoes, mines, ram, grind, burn — and the burn / grind ticks read the firer's stats at tick time, like damage credit does); `damageCut` → `hunker` id rename on both sides (the Battleship's `shift`, `CONFIG.equipment.hunker`, `armorBonus` 5 → 100, `hunkerUntil`), card copy Eric's; bots: `armorPiercing` joins the offensive favoring the way `armor` joined the defensive (amendment 117's rule). Tests: the exact-ratio pins of amendment 120(a) re-based to K 100 by derivation, never a literal; a curve test on synthetic (armor, piercing) pairs including the E = −K point; the perception invariants unchanged (nothing new leaves the server).
- **9.10 (shared + server + client, PV bump):** a `FogBank` record (centre, radius, born, until, growth curve) in server world state, stepped in a new `STEP_ORDER` slot (spawn / grow / fade against the live-ring budget, deterministic from the room's seed + match clock so a replay is byte-identical); `perception.observe()`'s sight test becomes a sight-RANGE test with fog cost integrated along the ray (`sight.ts` gains a pure `fogCost(ray, banks)` with no transcendentals — a polyline march like `radarShadow`'s, bounded by bank count); every sight-delivered thing follows by construction (hulls, mines, torpedoes, the countermeasure cloud's sight half, burn / foul / lit zone *visibility* — NOT their effects); radar untouched (`dropout`, `radarShadow`, `signals` unchanged); the foghorn untouched; bots see through the same `observe` thunk and so are fogged for free; the client receives the banks that overlap its sight bubble as a per-client frame row (a seventh declared exception is NOT needed: a bank is delivered only inside sight, which is the first exception's territory — the invariant tests gain a fog case); `render/fog.ts` is the fog-of-WAR composite and keeps its name — the bank renderer is a new `render/fogBanks.ts` (lighter greys, distinct from smoke); prediction untouched (fog changes what you see, not where you go).
- **9.11 (client only, no PV bump unless a frame field changes):** `CLIENT_CONFIG.hudBar` back to the 8.6 geometry (globes 104, one row, `hudBarLayout` re-pinned against the 8.6 mock with six stock squares; `hotbar.ts`'s two-row stack collapses to one row); `render/mines.ts` marker box ×1.1, own = white, enemy = yellow with an orange flash on an INTEGRATED phase (the ember idiom; motion-gated; under the photosensitivity ceiling); `litZones.ts`'s `drawZoneGlow` takes an owner-relative tint (white / warning flash) instead of `hueFor(by)`, and `burnZones.ts`, `foulZones.ts`, `litZones.ts` all read it; `burnZones.ts` replaces the ember disc with pooled white tongues built on `fire.ts`'s pure core (alpha / radius / flicker as functions of age; spawn positions seeded from the zone id so every observer sees the same fire); the results LOADOUT twin follows the bar.
- **9.12 (CONFIG only, PV bump if the client reads a changed block):** whatever Eric's harness session sets; the sim measures attrition per ring and class share only (≤ 99 matches, on request); no gun number comes from the sim.

## 3. Recommended Approach

**Direct adjustment.** Four stories inserted into a settled order in the order Eric gave; no rollback, no MVP change. Effort: four build cycles after 9.8 (9.9 one cycle, mechanical; 9.10 one to two, the only new system; 9.11 one, judged on rendered pages; 9.12 Eric's harness session plus one cycle). Risk sits in 9.10 (a new per-tick ray cost inside `observe()`, bounded by bank count and costed at spec) and in 9.11's flash cadence (photosensitivity ceiling, already the ember's rule). The tail (bot posture, audit, smokes, hygiene, How-to-Play) slides four numbers and loses nothing.

## 4. Detailed Change Proposals

### 4.1 Story 9.9 — Armor Piercing *(new; inserted after 9.8)*

```
Story: 9.9 (new)
Section: whole story (inserted); 9.9–9.13 renumber to 9.13–9.17

NEW:
```

### Story 9.9: Armor Piercing *(inserted 2026-10-14 — `sprint-change-proposal-2026-10-14.md` §4.1; lands after 9.7 Armor and 9.8 have merged)*

As a captain who buys guns,
I want a ladder that gets through an armored hull,
So that Armor is a choice with an answer, and the two ladders meet on one curve a player can reason about.

**Eric (2026-10-14, verbatim):** *"Armor works fine as is. I want to set K to 100. I want each tiered upgrade to provide +20, and I want Damage Cut (we will rename this to Hunker) to provide +100 temporary armor. This will allow for more granularity with respect to balancing. | The Armor Penetration should work like 'Lethality' in League… the target's effective armor is calculated first (Armor − Penetration) and then the damage is multiplied by K / K+E. Armor Penetration starts at 0 and the accompanying Tiered Upgrade provides +20 each. A negative effective armor would, of course, increase the damage taken."* and, on the curve below zero: *"Lets go with the League style equation just like you shared. Its just the opposite curve."* and, on scope: *"Make it simple, apply it to all damage."*

**Acceptance Criteria:**

**Given** 9.7's ARMOR ladder (K = 5, +1 per card, DAMAGE CUT +5 for 10 s) has merged
**When** the story lands
**Then** `CONFIG.armor.k` is 100, the ARMOR ladder is +20 per card (cap 5, Tier V = 100), and DAMAGE CUT is renamed HUNKER (id, card, Shift chip, HUD, How-to-Play pointer; copy Eric's) granting +100 temporary Armor for its unchanged window — every multiplier a hull sees today is reproduced exactly (×0.5 at Tier V; ×0.5 at Tier 0 under Hunker; ×1/3 at Tier V under Hunker)
**And** a new ship ladder ARMOR PIERCING sits right after ARMOR (seat order HULL · ARMOR · ARMOR PIERCING · SPEED · TURNING · RADAR SWEEP · RELOAD · PASSIVE HEALING), cap 5, +20 per card, Tier 0 = 0; its glyph is shown to Eric on a rendered page beside the ARMOR belt before commit; the LOADOUT ladder line's row split is his pick on the same page
**And** the one formula in `sim/stats.ts` takes EFFECTIVE armor `E = victim Armor (ladder + Hunker while open) − attacker Armor Piercing`: `E ≥ 0 → K / (K + E)`, `E < 0 → 2 − K / (K − E)` — exact fractions, smooth through 0, bounded under ×2 (E = −100 → ×1.5); both sides call it, nothing re-derives it
**And** every damage source the attacker owns carries their Armor Piercing — deck guns, broadside, torpedoes, mines, ram and grind, phosphor burn — through the existing server chokepoint (`armorDamage`), which now reads the attacker's stats; the storm stays exempt; PvE drones hold no cards (AP 0); amendment 119's floor-of-one and the exact burn / grind ticks are unchanged
**And** offensive-posture bots favor ARMOR PIERCING the way defensive ones favor ARMOR (amendment 117's rule, mirrored)
**And** the exact-ratio pins (amendment 120(a)) are re-based to K 100 by derivation, a curve test covers synthetic (armor, piercing) pairs including E = −K, the perception invariants keep SIX exceptions, `PROTOCOL_VERSION` bumps (catalog content + `CONFIG.armor` read by the client), `npm run check` is green, both trackers stamped
**And** no in-game copy is added unasked; the HUNKER and ARMOR PIERCING How-to-Play entries are 9.17's, copy Eric's.

### 4.2 Story 9.10 — Fog Banks *(new; inserted after 9.9; revives deferred Story 5.4 under new rules)*

### Story 9.10: Fog Banks *(inserted 2026-10-14 — `sprint-change-proposal-2026-10-14.md` §4.2; lands after 9.9; supersedes deferred Story 5.4 and the re-derivation epic-5 amendment 47 owed)*

As a captain on a big, dark ocean,
I want rolling banks of fog that my eyes cannot see through,
So that I can break contact or lie in wait, and sailing into one costs me my watch for mines and torpedoes.

**Eric (2026-10-14, verbatim):** *"With fog, I'm basically thinking it is sort of a haze that obscures vision (but not radar), its main function being a sort of light hide/engage/disengage but also to obscure mines to some degree. Sailing into fog would suck for mine and torpedo detection. My guess is that they would be sort of rolling fog banks that shrink and grow throughout the course of the match. It'd range somewhere between 2-8% of the map being fogged up."* · *"Visually it is similar to smoke, but it should still be distinct. Lighter greys maybe."* · *"The fog does not affect radar at all, so nothing is added to or removed from whatever the radar return would be if the fog wasn't there."*

**Acceptance Criteria:**

**Given** sight is a 500 u bubble (4/12) and radar a 1,500 u scope with the 9.8 dropout
**When** the story lands
**Then** fog banks exist as server world state (centre, radius, life), stepped in their own `STEP_ORDER` slot, deterministic from the room seed and the match clock; a bank SPAWNS, GROWS, FADES and a new one forms elsewhere, and the banks inside the live ring cover between 2 % and 8 % of the ring's water at any time (banks outside the ring die); count, size range, lifetime, growth shape and spawn-over-island / spawn-over-hull are Eric's dials at spec
**And** fog is a SIGHT-ONLY haze for every observer, the sailor inside it included: a sight ray pays extra range for every unit of fog it crosses (one dial: sight units lost per unit of fog), so a thin edge shows a little and a deep bank shows nothing; the test is inside `perception.observe()` and so every sight-delivered thing follows by construction — hulls, mines, torpedoes, the countermeasure's sight half, and the VISIBILITY of burn / foul / lit zones (never their effects)
**And** radar is untouched in every path: a hull inside a bank paints exactly as on open water, a bank adds no return and shadows nothing (`dropout`, `radarShadow`, `signals` unchanged); the foghorn and the storm ignore fog; bots are fogged through the same bound `observe` thunk and gain no special knowledge
**And** a bank is seen with the eye only: the client receives the banks that overlap its sight bubble, at the distance it would see smoke or fire, and draws them as a haze distinct from the countermeasure cloud (lighter greys; Eric judges a rendered page before commit); nothing about a bank beyond sight leaves the server; the invariant tests gain a fog case and keep SIX exceptions
**And** the ray march is pure, transcendental-free and bounded by bank count, costed at spec against the tick budget on the 16-captain ocean; `PROTOCOL_VERSION` bumps; `npm run check` green; both trackers stamped; the deferred-work 5.4 pointers and epic-5 amendment 47's owed re-derivation are stamped RESOLVED by this story
**And** no in-game copy is added; the How-to-Play FOG entry is 9.17's, copy Eric's.

### 4.3 Story 9.11 — Alerts on the Water and One Row *(new; inserted after 9.10)*

### Story 9.11: Alerts on the Water and One Row *(inserted 2026-10-14 — `sprint-change-proposal-2026-10-14.md` §4.3; lands after 9.10)*

As a captain reading the water,
I want mines and hazard zones to shout WARNING instead of whispering whose they are, fire to look like fire, and the HUD bar back on one row,
So that a threat is read in the time it takes to glance at it and the bar stops eating the bottom of the screen.

**Eric (2026-10-14, verbatim):** *"We need to move back to a single row of icons, this just takes up too much vertical space. So revert back to the previous sizing and such. Just make sure there are 6 item slots instead of 4."* · *"Showing mines and hazardous zones in the player's color isn't very helpful. Firstly I want to make all mines placed about 10% larger than they are at present (just the graphic icon marking where they are). I would like mines to show up bright and noticeable. My mines that I have placed should be tinted White. Enemy mines that I have spotted should be tinted Yellow and flash Orange. These should read like alerts. Like, WARNING, MINE!"* · *"Same logic with hazardous zones. Mine should be tinted white, and others should be tinted with a sort of flashing warning orange/yellow."* · *"On the topic of phosphor burn zones, specifically, I'd like to give them a white flame effect on the water, similarly to how the ship on fire effect looks. This instead of the red circle that currently exists."*

**Acceptance Criteria:**

**Given** the 9.2 two-row HUD stack (globes 124), mines and zones in the owner's personal hue, and the burn zone's crimson ember disc
**When** the story lands, every change judged by Eric on a rendered page or staging before commit
**Then** the HUD bar is the 8.6 ONE-ROW geometry (globes 104, the weapon squares and the consumable squares on one line at the 8.6 sizes) with SIX consumable squares where the belt had four; `hudBarLayout` stays pure and is re-pinned; the results LOADOUT twin follows; option D′ (amendment 22) is superseded and DESIGN.md gains a dated stamp
**And** every mine marker's glyph box is 10 % larger; OWN mines are tinted white; ENEMY mines sighted are tinted yellow and flash orange on an integrated, motion-gated phase under the photosensitivity ceiling (presence, position and kind are information and never gated); the dropper's-hue rule (Story 1.12) and the own-dim / enemy-bright split are retired for mines
**And** burn, foul AND lit zones share one ring rule — own ring white, any other's ring flashing warning orange and yellow (same cadence rule as the mines); the firer's identity hue leaves the zone family; the foul zone's weed and net are unchanged
**And** the burn zone's body is WHITE FIRE ON THE WATER built from the hull-on-fire effect's pure core (tongues seeded from the zone id so every observer sees the same fire; extent is information, flicker is motion), white for everyone — ownership reads on the ring alone; the crimson ember disc and its config are deleted
**And** no wire change unless a frame field moves (then `PROTOCOL_VERSION` bumps); `npm run check` green; both trackers stamped; no in-game copy added.

### 4.4 Story 9.12 — The Second Tuning Pass *(new; inserted after 9.11)*

### Story 9.12: The Second Tuning Pass (Eric steers) *(inserted 2026-10-14 — `sprint-change-proposal-2026-10-14.md` §4.4; lands after 9.11)*

As the designer,
I want a second pass on the dials with Armor, Armor Piercing, fog and the twelfths ladder all in,
So that about half the field is gone each ring cycle instead of the fights ending before they start.

**Eric (2026-10-14, verbatim):** *"The game is too killy. In particular, before i tweaked the deck gun range/damage profiles, they scaled from 3 DPS at Tier I to 18ish DPS at Tier V, which is quite honestly absurd! So the balance goals are going to be to make the game a bit less killy, so that we can hit my target numbers of ~50% gone during each ring cycle a bit better."* · *"At story. I'm going to make a whole thing of it."*

**Acceptance Criteria:**

**Given** 9.9–9.11 landed and the 9.8 deck-gun experiment (cannon 12–18, flak 20–52 with rim falloff, MG unchanged) on staging
**When** the story opens
**Then** it opens with Eric's harness session (the 9.1 pattern): he sets every dial — deck-gun damage and reload ladders by HIS math, and whatever else he names — and no gun number is proposed from bot-sim evidence; the sim is used only to measure attrition per ring cycle against the ~50 % target and class share, in quick runs of ≤ 99 matches, never launched unprompted
**And** dev-story then builds exactly his numbers (integers where he gives integers), with the evidence ledger for the cycle beside the earlier `batch-sim-evidence-*.md` files; `PROTOCOL_VERSION` bumps where the client reads a changed block; `npm run check` green; both trackers stamped
**And** no in-game copy is added; stat tables on cards and in How-to-Play are derived and follow.

### 4.5 Renumbered tail and amended ACs

```
Story: 9.9 → 9.13 Bot Posture Workover
Section: Acceptance Criteria

OLD:
**And** every bot and PvE drone profile is re-cut on that model …

NEW:
**And** every bot and PvE drone profile is re-cut on that model … ; the model reads ARMOR PIERCING (9.9) in the offensive favoring and a fog bank (9.10) as a place to break contact or lie in wait

Rationale: both new systems are inputs a posture model must know about.
```

```
Story: 9.13 → 9.17 How-to-Play and Record
Section: Acceptance Criteria

OLD:
**Given** Stories 9.1–9.11 landed
… an entry for each new item (MULTI-SPECTRAL COUNTERMEASURE, FOULING SHELL, PASSIVE HEALING, ramming and grounding, the fixed key row, DEPTH CHARGE if built) …
… the mechanics sections 9.1–9.8 changed carry dated supersession stamps …

NEW:
**Given** Stories 9.1–9.15 landed
… an entry for each new item (MULTI-SPECTRAL COUNTERMEASURE, FOULING SHELL, PASSIVE HEALING, ARMOR, ARMOR PIERCING, FOG BANKS, ramming and grounding, the fixed key row; HUNKER replaces DAMAGE CUT in the Battleship entry; a note that mines and zones read white for yours and warning orange-yellow for theirs) …
… the mechanics sections 9.1–9.12 changed carry dated supersession stamps (incl. the fog-bank sentences in the GDD Arena section, FR28 and EXPERIENCE.md's fog reads; K = 5 / +1 / +5 → K = 100 / +20 / +100; DESIGN.md's D′ bar) …

Rationale: four more stories to record; the fog and armor sentences in the GDD are now stale.
```

9.10 → 9.14, 9.11 → 9.15, 9.12 → 9.16: headings renumbered, "was 9.N until 2026-10-14" appended, text otherwise unchanged.

### 4.6 `epic-9-context.md` (regenerable; edited to match)

- Stories list: 9.9–9.12 inserted; the tail renumbered 9.13–9.17.
- Technical Decisions: new **Armor Piercing (9.9)**, **Fog Banks (9.10)**, **Alerts and One Row (9.11)**, **Second Tuning Pass (9.12)** paragraphs.
- UX & Interaction Patterns: the D′ paragraph gains a dated "superseded by 9.11" note.
- Cross-Story Dependencies: `9.9 after 9.7 + 9.8 merged; 9.10 after 9.9; 9.11 after 9.10; 9.12 after 9.11 (Eric may swap 9.12/9.13); 9.13 reads 9.9 and 9.10; 9.17 needs 9.1–9.16`.
- Amendments 143–155 appended under `## Four stories inserted — correct-course 2026-10-14`.

### 4.7 `epic-9-context-amendments.md` — new section, amendments 143–155

143. FOUR STORIES ARE INSERTED AFTER 9.8 IN ERIC'S ORDER — 9.9 ARMOR PIERCING, 9.10 FOG BANKS, 9.11 ALERTS ON THE WATER AND ONE ROW, 9.12 THE SECOND TUNING PASS; THE TAIL RENUMBERS 9.13–9.17.
144. THE ARMOR SCALE IS K = 100, +20 PER CARD, HUNKER +100 — every ratio of 9.7 preserved exactly; DAMAGE CUT is renamed HUNKER (supersedes amendments 86–88's numbers and 89(c)'s name; the mechanism stands).
145. ARMOR PIERCING IS A SHIP LADDER AFTER ARMOR, CAP 5, +20 PER CARD, FROM 0; offensive bots favor it (mirrors amendment 117).
146. THE ONE CURVE HAS TWO BRANCHES — E ≥ 0: K / (K + E); E < 0: 2 − K / (K − E); E = Armor (+ Hunker) − Piercing; exact fractions; bounded under ×2. Rejected: raw K / (K + E) below zero (divides by zero at E = −K), a flat 1 % per point, a floor at E = 0.
147. PIERCING APPLIES TO EVERY SOURCE THE ATTACKER OWNS — storm exempt; drones AP 0. Rejected: guns only; guns + torpedoes; a HIGH EXPLOSIVE ladder for the rest ("overcomplication").
148. OCEAN CURRENTS STAY SHELVED — "too ambitious"; the 2026-08-11 forge outcome stands; 5.5 whirlpools stay deferred.
149. FOG BANKS ARE A SIGHT-ONLY HAZE WITH NO RADAR TERM — haze eats sight range per unit crossed; everybody fogged, inside included; radar, foghorn, storm untouched; this IS epic-5 amendment 47's owed re-derivation (an area material with no return cannot own the scope).
150. BANKS SPAWN, GROW, FADE AND RE-FORM; 2–8 % OF THE LIVE RING; SEEN WITH THE EYE ONLY INSIDE SIGHT; lighter greys, distinct from smoke. Rejected: a hard edge like smoke; inside-only blinding; public banks; breathe-in-place; drift; a share of the whole ocean.
151. THE HUD BAR RETURNS TO THE 8.6 ONE-ROW GEOMETRY WITH SIX CONSUMABLE SQUARES — supersedes amendment 22 (option D′) and the two-row readings of 33/34; the results twin follows.
152. MINES ARE ALERTS — glyph box +10 %; own white; enemy yellow flashing orange; supersedes Story 1.12's dropper-hue rule for mines and the own-dim split.
153. ALL THREE ZONE KINDS SHARE THE RING RULE — own ring white, others' flashing warning orange-yellow; burn, foul AND lit; the firer's hue leaves the zone family (supersedes epic-8 amendment 135(i)'s identity glow and the lit zone's hue).
154. THE BURN ZONE IS WHITE FIRE ON THE WATER — built from the hull-on-fire effect, white for everyone, ownership on the ring; the crimson ember disc is deleted.
155. THE SECOND TUNING PASS IS ERIC'S HARNESS SESSION — "too killy", ~50 % gone per ring cycle, deck-gun DPS ladder (≈3 → 18) the named offender, numbers at the story, guns by his math.

(Full text in the amendments file.)

### 4.8 Trackers and GDD

- `sprint-status.yaml`: `9-9-armor-piercing: backlog`, `9-10-fog-banks: backlog`, `9-11-alerts-on-the-water-and-one-row: backlog`, `9-12-the-second-tuning-pass: backlog` (each with a one-line stamp naming this proposal and the amendment range); tail keys renumbered 9-13…9-17 with "was 9-N until 2026-10-14"; the epic-9 comment line extended; `5-4-fog-banks: deferred` gains "superseded by 9-10 (2026-10-14)".
- `gds-workflow-status.yaml`: one-line stamp on the `correct-course` row; `last_updated` 2026-10-14.
- GDD E9 row: a dated "superseded in part 2026-10-14" clause naming this file and amendments 143–155; mechanics sentences at 9.17.

## 5. Implementation Handoff

**Scope: Moderate** — four stories inserted and the tail renumbered; one new system (fog) and three mechanical stories. Routed to `gds-create-story` for **9.9 Armor Piercing** once 9.7 (PR #278) and 9.8 (PR #279 and its fixes) have merged; Eric judges 9.8 on staging first. 9.12 opens with Eric's harness session, not with dev-story.

**Success criteria:** each story lands in one build cycle (9.10 may take two) with its PV bump, both trackers stamped, every visual judged by Eric before commit, every number Eric's, and the attrition readout after 9.12 near the ~50 %-per-ring target.

**Memory of the session (for the next agent):** K is 100 and every Armor number is on the hundred scale; the curve has two branches and is still ONE function in `sim/stats.ts`; piercing applies to everything but storm; fog has NO radar term, ever, and is seen only inside sight; the countermeasure's radar fakes are a different feature; currents are shelved, do not re-propose; the bar is one row again; mines and all three zone kinds are white-for-mine / warning-for-theirs; burn zones are white fire; the second tuning pass waits for Eric's harness session and never proposes a gun number from the sim.
