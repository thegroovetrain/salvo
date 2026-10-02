# Accessibility Review — Hullcracker.io UX Spines (v3 re-run, 2026-09-11)

> **SCOPE OF THIS RUN.** This overwrites the 2026-07-16 review. It audits the **v3 update** (E8 The Deck + E9 The Account, `.decision-log.md` § Update 2026-09-10 onward) against the spine's OWN accessibility floor as it now stands (EXPERIENCE.md · Accessibility Floor, L168–194): dual-coding for class / threat / state meaning with the individual-identity waiver; audio-visual redundancy with the type-level `TONE_TWINS` guarantee; the photosensitivity caps (≥2 s breathing, 80 ms / ≥300 ms one-shots, 1.1 Hz vignette + HP, 1 Hz ring, the 3×/s aggregate budget) and the motion setting's law *"off removes motion, never information"*; UI scale 90 / 100 / 125 with the 9 px post-scale mono floor; the family-distinct CVD assist; fixed bindings; hold/toggle refit out (Tab toggles).
>
> **Prior findings are NOT re-raised where the spine now resolves them.** The 2026-07-16 run's 30 findings are dispositioned in §0 below; only the ones still open are carried, tagged `[pre-existing]`. Everything else here is `[v3]`. Contrast is computed per the WCAG relative-luminance formula against the actual surface each element sits on (`panel #0A0F0D`, `panel-deep #070B0A`, `fog-base #020604`, the globes' `rgba(3,6,5,.7)` bed), with translucent strokes and dimmed cards blended to their effective colour first. Mock references cite the promoted files `mockups/hud-composite-3.html`, `mockups/countdown-results-1.html`, `mockups/shipdeck-1.html` by CSS selector and line. Severity = downstream impact on what would be built. Where a concern is a design question Eric has not ruled, it is marked **needs a ruling** rather than answered here.
>
> Reviewer: adversarial accessibility lens, 2026-09-11. The device premise restated on 2026-08-21 (reference MacBook Pro 16,1; the 1366×768 floor viewport survives independently) is unchanged and inherited.

## Overall Verdict

The v3 spine does the dual-coding work in the text — every new state names its non-colour channel in one place (EXPERIENCE.md L172), the copies rail is three-way coded by fill + hue, the tier ramp always carries its Roman numeral, greyed and locked cards carry a word and a glyph, and the anonymous Ship & Deck screen's *"absence by capability, never by layout"* is exactly the right posture for assistive technology. The photosensitivity floor is untouched and the new animated channels are breathing or progress readouts, not flashes.

But three of the four ratified key-screen geometries **contradict the floor the same documents state**, and the fix in each case moves numbers Eric has already ratified *"as rendered"*: (1) the collection grid reuses the refit card at scale 0.6, which puts every stat label at 5.4 px and the kind word at 6 px on a DOM surface that, by rule, follows browser zoom rather than UI scale — the deckbuilder's whole middle pane is below the 9 px floor by construction; (2) the ratified HUD ships five mono sizes under that floor (tier numeral 8, `HDG` 8, `KTS` 7, W/S/A/D 7, tile pip labels 8); (3) the bar now dims to 38 % while the refit window is open — which was harmless when the bar was only slots, and now dims the HP globe and a helm that stays live, to ≈3:1. Beyond geometry, the largest DOM surface the game has ever had (≈200 press-then-confirm rungs, steppers, a custom dropdown, a rename text input, a destructive `×`) has no keyboard, focus or accessible-name spec at all, and the shipped DOM carries zero ARIA — v3 widens a pre-existing gap into a load-bearing one.

**Verdict: CONDITIONAL PASS — the floor is specified for every new state, and the ratified mocks violate it in three places that need Eric's re-cut, not an implementer's guess.** 1 critical, 10 high, 15 medium, 7 low findings.

---

## 0. Disposition of the 2026-07-16 findings

| Prior ID | Disposition | Where |
|---|---|---|
| 2.1 CRITICAL identity colour-alone | **Waived, informed** — Eric accepts the trade; the floor still binds class/threat/state/drone (EXPERIENCE L172; DESIGN L212). Not re-raised. | — |
| 1.1 CVD assist undesigned | **Resolved** — family-distinct ~8-family regroup + `assistMinAlpha` 0.35 + acceptance test (EXPERIENCE L180; DESIGN L214) | — |
| 1.2 / 3.1 sound map absent | **Resolved, structurally** — `TONE_TWINS` exhaustive over `AudioCueId` at the type level (EXPERIENCE L173). v3's new cues are walked in §3. | §3 |
| 1.3 motion scope vague | **Resolved** — tiers full / reduced / off enumerated; reveal zoom not exempt (L178). v3 adds channels the enumeration does not cover — §5. | §5 |
| 1.4 / 6.2 remapping | **Open `[pre-existing]`** — deferred post-beta; the recorded reason (no accounts) is stale under v3 and needs a fresh one (EXPERIENCE L164, register #19). Carried as 6.7. | §6 |
| 1.5 / 7.2 UI-scale scope | **Resolved** — Pixi HUD + DOM HUD elements scale; port chrome follows browser zoom (L179). The v3 consequence of that split is 7.2. | §7 |
| 1.6 settings table | **Resolved** — L183–190. | — |
| 2.2 selected = hue+glow | **Resolved** — inset wash + filled key chip named as the channel (DESIGN L276). | — |
| 2.3 drone colour-alone | **Resolved** — chevron silhouette + rank ticks (register #24). | — |
| 2.4 blip age luminance-only | **Resolved** — assist raises the decayed-alpha floor. | — |
| 2.5 storm edge | **Resolved** — dashed telegraph, readout-brightness edge. | — |
| 2.7 telegraph glyphs | **Resolved** — hollow rung vs solid needle, carried onto the helm globe (DESIGN L292). | — |
| 3.2 listening ring type-coding | **Overtaken** — the ring is DEFERRED and never shipped; the foghorn chevron carries bearing + band. Not re-raised. | — |
| 3.3 foghorn absent | **Resolved** — `F`, chevron twin. | — |
| 3.4 denied tone future | **Resolved** — `denied` is a `ToneId`. | — |
| 3.5 volume / mono | **Resolved** — L181, L188–189. | — |
| 4.1 / 4.3 / 4.4 text-muted | **Resolved** — token lightened to `#7A8496` (5.1:1 on panel); connective text → secondary. | — |
| 4.2 Regatta hue text | **Resolved** — cycle-125 wheel, algorithmic `textSafe()`. | — |
| 4.6 storm graphic 2.87:1 | **Resolved** — edge stroke at readout brightness. | — |
| 5.1 HP pulse uncapped | **Resolved** — 1.1 Hz hard cap. | — |
| 5.2 aggregate budget | **Resolved** — L174. v3's tenths numeral tests it — 5.2 below. | §5 |
| 5.3 / 5.4 | **Resolved** — 1 Hz stated; ms not frames. | — |
| 6.1 hold-CTRL / Sticky Keys | **Resolved** — Tab toggles. The Sticky Keys hazard returns on Shift and is ACCEPTED by ruling (register #41) — recorded, not re-raised. | — |
| 6.3 9 px × 90 % | **Resolved as a RULE** (no mono below 9 px post-scale, DESIGN L247) — and then violated by the v3 mocks; that is 4.1 / CRITICAL 4.2, not a re-raise. | §4 |
| 6.4 offers never expire | **Resolved** — explicit guarantee (L86, L194). | — |
| 7.1 125 % at the floor | **Resolved** — 125 % gated to ≥1600 px. The v3 layout arithmetic at 125 % is unstated — 7.1 below. | §7 |
| 7.3 150 % tier | **Open `[pre-existing]`** — deferred post-beta (register #18). Not re-raised. | — |

---

## 1. Commitment Coverage — does each v3 surface have spec, or just mention?

| Surface (v3) | Dual-coding | Audio twin | Motion | Keyboard / AT | Text floor |
|---|---|---|---|---|---|
| HUD bar (globes, slots, belt, strip) | **Specced** (L172) | Inherited | **Unstated** for the wipe / drain / ring (5.1) | n/a (Pixi) | **Violated** (4.1) |
| Refit card v3 face + greyed | **Specced** | `fit*` inherited | — | 1–4 only; tooltip hover-only by ruling (6.1) | Foot word fails (4.3) |
| Countdown auto-open + REDRAW | Partial (pip) | **Unnamed** (§3) | Row lift 44 px unstated (5.6) | REDRAW has no key (6.3) | — |
| Results LOADOUT | Numeral + ramp | n/a | — | Modal inherits | **Violated** at .72 (4.5) |
| Ship & Deck screen | Rail + tile specced | Port cues unnamed | — | **Unspecified** (6.2) | **CRITICAL** at .6 (4.2) |
| Deck dropdown / ✎ / × | ✓ in menu | — | — | × has no confirm (6.4); names unnamed (6.5) | — |
| Account chip / sign-in / DELETE ACCOUNT | — | — | — | OAuth focus unstated (6.6); confirm ✓ | — |
| Match history | `[ASSUMPTION]` | — | — | **Unreviewable** (6.8) | — |
| On-water: decoy / smoke / chaff / shield | **Specced** (hue, shape) | Partial (§3) | Exempt-by-nature, say so (5.4) | n/a | — |

### Findings

**1.1 — MEDIUM — `[v3]` The floor's v3 sentence names the channels but not the two rules the new channels need.**
*Location:* EXPERIENCE.md L172 (dual-coding), L174 (photosensitivity), L178 (motion tiers).
L172 is good — it enumerates every new state's non-colour channel in one place. But the v3 additions introduce a class of animation the floor never had — **continuous progress readouts** (cooldown wipe on up to five slots, held-fire drain, shield ring thinning, XP strip fill) — and the motion setting's enumeration (L178: shake, camera motion, pulse/flash intensity) does not mention them, while the attention table only carries an `[ASSUMPTION]` that they take no tier (L120). Two sentences close this: whether a progress readout is "motion" under `off` (5.1), and that it takes no attention tier (ratify the assumption).

---

## 2. Dual-Coding Walk — every NEW meaning-carrying colour and its non-colour channel

| Signal (v3) | Colour | Non-colour channel in spec | CVD read (deutan/protan/tritan) | Verdict |
|---|---|---|---|---|
| Cooling slot | dark overlay | conic geometry (elapsed fraction) + centred seconds numeral (DESIGN L134, L278) | luminance + text | pass |
| Held fire (machine gun) | amber outline + amber fill `.16` | fill height along the floor + 1 px amber top edge (L276; mock `.slot.firing .pool` L107) | the `.16` fill computes to **1.35:1** — invisible; the **1 px waterline** (11:1) is the real channel | **2.6** |
| Selected vs held-fire | both amber outline | selected = inset wash + filled chip; held = floor fill + waterline | shape differs, hue identical | pass, name it (2.6) |
| Stocked belt slot | phosphor outline | `×n` ammo badge count (text) | text | pass |
| Depleted belt slot | dashed slate | *"empty is empty"* — identical to never-stocked (register #38) | — | pass; cognitive residue 6.9 |
| Empty weapon slot | dashed slate | dashed border + `—` glyph | shape | pass |
| Greyed refit card | opacity `.55` | reason word (boxed) + dashed hollow key chip (L283) | word + chip shape | pass in principle; **the word fails contrast — 4.3** |
| Locked deck card | opacity `.45` + grey icon | lock glyph on the rail (L302) | glyph shape | pass in principle; **glyph at 1.9:1 — 4.4** |
| Copies rail: unowned / owned / in-deck | hollow / silver `.42` / phosphor | **fill** (hollow vs filled) + hue; silver-vs-phosphor luminance gap 5.4:1 (L303, EXPERIENCE L112) | hollow vs filled is shape; silver vs phosphor survives every CVD type on luminance alone | **pass** — the one place v3 gets three states without leaning on hue |
| Copies rail: pressed (awaiting confirm) | amber edge + `.22` fill + glow | `⬢ n` price text appears beside the rung; rail edge glows | amber vs phosphor collapse under deutan (1.29:1 luminance), but the **text** is the channel | pass; note the `.22` fill is 1.55:1 — the edge + text carry it |
| Tier ramp I–V | phosphor / info / storm-readout / denied / amber | Roman numeral: card `II → III` (L283), slot corner (L276), LOADOUT line (L313); on the card also the 5-rung ladder's lit count (position) | IV red vs V amber vs I green collapse under deutan — numeral always present | **pass** — but the slot corner numeral is 8 px (4.1) |
| Shield up | phosphor ring on the HP globe | a second phosphor ring around the own hull (L288; EXPERIENCE L224) | both halves are **rings**; the idle globe already wears a phosphor `.35` ring (mock L277); no numeral | **2.1** |
| Class tile selected | personal-hue outline + glow, silhouette fill, name/pips in hue (DESIGN L155, L300; mock `.ct.on` L183) | the 14 px swatch dot top-right (`.swd` L185) appears on the selected tile only; silhouette fill vs linework | dot + fill are shape channels | pass, **name the dot as the channel** (2.4) |
| Class tile hover / keyboard highlight | hairline lifts to silver (INVENTION) | — | — | **2.4** — no keyboard-highlight state exists |
| Deck legality failing count | `denied` red on `39` | the number itself (39 ≠ 40) + SAVE unlit | text | pass |
| Dropdown selected deck | personal hue | `✓` mark (log L128 inset) | glyph | pass |
| Decoy buoy | owner's hue | a placed-object silhouette like a mine (register #35) | shape | pass (same waiver as mines) |
| Smoke screen vs wounded smoke | both grey | SHAPE — trail of discrete expanding puffs vs plume off a hull (L226) | shape | **pass, and explicitly ruled that way** — credit |
| Chaff fakes | phosphor blips | none — wire-indistinguishable BY DESIGN | — | pass (the absence of a tell IS the mechanic) |
| Account chip `LV 7 · 2 ⬢` | phosphor | text | text | pass; AT name 6.5 |

### Findings

**2.1 — HIGH — `[v3]` SHIELD BLOCK's two halves are the same modality, the globe already wears a phosphor ring at rest, and *"the number"* is never rendered as a number.**
*Location:* DESIGN.md L141 (`shield-ring`, widths `[OPEN — not mocked]`), L287 (HP globe: *"a phosphor `.35` outer ring"*), L288; EXPERIENCE.md L81, L224; decision log L113 (*"BOTH"*); mock `hud-composite-3.html` L277 (`<circle … stroke="rgba(0,255,136,.35)"/>` — the idle ring).
Eric ruled BOTH halves — a ring on the globe *"(the number)"* and a ring on the hull *"(the glance)"* — and the spine files that as dual-coding (L172: *"shield = globe ring + hull ring"*). But two rings are one channel (a ring), and the globe's shield ring has to be told apart from the ring the globe ALREADY wears idle: with widths OPEN, the only thing left to separate "shielded" from "not" on the globe is stroke width and brightness — a luminance-only read on a 96 px circle in peripheral vision, during exactly the fight the shield was popped for. Nothing prints the remaining absorb as a numeral, so *"the number"* is an interpretation of ring thickness. Every other own-vitals fact on this HUD has a numeral (HULL n/n, seconds, HDG, KTS, `×n`).
*Fix — needs a ruling (it re-opens a ratified "BOTH"):* (a) give the shield a numeral — e.g. the globe readout's second line reads `SHIELD 64` while shielded (the HULL readout's own register, no new type); and/or (b) make the shield ring a distinct SHAPE from the idle ring (dashed, or a second concentric ring at a stated width) so "shield present" is a shape read, not a width read. Widths must not stay OPEN past the mock pass either way.

**2.2 — pass, recorded —** The copies rail is the best-coded three-state control in the system: hollow vs filled is shape, owned vs in-deck is a 5.4:1 luminance step that survives all three CVD types, and the pressed state adds text. Keep it exactly so; a future "tidy" that swaps silver for a second green would break it.

**2.3 — pass, recorded —** The tier ramp's five hues collapse under deuteranopia (I/IV/V) and the spine already refuses to let the hue stand alone: the numeral rides every instance and the card's rung ladder adds position. The one instance where the numeral is too small to do its job is the slot corner — a size finding (4.1), not a coding one.

**2.4 — MEDIUM — `[v3]` The class tile has a hover state (invented) and a selected state, but no KEYBOARD-HIGHLIGHT state — and the tile's non-colour selected channel is unnamed.**
*Location:* DESIGN.md L155 (`class-card` — `selected`, `unselected`, `hover [ASSUMPTION]`), L300; EXPERIENCE.md L45 (*"keys 1–3 / arrows highlight `[ASSUMPTION: the class layer's key map carries to the tiles]`"*); mock `shipdeck-1.html` L183–185 (`.ct.on`, `.swd`), tile HOVER labelled INVENTION.
The shipped class layer distinguishes *highlight* (arrows move it, Enter picks) from *pick* (`classSelect.ts:138–146`). The merged screen carries the key map by assumption but specifies only two visual states; a keyboard user stepping 1→2→3 has no defined focus ring, and at the same time the selected state's genuine non-colour channel — the swatch dot `.swd` that appears only on the selected tile, plus the filled silhouette — is never named as load-bearing, so an implementer may drop the dot as decoration.
*Fix:* One line each: "keyboard highlight = the hover treatment (hairline → silver) + a visible focus ring; selected = the filled silhouette + the swatch dot — the hue is secondary." Needs a ruling only on whether hover and highlight may share a look.

**2.5 — pass, recorded —** Smoke-vs-wounded-smoke by SHAPE and chaff-fakes-are-real-blips are both correct under the floor and both explicitly ruled (register #35). The decoy in the owner's hue inherits the mine's identity waiver.

**2.6 — MEDIUM — `[v3]` The held-fire fill is invisible; the 1 px waterline is the channel, and held-fire shares its amber outline with SELECTED.**
*Location:* DESIGN.md L132 (`heldFire: 'amber outline + amber fill draining along the slot floor'`), L276; EXPERIENCE.md L110; mock `hud-composite-3.html` L106–107 (`.slot.firing` identical to `.slot.sel`; `.pool` `rgba(255,184,0,.16)` + `border-top:1px solid var(--amber)`).
Amber at `.16` over fog blends to `#2B2304` — **1.35:1** against the water, so the "fill draining" reads as nothing; what actually moves is the 1 px full-amber top edge (11:1), which the spec mentions only parenthetically. Meanwhile the slot's outline/glow/inset for held-fire is byte-identical to SELECTED in the mock, so on the E slot (which is selected while you hold), "held" vs "selected" differs only by that 1 px line. That is survivable, but the spec should say the waterline IS the readout and set its weight (2 px would match the amber needle's), rather than describing an alpha fill nobody will see.

---

## 3. Audio-Visual Redundancy Walk — every cue v3 implies, and whether the spine names its twin

The spine's guarantee is structural for anything added to `ToneId` (EXPERIENCE L173; `client/src/audio/twinMap.ts`). The walk below is therefore about (a) which v3 events the spine says will get a cue at all, (b) whether the twin is named in the spine rather than left to the implementer, and (c) the reverse direction — combat-critical VISUALS that have no audio.

| v3 event | Cue implied by spine? | Visual twin named in spine? | Verdict |
|---|---|---|---|
| Level-zero offer auto-opens (countdown) | not stated | the window itself (L54) | fine — the surface is the twin |
| REDRAW pressed | not stated | four new cards + the pip fills (L310: *"hollow = unspent"* implies filled = spent) | twin exists; cue **unnamed** |
| Weapon tier I lands in an EMPTY slot | `fit*` family inherited (L240: *"the biggest such moment"*) | *"the square fills, its arc exists"* (L240) | ✓ |
| Consumable STOCKS a belt slot | toast copy *"consumable stocked"* (DESIGN L160) implies one | badge `×n` up + toast (L82, L160) | ✓ (cue unnamed but the `fit*` tone is the obvious carrier) |
| Consumable USED (HULL REPAIR) | `heal` inherited | HP globe jump + count down | ✓ — but `TONE_TWINS.heal` prose names the DAMAGE CONTROL rail and the HP RAIL, both retired (3.2) |
| SHIELD BLOCK up | not stated | globe ring + hull ring (L224) | cue **unnamed** |
| SHIELD absorbs a hit | not stated | ring thins; **no shake, no `damage` thud** (damage reads 0 — L224) | **3.3** — the only cue is a ring getting thinner |
| SHIELD expires / depleted | not stated | ring gone | cue **unnamed**; "gone" is an absence read |
| SMOKE SCREEN laid | not stated | puffs astern (L226) | twin ✓; cue unnamed |
| CHAFF burst | not stated | **nothing** — *"no 'chaff active' HUD readout — nothing about it rides the wire to the owner"* (L217); the belt count ×1→×0 is the only own-side change | **3.4** |
| DECOY BUOY dropped | `placeBuoy` inherited (radar buoy deleted — the tone's referent moved) | buoy topmark in owner hue | ✓ if the `placeBuoy` row is re-pointed (3.2) |
| DECOY hit / destroyed (owner) | not stated | owner-only HP readout `[OPEN — not mocked]` (DESIGN L298) | **unspecified both ways** |
| Machine-gun out-of-arc | `denied` ×1 then silence (L158) | 80 ms pulse ×1 (L110) | ✓ — and deliberately not repeated; fine under the budget |
| Key on an EMPTY slot | `denied` (L108) | pulse on the dashed slot | ✓ |
| Card GREYED (SLOTS FULL) | **no cue, no pulse** by ruling (L108) | word + hollow chip | ✓ — silence is the ruling; the visual is the whole signal |
| Shift boost fires | not stated (activation is *"instant"*) | slot → cooling wipe | twin ✓; cue unnamed |
| Copy bought / line unlocked (port) | not stated | rung fills silver | cue unnamed — port surfaces have never had tones; state whether the port stays silent |
| Deck SAVED | not stated | SAVE unlit→? **no confirmation state** is specified — the button simply stops being illegal | **3.5** |
| Sign-in completes | not stated | account chip appears (L281) | twin ✓ |
| DELETE ACCOUNT | not stated | settings danger-row confirm (shipped machine) | ✓ |
| `LEVEL UP` cue line | `point` inherited | `TAB TO REFIT` (the `LEVEL UP —` words dropped, L84) — `TONE_TWINS.point` names the old copy | 3.2 |

**3.1 — pass, recorded —** The guarantee holds where it is structural: no `ToneId` can be added without a non-empty twin string. The spine's sentence *"the count MOVES with v3's new cues; every one still lands with a twin"* (L173) is honest about being a promise for cues not yet minted.

**3.2 — MEDIUM — `[v3]` Three `TONE_TWINS` rows will describe retired surfaces the day E8 lands, and the test only pins non-empty.**
*Location:* `client/src/audio/twinMap.ts` rows `heal` (*"the HP rail … the DAMAGE CONTROL rail going inert"*), `point` (*"LEVEL UP — TAB TO REFIT"*), `placeBuoy` (the radar buoy); EXPERIENCE.md L173 (*"a reviewer can go look at it"*).
The table's whole value is that each row names a real surface. Under v3 the heal twin is the HP GLOBE and the belt count, the point twin is `TAB TO REFIT` at the strip's tail, and `placeBuoy` fires for the DECOY. Not a spine defect — but the spine should carry one line obliging E8 to re-point every row whose surface it retires, or the "map for humans" quietly lies.

**3.3 — HIGH — `[v3]` A shielded hit produces no shake, no thud and no flash — the only feedback that your shield is being eaten is a ring thinning on a 96 px globe you are not looking at.**
*Location:* EXPERIENCE.md L224 (*"a shooter's Hit Call fires, the victim-private damage reads 0"*), L230 (shake on own damage, `damage` thud), L81; DESIGN.md L288.
The reverse clause of the floor — *"and vice versa for combat-critical events"* (L173) — is exactly this case. Damage feedback is the game's loudest own-state channel (shake + thud + vignette + HP drop), and the shield silences all four for the 100 hp it absorbs. A player watching the water learns the shield is gone when the NEXT hit shakes the screen. Journey C beat 5 (L285) narrates the ring thinning *"as the fish lands"* — the persona is looking at the globe; a real player is looking at the Torpedo Boat.
*Fix — needs a ruling:* a shield-absorb cue (audio) twinned to a brief hull-ring flash on the water (within the 80 ms / 300 ms grammar) — the hull ring already exists (Eric's "the glance"), it just never moves; plus the shield-expire beat. Whether the shake should also fire at reduced amplitude is a feel call; the *existence* of some absorb feedback is the accessibility floor.

**3.4 — MEDIUM — `[v3]` CHAFF is the first consumable whose use gives its owner nothing but a decrement — and that is by ruling, so the twin must be stated as the count.**
*Location:* EXPERIENCE.md L217 (*"the owner never seeing their own, and no 'chaff active' HUD readout — nothing about it rides the wire to the owner"*), L80.
Defensible on the wire (an active-chaff flag would leak nothing, but Eric's *"you have a tendency to add info no one needs"* governs). For the floor, though, whatever audio cue chaff gets must be understood to twin ONLY the `×n` decrement — and the spec should say so, because an implementer reading *"every audio cue has a visual twin"* will be tempted to draw the fakes for the owner. Also record that with `motion: off` nothing changes here; there is nothing to remove.

**3.5 — LOW — `[v3]` SAVE has no saved state.**
*Location:* DESIGN.md L145 (`save: … .4 alpha unlit while illegal`), L304; EXPERIENCE.md L45.
Legal → lit; pressed → ? The spine never says what a successful save looks like (a toast? the button dimming again? the dropdown's name losing an unsaved mark?). A screen-reader or low-vision user has no confirmation the edit took. One line under THE COPY LAW: leave it empty and ask, but ask.

---

## 4. Contrast and Text Floor

Effective colours computed by blending translucent strokes and dimmed cards onto their real bed. Text requirement 4.5:1 (all v3 text is under 18.66 px bold); non-text UI components 3:1 (WCAG 1.4.11). Sizes are at 100 % UI scale, 1366×768, as the mocks are drawn.

| Element (v3) | Effective | Surface | Ratio | Req. | Verdict |
|---|---|---|---|---|---|
| Tier numeral `II`, slot corner — **8 px** | ramp hues | fog | 5.5–15 | 4.5 | contrast ok, **size fails the 9 px floor** |
| Helm `HDG` label 8 px, `KTS` suffix 7 px, W/S/A/D 7 px | `#7A8496` | globe bed `#030605` | 5.40 | 4.5 | contrast ok, **size fails** |
| Tile pip labels 8 px (`.ct .hp .l`) | phosphor | panel-deep | 14+ | 4.5 | contrast ok, **size fails** |
| Card stat label 9 px `#8B95A5` / value 11 px | — | panel | 6.38 / 16 | 4.5 | pass (at the floor) |
| Loot ramp as text on panel: III `#B06EE8` / IV `#FF3B3B` / II `#38BDF8` | — | panel | **5.74 / 5.47 / 9.02** | 4.5 | pass |
| Greyed card foot word 9 px/600 (`.rc.grey` `.55`) | `#8B95A5` @ .55 | `#060B09` | **2.70** | 4.5 | **FAIL** |
| Greyed card hollow key chip glyph | `#7A8496` @ .55 | same | **2.35** | 4.5 | **FAIL** |
| Greyed card stat values | `#E2E8F0` @ .55 | same | 5.30 | 4.5 | pass |
| Locked deck card name / kind / icon (`.rc.grey` `.45`) | @ .45 | `#080C0A` | **3.85 / 2.17 / 1.92** | 4.5 / 4.5 / 3 | **FAIL ×3** |
| Lock glyph (rail, `.rail.lk svg` t2) on a locked card | `#8B95A5` | panel-deep | 6.5 unfaded — but the CARD is at .45 and the rail is not: verify the rail is outside the fade | 3 | conditional |
| HUD dimmed 38 % while refit open: HULL numeral / HDG | `#E2E8F0` @ .38 | fog | **3.01** | 4.5 | **FAIL** (4.6) |
| same: phosphor LV / badge / amber needle | @ .38 | fog | 2.83 / 2.43 | 3 (graphic) | **FAIL** |
| Hollow rung hairline silver `.42` | `#555756` | panel-deep | **2.72** | 3 | **FAIL** (non-text) |
| Belt frame silver `.2` | `#282B2A` | fog | **1.43** | 3 | **FAIL** — see 4.7 |
| Key chip border `.55` | `#444B54` | fog | 2.31 | 3 | fail — but the digit inside is the chip |
| Slot idle outline silver `.28` / empty dashed `.45` | — | fog | 1.77 / 1.91 | 3 | fail `[pre-existing]` — the Afterimage register accepts this; the ready/selected states are what carry meaning |
| HP globe fill phosphor `.28` | `#024C2A` | bed | 2.01 | 3 | the 1.5 px waterline (15:1) carries the level — pass by the line |
| Cooldown numeral 18 px | `#E2E8F0` | wipe `.86` | 16.5 | 4.5 | pass |
| Ammo badge `×3` 10 px | phosphor | scrim | 14+ | 4.5 | pass |
| Pressed rung fill amber `.22` | — | panel-deep | 1.55 | 3 | the edge + `⬢ n` carry it — pass by text |
| SAVE unlit `.4` / stepper `.28` | — | panel-deep | 2.60 / 1.52 | — | disabled controls, exempt |
| Kill-leader `#F8118D` chrome / feed | — | fog | 5.30 | 4.5 | pass `[pre-existing]` |

### Findings

**4.1 — HIGH — `[v3]` The ratified HUD ships five mono sizes below the spine's own 9 px floor, and DESIGN.md writes three of them into the token table.**
*Location:* DESIGN.md L108 (*"9px is the floor"*), L245–247 (*"no mono type renders below 9px post-scale"*); L131 (`helm-globe … keys: … 7px mono muted`), L132 (`tier: '8px/600 mono numeral'`), L243 (HUD readout row: *"`HDG` label 8px muted · `KTS` suffix 7px muted"*), L155 (`class-card … 8px mono phosphor label`); mocks `hud-composite-3.html` L122 (`.tier … 8px`), L310–315 (`font-size="8"`, `font-size="7"` ×5), `shipdeck-1.html` L180 (`.ct .hp .l{font:8px`).
These are not scaled-down incidents — the spine states them as the values. The tier numeral is the ONLY tier readout on the HUD (the ramp hue is its partner, and §2 relies on the numeral being the CVD-safe half). `KTS` and the W/S/A/D chips are the helm's unit and keys. The rule and the numbers cannot both stand, and since the mocks are ratified *"YES THIS IS PERFECT!"*, an implementer will build the numbers.
*Fix — needs a ruling:* either (a) raise the five to 9 px (the globe has room: `KTS` at 9 and its suffix at 9 fit inside a 96 px circle; the tier numeral at 9 fits a 54 px slot corner; the tile's 56 px label column fits `TURNING` at 9 with the measured tracking), or (b) amend the floor to exempt named micro-glyphs — which the 2026-07-16 review already argued against for 10–15-year-olds and which Eric's own 2026-08-21 ARMOR ruling (a label overflowing 88 px) suggests he would not take. (a) is the one-line fix.

**4.2 — CRITICAL — `[v3]` The collection grid reuses the refit card at scale 0.6, which puts every stat label at 5.4 px, the kind word at 6 px and the name at 9 px — on a DOM surface that, by the spine's own rule, follows browser zoom rather than UI scale.**
*Location:* DESIGN.md L143 (`deck-card: face: '{components.refit-card} at scale ~0.6 (130×152 with its rail)'`), L302 (*"the RATIFIED refit card face reused verbatim … at scale ~0.6"*); EXPERIENCE.md L45 (*"all 29 lines as `{components.deck-card}` (the ratified refit face)"*), L179 (*"port chrome — the Ship & Deck screen … follows browser zoom instead"*); mock `shipdeck-1.html` L165 (`.grid .rcw{transform:scale(.6)}`), L73–75 (9 px labels, 11 px values, 9 px foot, all inside the scaled wrapper).
At 0.6: 9 px labels → **5.4 px**, 11 px values → **6.6 px**, 10 px kind word → **6 px**, 15 px name → 9 px, the 12 px tier numeral → 7.2 px, the `×n` copies count in the tier slot → ~7 px. The 9 px floor is the spine's answer to its own 2026-07-16 finding 6.3, and this pane — 29 cards, the surface Eric merged the class pick INTO so that *"a player can see what is in their current selected deck"* — is under it by 40 %. The two rescues the spine offers elsewhere both fail here: UI scale does not apply to port chrome (L179), and browser zoom applied to a fixed 1318 px layout at the 1366 floor overflows the viewport at 104 % (7.2). The rail's controls scale with it (6.11). Nothing in the collection is readable by anyone at the floor viewport, and it is worst for exactly the low-vision player the 125 % tier exists for.
*Why critical:* the fix is not a number — a card face that is legible at 130 px wide is a different face (fewer rows, or a two-line summary) than the ratified five-row refit card, and a legible card at ~0.8 scale (173 px) does not seat five wide beside a 236 px tile and a 280 px column at 1318 (5×173 + 4×17 = 933 > 718). Either the deck-card gets its own reduced anatomy (name · kind · copies rail — the rows are hoverable), or the grid drops to four wide and scrolls more, or the screen leaves 1318. All three touch what Eric ratified *"as rendered"*. **Needs a ruling before any E8 story is cut from this mock.** Note the deck column's own rows (13 px/600, `.dr .nm` L168) are fine — the column is legible; the grid is not.

**4.3 — HIGH — `[v3]` The greyed refit card's reason word — ruled as THE non-colour channel — is the least legible text in the system: 9 px/600 at 2.70:1.**
*Location:* DESIGN.md L138 (`greyed: 'opacity .55 + reason word + hollow key chip'`), L283 (*"the word is the non-colour channel"*); EXPERIENCE.md L86, L128, L172; mock `hud-composite-3.html` L177 (`.foot … 9px … color:var(--t2)`), L184–186 (`.rc.grey{opacity:.55}`).
Whole-card opacity is the wrong tool for a state that must keep one element legible: it dims the very word that was added so the dim would not be the only signal. `SLOTS FULL` at 9 px, 600 weight, `.24em` tracking, blended to 2.70:1 against the fogged water fails both the 4.5:1 text bar and the spine's *"text-muted … labels/captions only, uppercase mono ≥ 9px"* spirit — the word is load-bearing. The hollow chip's digit (2.35:1) is the second casualty.
*Fix:* dim the FACE (icon, name, rows) and keep the foot word and key chip at full opacity in `text-secondary` — the greyed state then reads as "dimmed card wearing a crisp label," which is also how the retired DAMAGE CONTROL rail did it (L284: *"prints the reason as a word"* on an undimmed row). No ruling needed — the ruling was "dim + reason word + hollow chip," not "dim the reason word."

**4.4 — HIGH — `[v3]` The locked deck card at opacity `.45` fails on every text and graphic it carries, including the lock glyph if it sits inside the fade.**
*Location:* DESIGN.md L143 (`locked: 'opacity .45 + the lock glyph'`), L302; EXPERIENCE.md L45 (*"unowned lines wear the locked grey face"*); mock `shipdeck-1.html` L76–77 (`.rc.grey{opacity:.45}`; `.ci{color:var(--t3)}`), L83–84 (`.rail.lk`).
Name 3.85:1, kind word 2.17:1, icon 1.92:1 — before the 0.6 scale of 4.2 is applied. Seven of 29 lines are locked in the signed-in mock; for an anonymous captain EVERY non-starter line wears this face (*"unowned lines wear the same grey face as a locked line"*, mock aside). The lock glyph is the non-colour channel for "locked" and must not fade with the card. Same fix shape as 4.3: dim the face to no lower than a value that keeps the name at 4.5:1 (≈ `.7` on panel), and keep the rail — lock, price, rungs — outside the fade entirely (the mock's DOM order may already do this; the spine should say it).

**4.5 — MEDIUM — `[v3]` The results LOADOUT block reuses the slot row at 0.72, putting its tier numerals at 5.8 px, badges at 7.2 px and key chips at 6.5 px on a WCAG-scoped modal.**
*Location:* DESIGN.md L140, L313 (*"at scale .72 (54→39px squares, belt 44→32) with the tier numerals on the absolute ramp in the slot corners"*); mock `countdown-results-1.html` L212 (`transform:scale(.72)`).
Same mechanism as 4.2 at a smaller surface and lower stake (the ladders line beneath it repeats the ship tiers at 11 px, so half the information has a legible twin; the weapon tiers do not). The fix is cheap: render the row at 1.0 (the modal is 620 px wide; 528 px fits) or render the numerals unscaled.

**4.6 — HIGH — `[v3]` The whole bar dims to 38 % while the refit window is open — which now includes the HP globe and a helm that stays live — leaving HULL at 3.01:1 and HDG/KTS the same, while the player is steering.**
*Location:* DESIGN.md L129 (`dimWhileRefitOpen: 0.38`), L275 (*"Dims to 38% while the refit window is open"*); EXPERIENCE.md L86 (*"the hotbar dims to 38% while open … the helm (W/S/A/D) stays live"*); mock `hud-composite-3.html` L136 (`.B-hud.dim{opacity:.38}`) applied to `.B-hud`, which contains both globes.
In the 2026-07-16 anatomy the 38 % dim applied to a bottom-left stack of four slots; own-vitals sat bottom-right and never dimmed. v3 moved HP and helm INTO the bar and the dim came along by inheritance, not by ruling. The refit window is explicitly non-blocking — *"refit trades attention for build progress"* — and the helm is live precisely so a player can keep sailing while reading; dimming the compass and the hull number to ≈3:1 during the one moment they have chosen to split attention is the opposite of that intent. It also dims the SELECTED amber and every ready outline below 3:1.
*Fix — needs a ruling:* dim the slots and belt (the elements the window is about to change) and leave both globes and the XP strip at full. The mock's `.dim` class would move from `.B-hud` to `.B-slots` + `.belt`.

**4.7 — MEDIUM — `[v3]` The belt frame — half of the pair that replaced the ability chamfer as the weapon/consumable distinction — is a 1.43:1 stroke; the hollow rung hairline is 2.72:1.**
*Location:* DESIGN.md L133 (`belt-slot: frame: '1px silver .2'`), L277 (*"the frame IS the weapon/consumable distinction (with the key chips)"*), L144 (`HOLLOW (silver .42 hairline)`), L265 (chamfer RETIRED); mocks `hud-composite-3.html` L144 (`.belt … rgba(192,192,192,.2)`), `shipdeck-1.html` L94.
The chamfer was a shape cut into the slot itself; its replacement is a group frame at one-fifth alpha that computes to 1.43:1 against the water — below even the spine's idle-outline register (`.28`). The key chips (digits vs letters) are the other half and are text, so the distinction survives — but only for a player reading chips, not for one glancing at the row. Raise the frame to the idle outline's `.28` minimum, or better the ready-state `.4` (3.03:1). The hollow rung at 2.72:1 is the "unowned" channel on ~100 rungs; `.5` silver reaches 3:1.

**4.8 — pass, recorded —** Every loot-ramp hue clears 4.5:1 as text on `panel` (III 5.74, IV 5.47 are the tight ones — do not darken either), `text-muted` clears on all three beds since the lift, the cooldown numeral's black shadow over the `.86` wipe is 16.5:1, and the ammo badge on scrim is excellent. The card's 9 px stat labels sit exactly at the floor, which is why 4.2's 0.6 scale is fatal rather than marginal.

---

## 5. Photosensitivity and Motion

Stated caps unchanged and inherited (EXPERIENCE L174; DESIGN L326). v3 adds no flash: the REDRAW pip is static, the countdown count changes at 1 Hz, chaff fakes are ordinary sweep paints, smoke puffs expand over 30 s, the bank chip breathes at 2.4 s. What v3 adds is a new CLASS of animation the motion setting's enumeration does not cover.

| v3 animated channel | Continuous? | Rate | Information or motion? | `motion: off` behaviour in spine |
|---|---|---|---|---|
| Cooldown wipe (up to 5 slots: gun, Shift, Q, E, R) | yes | one revolution per reload (5 s → 60 s) | information (elapsed fraction) — but the numeral already carries the same fact | **unstated** (5.1) |
| Cooldown numeral, tenths under 2 s | stepped | **10 changes/s** per slot | information | **unstated** (5.2) |
| Held-fire drain | yes | pool duration | information | unstated (5.1) |
| Shield ring thinning | yes | as absorbed | information | unstated (5.1) |
| XP strip fill | yes | slow | information | fine (never animates beyond fill) |
| Bank chip breathing (re-homed to the strip tail) | yes | 2.4 s | juice | shipped `xpRail.ts` carries no motion gate — verify on re-home (5.5) |
| Countdown row lift → drop (344 → 388 px at go-live) | one-shot | once | motion | **unstated** (5.6) |
| Chaff fakes appearing/rescattering per sweep | per sweep | 15 rpm | world | exempt by nature — it is the radar |
| Smoke puffs r40→60 u over 30 s | yes | slow | world | exempt by nature; say so (5.4) |
| Decoy / shield hull ring | static / thins | — | information | — |
| 72 px countdown count | stepped | 1 Hz | information | `[pre-existing]`, pass |

### Findings

**5.1 — MEDIUM — `[v3]` Whether a continuous progress readout is "motion" under `motion: off` is unstated, and the law *"off removes motion, never information"* admits two readings.**
*Location:* EXPERIENCE.md L178 (tiers cover *"directional screen shake, camera motion effects, and pulse/flash intensity"*), L120 (`[ASSUMPTION: the cooldown wipe, the held-fire drain and the shield ring are progress readouts, not attention channels]`), L244; DESIGN.md L134, L278.
Reading A: the wipe IS information, so it plays at every level. Reading B: the numeral carries the information, so at `off` the wipe may STEP (advance once per second, in lockstep with the numeral) or hold at the dim keyframe — motion removed, nothing lost. The hotbar already has the precedent for B (`hotbar.ts:519–546` — `slotSkin` at zero intensity is the `off` keyframe). Five simultaneous conic sweeps at the bottom of the screen is the largest continuous-motion surface the HUD has ever had; a vestibular-sensitive player who chose `off` should not get it. **Needs a ruling** on the reading; the reviewer's recommendation is B for the wipe (step at the numeral's tick) and the drain (step per round), with the shield ring exempt (it moves only on a hit).

**5.2 — MEDIUM — `[v3]` The tenths numeral changes ten times a second on up to five slots, which reads against the spine's own per-ELEMENT budget.**
*Location:* DESIGN.md L134 (`numeral: … tenths under 2 s`), L278; EXPERIENCE.md L105, L174 (*"no element or screen region flashes more than 3×/s regardless of how many compliant events stack"*); mock `hud-composite-3.html` L283 (`1.2`), foot-note L521.
An 18 px white digit that re-draws at 10 Hz is not a luminance flash in the WCAG sense (area far below threshold), so this is not a seizure-safety finding — but it is a 10 Hz changing element by the spine's own per-element rule, on the gun slot every 5 s all match, and on Shift, Q, E and R whenever they cool. A 5 s gun reload spends 40 % of its life in the tenths band. It is also distraction: the eye is pulled to a flickering digit 2 s before the gun is ready, when the useful moment is 0.
*Fix — needs a ruling (it moves a ratified number):* tenths only on the deck gun (whose 5 s reload is where the 1.2-vs-1.0 distinction matters), whole seconds everywhere else; or halve the cadence (0.2 s steps: 5 Hz); or drop tenths and let the wipe's last 20 % carry sub-second timing. Any of the three keeps *"the count moves"* true.

**5.3 — pass, recorded —** REDRAW's hollow pip is static; the greyed card *"never pulses"* by ruling; the machine gun's out-of-arc denial fires once then goes silent (a deliberately budget-respecting design — credit); the bank chip's 2.4 s breathe clears the ≥2 s floor; the HP globe inherits the 1.1 Hz cap by `[ASSUMPTION]` (DESIGN L287) — ratify the assumption so the globe cannot re-open finding 5.1 of the prior run.

**5.4 — LOW — `[v3]` World-space effects (smoke puffs, chaff repaints, decoy) are outside the motion setting by nature — the spine should say so once, so nobody wires `motion: off` into the radar.**
*Location:* EXPERIENCE.md L178, L217, L226. One clause: the motion setting governs HUD and camera; the water simulates.

**5.5 — LOW — `[v3, verify]` The bank chip's breathing has no motion gate in the shipped `xpRail.ts`; its re-home to the strip tail is the moment to add one.**
*Location:* DESIGN.md L137 (`bank-chip … animation: 'breathe 2.4s'`), L280; `client/src/render/xpRail.ts` (no `motion` reference; `hotbar.ts` gates its glows). Not a spine defect if the chip breathes at `off` as a ≥2 s glow — the floor permits it — but *"overrides every juice rule"* (L178) says it should hold at the dim keyframe. One line in the XP Strip row.

**5.6 — LOW — `[v3]` The card row's 44 px drop at go-live is a one-shot layout move; state whether it animates and whether `motion: off` snaps it.**
*Location:* DESIGN.md L251, L283; EXPERIENCE.md L54; mock `countdown-results-1.html` L153 (`.refit.cdn{top:344px}`). If it animates, it is camera-class motion under the tiers; if it snaps, say so — either is fine, silence is not.

---

## 6. Motor, Keyboard, Focus and Cognitive

**6.1 — HIGH — `[v3]` A consumable's card face carries numbers, not meaning; the only explanation is a hover-only tooltip with NO focus or key path (pinned by test); How-to-Play carries no catalog by rule; and the first contact is an auto-opened window under a 10 s clock.**
*Location:* EXPERIENCE.md L87 (*"NO activation wording, NO prose … Hover-only explanation stands"*), L194 (*"How-to-Play's UPGRADING section explains the mechanism … not a catalog listing"*), L49 (copy written at dev time, *"new-feature explanation goes here, never in-game"*), L54 (auto-open, 0:10); DESIGN.md L142, L283, L331 (*"Don't put explanatory wording on a card face"*); `client/src/ui/refitTooltip.ts:6–15` (*"HOVER ONLY, BY RULING … Nothing here observes a focus or key event, and __tests__/refitTooltipFit.test.ts pins that absence"*); mocks `hud-composite-3.html` L385–400 (HULL REPAIR: `HULL +50 NOW / +50 OVER 10 S` — legible), `countdown-results-1.html` L294–309.
HULL REPAIR's rows explain themselves. CHAFF's will read something like `FAKES 10 · RADIUS 120 U · DURATION 15 S`; SMOKE SCREEN `PUFFS · 5 S · 30 S`; DECOY BUOY `HP 50`; SHIELD BLOCK `ABSORB 100`; ACOUSTIC HOMING `STEER 0.5 RAD/S · ACQUIRE 120 U · RANGE 1300 U` (the ratified mock, L424–427). None says what the thing DOES — that fakes are radar blips, that puffs occlude sight, that the buoy eats torpedoes. Eric's own brain dump (log L90) is that *"players are just picking refits randomly rather than try to figure out which one is which"*; the ruling answered with stat rows, which fixes the ladders and does nothing for the five consumables and six add-ons. The hover tooltip is the whole cognitive floor for eleven of 29 lines, it is unreachable without a pointer (mouse is mandatory to play, so this is not a keyboard-only block — it is a discoverability and screen-reader block), and the countdown's REDRAW decision is the one moment it must be read under a clock.
*Fix — needs a ruling, two halves:* (a) accept the standing rule that How-to-Play is the only in-product explanation and **add a consumables/add-ons table there** (the L194 supersession was written when every line was a stat ladder; it is worth re-asking now that eleven lines are verbs); (b) leave the tooltip hover-only for the 1–4 shortcut (the ruling's reason is sound) but let it ALSO open on keyboard focus of a card — focus is not the shortcut, so the ruling's rationale is untouched, and the test pin would need amending. Neither adds words to the face.

**6.2 — HIGH — `[v3]` The Ship & Deck screen — the largest DOM surface in the game — has no keyboard model, focus order, or accessible-name spec, and the shipped DOM it extends carries zero ARIA.**
*Location:* EXPERIENCE.md L45 (the only keyboard statement: *"keys 1–3 / arrows highlight `[ASSUMPTION …]`"*), L33 (DOM layer), L166 (input capture rule is written for in-match); DESIGN.md L143–148, L302–307; mock `shipdeck-1.html` (29 cards × up to 5 rungs + `−`/`+` ≈ 200 pressable rungs, a custom `.dd` dropdown L104, `.ddx` ✎ × L106, SAVE, CONFIRM SELECTION, 20 hoist swatches); `grep -c "aria-|role="` over `settings.ts`, `results.ts`, `upgradeMenu.ts`, `home.ts` = 0 each, `classSelect.ts` = 1.
Not stated: (i) whether the grid's rungs are individually focusable (≈200 tab stops) or the card is the focus unit with arrows inside; (ii) how press-then-confirm works from a keyboard (Enter twice on the same rung? does focus moving cancel the armed price?); (iii) whether the dropdown is a native `<select>` (free accessibility) or a custom listbox (needs `role="listbox"`, arrow keys, type-ahead); (iv) what Enter does while the rename `<input>` has focus — the class layer's Enter ≡ CONFIRM SELECTION (`classSelect.ts:797`) and the home's Enter ≡ SOLO are both live one layer down; (v) whether typing a deck name with `1`, `2`, `3` in it re-highlights tiles (the shipped layer gates keys off while a text input is focused — inherit it, and say so); (vi) how the grid scrolls by keyboard when it is *"the only thing on the screen that scrolls"* and its bottom is under a 70 px fade. This is not a mock's job — but the spine has a keyboard row for every other surface (Interaction Primitives L144–162) and none for this one.
*Fix — needs a ruling on the focus unit; the rest is spec:* card-level focus with arrow keys across the grid and `+`/`−`/Enter within a focused card is the standard pattern (Hearthstone's collection is mouse-only; MTG Arena's is keyboard-navigable at the card level); a native `<select>` for the dropdown; Enter in the rename field commits the name and nothing else; ESC in the field cancels the rename before it closes the layer. Add the row to Interaction Primitives.

**6.3 — MEDIUM — `[v3]` REDRAW has no key, no `⏎` chip, and a 10 s life.**
*Location:* EXPERIENCE.md L54, L148–150, L160 (Enter bindings: home / results / class layer — none in match); DESIGN.md L139, L310 (*"No other explanation"*); mock `countdown-results-1.html` L181–185, L345.
Consistent with the key-chip truthfulness law — no key, no chip — but it makes the one time-boxed decision in the match mouse-only, while 1–4 (the picks) are keys. The helm is held during the countdown, so the left hand is free and a key costs nothing motor-wise. Either bind one (the spine's own candidate is `5`, freshly unbound and already in the refit family — *"`5` is unbound"*, L150) or record mouse-only as accepted. **Needs a ruling** (it is a binding).

**6.4 — HIGH — `[v3]` `×` deletes a named deck with no confirm, on a screen where BUYING a 1-token copy is press-then-confirm by ruling.**
*Location:* EXPERIENCE.md L45 (*"rename/delete"*), L52 (DELETE ACCOUNT *"with a confirm"*), L92; DESIGN.md L145 (`head: … × delete (16px mono muted)`), L146, L191 (`danger` token: *"Destructive actions"*); decision log L124, L128 (*"✎ rename and × delete as unlit affordances"*), L129 (*"Unlock press — RESOLVED: PRESS, THEN CONFIRM"*), L132 (*"press-then-confirm everywhere"*); mock `shipdeck-1.html` L106 (`.ddx` 16 px, `color:var(--t3)`).
A deck is up to 40 authored choices and a name; the `×` is a 16 px muted glyph 12 px from the `✎`; the shipped settings overlay already owns a two-press danger-row machine (`settings.ts:202–209`) in the `danger` register. *"Press-then-confirm everywhere"* was said about buying; the spine should extend it to the one genuinely destructive control on the screen — or Eric should rule that a deleted deck is recoverable (e.g. STARTER is never deletable and a deleted deck reverts the dropdown to it). Also unstated: what deleting the LAST deck for a hull does (the ruling says STARTER *"can be deleted"*).

**6.5 — MEDIUM — `[v3]` Glyph-only controls with no accessible names: `⬢`, `✎`, `×`, `−`, `+`, the lock, the swatch dot, the REDRAW pip, and every rung.**
*Location:* DESIGN.md L144–148, L303–307; the shipped hoist is the one precedent that does this right (`classSelect.ts:303` `aria-label` per swatch).
A screen reader announces "black hexagon 2", "lower right pencil", "multiplication sign". State the names once in the spine's component rows (`aria-label`: "2 tokens", "rename deck", "delete deck", "remove one copy from deck", "buy copy 3 for 1 token", "locked — buy copy 1 to unlock") and the pattern (`aria-pressed` for the armed rung) so the E8/E9 stories inherit them rather than invent them.

**6.6 — MEDIUM — `[v3]` The OAuth popup's focus return, popup-blocked fallback, and completion announcement are unstated.**
*Location:* EXPERIENCE.md L44 (*"sign-in is an OAuth popup (Google / Discord, no email scope)"*), L281 (Journey C: *"the Google popup closes and the home comes back with `LV 7 · 2 ⬢` by the gear"*).
Three standard questions for a popup sign-in, none answered: where focus lands when the popup closes (the `SIGN IN` row that opened it, or the chip that replaced it?); what the home shows when the browser blocks the popup (a status-line message in the `info`/`denied` register, or silence — the home already has the `CONNECTION FAILED` pattern, L89); and whether the chip's appearance is announced (an `aria-live` region on the status line covers both). The privacy paragraph (L50) is complete; the interaction is not.

**6.7 — MEDIUM — `[pre-existing, stale reason]` Key remapping stays deferred with a reason v3 itself retired.**
*Location:* EXPERIENCE.md L164, L176; register #19 (*"needs a fresh reason `[OPEN — Eric]`"*).
The spine says this about itself; carried here so the accessibility register holds it. Under v3 the binding surface grew (Shift, the digits' two meanings, F, Tab, 1–4 with Q/E/R all under the left hand) and the storage objection dissolved (settings are account-backed, L192). Not re-argued — just: the deferral needs its new reason before E9 closes the settings story.

**6.8 — LOW — `[v3]` Match history is unreviewable — every statement is `[ASSUMPTION]`.**
*Location:* EXPERIENCE.md L51. Listing rows in the kill-feed grammar, an empty history rendering as absence, entry from the account chip — all assumed. Nothing to find until Eric rules the surface; recorded so the next run does not read the silence as a pass.

**6.9 — LOW — `[v3, accepted]` *"Empty is empty"* — a depleted belt slot forgets what it held.**
*Location:* register #38; EXPERIENCE.md L107. Ruled; recorded, not contested. The residue: the digit that fired CHAFF ×1 last minute now fires nothing (denied pulse) and the slot shows no ghost of what it was. The slot tooltip could still name the last stocked line on hover without a glyph — an ask for Eric, not a finding.

**6.10 — LOW — `[v3, defer to input review]` The digits 1–4 spend a level with the window open and a consumable with it closed.**
*Location:* EXPERIENCE.md L149. Evaluated at keydown by window state, and the refit lockout suspends the belt — the design is sound. The cognitive cost (the same key, two irreversible spends) belongs to `review-input-scheme.md`; noted here only because the auto-opened countdown window trains the "1 = pick" reflex first.

**6.11 — HIGH — `[v3]` Motor targets on the collection grid: rungs 9.6×4.8 px, steppers 12 px, `✎`/`×` 16 px — under every target-size guideline, for press-then-confirm actions that spend currency.**
*Location:* DESIGN.md L144 (`rungs: 'one 16×8 rung'`, `control: '− / + (20px steppers …)'`), L143 (scale ~0.6), L145 (`16px mono muted`); mock `shipdeck-1.html` L94, L80, L106, L165.
At 0.6 the rung is a 9.6 × 4.8 px target with a 2.4 px gap to its neighbour; pressing rung 3 by mistake arms a `⬢ n` price for the wrong copy, and the second press spends it. WCAG 2.5.8 asks 24 × 24 CSS px (or 24 px spacing); the game's own key chips are 16 px and the hoist swatches 14 px — small, but those are 20 discrete circles on a row, not 200 rungs at 2.4 px pitch. The fix rides 4.2's re-cut: whatever the deck-card becomes, its rail must be at 1.0 scale (16×8 rungs, 4 px gaps are still tight — 20×10 at 6 px would clear the spacing exception), with the price confirm accepting only a press on the SAME rung (a press on a neighbour cancels rather than re-arms).

---

## 7. UI Scale and Zoom Reality

**7.1 — MEDIUM — `[v3]` Every v3 layout number is stated at 1366×768 @ 100 %; nothing is stated at 125 % on a ≥1600 px viewport, and the refit band's container-fit law has 8 px of slack.**
*Location:* DESIGN.md L251 (*"card row top 388 px live / 344 px during the countdown … 8 px between the row and the bar"*), L283 (*"v3: `row.y + 226 + 8 ≤ hud-bar top`"*), L129 (`hud-bar … 18px above the viewport floor`); EXPERIENCE.md L179 (125 % gated ≥1600 wide), L311.
At 1366×768 the arithmetic closes with 8 px spare (388 + 226 + 8 = 622 ≤ bar top ≈ 630). At 125 % the card is 282 px tall, the bar ≈ 150 px, and the REDRAW button needs its 30 px — on a 1600×900 viewport that works (900 − 18 − 150 − 30 − 8 − 282 = 412 ≥ the keep-out), but the spine does not say where the row top lands (a fixed 388, a fraction, or bar-relative?), and a 1680×768 viewport passes the ≥1600 gate and has NO room (768 − 18 − 150 − 8 − 282 = 310 < 384 keep-out). State the row's anchor rule as bar-relative (row bottom = bar top − 8) and gate 125 % on HEIGHT as well as width (≥900), or accept that the keep-out yields first.

**7.2 — MEDIUM — `[v3]` Port chrome "follows browser zoom" — but the Ship & Deck screen is a fixed 1318 px layer, so the low-vision path for the port overflows the floor viewport at 104 % and the spine states no reflow or scroll rule.**
*Location:* EXPERIENCE.md L179 (*"port chrome — the Ship & Deck screen … follows browser zoom instead"*), L312 (*"a layer over home at the class layer's 1318 px, not the 1100 chrome width"*); DESIGN.md L251.
1318 × 1.04 = 1371 > 1366. At 125 % browser zoom (the tier the game's own UI scale offers the HUD) the layer is 1648 px wide. The 1100 px chrome has 24 % headroom at 1366; this screen has 3.6 %. Either the layer reflows (the grid drops to 4 wide, the panes stack) — which contradicts nothing ratified, since the pane ORDER is what Eric ruled — or it scrolls horizontally, which is the one thing a DOM surface must never do. **Needs a ruling** in the same sitting as 4.2, because the answer to "what does a legible collection look like at the floor" and "what does it do at 125 % zoom" is one answer.

**7.3 — pass, recorded —** The hud-bar at 125 % is 987 px — fits every ≥1600 viewport with the chrome bar and kill feed clear of it. The countdown's 72 px count at 125 % (90 px) sits at y ≈ 150–250 above a 344 px row top and does not collide. The results modal's ≈735 px at 768 already scrolls under the shipped viewport cap (accepted by ruling).

---

## Severity Summary

| ID | Severity | Tag | Finding (short) |
|---|---|---|---|
| 4.2 | **Critical** | v3 | Collection grid reuses the refit card at 0.6 → 5.4 px labels / 6 px kind word on a browser-zoom-only DOM surface; the fix re-cuts ratified geometry (card face, 5-wide grid, 1318) |
| 4.1 | High | v3 | Ratified HUD ships five mono sizes under the 9 px floor (tier 8, HDG 8, KTS 7, W/S/A/D 7, tile pips 8) — and DESIGN.md states them as tokens |
| 4.3 | High | v3 | Greyed card's reason word (the ruled non-colour channel) at 9 px and 2.70:1 — whole-card opacity dims the label it exists to keep |
| 4.4 | High | v3 | Locked deck card at .45 fails name / kind / icon (3.85 / 2.17 / 1.92); the lock glyph must sit outside the fade |
| 4.6 | High | v3 | The whole bar dims to 38 % during refit — now including the HP globe (3.01:1) and a helm that stays live; the dim came by inheritance, not ruling |
| 2.1 | High | v3 | Shield = two rings; the idle globe already wears a phosphor ring; widths OPEN; no numeral — "the number" is a width read |
| 3.3 | High | v3 | A shielded hit silences shake, thud, vignette and HP drop — the only feedback is a ring thinning off-gaze; no absorb/expire cue |
| 6.1 | High | v3 | Consumable/add-on faces show numbers not meaning; explanation is hover-only with no focus path (test-pinned); How-to-Play carries no catalog; first contact is a 10 s auto-open |
| 6.2 | High | v3 | Ship & Deck screen has no keyboard/focus/AT spec (≈200 rungs, custom dropdown, rename input); shipped DOM has zero ARIA |
| 6.4 | High | v3 | `×` deletes a named deck with no confirm, beside a 1-token buy that is press-then-confirm by ruling |
| 6.11 | High | v3 | Rungs 9.6×4.8 px at 2.4 px pitch, steppers 12 px, ✎/× 16 px — currency-spending targets under every size guideline |
| 1.1 | Medium | v3 | The floor names v3's channels but not the two rules its continuous readouts need (motion reading, tier) |
| 2.4 | Medium | v3 | Class tile: no keyboard-highlight state; the swatch dot / filled silhouette not named as the selected channel |
| 2.6 | Medium | v3 | Held-fire fill at 1.35:1 is invisible — the 1 px waterline is the channel; held-fire shares SELECTED's amber outline |
| 3.2 | Medium | v3 | `TONE_TWINS.heal/point/placeBuoy` will name retired surfaces (HP rail, DAMAGE CONTROL rail, `LEVEL UP —`, radar buoy) — test pins only non-empty |
| 3.4 | Medium | v3 | CHAFF's only owner feedback is the `×n` decrement, by ruling — state the twin as the count so nobody draws the fakes for the owner |
| 4.5 | Medium | v3 | Results LOADOUT at .72 → 5.8 px tier numerals / 7.2 px badges on a WCAG-scoped modal |
| 4.7 | Medium | v3 | Belt frame (half of the chamfer's replacement) at 1.43:1; hollow rung hairline 2.72:1 |
| 5.1 | Medium | v3 | Cooldown wipe / held-fire drain / shield ring under `motion: off` — unstated; two readings of the law; recommend step-at-the-numeral |
| 5.2 | Medium | v3 | Tenths numeral changes 10×/s on up to five slots — against the spine's per-element 3×/s rule; 40 % of every gun reload |
| 6.3 | Medium | v3 | REDRAW has no key and a 10 s life — the one time-boxed decision is mouse-only while 1–4 are keys |
| 6.5 | Medium | v3 | Glyph-only controls (⬢ ✎ × − + lock rungs pip) have no accessible names; the hoist swatches are the precedent to follow |
| 6.6 | Medium | v3 | OAuth popup: focus return, popup-blocked fallback, completion announcement unstated |
| 6.7 | Medium | pre-existing | Remapping deferred on a reason v3 retired (register #19) — needs its fresh reason |
| 7.1 | Medium | v3 | v3 layout stated only at 1366×768 @ 100 %; 125 % row anchor unstated; 1680×768 passes the width gate with no room |
| 7.2 | Medium | v3 | Fixed 1318 px port layer under browser zoom (the port's only low-vision path) overflows 1366 at 104 % — no reflow/scroll rule |
| 3.5 | Low | v3 | SAVE has no saved state |
| 5.4 | Low | v3 | Say once that world effects (smoke, chaff, decoy) are outside the motion setting |
| 5.5 | Low | v3 | Bank chip re-home: shipped `xpRail.ts` has no motion gate — add one with the move |
| 5.6 | Low | v3 | The 44 px row drop at go-live: animated or snapped, and under `off`? |
| 6.8 | Low | v3 | Match history is entirely `[ASSUMPTION]` — unreviewable, recorded |
| 6.9 | Low | v3 | *"Empty is empty"* accepted; the depleted slot's tooltip could still name what it held (ask, not finding) |
| 6.10 | Low | v3 | Digits' two meanings — deferred to the input-scheme review |

**Totals: 1 critical · 10 high · 15 medium · 7 low.**

**Needs a ruling (Eric), in the order the E8/E9 stories will hit them:** 4.2 + 7.2 together (what a legible collection is at the floor and at zoom); 4.1 (the five sizes vs the floor); 4.6 (dim the slots, not the globes); 2.1 + 3.3 together (a shield numeral and an absorb cue); 6.1 (a consumables table on How-to-Play; tooltip on focus); 6.2 (the grid's focus unit); 6.4 (delete confirm or recoverability); 5.1 (the motion reading for progress readouts); 5.2 (tenths cadence); 6.3 (a REDRAW key); 6.7 (remapping's fresh reason).

**Positive findings worth keeping on the record:** the copies rail's three-state coding by fill + a 5.4:1 luminance step (2.2) — the best-coded control in the system; smoke-vs-wounded-smoke ruled by SHAPE and chaff ruled tell-less (2.5); the machine gun's one-denial-then-silence (5.3); the greyed card's *silent* refusal with a word instead of a pulse (the right call under the flash budget — it only needs its word un-dimmed); the anonymous Ship & Deck screen's *"absence by capability, never by layout"* (exactly what assistive technology wants — no disabled controls to trip over); every state's non-colour channel enumerated in ONE sentence of the floor (L172); and the type-level twin guarantee surviving v3 unchanged.
