# Epic 4 Context: Information Texture (GDD E6)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn fights at radar range into readable, trackable dramas instead of silent HP exchanges. Every trigger pull, every hurt hull, every honk should produce information for somebody: radar blips that carry class and heading so a paint becomes a deduction, splashes and hit calls and muzzle flashes that make gunnery a conversation across the fog, smoke that marks wounded prey, and a bounty that denies the kill leader the right to hide. (The third sensor tier — hull microphones hearing a torpedo run before you can see it — was DEFERRED by Eric ruling 2026-08-04; see amendment 1.) Every one of these is a new row in the signal registry with its own perception-invariant case — the epic adds texture without ever loosening the anti-cheat boundary. The epic's own guardrail is that information noise must never bury the hunt, and it is closed by a dedicated readability-gate story rather than assumed.

## Stories

- Story 4.1: The Listening Ring — **DEFERRED** (Eric ruling 2026-08-04, amendment 1; not cut, number not retired)
- Story 4.2: Class-Legible Blips
- Story 4.3: The Gunnery Conversation
- Story 4.4: Wounded Smoke
- Story 4.5: The Foghorn (binds the key with Eric)
- Story 4.6: The Bounty
- Story 4.7: The Real-Time Sound Map (design work with Eric)
- Story 4.8: Attention Priority & the Readability Gate

## Requirements & Constraints

- **The sensor suite is universal core kit.** Truesight bubble and rotating radar sweep ship on every hull as part of the base information layer — never equipment, never a boon, never class-differentiated. *(SUPERSEDED IN PART by amendment 1: the third tier, hull microphones, is deferred — the suite is two tiers for now. The core-kit law itself is unchanged and governs whatever sensor lands next, including active sonar.)*
- ~~**Listening events are bearing-only.**~~ *(MOOT while amendment 1 stands — no listening events exist. If the tier is ever revived: bearing plus sound class, nothing else — no position, no range, no field from which range can be reconstructed.)*
- **Radar paints ships only, and only what the sweep crossed.** Blips become class-legible (hull outline, speed, heading) but the paint rules do not change: one LOS rule everywhere, torpedoes never painted, nothing outside sight ∪ this-tick paints in any frame. Wire-shape change requires a protocol version bump.
- **The Bounty is the single sanctioned exception** to sweep-only radar paints: the kill leader periodically blooms at true position on everyone's radar and is worth extra XP through the existing economy pipeline. The exception must be declared explicitly in the registry and codified by its invariant case, not slipped in.
- **Enemy damage is diegetic only.** Wounded smoke conveys hurt, never a number; no enemy HP bars exist anywhere; own damage stays HUD-private.
- **Projectiles still materialize at the sight boundary** with current position and velocity only — the new gunnery effects must not reintroduce range-derivable fields.
- **Accessibility floor is non-negotiable.** Every audio cue has a visual twin and vice versa; dual-coding for threat and state meaning; photosensitivity restraint (80 ms one-shot pulses with a 300 ms same-source floor, breathing cycles ≥ 2 s, pulses capped at ~1.1 Hz, aggregate ≤ 3 flashes/s per screen region, no full-screen strobes). *(The ratified backstop for mono-audio players was the listening ring; under amendment 1 it does not exist, so every Epic 4 audio cue must carry a visual twin that stands on its own.)*
- **Performance.** All new effects must be costed against the per-epic frame budget on the reference device as they land (16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms), holding a fully populated match at 60 FPS on low-end hardware.
- **Numbers are design targets, not contracts.** Thresholds, cadences, and XP values cited in stories are tunable reference values.

## Technical Decisions

- **Every spatial signal is a declarative registry row** (`{ eventType, visible(), materialize(), counterIntel? }`) in the server's signal registry; the perception observer is its only caller, and invariant tests iterate the registry so no signal can exist without coverage. Epic 4 only adds rows — the registry itself already landed in Epic 1. Adding a row without its invariant case is the failure mode this design exists to prevent.
- ~~**The listening ring is a third perception tier computed inside the observer**~~ *(DEFERRED — amendment 1. Retained as the shape any future third tier, e.g. active sonar, must take: computed inside `observe()` alongside sight and radar, never a separate pipeline and never a client-side inference.)*
- **Counter-intel rows get wire-indistinguishability tests** on payload *and* timing. Any deception entity must be indistinguishable from a genuine ship, so new blip fields automatically flow to the decoy with no special-casing, and shooting a decoy must produce no Hit Call.
- **Perception-invariant extension is per-signal definition of done** — a new signal is not complete until its invariant test exists.
- **Listening-ring wire-vs-visual asymmetry: RESOLVED — no change.** *(MOOT while amendment 1 stands; the resolution remains correct if the tier is ever revived.)* The visual's source-ambiguity is an aesthetic choice, not a secrecy rule. Audio tones already legitimately reveal source type to hearing players, and the client needs the sound-class field to select the right tone, so the wire keeps carrying sound class. Do not re-litigate this by stripping the field.
- **Muzzle flash doubles as latency masking** for back-dated projectile spawn under the fire-time compensation scheme — the two features are deliberately coupled.
- **Layering.** *(Ring clauses moot under amendment 1.)* The fog-immune chart layer renders above the refit card layer; the refit row is placed so it never occludes own hull.
- **Rate limiting is a design requirement, not an afterthought** for the foghorn: honk spam must not be able to flood the ring or the audio mix.

## UX & Interaction Patterns

- ~~**Listening ring grammar**~~ *(DEFERRED — amendment 1. The ratified grammar is preserved in DESIGN.md/EXPERIENCE.md for a future revival: dashed 48-pip compass rose with cardinal ticks at ~half truesight radius, brightness ∝ loudness/closeness, pure intensity, encodes where and how loud but never what.)* Still binding for Epic 4 without the ring: **sight is the confirmation channel** — torpedoes and mines are confirmed visually only at truesight, and the sighting treatment (pale boundary rings plus wake) carries that moment alone now that no pip precedes it.
- **Blip rendering:** outline-only non-scaling stroke at true heading with an arrowhead heading vector, minimum sizes floor-clamped so class stays readable at blip scale, decay ghosts capped per contact, per-hue luminance floors so dark personal colors survive at blip scale. Blips fly personal colors by default with a phosphor-anonymous build flag retained for playtest swap; drones render a distinct greyscale chevron silhouette no player class wears.
- **Combat effect color discipline:** splash, muzzle, hit-bloom, sink ring, and wounded smoke each use their own token; never phosphor-adjacent greens (a phosphor-ish splash reads as a fake blip), and smoke is warmed and darkened off drone grey so it never reads as a drone cluster.
- **Foghorn:** an emote, deliberately loud, with no kill-feed line. **Its ratified display surface — an arc sweep along its bearing on every hull's listening ring — no longer exists under amendment 1**, so Story 4.5 must either grow its own bearing surface or defer alongside 4.1 (open question for Eric, alongside the still-unbound key).
- **Bounty presentation:** an expanding ring in the leader's personal color around their class blip, visually distinct from sweep paints by the expansion treatment, plus a feed announcement on activation and an audio twin.
- **Attention priority is a three-tier arbitration.** Threat channels always animate — the shipped set is the low-HP rail pulse and the live denied pulse (pip surges are moot under amendment 1, and 4.8 must not pin a channel that does not exist); match-state channels hold at their lit keyframe while a threat channel is active; economy channels freeze at their dim keyframe while any higher tier is active. Corollary: only the highest-tier active amber channel pulses, so amber keeps meaning "look here" at the climax. All motion respects the reduced/off motion setting tiers.
- **Reveal survivor set:** own-vitals die with the hull; the chrome bar and kill feed persist through the omniscient reveal. (The listening ring's death-with-the-hull rule is moot under amendment 1.)
- **Readability check:** a squint test on a staged worst-case fight (multiple contacts, torpedoes inbound, storm closing, bounty active) confirming threat channels read first — the documented gate every feature in this epic must pass.

## Cross-Story Dependencies

- **Epic 1 prerequisites:** the signal registry is the substrate for every story here (each feature = a row + invariant case), the three class silhouettes feed the class-legible blip, the decoy's wire-indistinguishability law constrains blip and Hit Call work, and the muzzle-flash masking closes out Epic 1's fire-time compensation.
- **Epic 2 prerequisite:** the bounty's extra XP rides the existing leveling/boon pipeline rather than a parallel path.
- **Epic 3 prerequisite:** the storm-vignette and final-10s ring pulse are the match-state tier that Story 4.8's arbitration must reconcile against the new threat channels.
- **Within the epic:** Story 4.8 is the closing gate — it can only run once every other Epic 4 channel exists, and it owns the generalized tier system that earlier stories' individual channels plug into. Story 4.7's sound map covers the new events introduced by 4.3, 4.5, and 4.6 (4.1's audible classes leave its scope under amendment 1), so its audio-to-visual twin table depends on those events being specified; conversely no audio event in those stories ships without its row in that table. **Amendment 1 severs the 4.1 → 4.5 link:** the foghorn's arc-sweep surface no longer exists, which is the one hard dependency the deferral breaks.
- **The torpedo-warning gap is now OPEN-ENDED, not an interregnum.** Amendment 1 means torpedoes have no long-range warning channel for the foreseeable future — truesight (330u, ~5.5s at 60 u/s) is the only warning. Playtest impressions that torpedo ambushes are over-rewarded should be read against that permanent condition, and against the fact that torpedoes are currently under-powered on damage/reload rather than over-powered on delivery.
- **Downstream:** the deferred submarine class had hydrophones as its designed counterplay; with the tier deferred, **active sonar** is the presumptive answer and should be confirmed whenever the submarine is reconsidered.

## Ratified Amendments (durable — survives recompiles)

Source of truth: `epic-4-context-amendments.md`. On any conflict between an amendment and
planning-artifact-derived content above, **the amendment WINS**. Summary of entries in force:

1. **Story 4.1 (The Listening Ring) is DEFERRED** — Eric ruling 2026-08-04. The hydrophone sensor
   tier is not built; the story is deferred, not cut, and its number is not retired. Rationale: the
   game already carries enough information channels, active sonar is planned and occupies adjacent
   design space, and the ring's value was shown to be contingent on a torpedo/mine rebalance that
   has not happened. Epic 4's sensor suite is TWO tiers (truesight + radar) for now.
2. **Torpedo speed is not a balance lever** — 60 u/s stands as realistic; lethality changes must come
   from damage, reload, or delivery.
3. **Weapon cooldowns are likely going UP** across most or all weapons — recorded as design
   direction, not a ratified change; no cycle implements it without an explicit numbers ruling.
4. **Downstream consequences flagged, not decided:** Story 4.5's foghorn loses its display surface
   (must grow its own or defer); 4.7's sound map narrows; 4.8 must not pin a listening-ring Tier-1
   channel; the submarine loses its designed counterplay; island shadows stay a total blind spot.
5. **Correction of record:** Battleship turn rate is 0.4 rad/s (90° in ~3.9s), so existing truesight
   warning is already sufficient TIME against torpedoes — the gap the ring addressed was ATTENTION.
6. **Doc drift ledgered, not fixed:** the tone catalog is 22, not the "13" in EXPERIENCE.md:137 and
   the 4.7 AC; the denied tone shipped (1.10) rather than being deferred; `CLAUDE.md` says
   PROTOCOL_VERSION 18 but it is 19.
7. **Story 4.2 rulings (amendments 7-14):** blips paint TRUE-SCALE hull silhouettes at true position
   and heading (the DESIGN.md px table, 11px floor-clamp and 3× ML notch are RETIRED); radar
   BEHAVIOR is realistic while the silhouette grammar is the retained conceit; three-paint
   persistence; ARPA speed vector on raw `speed`; the decoy is a radar reflector reporting frozen
   drop-time pose at speed 0; drones paint the legacy chevron at true size; the per-hue luminance
   floor is algorithmic, not a table; Variant P is a build-time define.
8. **Story 4.3 rulings (amendments 15-20)** — at every fork Eric took the SMALLEST new information
   channel that still satisfied the story: muzzle flash carries to `SIGHT * 1.5` (495u, derived,
   LOS-blocked) — NOT radar range and NOT map-wide; fall-of-shot splashes are SELF-PRIVATE own
   misses only and gun-family only (FR16's "own" wins over EXPERIENCE.md:181's unqualified line);
   the Hit Call is SHOOTER-ONLY and deliberately OVERRIDES the shipped "hit confirmation beyond
   sight would leak contact presence" rule for the owner-hit case, which is what keeps the decoy
   disambiguation oracle alive; Hit Call scope is ALL ordnance including mines (a Mine Layer learns
   remotely that a trap sprung); the flash is NEUTRAL — position only, never who fired and never
   which weapon (DESIGN.md:239 beats UX-DR7 for this signal); the flash fires for the gun family
   only, upholding the torpedo's shipped "quiet weapon" status.
