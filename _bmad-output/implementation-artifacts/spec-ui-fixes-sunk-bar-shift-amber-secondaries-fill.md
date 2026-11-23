---
title: 'UI fixes: no hull bar on a sunk ship, the running Shift in amber, the secondaries bar full when fastest'
type: 'bugfix'
created: '2026-11-23'
status: 'in-progress'
baseline_revision: 'a737237880bd75ecfcc6d30967cfd1f63c86f64a'
review_loop_iteration: 0
context: []
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** Eric (2026-11-23), three HUD fixes, verbatim: *"1) when a ship is sunk, it should not have any more HP bars under its name. | 2) When my special ability is active, please highlight it in Amber (retain the pulsing). | 3) Reverse the secondary's cooldown bar so that it is Full when its at its highest attack speed, and Empty when at its lowest."* Today a sinking/sunk hull keeps one red block under its name (own wreck too, through spectate); the running Shift breathes in phosphor-bright; the SECONDARIES bar fills with heat (full = 1 shot/s, the slowest).

**Approach:** (1) Client-only: once the client knows a hull is sinking (the seen `sunk` event for contacts; own `hp <= 0` / not alive / sinking for the own plate) the plate's `blocks` is `null` — the name stays, the bar goes. The wire is untouched: a sinking contact still carries `hb: 1` (epic-5 amendment 16 non-disclosure; `hullBlocks` never returns 0). (2) The ability tile skin for `'active'` uses `C.amber` for border + glow; the existing breath keeps modulating it. (3) The SECONDARIES track fills `1 − heat` (rate is linear in heat, so this is exactly `(rate − hot) / (cold − hot)`).

## Boundaries & Constraints

**Always:** Name plate stays on a sinking hull (only the bar is removed); bar slot geometry is unchanged (no reflow — amendment 7(a)); the SECONDARIES bar keeps its one rect, color and alpha; the breath math (rate, amplitude, motion-off flat) is unchanged; a respawned/redeployed hull (`markSpawn`, own redeploy) shows its bar again.

**Block If:** Hiding the bar would require any server/wire change, or a new contact field.

**Never:** Change `hullBlocks()`, `Contact.hb`, `signals.ts`, or `PROTOCOL_VERSION`; enter the Shift into `amberPulseWinner` (Eric: retain the pulsing); recolor the Shift's refill bar or seconds text, the ready / cooling skins, or HULL REPAIR / SMOKE tiles; add a readout to the SECONDARIES bar; pin hex/colour literals in tests beyond relation to `C.amber`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enemy sunk in sight | `sunk` event `seen` for id X | X's plate: name drawn, no bar, from the event until the plate is gone | — |
| Enemy afloat | no sunk signal, `hb` 2 | bar of 2 amber blocks as today | — |
| Respawn reuse | id X sank, later `markSpawn(X)` | bar shows again | — |
| Unseen sinking | sunk with `seen` false, hull later enters name reach still sinking | bar shows 1 block (client has no signal; accepted) | — |
| Own hull sinking / sunk / spectating own wreck | `you.hp <= 0` or `!you.alive` or sinking | own plate: name, no bar | — |
| Shift running | `shiftActiveMsLeft > 0` | border + glow `C.amber`, alpha × breath | motion off → steady amber |
| Secondaries cold / hot | heat 0 / heat 1 / heat 0.5 | fill 1 / 0 / 0.5 of the track | heat missing → full (heat 0) |

</intent-contract>

## Code Map

- `client/src/render/contacts.ts` -- `ContactViews`/`FadingView`: `fv.blocks` → `look.blocks` (L243, L304); `sinkFlash`/`setSink`/`markSunk`/`markSpawn` (L153–171) -- add a per-view sinking flag that nulls `look.blocks`
- `client/src/render/nameplates.ts` -- `look.blocks === null` already hides the bar (L263)
- `client/src/net/roomBindings.ts` -- `openWreckWindow` (L2210) calls `contactViews.sinkFlash(id)` on a seen sunk -- the signal
- `client/src/main.ts` -- `updateOwnPlate` L1448 `OWN_PLATE_LOOK.blocks = …` -- null when own hull is down
- `client/src/render/console/skins.ts` -- `ABILITY_SKINS.active` (L58–62) -- `phosphorBright` → `C.amber`
- `client/src/render/console/barWeapons.ts` -- L173 `drawTrack(body, row.heat?.heat ?? 0, …)` -- fill `1 − heat` via a small exported pure helper
- `shared/src/sim/secondaries.ts` -- `secondariesIntervalMs(h)`, `CONFIG.secondaries.coldRatePerS/hotRatePerS` -- the relation the test checks
- `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` -- Hull Health Bar row (L330), HUD Bar (12.3) row (L355)

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/render/contacts.ts` -- add a `sinking` flag on the fading view, set by `sinkFlash`/`setSink`/`markSunk`, cleared by `markSpawn` (and on a fresh view); when set, `look.blocks = null` -- enemy bar gone once sunk
- [ ] `client/src/main.ts` -- `updateOwnPlate`: `blocks = null` when no `you`, `!you.alive`, `you.hp <= 0`, or the own hull is sinking (existing `isSinkingNow`/`ownSinking01` helpers); keep complexity ≤ 10 (extract a pure helper if needed) -- own bar gone once sunk, incl. spectate
- [ ] `client/src/render/console/skins.ts` -- `ABILITY_SKINS.active` border colour `C.amber` (width/glow/alpha unchanged) -- running Shift highlighted amber, breath kept
- [ ] `client/src/render/console/barWeapons.ts` -- export `secondariesFill(heat)` = `clamp(1 − heat, 0, 1)` and draw the track with it -- reversed bar
- [ ] tests -- `client/src/__tests__/`: (a) a contact view after `sinkFlash` places its plate with `blocks === null`, and after `markSpawn` with its blocks again; (b) the own-plate helper returns `null` for a down hull and `hullBlocks(...)` otherwise; (c) `abilitySkin('active', …).border === C.amber` and its border alpha follows the breath (lower at breath < 1); (d) `secondariesFill` equals `(rate(h) − hot)/(cold − hot)` with `rate(h) = 1000 / secondariesIntervalMs(h)` over a sweep of h, so full at cold and empty at hot -- contracts, not literals
- [ ] `DESIGN.md` (ux path above) -- append a dated 2026-11-23 note to the Hull Health Bar row (no bar once the hull is known sunk; wire unchanged) and the HUD Bar (12.3) row (running Shift breathes in amber; SECONDARIES bar full at the fastest rate, empty at the slowest) -- design source stays true; minimal edit

**Acceptance Criteria:**
- Given an enemy in name reach that sinks in sight, when its plate renders during the sinking window, then the name shows and no hull bar is drawn.
- Given the own hull is sunk and the player spectates the wreck, when the own plate renders, then no hull bar is drawn.
- Given the Shift is running, when the HUD bar draws, then its tile outline and glow are amber and still breathe (steady with motion off).
- Given the secondaries are cold, when the HUD bar draws, then the SECONDARIES bar is full; given fully hot, it is empty.
- Given the change, when `npm run check` runs, then it passes with no wire/PROTOCOL_VERSION change.

## Spec Change Log

## Review Triage Log

## Design Notes

The server keeps sending `hb: 1` for a sinking hull (`sinkingWindow.test.ts` pins it); the client only hides what it already knows from the declared `sunk` exception, so no new information reaches anyone. Readings of record for Eric's veto: the Shift's refill bar and seconds stay phosphor (only the tile highlight turns amber); the Shift's amber breath is not ranked by `amberPulseWinner` (DESIGN L369) because Eric asked to keep the pulse.

## Verification

**Commands:**
- `npm test -w client` -- expected: all pass
- `npm run lint` -- expected: 0 errors (complexity ≤ 10)
- `npm run check` -- expected: green (run once at the end)
