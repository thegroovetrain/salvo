---
title: 'Story 9.11: Alerts on the Water and One Row'
type: 'feature'
created: '2026-10-16'
status: 'in-progress'
baseline_revision: '9c32018c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-10-fog-banks.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The 9.2 two-row HUD stack eats the bottom of the screen; mines and hazard zones whisper whose they are in the owner's personal hue instead of shouting WARNING; the phosphor burn zone is a crimson disc that does not read as fire (Eric 2026-10-14, epic-9 amendments 151–154).

**Approach:** Client only, no wire change. (1) The bar returns to the Story 8.6 ONE-ROW geometry of commit 35650906 with the framed belt widened to six squares; the results LOADOUT twin follows. (2) Mines and the three zone kinds leave the hue family for one ALERT rule: own = white, any other's = a yellow→orange blend on one shared 1 Hz integrated phase. (3) The burn zone's body is white fire built from `render/fire.ts`'s pure tongues. Every visual is judged by Eric on ONE live rendered page bundling the real drawing code before anything is committed (Eric 2026-10-16, this run's AskUserQuestion).

## Eric's rulings for this story (2026-10-16, AskUserQuestion in this run — the spec step; recorded as epic-9 amendment 180)

- (a) **Bar:** literal 8.6 — weapons left (five 54 px squares, 8 px gap), FRAMED belt right (44 px squares, 6 px gap, 8/8/6 padding, 22 px icons, 16 px / 10 px badge), globes 104, globe gap 16; the frame holds SIX squares. Bar width 868, height 136. Globe-coupled type goes back with the globes (`type.hull` 21 → 18, `type.wipe` 16 → 18).
- (b) **Own mine rings go white too**: the whole own-mine sprite (glyph + blast + trigger rings) is white; dashed/dotted styles still tell the rings apart. The glyph box is drawn at 1.1 × `CONFIG.mine.hitRadiusU` (11 u); the 10 u hit disc is NOT touched.
- (c) **Cadence:** 1 Hz, SMOOTH blend yellow → orange → yellow (a sine mix, never a hard switch); one phase shared by enemy mines and others' zone rings.
- (d) **Zone fill and foul net FOLLOW THE RING** (own: white fill / white net; others': blend with the ring). The foul weed is unchanged.
- (e) **Fire coverage:** tongues scattered across the WHOLE disc, denser toward the middle; the ring marks the edge.
- (f) **Warning colors:** three yellow/orange candidate pairs on the page beside the storm amber and the denied red; Eric picks there (→ amendment 181).
- (g) **Motion off:** the blend stops and the thing sits at ORANGE ("Okay, that's fine").
- (h) **Gate:** ONE live page from the real functions, then the run PAUSES for Eric's picks; implement, then PR.

## Boundaries & Constraints

**Always:**
- `hudBarLayout` stays pure (screenW, screenH) → layout and is re-pinned; `squares`/`chips` indexed by LOADOUT SLOT (0 gun, 1 boost, 2–4 Q/E/R, 5–10 the six consumables); `dimGroups` = [weapon run, belt frame].
- Everything added after 35650906 that is not geometry SURVIVES: keys 1–6 and `CONSUMABLE_SLOTS` (9.2), the zero-stock dashed state and greyed capped consumable, ACTIVATED outranks zeroStock, the glow BlurFilter layer (cycle 173, `glowBlurPx`), the fit pulse on that layer, the LOADOUT ladder lines of 9.6–9.9 (ARMOR, ARMOR PIERCING, dashes at zero).
- The alert blend is ONE pure module, rate `ALERT_HZ = Math.min(1, CLIENT_CONFIG.settings.pulseCapHz)` (the chromeBar 1 Hz precedent), phase INTEGRATED per frame with a 0.5 s dt clamp (the hud.ts / burnZones idiom), swing scaled by `motionIntensity` so off = steady orange, reduced = half swing; it is a breathing channel under `pulseCapHz`, exempt from `flashBudget` by construction (never route it through the budget).
- Presence, position, kind, extent are information and never motion-gated (epic-4 amendment 49 law); only the color blend, the flame flicker move.
- Mines keep their layers (own → `mineChart` fog-immune, enemy → `mineWorld`) and `MineView.own` from the server; zones decide own by `z.by === ownId`; a spectator (no own id) owns nothing (the `ownActiveZones` precedent).
- Fire tongues are seeded from the zone id (`mulberry32(hashSeedText(id))`, the `weedStrokes` √u scatter) so every observer sees the same fire; geometry drawn ONCE; per-frame only alpha/scale on `flameFlicker` with a per-tongue phase; the flame uses `colors.white`; density by area with a hard cap.
- `hueLatch.ts` stays (decoys use it); mines and the three zone modules stop importing it.
- No `PROTOCOL_VERSION` bump (no frame field moves); `VERSION` 0.18.60, cycle 195; both trackers one-line stamps; `CHANGELOG.md`; `docs/codebase-map.md`; amendments 180–181 in `epic-9-context-amendments.md` AND the `## Ratified Amendments` tail of `epic-9-context.md`; DESIGN.md gains a DATED STAMP only (hud-bar / belt-slot / loadout rows + the component table + the mine/zone color lines), no rewrite.
- American spelling in copy and docs. No in-game copy added.

**Block If:**
- The page shows the real code cannot reach a look Eric accepted (e.g., white fire unreadable on the black sea) — HALT `blocked`, bring the page.
- Any wire field would have to move.
- The 868 px bar cannot fit the 1280 × 614 floor viewport with the refit band (band.y must stay ≥ 0 at the floor).

**Never:**
- Re-propose colored (hue) mines or zones; keep the ember disc or any of its config; add a seventh anti-cheat exception; touch server or shared code beyond nothing; pin vocabulary in tests; change the 10 u hit disc; add URL params or test hooks to tracked client code for the page (the page is a throwaway esbuild bundle under `$CLAUDE_JOB_DIR/tmp` plus a published artifact, never committed); commit before Eric's picks; merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Bar at the floor | `hudBarLayout(1280, 614)` | `bar` {x 206, y 460, w 868, h 136}; globes r 52; weapon column 75 and belt frame 79 (w 310) centered on the 104 row; `belt.x = bar.x+104+16+302+16` | n/a |
| Bar at 1366×768 | `hudBarLayout(1366, 768)` | bar.x 249, bar.y 614; refit band 8 px above bar.y | n/a |
| Own mine | `MineView.own = true` | glyph box 22 u × 1.1 = 24.2 u wide, white, alpha 0.9; rings white at `mineRings` alphas | n/a |
| Enemy mine, motion full | own false, phase φ | tint = mix(yellow, orange, 0.5+0.5·sin φ), 1 Hz | n/a |
| Enemy mine, motion off | `settings.motion = 'off'` | tint = orange, constant across frames | n/a |
| Motion reduced | `'reduced'` | swing halved (mix in [0, 0.5] about orange) | n/a |
| `advanceAlertPhase` | dt 0 / −1 / 60 s | 0 / 0 / 0.5 s worth; wraps below 2π | NaN dt → treated as 0 |
| Own lit zone | `z.by === ownId` | fill + ring white (additive), no hue probe | n/a |
| Other's foul zone | `z.by !== ownId` | glow + net blended; slick + weed untouched | n/a |
| Spectator | ownId undefined | every zone "other" (blend); own mines still `own` from the server | n/a |
| Burn zone body | zone r | N = clamp(round(density·πr²), min, cap) tongues, positions deterministic per id, no ember child | n/a |
| Burn zone, motion off | `'off'` | tongues still, full extent | n/a |
| Expiry fade | `until − serverNow < 1500` | root alpha = `litZoneFade`; flicker never fights the fade (child vs parent alpha, the ember precedent) | n/a |

</intent-contract>

## Code Map

- `client/src/config.ts` -- `hudBar` block back to 8.6 keys/values (globe 104, globeGap 16, slot 54, icon 28, beltSlot 44, beltGap 6, beltPad {8,8,6}, beltIcon 22, badge 16 / beltBadgeOverhang 6, type.hull 18, type.wipe 18, type.badge 10; drop stockSlot/stockGap/stackGap/stockChipGap/stockIcon/stockBadge*/type.stockBadge; keep glowBlurPx); NEW `alert` block {hz note, yellow/orange tokens via `colors.alertYellow` / `colors.alertOrange` (Eric's pick)}; `burnZone` loses ember* (keeps `burnShakeScale`), gains `flameDensityPer1000U2`, `flameMin`, `flameMax`, `flameR`, `flameCoreAlpha`, `flameHaloAlpha`, `flickerHz` (≤ fire's 6, a wobble not a flash)
- `client/src/render/hudBar.ts` -- `belt: Rect` back, `BELT_W`, `BELT_COL_H`, width formula, `dimGroups` [slots, belt], `HUD_STACK_HEIGHT` deleted, doc prose 868/136
- `client/src/render/hotbar.ts` -- `drawBeltFrame` back on `gfx`, `beltIcon`, one `chipGap`, 16 px badge box / 10 px digit on the belt (`STRIP_BADGE_STYLE` retired); keep zeroStock / unheld / glow / fit pulse
- `client/src/ui/loadoutBlock.ts` -- twin back to one row `[main, belt]` at .72 with the belt div (padding, 1 px silver .2 border), keep zero-stock glyph + ladder lines
- `client/src/ui/upgradeMenu.ts` -- band sits above `bar.y` (derived; verify band.y ≥ 0 at the floor)
- `client/src/how-to-play/main.ts:77` -- glyph size follows `hudBar.icon` (derived)
- `client/src/render/alertBlend.ts` (NEW) -- `ALERT_HZ`, `advanceAlertPhase(phase, dtSec)`, `alertMix(phase, motion)` → [0,1] (0 = orange), `alertColor(mix)` RGB lerp yellow→orange, `alertTint(phase, motion)`; a module-level `AlertClock` {phase, lastSec} `advance(nowSec)` shared by mines and zones (one phase on screen)
- `client/src/render/mines.ts` -- drop hueLatch; `RING_R` stays the hit disc, `GLYPH_R = RING_R * 1.1`; draw in `colors.white`; own alpha 0.9 (the 0.7 dim retired); `sync(mines, own?)` (no hueFor); NEW `render(nowSec)` tints enemy sprites by the shared clock
- `client/src/render/litZones.ts` -- `drawZoneGlow(g, r)` draws white (fill 0.12 + ring 0.38, additive); `sync(zones, ownId)`; `render(serverNow, nowSec?)` tints others' sprites; `ownActiveZones` untouched
- `client/src/render/burnZones.ts` -- ember deleted (`advanceEmberPhase`, `emberAlpha`, `EMBER_HZ`, `emberAlphaOf`); sprite = root (fade alpha) + `ring` Graphics (white ring only, no fill — the flames are the body) + `fire` Container of N tongue Graphics (`flameTongue` ×2 polys, white halo + white core, additive) seeded per id; `render(serverNow, nowSec?)`: ring tint by own/other, tongues `alpha/scale` by `flameFlicker(loopMs, motionIntensity, phase_i)`; test seams `flameCountOf(id)`, `size`
- `client/src/render/foulZones.ts` -- `paintHue` → `paintAlert`: glow + net drawn white, root-level tint of glow+net containers per frame; slick + weed untouched; `sync(zones, ownId)`
- `client/src/net/roomBindings.ts:775-785` -- `mines.sync(f.mines, ownMineRings(t))`, zones `.sync(list, deps.state.net.sessionId)`; `ordnanceHue` no longer passed to these four
- `client/src/main.ts:4344-4346, 4608-4610` -- `mines.render(nowSec)` joins the zone renders (player + spectator); the zone renders take `nowSec`
- Tests: `client/src/__tests__/{hudBar,hotbar,hud,upgradeMenu,refitTooltipFit,refitCardFit,tooltipFit,slotTooltip,hpGlobe,helmGlobe,xpStrip,results,mines,decoys,litZones,burnZones,foulZones,fitCheck,roomBindings,tokens}.test.ts` -- re-pins per the matrix; NEW `alertBlend.test.ts`; hue-probe tests for mines/zones RETIRED (replaced by own-white / other-blend / motion-off / shared-phase / tongue-determinism / no-ember-child cases)
- `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` -- dated stamps at :136-148 (components yaml), :266, :286, :290-295, :332, and the mine / zone color lines (grep `dropper`, `firer`, `ember`)
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/codebase-map.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml, epic-9-context-amendments.md (180–181), epic-9-context.md (Ratified Amendments tail)}`
- Page (NOT committed): `$CLAUDE_JOB_DIR/tmp/alerts-page/` -- esbuild IIFE bundle of the real `HudBar`, `Mines`, `LitZones`, `BurnZones`, `FoulZones` + pixi.js into one HTML, published as a private artifact

## Tasks & Acceptance

**Execution (orchestrated per `/orchestrate`: Opus implements, Sonnet re-pins mechanical tests, Fable + Codex review the gate):**
- [ ] W1 (Opus) `client/src/config.ts` + `render/hudBar.ts` + `render/hotbar.ts` + `ui/loadoutBlock.ts` -- the one-row revert with six framed squares; keep every post-35650906 behavior -- amendment 151 + ruling (a)
- [ ] W1 (Sonnet, after) `__tests__/{hudBar,hotbar,hud,upgradeMenu,refitTooltipFit,refitCardFit,tooltipFit,slotTooltip,hpGlobe,helmGlobe,xpStrip,results}.test.ts` -- re-pin to 868/136 and the belt; chip order `['·','Shift','Q','E','R','1'..'6']` in the LOADOUT
- [ ] W2 (Opus, parallel with W1 — disjoint files) `render/alertBlend.ts` (NEW), `render/mines.ts`, `render/litZones.ts`, `render/burnZones.ts`, `render/foulZones.ts`, `config.ts` (alert/burnZone/colors blocks — coordinate: W1 owns `hudBar` block, W2 owns `burnZone`, `alert`, `colors`), `net/roomBindings.ts`, `main.ts` render hooks -- alerts + white fire -- amendments 152–154 + rulings (b)–(g)
- [ ] W2 tests `__tests__/{alertBlend (NEW),mines,decoys,litZones,burnZones,foulZones,fitCheck,roomBindings,tokens}.test.ts` -- the matrix rows; `ALERT_HZ ≤ pulseCapHz`; tongue positions identical across two `BurnZones` instances for one id; no ember child
- [ ] W3 (Fable orchestrator) the LIVE PAGE: esbuild the real modules; sections: bar at 1366×768 with a synthetic view (all six squares stocked, one zero-stock, one capped), mines own/enemy × three kinds, three zones own/other, burn fire with a density slider, color-pair candidates A/B/C beside storm amber + denied red, motion full/reduced/off toggle; publish private artifact; AskUserQuestion for the picks (colors, fire density, any veto) → amendment 181 -- ruling (h)
- [ ] W4 (Sonnet) apply the picks; records: VERSION/package(-lock).json 0.18.60, CHANGELOG, codebase-map, DESIGN.md stamps, amendments 180–181 (both homes), both trackers
- [ ] Gate: `npm run check` green; Fable Blind Hunter + Edge Case Hunter and Codex (`-m gpt-5.6-sol`) on the diff; CONFIRMED findings patched; commit, push, ONE PR to `development`

**Acceptance Criteria:**
- Given the 9.2 two-row stack, when the story lands, then `hudBarLayout(1366, 768).bar` is {249, 614, 868, 136}, the belt frame holds six squares and the results LOADOUT is one row with the framed belt.
- Given an own mine and an enemy mine of each kind, when rendered, then the own is white with white rings in a 24.2 u box and the enemy blends yellow→orange at 1 Hz, orange with motion off; no code path asks `hueFor` for a mine.
- Given a lit, a foul and a burn zone each by self and by another captain, when rendered, then the own ring (and lit fill / foul net) is white and the other's blends on the same phase as the mines; the foul weed and slick are byte-identical to before.
- Given a burn zone, when rendered by two clients, then both draw the same N white tongues at the same positions; no ember disc exists in code or config; with motion off the tongues are still.
- Given the page, when Eric has picked, then the picked colors are `colors.alertYellow` / `colors.alertOrange` pinned in `tokens.test.ts` and recorded as amendment 181.
- `PROTOCOL_VERSION` unchanged at 88; `npm run check` green; both trackers stamped; no in-game copy added.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Tint, don't redraw.** Geometry is drawn once in white (0xffffff); the per-frame alert color is `Graphics.tint` (multiplicative on white = the color). One `AlertClock` advanced once per frame (mines.render first, zones read the same phase) keeps every warning on screen in step.
- **Mix formula:** `mix = intensity · (0.5 + 0.5·sin φ)`, color = orange + mix·(yellow − orange). Off → intensity 0 → orange. Reduced → 0.5 → swings orange..midpoint.
- **Fire field:** `N = clamp(round(density · π r² / 1000), min, max)`; tongue i at (√u·r·cos θ, √u·r·sin θ) biased to the middle by `u = rng²`; per-tongue phase `rng·2π`, scale `rng(0.7..1.3)`; `flameFlicker(nowMs, intensity, phase_i)` drives alpha and x-scale exactly as `Fire.render` does; no rise, no life (a permanent field until the zone's fade).
- **Burn zone ring without fill:** the flames are the body (amendment 154: "ownership reads on the ring alone"), so an additive fill under them would double the glow and wash the tongues; lit and foul keep their fill because nothing else fills them.

## Verification

**Commands:**
- `npm test -w client` -- expected: green, incl. the new `alertBlend.test.ts`
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green before the PR
- `node_modules/.bin/esbuild <page entry> --bundle --format=iife --outfile=$CLAUDE_JOB_DIR/tmp/alerts-page/bundle.js` -- expected: bundles the real client modules

**Manual checks:**
- Eric's picks on the published page (colors, density, any veto) BEFORE the first commit.
