# Spine Pair Review — Hullcracker.io

> **DEVICE PREMISE RESTATED — 2026-08-21 (Story 7.6). No finding's severity or status changes.**
>
> This is a **dated review document** (run 2026-07-16) and its findings are preserved exactly as
> written. One premise underneath them has since moved: the reference device was a low-end
> 1366×768 school Chromebook, and the 2026-08-18 Epic 7 rescope retired it (Eric, 2026-08-21:
> *"Idgaf about the chromebook."*). The reference device is now Eric's MacBook Pro 16,1
> (i7-9750H / 32 GB / Radeon Pro 5300M + UHD 630, dpr 2) — epic-7 amendment 1.
>
> **What that does and does not change.** The **1366×768 viewport floor SURVIVES on its own
> terms** — it is an independent requirement (NFR7, UX-DR39), never a property of the Chromebook,
> only illustrated by one. Every finding below whose basis is the floor viewport, a post-scale
> type size (the 9 px mono minimum, 8.1 px at 90% UI scale), a contrast ratio, a subpixel
> silhouette feature, or an attention/animation budget is **unaffected in substance and keeps its
> stated severity**; read "on a Chromebook" as "at the 1366×768 floor viewport". Findings whose
> basis is *hardware performance* are re-measured against the reference MacBook (NFR1) — the bar
> moved, the finding did not disappear. **Eric's ruling (G3) is that open findings keep their
> severity**; nothing here has been downgraded, closed, or reworded on account of the device
> change, and open findings continue to gate DESIGN.md.

## Overall verdict

A strong, extraction-ready spine pair: every `{path.to.token}` reference in both files resolves to a defined DESIGN.md frontmatter token, every color carries a hex, component names are byte-identical across the two files, and both journeys from the decision log land with protagonists, numbered beats, climaxes, and failure paths. The one high-severity gap is inheritance: two adopted GDD E6 information-texture features (the Bounty radar bloom, the Foghorn emote) have no UX treatment anywhere — a story-dev implementing E6 from this contract would have to invent or silently drop them. Remaining findings are medium/low: a handful of visual specs referenced behaviorally but never drawn (nameplate, home status line, countdown), the HP Rail spec-vs-mock divergence (honestly flagged, but unresolved), and a miss-splash color left token-less after its old hex was retired.

## 1. Flow coverage — strong

Checked EXPERIENCE.md Key Flows against every journey/persona source: GDD (silent — no named journeys, per `.working/extract-gdd.md` §2), brief audience sketches (16–35 compass player · 10–15 Chromebook portal player · WoWS refugee, per `.working/extract-brief-brainstorm.md` §4), and the decision log (Journey A "Marco" accepted with Beat 6 corrected; Journey B "Dee" tentatively accepted; third journey open, non-blocking). Both accepted journeys are present with named protagonists, numbered steps (8 and 7), a bolded climax beat, and an explicit failure path. Beat wording is honestly [ASSUMPTION]-tagged as reconstructed, matching the log. The open third journey is declared rather than silently missing.

### Findings

- **low** The 16–35 "design compass" audience sketch — the brief's *primary* — has no journey; Marco and Dee cover the Chromebook and WoWS-refugee sketches, and the open third slot is earmarked for a party/friend-group session, not the compass player (EXPERIENCE.md · Key Flows). *Fix:* either point the open third-journey slot at the compass player, or add a one-line note that Dee's beats double as the compass-player read.

## 2. Token completeness — strong

Extracted all 29 distinct `{path}` references in DESIGN.md (body + frontmatter component values) and all 7 in EXPERIENCE.md (`{curly.path}` in the header is the syntax example, not a reference). Every one resolves to a defined frontmatter token, including EXPERIENCE's `{colors.island-fill}`/`{colors.island-stroke}` in Open Questions. All 40 color tokens carry hexes (`card-scrim` additionally documents its rgba rendering). Contrast targets are stated for the load-bearing combinations: `text-primary`/`void` ≈15:1, `phosphor` and `amber` on `void` >9:1, `text-muted` ≈3.6:1 with an explicit usage restriction, and a ≥3:1 floor for all 20 Regatta hues with a verify-at-implementation note.

### Findings

- **medium** Game Feel & Juice commits "amber hit spark vs green miss splash" and a "crimson expanding sink ring," but the miss-splash green has no token — and the Colors table explicitly retires the old splash hex ("`#66FFAA` double-duty on splash rings must end") without assigning a replacement (DESIGN.md · Colors, blip row; EXPERIENCE.md · Game Feel & Juice). *Fix:* mint a `splash` (and optionally `sink-ring`) token or state which existing token each effect uses.
- **low** The Hotbar Slot cooling state restates `#030605` raw instead of `{colors.card-scrim}` — violating the file's own "don't restate tokens ad hoc" rule (DESIGN.md · Components, Hotbar Slot row). *Fix:* replace the literal with the token reference.

## 3. Component coverage — adequate

Walked all 17 named components: each has both a DESIGN.md Components row (real anatomy: sizes, opacities, state appearances) and an EXPERIENCE.md Component Patterns entry with genuine behavioral rules. Four (BR Chrome Bar / Listening Ring / HP Rail / Telegraph Cluster) are covered by explicit pointer to State Patterns and HUD & Diegetic UI, and the pointed-to sections do carry their behavior — acceptable. Sub-elements (queue pips, ghost card, ammo badge overhang, chamfer mark) are specced inside their parent rows.

### Findings

- **medium** Nameplates carry personal color per the propagation rule ("own hull, nameplate, small ownership accents") but have no visual spec anywhere — no font, size, offset, or fade rule, and no Components row (DESIGN.md · Regatta Hoist · Propagation; no corresponding row in Components). *Fix:* add a Nameplate row (likely `{typography.hud-micro}` register) or fold it into an existing row explicitly.
- **medium** The HP Rail spec contradicts its only mock — the composite still shows the horizontal 260×10 bar it replaced — and placement is [ASSUMPTION]-tagged pending a key-screen re-render (DESIGN.md · Components, HP Rail row; EXPERIENCE.md · HUD table, bottom-right row). Spines-win covers the conflict mechanically, but a load-bearing HUD element resting on an unconfirmed facilitator interpretation is a real downstream risk. *Fix:* re-render and confirm with Eric before architecture consumes the HUD anatomy; until then the double-flagging is correct.
- **low** The home "status line" (server status, "CONNECTION FAILED — …" reporting) and the callsign field have behavioral rules but no visual spec (EXPERIENCE.md · IA + Component Patterns, Primary Button; absent from DESIGN.md · Components). *Fix:* one row or one sentence each — register, color, placement — or an explicit "as rendered in home-class-picker-1.html" citation.
- **low** Countdown ("MATCH STARTING" + big center count) and the waiting-room "WEAPONS SAFE" tag have no type/color spec (EXPERIENCE.md · IA, Countdown/Waiting rows). *Fix:* one line naming the register (e.g. mono uppercase, phosphor, size class).

## 4. State coverage — strong

Walked every IA surface. Covered: home cold-load (live ambient CIC canvas, never blank), connection failure (status line, never a dead screen), mid-match disconnect (banner + return home), waiting/weapons-safe, countdown, all seven hotbar slot states including denied ("never silence"), own-HP thresholds + pulse, banked 0/≥1/open/spend-in-flight, ring phases incl. final-10s pulse and in-storm treatment, death → reveal → results → re-queue, empty kill feed / zero kills as absence, resize (fog rebake). Denied/error/empty/cold each have real answers.

### Findings

- **low** Color-preference contention has a resolution rule but no feedback moment — a player who picked Rose and drew nearest-free-hue is never told; they presumably discover it on their own hull (EXPERIENCE.md · Component Patterns, Color Hoist). *Fix:* one line — where (waiting room nameplate? toast?) the granted color is first surfaced.
- **low** Refit spend failure (server rejects or times out mid-flight) is unspecified beyond the in-flight latch dimming cards (EXPERIENCE.md · State Patterns, Banked levels). *Fix:* state the failure behavior (latch releases + denied pulse register, or declare server-authoritative retry out of UX scope).

## 5. Visual reference coverage — strong

All seven `.working/*.html` mocks are linked inline at their relevant sections with what each illustrates: class-silhouettes-1 (ratified silhouette board), home-class-picker-1 (locked home + class layer, linked from both spines), hotbar-blend-DB-1 (slots + tooltip), hotbar-directions-1 (explicitly "superseded"), hud-composite-1 (full HUD, "ratified pretty good," linked from both spines, with the blip-scale artifact caveat), ship-color-system-1 (explicitly "not chosen"), spend-window-1 (refit cards). `imports/DESIGN-v0.16-root.md` is linked as foundation with the reconciliation ledger (`reconcile-design-v016.md`) cited. Spines-win-on-conflict is stated in each spine's header. No orphan mocks; no unspecific references. (The four `.working/extract-*.md` digests are process inputs cited by the decision log, not visual references — correctly unlinked.)

### Findings

- (none)

## 6. Bloat & overspecification — strong

Both files are dense but nearly every sentence traces to a decision-log entry; assumptions are tagged rather than smuggled. The 15-item Open Questions list earns its place — each item names an owner or a blocking condition. The 12 documented Regatta outline→fill pairs are load-bearing (ratified board values), and the remaining 8 are honestly marked as rule-computed. The hotbar state grammar appears in both files, but the split is disciplined: DESIGN carries visual values, EXPERIENCE carries triggers — duplication of intent, not of numbers. No speculative systems are specced (supply drops correctly get zero footprint).

### Findings

- (none)

## 7. Inheritance discipline — adequate

Pillar/guardrail names are verbatim ("information noise must never bury the hunt," "When deduction stops paying, fix it on the sensing side," "Frantic to Play, Light to Hold," "Silly Is Sanctioned," "legible phases," "Endgame Guarantee"). Class names match GDD exactly. Both known GDD conflicts (4-choice offer, heal) are flagged as GDD corrections rather than silently diverging — the correct pattern. The later decision (supply-drop ghost removed) correctly supersedes the earlier reserve-the-slot entry. All EXPERIENCE token references resolve to DESIGN. Rejected upstream ideas are listed with a do-not-reintroduce note.

### Findings

- **high** Two adopted GDD E6 features with UI surfaces are absent from the spine pair: **The Bounty (#47)** — kill leader periodically blooms on everyone's radar (a fog-of-war exception the sensor-presentation rules as written would forbid) — and the **Foghorn emote (#74)** — one button, audible on hull mics, so it needs a key binding and a listening-ring event (`.working/extract-gdd.md` §5/E6; no treatment in EXPERIENCE.md · HUD & Diegetic UI, Interaction Primitives, or Open Questions — the lone "grudge/bounty" mention is an allusion, not a spec). E6 is a "Heavy" UX epic; downstream would invent or drop these. *Fix:* spec both (bloom rendering + reserved key), or add them as owned Open Questions.
- **low** Whirlpools (GDD E4, "whirlpool feel") have no perception/feel treatment and no Open Question entry (`.working/extract-gdd.md` §4 World features). *Fix:* one Open Question line.
- **low** Mode naming drift: GDD says "Solo vs Bots" (E5), spine says "Solo vs AI" (matches the decision log's ledger triage) — but unlike the offer-size conflict, no GDD-correction note flags the rename (EXPERIENCE.md · IA). *Fix:* add it to the existing GDD-correction flag or align the name.
- **low** PvE drone tiers (common/uncommon/rare) have no visual language beyond greyscale + size; GDD is also silent, so this is unowned rather than conflicting (`.working/extract-gdd.md` §4 PvE). *Fix:* candidate Open Question entry.

## 8. Shape fit — strong

DESIGN.md hits the canonical spec order exactly: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts; frontmatter carries `name`, `description`, flat kebab-case `colors` with hexes, nested `typography`, `rounded`, `spacing`, `components` with `{path}` references. EXPERIENCE.md carries all the expected defaults (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, HUD & Diegetic UI, Game Feel & Juice, Key Flows, Responsive & Platform); a separate Input Schemes section is correctly collapsed into Interaction Primitives for a KB+M-only title. Invented sections earn their place: Inspiration & Anti-patterns (take/leave table with a named pacing anti-pattern) and Open Questions (the downstream handoff list).

### Findings

- **low** The ship-class silhouette language lives as a subsection of Colors, though its content is shape/identity (DESIGN.md · Colors › Ship-class silhouette language). Findable and internally coherent, but a consumer scanning Shapes for silhouette rules will miss it. *Fix:* a one-line pointer under Shapes, or relocate the subsection.

## Mechanical notes

- **Cross-refs:** all 36 `{path.to.token}` references across both files resolve; all relative links (peer spine, imports/, reconcile ledger, 7 mocks) point at existing files. No broken references found.
- **Names:** component names are identical across DESIGN.md frontmatter keys, DESIGN.md Components rows, and EXPERIENCE.md Component Patterns (kebab frontmatter ↔ Title Case prose is consistent throughout). One upstream name drift: "Solo vs AI" (spine, per decision log) vs "Solo vs Bots" (GDD E5) — see 7.
- **Frontmatter:** DESIGN.md is spec-complete plus provenance extras (status/project/created/updated/sources). EXPERIENCE.md carries title/status/project/dates/design_reference/sources. Both are `status: draft` — flip to final at sign-off.
- **Minor literals:** `#030605` restated in the Hotbar Slot row (see 2); `hud-micro` frontmatter says 9px while the body table says 9–10px (body is the range, frontmatter the floor — harmless but worth one word of reconciliation).
- **Honest-flag inventory:** [ASSUMPTION] tags appear on HP Rail placement, banked-chip zero-state, the 8 computed Regatta fills, journey beat wording, floor viewport 1366×768, and the low-HP blend — each carries its source and pending-confirmation status. This is the correct pattern; none is smuggled as fact.
