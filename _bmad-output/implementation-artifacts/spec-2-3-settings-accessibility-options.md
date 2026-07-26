---
title: 'Story 2.3: Settings & Accessibility Options (+ Legibility Pass)'
type: 'feature'
created: '2026-07-26'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** No settings surface exists — the home gear and bare ESC paint an inert "SETTINGS ARRIVE IN A LATER REFIT" note (ledger entry, deferred-work.md:142) — so none of the committed v1 accessibility options (motion, UI scale, colorblind assist, volumes, mono, mute) are reachable or persisted. Separately-ratified in the same story (amendment 14): home page and hotbar ship 9–13px text, much of it grey `textMuted`/`textSecondary` that is borderline invisible — the 2026-07-13 "everything tiny" fix (~1.6×, hud.ts:41) never reached them. Two server `options.name` hardening debts (deferred-work.md:127, :130) are routed here as the epic's "first settings-touching story".

**Approach:** Build the DOM settings overlay (gear on home + non-pausing ESC toggle in match, view-only binding reference, ABANDON MATCH + RESET SETTINGS per amendment 19) over a new persisted settings store with live effect; execute the ratified legibility pass (amendments 15–17: ~1.6× micro-type lift + de-grey to phosphor/white) across all shipping surfaces; draft the CVD assist palette (amendment 18); harden server-side name validation; rename Standard Gun → Deck Gun (amendment 20).

## Boundaries & Constraints

**Always:**

- **Settings list (committed, exactly):** motion/shake full/reduced/off (reduced halves flash/pulse intensity and overrides every juice rule; off removes motion, never information — dual-coded static equivalents remain); UI scale 90/100/125% (125% shown but disabled with an explanatory note on viewports < 1600 px; scales Pixi HUD + DOM HUD chrome — kill feed, toasts, refit cards, banners — while port chrome follows browser zoom; **no mono type below 9 px post-scale**); colorblind assist off/on; master + effects volume 0–100; mono-audio on/off; mute (one persisted value shared with the M key). All take effect **live** and persist in localStorage. Defaults: full / 100% / off / 100 / 100 / off / off.
- **Store:** one client settings module (single source: schema, defaults, load/save, subscribe-for-live-effect). Namespace `hullcracker.*`; migrate the legacy `hullcracker-muted` key (read-once fallback, write new key). Persistence is localStorage only — no accounts, nothing on the wire.
- **Surface & modal law (amendments 21–23):** gear on home AND non-pausing ESC overlay in match. The uniform ESC law: **ESC closes the topmost open surface (refit modal, results modal, settings overlay); only when nothing is open does ESC toggle the settings overlay. ESC never returns to port, and settings NEVER opens over another surface.** Extend the one `isModalOpen`-style predicate in main.ts so slot keys/clicks suspend under settings exactly as under refit. A focused overlay suppresses sim keys while the sim never pauses (existing text-entry guard). No accessibility setting reachable only mid-match (the full list is on the home gear too).
- **Elimination flow (amendments 22–23, replaces silent auto-spectate):** being eliminated immediately opens the results modal showing **your personal score** — upgrades acquired, kill count, and the list of contestant-controlled (non-drone) ships you personally sunk — plus **your elimination placement**; a winner (never eliminated / first) gets an explicit winner indication instead. Buttons: **SPECTATE** (closes the modal → spectate; rendered only while the match is still live) and **RETURN TO PORT**. ESC on this modal = SPECTATE (topmost-close); from spectate, ESC then opens settings. Game-end results keeps RETURN TO PORT with Enter as contextual confirm. Leaving a match = the modal's RETURN TO PORT or settings' ABANDON MATCH — never ESC, never a page refresh. Score data is client-derived from self-state + the public kill feed (no wire change): own upgrade count, own-kill tally, victim names (drone kills count in the tally, only contestant ships appear in the list), placement from public elimination order.
- **Overlay register:** DOM port chrome — `panel` bed, 1 px `hairline` border, 12 px radius, no fullscreen backdrop dim (DESIGN: dim behind results only), z between upgradeMenu (1000) and home (1100); tokens only (tokens.test bans literals outside config.ts). Binding reference is view-only, current-truth bindings (amendments 1–13): W/S telegraph · A/D rudder · Q/E class specials · R pickup slot · click fire/prime · TAB refit · 1–4 refit picks · ESC settings/close · Z/X + wheel zoom · M mute · Enter contextual. F is reserved/unbound — omit. No remapping UI (post-beta).
- **ABANDON MATCH (amendment 19):** rendered only while in a live match, `danger`-styled, confirm-gated (second click/Enter confirm within the overlay — no stacked modal), then leaves the room cleanly via the existing return-to-port flow. RESET SETTINGS: `danger`-styled, restores the overlay's settings to defaults (does not touch callsign/class/color preference).
- **Legibility pass (amendments 15–17):** micro type lifts ~1.6× — 9→14, 10→16, 11→17, 12→18, 13→20 px — via the type-ramp registers (`hudMicro` 9→14, `label` 11→17) and per-module styles, across home, class bay, hotbar, results headers, kill feed, upgrade cards/toasts, banners, and nameplates (9→14). Hotbar de-grey (amendment 16): key chips + quick-info + reload countdown → `phosphor`; slot names → `textPrimary`; cooling/empty states dim these same colors (~0.7 alpha), never grey. Chrome de-grey (amendment 17): `textMuted`/`textSecondary` retired for load-bearing text (→ `textPrimary` content, `phosphor` status/system lines); grey remains only for genuinely decorative/identity uses (hairlines, drone greyscale identity, disabled states). Hotbar/hud layout metrics (slot height, tooltip width, offsets) grow as needed so lifted text fits without clipping; floor viewport 1366×768 must stay overlap-free.
- **CVD assist (amendment 18, implementer-drafted):** regroup the 20 Regatta hues into ~8 separated families by remapping at the single `PLAYER_HUES`/`PLAYER_FILLS` chokepoint (ships.ts) so nameplates/wakes/kill feed follow; add a blip outline (new stroke in the blip texture bake) and raise the minimum decayed-blip opacity floor (phosphor.ts `blipAlpha`); reserved bands (amber, denied red, storm violet, phosphor ±20°) still bind. Acceptance is a test: simulated deuteranopia (standard LMS matrix) at blip scale, family representatives pairwise distinguishable. Palette values live in config.ts as tokens (draft, canon later).
- **Audio plumbing:** master `GainNode` bus (all tones route through it) + effects-category gain (all current tones are effects); mono-audio merges to mono at the bus (audibly a no-op today — nothing is panned — ship it anyway per AC, future-proof); volumes/mute read the store live.
- **Motion gating:** `ShakeDriver` is the single-point shake gate; flash/pulse callsites (contact hit flash, storm vignette pulse amp, denied pulses, hotbar activated pop, effects intensity) read one motion-level helper. Reduced = halved intensity; off = no motion/flash, static information stays.
- **Server hardening (ledger 127/130):** `sanitizeName()` pure function in roomOptions.ts mirroring `sanitizeClassId` — non-string → fallback, trim, cap at 14 code points (the client entry cap) — called in `ArenaRoom.onJoin` before `meta.name`/`addShip`; unit-tested incl. non-string and over-length.
- **Deck Gun (amendment 20):** player-facing copy only (`equipmentInfo.ts` + tests); sim/comments/CONFIG keys unchanged.
- Cross-cutting: complexity ≤ 10; one-way data flow (overlay/store never drive net/sim except sanctioned paths: abandon → leave flow, mute/volumes → audio, scale/motion/CVD → render reads); UI-scale seam scales the HUD root + divides layout inputs (never `app.stage` — the world must not scale); pure-logic testing pattern (store, ESC routing, overlay view-model, scale math, CVD mapping as pure functions; thin DOM/Pixi shells); font preloads for new sizes; `npm run check` green.

**Block If:**
- Any wire-contract (`shared/src/types.ts`), perception.ts, or frames.ts change turns out to be needed (server change is confined to name sanitization).
- The drafted CVD regroup cannot meet deuteranopia distinguishability without repainting reserved bands.
- The 1.6× lift cannot fit the 1366×768 floor viewport without violating a ratified layout rule (hotbar corner, vitals corner, chrome max-width).

**Never:**
- No key remapping UI, no 150% scale tier, no refit hold/toggle option (foreclosed), no reveal-zoom motion ruling (Story 5.3), no `prefers-reduced-motion` auto-override of the stored choice, no vitals restyle (2.4), no boon/XP work (2.5+), no DOM tactical UI, no design-doc edits (rulings live in amendments; doc-sync is a separate proposal), no settings on the wire, no version bump (release chore).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Home gear | Gear clicked (or ESC on home) | Overlay opens with full settings + bindings; inert note deleted | — |
| ESC toggle | In match, nothing open; ESC ×2 | Opens settings; second ESC closes it; sim never pauses | — |
| Topmost | Refit modal open; ESC | Refit closes, settings does NOT open | — |
| Never stack | Settings open; TAB pressed | Refit does not open over settings (and vice versa) | — |
| Eliminated | Own hull sinks, match live | Results modal opens immediately: personal score (upgrades, kills, sunk-contestant list) + placement + SPECTATE + RETURN TO PORT | — |
| Spectate | SPECTATE clicked or ESC on the modal | Modal closes → spectate view; ESC thereafter toggles settings | — |
| No stacking | Results modal open; ESC | Modal closes (= SPECTATE); settings does NOT open over it | — |
| Winner | Last hull floating | Results modal: winner indication + personal score; RETURN TO PORT, Enter confirms, ESC closes modal | — |
| Drone kills | Player sank 2 drones + 1 human | Kill count 3; sunk-contestant list shows only the human ship | — |
| Suppression | Settings open; W/Q/canvas click | Focused-overlay rule: ALL sim keys suppressed (helm included, unlike refit) and canvas clicks don't fire; the sim itself never pauses | — |
| Live effect | Master volume dragged to 30 | Next tone plays at 0.3 bus gain; persists across reload | — |
| Mute parity | M pressed in match | Overlay's mute toggle reflects it; one localStorage value | — |
| Motion off | Shell hits own ship, motion=off | No shake, no flash; HP change + markers still fully visible | — |
| UI scale gate | 1500 px viewport | 125% option visible, disabled, explanatory note; 90/100 selectable | — |
| Scale floor | 90% selected | Geometry scales 0.9×; mono type never renders < 9 px | — |
| CVD on | Colorblind assist toggled | Hues remap to families live; blips gain outline + higher min opacity | — |
| Abandon | Live match; ABANDON MATCH → confirm | Clean leave → home port; no reconnect attempt; roster updates for others | — |
| Reset | RESET SETTINGS → confirm | All settings back to defaults, persisted; callsign/class/color untouched | — |
| Bad name | Join with `name: 123` (non-string) | Server falls back to `CAPTAIN-n`; no throw | Silent fallback |
| Long name | Join with 40-char name | Stored/synced name capped at 14 code points | Silent trim |
| Legacy key | `hullcracker-muted='1'`, new key absent | Store migrates: starts muted, writes new key | — |

</intent-contract>

## Code Map

- `client/src/settings/store.ts` — NEW: schema, defaults, localStorage load/save/migrate, subscribe; pure core + storage shell
- `client/src/ui/settings.ts` — NEW: DOM overlay (sections: motion, scale, CVD, audio, bindings reference, danger row), view-model as pure functions
- `client/src/ui/theme.ts` — UI-scale CSS var for HUD-tier DOM chrome; register px updates flow from config ramp
- `client/src/config.ts` — type ramp lift (`hudMicro` 14, `label` 17), CVD family tokens, settings/overlay geometry group
- `client/src/ui/home.ts` — gear wiring (delete inert note), ESC-on-home opens overlay, size/color lift
- `client/src/ui/classSelect.ts` — size/color lift
- `client/src/render/hotbar.ts` — de-grey + size lift (amendment 16), layout growth, dim-not-grey cooling
- `client/src/render/hud.ts` — grey label styles → de-greyed; (sizes already 1.6×'d)
- `client/src/render/nameplates.ts` — 9→14 px
- `client/src/ui/results.ts` — REWORK: personal-score modal (upgrades/kills/sunk-contestant list, placement or winner line, SPECTATE + RETURN TO PORT), shown at elimination AND game end; lift + de-grey
- `client/src/state.ts` (or a small pure module) — own-score accumulator (kills, victim names w/ drone flag, placement from elimination order) fed by existing kill-feed/game events
- `client/src/ui/killFeed.ts` / `upgradeMenu.ts` / `upgradeToast.ts` / `util/banner.ts` — lift + de-grey
- `client/src/render/equipmentInfo.ts` — 'Standard Gun' → 'Deck Gun'
- `client/src/audio/context.ts` + `tones.ts` — master/effects buses, mono merge, store-driven volumes; M/mute via store
- `client/src/main.ts` — `handleEscape` topmost/toggle routing, modal-predicate extension, overlay lifecycle, abandon → returnToPort, UI-scale application (HUD root scale + layout divisor)
- `client/src/render/stage.ts` — preload new mono sizes
- `client/src/render/shake.ts` / `effects.ts` / `zone.ts` / `contacts.ts` / `firing.ts` / `deniedFire.ts` — motion-level gating
- `client/src/render/ships.ts` / `textures.ts` / `phosphor.ts` / `radar.ts` — CVD remap chokepoint, blip outline, opacity floor
- `server/src/rooms/roomOptions.ts` + `ArenaRoom.ts` — `sanitizeName()` + call site
- Tests: NEW `settings.test.ts` (store/migration/routing/view-model), NEW CVD deuteranopia test; update `tokens/hotbar/hud/nameplates/killFeed/home/homePersistence/classSelect/keyboard` suites; server `roomOptions.test.ts`
- Bookkeeping: `sprint-status.yaml` (2-3 → done), `gds-workflow-status.yaml` (next_expected → create-story 2-4, last_updated), `deferred-work.md` (close 127/130/142; add DESIGN.md typography doc-sync entry)

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/settings/store.ts` -- build schema/defaults/persist/migrate/subscribe -- single source for every setting
- [ ] `client/src/config.ts` -- ramp lift + CVD tokens + settings config group -- token law upheld
- [ ] `client/src/audio/*` -- gain buses, mono merge, store wiring, mute unification -- live audio settings
- [ ] `client/src/render/` motion gating (shake/effects/zone/contacts/firing/deniedFire/hotbar pop) -- one motion-level helper -- reduced/off honored everywhere
- [ ] `client/src/render/ships.ts`+`textures.ts`+`phosphor.ts`+`radar.ts` -- CVD remap + blip outline + opacity floor -- amendment 18
- [ ] UI-scale seam (`main.ts` HUD root + layout divisor; `theme.ts` DOM var; 1600 px gate; 9 px mono floor) -- amendment-free committed AC
- [ ] `client/src/ui/settings.ts` + `main.ts` + `home.ts` -- overlay, uniform ESC topmost-close law, no-stack + suppression, gear, abandon + reset -- amendments 19/21/23
- [ ] `client/src/ui/results.ts` + score accumulator + `main.ts` death flow -- immediate elimination modal w/ personal score, SPECTATE/RETURN TO PORT, winner state -- amendments 22/23
- [ ] Legibility pass across `hotbar.ts`, `home.ts`, `classSelect.ts`, `hud.ts`, `nameplates.ts`, `results.ts`, `killFeed.ts`, `upgradeMenu.ts`, `upgradeToast.ts`, `banner.ts` (+ `stage.ts` preloads, layout growth) -- amendments 15–17
- [ ] `client/src/render/equipmentInfo.ts` -- Deck Gun rename -- amendment 20
- [ ] `server/src/rooms/roomOptions.ts` + `ArenaRoom.ts` -- `sanitizeName()` -- ledger 127/130
- [ ] Tests: new settings + CVD suites; update every pinned suite incl. I/O matrix edge cases -- grammar stays pinned
- [ ] Bookkeeping files (sprint-status, gds-workflow-status, deferred-work closures + doc-sync entry) -- per-PR protocol
- [ ] `npm run check` -- full gate green

**Acceptance Criteria:**
- Given any entry point (home gear, home ESC, in-match ESC), when the overlay opens, then every committed setting plus the view-only binding reference is present, live-effective, and persisted — and no setting is reachable only mid-match.
- Given any surface state, when ESC is pressed, then it closes the topmost open surface (refit → closed; results modal → closed exactly like SPECTATE; settings → closed) and only opens/toggles settings when nothing was open; ESC never returns to port and no two overlays ever coexist.
- Given elimination, then the results modal opens immediately with the personal score (upgrade count, kill count incl. drones, sunk-contestant list excl. drones), elimination placement, SPECTATE (live match only) and RETURN TO PORT; given a win, the modal indicates winner status instead of a placement.
- Given a live match, when ABANDON MATCH is confirmed, then the client leaves cleanly to port (no refresh needed) and other clients see the roster update.
- Given motion=reduced/off, UI scale 90/125%, CVD on, volumes changed, mono on, or mute toggled (via overlay or M), then each takes effect live, persists across reload, and RESET SETTINGS restores defaults.
- Given the legibility pass, when home, class bay, hotbar, and all listed chrome render, then no text ships below the lifted sizes (14 px micro floor pre-scale), no load-bearing grey text remains, hotbar data reads phosphor with white names, and the 1366×768 floor viewport stays overlap-free.
- Given CVD assist on, then the 8-family draft palette is pairwise distinguishable under simulated deuteranopia at blip scale (automated test), with reserved bands intact.
- Given a join with non-string or over-length `options.name`, then the server never throws and the roster name is the fallback / 14-code-point cap.
- Given the hotbar/tooltip, then the gun reads "Deck Gun" everywhere player-facing.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass with no color literals outside config.ts.

## Spec Change Log

## Review Triage Log

## Design Notes

- All design decisions are Eric-ruled (amendments 14–23); the settings enumeration/gating comes verbatim from Story 2.3's ACs + EXPERIENCE's defaults table. The overlay has no mock by ratified choice ("spine-only") — layout is implementer's call within the port-chrome register.
- Stale-doc hazard: EXPERIENCE/DESIGN binding tables predate the 2026-07-21/24 re-rulings (Q-on-gun, F slot, SPACE-hold refit) — the reference must be authored from amendments 1–13, never copied from the docs. DESIGN.md's 9 px `hud-micro` pin and `text-muted` usage rules are superseded by amendments 15–17; record in doc-sync, do not edit DESIGN.md in-story.
- The ESC/settings interplay extends `handleEscape` (main.ts:436) and the `isModalOpen` predicate — the exact seams Story 2.1 built. Reviewer focus per epic posture: client UI state machines (open/close/suppression lifecycle, reset-on-death/port edges).
- Mono-audio is audibly vacuous today (nothing panned) — shipped per committed AC as bus plumbing, noted for when stereo bearing audio lands.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all workspace tests green
- `npm test -w client` -- expected: new settings/CVD suites + updated pinned suites pass
- `npm test -w server` -- expected: roomOptions name-hardening tests pass
