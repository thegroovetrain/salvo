---
title: 'Story 10.5: The Kit Retire and the Three Equipment Slots'
type: 'feature'
created: '2026-11-05'
status: 'in-review'
baseline_revision: 'f063f3be'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The four-key consumable kit (Stories 10.1 / 10.2) was "too many buttons to manage, not broken". Eric's slice replaces it with two universal cooldown abilities and three card-filled equipment slots, and drops the shield and the four buoys.

**Approach:** Delete the consumable system (kit, stock, belt, picker, drone drops), SHIELD BLOCK and every shield term, and the decoy / buoy machinery. HULL REPAIR (`C`) and SMOKE (`V`) become per-ship cooldown abilities. The three weapon slots become FAMILY slots — `Q` torpedo, `E` mine, `R` special shell — one kind per slot for the match; FLASH SHELLS, FOULING SHELL and SUPERCAVITATING TORPEDO move from stock items to reloading slot weapons. The hotbar is re-cut for Shift · Q · E · R · C · V.

## Eric's rulings for this story (2026-11-05, AskUserQuestion at the spec step — literal spec, to be recorded as epic-10 amendment 11)

- **R1 HULL REPAIR cooldown: 90 s.** Heal stays 100 at once + 100 over 5 s (amendment 8(f)). Rejected: 60 / 120 / 180 s.
- **R2 SMOKE cooldown: 60 s**, counted from the press; the 9.3 cloud is unchanged (15 s, 150 → 300 u). Rejected: 30 / 45 / 90 s.
- **R3 RELOAD shortens NEITHER cooldown** — both are fixed for every ship. Rejected: smoke only; both.
- **R4 Reloads** (Eric, free text: *"FLASH SHELL 30, FOULING SHELL 30 (you forgot these), SUPERCAV 45."*): FLASH SHELLS 30 s, FOULING SHELL 30 s, SUPERCAVITATING TORPEDO 45 s. The FOULING SHELL is therefore a special-shell option NOW (closes the story's "10.6 `[unruled]`").
- **R5 A drone kill pays XP only** until 10.8; the consumable drop roll is removed. Rejected: XP + a little hull.
- **R6 BROADSIDE leaves the deal** — kept in the file for reference like the deck guns. Rejected: a special-shell option.
- **R7 FLASH and FOULING shell tiers widen the burst: +25 u per tier, 150 → 250 u** at Tier V, on top of the standard 5 % shorter reload per tier. Rejected: reload only; a longer effect; +15 u; +37.5 u. SUPERCAV tiers are amendment 8(e): 400 → 800 damage, +100 a tier.
- **R8 PASSIVE HEALING IS BACK** (Eric 2026-11-05, chat, mid-run, verbatim: *"Also we need to add back in the 2% missing HP passive healing after 30 seconds of not taking damage. It wont make combat any less deadly, but it will allow ships who survive to recover."*): a hull that has taken no hull damage for **15 s** heals 2 % of its MISSING hp per second. Same day, on being told the old wait was 15 s: *"2% per second is right."* and *"That's right. Make it 15, 30 was too long."* — the 30 s of his first sentence is superseded. Supersedes amendment 6(b)(6) "passive healing DIES", amendment 8's regen removal and this story's "HULL REPAIR is the ONLY heal" clause; the PASSIVE HEALING card ladder stays deleted (he did not ask for it).
- **R9 THE RELOAD STAT DOES NOT TOUCH THE Q / E / R WEAPONS** (Eric 2026-11-05, chat, mid-run, verbatim: *"I also think that the RELOAD stat should not affect QER weapons, and their cooldowns should be controlled by their own upgrades. That sidesteps the issue you brought up about the Yamato. RANGE already doesn't affect them. POWER and ARMOR do but that is necessary."*): a torpedo, mine or special shell reloads on its own number and its own tier step only; RELOAD (hull index and cards) scales the main battery as before. Supersedes amendment 8(l)'s "applied to every row" for the three slot families and the 2026-08-04 running-reload rescale for them. POWER and ARMOR keep acting on slot-weapon damage through the gate.
- **R11 R9 IS REVERSED: RELOAD APPLIES TO THE Q / E / R WEAPONS AGAIN** (Eric 2026-11-05, chat, later the same day, verbatim: *"I changed my mind, reload should apply to QER weapons. Its fine if the Yamato gets a longer CD on them as a result in the early game, because they also have higher power, so more damage is dealt proportionally to the average ship per torpedo (as an example) as a tradeoff."*). RELOAD (hull index and cards) scales the main battery AND the torpedo / mine / special-shell reloads, as before this story; a RELOAD card rescales their running reloads by the 2026-08-04 progress-fraction rule again. R10 stands for everything else: RELOAD does not touch the Shift cooldowns, the secondaries, or `C` / `V`. Recorded consequence, accepted by Eric: SUPERCAV's 45 s is about 64 s on Yamato (RELOAD 70), longer than the 60 s assist window.
- **R10 RELOAD IS THE MAIN BATTERY'S STAT ONLY; INSTANT RELOAD REFRESHES EVERY GUN AND SLOT WEAPON** (Eric 2026-11-05, chat, verbatim: *"Shift abilities also should not be affected by RELOAD. Only the main and secondary guns. INSTANT RELOAD refreshes all cooldowns, so yes it still finishes the QER reloads, along with the main and secondary guns."*; then two AskUserQuestion answers). RELOAD no longer scales the Shift abilities' cooldowns (Speed Boost, Instant Reload, Hunker). On the secondaries RELOAD changes **nothing, as today** (rejected: cool-down time; fire rate; both) — so RELOAD acts on the main battery alone. INSTANT RELOAD finishes every turret reload and every Q / E / R reload AND sets secondaries heat to zero and unlocks them (supersedes amendment 9(h) R7 "heat untouched"); it does **not** reset HULL REPAIR or SMOKE (rejected: smoke yes; everything).

## Boundaries & Constraints

**Always:**
- `CONFIG` holds every number above. Ability cooldowns and slot-family rules live in `shared/src/sim` as pure functions both sides call; no per-side fork.
- Player intent enters only through `game/inputs.ts` (validated, malformed dropped). Own cooldown state rides the own-ship block, self-private. The SIX perception exceptions stay six; the invariant tests are trimmed for removed channels and EXTENDED for anything added.
- AMENDMENT 5's flash whiteout (sight law, overlay, burst disc incl. the victim and interception arms, DAZZLED tell) and the 9.3 countermeasure cloud survive behaviorally unchanged.
- `PROTOCOL_VERSION` 96 → 97 with a history note. No friendly fire. ESLint complexity ≤ 10. Tests assert contracts and relations — never bare CONFIG literals, copy, or a coincidence of ruled numbers; each removed feature's tests are deleted, not skipped.
- The hotbar candidate is RENDERED from the real client modules to an artifact page and shown to Eric before the PR is opened.

**Block If:**
- A change would need a seventh perception exception.
- A gameplay number outside R1–R7 and the readings in Design Notes is needed.
- `npm run check`, `matchSmoke` or `weaponsSmoke` cannot be made green without working around an error.

**Never:**
- No HULL REPAIR / SMOKE tier-up cards, no index-card or offer-composition changes, no kind re-cut beyond the lines named here (10.6 / 10.7). No drone removal (10.8). No bot tuning beyond "functional" (10.12).
- No How-to-Play / GDD / catalog-v3 copy edits (10.14); no CLAUDE.md edit; no new in-game explanatory copy; no batch sims; no skipped tests.
- No heal beyond HULL REPAIR and the R8 passive regen; no regen card ladder; no shield or temporary HP term left reachable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Repair | `C`, hull below full, ability ready | 100 hp now + 100 pooled over 5 s; 90 s cooldown starts | none |
| Repair at full | `C`, hull full | nothing; cooldown NOT started | denial |
| Repair cooling | `C` inside 90 s | nothing | denial `cooling` |
| Smoke | `V`, ready | the 9.3 cloud; 60 s cooldown starts at the press | none |
| RELOAD cards | any RELOAD index | `C` / `V` and Shift cooldowns unchanged (R3, R10); main-battery AND torpedo / mine / shell reloads scale (R11) | none |
| Empty slot | `Q` / `E` / `R` with nothing fitted | no ready; left click fires a turret | press refused |
| Ready and fire | `Q` then left click | the torpedo fires instead of a turret shot; the ready ends (today's revert) | out-of-arc / reloading denial as today |
| Cancel | weapon readied, right click | ready cancelled; that press fires no secondaries | none |
| Readied blocks secondaries | weapon readied, right held | no secondary round until cancelled or fired | none |
| Instant Reload | Shift = INSTANT RELOAD pressed | every turret and Q / E / R reload finishes; secondaries heat 0 and unlocked; `C` / `V` cooldowns untouched | none |
| First card of a family | LIGHT TORPEDO card, torpedo slot empty | fills the `Q` slot | none |
| Other kind, filled slot | HEAVY / SUPERCAV after LIGHT is slotted | never in an offer; a forced pick is refused | refusal |
| Tier-up | same kind again | tier rises to cap 5; stays in offers below cap | at cap: excluded |
| Shell tiers | FLASH / FOULING SHELL tier N | burst radius 150 + 25 × (N − 1) u | none |
| Legacy client data | saved `hullcracker.kit`, join option `kit` | ignored | none, no log needed |
| Drone kill | captain sinks a drone | XP only; no drop event | none |
| Passive regen | hurt hull, 15 s since the last blow that removed hull hp | heals 2 % of missing hp per second, every tick | none |
| Regen interrupted | any hull damage (shell, torpedo, mine, ram, storm, burn) | regen stops; the 15 s clock restarts | none |
| Regen + repair | `C` pressed while regenerating | both apply; neither resets the other | none |

</intent-contract>

## Code Map

- `shared/src/sim/loadout.ts` -- 9-slot model (`KIT_SIZE`, `CONSUMABLE_SLOTS`, `ConsumableKit`, `DEFAULT_KIT`, `SlotItemId`, `CONSUMABLE_IS_WEAPON`), `WEAPON_SLOTS` [2,3,4], `loadoutFor`.
- `shared/src/sim/catalog.ts` -- 28 lines; `consumable()` builder; equipment lines; `depthCharge` stub.
- `shared/src/sim/boons.ts`, `draw.ts`, `offers.ts` -- kit functions (`isConsumableKit`, `rollKit`, `dealableConsumables`, `stockSlotFor`), `pickRefusal`, `applySlotEffect` (first-empty-slot fill, no one-kind rule), `eligibleLines`, level-zero guarantee, kind shares.
- `shared/src/sim/effects.ts`, `stats.ts`, `arcs.ts` (`consumableArc`), `shell.ts` (`'decoy'` target, `acquireNearest` buoy preference), `buoy.ts` -- consumable ids, stat rows, decoy/buoy math.
- `shared/src/constants.ts` -- `hullRepair`, `countermeasure`, `shieldBlock`, `buoy`, `flashShells`, `foulingShell`, `supercavTorpedo`, `droneDrops`.
- `shared/src/types.ts`, `index.ts` -- `InputMsg.actSlot`, `OwnShip.kit` / `shield` / `buoyShield` / `speedBuoyAt`, `DecoyView`, `FrameMsg.decoys`, `ReturnBlipEvent.src`, `DropEvent`, PV 96.
- `server/src/game/equipment/` -- `consumables.ts` + `consumables/*` rows, `index.ts` registries and `ActivationContext`.
- `server/src/game/world.ts` -- `STEP_ORDER` (`stepClouds`, `expireBuoys`, `applyBuoyEffects`, `tickRepairs`), kit seam, `consumeClick` / `consumePress`, `applyDamage` shield order, `rollDroneDrops`, decoy store.
- `server/src/game/{inputs,frames,signals,perception,decoys}.ts`, `server/src/rooms/*` -- sanitizer, own block, `decoy` signal row, kit at join.
- `server/src/game/ai/{consumables,equipment,tactics,spending,profiles,posture,types}.ts` -- consumable tactics, kit-aware spend, decoy odds.
- `server/scripts/*.mjs`, `scripts/batchsim/*`, `scripts/rl/*` -- literal inputs, `rollKit`, decoy readouts.
- `client/src/input/{keyboard,mouse}.ts`, `sim/inputSampler.ts` -- Q/E/R prime model (exists), belt keys 1–4, right mouse = secondaries only.
- `client/src/render/{hudBar,hotbar,equipmentInfo,hpGlobe,decoys,buoyRings,buoySweep,buoyMarks,aimPreview,weaponArc}.ts`, `config.ts` -- bar layout, belt frame, shield fill, buoy rendering.
- `client/src/ui/{kitPicker,classSelect,home,settings,boonCopy,upgradeMenu,refitTooltip}.ts`, `net/{connection,lobby,roomBindings}.ts`, `main.ts`, `sim/prediction.ts` -- picker, kit storage and join, keys copy, speed-buoy term.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- add the R1 / R2 cooldowns and R4 reloads, the R7 radius step; delete `shieldBlock`, `buoy`, `droneDrops` -- numbers.
- [ ] `shared/src/sim/{loadout,catalog,boons,draw,effects,stats,arcs}.ts` -- five slots (battery, Shift, torpedo, mine, shell); slot families; one kind per slot in the draw and the refusal gate; `supercavTorpedo` / `dazzleShells` / `foulingShell` become equipment lines with tiers (R4, R7, 8(e)); consumable lines, kit functions and stock deleted; `broadside` undealable with a dated note; `depthCharge` stays a stub -- slot and catalog model.
- [ ] `shared/src/sim/abilities.ts` (new), `shell.ts`, `buoy.ts` (deleted), `types.ts`, `index.ts` -- pure cooldown law for `C` / `V`; decoy target kind and buoy preference removed; wire: ability press, own cooldown fields, removed kit / shield / buoy / decoy / drop fields; PV 97 -- wire contract.
- [ ] `shared/src/constants.ts`, `shared/src/sim/regen.ts` (new), `server/src/game/world.ts` -- `CONFIG.regen` (R8: 0.02 of missing per second, 15 000 ms wait) and one pure regen law read by the heal step off `lastDamagedAt` (already written at the one damage gate, reader-less since 10.3); the client learns hp from frames as today -- passive regen.
- [ ] `shared/src/sim/stats.ts`, `shared/src/sim/secondaries.ts`, `server/src/game/equipment/instantReload.ts` + reload-rescale sites, `client/src/sim/ownBattery*.ts` -- R9 / R10: the RELOAD multiply reaches the main battery only; INSTANT RELOAD zeroes heat on both sides (one shared helper); the running-reload rescale applies to turrets only -- RELOAD scope.
- [ ] `shared/src/__tests__/*` -- unit tests for the matrix rows that are pure (cooldown law, family fill, one-kind refusal, tier radius, draw never offers a second kind); delete kit / buoy / shield tests -- contracts.
- [ ] `server/src/game/equipment/*`, `world.ts`, `decoys.ts` (deleted) -- two cooldown abilities; the three moved weapons on the reload pool; consumable rows, shield order, decoy store, buoy steps and drone drops removed; `STEP_ORDER` re-declared -- authoritative sim.
- [ ] `server/src/game/{inputs,frames,signals,perception}.ts`, `server/src/rooms/*` -- validate the ability press; own block; remove the `decoy` channel and kit join path; trim and extend the invariant tests; re-record goldenFrames with a dated note -- chokepoint and join.
- [ ] `server/src/game/ai/*` -- bots press `C` when hurt and `V` under fire on the cooldowns, and fire slot weapons through the existing tactics (flash / fouling / supercav tactics move to the weapon table); kit, buoy and shield logic removed -- functional bots.
- [ ] `server/scripts/**` -- smokes and harness lose kits, decoys and drops; `weaponsSmoke` gains a HULL REPAIR cooldown phase, a SMOKE phase and a one-kind-per-slot phase -- smokes.
- [ ] `client/src/input/*`, `sim/*`, `main.ts`, `net/*` -- `C` / `V` presses; right click cancels a ready and a ready blocks secondaries; belt keys 1–4 keep only the refit pick; kit, shield, buoy and drop plumbing removed -- input and state.
- [ ] `client/src/render/*`, `config.ts` -- hotbar Gun · Sec · Shift · Q · E · R · C · V with cooldown wipes, empty-slot look for an unfilled family slot, belt frame gone; shield fill and buoy renderers deleted; the flash burst disc draws the tiered radius -- HUD.
- [ ] `client/src/ui/*` -- kit picker and CONSUMABLES row deleted; `settings.ts` key rows for Q / E / R, C, V, right click; card copy rows for the three moved lines -- chrome.
- [ ] `_bmad-output/**`, `VERSION`, `package.json` -- amendment 11 (rulings verbatim + readings) in the amendments file AND the compiled context, DESIGN.md dated stamps, deferred-work, both trackers one line each, 0.19.8 -- records.

**Acceptance Criteria:**
- Given a fresh match, when a captain spawns, then the three equipment slots are empty, `C` and `V` are ready, and no consumable, shield or buoy can be obtained by any path (offer, dev fit, drone kill).
- Given a captain with a slotted torpedo, when offers are drawn for the rest of the match, then no other torpedo kind ever appears (property test over random card histories).
- Given any frame to any observer, when it is built, then it carries no kit, shield, buoy or decoy field, and another captain's cooldowns never appear (invariant tests).
- Given a full bot match, when it runs to a winner, then bots use both abilities and at least one slot weapon, and nothing throws.
- Given the finished tree, when `npm run check`, `matchSmoke` and `weaponsSmoke` run, then all pass first try.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass (Fable Blind Hunter + Fable Edge Case Hunter + Codex `gpt-5.6-sol`, on `git diff f83440fc HEAD`)

Verdicts: Blind Hunter BUILD-ON-IT (3 low findings, 7 suspicion areas traced clean with probes), Edge Case Hunter 5 unhandled cases (1 reachable in principle, 4 latent), Codex FIX-FIRST (2 findings; perception traced clean).

- intent_gap: 0
- bad_spec: 0
- patch: 4 (low 4; one test-only, see below)
- defer: 4 (low 4)
- reject: 1
- addressed_findings:
  - `[low]` `[patch]` Blind Hunter: a double `C` / `V` press inside one round trip showed ACTIVATED then DENIED → a per-ability press latch (`client/src/sim/abilityLatch.ts`, wired in `main.ts` / `roomBindings.onOwnFrame`): a second press is refused locally until the stamp or a denial arrives, 64-own-frame valve (`PENDING_CAPACITY`); test red first.
  - `[low]` `[patch]` Blind Hunter: a hurt bot in a weapons-frozen room pressed repair every tick → test only, no code change: the Match freezes helm and weapons together and the driver skips the brain on the port's `helmEnabled`; the repro needs weapons off with the helm live (no production path), the port has no weapons read (none added); the pin (`bots.test.ts`) was green on its first run.
  - `[low]` `[patch]` Edge Case Hunter: the `C` / `V` wipe read READY on a NaN clock or stamp → reads cooling with the full wipe and no numeral, numeral clamped to the whole cooldown (`client/src/render/hotbar.ts` `abilityCooldownView`); test red first.
  - `[low]` `[patch]` Edge Case Hunter: `familySlotFor` returned `undefined` for an unknown id → `null`, own keys only (`shared/src/sim/loadout.ts`); test red first.
- deferred (ledger): exhausted hull keeps banking levels (10.7); INSTANT RELOAD unpredicted on the client (HUD / UX pass); add-on eligibility vs the host's family slot (10.6); an `actSeq` jump evaluates only the newest `act` (no owner).
- rejected: How-to-Play staleness (frozen until 10.14, already on the ledger).

## Design Notes

Implementer readings of record (each Eric's to veto on staging; none is a ruling):
- **Slots:** `SLOT_COUNT` 5 — 0 battery, 1 Shift, 2 torpedo `Q`, 3 mine `E`, 4 special shell `R`. Families: torpedo = light / heavy / supercav; mine = naval / captive / fouling; shell = star / phosphor / flash / fouling shell. `C` / `V` occupy no slot.
- **Abilities:** both ready at spawn; the cooldown starts at a successful press; a sinking hull cannot press; the server is the authority and the client shows the wipe from the own-block field. The wire names the ability, not a belt slot (encoding is the shared wave's call).
- **Ready-and-click is today's prime model** (client-local; each click carries its slot; the server keeps no ready state, so nothing about a ready reaches another client). The ready ends after the shot as today.
- **Right click with a ready** cancels it and that press fires nothing; a fresh press fires secondaries.
- **Moved weapons:** one round, the R4 reload scaled by RELOAD and the tier step like every slot weapon (R11); Shift cooldowns and INSTANT RELOAD per R10; arcs and reach as today (`consumableArc` rows move to the equipment arcs). The flash / fouling burst's actual radius rides the existing burst row under its existing gate; the in-radius victim arm uses that radius.
- **Level-zero guarantee:** card 0 is a weapon that fills an empty slot. With the consumable kind gone, the remaining kind shares keep their relative weights (10.7 re-cuts the law).
- **Deleted, not dormant:** shield, buoys, decoys, kit, drops (git history keeps them). The main shell's mask becomes hull only. `depthCharge` stays the one stub line.
- **Bots:** repair below a hull threshold and smoke when under fire — thresholds in `CONFIG.bots`; favorite-consumable profile fields removed. The bot kit stream is deleted; the hull / Shift stream is untouched so pinned-seed seats hold.
- **Passive regen (R8):** per second is Eric-confirmed (R8); the rate and the 15 s wait are the base of the law 10.3 removed (epic-9 amendments 90–92, 100); the clock is the last blow that removed hull hp from ANY source, storm included (amendment 92 as built — with the shield gone every landed blow resets it); fixed for every captain and combat bot, NOT the PvE drones (the removed law excluded fleet hulls, epic-9 amendment 48), not a stat, no card, not scaled by any index; no new HUD readout or in-game copy; bots get no "wait to heal" behavior (10.12).
- **Empty offer — RULED mid-run** (Eric 2026-11-05, chat, on the wave-1 finding that a hull holding every ladder and three capped slot weapons draws nothing): *"Empty offer is fine, I think what should happen is you get some random stats. But I don't think ships reaching that level will be overly common. We'll address in 10.7"*. Built here: an empty offer never opens the refit window and never throws; a short offer shows fewer cards. Owed to Story 10.7: an exhausted hull gets random stats (ledger entry).
- **R9 was built, then reversed by R11** the same day: RELOAD scales slot weapons; the Yamato consequence is Eric's accepted tradeoff.
- **Hotbar candidate — Eric 2026-11-05** (AskUserQuestion on https://claude.ai/artifact/JnVc6K2ihRxPmr6LEtRtLZ): *"Almost right. I want the empty, grayed out slots to at least indicate what kind of slot they are, if that makes sense? Visually?"* → an empty Q / E / R square draws its family's glyph dimmed (reading: one existing glyph per family, no label). Also ruled there: the C / V tooltips show a cooldown row; the results LOADOUT strip draws C and V after R.
- **Version** 0.19.8, cycle 214, PV 97.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0 (lint, tsc ×3, all tests, hook test).
- `HC_DEV_OPTIONS=1` server from `server/` on a scratch `PORT`, then `node server/scripts/matchSmoke.mjs` and `node server/scripts/weaponsSmoke.mjs` (one at a time) -- expected: both OK first try; the server PID and its tsx child killed after.

**Manual checks (if no CLI):**
- Candidate artifact page rendered from the real client modules at 1366×768: the hotbar with empty slots, a filled and readied slot, and `C` / `V` ready and cooling.
