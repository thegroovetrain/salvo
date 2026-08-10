# Epic 4 Context: Information Texture (GDD E6)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn fights at radar range into readable, trackable dramas instead of silent HP exchanges. Every trigger pull, every hurt hull, every honk should produce information for somebody, and every sensor boundary should sit on one coherent physical model instead of a grab-bag of literals. Splashes, hit calls and muzzle flashes make gunnery a conversation across the fog; smoke marks wounded prey; a foghorn is a bearing you chose to give away; a held kill-leader throne denies the strongest captain the comfort of anonymity. The epic's back half turned the radar scope itself into a physical instrument: one range ladder anchors every sensor boundary to truesight, one reflectivity/falloff model replaces the colour lookup table, terrain casts real height-dependent shadows, and ships leave readable wakes. Every signal is a row in the server's signal registry with its own perception-invariant case — the epic adds texture without ever loosening the anti-cheat boundary. What remains is the epic's own conscience: the full real-time sound map (so audio is a real sensor and no captain is locked out by hearing) and the attention-priority arbitration that closes the guardrail — information noise must never bury the hunt.

## Stories

- Story 4.1: The Listening Ring — **DEFERRED** (Eric ruling 2026-08-04; not cut, number not retired)
- Story 4.2: Class-Legible Blips — done
- Story 4.3: The Gunnery Conversation — done
- Story 4.4: Wounded Smoke — done
- Story 4.5: The Foghorn — done
- Story 4.6: The Bounty (player-facing: KILL LEADER) — done
- Story 4.7: The Real-Time Sound Map (design work with Eric) — **remaining**
- Story 4.8: Attention Priority & the Readability Gate — **remaining, the epic's closing gate**
- Story 4.9: The Eighths Ladder — done
- Story 4.10: The Physical Return Model — done
- Story 4.11: Height-Aware Radar Shadows — done
- Story 4.12: Radar Wakes — done

## Requirements & Constraints

- **Audio is a sensor, not decoration.** Sound design here is game design and is done WITH Eric, never proposed unilaterally by an agent. Synthesized WebAudio tones only — zero sound files, ever, without Eric supplying or approving the asset — in the CIC register (pings, warbles, rumbles), growing toward *mood, not orchestration*.
- **The audio deliverable IS a two-column table.** The sound map must ship as an explicit audio-event ↔ visual-twin table, and **no audio event may ship without its row**. The existing cue set is the template and must be back-filled into the table, not exempted from it.
- **The twin-walk is the acceptance test**, run per event in both directions: cover the speakers and the visual still carries the event; cover that screen region and the tone still carries it. The floor is asymmetric by design — every audio cue needs a visual twin unconditionally; the reverse (visual → audio) is scoped to combat-critical events.
- **Every tone is mute-, mono- and volume-aware.** Settings are master volume, effects volume, a mono-audio toggle, and a master mute (key M), all live-applying and localStorage-persisted. Mono exists for unilateral hearing loss, which destroys the stereo bearing field — so any tone that carries direction stereophonically MUST have a visual channel that survives mono.
- **Attention priority is a three-tier arbitration** and the epic's guardrail made mechanical: Tier 1 threat channels always animate; Tier 2 match-state channels (final-10s ring pulse, in-storm vignette) hold at their **lit** keyframe while any Tier 1 is active; Tier 3 economy channels (bank-chip breathing, toasts, XP wrap) freeze at their **dim** keyframe while any higher tier is active. Corollary: only the highest-tier active amber channel pulses, so amber keeps meaning "look here" at the climax.
- **The photosensitivity budget is aggregate, not per-channel.** Breathing cycles ≥ 2 s; one-shot pulses 80 ms with a 300 ms same-source floor; pulses capped at ~1.1 Hz; **no element or screen region exceeds 3 flashes/s no matter how many individually-compliant events stack**; no full-screen strobes. The gate story must verify the aggregate, not re-verify each channel alone.
- **The motion setting removes MOTION, never INFORMATION.** full / reduced (also halves flash intensity) / off; it overrides every juice rule. A signal's presence, direction and weight must survive `motion: 'off'` intact — a channel that only exists as an animation is a bug at that setting.
- **Dual-coding floor for class, threat and state meaning** (shape, position, text, audio co-carry). Exactly one informed waiver exists: individual combatant *identity* is colour-first. Enemy damage stays diegetic — no enemy HP bars, ever; own damage is HUD-private.
- **The readability gate is a documented squint test** on a staged worst-case fight (multiple contacts, torpedoes inbound, storm closing, kill leader active): threat channels must read first. Every Epic 4 feature — including the radar-physics visuals — is checked against it.
- **Performance is measured, not assumed**, on the reference device at both zoom extremes. Per-epic frame budget: 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms, holding a fully populated match at 60 FPS on low-end hardware.
- **Numbers are design targets, not contracts** unless an amendment ratifies them.

## Technical Decisions

- **Every spatial signal is a declarative registry row** (`{ eventType, visible(), materialize(), counterIntel? }`); invariant tests iterate the registry so no signal can exist without coverage. Perception-invariant extension is per-signal definition of done; a declared exception additionally needs its own INDEPENDENTLY REIMPLEMENTED oracle that never imports or aliases the production predicate.
- **Audio and attention work is presentation, and presentation must not silently become a channel.** A tone may only consume what the client legitimately holds; if a cue would need a fact the wire does not carry, that is a wire/perception decision (its own registry row and invariant case), not a client inference. A cue that discloses an enemy's bearing or presence is a new sensor and needs a ruling, not a tone.
- **The wire may carry no finer resolution than the presentation actually consumes** — a quantised channel's bucket count is an anti-cheat parameter, not a rendering one. This binds any new audio tiering (volume bands, loudness buckets) exactly as it bound the foghorn.
- **One ruler for range:** every sensor boundary derives as an eighth of intel range, SIGHT-anchored (3/8 detect, 4/8 truesight, 5/8 muzzle-flash + wounded-smoke reach, 7/8 far-radar crossover, 8/8 radar). Any distance-scaled audio must be expressed on that ladder rather than a fresh literal, and scaled to the LISTENER's effective ranges so an intel build hears farther and a dazzle cannot also deafen.
- **Radar colour is intensity, never category**, produced by one reflectivity × geometry-falloff model with no range-threshold branch in the paint path; terrain occlusion lives in exactly one shared pure function called identically by server and client. Any new visual added by the gate story must not reintroduce a category-colour or a second occlusion implementation.
- **Land is sacred** — no stat, card or upgrade may touch the terrain/occlusion constants. Sensor upgrade card ideas (intel consolidation, Doppler, low-band/HF, active-sonar slot) remain a parking lot: recorded, not approved or scheduled.
- **Realism is the idea source and the tiebreaker on presentation, not a hard constraint** — reach for the physical answer first, take the fun one when the physical one is boring or unreadable.

## UX & Interaction Patterns

- **Attention tiers are an arbitration seam, not per-widget logic.** Existing consumers (storm vignette, chrome-bar ring pulse) already ease to a steady lit hold under an active Tier 1; that behaviour is the pattern to generalize rather than re-invent.
- **Tier-1 channel inventory must be taken from what actually ships.** The originally-written Tier 1 leaned on listening-ring pip surges; with the listening ring deferred, threat tier is carried by the denied pulse and the low-HP rail pulse. Do not pin a Tier-1 channel to an unbuilt sensor.
- **Mono-audio's declared visual backstop was the listening ring**, which does not exist — so the sound map must name a real backstop for every direction-bearing cue (the foghorn's screen-edge chevron is the shipped precedent) rather than inherit the deferred one.
- **A cue that needs a bearing surface builds its own private one** — the 4.5 chevron is the template, and its presence, direction and band weight are INFORMATION that survive `motion: 'off'`.
- **Kill leader presentation is copy-ruled and location-free**: a persistent `☠︎ <NAME>` register in the chrome bar (the bar's first per-player hue), a skull mark riding the leader's name wherever it appears in the kill feed as killer or victim, a claim register reading `☠︎ <NAME> IS THE NEW KILL LEADER`, a self-only "YOU ARE THE KILL LEADER" toast, and the `bounty` tone. The name carries a **static** faint glow — static deliberately, because an animated glow would be a new channel needing tier arbitration and a slice of the photosensitivity budget. There is **no radar bloom, ring, bearing, range or area disclosure of the leader**, and therefore no sanctioned exception to sweep-only radar paints.
- **Toasts are self-events only** and never carry enemy information; the kill feed is naval theater in text-safe personal hues, with drones greyscale.
- **Combat-effect colour discipline holds:** splash, muzzle, hit-bloom, sink ring and wounded smoke each use their own token, never phosphor-adjacent greens (a phosphor-ish splash is a fake blip); smoke is warmed/darkened off drone grey so it never reads as a drone cluster.
- **HUD chrome stays phosphor-functional**, corner anatomy never rearranges, and the UI-scale setting never renders mono type below 9 px.

## Cross-Story Dependencies

- **Epic 1 substrate:** the signal registry underpins every story (each feature = a row + its invariant case), and the decoy's wire-indistinguishability law constrains anything that could correlate to a hull.
- **4.8 is the epic's closing gate** and must arbitrate ALL channels landed by 4.2–4.12 plus the HUD's pre-existing animations — including the radar-physics visuals, which shipped without a generalized tier system to check against.
- **4.7 → 4.8 ordering matters in one direction only:** any tone 4.7 adds is a new attention/photosensitivity participant, so the sound map's inbox should be settled (or explicitly listed) before the gate story takes its aggregate measurement. A tone with a STATIC twin is entirely 4.7's; a tone whose twin ANIMATES creates a 4.8 obligation.
- **4.1's deferral narrows 4.7 and reshapes 4.8** — the sound map loses the listening-ring grammar as its organizing spine and the tier table loses its written Tier-1 exemplar; both must be restated against shipped channels rather than the planned sensor.
- **Settings coupling (Epic 2 surface):** mute / mono / master / effects volume and the motion tiers already exist as live, persisted settings; new audio and animation channels must honour them at their existing seam rather than adding parallel toggles.
- **Deferred, not cancelled:** hydrophones and active sonar remain the eventual answer to island blind spots; nothing in 4.7/4.8 may assume that tier before it is ruled. Eric's 2026-08-10 ruling parks the whole sonar family (passive AND active) until after public beta.

## Ratified Amendments (durable — survives recompiles)

Source of truth: `epic-4-context-amendments.md` (227 entries). On any conflict between an amendment
and planning-artifact-derived content above, **the amendment WINS**. Summary of entries in force:

1. **Story 4.1 (The Listening Ring) is DEFERRED** (amendment 1) — the hydrophone tier is not built;
   deferred, not cut. Active sonar occupies the adjacent design space. The suite is TWO tiers.
   **Extended 2026-08-10 by Eric ruling: the entire sonar family — passive AND active — is tabled
   until after public beta, on the reasoning that radar is already deep and sonar belongs bundled
   with a future submarine class.**
2. **Torpedo speed is not a balance lever** (2) — 60 u/s stands; lethality comes from damage,
   reload, or delivery. **Weapon cooldowns are likely going UP** (3) — design direction only, no
   cycle implements it without an explicit numbers ruling.
3. **Downstream consequences of the 4.1 deferral** (4-6): 4.5 grew its own bearing surface; **4.7's
   sound map narrows to the events 4.3/4.5/4.6 actually introduce and the listening-ring audio
   grammar LEAVES ITS SCOPE**; 4.8 must not pin a listening-ring Tier-1 channel; island shadows stay
   a blind spot until sonar. Battleship turn rate is 0.4 rad/s, so truesight warning is sufficient
   TIME against torpedoes — the gap was ATTENTION. Amendment 6 also ledgers the doc drift 4.7
   inherits: "the 13 existing tones" and "the deferred denied tone" are both FALSE (the catalog is
   far larger; `denied` shipped in Story 1.10), and both belong to the Eric-gated 7-5 doc batch.
4. **Story 4.2 rulings (7-14):** blips paint TRUE-SCALE hull silhouettes at true pose; three-paint
   persistence; ARPA speed vector on raw `speed`; the decoy is a radar reflector reporting frozen
   drop-time pose at speed 0; drones paint the legacy chevron at true size; the per-hue luminance
   floor is algorithmic. **All of this is CONDITIONALLY SUPERSEDED by amendment 62 — it survives
   only in `silhouette` mode.**
5. **Story 4.3 rulings (15-20):** muzzle flash carries to a DERIVED halo (LOS-blocked, neutral —
   position only, never who fired or which weapon), gun-family only; fall-of-shot splashes are
   SELF-PRIVATE and gun-family only; the Hit Call is SHOOTER-ONLY, deliberately overriding the
   shipped anti-leak rule for the owner-hit case (this is what keeps the decoy oracle alive), and
   covers ALL ordnance including mines.
6. **Cycle 44-48 balance rulings (21-28, 35-39):** the retuned armory (gun weaker, skillshots heavier
   and slower), the 2-deep mine rack as a BASE change, two catalog ladder steps shrunk to hold the
   one-hit-kill law, the ARPA vector halved, match pacing accepted as-is, storm kills correct as
   shipped, SUDDEN DEATH reaffirmed but explicitly PARKED. **Every shell that connects deals full
   damage.** Amendment 37 additionally rules the **one-frame-one-cue aggregation grammar** (one
   shake, one tone at the summed magnitude, resolved in a PRE-PASS so the sink cue never precedes
   the blow that earned it) and states the standing rule that **no new tunable is invented when an
   existing floor already expresses the idea**.
7. **The Public Register (29-34):** `sunk` is the 4th declared exception to the master perception
   invariant, gated by witnessed OR credited-to-you OR victim-is-a-combatant. Identity-only payload;
   location stays protected by a per-observer `seen` stamp. Drones are NOT combatants; the matching
   win-condition change is DEFERRED to Story 6-3. `n AFLOAT` counts CAPTAINS ONLY. Amendment 30
   ruled the full kill confirmation set — **feed line + kill tone + score credit** — rejecting the
   quieter no-tone variants.
8. **Story 4.4 rulings (40-50):** wounded smoke is the 5th declared exception — the first
   enemy-HP-derived AND first persistent fog-piercing signal. Two tiers at the HP rail's own bands,
   a tier ENUM on the wire, never a fraction. Reach REUSES `CONFIG.vision.muzzleFlash`. The plume is
   ATTACHED, NEUTRAL, islands BLOCK it, you see your own, every hull with hp smokes including
   drones. **Amendment 49: smoke gets NO audio twin — it is a continuous STATE, not an event, and
   Story 4.7's sound map OWNS any later decision to voice it.**
9. **Story 4.5 rulings (51-61): the foghorn SHIPS.** The 6th declared exception, and the first signal
   whose payload varies by observer in substance: a fogged listener gets bearing + volume tier only.
   **Islands MUFFLE by exactly one tier** — the first, partial dent in the LOS law. Surface is a
   screen-edge chevron (55 — the canonical worked example of a twin row, whose presence, direction
   and weight survive `motion: 'off'`); key is **F**; cooldown 1.5s. The wire carries a horn variant
   id, and **adding horn variants is Eric-gated content** (52). **Amendment 57 is the audio engine
   architecture of record**: oscillator-and-noise-only, `MAX_TONE_S` 150ms with `sink` the lone
   exemption, the horn gets its OWN play path rather than an exemption, `HornVoice` is a
   synth|sample discriminated union, and **no sound asset may be sourced unattended**. **Amendment
   56: the concurrency cap drops HORNS, never CHEVRONS — the visual twin survives a crowded room
   even when the audio cannot.** **Amendment 60: a DENIED HONK IS COMPLETELY SILENT** — the `denied`
   tone was removed at that one site because the horn has no surface to flash and an orphan cue
   fails the twin law; Eric chose deletion over inventing a visual. Revisit only if a horn surface
   ever exists.
10. **The radar realism reversal (62-75):** the 4.2 silhouette grammar is REVERSED on playtest
    evidence but KEPT — both grammars ship behind two independent SERVER-side flags. In `return`
    mode: one continuous aspect-projected `ext` scalar, the ARPA vector dies, drones are
    indistinguishable from captains, islands paint returns, class is LEARNABLE rather than stated.
    **Amendment 71: amber stays RESERVED and UNASSIGNED pending Eric's sound-representation
    decision — he is on record as "not sold on the listening ring concept entirely".**
11. **The heatmap corrections (76-90):** the return layer is a BITMAP HEATMAP, not polygons — colour
    is INTERNAL TEXTURE quantized to three colours with NO blends. **A PAINT IS A HISTORICAL RECORD**
    (83): everything about a paint is decided ONCE at creation and only alpha changes afterward. The
    sight exclusion is RETIRED (88): sighted ships are painted CLIENT-SIDE from their `Contact`.
12. **The buffer rulings (95-99):** the heatmap buffer is a SCRATCH SURFACE following the VIEWPORT,
    snapped to whole world cells. **Nothing viewport-derived may ever touch paint creation or
    retirement.** The adapter seam is the risk and must be tested AT THE ADAPTER.
13. **The radar physics arc design contract (100-120).** Realistic radar is the killer feature, **but
    realism is the IDEA SOURCE and the tiebreaker on presentation while FUN WINS ON MECHANICS**
    (115 supersedes 100). One universal antenna height (101); soft shadow edges (104); colour is
    intensity ALWAYS (105); one reflectivity × geometry-falloff model whose coefficient table is an
    explicit handwave (106); ships never shadow ships (107); fog and rain are their own epic-scale
    feature (108); **R and H are FIXED constants and LAND IS SACRED** (114, 116); the mast-height
    card is dead (116); sensor card ideas including an **active-sonar slot on `R` are a PARKING LOT,
    noted not designed** (112, 117 — and now parked behind public beta by the 2026-08-10 ruling).
14. **THE EIGHTHS LADDER (113, 118, 119, 121-125) — Story 4.9.** Intel range is the whole ruler;
    every sensor boundary is an eighth. Muzzle/smoke moved 6/8 → 5/8; mines/torpedoes gained a
    detect range at 3/8; SHELLS DO NOT MOVE. **Amendment 122: the foghorn rebased onto the ladder as
    eight volume regions of the LISTENER's intel range, retiring amendment 53's `max()` clamps so
    "dazzle cannot deafen" is true BY CONSTRUCTION**; the island muffle survives as a
    floor-then-muffle resolution. **Amendment 124: the foghorn wire is FLOORED AT BAND 4 because
    bands 1-4 render identically — establishing that the wire may carry no finer resolution than the
    presentation actually consumes.**
15. **The arc is FOUR EPIC-4 STORIES (120)** — 4.9 → 4.10 → 4.11 → 4.12. 4.6/4.7/4.8 were deferred
    behind the arc, not cancelled.
16. **The foghorn's two ledgered consequences are CLOSED, not open (126).** A visible enemy can sound
    quiet on an eyesight-heavy build (clamping would put dazzle back into the band resolver and
    dazzle would then deafen), and the honk's range resolution roughly doubled (amendment 51's
    letter is unchanged — bearing and volume only; what grew is the precision of the volume channel).
    Both ACCEPTED AS SHIPPED. Do not reopen them.
17. **Story 4.10 (127-137): the physical return model** — one formula, no range-threshold branch,
    the 7/8 crossover EMERGES from the curve; client-only. **Amendment 152: the server rasterizes
    the hull and `speed` is stripped from the wire**, which is why any later speed-scaled client
    effect must hang off something the client already holds. **Amendment 161: opacity carries age.**
18. **Story 4.11 (176-188): height-aware radar shadows** — ONE shared pure accumulator answers both
    sides; `H` is a fixed constant nothing may purchase; the server's radar gate is the one sensor
    that moves. **Two corrections of record: amendment 102's "closer to a low island = longer
    shadow" is BACKWARDS under its own formula (186), and the ordering is QUERY-then-FOLD (187).**
    **Amendment 181: radar returns display at reduced opacity inside 1/8 intel range, ramping to
    full at 5/8** — a display-time mask, which does not violate the historical-record rule.
19. **Cycle 69 (194-198): the slope paints to the peak.** Grey NO-DATA is DELETED and amendment 180
    is reversed by its own author — **the absence is its own legend**. Terrain takes a soft step at
    the ray; a ship takes the mast-height instance. **Removed end to end so no dead knob survives,
    with 11 tests RETIRED rather than adapted** — the standing precedent for deletion rulings.
20. **Story 4.12 (199-211): radar wakes** are SERVER-OWNED world state rasterized onto the lattice,
    carrying no identity, gated per segment. **Amendment 110 is REVERSED by its owner — torpedo
    wakes are IN.** **Amendment 203: camouflage is BY STRUCTURE, NOT STRENGTH** — Eric declined a
    clutter-strength bound; a wake hides because it is the same pixel at the same opacity and the
    eye must pick a coherent LINE out of dots. **Amendment 211: a channel that carries nothing must
    not cost wire.**
21. **Cycle 71 (213-214) and cycle 72 (215):** the wake clock cut 12s → 5.5s (an eighths-ladder rung,
    not a feel number — a physically honest wake is too much wake for this ocean), and recency
    became a CELL COUNT because as an intensity it measured three percent. **Amendment 215: the
    storm comes off the scope by PREFERENCE, not defect** — removed end to end in the cycle-69
    style; the on-water storm render is untouched.
22. **Story 4.6 (216-227): the Bounty is a HELD THRONE and the Bloom is DELETED.** **Amendment 216:
    no location disclosure of the kill leader of any kind ships, EVER — no radar paint, bloom, ring,
    bearing, range, or area, at any range, in any fog state.** This strikes FR17 and UX-DR19 and
    retires the DESIGN.md/EXPERIENCE.md rows built on them; identity was already free, position was
    the only new thing, so **no seventh perception exception was needed — the count holds at SIX**.
    Its recorded scope reduction: **4-7 loses the bloom's audio row and 4-8 loses it as a channel.**
    The throne moves only on a STRICT OVERTAKE over CAPTAIN-ONLY kills (217-218); sinking the holder
    pays +1 level (219). **Amendment 220 shipped a `bounty` cue in the bloom's place — a V-contoured
    two-tone klaxon firing ONLY for the new holder, twinned to the toast and the chrome-bar register
    with NOTHING on the water, deliberately.** **Amendment 223: player-facing copy is KILL LEADER;
    every internal name keeps `bounty`.** **Amendment 224 states the animated-channel law: any
    animated HUD channel answers to 4-8's tier arbitration and draws from the photosensitivity
    budget, so a STATIC twin costs neither** — this directly prices 4.7's twin choices. **Amendment
    222: the retired suffix grammar was deleted end to end with its tests RETIRED, not adapted.**
