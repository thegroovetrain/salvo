# Doc-Sync Proposal — Epic 1 Shipped Reality (Step 1 of Retro Action #3)

**Date:** 2026-07-24 · **Status:** RULED & APPLIED 2026-07-24 — Eric: Q1 comment-is-typo, Q2 stamp-superseded, Q3 leave-for-7.5, R1–R7 approved as proposed; edits landed in this same PR, ledger entries closed (deferred-work.md 2026-07-24 resolutions section)
**Scope law:** minimal edits only — each row traces to a specific ruling; nothing settled nearby gets reworded. The full DESIGN.md refresh stays homed at Story 7.5 (correct-course Decision Point 1); this batch clears only ruled/shipped-and-reversed deltas so Epic 2 specs compile from truthful inputs.

Files: `DESIGN.md` / `EXPERIENCE.md` = `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/`; `gdd.md` = `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/`; `epics.md` = `_bmad-output/planning-artifacts/`; mock = `ux-.../mockups/home-class-picker-1.html`.

**How to rule:** each R-row needs yes/adjust; each Q-row needs an actual decision. Approved rows land in one docs-only PR that also closes the matching deferred-work ledger entries.

---

## Questions first (no edit exists until you rule)

### Q1 — card-scrim: which character is the typo?
`DESIGN.md:21`: `card-scrim: '#030605'      # rendered as rgba(3,7,5,.9) dark glass` — the hex is rgb(3,**6**,5), the comment says rgb(3,**7**,5). The rgba form repeats at `DESIGN.md:100` (`refit-card: background: 'rgba(3,7,5,.9)'`). Shipped code pins `0x030605` (hex was treated as authoritative in 1.11).
- **Option A (recommended):** comment + refit-card rgba are the typo → change both to `rgba(3,6,5,.9)`. Docs-only; code untouched.
- **Option B:** hex is the typo → `#030705` in DESIGN.md **and** a one-line client token change (`config.ts` 0x030605 → 0x030705) + tokens.test pin update. Tiny code PR rider.

### Q2 — how to handle the stale locked mock
`EXPERIENCE.md:36` declares the class-select layer "locked as rendered ([home-class-picker-1.html])" — but the mock is gunboat-era: 4 cards keyed 01–04, fantasy lines, GUN rows, `PIP VALUES: PLACEHOLDER`, **12 square 26px swatches including two retired hexes** (`#37F2A0`, `#40EEE0` — DESIGN.md:58/60 shifted these per validation), and a filled amber `PLAY` slab that DESIGN's own spine forbids (`DESIGN.md:111`: "outline + glow, never filled slab").
- **Option A (recommended):** stamp a superseded banner at the top of the mock ("SUPERSEDED 2026-07-24 — shipped 1.14 chrome is authoritative; see DESIGN.md Components") and reword E:36's lock clause to point at shipped reality. Cheap, honest, prevents another artifacts-contain-assumptions resurrection.
- **Option B:** redraw/re-render the mock to match shipped. Accurate but real work; and 7.5 will re-touch it anyway.
- **Option C:** delete only the "locked as rendered" clause. Weakest — the stale content stays quotable.

### Q3 — scope call: pull the broader gunboat sweep forward, or leave it for 7.5?
Beyond the home/class-select rows below, gunboat-era text survives elsewhere: `DESIGN.md:169` ("Four launch classes") + the Gunboat silhouette table row (`:176`) + blip-flare lever (`:179`), "fifth silhouette" drone wording (`DESIGN.md:177`, `EXPERIENCE.md:136/173` — with three classes it's the fourth; recast UX-DR9 at `epics.md:149` already says fourth), and Gunboat cameos in Journeys A/B (`EXPERIENCE.md:205/219/226`). All of this is 7.5's mandate per your approved correct-course.
- **Option A (recommended):** leave for 7.5 — minimal-edits law; Epic 2 stories don't read the silhouette/journey sections.
- **Option B:** pull forward into this batch (adds ~8 edit sites, all mechanical three-class rewrites).

---

## Ruled deltas (recommended edits; each cites its authority)

### R1 — Color assignment: match-start random draw → FCFS at join
**Authority:** Eric ruling 2026-07-23 (Story 1.12, ledger entry deferred-work.md:114).
| Site | Current | Proposed |
|---|---|---|
| `DESIGN.md:157` | "assigned match-consistently by the server **at match start** … contention resolves by **fair random draw**, losers fall to nearest free hue" | "assigned match-consistently by the server **first-come-first-served at join** … granted if free; if taken, **nearest free hue clockwise** (ties: seeded random among free); colors never change mid-match" |
| `EXPERIENCE.md:66` | "(granted unless contended; **fair random draw on contention**, nearest free hue for the rest)" | "(granted if free; if taken, nearest free hue clockwise — FCFS at join)" |
| `epics.md:146` (UX-DR6) | "granted unless contended; contention = fair random draw, losers fall to nearest free hue … a contended-fallback toast + nameplate reveal in the waiting room" | same FCFS rewrite; toast clause removed per R3 (nameplate reveal wording untouched) |

### R2 — Ordnance markers fly the firer's hue (the intel grant is undocumented)
**Authority:** Eric ruling 2026-07-23 (Story 1.12, ledger deferred-work.md:117). Shipped: mines/lit-zones/decoys render in the FIRER's hue for ALL observers via `MineView.by`/`DecoyView.by` wire attribution.
| Site | Current | Proposed |
|---|---|---|
| `DESIGN.md:160` (Propagation bullet) | "own hull, nameplate, small ownership accents (own blip ring), radar blips + kill-feed names" | append: "; ordnance truth-markers (mines, lit zones, decoy buoys) render in the **firer's** hue for **all** observers — a deliberate intel grant (wire carries firer attribution)" |
| `DESIGN.md:238` (Torpedo row tail) | "Mines render in the same register at truesight." | "Mines render in the owner's personal hue at truesight (Regatta propagation)." |
| `epics.md:147` (UX-DR7) | propagation list without ordnance | append ordnance clause as above |
*(Decoy counter-intel note: the `by` attribution changes only the truesight truth channel; the radar-blip decoy stays indistinguishable — recorded in the 1.12 spec, worth one clause in DESIGN if you want it explicit.)*

### R3 — Contested-hoist toast: REJECTED, docs still propose it
**Authority:** Eric ruling 2026-07-23 (Story 1.13; "most pointless toast imaginable"; ledger deferred-work.md:120 — "must NEVER be built absent a new ruling").
| Site | Current | Proposed |
|---|---|---|
| `EXPERIENCE.md:102` | "**Color grant feedback** — … a Toast reports the fallback ('HOIST CONTESTED — FLYING SKY' register). [PROPOSAL — surface choice]" | "**Color grant feedback** — REJECTED (Eric 2026-07-23): no contested-hoist toast. Color is FCFS at join; the granted hue simply flies on the nameplate. Do not build." |
| `EXPERIENCE.md:69` (Toast pattern) | "(level banked, boon fitted, hoist fallback)" | "(level banked, boon fitted)" |
| `epics.md:146` tail | "a contended-fallback toast + nameplate reveal in the waiting room" | "nameplate reveal in the waiting room" |

### R4 — 14-char cap: drop the [PROPOSAL] tags
**Authority:** Eric ruling 2026-07-23 (Story 1.13: tighten 16→14 NOW; ledger deferred-work.md:123).
`DESIGN.md:232` "(14 chars, entry-enforced [PROPOSAL, matches Kill Feed])" → "(14 chars, entry-enforced)"; `DESIGN.md:235` "cap at 14 chars at entry [PROPOSAL]" → "cap at 14 chars at entry". Nothing else changes.

### R5 — Class Card anatomy: no fantasy line, no GUN row, real pips, Q/E keys, 3 cards
**Authority:** Eric post-merge ruling 2026-07-24 (Story 1.14 ledger deferred-work.md:150: "I never wanted that"; no future run may resurrect from the mock) + absolute-anchor pips ruling 2026-07-24 + three-class re-scope 2026-07-19.
| Site | Current | Proposed |
|---|---|---|
| `DESIGN.md:240` (Class Card anatomy) | "class name (21px/700) + key, fantasy line (italic 12.5px), silhouette box …, 3 pip scales (… placeholder values), loadout slots, pick button" | "class name (21px/700) + key, silhouette box …, 3 pip scales (… real values on absolute anchors), two special-slot rows keyed Q/E, pick button" |
| `EXPERIENCE.md:66` | "cards carry silhouette, fantasy line, pip scales, loadout" | "cards carry silhouette, pip scales, two specials (Q/E)" |
| `EXPERIENCE.md:36` | "Keys: 1–4 / arrows highlight, Enter picks, ESC closes" | "Keys: 1–3 / arrows highlight, Enter picks, ESC closes" |
| `DESIGN.md:221` | "1–4 chips on cards" | "1–3 chips on cards" |

### R6 — Home: Gunboat default is dead; forced first-run choice shipped
**Authority:** re-scope 2026-07-19 (gunboat cut) + 1.14 ruling (NO default, TB pre-focused; ledger deferred-work.md:135).
| Site | Current | Proposed |
|---|---|---|
| `DESIGN.md:243` (Primary Button) | sub-line example "DEPLOY AS GUNBOAT · SOLO" | "DEPLOY AS TORPEDO BOAT · SOLO" |
| `EXPERIENCE.md:67` | same example | same fix |
| `EXPERIENCE.md:66` | "First-run default class: Gunboat (unobjected proposal — Open Question until confirmed)." | "First-run: forced choice — no default class; Torpedo Boat pre-focused (Eric 2026-07-19 / 2026-07-24)." |
| `EXPERIENCE.md:269` (Open Question 15) | "First-run default class = Gunboat — unobjected proposal; confirm before ship." | mark "RESOLVED 2026-07-19/24 — opposite way: no default, forced choice, TB pre-focused (shipped 1.14)." |

### R7 — GDD aim wording: clamp language vs the shipped deny-gate
**Authority:** Eric ruling 2026-07-23 (Story 1.10: keep deny-gate, never clamp aim). **Unledgered until now** — the 1.10 ratification bullets were appended (gdd.md:195, :425) but three older sentences still say clamp, so adjacent lines 194/195 contradict each other.
| Site | Current | Proposed |
|---|---|---|
| `gdd.md:183` | "aim is mouse-constrained to the selected weapon's arc" | "aim is never clamped — the arc gates firing, and out-of-arc clicks are denied with explicit feedback (deny-gate, Story 1.10)" |
| `gdd.md:194` | "Aim is constrained to the selected weapon's firing arc; click to fire." | "Aim is free; the arc gates firing, not the cursor — click to fire." (denial sentence already follows, unchanged) |
| `gdd.md:157` | "aim within the selected weapon's real firing arc; click to fire." | "aim freely — weapons fire only within their real arc; click to fire." |

---

## Explicitly excluded (not stale — forward Epic-2/6 spec, no edit)
- `EXPERIENCE.md:65` four-card refit offers + Space-held 1–4 spend — that's Story 2.7's contract (shipped code is the interregnum 3-offer CTRL flow, which dies in Epic 2).
- `EXPERIENCE.md:128` Q/E/R/F + Space-hold "supersedes the current 1/2/3 keys and CTRL" — Story 2.1's contract, correctly phrased as future.
- `EXPERIENCE.md:35` mode pick "Solo · Solo vs AI" — Epic 6; 1.14 shipped the hardcoded "· SOLO" sub-line by ruling.

## On approval
One docs-only PR applies the approved rows (each commit cites its ruling), closes ledger entries deferred-work.md:111/114/117/120/123/135(partial — mock per Q2)/150, files the new GDD-aim entry as closed-at-birth, and leaves everything else for 7.5. No VERSION bump.
