# The Readability Gate — Story 4.8, cycle 75 (2026-08-11)

**What this is.** Epic 4's closing guardrail, made into an artifact. The GDD's standing rule is
*"information noise must never bury the hunt"* (`gdd.md:81`), and Story 4.8's acceptance criterion
turns it into a documented check: *"a squint-test on a staged worst-case fight (multiple contacts,
torpedoes inbound, storm closing, kill leader active) confirms threat channels read first — the
documented readability check every E6 feature must pass"* (`epics.md:908`).

**Why it is a capture and not a mockup.** The only prior squint test of record
(`EXPERIENCE.md:160`) ran on a static HTML composite, which by construction cannot show the one
thing this story exists to bound: channels STACKING. Amendment 242 rules the gate as a dev-only
staged worst-case scene captured at both zoom extremes with the measured per-frame cost alongside.

---

## Part 1 — The channel ledger

Every animated channel shipped in the client at the close of Epic 4, with its disposition under the
two systems this story built. **31 channels were inventoried; 2 were wired to the attention seam
before this cycle.**

Two systems, deliberately split (amendment 241): **TIER** arbitration stops at HUD chrome, because
"hold at your lit keyframe" is a coherent instruction for a breathing widget and a meaningless one
for a 120 ms muzzle flash at a world position. The **BUDGET** covers everything including the water,
because its ratified floor says "element **or screen region**" and the worst stacking in the game is
on the water.

### Tier 1 — THREAT (always animates; owns the eye)

| Channel | Where | Disposition |
|---|---|---|
| Low-HP rail pulse, **crimson band only** (`frac < criticalBelow`) | `render/hud.ts` | Tier 1 via `railCritical`. Amendment 239 — the amber 25-50% band is a WARNING, not a threat. |
| On-water denied-fire pulse | `render/deniedFire.ts` | Tier 1; also budget-**counted** as `deniedArc` (see note below). |
| Per-slot hotbar denied pulses | `main.ts` / `render/hotbar.ts` | Tier 1 — **newly wired this cycle.** The ratified table says "denied pulses" PLURAL; only the on-water one had ever fed the seam. |

### Tier 2 — MATCH STATE (holds at its LIT keyframe under Tier 1)

| Channel | Where | Disposition |
|---|---|---|
| In-storm vignette (1.1 Hz) | `render/zone.ts` | Tier 2, pre-existing consumer; now routed through `holdAtLitKeyframe`. |
| Chrome-bar final-10s ring pulse (1 Hz) | `render/hud.ts` + `ui/chromeBar.ts` | Tier 2, pre-existing consumer; now routed through `holdAtLitKeyframe`, and it is the winner of the amber corollary. |

### Tier 3 — ECONOMY (freezes at its DIM keyframe under ANY higher tier, Tier 2 included)

| Channel | Where | Disposition |
|---|---|---|
| XP bank-chip breath | `render/xpRail.ts` | Tier 3 — **the only Tier-3 channel that exists.** Freeze eases to the dim keyframe; the shipped 10 s decay-to-static is untouched and the freeze is a literal no-op on an already-static chip. |
| Upgrade / level toasts | `ui/upgradeToast.ts` | **Nothing to freeze — verified, not assumed.** A one-way DOM `transition: opacity` on its TTL. There is no keyframe to hold, and "freezing" it would mean pinning a toast on screen. |
| XP-rail wrap / fill | `render/xpRail.ts` | **Nothing to freeze — verified.** `railFill.alpha` is assigned once in the constructor and never animates. |

No animation was invented so that it could be frozen.

### The amber corollary

*"Only the highest-tier active amber channel pulses; every other amber element holds steady."*
Two amber channels can be simultaneously active, and they are ranked `ring` > `hpRail`:

- **Ring urgent + amber rail** → the ring pulses, the rail eases to its LIT keyframe.
- **Below 25%** the rail turns crimson, leaves the amber set entirely, and becomes Tier 1 — under
  which *both* ambers hold lit.
- Read as design: at 40% hull with the storm closing in 8 seconds, the storm is what kills you.

A held channel is provably never *dimmer* than a breathing one — `hullFillHeld` holds at `sin(π/2)`,
the TOP of the same wave — so "hold steady" never becomes "fade out".

### Budget-governed one-shots (all regions and elements)

`muzzle`, `muzzleHeavy`, `spark`, `splash`, `pierce`, `burst`, `sink`, `horn` ring, hull hit flash,
foghorn chevron pop, refit denied pulse, hotbar slot/frame flashes, zone reveal flash.

### Deliberately exempt, and why

| Exempt | Reason |
|---|---|
| **Every breathing channel** (HP rail, storm vignette, ring segment, bank chip, hotbar ACTIVE outline, ember disc, smoke billow, arc swell) | Capped at `pulseCapHz` (1.1 Hz) or below **by construction**, so none can ever reach 3 flashes/s. Routing them through the budget would count something that cannot exceed the count. **Do not "fix" this omission.** |
| `wake`, `torpwake` | Trail dots, not flashes. Budgeting them would let a mine crawling through a region spend that region's three onsets on its own track and degrade the muzzle flashes and Hit Calls landing there next. |
| `burst` — from the **coalescer only** (it is still budgeted) | A burst carries a PER-SPAWN RADIUS, so two co-located bursts are not one fact; collapsing them could drop the larger blast extent, which is real spatial information about a danger zone. Fixed at the review gate. |
| Radar sweep rotation, phosphor decay, contact fades, kill-feed and toast TTL fades, pre-join ambient scope | Continuous or one-way transitions, not flash onsets. |
| Kill-leader name glow | **Static by ruling** (amendment 224) — a static glow is not an animated channel at all, so it costs no budget and needs no tier. |

**Note on the denied arc:** it is budget-*counted*, not budget-*bound*. Its own `PULSE_RATE_MS`
floor permits ~3.33 onsets/s against the 3/s ceiling (pre-existing since Story 1.10), and it has no
degraded form of its own because `render/firing.ts` already draws the denial as a flat recolor with
no luminance ramp to spend. Its verdict surfaces on the primed slot's chip instead.

---

## Part 2 — Degrade never deletes

The story's central law is that the budget may spend ANIMATION but never INFORMATION — the standing
rule that the motion setting *"removes MOTION, never INFORMATION"*, extended to a second filter.
This table was produced by an independent adversarial review pass that traced every degraded form in
the code, and it is the evidence for that claim.

| Channel | Degraded form | Presence | Position | Direction / weight | Confusable? |
|---|---|---|---|---|---|
| `muzzle` | additive dot, full 120 ms, radius ramp KEPT, flat alpha | yes | true muzzle point | reduced | no — colour + shape kept |
| `muzzleHeavy` | same flat rule; still fully suppressed at `motion:'off'` | yes | yes | reduced | no |
| `spark` (Hit Call) | dot ramp kept, full 200 ms, flat alpha | yes | true impact | reduced | no |
| `splash` (fall-of-shot) | ring **still expands**, full 500 ms, flat alpha | yes | true impact | reduced | no — expansion geometry intact |
| `pierce` (the AP tell) | ring **still contracts** | yes | yes | reduced | **no — the contracting signature survives, so AP never reads as a stop** |
| `burst` | ring expands to its TRUE radius | yes | yes | blast radius kept | no |
| `sink` | expanding crimson ring, full 900 ms | yes | yes (still `seen`-gated upstream) | reduced | no |
| `horn` (own-honk ring) | flat alpha, full 1 s, expansion kept | yes | yes | reduced | no |
| Hull hit flash | same 130 ms window, same hull, intensity scaled; **duration never cut** | yes | yes | reduced | no |
| **Foghorn chevron** | **only the pop-in scale is spent** — alpha, bearing rotation, band weight and TTL fade byte-identical | yes | screen-edge position kept | **bearing + weight fully intact** | no — **exactly the `motion:'off'` keyframe** |
| On-water denied arc | render unchanged (already its own flat form) | yes | yes | full | no |
| Hotbar slot denied pulse | glow zeroed — **provably identical to `slotSkin(state, 0)`**, the shipped `motion:'off'` skin; border and icon intact | yes | yes | full | no |
| Hotbar frame flash | full-size frame at true position, stroke alpha reduced; the `◆n` counts carry the fact statically | yes | yes | reduced | no |
| Refit denied pulse | border still snaps to the denied colour for the full pulse; only the glow drops to its rest value | yes | yes | full | no |
| Zone reveal flash | flat for the whole 80 ms envelope, **never zero inside it**; the dashed telegraph untouched | yes | yes | reduced | no |

**None goes invisible. None drops a bearing. None becomes confusable with a different event.**
Degrade spends only the luminance ramp; every discriminating channel (shape, expansion vs
contraction, colour, radius, rotation) is untouched by construction.

The only non-drawing outcome anywhere in the system is the coalescer's collapse, which requires
same-kind + same-quantized-point + same-frame — a duplicate of a mark that IS being drawn at that
point in that frame.

### The one calibration this leaves open

Amendment 240 justifies degrading by saying the degraded rendering *"is a state the game already
ships and every player can already select."* That is **true for the chrome channels** — the chevron
and the hotbar slot degrade to literally their `motion:'off'` forms. It is **false for exactly the
biggest stackers**: `muzzle`, `spark`, `splash`, `burst`, `pierce` and the hull hit flash are
deliberately not motion-gated, so their off form is the FULL ramp, and a flat degraded draw is a
NOVEL, fainter presentation no player could previously select.

Nothing is hidden and nothing is lost. But whether a 4th-arriving muzzle flash is *catchable* under
exactly the load where it matters is a question about eyes, not about code, and it is why
`CLIENT_CONFIG.flashBudget.degradeAlphaFactor` ships **stamped as implementer draft awaiting Eric's
eye** — the same convention Story 4-7 used for its unratified timbres and Story 4-3 for its effect
geometry. The captures below include a close-up of a degraded `muzzle` and `spark` so the number can
be ruled on with the evidence in front of him.

---

## Part 3 — The staged scene

`client/src/stage/` — a pure seeded composer (`worstCaseScene.ts`) plus a wiring shell
(`worstCase.ts`). Every hull orbit, flash position, event schedule and roster row is a total
function of `(seed, tick)`, so two captures are comparable. **Nothing downstream of `bindRoom` is
mocked**: the shell builds a stub room and pumps synthetic frames through the real `buildGame()`,
so `attention.ts`, `flashBudget.ts`, the HUD, chrome bar, radar, effects, kill feed and XP rail all
run exactly as they ship. A scene that mocked the systems under test would prove nothing.

Staged simultaneously: 19 other hulls across truesight and the radar annulus · 5 torpedoes inbound ·
the storm in a pre-close beat with the next ring revealed and the own hull outside the live ring ·
the kill leader published with matching feed lines · own hull at 20% (crimson — Tier 1 active) · a
periodic denied press (the other Tier-1 channel) · a banked XP level still inside its 10 s breathing
window so the Tier-3 chip has a breath to freeze · a flash stack concentrated in one ~26u cluster.

**The flash stack asks ONE screen region for ~93× the ratified 3 onsets/s** (14 budgeted onsets per
50 ms tick = 280/s). It is deliberately sized *above* the arena's structural ceiling but only ~10×,
not 40× — an unreachable effect count would have made any cost number a lie in the pessimistic
direction.

Dev-only behind a double gate (`import.meta.env.DEV` **and** `?stage=worstcase`, behind a dynamic
import), so in production the query parameter is not merely ignored — the code that reads it is not
shipped. That is CHECKED, not asserted: `readabilityCapture.mjs --verify-bundle` greps the built
assets for four distinctive strings and confirms no extra chunk was emitted. It passes.

**Radar grammar: `return`** (Eric ruling, 2026-08-11 — *"I am going to be completely removing all
radar shit that existed before that. Its too good."*). The scene stubs its own welcome, so the
server's `HC_RADAR_GRAMMAR` never reaches it; the grammar is set in the composer and pinned by test.
The first capture attempt was taken under `silhouette` and was **discarded as evidence about the
wrong game.**

Two staging gaps, stated plainly: wire-disclosed `wk` wake segments for FAR hulls are not staged
(in-truesight wake is client-synthesized from contacts, the real shipped path, and does appear); and
`AFLOAT` reads 17 rather than 20 because it correctly excludes the 3 drones.

## Part 4 — Cost

Ratified budget (NFR1): **16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms**.

**Whole-frame FPS was NOT OBTAINED this cycle, and no verdict against the 16.6 ms budget is claimed
here.** The first attempt measured it in a headless browser and produced 17 frames in 6 seconds
(2.8 fps) beside a 1.1 ms frame time — two numbers that cannot both be true, because headless `rAF`
is throttled. Eric additionally notes the Vite dev build runs poorly on his machine, so a dev server
was never a valid basis for an NFR1 verdict at all (unminified modules, HMR, source maps — not what
a player runs). He ruled: **targeted benchmarks, no browser** — the shape cycles 68-72 used.

`client/src/__benchmarks__/attentionSeam.bench.ts`. Loads taken from the staged scene itself: 14
budgeted onsets per 50 ms tick into ONE region (~93× the ceiling) with all 12 region keys and 9
element keys live. Nothing was tuned toward anything; the benches assert nothing.

| Path | Load | mean | p99 |
|---|---|---|---|
| `claim` + `coalesce`, one staged tick | 14 onsets, 1 hot region, 21 keys live | **6.0 µs/tick** — 0.012% of a 50 ms tick | 8.2 µs |
| `regionKey` projection | 14 flashes | **0.51 µs** (~36 ns each) | 0.6 µs |
| one `claim` against a FULL key map (worst-case `withinWindow` prune) | every key at the ceiling | **0.27 µs** | 1.4 µs |
| tier resolution (both tiers + both holds + amber corollary) | one frame | **0.20 µs/frame** | 0.2 µs |
| DRAW: animated vs degraded | ~185 live marks redrawn/frame, 11 spawns/frame at 60 fps = 3× the staged rate | ANIMATED 0.345 / 0.402 ms · DEGRADED 0.333 / 0.363 ms | ~0.8 ms |

**Degrading is not more expensive than animating.** The two variants were run alternately, twice
each, precisely because a single ordering shows a spurious gap — across both runs each variant is
once fastest and once slowest. Expected: the paths differ only in one alpha expression and share the
same `clear/circle/fill`.

The arbitration this story added is therefore **~6 µs per tick against a 50 ms budget**. Whole-frame
cost on real hardware remains for Epic 7's reference-device pass, which replaces the throttle proxy
permanently.

## Part 5 — The squint test

**What the captures establish:** under a stack asking one region for ~93× the ratified flash budget,
with both Tier-1 channels active, both Tier-2 channels active and a Tier-3 chip banked — **every
channel is present, legible and un-deleted.** The chrome bar reads its full register
(`17 AFLOAT · 0 KILLS · T+02:57 · RING CLOSES IN 0:03 · ☠ VESSEL-07`) with the ring segment amber
inside its urgency window and the leader name in its own hue. The radar is unmistakably `return`
grammar. Nothing vanished.

**Degraded marks read as present-but-quiet, not invisible.** Census in the close-up: **105 live
marks — 97 degraded, 8 animated**, so both classes genuinely coexist in one frame. The amber rings
are 24 degraded `burst`s (α 0.3325); the pale rings are 48 degraded `splash`es (α 0.245 — the
faintest thing in frame and the closest to the "too quiet" edge, though its expansion geometry stays
traceable); the bright dots are muzzle and spark, degraded and animated intermixed.

**What the captures DO NOT establish, stated plainly: that threat channels "read first."** That
claim is TEMPORAL — the tier system's assertion is that Tier 1 keeps animating while Tier 2 and
Tier 3 hold at a keyframe — and a still image cannot show motion-versus-hold. In the frame, the
crimson low-HP rail is a ~6 px sliver at the right edge while the storm vignette floods the whole
frame and the near radar returns are the loudest thing on screen by area. Demonstrating "threat
reads first" rather than arguing it needs a video or a per-channel alpha trace. **This half of the
acceptance criterion is argued and unit-tested, not visually proven, and that is recorded here
rather than papered over.**

**Two observations for Eric that are NOT defects introduced by this story:**

1. **At 1.5× zoom the radar return cells overlap the top-center chrome bar** — `T+02:57` sits on a
   blue/green return blob. A real legibility collision between world paint and HUD chrome, created
   by the `return` grammar rather than by attention priority. Worth a ruling; out of 4-8's scope.
2. **Under this load ~92-99% of everything in the hot region is degraded**, so "degraded" *is* the
   worst case's appearance rather than an edge state. That is the right frame in which to rule on
   `degradeAlphaFactor` (0.35), which ships stamped as implementer draft.

### Verdict

**The guardrail holds on everything a still can prove, and the one thing it cannot prove is named
rather than claimed.** Information survives the worst case the game can produce: no channel is
deleted, no bearing is dropped, no mark becomes confusable with another. The arbitration costs ~6 µs
a tick. The temporal claim and the `degradeAlphaFactor` calibration both await Eric's eye on moving
pixels.
