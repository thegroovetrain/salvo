# Investigation: fog occludes radar returns

## Hand-off Brief

1. **What happened.** Eric, standing in a fog bank, had an opponent in clear water and saw no radar return on them; more broadly fog "occludes radar" (Confirmed as a design ruling, not a defect: epic-9 amendment 163 makes a fog-hidden hull inside the sight radius dark to BOTH sensors, and the server's radar gate enforces it at `server/src/game/signals.ts:558`).
2. **Where the case stands.** Concluded. Two mechanisms, both Confirmed in code and both traceable to prior Eric rulings that his 2026-10-21 statement now contradicts: (a) the radar annulus's inner edge is the plain geometric sight radius, never the fog-shortened eye reach (amendment 163, the "dark to both" option Eric picked 2026-10-15); (b) the near-range dim mask is a pure distance ramp over the whole geometric sight bubble (amendment 181 / Story 4.11), blind to whether the eye actually sees the hull.
3. **What's needed next.** An Eric ruling superseding amendment 163 (radar inner edge = where the fogged eye ends on that bearing) and amendment 181 (dim per sighted contact, not per radius), then a tracked story — this touches the anti-cheat chokepoint, its invariant oracle, and the golden frames.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A (free-text report, `/gds-investigate`, Eric 2026-10-21)                |
| Date opened      | 2026-10-21                                                                 |
| Status           | Concluded                                                                  |
| System           | development @ d9f55834, 0.18.66, PV 90                                     |
| Evidence sources | source (client render, server signals/perception, shared constants), epic-9 context amendments, git log, Eric's playtest report |

## Problem Statement

Eric (verbatim): *"I'm noticing an issue with the fog, where if I am in it or in other circumstances, it will occlude radar returns. Vision and Radar are completely separate systems. The regular rolling fog does not interfere with radar returns in any capacity. Furthermore, the normal 'if its closer to the ship, mute the radar returns so I can still see stuff' directive should probably be superseded... if I can't see the actual ship visually then I want nice, strong radar returns. Otherwise, if I can see the ship we should mute the returns as per normal."*

Follow-up: *"The specific instance I noticed was that I was in the fog, my opponent was not in the fog, and I saw absolutely no radar information about their location."*

Treated as two hypotheses: H1 fog is reaching the radar path; H2 the near-range dim is hiding returns the eye cannot replace.

## Evidence Inventory

| Source   | Status    | Notes     |
| -------- | --------- | --------- |
| `client/src/render/stage.ts` layer order | Available | `fog` chart layer is BELOW `blip` (stage.ts:182-189, 240-241); fog cannot paint over radar. |
| `client/src/render/radarDim.ts`, `client/src/config.ts:3432-3475` | Available | The dim mask curve and its config. Pure distance ramp. |
| `server/src/game/signals.ts` | Available | `withinSight` (fog-tolled) vs `inRadarAnnulus` (geometric). |
| `shared/src/constants.ts:2294-2345` | Available | CONFIG.fog block; "NO RADAR TERM, EVER ... dark to BOTH sensors". |
| `_bmad-output/implementation-artifacts/epic-9-context-amendments.md` 149, 163, 164, 178, 179 | Available | The rulings. |
| Range to the opponent in Eric's instance | Missing | Decides which branch of H1 applies (see Missing Evidence). |
| Server-side replay / frame log of the instance | Missing | No match recording exists; cannot re-run the exact tick. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Does the fog field draw over the blip layer? | High | Done | No — fog is a chart layer under blip. |
| 2 | Does the server apply the fog toll to radar? | High | Done | No toll on radar; but the annulus inner edge is geometric sight, so fog-hidden in-bubble hulls get no sensor. |
| 3 | Is the dim mask fog-aware? | High | Done | No — distance only. |
| 4 | Which range was the opponent at in Eric's instance? | Medium | Blocked | Needs Eric's recollection or a repro on staging. |
| 5 | What the invariant oracle pins about the annulus (what a fix must re-cut) | Medium | Open | The server perception/invariant suites pin `inRadarAnnulus` as fog-blind (amendment 163: "pinned as such in the oracle"). |

## Timeline of Events

| Time        | Event               | Source                | Confidence |
| ----------- | ------------------- | --------------------- | ---------- |
| 2026-08-02 | Radar never paints inside truesight (in-bubble radar paint rejected; islands block every sensor). | memory `project_radar_los_ruling`, PR #77 | Confirmed |
| 2026-10-14 | Amendment 149: fog is sight-only, no radar term; "nothing is added to or removed from whatever the radar return would be". | epic-9 amendments:284 | Confirmed |
| 2026-10-15 | Amendment 163: radar's inner edge stays the geometric sight radius; a fog-hidden hull inside 500 u is dark to both. Rejected: annulus starting where the fogged eye ends. | epic-9 amendments:316 | Confirmed |
| 2026-10-15 | Amendment 164: sightCostPerU 2 — a sailor inside a bank sees ≈ 167 u. | epic-9 amendments:318 | Confirmed |
| 2026-10-16 | Amendment 178: Eric felt fog "isn't getting in the way"; probe showed the toll working; recorded "amendment 163's dark to both applies only inside the 500 u bubble, where radar never paints" and left a fog term on radar as Eric's to re-rule. | epic-9 amendments:350 | Confirmed |
| 2026-10-16 | Amendment 179: the own bank is free (League bush); fog past the rim removed. | epic-9 amendments:352, commit 685ba1ae | Confirmed |
| 2026-10-21 | Eric reports fog occluding radar; in-fog observer, clear-water opponent, no returns. | this case | Confirmed (report) |

## Confirmed Findings

### Finding 1: Fog cannot visually cover radar paint

**Evidence:** `client/src/render/stage.ts:182-189` (fog layer doc), `:240-241` (blip), `CHART_LAYER_ORDER` at `:304`.

**Detail:** The fog field is a chart layer seated above `litZone` and below the cloud, radar paints and hulls. Nothing the fog draws can hide a blip. The render half of H1 is Refuted.

### Finding 2: The radar annulus's inner edge is the plain geometric sight radius, not the fog-shortened eye

**Evidence:** `server/src/game/signals.ts:558-564` (`inRadarAnnulus`: `d2 > sight*sight && withinRadarRange`), `:325-335` (doc: "Radar's annulus boundary stays the plain geometric sightOf — a hull fog hides inside the bubble is dark to BOTH sensors (amendment 163)"), `blipGate` at `:598-604`.

**Detail:** The eye's sight test is `d + fogToll ≤ range` (`withinSight`, fog-tolled, `perception.ts:103-106`). The radar's inner bound is untolled. Between the fogged eye reach and 500 u there is a band where no sensor can deliver a hull: the eye is blinded by the toll, the radar is told "that's the eye's job".

### Finding 3: There is no fog term anywhere in the radar path beyond the sight radius

**Evidence:** `shared/src/constants.ts:2319-2323` ("NO RADAR TERM, EVER (149, 163)"); grep of `fogToll|fogDensityAt` across `server/src` hits only `perception.ts`, `drones.ts`, `world.ts`, `signals.ts` sight predicates; `blipGate` has annulus → sweep → height-raster shadow → dropout, no fog.

**Detail:** A hull at 500–1500 u paints through any fog. Eric's premise "the regular rolling fog does not interfere with radar returns" is TRUE of the code outside the bubble.

### Finding 4: The near-range dim mask is a pure distance ramp over the geometric bubble

**Evidence:** `client/src/render/radarDim.ts:62-70` (`dimScaleAt`: floor 0.2 inside `sightU`, linear to 1 at `1.5 × sightU`), `client/src/config.ts:3464-3475` (`innerFactor: 1`, `outerFactor = muzzleFlash / sight`), `client/src/render/radar.ts:329-347`, `:1011` (`updateDimMask` on own pose).

**Detail:** The mask reads own position and effective sight radius only. It has no knowledge of fog, island LOS, or whether a given hull is actually in `state.contacts`. Under Eric's new rule ("if I can't see the actual ship visually then I want strong returns") the mask quiets exactly the water where fog has taken the eye.

### Finding 5: Both behaviours were ruled by Eric and are tested as such

**Evidence:** amendment 163 (AskUserQuestion, recommended option picked; "pinned as such in the oracle"); amendment 181 / `radarDim.ts:1-35` (Eric: "radar is most effective outside of truesight range ... visible but less prominent in the near sight range"); amendment 178 explicitly records a fog term on radar as "Eric's to re-rule".

## Deduced Conclusions

### Deduction 1: Eric's instance is the Finding 2 band, if the opponent was inside 500 u

**Based on:** Findings 2, 3; amendments 164, 179.

**Reasoning:** Standing in solid fog, the own bank is free (179) — but the ray pays full toll the moment it leaves solid fog and crosses anything thinner (the bank's soft edge, or a second bank). From inside a mature bank, eye reach is ≈ 167 u (164), and the soft edge alone can eat a large share of the 500 u bubble. An opponent in clear water at, say, 200–500 u is therefore outside the fogged eye and inside the radar's dead inner disc. No contact, no blip: "absolutely no radar information".

**Conclusion:** The symptom is the design working as ruled on 2026-10-15, and the option Eric rejected then ("the radar annulus starting where the fogged eye ends on that bearing") is what he is asking for now.

### Deduction 2: If the opponent was beyond 500 u, fog was not the cause

**Based on:** Finding 3.

**Reasoning:** Beyond the sight radius the radar gate has no fog input. A missing return there is the sweep cadence (one revolution per 4 s), the Story 9.8 dropout roll (paint probability 0.9 at 10/12 falling to 0.1 at the rim), or a height-raster island shadow.

**Conclusion:** Only the range to the opponent separates Deduction 1 from Deduction 2; it is the one missing fact.

## Hypothesized Paths

### Hypothesis 1: Fog is reaching the radar path (Eric's premise)

**Status:** Refuted as stated, Confirmed in a narrower form.

**Theory:** The fog field adds or removes radar returns.

**Supporting indicators:** The playtest symptom.

**Would confirm:** A fog term in `blipGate` or the radar raster.

**Would refute:** None found; the annulus inner edge geometric.

**Resolution:** No fog term exists in the radar path (Finding 3). What exists is a hand-off gap: radar refuses the inside of the geometric bubble while fog shrinks the eye inside it (Finding 2). Fog "occludes" radar only by occluding the eye in water the radar was told not to cover.

### Hypothesis 2: The dim mask hides returns the eye cannot replace

**Status:** Confirmed.

**Theory:** The 20 % floor inside the bubble assumes the eye sees everything there.

**Supporting indicators:** Eric's second paragraph.

**Would confirm:** The mask is distance-only.

**Would refute:** A per-contact or fog-aware term in the mask.

**Resolution:** `dimScaleAt` is distance-only (Finding 4). With fog (or an island) blinding the eye inside the bubble, the assumption fails. Note the dim mask is today largely moot for hulls inside the bubble because the server paints none there (Finding 2); it becomes load-bearing the moment Hypothesis 1's fix lands and returns start arriving inside the bubble.

### Hypothesis 3: The missing return was sweep cadence / dropout / island shadow at radar range

**Status:** Open.

**Theory:** The opponent was beyond 500 u and the miss was ordinary radar behaviour.

**Supporting indicators:** None specific; it is the complement of Deduction 1.

**Would confirm:** Opponent was beyond 500 u in Eric's instance.

**Would refute:** Opponent was inside 500 u.

**Resolution:** Pending the range.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Range to the opponent in the reported instance | Picks Deduction 1 vs 2 | Eric's recollection, or a staging repro: sit in a bank, have a bot approach from clear water, watch the RANGE row / blip appearance against 500 u. |
| Whether Eric also wants fog to matter at 500–1500 u | Scope of the ruling | Direct question. His 2026-10-21 statement says no ("does not interfere in any capacity"), which matches the code. |

## Source Code Trace

| Element       | Detail                                      |
| ------------- | ------------------------------------------- |
| Error origin  | `server/src/game/signals.ts:558` `inRadarAnnulus` — inner edge `sightOf(me)` (geometric); secondary `client/src/render/radarDim.ts:62` `dimScaleAt` (distance-only). |
| Trigger       | Any hull whose ray from the observer pays enough fog toll to fail `withinSight` while `d ≤ sightOf(me)`. |
| Condition     | Observer in a bank looking out through its soft edge or a second bank; or observer in clear water looking into a bank, target 167–500 u. |
| Related files | `server/src/game/perception.ts:103-146` (fogToll thunk into the sight field), `server/src/game/world.ts` `fogTollAlong`, `shared/src/sim/fog.ts:273` `fogTollAlong`, `shared/src/constants.ts:2331` CONFIG.fog, `client/src/render/radar.ts:1011` `updateDimMask`, `client/src/render/textures.ts` `bakeDimMaskTexture`, the server invariant/perception oracles that pin the annulus as fog-blind. |

## Conclusion

**Confidence:** High.

Confirmed: fog never touches the radar path; the server's radar inner edge is the geometric sight radius (amendment 163), so a hull the fog toll hides inside 500 u is delivered by neither sensor; the client's near-range dim is a distance ramp that assumes the eye owns the bubble (amendment 181). Both are Eric's own rulings, and amendment 178 already flagged the first as his to re-rule. Eric's 2026-10-21 statement supersedes both in intent: radar should paint whatever the eye does not see, at full strength, and be quieted only where the eye does see.

Hypothesized: whether the specific instance was inside 500 u (the gap above) or a radar-range miss unrelated to fog.

## Recommended Next Steps

### Fix direction

Two mechanisms, two rulings needed from Eric before any code:

1. **Server — radar inner edge follows the fogged eye.** `inRadarAnnulus` becomes "not eye-sighted (fog-tolled `withinSight`) ∧ within radar range", per bearing. Supersedes amendment 163; it is that amendment's rejected option. Still subject to the sweep, the height-raster shadow (islands block every sensor, 2026-08-02 stands) and the dropout roll. Touches the anti-cheat chokepoint and its oracle (the annulus is pinned fog-blind), `wakeInnerBound` for the same reason, and the decoy paint (same gate). The wire shape need not change, but the oracle and golden frames will.
2. **Client — dim per sighted contact, not per radius.** Replace the radial mask floor with "quiet the return of a hull that is in `state.contacts` (eye-delivered)"; everything the eye does not deliver paints at full opacity wherever it is. Supersedes amendment 181's radial anchor. Simplest form: per-contact alpha on the paint cells a sighted hull covers; alternatively drop the mask entirely and let hull-above-blip layering (stage.ts:74-80) do the job. That choice is Eric's.

### Diagnostic

Reproduce on staging before building: sit in a bank with a bot approaching from clear water; note the range at which the blip first appears. Today it must be exactly the geometric 500 u (or never, if the bot enters your bank first). That single observation confirms Deduction 1 for his instance.

## Reproduction Plan

1. Staging, a private lobby with one bot, or a headless `server/scripts` smoke with `HC_DEV_OPTIONS=1` seeding a known fog cut.
2. Park the observer at a solid-fog cell (density ≥ ½); place the target in clear water at 300 u with a thin-edge band between.
3. Expected today: `perception.observe()` returns neither a contact nor a blip for the target (the perception oracle already encodes this as correct).
4. Expected after fix 1: a blip paints on the target's bearing each sweep (subject to dropout) at 300 u.

## Side Findings

- The dim ramp's 500–750 u band (floor rising to 1 at the flash rung) dims returns on water the eye NEVER sees. Under Eric's new rule that band is also wrong, not only the in-bubble floor. Confirmed: `radarDim.ts:67-69`.
- Amendment 178 recorded that bots keep shooting a stale plot after a hull enters fog (amendment 169). Unchanged by anything here, but it is the "them seeing me" half of the fog feel; Eric may want it on the same ruling pass.
- The 2026-08-02 island ruling (radar never paints an island-LOS-blocked hull inside the bubble) is the same hand-off gap for islands that amendment 163 is for fog. Fix 1 as framed above leaves islands as ruled (the height-raster shadow still gates); if Eric wants "if I can't see it, radar paints it" to cover islands too, that is a separate, explicit reversal.

## Follow-up: 2026-10-21

### New Evidence

Eric, on the hand-off diagnosis: the server-side inner edge was never the intended design. *"The server needs to return the entire sweep, the client is what decides how much alpha it gets at any given point based on proximity. That 'first clause' of the target being further than my sight radius is dead wrong."* He also confirmed the specific instance was him in fog, the opponent in clear water, no return at all — Deduction 1's band.

### Updated Conclusion

Root cause stands (Confirmed, High). The fix direction changed from "radar inner edge follows the fogged eye" to "no inner edge at all": the server returns the entire sweep, the client paints only the wire, and the near-range dim slides to the fogged eye per bearing. Built as quick-dev `spec-radar-full-sweep-fog-dim.md`, cycle 202, amendment 210. Status: Concluded.
