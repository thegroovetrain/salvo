# Validation Report — Hullcracker.io (v3 update)

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/EXPERIENCE.md`
- **Run at:** 2026-09-11T16:43:16-04:00
- **Scope:** the v3 update (E8 The Deck + E9 The Account, `.decision-log.md` § Update 2026-09-10 onward) — Reviewer Gate: rubric walker + HUD legibility + accessibility + input scheme. This report replaces the 2026-07-16 pair; that run's findings were closed or superseded at the 2026-08-21 reconciliation and are dispositioned inside each reviewer file, not restated here.

## Overall verdict

Mechanically the pair is still extraction-clean: every `{path.to.token}` in both files resolves (58 distinct in DESIGN, 24 in EXPERIENCE), all 40 colour tokens carry hex, every mock is linked with what it illustrates and every superseded one is stamped, and each v3 surface has a frontmatter token and a DESIGN row. The update's real defect is method, not coverage: the spine now keeps every same-day interim ruling inline as strikethrough plus "SUPERSEDED … later the same day" chains, three and four layers deep inside single table cells and inside frontmatter token VALUES — the decision log is the record, the spine is the contract, and a consumer now parses history to find the live rule. Two contract-level gaps need an Eric call before E8/E9 stories are cut: the ratified bar specs 7/8 px mono type against the spine's own 9 px floor, and the Ship & Deck / account surfaces have no failure or edge states (unsaved edits at CONFIRM, cancelling a pressed rung, insufficient tokens, deleting the last deck, sign-in failure, the door-refusal surface).

The three adversarial lenses shift that picture from "two gaps" to five recurring roots, each raised independently by two or more reviewers. (1) **Sub-9 px type in ratified mocks** — five mono registers (tier numeral 8, `HDG` 8, `KTS` 7, W/S/A/D 7, tile pip labels 8) are written into the token table against the floor the same document states; the rubric, HUD and accessibility lenses all fail it, and because the mocks were ratified "YES THIS IS PERFECT!" an implementer builds the numbers. (2) **The 0.6 card scale** — the collection grid reuses the ratified refit face at ×0.6, which puts stat labels at 5.4 px and the copies rungs at 9.6×4.8 px on a DOM surface that follows browser zoom, not UI scale; the accessibility lens rates it the run's only critical because every fix re-cuts geometry ratified "as rendered", and the results LOADOUT at ×.72 is the same mechanism at a smaller stake. (3) **Interaction lifetimes unspecified** — every new v3 interaction (belt digit, held stream, decoy prime, countdown window, armed rung, REDRAW, sign-in popup) is stated at the moment it *starts* and silent about what *ends* it; the input lens's three highs are all of this class, and the state-coverage rubric category is *thin* for the same reason. (4) **The whole-bar dim under refit** — v3 folded the HP globe and a live helm into the bar and the 38 % dim came along by inheritance, not ruling, leaving the Tier-1 low-HP pulse at 1.10:1 during the one window the player is not watching the water. (5) **Supersession bloat from same-day interims** — 52 SUPERSEDED markers and 88 strikethrough runs, most for rulings that lived hours and were never built; the bloat category is *broken*. Nothing requires abandoning a ratified direction; every root is fixable at spec level, but twenty-three findings below are marked **needs an Eric ruling** because the fix moves a number or a rule he has already ratified.

**Counts.** Pre-merge: 110 findings across four reviewers (rubric 29 · HUD 22 · accessibility 33 · input 26) = 1 critical · 23 high · 43 medium · 43 low. After 19 cross-reviewer merges absorbing 24 duplicates: **86 findings = 1 critical · 17 high · 32 medium · 36 low.** Of those, 23 need an Eric ruling, 55 are spine fixes the facilitator can write (several as `[ASSUMPTION]` for redline), 4 are implementer details, 4 are accepted and logged. Eight HUD items are *unverified* (specified, shown in no mock) and are listed in the mechanical notes rather than counted. Tagging: 79 `[v3]`, 7 `[pre-existing]` (one Input finding carries a pre-existing half).

## Category verdicts

- Flow coverage — **adequate** — three journeys with protagonists and beats; Journey C (the compass audience, the account) is the only one without a failure path, on the surface with the most new failure modes.
- Token completeness — **adequate** — every reference resolves and every colour carries hex; the one internal contradiction is four frontmatter/typography values at 7–8 px mono against the stated 9 px floor.
- Component coverage — **adequate** — every v3 component has a DESIGN row; six have no Component Patterns entry and three surfaces (SIGN IN row, match history, door refusal) have behaviour with no visual spec.
- State coverage — **thin** — pre-existing coverage stands and the copies-rail rung table is good; the Ship & Deck screen and the account have no edge or failure states, and every one of them is a decision story-dev would otherwise make alone.
- Visual reference coverage — **strong** — nine mocks, all linked, all stamped; three low citation fixes.
- Bloat & overspecification — **broken** — the supersession-record method (52 markers, 88 strikethrough runs), ratification quotes in spec cells, 24 code line-number citations, numbers restated in three places.
- Inheritance discipline — **adequate** — pillar/guardrail names verbatim, reversals recorded as reversals; one GDD contradiction stated as settled (the activation channel) and no consolidated list of corrections owed upstream.
- Shape fit — **adequate** — canonical section order; `components` frontmatter values are sentences, `status: final` over 63 open tags, and a "resolved" register that contains its own supersessions.

## Findings by severity

Reviewer keys: **[Rubric]** review-rubric.md · **[HUD]** review-hud-legibility.md · **[A11y]** review-accessibility.md · **[Input]** review-input-scheme.md. Each entry carries its `[v3]` / `[pre-existing]` tag and a disposition: **needs an Eric ruling** · **spine fix** · **implementer detail** · **accepted / logged**. Merged entries name every reviewer that raised them; the first key is where the full entry sits in the HTML.

### Critical (1)

**[A11y 4.2 + HUD D1 + A11y 6.11]** — The collection grid reuses the refit card at ×0.6: every stat label lands at 5.4 px and the copies rungs at 9.6×4.8 px (§ A11y 4 Contrast; § HUD D Ship & Deck; § A11y 6.11 — DESIGN › Deck Card L143/L302; EXPERIENCE › IA L45, Responsive L179; `shipdeck-1.html` `.grid .rcw{transform:scale(.6)}`) `[v3]` · **needs an Eric ruling**
At 0.6 the verbatim refit face renders 9 px labels at 5.4, 11 px values at 6.6, the kind word at 6, the name at 9 (`.cn.long` 7.5), the tier numeral at 7.2; the rail's 16×8 rungs become 9.6×4.8 px with a 0.6 px hairline at 2.4 px pitch, steppers 12 px — DESIGN L144 still states "16×8" as though it survived the scale. Port chrome follows browser zoom rather than UI scale, so there is no scale rescue, and the 9 px mono floor carries no port exemption. The rung states hollow / silver `.42` / phosphor-lit — Eric's stated purpose for the collection ("indicate how many copies I can have at max") — do not separate at 4.8 px on a dpr-1 floor panel; only phosphor-lit survives. As motor targets the rungs are under every guideline (WCAG 2.5.8 asks 24 px) for a press-then-confirm action that spends currency; a mispress on a neighbour arms the wrong copy and the second press spends it. Why critical: a face legible at 130 px is a different face than the ratified five-row card, and a legible ~0.8 card does not seat five wide beside a 236 px tile and a 280 px column at 1318 (5×173 + 4×17 = 933 > 718) — every fix re-cuts geometry ratified "as rendered". The deck column's own rows (13 px/600) are fine; the grid is not.
Fix: Rule in one sitting with the browser-zoom finding (Medium, A11y 7.2). (1) The RAIL never scales with the face — 1:1 rungs (16×8; 20×10 at 6 px gaps clears the spacing exception) under the 130 px face, the price confirm accepting only a press on the SAME rung. (2) For the face: a reduced deck-card anatomy (name · kind · copies rail — the rows are hoverable), or a four-wide scrolling grid, or the screen leaves 1318. The rail half is mechanical; the face half is Eric's.

### High (17)

**[Rubric §2 + HUD A1 + A11y 4.1 + HUD D2]** — The ratified bar and class tiles specify mono type below the spine's own 9 px floor (§ Token completeness; § HUD A; § A11y 4.1 — DESIGN › Typography L108, L245–247; frontmatter `hotbar-slot.tier` L132, `helm-globe.keys` L131, HUD readout row L243, `class-card` L155; `hud-composite-3.html` `.tier{font:600 8px}`, `HDG` 8, `KTS` 7, W/S/A/D 7; `shipdeck-1.html` `.ct .hp .l{font:8px}`) `[v3]` · **needs an Eric ruling**
Five registers: the tier numeral 8 px/600 (the ONLY in-slot tier read and the CVD-safe half of the ramp), `HDG` 8, `KTS` 7, the W/S/A/D chips 7, and the tile pip labels 8 — dropped from the shipped 14 px hud-micro register into a 56 px column where `TURNING` fits with 3 px to spare, the cycle-124 trap re-armed. DESIGN L247 and EXPERIENCE L179 rule "no mono type renders below 9 px post-scale"; at the 90 % tier these become 7.2 / 6.3 px, and an exemption for the micro tier cannot rescue text that starts at 8. The dpr-2 reference device hides it; the dpr-1 floor panel does not. Spines-win means the mock is wrong as written, but the values were RATIFIED with the frame, so an implementer builds the numbers. The rubric's one internal contradiction.
Fix: Eric rules — (a) raise all five to 9 px (the 96 px globe, the 54 px slot corner and a 64 px tile label column all have room), or (b) amend the floor with a named carve-out for non-load-bearing glyph captions (W/S/A/D, the `KTS` suffix) — the tier numeral and the tile labels cannot take it. Until then tag all five `[OPEN — below the 9 px floor]`.

**[HUD A3 + A11y 4.6]** — The whole bar — HP globe and live helm included — dims to 38 % while the refit window is open (§ HUD A; § A11y 4.6 — DESIGN L129 `dimWhileRefitOpen: 0.38`, L275; EXPERIENCE L86; `hud-composite-3.html` `.B-hud.dim{opacity:.38}` wrapping both globes) `[v3]` · **needs an Eric ruling**
In the 2026-07-16 anatomy the dim applied to four slots bottom-left; own-vitals sat bottom-right and never dimmed. v3 folded HP and helm INTO the bar and the dim came along by inheritance, not by ruling. At .38 the <25 % damage-marker fill measures 1.10:1 against its bed and the HULL digits 2.53–3.01:1 — a Tier-1 channel that must "always animate; own the player's eye" is invisible for precisely the window in which the player is not watching the water. The helm needle (amber, 2.42:1) and `HDG`/`KTS` dim too while W/S/A/D stay live by ruling; the selected amber and every ready outline drop below 3:1; the cooldown numerals go with them (HUD B6).
Fix: Scope the dim to `.B-slots`, `.belt`, `.B-xp` — the elements the window is about to change; both globes hold full alpha (at minimum the HP globe below 50 %). One sentence in DESIGN › HUD Bar; the mock's `.dim` moves one level down.

**[HUD B1 + A11y 7.1]** — The refit band's two placement constraints have no solution at 1366×768, and 125 % is gated on width only (§ HUD B; § A11y 7.1 — DESIGN L283 keep-out `row.y − pipsAbove > H/2` + container-fit `row.y + 226 + 8 ≤ hud-bar top`; L251 ratifies 388 / 344; EXPERIENCE L86 "never occludes the own hull", L179) `[v3]` · **needs an Eric ruling**
Bar top 622 → `row.y ≤ 388`; the key chip overhangs 8 px (`.kc.big{top:-8px}`) → keep-out needs `row.y > 392` — an empty box. (A11y's arithmetic, which omits the chip overhang, finds 8 px of slack; HUD's stricter reading stands.) Keep-out only protects the hull's CENTRE, and L86's clause is stronger: at 0.582 px/u a Battleship heading N/S spans y 348–420 → 32 px of hull under cards 2–3; every heading off E/W is clipped, and the mock's hull is E/W, the one heading that hides it. At 125 % the row's anchor rule is unstated (fixed 388? bar-relative?), and a 1680×768 viewport passes the ≥1600 width gate with NO room (768 − 18 − 150 − 8 − 282 = 310 < 384 keep-out).
Fix: One of — (a) a floor-viewport card (5 × 15 px rows, 32 px icon ≈ 200 px tall); (b) bar margin 18 → 10 and strip gap 8 → 4; (c) reduce keep-out to "centre stays clear" (388 meets it) and strike L86's "never occludes"; (d) accept and stamp, as Eric did for the countdown. Either way state the row anchor as bar-relative (row bottom = bar top − 8) and gate 125 % on HEIGHT (≥ ~900–1000 px) as well as width.

**[HUD B2 + A11y 4.3]** — The greyed card's reason word — ruled THE non-colour channel — is dimmed with the card to 2.6–2.7:1 (§ HUD B; § A11y 4.3 — DESIGN L138, L283; EXPERIENCE L86, L108, L128, L172; `hud-composite-3.html` `.rc.grey{opacity:.55}`, `.foot` 9 px t2) `[v3]` · **spine fix**
Whole-card opacity dims the very word that was added so the dim would not be the only signal: `SLOTS FULL` (9 px/600, .24em) composites at .55 over a .55 panel over water to 2.61–2.70:1; the hollow key chip's digit 2.25–2.35:1. Fails 4.5:1 and the spine's own "text-muted labels ≥ 9 px" spirit — the word is load-bearing. The retired DAMAGE CONTROL rail had the same construction and was never measured.
Fix: Dim the FACE (icon, name, tier, rows) and hold the foot + key chip at full alpha in `text-secondary` — the foot already has its 1 px box. No ruling needed: the ruling was "dim + reason word + hollow chip", not "dim the reason word". Mechanical.

**[A11y 4.4 + HUD D3]** — The locked deck card at opacity .45 fails on every text and graphic it carries, including the lock glyph if it sits inside the fade (§ A11y 4.4; § HUD D — DESIGN L143 `locked: 'opacity .45 + the lock glyph'`, L302; EXPERIENCE L45; `shipdeck-1.html` `.rc.grey{opacity:.45}`, `.rail.lk`) `[v3]` · **spine fix**
Name 3.85:1, kind 2.17:1, icon 1.92:1 (labels 2.19:1, values 3.88:1 in HUD's read) — before the ×0.6 of the critical is applied. Seven of 29 lines are locked in the signed-in mock; for an anonymous captain EVERY non-starter line wears this face. HUD records it Low as "unreadable by design, stated"; the accessibility lens does not accept that for the lock glyph, which is the non-colour "locked" channel and must not fade with the card. Merged at the higher severity.
Fix: Dim the face no lower than the value that keeps the name at 4.5:1 (≈ .7 on panel) and keep the rail — lock, price, rungs — outside the fade entirely (the mock's DOM order may already do this; the spine should say it).

**[HUD C1 + A11y 4.5]** — The results LOADOUT block reuses the slot row at ×.72, putting the only tier read at 5.8 px on a WCAG-scoped modal (§ HUD C; § A11y 4.5 — DESIGN L140, L313; `countdown-results-1.html` `.lo .lo-row{transform:scale(.72)}`) `[v3]` · **spine fix**
Over the HUD's 8 px tier numeral → 5.76 px; key chips 9 → 6.5; the `×n` badge 10 → 7.2; belt squares 32 px with 15.8 px glyphs. DESIGN L313: "no names rendered, the glyph is the name" — so the numeral is the ONLY tier read per slot, and at 5.76 px tier degrades to colour-alone (the ramp), which the dual-coding floor forbids for a state. The ladder line beneath repeats the SHIP tiers at 11 px; the weapon tiers have no legible twin. Compounds the 8 px base.
Fix: The block does not have to be the bar at .72 — nine squares at 1.0 (≈528 px) fit the 532 px content width; or hold .72 for the squares and print each tier at the ladder line's 11 px/600 register beside the glyph.

**[HUD A2]** — The 790×128 bar sits over aimable water astern: the aim layer is z-ordered UNDER it, the shipped gate swallows clicks on it, and at 1.5× it cuts into the sight bubble (§ HUD A — DESIGN L129, L275; `stage.ts:268–285, 329`; `mouse.ts:67–74`; EXPERIENCE L156, L210, L217; `arcs.ts:6, 67`) `[v3]` · **needs an Eric ruling**
At 1.0× the bar top (y 622) is 409 u below the own hull and covers the radar annulus 409–630 u across ±59° astern. At the alive zoom ceiling 1.5× sight = 288 px and the bar cuts 50 px into the sight bubble (273–330 u) — exactly the "aim by sight up close" band. The reticle and burst preview draw under the globes' `rgba(3,6,5,.7)` beds and under cooling slots' `.55` interior + `.86` wipe; the swallow zone is nine slots plus two globes. The mine's and decoy's placement arc is the REAR sector — a zoomed-in Mine Layer cannot see, preview or click into roughly a third of its own placement arc. The 2026-07-16 F11 radar asymmetry gets 128 px worse on the vertical axis.
Fix: Three sentences in DESIGN › HUD Bar — (a) reticle, arc and burst preview render ABOVE the bar (a HUD-layer re-projection, the way plates were lifted at cycle 123) OR the bar is click-transparent and bed-less outside the globes; (b) the sight bubble may never intersect the bar — clamp the alive zoom ceiling (≈1.24× at 768) or lift the bar while zoomed in; (c) name the swallow zone. (a)-vs-(b) is Eric's call.

**[Rubric §4 + Input 3.5]** — The Ship & Deck screen has no edge or failure states: unsaved edits at CONFIRM / ESC, an armed rung's cancel, insufficient tokens, rename bounds (§ State coverage; § Input 3.5 — EXPERIENCE › IA › Ship & Deck L45; State Patterns L112 has only the rung table; DESIGN L144, L303; register #50; `shipdeck-1.html` legend L235) `[v3]` · **needs an Eric ruling**
Every one is a decision story-dev would otherwise make alone. (a) CONFIRM SELECTION or ESC with unsaved column edits — confirm the last-saved deck, discard, or block? The client sends a deck id and "edits after queuing apply to the next match", so this decides what SAILS; a captain who edits, presses CONFIRM and sails the old deck will read it as a bug. (b) A hollow rung pressed and not confirmed — the arming press is ruled, the disarm is not: a different rung (moves the arm? two armed — and Enter then ambiguous, possibly spending two tokens?), a click elsewhere, ESC, switching hull or deck, leaving the screen, a timeout (the settings danger buttons have none). The mock's legend lists press, press again, unlock — and no cancel. (c) A rung pressed with insufficient `⬢` — denied pulse, inert, or the price in `denied`? (d) Rename bounds — length, empty, characters (the callsign caps at 14; the deck name has none and D12 gains a `name` column).
Fix: A Ship & Deck state table beside the copies-rail one. (a)–(c) are Eric calls; (d) can be a facilitator `[ASSUMPTION]` for redline. The safe reading for (b) — "one armed rung at a time; any press elsewhere disarms" — has a cost (arm, scroll, return, press twice) and is a design choice. Delete and the last-deck floor are the next entry.

**[A11y 6.4 + Input 3.6 + Rubric §4 (d)]** — `×` deletes a named deck with no confirm, on a screen where BUYING a 1-token copy is press-then-confirm by ruling; the last-deck floor and the fallback current deck are unstated (§ A11y 6.4; § Input 3.6; § State coverage — EXPERIENCE L45, L52, L92; DESIGN L145 `× delete (16px mono muted)`, L146, L191; decision log L124, L128, L129, L132; `shipdeck-1.html` `.ddx`) `[v3]` · **needs an Eric ruling**
A deck is up to 40 authored choices and a name; `×` is a 16 px muted glyph 12 px from the `✎`. The shipped settings overlay already owns a two-press danger-row machine in the `danger` register. "Press-then-confirm everywhere" (register #50) was said about buying; the spine lets its extension to the one genuinely destructive control on the screen be inferred. Also unstated: the starter is deletable by ruling, so a hull can reach ZERO decks — "the client sends a deck id" then has no id to send, and the class card's "a deck is never a forced choice" has nothing to fall back to; and which deck becomes current after deleting the current one.
Fix: Extend press-then-confirm to `×` (or rule that a deleted deck is recoverable — STARTER never deletable and a deletion reverting the dropdown to it); state the floor (one deck per hull minimum, or a synthesized starter) and the fallback after deleting the current deck. None is a binding.

**[A11y 6.2 + Input 3.4 + Input 3.7 + Rubric §3]** — The Ship & Deck screen — the largest DOM surface in the game — has no keyboard model, focus order or accessible-name spec; the rename text input sits inside a layer whose own bindings are `1`–`3`, arrows, Enter and ESC (§ A11y 6.2; § Input 3.4, 3.7; § Component coverage — EXPERIENCE L45, the only keyboard statement, tagged `[ASSUMPTION]`; L166 is written for the sim; DESIGN L143–148, L302–307; `classSelect.ts:137–150, 696–705`; `keyboard.ts:10–11`; shipped `aria-|role=` count 0 in settings / results / upgradeMenu / home, 1 in classSelect) `[v3]` · **needs an Eric ruling**
≈200 pressable rungs + steppers, a custom `.dd` dropdown, `✎ ×`, SAVE, CONFIRM SELECTION, 20 swatches. Not stated: (i) the focus unit — rungs individually focusable (≈200 tab stops between the tiles and SAVE) or card-level with arrows inside; (ii) press-then-confirm from a keyboard (Enter twice? does focus moving cancel the arm?); (iii) native `<select>` (free accessibility) or custom listbox; (iv) Enter in the rename field — the class layer's Enter ≡ CONFIRM SELECTION and the home's Enter ≡ SOLO are both live one layer down, and SAVE plus an armed rung's confirm are two more Enter homes with no precedence; (v) typing `3` into a deck name must not switch the hull (the shipped layer gates keys off while a text input is focused — inherit it and say so); ESC in the field must cancel the rename, not return home, and with the dropdown menu open ESC should close the menu first; (vi) how the grid scrolls by keyboard when arrows are mapped to tile highlight with `preventDefault` and the grid's native arrow behaviour is scroll; (vii) SAVE "unlit" vs genuinely `disabled` (the retired DAMAGE CONTROL rail set that precedent).
Fix: Rule the focus unit and Enter's meaning outside a text field; the rest is spec — card-level focus with arrows across the grid and `+` / `−` / Enter within a focused card (MTG Arena's pattern; Hearthstone's collection is mouse-only), a native `<select>`, Enter in the rename field commits the name and nothing else, ESC in the field cancels the rename before it closes the layer, SAVE `disabled` while illegal, the column before the grid in DOM order or a roving tabindex per card. Add the row to Interaction Primitives.

**[Rubric §6]** — The supersession-record method: 52 SUPERSEDED markers and 88 strikethrough runs across the pair, most for rulings that lived HOURS on 2026-09-11 and were never built (§ Bloat — IA › Ship & Deck cell; DESIGN › Class Card row four layers deep; Deck Card, Deck Dropdown, Lock Price and Account Chip rows; register rows #42/#43/#46 superseded by #48–#54 in the same table; the IA "Signed-in port loop" paragraph) `[v3]` · **spine fix**
The class-card deck row, the standalone `/decks` page (Direction A), the `DECKS` home link, the four-row card — each kept inline as strikethrough plus "SUPERSEDED … later the same day" chains, three and four layers deep inside single table cells and inside frontmatter token VALUES. The decision log is the record, the spine is the contract; a consumer now parses history to find the live rule. The pair is 28,353 words.
Fix: For same-day interims keep ONE clause — "an interim ruling the same day was superseded; see log" — and delete the struck text. Keep strikethrough only for shipped-then-retired surfaces (XP Rail, HP Rail, DAMAGE CONTROL rail, Telegraph Cluster, chamfer), where the struck text tells a story-dev what to remove.

**[A11y 2.1]** — SHIELD BLOCK's two halves are the same modality, the globe already wears a phosphor ring at rest, and "the number" is never rendered as a number (§ A11y 2 Dual-Coding — DESIGN L141 `shield-ring` widths `[OPEN — not mocked]`, L287–288; EXPERIENCE L81, L172, L224; decision log L113 "BOTH"; `hud-composite-3.html` L277 the idle `.35` ring) `[v3]` · **needs an Eric ruling**
Eric ruled BOTH — a ring on the globe ("the number") and a ring on the hull ("the glance") — and the spine files that as dual-coding. Two rings are one channel, and the globe's shield ring has to be told apart from the idle phosphor ring the globe ALREADY wears: with widths OPEN, "shielded" vs "not" on the globe is a stroke-width and brightness read on a 96 px circle in peripheral vision, during exactly the fight the shield was popped for. Every other own-vitals fact on this HUD has a numeral (HULL n/n, seconds, HDG, KTS, `×n`). HUD § E flags the same risk as unverified.
Fix: (a) A shield numeral — the globe readout's second line reads `SHIELD 64` while shielded (the HULL register, no new type); and/or (b) a distinct SHAPE from the idle ring (dashed, or a second concentric ring at a stated width). Widths must not stay OPEN past the mock pass either way. Re-opens a ratified "BOTH"; rule together with the next entry.

**[A11y 3.3]** — A shielded hit produces no shake, no thud and no flash — the only feedback that your shield is being eaten is a ring thinning on a globe you are not looking at (§ A11y 3 Audio-Visual — EXPERIENCE L224 "the victim-private damage reads 0", L230, L81, L173 "and vice versa for combat-critical events"; DESIGN L288) `[v3]` · **needs an Eric ruling**
Damage feedback is the game's loudest own-state channel (shake + thud + vignette + HP drop) and the shield silences all four for the 100 hp it absorbs; a player watching the water learns the shield is gone when the NEXT hit shakes the screen. Journey C beat 5 narrates the ring thinning "as the fish lands" — the persona is looking at the globe; a real player is looking at the Torpedo Boat. The reverse clause of the audio-visual floor is exactly this case.
Fix: A shield-absorb cue (audio) twinned to a brief hull-ring flash on the water within the 80 ms / 300 ms grammar — the hull ring exists (Eric's "the glance") and never moves — plus a shield-expire beat. Reduced-amplitude shake is a feel call; the EXISTENCE of absorb feedback is the accessibility floor.

**[A11y 6.1]** — A consumable's card face carries numbers, not meaning; the only explanation is a hover-only tooltip with no focus or key path (test-pinned); How-to-Play carries no catalog by rule; and first contact is an auto-opened window under a 10 s clock (§ A11y 6 Cognitive — EXPERIENCE L87, L194, L49, L54; DESIGN L142, L283, L331; `refitTooltip.ts:6–15`; mocks HULL REPAIR rows vs CHAFF / SMOKE / DECOY / SHIELD / ACOUSTIC HOMING rows) `[v3]` · **needs an Eric ruling**
HULL REPAIR's rows explain themselves (`HULL +50 NOW / +50 OVER 10 S`); CHAFF's will read `FAKES 10 · RADIUS 120 U`, SMOKE `PUFFS · 5 S · 30 S`, DECOY `HP 50`, SHIELD `ABSORB 100` — none says what the thing DOES. Eric's own brain dump: "players are just picking refits randomly"; the ruling answered with stat rows, which fixes the ladders and does nothing for five consumables and six add-ons. The tooltip is the whole cognitive floor for eleven of 29 lines, unreachable without a pointer (a discoverability and screen-reader block — mouse is mandatory to play, so not a keyboard-only block), and the countdown's REDRAW decision is the one moment it must be read under a clock. The activation-channel contradiction (Medium, Rubric §7) is the same root.
Fix: Two halves — (a) add a consumables/add-ons table to How-to-Play (the L194 supersession was written when every line was a stat ladder; worth re-asking now that eleven lines are verbs); (b) keep the tooltip hover-only for the 1–4 shortcut (the ruling's reason is sound) but let it ALSO open on keyboard focus of a card — focus is not the shortcut, so the rationale is untouched; the test pin would need amending. Neither adds words to the face.

**[Input 4.1 + A11y 6.10]** — The 1–4 mash across the refit window's auto-close resolves as pick → nothing → consumable SPEND, possibly of the card just stocked; no post-close grace shipped (§ Input 4 Consistency; § A11y 6.10 — EXPERIENCE L149, L148, L86; `keyboard.ts:517–521`; `main.ts:863–893, 785–821`; architecture D20 / D21 `stock` → first empty consumable slot) `[v3]` · **needs an Eric ruling**
One banked level: `Tab`, then `2` — the pick latches, the window stays open but locked, the server acks 100–200 ms later, the bank reads zero, the next render frame hides the window. A double-tap lands press two inside the lock (inert, correct) and press three, at human cadence 200–300 ms, AFTER the hide: belt slot 2 fires. If the card picked was a consumable, `stock` put it in the first empty belt slot — slot 1 or 2 on a fresh belt — so the third tap can burn the very card the first tap took. Both meanings are irreversible spends; "misfiring NOTHING beats misfiring the wrong thing" applies with more force now than when the 2026-07-16 finding was written (atomic-at-keydown shipped; the proposed grace did not). Verified safe for the record: Tab-and-digit is synchronous event order, not a frame race; a digit HELD at auto-open fires nothing (`e.repeat` dropped).
Fix: Rule whether a digit inside a short window (~150–200 ms) after an auto-close resolves as nothing; if the rule stays as is, state the close-then-fire sequence as a known consequence.

**[Input 4.5]** — What ends the held stream: the shipped combat lockout is a CLICK gate and `held` is a LEVEL, so a pointer already down when `Tab` opens the window keeps streaming under "full combat lockout" (§ Input 4 — EXPERIENCE L110, L158, L86; architecture D26 L1018–1033; `mouse.ts:95–129` — listeners for pointermove / pointerdown / pointerout / blur, NO `pointerup` or `pointercancel`; `keyboard.ts:574–576, 605–608`; `main.ts:4347–4360`) `[v3]` · **spine fix**
The spine lists the WEAPON's three enders (release, arc exit, empty pool); the INPUT's enders are missing, and the shipped mechanism cannot supply them — the lockout refuses to count a click at pointerdown, which does nothing to a level that is already true. This is precisely the bug the rudder already defends against by reading the level through the overlay predicate rather than trusting keydown suppression. Likewise blur / tab hidden / `pointercancel`: no `pointerup` arrives after an alt-tab mid-hold, so absent an explicit clear the server streams until the pool empties (six seconds of fire from a captain looking at another window); the shipped blur neutral-send must carry `held: false`; the release listener must be on `window` (a pointer released over the kill feed fires there); Firefox's Shift+right-click menu can swallow the `pointerup`. Bounded by the six-second pool, so HIGH not critical — the spine's own lockout sentence is false as the mechanism stands.
Fix: State the invariant: the stream ends when the refit window opens (and at the held start line) and does not resume on close without a fresh press-down; blur / hidden / `pointercancel` clear `held`; `pointerup` on `window`. Derivable from shipped code + D26; no ruling.

**[Input 4.6]** — "Firing auto-reverts to the gun" applied at press-down turns the machine-gun stream into a one-tick burst; the revert instant is unruled (§ Input 4 — EXPERIENCE L80, L146, L110; architecture D26; `keyboard.ts:684–686`; `main.ts:3433–3439`; decision log L18+82) `[v3]` · **needs an Eric ruling**
The shipped revert is keyed to the click counter; a stream never touches it (D26), so with no new rule the machine gun never reverts — acceptable — but an implementer following "firing auto-reverts" literally at the first shell produces: tick 1 one shell fires and the prime reverts to slot 0; tick 2 `EQUIPMENT[primed].stream` is false and the level is ignored (pinned). The player holds the button and gets one round. Also unstated: what revert MEANS now the gun has a slot (slot 0, the keyless deck-gun square goes Selected — answered by ruling), and that Q/E/R mid-stream switches the prime and stops the stream with no denial.
Fix: Rule the revert instant — at release / pool-empty / arc-exit, never at press. The rest is one sentence.

### Medium (32)

**[Rubric §1]** — Journey C has no failure path — the only journey without one, on the surface with the most new failure modes (§ Flow coverage — EXPERIENCE › Key Flows › Journey C) `[v3]` · **spine fix**
Journeys A and B carry a failure path; C — the compass audience, the account, the deck — does not, and it is the surface where sign-in, the door refusal and the unlock cap all fail.
Fix: One beat: the door refuses his deck (unlock revoked, cap changed) → reason + `SAIL STARTER DECK`; or the sign-in popup is closed and the home status line reports it.

**[Rubric §3]** — Six v3 components have a DESIGN row and token but NO Component Patterns entry: Deck Card, Copies Rail, Deck Column, Deck Dropdown, Account Chip, Lock Price (§ Component coverage — EXPERIENCE › Component Patterns) `[v3]` · **spine fix**
Their behaviour exists — spread across the IA "Ship & Deck screen" cell (~450 words), State Patterns "Copies-rail rung states" and the Class Card bullet — but the section's own contract is "Behavior only; visuals in DESIGN.md · Components (same names)". Redraw Button and Loadout Block likewise live only in IA cells.
Fix: One bullet each in Component Patterns, pointing at the state table where one exists.

**[Rubric §3 + A11y 6.8]** — Three v3 surfaces have behaviour in EXPERIENCE and no visual spec anywhere in DESIGN: the anonymous home's `SIGN IN` row, the match-history page, the door-refusal register (§ Component coverage; § A11y 6.8 — EXPERIENCE › IA L44, L51; DESIGN — nothing) `[v3]` · **spine fix**
`SIGN IN` (OAuth popup, Google / Discord — ruled D17; the fork being `[OPEN — Eric]` does not un-rule the row); match history is `[ASSUMPTION]` end to end — rows in the kill-feed grammar, empty as absence, entry from the account chip — so it is unreviewable until Eric rules the surface, and the next run must not read its silence as a pass; the door-refusal register (reason word + `SAIL STARTER DECK`) names no surface (queue modal? home status line?).
Fix: One DESIGN row each, or an explicit `[OPEN — Eric]` naming the surface each will occupy.

**[Rubric §4 + A11y 6.6]** — Account and sign-in errors are unspecified: popup closed or blocked, provider error, token expired mid-session (a 401 on SAVE), a failed save; plus the popup's focus return and completion announcement (§ State coverage; § A11y 6.6 — EXPERIENCE › IA L44, L52; Journey C L281; State Patterns) `[v3]` · **spine fix**
The home status line already owns this register (`info` waiting, `denied` failure, the `CONNECTION FAILED` pattern at L89). Where focus lands when the popup closes (the `SIGN IN` row or the chip that replaced it) and whether the chip's appearance is announced (an `aria-live` status line covers both) are unanswered; the privacy paragraph is complete, the interaction is not.
Fix: One line each naming the surface and tone; no new copy (THE COPY LAW).

**[Rubric §6]** — Ratification ceremony inside spec cells: nine Eric quotes ("YES THIS IS PERFECT!", "Yes, build from this", "overall very yes", …) in DESIGN Components rows and IA cells (§ Bloat) `[v3]` · **spine fix**
Provenance is the log's job; the contract needs the date and the word RATIFIED.
Fix: Strip the quotes from rows; keep them in the register's Source column if at all.

**[Rubric §6]** — 24 code line-number citations (`client/src/render/xpRail.ts:178-186`, `client/src/ui/upgradeToast.ts:22`, …) in a UX contract (§ Bloat) `[pre-existing]` · **spine fix**
They drift with every commit, and several now point at surfaces v3 retires.
Fix: Cite the module, never the line.

**[Rubric §7]** — A GDD contradiction stated as settled: `gdd.md` § Consumables and `epics.md` E8 say "the card face says which" (key-fires vs key-primes); EXPERIENCE › Hotbar Slot says "the card face never says which" (§ Inheritance — EXPERIENCE L80) `[v3]` · **needs an Eric ruling**
The log records that the ratified face has no activation wording and flags the non-verbal channel "for Eric at the mock, not decided here" — no ruling followed. The spine asserts a conclusion the log did not reach, and nothing says where the player learns that DECOY BUOY primes (hover tooltip? How-to-Play?). Input 5.1 accepts the Selected-state teach as sufficient; the contradiction with the GDD stands regardless.
Fix: Tag `[OPEN — Eric: the activation channel]`, add the GDD line to the corrections list (next entry), and rule alongside the consumable-face finding (High, A11y 6.1).

**[Rubric §7]** — No consolidated list of the corrections v3 owes upstream; the register carries four of roughly ten (#26, #34, #45, #49) (§ Inheritance) `[v3]` · **spine fix**
The log names them one by one — GDD/E8 story 3 (draw-pile counter), E8 story 9 (results re-scope), catalog R14 wording, GDD "a token unlocks a whole line" → per-copy (E9 story 5, D12 per-copy counts, `deckRules`, `matchesToCatalog`), deck names (D12 `name` column, D14/D15/privacy, the forge's Rejected list), starter quantities re-cut, the dev host account-only — and a downstream epics run reassembles the rest from the log.
Fix: A "Corrections owed upstream" sub-list under the register (the 2026-07-16 spine's pattern for the 4-card offer, register #2).

**[Rubric §8 + Rubric §2]** — `components` frontmatter values are sentences and history, not values (§ Shape fit; § Token completeness — `deck-dropdown.row` embeds "(SUPERSEDED 2026-09-11 v3: the class-card DECK row)", `class-card.role` a supersession clause, `bank-chip.size` "(was 30px at the hotbar head)", `hotbar-slot.empty` "= the 0:00 state of every weapon slot", `copies-rail.acquire` a 60-word paragraph) `[v3]` · **spine fix**
The spec defines the object as "component tokens mapped to values or `{path.to.token}` references"; a value with a parenthetical supersession note is neither, and a resolver that flattens it emits the history into the consumer's output. The rubric raised this in two categories; counted once.
Fix: Values only in the frontmatter; the sentence goes to the row or the log.

**[HUD A4]** — The HP readout's label and denominator fail 4.5:1 at full HP (§ HUD A — DESIGN L130 `readout: 'HULL 212 /250 mono, 18px/600 + 10px'`; `hud-composite-3.html` `.globe .gt` 9 px t2, `.gt em` 10 px t2) `[v3]` · **spine fix**
Once the waterline is above the text (fill ≥ ~60 %) `HULL` and `/250` sit on the phosphor `.28` fill: 3.37:1 (3.75 on amber, 4.56 on damage-marker). `/250` is the max-hull number ARMOR moves — load-bearing — and it is least readable when the player is healthiest.
Fix: `/250` in `text-primary` at 10 px; or the label pair on a small `card-scrim` bed inside the globe.

**[HUD A5 + A11y 4.7]** — The belt frame — the chamfer's replacement as the weapon/consumable distinction — is a 1.43:1 stroke; the hollow copies-rung hairline is 2.72:1 (§ HUD A; § A11y 4.7 — DESIGN L133 `frame: '1px silver .2'`, L277 "the frame IS the weapon/consumable distinction (with the key chips)", L144, L265 chamfer RETIRED; `hud-composite-3.html` `.belt` rgba(192,192,192,.2); `shipdeck-1.html` L94) `[v3]` · **spine fix**
Below the 3:1 graphics floor (DESIGN L203). The key chips (1–4 vs Q/E/R) still carry the distinction as text, so it is not colour-alone — but the frame is not a second channel at this alpha, only for a player reading chips rather than glancing at the row. The hollow rung at 2.72:1 is the "unowned" channel on ~100 rungs.
Fix: Frame at silver `.42` (≈3:1, the rail's hairline alpha) or the ready-state `.4`; hollow rung at `.5`; or declare the padding gap + chips as the two channels and drop the frame's claim.

**[HUD A8 + A11y 5.2]** — The cooldown numeral's tenths rule makes the head-of-row slot a 10 Hz text channel for 40–80 % of every gun cycle, on up to five slots, and no attention tier owns it (§ HUD A; § A11y 5.2 — DESIGN L134, L278 "tenths under 2 s"; EXPERIENCE L105, L120 `[ASSUMPTION]`, L174 the per-element 3×/s rule; `hud-composite-3.html` foot-note L521) `[v3]` · **needs an Eric ruling**
The deck gun reloads on 5 s (2.5 s at the RELOAD cap), so the gun slot shows a digit changing 10×/s for 2 of every 5 s, and the numeral jumps from 1 to 3 glyphs at 2.0 s. Not a photosensitivity flash (~32 px text region), but a 10 Hz changing element by the spine's own per-element rule, and a distraction: the eye is pulled 2 s before the gun is ready, when the useful moment is 0.
Fix: Tenths only under 1 s; or tenths only on the deck gun (where 1.2-vs-1.0 matters) and whole seconds elsewhere; or 0.2 s steps; or let the wipe's last 20 % carry sub-second timing. Any keeps "the count moves" true; resolve the `[ASSUMPTION]` either way.

**[HUD A10; also Input 4.9]** — The mocks of record draw the RETIRED chamfer on the Shift slot in every frame (§ HUD A — `hud-composite-3.html` `.slot.ability{clip-path:…}` L102 / 284 / 450 / 515 and the aside L330 "Shift (chamfer, 7 s wipe)"; `countdown-results-1.html` L102 / 242 / 367; decision log 2026-09-11 "Activated-ability chamfer — RETIRED"; DESIGN L265, L276) `[v3]` · **spine fix**
Spines win, but the ratified mock ("YES THIS IS PERFECT!") contradicts the spine on the one shape channel that was struck — the 2026-07-16 F12 pattern — and the three mocks are what E8's implementer will open.
Fix: Delete `.ability`'s `clip-path` in the three mocks (one line each) or stamp each mock header with the retirement.

**[HUD B3]** — One catalog name does not fit the refit card's name row: `SUPERCAVITATING TORPEDO` (23 chars ≈ 221 px at 15 px/600) overflows the 192 px content box; `HORIZONTAL MISSILE` is marginal (§ HUD B — `.rc .cn{font:600 15px; white-space:nowrap}`; `shipdeck-1.html` L54/57 silently invents `.cn.long{font-size:12.5px}`; DESIGN L138, L283 has no long-name rule) `[v3]` · **spine fix**
The shipdeck mock's `.cn.long` is proof the renderer hit it; neither in-match mock shows either card. THE COPY LAW forbids an implementer shortening the name.
Fix: A container-fit pin for the name row (the `refitCardFit.ts` / `monoTextWidth` precedent from cycle 124) plus a rule — a 12.5 px shrink step, or two lines with the icon box yielding.

**[HUD B4]** — Queue pips and the ghost edge are still specified and have no home on the v3 face (§ HUD B — DESIGN L283 "Queue pips in the header (8px squares…) + dashed ghost edge behind the row"; EXPERIENCE L86, L128) `[v3]` · **spine fix**
The v3 face has no header — key chip, icon, name, tier, kind, rows, foot — and no mock draws a pip or a ghost edge.
Fix: Place them (beside the key chip, or a row-level strip over card 1) or retire them with a stamp.

**[HUD C2]** — At the floor viewport the results modal covers the reveal's HUD survivor set — the BR chrome bar is entirely under the panel (§ HUD C — `.results{width:620px}` ≈735 px tall → y ≈ 16.5–751.5, x 373–993; `.brchrome{top:16px}` x ≈ 378–988; EXPERIENCE L138; DESIGN L312) `[v3]` · **spine fix**
DESIGN L312 accepts the HEIGHT; the collision was never named — the "~16 px of reveal top and bottom" is not reveal, it is the chrome bar's own band. Only the kill feed (x ≥ ~1044) stays clear.
Fix: Stamp the chrome bar a non-survivor below ~800 px tall, or trim the 1080p F3 spacing (26 px tile margins, 40/44/36 padding — ≈60 px recoverable) so the panel starts below y ≈ 40.

**[A11y 5.1 + A11y 1.1]** — Whether a continuous progress readout — the cooldown wipe on up to five slots, the held-fire drain, the shield ring thinning — is "motion" under `motion: off` is unstated; the law "off removes motion, never information" admits two readings, and the attention table carries only an `[ASSUMPTION]` that they take no tier (§ A11y 5 Photosensitivity; § A11y 1.1 — EXPERIENCE L178, L120, L172, L174, L244; DESIGN L134, L278; `hotbar.ts:519–546`) `[v3]` · **needs an Eric ruling**
Reading A: the wipe IS information, so it plays at every level. Reading B: the numeral carries the information, so at `off` the wipe STEPS with the numeral or holds at the dim keyframe — the hotbar already has that precedent (`slotSkin` at zero intensity is the `off` keyframe). Five simultaneous conic sweeps at the bottom of the screen is the largest continuous-motion surface the HUD has ever had; a vestibular-sensitive player who chose `off` should not get it.
Fix: Rule the reading (the reviewer's recommendation: B for the wipe and the drain; the shield ring exempt, since it moves only on a hit) and ratify the no-tier assumption — two sentences in the floor.

**[A11y 2.4]** — The class tile has a hover state (invented) and a selected state, but no KEYBOARD-HIGHLIGHT state, and the tile's non-colour selected channel is unnamed (§ A11y 2 Dual-Coding — DESIGN L155, L300; EXPERIENCE L45 `[ASSUMPTION: the class layer's key map carries to the tiles]`; `shipdeck-1.html` `.ct.on`, `.swd`; `classSelect.ts:138–146`) `[v3]` · **spine fix**
The shipped class layer distinguishes highlight (arrows move it, Enter picks) from pick; a keyboard user stepping 1→2→3 has no defined focus ring, and the swatch dot `.swd` that appears only on the selected tile, plus the filled silhouette, are never named as load-bearing — an implementer may drop the dot as decoration. Whether `1`–`3` should carry a chip at all is the last Low.
Fix: One line each — "keyboard highlight = the hover treatment (hairline → silver) + a visible focus ring; selected = the filled silhouette + the swatch dot — the hue is secondary."

**[A11y 2.6]** — The held-fire fill is invisible (amber `.16` over fog → 1.35:1); the 1 px amber waterline is the real channel, and held-fire shares SELECTED's amber outline (§ A11y 2 — DESIGN L132 `heldFire`, L276; EXPERIENCE L110; `hud-composite-3.html` L106–107 `.slot.firing` ≡ `.slot.sel`, `.pool`) `[v3]` · **spine fix**
On the E slot (selected while you hold), "held" vs "selected" differs only by that 1 px line — survivable, but the spec describes an alpha fill nobody will see.
Fix: Say the waterline IS the readout and set its weight (2 px matches the amber needle).

**[A11y 3.2]** — Three `TONE_TWINS` rows will describe retired surfaces the day E8 lands — `heal` (the HP rail, the DAMAGE CONTROL rail), `point` (`LEVEL UP — TAB TO REFIT`), `placeBuoy` (the radar buoy) — and the test pins only non-empty (§ A11y 3 — `client/src/audio/twinMap.ts`; EXPERIENCE L173) `[v3]` · **spine fix**
Under v3 the heal twin is the HP GLOBE and the belt count, the point twin is `TAB TO REFIT` at the strip's tail, and `placeBuoy` fires for the DECOY. Not a spine defect in itself; the "map for humans" quietly lies without one line.
Fix: One spine line obliging E8 to re-point every row whose surface it retires (implementer follows).

**[A11y 3.4]** — CHAFF is the first consumable whose use gives its owner nothing but a decrement — by ruling — so the twin must be stated as the count (§ A11y 3 — EXPERIENCE L217 "no 'chaff active' HUD readout — nothing about it rides the wire to the owner", L80) `[v3]` · **spine fix**
Defensible on the wire (Eric: "you have a tendency to add info no one needs"), but an implementer reading "every audio cue has a visual twin" will be tempted to draw the fakes for the owner. With `motion: off` nothing changes; there is nothing to remove.
Fix: One clause — chaff's cue twins ONLY the `×n` decrement.

**[Input 3.1 + A11y 6.3]** — The countdown's key map is not stated, and REDRAW — the one time-boxed decision in the match — has no key, no `⏎` chip and a 10 s life (§ Input 3 Mode completeness; § A11y 6.3 — EXPERIENCE L54, L53, L108, L148–150, L160; DESIGN L139, L310; `main.ts:1022–1060, 2250–2252`; `countdown-results-1.html` L181–185, L345) `[v3]` · **needs an Eric ruling**
Derivable from shipped code and non-obvious in two places: digits PICK (no start-line gate on that path — correct); W/S/A/D are inert AND their presses are discarded at the release edge, never banked as an engine order (Journey A has Marco "wiggle" the helm here); Q/E/R, Shift, closed-window belt digits and every canvas click are swallowed feedback-free; F is live; ESC closes the window, a second ESC opens settings; Enter and Space are bound-inert. Precedence: at 0:00 a belt slot is both EMPTY (denied by L108) and LOCKED (not denied, by the same row) — the lock must win, or a player mashing `1` gets red pulses for a slot that is empty by design. REDRAW is mouse-only in a phase where the hands are on `1`–`4` and Tab; the helm is held, so a key costs nothing motor-wise; `5` is freshly unbound and already in the refit family; Enter is inert in-match.
Fix: Write the countdown row's key map; state "under the hold, the empty-slot denial is suppressed"; bind a key to REDRAW or record mouse-only as accepted — the truthfulness rule then forbids a `⏎` chip on the button. A binding, so Eric's.

**[A11y 6.5]** — Glyph-only controls with no accessible names: `⬢`, `✎`, `×`, `−`, `+`, the lock, the swatch dot, the REDRAW pip, and every rung (§ A11y 6 — DESIGN L144–148, L303–307; the shipped hoist's per-swatch `aria-label` at `classSelect.ts:303` is the precedent) `[v3]` · **spine fix**
A screen reader announces "black hexagon 2", "lower right pencil", "multiplication sign".
Fix: State the names once in the component rows ("2 tokens", "rename deck", "delete deck", "remove one copy from deck", "buy copy 3 for 1 token", "locked — buy copy 1 to unlock") and `aria-pressed` for the armed rung, so E8/E9 inherit rather than invent them.

**[A11y 6.7]** — Key remapping stays deferred with a reason v3 itself retired (§ A11y 6 — EXPERIENCE L164, L176; register #19 "needs a fresh reason `[OPEN — Eric]`") `[pre-existing]` · **needs an Eric ruling**
The binding surface grew (Shift, the digits' two meanings, F, Tab, 1–4 with Q/E/R all under the left hand) and the storage objection dissolved (settings are account-backed, L192). The input lens's ledger carries the same row as DEFERRED. Not re-argued.
Fix: The deferral needs its new reason before E9 closes the settings story.

**[A11y 7.2]** — Port chrome "follows browser zoom" — but the Ship & Deck screen is a fixed 1318 px layer, so the port's only low-vision path overflows the floor viewport at 104 % and the spine states no reflow or scroll rule (§ A11y 7 — EXPERIENCE L179, L312; DESIGN L251) `[v3]` · **needs an Eric ruling**
1318 × 1.04 = 1371 > 1366; at 125 % browser zoom the layer is 1648 px. The 1100 px chrome has 24 % headroom at 1366; this screen has 3.6 %. Either the layer reflows (grid to 4 wide, panes stack — contradicts nothing ratified, since pane ORDER is what Eric ruled) or it scrolls horizontally, which a DOM surface must never do.
Fix: Rule in the same sitting as the critical — "what a legible collection looks like at the floor" and "what it does at 125 % zoom" is one answer.

**[Input 2.1]** — Shift+Tab is prevented-inert in the shipped chokepoint: rolling boost into refit silently drops the refit toggle (§ Input 2 OS/browser — `keyboard.ts:392–403`; EXPERIENCE L148, L152, L54) `[v3]` · **needs an Eric ruling**
Shift+Tab is the browser's reverse focus-cycle — prevented (focus must not escape the canvas) and takes no action; the right call when Shift was unbound. Under v3 Shift is a combat key tapped under adrenaline, and boost → open refit is Shift-down, Tab-down, Shift-up at real typing speeds, so Tab arrives with `shiftKey === true` and is swallowed with no feedback. An implementer who "fixes" it by letting Shift+Tab toggle re-introduces the reverse-focus problem. Shift+`1`–`4` is already safe (dispatch on `e.code`).
Fix: Rule whether Shift+Tab stays inert (state it in L166 so the settings reference and How-to-Play can carry it) or the chokepoint's Tab exception is narrowed.

**[Input 2.3]** — Shift under the refit window is a design gap the spine itself tags `[ASSUMPTION]`; the shipped default is suspended (§ Input 2 — EXPERIENCE L86, L146, L152; architecture D30; `keyboard.ts:492` `if (isModalOpen()) return`) `[v3]` · **needs an Eric ruling**
The lockout that produced "suspended" was about WEAPONS ("a captain picking a card is not conning") and the window deliberately keeps the HELM live; the boost is now a universal MOVEMENT verb sitting on the weapon side of the bar. Both readings cohere — suspended (a slot with a cooldown on a bar that dims to 38 %) or live (helm; boost out of trouble while reading). At the held start line the answer is clearly locked.
Fix: Rule it; state it in the F row's shape ("suspended with Q/E/R").

**[Input 3.2]** — Mulligan idempotence is server-safe, but a latched-spend REDRAW would turn a last-frame press into a denied pulse on a card that does not exist plus a 1.5 s lock (§ Input 3 — architecture D22 L923–928 "silent no-op"; `main.ts:751–760, 785–806, 863–893`; EXPERIENCE L54, L128) `[v3]` · **spine fix**
If REDRAW rides `trySpend` (the natural implementation — it is a `SpendMsg`), a redraw the server silently drops (phase already `live`, or already mulliganed) leaves a latch that never acks, locks every card for the timeout, and fires the 80 ms denied pulse on choice `-2`. Also unstated: REDRAW while a card spend is in flight (the view is locked — is the button?); REDRAW and a digit in the same frame.
Fix: Carry the ruling into the spine — the mulligan is not a latched spend and never produces a denied pulse or a lock; the button simply vanishes and is never lit under a locked view.

**[Input 4.2]** — The belt digit must be stated as edge-gated against the ability FIFO (§ Input 4 — EXPERIENCE L149, L80; architecture D21 L879–884; `keyboard.ts:477–480, 531–541, 551–556`) `[v3]` · **spine fix**
Belt instants ride the FIFO the boost does, which queues up to `SLOT_COUNT` (nine under v3) presses — it will as happily queue OS auto-repeat of a held `1` at ~30 Hz: nine heals from one hold. The shipped digit handler IS edge-gated, but that is the refit path; the belt path is unbuilt and routes through a different entry.
Fix: One sentence in L149 — "one physical press = one consumable; OS auto-repeat never fires a second."

**[Input 4.3]** — The decoy prime inherits the weapon prime rules, but the spine never says which (§ Input 4 — EXPERIENCE L80, L104, L146, L149; GDD L172 "same equipment interface"; `keyboard.ts:163–167, 684–686`; `main.ts:3433–3439`) `[v3]` · **spine fix**
Derivable, and worth writing because a belt slot does not LOOK like a weapon slot: same digit again = unprime (revert to the gun, not fire); Q/E/R after the prime replaces it silently; a different belt digit while primed fires that instant AND keeps the decoy prime (independent channels); a click outside the rear arc or past the leash is denied and keeps the prime (the mine's shipped rule); a click inside fires and auto-reverts. The decoy's Selected state is the belt's ONLY amber state — the intended teach — and the Denied row should say a prime is not a denied press.
Fix: The five sentences above in the Hotbar Slot / Selected rows.

**[Input 4.4]** — Instant consumables have no invalid-state rule: SHIELD BLOCK twice REPLACES (a `[DRAFT]` that burns a card), HULL REPAIR at full HP is unaddressed (§ Input 4 — EXPERIENCE L108, L130, L224, L81; architecture D28 L1079–1080; DESIGN L284 — the retired rail REFUSED `AT FULL HP` / `SUNK` with a reason word and a denied pulse) `[v3]` · **needs an Eric ruling**
The architecture's draft is the MOST expensive reading — a double-tap under fire spends two cards for one shield's absorb, and the only tell that one was already up is a thinning ring nobody reads mid-fight. Three coherent readings — replace, refuse-while-active with the denied pulse (the rail's precedent), stack — and the HUD grammar differs (refuse needs the belt slot to show a "not now" state the belt row says it never has: "No cooldown, ever").
Fix: Rule both; L108's Denied trigger list gains or explicitly declines an "already active / at full" clause.

**[Input 4.8]** — A greyed card's digit: the shipped spend latch would produce the forbidden denied pulse and a 1.5 s lock unless the client sends nothing (§ Input 4 — EXPERIENCE L86, L108, L128; architecture D21 L885–889; `main.ts:751–806, 863–893`) `[v3]` · **spine fix**
Both spines say "silent"; the shipped client makes silence impossible by accident — a digit on a greyed card is still `choice < options.length`, `trySpend` sends it, the server no-ops, the latch never acks, every card locks for the timeout, and the latch times out as `'failed'` — firing the exact 80 ms pulse on the exact card the ruling says must not pulse.
Fix: The client rule belongs in the spine — a greyed card's digit (or click) is a no-op that sends nothing: no latch, no lock, no pulse.

### Low (36)

**[Rubric §1]** — Journey B beat 1 carries three texts at once — the pre-v3 beat, the "Re-cut 2026-09-11" parenthetical, and a 2026-08-21 note — so the flow itself is ambiguous (§ Flow coverage — Journey B, beat 1) `[v3]` · **spine fix**
Fix: Keep the re-cut sentence; the rest is log material.

**[Rubric §1]** — `SIGN OUT`, `DELETE ACCOUNT` (with confirm) and the door-refusal `SAIL STARTER DECK` are each named once in an IA cell and appear in no flow or state (§ Flow coverage — IA › Settings overlay; IA › Ship & Deck) `[v3]` · **spine fix**
Fix: One line each in State Patterns naming the surface and what the player sees, or fold into Journey C's failure path.

**[Rubric §2]** — No contrast statement for the loot-tier ramp on the `panel` bed, where it now carries tier on every card and slot (`info`, `storm-readout`, `denied` numerals on `#0A0F0D`) (§ Token completeness) `[v3]` · **spine fix**
All three reviewers computed it and it passes — A11y III 5.74 / IV 5.47 / II 9.02; HUD I 14.4 · II 9.0 · III 5.7 · IV 5.5 · V 11.1 — with III and IV tight ("do not darken either").
Fix: One clause in Contrast, so a consumer does not have to compute it.

**[Rubric §3]** — The Loadout Block renders "the hud-bar's own slot row" — a Pixi grammar — inside a DOM modal; nothing says DOM re-implementation or Pixi render-to-texture (§ Component coverage — DESIGN › Loadout Block; EXPERIENCE › Foundation says the bar is Pixi) `[v3]` · **spine fix**
The Deck Card avoids this by reusing the DOM refit card.
Fix: One clause; otherwise architecture decides by default.

**[Rubric §4 + Input 3.3]** — REDRAW's lifetime after the press and around Tab is unstated: whether the pip fills, the button goes and the new offer renders in place; Tab closes the auto-opened window and takes REDRAW with it; taking the card removes it; and the auto-open must be an EDGE on the level-zero grant (§ State coverage; § Input 3.3 — IA › Countdown; DESIGN › Redraw Button; `upgradeMenu.ts:1331–1354`; `main.ts:854–858`) `[v3]` · **spine fix**
The shipped per-frame `update()` is pinned never to open a closed window, so a naive "if countdown and banked, show" re-opens it every frame after the player closes it; the countdown row reads as if REDRAW persists for the whole 10 s.
Fix: One clause each.

**[Rubric §4]** — Belt stock ceiling unstated: a second copy of a stocked consumable presumably increments `×n`; the per-slot ceiling (catalog cap 5, or up to 10 with the pool) is not written (§ State coverage — Component Patterns › Hotbar Slot) `[v3]` · **spine fix**
Fix: One clause.

**[Rubric §5]** — DESIGN `sources` lists the `.working/` precursors `hud-composite-v3-1.html` and `countdown-results-v3-1.html` (byte-identical to the promoted mocks) and `mockups/shipdeck-1.html`, but not `mockups/hud-composite-3.html` or `mockups/countdown-results-1.html` (§ Visual reference) `[v3]` · **spine fix**
Fix: List the three promoted mocks; drop the identical precursors.

**[Rubric §5]** — Game Feel cites `death-reveal-results-1.html` as "the final frame is the shipped composition"; its F3 predates SPECTATE + MATCH LOG and now LOADOUT (§ Visual reference) `[pre-existing, now stale]` · **spine fix**
The log records that `results.ts` was the reference instead.
Fix: Stamp F3 SUPERSEDED by `countdown-results-1` frame 2.

**[Rubric §5]** — `.working/hotbar-blend-DB-1.html` is still the linked source for "slots, tooltip" in the Components header; the slot grammar moved to `hud-composite-3` and only the tooltip is unchanged (§ Visual reference) `[v3]` · **spine fix**
Fix: Cite it for the tooltip alone.

**[Rubric §6]** — The same numbers restated in three places — frontmatter token, DESIGN row, EXPERIENCE cell (216×226, 388/344 px, 38 %, 5-wide, 236/718/280, 44 px lift) (§ Bloat) `[v3]` · **spine fix**
One edit and the pair disagrees.
Fix: The number lives in the token; prose cites the token.

**[Rubric §6]** — Frontmatter comment blocks (terrain ramp 11 lines, wheel 7 lines) restate the body's Colors rows (§ Bloat) `[pre-existing]` · **spine fix**
Fix: Keep one.

**[Rubric §7]** — Name drift for one thing: the component is **Class Card** in both spines' frontmatter and headings, but "class tile(s)" / "TALL CLASS TILE" in seven places; "hotbar" survives in 26 places for what the token calls `hud-bar`; "Ship & Deck screen" / "SHIP & DECK" / "Ship + Deck v3-1"; catalog shorthands SUPERCAVITATING, TURRET / BARREL (§ Inheritance) `[v3]` · **spine fix**
Fix: One name per thing; the frontmatter key is canonical.

**[Rubric §7]** — Journey B's failure path has "FOULING MINES laid behind her" — FOULING MINES is a one-copy add-on to NAVAL MINES, not a mine she lays (§ Inheritance — facilitator draft, for redline) `[v3]` · **spine fix**
Fix: "naval mines with FOULING".

**[Rubric §8]** — Both spines say `status: final` while the v3 body carries 39 `[ASSUMPTION]`, 13 `[OPEN — Eric]`, 11 `[DRAFT]` and two facilitator-drafted journeys awaiting redline (§ Shape fit) `[v3]` · **spine fix**
Fix: State that `final` covers the 2026-08-21 body and the v3 sections are `draft`, or hold `final` until the redline.

**[Rubric §8]** — The Resolved question register (54 rows) contains rows superseded by later rows of the same table (#42, #43, #44, #46 → #48–#54) and a same-day-reversed row inside #31 (§ Shape fit) `[v3]` · **spine fix**
A "resolved" register carries the resolution; the reversals are log material.
Fix: Collapse each pair to its terminal row with a "via #n" pointer.

**[HUD A6]** — Helm-globe graphics under the 3:1 floor: telegraph ticks silver `.45` → 2.92:1, rudder track silver `.35` → 2.18:1 (§ HUD A — mock L300–312; DESIGN L131, L292) `[v3]` · **spine fix**
The load-bearing marks — phosphor rung, amber needle, amber rudder tick — all pass.
Fix: Ticks and track at `.55`+.

**[HUD A7]** — Idle slot outline silver `.28` → 1.77:1, empty dashed slate `.45` → 1.90:1, ready-weapon phosphor `.4` → 3.01:1 (§ HUD A — the unchanged 2026-07-16 Hotbar Slot row) `[pre-existing]` · **implementer detail**
New only in exposure — EMPTY is the opening state of seven of nine slots (EXPERIENCE L107); the Afterimage register accepts this and the ready/selected states carry the meaning.
Fix: None required; if seven dashed squares read as absence at spawn, empty at `.6`.

**[HUD A9]** — Cooling-slot composites are unspecified and unmocked: no cooling slot in any frame carries a tier numeral, no slot is selected + cooling; `.cd{position:absolute;inset:0}` painted after `.tier` puts the numeral under the `.86` overlay until ~37 % elapsed (§ HUD A) `[v3]` · **spine fix**
Selected + cooling buries the amber inset wash; only the 1 px outline and the amber key chip survive — acceptable (the chip is the ratified dual-code) but unstated.
Fix: One sentence — tier numeral and ammo badge render above the wipe; selected + cooling = amber outline + amber chip + wipe.

**[HUD B6]** — The 38 % dim makes the gun / Shift cooldown numerals unreadable while refitting (`text-primary` at .38 → 3.0:1) — the 2026-07-16 "refit trades attention" trade, now also contradicting "reloads tick on every slot regardless of selection" for the window's duration (§ HUD B) `[pre-existing]` · **spine fix (via the whole-bar dim)**
Fix: None on its own; if slots stay dimmed and globes do not, this is the accepted trade.

**[HUD C3]** — With the ad unit filled (≥1002 px) the group shifts the panel −175 px and the 300 px unit sits at x ≈ 842–1142, over the kill feed's left third at 1366 — Story 7-4 geometry, not v3's (§ HUD C) `[pre-existing]` · **implementer detail**
Fix: None here.

**[HUD D5]** — Colour Hoist swatches at 14 px, two rows of ten (`.hoist2 .sw i{14px}`, wrap 190 px) — DESIGN L308 flags the 20 px token as `[ASSUMPTION]`; twenty hues at one perceptual lightness at 14 px is the 2026-07-16 F18 adjacency problem at 70 % size (§ HUD D) `[v3]` · **spine fix**
The selected ring (2 px void + 1 px t1) is fine.
Fix: The 20 px token in three rows of seven (7 × 20 + 6 × 5 = 170 < 190) fits without widening the tile column.

**[A11y 3.5]** — SAVE has no saved state: legal → lit; pressed → ? (§ A11y 3 — DESIGN L145, L304; EXPERIENCE L45) `[v3]` · **spine fix**
The spine never says what a successful save looks like (a toast? the button dimming again? the dropdown's name losing an unsaved mark?); a screen-reader or low-vision user has no confirmation the edit took.
Fix: One line under THE COPY LAW — leave it empty and ask, but ask.

**[A11y 5.4]** — World-space effects (smoke puffs, chaff repaints, decoy) are outside the motion setting by nature — say so once so nobody wires `motion: off` into the radar (§ A11y 5 — EXPERIENCE L178, L217, L226) `[v3]` · **spine fix**
Fix: One clause — the motion setting governs HUD and camera; the water simulates.

**[A11y 5.5]** — The bank chip's breathing has no motion gate in the shipped `xpRail.ts`; its re-home to the strip tail is the moment to add one (§ A11y 5 — DESIGN L137 `bank-chip … animation: 'breathe 2.4s'`, L280; `hotbar.ts` gates its glows, `xpRail.ts` does not) `[v3, verify]` · **implementer detail**
Not a spine defect if the chip breathes at `off` as a ≥2 s glow — the floor permits it — but "overrides every juice rule" (L178) says it should hold at the dim keyframe.
Fix: One line in the XP Strip row; the gate lands with the move.

**[A11y 5.6]** — The card row's 44 px drop at go-live (344 → 388) is a one-shot layout move; state whether it animates and whether `motion: off` snaps it (§ A11y 5 — DESIGN L251, L283; EXPERIENCE L54; `countdown-results-1.html` L153) `[v3]` · **spine fix**
If it animates, it is camera-class motion under the tiers; if it snaps, say so.
Fix: Either is fine; silence is not.

**[A11y 6.9]** — "Empty is empty" — a depleted belt slot forgets what it held (§ A11y 6 — register #38; EXPERIENCE L107) `[v3]` · **accepted / logged**
Ruled; recorded, not contested. The residue: the digit that fired CHAFF ×1 last minute now fires nothing (denied pulse) and the slot shows no ghost of what it was. The slot tooltip could still name the last stocked line on hover — an ask for Eric, not a finding.
Fix: None.

**[Input 1.1]** — Belt digits pull the left hand off the rudder mid-turn (§ Input 1 Ergonomics — EXPERIENCE L149, L154, L311; `keyboard.ts:464–468, 605–608`) `[v3]` · **accepted / logged**
`3` / `4` lift the index off D; the rudder self-centres on release, so a panic heal briefly straightens the turn — strictly less reach than the retired CTRL+4 stretch, and the forge tested and rejected `Z`–`V`. The belt is the panic row and it costs a tenth of a second of rudder; genre-normal.
Fix: None; logged.

**[Input 1.2]** — Shift tap under a held A (§ Input 1 — EXPERIENCE L152, L166) `[v3]` · **accepted / logged**
The FPS sprint posture; as a TAP the pinky is back in a frame. The objection the log closes is genuinely closed.
Fix: None.

**[Input 2.2]** — Firefox shows the native context menu on Shift+right-click despite `contextmenu` suppression (§ Input 2 — `mouse.ts:99–116`; EXPERIENCE L166) `[v3]` · **spine fix**
Before v3 nobody held Shift in a fight; a right-button slip during a boost tap pops a menu over the knife fight in Firefox, and the menu can eat the `pointerup` a held stream is waiting for. Known-uninterceptible; Chrome / Edge / Safari unaffected.
Fix: List it in the hygiene paragraph beside Sticky Keys as a documented hazard.

**[Input 2.4]** — Two Shift codes; the keydown-edge semantic is implied, not stated (§ Input 2 — EXPERIENCE L152 "Shift (tap)"; `keyboard.ts:477–480, 531–541`) `[v3]` · **spine fix**
Fix: Say the binding is on both `ShiftLeft` and `ShiftRight`; the boost fires on the keydown edge with OS auto-repeat dropped (a HELD Shift is one press, keyup carries no meaning); a press while cooling queues and rides the wire (the server denies, `onAbility` predicts the pulse).

**[Input 3.8]** — Sinking window: the belt and Shift are not covered by "combat inputs stay live" (§ Input 3 — EXPERIENCE L138, L57; architecture D21 L895–897 defers to a shipped gate it never names; `main.ts:828–833`) `[v3]` · **spine fix**
A HULL REPAIR or SHIELD BLOCK press while sinking cannot save the hull — honoured (the card burned for nothing), denied (the pulse), or swallowed (the refit's "once sinking, you're done" posture)? Same for Shift and a decoy prime.
Fix: One sentence.

**[Input 4.7]** — `held` with a non-stream prime: the client must draw nothing (§ Input 4 — architecture D26; EXPERIENCE L110; DESIGN L276) `[v3]` · **implementer detail**
The server side is pinned; the client mirror is missing — the held-fire grammar renders only when the primed slot is a stream kind AND the pool is draining, never from the pointer level alone, or a mine-primed player who holds the button sees an amber drain on a slot that is not firing.
Fix: One sentence.

**[Input 4.9]** — Stale or self-contradicting rows after the v3 rewrite (§ Input 4 — EXPERIENCE L146, L147, L149, L150, L160; `keyboard.ts:97–103, 113`; `hud-composite-3.html` L330) `[v3 / pre-existing]` · **spine fix**
L146 (Q/E/R) still ends "Abilities activate instantly" — nothing on Q/E/R is an ability under v3; L147 (F) says the digits are "suspended" while the window is open — they PICK (L149); L150 says `5` is "unbound" but `Digit5` AND `Numpad5` are bound today, and the numpad aliases (`Numpad1`–`4`) are never mentioned — they now also fire the belt; L160 (Enter) omits the settings overlay's armed confirm (ABANDON MATCH — pre-existing) and v3's DELETE ACCOUNT; the ratified mock's chamfered Shift (the HUD Medium above).
Fix: Strike or correct each row.

**[Input 4.10]** — Hotbar click-equivalence for the Shift and belt slots is not stated (§ Input 4 — EXPERIENCE L80; `mouse.ts:18–21, 107`; `keyboard.ts:485–500`) `[v3]` · **spine fix**
Nine slots now: clicking the gun square selects the gun, clicking Shift boosts, clicking a belt square fires / primes, clicking a greyed card is a no-op. All correct by construction and none written; the belt is the first slot group a player might reasonably try to CLICK rather than key.
Fix: One sentence in L80.

**[Input 5.1]** — The decoy's click-to-fire is taught only by the Selected state (§ Input 5 Discoverability — EXPERIENCE L80, L104; decision log L19+82) `[v3]` · **accepted / logged**
Eric struck "KEY PRIMES · CLICK FIRES" from the face by ruling; press `1` on a stocked decoy, the square goes amber, the rear arc draws, nothing fires — a newcomer learns it in one press at no cost.
Fix: Log it; How-to-Play's re-cut EQUIPMENT section is where the sentence lives.

**[Input 5.2]** — Class tiles: if `1`–`3` bind, the tiles must say so (§ Input 5 — EXPERIENCE L45 `[ASSUMPTION]`, L89 the truthfulness rule; DESIGN L155 / L300 tile anatomy carries no key; `shipdeck-1.html` no key hints) `[v3]` · **needs an Eric ruling**
The reverse of the 2026-07-16 gap (a rendered key with no binding): a binding with no rendered key. The settings reference is post-join only and How-to-Play describes the water.
Fix: Either the tiles carry a chip (DESIGN's one chip family) or the binding is dropped as unteachable.

## Needs an Eric ruling (23)

In the order the E8 / E9 stories will hit them: the deck card at ×0.6 together with the 1318 px layer under browser zoom · the five sub-9 px registers · the whole-bar dim · the refit band at 768 and the 125 % height gate · the bar over aimable water · Ship & Deck edge states · `×` delete confirm and the deck floor · the Ship & Deck keyboard model (focus unit, Enter) · the shield rings and numeral, with the shielded-hit cue · the consumable faces (How-to-Play table, tooltip on focus) with the activation-channel contradiction · the 1–4 post-close grace · the machine-gun revert instant · Shift+Tab · Shift under the refit window · the countdown key map and a REDRAW key · instant consumables' invalid states · the tenths cadence · progress readouts under `motion: off` · remapping's fresh reason · class-tile key chips.

## Mechanical notes

- **Dedupe arithmetic:** 110 raw findings (rubric 29 · HUD 22 · accessibility 33 · input 26; 1 / 23 / 43 / 43 by severity) → 86 after 19 cross-reviewer merges absorbing 24 duplicates (two of them intra-reviewer restatements the reviewer itself flagged: Rubric §2 ↔ §8, A11y 1.1 ↔ 5.1). A merged entry takes the highest severity raised. Partial overlaps were cross-referenced, not merged (the chamfer bullet inside Input 4.9; HUD B6 under the whole-bar dim). Every reviewer's own totals reconcile with its table rows.
- **Cross-refs:** 58 distinct `{path}` references in DESIGN (body + component values), 24 in EXPERIENCE; every one resolves. Six frontmatter components (`br-chrome`, `kill-feed`, `class-chip`, `color-hoist`, `modal`, `toast`) are never referenced by `{components.…}` from their own DESIGN rows — harmless.
- **Links:** every `.md` link (peer spine, `imports/`, `reconcile-design-v016.md`, this report) and every `.html` link resolves. The three `.working/` precursors named in the frontmatter are byte-identical to their promoted `mockups/` copies (`cmp` clean).
- **Sources:** all five path-bearing DESIGN entries resolve on disk. EXPERIENCE's `epic-1..7 context amendments` — no epic-1 amendments file exists (`epic-1-context.md` only; amendments run 2–7); `game-architecture.md amendments …` carries no path (it is `_bmad-output/game-architecture.md`).
- **Names:** 40 frontmatter components ↔ 42 DESIGN rows ↔ 14 EXPERIENCE Component Patterns bullets (the gap is a Medium above). Kebab key ↔ Title Case prose is consistent; the drifts are the Low under Inheritance.
- **Numbers cross-checked:** pool of 10 / 50 at queue, 40 authored, ≤3 equipment lines, 29 lines / 114 cards, 216×226, 5 rows, 388/344 px, 236·718·280 = 1234 + gutters at 1318, deck-card 130×152 = 0.6 × (226 + 28) — consistent across the pair and with `gdd.md` / `catalog-v3.md` / the mocks.
- **Contrast arithmetic:** HUD and A11y computed independently and differ in the second decimal (the greyed foot word 2.61 vs 2.70:1; the bar top 622 vs ≈630) — every verdict agrees; both readings are recorded in the merged entries.
- **Tag inventory:** DESIGN 8 `[ASSUMPTION]` · 13 `[OPEN]` (4 Eric, 6 not-mocked, 2 icon/effects, 1 z-register) · 5 `[DRAFT]` · 4 `[PROPOSAL]`; EXPERIENCE 32 `[ASSUMPTION]` · 9 `[OPEN — Eric]` · 6 `[DRAFT]`. Each carries an owner or a condition; none is smuggled as fact.
- **Unverified (specified, shown in no mock — listed, not failed; HUD § E):** the shield ring on the HP globe and the hull ring; the HP globe's <50 % amber / <25 % damage-marker fills and the waterline's colour in those states; CHAFF (no owner-side surface by design); SMOKE SCREEN puffs vs wounded smoke on a moving hull; machine-gun tracer, missile trail, flak air-burst, monitor arcing shell (`[OPEN — icon/effects pass]`); DECOY BUOY in the owner's hue with the owner-only HP readout; a 4/4 stocked belt, a belt slot SELECTED, the slot tooltip over a v3 card, the dropdown MENU, `+ NEW DECK`, match history; and no 90 % or 125 % frame for the bar, refit window or results modal — every scale number is arithmetic on the 100 % CSS.
- **Verified clean and recorded so they are not re-raised:** the cooldown numeral's contrast (15.6:1 over the wipe) and fit (`1.2` in a 54 px slot at 90 %); the countdown seams (63 / 12 / 10 px); the tier ramp as text on `panel`; the Ship & Deck 24 px gutters and vertical stack; the deck column registers; key chips 5.4:1, `TAB TO REFIT` 6.7:1, the bank chip's 2.4 s breathe; the copies rail's three-state coding by fill + a 5.4:1 luminance step (the best-coded control in the system — a future "tidy" that swaps silver for a second green would break it); smoke-vs-wounded-smoke ruled by SHAPE and chaff ruled tell-less; the machine gun's one-denial-then-silence; the anonymous Ship & Deck screen's "absence by capability, never by layout"; the `TONE_TWINS` type-level guarantee surviving v3; the shipped input chokepoint (one keydown, preventDefault on every bound key, modifier chords native) and atomic-at-keydown shipped verbatim.
- **Ready to write without a ruling (Input's own list):** 4.5, 4.2, 4.3, 4.8, 4.7, 4.9, 4.10, 3.2, 3.3, 3.7, 3.8, 2.2, 2.4 — all derivable from shipped code plus the architecture's D20–D30.
- **Size:** DESIGN 12,310 words / 334 lines; EXPERIENCE 16,043 words / 386 lines; 52 `SUPERSEDED` markers; 88 strikethrough runs.

## Reviewer files

- `review-rubric.md` — spine-pair rubric walk (8 categories; State thin, Bloat broken; 3 high / 9 medium / 17 low)
- `review-hud-legibility.md` — adversarial HUD legibility ("information noise must never bury the hunt"; 0 / 7 / 8 / 7, three pre-existing; eight unverified)
- `review-accessibility.md` — adversarial accessibility audit (CONDITIONAL PASS — the floor is specified for every new state, and the ratified mocks violate it in three places that need Eric's re-cut; 1 / 10 / 15 / 7)
- `review-input-scheme.md` — adversarial input-scheme review (no critical, nothing blocks the spine; the under-specification is lifetimes, not bindings; 0 / 3 / 11 / 12)

## Dispositions (2026-09-11, same day — Eric rulings taken at the gate)

The 23 "needs an Eric ruling" findings above were compiled from the four review files; the two ruling rounds that followed dispose of them as below. Rulings are recorded verbatim in `.decision-log.md`; the spines and the promoted mocks carry them.

| Finding | Disposition |
|---|---|
| Collection grid card at ×0.6 (critical) | **RULED** — compact grid tile (glyph · name · rail; full card on hover); mocks re-rendered |
| Five mono registers under the 9 px floor | **RULED** — raised to 9 px; helm globe 96 → 104 px |
| Whole bar dims to 38 % under refit | **RULED** — slot groups only; globes, helm, XP strip at full |
| Refit band placement constraints | **RULED** — row keeps 388 px; own-hull keep-out waived (live and countdown) |
| Bar over aimable water astern | **ACCEPTED, not a defect** — zoom is the remedy; click gate stands |
| Ship & Deck edge / failure states | **RULED** — the five-rule set (delete confirm + last-deck floor; CONFIRM saves-if-legal else blocks; rung cancels on ESC / click elsewhere; unaffordable rung inert; names 1–16 chars) |
| `×` delete without confirm | **RULED** — confirm; cannot delete a hull's last deck |
| Keyboard model / focus order for Ship & Deck | **WAIVED BY SCOPE** — "You need the mouse to target/fire, NO ONE is keyboard-only." |
| Shield: two same-modality halves, no number | **RULED** — HP register reads hull + shield (`HULL 312/250`) in a changed colour, reverting on deplete/expire; rings alongside the number **OPEN — Eric** |
| Shielded hit has no absorb/expire cue | **OPEN — Eric** (non-blocking) |
| Consumable faces numbers-not-meaning; hover-only tooltip | **RULED** — face stands (no prose by ruling); keyboard path waived by scope; explanations live in How-to-Play (standing rule) |
| 1–4 mash across the window's auto-close | **RULED** — digits inert for a short grace after close |
| Auto-revert at press-down kills the stream | **RULED** — revert on release, never on press; stream enders: pointer-up, arc exit, empty pool, Tab, focus loss |
| GDD "the card face says which" vs "never says which" | **CORRECTION OWED UPSTREAM** — listed in the log's corrections entry for the epics run |
| Cooldown tenths as a 10 Hz text channel, untiered | **OPEN (non-blocking)** — carried as the spine's `[ASSUMPTION]` that progress readouts take no attention tier |
| Progress readouts under `motion: off` | **OPEN (non-blocking)** — same assumption; information, not motion, is the working reading |
| Countdown key map / REDRAW has no key | **DISPOSED BY SCOPE** — REDRAW is a mouse button; Tab is live during the countdown (spine) |
| Key remapping deferral's stale reason | **OPEN — Eric** (non-blocking; deferral itself unchanged) |
| 1318 px layer vs browser zoom at the floor | **PRE-EXISTING POSTURE** — the shipped class layer is already 1318 px; no v3 change |
| Shift+Tab prevented-inert | **IMPLEMENTER DETAIL** — spine `[ASSUMPTION]`: Shift+Tab reaches Tab |
| Shift under the refit window | **OPEN (non-blocking)** — spine `[ASSUMPTION]`: suspended with the slots |
| Instant consumables' invalid states (shield ×2 replaces; heal at full HP) | **`[DRAFT]` / OPEN (non-blocking)** — architecture D28's replace default stands as `[DRAFT]` |
| Class tiles and the 1–3 binding | **PRE-EXISTING** — the shipped class layer binds 1–3 with no chip today; carried unchanged |
