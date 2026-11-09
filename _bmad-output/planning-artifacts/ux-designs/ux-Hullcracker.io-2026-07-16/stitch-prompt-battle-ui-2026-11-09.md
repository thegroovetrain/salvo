# Stitch prompt — the Hullcracker.io battle UI (Story 10.10, 2026-11-09)

Written for Eric to paste into Google Stitch. Source of the rulings: `spec-10-10-the-battle-ui-xp-seen-the-offer-in-the-corner.md` (R1–R14) and this folder's `DESIGN.md`. Companion: the live candidate page `mockups/battle-ui-sitting-2026-11-09.html`.

**How to use.** Paste the MASTER PROMPT first and generate. Then paste each STATE VARIANT as a follow-up on the same screen. The two OPTIONAL EXPLORATIONS at the end are for when you want Stitch to argue the open calls (solid vs floating consoles, the offer's corner). Everything Stitch returns is a candidate; it is reconciled with DESIGN.md before anything is built.

---

## The problems this redesign fixes (give Stitch this context; it is in the master prompt too)

1. **XP and level are invisible unless you know where to look.** Today the level is an 11 px tag at the screen floor beside a 4 px progress bar.
2. **Leveling up interrupts the fight.** Today a Tab key opens a four-card window across the bottom-center of the water and the guns stop working while it is open. Picking a card is two steps (Tab, then a digit).
3. **The cards demand reading.** Five stat rows and a tier ladder per card, mid-fight.
4. **Hull health does not read as health.** Today it is a glass globe filling with green water and a percent inside; a playtester said it does not read as HP.
5. **Reload state is one square per weapon**, but the ship now has four turrets, up to two torpedo launchers with up to two tubes each, and up to two mine racks, each with its own clock.
6. **Ship and weapon stats are hidden** behind hover tooltips.
7. **The screen center is cluttered** by the bottom bar and the card window. The sides of a 16:9 screen are empty.

---

## MASTER PROMPT

```
Design a full-screen in-game HUD for "Hullcracker.io", a browser naval battle royale played top-down on a dark ocean. 1920×1080 desktop, dark mode only. Aesthetic: a warship's combat information center — "CIC tactical display, evolved": black void ocean, silver-white radar linework, phosphor-green readouts, a rotating radar sweep. Tone is naval tension with a playful wrapper. Nothing may look like a cheap filled panel or a default button.

STYLE TOKENS (use exactly these):
- Background void #050807. Panels (if any) #0A0F0D; dark glass scrim rgba(3,6,5,0.9); hairline #1B2621.
- Phosphor #00FF88 = ready / progress / HUD accent. Amber #FFB800 = selected, armed, warning (hull 25–50%). Denied red #FF3B3B = refused input / overheated. Info blue #38BDF8. Storm violet #B06EE8 (storm ring only). Damage crimson #8B0000 with marker #FF6666 (hull under 25%). Silver #C0C0C0 for idle outlines and chart rings. Text: primary #E2E8F0, secondary #8B95A5, muted #7A8496 (muted only for labels 9 px and up).
- Your own ship is drawn in cyan #00E8FF linework; every enemy ship in red #FF2A2A linework.
- Upgrade tier colors, absolute: I phosphor #00FF88, II blue #38BDF8, III violet #B06EE8, IV red #FF3B3B, V gold #FFB800.
- Fonts: Geist for any sans text; Geist Mono for EVERY label, readout, number and key — uppercase, letter-spaced, tabular numerals. No text smaller than 9 px. Numbers are at least 14 px; the most important numbers (hull percent, level) 18–28 px.
- Every HUD rectangle is sharp-cornered (no rounding). Key hints are small mono "key chips": a 16 px tall outlined box with the key glyph (Q, E, R, C, V, Shift, LMB, RMB, TAB+1).
- Depth comes from glow (phosphor or amber bloom on active things), never from drop shadows. Glows breathe slowly (2 s or more); nothing flashes or strobes.
- Never carry a state by color alone: pair color with shape, fill geometry, a chip or a word.
- No sentences anywhere on the HUD. A label is one word or "LABEL value". No tutorial text.

LAYOUT — THE SHIP CONTROL STATION:
The CENTER of the screen is the ocean and the ships, kept completely clear of UI. Draw the player's own battleship (top-down, cyan linework, about 130 px long) just below center, one enemy battleship (red linework) upper-right trailing grey smoke, a faint radar lattice, a phosphor sweep wedge, a few radar return "blips" in red/blue/green, and the violet storm ring edge entering one corner.
The LEFT edge is the SHIP CONSOLE and the RIGHT edge is the WEAPONS CONSOLE: two instrument columns about 280 px wide, like the consoles either side of a captain's chair. The TOP row carries the match status (center) and the kill feed (right). Default to FLOATING instruments — 1 px outlines and bare readouts drawn over the ocean with the water visible behind them, no panel behind the column.

LEFT — SHIP CONSOLE, top to bottom:
1. HULL: the hull's health as a whole-number percent, large (e.g. "72" with a small "%" and the label HULL). Phosphor at 50% and above, amber below 50%, crimson below 25%. Make it read unmistakably as the ship's health; propose a gauge shape (a straight segmented bar, or the own-hull outline filling/tinting with damage) rather than a round globe.
2. INDICES: six always-visible stat rows, label left and value right, with five small pips showing how many upgrade cards of that stat are fitted: ARMOR 120 · POWER 95 · RELOAD 105 · ENGINES 95 · INTEL 100 · RANGE 95. 100 is average.
3. ENGINES: heading "HDG 271°" (15 px), speed "18 KTS", a nine-notch engine telegraph drawn as a short ladder with a hollow phosphor marker for the ordered speed and a solid amber needle for the actual speed, a short rudder track with an amber position tick, and W / S / A / D key chips at the ends.
4. LEVEL: "LV 4" large (18 px or more, phosphor), a progress track beneath it filling left to right toward the next level, and a 24 px outlined chip with the number of banked, unspent levels (hidden at zero).

RIGHT — WEAPONS CONSOLE, top to bottom:
1. MOUNTS: a small top-down outline of the player's own ship (bow up, cyan) with every weapon mount drawn at its real position: four main-gun turrets, a fore and an aft torpedo launcher, a stern mine rack. Each mount fills with phosphor as it reloads and sits fully lit when ready; a reloading mount shows a thin clock-style arc. Beside the drawing, one compact row per weapon with its glyph, its key chip and its always-visible stats: MAIN BATTERY (LMB) "DMG 27×2 · REACH 950 · RELOAD 9.5S", TORPEDO (Q) one small reload ring per tube, MINES (E) one pip per mine held, SPECIAL SHELL (R) empty dashed.
2. SECONDARIES: a heat bar (right mouse button, RMB chip) that fills as the guns heat and turns denied-red when overheated; stats "DMG 3 · REACH 475".
3. Three 54 px weapon squares Q / E / R with their glyphs and key chips under them, tier numeral bottom-right in the tier color; an empty square shows its weapon family's glyph dimmed. A "readied" square (Q pressed) has an amber outline and an amber-filled key chip.
4. Three ability squares: C (hull repair) and V (smoke screen), each showing a dark clockwise cooldown wipe with a seconds numeral when cooling, and Shift (speed boost).

TOP ROW:
- Center: one mono status line "12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES 0:47 · ☠ GROOVETRAIN" — numbers phosphor, words muted.
- Right: a three-line kill feed, 14 px mono uppercase, ship names in red (cyan for the player's own), "SUNK BY" in secondary grey.

THE UPGRADE OFFER (shown only when a level is banked — show it here with 2 banked levels):
A compact group of four small cards (about 150×64 px each) in a corner — propose the corner: bottom-right above the weapons console, bottom-left above the ship console, top-left, or a vertical stack on the right edge. Each card: a 28 px glyph box, the upgrade name in 11 px mono uppercase (e.g. ARMOR, LIGHT TORPEDO, SECOND TUBE, SMOKE SCREEN), a tier mark in the tier color it grants, and a key chip reading "TAB+1" … "TAB+4". A header reads "2 LEVELS". No window opens, nothing locks: the player clicks a card or presses Tab plus its digit while still steering and firing. Hovering a card makes it glow in its tier color AND previews its effect on the consoles: the affected readout shows the incoming value beside the current one in that tier color (e.g. ARMOR 120 → 140, with a fifth pip lit hollow).

GUARDRAIL: information noise must never bury the hunt. Every instrument must earn its place; prefer fewer, larger, clearer readouts. The water is the hero.
```

---

## STATE VARIANT A — offer pending, hover preview

```
Same screen. The player has 2 banked levels. Show the upgrade group with four cards: ARMOR (tier II color), LIGHT TORPEDO II→III, SECOND TUBE (gold, a one-off), SMOKE SCREEN I→II; header "2 LEVELS"; key chips TAB+1 to TAB+4. The cursor hovers card 1 (ARMOR): the card glows blue (its tier color) and on the ship console the ARMOR row reads "120 → 140" with the incoming value in blue and a fifth pip lit hollow. Everything else keeps running: two turrets are mid-reload on the mounts drawing, the sweep is turning. No overlay, no dimming, no lockout.
```

## STATE VARIANT B — hull under 25 %, reloads running

```
Same screen in a losing fight. Hull 19 %: the hull gauge is crimson (#8B0000 fill, #FF6666 marker) and breathes slowly (no faster than about one pulse per second). All four turrets are reloading at different points of their clocks; the torpedo tube is reloading; the secondaries heat bar is full and locked in denied red; C (hull repair) shows a cooldown wipe with "41" inside; V is ready. A torpedo wake is visible on the water heading toward the own ship. The level readout and indices are unchanged. Nothing on the consoles flashes; only the hull gauge breathes.
```

## STATE VARIANT C — countdown with REDRAW

```
Same screen at match start. The water is dimmed; "MATCH STARTING" and a large centered "7" in phosphor mono at the top center. Every mount is loaded and lit. LV 0, empty progress track. The upgrade group shows the starting offer of four cards in the same corner, and under the four cards a single "REDRAW" button in the primary register: amber 1 px outline with a soft amber glow, 30 px tall, mono 12 px uppercase, a small hollow 8 px pip beside the word (hollow = unused). No other text.
```

---

## OPTIONAL EXPLORATION 1 — solid console strips

```
Same screen, alternative treatment: make the two side consoles SOLID instrument strips the full height of the screen — a near-opaque dark glass bed rgba(3,6,5,0.9) with a hairline #1B2621 inner edge, the ocean visible only between them — so the layout reads like physical panels of a ship control station. Keep every instrument, token and size identical; only the bed changes. Give the top status row a matching bed.
```

## OPTIONAL EXPLORATION 2 — the offer's corner

```
Same screen, generate four variants that differ only in where the four-card upgrade group sits: (1) bottom-right, stacked just above the weapons console's last square; (2) bottom-left, just above the ship console's level readout; (3) top-left, under the top edge, left of the status line; (4) a vertical stack on the right edge between the kill feed and the weapons console. In each, show the "2 LEVELS" header and TAB+1…TAB+4 chips, and keep the screen center clear.
```

---

## Notes for the reconciliation step (not for Stitch)

- Stitch output is reconciled with `DESIGN.md` before anything is committed: tokens, the 9 px floor, sharp corners, dual-coding, the attention tiers and photosensitivity caps.
- Open rulings this prompt deliberately leaves open (Eric 2026-11-09): the offer's corner (R4), the per-mount reload form (R6), the hull gauge shape (R7), floating vs solid consoles (R12). Everything else in the master prompt is ruled (R1–R3, R5, R9, R10, R13).
- Strings that already exist in the game and may appear as-is: HULL, ARMOR, POWER, RELOAD, ENGINES, INTEL, RANGE, HDG, KTS, LV, REDRAW, LMB, RMB, MATCH STARTING, AFLOAT, KILLS, RING CLOSES, SUNK BY. New strings introduced by this sitting, for Eric's yes: `TAB+1`…`TAB+4` on the key chips and the `2 LEVELS` header.
