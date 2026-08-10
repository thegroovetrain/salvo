---
title: 'Story 4-7: The Real-Time Sound Map'
type: 'feature'
created: '2026-08-10'
status: 'done'
baseline_revision: 'd89e019'
final_revision: '1740cb5'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-4-7-sound-map-questions.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The ocean is silent. All 24 client audio call sites are self-cues — your weapons, your damage, your economy — so an enemy battleship firing 400u away produces a muzzle flash and no sound, and a hull exploding or sinking in front of you makes none either. Story 4.7's job is the real-time sound map, but its written AC is stale in three ratified ways (amendments 4, 6, 216): the listening-ring grammar left scope on 2026-08-04, four of its six named cues already shipped, and "the 13 existing tones" is really 25 + the foghorn. Eric's 2026-08-10 ruling tabled the whole sonar family until after public beta, which makes the obvious fix — hearing enemies — dangerous, because audible enemy gunfire at range IS a passive acoustic sensor.

**Approach:** **Reading C (Eric ruling, 2026-08-10): voice only what the player may ALREADY legitimately perceive.** A cue may fire only for an event the client has already received through the existing perception boundary, and may encode only information that event already carries. A report on a muzzle flash already drawn on screen at its true point discloses nothing new — so the ocean becomes audible with **no new wire field, no new event kind, no new perception exception, and no server change**. Six new tones ride events already arriving (`mz`, `boom`, `burst`, `sp`, witnessed `sunk`, own-HP band crossings), attenuated and stereo-panned client-side from positions the client already holds — which finally makes the `monoAudio` setting mean something instead of being an audible no-op.

## Boundaries & Constraints

**Always:**
- **The Reading-C test, applied per cue:** a modified client that deleted this cue learns nothing it did not already have. If a cue needs a fact not already on the client, it is out of scope — that is a perception decision, not a tone.
- Every new cue gets a `TONE_TWINS` row naming a real surface (the table is type-exhaustive; omitting one fails `tsc`).
- New `ToneSpec`s stay under `MAX_TONE_S` (150ms) — amendment 57's ceiling is not relaxed, and a longer cue would need its own play path.
- Distance-scaled audio is expressed on the eighths ladder (`CONFIG.vision.*`), never a fresh literal.
- Same-source rate limiting reuses the ratified 300ms `ToneFloor` grammar — **no new floor constant is invented** (amendment 37).
- Own-fire double-sounding is prevented: a `mz` at your own hull is already voiced by `fireGun`/`fireCannon`.
- Cyclomatic complexity ≤ 10 (ESLint error). `handleBoom` is already ~6 — extract rather than inline.

**Block If:**
- Any cue would require a new wire field, event kind, or perception exception → HALT (that is Reading B, which Eric did not choose).
- A change would move a shared `CONFIG` gameplay tunable or `PROTOCOL_VERSION` → HALT.
- Ratifying the existing draft timbres (the `heal` tone, fit-tier envelopes and per-category detunes) requires Eric's ear → do not retune them unattended; ledger them.

**Never:**
- No listening ring, compass rose, or pip grammar (amendment 1, widened 228).
- No positional or on-water audio for the kill leader (amendment 216's "ever" is absolute; 220 closed the surface list at three).
- No second foghorn variant (Eric-gated content, amendment 52). No sound files (amendment 57, NFR9).
- No design-doc edits — the "13 tones" / "deferred denied tone" / "listening ring backstop" drift is RECORDED, not fixed (Eric-gated 7-5 batch).
- No aggregate flash/sound budget, tier table, or squint test — all Story 4.8's.
- No cue for `blip`/`wk` (radar paints) or `spawn` — continuous/ambient audio is its own design and is not ruled.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Enemy fires in the halo | `mz` at 300u from own hull | `gunReport` at partial gain, panned toward the flash's screen side | — |
| Own gun fires | `mz` within one hull length of own ship | NO `gunReport` — `fireGun` already sounded it | — |
| Shell connects | `boom` with `hit` | `impact`, attenuated + panned | — |
| Shell falls in water | `boom` without `hit`, or own `sp` | `splash`, attenuated + panned | — |
| Gun shell bursts | `burst` at the clicked point | `impact` (report-then-boom reads as one event pair) | — |
| Witnessed sinking | `sunk`, `seen`, not own, not your kill | `sunkWitness` at the last-known contact position | No position → play unpanned at floor gain |
| Fog sinking (public register) | `sunk`, no `seen` | NO cue — a feed line only; panning it would re-leak location | — |
| HP crosses below 50% / 25% | own `hp/maxHp` band change downward | `hpHurt` / `hpCritical` once per crossing | `maxHp <= 0` or null hp → no cue, never reads as 0 |
| HP recovers then re-crosses | heal above 50%, damage below again | Cue fires again (re-arms on the upward crossing) | — |
| Firefight, 6 hulls | many `mz` in one second | At most one `gunReport` per 300ms floor | — |
| Spectating | no own ship | Listener position = `cameraCenter()` (foghorn precedent) | — |
| Muted / mono | `muted`, `monoAudio` | Silent / panned sources fold to centre | Existing bus handles both |

</intent-contract>

## Code Map

- `client/src/audio/tones.ts` -- the pure tone table (`ToneId` union, `TONES`, `MAX_TONE_S`); gains 6 specs + the pure world-cue and HP-band helpers. Edge-detection idiom to match: `stormEnterEdge` (:299), `audioCues` (:284).
- `client/src/audio/twinMap.ts` -- the type-exhaustive twin table; 6 new rows required or `tsc` fails.
- `client/src/audio/context.ts` -- the only AudioContext toucher. `play()` (:136) and the `sink` getter (:266) gain optional pan/gain; a `StereoPannerNode` inserts before `sink`, which is exactly what the `mono` bus (:96-118) was pre-plumbed for.
- `client/src/net/roomBindings.ts` -- handlers `handleMuzzle` (:654), `handleFallOfShot` (:659), `handleBoom` (:921), `handleBurst` (:945), `handleSunk` (:962); `deps.audio` interface (:114-126); `nearOwnShip` (:891) is the own-fire suppression idiom; `BindState` (:306) holds the new `ToneFloor`s.
- `client/src/render/gunneryFeed.ts` -- `ToneFloor` (:75) and `ImpactDedup` (:57): reuse, do not reinvent.
- `client/src/main.ts` -- `ownTier1`/`ownStatus` (:2390, :465) hold both `hp` and `stats.maxHp`; the HP-band edge belongs here (roomBindings has no `maxHp` seam) beside `stormEnterEdge` (:2413).
- `client/src/config.ts` -- `CLIENT_CONFIG`; new `audio` block in the `gunnery` (:653) house style.
- `shared/src/constants.ts` -- `CONFIG.vision` eighths ladder (:191-236) and `damageBands` (:440); READ ONLY, nothing moves.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/audio/tones.ts` -- add 6 `ToneSpec`s (`gunReport`, `impact`, `splash`, `sunkWitness`, `hpHurt`, `hpCritical`) to the `ToneId` union and `TONES`, each under `MAX_TONE_S`, each with a comment arguing why it cannot be confused with its register neighbours (the `hitCall`/`bounty` precedent) -- the catalog is the story's substance.
- [x] `client/src/audio/tones.ts` -- add pure `worldCue(dxScreen, dyScreen, reachU)` returning `{pan, gain}` (or null past reach) and `hpBandEdge(prevFrac, frac)` returning which band was crossed downward -- pure so they are unit-testable without an AudioContext.
- [x] `client/src/audio/context.ts` -- extend `play(id, opts)` with optional `pan` (-1..1) and `gain` (0..1); insert a `StereoPannerNode` only when `pan` is supplied, keeping the existing path byte-identical when it is not -- the mono bus already folds panned sources.
- [x] `client/src/config.ts` -- add a `CLIENT_CONFIG.audio` block: per-cue reach rungs (referencing `CONFIG.vision.*`, never literals), the gain floor, and the reused 300ms floor value -- one documented home for the feel knobs.
- [x] `client/src/net/roomBindings.ts` -- sound `mz` (suppressed at own hull), `boom` (hit → `impact`, miss → `splash`), `burst` → `impact`, `sp` → `splash`, and witnessed `sunk` → `sunkWitness`; each through its own `ToneFloor` and the shared listener-position helper -- extract a `worldTone()` helper so `handleBoom` stays under complexity 10.
- [x] `client/src/main.ts` -- drive `hpBandEdge` from `ownStatus()` and play `hpHurt`/`hpCritical` on downward crossings -- main.ts is the only place holding both `hp` and `maxHp`.
- [x] `client/src/audio/twinMap.ts` -- add the 6 twin rows naming real surfaces (muzzle flash, spark/pierce, splash mark, sink plume, HP rail colour + pulse + your own smoke plume).
- [x] `client/src/__tests__/tones.test.ts` -- extend `ALL_TONE_IDS` (exhaustive, asserted against `TONES`) and cover the I/O matrix: reach cutoff, gain floor, pan sign, own-fire suppression, HP band crossings incl. re-arm and the null-hp case.
- [x] `client/src/__tests__/roomBindings.test.ts` -- cover each new call site: own `mz` silent, enemy `mz` sounds, unseen `sunk` silent while seen `sunk` sounds, the 300ms floor collapsing a salvo.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- record the twin-walk findings, the ledgered doc drift, and what 4.8 inherits (every new cue is an attention/photosensitivity participant).

**Acceptance Criteria:**
- Given an enemy fires inside the 5/8 muzzle halo with clear LOS, when the `mz` arrives, then a `gunReport` sounds attenuated by distance and panned toward the flash already drawn on screen, carrying no identity of any kind.
- Given the same shot from a shooter outside the halo or behind an island, when nothing arrives, then nothing sounds — the audible set is exactly the perceivable set, with no new disclosure.
- Given `npm run check`, when it runs, then lint, type-check and all tests pass with complexity ≤ 10 everywhere.
- Given the twin table, when a cue is added without a twin row, then `tsc` fails — and every new row names a surface a reviewer can go look at.
- Given `monoAudio` is on, when a panned world cue plays, then it folds to centre and its information survives in the visual twin; given `muted`, nothing sounds.
- Given the wire contract, when this story lands, then `PROTOCOL_VERSION` is unchanged at 33, no `shared/` gameplay tunable moved, and no file under `server/` changed.

## Spec Change Log

_(empty — no bad_spec loopback was triggered; the intent contract held through implementation.)_

## Review Triage Log

### 2026-08-10 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 7, low 3)
- defer: 11
- reject: 1
- addressed_findings:
  - `[medium]` `[patch]` The own-hull burst suppression used a 124u hull ball against a 15-30u blast, silencing an enemy burst 100u off the beam that never touched the player and emits no `boom` — a detonation filling the screen in silence. Re-keyed to the blast radius the ring is actually drawn at, so the silence and the picture agree.
  - `[medium]` `[patch]` The self-private `sp` fall-of-shot shared a `ToneFloor` with public splashes, so ambient world noise could starve the one FR16 cue carrying information the shooter cannot otherwise obtain. Given its own floor; the same-frame visible-own-miss pair now collapses on a point claim.
  - `[medium]` `[patch]` `sunkWitness` was rate-limited like a salvo though a sinking is a per-hull terminal event — two hulls going down 200ms apart produced one groan. Floor removed.
  - `[medium]` `[patch]` The HP-band stings had no bound at all; DAMAGE CONTROL regen oscillating across a band under sustained fire could re-fire them. Bounded with the reused 300ms floor; the hysteresis margin left explicitly to Eric.
  - `[medium]` `[patch]` `client/src/audio/context.ts` was entirely untested including the story's own mono acceptance criterion. 15 tests added over a fake AudioContext, mutation-checked.
  - `[medium]` `[patch]` TWIN WALK F1 — the predicted ability-denial path played `denied` while the hotbar, its only twin surface, is hidden after death: a live instance of the amendment-60 defect shape. The server-denial path already carried the guard; mirrored to the predicted path.
  - `[medium]` `[patch]` TWIN WALK F2 — the `denied` tone was unbounded while its pulse is capped at one trigger per 300ms, so a click 80-300ms after another sounded with no visual. Bounded by a `ToneFloor` reading `deniedFire`'s existing `PULSE_RATE_MS`.
  - `[low]` `[patch]` `UNPLACED_CUE` was a shared mutable object handed to every caller as its `opts` argument. Now a fresh literal per call.
  - `[low]` `[patch]` `sunkPosition()` was resolved twice across a mutation, the defect class already fixed once in `worldCue`. Resolved once and passed to both consumers.
  - `[low]` `[patch]` Three comments stated mechanisms that were not true (the splash collapse credited the timestamp floor with coordinate logic; `worldCue` claimed a world dx IS a screen dx; the `tones.ts` header still called the file a pure leaf table after it took value imports). Corrected — comments are load-bearing in this codebase.

_Rejected (1): the suggestion to distinguish a `boom` whose victim id was stripped by perception from a genuine miss, so a fogged hit would sound as `impact` rather than `splash`. Implementing it would re-leak exactly what the `boom` row's id-stripping protects and would require a new server marker — Reading B, which Eric did not choose. Sounding `splash` is correct precisely because it matches the visual the client already draws._

## Design Notes

**Why panning is free here, and why it is not a new channel.** Amendment 83 forbids re-evaluating a frozen paint against live state; this is not that. Every panned cue's position is already on the client *and already drawn on screen* — the pan merely points your ear at the pixel your eye can already find. A modified client that stripped panning would learn nothing, which is the same argument that made wake chop client-side (amendment 211). Panning is therefore restricted to **world** cues whose twin renders at a true position; self cues (`damage`, `point`, the fit family, `hpHurt`) stay centred, because a bearing to yourself is meaningless — the foghorn's own-honk bloom made this ruling already (amendment 55).

**Why the fog sinking stays silent.** The Public Register gives you every captain's death at any range, but its location is protected by the per-observer `seen` stamp (amendments 29-34). `sunk` carries no position, so the only position available is the last-known contact — and sounding an unseen sinking, even unpanned, would confirm "that death happened near where I last saw them." The kill-feed line already carries the fact; the cue carries the *place*, so the cue is gated exactly where the plume is.

**The low-HP sting doubles as wounded smoke's voice — which is why Q3 needed no separate answer.** Amendment 49 parked "should smoke be voiced" here, noting smoke is a continuous STATE and the tone system is one-shot. But the smoke tiers and the HP rail bands are the *same two thresholds* (`CONFIG.damageBands` 0.5 / 0.25). So the sting at each downward crossing IS the moment your smoke starts — one one-shot cue, no continuous-audio class invented, and the twin row can honestly name the plume alongside the rail.

**Report-then-boom is the payoff.** A gun shot emits `mz` at the muzzle and `burst` at the clicked point, seconds apart at range. Sounding both gives the crack and then the distant thud — real gunnery, from two events already on the wire, costing nothing.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check (all three workspaces) + full suite green, with the new tone/binding tests included.
- `npm test -w client` -- expected: `tones.test.ts`, `twinMap.test.ts`, `roomBindings.test.ts` green; `ALL_TONE_IDS` exhaustive against `TONES`.
- `git diff --stat -- server/ shared/` -- expected: empty for `server/`; `shared/` untouched (or read-only imports only).
- `grep -n "PROTOCOL_VERSION" shared/src/index.ts` -- expected: still 33.

**Manual checks (if no CLI):**
- With the dev server already running (never start it), fire near a drone and confirm the crack precedes the distant burst; sail to the halo edge and confirm the report fades to the floor rather than cutting; toggle MONO in settings and confirm a panned cue recentres without losing presence.

## Auto Run Result

Status: done — Story 4.7 landed as cycle 74 (0.17.74), client-only, `PROTOCOL_VERSION` unchanged at 33.

**What shipped.** The ocean makes noise. Before this cycle every one of the client's 24 audio call sites
was a self-cue: an enemy battleship firing 400u away produced a muzzle flash and silence, and a hull
exploding or sinking in front of you made none either. Eight cues now ride events the client already
receives — `mz` → `gunReport` (suppressed at your own hull), `boom` hit → `impact`, `boom` miss →
`splash`, `burst` → `impact`, `sp` → `splash`, witnessed `sunk` → `sunkWitness`, and own damage-band
crossings → `hpHurt`/`hpCritical` — attenuated and stereo-panned from positions the client already
holds. Under Eric's Reading C ruling this discloses nothing: a report laid on a flash already drawn on
screen tells you what your eye could already find, so there is no wire change, no server change, no new
perception exception, and the declared-exception count still stands at six. A side effect worth naming:
`monoAudio` has been an audible no-op since Story 2.3 because nothing was panned — it now protects
something real.

**Files changed.**
- `client/src/audio/tones.ts` — six new `ToneSpec`s (all under `MAX_TONE_S`, all stamped unratified draft) plus the pure `worldCue()` and `hpBandEdge()` helpers.
- `client/src/audio/context.ts` — `play()` gained optional `pan`/`gain`, inserting a `StereoPannerNode` only when panned so every existing call site is byte-identical; now covered by tests for the first time.
- `client/src/audio/twinMap.ts` — six twin rows (the table is type-exhaustive; omitting one fails `tsc`).
- `client/src/audio/hpSting.ts`, `client/src/audio/deniedCue.ts` — new pure modules extracted so their call-site logic is testable rather than trapped in `main.ts`.
- `client/src/net/roomBindings.ts` — the world-cue wiring, the listener resolution, and the per-family rate limiters.
- `client/src/main.ts` — the HP-sting call site and the four `denied` sites, now guarded and floored.
- `client/src/config.ts` — a `CLIENT_CONFIG.audio` block (`worldFloorGain`, `panMax`).
- Tests across `client/src/__tests__/` and `client/src/audio/__tests__/`.

**Review findings.** Four gates ran: an adversarial pass, a cross-model Codex pass on the same diff,
then step-04's Blind Hunter and Edge Case Hunter, plus the twin walk. The first two gates independently
confirmed the same three defects — the victim double-sound, `worldCue`'s reachable "dead code" cutoff,
and a stale own-ship pose surviving into spectate — which were fixed with regression tests verified
failing first. Step-04 then triaged 10 patches (7 medium, 3 low), 11 defers, 1 reject. The twin walk
audited all 32 call sites that can sound a cue and found one live amendment-60 defect plus one channel
asymmetry, both fixed.

**Verification.** `npm run check` exits 0: lint (0 errors), type-check across all three workspaces, and
3937 tests (shared 684 / server 1060 / client 2193), up from 3826 at baseline. `git diff` against
`server/` and `shared/` is empty. `PROTOCOL_VERSION` is still 33. Every behavioural fix in the review
gates was pinned by a test verified to fail before it.

**Residual risks.** Three, all recorded in `deferred-work.md` rather than silently absorbed. (1) The six
timbres are unratified implementer draft — sound design is game design, and the listening pass with Eric
is the remaining half of this story's charter. (2) Feel numbers nobody has ruled on: the `mz` own-fire
suppression ball is 124u (37% of truesight), the gain floor and splash volume compound to an effective
0.06 for a distant own miss, and spectate is unfogged so a spectated late match becomes distant chatter.
(3) Story 4.8 inherits eight new audible cues whose visual twins animate, and the aggregate
photosensitivity budget it owns still has no mechanism — 4.8 should take its measurement against this
channel set, not the pre-4.7 one.
