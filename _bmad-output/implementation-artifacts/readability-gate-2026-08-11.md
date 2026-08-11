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

*(Filled at capture. The scene is deterministic and seeded so two runs are comparable.)*

## Part 4 — Measured frame cost

Ratified budget (NFR1): **16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms**, on the
reference device (Chrome at 4× CPU throttle until a real low-end Chromebook is benched — Epic 7
replaces the proxy permanently).

*(Filled at capture, at both zoom extremes. Numbers are reported, never tuned toward.)*

## Part 5 — The squint test

*(Filled at capture: does the threat channel read first?)*
