---
title: 'Story 10.10: The Battle UI — XP Seen, the Offer in the Corner (the full in-game UI/UX pass)'
type: 'feature'
created: '2026-11-09'
status: 'in-review'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
warnings: ['oversized', 'multiple-goals', 'design-gate']
---

<intent-contract>

## Intent

**Problem:** XP and levels are a 4 px track with 9–11 px type at the screen floor; a level-up is a 3 s toast at the top and a 24 px chip at the bottom; the refit offer is a 924 px four-card row over the center-bottom water under a FULL combat lockout, opened by Tab and picked by a digit only while open; each card asks for five stat rows of reading; the HP globe does not read as HP; per-mount reload state (turrets, launcher tubes, mine racks) has no readout beyond one square per weapon; ship and weapon stats hide behind hover tooltips (Eric 2026-10-25 and 2026-11-09).

**Approach:** A FULL in-game UI/UX pass (Eric, R2): the screen center is reserved for the water and the ship; the LEFT edge becomes the SHIP console (hull, the six indices, engines and helm), the RIGHT edge the WEAPONS console (every mount with its own reload clock, secondaries heat, Q/E/R, C/V, Shift); the top row keeps its content restyled; the offer becomes an always-live compact card group with no lockout, picked by click or Tab+digit; XP and level read at a glance. THIS RUN is the design sitting: the Stitch prompt and a live candidate page. The code build starts only after Eric's Stitch pass and his pick (R14).

## Eric's rulings for this story (2026-11-09, four AskUserQuestion rounds at the spec step; recorded as epic-10 amendment 16; the story text stands wherever these do not rule)

- **R1 Problems to fix:** XP/level too small and buried; the offer blocks the fight; the two-step pick (Tab then digit); cards ask for too much reading; PLUS, in Eric's words: *"HP is unclear, as well. Also, now that we are moving to individual turrets/launchers/racks, we need better indicators of the reload status (what we have right now is good in the short term). I'd like to be able to see my ship's and weapons' stats more easily, too. The middle of the screen should be reserved for the ship and the action, we have lots of space out to the sides we can use and make a really unique interface that looks like what you might see at a hypothetical ship control station, you know?"*
- **R2 Scope: the FULL in-game UI/UX pass** (closes amendment 8(o)'s standing note). Bar, globes, hotbar squares, XP, offer, toasts, chrome bar and kill feed are all in scope. Rejected: XP + corner offer only; XP + offer now with the rest later.
- **R3 No combat lockout; Tab is gone as an opener; Tab is the MODIFIER to quick-select a card** — Eric: *"No lockout, tab is gone (but its still the modifier to quick-select one of them)."* Confirmed as **Tab + 1..4 picks offer card 1..4**; clicking a card also picks; bare digits do nothing (see R8). Supersedes epic-7 amendment 39 (Tab toggles the window), epic-8 amendments 45 / 56 (the window's open edge and the Shift suspension — there is no window), and the "full combat lockout" of `client/src/input/mouse.ts` / `keyboard.ts`.
- **R4 The offer's corner is UNDECIDED** — Eric: *"Show me options. I don't want to decide this now."* The candidate page shows bottom-right above the weapons console, bottom-left above the ship console, top-left, and a right-edge mid-height stack.
- **R5 Layout: SHIP console LEFT, WEAPONS console RIGHT, center clear, top stays the match** (afloat / kills / timer / ring / kill leader, kill feed). The bottom-center bar and both globes retire into the consoles. Rejected: mirrored; a slim bottom bar kept for the hotkeys.
- **R6 Per-mount reload form: RENDER ALL THREE** before deciding — (a) a top-down diagram of the own hull on the weapons console with every turret, launcher and rack drawn at its real station, filling or lighting as it reloads and comes ready, key chips beside their mounts; (b) rows per weapon with one reload ring per turret / tube and one pip per mine; (c) both.
- **R7 Hull gauge: OPEN** — Eric: *"My friend said that, while he liked the design at first, it doesn't necessarily read as 'HP.' I'm open to options."* Candidates: a large percent numeral; a straight or segmented hull bar; the own hull outline tinted / cracked as the percent falls; regen and HULL REPAIR shown as a visible climb; today's globe kept for comparison.
- **R8 Bare digits as manual mount selection are LEDGERED, not built** — Eric's idea, verbatim: *"I was thinking perhaps that bare digits could be used to select a specific turret or torpedo launcher? Like ~ to go back to 'auto' mode, but i could manually fire my fore turret by pressing 1. Or if I have torpedoes active, I can press 1 to select just my fore turret. Idk. Something to consider. Otherwise yeah they'd do nothing."* Ruled: a deferred-work idea for a later story; bare digits stay inert in 10.10. Rejected: designing it on the candidates; building it here.
- **R9 Stats: EVERYTHING ALWAYS ON, and a hovered offer card previews its change on those displays** — Eric: *"Everything always on. And when I hover over an upgrade card, I want to use those 'always on' displays to show the incoming change."* The six indices and every fitted weapon's key numbers are permanently visible on their consoles; hovering a card re-values the affected readouts (the incoming value beside or in place of the current one, in the card's tier color — reading, candidate page decides). Supersedes epic-8 amendments 185–187's hover-only SHIP panel and slot tooltips as the ONLY stat surface.
- **R10 The level-up toast is KILLED; the countdown offer lives in the same corner group with REDRAW beside it.** The arrival animation of the corner card IS the level-up cue. Supersedes epic-8 amendments 59 / 61 (the auto-opened window at countdown; the toast) and `ui/upgradeToast.ts`'s `pointToastLine`; the REDRAW mechanics (Story 8.10, amendment 13 R4 `rd`) are unchanged.
- **R11 Stitch prompt shape: ONE master prompt + short state variants** (mid-fight master; variants: offer pending with two banked levels, hull under 25 % with reloads running, countdown with REDRAW). Rejected: one prompt only; one prompt per console.
- **R12 Console surface: SHOW BOTH** — floating 1 px linework over the water (DESIGN.md's Afterimage rule) AND solid near-opaque edge strips (card-scrim .9) — decided on the candidate page / Stitch pass. If solid wins, DESIGN.md's "no filled panels" rule is amended at the build.
- **R13 Top row: RESTYLE to match the consoles, SAME CONTENT, same places** (chrome bar top-center, kill feed top-right).
- **R15–R19 (2026-11-09, second session, epic-10 amendment 17 — the pick, "Go"):** R15 the pick = floating surface, right-mid offer, rows reload form, bar hull gauge (closes R4 / R6 / R7 / R12). R16 the control register = the Stitch screen's tall outlined buttons (state word ARMED amber / READY phosphor, tier numeral in ramp color, key chip, name, cooldown numeral + thin progress line) with the GAME's words only. R17 the weapon rows ARE the buttons, in the order Main Battery · Secondary (heat bar + stats) · Torpedo · Mines · Special, stats on their own line, every turret / tube / rack clock big enough for a seconds numeral, the mines row up to two racks × four pips (two for captive); the Q/E/R squares are retired; C / V / Shift stay as three big ability buttons beneath. R18 hover preview = EVERY changing number turns amber with a small up arrow and its new value (a falling value: amber + down arrow, reading). R19 shown DAMAGE on every weapon = the weapon's number × today's gate multiplier against an ARMOR-100 hull (E = 100 − own POWER); the backend, `effectiveStats`, the wire and PV 100 are UNCHANGED (Eric: *"If we keep the old math on the backend, that's fine"*). Build ordered: cycle 218, 0.19.12, on this branch; PR #329 is the story's PR. **R20 (2026-11-09, chat during the build, verbatim: *"the little dot indicators showing what tier my upgrades are on the left are fucking tiny as fuck. There is so much empty space. Fill it."*):** the index rows' tier pips become a five-bar ladder filling the row's right side (20×8 px bars), and the ship console fills its column — larger registers (index value 18, hull numeral 40, LV 22) and the row gaps grow to use the floor viewport's height rather than leave a hole.
- **R14 Order: prompt + candidate page NOW; the code build AFTER Eric's Stitch pass.** He runs Stitch and picks; the pick is reconciled with DESIGN.md (the standing rule); only then `/orchestrate` builds. Rejected: prompt first and candidates after; build from the candidates with Stitch in parallel.

## Boundaries & Constraints

**Always:** client-only unless a wire field is needed (the AC) — everything a console shows already rides `you` (`hp`, `turrets`, `launchers`, `racks`, `sec`, `ammo`, `repairReadyAt`, `smokeReadyAt`, `lvl`, `xp`, `pts`, `offer`, `rd`, `ib`, `cards`) and the roster / beacons on the schema; every register ≥ 9 px post-scale (epic-8 amendment 43); the perception invariant untouched (offers, reloads and stats are self-private already); DESIGN.md tokens only (phosphor, amber, silver, info, denied, storm-readout, the tier ramp, cyan own / red enemy relation linework); photosensitivity caps (glows breathe ≥ 2 s; the hull pulse and the ring urgency breath keep `settings.pulseCapHz` 1.1 Hz; 80 ms denied one-shots; ≤ 3 flashes/s per region) and the Story 4.8 attention tiers survive the redesign; no in-game copy unasked (labels already in the game may be reused: HULL, ARMOR, POWER, RELOAD, ENGINES, INTEL, RANGE, HDG, KTS, REDRAW, LV); no sentence on a HUD element; 1366×768 stays the floor viewport, 1920×1080 the reference; the UI-scale setting 90 / 100 / 125 still applies.

**Block If:** (R14 satisfied 2026-11-09 by R15 — the build may run) a design question the rulings R1–R19 do not answer surfaces mid-build — AskUserQuestion, never a default; any wire field turns out to be needed — ask before the PROTOCOL_VERSION bump; any HUD string not already in the game and not on Eric's yes list (the Stitch brief's reconciliation note) — AskUserQuestion, never a default.

**Never:** build the digit mount-select (R8); keep a combat lockout anywhere (R3); a level-up toast (R10); ship a bottom-center bar (R5 rejected it); an enemy HP bar or any enemy information on the consoles; a seventh perception exception; re-derive a stat outside `effectiveStats()` — the hover preview re-folds the real function with the card applied; a Vite dev build as a performance verdict; change a breathing rate or cap (`settings.pulseCapHz`, the hull ramp, the ring breath) — rates are Eric's, not this pass's.

</intent-contract>

## Code Map

- `client/src/render/hudBar.ts` (416) / `hud.ts` (596) / `hotbar.ts` / `hotbarSquares.ts` / `hotbarUnits.ts` / `hpGlobe.ts` / `helmGlobe.ts` / `xpStrip.ts` / `secHeat.ts` / `cooldownWipe.ts` / `keyChip.ts` / `slotTooltip.ts` -- the bottom-center bar and its members; the build retires or re-homes every one into the two consoles
- `client/src/ui/upgradeMenu.ts` (2026) / `refitCardFit.ts` / `refitTooltip.ts` / `tierRamp.ts` / `boonCopy.ts` -- the Tab refit band (lockout, latch, redraw, card face, hover rows); the offer group reuses the pure core (`offerView`, `pickableChoice`, `SpendLatch`, `redrawState`, `cardStatRows`) and replaces the band
- `client/src/ui/upgradeToast.ts` -- `pointToastLine` dies (R10); `boonFitToastLine` receipts: Eric's call at build
- `client/src/input/keyboard.ts` (Tab toggle :351, lockout :393–:729) / `mouse.ts` (`isLocked` :156/:247) -- lockout removed; Tab becomes a held modifier; digits 1–4 pick only with Tab held
- `client/src/render/attention.ts` / `flashBudget.ts` -- tiers and the flash budget: the consoles' channels must register here
- `client/src/ui/chromeBar.ts` / `killFeed.ts` -- restyled, same content (R13)
- `client/src/render/hullArt/{data,shapes,svgArt,pixiArt,palette}.ts` -- the own hull diagram for the weapons console (R6a) and the hull-outline gauge (R7)
- `client/src/render/equipmentIcons.ts` -- glyphs for every mount / weapon
- `client/src/config.ts` (`hudBar` :1807, `refit` :1973, `attention` :2172, `xpRail` :2335) -- the retired blocks and the new console blocks
- `shared/src/types.ts` `OwnShip` (:448) -- every field the consoles read; `shared/src/sim/stats.ts` `effectiveStats` -- the hover preview's fold
- `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` + `EXPERIENCE.md` -- the rows this pass rewrites at build (HUD Bar, Hotbar Slot, Cooldown Wipe, Bank Chip, XP Strip, Refit Card, Slot Tooltip, HP Globe, Helm Globe, BR Chrome Bar, Kill Feed, Toast, Redraw Button; the Tab rows of EXPERIENCE.md)

## Tasks & Acceptance

**THIS RUN — the design sitting (no build cycle, no version bump):**
- [ ] `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/stitch-prompt-battle-ui-2026-11-09.md` -- the Stitch brief: the problems (R1), tokens, the console layout (R5), the element inventory, the open dimensions stated as open (R4 / R6 / R7 / R12), one master prompt + three state variants (R11)
- [ ] `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/mockups/battle-ui-sitting-2026-11-09.html` -- the live candidate page: a 1920×1080 battle frame scaled to fit, the real hull art and glyph modules bundled in (esbuild, the 9.11 recipe), toggles for surface (R12) × offer corner (R4) × reload form (R6) × hull gauge (R7), four states (mid-fight · offer pending with two banked · hull < 25 % with reloads running · countdown with REDRAW), a hover on a card previewing the change (R9); published as a private artifact for Eric
- [ ] `_bmad-output/implementation-artifacts/epic-10-context-amendments.md` (#16) / `epic-10-context.md` / `deferred-work.md` (R8) / `sprint-status.yaml` / `gds-workflow-status.yaml` -- records and one-line stamps
- [ ] One PR to `development` carrying the sitting; the spec's status reads `blocked` on the design gate until Eric's Stitch pass

**THE BUILD — after Eric's pick (R14), under `/orchestrate`, its own cycle:**
- [ ] Reconcile the chosen design with DESIGN.md tokens; record the pick as the next amendment; close R4 / R6 / R7 / R12
- [ ] Ship console (left): hull gauge, six indices always on, engines / helm instruments, XP + level
- [ ] Weapons console (right): per-mount reloads in the chosen form, secondaries heat, Q/E/R readied state, C/V cooldowns, Shift
- [ ] Offer group in the chosen corner: compact cards, Tab+1..4 and click, no lockout, banked count, REDRAW at countdown, hover preview on the consoles
- [ ] Top row restyle; toast removal; attention tiers and the flash budget re-registered; retire the bar, globes, XP strip, refit band and their config blocks
- [ ] Tests on the pure cores (layout spines, pick routing under the Tab modifier, hover-preview fold equals `effectiveStats` with the card applied); DESIGN.md / EXPERIENCE.md rows rewritten with dated stamps; How-to-Play's Tab / refit sentences are 10.14's

**Acceptance Criteria (the build):**
- Given a banked level mid-fight, when the offer group is on screen, then the guns, Q/E/R, Shift, C/V and the helm all still work, and Tab+1 or a click on card 1 spends the level with no window opening.
- Given a hovered offer card, when the player reads the ship or weapons console, then every readout the card would change shows the incoming value, and the values equal `effectiveStats()` with that card applied.
- Given any viewport from 1366×768 up, when the consoles render, then no text register is below 9 px post-scale and nothing is drawn in the screen center except the water, the ship and world effects.
- Given a level-up at any time, when it lands, then no toast fires; the arrival of the card in the group is the only cue, and the banked count reads on the group.
- Given the countdown, when the level-zero offer arrives, then it shows in the same corner group with REDRAW beside it and the REDRAW pip reads the server's `rd`.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why a sitting before a build.** The AC says candidates are rendered and shown first; R2 widened the story to the whole HUD; R14 adds Eric's Stitch pass between. The 10.4 design sitting (amendment 7, PR #317) is the pattern: a docs-only PR, then the story's own build cycle.
- **The candidate page is a mock with real parts**, not the shipped HUD modules: the consoles do not exist yet, so the page draws them in SVG/DOM and bundles only what is real today — `hullArtSvg` (the own hull, cyan relation), `equipmentGlyphSvg` (every mount glyph), `CLIENT_CONFIG.colors` / `CONFIG.shipClasses.*.battery / launchers` (stations and counts).
- **Hover preview reading (R9):** the console readouts are driven by one view model `{ current, incoming? }`; the incoming value is derived by re-folding `effectiveStats` with the hovered card's line added, never by arithmetic on the displayed number.
- **Tab as a modifier** is a held chord in the keyboard chokepoint: Tab keydown sets the modifier, digits 1–4 route to the pick only while it is held; Tab alone does nothing; Tab is still `preventDefault`ed so focus never leaves the canvas.

## Verification

**Commands (this run):**
- `npm run check` -- expected: exit 0 (docs-only change; the gate still runs)
- `node_modules/.bin/esbuild` bundle of the page's module seam -- expected: builds, inlined, the page opens with no console errors and every toggle / state renders

**Manual checks:**
- The candidate page shows every open dimension (R4 four corners, R6 three forms, R7 gauges, R12 two surfaces) and the four states; every register ≥ 9 px at the 1366×768 frame; the center of the frame holds only water and the ship.

## Review Triage Log

- 2026-11-09, the sitting's gate (Fable Blind Hunter ×2 + Codex gpt-5.6-sol ×2, on the brief + spec and then on the candidate page): patch 13 (brief: grey on HUD text, RING CLOSES IN, real hover state, R6/R7 opened as explorations, twin turrets, toast kill, Shift generic, placeholder labels, game stat words; spec: pulse clause, copy gate, rate gate; page: game stat words DAMAGE / RANGE / BLAST RADIUS, three non-token colors, discrete outline bands, folded C/V cooldowns, helm needle, TAB token, 1:1 scale toggle, collision note), reject 6 (bands-as-identity, secondaries DMG 3, add-ons not gold, countdown Q/E/R empty, sparse countdown chrome bar — the real bar is hidden pre-live, click-must-pick on a mock), defer 0, intent_gap 0, bad_spec 0.

- 2026-11-09, the build's gate (Fable Blind Hunter BUILD-ON-IT, Fable Edge Case Hunter FIX-FIRST-small, Codex gpt-5.6-sol FIX-FIRST, on `git diff 47b3bfa1 HEAD -- client/src`): patch 5 (stats line measured at the counter-scale with hover marks; top-left dock of the offer group on short logical viewports, O15; hover re-armed after a rebuild; greyed cards inert on hover; latent guards ×4 folded in), defer 2 (ledger: a NaN `readyAt` reads as a frozen cooling button; NaN hp / pts prints — the server never sends them), reject 1 (Tab native under a focused overlay, O16), intent_gap 0, bad_spec 0. Severity: medium 2 (overflow, overlap), low 3.

- 2026-11-10, the follow-up's gate (cycle 220; Fable Blind Hunter FIX-FIRST on one ruling-level item, Codex gpt-5.6-sol FIX-FIRST, on `git diff 9691cc06 HEAD -- client/src`): patch 4 (the compact countdown bottom row when the wide one cannot clear the consoles at the 125 % tier; RIGHT / LEFT fall to the stack beside the weapons box instead of the bottom row; the TAB chip's 9 px floor; a stale alpha comment), defer 2 (ledger: `EXPANDED MINE RACKS` wraps to three lines on the narrow card — Eric's word; the RIGHT stack's two homes — Eric's veto), reject 2 (a fifth preview ring — no card takes a launcher past four tubes; a four-character ring numeral — tenths print only under 2 s), intent_gap 0, bad_spec 0.

## Auto Run Result

Status: in-review (follow-up, cycle 220, 0.19.14 — epic-10 amendment 19 (a)–(j): Eric's five staging fixes, his pick on the design page, no state word, 70 % beds, 10 px pips; RIGHT / LEFT / BOTTOM offer setting; the gate's four patches; smokes and `npm run check` per the PR)
Earlier: in-review — the design gate (R14) closed the same day with Eric's pick (R15–R20, amendment 17) and the build ran: cycle 218, 0.19.12, PV 100 unchanged (client-only). Waves W1–W3 under `/orchestrate` (Opus builders, Fable + Codex gate), gate patches landed; `npm run check` exit 0 (client 3814 tests); matchSmoke and weaponsSmoke PASS first try; PR #329 to `development` carries the sitting and the build. Eric merges; staging QA of the ship console, the weapons console, the offer group, Tab+1..4 and the hover preview is the gate before main. Open for his pen (ledger): the stale `GUN — ALWAYS SELECTED; CLICK ITS HOTBAR TILE` settings row; the dropped FIT flash / ACTIVATED pop; the airy 1366×768 ship-console gaps; the `RANGE` word on weapon rows; the top-left dock of the offer on short viewports (O15); REDRAW beside the header.
