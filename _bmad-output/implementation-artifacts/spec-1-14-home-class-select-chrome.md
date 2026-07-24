---
title: 'Home & Class-Select Chrome (+ truesight 330 / star-shell ½-sight rulings)'
type: 'feature'
created: '2026-07-24'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
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
- [ ] `shared/src/constants.ts` + `barrel.test.ts` + golden regen + comment refresh -- Goal A landed and pinned first (independent of chrome).
- [ ] `client/src/config.ts` -- home knobs (pip anchors, ambient values) -- tunables before UI.
- [ ] `client/src/render/ambient.ts` + `main.ts` pre-join lifecycle -- the canvas is alive before the DOM lands on it.
- [ ] `client/src/util/silhouetteSvg.ts` -- shared-geometry SVG helper -- cards/chip trace the one true polygon.
- [ ] `client/src/ui/home.ts` -- home chrome per contract -- replaces menu.ts.
- [ ] `client/src/ui/classSelect.ts` -- the layer -- cards, pips, keyboard, footer.
- [ ] `client/src/main.ts` + `connection.ts` probe -- wiring, first-run routing, status states.
- [ ] Tests (home/classSelect new; menu rewritten; tokens/goldens verified) -- pin the matrix.
- [ ] Docs sweep + `npm run check` green.

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
