---
status: blocked
---

# BMad Dev Auto Result — Story 4.8 Attention Priority & the Readability Gate: QUESTION GATE

Status: blocked (pre-implementation question gate; Eric rulings required before a spec exists)
Blocking condition: four design rulings — the Tier-1 HP threshold, the aggregate flash budget's
mechanism, whether tier arbitration extends past HUD chrome to the water, and what the squint test
actually delivers.

## Intent (invocation, 2026-08-11)

> `/bmad-dev-auto pull in latest main and then lets do 4-8. surface questions before implementation.
> use /orchestrate for choosing a model for subagents based on task complexity.`

Latest main is pulled and merged (local `main` had diverged; cycle 74 / Story 4-7 is now in).
No code, CONFIG, wire or test change has been made. Everything below is investigation.

---

## What 4-8 actually is

Story 4-8 is the epic's **closing gate**, and it is the only story in Epic 4 that is not a feature.
It has three jobs:

1. **Generalize the attention-tier seam** from the Tier-1→Tier-2 edge that Story 3-2 shipped into
   the full three-tier arbitration EXPERIENCE.md ratified.
2. **Build the aggregate photosensitivity budget**, which has been a ratified accessibility floor
   since day one and **has never had a mechanism** (`deferred-work.md:447`).
3. **Run the readability gate** — the documented squint test on a staged worst-case fight — and cost
   every Epic 4 effect against the frame budget.

The epic's whole guardrail (*"information noise must never bury the hunt"*, `gdd.md:81`) is closed
here or not at all.

## What I found in the code

I inventoried every animated channel in the client. **There are 31.** Two of them are wired to the
attention seam. Twenty-nine are not.

| | Count |
|---|---|
| Animated/pulsing/flashing channels shipped | **31** |
| Wired into `render/attention.ts` | **2** (storm vignette, chrome-bar ring) |
| Tier-1 sources feeding the seam | **2** (low-HP rail breath, denied pulse) |
| Tier-3 channels implemented | **0** — the header says so in as many words |
| Global/aggregate flash mechanism | **0** |

`holdAtLitKeyframe()` is an orphan: it is called only from tests, because both real Tier-2 consumers
inline `tier1 ? 1 : 0` at their call site.

**The worst realistic stack**, all simultaneous and all legal today: a 20-hull fleet action inside
muzzle-flash reach, own hull critical, outside the ring, in the final-10s window, taking hits —
Tier-1 HP breath + full-screen vignette + chrome-bar ring + screen shake + ~20 hull flashes (130 ms
each) + 20-40 muzzle flashes + N Hit-Call blooms + splashes + ~120 smoke puffs + burst rings.
Standing between that and the photosensitivity floor: two 240 ms `easeHold` filters and a handful of
per-instance 300 ms floors. **Nothing counts flashes per region per second anywhere in the client.**

---

## Q1 (BLOCKING) — The HP threshold: I don't think it's drift

This is ledgered as documentation drift (`deferred-work.md:323`) — EXPERIENCE.md's tier table says
the Tier-1 HP channel is **"HP Rail pulse <25%"**, the shipped rail breathes below **50%**, and
amendment 16 deliberately pinned the seam to the rail's own predicate so the number had one source.

**Having read both, I think the two numbers are describing two different things and both documents
are right.** The case:

- The rail's **colour bands** are ratified at 50% and 25% (amendment 41, Eric: *"Then those are the
  numbers I want"*): phosphor ≥50%, **amber** 25-50%, **crimson `damage-marker`** <25%.
- `<25%` is exactly the **crimson/critical** band. "Tier 1 threat" reading as *critical* rather than
  *warning* is coherent — the amber band is a warning, the crimson band is a threat.
- The amber corollary (*"only the highest-tier active amber channel pulses"*) is **only
  implementable if the amber rail is not Tier 1.** If a 25-50% rail were Tier 1, it would outrank
  the final-10s ring's amber pulse permanently, and the corollary would resolve to "the rail always
  wins" in every wounded endgame — which is the opposite of what the rule is for.

And the consequence that made me look twice: **at the 50% reading, Tier 1 is active for most of the
back half of most fights.** Below-50% hull is not a rare state. Every minute you spend wounded,
the storm vignette is pinned at its lit keyframe and the final-10s ring amber never pulses at all.
The arbitration would be nearly vacuous — a system whose whole point is that the climax stays
readable would be permanently jammed in its climax state.

**Recommendation:** Tier-1 HP = the **crimson band** (`frac < criticalBelow`, 25%). The rail keeps
breathing below 50% exactly as it does today (that is its own display grammar, untouched); what
changes is only *when the rail claims the threat tier*. Both docs then become true as written, the
amber corollary becomes meaningful, and no shipped behaviour regresses.

The alternative — keep 50%, amend EXPERIENCE.md — is a legitimate call and yours to make; it just
costs the amber corollary its meaning.

## Q2 (BLOCKING) — The aggregate flash budget: what happens when it binds?

The floor is ratified and unambiguous (NFR13, EXPERIENCE.md:138, DESIGN.md:256): *"no element or
screen region flashes more than 3×/s regardless of how many compliant events stack."* It has never
been built. Two sub-questions have to be answered together, because the mechanism depends on them:

**(a) What is a "region"?** Nothing defines it. A screen grid, a per-layer bucket, a per-widget
bucket, or a proximity cluster in world space are all defensible and produce very different code.

**(b) What does the budget DO to the flash that would exceed it?** This is the real problem,
because the biggest stackers are **declared information**, not juice: Story 4.3 explicitly promoted
`muzzle` and `spark` *out* of `isJuiceEffect`. Deleting a muzzle flash to save budget deletes a
sanctioned sensor reading, and the standing law is that the motion setting *"removes MOTION, never
INFORMATION."* So the budget cannot simply drop flashes.

**Recommendation — degrade, never delete, in two stages:**

1. **Coalesce first.** Co-located same-kind flashes in one frame collapse to a single draw. This is
   amendment 37's already-ratified *one-frame-one-cue* grammar (*"one shake, one tone at the summed
   magnitude"*) extended from audio to visuals — no new principle invented.
2. **Then degrade.** If a region is still over 3 flashes/s, further flashes render at their
   **already-ratified `motion: 'off'` keyframe** — the static mark each channel is already required
   to have. Presence, position and weight survive by construction, because every channel already
   guarantees its off-state carries the information; only the animation is spent.

That gives the budget a mechanism that cannot leak information, reuses two existing ratified rules
rather than inventing a third, and degrades gracefully instead of cliff-edging.

## Q3 (BLOCKING) — Does tier arbitration reach the water, or stop at the HUD?

The ratified tier table lists **only HUD chrome** (pips, denied pulses, HP rail / ring pulse, storm
vignette / bank chip, toasts, XP wrap). But `epic-4-context.md:62` says 4.8 *"must arbitrate ALL
channels landed by 4.2-4.12 plus the HUD's pre-existing animations — including the radar-physics
visuals."* Those two statements point in different directions, and 29 unwired channels sit in the gap.

**Recommendation — split the two systems, because they answer different questions:**

- **TIER arbitration stays HUD chrome only.** A tier hold means "hold at your lit/dim keyframe" —
  that is a coherent instruction for a breathing widget and a meaningless one for a 120 ms muzzle
  flash at a world position. World effects are diegetic information; they are not competing for the
  eye as *chrome*, they *are* the thing the eye is hunting.
- **The flash BUDGET covers everything, including the water.** The floor says "element **or screen
  region**", and the worst stacking in the game is on-water combat effects. Exempting them would
  gut the rule.

So: ~8 HUD channels get tiers; all 31 answer to the budget.

## Q4 — The squint test: what do you want as evidence?

The AC calls for *"a squint-test on a staged worst-case fight (multiple contacts, torpedoes inbound,
storm closing, kill leader active)"* confirming threat channels read first. The only prior squint
test of record was run on a static HTML mockup (`EXPERIENCE.md:160`), which cannot show stacking.

Options, roughly by cost:

- **A. Staged capture (recommended).** A dev-only staged worst-case scene + headless captures at
  both zoom extremes, plus the measured per-frame cost, written up as the documented check. You
  review the images. This matches how every recent cycle produced evidence.
- **B. Playable staging.** Same scene, but wired as a dev room option so you can fly it live. More
  faithful; more build.
- **C. Documented analysis only.** Cheapest, weakest — and the AC does say *documented*.

**Recommendation: A**, with the staged scene reusable so B is cheap later if you want it.

---

## Decided with stated assumptions (say so if any is wrong)

These follow from the docs and don't need a ruling unless you disagree:

- **Tier 3 membership** = XP bank-chip breath, upgrade/level toasts, XP-rail wrap — exactly as
  EXPERIENCE.md lists them. The chip's existing 10 s decay-to-static stays; the tier freeze is
  additional, not a replacement.
- **Tier 3 freezes under Tier 2 alone**, not just under Tier 1. The docs say *"any higher tier"* for
  Tier 3 and only *"Tier 1"* for Tier 2 (drift D5); I read the asymmetry as deliberate and will
  implement it literally.
- **Tier 2 does not hold under another Tier 2.** Never stated anywhere; same-tier channels coexist.
- **`holdAtLitKeyframe()` stops being an orphan** — the two inline `tier1 ? 1 : 0` sites route
  through the seam, so the rule lives in one place.
- **No new tunable is invented where an existing floor expresses the idea** (amendment 37's standing
  rule): the budget reuses `pulseCapHz`, the 300 ms floor and the 80 ms pulse as-is.
- **The kill-leader name glow stays static** and stays out of the budget (amendment 224) — it is not
  an animated channel and gets no tier.
- **The 4-6 scope reduction holds**: the Bounty Bloom is not a channel here (amendment 216). Note
  `epics.md:162` (UX-DR19) still carries the bloom unretired — that is stale text for the Eric-gated
  7-5 doc batch, not something this cycle edits.
- **Doc drift is reported, never silently fixed in-cycle.** Seven disagreements found between
  DESIGN.md / EXPERIENCE.md / epics.md; all are ledgered for 7-5.

## The one thing I want to flag as a risk

Story 4-8 is a **cross-cutting refactor of 31 channels plus a new global mechanism plus a
measurement pass**, and it is the last story standing between Epic 4 and done. It is the largest
surface area of any cycle in this epic. If Q1-Q3 land as recommended it is tractable, because the
tier work shrinks to ~8 HUD channels and the budget becomes one shared module every flash site calls.
If tier arbitration is ruled to cover all 31 channels, this is realistically two cycles, and I would
want to split it explicitly with your approval rather than discover that halfway.

---

*No files were modified. Awaiting rulings on Q1-Q4.*
