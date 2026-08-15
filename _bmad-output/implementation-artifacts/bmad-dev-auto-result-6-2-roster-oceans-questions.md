---
status: blocked
blocking_condition: 'design rulings required before implementation (4 questions)'
story: '6.2 — Roster-Scaled Oceans'
epic: 6
date: '2026-08-15'
base_commit: f738b06
branch: worktree-dev-auto-6-2-roster-oceans
---

# Story 6.2 — Roster-Scaled Oceans: question gate

Eric's invocation: *"6-2. im not sure this is relevant anymore, the ocean is as big as its gonna be.
either way, surface questions before implementation."*

This is the pre-implementation gate. **Nothing has been implemented.** The worktree is clean; the
only work done was measurement (two throwaway probe scripts, since deleted, plus one temporary
`heightField.ts` edit that was reverted and rebuilt).

---

## The headline: the ocean is already roster-scaled, everywhere except the one call site

The single most important finding is that **the roster-scaling machinery already ships in full**.
Story 6.2 is not a feature to build — it is one argument to change.

| Layer | State today |
|---|---|
| The curve | `mapRadius(cap) = CONFIG.map.baseRadius * sqrt(cap / CONFIG.map.capRef)` — `shared/src/constants.ts:1314`. Already a CONFIG design target (`baseRadius` 2800, `capRef` 20). |
| Map generation | `generateMap(seed, playerCap)` takes the cap and derives radius, spawn ring, height field, islands — `shared/src/sim/map.ts:583`. |
| World | `new World(seed, playerCap, …)` stores it and exposes `world.playerCap` — `server/src/game/world.ts:906`. |
| The wire | `WelcomeMsg.playerCap` — *"the cap the server sized the map against (feeds generateMap)"* — `shared/src/types.ts:1166`. **Already on the wire.** |
| Client rebuild | `generateMap(welcome.mapSeed, welcome.playerCap)` — `client/src/net/connection.ts:493`. Already reads the per-match value. |
| Storm rings | `zoneRingRadii(mapRadius)` interpolates geometrically from the live map radius down to `min(zoneTerminalRadius(), mapRadius)` — `shared/src/sim/zone.ts:222`. Already derived. |
| Collision / spawn / 5-3 reveal zoom | All already take the live map radius. |

The one line that pins it to a constant:

```ts
// server/src/rooms/ArenaRoom.ts:274
return new World(seed, CONFIG.map.playerCap, zoneCfg, { … });
```

And Story 6.1 — merged this morning as cycle 88 (PR #146) — supplied exactly the missing input.
`StandardQueueRoom` passes `expectedCaptains: seated.length` into `createRoom`
(`StandardQueueRoom.ts:217`), `sanitizeRoomOptions` already whitelists it un-dev-gated
(`roomOptions.ts:160`), and **epic-6 amendment 10 seals the cohort at forming** — "no late arrivals,
structurally" — so `expectedCaptains` is an authoritative, final roster count at the moment the world
is built.

**Consequences of that:**

- The mechanical change is `CONFIG.map.playerCap` → `sanitized.expectedCaptains ?? CONFIG.map.playerCap`.
- **`PROTOCOL_VERSION` does not move.** It stays 36. No wire field is added, removed or reshaped.
- The dev/sandbox direct door (amendment 9's `?direct=1`) has no `expectedCaptains`, so it keeps the
  full 2800u ocean via the `??` fallback — Eric's solo playtest loop is untouched by construction.
- Almost all of the story's stated work is already done. What is left is **rulings**, not code.

---

## Measured evidence

Generation was run across every roster size on three seeds (12345 / 777 / 424242). Every size
generated successfully — `assertValid`'s navigability validator passed at all of them.

```
cap  radius   spawnR   isles  cover%  vtx    maxIsleR  gen(ms)  radar/R  endgame/R  endgameArea%
2    885      708      1.3    2.49    85     249       ~13      0.75     0.75       55.6
3    1084     868      3.3    2.48    134    336       13       0.61     0.61       37.0
4    1252     1002     5.3    2.47    217    325       17       0.53     0.53       27.8
6    1534     1227     6.7    2.48    302    308       28       0.43     0.43       18.5
8    1771     1417     8.3    2.59    382    304       29       0.37     0.37       13.9
10   1980     1584     11.7   2.48    532    284       47       0.33     0.33       11.1
12   2169     1735     11.3   2.47    542    457       47       0.30     0.30        9.3
16   2504     2004     17.0   2.48    716    512       68       0.26     0.26        6.9
20   2800     2240     24.0   2.49    967    462       74       0.24     0.24        5.6
```

**What holds (no work needed):**

- **Coverage holds at ~2.5% at every size.** The rank-selected sea level does its job; the 2-3%
  ratified band (cycle 59) is never breached. Island count falls naturally with area — 24 islands at
  cap 20, ~1.3 at cap 2.
- **AC2 (spawns) already passes.** Even-spacing chord on the spawn ring, worst case, is 701u at cap
  20 and 1417u at cap 2 — above radar range (660u) at *every* roster size. Nobody spawns inside a
  neighbour's scope. The max-min placement in `spawn.ts` needs no change; this AC is a test to write,
  not behaviour to build.
- **Generation gets cheaper, not dearer.** 74ms at cap 20 → ~13-17ms at cap 2-4.
- **Determinism is unaffected.** Both sides already rebuild from `(mapSeed, welcome.playerCap)`.

**What changes, and is the actual subject of this gate:**

1. **The storm arc collapses at low roster.** The endgame ring is FIXED at 660u (2 × truesight, the
   Story 3.4 derivation — a build-failing pin). At cap 2 the whole map is 885u, so the endgame ring
   is already **75% of the map radius / 56% of its area** at 0:00. The rings become
   `885 → 803 → 728 → 660 → 0` and the 16-minute timeline removes 44% of the water instead of the
   94% it removes at cap 20 (`2800 → 1730 → 1068 → 660 → 0`). **The ring stops being a pacing
   instrument at small rosters — and the clock never moves either: a 2-captain match still waits
   until 15:00 for sudden death to start collapsing an 885u pond.**

2. **Radar dominance.** At cap 2 radar range (660u) reaches **75% of the map radius** — from the
   centre you sweep 56% of the map's area. Epic 4's entire information-texture layer (the eighths
   ladder, height-aware shadows, wakes, the physical return model) was calibrated against a 2800u
   ocean where radar covers 5.6% of it. Search as a phase substantially stops existing below about
   cap 6.

3. **PvE fleet pressure inverts.** `CONFIG.fleet.waves` is **absolute**, not roster-scaled —
   4 fleets / 36 hulls at 1:00 regardless of who is in the match:

   ```
   cap 2   R=885   36 PvE hulls -> 18.0 per captain, ~10x the cap-20 area density
   cap 4   R=1252  36 PvE hulls ->  9.0 per captain
   cap 8   R=1771  36 PvE hulls ->  4.5 per captain
   cap 20  R=2800  36 PvE hulls ->  1.8 per captain
   ```

   Epic-5 amendment 45's own stated rationale is *"one fleet per ~5 captains, held CONSTANT as the
   storm thins the field"* — the waves table already contradicts that at low rosters today, before
   any map change. Shrinking the ocean multiplies the density on top of it. **This is the same
   problem as 6.2, and Story 6.2's AC — written long before Story 5.6 existed — does not mention
   fleets at all.**

**A footnote, measured and de-escalated:** `TERRAIN_PARAMS.regionWavelength` is set to
`CONFIG.map.baseRadius` with a comment saying it *"TRACKS THE MAP RADIUS"* — but `baseRadius` is the
cap-20 radius, not the actual one, so under roster scaling that comment becomes false for every
smaller map. Probed by temporarily scaling it to the real radius: cap 2 goes 1.3 → 2.0 islands, cap 4
goes 5.3 → 6.0. **Real but small.** Recorded so the next agent does not re-derive it; not worth a
question of its own.

---

## The questions

### Q1 — Does Story 6.2 get built at all?

Eric's own framing ("the ocean is as big as its gonna be") points at dropping it, and there is a real
case: the ocean was deliberately grown 2400 → 2800 nine cycles ago for the PvE fleets (epic-5
amendment 42), and Epic 4's whole sensor calibration sits on that number.

The case against dropping it is that **the shrink only ever fires on small Standard lobbies — which
at launch is every Standard lobby.** Solo vs AI (6.5) fills to 20 combatants, so it always gets the
full ocean. So this feature is precisely the low-population early-launch experience: two captains
hunting each other across a 2800u ocean with 36 PvE hulls for company, versus two captains in an
885u pond where radar covers most of the water.

Options as I see them: **(a)** build it on the shipped curve; **(b)** build it with a floor so the
ocean shrinks but never below (say) cap-8's 1770u, preserving a real storm arc and keeping radar
under half the map; **(c)** don't build it — close FR27 as superseded, ocean fixed at 2800;
**(d)** defer until after 6.5, when there is a second mode to size against.

### Q2 — What counts as "roster" for the curve?

Story 6.2's AC says *"the actual roster at countdown"*, which was written when the only roster was
humans. Since then Story 5.6 added PvE fleets (world content, never roster) and Story 6.5 will add AI
combatants who *are* participants.

If the curve takes **captains only**, Solo vs AI gets 1 captain → an 885u pond containing 19 bots. If
it takes **combatants** (captains + AI), Solo vs AI gets the full 2800u ocean and Standard is
unaffected. The second reading is almost certainly what is meant, but it is a correctness fork that
6.5 will inherit, and `expectedCaptains` is named for the first reading. **PvE fleet drones are never
roster either way** (epic-6 context: "roving PvE fleets are world content, never roster fill").

Related and ledgered: `deferred-work.md:313` records Eric's Epic-6 teams ruling — *"~20 teams of 1-3
players … with enough room that all teams can spawn with a buffer"* — and states explicitly that
**"6.2 owns roster-dynamic sizing."** Under teams the input is hulls, not captains, and the ocean may
need to grow rather than shrink. Whether 6.2 should be specified with that in mind, or shipped now
and revisited, is part of this question.

### Q3 — Does the ring timeline scale too, or only its geometry?

AC4 says the timeline *"scales coherently with map radius down to the same Endgame Guarantee
diameter"* — and geometrically it already does, for free. What does **not** scale is the clock: 16:00
of storm regardless of roster, with sudden death starting at 15:00. On an 885u map where the endgame
ring is already 56% of the water, that is 15 minutes of a ring that barely does anything.

Three shapes: **(a)** geometry only — ship the AC as written, accept that small matches are decided
by contact rather than by the ring; **(b)** scale the clock as well, so a small ocean runs a shorter
match; **(c)** leave both alone and address it via Q1's floor instead. Note that (a) is not obviously
wrong — a small map means captains find each other fast, so the match may well end long before the
ring matters. Shrinking the endgame ring itself is **not** on the table: it is `2 × sight` by a
build-failing derivation (Story 3.4) and moving it would move gun range, star-shell range and radar
paint with it.

### Q4 — Do the PvE waves scale with the roster in this same story?

`CONFIG.fleet.waves` is absolute (4 / 2 / 1 fleets at 1:00 / 5:00 / 9:00), so a 2-captain match gets
the same 36 hulls a 20-captain match gets. Amendment 45's rationale says the waves are *"a RATIO, not
a budget: one fleet per ~5 captains"* — so the intent is already roster-scaled even though the table
is not. Roster-scaled oceans make that gap acute (10× the area density at cap 2).

Either **(a)** fold roster-scaled waves into 6.2 (they are the same problem and the XP exchange rate
pinned in cycle 85 depends on contest density), **(b)** ship 6.2 alone and ledger the fleet scaling
as its own interstitial, or **(c)** it is not a problem — the density is a feature at small rosters
and the exchange rate can absorb it.

---

## Housekeeping surfaced during this run

- **`spec-6-1-queue-based-lobbies.md` frontmatter still reads `status: 'ready-for-dev'`** although
  the story merged this morning (PR #146) and `sprint-status.yaml:190` records it `done`. Its
  **Spec Change Log**, **Review Triage Log** and **Verification** sections are also empty. A closeout
  gap, not an error — flagged rather than edited, since spec closeout is not this run's scope.
- `epic-6-context.md` is valid and already carries its `## Ratified Amendments` section (amendments
  1-10), so no recompile is required for this story.

## What happens next

Answer Q1 first — if it is (c) "don't build it", Q2-Q4 fall away and this closes as a ledger entry
against FR27 plus (probably) an interstitial for the PvE wave scaling in Q4, which is a live gap
independent of the map. If it is (a) or (b), Q2 is required before a line is written, and Q3/Q4 shape
the spec's scope.

Per Eric's invocation, implementation will run under `/orchestrate` for model selection once the
rulings land.
