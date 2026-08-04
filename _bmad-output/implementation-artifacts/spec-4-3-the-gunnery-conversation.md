---
title: 'Story 4.3 — The Gunnery Conversation'
type: 'feature'
created: '2026-08-04'
status: 'in-progress'
baseline_revision: '1585c7845b9de021664e376dda32715ac0e57ba6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Gunnery produces no information for anyone. Your misses vanish (so you cannot bracket
and walk fire onto a blip), you never learn whether a shot at radar range connected — the shipped
`boom` row deliberately denies out-of-sight hit confirmation (`signals.ts:556`) — and a muzzle flash
is a client-side guess drawn only when a shell reveals ON a hull you can already see
(`roomBindings.ts:544`), so firing is never "being seen". The gun became a burst weapon in Story 1.4,
which made this worse: the common shot now ends in a `burst` carrying no victim information at all,
so the normal case gives you an amber ring and no answer to "did I hit?".

**Approach:** Promote all three effects from client-side inference to server signal-registry rows
with their own declared, narrowly-scoped fog exceptions (PROTOCOL_VERSION 21 → 22): `sp`
(fall-of-shot, self-private, gun-family only), `hc` (Hit Call, shooter-only, all ordnance, position
but never severity or victim), and `mz` (muzzle flash, position only — never who or which weapon —
visible inside a derived `SIGHT * 1.5` halo with LOS). The three shipped effects (`splash`, `spark`,
`muzzle`) and their three minted tokens are reused as-is; what changes is who is told, and that they
now render above the fog and survive motion=off as information rather than juice.

## Boundaries & Constraints

**Always:**
- Every new row is a DECLARED exception to the master perception invariant, codified by its own
  independently-reimplemented oracle in `perception.test.ts` — the Bounty standard (epic-4-context
  :25), never slipped in.
- New fields/kinds are APPENDED (msgpack key-insertion-order law, `signals.ts:20-27`). The
  `BallisticEvent` constant-free rule is untouched: no new field on `shell`/`torp`/`torpU`, and no
  new event may carry a range-derivable value (no ttl, distLeft, launch point, target point,
  `bornAt`, owner id on a public row).
- The muzzle flash is emitted at the shell's PRE-PRE-STEP origin (the true muzzle), so a back-dated
  shell that materializes further along its flight is masked by a flash at the hull it left — the
  Epic 1 D1 tie-in (AR3, `world.ts:2113-2120`).
- `hc` carries NO severity channel of any kind: no amount, no hp, no victim id, no kill flag, and
  exactly ONE `hc` per shell resolution even when an AP shell pierces several hulls (a per-pierce
  Hit Call would leak hull count).
- The Hit Call keys off VICTIM RESOLUTION, not `dmg` emission, so it still fires in the weapons-safe
  ready room where `hitShip()` early-returns on `!damageEnabled` (`world.ts:1644-1651`).
- Shooting a decoy produces no Hit Call — structurally, because the buoy is not a collision subject
  (`world.ts:205-206`); no suppression code may be added that could regress into one.
- `CONFIG.vision.muzzleFlash` is DERIVED (`SIGHT * 1.5`), never an independent literal, and pinned by
  a shared constraint test alongside the existing `radar = SIGHT * 2` pin.

**Block If:**
- A ruling in amendments 15-20 cannot be implemented as written without changing what a player is
  told (e.g. the flash cannot be made non-identifying, or splash cannot be made self-private).
- Making the three rows fog-piercing would require weakening the shared invariant helper itself
  rather than adding declared per-row exceptions.

**Never:**
- No wounded smoke (4.4), no foghorn (4.5), no bounty (4.6), no sound-map restructuring (4.7), no
  generalized attention-tier table (4.8 owns it).
- Never reveal the shooter's identity, personal hue, class, or weapon type on `mz`; never a heavier
  flash for the cannon.
- Never give the victim a new "an unseen shooter hit you" cue, and never give bystanders a
  fog-piercing bloom or splash.
- Never a muzzle flash for torpedoes, mines, or decoy drops; never a fall-of-shot splash for
  torpedoes or mines.
- Never retune the shipped effect geometry/durations or the [PROPOSAL] token hexes — those stay
  implementer draft under the standing draft-copy rule (ledger, do not ratify here).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bracket-and-walk | My gun shell bursts at a clicked point 500u away, no hull in `burstRadius` | `sp` to me only, at the true burst point, rendered above the fog | No error expected |
| Connection at radar range | My shell bursts and `burstVictims()` returns ≥1 hull, all fogged to me | Exactly one `hc` to me at the burst point; no victim id, no amount | No error expected |
| AP pierce through 3 hulls | One shell pierces 3 hulls in a sweep | Exactly ONE `hc`, not three — hull count must not be inferable | No error expected |
| Shot at a decoy buoy | Shell bursts centered on a buoy, no hull in range | `sp` (a miss), never `hc` — the interaction oracle | No error expected |
| Remote trap | My mine's proximity fuse damages a hull 900u away | `hc` to me at the mine's position (amendment 18) | No error expected |
| Torpedo runs out | My torpedo expires without hitting | Nothing — no splash for non-gun ordnance | No error expected |
| Observer at 400u | Enemy fires their gun; I am 400u away, LOS-clear (sight 330u) | I get `mz` at their true hull position; I do NOT get their shell | No error expected |
| Observer at 600u | Same, but I am 600u away | No `mz` — 600u > 495u halo | No error expected |
| Flash behind an island | Enemy fires 400u away, an island on the segment | No `mz` — LOS blocks every sensor at all ranges | No error expected |
| Torpedo launch | Enemy launches a torpedo 400u away | No `mz` — quiet weapon | No error expected |
| Multi-barrel salvo | One click fires 3 barrels in one tick | Exactly one `mz` for that ship that tick, not three | Per-tick per-owner dedupe |
| Rapid hits | 3 Hit Calls land within 200ms | All three blooms render; at most one tone fires (300ms same-source floor) | Client-side dedupe |
| Shooter can see the impact | My shell bursts on a hull inside my sight bubble | ONE bloom, not two — the `boom`-derived spark and the `hc` bloom dedupe on position | Per-frame position key |
| motion=off | Player has motion disabled | Muzzle flash, splash and Hit Call bloom all still render (information, not juice) | No error expected |
| Legacy client | A PV21 client joins a PV22 server | Rejected at matchmake by `protocolVersionError`, before a seat is reserved | Existing gate |

</intent-contract>

## Code Map

- `shared/src/types.ts:544-554` -- `GameEvent` union; add `SplashEvent` (`sp`), `HitCallEvent`
  (`hc`), `MuzzleEvent` (`mz`) with anti-cheat comments in the `BallisticEvent` house style.
- `shared/src/index.ts:141` -- `PROTOCOL_VERSION` 21 → 22.
- `shared/src/constants.ts:141` -- `vision`; add derived `muzzleFlash: SIGHT * 1.5` next to
  `radar: SIGHT * 2`.
- `shared/src/__tests__/` -- the constraint test that pins `radar === SIGHT * 2`; add the muzzle
  pin (`muzzleFlash === SIGHT * 1.5`, `sight < muzzleFlash < radar`) and the PV literal at
  `barrel.test.ts:64`.
- `server/src/game/signals.ts:715-731` -- registry (15 → 18 rows); add `fallOfShotSignal`,
  `hitCallSignal`, `muzzleFlashSignal`. Helpers to reuse: `losClear` :135, `sightOf` :152,
  `selfPrivateSignal` :676. The `MissingEventRows` never-check :740 forces the three rows.
- `server/src/game/signals.ts:552-580` -- the `boom` row's anti-leak comment; amend it in place to
  record that amendment 17 supersedes it for the owner-hit case (the Hit Call is now that channel).
- `server/src/game/world.ts:1668-1692` -- `resolveShell` (+ `resolveBurst` :1738, `resolvePierce`
  :1714): the one place hit-vs-miss is known; emit `hc`/`sp` here.
- `server/src/game/world.ts:2121-2125` -- `spawnBallistic`; emit `mz` at the pre-pre-step origin for
  wire kind `shell` only, deduped per tick per owner.
- `server/src/game/world.ts` -- mine detonation path (`detonateMinesInBurst` and the proximity-fuse
  path) — the mine owner's `hc`.
- `server/src/__tests__/signals.test.ts:75-102` -- `REGISTRY_KEYS` + `toHaveLength(15)`; and the
  per-row key-order guards :120-321.
- `server/src/__tests__/perception.test.ts:1041-1080` -- `EVENT_VERIFIERS`; :1203 `EVENT_KINDS`;
  :1206 `toHaveLength(15)`. Each new row needs an independently reimplemented oracle.
- `server/src/__tests__/goldenFrames.test.ts:44-52` -- `EXPECTED_CHANNELS` (17 → 20) and
  `EXPECTED_SUBCASES` :54-86.
- `client/src/render/effects.ts:41-60` -- `isJuiceEffect` / `isFogImmuneEffect`, the two pure
  classification seams this story flips for `splash`, `spark`, `muzzle`.
- `client/src/net/roomBindings.ts:52-62,535-548` -- the `nearVisibleShip` muzzle heuristic; retire it
  as the flash trigger (own-heavy selection keeps a client-local proximity read).
- `client/src/net/roomBindings.ts:432-445,653-661` -- the event switch and `handleBoom`; add the
  three handlers and the per-frame dedupe.
- `client/src/audio/tones.ts:10-119` + `audio/twinMap.ts:20-43` -- the new `hitCall` tone and its
  mandatory visual-twin row.
- `client/src/config.ts:48-53` -- the three tokens already exist (`splash`, `muzzle`, `hitBloom`); no
  new color. Add a small `gunnery` feel block near `ordnance` :256.
- `client/src/__tests__/effects.test.ts:15`, `tones.test.ts:24-47`, `twinMap.test.ts` -- the
  exhaustiveness pins that fail until the new kinds/tones are listed.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/types.ts` -- add the three event interfaces and extend the `GameEvent` union, each
  with the anti-cheat comment stating what it deliberately omits -- the wire contract.
- [ ] `shared/src/index.ts` + `shared/src/constants.ts` -- PV 21 → 22; add derived
  `vision.muzzleFlash = SIGHT * 1.5` -- amendment 15's derivation, never a literal.
- [ ] `shared/src/__tests__/` -- pin `muzzleFlash === SIGHT * 1.5` and `sight < muzzleFlash < radar`
  beside the existing radar pin; update the PV literal -- the derivation's tripwire.
- [ ] `server/src/game/signals.ts` -- add `fallOfShotSignal` (self-private, spectator-public),
  `hitCallSignal` (self-private, spectator-public), `muzzleFlashSignal` (range `vision.muzzleFlash`
  ∧ LOS, payload `{k,x,y}` with NO id for anyone); amend the `boom` row comment to record amendment
  17 -- three declared exceptions, each with its stated rationale.
- [ ] `server/src/game/world.ts` -- emit `sp`/`hc` from `resolveShell`/`resolveBurst`/`resolvePierce`
  keyed on victim RESOLUTION (one `hc` per shell resolution max, splash only for wire kind `shell`),
  emit `hc` on the mine detonation path for the mine's owner, and emit `mz` in `spawnBallistic` at
  the pre-pre-step origin for wire kind `shell`, deduped per tick per owner -- the emission sites.
- [ ] `server/src/__tests__/signals.test.ts` -- registry count 15 → 18, `REGISTRY_KEYS`, key-order
  guards for the three rows, `counterIntel` still only on `blip`, owned-zone parity block -- the
  registry pins.
- [ ] `server/src/__tests__/perception.test.ts` -- three independently reimplemented oracles in
  `EVENT_VERIFIERS`, `EVENT_KINDS` 11 → 14, count 15 → 18; THE INVARIANT must pass with the three
  declared exceptions -- the anti-cheat gate.
- [ ] `server/src/__tests__/goldenFrames.test.ts` (+ snapshot) -- `EXPECTED_CHANNELS` 17 → 20, new
  sub-cases for a miss, a beyond-sight hit, a decoy shot, and a flash at 400u vs 600u; regenerate
  with `vitest -u` and hand-inspect -- golden-frame discipline.
- [ ] `server/src/__tests__/decoy.test.ts` -- extend the existing "no Hit Call" case to assert no
  `hc` event reaches the shooter while a `sp` does -- the oracle, now observable on the wire.
- [ ] `client/src/render/effects.ts` -- move `splash`, `spark`, `muzzle` into `isFogImmuneEffect` and
  out of `isJuiceEffect` (`muzzleHeavy` stays own-side juice) -- information survives motion=off and
  draws above the fog.
- [ ] `client/src/render/gunneryFeed.ts` (new) -- PURE: the per-frame impact-position dedupe key and
  the 300ms same-source tone floor, in the `DenialDedup`/`DeniedPulse` house shape, zero Pixi -- the
  unit-testable seam.
- [ ] `client/src/net/roomBindings.ts` -- add `mz`/`sp`/`hc` handlers, retire the `nearVisibleShip`
  muzzle trigger (keep a client-local own-proximity read only to pick `muzzleHeavy`), and route
  `handleBoom`'s spark/splash through the dedupe -- the dispatch change.
- [ ] `client/src/audio/tones.ts` + `audio/twinMap.ts` -- add the `hitCall` muffled-boom tone (low
  triangle, ≤150ms, distinct from `damage`/`burn`/`stormWarn`) and its mandatory twin row -- UX-DR36.
- [ ] `client/src/config.ts` -- add the `gunnery` feel block (tone floor ms, own-muzzle proximity)
  next to `ordnance` -- client-only tunables in their home.
- [ ] `client/src/__tests__/effects.test.ts`, `tones.test.ts`, `twinMap.test.ts`,
  `roomBindings.test.ts` + `client/src/__tests__/gunneryFeed.test.ts` (new) -- update the
  exhaustiveness pins and cover the dedupe/floor -- the client gates.
- [ ] `CLAUDE.md`, `VERSION` (0.17.42 → 0.17.43), `_bmad-output/gds-workflow-status.yaml`,
  `_bmad-output/implementation-artifacts/deferred-work.md` -- record the Key Decision, the cycle
  bump, `next_expected` → 4-4, and the ledger entries -- the standing per-cycle obligations.

**Acceptance Criteria:**
- Given a shell that terminates without resolving any victim, when the shooter's frame is built, then
  exactly one `sp` reaches the shooter and no other observer receives it, at any range and through
  any fog.
- Given a shell that resolves ≥1 victim, when the shooter's frame is built, then exactly one `hc`
  reaches the shooter carrying only `{k,id,x,y}` — and no `sp` for the same shell.
- Given any observer, when the registry is enumerated, then all 18 rows have an `EVENT_VERIFIERS`
  oracle and THE INVARIANT property test passes over 20 seeded random worlds.
- Given an enemy fires a gun at distance `d` with LOS clear, when frames are built, then `mz` is
  present iff `d ≤ CONFIG.vision.muzzleFlash`, and its payload contains no id, hue, class or weapon.
- Given an enemy launches a torpedo at any distance, when frames are built, then no `mz` is emitted.
- Given the accessibility motion setting is `off`, when a flash, splash or Hit Call bloom occurs,
  then all three still render (information), while `muzzleHeavy` own-side weight does not.
- Given a client at PROTOCOL_VERSION 21, when it tries to join a v22 server, then matchmaking rejects
  it before a seat is reserved.

## Spec Change Log

## Review Triage Log

## Design Notes

**Eric rulings, 2026-08-04 (this run's pre-implementation question gate).** Six rulings, recorded
durably as amendments 15-20 in `epic-4-context-amendments.md`. The through-line: at every fork Eric
took the SMALLEST new information channel that still satisfied the story.

- **R1 (amdt 15) — the flash is a 495u halo**, `SIGHT * 1.5`, derived like `radar = SIGHT * 2`, and
  LOS-blocked by the standing 2026-08-02 ruling. Radar stays the only long-range sensor; the flash
  annulus is a deliberately thin 165u band beyond your own bubble.
- **R2 (amdt 16) — splash is self-private and gun-family only.** Resolves FR16 ("own splashes") vs
  EXPERIENCE.md:181 (no qualifier) in FR16's favor.
- **R3 (amdt 17) — the Hit Call overrides `signals.ts:556` for the owner-hit case only**, knowingly.
  Without it the ratified decoy oracle is dead: "shooting a decoy produces no Hit Call" only means
  something if you would normally get one at fog range.
- **R4 (amdt 18) — Hit Call covers all ordnance**, ratifying EXPERIENCE.md:223's mine Hit Call. A
  Mine Layer learns remotely that a trap sprung. Deliberately asymmetric with R2.
- **R5 (amdt 19) — the flash is neutral.** DESIGN.md:239's `{muzzle}` token beats UX-DR7's
  firer's-hue rule for this signal: the flash must create a question, not answer one.
- **R6 (amdt 20) — gun family only.** Upholds the torpedo's shipped "quiet weapon" status.

**Why three new kinds rather than widening `boom`/`burst`.** The story AC requires "each lands as
its own registry row + invariant case", and the three have three genuinely different visibility
rules (self-private / self-private / a new spatial range). Widening `boom` would also have forced a
severity-adjacent flag onto a public row.

**The predicate that makes R6 free.** "Wire kind is `shell`" selects gun + cannon + star shells and
excludes `torp` exactly, so the server needs no per-weapon flash table — and therefore no weapon
identity can leak through one. Mines and decoys never call `spawnBallistic` at all.

**The double-render seam.** A shooter who can see their own impact receives BOTH the public
`boom`-derived spark/splash and the new self-private `hc`/`sp`, in the same frame at the same point.
Dedupe on a quantized position key per frame — exact here, not heuristic, because both derive from
the same resolution. This is why the dedupe lives in a pure module with its own test rather than
inline in the switch.

**Masking, honestly scoped.** For an observer who can see the shooter's hull, a flash at the true
muzzle masks the back-date (that is today's `nearVisibleShip` intent, done properly). For an observer
in the 330–495u annulus the shell is never revealed at all, so there is nothing to mask — the flash
is pure disclosure there. The one thing the implementation must NOT do is draw a flash at the
shell's REVEAL point, which is the exact leak the Story 1.5 review closed (`spec-1-5:129`).

**Accepted consequences to ledger, not fix here.** (a) The aggregate ≤3 flashes/s-per-region budget
still has no global mechanism — 4.3 ships the per-source 300ms floor and leaves the global cap to
4.8, which owns attention priority. (b) All effect geometry/durations and the five [PROPOSAL] token
hexes remain implementer draft. (c) The owner already infers a bit from burst absence
(`signals.ts:598-608`); `sp`/`hc` make that bit explicit rather than adding a new one.

## Verification

**Commands:**
- `npm install` (in the worktree — it has no `node_modules`) -- expected: workspaces linked.
- `npm run lint` -- expected: clean, complexity ≤ 10 everywhere.
- `npm test -w shared` -- expected: green; PV pin now 22, muzzleFlash derivation pinned.
- `npm test -w server` -- expected: green; registry counts 18/18/20; golden snapshot regenerated with
  only the three new channels added.
- `npm test -w client` -- expected: green, plus the new `gunneryFeed` cases.
- `npm run check` -- expected: lint + type-check + all suites green, total above the current baseline.

**Manual checks (if no CLI):**
- Inspect the regenerated golden snapshot diff: only `sp`/`hc`/`mz` channels may be new; every other
  channel byte-identical.
- Confirm no `mz` payload anywhere in the snapshot contains an `id`, hue, class or weapon field.
