---
status: done
cycle: 90
epic: 6
story: 6-1 follow-up (defect)
date: 2026-08-16
amendments: epic-6 A19, A20, A21
---

> **RESOLVED 2026-08-16.** Both questions were ruled and the work shipped in the same cycle. Eric
> declined the Q1 fork (*"I do not give a shit"*) so the orchestrator's recommendation stands — the fix
> is gated to queue-formed rooms. Q2's foghorn leak was accepted (*"Who the hell cares?"*), and
> amendment 20's 700.8u separation puts captains outside the 660u horn range anyway, so it largely
> closes as a side effect. Eric then opened a LARGER issue at the same gate — spawn spacing and the
> radar-sweep rotation advantage — which became amendments 20 and 21. **One claim in §4 of this
> document was refuted before shipping: deriving the candidate count from `playerCap` does NOT on its
> own produce even spacing, because `pickSpawn` re-rolled its phase per call. See amendment 20 for the
> measured table.** Authoritative record: `epic-6-context-amendments.md` A19-A21.

# Boarding Spawn In Place — Question Gate

Eric's intent, verbatim:

> "a few sessions ago we switched the game lobby from a waiting room to a queue. when the queue is
> either full or the timer ends with at least 2 players, it transitions them to a lobby where they
> load in and then once everyone has there is a 10 second countdown. After the countdown, it jumps
> them to a new random start location. I would like for it to place them into the game in the spot
> they will spawn in from the beginning, instead."

**This is a defect, not a feature request, and the evidence is unambiguous.** Two questions need a
ruling before implementation; everything else is settled below.

---

## 1. The report is confirmed, and the teleport is enormous

Measured over real sockets: 20 headless captains through the real queue path (`joinOrCreate('queue')`,
cap-20 trigger, production timings `joinWindow=0` / `countdown=10000`), all seated into one arena.

**20 of 20 captains were displaced at the countdown→active boundary.** Median **~2140u**. Six were
near-antipodal at **~4470u — 160% of the 2800u map radius**, i.e. thrown clear across the diameter of
the spawn ring. Heading was re-derived for every captain. Both before and after, radius on the spawn
ring was exactly 2240.00u — the hull is moved *along* the ring, not off it.

| sample | from | to | Δ | % mapRadius |
|---|---|---|---|---|
| QCAP-1 | 2167.98, 563.43 | −2098.73, −782.90 | 4474.09u | 159.8% |
| QCAP-5 | −1773.48, 1368.34 | −1964.65, 1075.99 | 349.30u | 12.5% |
| QCAP-12 | 1476.06, −1684.89 | 11.66, −2239.97 | 1566.08u | 55.9% |
| QCAP-20 | 2239.84, 26.45 | −2222.77, −277.31 | 4472.94u | 159.7% |

Root cause, read not inferred: `Match.activate()` (`server/src/game/match.ts:517`) calls
`World.resetForMatchStart()` (`world.ts:1268`), which loops **every** hull through `redeployShip()`
(`world.ts:1294`). That function opens with `const p = pickSpawn(this.map, placed, this.rng)` and
`placed` starts **empty** — so the re-roll is entirely independent of where anyone was standing. Its
own doc comment names the behaviour: *"each ship emits a spawn event so clients snap their
camera/prediction to the teleport."*

### It violates two things already ratified

- **Story 6-1's own acceptance criterion** (`spec-6-1-queue-based-lobbies.md:109`): *"every one of
  them sees their own start location on the map while the roster is still filling."* They see **a**
  location, which is then discarded.
- **Epic-6 amendment 8, point 3**: *"Players see their start location before the match starts. Spawn
  placement is therefore disclosed during boarding, which is a deliberate, ruled change: your
  position on the ring is known to you before the gun."*

The 6-1 spec's Design Notes never mention `resetForMatchStart`. The boarding work was built on top of
a pre-existing teleport without noticing it was still in the activate path. **Nothing was decided in
favour of the current behaviour — it was inherited.**

---

## 2. QUESTION 1 — Does the fix stop at the queue door?

The re-roll is **unconditional today**: the dev/sandbox direct-join room does exactly the same thing
(measured: 2 captains, 448u and 399u displacement). So "boarding room" is not a distinguishing
condition in the shipped code, and the fix has to choose one.

The two doors are genuinely different rooms:

- **Queue-formed (boarding) room** — frozen start line. Helm, weapons and radar are dead from drop
  until `active`. Nothing can be earned, fired, damaged or driven.
- **Dev/sandbox direct join** (`HC_DEV_OPTIONS`, `?direct=1`, non-sandbox `matchOverride`) — the old
  sailable, weapons-hot ready room. Captains drive anywhere for the whole waiting phase, really fire
  and drain ammo pools, and lay real wake ribbons. **Here the redeploy is load-bearing**: it is what
  returns everyone to the ring and restores pools before the real match.

**Recommendation: gate the fix to queue-formed rooms only** (`expectedCaptains !== undefined`), leaving
the dev door byte-identical.

Supporting fact that makes this cheap: **no test anywhere constructs a boarding room and asserts
position or spawn-event count at activation.** A change gated on `expectedCaptains` breaks **zero**
tests. An ungated change breaks six ready-room assertions, headed by the canonical pin at
`server/src/__tests__/match.test.ts:253` and the headless `matchSmoke.mjs:496-503`.

> **Q1: Gate the fix to queue-formed rooms, leaving the dev/sandbox ready room's re-roll untouched?**
> (Recommended: yes.)

---

## 3. QUESTION 2 — The foghorn now leaks a *permanent* position

This is the one consequence the change creates that did not exist before, and it deserves your call
because **the stakes moved even though the code did not.**

The foghorn is deliberately live on the frozen start line. That was a considered decision, reasoned in
the code at `client/src/input/keyboard.ts:264-270`:

> *"SEPARATE FROM `isModalOpen` FOR ONE REASON: THE FOGHORN. Eric's ruling names movement, weapons
> and radar, and the horn is none of the three, so a boarding captain may still sound it."*

The server agrees — `hornControl` (`world.ts:3362`) carries no weapons gate.

**Why that was free before and is not now.** A honk emits an `fh` signal carrying a **bearing** to the
honker plus the horn variant `h`, which is deliberately identity-adjacent (amendment 52: *"a
distinctive purchased horn being recognizable at 660u is the point of buying one"*). It is audible
whenever `ceil(8d/intel) ≤ 8` — i.e. **out to the listener's full 660u intel range** with clear LOS
(`signals.ts:1652`). Until now, sounding your horn on the start line gave away a bearing to a position
that was **thrown away seconds later**, so the leak was worthless. Once the spawn is permanent, it is a
bearing on where that captain will actually start the match.

**How often it can bite:** the spawn ring is 2240u (2800 × 0.8) with 32 candidates, so the tightest
possible separation between two captains is **439u** — inside the 660u audible band. Even spacing at
cap 20 is 701u, which is *outside* it; but greedy max-min placing 20 hulls on 32 candidates
necessarily produces some near-adjacent pairs. **So this will occur in full lobbies, not in thin ones.**

Three options:

- **(a) Accept and ledger it.** The horn's entire ratified grammar is *"a honk is a bearing the honker
  chose to give away, and nothing more"* (`signals.ts:1680`). Choosing to give one away on the start
  line is that same bargain, made earlier. Zero code.
- **(b) Lock the horn during boarding** — extend "ALL STATIONS LOCKED" to the horn. Costs the
  "let them be silly" honk conversations (amendment 56) at exactly the moment players are idle and
  most likely to want them, and reverses a decision you already made explicitly.
- **(c) Keep the horn audible to yourself, suppress `fh` to others until `active`.** Surgical, but it
  forks one of the six declared exceptions to the master perception invariant — a real architectural
  cost for a narrow case.

**Recommendation: (a).** It is consistent with the horn's own design rationale, and it is the only
option that changes nothing.

> **Q2: Accept the foghorn bearing-leak on a now-permanent start line (a), lock the horn (b), or
> suppress `fh` to others until active (c)?** (Recommended: (a).)

---

## 4. Rulings I have made — flagged for veto, not asking

1. **Drop the `spawn` event at activate for boarding rooms** (rather than emitting one whose position
   equals the current position). Emitting a no-move spawn event calls `predictor.forceSnap()`, which
   leaves `ownPose` null until the next server frame; during that ~1–3 render-frame gap
   `client/src/main.ts:3319` hides the own hull, nameplate, hotbar and xpRail — **a visible blink at
   the exact moment the gun goes.** Dropping it is safe: `updateMatchEpoch`
   (`client/src/main.ts:956`) already fires `resetOwnOrders(g)` on the `→ active` phase edge, and its
   doc comment states it is *"Idempotent with the server's own spawn event, which calls the same
   function"* — so the engine-order reset survives. *(Two review agents disagreed here; adjudicated
   by reading the code.)*
2. **Accept the RNG-stream shift.** Skipping N `pickSpawn` draws advances the shared world `rng`
   differently, which moves subsequent PvE fleet-wave anchors for a given seed. Nothing pins
   seed-stable fleet placement, and the batch-sim harness runs with no `expectedCaptains` so it keeps
   the old path and is unaffected. Documented rather than defended against.
3. **Keep the rest of `resetForMatchStart` running.** Of the 31 mutations in `redeployShip`, all but
   three are provably no-ops in a frozen boarding room. Keeping them costs nothing and keeps one code
   path; only the placement is gated.

## 5. Consequences accepted, and one correction of record

- **No opponent position leaks visually.** Minimum spawn separation is 439u against a 330u truesight
  bubble, and radar is off on the start line, so **no captain can ever see another** at boarding on
  the normal placement path. (The documented pathological `fallbackSpawn` ladder, which sweeps 256
  candidates then moves inward, is the only path that could co-locate hulls.)
- **No island-knowledge leak.** The client already rebuilds the entire island map from the seed at
  join, so a longer look at your surroundings discloses nothing it did not already hold.
- **Deck/loadout/stats rebuild becomes a no-op.** `buildDeck` is pure and RNG-free, `deckRng` is not
  reseeded, and with no boons `effectiveStats` returns the same values — so preserving state changes
  no card and no stat.
- **CORRECTION OF RECORD (comment-only, proposed for the same PR).** `redeployShip`'s header
  (`world.ts:1289-1293`) and its XP comment (`world.ts:1303-1306`) both justify the wipe as *"anything
  farmed in the practice-room waiting phase (drone kills) must not carry a head start."* **That is
  unreachable.** `damageEnabled = (phase === 'active')` makes `hitShip` early-return on both doors, so
  no kill, XP, boon or level is obtainable pre-active anywhere — and the match-start drone fill was
  deleted outright (amendment 41). Nine of those wipes are dead code in production. The tests that pin
  them all drive a standalone `World` whose flags default permissive. Proposing to correct the stale
  rationale in the comments we are already editing, and nothing else.
- **A trap for whoever writes the regression test.** The schema `matchPhase` patch lands a frame late,
  so the frame carrying the teleport is still labelled `countdown` on the client. A naive "last
  pre-active vs first active" comparison reports **0.00u** and would falsely refute the bug. The test
  must assert on the raw position discontinuity.

## 6. Verification state

- `npm test -w server` green unmodified at the time of investigation: **49 files / 1207 tests passed**.
- Reproduction probe was temporary and has been deleted; `git status --short` is clean.
- No code has been changed. This run stops at the gate, per Eric's *"surface questions before
  implementation."*

## Auto Run Result

Status: done

Both questions ruled by Eric on 2026-08-16 and implemented in the same cycle, plus two further Eric
rulings raised at the same gate. Shipped:

- **A19 — the held start line.** Queue-formed rooms preserve the boarding pose at activate; no
  re-roll, no `spawn` event, no `detachWake`. Dev/sandbox door byte-identical.
- **A20 — the shared spawn lattice.** `SPAWN_CANDIDATES` derives from `CONFIG.map.playerCap`, AND the
  lattice phase is drawn once per World and passed at all three placement edges. Minimum pairwise
  separation at a full lobby moves from **352-483u (inside 660u radar on 60 of 60 seeds)** to a flat
  **700.8u on 0 of 60**.
- **A21 — the sweep starts at the hull's heading**, at all three placement edges, replacing the
  phase-locked `sweepAngle: 0` that Story 6-1's radar freeze had turned into a systematic,
  position-determined first-detection advantage.

Verification: `npm run check` exit 0 — shared 33 files / 743 tests, **server 49 files / 1219 tests**
(+12), client 84 files / 2606 tests. `npm run lint` 2 problems / 0 errors / 2 warnings, the
pre-existing baseline in untouched client files. `queueSmoke.mjs` and `matchSmoke.mjs` both OK, the
latter confirming the dev door still redeploys to the ring. `PROTOCOL_VERSION` unchanged at 37.

Open, ledgered rather than fixed: the ring is **saturated** at cap 20 (703.7u of arc each against a
660u requirement), so spawn positions are necessarily near-evenly spaced and therefore derivable, and
**duo/trio queues do not fit at any spacing** — both need a bigger ocean, which is the reopening
epic-6 amendment 11 left the `mapRadius()` curve in place for.
