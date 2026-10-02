---
title: 'Interstitial cycle 162: Epic 8 legibility cleanup (icons, mine markers, rings, chaff ghosts, smoke/chaff radii, fire)'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
baseline_revision: '9693e574'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** Eric's staging pass (2026-10-01) found eight legibility defects before Epic 8 wraps: refit cards share or lack icons (three torpedo lines share one glyph, three mine lines share one, the CANNON card and all five ship-upgrade cards draw an empty icon box); a laid mine is a ring and a dot; mine blast/trigger rings and the chaff ring are too faint; the chaff owner sees no returns; chaff and smoke-screen radii are too small; a hull under 25 % hull only smokes harder — no fire.

**Approach:** One cycle, eight items, in Eric's words with his three rulings from this run (AskUserQuestion, 2026-10-01): (1) every card line gets its own unique glyph; (2) a mine on the water draws its hotbar glyph instead of the ring-and-dot; (3) naval keeps its glyph, captive is a triangle with a small torpedo inside, fouling is naval-like but clearly distinct — and **every observer who can see a mine receives its kind** ("Everyone sees the kind", reversing amendment 76); (4) HULL REPAIR is a rod of Asclepius, not a plus; (5) blast and trigger rings on all mines much more visible; (6) the chaff ring more visible, and the owner now also sees the fake returns at 50 % of their normal alpha in greyscale (reversing amendment 191's "never the fakes"); (7) chaff scatter radius and **Smoke Screen puff** radii ×1.5 ("to 150 %": chaff 120 → 180 u; puffs 82.5 → 123.75 u growing to 165 → 247.5 u); (8) an on-fire effect for a hull under 25 %. `PROTOCOL_VERSION` 67 → 68. Version 0.18.27, cycle 162.

## Boundaries & Constraints

**Always:**
- Eric's rulings above are the spec; glyph designs, ring/alpha numbers and the fire look are IMPLEMENTER DRAFTS for his eye on staging (amendment 110 precedent) and are recorded as such in the amendments.
- Mine kind rides `MineView.c` for EVERY observer who receives the mine (sight-gated as today); the perception oracle's `verifyMine` mirrors it. No new perception exception — the count stays SIX.
- The owner's fake returns ride the owner's OWN frame as a self-private list beside `you.chaff` (the `shield` / `inSmoke` / `chaff` precedent) — never as `events` blips, never to any other observer. They are gated by the owner's beam crossing and the height-raster shadow but NOT by the sight annulus (the cloud bursts at the owner's position, inside their bubble — orchestrator ruling, Eric may veto). The wire `BlipEvent` shape stays exactly seven keys; fake-vs-real stays indistinguishable for everyone but the owner.
- The owner's ghosts render through the SAME pure march/heatmap functions as the scope (`marchSlice`, `rasterize`, `quantizeInto`) into a SEPARATE grid and sprite, quantized to three new GREY tokens at `bandAlpha × 0.5`; the `Radar` class and its three-color contract are untouched.
- The on-water mine glyph is drawn in a box of `2 × CONFIG.mine.hitRadiusU` (20 u) in the dropper's hue, keeping today's own/enemy alpha split; `hitRadiusU` stays the server's "on the mine" disc.
- Every number stays in its home: gameplay radii in `CONFIG` (shared), feel knobs in `CLIENT_CONFIG`; the amendment-176 oracle keeps an INDEPENDENT literal curve (`123.75 + 123.75·f`).
- Fire is INFORMATION like smoke (amendment 43 rule): presence, extent and tier never motion-gated; only flicker scales. It rides the existing tier-2 `sm` pulse — no wire change, no correlation handle.
- `npm run check` green; complexity ≤ 10; American spelling; no in-game copy added.

**Block If:**
- Any item would need a new wire channel visible to non-owners beyond `MineView.c` (HALT: `intent gaps`).
- A test can only pass by weakening an anti-cheat invariant (HALT: name the test).

**Never:**
- Show the owner's fakes to anyone else, or tag any `events` blip.
- Touch the three-color scope contract, the blip key set, or the smoke-screen sight/delivery rules (amendments 142–149) beyond the radius numbers.
- Change `hitRadiusU`, `inSmokeSightFraction`, `flashShells.sightFraction`, or any balance value not named here.
- Edit `CLAUDE.md`; create a word-police test; merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enemy mine sighted | observer B sees A's captive mine | `MineView {id,x,y,own:false,by:'a',c:'captive'}`; client draws the captive glyph in A's hue | — |
| Mine outside sight | B cannot see A's mine | no `MineView` at all (unchanged gate) | — |
| Own chaff fired | A fires chaff at own position, beam sweeps the cloud | `you.chaffGhosts` carries the owner's gated fake coverage rects this tick; `events` carries none of A's fakes | ghost list absent when no fake painted |
| Enemy observes A's chaff | B in annulus | B's `events` blips unchanged (seven keys, no flag) | — |
| Ghost render | owner client receives ghosts | grey cells only (three grey tokens), alpha = 0.5 × scope alpha, same age decay | invalid coverage dropped like `validCoverage` |
| Smoke puff radius | puff born at t0 | `puffRadius(t0,t0)=123.75`, `(t0,t0+30 s)=247.5`; oracle literal agrees | — |
| Hull < 25 % | `sm` tier 2 pulse | smoke heavy tier + flame puffs at the pulse point; tier 1 = smoke only | `document.hidden` skips spawn like smoke |
| Card icon | any of the 24 line ids except `depthCharge` | `glyphPaths(lineId)` non-null and pairwise distinct (`deckGun` → gun) | `depthCharge` (stub) null |

</intent-contract>

## Code Map

- `shared/src/types.ts:1263-1288` -- `MineView.c` doc + optionality (now every observer); `OwnShip` gains `chaffGhosts?: GhostPaint[]` beside `chaff`
- `shared/src/constants.ts:1795` `chaff.radius` 120 → 180; `:1847` `smokeScreen.r0/r1` → `SIGHT*2*(1.5/8)` / `SIGHT*2*(3/8)`
- `shared/src/index.ts:5-9,771` -- PV 67 → 68 entry
- `server/src/game/signals.ts:725-726` -- `mineSignal` materialize: always `c: mine.kind`; `:1056-1070` `chaffFakeBlips`/`pushGatedFakes` (owner skip stays for `events`)
- `server/src/game/frames.ts:58-61` -- `ownChaff`; add the owner-ghost builder (owner's source, beam + shadow gate, `blipShape` rects)
- `server/src/__tests__/{signals,perception,spectator,goldenFrames,chaff,smokeScreen,smokePerf}.test.ts` + `__snapshots__/goldenFrames.test.ts.snap` -- re-pin (kind for all; oracle `verifyMine`, `chaffSourcesFor` owner arm for `you.chaffGhosts`; 82.5/165 literals → 123.75/247.5; perf-pin geometry re-laid)
- `shared/src/__tests__/{smoke,barrel}.test.ts` -- radius pins, PV
- `client/src/render/equipmentIcons.ts` -- new glyphs: lightTorpedo, supercavTorpedo, captiveMines, foulingMines, hullRepair (rod of Asclepius), armor, speed, turning, radarSweep, reload; `glyphPaths` also resolves LINE ids (`deckGun` → gun, ladders)
- `client/src/ui/upgradeMenu.ts:1288` `iconBoxEl`, `client/src/how-to-play/main.ts:70-76` `entryGlyphId` -- resolve ladders through the one lookup
- `client/src/render/mines.ts:326-331` `drawMarker` -- glyph by kind; enemy sprites read `c`
- `client/src/config.ts:939` `mineRings`, `:2344` `chaffRing`, colors (three grey ghost tokens), new `fire` + `chaffGhost` blocks
- `client/src/render/chaffGhosts.ts` (new) -- owner ghost renderer on the `blip` chart layer; `client/src/main.ts:2887-2889,4355-4367` wiring; `net/roomBindings.ts` reads `you.chaffGhosts`
- `client/src/render/fire.ts` (new) -- flame puffs riding tier-2 `sm` (`roomBindings.ts:949` fan-out); `render/smoke.ts` untouched
- `client/src/__tests__/{hotbar,gunPickHud,mines,decoys,chaffRing,smoke,radarHeatmap,tokens,howToPlay,results}.test.ts` -- re-pin + new pins
- Docs: `epic-8-context-amendments.md` (213+), `CHANGELOG.md`, `VERSION`, `package.json`, both trackers, DESIGN.md rows 222/313 + token table, GDD chaff/smoke rows, `deferred-work.md`

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/types.ts`, `shared/src/constants.ts`, `shared/src/index.ts`, shared tests -- kind-for-all doc, `OwnShip.chaffGhosts`, radii ×1.5, PV 68 -- the wire contract lands first
- [ ] `client/src/ui/settings.ts` `wheelScrollsSurface`, `client/src/main.ts` `bindWheelZoom`, `settings.test.ts` -- item 9 (Eric mid-run 2026-10-01): a wheel while the ESC menu (settings overlay) is open scrolls the menu and never zooms; the results modal keeps the same gate; the refit modal is not scrollable and is not gated
- [ ] `shared/src/constants.ts` `supercavTorpedo.damage` 50 → 85, `barrel.test.ts` pin -- item 10 (Eric mid-run 2026-10-01: "raise the damage of the Supercav Torpedo to … 85"); the card, tooltip and How-to-Play table read it from CONFIG (inside this cycle's PV 68)
- [ ] `server/src/game/signals.ts`, `server/src/game/frames.ts`, server tests + golden snapshot -- emit `c` to every receiver; owner ghost list; oracle mirrors both; perf/non-vacuity re-laid for 247.5 u discs -- anti-cheat chokepoint
- [ ] `client/src/render/equipmentIcons.ts`, `upgradeMenu.ts`, `how-to-play/main.ts`, `render/mines.ts`, client tests -- unique glyphs, line-id lookup, kind glyph on the water -- items 1–4
- [ ] `client/src/config.ts`, `render/chaffRing.ts`, `render/chaffGhosts.ts` (new), `render/fire.ts` (new), `main.ts`, `net/roomBindings.ts`, client tests -- louder rings, grey half-alpha ghosts, fire under 25 % -- items 5, 6, 8
- [ ] Docs wave (amendments 213+, CHANGELOG 0.18.27, VERSION/package.json 0.18.27, both trackers one-line, DESIGN/GDD stamps, deferred-work) -- the durable record
- [ ] `npm run check` -- the gate

**Acceptance Criteria:**
- Given the 24 catalog line ids, when `glyphPaths(id)` is called, then every id but `depthCharge` returns a glyph and no two ids return equal JSON.
- Given observer B sees A's mine of kind K, when the frame is built, then B's `MineView` carries `c: K`; the perception fuzz asserts `c` on every mine row.
- Given the owner fires chaff, when their beam crosses a fake with island line clear, then `you.chaffGhosts` carries that rect and `events` carries none of the owner's fakes; non-owner blips are byte-identical to today.
- Given a ghost grid, when quantized, then every opaque pixel is one of the three grey tokens at `0.4 × 255` peak alpha (0.8 × 0.5) scaled by age.
- Given `CONFIG`, then `chaff.radius === 180`, `smokeScreen.r0 === 123.75`, `smokeScreen.r1 === 247.5`, and the oracle literal agrees without reading CONFIG.
- Given a tier-2 `sm` pulse, when rendered, then flame puffs spawn at the point at every motion level; tier 1 spawns none.
- Given `CLIENT_CONFIG.mineRings` and `chaffRing`, then ring alphas and widths are at least double today's (0.3/0.34/1 and 0.45/1.5).
- Given `npm run check`, then lint 0 errors, tsc clean, all tests green.

## Spec Change Log

### 2026-10-01 — Eric added two items mid-run (chat, this conversation)
- **Trigger:** Eric, after the spec was written: *"Make it so that if the ESC menu is open in-game, the scroll wheel does NOT zoom in/out in the game"* and *"raise the damage of the Supercav Torpedo to... uh... how about 85."*
- **Amended:** two Execution tasks added (items 9 and 10); the intent contract is not edited (Eric is the requirement; both are recorded verbatim here and in the amendments).
- **Also:** Eric asked to see the icon proposals before they are built on (*"I did want to see your suggestions for icons before implementing"*) — the glyph wave's drawings are rendered as an SVG sheet for his approval and held uncommitted until he rules; KEEP: the one-lookup design (`glyphPaths` over consumable → equipment → line ids) regardless of which drawings he accepts.

## Review Triage Log

### 2026-10-01 — Review pass (Blind Hunter + Edge Case Hunter on Fable; Codex gpt-5.6-sol cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 1, medium 3, low 4)
- defer: 0
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `[high]` `[patch]` Blind Hunter CONFIRMED: `ownerChaffGhosts` had no range bound (only the beam crossing bounded a ghost; the source survives redeploy) — gate now keeps the radar annulus's OUTER edge (`withinRadarRange`, inclusive), oracle `ghostPredicate` mirrors it, pinned beyond-range absent / at-range present (failed before the fix).
  - `[medium]` `[patch]` Blind Hunter CONFIRMED: two `smokeScreen.test.ts` fixtures were vacuous at r 123.75 — re-laid with asserted distances.
  - `[medium]` `[patch]` Eric ruling at the gate ("Radar returns should never be below the smoke screen"): ghosts + chaff ring move from `litZone` to a new `chaff` chart layer above `smoke`; layer-order pins re-laid and a new pin added (amendment 224(b)).
  - `[medium]` `[patch]` Both Fable hunters: an unrecognized `MineView.c` drew nothing — `mineKindOfView` type-guards the kind set and falls back to naval, pinned (failed before the fix).
  - `[low]` `[patch]` Eric ruling: "Glyph alone" — no 10 u aim ring under the mine glyph (Edge Case Hunter's PLAUSIBLE); recorded, no code change.
  - `[low]` `[patch]` Eric ruling: the decoy hp arc keeps the shared 2 px stroke; Eric ruling: "123.8 is fine" on the card — both recorded, no code change.
  - `[low]` `[patch]` `fire.test.ts` header cited amendment 43 for the information-not-juice rule (epic-4 amendment 49); a `mines.test.ts` title asserted the opposite of its body — both fixed.
  - `[low]` `[patch]` Codex: no defects, build-on-it (read-only sandbox, no executable run).
  - rejected: the `you.chaffGhosts` key position unpinned by the golden battery (keyed object, feature unreachable by the battery); bots paying `ownerChaffGhosts` for a list they never read (≤ 10 rects while their own chaff lives).

## Design Notes

- **Owner ghosts, not tagged blips.** The scope's blip is deliberately identity-free (seven keys, one merged three-color bitmap), so a per-paint "this is fake" tint cannot survive the heatmap merge. The ghosts therefore ride `you` as their own list of the same coverage-rect shape and render through a second grid. Greyscale = three new `COLORS.ghost{Faint,Fuzzy,Solid}` tokens (0x4a4a4a / 0x8c8c8c / 0xd0d0d0, drafts), bands at the scope's `HEAT_*_AT` thresholds.
- **Glyph drafts (orchestrator, for Eric's eye):** LIGHT TORPEDO = slim body with two speed dashes astern; HEAVY = today's torpedo; SUPERCAV = torpedo inside an elongated bubble outline; CAPTIVE MINE = upright triangle with a small horizontal torpedo inside (Eric); FOULING = sphere with four diagonal barbed spikes and a trailing tether line; HULL REPAIR = staff with one serpent coiled (rod of Asclepius); ARMOR = three stacked plates; SPEED = arrow with three motion lines; TURNING = rudder blade on a baseline with tiller; RADAR SWEEP = dish fan (center dot, sweep line, two arcs); RELOAD = hourglass. All inside ±1, pairwise distinct, linework only.
- **Fire:** 2 flame puffs per tier-2 pulse in `colors.hitBloom` / `colors.amber`, additive, ~600 ms life, rising against the smoke drift by a small fixed vector, flicker scaled by motion, pooled, `capOldest`. Smoke itself unchanged.
- **Ring knobs (drafts):** mineRings width 1 → 2, blastAlpha 0.3 → 0.6, triggerAlpha 0.34 → 0.65; chaffRing alpha 0.45 → 0.85, width 1.5 → 2.5.
- **Smoke consequence to record:** a fresh puff (123.75 u) covers its layer by construction; non-owner delivery reach grows to sight + 247.5 u (577.5 u at base) — an accepted disclosure in the amendment-177 class; the `r0 = in-smoke sight` coincidence ends.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: tsc clean
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green
- `npm run check` -- expected: lint 0 errors, tsc ×3 clean, all tests + hook test green
