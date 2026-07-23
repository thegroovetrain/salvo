---
title: 'Firing Arcs for the Class Era'
type: 'feature'
created: '2026-07-23'
status: 'in-progress'
baseline_revision: 'f7c6ec39299c65acd749223d43993964fef2b84e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 1.10 (epics.md). Arc geometry is settled de facto but undeclared (cannon/starShells 360° is hard-coded client-side, not in CONFIG), and FR12's "denied fire is never silent" is violated: denial is client-predicted only (no server denial signal on the wire), has no audio, within-RTT ability double-presses are silently swallowed, and island-blocked stern drops waste the charge with zero feedback.

**Approach:** Ratify current geometry into CONFIG as declarative per-weapon arc descriptors consumed by both sides (Eric ruling 2026-07-23), and make denial authoritative: a self-private server denial signal on the wire (PV bump), a denial tone, and blocked-drop denial for mines/decoy.

## Boundaries & Constraints

**Always:** Arc math stays byte-identical on both sides via one shared descriptor function over CONFIG (torpedo keeps shared `inArc` + launch clamp). Denial events are SELF-PRIVATE (never on contacts; perception invariant tests extended to prove it). Exactly ONE denial feedback per denied press — client prediction may fire first; the server signal fills silence, never doubles. Denied presses spend nothing (round/charge kept). PROTOCOL_VERSION bumps (9→10) with changelog; goldenFrames regenerate deliberately. Complexity ≤ 10; one PR; docs/status files advance in the same PR.

**Block If:** Any task forces a change to a ratified geometry value (gun/cannon/starShells 360°, torpedo ±30° bow, stern drops); the denial signal cannot be built without leaking non-self information; blocked-drop denial requires touching gun/cannon muzzle spawning.

**Never:** No cursor clamping into arcs (deny-gate ratified). No gameplay geometry change to any weapon. No priming/input-scheme redesign (Epic 2). Gun-family muzzle island-blindness stays deferred. No DOM tactical UI. No new weapons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| In-arc torpedo click | TB, aim inside bow ±30°, ammo ready | Launch (bearing clamped in-arc), success tone | No error expected |
| Out-of-arc torpedo click | TB, aim outside arc | Server `denied {out-of-arc}`; exactly one red pulse + denial tone + chip flash; prime kept, round kept | Never silent |
| Empty-pool fire/press | Any weapon/ability, ammo 0 | `denied {no-ammo}`, one feedback, nothing spent | Never silent |
| Within-RTT double press | Ability pressed twice < RTT, pool 1 | 1st activates; 2nd → server `denied {no-ammo}` → feedback despite stale client predicting READY | Closes silent-swallow ledger entry |
| Reload-boundary race | Click while client predicts ready, server still cooling | Server `denied {cooling}` → late-but-explicit feedback | Closes staleness-race ledger entry |
| Blocked stern drop | ML stern against island/boundary, key 2/3 | `denied {blocked}`, charge + reload kept, one feedback | Closes island-blind ledger entry (mine+decoy only) |
| Client predicted denial, server agrees | Stale-free case | Instant predicted pulse+tone; matching server denial deduped (no second feedback) | No double feedback |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- per-weapon arc declaration: `arc: 'full'` on gun/cannon/starShells blocks; torpedo keeps `offset/halfArc`; `mine.offset` (stern) unchanged; decoy documented as sharing the mine rack.
- `shared/src/sim/arcs.ts` -- NEW pure `arcFor(equipmentId)` → `{kind:'full'} | {kind:'sector', offset, halfArc} | {kind:'stern-drop', offset} | {kind:'none'}` derived from CONFIG; the single arc-shape source both sides consume.
- `shared/src/types.ts` -- self-private denial on the wire: `DeniedView { slot, reason: 'out-of-arc'|'no-ammo'|'cooling'|'blocked', seq }` in the per-client frame (sibling of other self-private channels); press identity = `actSeq` for abilities, and add a client-incremented fire/click seq to `InputMsg` if none exists (wire already breaking).
- `shared/src/index.ts` -- PROTOCOL_VERSION 10 + changelog line; barrel export arcs.ts.
- `server/src/game/inputs.ts` -- validate the new seq field (finite-check, clamp).
- `server/src/game/equipment/mines.ts` + `decoy.ts` -- `dropPoint` island/boundary check (existing circle math/`segCircleHit` family) → return `'blocked'` without consuming.
- `server/src/game/equipment/torpedoes.ts` -- arc check reads `arcFor` (behavior byte-identical).
- `server/src/game/world.ts` -- fireControl/activationControl denial results queue per-owner denial entries (today they're test-only return values); expose to frames.
- `server/src/game/frames.ts` + `perception.ts` -- thread denials to the OWNER's frame only; extend property invariants: no denial ever appears in another client's frame.
- `client/src/render/weaponArc.ts` -- `fireArcKind`/`weaponArcHit` become `arcFor`-driven (torpedo wedge + gun-family always-in-arc + abilities none: regression-pinned identical).
- `client/src/net/roomBindings.ts` + `state.ts` + `main.ts` -- receive denial channel; dedup by (slot, seq) against predicted denials: predicted-first suppresses the echo, unpredicted server denial triggers full feedback.
- `client/src/render/deniedFire.ts` + `render/hud.ts` -- server-driven denial path reuses the existing pulse + chip flash.
- `client/src/audio/tones.ts` -- NEW denial tone (mute-aware, distinct from success tones); fired on exactly-one-feedback path for weapons AND abilities.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- mark resolved: within-RTT double-press swallow, denial staleness race (server-signal halves), mine/decoy dropPoint island-blindness. Gun muzzle blindness stays.
- Docs (same PR): GDD arc close-out (open item → ratified values); `sprint-status.yaml` → `1-10-firing-arcs-for-the-class-era: done`; `_bmad-output/gds-workflow-status.yaml` next_expected + last_updated; `epic-1-context.md` refreshed last (mtime > gdd.md).
- Tests: shared `arcs` (descriptor↔CONFIG identity); server denial matrix (all four reasons × weapons/abilities, self-privacy invariant, blocked-drop charge retention, pv-9 rejected, deliberate goldenFrames regen); client `weaponArc` regression, dedup exactly-one-feedback, tone wiring.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/` (constants, sim/arcs NEW, types, index, + tests) -- arc declaration + `arcFor` + DeniedView/seq + PV10 -- deterministic spine first.
- [ ] `server/src/game/` (inputs, equipment/mines+decoy+torpedoes, world, frames, perception, + tests) -- denial queue → owner-only frames, blocked drops, arcFor-driven torpedo check, invariants extended.
- [ ] `client/src/` (render/weaponArc, net/roomBindings, state, main, render/deniedFire, render/hud, audio/tones, + tests) -- CONFIG-driven arc classification, denial dedup, denial tone.
- [ ] Ledger + docs sweep -- deferred-work resolutions, GDD close-out, sprint-status, gds-workflow-status, epic-1-context mtime-last.
- [ ] `npm run check` green at end (baseline 1242 tests; count grows).

**Acceptance Criteria:**
- Given the ratified geometry, when `arcFor` drives server checks and client gate/render, then every weapon's aim gate, enforcement, and rendered arc agree byte-for-byte with pre-change behavior (regression-pinned) and every arc shape traces to CONFIG.
- Given ANY denied press (out-of-arc, no-ammo, cooling, blocked), when the server refuses, then a self-private denial reaches that client and exactly one pulse + tone + chip flash plays — including both silent-swallow ledger cases — and nothing is spent.
- Given a fogged observer, when any other ship's press is denied, then no trace appears in their frame (property invariant).
- Given a pv-9 client, when it joins, then matchmake rejects it.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Eric rulings (2026-07-23, this invocation):** (1) ratify de facto geometry as the class-era design — no value changes; (2) keep deny-gate, never clamp aim; (3) full FR12 hardening incl. server denial signal + denial tone; (4) island/boundary-blocked stern drops become denials (mine + decoy only).
- **Denial channel shape:** frame-embedded self-private channel (like own-ship data), NOT a GameEvent on contacts — privacy by construction; perception oracle gains a "denials are owner-only" row.
- **Dedup contract:** feedback = predicted ∪ server-signal, keyed (slot, seq); predicted shows instantly and marks the key; unmatched server denial (the previously-silent cases) triggers the full feedback late-but-explicit. Never zero, never two.
- **Blocked-drop check is server-only** (client can't cheaply predict island overlap for astern drop) — feedback arrives ~RTT late; acceptable, it replaces total silence.
- Eric directive: route subagent model selection via `/orchestrate` (as in 1.3–1.8).

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. arcs descriptor identity + PV10.
- `npm test -w server` -- expected: green incl. denial matrix, owner-only invariant, blocked-drop retention, deliberate goldenFrames regen.
- `npm test -w client` -- expected: green incl. weaponArc regression pins, exactly-one-feedback dedup, denial tone wiring.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): TB out-of-arc torpedo click → red pulse + new denial tone, round kept; hammer an ability key twice fast → second press audibly denied; back an ML's stern against an island → key 2/3 denied, charge kept; all arcs/reticles look and fire exactly as before.
