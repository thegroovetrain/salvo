# Adversarial Review — HUD Legibility ("information noise must never bury the hunt")

Reviewer lens: 13-year-old on a 1366×768 low-end Chromebook, 60 FPS, 20-ship match, worst-case screen.
Artifacts attacked: `DESIGN.md`, `EXPERIENCE.md`, `.decision-log.md`, `.working/hud-composite-1.html`, `.working/class-silhouettes-1.html`, `.working/spend-window-1.html` (placement check), `.working/extract-gdd.md` (E6 inventory).
Date: 2026-07-16. Line citations are to the files as of this run.

---

## Overall verdict

The steady-state frame genuinely honors the guardrail — the composite's squint test passes because it was composed as a calm moment (its own footnote admits arcs, denied states, and the spend window are absent: `hud-composite-1.html:794-796`). The spec's failure surface is everything the composite does *not* show: there is **no attention-priority rule** among the 10+ animated channels the spec legalizes simultaneously, the floor resolution and both UI-scale options are un-walked (the spec violates its own 9px type floor at 90%), and several blip-scale class claims are mathematically subpixel. All findings are fixable at spec level before implementation; none require abandoning a ratified direction.

---

## Attack 1 — Worst-case screen (20 ships, refit open, everything firing)

Reconstructed worst case per spec: 19 contacts/blips with 3-deep decay ghosts each (~76 colored marks + 19 heading vectors), wounded smoke on several, fall-of-shot splashes, muzzle flashes carrying beyond truesight, kill feed churning at its 5-line cap, storm ring + vignette pulsing, listening pips lit on two bearings, refit window open (4 cards), HP <25% red pulse, bank chip breathing, ring countdown pulsing amber, denied pulses on fire spam.

### F1 — No attention-priority hierarchy; the most lethal signal is the least animated — **CRITICAL**
- **Location:** absent from both spines. `EXPERIENCE.md:113-119` (Accessibility Floor) rate-limits pulses for photosensitivity but never arbitrates *attention*; `DESIGN.md:231-243` (Do's and Don'ts) has no priority rule. Meanwhile the spec legalizes concurrently: HP-rail accelerating pulse (`EXPERIENCE.md:86`), bank-chip 2.4s breathe (`DESIGN.md:215`), ring-countdown amber pulse (`DESIGN.md:221`), denied 80ms pulses (`DESIGN.md:213`), storm vignette 1.1 Hz (`EXPERIENCE.md:90,119`), activated flash (`DESIGN.md:213`), up to 4 cooling conic rings, 4s sweep rotation, blip decay, toasts, kill-feed churn, screen shake, listening pips, wounded smoke — I count **≥10 legal simultaneous animated channels** across three corners plus center.
- **The killer detail:** the listening-ring pips — the *primary torpedo warning channel* (`EXPERIENCE.md:138,143`; Journey A beat 6, `EXPERIENCE.md:176`) — are the **only threat channel with no pulse grammar at all**: they just glow at a brightness (`DESIGN.md:223`). In the worst case, every economy/status channel pulses while the thing that kills Marco sits static. The attention economy actively buries the exact lesson ("listen") the design wants to teach.
- **Fix suggestion:** add a one-table attention hierarchy to EXPERIENCE.md · State Patterns: Tier 1 (imminent threat: torpedo pips, HP <25%, final-10s ring) > Tier 2 (action state: selected/denied/cooling) > Tier 3 (economy: bank chip, XP, toasts). Rule: while any Tier 1 channel is active, Tier 3 breathing/glow animations freeze at their dim keyframe (a static chip still reads "banked"). Give close-torpedo pips a Tier 1 pulse of their own (they may strobe-limit at the same ≥300ms floor). Which channels outrank which is a **needs developer call**; the *existence* of the table is not.

### F2 — Refit window occludes the listening ring and truesight annulus — **HIGH**
- **Location:** `EXPERIENCE.md:64` ("Four cards side by side… Non-blocking: the battle stays visible in every gap"); `DESIGN.md:217` (216px cards, 20px gaps, no backdrop dim). Placement is specified **nowhere in the spines**. The only placement evidence is the mock: `spend-window-1.html:251` (`left:50%; top:46%`) with the claim "floated above center so own ship stays visible" (`spend-window-1.html:498`) — but that mock (a) was authored for **three** cards ("three 216px cards", same line) while the spine decided four, and (b) demonstrates visibility on a demo canvas whose ship sits at `top:76%; left:63%` (`spend-window-1.html:419`) — not camera-centered as in the live game.
- **Math at the floor:** 4×216 + 3×20 = **924px row**. Centered at 46% of 768, the block (~240px with header + helper) spans y≈233–473 and x≈221–1145: it covers the top half of the listening ring (r≈150 around the centered own ship) and most of the truesight annulus across ~68% of screen width. By even-card symmetry the own hull peeks through the middle 20px gap — but the torpedo warning ring and the truesight edge where torpedoes materialize (`EXPERIENCE.md:143`) are occluded on nearly every bearing, precisely during the strongest temptation to refit (mid-hunt, point just banked).
- **Fix suggestion:** re-render the key screen with 4 cards over a *centered* own ship (already pending per the HP-rail ASSUMPTION) and either (a) dock the row lower/upper-third so the ring stays clear, (b) shrink cards below 216px when the row would cross the ring, or (c) render the ring + pips *above* the card layer (they're chart-layer, fog-immune — z-order `DESIGN.md:199` already separates chart from HUD). Whether refit-at-your-own-risk extends to "torpedo channel hidden" is a **needs developer call** — the settings-overlay risk philosophy (`EXPERIENCE.md:37`) was never explicitly ratified for occluding a Tier 1 sensor.

### F3 — Combat-effect colors are untokenized exactly where the screen is busiest — **MEDIUM**
- **Location:** `DESIGN.md:130` retires `#66FFAA` from splash rings ("double-duty… must end") but assigns **no replacement token** for miss splashes; `EXPERIENCE.md:151` still says "green miss splash." Muzzle flash ("carries beyond truesight," `EXPERIENCE.md:147`) has no color. The torpedo's on-water render is invented per-mock (`#CFE8DD`/`#3FBF8F`, `hud-composite-1.html:582-584`) and appears in no DESIGN token. Hit Call "orange bloom" (`EXPERIENCE.md:155`) has no token — and orange sits inside the *reserved amber band* (`DESIGN.md:152`).
- **Impact:** the highest-frequency worst-case elements (splashes, flashes, torpedoes) are the least specified — implementation will improvise hues into a palette where every band is spoken for, and a phosphor-ish splash is a fake blip.
- **Fix suggestion:** add a "combat effects" token row to DESIGN.md · Colors (splash, muzzle, torpedo, hit-bloom), chosen off the combatant wheel — e.g. desaturated silver-white family for splash/muzzle. Exact hues are a **needs developer call**.

### F4 — Blip decay-ghost budget is uncapped — **MEDIUM**
- **Location:** `DESIGN.md:168` ("Blips also carry heading vector + decaying paint ghosts") and `EXPERIENCE.md:141` specify ghosts with no per-contact count or global budget. The 4s sweep repaints 19 contacts continuously; the mock shows 3 ghosts per blip (`hud-composite-1.html:598-600`) but that is composition, not spec.
- **Fix suggestion:** spec a hard cap (e.g. ≤3 ghosts/contact, TTL-based) in DESIGN.md's blip rule — also a Chromebook perf guard.

### F5 — Amber is five signals at once in the endgame — **MEDIUM**
- **Location:** `DESIGN.md:131` assigns amber to "Selected / armed / action / warning." In the final ring: selected slot glow (`DESIGN.md:213`), HP rail 25–50% (`DESIGN.md:219`), ring final-10s pulse (`DESIGN.md:221`), telegraph actual-speed needle + rudder tick (`DESIGN.md:220`), amber hit sparks (`EXPERIENCE.md:151`) — all simultaneously, in three corners. Position/shape dual-coding keeps each *decodable*, but amber stops meaning "look here" when it's everywhere at the climax.
- **Fix suggestion:** covered structurally by F1's hierarchy (only the highest-tier amber channel gets to *pulse*; the rest hold steady). No new color needed.

### F6 — Wounded smoke and drone greyscale are near-identical greys — **LOW**
- **Location:** smoke puffs `#8B95A5` (`hud-composite-1.html:519-522`) vs drone outline `#9AA3B2` (`DESIGN.md:43`) — ~4% luminance apart. A drifting smoke trail at distance can read as a drone contact cluster. Motion and shape dual-code it, so low.
- **Fix suggestion:** warm or darken the smoke grey a step; one token edit.

### F7 — Kill feed shares the NE quadrant with colored blips, in the same identity hues — **LOW**
- **Location:** kill feed top-right, personal-color names (`DESIGN.md:222`; z900 DOM over canvas, `DESIGN.md:199`); Variant C paints blips in the same hues in the same quadrant (`hud-composite-1.html:592-600`, fuchsia BB at NE). Five feed lines ≈ 133px deep; a fuchsia *name* above a fuchsia *blip* momentarily doubles the "fuchsia is here" read.
- **Fix suggestion:** none required beyond awareness; if playtests confirm confusion, a per-line dark-glass scrim (already permitted, `DESIGN.md:197`) separates feed from glass.

---

## Attack 2 — 1366×768 floor

The composite is authored at 1920×1080 with absolute px and "corner anchors hold at every size" (`EXPERIENCE.md:214`). No downscale rule exists between authoring and floor — at 1366×768 every element keeps its 1080p pixel size, so the HUD *proportion* grows ~40%.

Walk at 100%: hotbar zone = bank line 30 + gap 14 + 4×54 slots + 3×14 gaps = **302px tall** (39% of 768; it was 28% of 1080). Vitals cluster ≈ 237px tall. BR chrome ≈ 620–650px wide (39 glyphs at 16px mono + .14em tracking + gaps, `hud-composite-1.html:188-198`). Kill feed longest mock line ("SALT SHAKER SUNK BY KRAKEN'S BANE", 33 chars at 14px mono) ≈ 314px. Corner anatomy itself does hold at 100% — the failures are below.

### F8 — UI-scale 90% drives type below DESIGN's own legibility floor — **HIGH**
- **Location:** `EXPERIENCE.md:125` / `DESIGN.md:186` ("UI scale 90/100/125% multiplies the whole HUD ramp"). At 90%: hud-micro 9px → **8.1px**, label 11px → 9.9px, hb-info 10px → 9px, telegraph rungs 9px → 8.1px. `DESIGN.md:144` mandates muted text "uppercase mono ≥ 9px, never body copy or load-bearing numbers" and `DESIGN.md:139` "Muted below 11px for load-bearing info." The 90% option — which floor-resolution players are the most likely to reach for — violates the spec's own floor on the worst panels (1366×768 TN Chromebooks).
- **Fix suggestion:** clamp the multiplier per-role: geometry scales to 90% but no mono type renders below 9px (i.e., micro type is exempt from downscale). One sentence in DESIGN.md · Typography.

### F9 — UI-scale 125% collides top-center chrome with the kill feed at the floor — **HIGH**
- **Location:** same scale spec (`EXPERIENCE.md:125`), zones per `EXPERIENCE.md:135-137`, `DESIGN.md:221-222`. At 125% on 1366: BR chrome ≈ 780–810px (spans x≈278–1088); kill feed ≈ 392px (left edge ≈ 946). **Overlap ≈ 130–150px.** Nothing in the spec forbids 125% at the floor viewport, and "corner anatomy never rearranges" (`EXPERIENCE.md:215`) removes the escape hatch of moving the feed.
- **Fix suggestion:** either gate 125% below 1600px viewport width, or spec that the kill feed drops below the BR chrome line when their boxes would intersect. **Needs developer call** (both options touch the muscle-memory contract).

### F10 — Callsign length is uncapped; the feed can collide with BR chrome even at 100% — **HIGH**
- **Location:** no max callsign/vessel-name length exists in `EXPERIENCE.md` (Component Patterns · Kill Feed, line 67) or `DESIGN.md:222`; home has a free callsign field (`EXPERIENCE.md:34`). Two 16-char names + " SUNK BY " ≈ 41 chars ≈ 390px at 14px → left edge ≈ 948 vs BR chrome right edge ≈ 993 at 1366×768: **overlap ~45–60px at 100% scale**.
- **Fix suggestion:** spec a callsign cap (e.g. 12–14 chars) at entry plus mid-ellipsis truncation in the feed. Cap value is a **needs developer call**.

### F11 — Radar paints contacts that no 16:9 screen can show; the floor makes it worse — **HIGH, needs developer call**
- **Location:** radar reference 650u (`extract-gdd.md:47`); at the composite's world scale (~0.92 px/u, radar hint r=780px, `hud-composite-1.html:52-53,550`) the radar radius exceeds **every** 16:9 half-height (540px at 1080p; **384px at 768**). North/south radar paints beyond ~415u (1080p) / ~295u (768) never render on-screen; at the floor, over half the radar annulus is invisible on the vertical axis. The spec's only resize statement is "Canvas fills the window; fog composite rebakes" (`EXPERIENCE.md:217`) — no world-zoom rule, no off-screen contact treatment, and the mock's scale caveat ("blip/hull sizes… artifact, not decision," `EXPERIENCE.md:130`) leaves the whole question unowned.
- **Impact:** the hunt *is* radar; a Chromebook player is structurally blinder than a 1080p player — an information-fairness hole in a game whose pillar is information.
- **Fix suggestion:** decide one of: fit-height world zoom at the floor, edge-of-screen bearing ticks for off-screen paints, or accept and document the asymmetry. All three are design choices — **needs developer call**.

### F12 — The ratified composite contradicts the spine in three places — **MEDIUM**
- **Location:** `hud-composite-1.html` still shows the superseded horizontal 260×10 HP bar (`:333-339,701-702`) vs the HP Rail decision (`DESIGN.md:219`, flagged [ASSUMPTION]); placeholder keys 1/2/E (`:470,665-689`) vs Q/E/R/F (`EXPERIENCE.md:100`); the supply-drop ghost (`:201-208,914`) vs "zero HUD footprint" (`EXPERIENCE.md:136`, Open Q3). "Spines win" is stated, but the only full-HUD visual reference disagrees with the spine — a classic implementation-drift trap, and the vitals-cluster width/height at the floor can't be verified until the rail exists.
- **Fix suggestion:** the pending key-screen re-render (already flagged at `DESIGN.md:219`) should be treated as a blocker for E2/E6 implementation, not a nice-to-have.

---

## Attack 3 — Blip-scale class legibility

The blip rule: outline only, 9–14px, non-scaling 1px stroke, any heading (`DESIGN.md:168`); GDD requires "class readable at blip range" (`extract-gdd.md:49`).

### F13 — Two of four class-identity features are subpixel at documented blip sizes — **HIGH**
- **Location:** `class-silhouettes-1.html` geometry + `DESIGN.md:163-166` sizes. The math: Battleship stepped armor beam = 6u steps on a 124u hull at 14px → 14/124 = 0.113 px/u → **0.68px step** — invisible under a 1px stroke. Mine Layer stern notch = 7u×12u on 88u at 12px → **≈1.0×1.6px** — one antialiased pixel. The silhouette sheet's own claim that "the battleship's stepped beam breaks its long edges; the mine layer's square stern bite reads as a blunt, notched end" (`class-silhouettes-1.html:484-488`) is not achievable at the stated sizes; only **size and aspect ratio** survive (which `DESIGN.md:168` half-concedes). That leaves BB-vs-ML separated by a 14-vs-12px delta and GB-vs-ML by 9-vs-12px — deltas that decay-ghost dimming, rotation antialiasing, and low-quality panels routinely destroy.
- **Fix suggestion:** stop relying on outline character at blip scale: spec blip-render exaggeration (the sheet's own named levers — larger small-class multiplier, exaggerated GB shoulder flare, `class-silhouettes-1.html:565-568` — plus an exaggerated ML notch, e.g. 3× depth in the blip path only). These are CONFIG-level per the sheet; adopting them into the spine is the fix.

### F14 — The 9px Gunboat floor was flagged and shipped anyway — **HIGH**
- **Location:** `class-silhouettes-1.html:565-568` ("at 9 px the Gunboat is near the floor of legibility") — an honest flag with two named levers, but `DESIGN.md:166` ratifies 9px with no lever adopted and no acceptance criterion for the playtest. On a 1366×768 panel a 9px 1px-outline wedge under phosphor decay is a smudge.
- **Fix suggestion:** adopt lever (a) now — a blip-scale multiplier floor (e.g. no class blips below 11px) — and let playtest tune down, not up. **Needs developer call** only on the number.

### F15 — Torpedo Boat at rotation degenerates into a line — confusable with heading vectors — **MEDIUM**
- **Location:** TB is 9u beam on 100u at 11px → ~1px wide: a rotated TB blip (`class-silhouettes-1.html:410-417`, "TB 65°") is a 1px×11px stroke. Every blip *also* carries a 1.5px heading-vector line (`hud-composite-1.html:597,608`). Two nearly identical line primitives at blip scale — a TB blip can read as a stray heading vector of a neighboring contact (and vice versa) on a 20-ship glass.
- **Fix suggestion:** differentiate the vector primitive (dashed, or arrowhead terminal) in DESIGN.md's blip rule so no hull outline shares its grammar.

### F16 — Phosphor-adjacent Regatta hues can impersonate HUD chrome — **HIGH**
- **Location:** `DESIGN.md:152` reserves amber, red family, and storm violet — but **not the phosphor green band**. Spring `#37F2A0`, jade `#0B9E72`, green `#23B123`, aqua `#40EEE0` (`DESIGN.md:50-53`) all sit within ~±25° of phosphor `#00FF88`. Consequences on the glass: a Spring player's blips are near-identical to Variant P blips/`blip-fresh` marks, sit inside the phosphor sweep wedge, match the listening-ring pip color, and blend with the own-ship phosphor wake (`hud-composite-1.html:527-530`). "HUD chrome stays phosphor-functional" (`DESIGN.md:151`) only separates chrome from identity if identity can't wear chrome's color.
- **Fix suggestion:** extend the reserved bands to exclude ~±20° around phosphor (drop or shift spring/jade/green; the wheel loses ~3 hues — see F18 for why 20 was already too many). **Needs developer call** (changes the ratified 20-hue set).

### F17 — Colorblind assist cannot deliver 20 distinguishable identities — **MEDIUM, needs developer call**
- **Location:** `DESIGN.md:153` / `EXPERIENCE.md:126` commit a "CVD-optimized palette swap and/or boosted blip outlines" with the palette as open work. Under deuteranopia/protanopia the green band (lemon/chartreuse/olive/lime/green/spring) collapses and the magenta family compresses; ~8–10 distinguishable hues is the practical ceiling for small marks. No swap palette can preserve 20 unique identities — the committed option, as worded, over-promises.
- **Fix suggestion:** re-scope the assist mode now: CVD mode keeps class shapes + boosted outlines and *degrades identity to color-family + hover/nameplate confirmation*, rather than promising 20 unique hues. This is a design decision, not a palette-tuning task.

### F18 — Variant C's tracking promise is hue-inequitable and adjacency-limited — **MEDIUM**
- **Location:** `EXPERIENCE.md:141` ("colored blips make contacts trackable across fog gaps"); Journey B depends on it (`EXPERIENCE.md:186-188`). Two independent failures at 9–14px/1px-stroke: (a) **adjacency** — 20 hues over ~250° averages 12.5° spacing; cyan/sky/aqua, magenta/fuchsia/orchid/rose, lime/chartreuse are indistinguishable at small field sizes, so tracking degrades to color-*family*; (b) **decay inequity** — computed vs `void` `#050807`: mulberry `#B01772` ≈ **3.1:1** while lemon `#FFF04D` ≈ 15:1; at ghost opacity .30 (`hud-composite-1.html:598`) mulberry's trail is ~1.3:1 effective — invisible — while lemon's still reads. Players assigned dark hues (contention losers get "nearest free hue," `EXPERIENCE.md:65`) are literally harder to grudge-track: a competitive asymmetry.
- **Fix suggestion:** floor the *blip/ghost* rendering luminance per hue (blips may render a lightened variant of dark hues, the way `storm-readout` lightens storm), and verify the 20 picks at 1px stroke, not swatch size, during the `DESIGN.md:144` implementation check.

---

## Attack 4 — Peripheral channels fighting

Full enumeration of spec-legal simultaneous animation (see F1 for the master list and the missing priority rule — the headline finding of this attack lives there). Two additional structural findings:

### F19 — Accelerating HP pulse contradicts the photosensitivity floor; no rate cap exists — **HIGH**
- **Location:** `EXPERIENCE.md:86` / `DESIGN.md:219` ("pulse rate accelerating as HP drops" / "rising continuously as HP falls") vs the non-negotiable floor "breathing glows (≥2 s cycles)… no full-screen strobes" (`EXPERIENCE.md:119`, `DESIGN.md:239`). "Continuously accelerating" with no ceiling either (a) crosses the 2s-cycle floor and keeps going — at low HP an uncapped pulse approaches strobe territory on the one element guaranteed to be on-screen while the player is most stressed — or (b) is silently capped at 2s cycles, at which point "accelerating" spans so little range it stops encoding anything. The spec grants the storm vignette an explicit 1.1 Hz exception (`EXPERIENCE.md:119`) but is silent on HP. This is an internal contradiction, not a tuning detail.
- **Fix suggestion:** spec the ramp: e.g. 0.5 Hz at 49% → capped at 1.1 Hz at ≤10% (reusing the storm's already-ratified exception ceiling), and state that the HP pulse is a floor-exempt one like the vignette. Exact curve is a **needs developer call**; the cap's existence isn't.

### F20 — Bank-chip breathing is a permanent attractor with no quiet state — **MEDIUM**
- **Location:** `DESIGN.md:215` (2.4s breathing "never a flash") + `EXPERIENCE.md:62,88` — the chip breathes the entire time ≥1 level is banked. A player saving levels (a legitimate strategy) carries a permanently pulsing bottom-left element for minutes, adjacent to the XP rail and directly competing with the HP rail diagonal. Combined with F1: economy outshines threat.
- **Fix suggestion:** decay the breathe to a static glow after ~10s unspent, re-arm on new bank / on CTRL touch. (Subsumed by F1's tier rule if adopted.)

---

## Attack 5 — Colored kill feed on the void

Computed WCAG contrast of Regatta hues as 14px text (`DESIGN.md:222`, `hud-composite-1.html:216-219`) against `void #050807`:

| Hue | Ratio | 4.5:1 AA (14px text) |
|---|---|---|
| mulberry `#B01772` | ≈3.1:1 | **fail** (barely meets even the 3:1 graphics rule) |
| azure `#0F6FD6` | ≈4.1:1 | **fail** |
| orchid `#C026D3` | ≈4.3:1 | **fail** |
| lagoon `#0E7FA0` | ≈4.4:1 | **fail** |
| cobalt `#5468FF` | ≈4.6:1 | pass (margin ~0.1) |
| olive `#7A9B0F` | ≈6.2:1 | pass (green-channel-heavy — *not* a failure despite looking dark) |

### F21 — Four Regatta hues fail AA as kill-feed text; the spec's contrast rule doesn't cover text usage — **HIGH**
- **Location:** `DESIGN.md:144` requires "≥ 3:1 against void" for Regatta hues — the *graphics* threshold, correct for blips/hulls — but `DESIGN.md:222` reuses the same raw hues as **14px text**, where 4.5:1 applies (600 weight at 14px does not qualify as large text). A mulberry killer's name at 3.1:1 on a 13" TN panel is unreadable at a glance — and the kill feed is gameplay information (who's hunting whom feeds the Variant C deduction game).
- **Fix suggestion:** define per-hue *text variants* (lightness-floored, the `storm`→`storm-readout` pattern already in the system, `DESIGN.md:134`) used wherever a personal color renders as text (feed, results, nameplates). Mechanical, no new design direction.

### F22 — Kill-feed connective text violates DESIGN's own text-muted rule — **MEDIUM**
- **Location:** connective text ("SUNK BY") is `text-muted` at 14px (`DESIGN.md:98,222`); computed ≈3.4:1. `DESIGN.md:139,144` restricts text-muted to "labels/captions only… never body copy or load-bearing numbers." Whether a kill relation is "load-bearing" is arguable — but the feed also renders over variable backgrounds (fog, sweep, blips), not just pure void, which only lowers effective contrast.
- **Fix suggestion:** promote connective text to `text-secondary` (`#8B95A5`, ≈7:1) or permit the dark-glass scrim per line (already sanctioned, `DESIGN.md:197`).

---

## Attack 6 — Attention economy of the listening ring vs the torpedo

Journey A's corrected lesson (`EXPERIENCE.md:176-178`, `.decision-log.md` torpedo-sensing + Journey A entries) requires pips-then-sight to read as **one continuous event**. The spec does not guarantee it:

### F23 — One visual variable encodes source-type, loudness, AND closeness — engines can cry torpedo — **MEDIUM**
- **Location:** `DESIGN.md:223` / `EXPERIENCE.md:138`: "segments light toward noise, brightness ∝ loudness/closeness — near-white phosphor for a close torpedo, faint for distant engines." Brightness is the *only* channel, and it conflates three quantities: a close, loud engine (a Battleship at 200u) produces the same near-white arc as an inbound torpedo. Marco's lesson is supposed to be "bright pips = torpedo = turn now" — but the spec trains false positives, and after three engine-flavored wolf cries the pips get ignored again. The audio layer might disambiguate (timbre), but the sound map is explicitly undesigned (Open Q8, `EXPERIENCE.md:228`) and the accessibility floor requires the *visual* twin to carry the signal alone (`EXPERIENCE.md:118`).
- **Fix suggestion:** dual-code source-type on the pips — e.g. torpedo bearings pulse/tick while engine bearings glow steady (also gives torpedoes the Tier 1 animation F1 needs), or a distinct pip shape (doubled arc). Which encoding: **needs developer call**.

### F24 — "Slightly tighter than truesight" torpedo visibility creates a sanctioned contradiction window — **MEDIUM, needs developer call**
- **Location:** `EXPERIENCE.md:143` ("seen only at truesight — **or a slightly tighter radius**, tuned by how easy dodging proves"); `.decision-log.md` torpedo-sensing entry. If the tighter radius is chosen, there is a spatial band where the pips scream near-white "it's HERE" while the water at that bearing shows *nothing* — the two channels directly contradict, exactly inverting Journey A's one-event lesson (the player looks, sees empty water, dismisses the pips, dies to the thing the tuning hid). The tuning lever was ratified without a legibility guard.
- **Fix suggestion:** if the tighter radius ships, spec a bridge signal in the gap band (e.g. the pip arc extends a fading spoke inward, or the materializing rings from `hud-composite-1.html:579-581` begin at the pip bearing before the hull-visible radius). Guard wording: "the pips and the sighting must never disagree about existence, only about precision."

### F25 — The torpedo's materialization treatment is mock-only — **LOW**
- **Location:** the pale materializing rings + wake (`hud-composite-1.html:579-587`) are the visual that makes pips→sight legible, and they exist in no spine: `EXPERIENCE.md:143` covers *when* torpedoes are seen, `DESIGN.md` has no torpedo component/token (see F3). The one-event guarantee currently lives in an unratified mock detail.
- **Fix suggestion:** promote the materialization treatment (boundary rings at the pip bearing, wake astern) into DESIGN.md · Components.

---

## Summary table

| # | Finding | Severity | Attack |
|---|---|---|---|
| F1 | No attention-priority hierarchy; torpedo pips are the only non-pulsing threat channel among 10+ legal simultaneous animations | **Critical** | 4/1/6 |
| F2 | Refit window (4×216px @ ~46% center) occludes listening ring + truesight annulus; placement unspecified in spines, mock proved 3 cards on a non-centered ship | High | 1 |
| F19 | Accelerating HP pulse has no rate cap — contradicts the ≥2s photosensitivity floor | High | 4 |
| F21 | Four Regatta hues fail 4.5:1 as 14px kill-feed text (mulberry 3.1:1, azure 4.1, orchid 4.3, lagoon 4.4) | High | 5 |
| F8 | UI-scale 90% pushes micro type to 8.1px — below DESIGN's own 9px floor | High | 2 |
| F9 | UI-scale 125% at 1366×768: BR chrome + kill feed overlap ~130–150px | High | 2 |
| F10 | Callsign length uncapped — feed/chrome collision possible even at 100% | High | 2 |
| F11 | Radar radius exceeds every 16:9 half-height; floor players lose over half the N/S radar annulus; no zoom/off-screen rule | High (dev call) | 2 |
| F13 | BB step (0.68px) and ML notch (~1px) are subpixel at blip scale — class collapses to size+aspect | High | 3 |
| F14 | 9px Gunboat floor flagged by its own sheet, ratified without adopting a lever | High | 3 |
| F16 | Phosphor-green band not reserved — spring/jade/green/aqua blips impersonate HUD chrome | High (dev call) | 3/1 |
| F3 | Splash/muzzle/torpedo/hit-bloom colors untokenized (retired #66FFAA never replaced) | Medium | 1 |
| F4 | Blip decay-ghost budget uncapped (19 contacts × 4s sweep) | Medium | 1 |
| F5 | Amber = 5 simultaneous meanings at endgame | Medium | 4/1 |
| F12 | Ratified composite contradicts spine ×3 (HP bar, keys, supply ghost) — re-render is a blocker | Medium | 2 |
| F15 | Rotated Torpedo Boat blip ≈ 1px line — confusable with heading vectors | Medium | 3 |
| F17 | CVD assist cannot preserve 20 identities — committed option over-promises | Medium (dev call) | 3 |
| F18 | Variant C tracking: adjacent-hue confusion + dark-hue ghost invisibility (competitive inequity) | Medium | 3 |
| F20 | Bank chip breathes forever while levels are banked — permanent economy attractor | Medium | 4 |
| F22 | Feed connective text-muted at 14px ≈3.4:1, violates DESIGN's own muted rule | Medium | 5 |
| F23 | Pip brightness conflates torpedo/engine/loudness/closeness — trains false positives | Medium | 6 |
| F24 | "Tighter than truesight" option sanctions a pips-vs-water contradiction window | Medium (dev call) | 6 |
| F6 | Wounded-smoke grey ≈ drone grey | Low | 1 |
| F7 | Kill feed and colored blips share NE quadrant in identical hues | Low | 1 |
| F25 | Torpedo materialization treatment exists only in the mock | Low | 6 |

**Counts: 1 critical · 10 high · 11 medium · 3 low** (dev-call-flagged: F11, F16, F17, F24, plus decision points inside F1, F2, F9, F10, F14, F19, F23).
