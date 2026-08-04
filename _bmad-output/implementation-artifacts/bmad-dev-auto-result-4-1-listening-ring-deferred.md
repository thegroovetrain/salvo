---
status: done
---

# BMad Dev Auto Result — Story 4.1 The Listening Ring: DEFERRED (Eric ruling)

Status: done (resolved by Eric ruling — story DEFERRED, no code change)
Blocking condition: none

## Intent (invocation, 2026-08-04)

`/bmad-dev-auto 4-1. surface any questions prior to implementation.` — Story 4.1 (The Listening
Ring) was `next_expected` after the epic-3 retrospective green-lit Epic 4. The run reached the
pre-implementation question gate, and the design conversation that followed ended in a deferral
rather than a spec.

## Investigation findings (the substrate is ready — this was not a feasibility block)

Three parallel investigations mapped the full implementation seam before any question was asked.
Recorded here so a future run does not re-pay the discovery cost:

- **Signal registry is mature** (`server/src/game/signals.ts`, 15 rows). `SignalSpec` = `{ eventType,
  visible(), materialize(), counterIntel? }`; a compile-time `Exclude<GameEvent['k'], keyof
  SIGNAL_REGISTRY>` gate means adding a wire event kind without its row breaks `tsc`. A third tier
  slots in as `listenScan()` beside `torpedoUpdateScan` in `perception.ts`, appended in `view()`
  AFTER the sorted blip subsequence so the existing golden-frame byte prefix is untouched.
- **Registry counts are hard-coded in three places** — `perception.test.ts` (`toHaveLength(15)` plus
  a two-way key-set equality against `EVENT_VERIFIERS`), `signals.test.ts`, and `goldenFrames.test.ts`
  (`EXPECTED_CHANNELS` + snapshot regen). Any new row turns all three red by design.
- **Attention seam already names this story.** `client/src/render/attention.ts` header cites "later
  the listening ring" as a Tier-1 channel; declaring one = one field on `Tier1Input` + one clause in
  `tier1Active`, with the predicate exported from the ring's own pure module (no import cycle).
- **Mono-audio plumbing was pre-built for this story.** `client/src/audio/context.ts` ships a
  `monoNode` (`channelCount = monoAudio ? 1 : 2`) whose own comment says it is "audibly a no-op today
  … plumbing for when stereo bearing audio lands". Mute is `master.gain = 0`. So "mute- and
  mono-aware" would have been satisfied automatically by routing new tones through `Audio.play()`.
- **Audio↔visual twin table already exists IN CODE** — `client/src/audio/twinMap.ts`
  (`TONE_TWINS: Record<ToneId, string>`), exhaustive at the type level, so omitting a twin is a type
  error. 22 tones exist today, not the 13 that EXPERIENCE.md:137 and the Story 4.7 AC still claim
  (doc drift, ledgered separately below).
- **Wire cost** would have been PROTOCOL_VERSION 19 → 20 (new event kind + a CONFIG block riding the
  welcome snapshot). `CLAUDE.md`'s "currently 18" is stale — actual is 19.

## The design conversation (why the ruling went the way it did)

Analysis put to Eric, in order:

1. **The engine-noise half is weak.** Inside radar range it is a strictly-worse radar (bearing-only
   vs. position, and after 4.2 also class + heading). Worse, the terminal storm ring is 660u — equal
   to radar range by derivation — so at the endgame every surviving hull is inside every other hull's
   hearing range simultaneously and the ring saturates in all directions exactly when a pip most
   needs to mean something.
2. **The torpedo half is real but narrower than it looks.** Corrected mid-conversation: Battleship
   turn rate is 0.4 rad/s (90° in ~3.9s), not the ~0.2 extrapolated from the pip ladder — so the
   existing 5.5s of truesight warning is already enough TIME to comb the tracks. The genuine gap is
   ATTENTION (noticing a thin fish in top-down clutter), not time. That reframes the ring as an
   attention director, which competes with cheaper fixes — notably the UX-DR20 materialization
   treatment and longer-range visible wakes (torpedoes displace water; Eric raised this himself).
3. **Sequencing was backwards.** Torpedo = 55 dmg / 12s reload / 1 in the tube → 3.2 hits and ~36s to
   kill a 175hp Battleship. Mine = 45 dmg → 4 mines, and the target must drive over them. A BS volley
   is cannon 50 + gun 25 = 75. The ring is counterplay for weapons that do not currently need
   countering; its value is contingent on a rebalance that had not happened.
4. **Mines argue against themselves.** Eric: late-noticing is ESSENTIAL to making mines a threat, so
   long-range mine audio would damage the very design it appears to serve. The only shape that
   survived scrutiny: a DORMANT mine is silent, an ACTIVE tracking mine that has acquired and is
   creeping sings — warning only once it is already committed, without spoiling the field.
5. **Distant explosions: cut.** Bearing-only with no range on a 2400u map means "combat somewhere in
   that 90° cone", which the kill feed half-tells you already.

## Eric ruling (2026-08-04, this run)

**DEFER the hydrophone tier.** Story 4.1 is not cut — it is saved as a feature to add later if the
need is demonstrated. Eric verbatim: *"Lets go ahead and defer the hydrophones, we'll save it as a
feature we can add later if I decide we need it. I think there's enough information, and active sonar
is going to be added anyway."*

Rationale of record, from the same message:

- **There is enough information in the game already.** The two shipped sensor tiers plus the kill
  feed and chrome bar carry the match; a third passive tier is not needed to make fights legible.
- **Active sonar is coming anyway** and will occupy adjacent design space, so spending the third-tier
  complexity budget on passive hydrophones now risks building the wrong instrument first.
- **Torpedoes will NOT get faster** — 60 u/s already maps to a realistic 60–80 knot torpedo, so speed
  is not the balance lever. (This forecloses the "faster fish makes the ring necessary" path.)
- **Weapon cooldowns are likely going UP** on most if not all weapons — the rebalance direction is
  toward longer commitment cycles, not toward more lethal individual shots.

## Consequences (what this ruling touches downstream)

- **Story 4.5 (The Foghorn) loses its display surface.** Its ratified behavior is "the listening ring
  lights an arc sweep along the honk's bearing". With 4.1 deferred, 4.5 must either grow its own
  bearing surface or defer alongside. NOT decided here — flagged for the 4.5 spec author.
- **Story 4.7 (Real-Time Sound Map)** no longer covers 4.1's audible classes; its scope shrinks to
  the events 4.3/4.5/4.6 actually introduce.
- **Story 4.8 (Attention Priority)** loses one Tier-1 channel. The tier table's listening-ring row
  becomes aspirational until the ring lands; 4.8 must not pin a channel that does not exist.
- **The deferred submarine class** loses its designed counterplay (hydrophones). Active sonar is now
  the presumptive answer there — worth confirming whenever the submarine is reconsidered.
- **The 2026-08-02 radar/island LOS ruling** named hydrophones as the designed answer to close-range
  island shadows (`bmad-dev-auto-result-radar-los-truesight-shadows.md`). That answer is now
  deferred; island shadows stay a total blind spot until active sonar ships. The LOS ruling itself is
  unchanged and still stands.

## Outcome

No code, CONFIG, wire, or test change. PROTOCOL_VERSION stays 19. No VERSION bump — no build cycle
landed (versioning ruling: 0.17.X counts landed build cycles only, same precedent as the 2026-08-02
radar/island LOS ruling cycle). Epic 4 proceeds at Story 4.2 (Class-Legible Blips).

This artifact plus `epic-4-context-amendments.md` (amendment 1) are the durable record, so a future
session does not re-plan the listening ring against a compiled epic context that still assumes it.
