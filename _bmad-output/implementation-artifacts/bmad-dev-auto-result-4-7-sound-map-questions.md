---
status: blocked
---

# BMad Dev Auto Result — Story 4.7 The Real-Time Sound Map: QUESTION GATE

Status: blocked (pre-implementation question gate; Eric ruling required before a spec exists)
Blocking condition: sonar-deferral scope fork — does "the ocean makes noise" count as passive sonar?

## Intent (invocation, 2026-08-10)

> `/bmad-dev-auto 4-7. i have decided to table/defer all active/passive sonar features (such as
> hydrophones) until after i release this as a public beta, because radar is already quite deep, and
> sonar makes a lot of sense coming bundled later with a future "submarine" class. What of this story
> is still relevant? Am I misunderstanding the purpose? Surface questions before implementation.`

No code, CONFIG, wire, or test change was made. This run recompiled `epic-4-context.md` (stale
against DESIGN.md/EXPERIENCE.md, which cycle 73 touched) and re-applied the Ratified Amendments
section per the amendments protocol. Everything else here is analysis.

---

## Short answer: yes, partly — 4.7 is not a sonar story

**Story 4.7 is the game's AUDIO DESIGN pass, not a sensor.** It is about what comes out of the
player's speakers and the accessibility law that every sound has a visual twin (so a muted player on
a school Chromebook — the primary persona — loses nothing but flourish). It is not about hull
microphones.

The confusion is understandable, because 4.7 *used* to have one sonar-shaped limb: its acceptance
criteria still list "listening-ring grammar" as the first new event to voice. **That limb was already
amputated on 2026-08-04.** Amendment 4, written the day you deferred hydrophones, says verbatim:

> Story 4.7 (Real-Time Sound Map) narrows to the events 4.3/4.5/4.6 actually introduce; **the
> listening-ring audio grammar leaves its scope.**

So today's ruling **changes nothing about 4.7's scope on paper**. It confirms a narrowing that
happened six days ago. The epics.md AC is simply stale text that no one is allowed to edit in-cycle
(the 7-5 doc-sync batch is Eric-gated).

**But the ruling does bite, in a place the AC never named.** That is the whole reason this run is
stopping instead of writing a spec.

---

## The thing that actually needs your ruling

I verified this directly against the code rather than trusting the docs. There are **24 audio call
sites in the entire client**, playing 25 tones plus the foghorn. Every single one of them is
**either your own action or something happening to you**:

| You hear | Because |
|---|---|
| your gun, torpedo, mine, decoy | you fired it |
| damage, burn, slowed, dazzled, heal, sink | it happened to your hull |
| hit call, kill, point, boon fit, bounty | you caused it or earned it |
| tick, match start, storm warn, telegraph, denied | your own match state / your own input |
| foghorn | the one exception — another captain chose to broadcast |

**Nothing another ship does makes a sound.** An enemy battleship fires its cannon 400 units away:
you see the muzzle flash, and you hear silence. A ship explodes in front of you — silence. A hull
you didn't kill sinks beside you — silence. Wounded smoke, radar paints, wakes, spawns, every
`boom` and `burst` in the game: all silent.

That silence is the single largest item in anything worth calling a "real-time sound map." And here
is the collision:

> **The moment an enemy's gunfire is audible at range, that IS a passive acoustic sensor.**

It discloses presence, through fog, at a distance, from a ship you cannot see — and if it is panned
into the stereo field it discloses bearing too. Mechanically that is the hydrophone tier wearing a
different costume. It would need its own signal-registry row, its own perception-invariant case, and
it would very likely become the seventh declared exception to the master perception invariant (the
count has held at six since 4.6 deliberately avoided becoming the seventh).

I am not going to guess which side of your ruling that falls on. **That is question 1, and it
determines whether 4.7 is a two-hour hygiene pass or a full feature cycle.**

---

## Questions (in priority order)

### Q1 — Does "defer passive sonar" mean the ocean stays silent? *(blocking)*

- **Reading A — "You hear only yourself."** Sonar deferral covers *any* audio that discloses an
  enemy you can't otherwise perceive. The ocean stays silent until the submarine bundle. 4.7 shrinks
  to hygiene: audit, ratify, add the one self-private cue that's missing. No wire change, no new
  perception exception, no PROTOCOL_VERSION bump. Lands in one small cycle.
- **Reading B — "Hydrophones-as-an-instrument are deferred, but the world can make noise."** The
  distinction being that a hydrophone is a *readout you consult* (a compass rose you learn to read),
  whereas hearing a distant boom is just… the world being loud. Under this reading 4.7 gets to voice
  third-party combat, with each new audible class costed as a real disclosure.
- **Reading C — a middle line you draw yourself.** The obvious candidate: sounds may only be voiced
  for events **you can already legitimately perceive** — you already get a muzzle flash inside 412.5u
  with island LOS, so putting a report on that flash discloses *nothing new* and needs no new
  perception exception at all. That would make the ocean audible without adding a sensor. My
  instinct says this is the sweet spot, but it is a design call and it is yours.

### Q2 — The low-HP sting: in or out?

It is the **one genuinely unbuilt cue** named in the AC — every other item on that list already
shipped (hit call in 4.3, foghorn in 4.5, bounty in 4.6, denied way back in 1.10). Its visual half
already exists (the HP-rail threshold colours + accelerating pulse, capped at 1.1 Hz). It is
entirely self-private, so it survives under any reading of Q1. Design questions if yes: does it
fire once at each threshold crossing, or is it a repeating heartbeat while you're critical? A
repeating one is a new animated/audible channel that 4.8 will have to arbitrate.

### Q3 — Do you want your own wounded smoke to be audible?

Amendment 49 explicitly parked this decision here: *"Smoke gets no audio twin this cycle… Story
4.7's sound map owns any later decision to voice it."* Note smoke is a continuous **state**, not an
event, which is a new class for a tone system whose 150ms ceiling was written for one-shots (a long
cue needs its own play path, the way the horn got one). Voicing *other* ships' smoke is a Q1
question; voicing *your own* is free.

### Q4 — Do you want to ratify the draft timbres, or leave them?

Several shipped tones are **unratified implementer drafts** flagged in the ledger as awaiting "a
later identity/audio pass with Eric" — specifically the `heal` tone, the fit-tone tier envelopes and
their per-category detunes, and the 4.3 effect geometry. 4.7 is that pass by name. This needs your
ear, not an agent's: it is 20 minutes of listening and saying "that one's wrong."

### Q5 — Should anything ever be stereo-panned?

Nothing in the game is panned today. The `monoNode` has been sitting in `context.ts` since Story 2.3
as declared plumbing "for when stereo bearing audio lands," which makes the mono-audio setting an
audible no-op. Panning is only meaningful if the world makes noise, so this mostly falls out of Q1 —
but there's a catch worth knowing: **UX-DR36 names the listening ring as the visual backstop for
mono players**, and that ring no longer exists. If anything ever pans, it needs its own bearing
surface, the way the foghorn grew its screen-edge chevron.

### Q6 — Is this worth a cycle before public beta at all?

Under Reading A, 4.7 is real but small, and most of its value is defensive (the accessibility floor
is a genuine commitment, and the twin table is how it's audited). Under Reading B or C it is a
meaty, fun cycle that changes how the game feels to play — but it also adds a perception surface
right before a beta. Legitimate answer: take Reading A now, ship the audit + the sting, and let the
loud version ride with the submarine bundle.

---

## What is genuinely left in 4.7 regardless of Q1

Work that survives every reading, so it is not wasted whichever way you rule:

1. **The call-site twin walk — a real defect hunt, not paperwork.** The twin table
   (`client/src/audio/twinMap.ts`) is exhaustive over every cue *at the type level* — adding a tone
   without naming its visual twin fails `tsc`. But the ledger records the class of bug it cannot
   catch, discovered during the foghorn cycle: **the table proves a cue HAS a twin, not that the
   twin FIRES.** The horn was playing the shipped `denied` tone at a site where none of that row's
   documented visuals could possibly appear, because the horn has no surface of its own to flash —
   and the type check passed the whole time. You resolved that one by deleting the cue (amendment
   60). Only a walk of all 24 call sites can find the rest.
2. **The low-HP sting** (Q2) — the last unbuilt cue on the original list.
3. **Ratifying the draft timbres** (Q4).
4. **Recording the doc drift** (not fixing it — 7-5 is Eric-gated): the AC's "13 existing tones" is
   wrong (25 tones + the foghorn = 26 audible cues), its "deferred denied tone" shipped in Story
   1.10, and UX-DR36's mono backstop points at a ring that no longer exists.

## What is NOT in 4.7, so nobody re-proposes it

- **Any listening ring / compass rose / pip grammar** — amendment 1, reaffirmed and widened today.
- **Any positional or on-water audio for the kill leader** — amendment 216's "ever" is absolute, and
  amendment 220 closed the surface list at three (toast, chrome-bar register, feed skull).
- **A second foghorn variant** — Eric-gated content (amendment 52).
- **Any sound file** — no asset may be sourced unattended (amendment 57, NFR9).
- **The aggregate flash budget, the tier table, the squint test** — all Story 4.8's, explicitly.

## Note on 4.8

The same deferral touches the epic's closing gate, though less sharply: 4.8 must not pin a
listening-ring Tier-1 channel (the shipped Tier-1 set is the low-HP rail pulse and the live denied
pulse), and it lost the bounty bloom as a channel when 216 deleted it. If 4.7 adds a cue whose
visual twin **animates**, that creates a 4.8 obligation — a static twin costs neither tier
assignment nor photosensitivity budget (amendment 224). Worth settling 4.7's inbox before 4.8 takes
its aggregate measurement.

---

## Recommendation, if you want one

**Reading C for Q1** (voice only what the player may already perceive — no new perception surface,
no PROTOCOL_VERSION bump, and the ocean stops being eerily silent), **yes to Q2**, **own-smoke only
for Q3**, and a **short listening session for Q4**. That is a genuine, satisfying cycle that adds no
sensor and cannot leak, and it leaves the loud, sensor-grade version cleanly available to ship with
the submarine.

But Q1 is a design ruling and the house rule is that I don't invent game mechanics — so nothing
proceeds until you call it.
