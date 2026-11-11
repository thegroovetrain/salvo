---
title: 'Story 10.13: The Sound Pass'
type: 'feature'
created: '2026-11-11'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Every sound in the game is one oscillator under 150 ms (`client/src/audio/tones.ts`); there is no engine sound and guns, water and hits read as console beeps. Eric (2026-11-04, amendment 6(l)): *"I want engine sounds and more realistic sounds overall."*

**Approach:** Add a layered WebAudio synthesis path (shaped noise, filters, saturation, a generated open-water reverb) beside the tone table, a continuous per-hull engine voice that follows throttle, speed and boost, and realistic cues for the slice's weapons, hits and events. Candidates are built first, auditioned by Eric on an artifact page bundled from the real modules, and only his picks are wired into the game.

## Boundaries & Constraints

**Always:** synthesis only, no sound file ships; client-only, `PROTOCOL_VERSION` unchanged, no server or `shared` change; every sound is made from data the client already receives (the perception invariant is untouched); everything rides the existing `effects → master → mono` bus so mute, the ad-break duck, volumes and mono audio keep working; a cue failure degrades to silence for that cue, never a throw; every audible cue has a visual-twin row in `audio/twinMap.ts`; ESLint complexity ≤ 10; tests assert graph and arithmetic contracts, never timbre, copy or bare literals.

**Block If:** Eric has not picked a candidate for a cue (it is not wired); the enemy-engine ruling, the cue list, or which existing cues are re-voiced is unruled at the wiring wave; any sound would need a new wire field or event.

**Never:** recorded samples; a sound that tells the player anything beyond sight ∪ radar that the frame did not already draw; touching the foghorn mechanic, the mute toggle semantics or the "Silly Is Sanctioned" wrapper; in-game copy; a settings row Eric did not ask for; committing an unpicked candidate into the game path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own engine | alive hull, throttle t, speed s, boost b | one engine voice whose pitch, brightness and level are a monotone function of t, s and b for that hull's profile | non-finite input holds the last good target |
| Engine gates | spectating, dead, match over, muted or ducked | engine voice silent (released), no orphan nodes; resumes on the next live frame | no context yet = no-op |
| One-shot cue | picked cue id + optional pan / gain / distance | layered graph on the effects bus, all sources stopped and collectable after the recipe's length | junk pan / gain sanitized as `play()` does today |
| Voice pressure | many cues in one frame | per-family floors and a global live-voice cap drop the excess; never queued | dropped cue keeps its visual twin |
| Unsupported browser | node type missing | cue falls back to its legacy tone where one exists, else silence | never throws |

</intent-contract>

## Code Map

- `client/src/audio/context.ts` -- the only AudioContext owner (buses, mute, duck, `play`, `playHorn`); gains `playCue` and the engine hooks
- `client/src/audio/tones.ts` -- legacy one-oscillator table + `worldCue` placement math (kept; the fallback and the UI cues)
- `client/src/audio/twinMap.ts`, `client/src/__tests__/twinMap.test.ts`, `tones.test.ts`, `audio/__tests__/context.test.ts` -- exhaustiveness and fake-context graph tests that new ids and paths must satisfy
- `client/src/net/roomBindings.ts` -- event → cue call sites (`handleShell` 1548, `handleMuzzle` 1303, `handleTorp` 1652, `handleBoom` 1730, `handleBurst` 1775, `handleFallOfShot` 1340, `handleHeal` 1417, `handleDropPickup` 1476, `flushDamage` ~2200, cloud merge ~828)
- `client/src/main.ts` -- render callback (`makeCallbacks` 4697, `updateMatchAudioCues` 1342, `renderBeacons` ~4813), own state (`ownPose`, `ownStatus`, `g.keyboard.throttle`, `g.ownStats`), `g.contacts` for sighted hulls
- `client/src/config.ts` -- `CLIENT_CONFIG.audio` (placement knobs; new feel knobs go here)

## Tasks & Acceptance

**Execution — Wave A (candidates; nothing wired into the game):**
- [ ] `client/src/audio/synth/recipe.ts` -- pure layered-cue data model (sources, filters, envelopes, drive, reverb send) + pure helpers (length, sanitize, distance shaping) -- the testable half
- [ ] `client/src/audio/synth/render.ts` -- builds a recipe's node graph on a given context and sink; shared noise buffers; generated impulse reverb; live-voice cap -- the only new place that touches nodes
- [ ] `client/src/audio/engine.ts` -- pure `engineTargets(profile, throttle, speed01, boost)` + an `EngineVoice` adapter (start, update, release) -- continuous engine
- [ ] `client/src/audio/synth/candidates.ts` -- candidate recipes A/B/C per cue and candidate engine profiles per hull, from the research record -- what Eric auditions
- [ ] `client/scripts/soundAudition.mjs` + `client/scripts/audition/` -- esbuild the real modules into one self-contained HTML page (play buttons per candidate, throttle / speed / boost dials per hull, distance dial) -- the audition artifact
- [ ] `client/src/audio/__tests__/` -- unit tests for the pure helpers and `engineTargets`; fake-context graph tests for render and the engine voice

**Execution — Wave B (after Eric's picks and rulings):**
- [ ] `client/src/audio/synth/cues.ts` -- the picked recipes and engine profiles only; delete unpicked candidates
- [ ] `client/src/audio/context.ts` -- `playCue`, engine start / update / release under mute and duck, fallback to the legacy tone
- [ ] `client/src/net/roomBindings.ts`, `client/src/main.ts` -- route the ruled events to the new cues; edge-detect smoke, beacon and airdrop cues from per-frame state; per-frame engine update with the ruled gates
- [ ] `client/src/audio/twinMap.ts` + tests -- a twin row per new cue; exhaustiveness lists
- [ ] records -- amendment entry, CHANGELOG, VERSION + package files, both trackers (one line each), epics stamp, deferred-work, project-context line

**Acceptance Criteria:**
- Given the audition page, when Eric plays a candidate, then the sound comes from the same recipe data and render code the game will ship.
- Given a live match, when the own hull changes throttle, gathers speed or boosts, then the engine sound follows continuously and differs audibly per hull.
- Given the mute toggle or an ad break, when either is on, then every new sound including the engine is silent.
- Given the landed build, when the bundle is inspected, then no audio asset is fetched and `PROTOCOL_VERSION` is unchanged.

## Design Notes

Two play paths stay separate on purpose: the legacy `ToneSpec` table keeps its 150 ms ceiling and its tests; realistic cues are recipes on their own path (the foghorn precedent). Enemy engines can only follow `Contact.speed` (no throttle on the wire) and exist only for hulls in the contact store, which is the true-sight gate, so no client-side perception rule is re-implemented.

## Verification

**Commands:**
- `npm test -w client` -- expected: green, new suites included
- `npm run check` -- expected: green (lint, types, all tests, hook test)
- `node client/scripts/soundAudition.mjs` -- expected: writes one HTML file with no external requests

**Manual checks (if no CLI):**
- Eric auditions the artifact page and names his picks; staging pass for the wired build.
