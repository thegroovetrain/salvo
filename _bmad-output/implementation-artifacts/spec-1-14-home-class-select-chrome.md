---
title: 'Home & Class-Select Chrome (+ truesight 330 / star-shell ½-sight rulings)'
type: 'feature'
created: '2026-07-24'
status: 'done'
baseline_revision: '116e082'
final_revision: '8b38e09'
review_loop_iteration: 0
followup_review_recommended: true
context:
  [
    '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md',
    '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/mockups/home-class-picker-1.html',
  ]
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** Story 1.14 (epics.md, UX-DR25/26): the pre-join experience is still the prototype menu — no ratified home chrome, no class-select layer, no Color Hoist writer (colorPref plumbing exists end-to-end EXCEPT the swatch UI), no ambient CIC canvas (the Pixi ticker only starts after connect — the canvas is blank pre-join). Plus two Eric config rulings riding this run (2026-07-23): truesight base 330, and star shells always lighting exactly ½ the base truesight range.

**Approach:** Goal A (shared CONFIG): `vision.sight` 220→330 via a module-level `SIGHT` const; `starShells.litRadius` becomes `SIGHT / 2` (=165) so the ratio is structural; burst damage circle stays coupled to the lit circle (Eric ruling — "the burst IS the lit circle" holds at 165). Goal B (client-only chrome): rebuild home per the ratified mock/DESIGN spine (wordmark, callsign, Class Chip, Color Hoist writing `hullcracker.color`, amber outline+glow primary button, How-to-Play, server status, inert settings gear) over a NEW live ambient CIC Pixi scene, plus the class-select layer (three 356px cards + ghost card on a rail: silhouette box from shared `hullSilhouette`, fantasy line, real-value pips on absolute anchors, loadout rows, keys 1–3/arrows/Enter/ESC). No wire change anywhere: `colorPref` already rides join options; PV untouched.

## Boundaries & Constraints

**Always:** Goal A touches shared ONLY as value/derivation edits in `constants.ts` (+ test updates); `litRadius === CONFIG.vision.sight / 2` gets a pinning test; golden-frame snapshot is regenerated deliberately and reviewed (only sight/lit-derived numbers move). Goal B is client-only: server untouched, `PROTOCOL_VERSION` untouched, join options unchanged (`connect()` already reads `hullcracker.color`). Every color/typeface via `CLIENT_CONFIG.colors/type` tokens (tokens guard scan stays green; swatches/silhouettes use `cssHex`/`cssRgba` since players/playerFills aren't `--hc-*` vars). DESIGN spine wins over mock on conflict: primary buttons are amber OUTLINE+GLOW (never filled slab); Color Hoist is 20 ROUND 20px swatches (mock's 12 squares are stale), selected = personal-color ring; hoist caption VERBATIM: "PREFERENCE PICK — YOU GET IT UNLESS CLAIMED, THEN NEAREST FREE HUE" (never implies claim/lock). Gunboat-era mock content is dead: three cards, keys 1–3, sub-line names a real beta class. Pips: filled = clamp(round(value/anchor × 5), 1, 5) against Eric's anchors (speed 60 u/s, hp 200, turn 1.0 rad/s → TB 4/2/4, BS 3/4/2, ML 3/3/3); anchors live in `CLIENT_CONFIG` as display knobs. Card silhouettes trace shared `hullSilhouette(id)` (SVG from the same polygons — no second geometry source). Typing in the callsign field never steers and never triggers 1–3/Enter card shortcuts (focus-gated at the key chokepoint); the sim never pauses. Photosensitivity floor: any new pulse ≤ 80 ms, 300 ms same-source floor. Complexity ≤ 10; ~500 LOC soft cap (split home/classSelect/ambient modules).

**Block If:** Any server or wire-contract change becomes necessary (beyond `shared/src/constants.ts` values). A needed visual value is neither DESIGN/mock-documented nor a client-only feel knob. The golden-frame regen shows diffs NOT explained by sight 330 / litRadius 165.

**Never:** No mode selector (Eric ruling — sub-line hardcoded "· SOLO"; the control is Epic 6). No real settings panel (Story 2.3) — the gear is present but inert (quiet status-line note on click). No How-to-Play page (Story 7.4) — same inert-note pattern. No contested-hoist toast (Eric REJECTED 2026-07-23). No hotbar/input-scheme work (Epic 2). No new health endpoint on the server — server status is a client-side probe of the existing HTTP surface + connect-attempt outcomes. Don't decouple star-shell burst from lit radius (Eric ruled coupled).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sight/lit values | `effectiveStats` base, star shell burst | sightRange base 330; lit zone AND burst circle r=165; ratio test pins litRadius = sight/2 | — |
| Sight upgrade stacks | sightRange ×1.12 stacks | lit radius UNCHANGED (never scales with player sight) | — |
| First run | no `hullcracker.class` key | chip shows SELECT CLASS prompt; PLAY/Enter opens layer (no connect); TB card pre-focused; no default pushed | — |
| Returning player | stored class+name+color | chip shows class + loadout sub-line; PLAY connects immediately | — |
| Card keys | 1/2/3, arrows in layer | highlight moves; Enter picks → layer closes, chip + button sub-line update | keys ignored when callsign focused |
| Layer SET SAIL | class highlighted | picks + deploys in one press | — |
| ESC in layer | any highlight state | closes without changing pick | — |
| Hoist swatch click | any of 20 hues | writes `hullcracker.color`; ring moves; `connect()` sends it (existing plumbing) | — |
| Connect fail | server down | status line: CONNECTION FAILED copy in `denied` red; menu alive, PLAY re-enabled; never a dead screen | no throw |
| Version mismatch | code 525 | VERSION MISMATCH copy on status line | no throw |
| Gear / How-to-Play click | inert surfaces | quiet status-line note ("… IN A LATER REFIT"); no dead click, no modal | — |
| Pre-join canvas | before PLAY | live ambient CIC scene (rings, rotating sweep, decaying blips, faint islands, scrim) — never blank | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- Goal A: module-level `const SIGHT = 330` beside `deg`; `vision.sight: SIGHT`; `starShells.litRadius: SIGHT / 2`; refresh stale comments (":271 ~half the 220u", vision block).
- `shared/src/__tests__/barrel.test.ts` -- litRadius 110 → 165 in the starShells equality; ADD ratio pin `litRadius === vision.sight / 2`.
- `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap` -- regenerate (embeds sight-boundary x:220/232 and r:110); review diff = only derived numbers.
- `server/src/__tests__/{starShells,perception,upgrades}.test.ts` -- stale comment/title refresh only (all assert via CONFIG — they pass).
- `client/src/config.ts` -- refresh "110u @ sight 220" comment (leadMax auto-derives 165 — accepted); ADD `home` knobs: pip anchors {speed:60, hp:200, turn:1.0}, ambient feel values not in the mock.
- `client/src/render/ambient.ts` -- NEW: pre-join CIC scene per mock geometry (range rings, conic sweep wedge rotating, phosphor blips with decay tiers, faint island masses, radial scrim) on the existing stage; start/stop lifecycle; destroyed on game start. Client render may use Math.random (not sim).
- `client/src/util/silhouetteSvg.ts` -- NEW: `hullSilhouette(id)` + `polygonMaxRadius` → inline SVG polygon (viewBox-fit); stroke/fill via tokens (silver unselected / personal hue + fill variant selected).
- `client/src/ui/home.ts` -- NEW (replaces menu.ts): wordmark (Geist 104/700 .14em, ".IO" phosphor-bright), tagline/version lines, callsign row (340×52 panel-deep field, NAME_MAX 14), Class Chip (44px silhouette, YOUR SHIP tag, name in pref hue, loadout sub-line, "▸ CHANGE CLASS"), Color Hoist (20 round 20px swatches + caption), primary button (outline+glow amber, PLAY 34/800 .34em, sub-line "DEPLOY AS <CLASS> · SOLO"), underplay row (HOW TO PLAY link, SERVER: status), gear top-right. Keeps `MenuHandle`-equivalent API (setStatus/setBusy/hide) for main.ts.
- `client/src/ui/classSelect.ts` -- NEW: 1680px layer panel over blurred/dimmed home; header (SELECT CLASS / WHAT WILL YOU SAIL? / boxed ESC hint); rail (3 × 356px cards + dashed ghost "MORE CLASSES / IN DEVELOPMENT" + railfade); card anatomy per mock (name + zero-padded key 01–03, fantasy line verbatim, 158px silbox, 5×22×7px pip bars, loadout rows GUN/SPECIAL 1/SPECIAL 2 with long-form names, SELECT/SELECTED ✓ button); footer (hoist repeat + SET SAIL). Keyboard 1–3/arrows/Enter/ESC.
- `client/src/ui/menu.ts` -- DELETE (superseded); `sanitizeName`/save-load helpers migrate to home.ts or util.
- `client/src/main.ts` -- pre-join: start ticker + ambient before menu; onPlay first-run routing (no class → open layer); status-line states (probe result / CONNECTING info / failure denied); ambient teardown in buildGame; thread class-pick → chip/sub-line.
- `client/src/net/connection.ts` -- UNTOUCHED (colorPref read already exists) except: export a tiny `probeServer()` (fetch to the server HTTP origin, timeout-guarded) for the status line — client-only, no wire change.
- Copy (net-new, in ui modules): fantasy lines verbatim from mock — TB "fast, fragile, the needle-threader"; BS "massive, heavily armored, long-range artillery"; ML "the trapper". Equipment display names: STANDARD GUN — UNIVERSAL / TORPEDO TUBES / SPEED BOOST / LONG-RANGE CANNON / STAR SHELLS / PROXIMITY MINES / DECOY BUOY.
- Tests: `client/src/__tests__/home.test.ts` + `classSelect.test.ts` (NEW — pip mapping incl. clamp bounds, first-run vs returning routing, hoist write/read round-trip, key map incl. focus suppression, chip/sub-line copy, inert-note pattern); `menu.test.ts` → rewritten against home (name sanitize pins survive); `tokens.test.ts` must stay green unmodified.
- Docs (same PR): `sprint-status.yaml` 1-14 → done + epic-1 → done (last story); `gds-workflow-status.yaml` next_expected → epic-1 retrospective (optional) / create-story 2-1, + last_updated; `deferred-work.md` += entries: (a) mock/DESIGN doc-sync — gunboat-era home mock, 12-swatch hoist, filled-slab buttons, "PIP VALUES: PLACEHOLDER" caption all stale (Eric doc-sync); (b) mode selector control → Epic 6 (6.6); (c) gear wiring → 2.3; (d) How-to-Play page wiring → 7.4.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` + `barrel.test.ts` + golden regen + comment refresh -- Goal A landed and pinned first (independent of chrome).
- [x] `client/src/config.ts` -- home knobs (pip anchors, ambient values) -- tunables before UI.
- [x] `client/src/render/ambient.ts` + `main.ts` pre-join lifecycle -- the canvas is alive before the DOM lands on it.
- [x] `client/src/util/silhouetteSvg.ts` -- shared-geometry SVG helper -- cards/chip trace the one true polygon.
- [x] `client/src/ui/home.ts` -- home chrome per contract -- replaces menu.ts.
- [x] `client/src/ui/classSelect.ts` -- the layer -- cards, pips, keyboard, footer.
- [x] `client/src/main.ts` + `connection.ts` probe -- wiring, first-run routing, status states.
- [x] Tests (home/classSelect new; menu rewritten; tokens/goldens verified) -- pin the matrix.
- [x] Docs sweep + `npm run check` green.

**Acceptance Criteria:**
- Given the new CONFIG, when `npm run check` runs, then sight=330 and litRadius=165 hold everywhere via CONFIG (no orphan 220/110), the ratio test pins litRadius = sight/2, golden frames show ONLY derived-number diffs, and `damageGuardrail`/`shipClasses` pins stay green untouched.
- Given a star-shell burst, when it lights a zone, then lit circle and damage circle are both 165u (coupled, Eric-ruled) and lit radius never scales with any player's upgraded sightRange.
- Given a fresh browser (no localStorage), when home loads, then a live ambient CIC scene breathes behind the DOM, the chip shows the SELECT CLASS prompt, and PLAY/Enter opens the class layer (TB pre-focused) instead of connecting — no default class is ever pushed.
- Given the class layer, when navigating with 1–3/arrows and pressing Enter, then the pick lands (chip + "DEPLOY AS <CLASS> · SOLO" update), ESC closes without change, and the layer's SET SAIL picks and deploys in one press.
- Given any of the 20 hoist swatches, when clicked, then `hullcracker.color` persists and the next `connect()` carries it as `colorPref` with zero changes to connection join-option code.
- Given a downed server, when PLAY is pressed, then the status line reports the failure copy in `denied` red, the menu stays interactive, and no dead screen or dead click exists anywhere on home (gear/How-to-Play give the quiet inert note).
- Given `npm run check`, when run, then lint (complexity ≤ 10) + tsc ×3 + all tests pass, the tokens guard scan passes with zero new raw colors, and `PROTOCOL_VERSION` is untouched.

## Spec Change Log

## Review Triage Log

### 2026-07-24 — Review pass (Blind Hunter + Edge Case Hunter at session capability, parallel + Codex cross-model review per /orchestrate; fixes routed to one Opus patch agent, orchestrator-verified)

- intent_gap: 0
- bad_spec: 0
- patch: 16: (high 1, medium 6, low 9)
- defer: 1
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` First-run Enter in the callsign field insta-picked Torpedo Boat — the opening Enter keydown was still mid-bubble when the layer attached its window listener and blurred the input, so the SAME keystroke picked the pre-focused card, violating the "no default ever pushed" AC. Fixed both ends: input handler stopPropagation + layer ignores events with timeStamp ≤ openedAt; regression pin dispatches Enter on the input and proves no pick (FAILS without fix).
  - `[medium]` `[patch]` ×6: status-line ownership (boot probe could overwrite CONNECTING…/failure copy with SERVER: READY — flagged by BOTH hunters AND Codex; home now locks the line once any connect state writes; pinned); footer hoist listener leak per layer open/close (all three reviewers; makeHoistRow returns a disposer, close() releases; listenerCount pinned); Enter from a re-focused input deployed behind the open layer (layerOpen guard); hide() orphaned a live layer whose keydown could write hullcracker.class mid-match (home tracks the handle, hide() closes it; pinned); ambient laid out against stale renderer size on resize (Pixi ResizePlugin defers to rAF — relayout deferred accordingly); keyboard dead-end after pick (Codex-confirmed — focus never restored to the callsign input; refocus on every layer exit).
  - `[low]` `[patch]` ×9: chip mid-connect open guard (busy); stale-layer half-teardown → module-tracked current?.close(); Enter on a focused layer button now activates the button (native wins) instead of picking; chip + gear keyboard-accessible (tabindex + Enter/Space); rail fade/chevron hidden when nothing overflows (re-evaluated on resize); COLOR_PREF_KEY exported from connection.ts, magic-string duplicate deleted; scrimCenterYFrac 0.46 promoted to CLIENT_CONFIG.home.ambient (mock-distinct from the 0.54 ring center); blipTierAlpha empty-array guard (was undefined → g.alpha); test hygiene (menu.test.ts → homePersistence.test.ts, ambient self-copy change-detector replaced with behavioral assertions) + busy SET SAIL now re-asserts CONNECTING… (never-silence) + dimmer-dismiss test added.
- deferred: server-status probe fidelity — no-cors fetch cannot distinguish a healthy server from a proxy 502 (false READY), and the single boot probe never re-runs (stale UNREACHABLE); an honest health signal needs a server-side endpoint/CORS decision the spec's "no new server endpoint" ruling forbade this story.
- rejected: leadMax 110→165 flagged as an unreviewed feel change — explicitly ACCEPTED in this spec's Design Notes (formula `sight × 0.5` deliberately kept per blast-radius ruling).

## Design Notes

- **Eric rulings (2026-07-23/24 AskUserQuestion, this run):** truesight base 330; star-shell lit radius = ½ BASE truesight, structurally derived (`SIGHT / 2`), independent of sight upgrades; burst damage circle stays COUPLED to lit (165 — "the burst IS the lit circle" survives the retune); pips on ABSOLUTE anchors speed 60 u/s / hp 200 / turn 1.0 rad/s (fills: TB 4/2/4, BS 3/4/2, ML 3/3/3); NO mode selector (sub-line "· SOLO" until Epic 6); settings gear ships INERT now.
- **Orchestrator rulings (spine-over-mock, documented for veto):** amber primary = outline+glow (DESIGN explicit: "never a filled slab" — mock renders slabs, spine wins); hoist = 20 round 20px swatches, personal-ring selected (mock's 12 squares stale); card keys display zero-padded 01/02/03 (mock "locked as rendered"); cards use long-form equipment names (HUD keeps FLARE etc.); unset color pref → amber accents on chip/cards until a swatch is picked (amber is functional, never a combatant hue); ESC on home = same quiet note as the gear (settings arrive 2.3); server status = client probe + connect outcomes (no new server endpoint).
- **Accepted side effects (from blast-radius audit):** `leadMax = sight×0.5` grows 110→165 (camera look-ahead + fog margin follow sight BY DESIGN — formula kept); lopsided sight-stack builds can out-range base radar after ~7 stacks (was ~10) degrading the blip annulus — pre-existing uncapped-upgrade quirk, noted not fixed.
- **Why ambient is net-new:** the ticker/scene only start post-connect today; the mock's CSS fake (rings/sweep/blips/islands/scrim geometry) is the ratified picture of what the live Pixi scene shows.
- Eric directive: route subagent model selection via `/orchestrate` (as 1.3–1.13).

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. new litRadius=sight/2 ratio pin, barrel 165.
- `npm test -w server` -- expected: green after golden regen; perception/starShells/upgrades pass on CONFIG-relative assertions.
- `npm test -w client` -- expected: green incl. new home/classSelect suites, rewritten menu pins, tokens guard unmodified.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green; PV untouched.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): fresh profile → ambient CIC breathes behind home; forced class choice on first PLAY; keys 1–3/arrows/Enter/ESC per contract; hoist swatch → hull sails in that hue; star shell lights a visibly larger circle (165u) and its burst tags ships across all of it; truesight fog hole visibly larger (330u).

## Auto Run Result

**Summary:** Story 1.14 landed — Epic 1 (The Armory) is COMPLETE (13/13 live stories). Two Eric config rulings shipped first: truesight base 220→330 and `starShells.litRadius` now STRUCTURALLY `SIGHT / 2` (165 — burst damage circle deliberately stays coupled per ruling; lit radius provably never scales with sight upgrades; ratio pinned in barrel.test; golden frames regenerated and audited line-by-line, three test scenarios re-derived from SIGHT so they hold under future retunes). Then the ratified pre-join chrome: home renders over a NEW live ambient CIC Pixi scene (range rings, rotating sweep, decaying blips, island masses, radial scrim — the canvas breathes before connect, never blank) with wordmark/.IO, 14-cap callsign, Class Chip, the Color Hoist (20 round swatches — the missing colorPref WRITER; `connect()` join-option code untouched), amber OUTLINE+GLOW primary (DESIGN spine over the mock's filled slab), inert gear + How-to-Play (quiet "LATER REFIT" note pattern — no dead clicks), and a probed server-status line (CHECKING/READY/UNREACHABLE + connect states with ownership lock). The class-select layer ships 3×356px cards + a dashed ghost on a scroll rail: verbatim fantasy lines, long-form loadout rows, REAL-value pips on Eric's absolute anchors (speed 60 / hp 200 / turn 1.0 → TB 4/2/4, BS 3/4/2, ML 3/3/3), keys 1–3/arrows/Enter/ESC, footer SET SAIL picks+deploys. First-run pushes NO default (TB pre-focused; forced choice). menu.ts deleted. Client + shared-tunables only; PV unchanged (11).

**Files changed:** shared: `constants.ts` (SIGHT=330 module const, vision.sight, litRadius=SIGHT/2), `barrel.test.ts` (165 + ratio pin). server tests only: golden snapshot regenerated + `goldenFrames/perception/starShells/upgrades` scenario geometry/comments re-derived from SIGHT. client: NEW `render/ambient.ts`, `ui/home.ts`, `ui/classSelect.ts`, `util/silhouetteSvg.ts`, `util/pips.ts`; `config.ts` (+`home` knobs: pip anchors, ambient geometry incl. scrimCenterYFrac); `main.ts` (pre-join ambient lifecycle, first-run routing, status wiring); `net/connection.ts` (+`probeServer`, +`COLOR_PREF_KEY` export only); `ui/menu.ts` DELETED; tests: NEW `home.test.ts`, `classSelect.test.ts`, `silhouetteSvg.test.ts`, `ambient.test.ts`; `menu.test.ts` → `homePersistence.test.ts`; `results.test.ts` import touch. Docs: sprint-status (1-14 + epic-1 done), gds-workflow-status (next_expected → epic-1 retro / 2-1), deferred-work (+5 entries).

**Review findings:** 16 patches applied (1 high, 6 medium, 9 low — see Review Triage Log), 1 deferred, 1 rejected. Cross-model picture: both hunter families AND Codex independently flagged the probe/status overwrite and the hoist listener leak (fixed, pinned); Codex alone confirmed the post-pick keyboard dead-end (fixed); Blind Hunter alone caught the high-severity first-run Enter insta-pick (verified mid-bubble trace, fixed both ends, regression-pinned).

**Follow-up review recommended: true** — the patch volume (16, incl. one high-severity AC violation and six mediums across the story's headline first-run/keyboard/status flows) is significant by both volume and consequence; the fixes are all localized UI state-machine/lifecycle work with regression pins, but an independent pass over the patched chrome would de-risk the epic close-out.

**Verification:** `npm run check` exit 0 after implementation AND after the patch pass (lint 0 errors incl. complexity ≤ 10; tsc ×3; tests shared 261 / server 633 / client 550 = 1444). Orchestrator independently re-ran the gate at every wave, audited the golden-frame diff (13 rows, every change sight/lit-derived), spot-verified the patched fixes on disk after the fix agent's mid-task revert scare, and confirmed PV=11 untouched with zero orphan 220/110 constants (remaining hits are audio frequencies).

**Residual risks:** Chrome visuals unseen in a browser this run (dev server is Eric-managed) — wordmark scale, outline+glow button weight, ambient scene feel, card/rail geometry at non-1080p viewports await his visual pass. Server-status probe is best-effort by construction (deferred entry). The two soft max-lines warnings (`buildGame` pre-existing, `openClassSelect` +7) are non-blocking. Star-shell burst now damages a 165u circle — ruled, but worth feeling in a real fight.
