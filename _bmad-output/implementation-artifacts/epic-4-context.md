# Epic 4 Context: Information Texture (GDD E6)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn fights at radar range into readable, trackable dramas instead of silent HP exchanges. Every trigger pull, every hurt hull, every honk should produce information for somebody, and every sensor boundary should sit on one coherent physical model instead of a grab-bag of literals. Radar blips carry class and heading so a paint becomes a deduction; splashes, hit calls and muzzle flashes make gunnery a conversation across the fog; smoke marks wounded prey; a bounty denies the kill leader the right to hide. The epic's back half turns the radar scope itself into a physical instrument: one range ladder anchors every sensor boundary to truesight, one reflectivity/falloff model replaces the color lookup table, terrain casts real height-dependent shadows, and ships leave readable wakes. Every signal is a new row in the server's signal registry with its own perception-invariant case — the epic adds texture and realism without ever loosening the anti-cheat boundary. The epic's own guardrail is that information noise must never bury the hunt, closed by a dedicated readability-gate story.

## Stories

- Story 4.1: The Listening Ring — **DEFERRED** (Eric ruling 2026-08-04; not cut, number not retired)
- Story 4.2: Class-Legible Blips
- Story 4.3: The Gunnery Conversation
- Story 4.4: Wounded Smoke
- Story 4.5: The Foghorn (binds the key with Eric)
- Story 4.6: The Bounty — deferred behind the radar physics arc (4.9-4.12), not cancelled
- Story 4.7: The Real-Time Sound Map (design work with Eric) — deferred behind the arc
- Story 4.8: Attention Priority & the Readability Gate — deferred behind the arc
- Story 4.9: The Eighths Ladder — the range model of record: every sensor boundary derives as an eighth of intel range
- Story 4.10: The Physical Return Model — radar color falls out of one reflectivity × geometric-falloff model, client-only
- Story 4.11: Height-Aware Radar Shadows — height-raster-driven, non-binary terrain occlusion, one shared pure function server+client
- Story 4.12: Radar Wakes — ships paint a weak surface-return wake carrying course and recency but no identity

## Requirements & Constraints

- **The sensor suite is universal core kit** — truesight bubble and rotating radar sweep ship on every hull, never equipment or class-differentiated. Currently two tiers (the third, hull microphones, is deferred).
- **Radar paints ships only, and only what the sweep crossed** — one LOS rule everywhere, torpedoes never painted, nothing outside sight ∪ this-tick paints in any frame. A wire-shape change requires a protocol version bump; a range-constant change requires an explicit assessment of whether a stale client would misrender (never assumed either way).
- **Enemy damage and identity stay diegetic** — smoke conveys hurt never a number, no enemy HP bars, radar returns carry no hue/class/identity for anyone (color is always intensity, never category — this governs the return model, shadow rendering, and wake painting alike).
- **Every sensor boundary now derives from one ruler.** Intel range (radar range) is the whole ruler; every other boundary is a fixed eighth of it, SIGHT-anchored the way `radar` and `muzzleFlash` already are: 7/8 = far-radar red→blue crossover (577.5u, new), 5/8 = muzzle flash + wounded smoke (412.5u, moved from 6/8), 4/8 = truesight (330u), 3/8 = mine/torpedo detect (247.5u, new — replaces the shared truesight gate; shells are unaffected and keep materializing at truesight). This is a real combat rebalance for torpedoes/mines, taken knowingly.
- **Realism is the idea source and the tiebreaker on presentation, not a hard constraint** — reach for the physical answer first, but take the fun one when the physical one is boring or unreadable; this supersedes an earlier "realism is default" framing.
- **Land is sacred** — no stat, card, or future upgrade may touch the hard-cover threshold `H` or the curvature constant `R`; both are fixed tuning constants chosen so the horizon lands on intel range, never derived per-map or per-seed from terrain distribution. A mast-height sensor card was explicitly rejected on this ground.
- **Sensor upgrade card ideas (intel-range consolidation, Doppler mode, low-band/HF, active-sonar slot) are parking-lot only** — recorded, not approved, costed, or scheduled inside the radar-physics-arc stories.
- **Accessibility floor is non-negotiable.** Every audio cue has a visual twin and vice versa; dual-coding for threat and state meaning; photosensitivity restraint (80 ms one-shot pulses with a 300 ms same-source floor, breathing cycles ≥ 2 s, pulses capped at ~1.1 Hz, aggregate ≤ 3 flashes/s per screen region, no full-screen strobes). The motion setting removes MOTION, never INFORMATION — a signal's presence, direction and weight must survive `motion: 'off'` intact.
- **Performance is measured, not assumed**, on the reference device at both zoom extremes for client work and via the swept-wedge/max-height-pyramid budget for the one server-cost story (shadows). The per-epic frame budget is 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms, holding a fully populated match at 60 FPS on low-end hardware.
- **Numbers are design targets, not contracts.** Thresholds, cadences, and XP values cited in stories are tunable reference values unless an amendment ratifies them.

## Technical Decisions

- **Every spatial signal is a declarative registry row** (`{ eventType, visible(), materialize(), counterIntel? }`) in the server's signal registry; invariant tests iterate the registry so no signal can exist without coverage. Wake (4.12), if server-owned, becomes a new such row.
- **Perception-invariant extension is per-signal definition of done** — a new or changed signal is not complete until its invariant case exists. A declared exception to the master invariant additionally needs its own INDEPENDENTLY REIMPLEMENTED oracle, never one that imports or aliases the production predicate. Beware the vacuous oracle: an upper-bound-only assertion cannot detect a channel getting SMALLER, which is exactly how the `mz`/`sm` oracle silently stopped being independent when Story 4.9 moved the halo.
- **Counter-intel rows get wire-indistinguishability tests on payload *and* timing.** Any deception entity must be indistinguishable from a genuine ship, so new blip fields automatically flow to the decoy with no special-casing, and shooting a decoy must produce no Hit Call.
- **The wire may carry no finer resolution than the presentation actually consumes** (Story 4.9, amendment 124). A quantised channel's bucket count is an anti-cheat parameter, not merely a rendering one: if two buckets render identically, shipping both is pure disclosure.
- **The eighths ladder is the single derivation style going forward** — every boundary is `SIGHT * (n/8)`, extending the existing `radar = SIGHT * 2` / `muzzleFlash` pattern; shared constraint tests pin both the values and the full ordering (`detect < sight < muzzleFlash < radar`).
- **The return model is one formula, not a lookup table**: intensity = per-material reflectivity coefficient × falloff chosen by target geometry (point/ship 1/d⁴, surface/coast/surf/wake/clutter 1/d³, volume/storm 1/d²). The coefficient table is an explicit unratified handwave. No range-threshold branch may appear in the paint path — thresholds like the 7/8 crossover must emerge from the curve, calibrated to hit that target, never hard-coded.
- **Terrain shadows use one shared pure function**, called identically by `server/src/game/signals.ts` and `client/src/render/radarHeatmap.ts`; a second implementation is treated as a desync or a leak. `shadowLength = (radarRange² / 4) · (1 − h₀/H) / d₀`, infinite when `h₀ ≥ H`; closer-to-a-low-island means a *longer* shadow (inverse of the discarded flat-earth intuition). The shadow is soft (waterline-up fade) and renders as explicit no-data, never as falsely-clear water. Ships never shadow ships — only terrain occludes, and that stays a designed, tested behavior. The identity `2RH = radarRange² / 4` is pinned as a build-failing assertion because `radarRange` drives gun/cannon/star-shell range.
- **Muzzle flash doubles as latency masking** for back-dated projectile spawn; wounded smoke deliberately reuses the same constant rather than forking a fourth vision number, so retuning the ladder's 5/8 band moves both together — verify the foghorn's volume-tier `max()` monotonicity whenever this constant changes.
- **The radar-physics arc is sequenced and each cycle is independently landable**: 4.9 (range model) → 4.10 (return model, client-only, no wire/server/PROTOCOL_VERSION change) → 4.11 (shadows, the one story with real server cost) → 4.12 (wakes, forked on whether wake is client-synthesized or server-owned state — the fork must be resolved explicitly with its perception consequences recorded, not defaulted).
- **Torpedo wakes stay out of scope** for 4.12 — `CONFIG.torpedo`'s "never painted by radar" is a separate balance ruling Eric owns, not a byproduct of ship-wake work.

## UX & Interaction Patterns

- **Blip rendering:** outline-only non-scaling stroke at true heading with a heading arrowhead; personal colors by default with a phosphor-anonymous build flag retained; drones render a distinct greyscale chevron.
- **Combat effect color discipline:** splash, muzzle, hit-bloom, sink ring, and wounded smoke each use their own token, never phosphor-adjacent greens; smoke is warmed/darkened off drone grey.
- **Radar readout is a pure intensity display** — brighter/stronger means a physically stronger return (bigger, closer, more reflective, or taller relative to the shadow threshold), never a category label; this now governs coastline, surf, sea clutter, storm walls, shadows, and wakes identically, alongside the existing ship-blip grammar.
- **Attention priority is a three-tier arbitration** (threat channels always animate; match-state channels hold at their lit keyframe; economy channels freeze dim) — still the closing gate for the epic, not yet built; new radar-physics visuals must be considered against it when 4.8 eventually lands.
- **Readability check:** a squint test on a staged worst-case fight is the documented gate every Epic 4 feature must pass, including the new radar-physics visuals.

## Cross-Story Dependencies

- **Epic 1 prerequisites:** the signal registry is the substrate for every story (each feature = a row + invariant case); the decoy's wire-indistinguishability law constrains blip and Hit Call work.
- **Within the epic:** 4.6/4.7/4.8 are deferred behind the radar-physics arc (4.9-4.12) but not cancelled — 4.8 remains the eventual closing gate that owns the generalized attention-tier system. 4.9 is the prerequisite range model for 4.10-4.12: 4.10's calibration target (the 7/8 crossover) and 4.11's shadow/detect ranges are both defined in terms of 4.9's ladder. 4.10 must land before 4.11 because a soft shadow edge is expressed in the intensity model 4.10 defines.
- **cycle-59 dependency:** 4.10 and 4.11 both consume the height raster and max-height pyramid built (but unused) by the fractal-terrain generation work — 4.11 is its first real consumer.
- **The torpedo/mine detect-range buff (4.9)** compounds with the standing design direction that weapon cooldowns are likely rising — do not read post-4.9 playtest torpedo/mine feel in isolation from that pending rebalance.

## Ratified Amendments (durable — survives recompiles)

Source of truth: `epic-4-context-amendments.md` (120 entries). On any conflict between an amendment
and planning-artifact-derived content above, **the amendment WINS**. Summary of entries in force:

1. **Story 4.1 (The Listening Ring) is DEFERRED** (amendment 1) — the hydrophone tier is not built;
   deferred, not cut. Active sonar occupies the adjacent design space. The suite is TWO tiers.
2. **Torpedo speed is not a balance lever** (2) — 60 u/s stands; lethality comes from damage,
   reload, or delivery. **Weapon cooldowns are likely going UP** (3) — design direction only, no
   cycle implements it without an explicit numbers ruling.
3. **Downstream consequences of the 4.1 deferral** (4-6): 4.5 grew its own bearing surface; 4.7's
   sound map narrows; 4.8 must not pin a listening-ring Tier-1 channel; island shadows stay a blind
   spot until active sonar. Battleship turn rate is 0.4 rad/s, so truesight warning is sufficient
   TIME against torpedoes — the gap was ATTENTION.
4. **Story 4.2 rulings (7-14):** blips paint TRUE-SCALE hull silhouettes at true pose (the DESIGN.md
   px table, 11px floor-clamp and 3× ML notch RETIRED); three-paint persistence; ARPA speed vector on
   raw `speed`; the decoy is a radar reflector reporting frozen drop-time pose at speed 0; drones
   paint the legacy chevron at true size; the per-hue luminance floor is algorithmic. **All of this
   is CONDITIONALLY SUPERSEDED by amendment 62 — it survives only in `silhouette` mode.**
5. **Story 4.3 rulings (15-20):** muzzle flash carries to a DERIVED halo (LOS-blocked, neutral —
   position only, never who fired or which weapon), gun-family only; fall-of-shot splashes are
   SELF-PRIVATE and gun-family only; the Hit Call is SHOOTER-ONLY, deliberately overriding the
   shipped anti-leak rule for the owner-hit case (this is what keeps the decoy oracle alive), and
   covers ALL ordnance including mines.
6. **Cycle 44-48 balance rulings (21-28, 35-39):** the retuned armory (gun weaker, skillshots heavier
   and slower), the 2-deep mine rack as a BASE change, two catalog ladder steps shrunk to hold the
   one-hit-kill law, the ARPA vector halved in all three knobs, match pacing accepted as-is, storm
   kills correct as shipped, SUDDEN DEATH reaffirmed but explicitly PARKED. **Every shell that
   connects deals full damage** — the same-click salvo single-hit rule is deleted and the
   one-hit-kill law governs a single SHELL, not a single click.
7. **The Public Register (29-34):** `sunk` is the 4th declared exception to the master perception
   invariant, gated by witnessed OR credited-to-you OR victim-is-a-combatant. Identity-only payload;
   location stays protected by a per-observer `seen` stamp. Drones are NOT combatants; the matching
   win-condition change is DEFERRED to Story 6-3. `n AFLOAT` counts CAPTAINS ONLY.
8. **Story 4.4 rulings (40-50):** wounded smoke is the 5th declared exception — the first
   enemy-HP-derived AND first persistent fog-piercing signal. Two tiers at the HP rail's own bands
   (<50% light, <25% heavy), a tier ENUM on the wire, never a fraction. Reach REUSES
   `CONFIG.vision.muzzleFlash` rather than adding a fourth vision constant. The plume is ATTACHED
   (never a trail), NEUTRAL (no id/hue/class — so no correlation handle exists), islands BLOCK it,
   you see your own, every hull with hp smokes including drones.
9. **Story 4.5 rulings (51-61): the foghorn SHIPS.** The 6th declared exception, and the first signal
   whose payload varies by observer in substance: a fogged listener gets **bearing + volume tier
   only**. Tiers scale with the LISTENER's effective ranges (`sightOf` / `max(1.5×sight,
   muzzleFlash)` / `radarRange`, clamped monotone so dazzle cannot also deafen). **Islands MUFFLE by
   exactly one tier** — the first, partial dent in the LOS law. Surface is a screen-edge chevron; key
   is **F**; cooldown 1.5s with a **completely silent** denial. The wire carries a **horn variant
   id** (a knowing break with the neutral-signal rule, justified because an emote is information a
   captain SPENDS); adding horn variants is Eric-gated content.
10. **The radar realism reversal (62-75):** the 4.2 silhouette grammar is REVERSED on playtest
    evidence but KEPT — **both grammars ship behind two independent SERVER-side flags**
    (`HC_RADAR_GRAMMAR` silhouette|return, `HC_RADAR_IDENTITY` roster|pseudonym). In `return` mode:
    one continuous aspect-projected `ext` scalar (never a class bucket), the ARPA vector dies, drones
    are indistinguishable from captains, islands paint returns, and class is LEARNABLE rather than
    stated. Three questions left explicitly OPEN: Bounty Bloom, colorblind assist under `return`
    mode, sonar hue (amber stays RESERVED and UNASSIGNED).
11. **The heatmap corrections (76-90):** the return layer is a **BITMAP HEATMAP, not polygons** —
    color is INTERNAL TEXTURE quantized to exactly three colors with NO blends, never an object
    label; an island paints as one massive contiguous return. **A PAINT IS A HISTORICAL RECORD**
    (83): everything about a paint is decided ONCE at creation from the observer's state at that
    moment, and only alpha changes afterward — nothing may be re-evaluated against live state. The
    sight exclusion introduced in cycle 54 is RETIRED (88): radar paints everything within radar
    range, and sighted ships are painted CLIENT-SIDE from their `Contact` with no wire change.
12. **The buffer rulings (95-99):** the heatmap buffer is a SCRATCH SURFACE that follows the
    VIEWPORT, snapped to whole world cells so the lattice stays world-locked. **Nothing
    viewport-derived may ever touch paint creation or retirement.** The adapter seam is the risk and
    must be tested AT THE ADAPTER, at both zoom extremes and while the camera moves — a green
    pure-module suite does not discharge it.
13. **The radar physics arc design contract (100-120)** — the governing document for stories
    4.9-4.12. Realistic radar is the killer feature (100), **but realism is the IDEA SOURCE and the
    tiebreaker on presentation while FUN WINS ON MECHANICS (115 supersedes 100's default clause).**
    One universal antenna height (101); the shadow formula with its INVERSE relationship — closer to
    a low island means a LONGER shadow, and the opposite direction is a bug (102); soft shadow edges
    (104); colour is intensity ALWAYS, never category (105); one reflectivity × geometry-falloff
    model whose coefficient table is an explicit handwave (106); ships never shadow ships (107); fog
    and rain defeat different sensors and are their own epic-scale feature (108); the wake fork and
    torpedo wakes tabled (109-110); **R and H are FIXED constants — the per-seed percentile is
    REJECTED and LAND IS SACRED, nothing buys its way past terrain (114, 116)**; the mast-height card
    is dead (116); sensor card ideas are a PARKING LOT, noted not designed (112, 117).
14. **THE EIGHTHS LADDER (113, 118, 119) — Story 4.9's own contract.** Intel range is the whole
    ruler and radar range is its full extent (8/8); every sensor boundary is an eighth, and every
    eighth lands on a clean `SIGHT` multiple so the ladder ADDS no new derivation style. Two ruled
    changes to shipped constants: **muzzle/smoke moves 6/8 → 5/8** (`SIGHT * 1.5` → `SIGHT * 1.25`,
    495u → 412.5u), which drags WOUNDED SMOKE REACH with it deliberately because amendment 42 reuses
    that one constant; and **mines/torpedoes get a detect range at 3/8** (`SIGHT * 0.75`, 247.5u),
    replacing the truesight gate they share today — a real combat BUFF taken knowingly. **SHELLS DO
    NOT MOVE.** The foghorn's volume tiers derive from `max(1.5 × sight, muzzleFlash)` and must be
    re-examined for monotonicity at the new value. The 7/8 band (577.5u) is the red→blue crossover
    and is **Story 4.10's CALIBRATION TARGET, not a threshold branch** — writing `if (d > 577.5)`
    anywhere in the paint path violates amendment 105 and is the wrong implementation. A per-weapon
    `detectRange` stat is explicitly parked, not pre-built.
15. **The arc is FOUR EPIC-4 STORIES, not an interstitial cycle (120)** — 4.9 → 4.10 → 4.11 → 4.12,
    superseding amendment 111's cycle framing as to vehicle only; the content split and sequencing
    rationale are unchanged. 4.6/4.7/4.8 are deferred behind the arc, not cancelled.
