---
title: 'Story 10.6: The Catalog Under the Index'
type: 'feature'
created: '2026-11-05'
status: 'in-progress'
baseline_revision: '8c7004aa'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The card catalog is still catalog v3 with patches: six ship ladders at a flat +20, weapon tiers that hand out extra tubes, mines and shots, a per-tier "5 % shorter reload" rule, torpedoes fired from fixed hull sectors, and no cards for RANGE, HULL REPAIR or SMOKE SCREEN. Eric re-authored the whole catalog in chat on 2026-11-05 (`/bmad-dev-auto 10-6`).

**Approach:** Rewrite the catalog to Eric's sheet below — eight SHIP ladders, ten WEAPON lines whose tiers carry a per-weapon RELOAD bonus instead of the 5 % rule, and four one-off WEAPON cards that own all extra capacity — and build the two mechanisms the sheet needs: deck torpedo LAUNCHERS that aim like turrets, and stern mine RACKS with one reload clock each.

## Eric's rulings for this story (2026-11-05, chat, read back and confirmed line by line — literal spec, to be recorded as epic-10 amendment 12)

**R1 SHIP upgrades — eight ladders, five cards each, identical on every hull.**

| Line | Per card | Acts on |
|---|---|---|
| ARMOR | +20 | damage taken from ALL five weapons (main gun, secondary gun, torpedo, mine, special shell) |
| POWER | +20 | damage dealt by ALL five weapons |
| INTEL | +20 | as today |
| RELOAD | +10 (was +20) | main gun, torpedo, mine, special shell — NEVER the secondary gun, the Shifts, HULL REPAIR or SMOKE SCREEN |
| ENGINES | +10 (was +20) | as today |
| RANGE | +10 (new line) | main gun and secondary gun only (+100 u / +50 u a card at today's scale) |
| HULL REPAIR | see R8 | the `C` ability |
| SMOKE SCREEN | see R9 | the `V` ability |

**R2 RUDDER is removed.** *"lets remove rudder, and just give everyone the same turn rate"*; *"Rudder can be whatever the 'Baseline' is."* No RUDDER card; every captain hull turns at the baseline rate (RUDDER 100).

**R3 No gun cards.** *"no deck gun or secondary gun upgrade lines."* The main gun and the secondaries change only through POWER / RELOAD / RANGE.

**R4 Capacity leaves the tiers.** *"Additional torpedo tubes and mine rack slots and special shell extra shots and such will no longer appear in tiered upgrades at all."* Every other tier effect stays as today (*"for the most part, everything is the same"*). Special shells are ONE shot for good — no capacity card.

**R5 The per-weapon RELOAD bonus replaces the 5 %-per-tier rule** on all ten weapon lines. *"The cooldown should be set at its base number, but then adjusted at each tier through adding a bonus to the total RELOAD score applied only to that ability."* Bonus: **+0 at Tier I, +10 a tier, +40 at Tier V**. Cooldown = base × 100 ÷ (ship RELOAD + that weapon's bonus). The bonus reaches that weapon only.

**R6 Torpedo LAUNCHERS** (all three torpedoes — light, heavy, supercavitating).
- The Tier I card gives a **FORE launcher with ONE tube**: centered dead ahead, **140° to either side**, traverse **equal to the turrets'** (90°/s), *"they work the same way in terms of aiming and such"* — it fires only inside its arc and holds its angle when the cursor leaves it (confirmed). A FORE-only hull cannot fire into the 80° wedge astern.
- **AFT TORPEDO LAUNCHER** — one card: the same launcher centered dead astern.
- **SECOND LAUNCHER TUBE** — one card: +1 tube on EVERY launcher held. Maximum four tubes.
- **Each tube has its own cooldown. One click, one torpedo.**
- The old per-weapon launch sectors (light: both beams; heavy: 60° ahead; supercav: 30° ahead) are gone.

**R7 Mine RACKS** (naval, fouling, captive).
- The Tier I card gives **ONE rack** holding **3 naval, 3 fouling or 1 captive**.
- **SECOND MINE RACK** — one card: a whole second rack with its own mines and its own reload.
- **EXPANDED MINE RACKS** — one card: +1 capacity on EACH rack. Maximum 8 naval / fouling, 4 captive.
- **Each rack has ONE cooldown** that restocks one mine per cycle and starts *"as soon as one is missing a mine"*; both racks' clocks may run at once.
- **With two racks the game alternates** which one drops. **Both racks are at the stern.** Otherwise mines work as today.

**R8 HULL REPAIR ladder (SHIP kind, five cards).** Heal **100 + 100 with no cards → 200 + 200 at five** (+20 at once and +20 over time per card). Cooldown base **75 s** (was 90), each card **+5** to a fixed score of 100: 75 × 100 ÷ (100 + 5 × cards) → 71.4 / 68.2 / 65.2 / 62.5 / **60 s**. The ship's RELOAD is never applied.

**R9 SMOKE SCREEN ladder (SHIP kind, five cards).** Cooldown base **60 s**, each card **+5** on the same rule → 57.1 / 54.5 / 52.2 / 50.0 / **48 s** (Eric: *"Make it +5 Reload for both Hull Repair and Smoke, and we're good"* — supersedes his earlier 45 s target). Duration **15 s with no cards, +1 s a card** → 20 s. Size: **each card about 10 % larger, and TODAY's size (150 → 300 u) is the TWO-card size** — so no cards is 150 ÷ 1.21 → 300 ÷ 1.21 (about 124 → 248 u) and five cards about 200 → 399 u. The ship's RELOAD is never applied.

**R10 One-off cards:** dealt only once their family slot is filled; they apply to whichever torpedo or mine is held; either order (confirmed).

**R11 Kinds for Story 10.7's law:** HULL REPAIR and SMOKE SCREEN are **SHIP** upgrades; the launcher, tube and rack cards are **WEAPON** upgrades with the torpedo, mine and special-shell lines.

**R12 The POWER / ARMOR "test both" dial of the story text is DROPPED** — R1 rules both apply to every weapon.

**Noted, not part of this story:** Eric — *"at some point we'll need to take a good look at the scale of the game, maybe its too small now. But hey, for now, its fine."*

## Rulings on the draft (Eric 2026-11-05, chat, on the pushed draft)

- **R13 The launchers chase the cursor at all times, as the turrets do** (*"Sure, why not."*) — no "only while `Q` is readied" state.
- **R14 INSTANT RELOAD loads every tube and gives ONE mine per rack** (*"One mine per rack."*).
- **R15 HULL REPAIR's over-time half keeps its 5 s window at every card count** (*"Correct."*) — 200 over 5 s at five cards.
- **R16 A tube fires only if its launcher CAN point at the aimed area** (veto of reading I1 as worded, verbatim: *"Just like the turrets, if the tube CANNOT POSSIBLY point at the aimed area, it doesn't fire no matter what. I don't want to accidentally waste shots that had no hope of hitting."*). A launcher whose arc does not hold the aim point never fires; with no such launcher the click is refused `out-of-arc` and nothing is spent. Among launchers whose arc DOES hold the aim point the turret rule stands (10.4's early-click rule: on-target first, else the nearest fires along its current bearing). The torpedo leaves from the launcher's station on the deck.
- **R17 Racks alternate per drop** (veto of reading I4, verbatim: *"They alternate per drop."*). Strict A, B, A, B.
- **R18 The empty-turn rack** (verbatim: *"Next rack in line with an available mine would drop to avoid that edge case."*): when the rack whose turn it is holds no mine, the next rack holding one drops, and the turn passes on from the rack that dropped.
- **Build ordered** (Eric 2026-11-05: *"go ahead and build (don't forget /orchestrate for subagent models)"*).

## Rulings on the rendered candidate (Eric 2026-11-05, chat, on https://claude.ai/artifact/YbxGN4rxhF4wehG6yYeWej — *"I love it. Perfect so far."*)

- **R19 Launcher shape approved; it draws UNDER the gun barrels** (*"It needs to render under the gun barrels, not over."*).
- **R20 Hotbar pips approved, and the MAIN GUN gets the same treatment** (*"can you give the main gun the same treatment? This is excellent until I take a pass at the UI/UX."*). Reading: one pip per turret, one column, replacing the count badge.
- **R21 Row labels:** HULL REPAIR's over-time row reads **"OVER 5S"**; SMOKE SCREEN's "LASTS" reads **"DURATION"**.
- **R22 The kind words leave every card** (*"we can just get rid of the 'kind' words on all the cards, its not as necessary now that there are no consumables. They are all basically upgrades."*). Kind edge colors untouched (not asked).
- **R23 Glyphs and the 4-over-4 results strip stand** until his design pass; **the results screen also shows the ship's numbers** (*"For the results screen also I want to see my ship numbers."*). Reading (shown to him on the rebuilt page): each index ladder shows the ship's final index value; HULL REPAIR and SMOKE SCREEN their final cooldown.
- **R24 Card names:** `secondLauncherTube` prints **SECOND TUBE**, `aftTorpedoLauncher` prints **AFT LAUNCHER** (*"'SECOND TUBE' and 'AFT LAUNCHER' I guess."*) — supersedes the names in R6 on the card face.

- **R25 Card colors are by TIER, not kind** (verbatim: *"Tier I should be Green, Tier II should be Blue, Tier III should be Purple, Tier IV should be Red, and Tier V should be Gold. The Launcher/Mine Rack upgrades should be Gold. Otherwise it doesn't matter what kind of card it is."*). Reading: the tier is the one the card GRANTS; the five colors are the rung strip's existing palette. Supersedes R22's "kind edge colors untouched".

- **R26 The hovered / selected card glows in its OWN color** (2026-11-06, verbatim: *"Instead of highlighting in amber, just make the 'selected' one glow in whatever color it is."*). The amber highlight is gone; the existing glow is tinted with the card's tier color.

- **R27 Turret draw order** (2026-11-06, on candidate v2: *"on the 4x2 ships it looks like the third gun (from the front) barrels are rendered under the fourth gun turrets. Fix that."*): the turret nearer amidships draws above the one nearer the hull end.
- **R28 The launchers stay where they are and their arcs become side-firing, closer to real deck mounts — SUPERSEDES R6's "140° to either side".** Eric 2026-11-06, on being told real mounts fired across the beam and never dead ahead: *"lets keep them where they are and make them closer to the real thing ... Going broadside already raises your firepower at the cost of raising your target profile, and there's still room to fire the torpedo somewhat aheadish. Skill!"*; then *"I want the fore and aft launcher arcs to converge but not so much that every firing position where you could aim one launcher would have coverage from the other, too."*; then on the proposal below: *"Perfect. Confirmed."* **Each launcher fires, on BOTH sides of the ship, from 30° to 120° off its own end** (FORE measured from dead ahead, AFT from dead astern). So per side from the bow: 0–30° nothing, 30–60° fore only, 60–120° both, 120–150° aft only, 150–180° nothing. A launcher may swing through its own dead wedge to change sides but never fires while aimed or pointed into it; a click there is refused and nothing is spent (R16). His earlier ask to move the launchers toward the bow and stern is withdrawn (*"keep them where they are"*). Reading: a launcher whose CURRENT bearing is still inside its dead wedge does not fire early (R16's early-click rule applies only once it points into its firing band).

- **R29 The arc and its wedge are centered on the launcher; the wedge runs much further and fades out** (2026-11-06, on candidate v4, verbatim: *"Each launcher's arc should be centered on the launcher itself, not the center of the ship. That includes the wedge. I also would like the wedge to extend a lot further and have the alpha gradually fade out to the end of it"*). Readings: the fire law already measures from the station; the wedge's length is the readied torpedo's run distance where one exists; a launcher fires early only when it points into the SAME side band as the aim (R16 applied to two disjoint bands).

- **R30 The launcher arcs are PER SHIP, from the art** (2026-11-06: *"It'd be okay to adjust the torpedo arcs for each ship, based on their profile ... They don't have to be identical. Their guns aren't."*; *"I think you could probably make a suggestion based on the art."*; on the measured table: *"Love it. Approved."*). Rule used: a torpedo goes "over the side" where its deck run from the launcher is at most 1.5 × the hull's half-width at the launcher, applied to both edges, rounded to 5°. Each band is measured off the launcher's own end, both sides — **Yamato FORE 30–130°, AFT 40–130°; Bismarck 30–125° / 30–125°; Warspite 30–135° / 20–125°; Iowa 35–130° / 35–135°.** Supersedes R28's flat 30–120°. Also ruled the same day: the wedge is **3× today's length** (no run-distance figure exists) and where the fore and aft wedges cross **"they should overlap as a brighter patch."**

## Implementer readings of record (Eric may veto any; none is a ruling)

- **I1** RULED — see R16.
- **I2 Launcher stations:** FORE ahead of the forward turrets, AFT abaft the aft turrets, per hull, on the centerline — positions and art shown to Eric as a RENDERED candidate before commit, with the hotbar's tube / rack display and the one-off card faces (memory: show visual proposals first).
- **I3 Everything arrives loaded:** a new launcher, tube, rack or expanded rack seat arrives full (today's `reconcilePools` rule).
- **I4** RULED — see R17; the empty-turn case is R18.
- **I5 Drones keep today's turn rates** (0.9 / 0.752 / 0.6 rad/s) as authored values on their envelopes — R2 is about captain hulls; the drone system is retiring at 10.8.
- **I6 Smoke size and life are stamped on the cloud at the press** (the owner's cards then) and travel on `CloudView` under the cloud's existing perception gate — a bigger cloud is visible to whoever can already see the cloud. Not a seventh exception.
- **I7 Launcher angles reach observers exactly as turret angles do** (a contact key beside `tu`, whole degrees, same gate); per-tube and per-rack reloads are self-private on the own block.
- **I8 Draw law untouched** (10.7 re-cuts it): the four one-offs are dealt as upgrades of their family, eligible only while that family's slot is FILLED and the card unheld (this also closes the 10.5 ledger entry on add-on eligibility); bots take them by the 8-20 rule with no new dial; the `rudder` favorite is dropped.
- **I9 Bots:** torpedo tactics read the launcher arcs through the same shared functions the server uses; mines unchanged (dead astern); tuning is 10.12's.
- **I10 Cycle numbers:** cycle 215, 0.19.8 → 0.19.9, PV 97 → 98, epic-10 amendment 12 (re-fetch `origin` before numbering and before the PR).

## Boundaries & Constraints

**Always:**
- Eric's numbers above are the literal spec. One fold: every new value is derived inside `effectiveStats()` and read from `ship.stats` on both sides; no ad-hoc re-derivation; no CONFIG read of a value a card can change.
- Shared sim stays pure and identical on both sides; the client predicts launcher angles with the same shared stepper the server runs.
- Everything spatial leaves through `frames.ts` / `signals.ts`; extend the perception invariant tests and regenerate the golden frames for every new key. Exceptions stay SIX.
- `STEP_ORDER` gets an explicit seat for the launcher step (beside `stepTurrets`, before `fireControl`).
- `PROTOCOL_VERSION` bumps; both trackers get one-line stamps; rulings go to epic-10 amendment 12 (append-only); complexity ≤ 10; tests shown red first for each behavior change.
- American spelling; never "fish" for a torpedo.

**Block If:**
- A new gap in Eric's rulings appears (ask him in chat; never defer a design gap).
- The rendered candidate (I2) has not had Eric's yes before the client art / hotbar / card-face work is committed.
- A gate error persists (halt and surface; never work around).

**Never:**
- No change to the offer composition law, the exhausted-hull random stats (10.7), How-to-Play copy beyond what keeps it building (10.14), GDD / catalog-v3 / DESIGN.md rewrites (10.14 — stamp only), bot tuning (10.12), or the game's scale.
- No new in-game copy beyond card names and generated stat rows. No vocabulary / ring-size / coincidence pins in tests; test the generating function.
- No batch sims. No edit to `CLAUDE.md`. No merge without Eric's word.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Weapon reload bonus | RELOAD 70, light torpedo Tier V (bonus 40), base 25 s | 25 × 100 ÷ 110 = 22.7 s per tube | — |
| Bonus stays local | Same ship, main battery | 10 s × 100 ÷ 70 — the torpedo's bonus is not applied | — |
| RELOAD card mid-reload | A tube 50 % through, RELOAD card taken | Remaining time rescaled new ÷ old (2026-08-04 rule), per tube and per rack | — |
| Fore-only, aim astern | Click inside the 80° wedge astern | Refused `out-of-arc`; nothing spent; launcher holds its angle | Denied mark, as turrets |
| Both launchers bear | Aim on the beam, 4 tubes loaded | ONE torpedo, from the tube chosen by R16 | — |
| No tube loaded | Click in arc, all tubes reloading | Refused as `cooling` | Denied mark |
| SECOND LAUNCHER TUBE before AFT | Tube card, then launcher card | Fore gets 2 tubes; the aft launcher arrives with 2 | — |
| One-off, slot empty | No torpedo held | AFT / TUBE cards never dealt, and refused if forced | `pickRefusal` |
| Rack restock | Naval rack 3 → 2 by a drop | Clock starts at once; +1 mine per cycle until full; clock stops when full | — |
| Two racks | Racks A 3, B 3; four drops | A, B, A, B; both clocks running | — |
| Turn rack empty | A's turn, A 0, B 2; drop | B drops; next turn is A's (R18) | — |
| EXPANDED after SECOND | Both cards, captive | 2 racks × 2 = 4 held | — |
| HULL REPAIR, 3 cards | Press `C` | 160 at once + 160 over time; ready again in 75 × 100 ÷ 115 = 65.2 s on EVERY hull | — |
| SMOKE, 0 / 2 / 5 cards | Press `V` | 15 s, 124 → 248 u / 17 s, 150 → 300 u / 20 s, ~200 → ~399 u; cooldown 60 / 54.5 / 48 s | — |
| Smoke card after the press | Cloud alive, card taken | The live cloud keeps its stamped size and life | — |
| RANGE 5 cards, Warspite | RANGE 125 + 50 | Main 1750 u, secondaries 875 u; star / phosphor / flash / fouling shell reach unchanged | — |
| RUDDER | Any two captain hulls, equal speed fraction | Same turn rate; no `rudder` line dealt, named or shown | — |
| Tier cards | Any weapon line Tier I → V | No change in tubes, mines per rack or shots | — |

</intent-contract>

## Code Map

- `shared/src/sim/catalog.ts` -- `LINE_IDS`, the six ladders, weapon tier builders (`torpedoTier`, `navalMineTier`, `captiveMineTier`, `starShellTier`, fouling mines' `maxAmmo` step), `stubLine` / `addon` kind, validators.
- `shared/src/sim/stats.ts`, `indexStats.ts`, `effects.ts` -- `clampStats` reload loop (`reloadTierScale` × `cooldownScale`), `RELOAD_UNSCALED_ROWS`, `deriveIndexStats` (`turnRate` from RUDDER), `RANGE_ROWS`, stat-path whitelist, `floorIntegerFields`.
- `shared/src/constants.ts` -- `CONFIG.index.rudder`, hull and drone `index.rudder`, `INDEX_IDS`, `catalog.reloadStepPerTier`, torpedo / mine rows (`maxAmmo`, `offset`, `halfArc`), `hullRepair`, `countermeasure`, `mainBattery.traverseDegPerS`.
- `shared/src/sim/turrets.ts`, `arcs.ts`, `aim.ts` -- hull-keyed turret stepper / `pickTurret` / angle encoding; fixed torpedo sectors; `torpedoSpawn`.
- `shared/src/sim/abilities.ts`, `cloud.ts` -- CONFIG-only cooldown law; cloud radius / life from CONFIG (no transcendentals).
- `shared/src/sim/draw.ts`, `boons.ts`, `loadout.ts` -- `eligibleLines`, `addonKind`, `pickRefusal`, `FAMILY_SLOT`, `EquipmentState`.
- `shared/src/types.ts`, `index.ts` -- `OwnShip.turrets` / `ammo`, `Contact.tu`, `CloudView`, `PROTOCOL_VERSION` 97.
- `server/src/game/world.ts` -- `STEP_ORDER` (`stepTurrets`, `fireControl`), `applyCard`, `reconcilePools`, `rescaleReloadTimers`, `pressCooldownAbility`, `applyRepair` / `tickRepairs`, `makeCloud`, INSTANT RELOAD, `resetBattery`.
- `server/src/game/equipment/{torpedoCore,torpedoes,mines,mainBattery,ammo,index}.ts` -- launch bearing and pool; mine rear sector and pool; the turret fire pattern to copy; `slotAmmo` summary.
- `server/src/game/{frames,signals}.ts` + `__tests__/{perception,goldenFrames}.test.ts` -- own block, contact keys, cloud view, privacy invariants.
- `server/src/game/ai/{spending,profiles,tacticKit,equipment,movedWeapons,shift}.ts` -- card classification, `rudder` favorite, torpedo sector constants built at module load.
- `server/scripts/{weaponsSmoke,matchSmoke}.mjs`, `scripts/batchsim/overrides.ts`, `scripts/rl/features.ts` -- arc / tube / mine-count / cooldown assumptions, `rudder` pins.
- `client/src/sim/{ownBattery,ownBatteryTick}.ts`, `main.ts` -- turret prediction to copy; slot fire verdict (`clickPrediction`, `clickInArc`).
- `client/src/render/{ships,hullArt/*,contacts,aimPreview,weaponArc,firing,hotbar,equipmentIcons,equipmentInfo,cloudPaint,cloudReturnGate,slotTooltip}.ts`, `net/{snapshots,roomBindings}.ts` -- turret drawing, torpedo wedge and preview, hotbar ammo model, line glyphs, cloud size from CONFIG.
- `client/src/ui/{boonCopy,upgradeMenu,loadoutBlock}.ts`, `how-to-play/{copy,weaponTables}.ts` -- `LINE_NAMES`, `STAT_LINES`, `INDEX_WORDS`, `cardKind`, hover rows, results ladder strip, How-to-Play `lineOf` (throws on an unknown id).

## Tasks & Acceptance

**Execution (waves in dependency order; each wave gated by the workspace's tests):**

Wave 1 — shared stats and catalog
- [ ] `shared/src/sim/stats.ts`, `indexStats.ts`, `constants.ts` -- replace `reloadTierScale` × `cooldownScale` with `reloadCooldownScale(RELOAD + bonusPerTier × (tier − 1))` on scaled rows; delete `reloadStepPerTier`; add `CONFIG.catalog.reloadBonusPerTier` 10 -- R5.
- [ ] `shared/src/constants.ts`, `sim/indexStats.ts`, `stats.ts`, `effects.ts` -- remove the RUDDER index (`INDEX_IDS`, hull tables, stat path); captains' `turnRate` is the baseline dial; drones get authored turn rates -- R2, I5.
- [ ] `shared/src/sim/stats.ts`, `abilities.ts`, `cloud.ts`, `constants.ts` -- per-ship `repair` (heal amounts, cooldown) and `smoke` (cooldown, life, r0, r1) on `EffectiveStats` from card counts and CONFIG bases (75 s / 60 s, +5 a card, ×1.1 size by repeated multiply anchored at two cards); `abilityCooldownMs` / `abilityCooldownFraction` take stats; cloud radius / life take the cloud's stamped values -- R8, R9.
- [ ] `shared/src/sim/catalog.ts`, `constants.ts` -- delete `rudder`; RELOAD / ENGINES +10; append `range`, `hullRepair`, `smokeScreen` ladders and the four cap-1 one-offs (family-wide effects); strip every capacity step from the tiers; rack bases 3 / 3 / 1; header counts restated -- R1, R3, R4, R6, R7.
- [ ] `shared/src/sim/draw.ts`, `boons.ts` -- one-off eligibility and refusal = family slot FILLED and card unheld -- R10, I8.
- [ ] `shared/src/__tests__/*` -- unit tests for the matrix rows that are pure (reload law, bonus locality, ability laws, smoke sizes, eligibility, RANGE reach, turn-rate equality); delete pins the rulings retire.

Wave 2 — shared launcher and rack models
- [ ] `shared/src/sim/turrets.ts` (+ new `sim/launchers.ts`) -- parameterize the stepper / pick / angle codec by a mount spec; launcher mounts from held cards (fore, optional aft, ±140°, battery traverse rate, 1–2 tubes each with its own reload); `arcs.ts` torpedo sectors replaced by the launcher arc union -- R6, R16.
- [ ] `shared/src/sim/racks.ts` (new), `loadout.ts` -- rack state (1–2 racks, capacity, one clock each restoring one mine per cycle), alternation cursor, slot summary -- R7, R17.
- [ ] `shared/src/types.ts`, `index.ts` -- own-block launcher / tube and rack state, contact launcher-angle key, `CloudView` size and life, barrel exports, `PROTOCOL_VERSION` 98.
- [ ] `shared/src/__tests__/{launchers,racks}.test.ts` -- arc, hold-outside-arc, tube choice, per-tube clocks, rack restock and alternation.

Wave 3 — server
- [ ] `server/src/game/world.ts`, `equipment/{torpedoCore,torpedoes,mines,ammo,index}.ts` -- launcher state per ship, `stepLaunchers` in `STEP_ORDER`, fire from the picked tube at its station and angle; rack drops; card-driven resize (arrives loaded); rescale, INSTANT RELOAD (R14) and reset branches; abilities and cloud from `ship.stats`, cloud stamped at the press -- R5–R9, I1, I3, I6.
- [ ] `server/src/game/{frames,signals}.ts`, `__tests__/{perception,goldenFrames}.test.ts` -- new keys under the existing gates; invariants extended; golden frames regenerated -- I6, I7.
- [ ] `server/src/game/ai/*` -- launcher-arc torpedo legality, new card classification, `rudder` favorite dropped -- I8, I9.
- [ ] `server/src/__tests__/*`, `server/scripts/{weaponsSmoke,matchSmoke}.mjs`, `scripts/batchsim/*`, `scripts/rl/*` -- integration tests for the remaining matrix rows; smokes re-cut for launchers, racks and per-ship cooldowns; `rudder` pins removed.

Wave 4 — client (the rendered candidate FIRST — Block If)
- [ ] throwaway candidate page (esbuild recipe of 9.11) -- launchers on the four hulls, hotbar with 1–4 tubes and 1–2 racks, the seven new card faces -- shown to Eric; build only after his yes -- I2.
- [ ] `client/src/sim/*`, `main.ts`, `net/{snapshots,roomBindings}.ts` -- predicted launcher angles and fire verdict from the shared model; contact launcher angles; cloud size / life from the wire.
- [ ] `client/src/render/*` -- launcher art on own and enemy hulls, torpedo wedge = the launcher arcs, preview from the launcher station, hotbar tube / rack clocks, `C` / `V` wipes from stats, cloud paint from stamped size.
- [ ] `client/src/ui/{boonCopy,upgradeMenu,loadoutBlock}.ts`, `render/equipmentIcons.ts`, `how-to-play/*` -- names, kind word (one-offs read WEAPON), stat and hover rows for the new lines, glyphs, results strip for eight ladders, RUDDER gone; How-to-Play kept building only (new ids to `AWAITING_COPY`, the `rudder` entry dropped).
- [ ] `client/src/**/__tests__/*` -- tests for the above; retired pins deleted.

Wave 5 — records
- [ ] `_bmad-output/implementation-artifacts/epic-10-context-amendments.md` (amendment 12), `epic-10-context.md`, `deferred-work.md` (close the add-on eligibility entry), both trackers, `VERSION` + root `package.json`, `CHANGELOG.md`, DESIGN.md / GDD / catalog-v3 one-line stamps.

**Acceptance Criteria:**
- Given a fresh match, when any captain levels, then only the eight SHIP ladders, the ten WEAPON lines and (once their slot is filled) the four one-offs are ever dealt, and no card changes a tube, mine or shot count except the one-offs.
- Given a torpedo held, when the captain moves the cursor, then the launcher turns toward it at the turret rate inside ±140° of its center and stops at the limit; observers who can see the hull see the launcher at that angle.
- Given two clients and a server, when torpedoes, mines, `C` and `V` are used across card pickups, then the client's predicted launcher angles, cooldown wipes and cloud sizes match the server's with no correction beyond today's turret behavior.
- Given the perception invariant suite, when it runs, then nothing outside sight ∪ this-tick radar reaches a client and the declared exceptions are still six.
- Given `npm run check`, `matchSmoke` and `weaponsSmoke`, when run on the final tree, then all pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why a per-weapon RELOAD bonus is one line of law:** the fold already computes each row's reload from its tier count; the bonus replaces a multiply (`× (1 − 0.05 × (tier − 1))`) with an add inside the existing haste law. The server's running-reload rescale is generic (new ÷ old), so tier and RELOAD cards keep working per tube and per rack.
- **Why tubes and racks copy the battery:** the main battery is the only weapon with per-unit clocks today (`TurretState[]` beside the ship, a derived slot summary for the hotbar, an own-block array, a contact angle key). Launchers reuse all of it; the new part is that their COUNT changes with cards, so `applyCard` resizes the arrays.
- **Smoke anchor:** size(cards) = today's × 1.1^(cards − 2), computed by repeated multiply / divide (cloud code bans transcendentals).

## Verification

**Commands:**
- `npm install --include=dev && npm run build -w shared` -- expected: clean (fresh worktree).
- `npm test -w shared` / `-w server` / `-w client` -- expected: green after each wave.
- `npm run lint` -- expected: 0 errors.
- `npm run check` -- expected: EXIT 0 on the final tree.
- `server/scripts/matchSmoke.mjs` and `weaponsSmoke.mjs` (booted server, `HC_DEV_OPTIONS=1`, run alone; kill the PID and its tsx child) -- expected: PASS.

**Manual checks:**
- The rendered candidate (I2) approved by Eric before Wave 4's art lands.
