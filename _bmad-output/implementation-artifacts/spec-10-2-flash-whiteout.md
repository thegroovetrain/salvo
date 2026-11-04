> *Renumbered 2026-11-04 (Eric): Story 10.9 is now **Story 10.2**; How-to-Play is 10.14 (was 10.8); the first-minute objective / beacons is 10.8 (was 10.2). Table: epics.md Epic 10 intro.*

---
title: 'Story 10.2 follow-up: the Flash Shell as a whiteout'
type: 'feature'
created: '2026-10-29'
status: 'review'
baseline_revision: '3f4320ee'
final_revision: 'see the PR head (code + record on worktree-flash-whiteout; PR to development)'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-2-the-flash-shell-and-the-four-buoys.md'
---

## Intent

**Problem:** the FLASH SHELLS restored in cycle 208 dazzled by shrinking a victim's sight to a quarter for 10 s — a number on a hole, with no screen event to match "a flash". Eric 2026-10-29: *"I'd like to change the way the flash shells work fundamentally … it quickly burst[s] into a black circle that quickly wipes to white and then disappears … my screen just straight up turns completely white over 0.5s, stays white for 1s … 'returning to normal sight' is over 8.5s. It will start clearing out around your ship first, and grow out from there … And lets reflect this in what bots can 'see' and for how long."*

**Approach (epic-10 amendment 5):** one shared law, `effectiveSight(stats, dazzledUntil, now)` = the clear circle (0 u through ramp 0.5 s + hold 1 s, linear to full sight over 8.5 s; radar never an input; a re-flash restarts), run by the server's perception for captains and bots alike and by the client's three sight mirrors; on the victim's screen ONE DOM overlay above every chrome rung goes white, holds, then fades with a radial hole at the own ship whose radius is that same circle; the burst draws a 150 u disc black → white → gone for everyone who sees the detonation (a one-bit `f` tag on the burst event). Built by `/orchestrate` (shared on Fable; server and client on Opus; the burst tag on Opus; gate on Fable ×2 + Codex).

## What changed

### shared — the law (wave 1, Fable)
- `constants.ts` `CONFIG.flashShells`: `rampMs 500`, `holdMs 1000`, `clearMs 8500` replace `durationMs` / `sightFraction` (`radius 150`, `hits`, `arc`, `shellSpeed`, `shellRadius` kept).
- `sim/sight.ts`: `effectiveSight(stats, dazzledUntil = 0, now = 0)`; `flashElapsedMs`, `flashClearFraction` (0..1), `FLASH_WINDOW_MS` (the sum, 10 000); fail-closed on a NaN mark or clock.
- `types.ts`: `OwnShip.dazzledUntil` = hit + 10 s (the one signal; the client derives the timeline); `BurstEvent.f?: true` appended last — the flash burst's tag under the burst's existing gate. `index.ts`: PV 93 → 94.

### server — perception and the mark (wave 2a + the tag, Opus)
- `signals.ts` `sightOf(me, now)` = the curve; the burst row sets `f` when the originating shell carries the server-internal `flash` tag; `dazzleShells.ts` stamps `FLASH_WINDOW_MS`; `applyFlash` keeps `max` (restart); `drones.avoidHulls` keeps the undazzled one-arg read (amendment 4l).
- Tests: the doctrines FLASH block on the curve (blind at hit + 1 s; 0.2 of the clear hides a target at 0.4 R; half the clear shows it; full at 10 s; a re-flash back to 0); a flashed BOT's observe view holds no contact at 100 u at hit + 1 s and holds it again once the circle passes 100 u with byte-identical radar paints; `f` only on flash bursts with the recipient set unchanged; the SIX exceptions six; registry 26.

### client — the mirrors, the overlay, the burst (wave 2b + the tag, Opus)
- `render/fog.ts` / `radar.ts` / `projectiles.ts`: `setDazzle(until, now)`; the fog hole and the radar dim mask follow the curve quantized to 1/60 of sight (≤ 61 rebakes per 10 s), the enemy-track cull unquantized; own tracks keep the undazzled ring.
- `ui/flashWhiteout.ts` (new): pure `whiteoutModel(until, now, ownStats, screen)` → `{hidden, alpha, holeR}`; one fixed white `div` at z 1300 (above the class bay's 1200), `pointer-events: none`, `mask-image` radial hole at the own ship's screen position with a 10 % feather (skipped at motion off); hidden in spectate; fed once per alive frame from `updateDazzle` (net → render, nothing writes back).
- `render/flashBurst.ts` (new): `flashBurstModel(elapsed)` → black through 0.15 s, colour-fade to white over 0.25 s, alpha out over 0.2 s; `roomBindings.ts` draws the disc for a burst with `f` or an own flash claim, the ring otherwise. `CLIENT_CONFIG.flashBurst` / `flashWhiteout`.
- `ui/boonCopy.ts` rows: RADIUS 150 U · WHITE 1.5 S · CLEARS 8.5 S (from CONFIG); the SIGHT row and `fractionText` deleted.

## Review Triage Log

### 2026-10-29 — Gate (Fable Blind Hunter + Fable Edge Case Hunter + Codex `gpt-5.6-sol`, per `git diff 3f4320ee..HEAD`)

Verdicts: Codex FIX-FIRST (5), Blind Hunter FIX-FIRST (1 fix + 1 question), Edge Case Hunter FIX-FIRST (2 Eric-level + 1). Agreement picture and the orchestrator's triage:

- **All three — an intercepted flash round flashes everyone at its stop point but emits only a boom, so nobody sees the disc** → **F1**: the interception path also pushes the `f`-tagged burst at the stop point under the burst row's gate; red-first in `doctrines.test.ts`.
- **Edge Case Hunter #1 (CONFIRMED by script) + the agent's own note — the flashed victim never receives the burst** (its sight is 0 in the hit's tick) → Eric: *"Victim sees the disc too"* (amendment 5h) → **F2**: the burst row is visible to an in-radius observer for `f` bursts only; the recipient-diff test becomes "with f = without f ∪ in-radius"; SIX exceptions six.
- **Blind Hunter F1 (CONFIRMED by probe) — a re-flash dropped the white to 0 for a frame before ramping again**, against amendment 5e → **F3**: the overlay ramps from where it is.
- **Codex #2 (CONFIRMED) + Blind Hunter F4 — `withinSight` inclusive at range 0 admits a point at exactly the observer's centre (a co-located hull, a cloud stood in)** → **F4**: `!(range > 0)` fails closed.
- **Codex #3 (CONFIRMED) — the 40 u dead-reckoning margin kept enemy tracks beyond the circle under the fading white** → **F5**: margin 0 while a mark is pending.
- **Codex #5 (CONFIRMED, 1e-9) — the quantizer's epsilon could nudge the fog hole a hair past the server circle** → **F6**: clamped to `effectiveSight`, just-below-step test.
- **Edge Case Hunter #3 (PLAUSIBLE) vs Blind Hunter (refuted: `finished` frames spectate)** — white over the results screen → **F7** resolved by a test (RED: the results broadcast precedes the first spectate frame, so one render could run with the overlay over the modal → `presentResults` hides it and `renderWhiteout` gates on `resultsVisible()`).
- **Edge Case Hunter #4 (low)** — two bot gates read the undazzled ring → **F8**: `effectiveSight` with the bot's own mark (Eric: "reflect this in what bots can see").
- **Both hunters (perf note)** — ~60 fog + ~60 dim-mask rebakes per flash → **F9**: `sightSteps` 60 → 30; staging judges.
- **Accepted, recorded:** the overlay and mirrors run on the client's server-clock estimate (Codex #4 — the same model as every timed window; the Blind Hunter's 1 429-sample probe never drew the hole wider than the server circle); a flashed-then-sinking captain sinks under white (sink-entry keeps every window).
- **Traced clean by all three:** every sight-tier gate collapses at 0 and the radar rows never read `sightOf` (amendment 210 intact); the growing boundary re-reveals a shell the moment the circle reaches it while the client cull drops it in step (no 10 s ghost); `f` only on flash bursts with the recipient set unchanged (then widened by 5h); the own `you` row and own ordnance unaffected; spectate/results/teardown hide and destroy the overlay; NaN/0 `pxPerU` → no hole, never a malformed mask; the PV single-sourced.

## Verification

| Check | Result |
|---|---|
| `npm run check` | GREEN 2026-10-29 (exit 0; 0 lint errors, 2 pre-existing max-lines warnings; 12 hook tests) |
| shared / server / client | 1216 → 1223 (50 files) / 2840 → 2848 (106 files) / 4152 → 4186 (139 files) |
| `matchSmoke` / `weaponsSmoke` first-try | both OK first-try after the gate, one at a time (matchSmoke self-booted on 2599; weaponsSmoke against a scratch server on 2699; both killed, both ports free after) |
| goldenFrames | passed unchanged through every wave (the recorded scenario carries no flash) |
| Built frames | approved by Eric 2026-10-29 (amendment 5g) |

## Residual risks

- The fog edge and the overlay's hole can differ by up to one 1/60 step of sight (≈ 8 u at base): the white's edge sits on or just outside the fog edge, never inside it.
- The overlay is a DOM element: a modified client can strip it, but the server withholds everything beyond the clear circle, so stripping buys only the dim world under the white.
- A burst whose `f` tag a very old client ignores renders as the ordinary ring — PV 94 gates the join anyway.

## Owed to Story 10.14

- How-to-Play: the FLASH SHELLS entry (whiteout, 1.5 s blind, 8.5 s clearing from the ship).
- GDD / catalog-v3 R33 dated stamp ("DAZZLE" → the whiteout); DESIGN.md: the DOM z-scale gains the 1300 screen-effect rung.
