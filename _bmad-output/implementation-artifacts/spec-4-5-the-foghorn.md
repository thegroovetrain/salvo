---
title: 'Story 4.5 — The Foghorn'
type: 'feature'
created: '2026-08-05'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** There is no way to say anything to another captain. The foghorn emote has been specced since Epic 4 planning but never built: its key (F) has sat reserved-and-inert in the keybinding table, and its ratified display surface — an arc sweep on every listening ring in earshot — ceased to exist when Story 4.1 was deferred (amendment 4). The audio engine has also never played anything longer than 450 ms or loaded a single audio asset, so there is no path today to an actual horn blast rather than a beep.

**Approach:** Add `fh`, a bearing-only honk, as the SIXTH declared exception to the master perception invariant. Pressing F broadcasts a horn; every listener within their own radar range receives a per-observer **bearing and volume tier** — never a position — and hears a real ~1.8 s multi-layer horn at 100% / 75% / 50%. Its visual twin is a new screen-edge chevron pointing down the bearing. The honk carries a **horn variant id** so a future purchased horn is audible to everyone, and the audio engine gains a sample-loading seam so a real recording can replace the synthesized default with no code or wire change.

## Boundaries & Constraints

**Always:**
- The wire payload carries **NO position and no ship id** for a fogged listener — bearing (radians) + tier + horn id only (Eric ruling, amendment 52). Position-bearing variants exist only for the omniscient spectator path.
- Volume tiers derive from the **listener's effective ranges**, not flat constants (amendment 53): tier 1 (100%) `d ≤ sightOf(me, now)`; tier 2 (75%) `d ≤ max(1.5 × sightOf(me, now), CONFIG.vision.muzzleFlash)`; tier 3 (50%) `d ≤ max(me.stats.radarRange, tier-2 bound)`; beyond that no event is emitted to that observer at all. The `max()` clamps are load-bearing — they are what keeps the bands monotone when intel boons widen sight past 495 u or star-shell dazzle shrinks it.
- **Islands MUFFLE a honk by exactly one tier** (amendment 54) — they do not block it and they do not ignore it. `losClear()` failing demotes the resolved tier: 1 → 2, 2 → 3, 3 → no event. This is a partial carve-out of the 2026-08-02 "islands block every sensor at all ranges" law, deliberately shaped so terrain stays a working hiding mechanism if a bearing-grade sound sensor is ever revived.
- The horn's own volume is multiplied by the tier gain and then rides the existing `effects → master → mono` bus, so mute, effects volume, and mono audio all keep working with no special-casing.
- Every honk gets its visual twin (UX-DR36). The chevron's **presence, direction, and tier weight are INFORMATION** and must survive `motion: 'off'` intact; only any animated flourish is motion-scaled (ratified house rule, `effects.ts:44-53`).
- Rate limiting is server-authoritative: `CONFIG.foghorn.cooldownMs`. The client mirrors it purely to avoid wire spam and to play the existing predicted `denied` cue on an early press.
- A new signal row is not done until its own independently reimplemented oracle exists in `server/src/__tests__/perception.test.ts`.

**Block If:**
- A second horn variant, a horn store/picker UI, or any purchasable content is requested — this cycle ships the SEAM plus exactly one default horn. Adding horn content is an Eric decision, not an implementation one.
- Real recorded audio is required to ship: no licensed asset exists in the repo and none may be sourced unattended. The sample loader must ship exercised by tests only, with the synthesized horn as the shipped default.

**Never:**
- No `x`/`y`, ship id, personal hue, class, or name in a fogged listener's honk payload — and no per-observer alias or stable anonymous key either (no correlation handle may be invented; amendment 45's rule applies here too).
- No kill-feed line, no roster/`PlayerMeta` schema field, and no XP, damage, or match-state consequence — this is an emote.
- No client-side prediction of your own honk: the honker hears it from the server's self-addressed event, exactly once.
- Drones never honk. Dead captains and spectators never honk.
- No fourth vision constant (amendment 42) — tier 2 reuses `CONFIG.vision.muzzleFlash`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own honk | Alive captain presses F, off cooldown | Server emits `{k:'fh', h, self:true}` to the honker; client plays the horn at 100% and blooms an own-hull mark. No chevron (it is you). | No error expected |
| Close listener | Honker at `d ≤ sightOf(me)` | `{k:'fh', h, b, v:1}` — horn at 100%, chevron at full weight | No error expected |
| Mid listener | `sightOf(me) < d ≤ max(1.5×sightOf(me), 495)` | `{k:'fh', h, b, v:2}` — horn at 75%, chevron at mid weight | No error expected |
| Far listener | `tier-2 bound < d ≤ max(radarRange, tier-2 bound)` | `{k:'fh', h, b, v:3}` — horn at 50%, chevron at light weight | No error expected |
| Out of earshot | `d >` tier-3 bound | No event reaches that observer at all | No error expected |
| Island between, close | LOS blocked, `d` earns tier 1 | Demoted to tier 2 — horn at 75%, mid-weight chevron | No error expected |
| Island between, mid | LOS blocked, `d` earns tier 2 | Demoted to tier 3 — horn at 50%, light chevron | No error expected |
| Island between, far | LOS blocked, `d` earns tier 3 | Demoted out of earshot — no event reaches that observer | No error expected |
| Spectator | Observer is spectating (free camera, no server-known position) | `{k:'fh', h, x, y}` — omniscient path; client derives the chevron bearing from its own camera and plays at 100% | Record-less spectator (`ctx.me` undefined) still receives it — the spectator branch must short-circuit before any `me` math |
| Honk on cooldown | F pressed inside `cooldownMs` | Client plays the predicted `denied` cue and sends nothing | Server also drops an early `hornSeq` silently if one arrives |
| Held F key | OS auto-repeat | Exactly one honk per physical press | Edge-gated at the keyboard dispatcher |
| Crowded mix | More honks arriving than `maxConcurrent` | Excess honks are dropped from the audio mix; their chevrons still draw | Visual twin never drops — information survives even when the mix is full |
| Unknown horn id | Event carries an id not in the client catalog (old client, new horn) | Falls back to the default horn voice | No throw, no silence |
| Sample fetch fails | A `kind:'sample'` voice cannot load or decode | Falls back to the synthesized default voice | No throw, no silence |
| Dead / spectating press | F pressed while dead or spectating | Nothing sent, nothing played | No error expected |

</intent-contract>

## Code Map

**shared/**
- `shared/src/index.ts:179` — `PROTOCOL_VERSION` 25 → **26** (new wire event + new input field).
- `shared/src/types.ts:44-98` — `InputMsg`; add `hornSeq` beside `fireSeq`/`actSeq` (cumulative counter, `max()`-consumed).
- `shared/src/types.ts:710-725` — `GameEvent` union; add `FoghornEvent`.
- `shared/src/constants.ts:199-210` — `CONFIG.smoke` is the placement precedent; add `CONFIG.foghorn` right after it (server-authoritative cadence only).
- `shared/src/constants.ts:739-743` — `sanitizeClassId` is the exact string-enum sanitizer pattern to copy for `sanitizeHornId`.

**server/**
- `server/src/game/signals.ts:864-880` — the wounded-smoke row is the structural template; **but the foghorn must NOT copy its `losClear()` call** and must vary its payload per observer.
- `server/src/game/signals.ts:160-164` (`sightOf`), `:905-934` (`SIGNAL_REGISTRY`), `:943-947` (compile-time exhaustiveness).
- `server/src/game/world.ts:229-241` (`ShipRecord`), `:2325-2330` (`emitMuzzleFlash` — per-tick emit precedent), `:2195` (`actSeq` consume pattern), `:561` (`pending`).
- `server/src/game/inputs.ts:74-89` — `isActSeq`/`numericFieldsFinite`; `hornSeq` validates identically.
- `server/src/rooms/roomOptions.ts:19-49` (`JoinOptions`), `ArenaRoom.ts:448-473` (identity fields sanitized in `onJoin`, NOT in `sanitizeRoomOptions`).

**client/**
- `client/src/audio/context.ts:69-83` (bus graph), `:109-112` (`play`), `:145` (gain ramp), `:153-166` (the only buffer-source code today).
- `client/src/audio/twinMap.ts:20-47` — twin table; widen its key to an `AudioCueId` that includes the horn.
- `client/src/input/keyboard.ts:20`, `:308-331` (`buildBindings`, F reserved-inert at `:318`), `:335-339` (`edge()`), `:110` (`OVERLAY_KEYS`).
- `client/src/render/smoke.ts:164-280` — the pooled, server-time-TTL transient-list pattern to mirror for chevrons.
- `client/src/render/hud.ts:427-437` — the screen-edge geometry pattern (`screenW`/`screenH` insets); `stage.ts:114-158` — `hudRoot` is the screen-locked, UI-scaled parent.
- `client/src/render/effects.ts:20-30` (`EffectKind`), `:83-85` (fog-immune set), `:44-61` (the motion house rule).
- `client/src/net/roomBindings.ts:521-527` (pulse-event switch — the natural home for `case 'fh'`), `:101-103` (the `audio` dep's structural type — widened by a per-play gain option).
- `client/src/ui/settings.ts:78-95` — `bindingRows()`, which currently documents F's deliberate absence.
- `client/src/config.ts:1244-1322` (`smoke` block) — `foghorn` goes directly after it, before `net`.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- add `HORN_IDS` (exactly one entry, `'standard'`), `HornId`, `sanitizeHornId()`, and `CONFIG.foghorn { cooldownMs: 1500 }` -- one catalog and one sanitizer so server and client agree on what a horn id is; cooldown is sim-authoritative so it lives in shared CONFIG.
- [ ] `shared/src/types.ts` -- add `hornSeq` to `InputMsg` and `FoghornEvent` (`{k:'fh', h: HornId, b?, v?, self?, x?, y?}`) to `GameEvent`, documenting which field group each observer mode gets -- the honk rides the existing per-tick counter channel and the payload's shape is the anti-cheat contract.
- [ ] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 26 -- a new event kind and a new input field are wire-shape changes.
- [ ] `server/src/game/inputs.ts` -- validate `hornSeq` exactly as `actSeq` is validated -- malformed input drops the whole message, unchanged.
- [ ] `server/src/game/world.ts` -- add `horn`, `nextHonkAt`, `lastHornSeq` to `ShipRecord`; consume `hornSeq` with `max()`; emit one `fh` into `pending` when alive, not a drone, and `now >= nextHonkAt`, then arm the cooldown -- the server is the only authority on whether a honk happened.
- [ ] `server/src/game/signals.ts` -- add the `foghorn` row + registry key: spectator short-circuit returns the position payload; the fogged path computes distance, resolves the tier from the three clamped bounds, **demotes it one tier when `losClear()` fails** (tier 3 blocked ⇒ no event), returns bearing + tier + horn id; the honker gets `self:true` -- this is the sixth declared perception exception and the first partial LOS carve-out; the demotion is a single step applied after tier resolution, never a second set of bounds.
- [ ] `server/src/rooms/roomOptions.ts` + `server/src/rooms/ArenaRoom.ts` -- accept an optional `horn` join option, sanitize it in `onJoin` the way `cls` is sanitized, pass it to `addShip` -- the cosmetic seam; no roster schema field.
- [ ] `client/src/audio/horns.ts` (new) -- `HornVoice = {kind:'synth', layers, durationS, ...} | {kind:'sample', url}` and `HORNS: Record<HornId, HornVoice>` with the default standard horn as a layered synth voice -- the monetization seam: a future horn is one catalog entry, no wire or protocol change.
- [ ] `client/src/audio/context.ts` -- add `playHorn(hornId, gain)`: synth path (multi-oscillator + slow attack/long tail, ~1.8 s), sample path (lazy `decodeAudioData` with an in-memory cache), unknown-id and load-failure fallback to the default voice, and a `maxConcurrent` cap on live horns -- horns are longer and richer than any `ToneSpec`, so they get their own play path rather than an exemption to `MAX_TONE_S`.
- [ ] `client/src/audio/twinMap.ts` -- widen the twin table's key to `AudioCueId = ToneId | 'foghorn'` and add the horn's twin row -- the type-level exhaustiveness check is the accessibility floor's enforcement mechanism; the horn must not escape it.
- [ ] `client/src/input/keyboard.ts` -- bind F through `edge()` to a new `onFoghorn` hook, respecting overlay suppression and the refit modal -- F stops being inert; auto-repeat cannot machine-gun it.
- [ ] `client/src/sim/inputSampler.ts` -- carry a `hornSeq` counter incremented per accepted press -- same shape as `fireSeq`/`actSeq`.
- [ ] `client/src/render/foghorn.ts` (new) -- the screen-edge chevron layer: a server-time-TTL list of `{bearing, tier, t}` marks placed on a margin-inset ellipse in `hudRoot`, weight/alpha by tier, pooled graphics, global cap -- the visual twin, and the bearing surface amendment 4 said this story had to grow.
- [ ] `client/src/render/effects.ts` -- add a non-juice `horn` effect kind for the own-hull bloom -- your own honk needs a twin too, and it must survive `motion: 'off'`.
- [ ] `client/src/render/stage.ts` + `client/src/main.ts` -- add the chevron layer to `hudRoot`, wire the keyboard hook and the per-frame render call, and gate presses on alive-and-not-spectating -- standard wiring.
- [ ] `client/src/net/roomBindings.ts` -- add `case 'fh'`: play the horn at the tier gain (or 100% for self/spectator), spawn the own-hull bloom for self, push a chevron otherwise -- single fan-out point, mirroring `sm`.
- [ ] `client/src/net/connection.ts` -- send the persisted horn id in join options, sanitized on read -- mirrors how `cls`/`colorPref` already travel.
- [ ] `client/src/ui/settings.ts` -- replace F's documented absence with a real binding row -- the settings reference must list every bound key.
- [ ] `client/src/config.ts` -- add `CLIENT_CONFIG.foghorn` (tier gains 1 / 0.75 / 0.5, `maxConcurrent`, chevron geometry, TTL) after the `smoke` block -- presentation knobs stay client-side.
- [ ] `server/src/__tests__/foghorn.test.ts` (new) + `signals.test.ts` + `perception.test.ts` + `spectator.test.ts` + `goldenFrames.test.ts` -- cover the whole I/O matrix server-side, add the independently reimplemented `fh` oracle, and pin the registry count -- the invariant oracle is this story's definition of done.
- [ ] `client/src/__tests__/foghorn.test.ts` (new) + `keyboard.test.ts` + `settings.test.ts` + `tones.test.ts`/`twinMap.test.ts` + `roomBindings.test.ts` -- cover tier→gain mapping, fallbacks, the concurrency cap, chevron TTL/placement, F's new behavior, and the twin row; update the two tests that currently pin F as inert and absent -- those two pins are now wrong by design.

**Acceptance Criteria:**
- Given a captain in a live match, when they press F, then a ~1.8 s horn sounds for them at full volume, an own-hull bloom appears, and no chevron is drawn for their own honk.
- Given two captains separated by an island, when one honks from inside the other's truesight, then the listener hears it at 75% rather than 100%; and given the same pair at tier-3 distance, then the listener receives no event at all.
- Given any fogged listener, when a honk reaches them, then the frame's payload contains no `x`, no `y`, no ship id, and no field from which the honker's position can be reconstructed — only bearing, tier, and horn id.
- Given the perception invariant suite, when it runs, then `fh` is enumerated as a declared exception with its own oracle, and the master invariant test still passes for every other row.
- Given `motion: 'off'`, when a honk arrives, then the chevron still appears, points the same way, and carries the same tier weight.
- Given a captain who honks twice inside the cooldown, when the second press lands, then the `denied` cue plays, nothing goes on the wire, and no second horn sounds.
- Given a horn id the client does not know, when the event arrives, then the default horn plays rather than silence or a throw.
- Given `npm run check`, when it runs, then lint, all three type-checks, and the full suite pass with the new tests included.

## Design Notes

**Eric's rulings this cycle** (recorded in full as amendments 51-57 in `epic-4-context-amendments.md`): build the sample seam but ship a synth horn; the wire carries a horn variant id; bearing + tier, never position; tiers scale with the listener's effective ranges; the visual twin is a screen-edge chevron; **islands muffle a honk by one tier**; F as reserved; 1.5 s cooldown plus a mix cap.

**Why bearing-only is the smaller channel.** The story's own line is "every honk is a bearing I chose to give away." A position payload at radar range would be the largest disclosure in the game — wounded smoke, the current record holder, tops out at 495 u with a position. A bearing at 660 u tells a hunter which way to look and nothing more; triangulating it costs the listener movement and time, which is the counterplay.

**Why islands muffle rather than block or ignore.** Islands stay absolute for every *sensor*; the foghorn is not a sensor return but a chosen broadcast, and low-frequency sound genuinely diffracts around rock — so a hard block was wrong. But letting it through unattenuated was wrong too, and Eric's reason is forward-looking rather than physical: **terrain has to keep working as a hiding mechanism, or a future revived sound sensor arrives in a world where islands mean nothing to audio.** One tier of demotion buys both — you can still be heard from behind a rock, but a rock always costs the honker reach, and at the outer band it costs them the honk entirely. Note the demotion is applied once, after the distance tier resolves, so exactly one LOS test exists in the row and no second set of bounds can drift from the first.

**Tier bounds, worked:** at base stats a listener has `sight = 330`, so the bands are 330 / 495 / 660 — exactly the three numbers Eric named. An intel-boosted listener with `sight = 400` gets 400 / 600 / max(radar, 600). A dazzled listener with `sight = 200` gets 200 / 495 / 660 — the `max()` against `muzzleFlash` is what stops dazzle from also deafening them.

**The synth horn is not a beep.** A ship's horn is a small number of low partials with slight detuning (the beating is the character), a slow attack, and a long tail — the same recipe a real horn synth uses. It gets its own play path rather than an exemption to `MAX_TONE_S`, which keeps that ceiling meaningful for the 24 short cues it was written for.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), all three type-checks pass, full suite green including the new server and client foghorn tests.
- `npm test -w server` -- expected: perception invariants pass with `fh` enumerated as a declared exception; registry count pin updated.
- `npm test -w client` -- expected: tier→gain, fallback, cap, chevron TTL/placement, and the updated F pins all pass.
- `node server/scripts/*.mjs` smokes -- expected: unchanged behavior; a PV bump must not break any smoke's join.

**Manual checks (if no CLI):**
- Two clients in one room: honk from outside truesight and confirm the listener gets a chevron pointing the right way at reduced volume and no hull, contact, or position appears.
