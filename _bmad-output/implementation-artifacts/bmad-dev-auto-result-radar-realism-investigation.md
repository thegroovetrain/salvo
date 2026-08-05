---
status: needs-input
---

# BMad Dev Auto Result — "Make radar really work like a real radar"

Status: needs-input (investigation delivered; go/no-go is Eric's)
Blocking condition: awaiting Eric's decision on the radar information model. No code changed.

Date: 2026-08-05 · Cycle would be 50 (0.17.50) · Current PV 23
Trigger: playtest feedback from **ohzie** (day-one player), plus Eric's "what does a REAL radar see?"
and two Garmin marine-radar reference screenshots.

---

## 1. The input

**ohzie (Discord, 2026-08-04):**
- "okay so I kind of hate the new radar"
- "It's almost too much information, right? Like the fact that I can tell **what you are** and
  **whether you're a player**"
- "**I like the heading** / but not the ship outline or color / I think the green dot was good"
- Reason of record, in his words: *"oh this isn't a realism thing for me it's a **mysticism** thing …
  if I see your outline and I know I'm low on upgrade points I'ma steer clear, right … when
  everyone's just a blip, **chasing a blip is a risk**, and risks get your blood up. it's a pvp game."*

**Eric:** wants to go further than ohzie asked — actual radar behavior: *"Indiscriminate, kinda fuzzy
shapes roughly the size of the object based on what the radar 'sees' that don't transmit any
information about what the target is,"* with heading/speed left as an **inference from ghost paints**
("that is still real").

**Garmin reference shots:** irregular blobs of varying size; **color encodes echo strength / gain
(red = strong, green-yellow = weak) — never target identity.**

---

## 2. This is Story 4.2's road not taken

`epic-4-context-amendments.md`, amendment 8 (2026-08-04), verbatim:

> **Radar BEHAVIOR is realistic; the silhouette grammar is the retained game conceit.** Eric chose
> this over **full realism (size-scaled blobs with no class on the wire, which would have superseded
> UX-DR10 and rewritten the story)** and over the hybrid (live paint shaped, ghosts as blobs).

So the proposal is not new — it is precisely **Option B of Story 4.2's own question gate**, which was
declined on design taste. What has changed is that there is now playtest evidence against the option
that won. Reversing on evidence is legitimate; it should be recorded as a *supersession* of
amendments 7, 8, 10, 12 and 13, not as a fresh idea.

Precedent exists for exactly this move: amendment 9 already reversed Eric's own provisional
one-sweep-decay pick on a realism argument.

---

## 3. What a blip actually transmits today — four separable channels

Wire shape (`shared/src/types.ts:313`):

```ts
export interface BlipEvent {
  k: 'blip'; id: string; x: number; y: number; t: number;
  cls: HullId;      // hull id at paint time
  heading: number;  // rad
  speed: number;    // u/s, signed
}
```

| # | Channel | Source | Real radar? | ohzie |
|---|---|---|---|---|
| A | **Owner identity (personal hue)** | `id` → **public roster** `color`, via `hueLatch` | No | hates |
| B | **Drone vs. player** | `cls` (drones paint the legacy chevron, amd. 12) **and** roster grey | No | hates (this is his "whether you're a player") |
| C | **Exact class** | `cls` → `hullSilhouette()`, true-scale | No (approx. size only) | hates ("not the ship outline") |
| D | **Heading + speed** | `heading`, `speed` → rotated hull + ARPA arrowhead | Not on a raw scope; ARPA computes it | **likes** |

### 3.1 The finding that matters most: A and B cannot be fixed in the renderer

`ArenaState.PlayerMeta` publishes `id → color` (hue index) **and** drone grey (`REGATTA_NO_HUE`) to
every client, every tick, by design (`server/src/rooms/schema/ArenaState.ts:9-25`). The blip carries
`id`. Therefore **owner identity and drone-vs-player are re-derivable client-side from `id` alone**,
no matter what the renderer draws.

Deleting `cls` and the hue from the *renderer* is cosmetic: a modified client re-colors every track
in ten lines. Given that this codebase's stated spine is *"frames.ts is the single spatial chokepoint
(anti-cheat)"* with property-style invariant tests behind it, a render-only fix would be the first
sensor change in the project that a cheat client can simply undo.

**Truly deleting identity from radar requires breaking the blip's `id` ↔ ship linkage** — i.e. a
per-observer, per-match **pseudonymous track id**, server-side mapped. Note the ceiling: a stable
pseudonym still lets any client color tracks *consistently within a match*; it removes "**which
player** is that," not "these three ghosts are one track." That is the correct amount of information
(ghost-linking is what makes course inference work) but it should be a conscious choice, not a
surprise.

`id` is load-bearing in two places that must survive: per-track ghost capping keys on it
(`radar.ts` `capOldestByKey`, `paintsPerContact: 3`), and the **decoy lie is literally "emit a blip
under the OWNER's ship id"** (`signals.ts:451`). Both work fine over a pseudonym; the decoy just
needs the same pseudonym as its owner.

### 3.2 Variant P already exists — and is only half the change

`client/vite.config.ts:15` ships `__BLIP_VARIANT_P__` (`HC_BLIP_VARIANT_P=1`), amendment 13's
"phosphor-anonymous blips" A/B lever. But `radar.ts:115` shows it only swaps the **hue**:

```ts
this.hueFor = BLIP_VARIANT_P ? () => CLIENT_CONFIG.colors.phosphor : hueFor;
```

The silhouette, the heading rotation and the ARPA vector all remain. So there is a ready lever for
channel A's *appearance* — useful for a fast on-water gut-check — but it is not the proposal, and it
is not cheat-resistant.

---

## 4. The design core: aspect-dependent return size

Eric's phrasing — *"kinda fuzzy shapes roughly the size of the object"* — has a much better answer
than a class-keyed size bucket.

A naive implementation sends a size enum (`sz: 0|1|2`). That is **channel C with extra steps**: three
buckets, three classes, class readout restored.

The real-radar answer is that a return's size depends on **aspect**. A battleship bow-on paints a
narrow return; a torpedo boat abeam paints a comparatively broad one. Compute one continuous scalar
server-side:

> `ext` = the hull silhouette's extent **projected perpendicular to the observer→target bearing**,
> from the polygon already in `shared/src/sim/silhouette.ts` (`hullSilhouette`, `transformPolygon`;
> `extentAlong` in `blipMarks.ts:103` is the near-identical primitive).

Properties, all of which serve the goal:

1. **Size stops mapping to class.** A large return is *either* a BB bow-on *or* a TB abeam. That
   ambiguity is exactly ohzie's mysticism, delivered by physics rather than by a fudge.
2. **It satisfies "roughly the size of the object"** literally and honestly.
3. **`cls` leaves the wire entirely** — channels B and C die at the source, not in the renderer.
4. **Heading becomes emergent twice over**: from ghost-track direction *and* from returns pulsing in
   size as a contact turns. Both are inferences, never readouts. This is precisely Eric's *"you can
   guess this from ghost paints, as that is still real."*

Anti-cheat note: `ext` must be derived from hull geometry + relative bearing **only**. It must not
reflect boons, hp, damage state, or anything range-derivable — otherwise it becomes a new leak in a
frame shape whose whole point is to have fewer.

---

## 5. Heading and speed: the one place ohzie and Eric disagree

Full realism **deletes the ARPA vector ohzie explicitly said he likes** — the single piece of the new
radar he asked to keep. This is the only genuine conflict in the input and it should be a conscious
call.

The mitigating fact is strong: **amendment 9's 3-paint persistence was justified on exactly this
ground.** Verbatim: *"long-persistence phosphor is how course and speed are actually plotted off a
scope … Emergent property worth preserving: ghost SPACING encodes speed, so a fast hull's ghosts sit
nose-to-tail while a loitering hull's overlap into a blob."*

So removing `heading`/`speed` from the wire does not *destroy* the information — it **demotes it from
readout to inference**, which is the entire stated goal. ohzie keeps being able to read course and
speed; he has to read it off the track instead of off an arrow. A dead-in-the-water contact reads as
stacked overlapping blobs, which is legible and correct.

---

## 6. Two happy side effects

**The decoy gets its nerf back.** Amendment 11 knowingly accepted that under persistence *"a
stationary buoy's stacked paints unmask it in ~2 sweeps, a real nerf to Story 1.8's decoy."* Under
anonymous size-only blobs a stationary buoy is far less self-evident, and Story 4.3's ratified
disambiguation oracle (*"shooting a decoy produces no Hit Call"*) becomes the primary unmasking
route — which is what it was designed to be. Strong systemic synergy.

**Color can survive, repurposed.** The Garmin shots show color = **echo strength**, not identity.
Hullcracker can keep a visually rich, multi-color scope by mapping color to return strength
(a function of `ext` and range) instead of to owner. That is *more* realistic than monochrome green
and preserves the visual investment. It is a real third option beyond "green dot" vs. "colored
silhouette," and worth putting in front of Eric explicitly — ohzie asked for the green dot back, but
his stated objection was to color-as-**identity**, which strength-mapped color does not restore.

Consequence if hue dies: `CLIENT_CONFIG.blip.coolFloor` and the greyscale `blipCool` multiplier exist
*only because* hue became a channel in 4.2 (`config.ts:1166-1172` says so outright). Deleting hue lets
the original bright→dark phosphor **green ramp** return — which is also the Garmin look.
`luminanceFloor()` in `blipMarks.ts` (~65 lines of WCAG bisection, amendment 13) retires with it.

---

## 7. Blast radius

Not a small cycle. Roughly 60–70% of Story 4.2's own size, and it is a **wire break: PV 23 → 24.**

| Area | Work |
|---|---|
| `shared/src/types.ts` | `BlipEvent`: drop `cls`/`heading`/`speed`, add `ext`; rewrite the ~12-line rationale block above it |
| `shared/src/index.ts` | `PROTOCOL_VERSION` 23 → 24 |
| `server/src/game/signals.ts` | `blipShape` / `blipSignal` / decoy counter-intel (~4 sites) + new aspect-projection helper; pseudonymous track id if adopted |
| `shared/src/sim/silhouette.ts` | expose the perpendicular-extent primitive (near-clone of `blipMarks.ts:extentAlong`) |
| `client/src/render/radar.ts` | major rewrite of `drawBlip` — blob geometry replaces silhouette tracing |
| `client/src/render/blipMarks.ts` | `speedVector` retires; `luminanceFloor` retires if hue dies |
| `client/src/render/phosphor.ts` + `config.ts` | restore the green ramp; retire `coolFloor` / `blipCool` |
| `client/vite.config.ts` | Variant P define retires (it becomes the shipped behavior) |
| Tests | 7 server files incl. `signals.test.ts`, `perception.test.ts`, `decoy.test.ts` and the **goldenFrames snapshot**; ~4 client files incl. `blipMarks.test.ts` |
| Docs | supersedes amendments 7, 8, 10, 12, 13; DESIGN.md + EXPERIENCE.md blip blocks already carry pending 4.2 drift in the 7-5 batch (amd. 14) — this lands on top of it |

**Anti-cheat posture improves.** The change strictly *removes* fields from frames. The master
perception invariant and its four declared exceptions (`sp`, `hc`, `mz`, `sunk`) are untouched.

---

## 8. Recommendation

**Go — with the aspect-dependent `ext` scalar as the core, and the identity question decided
explicitly rather than inherited.**

The evidence is unusually clean: a day-one player's objection ("too much information," "chasing a
blip is a risk") lands on exactly the three channels that are *not* real radar behavior, while the
one channel he wants to keep is already recoverable as an inference by a mechanism the codebase
adopted on the same reasoning eight amendments ago. Aspect-dependent return size is the piece that
turns this from "delete features" into "model the sensor," and it is the reason to prefer it over
simply reverting to the pre-4.2 green dot.

The one thing not to hand-wave is §3.1: decide deliberately whether identity leaves the *wire* or
merely the *render*. Render-only is a third of the work and a third of the result.

---

## 9. Open questions — for the pre-implementation gate, if Eric says go

1. **Identity: wire or render?** Pseudonymous per-match track ids (real deletion, more work, decoy
   must share its owner's pseudonym), or accept that a modified client can re-derive owner + drone
   status from `id` + the public roster?
2. **Color:** monochrome phosphor green (ohzie's "green dot"), or Garmin-style **echo-strength**
   color? The latter keeps the visual richness and is *more* realistic, and does not restore the
   identity channel he objected to.
3. **Does the ARPA speed vector die outright**, or survive in some reduced form? Full realism says it
   dies; ohzie explicitly asked to keep it. (Recommendation: dies — §5.)
4. **Do drones still read differently at all?** Under a pure size-only model they cannot, by
   construction. Confirm that a drone being indistinguishable from a captain on radar is desired
   (it arguably *helps* the solo-match illusion).
5. **Blob shape grammar:** how "fuzzy"? A jittered irregular polygon seeded per (track, paint) so it
   is stable within a paint but varies between paints, or a soft-edged sprite scaled by `ext`?
   This is a DESIGN.md-level call and needs the design doc read before answering.
6. **Does `ext` account for range** (farther = weaker/smaller return), or size only?
7. **Persistence:** keep `persistSweeps: 3` / `paintsPerContact: 3`? They become *the* course-and-
   speed channel, so they may want retuning upward now that they carry more load.
8. **Do islands / the storm produce returns?** A real marine scope paints landmass — the Garmin shots
   are mostly coastline. Islands are already client-known from the map seed, so painting them is
   free and costs no disclosure. Out of scope, but it is the obvious follow-on and worth knowing
   whether Eric wants it in the same cycle.

---

## 10. What was NOT done

No code changed. No spec written. Awaiting Eric's go/no-go per his instruction:
*"Investigate this for me and surface your findings. If I decide to go with it, then surface any
questions before implementation, and use /orchestrate to select a model for subagents based on task
complexity."*
