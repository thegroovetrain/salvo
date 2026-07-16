# Accessibility Review — Hullcracker.io UX Spines

Adversarial audit of DESIGN.md + EXPERIENCE.md (run `ux-Hullcracker.io-2026-07-16`) against the seven committed accessibility items and standard game-accessibility practice (Game Accessibility Guidelines; WCAG 2.2 where DOM applies). Contrast ratios computed per WCAG relative-luminance formula against `void #050807` / `panel #0A0F0D`. Reviewer: adversarial accessibility lens, 2026-07-16.

## Overall Verdict

The accessibility floor is sincerely adopted and unusually well quantified in one place — photosensitivity restraint has real numbers (≥2s breathing, 80ms one-shots ≥300ms apart, 1.1Hz vignette cap), and the chamfer/silhouette/text dual-coding machinery is genuine design work, not lip service. But two of the seven commitments (colorblind assist, audio-visual redundancy) are promissory notes resting on explicitly undesigned work (CVD palette "to come", sound map Open Question #8), and the flagship Regatta/Variant C identity system — the run's biggest new idea — violates the dual-coding floor as written: combatant identity and cross-fog tracking ride on hue alone at blip scale. Fixable before beta, but several load-bearing places currently ship accessibility as intent rather than spec.

**Verdict: CONDITIONAL PASS — floor accepted in principle, not yet met in spec.** 1 critical, 7 high, 14 medium, 8 low findings.

---

## 1. Commitment Coverage — do the seven commitments have spec, or just mention?

| # | Commitment | Status | Finding |
|---|---|---|---|
| F1 | Dual-coding floor | **Specced with gaps** | Principle stated twice (EXPERIENCE · Accessibility Floor; DESIGN · Do's and Don'ts) with real mechanisms (chamfer, silhouettes, pip geometry, text). Gaps are concrete and cited in §2 — the worst is combatant identity (2.1). |
| F2 | Audio-visual redundancy | **Mentioned, unverifiable** | See 1.2 / §3. The commitment references a sound map that does not exist. |
| F3 | Photosensitivity restraint | **Best-specced of the seven** | Actual frequencies and durations stated. Remaining holes in §5 (uncapped HP pulse, no aggregate budget). |
| O1 | Motion/shake controls | **Mentioned, scope vague** | See 1.3. |
| O2 | Key remapping | **Headline spec only** | "Every binding, conflict-detected, reset-to-default" is a good headline; coverage holes in 1.4/§6. |
| O3 | UI scale 90/100/125% | **Specced, scope ambiguous** | "Multiplies the whole HUD ramp; corner anatomy never rearranges" (DESIGN · Typography; EXPERIENCE · Responsive). Holes in 1.5/§7. |
| O4 | Colorblind assist | **Mention only — weakest commitment** | See 1.1. |

### Findings

**1.1 — HIGH — Colorblind assist is committed but wholly undesigned.**
*Location:* EXPERIENCE · Accessibility Floor item 4 ("exact palette: open design work"); DESIGN · Regatta Hoist ("CVD-optimized palette swap **and/or** boosted blip outlines — exact swap palette is design work to come").
Even the mechanism is undecided ("and/or"). No settings entry, no default, no scope (does assist recolor hulls, blips, kill feed, HP thresholds, or all four?), no acceptance criterion. For a public beta whose default tactical mode (Variant C) makes hue the tracking channel, this is the single most load-bearing option of the four — and it is the only one with zero design. The `.working/ship-color-system-1.html` CVD notes prove the team knows exactly which hues collapse (Lemon/Chartreuse/Lime/Spring → one dirty yellow; Rose/Periwinkle → grey-blues under deutan/protan) — that analysis never made it into the spine as requirements.
*Fix:* Add to the spine now: (a) assist mode scope = blips + kill-feed names + hull outlines minimum; (b) mechanism = boosted blip outlines **and** a reduced-count high-separation palette (20 CVD-distinct hues in ~250° of wheel is not achievable — commit to identity glyphs or numbered pennants as the fallback channel, see 2.1); (c) settings default off, persisted; (d) acceptance test: all pairs distinguishable under simulated deuteranopia at blip scale. **Needs developer call** on mechanism.

**1.2 — HIGH — Audio-visual redundancy floor is unverifiable: the sound map does not exist.**
*Location:* EXPERIENCE · Accessibility Floor item 2 vs Open Questions #8 ("RT sound design … not yet designed"); Game Feel & Juice ("audio sting pending", denied tone "(future)").
The floor promises "every audio cue has a visual twin," but the RT audio grammar (listening-ring timbres, low-HP sting, hit/miss/sunk set) is explicitly undesigned. A commitment whose object doesn't exist can't be audited and won't be honored by accident.
*Fix:* Add a binding rule to the spine: the sound-map work item (Open Q #8) MUST deliver a two-column event table (audio event ↔ visual twin) and no audio event ships without its row. Walk of the 13 existing tones in §3 shows the current set passes — lock that in as the template.

**1.3 — MEDIUM — Motion/shake option scope is vague.**
*Location:* EXPERIENCE · Accessibility Floor option 1 ("reduce/disable screen shake and motion effects; overrides every juice rule below") + Game Feel & Juice footer.
"Motion effects" is unenumerated. Does it cover: directional shake (yes, named), death-reveal camera zoom, storm vignette pulse, breathing glows, phosphor sweep rotation, conic cooldown animation, hull flash? Is it a toggle or reduce/off tiers? No default stated.
*Fix:* Enumerate in the spine: shake (off/reduced/full), camera moves (reveal zoom exempted or not — **needs developer call**, it's the climax beat), pulses/flashes (ties to 5.2). State default = full, persisted.

**1.4 — MEDIUM — Remapping spec doesn't cover the hard cases.**
*Location:* EXPERIENCE · Interaction Primitives ("All bindings remappable") + Accessibility Floor option 2.
Silent on: mouse-button rebinding (left-click fire is a binding); remapping the CTRL **hold** modifier and whether CTRL+1..4 chords re-derive from it; chord-vs-single conflict detection (remapping fire to `1` collides with refit picks only while CTRL held — is that a conflict?); one-handed preset layouts. "Every binding" should be made literally true.
*Fix:* Add: mouse buttons remappable; modifier remappable with chords following it; conflict detection accounts for chord contexts; ship at least one left-hand-only preset. (Overlaps 6.2.)

**1.5 — MEDIUM — UI-scale scope ambiguity: Pixi HUD vs DOM.**
*Location:* DESIGN · Typography ("the UI-scale setting multiplies the whole HUD ramp"); EXPERIENCE · Responsive.
Kill feed, toasts, refit cards, and the settings overlay are DOM, but the kill feed and refit window are functionally HUD (EXPERIENCE · HUD anatomy includes them). Does 125% scale them? If not, a low-vision player scales the hotbar but not the kill feed they need to read at 14px. No default stated (assume 100%).
*Fix:* State explicitly: UI scale applies to Pixi HUD + DOM feed/toasts/refit cards; port chrome (home/results/settings) follows browser zoom instead. Default 100%, persisted.

**1.6 — MEDIUM — Settings surface has no per-setting spec.**
*Location:* EXPERIENCE · IA "Settings overlay: Accessibility + audio + bindings"; decision log 2026-07-16 (settings surface resolved).
The surface exists (gear + non-pausing ESC), but no setting list, no defaults, no persistence model (localStorage per-browser? follows the `hullcracker.name`/`hullcracker.class` precedent?). The four committed options plus mute plus (missing) volume need an enumerated settings table or the settings screen becomes ad-hoc at implementation — exactly how the current client's incoherences happened (extract-current-ui §6).
*Fix:* Add a settings table to EXPERIENCE (setting · values · default · persistence · surface).

---

## 2. Dual-Coding Walk — every meaning-carrying color, and its non-color channel

| Signal | Color | Non-color channel in spec | Verdict |
|---|---|---|---|
| Selected slot | amber | glow strength + inset wash (luminance only) | **2.2** |
| Ready weapon/ability | phosphor | chamfer distinguishes ability vs weapon ✓; outline present vs absent for ready vs cooling ✓ | pass |
| Cooling | dim + phosphor ring | icon dim + conic fill geometry + mono seconds text | pass (model) |
| HP thresholds | phosphor→amber→crimson | accelerating pulse + `HULL 72/100` numeric header | pass (but see 5.1) |
| Storm | purple | "IN STORM" text line + vignette pulse + BR-chrome countdown text ✓; on-water edge **undecided** | **2.5**, **2.6** |
| Denied | red | 1px→2px width pulse + motion + icon flash, "never silence" | pass |
| Personal colors (identity) | 20 Regatta hues | silhouette codes **class** not identity; names only in kill feed | **2.1 CRITICAL** |
| Drone greyscale | grey vs hue | "DRONE-nn" text in feed only; nothing on-water/blip | **2.3** |
| Kill-feed tinting | personal colors | the text itself + word order ("SUNK BY") is the channel | pass (contrast in §4) |
| Blip fresh/faded | `#66FFAA`→`#0A3D20` | luminance ramp (CVD-safe) but nothing else encodes age | **2.4** |
| Telegraph ordered vs actual | phosphor vs amber | "marker" vs "needle" implies distinct glyphs — not stated as a rule | **2.7** |
| XP vs HP rail | both phosphor-family | mirrored position (left vs right of screen) + labels | pass |
| Victory/defeat banner | phosphor vs amber | banner text ("VICTORY" / placement) | pass |

### Findings

**2.1 — CRITICAL — Combatant identity is color-alone at blip scale; the dual-coding floor is violated by the run's flagship system.**
*Location:* DESIGN · Regatta Hoist ("radar blips + kill-feed names (Variant C, the preferred default)"); EXPERIENCE · HUD & Diegetic UI · Sensor presentation ("colored blips make contacts trackable across fog gaps; the grudge/bounty deduction game is embraced").
The blip outline carries **class** (Torpedo Boat vs Battleship), not **identity** (which of 20 players). Under Variant C — the default — "who is that" and "is that the same hunter as before" ride entirely on hue. Journey B beat 3 ("Variant C colors mean she *knows* it's the same hunter") is explicitly a color-alone read. For the ~8% of the male-heavy 10-15 audience with CVD, the tracking feature the spec "embraces" degrades to guesswork, and the palette sheet's own notes (`.working/ship-color-system-1.html`, Regatta CVD note) list four-plus hue collapses. Names appear only in the kill feed — after someone dies, not while tracking. This is precisely what the floor's own words prohibit: "no signal rides color alone."
*Fix (needs developer call — pick one or more):* (a) nameplate/callsign text on truesight hulls for all combatants, not just own ship (identity via text at sight range); (b) in colorblind-assist mode, blips gain a 1–2 char identity glyph or numbered pennant; (c) accept Variant P (phosphor-anonymous) as the assist-mode default, i.e. CVD players opt out of the grudge game — this is the cheapest honest option but should be a stated decision, not an accident. Whatever the call, the spine must stop claiming the floor is met while Variant C is default.

**2.2 — MEDIUM — Selected (amber) vs ready (phosphor) slot state is hue + glow only.**
*Location:* DESIGN · Components · Hotbar Slot; EXPERIENCE · State Patterns table.
The "key + name flip amber" is still color. Amber `#FFB800` and phosphor `#00FF88` both collapse toward yellow under deuteranopia, and their luminances are close (0.56 vs 0.73). The inset wash (fill vs transparent) is a genuine non-color cue but is never named as load-bearing.
*Fix:* One line in DESIGN: "the inset wash + a filled key chip (or corner brackets) are the selected-state channel; hue is secondary." Cheap, closes it.

**2.3 — MEDIUM — Drone-vs-combatant is a color-alone distinction on the water and on blips.**
*Location:* DESIGN · Regatta Hoist ("Drones are always greyscale"); DESIGN frontmatter drone tokens; EXPERIENCE · Component Patterns · Kill Feed.
The spec's own CVD note says Rose and Periwinkle "drift toward similar grey-blues" under deutan/protan — i.e., toward drone territory. Mistaking a player for a harmless drone is a lethal misread. Only the kill feed labels drones textually.
*Fix:* Give drones one non-color marker everywhere they render: dashed hull outline, or a `◇` blip glyph, or a `DRONE` nameplate tag at truesight. Also consider darkening drone greys (the pennant note's own suggestion, ≤`#55606B`) so the luminance gap survives.

**2.4 — LOW — Blip decay is luminance-only.**
*Location:* DESIGN · Colors table (blip fresh/faded ramp).
Luminance ramps are CVD-safe, but low-vision players lose stale contacts early. The committed "boosted blip outlines" assist should be explicitly tied to decay floor (e.g., assist mode raises the minimum decayed opacity).

**2.5 — LOW — Storm edge on-water treatment is undecided, so its dual-coding can't be verified.**
*Location:* EXPERIENCE · Open Questions #7.
The in-storm state is well dual-coded (text + vignette + damage). The boundary itself is only a purple line of undecided treatment. The mocks draw it dashed — ratify "dashed = storm edge" as the shape channel when Open Q #7 closes. (Also see 4.6: storm purple fails 3:1 as a graphic.)

**2.7 — LOW — Telegraph ordered-vs-actual should state distinct glyphs.**
*Location:* DESIGN · Components · Telegraph Cluster.
"Phosphor ordered-rung marker, amber actual-speed needle" — if marker and needle are the same shape, the distinction is color-alone. One sentence ("marker = hollow rung outline, needle = solid pointer" or similar) closes it.

---

## 3. Audio-Visual Redundancy Walk

Walk of every named audio event against its visual twin:

| Audio event | Visual twin | Verdict |
|---|---|---|
| fireGun / fireTorp / fireMine (3 tones) | muzzle flash, projectile spawn, slot cooling state | ✓ |
| damage thud | screen shake + HP rail drop + vignette | ✓ |
| kill chime | kill feed line + sink ring | ✓ |
| point ping | XP rail wrap + bank chip + toast | ✓ |
| upgrade two-note | toast + visible slot/boon change ("the build must be felt") | ✓ |
| own-sink alarm | sinking ritardando + listing visuals | ✓ |
| countdown ticks | big center count | ✓ |
| match start | phase text | ✓ |
| storm growl | vignette + "IN STORM" line | ✓ |
| telegraphUp/Down bells | ladder marker moves | ✓ |
| Hit Call boom | orange bloom (paired by design) | ✓ |
| Torpedo audio | listening-ring pips ("the primary torpedo warning channel") + wake at truesight | ✓ but see 3.2 |
| **Foghorn emote** | **nothing in the spine** | **3.3** |
| Bounty radar bloom / active pings (GDD E6) | bloom is visual ✓ / ping visual unspecced | 3.3 |
| Low-HP sting (pending) | HP rail pulse ✓ (visual exists first — good order) | ✓ |
| Denied tone (future) | pulse exists ✓ (reverse gap only) | 3.4 |

**3.1 — HIGH — (= finding 1.2)** The floor rests on Open Question #8; see §1. The table above must become a living contract in the sound-map deliverable.

**3.2 — HIGH — The listening ring is called the visual twin of positional audio, but it carries less information than the audio it twins.**
*Location:* EXPERIENCE · Accessibility Floor ("listening-ring pips ARE the visual of the audio layer"); HUD & Diegetic UI · Listening Ring ("segments light toward noise, intensity ∝ loudness/closeness — near-white phosphor for a close torpedo, faint for distant engines").
The ring encodes **bearing + intensity only**. If the (undesigned) audio distinguishes torpedo from engine from foghorn by timbre — and the GDD says it must ("engine noise, torpedoes in the water, foghorns, and active pings are heard with bearing") — then a deaf or muted player cannot tell a fatal torpedo pip from a distant engine pip. Journey A's entire lesson ("listen") is delivered through this channel; the corrected Beat 6 kills Marco with pips he couldn't classify. On a muted school Chromebook — the *primary persona's* likely environment — this is not an edge case.
*Fix:* Spec pip type-coding now, before the sound map: e.g., torpedo pips strobe-double or elongate radially; engine pips steady; foghorn pips sweep an arc. Or ratify the alternative ("audio carries no type information either; brightness is the whole grammar") so the twin is honestly equivalent. **Needs developer call** — this is sensor design, i.e., game design per the GDD.

**3.3 — MEDIUM — Foghorn emote (and active pings) are missing from the spine entirely.**
*Location:* absent from EXPERIENCE · Interaction Primitives and · HUD; source: extract-gdd (E6 "Foghorn emote (#74): one button; audible on hull mics — a honk is a bearing"); extract-brief-brainstorm #74 (adopted).
An adopted, audio-first mechanic has no key binding, no ring-visual rule, no feed presence. A deaf player misses a broadcast bearing; a hearing player has no button. If it's deferred, say so; if it's v1, spec its visual twin (ring pips light on the honk bearing) and its binding.

**3.4 — LOW — Denied tone is "(future)": reverse-direction redundancy gap.**
*Location:* EXPERIENCE · Game Feel & Juice ("every refused fire/action gets its pulse + (future) tone").
Visual exists, so deaf players are covered; the floor's "vice versa for combat-critical events" clause is the one deferred. Acceptable if the sound map closes it — add it to the 3.1 contract table.

**3.5 — MEDIUM — No volume controls or mono-audio option in a game where "audio is a sensor."**
*Location:* EXPERIENCE · IA (settings = "Accessibility + audio + bindings" — contents unspecified); extract-current-ui §5 ("No volume control, only binary mute").
Master/effects volume sliders are a GAG basic. More pointedly: if positional audio is stereo-panned, players with unilateral hearing loss lose half the bearing field — a **mono audio** toggle is the standard mitigation, and the listening ring already exists as the visual backstop, so the fix is cheap. Spec both in the settings table (1.6).

---

## 4. Contrast

Computed ratios (WCAG formula). DOM surfaces (kill feed, refit cards, toasts, chrome) are squarely WCAG-scoped; canvas HUD is judged by the same numbers as best practice.

| Token / use | Ratio on void | Requirement | Verdict |
|---|---|---|---|
| text-primary `#E2E8F0` | 16.3:1 | 4.5:1 | pass |
| text-secondary `#8B95A5` (11.5px card desc, 14px) | 6.65:1 (6.38 on panel) | 4.5:1 | pass |
| **text-muted `#5A6478`** (11px labels, 9px micro, kill-feed connective 14px) | **3.38:1** (3.25 on panel) | 4.5:1 | **FAIL** |
| phosphor `#00FF88` | 15.0:1 | — | pass |
| amber `#FFB800` | 11.6:1 | — | pass |
| denied `#FF3B3B` | 5.7:1 | — | pass |
| storm-readout `#B06EE8` (text) | 5.98:1 | 4.5:1 | pass |
| **storm `#7B2FBE`** (ring graphic) | **2.87:1** | 3:1 (non-text, WCAG 1.4.11) | **FAIL** |
| drone-outline `#9AA3B2` (feed names) | 7.9:1 | 4.5:1 | pass |

Regatta hues as 14px kill-feed name text (normal text ⇒ 4.5:1; 14px/600 is NOT WCAG large text, which needs ≥18.66px bold):

| Worst offenders | Ratio | Verdict |
|---|---|---|
| **Mulberry `#B01772`** | **3.08:1** | FAIL |
| **Azure `#0F6FD6`** | **4.08:1** | FAIL |
| **Orchid `#C026D3`** | **4.27:1** | FAIL |
| **Lagoon `#0E7FA0`** | **4.37:1** | FAIL |
| Cobalt `#5468FF` | 4.60:1 | marginal pass |
| (remaining 15 hues) | 5.9–17.1:1 | pass |

**4.1 — HIGH — Kill-feed connective text fails contrast on a WCAG-scoped DOM surface.**
*Location:* DESIGN frontmatter `kill-feed` component + Components table ("connective text ('SUNK BY') {colors.text-muted}"), 14px.
3.38:1 at 14px normal text vs required 4.5:1. The kill feed is the game's social theater and a combat-information surface (who died, who's hunting).
*Fix:* Connective text → `text-secondary` (6.65:1). One token change.

**4.2 — HIGH — Four Regatta hues fail as kill-feed name text; DESIGN's own contrast rule uses the wrong threshold.**
*Location:* DESIGN · Colors · Contrast ("Every Regatta hue must hold ≥ 3:1 against void") + Components · Kill Feed (names 600-weight, 14px, personal colors).
3:1 is the large-text/graphics threshold; 14px names are normal text needing 4.5:1. Mulberry (3.08), Azure (4.08), Orchid (4.27), Lagoon (4.37) fail; Cobalt is marginal (4.60). The player named in Mulberry gets an illegible feed identity all match.
*Fix (needs developer call):* (a) define per-hue **text variants** lightened for feed/results use (the `storm`→`storm-readout` precedent already exists in the system); or (b) raise the palette floor to ≥4.5:1 and re-space the four dark hues (changes on-water colors too — balance vs the "spaced by lightness" goal); or (c) render feed names ≥19px bold (breaks the 14px feed spec). Option (a) is the least invasive and matches an existing pattern.

**4.3 — MEDIUM — `text-muted` fails 4.5:1 everywhere, and DESIGN's guard rule ("labels only") doesn't survive WCAG on DOM.**
*Location:* DESIGN · Colors table row "Text" ("Muted below 11px for load-bearing info" = never) and Contrast note (claims ≈3.6:1; actual 3.38:1 on void, 3.25:1 on panel — the claim is optimistic).
WCAG has no "unimportant text" exemption short of pure decoration. On DOM surfaces (refit cards, settings, results) muted text at 11px fails; on the settings `panel` bed it's worse. On canvas (BR-chrome labels) it's a GAG best-practice miss.
*Fix:* Either lighten the token (≈`#7A8496` reaches ~4.5:1 on void) or formally restrict `text-muted` to non-essential decoration and audit every current use (BR-chrome labels, refit category tags, kill-feed connective — the last two are load-bearing and must move up). Correct the ≈3.6 claim in DESIGN while there.

**4.4 — MEDIUM — The spec violates its own muted-text rule twice.**
*Location:* DESIGN · Components · Refit Card ("category tag (mono 9px muted)") and · Banked-Level Chip (cue line "mono 9px" beside a muted-register chip) vs Colors table ("Never: muted below 11px for load-bearing info").
Boon category drives the 1-4 pick under time pressure — it is load-bearing. 9px + 3.38:1 is the worst text in the system.
*Fix:* Category tag → `text-secondary`; keep 9px only if UI-scale floor (6.3) is resolved.

**4.5 — pass —** text-secondary, phosphor, amber, storm-readout, denied, drone-outline all clear their thresholds; `text-primary` on void is excellent.

**4.6 — LOW — Storm ring stroke at 2.87:1 fails the 3:1 non-text graphics threshold.**
*Location:* DESIGN frontmatter `storm: '#7B2FBE'`; EXPERIENCE Open Q #7.
The storm boundary is the most consequential graphic in the endgame. `storm-readout #B06EE8` (5.98:1) already exists — when Open Q #7 (edge treatment) is resolved, spec the on-water edge stroke at readout brightness or add a bright core line; keep `#7B2FBE` for the fill/vignette.

---

## 5. Photosensitivity

Stated caps (good): breathing ≥2s cycles; one-shot pulses 80ms, rate-limited ≥300ms; no full-screen strobes; storm vignette capped at 1.1Hz (EXPERIENCE · Accessibility Floor; DESIGN · Do's and Don'ts). The three-flash-per-second rule is respected by everything **that has a stated rate**. Two things don't:

**5.1 — HIGH — HP-rail pulse "rate rising continuously as HP falls" has no frequency cap.**
*Location:* EXPERIENCE · State Patterns · Own HP ("pulse rate rising continuously as HP falls"); DESIGN · Components · HP Rail.
Nothing prevents the pulse exceeding 3Hz at near-death — precisely when the rail is crimson and the player (a 10-15-year-old, per audience) is most locked onto it, and precisely when shake + damage flashes co-occur. The rail is a small screen area (so WCAG 2.3.1's general-flash area threshold is probably not tripped), but GAG says avoid >3 flashes/s regardless of area, and this spec asymptotically invites it.
*Fix:* One number: "pulse rate caps at 2Hz" (still reads as urgent; stays under every guideline). Also state the pulse is opacity-breathing, not on/off strobing.

**5.2 — MEDIUM — No aggregate flash budget across simultaneous events.**
*Location:* EXPERIENCE · Game Feel & Juice (130ms white hull flash per hit; one-frame activated pop; muzzle flashes; Hit Call blooms) — only denied fire carries a rate limit (≥300ms).
In a 20-ship brawl, per-event flashes can stack past 3/s in one screen region even though each event is individually compliant. Rapid-fire hits on one contact re-trigger the 130ms white flash with no stated floor between flashes.
*Fix:* Add a global rule to the floor: "no element or screen region flashes more than 3×/s; repeated same-source flashes share the 300ms floor; the motion/shake setting's 'reduce' tier also halves flash intensity." (Folds photosensitive-safe behavior into the already-committed O1 setting.)

**5.3 — LOW — Final-10s BR-chrome amber pulse rate unstated.**
*Location:* DESIGN · Components · BR Chrome Bar ("Ring readout pulses {colors.amber} in the final 10s").
Presumably 1Hz; say so.

**5.4 — LOW — "One-frame phosphor pop" is frame-rate-defined.**
*Location:* DESIGN · Components · Hotbar Slot (Activated flash).
One frame at 60fps ≈ 17ms; spec in ms (≤80ms decay, consistent with the denied grammar) so 60Hz Chromebooks and 144Hz monitors agree.

**5.5 — pass —** Storm vignette 1.1Hz cap, ≥2s breathing, 80ms/300ms denied grammar: this is the best-quantified accessibility floor this reviewer has seen in an indie spine. Keep it.

---

## 6. Motor & Cognitive

**6.1 — HIGH — Hold-CTRL refit breaks under Sticky Keys and strains one-handed play; no alternative is permitted by the current decision.**
*Location:* EXPERIENCE · Component Patterns · Refit Card ("CTRL is HOLD, never toggle"); decision log 2026-07-16 (Eric's explicit call); Interaction Primitives.
OS Sticky Keys (the canonical motor-accessibility feature, and present on every school Chromebook as a top-level a11y toggle) latches modifiers per-press — "hold to keep open" semantics do not exist under it, so the committed remapping option cannot rescue a player who needs Sticky Keys. Separately, the left hand owns W/S (tap), A/D (hold), CTRL (sustained pinky hold), and 1–4 (reach over) — during a fight, hold-CTRL + press-3 + steer is a genuine three-simultaneity. Telegraph's set-and-forget design is a real mitigation (credit: steering can be parked), but rudder cannot be.
*Fix (needs developer call — this contradicts a logged Eric decision):* keep HOLD as the default (the design rationale is sound), add a settings option "Refit window: hold / toggle" under accessibility. Toggle mode closes on spend-last, ESC, or re-press. This preserves the design intent for 99% of players and unblocks the rest. At minimum, the spine must acknowledge the Sticky Keys interaction rather than being silent.

**6.2 — MEDIUM — Remap coverage of the modifier-hold pattern (= 1.4).**
If CTRL is remappable, do CTRL+1..4 chords follow the new modifier? Can refit-open bind to a mouse button (freeing the left hand)? Unstated. Fold into the 1.4 fix.

**6.3 — MEDIUM — 9px micro text × 90% UI scale = 8.1px effective on an 11.6" 1366×768 Chromebook.**
*Location:* DESIGN · Typography (hud-micro 9–10px, "1080p reference values"); EXPERIENCE · Responsive (90% scale; floor viewport).
The audience's most common hardware is the smallest, densest-per-inch screen in scope. 8.1px letter-spaced uppercase mono is below any comfortable floor for 10-15-year-olds (and everyone). All-caps + 0.18em tracking further slows young/dyslexic readers.
*Fix:* State a minimum effective size: micro text never renders below 9px post-scale (i.e., the 90% setting exempts the micro tier), or raise the micro floor to 10px. Verify at the 1366×768 key screen (7.1).

**6.4 — LOW — Boon-card time pressure is well mitigated — say so explicitly; one residue.**
*Location:* EXPERIENCE · Component Patterns · Refit Card.
Pre-rolled offers that never reroll or expire mean a player can peek, close, fight, and re-open — the time pressure is self-managed. This is genuinely good cognitive-accessibility design and should be stated as a guarantee ("banked offers never expire") rather than left implicit. Residue: 11.5px descriptions read mid-combat; consider making accrued boons + last offer reviewable from the death/results surface, and a boon glossary on How-to-Play.

**6.5 — pass with note —** Non-pausing ESC settings is defensible for a multiplayer BR, and the gear entry on home means remapping can happen in safety. Keep both entries; never make in-match the only path to any accessibility setting.

---

## 7. UI Scale Reality — 125% on 1366×768

Arithmetic at 125%: hotbar slot 54→67.5px (stack of 4 + bank chip + gaps ≈ 340px vertical — fits 768). Refit row: 4×216px + 3×20px gaps = 924px → **1155px at 125% = 85% of a 1366px viewport**, before the bottom-right vitals cluster and any horizontal margin. Slot tooltip 236→295px. Kill feed 5×14px→17.5px lines — fits.

**7.1 — MEDIUM — No reflow/clamp rules; the floor viewport at max scale is unverified.**
*Location:* EXPERIENCE · Responsive ("corner anchors hold at every size", "corner anatomy never rearranges — muscle memory is the contract"); DESIGN · Components · Refit Card (216px, 20px gaps, four side-by-side).
"Never rearranges" is the *only* layout rule, and it forbids the usual escape hatch (wrapping). The refit row at 1155px probably fits 1366 but with ~100px margins total — any future 5th card, wider card, or overlap with the vitals cluster breaks it silently. The tooltip at 295px near the left edge may clip. Nothing in the spec requires anyone to ever render the floor case.
*Fix:* Mandate a 1366×768 @ 125% key-screen render as an acceptance artifact for the HUD composite; define clamp behavior for the refit row (cards may shrink to ~190px at floor+125%, or the row center-shifts — cards must NOT wrap to 2×2 since the 1–4 keys map spatially — **needs developer call**).

**7.2 — MEDIUM — (= 1.5) Whether 125% scales DOM HUD elements is unstated.** A scale setting that enlarges the hotbar but not the kill feed or refit cards fails the player it exists for. Resolve with 1.5.

**7.3 — LOW — 125% may be an insufficient ceiling for low-vision players.**
*Location:* EXPERIENCE · Accessibility Floor option 3.
GAG recommends generous interface scaling; 125% is modest. Post-beta, evaluate a 150% tier (accepting that the refit row then must clamp per 7.1). **Needs developer call** — screen-real-estate vs legibility trade on the floor viewport.

---

## Severity Summary

| ID | Severity | Finding (short) |
|---|---|---|
| 2.1 | **Critical** | Combatant identity/tracking is color-alone at blip scale (Variant C default) — dual-coding floor violated by the flagship system |
| 1.1 | High | Colorblind assist committed but has zero design (mechanism, scope, palette all open) |
| 1.2/3.1 | High | Audio-visual redundancy floor rests on an undesigned sound map (Open Q #8) — unverifiable |
| 3.2 | High | Listening ring (the audio layer's "visual twin") carries no type coding — deaf/muted players can't tell torpedo pips from engine pips |
| 4.1 | High | Kill-feed connective text `text-muted` = 3.38:1 at 14px DOM — WCAG fail |
| 4.2 | High | Four Regatta hues fail 4.5:1 as 14px feed names (Mulberry 3.08 worst); spec's own ≥3:1 rule is the wrong threshold for text |
| 5.1 | High | HP pulse "accelerating continuously" has no frequency cap — can exceed 3 flashes/s at near-death |
| 6.1 | High | Hold-CTRL refit incompatible with Sticky Keys; no toggle alternative permitted; one-handed strain (needs developer call) |
| 1.3 | Medium | Motion/shake option scope unenumerated, no default |
| 1.4/6.2 | Medium | Remapping silent on mouse buttons, modifier-hold, chords, one-handed presets |
| 1.5/7.2 | Medium | UI-scale scope (Pixi vs DOM HUD elements) ambiguous |
| 1.6 | Medium | No settings table: defaults/persistence unspecified |
| 2.2 | Medium | Selected vs ready slot state is hue+glow only; name the inset wash as load-bearing |
| 2.3 | Medium | Drone-vs-combatant is color-alone; own CVD note shows hues drifting into drone grey |
| 3.3 | Medium | Foghorn emote (adopted, audio-first) absent from the spine — no binding, no visual twin |
| 3.5 | Medium | No volume sliders or mono-audio option in an audio-as-sensor game |
| 4.3 | Medium | `text-muted` fails 4.5:1 everywhere (and DESIGN's ≈3.6 claim is optimistic; actual 3.38) |
| 4.4 | Medium | Spec violates its own rule: load-bearing refit category tag at 9px muted |
| 5.2 | Medium | No aggregate flash budget across stacked hit/muzzle/activated flashes |
| 6.3 | Medium | 9px micro × 90% scale = 8.1px effective on the Chromebook floor hardware |
| 7.1 | Medium | No reflow/clamp rules; 1366×768@125% never verified; refit row = 1155px of 1366 |
| 2.4 | Low | Blip age is luminance-only; tie boosted-outline assist to a decay floor |
| 2.5 | Low | Storm edge treatment open — ratify dashed edge as the non-color channel |
| 2.7 | Low | Telegraph ordered/actual: state distinct glyphs, not just colors |
| 3.4 | Low | Denied tone deferred "(future)" — reverse-redundancy gap, track in sound map |
| 4.6 | Low | Storm `#7B2FBE` graphic = 2.87:1, below 3:1 non-text threshold — use readout brightness for the edge |
| 5.3 | Low | Final-10s amber pulse rate unstated |
| 5.4 | Low | "One-frame" activated flash should be specced in ms |
| 6.4 | Low | State "banked offers never expire" as an explicit guarantee; boon glossary on How-to-Play |
| 7.3 | Low | 125% ceiling modest for low-vision; evaluate 150% tier (developer call) |

**Totals: 1 critical · 7 high · 14 medium · 8 low.**

Positive findings worth keeping on the record: the quantified photosensitivity floor (5.5), the pre-rolled never-expiring offer design as cognitive mitigation (6.4), set-and-forget telegraph freeing the left hand, cooling-state dual-coding (dim + geometry + text), HP triple-coding (color + pulse + numerals), and dual settings entry points (home + in-match).
