# Extract — spine collisions with v3 (E8 The Deck + E9 The Account)

**Run:** ux-Hullcracker.io-2026-07-16, update 2026-09-10 (decision log L83-85).
**Sources read in full:** `DESIGN.md` (294 lines, `updated: 2026-07-16` in frontmatter, body reconciled 2026-08-21), `EXPERIENCE.md` (324 lines, `updated: 2026-08-21`), `.decision-log.md` (85 lines incl. the v3 opener).
**Method:** every line of both spines walked against the v3 change list; each hit recorded with file · section · line · a ≤25-word verbatim quote · the v3 change that hits it. Nothing below proposes a design — it maps where the existing text will have to move, and where it has no home for what v3 adds. Line numbers are the `cat -n` numbers of the files as they stand in the `gds-ux-v3` worktree on 2026-09-10.

**v3 change keys used in the tables** (from the update brief, so the editor can filter):

| Key | v3 change |
|---|---|
| **W-SLOTS** | Three GENERIC weapon slots on Q/E/R, all EMPTY at 0:00; the fixed per-class fit (Q=gun, E/R=class specials) is gone |
| **DECK-GUN** | The gun becomes a slotless "deck gun", always fitted, on no hotbar key |
| **C-SLOTS** | Four CONSUMABLE slots on 1–4, used with Tab closed; 1–4 still pick cards while Tab is open |
| **HEAL-CARD** | The `5` key and the DAMAGE CONTROL rail are RETIRED; heal is a stockable HULL REPAIR consumable card |
| **DRAW-PILE** | A draw-pile counter on the HUD counting down from 50 |
| **SPAWN-0** | Spawn with only the deck gun + a universal Shift boost, level ZERO at countdown start |
| **MULLIGAN** | One free redraw of the opening offer during the countdown |
| **CARD-FACE** | Tab offer cards: minimal face + hover tooltip; a card for a FULL consumable slot is greyed and the server refuses the pick |
| **DEL-BOOST** | Speed-boost EQUIPMENT deleted (Shift boost is universal, off the hotbar) |
| **DEL-BUOY** | Radar buoy (and decoy buoy AS EQUIPMENT) deleted |
| **DEL-ACQ** | The acquisition card ("taking one burns the rest") deleted |
| **NEW-WPN** | New weapon lines: light / heavy / supercavitating torpedo, horizontal missile, machine gun (held-fire stream), flak gun, monitor gun, captive mines as its own line |
| **NEW-CONS** | New consumables: HULL REPAIR, SHIELD BLOCK, SMOKE SCREEN, CHAFF, DECOY BUOY |
| **RESULTS-DECK** | Results modal shows your own deck (brought / drawn / taken) |
| **HOME-2** | Home becomes two-state: anonymous vs signed-in (Google/Discord OAuth, no guest tier) |
| **DECK-ED** | Deck editor |
| **DECK-JOIN** | Deck selection at join |
| **ACCT-BAR** | Account level bar + unlock tokens + whole-line unlocks |
| **HISTORY** | Match history |

Severity column: **SUPERSEDE** (the passage becomes false), **CHANGE** (the passage stays but its content moves), **EXTEND** (the passage stays true and v3 adds to it), **NOTE** (touched only by a stale number or a cross-reference).

---

## 1. Collision table

### 1a. DESIGN.md

| # | Section | Line(s) | Verbatim (≤25 words) | v3 hit | Sev |
|---|---|---|---|---|---|
| D1 | frontmatter `updated:` | 7 | `updated: 2026-07-16` | Any v3 edit must move this stamp (EXPERIENCE's is 2026-08-21; DESIGN's never moved at the 7-6 reconciliation) | NOTE |
| D2 | frontmatter `colors:` combat effects | 60-65 | `torpedo: '#CFE8DD' # promoted from the composite mock` | NEW-WPN — one on-water torpedo token for three torpedo lines; no token for missile, flak, MG stream, monitor gun | EXTEND |
| D3 | frontmatter `components: hotbar-slot` | 120 | `hotbar-slot: { size: '54px', border: '1px solid rgba(192,192,192,.28)', background: 'transparent' …` | W-SLOTS / C-SLOTS — the one slot token now has to serve a weapon slot AND a consumable slot (no consumable-slot token exists) | EXTEND |
| D4 | frontmatter `components: ammo-badge` | 121 | `ammo-badge: { size: '16px', color: '{colors.phosphor}' …` | C-SLOTS (stockable consumables carry a count), NEW-WPN (MG held-fire) — badge semantics widen from "rounds stored" | EXTEND |
| D5 | frontmatter `components: bank-chip` | 122 | `bank-chip: { size: '30px' … 'breathe 2.4s, decays to static glow after ~10s unspent' }` | SPAWN-0 / MULLIGAN — the chip's first appearance now happens at countdown (opening offer), not on the first kill | NOTE |
| D6 | frontmatter `components: xp-rail` | 123 | `xp-rail: { width: '3px', track: 'rgba(0,255,136,.12)', fill: '{colors.phosphor}' }` | SPAWN-0 (level zero at start) — the `LV n` foot tag starts at 0; DRAW-PILE has no token and this is its nearest neighbour | NOTE |
| D7 | frontmatter `components: refit-card` | 124 | `refit-card: { width: '216px', border: '1px solid rgba(192,192,192,.28)', background: '{colors.panel}' …` | CARD-FACE — needs a greyed / server-refused state; MULLIGAN needs an affordance; DECK-ED reuses (or not) this card | EXTEND |
| D8 | frontmatter `components: slot-tooltip` | 125 | `slot-tooltip: { width: '236px', background: 'rgba(10,15,12,.97)' …` | W-SLOTS — hotbar tooltip content ("BOONS ACCRUED") changes when the slot holds a drawn weapon card; CARD-FACE's refit-card tooltip has NO token of its own | EXTEND |
| D9 | frontmatter `components: hp-rail` | 126 | `hp-rail: { note: 'vertical phosphor rail, right edge of own-vitals cluster …' }` | HEAL-CARD — rail itself survives; its only heal partner (the DAMAGE CONTROL regen pool) goes | NOTE |
| D10 | frontmatter `components: damage-control-rail` | 132 | `damage-control-rail: { height: '40px', keyChip: '22px', fontSize: '16px', seamAboveIt: '6px' …` | HEAL-CARD — token RETIRED outright | SUPERSEDE |
| D11 | frontmatter `components: results-ad` | 134 | `results-ad: { slotWidth: '300px', pad: '12px', gap: '24px from the results panel' …` | RESULTS-DECK — a taller/wider results panel moves the "panel + gap + column centre as one group" arithmetic | NOTE |
| D12 | frontmatter `components: class-card` | 135 | `class-card: { width: '356px', background: '{colors.panel-deep}', rounded: '10px' }` | W-SLOTS / DECK-JOIN — the card's "two special-slot rows keyed Q/E" content (L270) is gone; deck selection needs a surface | CHANGE |
| D13 | frontmatter `components: class-chip` | 136 | `class-chip: { background: '{colors.panel-deep}', border: '1px solid <personal color>' …` | HOME-2 / DECK-JOIN — the chip's "what you'll sail" promise no longer includes a fit | NOTE |
| D14 | frontmatter `components: button-primary` | 138 | `button-primary: { color: '{colors.amber}', style: 'outline + glow, never filled slab' }` | HOME-2 — the only button token; sign-in (Google/Discord) buttons have no token, and the unlit-secondary treatment used by SOLO VS AI is itself UNRULED | EXTEND |
| D15 | frontmatter `components: modal` | 139 | `modal: { background: '{colors.panel}', border: '1px solid {colors.hairline}', rounded: '{rounded.lg}' }` | DECK-ED / HISTORY / DECK-JOIN / HOME-2 sign-in — new port surfaces; only "modal" exists as a container token | EXTEND |
| D16 | frontmatter `components: toast` | 140 | `toast: { color: '{colors.phosphor}', fontSize: '16px', ttl: '3s' }` | W-SLOTS / C-SLOTS — "boon fitted" toast semantics when a card fills a slot or stocks a consumable | NOTE |
| D17 | Colors table › Amber | 166 | `Selected / armed / action / warning: selected slot, SET SAIL, final-10s ring pulse, <50% HP` | W-SLOTS / DECK-GUN — "selected slot" grammar: the default-selected gun leaves the hotbar; `SET SAIL` is already retired copy | NOTE |
| D18 | Regatta Hoist › Propagation | 187 | `ordnance truth-markers (mines, lit zones, radar buoys) render in the firer's hue for all observers` | DEL-BUOY — radar buoy leaves the list; NEW-CONS — DECOY BUOY / SMOKE SCREEN / CHAFF need a hue rule (firer's hue or not) | CHANGE |
| D19 | Regatta Hoist › Propagation | 187 | `The decoy buoy and the whole decoy role are DELETED (Story 7-5 wave 2 …): the RADAR BUOY replaced it, nothing fakes a ship contact any more` | DEL-BUOY + NEW-CONS — REVERSAL: the radar buoy is now the deleted one and the DECOY BUOY returns as a consumable; "nothing fakes a ship contact" becomes false | SUPERSEDE |
| D20 | Ship-class silhouette table | 201-203 | `"The stern is the weapon" — business end faces backward` | W-SLOTS — class rationales were written against fixed fits (ML = mines aft); with generic slots the class is hull-only. Geometry itself untouched | NOTE |
| D21 | Layout & Spacing | 228 | `HUD anatomy is corner-anchored …: hotbar + XP rail bottom-left, own-vitals bottom-right, BR chrome top-center, kill feed top-right` | C-SLOTS / DRAW-PILE — four consumable slots and a counter have no corner assigned | EXTEND |
| D22 | Elevation & Depth › Glow | 234 | `phosphor/amber box-shadow bloom on active elements (e.g. selected slot 0 0 16px rgba(255,184,0,.4) + inset wash)` | W-SLOTS — selected-slot example survives only if generic weapon slots keep a selected state | NOTE |
| D23 | Elevation & Depth › z-order | 237 | `DOM z-scale: feed/toasts 900 · modals/banner 1000 · menu 1100 (formalized from today's informal values)` | DECK-ED / HISTORY / HOME-2 sign-in / DECK-JOIN — new DOM surfaces need rungs on this ladder (and the retired z-1250 rung in L278 may not be reclaimed without "a fresh cut of the register") | EXTEND |
| D24 | Shapes › Activated-ability mark | 242 | `chamfered top-right corner (9px cut on 54px slots …) distinguishes press-to-trigger abilities from switch-to weapons` | DEL-BOOST — the ONLY chamfered slot (speed boost) is deleted; C-SLOTS are press-to-trigger and NEW-WPN adds a HELD-fire class (MG stream) the two-class grammar cannot express | CHANGE |
| D25 | Components intro (key-chip family) | 248 | `beside the hotbar slots, the gun is KEYLESS … with Q and E on the two class specials and R on the pickup/extra slot, top-to-bottom Gun–Q–E–R` | W-SLOTS / DECK-GUN / DEL-ACQ — the whole Gun–Q–E–R column and the "pickup/extra slot" are gone; `equipmentInfo.ts:28` cite goes stale | SUPERSEDE |
| D26 | Components intro (key-chip family) | 248 | `on refit cards the chips are 1–4, with 5 on the DAMAGE CONTROL rail below the row and Tab opening the window` | HEAL-CARD (`5` retired) / C-SLOTS (1–4 chips now also live on consumable slots — one chip family, two homes) | SUPERSEDE |
| D27 | Components › Hotbar Slot | 252 | `Ready ability: phosphor .65 outline + 14px glow + chamfer.` | DEL-BOOST — no hotbar ability remains; C-SLOTS / SPAWN-0 Shift boost need their own ready grammar | CHANGE |
| D28 | Components › Hotbar Slot | 252 | `Empty (offer): 1px dashed slate .45, + glyph, "— awaiting refit —".` | W-SLOTS — "empty" was the R-slot exception; at 0:00 ALL THREE weapon slots and all four consumable slots are empty, so this is the opening state of the whole stack | CHANGE |
| D29 | Components › Hotbar Slot | 252 | `Selected: {colors.amber} outline, 0 0 16px glow + inset wash, key + name flip amber` | W-SLOTS / DECK-GUN — selected-state grammar must say what "selected" means when the always-fitted gun is off the bar | CHANGE |
| D30 | Components › Hotbar Slot | 252 | `icon in currentColor inline vector, mono key glyph left of square, label column right` | NEW-WPN / NEW-CONS — the inline-vector icon set (`equipmentIcons.ts`, code-side) gains ~13 icons; the spine names no icon catalog | EXTEND |
| D31 | Components › Ammo Badge | 253 | `mono count pinned top-right (−7px overhang) of slots storing >1` | C-SLOTS — a stocked consumable is a count on a slot; NEW-WPN MG stream may have no discrete count | EXTEND |
| D32 | Components › Banked-Level Chip | 254 | `Tab (open) · 1–4 (pick) · 5 (DAMAGE CONTROL) is the ratified refit binding — Eric ruling 2026-08-21, question gate D1` | HEAL-CARD — the `5` third of the ratified binding is retired | SUPERSEDE |
| D33 | Components › Banked-Level Chip | 254 | `Cue line beside: LEVEL UP — TAB TO REFIT … suppressed whenever the bank cannot actually be acted on` | MULLIGAN / SPAWN-0 — a bank now exists at countdown with a redraw available; "cannot be acted on" gains a countdown case | EXTEND |
| D34 | Components › XP Rail | 255 | `fills upward toward next level, LV n mono tag at foot` | SPAWN-0 — `LV 0` is now a rendered state (no "level 1 at spawn" clause exists anywhere in either spine — the level-zero change touches only this tag and Journey A beat 4) | NOTE |
| D35 | Components › Refit Card | 256 | `key chip (22×22 outlined square, overhanging top-left); a meta row of category tag (… it drives the 1–4 pick)` | C-SLOTS — 1–4 chips keep their refit role while Tab is open; the same chips now also address consumable slots when it is closed | EXTEND |
| D36 | Components › Refit Card | 256 | `one text row — a stat card's live current → next sentence (15px), empty for a verb or acquisition card` | DEL-ACQ — "acquisition card" leaves the face grammar; NEW-WPN / NEW-CONS — a weapon card and a consumable card are new face kinds | CHANGE |
| D37 | Components › Refit Card | 256 | `The explanation is HOVER-ONLY, in the band's own tooltip panel — the Tab/1–4/5 shortcut exists to skip the reading` | CARD-FACE (retained and confirmed) / HEAL-CARD (`5` in the shortcut copy) — and note the "band's own tooltip panel" has no `components:` token | CHANGE |
| D38 | Components › Refit Card | 256 | `container-fit law (row.y + cardHeight + stripGap + stripHeight ≤ H), which between them leave seven pixels of slack` | HEAL-CARD — `stripHeight` IS the DAMAGE CONTROL rail; retiring it re-derives the band arithmetic (and frees 40px + 6px at the floor viewport) | CHANGE |
| D39 | Components › Refit Card | 256 | `Cards never wrap to a grid — the 1–4 keys map spatially.` | DECK-ED — a deck editor is a card GRID by nature; this anti-grid law is scoped to the in-match row and must be re-scoped or the editor cannot reuse the card | EXTEND |
| D40 | Components › Refit Card | 256 | `The DAMAGE CONTROL rail hangs one 6px seam below the row (its own row below).` | HEAL-CARD | SUPERSEDE |
| D41 | Components › Refit Card | 256 | `Armed (hover/pending): amber outline + glow, key/category/name flip amber, arm-hint line appears.` | CARD-FACE — no greyed/refused state exists in the card's state list; the nearest "inert + reason word" grammar lives on the rail being retired (L257) | EXTEND |
| D42 | Components › DAMAGE CONTROL Rail | 257 | `the always-present heal spend, a sibling of the refit card row rather than a member of it — never drawn, never exhausted, never in an offer` | HEAL-CARD — whole row RETIRED; heal is now drawn, exhaustible, and in the offer | SUPERSEDE |
| D43 | Components › DAMAGE CONTROL Rail | 257 | `Two states, dual-coded so nothing rides on hue: armed … inert — the server would refuse the pick (AT FULL HP, SUNK)` | HEAL-CARD retires it — but CARD-FACE's "greyed and the server refuses the pick" is the SAME dual-coding problem (dim alone is lightness only); the reason-word precedent is being deleted with the rail | CHANGE |
| D44 | Components › Slot Tooltip | 258 | `"BOONS ACCRUED" divider, boon list (◆ Name phosphor + effect line, qualitative Hades-style)` | W-SLOTS — what a slot tooltip lists when the slot holds a drawn weapon line + its upgrades; C-SLOTS — a consumable-slot tooltip | EXTEND |
| D45 | Components › HP Rail | 259 | `HULL 72/100 mono header.` | HEAL-CARD — rail survives; example number already stale (HP doubled at cycle 122); no regen-pool readout partner remains | NOTE |
| D46 | Components › Telegraph Cluster | 262 | `W/S key glyphs sit at the ladder ends and A/D at the rudder track extremes` | SPAWN-0 — the universal Shift boost is a helm-hand key with no readiness/cooldown home; the telegraph cluster is the nearest helm surface, but nothing is assigned | EXTEND |
| D47 | Components › Torpedo (on-water) | 268 | `{colors.torpedo} hull dash + wake astern; materialization = pale boundary rings at the sighting point` | NEW-WPN — three torpedo lines (light/heavy/supercavitating) share one render spec; missile/flak/MG/monitor have none | EXTEND |
| D48 | Components › Torpedo (on-water) | 268 | `Mines render in the owner's personal hue at truesight` | NEW-WPN — captive mines as its own line; NEW-CONS — DECOY BUOY, SMOKE SCREEN, CHAFF on-water renders unspecified | EXTEND |
| D49 | Components › Combat Effects | 269 | `Miss splash … Muzzle flash … Hit Call bloom … Sink ring … Wounded smoke … All hue picks [PROPOSAL].` | NEW-WPN / NEW-CONS — flak burst, missile trail, MG stream, SHIELD BLOCK visual, smoke screen (vs wounded smoke — same grey?) all unlisted | EXTEND |
| D50 | Components › Class Card | 270 | `3 pip scales (SPEED/ARMOR/TURNING …), two special-slot rows keyed Q/E, pick button. No fantasy line, no GUN row` | W-SLOTS — the Q/E special-slot rows describe a fit that no longer exists; DECK-JOIN — deck choice has to live near the class pick | SUPERSEDE |
| D51 | Components › Class Chip | 271 | `silhouette at 44px + role tag (mono 10px muted) + class name (21px/700 in personal color) + sub-line + "CHANGE"` | HOME-2 / DECK-JOIN — the chip is the home's "what you'll sail" glance; a deck is now part of that | EXTEND |
| D52 | Components › Primary Button | 273 | `sub-line for context ("DEPLOY AS TORPEDO BOAT · SOLO")` | DECK-JOIN — deploy sub-line may need the deck; HOME-2 — sign-in buttons are not this register (amber = the ONE action) | NOTE |
| D53 | Components › Phase / Status Text | 274 | `Countdown ("MATCH STARTING" + big center count) and phase tags ("WEAPONS SAFE", "AWAITING CAPTAINS n/2")` | MULLIGAN / SPAWN-0 — the countdown now hosts an interaction (opening offer + redraw) under a `MATCH STARTING` register designed as text-only | CHANGE |
| D54 | Components › Modal | 275 | `Results modal banner colors: three outcomes … Fullscreen dim behind results … the omniscient reveal is the backdrop` | RESULTS-DECK — a deck block (brought / drawn / taken) joins the modal; the thin `.62` dim was chosen so the reveal shows THROUGH a modal of the current height | EXTEND |
| D55 | Components › Results Ad Unit | 277 | `the panel's −175px shift happens only when the ad has actually filled … (panel + 24px gap + column, ≥1002px viewport)` | RESULTS-DECK — group-centring breakpoint assumes today's panel width | NOTE |
| D56 | Components › Privacy & Consent | 278 | `the /privacy policy page itself, on the standard DOM port-chrome surface; and (3) a PRIVACY › ANALYTICS toggle row in the settings overlay` | HOME-2 / HISTORY — OAuth (Google/Discord) + stored match history are new data processing the policy page must claim; "every sentence is a claim about shipped behaviour" | EXTEND |
| D57 | Do's and Don'ts | 285 | `The ability chamfer, class silhouettes, drone chevron, and pip geometry exist for this.` | DEL-BOOST — the chamfer loses its only wearer unless re-assigned (C-SLOTS / Shift) | NOTE |
| D58 | Do's and Don'ts | 286 | `the refit card's storm-readout rung III of the loot-tier lineage ramp` | CARD-FACE — ramp retained; NEW-WPN / NEW-CONS lines have copy counts the ramp must still fit (I–V absolute) | NOTE |
| D59 | Do's and Don'ts | 292 | `Do render every key glyph (slots, cards, helm gauges) in the same mono key-chip family.` | SPAWN-0 (a `Shift` chip), C-SLOTS (1–4 chips on slots) — new glyphs join the family | EXTEND |
| D60 | Do's and Don'ts | 294 | `keep silhouette geometry consistent everywhere a hull appears (water, blip, class card, results)` | DECK-ED / HISTORY — if a deck or history row shows a hull, it joins this list | NOTE |
| D61 | Components intro (mock list) | 248 | `[spend-window-2.html] (refit cards, bank chip, spend-failure …), [hud-composite-2.html] (full HUD …)` | All v3 keys — both ratified mocks predate every v3 surface (no consumable slots, no draw pile, no greyed card, `5` rail present) | NOTE |
| D62 | Colors table › Phosphor | 163 | `HUD chrome accent: ready states, XP rail, banked chip, toasts, sweep` | DRAW-PILE / C-SLOTS — if the counter and consumable ready states are phosphor-functional they extend this row's "Use" | NOTE |

### 1b. EXPERIENCE.md

| # | Section | Line(s) | Verbatim (≤25 words) | v3 hit | Sev |
|---|---|---|---|---|---|
| E1 | frontmatter / reconciliation stamp | 6, 22 | `Anything still unbuilt is marked as deferred rather than described as if it shipped.` | All — the stamp's promise means v3 surfaces must enter as DEFERRED-until-built or the document breaks its own rule | NOTE |
| E2 | Foundation › Render split | 27 | `DOM only for chrome (home, class-select layer, queue modal, results, settings, How-to-Play, privacy policy, kill feed, toasts)` | DECK-ED / HISTORY / HOME-2 sign-in / DECK-JOIN — new DOM chrome surfaces; C-SLOTS / DRAW-PILE are Pixi HUD (the split must say which) | EXTEND |
| E3 | Information Architecture › journey spine | 34 | `home → class select → queue (Solo) or instant create (Solo vs AI) → boarding … → return to port → re-queue from home. Nothing is deeper than one layer from the water.` | DECK-JOIN inserts a step; DECK-ED / HISTORY / ACCT-BAR are port surfaces DEEPER than one layer | CHANGE |
| E4 | IA table › Home (at rest) | 38 | `Wordmark, callsign field (14-char cap), Class Chip …, MODE ROW …, How-to-Play link, server-status line, settings gear, bottom-left liveness register, version register` | HOME-2 — the row describes ONE home state; anonymous vs signed-in (sign-in door, account level bar, deck chip/picker, history entry) is two | SUPERSEDE |
| E5 | IA table › Home (at rest) | 38 | `The mode buttons carry NO sub-line at all (epic-6 amendment 50 …)` | HOME-2 / DECK-JOIN — a deck name is the obvious candidate for a sub-line; the ruling says none | NOTE |
| E6 | IA table › Class-Select Layer | 39 | `Keys: 1–3 / arrows highlight, Enter picks, ESC closes without change` | DECK-JOIN — where deck selection lives relative to the class layer; W-SLOTS — Class Card rows (E19) | EXTEND |
| E7 | IA table › How-to-Play page | 43 | `Sections as shipped: THE OBJECTIVE · STEERING · SHOOTING · EQUIPMENT · UPGRADING, with keys rendered as keycaps in the in-game refit-card chip` | W-SLOTS / C-SLOTS / HEAL-CARD / DRAW-PILE / MULLIGAN / SPAWN-0 / HOME-2 — EQUIPMENT and UPGRADING describe the old fit and `5`; new mechanics' ONLY explanatory home is this page (standing Eric rule: new-feature explanations go to How-to-Play, never in-game copy unasked) | SUPERSEDE |
| E8 | IA table › Privacy policy page | 44 | `Every sentence is a claim about shipped behaviour, and it speaks as Hullcracker.io in the third person` | HOME-2 / HISTORY — OAuth providers, account identifiers, stored history are new claims | EXTEND |
| E9 | IA table › Settings overlay | 45 | `Doubles as the in-match binding reference (view-only — bindings are fixed for v1; remapping deferred post-beta)` | W-SLOTS / C-SLOTS / HEAL-CARD / SPAWN-0 — the binding reference must list generic Q/E/R, 1–4 consumables, Shift, and drop `5`; HOME-2 removes the "no accounts" remapping blocker (E37) | CHANGE |
| E10 | IA table › Boarding | 46 | `everyone drops onto their real start location with movement locked, weapons locked and radar off, and the room holds until the last captain has loaded` | SPAWN-0 / MULLIGAN — the held line now has an opening offer + redraw available; "weapons locked" over three EMPTY slots | EXTEND |
| E11 | IA table › Countdown | 47 | `MATCH STARTING + big center count, 0:10. The tag stays ALL STATIONS LOCKED` | MULLIGAN — a one-shot interaction (redraw) inside the ten seconds; whether Tab is live during countdown is unstated | CHANGE |
| E12 | IA table › Refit window | 49 | `DOM overlay, TAB toggles | Spend banked levels | Non-blocking, game runs behind` | CARD-FACE (greyed card, refused pick), MULLIGAN (a redraw is not a spend) | EXTEND |
| E13 | IA table › Results modal | 51 | `three stat tiles (KILLS · PLACEMENT · TIME AFLOAT), a MATCH LOG …, SHIPS YOU SANK, and the BOONS ACCRUED / LAST OFFER blocks` | RESULTS-DECK — "BOONS ACCRUED / LAST OFFER" is the block v3 replaces with brought / drawn / taken; HISTORY — a results screen is now also a history row | SUPERSEDE |
| E14 | IA table › Return to port | 52 | `the next match is seconds, not menus; no account, no grind` | HOME-2 / ACCT-BAR — an (optional) account and an account level + unlock tokens exist; "no account, no grind" needs re-scoping to the anonymous path | SUPERSEDE |
| E15 | Voice and Tone › Command register | 58 | `SOLO, SOLO VS AI, CANCEL, RETURN TO PORT, SPECTATE, REFIT, ALL STATIONS LOCKED, WEAPONS SAFE (dev door), DEPLOY AS…` | HOME-2 / DECK-ED / MULLIGAN / HISTORY — every new verb (sign-in, sign-out, save deck, redraw, …) is unruled copy under THE COPY LAW (L63-65): leave empty and ask | EXTEND |
| E16 | Component Patterns › Hotbar Slot | 73 | `four slots, vertical stack bottom-left. The gun is slot 0 and has NO key of its own — it is the permanently-selected default` | W-SLOTS / DECK-GUN — the gun leaves the stack entirely; the stack is three generic weapon slots (+ four consumable slots somewhere) | SUPERSEDE |
| E17 | Component Patterns › Hotbar Slot | 73 | `Torpedo Boat fits torpedo + speed boost, Battleship fits broadside + star shells, Mine Layer fits mine + radar buoy` | W-SLOTS / DEL-BOOST / DEL-BUOY — the per-class fit sentence is false in every clause | SUPERSEDE |
| E18 | Component Patterns › Hotbar Slot | 73 | `Two interaction classes: weapons switch-to …, abilities activate … Weapon-vs-ability comes from the equipment table, never a slot literal. The chamfer shape marks abilities.` | DEL-BOOST / C-SLOTS / NEW-WPN — no ability on the bar; consumables activate on 1–4; MG is a HELD-fire third class | CHANGE |
| E19 | Component Patterns › Hotbar Slot | 73 | `accrued boons compress into quick-info as ◆n — tooltip carries the full list` | W-SLOTS — quick-info for a slot whose weapon is itself a drawn card; C-SLOTS — stock count as quick-info | EXTEND |
| E20 | Component Patterns › Ammo Badge | 74 | `appears only on slots whose system stores >1 round; counts down on fire, up on reload` | C-SLOTS — stock count on a consumable slot: down on use, up on stocking a card (not on reload) | EXTEND |
| E21 | Component Patterns › Slot Tooltip | 75 | `name, interaction class, description, full accrued-boon list with effects (qualitative, Hades-style — this is where the player checks their build)` | W-SLOTS / C-SLOTS — "build" is now a deck; the check-your-build surface shifts (RESULTS-DECK, DECK-ED) | EXTEND |
| E22 | Component Patterns › Banked-Level Chip | 76 | `appears at the head of the hotbar stack when ≥1 level is banked … Hidden at zero banked levels.` | SPAWN-0 / MULLIGAN — the opening offer at countdown is the chip's first appearance; DRAW-PILE has no pattern and this is its neighbour | EXTEND |
| E23 | Component Patterns › XP Rail | 77 | `passive XP + kill bonuses fill the rail; on level-up it wraps, the Banked-Level Chip increments, and a Toast fires` | SPAWN-0 — level starts at 0 | NOTE |
| E24 | Component Patterns › Refit Card | 78 | `pick with 1/2/3/4, and 5 spends on the always-available DAMAGE CONTROL rail one seam below the row` | HEAL-CARD | SUPERSEDE |
| E25 | Component Patterns › Refit Card | 78 | `they are materialized once at earn-time and never reroll — and banked offers never expire` | MULLIGAN — one free redraw of the OPENING offer during the countdown is a carve-out of "never reroll" (FR19); the guarantee needs its exception stated | CHANGE |
| E26 | Component Patterns › Refit Card | 78 | `on a server rejection or timeout the picked card fires the denied pulse and the level stays banked` | CARD-FACE — a refused pick for a FULL consumable slot is now a NORMAL, predictable rejection (greyed before the press), not a fault path | EXTEND |
| E27 | Component Patterns › Refit Card | 78 | `the hotbar dims to 38% while open — but while it is open the game is under full combat lockout (mouse fire suppressed, Q/E/R/F suspended)` | C-SLOTS — 1–4 change meaning when Tab opens (consumable → card pick); the lockout list must say consumables are suspended too; "hotbar" now includes consumable slots | CHANGE |
| E28 | Component Patterns › card face | 79 | `The prose moved to a hover tooltip precisely because the Tab/1-4/5 shortcut exists to SKIP the reading` | CARD-FACE (confirmed) / HEAL-CARD (`5` in copy) | NOTE |
| E29 | Component Patterns › Class Card / Chip / Hoist | 80 | `cards carry silhouette, pip scales (…) and two special-slot rows keyed Q/E; pick returns to home with the chip updated` | W-SLOTS / DECK-JOIN | SUPERSEDE |
| E30 | Component Patterns › Class Card / Chip / Hoist | 80 | `First-run: forced choice — no default class is ever pushed, the chip reads SELECT CLASS, and either deploy button opens the layer` | DECK-JOIN — is a deck likewise a forced first-run choice, or does a starter deck default? (GDD names starters); HOME-2 — anonymous first run | EXTEND |
| E31 | Component Patterns › Mode Row | 81 | `Enter is bound to the callsign field and runs SOLO only` | HOME-2 — a signed-in player's callsign may come from the account; the callsign field's role in the signed-in state is unstated | EXTEND |
| E32 | Component Patterns › Toast | 83 | `transient self-events only (level banked, boon fitted, YOU ARE THE KILL LEADER)` | W-SLOTS / C-SLOTS — "boon fitted" now covers "weapon card slotted" and "consumable stocked" | NOTE |
| E33 | Component Patterns › Modal | 84 | `results, settings overlay, queue modal. Modals never stack` | DECK-ED / HISTORY / DECK-JOIN / HOME-2 sign-in — new modals or pages; the never-stack rule constrains e.g. deck picker over class layer | EXTEND |
| E34 | State Patterns › Hotbar Slot states | 94-95 | `Ready (weapon) | Loaded, unselected | Soft phosphor outline` / `Ready (ability) | Off cooldown | Brighter phosphor + chamfer` | DEL-BOOST (no ability row) / C-SLOTS (a "stocked" state) / NEW-WPN (MG streaming state) | CHANGE |
| E35 | State Patterns › Hotbar Slot states | 96 | `Selected | Q/E/R press on a weapon (the gun is selected by default and has no key)` | W-SLOTS / DECK-GUN | SUPERSEDE |
| E36 | State Patterns › Hotbar Slot states | 99 | `Empty | Extra slot unfitted | Dashed outline, "— awaiting refit —"` | W-SLOTS — every weapon slot is empty at 0:00; the trigger column "Extra slot unfitted" is false; C-SLOTS empty state unlisted | SUPERSEDE |
| E37 | State Patterns › Hotbar Slot states | 100 | `Denied | Fire or activation attempt while invalid (cooling, no ammo, empty slot) | 80 ms red edge pulse + icon flash — never silence` | W-SLOTS — a Q press at 0:00 is now a denied-on-empty in the NORMAL opening state; C-SLOTS — empty consumable press; CARD-FACE — greyed card press | EXTEND |
| E38 | State Patterns › Attention priority Tier 3 | 108 | `Bank-chip breathing, toasts, XP-rail wrap | Freeze at the dim keyframe … Of the three channels named, only the bank chip actually breathes` | DRAW-PILE / C-SLOTS / SPAWN-0 Shift — any animated readiness or count-down channel must be placed in a tier | EXTEND |
| E39 | State Patterns › Banked levels | 116 | `0: no chip; ≥1: breathing chip + count + the LEVEL UP — TAB TO REFIT cue; while refit open: queue pips …; spend latch dims cards` | MULLIGAN (a redraw state), CARD-FACE (a greyed card is a dim that is NOT the spend latch — two dims, one channel) | EXTEND |
| E40 | State Patterns › DAMAGE CONTROL | 118 | `the heal is real and is not a card: an always-available rail one seam below the refit row, picked with 5 or a click, riding the reserved negative wire sentinel HEAL_CHOICE` | HEAL-CARD — whole paragraph RETIRED (heal IS a card) | SUPERSEDE |
| E41 | State Patterns › DAMAGE CONTROL | 118 | `Banked levels are uncapped, so hoarded heals — not hull HP — are the real ceiling on how long a sudden-death collapse can be survived.` | HEAL-CARD / DRAW-PILE — the ceiling argument re-derives from a stock-limited, draw-limited HULL REPAIR (50-card pile) | SUPERSEDE |
| E42 | State Patterns › Match length | 124 | `Hoarded heals push the outer edge further, but a match always terminates.` | HEAL-CARD — same re-derivation as E41 | CHANGE |
| E43 | State Patterns › Match lifecycle | 126 | `Reveal HUD survivor set (ratified): BR Chrome Bar + Kill Feed persist through the reveal; hotbar, XP Rail, Banked-Level Chip and own-vitals die with the hull` | C-SLOTS / DRAW-PILE — new HUD elements must be assigned to the survivor or die-with-hull set | EXTEND |
| E44 | State Patterns › Match lifecycle | 126 | `boarding at the frozen start line (movement, weapons and radar all locked; spawn location disclosed) → countdown (still held) → live` | SPAWN-0 / MULLIGAN — the lifecycle line needs the opening-offer/redraw beat | EXTEND |
| E45 | State Patterns › Surface cold states | 128 | `absence is right when the empty state carries no information; the honest number is right when the emptiness IS the information` | HOME-2 / HISTORY / DECK-ED — an anonymous home, an empty match history, an empty deck slot each need this rule applied | EXTEND |
| E46 | Interaction Primitives › Q / E / R | 134 | `Q/E are the class specials, R the pickup/extra slot (inert while empty). The gun is slot 0 and has NO key — it is the always-selected default` | W-SLOTS / DECK-GUN / DEL-ACQ | SUPERSEDE |
| E47 | Interaction Primitives › Q / E / R | 134 | `a weapon key primes its slot, the same key reverts to the gun, and firing auto-reverts. Abilities activate instantly. Suspended while the refit window is open` | W-SLOTS / DECK-GUN — "reverts to the gun" when the gun is off the bar; DEL-BOOST — no ability | CHANGE |
| E48 | Interaction Primitives › F | 135 | `suspended with Q/E/R while the refit window is open` | C-SLOTS — the suspended-during-refit list grows (1–4 as consumables) | NOTE |
| E49 | Interaction Primitives › TAB | 136 | `Toggles the refit window open and closed. It also closes on ESC and on spending the last banked level` | MULLIGAN — whether Tab is the mulligan surface during the countdown is unstated | EXTEND |
| E50 | Interaction Primitives › 1 / 2 / 3 / 4 | 137 | `refit card pick, only while the refit window is open — refit-or-nothing otherwise, evaluated at the key's own keydown, so a stray digit can never misfire a future consumable` | C-SLOTS — DELIVERS the "future consumable" and REVERSES "refit-or-nothing": 1–4 now do two things depending on Tab state; the keydown-time evaluation clause is exactly the seam | SUPERSEDE |
| E51 | Interaction Primitives › 5 | 138 | `Spend a banked level on the DAMAGE CONTROL rail (the reserved HEAL_CHOICE sentinel), under the exact same window-only rule as 1–4` | HEAL-CARD — row RETIRED | SUPERSEDE |
| E52 | Interaction Primitives › SPACE | 139 | `Bound-inert. Prevented at the chokepoint so it can never scroll the page, and it performs no action` | SPAWN-0 — no `Shift` row exists in the primitives table; the universal boost is a NEW binding, and the decision log (L65) rejected Shift as a held modifier for stated reasons (see §5) | EXTEND |
| E53 | Interaction Primitives › Mouse move | 144 | `Aim, constrained to the selected weapon's real firing arc` | W-SLOTS / DECK-GUN (which weapon is "selected" when none is slotted) / NEW-WPN (horizontal missile, flak, MG arcs) | CHANGE |
| E54 | Interaction Primitives › Left click | 145 | `Fire one shot; denied fire always gives explicit feedback` | NEW-WPN — the machine gun is a HELD-fire stream, not "one shot" | CHANGE |
| E55 | Interaction Primitives › Enter | 147 | `Home: runs SOLO (bound to the callsign field; SOLO VS AI has no Enter binding …)` | HOME-2 — Enter's home binding in the signed-in state (callsign from account?) | NOTE |
| E56 | Interaction Primitives › Fixed bindings | 151 | `key remapping is deferred post-beta (no accounts yet, so remaps would mean heavy localStorage; stated in code)` | HOME-2 — the stated blocker is removed by accounts (remapping itself is NOT in v3) | CHANGE |
| E57 | Interaction Primitives › Fixed bindings | 151 | `Tab opens and closes, 1–4 pick, 5 heals, and Space is bound-inert … The scheme also supersedes the old 1/2/3 weapon keys` | HEAL-CARD / C-SLOTS / SPAWN-0 — the one-sentence scheme summary changes in three places (`5` gone, 1–4 dual, Shift added) | SUPERSEDE |
| E58 | Interaction Primitives › Input capture | 153 | `every bound key is preventDefault-ed at a single keydown chokepoint — including Space (page scroll) and Tab (focus cycle)` | SPAWN-0 (Shift: OS Sticky-Keys hazard is a browser-hygiene concern — see decision log L65) / C-SLOTS (digits) | EXTEND |
| E59 | Interaction Primitives › Input capture | 153 | `DOM overlay or text input with focus = keyboard suppressed from the sim; the sim never pauses` | DECK-ED / HISTORY / sign-in — port-only surfaces, but a deck editor with text inputs is a new "text input with focus" case if ever reachable in-match | NOTE |
| E60 | Accessibility Floor › dual-coding | 159 | `shape (chamfer, class silhouettes, drone chevron, pip geometry), position, and text co-carry every such signal` | C-SLOTS (stocked/empty/used), CARD-FACE (greyed = lightness only), DRAW-PILE, DEL-BOOST (chamfer orphaned) — each new state needs a non-colour channel | EXTEND |
| E61 | Accessibility Floor › audio-visual redundancy | 160 | `TONE_TWINS … exhaustive at the TYPE level over all 34 audio cues … a new cue cannot be added without a visual twin at all` | NEW-WPN / NEW-CONS / MULLIGAN / DRAW-PILE / HEAL-CARD — every new cue must land with a twin; the "34" count moves | EXTEND |
| E62 | Accessibility Floor › committed options | 163 | `Key remapping is not among them — deferred post-beta; nor is a hold/toggle refit option` | HOME-2 — remapping blocker removed (E56) | NOTE |
| E63 | Accessibility Floor › UI scale | 166 | `Applies to the Pixi HUD and DOM HUD elements (kill feed, toasts, refit cards); port chrome follows browser zoom instead` | C-SLOTS / DRAW-PILE — join the scaled HUD set; DECK-ED / HISTORY — port chrome, browser zoom | EXTEND |
| E64 | Accessibility Floor › settings table | 170-177 | `Persistence` column: `localStorage` ×6 | HOME-2 — a signed-in player has a place settings COULD live; the per-browser assumption is stated six times | EXTEND |
| E65 | Accessibility Floor › cognitive floor | 179 | `the per-card explanation lives in the refit card's hover tooltip and How-to-Play's UPGRADING section explains the mechanism …; accrued boons + last offer are reviewable from the results modal` | CARD-FACE (confirmed), E7 (How-to-Play), RESULTS-DECK ("accrued boons + last offer" → brought / drawn / taken) | CHANGE |
| E66 | HUD & Diegetic UI › intro | 183 | `Note that the mock predates the Tab binding, the heatmap return colours and the foghorn chevron.` | All — the composite also predates every v3 HUD element | NOTE |
| E67 | HUD & Diegetic UI › zone table › Bottom-left | 187 | `XP Rail + Banked-Level Chip + Hotbar (4 slots, Composition 2 vertical stack) | Build, economy, weapons` | W-SLOTS (3 weapon slots) / C-SLOTS (4 more slots, corner unassigned) / DRAW-PILE (unassigned) — the "what's where" row is wrong in count and incomplete in kind | SUPERSEDE |
| E68 | HUD & Diegetic UI › zone table › Bottom-right | 188 | `Own-vitals cluster: HP Rail + HDG/KTS readouts + rudder gauge + Telegraph Cluster` | SPAWN-0 — Shift boost readiness has no zone; the helm corner is the candidate by "hands describe the fantasy" (L29) but nothing is assigned | EXTEND |
| E69 | HUD & Diegetic UI › zone table › Top-center | 189 | `n AFLOAT · n KILLS · T+mm:ss · <ring readout> · ☠︎ <NAME>` | DRAW-PILE — the only other match-register surface; no proposal here, but the counter has no zone anywhere | NOTE |
| E70 | HUD & Diegetic UI › zone table › World | 192 | `Firing arcs | Drawn on aim only (carry-over behavior); deliberately absent from steady-state` | NEW-WPN — missile / flak / MG / monitor arcs; W-SLOTS — arc of an EMPTY slot | NOTE |
| E71 | HUD & Diegetic UI › Radar | 201 | `jamming fakes, server-generated false returns from a jamming-doctrine radar buoy that are wire-indistinguishable from real ones by construction` | DEL-BUOY — the jamming doctrine goes with the buoy; NEW-CONS CHAFF / DECOY BUOY are the candidate successors for fakes, unstated | SUPERSEDE |
| E72 | HUD & Diegetic UI › Torpedoes | 206 | `the fish itself is detected at the 3/8 detect rung … the torpedo's wake factor is held at half a ship's so a fish's tell never runs longer than any hull's` | NEW-WPN — three torpedo lines; the sensing/wake rule is written for ONE torpedo (a supercavitating fish's wake/speed is the obvious question) | EXTEND |
| E73 | HUD & Diegetic UI › Torpedoes | 206 | `Mines share the detect rung.` | NEW-WPN — captive mines as its own line (detect rule per line) | NOTE |
| E74 | HUD & Diegetic UI › Enemy damage | 208 | `wounded ships trail smoke ({colors.wounded-smoke}) above the fog; no enemy HP bars, ever. Own damage is HUD-private` | NEW-CONS — SHIELD BLOCK is a visible defensive state on a hull (diegetic?); SMOKE SCREEN vs wounded smoke must not read alike | EXTEND |
| E75 | HUD & Diegetic UI › Fog/world reads | 210 | `fog banks shrink your truesight while hiding you from others'.` | NEW-CONS — SMOKE SCREEN delivers a player-made fog bank (CLAUDE.md records SMOKE SCREEN as DEFERRED at cycle 126; this sentence reads as shipped and should be checked against code) | CHANGE |
| E76 | Game Feel & Juice › inventory | 214 | `a 33-tone WebAudio set … With the foghorn … that is 34 audio cues in total.` | NEW-WPN / NEW-CONS / MULLIGAN / DRAW-PILE — the count moves; each new cue needs a twin (E61) | EXTEND |
| E77 | Game Feel & Juice › Hit Call | 218 | `The 2026-08-04 rationale of record cited decoy disambiguation; the decoy role was deleted at Story 7-5, and the exception stands on its own terms.` | NEW-CONS — DECOY BUOY returns; the original "shooting a decoy produces no Hit Call" oracle becomes live again | CHANGE |
| E78 | Game Feel & Juice › The build must be felt | 224 | `every boon lands with audio + hull visual + on-water behavior, or promise + growth is a spreadsheet` | W-SLOTS / NEW-WPN — a drawn WEAPON card landing in an empty slot is a bigger "felt" moment than a stat boon | EXTEND |
| E79 | Key Flows › Journey A beat 1 | 235 | `He types a callsign; the chip reads SELECT CLASS, so pressing SOLO opens the class bay instead of connecting` | HOME-2 (anonymous path — retained) / DECK-JOIN (does a starter deck default, or is there a second forced choice?) | EXTEND |
| E80 | Key Flows › Journey A beat 2 | 236 | `Nothing answers yet — helm, trigger and scope are all held … MATCH STARTING, ten seconds, and the ocean comes to life all at once.` | SPAWN-0 / MULLIGAN — the ten seconds now contain his first offer and a redraw decision; "nothing answers" is no longer literally true | CHANGE |
| E81 | Key Flows › Journey A beat 4 | 238 | `the drone sinks; the XP Rail wraps and the Banked-Level Chip starts breathing: LEVEL UP — TAB TO REFIT` | SPAWN-0 — he starts at level 0 and already met the chip at countdown; the "first level-up" teaching beat shifts | CHANGE |
| E82 | Key Flows › Journey A beat 5 | 239 | `He presses TAB — four cards over the still-running battle. He does not read the tooltips; he presses 2, the boon lands on its slot` | W-SLOTS — with empty slots his early picks are WEAPONS filling Q/E/R; C-SLOTS — a consumable pick stocks 1–4; CARD-FACE confirmed | EXTEND |
| E83 | Key Flows › Journey A beat 8 | 242 | `SUNK, 9TH OF 14, two kills, and a MATCH LOG telling him exactly when each of them happened … He returns to port and presses SOLO again` | RESULTS-DECK — his deck (brought / drawn / taken) joins the screen; HOME-2 — anonymous return path retained | EXTEND |
| E84 | Key Flows › Journey A closing | 244 | `death is the teaching surface, and it costs two presses, zero menus` | HOME-2 — true only for the anonymous path; no journey covers sign-in / deck editing | NOTE |
| E85 | Key Flows › Journey B beat 1 | 248 | `she reads the Class Cards — real loadout differences, no grind wall — picks Mine Layer, hoists Rose` | W-SLOTS / DECK-JOIN (loadout differences now live in the DECK, not the class card) / ACCT-BAR ("no grind wall" vs account level + unlock tokens + whole-line unlocks) | SUPERSEDE |
| E86 | Key Flows › Journey B beat 2 | 249 | `seeds a mine seam across a channel mouth` | W-SLOTS / NEW-WPN — she has no mine at 0:00; the seam waits on drawing a mine (or captive-mine) card | CHANGE |
| E87 | Key Flows › Journey B beat 3 | 250 | `she drops a radar buoy on the far side of the headland and runs shallow, reading his track through the buoy's relay — the buoy sees what she cannot, and shoots at what it sees` | DEL-BUOY — the whole beat is built on deleted equipment; NEW-CONS DECOY BUOY / SMOKE SCREEN / CHAFF are the candidate replacements | SUPERSEDE |
| E88 | Key Flows › Journey B beat 6 | 253 | `Climax: proximity fuse — Hit Call boom, kill feed in their two colors` | NEW-WPN — captive mines as its own line (which mine she laid) | NOTE |
| E89 | Key Flows › Journey B beat 7 | 254 | `She places 3rd, reads her results and her match log, and returns to port — about fifteen minutes, zero grind.` | RESULTS-DECK / HISTORY / ACCT-BAR ("zero grind") | CHANGE |
| E90 | Key Flows › Journey B failure path | 256 | `islands, her own mines laid behind her, and a buoy left as a watcher are the escape line` | DEL-BUOY | SUPERSEDE |
| E91 | Key Flows › third journey note | 258 | `There is no third journey. The party/friend-group protagonist reserved in 2026-07-16 is DELETED` | HOME-2 / DECK-ED / HISTORY — no journey exercises the signed-in loop (sign in → edit deck → pick deck at join → history); the "no third journey" ruling was about party modes, not accounts | NOTE |
| E92 | Inspiration & Anti-patterns › Hades | 265 | `Boon-on-slot display; the lobby pick as a complete weapon/playstyle promise` | W-SLOTS / DECK-JOIN — the lobby promise moves from class to DECK; "boon-on-slot" becomes "card-in-slot" | NOTE |
| E93 | Inspiration & Anti-patterns › WoWS | 267 | `Leave: Grind; damage minutiae; …` | ACCT-BAR — account level + unlock tokens + whole-line unlocks is a progression spine the "Leave: Grind" column must be reconciled with | CHANGE |
| E94 | Inspiration & Anti-patterns › colonist.io | 266 | `Its paid-color model "feels kinda bad" — premium colors parked` | HOME-2 / ACCT-BAR — accounts create the first place a premium anything could attach; the parked ruling stands (L292) but the surface now exists | NOTE |
| E95 | Responsive & Platform › UI scale | 279 | `refit cards never wrap — the 1–4 keys map spatially; no mono type below 9 px post-scale` | C-SLOTS — 1–4 now map spatially TWICE (cards when Tab is open, consumable slots when closed); DECK-ED grid (D39) | CHANGE |
| E96 | Responsive & Platform › DOM chrome | 280 | `DOM chrome (home, results, settings, How-to-Play, privacy policy) centers at {spacing.chrome-max-width} (1100px)` | DECK-ED / HISTORY / sign-in — join the list | EXTEND |
| E97 | Monetization & Disclosure › consent | 291 | `Our own settings keep only a local analytics override, which persists because every return-to-port is a full page load.` | HOME-2 — OAuth session persistence across the full-page-load return; Google/Discord are new third parties on the disclosure surface | EXTEND |
| E98 | Monetization & Disclosure › premium colours | 292 | `Premium cosmetic colours are parked — no hue is gated; monetization ships as advertising only` | ACCT-BAR — unlock tokens / whole-line unlocks are a gate on CARDS, not hues; the sentence should say so or it will be read as contradicted | NOTE |
| E99 | Resolved question register › #1 | 300 | `Heal exists and is not a card — the always-available DAMAGE CONTROL rail, digit 5` | HEAL-CARD — REVERSED: heal is a card (HULL REPAIR consumable) — this returns to the decision log's L45 shape ("heal card appears within the 4-choice offer") | SUPERSEDE |
| E100 | Resolved question register › #14 | 313 | `Boon copy | Eric's v2 catalog is canon; minimal card face + hover tooltip` | NEW-WPN / NEW-CONS — catalog v3 (29 lines / 114 cards) supersedes v2 as canon; face + tooltip retained | CHANGE |
| E101 | Resolved question register › #19 | 318 | `Key remapping | Deferred post-beta; v1 bindings are fixed` | HOME-2 — the recorded reason (no accounts) is delivered; the deferral itself is untouched by v3 | NOTE |
| E102 | Resolved question register › #4 | 303 | `Premium cosmetic colours | No hue is gated; monetization ships as advertising only` | ACCT-BAR — as E98 | NOTE |

**Coverage check against the brief's must-cover list:** hotbar / slot grammar / Q-E-R-F (D25, D27-29, E16-19, E34-37, E46-48) · F/4th slot + acquisition card (D25, D36, E46) · refit window Tab/1-4/5 (D26, D32, D35-43, E24-28, E49-51, E57) · XP rail + banked levels + "level 1" (D5-6, D33-34, E22-23, E39 — no literal "level 1 at spawn" clause exists) · own-vitals + HP rail + heal (D9, D42-45, E40-42, E68) · results modal (D11, D54-55, E13, E65, E83, E89) · home / mode row / class picker (D12-14, D50-52, E4-6, E29-31, E55, E79, E85) · settings (E9, E62, E64, D56) · input scheme tables (E46-58) · HUD zone anatomy (D21, E67-70) · equipment icons (D30) · radar buoy / decoy / speed boost / jamming (D18-19, D24, D27, E17-18, E71, E77, E87, E90) · key-chip + hotbar tokens (D3, D26, D59) · "Tab/1-4/5" copy (D26, D32, D37, E28, E57) · How-to-Play (E7, E65) · countdown / waiting room (D53, E10-11, E44, E80) · Journeys A/B (E79-E90).

---

## 2. DESIGN.md component tokens

### 2a. Frontmatter `components:` keys (L120-140) — 21 tokens

| Token | Line | What it is today | v3 |
|---|---|---|---|
| `hotbar-slot` | 120 | 54px square, 1px silver .28 outline, transparent, sharp | **EXTEND** — must also be (or spawn) a consumable-slot spec; no consumable token exists |
| `ammo-badge` | 121 | 16px count top-right of slots storing >1 | **EXTEND** — consumable stock count; MG stream has no count |
| `bank-chip` | 122 | 30px chip at hotbar head, breathes then goes static | Touched (first appearance now at countdown); nearest neighbour for the draw-pile counter |
| `xp-rail` | 123 | 3px rail, `LV n` foot tag | Touched (`LV 0`); nearest neighbour for the draw-pile counter |
| `refit-card` | 124 | 216px card, panel bed, sharp | **EXTEND** — greyed/refused state, mulligan affordance; candidate base for the deck-editor card (but see the never-wrap law, D39) |
| `slot-tooltip` | 125 | 236px hover panel for a HOTBAR slot | **EXTEND** — content changes for card-in-slot; the REFIT-CARD tooltip (L256 "the band's own tooltip panel") has no token of its own |
| `hp-rail` | 126 | vertical rail on own-vitals right edge | Unchanged; its heal partner (regen pool) goes |
| `nameplate` | 127 | hud-micro callsign over hull | Unchanged |
| `telegraph-cluster` | 128 | ordered/actual, 9 rungs | Nearest helm surface for a Shift-boost readiness mark; nothing assigned |
| `br-chrome` | 129 | top-center mono row | Unchanged; the only other match-register surface (draw pile has no zone) |
| `kill-feed` | 130 | top-right, 14px | Unchanged; nearest line grammar for a match-history ROW |
| `foghorn-chevron` | 131 | edge chevron | Unchanged |
| `damage-control-rail` | 132 | 40px rail, 22px `5` chip | **RETIRED** by HEAL-CARD |
| `aggro-bracket` | 133 | amber corner ticks on an aggro'd fleet hull | Unchanged |
| `results-ad` | 134 | 300px slot beside results, group-centred | Touched — a taller results panel moves the centring arithmetic |
| `class-card` | 135 | 356px, panel-deep, 10px radius | **CHANGE** — Q/E special rows gone; deck selection needs a home near it |
| `class-chip` | 136 | home compact chip | **EXTEND** — home two-state; what the chip promises |
| `color-hoist` | 137 | 20px swatch row | Unchanged (open: does a signed-in preference persist server-side?) |
| `button-primary` | 138 | amber outline+glow, the ONE action | **EXTEND** — sign-in buttons have no register; SOLO VS AI's unlit-secondary is itself unruled |
| `modal` | 139 | panel bed, hairline, lg radius | **EXTEND** — the only container for deck editor / history / deck picker / sign-in |
| `toast` | 140 | phosphor 16px 3s | Touched — "boon fitted" semantics |

### 2b. Body Components table rows (L252-278) — 27 rows

| Row | Line | v3 |
|---|---|---|
| Hotbar Slot | 252 | **CHANGE** (D27-30) — empty is now the opening state of every slot; ability/chamfer orphaned; selected grammar without the gun; icon set grows |
| Ammo Badge | 253 | **EXTEND** (D31) |
| Banked-Level Chip | 254 | **SUPERSEDE in part** (D32-33) — the `5` third of the ratified binding |
| XP Rail | 255 | Touched (D34) |
| Refit Card | 256 | **CHANGE** (D35-41) — `5`, acquisition card, strip arithmetic, greyed state, never-wrap law vs deck editor |
| DAMAGE CONTROL Rail | 257 | **RETIRED** (D42-43) — and it carries the only "disabled + reason word" precedent |
| Slot Tooltip | 258 | **EXTEND** (D44) |
| HP Rail | 259 | Touched (D45) |
| Nameplate | 260 | Unchanged |
| Aggro Bracket | 261 | Unchanged |
| Telegraph Cluster | 262 | **EXTEND?** (D46) — Shift boost has no home |
| BR Chrome Bar | 263 | Unchanged (draw pile has no zone) |
| Kill Feed | 264 | Unchanged |
| Foghorn Chevron | 265 | Unchanged |
| ~~Listening Ring~~ | 266 | Unchanged (deferred, not v3) |
| ~~Bounty Bloom~~ | 267 | Unchanged |
| Torpedo (on-water) | 268 | **EXTEND** (D47-48) — three torpedo lines, captive mines, new consumable objects |
| Combat Effects | 269 | **EXTEND** (D49) — new ordnance/consumable effects |
| Class Card | 270 | **SUPERSEDE in part** (D50) — Q/E rows |
| Class Chip | 271 | **EXTEND** (D51) |
| Color Hoist | 272 | Unchanged |
| Primary Button | 273 | Touched (D52) |
| Phase / Status Text | 274 | **CHANGE** (D53) — countdown hosts the mulligan |
| Modal | 275 | **EXTEND** (D54) — results deck block |
| Toast | 276 | Touched |
| Results Ad Unit | 277 | Touched (D55) |
| Privacy & Consent | 278 | **EXTEND** (D56) — OAuth + history disclosures |

### 2c. v3 elements with NO obvious home in the token set

| v3 element | Nearest existing token / row | Why it does not fit |
|---|---|---|
| **Consumable slot** (×4, keys 1–4) | `hotbar-slot` / Hotbar Slot row | The slot grammar has two classes (switch-to weapon / activate ability) and one "empty" exception; a STOCKED, count-bearing, press-to-use slot that starts empty and is keyed by a digit is neither. No corner assigned (D21, E67) |
| **Draw-pile counter** (50 → 0) | none — `bank-chip` / `xp-rail` are the economy neighbours; `br-chrome` the other match register | No economy readout exists that counts DOWN; no attention tier assigned (E38); no survivor-set assignment (E43) |
| **Refit-card hover tooltip** | `slot-tooltip` (hotbar only) | L256 says "the band's own tooltip panel" but no `components:` key describes it; its anatomy (for a weapon card, a consumable card, a stat card) is unstated |
| **Greyed / server-refused card** | Refit Card "Armed" state; DAMAGE CONTROL rail "inert" state | The card has no disabled state; the rail's reason-word precedent is being retired with the rail (D43) |
| **Mulligan affordance** (one free redraw, countdown only) | none — Banked-Level Chip / Refit Card / Phase text | Nothing in the register is a one-shot, time-boxed, non-spend action on an offer |
| **Shift boost** (universal, off-hotbar) | `telegraph-cluster` (helm corner) — by "hands describe the fantasy" only | No token for a helm-hand ability's readiness/cooldown; no key chip placement; decision log L65 rejected Shift as a held key (§5) |
| **Deck editor card grid** | `refit-card` (216px, panel bed) + `modal` | L256 "Cards never wrap to a grid" is written as a law; the editor IS a grid; port chrome is soft-cornered (L244) while the card is sharp (L241) — the card would cross the tactical/port shape boundary |
| **Sign-in button(s)** (Google / Discord) | `button-primary` (amber = the ONE action); the unlit-phosphor secondary used by SOLO VS AI | DESIGN defines exactly one button; the secondary treatment is UNRULED (CLAUDE.md, Story 6-5); provider-branded buttons have no register |
| **Account level bar + unlock tokens** | `xp-rail` (in-match, phosphor, 3px) | No port-chrome progression surface exists; the in-match rail's meaning ("next boon level") must not be confused with an account level |
| **Match-history row** | `kill-feed` line grammar; results modal MATCH LOG | No list-of-past-matches surface; the results modal is single-match; cold-state rule (E45) applies |
| **Deck selection at join** | `class-card` / `class-chip` / Mode Row | The class layer's key map (1–3 / arrows / Enter) has no deck dimension; the Class Chip promises a class, not a deck |
| **Whole-line unlock** | none | No surface shows a LOCKED line; the loot-tier ramp (I–V) is per-copy lineage, not lock state |
| **Two-state home** | IA table Home row (L38) | One state described; no anonymous/signed-in fork anywhere |
| **New ordnance renders** (missile, flak, MG stream, monitor, 3 torpedo lines, captive mines) | `torpedo` colour token; Torpedo / Combat Effects rows | One torpedo token; no missile/flak/MG/monitor tokens; icon set is code-side only (D30) |
| **New consumable on-water objects** (DECOY BUOY, SMOKE SCREEN, CHAFF, SHIELD BLOCK) | Torpedo row's mine clause; Regatta propagation (firer's hue) | Hue rule (D18), fake-return rule (D19/E71), smoke-vs-wounded-smoke legibility (E74) all unstated |

---

## 3. EXPERIENCE.md section list (H2/H3 with line numbers)

| Line | Heading |
|---|---|
| 18 | `# EXPERIENCE.md — Hullcracker.io` |
| 24 | `## Foundation` |
| 32 | `## Information Architecture` (IA table L36-52) |
| 54 | `## Voice and Tone` (COPY LAW L63-67) |
| 69 | `## Component Patterns` (bullets L73-86) |
| 88 | `## State Patterns` (slot states L90-100 · attention tiers L102-112 · Own HP L114 · Banked levels L116 · DAMAGE CONTROL L118 · Color grant L120 · Ring phases L122 · Match length L124 · Match lifecycle L126 · Surface cold states L128) |
| 130 | `## Interaction Primitives` (table L132-149 · Fixed bindings L151 · Input capture L153) |
| 155 | `## Accessibility Floor` (floor L159-161 · options L163-168 · settings table L170-177 · surfaces + cognitive floor L179) |
| 181 | `## HUD & Diegetic UI` (zone table L185-192 · zoom L194 · eighths ladder L196 · sensor tiers L198-202 · PvE L204 · torpedoes L206 · enemy damage L208 · fog reads L210) |
| 212 | `## Game Feel & Juice` (inventory L214 · added L216-225 · motion override L227) |
| 229 | `## Key Flows` |
| 233 | `### Journey A — "Marco" (13, brand-new, floor-viewport laptop)` (beats L235-242, closing L244) |
| 246 | `### Journey B — "Dee" (WoWS refugee, Mine Layer)` (beats L248-254, failure L256, no-third-journey L258) |
| 260 | `## Inspiration & Anti-patterns` (table L262-271, rejected L273) |
| 275 | `## Responsive & Platform` |
| 284 | `## Monetization & Disclosure Surfaces` |
| 294 | `## Resolved question register` (table L298-324, #1-#25) |

For the editor's reference, DESIGN.md's own headings: L147 `## Brand & Style` · L157 `## Colors` · L182 `### Regatta Hoist — personal combatant colors` · L195 `### Ship-class silhouette language` · L208 `## Typography` · L226 `## Layout & Spacing` · L230 `## Elevation & Depth` · L239 `## Shapes` · L246 `## Components` (table L250-278) · L280 `## Do's and Don'ts`.

---

## 4. DEFERRED / FUTURE / "when-if" passages that v3 now delivers (or unblocks)

| # | File · line | Passage | v3 disposition |
|---|---|---|---|
| F1 | decision log L60 | `1, 2, 3, 4 = consumables ("when/if we get there" — future flag) AND upgrade-card selection while CTRL is held` | **DELIVERED** by C-SLOTS — and in exactly the dual-role shape the 2026-07-16 ruling described (consumables, AND card pick while the refit modifier is engaged — Tab now, CTRL then) |
| F2 | EXPERIENCE L137 | `so a stray digit can never misfire a future consumable` | **DELIVERED** — the "future consumable" is here; the keydown-time evaluation clause is the seam that keeps a stray digit safe when Tab is closed |
| F3 | EXPERIENCE L52 | `no account, no grind` | **DELIVERED in part** — HOME-2 adds an (optional) account; ACCT-BAR adds an account level; the sentence must be re-scoped to the anonymous path |
| F4 | EXPERIENCE L151 · L163 · L318; decision log L75 (verdict 9) | `key remapping is deferred post-beta (no accounts yet, so remaps would mean heavy localStorage; stated in code)` | **PRECONDITION DELIVERED, feature NOT** — accounts exist; remapping is not in v3. The recorded blocker no longer holds and the deferral needs a fresh reason or a fresh date |
| F5 | EXPERIENCE L170-177 | Settings `Persistence: localStorage` ×6 | **UNBLOCKED, not delivered** — a signed-in home is the first place a server-side settings home could exist; v3 does not say it does |
| F6 | decision log L45 | `UX impact if kept: heal card appears within the 4-choice offer. Not a UX decision — parked for GDD update/correct-course.` | **DELIVERED** by HEAL-CARD — after a detour through the DAMAGE CONTROL rail (Resolved #1, L300), v3 lands on the L45 shape: heal is a card in the offer (as a stockable consumable) |
| F7 | decision log L17 | `the upgrade system itself is changing (GDD E2: XP levels + pre-rolled 3-boon offers, no heal), so the spend UI is designed for the NEW system` | **RE-OPENED** — the "new system" is now the v3 deck (E8); the spend UI is designed for a second new system |
| F8 | DESIGN L187 · EXPERIENCE L218 | `The decoy buoy and the whole decoy role are DELETED … nothing fakes a ship contact any more` / `the decoy role was deleted at Story 7-5` | **REVERSED** (not deferred → delivered, but deleted → restored): DECOY BUOY returns as a consumable |
| F9 | CLAUDE.md cycle 126 (not a spine line, cross-checked): `the SMOKE SCREEN stays DEFERRED, not cut` — EXPERIENCE L210 `fog banks shrink your truesight` | **DELIVERED** by NEW-CONS SMOKE SCREEN; the spine sentence at L210 reads as if fog banks already ship and should be verified against code before it is extended |
| F10 | decision log L23 | `hover tooltip explains the slot and records the stat upgrades picked up (or some other way to check stats — open)` | **REFINED** — CARD-FACE puts a hover tooltip on the OFFER card too; RESULTS-DECK adds "some other way to check" (your deck: brought / drawn / taken) |
| F11 | decision log L79 | `waiting room/weapons-safe, countdown, settings overlay, How-to-Play = SPINE-ONLY by choice ("we're good on those")` | **RE-OPENED** — the countdown now hosts the mulligan, and settings + How-to-Play carry the new binding reference and the new mechanics; "spine-only" was chosen when none carried novel layout |
| F12 | EXPERIENCE L34 | `the row is built to take DUO/TRIO as in-line siblings, which are not scoped` | NOT delivered by v3 — listed so the editor does not confuse the mode row's growth reservation with HOME-2's two-state fork |
| F13 | EXPERIENCE L292 · L303 · decision log L63 | `Premium cosmetic colours are parked … monetization ships as advertising only` | NOT delivered — but ACCT-BAR's unlock tokens / whole-line unlocks are the first account-side gate of any kind; the parked ruling needs to say it is about HUES and MONEY, not cards |
| F14 | DESIGN L270 | `Ghost card (dashed, "MORE CLASSES IN DEVELOPMENT") clipped at rail edge = scale-past-4 promise` | NOT delivered (no fourth class in v3) — listed because a deck picker on the same rail competes with the ghost card's slot |

---

## 5. Decision-log entries v3 reverses or refines

| # | Date · first ~15 words | Line | v3 effect |
|---|---|---|---|
| L1 | 2026-07-16 — **Pain point (Eric):** current upgrade menu disliked; note the upgrade system itself is changing (GDD E2… | 17 | **Refined** — the "new system" the spend UI was designed for is replaced by the deck (E8) |
| L2 | 2026-07-16 — **Weapon/ability HUD — target design (Eric):** each equipment/ability is an ICON IN A SQUARE… hover tooltip… | 23 | **Refined** — icon-in-square survives; the square now holds a DRAWN card (or nothing at 0:00); tooltip content changes |
| L3 | 2026-07-16 — **Weapon/ability HUD — two interaction classes (Eric):** not every slot is a weapon you switch to; some are ACTIVATED ABILITIES… | 24 | **Refined / partly reversed** — no ability remains on the hotbar (speed boost deleted); consumables are the new activate class on 1–4; MG held-fire is a third class; "GDD slot grammar (universal gun / two specials / offer-filled extra slot)" is gone |
| L4 | 2026-07-16 — **Ship picker — grounding:** …a menu that opens on the home page to pick class before queueing. | 31 | **Refined** — a DECK is now also picked before queueing (DECK-JOIN) |
| L5 | 2026-07-16 — **Hotbar composition — RESOLVED (Eric):** Composition 2 — bottom-left vertical stack, "hands down." Label spec amended… | 37 | **Refined** — the stack is 3 weapon slots, not 4; four consumable slots and a draw-pile counter have no composition ruling |
| L6 | 2026-07-16 — **Accrued boons placement (Eric):** boons attach to their hotbar slot via tooltip AND "show up in the quick information" | 38 | **Refined** — what "accrued" means when the slot's weapon is itself a card |
| L7 | 2026-07-16 — **Spend window — interaction (Eric):** CTRL is HOLD, never toggle… Keys stated as "1, 2, 3, or 4"— [OPEN]… what key 4 does | 39 | Already superseded (Tab); **refined** — 1–4 now have a second, Tab-closed meaning |
| L8 | 2026-07-16 — **Offer size — RESOLVED, supersedes GDD (Eric):** offers present 4 upgrade choices at a time | 44 | Retained; **refined** by MULLIGAN (one free redraw of the opening offer) and CARD-FACE (a greyed card is still one of the four) |
| L9 | 2026-07-16 — **Heal-as-upgrade — [OPEN, game-design owned] (Eric):** unsure whether to keep self-heal as an upgrade choice… | 45 | **Resolved the other way** — the interim answer (Resolved #1: heal is NOT a card, the `5` rail) is reversed; v3 makes heal a card, as this entry's "UX impact if kept" foresaw |
| L10 | 2026-07-16 — **Torpedo sensing rule (Eric, gameplay fact for HUD):** near-surface torpedoes are HEARD on the listening ring… | 49 | **Refined** — three torpedo lines; the one-torpedo sensing sentence (EXPERIENCE L206) needs a per-line reading |
| L11 | 2026-07-16 — **HUD IA — own vitals (Eric):** own HP as a BAR, co-located with the speed/rotation (telegraph) indicator cluster | 51 | Unchanged for HP; **refined** only in that the heal partner (rail/regen) is gone and a Shift boost may want the same corner |
| L12 | 2026-07-16 — **HUD IA — BR chrome (Eric):** yes — ships-afloat + kills, TOP CENTER. XP/level progress bar: "a good idea"… | 54 | **Refined** — a second economy readout (draw pile) has no placement ruling; the XP bar now starts at level 0 |
| L13 | 2026-07-16 — **Settings surface — RESOLVED (Eric):** gear entry on the home page + non-pausing ESC overlay in-match | 56 | **Refined** — settings gain the v3 binding reference; a signed-in state may add an account section (unruled) |
| L14 | 2026-07-16 — **Microcopy voice — RESOLVED (Eric):** …("DEPLOY AS…", "SET SAIL", "FIT TO HULL", "REFIT", "WEAPONS SAFE") | 57 | **Refined** — every v3 verb (sign in, redraw, save deck, …) is new copy under THE COPY LAW; none is ruled |
| L15 | 2026-07-16 — **Input scheme (Eric):** Q, E, R, F = the ability/slot keys, F being the empty slot that gets filled in-game… 1, 2, 3, 4 = consumables ("when/if we get there") | 60 | **Reversed in part, delivered in part** — F is already the foghorn; Q/E/R are now GENERIC and all start empty (the "empty slot that gets filled in-game" becomes all three); 1–4 consumables DELIVERED; "Q = universal gun" reversed (gun is slotless) |
| L16 | 2026-07-16 — **HUD composite — reviewed (Eric): "pretty good."** …(2) XP phosphor rail APPROVED + HP bar becomes a matching vertical rail… | 61 | Unchanged for rails; **refined** — the approved composite has no consumable slots or draw pile |
| L17 | 2026-07-16 — **Ledger triage (Eric):** …B) home page stays as locked; mode chrome gets tweaked when more modes exist… D) Death flow… results MODAL: your kills, your placement, option to leave | 62 | **Refined** — B: the home gains a second STATE (not a mode); D: the results modal gains a deck block |
| L18 | 2026-07-16 — **Refit modifier — CHANGED CTRL → SPACE (Eric + input-scheme lens):** …Shift pinky-hold competes with A… Windows Sticky-Keys 5-tap prompt hazard on Shift | 65 | **Collides** — v3's universal boost is on SHIFT; the two objections this entry recorded against Shift as a held key (pinky vs A on the helm hand; Sticky-Keys on repeated Shift taps) apply verbatim to a boost key and were never re-examined. Not a reversal of the refit ruling (Tab stands) but the rationale is live again |
| L19 | 2026-07-16 — **Reviewer-gate triage — verdict 8:** while Space is held, Q/E/R/F are SUSPENDED — "release space to get back to the battle." Helm stays live | 66 (item 8), 74 | **Refined** — the suspended set during refit must now include the 1–4 consumable role (the digits are the pick keys) |
| L20 | 2026-07-16 — **Reviewer-gate triage — verdict 9:** Key remapping DEFERRED POST-BETA… with no accounts, remaps mean lots of localStorage | 66 (item 9), 75 | **Precondition removed** — accounts exist in v3; remapping itself is not in v3 |
| L21 | 2026-07-16 — **Mock coverage confirmed (Eric):** waiting room/weapons-safe, countdown, settings overlay, How-to-Play = SPINE-ONLY by choice | 79 | **Re-opened** — countdown (mulligan), settings (binding reference), How-to-Play (new mechanics) now carry novel content |
| L22 | 2026-07-16 — **Final render verdicts (Eric):** …(4) Results modal: TIME AFLOAT kept; NO RE-QUEUE from the modal… actions = SPECTATE or LEAVE | 80 | **Extended** — RESULTS-DECK adds a block; the no-re-queue and two-action rulings are untouched (and pinned by test) |
| L23 | 2026-07-16 — **Journey A ("Marco") — ACCEPTED with Beat 6 corrected** | 50 | **Refined** — beats 2, 4, 5, 8 move (E80-E83) |
| L24 | 2026-07-16 — **Journey B ("Dee") — tentatively accepted** | 81 | **Refined / partly superseded** — beats 1, 2, 3, 7 and the failure path (E85-E90); beat 3 and the failure path are built on the deleted radar buoy |
| L25 | 2026-09-10 — **Update opened (Eric…):** DESIGN.md/EXPERIENCE.md … carry no deck, consumable-slot, draw-pile-counter, deck-editor or sign-in surface | 85 | The v3 opener itself — confirms this extract's scope; not reversed |

---

## Counts

| Section | Count |
|---|---|
| §1a DESIGN.md collisions | 62 (SUPERSEDE 10 · CHANGE 15 · EXTEND 22 · NOTE 15) |
| §1b EXPERIENCE.md collisions | 102 (SUPERSEDE 24 · CHANGE 21 · EXTEND 37 · NOTE 20) |
| §1 total | 164 |
| §2a frontmatter `components:` tokens | 21 (retired 1 · change 1 · extend 8 · touched 5 · unchanged 6) |
| §2b body Components rows | 27 (retired 1 · supersede-in-part 2 · change 3 · extend 8 · touched 5 · unchanged 8) |
| §2c v3 elements with no home | 15 |
| §3 EXPERIENCE.md H2/H3 headings | 17 (15 H2 + 2 H3), plus 10 DESIGN.md headings for reference |
| §4 deferred/future passages delivered, unblocked, reversed or re-opened | 14 (delivered 4 · precondition-only 2 · reversed 1 · re-opened 2 · refined 1 · not-delivered-but-adjacent 4) |
| §5 decision-log entries reversed or refined | 25 |
