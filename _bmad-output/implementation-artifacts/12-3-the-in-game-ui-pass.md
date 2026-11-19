---
baseline_commit: f905edc19602674e1b2be528b8c285916d135c39
---

# Story 12.3: The In-Game UI Pass

Status: in-progress

<!-- Created 2026-11-18 by gds-create-story from Eric's sitting in chat (epic-12 amendment 2). Part B (the HUD redesign) was designed 2026-11-19 in the same sitting and approved (epic-12 amendment 3): it is IN this story, built in the same cycle. -->

## Story

As a captain,
I want the ships, the brackets, the radar near my hull and my special-shell aim to read cleanly, and to be able to see how hurt each ship in sight is,
so that I can steer close in and pick smart targets, and read my whole ship from one bar.

Eric, 2026-11-18, verbatim (the sitting, `/gds-create-story 12-3` args): *"1) ships currently have cyan or red for their graphical linework, and I think I hate this. Change all the linework for all ships to black. | 2) the square brackets that we added around ships when zoomed out should be applied to all ships at all zoom levels whenever they are in visible sight. | 3) After removing the 12ths ladder the radar returns no longer get a decreased alpha as they approach close to one's ship, this needs to be investigated/fixed because it is making it difficult to know where to steer in close proximity to my ship. | 4) I'd like the player's name to never be bigger (sizewize/horizontally) than the square brackets from, so i'd like to scale the text to that. Between the name and the brackets, i'd like a smaller line of text that says the ship's condition … | 5) Special Shell effect area needs to be shown around my targeting cursor while I am aiming it. ||| Lets attack those first and then discuss the HUD."*

He then reworked item 4 in chat: *"I want **some** indicator of the enemy ship's relative health in addition to the smoke and fire, so that I can make smart target selection decisions."* He picked **A2, a segmented bar** (*"Segmented bar is smart"*), *"80px cap. Still A2. Give the name, the boxes, and the brackets a **slight** glow in their color."* He then ruled the name minimum (*"I want to see the names always but the smallest it can be is a 4x8 size"*, then *"5x7 font minimum?"* → *"I like it"*) and the line color (*"Instead of flat black, how about dark gray? Say, #212121?"*). **Approved** (*"This is correct. Approved."*): the bench page https://claude.ai/artifact/4W7YtZfCvKp5nBpmP9VsLx **v13** (v12 approved; v13 adds one name size per zoom): one zoomable scene, only the picked look. Its reference code is `ship()` / `bar()` / `bracket()` / `fitName()` / `pixelText()` / the `PIX` 5×7 glyph table on that page.

Correction of record (Eric): *"Every hull has 1000 HP and that's all the HP anyone has ever. Armor is the only mechanic behind which you get tougher, but that is Effective HP, not an actual boost to max HP."* So the bar is hull points out of 1,000. There is no "percent vs absolute" question.

## Scope

- **Part A, this build (ruled and approved on the bench):** items 1–5 below.
- **Part B, the HUD redesign (ruled and approved 2026-11-19):** one vertical HUD bar. Eric: *"Part B isn't going to be a separate story. We need to design it now."* Approved on the bench https://claude.ai/artifact/4So2VtjHDTBjCciXs37qYx **v2** (*"This is the HUD."*). Built in the same cycle and PR as Part A. DESIGN.md is rewritten to it in that PR.
- **Zoom / panning:** Eric listed no zoom or panning tweak at the sitting, so none is built. Item 2 changes the brackets, not the camera.
- **Deferred radar stories 11.4 / 11.10 stay deferred** (epic-12 amendment 1(e)). Item 3 is a regression fix, not a revival.

## Acceptance Criteria

### 1. Dark-gray hull linework

1. Every line of every ship's hull art draws in dark gray **#212121** (a new token, e.g. `CLIENT_CONFIG.colors.hullLine` 0x212121; Eric changed it from flat black), on your own hull and on every other hull alike. That covers the bold outline, the deck lines, the turrets and barrels, and the torpedo launchers: everything `deckContext` / `outlineContext` / `turretContext` / `launcherContext` (`client/src/render/hullArt/pixiArt.ts`) strokes. Fills stay the hull's skin (`CLIENT_CONFIG.skins`), unchanged.
2. The relation colors (own cyan 0x00e8ff, enemy red 0xff2a2a) are **kept** on the corner brackets and the names (Eric: "Keep cyan own / red enemy"). They also stay unchanged on wakes, the kill feed, results, buoy markers and contact FX: Eric named only hull linework. `relationStroke` keeps its meaning. The hull simply stops reading it for its lines.
3. The same dark-gray line rule applies wherever the game draws a ship's hull art: in a match, the home-screen ambient scene (`ambient.ts`), and the DOM SVG hull art (`hullArt/svgArt.ts`, used by `ui/home.ts` and `ui/classSelect.ts`). **Reading of record, for Eric's veto:** "all the linework for all ships" is taken literally, so the menus change too.
4. `FALLBACK_STYLE` (amber hollow outline for a roster miss) is unchanged.

### 2. Brackets on every ship in sight, at every zoom

5. Your own hull and every in-sight hull are framed by the corner brackets at **every** zoom. The zoom-out fade (`bracketAlpha` / `bracketThresholdPx` / `bandFrac` for brackets) is gone. A radar paint never gets a bracket (unchanged).
6. The bracket **frames the whole hull**. Half-size = `max(bracketHalfPx 16, onScreenHullLength / 2 + 4)` px, so zoomed out it stays today's 32 px square and zoomed in it grows with the hull. It stays axis-aligned and centered on the hull, never turns with it, and keeps a 1.5 px line. Tick arms grow with it: `max(6, 0.22 × half)` px, capped at `half` (the bench's rule).
7. The bracket wears the hull's own alpha (sight fade, sinking settle, rain dissolve), as today.

### 3. Near-ship radar fade restored (fix (a), Eric)

8. The near-range dim on the radar comes back as it was before 11.2. On a clear bearing, returns sit at `minScale` 0.2 out to `innerU` (500 u ≈ 22 hm) and ramp linearly to full at `outerU` (750 u ≈ 33 hm). These are the absolute sizes epic-11 amendment 4(m) kept.
9. The rain/smoke lift (amendment 210: a bearing whose eye ends short unmutes the dim) is kept, but measured against the dim ramp itself instead of the full sight reach. `dimSlideU` becomes `max(0, innerU − reachU) × fogLift`, where `innerU` = `dimRadii(sightU).innerU` (`client/src/render/radarDim.ts`). A bearing whose eye reaches past `innerU` gets the full radial fade. **Optional, recommended:** cast the reach fan (`Radar.castReach`, `radar.ts:1272`) only out to `innerU` (≈ 9× cheaper).
10. This is client-only. `frames.ts`, `shared`, the paint path and `radarFalloff.ts` do not change, and no range-rung comparison appears on the paint path.

### 4. Name fitted to the bracket + the hull health bar (A2)

11. **Stacking order, top to bottom:** name, then health bar, then the bracket's top edge. The bar sits 3 px above the bracket and the name's baseline 4 px above the bar.
12. **Name size: always shown, and every name at a given zoom is the SAME size** (Eric: *"At the same zoom level, all names should be in the same font size"*). The size depends on the zoom only, never on the name: hud-micro mono at `min(14 px, the size at which a 14-character tracked uppercase name, NAME_MAX, fits the bracket width 2 × half)`. Brackets are the same size for every hull at one zoom (all hulls share one length). When that size would drop below **9 px**, every name switches together to a **5×7 pixel font** (5×7 glyph in a 6×8 cell, 1 px gaps, one screen px per font pixel, centered, no smoothing). **That is the floor:** the name never gets smaller and **never hides**. At the floor it may be wider than the bracket (a 14-letter name is 83 px). Eric ruled names always visible, with "no smaller than 5×7" winning over "never wider than the bracket" (the bench v13 is the look). The 14-character `NAME_MAX` cap and mid-ellipsis (`plateText`) are unchanged. Names keep the relation color's text-safe variant (`plateColor`).
    - **Glyph coverage (reading of record, for Eric's veto):** the 5×7 table covers A–Z, 0–9, `_`, `-`, space (the bench's `PIX` table; add `.` and `'` if cheap). Accented letters fold to their base letter (NFD, strip combining marks). A name that still holds a character outside the table (emoji, CJK, …) is drawn in the hud-micro mono at the 9 px floor instead (also allowed to be wider than the bracket). Callsigns allow any non-control text (`sanitizeName`, `ui/home.ts:140`).
13. **The bar: 4 blocks.** It is `min(2 × half, 80)` px wide (Eric's 80 px cap) and centered on the hull. It is 4 px tall with 2 px gaps between blocks. The bar **stays visible when the name is hidden** (shown on the bench at the zoomed-out panel, which Eric approved).
14. **Block count** from hull fraction `f = hp / maxHp` (maxHp is always 1000): `blocks = min(4, floor(4f) + 1)` while afloat. That gives 4 at ≥ 75 %, 3 at ≥ 50 %, 2 at ≥ 25 %, and 1 below 25 %. **The steps land exactly where wounded smoke and fire change** (`CONFIG.damageBands` amberBelow 0.5 / criticalBelow 0.25, both "frac < x"), so the bar drops to 2 the instant smoke starts and to 1 the instant fire starts. *(Reading of record for Eric's veto: the bench text said "rounded up", which differs only at exactly 750 / 500 / 250 hp. This rule matches the smoke's own thresholds instead.)*
15. **A2 colors.** Filled blocks are pale while healthy (4 or 3 blocks; bench `#d8e0e4`), **amber** at 2 (`CLIENT_CONFIG.colors.amber` 0xffb800), and **bright red** at 1 (bench `#ff4b3e`, a new client color token). Lost blocks are 1 px pale outlines at 0.3 alpha. The bar wears the hull's alpha, like the bracket.
16. **Slight glow** (Eric): the name (both fonts), the filled blocks and the brackets each get a soft glow in their **own** color, about 4 px of blur (the bench's `shadowBlur 4`). It is a client knob in `CLIENT_CONFIG` and never pulses. Lost-block outlines do not glow.
17. **Shown on every ship in sight**, yours included (Eric: "All ships in sight"). Your own count comes from `OwnShip.hp`, already on the wire. An enemy's count comes from the new contact field below.
18. **The wire.** The health step is appended **last and optional** on the sighted `Contact` row (`shared/src/types.ts`, after `lu`), for example `hb?: 1 | 2 | 3 | 4`, computed server-side by one pure shared function (e.g. `hullBlocks(hp, maxHp)` in `shared/src/sim`, its block count `4` in `CONFIG`). It rides that row and therefore **that row's own visibility gate** (sight at class reach): never a radar paint, never the anonymous plain/fog channels, never any event. **Not a seventh exception** (the `tu` / `lu` precedent). The perception invariant tests are extended to assert it never reaches a client outside the contact row's gate. No exact hp, fraction or damage amount ever rides the wire.
19. **This reverses an old rule on purpose.** Epic-4 amendment 41 ("two named conditions is a state, not a number") and the `signals.ts` comment "Enemy hp … stay hidden" are superseded **for sighted hulls only**, by Eric 2026-11-18 (epic-12 amendment 2). Wounded smoke (`sm`) is unchanged in shape, reach and tiers. Update those source comments in the same PR.
20. **`PROTOCOL_VERSION` bumps** (110 → next; the number is taken at PR time).
21. **Bots are unchanged.** They do not read the new field: no bot behavior was ruled.

### 5. Special-shell area while aiming

22. **Reproduce first** (memory: reproduce before contradicting). A special-shell area preview already exists. `computeAimPreview` (`client/src/render/aimPreview.ts:684-707`) has rows for the star, phosphor, fouling and flash shells, drawn in the quiet EFFECT register (`effectAlpha` 0.22, `effectFillAlpha` 0.03; phosphor at damage weight 0.4 / 0.05). On your own dev server in the worktree, prime `R` with each special shell and record whether the circle draws, where, and how visible it is. Candidate causes: it is too faint to see; it is not drawn (the `legal` flag, the primed id, or a hotbar / Tab path not feeding `renderAimPreview`, `main.ts:3906`); or it sits at the reach-clamped burst point rather than at the cursor.
23. **After the fix,** while a special shell is primed and you are aiming, its effect area (the radius the shell will actually cover: `effectiveLitRadius`, `phosphorShells.zoneRadius`, `foulingShell.radius`, `dazzleShells.radius`) is clearly visible around the aim point in AIM COLOR (`aimTint`). The preview stays the shot's own geometry: when the cursor is past reach, the circle sits where the shell will really burst, since the aim-preview truth rule is unchanged. If the fix is "more visible", the new alpha / weight is a `CLIENT_CONFIG.aimPreview` knob. **Show Eric the before/after on a rendered page before committing a new look** (memory: show visual proposals first). If reproduction shows the cursor-vs-burst-point distinction is what he means, stop and ask.

### Cross-cutting

24. Readable values stay ≥ 13 px at 1080p wherever a rule above does not set the size itself. The fitted name is Eric's explicit exception, with its own 9 px floor. No in-game copy is added. The bar carries no words.
25. DESIGN.md (`_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md`) is updated in the same PR, editing only what these rulings change:
    - the **Corner Brackets** row (:328): every zoom, frames the hull, glow;
    - the **Nameplate** row (:317): fitted to the bracket, 9 px floor, glow;
    - a new **Hull Health Bar** row;
    - the relation-linework notes (:80, :228): hull lines dark gray #212121, brackets and names keep cyan / red.
26. How-to-Play copy is Eric's. Do not add a health-bar sentence.


## Part B: The HUD Bar (Eric 2026-11-19, epic-12 amendment 3)

Eric's brief, verbatim: *"A single, vertical HUD bar at the left or right side of the screen (user's choice). At the top are my weapons, their upgrade tier, and how many shots they have available. The dot with cooldown is fine, but I'd like something a bit clearly. Maybe the main gun gets 3 or 4 bullet icons (but they behave the same way, filling up with a number countdown). Maybe the torpedo gets 4 torpedo icons, all greyed out, displayed in two "sets" of two, and as the player unlocks torpedoes these open up? Mines maybe need up to 8 individual mine icons, and we can keep the circles as their rack cooldown indicators. I want the abilities below that. And I want the ship stat upgrade tiers below that. I don't want to see weapon stats at all times. If I hover the mouse over the button, then it will open up a little thing to the side that shows the stats. If I hover over an upgrade card, taht little thing to the side will open up and show the changes. Upgrade cards should open along the bottom, they need to stand out against the ocean better. Game chrome remains on top."*

Rulings that followed, verbatim:
- *"Heading is now in the HUD directly as a line and indicator on the chart/radar display. I only need a throttle indicator, which can be a vertical thing with detents."*
- *"Maybe its 3 bars next to each other... vertical. HP, Throttle, XP?"*
- *"B - tiles. Position (left or right) should be user-selectable in options, and the "center" (for the purposes of jumping back to my ship when I hit space) should shift accordingly."*
- *"None of the cooldown icons should **ever** shift in position for **any** reason. So mine racks need to have both racks with 4 slots (for naval/fouling) and 2 slots (for captive), with one rack and one slot each empty like the torpedpoes have."*
- *"Star Shells only EVER have 1 shot. EVER. It doesn't need a "shell" graphic like the others have. More of a bar like Hull Repair or the one under Secondaries"*
- *"The ship numbers (on the 100 point index) ought to go in that space between the skill name and the 5 pips, and lets not open boxes on hover for those."*

The bench's sizes, colors and type are the reference look. Its numbers (damage, reloads, index values) are **samples**: every value on screen comes from the real stats.

### Acceptance Criteria (Part B)

27. **One vertical HUD bar replaces both consoles.** It replaces the left ship console (HULL, index rows, HELM, LEVEL) and the right weapons console with ability buttons (Story 10.10, `client/src/render/console/*`). Style **B, tiles**:
    - The bar is **300 px wide** at the 1080p reference. Each section (WEAPONS, ABILITIES, SHIP, and the gauge footer) sits on its own bed (cardScrim .78, 1 px hairline).
    - Each weapon and ability is a tile with today's state outline: silver .45 while cooling, phosphor .65 + glow while ready, and the armed / denied outlines as today.
    - Top to bottom: WEAPONS, ABILITIES, SHIP, then the footer pinned to the bottom.
    - The bar runs from **132 px** below the top (clear of the kill feed, on both sides) to **18 px** above the bottom.
    - The HUD scale clamp is unchanged (`config.ts:2361`).
    - Section heads are 13 px; names 14 / 600; key chips 12 / 600; values 15 to 17 / 600.
28. **Side is a player setting.** A new options setting places the bar on the **left or right** (default: left, a reading of record). **Space-home shifts with it:** `camera.home()` (Space) puts your hull at the centre of the open water beside the bar, not the screen centre. That means half the bar width + edge, offset toward the open side, in the follow camera's centre. The setting persists like the other settings (`settings/store.ts`).
29. **Weapons.** Each row: name, tier numeral (tier-ramp color), key chip (LMB / RMB / Q / E / R). Below that, the shots, as follows:
    - **MAIN BATTERY:** one shell icon per turret, 3 or 4 by hull (fixed for the match). A turret that has fired shows its icon empty and **filling from the bottom** with the seconds countdown inside: tenths under 2 s, whole seconds above, today's rule. When full, it is solid phosphor.
    - **SECONDARIES:** today's heat bar (silver outline, phosphor fill).
    - **TORPEDO:** **always 4 torpedo icons in two pairs**, fore launcher and aft launcher. Locked tubes are dashed gray, in place. Unlocked tubes fill with a countdown like the shells.
    - **MINES:** **always two racks**, each a rack cooldown circle (today's wedge ring with the seconds) followed by its fixed slots: **4 per rack for naval / fouling, 2 per rack for captive**. A locked rack and locked slots stay in place, dashed gray. A held mine is a filled mine icon; an empty slot in an unlocked rack is a muted outline.
    - **SPECIAL SHELL:** **one shot, always**. No shell icons: a single refill bar like the secondaries'. READY or the seconds sit on the name line.
30. **No cooldown icon ever moves.** For a given hull and mine kind, every icon (shells, tubes, racks, slots) holds the same screen position through every unlock, tier, reload and state. Locked means a dashed outline in place, never removed. (Bench check: identical positions across every rack and tube combination.) The two-digit countdown wears a dark outline so it reads over the icon edge.
31. **Abilities.** One tile per ability: HULL REPAIR (C), SMOKE (V), the fitted Shift (SHIFT). Each shows name, READY or the seconds, the key chip, and a thin progress line along the bottom while cooling. The active (Shift window) outline is as today.
32. **Ship.** One row per index stat: ARMOR · POWER · RELOAD · ENGINES · INTEL. Each shows its name, its **100-point index value** (17 / 600 phosphor) **between the name and the 5 pips**, and today's five-bar tier ladder. **Hovering a ship row opens nothing.**
33. **Footer: three vertical gauges side by side.**
    - **HULL:** 10 segments filled from the bottom in the hull band color (phosphor ≥ 50 %, amber ≥ 25 %, red below), with the whole-number percent under it.
    - **THROTTLE:** a vertical nine-detent ladder, ahead on top, using today's detents (`helm.ts` `DETENT_LABELS`). STOP is longer and brighter. Labels FULL / ½ / STOP / ½ / FULL, because 13 px labels on all nine collide. A box marks the ordered detent and an arrow marks actual speed. The word under it reads e.g. `¾ AHEAD`, `STOP`, `½ ASTERN`.
    - **LEVEL:** an XP track filling toward the next level, with `LV n` under it.
    - **Gone from the HUD:** HDG and KTS (heading lives on the radar display), the rudder track, and the W / S / A / D coach marks. *(Reading of record, from "I only need a throttle indicator", for Eric's veto.)*
34. **Weapon and ability stats are not on screen at all times.** Hovering a weapon or ability tile opens a **flyout beside the bar** (toward the open water, level with the row). It shows the stat lines today's cells print always (`readouts.ts:228-253`: DAMAGE vs ARMOR 100, RANGE, RELOAD, SPEED, HOMING, radius…). It closes when the pointer leaves.
35. **Upgrade cards along the bottom.**
    - The offer group always sits **along the bottom**, centered in the open water beside the bar, over a dark band (cardScrim gradient, about 170 px). The `offerPos` setting (R26: right / left / bottom) is **retired**.
    - Cards are bigger and stand out: **236 × 88**, an opaque panel, a **2 px border in the granted tier's color** (gold for a one-off) with an outer + inner glow, and on hover a stronger glow plus a 3 px lift. The face keeps name, tier mark, and the TAB│n chip.
    - The header reads `n LEVELS` and `TAB + 1–4`. Picking is unchanged (click, or Tab + 1–4).
36. **Hovering an upgrade card shows the change.**
    - **Weapon or ability card:** outlines the affected tile in amber and opens the flyout beside it with the changes as amber `old → new ▲`. Slots it would open (a tube, a rack, a rack slot) show as amber outlines in place.
    - **Ship-stat card:** changes the row itself (the value turns amber `new▲`, and the new pip gets an amber outline), with **no box**.
37. **Game chrome stays on top, unchanged:** the chrome bar top centre, the kill feed top right, the storm and respawn banners.
38. **DESIGN.md** is rewritten for the HUD in the build PR: the console rows (:173-175, :351-353, already stale), the Refit Card row, and the offer group. The rewrite describes this bar as built. It is minimal everywhere else.
39. **No in-game copy added.** Every word on the bar is an existing label. ≥ 13 px everywhere except the 12 px key chips and tier numerals (today's register).

## Tasks / Subtasks

- [ ] **T0 Setup.** `npm install --include=dev && npm run build -w shared` in the worktree. Fetch `origin/development` and merge it in before starting (parallel-cycle collisions).
- [ ] **T1 Dark-gray linework** (AC 1–4)
  - [ ] Hull art takes dark gray #212121 for its line color: `ShipView.setColors` / contacts.ts:310-322 / main.ts:2287 / ambient.ts:311 still pass the relation style, but the stroke handed to `deckContext`/`outlineContext`/`turretContext`/`launcherContext` is the `hullLine` token. Prefer one seam, a `hullLineColor()` in `relationColor.ts`, over editing every call site.
  - [ ] `svgArt.ts:129` line color goes to the `hullLine` token.
  - [ ] `ShipView.bracketSource` must still hand the brackets the **relation** color, not the hull's dark-gray stroke. Today `out.color = this.style.stroke`, so split the two.
  - [ ] Update `relationColor.ts` / `ships.ts` / `palette.ts` header comments; re-record golden frames with dated notes.
- [ ] **T2 Brackets everywhere** (AC 5–7). In `brackets.ts` + `chartMarks.ts`: drop the bracket alpha band, size the half-box per hull per frame (the pooled Graphics is drawn once in white px units, so draw it per size or scale only the tick geometry; mind the "ONE POOL, NO RE-STROKE" note), and grow the ticks. `bandAlpha` stays for pegs and icons if they use it.
- [ ] **T3 Radar near fade** (AC 8–10). `dimSlideU` against `innerU`; optional fan cast to `innerU`. Update `dimFogSlide.test.ts` and the `dimWedge` tests. Add a regression test: a rain fan whose reach ends at 3,000 u still yields the full radial 0.2 → 1 ramp.
- [ ] **T4 Wire + shared** (AC 14, 18–20). Pure `hullBlocks()` in shared (unit-tested at the exact 750/500/250 boundaries, plus 1000, 1 and 0), `CONFIG` block count, `Contact.hb` appended last, filled in `signals.ts`'s contact row, invariant tests extended, PV bump, and the barrel export.
- [ ] **T5 Plate + bar** (AC 11–17). Extend `NameplateLayer` (or add a sibling `HullBars` pool on the plate layer) to fit the name to the bracket width per frame. Pixi re-rasterizes Text on a style change, so quantize the font size (e.g. 0.5 px steps) and only write on change. Below 9 px, switch to the 5×7 pixel font. Put the glyph table + layout in a pure module (e.g. `render/pixelFont.ts`, unit-tested: widths, fold, fallback). Build each name's pixel texture ONCE at latch, NEAREST scale mode, never per frame. Then draw the A2 bar and the glow. Glow: Text via a zero-distance `dropShadow` (blur ≈ 4, own color); Graphics (brackets, blocks) via the drops.ts precedent of wider, low-alpha strokes underneath. No per-object filters.
- [ ] **T6 Special-shell preview** (AC 22–23). Reproduce, diagnose, render the before/after for Eric, then fix.
- [ ] **T9 The HUD bar** (AC 27–39). Replace `render/console/*` (layout spine, `shipConsole.ts`, `weaponsConsole.ts`) with the bar. Keep the pure readout model (`readouts.ts`) as the data source and re-point it at the bar + flyout.
  - Icons are pure geometry functions (unit-tested) drawn into fixed slot positions computed from the hull + mine kind, never from current counts.
  - Add the HUD-side setting and the Space-home offset (`camera.ts` `home()`).
  - Retire `offerPos`; re-lay the offer group (`ui/offerGroup.ts`) along the bottom with the new card look.
  - The flyout is DOM chrome (like the offer group) or Pixi: dev's choice, but it must never steal input from the canvas beyond its own box.
  - Show Eric the built bar on a rendered page or staging before the PR opens (no PR while a look waits on his yes).
- [ ] **T7 Docs + records.** DESIGN.md rows (AC 25); epic-12 amendment(s) for any build-time readings; `spec-12-3-*.md` cycle record; ONE-LINE stamps in both trackers; VERSION / package.json +1 patch (numbers at PR time).
- [ ] **T8 Gate.** `npm run lint` explicitly, then `npm run check`. Run the headless smokes (`matchSmoke`, `weaponsSmoke`) on your own booted server with `HC_DEV_OPTIONS=1`, then kill both the PID and its tsx child. Run `tickCost.mjs` old vs new: a contact-row field adds per-tick work (memory: full-match tick cost before merge). Every test run has a hard wall-clock bound.

## Dev Notes

### Current state of the files this story touches

- **`client/src/render/relationColor.ts`**: the one place own/enemy color lives. `relationStyle(r)` returns `{stroke, fill}`, and today that stroke is used as the hull line color AND the bracket and plate color. That shared use is the seam to split.
- **`client/src/render/ships.ts`** (499 LOC, near the cap): `ShipView.setColors(stroke, fill)` rebuilds the shared `GraphicsContext`s keyed by `(hull, lineColor)` (`pixiArt.ts` `cached(...)`). With one line color for every hull, all views share ONE context set per hull, which is fewer contexts than today. `bracketSource()` (:477) reports the pose, length, color and alpha.
- **`client/src/render/brackets.ts`**: `HullBrackets` pools Graphics drawn ONCE at 16 px half / 6 px ticks in white and tinted per frame. A variable size breaks the "draw once" assumption. Options: one pooled Graphics per bracket re-drawn only when its quantized half changes, or four tick Graphics positioned per frame. Keep it cheap: a zoom-in frame with 16 hulls must not re-tessellate every frame.
- **`client/src/render/chartMarks.ts`**: `bracketAlpha` (:41) is the fade being removed; `screenScale(zoom)` gives px scale in the camera-transformed chart layer.
- **`client/src/render/nameplates.ts`**: screen-space `Text` per hull, latched once (text and color), then position and alpha per frame. `PLATE_FONT_PX` is a constant 14 today; per-frame fit means a font-size write, so diff and quantize it. `plateScreenY` floats the plate above the hull's bounding circle. The new layout floats it above the **bracket's** top edge instead (half px).
- **`client/src/render/radarDim.ts`**: `dimRadii` (:60), `dimScaleAt` (:80), `dimSlideU` (:106). **Root cause (verified):** `sightU` here is `eyeHoleRadiusU` ≈ 4,545 u since 11.2 (`radar.ts:537`). Rain is on all match (`canRain`, `shared/src/sim/fog.ts:293`), so any bearing whose eye ends inside ~3,795 u slides the whole 500→750 u ramp off the disc, and `dimWedge` bakes that wedge fully opaque. It was a side effect of a88b3851 (11.2 wave 2), not a ruling: amendment 4(m) explicitly kept the dim's absolute sizes. Config: `client/src/config.ts` ~3476-3539 (`fogLift: 1`, `FEEL_SIGHT_U = 500` at :512).
- **`server/src/game/signals.ts`**: the contact row (the visibility-gated sighted-hull row that carries `tu`/`lu`) gets `hb`. The self-private gate comment at :1985-1995 names enemy hp as hidden; amend it.
- **`shared/src/types.ts`** `Contact` (:751-800): append `hb` after `lu`. msgpack key order is load-bearing.
- **`client/src/render/aimPreview.ts`**: `SINGLE_ID_PREVIEWS` (:699) has all four special shells; `shellPreview` draws the circle only when `burstRadius > 0`; `overLand: true` since epic-11 amendment 8. Wiring: `renderAimPreview` (`main.ts:3906-3932`) gets `primedId` and `legal`.
- **Smoke and fire** (`render/smoke.ts`, `render/fire.ts`): anonymous `{k:'sm',x,y,tier}` pulses, tiers from `CONFIG.damageBands`. Untouched. The bar is designed to agree with them.

### Must preserve

- The six perception exceptions (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`) + the jamming-buoy fakes carve-out: unchanged. `hb` is a contact-row field.
- Nameplates sit above terrain and every hull, below the reticle (DESIGN.md:287); a contact's plate under thick paint is hidden outright. The bar follows the plate's visibility and alpha.
- The own hull is never rain-dissolved; spectator frames are unfogged (they will carry `hb` on every contact, which is consistent with spectators seeing `dmg`).
- Motion-off removes motion, never information: the glow is static, and the bar shows at every motion setting.
- Golden frames re-recorded with dated notes, never silently.

### Architecture compliance

- `shared` stays pure: `hullBlocks` is a pure function over plain numbers, and the block count lives in `CONFIG` (gameplay-load-bearing: it is how much enemy health crosses the wire).
- Client feel knobs (glow px, bar px / gap / cap 80, name floor 9, bar colors, tick growth 0.22) go in `CLIENT_CONFIG` (`chartMarks` or a new `hullBar` block).
- ESLint `complexity ≤ 10` is an error; `ships.ts` and `main.ts` are already large, so put new logic in its own module (e.g. `render/hullBars.ts`).
- Render modules never drive net or sim; `state.ts` stays a leaf.

### Testing (Eric's pyramid, functional style)

- **Unit:** `hullBlocks` boundaries; bracket half / tick sizing as a pure function of hull length × zoom; the zoom-only name size (two names of different length at one zoom get the same size) + the 9 px → 5×7 switch; the pixel-font layout (cell width 6, accent fold, unsupported-char fallback); bar width cap; A2 color per block count; `dimSlideU` against `innerU`.
- **Integration:** perception invariants (`hb` only on the sighted contact row); the contact-row encoder carries `hb` for a sighted hull at each step.
- **No tests that pin Eric's numbers as intent** (memory: no intent tests, no word-police, no coincidence pins). Test that the mechanism follows the CONFIG / CLIENT_CONFIG value.
- Smokes e2e as in T8.

### References

- Sitting + rulings: this conversation, recorded as epic-12 amendment 2 (`_bmad-output/implementation-artifacts/epic-12-context-amendments.md`).
- Bench (approved look): https://claude.ai/artifact/4W7YtZfCvKp5nBpmP9VsLx v13.
- Story 11.8 brackets: epic-11 amendment 14; `spec-11-8-the-free-camera.md`.
- Story 11.2 radar dim keep: epic-11 amendment 4(m); `spec-11-2-the-hectometer-ruler-and-real-reach.md`.
- Amendment 210 (rain/smoke unmutes the dim): epic-9 amendments; commit fbaa0bb7.
- Wounded smoke: epic-4 amendments 40-47 (41 superseded for sighted hulls); fire: cycle 162.
- Relation color: Story 10.4, epic-10 amendment 9 / 7(m).
- Aim preview special shells: Stories 8.17, 9.4, 10.9; epic-11 amendment 8.

### Project Context Rules (from `_bmad-output/project-context.md` + CLAUDE.md)

- Branch from `development`; PR targets `development`; ONE PR at the end; commit and push continuously. Never merge unasked.
- **No PR opens while a rendered candidate is waiting on Eric's yes**: AC 23's before/after needs his yes first.
- Amendment / cycle / version numbers are taken at PR time after `git fetch`.
- `epic-N-context-amendments.md` is append-only.
- The merge step stamps the story row `done` in both trackers (one-line stamps only).
- Full-match tick cost (`tickCost.mjs`) old vs new in the PR body for a contact-row change.
- Mute every test browser; bound every test run with a wall-clock kill.
- Never edit CLAUDE.md.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed: comprehensive developer guide created (Part A). Part B, the HUD redesign, awaits its sitting.

### File List
